import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { playMicrowaveDing } from "../../herbina/masterSoundEffects.js";
import { transmitDerpSignal } from "../../fatha/core/masterSignalEngine.js";

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

        const [diffusionRes, unetRes, textEncoderRes] = await Promise.all([
            fetch(`/xcp/list/diffusion_models?v=${session}`).then(r => r.json()),
            fetch(`/xcp/list/unet?v=${session}`).then(r => r.json()),
            fetch(`/xcp/list/text_encoders?v=${session}`).then(r => r.json())
        ]);

        const diffusionItems = [...(diffusionRes.items || []), ...(unetRes.items || [])];
        this._diffusionList = [...new Set(diffusionItems)];
        this._textEncoderList = textEncoderRes.items || [];

        const missingDiffusions = [];
        const healedDiffusions = [];
        const missingTextEncoders = [];
        const healedTextEncoders = [];

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

        this.properties.textEncoderDeck = (this.properties.textEncoderDeck || []).map((m) => {
            if (this._textEncoderList.includes(m.name)) return m;
            const match = resolvePathMatch(this._textEncoderList, m.name);
            if (match) {
                healedTextEncoders.push(`${m.name.split(/[\\/]/).pop()} (Path Updated)`);
                return { ...m, name: match };
            }
            missingTextEncoders.push(m.name.split(/[\\/]/).pop());
            return null;
        }).filter(Boolean);

        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck);
        this.properties.textEncoderDeck = normalizeDeck(this.properties.textEncoderDeck);

        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        if (!suppressSignal && this.broadcastWirelessSignal) this.broadcastWirelessSignal();

        if (showNotification || missingDiffusions.length || healedDiffusions.length || missingTextEncoders.length || healedTextEncoders.length) {
            if (typeof playMicrowaveDing === "function") playMicrowaveDing();
            if (healedDiffusions.length && typeof showBastaSystemMessage === "function") {
                queueRelinkMessages(this, healedDiffusions, "$derp_diffusion_loader.messages.relinked_diffusions_prefix", "Diffusions Re-linked: ");
            }
            if (healedTextEncoders.length && typeof showBastaSystemMessage === "function") {
                queueRelinkMessages(this, healedTextEncoders, "$derp_diffusion_loader.messages.relinked_text_encoders_prefix", "Text Encoders Re-linked: ");
            }
            if ((missingDiffusions.length || missingTextEncoders.length) && typeof showBastaMessage === "function") {
                const parts = [];
                if (missingDiffusions.length) parts.push(`${tLocale("$derp_diffusion_loader.messages.missing_diffusions_prefix", "Missing Diffusions Purged: ")}${missingDiffusions.join(", ")}`);
                if (missingTextEncoders.length) parts.push(`${tLocale("$derp_diffusion_loader.messages.missing_text_encoders_prefix", "Missing Text Encoders Purged: ")}${missingTextEncoders.join(", ")}`);
                showBastaMessage(this, parts.join(" | "), 6000, { fade: true, grow: true }, "btnRefreshDiffusions", false, "error");
            }
        }

        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    };

    proto.syncDerpOutputs = function() {
        const ports = [
            { name: tLocale("$derp_diffusion_loader.ports.model", "Model"), type: "MODEL" },
            { name: tLocale("$derp_diffusion_loader.ports.clip", "Clip"), type: "CLIP" }
        ];

        if (!this.outputs || this.outputs.length !== ports.length) {
            this.outputs = ports;
        }
        this.outputs.forEach(o => { if (o.links) o.links = null; });
        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
    };

    proto.broadcastWirelessSignal = function() {
        if (this.id === -1 || this.mode === 4 || this.mode === 2) return;
        const activeDiffusion = (this.properties.diffusionDeck || []).find(m => m.active);
        const activeTextEncoder = (this.properties.textEncoderDeck || []).find(m => m.active);
        if (!activeDiffusion || !activeTextEncoder) return;

        const diffusionName = activeDiffusion.name;
        const textEncoderName = activeTextEncoder.name;
        const weightDtype = this.properties.weightDtype || "default";
        const sharedPayload = {
            diffusion_name: diffusionName,
            text_encoder_name: textEncoderName,
            weight_dtype: weightDtype,
            model_name_prefix: diffusionName,
            model_name: diffusionName,
            clip_name: textEncoderName,
            model_id: `${this.id}:0`,
            clip_id: `${this.id}:1`
        };
        const modelPayload = {
            ...sharedPayload,
            signal_role: "model"
        };
        const clipPayload = {
            ...sharedPayload,
            signal_role: "clip"
        };
        const aggregatePayload = {
            ...sharedPayload,
            diffusion_name: activeDiffusion.name,
            text_encoder_name: activeTextEncoder.name,
            weight_dtype: this.properties.weightDtype || "default"
        };

        const fingerprint = JSON.stringify([diffusionName, textEncoderName, weightDtype, this.id]);
        if (this._lastSignalFingerprint === fingerprint) return;
        this._lastSignalFingerprint = fingerprint;

        if (this.widgets) {
            const diffusionWidget = this.widgets.find(w => w.name === "diffusion_name" || w.name === "model_name" || w.name === "unet_name");
            if (diffusionWidget) diffusionWidget.value = diffusionName;
            const textEncoderWidget = this.widgets.find(w => w.name === "text_encoder_name" || w.name === "clip_name");
            if (textEncoderWidget) textEncoderWidget.value = textEncoderName;
            const dtypeWidget = this.widgets.find(w => w.name === "weight_dtype" || w.name === "dtype");
            if (dtypeWidget) dtypeWidget.value = weightDtype;
        }

        const nodeName = this.titleLabel || this.title || tLocale("$derp_diffusion_loader.title", "Derp Diffusion Loader");
        const baseId = String(this.id);
        pushDiffusionSignalToRegistry(this, `${baseId}:0`, nodeName, tLocale("$derp_diffusion_loader.ports.model", "Model"), "model", modelPayload);
        pushDiffusionSignalToRegistry(this, `${baseId}:1`, nodeName, tLocale("$derp_diffusion_loader.ports.clip", "Clip"), "clip", clipPayload);

        const savedOutputs = this.outputs;
        if (this._xcpTrueOutputs && this._xcpTrueOutputs.length > 0) {
            this.outputs = this._xcpTrueOutputs;
        }
        transmitDerpSignal(this, aggregatePayload);
        this.outputs = savedOutputs;
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
        const textEncoders = Array.isArray(profileObj?.text_encoders) ? profileObj.text_encoders : [];
        this.properties.diffusionDeck = normalizeDeck(diffusions.map((name, idx) => ({ name, active: idx === 0 })));
        this.properties.textEncoderDeck = normalizeDeck(textEncoders.map((name, idx) => ({ name, active: idx === 0 })));
        this.properties.weightDtype = profileObj?.weight_dtype || this.properties.weightDtype || "default";
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
    };

    proto.exportDerpProfile = function() {
        return {
            diffusions: (this.properties.diffusionDeck || []).map(item => String(item?.name || "")).filter(Boolean),
            text_encoders: (this.properties.textEncoderDeck || []).map(item => String(item?.name || "")).filter(Boolean),
            weight_dtype: this.properties.weightDtype || "default"
        };
    };

    proto.handleDiffusionLoaderCreated = function() {
        ensureIdentity(this);
        this._isDerpDiffusionLoaderNode = true;
        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck || []);
        this.properties.textEncoderDeck = normalizeDeck(this.properties.textEncoderDeck || []);
        if (typeof this.properties.showFolderNames !== "boolean") this.properties.showFolderNames = true;
        if (typeof this.properties.weightDtype !== "string") this.properties.weightDtype = "default";
        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [320, 180];
        this.size = [320, 180];
        if (this.syncDerpOutputs) this.syncDerpOutputs();
        this.refreshNodeLayoutMap();
        this.refreshDerpTemplateSysMap();
        setTimeout(() => {
            this.fetchDiffusionData();
            if (typeof this.syncDerpOutputs === "function" && this.id !== -1) this.syncDerpOutputs();
        }, 32);
    };

    proto.handleDiffusionLoaderConfigure = function() {
        ensureIdentity(this);
        this._isDerpDiffusionLoaderNode = true;
        this.properties.skipGenericWirelessHeartbeat = true;
        this.properties.drawSettingBtn = false;
        this.properties.diffusionDeck = normalizeDeck(this.properties.diffusionDeck || []);
        this.properties.textEncoderDeck = normalizeDeck(this.properties.textEncoderDeck || []);
        if (typeof this.properties.weightDtype !== "string") this.properties.weightDtype = "default";
        this.fetchDiffusionData(false, { suppressSignal: true });
        setTimeout(() => {
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        }, 32);
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
