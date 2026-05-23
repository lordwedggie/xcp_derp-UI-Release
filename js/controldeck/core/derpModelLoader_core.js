/**
 * Path: ./js/fatha/nodes/derpModelLoader_core.js
 * ROLE: Logic Controller for the Derp Model Loader.
 */
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { playMicrowaveDing } from "../../herbina/masterSoundEffects.js";
import { transmitDerpSignal } from "../../fatha/core/masterSignalEngine.js";
import { app } from "../../../../scripts/app.js";

let derpModelLoaderPromptHookInstalled = false;

function installDerpModelLoaderPromptHook() {
    if (derpModelLoaderPromptHookInstalled || !app?.graphToPrompt) return;
    derpModelLoaderPromptHookInstalled = true;

    const originalGraphToPrompt = app.graphToPrompt;
    app.graphToPrompt = function() {
        if (app?.graph?._nodes) {
            app.graph._nodes.forEach((node) => {
                if (!node || node._isDerpModelLoaderNode !== true) return;
                node._hasClearedVRAMSinceQueuePrompt = false;
            });
        }
        return originalGraphToPrompt.apply(this, arguments);
    };
}

export function initDerpModelLoaderCore(nodeType) {
    const proto = nodeType.prototype;
    installDerpModelLoaderPromptHook();

    function normalizeModelDeck(deck) {
        if (!Array.isArray(deck) || deck.length === 0) return [];

        let activeFound = false;
        return deck.map((entry, idx) => {
            const next = { ...entry, active: !!entry.active };
            if (next.active) {
                if (!activeFound) {
                    activeFound = true;
                } else {
                    next.active = false;
                }
            }
            return next;
        }).map((entry, idx, arr) => {
            if (!activeFound && idx === 0) return { ...entry, active: true };
            return entry;
        });
    }

    function resolveModelPathMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;

        const fileName = String(savedName).split(/[\\/]/).pop();
        return list.find(path => path.endsWith(fileName) || path.split(/[\\/]/).pop() === fileName) || null;
    }

    function ensureModelIdentity(node) {
        node._sysProfileFile = "derpModelLoader";
        node._sysProfileFolder = "nodeSettings";
        node.titleLabel = "Derp Model Loader";
        node.properties.titleLabel = node.titleLabel;
        if (typeof node.properties.selectedProfileName !== "string") node.properties.selectedProfileName = "";
        if (typeof node._currentProfileName !== "string" || !node._currentProfileName) {
            node._currentProfileName = node.properties.selectedProfileName || "";
        }
    }

    function queueModelRelinkMessages(node, items) {
        items.forEach((item) => {
            showBastaSystemMessage(node, "Models Re-linked: ", 3000, { fade: true, grow: true }, null, "success", false, item);
        });
    }

    function syncModelUnloadBaseline(node, force = false) {
        const activeModelName = (node?.properties?.modelDeck || []).find(m => m.active)?.name || null;
        if (!activeModelName) return;
        if (force || typeof node._lastBroadcastModelName !== "string" || !node._lastBroadcastModelName) {
            node._lastBroadcastModelName = activeModelName;
        }
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
            } catch (_) {
                // no-op
            }
            throw new Error(errorText);
        }
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        this._layoutMapHash = null; // THE STRUCTURAL RESET: Force full map rebuild on theme change
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        this._layoutMapHash = null; // Force layout refresh for palette shift
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.fetchModelData = function(showNotification = false, options = {}) {
        if (this.id === -1) return;
        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();
        fetch(`/xcp/list/models?v=${session}`)
            .then(r => r.json())
            .then(data => {
                this._modelList = data.items || [];

                const missing = [];
                const healed = [];
                if (this.properties.modelDeck) {
                    this.properties.modelDeck = this.properties.modelDeck.map(m => {
                        if (this._modelList.includes(m.name)) return m;

                        const fileName = m.name.split(/[\\/]/).pop();
                        const match = this._modelList.find(path => path.endsWith(fileName) || path.split(/[\\/]/).pop() === fileName);

                        if (match) {
                            healed.push(`${fileName} (Path Updated)`);
                            return { ...m, name: match };
                        }

                        missing.push(fileName);
                        return null;
                    }).filter(Boolean);

                    if (this.properties.modelDeck.length > 0) {
                        this.properties.modelDeck = normalizeModelDeck(this.properties.modelDeck);
                    }
                }

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

                syncModelUnloadBaseline(this);

                if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

                if (showNotification || missing.length > 0 || healed.length > 0) {
                    if (typeof playMicrowaveDing === "function") playMicrowaveDing();

                    let msg = "Model list updated";
                    let mode = "info";

                    // THE WARNING ENGINE: Explicit mode mapping for BastaMessage
                    if (missing.length > 0) {
                        msg = `Missing Models Purged: ${missing.join(", ")}`;
                        mode = "error"; // Triggers error styling and playKaboom()
                    } else if (healed.length > 0) {
                        msg = `Models Re-linked: ${healed.join(", ")}`;
                        mode = "success"; // Triggers success styling and playKaChing()
                    }

                    if (missing.length > 0 && healed.length > 0) {
                        msg = "Model deck synced: items repaired or removed.";
                        mode = "info";
                    }

                    if (healed.length > 0 && missing.length === 0 && typeof showBastaSystemMessage === "function") {
                        queueModelRelinkMessages(this, healed);
                    } else if (typeof showBastaMessage === "function") {
                        if (typeof playMicrowaveDing === "function") playMicrowaveDing();
                        const duration = (missing.length > 0 || healed.length > 0) ? 6000 : 3000;
                        showBastaMessage(this, msg, duration, { fade: true, grow: true }, "btnRefreshModels", false, mode);
                    }
                }

                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
            });
    };

    /**
     * THE PURE VIRTUAL ENFORCER: Defines the 3 Wireless Ports while purging physical links.
     */
    proto.syncDerpOutputs = function() {
        const ports = [
            { name: "Model", type: "MODEL" },
            { name: "Clip", type: "CLIP" },
            { name: "Vae", type: "VAE" }
        ];

        if (!this.outputs || this.outputs.length !== ports.length) {
            this.outputs = ports;
        }

        // ZERO-INFERENCE GATING: Safely clear links without triggering proxy loops
        if (this.outputs) {
            this.outputs.forEach(o => {
                if (o.links && o.links.length > 0) {
                    o.links = null;
                }
            });
        }

        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1 || this.mode === 4 || this.mode === 2) return;

        const activeModel = (this.properties.modelDeck || []).find(m => m.active);
        const val = activeModel ? activeModel.name : null;

        if (!val) return;

        const previousModel = this._lastBroadcastModelName || null;
        const shouldDumpModelOnChange = this.properties.toggleDumpModelOnChange !== false;
        const isDifferentModelSelection = !!previousModel && previousModel !== val;
        const unloadAlreadyPendingForTarget = this._pendingModelSwitchTarget === val;
        const unloadAlreadyPerformedForQueuedPrompt = this._hasClearedVRAMSinceQueuePrompt === true;

        const runTransmit = () => {
            this._lastBroadcastModelName = val;
            if (this._pendingModelSwitchTarget === val) {
                this._pendingModelSwitchTarget = null;
            }

            // THE BACKEND SYNC FIX: Update the physical LiteGraph widget so the Python backend executes with the chosen model
            if (this.widgets) {
                const ckptWidget = this.widgets.find(w => w.name === "ckpt_name" || w.name === "model_name");
                if (ckptWidget && ckptWidget.value !== val) {
                    ckptWidget.value = val;
                }
            }

            const nodeName = this.titleLabel || this.title || "Unknown";
            const fingerprint = `${val}_${nodeName}_${this.id}_${(this.properties.modelDeck || []).length}`;
            if (this._lastSignalFingerprint === fingerprint) return;
            this._lastSignalFingerprint = fingerprint;

            const modelPayload = { model_name_prefix: val, ckpt_name: val };

            // THE TRUE SLOTS FIX: Bypass the Perfect Heist's visual array deletion
            // to ensure the Signal Engine sees the physical MODEL/CLIP/VAE ports.
            const savedOutputs = this.outputs;
            if (this._xcpTrueOutputs && this._xcpTrueOutputs.length > 0) {
                this.outputs = this._xcpTrueOutputs;
            }

            transmitDerpSignal(this, modelPayload);

            // Restore the visual array state to maintain the Heist
            this.outputs = savedOutputs;
        };

        if (shouldDumpModelOnChange && isDifferentModelSelection) {
            if (unloadAlreadyPendingForTarget || unloadAlreadyPerformedForQueuedPrompt) {
                runTransmit();
                return;
            }

            const unloadToken = `${Date.now()}:${val}`;
            this._pendingModelUnloadToken = unloadToken;
            this._pendingModelSwitchTarget = val;
            this._lastSignalFingerprint = null;

            unloadPreviousModelFromVRAM(this, previousModel, val)
                .then(() => {
                    this._lastUnloadedModelName = previousModel;
                    this._lastUnloadedNextModelName = val;
                    this._hasClearedVRAMSinceQueuePrompt = true;
                    if (typeof showBastaSystemMessage === "function") {
                        showBastaSystemMessage(this, "VRAM Cleared: ", 2600, { fade: true, grow: true, silent: true }, null, "success", false, previousModel.split(/[\\/]/).pop() || previousModel);
                    }
                })
                .catch((error) => {
                    console.error("[xcpDerp] Failed to unload previous model from VRAM:", error);
                    if (typeof showBastaMessage === "function") {
                        showBastaMessage(this, "Model unload failed; continuing with switch", 2600, { fade: true, grow: true, width: 260 }, null, false, "error");
                    }
                })
                .finally(() => {
                    if (this._pendingModelUnloadToken !== unloadToken) return;
                    const liveActive = (this.properties.modelDeck || []).find(m => m.active)?.name || null;
                    this._pendingModelUnloadToken = null;
                    if (liveActive !== val) {
                        this._pendingModelSwitchTarget = null;
                        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
                        return;
                    }
                    runTransmit();
                });
            return;
        }

        runTransmit();
    };

    proto.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        this._sysProfileActive = true;
        this._sysProfileFile = "derpModelLoader";
        this._sysProfileFolder = "nodeSettings";
        if (panel.showProfiles) {
            panel.showProfiles("derpModelLoader", "nodeSettings");
        }
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        if (panel) panel._layoutDirty = true;
        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.onDerpSysPanelClose = function() {
        this._sysProfileActive = false;
    };

    // THE PROFILE PROTOCOL: Single JSON map in settings, same storage pattern as DerpSlider/DerpLatent
    proto.applyDerpProfile = function(profileName) {
        if (!this._sysProfileData || !this._sysProfileData[profileName] || profileName === "(No Profiles Found)") return;
        this._currentProfileName = profileName;
        if (this.properties) this.properties.selectedProfileName = profileName;

        const profileObj = this._sysProfileData[profileName];
        const rawModels = Array.isArray(profileObj)
            ? profileObj
            : (Array.isArray(profileObj?.models) ? profileObj.models : []);

        const normalized = rawModels
            .map((entry, idx) => {
                if (typeof entry === "string") {
                    return { name: entry, active: idx === 0 };
                }
                if (entry && typeof entry.name === "string") {
                    return { name: entry.name, active: !!entry.active };
                }
                return null;
            })
            .filter(Boolean);

        this.properties.modelDeck = normalizeModelDeck(normalized);
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        const deck = Array.isArray(this.properties.modelDeck) ? this.properties.modelDeck : [];
        return {
            models: deck.map(item => String(item?.name || "")).filter(Boolean)
        };
    };

    proto.handleLoaderCreated = function() {
        ensureModelIdentity(this);
        this._isDerpModelLoaderNode = true;
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this._restoreModelDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();

        this.properties.modelDeck = this.properties.modelDeck || [];
        if (typeof this.properties.showFolderNames !== "boolean") this.properties.showFolderNames = true;
        if (typeof this.properties.toggleDumpModelOnChange !== "boolean") this.properties.toggleDumpModelOnChange = true;
        this.properties.drawSettingBtn = false;
        syncModelUnloadBaseline(this, true);

        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [300, 150];
        this.size = [300, 150];

        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();

        setTimeout(() => {
            if (this._restoreModelDeckPending) return;
            this.fetchModelData();
            if (!this._restoreModelDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                this.syncDerpOutputs();
            }
        }, 32);
    };

    proto.handleLoaderConfigure = function() {
        ensureModelIdentity(this);
        this._isDerpModelLoaderNode = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
        if (typeof this.properties.toggleDumpModelOnChange !== "boolean") this.properties.toggleDumpModelOnChange = true;
        this._restoreModelDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.modelDeck || []));
        this.fetchModelData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._modelList || [];
                const restored = savedDeck.map(saved => {
                    const match = resolveModelPathMatch(currentList, saved.name);
                    if (match) {
                        return { name: match, active: !!saved.active };
                    }
                    return null;
                }).filter(Boolean);
                if (restored.length > 0) {
                    this.properties.modelDeck = normalizeModelDeck(restored);
                }
            }
            syncModelUnloadBaseline(this, true);
            this._restoreModelDeckPending = false;
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

        if (this._lastTitleLabel !== this.titleLabel) {
            this._lastTitleLabel = this.titleLabel;
            if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
        }
    };

    proto.handleLoaderResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
