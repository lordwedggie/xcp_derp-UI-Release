import { sysPanel } from "../helpers/fathaSysPanel.js";
import { applyDockResizeResult, getVerticalResizeTargetMinHeight, scheduleLiveResizeShieldSync, syncDockResizePair } from "./dockResize.js";
import { canResizeDeckPressureSideWidthMember, canResizeDeckPressureTopBottomHeightBranch, canResizeHorizontalSharedEdgeWidth, canResizeHorizontalStackHeight, canResizeHorizontalStackWidth, canResizeVerticalStackHeight, getHorizontalDeckMembersByX } from "./dockResizeSharedEdges.js";
import { getDockGroupAxisFromMembers, getDockNodeMinHeight, getDockNodeMinWidth, getDerpLayoutCacheHash, resolveDockResizeAxes } from "./dockDimensions.js";
import { applyDeckPressureLayout, getDeckMembers, getDeckPressureBranchMembers, getDeckPressureBranchSideForNode, getDeckPressureBranchAxis, getDeckPressureHubForNode, getDeckPressureHubMinHeight, getDeckPressureHubMinWidth, getNodeOnDeckEdge, isDeckPressureHub, isDeckPressureSideWidthResizeEdge, isDeckPressureTopBottomHeightResizeEdge, setDeckNodePos } from "./masterDockEngine.js";
import { dockDebug, snapshotDockNode } from "./dockDebugHelpers.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";
import { resolveDerpPreferredAutoHeight, resolveDerpPreferredAutoWidth, resolveDerpRuntimeAutoHeight } from "./derpHeightPolicy.js";

function getResizeAxis(entity, graph) {
    if (!graph || !entity || isDeckPressureHub(entity)) return null;
    const pressureHub = getDeckPressureHubForNode(entity, graph);
    const branchSide = pressureHub && pressureHub.id !== entity.id ? getDeckPressureBranchSideForNode(pressureHub, graph, entity) : null;
    const branchAxis = getDeckPressureBranchAxis(pressureHub, graph, branchSide);
    if (branchAxis) return branchAxis;
    return getDockGroupAxisFromMembers(getDeckMembers(entity, graph));
}

function isDeckPressureSideWidthResize(entity, graph, resizeAnchor) {
    const session = entity?._dockResizeSession;
    if ((resizeAnchor === "left" || resizeAnchor === "right")
        && session?.entityId === entity?.id
        && typeof session.side === "string"
        && session.side.startsWith("deck-pressure-")
        && session.side.endsWith("-seam")) return true;
    return isDeckPressureSideWidthResizeEdge(entity, graph, resizeAnchor);
}

function isDeckPressureTopBottomHeightResize(entity, graph, resizeAnchor) {
    const session = entity?._dockResizeSession;
    if ((resizeAnchor === "top" || resizeAnchor === "bottom")
        && session?.entityId === entity?.id
        && typeof session.side === "string"
        && session.side.startsWith("deck-pressure-")
        && session.side.endsWith("-seam")) return true;
    return isDeckPressureTopBottomHeightResizeEdge(entity, graph, resizeAnchor);
}

function isDeckPressureOuterFrameEdge(entity, graph, resizeAnchor) {
    // Only pure side anchors — corner anchors are handled by the frame corner path.
    if (resizeAnchor !== "left" && resizeAnchor !== "right") return false;
    const pressureHub = getDeckPressureHubForNode(entity, graph);
    if (!pressureHub || pressureHub.id === entity.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, entity);
    if (branchSide !== "left" && branchSide !== "right") return false;
    // The outer edge is opposite to the hub-facing side.
    const outerEdgeSide = branchSide === "left" ? "left" : "right";
    return resizeAnchor === outerEdgeSide;
}

function getDeckPressureLiveFrameBounds(hub, graph) {
    const members = getDeckMembers(hub, graph);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    (Array.isArray(members) ? members : []).forEach((member) => {
        if (!member) return;
        const x = Number(member.pos?.[0]) || 0;
        const y = Number(member.pos?.[1]) || 0;
        const w = Number(member.size?.[0] ?? member.properties?.nodeSize?.[0]) || 0;
        const h = Number(member.size?.[1] ?? member.properties?.nodeSize?.[1]) || 0;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + w);
        bottom = Math.max(bottom, y + h);
    });
    return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

// Top/bottom drags on a deck frame outer edge resize the decked STACKS (side
// vertical branches fit to the new band; the hub derives its rect from the
// frame) — the drag never resizes derpImageDeck directly. Returns the hub +
// dragged side when the entity's anchored edge lies on the pressure frame.
function getDeckPressureFrameHeightEdgeTarget(entity, graph, resizeAnchor) {
    if (resizeAnchor !== "top" && resizeAnchor !== "bottom") return null;
    if (!entity || !graph) return null;
    const hub = isDeckPressureHub(entity) ? entity : getDeckPressureHubForNode(entity, graph);
    if (!hub) return null;
    const bounds = getDeckPressureLiveFrameBounds(hub, graph);
    if (!bounds) return null;
    const y = Number(entity.pos?.[1]) || 0;
    const h = Number(entity.size?.[1] ?? entity.properties?.nodeSize?.[1]) || 0;
    const edge = resizeAnchor === "top" ? y : y + h;
    const frameEdge = resizeAnchor === "top" ? bounds.top : bounds.bottom;
    if (Math.abs(edge - frameEdge) > 1) return null;
    // When no top/bottom branch covers the dragged edge, the edge is the hub's
    // own edge (or a side stack end flush with it) — resizing it must move the
    // hub, so keep the legacy hub-driven path for that configuration.
    const hubTop = Number(hub.pos?.[1]) || 0;
    const hubBottom = hubTop + (Number(hub.size?.[1] ?? hub.properties?.nodeSize?.[1]) || 0);
    const branchCoverage = resizeAnchor === "top" ? hubTop - bounds.top : bounds.bottom - hubBottom;
    if (branchCoverage <= 0.5) return null;
    return { hub, side: resizeAnchor, bounds };
}

function applyDeckPressureFrameHeightResize(target, graph, data, scale, snap) {
    const { hub, side, bounds } = target;
    const unit = Math.max(1, Number(snap) || 10);
    if (!hub._deckPressureFrameEdgeResizeStartBounds) {
        const hubTop = Number(hub.pos?.[1]) || 0;
        const hubBottom = hubTop + (Number(hub.size?.[1] ?? hub.properties?.nodeSize?.[1]) || 0);
        hub._deckPressureFrameEdgeResizeStartBounds = { ...bounds, hubTop, hubBottom };
        // Freeze top/bottom row member widths for the whole drag. The per-move
        // pressure plan otherwise re-fits them from live widths, which feeds
        // transient self-inflation (e.g. derpSeedV3's width floor sync) back
        // into the plan and lets a member grow wider until mouse release.
        const rowWidthSnapshot = {};
        for (const branchSide of ["top", "bottom"]) {
            if (getDeckPressureBranchAxis(hub, graph, branchSide) !== "horizontal") continue;
            for (const member of getDeckPressureBranchMembers(hub, graph, branchSide)) {
                const width = Number(member?.size?.[0] ?? member?.properties?.nodeSize?.[0]) || 0;
                if (member?.id !== undefined && member?.id !== null && width > 0) rowWidthSnapshot[member.id] = width;
            }
        }
        hub._deckPressureTopBottomWidthOverrides = rowWidthSnapshot;
    }
    const start = hub._deckPressureFrameEdgeResizeStartBounds;
    const sign = side === "top" ? -1 : 1;
    const rawDelta = ((Number(data?.dy) || 0) / (Number(scale) || 1)) * sign;
    const snappedDelta = Math.round(rawDelta / unit) * unit;
    // The hub stays fixed for the whole drag: the delta is absorbed by the
    // decked stack on the dragged edge (the top/bottom branch), never by
    // derpImageDeck itself. Side vertical branches refit to the new band.
    const startBranchHeight = Math.max(0, side === "top" ? start.hubTop - start.top : start.bottom - start.hubBottom);
    const otherBranchHeight = Math.max(0, side === "top" ? start.bottom - start.hubBottom : start.hubTop - start.top);
    const branchMembers = getDeckPressureBranchMembers(hub, graph, side);
    // Clamp with the branch MINIMUM height (not the drag-start height) so the
    // stack can shrink to its own floor instead of being frozen at the height
    // it had when the drag began.
    const branchFloor = branchMembers.length
        ? Math.max(...branchMembers.map((member) => getDockNodeMinHeight(member, 0, unit)), 0)
        : 0;
    const nextBranchHeight = Math.max(branchFloor, startBranchHeight + snappedDelta);
    if (Math.abs(nextBranchHeight - startBranchHeight) < 0.5) return;
    const frame = side === "top"
        ? { left: start.left, top: start.hubTop - nextBranchHeight, right: start.right, bottom: start.bottom }
        : { left: start.left, top: start.top, right: start.right, bottom: start.hubBottom + nextBranchHeight };
    hub._deckPressureTopBottomHeightOverrides = {
        top: side === "top" ? nextBranchHeight : otherBranchHeight,
        bottom: side === "bottom" ? nextBranchHeight : otherBranchHeight,
    };
    hub._deckPressurePreserveFrameBounds = frame;
    hub._deckPressureFrameHeightResizeActive = true;
    hub._deckPressureActiveUntil = (performance.now?.() || Date.now()) + 1200;
    const changed = applyDeckPressureLayout(hub, graph, unit, { liveResize: true });
    scheduleLiveResizeShieldSync([hub, ...(Array.isArray(changed) ? changed : [])]);
    dockDebug("resize-deck-frame-height-edge", () => ({
        hub: snapshotDockNode(hub),
        side,
        rawDelta,
        snappedDelta,
        startBranchHeight,
        nextBranchHeight,
        branchFloor,
        frame,
    }));
}

function isDeckPressureSideVerticalSeamResize(entity, graph, resizeAnchor) {
    if (resizeAnchor !== "top" && resizeAnchor !== "bottom") return false;
    const neighbor = getNodeOnDeckEdge(entity, graph, resizeAnchor);
    if (!neighbor || isDeckPressureHub(neighbor)) return false;
    const pressureHub = getDeckPressureHubForNode(entity, graph);
    if (!pressureHub || pressureHub.id === entity?.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, entity);
    if (branchSide !== "left" && branchSide !== "right") return false;
    return getDeckPressureBranchAxis(pressureHub, graph, branchSide) === "vertical";
}

function getResizeSessionPressureMinWidth(entity, graph, snap, fallbackMinWidth) {
    if (!isDeckPressureHub(entity)) return fallbackMinWidth;
    const members = getDeckMembers(entity, graph);
    const signature = [
        snap,
        fallbackMinWidth,
        entity.properties?.deckArrangement || "",
        ...members.map((member) => [
            member?.id,
            member?.properties?.contentCollapsed === true ? 1 : 0,
            Math.round(Number(member?.size?.[0] ?? member?.properties?.nodeSize?.[0]) || 0),
            Math.round(Number(member?.size?.[1] ?? member?.properties?.nodeSize?.[1]) || 0),
            getDerpLayoutCacheHash(member),
        ].join(":")),
    ].join("|");
    if (entity._deckResizeMinWidthCache?.signature === signature) {
        return entity._deckResizeMinWidthCache.value;
    }
    const value = getDeckPressureHubMinWidth(entity, graph, snap, fallbackMinWidth);
    entity._deckResizeMinWidthCache = { signature, value };
    return value;
}

function snapResizeDeltaTowardZero(value, snap) {
    const unit = Math.max(1, Number(snap) || 10);
    const raw = Number(value) || 0;
    return Math.trunc(raw / unit) * unit;
}

function getHorizontalStackHeightMin(entity, graph, snap) {
    const members = getHorizontalDeckMembersByX(entity, graph);
    const targets = members.length > 1 ? members : [entity];
    return targets.reduce((max, member) => Math.max(max, getVerticalResizeTargetMinHeight(member, snap)), 0);
}

export function handleNodeResize(entity, data, scale) {
    const { SNAP, autoWidth, autoHeight } = entity.getDerpVars ? entity.getDerpVars(entity) : getDerpVars(entity);
    const resizeAnchor = data.resizeAnchor || "bottom-right";
    const isPureVerticalSharedEdgeResize = resizeAnchor === "top" || resizeAnchor === "bottom";
    const isTopCorner = resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomCorner = resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";
    const isVerticalCorner = isTopCorner || isBottomCorner;
    const graph = entity.graph || globalThis?.app?.graph || null;
    const axis = getResizeAxis(entity, graph);
    const preferredAutoHeight = resolveDerpPreferredAutoHeight(entity);
    const preferredAutoWidth = resolveDerpPreferredAutoWidth(entity);
    const resizeAxes = resolveDockResizeAxes(axis, { autoWidth: preferredAutoWidth, autoHeight: preferredAutoHeight });
    const horizontalStackResizeSide = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left"
        ? "left"
        : (resizeAnchor === "right" || resizeAnchor === "top-right" || resizeAnchor === "bottom-right" ? "right" : null);
    const allowHorizontalStackWidthResize = !!horizontalStackResizeSide
        && axis === "horizontal"
        && canResizeHorizontalStackWidth(entity, graph, horizontalStackResizeSide);
    const allowHorizontalSharedEdgeWidthResize = !!horizontalStackResizeSide
        && !resizeAxes.allowWidth
        && canResizeHorizontalSharedEdgeWidth(entity, graph, horizontalStackResizeSide);
    const allowHorizontalStackHeightResize = isVerticalCorner
        && axis === "horizontal"
        && canResizeHorizontalStackHeight(entity, graph);
    const verticalStackResizeSide = (resizeAnchor === "top" || isTopCorner)
        ? "top"
        : ((resizeAnchor === "bottom" || isBottomCorner) ? "bottom" : null);
    const allowVerticalStackHeightResize = !!verticalStackResizeSide
        && axis === "vertical"
        && canResizeVerticalStackHeight(entity, graph, verticalStackResizeSide);
    const allowDeckPressureSideWidthResize = isDeckPressureSideWidthResize(entity, graph, resizeAnchor)
        && canResizeDeckPressureSideWidthMember(entity, graph);
    const allowDeckPressureTopBottomHeightResize = isDeckPressureTopBottomHeightResize(entity, graph, resizeAnchor)
        && (() => {
            const ph = getDeckPressureHubForNode(entity, graph);
            const bs = ph && ph.id !== entity.id ? getDeckPressureBranchSideForNode(ph, graph, entity) : null;
            return canResizeDeckPressureTopBottomHeightBranch(ph, graph, bs);
        })();
    const allowDeckPressureOuterFrameEdge = isDeckPressureOuterFrameEdge(entity, graph, resizeAnchor);
    if (allowHorizontalStackWidthResize || allowHorizontalSharedEdgeWidthResize || allowDeckPressureSideWidthResize || allowDeckPressureOuterFrameEdge) {
        resizeAxes.allowWidth = true;
    }
    if (allowDeckPressureSideWidthResize || allowDeckPressureOuterFrameEdge) resizeAxes.allowHeight = false;
    if (isPureVerticalSharedEdgeResize) {
        resizeAxes.allowWidth = false;
        resizeAxes.allowHeight = !preferredAutoHeight;
    }
    // Top/bottom hub seam: dragging the edge between a horizontal branch row
    // and the deck hub redistributes row height and hub height inside the
    // preserved frame. Runs after the pure-vertical-edge block because that
    // block clears allowHeight for preferred-auto members — the seam resizes
    // the whole branch, so a preferred-auto dragged member is fine as long as
    // some branch member can absorb the delta (gated above).
    if (allowDeckPressureTopBottomHeightResize) {
        resizeAxes.allowWidth = false;
        resizeAxes.allowHeight = true;
    }
    if (allowVerticalStackHeightResize) {
        resizeAxes.allowHeight = true;
    }
    if (allowHorizontalStackHeightResize) {
        resizeAxes.allowHeight = true;
    }
    if (axis === "vertical" && isVerticalCorner && !allowVerticalStackHeightResize) {
        resizeAxes.allowHeight = false;
    }

    // Pressure hub frame edge resize: side anchors ("left"/"right"/"top"/"bottom")
    // on the hub resize the deck frame on a single axis. This overrides the
    // per-node autoHeight/autoWidth checks because frame edge resize operates
    // on the whole deck, not the individual node. Stack resize paths above
    // already set the same axis, so this is redundant for stacks but essential
    // for standalone decks where the hub is preferred-auto.
    if (isDeckPressureHub(entity) && (resizeAnchor === "left" || resizeAnchor === "right" || resizeAnchor === "top" || resizeAnchor === "bottom")) {
        if (resizeAnchor === "left" || resizeAnchor === "right") {
            resizeAxes.allowWidth = true;
            resizeAxes.allowHeight = false;
        } else {
            resizeAxes.allowWidth = false;
            resizeAxes.allowHeight = true;
        }
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

    // Deck frame height edge: top/bottom drags on the deck frame's outer edge
    // resize the decked STACKS (side vertical branches fit the new band; the
    // hub derives its rect from the preserved frame) — never the node itself.
    // Runs before the per-node axis gates so preferred-auto stack members
    // still resize their stack instead of falling through to a node resize.
    const frameHeightEdgeTarget = getDeckPressureFrameHeightEdgeTarget(entity, graph, resizeAnchor);
    if (frameHeightEdgeTarget) {
        applyDeckPressureFrameHeightResize(frameHeightEdgeTarget, graph, data, scale, SNAP);
        return;
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
    const verticalStackMembersForMinW = (axis === "vertical" && !isPressureHubResize) ? getDeckMembers(entity, graph) : [];
    const stackMaxMinWidth = verticalStackMembersForMinW.length > 1
        ? verticalStackMembersForMinW.reduce((max, m) => Math.max(max, getDockNodeMinWidth(m, 0, SNAP)), 0)
        : 0;
    const fallbackMinW = Math.max(getDockNodeMinWidth(entity, 0, SNAP), stackMaxMinWidth);
    // Corner height drags use the starting width as the stable width floor.
    const startWForMinClamp = Number(entity._startSize?.[0]) || 0;
    const isVStackCornerHeightResize = axis === "vertical" && allowVerticalStackHeightResize
        && (resizeAnchor === "top-left" || resizeAnchor === "top-right" || resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right");
    const minW = isPressureHubResize
        ? getResizeSessionPressureMinWidth(entity, graph, SNAP, fallbackMinW)
        : (isVStackCornerHeightResize && startWForMinClamp > 0 ? Math.min(fallbackMinW, startWForMinClamp) : fallbackMinW);
    const useCompactSideVerticalSeamFloor = isDeckPressureSideVerticalSeamResize(entity, graph, resizeAnchor);
    const minH = isPressureHubResize
        ? getDeckPressureHubMinHeight(entity, graph, SNAP, SNAP * 8)
        : (allowHorizontalStackHeightResize
            ? getHorizontalStackHeightMin(entity, graph, SNAP)
            : getVerticalResizeTargetMinHeight(entity, SNAP, useCompactSideVerticalSeamFloor
                ? { preserveExpandedFloor: false, ignoreViewportLayoutFloor: true }
                : { preserveExpandedFloor: true }));

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
    const rawDeltaW = deltaX * anchorMode.wSign;
    const snappedStackDeltaW = allowHorizontalStackWidthResize
        ? snapResizeDeltaTowardZero(rawDeltaW, SNAP)
        : Math.round(rawDeltaW / SNAP) * SNAP;
    const rawW = startW + rawDeltaW;
    const newW = allowWidthResize
        ? (allowHorizontalStackWidthResize ? startW + snappedStackDeltaW : Math.max(minW, Math.round(rawW / SNAP) * SNAP))
        : entity.size[0];

    const rawDeltaH = deltaY * anchorMode.hSign;
    const snappedStackDeltaH = Math.round(rawDeltaH / SNAP) * SNAP;
    const rawH = startH + rawDeltaH;
    const isCollapsedVerticalBoundaryHeightResize = collapsedInVertical && allowHeightResize;
    const newH = allowHeightResize
        ? ((allowVerticalStackHeightResize || allowHorizontalStackHeightResize) ? startH + snappedStackDeltaH : (isCollapsedVerticalBoundaryHeightResize ? Math.round(rawH / SNAP) * SNAP : Math.max(minH, Math.round(rawH / SNAP) * SNAP)))
        : (collapsedInVertical ? getDockNodeMinHeight(entity, 0, SNAP) : entity.size[1]);

    let dockResizeResult;
    entity._dockResizeAllowHeight = allowHeightResize;
    if (allowHorizontalStackWidthResize || allowHorizontalSharedEdgeWidthResize || allowDeckPressureSideWidthResize || (axis === "horizontal" && horizontalStackResizeSide)) entity._dockResizeRequestedDeltaW = snappedStackDeltaW;
    if (allowVerticalStackHeightResize || allowDeckPressureTopBottomHeightResize) entity._dockResizeRequestedDeltaH = snappedStackDeltaH;
    try {
        dockResizeResult = isPressureHubResize
            ? { handledWidth: false, handledHeight: false, handledAll: false, appliedWidth: null, appliedHeight: null, counterparts: [] }
            : syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, SNAP);
    } finally {
        delete entity._dockResizeAllowHeight;
        delete entity._dockResizeRequestedDeltaW;
        delete entity._dockResizeRequestedDeltaH;
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

    if (isPressureHubResize && graph) {
        entity._deckPressureFrameHeightResizeActive = allowHeightResize && Math.abs(appliedH - startH) > 0.5;
        entity._deckPressureActiveUntil = (performance.now?.() || Date.now()) + 1200;
        applyDeckPressureLayout(entity, graph, SNAP, { liveResize: true });
    }

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
        autoHeight: resolveDerpRuntimeAutoHeight(entity),
    };
}
