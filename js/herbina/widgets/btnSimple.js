/**
 * Path: ./Herbina/widgets/btnSimple.js
 * STATUS: UPDATED with Color Overrides and Checker Support
 */
import { masterPainter, masterPainterText, compileThemeData } from "../masterPainter.js";
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { resolveWidgetEnv, parseThemeKey, resolvePaletteEntry, resolvePaintData, compileAnimatedPaint, measureTextWidth, colorSegmentsToHTML } from "../utils/widgetsUtils.js";
import { animateWidgetColors, getPulsedColor, parseColor } from "../masterAnimator.js";

// --- CHECKERBOARD FINETUNING VARIABLES ---
const CHECKER_SIZE = 10;
const CHECKER_COLOR_A = "#333333";
const CHECKER_COLOR_B = "#222222";

export function createBtnSimple(callbacks = {}) {
    return {
        type: "btnSimple",
        label: callbacks.text || callbacks.label || "Button",
        state: callbacks.state !== undefined ? callbacks.state : false,
        onPress: callbacks.onPress || null,
        onClick: callbacks.onClick || null,
        themeKey: callbacks.themeKey || "btn",
        // NEW PROPERTIES
        btnColor: callbacks.btnColor || null,
        labelColor: callbacks.labelColor || null,
        drawChecker: callbacks.drawChecker || false
    };
}

/**
 * Canvas Helper: Draws a checkerboard pattern within a specific rect
 */
function drawCanvasChecker(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    for (let i = 0; i < w; i += CHECKER_SIZE) {
        for (let j = 0; j < h; j += CHECKER_SIZE) {
            ctx.fillStyle = ((i / CHECKER_SIZE) + (j / CHECKER_SIZE)) % 2 === 0
                ? CHECKER_COLOR_A
                : CHECKER_COLOR_B;
            ctx.fillRect(x + i, y + j, CHECKER_SIZE, CHECKER_SIZE);
        }
    }
    ctx.restore();
}

export function syncBtnSimple(ctx, node, config) {
    if (!config.geometry) return;
    const { x, y, w, h } = config.geometry;

    // THE FAST-HASH GATING: Prevent expensive theme resolution if interactive state is static
    const isPressed = node._pressedRegionKey === config.key;
    const isHovered = (config.mouseOver !== false && node._hoveredRegionKey === config.key);
    // THE PALETTE HASH FIX: Include palette load status so the cache busts when the async fetch completes.
    const palStatus = config.palette ? !!resolvePaletteEntry(node, config.palette.path, config.palette.entry || config.key) : false;
    const geo = config.geometry || { x: 0, y: 0, w: 0, h: 0 };
    const geoHash = `${geo.x}|${geo.y}|${geo.w}|${geo.h}`;
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${config.text || config.label}_${palStatus}_${geoHash}_${config.alpha ?? 1}_${config.pulse ? 1 : 0}`;

    const cache = node._btnSimpleCache || (node._btnSimpleCache = {});
    const itemCache = cache[config.key] || (cache[config.key] = {});

    if (!config.pulse && itemCache.hash === stateHash && itemCache.res && !node._forceSync) {
        var { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, textAnchor, colorSegments, hasColorKeys } = itemCache.res;
    } else {
        var { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, textAnchor, colorSegments, hasColorKeys } = resolveWidgetEnv(node, config);

        // THE PALETTE TEXT FIX: If a palette is used, re-resolve labelPaint from the theme
        // to prevent palette colors from overwriting the native text color.
        if (config.palette) {
            const suffix = (stateStr === "DIS") ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");
            labelData = resolvePaintData(node, props.labelKey, suffix, config.labelColor);
        }

        itemCache.hash = stateHash;
        itemCache.res = { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, textAnchor, colorSegments, hasColorKeys };
    }

    // 1. Resolve Text-Only state
    const isTextOnly = config.skipBackground || (config.themeKey && !config.themeKey.includes(","));

    // 2. Draw Checker Pattern BELOW background
    if (config.drawChecker && !isTextOnly) {
        drawCanvasChecker(ctx, x, y, w, h);
    }

    // 3. Resolve Background & Text Colors
    let rawBg = paintData?.fill || config.btnColor || "red";
    // Pulse support for orphaned/warning states (ignores global animation toggle)
    if (config.pulse) {
        const paintOFF = resolvePaintData(node, props.bodyKey, "_OFF");
        const paintON = resolvePaintData(node, props.bodyKey, "_ON");
        const a = parseColor(paintOFF?.fill) || [128, 128, 128, 0.3];
        const b = parseColor(paintON?.fill) || [255, 60, 60, 1];
        const speed = config.pulseSpeed || 0.008;
        rawBg = getPulsedColor(a, b, speed);
        node._derpAwakeFrames = 3;
    }
    const rawIc = labelData?.textColor || labelData?.fill || "red";

    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    const animKey = `_btnSimple_anim_${config.key}`;

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);
    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    // THE CENTRALIZED ALPHA & ANIMATION FIX: Delegate all effect fading and interpolation to the utility layer
    const animatedPaint = compileAnimatedPaint(paintData, config, sysAlpha, { fill: fillColor, textColor: iconColor });

    if (sysAlpha < 1) {
        ctx.save();
        ctx.globalAlpha *= sysAlpha;
    }

    // THE PADDING LOGIC FIX: Background X and Width derived from pW (props.padding[0])
    const pW = props.padding?.[0] || 0;
    const drawX = x;
    const drawW = w;

    if (!isTextOnly) {
        if (paintData) {
            masterPainter(ctx, { posX: drawX, posY: y, width: drawW, height: h, paintData: animatedPaint, color: fillColor });
        } else {
            ctx.fillStyle = fillColor; ctx.fillRect(drawX, y, drawW, h);
        }
    }

    // 4. Render Text (Padding Parity Fix)
    const btnText = props.displayText || content.text;
    if (btnText && labelData) {
        const pW = props.padding?.[0] || 0;
        const [alignX] = props.labelAlign || ["left", "middle"];
        let fontSize = props.fontSize || labelData.fontSize || 10;
        if (config.noShrink !== true && btnText.length > 0) {
            const limit = w - (pW * 2);
            while (measureTextWidth(btnText, fontSize, labelData?.font || "arial", props.fontWeight) > limit && fontSize > 4) {
                fontSize -= 0.5;
            }
        }

        // THE FIX: Starting X and Width calculations based on pW logic
        let textX = x + pW;
        if (alignX === "center") textX = x + (w / 2);
        else if (alignX === "right") textX = x + w - pW;

        const clipW = Math.max(0, w - (pW * 2));
        const clipH = Math.max(0, h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.floor(x + pW), Math.floor(y), Math.floor(clipW), Math.floor(clipH));
        ctx.clip();
        masterPainterText(ctx, {
            x: textX, y: textAnchor.y, width: w, height: h, text: btnText,
            paintData: { ...labelData, fill: iconColor, fontSize: fontSize, fontWeight: props.fontWeight },
            align: alignX, baseline: props.labelAlign?.[1] || "middle",
            segments: hasColorKeys ? colorSegments : null
        });
        ctx.restore();
    }

    if (sysAlpha < 1) ctx.restore();
}

export function syncBtnSimpleHTML(element, node, app, config) {
    if (!element || !config.geometry) return;

    // THE FAST-HASH GATING: Prevent layout thrashing and theme resolution unless interactive state changes
    const isPressed = node._pressedRegionKey === config.key || element.dataset.isPressed === "true";
    const isHovered = (config.mouseOver !== false && (node._hoveredRegionKey === config.key || element.dataset.isHovered === "true"));
    const palStatus = config.palette ? !!resolvePaletteEntry(node, config.palette.path, config.palette.entry || config.key) : false;
    const geo = config.geometry || { x: 0, y: 0, w: 0, h: 0 };
    const geoHash = `${geo.x}|${geo.y}|${geo.w}|${geo.h}`;
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${config.text || config.label}_${palStatus}_${geoHash}_${config.alpha ?? 1}_${config.pulse ? 1 : 0}`;

    const needsFullSync = node._shouldSync || element._lastStateHash !== stateHash || (element._isAnimating && (window.xcpDerpSettings?.useAnimations !== false));

    if (!needsFullSync && element._lastProps) {
        var { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, callbacks, alignments, coords, textAnchor, colorSegments, hasColorKeys } = element._lastProps;
    } else {
        var { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, callbacks, alignments, coords, textAnchor, colorSegments, hasColorKeys } = resolveWidgetEnv(node, config, app, element);

        // THE PALETTE TEXT FIX: Re-resolve labelPaint from theme to bypass palette text-color injection.
        if (config.palette) {
            const suffix = (stateStr === "DIS") ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");
            labelData = resolvePaintData(node, props.labelKey, suffix, config.labelColor);
        }

        element._lastProps = { props, stateStr, bodyPaint: paintData, labelPaint: labelData, content, callbacks, alignments, coords, textAnchor, colorSegments, hasColorKeys };
        element._lastStateHash = stateHash;
    }

    if (!coords) return;
    const scale = coords.scale;

    const isTextOnly = config.skipBackground || (config.themeKey && !config.themeKey.includes(","));

    // 1. Resolve Colors (Strict Theme Compliance)
    const rawBg = paintData?.fill || config.btnColor || (isTextOnly ? "transparent" : "red");
    const rawIc = labelData?.textColor || labelData?.fill || "red";

    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    const animKey = `_btnSimple_html_anim_${config.key}`;

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);
    element._isAnimating = isAnimating;
    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    // THE OPTIMIZATION: DOM Thrash Gate using stable theme colors and content
    const displayText = props.displayText || content.text;
    const hPad = (props.padding?.[0] || 0) * scale;
    const vPad = (props.padding?.[1] || 0) * scale;
    const [alignX, alignY] = props.labelAlign || ["left", "middle"];

    const syncKey = `${stateStr}-${rawBg}-${rawIc}-${displayText}-${scale}-${coords.width}-${coords.height}-${hPad}-${vPad}-${config.drawChecker}`;
    if (element._lastSyncKey !== syncKey || node._forceSync) {
        element._lastSyncKey = syncKey;

        Object.assign(element.style, {
            position: "absolute", left: coords.left, top: coords.top,
            width: coords.width, height: coords.height,
            display: "flex", boxSizing: "border-box", cursor: "pointer", pointerEvents: "auto"
        });

        // 2. Apply Background (Checker + Stable Theme Color)
        if (config.drawChecker && !isTextOnly) {
            const sz = CHECKER_SIZE * scale;
            const checkerGradient = `linear-gradient(45deg, ${CHECKER_COLOR_A} 25%, transparent 25%, transparent 75%, ${CHECKER_COLOR_A} 75%, ${CHECKER_COLOR_A})`;
            element.style.backgroundImage = `linear-gradient(${rawBg}, ${rawBg}), ${checkerGradient}`;
            element.style.backgroundSize = `100% 100%, ${sz * 2}px ${sz * 2}px`;
            element.style.backgroundPosition = `0 0, 0 0, ${sz}px ${sz}px`;
        } else {
            element.style.backgroundImage = "none";
            element.style.backgroundColor = isTextOnly ? "transparent" : rawBg;
        }

        // 3. Render Static Text Styles
        if (labelData) {
            let fontSize = props.fontSize || labelData.fontSize || 10;
            if (config.noShrink !== true && displayText.length > 0) {
                const limit = geo.w - ((props.padding?.[0] || 0) * 2);
                while (measureTextWidth(displayText, fontSize, labelData?.font || "arial", props.fontWeight) > limit && fontSize > 4) {
                    fontSize -= 0.5;
                }
            }
            element.style.fontFamily = labelData.font || "Arial";
            element.style.fontSize = `${fontSize * scale}px`;
            element.style.fontWeight = props.fontWeight || "normal";
            element.style.fontStyle = "normal";
        }

        if (hasColorKeys && colorSegments) {
            element.innerHTML = colorSegmentsToHTML(colorSegments);
        } else {
            element.innerText = displayText;
        }

        if (!config.wrap) {
            element.style.whiteSpace = "nowrap";
            element.style.overflow = "hidden";
            element.style.textOverflow = "clip";
        }

        element.style.justifyContent = textAnchor ? textAnchor.justifyContent : (alignments.justify[alignX] || "center");
        element.style.alignItems = alignments.align[alignY] || "center";
        element.style.textAlign = alignX;
        element.style.padding = `${vPad}px ${hPad}px`;
    }

    // THE FAST-PATH FIX: Apply animated colors inline without busting the layout cache
    element.style.color = iconColor;
    element.style.opacity = sysAlpha;

        if (!isTextOnly) {
            if (config.drawChecker) {
                const sz = CHECKER_SIZE * scale;
                const chkGrad = `linear-gradient(45deg, ${CHECKER_COLOR_A} 25%, transparent 25%, transparent 75%, ${CHECKER_COLOR_A} 75%, ${CHECKER_COLOR_A})`;
                element.style.backgroundImage = `linear-gradient(${fillColor}, ${fillColor}), ${chkGrad}`;
        } else {
            element.style.backgroundColor = fillColor;
            }

            // THE CENTRALIZED ALPHA & ANIMATION FIX: Delegate all effect fading and interpolation to the utility layer
            const animatedPaint = compileAnimatedPaint(paintData, config, sysAlpha, { fill: fillColor, textColor: iconColor });
            applyHTMLTheme(element, animatedPaint, scale);
        }

    element.onclick = (e) => {
        // THE AWAKE GATE: Ensure framework stays alive for color/recoil animations
        if (node) node._derpAwakeFrames = 10;
        callbacks.handlePress(e, !config.state);
    };
}
