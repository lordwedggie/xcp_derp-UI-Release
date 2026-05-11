/**
 * Path: ./js/controldeck/core/derpSamplerLoader_core.js
 * ROLE: Logic Controller for the Derp Sampler Loader.
 */
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";

export function initDerpSamplerLoaderCore(nodeType) {
    const proto = nodeType.prototype;

    function normalizeSamplerDeck(deck) {
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

    function resolveSamplerMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;
        return list.find(name => name === savedName) || null;
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

    proto.fetchSamplerData = function(showNotification = false, options = {}) {
        const session = window._xcpDerpSession || Date.now();
        const suppressSignal = options.suppressSignal || false;

        fetch(`/object_info/KSampler?v=${session}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Extract sampler names from the KSampler node info
                const ksamplerInfo = data.KSampler;
                if (ksamplerInfo && ksamplerInfo.input && ksamplerInfo.input.required) {
                    const samplerInput = ksamplerInfo.input.required.sampler_name;
                    if (samplerInput && Array.isArray(samplerInput[0])) {
                        this._samplerList = samplerInput[0];
                    } else {
                        this._samplerList = [];
                    }
                } else {
                    this._samplerList = [];
                }

                // Filter to only include samplers that are in our static list for type compatibility
                const STATIC_SAMPLER_NAMES = [
                    "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral",
                    "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde",
                    "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
                    "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm"
                ];
                this._samplerList = this._samplerList.filter(name => STATIC_SAMPLER_NAMES.includes(name));

                // Process existing deck against current list
                const deck = normalizeSamplerDeck(this.properties.samplerDeck || []);
                let deckUpdated = false;

                const newDeck = deck.map(m => {
                    if (m.name && this._samplerList.includes(m.name)) {
                        return m;
                    }
                    const match = resolveSamplerMatch(this._samplerList, m.name);
                    if (match) {
                        deckUpdated = true;
                        return { ...m, name: match };
                    }
                    deckUpdated = true;
                    return { ...m, active: false };
                }).filter(m => this._samplerList.includes(m.name));

                // Add any new samplers not in deck
                const currentNames = new Set(newDeck.map(m => m.name));
                this._samplerList.forEach(name => {
                    if (!currentNames.has(name)) {
                        newDeck.push({ name, active: false });
                        deckUpdated = true;
                    }
                });

                // Ensure at least one active sampler
                if (newDeck.length > 0 && !newDeck.some(m => m.active)) {
                    newDeck[0].active = true;
                    deckUpdated = true;
                }

                if (deckUpdated) {
                    this.properties.samplerDeck = newDeck;
                }

                if (!suppressSignal && typeof this.broadcastWirelessSignal === "function") {
                    this.broadcastWirelessSignal();
                }

                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                this.requestDerpSync();

                if (showNotification && newDeck.length > 0) {
                    showBastaMessage(`Loaded ${newDeck.length} samplers`, "success");
                }
            })
            .catch(error => {
                console.error("Failed to fetch sampler data:", error);
                this._samplerList = [];
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                this.requestDerpSync();

                if (showNotification) {
                    showBastaMessage("Failed to load samplers", "error");
                }
            });
    };

    // --- LIFECYCLE HOOKS ---
    const originalOnNodeCreated = proto.onNodeCreated;
    proto.onNodeCreated = function() {
        if (originalOnNodeCreated) originalOnNodeCreated.apply(this, arguments);

        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.titleLabel = "Derp Sampler Loader";
        this.properties.titleLabel = "Derp Sampler Loader";
        this.properties.outputName = "Sampler";
        this.properties.samplerDeck = normalizeSamplerDeck(this.properties.samplerDeck || []);
        this.properties.showFolderNames = this.properties.showFolderNames !== false;

        // Initial fetch
        setTimeout(() => {
            this.fetchSamplerData();
        }, 100);
    };

    const originalOnConfigure = proto.onConfigure;
    proto.onConfigure = function(info) {
        if (originalOnConfigure) originalOnConfigure.apply(this, arguments);

        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.titleLabel = this.properties.titleLabel || "Derp Sampler Loader";
        this.properties.titleLabel = this.titleLabel;
        this.properties.outputName = "Sampler";
        this.properties.samplerDeck = normalizeSamplerDeck(this.properties.samplerDeck || []);
        this.properties.showFolderNames = this.properties.showFolderNames !== false;

        // Refresh data after configuration
        setTimeout(() => {
            this.fetchSamplerData(false, { suppressSignal: true });
        }, 50);
    };

    // --- WIRELESS SIGNAL HANDLING ---
    proto.broadcastWirelessSignal = function() {
        if (this.id === -1) return;
        const deck = this.properties.samplerDeck || [];
        const activeItem = deck.find(m => m.active);
        if (activeItem) {
            const samplerType = Array.isArray(this._samplerList) && this._samplerList.length > 0
                ? [...this._samplerList]
                : "COMBO";
            const nodeName = this.titleLabel || this.title || "Derp Sampler Loader";
            const fingerprint = `${activeItem.name}_${nodeName}_${this.id}_${deck.length}_${JSON.stringify(samplerType)}`;
            if (this._lastSignalFingerprint === fingerprint) return;
            this._lastSignalFingerprint = fingerprint;

            if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
            const signalId = `${this.id}:0`;
            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: `${nodeName} [Sampler]`,
                nodeType: this.type,
                type: samplerType,
                value: activeItem.name,
                upstreamIds: [],
                timestamp: Date.now(),
            };

            fetch("/xcp/update_signal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: signalId, value: activeItem.name }),
            });

            if (window.app?.graph) {
                window.app.graph._nodes.forEach(n => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
                });
            }
        }
    };

    // --- SYSTEM PANEL HANDLING ---
    proto.onDerpSysPanelOpen = function(panel) {
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
    };

    const originalOnRemoved = proto.onRemoved;
    proto.onRemoved = function() {
        if (originalOnRemoved) originalOnRemoved.apply(this, arguments);
        // Cleanup any ongoing operations if needed
    };
}
