import { masterPainter, compileThemeData } from "../masterPainter.js";
import { resolvePaintData, resolvePaletteEntry, compileAnimatedPaint } from "../utils/widgetsUtils.js";
import { animateWidgetColors, getPulsedColor, parseColor } from "../masterAnimator.js";

export function createDerpRegion(config = {}) {
    return {
        type: "derpRegion",
        themeKey: config.themeKey || "region",
        regionOffset: config.regionOffset || [0, 0, 0, 0]
    };
}

export function syncDerpRegion(ctx, node, config) {
    if (!config.geometry) return;

    let isHovered = false;
    if (config.hoverEffect && node.layout?.regions) {
        let currKey = node._hoveredRegionKey;
        while (currKey && node.layout.regions[currKey]) {
            if (currKey === config.key) {
                isHovered = true;
                break;
            }
            currKey = node.layout.regions[currKey].parentKey;
        }
    }

    const isBypassed = node.mode === 4 || node._derpSpoofedBypass;
    const baseState = config.state === "DIS" ? "DIS" : (config.state || "OFF");
    const stateStr = isBypassed ? "DIS" : (baseState === "DIS" ? "DIS" : (isHovered || baseState === "ON" ? "ON" : "OFF"));
    const suffix = `_${stateStr}`;

    // THE CENTRALIZED PALETTE PRIORITY: Check if a specific palette file/entry is requested
    let paintData = null;
    const palConfig = config.palette;
    if (palConfig) {
        const rawEntry = resolvePaletteEntry(node, palConfig.path, palConfig.entry);
        if (rawEntry?.entries) {
            paintData = compileThemeData({ ...rawEntry.entries.main, _category: "region" }, config.themeKey, stateStr);
        }
    }

    // Fallback 1: Check for manual node-level injections
    if (!paintData && node.themeToEdit && node.themeToEdit[config.themeKey || "region"]) {
        paintData = compileThemeData(node.themeToEdit[config.themeKey || "region"], config.themeKey || "region", stateStr);
    }

    // Fallback 2: Global theme registry
    if (!paintData) {
        paintData = resolvePaintData(node, config.themeKey || "region", suffix, config.btnColor);
    }

    const p = Array.isArray(config.regionOffset) ? config.regionOffset : [0, 0, 0, 0];
    const [pL, pT, pR, pB] = p;

    let rX = config.geometry.x - (pL || 0);
    const rY = config.geometry.y - (pT || 0);
    let rW = config.geometry.w + (pL || 0) + (pR || 0);
    const rH = config.geometry.h + (pT || 0) + (pB || 0);

    // Keep REGION paint inside node horizontal bounds unless explicitly disabled.
    // Drag floaters can intentionally render outside node bounds.
    if (config.ignoreNodeBoundsClamp !== true) {
        const nodeW = Array.isArray(node?.size) ? (node.size[0] || 0) : 0;
        if (nodeW > 0) {
            const right = rX + rW;
            if (rX < 0) rX = 0;
            if (right > nodeW) rW = Math.max(0, nodeW - rX);
        }
    }

    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    if (sysAlpha <= 0) return;

    // THE ANIMATION GATE: Respect global settings, node properties, and local config overrides.
    const { useAnimation: frameworkUseAnim } = node.getDerpVars ? node.getDerpVars(node) : { useAnimation: true };
    const globalUseAnim = window.DERP_GLOBAL_SETTINGS?.useAnimation !== false;
    const useAnim = config.useAnimations !== false && (node.properties?.useAnimations !== false) && frameworkUseAnim !== false && globalUseAnim;

    const animKey = `_derpRegion_anim_${config.key}`;
    const rawBg = paintData?.fill || config.btnColor || "transparent";
    const { fillColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, "transparent", sysAlpha, useAnim);

    ctx.save();
    if (sysAlpha < 1) ctx.globalAlpha *= sysAlpha;

    if (paintData) {
        const animatedPaint = compileAnimatedPaint(paintData, config, sysAlpha, { fill: fillColor, textColor: "transparent" });

        if (config.pulseStates === true && useAnim) {
            const fromState = config.pulseFromState || "_ON";
            const toState = config.pulseToState || "_DIS";
            const fromPaint = resolvePaintData(node, config.themeKey || "region", fromState, config.btnColor) || paintData;
            const toPaint = resolvePaintData(node, config.themeKey || "region", toState, config.btnColor) || paintData;
            const fromBorder = parseColor(fromPaint?.border?.color || "transparent");
            const toBorder = parseColor(toPaint?.border?.color || "transparent");
            const pulsedBorder = getPulsedColor(fromBorder, toBorder, config.pulseSpeed || 0.005);
            animatedPaint.border = {
                ...(animatedPaint.border || paintData.border || {}),
                color: pulsedBorder
            };
            node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 5);
        }

        if (config.corners) {
            const tC = paintData.corners;
            const b = Array.isArray(tC) ? tC : [tC, tC, tC, tC];
            const o = config.corners;
            animatedPaint.corners = [o[0] ?? b[0], o[1] ?? b[1], o[2] ?? b[2], o[3] ?? b[3]];
        }

        masterPainter(ctx, {
            width: rW, height: rH,
            posX: rX, posY: rY,
            paintData: animatedPaint,
            color: fillColor
        });
    }
    ctx.restore();
}
