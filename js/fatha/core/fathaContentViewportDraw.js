import { masterPainter } from "../../herbina/masterPainter.js";
import { resolvePaintData } from "../../herbina/utils/widgetsUtils.js";
import {
    FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH,
    FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT,
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

const FATHA_CONTENT_VIEWPORT_FALLBACK_CLIP_BLEED = 1;

export const FATHA_CONTENT_SCROLLBAR_MARGIN_TOP = 0;
export const FATHA_CONTENT_SCROLLBAR_MARGIN_BOTTOM = 0;

// Unified scrollbar visual constants — shared with derpEditor.js
// These match the original viewport scrollbar geometry.
export const DERP_SCROLLBAR_WIDTH = FATHA_CONTENT_SCROLLBAR_WIDTH; // 2
export const DERP_SCROLLBAR_MIN_THUMB = FATHA_CONTENT_SCROLLBAR_MIN_THUMB; // 14

// Fallback colors when theme resolution is unavailable
const DERP_SCROLLBAR_FALLBACK_TRACK = "rgba(0,0,0,0.24)";
const DERP_SCROLLBAR_FALLBACK_THUMB = "rgba(255,255,255,0.45)";

function resolveScrollbarThemeColors(node) {
    const regionPaint = resolvePaintData(node, "region", "");
    const textPaint = resolvePaintData(node, "t_textSystem", "");
    const trackColor = regionPaint?.fill || DERP_SCROLLBAR_FALLBACK_TRACK;
    const thumbColor = textPaint?.textColor || textPaint?.fill || DERP_SCROLLBAR_FALLBACK_THUMB;
    return { trackColor, thumbColor };
}

function resolveRegionStateSuffix(node, region) {
    const isBypassed = node?.mode === 4 || node?._derpSpoofedBypass;
    const baseState = region?.state === "DIS" ? "DIS" : (region?.state || "OFF");
    const stateStr = isBypassed ? "DIS" : (baseState === "DIS" ? "DIS" : (baseState === "ON" ? "ON" : "OFF"));
    return `_${stateStr}`;
}

function resolveContentViewportClipBleed(node, region) {
    if (!region) return FATHA_CONTENT_VIEWPORT_FALLBACK_CLIP_BLEED;
    const paintData = resolvePaintData(
        node,
        region.themeKey || "region",
        resolveRegionStateSuffix(node, region),
        region.btnColor,
        region.palette
    );
    const border = paintData?.border;
    const borderWidth = Number(border?.width);
    if (!(borderWidth > 0)) return paintData ? 0 : FATHA_CONTENT_VIEWPORT_FALLBACK_CLIP_BLEED;

    const placement = Number(border?.placement ?? 0);
    if (placement === 1) return 0; // Inside border is already fully inside the viewport.
    if (placement === 2) return Math.ceil(borderWidth);
    return Math.ceil(borderWidth / 2);
}

export function getContentViewportDrawInfo(node, regionKey, geometry) {
    const state = getContentViewportForRegion(node, regionKey);
    if (!state?.rect || !geometry) return null;
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
    const region = node?.layout?.regions?.[regionKey];
    const isLineBreak = String(region?.type || "").toLowerCase() === "linebreak";
    const clipBleed = isLineBreak ? 0 : resolveContentViewportClipBleed(node, region);
    const clipX = isLineBreak ? Math.min(info.clip.x, numberOr(geometry?.x)) : info.clip.x - clipBleed;
    const clipW = isLineBreak
        ? Math.max(1, (numberOr(info.clip.x) + numberOr(info.clip.w)) - clipX)
        : info.clip.w + (clipBleed * 2);
    const geometryTop = numberOr(geometry?.y);
    const geometryBottom = geometryTop + numberOr(geometry?.h);
    const clipTop = numberOr(info.clip.y);
    const clipBottom = clipTop + numberOr(info.clip.h);
    const clipBleedTop = (!isLineBreak && geometryTop >= clipTop - 0.5) ? clipBleed : 0;
    const clipBleedBottom = (!isLineBreak && geometryBottom <= clipBottom + 0.5) ? clipBleed : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, clipTop - clipBleedTop, clipW, numberOr(info.clip.h) + clipBleedTop + clipBleedBottom);
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
    const { trackColor, thumbColor } = resolveScrollbarThemeColors(node);
    states.forEach((state) => {
        if (!state?.hasOverflow || !state.rect) return;
        const rect = state.rect;
        const trackH = Math.max(1, rect.h - FATHA_CONTENT_SCROLLBAR_MARGIN_TOP - FATHA_CONTENT_SCROLLBAR_MARGIN_BOTTOM);
        const trackW = FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH;
        const trackX = rect.x + rect.w + FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT;
        const trackY = rect.y + FATHA_CONTENT_SCROLLBAR_MARGIN_TOP;
        const trackCorners = [trackW / 2, trackW / 2, trackW / 2, trackW / 2];
        const thumbH = Math.max(FATHA_CONTENT_SCROLLBAR_MIN_THUMB, trackH * (rect.h / Math.max(rect.h, state.fullHeight)));
        const maxThumbTravel = Math.max(0, trackH - thumbH);
        const effectiveScrollTop = getContentViewportScroll(node, state.key);
        const ratio = state.maxScroll > 0 ? effectiveScrollTop / state.maxScroll : 0;
        const thumbY = trackY + maxThumbTravel * ratio;
        const thumbX = rect.x + rect.w + FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT;
        const thumbCorners = [FATHA_CONTENT_SCROLLBAR_WIDTH / 2, FATHA_CONTENT_SCROLLBAR_WIDTH / 2, FATHA_CONTENT_SCROLLBAR_WIDTH / 2, FATHA_CONTENT_SCROLLBAR_WIDTH / 2];

        masterPainter(ctx, {
            posX: trackX,
            posY: trackY,
            width: trackW,
            height: trackH,
            color: trackColor,
            paintData: { fill: trackColor, corners: trackCorners },
        });
        masterPainter(ctx, {
            posX: thumbX,
            posY: thumbY,
            width: FATHA_CONTENT_SCROLLBAR_WIDTH,
            height: thumbH,
            color: thumbColor,
            paintData: { fill: thumbColor, corners: thumbCorners },
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
