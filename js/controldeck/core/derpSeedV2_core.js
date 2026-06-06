/**
 * PROJECT: derpNodes | CORE LOGIC: derpSeedV2_core
 * STATUS: FULLY INTEGRATED (V3/V4 DYNAMIC PATTERN)
 */
import { app } from "../../../../../scripts/app.js";
import { playMicrowaveDing, playKeyStroke } from "../../herbina/masterSoundEffects.js";
import { animateAlpha } from "../../herbina/masterAnimator.js";
// THE BASTA TEST: Import the message handler for visual redundancy warnings
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { refreshWirelessSignalConsumers } from "../../fatha/core/masterSignalEngine.js";

export const SEED_FADE_SPEED = 0.6;
export const SEED_FADE_DELAY_FRAMES = 5;
export const SEED_VOLUME_DECAY = 0.10; // 20% volume reduction per subsequent line

const refreshSeedState = (node) => {
    // THE UNCLE FIX: Delegate slot suppression to the prototype helper
    node.suppressDefaultWidgets();

    if (node.widgets) {
        node.widgets.forEach((w) => {
            w.hidden = true;
            w.last_y = -5000;
            if (w.element) {
                w.element.style.display = "none";
                w.element.style.pointerEvents = "none";
            }
        });
    }

    if (node.widgets) {
        const ctrl = node.widgets.find(w => w.name === "control_after_generate");
        if (ctrl) ctrl.value = "fixed";
    }
};

export const broadcastSeedSignal = (node) => {
    const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
    if (!valWidget || node.id === -1) return;
    node.properties.isWirelessTransmitter = true;
    node.properties.skipGenericWirelessHeartbeat = true;
    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    const baseId = String(node.id);
    const nodeName = node.titleLabel || node.title || "Derp Seed";
    const signalId = `${baseId}:0`;
    const val = isBypassed ? null : valWidget.value;

    window.xcpDerpSignals[signalId] = {
        nodeId: signalId,
        nodeName: `${nodeName} [SEED]`,
        nodeType: node.type || "Node",
        type: isBypassed ? "null" : "INT",
        value: val,
        upstreamIds: [], // THE REGISTRY FIX: Required for receiver filtering logic
        timestamp: Date.now()
    };

    // THE SERVER SYNC: Inform the backend of the updated signal state
    if (node._signalSyncDebouncer) clearTimeout(node._signalSyncDebouncer);
    node._signalSyncDebouncer = setTimeout(() => {
        fetch("/xcp/update_signal", {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: signalId, value: val })
        });
    }, 150);
    if (window.app?.graph?._nodes) {
        window.app.graph._nodes.forEach(n => {
            if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
            if (n.isUncleNode && n.updateMasterSwitchSignals) n.updateMasterSwitchSignals();
        });
        app.canvas.setDirty(true, true);
    }
};

// THE REAL-TIME FIX: Broadcaster for as-you-type updates
export function handleSeedInput(node, val) {
    const num = parseInt(val);
    if (!isNaN(num)) {
        // THE REDUNDANCY FIX: Capture the original value before editing begins to allow handleSeedBlur to detect changes
        if (node._seedPreEditVal === undefined) node._seedPreEditVal = node.properties.seedHistory[0];

        node.properties.seedHistory[0] = num;
        if (node._seedAnimStates && node._seedAnimStates[0]) {
            node._seedAnimStates[0].text = num.toString();
            node._seedAnimStates[0].targetText = num.toString();
        }
        const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
        if (valWidget) valWidget.value = num;
        broadcastSeedSignal(node);
        // THE REFLOW FIX: Ensure the node layout updates during real-time typing to keep anchor positions synced
        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    }
}

// HELPER: Syncs the property seedHistory to the visual layoutMap
export const syncHistoryToLayout = (node, affectedIndex = -1, forceSnap = false) => {
    const dynamic = node.layoutMap?.mainRow?.dynamicRegion;
    if (!dynamic) return;

    dynamic.width = "full";

    const history = node.properties.seedHistory || [];
    const useAnim = node.properties.useAnimations !== false;

    if (!node._seedAnimStates) {
        node._seedAnimStates = node.properties.seedHistory.map(seed => ({
            text: seed.toString(), targetText: seed.toString(), alpha: 1, state: 0, timer: 0
        }));
    }

    node.properties.seedHistory.forEach((seed, i) => {
        if (!node._seedAnimStates[i]) {
            node._seedAnimStates[i] = { text: seed.toString(), targetText: seed.toString(), alpha: 1, state: 0, timer: 0 };
        }
        const animState = node._seedAnimStates[i];
        const newVal = seed.toString();

        // Zero-Inference: If anim disabled, forced snap, or index is outside affected range, snap immediately
        if (!useAnim || forceSnap || (affectedIndex !== -1 && i > affectedIndex)) {
            animState.text = newVal;
            animState.targetText = newVal;
            animState.alpha = 1;
            animState.state = 0;

            const row = dynamic[`rowSeed_${i}`];
            if (row && row[`labelSeed_${i}`]) {
                row[`labelSeed_${i}`].text = newVal;
                row[`labelSeed_${i}`].alpha = 1;
                if (i === 0) row[`labelSeed_${0}`].value = newVal;
            }
            return;
        }

        if (animState.text !== newVal && animState.targetText !== newVal) {
            animState.targetText = newVal;
            animState.state = 1; // Delayed fade out
            animState.timer = i * SEED_FADE_DELAY_FRAMES;
        }
    });
    node.requestDerpSync();
};

/**
 * Attaches the core lifecycle and render logic to the prototype
 */
export function attachDerpSeedLogic(nodeType) {
    nodeType.prototype.finalizeUI = function() {
        const wasExecuting = this._isExecuting;
        this._isExecuting = false;
        this._currentPromptId = null;
        this._execStartTime = null;

        const mode = this.properties.seedMode || "Random";

        // THE TRIGGER GUARD: Only update seed here if it's a native global queue.
        // Local node execution now handles seed generation at the start via handleExecutePress.
        const allNodes = app.graph?._nodes || [];
        const anyLocalTrigger = allNodes.some(n => n?._localExecutionTriggered === true);
        const shouldUpdate = wasExecuting && mode !== "Fixed" && !this._localExecutionTriggered && !anyLocalTrigger;

        if (shouldUpdate) {
            const valWidget = this.widgets.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");

            // THE PRECISION FIX: Base increment on the serialized history entry to ensure continuity
            const historyBase = this.properties.seedHistory?.[0];
            const currentSeed = (historyBase && !String(historyBase).includes("-")) ? BigInt(historyBase) : BigInt(valWidget.value || 0);
            const digitCount = Math.max(1, Math.min(15, this.properties.seedDigits || 15));
            const minSeed = 0n; // THE MAX-DIGIT FIX: Allow values from 0 up to the maximum decimal limit
            const maxSeed = BigInt(10 ** digitCount - 1);

            let newSeed;
            if (mode === "Increment") {
                const calculated = currentSeed + 1n;
                newSeed = (calculated > maxSeed || calculated < minSeed) ? Number(minSeed) : Number(calculated);
            } else {
                // THE MIXING FIX: Convert BigInt range to Number for compatibility with Math.random()
                const range = Number(maxSeed - minSeed + 1n);
                newSeed = Number(minSeed) + Math.floor(Math.random() * range);
            }

            // THE CACHE FIX: Only apply changes if the seed actually changed
            if (valWidget && valWidget.value !== newSeed) {
                valWidget.value = newSeed;
                this.properties.seedHistory.unshift(newSeed);
                const limit = this.properties.seedHistoryLimit || 5;
                this.properties.seedHistory = this.properties.seedHistory.slice(0, limit);

                broadcastSeedSignal(this);
                syncHistoryToLayout(this, -1);
                this.refreshNodeLayoutMap();
                this._lastPromptString = "";
            }
        }

        this.updateDerpSeedUI(false);
    };

    nodeType.prototype.updateDerpSeedUI = function(isBusy) {
        const wasBusy = this._comfyIsBusy;
        this._comfyIsBusy = !!isBusy;

        if (wasBusy && !this._comfyIsBusy && this._localExecutionTriggered) {
            if (typeof playMicrowaveDing === "function") playMicrowaveDing();

            setTimeout(() => { this._localExecutionTriggered = false; }, 100);
        }

        const mainRow = this.layoutMap?.mainRow;
        if (!mainRow?.secondaryRegion) return;

        mainRow.secondaryRegion.btnExecute.state = this._comfyIsBusy ? "DIS" : "OFF";
        mainRow.secondaryRegion.btnStop.state = this._comfyIsBusy ? "OFF" : "DIS";
        mainRow.secondaryRegion.btnSeedControl.state = this._comfyIsBusy ? "DIS" : "OFF";

        if (mainRow.dynamicRegion) {
            this.properties.seedHistory.forEach((_, i) => {
                const row = mainRow.dynamicRegion[`rowSeed_${i}`];
                if (row?.[`labelSeed_${i}`]) {
                    row[`labelSeed_${i}`].state = this._comfyIsBusy ? (i === 0 ? "ON" : "DIS") : "OFF";
                }
            });
        }
        this.requestDerpSync();
    };

    nodeType.prototype.onSerialize = function(info) {
        // THE SERIALIZATION FIX: Explicitly capture seed history and configuration
        info.properties.seedHistory = this.properties.seedHistory;
        info.properties.seedMode = this.properties.seedMode;
        info.properties.seedHistoryLimit = this.properties.seedHistoryLimit;
        info.properties.seedDigits = this.properties.seedDigits;
        info.properties.favoriteNum = this.properties.favoriteNum;
    };

    const onConf = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
        if (onConf) onConf.apply(this, arguments);

        refreshSeedState(this);
        syncHistoryToLayout(this, -1, true);

        // UNIQUE NODE SYNC: Framework handles theme and main layout refresh
        this.updateDerpSeedUI(false);
        this.refreshDerpSeedSysMap();

        this._derpAwakeFrames = 10;
    };

    const onDrawForeground = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function(ctx) {
        if (onDrawForeground) onDrawForeground.apply(this, arguments);

        if (this.flags?.collapsed) return;

        const useAnim = this.properties.useAnimations !== false;

        if (this._seedAnimStates && this.layoutMap?.mainRow?.dynamicRegion) {
            let isAnimating = false;
            this._seedAnimStates.forEach((animState, i) => {
                if (!useAnim) {
                    animState.alpha = 1;
                    animState.state = 0;
                    return;
                }

                if (animState.state === 1) {
                    animState.timer--;
                    if (animState.timer <= 0) {
                        animState.state = 2;
                        if (typeof playKeyStroke === "function") {
                            // THE FIX: Calculate decayed volume based on row index
                            const vol = Math.max(0, 1.0 - (i * SEED_VOLUME_DECAY));
                            playKeyStroke(vol);
                        }
                    }
                    isAnimating = true;
                } else if (animState.state === 2) {
                    const res = animateAlpha(animState.alpha, 0, SEED_FADE_SPEED, true);
                    animState.alpha = res.value;
                    if (!res.isAnimating || animState.alpha <= 0.01) {
                        animState.alpha = 0;
                        animState.text = animState.targetText;
                        animState.state = 3;

                        const row = this.layoutMap.mainRow.dynamicRegion[`rowSeed_${i}`];
                        if (row && row[`labelSeed_${i}`]) {
                            row[`labelSeed_${i}`].text = animState.text;
                            if (i === 0) row[`labelSeed_${0}`].value = animState.text;
                        }
                    }
                    isAnimating = true;
                } else if (animState.state === 3) {
                    const res = animateAlpha(animState.alpha, 1, SEED_FADE_SPEED, true);
                    animState.alpha = res.value;
                    if (!res.isAnimating || animState.alpha >= 0.99) {
                        animState.alpha = 1;
                        animState.state = 0;
                    }
                    isAnimating = true;
                }

                const row = this.layoutMap.mainRow.dynamicRegion[`rowSeed_${i}`];
                if (row && row[`labelSeed_${i}`]) {
                    row[`labelSeed_${i}`].alpha = animState.alpha;
                }
            });

            if (isAnimating) {
                this._layoutDirty = true;
                this.requestDerpSync();
            }
        }

        // Uncle framework handles node height internally via layoutMap logic
    };

    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
        this.properties = this.properties || {};
        this.properties.outputName = "SEED"; // THE NAMING FIX: Set default output name for wireless signaling
        this.properties.seedHistoryLimit = 5;
        this.properties.seedDigits = 8;
        this.properties.favoriteNum = 8;
        this.properties.showOutputs = false;

        // THE PRECISION FIX: Use the favorite number as the repeating default seed
        const initialSeed = parseInt(String(this.properties.favoriteNum).repeat(this.properties.seedDigits));
        this.properties.seedHistory = [initialSeed, ...Array(4).fill("-".repeat(8))];
        this.properties.seedMode = "Random";

        setTimeout(() => {
            const valWidget = this.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
            if (valWidget) {
                valWidget.value = initialSeed;
                // THE BOOTSTRAP FIX: Force initial signal broadcast so receivers detect the seed immediately
                broadcastSeedSignal(this);
            }
        }, 20);

        if (onCreated) onCreated.apply(this, arguments);
        refreshSeedState(this);

        this.titleLabel = "Derp Seed";
        // THE SERIALIZATION FIX: Initialize default titleLabel property
        this.properties.titleLabel = "Derp Seed";
        this._isExecuting = false;
        this._comfyIsBusy = false;

        app.api.addEventListener("executing", (e) => {
            const runningNode = e.detail?.node || (typeof e.detail === 'string' ? e.detail : null);
            this.updateDerpSeedUI(runningNode !== null && runningNode !== undefined);

            if (runningNode === String(this.id)) {
                this._isExecuting = true;
                if (!this._currentPromptId) this._currentPromptId = e.detail?.prompt_id;
            }
        });

        app.api.addEventListener("execution_success", (e) => {
            if (this._isExecuting && (String(e.detail?.prompt_id) === String(this._currentPromptId) || !this._currentPromptId)) {
                this.finalizeUI();
            } else if (!e.detail?.node) {
                this.updateDerpSeedUI(false);
            }
        });

        app.api.addEventListener("execution_error", (e) => {
            if (this._isExecuting && String(e.detail?.prompt_id) === String(this._currentPromptId)) {
                this.finalizeUI();
            }
        });

        app.api.addEventListener("execution_interrupted", () => this.finalizeUI());

        syncHistoryToLayout(this, -1, true);
        this.refreshNodeLayoutMap();
        this.updateDerpSeedUI(false);
        this.refreshDerpSeedSysMap();
    };

    nodeType.prototype.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        if (this.sysLayoutMap) {
            panel.setLayoutMap(this.sysLayoutMap);
        }
    };

    nodeType.prototype.onAdded = function() {
        refreshSeedState(this);
    };
}

// ============================================
// WIDGET INTERACTION EVENT HANDLERS
// ============================================

export function handleSeedBlur(node, val) {
    const num = parseInt(val);
    if (!isNaN(num)) {
        // THE REDUNDANCY FIX: Skip execution if the editor was blurred without a real value change
        const preVal = node._seedPreEditVal;
        node._seedPreEditVal = undefined;
        if (preVal === undefined || String(preVal) === String(num)) return;

        node.properties.seedHistory[0] = num;
        const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
        if (valWidget) valWidget.value = num;

        broadcastSeedSignal(node); // THE FIX: Sync with Hub on manual edit
        node.refreshNodeLayoutMap();
        node.updateDerpSeedUI(node._comfyIsBusy);
        node.requestDerpSync();

        // THE AUTO-EXECUTE FIX: Immediately trigger prompt on manual seed entry
        handleExecutePress(node, true);
    }
}

export function handleSeedButtonPress(node, seed, i) {
    const num = parseInt(seed);
    if (!isNaN(num)) {
        const history = node.properties.seedHistory;
        history.splice(i, 1);
        history.unshift(num);

        const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
        if (valWidget) valWidget.value = num;

        broadcastSeedSignal(node); // THE FIX: Sync with Hub on history selection
        syncHistoryToLayout(node, i);

        node.refreshNodeLayoutMap();
        node.updateDerpSeedUI(node._comfyIsBusy);
        node.requestDerpSync();

        // THE AUTO-EXECUTE FIX: Immediately trigger prompt on history selection
        handleExecutePress(node, true);
    }
}

export function handleModeControlPress(node) {
    const modes = ["Random", "Fixed", "Increment"];
    let currentIdx = modes.indexOf(node.properties.seedMode || "Random");
    if (currentIdx === -1) currentIdx = 0;
    const nextMode = modes[(currentIdx + 1) % modes.length];
    node.properties.seedMode = nextMode;
    const regions = node.layoutMap?.mainRow?.secondaryRegion;
    if (regions?.btnSeedControl) regions.btnSeedControl.text = nextMode;
    node.requestDerpSync();
}

export async function handleExecutePress(node, skipSeedUpdate = false) {
    const state = node.layoutMap?.mainRow?.secondaryRegion?.btnExecute?.state;
    if (state === "DIS" || node._comfyIsBusy) return;

    const mode = node.properties.seedMode || "Random";

    // THE IMMEDIATE SEED FIX: Generate fresh seed BEFORE queuing if not in Fixed mode
    // skipSeedUpdate is used when the user manually provides a seed via history/input
    if (mode !== "Fixed" && !skipSeedUpdate) {
        const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
        if (valWidget) {
            // THE PRECISION FIX: Base increment on the serialized history entry to ensure continuity
            const historyBase = node.properties.seedHistory?.[0];
            const currentSeed = (historyBase && !String(historyBase).includes("-")) ? BigInt(historyBase) : BigInt(valWidget.value || 0);
            const digitCount = Math.max(1, Math.min(15, node.properties.seedDigits || 15));
            const minSeed = 0n; // THE MAX-DIGIT FIX: Allow values from 0 up to the maximum decimal limit
            const maxSeed = BigInt(10 ** digitCount - 1);

            let newSeed;
            if (mode === "Increment") {
                const calculated = currentSeed + 1n;
                newSeed = (calculated > maxSeed || calculated < minSeed) ? Number(minSeed) : Number(calculated);
            } else {
                // THE MIXING FIX: Convert BigInt range to Number for compatibility with Math.random()
                const range = Number(maxSeed - minSeed + 1n);
                newSeed = Number(minSeed) + Math.floor(Math.random() * range);
            }

            valWidget.value = newSeed;
            node.properties.seedHistory.unshift(newSeed);
            const limit = node.properties.seedHistoryLimit || 5;
            node.properties.seedHistory = node.properties.seedHistory.slice(0, limit);

            broadcastSeedSignal(node);
            syncHistoryToLayout(node, -1, true);
            node.requestDerpSync();
            node.refreshNodeLayoutMap();
        }
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

            // THE HYDRATION PASS: Force receivers to sync latest wireless values before serialization.
            app.graph?._nodes.forEach(n => {
                if (n.updateReceivedSignals) n.updateReceivedSignals();
            });

            // THE EXECUTION SYNC FIX: Apply the shared wireless-consumer refresh immediately before
            // serialization so remote bypass targets settle to the latest toggle-driven state.
            refreshWirelessSignalConsumers();

            const p = await app.graphToPrompt();

            // THE SURGICAL TIMESTAMP FIX: We keep signal_data to detect real wireless value changes,
            // but we must strip the volatile 'timestamp' property that updates every frame.
            const cleanOutput = JSON.parse(JSON.stringify(p.output));
            for (const id in cleanOutput) {
                const nData = cleanOutput[id];
                if (nData.inputs?.signal_data) {
                    try {
                        const sigPayload = JSON.parse(nData.inputs.signal_data);
                        if (sigPayload.signals) {
                            for (const sId in sigPayload.signals) delete sigPayload.signals[sId].timestamp;
                        }
                        nData.inputs.signal_data = JSON.stringify(sigPayload);
                    } catch(e) {}
                }
                // Ignore native seeds to prevent false positives from randomize-after-generate logic.
                if (nData.class_type !== "derpSeedV2" && nData.inputs) {
                    delete nData.inputs.seed;
                    delete nData.inputs.noise_seed;
                }
            }

            // THE STABLE HASH FIX: Sort top-level node IDs for deterministic serialization.
            // (Note: Using the replacer array in JSON.stringify recursively strips nested keys like 'inputs').
            const sortedOutput = Object.keys(cleanOutput).sort().reduce((acc, key) => {
                acc[key] = cleanOutput[key];
                return acc;
            }, {});

            // THE VIRTUAL STATE INJECTION: Since some pure virtual wireless nodes are omitted from
            // the standard ComfyUI prompt, we must manually append their state to the hash.
            const vNodes = app.graph?._nodes || [];
            const vState = vNodes.flatMap(n => {
                const typeName = String(n.type || "").toLowerCase();

                if (typeName.includes("derplorastack")) {
                    return [{
                        kind: "derpLoraStack",
                        id: n.id,
                        stack: n.properties?.stackData,
                        mode: n.properties?.attentionMode,
                        nodeBypassed: n.mode === 2 || n.mode === 4 || n.properties?.isBypassed || (n.widgets && n.widgets[0]?.value === "bypass")
                    }];
                }

                if (n._isDerpModelLoaderNode === true || typeName.includes("derpmodelloader")) {
                    const deck = Array.isArray(n.properties?.modelDeck) ? n.properties.modelDeck : [];
                    return [{
                        kind: "derpModelLoader",
                        id: n.id,
                        activeModel: deck.find(item => item?.active)?.name || null,
                        deck: deck.map(item => ({ name: item?.name || "", active: item?.active === true })),
                        nodeBypassed: n.mode === 2 || n.mode === 4 || n.properties?.isBypassed || (n.widgets && n.widgets[0]?.value === "bypass")
                    }];
                }

                if (typeName.includes("derptoggle") || typeName.includes("togglenode")) {
                    return [{
                        kind: "derpToggle",
                        id: n.id,
                        title: n.titleLabel || n.title || "Derp Toggle",
                        signalName: n.properties?.signalName || "Bypass Toggle",
                        toggleState: n.properties?.toggleState !== false,
                        nodeBypassed: n.mode === 2 || n.mode === 4 || !!n._derpSpoofedBypass
                    }];
                }

                if (typeName.includes("derpconcatenate")) {
                    return [{
                        kind: "derpConcatenate",
                        id: n.id,
                        textValue: n.properties?.textValue || "",
                        signalIds: n.properties?.multiSignalIds || {},
                        nodeBypassed: n.mode === 2 || n.mode === 4 || !!n._derpSpoofedBypass
                    }];
                }

                return [];
            });

            const promptString = JSON.stringify(sortedOutput) + JSON.stringify(vState);

            if (mode === "Fixed" && node._lastPromptString === promptString) {
                showBastaMessage(node, "Workflow unchanged. Skipping redundant queue.", 3000, {}, "btnExecute", false);
                return;
            }
            node._lastPromptString = promptString;
        } catch (e) {
            console.warn("[DerpSeed] Prompt serialization failed, proceeding anyway.");
        }
    }

    if (app?.queuePrompt) {
        if (typeof playMicrowaveDing === "function") {
            try { new Audio().play().catch(() => {}); } catch(e) {}
        }
        node._localExecutionTriggered = true;
        node.updateDerpSeedUI(true);
        app.queuePrompt(0).then(res => {
            if (res?.prompt_id) node._currentPromptId = res.prompt_id;
        }).catch(() => node.finalizeUI());
    }
}

export function handleStopPress(node) {
    if (app.api && typeof app.api.interrupt === "function") {
        app.api.interrupt();
    }
}

export function handleHistoryCountBlur(node, val) {
    const num = parseInt(val);
    if (!isNaN(num)) {
        const newLimit = Math.max(1, Math.min(20, num));
        node.properties.seedHistoryLimit = newLimit;

        const placeholder = "-".repeat(node.properties.seedDigits || 15);
        while (node.properties.seedHistory.length < newLimit) {
            node.properties.seedHistory.push(placeholder);
        }
        if (node.properties.seedHistory.length > newLimit) {
            node.properties.seedHistory = node.properties.seedHistory.slice(0, newLimit);
        }

        syncHistoryToLayout(node, -1, true);
        node.refreshNodeLayoutMap();
        node.updateDerpSeedUI(false);
        node.refreshDerpSeedSysMap();

        node._derpAwakeFrames = 10;
        node.requestDerpSync();
    }
}

export function handleDigitValueBlur(node, val) {
    const num = parseInt(val);
    if (!isNaN(num)) {
        const newDigits = Math.max(3, Math.min(15, num));

        if (node.properties.seedDigits !== newDigits) {
            node.properties.seedDigits = newDigits;

            const limit = node.properties.seedHistoryLimit || 5;
            // THE PRECISION FIX: Use the favorite number as the repeating default seed
            const initialSeed = parseInt(String(node.properties.favoriteNum || 8).repeat(newDigits));
            node.properties.seedHistory = [initialSeed, ...Array(limit - 1).fill("-".repeat(newDigits))];

            const valWidget = node.widgets?.find(w => w.name === "value" || w.name === "seed" || w.name === "noise_seed");
            if (valWidget) valWidget.value = initialSeed;

            syncHistoryToLayout(node, -1, true);
            node.refreshNodeLayoutMap();
            node.updateDerpSeedUI(false);
            node.refreshDerpSeedSysMap();

            node._derpAwakeFrames = 10;
            node.requestDerpSync();
        }
    }
}
