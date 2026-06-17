/**
 * Path: ./js/derps/core/derpSamplerLoader_core.js
 * ROLE: Logic Controller for the Derp Sampler Loader.
 */
import { showBastaMessage } from "../../../fatha/bastas/bastaMessage.js";
import { playMicrowaveDing } from "../../../herbina/masterSoundEffects.js";

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

export function syncDerpSamplerLoaderLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_sampler_loader.title", "Derp Sampler Loader");
    const previousLocalizedTitle = node._lastLocalizedDerpSamplerLoaderTitle;
    const localizedOutput = tLocale("$derp_sampler_loader.port.sampler", "Sampler");
    const previousLocalizedOutput = node._lastLocalizedDerpSamplerLoaderOutput;

    if (!node.titleLabel || node.titleLabel === "Derp Sampler Loader" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Sampler Loader" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (!node.properties.outputName || node.properties.outputName === "Sampler" || (previousLocalizedOutput && node.properties.outputName === previousLocalizedOutput)) {
        node.properties.outputName = localizedOutput;
    }

    node._lastLocalizedDerpSamplerLoaderTitle = localizedTitle;
    node._lastLocalizedDerpSamplerLoaderOutput = localizedOutput;
}

export function initDerpSamplerLoaderCore(nodeType) {
    const proto = nodeType.prototype;

    function normalizeSamplerDeck(deck) {
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

    function resolveSamplerMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;
        return list.find(name => name === savedName) || null;
    }

    function getSamplerTypeList(node) {
        return Array.isArray(node._samplerList) && node._samplerList.length > 0
            ? [...node._samplerList]
            : "COMBO";
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        syncDerpSamplerLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        syncDerpSamplerLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.fetchSamplerData = function(showNotification = false, options = {}) {
        if (this.id === -1) return;

        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();
        fetch(`/object_info/KSampler?v=${session}`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                const samplerInput = data?.KSampler?.input?.required?.sampler_name;
                this._samplerList = Array.isArray(samplerInput?.[0]) ? samplerInput[0] : [];

                const missing = [];
                if (this.properties.samplerDeck) {
                    this.properties.samplerDeck = this.properties.samplerDeck.map(saved => {
                        const match = resolveSamplerMatch(this._samplerList, saved.name);
                        if (match) return { ...saved, name: match };
                        missing.push(saved.name);
                        return null;
                    }).filter(Boolean);
                    this.properties.samplerDeck = normalizeSamplerDeck(this.properties.samplerDeck);
                }

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

                if (showNotification || missing.length > 0) {
                    if (typeof playMicrowaveDing === "function") playMicrowaveDing();

                    const mode = missing.length > 0 ? "error" : "info";
                    const msg = missing.length > 0
                        ? `${tLocale("$derp_sampler_loader.messages.missing_purged_prefix", "Missing Samplers Purged: ")}${missing.join(", ")}`
                        : tLocale("$derp_sampler_loader.messages.list_updated", "Sampler list updated");
                    if (typeof showBastaMessage === "function") {
                        showBastaMessage(this, msg, missing.length > 0 ? 6000 : 3000, { fade: true, grow: true }, "btnRefreshSamplers", false, mode);
                    }
                }

                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
            })
            .catch(error => {
                console.error("Failed to fetch sampler data:", error);
                this._samplerList = [];
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                this.requestDerpSync();
                if (showNotification && typeof showBastaMessage === "function") {
                    showBastaMessage(this, tLocale("$derp_sampler_loader.messages.load_failed", "Failed to load samplers"), 4000, { fade: true, grow: true }, "btnRefreshSamplers", false, "error");
                }
            });
    };

    /**
     * THE PURE VIRTUAL ENFORCER: Keeps one logical wireless combo port while Fatha hides native slots.
     */
    proto.syncDerpOutputs = function() {
        const ports = [
            { name: tLocale("$derp_sampler_loader.port.sampler", "Sampler"), type: getSamplerTypeList(this) }
        ];

        if (!this.outputs || this.outputs.length !== ports.length || JSON.stringify(this.outputs[0]?.type) !== JSON.stringify(ports[0].type)) {
            this.outputs = ports;
        }

        this.outputs.forEach(o => { if (o.links) o.links = null; });
        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1) return;

        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        const deck = this.properties.samplerDeck || [];
        const activeItem = deck.find(m => m.active);
        const val = isBypassed ? null : (activeItem ? activeItem.name : null);
        const nodeName = this.titleLabel || this.title || tLocale("$derp_sampler_loader.title", "Derp Sampler Loader");
        const signalType = val ? getSamplerTypeList(this) : "null";
        const fingerprint = `${isBypassed ? "bypass" : "live"}_${val}_${nodeName}_${this.id}_${deck.length}_${JSON.stringify(signalType)}`;
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        if (!window.xcpDerpSignals) window.xcpDerpSignals = {};

        const baseId = String(this.id);
        const signalId = `${baseId}:0`;
        window.xcpDerpSignals[signalId] = {
            nodeId: signalId,
            nodeName: `${nodeName} [${tLocale("$derp_sampler_loader.signal.sampler", "Sampler")}]`,
            nodeType: this.type,
            type: signalType,
            value: val,
            upstreamIds: [],
            timestamp: Date.now(),
        };

        window.xcpDerpSignals[baseId] = {
            nodeId: baseId,
            nodeName: nodeName,
            nodeType: this.type,
            type: signalType,
            value: val,
            timestamp: Date.now(),
        };

        setTimeout(() => {
            fetch("/xcp/update_signal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: signalId, value: val }),
            });
        }, 50);

        if (window.app?.graph) {
            window.app.graph._nodes.forEach(n => {
                if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
            });
        }
    };

    proto.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        this._sysProfileActive = true;
        this._sysProfileFile = "derpSamplerLoader";
        this._sysProfileFolder = "nodeSettings";
        if (panel.showProfiles) {
            panel.showProfiles("derpSamplerLoader", "nodeSettings");
        }
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        if (panel) panel._layoutDirty = true;
        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.onDerpSysPanelClose = function() {
        this._sysProfileActive = false;
    };

    proto.applyDerpProfile = function(profileName) {
        if (!this._sysProfileData || !this._sysProfileData[profileName] || profileName === "(No Profiles Found)") return;

        const profileObj = this._sysProfileData[profileName];
        const rawSamplers = Array.isArray(profileObj)
            ? profileObj
            : (Array.isArray(profileObj?.samplers) ? profileObj.samplers : []);

        const normalized = rawSamplers
            .map((entry, idx) => {
                if (typeof entry === "string") return { name: entry, active: idx === 0 };
                if (entry && typeof entry.name === "string") return { name: entry.name, active: !!entry.active };
                return null;
            })
            .filter(Boolean);

        this.properties.samplerDeck = normalizeSamplerDeck(normalized);
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        const deck = Array.isArray(this.properties.samplerDeck) ? this.properties.samplerDeck : [];
        return {
            samplers: deck.map(item => String(item?.name || "")).filter(Boolean)
        };
    };

    proto.handleSamplerCreated = function() {
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this._restoreSamplerDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();

        this.titleLabel = tLocale("$derp_sampler_loader.title", "Derp Sampler Loader");
        this.properties.titleLabel = tLocale("$derp_sampler_loader.title", "Derp Sampler Loader");
        this.properties.outputName = tLocale("$derp_sampler_loader.port.sampler", "Sampler");
        this.properties.samplerDeck = [];
        this.properties.drawSettingBtn = false;

        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [220, 90];
        this.size = [220, 90];

        syncDerpSamplerLoaderLocaleLabels(this);

        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();

        setTimeout(() => {
            if (this._restoreSamplerDeckPending) return;
            this.fetchSamplerData();
            if (!this._restoreSamplerDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                this.syncDerpOutputs();
            }
        }, 32);
    };

    proto.handleSamplerConfigure = function() {
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
        this.titleLabel = this.properties.titleLabel || tLocale("$derp_sampler_loader.title", "Derp Sampler Loader");
        this.properties.titleLabel = this.titleLabel;
        this.properties.outputName = tLocale("$derp_sampler_loader.port.sampler", "Sampler");
        syncDerpSamplerLoaderLocaleLabels(this);

        this._restoreSamplerDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.samplerDeck || []));
        this.fetchSamplerData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._samplerList || [];
                const restored = savedDeck.map(saved => {
                    const match = resolveSamplerMatch(currentList, saved.name);
                    if (match) return { name: match, active: !!saved.active };
                    return null;
                }).filter(Boolean);
                if (restored.length > 0) {
                    this.properties.samplerDeck = normalizeSamplerDeck(restored);
                }
            }
            this._restoreSamplerDeckPending = false;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 50);
    };

    proto.handleSamplerDraw = function() {
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

    proto.handleSamplerResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
