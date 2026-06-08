/**
 * Path: ./js/controldeck/core/derpImageDeck_core.js
 * ROLE: Runtime logic for DerpImageDeck image preview behavior.
 */
import { animateAlpha } from "../../herbina/masterAnimator.js";
import { getPinnedVerticalDeckAnchor, restorePinnedVerticalDeckAnchor } from "../../fatha/core/dockResize.js";
import { setDeckNodePos } from "../../fatha/core/masterDockEngine.js";
import { setDerpNodeSizeCompat } from "../../fatha/core/fathaNode2Compat.js";

// Crossfade alpha interpolation speed.
// Higher value = faster fade, lower value = slower fade.
const IMAGE_DECK_CROSSFADE_ALPHA_SPEED = 0.05;

// End threshold for completing the crossfade.
// Higher value = finish earlier, lower value = longer tail.
const IMAGE_DECK_CROSSFADE_END_EPSILON = 0.01;

function getNodeBottomY(node) {
    const y = Number(node?.pos?.[1]) || 0;
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
    return y + h;
}

function getImageDeckPinnedAnchor(node) {
    const graph = window.app?.graph || node?.graph || null;
    const deckAnchor = getPinnedVerticalDeckAnchor(node, graph);
    if (deckAnchor) return deckAnchor;
    return null;
}

function restoreImageDeckPinnedAnchor(anchor) {
    if (!anchor) return;
    restorePinnedVerticalDeckAnchor(anchor);
}

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

function getImageDeckListFingerprint(list) {
    if (!Array.isArray(list) || list.length === 0) return "0:";
    const parts = new Array(list.length);
    for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        if (typeof item === "string") {
            parts[i] = item;
            continue;
        }
        if (!item || typeof item !== "object") {
            parts[i] = String(item || "");
            continue;
        }
        const filename = String(item.filename || item.image || "");
        const type = String(item.type || "output");
        const subfolder = String(item.subfolder || "");
        parts[i] = `${filename}|${type}|${subfolder}`;
    }
    return `${list.length}:${parts.join("\u0001")}`;
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

function resizeNodeToImageAspect(node, img, options = {}) {
    if (!node || !img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return;
    if (node.flags?.collapsed || node.properties?.contentCollapsed === true) return;
    if (node.properties?.toggleAutoFit === false) return;

    const imageRegion = node.layout?.regions?.imageRegion;
    const drawnImageW = Math.floor(Number(imageRegion?.w || 0));
    const currentDrawnImageH = Math.floor(Number(imageRegion?.h || 0));
    if (!(drawnImageW > 0) || !(currentDrawnImageH > 0)) return;

    const aspect = img.naturalWidth / img.naturalHeight;
    const nextDrawnImageH = Math.max(1, drawnImageW / aspect);
    const currentNodeW = Number(node.size?.[0] || node.properties?.nodeSize?.[0] || 0);
    const currentNodeH = Number(node.size?.[1] || node.properties?.nodeSize?.[1] || 0);
    if (!(currentNodeW > 0) || !(currentNodeH > 0)) return;

    const SNAP = Number(node?.getDerpVars?.(node)?.SNAP) || 10;
    const rawNodeH = Math.max(1, currentNodeH + (nextDrawnImageH - currentDrawnImageH));
    const nextNodeH = Math.ceil(rawNodeH / SNAP) * SNAP;
    if (Math.abs(nextNodeH - currentNodeH) < 1) return;

    const bottomY = getNodeBottomY(node);
    const preserveTop = options?.preserveTop === true;
    const topY = Number(node.pos?.[1]) || 0;
    const pinnedAnchor = getImageDeckPinnedAnchor(node);
    // New images preserve bottom; restored workflow images keep saved top/Y.
    setDerpNodeSizeCompat(node, currentNodeW, nextNodeH);
    const snappedBottom = Math.ceil(bottomY / SNAP) * SNAP;
    setDeckNodePos(node, Number(node.pos?.[0]) || 0, preserveTop ? topY : snappedBottom - nextNodeH);
    if (node.properties) node.properties.nodeSize = [currentNodeW, nextNodeH];
    node._preCollapseHeight = nextNodeH;
    if (!preserveTop) restoreImageDeckPinnedAnchor(pinnedAnchor);
    node._imageDeckPinnedAnchor = preserveTop ? null : pinnedAnchor;
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
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

function initDerpImageDeckCore(nodeType) {
    const proto = nodeType.prototype;
    const baseOnExecuted = proto.onExecuted;

    proto.preloadDerpImageDeckUrl = function(url, requestId) {
        if (!url) return;
        const img = new Image();
        img.onload = () => {
            if (this._derpImageDeckPendingLoadId !== requestId) return;
            this._derpImageDeckFailedUrl = null;
            const useAnim = window.xcpDerpSettings?.useAnimations !== false;
            const hadPrevious = typeof this._derpImageDeckDisplayUrl === "string" && this._derpImageDeckDisplayUrl.length > 0;
            if (useAnim && hadPrevious && this._derpImageDeckDisplayUrl !== url) {
                this._derpImageDeckPrevDisplayUrl = this._derpImageDeckDisplayUrl;
                this._derpImageDeckCrossfadeFrom = 0;
                this._derpImageDeckCrossfading = true;
            } else {
                this._derpImageDeckPrevDisplayUrl = null;
                this._derpImageDeckCrossfading = false;
                this._derpImageDeckCrossfadeFrom = 1;
            }
            this._derpImageDeckDisplayUrl = url;
            this._derpImageDeckPendingLoadId = null;
            const preserveTop = this._derpImageDeckRestoringState === true;
            this._derpImageDeckRestoringState = false;
            resizeNodeToImageAspect(this, img, { preserveTop });
            this._layoutMapHash = null;
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
            if (this._imageDeckPinnedAnchor) {
                const pinnedAnchor = this._imageDeckPinnedAnchor;
                restoreImageDeckPinnedAnchor(pinnedAnchor);
                requestAnimationFrame(() => {
                    restoreImageDeckPinnedAnchor(pinnedAnchor);
                    if (typeof this.syncUncleSlots === "function") this.syncUncleSlots();
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
                });
            }
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        };
        img.onerror = () => {
            if (this._derpImageDeckPendingLoadId !== requestId) return;
            this._derpImageDeckPendingLoadId = null;
            this._derpImageDeckFailedUrl = url;
            this._derpImageDeckDisplayUrl = null;
            this._derpImageDeckPrevDisplayUrl = null;
            this._derpImageDeckCrossfading = false;
            this._derpImageDeckCrossfadeFrom = 1;
            this._layoutMapHash = null;
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        };
        img.src = url;
    };

    proto.syncDerpImageDeckDisplayUrl = function() {
        const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
        clampPreviewIndex(this);
        const current = list[this._derpImageDeckIndex] || null;
        const targetUrl = buildComfyImageUrl(current);

        if (!targetUrl) {
            this._derpImageDeckFailedUrl = null;
            this._derpImageDeckDisplayUrl = null;
            this._derpImageDeckPrevDisplayUrl = null;
            this._derpImageDeckCrossfading = false;
            this._derpImageDeckCrossfadeFrom = 1;
            this._derpImageDeckPendingLoadId = null;
            return;
        }

        if (this._derpImageDeckDisplayUrl === targetUrl) return;
        if (this._derpImageDeckFailedUrl === targetUrl) return;

        const requestId = `${Date.now()}_${Math.random()}`;
        this._derpImageDeckPendingLoadId = requestId;
        this.preloadDerpImageDeckUrl(targetUrl, requestId);
    };

    proto.applyDerpImageDeckList = function(list) {
        if (!Array.isArray(list) || list.length === 0) return;
        const nextHash = getImageDeckListFingerprint(list);
        if (this._lastWirelessImageHash === nextHash) return;

        this._lastWirelessImageHash = nextHash;
        this._derpImageDeckFailedUrl = null;
        this._derpImageDeckList = list;
        this._derpImageDeckIndex = list.length - 1;
        this.syncDerpImageDeckDisplayUrl();
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
        this.applyDerpImageDeckList(list);
    };

    proto.getDerpImageDeckCurrentUrl = function() {
        if (typeof this._derpImageDeckDisplayUrl === "string" && this._derpImageDeckDisplayUrl.length > 0) {
            return this._derpImageDeckDisplayUrl;
        }

        const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
        if (list.length <= 0) return null;

        // First image on a fresh node should preload, then swap without a blank frame.
        this.syncDerpImageDeckDisplayUrl();
        return null;
    };

    proto.getDerpImageDeckCrossfadeAlpha = function() {
        if (!this._derpImageDeckCrossfading) return 1;
        const current = Math.max(0, Math.min(1, Number(this._derpImageDeckCrossfadeFrom || 0)));
        const useAnim = window.xcpDerpSettings?.useAnimations !== false;
        const alphaRes = animateAlpha(current, 1, IMAGE_DECK_CROSSFADE_ALPHA_SPEED, useAnim);
        const next = Math.max(0, Math.min(1, Number(alphaRes.value || 0)));
        this._derpImageDeckCrossfadeFrom = next;

        if (!alphaRes.isAnimating || (1 - next) <= IMAGE_DECK_CROSSFADE_END_EPSILON) {
            this._derpImageDeckCrossfading = false;
            this._derpImageDeckPrevDisplayUrl = null;
            return 1;
        }
        return next;
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
        this.applyDerpImageDeckList(list);
    };
}

export { initDerpImageDeckCore };
