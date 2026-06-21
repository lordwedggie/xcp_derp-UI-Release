import {
    FATHA_CONTENT_SCROLLBAR_MIN_THUMB,
    FATHA_CONTENT_SCROLLBAR_WIDTH,
    mapPointThroughContentViewport,
    requestContentViewportRedraw,
    scrollContentViewport,
    setContentViewportScroll,
    getContentViewportScroll,
} from "./fathaContentViewport.js";

export { preserveContentViewportScrollForInteraction } from "./fathaContentViewport.js";

function numberOr(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function getViewportAtLocalPoint(node, localPoint) {
    const states = Object.values(node?._contentViewportState || {});
    return states.find((state) => {
        const rect = state?.rect;
        return state?.hasOverflow && rect && localPoint.x >= rect.x && localPoint.x <= rect.x + rect.w + (state.gutter || 0) && localPoint.y >= rect.y && localPoint.y <= rect.y + rect.h;
    }) || null;
}

function getScrollbarRects(node, state) {
    if (!state?.hasOverflow || !state.rect) return null;
    const rect = state.rect;
    const trackH = Math.max(1, rect.h - 4);
    const trackW = FATHA_CONTENT_SCROLLBAR_WIDTH;
    const trackX = rect.x + rect.w + Math.max(0, (state.gutter - trackW) / 2);
    const trackY = rect.y + 2;
    const thumbH = Math.max(FATHA_CONTENT_SCROLLBAR_MIN_THUMB, trackH * (rect.h / Math.max(rect.h, state.fullHeight)));
    const maxThumbTravel = Math.max(0, trackH - thumbH);
    const effectiveScrollTop = getContentViewportScroll(node, state.key);
    const ratio = state.maxScroll > 0 ? effectiveScrollTop / state.maxScroll : 0;
    const thumbY = trackY + maxThumbTravel * ratio;
    return {
        track: { x: trackX, y: trackY, w: trackW, h: trackH },
        thumb: { x: trackX, y: thumbY, w: trackW, h: thumbH },
    };
}

function pointInRect(point, rect) {
    return !!(point && rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h);
}

export function mapShieldPointThroughContentViewport(node, point) {
    return mapPointThroughContentViewport(node, point);
}

export function handleContentViewportWheel(node, localPoint, event) {
    const state = getViewportAtLocalPoint(node, localPoint);
    if (!state) return false;
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    scrollContentViewport(node, state.key, numberOr(event.deltaY, 0));
    requestContentViewportRedraw(node);
    return true;
}

export function tryStartContentViewportScrollbarDrag(node, localPoint, event, getLocalCoords) {
    const state = getViewportAtLocalPoint(node, localPoint);
    const rects = getScrollbarRects(node, state);
    if (!state || !rects || !pointInRect(localPoint, rects.track)) return false;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();

    if (!pointInRect(localPoint, rects.thumb)) {
        const trackLocalY = Math.max(0, Math.min(rects.track.h, localPoint.y - rects.track.y));
        const ratio = trackLocalY / Math.max(1, rects.track.h);
        setContentViewportScroll(node, state.key, state.maxScroll * ratio);
        requestContentViewportRedraw(node);
    }

    const startY = event.clientY;
    const startScroll = state.scrollTop;
    const pointerId = event.pointerId;
    const trackTravel = Math.max(1, rects.track.h - rects.thumb.h);

    const onMove = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        const dsScale = numberOr(window.app?.canvas?.ds?.scale, 1) || 1;
        const deltaGraphY = (moveEvent.clientY - startY) / dsScale;
        const next = startScroll + (deltaGraphY / trackTravel) * state.maxScroll;
        setContentViewportScroll(node, state.key, next);
        requestContentViewportRedraw(node);
    };
    const onUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
        requestContentViewportRedraw(node);
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return true;
}
