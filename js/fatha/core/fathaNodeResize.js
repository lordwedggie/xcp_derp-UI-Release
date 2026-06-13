import { sysPanel } from "../helpers/fathaSysPanel.js";
import { applyDockResizeResult, canResizeHorizontalStackWidth, syncDockResizePair } from "./dockResize.js";
import { getDockGroupAxisFromMembers, getDockNodeMinHeight, getDockNodeMinWidth, resolveDockResizeAxes } from "./dockDimensions.js";
import { getDeckMembers, getDeckPressureBranchMembers, getDeckPressureBranchSideForNode, getDeckPressureHubForNode, getNodeOnDeckEdge, isDeckPressureHub, setDeckNodePos } from "./masterDockEngine.js";
import { dockDebug, snapshotDockNode } from "./dockDebugHelpers.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";

function getPressureBranchAxis(side) {
    if (side === "left" || side === "right") return "vertical";
    if (side === "top" || side === "bottom") return "horizontal";
    return null;
}

function getResizeAxis(entity, graph) {
    if (!graph || !entity || isDeckPressureHub(entity)) return null;
    const pressureHub = getDeckPressureHubForNode(entity, graph);
    const branchSide = pressureHub && pressureHub.id !== entity.id ? getDeckPressureBranchSideForNode(pressureHub, graph, entity) : null;
    const branchAxis = getPressureBranchAxis(branchSide);
    if (branchAxis && getDeckPressureBranchMembers(pressureHub, graph, branchSide).length > 1) return branchAxis;
    return getDockGroupAxisFromMembers(getDeckMembers(entity, graph));
}

function getPressureHubMinWidth(entity, graph, snap, fallbackMinWidth) {
    if (!isDeckPressureHub(entity) || !graph) return fallbackMinWidth;
    const branchMinWidth = ["top", "bottom"].reduce((maxWidth, side) => {
        const members = getDeckPressureBranchMembers(entity, graph, side);
        const minWidth = members.reduce((sum, member) => sum + getDockNodeMinWidth(member, 0, snap), 0);
        return Math.max(maxWidth, minWidth);
    }, 0);
    return Math.max(fallbackMinWidth, branchMinWidth);
}

export function handleNodeResize(entity, data, scale) {
    const { SNAP, autoWidth, autoHeight } = entity.getDerpVars ? entity.getDerpVars(entity) : getDerpVars(entity);
    const resizeAnchor = data.resizeAnchor || "bottom-right";
    const isPureVerticalSharedEdgeResize = resizeAnchor === "top" || resizeAnchor === "bottom";
    const graph = entity.graph || globalThis?.app?.graph || null;
    const axis = getResizeAxis(entity, graph);
    const resizeAxes = resolveDockResizeAxes(axis, { autoWidth, autoHeight });
    const horizontalStackResizeSide = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left"
        ? "left"
        : (resizeAnchor === "right" || resizeAnchor === "top-right" || resizeAnchor === "bottom-right" ? "right" : null);
    const allowHorizontalStackWidthResize = !!horizontalStackResizeSide
        && axis === "horizontal"
        && !resizeAxes.allowWidth
        && canResizeHorizontalStackWidth(entity, graph, horizontalStackResizeSide);
    if (allowHorizontalStackWidthResize) {
        resizeAxes.allowWidth = true;
    }
    if (isPureVerticalSharedEdgeResize) {
        resizeAxes.allowWidth = false;
        resizeAxes.allowHeight = !autoHeight;
    }

    // Block height resize on corners for collapsed nodes in vertical stacks
    const collapsedInVertical = axis === "vertical" && entity?.properties?.contentCollapsed === true;
    if (collapsedInVertical) {
        const isCorner = data.resizeAnchor === "top-left" || data.resizeAnchor === "top-right" ||
                         data.resizeAnchor === "bottom-left" || data.resizeAnchor === "bottom-right";
        const isTopBoundaryResize = !getNodeOnDeckEdge(entity, graph, "top") && (data.resizeAnchor === "top-left" || data.resizeAnchor === "top-right");
        const isBottomBoundaryResize = !getNodeOnDeckEdge(entity, graph, "bottom") && (data.resizeAnchor === "bottom-left" || data.resizeAnchor === "bottom-right");
        const isVerticalIntent = Math.abs(Number(data.dy) || 0) > Math.abs(Number(data.dx) || 0) + 2;
        if (isCorner && (!isVerticalIntent || (!isTopBoundaryResize && !isBottomBoundaryResize))) resizeAxes.allowHeight = false;
    }

    dockDebug("handle-node-resize-start", () => ({
        entity: snapshotDockNode(entity),
        data,
        scale,
        axis,
        resizeAxes,
        vars: { SNAP, autoWidth, autoHeight },
        startPos: entity._startPos,
        startSize: entity._startSize,
    }));
    if (!resizeAxes.allowWidth && !resizeAxes.allowHeight) return;

    const isPressureHubResize = isDeckPressureHub(entity);
    const minW = getPressureHubMinWidth(entity, graph, SNAP, getDockNodeMinWidth(entity, 0, SNAP));
    const minH = isPressureHubResize ? SNAP * 8 : getDockNodeMinHeight(entity, 0, SNAP);

    const deltaX = data.dx / scale;
    const deltaY = data.dy / scale;

    const anchorMode = {
        "top-left": { wSign: -1, hSign: -1, moveX: true, moveY: true },
        "top-right": { wSign: 1, hSign: -1, moveX: false, moveY: true },
        "bottom-left": { wSign: -1, hSign: 1, moveX: true, moveY: false },
        "bottom-right": { wSign: 1, hSign: 1, moveX: false, moveY: false },
        "left": { wSign: -1, hSign: 0, moveX: true, moveY: false },
        "right": { wSign: 1, hSign: 0, moveX: false, moveY: false },
        "top": { wSign: 1, hSign: -1, moveX: false, moveY: true },
        "bottom": { wSign: 1, hSign: 1, moveX: false, moveY: false }
    }[resizeAnchor] || { wSign: 1, hSign: 1, moveX: false, moveY: false };

    const allowWidthResize = resizeAxes.allowWidth;
    const allowHeightResize = resizeAxes.allowHeight;
    

    const startW = Number(entity._startSize?.[0]) || Number(entity.size?.[0]) || 0;
    const startH = collapsedInVertical
        ? getDockNodeMinHeight(entity, 0, SNAP)
        : (Number(entity._startSize?.[1]) || Number(entity.size?.[1]) || 0);
    const rawW = startW + (deltaX * anchorMode.wSign);
    const newW = allowWidthResize
        ? (allowHorizontalStackWidthResize ? Math.round(rawW / SNAP) * SNAP : Math.max(minW, Math.round(rawW / SNAP) * SNAP))
        : entity.size[0];

    const rawH = startH + (deltaY * anchorMode.hSign);
    const isCollapsedVerticalBoundaryHeightResize = collapsedInVertical && allowHeightResize;
    const newH = allowHeightResize
        ? (isCollapsedVerticalBoundaryHeightResize ? Math.round(rawH / SNAP) * SNAP : Math.max(minH, Math.round(rawH / SNAP) * SNAP))
        : (collapsedInVertical ? getDockNodeMinHeight(entity, 0, SNAP) : entity.size[1]);

    let dockResizeResult;
    entity._dockResizeAllowHeight = allowHeightResize;
    try {
        dockResizeResult = isPressureHubResize
            ? { handledWidth: false, handledHeight: false, handledAll: false, appliedWidth: null, appliedHeight: null, counterparts: [] }
            : syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, SNAP);
    } finally {
        delete entity._dockResizeAllowHeight;
    }
    dockDebug("handle-node-resize-after-dock-pair", () => ({
        entity: snapshotDockNode(entity),
        resizeAnchor,
        computed: { rawW, newW, rawH, newH, minW, minH },
        dockResizeResult: {
            handledWidth: dockResizeResult.handledWidth,
            handledHeight: dockResizeResult.handledHeight,
            handledAll: dockResizeResult.handledAll,
            appliedWidth: dockResizeResult.appliedWidth,
            appliedHeight: dockResizeResult.appliedHeight,
            counterparts: dockResizeResult.counterparts.map(snapshotDockNode),
        },
    }));
    if (dockResizeResult.handledAll) {
        applyDockResizeResult(entity, dockResizeResult);
        return;
    }

    const appliedW = dockResizeResult.handledWidth ? (dockResizeResult.appliedWidth ?? newW) : newW;
    const appliedH = dockResizeResult.handledHeight ? (dockResizeResult.appliedHeight ?? newH) : newH;

    if (entity.size[0] === appliedW && entity.size[1] === appliedH && dockResizeResult.counterparts.length === 0) return;

    if (allowWidthResize && anchorMode.moveX) {
        setDeckNodePos(entity, entity._startPos[0] + (entity._startSize[0] - appliedW), Number(entity.pos?.[1]) || 0);
    }

    if (allowHeightResize && anchorMode.moveY) {
        setDeckNodePos(entity, Number(entity.pos?.[0]) || 0, entity._startPos[1] + (entity._startSize[1] - appliedH));
    }

    setDerpNodeSizeCompat(entity, appliedW, appliedH);
    if (entity.targetSize) {
        entity.targetSize[0] = appliedW;
        entity.targetSize[1] = appliedH;
        entity._layoutDirty = true;
        entity._forceSync = true;
        entity._prevBastaState = null;
        entity._cachedBaseMap = null;
        if (entity.layout) entity.layout._lastCacheKey = "";
    }
    if (entity.properties) entity.properties.nodeSize = [appliedW, appliedH];

    dockDebug("handle-node-resize-after-apply-size", () => ({
        entity: snapshotDockNode(entity),
        applied: { width: appliedW, height: appliedH },
        allowWidthResize,
        allowHeightResize,
        anchorMode,
    }));

    const dockApplyResult = applyDockResizeResult(entity, dockResizeResult);
    if (dockApplyResult.handledAll) return;

    if (sysPanel.isVisible && sysPanel.hostNode?.id === entity.id) {
        sysPanel._layoutDirty = true;
        sysPanel._shouldSync = true;
    }

    entity.setDirtyCanvas(true, true);
    if (entity.syncUncleSlots) entity.syncUncleSlots();
}

function getDerpVars(entity) {
    return entity?.getDerpVars ? entity.getDerpVars(entity) : {
        SNAP: 10,
        autoWidth: entity?.properties?.autoWidth,
        autoHeight: entity?.properties?.autoHeight,
    };
}
