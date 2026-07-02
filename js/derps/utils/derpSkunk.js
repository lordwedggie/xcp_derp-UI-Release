/**
 * Path: ./js/derps/derpSkunk.js
 * STATUS: VIRTUAL FATHA COMPLIANT | FIXED: Pure Virtual Enforcer & Title Persistence
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { UI_TYPES } from "../../fatha/core/masterLayoutTypes.js";
import { resolveSliderV2Interaction, setSliderV2GlobalRenderPath } from "../../herbina/widgets/helpers/sliderV2Config.js";
import { listSliderV2StylePresets, normalizeSliderV2StyleId, prepareSliderV2StyleConfig } from "../../herbina/widgets/helpers/sliderV2Styles.js";
import { normalizeSliderV2RenderPath, normalizeSliderV2Value } from "../../herbina/widgets/helpers/sliderV2Value.js";

const SKUNK_SLIDER_MIN = 0;
const SKUNK_SLIDER_MAX = 1;
const SKUNK_SLIDER_STEP = 0.01;
const SKUNK_SLIDER_DEFAULT = 0.5;
const SKUNK_SLIDER_DECIMALS = 2;
const SKUNK_SLIDER_KEYS = ["sliderNormal", "sliderSmall", "sliderSystem"];

const SKUNK_TRIGGER_SLIDER_MAP = {
    triggerNormal: "sliderNormal",
    triggerSmall: "sliderSmall",
    triggerSystem: "sliderSystem",
};

function clampSkunkSliderValue(value) {
    return normalizeSliderV2Value(value, {
        min: SKUNK_SLIDER_MIN,
        max: SKUNK_SLIDER_MAX,
        step: SKUNK_SLIDER_STEP,
        decimals: SKUNK_SLIDER_DECIMALS,
        default: SKUNK_SLIDER_DEFAULT,
    });
}

function ensureSkunkSliderValues(node) {
    if (!node.properties._skunkSliderValues || typeof node.properties._skunkSliderValues !== "object") {
        node.properties._skunkSliderValues = {};
    }
    SKUNK_SLIDER_KEYS.forEach((key) => {
        node.properties._skunkSliderValues[key] = clampSkunkSliderValue(node.properties._skunkSliderValues[key]);
    });
    return node.properties._skunkSliderValues;
}

function setSkunkSliderValue(node, sliderKey, value) {
    const values = ensureSkunkSliderValues(node);
    values[sliderKey] = clampSkunkSliderValue(value);
    const liveReg = node.layoutMap?.regionSlider?.[sliderKey];
    if (liveReg) liveReg.value = values[sliderKey];
    node._layoutMapHash = null;
    node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 3);
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

function getSkunkSliderV2Config(node, sliderKey) {
    const values = ensureSkunkSliderValues(node);
    const styleConfig = getSkunkSliderStyleConfig(node?.properties?._skunkSliderConfig || {});
    return {
        min: SKUNK_SLIDER_MIN,
        max: SKUNK_SLIDER_MAX,
        step: SKUNK_SLIDER_STEP,
        decimals: SKUNK_SLIDER_DECIMALS,
        default: SKUNK_SLIDER_DEFAULT,
        value: values[sliderKey],
        btnLR: ensureSkunkSliderBtnLRStates(node)[sliderKey] === true,
        sliderType: "horizontal",
        styleId: styleConfig.styleId,
        style: styleConfig.style,
        htmlStyle: styleConfig.htmlStyle,
        fillbarHeight: styleConfig.fillbarHeight,
        roundKnob: styleConfig.roundKnob,
        knobWidthScale: styleConfig.knobWidthScale,
        knobHeightOffset: styleConfig.knobHeightOffset,
        knobRadiusOffset: styleConfig.knobRadiusOffset,
    };
}

function setSkunkSliderValueFromInteraction(node, sliderKey, data, type = "drag") {
    const reg = node.layout?.computedRegions?.[sliderKey] || node.layout?.regions?.[sliderKey];
    if (!reg || !Number.isFinite(reg.w) || reg.w <= 0) return;
    const result = resolveSliderV2Interaction(reg, getSkunkSliderV2Config(node, sliderKey), data?.localX, type);
    if (result.handled && result.value !== undefined) setSkunkSliderValue(node, sliderKey, result.value);
}

function ensureSkunkSliderBtnLRStates(node) {
    if (!node.properties._skunkSliderBtnLR || typeof node.properties._skunkSliderBtnLR !== "object") {
        node.properties._skunkSliderBtnLR = {};
    }
    SKUNK_SLIDER_KEYS.forEach((key) => {
        node.properties._skunkSliderBtnLR[key] = node.properties._skunkSliderBtnLR[key] === true;
    });
    return node.properties._skunkSliderBtnLR;
}

function toggleSkunkSliderBtnLR(node, sliderKey) {
    const btnLRStates = ensureSkunkSliderBtnLRStates(node);
    btnLRStates[sliderKey] = !btnLRStates[sliderKey];
    const liveReg = node.layoutMap?.regionSlider?.[sliderKey];
    if (liveReg) liveReg.btnLR = btnLRStates[sliderKey];
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

function getSkunkSliderStyleConfig(config = {}) {
    return prepareSliderV2StyleConfig({
        styleId: config.styleId,
        fillbarHeight: config.fillbarHeight,
        roundKnob: config.roundKnob,
        knobWidthScale: config.knobWidthScale,
        knobHeightOffset: config.knobHeightOffset,
        knobRadiusOffset: config.knobRadiusOffset,
    });
}

function getSkunkSliderRenderPath() {
    return normalizeSliderV2RenderPath(window.DERP_GLOBAL_SETTINGS?.sliderV2RenderPath);
}

function setSkunkSliderRenderPath(node, value) {
    setSliderV2GlobalRenderPath(value, {
        nodes: app.graph?._nodes || [node],
        bastas: window.xcpActiveBastas?.values?.() || [],
        canvas: app.canvas,
    }, window);
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
}

function buildSkunkLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const toggleBtnState = node?.properties?.toggleBtnState === true ? 1 : 0;
    const toggleIconState = node?.properties?.toggleIconState === true ? 1 : 0;
    const toggleEditorState = node?.properties?.toggleEditorState === true ? 1 : 0;
    const toggleSliderState = node?.properties?.toggleSliderState === true ? 1 : 0;
    const toggleToggleState = node?.properties?.toggleToggleState === true ? 1 : 0;
    const toggleMultilineState = node?.properties?.toggleMultilineEditorState === true ? 1 : 0;
    const multilineTextKey = node?.properties?.multilineEditorTextKey || "t_textNormal";
    const sc = node?.properties?._skunkSliderConfig || {};
    const effectiveStyle = getSkunkSliderStyleConfig(sc);
    const scFH = Number(effectiveStyle.fillbarHeight ?? 1.0).toFixed(2);
    const scRK = (effectiveStyle.roundKnob !== false) ? 1 : 0;
    const scKW = Number(effectiveStyle.knobWidthScale ?? 1.0).toFixed(2);
    const scKH = Number(effectiveStyle.knobHeightOffset ?? 0).toFixed(2);
    const scKR = Number(effectiveStyle.knobRadiusOffset ?? 0).toFixed(2);
    const scStyle = effectiveStyle.styleId;
    const scRenderPath = getSkunkSliderRenderPath();
    const bs = node?.properties?._skunkBtnStates || {};
    const btnHash = `${bs.btnBig ? 1 : 0}_${bs.btnNormal ? 1 : 0}_${bs.btnSmall ? 1 : 0}_${bs.btnSystem ? 1 : 0}`;
    const is = node?.properties?._skunkIconStates || {};
    const iconHash = Object.keys(is).sort().map(k => `${k}:${is[k] ? 1 : 0}`).join('_') || '0';
    const sv = node?.properties?._skunkSliderValues || {};
    const sliderHash = SKUNK_SLIDER_KEYS.map(k => clampSkunkSliderValue(sv[k]).toFixed(SKUNK_SLIDER_DECIMALS)).join('_');
    const blr = node?.properties?._skunkSliderBtnLR || {};
    const btnLRHash = SKUNK_SLIDER_KEYS.map(k => blr[k] === true ? 1 : 0).join('_');
    return `${width}_${mW}_${mH}_${oY}_${toggleBtnState}_${toggleIconState}_${toggleEditorState}_${toggleSliderState}_${toggleToggleState}_${toggleMultilineState}_${multilineTextKey}_${btnHash}_${iconHash}_${sliderHash}_${btnLRHash}_${scFH}_${scRK}_${scKW}_${scKH}_${scKR}_${scStyle}_${scRenderPath}`;
}

app.registerExtension({
    name: "xcp.derpSkunk_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpSkunk") return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        // Initialize the Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 250);

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSkunkSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSkunkSysMap();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildSkunkLayoutHash(this, { mW, mH, oY });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            // Grab available themes dynamically from the global config
            const sysCfg = window.xcpDerpThemeConfig;
            const allThemes = sysCfg?.themes || {};
            const availableThemes = Object.keys(allThemes);
            const requestedTheme = this.properties?.selectedTheme || sysCfg?.activeTheme || (availableThemes.length > 0 ? availableThemes[0] : "Default");
            const activeTheme = availableThemes.includes(requestedTheme) ? requestedTheme : (sysCfg?.activeTheme || availableThemes[0] || "Default");
            const toggleBtnState = this.properties.toggleBtnState === true;
            const toggleIconState = this.properties.toggleIconState === true;
            const toggleEditorState = this.properties.toggleEditorState === true;
            const toggleSliderState = this.properties.toggleSliderState === true;
            const toggleToggleState = this.properties.toggleToggleState === true;
            const toggleMultilineEditorState = this.properties.toggleMultilineEditorState === true;
            const multilineTextKey = this.properties.multilineEditorTextKey || "t_textNormal";
            const btnStates = this.properties._skunkBtnStates || {};
            const btnOn = (key) => toggleBtnState ? false : (btnStates[key] === true);
            const iconStates = this.properties._skunkIconStates || {};
            const iconOn = (key) => toggleIconState ? false : (iconStates[key] === true);
            const sliderValues = ensureSkunkSliderValues(this);
            const sliderBtnLR = ensureSkunkSliderBtnLRStates(this);
            const sliderCfg = this.properties._skunkSliderConfig || {};
            const sliderStyleConfig = getSkunkSliderStyleConfig(sliderCfg);
            const sliderStyleId = sliderStyleConfig.styleId;
            const sliderRenderPath = getSkunkSliderRenderPath();
            const roundKnobEnabled = sliderStyleConfig.roundKnob !== false;
            const sliderStyleItems = listSliderV2StylePresets().map((preset) => ({ value: preset.id, label: preset.label }));
            const sliderConfig = (key) => ({
                value: sliderValues[key],
                min: SKUNK_SLIDER_MIN,
                max: SKUNK_SLIDER_MAX,
                step: SKUNK_SLIDER_STEP,
                btnLR: sliderBtnLR[key] === true,
                styleId: sliderStyleId,
                fillbarHeight: sliderCfg.fillbarHeight,
                roundKnob: sliderCfg.roundKnob,
                knobWidthScale: sliderCfg.knobWidthScale,
                knobHeightOffset: sliderCfg.knobHeightOffset,
                knobRadiusOffset: sliderCfg.knobRadiusOffset,
                onChange: (value) => setSkunkSliderValue(this, key, value),
                onPress: (event, data) => setSkunkSliderValueFromInteraction(this, key, data, "click"),
                onDblClick: (event, reg, data) => setSkunkSliderValueFromInteraction(this, key, data, "dblclick"),
                onDragStart: (event, data) => setSkunkSliderValueFromInteraction(this, key, data, "dragStart"),
                onDrag: (event, data) => setSkunkSliderValueFromInteraction(this, key, data, "drag"),
            });
            const triggerConfig = (key, text) => {
                const sliderKey = SKUNK_TRIGGER_SLIDER_MAP[key];
                const active = sliderBtnLR[sliderKey] === true;
                return {
                    type: UI_TYPES.COMPOSITE_TRIGGER,
                    themeKey: "button, button, t_textNormal",
                    text,
                    value: active,
                    width: "full", height: "auto",
                    padding: [pW, pH],
                    spacing: [sW, 0],
                    state: toggleToggleState ? "DIS" : (active ? "ON" : "OFF"),
                    onPress: () => {
                        if (toggleToggleState) return;
                        toggleSkunkSliderBtnLR(this, sliderKey);
                    },
                };
            };

            this.layoutMap = {
                themeLoading: {
                    width: "full", height: "auto", dir: "row",
                    margin: [mW, mH],
                    lblTestingTheme: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textNormal",
                        text: "Testing Theme:",
                        width: "auto", height: "auto",
                        objectAlign: ["left", "middle"],
                        //padding: [pW, pH],
                        spacing: [sW, 0],
                    },
                    dropdownThemeSelector: {
                        type: UI_TYPES.FILEBROWSER,
                        themeKey: "panel, t_textNormal",
                        canvasShield: true,
                        indicator: true,
                        displayMode: "cutoff",
                        spacing: [sW, 0],
                        padding: [pW, pH],
                        width: "full", height: "auto", minWidth: 80,
                        mode: "file",
                        fileType: "theme",
                        rootName: "themes",
                        items: availableThemes,
                        value: activeTheme,
                        onChange: (val) => {
                            if (sysCfg) {
                                sysCfg.activeTheme = val;
                                this.properties.selectedTheme = val;
                                if (typeof this.onThemeUpdate === "function") this.onThemeUpdate(sysCfg);
                                if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                                else this.setDirtyCanvas(true, true);
                            }
                        },
                    },
                },
                regionBUTTON: {
                    width: "full", height: "auto", dir: "row",
                    margin: [mW, mH],
                    btnBig: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textBIG",
                        text: "Big Text",
                        width: "auto", height: "auto", padding: [pW, pH],
                        onPress: () => {
                            if (toggleBtnState) return;
                            const s = { ...this.properties._skunkBtnStates };
                            s.btnBig = !s.btnBig;
                            this.properties._skunkBtnStates = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                        spacing: [sW, 0],
                        state: toggleBtnState ? "DIS" : (btnOn("btnBig") ? "ON" : "OFF"),
                    },
                    btnNormal: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textNormal",
                        text: "Normal Text",
                        width: "auto", height: "auto", padding: [pW, pH],
                        onPress: () => {
                            if (toggleBtnState) return;
                            const s = { ...this.properties._skunkBtnStates };
                            s.btnNormal = !s.btnNormal;
                            this.properties._skunkBtnStates = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                        spacing: [sW, 0],
                        state: toggleBtnState ? "DIS" : (btnOn("btnNormal") ? "ON" : "OFF"),
                    },
                    btnSmall: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                        text: "Small Text",
                        width: "auto", height: "auto", padding: [pW, pH],
                        onPress: () => {
                            if (toggleBtnState) return;
                            const s = { ...this.properties._skunkBtnStates };
                            s.btnSmall = !s.btnSmall;
                            this.properties._skunkBtnStates = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                        spacing: [sW, 0],
                        state: toggleBtnState ? "DIS" : (btnOn("btnSmall") ? "ON" : "OFF"),
                    },
                    btnSystem: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSystem",
                        text: "System Text",
                        width: "auto", height: "auto", padding: [pW, pH],
                        onPress: () => {
                            if (toggleBtnState) return;
                            const s = { ...this.properties._skunkBtnStates };
                            s.btnSystem = !s.btnSystem;
                            this.properties._skunkBtnStates = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                        state: toggleBtnState ? "DIS" : (btnOn("btnSystem") ? "ON" : "OFF"),
                    },
                    spring: { width: "full", height: 0 },
                    toggleBtnState: {
                        type: UI_TYPES.TOGGLE_V2,
                        themeKey: "dialog, button, t_textsystem",
                        text: "Show DIS state",
                        value: this.properties.toggleBtnState === true,
                        isTextOnly: true,
                        width: "auto", height: "auto",
                        onPress: (e, data) => {
                            const v = !(this.properties.toggleBtnState === true);
                            this.properties.toggleBtnState = v;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                },
                lineBreak1: {
                    type: UI_TYPES.LINEBREAK,
                    width: "full", height: 1,
                },
                regionBtnIcon: {
                    dir: "row", width: "full", height: 22,
                    margin: [mW, mH],
                    spacing: [sW, 0],
                        iconAdd: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "add",
                            toolTip: "add",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("add") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["add"] = !s["add"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconSubtract: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "subtract",
                            toolTip: "subtract",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("subtract") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["subtract"] = !s["subtract"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconDeck: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "deck",
                            toolTip: "deck",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("deck") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["deck"] = !s["deck"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconUndeck: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "undeck",
                            toolTip: "undeck",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("undeck") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["undeck"] = !s["undeck"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconDelete: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "delete",
                            toolTip: "delete",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("delete") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["delete"] = !s["delete"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconNew: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "new",
                            toolTip: "new",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("new") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["new"] = !s["new"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconCopy: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "copy",
                            toolTip: "copy",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("copy") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["copy"] = !s["copy"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconRename: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "rename",
                            toolTip: "rename",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("rename") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["rename"] = !s["rename"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconRevert: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "revert",
                            toolTip: "revert",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("revert") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["revert"] = !s["revert"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconRefresh: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "refresh",
                            toolTip: "refresh",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("refresh") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["refresh"] = !s["refresh"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconSave: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "save",
                            toolTip: "save",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("save") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["save"] = !s["save"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconTrash: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "trash",
                            toolTip: "trash",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("trash") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["trash"] = !s["trash"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconClose: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "close",
                            toolTip: "close",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("close") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["close"] = !s["close"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconPower: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "power",
                            toolTip: "power",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("power") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["power"] = !s["power"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconPin: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "pin",
                            toolTip: "pin",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("pin") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["pin"] = !s["pin"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconPlay: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "play",
                            toolTip: "play",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("play") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["play"] = !s["play"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconUparrow: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "uparrow",
                            toolTip: "uparrow",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("uparrow") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["uparrow"] = !s["uparrow"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconDownarrow: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "downarrow",
                            toolTip: "downarrow",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("downarrow") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["downarrow"] = !s["downarrow"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconLeftarrow: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "leftarrow",
                            toolTip: "leftarrow",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("leftarrow") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["leftarrow"] = !s["leftarrow"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconRightarrow: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "rightarrow",
                            toolTip: "rightarrow",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("rightarrow") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["rightarrow"] = !s["rightarrow"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconWireless: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "wireless",
                            toolTip: "wireless",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("wireless") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["wireless"] = !s["wireless"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconPreview: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "preview",
                            toolTip: "preview",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("preview") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["preview"] = !s["preview"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconFile: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "file",
                            toolTip: "file",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("file") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["file"] = !s["file"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconClean: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "clean",
                            toolTip: "clean",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("clean") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["clean"] = !s["clean"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconFolder: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "folder",
                            toolTip: "folder",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("folder") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["folder"] = !s["folder"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconSettings: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "settings",
                            toolTip: "settings",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("settings") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["settings"] = !s["settings"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        iconWarpto: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            icon: "warpto",
                            toolTip: "warpto",
                            width: "match", height: "auto",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            state: toggleIconState ? "DIS" : (iconOn("warpto") ? "ON" : "OFF"),
                            onPress: () => {
                                if (toggleIconState) return;
                                const s = { ...this.properties._skunkIconStates };
                                s["warpto"] = !s["warpto"];
                                this.properties._skunkIconStates = s;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                    spring: { width: "full", height: 0 },
                    toggleIconDIS: {
                        type: UI_TYPES.TOGGLE_V2,
                        themeKey: "panel, button, t_textsystem",
                        text: "Show DIS state",
                        value: this.properties.toggleIconState === true,
                        isTextOnly: true,
                        width: "auto", height: "auto",
                        onPress: (e, data) => {
                            const v = !(this.properties.toggleIconState === true);
                            this.properties.toggleIconState = v;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                },
                lineBreak2: {
                    type: UI_TYPES.LINEBREAK,
                    width: "full", height: 1,
                },
                regionEditor: {
                    dir: "row", width: "full", height: "auto",
                    margin: [mW, mH],
                    spacing: [sW, 0],
                    editorNormal: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textNormal",
                        canvasShield: true,
                        text: "Normal Editor", value: "Normal Editor",
                        mouseOver: true,
                        width: "fit", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleEditorState ? "DIS" : "OFF",
                    },
                    editorSmall: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textSmall",
                        canvasShield: true,
                        text: "Small Editor", value: "Small Editor",
                        mouseOver: true,
                        width: "fit", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleEditorState ? "DIS" : "OFF",
                    },
                    editorSystem: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textSystem",
                        canvasShield: true,
                        text: "System Editor", value: "System Editor",
                        mouseOver: true,
                        width: "fit", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleEditorState ? "DIS" : "OFF",
                    },
                    spring: { width: "full", height: 0 },
                    toggleEditorDIS: {
                        type: UI_TYPES.TOGGLE_V2,
                        themeKey: "button, t_textsystem",
                        text: "Show DIS state",
                        value: this.properties.toggleEditorState === true,
                        isTextOnly: true,
                        width: "auto", height: "auto",
                        onPress: (e, data) => {
                            const v = !(this.properties.toggleEditorState === true);
                            this.properties.toggleEditorState = v;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                },
                lineBreak3: {
                    type: UI_TYPES.LINEBREAK,
                    width: "full", height: 1,
                },
                regionSlider: {
                    dir: "row", width: "full", height: "auto",
                    margin: [mW, mH],
                    spacing: [sW, 0],
                    sliderNormal: {
                        type: UI_TYPES.SLIDER_V2,
                        themeKey: "slider, t_textNormal",
                        valueType: "float",
                        ...sliderConfig("sliderNormal"),
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleSliderState ? "DIS" : "OFF",
                    },
                    sliderSmall: {
                        type: UI_TYPES.SLIDER_V2,
                        themeKey: "slider, t_textSmall",
                        valueType: "float",
                        ...sliderConfig("sliderSmall"),
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleSliderState ? "DIS" : "OFF",
                    },
                    sliderSystem: {
                        type: UI_TYPES.SLIDER_V2,
                        themeKey: "slider, t_textSystem",
                        valueType: "float",
                        ...sliderConfig("sliderSystem"),
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        state: toggleSliderState ? "DIS" : "OFF",
                    },
                    //spring: { width: "full", height: 0 },
                    toggleSliderDIS: {
                        type: UI_TYPES.TOGGLE_V2,
                        themeKey: "button, t_textsystem",
                        text: "Show DIS state",
                        value: this.properties.toggleSliderState === true,
                        isTextOnly: true,
                        width: "auto", height: "auto",
                        onPress: (e, data) => {
                            const v = !(this.properties.toggleSliderState === true);
                            this.properties.toggleSliderState = v;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                },
                regionSliderOptions: {
                    dir: "row", width: "full", height: "auto", spacing: [0, sW],
                    padding: [pW, pH],
                    lblSliderHeight: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Slider Height:",
                        width: "auto", spacing: [sW, 0],
                    },
                    dropdownSliderStyle: {
                        type: UI_TYPES.FILEBROWSER,
                        themeKey: "panel, t_textSystem",
                        canvasShield: true,
                        indicator: true,
                        displayMode: "cutoff",
                        width: "auto", height: "auto",
                        minWidth: 70,
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        mode: "file",
                        items: sliderStyleItems,
                        value: sliderStyleId,
                        onChange: (value) => {
                            const s = { ...(this.properties._skunkSliderConfig || {}), styleId: normalizeSliderV2StyleId(value) };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                    dropdownSliderRenderPath: {
                        type: UI_TYPES.FILEBROWSER,
                        themeKey: "panel, t_textSystem",
                        canvasShield: true,
                        indicator: true,
                        displayMode: "cutoff",
                        width: "auto", height: "auto",
                        minWidth: 72,
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        mode: "file",
                        items: [
                            { value: "canvas", label: "Canvas" },
                            { value: "html", label: "HTML" },
                        ],
                        value: sliderRenderPath,
                        onChange: (value) => setSkunkSliderRenderPath(this, value),
                    },
                    editorFillbarHeight: {
                        type: UI_TYPES.EDITOR, canvasShield: true,
                        themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                        text: String(sliderStyleConfig.fillbarHeight ?? 1.0), measureText: "9.99",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        onBlur: (v) => {
                            const raw = parseFloat(v);
                            const s = { ...(this.properties._skunkSliderConfig || {}), fillbarHeight: Number.isFinite(raw) ? Math.max(0.2, Math.min(1.0, raw)) : 1.0 };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    toggleRoundKnob: {
                        type: UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                        isTextOnly: true, mouseOver: false,
                        label: "Round Knob",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        value: roundKnobEnabled,
                        onPress: () => {
                            const s = { ...(this.properties._skunkSliderConfig || {}), roundKnob: !roundKnobEnabled };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    lblKnobWidth: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        hidden: roundKnobEnabled,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Knob Width:",
                        width: "auto", spacing: [sW, 0],
                    },
                    editorKnobWidthScale: {
                        type: UI_TYPES.EDITOR, canvasShield: true,
                        hidden: roundKnobEnabled,
                        themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                        text: String(sliderStyleConfig.knobWidthScale ?? 1.0), measureText: "9.99",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        onBlur: (v) => {
                            const raw = parseFloat(v);
                            const s = { ...(this.properties._skunkSliderConfig || {}), knobWidthScale: Number.isFinite(raw) ? Math.max(0.2, Math.min(2.0, raw)) : 1.0 };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    lblKnobHeight: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        hidden: roundKnobEnabled,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Knob Height:",
                        width: "auto", spacing: [sW, 0],
                    },
                    editorKnobHeightOffset: {
                        type: UI_TYPES.EDITOR, canvasShield: true,
                        hidden: roundKnobEnabled,
                        themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                        text: String(sliderStyleConfig.knobHeightOffset ?? 0), measureText: "9.99",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        onBlur: (v) => {
                            const raw = parseFloat(v);
                            const s = { ...(this.properties._skunkSliderConfig || {}), knobHeightOffset: Number.isFinite(raw) ? Math.max(-5, Math.min(5, raw)) : 0 };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                    lblKnobRadius: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        hidden: !roundKnobEnabled,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Knob radius:",
                        width: "auto", spacing: [sW, 0],
                    },
                    editorKnobRadiusOffset: {
                        type: UI_TYPES.EDITOR, canvasShield: true,
                        hidden: !roundKnobEnabled,
                        themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                        text: String(sliderStyleConfig.knobRadiusOffset ?? 0), measureText: "9.99",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                        onBlur: (v) => {
                            const raw = parseFloat(v);
                            const s = { ...(this.properties._skunkSliderConfig || {}), knobRadiusOffset: Number.isFinite(raw) ? Math.max(-3, Math.min(3, raw)) : 0 };
                            this.properties._skunkSliderConfig = s;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        }
                    },
                },
                lineBreak4: {
                    type: UI_TYPES.LINEBREAK,
                    width: "full", height: 1,
                },
                regionTrigger: {
                    dir: "row", width: "full", height: "auto",
                    margin: [mW, mH],
                    spacing: [sW, 0],
                    triggerNormal: triggerConfig("triggerNormal", "Normal btnLR"),
                    triggerSmall: triggerConfig("triggerSmall", "Small btnLR"),
                    triggerSystem: triggerConfig("triggerSystem", "System btnLR"),
                    spring: { width: "full", height: 0 },
                    toggleToggleDIS: {
                        type: UI_TYPES.TOGGLE_V2,
                        themeKey: "button, t_textsystem",
                        text: "Show DIS state",
                        value: this.properties.toggleToggleState === true,
                        isTextOnly: true,
                        width: "auto", height: "auto",
                        onPress: (e, data) => {
                            const v = !(this.properties.toggleToggleState === true);
                            this.properties.toggleToggleState = v;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            this.requestDerpSync();
                        },
                    },
                },
                lineBreak5: {
                    type: UI_TYPES.LINEBREAK,
                    width: "full", height: 1,
                },
                regionMultilineEditor: {
                    dir: "col", width: "full", height: "auto",
                    margin: [mW, mH],
                    spacing: [sW, 0],
                    editorMultiline: {
                        type: UI_TYPES.EDITOR,
                        themeKey: `dialog, ${multilineTextKey}`,
                        canvasShield: true,
                        multiline: true,
                        minHeight: 80,
                        text: 'Welcome to the Derp Skunk Works \u2014 where widgets roam free and layout engines bend to your will. This multiline editor region demonstrates how EDITOR widgets handle paragraph-length content with proper text wrapping, scroll support, and canvas-shielded editing.\n\nSecond paragraph with more text to demonstrate wrapping behavior and vertical expansion. The Skunk Works tests every widget, every layout direction, every theme key in one node.',
                        value: 'Welcome to the Derp Skunk Works \u2014 where widgets roam free and layout engines bend to your will. This multiline editor region demonstrates how EDITOR widgets handle paragraph-length content with proper text wrapping, scroll support, and canvas-shielded editing.\n\nSecond paragraph with more text to demonstrate wrapping behavior and vertical expansion. The Skunk Works tests every widget, every layout direction, every theme key in one node.',
                        mouseOver: false,
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        state: toggleMultilineEditorState ? "DIS" : "OFF",
                    },
                    rowMultilineControls: {
                        dir: "row", width: "full", height: "auto",
                        margin: [0, mH], spacing: [sW, 0],
                        filebrowserMultilineTextKey: {
                            type: UI_TYPES.FILEBROWSER,
                            themeKey: "panel, t_textsystem",
                            canvasShield: true,
                            indicator: true,
                            displayMode: "cutoff",
                            spacing: [sW, 0],
                            padding: [pW, pH],
                            width: 100, height: "auto",
                            mode: "file",
                            items: ["t_textNormal", "t_textSmall", "t_textSystem", "t_textBIG"],
                            value: multilineTextKey,
                            onChange: (val) => {
                                this.properties.multilineEditorTextKey = val;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                        spring: { width: "full", height: 0 },
                        toggleMultilineEditorDIS: {
                            type: UI_TYPES.TOGGLE_V2,
                            themeKey: "button, t_textsystem",
                            text: "Show DIS state",
                            value: this.properties.toggleMultilineEditorState === true,
                            isTextOnly: true,
                            width: "auto", height: "auto",
                            onPress: (e, data) => {
                                const v = !(this.properties.toggleMultilineEditorState === true);
                                this.properties.toggleMultilineEditorState = v;
                                this._layoutMapHash = null;
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            },
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpSkunkSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, sH, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Derp Skunk Works — Widget Testing Ground",
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: {
                        anchor: { target: "mainRow", axis: "y", offset: oY },
                    }
                }
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        /**
         * THE PURE VIRTUAL ENFORCER: Standardizes wireless broadcast and
         * prevents backend validation errors by purging physical slots.
         */
        nodeType.prototype.syncDerpOutputs = function() {
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            }
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            // THE ANTI-PRUNING FIX: Forces the engine to run this node even with 0 outputs.
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;

            // THE OUTPUT FIX: Explicitly remove Fatha's auto-injected virtual output
            this.outputs = [];

            this.titleLabel = "Derp Skunk Works";
            this.properties.titleLabel = "Derp Skunk Works"; // THE TITLE FIX

            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [250, 100];
            this.size = [250, 100];
            ensureSkunkSliderValues(this);
            ensureSkunkSliderBtnLRStates(this);

            this.refreshNodeLayoutMap();
            this.refreshDerpSkunkSysMap();

            setTimeout(() => {
                if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                    this.syncDerpOutputs();
                }
            }, 1);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            ensureSkunkSliderValues(this);
            ensureSkunkSliderBtnLRStates(this);

            // THE PURE VIRTUAL ENFORCER: Purge physical slots immediately on load
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            }

            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSkunkSysMap();
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            this.requestDerpSync();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (this.flags?.collapsed) return;

            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            if (this._lastBypassState !== isBypassed) {
                this._lastBypassState = isBypassed;
                this.refreshNodeLayoutMap();
                this.refreshDerpSkunkSysMap();
                this.requestDerpSync();
            }

            const currentW = Math.round(this.size[0]);
            if (this._lastDerpW !== currentW) {
                this._lastDerpW = currentW;
                this.refreshNodeLayoutMap();
            }

        };
    }
});
