import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import {
    getDeckParent,
    getDeckChildren,
    getDeckMembers,
    isLinearDeckGroup,
    syncDeckNodeSize,
} from "./masterDockEngine.js";

function getNodeWidth(node) {
    return Number(node?.properties?.nodeSize?.[0] ?? node?.size?.[0]) || 0;
}

function getNodeHeight(node) {
    return Number(node?.properties?.nodeSize?.[1] ?? node?.size?.[1]) || 0;
}

function getNodeMinWidth(node, fallback = 0, snap = 10) {
    const propMinW = node?.properties?.minWidth || 0;
    const contentMinW = node?.layout?.contentMinWidth || 60;
    const padL = node?._padL || 0;
    const padR = node?._padR || 0;
    const raw = Math.max(fallback, propMinW, contentMinW + padL + padR);
    return Math.ceil(raw / snap) * snap;
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
        cursorX += getNodeWidth(member);
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
    };
    const counterpartIds = new Set();
    const addCounterpart = (node) => {
        if (!node || node.id === entity.id || counterpartIds.has(node.id)) return;
        counterpartIds.add(node.id);
        result.counterparts.push(node);
    };

    const deckMembers = getDeckMembers(entity, graph);
    if (isLinearDeckGroup(entity, graph, "vertical")) {
        const groupMinW = deckMembers.reduce((maxMin, node) => {
            const propMinW = node.properties?.minWidth || 0;
            const contentMinW = node.layout?.contentMinWidth || 60;
            const nodePadL = node._padL || 0;
            const nodePadR = node._padR || 0;
            const nodeMinW = Math.ceil(Math.max(propMinW, contentMinW + nodePadL + nodePadR) / snap) * snap;
            return Math.max(maxMin, nodeMinW);
        }, minW);

        const snappedWidth = Math.max(groupMinW, Math.round(newW / snap) * snap);
        deckMembers.forEach((node) => {
            const nodeH = node.properties?.nodeSize?.[1] || node.size?.[1] || 0;
            syncDeckNodeSize(node, snappedWidth, nodeH);
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledWidth = true;
        result.appliedWidth = snappedWidth;
    }

    if (isLinearDeckGroup(entity, graph, "horizontal")) {
        const groupMinH = deckMembers.reduce((maxMin, node) => {
            const isMinState = node.properties?.contentCollapsed;
            let explicitMinH = 0;
            if (node.layoutMap) {
                Object.values(node.layoutMap).forEach((reg) => {
                    if (reg.minHeight) explicitMinH += reg.minHeight;
                });
            }
            const contentMinH = node.layout?.contentMinHeight || node.layout?.totalHeight || 40;
            const nodeMinRawH = Math.max(explicitMinH, contentMinH);
            const nodeMinH = isMinState ? nodeMinRawH : Math.ceil(nodeMinRawH / snap) * snap;
            return Math.max(maxMin, nodeMinH);
        }, minH);

        const snappedHeight = Math.max(groupMinH, Math.round(newH / snap) * snap);
        deckMembers.forEach((node) => {
            const nodeW = node.properties?.nodeSize?.[0] || node.size?.[0] || 0;
            syncDeckNodeSize(node, nodeW, snappedHeight);
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledHeight = true;
        result.appliedHeight = snappedHeight;
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
        const leftMinW = getNodeMinWidth(leftNode, minW, snap);
        const rightMinW = getNodeMinWidth(rightNode, minW, snap);

        if (totalWidth < leftMinW + rightMinW) {
            result.handledWidth = true;
            result.handledAll = true;
            result.appliedWidth = getNodeWidth(entity);
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

        syncDeckNodeSize(leftNode, adjustedLeftW, getNodeHeight(leftNode));
        syncDeckNodeSize(rightNode, adjustedRightW, getNodeHeight(rightNode));
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
        const draggedHeight = Math.min(totalHeight - minH, Math.max(minH, newH));
        const counterpartHeight = Math.max(minH, totalHeight - draggedHeight);
        const adjustedTopH = topNode.id === entity.id ? draggedHeight : counterpartHeight;
        const adjustedBottomH = bottomNode.id === entity.id ? draggedHeight : counterpartHeight;

        syncDeckNodeSize(topNode, topNode.properties?.nodeSize?.[0] || topNode.size?.[0] || 0, adjustedTopH);
        syncDeckNodeSize(bottomNode, bottomNode.properties?.nodeSize?.[0] || bottomNode.size?.[0] || 0, adjustedBottomH);
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
        entity._dockResizeSession = null;
    }

    if (dockResizeResult.handledWidth) {
        dockResizeResult.counterparts.forEach((node) => {
            node.pos[0] = entity.pos[0];
        });
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
