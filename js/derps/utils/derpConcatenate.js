/**
 * Path: ./js/derpConcatenate.js
 * STATUS: VIRTUAL FATHA COMPLIANT - STRING signal display node
 */
import { app } from "../../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { measureTextHeight } from "../../herbina/utils/widgetsUtils.js";
import { settleDerpSizeBeforeDraw } from "../../fatha/core/fathaHandler.js";
import { resolveDerpPreferredAutoHeight, resolveDerpRuntimeAutoHeight } from "../../fatha/core/derpHeightPolicy.js";
import {
    FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH,
    FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT,
    FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT,
} from "../../fatha/core/fathaContentViewport.js";

// Scrollbar lane carved from a viewport region's right edge on overflow.
// Wrap measurements must reserve it so the gutter clearance pass cannot
// re-wrap text taller than its measured region height.
const CONCAT_VIEWPORT_SCROLLBAR_GUTTER = FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT
    + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH
    + FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT;

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

// --- scrollViewport clip resolvers (manual-height mode only) ---

function resolveConcatSignalsClipHeight(node, region, regions = {}) {
    if (resolveDerpRuntimeAutoHeight(node)) return 0;
    const fullHeight = Number(region?.h) || 0;
    const regionY = Number(region?.y) || 0;
    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : {};
    const viewportGap = Math.max(0, Number(vars?.mH || 0));
    const signalsMin = Number(node?._concatSignalsMinClipHeight) || 0;
    const outputMin = Number(node?._concatOutputMinClipHeight) || 0;
    // addSignalRegion is bottom-pinned below the fill container; both viewports
    // must stop above it (loaderRegion pattern), not at the node's bottom edge.
    const addSignalTop = Number(regions?.addSignalRegion?.y) || 0;
    const outputRegion = regions?.regionConcatContent;
    const outputContentTop = Number(outputRegion?.y) || 0;
    // Fixed rows between the signals viewport bottom and the output content top
    // (linebreak + concat header + linebreak) must be preserved as well.
    const fixedMiddle = Math.max(0, outputContentTop - (regionY + fullHeight));
    const hasBottomClamp = addSignalTop > regionY;
    if (!hasBottomClamp) {
        // Zero-height measurement pass (bottom row not positioned yet): there
        // is nothing to clamp against. Measuring from the physical node height
        // here inflates contentMinHeight to the CURRENT height, which makes
        // manual resize expand-only. Report the declared minimum instead.
        const clip = Math.max(1, Math.min(fullHeight, Math.max(1, signalsMin)));
        node._concatSignalsClipDelta = Math.max(0, fullHeight - clip);
        return clip;
    }
    const space = Math.max(0, addSignalTop - regionY - fixedMiddle - viewportGap);

    let available;
    if (node?._concatUseOutputViewport === true) {
        // Share the space between both viewports: water-fill so a fully-fitting
        // viewport is satisfied first, otherwise both split the shortage.
        const outputFull = Number(outputRegion?.h) || 0;
        const needS = Math.max(0, fullHeight - signalsMin);
        const needO = Math.max(0, outputFull - outputMin);
        const budget = space - signalsMin - outputMin;
        if (!(budget > 0)) available = Math.max(0, space - outputMin);
        else if (needS <= budget / 2) available = fullHeight;
        else if (needO <= budget / 2) available = space - outputMin - needO;
        else available = signalsMin + budget / 2;
    } else {
        // Output content is fixed-height (collapsed or single-line): reserve all of it.
        available = space - (Number(outputRegion?.h) || 0);
    }
    // Hard cap: never cross the bottom clamp, even below minClip. Floor at 1px
    // so the viewport never disables into full overflow.
    const clip = Math.max(1, fullHeight > 0 ? Math.min(fullHeight, available) : available);
    node._concatSignalsClipDelta = Math.max(0, fullHeight - clip);
    return clip;
}

function resolveConcatSignalsMinClipHeight(node, region, regions = {}) {
    return Number(node?._concatSignalsMinClipHeight) || 0;
}

function resolveConcatOutputClipHeight(node, region, regions = {}) {
    if (resolveDerpRuntimeAutoHeight(node)) return 0;
    const fullHeight = Number(region?.h) || 0;
    const regionY = Number(region?.y) || 0;
    const signalsDelta = Number(node?._concatSignalsClipDelta) || 0;
    // region.y is pre-shift; the signals viewport's post-clip shift raises this
    // region by signalsDelta, so measure available space from the shifted top.
    const shiftedRegionY = regionY - signalsDelta;
    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : {};
    const viewportGap = Math.max(0, Number(vars?.mH || 0));
    const outputMin = Number(node?._concatOutputMinClipHeight) || 0;
    // Clamp above the bottom-pinned signal selector row (loaderRegion pattern).
    const addSignalTop = Number(regions?.addSignalRegion?.y) || 0;
    const hasBottomClamp = addSignalTop > shiftedRegionY;
    if (!hasBottomClamp) {
        // Same zero-height measurement rule as the signals resolver: report
        // the declared minimum, not a physical-node-height measurement, or
        // contentMinHeight inflates to the current height and manual resize
        // becomes expand-only.
        return Math.max(1, Math.min(fullHeight, Math.max(1, outputMin)));
    }
    const available = Math.max(0, addSignalTop - shiftedRegionY - viewportGap);
    const clip = Math.max(1, fullHeight > 0 ? Math.min(fullHeight, available) : available);
    return clip;
}

function resolveConcatOutputMinClipHeight(node, region, regions = {}) {
    return Number(node?._concatOutputMinClipHeight) || 0;
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
        .map((sig) => ({
            value: String(sig.nodeId),
            label: formatConcatSignalLabel(sig.nodeName, sig.nodeId),
        }));
}

function getConcatSignalLabelFromSelection(selection) {
    if (selection && typeof selection === "object") {
        return String(selection.label || selection.display || selection.name || selection.value || selection.id || "");
    }
    const raw = String(selection || "");
    const signals = window.xcpDerpSignals || {};
    const signal = signals[raw];
    return signal ? formatConcatSignalLabel(signal.nodeName, signal.slotName || signal.nodeId) : raw;
}

function getConcatSignalIdFromSelection(selection) {
    const value = String((selection && typeof selection === "object")
        ? (selection.value ?? selection.id ?? selection.nodeId ?? selection.label ?? "")
        : (selection ?? ""));
    if (window.xcpDerpSignals?.[value]) return value;
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

function shouldSettleConcatAutoHeight(node) {
    return resolveDerpRuntimeAutoHeight(node) || resolveDerpPreferredAutoHeight(node);
}

function buildConcatLayoutHash(node, vars, signalStates, isRuntimeAutoHeight = resolveDerpRuntimeAutoHeight(node)) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const signalItems = getConcatSignalItems(node);
    const hiddenPreviews = node?.properties?.hiddenSignalPreviews || {};
    const hiddenPreviewHash = Object.keys(hiddenPreviews)
        .filter((k) => hiddenPreviews[k] === true)
        .sort((a, b) => Number(a) - Number(b))
        .join(",");
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
        node?.properties?.drawHeader !== false,
        `hm:${isRuntimeAutoHeight ? "auto" : "manual"}`,
        `hp:${hiddenPreviewHash}`,
        `cc:${node?.properties?.concatContentCollapsed === true ? 1 : 0}`,
        // Overflow-gated box clearance margins change the map; the flag must
        // be hashed or the early-return guard serves a stale pre-margin map.
        `ov:${node?._contentViewportState?.regionConcatContent?.hasOverflow === true ? 1 : 0}`,
    ].join("|");
}

function suppressConcatNativeWidgets(node) {
    if (!node?.widgets) return;
    node.widgets.forEach((widget) => {
        widget.last_y = -5000;
        widget.hidden = true;
        widget.computeSize = () => [0, -4];
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
        if (nodeData.name !== "derpConcatenate") return;

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
            suppressConcatNativeWidgets(this);
            if (this.flags?.collapsed || this.properties?.contentCollapsed === true || this.size[0] <= 0) return;
            normalizeConcatSignalSelections(this);
            const vars = this.getDerpVars(this);
            const { mW, mH, sW, sH, pW, pH, t_textNormal_size, t_textSmall_size } = vars;

            // Reserve space for the system button (6px) + mH gap (derpNotes pattern).
            this.properties.footerHeight = 6 + mH;
            const signalStates = getConcatSignalStates(this);
            const signalItems = getConcatSignalItems(this);
            const previewFontSize = Number(t_textSmall_size || this._t_textSmallPaintData?.fontSize || 12);
            const previewFont = this._t_textSmallPaintData?.font || "arial";
            const previewFontWeight = this._t_textSmallPaintData?.fontWeight || "normal";
            const combinedValue = getConcatCombinedValue(signalStates);
            const isRuntimeAutoHeight = resolveDerpRuntimeAutoHeight(this);
            const isManualMode = !isRuntimeAutoHeight;
            const structureHash = buildConcatLayoutHash(this, vars, signalStates, isRuntimeAutoHeight);

            // --- Viewport arming (loader pattern: armed in manual mode whenever
            // content exists; the clip resolvers decide how much actually clips) ---
            const useSignalsViewport = isManualMode && signalStates.length > 0;
            const useOutputViewport = isManualMode && this.properties?.concatContentCollapsed !== true;
            this._concatUseOutputViewport = useOutputViewport;
            // Scrollbar-outside-the-box clearance: the painted concat section box
            // (regionConcatenated) is an ANCESTOR of the output viewport, so the
            // framework's descendant-only gutter clearance never moves it and the
            // scrollbar draws flush on the box's right edge. On overflow, narrow
            // the box by the gutter and extend the viewport by the same amount —
            // the pair cancels, so viewport/text/scrollbar geometry is unchanged
            // (no rewrap, no overflow oscillation) while the box edge steps left
            // of the scrollbar lane, matching the signal entries' outside look.
            const outputBoxCleared = this._contentViewportState?.regionConcatContent?.hasOverflow === true;
            // Reserve the scrollbar gutter in wrap measurements so the gutter
            // clearance pass cannot re-wrap text taller than its measured region
            // height (which would slice the bottom text line at full clip).
            const gutterSafety = (useSignalsViewport || useOutputViewport) ? CONCAT_VIEWPORT_SCROLLBAR_GUTTER : 0;
            const previewInnerWidth = Math.max(1, getConcatPreviewInnerWidth(this, vars) - gutterSafety);
            const outputInnerWidth = Math.max(1, previewInnerWidth - (sW * 2));
            const combinedPreviewHeight = measureConcatPreviewHeight(combinedValue || " ", outputInnerWidth, previewFontSize, previewFont, previewFontWeight, pH);
            const oneLineHeight = measureConcatPreviewHeight("Xg", outputInnerWidth, previewFontSize, previewFont, previewFontWeight, pH);
            this._concatOneLineHeight = oneLineHeight;
            this._concatOutputMinClipHeight = oneLineHeight + sH + sH;
            this._concatSignalsMinClipHeight = oneLineHeight + (Number(t_textNormal_size || 14) + (pH * 2)) + sH + sH;
            this._concatSignalsClipDelta = 0;

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
                    type: this.UI_TYPES.REGION,
                    margin: [0, 0, 0, sH],
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
                        [`regionSignalContentInner_${index}`]: {
                            dir: "col",
                            width: "full", height: "auto",
                            // No margins on this wrapper: the engine folds child
                            // margins into auto heights, but the viewport's
                            // fullHeight measures descendant y+h WITHOUT margins —
                            // so the trailing sH must live on the text child to be
                            // counted in the viewport's measured content height.
                            [`textSignal_${index}`]: {
                                hidden: previewHidden,
                                type: this.UI_TYPES.TEXT,
                                themeKey: "t_textSmall",
                                text: (signalState.hasSignal && !signalState.preview) ? tLocale("$derp_concatenate.empty_signal", "Incoming signal is an {{t_text_error::empty string...}}") : (signalState.preview || " "),
                                width: "full", height: previewHidden ? 0 : previewHeight,
                                padding: [pW, pH],
                                margin: [0, 0, 0, sH],
                                labelAlign: ["left", "top"],
                                wrap: true,
                            },
                        },
                    },
                };
                return acc;
            }, {});

            let floatingRowRegion = null;
            if (floatingItem && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const { signalState, index } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];
                const sourceRow = this.layout?.regions?.[`regionSignalEntry_${index}`];
                const floatingRowWidth = sourceRow?.w || getConcatContentWidth(this, vars);
                const floatingRowHeight = sourceRow?.h || "auto";

                floatingRowRegion = {
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

            this._layoutMapHash = structureHash;
            const regionSignals = {
                width: "full", height: "auto", dir: "col",
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
                regionSignalsViewport: {
                    scrollViewport: useSignalsViewport,
                    clipHeight: resolveConcatSignalsClipHeight,
                    minClipHeight: resolveConcatSignalsMinClipHeight,
                    width: "full", height: "auto", dir: "col",
                    margin: [0, 0, 0, 0],
                    ...signalEntryRegions,
                },
                ...(floatingRowRegion ? { floatingSignalRow: floatingRowRegion } : {}),
                linebreakBeforeConcat: {
                    type: this.UI_TYPES.LINEBREAK,
                    themeKey: "line",
                    width: "full",
                    height: 1,
                    margin: [-mW, mH, -mW, mH],
                },
            };
            const regionConcatenated = {
                type: this.UI_TYPES.REGION,
                dir: "col",
                width: "full", height: "auto",
                // Paired with the viewport's -gutter margin below: on overflow
                // the painted box steps left of the scrollbar lane.
                margin: [0, 0, outputBoxCleared ? CONCAT_VIEWPORT_SCROLLBAR_GUTTER : 0, 0],
                onContextMenu: () => {
                    this.properties.concatContentCollapsed = !this.properties.concatContentCollapsed;
                    this._layoutMapHash = null;
                    this.refreshNodeLayoutMap();
                    if (shouldSettleConcatAutoHeight(this)) {
                        this._allowDockContentHeightShiftFrames = 4;
                        settleDerpSizeBeforeDraw(this, {
                            forceAutoHeight: true,
                            suppressRequestSync: true,
                        });
                    }
                    this.requestDerpSync();
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
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                            if (shouldSettleConcatAutoHeight(this)) {
                                this._allowDockContentHeightShiftFrames = 4;
                                settleDerpSizeBeforeDraw(this, {
                                    forceAutoHeight: true,
                                    suppressRequestSync: true,
                                });
                            }
                            this.requestDerpSync();
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
                regionConcatContent: {
                    scrollViewport: useOutputViewport,
                    clipHeight: resolveConcatOutputClipHeight,
                    minClipHeight: resolveConcatOutputMinClipHeight,
                    width: "full", height: "auto", dir: "col",
                    // Extends past the narrowed box back to the full content
                    // width (LINEBREAK -mW pattern), keeping viewport width —
                    // and therefore text wrap and overflow state — constant.
                    margin: [0, 0, outputBoxCleared ? -CONCAT_VIEWPORT_SCROLLBAR_GUTTER : 0, 0],
                    // Auto-height wrapper: the engine folds child margins into
                    // auto heights, but the viewport's fullHeight measures
                    // descendant y+h WITHOUT margins — so the sH/sW insets must
                    // live on the text child (counted via the wrapper's auto
                    // height), not on the wrapper itself. Otherwise the bottom
                    // sH is dropped from fullHeight and the clip slices the
                    // bottom text line.
                    regionConcatContentInner: {
                        dir: "col",
                        width: "full", height: "auto",
                        lbelConcatContent: {
                            hidden: this.properties.concatContentCollapsed,
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textSmall",
                            text: combinedValue || " ",
                            width: "full", height: combinedPreviewHeight,
                            padding: [pW, pH],
                            margin: [sW, sH, sW, sH],
                            labelAlign: ["left", "top"],
                            wrap: true,
                            mouseOver: false,
                        },
                    },
                },
            };
            const addSignalControls = {
                linebreakBeforeAdd: {
                    type: this.UI_TYPES.LINEBREAK,
                    themeKey: "line",
                    width: "full",
                    height: 1,
                    margin: [-mW, mH, -mW, 0],
                },
                dropdownSignalAdd: {
                    type: this.UI_TYPES.FILEBROWSER,
                    icon: "signal",
                    themeKey: "dialog, t_textNormal",
                    fontSize: t_textNormal_size,
                    canvasShield: true,
                    bypassHashOptimization: true,
                    mouseOver: signalItems.length > 0,
                    canOpenPicker: signalItems.length > 0,
                    width: "full", height: "auto",
                    margin: [0, mH, 0, 0],
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
            };
            this.layoutMap = isRuntimeAutoHeight
                ? {
                    contentRegion: {
                        anchor: { target: "headerRegion", axis: "y" },
                        width: "full", height: "auto", dir: "col",
                        margin: [mW, mH, mW, 0],
                        regionSignals,
                        regionConcatenated,
                        ...addSignalControls,
                    },
                }
                : {
                    contentAndSpringRegion: {
                        anchor: { target: "headerRegion", axis: "y" },
                        width: "full", height: "fill", dir: "col",
                        margin: [mW, mH, mW, 0],
                        regionSignals,
                        regionConcatenated,
                        springRegion: {
                            width: "full", height: "fill", minHeight: 0,
                        },
                    },
                    addSignalRegion: {
                        width: "full", height: "auto", dir: "col",
                        margin: [mW, 0, mW, 0],
                        ...addSignalControls,
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
            const signalId = getConcatSignalIdFromSelection(val);
            if (!signalId) return;
            const label = getConcatSignalLabelFromSelection(val);
            if (!this.properties) this.properties = {};
            if (!this.properties.multiSignalLabels) this.properties.multiSignalLabels = {};
            if (!this.properties.multiSignalIds) this.properties.multiSignalIds = {};
            if (!Array.isArray(this.properties.signalDeck)) this.properties.signalDeck = [];
            this.properties.signalDeck[idx] = {
                id: signalId,
                label,
                hiddenPreview: this.properties.signalDeck[idx]?.hiddenPreview === true,
            };
            this.properties.multiSignalLabels[idx] = label;
            this.properties.multiSignalIds[idx] = signalId;
            applyConcatSignalDeckOrder(this);
            this._layoutMapHash = null;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
            if (shouldSettleConcatAutoHeight(this)) {
                this._allowDockContentHeightShiftFrames = 4;
                settleDerpSizeBeforeDraw(this, {
                    forceAutoHeight: true,
                    suppressRequestSync: true,
                });
            }
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
            if (shouldSettleConcatAutoHeight(this)) {
                this._allowDockContentHeightShiftFrames = 4;
                settleDerpSizeBeforeDraw(this, {
                    forceAutoHeight: true,
                    suppressRequestSync: true,
                });
            }
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
            if (shouldSettleConcatAutoHeight(this)) {
                this._allowDockContentHeightShiftFrames = 4;
                settleDerpSizeBeforeDraw(this, {
                    forceAutoHeight: true,
                    suppressRequestSync: true,
                });
            }
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

            suppressConcatNativeWidgets(this);
            if (this.flags?.collapsed || this.properties?.contentCollapsed === true) return;

            normalizeConcatSignalSelections(this);
            const signalStates = getConcatSignalStates(this);
            const signalHash = signalStates.map((state) => `${state.activeSignalId}|${state.preview}`).join("\u0001");
            const hiddenPreviewKeys = Object.keys(this.properties?.hiddenSignalPreviews || {})
                .filter((k) => this.properties.hiddenSignalPreviews[k] === true).sort((a, b) => Number(a) - Number(b)).join(",");
            const collapseHash = `${signalHash}\u0002hp:${hiddenPreviewKeys}\u0002cc:${this.properties?.concatContentCollapsed === true ? 1 : 0}`;
            if (this._lastConcatSignalHash !== collapseHash) {
                this._lastConcatSignalHash = collapseHash;
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                if (shouldSettleConcatAutoHeight(this) && !this._isDerpResizing) {
                    this._allowDockContentHeightShiftFrames = 4;
                    settleDerpSizeBeforeDraw(this, {
                        forceAutoHeight: true,
                        suppressRequestSync: true,
                    });
                }
            }

            const currentW = Math.round(this.size[0]);
            if (this._lastDerpW !== currentW) {
                this._lastDerpW = currentW;
                this.refreshNodeLayoutMap();
                if (shouldSettleConcatAutoHeight(this)) {
                    this._allowDockContentHeightShiftFrames = 4;
                    settleDerpSizeBeforeDraw(this, {
                        forceAutoHeight: true,
                        suppressRequestSync: true,
                    });
                }
            }

            // Overflow-gated box clearance: the layout pass learns about output
            // overflow only after the map is built, so flip-trigger one rebuild
            // here to apply/remove the paired box/viewport gutter margins.
            const outputOverflowNow = this._contentViewportState?.regionConcatContent?.hasOverflow === true;
            if (outputOverflowNow !== (this._concatOutputBoxCleared === true)) {
                this._concatOutputBoxCleared = outputOverflowNow;
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
            }
        };
    }
});
