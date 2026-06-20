/**
 * PROJECT: derpNodes | NODE: derpSeedV3
 * STATUS: Fatha vertical seed controller
 */
import { app } from "../../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { UI_TYPES } from "../../fatha/core/masterLayoutTypes.js";
import {
    SEED_V3_MODES,
    broadcastSeedV3Signal,
    ensureSeedV3History,
    finalizeSeedV3UI,
    getSeedV3ActiveSeed,
    getSeedV3DigitCount,
    getSeedV3HistoryLimit,
    getSeedV3VisibleHistory,
    handleSeedV3Blur,
    handleSeedV3DigitBlur,
    handleSeedV3Execute,
    handleSeedV3HistoryCountBlur,
    handleSeedV3HistoryPress,
    handleSeedV3Input,
    handleSeedV3ModePress,
    handleSeedV3Stop,
    syncSeedV3LayoutValues,
    syncSeedV3LocaleLabels,
    tLocale,
} from "./core/derpSeedV3_core.js";

const SEED_V3_HEIGHT_MODE_ITEMS = ["Auto", "1", "2", "3", "4", "5"];

function hideNativeSeedV3Widgets(node) {
    if (!Array.isArray(node?.widgets)) return;
    const signature = node.widgets.map((widget) => `${widget.name}:${widget.hidden ? 1 : 0}:${widget.value}`).join("|");
    if (node._seedV3NativeWidgetsHiddenSignature === signature) return;
    node.widgets.forEach((widget) => {
        widget.hidden = true;
        widget.last_y = -5000;
        if (widget.element?.style) widget.element.style.display = "none";
        if (widget.name === "control_after_generate") widget.value = "fixed";
    });
    node._seedV3NativeWidgetsHiddenSignature = node.widgets.map((widget) => `${widget.name}:${widget.hidden ? 1 : 0}:${widget.value}`).join("|");
}

function getSeedV3ModeLabel(mode) {
    const normalized = SEED_V3_MODES.includes(mode) ? mode : "Random";
    return tLocale(`$derp_seed_v3.modes.${normalized.toLowerCase()}`, normalized);
}

function buildSeedV3LayoutHash(node, vars, history) {
    return [
        Math.round(node.size?.[0] || 0),
        node._comfyIsBusy ? 1 : 0,
        node.properties?.seedMode || "Random",
        node.properties?.toggleColorKey !== false ? 1 : 0,
        getSeedV3DigitCount(node),
        getSeedV3HistoryLimit(node),
        getSeedV3VisibleHistory(node),
        history.join("|"),
        Number(vars.mW || 0).toFixed(2),
        Number(vars.mH || 0).toFixed(2),
        Number(vars.oY || 0).toFixed(2),
        window._xcpDerpSession,
    ].join("_");
}

function getSeedV3HistoryClipHeight(node, rowHeight, spacingY) {
    const visible = getSeedV3VisibleHistory(node);
    const count = visible === "Auto" ? Math.min(3, getSeedV3HistoryLimit(node)) : visible;
    return Math.max(rowHeight, (rowHeight * count) + (spacingY * Math.max(0, count - 1)));
}

function getSeedV3HeightModeItems() {
    return SEED_V3_HEIGHT_MODE_ITEMS.map((value) => ({
        value,
        display: value === "Auto" ? "Fit Node" : `${value} History ${value === "1" ? "Entry" : "Entries"}`,
    }));
}

function normalizeSeedV3HeightMode(value) {
    const raw = String(value ?? "Auto");
    return SEED_V3_HEIGHT_MODE_ITEMS.includes(raw) ? raw : "Auto";
}

function syncSeedV3HeightMode(node) {
    const mode = normalizeSeedV3HeightMode(getSeedV3VisibleHistory(node));
    node.properties.historyVisibleBeforeClip = mode;
    node.properties.autoHeight = mode !== "Auto";
    return mode;
}

function getRegionBottom(reg) {
    if (!reg) return 0;
    const marginB = Array.isArray(reg.margin) ? (reg.margin.length === 4 ? reg.margin[3] : (reg.margin[1] || 0)) : 0;
    return (Number(reg.y) || 0) + (Number(reg.h) || 0) + marginB;
}

function getSeedV3FitNodeClipHeight(node, region, regions, rowHeight) {
    const nodeH = Number(node?.size?.[1] || node?.properties?.nodeSize?.[1] || 0);
    const regionY = Number(region?.y) || 0;
    if (nodeH <= 0 || regionY <= 0) return rowHeight;

    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : null;
    const viewportGap = Math.max(0, Number(vars?.mH || 0));
    const footer = regions.footerRegion || regions.systemBtn;
    const footerH = footer ? Math.max(0, getRegionBottom(footer) - (Number(footer.y) || 0)) : 0;
    const available = nodeH - regionY - viewportGap - footerH;
    return Number.isFinite(available) && available > rowHeight ? available : rowHeight;
}

function resolveSeedV3HistoryClipHeight(node, region, regions = {}) {
    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : {};
    const rowHeight = Math.max(18, ((Number(vars.pH) || 0) * 2) + 16);
    if (getSeedV3VisibleHistory(node) === "Auto") return getSeedV3FitNodeClipHeight(node, region, regions, rowHeight);
    return getSeedV3HistoryClipHeight(node, rowHeight, Number(vars.sH) || 0);
}

function defaultSeedV3Properties(node) {
    if (!node.properties) node.properties = {};
    if (!node.properties.titleLabel) node.properties.titleLabel = tLocale("$derp_seed_v3.title", "Derp Seed V3");
    if (!node.properties.seedMode) node.properties.seedMode = "Random";
    if (!node.properties.seedHistoryLimit) node.properties.seedHistoryLimit = 5;
    if (!node.properties.seedDigits) node.properties.seedDigits = 8;
    if (!node.properties.favoriteNum) node.properties.favoriteNum = 8;
    if (!node.properties.historyVisibleBeforeClip) node.properties.historyVisibleBeforeClip = "Auto";
    if (node.properties.toggleColorKey === undefined) node.properties.toggleColorKey = true;
    node.properties.isWirelessTransmitter = true;
    node.properties.skipGenericWirelessHeartbeat = true;
    node.properties.isPureVirtual = true;
    node.properties.autoWidth = false;
    syncSeedV3HeightMode(node);
}

app.registerExtension({
    name: "xcp.derpSeedV3_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpSeedV3") return;

        fatha(nodeType, nodeData, 100);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            syncSeedV3LocaleLabels(this);
            this._layoutMapHash = null;
            this._seedV3SysLayoutHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSeedV3SysMap();
            this.updateDerpSeedV3UI(this._comfyIsBusy);
            this.requestDerpSync();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            syncSeedV3LocaleLabels(this);
            this._layoutMapHash = null;
            this._seedV3SysLayoutHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSeedV3SysMap();
            this.requestDerpSync();
        };

        nodeType.prototype.updateDerpSeedV3UI = function(isBusy = false) {
            const nextBusy = !!isBusy;
            const wasBusy = this._comfyIsBusy;
            this._comfyIsBusy = nextBusy;
            const controls = this.layoutMap?.topControlsRegion;
            if (controls?.btnExecute) controls.btnExecute.state = nextBusy ? "DIS" : "OFF";
            if (controls?.btnStop) controls.btnStop.state = nextBusy ? "OFF" : "DIS";
            if (controls?.btnSeedMode) controls.btnSeedMode.state = nextBusy ? "DIS" : "OFF";
            if (wasBusy !== nextBusy || controls) this.requestDerpSync?.();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size?.[0] <= 0) return;
            hideNativeSeedV3Widgets(this);
            defaultSeedV3Properties(this);
            syncSeedV3LocaleLabels(this);
            const { mW, mH, sW, sH, oY, pW, pH } = this.getDerpVars(this);
            const history = ensureSeedV3History(this);
            const digits = getSeedV3DigitCount(this);
            const measurementStr = "9".repeat(digits);
            const rowMeasure = Math.max(18, (pH * 2) + 16);
            const useColorKeys = this.properties.toggleColorKey !== false;
            const structureHash = buildSeedV3LayoutHash(this, { mW, mH, oY }, history);

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                syncSeedV3LayoutValues(this);
                this.requestDerpSync();
                return;
            }
            this._layoutMapHash = structureHash;

            const historyRows = {};
            history.forEach((seed, index) => {
                const isPlaceholder = typeof seed === "string" && seed.includes("-");
                historyRows[`historySeed_${index}`] = {
                    type: UI_TYPES.BUTTON,
                    themeKey: "button, t_textSmall",
                    state: index === 0 ? "ON" : "OFF",
                    text: String(seed),
                    measureText: measurementStr,
                    width: "full",
                    height: "auto",
                    spacing: [0, sH],
                    padding: [pW, pH],
                    labelAlign: ["center", "middle"],
                    noHover: isPlaceholder,
                    mouseOver: !isPlaceholder,
                    onPress: () => { if (!isPlaceholder) handleSeedV3HistoryPress(this, seed); },
                };
            });

            this.layoutMap = {
                topControlsRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "row",
                    width: "full",
                    height: "auto",
                    margin: this.properties?.drawHeader === true ? [mW, mH, mW, 0] : [mW, 0, mW, 0],
                    spacing: [sW, 0],
                    btnSeedMode: {
                        type: UI_TYPES.BUTTON,
                        themeKey: "button, t_textSystem",
                        state: this._comfyIsBusy ? "DIS" : "OFF",
                        text: getSeedV3ModeLabel(this.properties.seedMode),
                        measureText: "Increment",
                        width: "auto",
                        height: rowMeasure,
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        labelAlign: ["center", "middle"],
                        onPress: () => handleSeedV3ModePress(this),
                    },
                    btnStop: {
                        type: UI_TYPES.ICONBUTTON,
                        themeKey: "button, t_textNormal",
                        ...(useColorKeys ? { iconColorKey: "t_text_error" } : {}),
                        state: this._comfyIsBusy ? "OFF" : "DIS",
                        icon: "stop",
                        width: "match:1",
                        height: rowMeasure,
                        padding: [pW, pH],
                        spacing: [sW, 0],
                        onPress: () => handleSeedV3Stop(this),
                    },
                    btnExecute: {
                        type: UI_TYPES.ICONBUTTON,
                        themeKey: "button, t_textNormal",
                        ...(useColorKeys ? { iconColorKey: "t_text_accent" } : {}),
                        state: this._comfyIsBusy ? "DIS" : "OFF",
                        icon: "play",
                        width: "full",
                        height: rowMeasure,
                        padding: [pW, pH],
                        onPress: () => handleSeedV3Execute(this),
                    },
                },
                manualSeedRegion: {
                    anchor: { target: "topControlsRegion", axis: "y", offset: oY },
                    dir: "row",
                    width: "full",
                    height: "auto",
                    margin: [mW, mH, mW, 0],
                    spacing: [sW, 0],
                    seedLabel: {
                        type: UI_TYPES.TEXT,
                        themeKey: "t_textSmall",
                        text: tLocale("$derp_seed_v3.labels.seed", "Seed"),
                        width: "auto",
                        height: "auto",
                        padding: [pW, pH],
                        mouseOver: false,
                        labelAlign: ["left", "middle"],
                    },
                    seedEditor: {
                        type: UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textSmall",
                        canvasShield: true,
                        numberOnly: true,
                        text: String(getSeedV3ActiveSeed(this)),
                        value: String(getSeedV3ActiveSeed(this)),
                        measureText: measurementStr,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        labelAlign: ["center", "middle"],
                        onInput: (val) => handleSeedV3Input(this, val),
                        onBlur: (val) => handleSeedV3Blur(this, val),
                    },
                },
                historyRegion: {
                    anchor: { target: "manualSeedRegion", axis: "y", offset: oY },
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, mH, mW, mH],
                    spacing: [0, sH],
                    scrollViewport: true,
                    clipHeight: resolveSeedV3HistoryClipHeight,
                    minClipHeight: rowMeasure,
                    ...historyRows,
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.getDerpHeightModeConfig = function() {
            return {
                items: getSeedV3HeightModeItems(),
                value: syncSeedV3HeightMode(this),
                rootName: "height-mode",
                onChange: (v) => {
                    this.properties.historyVisibleBeforeClip = normalizeSeedV3HeightMode(v);
                    syncSeedV3HeightMode(this);
                    this._layoutMapHash = null;
                    this._seedV3SysLayoutHash = null;
                    this.refreshNodeLayoutMap();
                    if (this.refreshDerpSeedV3SysMap) this.refreshDerpSeedV3SysMap();
                    if (this.requestDerpSync) this.requestDerpSync();
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (app.graph && typeof app.graph.change === "function") app.graph.change();
                },
            };
        };

        nodeType.prototype.refreshDerpSeedV3SysMap = function() {
            syncSeedV3HeightMode(this);
            const { mW, mH, sW, oY, pW, pH } = this.getDerpVars(this);
            const sysHash = [
                getSeedV3HistoryLimit(this),
                getSeedV3DigitCount(this),
                getSeedV3VisibleHistory(this),
                this.properties?.toggleColorKey !== false ? 1 : 0,
                Number(mW || 0).toFixed(2),
                Number(mH || 0).toFixed(2),
                Number(sW || 0).toFixed(2),
                Number(oY || 0).toFixed(2),
                Number(pW || 0).toFixed(2),
                Number(pH || 0).toFixed(2),
                window._xcpDerpSession,
            ].join("_");
            if (this._seedV3SysLayoutHash === sysHash && this.sysLayoutMap) {
                if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
                return;
            }
            this._seedV3SysLayoutHash = sysHash;

            this.sysLayoutMap = {
                sysContentRegion: {
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, 0, mW, mH],
                    lblTitle: {
                        type: UI_TYPES.TEXT,
                        themeKey: "t_textsystem",
                        text: tLocale("$derp_seed_v3.system.properties", "Derp Seed V3 properties:"),
                        width: "full",
                        padding: [pW, pH],
                        mouseOver: false,
                        labelAlign: ["left", "middle"],
                    },
                    settingsRow: {
                        anchor: { target: "lblTitle", axis: "y", offset: oY },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        historyLabel: {
                            type: UI_TYPES.TEXT,
                            themeKey: "t_textsystem",
                            text: tLocale("$derp_seed_v3.system.history_logs", "History logs:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            mouseOver: false,
                        },
                        historyCount: {
                            type: UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textsystem",
                            canvasShield: true,
                            numberOnly: true,
                            measureText: "99",
                            text: String(getSeedV3HistoryLimit(this)),
                            value: String(getSeedV3HistoryLimit(this)),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onBlur: (val) => handleSeedV3HistoryCountBlur(this, val),
                        },
                        digitLabel: {
                            type: UI_TYPES.TEXT,
                            themeKey: "t_textsystem",
                            text: tLocale("$derp_seed_v3.system.decimals", "Decimals:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            mouseOver: false,
                        },
                        digitValue: {
                            type: UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textsystem",
                            canvasShield: true,
                            numberOnly: true,
                            measureText: "99",
                            text: String(getSeedV3DigitCount(this)),
                            value: String(getSeedV3DigitCount(this)),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onBlur: (val) => handleSeedV3DigitBlur(this, val),
                        },
                    },
                    clipRow: {
                        anchor: { target: "settingsRow", axis: "y", offset: oY },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        toggleColorKey: {
                            type: UI_TYPES.TOGGLE_V2,
                            isTextOnly: true,
                            themeKey: "dialog, button, t_textSystem",
                            text: tLocale("$derp_seed_v3.system.color_overlay", "Color overlay"),
                            width: "full",
                            height: "auto",
                            padding: [pW, pH],
                            value: this.properties.toggleColorKey !== false,
                            onChange: (value) => {
                                if (this.properties.toggleColorKey === value) return;
                                this.properties.toggleColorKey = value;
                                this._layoutMapHash = null;
                                this._seedV3SysLayoutHash = null;
                                this.refreshNodeLayoutMap();
                                this.refreshDerpSeedV3SysMap();
                            },
                        },
                    },
                },
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.broadcastWirelessSignal = function() {
            broadcastSeedV3Signal(this);
        };

        nodeType.prototype.syncDerpOutputs = function() {
            broadcastSeedV3Signal(this);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this._ignoreHeaderWidthFloor = true;
            this.isPureVirtual = true;
            defaultSeedV3Properties(this);
            this.titleLabel = tLocale("$derp_seed_v3.title", "Derp Seed V3");
            this.properties.titleLabel = this.titleLabel;
            this.properties.minWidth = 100;
            this.properties.nodeSize = [100, 100];
            this.size = [100, 100];
            this._isExecuting = false;
            this._comfyIsBusy = false;
            hideNativeSeedV3Widgets(this);
            ensureSeedV3History(this);
            this.attachDerpSeedV3ExecutionListeners?.();
            this.refreshNodeLayoutMap();
            this.refreshDerpSeedV3SysMap();
            setTimeout(() => this.syncDerpOutputs?.(), 1);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this._ignoreHeaderWidthFloor = true;
            this.isPureVirtual = true;
            defaultSeedV3Properties(this);
            hideNativeSeedV3Widgets(this);
            ensureSeedV3History(this);
            syncSeedV3LocaleLabels(this);
            this.attachDerpSeedV3ExecutionListeners?.();
            this._layoutMapHash = null;
            this._seedV3SysLayoutHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpSeedV3SysMap();
            this.syncDerpOutputs?.();
            this.requestDerpSync();
        };

        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(info) {
            if (onSerialize) onSerialize.apply(this, arguments);
            hideNativeSeedV3Widgets(this);
            ensureSeedV3History(this);
        };

        nodeType.prototype.finalizeSeedV3UI = function() {
            finalizeSeedV3UI(this);
        };

        nodeType.prototype.attachDerpSeedV3ExecutionListeners = function() {
            if (this._seedV3ExecutionListenersAttached || !app?.api?.addEventListener) return;
            this._seedV3ExecutionListenersAttached = true;

            app.api.addEventListener("executing", (e) => {
                const runningNode = e.detail?.node || (typeof e.detail === "string" ? e.detail : null);
                this.updateDerpSeedV3UI(runningNode !== null && runningNode !== undefined);

                if (runningNode === String(this.id)) {
                    this._isExecuting = true;
                    if (!this._currentPromptId) this._currentPromptId = e.detail?.prompt_id;
                }
            });

            app.api.addEventListener("execution_success", (e) => {
                if (this._isExecuting && (String(e.detail?.prompt_id) === String(this._currentPromptId) || !this._currentPromptId)) {
                    this.finalizeSeedV3UI();
                } else if (!e.detail?.node) {
                    this.updateDerpSeedV3UI(false);
                }
            });

            app.api.addEventListener("execution_error", (e) => {
                if (this._isExecuting && String(e.detail?.prompt_id) === String(this._currentPromptId)) this.finalizeSeedV3UI();
            });

            app.api.addEventListener("execution_interrupted", () => this.finalizeSeedV3UI());
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;
            const isBusy = !!app?.extensionManager?.queue?.remaining || !!this._localExecutionTriggered;
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            const width = Math.round(this.size?.[0] || 0);
            const stateHash = `${isBusy}_${isBypassed}_${width}`;
            if (this._lastSeedV3DrawStateHash !== stateHash) {
                const previousHash = this._lastSeedV3DrawStateHash || "";
                const previousWidth = previousHash.split("_")[2];
                this._lastSeedV3DrawStateHash = stateHash;
                if (!isBusy && this._localExecutionTriggered) this.finalizeSeedV3UI();
                this.updateDerpSeedV3UI(isBusy);
                broadcastSeedV3Signal(this);
                if (previousWidth !== String(width)) {
                    this._layoutMapHash = null;
                    this.refreshNodeLayoutMap();
                } else {
                    syncSeedV3LayoutValues(this);
                }
            }
        };
    },
});
