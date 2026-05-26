/**
 * Path: ./Herbina/widgets/widget_Slider.js
 * ROLE: Canvas-based rendering and factory for Slider widgets.
 * COMPATIBILITY: Proxies HTML logic to widget_SliderHTML.js
 *
 * Accepted config parameters:
 * - `key`: Unique widget key used for animation-state binding (e.g., `_derpSlider_anim_${key}`).
 * - `geometry`: Required `{ x, y, w, h }` canvas rect for the slider track.
 * - `value`: Current slider value. Defaults to `0.5`.
 * - `min`: Minimum slider value. Defaults to `0`.
 * - `max`: Maximum slider value. Defaults to `1`.
 * - `step`: Step increment for btnLR buttons and track-click snapping. Defaults to `0.05`.
 * - `label` | `text`: Label string displayed on the slider track. Defaults to `""`.
 * - `fontWeight`: Label weight — `"normal"`, `"bold"`, `"italic"`, or `"both"`. Defaults to `"normal"`.
 * - `themeKey`: Main theme string used to resolve body and label paint data. Defaults to `"panel, t_textsmall"`.
 * - `fillStrength`: If `true` (default), interpolates the fill color between theme states based on the slider value. If `false`, uses a single `_ON` / `_OFF` paint state.
 * - `fillPadding`: Optional `[top, right, bottom, left]` inset array shrinking the progress fill bar inside the track.
 * - `fillKey`: Optional theme-key override for the progress fill. When set, fillStrength interpolation uses `<fillKey>` as the base. Falls back to `bodyKey` when absent.
 * - `bodyKey`: Theme key used for fill-paint resolution when `fillKey` is not set.
 * - `onChange`: Callback fired as `onChange(newValue)` whenever the slider value changes.
 * - `btnColor`: Optional background-color override for the track and fill, used as a fallback when theme paint data is missing.
 * - `labelColor`: Optional label and icon color override, used as a fallback when theme label paint is missing.
 * - `btnLR`: If truthy, renders `-` / `+` stepper buttons on the left and right edges of the track.
 * - `showAnim`: Set to `false` to disable animated color transitions. Defaults to `true`.
 * - `palette`: Optional palette source passed through to `resolveInterpolatedPaint` for fill-color interpolation.
 * - `labelAlign`: Optional `[horizontal, vertical]` alignment for the label text. Defaults to `["center", "middle"]`.
 * - `padding`: Optional `[x, y]` inner padding applied to label text positioning.
 * - `displayText`: Override string for the label drawn on the slider. When set, this is drawn instead of `label` / `text`.
 * - `alpha`: Optional opacity override for the entire widget (`0`–`1`). Defaults to `1`.
 * - `fontSize`: Optional font-size override for the label text. Falls back to the theme's label `fontSize` or `10`.
 * - `style`: Drawing style variant. Currently `"default"` (the only style). Defaults to `"default"` when omitted.
 *
 * Terminology — named parts of the Slider widget:
 * - `Track`: The full-width background rounded rect that spans the entire widget. Drawn first.
 * - `fillBar`: The colored progress portion of the track, inset by fillPadding. Grows from the
 *   left edge in proportion to (value - min) / (max - min). Also called "Progress Fill" in comments.
 * - `fillPadding`: Optional [top, right, bottom, left] inset that shrinks the fillBar inside the
 *   Track without shrinking the Track itself.
 * - `btnLR`: The - / + stepper buttons rendered on the left and right edges of the Track. Sized
 *   relative to the fillBar height (BTN_LR_RATIO). Toggled by config.btnLR.
 * - `label`: The text string drawn on top of the Track. Uses displayText (preferred) or label/text.
 *   Positioned by labelAlign and padding.
 * - `fillStrength`: A boolean mode flag controlling fillBar color resolution. When true, the fill
 *   color is interpolated between theme states based on the slider value. When false, a single
 *   _ON / _OFF paint state is used.
 * - `fillKey` / `bodyKey`: Theme keys used to resolve which paint data colors the fillBar.
 *   fillKey takes precedence; bodyKey is the fallback.
 * - `themeKey`: The main theme string ("panel, t_textsmall") that resolves body paint (Track) and
 *   label paint (label) for the entire widget.
 * - `paintData`: Resolved theme paint object for the Track background (body paint).
 * - `labelData`: Resolved theme paint object for the label text (label paint).
 * - `corners`: Rounded corner radii applied to the Track, read from paintData.corners.
 * - `step`: The increment/decrement value used by btnLR clicks and track-click value snapping.
 *
 * Maintenance rule:
 * - Keep this parameter list in sync whenever this widget gains, removes, or changes accepted config parameters.
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

var BTN_LR_RATIO = 0.75;
var BTN_LR_FONTSIZE = 6;
var BTN_LR_MARGIN = 1;

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
        labelColor: callbacks.labelColor || null,
        style: callbacks.style ?? "default"
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

    const style = config.style ?? "default";
    if (style !== "default") return;

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

window.handleDerpSliderBtnLR = function(node, reg, targetKey, type, localX, config) {
    if ((config?.style ?? "default") !== "default") return { handled: false };
    const btnLR = config?.btnLR;
    if (!btnLR) return { handled: false };
    const btnW = Math.round((reg.h || 14) * BTN_LR_RATIO);
    const mrg = BTN_LR_MARGIN;
    if (type === "dblclick") {
        if (localX >= reg.x + mrg && localX <= reg.x + mrg + btnW) return { handled: true };
        if (localX >= reg.x + reg.w - btnW - mrg && localX <= reg.x + reg.w - mrg) return { handled: true };
        return { handled: false };
    }
    if (type === "dragStart" || type === "click") {
        const step = parseFloat(config.step ?? 0.05);
        const cMin = parseFloat(config.min ?? 0);
        const cMax = parseFloat(config.max ?? 1);
        const curVal = parseFloat(config.value ?? cMin);
        if (localX >= reg.x + mrg && localX <= reg.x + mrg + btnW) return { handled: true, newVal: Math.max(cMin, curVal - step) };
        if (localX >= reg.x + reg.w - btnW - mrg && localX <= reg.x + reg.w - mrg) return { handled: true, newVal: Math.min(cMax, curVal + step) };
    }
    if (type === "dragStart" || type === "click") {
        const trackStart = reg.x + mrg + btnW;
        const trackEnd = reg.x + reg.w - mrg - btnW;
        if (localX < trackStart || localX > trackEnd) return { handled: true };
    }
    if (type === "click") {
        const cMin = parseFloat(config.min ?? 0);
        const cMax = parseFloat(config.max ?? 1);
        const curVal = parseFloat(config.value ?? cMin);
        const fillPercent = Math.max(0, Math.min(1, (curVal - cMin) / (cMax - cMin)));
        const trackX = reg.x + mrg + btnW;
        const trackW = Math.max(0, reg.w - (btnW + mrg) * 2);
        const fillRight = trackX + fillPercent * trackW;
        if (localX < trackX || localX > fillRight) return { handled: true };
        const cStep = parseFloat(config.step ?? 0.05);
        const percent = Math.max(0, Math.min(1, (localX - trackX) / trackW));
        const rawVal = cMin + (percent * (cMax - cMin));
        return { handled: true, newVal: Math.max(cMin, Math.min(cMax, Math.round(rawVal / cStep) * cStep)) };
    }
    return { handled: false };
}