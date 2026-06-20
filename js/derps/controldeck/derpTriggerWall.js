/**
 * Path: ./js/fatha/nodes/derpTriggerWall.js
 * STATUS: VIRTUAL FATHA COMPLIANT | Refactored Core Logic
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { settleDerpSizeBeforeDraw } from "../../fatha/core/fathaHandler.js";
import { applyDerpPreferredAutoHeight, resolveDerpRuntimeAutoHeight } from "../../fatha/core/derpHeightPolicy.js";
import { consumeSuppressedDragClick } from "../../fatha/core/derpInteractionPolicy.js";
import { isLinearDeckGroup, isNodeDocked } from "../../fatha/core/masterDockEngine.js";
import { setDerpNodeSizeCompat } from "../../fatha/core/fathaNode2Compat.js";
import { captureStackDragFloatingSnapshot, getStackDragFloatingTransform, startStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { COMPONENT_BLUEPRINTS } from "../../fatha/core/masterLayoutTypes.js";
import {
    triggerWall_syncOutputs,
    triggerWall_onNodeCreated,
    triggerWall_onConfigure,
    triggerWall_onDrawForeground,
    triggerWall_onDeselected,
    triggerWall_onLoadDeckProfile,
    ensureTriggerGroupData,
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

const TRIGGER_WALL_CLIP_VISIBLE_LIMIT_ITEMS = ["Auto", "50", "100", "150"];

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
    if (!node) return;
    ensureTWPerfState(node);
    const now = performance.now();
    const elapsed = Math.max(0.001, (now - node._twPerf.windowStart) / 1000);
    if (!force && elapsed < 1) return;
    const perSec = (v) => Math.round(v / elapsed);
    const summary = {
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
    };
    twPerfDebug("window", summary);
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
    if (!node) return;
    bumpTWPerfCounter(node, "draw");
    if (node._twPerf) node._twPerf.drawMs += elapsedMs;
}

function bumpTWPerfSource(node, key) {
    if (!node) return;
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
    const sourceSummary = {
        title: node.titleLabel || node.title || "TriggerWall",
        dirtySources,
        syncSources,
    };
    twPerfDebug("source-window", sourceSummary);
    node._twPerfSources.windowStart = now;
    node._twPerfSources.dirty.clear();
    node._twPerfSources.sync.clear();
}

function captureFloatingPreviewRegions(node, rootKey) {
    return captureStackDragFloatingSnapshot(node, rootKey)?.regions || null;
}

function drawFloatingPreview(node, ctx) {
    const snapshot = node?._floatingPreviewSnapshot;
    if (!snapshot) return;

    const rootKey = snapshot.rootKey;
    const transform = getStackDragFloatingTransform(node, snapshot, rootKey);
    if (!transform) return;
    const { dx, dy } = transform;
    bumpTWPerfCounter(node, "floatingDraw");

    const entries = Object.entries(snapshot.regions)
        .filter(([, reg]) => !!reg?.type)
        .sort(([, a], [, b]) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0));

    for (const [key, reg] of entries) {
        const blueprint = COMPONENT_BLUEPRINTS[reg.type];
        if (!blueprint) continue;
        if (blueprint.isHtml && !blueprint.isHybrid) {
            ctx.fillStyle = "rgba(60,60,60,0.85)"; ctx.fillRect(reg.x + dx, reg.y + dy, reg.w, reg.h); continue;
        }
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

function firstDiffIndex(a, b) {
    const s1 = String(a || "");
    const s2 = String(b || "");
    const minLen = Math.min(s1.length, s2.length);
    for (let i = 0; i < minLen; i++) {
        if (s1[i] !== s2[i]) return i;
    }
    return s1.length === s2.length ? -1 : minLen;
}

function normalizeTriggerLabelForHash(label) {
    return String(label ?? "").trim();
}

function normalizeTriggerWeightForHash(weight) {
    const w = Number(weight);
    if (!Number.isFinite(w)) return "1.000";
    return w.toFixed(3);
}

function normalizeTriggerWallClipVisibleLimit(value) {
    const raw = String(value ?? "Auto");
    if (TRIGGER_WALL_CLIP_VISIBLE_LIMIT_ITEMS.includes(raw)) return raw;
    if (raw === "1" || raw === "2" || raw === "20") return "50";
    if (raw === "3" || raw === "80") return "100";
    if (raw === "4" || raw === "5") return "150";
    return "Auto";
}

function getTriggerWallHeightModeItems() {
    return TRIGGER_WALL_CLIP_VISIBLE_LIMIT_ITEMS.map((value) => ({
        value,
        display: value === "Auto" ? "Fit Node" : `${value}px`,
    }));
}

function getTriggerWallClipVisibleLimit(node) {
    return normalizeTriggerWallClipVisibleLimit(node?.properties?.triggerWallClipVisibleLimit);
}

function getTriggerWallPixelClipHeight(node) {
    const value = getTriggerWallClipVisibleLimit(node);
    if (value === "Auto") return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : null;
}

function getRegionBottom(reg) {
    if (!reg) return 0;
    const marginB = Array.isArray(reg.margin) ? (reg.margin.length === 4 ? reg.margin[3] : (reg.margin[1] || 0)) : 0;
    return (Number(reg.y) || 0) + (Number(reg.h) || 0) + marginB;
}

function getTriggerWallFooterReserve(regions = {}) {
    const footer = regions.footerRegion;
    const systemBtn = regions.systemBtn;
    const footerMin = Number(footer?.minHeight || 0);
    const footerGap = Number(regions.footerGap?.h || 0);
    const systemBtnH = systemBtn ? Math.max(0, getRegionBottom(systemBtn) - (Number(systemBtn.y) || 0)) : 0;
    const footerBody = Math.max(footerMin, footerGap + systemBtnH, 0);
    return footerBody + footerGap;
}

function resolveTriggerWallAutoClipHeight(node, region, regions = {}, fullContentHeight = 0) {
    const nodeH = Number(node?.size?.[1] || node?.properties?.nodeSize?.[1] || 0);
    const regionY = Number(region?.y) || 0;
    if (nodeH <= 0 || regionY <= 0) return 0;

    const belowRegions = [regions.regionSelectTriggerGroup, regions.regionOption1, regions.bottomSpacer].filter(Boolean);
    if (fullContentHeight > 0) {
        const fullContentBottom = regionY + fullContentHeight;
        const fullLayoutBottom = belowRegions.reduce((max, reg) => Math.max(max, getRegionBottom(reg)), fullContentBottom);
        if (fullLayoutBottom + getTriggerWallFooterReserve(regions) <= nodeH + 0.5) return fullContentHeight;
    }
    const firstBelowY = belowRegions.reduce((min, reg) => Math.min(min, Number(reg.y) || min), Infinity);
    let fixedBelow = 0;
    if (Number.isFinite(firstBelowY)) {
        const lastBelowBottom = belowRegions.reduce((max, reg) => Math.max(max, getRegionBottom(reg)), firstBelowY);
        fixedBelow = Math.max(0, lastBelowBottom - firstBelowY);
    }
    const footerReserve = getTriggerWallFooterReserve(regions);
    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : null;
    const viewportGap = Math.max(0, Number(vars?.mH || 0));
    const available = nodeH - regionY - viewportGap - fixedBelow - viewportGap - footerReserve;
    if (!Number.isFinite(available) || available <= 0) return 0;
    const resolved = fullContentHeight > 0 ? Math.min(available, fullContentHeight) : available;
    return resolved;
}

function resolveTriggerWallGroupsClipHeight(node, region, regions = {}) {
    const groupKeys = Object.keys(regions).filter((key) => key.startsWith("triggerRegion_"));
    if (groupKeys.length > 0) {
        const pixelClipHeight = getTriggerWallPixelClipHeight(node);
        const visibleKeys = groupKeys.slice(0, 1);
        const top = Math.min(...visibleKeys.map((key) => Number(regions[key]?.y) || 0));
        const bottom = Math.max(...visibleKeys.map((key) => getRegionBottom(regions[key])));
        if (bottom > top) {
            const measuredHeight = bottom - top;
            if (pixelClipHeight !== null) return pixelClipHeight;
            const fullBottom = Math.max(...groupKeys.map((key) => getRegionBottom(regions[key])));
            const fullContentHeight = fullBottom > top ? fullBottom - top : measuredHeight;
            const autoHeight = resolveTriggerWallAutoClipHeight(node, region, regions, fullContentHeight);
            if (autoHeight > 0) return Math.max(measuredHeight, autoHeight);
            return measuredHeight;
        }
    }
    return Number(region?.h) || 180;
}

function resolveTriggerWallGroupsMinClipHeight(node, region, regions = {}) {
    const pixelClipHeight = getTriggerWallPixelClipHeight(node);
    if (pixelClipHeight !== null) return pixelClipHeight;
    const firstGroupKey = Object.keys(regions).find((key) => key.startsWith("triggerRegion_"));
    const firstGroup = firstGroupKey ? regions[firstGroupKey] : null;
    if (firstGroup) return Math.max(1, getRegionBottom(firstGroup) - (Number(firstGroup.y) || 0));
    return Number(region?.h) || 180;
}

function buildTriggerWallStructuralHash(node, params) {
    const {
        widthBucket,
        selectedIdx,
        dropPreviewIdx,
        dragTIdx,
        dragIndex,
        dragThreshold,
        showWeight,
        toggleAddAlways,
        drawHeader,
        settingActive,
        useGroupsViewport,
        clipVisibleLimit,
    } = params;

    const groupsForHash = (node._triggerGroupData || []).filter((g) => !g.hidden);
    const groupParts = groupsForHash.map((g) => {
        const trigParts = (g.triggers || [])
            .filter((t) => !t.hidden)
            .map((t) => {
                const tActive = t.active ? 1 : 0;
                const tDisabled = t.disabled ? 1 : 0;
                const tWeight = normalizeTriggerWeightForHash(t.weight);
                const tLabel = normalizeTriggerLabelForHash(t.label);
                return `${tActive}:${tDisabled}:${tWeight}:${tLabel}`;
            })
            .join(",");
        return `${g.isExclusive ? 1 : 0}:[${trigParts}]`;
    }).join("|");

    const useDragFields = !!dragThreshold;
    const hashDropPreviewIdx = useDragFields ? (dropPreviewIdx ?? "u") : "u";
    const hashDragTIdx = useDragFields ? (dragTIdx ?? "u") : "u";
    const hashDragIndex = useDragFields ? (dragIndex ?? "u") : "u";

    return [
        widthBucket,
        selectedIdx,
        hashDropPreviewIdx,
        hashDragTIdx,
        hashDragIndex,
        dragThreshold ? 1 : 0,
        showWeight ? 1 : 0,
        toggleAddAlways ? 1 : 0,
        drawHeader ? 1 : 0,
        settingActive ? 1 : 0,
        useGroupsViewport ? 1 : 0,
        clipVisibleLimit,
        groupParts,
    ].join("#");
}

app.registerExtension({
    name: "xcp.derpTriggerWall_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("triggerwall")) return;

        // --- PROFILE LOGIC (sys panel dropdown) ---
        nodeType.prototype.exportDerpProfile = function() {
            const groups = this._triggerGroupData || [];
            return {
                triggerGroups: groups.filter(g => !g.hidden).map(g => ({
                    id: g.id, title: g.title, isExclusive: !!g.isExclusive,
                    triggers: (g.triggers || []).filter(t => !t.hidden).map(t => ({
                        id: t.id, label: t.label, weight: t.weight, active: !!t.active
                    }))
                }))
            };
        };

        nodeType.prototype.applyDerpProfile = function(profileName) {
            if (!profileName || profileName === "(No Profiles Found)") return;
            const data = this._sysProfileData?.[profileName];
            if (data && data.triggerGroups) {
                ensureTriggerGroupData(this);
                this._triggerGroupData = data.triggerGroups.map(g => ({...g}));
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                if (this.refreshDerpTriggerWallSysMap) this.refreshDerpTriggerWallSysMap();
                this.requestDerpSync();
                if (this.syncDerpOutputs) this.syncDerpOutputs();
            }
        };

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
            // Keep width floor stable. Using live contentMinWidth here creates a feedback
            // loop (wrap -> min width changes -> node width changes -> wrap changes).
            // For TriggerWall we only enforce the explicit node minWidth floor.
            const minW = Math.ceil(Math.max(propMinW, propMinW + padL + padR) / SNAP) * SNAP;
            const rawW = this.size?.[0] || 0;
            const clampedW = Math.max(minW, rawW);
            if (rawW !== clampedW) {
                setDerpNodeSizeCompat(this, clampedW, Number(this.size?.[1] || this.properties?.nodeSize?.[1] || 0));
                if (this.properties?.nodeSize) this.properties.nodeSize[0] = clampedW;
            }

            const hashWidthBucket = Math.round(clampedW / 10) * 10;
            const selectedIdxForHash = (this._triggerGroupData || []).findIndex((g, gIdx) => !g.hidden && this._selectedRegions?.[`triggerRegion_${gIdx}`]);
            const presetItems = this._presetItems || [];
            const presetSortKey = presetItems.join("\u0001");
            const visibleGroupCountForHash = (this._triggerGroupData || []).filter((g) => !g.hidden).length;
            const clipVisibleLimit = getTriggerWallClipVisibleLimit(this);
            const pixelClipHeight = getTriggerWallPixelClipHeight(this);
            const useGroupsViewport = pixelClipHeight !== null ? visibleGroupCountForHash > 0 : visibleGroupCountForHash > 1;
            const currentHash = buildTriggerWallStructuralHash(this, {
                widthBucket: hashWidthBucket,
                selectedIdx: selectedIdxForHash,
                dropPreviewIdx: this._dropPreviewIdx,
                dragTIdx: this._dragTrig?.tIdx,
                dragIndex: this._dragTrig?.index,
                dragThreshold: (this._dragThresholdMet || this._dragTrig?.tIdx !== undefined),
                showWeight: this.properties.showWeight !== false,
                toggleAddAlways: !!this.properties.toggleAddAlways,
                drawHeader: !!this.properties.drawHeader,
                settingActive: !!this.properties.settingActive,
                useGroupsViewport,
                clipVisibleLimit,
            });
            this._triggerWallVisualHash = currentHash;

            const layoutHashChanged = this._layoutMapHash !== currentHash;
            if (!layoutHashChanged && this.layoutMap) {
                bumpTWPerfCounter(this, "hashHit");
                return;
            }
            bumpTWPerfCounter(this, "hashMiss");
            this._layoutMapHash = currentHash;

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            const triggerPadW = pW;
            const triggerPadH = pH;
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            if (!this._triggerMeasureCache) this._triggerMeasureCache = new Map();
            let measureCacheHits = 0;
            let measureCacheMisses = 0;

            if (!this._triggerGroupData || this._triggerGroupData.filter(g => !g.hidden).length === 0) {
                const legacy = (this.properties.triggers || [{ active: true }]).map(t => ({
                    id: t.id || `trig_${Math.random().toString(16).slice(2, 8)}`,
                    weight: 1.0,
                    ...t
                }));
                this._triggerGroupData = [{
                    id: `grp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                    title: this.properties.regionTitle || `${tLocale("$derp_trigger_wall.groups.default_prefix", "Trigger Group")} 1`,
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

                const triggerFontSize = (this._t_textSmallPaintData?.fontSize || this._t_textNormalPaintData?.fontSize || 10);
                const triggerFont = (this._t_textSmallPaintData?.font || this._t_textNormalPaintData?.font || "Arial");
                const triggerWeightFont = (this._t_textSmallPaintData?.fontWeight || this._t_textNormalPaintData?.fontWeight || "normal");
                const measureTextTheme = this._t_textSmallPaintData || this._t_textNormalPaintData;
                const addVisible = isSelected || this.properties.toggleAddAlways;
                const addMeasureKey = `add|${triggerPadW}|${triggerPadH}|${triggerFontSize}|${triggerFont}|${triggerWeightFont}`;
                let cachedAddWidth = this._triggerMeasureCache.get(addMeasureKey);
                if (!Number.isFinite(cachedAddWidth)) {
                    measureCacheMisses += 1;
                    cachedAddWidth = Math.ceil(this.layout.measure({
                        type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsmall",
                        icon: "add", width: "match", height: "fill", minHeight: 22, baseHeight: 22, objectAlign: ["left", "middle"], margin: [0, 0]
                    }, { textTheme: measureTextTheme }));
                    this._triggerMeasureCache.set(addMeasureKey, cachedAddWidth);
                } else {
                    measureCacheHits += 1;
                }

                const trigGroups = items.reduce((acc, item) => {
                    let tw = 0;
                    if (item.type === "trig") {
                        bumpTWPerfCounter(this, "measure");
                        const trigWeight = Number(item.trig.weight ?? 1.0);
                        const showWeight = this.properties.showWeight !== false;
                        const weightVisible = showWeight && Number.isFinite(trigWeight) && Math.abs(trigWeight - 1.0) > 1e-6;
                        const trigMeasureKey = `trig|${item.trig.label || "Trigger Test"}|${weightVisible ? trigWeight.toFixed(2) : "1.00"}|${showWeight ? 1 : 0}|${triggerPadW}|${triggerPadH}|${sW}|${triggerFontSize}|${triggerFont}|${triggerWeightFont}`;
                        const cachedTrigWidth = this._triggerMeasureCache.get(trigMeasureKey);
                        if (Number.isFinite(cachedTrigWidth)) {
                            measureCacheHits += 1;
                            tw = cachedTrigWidth;
                        } else {
                            measureCacheMisses += 1;
                            tw = Math.ceil(this.layout.measure({
                                type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "button, panel, t_textsmall",
                                text: item.trig.label || tLocale("$derp_trigger_wall.trigger.placeholder", "Trigger Test"), width: "auto", height: "auto",
                                padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                                showWeight: this.properties.showWeight, weight: trigWeight
                            }, { textTheme: measureTextTheme }));
                            this._triggerMeasureCache.set(trigMeasureKey, tw);
                        }
                    } else {
                        if (addVisible) bumpTWPerfCounter(this, "measure");
                        tw = addVisible ? cachedAddWidth : 0;
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
                        dir: "row", width: "full", height: "auto", spacing: [sW, 0], minWidth: 0, margin: [-mW / 2, 0, -mW / 2, isLastRow ? mH + 2 : 0],
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
                                const triggerDisabled = isBypassed || item.trig.disabled === true;
                                const triggerVisuallyDisabled = triggerDisabled || item.trig.active !== true;
                                const triggerSuffix = triggerDisabled
                                    ? "_DIS"
                                    : "_OFF";
                                const triggerItemKey = rowAnchorPrefix === "triggerRow" ? `triggerItem_${gIdx}_${item.idx}` : `${rowAnchorPrefix}Item_${gIdx}_${item.idx}`;
                                return [triggerItemKey, {
                                    type: this.UI_TYPES.COMPOSITE_TRIGGER, themeKey: "button, panel, t_textsmall",
                                    text: item.trig.label || tLocale("$derp_trigger_wall.trigger.placeholder", "Trigger Test"), mouseOver: false,
                                    toolTip: tLocale("$derp_trigger_wall.tooltips.trigger", "Left click to toggle. Shift+click to toggle all triggers in the group. Right click to open detail panel"),
                                    width: "auto", height: "auto", padding: [triggerPadW, triggerPadH, triggerPadW, triggerPadH], margin: [0, 0], spacing: [sW, 0],
                                    showWeight: this.properties.showWeight, weight: item.trig.weight ?? 1.0,
                                    alpha: groupWidgetAlpha,
                                    value: item.trig.active,
                                    suffix: triggerSuffix,
                                    state: triggerSuffix === "_DIS" ? "DIS" : (triggerSuffix === "_ON" ? "ON" : "OFF"),
                                    disabled: item.trig.disabled === true,
                                    bodyPaint: item.isTriggerPreviewGhost ? this._buttonPaintData_DIS : (triggerVisuallyDisabled ? this._buttonPaintData_DIS : this._buttonPaintData_OFF),
                                    slotPaint: triggerVisuallyDisabled ? this._buttonPaintData_DIS : this._buttonPaintData_OFF,
                                    labelPaint: triggerVisuallyDisabled ? this._t_textSmallPaintData_DIS : this._t_textSmallPaintData_OFF,
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
                                icon: "add", width: "match", height: "fill", objectAlign: ["left", "middle"], margin: [0, 0],
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
                    groupMarginOverride = null,
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
                    regionOffset: [mW, -sH, mW, -sH],
                    alpha: isPreviewGhost ? 0 : 1,
                    state: isFloating ? "ON" : (isSelected ? "ON" : (isBypassed ? "DIS" : "OFF")),
                    hoverEffect: false,
                    margin: groupMarginOverride || [mW * 2, sH, mW * 2, mH],
                    width: "full",
                    height: "auto",
                    dir: "col",
                    minWidth: 0,
                    ...regionProps,
                    [`${childKeyPrefix}headerRegion_${gIdx}`]: {
                        alpha: isPreviewGhost ? 0 : 1,
                        hidden: !this.properties.settingActive && !isSelected,
                        dir: "row", width: "full", height: "auto", margin: [-mW, sH, -mW, 0],
                        spacing: [sW, 0],
                        [`${childKeyPrefix}btnRename_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "rename", themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            width: "match", height: "fill", margin: [-sW, mH], spacing: [sW * 2, 0],
                            onPress: () => triggerWall_renameGroup(this, group, gIdx)
                        },
                        [`${childKeyPrefix}btnSave_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, icon: "save", themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            width: "match", height: "fill", margin: [0, mH, 0, mH], spacing: [sW, 0],
                            hidden: !triggerWall_hasProfileGroup(this, group),
                            state: isBypassed ? "DIS" : (triggerWall_hasGroupTextChanges(this, group) ? "OFF" : "DIS"),
                            onPress: () => triggerWall_saveGroupToProfile(this, group, `${childKeyPrefix}btnSave_${gIdx}`)
                        },
                        [`${childKeyPrefix}dropdownTriggerGroup_${gIdx}`]: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            themeKey: "button, t_textsmall", skipBackground: false,
                            hidden: isPreviewGhost,
                            canvasShield: true, mouseOver: false,
                            width: "full", height: "auto", spacing: [sW, 0],
                            mode: "file",
                            rootName: "triggergroup",
                            padding: [pW, pH],
                            value: group.title || tLocale("$derp_trigger_wall.groups.default", "Trigger Group"),
                            items: [...(this._cachedPresetData?.triggerGroups || this._triggerGroupData || [])]
                                .filter(g => !activeTitles.includes(g.title) || g.title === group.title)
                                .sort((a, b) => (a.title || "").localeCompare(b.title || ""))
                                .map(g => g.title || tLocale("$derp_trigger_wall.groups.default", "Trigger Group")),
                            onChange: (v) => triggerWall_changeGroupTemplate(this, group, v)
                        },
                        [`${childKeyPrefix}btnAddTriggerToProfile_${gIdx}`]: {
                            type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                            alpha: isPreviewGhost ? 0 : 1,
                            text: tLocale("$derp_trigger_wall.buttons.add_to_profile", "Add to Profile"), width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            hidden: triggerWall_isGroupDuplicate(this),
                            state: isBypassed ? "DIS" : "OFF",
                            onPress: () => triggerWall_addSelectedGroupToProfile(this)
                        },
                        [`${childKeyPrefix}btnRemoveGroup_${gIdx}`]: {
                            type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textsystem",
                            alpha: isPreviewGhost ? 0 : 1,
                            icon: "close", width: "match", height: "fill", margin: [0, mH, 0, mH],
                            hidden: this._triggerGroupData.length <= 1,
                            onPress: () => triggerWall_confirmRemoveGroup(this, gIdx)
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
                    margin: [mW, 0, mW, 0],
                }
            };

            layoutMap.groupControlRow1 = {
                anchor: { target: "contentRegion", axis: "y" },
                dir: "row", width: "full", height: "auto", margin: [mW, mH, mW, mH],
                addGroup: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textsmall", labelAlign: ["center", "middle"],
                    toolTip: tLocale("$derp_trigger_wall.tooltips.new_group", "Adds a new Trigger Group. Remember to save it to a Preset or it will be lost when loading a new workflow!"),
                    text: tLocale("$derp_trigger_wall.buttons.new_group", "New trigger group"), width: "fit", padding: [pW, pH],
                    onPress: () => triggerWall_addGroup(this)
                },
                btnSaveTriggerGroup: {
                    type: this.UI_TYPES.ICONBUTTON, themeKey: "button, t_textnormal",
                    toolTip: tLocale("$derp_trigger_wall.tooltips.save_preset", "Saves the currently selected Trigger Group preset with all changes made to its Trigger Groups."),
                    icon: "save", width: "match", height: "fill", margin: [sW, 0, 0, 0],
                    state: "OFF",
                    onPress: () => {
                        if (triggerWall_saveCurrentProfile) {
                            triggerWall_saveCurrentProfile(this, "btnSaveTriggerGroup");
                        }
                    }
                },
                filebrowserTrigger: {
                    type: this.UI_TYPES.FILEBROWSER, themeKey: "panel, t_textNormal", canvasShield: true,
                    toolTip: tLocale("$derp_trigger_wall.tooltips.load_preset", "Load a Trigger Group preset. A preset contains Trigger Groups that can then be added to the deck."),
                    text: this.properties.lastSavedPreset || tLocale("$derp_trigger_wall.browser.load_profiles", "Load trigger profiles"), mouseOver: false,
                    icon: this.properties.lastSavedPreset ? "file" : "folder",
                    width: "full", height: "fill", padding: [pW, pH], margin: [sW, 0, 0, 0],
                    items: this._sortedPresetItems || [],
                    indicator: true,
                    rootName: tLocale("$derp_trigger_wall.browser.presets", "Presets"),
                    onChange: (val) => {
                        if (typeof triggerWall_onLoadPreset === "function") triggerWall_onLoadPreset(this, val);
                    }
                },
            };

            const groupRegionHost = useGroupsViewport ? {
                anchor: { target: "groupControlRow1", axis: "y" },
                scrollViewport: true,
                clipHeight: resolveTriggerWallGroupsClipHeight,
                minClipHeight: resolveTriggerWallGroupsMinClipHeight,
                width: "full", height: "auto", dir: "col", minWidth: 0,
                margin: [0, 0, sW, 0],
            } : layoutMap;
            if (useGroupsViewport) layoutMap.triggerGroupsViewportRegion = groupRegionHost;
            let lastRegionKey = useGroupsViewport ? "triggerGroupsViewportRegion" : "groupControlRow1";

            visibleGroupEntries.forEach((entry) => {
                const { group, gIdx, isPreviewGhost } = entry;
                const isGroupPreviewGhost = !!isPreviewGhost;
                const regionKey = `triggerRegion_${gIdx}`;
                const isSelected = !!this._selectedRegions?.[regionKey];
                const isFirstGroup = Object.keys(groupRegionHost).filter(k => k.startsWith("triggerRegion_")).length === 0;
                groupRegionHost[regionKey] = buildGroupRegion(group, gIdx, regionKey, isSelected, {
                    groupMarginOverride: isFirstGroup ? [mW * 2, mH, mW * 2, mH] : undefined,
                    isPreviewGhost: isGroupPreviewGhost,
                    childKeyPrefix: "",
                    rowAnchorPrefix: "triggerRow",
                    firstRowAnchorTarget: (!this.properties.settingActive && !isSelected) ? regionKey : `lineBreak_${gIdx}`,
                    regionProps: {
                        anchor: { target: lastRegionKey, axis: "y", offset: isFirstGroup ? 0 : -mH },
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

            if (useGroupsViewport) lastRegionKey = "triggerGroupsViewportRegion";

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
                .map(g => g.title || tLocale("$derp_trigger_wall.groups.default", "Trigger Group"));

            layoutMap.regionSelectTriggerGroup = {
                anchor: { target: lastRegionKey, axis: "y", offset: mH },
                dir: "row", width: "full", height: "auto", margin: [mW, 0, mW, 0],
                spacing: [sW, 0],
                dropdownTriggerGroup: {
                    type: this.UI_TYPES.FILEBROWSER,
                    icon: "dropdown",
                    themeKey: "panel, t_textNormal", skipBackground: true,
                    canvasShield: true, mouseOver: false,
                    width: "full", height: "auto", spacing: [sW, 0],
                    mode: "file",
                    rootName: "triggergroup",
                    padding: [pW, pH],
                    value: tLocale("$derp_trigger_wall.groups.select", "Select Trigger Group"),
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
                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSmall",
                    toolTip: tLocale("$derp_trigger_wall.tooltips.exclusive", "Only one trigger can be turned on in this Trigger Group when this is toggled on."),
                    isTextOnly: true, mouseOver: false, cutoff: false,
                    text: "$derp_trigger_wall.buttons.exclusive",
                    width: "auto", height: "auto", padding: [pW, pH],
                    value: !!selectedGroup?.isExclusive,
                    state: isBypassed ? "DIS" : (anySelected ? (selectedGroup.isExclusive ? "ON" : "OFF") : "DIS"),
                    onPress: () => triggerWall_toggleExclusive(this, selectedGroup, anySelected, isBypassed)
                },
                btnSaveToCurrent: {
                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSmall",
                    toolTip: tLocale("$derp_trigger_wall.tooltips.save_to_current", "Saves the current Trigger Group to the currently selected Trigger Group preset. Disabled if it is already part of the preset."),
                    text: tLocale("$derp_trigger_wall.buttons.save_to_current", "Save to current"), width: "auto", height: "auto", padding: [pW, pH],
                    state: isBypassed ? "DIS" : (triggerWall_isGroupDuplicate(this) ? "DIS" : "OFF"),
                    onPress: () => triggerWall_addSelectedGroupToProfile(this)
                }
            };
            if (anySelected) lastRegionKey = "regionOption1";

            layoutMap.bottomSpacer = {
                anchor: { target: lastRegionKey, axis: "y" },
                width: "full", height: 0
            };

            this.layoutMap = layoutMap;

            if (this.layout) this.layout._lastCacheKey = "";
            {
                const now = Date.now();
                if (!this._twLastPerfLogAt || (now - this._twLastPerfLogAt) >= 1000) {
                    this._twLastPerfLogAt = now;
                    const totalLookups = measureCacheHits + measureCacheMisses;
                    const hitRate = totalLookups > 0 ? ((measureCacheHits / totalLookups) * 100).toFixed(1) : "0.0";
                    const cacheSize = this._triggerMeasureCache?.size || 0;
                    twPerfDebug("measure-cache", {
                        title: this.titleLabel || this.title || "TriggerWall",
                        hit: measureCacheHits,
                        miss: measureCacheMisses,
                        hitRate,
                        size: cacheSize,
                        groups: groups.length,
                    });
                }
            }
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
            const suppressDockedVerticalSync = !!(graph && this.properties?.contentCollapsed !== true && resolveDerpRuntimeAutoHeight(this) && isNodeDocked(this, graph) && isLinearDeckGroup(this, graph, "vertical"));
            if (this._isDerpResizing) {
                settleDerpSizeBeforeDraw(this, {
                    preserveCurrentHeight: true,
                    suppressRequestSync: true,
                });
                this._forceSync = true;
                this._layoutDirty = true;
            } else if (this._dragTrig && this._dragThresholdMet) {
                this._forceSync = true;
                this._layoutDirty = true;
                // Trigger drag ghost/preview relies on full foreground refresh while dragging.
                if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
            } else if (suppressDockedVerticalSync) {
                this._forceSync = true;
                this._layoutDirty = true;
                if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, false);
            } else if (layoutHashChanged) {
                this.requestDerpSync();
            }
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTriggerWallSysMap = function() {
            const { mW, mH, sH, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y" }, margin: [mW, sH], spacing: [0, sH],
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, hidden: false, mouseOver: false,
                        themeKey: "t_textSystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_trigger_wall.system.properties", "Derp Trigger Wall properties:"),
                        width: "full", padding: [pW, pH],
                    },
                    regionOption1: {
                        dir: "row", width: "full", height: "auto",
                        toggleShowWeight: {
                            type: this.UI_TYPES.TOGGLE,
                            textThemeKey: "t_textsystem",
                            icon: "radio",
                            value: !!this.properties.showWeight,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: tLocale("$derp_trigger_wall.system.show_weight", "Show Trigger Weight"),
                            width: "auto", height: "fill",
                            padding: [pW, pH],
                            onPress: () => triggerWall_toggleShowWeight(this)
                        },
                        toggleAddAlways: {
                            type: this.UI_TYPES.TOGGLE, textThemeKey: "t_textSystem", icon: "radio",
                            value: !!this.properties.toggleAddAlways,
                            objectAlign: ["left", "top"],
                            labelAlign: ["left", "middle"],
                            label: tLocale("$derp_trigger_wall.system.add_always", "Add trigger button always visible"),
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

        nodeType.prototype.getDerpHeightModeConfig = function() {
            return {
                items: getTriggerWallHeightModeItems(),
                value: getTriggerWallClipVisibleLimit(this),
                rootName: "height-mode",
                onChange: (v) => {
                    this.properties.triggerWallClipVisibleLimit = normalizeTriggerWallClipVisibleLimit(v);
                    applyDerpPreferredAutoHeight(this, this.properties.triggerWallClipVisibleLimit !== "Auto");
                    this.refreshNodeLayoutMap();
                    if (this.refreshDerpTriggerWallSysMap) this.refreshDerpTriggerWallSysMap();
                    if (this.requestDerpSync) this.requestDerpSync();
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (app.graph && typeof app.graph.change === "function") app.graph.change();
                },
            };
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
            if (type === "click") {
                this._twLastClickAt = Date.now();
            }

            if ((type === "dragStart" || type === "click") && this.layout?.regions && data && typeof data.localX === "number" && typeof data.localY === "number") {
                const regions = this.layout.regions;
                const keys = Object.keys(regions).reverse();
                for (const key of keys) {
                    const reg = regions[key];
                    if (!reg || (reg.type !== this.UI_TYPES.DROPDOWN && reg.type !== this.UI_TYPES.DROPDOWN_DERP && reg.type !== this.UI_TYPES.FILEBROWSER)) continue;
                    if (reg.state === "DIS" && reg.allowOpenWhenDisabled !== true) continue;
                    if (!this.layout.hitTest([data.localX, data.localY], reg)) continue;

                    this._pressedRegionKey = key;
                    this._triggerWallCacheSuspendUntil = Math.max(Number(this._triggerWallCacheSuspendUntil || 0), performance.now() + 220);
                    if (type === "click" && typeof reg.onPress === "function") {
                        return reg.onPress(data.originalEvent, data) === true;
                    }
                    break;
                }
            }

            if (consumeSuppressedDragClick(this, type)) return true;
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
            const modalUiHash = `${this._triggerWallModalOpen === true ? 1 : 0}:${this._activeModalItemKey || ""}`;
            if (this._lastTriggerWallModalUiHash !== modalUiHash) {
                this._lastTriggerWallModalUiHash = modalUiHash;
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
            }
            registerTWPerfNode(this);
            const twDrawStart = performance.now();
            triggerWall_onDrawForeground(this, ctx, onDrawForeground);
            if (this._dragThresholdMet && this._floatingPreviewSnapshot) {
                drawFloatingPreview(this, ctx);
            }
            bumpTWPerfDraw(this, performance.now() - twDrawStart);
        };
    }
});
