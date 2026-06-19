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

function getNodeSizeValue(node, index) {
    return Number(node?.size?.[index] ?? node?.properties?.nodeSize?.[index]) || 0;
}

function getLinearResizeMembers(node, graph, axis) {
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
    if (node?.properties?.autoWidth !== true) return true;
    return isDeckPressureSideHorizontalBranchMember(node, graph);
}

function isDirectHorizontalNodeSeam(leftNode, rightNode, graph) {
    if (!leftNode || !rightNode || !graph) return false;
    if (isDeckPressureHub(leftNode) || isDeckPressureHub(rightNode)) return false;
    return getNodeOnDeckEdge(leftNode, graph, "right")?.id === rightNode.id
        || getNodeOnDeckEdge(rightNode, graph, "left")?.id === leftNode.id;
}

function areSameRowAdjacentHorizontalMembers(leftNode, rightNode, graph) {
    if (!leftNode || !rightNode || !graph) return false;
    if (isDeckPressureHub(leftNode) || isDeckPressureHub(rightNode)) return false;
    const hub = getDeckPressureHubForNode(leftNode, graph);
    if (!hub || hub.id === leftNode.id || getDeckPressureHubForNode(rightNode, graph)?.id !== hub.id) return false;
    const lx = Number(leftNode.pos?.[0]) || 0;
    const ly = Number(leftNode.pos?.[1]) || 0;
    const lw = getNodeSizeValue(leftNode, 0);
    const lh = getNodeSizeValue(leftNode, 1);
    const rx = Number(rightNode.pos?.[0]) || 0;
    const ry = Number(rightNode.pos?.[1]) || 0;
    const rw = getNodeSizeValue(rightNode, 0);
    const rh = getNodeSizeValue(rightNode, 1);
    const overlapY = Math.min(ly + lh, ry + rh) - Math.max(ly, ry);
    if (overlapY < Math.max(1, Math.min(lh, rh) * 0.5)) return false;
    return Math.abs((lx + lw) - rx) <= 4 || Math.abs((rx + rw) - lx) <= 4;
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
    if (canResizeHorizontalMemberWidth(leftNode, graph) && canResizeHorizontalMemberWidth(rightNode, graph)) return true;
    return isDirectHorizontalNodeSeam(leftNode, rightNode, graph)
        || areSameRowAdjacentHorizontalMembers(leftNode, rightNode, graph);
}

export function canResizeHorizontalSharedEdgeWidth(node, graph, side) {
    if (!graph || !node || (side !== "left" && side !== "right")) return false;
    const neighbor = getHorizontalSameRowNeighbor(node, graph, side);
    if (!neighbor || isDeckPressureHub(neighbor)) return false;
    return side === "left"
        ? canResizeHorizontalSeamPair(neighbor, node, graph)
        : canResizeHorizontalSeamPair(node, neighbor, graph);
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
