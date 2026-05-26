/**
 * PROJECT: xcpDerpNodes
 * PATH: ./herbina/masterPainterHTML.js
 * PURPOSE: High-fidelity CSS translation of Derp Theme data.
 */

import { toRGBA } from "./utils/colorMath.js";

export const DERP_HTML_CORNER_SCALE = 1.0;
export const DERP_HTML_BLUR_FACTOR = 2.0;
export const DERP_HTML_ALPHA_FACTOR = 0.7;
export const DERP_HTML_OFFSET_FACTOR = 1.5;

function normalizeCornerRadii(corners) {
    const clamp = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        const mag = Math.max(0, Math.abs(num));
        return num < 0 ? -mag : mag;
    };

    if (Array.isArray(corners)) {
        const normalized = corners.slice(0, 4).map(clamp);
        if (normalized.length === 0) return [0, 0, 0, 0];
        if (normalized.length === 1) return [normalized[0], normalized[0], normalized[0], normalized[0]];
        while (normalized.length < 4) normalized.push(normalized[normalized.length - 1]);
        return normalized;
    }

    const single = clamp(corners);
    return [single, single, single, single];
}

function buildChamferClipPath(corners) {
    const [tl, tr, br, bl] = corners;
    const oTL = Math.abs(tl);
    const oTR = Math.abs(tr);
    const oBR = Math.abs(br);
    const oBL = Math.abs(bl);

    const points = [
        `${oTL}px 0px`,
        `calc(100% - ${oTR}px) 0px`,
        `100% ${oTR}px`,
        `100% calc(100% - ${oBR}px)`,
        `calc(100% - ${oBR}px) 100%`,
        `${oBL}px 100%`,
        `0px calc(100% - ${oBL}px)`,
        `0px ${oTL}px`,
    ];

    return `polygon(${points.join(", ")})`;
}

export function applyHTMLCornerGeometry(el, cornersInput, scale = 1.0, cornerScale = DERP_HTML_CORNER_SCALE) {
    if (!el) return;
    const corners = normalizeCornerRadii(cornersInput || 0);
    const scaledCorners = corners.map((corner) => corner * scale * cornerScale);
    const hasChamfer = scaledCorners.some((corner) => corner < 0);

    el.style.borderRadius = `${Math.max(0, scaledCorners[0])}px ${Math.max(0, scaledCorners[1])}px ${Math.max(0, scaledCorners[2])}px ${Math.max(0, scaledCorners[3])}px`;
    if (hasChamfer) {
        const clipPath = buildChamferClipPath(scaledCorners);
        el.style.clipPath = clipPath;
        el.style.webkitClipPath = clipPath;
    } else {
        el.style.clipPath = "none";
        el.style.webkitClipPath = "none";
    }
}

// Helper to safely multiply the alpha of an already-compiled rgba() string
function scaleAlpha(colorStr, factor) {
    if (!colorStr) return "transparent";
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        const r = match[1];
        const g = match[2];
        const b = match[3];
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
        return `rgba(${r}, ${g}, ${b}, ${a * factor})`;
    }
    return colorStr;
}

function buildBoxShadowLayer(effect, scale, alphaFactor, blurFactor, offsetFactor, inset = false) {
    if (!effect) return null;
    const offX = (Number(effect.offsetX) || 0) * offsetFactor * scale;
    const offY = (Number(effect.offsetY) || 0) * offsetFactor * scale;
    const blur = Math.max(0, (Number(effect.blur) || 0) * blurFactor * scale);
    const color = scaleAlpha(effect.color, alphaFactor);
    return `${inset ? "inset " : ""}${offX}px ${offY}px ${blur}px ${color}`;
}

function buildDropShadowLayer(effect, scale, alphaFactor, blurFactor, offsetFactor) {
    if (!effect) return null;
    const offX = (Number(effect.offsetX) || 0) * offsetFactor * scale;
    const offY = (Number(effect.offsetY) || 0) * offsetFactor * scale;
    const blur = Math.max(0, (Number(effect.blur) || 0) * blurFactor * scale);
    const color = scaleAlpha(effect.color, alphaFactor);
    return `drop-shadow(${offX}px ${offY}px ${blur}px ${color})`;
}

function getElementTransformScale(el) {
    if (!el || !el.style) return 1;
    const t = el.style.transform || "";
    const m = t.match(/scale\(([-+]?\d*\.?\d+)\)/);
    if (!m) return 1;
    const s = Number(m[1]);
    return Number.isFinite(s) && s > 0 ? s : 1;
}

/**
 * applyHTMLTheme: Maps compiled paintData onto a DOM element.
 * @param {HTMLElement} el - The target DOM element.
 * @param {Object} paintData - The compiled theme object from masterPainter.js.
 * @param {number} scale - Current canvas zoom scale for coordinate adjustments.
 */
export function applyHTMLTheme(el, paintData, scale = 1.0) {
    if (!el || !paintData) return;

    const transformScale = getElementTransformScale(el);
    const effectiveScale = (Number(scale) || 1) * transformScale;

    const corners = normalizeCornerRadii(paintData.corners || 0);
    const glow = paintData.glow;
    const border = paintData.border;
    const shadow = paintData.shadow;

    // 1. BASE GEOMETRY
    // Use raw scale for corners — CSS transform already handles visual scaling of border-radius
    applyHTMLCornerGeometry(el, corners, scale);

    el.style.backgroundColor = Array.isArray(paintData.fill) ? toRGBA(paintData.fill) : (paintData.fill || "transparent");

    // 2. SHADOW & GLOW LOGIC (Multi-Layer Box Shadows)
    const shadowLayers = [];
    const dropShadowLayers = [];
    const hasChamfer = corners.some((corner) => Number(corner) < 0);

    // --- Standard Shadow Layer with 3-state clipping ---
    const shadowClip = paintData.shadowClip || "c_shadowNone";
    if (shadow) {
        if (shadowClip === "c_shadowInside") {
            const layer = buildBoxShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, true);
            if (layer) shadowLayers.push(layer);
        } else if (shadowClip === "c_shadowOutside") {
            if (hasChamfer) {
                const layer = buildDropShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR);
                if (layer) dropShadowLayers.push(layer);
            } else {
                const layer = buildBoxShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, false);
                if (layer) shadowLayers.push(layer);
            }
        } else {
            const outerLayer = hasChamfer
                ? null
                : buildBoxShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, false);
            const innerLayer = buildBoxShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, true);
            if (hasChamfer) {
                const dropLayer = buildDropShadowLayer(shadow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR);
                if (dropLayer) dropShadowLayers.push(dropLayer);
            }
            if (outerLayer) shadowLayers.push(outerLayer);
            if (innerLayer) shadowLayers.push(innerLayer);
        }
    }

    // --- Glow Layer with 3-state clipping ---
    const glowClip = paintData.glowClip || "c_glowNone";

    // Reset masking state before re-evaluation
    el.style.webkitMaskImage = "none";
    el.style.maskImage = "none";

    if (glow) {
        if (glowClip === "c_glowInside") {
            const layer = buildBoxShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, true);
            if (layer) shadowLayers.push(layer);
        } else if (glowClip === "c_glowOutside") {
            if (hasChamfer) {
                const layer = buildDropShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR);
                if (layer) dropShadowLayers.push(layer);
            } else {
                const layer = buildBoxShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, false);
                if (layer) shadowLayers.push(layer);
            }
        } else {
            const outerLayer = hasChamfer
                ? null
                : buildBoxShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, false);
            const innerLayer = buildBoxShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR, true);
            if (hasChamfer) {
                const dropLayer = buildDropShadowLayer(glow, scale, DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_OFFSET_FACTOR);
                if (dropLayer) dropShadowLayers.push(dropLayer);
            }
            if (outerLayer) shadowLayers.push(outerLayer);
            if (innerLayer) shadowLayers.push(innerLayer);
        }
    }

    const needsOutsideShadow =
        shadowClip === "c_shadowOutside" ||
        shadowClip === "c_shadowNone" ||
        glowClip === "c_glowOutside" ||
        glowClip === "c_glowNone";
    el.style.overflow = needsOutsideShadow ? "visible" : "hidden";

    // 3. STROKE (BORDER) LOGIC
    if (border) {
        const bW = border.width * scale;
        const bColor = border.color;
        const placement = border.placement ?? 0; // 0=Center, 1=Inside, 2=Outside

        if (hasChamfer) {
            // Chamfer corners: all placements use drop-shadow — CSS border/box-shadow don't follow clip-path
            el.style.border = "none";
            dropShadowLayers.push(`0 0 0 ${bW}px ${bColor}`);
        } else if (placement === 1) { // INSIDE
            el.style.border = "none";
            shadowLayers.push(`inset 0 0 0 ${bW}px ${bColor}`);
        } else if (placement === 2) { // OUTSIDE
            el.style.border = "none";
            shadowLayers.push(`0 0 0 ${bW}px ${bColor}`);
        } else { // CENTER (Standard HTML Border)
            el.style.border = `${bW}px solid ${bColor}`;
            el.style.boxSizing = "border-box";
        }
    } else {
        el.style.border = "none";
    }

    // Apply combined shadow layers to the box
    el.style.boxShadow = shadowLayers.join(", ");
    const themeFilter = dropShadowLayers.join(" ");
    el._derpThemeFilter = themeFilter || "none";
    el.style.filter = el._derpThemeFilter;

    // FIX: Ensure text remains crisp. Box shadows should not inherit onto text glyphs.
    el.style.textShadow = "none";

    // 4. FONT SYNC
    if (paintData.font) el.style.fontFamily = `"${paintData.font}"`;
    if (paintData.fontSize) el.style.fontSize = `${paintData.fontSize * scale}px`;
    if (paintData.textColor) el.style.color = paintData.textColor;
}
