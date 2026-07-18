/**
 * Path: ./js/derps/utils/derpSliderV2Editor.js
 * ROLE: Slider V2 style editor utility surface.
 */
import { app } from "../../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { UI_TYPES } from "../../fatha/core/masterLayoutTypes.js";
import { setSliderV2GlobalRenderPath, setSliderV2ValueFromInteraction } from "../../herbina/widgets/helpers/sliderV2Config.js";
import { buildSliderV2StylePayload, listSliderV2StylePresets, normalizeSliderV2StyleId, prepareSliderV2StyleConfig, resolveSliderV2StyleConfigFromPayload, sanitizeSliderV2StyleFileName, SLIDER_V2_STYLE_FILE_DEFAULT_NAME } from "../../herbina/widgets/helpers/sliderV2Styles.js";
import { normalizeSliderV2RenderPath, normalizeSliderV2Value } from "../../herbina/widgets/helpers/sliderV2Value.js";

const EDITOR_VALUE_MIN = 0;
const EDITOR_VALUE_MAX = 1;
const EDITOR_VALUE_STEP = 0.01;
const EDITOR_VALUE_DEFAULT = 0.5;
const EDITOR_VALUE_DECIMALS = 2;
const STYLE_FILE_CATEGORY = "sliderV2Styles";

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

function clampNumber(value, fallback, min, max) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(max, raw));
}

function normalizeEditorPreviewValue(value) {
    return normalizeSliderV2Value(value, {
        min: EDITOR_VALUE_MIN,
        max: EDITOR_VALUE_MAX,
        step: EDITOR_VALUE_STEP,
        decimals: EDITOR_VALUE_DECIMALS,
        default: EDITOR_VALUE_DEFAULT,
    });
}

function getStyleFileItems(node) {
    const files = Array.isArray(node?._sliderV2StyleFiles) ? node._sliderV2StyleFiles : [];
    if (!files.length) {
        return [{ value: "", label: tLocale("$derp_slider_v2_editor.no_saved_styles", "No saved styles") }];
    }
    return files.map((fileName) => ({ value: fileName, label: fileName }));
}

function ensureEditorProperties(node) {
    const props = node.properties || (node.properties = {});
    props.sliderV2StyleConfig = props.sliderV2StyleConfig && typeof props.sliderV2StyleConfig === "object" ? props.sliderV2StyleConfig : {};
    props.sliderV2StyleConfig.styleId = normalizeSliderV2StyleId(props.sliderV2StyleConfig.styleId);
    props.sliderV2PreviewValue = normalizeEditorPreviewValue(props.sliderV2PreviewValue);
    props.sliderV2PreviewBtnLR = props.sliderV2PreviewBtnLR === true;
    props.sliderV2SelectedStyleFile = sanitizeSliderV2StyleFileName(props.sliderV2SelectedStyleFile, "");
    props.sliderV2StyleName = sanitizeSliderV2StyleFileName(props.sliderV2StyleName || props.sliderV2SelectedStyleFile || props.sliderV2StyleConfig.styleId, SLIDER_V2_STYLE_FILE_DEFAULT_NAME);
    return props;
}

function getEditorStyleConfig(node) {
    ensureEditorProperties(node);
    return prepareSliderV2StyleConfig(node.properties.sliderV2StyleConfig);
}

function syncEditorPreviewSliderValue(node, value) {
    const nextValue = normalizeEditorPreviewValue(value);
    const nextText = nextValue.toFixed(EDITOR_VALUE_DECIMALS);
    const syncRegionValue = (region) => {
        if (!region) return;
        region.value = nextValue;
        region.text = nextText;
        region.label = nextText;
        region.displayText = nextText;
    };

    node.properties.sliderV2PreviewValue = nextValue;
    syncRegionValue(node.layoutMap?.sliderEditorRegion?.previewSlider);
    syncRegionValue(node.layout?.regions?.previewSlider);
    syncRegionValue(node.layout?.computedRegions?.previewSlider);
    syncRegionValue(node._compDataCache?.previewSlider);
    node._derpAwakeFrames = Math.max(Number(node._derpAwakeFrames || 0), 2);
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty?.(true, true);
}

function getEditorPreviewSliderConfig(node) {
    const props = ensureEditorProperties(node);
    const styleConfig = getEditorStyleConfig(node);
    return {
        valueType: "float",
        value: props.sliderV2PreviewValue,
        min: EDITOR_VALUE_MIN,
        max: EDITOR_VALUE_MAX,
        step: EDITOR_VALUE_STEP,
        decimals: EDITOR_VALUE_DECIMALS,
        default: EDITOR_VALUE_DEFAULT,
        btnLR: props.sliderV2PreviewBtnLR,
        styleId: styleConfig.styleId,
        fillbarHeight: styleConfig.fillbarHeight,
        roundKnob: styleConfig.roundKnob,
        knobWidthScale: styleConfig.knobWidthScale,
        knobHeightOffset: styleConfig.knobHeightOffset,
        knobRadiusOffset: styleConfig.knobRadiusOffset,
        onChange: (value) => {
            syncEditorPreviewSliderValue(node, value);
        },
    };
}

function handleEditorPreviewSliderInteraction(node, data, type = "drag") {
    const reg = node.layout?.regions?.previewSlider || node.layout?.computedRegions?.previewSlider;
    if (!reg || !Number.isFinite(reg.w) || reg.w <= 0) return false;
    return setSliderV2ValueFromInteraction(getEditorPreviewSliderConfig(node), reg, data?.localX, type)?.handled === true;
}

function setEditorStyleField(node, field, value) {
    const current = { ...(node.properties.sliderV2StyleConfig || {}) };
    current[field] = value;
    node.properties.sliderV2StyleConfig = current;
    refreshEditor(node);
}

function refreshEditor(node) {
    node._layoutMapHash = null;
    node.refreshNodeLayoutMap?.();
    node.refreshDerpSliderV2EditorSysMap?.();
    node.requestDerpSync?.();
    node.setDirtyCanvas?.(true, true);
}

function getEditorRenderPath() {
    return normalizeSliderV2RenderPath(window.DERP_GLOBAL_SETTINGS?.sliderV2RenderPath);
}

function setEditorRenderPath(node, value) {
    setSliderV2GlobalRenderPath(value, {
        nodes: app.graph?._nodes || [node],
        bastas: window.xcpActiveBastas?.values?.() || [],
        canvas: app.canvas,
    }, window);
    refreshEditor(node);
}

async function refreshSliderV2StyleFileList(node) {
    try {
        const response = await fetch(`/xcp/list/${STYLE_FILE_CATEGORY}?t=${Date.now()}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || response.statusText);
        const seen = new Set();
        node._sliderV2StyleFiles = (Array.isArray(data.items) ? data.items : [])
            .filter((item) => typeof item === "string" && !item.endsWith("/"))
            .map((item) => sanitizeSliderV2StyleFileName(item, ""))
            .filter((item) => {
                if (!item || seen.has(item)) return false;
                seen.add(item);
                return true;
            })
            .sort((a, b) => a.localeCompare(b));
        const props = ensureEditorProperties(node);
        if (props.sliderV2SelectedStyleFile && !node._sliderV2StyleFiles.includes(props.sliderV2SelectedStyleFile)) {
            props.sliderV2SelectedStyleFile = "";
        }
    } catch (error) {
        console.warn("[derpSliderV2Editor] Failed to list Slider V2 style files:", error);
        node._sliderV2StyleFiles = Array.isArray(node._sliderV2StyleFiles) ? node._sliderV2StyleFiles : [];
    }
    refreshEditor(node);
}

async function loadSliderV2StyleFile(node, value) {
    const fileName = sanitizeSliderV2StyleFileName(value, "");
    if (!fileName) return;
    const props = ensureEditorProperties(node);
    props.sliderV2SelectedStyleFile = fileName;
    props.sliderV2StyleName = fileName;
    refreshEditor(node);

    try {
        const response = await fetch(`/xcp/load/${STYLE_FILE_CATEGORY}?name=${encodeURIComponent(fileName)}&t=${Date.now()}`);
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || response.statusText);
        node.properties.sliderV2StyleConfig = resolveSliderV2StyleConfigFromPayload(data.data ?? data);
    } catch (error) {
        console.warn("[derpSliderV2Editor] Failed to load Slider V2 style file:", error);
    }
    refreshEditor(node);
}

async function saveSliderV2StyleFile(node) {
    const props = ensureEditorProperties(node);
    const fileName = sanitizeSliderV2StyleFileName(props.sliderV2StyleName || props.sliderV2SelectedStyleFile, SLIDER_V2_STYLE_FILE_DEFAULT_NAME);
    props.sliderV2StyleName = fileName;
    props.sliderV2SelectedStyleFile = fileName;

    try {
        const response = await fetch(`/xcp/save/${STYLE_FILE_CATEGORY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: fileName, data: buildSliderV2StylePayload(node.properties?.sliderV2StyleConfig, fileName) }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) throw new Error(data.error || response.statusText);
        await refreshSliderV2StyleFileList(node);
    } catch (error) {
        console.warn("[derpSliderV2Editor] Failed to save Slider V2 style file:", error);
        refreshEditor(node);
    }
}

function buildEditorLayoutHash(node, vars) {
    const props = ensureEditorProperties(node);
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const sW = Number(vars.sW || 0).toFixed(2);
    const sH = Number(vars.sH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const style = getEditorStyleConfig(node);
    const styleFileHash = (Array.isArray(node?._sliderV2StyleFiles) ? node._sliderV2StyleFiles : []).join("|");
    return [
        width,
        mW,
        mH,
        sW,
        sH,
        oY,
        // drawHeader branches sliderEditorRegion margins below.
        node?.properties?.drawHeader === true ? 1 : 0,
        getEditorRenderPath(),
        props.sliderV2SelectedStyleFile,
        props.sliderV2StyleName,
        styleFileHash,
        style.styleId,
        Number(style.fillbarHeight ?? 1).toFixed(2),
        style.roundKnob !== false ? 1 : 0,
        Number(style.knobWidthScale ?? 1).toFixed(2),
        Number(style.knobHeightOffset ?? 0).toFixed(2),
        Number(style.knobRadiusOffset ?? 0).toFixed(2),
        props.sliderV2PreviewBtnLR ? 1 : 0,
        normalizeEditorPreviewValue(props.sliderV2PreviewValue).toFixed(EDITOR_VALUE_DECIMALS),
    ].join("_");
}

function editorValueField(node, field, value, fallback, min, max, measureText = "9.99") {
    return {
        type: UI_TYPES.EDITOR,
        canvasShield: true,
        themeKey: "dialog, t_textSystem",
        labelAlign: ["center", "middle"],
        text: String(value),
        measureText,
        width: "auto", height: "auto",
        padding: [4, 2],
        onBlur: (rawValue) => setEditorStyleField(node, field, clampNumber(rawValue, fallback, min, max)),
    };
}

app.registerExtension({
    name: "xcp.derpSliderV2Editor_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpSliderV2Editor") return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);
        fatha(nodeType, nodeData, 300);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            refreshEditor(this);
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            refreshEditor(this);
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildEditorLayoutHash(this, { mW, mH, sW, sH, oY });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            const props = ensureEditorProperties(this);
            const styleConfig = getEditorStyleConfig(this);
            const styleItems = listSliderV2StylePresets().map((preset) => ({ value: preset.id, label: preset.label }));
            const styleFileItems = getStyleFileItems(this);
            const renderPath = getEditorRenderPath();
            const roundKnobEnabled = styleConfig.roundKnob !== false;
            const isKnobStyle = styleConfig.styleId === "knob";
            const previewSliderConfig = getEditorPreviewSliderConfig(this);

            this.layoutMap = {
                sliderEditorRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    margin: this.properties?.drawHeader === true ? [mW, mH, mW, 0] : [mW, 0, mW, 0],
                    spacing: [sW, sH],
                    previewHeader: {
                        type: UI_TYPES.TEXT,
                        mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_slider_v2_editor.preview", "Preview"),
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                    },
                    previewSlider: {
                        type: UI_TYPES.SLIDER_V2,
                        themeKey: "slider, t_textNormal",
                        ...previewSliderConfig,
                        onPress: () => true,
                        onDblClick: (event, reg, data) => handleEditorPreviewSliderInteraction(this, data, "dblclick"),
                        onDragStart: (event, data) => handleEditorPreviewSliderInteraction(this, data, "dragStart"),
                        onDrag: (event, data) => handleEditorPreviewSliderInteraction(this, data, "drag"),
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                    },
                    styleFileRow: {
                        dir: "row", width: "full", height: "auto",
                        spacing: [0, sH],
                        dropdownStyleFile: {
                            type: UI_TYPES.FILEBROWSER,
                            themeKey: "panel, t_textSystem",
                            canvasShield: true,
                            indicator: true,
                            displayMode: "cutoff",
                            width: "full", height: "auto",
                            minWidth: 100,
                            padding: [pW, pH],
                            mode: "file",
                            items: styleFileItems,
                            value: props.sliderV2SelectedStyleFile,
                            toolTip: tLocale("$derp_slider_v2_editor.load_style", "Load style"),
                            onChange: (value) => loadSliderV2StyleFile(this, value),
                            spacing: [sW, 0],
                        },
                        editorStyleName: {
                            type: UI_TYPES.EDITOR,
                            canvasShield: true,
                            themeKey: "dialog, t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: props.sliderV2StyleName,
                            measureText: "slider-v2-style-000",
                            width: "auto", height: "auto",
                            padding: [pW, pH],
                            toolTip: tLocale("$derp_slider_v2_editor.style_name", "Style name"),
                            spacing: [sW, 0],
                            onBlur: (rawValue) => {
                                this.properties.sliderV2StyleName = sanitizeSliderV2StyleFileName(rawValue, SLIDER_V2_STYLE_FILE_DEFAULT_NAME);
                                refreshEditor(this);
                            },
                        },
                        btnRefreshStyleFiles: {
                            type: UI_TYPES.ICONBUTTON,
                            icon: "refresh",
                            themeKey: "button, t_textSystem",
                            width: "match", height: "fill",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            mouseOver: true,
                            toolTip: tLocale("$derp_slider_v2_editor.refresh_styles", "Refresh styles"),
                            onPress: () => refreshSliderV2StyleFileList(this),
                        },
                        btnSaveStyleFile: {
                            type: UI_TYPES.ICONBUTTON,
                            icon: "save",
                            themeKey: "button, t_textSystem",
                            width: "match", height: "fill",
                            objectAlign: ["left", "middle"],
                            spacing: [sW, 0],
                            mouseOver: true,
                            toolTip: tLocale("$derp_slider_v2_editor.save_style", "Save style"),
                            onPress: () => saveSliderV2StyleFile(this),
                        },
                    },
                    controlsRow: {
                        dir: "row", width: "full", height: "auto",
                        spacing: [0, sH],
                        dropdownStyle: {
                            type: UI_TYPES.FILEBROWSER,
                            themeKey: "panel, t_textSystem",
                            canvasShield: true,
                            indicator: true,
                            displayMode: "cutoff",
                            width: "full", height: "auto",
                            minWidth: 80,
                            padding: [pW, pH],
                            mode: "file",
                            items: styleItems,
                            value: styleConfig.styleId,
                            onChange: (value) => setEditorStyleField(this, "styleId", normalizeSliderV2StyleId(value)),
                            spacing: [sW, 0],
                        },
                        dropdownRenderPath: {
                            type: UI_TYPES.FILEBROWSER,
                            themeKey: "panel, t_textSystem",
                            canvasShield: true,
                            indicator: true,
                            displayMode: "cutoff",
                            width: "full", height: "auto",
                            minWidth: 80,
                            padding: [pW, pH],
                            mode: "file",
                            items: [
                                { value: "canvas", label: "Canvas" },
                                { value: "html", label: "HTML" },
                            ],
                            value: renderPath,
                            onChange: (value) => setEditorRenderPath(this, value),
                            spacing: [sW, 0],
                        },
                    },
                    togglesRow: {
                        dir: "row", width: "full", height: "auto",
                        spacing: [0, sH],
                        toggleBtnLR: {
                            type: UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem",
                            isTextOnly: true,
                            label: tLocale("$derp_slider_v2_editor.btn_lr", "btnLR"),
                            value: props.sliderV2PreviewBtnLR,
                            width: "auto", height: "auto",
                            padding: [pW, pH],
                            spacing: [sW, 0],
                            onPress: () => {
                                this.properties.sliderV2PreviewBtnLR = !props.sliderV2PreviewBtnLR;
                                refreshEditor(this);
                            },
                        },
                        toggleRoundKnob: {
                            type: UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem",
                            isTextOnly: true,
                            hidden: !isKnobStyle,
                            label: tLocale("$derp_slider_v2_editor.round_knob", "Round knob"),
                            value: roundKnobEnabled,
                            width: "auto", height: "auto",
                            padding: [pW, pH],
                            spacing: [sW, 0],
                            onPress: () => setEditorStyleField(this, "roundKnob", !roundKnobEnabled),
                        },
                        spring: { width: "full", height: 0 },
                    },
                    styleValuesRow: {
                        dir: "row", width: "full", height: "auto",
                        spacing: [0, sH],
                        lblFillHeight: {
                            type: UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider_v2_editor.fill_height", "Fill"),
                            width: "auto", spacing: [sW, 0],
                        },
                        editorFillbarHeight: {
                            ...editorValueField(this, "fillbarHeight", styleConfig.fillbarHeight ?? 1, 1, 0.2, 1.0),
                            spacing: [sW, 0],
                        },
                        lblKnobWidth: {
                            type: UI_TYPES.TEXT, mouseOver: false,
                            hidden: !isKnobStyle || roundKnobEnabled,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider_v2_editor.knob_width", "Knob W"),
                            width: "auto", spacing: [sW, 0],
                        },
                        editorKnobWidthScale: {
                            ...editorValueField(this, "knobWidthScale", styleConfig.knobWidthScale ?? 1, 1, 0.2, 2.0),
                            hidden: !isKnobStyle || roundKnobEnabled,
                            spacing: [sW, 0],
                        },
                        lblKnobHeight: {
                            type: UI_TYPES.TEXT, mouseOver: false,
                            hidden: !isKnobStyle || roundKnobEnabled,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider_v2_editor.knob_height", "Knob H"),
                            width: "auto", spacing: [sW, 0],
                        },
                        editorKnobHeightOffset: {
                            ...editorValueField(this, "knobHeightOffset", styleConfig.knobHeightOffset ?? 0, 0, -5, 5),
                            hidden: !isKnobStyle || roundKnobEnabled,
                            spacing: [sW, 0],
                        },
                        lblKnobRadius: {
                            type: UI_TYPES.TEXT, mouseOver: false,
                            hidden: !isKnobStyle || !roundKnobEnabled,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_slider_v2_editor.knob_radius", "Knob R"),
                            width: "auto", spacing: [sW, 0],
                        },
                        editorKnobRadiusOffset: {
                            ...editorValueField(this, "knobRadiusOffset", styleConfig.knobRadiusOffset ?? 0, 0, -3, 3),
                            hidden: !isKnobStyle || !roundKnobEnabled,
                            spacing: [sW, 0],
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpSliderV2EditorSysMap = function() {
            const { mW, mH, sH, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, sH, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto",
                    lblTitle: {
                        type: UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_slider_v2_editor.system.properties", "Slider V2 editor properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: {
                        anchor: { target: "mainRow", axis: "y", offset: oY },
                    }
                }
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.syncDerpOutputs = function() {
            this.outputs = [];
        };

        const baseHandleInteraction = nodeType.prototype.handleShieldInteraction;
        nodeType.prototype.handleShieldInteraction = function(type, data) {
            const previewReg = this.layout?.regions?.previewSlider;
            const canHandlePreview = !!(previewReg && previewReg.state !== "DIS" && this.layout);
            const localMouse = [data?.localX, data?.localY];
            const isPreviewHit = canHandlePreview
                && Number.isFinite(localMouse[0])
                && Number.isFinite(localMouse[1])
                && this.layout.hitTest(localMouse, previewReg);
            const isPointerStart = type === "dragStart" || type === "click" || type === "dblclick";
            const isActiveDrag = this._sliderV2EditorPreviewActive === true && (type === "drag" || type === "hover" || type === "move");

            if (type === "dragEnd") {
                if (this._sliderV2EditorPreviewActive) {
                    handleEditorPreviewSliderInteraction(this, data, "drag");
                }
                this._sliderV2EditorPreviewActive = false;
                this._pressedRegionIsDragHandle = false;
                this._pressedRegionKey = null;
                this._pressedRegionType = null;
            }

            if (canHandlePreview && isPointerStart && isPreviewHit) {
                this._sliderV2EditorPreviewActive = true;
                this._pressedRegionKey = "previewSlider";
                this._pressedRegionType = UI_TYPES.SLIDER_V2;
                this._pressedRegionIsDragHandle = true;
                const handled = handleEditorPreviewSliderInteraction(this, data, type);
                if (handled) return true;
            }

            if (canHandlePreview && (type === "drag") && this._sliderV2EditorPreviewActive) {
                handleEditorPreviewSliderInteraction(this, data, "drag");
                return true;
            }

            if (isActiveDrag) return true;

            if (baseHandleInteraction) return baseHandleInteraction.apply(this, arguments);
            return false;
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];
            this.titleLabel = tLocale("$derp_slider_v2_editor.title", "Derp Slider V2 Editor");
            this.properties.titleLabel = this.titleLabel;
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [360, 210];
            this.size = [360, 210];
            ensureEditorProperties(this);
            this.refreshNodeLayoutMap();
            this.refreshDerpSliderV2EditorSysMap();
            refreshSliderV2StyleFileList(this);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];
            ensureEditorProperties(this);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSliderV2EditorSysMap();
            this.requestDerpSync();
            refreshSliderV2StyleFileList(this);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;
            const currentW = Math.round(this.size[0]);
            const currentH = Math.round(this.size[1]);
            if (this._lastDerpW !== currentW || this._lastDerpH !== currentH) {
                this._lastDerpW = currentW;
                this._lastDerpH = currentH;
                this.refreshNodeLayoutMap();
            }
        };
    }
});
