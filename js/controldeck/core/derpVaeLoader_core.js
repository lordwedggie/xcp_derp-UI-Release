/**
 * Path: ./js/fatha/nodes/derpVaeLoader_core.js
 * ROLE: Logic Controller for the Derp Vae Loader.
 */
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { playMicrowaveDing } from "../../herbina/masterSoundEffects.js";

export function initDerpVaeLoaderCore(nodeType) {
    const proto = nodeType.prototype;

    function normalizeVaeDeck(deck) {
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

    function resolveVaePathMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;

        const fileName = String(savedName).split(/[\\/]/).pop();
        return list.find(path => path.endsWith(fileName) || path.split(/[\\/]/).pop() === fileName) || null;
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        this._layoutMapHash = null; // THE STRUCTURAL RESET: Synchronized cache nuke
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        this._layoutMapHash = null; // Force layout refresh for palette colors
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.fetchVaeData = function(showNotification = false, options = {}) {
        if (this.id === -1) return;
        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();
        const category = this.properties.extractFromModel ? "models" : "vaes";
        fetch(`/xcp/list/${category}?v=${session}`)
            .then(r => r.json())
            .then(data => {
                this._vaeList = data.items || [];

                const missing = [];
                const healed = [];
                if (this.properties.vaeDeck) {
                    const currentType = this.properties.extractFromModel ? "model" : "vae";
                    this.properties.vaeDeck = this.properties.vaeDeck.map(m => {
                        if (m.source && m.source !== currentType) return m;

                        if (this._vaeList.includes(m.name)) return m;

                        const fileName = m.name.split(/[\\/]/).pop();
                        const match = this._vaeList.find(path => path.endsWith(fileName) || path.split(/[\\/]/).pop() === fileName);

                        if (match) {
                            healed.push(`${fileName} (Path Updated)`);
                            return { ...m, name: match };
                        }

                        missing.push(fileName);
                        return null;
                    }).filter(Boolean);

                    if (this.properties.vaeDeck.length > 0) {
                        this.properties.vaeDeck = normalizeVaeDeck(this.properties.vaeDeck);
                    }
                }

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

                if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

                if (showNotification || missing.length > 0 || healed.length > 0) {
                    if (typeof playMicrowaveDing === "function") playMicrowaveDing();

                    let msg = "VAE list updated";
                    let mode = "info";

                    // THE WARNING ENGINE: Explicit mode mapping for BastaMessage
                    if (missing.length > 0) {
                        msg = `Missing VAEs Purged: ${missing.join(", ")}`;
                        mode = "error"; // Triggers error styling and playKaboom()
                    } else if (healed.length > 0) {
                        msg = `VAEs Re-linked: ${healed.join(", ")}`;
                        mode = "success"; // Triggers success styling and playKaChing()
                    }

                    if (missing.length > 0 && healed.length > 0) {
                        msg = "VAE deck synced: items repaired or removed.";
                        mode = "info";
                    }

                    if (typeof showBastaMessage === "function") {
                        const duration = (missing.length > 0 || healed.length > 0) ? 6000 : 3000;
                        showBastaMessage(this, msg, duration, { fade: true, grow: true }, "btnRefreshVaes", false, mode);
                    }
                }

                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
            });
    };

    /**
     * THE PURE VIRTUAL ENFORCER: Defines the Wireless Port while purging physical links.
     */
    proto.syncDerpOutputs = function() {
        const ports = [
            { name: "Vae", type: "VAE" }
        ];

        if (!this.outputs || this.outputs.length !== ports.length) {
            this.outputs = ports;
        }

        this.outputs.forEach(o => { if (o.links) o.links = null; });
        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1) return;

        const baseId = String(this.id);
        const nodeName = this.titleLabel || this.title || "Unknown";
        const activeVae = (this.properties.vaeDeck || []).find(m => m.active);
        const val = activeVae ? activeVae.name : null;

        // ZERO-INFERENCE GATING: Aggressive fingerprinting including item count to catch purges
        const fingerprint = `${val}_${nodeName}_${this.id}_${(this.properties.vaeDeck || []).length}`;
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        if (!window.xcpDerpSignals) window.xcpDerpSignals = {};

        const ports = [
            { name: "Vae", type: "VAE" }
        ];
        const vaePayload = val ? { vae_name: val } : null;

        ports.forEach((port, i) => {
            const signalId = `${baseId}:${i}`;
            const displayName = `${nodeName} [${port.name}]`;
            const finalValue = vaePayload;

            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: displayName,
                nodeType: this.type,
                type: port.type,
                value: finalValue,
                timestamp: Date.now()
            };

            // THE PYTHON SYNC FIX: Explicitly push individual ports to DERP_LIVE_REGISTRY so derpSignalOut can read them.
            setTimeout(() => {
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: signalId, value: finalValue })
                });
            }, 50);
        });

        window.xcpDerpSignals[baseId] = {
            nodeId: baseId,
            nodeName: nodeName,
            nodeType: this.type,
            type: "VAE",
            value: vaePayload,
            timestamp: Date.now()
        };

        if (window.app?.graph) {
            window.app.graph._nodes.forEach(n => {
                if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
            });
        }
    };

    proto.onDerpSysPanelOpen = function(panel) {
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
    };

    proto.onDerpSettingsPress = function() {
        this.refreshNodeLayoutMap();
    };

    proto.handleVaeCreated = function() {
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this._restoreVaeDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();

        this.titleLabel = "Derp Vae Loader";
        this.properties.titleLabel = "Derp Vae Loader";
        this.properties.vaeDeck = [];
        this.properties.extractFromModel = false;
        this.properties.showFolderNames = true;
        this.properties.drawSettingBtn = true;

        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [150, 50];
        this.size = [150, 50];

        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();

        setTimeout(() => {
            if (this._restoreVaeDeckPending) return;
            this.fetchVaeData();
            if (!this._restoreVaeDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                this.syncDerpOutputs();
            }
        }, 32);
    };

    proto.handleVaeConfigure = function() {
        this.properties.skipGenericWirelessHeartbeat = true;
        this._restoreVaeDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.vaeDeck || []));
        this.fetchVaeData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._vaeList || [];
                const currentType = this.properties.extractFromModel ? "model" : "vae";
                const preservedOtherSource = savedDeck.filter(saved => saved.source && saved.source !== currentType);
                const restoredCurrentSource = savedDeck.map(saved => {
                    if (saved.source && saved.source !== currentType) return null;
                    const match = resolveVaePathMatch(currentList, saved.name);
                    if (match) {
                        return { name: match, active: !!saved.active, source: currentType };
                    }
                    return null;
                }).filter(Boolean);

                const mergedDeck = [...preservedOtherSource, ...restoredCurrentSource];
                if (mergedDeck.length > 0) {
                    this.properties.vaeDeck = normalizeVaeDeck(mergedDeck);
                }
            }
            this._restoreVaeDeckPending = false;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 50);
    };

    proto.handleVaeDraw = function() {
        if (this.flags?.collapsed) return;

        // ZERO-INFERENCE OPTIMIZATION: Eliminate the high-frequency polling loop.
        // Signals are now strictly handled by the fingerprint gate inside broadcastWirelessSignal.
        if (this._lastTitleLabel !== this.titleLabel) {
            this._lastTitleLabel = this.titleLabel;
            if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
        }

        const currentW = Math.round(this.size[0]);
        if (this._lastDerpW !== currentW) {
            this._lastDerpW = currentW;
            this.refreshNodeLayoutMap();
        }
    };

    proto.handleVaeResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
