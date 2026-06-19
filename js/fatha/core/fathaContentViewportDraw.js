import { masterPainter } from "../../herbina/masterPainter.js";
import {
    FATHA_CONTENT_SCROLLBAR_MIN_THUMB,
    FATHA_CONTENT_SCROLLBAR_WIDTH,
    getContentViewportForRegion,
    getContentViewportScroll,
    isContentViewportDebugEnabled,
} from "./fathaContentViewport.js";

function numberOr(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

export function getContentViewportDrawInfo(node, regionKey, geometry) {
    const state = getContentViewportForRegion(node, regionKey);
    if (!state?.hasOverflow || !geometry) return null;
    const scrollTop = getContentViewportScroll(node, state.key);
    const clip = state.rect;
    const regionTop = numberOr(geometry.y);
    const regionBottom = regionTop + numberOr(geometry.h);
    const clipTop = numberOr(clip.y);
    const clipBottom = clipTop + numberOr(clip.h);
    if (regionBottom < clipTop - 0.5 || regionTop > clipBottom + scrollTop + 0.5) return { state, scrollTop, clip, hidden: true };
    return { state, scrollTop, clip, hidden: false };
}

export function withContentViewportClip(ctx, node, regionKey, geometry, drawFn) {
    const info = getContentViewportDrawInfo(node, regionKey, geometry);
    if (!info?.state) return drawFn(ctx, geometry, null);
    if (info.hidden) return undefined;
    ctx.save();
    ctx.beginPath();
    ctx.rect(info.clip.x, info.clip.y, info.clip.w, info.clip.h);
    ctx.clip();
    const shiftedGeometry = { ...geometry, y: numberOr(geometry.y) };
    try {
        return drawFn(ctx, shiftedGeometry, info);
    } finally {
        ctx.restore();
    }
}

export function getContentViewportGeometry(node, regionKey, geometry) {
    const info = getContentViewportDrawInfo(node, regionKey, geometry);
    if (!info?.state || info.hidden) return { geometry, hidden: !!info?.hidden, state: info?.state || null };
    return {
        geometry: { ...geometry, y: numberOr(geometry.y) - info.scrollTop },
        hidden: false,
        state: info.state,
    };
}

export function drawContentViewportScrollbars(ctx, node) {
    const states = Object.values(node?._contentViewportState || {});
    if (!states.length || !ctx) return;
    states.forEach((state) => {
        if (!state?.hasOverflow || !state.rect) return;
        const rect = state.rect;
        const trackH = Math.max(1, rect.h - 4);
        const trackW = FATHA_CONTENT_SCROLLBAR_WIDTH;
        const trackX = rect.x + rect.w + Math.max(0, (state.gutter - trackW) / 2);
        const trackY = rect.y + 2;
        const thumbH = Math.max(FATHA_CONTENT_SCROLLBAR_MIN_THUMB, trackH * (rect.h / Math.max(rect.h, state.fullHeight)));
        const maxThumbTravel = Math.max(0, trackH - thumbH);
        const ratio = state.maxScroll > 0 ? state.scrollTop / state.maxScroll : 0;
        const thumbY = trackY + maxThumbTravel * ratio;

        masterPainter(ctx, {
            posX: trackX,
            posY: trackY,
            width: trackW,
            height: trackH,
            color: "rgba(0,0,0,0.24)",
            paintData: { fill: "rgba(0,0,0,0.24)", corners: [2, 2, 2, 2] },
        });
        masterPainter(ctx, {
            posX: trackX,
            posY: thumbY,
            width: trackW,
            height: thumbH,
            color: "rgba(255,255,255,0.45)",
            paintData: { fill: "rgba(255,255,255,0.45)", corners: [2, 2, 2, 2] },
        });

        if (isContentViewportDebugEnabled()) {
            ctx.save();
            ctx.strokeStyle = "rgba(255, 210, 0, 0.9)";
            ctx.lineWidth = 1;
            ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
            ctx.restore();
        }
    });
}
