import { app } from "../../../../../../scripts/app.js";
import { refreshWirelessSignalConsumers } from "../../../fatha/core/masterSignalEngine.js";
import { showBastaMessage } from "../../../fatha/bastas/bastaMessage.js";

export function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

export const SEED_V3_MODES = ["Random", "Fixed", "Increment"];

export function getSeedV3ActiveSeed(node) {
    const seed = node?.properties?.seedHistory?.[0];
    const parsed = parseInt(seed);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function getSeedV3DigitCount(node) {
    return Math.max(1, Math.min(15, parseInt(node?.properties?.seedDigits) || 8));
}

export function getSeedV3HistoryLimit(node) {
    return Math.max(1, Math.min(20, parseInt(node?.properties?.seedHistoryLimit) || 5));
}

export function getSeedV3VisibleHistory(node) {
    const raw = node?.properties?.historyVisibleBeforeClip;
    if (raw === "Auto" || raw === undefined || raw === null) return "Auto";
    const parsed = parseInt(raw);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : "Auto";
}

function getSeedWidget(node) {
    return node?.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
}

function normalizeSeedValue(value, digits) {
    const parsed = parseInt(value);
    if (!Number.isFinite(parsed)) return null;
    const maxSeed = Number((10n ** BigInt(Math.max(1, Math.min(15, digits)))) - 1n);
    return Math.max(0, Math.min(maxSeed, parsed));
}

function makePlaceholder(node) {
    return "-".repeat(getSeedV3DigitCount(node));
}

export function ensureSeedV3History(node) {
    if (!node.properties) node.properties = {};
    const digits = getSeedV3DigitCount(node);
    const limit = getSeedV3HistoryLimit(node);
    const fallbackSeed = parseInt(String(node.properties.favoriteNum || 8).repeat(digits));
    if (!Array.isArray(node.properties.seedHistory) || node.properties.seedHistory.length === 0) {
        node.properties.seedHistory = [fallbackSeed];
    }
    node.properties.seedHistory = node.properties.seedHistory
        .slice(0, limit)
        .map((entry, index) => {
            const parsed = normalizeSeedValue(entry, digits);
            if (parsed !== null) return parsed;
            return index === 0 ? fallbackSeed : makePlaceholder(node);
        });
    while (node.properties.seedHistory.length < limit) node.properties.seedHistory.push(makePlaceholder(node));
    return node.properties.seedHistory;
}

export function syncSeedV3LocaleLabels(node) {
    if (!node?.properties) return;
    const title = tLocale("$derp_seed_v3.title", "Derp Seed V3");
    const previous = node._lastLocalizedDerpSeedV3Title;
    if (!node.titleLabel || node.titleLabel === "Derp Seed V3" || node.titleLabel === "Derp Seed" || (previous && node.titleLabel === previous)) {
        node.titleLabel = title;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Seed V3" || node.properties.titleLabel === "Derp Seed" || (previous && node.properties.titleLabel === previous)) {
        node.properties.titleLabel = title;
    }
    node._lastLocalizedDerpSeedV3Title = title;
}

function syncSeedV3ConfigValue(target, value, props = {}) {
    if (!target) return;
    target.text = value;
    target.value = value;
    Object.assign(target, props);
}

function syncSeedV3ButtonDom(node, key, text, props) {
    const el = node._derpDomElements?.[key];
    if (!el?._config) return;
    syncSeedV3ConfigValue(el._config, text, props);
    el._lastStateHash = null;
}

export function syncSeedV3LayoutValues(node) {
    const history = node?.properties?.seedHistory;
    if (!Array.isArray(history)) return;
    const activeSeed = String(getSeedV3ActiveSeed(node));
    syncSeedV3ConfigValue(node.layoutMap?.manualSeedRegion?.seedEditor, activeSeed);
    syncSeedV3ConfigValue(node.layout?.regions?.seedEditor, activeSeed);
    syncSeedV3ConfigValue(node._compDataCache?.seedEditor, activeSeed);

    const editorEl = node._derpDomElements?.seedEditor;
    if (editorEl) {
        syncSeedV3ConfigValue(editorEl._config, activeSeed);
        editorEl._lastStateHash = null;
        editorEl._lastSyncKey = null;
        editorEl._lastProps = null;
        editorEl._lastMetrics = null;
        editorEl._lastDerpValue = null;
        if (typeof document !== "undefined" && document.activeElement !== editorEl) editorEl.value = activeSeed;
    }
    if (node._editorLineCache?.seedEditor) delete node._editorLineCache.seedEditor;

    history.forEach((seed, index) => {
        const text = String(seed);
        const isPlaceholder = text.includes("-");
        const props = {
            state: index === 0 ? "ON" : "OFF",
            noHover: isPlaceholder,
            mouseOver: !isPlaceholder,
            onPress: () => { if (!isPlaceholder) handleSeedV3HistoryPress(node, seed); },
        };
        const key = `historySeed_${index}`;
        syncSeedV3ConfigValue(node.layoutMap?.historyRegion?.[key], text, props);
        syncSeedV3ConfigValue(node.layout?.regions?.[key], text, props);
        syncSeedV3ConfigValue(node._compDataCache?.[key], text, props);
        syncSeedV3ButtonDom(node, key, text, props);
    });
}

export function broadcastSeedV3Signal(node) {
    const valWidget = getSeedWidget(node);
    if (!valWidget || node.id === -1) return;
    node.properties.isWirelessTransmitter = true;
    node.properties.skipGenericWirelessHeartbeat = true;
    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    const signalId = `${node.id}:0`;
    const nodeName = node.titleLabel || node.title || tLocale("$derp_seed_v3.title", "Derp Seed V3");
    const val = isBypassed ? null : valWidget.value;
    const signalSignature = `${signalId}|${nodeName}|${isBypassed ? "null" : "INT"}|${val}`;
    const changed = node._seedV3LastSignalSignature !== signalSignature;
    node._seedV3LastSignalSignature = signalSignature;

    if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
    window.xcpDerpSignals[signalId] = {
        nodeId: signalId,
        nodeName: `${nodeName} [SEED]`,
        nodeType: node.type || "Node",
        type: isBypassed ? "null" : "INT",
        value: val,
        upstreamIds: [],
        timestamp: Date.now(),
    };

    if (!changed) return;

    if (node._signalSyncDebouncer) clearTimeout(node._signalSyncDebouncer);
    node._signalSyncDebouncer = setTimeout(() => {
        fetch("/xcp/update_signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ node_id: signalId, value: val }),
        });
    }, 150);

    if (window.app?.graph?._nodes) {
        window.app.graph._nodes.forEach(n => {
            if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
            if ((n.isFathaNode || n.isUncleNode) && n.updateMasterSwitchSignals) n.updateMasterSwitchSignals();
        });
        app.canvas.setDirty(true, true);
    }
}

export function setSeedV3ActiveSeed(node, seed, options = {}) {
    const digits = getSeedV3DigitCount(node);
    const next = normalizeSeedValue(seed, digits);
    if (next === null) return false;
    ensureSeedV3History(node);
    const history = node.properties.seedHistory.filter((entry, index) => index === 0 || parseInt(entry) !== next);
    history.unshift(next);
    node.properties.seedHistory = history.slice(0, getSeedV3HistoryLimit(node));
    while (node.properties.seedHistory.length < getSeedV3HistoryLimit(node)) node.properties.seedHistory.push(makePlaceholder(node));
    const valWidget = getSeedWidget(node);
    if (valWidget) valWidget.value = next;
    broadcastSeedV3Signal(node);
    if (options.refresh !== false) {
        syncSeedV3LayoutValues(node);
        node.updateDerpSeedV3UI?.(node._comfyIsBusy);
        node.requestDerpSync?.();
    }
    return true;
}

export function generateSeedV3Value(node) {
    const digits = getSeedV3DigitCount(node);
    const current = BigInt(getSeedV3ActiveSeed(node));
    const minSeed = 0n;
    const maxSeed = (10n ** BigInt(digits)) - 1n;
    if ((node.properties.seedMode || "Random") === "Increment") {
        const next = current + 1n;
        return Number(next > maxSeed || next < minSeed ? minSeed : next);
    }

    // Treat the setting as a maximum digit count, not an overwhelmingly likely exact width.
    const randomDigits = Math.max(1, Math.floor(Math.random() * digits) + 1);
    if (randomDigits === 1) return Math.floor(Math.random() * 10);

    const randomMin = 10n ** BigInt(randomDigits - 1);
    const randomMax = (10n ** BigInt(randomDigits)) - 1n;
    const range = Number(randomMax - randomMin + 1n);
    return Number(randomMin) + Math.floor(Math.random() * range);
}

export function handleSeedV3Input(node, val) {
    const digits = getSeedV3DigitCount(node);
    const next = normalizeSeedValue(val, digits);
    if (next === null) return;
    if (node._seedPreEditVal === undefined) node._seedPreEditVal = getSeedV3ActiveSeed(node);
    ensureSeedV3History(node);
    node.properties.seedHistory[0] = next;
    const valWidget = getSeedWidget(node);
    if (valWidget) valWidget.value = next;
    broadcastSeedV3Signal(node);
    syncSeedV3LayoutValues(node);
    node.requestDerpSync?.();
}

export function handleSeedV3Blur(node, val) {
    const next = normalizeSeedValue(val, getSeedV3DigitCount(node));
    if (next === null) return;
    const preVal = node._seedPreEditVal;
    node._seedPreEditVal = undefined;
    if (preVal !== undefined && String(preVal) === String(next)) return;
    setSeedV3ActiveSeed(node, next);
    handleSeedV3Execute(node, true);
}

export function handleSeedV3HistoryPress(node, seed) {
    if (setSeedV3ActiveSeed(node, seed)) handleSeedV3Execute(node, true);
}

export function handleSeedV3ModePress(node) {
    const currentIdx = SEED_V3_MODES.indexOf(node.properties.seedMode || "Random");
    node.properties.seedMode = SEED_V3_MODES[(currentIdx < 0 ? 0 : currentIdx + 1) % SEED_V3_MODES.length];
    const modeText = tLocale(`$derp_seed_v3.modes.${node.properties.seedMode.toLowerCase()}`, node.properties.seedMode);
    const modeButton = node.layoutMap?.topControlsRegion?.btnSeedMode;
    if (modeButton) modeButton.text = modeText;
    const modeRegion = node.layout?.regions?.btnSeedMode;
    if (modeRegion) modeRegion.text = modeText;
    const modeComp = node._compDataCache?.btnSeedMode;
    if (modeComp) modeComp.text = modeText;
    syncSeedV3ButtonDom(node, "btnSeedMode", modeText, {});
    node.requestDerpSync?.();
}

export async function handleSeedV3Execute(node, skipSeedUpdate = false) {
    const controls = node.layoutMap?.topControlsRegion;
    if (controls?.btnExecute?.state === "DIS" || node._comfyIsBusy) return;
    const mode = node.properties.seedMode || "Random";

    if (mode !== "Fixed" && !skipSeedUpdate) {
        setSeedV3ActiveSeed(node, generateSeedV3Value(node), { refresh: true });
    }

    if (app?.graphToPrompt) {
        try {
            app.graph?._nodes.forEach(n => {
                if (n?._isDerpModelLoaderNode !== true) return;
                const activeModel = (n.properties?.modelDeck || []).find(item => item?.active)?.name || null;
                if (activeModel && typeof window.xcpPublishDerpModelLoaderSignals === "function") {
                    window.xcpPublishDerpModelLoaderSignals(n, activeModel);
                }
            });
            app.graph?._nodes.forEach(n => { if (n.updateReceivedSignals) n.updateReceivedSignals(); });
            refreshWirelessSignalConsumers();

            const prompt = await app.graphToPrompt();
            const cleanOutput = JSON.parse(JSON.stringify(prompt.output));
            for (const id in cleanOutput) {
                const nData = cleanOutput[id];
                if (nData.inputs?.signal_data) {
                    try {
                        const sigPayload = JSON.parse(nData.inputs.signal_data);
                        if (sigPayload.signals) {
                            for (const sId in sigPayload.signals) delete sigPayload.signals[sId].timestamp;
                        }
                        nData.inputs.signal_data = JSON.stringify(sigPayload);
                    } catch (_) {}
                }
                if (nData.class_type !== "derpSeedV2" && nData.class_type !== "derpSeedV3" && nData.inputs) {
                    delete nData.inputs.seed;
                    delete nData.inputs.noise_seed;
                }
            }
            const sortedOutput = Object.keys(cleanOutput).sort().reduce((acc, key) => {
                acc[key] = cleanOutput[key];
                return acc;
            }, {});
            const vState = (app.graph?._nodes || []).flatMap(n => {
                const typeName = String(n.type || "").toLowerCase();
                if (typeName.includes("derplorastack")) return [{ kind: "derpLoraStack", id: n.id, stack: n.properties?.stackData, mode: n.properties?.attentionMode, nodeBypassed: n.mode === 2 || n.mode === 4 || n.properties?.isBypassed || (n.widgets && n.widgets[0]?.value === "bypass") }];
                if (n._isDerpModelLoaderNode === true || typeName.includes("derpmodelloader")) {
                    const deck = Array.isArray(n.properties?.modelDeck) ? n.properties.modelDeck : [];
                    return [{ kind: "derpModelLoader", id: n.id, activeModel: deck.find(item => item?.active)?.name || null, deck: deck.map(item => ({ name: item?.name || "", active: item?.active === true })), nodeBypassed: n.mode === 2 || n.mode === 4 || n.properties?.isBypassed || (n.widgets && n.widgets[0]?.value === "bypass") }];
                }
                if (typeName.includes("derptoggle") || typeName.includes("togglenode")) return [{ kind: "derpToggle", id: n.id, title: n.titleLabel || n.title || "Derp Toggle", signalName: n.properties?.signalName || "Bypass Toggle", toggleState: n.properties?.toggleState !== false, nodeBypassed: n.mode === 2 || n.mode === 4 || !!n._derpSpoofedBypass }];
                if (typeName.includes("derpconcatenate")) return [{ kind: "derpConcatenate", id: n.id, textValue: n.properties?.textValue || "", signalIds: n.properties?.multiSignalIds || {}, nodeBypassed: n.mode === 2 || n.mode === 4 || !!n._derpSpoofedBypass }];
                return [];
            });
            const promptString = JSON.stringify(sortedOutput) + JSON.stringify(vState);
            if (mode === "Fixed" && node._lastPromptString === promptString) {
                showBastaMessage(node, tLocale("$derp_seed_v3.messages.workflow_unchanged", "Workflow unchanged. Skipping redundant queue."), 3000, {}, "btnExecute", false);
                return;
            }
            node._lastPromptString = promptString;
        } catch (e) {
            console.warn("[DerpSeedV3] Prompt serialization failed, proceeding anyway.");
        }
    }

    if (app?.queuePrompt) {
        node._localExecutionTriggered = true;
        node._isExecuting = true;
        node.updateDerpSeedV3UI?.(true);
        app.queuePrompt(0).then(res => {
            if (res?.prompt_id) node._currentPromptId = res.prompt_id;
        }).catch(() => node.finalizeSeedV3UI?.());
    }
}

export function handleSeedV3Stop(node) {
    if (app.api && typeof app.api.interrupt === "function") app.api.interrupt();
}

export function handleSeedV3HistoryCountBlur(node, val) {
    const next = Math.max(1, Math.min(20, parseInt(val) || getSeedV3HistoryLimit(node)));
    if (getSeedV3HistoryLimit(node) === next) return;
    node.properties.seedHistoryLimit = next;
    ensureSeedV3History(node);
    node._layoutMapHash = null;
    node._seedV3SysLayoutHash = null;
    node.refreshNodeLayoutMap?.();
    node.refreshDerpSeedV3SysMap?.();
    node.requestDerpSync?.();
}

export function handleSeedV3DigitBlur(node, val) {
    const next = Math.max(3, Math.min(15, parseInt(val) || getSeedV3DigitCount(node)));
    if (node.properties.seedDigits === next) return;
    node.properties.seedDigits = next;
    const initialSeed = parseInt(String(node.properties.favoriteNum || 8).repeat(next));
    node.properties.seedHistory = [initialSeed, ...Array(getSeedV3HistoryLimit(node) - 1).fill(makePlaceholder(node))];
    const valWidget = getSeedWidget(node);
    if (valWidget) valWidget.value = initialSeed;
    broadcastSeedV3Signal(node);
    node._layoutMapHash = null;
    node._seedV3SysLayoutHash = null;
    node.syncDerpSeedV3WidthFloor?.();
    node.refreshNodeLayoutMap?.();
    node.refreshDerpSeedV3SysMap?.();
    node.requestDerpSync?.();
}

export function finalizeSeedV3UI(node) {
    node._isExecuting = false;
    node._currentPromptId = null;
    node._execStartTime = null;
    node._localExecutionTriggered = false;
    node.updateDerpSeedV3UI?.(false);
}
