/**
 * Path: ./js/fatha/nodes/derpTriggerWall.js
 * STATUS: VIRTUAL FATHA COMPLIANT | Refactored Core Logic
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { settleDerpSizeBeforeDraw } from "../fatha/core/fathaHandler.js";
import { isLinearDeckGroup, isNodeDocked } from "../fatha/core/masterDockEngine.js";
import { startStackDrag } from "../fatha/helpers/fathaDragDrop.js";
import { COMPONENT_BLUEPRINTS } from "../fatha/core/masterLayoutTypes.js";
import {
    triggerWall_syncOutputs,
    triggerWall_onNodeCreated,
    triggerWall_onConfigure,
    triggerWall_onDrawForeground,
    triggerWall_onDeselected,
    triggerWall_onLoadPreset,
    triggerWall_updatePresetList,
    triggerWall_onThemeUpdate,
    triggerWall_applyPalette,
    triggerWall_addGroup,
    triggerWall_itemDragStart,
    triggerWall_itemDrag,
    triggerWall_itemDragEnd,
    triggerWall_itemPress,
    triggerWall_itemContextMenu,
    triggerWall_addTrigger,
    triggerWall_toggleRegion,
    triggerWall_renameGroup,
    triggerWall_changeGroupTemplate,
    triggerWall_addGroupTemplate,
    triggerWall_removeGroup,
    triggerWall_confirmRemoveGroup,
    triggerWall_toggleExclusive,
    triggerWall_toggleShowWeight,
    triggerWall_toggleAddAlways,
    triggerWall_isGroupDuplicate,
    triggerWall_hasProfileGroup,
    triggerWall_hasGroupTextChanges,
    triggerWall_addSelectedGroupToProfile,
    triggerWall_saveGroupToProfile,
    triggerWall_saveCurrentProfile,
    triggerWall_onDerpSysPanelOpen,
    triggerWall_onResize,
    triggerWall_groupDrag,
    triggerWall_groupDragEnd
} from "./core/derpTriggerWall_core.js";

function dockDebug(label, payload = {}) {
    if (!globalThis?.DERP_DOCK_RESIZE_DEBUG) return;
    globalThis.DERP_DOCK_RESIZE_LOGS = globalThis.DERP_DOCK_RESIZE_LOGS || [];
    const entry = { label, payload, time: Date.now() };
    globalThis.DERP_DOCK_RESIZE_LOGS.push(entry);
    if (globalThis.DERP_DOCK_RESIZE_LOGS.length > 500) globalThis.DERP_DOCK_RESIZE_LOGS.shift();
}

function twPerfDebug(label, payload = {}) {
    globalThis.DERP_TW_PROFILE_LOGS = globalThis.DERP_TW_PROFILE_LOGS || [];
    const entry = { label, payload, time: Date.now() };
    globalThis.DERP_TW_PROFILE_LOGS.push(entry);
    if (globalThis.DERP_TW_PROFILE_LOGS.length > 300) globalThis.DERP_TW_PROFILE_LOGS.shift();
    if (globalThis.DERP_TW_PROFILE_CONSOLE === true) {
        console.log(`[TWPerf:${label}] ${JSON.stringify(payload)}`);
    }
}

function snapshotDockNode(node) {
    if (!node) return null;
    return {
        id: node.id,
        type: node.type,
        title: node.titleLabel || node.title,
        pos: [...(node.pos || [])],
        size: [...(node.size || [])],
        nodeSize: [...(node.properties?.nodeSize || [])],
        autoWidth: node.properties?.autoWidth,
        autoHeight: node.properties?.autoHeight,
        pinActive: node.properties?.pinActive === true,
        contentCollapsed: node.properties?.contentCollapsed === true,
        contentMinWidth: node.layout?.contentMinWidth,
        contentMinHeight: node.layout?.contentMinHeight,
        totalHeight: node.layout?.totalHeight,
        deckParentId: node.properties?.deckParentId,
        deckDockSide: node.properties?.deckDockSide,
        deckEdges: { ...(node.properties?.deckEdges || {}) },
    };
}

function ensureTWPerfState(node) {
    if (!node) return;
    if (!node._twPerf) {
        node._twPerf = {
            windowStart: performance.now(),
            refreshCount: 0,
            syncReqCount: 0,
            dirtyCount: 0,
            hashHitCount: 0,
            hashMissCount: 0,
            measureCount: 0,
            floatingDrawCount: 0,
            drawCount: 0,
            drawMs: 0,
            triggerWidgetCount: 0,
            triggerWidgetMs: 0
        };
    }
}

function flushTWPerfWindow(node, force = false) {
    if (!node || !window.DERP_TW_PROFILE) return;
    ensureTWPerfState(node);
    const now = performance.now();
    const elapsed = Math.max(0.001, (now - node._twPerf.windowStart) / 1000);
    if (!force && elapsed < 1) return;
    const perSec = (v) => Math.round(v / elapsed);
    twPerfDebug("window", {
        title: node.titleLabel || node.title || "TriggerWall",
        refreshPerSec: perSec(node._twPerf.refreshCount),
        hashHitPerSec: perSec(node._twPerf.hashHitCount),
        hashMissPerSec: perSec(node._twPerf.hashMissCount),
        measurePerSec: perSec(node._twPerf.measureCount),
        syncReqPerSec: perSec(node._twPerf.syncReqCount),
        dirtyPerSec: perSec(node._twPerf.dirtyCount),
        floatingDrawPerSec: perSec(node._twPerf.floatingDrawCount),
        drawPerSec: perSec(node._twPerf.drawCount),
        avgDrawMs: Number((node._twPerf.drawCount > 0 ? node._twPerf.drawMs / node._twPerf.drawCount : 0).toFixed(2)),
        triggerWidgetsPerSec: perSec(node._twPerf.triggerWidgetCount),
        avgTriggerMs: Number((node._twPerf.triggerWidgetCount > 0 ? node._twPerf.triggerWidgetMs / node._twPerf.triggerWidgetCount : 0).toFixed(3)),
    });
    node._twPerf.windowStart = now;
    node._twPerf.refreshCount = 0;
    node._twPerf.syncReqCount = 0;
    node._twPerf.dirtyCount = 0;
    node._twPerf.hashHitCount = 0;
    node._twPerf.hashMissCount = 0;
    node._twPerf.measureCount = 0;
    node._twPerf.floatingDrawCount = 0;
    node._twPerf.drawCount = 0;
    node._twPerf.drawMs = 0;
    node._twPerf.triggerWidgetCount = 0;
    node._twPerf.triggerWidgetMs = 0;
}

function getTWPerfNodeSet() {
    if (!window._DERP_TW_PERF_NODES) window._DERP_TW_PERF_NODES = new Set();
    return window._DERP_TW_PERF_NODES;
}

function ensureTWPerfHeartbeat() {
    if (window._DERP_TW_PERF_HEARTBEAT_ID) return;
    window._DERP_TW_PERF_HEARTBEAT_ID = window.setInterval(() => {
        if (!window.DERP_TW_PROFILE) return;
        getTWPerfNodeSet().forEach((node) => {
            if (!node || node.graph == null) return;
            flushTWPerfWindow(node, true);
        });
    }, 1000);
}

function registerTWPerfNode(node) {
    if (!node) return;
    ensureTWPerfState(node);
    getTWPerfNodeSet().add(node);
    ensureTWPerfHeartbeat();
}

function unregisterTWPerfNode(node) {
    if (!node || !window._DERP_TW_PERF_NODES) return;
    window._DERP_TW_PERF_NODES.delete(node);
}

function bumpTWPerfCounter(node, key) {
    if (!node) return;
    if (!window.DERP_TW_PROFILE) return;
    ensureTWPerfState(node);
    if (key === "refresh") node._twPerf.refreshCount++;
    if (key === "sync") node._twPerf.syncReqCount++;
    if (key === "dirty") node._twPerf.dirtyCount++;
    if (key === "hashHit") node._twPerf.hashHitCount++;
    if (key === "hashMiss") node._twPerf.hashMissCount++;
    if (key === "measure") node._twPerf.measureCount++;
    if (key === "floatingDraw") node._twPerf.floatingDrawCount++;
    if (key === "draw") node._twPerf.drawCount++;
    if (key === "triggerWidget") node._twPerf.triggerWidgetCount++;
}

function bumpTWPerfDraw(node, elapsedMs) {
    if (!node || !window.DERP_TW_PROFILE) return;
    bumpTWPerfCounter(node, "draw");
    if (node._twPerf) node._twPerf.drawMs += elapsedMs;
}

function bumpTWPerfSource(node, key) {
    if (!node || !window.DERP_TW_PROFILE_SOURCES) return;
    if (!node._twPerfSources) node._twPerfSources = { windowStart: performance.now(), dirty: new Map(), sync: new Map() };
    const bucket = node._twPerfSources[key];
    if (!bucket) return;
    const stack = new Error().stack || "";
    const signature = stack
        .split("\n")
        .slice(3, 8)
        .map((line) => line.trim().replace(/^at\s+/, ""))
        .join(" <- ");
    bucket.set(signature, (bucket.get(signature) || 0) + 1);

    const now = performance.now();
    if (now - node._twPerfSources.windowStart < 1000) return;
    const formatTop = (map) => [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([source, count]) => `${count}/s ${source}`);
    const dirtySources = formatTop(node._twPerfSources.dirty);
    const syncSources = formatTop(node._twPerfSources.sync);
    twPerfDebug("source-window", {
        title: node.titleLabel || node.title || "TriggerWall",
        dirtySources,
        syncSources,
    });
    node._twPerfSources.windowStart = now;
    node._twPerfSources.dirty.clear();
    node._twPerfSources.sync.clear();
}

function captureFloatingPreviewRegions(node, rootKey) {
    if (!node?.layout?.regions?.[rootKey]) return null;
    const regions = node.layout.regions;
    const captured = {};
    const visit = (key) => {
        const reg = regions[key];
        if (!reg || captured[key]) return;
        captured[key] = {
            ...reg,
            geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h }
        };
        for (const [childKey, childReg] of Object.entries(regions)) {
            if (childReg?.parentKey === key) visit(childKey);
        }
    };
    visit(rootKey);
    return captured;
}

function drawFloatingPreview(node, ctx) {
    const snapshot = node?._floatingPreviewSnapshot;
    const dragMouse = node?._dragMouse;
    const dragOffset = node?._dragOffset;
    if (!snapshot || !dragMouse || !dragOffset) return;

    const rootKey = snapshot.rootKey;
    const rootReg = snapshot.regions?.[rootKey];
    if (!rootReg) return;
    bumpTWPerfCounter(node, "floatingDraw");

    const targetX = dragMouse[0] - dragOffset[0];
    const targetY = dragMouse[1] - dragOffset[1];
    const dx = targetX - rootReg.x;
    const dy = targetY - rootReg.y;

    const entries = Object.entries(snapshot.regions)
        .filter(([, reg]) => !!reg?.type)
        .sort(([, a], [, b]) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));

    for (const [key, reg] of entries) {
        const blueprint = COMPONENT_BLUEPRINTS[reg.type];
        if (!blueprint || blueprint.isHtml) continue;
        const compData = {
            ...reg,
            key,
            x: reg.x + dx,
            y: reg.y + dy,
            geometry: { x: reg.x + dx, y: reg.y + dy, w: reg.w, h: reg.h },
            zIndex: (Number(reg.zIndex) || 0) + 1000
        };
        if (blueprint.isHybrid) blueprint.sync(ctx, node, app, compData);
        else blueprint.sync(ctx, node, compData);
    }
}

app.registerExtension({
    name: "xcp.derpTriggerWall_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("triggerwall")) return;

        if (globalThis.DERP_TW_PROFILE_CONSOLE === true) {
            console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);
            if (window.DERP_TW_PROFILE) {
                console.log("[TWPerf] profiler active (set window.DERP_TW_PROFILE = false to disable)");
            }
        }

        // Initialize the Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 200);

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            triggerWall_onThemeUpdate(this, config);
        };

        nodeType.prototype.applyPalette = function() {
            triggerWall_applyPalette(this);
        };

        nodeType.prototype.onDerpSettingsPress = function() {
            this.refreshNodeLayoutMap();
        };

        const originalRequestDerpSync = nodeType.prototype.requestDerpSync;
        nodeType.prototype.requestDerpSync = function() {
            bumpTWPerfCounter(this, "sync");
            bumpTWPerfSource(this, "sync");
            if (originalRequestDerpSync) return originalRequestDerpSync.apply(this, arguments);
        };

        const originalSetDirtyCanvas = nodeType.prototype.setDirtyCanvas;
        nodeType.prototype.setDirtyCanvas = function() {
            bumpTWPerfCounter(this, "dirty");
            bumpTWPerfSource(this, "dirty");
            if (originalSetDirtyCanvas) return originalSetDirtyCanvas.apply(this, arguments);
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (!this.layout || !this.getDerpVars) return;
            bumpTWPerfCounter(this, "refresh");

            const varsForClamp = this.getDerpVars ? this.getDerpVars(this) : null;
            const SNAP = Math.max(1, Number(varsForClamp?.SNAP) || 1);
            const propMinW = Number(this.properties?.minWidth) || 200;
            const padL = this._padL || 0;
            const padR = this._padR || 0;
            const contentMinW = this.layout?.contentMinWidth || propMinW;
            const minW = Math.ceil(Math.max(propMinW, contentMinW + padL + padR) / SNAP) * SNAP;
            const rawW = this.size?.[0] || 0;
            const clampedW = Math.max(minW, rawW);
            if (rawW !== clampedW) {
                this.size[0] = clampedW;
                if (this.properties?.nodeSize) this.properties.nodeSize[0] = clampedW;
            }

            // ZERO-INFERENCE GATING: Early return if structure and size haven't changed
            const groupsForHash = (this._triggerGroupData || []).filter(g => !g.hidden);
            let currentHash = `${clampedW.toFixed(2)}_${(this._triggerGroupData || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`])}_${this._dropPreviewIdx}_${this._dragTrig?.tIdx}_${this._dragTrig?.index}_${this._dragThresholdMet}_${this._dragMouse?.join(",")}`;
            groupsForHash.forEach(g => {
                currentHash += `|${g.id}_${g.title}_${g.isExclusive}_${g.hidden || false}`;
                g.triggers.forEach(t => { currentHash += `:${t.id}_${t.active}_${t.weight}_${t.label}_${t.disabled}_${t.hidden || false}`; });
            });
            const presetItems = this._presetItems || [];
            const presetSortKey = presetItems.join("\u0001");

            // Include preset list state so the file browser rebuilds when async preset data arrives.
            currentHash += `|${this.properties.showWeight}_${this.properties.toggleAddAlways}_${this.properties.drawHeader}_${this.properties.settingActive}_${this.properties.lastSavedPreset || ""}_${presetSortKey}`;
            currentHash += `|modal:${this._triggerWallModalOpen === true ? 1 : 0}:${this._activeModalItemKey || ""}`;

            if (this._layoutMapHash === currentHash && this.layoutMap) {
                bumpTWPerfCounter(this, "hashHit");
                return;
            }
            bumpTWPerfCounter(this, "hashMiss");
            this._layoutMapHash = currentHash;

            const triggerPadW = 1, triggerPadH = 1;
            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

            if (!this._triggerGroupData || this._triggerGroupData.filter(g => !g.hidden).length === 0) {
                const legacy = (this.properties.triggers || [{ active: true }]).map(t => ({
                    id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                    weight: 1.0,
                    ...t
                }));
                this._triggerGroupData = [{
                    id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                    title: this.properties.regionTitle || "Trigger Group 1",
                    triggers: legacy,
                    isExclusive: false
                }];
                this.properties.triggers = [];
            }

            const visibleGroupEntriesBase = (this._triggerGroupData || [])
                .map((group, gIdx) => ({ group, gIdx }))
                .filter(({ group }) => !group.hidden);
            const groups = visibleGroupEntriesBase.map(({ group }) => group);
            const activeTitles = groups.map(g => g.title);
            const selectedGroupOriginalIdx = (this._triggerGroupData || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`]);
            const selectedGroup = selectedGroupOriginalIdx !== -1 ? this._triggerGroupData[selectedGroupOriginalIdx] : null;
            const anySelected = selectedGroup !== null;
            const visibleGroupIndices = visibleGroupEntriesBase.map(({ gIdx }) => gIdx);
            const visibleGroupEntries = [...visibleGroupEntriesBase];
            let floatingGroupEntry = null;

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined && this._dragTrig.regionKey && !this._floatingPreviewSnapshot) {
                this._floatingPreviewSnapshot = {
                    rootKey: this._dragTrig.regionKey,
                    regions: captureFloatingPreviewRegions(this, this._dragTrig.regionKey)
                };
            }

            if (this._dragTrig && this._dragThresholdMet && this._dragTrig.index !== undefined) {
                const d = this._dragTrig;
                const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.index;
                [floatingGroupEntry] = visibleGroupEntries.splice(d.index, 1);
                if (floatingGroupEntry) {
                    visibleGroupEntries.splice(pIdx, 0, { ...floatingGroupEntry, isPreviewGhost: true });
                }
            }

            const buildGroupRows = (group, gIdx, isSelected, options = {}) => {
                const {
                    groupWidgetAlpha = 1,
                    renderGhostPlaceholders = false,
                    rowAnchorPrefix = "triggerRow",
                    firstRowAnchorTarget = `lineBreak_${gIdx}`,
                    itemPressEnabled = true,
                    itemDragEnabled = true,
                    addPressEnabled = true
                } = options;

                let curR = 0;
                let curW = 0;
                const nodeW = Math.round(clampedW || 150);
                const marginX = (mW * 4);
                const maxW = nodeW - marginX;
                const triggerRows = {};

                let items = [
                    ...(group.triggers || []).map((trig, idx) => ({ type: "trig", trig, idx })).filter(i => !i.trig.hidden),
                    { type: "add" }
                ];
                if (itemDragEnabled && this._dragTrig && this._dragTrig.gIdx === gIdx) {
                    const d = this._dragTrig;
                    const pIdx = (this._dropPreviewIdx !== undefined) ? this._dropPreviewIdx : d.tIdx;
                    const [moved] = items.splice(d.tIdx, 1);
                    moved.isTriggerPreviewGhost = true;
                    items.splice(pIdx, 0, moved);
                }

                const trigGroups = items.reduce((acc, item) => {
                    let tw = 0;
                    if (item.type === "trig") {
                        bumpTWPerfCounter(this, "measure");
                        tw = Math.ceil(this.layout.measure({
                            type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "panel, button, t_textsmall",
                            text: item.trig.label || "Trigger Test", width: "auto", height: "auto",
                            padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                            showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0
                        }, { textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData }));
                    } else {
                        const showAdd = isSelected || this.properties.toggleAddAlways;
                        if (showAdd) bumpTWPerfCounter(this, "measure");
                        tw = showAdd ? Math.ceil(this.layout.measure({
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                            icon: "add", width: "auto", height: "match", minHeight: 22, baseHeight: 22, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0]
                        }, { textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData })) : 0;
                    }

                    item.measuredW = tw;

                    const spacing = acc[curR].length > 0 ? sW : 0;
                    if (curW + tw + spacing > maxW && acc[curR].length > 0) {
                        curR++;
                        curW = 0;
                    }

                    if (!acc[curR]) acc[curR] = [];
                    acc[curR].push(item);
                    curW += (acc[curR].length > 1 ? sW : 0) + tw;
                    return acc;
                }, [[]]);

                trigGroups.forEach((gItems, rIdx) => {
                    const isLastRow = rIdx === trigGroups.length - 1;
                    triggerRows[`${rowAnchorPrefix}_${gIdx}_${rIdx}`] = {
                        anchor: { target: rIdx === 0 ? firstRowAnchorTarget : `${rowAnchorPrefix}_${gIdx}_${rIdx - 1}`, axis: "y", offset: sH },
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0], minWidth: 0,
                        margin: [-mW / 2, 0, -mW / 2, isLastRow ? mH + 2 : 0],
                        ...Object.fromEntries(gItems.map(item => {
                            if (renderGhostPlaceholders) {
                                const placeholderKey = item.type === "trig"
                                    ? (rowAnchorPrefix === "triggerRow" ? `triggerItem_${gIdx}_${item.idx}` : `${rowAnchorPrefix}Item_${gIdx}_${item.idx}`)
                                    : (rowAnchorPrefix === "triggerRow" ? `btnAdd_${gIdx}` : `${rowAnchorPrefix}Add_${gIdx}`);
                                return [placeholderKey, {
                                    type: this.UI_TYPES.REGION,
                                    themeKey: "region",
                                    alpha: 0,
                                    hoverEffect: false,
                                    width: item.measuredW || trigHeight,
                                    height: trigHeight,
                                    margin: [0, 0],
                                    padding: [0, 0]
                                }];
                            }

                            if (item.type === "trig") {
                                const isModalActive = this._triggerWallModalOpen === true && this._activeModalItemKey === `triggerItem_${gIdx}_${item.idx}`;
                                const triggerEnabled = !isBypassed && item.trig.disabled !== true;
                                const triggerActive = item.trig.active && triggerEnabled;
                                const triggerItemKey = rowAnchorPrefix === "triggerRow" ? `triggerItem_${gIdx}_${item.idx}` : `${rowAnchorPrefix}Item_${gIdx}_${item.idx}`;
                                return [triggerItemKey, {
                                    type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "panel, button, t_textsmall",
                                    text: item.trig.label || "Trigger Test", mouseOver: false,
                                    width: "auto", height: "auto", padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                                    showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0,
                                    alpha: groupWidgetAlpha,
                                    value: item.trig.active,
                                    state: isModalActive ? "ON" : ((isBypassed || item.trig.disabled === true) ? "DIS" : "OFF"),
                                    disabled: item.trig.disabled === true,
                                    bodyPaint: item.isTriggerPreviewGhost ? this._buttonPaintData_DIS : (isModalActive ? this._panelPaintData_ON : (triggerActive ? this._panelPaintData : this._panelPaintData_DIS)),
                                    slotPaint: isModalActive ? this._buttonPaintData_ON : (triggerActive ? this._buttonPaintData : this._buttonPaintData_DIS),
                                    labelPaint: isModalActive ? this._t_textSmallPaintData_ON : (triggerActive ? this._t_textSmallPaintData : this._t_textSmallPaintData_DIS),
                                    onDragStart: itemDragEnabled ? ((e, data) => triggerWall_itemDragStart(this, e, data, gIdx, item.idx)) : undefined,
                                    onDrag: itemDragEnabled ? ((e, data) => triggerWall_itemDrag(this, e, data)) : undefined,
                                    onDragEnd: itemDragEnabled ? ((e, data) => triggerWall_itemDragEnd(this, e, data)) : undefined,
                                    onPress: itemPressEnabled ? ((e, data) => triggerWall_itemPress(this, e, data, gIdx, item.idx, group, isBypassed)) : undefined,
                                    onContextMenu: itemPressEnabled ? ((e) => triggerWall_itemContextMenu(this, e, gIdx, item.idx, group, isBypassed)) : undefined
                                }];
                            }

                            const addItemKey = rowAnchorPrefix === "triggerRow" ? `btnAdd_${gIdx}` : `${rowAnchorPrefix}Add_${gIdx}`;
                            return [addItemKey, {
                                type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                                icon: "add", width: "match", height: trigHeight, padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0],
                                alpha: groupWidgetAlpha,
                                hidden: !(this.properties.toggleAddAlways || isSelected),
                                onPress: addPressEnabled ? (() => triggerWall_addTrigger(this, group)) : undefined
                            }];
                        }))
                    };
                });

                return triggerRows;
            };

            const buildGroupRegion = (group, gIdx, regionKey, isSelected, options = {}) => {
                const {
                    isPreviewGhost = false,
                    isFloating = false,
                    childKeyPrefix = "",
                    rowAnchorPrefix = "triggerRow",
                    firstRowAnchorTarget = (!this.properties.settingActive && !isSelected) ? regionKey : `${childKeyPrefix}lineBreak_${gIdx}`,
                    groupWidgetAlpha = isPreviewGhost ? 0 : 1,
                    renderGhostPlaceholders = isPreviewGhost,
                    itemPressEnabled = !isFloating,
                    itemDragEnabled = !isFloating,
                    addPressEnabled = !isFloating,
                    headerPressEnabled = !isFloating,
                    regionProps = {}
                } = options;

                const triggerRows = buildGroupRows(group, gIdx, isSelected, {
                    groupWidgetAlpha,
                    renderGhostPlaceholders,
                    rowAnchorPrefix,
                    firstRowAnchorTarget,
                    itemPressEnabled,
                    itemDragEnabled,
                    addPressEnabled
                });

                return {
                    type: this.UI_TYPES.REGION,
                    themeKey: "region",
                    regionOffset: [mW, mH, mW, 0],
                    alpha: isPreviewGhost ? 0 : 1,
                    state: isFloating ? "ON" : (isSelected ? "ON" : (isBypassed ? "DIS" : "OFF")),
                    hoverEffect: false,
                    margin: [mW * 2, mH, mW * 2, mH],
                    width: "full",
                    height: "auto",
                    dir: "col",
                    minWidth: 0,
                    ...regionProps,
                    [`${childKeyPrefix}headerRegion_${gIdx}`]: {
                        alpha: isPreviewGhost ? 0 : 1,
                        hidden: !this.properties.settingActive && !isSelected,
                        dir: "row", width: "full", height: "auto", margin: [-mW, -mH, -mW, 0],
                        spacing: [sW, 0],
                        [`${childKeyPrefix}btnRename_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            width: "match", height: "fill", margin: [-sW, mH], spacing: [sW * 2, 0],
                            onPress: headerPressEnabled ? (() => triggerWall_renameGroup(this, group, gIdx)) : undefined
                        },
                        [`${childKeyPrefix}btnSave_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "save", themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            width: "match", height: "fill", margin: [0, mH, 0, mH], spacing: [sW, 0],
                            hidden: !triggerWall_hasProfileGroup(this, group),
                            state: isBypassed ? "DIS" : (triggerWall_hasGroupTextChanges(this, group) ? "OFF" : "DIS"),
                            onPress: headerPressEnabled ? (() => triggerWall_saveGroupToProfile(this, group, `${childKeyPrefix}btnSave_${gIdx}`)) : undefined
                        },
                        [`${childKeyPrefix}dropdownTriggerGroup_${gIdx}`]: {
                            type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                            alpha: isPreviewGhost ? 0 : 1,
                            indicator: true, canvasShield: true, mouseOver: false,
                            width: "full", height: "auto", spacing: [sW, 0],
                            padding: [pW, pH],
                            value: group.title || "Trigger Group",
                            items: [...(this._cachedPresetData?.triggerGroups || this._triggerGroupData || [])]
                                .filter(g => !activeTitles.includes(g.title) || g.title === group.title)
                                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                                .map(g => g.title || "Trigger Group"),
                            onChange: headerPressEnabled ? ((v) => triggerWall_changeGroupTemplate(this, group, v)) : undefined
                        },
                        [`${childKeyPrefix}btnAddTriggerToProfile_${gIdx}`]: {
                            type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                            alpha: isPreviewGhost ? 0 : 1,
                            text: "Add to Profile", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            hidden: triggerWall_isGroupDuplicate(this),
                            state: isBypassed ? "DIS" : "OFF",
                            onPress: headerPressEnabled ? (() => triggerWall_addSelectedGroupToProfile(this)) : undefined
                        },
                        [`${childKeyPrefix}btnRemoveGroup_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            icon: "close", width: "match", height: "fill", margin: [0, sH, -sW, sH],
                            hidden: this._triggerGroupData.length <= 1,
                            onPress: headerPressEnabled ? (() => triggerWall_confirmRemoveGroup(this, gIdx)) : undefined
                        }
                    },
                    [`${childKeyPrefix}lineBreak_${gIdx}`]: {
                        alpha: isPreviewGhost ? 0 : 1,
                        hidden: !this.properties.settingActive && !isSelected,
                        type: this.UI_TYPES.LINEBREAK, margin: [-mW * 2, 0, -mW * 2, sH]
                    },
                    ...triggerRows
                };
            };

            const textTheme = this._t_textSmallPaintData || this._t_textNormalPaintData || {};
            const trigHeight = (textTheme.fontSize || 10) + (triggerPadH * 2);

            if (this._sortedPresetItemsKey !== presetSortKey) {
                this._sortedPresetItemsKey = presetSortKey;
                this._sortedPresetItems = [...presetItems].sort((a, b) => String(a).localeCompare(String(b)));
            }

            const layoutMap = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", },
                    width: "full", height: "auto", dir: "col", padding: [0, 0], minWidth: 0,
                    margin: [mW, mH, mW, 0],
                }
            };

            layoutMap.groupControlRow1 = {
                anchor: { target: "contentRegion", axis: "y" },
                dir: "row", width: "full", height: "auto", margin: [mW, mH, mW, mH],
                addGroup: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textsmall", labelAlign: ["center", "middle"],
                    text: "New trigger group", width: "fit", padding: [pW, pH],
                    onPress: () => triggerWall_addGroup(this)
                },
                btnSaveTriggerGroup: {
                    type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textnormal",
                    icon: "save", width: "match", height: "fill", margin: [sW, 0, 0, 0],
                    state: "OFF",
                    onPress: () => {
                        if (triggerWall_saveCurrentProfile) {
                            triggerWall_saveCurrentProfile(this, "btnSaveTriggerGroup");
                        }
                    }
                },
                filebrowserTrigger: {
                    type: this.UI_TYPES.FILEBROWSER, themeKey: "button, t_textsmall", canvasShield: true,
                    text: this.properties.lastSavedPreset || "Load trigger profiles", mouseOver: false,
                    icon: this.properties.lastSavedPreset ? "file" : "folder",
                    width: "full", height: "fill", padding: [pW, pH], margin: [sW, 0, 0, 0],
                    items: this._sortedPresetItems || [],
                    indicator: true,
                    rootName: "Presets",
                    onChange: (val) => {
                        if (typeof triggerWall_onLoadPreset === "function") triggerWall_onLoadPreset(this, val);
                    }
                },
            };

            let lastRegionKey = "groupControlRow1";

            visibleGroupEntries.forEach((entry) => {
                const { group, gIdx, isPreviewGhost } = entry;
                const isGroupPreviewGhost = !!isPreviewGhost;
                const regionKey = `triggerRegion_${gIdx}`;
                const isSelected = !!this._selectedRegions?.[regionKey];
                layoutMap[regionKey] = buildGroupRegion(group, gIdx, regionKey, isSelected, {
                    isPreviewGhost: isGroupPreviewGhost,
                    childKeyPrefix: "",
                    rowAnchorPrefix: "triggerRow",
                    firstRowAnchorTarget: (!this.properties.settingActive && !isSelected) ? regionKey : `lineBreak_${gIdx}`,
                    regionProps: {
                        anchor: { target: lastRegionKey, axis: "y", offset: mH },
                        onDragStart: (e, data) => startStackDrag(this, data, visibleGroupIndices.indexOf(gIdx), regionKey),
                        onDrag: (e, data) => {
                            triggerWall_groupDrag(this, data, visibleGroupIndices);
                        },
                        onDragEnd: () => triggerWall_groupDragEnd(this),
                        onPress: () => {
                            triggerWall_groupDragEnd(this);
                            triggerWall_toggleRegion(this, regionKey);
                        }
                    }
                });
                lastRegionKey = regionKey;
            });

            const loadedDeckTitles = new Set(
                (this._triggerGroupData || [])
                    .filter(g => !g?.hidden)
                    .map(g => String(g?.title || "").trim())
                    .filter(Boolean)
            );

            const cachedTriggerGroupItems = [...(this._cachedPresetData?.triggerGroups || [])]
                .filter(g => {
                    const title = String(g?.title || "").trim();
                    if (!title) return false;
                    return !loadedDeckTitles.has(title);
                })
                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                .map(g => g.title || "Trigger Group");

            layoutMap.regionSelectTriggerGroup = {
                anchor: { target: lastRegionKey, axis: "y", offset: sH },
                dir: "row", width: "full", height: "auto", margin: [mW, 0, mW, mH],
                spacing: [sW, 0],
                dropdownTriggerGroup: {
                    type: this.UI_TYPES.DROPDOWN, themeKey: "button, t_textsmall", skipBackground: false,
                    indicator: true, canvasShield: true, mouseOver: false,
                    width: "full", height: "auto", spacing: [sW, 0],
                    padding: [pW, pH],
                    value: "Select Trigger Group",
                    items: cachedTriggerGroupItems,
                    state: isBypassed ? "DIS" : (cachedTriggerGroupItems.length > 0 ? "OFF" : "DIS"),
                    onChange: (v) => {
                        if (typeof triggerWall_addGroupTemplate === "function") triggerWall_addGroupTemplate(this, v);
                    }
                }
            };
            lastRegionKey = "regionSelectTriggerGroup";

            layoutMap.regionOption1 = {
                hidden: !anySelected,
                anchor: { target: lastRegionKey, axis: "y", offset: sH },
                dir: "row", width: "full", height: "auto", margin: [mW, 0, mW, mH],
                spacing: [sW, 0],
                toggleExclusive: {
                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "button, t_textSmall",
                    isTextOnly: true, mouseOver: false, cutoff: false,
                    text: "Mutually exclusive",
                    width: "auto", height: "auto", padding: [pW, pH],
                    value: !!selectedGroup?.isExclusive,
                    state: isBypassed ? "DIS" : (anySelected ? (selectedGroup.isExclusive ? "ON" : "OFF") : "DIS"),
                    onPress: () => triggerWall_toggleExclusive(this, selectedGroup, anySelected, isBypassed)
                },
                btnSaveToCurrent: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    text: "Save to current", width: "auto", height: "auto", padding: [pW, pH],
                    state: isBypassed ? "DIS" : (triggerWall_isGroupDuplicate(this) ? "DIS" : "OFF"),
                    onPress: () => triggerWall_addSelectedGroupToProfile(this)
                }
            };
            if (anySelected) lastRegionKey = "regionOption1";

            layoutMap.bottomSpacer = {
                anchor: { target: lastRegionKey, axis: "y" },
                width: "full", height: mH
            };

            this.layoutMap = layoutMap;

            if (this.layout) this.layout._lastCacheKey = "";
            dockDebug("triggerwall-refresh-layout", {
                node: snapshotDockNode(this),
                isDerpResizing: this._isDerpResizing === true,
                clampedW,
                groupCount: groups.length,
                selectedGroupOriginalIdx,
                lastRegionKey,
                selectRegion: layoutMap.regionSelectTriggerGroup,
                bottomSpacer: layoutMap.bottomSpacer,
            });
            const graph = this.graph || globalThis?.app?.graph || null;
            const suppressDockedVerticalSync = !!(graph && this.properties?.contentCollapsed !== true && this.properties?.autoHeight !== false && isNodeDocked(this, graph) && isLinearDeckGroup(this, graph, "vertical"));
            if (this._isDerpResizing) {
                settleDerpSizeBeforeDraw(this, {
                    preserveCurrentHeight: true,
                    suppressRequestSync: true,
                });
                this._forceSync = true;
                this._layoutDirty = true;
            } else if (suppressDockedVerticalSync) {
                this._forceSync = true;
                this._layoutDirty = true;
                if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
            } else {
                this.requestDerpSync();
            }
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTriggerWallSysMap = function() {
            const { mH, sH, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" }, margin: [0, mH], spacing: [0, sH],
                    width: "full", height: "auto",
                    regionOption1: {
                        dir: "row", width: "full", height: "auto",
                        toggleShowWeight: {
                            type: this.UI_TYPES.TOGGLE,
                            textThemeKey: "t_textsystem",
                            icon: "radio",
                            value: !!this.properties.showWeight,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: "Show Trigger Weight",
                            width: "auto", height: "fill",
                            padding: [pW, pH],
                            onPress: () => triggerWall_toggleShowWeight(this)
                        },
                        toggleAddAlways: {
                            type: this.UI_TYPES.TOGGLE, textThemeKey: "t_textSystem", icon: "radio",
                            value: !!this.properties.toggleAddAlways,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: "Add trigger button always visible",
                            width: "auto", height: "fill",
                            padding: [pW, pH],
                            onPress: () => triggerWall_toggleAddAlways(this)
                        },
                    },
                }
            };
        };

        nodeType.prototype.syncDerpOutputs = function() {
            triggerWall_syncOutputs(this);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            triggerWall_onDerpSysPanelOpen(this, panel);
        };

        nodeType.prototype.onResize = function(size) {
            triggerWall_onResize(this, size);
        };

        nodeType.prototype.settleAfterDockWidthMatch = function() {
            if (!this.layout || typeof settleDerpSizeBeforeDraw !== "function") return;
            settleDerpSizeBeforeDraw(this, {
                suppressRequestSync: true,
            });
            this._forceSync = true;
            this._layoutDirty = true;
        };

        const baseHandleInteraction = nodeType.prototype.handleShieldInteraction;
        nodeType.prototype.handleShieldInteraction = function(type, data) {
            if (type === "click" && this._suppressClickAfterDrag) {
                this._suppressClickAfterDrag = false;
                return true;
            }
            if (type === "resize") {
                const parsedMinW = Number(this.properties?.minWidth);
                const safeMinW = Number.isFinite(parsedMinW) && parsedMinW > 0 ? parsedMinW : 200;
                if (!this.properties) this.properties = {};
                this.properties.minWidth = safeMinW;
                if (this.layout) {
                    this.layout.contentMinWidth = Math.max(this.layout.contentMinWidth || 0, safeMinW);
                }
            }
            if (baseHandleInteraction) return baseHandleInteraction.apply(this, arguments);
            return false;
        };
        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            triggerWall_onNodeCreated(this, onCreated);
            registerTWPerfNode(this);
        };
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            triggerWall_onConfigure(this, info, onConfigure);
        };
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            unregisterTWPerfNode(this);
            if (onRemoved) onRemoved.apply(this);
        };
        nodeType.prototype.onDeselected = function() {
            triggerWall_onDeselected(this);
        };
        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (window.DERP_TW_PROFILE) registerTWPerfNode(this);
            const twDrawStart = window.DERP_TW_PROFILE ? performance.now() : 0;
            triggerWall_onDrawForeground(this, ctx, onDrawForeground);
            if (this._dragThresholdMet && this._floatingPreviewSnapshot) {
                drawFloatingPreview(this, ctx);
            }
            if (window.DERP_TW_PROFILE) bumpTWPerfDraw(this, performance.now() - twDrawStart);
        };
    }
});