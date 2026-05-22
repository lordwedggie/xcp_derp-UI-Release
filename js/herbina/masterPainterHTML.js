/**
 * PROJECT: xcpDerpNodes
 * PATH: ./herbina/masterPainterHTML.js
 * PURPOSE: High-fidelity CSS translation of Derp Theme data.
 */

import { toRGBA } from "./utils/colorMath.js";

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

/**
 * applyHTMLTheme: Maps compiled paintData onto a DOM element.
 * @param {HTMLElement} el - The target DOM element.
 * @param {Object} paintData - The compiled theme object from masterPainter.js.
 * @param {number} scale - Current canvas zoom scale for coordinate adjustments.
 */
export function applyHTMLTheme(el, paintData, scale = 1.0) {
    if (!el || !paintData) return;

    // --- LOCAL TUNING: Adjust these multipliers to match Canvas density ---
    const DERP_BLUR_FACTOR   = 0.5; // Scales the diffusion spread. Lower = Sharper.
    const DERP_ALPHA_FACTOR  = 0.5; // Scales the opacity of the shadow/glow color.
    const DERP_OFFSET_FACTOR = 0.5; // Scales the physical displacement of the effect.

    const corners = normalizeCornerRadii(paintData.corners || 0);
    const glow = paintData.glow;
    const border = paintData.border;
    const shadow = paintData.shadow;
    const hasChamfer = corners.some((corner) => corner < 0);

    // 1. BASE GEOMETRY
    el.style.borderRadius = `${Math.max(0, corners[0]) * scale}px ${Math.max(0, corners[1]) * scale}px ${Math.max(0, corners[2]) * scale}px ${Math.max(0, corners[3]) * scale}px`;
    if (hasChamfer) {
        const scaledCorners = corners.map((corner) => corner * scale);
        const clipPath = buildChamferClipPath(scaledCorners);
        el.style.clipPath = clipPath;
        el.style.webkitClipPath = clipPath;
    } else {
        el.style.clipPath = "none";
        el.style.webkitClipPath = "none";
    }

    el.style.backgroundColor = Array.isArray(paintData.fill) ? toRGBA(paintData.fill) : (paintData.fill || "transparent");

    // 2. SHADOW & GLOW LOGIC (Multi-Layer Box Shadows)
    const shadowLayers = [];

    // --- Standard Shadow Layer with 3-state clipping ---
    const shadowClip = paintData.shadowClip || "c_shadowOutside";
    if (shadow) {
        const sX = (shadow.offsetX * DERP_OFFSET_FACTOR) * scale;
        const sY = (shadow.offsetY * DERP_OFFSET_FACTOR) * scale;
        const sB = (shadow.blur * DERP_BLUR_FACTOR) * scale;

        // THE FIX: Use scaleAlpha to safely modify the pre-compiled string
        const sCol = scaleAlpha(shadow.color, DERP_ALPHA_FACTOR);

        if (shadowClip === "c_shadowInside") {
            shadowLayers.push(`inset ${sX}px ${sY}px ${sB}px ${sCol}`);
        } else {
            shadowLayers.push(`${sX}px ${sY}px ${sB}px ${sCol}`);
        }
    }

    // --- Glow Layer with 3-state clipping ---
    const glowClip = paintData.glowClip || "c_glowOutside";

    // Reset masking and overflow state before re-evaluation
    el.style.overflow = "visible";
    el.style.webkitMaskImage = "none";
    el.style.maskImage = "none";

    if (glow) {
        const gX = (glow.offsetX * DERP_OFFSET_FACTOR) * scale;
        const gY = (glow.offsetY * DERP_OFFSET_FACTOR) * scale;
        const gB = (glow.blur * DERP_BLUR_FACTOR) * scale;

        // THE FIX: Use scaleAlpha to safely modify the pre-compiled string
        const gCol = scaleAlpha(glow.color, DERP_ALPHA_FACTOR);

        if (glowClip === "c_glowInside") {
            // INSIDE: Use inset shadow and hide overflow
            shadowLayers.push(`inset ${gX}px ${gY}px ${gB}px ${gCol}`);
            el.style.overflow = "hidden";
        } else {
            shadowLayers.push(`${gX}px ${gY}px ${gB}px ${gCol}`);
        }
    }

    // 3. STROKE (BORDER) LOGIC
    if (border) {
        const bW = border.width * scale;
        const bColor = border.color; // Border is usually opaque, no need to scale alpha here
        const placement = border.placement ?? 0; // 0=Center, 1=Inside, 2=Outside

        if (placement === 1) { // INSIDE
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

    // FIX: Ensure text remains crisp. Box shadows should not inherit onto text glyphs.
    el.style.textShadow = "none";

    // 4. FONT SYNC
    if (paintData.font) el.style.fontFamily = `"${paintData.font}"`;
    if (paintData.fontSize) el.style.fontSize = `${paintData.fontSize * scale}px`;
    if (paintData.textColor) el.style.color = paintData.textColor;
}
