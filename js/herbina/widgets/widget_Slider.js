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
 * - `fontWeight`: Label weight — CSS font weight such as `"normal"`, `"bold"`, or `"400"`–`"900"`. Defaults to `"normal"`.
 * - `themeKey`: Main theme string used to resolve body and label paint data. Defaults to `"panel, t_textsmall"`.
 * - `fillStrength`: If `true` (default), interpolates the fill color between theme states based on the slider value. If `false`, uses a single `_ON` / `_OFF` paint state.
 * - `fillPadding`: Optional `[top, right, bottom, left]` inset array shrinking the progress fill bar inside the track.
 * - `fillbarHeight`: Optional height override for the fillBar. Integer (e.g. `6`) = exact px.
 *   Float (e.g. `0.5`) = ratio of the track height. FillBar is vertically centered. Defaults to unset (fills track).
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
 * - `style`: Drawing style variant. Accepted values: `"default"`, `"knob"`. Defaults to `"default"`.
 * - `knobWidthScale`: Optional width multiplier for the knob style marker. Defaults to `1.0`.
 * - `knobHeightOffset`: Optional height offset added to the knob top and bottom. Defaults to `0`.
 * - `roundKnob`: Optional boolean that draws the knob as a themed circle when true. Defaults to `true`.
 * - `knobRadiusOffset`: Optional radius offset applied only when `roundKnob` is true. Defaults to `0`.
 * - Theme optional element keys: `#slider_background`, `#slider_fillbar`, `#slider_knob`, and
 *   `#slider_btnLR` can override the Background, fillBar, knob, and btnLR paint respectively.
 *
 * Terminology — named parts of the Slider widget:
 * - `Background`: The full-width background rounded rect that spans the entire widget. Drawn first.
 * - `fillBar`: The colored progress portion of the background, inset by fillPadding. Grows from the
 *   left edge in proportion to (value - min) / (max - min). Also called "Progress Fill" in comments.
 * - `fillPadding`: Optional [top, right, bottom, left] inset that shrinks the fillBar inside the
 *   Background without shrinking the Background itself.
 * - `fillbarHeight`: Optional height override for the fillBar. Integer = exact px, float = ratio of h.
 *   FillBar centers vertically. When unset, fillBar fills the track minus fillPadding.
 * - `knob`: (style "knob" only) A small square rect overlaid on the fillBar at its right edge.
 *   Drawn after the fillBar using the same paint data. Width/height equal to fillH.
 * - `knobWidthScale`: Multiplies the knob width while preserving the existing default width at `1.0`.
 * - `knobHeightOffset`: Adds extra height above and below the knob without changing knob width.
 * - `roundKnob`: Uses the smaller final knob dimension as a circle diameter when enabled.
 * - `knobRadiusOffset`: Adds to the calculated round knob radius when `roundKnob` is enabled.
 * - `btnLR`: The - / + stepper buttons rendered on the left and right edges of the Background. Sized
 *   relative to the fillBar height (BTN_LR_RATIO). Toggled by config.btnLR.
 * - `label`: The text string drawn on top of the Background. Uses displayText (preferred) or label/text.
 *   Positioned by labelAlign and padding.
 * - `fillStrength`: A boolean mode flag controlling fillBar color resolution. When true, the fill
 *   color is interpolated between theme states based on the slider value. When false, a single
 *   _ON / _OFF paint state is used.
 * - `fillKey` / `bodyKey`: Theme keys used to resolve which paint data colors the fillBar.
 *   fillKey takes precedence; bodyKey is the fallback.
 * - `themeKey`: The main theme string ("panel, t_textsmall") that resolves body paint (Background) and
 *   label paint (label) for the entire widget.
 * - `#slider_background`: Optional theme key that overrides Background paint while falling back to `themeKey`.
 * - `#slider_fillbar`: Optional theme key that overrides fillBar paint while falling back to `fillKey` / `bodyKey`.
 * - `#slider_knob`: Optional theme key that overrides knob paint while falling back to `fillKey` / `bodyKey`.
 * - `#slider_btnLR`: Optional theme key that overrides btnLR stepper paint while falling back to `fillKey` / `bodyKey`.
 * - `paintData`: Resolved theme paint object for the Background (body paint).
 * - `labelData`: Resolved theme paint object for the label text (label paint).
 * - `corners`: Rounded corner radii applied to the Background, read from paintData.corners.
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
var BTN_LR_MARGIN = 0;
var BTN_LR_HEIGHTOFFSET = 1;
var FILLBAR_KNOBOFFSET = 1;
var FILLBAR_MARGIN = 0;
var ROUND_KNOB = true;
var SLIDER_POS_LERP = 0.1;  // knob position lerp speed on track click

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
        fillbarHeight: callbacks.fillbarHeight ?? null,
        onChange: callbacks.onChange || null,
        btnColor: callbacks.btnColor || null,
        labelColor: callbacks.labelColor || null,
        style: callbacks.style ?? "default",
        knobWidthScale: callbacks.knobWidthScale ?? 1.0,
        knobHeightOffset: callbacks.knobHeightOffset ?? 0,
        roundKnob: callbacks.roundKnob ?? true,
        knobRadiusOffset: callbacks.knobRadiusOffset ?? 0
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

/**
 * Draw the knob marker for "knob" style sliders.
 * knobX is the absolute left-edge position (pre-computed by caller).
 */
function drawSliderKnobAbs(ctx, style, activeData, knobW, knobH, knobX, y, insTop, knobHeightOffset = 0, roundKnob = ROUND_KNOB, knobRadiusOffset = 0) {
    if (style !== "knob" || !activeData || knobW <= 0 || knobH <= 0) return;
    const finalKnobH = knobH + (FILLBAR_KNOBOFFSET * 2) + (knobHeightOffset * 2);
    const finalKnobY = y + insTop - FILLBAR_KNOBOFFSET - knobHeightOffset;
    if (roundKnob) {
        const radius = Math.max(0, (Math.min(knobW, finalKnobH) / 2) + knobRadiusOffset);
        if (radius <= 0) return;
        drawThemedCircle(ctx, knobX + (knobW / 2), finalKnobY + (finalKnobH / 2), radius, activeData, activeData.fill);
        return;
    }
    masterPainter(ctx, {
        posX: knobX,
        posY: finalKnobY,
        width: knobW,
        height: finalKnobH,
        paintData: activeData, color: activeData.fill
    });
}

function scaleAlpha(colorStr, factor) {
    if (!colorStr) return "transparent";
    const match = String(colorStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        const r = match[1];
        const g = match[2];
        const b = match[3];
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
        return `rgba(${r}, ${g}, ${b}, ${a * factor})`;
    }
    return colorStr;
}

function isTransparentColor(colorStr) {
    if (!colorStr) return true;
    const match = String(colorStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return false;
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
    return alpha <= 0.001;
}

function appendCirclePath(ctx, centerX, centerY, radius) {
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
}

function fillCircleWithShadow(ctx, centerX, centerY, radius, shadow, color, blurFactor, alphaFactor, offsetFactor) {
    ctx.shadowColor = scaleAlpha(shadow.color, alphaFactor);
    ctx.shadowBlur = shadow.blur * blurFactor;
    ctx.shadowOffsetX = shadow.offsetX * offsetFactor;
    ctx.shadowOffsetY = shadow.offsetY * offsetFactor;
    ctx.fillStyle = color;
    ctx.beginPath();
    appendCirclePath(ctx, centerX, centerY, radius);
    ctx.fill();
}

function drawThemedCircle(ctx, centerX, centerY, radius, paintData, color = "#1a1a1a") {
    const glowClip = paintData?.glowClip || "c_glowNone";
    const shadowClip = paintData?.shadowClip || "c_shadowNone";
    const blurFactor = 2.0;
    const alphaFactor = 0.7;
    const offsetFactor = 1.5;

    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (paintData?.shadow && shadowClip === "c_shadowOutside") {
        const s = paintData.shadow;
        ctx.save();
        ctx.beginPath();
        ctx.rect(centerX - radius - 5000, centerY - radius - 5000, (radius * 2) + 10000, (radius * 2) + 10000);
        appendCirclePath(ctx, centerX, centerY, radius);
        ctx.clip("evenodd");
        fillCircleWithShadow(ctx, centerX, centerY, radius, s, "black", blurFactor, alphaFactor, 1);
        ctx.restore();
    }

    ctx.save();
    if (paintData?.shadow && shadowClip === "c_shadowNone") {
        fillCircleWithShadow(ctx, centerX, centerY, radius, paintData.shadow, color, blurFactor, alphaFactor, offsetFactor);
    } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        appendCirclePath(ctx, centerX, centerY, radius);
        ctx.fill();
    }
    ctx.restore();

    if (paintData?.shadow && shadowClip === "c_shadowInside") {
        const s = paintData.shadow;
        ctx.save();
        ctx.beginPath();
        appendCirclePath(ctx, centerX, centerY, radius);
        ctx.clip();
        ctx.shadowColor = scaleAlpha(s.color, alphaFactor);
        ctx.shadowBlur = s.blur * blurFactor;
        ctx.shadowOffsetX = s.offsetX * offsetFactor;
        ctx.shadowOffsetY = s.offsetY * offsetFactor;
        ctx.beginPath();
        ctx.rect(centerX - radius - 5000, centerY - radius - 5000, (radius * 2) + 10000, (radius * 2) + 10000);
        appendCirclePath(ctx, centerX, centerY, radius);
        ctx.fillStyle = "black";
        ctx.fill("evenodd");
        ctx.restore();
    }

    if (paintData?.glow) {
        const g = paintData.glow;
        const glowShadow = {
            color: scaleAlpha(g.color, alphaFactor),
            blur: g.blur,
            offsetX: g.offsetX * offsetFactor,
            offsetY: g.offsetY * offsetFactor,
        };
        if (glowClip === "c_glowOutside" || glowClip === "c_glowNone") {
            ctx.save();
            ctx.beginPath();
            ctx.rect(centerX - radius - 5000, centerY - radius - 5000, (radius * 2) + 10000, (radius * 2) + 10000);
            appendCirclePath(ctx, centerX, centerY, radius);
            ctx.clip("evenodd");
            fillCircleWithShadow(ctx, centerX, centerY, radius, glowShadow, "black", blurFactor, 1, 1);
            ctx.restore();
        }
        if (glowClip === "c_glowInside" || glowClip === "c_glowNone") {
            ctx.save();
            ctx.beginPath();
            appendCirclePath(ctx, centerX, centerY, radius);
            ctx.clip();
            ctx.shadowColor = glowShadow.color;
            ctx.shadowBlur = glowShadow.blur * blurFactor;
            ctx.shadowOffsetX = glowShadow.offsetX;
            ctx.shadowOffsetY = glowShadow.offsetY;
            ctx.beginPath();
            ctx.rect(centerX - radius - 5000, centerY - radius - 5000, (radius * 2) + 10000, (radius * 2) + 10000);
            appendCirclePath(ctx, centerX, centerY, radius);
            ctx.fillStyle = "black";
            ctx.fill("evenodd");
            ctx.restore();
        }
    }

    if (paintData?.border && paintData.border.width > 0 && !isTransparentColor(paintData.border.color)) {
        const border = paintData.border;
        const align = border.placement ?? 0;
        const lineWidth = border.width;
        const borderRadius = align === 1
            ? Math.max(0, radius - (lineWidth / 2))
            : (align === 2 ? radius + (lineWidth / 2) : radius);
        ctx.save();
        ctx.strokeStyle = border.color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        appendCirclePath(ctx, centerX, centerY, borderRadius);
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}

export function syncDerpSliderCanvas(ctx, node, config) {
    if (!config.geometry) return;
    const { x, y, w, h } = config.geometry;

    const style = config.style ?? "default";
    if (style !== "default" && style !== "knob") return;

    // 1. Resolve Environment
    const { props, stateStr, bodyPaint: paintData, labelPaint: labelData, alpha, colorSegments, hasColorKeys } = resolveWidgetEnv(node, config);

    // 2. Centralized Animated Colors & Alpha
    const sliderBackgroundData = resolvePaintData(node, "#slider_background", `_${stateStr}`, config.btnColor) || paintData;
    const rawBg = sliderBackgroundData?.fill || config.btnColor || "transparent";
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
        fontWeight: config.fontWeight || labelData?.fontWeight || props.fontWeight || "normal",
        fill: iconColor
    };

    // 1. Draw Background (Animated)
    if (sliderBackgroundData) {
        masterPainter(ctx, {
            posX: x, posY: y, width: w, height: h,
            paintData: sliderBackgroundData, color: fillColor
        });
    }

    // 2. Draw Progress Bar (The Fill)
    const value = parseFloat(config.value) || 0;
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    const targetPercent = Math.max(0, Math.min(1, (value - min) / (max - min)));

    const ins = props.fillPadding || [0, 0, 0, 0];
    const fullFillH = Math.max(0, h - ins[0] - ins[2]);
    let fillH, fillY;
    if (props.fillbarHeight != null) {
        const fillbarHeight = Number(props.fillbarHeight);
        const baseH = Number.isFinite(fillbarHeight)
            ? (h * Math.max(0.2, Math.min(1.0, fillbarHeight)))
            : h;
        fillH = Math.max(0, baseH - ins[0] - ins[2]);
        fillY = y + (h - baseH) / 2 + ins[0];
    } else {
        fillH = fullFillH;
        fillY = y + ins[0];
    }
    // btnLR button dimensions
    const btnW = config.btnLR ? Math.round(fullFillH * BTN_LR_RATIO) : 0;
    const btnMargin = BTN_LR_MARGIN;

    // Drag state: handler sets/clears _isDraggingSlider on dragStart/dragEnd
    // Fall back to value-change detection (2s window) if handler isn't called for track drags
    const curVal = parseFloat(config.value ?? 0);
    const prevVal = config._sliderPrevVal;
    if (prevVal !== undefined && Math.abs(curVal - prevVal) > 0.0001) {
        config._sliderLastChange = performance.now();
    }
    config._sliderPrevVal = curVal;
    const isDraggingSlider = !!config._isDraggingSlider;
    const isPressedVisualState = (stateStr === "ON") || isDraggingSlider;
    // Lerp knob into position on click (not during drag)
    const svpKey = "_svp_" + (config.key || "0");
    const prevVis = node[svpKey] !== undefined ? node[svpKey] : targetPercent;
    const doLerp = useAnim && !isDraggingSlider;
    const visPercent = doLerp ? (prevVis + (targetPercent - prevVis) * SLIDER_POS_LERP) : targetPercent;
    node[svpKey] = visPercent;
    const lerpAnimating = doLerp && Math.abs(visPercent - targetPercent) > 0.001;

    if (lerpAnimating) {
        node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 5);
        const typeName = String(node?.type || "").toLowerCase();
        if (typeName.includes("derplorastack")) {
            node._passiveWholeWallCacheSuspendUntil = Math.max(
                Number(node._passiveWholeWallCacheSuspendUntil || 0),
                performance.now() + 80
            );
            if (typeof node.requestDerpSync === "function") node.requestDerpSync();
            if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        } else if (typeName.includes("derpslidernode")) {
            if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
            if (window.app?.canvas?.setDirty) window.app.canvas.setDirty(true, true);
        } else if (typeof node.setDirtyCanvas === "function") {
            node.setDirtyCanvas(true);
        }
    }
    const percent = isDraggingSlider ? targetPercent : visPercent;

    // THE FILL STRENGTH FIX: If active, interpolate between states based on value.
    const fillKey = props.fillKey || props.bodyKey;
    const fillSuffix = props.fillKey ? "_OFF" : "_ON";
    const fillbarKey = resolvePaintData(node, "#slider_fillbar", fillSuffix, config.btnColor) ? "#slider_fillbar" : fillKey;
    const activeData = (stateStr === "DIS") ? paintData : (
        props.fillStrength ?
            resolveInterpolatedPaint(node, fillbarKey, percent, config.btnColor, config.palette) :
            (resolvePaintData(node, fillbarKey, fillSuffix, config.btnColor) || paintData)
    );
    const sliderFillbarData = activeData;

    const knobSuffix = (stateStr === "DIS") ? "_DIS" : (isPressedVisualState ? "_ON" : "_OFF");
    const knobData = (style === "knob")
        ? (resolvePaintData(node, "#slider_knob", knobSuffix, config.btnColor) || resolvePaintData(node, fillKey, knobSuffix, config.btnColor) || paintData)
        : null;
    const btnLRSuffix = (stateStr === "DIS") ? "_DIS" : "_OFF";
    const btnLRData = resolvePaintData(node, "#slider_btnLR", btnLRSuffix, config.btnColor);

    // Knob + fillBar positioning: exactly 1px spacing from btnLR at min/max
    const knobWidthScale = Number.isFinite(Number(props.knobWidthScale ?? config.knobWidthScale)) ? Math.max(0.2, Math.min(2.0, Number(props.knobWidthScale ?? config.knobWidthScale))) : 1.0;
    const knobHeightOffset = Number.isFinite(Number(props.knobHeightOffset ?? config.knobHeightOffset)) ? Math.max(-5, Math.min(5, Number(props.knobHeightOffset ?? config.knobHeightOffset))) : 0;
    const roundKnob = (props.roundKnob ?? config.roundKnob ?? ROUND_KNOB) !== false;
    const knobRadiusOffset = Number.isFinite(Number(props.knobRadiusOffset ?? config.knobRadiusOffset)) ? Math.max(-3, Math.min(3, Number(props.knobRadiusOffset ?? config.knobRadiusOffset))) : 0;
    const knobStyleW = (style === "knob") ? (fullFillH * knobWidthScale) : 0;
    const knobStyleH = (style === "knob") ? fullFillH : 0;
    const leftBtnRight = x + btnMargin + btnW;
    const rightBtnLeft = x + w - btnW - btnMargin;
    const trackStart = config.btnLR ? leftBtnRight + 1 : x + ins[3];
    const trackEnd   = config.btnLR ? rightBtnLeft - 1 : x + w - ins[1];
    const trackW = Math.max(0, trackEnd - trackStart);
    const knobTravelW = Math.max(0, trackW - knobStyleW);
    const knobX = trackStart + knobTravelW * Math.max(0, percent);
    const fillStartX = trackStart;
    const fillProgressW = Math.max(0, (knobX + 1) - fillStartX);
    const fillbarMargin = Math.max(0, FILLBAR_MARGIN);
    const fillbarDrawX = fillStartX + fillbarMargin;
    const fillbarDrawY = fillY;
    const fillbarDrawW = Math.max(0, fillProgressW - fillbarMargin);
    const fillbarDrawH = fillH;

    if (sliderFillbarData && percent > 0 && fillbarDrawW > 0 && fillbarDrawH > 0) {
        const themeCorners = sliderFillbarData.corners;
        const rawFillCorners = Array.isArray(themeCorners)
            ? [themeCorners[0] || 0, 0, 0, themeCorners[3] || 0]
            : [themeCorners || 0, 0, 0, themeCorners || 0];
        const maxFillCorner = fillbarDrawH / 2;
        const fillCorners = rawFillCorners.map((corner) => Math.min(Math.max(0, Number(corner) || 0), maxFillCorner));
        masterPainter(ctx, {
            posX: fillbarDrawX,
            posY: fillbarDrawY,
            width: fillbarDrawW,
            height: fillbarDrawH,
            paintData: { ...sliderFillbarData, corners: fillCorners },
            color: sliderFillbarData.fill
        });
    }

    // Knob
    drawSliderKnobAbs(ctx, style, knobData, knobStyleW, knobStyleH, knobX, y, ins[0], knobHeightOffset, roundKnob, knobRadiusOffset);

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
            align: alignX, baseline: alignY,
            segments: hasColorKeys ? colorSegments : null
        });
    }
    // 4. Draw btnLR Buttons
    if (config.btnLR) {
        const btnY = y + ins[0] - BTN_LR_HEIGHTOFFSET;
        const btnH = Math.max(0, fullFillH + (BTN_LR_HEIGHTOFFSET * 2));
        // Knob style: btnLR uses fixed _ON state (ignoring fillStrength)
        const btnSource = btnLRData || ((style === "knob") ? paintData : (activeData || paintData));
        // Per-button state: _OFF at boundaries, _ON otherwise
        const atMin = (value <= min);
        const atMax = (value >= max);
        const boundarySuffix = "_DIS";  // always use disabled-look at boundaries
        const leftBtnData  = (stateStr === "DIS" || atMin) ? (resolvePaintData(node, "#slider_btnLR", boundarySuffix, config.btnColor) || resolvePaintData(node, fillKey, boundarySuffix, config.btnColor) || paintData) : btnSource;
        const rightBtnData = (stateStr === "DIS" || atMax) ? (resolvePaintData(node, "#slider_btnLR", boundarySuffix, config.btnColor) || resolvePaintData(node, fillKey, boundarySuffix, config.btnColor) || paintData) : btnSource;
        const btnTextPaint = { ...(labelData || {}), fill: iconColor, fontSize: BTN_LR_FONTSIZE, fontWeight: finalPaint.fontWeight };

        // Left button (-): flat right corners, _OFF at min
        {
            const src = leftBtnData?.corners;
            const corners = Array.isArray(src) ? [src[0] || 0, 1, 1, src[3] || 0] : [src || 0, 0, 0, src || 0];
            masterPainter(ctx, {
                posX: x + btnMargin, posY: btnY,
                width: btnW, height: btnH,
                paintData: { ...leftBtnData, corners }, color: leftBtnData?.fill || config.btnColor || "#555"
            });
        }
        masterPainterText(ctx, {
            x: x + BTN_LR_MARGIN + btnW / 2, y: btnY + btnH / 2,
            text: "-",
            paintData: btnTextPaint,
            align: "center", baseline: "middle"
        });

        // Right button (+): flat left corners, _OFF at max
        {
            const src = rightBtnData?.corners;
            const corners = Array.isArray(src) ? [1, src[1] || 0, src[2] || 0, 1] : [0, src || 0, src || 0, 0];
            masterPainter(ctx, {
                posX: x + w - btnW - btnMargin, posY: btnY,
                width: btnW, height: btnH,
                paintData: { ...rightBtnData, corners }, color: rightBtnData?.fill || config.btnColor || "#555"
            });
        }
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
    const btnLR = config?.btnLR;
    if (!btnLR) return { handled: false };
    // Track drag state for knob _ON/_OFF switching
    if (type === "dragStart" || type === "drag" || type === "dragging") config._isDraggingSlider = true;
    if (type === "dragEnd" || type === "dragAbort" || type === "mouseup" || type === "pointerup") config._isDraggingSlider = false;
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
        const trackX = reg.x + mrg + btnW;
        const trackW = Math.max(0, reg.w - (btnW + mrg) * 2);
        if (localX < trackX || localX > trackX + trackW) return { handled: true };
        const cStep = parseFloat(config.step ?? 0.05);
        const percent = Math.max(0, Math.min(1, (localX - trackX) / trackW));
        const rawVal = cMin + (percent * (cMax - cMin));
        return { handled: true, newVal: Math.max(cMin, Math.min(cMax, Math.round(rawVal / cStep) * cStep)) };
    }
    return { handled: false };
};
