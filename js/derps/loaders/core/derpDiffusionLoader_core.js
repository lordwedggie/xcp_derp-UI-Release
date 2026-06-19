import { showBastaMessage } from "../../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../../fatha/bastas/bastaSystemMessage.js";
import { playMicrowaveDing } from "../../../herbina/masterSoundEffects.js";
import { transmitDerpSignal } from "../../../fatha/core/masterSignalEngine.js";
import { app } from "../../../../../scripts/app.js";

let derpDiffusionLoaderPromptHookInstalled = false;

function pushDiffusionSignalToRegistry(node, signalId, nodeName, portLabel, signalType, payload) {
    if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
    window.xcpDerpSignals[signalId] = {
        nodeId: signalId,
        nodeName: `${nodeName} [${portLabel}]`,
        nodeType: node.type,
        type: signalType,
        value: payload,
        upstreamIds: [],
        timestamp: Date.now(),
        isPureVirtual: !!(node.isPureVirtual || node.properties?.isPureVirtual)
    };
}

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

function installDerpDiffusionLoaderPromptHook() {
    if (derpDiffusionLoaderPromptHookInstalled || !app?.graphToPrompt) return;
    derpDiffusionLoaderPromptHookInstalled = true;

    const originalGraphToPrompt = app.graphToPrompt;
    app.graphToPrompt = function() {
        if (app?.graph?._nodes) {
            app.graph._nodes.forEach((node) => {
                if (!node || node._isDerpDiffusionLoaderNode !== true) return;
                node._hasClearedVRAMSinceQueuePrompt = false;
            });
        }
        return originalGraphToPrompt.apply(this, arguments);
    };
}

async function unloadPreviousModelFromVRAM(node, previousModel, nextModel) {
    const res = await fetch("/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            unload_models: true,
        })
    });

    if (!res.ok) {
        let errorText = `HTTP ${res.status}`;
        try {
            const payload = await res.json();
            errorText = payload?.error || errorText;
        } catch (_) {}
        throw new Error(errorText);
    }
}

function syncDerpDiffusionLoaderLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_diffusion_loader.title", "Derp Diffusion Loader");
    const previousLocalizedTitle = node._lastLocalizedDerpDiffusionLoaderTitle;

    if (!node.titleLabel || node.titleLabel === "Virtual Node" || node.titleLabel === "Derp Diffusion Loader" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Virtual Node" || node.properties.titleLabel === "Derp Diffusion Loader" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }

    node._lastLocalizedDerpDiffusionLoaderTitle = localizedTitle;
}

export function initDerpDiffusionLoaderCore(nodeType) {
    const proto = nodeType.prototype;
    installDerpDiffusionLoaderPromptHook();

    function normalizeDeck(deck) {
        if (!Array.isArray(deck) || deck.length === 0) return [];
        let activeFound = false;
        return deck.map((entry) => {
            const next = { ...entry, active: !!entry.active };
            if (next.active) {
                if (!activeFound) activeFound = true;
                else next.active = false;
            }
            return next;
        }).map((entry, idx) => {
            if (!activeFound && idx === 0) return { ...entry, active: true };
            return entry;
        });
    }

    function resolvePathMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;
        const fileName = String(savedName).split(/[\\/]/).pop();
        return list.find(path => path.endsWith(fileName) || path.split(/[\\/]/).pop() === fileName) || null;
    }

    function ensureIdentity(node) {
        node._sysProfileFile = "derpDiffusionLoader";
        node._sysProfileFolder = "nodeSettings";
        syncDerpDiffusionLoaderLocaleLabels(node);
    }

    function syncDiffusionUnloadBaseline(node, force = false) {
        const activeDiffusionName = (node?.properties?.diffusionDeck || []).find(m => m.active)?.name || null;
        if (!activeDiffusionName) return;
        if (force || typeof node._lastBroadcastModelName !== "string" || !node._lastBroadcastModelName) {
            node._lastBroadcastModelName = activeDiffusionName;
        }
    }

    function queueRelinkMessages(node, items, prefixKey, fallback) {
        items.forEach((item) => {
            showBastaSystemMessage(node, tLocale(prefixKey, fallback), 3000, { fade: true, grow: true }, null, "success", false, item);
        });
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        syncDerpDiffusionLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        if (this.syncDerpOutputs) this.syncDerpOutputs();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        syncDerpDiffusionLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        if (this.syncDerpOutputs) this.syncDerpOutputs();
    };

    proto.fetchDiffusionData = async function(showNotification = false, options = {}) {
        if (this.id === -1) return;
        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();

        const [diffusionRes, unetRes] = await Promise.all([
            fetch(`/xcp/list/diffusion_models?v=${session}`).then(r => r.json()),
            fetch(`/xcp/list/unet?v=${session}`).then(r => r.json())
        ]);

        const diffusionItems = [...(diffusionRes.items || []), ...(unetRes.items || [])];
        this._diffusionList = [...new Set(diffusionItems)];

        const missingDiffusions = [];
        const healedDiffusions = [];

        this.properties.diffusionDeck = (this.properties.diffusionDeck || []).map((m) => {
            if (this._diffusionList.includes(m.name)) return m;
            const match = resolvePathMatch(this._diffusionList, m.name);
            if (match) {
                healedDiffusions.push(`${m.name.split(/[\\/]/).pop()} (Path Updated)`);
                return { ...m, name: match };
            }
            missingDiffusions.push(m.name.split(/[\\/]/).pop());
            return null;
        }).filter(Boolean);

        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck);

        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        syncDiffusionUnloadBaseline(this);
        if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

        if (showNotification || missingDiffusions.length) {
            if (typeof playMicrowaveDing === "function") playMicrowaveDing();
            if (missingDiffusions.length && typeof showBastaMessage === "function") {
                const parts = [];
                if (missingDiffusions.length) parts.push(`${tLocale("$derp_diffusion_loader.messages.missing_diffusions_prefix", "Missing Diffusions Purged: ")}${missingDiffusions.join(", ")}`);
                showBastaMessage(this, parts.join(" | "), 6000, { fade: true, grow: true }, "btnRefreshDiffusions", false, "error");
            }
        }

        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.syncDerpOutputs = function() {
        const ports = [
            { name: tLocale("$derp_diffusion_loader.ports.model", "Model"), type: "MODEL" }
        ];

        if (!this.outputs || this.outputs.length !== ports.length) {
            this.outputs = ports;
        }
        this.outputs.forEach(o => { if (o.links) o.links = null; });
        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1) return;
        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        const activeDiffusion = (this.properties.diffusionDeck || []).find(m => m.active);

        const diffusionName = isBypassed ? null : activeDiffusion?.name;
        const weightDtype = this.properties.weightDtype || "default";
        const modelPayload = diffusionName ? {
            diffusion_name: diffusionName,
            weight_dtype: weightDtype,
            model_name_prefix: diffusionName,
            model_name: diffusionName,
            model_id: `${this.id}:0`,
            signal_role: "model"
        } : null;
        const aggregatePayload = modelPayload ? {
            ...modelPayload,
            diffusion_name: diffusionName,
            weight_dtype: this.properties.weightDtype || "default"
        } : null;

        const nodeName = this.titleLabel || this.title || tLocale("$derp_diffusion_loader.title", "Derp Diffusion Loader");
        const modelPortLabel = tLocale("$derp_diffusion_loader.ports.model", "Model");
        const fingerprint = JSON.stringify([isBypassed, diffusionName, weightDtype, this.id, nodeName, modelPortLabel, (this.properties.diffusionDeck || []).length]);
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        const previousModel = this._lastBroadcastModelName || null;
        const shouldDumpModelOnChange = this.properties.toggleDumpModelOnChange !== false;
        const isDifferentModelSelection = !!previousModel && previousModel !== diffusionName;
        const unloadAlreadyPendingForTarget = this._pendingModelSwitchTarget === diffusionName;
        const unloadAlreadyPerformedForQueuedPrompt = this._hasClearedVRAMSinceQueuePrompt === true;

        const runTransmit = () => {
            this._lastBroadcastModelName = diffusionName;
            if (this._pendingModelSwitchTarget === diffusionName) {
                this._pendingModelSwitchTarget = null;
            }

            if (diffusionName && this.widgets) {
                const diffusionWidget = this.widgets.find(w => w.name === "diffusion_name" || w.name === "model_name" || w.name === "unet_name");
                if (diffusionWidget) diffusionWidget.value = diffusionName;
                const dtypeWidget = this.widgets.find(w => w.name === "weight_dtype" || w.name === "dtype");
                if (dtypeWidget) dtypeWidget.value = weightDtype;
            }

            const baseId = String(this.id);
            pushDiffusionSignalToRegistry(this, `${baseId}:0`, nodeName, modelPortLabel, modelPayload ? "model" : "null", modelPayload);

            const savedOutputs = this.outputs;
            if (this._xcpTrueOutputs && this._xcpTrueOutputs.length > 0) {
                this.outputs = this._xcpTrueOutputs;
            }
            if (aggregatePayload) transmitDerpSignal(this, aggregatePayload);
            this.outputs = savedOutputs;
        };

        if (shouldDumpModelOnChange && isDifferentModelSelection && diffusionName) {
            if (unloadAlreadyPendingForTarget || unloadAlreadyPerformedForQueuedPrompt) {
                runTransmit();
                return;
            }

            const unloadToken = `${Date.now()}:${diffusionName}`;
            this._pendingModelUnloadToken = unloadToken;
            this._pendingModelSwitchTarget = diffusionName;
            this._lastSignalFingerprint = null;

            unloadPreviousModelFromVRAM(this, previousModel, diffusionName)
                .then(() => {
                    this._lastUnloadedModelName = previousModel;
                    this._hasClearedVRAMSinceQueuePrompt = true;
                    if (typeof showBastaSystemMessage === "function") {
                        showBastaSystemMessage(this, tLocale("$derp_diffusion_loader.messages.vram_cleared_prefix", "VRAM Cleared: "), 2600, { fade: true, grow: true, silent: true }, null, "success", false, previousModel.split(/[\\/]/).pop() || previousModel);
                    }
                })
                .catch((error) => {
                    console.error("[xcpDerp] Failed to unload previous model from VRAM:", error);
                })
                .finally(() => {
                    if (this._pendingModelUnloadToken !== unloadToken) return;
                    this._pendingModelUnloadToken = null;
                    runTransmit();
                });
            return;
        }

        runTransmit();
    };

    proto.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        this._sysProfileActive = true;
        this._sysProfileFile = "derpDiffusionLoader";
        this._sysProfileFolder = "nodeSettings";
        if (panel.showProfiles) panel.showProfiles("derpDiffusionLoader", "nodeSettings");
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        if (panel) panel._layoutDirty = true;
        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.onDerpSysPanelClose = function() {
        this._sysProfileActive = false;
    };

    proto.applyDerpProfile = function(profileName) {
        if (!this._sysProfileData || !this._sysProfileData[profileName] || profileName === "(No Profiles Found)") return;
        const profileObj = this._sysProfileData[profileName] || {};
        const diffusions = Array.isArray(profileObj?.diffusions) ? profileObj.diffusions : [];
        this.properties.diffusionDeck = normalizeDeck(diffusions.map((name, idx) => ({ name, active: idx === 0 })));
        this.properties.weightDtype = profileObj?.weight_dtype || this.properties.weightDtype || "default";
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        return {
            diffusions: (this.properties.diffusionDeck || []).map(item => String(item?.name || "")).filter(Boolean),
            weight_dtype: this.properties.weightDtype || "default"
        };
    };

    proto.handleDiffusionLoaderCreated = function() {
        ensureIdentity(this);
        this._isDerpDiffusionLoaderNode = true;
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = true;
        this.properties.settingActive = true;
        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck || []);
        if (typeof this.properties.showFolderNames !== "boolean") this.properties.showFolderNames = true;
        if (typeof this.properties.toggleDumpModelOnChange !== "boolean") this.properties.toggleDumpModelOnChange = true;
        if (typeof this.properties.weightDtype !== "string") this.properties.weightDtype = "default";
        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [320, 180];
        this.size = [320, 180];
        syncDiffusionUnloadBaseline(this, true);
        if (!this._restoreDiffusionDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        setTimeout(() => {
            if (this._restoreDiffusionDeckPending) return;
            this.fetchDiffusionData();
            if (!this._restoreDiffusionDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) this.syncDerpOutputs();
        }, 32);
    };

    proto.handleDiffusionLoaderConfigure = function() {
        ensureIdentity(this);
        this._isDerpDiffusionLoaderNode = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = true;
        if (typeof this.properties.settingActive !== "boolean") this.properties.settingActive = true;
        this._restoreDiffusionDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.diffusionDeck || []));
        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck || []);
        if (typeof this.properties.weightDtype !== "string") this.properties.weightDtype = "default";
        this.fetchDiffusionData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._diffusionList || [];
                const restored = savedDeck.map(saved => {
                    const match = resolvePathMatch(currentList, saved.name);
                    if (match) return { ...saved, name: match, active: !!saved.active };
                    return null;
                }).filter(Boolean);
                if (restored.length > 0) {
                    this.properties.diffusionDeck = normalizeDeck(restored);
                }
            }
            syncDiffusionUnloadBaseline(this, true);
            this._restoreDiffusionDeckPending = false;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 50);
    };

    proto.handleLoaderDraw = function() {
        if (this.flags?.collapsed) return;

        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        if (this._lastBypassState !== isBypassed) {
            this._lastBypassState = isBypassed;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            this.refreshNodeLayoutMap();
            this.requestDerpSync();
        }

        const currentW = Math.round(this.size[0]);
        if (this._lastDerpW !== currentW) {
            this._lastDerpW = currentW;
            this.refreshNodeLayoutMap();
        }
    };

    proto.handleLoaderResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
