/**
 * Path: ./js/controldeck/core/derpImageDeck_core.js
 * ROLE: Runtime logic for DerpImageDeck image preview behavior.
 */

function toArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

function parseImageList(payload) {
    if (!payload) return [];

    if (typeof payload === "string") {
        try {
            const qIndex = payload.indexOf("?");
            if (qIndex >= 0 && payload.indexOf("/view") >= 0) {
                const params = new URLSearchParams(payload.slice(qIndex + 1));
                const filename = params.get("filename");
                if (filename) {
                    return [{
                        filename,
                        type: params.get("type") || "output",
                        subfolder: params.get("subfolder") || ""
                    }];
                }
            }
        } catch (e) {}
        return [];
    }

    if (payload.filename) {
        return [{
            filename: payload.filename,
            type: payload.type || "output",
            subfolder: payload.subfolder || ""
        }];
    }

    if (payload.image && typeof payload.image === "string") {
        return [{ filename: payload.image, type: payload.type || "output", subfolder: payload.subfolder || "" }];
    }

    const direct = toArray(payload.images);
    if (direct.length > 0) return direct;

    const uiImages = toArray(payload.ui && payload.ui.images);
    if (uiImages.length > 0) return uiImages;

    const resultImages = toArray(payload.output && payload.output.images);
    if (resultImages.length > 0) return resultImages;

    return [];
}

function resolveSignalById(signalId) {
    if (!signalId) return null;
    const signals = window.xcpDerpSignals || {};
    if (signals[signalId]) return signals[signalId];

    const baseId = String(signalId).split(":")[0];
    if (signals[baseId]) return signals[baseId];

    const indexed = Object.values(signals).find((s) => String(s?.nodeId || "").startsWith(`${baseId}:`));
    return indexed || null;
}

function resolvePreviewFromSourceNode(signalId) {
    const baseId = parseInt(String(signalId || "").split(":")[0], 10);
    if (!window.app || !window.app.graph || Number.isNaN(baseId)) return [];
    const node = window.app.graph.getNodeById(baseId);
    if (!node || !Array.isArray(node.imgs) || !node.imgs[0] || !node.imgs[0].src) return [];

    try {
        const src = String(node.imgs[0].src || "");
        const qIndex = src.indexOf("?");
        if (qIndex < 0 || src.indexOf("/view") < 0) return [];
        const params = new URLSearchParams(src.slice(qIndex + 1));
        const filename = params.get("filename");
        if (!filename) return [];
        return [{
            filename,
            type: params.get("type") || "output",
            subfolder: params.get("subfolder") || ""
        }];
    } catch (e) {
        return [];
    }
}

function resolvePreviewFromNodeOutputs(signalId) {
    const baseId = String(signalId || "").split(":")[0];
    if (!window.app || !window.app.nodeOutputs) return [];
    const out = window.app.nodeOutputs[baseId];
    if (!out) return [];

    const images = toArray(out.images);
    if (images.length > 0) return images;

    const uiImages = toArray(out.ui && out.ui.images);
    if (uiImages.length > 0) return uiImages;

    const outputImages = toArray(out.output && out.output.images);
    if (outputImages.length > 0) return outputImages;

    return [];
}

function buildComfyImageUrl(img) {
    if (!img || !img.filename) return null;
    const q = new URLSearchParams();
    q.set("filename", img.filename);
    q.set("type", img.type || "output");
    if (img.subfolder) q.set("subfolder", img.subfolder);
    q.set("v", String(window._xcpDerpSession || Date.now()));
    return `/view?${q.toString()}`;
}

function clampPreviewIndex(node) {
    const count = Array.isArray(node._derpImageDeckList) ? node._derpImageDeckList.length : 0;
    if (count <= 0) {
        node._derpImageDeckIndex = 0;
        return;
    }
    if (node._derpImageDeckIndex < 0) node._derpImageDeckIndex = 0;
    if (node._derpImageDeckIndex >= count) node._derpImageDeckIndex = count - 1;
}

export function initDerpImageDeckCore(nodeType) {
    const proto = nodeType.prototype;
    const baseOnExecuted = proto.onExecuted;

    proto.applyDerpImageDeckList = function(list, source = "unknown") {
        if (!Array.isArray(list) || list.length === 0) return;
        const nextHash = JSON.stringify(list);
        if (this._lastWirelessImageHash === nextHash) return;

        this._lastWirelessImageHash = nextHash;
        this._derpImageDeckList = list;
        this._derpImageDeckIndex = list.length - 1;
        this._layoutMapHash = null;

        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
    };

    proto.onExecuted = function(payload) {
        if (typeof baseOnExecuted === "function") {
            baseOnExecuted.call(this, payload);
        }

        const list = parseImageList(payload);
        if (list.length === 0) return;
        this.applyDerpImageDeckList(list, "physical-input");
    };

    proto.getDerpImageDeckCurrentUrl = function() {
        const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
        clampPreviewIndex(this);
        const current = list[this._derpImageDeckIndex] || null;
        return buildComfyImageUrl(current);
    };

    // Callback path used by bastaSignalReceiver.
    proto.setDerpSelectedSignal = function(val, idx = 0) {
        if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
        if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
        this.properties.multiSignalLabels[idx] = val;

        const match = String(val || "").match(/\[([\d:]+)\]/);
        if (match) this.properties.multiSignalIds[idx] = match[1];

        if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
    };

    // Wireless IMAGE receiver path.
    proto.syncDerpOutputs = function() {
        const ids = this.properties.multiSignalIds || {};
        const signalId = ids[0] || ids["0"];
        if (!signalId) return;

        const sig = resolveSignalById(signalId);
        if (!sig) return;

        let list = parseImageList(sig.value);
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromNodeOutputs(signalId);
        }
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromSourceNode(signalId);
        }
        if (!Array.isArray(list) || list.length === 0) return;
        this.applyDerpImageDeckList(list, "wireless-sync");
    };
}
