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

        console.log("[DerpImageDeck] applyDerpImageDeckList", {
            nodeId: this.id,
            source,
            list
        });

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

        this._derpImageDeckList = list;
        this._derpImageDeckIndex = list.length - 1;
        this._layoutMapHash = null;

        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        else if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
    };

    proto.getDerpImageDeckCurrentUrl = function() {
        const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
        clampPreviewIndex(this);
        const current = list[this._derpImageDeckIndex] || null;
        return buildComfyImageUrl(current);
    };

    proto.stepDerpImageDeck = function(step) {
        const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
        if (list.length <= 1) return;
        this._derpImageDeckIndex += step;
        if (this._derpImageDeckIndex < 0) this._derpImageDeckIndex = list.length - 1;
        if (this._derpImageDeckIndex >= list.length) this._derpImageDeckIndex = 0;
        this._layoutMapHash = null;
        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
    };

    // Callback path used by bastaSignalReceiver.
    proto.setDerpSelectedSignal = function(val, idx = 0) {
        if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
        if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
        this.properties.multiSignalLabels[idx] = val;

        const match = String(val || "").match(/\[([\d:]+)\]/);
        if (match) this.properties.multiSignalIds[idx] = match[1];

        console.log("[DerpImageDeck] Selected IMAGE signal", {
            nodeId: this.id,
            selectedLabel: val,
            selectedSignalId: this.properties.multiSignalIds[idx]
        });

        if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
    };

    // Wireless IMAGE receiver path.
    proto.syncDerpOutputs = function() {
        const ids = this.properties.multiSignalIds || {};
        const signalId = ids[0] || ids["0"];
        if (!signalId) {
            console.log("[DerpImageDeck] syncDerpOutputs: no selected signal", {
                nodeId: this.id,
                ids
            });
            return;
        }

        const sig = resolveSignalById(signalId);
        if (!sig) {
            console.log("[DerpImageDeck] syncDerpOutputs: signal not found", {
                nodeId: this.id,
                signalId,
                knownSignals: Object.keys(window.xcpDerpSignals || {})
            });
            return;
        }

        console.log("[DerpImageDeck] syncDerpOutputs: resolved signal", {
            nodeId: this.id,
            signalId,
            signal: sig
        });

        let list = parseImageList(sig.value);
        console.log("[DerpImageDeck] parseImageList(sig.value)", {
            nodeId: this.id,
            signalId,
            parsed: list,
            rawValue: sig.value
        });
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromNodeOutputs(signalId);
            console.log("[DerpImageDeck] resolvePreviewFromNodeOutputs(signalId)", {
                nodeId: this.id,
                signalId,
                parsed: list,
                nodeOutputs: window.app && window.app.nodeOutputs ? window.app.nodeOutputs[String(String(signalId).split(":")[0])] : undefined
            });
        }
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromSourceNode(signalId);
            const baseId = parseInt(String(signalId || "").split(":")[0], 10);
            const sourceNode = (!Number.isNaN(baseId) && window.app && window.app.graph) ? window.app.graph.getNodeById(baseId) : null;
            console.log("[DerpImageDeck] resolvePreviewFromSourceNode(signalId)", {
                nodeId: this.id,
                signalId,
                parsed: list,
                sourceNodeId: baseId,
                sourceNodeImg0: sourceNode && sourceNode.imgs ? sourceNode.imgs[0] : undefined,
                sourceNodeImg0Src: sourceNode && sourceNode.imgs && sourceNode.imgs[0] ? sourceNode.imgs[0].src : undefined
            });
        }
        if (!Array.isArray(list) || list.length === 0) {
            console.log("[DerpImageDeck] syncDerpOutputs: no image list resolved", {
                nodeId: this.id,
                signalId
            });
            return;
        }

        console.log("[DerpImageDeck] syncDerpOutputs: resolved image list", {
            nodeId: this.id,
            signalId,
            list
        });

        const nextHash = JSON.stringify(list);
        if (this._lastWirelessImageHash === nextHash) return;

        this.applyDerpImageDeckList(list, "wireless-sync");
    };
}
