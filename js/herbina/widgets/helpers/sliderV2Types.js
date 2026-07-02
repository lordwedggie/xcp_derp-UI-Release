const TYPE_PRESETS = Object.freeze({
    horizontal: Object.freeze({
        id: "horizontal",
        label: "Horizontal",
        implemented: true,
    }),
    vertical: Object.freeze({
        id: "vertical",
        label: "Vertical",
        implemented: false,
    }),
    radial: Object.freeze({
        id: "radial",
        label: "Radial",
        implemented: false,
    }),
});

export const SLIDER_V2_DEFAULT_TYPE_ID = "horizontal";

export function normalizeSliderV2TypeId(value) {
    const raw = String(value || SLIDER_V2_DEFAULT_TYPE_ID).trim().toLowerCase();
    return TYPE_PRESETS[raw] ? raw : SLIDER_V2_DEFAULT_TYPE_ID;
}

export function getSliderV2TypePreset(value) {
    return TYPE_PRESETS[normalizeSliderV2TypeId(value)];
}

export function listSliderV2TypePresets() {
    return Object.values(TYPE_PRESETS).map((preset) => ({ ...preset }));
}

export function resolveSliderV2UnsupportedInteraction(config = {}) {
    const typePreset = getSliderV2TypePreset(config.sliderType);
    if (typePreset.implemented) return null;
    return {
        handled: false,
        action: "unsupported",
        sliderType: typePreset.id,
        value: config.value,
        commit: false,
    };
}
