import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import {
    getDeckParent,
    getDeckChildren,
    getDeckMembers,
    getNodeOnDeckEdge,
    isLinearDeckGroup,
    isNodeDocked,
    syncDeckNodeSize,
} from "./masterDockEngine.js";
import {
    getDockGroupAxisFromMembers,
    getDockNodeHeight,
    getDockNodeWidth,
    getDockNodeMinWidth,
    getSharedDockHeight,
    resolveDockResizeDimensions,
    shouldPreserveDockHeight,
    shouldPreserveDockWidth,
} from "./dockDimensions.js";
import { dockDebug, snapshotDockNode } from "./dockDebugHelpers.js";

globalThis.DERP_DOCK_RESIZE_DEBUG = true;
globalThis.DERP_DOCK_RESIZE_CONSOLE = false;
globalThis.DERP_DOCK_RESIZE_LOGS = globalThis.DERP_DOCK_RESIZE_LOGS || [];

function snapshotDockMembers(node, graph) {
    return graph && node ? getDeckMembers(node, graph).map(snapshotDockNode) : [];
}

export function resolveCollapseShiftDirection(node, graph) {
    if (!node || !graph) return 0;
    if (!isNodeDocked(node, graph)) return 0;
    if (!isLinearDeckGroup(node, graph, "vertical")) return 0;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return 0;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return 0;

    if (pinned.id === node.id) {
        // Explicit collapse/expand of the pinned member should keep the pinned
        // node itself stationary and let dock reflow move the surrounding nodes.
        return 0;
    }

    const nodeY = Number(node.pos?.[1]) || 0;
    const pinY = Number(pinned.pos?.[1]) || 0;
    return nodeY < pinY ? -1 : 0;
}

export function getPinnedVerticalDeckAnchor(node, graph) {
    if (!node || !graph) return null;
    if (!isNodeDocked(node, graph)) return null;
    if (!isLinearDeckGroup(node, graph, "vertical")) return null;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return null;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return null;

    const pinnedY = Number(pinned.pos?.[1]) || 0;
    const pinnedH = Number(pinned.size?.[1] ?? pinned.properties?.nodeSize?.[1]) || 0;
    const anchor = { members, pinned, bottom: pinnedY + pinnedH };
    dockDebug("pin-anchor-capture", {
        node: snapshotDockNode(node),
        pinned: snapshotDockNode(pinned),
        bottom: anchor.bottom,
        members: members.map(snapshotDockNode),
    });
    return anchor;
}

export function getPinnedVerticalDeckPositionAnchor(node, graph) {
    if (!node || !graph) return null;
    if (!isNodeDocked(node, graph)) return null;
    if (!isLinearDeckGroup(node, graph, "vertical")) return null;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return null;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return null;

    const anchor = {
        members,
        pinned,
        y: Number(pinned.pos?.[1]) || 0,
    };
    dockDebug("pin-position-capture", {
        node: snapshotDockNode(node),
        pinned: snapshotDockNode(pinned),
        y: anchor.y,
        members: members.map(snapshotDockNode),
    });
    return anchor;
}

export function restorePinnedVerticalDeckAnchor(anchor) {
    const pinned = anchor?.pinned;
    if (!pinned) return 0;

    const nextPinnedY = Number(pinned.pos?.[1]) || 0;
    const nextPinnedH = Number(pinned.size?.[1] ?? pinned.properties?.nodeSize?.[1]) || 0;
    const offsetY = (Number(anchor.bottom) || 0) - (nextPinnedY + nextPinnedH);
    dockDebug("pin-anchor-restore-before", {
        pinned: snapshotDockNode(pinned),
        targetBottom: anchor.bottom,
        nextBottom: nextPinnedY + nextPinnedH,
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    if (offsetY === 0) return 0;

    anchor.members.forEach((member) => {
        if (!member?.pos) return;
        member.pos[1] = (Number(member.pos[1]) || 0) + offsetY;
    });
    dockDebug("pin-anchor-restore-after", {
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    return offsetY;
}

export function restorePinnedVerticalDeckPositionAnchor(anchor) {
    const pinned = anchor?.pinned;
    if (!pinned) return 0;

    const nextPinnedY = Number(pinned.pos?.[1]) || 0;
    const offsetY = (Number(anchor.y) || 0) - nextPinnedY;
    dockDebug("pin-position-restore-before", {
        pinned: snapshotDockNode(pinned),
        targetY: anchor.y,
        nextY: nextPinnedY,
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    if (offsetY === 0) return 0;

    anchor.members.forEach((member) => {
        if (!member?.pos) return;
        member.pos[1] = (Number(member.pos[1]) || 0) + offsetY;
    });
    dockDebug("pin-position-restore-after", {
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    return offsetY;
}

export function shouldPreserveVerticalDeckWidth(node, graph = app.graph || node?.graph || null) {
    if (!graph || !node) return false;
    return shouldPreserveDockWidth(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function shouldPreserveHorizontalDeckHeight(node, graph = app.graph || node?.graph || null) {
    if (!graph || !node) return false;
    return shouldPreserveDockHeight(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function syncHorizontalDeckHeight(node, graph = app.graph || node?.graph || null, targetHeight = 0) {
    if (!graph || !node || !isLinearDeckGroup(node, graph, "horizontal")) return false;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return false;

    const explicitTargetHeight = Number(targetHeight) || 0;
    const now = Date.now();
    const hasActiveStackDrag = members.some((member) =>
        (member?._dragTrig && member?._dragThresholdMet) || (Number(member?._stackDragReleaseLockUntil) || 0) > now
    );
    const resolvedHeight = explicitTargetHeight > 0
        ? (hasActiveStackDrag ? Math.max(getSharedDockHeight(members, targetHeight), explicitTargetHeight) : explicitTargetHeight)
        : getSharedDockHeight(members, targetHeight);
    if (resolvedHeight <= 0) return false;

    const topY = members.reduce((minY, member) => {
        return Math.min(minY, Number(member?.pos?.[1]) || 0);
    }, Number.POSITIVE_INFINITY);
    const resolvedY = Number.isFinite(topY) ? topY : (Number(node.pos?.[1]) || 0);
    let changed = false;

    members.forEach((member) => {
        const heightChanged = syncDeckNodeSize(member, getDockNodeWidth(member), resolvedHeight);
        const yChanged = (Number(member?.pos?.[1]) || 0) !== resolvedY;
        if (member?.pos && yChanged) member.pos[1] = resolvedY;
        if (heightChanged || yChanged) {
            changed = true;
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
        }
    });

    return changed;
}

function normalizeHorizontalMemberPositions(anchorNode, graph) {
    const members = getDeckMembers(anchorNode, graph)
        .sort((a, b) => {
            const ax = Number(a?.pos?.[0]) || 0;
            const bx = Number(b?.pos?.[0]) || 0;
            if (ax !== bx) return ax - bx;
            return (Number(a?.id) || 0) - (Number(b?.id) || 0);
        });
    if (members.length <= 1) return;

    let cursorX = Number(members[0]?.pos?.[0]) || 0;
    members.forEach((member) => {
        member.pos[0] = cursorX;
        cursorX += getDockNodeWidth(member);
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
    });
}

export function syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, snap = 10) {
    const graph = app.graph || entity.graph || null;
    if (!graph) return { handledWidth: false, handledHeight: false, handledAll: false, appliedWidth: null, appliedHeight: null, counterparts: [] };

    const result = {
        handledWidth: false,
        handledHeight: false,
        handledAll: false,
        appliedWidth: null,
        appliedHeight: null,
        counterparts: [],
        pinnedAnchor: null,
    };
    const counterpartIds = new Set();
    const addCounterpart = (node) => {
        if (!node || node.id === entity.id || counterpartIds.has(node.id)) return;
        counterpartIds.add(node.id);
        result.counterparts.push(node);
    };

    const deckMembers = getDeckMembers(entity, graph);
    if (isLinearDeckGroup(entity, graph, "vertical")) {
        result.pinnedAnchor = getPinnedVerticalDeckPositionAnchor(entity, graph);
        dockDebug("resize-vertical-before", {
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: deckMembers.map(snapshotDockNode),
        });
        const dockSize = resolveDockResizeDimensions("vertical", deckMembers, { width: newW }, { minWidth: minW, height: getDockNodeHeight(entity) }, snap);
        const snappedWidth = dockSize.width;
        deckMembers.forEach((node) => {
            const nodeH = getDockNodeHeight(node);
            syncDeckNodeSize(node, snappedWidth, nodeH, { silent: true });
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledWidth = true;
        result.appliedWidth = snappedWidth;
        dockDebug("resize-vertical-after", {
            entity: snapshotDockNode(entity),
            appliedWidth: snappedWidth,
            members: deckMembers.map(snapshotDockNode),
        });
    }

    if (isLinearDeckGroup(entity, graph, "horizontal")) {
        dockDebug("resize-horizontal-before", {
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: deckMembers.map(snapshotDockNode),
        });
        const dockSize = resolveDockResizeDimensions("horizontal", deckMembers, { height: newH }, { minHeight: minH, width: getDockNodeWidth(entity) }, snap);
        const snappedHeight = dockSize.height;
        deckMembers.forEach((node) => {
            const nodeW = getDockNodeWidth(node);
            syncDeckNodeSize(node, nodeW, snappedHeight);
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledHeight = true;
        result.appliedHeight = snappedHeight;
        dockDebug("resize-horizontal-after", {
            entity: snapshotDockNode(entity),
            appliedHeight: snappedHeight,
            members: deckMembers.map(snapshotDockNode),
        });
    }

    const isLeftHandle = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    const isRightHandle = resizeAnchor === "right" || resizeAnchor === "top-right" || resizeAnchor === "bottom-right";
    const isTopHandle = resizeAnchor === "top" || resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomHandle = resizeAnchor === "bottom" || resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";

    const parent = getDeckParent(entity, graph);
    const childNodes = getDeckChildren(entity, graph);
    const seamCandidates = [];
    if (parent) {
        seamCandidates.push({
            leader: parent,
            docked: entity,
            side: entity.properties?.deckDockSide || null,
        });
    }
    childNodes.forEach((child) => {
        seamCandidates.push({
            leader: entity,
            docked: child,
            side: child.properties?.deckDockSide || null,
        });
    });

    const matchingCandidate = seamCandidates.find(({ leader, docked, side }) => {
        if (!leader || !docked || !side) return false;
        if (side === "left" || side === "right") {
            const leaderSeamUsesLeftHandle = side === "left";
            const dockedSeamUsesLeftHandle = side === "right";
            return (
                (entity.id === leader.id && (leaderSeamUsesLeftHandle ? isLeftHandle : isRightHandle)) ||
                (entity.id === docked.id && (dockedSeamUsesLeftHandle ? isLeftHandle : isRightHandle))
            );
        }
        if (side === "top" || side === "bottom") {
            const leaderSeamUsesTopHandle = side === "top";
            const dockedSeamUsesTopHandle = side === "bottom";
            return (
                (entity.id === leader.id && (leaderSeamUsesTopHandle ? isTopHandle : isBottomHandle)) ||
                (entity.id === docked.id && (dockedSeamUsesTopHandle ? isTopHandle : isBottomHandle))
            );
        }
        return false;
    });

    if (!matchingCandidate) return result;

    const { leader, docked, side } = matchingCandidate;

    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === side
        && currentSession.leaderId === leader.id
        && currentSession.dockedId === docked.id;

    if (!sessionMatches) {
        entity._dockResizeSession = {
            side,
            leaderId: leader.id,
            dockedId: docked.id,
            leaderStartW: leader.properties?.nodeSize?.[0] || leader.size?.[0] || 0,
            leaderStartH: leader.properties?.nodeSize?.[1] || leader.size?.[1] || 0,
            dockedStartW: docked.properties?.nodeSize?.[0] || docked.size?.[0] || 0,
            dockedStartH: docked.properties?.nodeSize?.[1] || docked.size?.[1] || 0,
        };
    }

    const session = entity._dockResizeSession;

    if (side === "left" || side === "right") {
        const totalWidth = session.leaderStartW + session.dockedStartW;

        const leftNode = side === "left" ? docked : leader;
        const rightNode = side === "left" ? leader : docked;
        const leftMinW = getDockNodeMinWidth(leftNode, minW, snap);
        const rightMinW = getDockNodeMinWidth(rightNode, minW, snap);

        if (totalWidth < leftMinW + rightMinW) {
            result.handledWidth = true;
            result.handledAll = true;
            result.appliedWidth = getDockNodeWidth(entity);
            addCounterpart(leftNode);
            addCounterpart(rightNode);
            return result;
        }

        const draggedMinW = entity.id === leftNode.id ? leftMinW : rightMinW;
        const counterpartMinW = entity.id === leftNode.id ? rightMinW : leftMinW;
        const maxDraggedWidth = Math.max(draggedMinW, totalWidth - counterpartMinW);
        const draggedWidth = Math.min(maxDraggedWidth, Math.max(draggedMinW, newW));
        const counterpartWidth = Math.max(counterpartMinW, totalWidth - draggedWidth);
        const adjustedLeftW = leftNode.id === entity.id ? draggedWidth : counterpartWidth;
        const adjustedRightW = rightNode.id === entity.id ? draggedWidth : counterpartWidth;

        syncDeckNodeSize(leftNode, adjustedLeftW, getDockNodeHeight(leftNode));
        syncDeckNodeSize(rightNode, adjustedRightW, getDockNodeHeight(rightNode));
        rightNode.pos[0] = leftNode.pos[0] + adjustedLeftW;
        normalizeHorizontalMemberPositions(leftNode, graph);
        if (typeof leftNode.syncUncleSlots === "function") leftNode.syncUncleSlots();
        if (typeof rightNode.syncUncleSlots === "function") rightNode.syncUncleSlots();
        result.handledWidth = true;
        result.handledAll = true;
        result.appliedWidth = entity.id === leftNode.id ? adjustedLeftW : adjustedRightW;
        addCounterpart(leftNode);
        addCounterpart(rightNode);
        return result;
    }

    if (side === "top" || side === "bottom") {
        const totalHeight = session.leaderStartH + session.dockedStartH;

        const topNode = side === "top" ? docked : leader;
        const bottomNode = side === "top" ? leader : docked;

        const topCollapsed = topNode?.properties?.contentCollapsed === true;
        const bottomCollapsed = bottomNode?.properties?.contentCollapsed === true;
        if (topCollapsed && bottomCollapsed) {
            result.handledHeight = true;
            result.handledAll = true;
            result.appliedHeight = getDockNodeHeight(entity);
            addCounterpart(topNode);
            addCounterpart(bottomNode);
            return result;
        }

        const isPureEdge = resizeAnchor === "top" || resizeAnchor === "bottom";

        if (isPureEdge && (topCollapsed || bottomCollapsed)) {
            result.handledHeight = true;
            result.handledAll = true;
            result.appliedHeight = getDockNodeHeight(entity);
            addCounterpart(topNode);
            addCounterpart(bottomNode);
            return result;
        }

        const draggedHeight = Math.min(totalHeight - minH, Math.max(minH, newH));
        const counterpartHeight = Math.max(minH, totalHeight - draggedHeight);
        const adjustedTopH = topNode.id === entity.id ? draggedHeight : counterpartHeight;
        const adjustedBottomH = bottomNode.id === entity.id ? draggedHeight : counterpartHeight;

        syncDeckNodeSize(topNode, getDockNodeWidth(topNode), adjustedTopH);
        syncDeckNodeSize(bottomNode, getDockNodeWidth(bottomNode), adjustedBottomH);
        bottomNode.pos[1] = topNode.pos[1] + adjustedTopH;
        if (typeof topNode.syncUncleSlots === "function") topNode.syncUncleSlots();
        if (typeof bottomNode.syncUncleSlots === "function") bottomNode.syncUncleSlots();
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = entity.id === topNode.id ? adjustedTopH : adjustedBottomH;
        addCounterpart(topNode);
        addCounterpart(bottomNode);
        return result;
    }

    return result;
}

export function applyDockResizeResult(entity, dockResizeResult) {
    if (!dockResizeResult) {
        return { applied: false, handledAll: false };
    }

    if (dockResizeResult.handledAll) {
        entity.setDirtyCanvas(true, true);
        syncDerpShield(entity);
        dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
        return { applied: true, handledAll: true };
    }

    if (dockResizeResult.handledWidth || dockResizeResult.handledHeight) {
        dockDebug("apply-resize-result", {
            entity: snapshotDockNode(entity),
            result: {
                handledWidth: dockResizeResult.handledWidth,
                handledHeight: dockResizeResult.handledHeight,
                handledAll: dockResizeResult.handledAll,
                appliedWidth: dockResizeResult.appliedWidth,
                appliedHeight: dockResizeResult.appliedHeight,
            },
            counterparts: dockResizeResult.counterparts.map(snapshotDockNode),
            members: snapshotDockMembers(entity, app.graph || entity.graph || null),
        });
        entity._dockResizeSession = null;
    }

    if (dockResizeResult.handledWidth) {
        dockResizeResult.counterparts.forEach((node) => {
            node.pos[0] = entity.pos[0];
        });
        if (dockResizeResult.pinnedAnchor) {
            restorePinnedVerticalDeckPositionAnchor(dockResizeResult.pinnedAnchor);
        }
    }

    if (dockResizeResult.handledHeight) {
        dockResizeResult.counterparts.forEach((node) => {
            node.pos[1] = entity.pos[1];
        });
    }

    syncDerpShield(entity);
    dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
    return { applied: dockResizeResult.handledWidth || dockResizeResult.handledHeight, handledAll: false };
}