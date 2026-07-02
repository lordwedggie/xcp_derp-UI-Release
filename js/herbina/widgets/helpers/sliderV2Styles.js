function defineStylePreset(preset) {
    return Object.freeze({
        ...preset,
        visualDefaults: Object.freeze({ ...(preset.visualDefaults || {}) }),
    });
}

function cloneStylePreset(preset) {
    return {
        ...preset,
        visualDefaults: { ...(preset.visualDefaults || {}) },
    };
}

const STYLE_PRESETS = Object.freeze({
    knob: defineStylePreset({
        id: "knob",
        label: "Knob",
        canvasStyle: "knob",
        htmlStyle: "knob",
        visualDefaults: {
            fillbarHeight: 1.0,
            roundKnob: true,
            knobWidthScale: 1.0,
            knobHeightOffset: 0,
            knobRadiusOffset: 0,
        },
    }),
    default: defineStylePreset({
        id: "default",
        label: "Default",
        canvasStyle: "default",
        htmlStyle: "default",
        visualDefaults: {
            fillbarHeight: 1.0,
        },
    }),
});

export const SLIDER_V2_DEFAULT_STYLE_ID = "knob";
export const SLIDER_V2_STYLE_FILE_VERSION = 1;
export const SLIDER_V2_STYLE_FILE_KIND = "derpSliderV2Style";
export const SLIDER_V2_STYLE_FILE_DEFAULT_NAME = "slider-v2-style";

export function normalizeSliderV2StyleId(value) {
    const raw = String(value || SLIDER_V2_DEFAULT_STYLE_ID).trim().toLowerCase();
    return STYLE_PRESETS[raw] ? raw : SLIDER_V2_DEFAULT_STYLE_ID;
}

export function getSliderV2StylePreset(value) {
    return cloneStylePreset(STYLE_PRESETS[normalizeSliderV2StyleId(value)]);
}

export function listSliderV2StylePresets() {
    return Object.values(STYLE_PRESETS).map(cloneStylePreset);
}

export function prepareSliderV2StyleConfig(config = {}) {
    const preset = getSliderV2StylePreset(config.styleId || config.style);
    const next = { ...config };
    Object.entries(preset.visualDefaults || {}).forEach(([key, value]) => {
        if (next[key] === undefined) next[key] = value;
    });
    return {
        ...next,
        styleId: preset.id,
        style: preset.canvasStyle,
        htmlStyle: preset.htmlStyle,
        _sliderV2StylePreset: preset,
    };
}

function clampSliderV2StyleNumber(value, fallback, min, max) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(max, raw));
}

export function sanitizeSliderV2StyleFileName(value, fallback = SLIDER_V2_STYLE_FILE_DEFAULT_NAME) {
    const raw = String(value || "").trim().replace(/\.json$/i, "").trim();
    const clean = raw
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/^\.+/, "")
        .replace(/\.+$/, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    return clean || fallback;
}

export function normalizeSliderV2StyleForPersistence(config = {}) {
    const prepared = prepareSliderV2StyleConfig(config || {});
    const styleId = normalizeSliderV2StyleId(prepared.styleId);
    const persisted = {
        styleId,
        fillbarHeight: clampSliderV2StyleNumber(prepared.fillbarHeight, 1, 0.2, 1.0),
    };

    if (styleId === "knob") {
        persisted.roundKnob = prepared.roundKnob !== false;
        persisted.knobWidthScale = clampSliderV2StyleNumber(prepared.knobWidthScale, 1, 0.2, 2.0);
        persisted.knobHeightOffset = clampSliderV2StyleNumber(prepared.knobHeightOffset, 0, -5, 5);
        persisted.knobRadiusOffset = clampSliderV2StyleNumber(prepared.knobRadiusOffset, 0, -3, 3);
    }

    return persisted;
}

export function resolveSliderV2StyleConfigFromPayload(payload) {
    const source = payload && typeof payload === "object" ? payload : {};
    const rawStyle = source.style && typeof source.style === "object" ? source.style : source;
    return normalizeSliderV2StyleForPersistence({
        styleId: rawStyle.styleId ?? source.styleId ?? rawStyle.style,
        fillbarHeight: rawStyle.fillbarHeight,
        roundKnob: rawStyle.roundKnob,
        knobWidthScale: rawStyle.knobWidthScale,
        knobHeightOffset: rawStyle.knobHeightOffset,
        knobRadiusOffset: rawStyle.knobRadiusOffset,
    });
}

export function buildSliderV2StylePayload(config = {}, fileName = SLIDER_V2_STYLE_FILE_DEFAULT_NAME) {
    const safeName = sanitizeSliderV2StyleFileName(fileName, SLIDER_V2_STYLE_FILE_DEFAULT_NAME);
    const style = normalizeSliderV2StyleForPersistence(config);
    return {
        version: SLIDER_V2_STYLE_FILE_VERSION,
        kind: SLIDER_V2_STYLE_FILE_KIND,
        name: safeName,
        styleId: style.styleId,
        style,
    };
}
