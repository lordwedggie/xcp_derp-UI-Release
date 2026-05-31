/**
 * Path: ./js/controldeck/derpToggle.js
 * ROLE: Derp Toggle pure virtual BOOL wireless broadcaster.
 * BASIS: derpFathaTemplate.js
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { refreshWirelessSignalConsumers, transmitDerpSignal } from "../fatha/core/masterSignalEngine.js";
import { showBastaToggle } from "../fatha/bastas/bastaToggle.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../fatha/helpers/fathaDragDrop.js";
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

function getDefaultToggleLabel() {
    return tLocale("$derp_toggle.default_label", "Bypass Toggle");
}

function getDefaultToggleItemLabel(index) {
    return `${tLocale("$derp_toggle.item_prefix", "Toggle")} ${index + 1}`;
}

function isToggleUsedByRemoteBypass(node, signalIndex) {
    const signalId = `${node.id}:${signalIndex}`;
    const graph = app?.graph;
    if (!graph) return false;
    // Check nodes
    if (graph._nodes) {
        for (const n of graph._nodes) {
            if (n?.properties?.derpRemoteBypass?.signalId === signalId) return true;
        }
    }
    // Check groups (bypass stored in flags, not properties)
    if (graph._groups) {
        for (const g of graph._groups) {
            if (g?.flags?.derpRemoteBypass?.signalId === signalId) return true;
        }
    }
    return false;
}

function syncDerpToggleLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_toggle.title", "Derp Toggle");
    const localizedOutput = tLocale("$derp_toggle.output", "BOOL_OUT");
    const localizedSignalName = tLocale("$derp_toggle.default_label", "Bypass Toggle");
    const previousLocalizedTitle = node._lastLocalizedDerpToggleTitle;
    const previousLocalizedOutput = node._lastLocalizedDerpToggleOutput;
    const previousLocalizedSignal = node._lastLocalizedDerpToggleSignalName;

    if (!node.titleLabel || node.titleLabel === "Derp Toggle" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Toggle" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (!node.properties.outputName || node.properties.outputName === "BOOL_OUT" || (previousLocalizedOutput && node.properties.outputName === previousLocalizedOutput)) {
        node.properties.outputName = localizedOutput;
    }
    if (!node.properties.signalName || node.properties.signalName === "Bypass Toggle" || (previousLocalizedSignal && node.properties.signalName === previousLocalizedSignal)) {
        node.properties.signalName = localizedSignalName;
    }

    node._lastLocalizedDerpToggleTitle = localizedTitle;
    node._lastLocalizedDerpToggleOutput = localizedOutput;
    node._lastLocalizedDerpToggleSignalName = localizedSignalName;
}

function ensureToggleItems(node) {
    if (!node.properties) node.properties = {};

    if (!Array.isArray(node.properties.toggleItems) || node.properties.toggleItems.length === 0) {
        const fallbackLabel = node.properties.signalName || getDefaultToggleLabel();
        const fallbackState = node.properties.toggleState !== false;
        node.properties.toggleItems = [{
            label: fallbackLabel,
            value: fallbackState,
            signalIndex: 0,
        }];
    }

    let nextSignalIndex = 0;
    node.properties.toggleItems = node.properties.toggleItems.map((item) => {
        const existingIndex = Number(item?.signalIndex);
        if (Number.isInteger(existingIndex) && existingIndex >= 0) {
            nextSignalIndex = Math.max(nextSignalIndex, existingIndex + 1);
            return item;
        }
        const nextItem = { ...item, signalIndex: nextSignalIndex };
        nextSignalIndex += 1;
        return nextItem;
    });

    const firstSignalItem = [...node.properties.toggleItems]
        .sort((a, b) => (Number(a?.signalIndex) || 0) - (Number(b?.signalIndex) || 0))[0];
    node.properties.signalName = firstSignalItem?.label || getDefaultToggleLabel();
    node.properties.toggleState = firstSignalItem?.value !== false;
    return node.properties.toggleItems;
}

function buildToggleLayoutHash(node, vars, toggleItems) {
    const deckHash = toggleItems
        .map((item, index) => `${index}:${item?.signalIndex}:${item?.label || ""}:${item?.value !== false}:${isToggleUsedByRemoteBypass(node, index)}`)
        .join("|");
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const dragIndex = node?._dragTrig?.index;
    const dragMouse = Array.isArray(node?._dragMouse) ? node._dragMouse.join(",") : "";
    return `${deckHash}_${window._xcpDerpSession}_${node.titleLabel || ""}_${width}_${mW}_${mH}_${oY}_${node.properties?.drawHeader !== false}_${node._dropPreviewIdx}_${dragIndex}_${node._dragThresholdMet}_${dragMouse}`;
}

function toggleDerpToggleItem(node, idx) {
    const now = performance.now();
    if (node._lastDerpTogglePress && node._lastDerpTogglePress.idx === idx && now - node._lastDerpTogglePress.time < 80) return;
    node._lastDerpTogglePress = { idx, time: now };

    endStackDrag(node, "toggleItems");
    const items = ensureToggleItems(node);
    items[idx].value = !(items[idx].value !== false);
    const firstSignalItem = [...items]
        .sort((a, b) => (Number(a?.signalIndex) || 0) - (Number(b?.signalIndex) || 0))[0];
    node.properties.signalName = firstSignalItem?.label || getDefaultToggleLabel();
    node.properties.toggleState = firstSignalItem?.value !== false;
    if (node.syncDerpOutputs) node.syncDerpOutputs();
    node.refreshNodeLayoutMap();
}

app.registerExtension({
    name: "xcp.derpToggle_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("togglenode")) return;

        fatha(nodeType, nodeData, 50);

        if (!nodeType.prototype.transmitDerpSignal) {
            nodeType.prototype.transmitDerpSignal = transmitDerpSignal;
        }

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            syncDerpToggleLocaleLabels(this);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            syncDerpToggleLocaleLabels(this);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oY, pW, pH } = this.getDerpVars(this);
            const toggleItems = ensureToggleItems(this);
            const structureHash = buildToggleLayoutHash(this, { mW, mH, oY }, toggleItems);

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            const deckRegions = {};
            const deckItems = toggleItems.map((item, idx) => ({ item, idx }));
            let floatingItem = null;

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingItem] = deckItems.splice(d.index, 1);
                const ghost = { ...floatingItem, isPreviewGhost: true };
                deckItems.splice(pIdx, 0, ghost);
            }

            deckItems.forEach((entry, displayIdx) => {
                const { item, idx } = entry;
                const rowKey = `toggleRow_${idx}`;
                const isPickedUp = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === idx && !entry.isPreviewGhost);
                const rowMarginBottom = displayIdx < (deckItems.length - 1) ? sH : 0;

                deckRegions[rowKey] = {
                    dir: "row", width: "full", height: "auto",
                    spacing: [0, sH],
                    margin: [0, 0, 0, rowMarginBottom],
                    onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                    onDrag: (e, data) => { updateStackDrag(this, data, "toggleRow_", toggleItems.length); this.refreshNodeLayoutMap(); },
                    onDragEnd: () => endStackDrag(this, "toggleItems"),
                    onPress: () => toggleDerpToggleItem(this, idx),
                    regionOffset: [0, 0],
                    [`btnToggle_${idx}`]: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "button, t_textNormal", mouseOver: false,
                        text: item.label || getDefaultToggleItemLabel(idx),
                        state: item.value !== false ? "ON" : "OFF",
                        visualState: isToggleUsedByRemoteBypass(this, idx) ? undefined : "DIS",
                        alpha: entry.isPreviewGhost ? 0 : 1.0,
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                        labelAlign: ["center", "middle"],
                        noShrink: false,
                        onDragStart: (e, data) => startStackDrag(this, data, idx, rowKey),
                        onDrag: (e, data) => { updateStackDrag(this, data, "toggleRow_", toggleItems.length); this.refreshNodeLayoutMap(); },
                        onDragEnd: () => endStackDrag(this, "toggleItems"),
                        onPress: () => toggleDerpToggleItem(this, idx),
                        onContextMenu: () => {
                            showBastaToggle(this, `btnToggle_${idx}`);
                            return false;
                        }
                    }
                };
            });

            if (floatingItem && this._dragThresholdMet && this._dragMouse && this._dragOffset) {
                const { item, idx } = floatingItem;
                const dragX = this._dragMouse[0] - this._dragOffset[0];
                const dragY = this._dragMouse[1] - this._dragOffset[1];
                const sourceRow = this.layout?.regions?.[`toggleRow_${idx}`];
                const floatingRowWidth = sourceRow?.w || (this.size[0] - (mW * 2));
                const floatingRowHeight = sourceRow?.h || "auto";

                deckRegions.floatingToggleRow = {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    dir: "row",
                    width: floatingRowWidth,
                    height: floatingRowHeight,
                    ignoreLayout: true,
                    x: dragX,
                    y: dragY,
                    zIndex: 100,
                    state: item.value !== false ? "ON" : "OFF",
                    spacing: [0, sH],
                    ignoreNodeBoundsClamp: true,
                    corners: sourceRow?.corners,
                    regionOffset: [0, 0],
                    floatingToggle: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "button, t_textNormal",
                        text: item.label || getDefaultToggleItemLabel(idx),
                        state: item.value !== false ? "ON" : "OFF",
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                        labelAlign: ["center", "middle"],
                        noShrink: false,
                    }
                };
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [mW, 0, mW, 0],
                    ...deckRegions,
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpToggleSysMap = function() {
            const { mW, mH, oY, pW, pH } = this.getDerpVars(this);
            const toggleItems = ensureToggleItems(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, 0, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_toggle.system.properties", "Derp Toggle properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    lblState: {
                        anchor: { target: "lblTitle", axis: "y", offset: oY },
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        text: `${tLocale("$derp_toggle.system.output_bool", "Output BOOL:")} ${toggleItems.map((item) => item.value !== false ? tLocale("$derp_toggle.states.true", "TRUE") : tLocale("$derp_toggle.states.false", "FALSE")).join(" | ")}`,
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        mouseOver: false,
                    },
                    layoutSpacer: {
                        anchor: { target: "lblState", axis: "y", offset: oY },
                    }
                }
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.broadcastWirelessSignal = function() {
            if (!this.transmitDerpSignal || this.id === -1) return;

            const toggleItems = ensureToggleItems(this);
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            const nodeName = this.titleLabel || this.title || tLocale("$derp_toggle.title", "Derp Toggle");
            const signalItems = [...toggleItems]
                .sort((a, b) => (Number(a?.signalIndex) || 0) - (Number(b?.signalIndex) || 0));
            const fingerprint = `${isBypassed ? "bypass" : "live"}_${nodeName}_${this.id}_${signalItems.map((item) => `${item?.signalIndex}:${item?.label || ""}:${item?.value !== false}`).join("|")}`;
            if (this._lastSignalFingerprint === fingerprint) return;
            this._lastSignalFingerprint = fingerprint;

            if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
            let hasChanged = false;

            signalItems.forEach((item) => {
                const signalIndex = Number(item?.signalIndex) || 0;
                const signalId = `${this.id}:${signalIndex}`;
                const finalValue = isBypassed ? null : (item.value !== false);
                const displayName = `${nodeName} [${item.label || getDefaultToggleItemLabel(signalIndex)}]`;
                const existing = window.xcpDerpSignals[signalId];
                if (!existing || existing.value !== finalValue || existing.nodeName !== displayName || existing.type !== "bool") {
                    hasChanged = true;
                    window.xcpDerpSignals[signalId] = {
                        nodeId: signalId,
                        nodeName: displayName,
                        nodeType: this.type,
                        type: isBypassed ? "null" : "bool",
                        value: finalValue,
                        upstreamIds: [],
                        timestamp: Date.now(),
                        isPureVirtual: true
                    };

                    setTimeout(() => {
                        fetch("/xcp/update_signal", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ node_id: signalId, value: finalValue })
                        });
                    }, 50);
                }
            });

            if (typeof window.xcpApplyRemoteBypassGroups === "function") window.xcpApplyRemoteBypassGroups();
            if (hasChanged) refreshWirelessSignalConsumers();
        };

        nodeType.prototype.syncDerpOutputs = function() {
            const toggleItems = ensureToggleItems(this);
            const signalItems = [...toggleItems]
                .sort((a, b) => (Number(a?.signalIndex) || 0) - (Number(b?.signalIndex) || 0));
            const activeSignalIds = new Set(signalItems.map((item) => `${this.id}:${Number(item?.signalIndex) || 0}`));

            if (window.xcpDerpSignals) {
                Object.keys(window.xcpDerpSignals).forEach((key) => {
                    if (!key.startsWith(`${this.id}:`)) return;
                    if (!activeSignalIds.has(key)) delete window.xcpDerpSignals[key];
                });
            }

            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach((o) => { if (o.links) o.links = null; });
                this.outputs = [];
            } else {
                this.outputs = [];
            }

            const firstSignalItem = signalItems[0];
            this.properties.signalName = firstSignalItem?.label || getDefaultToggleLabel();
            this.properties.toggleState = firstSignalItem?.value !== false;

            if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this._ignoreHeaderWidthFloor = true;
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            this.titleLabel = tLocale("$derp_toggle.title", "Derp Toggle");
            this.properties.titleLabel = tLocale("$derp_toggle.title", "Derp Toggle");
            this.properties.toggleState = true;
            this.properties.outputName = tLocale("$derp_toggle.output", "BOOL_OUT");
            this.properties.signalName = getDefaultToggleLabel();
            this.properties.toggleItems = [{ label: getDefaultToggleLabel(), value: true, signalIndex: 0 }];
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [150, 50];
            this.size = [150, 50];

            syncDerpToggleLocaleLabels(this);

            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();

            setTimeout(() => {
                if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                    this.syncDerpOutputs();
                }
            }, 1);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this._ignoreHeaderWidthFloor = true;
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            ensureToggleItems(this);
            syncDerpToggleLocaleLabels(this);

            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach((o) => { if (o.links) o.links = null; });
                this.outputs = [];
            }

            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();
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
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                this.refreshNodeLayoutMap();
                this.refreshDerpToggleSysMap();
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