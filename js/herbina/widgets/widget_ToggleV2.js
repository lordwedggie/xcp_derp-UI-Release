import { masterPainter, masterPainterText } from "../masterPainter.js";
import { animateWidgetColors, lerpTo, animateAlpha, animatePaintData } from "../masterAnimator.js";
import { resolveWidgetEnv, resolvePaintData } from "../utils/widgetsUtils.js";
import { SOUND_INDEX } from "../masterSoundEffects.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";

const TOGGLE_POS_SPEED = 0.2;
const TOGGLE_COLOR_SPEED = 0.2;

export function syncDerpToggleV2(ctx, node, app, config) {
    if (!config.geometry) return;
    const { x, y, w, h } = config.geometry;

    const {
        props, bodyPaint, labelPaint, content, textAnchor, suffix, useAnim, playSound, alpha, colorSegments, hasColorKeys, visibleDisplayText
    } = resolveWidgetEnv(node, config, app);

    const isTextOnly = config.isTextOnly === true || config.skipBackground === true;
    const isActive = !!config.value;
    const iconAlign = String(config.iconAlign || "right").toLowerCase() === "left" ? "left" : "right";

    const lastValKey = `_tgl2_last_${config.key}`;
    if (node[lastValKey] !== undefined && node[lastValKey] !== isActive) {
        if (config.playSound && SOUND_INDEX[config.playSound]) {
            SOUND_INDEX[config.playSound]();
        }
    }
    node[lastValKey] = isActive;

    // --- 3-KEY THEME SYSTEM ---
    const tKeys = config.themeKey || config.textThemeKey || "";
    const parts = Array.isArray(tKeys) ? tKeys : tKeys.split(",").map(p => p.trim());
    const isThree = parts.length === 3 && isNaN(parts[2]);

    let keySlot = parts.length > 1 ? parts[0] : "button";
    let keyText = isThree ? parts[2] : (parts.length === 1 ? parts[0] : (parts[1] || "t_textsmall"));
    let keyDot = isThree ? (parts[1] || keySlot) : keyText;

    const slotSuffix = suffix === "_DIS" ? "_DIS" : (isActive ? "_ON" : "_OFF");
    const dotSuffix = suffix === "_DIS" ? "_DIS" : (isActive ? "_ON" : "_OFF");
    const textSuffix = suffix === "_DIS" ? "_DIS" : (isActive ? "_ON" : "_OFF");

    // Optional # theme key overrides (theme author can override each element independently)
    let slotPaintRaw  = resolvePaintData(node, "#toggle_slot", slotSuffix)   || resolvePaintData(node, keySlot, slotSuffix);
    let knobPaintRaw  = resolvePaintData(node, "#toggle_knob", dotSuffix)   || resolvePaintData(node, keyDot, dotSuffix);
    let textPaintRaw  = resolvePaintData(node, "#t_toggle_text", textSuffix) || resolvePaintData(node, keyText, textSuffix);

    const slotPaint = animatePaintData(node, `_tgl2_slot_${config.key}`, slotPaintRaw, useAnim, TOGGLE_COLOR_SPEED);
    const knobPaint = animatePaintData(node, `_tgl2_knob_${config.key}`, knobPaintRaw, useAnim, TOGGLE_COLOR_SPEED);
    const textPaint = animatePaintData(node, `_tgl2_text_${config.key}`, textPaintRaw, useAnim, TOGGLE_COLOR_SPEED);

    let finalLabelPaint = textPaint || labelPaint;
    // THE FONT SYNC FIX: Synchronize fallback font with the framework's native engine default (DengXian Light)
    if (!finalLabelPaint) finalLabelPaint = { textColor: "white", fontSize: 10, font: window.xcpDerpThemeConfig ? "DengXian Light" : "Arial" };

    const animKey = `_tgl2_pos_${config.key}`;
    const target = isActive ? 1 : 0;
    if (node[animKey] === undefined) node[animKey] = target;
    const res = animateAlpha(node[animKey], target, TOGGLE_POS_SPEED, useAnim);
    node[animKey] = res.value;
    if (res.isAnimating) {
        node._derpAwakeFrames = 2;
        node.setDirtyCanvas(true);
    }

    const colors = animateWidgetColors(node, config.key, bodyPaint, useAnim);
    if (alpha <= 0) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    // Optional # theme key override for toggle body
    const bodyOverride = resolvePaintData(node, "#toggle_body", suffix);
    const finalBodyPaint = bodyOverride || bodyPaint;
    if (!isTextOnly) {
        masterPainter(ctx, { posX: x, posY: y, width: w, height: h, color: colors.fill, paintData: { ...finalBodyPaint, ...colors } });
    }

    const styleRaw = config.style || "default";
    const style = Array.isArray(styleRaw) ? styleRaw[0] : styleRaw;
    const iconWidthOverride = Array.isArray(styleRaw) ? styleRaw[1] : null;

    if (style === "default") {
        const pW = props.padding ? props.padding[0] : 4;
        const gap = config.gap ?? 4; // THE GAP PARAMETER: Explicit spacing between glyph and text
        const labelText = t(visibleDisplayText || content.text || "");
        const themeFontSize = props.fontSize || finalLabelPaint.fontSize || 10;
        const fontWeight = config.fontWeight || finalLabelPaint?.fontWeight || props.fontWeight || "normal";
        // THE FONT SYNC FIX: Apply the same fallback font logic to the context state
        const themeFont = finalLabelPaint.font || (window.xcpDerpThemeConfig ? "DengXian Light" : "Arial");
        ctx.font = `${fontWeight} ${themeFontSize}px ${themeFont}`;

        const tH = themeFontSize * 1.0;
        // THE ICON WIDTH FIX: Do not use widget 'width' for the toggle icon.
        const tW = config.toggleWidth || (tH * 1.8);
        const indicatorBuffer = tW + gap;

        const labelW = labelText ? ctx.measureText(labelText).width : 0;
        const contentAreaW = indicatorBuffer + labelW;
        const alignX = props.labelAlign?.[0] || "left";

        let startX = x + pW;
        if (alignX === "center") startX = x + (w / 2) - (contentAreaW / 2);
        else if (alignX === "right") startX = x + w - pW - contentAreaW;

        const indicatorX = iconAlign === "right" ? (startX + labelW + gap) : startX;
        const labelX = iconAlign === "right" ? startX : (startX + indicatorBuffer);
        const tY = y + (h - tH) / 2;

        // Fallback color protocol: Uses current behavior colors if specific theme keys fail
        const fallbackColor = config.iconColor || finalLabelPaint.textColor || finalLabelPaint.fill || "white";

        // 1. Draw Toggle Slot
        const slotColor = slotPaint?.fill || (isActive ? fallbackColor : "rgba(0,0,0,0.2)");
        masterPainter(ctx, {
            posX: indicatorX, posY: tY, width: tW, height: tH,
            color: slotColor,
            paintData: { ...(slotPaint || {}), corners: [tH / 2, tH / 2, tH / 2, tH / 2] }
        });

        // 2. Draw Toggle Dot
        const kR = (tH * 0.8) / 2;
        const kX = indicatorX + kR + (tH * 0.1) + (tW - tH) * node[animKey];
        const kY = tY + tH / 2;
        const dotColor = knobPaint?.fill || fallbackColor;

        masterPainter(ctx, {
            posX: kX - kR, posY: kY - kR, width: kR * 2, height: kR * 2,
            color: dotColor,
            paintData: { ...(knobPaint || {}), corners: [kR, kR, kR, kR] }
        });

        // 3. Draw Label
        if (labelText.length > 0) {
            const availW = Math.max(0, w - (startX - x) - indicatorBuffer - pW);
            // THE DROPDOWN CUTOFF FIX: Apply manual context clipping to prevent text overflow
            ctx.save();
            ctx.beginPath();
            ctx.rect(labelX, y, availW, h);
            ctx.clip();
            masterPainterText(ctx, {
                x: labelX,
                y: textAnchor?.y || (y + h / 2),
                width: availW,
                height: h,
                text: labelText,
                paintData: { ...finalLabelPaint, fontSize: themeFontSize, fontWeight },
                align: "left",
                baseline: props.labelAlign?.[1] || "middle",
                cutoff: true, cutoffMargin: config.cutoffMargin,
                segments: hasColorKeys ? colorSegments : null
            });
            ctx.restore();
        }
    } else if (style === "rect") {
        const pW = props.padding ? props.padding[0] : 4;
        const gap = config.gap ?? 4; // THE GAP PARAMETER: Explicit spacing between glyph and text
        const labelText = t(visibleDisplayText || content.text || "");
        const themeFontSize = props.fontSize || finalLabelPaint.fontSize || 10;
        const fontWeight = config.fontWeight || finalLabelPaint?.fontWeight || props.fontWeight || "normal";
        const themeFont = finalLabelPaint.font || (window.xcpDerpThemeConfig ? "DengXian Light" : "Arial");
        ctx.font = `${fontWeight} ${themeFontSize}px ${themeFont}`;

        const tH = themeFontSize;
        const tW = iconWidthOverride || config.toggleWidth || (tH * 2.2);
        const indicatorBuffer = tW + gap;

        const labelW = labelText ? ctx.measureText(labelText).width : 0;
        const contentAreaW = indicatorBuffer + labelW;
        const alignX = props.labelAlign?.[0] || "left";

        let startX = x + pW;
        if (alignX === "center") startX = x + (w / 2) - (contentAreaW / 2);
        else if (alignX === "right") startX = x + w - pW - contentAreaW;

        const indicatorX = iconAlign === "right" ? (startX + labelW + gap) : startX;
        const labelX = iconAlign === "right" ? startX : (startX + indicatorBuffer);
        const tY = y + (h - tH) / 2;
        const fallbackColor = config.iconColor || finalLabelPaint.textColor || finalLabelPaint.fill || "white";

        // 1. Draw Toggle Slot (Rect)
        const slotColor = slotPaint?.fill || (isActive ? fallbackColor : "rgba(0,0,0,0.2)");
        masterPainter(ctx, {
            posX: indicatorX, posY: tY, width: tW, height: tH,
            color: slotColor,
            paintData: { ...(slotPaint || {}) }
        });

        // 2. Draw Toggle Dot (Rect)
        const dotH = tH;
        const dotW = tW * 0.5;
        const kX = indicatorX + (tW - dotW) * node[animKey];
        const kY = tY;
        const dotColor = knobPaint?.fill || fallbackColor;

        masterPainter(ctx, {
            posX: kX, posY: kY, width: dotW, height: dotH,
            color: dotColor,
            paintData: { ...(knobPaint || {}), corners: slotPaint?.corners || [0, 0, 0, 0] }
        });

        // 3. Draw Label
        if (labelText.length > 0) {
            const availW = Math.max(0, w - (startX - x) - indicatorBuffer - pW);
            // THE DROPDOWN CUTOFF FIX: Apply manual context clipping to prevent text overflow
            ctx.save();
            ctx.beginPath();
            ctx.rect(labelX, y, availW, h);
            ctx.clip();
            masterPainterText(ctx, {
                x: labelX,
                y: textAnchor?.y || (y + h / 2),
                width: availW,
                height: h,
                text: labelText,
                paintData: { ...finalLabelPaint, fontSize: themeFontSize, fontWeight },
                align: "left",
                baseline: props.labelAlign?.[1] || "middle",
                cutoff: true, cutoffMargin: config.cutoffMargin,
                segments: hasColorKeys ? colorSegments : null
            });
            ctx.restore();
        }
    }
    ctx.restore();
}