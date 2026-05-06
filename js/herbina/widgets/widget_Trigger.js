import { masterPainter, masterPainterText } from "../masterPainter.js";
import { animateWidgetColors, lerpTo, animateAlpha, animatePaintData } from "../masterAnimator.js";
import { resolveWidgetEnv, resolvePaintData } from "../utils/widgetsUtils.js";
import { playPowerUp, playPowerDown } from "../masterSoundEffects.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";

const TRIGGER_COLOR_SPEED = 0.2;
const WEIGHT_FONT_SIZE = 5;
const WEIGHT_ICON_PAD = 3;
const TRIGGER_LABEL_GAP = 2;
const WEIGHT_EPSILON = 1e-6;

export function syncDerpTrigger(ctx, node, app, config) {
    if (!config.geometry) return;
    let { x, y, w, h } = config.geometry;
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    if (sysAlpha <= 0) return;

    const isDragging = node._dragTrig && node._dragTrig.key === config.key;
    let saved = false;
    if (isDragging || sysAlpha < 1) {
        ctx.save();
        saved = true;
    }
    if (sysAlpha < 1) {
        ctx.globalAlpha *= sysAlpha;
    }
    if (isDragging && node._dragMouse) {
        x = node._dragMouse[0] - (node._dragOffset?.[0] || (w / 2));
        y = node._dragMouse[1] - (node._dragOffset?.[1] || (h / 2));
        ctx.globalAlpha *= 0.6;
    }

    const {
        props, bodyPaint, labelPaint, content, textAnchor, suffix, useAnim, playSound
    } = resolveWidgetEnv(node, config, app);

    const isTextOnly = config.isTextOnly === true || config.skipBackground === true;
    const isActive = !!config.value;

    // --- PERSISTENT BOUNDS & WRAPPER ---
    if (!node._trigState) node._trigState = {};
    if (!node._trigState[config.key]) node._trigState[config.key] = { g: {x:0, w:0}, t: {x:0, w:0} };
    const state = node._trigState[config.key];

    const actualReg = node.layout?.regions?.[config.key];
    // THE DEADZONE FIX: Inject a precision hit-test so the framework ignores clicks in the gaps
    if (actualReg && !actualReg.hitTest) {
        actualReg.hitTest = (localPos) => {
            const hitX = localPos[0];
            const hitY = localPos[1];

            // THE Y-AXIS FIX: Must check vertical bounds first!
            if (hitY < actualReg.y || hitY > (actualReg.y + actualReg.h)) return false;

            const isGlyph = hitX >= state.g.x && hitX <= (state.g.x + state.g.w);
            const isText = hitX >= state.t.x && hitX <= (state.t.x + state.t.w);
            return isGlyph || isText;
        };
    }
    if (actualReg && actualReg.onPress && !actualReg.onPress._isDerpWrapped) {
        const actualOrig = actualReg.onPress;
        const wrapped = (e, data) => {
            const hitX = data?.localX ?? 0;
            if (hitX >= state.g.x && hitX <= (state.g.x + state.g.w)) {
                if (actualOrig) actualOrig(e, { ...data, hitArea: "glyph" });
                return;
            }
            if (hitX >= state.t.x && hitX <= (state.t.x + state.t.w)) {
                if (actualOrig) actualOrig(e, { ...data, hitArea: "text" });
                return;
            }
        };
        wrapped._isDerpWrapped = true;
        actualReg.onPress = wrapped;
        config.onPress = wrapped;
    }

    // --- RELOCATED SOUND & STATE TRACKING ---
    const lastValKey = `_trig_last_${config.key}`;
    const validatedActive = !!config.value;
    if (node[lastValKey] !== undefined && node[lastValKey] !== validatedActive) {
        if (playSound) {
            if (validatedActive) playPowerUp();
            else playPowerDown();
        }
    }
    node[lastValKey] = validatedActive;

    // --- 3-KEY THEME SYSTEM ---
    const tKeys = config.themeKey || config.textThemeKey || "";
    const parts = Array.isArray(tKeys) ? tKeys : tKeys.split(",").map(p => p.trim());
    const isThree = parts.length === 3;

    let keyBody = isThree ? parts[0] : (parts[0] === "" ? null : parts[0]);
    let keyIcon = isThree ? parts[1] : (parts.length > 1 ? parts[0] : (parts[0] === "" ? null : "button"));
    let keyText = isThree ? parts[2] : (parts.length === 1 ? parts[0] : (parts[1] || (parts[0] === "" ? null : "t_textsmall")));

    const triggerSuffix = suffix === "_ON" ? "_ON" : (suffix === "_DIS" ? "_DIS" : (isActive ? "_OFF" : "_DIS"));

    let bodyPaintRaw = keyBody ? resolvePaintData(node, keyBody, triggerSuffix) : (config.bodyPaint || bodyPaint);
    let slotPaintRaw = keyIcon ? resolvePaintData(node, keyIcon, triggerSuffix) : config.slotPaint;
    let textPaintRaw = keyText ? resolvePaintData(node, keyText, triggerSuffix) : config.labelPaint;

    const finalBodyPaint = animatePaintData(node, `_trig_body_${config.key}`, bodyPaintRaw, useAnim, TRIGGER_COLOR_SPEED);
    const slotPaint = animatePaintData(node, `_trig_slot_${config.key}`, slotPaintRaw, useAnim, TRIGGER_COLOR_SPEED);
    const textPaint = animatePaintData(node, `_trig_text_${config.key}`, textPaintRaw, useAnim, TRIGGER_COLOR_SPEED);

    let finalLabelPaint = textPaint || labelPaint;
    if (!finalLabelPaint) finalLabelPaint = { textColor: "white", fontSize: 10, font: window.xcpDerpThemeConfig ? "DengXian Light" : "Arial" };

    const styleRaw = config.style || "default";
    const style = Array.isArray(styleRaw) ? styleRaw[0] : styleRaw;
    const iconWidthOverride = Array.isArray(styleRaw) ? styleRaw[1] : null;

    const padL = props.padding ? props.padding[0] : 4;
    const padT = props.padding ? props.padding[1] : 4;
    const padR = props.padding ? props.padding[2] : 4;
    const padB = props.padding ? props.padding[3] : 4;
    const gap = config.gap ?? TRIGGER_LABEL_GAP;
    const labelText = style === "default" ? t(node.properties?.[`${config.key}_label`] ?? content.text ?? "") : t(content.text || "");
    const themeFontSize = props.fontSize || finalLabelPaint.fontSize || 10;
    const themeFont = finalLabelPaint.font || (window.xcpDerpThemeConfig ? "DengXian Light" : "Arial");
    const weightFontSize = config.weightFontSize || props.weightFontSize || Math.min(themeFontSize, WEIGHT_FONT_SIZE);
    ctx.font = `${props.fontWeight || "normal"} ${themeFontSize}px ${themeFont}`;

    const tH = themeFontSize;

    const weight = Number(config.weight ?? 1.0);
    const safeWeight = Number.isFinite(weight) ? weight : 1.0;
    const isWeightVisible = Math.abs(safeWeight - 1.0) > WEIGHT_EPSILON;
    const weightText = safeWeight.toFixed(2);

    let tW = iconWidthOverride || config.toggleWidth || tH;
    if (isWeightVisible && !config.toggleWidth) {
        ctx.save();
        ctx.font = `${props.fontWeight || finalLabelPaint.fontWeight || "normal"} ${weightFontSize}px ${themeFont}`;
        const weightW = ctx.measureText(weightText).width;
        ctx.restore();
        tW = Math.max(tW, weightW + (WEIGHT_ICON_PAD * 2));
    }

    const indicatorBuffer = tW + gap;
    const labelW = labelText ? ctx.measureText(labelText).width : 0;
    const finalW = w;

    if (!isTextOnly) {
        masterPainter(ctx, { posX: x, posY: y, width: finalW, height: h, color: finalBodyPaint.fill, paintData: finalBodyPaint });
    }

    const alignX = props.labelAlign?.[0] || "left";
    let startX = x + padL;
    const contentW_noPad = indicatorBuffer + labelW;
    if (alignX === "center") startX = x + (finalW / 2) - (contentW_noPad / 2);
    else if (alignX === "right") startX = x + finalW - padR - contentW_noPad;

    const tX = startX;
    state.g = { x: tX, w: tW };
    const tY = y + padT + (h - padT - padB - tH) / 2;
    const fallbackColor = config.iconColor || finalLabelPaint.textColor || finalLabelPaint.fill || "white";

    const slotColor = slotPaint?.fill || (isActive ? fallbackColor : "rgba(0,0,0,0.2)");
    masterPainter(ctx, {
        posX: tX, posY: tY, width: tW, height: tH,
        color: slotColor,
        paintData: slotPaint
    });

    if (isWeightVisible) {
        masterPainterText(ctx, {
            x: tX + (tW / 2),
            y: tY + (tH / 2),
            width: tW, height: tH,
            text: weightText,
            paintData: { ...finalLabelPaint, fontSize: weightFontSize, fontWeight: props.fontWeight || finalLabelPaint.fontWeight },
            align: "center", baseline: "middle"
        });
    }

    const availW = Math.max(0, finalW - (startX - x) - indicatorBuffer - padR);
    state.t = { x: startX + indicatorBuffer, w: availW };

    if (labelText.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(startX + indicatorBuffer, y, availW, h);
        ctx.clip();
        masterPainterText(ctx, {
            x: startX + indicatorBuffer,
            y: textAnchor?.y || (y + h / 2),
            width: availW,
            height: h,
            text: labelText,
            paintData: { ...finalLabelPaint, fontSize: themeFontSize, fontWeight: props.fontWeight },
            align: "left",
            baseline: props.labelAlign?.[1] || "middle",
            cutoff: true
        });
        ctx.restore();
    }

    if (saved) ctx.restore();
}

export const syncDerpCompositeTrigger = syncDerpTrigger;
