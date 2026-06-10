/**
 * Path: ./js/derpConcatenate.js
 * STATUS: VIRTUAL FATHA COMPLIANT - STRING signal display node
 */
import { app } from "../../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { measureTextHeight } from "../../herbina/utils/widgetsUtils.js";

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

function measureConcatPreviewHeight(text, maxWidth, fontSize, fontFamily, fontWeight, paddingY) {
    const safeFontSize = Math.max(1, Number(fontSize) || 12);
    const verticalPadding = Math.max(0, Number(paddingY) || 0) * 2;
    return measureTextHeight(String(text || " "), Math.max(1, Number(maxWidth) || 1), {
        fontSize: safeFontSize,
        font: fontFamily || "arial",
        fontWeight: fontWeight || "normal",
    }) + verticalPadding;
}

function getConcatPreviewInnerWidth(node, vars) {
    const contentWidth = getConcatContentWidth(node, vars);
    const pW = Number(vars?.pW || 0);
    return Math.max(1, contentWidth - (pW * 2));
}

function getConcatContentWidth(node, vars) {
    const nodeWidth = Number(node?.size?.[0] || 0);
    const mW = node?.properties?.drawHeader === true ? Number(vars?.mW || 0) : 0;
    return Math.max(1, nodeWidth - (mW * 2));
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

function formatConcatSignalLabel(name, slotOrId) {
    const raw = String(name || "");
    if (!raw) return String(slotOrId || "Unknown");
    // If name already contains [slot], split and colorize only the node name portion
    const bracketIdx = raw.lastIndexOf(" [");
    if (bracketIdx >= 0) {
        return `{{t_text_accent::${raw.slice(0, bracketIdx)}}}${raw.slice(bracketIdx)}`;
    }
    // Otherwise append slotOrId as the bracket suffix
    const suffix = slotOrId ? ` [${slotOrId}]` : "";
    return `{{t_text_accent::${raw}}}${suffix}`;
}

function getConcatSignalItems(node) {
    const ownId = node ? String(node.id) : null;
    const alreadySelected = new Set();
    if (node?.properties?.multiSignalIds) {
        Object.values(node.properties.multiSignalIds).forEach((id) => {
            if (id) alreadySelected.add(String(id).split(":")[0]);
        });
    }

    // THE LOOP GUARD: Traverse physical outputs to find all downstream nodes
    const downstreamIds = new Set();
    if (node && ownId) {
        const visited = new Set();
        const queue = [node];
        while (queue.length > 0) {
            const n = queue.shift();
            if (!n || visited.has(n.id)) continue;
            visited.add(n.id);
            if (String(n.id) !== ownId) downstreamIds.add(String(n.id));
            if (n.outputs) {
                for (const out of n.outputs) {
                    if (out.links) {
                        for (const lId of out.links) {
                            const l = app.graph.links[lId];
                            if (l && l.target_id) {
                                const target = app.graph.getNodeById(l.target_id);
                                if (target) queue.push(target);
                            }
                        }
                    }
                }
            }
        }
    }

    return Object.values(window.xcpDerpSignals || {})
        .filter((sig) => {
            if (!sig || !sig.nodeId) return false;
            if (!String(sig.type || "").toUpperCase().includes("STRING")) return false;
            const sid = String(sig.nodeId).split(":")[0];
            if (ownId && sid === ownId) return false;
            if (alreadySelected.has(sid)) return false;
            // Block signals that would create a loop
            if (downstreamIds.has(sid)) return false;
            if (Array.isArray(sig.upstreamIds) && sig.upstreamIds.some(id => String(id) === ownId)) return false;
            return true;
        })
        .map((sig) => formatConcatSignalLabel(sig.nodeName, sig.nodeId));
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

function getOrderedConcatSignalIndices(node) {
    const ids = node?.properties?.multiSignalIds || {};
    const labels = node?.properties?.multiSignalLabels || {};
    const keys = [...new Set([...Object.keys(ids), ...Object.keys(labels)])];
    return keys
        .filter((key) => ids[key] || labels[key])
        .sort((a, b) => Number(a) - Number(b));
}

function normalizeConcatSignalSelections(node) {
    if (!node?.properties) return;
    if (Array.isArray(node.properties.signalDeck)) {
        const deck = node.properties.signalDeck
            .filter((entry) => entry && (entry.id || entry.label))
            .map((entry) => ({
                id: entry.id || "",
                label: entry.label || "",
                hiddenPreview: entry.hiddenPreview === true,
            }));
        const nextIds = {};
        const nextLabels = {};
        const nextHiddenPreviews = {};

        deck.forEach((entry, index) => {
            if (entry.id) nextIds[index] = entry.id;
            if (entry.label) nextLabels[index] = entry.label;
            if (entry.hiddenPreview) nextHiddenPreviews[index] = true;
        });

        node.properties.signalDeck = deck;
        node.properties.multiSignalIds = nextIds;
        node.properties.multiSignalLabels = nextLabels;
        node.properties.hiddenSignalPreviews = nextHiddenPreviews;
        return;
    }

    const ids = node.properties.multiSignalIds || {};
    const labels = node.properties.multiSignalLabels || {};
    const hiddenPreviews = node.properties.hiddenSignalPreviews || {};
    const ordered = getOrderedConcatSignalIndices(node);
    const deck = [];
    const nextIds = {};
    const nextLabels = {};
    const nextHiddenPreviews = {};

    ordered.forEach((key, index) => {
        const id = ids[key];
        const label = labels[key];
        deck[index] = {
            id: id || "",
            label: label || "",
            hiddenPreview: hiddenPreviews[key] === true,
        };
        if (id) nextIds[index] = id;
        if (label) nextLabels[index] = label;
        if (hiddenPreviews[key] === true) nextHiddenPreviews[index] = true;
    });

    node.properties.signalDeck = deck;
    node.properties.multiSignalIds = nextIds;
    node.properties.multiSignalLabels = nextLabels;
    node.properties.hiddenSignalPreviews = nextHiddenPreviews;
}

function getConcatSignalStates(node) {
    const ids = node?.properties?.multiSignalIds || {};
    const labels = node?.properties?.multiSignalLabels || {};
    return getOrderedConcatSignalIndices(node).map((key, order) => {
        const activeSignalId = resolveConcatSignalId(ids[key] || null);
        const signal = activeSignalId ? window.xcpDerpSignals?.[activeSignalId] : null;
        const value = signal ? normalizeConcatSignalValue(signal.value) : "";
        return {
            idx: order,
            activeSignalId: activeSignalId || "",
            label: signal ? formatConcatSignalLabel(signal.nodeName, signal.slotName || activeSignalId) : (activeSignalId || `Signal ${order + 1}`),
            value,
            preview: value,
            hasSignal: !!signal,
        };
    });
}

function syncDerpConcatenateLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_concatenate.title", "Derp Concatenate");
    const previousLocalizedTitle = node._lastLocalizedDerpConcatenateTitle;

    if (!node.titleLabel || node.titleLabel === "Derp Concatenate" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Concatenate" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }

    node._lastLocalizedDerpConcatenateTitle = localizedTitle;
}

function getConcatCombinedValue(signalStates) {
    return signalStates.map((state) => state.value).join("");
}

function applyConcatSignalDeckOrder(node) {
    if (!node?.properties || !Array.isArray(node.properties.signalDeck)) return;
    const nextIds = {};
    const nextLabels = {};
    const nextHiddenPreviews = {};

    node.properties.signalDeck.forEach((entry, index) => {
        if (entry?.id) nextIds[index] = entry.id;
        if (entry?.label) nextLabels[index] = entry.label;
        if (entry?.hiddenPreview === true) nextHiddenPreviews[index] = true;
    });

    node.properties.multiSignalIds = nextIds;
    node.properties.multiSignalLabels = nextLabels;
    node.properties.hiddenSignalPreviews = nextHiddenPreviews;
}

function cancelConcatStackDrag(node) {
    endStackDrag(node, "signalDeck");
    applyConcatSignalDeckOrder(node);
}

function buildConcatLayoutHash(node, vars, signalStates) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const signalItems = getConcatSignalItems(node);
    return [
        window._xcpDerpSession || "",
        node?.titleLabel || "",
        width,
        signalStates.map((state) => `${state.activeSignalId}\u0002${state.preview}`).join("\u0003"),
        signalItems.join("\u0001"),
        node?._dragThresholdMet ? (node?._dropPreviewIdx ?? "") : "",
        node?._dragThresholdMet ? (node?._dragTrig?.index ?? "") : "",
        node?._dragThresholdMet ? "1" : "0",
        node?._dragThresholdMet && Array.isArray(node?._dragMouse) ? node._dragMouse.join(",") : "",
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
            syncDerpConcatenateLocaleLabels(this);
            if (this.id !== -1) this.syncDerpOutputs();
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
            normalizeConcatSignalSelections(this);
            const vars = this.getDerpVars(this);
            const { mW, mH, sW, sH, oY, pW, pH, t_textNormal_size, t_textSmall_size } = vars;
            const signalStates = getConcatSignalStates(this);
            const signalItems = getConcatSignalItems(this);
            const previewFontSize = Number(t_textSmall_size || this._t_textSmallPaintData?.fontSize || 12);
            const previewFont = this._t_textSmallPaintData?.font || "arial";
            const previewFontWeight = this._t_textSmallPaintData?.fontWeight || "normal";
            const previewInnerWidth = getConcatPreviewInnerWidth(this, vars);
            const combinedValue = getConcatCombinedValue(signalStates);
            const combinedPreviewHeight = measureConcatPreviewHeight(combinedValue || " ", previewInnerWidth, previewFontSize, previewFont, previewFontWeight, pH);
            const structureHash = buildConcatLayoutHash(this, vars, signalStates);

            this._concatActiveSignalIds = signalStates.map((state) => state.activeSignalId);
            this._concatSignalPreview = signalStates.map((state) => state.preview).join("");
            if (this.properties) this.properties.textValue = combinedValue;

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            const signalItemsForLayout = signalStates.map((signalState, index) => ({ signalState, index }));
            let floatingItem = null;
            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingItem] = signalItemsForLayout.splice(d.index, 1);
                const ghost = { ...floatingItem, isPreviewGhost: true };
                signalItemsForLayout.splice(pIdx, 0, ghost);
            }

            const signalEntryRegions = signalItemsForLayout.reduce((acc, item, displayIndex) => {
                const { signalState, index } = item;
                const entryKey = `regionSignalEntry_${index}`;
                const previewHeight = signalState.hasSignal
                    ? measureConcatPreviewHeight(signalState.preview, previewInnerWidth, previewFontSize, previewFont, previewFontWeight, pH)
                    : 0;
                const isPreviewHidden = this.properties?.hiddenSignalPreviews?.[index] === true;
                const previewHidden = item.isPreviewGhost || !signalState.hasSignal || isPreviewHidden;
                const previousKey = displayIndex === 0 ? "lblStatus" : `regionSignalEntry_${signalItemsForLayout[displayIndex - 1].index}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === index && !item.isPreviewGhost);
                acc[entryKey] = {
                    anchor: { target: previousKey, axis: "y", offset: displayIndex === 0 ? 0 : sH },
                    type: this.UI_TYPES.REGION,
                    onContextMenu: () => {
                        this.toggleDerpSignalPreview(index);
                        return false;
                    },
                    dir: "col",
                    width: "full", height: "auto",
                    state: item.isPreviewGhost ? "DIS" : (isPickedUp ? "ON" : "OFF"),
                    alpha: item.isPreviewGhost ? 0 : 1.0,
                    onPress: () => {
                        cancelConcatStackDrag(this);
                        return true;
                    },
                    onDragStart: (e, data) => startStackDrag(this, data, index, entryKey),
                    onDrag: (e, data) => {
                        updateStackDrag(this, data, "regionSignalEntry_", signalStates.length);
                        if (this._dragThresholdMet) this.refreshNodeLayoutMap();
                    },
                    onDragEnd: () => {
                        endStackDrag(this, "signalDeck");
                        applyConcatSignalDeckOrder(this);
                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                    },
                    [`regionSignalHeader_${index}`]: {
                        dir: "row",
                        width: "full", height: "auto",
                        spacing: [0, 0],
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        onPress: () => {
                            cancelConcatStackDrag(this);
                            return true;
                        },
                        onDragStart: (e, data) => startStackDrag(this, data, index, entryKey),
                        onDrag: (e, data) => {
                            updateStackDrag(this, data, "regionSignalEntry_", signalStates.length);
                            if (this._dragThresholdMet) this.refreshNodeLayoutMap();
                        },
                        onDragEnd: () => {
                            endStackDrag(this, "signalDeck");
                            applyConcatSignalDeckOrder(this);
                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                        },
                        [`btnCollapseEntry_${index}`]: {
                            type: this.UI_TYPES.ICONBUTTON,
                            margin: [sW, 0, 0 ,0],
                            icon: isPreviewHidden ? "add" : "subtract",
                            themeKey: "button, t_textSystem",
                            alpha: item.isPreviewGhost ? 0 : 1.0,
                            width: "match", height: "auto",
                            spacing: [0, 0],
                            onPress: () => {
                                cancelConcatStackDrag(this);
                                this.toggleDerpSignalPreview(index);
                            },
                        },
                        [`btnHeaderLabel_${index}`]: {
                            type: this.UI_TYPES.BUTTON,
                            themeKey: "t_textNormal",
                            text: signalState.label || tLocale("$derp_concatenate.signal_entry", `Signal ${index + 1}`),
                            width: "full", height: "auto",
                            padding: [pW, pH],
                            margin: [0, 0, sW, 0],
                            displayMode: "cutoff",
                            mouseOver: true,
                            alpha: item.isPreviewGhost ? 0 : 1.0,
                            onPress: () => {
                                cancelConcatStackDrag(this);
                                return true;
                            },
                            onDragStart: (e, data) => startStackDrag(this, data, index, entryKey),
                            onDrag: (e, data) => {
                                updateStackDrag(this, data, "regionSignalEntry_", signalStates.length);
                                if (this._dragThresholdMet) this.refreshNodeLayoutMap();
                            },
                            onDragEnd: () => {
                                endStackDrag(this, "signalDeck");
                                applyConcatSignalDeckOrder(this);
                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                            },
                        },
                        [`btnRemoveSignal_${index}`]: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "close",
                            themeKey: "button, t_textSystem",
                            alpha: item.isPreviewGhost ? 0 : 1.0,
                            width: "match", height: "auto",
                            margin: [sW, sH, sW, sH],
                            spacing: [0, 0],
                            onPress: () => {
                                cancelConcatStackDrag(this);
                                this.removeDerpSelectedSignal(index);
                            },
                        },
                    },
                    [`linebreakSignal_${index}`]: {
                        type: this.UI_TYPES.LINEBREAK,
                        hidden: previewHidden,
                        themeKey: "line",
                        width: "full",
                        height: 1,
                        margin: [0, 0, 0, sH],
                    },
                    [`regionSignalContent_${index}`]: {
                        themeKey: "region",
                        dir: "col",
                        width: "full", height: "auto",
                        alpha: item.isPreviewGhost ? 0 : 1.0,
                        [`textSignal_${index}`]: {
                            hidden: previewHidden,
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textSmall",
                            text: (signalState.hasSignal && !signalState.preview) ? tLocale("$derp_concatenate.empty_signal", "Incoming signal is an {{t_text_error::empty string...}}") : (signalState.preview || " "),
                            width: "full", height: previewHidden ? 0 : previewHeight,
                            padding: [pW, pH],
                            labelAlign: ["left", "top"],
                            wrap: true,
                            margin: [0, 0, 0, sH],
                        },
                    },
                };
                return acc;
            }, {});

            if (floatingItem && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const { signalState, index } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];
                const sourceRow = this.layout?.regions?.[`regionSignalEntry_${index}`];
                const floatingRowWidth = sourceRow?.w || getConcatContentWidth(this, vars);
                const floatingRowHeight = sourceRow?.h || "auto";

                signalEntryRegions.floatingSignalRow = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    dir: "col",
                    width: floatingRowWidth,
                    height: floatingRowHeight,
                    ignoreLayout: true,
                    x: dragX,
                    y: dragY,
                    zIndex: 100,
                    state: "ON",
                    pulseStates: true,
                    pulseFromState: "_ON",
                    pulseToState: "_DIS",
                    ignoreNodeBoundsClamp: true,
                    corners: sourceRow?.corners,
                    regionOffset: [0, 0],
                    floatingSignalHeader: {
                        dir: "row",
                        width: "full", height: "auto",
                        spacing: [0, 0],
                        floatingSignalLabel: {
                            type: this.UI_TYPES.BUTTON,
                            themeKey: "t_textNormal",
                            text: signalState.label || tLocale("$derp_concatenate.signal_entry", `Signal ${index + 1}`),
                            width: "full", height: "auto",
                            padding: [pW, pH],
                            margin: [0, 0, sW, 0],
                            displayMode: "cutoff",
                            mouseOver: true,
                        },
                        floatingSignalRemove: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "close",
                            themeKey: "button, t_textSystem",
                            width: "match", height: "auto",
                            margin: [sW, sH, sW, sH],
                            spacing: [0, 0],
                        },
                    },
                };
            }

            const lastLayoutItem = signalItemsForLayout[signalItemsForLayout.length - 1];
            const lastEntryKey = lastLayoutItem ? `regionSignalEntry_${lastLayoutItem.index}` : "lblStatus";
            this._layoutMapHash = structureHash;
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    lblStatus: {
                        hidden: signalStates.length > 0,
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        text: tLocale("$derp_concatenate.select_signal", "Select a STRING signal."),
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        displayMode: "cutoff",
                        pulseStates: true,
                    },
                    ...signalEntryRegions,
                    dropdownSignalAdd: {
                        anchor: { target: lastEntryKey, axis: "y", offset: sH },
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
                        value: tLocale("$derp_concatenate.add_signal", "Add new STRING signal..."),
                        state: (this.mode === 4 || this.mode === 2 || signalItems.length === 0) ? "DIS" : "OFF",
                        onChange: (val) => {
                            this.addDerpSelectedSignal(val);
                        },
                    },
                    regionConcatenated: {
                        anchor: { target: "dropdownSignalAdd", axis: "y", offset: sH },
                        type: this.UI_TYPES.REGION,
                        dir: "col",
                        width: "full", height: "auto",
                        onContextMenu: () => {
                            this.properties.concatContentCollapsed = !this.properties.concatContentCollapsed;
                            this.refreshNodeLayoutMap();
                            return false;
                        },
                        regionConcatHeader: {
                            dir: "row",
                            width: "full", height: "auto",
                            spacing: [0, 0],
                            btnCollapseConcat: {
                                type: this.UI_TYPES.ICONBUTTON,
                                margin: [sW, 0, 0, 0],
                                icon: this.properties.concatContentCollapsed ? "add" : "subtract",
                                themeKey: "button, t_textSystem",
                                width: "match", height: "auto",
                                spacing: [0, 0],
                                onPress: () => {
                                    this.properties.concatContentCollapsed = !this.properties.concatContentCollapsed;
                                    this.refreshNodeLayoutMap();
                                },
                            },
                            lblConcatHeader: {
                                type: this.UI_TYPES.TEXT,
                                themeKey: "t_textNormal",
                                text: tLocale("$derp_concatenate.concatenated_text", "{{t_text_highlight::Concatenated text:}}"),
                                width: "full", height: "auto",
                                padding: [pW, pH],
                                margin: [0, 0, sW, 0],
                                labelAlign: ["left", "middle"],
                                displayMode: "cutoff",
                                mouseOver: false,
                            },
                        },
                        linebreakConcat: {
                            type: this.UI_TYPES.LINEBREAK,
                            hidden: this.properties.concatContentCollapsed,
                            themeKey: "line",
                            width: "full",
                            height: 1,
                            margin: [0, 0, 0, sH],
                        },
                        lbelConcatContent: {
                            hidden: this.properties.concatContentCollapsed,
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textSmall",
                            text: combinedValue || " ",
                            width: "full", height: combinedPreviewHeight,
                            padding: [pW, pH],
                            labelAlign: ["left", "top"],
                            wrap: true,
                            mouseOver: false,
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.syncDerpOutputs = function() {
            if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);

            this.outputs = [];
            normalizeConcatSignalSelections(this);
            const signalStates = getConcatSignalStates(this);
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            const outContent = isBypassed ? "" : getConcatCombinedValue(signalStates);
            if (this.properties) {
                this.properties.isWirelessTransmitter = true;
                this.properties.skipGenericWirelessHeartbeat = true;
                this.properties.textValue = outContent;
            }
            if (this.id === -1) return;

            if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
            const baseId = String(this.id);
            const signalId = `${baseId}:0`;
            const nodeName = this.titleLabel || this.title || tLocale("$derp_concatenate.title", "Derp Concatenate");
            const syncFingerprint = `${isBypassed ? "bypass" : "live"}__${nodeName}__${outContent}`;

            if (this._lastSyncedContent === syncFingerprint) return;
            this._lastSyncedContent = syncFingerprint;

            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
                nodeName: `${nodeName} ${tLocale("$derp_concatenate.concatenated_suffix", "[Concatenated]")}`,
                nodeType: this.type || "Node",
                type: "STRING",
                value: outContent,
                upstreamIds: signalStates.map((state) => String(state.activeSignalId || "").split(":")[0]).filter(Boolean),
                timestamp: Date.now(),
            };

            fetch("/xcp/update_signal", {
                method: "POST",
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ node_id: signalId, value: outContent }),
            });

            if (window.app?.graph?._nodes) {
                window.app.graph._nodes.forEach((n) => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals(true);
                });
                app.canvas.setDirty(true, true);
            }
        };

        nodeType.prototype.setDerpSelectedSignal = function(val, idx = 0) {
            const signalId = getConcatSignalIdFromLabel(val);
            if (!signalId) return;
            if (!this.properties) this.properties = {};
            if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
            if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
            if (!Array.isArray(this.properties.signalDeck)) this.properties.signalDeck = [];
            this.properties.signalDeck[idx] = {
                id: signalId,
                label: val,
                hiddenPreview: this.properties.signalDeck[idx]?.hiddenPreview === true,
            };
            this.properties.multiSignalLabels[idx] = val;
            this.properties.multiSignalIds[idx] = signalId;
            applyConcatSignalDeckOrder(this);
            this._layoutMapHash = null;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.requestDerpSync) this.requestDerpSync();
        };

        nodeType.prototype.addDerpSelectedSignal = function(val) {
            normalizeConcatSignalSelections(this);
            const nextIdx = getOrderedConcatSignalIndices(this).length;
            this.setDerpSelectedSignal(val, nextIdx);
        };

        nodeType.prototype.removeDerpSelectedSignal = function(idx) {
            if (!this.properties) return;
            if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
            if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
            if (!this.properties.hiddenSignalPreviews) this.properties.hiddenSignalPreviews = {};
            if (Array.isArray(this.properties.signalDeck)) this.properties.signalDeck.splice(idx, 1);
            delete this.properties.multiSignalLabels[idx];
            delete this.properties.multiSignalIds[idx];
            delete this.properties.hiddenSignalPreviews[idx];
            normalizeConcatSignalSelections(this);
            this._layoutMapHash = null;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (this.requestDerpSync) this.requestDerpSync();
        };

        nodeType.prototype.toggleDerpSignalPreview = function(idx) {
            if (!this.properties) return;
            if (!this.properties.hiddenSignalPreviews) this.properties.hiddenSignalPreviews = {};
            if (Array.isArray(this.properties.signalDeck) && this.properties.signalDeck[idx]) {
                this.properties.signalDeck[idx].hiddenPreview = this.properties.signalDeck[idx].hiddenPreview !== true;
            }
            this.properties.hiddenSignalPreviews[idx] = this.properties.hiddenSignalPreviews[idx] !== true;
            applyConcatSignalDeckOrder(this);
            this._layoutMapHash = null;
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
            this.titleLabel = tLocale("$derp_concatenate.title", "Derp Concatenate");
            this.properties.titleLabel = tLocale("$derp_concatenate.title", "Derp Concatenate");
            this.properties.textValue = "";
            this.properties.multiSignalIds = {};
            this.properties.multiSignalLabels = {};
            this.properties.hiddenSignalPreviews = {};
            this.properties.signalDeck = [];
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

            normalizeConcatSignalSelections(this);
            const signalStates = getConcatSignalStates(this);
            const signalHash = signalStates.map((state) => `${state.activeSignalId}|${state.preview}`).join("\u0001");
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
