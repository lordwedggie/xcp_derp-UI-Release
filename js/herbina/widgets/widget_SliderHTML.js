/**
 * Path: ./Herbina/widgets/widget_SliderHTML.js
 * ROLE: HTML-based rendering and pointer interaction for Slider widgets.
 */
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { toRGBA } from "../utils/colorMath.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    resolveInterpolatedPaint,
    calculateScreenCoords,
    applyInteractionStyles,
    getAlignmentMaps
} from "../utils/widgetsUtils.js";
import { animateWidgetColors } from "../masterAnimator.js";

/**
 * HTML-based Slider Painter
 */
export function syncDerpSliderHTML(el, node, app, config) {
    if (!el || !config.geometry) return;

    const { x, y, w, h } = config.geometry;
    const coords = calculateScreenCoords(node, app, x, y, w, h);
    if (!coords) return;

    // 1. Resolve Environment
    const { props, stateStr, bodyPaint: paintData, labelPaint: labelData } = resolveWidgetEnv(node, config);

    // 2. Centralized Animated Colors & Alpha
    const rawBg = paintData?.fill || config.btnColor || "transparent";
    // THE THEME FIX: Removed hardcoded DIS alpha override so the _DIS theme key is strictly respected
    let rawIc = labelData?.textColor || labelData?.fill || "red";

    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const sysAlpha = config.alpha !== undefined ? config.alpha : 1;
    const animKey = `_derpSlider_html_anim_${config.key}`;

    const { fillColor, iconColor } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);

    applyInteractionStyles(el, config, stateStr);

    Object.assign(el.style, {
        position: "fixed", left: coords.left, top: coords.top,
        width: coords.width, height: coords.height,
        display: "flex", alignItems: "center",
        pointerEvents: (stateStr === "DIS") ? "none" : "auto",
        boxSizing: "border-box", overflow: "hidden"
    });

    if (paintData) applyHTMLTheme(el, { ...paintData, fill: fillColor }, coords.scale);

    let fill = el.querySelector(".derp-slider-fill");
    if (!fill) {
        fill = document.createElement("div");
        fill.className = "derp-slider-fill";
        Object.assign(fill.style, { position: "absolute", left: "0", top: "0", height: "100%", pointerEvents: "none" });
        el.appendChild(fill);
    }

    const min = config.min ?? 0;
    const max = config.max ?? 1;
    const value = Math.max(min, Math.min(max, config.value || 0));
    const percent = (value - min) / (max - min);

    // THE FILL STRENGTH FIX: If active, interpolate between states based on value.
    const fillKey = props.fillKey || props.bodyKey;
    const fillSuffix = props.fillKey ? "_OFF" : "_ON";

    const activeData = (stateStr === "DIS") ? paintData : (
        props.fillStrength ?
            resolveInterpolatedPaint(node, fillKey, percent, config.btnColor, config.palette) :
            (resolvePaintData(node, fillKey, fillSuffix, config.btnColor) || paintData)
    );

    // THE FILL PADDING FIX: Inset the fill bar using absolute positioning and calc-width
    const ins = props.fillPadding || [0, 0, 0, 0];
    const s = coords.scale;
    Object.assign(fill.style, {
        top: `${ins[0] * s}px`,
        left: `${ins[3] * s}px`,
        height: `${Math.max(0, h - ins[0] - ins[2]) * s}px`,
        width: `calc(${percent * 100}% - ${(ins[1] + ins[3]) * percent * s}px)`
    });

    if (activeData) applyHTMLTheme(fill, activeData, s);

    let label = el.querySelector(".derp-slider-label");
    const sliderLabel = props.displayText;
    if (sliderLabel) {
        if (!label) {
            label = document.createElement("div");
            label.className = "derp-slider-label";
            Object.assign(label.style, { position: "absolute", width: "100%", height: "100%", display: "flex", pointerEvents: "none", boxSizing: "border-box", whiteSpace: "nowrap" });
            el.appendChild(label);
        }
        label.innerText = sliderLabel;
        if (labelData) {
            label.style.color = iconColor;
            label.style.fontFamily = labelData.font || "arial";
            label.style.fontSize = `${(props.fontSize || labelData.fontSize || 10) * coords.scale}px`;

            label.style.fontWeight = (props.fontWeight === "bold" || props.fontWeight === "both") ? "bold" : "normal";
            label.style.fontStyle = (props.fontWeight === "italic" || props.fontWeight === "both") ? "italic" : "normal";

            const [alignX, alignY] = props.labelAlign || ["center", "middle"];
            const { justify: justifyMap, align: alignMap } = getAlignmentMaps();
            label.style.justifyContent = justifyMap[alignX] || "center";
            label.style.alignItems = alignMap[alignY] || "center";
            label.style.textAlign = alignX;
            label.style.padding = `${props.padding[1] * coords.scale}px ${props.padding[0] * coords.scale}px`;
        }
    } else if (label) label.remove();

    const updateValue = (e) => {
        if (stateStr === "DIS") return;
        const rect = el.getBoundingClientRect();
        const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newVal = min + p * (max - min);

        config.value = newVal;
        if (config.onChange) config.onChange(newVal);

        if (typeof node.setDirtyCanvas === "function") {
            node.setDirtyCanvas(true);
        } else if (node.requestDerpSync) {
            node.requestDerpSync();
        }
    };

    el.onpointerdown = (e) => {
        if (stateStr === "DIS") return;
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        updateValue(e);
        el.onpointermove = (ev) => updateValue(ev);
        el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; };
    };
}