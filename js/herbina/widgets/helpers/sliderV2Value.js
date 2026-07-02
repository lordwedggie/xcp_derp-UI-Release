const EPSILON = 1e-9;
export const SLIDER_V2_RENDER_PATH_DEFAULT = "canvas";

function toFiniteNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function countDecimalPlaces(value) {
    const text = String(value);
    if (!text.includes(".")) return 0;
    return text.split(".")[1].replace(/0+$/, "").length;
}

function normalizeDecimals(config, step) {
    const explicit = Number(config?.decimals ?? config?.decimal);
    if (Number.isFinite(explicit)) return Math.max(0, Math.min(12, Math.round(explicit)));
    return Math.max(0, Math.min(12, countDecimalPlaces(step)));
}

function roundToDecimals(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeSliderV2Inset(value) {
    if (typeof value === "number" && Number.isFinite(value)) return [value, value, value, value];
    if (!Array.isArray(value) || value.length === 0) return [0, 0, 0, 0];
    const top = toFiniteNumber(value[0], 0);
    if (value.length === 1) return [top, top, top, top];
    const right = toFiniteNumber(value[1], top);
    if (value.length === 2) return [top, right, top, right];
    const bottom = toFiniteNumber(value[2], top);
    if (value.length === 3) return [top, right, bottom, right];
    const left = toFiniteNumber(value[3], right);
    return [top, right, bottom, left];
}

function resolveSliderV2StyleId(config = {}) {
    return String(config?.styleId ?? config?.style ?? config?._sliderV2StylePreset?.id ?? "").trim().toLowerCase();
}

function resolveSliderV2KnobWidthScale(config = {}) {
    const raw = Number(config?.knobWidthScale ?? config?._sliderV2StylePreset?.visualDefaults?.knobWidthScale ?? 1);
    return Number.isFinite(raw) ? Math.max(0.2, Math.min(2.0, raw)) : 1.0;
}

export function normalizeSliderV2Spec(config = {}) {
    let min = toFiniteNumber(config.min, 0);
    let max = toFiniteNumber(config.max, 1);
    if (max < min) [min, max] = [max, min];
    if (Math.abs(max - min) < EPSILON) max = min + 1;

    const rawStep = toFiniteNumber(config.step, 0.05);
    const decimals = normalizeDecimals(config, rawStep > EPSILON ? rawStep : 0.05);
    const valueType = String(config.valueType || config.numberType || config.typeHint || "").toLowerCase() === "int" || decimals === 0
        ? "int"
        : "float";
    let step = rawStep > EPSILON ? rawStep : (valueType === "int" ? 1 : 0.05);
    if (valueType === "int") step = Math.max(1, Math.round(step));
    const defaultValue = normalizeSliderV2Value(config.default ?? config.value ?? min, { min, max, step, decimals, valueType }, { snap: true });

    return { min, max, step, decimals, valueType, defaultValue };
}

export function normalizeSliderV2Value(value, specOrConfig = {}, options = {}) {
    const spec = specOrConfig.min !== undefined && specOrConfig.max !== undefined && specOrConfig.step !== undefined
        ? specOrConfig
        : normalizeSliderV2Spec(specOrConfig);
    const min = toFiniteNumber(spec.min, 0);
    const max = toFiniteNumber(spec.max, min + 1);
    const step = toFiniteNumber(spec.step, 1);
    const decimals = normalizeDecimals(spec, step);
    const valueType = spec.valueType === "int" || decimals === 0 ? "int" : "float";
    let next = toFiniteNumber(value, toFiniteNumber(spec.defaultValue, min));
    next = Math.max(min, Math.min(max, next));

    if (options.snap !== false && step > EPSILON) {
        const steps = Math.round((next - min) / step);
        next = min + steps * step;
    }

    next = Math.max(min, Math.min(max, next));
    next = valueType === "int" ? Math.round(next) : roundToDecimals(next, decimals);
    return next;
}

export function formatSliderV2DisplayValue(value, specOrConfig = {}) {
    const spec = specOrConfig.min !== undefined && specOrConfig.max !== undefined && specOrConfig.step !== undefined
        ? specOrConfig
        : normalizeSliderV2Spec(specOrConfig);
    const normalized = normalizeSliderV2Value(value, spec, { snap: true });
    const decimals = normalizeDecimals(spec, toFiniteNumber(spec.step, 1));
    return spec.valueType === "int" || decimals === 0
        ? String(Math.round(normalized))
        : Number(normalized).toFixed(decimals);
}

export function getSliderV2MeasureText(specOrConfig = {}) {
    const spec = specOrConfig.min !== undefined && specOrConfig.max !== undefined && specOrConfig.step !== undefined
        ? specOrConfig
        : normalizeSliderV2Spec(specOrConfig);
    const decimals = normalizeDecimals(spec, toFiniteNumber(spec.step, 1));
    const minText = formatSliderV2DisplayValue(spec.min, spec);
    const maxText = formatSliderV2DisplayValue(spec.max, spec);
    const widerText = minText.length > maxText.length ? minText : maxText;
    return widerText.replace(/\d/g, "9");
}

export function getSliderV2Percent(value, specOrConfig = {}) {
    const spec = specOrConfig.min !== undefined && specOrConfig.max !== undefined
        ? specOrConfig
        : normalizeSliderV2Spec(specOrConfig);
    const min = toFiniteNumber(spec.min, 0);
    const max = toFiniteNumber(spec.max, min + 1);
    const range = max - min;
    if (!Number.isFinite(range) || Math.abs(range) < EPSILON) return 0;
    return Math.max(0, Math.min(1, (toFiniteNumber(value, min) - min) / range));
}

export function sliderV2ValueFromPercent(percent, config = {}, options = {}) {
    const spec = normalizeSliderV2Spec(config);
    const safePercent = Math.max(0, Math.min(1, toFiniteNumber(percent, 0)));
    return normalizeSliderV2Value(spec.min + safePercent * (spec.max - spec.min), spec, options);
}

export function sliderV2ValueFromPointer(reg, config = {}, localX, options = {}) {
    const spec = normalizeSliderV2Spec(config);
    const metrics = getSliderV2HorizontalMetrics(reg, config);
    const pointerX = toFiniteNumber(localX, metrics.trackStart);
    const interactionW = Math.max(EPSILON, metrics.interactionW || metrics.trackW || 1);
    const percent = (pointerX - metrics.trackStart) / interactionW;
    return sliderV2ValueFromPercent(percent, spec, options);
}

export function sliderV2LocalXFromClientX(clientX, rect = {}, geometry = {}) {
    const rectLeft = toFiniteNumber(rect.left, 0);
    const rectWidth = Math.max(EPSILON, toFiniteNumber(rect.width, toFiniteNumber(rect.right, rectLeft + 1) - rectLeft));
    const localX = toFiniteNumber(geometry.x, 0);
    const localW = Math.max(EPSILON, toFiniteNumber(geometry.w, rectWidth));
    const percent = (toFiniteNumber(clientX, rectLeft) - rectLeft) / rectWidth;
    return localX + percent * localW;
}

export function getSliderV2HorizontalMetrics(reg, config = {}) {
    const x = toFiniteNumber(reg?.x, 0);
    const w = Math.max(0, toFiniteNumber(reg?.w, 0));
    const h = Math.max(0, toFiniteNumber(reg?.h, 0));
    const fillPadding = normalizeSliderV2Inset(config.fillPadding);
    const fullFillH = Math.max(0, h - fillPadding[0] - fillPadding[2]);
    const btnRatio = Math.max(0, toFiniteNumber(config.btnLRRatio, 0.75));
    const btnMargin = Math.max(0, toFiniteNumber(config.btnLRMargin, 0));
    const btnW = config.btnLR ? Math.round(fullFillH * btnRatio) : 0;
    const leftButtonStart = x + btnMargin;
    const leftButtonEnd = leftButtonStart + btnW;
    const rightButtonStart = x + w - btnMargin - btnW;
    const rightButtonEnd = x + w - btnMargin;
    const trackStart = config.btnLR ? leftButtonEnd + 1 : x + fillPadding[3];
    const trackEnd = config.btnLR ? rightButtonStart - 1 : x + w - fillPadding[1];
    const trackW = Math.max(0, trackEnd - trackStart);
    const styleId = resolveSliderV2StyleId(config);
    const knobW = styleId === "knob" ? Math.max(0, fullFillH * resolveSliderV2KnobWidthScale(config)) : 0;
    const knobTravelW = Math.max(0, trackW - knobW);
    const interactionW = knobW > 0 ? knobTravelW : trackW;

    return {
        x,
        w,
        h,
        fillPadding,
        fullFillH,
        btnW,
        btnMargin,
        leftButtonStart,
        leftButtonEnd,
        rightButtonStart,
        rightButtonEnd,
        trackStart,
        trackEnd,
        trackW,
        knobW,
        knobTravelW,
        interactionW,
        styleId,
    };
}

export function stepSliderV2Value(value, config = {}, direction = 1) {
    const spec = normalizeSliderV2Spec(config);
    const current = normalizeSliderV2Value(value, spec, { snap: true });
    const delta = spec.step * (direction < 0 ? -1 : 1);
    return normalizeSliderV2Value(current + delta, spec, { snap: true });
}

export function resetSliderV2Value(config = {}) {
    if (Number.isFinite(Number(config.defaultValue))) {
        return normalizeSliderV2Value(config.defaultValue, config, { snap: true });
    }
    const spec = normalizeSliderV2Spec(config);
    return spec.defaultValue;
}

export function resolveSliderV2HorizontalInteraction(reg, config = {}, localX, type = "drag", options = {}) {
    const spec = normalizeSliderV2Spec(config);
    const metrics = getSliderV2HorizontalMetrics(reg, config);
    const pointerX = toFiniteNumber(localX, metrics.trackStart);
    const eventType = String(type || "drag");

    if (config.btnLR) {
        if (pointerX >= metrics.leftButtonStart && pointerX <= metrics.leftButtonEnd) {
            if (eventType === "dblclick") {
                return {
                    handled: true,
                    action: "buttonDblClick",
                    commit: false,
                    spec,
                    metrics,
                };
            }
            if (eventType === "click" || eventType === "dragStart") {
                return {
                    handled: true,
                    action: "stepMinus",
                    value: stepSliderV2Value(config.value, spec, -1),
                    commit: true,
                    spec,
                    metrics,
                };
            }
        }
        if (pointerX >= metrics.rightButtonStart && pointerX <= metrics.rightButtonEnd) {
            if (eventType === "dblclick") {
                return {
                    handled: true,
                    action: "buttonDblClick",
                    commit: false,
                    spec,
                    metrics,
                };
            }
            if (eventType === "click" || eventType === "dragStart") {
                return {
                    handled: true,
                    action: "stepPlus",
                    value: stepSliderV2Value(config.value, spec, 1),
                    commit: true,
                    spec,
                    metrics,
                };
            }
        }
        if ((eventType === "click" || eventType === "dragStart" || eventType === "dblclick") && (pointerX < metrics.trackStart || pointerX > metrics.trackEnd)) {
            return {
                handled: true,
                action: "trackGap",
                commit: false,
                spec,
                metrics,
            };
        }
    } else if ((eventType === "click" || eventType === "dragStart" || eventType === "dblclick") && (pointerX < metrics.trackStart || pointerX > metrics.trackEnd)) {
        return {
            handled: true,
            action: "trackGap",
            commit: false,
            spec,
            metrics,
        };
    }

    if (eventType === "dblclick" || options.reset === true) {
        return {
            handled: true,
            action: "reset",
            value: resetSliderV2Value(spec),
            commit: true,
            spec,
            metrics,
        };
    }

    const rawPercent = (pointerX - metrics.trackStart) / Math.max(EPSILON, metrics.interactionW || metrics.trackW || 1);
    const value = sliderV2ValueFromPercent(rawPercent, spec, { snap: options.snap !== false });
    return {
        handled: true,
        action: eventType === "drag" ? "dragMove" : (eventType === "dragStart" ? "dragStart" : "valueSet"),
        value,
        commit: options.commit === true || eventType === "click",
        spec,
        metrics,
    };
}

export function normalizeSliderV2RenderPath(value) {
    const raw = String(value || SLIDER_V2_RENDER_PATH_DEFAULT).trim().toLowerCase();
    return raw === "html" ? "html" : SLIDER_V2_RENDER_PATH_DEFAULT;
}
