/**
 * Path: ./Herbina/widgets/widget_SliderV2.js
 * ROLE: Slider V2 widget foundation. Numeric behavior is owned by sliderV2Value.js;
 * Canvas rendering temporarily reuses the mature V1 slider painter while HTML is V2-owned.
 */
import { syncDerpSliderCanvas } from "./widget_Slider.js";
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { animateWidgetColors } from "../masterAnimator.js";
import {
    applyInteractionStyles,
    calculateScreenCoords,
    colorSegmentsToHTML,
    getAlignmentMaps,
    resolveInterpolatedPaint,
    resolvePaintData,
    resolveWidgetEnv,
} from "../utils/widgetsUtils.js";
import {
    getSliderV2HorizontalMetrics,
    getSliderV2Percent,
    normalizeSliderV2RenderPath,
    sliderV2LocalXFromClientX,
} from "./helpers/sliderV2Value.js";
import {
    createDerpSliderV2,
    prepareSliderV2Config,
    setSliderV2ValueFromInteraction,
} from "./helpers/sliderV2Config.js";

export {
    createDerpSliderV2,
    prepareSliderV2Config,
    resetSliderV2,
    resolveSliderV2Interaction,
    setSliderV2Value,
    setSliderV2ValueFromInteraction,
    stepSliderV2,
} from "./helpers/sliderV2Config.js";

const BTN_LR_FONTSIZE = 6;
const BTN_LR_HEIGHTOFFSET = 1;
const FILLBAR_KNOBOFFSET = 1;
const FILLBAR_MARGIN = 0;

export function getSliderV2RenderPath() {
    const globalValue = globalThis.DERP_GLOBAL_SETTINGS?.sliderV2RenderPath;
    const storedValue = globalThis.app?.ui?.settings?.getSettingValue?.("Derp.SliderV2RenderPath");
    return normalizeSliderV2RenderPath(globalValue || storedValue || "canvas");
}

function removeSliderV2HTMLElement(node, key) {
    const el = node?._derpDomElements?.[key];
    if (!el) return;
    el.remove?.();
    delete node._derpDomElements[key];
}

function ensureSliderV2HTMLElement(node, config) {
    if (!node || !config?.key) return null;
    if (!node._derpDomElements) node._derpDomElements = {};
    let el = node._derpDomElements[config.key];
    if (!el) {
        el = document.createElement("div");
        el.className = "derp-slider-v2-html";
        el.style.willChange = "transform, opacity";
        document.body.appendChild(el);
        node._derpDomElements[config.key] = el;
    }
    return el;
}

function ensureSliderV2Child(el, className) {
    let child = el.querySelector(`.${className}`);
    if (!child) {
        child = document.createElement("div");
        child.className = className;
        el.appendChild(child);
    }
    return child;
}

function removeSliderV2Child(el, className) {
    el.querySelector(`.${className}`)?.remove?.();
}

function setSliderV2ChildRect(child, geometry, x, y, w, h, scale) {
    Object.assign(child.style, {
        left: `${(x - geometry.x) * scale}px`,
        top: `${(y - geometry.y) * scale}px`,
        width: `${Math.max(0, w) * scale}px`,
        height: `${Math.max(0, h) * scale}px`,
    });
}

function resolveSliderV2FillRect(geometry, metrics, config) {
    let fillH = metrics.fullFillH;
    let fillY = geometry.y + metrics.fillPadding[0];
    if (config.fillbarHeight != null) {
        const fillbarHeight = Number(config.fillbarHeight);
        if (Number.isFinite(fillbarHeight)) {
            const baseH = fillbarHeight > 1
                ? Math.min(geometry.h, Math.max(0, fillbarHeight))
                : geometry.h * Math.max(0.2, Math.min(1.0, fillbarHeight));
            fillH = Math.max(0, baseH - metrics.fillPadding[0] - metrics.fillPadding[2]);
            fillY = geometry.y + (geometry.h - baseH) / 2 + metrics.fillPadding[0];
        }
    }
    return { fillH, fillY };
}

function resolveSliderV2FillCorners(paintData, fillW, fillH) {
    const source = paintData?.corners;
    const maxCorner = Math.max(0, fillH / 2);
    const coerce = (value) => {
        const n = Number(value) || 0;
        const sign = n < 0 ? -1 : 1;
        return Math.min(Math.abs(n), maxCorner, Math.max(0, fillW / 2)) * sign;
    };
    if (Array.isArray(source)) return [coerce(source[0]), 0, 0, coerce(source[3])];
    return [coerce(source), 0, 0, coerce(source)];
}

function getSliderV2FontWeight(config, props, paintData) {
    return config.fontWeight || paintData?.fontWeight || props.fontWeight || "normal";
}

function applySliderV2Theme(el, paintData, scale, fallbackColor = null) {
    if (!el) return;
    if (paintData) {
        const themedPaint = fallbackColor && !paintData.fill ? { ...paintData, fill: fallbackColor } : paintData;
        applyHTMLTheme(el, themedPaint, scale);
        return;
    }
    Object.assign(el.style, {
        backgroundColor: fallbackColor || "transparent",
        border: "none",
        boxShadow: "none",
        filter: "none",
        borderRadius: "0px",
        clipPath: "none",
        webkitClipPath: "none",
    });
}

function syncSliderV2HTMLLabel(el, node, config, props, labelPaint, iconColor, colorSegments, hasColorKeys, scale) {
    const sliderLabel = props.label !== "" ? props.displayText : null;
    if (!sliderLabel) {
        removeSliderV2Child(el, "derp-slider-v2-label");
        return;
    }

    const label = ensureSliderV2Child(el, "derp-slider-v2-label");
    const [alignX, alignY] = props.labelAlign || ["center", "middle"];
    const maps = getAlignmentMaps();
    const fontWeight = getSliderV2FontWeight(config, props, labelPaint);
    const fontSize = props.fontSize || labelPaint?.fontSize || 10;
    const font = labelPaint?.font || "arial";

    if (hasColorKeys) label.innerHTML = colorSegmentsToHTML(colorSegments, iconColor);
    else label.textContent = sliderLabel;

    Object.assign(label.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: maps.align[alignY] || "center",
        justifyContent: maps.justify[alignX] || "center",
        boxSizing: "border-box",
        pointerEvents: "none",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textAlign: alignX,
        padding: `${(props.padding?.[1] || 0) * scale}px ${(props.padding?.[0] || 0) * scale}px`,
        color: iconColor,
        fontFamily: font,
        fontSize: `${fontSize * scale}px`,
        fontWeight,
        fontStyle: "normal",
        zIndex: "4",
    });
}

function syncSliderV2HTMLButtons(el, node, config, env, metrics, scale, paints, iconColor, fontWeight) {
    const { geometry } = config;
    if (!config.btnLR || metrics.btnW <= 0) {
        removeSliderV2Child(el, "derp-slider-v2-btn-left");
        removeSliderV2Child(el, "derp-slider-v2-btn-right");
        return;
    }

    const { props, stateStr, bodyPaint: paintData } = env;
    const { fillKey, activeData, btnLRData } = paints;
    const btnY = geometry.y + metrics.fillPadding[0] - BTN_LR_HEIGHTOFFSET;
    const btnH = Math.max(0, metrics.fullFillH + (BTN_LR_HEIGHTOFFSET * 2));
    const value = Number(config.value) || 0;
    const atMin = value <= config.min;
    const atMax = value >= config.max;
    const disabledPaint = resolvePaintData(node, "#slider_btnLR", "_DIS", config.btnColor)
        || resolvePaintData(node, fillKey, "_DIS", config.btnColor)
        || paintData;
    const btnSource = btnLRData || (config.style === "knob" ? paintData : (activeData || paintData));
    const leftPaint = (stateStr === "DIS" || atMin) ? disabledPaint : btnSource;
    const rightPaint = (stateStr === "DIS" || atMax) ? disabledPaint : btnSource;

    const syncButton = (className, sign, x, paint, flatCorners) => {
        const btn = ensureSliderV2Child(el, className);
        const sideClass = className.endsWith("-left") ? "derp-slider-btnlr-left" : "derp-slider-btnlr-right";
        btn.className = `${className} derp-slider-v2-btn derp-slider-btnlr ${sideClass}`;
        btn.textContent = sign;
        setSliderV2ChildRect(btn, geometry, x, btnY, metrics.btnW, btnH, scale);
        const corners = Array.isArray(paint?.corners) ? flatCorners(paint.corners) : flatCorners([paint?.corners || 0, paint?.corners || 0, paint?.corners || 0, paint?.corners || 0]);
        applySliderV2Theme(btn, { ...(paint || {}), corners }, scale, paint?.fill || config.btnColor || "#555");
        Object.assign(btn.style, {
            position: "absolute",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            userSelect: "none",
            boxSizing: "border-box",
            overflow: "hidden",
            color: iconColor,
            fontSize: `${BTN_LR_FONTSIZE * scale}px`,
            fontWeight,
            zIndex: "3",
        });
    };

    syncButton(
        "derp-slider-v2-btn-left",
        "-",
        geometry.x + metrics.btnMargin,
        leftPaint,
        (corners) => [corners[0] || 0, 1, 1, corners[3] || 0]
    );
    syncButton(
        "derp-slider-v2-btn-right",
        "+",
        geometry.x + geometry.w - metrics.btnW - metrics.btnMargin,
        rightPaint,
        (corners) => [1, corners[1] || 0, corners[2] || 0, 1]
    );

    // Keep the shared V2 root handler responsible for button hit testing.
    el.querySelectorAll(".derp-slider-btnlr").forEach((btn) => {
        btn.style.pointerEvents = "none";
    });
}

function syncSliderV2HTMLVisuals(el, node, app, config) {
    if (!el || !config.geometry) return;
    const { x, y, w, h } = config.geometry;
    const coords = calculateScreenCoords(node, app || globalThis.app, x, y, w, h);
    if (!coords) return;
    el.classList?.add?.("derp-slider-v2-html");

    const env = resolveWidgetEnv(node, config, app || globalThis.app, el);
    const { props, stateStr, bodyPaint: paintData, labelPaint: labelData, alpha, colorSegments, hasColorKeys } = env;
    const scale = coords.scale || 1;
    const metrics = getSliderV2HorizontalMetrics(config.geometry, config);
    const percent = getSliderV2Percent(config.value, config);
    const htmlStyle = config.htmlStyle || config.style;
    const fontWeight = getSliderV2FontWeight(config, props, labelData);

    const backgroundPaintRaw = resolvePaintData(node, "#slider_background", `_${stateStr}`, config.btnColor) || paintData;
    const rawBg = backgroundPaintRaw?.fill || config.btnColor || "transparent";
    const rawIc = labelData?.textColor || labelData?.fill || "red";
    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, `_derpSliderV2_html_anim_${config.key}`, rawBg, rawIc, alpha, useAnim);
    if (isAnimating && node) node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 5);

    applyInteractionStyles(el, config, stateStr);
    Object.assign(el.style, {
        position: "fixed",
        left: coords.left,
        top: coords.top,
        width: coords.width,
        height: coords.height,
        display: "block",
        boxSizing: "border-box",
        overflow: "visible",
        backgroundColor: "transparent",
        border: "none",
        boxShadow: "none",
        touchAction: "none",
        userSelect: "none",
        zIndex: String(config.zIndex ?? node?._masterZHtml ?? el.style.zIndex ?? 10001),
    });

    const bg = ensureSliderV2Child(el, "derp-slider-v2-background");
    const backgroundX = config.btnLR ? metrics.leftButtonEnd : x;
    const backgroundW = config.btnLR ? Math.max(0, metrics.rightButtonStart - metrics.leftButtonEnd) : w;
    setSliderV2ChildRect(bg, config.geometry, backgroundX, y, backgroundW, h, scale);
    const backgroundPaint = config.btnLR ? { ...(backgroundPaintRaw || {}), corners: [0, 0, 0, 0], fill: fillColor } : { ...(backgroundPaintRaw || {}), fill: fillColor };
    applySliderV2Theme(bg, backgroundPaint, scale, fillColor);
    Object.assign(bg.style, {
        position: "absolute",
        pointerEvents: "none",
        boxSizing: "border-box",
        zIndex: "0",
    });

    const fillKey = props.fillKey || props.bodyKey;
    const fillSuffix = props.fillKey ? "_OFF" : "_ON";
    const fillbarKey = resolvePaintData(node, "#slider_fillbar", fillSuffix, config.btnColor) ? "#slider_fillbar" : fillKey;
    const activeData = (stateStr === "DIS") ? paintData : (
        props.fillStrength
            ? resolveInterpolatedPaint(node, fillbarKey, percent, config.btnColor, config.palette)
            : (resolvePaintData(node, fillbarKey, fillSuffix, config.btnColor) || paintData)
    );
    const fillRect = resolveSliderV2FillRect(config.geometry, metrics, props);
    const knobW = htmlStyle === "knob" ? metrics.knobW : 0;
    const knobX = metrics.trackStart + metrics.knobTravelW * percent;
    const fillProgressW = htmlStyle === "knob"
        ? Math.max(0, (knobX + knobW / 2) - metrics.trackStart)
        : Math.max(0, (metrics.trackStart + metrics.trackW * percent + 1) - metrics.trackStart);
    const fillbarDrawX = metrics.trackStart + Math.max(0, FILLBAR_MARGIN);
    const fillbarDrawW = Math.max(0, fillProgressW - Math.max(0, FILLBAR_MARGIN));
    const fill = ensureSliderV2Child(el, "derp-slider-v2-fill");
    if (activeData && percent > 0 && fillbarDrawW > 0 && fillRect.fillH > 0) {
        setSliderV2ChildRect(fill, config.geometry, fillbarDrawX, fillRect.fillY, fillbarDrawW, fillRect.fillH, scale);
        applySliderV2Theme(fill, { ...activeData, corners: resolveSliderV2FillCorners(activeData, fillbarDrawW, fillRect.fillH) }, scale, activeData.fill);
        Object.assign(fill.style, {
            position: "absolute",
            pointerEvents: "none",
            boxSizing: "border-box",
            display: "block",
            zIndex: "1",
        });
    } else {
        fill.style.display = "none";
    }

    const knob = ensureSliderV2Child(el, "derp-slider-v2-knob");
    if (htmlStyle === "knob" && knobW > 0) {
        const knobSuffix = stateStr === "DIS" ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");
        const knobData = resolvePaintData(node, "#slider_knob", knobSuffix, config.btnColor)
            || resolvePaintData(node, fillKey, knobSuffix, config.btnColor)
            || paintData;
        const knobHeightOffset = Number.isFinite(Number(props.knobHeightOffset ?? config.knobHeightOffset)) ? Math.max(-5, Math.min(5, Number(props.knobHeightOffset ?? config.knobHeightOffset))) : 0;
        const knobRadiusOffset = Number.isFinite(Number(props.knobRadiusOffset ?? config.knobRadiusOffset)) ? Math.max(-3, Math.min(3, Number(props.knobRadiusOffset ?? config.knobRadiusOffset))) : 0;
        const finalKnobH = metrics.fullFillH + (FILLBAR_KNOBOFFSET * 2) + (knobHeightOffset * 2);
        const finalKnobY = y + metrics.fillPadding[0] - FILLBAR_KNOBOFFSET - knobHeightOffset;
        const roundKnob = (props.roundKnob ?? config.roundKnob) !== false;
        let drawX = knobX;
        let drawY = finalKnobY;
        let drawW = knobW;
        let drawH = finalKnobH;
        let corners = knobData?.corners;
        if (roundKnob) {
            const radius = Math.max(0, (Math.min(knobW, finalKnobH) / 2) + knobRadiusOffset);
            drawW = radius * 2;
            drawH = radius * 2;
            drawX = knobX + (knobW / 2) - radius;
            drawY = finalKnobY + (finalKnobH / 2) - radius;
            corners = [radius, radius, radius, radius];
        }
        setSliderV2ChildRect(knob, config.geometry, drawX, drawY, drawW, drawH, scale);
        applySliderV2Theme(knob, { ...(knobData || {}), corners }, scale, knobData?.fill || config.btnColor);
        Object.assign(knob.style, {
            position: "absolute",
            pointerEvents: "none",
            boxSizing: "border-box",
            display: "block",
            zIndex: "2",
        });
    } else {
        knob.style.display = "none";
    }

    const btnLRData = resolvePaintData(node, "#slider_btnLR", stateStr === "DIS" ? "_DIS" : "_OFF", config.btnColor);
    syncSliderV2HTMLButtons(el, node, config, env, metrics, scale, { fillKey, activeData, btnLRData }, iconColor, fontWeight);
    syncSliderV2HTMLLabel(el, node, config, props, labelData, iconColor, colorSegments, hasColorKeys, scale);
}

export function syncDerpSliderV2Canvas(ctx, node, app, config) {
    const safeConfig = prepareSliderV2Config(config);
    if (getSliderV2RenderPath() === "html") {
        const el = ensureSliderV2HTMLElement(node, safeConfig);
        if (!el) return;
        return syncDerpSliderV2HTML(el, node, app, safeConfig);
    }
    removeSliderV2HTMLElement(node, safeConfig.key);
    return syncDerpSliderCanvas(ctx, node, safeConfig);
}

export function syncDerpSliderV2HTML(el, node, app, config) {
    const safeConfig = prepareSliderV2Config(config);
    syncSliderV2HTMLVisuals(el, node, app, safeConfig);
    syncSliderV2HTMLInteraction(el, node, safeConfig);
}

function requestSliderV2Refresh(node) {
    if (typeof node?.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    else if (typeof node?.requestDerpSync === "function") node.requestDerpSync();
}

function applySliderV2HTMLPointer(el, node, config, event, type, options = {}) {
    const rect = el.getBoundingClientRect();
    const localX = sliderV2LocalXFromClientX(event?.clientX, rect, config.geometry);
    const result = setSliderV2ValueFromInteraction(config, config.geometry, localX, type, options);
    if (result.handled && result.value !== undefined) {
        config.value = result.value;
        requestSliderV2Refresh(node);
    }
    return result;
}

function syncSliderV2HTMLInteraction(el, node, config) {
    if (!el || !config?.geometry) return;
    el.querySelectorAll(".derp-slider-btnlr").forEach((btn) => {
        btn.style.pointerEvents = "none";
    });
    if (String(config.state || "").toUpperCase() === "DIS") {
        el.onpointerdown = null;
        el.ondblclick = null;
        return;
    }
    el.ondblclick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        applySliderV2HTMLPointer(el, node, config, event, "dblclick");
    };
    el.onpointerdown = (event) => {
        event.stopPropagation();
        event.preventDefault();
        el.setPointerCapture?.(event.pointerId);
        const startResult = applySliderV2HTMLPointer(el, node, config, event, "dragStart");
        if (startResult.action === "stepMinus" || startResult.action === "stepPlus" || startResult.action === "trackGap" || startResult.action === "buttonDblClick") {
            el.onpointermove = null;
            el.onpointerup = (upEvent) => {
                el.onpointerup = null;
                el.onpointercancel = null;
                el.releasePointerCapture?.(upEvent.pointerId);
            };
            return;
        }
        el.onpointermove = (moveEvent) => applySliderV2HTMLPointer(el, node, config, moveEvent, "drag");
        el.onpointerup = (upEvent) => {
            applySliderV2HTMLPointer(el, node, config, upEvent, "dragEnd", { commit: true });
            el.onpointermove = null;
            el.onpointerup = null;
            el.releasePointerCapture?.(upEvent.pointerId);
        };
        el.onpointercancel = () => {
            el.onpointermove = null;
            el.onpointerup = null;
            el.onpointercancel = null;
        };
    };
}
