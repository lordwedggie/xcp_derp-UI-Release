/**
 * Path: ./js/derps/controldeck/core/derpVideoDeck_core.js
 * ROLE: Runtime logic for DerpVideoDeck video preview behavior.
 */
import { animateAlpha } from "../../../herbina/masterAnimator.js";
import { getPinnedVerticalDeckAnchor, restorePinnedVerticalDeckAnchor } from "../../../fatha/core/dockResize.js";
import { applyDeckPressureLayout, isDeckPressureHub, setDeckNodePos } from "../../../fatha/core/masterDockEngine.js";
import { setDerpNodeSizeCompat } from "../../../fatha/core/fathaNode2Compat.js";

// Crossfade alpha interpolation speed (poster swaps).
const VIDEO_DECK_CROSSFADE_ALPHA_SPEED = 0.05;
const VIDEO_DECK_CROSSFADE_END_EPSILON = 0.01;

function getNodeBottomY(node) {
    const y = Number(node?.pos?.[1]) || 0;
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
    return y + h;
}

function getVideoDeckPinnedAnchor(node) {
    const graph = window.app?.graph || node?.graph || null;
    const deckAnchor = getPinnedVerticalDeckAnchor(node, graph);
    if (deckAnchor) return deckAnchor;
    return null;
}

function restoreVideoDeckPinnedAnchor(anchor) {
    if (!anchor) return;
    restorePinnedVerticalDeckAnchor(anchor);
}

function applyDeckPressureLayoutForVideoAutoFit(node, graph, snap) {
    const previousFrameResizeActive = node._deckPressureFrameHeightResizeActive;
    const previousIsResizing = node._isDerpResizing;
    node._deckPressureFrameHeightResizeActive = true;
    node._isDerpResizing = true;
    try {
        applyDeckPressureLayout(node, graph, snap);
    } finally {
        if (previousFrameResizeActive === undefined) delete node._deckPressureFrameHeightResizeActive;
        else node._deckPressureFrameHeightResizeActive = previousFrameResizeActive;
        if (previousIsResizing === undefined) delete node._isDerpResizing;
        else node._isDerpResizing = previousIsResizing;
    }
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

// Same payload shapes as ImageDeck — upstream video nodes also report through
// the `images` key with {filename, subfolder, type} dicts. The optional `poster`
// field rides along untouched.
function parseVideoList(payload) {
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
            subfolder: payload.subfolder || "",
            poster: payload.poster || ""
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

function getVideoDeckListFingerprint(list) {
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
        const poster = String(item.poster || "");
        parts[i] = `${filename}|${type}|${subfolder}|${poster}`;
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

function buildComfyFileUrl(file) {
    if (!file || !file.filename) return null;
    const q = new URLSearchParams();
    q.set("filename", file.filename);
    q.set("type", file.type || "output");
    if (file.subfolder) q.set("subfolder", file.subfolder);
    q.set("v", String(window._xcpDerpSession || Date.now()));
    return `/view?${q.toString()}`;
}

function buildVideoDeckPosterUrl(item) {
    if (!item || !item.poster) return null;
    return buildComfyFileUrl({
        filename: item.poster,
        type: item.type || "temp",
        subfolder: item.subfolder || ""
    });
}

function getMediaDimensions(media) {
    const w = Number(media?.videoWidth || media?.naturalWidth || 0);
    const h = Number(media?.videoHeight || media?.naturalHeight || 0);
    return (w > 0 && h > 0) ? { width: w, height: h } : null;
}

function resizeNodeToVideoAspect(node, media, options = {}) {
    const dims = getMediaDimensions(media);
    if (!node || !dims) return;
    if (node.flags?.collapsed || node.properties?.contentCollapsed === true) return;
    if (node.properties?.toggleAutoFit === false) return;

    const videoRegion = node.layout?.regions?.videoRegion;
    const drawnVideoW = Math.floor(Number(videoRegion?.w || 0));
    const currentDrawnVideoH = Math.floor(Number(videoRegion?.h || 0));
    if (!(drawnVideoW > 0) || !(currentDrawnVideoH > 0)) return;

    const aspect = dims.width / dims.height;
    const nextDrawnVideoH = Math.max(1, drawnVideoW / aspect);
    const currentNodeW = Number(node.size?.[0] || node.properties?.nodeSize?.[0] || 0);
    const currentNodeH = Number(node.size?.[1] || node.properties?.nodeSize?.[1] || 0);
    if (!(currentNodeW > 0) || !(currentNodeH > 0)) return;

    const SNAP = Number(node?.getDerpVars?.(node)?.SNAP) || 10;
    const rawNodeH = Math.max(1, currentNodeH + (nextDrawnVideoH - currentDrawnVideoH));
    const nextNodeH = Math.ceil(rawNodeH / SNAP) * SNAP;
    if (Math.abs(nextNodeH - currentNodeH) < 1) return;

    const bottomY = getNodeBottomY(node);
    const preserveTop = options?.preserveTop === true;
    const topY = Number(node.pos?.[1]) || 0;
    const pinnedAnchor = getVideoDeckPinnedAnchor(node);
    // New videos preserve bottom; restored workflow videos keep saved top/Y.
    setDerpNodeSizeCompat(node, currentNodeW, nextNodeH);
    const snappedBottom = Math.ceil(bottomY / SNAP) * SNAP;
    setDeckNodePos(node, Number(node.pos?.[0]) || 0, preserveTop ? topY : snappedBottom - nextNodeH);
    if (node.properties) node.properties.nodeSize = [currentNodeW, nextNodeH];
    node._preCollapseHeight = nextNodeH;
    if (!preserveTop) restoreVideoDeckPinnedAnchor(pinnedAnchor);
    node._videoDeckPinnedAnchor = preserveTop ? null : pinnedAnchor;
    if (isDeckPressureHub(node)) {
        const graph = window.app?.graph || node.graph || null;
        node._deckPressureActiveUntil = (performance.now?.() || Date.now()) + 1200;
        applyDeckPressureLayoutForVideoAutoFit(node, graph, SNAP);
    }
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
}

function clampPreviewIndex(node) {
    const count = Array.isArray(node._derpVideoDeckList) ? node._derpVideoDeckList.length : 0;
    if (count <= 0) {
        node._derpVideoDeckIndex = 0;
        return;
    }
    if (node._derpVideoDeckIndex < 0) node._derpVideoDeckIndex = 0;
    if (node._derpVideoDeckIndex >= count) node._derpVideoDeckIndex = count - 1;
}

function getDerpVideoDeckVideoEl(node) {
    // The IMAGE_HTML widget caches elements by the compiled region key, which the
    // layout engine forces to the map slot name ("videoRegion") — the `key:` config
    // property is always overwritten (masterLayoutEngine sets `key` after spreading
    // localCfg). The lookup key MUST be the region slot name.
    return node?._videoInstanceCache?.videoRegion || null;
}

function initDerpVideoDeckCore(nodeType) {
    const proto = nodeType.prototype;
    const baseOnExecuted = proto.onExecuted;

    // Commits the display URLs. The <video> element itself is created and owned by the
    // IMAGE_HTML widget at draw time; here we only preload the poster (when present) so
    // aspect-fit and crossfade behave exactly like ImageDeck images.
    proto.preloadDerpVideoDeckItem = function(item, requestId) {
        const videoUrl = item ? buildComfyFileUrl(item) : null;
        if (!videoUrl) return;
        const posterUrl = buildVideoDeckPosterUrl(item);

        const commitUrls = (withPoster) => {
            if (this._derpVideoDeckPendingLoadId !== requestId) return false;
            this._derpVideoDeckFailedUrl = null;
            const useAnim = window.xcpDerpSettings?.useAnimations !== false;
            const hadPrevious = typeof this._derpVideoDeckPosterUrl === "string" && this._derpVideoDeckPosterUrl.length > 0;
            if (useAnim && withPoster && hadPrevious && this._derpVideoDeckPosterUrl !== posterUrl) {
                this._derpVideoDeckPrevPosterUrl = this._derpVideoDeckPosterUrl;
                this._derpVideoDeckCrossfadeFrom = 0;
                this._derpVideoDeckCrossfading = true;
            } else {
                this._derpVideoDeckPrevPosterUrl = null;
                this._derpVideoDeckCrossfading = false;
                this._derpVideoDeckCrossfadeFrom = 1;
            }
            this._derpVideoDeckDisplayUrl = videoUrl;
            this._derpVideoDeckPosterUrl = withPoster ? posterUrl : null;
            this._derpVideoDeckPendingLoadId = null;
            return true;
        };

        const finishCommit = () => {
            this._layoutMapHash = null;
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
            if (this._videoDeckPinnedAnchor) {
                const pinnedAnchor = this._videoDeckPinnedAnchor;
                restoreVideoDeckPinnedAnchor(pinnedAnchor);
                requestAnimationFrame(() => {
                    restoreVideoDeckPinnedAnchor(pinnedAnchor);
                    if (typeof this.syncUncleSlots === "function") this.syncUncleSlots();
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
                });
            }
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        };

        if (!posterUrl) {
            // No poster: commit immediately; aspect resize happens on loadedmetadata.
            if (commitUrls(false)) finishCommit();
            return;
        }

        const img = new Image();
        img.onload = () => {
            if (!commitUrls(true)) return;
            // Poster dims equal video dims (first frame), so this is the authoritative fit.
            const preserveTop = this._derpVideoDeckRestoringState === true;
            this._derpVideoDeckRestoringState = false;
            resizeNodeToVideoAspect(this, img, { preserveTop });
            finishCommit();
        };
        img.onerror = () => {
            if (!commitUrls(false)) return;
            finishCommit();
        };
        img.src = posterUrl;
    };

    proto.syncDerpVideoDeckDisplayUrl = function() {
        const list = Array.isArray(this._derpVideoDeckList) ? this._derpVideoDeckList : [];
        clampPreviewIndex(this);
        const current = list[this._derpVideoDeckIndex] || null;
        const targetUrl = buildComfyFileUrl(current);

        if (!targetUrl) {
            this._derpVideoDeckFailedUrl = null;
            this._derpVideoDeckDisplayUrl = null;
            this._derpVideoDeckPosterUrl = null;
            this._derpVideoDeckPrevPosterUrl = null;
            this._derpVideoDeckCrossfading = false;
            this._derpVideoDeckCrossfadeFrom = 1;
            this._derpVideoDeckPendingLoadId = null;
            return;
        }

        if (this._derpVideoDeckDisplayUrl === targetUrl) return;
        if (this._derpVideoDeckFailedUrl === targetUrl) return;

        const requestId = `${Date.now()}_${Math.random()}`;
        this._derpVideoDeckPendingLoadId = requestId;
        this.preloadDerpVideoDeckItem(current, requestId);
    };

    proto.applyDerpVideoDeckList = function(list) {
        if (!Array.isArray(list) || list.length === 0) return;
        const nextHash = getVideoDeckListFingerprint(list);
        if (this._lastWirelessVideoHash === nextHash) return;

        this._lastWirelessVideoHash = nextHash;
        if (this.properties) this.properties.videoDeckFilenameOverride = "";
        this._derpVideoDeckFailedUrl = null;
        this._derpVideoDeckList = list;
        this._derpVideoDeckIndex = list.length - 1;
        this.syncDerpVideoDeckDisplayUrl();
        this._layoutMapHash = null;

        if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
        if (typeof this.requestDerpSync === "function") this.requestDerpSync();
    };

    proto.onExecuted = function(payload) {
        if (typeof baseOnExecuted === "function") {
            baseOnExecuted.call(this, payload);
        }

        const list = parseVideoList(payload);
        if (list.length === 0) return;
        this.applyDerpVideoDeckList(list);
    };

    proto.getDerpVideoDeckCurrentUrl = function() {
        if (typeof this._derpVideoDeckDisplayUrl === "string" && this._derpVideoDeckDisplayUrl.length > 0) {
            return this._derpVideoDeckDisplayUrl;
        }

        const list = Array.isArray(this._derpVideoDeckList) ? this._derpVideoDeckList : [];
        if (list.length <= 0) return null;

        // First video on a fresh node should preload, then swap without a blank frame.
        this.syncDerpVideoDeckDisplayUrl();
        return null;
    };

    proto.getDerpVideoDeckPosterUrl = function() {
        return (typeof this._derpVideoDeckPosterUrl === "string" && this._derpVideoDeckPosterUrl.length > 0)
            ? this._derpVideoDeckPosterUrl
            : null;
    };

    proto.getDerpVideoDeckCrossfadeAlpha = function() {
        if (!this._derpVideoDeckCrossfading) return 1;
        const current = Math.max(0, Math.min(1, Number(this._derpVideoDeckCrossfadeFrom || 0)));
        const useAnim = window.xcpDerpSettings?.useAnimations !== false;
        const alphaRes = animateAlpha(current, 1, VIDEO_DECK_CROSSFADE_ALPHA_SPEED, useAnim);
        const next = Math.max(0, Math.min(1, Number(alphaRes.value || 0)));
        this._derpVideoDeckCrossfadeFrom = next;

        if (!alphaRes.isAnimating || (1 - next) <= VIDEO_DECK_CROSSFADE_END_EPSILON) {
            this._derpVideoDeckCrossfading = false;
            this._derpVideoDeckPrevPosterUrl = null;
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

    // Wireless VIDEO receiver path.
    proto.syncDerpOutputs = function() {
        const ids = this.properties.multiSignalIds || {};
        const signalId = ids[0] || ids["0"];
        if (!signalId) return;

        const sig = resolveSignalById(signalId);
        if (!sig) return;

        let list = parseVideoList(sig.value);
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromNodeOutputs(signalId);
        }
        if (!Array.isArray(list) || list.length === 0) {
            list = resolvePreviewFromSourceNode(signalId);
        }
        if (!Array.isArray(list) || list.length === 0) return;
        this.applyDerpVideoDeckList(list);
    };
}

export { initDerpVideoDeckCore, resizeNodeToVideoAspect, getDerpVideoDeckVideoEl };
