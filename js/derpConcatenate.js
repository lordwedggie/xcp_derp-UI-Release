/**
 * Path: ./js/derpConcatenate.js
 * STATUS: VIRTUAL FATHA COMPLIANT - STRING signal display node
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "./fatha/fatha.js";

const concatMeasureCanvas = document.createElement("canvas");
const concatMeasureCtx = concatMeasureCanvas.getContext("2d");

function buildConcatMeasureFont(fontSize, fontFamily, fontWeight = "normal") {
    let style = "normal";
    let weight = "normal";
    if (fontWeight === "italic") style = "italic";
    else if (fontWeight === "bold") weight = "bold";
    else if (fontWeight === "both") {
        style = "italic";
        weight = "bold";
    }

    const baseFont = fontFamily || "arial";
    const cleanFont = baseFont.replace(/\bpx\b/gi, "").trim();
    const safeFont = (cleanFont.includes(",") || cleanFont.includes('"') || cleanFont.includes("'"))
        ? cleanFont
        : `"${cleanFont}"`;
    return `${style} ${weight} ${fontSize}px ${safeFont}`;
}

function measureConcatPreviewHeight(text, maxWidth, fontSize, fontFamily, fontWeight, paddingY) {
    const safeFontSize = Math.max(1, Number(fontSize) || 12);
    const innerWidth = Math.max(1, Number(maxWidth) || 1);
    const lines = String(text || "").split(/\r?\n/);
    concatMeasureCtx.font = buildConcatMeasureFont(safeFontSize, fontFamily, fontWeight);

    let totalLines = 0;
    for (const rawLine of lines) {
        const words = String(rawLine || "").split(" ");
        let currentLine = "";
        let wrappedLineCount = 1;

        for (let i = 0; i < words.length; i++) {
            const testLine = `${currentLine}${words[i]} `;
            if (concatMeasureCtx.measureText(testLine).width > innerWidth && i > 0) {
                wrappedLineCount += 1;
                currentLine = `${words[i]} `;
            } else {
                currentLine = testLine;
            }
        }

        totalLines += Math.max(1, wrappedLineCount);
    }

    return (totalLines * safeFontSize) + (Math.max(0, Number(paddingY) || 0) * 2);
}

function normalizeConcatSignalValue(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch (_) {
        return String(value);
    }
}

function getConcatSignalItems() {
    return Object.values(window.xcpDerpSignals || {})
        .filter((sig) => sig && sig.nodeId && String(sig.type || "").toUpperCase().includes("STRING"))
        .map((sig) => `${sig.nodeName || sig.nodeId} [${sig.nodeId}]`);
}

function getConcatSignalIdFromLabel(label) {
    const value = String(label || "");
    const match = value.match(/\[([\d:]+)\]/);
    if (match) return match[1];

    const signals = window.xcpDerpSignals || {};
    const found = Object.values(signals).find((sig) => {
        if (!sig || !sig.nodeId) return false;
        return value === String(sig.nodeName || sig.nodeId || "") || value === String(sig.nodeId);
    });
    return found ? String(found.nodeId) : null;
}

function resolveConcatSignalId(rawId) {
    if (!rawId && rawId !== 0) return null;
    const signals = window.xcpDerpSignals || {};
    const directId = String(rawId);
    if (signals[directId]) return directId;
    const baseId = directId.split(":")[0];
    if (signals[baseId]) return baseId;
    const indexed = Object.values(signals).find((sig) => String(sig?.nodeId || "").startsWith(`${baseId}:`));
    return indexed ? String(indexed.nodeId) : null;
}

function getConcatSignalState(node) {
    const ids = node?.properties?.multiSignalIds || {};
    const activeSignalId = resolveConcatSignalId(ids[0] || ids["0"] || null);
    const signal = activeSignalId ? window.xcpDerpSignals?.[activeSignalId] : null;
    const value = signal ? normalizeConcatSignalValue(signal.value) : "";
    return {
        activeSignalId: activeSignalId || "",
        label: signal?.nodeName || activeSignalId || "",
        value,
        preview: value,
        hasSignal: !!signal,
    };
}

function buildConcatLayoutHash(node, vars, signalState) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const signalItems = getConcatSignalItems();
    return [
        window._xcpDerpSession || "",
        node?.titleLabel || "",
        width,
        signalState.activeSignalId,
        signalState.preview,
        signalItems.join("\u0001"),
        mW,
        mH,
        oY,
        node?.properties?.drawHeader !== false,
    ].join("|");
}

function suppressConcatNativeWidgets(node) {
    if (!node?.widgets) return;
    node.widgets.forEach((widget) => {
        widget.last_y = -5000;
        widget.hidden = true;
        if (widget.element?.style) {
            widget.element.style.display = "none";
            widget.element.style.pointerEvents = "none";
        }
    });
}

app.registerExtension({
    name: "xcp.derpConcatenate_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("derpconcatenate")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 120);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            suppressConcatNativeWidgets(this);
            this.refreshNodeLayoutMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            suppressConcatNativeWidgets(this);
            this.refreshNodeLayoutMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            suppressConcatNativeWidgets(this);
            const vars = this.getDerpVars(this);
            const { mW, mH, sH, oY, pW, pH, t_textNormal_size } = vars;
            const signalState = getConcatSignalState(this);
            const signalItems = getConcatSignalItems();
            const previewFontSize = Number(t_textNormal_size || this._t_textNormalPaintData?.fontSize || 12);
            const previewFont = this._t_textNormalPaintData?.font || "arial";
            const previewFontWeight = this._t_textNormalPaintData?.fontWeight || "normal";
            const previewInnerWidth = Math.max(1, Number(this.size?.[0] || 0) - (mW * 2) - (pW * 2));
            const previewHeight = signalState.hasSignal
                ? measureConcatPreviewHeight(signalState.preview, previewInnerWidth, previewFontSize, previewFont, previewFontWeight, pH)
                : 0;
            const selectedSignalLabel = this.properties?.multiSignalLabels?.[0]
                || (signalState.hasSignal ? `${signalState.label} [${signalState.activeSignalId}]` : "Select STRING signal...");
            const structureHash = buildConcatLayoutHash(this, vars, signalState);

            this._concatActiveSignalId = signalState.activeSignalId;
            this._concatSignalPreview = signalState.preview;
            if (this.properties) this.properties.textValue = signalState.value;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    lblStatus: {
                        hidden: signalState.hasSignal,
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        text: "Select a STRING signal.",
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        displayMode: "cutoff",
                        pulseStates: true,
                    },
                    regionSignalEntry: {
                        anchor: { target: "lblStatus", axis: "y"},
                        type: this.UI_TYPES.REGION,                        
                        //corners: [0, 0, null, null],
                        dir: "col",
                        width: "full", height: "auto",
                        regionSignalHeader: {
                            dir: "row",
                            width: "full", height: "auto",
                            btnHeaderLabel: {
                                hidden: !signalState.hasSignal,
                                type: this.UI_TYPES.TEXT, 
                                themeKey: "t_textNormal",
                                text: signalState.label || "Signal",
                                width: "full", height: "auto",
                                padding: [pW, pH],
                                mouseOver: false,
                            },
                        },
                        regionSignalContent: {
                            
                            themeKey: "region",
                            dir: "col",
                            width: "full", height: "auto",
                            textSignal: {
                                hidden: !signalState.hasSignal,
                                type: this.UI_TYPES.TEXT,
                                themeKey: "t_textSmall",
                                text: signalState.preview || " ",
                                width: "full", height: previewHeight,
                                padding: [pW, pH],
                                labelAlign: ["left", "top"],
                                wrap: true,
                            },
                        },
                    },
                    dropdownSignal: {
                        anchor: { target: "regionSignalEntry", axis: "y", offset: sH },
                        type: this.UI_TYPES.FILEBROWSER,
                        icon: "signal",
                        themeKey: "dialog, t_textNormal",
                        fontSize: t_textNormal_size,
                        canvasShield: true,
                        bypassHashOptimization: true,
                        mouseOver: signalItems.length > 0,
                        canOpenPicker: signalItems.length > 0,
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        mode: "signal",
                        rootName: "signals",
                        items: signalItems,
                        value: "Add new STRING signal...",
                        state: (this.mode === 4 || this.mode === 2 || signalItems.length === 0) ? "DIS" : "OFF",
                        onChange: (val) => {
                            this.setDerpSelectedSignal(val, 0);
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.syncDerpOutputs = function() {
            this.outputs = [];
            const signalState = getConcatSignalState(this);
            if (this.properties) this.properties.textValue = signalState.value;
            if (this.transmitDerpSignal && this.id !== -1) {
                this.transmitDerpSignal(signalState.value);
            }
        };

        nodeType.prototype.setDerpSelectedSignal = function(val, idx = 0) {
            const signalId = getConcatSignalIdFromLabel(val);
            if (!signalId) return;
            if (!this.properties) this.properties = {};
            if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
            if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
            this.properties.multiSignalLabels[idx] = val;
            this.properties.multiSignalIds[idx] = signalId;
            this._layoutMapHash = null;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.requestDerpSync) this.requestDerpSync();
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;

            this.outputs = [];
            this.titleLabel = "Derp Concatenate";
            this.properties.titleLabel = "Derp Concatenate";
            this.properties.textValue = "";
            this.properties.multiSignalIds = {};
            this.properties.multiSignalLabels = {};
            this.properties.drawSignalBtn = false;
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [180, 50];
            this.size = [180, 50];

            suppressConcatNativeWidgets(this);
            this.refreshNodeLayoutMap();

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
            this.properties.drawSignalBtn = false;
            this.outputs = [];

            suppressConcatNativeWidgets(this);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            this.requestDerpSync();
        };

        const onAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            if (onAdded) onAdded.apply(this, arguments);
            suppressConcatNativeWidgets(this);
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;

            suppressConcatNativeWidgets(this);

            const signalState = getConcatSignalState(this);
            const signalHash = `${signalState.activeSignalId}|${signalState.preview}`;
            if (this._lastConcatSignalHash !== signalHash) {
                this._lastConcatSignalHash = signalHash;
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
            }

            const currentW = Math.round(this.size[0]);
            if (this._lastDerpW !== currentW) {
                this._lastDerpW = currentW;
                this.refreshNodeLayoutMap();
            }
        };
    }
});
