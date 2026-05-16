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

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            const sliderData = this.properties.sliderContainer || [];
            const structureHash = `${sliderData.length}_${this.properties.nameDisplay}_${sliderData.map(s => `${s.name}:${s.value}:${s.btnLR||false}`).join("|")}_${window._xcpDerpSession}_${mW}_${mH}_${(this.size?.[0] || 0).toFixed(2)}`;

            if (this._lastMapStructure === structureHash && this.layoutMap) {
                return;
            }
            this._lastMapStructure = structureHash;

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
                            hidden: (this.properties.nameDisplay || "Top") !== "Top",
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
                                type: this.UI_TYPES.SLIDER,
                                themeKey: "panel, button, t_textSmall", labelAlign: ["center", "middle"],
                                width: "full", height: "auto", minWidth: 100, padding: [pW, pH],
                                fillPadding: [1, 1],
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

            const pSys = this._t_textsystemPaintData || this._t_textSystemPaintData || { fontSize: 10, font: "Arial", fontWeight: "normal" };
            const sysWidthInput = measureTextWidth("99999", pSys.fontSize, pSys.font, pSys.fontWeight);

            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    margin: [mW, 0], width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Custom node properties:",
                        width: "full", padding: [pW, pH],
                    },
                    optionsRowOne: {
                        dir: "row", width: "full", height: "auto", spacing: [0, sW],
                        padding: [pW, 0],
                        lblSliderCount: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: "Sliders:",
                            width: "auto", spacing: [sW, 0],
                        },
                        editorSliderCount: {
                            type: this.UI_TYPES.EDITOR, canvasShield: true,
                            themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                            text: (this.properties.sliderCount || 1).toString(), measureText: "9",
                            width: "auto", height: "auto", padding: [pW, 0], spacing: [sW, 0],
                            onBlur: (v) => {
                                const val = parseInt(v);
                                if (!isNaN(val) && val >= 1) {
                                    this.properties.sliderCount = val;
                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                }
                            }
                        },
                        lblNameDisply: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: "Name display:",
                            width: "auto", spacing: [sW, 0],
                        },
                        dropdownNameDisplay: {
                            type: this.UI_TYPES.DROPDOWN_DERP,
                            themeKey: "dialog, t_textSystem",
                            canvasShield: true,
                            labelAlign: ["center", "middle"], padding: [pW, pH],
                            width: "auto", measureText: "Slider",
                            items: ["Slider", "Top", "Left", "None"],
                            value: this.properties.nameDisplay || "Top",
                            onChange: (v) => {
                                this.properties.nameDisplay = v;
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
                            text: "NAME", minWidth: 50,
                            width: "fit", padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderMin: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "MIN",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderMax: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "MAX",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderStep: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "STEP",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderDefault: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "DEFAULT",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderDecimal: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "DECIMAL",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                        },
                        lblSliderBtnLR: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "dialog, t_textSystem, 4", state: "DIS", skipBackground: true,
                            labelAlign: ["center", "middle"],
                            text: "BTN",
                            width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
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
                                    labelAlign: ["center", "middle"], text: item.name || "", minWidth: 50, width: "fit", padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].name = v; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderMin_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.min ?? 0).toString(), width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].min = parseFloat(v) || 0; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderMax_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.max ?? 1).toString(), width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].max = parseFloat(v) || 1; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderStep_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.step ?? 0.05).toString(), width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].step = parseFloat(v) || 0.05; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderDefault_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.default ?? 0.5).toString(), width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => { this.properties.sliderContainer[i].default = parseFloat(v) || 0.5; if (this.syncDerpOutputs) this.syncDerpOutputs(); }
                                },
                                [`editorSliderDecimal_${i}`]: {
                                    type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textsystem",
                                    labelAlign: ["center", "middle"], text: (item.decimal ?? 2).toString(), width: sysWidthInput, padding: [pW, 0], spacing: [sW, 0],
                                    onBlur: (v) => {
                                        this.properties.sliderContainer[i].decimal = parseInt(v) || 0;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                    }
                                },
                                [`toggleBtnLR_${i}`]: {
                                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                                    isTextOnly: true, mouseOver: false, icon: "ring",
                                    label: "btnLR",
                                    width: "auto", height: "auto", padding: [pW, 0], spacing: [sW, 0],
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