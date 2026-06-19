import { showBastaMessage } from "../../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../../fatha/bastas/bastaSystemMessage.js";
import { playMicrowaveDing } from "../../../herbina/masterSoundEffects.js";
import { transmitDerpSignal } from "../../../fatha/core/masterSignalEngine.js";

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

function syncDerpClipLoaderLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_clip_loader.title", "Derp Clip Loader");
    const previousLocalizedTitle = node._lastLocalizedDerpClipLoaderTitle;

    if (!node.titleLabel || node.titleLabel === "Virtual Node" || node.titleLabel === "Derp Clip Loader" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Virtual Node" || node.properties.titleLabel === "Derp Clip Loader" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }

    node._lastLocalizedDerpClipLoaderTitle = localizedTitle;
}

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

function pushClipSignalToRegistry(node, signalId, nodeName, portLabel, payload) {
    if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
    window.xcpDerpSignals[signalId] = {
        nodeId: signalId,
        nodeName: `${nodeName} [${portLabel}]`,
        nodeType: node.type,
        type: payload ? "clip" : "null",
        value: payload,
        upstreamIds: [],
        timestamp: Date.now(),
        isPureVirtual: !!(node.isPureVirtual || node.properties?.isPureVirtual)
    };
}

export function initDerpClipLoaderCore(nodeType) {
    const proto = nodeType.prototype;

    function ensureIdentity(node) {
        node._sysProfileFile = "derpClipLoader";
        node._sysProfileFolder = "nodeSettings";
        syncDerpClipLoaderLocaleLabels(node);
    }

    proto.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        syncDerpClipLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        if (this.syncDerpOutputs) this.syncDerpOutputs();
    };

    proto.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        syncDerpClipLoaderLocaleLabels(this);
        this._layoutMapHash = null;
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        if (this.syncDerpOutputs) this.syncDerpOutputs();
    };

    proto.fetchClipData = async function(showNotification = false, options = {}) {
        if (this.id === -1) return;
        const suppressSignal = options?.suppressSignal === true;
        const session = window._xcpDerpSession || Date.now();
        const textEncoderRes = await fetch(`/xcp/list/text_encoders?v=${session}`).then(r => r.json());
        this._clipList = textEncoderRes.items || [];

        const missing = [];
        const healed = [];
        this.properties.clipDeck = (this.properties.clipDeck || []).map((m) => {
            if (this._clipList.includes(m.name)) return m;
            const match = resolvePathMatch(this._clipList, m.name);
            if (match) {
                healed.push(`${m.name.split(/[\\/]/).pop()} (Path Updated)`);
                return { ...m, name: match };
            }
            missing.push(m.name.split(/[\\/]/).pop());
            return null;
        }).filter(Boolean);

        this.properties.clipDeck = normalizeDeck(this.properties.clipDeck);

        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

        if (showNotification || missing.length) {
            if (typeof playMicrowaveDing === "function") playMicrowaveDing();
            if (missing.length && typeof showBastaMessage === "function") {
                showBastaMessage(this, `${tLocale("$derp_clip_loader.messages.missing_purged_prefix", "Missing CLIPs Purged: ")}${missing.join(", ")}`, 6000, { fade: true, grow: true }, "btnRefreshClips", false, "error");
            }
        }
        if (healed.length) {
            healed.forEach((item) => showBastaSystemMessage(this, tLocale("$derp_clip_loader.messages.relinked_prefix", "CLIPs Re-linked: "), 3000, { fade: true, grow: true }, null, "success", false, item));
        }

        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.syncDerpOutputs = function() {
        const ports = [{ name: tLocale("$derp_clip_loader.ports.clip", "Clip"), type: "CLIP" }];
        if (!this.outputs || this.outputs.length !== ports.length) this.outputs = ports;
        this.outputs.forEach(o => { if (o.links) o.links = null; });
        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1) return;
        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        const activeClip = (this.properties.clipDeck || []).find(m => m.active);

        const clipName = isBypassed ? null : activeClip?.name;
        const clipType = this.properties.clipType || "stable_diffusion";
        const clipDevice = this.properties.clipDevice || "default";
        const payload = clipName ? {
            text_encoder_name: clipName,
            clip_name: clipName,
            clip_type: clipType,
            clip_device: clipDevice,
            clip_id: `${this.id}:0`,
            signal_role: "clip"
        } : null;
        const nodeName = this.titleLabel || this.title || tLocale("$derp_clip_loader.title", "Derp Clip Loader");
        const clipPortLabel = tLocale("$derp_clip_loader.ports.clip", "Clip");
        const fingerprint = JSON.stringify([isBypassed, clipName, clipType, clipDevice, this.id, nodeName, clipPortLabel, (this.properties.clipDeck || []).length]);
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        if (clipName && this.widgets) {
            const clipWidget = this.widgets.find(w => w.name === "text_encoder_name" || w.name === "clip_name");
            if (clipWidget) clipWidget.value = clipName;
        }

        const baseId = String(this.id);
        pushClipSignalToRegistry(this, `${baseId}:0`, nodeName, clipPortLabel, payload);

        const savedOutputs = this.outputs;
        if (this._xcpTrueOutputs && this._xcpTrueOutputs.length > 0) this.outputs = this._xcpTrueOutputs;
        if (payload) transmitDerpSignal(this, payload);
        this.outputs = savedOutputs;
    };

    proto.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        this._sysProfileActive = true;
        this._sysProfileFile = "derpClipLoader";
        this._sysProfileFolder = "nodeSettings";
        if (panel.showProfiles) panel.showProfiles("derpClipLoader", "nodeSettings");
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
        const clips = Array.isArray(profileObj?.clips) ? profileObj.clips : (Array.isArray(profileObj?.text_encoders) ? profileObj.text_encoders : []);
        this.properties.clipDeck = normalizeDeck(clips.map((name, idx) => ({ name, active: idx === 0 })));
        this.properties.clipType = profileObj?.clip_type || this.properties.clipType || "stable_diffusion";
        this.properties.clipDevice = profileObj?.clip_device || this.properties.clipDevice || "default";
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        return {
            clips: (this.properties.clipDeck || []).map(item => String(item?.name || "")).filter(Boolean),
            clip_type: this.properties.clipType || "stable_diffusion",
            clip_device: this.properties.clipDevice || "default"
        };
    };

    proto.handleClipLoaderCreated = function() {
        ensureIdentity(this);
        this._isDerpClipLoaderNode = true;
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = true;
        this.properties.settingActive = true;
        this.properties.clipDeck = normalizeDeck(this.properties.clipDeck || []);
        if (typeof this.properties.showFolderNames !== "boolean") this.properties.showFolderNames = true;
        if (typeof this.properties.clipType !== "string") this.properties.clipType = "stable_diffusion";
        if (typeof this.properties.clipDevice !== "string") this.properties.clipDevice = "default";
        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [320, 120];
        this.size = [320, 120];
        if (!this._restoreClipDeckPending && this.syncDerpOutputs) this.syncDerpOutputs();
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        setTimeout(() => {
            if (this._restoreClipDeckPending) return;
            this.fetchClipData();
            if (!this._restoreClipDeckPending && typeof this.syncDerpOutputs === "function" && this.id !== -1) this.syncDerpOutputs();
        }, 32);
    };

    proto.handleClipLoaderConfigure = function() {
        ensureIdentity(this);
        this._isDerpClipLoaderNode = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = true;
        if (typeof this.properties.settingActive !== "boolean") this.properties.settingActive = true;
        this._restoreClipDeckPending = true;
        const savedDeck = JSON.parse(JSON.stringify(this.properties.clipDeck || []));
        this.properties.clipDeck = normalizeDeck(this.properties.clipDeck || []);
        if (typeof this.properties.clipType !== "string") this.properties.clipType = "stable_diffusion";
        if (typeof this.properties.clipDevice !== "string") this.properties.clipDevice = "default";
        this.fetchClipData(false, { suppressSignal: true });
        setTimeout(() => {
            if (savedDeck && savedDeck.length > 0) {
                const currentList = this._clipList || [];
                const restored = savedDeck.map(saved => {
                    const match = resolvePathMatch(currentList, saved.name);
                    if (match) return { ...saved, name: match, active: !!saved.active };
                    return null;
                }).filter(Boolean);
                if (restored.length > 0) {
                    this.properties.clipDeck = normalizeDeck(restored);
                }
            }
            this._restoreClipDeckPending = false;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 50);
    };

    proto.handleClipLoaderDraw = function() {
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

    proto.handleClipLoaderResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };
}
