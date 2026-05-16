/**
 * Path: ./Herbina/widgets/widget_Slider.js
 * ROLE: Canvas-based rendering and factory for Slider widgets.
 * COMPATIBILITY: Proxies HTML logic to widget_SliderHTML.js
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    resolveInterpolatedPaint
} from "../utils/widgetsUtils.js";
import { animateWidgetColors } from "../masterAnimator.js";

// Import the HTML painter logic for the compatibility proxy
import { syncDerpSliderHTML as syncHTML } from "./widget_SliderHTML.js";

const BTN_LR_RATIO = 0.75;
const BTN_LR_FONTSIZE = 6;
const BTN_LR_MARGIN = 1;

/**
 * Default properties for the Slider widget.
 */
export function createDerpSlider(callbacks = {}) {
    return {
        type: "slider",
        value: callbacks.value ?? 0.5,
        min: callbacks.min ?? 0,
        max: callbacks.max ?? 1,
        label: callbacks.label || callbacks.text || "",
        fontWeight: callbacks.fontWeight || "normal",
        themeKey: callbacks.themeKey || "panel, t_textsmall",
        fillStrength: callbacks.fillStrength ?? true,
        fillPadding: callbacks.fillPadding || null,
        onChange: callbacks.onChange || null,
        btnColor: callbacks.btnColor || null,
        labelColor: callbacks.labelColor || null
    };
}

/**
 * COMPATIBILITY PROXY: Forwards HTML sync requests to the dedicated HTML module.
 */
export function syncDerpSliderHTML(el, node, app, config) {
    return syncHTML(el, node, app, config);
}

/**
 * Canvas-based Slider Painter
 */
export function syncDerpSliderCanvas(ctx, node, config) {
    if (!config.geometry) return;
    const { x, y, w, h } = config.geometry;

    // 1. Resolve Environment
    const { props, stateStr, bodyPaint: paintData, labelPaint: labelData, alpha } = resolveWidgetEnv(node, config);

    // 2. Centralized Animated Colors & Alpha
    const rawBg = paintData?.fill || config.btnColor || "transparent";
    // THE THEME FIX: Removed hardcoded DIS alpha override so the _DIS theme key is strictly respected
    let rawIc = labelData?.textColor || labelData?.fill || "red";

    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const sysAlpha = alpha;

    if (alpha <= 0) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    const animKey = `_derpSlider_anim_${config.key}`;

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);
    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    const finalPaint = {
        ...(labelData || {}),
        font: labelData?.font || "arial",
        fontSize: props.fontSize || labelData?.fontSize || 10,
        fontWeight: props.fontWeight || "normal",
        fill: iconColor
    };

    // 1. Draw Background Track (Animated)
    if (paintData) {
        masterPainter(ctx, {
            posX: x, posY: y, width: w, height: h,
            paintData: paintData, color: fillColor
        });
    }

    // 2. Draw Progress Bar (The Fill)
    const value = parseFloat(config.value) || 0;
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    const percent = Math.max(0, Math.min(1, (value - min) / (max - min)));

    const ins = props.fillPadding || [0, 0, 0, 0];
    const fillH = Math.max(0, h - ins[0] - ins[2]);
    // btnLR: button width = 75% of fill bar height
    const btnInset = config.btnLR ? Math.round(fillH * BTN_LR_RATIO) + BTN_LR_MARGIN : 0;

    // THE FILL STRENGTH FIX: If active, interpolate between states based on value.
    const fillKey = props.fillKey || props.bodyKey;
    const fillSuffix = props.fillKey ? "_OFF" : "_ON";

    const activeData = (stateStr === "DIS") ? paintData : (
        props.fillStrength ?
            resolveInterpolatedPaint(node, fillKey, percent, config.btnColor, config.palette) :
            (resolvePaintData(node, fillKey, fillSuffix, config.btnColor) || paintData)
    );

    if (activeData && percent > 0) {
        const fillW = Math.max(0, w - ins[1] - ins[3] - btnInset * 2);
        const progressW = fillW * percent;

        masterPainter(ctx, {
            posX: x + ins[3] + btnInset,
            posY: y + ins[0],
            width: progressW,
            height: fillH,
            paintData: activeData, color: activeData.fill
        });
    }

    // 3. Draw Optional Label
    const sliderLabel = (props.label !== "") ? props.displayText : null;
    if (sliderLabel) {
        const [alignX, alignY] = props.labelAlign || ["center", "middle"];
        const pX = props.padding[0];
        const pY = props.padding[1];

        // THE PERF FIX: Removed heavy ctx.clip() because props.displayText is already mathematically clamped by the layout engine.
        // This removes 5 state-change calls per slider per frame.
        masterPainterText(ctx, {
            x: (alignX === "center") ? x + (w / 2) : (alignX === "right" ? x + w - pX : x + pX),
            y: (alignY === "middle") ? y + (h / 2) : (alignY === "bottom" ? y + h - pY : y + pY),
            text: sliderLabel,
            paintData: { ...finalPaint, fill: iconColor },
            align: alignX, baseline: alignY
        });
    }
    // 4. Draw btnLR Buttons
    if (config.btnLR) {
        const btnW = Math.round(fillH * BTN_LR_RATIO);
        const btnY = y + ins[0];
        const btnH = fillH;
        const btnFill = activeData?.fill || paintData?.fill || config.btnColor || "#555";
        const btnPaint = { ...(activeData || paintData) };
        const btnTextPaint = { ...(labelData || {}), fill: iconColor, fontSize: BTN_LR_FONTSIZE };

        // Left button (-)
        masterPainter(ctx, {
            posX: x + BTN_LR_MARGIN, posY: btnY,
            width: btnW, height: btnH,
            paintData: btnPaint, color: btnFill
        });
        masterPainterText(ctx, {
            x: x + BTN_LR_MARGIN + btnW / 2, y: btnY + btnH / 2,
            text: "-",
            paintData: btnTextPaint,
            align: "center", baseline: "middle"
        });

        // Right button (+)
        masterPainter(ctx, {
            posX: x + w - btnW - BTN_LR_MARGIN, posY: btnY,
            width: btnW, height: btnH,
            paintData: btnPaint, color: btnFill
        });
        masterPainterText(ctx, {
            x: x + w - btnW / 2 - BTN_LR_MARGIN, y: btnY + btnH / 2,
            text: "+",
            paintData: btnTextPaint,
            align: "center", baseline: "middle"
        });
    }
    ctx.restore();
}