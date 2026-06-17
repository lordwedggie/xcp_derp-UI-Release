/**
 * Path: ./js/derps/core/derpSchedulerLoader_core.js
 * ROLE: Logic Controller for the Derp Scheduler Loader.
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

export function syncDerpSchedulerLoaderLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_scheduler_loader.title", "Derp Scheduler Loader");
    const previousLocalizedTitle = node._lastLocalizedDerpSchedulerLoaderTitle;
    const localizedOutput = tLocale("$derp_scheduler_loader.port.scheduler", "Scheduler");
    const previousLocalizedOutput = node._lastLocalizedDerpSchedulerLoaderOutput;

    if (!node.titleLabel || node.titleLabel === "Derp Scheduler Loader" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Scheduler Loader" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (!node.properties.outputName || node.properties.outputName === "Scheduler" || (previousLocalizedOutput && node.properties.outputName === previousLocalizedOutput)) {
        node.properties.outputName = localizedOutput;
    }

    node._lastLocalizedDerpSchedulerLoaderTitle = localizedTitle;
    node._lastLocalizedDerpSchedulerLoaderOutput = localizedOutput;
}

export function initDerpSchedulerLoaderCore(nodeType) {
    const proto = nodeType.prototype;

    function normalizeSchedulerDeck(deck) {
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

    function resolveSchedulerMatch(list, savedName) {
        if (!savedName || !Array.isArray(list)) return null;
        if (list.includes(savedName)) return savedName;
        return list.find(name => name === savedName) || null;
    }

    function getSchedulerTypeList(node) {
        return Array.isArray(node._schedulerList) && node._schedulerList.length > 0
            ? [...node._schedulerList]
            : "COMBO";
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        syncDerpSchedulerLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        syncDerpSchedulerLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
    };

    proto.fetchSchedulerData = function(showNotification = false, options = {}) {
        if (this.id === -1) return;

        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();
        fetch(`/object_info/KSampler?v=${session}`)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                const schedulerInput = data?.KSampler?.input?.required?.scheduler;
                this._schedulerList = Array.isArray(schedulerInput?.[0]) ? schedulerInput[0] : [];

                const missing = [];
                if (this.properties.schedulerDeck) {
                    this.properties.schedulerDeck = this.properties.schedulerDeck.map(saved => {
                        const match = resolveSchedulerMatch(this._schedulerList, saved.name);
                        if (match) return { ...saved, name: match };
                        missing.push(saved.name);
                        return null;
                    }).filter(Boolean);
                    this.properties.schedulerDeck = normalizeSchedulerDeck(this.properties.schedulerDeck);
                }

                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

                if (showNotification || missing.length > 0) {
                    if (typeof playMicrowaveDing === "function") playMicrowaveDing();

                    const mode = missing.length > 0 ? "error" : "info";
                    const msg = missing.length > 0
                        ? `${tLocale("$derp_scheduler_loader.messages.missing_purged_prefix", "Missing Schedulers Purged: ")}${missing.join(", ")}`
                        : tLocale("$derp_scheduler_loader.messages.list_updated", "Scheduler list updated");
                    if (typeof showBastaMessage === "function") {
                        showBastaMessage(this, msg, missing.length > 0 ? 6000 : 3000, { fade: true, grow: true }, "btnRefreshSchedulers", false, mode);
                    }
                }

                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
            })
            .catch(error => {
                console.error("Failed to fetch scheduler data:", error);
                this._schedulerList = [];
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                this.requestDerpSync();
                if (showNotification && typeof showBastaMessage === "function") {
                    showBastaMessage(this, tLocale("$derp_scheduler_loader.messages.load_failed", "Failed to load schedulers"), 4000, { fade: true, grow: true }, "btnRefreshSchedulers", false, "error");
                }
            });
    };

    proto.syncDerpOutputs = function() {
        const ports = [
            { name: tLocale("$derp_scheduler_loader.port.scheduler", "Scheduler"), type: getSchedulerTypeList(this) }
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
        const deck = this.properties.schedulerDeck || [];
        const activeItem = deck.find(m => m.active);
        const val = isBypassed ? null : (activeItem ? activeItem.name : null);
        const nodeName = this.titleLabel || this.title || tLocale("$derp_scheduler_loader.title", "Derp Scheduler Loader");
        const signalType = val ? getSchedulerTypeList(this) : "null";
        const fingerprint = `${isBypassed ? "bypass" : "live"}_${val}_${nodeName}_${this.id}_${deck.length}_${JSON.stringify(signalType)}`;
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        if (!window.xcpDerpSignals) window.xcpDerpSignals = {};

        const baseId = String(this.id);
        const signalId = `${baseId}:0`;
        window.xcpDerpSignals[signalId] = {
            nodeId: signalId,
            nodeName: `${nodeName} [${tLocale("$derp_scheduler_loader.signal.scheduler", "Scheduler")}]`,
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
        this._sysProfileFile = "derpSchedulerLoader";
        this._sysProfileFolder = "nodeSettings";
        if (panel.showProfiles) {
            panel.showProfiles("derpSchedulerLoader", "nodeSettings");
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
        const rawSchedulers = Array.isArray(profileObj)
            ? profileObj
            : (Array.isArray(profileObj?.schedulers) ? profileObj.schedulers : []);

        const normalized = rawSchedulers
            .map((entry, idx) => {
                if (typeof entry === "string") return { name: entry, active: idx === 0 };
                if (entry && typeof entry.name === "string") return { name: entry.name, active: !!entry.active };
                return null;
            })
            .filter(Boolean);

        this.properties.schedulerDeck = normalizeSchedulerDeck(normalized);
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        const deck = Array.isArray(this.properties.schedulerDeck) ? this.properties.schedulerDeck : [];
        return {
            schedulers: deck.map(item => String(item?.name || "")).filter(Boolean)
        };
    };

    proto.handleSchedulerCreated = function() {
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this._restoreSchedulerDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();

        this.titleLabel = tLocale("$derp_scheduler_loader.title", "Derp Scheduler Loader");
        this.properties.titleLabel = tLocale("$derp_scheduler_loader.title", "Derp Scheduler Loader");
        this.properties.outputName = tLocale("$derp_scheduler_loader.port.scheduler", "Scheduler");
        this.properties.schedulerDeck = [];
        this.properties.drawSettingBtn = false;

        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [220, 90];
        this.size = [220, 90];

        syncDerpSchedulerLoaderLocaleLabels(this);

        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();

        setTimeout(() => {
            if (this._restoreSchedulerDeckPending) return;
            this.fetchSchedulerData();
            if (!this._restoreSchedulerDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                this.syncDerpOutputs();
            }
        }, 32);
    };

    proto.handleSchedulerConfigure = function() {
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
        this.titleLabel = this.properties.titleLabel || tLocale("$derp_scheduler_loader.title", "Derp Scheduler Loader");
        this.properties.titleLabel = this.titleLabel;
        this.properties.outputName = tLocale("$derp_scheduler_loader.port.scheduler", "Scheduler");
        syncDerpSchedulerLoaderLocaleLabels(this);

        this._restoreSchedulerDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.schedulerDeck || []));
        this.fetchSchedulerData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._schedulerList || [];
                const restored = savedDeck.map(saved => {
                    const match = resolveSchedulerMatch(currentList, saved.name);
                    if (match) return { name: match, active: !!saved.active };
                    return null;
                }).filter(Boolean);
                if (restored.length > 0) {
                    this.properties.schedulerDeck = normalizeSchedulerDeck(restored);
                }
            }
            this._restoreSchedulerDeckPending = false;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 50);
    };

    proto.handleSchedulerDraw = function() {
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

    proto.handleSchedulerResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
