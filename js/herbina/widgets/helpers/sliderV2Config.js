import {
    normalizeSliderV2Spec,
    normalizeSliderV2Value,
    formatSliderV2DisplayValue,
    getSliderV2MeasureText,
    resolveSliderV2HorizontalInteraction,
    stepSliderV2Value,
    resetSliderV2Value,
    normalizeSliderV2RenderPath,
} from "./sliderV2Value.js";
import {
    getSliderV2StylePreset,
    normalizeSliderV2StyleId,
    prepareSliderV2StyleConfig,
} from "./sliderV2Styles.js";
import {
    getSliderV2TypePreset,
    normalizeSliderV2TypeId,
    resolveSliderV2UnsupportedInteraction,
} from "./sliderV2Types.js";

export function createDerpSliderV2(callbacks = {}) {
    const styleId = normalizeSliderV2StyleId(callbacks.styleId || callbacks.style);
    const sliderType = normalizeSliderV2TypeId(callbacks.sliderType);
    return {
        type: "sliderV2",
        sliderType,
        styleId,
        valueType: callbacks.valueType || callbacks.numberType || "float",
        value: callbacks.value ?? 0.5,
        min: callbacks.min ?? 0,
        max: callbacks.max ?? 1,
        step: callbacks.step ?? 0.05,
        decimals: callbacks.decimals ?? callbacks.decimal ?? 2,
        default: callbacks.default ?? callbacks.value ?? 0.5,
        onChange: callbacks.onChange || null,
        onCommit: callbacks.onCommit || null,
    };
}

export function prepareSliderV2Config(config = {}) {
    const spec = normalizeSliderV2Spec(config);
    const value = normalizeSliderV2Value(config.value, spec, { snap: true });
    const styledConfig = prepareSliderV2StyleConfig(config);
    const stylePreset = styledConfig._sliderV2StylePreset || getSliderV2StylePreset(config.styleId || config.style);
    const typePreset = getSliderV2TypePreset(config.sliderType);
    const displayText = config.displayText ?? config.text ?? config.label ?? formatSliderV2DisplayValue(value, spec);
    const measureText = config.measureText ?? getSliderV2MeasureText(spec);
    const originalOnChange = config.onChange;
    const originalOnCommit = config.onCommit;
    return {
        ...styledConfig,
        ...spec,
        value,
        label: config.label ?? displayText,
        text: config.text ?? displayText,
        displayText,
        measureText,
        styleId: stylePreset.id,
        style: stylePreset.canvasStyle,
        htmlStyle: stylePreset.htmlStyle,
        _sliderV2StylePreset: stylePreset,
        sliderType: typePreset.id,
        _sliderV2TypePreset: typePreset,
        decimal: spec.decimals,
        decimals: spec.decimals,
        _sliderV2Spec: spec,
        onChange: (nextValue, meta) => {
            const normalized = normalizeSliderV2Value(nextValue, spec, { snap: true });
            if (typeof originalOnChange === "function") originalOnChange(normalized, meta);
        },
        onCommit: (nextValue, meta) => {
            const normalized = normalizeSliderV2Value(nextValue, spec, { snap: true });
            if (typeof originalOnCommit === "function") originalOnCommit(normalized, meta);
        },
    };
}

export function setSliderV2Value(config, value, options = {}) {
    if (!config) return null;
    const spec = config._sliderV2Spec || normalizeSliderV2Spec(config);
    const nextValue = normalizeSliderV2Value(value, spec, { snap: options.snap !== false });
    config.value = nextValue;
    if (typeof config.onChange === "function") config.onChange(nextValue, options);
    if (options.commit && typeof config.onCommit === "function") config.onCommit(nextValue, options);
    return nextValue;
}

export function resolveSliderV2Interaction(reg, config = {}, localX, type = "drag", options = {}) {
    const unsupported = resolveSliderV2UnsupportedInteraction(config);
    if (unsupported) return unsupported;
    return resolveSliderV2HorizontalInteraction(reg, config, localX, type, options);
}

export function setSliderV2ValueFromInteraction(config, reg, localX, type = "drag", options = {}) {
    const result = resolveSliderV2Interaction(reg, config, localX, type, options);
    if (!result.handled || result.value === undefined) return result;
    const value = setSliderV2Value(config, result.value, { ...options, commit: result.commit });
    return { ...result, value };
}

export function stepSliderV2(config, direction, options = {}) {
    const nextValue = stepSliderV2Value(config?.value, config, direction);
    return setSliderV2Value(config, nextValue, { ...options, commit: options.commit !== false });
}

export function resetSliderV2(config, options = {}) {
    return setSliderV2Value(config, resetSliderV2Value(config), { ...options, commit: options.commit !== false });
}

export function refreshSliderV2RenderPathTargets(targets = {}) {
    let count = 0;
    const forEachTarget = (collection, callback) => {
        if (!collection) return;
        if (typeof collection.forEach === "function") {
            collection.forEach(callback);
            return;
        }
        Array.from(collection).forEach(callback);
    };
    const refreshEntity = (entity) => {
        if (!entity) return;
        entity._forceSync = true;
        entity._layoutDirty = true;
        entity._layoutMapHash = null;
        entity._derpAwakeFrames = Math.max(entity._derpAwakeFrames || 0, 2);
        if (typeof entity.requestDerpSync === "function") entity.requestDerpSync();
        else if (typeof entity.setDirtyCanvas === "function") entity.setDirtyCanvas(true, true);
        count += 1;
    };

    forEachTarget(targets.nodes || [], (node) => {
        if (node?.isFathaNode || node?.isUncleNode || node?.layoutMap) refreshEntity(node);
    });
    forEachTarget(targets.bastas || [], refreshEntity);
    targets.canvas?.setDirty?.(true, true);
    return count;
}

export function setSliderV2GlobalRenderPath(value, targets = {}, globalObject = globalThis, options = {}) {
    const renderPath = normalizeSliderV2RenderPath(value);
    const root = globalObject || globalThis;
    root.DERP_GLOBAL_SETTINGS = root.DERP_GLOBAL_SETTINGS || {};
    root.DERP_GLOBAL_SETTINGS.sliderV2RenderPath = renderPath;
    root.xcpDerpSettings = root.DERP_GLOBAL_SETTINGS;
    if (options.persist !== false) root.app?.ui?.settings?.setSettingValue?.("Derp.SliderV2RenderPath", renderPath);
    refreshSliderV2RenderPathTargets(targets);
    return renderPath;
}
