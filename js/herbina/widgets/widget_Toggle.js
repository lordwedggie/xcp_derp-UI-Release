/**
 * Path: ./js/herbina/widgets/widget_Toggle.js
 * ROLE: A dual-state, dual-theme toggle widget for the Derp ecosystem.
 * STATUS: Canvas-native only. (Rewritten to match btnSimple rock-solid stability)
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import {
    animateWidgetColors,
    getPulsedColor,
    parseColor
} from "../masterAnimator.js";
import {
    resolveWidgetEnv,
    resolvePaintData
} from "../utils/widgetsUtils.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";

// (2) Glyph Registry: Each key maps to [OFF, ON] states
export const TOGGLE_GLYPHS = {
    "check": ["☐", "☑"],
    "radio": ["⭘", "◉"],
    "power": ["⭘", "⏻"],
    "box":   ["▢", "▣"],
    "heavy": ["◻", "◼"],
    "x":     ["☐", "☒"],
    "ring":  ["⭘", "⦿"],
    "bevel": ["🔲", "🔳"],
    "fill":  ["⭘", "●"],
    "mini":  ["▫", "▪"]
};

/**
 * syncDerpToggle: Unified sync function for the toggle widget.
 */
export function syncDerpToggle(ctx, node, app, config) {
    if (!config || !config.geometry) return;

    let { x, y, w, h } = config.geometry;

    // 1. Resolve Interaction State
    const isToggledOn = (config.value !== undefined) ? !!config.value : (config.state === "ON");
    let activeState = isToggledOn ? "ON" : "OFF";
    if (config.state === "DIS") activeState = "DIS";

    if (activeState !== "DIS") {
        if (node._pressedRegionKey === config.key) {
            activeState = "ON";
        }
    }

    // 2. Resolve Base Environment
    const { props, stateStr: state, bodyPaint: envBodyPaint, labelPaint: envLabelPaint, content, textAnchor, colorSegments, hasColorKeys, visibleDisplayText } = resolveWidgetEnv(node, { ...config, state: activeState }, app);
    if (!props || node.flags?.collapsed || props.width === 0 || node._isDerpCulled) return;

    // 3. Resolve Dual Theme Data
    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    const stateSuffix = (isBypassed || activeState === "DIS") ? "_DIS" : (isToggledOn ? "_ON" : "_OFF");

    let finalLabelPaint = envLabelPaint || envBodyPaint;
    if (config.textThemeKey) {
        finalLabelPaint = resolvePaintData(node, config.textThemeKey, stateSuffix, config.labelColor) || resolvePaintData(node, config.textThemeKey, "", config.labelColor) || finalLabelPaint;
    } else if (!finalLabelPaint) {
        finalLabelPaint = resolvePaintData(node, "t_textNormal", stateSuffix, config.labelColor) || resolvePaintData(node, "t_textNormal", "", config.labelColor);
    }

    if (!envBodyPaint && !finalLabelPaint) return;

    // 4. Color & Pulse Animation Logic
    const getFill = (bp) => bp?.fill || bp?.bgColor || bp?.backgroundColor;
    let rawBg = getFill(envBodyPaint) || config.btnColor || "transparent";
    let rawIc = finalLabelPaint?.textColor || finalLabelPaint?.fill || "red";

    if (config.pulse) {
        const bodyOn = resolvePaintData(node, props.bodyKey, "_ON");
        const bodyOff = resolvePaintData(node, props.bodyKey, "_OFF");
        const lblOn = resolvePaintData(node, config.textThemeKey || props.labelKey, "_ON");
        const lblOff = resolvePaintData(node, config.textThemeKey || props.labelKey, "_OFF");

        const cBgOn = parseColor(bodyOn?.fill) || [255, 0, 0, 1];
        const cBgOff = parseColor(bodyOff?.fill) || [100, 100, 100, 1];
        const cIcOn = parseColor(lblOn?.textColor || lblOn?.fill) || [255, 255, 255, 1];
        const cIcOff = parseColor(lblOff?.textColor || lblOff?.fill) || [150, 150, 150, 1];

        rawBg = getPulsedColor(cBgOff, cBgOn, 0.005);
        rawIc = getPulsedColor(cIcOff, cIcOn, 0.005);
        node._derpAwakeFrames = 2;
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    }

    const useAnim = node.properties?.useAnimations !== false;
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    const prefix = config.isSysPanel ? "_sys_" : "";
    const animKey = `_btnToggle_anim${prefix}_${config.key}`;

    // WAKE FIX: Ensure the node stays awake long enough to finish the state transition animation
    if (node[`_prevToggleState_${config.key}`] !== activeState) {
        node[`_prevToggleState_${config.key}`] = activeState;
        node._derpAwakeFrames = 15;
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    }

    const { fillColor, iconColor } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);

    // 5. Background Render via Master Painter
    const isTextOnly = config.drawBody === false || config.skipBackground === true || !!(config.textThemeKey && !config.themeKey);
    const pW = isTextOnly ? 0 : (props.padding?.[0] || 0);

    if (!isTextOnly) {
        if (envBodyPaint) {
            masterPainter(ctx, { posX: x, posY: y, width: w, height: h, paintData: config.corners ? { ...envBodyPaint, corners: config.corners } : envBodyPaint, color: fillColor });
        } else {
            ctx.fillStyle = fillColor;
            ctx.fillRect(x, y, w, h);
        }
    }

    // 6. Resolve Text & Glyph
    const labelText = t(visibleDisplayText || content?.text || "");
    const isActive = activeState !== "DIS" && ((config.value !== undefined) ? !!config.value : (state === "ON"));
    const glyphPair = TOGGLE_GLYPHS[config.icon] || TOGGLE_GLYPHS["check"];
    const currentGlyph = isActive ? glyphPair[1] : glyphPair[0];

    const [alignX] = props.labelAlign || ["center", "middle"];
    const themeFontSize = props.fontSize || finalLabelPaint.fontSize || 10;
    const fontWeight = config.fontWeight || finalLabelPaint?.fontWeight || props.fontWeight || "normal";
    const themeFont = finalLabelPaint.font || "Arial";
    ctx.font = `${fontWeight} ${themeFontSize}px ${themeFont}`;

    // THE STABILITY FIX: Use a fixed-width slot for the glyph (indicatorBuffer).
    // THE PARITY FIX: Match the toggle width factor from interpretLayoutProps (widgetsUtils.js)
    const styleRaw = config.style;
    const styleName = Array.isArray(styleRaw) ? styleRaw[0] : (styleRaw || "default");
    const toggleFactor = (styleName === "rect" ? 2.2 : 1.8);
    const indicatorBuffer = config.toggleWidth || (themeFontSize * toggleFactor);

    // THE EXACT-FIT FIX: Subtract ghost padding from region dimensions if background is hidden
    // This ensures that 'center' and 'right' alignments are calculated relative to the content area.
    const ghostPadW = (props.padding?.[0] || 0);
    const drawW = isTextOnly ? (w - (ghostPadW * 2)) : w;
    const drawX = isTextOnly ? (x + ghostPadW) : x;

    const stableContentW = (typeof props.width === "number") ? (isTextOnly ? props.width - (ghostPadW * 2) : props.width) : (indicatorBuffer + ctx.measureText(labelText).width);

    let startX = drawX + pW;
    if (alignX === "center") startX = drawX + (drawW / 2) - (stableContentW / 2);
    else if (alignX === "right") startX = drawX + drawW - pW - stableContentW;

    // 7. Render Text (Separate passes for Glyph and Label)
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + pW, y, w - (pW * 2), h);
    ctx.clip();

    // Pass 1: Draw Glyph centered in its invariant slot
    masterPainterText(ctx, {
        x: startX + (indicatorBuffer / 2),
        y: textAnchor?.y || (y + h / 2),
        width: indicatorBuffer,
        height: h,
        text: currentGlyph,
        paintData: { ...finalLabelPaint, fill: iconColor, textColor: iconColor, fontSize: themeFontSize, fontWeight },
        align: "center",
        baseline: props.labelAlign?.[1] || "middle"
    });

    // Pass 2: Draw Label starting exactly after the glyph slot
    if (labelText.length > 0) {
        masterPainterText(ctx, {
            x: startX + indicatorBuffer,
            y: textAnchor?.y || (y + h / 2),
            width: Math.max(0, w - indicatorBuffer - (pW * 2)),
            height: h,
            text: labelText,
            paintData: { ...finalLabelPaint, fill: iconColor, textColor: iconColor, fontSize: themeFontSize, fontWeight },
            align: "left",
            baseline: props.labelAlign?.[1] || "middle",
            segments: hasColorKeys ? colorSegments : null
        });
    }
    ctx.restore();
}
