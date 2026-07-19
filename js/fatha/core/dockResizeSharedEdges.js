import {
    getDeckMembers,
    getDeckPressureBranchAxis,
    getDeckPressureBranchMembers,
    getDeckPressureBranchSideForNode,
    getDeckPressureHubForNode,
    getNodeOnDeckEdge,
    isDeckPressureHub,
    isDeckPressureSideHorizontalBranchMember,
    isDeckPressureSideHorizontalHubEdge,
    isLinearDeckGroup,
} from "./masterDockEngine.js";
import { resolveDerpPreferredAutoHeight, resolveDerpPreferredAutoWidth } from "./derpHeightPolicy.js";

function getNodeSizeValue(node, index) {
    return Number(node?.size?.[index] ?? node?.properties?.nodeSize?.[index]) || 0;
}

export function getLinearResizeMembers(node, graph, axis) {
    if (!graph || !node) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (pressureHub?.id === node.id) return [];
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === axis) return getDeckPressureBranchMembers(pressureHub, graph, branchSide);
    return isLinearDeckGroup(node, graph, axis) ? getDeckMembers(node, graph) : [];
}

export function getHorizontalDeckMembersByX(node, graph) {
    const members = getLinearResizeMembers(node, graph, "horizontal");
    if (members.length === 0) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === "horizontal") return members;
    return members.slice().sort((a, b) => {
        const ax = Number(a?.pos?.[0]) || 0;
        const bx = Number(b?.pos?.[0]) || 0;
        if (ax !== bx) return ax - bx;
        return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
}

export function canResizeHorizontalMemberWidth(node, graph) {
    const props = node?.properties || {};
    if (props.deckSavedAutoWidth === true || props.autoWidth === true) return false;
    if (resolveDerpPreferredAutoWidth(node)) return false;
    return true;
}

export function canResizeDeckPressureSideWidthMember(node, graph) {
    if (!isDeckPressureSideHorizontalBranchMember(node, graph)) return true;
    return canResizeHorizontalMemberWidth(node, graph);
}

export function getHorizontalSameRowNeighbor(node, graph, side) {
    if (!node || !graph || (side !== "left" && side !== "right")) return null;
    const hub = getDeckPressureHubForNode(node, graph);
    const direct = getNodeOnDeckEdge(node, graph, side);
    if (!hub || hub.id === node.id) return direct && !isDeckPressureHub(direct) ? direct : null;
    const x = Number(node.pos?.[0]) || 0;
    const y = Number(node.pos?.[1]) || 0;
    const w = getNodeSizeValue(node, 0);
    const h = getNodeSizeValue(node, 1);
    const edgeX = side === "left" ? x : x + w;
    const members = getDeckMembers(node, graph).filter((member) => member && member.id !== node.id && !isDeckPressureHub(member));
    let best = null;
    let bestGap = Infinity;
    members.forEach((member) => {
        if (getDeckPressureHubForNode(member, graph)?.id !== hub.id) return;
        const mx = Number(member.pos?.[0]) || 0;
        const my = Number(member.pos?.[1]) || 0;
        const mw = getNodeSizeValue(member, 0);
        const mh = getNodeSizeValue(member, 1);
        const overlapY = Math.min(y + h, my + mh) - Math.max(y, my);
        if (overlapY < Math.max(1, Math.min(h, mh) * 0.5)) return;
        const memberEdgeX = side === "left" ? mx + mw : mx;
        const directional = side === "left" ? memberEdgeX <= edgeX + 2 : memberEdgeX >= edgeX - 2;
        if (!directional) return;
        const gap = Math.abs(memberEdgeX - edgeX);
        if (gap > 4 || gap >= bestGap) return;
        best = member;
        bestGap = gap;
    });
    return best;
}

export function canResizeHorizontalSeamPair(leftNode, rightNode, graph) {
    return canResizeHorizontalMemberWidth(leftNode, graph) && canResizeHorizontalMemberWidth(rightNode, graph);
}

export function canResizeVerticalSeamPair(topNode, bottomNode, graph) {
    if (!canResizeVerticalMemberHeight(topNode, graph) || !canResizeVerticalMemberHeight(bottomNode, graph)) return false;
    // Deck Pressure side vertical branch seam between two preferred-auto members:
    // the side band owns both heights, so no member can absorb the delta and the
    // seam cannot resize either node. Mixed branches (one manual member) stay resizable.
    if (isDeckPressureSideVerticalBranchMember(topNode, graph)
        && isDeckPressureSideVerticalBranchMember(bottomNode, graph)
        && resolveDerpPreferredAutoHeight(topNode)
        && resolveDerpPreferredAutoHeight(bottomNode)) return false;
    return true;
}

export function isDeckPressureSideVerticalBranchMember(node, graph) {
    if (!node || !graph) return false;
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (!pressureHub || pressureHub.id === node.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, node);
    if (branchSide !== "left" && branchSide !== "right") return false;
    return getDeckPressureBranchAxis(pressureHub, graph, branchSide) === "vertical";
}

export function canResizeHorizontalSharedEdgeWidth(node, graph, side) {
    if (!graph || !node || (side !== "left" && side !== "right")) return false;
    const neighbor = getHorizontalSameRowNeighbor(node, graph, side);
    if (!neighbor || isDeckPressureHub(neighbor)) return false;
    return side === "left"
        ? canResizeHorizontalSeamPair(neighbor, node, graph)
        : canResizeHorizontalSeamPair(node, neighbor, graph);
}

export function canResizeVerticalSharedEdgeHeight(node, graph, side) {
    if (!graph || !node || (side !== "top" && side !== "bottom")) return false;
    const neighbor = getNodeOnDeckEdge(node, graph, side);
    if (!neighbor || isDeckPressureHub(neighbor)) return false;
    return side === "top"
        ? canResizeVerticalSeamPair(neighbor, node, graph)
        : canResizeVerticalSeamPair(node, neighbor, graph);
}

export function canResizeHorizontalStackWidth(node, graph, side = null) {
    if (side && isDeckPressureSideHorizontalHubEdge(node, graph, side)) return false;
    const members = getHorizontalDeckMembersByX(node, graph);
    if (members.length <= 1 || !members.some((member) => canResizeHorizontalMemberWidth(member, graph))) return false;
    const nodeIndex = members.findIndex((member) => member.id === node.id);
    if (side === "left") return nodeIndex === 0;
    if (side === "right") return nodeIndex === members.length - 1;
    return nodeIndex === 0 || nodeIndex === members.length - 1;
}

export function canResizeVerticalMemberHeight(node, graph) {
    if (node?.properties?.contentCollapsed === true) return false;
    if (isDeckPressureSideVerticalBranchMember(node, graph)) return true;
    if (resolveDerpPreferredAutoHeight(node)) return false;
    return true;
}

export function canResizeHorizontalMemberHeight(node, graph) {
    if (node?.properties?.contentCollapsed === true) return false;
    if (resolveDerpPreferredAutoHeight(node)) return false;
    return true;
}

export function canResizeHorizontalStackHeight(node, graph) {
    if (!graph || !node) return false;
    if (isDeckPressureHub(node)) return false;
    const members = getHorizontalDeckMembersByX(node, graph);
    if (members.length <= 1) return false;
    return members.some((member) => canResizeHorizontalMemberHeight(member, graph));
}

export function canResizeVerticalStackHeight(node, graph, side = null) {
    if (!graph || !node) return false;
    if (isDeckPressureHub(node)) return false;
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (pressureHub && pressureHub.id !== node.id) return false;
    const members = getLinearResizeMembers(node, graph, "vertical");
    if (members.length <= 1) return false;
    if (!members.some((member) => canResizeVerticalMemberHeight(member, graph))) return false;
    const hasTopNeighbor = !!getNodeOnDeckEdge(node, graph, "top");
    const hasBottomNeighbor = !!getNodeOnDeckEdge(node, graph, "bottom");
    if (side === "top") return !hasTopNeighbor;
    if (side === "bottom") return !hasBottomNeighbor;
    return !hasTopNeighbor || !hasBottomNeighbor;
}
