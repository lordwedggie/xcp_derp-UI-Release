import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";
import {
    getNodeOnDeckEdge,
    syncDeckNodeSize,
} from "./masterDockEngine.js";

export function syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, snap = 10) {
    const graph = app.graph || entity.graph || null;
    if (!graph) return { handledWidth: false, handledHeight: false, handledAll: false, counterparts: [] };

    const result = {
        handledWidth: false,
        handledHeight: false,
        handledAll: false,
        counterparts: [],
    };
    const addCounterpart = (node) => {
        if (!node || node.id === entity.id || result.counterparts.includes(node)) return;
        result.counterparts.push(node);
    };

    const isLeftHandle = resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    const isRightHandle = resizeAnchor === "top-right" || resizeAnchor === "bottom-right";
    const isTopHandle = resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomHandle = resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";

    let leftEdge = getNodeOnDeckEdge(entity, graph, "left");
    let rightEdge = getNodeOnDeckEdge(entity, graph, "right");
    let topEdge = getNodeOnDeckEdge(entity, graph, "top");
    let bottomEdge = getNodeOnDeckEdge(entity, graph, "bottom");

    if (isLeftHandle && leftEdge) {
        const leader = leftEdge;
        const docked = entity;
        const side = "right";
        const leaderW = getNodeSizeValue(leader, 0);
        const dockedW = getNodeSizeValue(docked, 0);
        const leaderMinW = getNodeMinWidthRaw(leader, snap, minW);
        const dockedMinW = getNodeMinWidthRaw(docked, snap, minW);
        const totalW = (leaderW || 0) + (dockedW || 0);
        const draggedW = Math.min(totalW - dockedMinW, Math.max(leaderMinW, newW));
        const cw = Math.max(dockedMinW, totalW - draggedW);
        const lw = leader.id === entity.id ? cw : draggedW;
        const rw = docked.id === entity.id ? cw : draggedW;
        applyWidthPair(leader, docked, lw, rw, snap);
        result.handledWidth = true;
        addCounterpart(leader);
        addCounterpart(docked);
    } else if (isRightHandle && rightEdge) {
        const leader = entity;
        const docked = rightEdge;
        const leaderW = getNodeSizeValue(leader, 0);
        const dockedW = getNodeSizeValue(docked, 0);
        const leaderMinW = getNodeMinWidthRaw(leader, snap, minW);
        const dockedMinW = getNodeMinWidthRaw(docked, snap, minW);
        const totalW = (leaderW || 0) + (dockedW || 0);
        const draggedW = Math.min(totalW - dockedMinW, Math.max(leaderMinW, newW));
        const cw = Math.max(dockedMinW, totalW - draggedW);
        applyWidthPair(leader, docked, draggedW, cw, snap);
        result.handledWidth = true;
        addCounterpart(leader);
        addCounterpart(docked);
    }

    if (result.handledWidth && result.counterparts.length > 0) {
        result.handledAll = true;
        return result;
    }

    if (isTopHandle && topEdge) {
        const leader = topEdge;
        const docked = entity;
        const leaderH = getNodeSizeValue(leader, 1);
        const dockedH = getNodeSizeValue(docked, 1);
        const leaderMinH = getNodeMinHeightRaw(leader, snap, minH);
        const dockedMinH = getNodeMinHeightRaw(docked, snap, minH);
        const totalH = (leaderH || 0) + (dockedH || 0);
        const draggedH = Math.min(totalH - dockedMinH, Math.max(leaderMinH, newH));
        const ch = Math.max(dockedMinH, totalH - draggedH);
        applyHeightPair(leader, docked, leader.id === entity.id ? ch : draggedH, docked.id === entity.id ? ch : draggedH, snap);
        result.handledHeight = true;
        addCounterpart(leader);
        addCounterpart(docked);
    } else if (isBottomHandle && bottomEdge) {
        const leader = entity;
        const docked = bottomEdge;
        const leaderH = getNodeSizeValue(leader, 1);
        const dockedH = getNodeSizeValue(docked, 1);
        const leaderMinH = getNodeMinHeightRaw(leader, snap, minH);
        const dockedMinH = getNodeMinHeightRaw(docked, snap, minH);
        const totalH = (leaderH || 0) + (dockedH || 0);
        const draggedH = Math.min(totalH - dockedMinH, Math.max(leaderMinH, newH));
        const ch = Math.max(dockedMinH, totalH - draggedH);
        applyHeightPair(leader, docked, draggedH, ch, snap);
        result.handledHeight = true;
        addCounterpart(leader);
        addCounterpart(docked);
    }

    if (result.handledHeight && result.counterparts.length > 0) {
        result.handledAll = true;
    }

    return result;
}

function getNodeSizeValue(node, index) {
    const direct = node?.size?.[index];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    const stored = node?.properties?.nodeSize?.[index];
    if (typeof stored === "number" && Number.isFinite(stored)) return stored;
    return 0;
}

function getNodeMinWidthRaw(node, snap, fallbackMin) {
    const propMin = Number(node.properties?.minWidth) || 0;
    const contentMin = Number(node.layout?.contentMinWidth) || 60;
    const padL = Number(node._padL) || 0;
    const padR = Number(node._padR) || 0;
    return Math.max(fallbackMin, Math.ceil(Math.max(propMin, contentMin + padL + padR) / snap) * snap);
}

function getNodeMinHeightRaw(node, snap, fallbackMin) {
    const propMin = Number(node.properties?.minHeight) || 0;
    const contentMin = Number(node.layout?.contentMinHeight) || Number(node.layout?.totalHeight) || 40;
    return Math.max(fallbackMin, Math.ceil(contentMin / snap) * snap);
}

function applyWidthPair(leftNode, rightNode, leftW, rightW, snap) {
    const baseY = Math.min(
        Number(leftNode.pos?.[1]) || 0,
        Number(rightNode.pos?.[1]) || 0,
    );
    const leftX = Number(leftNode.pos?.[0]) || 0;
    const rightX = leftX + leftW;

    syncDeckNodeSize(leftNode, leftW, getNodeSizeValue(leftNode, 1));
    leftNode.pos[0] = leftX;
    leftNode.pos[1] = baseY;

    syncDeckNodeSize(rightNode, rightW, getNodeSizeValue(rightNode, 1));
    rightNode.pos[0] = rightX;
    rightNode.pos[1] = baseY;

    if (typeof leftNode.syncUncleSlots === "function") leftNode.syncUncleSlots();
    if (typeof rightNode.syncUncleSlots === "function") rightNode.syncUncleSlots();
}

function applyHeightPair(topNode, bottomNode, topH, bottomH, snap) {
    const baseX = Math.min(
        Number(topNode.pos?.[0]) || 0,
        Number(bottomNode.pos?.[0]) || 0,
    );
    const topY = Number(topNode.pos?.[1]) || 0;
    const bottomY = topY + topH;

    syncDeckNodeSize(topNode, getNodeSizeValue(topNode, 0), topH);
    topNode.pos[0] = baseX;
    topNode.pos[1] = topY;

    syncDeckNodeSize(bottomNode, getNodeSizeValue(bottomNode, 0), bottomH);
    bottomNode.pos[0] = baseX;
    bottomNode.pos[1] = bottomY;

    if (typeof topNode.syncUncleSlots === "function") topNode.syncUncleSlots();
    if (typeof bottomNode.syncUncleSlots === "function") bottomNode.syncUncleSlots();
}

export function applyDockResizeResult(entity, dockResizeResult, snap = 10) {
    if (!dockResizeResult) {
        return { applied: false, handledAll: false };
    }

    if (dockResizeResult.handledAll) {
        entity._dockResizeSession = null;
        entity.setDirtyCanvas(true, true);
        syncDerpShield(entity);
        dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
        return { applied: true, handledAll: true };
    }

    if (dockResizeResult.handledWidth || dockResizeResult.handledHeight) {
        entity._dockResizeSession = null;
    }

    syncDerpShield(entity);
    dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
    return { applied: dockResizeResult.handledWidth || dockResizeResult.handledHeight, handledAll: false };
}

export function forceDockResizeRefresh(node) {
    if (!node) return;

    const getNodeSizeValue = (target, index) => {
        const direct = target?.size?.[index];
        if (typeof direct === "number" && Number.isFinite(direct)) return direct;
        const stored = target?.properties?.nodeSize?.[index];
        if (typeof stored === "number" && Number.isFinite(stored)) return stored;
        return 0;
    };

    const w = getNodeSizeValue(node, 0);
    const h = getNodeSizeValue(node, 1);
    const prevResizing = node._isDerpResizing === true;
    const scale = Number(globalThis?.app?.canvas?.ds?.scale) || 1;
    node._startPos = [...(node.pos || [0, 0])];
    node._startSize = [w, h];
    node._resizeAnchor = "bottom-right";
    node._layoutMapHash = undefined;
    node._lastMapStructure = undefined;
    node._lastDerpW = null;
    node._prevDerpState = null;
    node._compDataCache = {};
    node._isDerpResizing = true;
    if (node.layout) node.layout._lastCacheKey = "";
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (node.layout && typeof node.layout.compute === "function") {
        node.layout.compute(
            { x: 0, y: 0, w, h },
            getVirtualNodeLayoutMap(node),
            {
                textTheme: node._t_textSmallPaintData || node._t_textNormalPaintData,
                useAnim: false,
                spawnAnim: false,
                isVirtual: true,
            },
            true,
        );
    }
    handleNodeResize(node, { dx: 0, dy: 0, resizeAnchor: "bottom-right" }, scale);
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    syncDerpShield(node);
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);

    if (node._dockResizeWakeTimer) clearTimeout(node._dockResizeWakeTimer);
    node._dockResizeWakeTimer = setTimeout(() => {
        node._dockResizeWakeTimer = null;
        node._isDerpResizing = prevResizing;
        node._lastDerpW = null;
        node._prevDerpState = null;
        if (node.layout) node.layout._lastCacheKey = "";
        node._forceSync = true;
        node._layoutDirty = true;
        if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
        const wakeW = getNodeSizeValue(node, 0);
        const wakeH = getNodeSizeValue(node, 1);
        if (node.layout && typeof node.layout.compute === "function") {
            node.layout.compute(
                { x: 0, y: 0, w: wakeW, h: wakeH },
                getVirtualNodeLayoutMap(node),
                {
                    textTheme: node._t_textSmallPaintData || node._t_textNormalPaintData,
                    useAnim: false,
                    spawnAnim: false,
                    isVirtual: true,
                },
                true,
            );
        }
        node._startPos = [...(node.pos || [0, 0])];
        node._startSize = [wakeW, wakeH];
        node._resizeAnchor = "bottom-right";
        handleNodeResize(node, { dx: 0, dy: 0, resizeAnchor: "bottom-right" }, scale);
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        syncDerpShield(node);
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    }, 0);
}
