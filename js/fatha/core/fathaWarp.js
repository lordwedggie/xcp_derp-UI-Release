import { app } from "../../../../scripts/app.js";
import { startAnimatorChannel, stopAnimatorChannel, isAnimatorChannelActive } from "../../herbina/masterAnimator.js";
import { getWarpTravelSpeed } from "../../masterSettings.js";

// Warp tuning knobs:
// - WARP_TRAVEL_SPEED controls how quickly camera reaches target.
//   Higher number = faster travel (shorter duration). Lower number = slower travel.
// - WARP_SLOWDOWN_FACTOR controls how strongly warp eases out near the end.
//   Higher number = stronger slow-down near destination. Lower number = more linear feel.
const WARP_TRAVEL_SPEED = 1.0;
const WARP_SLOWDOWN_FACTOR = 3.0;

const DEFAULTS = {
    durationMs: 280,
    easing: "easeOutCubic",
    positionEpsilon: 0.5,
    zoomEpsilon: 0.001,
    minZoom: 0.1,
    maxZoom: 4,
    padding: 24,
    viewportMargin: 8,
    topUiCompensation: 0,
};

let activeWarp = null;
const WARP_CHANNEL_ID = "camera-warp";

function nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function getCanvasAndDs() {
    const canvas = app?.canvas;
    const ds = canvas?.ds;
    if (!canvas || !ds || !Array.isArray(ds.offset)) return null;
    return { canvas, ds };
}

function getCanvasSize(canvas) {
    const c = canvas.canvas;
    // Use on-screen canvas rect first so centering is based on visible browser canvas area,
    // not full window/screen and not DPR-scaled backing-store pixels.
    const rect = c?.getBoundingClientRect?.();
    const width = Number(rect?.width) || Number(c?.clientWidth) || Number(c?.width) || 1;
    const height = Number(rect?.height) || Number(c?.clientHeight) || Number(c?.height) || 1;
    return { width, height };
}

function getCurrentView() {
    const refs = getCanvasAndDs();
    if (!refs) return null;
    const { canvas, ds } = refs;
    return {
        canvas,
        ds,
        x: Number(ds.offset[0]) || 0,
        y: Number(ds.offset[1]) || 0,
        zoom: Number(ds.scale) || 1,
    };
}

function setView(x, y, zoom) {
    const refs = getCanvasAndDs();
    if (!refs) return false;
    const { canvas, ds } = refs;
    ds.offset[0] = x;
    ds.offset[1] = y;
    ds.scale = zoom;
    if (typeof canvas.setDirty === "function") canvas.setDirty(true, true);
    return true;
}

function screenCenterFor(canvas) {
    const { width, height } = getCanvasSize(canvas);
    return { cx: width * 0.5, cy: height * 0.5 };
}

function offsetToCenterWorldPoint(worldX, worldY, zoom, canvas) {
    const { cx, cy } = screenCenterFor(canvas);
    return {
        // LiteGraph camera mapping is: screen = (world + offset) * scale
        // so centered offset must be computed in world-space, not scaled pixels.
        x: (cx / Math.max(0.000001, zoom)) - worldX,
        y: (cy / Math.max(0.000001, zoom)) - worldY,
    };
}

function easingValue(t, easingName) {
    const x = clamp(t, 0, 1);
    const easePow = Math.max(1.0, Number(WARP_SLOWDOWN_FACTOR) || 1.0);
    if (easingName === "linear") return x;
    if (easingName === "easeOutQuad") return 1 - ((1 - x) * (1 - x));
    if (easingName === "easeInOutCubic") {
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }
    return 1 - Math.pow(1 - x, easePow);
}

function lerp(a, b, t) {
    return a + ((b - a) * t);
}

function resolveAnimatedFlag(options = {}) {
    if (typeof options.animated === "boolean") return options.animated;
    return window?.DERP_GLOBAL_SETTINGS?.useAnimation !== false;
}

function normalizeTargetZoom(zoom, currentZoom, options = {}) {
    if (!Number.isFinite(zoom)) return currentZoom;
    const minZoom = Number.isFinite(options.minZoom) ? options.minZoom : DEFAULTS.minZoom;
    const maxZoom = Number.isFinite(options.maxZoom) ? options.maxZoom : DEFAULTS.maxZoom;
    return clamp(zoom, minZoom, maxZoom);
}

function getNodeRect(node) {
    if (!node) return null;
    const x = Number(node?.pos?.[0]);
    const y = Number(node?.pos?.[1]);
    const w = Number(node?.size?.[0] ?? node?.properties?.nodeSize?.[0]);
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
        x,
        y,
        w: Number.isFinite(w) ? w : 0,
        h: Number.isFinite(h) ? h : 0,
    };
}

function getNodeScreenRect(node) {
    const nodeRect = getNodeRect(node);
    const refs = getCanvasAndDs();
    if (!nodeRect || !refs) return null;
    const { canvas, ds } = refs;
    const canvasRect = canvas.canvas?.getBoundingClientRect?.();
    if (!canvasRect) return null;
    const scale = Number(ds.scale) || 1;
    return {
        left: canvasRect.left + ((nodeRect.x + (Number(ds.offset[0]) || 0)) * scale),
        top: canvasRect.top + ((nodeRect.y + (Number(ds.offset[1]) || 0)) * scale),
        width: Math.max(1, nodeRect.w * scale),
        height: Math.max(1, nodeRect.h * scale),
    };
}

function centerOfRect(rect) {
    return {
        x: rect.x + (rect.w * 0.5),
        y: rect.y + (rect.h * 0.5),
    };
}

function getWorldCenterFromView(view) {
    const { cx, cy } = screenCenterFor(view.canvas);
    const offX = Number(view.x) || 0;
    const offY = Number(view.y) || 0;
    const zoom = Math.max(0.000001, Number(view.zoom) || 1);
    return {
        // LiteGraph mapping: screen = (world + offset) * scale
        // => world = (screen / scale) - offset
        x: (cx / zoom) - offX,
        y: (cy / zoom) - offY,
    };
}

function normalizeScreenRect(rectLike) {
    if (!rectLike) return null;
    const left = Number(rectLike.left);
    const top = Number(rectLike.top);
    const width = Number(rectLike.width);
    const height = Number(rectLike.height);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
    return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
    };
}

function computeViewportDeltaForRect(rect, options = {}) {
    const margin = Number.isFinite(options.viewportMargin) ? options.viewportMargin : DEFAULTS.viewportMargin;
    const topUiCompensation = Number.isFinite(options.topUiCompensation)
        ? options.topUiCompensation
        : DEFAULTS.topUiCompensation;

    // Fit against the visible ComfyUI canvas viewport, not full browser window/screen.
    const canvasRect = app?.canvas?.canvas?.getBoundingClientRect?.();
    if (!canvasRect) return { dx: 0, dy: 0, fits: true };

    const minX = canvasRect.left + margin;
    const maxX = Math.max(minX, canvasRect.right - margin);
    const minY = canvasRect.top + margin;
    const maxY = Math.max(minY, canvasRect.bottom - margin);

    let dx = 0;
    let dy = 0;

    if (rect.left < minX) dx = minX - rect.left;
    else if (rect.right > maxX) dx = maxX - rect.right;

    if (rect.top < minY) {
        dy = (minY - rect.top) + Math.max(0, topUiCompensation);
    }
    else if (rect.bottom > maxY) dy = maxY - rect.bottom;

    const axis = options.axis === "x" || options.axis === "y" ? options.axis : null;
    if (axis === "x") dy = 0;
    if (axis === "y") dx = 0;

    return { dx, dy, fits: Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 };
}

function fitZoomForRect(rect, canvas, options = {}) {
    const padding = Number.isFinite(options.padding) ? options.padding : DEFAULTS.padding;
    const minZoom = Number.isFinite(options.minZoom) ? options.minZoom : DEFAULTS.minZoom;
    const maxZoom = Number.isFinite(options.maxZoom) ? options.maxZoom : DEFAULTS.maxZoom;
    const { width, height } = getCanvasSize(canvas);
    const targetW = Math.max(1, rect.w + (padding * 2));
    const targetH = Math.max(1, rect.h + (padding * 2));
    const zoomX = width / targetW;
    const zoomY = height / targetH;
    return clamp(Math.min(zoomX, zoomY), minZoom, maxZoom);
}

function cancelActiveWarp(reason = "cancelled") {
    if (!activeWarp) return false;
    activeWarp.cancelled = true;
    activeWarp.cancelReason = reason;
    stopAnimatorChannel(WARP_CHANNEL_ID);
    activeWarp = null;
    return true;
}

function applyInstantWarp(target, view, options = {}) {
    const zoom = normalizeTargetZoom(target.zoom, view.zoom, options);
    const offset = offsetToCenterWorldPoint(target.worldX, target.worldY, zoom, view.canvas);
    return setView(offset.x, offset.y, zoom);
}

function applyAnimatedWarp(target, view, options = {}) {
    const speed = Math.max(0.05, Number(options.travelSpeed) || getWarpTravelSpeed());
    const durationBase = Math.max(16, Number(options.durationMs) || DEFAULTS.durationMs);
    const durationMs = Math.max(16, durationBase / speed);
    const easing = String(options.easing || DEFAULTS.easing);
    const positionEpsilon = Number.isFinite(options.positionEpsilon) ? options.positionEpsilon : DEFAULTS.positionEpsilon;
    const zoomEpsilon = Number.isFinite(options.zoomEpsilon) ? options.zoomEpsilon : DEFAULTS.zoomEpsilon;

    const startX = view.x;
    const startY = view.y;
    const startZoom = view.zoom;

    const finalZoom = normalizeTargetZoom(target.zoom, startZoom, options);
    const finalOffset = offsetToCenterWorldPoint(target.worldX, target.worldY, finalZoom, view.canvas);

    const warp = {
        cancelled: false,
        cancelReason: null,
        startedAt: nowMs(),
    };
    activeWarp = warp;

    startAnimatorChannel(WARP_CHANNEL_ID, () => {
        if (!activeWarp || warp.cancelled || activeWarp !== warp) return false;

        const elapsed = nowMs() - warp.startedAt;
        const t = clamp(elapsed / durationMs, 0, 1);
        const k = easingValue(t, easing);

        const nextX = lerp(startX, finalOffset.x, k);
        const nextY = lerp(startY, finalOffset.y, k);
        const nextZoom = lerp(startZoom, finalZoom, k);
        setView(nextX, nextY, nextZoom);

        const doneByTime = t >= 1;
        const dx = Math.abs(finalOffset.x - nextX);
        const dy = Math.abs(finalOffset.y - nextY);
        const dz = Math.abs(finalZoom - nextZoom);
        const doneByError = dx <= positionEpsilon && dy <= positionEpsilon && dz <= zoomEpsilon;

        if (doneByTime || doneByError) {
            setView(finalOffset.x, finalOffset.y, finalZoom);
            if (activeWarp === warp) activeWarp = null;
            return false;
        }
        return true;
    });
    return true;
}

function performWarp(target, options = {}) {
    const view = getCurrentView();
    if (!view) return false;

    cancelActiveWarp("replaced");

    const animated = resolveAnimatedFlag(options);
    if (!animated) return applyInstantWarp(target, view, options);
    return applyAnimatedWarp(target, view, options);
}

export function warpToPoint({ worldX, worldY, zoom = null } = {}, options = {}) {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return false;
    return performWarp({ worldX, worldY, zoom }, options);
}

export function warpToNode(node, options = {}) {
    const rect = getNodeRect(node);
    if (!rect) return false;

    const center = centerOfRect(rect);
    const zoomMode = options.zoomMode || "keep";
    let zoom = null;

    if (zoomMode === "fit") {
        const view = getCurrentView();
        if (!view) return false;
        zoom = fitZoomForRect(rect, view.canvas, options);
    } else if (zoomMode === "absolute" && Number.isFinite(options.targetZoom)) {
        zoom = options.targetZoom;
    }

    return performWarp({ worldX: center.x, worldY: center.y, zoom }, options);
}

export function warpToRect(rect, options = {}) {
    if (!rect || !Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rect.w) || !Number.isFinite(rect.h)) {
        return false;
    }
    const center = centerOfRect(rect);
    const view = getCurrentView();
    if (!view) return false;

    const zoomMode = options.zoomMode || "fit";
    let zoom = null;
    if (zoomMode === "fit") {
        zoom = fitZoomForRect(rect, view.canvas, options);
    } else if (zoomMode === "absolute" && Number.isFinite(options.targetZoom)) {
        zoom = options.targetZoom;
    }

    return performWarp({ worldX: center.x, worldY: center.y, zoom }, options);
}

export function warpByScreenDelta(dx, dy, options = {}) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;

    const view = getCurrentView();
    if (!view) return false;

    const center = getWorldCenterFromView(view);
    const targetWorldX = center.x - (dx / Math.max(0.000001, view.zoom));
    const targetWorldY = center.y - (dy / Math.max(0.000001, view.zoom));
    return performWarp({ worldX: targetWorldX, worldY: targetWorldY, zoom: view.zoom }, options);
}

export function ensureScreenRectVisible(rectLike, options = {}) {
    const rect = normalizeScreenRect(rectLike);
    if (!rect) return false;

    const { dx, dy, fits } = computeViewportDeltaForRect(rect, options);
    if (fits) return false;
    return warpByScreenDelta(dx, dy, options);
}

export function ensureElementVisibleInViewport(element, options = {}) {
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const followFrames = Math.max(0, Number(options.followFrames) || 0);

    const run = () => {
        const rect = element.getBoundingClientRect();
        return ensureScreenRectVisible(rect, options);
    };

    let warped = run();
    if (followFrames <= 0) return warped;

    let frame = 0;
    const loop = () => {
        frame += 1;
        const didWarp = run();
        warped = warped || didWarp;
        if (frame < followFrames) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return warped;
}

export function ensureNodeVisibleInViewport(node, options = {}) {
    if (!node) return false;
    const followFrames = Math.max(0, Number(options.followFrames) || 0);

    const run = () => {
        const rect = getNodeScreenRect(node);
        return ensureScreenRectVisible(rect, options);
    };

    let warped = run();
    if (followFrames <= 0) return warped;

    let frame = 0;
    const loop = () => {
        frame += 1;
        const didWarp = run();
        warped = warped || didWarp;
        if (frame < followFrames) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return warped;
}

export function cancelWarp(reason = "cancelled") {
    return cancelActiveWarp(reason);
}

export function isWarping() {
    return !!activeWarp || isAnimatorChannelActive(WARP_CHANNEL_ID);
}