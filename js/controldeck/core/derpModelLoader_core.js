/**
 * Path: ./js/fatha/nodes/derpModelLoader_core.js
 * ROLE: Logic Controller for the Derp Model Loader.
 */
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { playMicrowaveDing } from "../../herbina/masterSoundEffects.js";
import { transmitDerpSignal } from "../../fatha/core/masterSignalEngine.js";

export function initDerpModelLoaderCore(nodeType) {
    const proto = nodeType.prototype;

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

                    if (typeof showBastaMessage === "function") {
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
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this._restoreModelDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();

        this.titleLabel = "Derp Model Loader";
        this.properties.titleLabel = "Derp Model Loader";
        this.properties.modelDeck = this.properties.modelDeck || [];
        this.properties.showFolderNames = true;
        this.properties.drawSettingBtn = false;

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
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
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
