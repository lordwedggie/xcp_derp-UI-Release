import { masterPainter, masterPainterText } from "../masterPainter.js";
import { animatePaintData } from "../masterAnimator.js";
import { resolveWidgetEnv, resolvePaintData } from "../utils/widgetsUtils.js";
import { playPowerUp, playPowerDown } from "../masterSoundEffects.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";

const TRIGGER_COLOR_SPEED = 0.2;
const WEIGHT_FONT_SIZE = 5;
const WEIGHT_ICON_PAD = 3;
const TRIGGER_LABEL_GAP = 2;
const WEIGHT_EPSILON = 1e-6;

function isTriggerWallNode(node) {
    return String(node?.type || "").toLowerCase().includes("triggerwall");
}

function stripFx(paint) {
    if (!paint) return paint;
    return {
        ...paint,
        shadow: null,
        glow: null,
    };
}

function drawFastBox(ctx, x, y, w, h, paint, fallbackColor) {
    if (!paint && !fallbackColor) return;
    const radiusRaw = paint?.corners ?? 0;
    const radius = Array.isArray(radiusRaw)
        ? radiusRaw.map((r) => Math.max(0, Math.min(Number(r) || 0, Math.min(w, h) / 2)))
        : Math.max(0, Math.min(Number(radiusRaw) || 0, Math.min(w, h) / 2));
    ctx.save();
    ctx.fillStyle = paint?.fill || fallbackColor || "transparent";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    if (paint?.border?.color && Number(paint.border.width) > 0) {
        const lineWidth = Number(paint.border.width) || 1;
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = paint.border.color;
        ctx.stroke();
    }
    ctx.restore();
}

function drawFastText(ctx, text, x, y, paint, options = {}) {
    if (!text) return;
    const fontSize = options.fontSize || paint?.fontSize || 10;
    const fontFamily = paint?.font || "Arial";
    const fontWeight = options.fontWeight || paint?.fontWeight || "normal";
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = paint?.fill || paint?.textColor || "white";
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
}

function measureTriggerText(ctx, node, key, font, text) {
    const cacheKey = `${font}|${text}`;
    if (!node._triggerTextMeasureCache) node._triggerTextMeasureCache = new Map();
    const scopedKey = `${key}|${cacheKey}`;
    if (node._triggerTextMeasureCache.has(scopedKey)) return node._triggerTextMeasureCache.get(scopedKey);
    const width = ctx.measureText(text).width;
    node._triggerTextMeasureCache.set(scopedKey, width);
    return width;
}

function bumpTriggerWallWidgetProfile(node, elapsedMs) {
    if (!node?._twPerf || !String(node.type || "").toLowerCase().includes("triggerwall")) return;
    node._twPerf.triggerWidgetCount = (node._twPerf.triggerWidgetCount || 0) + 1;
    node._twPerf.triggerWidgetMs = (node._twPerf.triggerWidgetMs || 0) + elapsedMs;
}

function getTriggerStaticCache(node, key) {
    if (!node._triggerStaticCache) node._triggerStaticCache = new Map();
    return node._triggerStaticCache.get(key) || null;
}

function setTriggerStaticCache(node, key, value) {
    if (!node._triggerStaticCache) node._triggerStaticCache = new Map();
    node._triggerStaticCache.set(key, value);
}

function getTriggerBitmapCache(node, key) {
    if (!node._triggerBitmapCache) node._triggerBitmapCache = new Map();
    return node._triggerBitmapCache.get(key) || null;
}

function setTriggerBitmapCache(node, key, value) {
    if (!node._triggerBitmapCache) node._triggerBitmapCache = new Map();
    node._triggerBitmapCache.set(key, value);
}

function createTriggerBitmap(width, height) {
    const safeW = Math.max(1, Math.round(width));
    const safeH = Math.max(1, Math.round(height));
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(safeW, safeH);
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = safeW;
        canvas.height = safeH;
        return canvas;
    }
    return null;
}

export function syncDerpTrigger(ctx, node, app, config) {
    const triggerWallNode = isTriggerWallNode(node);
    const profileStart = triggerWallNode ? performance.now() : 0;
    const triggerWallCacheSuspended = triggerWallNode && performance.now() < Number(node._triggerWallCacheSuspendUntil || 0);
    const isHovered = node._hoveredRegionKey === config.key;
    const isPressed = node._pressedRegionKey === config.key;
    if (!config.geometry) return;
    let { x, y, w, h } = config.geometry;
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    if (sysAlpha <= 0) return;

    const isDragging = node._dragTrig && node._dragTrig.key === config.key;
    const quickCanUseBitmapCache = triggerWallNode && !triggerWallCacheSuspended && !isDragging && sysAlpha === 1 && !node._forceSync;
    const quickBitmapKey = quickCanUseBitmapCache ? [
        config.key,
        node._currentThemeName || "",
        config.themeKey || config.textThemeKey || "",
        config.suffix || "",
        config.state || "",
        config.value ? 1 : 0,
        config.disabled === true ? 1 : 0,
        isHovered ? 1 : 0,
        isPressed ? 1 : 0,
        String(config.text || ""),
        String(config.weight ?? 1.0),
        config.showWeight === false ? 0 : 1,
        Math.max(1, Math.round(w)),
        Math.max(1, Math.round(h)),
    ].join("|") : null;
    const quickCachedBitmap = quickCanUseBitmapCache ? getTriggerBitmapCache(node, config.key) : null;
    if (quickCachedBitmap && quickCachedBitmap.key === quickBitmapKey && quickCachedBitmap.bitmap) {
        ctx.drawImage(quickCachedBitmap.bitmap, Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
        if (triggerWallNode) bumpTriggerWallWidgetProfile(node, performance.now() - profileStart);
        return;
    }

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

    const guardNoFx = triggerWallNode && window.DERP_TW_GUARD_NO_FX === true;
    const guardNoAnim = triggerWallNode && window.DERP_TW_GUARD_NO_ANIM === true;
    const guardTextUpscale = triggerWallNode && window.DERP_TW_GUARD_TEXT_UPSCALE === true;
    const effectiveUseAnim = guardNoAnim ? false : useAnim;

    const isTextOnly = config.isTextOnly === true || config.skipBackground === true;
    const isActive = !!config.value;

    const lastValKey = `_trig_last_${config.key}`;
    const validatedActive = !!config.value;
    if (node[lastValKey] !== undefined && node[lastValKey] !== validatedActive) {
        if (playSound) {
            if (validatedActive) playPowerUp();
            else playPowerDown();
        }
    }
    node[lastValKey] = validatedActive;

    const tKeys = config.themeKey || config.textThemeKey || "";
    const parts = Array.isArray(tKeys) ? tKeys : tKeys.split(",").map((p) => p.trim());
    const isThree = parts.length === 3;

    const keyBody = isThree ? parts[0] : (parts[0] === "" ? null : parts[0]);
    const keyIcon = isThree ? parts[1] : (parts.length > 1 ? parts[0] : (parts[0] === "" ? null : "button"));
    const keyText = isThree ? parts[2] : (parts.length === 1 ? parts[0] : (parts[1] || (parts[0] === "" ? null : "t_textsmall")));

    const requestedSuffix = config.suffix;
    const triggerSuffix = requestedSuffix === "_ON" || requestedSuffix === "_OFF" || requestedSuffix === "_DIS"
        ? requestedSuffix
        : (suffix === "_ON" ? "_ON" : (suffix === "_DIS" ? "_DIS" : (isActive ? "_OFF" : "_DIS")));

    const styleRaw = config.style || "default";
    const style = Array.isArray(styleRaw) ? styleRaw[0] : styleRaw;
    const iconWidthOverride = Array.isArray(styleRaw) ? styleRaw[1] : null;

    const padL = props.padding ? props.padding[0] : 4;
    const padT = props.padding ? props.padding[1] : 4;
    const padR = props.padding ? props.padding[2] : 4;
    const padB = props.padding ? props.padding[3] : 4;
    const gap = config.gap ?? TRIGGER_LABEL_GAP;
    const labelText = style === "default" ? t(node.properties?.[`${config.key}_label`] ?? content.text ?? "") : t(content.text || "");
    const canReuseStatic = triggerWallNode && !triggerWallCacheSuspended && !isDragging && sysAlpha === 1 && effectiveUseAnim === false;
    const staticKey = canReuseStatic ? [
        config.key,
        config.themeKey || config.textThemeKey || "",
        triggerSuffix,
        isActive ? 1 : 0,
        config.disabled === true ? 1 : 0,
        config.state || "",
        isHovered ? 1 : 0,
        isPressed ? 1 : 0,
        labelText,
        String(config.weight ?? 1.0),
        config.showWeight === false ? 0 : 1,
        guardNoFx ? 1 : 0,
        guardTextUpscale ? 1 : 0,
        props.fontSize || "",
        props.fontWeight || "",
        props.weightFontSize || "",
        iconWidthOverride || "",
        config.toggleWidth || "",
    ].join("|") : null;
    const staticCache = canReuseStatic ? getTriggerStaticCache(node, config.key) : null;

    let bodyPaintOut;
    let slotPaintOut;
    let labelPaintOut;
    let themeFontSize;
    let themeFont;
    if (staticCache && staticCache.key === staticKey) {
        ({ bodyPaintOut, slotPaintOut, labelPaintOut, themeFontSize, themeFont } = staticCache);
    } else {
        const bodyPaintRaw = config.bodyPaint || (keyBody ? resolvePaintData(node, keyBody, triggerSuffix) : bodyPaint);
        const slotPaintRaw = config.slotPaint || (keyIcon ? resolvePaintData(node, keyIcon, triggerSuffix) : null);
        const textPaintRaw = config.labelPaint || (keyText ? resolvePaintData(node, keyText, triggerSuffix) : null);
        const finalBodyPaint = animatePaintData(node, `_trig_body_${config.key}`, bodyPaintRaw, effectiveUseAnim, TRIGGER_COLOR_SPEED);
        const slotPaint = animatePaintData(node, `_trig_slot_${config.key}`, slotPaintRaw, effectiveUseAnim, TRIGGER_COLOR_SPEED);
        const textPaint = animatePaintData(node, `_trig_text_${config.key}`, textPaintRaw, effectiveUseAnim, TRIGGER_COLOR_SPEED);
        const finalLabelPaint = textPaint || labelPaint || {};
        bodyPaintOut = guardNoFx ? stripFx(finalBodyPaint) : finalBodyPaint;
        slotPaintOut = guardNoFx ? stripFx(slotPaint) : slotPaint;
        labelPaintOut = guardNoFx ? stripFx(finalLabelPaint) : finalLabelPaint;
        const themeFontSizeRaw = props.fontSize || finalLabelPaint.fontSize || 10;
        themeFontSize = guardTextUpscale ? Math.max(themeFontSizeRaw, 12) : themeFontSizeRaw;
        themeFont = finalLabelPaint.font || "Arial";
        if (canReuseStatic) setTriggerStaticCache(node, config.key, { key: staticKey, bodyPaintOut, slotPaintOut, labelPaintOut, themeFontSize, themeFont });
    }
    const weightFontSize = config.weightFontSize || props.weightFontSize || Math.min(themeFontSize, WEIGHT_FONT_SIZE);
    ctx.font = `${props.fontWeight || "normal"} ${themeFontSize}px ${themeFont}`;

    const tH = themeFontSize;
    const weight = Number(config.weight ?? 1.0);
    const safeWeight = Number.isFinite(weight) ? weight : 1.0;
    const allowWeightDisplay = config.showWeight !== false;
    const isWeightVisible = allowWeightDisplay && Math.abs(safeWeight - 1.0) > WEIGHT_EPSILON;
    const weightText = safeWeight.toFixed(2);

    let tW = 0;
    if (isWeightVisible) {
        tW = iconWidthOverride || config.toggleWidth || tH;
    }
    if (isWeightVisible && !config.toggleWidth) {
        ctx.save();
        ctx.font = `${props.fontWeight || labelPaintOut.fontWeight || "normal"} ${weightFontSize}px ${themeFont}`;
        const weightW = measureTriggerText(ctx, node, `${config.key}:weight`, ctx.font, weightText);
        ctx.restore();
        tW = Math.max(tW, weightW + (WEIGHT_ICON_PAD * 2));
    }

    const indicatorBuffer = isWeightVisible ? (tW + gap) : 0;
    const labelW = labelText ? measureTriggerText(ctx, node, `${config.key}:label`, ctx.font, labelText) : 0;
    const finalW = Math.max(1, Math.round(w));
    const finalH = Math.max(1, Math.round(h));
    const baseX = Math.round(x);
    const baseY = Math.round(y);
    const canUseBitmapCache = canReuseStatic && finalW > 0 && finalH > 0;
    const bitmapCacheKey = canUseBitmapCache ? quickBitmapKey || `${staticKey}|${finalW}|${finalH}` : null;
    const cachedBitmap = canUseBitmapCache ? getTriggerBitmapCache(node, config.key) : null;

    if (cachedBitmap && cachedBitmap.key === bitmapCacheKey && cachedBitmap.bitmap) {
        ctx.drawImage(cachedBitmap.bitmap, baseX, baseY, finalW, finalH);
        if (profileStart) bumpTriggerWallWidgetProfile(node, performance.now() - profileStart);
        return;
    }

    if (!isTextOnly) {
        if (guardNoFx) drawFastBox(ctx, baseX, baseY, finalW, finalH, bodyPaintOut, bodyPaintOut?.fill);
        else masterPainter(ctx, { posX: baseX, posY: baseY, width: finalW, height: finalH, color: bodyPaintOut.fill, paintData: bodyPaintOut });
    }

    const alignX = props.labelAlign?.[0] || "left";
    let startX = baseX + padL;
    const contentWNoPad = indicatorBuffer + labelW;
    if (isWeightVisible) {
        if (alignX === "center") startX = baseX + (finalW / 2) - (contentWNoPad / 2);
        else if (alignX === "right") startX = baseX + finalW - padR - contentWNoPad;
    }

    startX = Math.round(startX);

    const tX = startX;
    const tY = Math.round(baseY + padT + (finalH - padT - padB - tH) / 2);
    if (isWeightVisible) {
        if (guardNoFx) {
            drawFastBox(ctx, tX, tY, tW, tH, slotPaintOut, slotPaintOut?.fill);
        } else {
            masterPainter(ctx, {
                posX: tX, posY: tY, width: tW, height: tH,
                color: slotPaintOut?.fill,
                paintData: slotPaintOut
            });
        }
    }

    if (isWeightVisible) {
        if (guardNoFx) {
            drawFastText(ctx, weightText, tX + (tW / 2), tY + (tH / 2), labelPaintOut, {
                fontSize: weightFontSize,
                fontWeight: props.fontWeight || labelPaintOut.fontWeight,
                align: "center",
                baseline: "middle"
            });
        } else {
            masterPainterText(ctx, {
                x: tX + (tW / 2),
                y: tY + (tH / 2),
                width: tW,
                height: tH,
                text: weightText,
                paintData: { ...labelPaintOut, fontSize: weightFontSize, fontWeight: props.fontWeight || labelPaintOut.fontWeight },
                align: "center",
                baseline: "middle"
            });
        }
    }

    const textStartX = Math.round(baseX + padL + indicatorBuffer);
    const availW = Math.max(0, finalW - padL - indicatorBuffer - padR);
    if (labelText.length > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(textStartX, baseY, Math.round(availW), finalH);
        ctx.clip();
        if (guardNoFx) {
            drawFastText(ctx, labelText, textStartX, textAnchor?.y ? Math.round(textAnchor.y) : Math.round(baseY + finalH / 2), labelPaintOut, {
                fontSize: themeFontSize,
                fontWeight: props.fontWeight,
                align: "left",
                baseline: props.labelAlign?.[1] || "middle"
            });
        } else {
            masterPainterText(ctx, {
                x: textStartX,
                y: (!isDragging && textAnchor?.y) ? Math.round(textAnchor.y) : Math.round(baseY + finalH / 2),
                width: availW,
                height: finalH,
                text: labelText,
                paintData: { ...labelPaintOut, fontSize: themeFontSize, fontWeight: props.fontWeight },
                align: "left",
                baseline: props.labelAlign?.[1] || "middle",
                cutoff: true
            });
        }
        ctx.restore();
    }

    if (saved) ctx.restore();

    if (canUseBitmapCache) {
        const bitmap = createTriggerBitmap(finalW, finalH);
        const bitmapCtx = bitmap?.getContext?.("2d");
        if (bitmapCtx) {
            if (!isTextOnly) {
                masterPainter(bitmapCtx, {
                    posX: 0, posY: 0, width: finalW, height: finalH,
                    color: bodyPaintOut.fill, paintData: bodyPaintOut
                });
            }

            if (isWeightVisible) {
                masterPainter(bitmapCtx, {
                    posX: tX - baseX, posY: tY - baseY, width: tW, height: tH,
                    color: slotPaintOut?.fill,
                    paintData: slotPaintOut
                });

                masterPainterText(bitmapCtx, {
                    x: (tX - baseX) + (tW / 2),
                    y: (tY - baseY) + (tH / 2),
                    width: tW,
                    height: tH,
                    text: weightText,
                    paintData: { ...labelPaintOut, fontSize: weightFontSize, fontWeight: props.fontWeight || labelPaintOut.fontWeight },
                    align: "center",
                    baseline: "middle"
                });
            }

            if (labelText.length > 0) {
                bitmapCtx.save();
                bitmapCtx.beginPath();
                bitmapCtx.rect(textStartX - baseX, 0, Math.round(availW), finalH);
                bitmapCtx.clip();
                masterPainterText(bitmapCtx, {
                    x: textStartX - baseX,
                    y: Math.round(finalH / 2),
                    width: availW,
                    height: finalH,
                    text: labelText,
                    paintData: { ...labelPaintOut, fontSize: themeFontSize, fontWeight: props.fontWeight },
                    align: "left",
                    baseline: props.labelAlign?.[1] || "middle",
                    cutoff: true
                });
                bitmapCtx.restore();
            }

            setTriggerBitmapCache(node, config.key, { key: bitmapCacheKey, bitmap });
        }
    }

    if (triggerWallNode) bumpTriggerWallWidgetProfile(node, performance.now() - profileStart);
}

export const syncDerpCompositeTrigger = syncDerpTrigger;
