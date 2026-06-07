/**
 * Path: ./js/widget_Slider.js
 * ROLE: The "Derp Slider" Virtual Node frontend.
 * STATUS: FIXED - Refactored lifecycle into core.
 * BASIS: derpFathaTemplate.js
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { measureTextWidth } from "../herbina/utils/widgetsUtils.js";
import { setupDerpSliderCore } from "./core/derpSlider_core.js";

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

function normalizeSliderNameDisplay(value) {
    const raw = String(value || "").trim();
    const lower = raw.toLowerCase();
    const labelMap = {
        Slider: String(tLocale("$derp_slider.name_display.slider", "Slider")).trim().toLowerCase(),
        Top: String(tLocale("$derp_slider.name_display.top", "Top")).trim().toLowerCase(),
        Left: String(tLocale("$derp_slider.name_display.left", "Left")).trim().toLowerCase(),
        None: String(tLocale("$derp_slider.name_display.none", "None")).trim().toLowerCase(),
    };
    for (const [internalValue, localizedValue] of Object.entries(labelMap)) {
        if (lower === internalValue.toLowerCase() || lower === localizedValue) return internalValue;
    }
    return "Top";
}

function syncDerpSliderLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_slider.title", "Derp Slider");
    const previousLocalizedTitle = node._lastLocalizedDerpSliderTitle;

    if (!node.titleLabel || node.titleLabel === "Derp Slider" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Slider" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }

    node._lastLocalizedDerpSliderTitle = localizedTitle;
}

app.registerExtension({
    name: "xcp.derpSlider_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        // FLEXIBLE TARGETING: Match Python class name "DerpSliderNode"
        if (!nodeData.name.toLowerCase().includes("slidernode")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        // Initialize the Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 120);
        setupDerpSliderCore(nodeType);

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this.properties.nameDisplay = normalizeSliderNameDisplay(this.properties.nameDisplay);
            syncDerpSliderLocaleLabels(this);
            this._lastMapStructure = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSliderSysMap();
            this.requestDerpSync();
        };

        nodeType.prototype.onResize = function(size) {
            if (this.handleSliderResize) this.handleSliderResize(size);
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.nameDisplay = normalizeSliderNameDisplay(this.properties.nameDisplay);

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            const sliderData = this.properties.sliderContainer || [];
            const structureHash = `${sliderData.length}_${this.properties.nameDisplay}_${this.properties.showValueInputbox !== false}_${sliderData.map(s => `${s.name}:${s.btnLR||false}:${s.fillbarHeight ?? 1.0}:${s.knobWidthScale ?? 1.0}:${s.min}:${s.max}:${s.step}:${s.decimal}`).join("|")}_${window._xcpDerpSession}_${mW}_${mH}_${(this.size?.[0] || 0).toFixed(2)}`;
            const valueHash = sliderData.map(s => `${s.value}`).join("|");

            if (this._lastMapStructure === structureHash && this.layoutMap) {
                if (this._lastSliderValues === valueHash) {
                    return;
                }
                this._lastSliderValues = valueHash;

                sliderData.forEach((item, i) => {
                    const sliderKey = `dynamicSlider_${i}`;
                    const valueKey = `dynamicSliderValue_${i}`;
                    const sliderValue = parseFloat(item?.value ?? 0.5);
                    const dec = item?.decimal !== undefined ? parseInt(item.decimal) : 2;
                    const valueText = sliderValue.toFixed(dec);

                    if (this.layoutMap?.sysContentRegion?.[`dynamicSliderRegion_${i}`]?.[sliderKey]) {
                        this.layoutMap.sysContentRegion[`dynamicSliderRegion_${i}`][sliderKey].value = sliderValue;
                    }
                    if (this.layout?.regions?.[sliderKey]) {
                        this.layout.regions[sliderKey].value = sliderValue;
                    }
                    if (this._compDataCache?.[sliderKey]) {
                        this._compDataCache[sliderKey].value = sliderValue;
                    }

                    if (this.layoutMap?.sysContentRegion?.[`dynamicSliderRegion_${i}`]?.[valueKey]) {
                        this.layoutMap.sysContentRegion[`dynamicSliderRegion_${i}`][valueKey].text = valueText;
                        this.layoutMap.sysContentRegion[`dynamicSliderRegion_${i}`][valueKey].value = valueText;
                    }
                    if (this.layout?.regions?.[valueKey]) {
                        this.layout.regions[valueKey].text = valueText;
                        this.layout.regions[valueKey].value = valueText;
                    }
                    if (this._compDataCache?.[valueKey]) {
                        this._compDataCache[valueKey].text = valueText;
                        this._compDataCache[valueKey].value = valueText;
                    }
                });

                return;
            }
            this._lastMapStructure = structureHash;
            this._lastSliderValues = valueHash;

            let labelWidthSmall = 10;
            let labelWidthNormal = 10;
            let valueWidthNormal = 10;

            const pSmall = this._t_textsmallPaintData || this._t_textSmallPaintData || { fontSize: 10, font: "Arial", fontWeight: "normal" };
            const pNorm = this._t_textnormalPaintData || this._t_textNormalPaintData || { fontSize: 12, font: "Arial", fontWeight: "normal" };

            (this.properties.sliderContainer || []).forEach((item, i) => {
                const txt = item.name || `Slider_${i + 1}`;
                const dec = item.decimal !== undefined ? parseInt(item.decimal) : 2;
                const valTxt = parseFloat(item.value ?? 0.5).toFixed(dec);
                const wSys = measureTextWidth("999", pSmall.fontSize, pSmall.font, pSmall.fontWeight);
                const wSmall = measureTextWidth(txt, pSmall.fontSize, pSmall.font, pSmall.fontWeight);
                const wNorm = measureTextWidth(txt, pNorm.fontSize, pNorm.font, pNorm.fontWeight);
                const vNorm = measureTextWidth(valTxt + "9", pNorm.fontSize, pNorm.font, pNorm.fontWeight);
                if (wSmall > labelWidthSmall) labelWidthSmall = wSmall;
                if (wNorm > labelWidthNormal) labelWidthNormal = wNorm;
                if (vNorm > valueWidthNormal) valueWidthNormal = vNorm;
            });

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y"},
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: [mW, mH],
                    ...Object.fromEntries(Array.from({ length: (this.properties.sliderContainer?.length || 0) }).flatMap((_, i) => [
                        [`lblTitle_${i}`, {
                            type: this.UI_TYPES.EDITOR, canvasShield: true,
                            themeKey: "t_textSmall",
                            hidden: this.properties.nameDisplay !== "Top",
                            labelAlign: ["left", "middle"],
                            text: this.properties.sliderContainer?.[i]?.name || `Slider_${i + 1}`,
                            width: labelWidthSmall, padding: [0, 0],
                            onBlur: (v) => {
                                if (this.properties.sliderContainer?.[i]) {
                                    this.properties.sliderContainer[i].name = v;
                                    if (this.broadcastWirelessSignal) this.broadcastWirelessSignal(this.properties.sliderContainer);
                                    this.refreshNodeLayoutMap();
                                }
                            }
                        }],
                        [`dynamicSliderRegion_${i}`, {
                            dir: "row", width: "full", height: "auto", 
                            padding: [0, 0], spacing: [0, sH],
                            [`dynamicTitle_${i}`]: {
                                type: this.UI_TYPES.EDITOR, canvasShield: true,
                                themeKey: "t_textNormal",
                                hidden: this.properties.nameDisplay !== "Left",
                                labelAlign: ["left", "middle"],
                                text: this.properties.sliderContainer?.[i]?.name || `Slider_${i + 1}`,
                                width: labelWidthNormal, padding: [0, 0], spacing: [sW, 0],
                                onBlur: (v) => {
                                    if (this.properties.sliderContainer?.[i]) {
                                        this.properties.sliderContainer[i].name = v;
                                        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal(this.properties.sliderContainer);
                                        this.refreshNodeLayoutMap();
                                    }
                                }
                            },
                            [`dynamicSlider_${i}`]: {
                                type: this.UI_TYPES.SLIDER, style: "knob",
                                knobWidthScale: parseFloat(this.properties.sliderContainer?.[i]?.knobWidthScale ?? 1.0),
                                themeKey: "panel, button, t_textSmall", labelAlign: ["center", "middle"], mouseOver: false,
                                width: "full", height: "auto", minWidth: 100, padding: [pW, pH],
                                fillPadding: [1, 1],
                                fillbarHeight: parseFloat(this.properties.sliderContainer?.[i]?.fillbarHeight ?? 1.0),
                                text: (this.properties.nameDisplay === "Slider") ? (this.properties.sliderContainer?.[i]?.name || `Slider_${i + 1}`) : "",
                                value: parseFloat(this.properties.sliderContainer?.[i]?.value ?? 0.5),
                                min: parseFloat(this.properties.sliderContainer?.[i]?.min ?? 0),
                                max: parseFloat(this.properties.sliderContainer?.[i]?.max ?? 1),
                                spacing: [sW, 0],
                                btnLR: this.properties.sliderContainer?.[i]?.btnLR ?? false,
                                step: parseFloat(this.properties.sliderContainer?.[i]?.step ?? 0.05),
                            },
                            [`dynamicSliderValue_${i}`]: {
                                type: this.UI_TYPES.EDITOR, canvasShield: true,
                                hidden: this.properties.showValueInputbox === false,
                                themeKey: "dialog, t_textNormal", labelAlign: ["center", "middle"],
                                text: parseFloat(this.properties.sliderContainer?.[i]?.value ?? 0.5).toFixed(this.properties.sliderContainer?.[i]?.decimal !== undefined ? parseInt(this.properties.sliderContainer[i].decimal) : 2),
                                width: valueWidthNormal, height: "fill", padding: [pW, pH],
                                onBlur: (v) => {
                                    const val = parseFloat(v);
                                    if (!isNaN(val) && this.properties.sliderContainer?.[i]) {
                                        this.properties.sliderContainer[i].value = val;
                                        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal(this.properties.sliderContainer);
                                        this.refreshNodeLayoutMap();
                                    }
                                }
                            },
                        }]
                    ]))
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpSliderSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const nameDisplay = normalizeSliderNameDisplay(this.properties.nameDisplay);
            const nameDisplayItems = [
                { display: tLocale("$derp_slider.name_display.slider", "Slider"), value: "Slider" },
                { display: tLocale("$derp_slider.name_display.top", "Top"), value: "Top" },
                { display: tLocale("$derp_slider.name_display.left", "Left"), value: "Left" },
                { display: tLocale("$derp_slider.name_display.none", "None"), value: "None" },
            ];

            const pSys = this._t_textsystemPaintData || this._t_textSystemPaintData || { fontSize: 10, font: "Arial", fontWeight: "normal" };
            const sysWidthInput = measureTextWidth("99999", pSys.fontSize, pSys.font, pSys.fontWeight);

            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    margin: [mW, sH], width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_slider.system.properties", "Derp Slider properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    optionsRowOne: {
                        dir: "row", width: "full", height: "auto", spacing: [0, sW],
                        padding: [pW, pH],
                        lblSliderCount: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider.system.sliders", "Sliders:"),
                            width: "auto", spacing: [sW, 0],
                        },
                        editorSliderCount: {
                            type: this.UI_TYPES.EDITOR, canvasShield: true,
                            themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                            text: (this.properties.sliderCount || 1).toString(), measureText: "9",
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            onBlur: (v) => {
                                const val = parseInt(v);
                                if (!isNaN(val) && val >= 1) {
                                    this.properties.sliderCount = val;
                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                }
                            }
                        },
                        lblNameDisply: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider.system.name_display", "Name display:"),
                            width: "auto", spacing: [sW, 0],
                        },
                        dropdownNameDisplay: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown", measureText: "On Slider ",
                            themeKey: "dialog, t_textSystem",
                            canvasShield: true,
                            padding: [pW, pH],
                            width: "auto",
                            mode: "file",
                            rootName: "namedisplay",
                            items: nameDisplayItems,
                            value: nameDisplay,
                             onChange: (v) => {
                                this.properties.nameDisplay = normalizeSliderNameDisplay(v);
                                this.refreshNodeLayoutMap();
                                if (this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleEditor: {
                            type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                            isTextOnly: true, mouseOver: false,
                            label: tLocale("$derp_slider.system.value_inputbox", "Value Inputbox"),
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            value: this.properties.showValueInputbox !== false,
                            onPress: () => {
                                this.properties.showValueInputbox = !(this.properties.showValueInputbox !== false);
                                this.refreshNodeLayoutMap();
                                if (this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
                                this.requestDerpSync();
                            },
                        },
                    },
                    optionsRowTwo: {
                        dir: "row", width: "full", height: "auto", spacing: [0, sW],
                        padding: [pW, pH],
                        lblSliderHeight: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: "Slider Height:",
                            width: "auto", spacing: [sW, 0],
                        },
                        editorFillbarHeight: {
                            type: this.UI_TYPES.EDITOR, canvasShield: true,
                            themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                            text: (this.properties.sliderContainer?.[0]?.fillbarHeight ?? 1.0).toString(), measureText: "9.99",
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            onBlur: (v) => {
                                const raw = parseFloat(v);
                                const value = Number.isFinite(raw) ? raw : 1.0;
                                (this.properties.sliderContainer || []).forEach((item) => { item.fillbarHeight = value; });
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                                if (this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
                                this.requestDerpSync();
                            }
                        },
                        lblKnobWidth: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: "Knob Width:",
                            width: "auto", spacing: [sW, 0],
                        },
                        editorKnobWidthScale: {
                            type: this.UI_TYPES.EDITOR, canvasShield: true,
                            themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                            text: (this.properties.sliderContainer?.[0]?.knobWidthScale ?? 1.0).toString(), measureText: "9.99",
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            measureText: "9.99",
                            onBlur: (v) => {
                                const raw = parseFloat(v);
                                const value = Number.isFinite(raw) ? Math.max(0.2, Math.min(1.5, raw)) : 1.0;
                                (this.properties.sliderContainer || []).forEach((item) => { item.knobWidthScale = value; });
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                this.refreshNodeLayoutMap();
                                if (this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
                                this.requestDerpSync();
                            }
                        },
                    },
                    sliderSettingsLabels: {
                        dir: "row", width: "full", height: "auto",
                        padding: [pW, pH], hidden: false,
                        lblSliderName: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.name", "NAME"), minWidth: 50,
                            width: "fit", padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderMin: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.min", "MIN"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderMax: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.max", "MAX"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderStep: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.step", "STEP"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderDefault: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.default", "DEFAULT"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderDecimal: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.decimal", "DECIMAL"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                        lblSliderBtnLR: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: tLocale("$derp_slider.headers.btn", "BTN"),
                            width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                        },
                    },
                    sliderSettings: {
                        dir: "col", width: "full", height: "auto",
                        padding: [0, 0], spacing: [0, sH],
                        ...Object.fromEntries((this.properties.sliderContainer || []).flatMap((item, i) => [
                            [`sliderRow_${i}`, {
                                dir: "row", width: "full", height: "auto",
                                padding: [pW, 2], spacing: [0, 0],
                                [`editorSliderName_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: item.name || "", minWidth: 50, width: "fit", padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].name = v; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderMin_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.min ?? 0).toString(), width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].min = parseFloat(v) || 0; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderMax_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.max ?? 1).toString(), width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].max = parseFloat(v) || 1; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderStep_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.step ?? 0.05).toString(), width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].step = parseFloat(v) || 0.05; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderDefault_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.default ?? 0.5).toString(), width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].default = parseFloat(v) || 0.5; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderDecimal_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.decimal ?? 2).toString(), width: sysWidthInput, padding: [pW, pH], spacing: [sW, 0],
                                    onBlur: (v) => {
                                        this.properties.sliderContainer[i].decimal = parseInt(v) || 0;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                    }
                                },
                                [`toggleBtnLR_${i}`]: {
                                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                                    isTextOnly: true, mouseOver: false, icon: "ring",
                                    label: tLocale("$derp_slider.headers.btn_lr", "btnLR"),
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    value: item.btnLR ?? false,
                                    onPress: () => {
                                        this.properties.sliderContainer[i].btnLR = !this.properties.sliderContainer[i].btnLR;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                    }
                                }
                            }]
                        ]))
                    },
                },
                layoutSpacer: {
                    anchor: { target: "sliderSettings", axis: "y", offset: oY },
                }
            };

            if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                this._derpPanel.setLayoutMap(this.sysLayoutMap);
            }
        };
    }
});
