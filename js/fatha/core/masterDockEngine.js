/**
 * PROJECT: xcpDerpNodes
 * PATH: ./js/fatha/core/masterDockEngine.js
 */

import { resolveDockTarget } from "./dockTargetPicking.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";

const DEFAULT_DECK_SNAP = 10;
const DEFAULT_DECK_RADIUS = 48;
const DEFAULT_DECK_GHOST_THICKNESS = 10;

function dockDebugLog() {}

function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}

function getNodeSizeValue(node, index) {
    const direct = node?.size?.[index];
    if (isFiniteNumber(direct)) return direct;
    const stored = node?.properties?.nodeSize?.[index];
    if (isFiniteNumber(stored)) return stored;
    return 0;
}

function snapValue(value, snap = DEFAULT_DECK_SNAP) {
    const safeSnap = isFiniteNumber(snap) && snap > 0 ? snap : DEFAULT_DECK_SNAP;
    return Math.round(value / safeSnap) * safeSnap;
}

export function isDeckableDerpNode(node) {
    return !!(node && (node.isFathaNode || node.isUncleNode));
}

export function isClosedDeckTarget(node) {
    if (!isDeckableDerpNode(node)) return false;
    return true;
}

export function getNodeRect(node) {
    return {
        x: Number(node?.pos?.[0]) || 0,
        y: Number(node?.pos?.[1]) || 0,
        w: getNodeSizeValue(node, 0),
        h: getNodeSizeValue(node, 1),
    };
}

function getDeckGhostRect(side, drag, target, ghostThickness) {
    if (side === "left") {
        return { x: target.x - drag.w, y: target.y, w: drag.w, h: drag.h };
    }
    if (side === "right") {
        return { x: target.x + target.w, y: target.y, w: drag.w, h: drag.h };
    }
    if (side === "top") {
        return { x: target.x, y: target.y - drag.h, w: drag.w, h: drag.h };
    }
    if (side === "bottom") {
        return { x: target.x, y: target.y + target.h, w: drag.w, h: drag.h };
    }
    return { x: target.x, y: target.y, w: Math.max(drag.w, ghostThickness), h: Math.max(drag.h, ghostThickness) };
}

function getDeckSideDistance(dragRect, targetRect, side) {
    if (!dragRect || !targetRect || !side) return Infinity;
    if (side === "left") return Math.abs((dragRect.x + dragRect.w) - targetRect.x);
    if (side === "right") return Math.abs(dragRect.x - (targetRect.x + targetRect.w));
    if (side === "top") return Math.abs((dragRect.y + dragRect.h) - targetRect.y);
    if (side === "bottom") return Math.abs(dragRect.y - (targetRect.y + targetRect.h));
    return Infinity;
}

function getGhostContactSide(side) {
    if (side === "left") return "right";
    if (side === "right") return "left";
    if (side === "top") return "bottom";
    if (side === "bottom") return "top";
    return side;
}

function getRectEdgeLine(side, rect) {
    if (!side || !rect) return null;
    if (side === "left") {
        return { x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.h };
    }
    if (side === "right") {
        return { x1: rect.x + rect.w, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h };
    }
    if (side === "top") {
        return { x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y };
    }
    if (side === "bottom") {
        return { x1: rect.x, y1: rect.y + rect.h, x2: rect.x + rect.w, y2: rect.y + rect.h };
    }
    return null;
}

function getNodeMinHeight(node, snap = DEFAULT_DECK_SNAP) {
    if (!node) return snap;
    const propMin = Number(node.properties?.minHeight) || 0;
    let explicitMin = 0;
    if (node.layoutMap) {
        Object.values(node.layoutMap).forEach((reg) => {
            if (reg?.minHeight) explicitMin += Number(reg.minHeight) || 0;
        });
    }
    const layoutMin = Number(node.layout?.contentMinHeight) || Number(node.layout?.totalHeight) || 40;
    const minRaw = Math.max(propMin, explicitMin, layoutMin, 20);
    const unit = Math.max(1, snap);
    return Math.ceil(minRaw / unit) * unit;
}

function getNodeMinWidth(node, snap = DEFAULT_DECK_SNAP) {
    if (!node) return snap;
    const propMin = Number(node.properties?.minWidth) || 0;
    const contentMin = Number(node.layout?.contentMinWidth) || 60;
    const minRaw = Math.max(propMin, contentMin, 20);
    const unit = Math.max(1, snap);
    return Math.ceil(minRaw / unit) * unit;
}

export function ensureDeckProps(node) {
    if (!node) return null;
    if (!node.properties) node.properties = {};
    if (!Object.prototype.hasOwnProperty.call(node.properties, "deckParentId")) {
        node.properties.deckParentId = null;
    }
    if (!Object.prototype.hasOwnProperty.call(node.properties, "deckDockSide")) {
        node.properties.deckDockSide = null;
    }
    const existingEdges = node.properties.deckEdges;
    node.properties.deckEdges = {
        left: existingEdges?.left ?? null,
        right: existingEdges?.right ?? null,
        top: existingEdges?.top ?? null,
        bottom: existingEdges?.bottom ?? null,
    };
    return node.properties;
}

function getOppositeDeckSide(side) {
    if (side === "left") return "right";
    if (side === "right") return "left";
    if (side === "top") return "bottom";
    if (side === "bottom") return "top";
    return null;
}

function getDeckNodeById(graph, nodeId) {
    if (nodeId === null || nodeId === undefined) return null;
    return getDeckNodes(graph).find((candidate) => candidate.id === nodeId) || null;
}

function getDeckAttachLeaderForSide(leader, side, graph) {
    if (!leader || !side || !graph) return leader;
    const visited = new Set();
    let current = leader;
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const next = getPeerDeckNeighbor(current, graph, side);
        if (!next) break;
        current = next;
    }
    return current || leader;
}

function getPeerDeckNeighbor(node, graph, side) {
    const neighborId = node?.properties?.deckEdges?.[side];
    if (neighborId === null || neighborId === undefined) return null;
    return getDeckNodeById(graph, neighborId);
}

function collectDeckLine(node, graph, negativeSide, positiveSide) {
    if (!node || !graph) return [];
    const out = [];
    const seen = new Set();
    const queue = [node];

    while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur || seen.has(cur.id)) continue;
        seen.add(cur.id);
        out.push(cur);

        const negative = getNodeOnDeckEdge(cur, graph, negativeSide);
        const positive = getNodeOnDeckEdge(cur, graph, positiveSide);
        if (negative && !seen.has(negative.id)) queue.push(negative);
        if (positive && !seen.has(positive.id)) queue.push(positive);
    }

    return out;
}

function sortDeckNodesByAxis(nodes, axis = "y") {
    const index = axis === "x" ? 0 : 1;
    return [...nodes].sort((a, b) => {
        const av = Number(a?.pos?.[index]) || 0;
        const bv = Number(b?.pos?.[index]) || 0;
        if (av !== bv) return av - bv;
        if (a?.id === b?.id) return 0;
        return a?.id > b?.id ? 1 : -1;
    });
}

function getNodeAxisSize(node, axis = "width") {
    return axis === "width" ? getNodeSizeValue(node, 0) : getNodeSizeValue(node, 1);
}

function getNodeAxisMin(node, axis = "width", snap = DEFAULT_DECK_SNAP) {
    return axis === "width" ? getNodeMinWidth(node, snap) : getNodeMinHeight(node, snap);
}

function normalizeVerticalStackPins(node, graph, preferredPinnedNode = null) {
    if (!node || !graph) return;
    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return;
    if (!isLinearDeckGroup(node, graph, "vertical")) return;

    const pinnedMembers = members.filter((member) => member?.properties?.pinActive === true);
    if (pinnedMembers.length <= 1) return;

    const keepPinned = (preferredPinnedNode && pinnedMembers.some((member) => member.id === preferredPinnedNode.id))
        ? preferredPinnedNode
        : pinnedMembers[0];

    members.forEach((member) => {
        if (!member?.properties) member.properties = {};
        member.properties.pinActive = member.id === keepPinned.id;
        if (typeof member.requestDerpSync === "function") member.requestDerpSync();
    });
}

function quantizeSize(value, unit) {
    if (!isFiniteNumber(value)) return unit;
    if (!isFiniteNumber(unit) || unit <= 1) return Math.max(1, Math.round(value));
    return Math.round(value / unit) * unit;
}

function fitSizesToTotal(nodes, axis = "width", targetTotal = 0, snap = DEFAULT_DECK_SNAP) {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];

    const unit = Math.max(1, snap);
    const mins = nodes.map((node) => quantizeSize(getNodeAxisMin(node, axis, snap), unit));
    const current = nodes.map((node) => quantizeSize(getNodeAxisSize(node, axis), unit));
    const minTotal = mins.reduce((sum, value) => sum + value, 0);
    const resolvedTarget = Math.max(quantizeSize(targetTotal, unit), minTotal);
    const flexibleTotal = resolvedTarget - minTotal;
    const flexCurrent = current.map((value, index) => Math.max(0, value - mins[index]));
    const flexCurrentTotal = flexCurrent.reduce((sum, value) => sum + value, 0);
    const sizes = [...mins];

    if (flexibleTotal <= 0) return sizes;

    const weights = flexCurrentTotal > 0
        ? flexCurrent.map((value) => value / flexCurrentTotal)
        : nodes.map(() => 1 / nodes.length);

    let assigned = minTotal;
    for (let index = 0; index < nodes.length; index += 1) {
        if (index === nodes.length - 1) {
            sizes[index] = resolvedTarget - assigned;
            break;
        }

        const remainingMin = mins.slice(index + 1).reduce((sum, value) => sum + value, 0);
        const remainingTarget = resolvedTarget - assigned - remainingMin;
        const rawExtra = flexibleTotal * weights[index];
        const nextSize = Math.max(mins[index], quantizeSize(mins[index] + rawExtra, unit));
        sizes[index] = Math.min(nextSize, mins[index] + Math.max(0, remainingTarget));
        assigned += sizes[index];
    }

    let diff = resolvedTarget - sizes.reduce((sum, value) => sum + value, 0);
    while (diff !== 0) {
        const step = diff > 0 ? unit : -unit;
        let updated = false;
        for (let index = nodes.length - 1; index >= 0; index -= 1) {
            const nextValue = sizes[index] + step;
            if (nextValue < mins[index]) continue;
            sizes[index] = nextValue;
            diff -= step;
            updated = true;
            if (Math.abs(diff) < unit) {
                sizes[index] += diff;
                diff = 0;
            }
            if (diff === 0) break;
        }
        if (!updated) break;
    }

    return sizes;
}

function applyColumnLayout(nodes, x, y, width, heights) {
    let cursorY = y;
    nodes.forEach((node, index) => {
        syncDeckNodeSize(node, width, heights[index]);
        node.pos[0] = x;
        node.pos[1] = cursorY;
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        cursorY += heights[index];
    });
}

function applyRowLayout(nodes, x, y, widths, height) {
    let cursorX = x;
    nodes.forEach((node, index) => {
        syncDeckNodeSize(node, widths[index], height);
        node.pos[0] = cursorX;
        node.pos[1] = y;
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        cursorX += widths[index];
    });
}

function normalizeSharedEdgePair(a, b, side, graph, snap = DEFAULT_DECK_SNAP) {
    if (!a || !b || !side || !graph) return false;

    if (side === "left" || side === "right") {
        const leftSeed = side === "right" ? a : b;
        const rightSeed = side === "right" ? b : a;
        const leftColumn = sortDeckNodesByAxis(collectDeckLine(leftSeed, graph, "top", "bottom"), "y");
        const rightColumn = sortDeckNodesByAxis(collectDeckLine(rightSeed, graph, "top", "bottom"), "y");
        if (leftColumn.length === 0 || rightColumn.length === 0) return false;
        const leftWidth = getNodeAxisSize(leftSeed, "width");
        const rightWidth = getNodeAxisSize(rightSeed, "width");
        const totalHeight = Math.max(getNodeAxisSize(leftSeed, "height"), getNodeAxisSize(rightSeed, "height"));
        const leftHeights = fitSizesToTotal(leftColumn, "height", totalHeight, snap);
        const rightHeights = fitSizesToTotal(rightColumn, "height", totalHeight, snap);
        const topY = Math.min(...leftColumn.concat(rightColumn).map((node) => Number(node.pos?.[1]) || 0));
        const leftX = Number(leftSeed.pos?.[0]) || 0;
        const rightX = leftX + leftWidth;

        applyColumnLayout(leftColumn, leftX, topY, leftWidth, leftHeights);
        applyColumnLayout(rightColumn, rightX, topY, rightWidth, rightHeights);
        return true;
    }

    if (side === "top" || side === "bottom") {
        const topSeed = side === "bottom" ? a : b;
        const bottomSeed = side === "bottom" ? b : a;
        const topRow = sortDeckNodesByAxis([topSeed], "x");
        const bottomRow = sortDeckNodesByAxis([bottomSeed], "x");
        const topHeight = getNodeAxisSize(topSeed, "height");
        const bottomHeight = getNodeAxisSize(bottomSeed, "height");
        const totalWidth = Math.max(getNodeAxisSize(topSeed, "width"), getNodeAxisSize(bottomSeed, "width"));
        const topWidths = fitSizesToTotal(topRow, "width", totalWidth, snap);
        const bottomWidths = fitSizesToTotal(bottomRow, "width", totalWidth, snap);
        const leftX = Math.min(Number(topSeed.pos?.[0]) || 0, Number(bottomSeed.pos?.[0]) || 0);
        const topY = Number(topSeed.pos?.[1]) || 0;
        const bottomY = topY + topHeight;

        applyRowLayout(topRow, leftX, topY, topWidths, topHeight);
        applyRowLayout(bottomRow, leftX, bottomY, bottomWidths, bottomHeight);
        return true;
    }

    return false;
}

export function normalizeDockPair(a, b, side, graph, snap = DEFAULT_DECK_SNAP) {
    return normalizeSharedEdgePair(a, b, side, graph, snap);
}

function setPeerDeckNeighbor(node, side, neighborId = null) {
    const props = ensureDeckProps(node);
    if (!props?.deckEdges || !Object.prototype.hasOwnProperty.call(props.deckEdges, side)) return false;
    props.deckEdges[side] = neighborId ?? null;
    return true;
}

function connectPeerDeckEdge(a, side, b) {
    if (!a || !b || !side) return false;
    const oppositeSide = getOppositeDeckSide(side);
    if (!oppositeSide) return false;
    setPeerDeckNeighbor(a, side, b.id);
    setPeerDeckNeighbor(b, oppositeSide, a.id);
    return true;
}

function disconnectPeerDeckEdge(node, graph, side) {
    if (!node || !graph || !side) return false;
    const neighbor = getPeerDeckNeighbor(node, graph, side);
    const oppositeSide = getOppositeDeckSide(side);
    let changed = false;
    if (neighbor && oppositeSide && neighbor.properties?.deckEdges?.[oppositeSide] === node.id) {
        setPeerDeckNeighbor(neighbor, oppositeSide, null);
        changed = true;
    }
    if (node.properties?.deckEdges?.[side] !== null && node.properties?.deckEdges?.[side] !== undefined) {
        setPeerDeckNeighbor(node, side, null);
        changed = true;
    }
    return changed;
}

function getAdjacentDeckNodes(node, graph) {
    if (!node || !graph) return [];
    const neighbors = new Map();

    ["left", "right", "top", "bottom"].forEach((side) => {
        const neighbor = getPeerDeckNeighbor(node, graph, side);
        if (neighbor) neighbors.set(neighbor.id, neighbor);
    });

    const parent = getDeckNodeById(graph, node?.properties?.deckParentId);
    if (parent) neighbors.set(parent.id, parent);

    getDeckNodes(graph).forEach((candidate) => {
        if (candidate.id === node.id) return;
        if (candidate.properties?.deckParentId === node.id) {
            neighbors.set(candidate.id, candidate);
            return;
        }
        if (["left", "right", "top", "bottom"].some((side) => candidate.properties?.deckEdges?.[side] === node.id)) {
            neighbors.set(candidate.id, candidate);
        }
    });

    return [...neighbors.values()];
}

function getLegacyDeckSideBetween(node, neighbor) {
    if (!node || !neighbor) return null;
    if (node.properties?.deckParentId === neighbor.id) {
        return getOppositeDeckSide(node.properties?.deckDockSide || null);
    }
    if (neighbor.properties?.deckParentId === node.id) {
        return neighbor.properties?.deckDockSide || null;
    }
    return null;
}

export function getOccupiedDeckEdges(node, graph) {
    if (!node) return new Set();
    const occupied = new Set();
    ["left", "right", "top", "bottom"].forEach((side) => {
        if (getPeerDeckNeighbor(node, graph, side)) occupied.add(side);
    });
    getAdjacentDeckNodes(node, graph).forEach((neighbor) => {
        const legacySide = getLegacyDeckSideBetween(node, neighbor);
        if (legacySide && !occupied.has(legacySide)) occupied.add(legacySide);
    });
    return occupied;
}

export function getNodeOnDeckEdge(node, graph, side) {
    if (!node || !graph || !side) return null;
    const peerNeighbor = getPeerDeckNeighbor(node, graph, side);
    if (peerNeighbor) return peerNeighbor;
    return getAdjacentDeckNodes(node, graph).find((neighbor) => getLegacyDeckSideBetween(node, neighbor) === side) || null;
}

export function getDeckCornerOverride(node, graph) {
    if (!node || !graph) return null;

    const occupied = getOccupiedDeckEdges(node, graph);
    if (occupied.size === 0) return null;

    const override = [null, null, null, null];
    if (occupied.has("left")) {
        override[0] = 0;
        override[3] = 0;
    }
    if (occupied.has("right")) {
        override[1] = 0;
        override[2] = 0;
    }
    if (occupied.has("top")) {
        override[0] = 0;
        override[1] = 0;
    }
    if (occupied.has("bottom")) {
        override[2] = 0;
        override[3] = 0;
    }
    return override;
}

export function getDeckNodes(graph) {
    return (graph?._nodes || []).filter(isDeckableDerpNode);
}

export function isNodeDocked(node, graph) {
    if (!node) return false;
    return getOccupiedDeckEdges(node, graph).size > 0;
}

export function getDeckParent(node, graph) {
    const parentId = node?.properties?.deckParentId;
    if (parentId !== null && parentId !== undefined) {
        return getDeckNodeById(graph, parentId);
    }
    const dockSide = node?.properties?.deckDockSide;
    const oppositeSide = getOppositeDeckSide(dockSide);
    return oppositeSide ? getPeerDeckNeighbor(node, graph, oppositeSide) : null;
}

export function getDeckChildren(node, graph) {
    if (!node) return [];
    const children = new Map();

    getDeckNodes(graph).forEach((candidate) => {
        if (candidate.id === node.id) return;
        if (candidate.properties?.deckParentId === node.id) {
            children.set(candidate.id, candidate);
            return;
        }
        const dockSide = candidate.properties?.deckDockSide;
        if (!dockSide) return;
        if (candidate.properties?.deckEdges?.[getOppositeDeckSide(dockSide)] === node.id) {
            children.set(candidate.id, candidate);
        }
    });

    return [...children.values()];
}

function getLegacyDeckParent(node, graph) {
    return getDeckParent(node, graph);
}

function getLegacyDeckChildren(node, graph) {
    return getDeckChildren(node, graph);
}

function compareDeckRootCandidates(a, b) {
    const ay = Number(a?.pos?.[1]) || 0;
    const by = Number(b?.pos?.[1]) || 0;
    if (ay !== by) return ay - by;

    const ax = Number(a?.pos?.[0]) || 0;
    const bx = Number(b?.pos?.[0]) || 0;
    if (ax !== bx) return ax - bx;

    if (a?.id === b?.id) return 0;
    return a?.id > b?.id ? 1 : -1;
}

function getStableDeckRootCandidate(members = []) {
    if (!Array.isArray(members) || members.length === 0) return null;
    return [...members].sort(compareDeckRootCandidates)[0] || null;
}

function getSideAxis(side) {
    if (side === "left" || side === "right") return "horizontal";
    if (side === "top" || side === "bottom") return "vertical";
    return null;
}

function getDeckGroupAxis(node, graph) {
    const members = getDeckMembers(node, graph);
    if (!members || members.length <= 1) return null;

    let hasHorizontal = false;
    let hasVertical = false;
    for (const member of members) {
        const occupied = getOccupiedDeckEdges(member, graph);
        if (occupied.has("left") || occupied.has("right")) hasHorizontal = true;
        if (occupied.has("top") || occupied.has("bottom")) hasVertical = true;
        if (hasHorizontal && hasVertical) return "mixed";
    }

    if (hasHorizontal) return "horizontal";
    if (hasVertical) return "vertical";
    return null;
}

export function getDirectDeckNeighbors(node, graph) {
    return getAdjacentDeckNodes(node, graph);
}

export function getDeckRoot(node, graph) {
    if (!node) return null;
    const members = getDeckMembers(node, graph);
    if (members.length === 0) return node;
    return getStableDeckRootCandidate(members) || node;
}

export function getDeckMembers(rootNode, graph) {
    if (!rootNode) return [];
    const queue = [rootNode];
    const members = [];
    const seen = new Set();

    while (queue.length > 0) {
        const node = queue.shift();
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        members.push(node);
        queue.push(...getAdjacentDeckNodes(node, graph));
    }

    return members;
}

export function isLinearDeckGroup(node, graph, axis = null) {
    const members = getDeckMembers(node, graph);
    if (members.length <= 1) return false;

    const allowedSides = axis === "horizontal"
        ? new Set(["left", "right"])
        : axis === "vertical"
            ? new Set(["top", "bottom"])
            : null;
    if (!allowedSides) return false;

    const degreeMap = new Map();
    let endpointCount = 0;

    for (const member of members) {
        const occupied = getOccupiedDeckEdges(member, graph);
        let degree = 0;

        for (const side of occupied) {
            if (!allowedSides.has(side)) return false;
            const neighbor = getNodeOnDeckEdge(member, graph, side);
            if (!neighbor) return false;
            degree += 1;
        }

        if (degree === 0 || degree > 2) return false;
        degreeMap.set(member.id, degree);
        if (degree === 1) endpointCount += 1;
    }

    return endpointCount === 2;
}

export function isNodeInDeckBranch(branchRoot, candidateNode, graph) {
    if (!branchRoot || !candidateNode) return false;
    return getDeckMembers(branchRoot, graph).some((node) => node.id === candidateNode.id);
}

export function canDeckNodeToLeader(node, leader, graph, side = null) {
    if (!node || !leader) {
        dockDebugLog("reject: missing node/leader", { nodeId: node?.id, leaderId: leader?.id, side });
        return false;
    }
    if (node.id === leader.id) {
        dockDebugLog("reject: self dock", { nodeId: node.id, side });
        return false;
    }
    if (!isDeckableDerpNode(node) || !isDeckableDerpNode(leader)) {
        dockDebugLog("reject: non-deckable", { nodeId: node.id, leaderId: leader.id, side });
        return false;
    }
    if (!isClosedDeckTarget(leader)) {
        dockDebugLog("reject: closed target", { leaderId: leader.id, side });
        return false;
    }
    if (isNodeInDeckBranch(node, leader, graph)) {
        dockDebugLog("reject: same branch", { nodeId: node.id, leaderId: leader.id, side });
        return false;
    }
    if (isNodeDocked(node, graph)) {
        dockDebugLog("reject: node already docked", { nodeId: node.id, side });
        return false;
    }
    if (!side) return true;

    const attachLeader = getDeckAttachLeaderForSide(leader, side, graph);
    if (!attachLeader) {
        dockDebugLog("reject: missing attach leader", { nodeId: node.id, leaderId: leader.id, side });
        return false;
    }
    if (attachLeader.id === node.id) {
        dockDebugLog("reject: attach leader is self", { nodeId: node.id, side });
        return false;
    }
    if (isNodeInDeckBranch(node, attachLeader, graph)) {
        dockDebugLog("reject: same branch via attach leader", { nodeId: node.id, attachLeaderId: attachLeader.id, side });
        return false;
    }

    const leaderOccupied = getOccupiedDeckEdges(attachLeader, graph);
    if (leaderOccupied.has(side)) {
        dockDebugLog("reject: attach leader side occupied", {
            nodeId: node.id,
            attachLeaderId: attachLeader.id,
            side,
            occupied: [...leaderOccupied],
        });
        return false;
    }

    const nodeOccupied = getOccupiedDeckEdges(node, graph);
    const oppositeSide = getOppositeDeckSide(side);
    if (oppositeSide && nodeOccupied.has(oppositeSide)) {
        dockDebugLog("reject: node opposite side occupied", {
            nodeId: node.id,
            side,
            oppositeSide,
            occupied: [...nodeOccupied],
        });
        return false;
    }

    const requestedAxis = getSideAxis(side);
    if (requestedAxis) {
        const leaderAxis = getDeckGroupAxis(attachLeader, graph);
        if (leaderAxis === "mixed") {
            dockDebugLog("reject: attach leader group mixed-axis", {
                nodeId: node.id,
                attachLeaderId: attachLeader.id,
                side,
                requestedAxis,
            });
            return false;
        }
        if (leaderAxis && leaderAxis !== requestedAxis) {
            dockDebugLog("reject: axis mismatch", {
                nodeId: node.id,
                attachLeaderId: attachLeader.id,
                side,
                requestedAxis,
                leaderAxis,
            });
            return false;
        }
    }

    dockDebugLog("accept", { nodeId: node.id, leaderId: leader.id, attachLeaderId: attachLeader.id, side });
    return true;
}

function saveDeckNodeAxes(node) {
    if (!node) return;
    const props = ensureDeckProps(node);
    if (!props) return;
    if (!Object.prototype.hasOwnProperty.call(props, "deckSavedAutoWidth")) {
        props.deckSavedAutoWidth = props.autoWidth !== false;
    }
    if (!Object.prototype.hasOwnProperty.call(props, "deckSavedAutoHeight")) {
        props.deckSavedAutoHeight = props.autoHeight !== false;
    }
}

function restoreDeckNodeAxes(node) {
    if (!node?.properties) return false;
    const hasSavedWidth = Object.prototype.hasOwnProperty.call(node.properties, "deckSavedAutoWidth");
    const hasSavedHeight = Object.prototype.hasOwnProperty.call(node.properties, "deckSavedAutoHeight");
    if (!hasSavedWidth && !hasSavedHeight) return false;

    if (hasSavedWidth) node.properties.autoWidth = node.properties.deckSavedAutoWidth;
    if (hasSavedHeight) node.properties.autoHeight = node.properties.deckSavedAutoHeight;
    delete node.properties.deckSavedAutoWidth;
    delete node.properties.deckSavedAutoHeight;

    if (node.layout) node.layout._lastCacheKey = "";
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    return true;
}

export function undeckNode(node, graph = null) {
    const props = ensureDeckProps(node);
    if (!props) return false;
    const activeGraph = graph || node?.graph || null;
    const parent = activeGraph ? getLegacyDeckParent(node, activeGraph) : null;
    const directNeighbors = activeGraph ? getDirectDeckNeighbors(node, activeGraph) : [];
    const hadParent = props.deckParentId !== null && props.deckParentId !== undefined;
    const hadDockSide = props.deckDockSide !== null && props.deckDockSide !== undefined;
    const peerChanged = activeGraph
        ? ["left", "right", "top", "bottom"].reduce((changed, side) => disconnectPeerDeckEdge(node, activeGraph, side) || changed, false)
        : false;
    let legacyNeighborChanged = false;
    directNeighbors.forEach((neighbor) => {
        if (!neighbor?.properties) return;
        if (neighbor.properties.deckParentId === node.id) {
            neighbor.properties.deckParentId = null;
            neighbor.properties.deckDockSide = null;
            legacyNeighborChanged = true;
        }
    });
    props.deckParentId = null;
    props.deckDockSide = null;
    restoreDeckNodeAxes(node);
    if (parent && !isNodeDocked(parent, activeGraph)) {
        restoreDeckNodeAxes(parent);
    }
    return hadParent || hadDockSide || peerChanged || legacyNeighborChanged;
}

export function undockNodeEdges(node, graph = null) {
    const activeGraph = graph || node?.graph || null;
    if (!node || !activeGraph) return false;

    let changed = false;
    const directNeighbors = getDirectDeckNeighbors(node, activeGraph);

    if (isNodeDocked(node, activeGraph)) {
        changed = undeckNode(node, activeGraph) || changed;
    }

    directNeighbors.forEach((neighbor) => {
        if (!neighbor || !isNodeDocked(neighbor, activeGraph)) return;
        if (["left", "right", "top", "bottom"].some((side) => neighbor.properties?.deckEdges?.[side] === node.id)) {
            changed = undeckNode(neighbor, activeGraph) || changed;
        }
    });

    return changed;
}

export function syncDeckNodeSize(node, width, height) {
    if (!node) return false;
    const nextW = Number(width) || 0;
    const nextH = Number(height) || 0;

    const prevW = getNodeSizeValue(node, 0);
    const prevH = getNodeSizeValue(node, 1);
    const changed = prevW !== nextW || prevH !== nextH;

    if (!Array.isArray(node.size)) node.size = [prevW, prevH];

    node.size[0] = nextW;
    node.size[1] = nextH;
    if (!node.properties) node.properties = {};
    node.properties.nodeSize = [nextW, nextH];
    if (!changed) return false;

    if (node.layout) node.layout._lastCacheKey = "";
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    return true;
}

function isWithinDeckSearchRadius(dragRect, targetRect, radius) {
    const dragLeft = dragRect.x;
    const dragRight = dragRect.x + dragRect.w;
    const dragTop = dragRect.y;
    const dragBottom = dragRect.y + dragRect.h;
    const targetLeft = targetRect.x;
    const targetRight = targetRect.x + targetRect.w;
    const targetTop = targetRect.y;
    const targetBottom = targetRect.y + targetRect.h;

    if (targetLeft > dragRight + radius) return false;
    if (targetRight < dragLeft - radius) return false;
    if (targetTop > dragBottom + radius) return false;
    if (targetBottom < dragTop - radius) return false;
    return true;
}

function lockDeckNodeAxes(node, side = null) {
    if (!node) return;
    if (!node.properties) node.properties = {};
    saveDeckNodeAxes(node);

    if (side === "left" || side === "right") {
        node.properties.autoHeight = false;
    } else if (side === "top" || side === "bottom") {
        node.properties.autoWidth = false;
    }
}

export function matchDeckNodeSizes(node, leader, side = null) {
    if (!node || !leader) return false;
    const nodeRect = getNodeRect(node);
    const leaderRect = getNodeRect(leader);

    let nextW = nodeRect.w;
    let nextH = nodeRect.h;
    let nextLeaderW = leaderRect.w;
    let nextLeaderH = leaderRect.h;

    const nodeMinW = getNodeMinWidth(node);
    const nodeMinH = getNodeMinHeight(node);
    const leaderMinW = getNodeMinWidth(leader);
    const leaderMinH = getNodeMinHeight(leader);

    if (side === "left" || side === "right") {
        const targetH = Math.max(nodeRect.h, leaderRect.h, nodeMinH, leaderMinH);
        nextH = targetH;
        nextLeaderH = targetH;
    } else if (side === "top" || side === "bottom") {
        const targetW = Math.max(nodeRect.w, leaderRect.w, nodeMinW, leaderMinW);
        nextW = targetW;
        nextLeaderW = targetW;
    } else {
        const targetW = leaderRect.w >= nodeMinW ? leaderRect.w : nodeMinW;
        const targetH = leaderRect.h >= nodeMinH ? leaderRect.h : nodeMinH;
        nextW = targetW;
        nextH = targetH;
        nextLeaderW = Math.max(leaderMinW, targetW);
        nextLeaderH = Math.max(leaderMinH, targetH);
    }

    const nodeChanged = syncDeckNodeSize(node, nextW, nextH);
    const leaderChanged = syncDeckNodeSize(leader, nextLeaderW, nextLeaderH);
    return nodeChanged || leaderChanged;
}

function forceDockResizeRefresh(node) {
    if (!node) return;
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

export function deckNodeToLeader(node, leader, graph, side = null) {
    const attachLeader = side ? getDeckAttachLeaderForSide(leader, side, graph) : leader;
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(attachLeader, side, node);
    matchDeckNodeSizes(node, attachLeader, side);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, DEFAULT_DECK_SNAP);
    normalizeDockPair(attachLeader, node, side, graph, DEFAULT_DECK_SNAP);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    return true;
}

export function finalizeDeck(node, leader, graph, side = null, snap = DEFAULT_DECK_SNAP) {
    const attachLeader = side ? getDeckAttachLeaderForSide(leader, side, graph) : leader;
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    const targetInfo = { targetNode: attachLeader, edge: { side } };
    applyDeckEdgeSnap(node, targetInfo, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(attachLeader, side, node);
    matchDeckNodeSizes(node, attachLeader, side);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    normalizeDockPair(attachLeader, node, side, graph, snap);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    return true;
}

export function finalizeDeckTarget(node, targetInfo, graph, snap = DEFAULT_DECK_SNAP) {
    if (!node || !targetInfo?.targetNode) return false;
    const side = targetInfo.edge?.side || null;

    if (targetInfo.edge?.stackMode) {
        const occupied = targetInfo.targetNode;
        const stackSide = targetInfo.edge?.stackSide || "bottom";
        const occupiedRect = getNodeRect(occupied);

        if (stackSide === "bottom") {
            const minH = getNodeMinHeight(occupied, snap);
            if (occupiedRect.h <= minH) return false;
            syncDeckNodeSize(occupied, occupiedRect.w, minH);
        } else if (stackSide === "right") {
            const minW = getNodeMinWidth(occupied, snap);
            if (occupiedRect.w <= minW) return false;
            syncDeckNodeSize(occupied, minW, occupiedRect.h);
        }

        lockDeckNodeAxes(node, stackSide);
        lockDeckNodeAxes(occupied, stackSide);
        matchDeckNodeSizes(node, occupied, stackSide);
        applyDeckEdgeSnap(node, { targetNode: occupied, edge: { side: stackSide } }, snap);
        const props = ensureDeckProps(node);
        props.deckParentId = occupied.id;
        props.deckDockSide = stackSide;
        connectPeerDeckEdge(occupied, stackSide, node);
        matchDeckNodeSizes(node, occupied, stackSide);
        applyDeckEdgeSnap(node, { targetNode: occupied, edge: { side: stackSide } }, snap);
        normalizeDockPair(occupied, node, stackSide, graph, snap);
        normalizeVerticalStackPins(occupied, graph, occupied?.properties?.pinActive === true ? occupied : node);
        forceDockResizeRefresh(node);
        forceDockResizeRefresh(occupied);
        return true;
    }

    const attachLeader = side ? getDeckAttachLeaderForSide(targetInfo.targetNode, side, graph) : targetInfo.targetNode;
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(attachLeader, side, node);
    matchDeckNodeSizes(node, attachLeader, side);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    normalizeDockPair(attachLeader, node, side, graph, snap);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    return true;
}

export function captureDeckOffsets(rootNode, graph) {
    const root = getDeckRoot(rootNode, graph);
    if (!root) return new Map();

    const baseX = Number(root.pos?.[0]) || 0;
    const baseY = Number(root.pos?.[1]) || 0;
    const offsets = new Map();

    getDeckMembers(root, graph).forEach((node) => {
        offsets.set(node.id, [
            (Number(node.pos?.[0]) || 0) - baseX,
            (Number(node.pos?.[1]) || 0) - baseY,
        ]);
    });

    return offsets;
}

export function captureDeckPositions(rootNode, graph) {
    const root = getDeckRoot(rootNode, graph);
    if (!root) return new Map();

    const positions = new Map();
    getDeckMembers(root, graph).forEach((node) => {
        positions.set(node.id, [
            Number(node.pos?.[0]) || 0,
            Number(node.pos?.[1]) || 0,
        ]);
    });

    return positions;
}

export function moveDeck(rootNode, graph, offsets = new Map(), snap = DEFAULT_DECK_SNAP) {
    const root = getDeckRoot(rootNode, graph);
    if (!root) return [];

    const rootX = Number(root.pos?.[0]) || 0;
    const rootY = Number(root.pos?.[1]) || 0;
    const members = getDeckMembers(root, graph);

    members.forEach((node) => {
        if (node.id === root.id) return;
        const [dx, dy] = offsets.get(node.id) || [0, 0];
        node.pos[0] = snapValue(rootX + dx, snap);
        node.pos[1] = snapValue(rootY + dy, snap);
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    });

    return members;
}

export function moveDeckByDelta(graph, positions = new Map(), dx = 0, dy = 0, snap = DEFAULT_DECK_SNAP) {
    if (!graph || !(positions instanceof Map) || positions.size === 0) return [];

    const moved = [];
    positions.forEach((startPos, nodeId) => {
        const node = getDeckNodeById(graph, nodeId);
        if (!node) return;
        const startX = Number(startPos?.[0]) || 0;
        const startY = Number(startPos?.[1]) || 0;
        node.pos[0] = snapValue(startX + dx, snap);
        node.pos[1] = snapValue(startY + dy, snap);
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        moved.push(node);
    });

    return moved;
}

export function findDeckTarget(dragNode, graph, options = {}) {
    return resolveDockTarget({
        dragNode,
        graph,
        options,
        constants: {
            DEFAULT_DECK_RADIUS,
            DEFAULT_DECK_GHOST_THICKNESS,
        },
        utils: {
            isFiniteNumber,
            getNodeRect,
            isClosedDeckTarget,
            isWithinDeckSearchRadius,
            getDeckNodes,
            getDeckSideDistance,
            getPeerDeckNeighbor,
            getNodeMinHeight,
            getNodeMinWidth,
            getDeckGhostRect,
            getRectEdgeLine,
            getDeckAttachLeaderForSide,
            canDeckNodeToLeader,
            dockDebugLog,
        },
    });
}

export function applyDeckEdgeSnap(node, targetInfo, snap = DEFAULT_DECK_SNAP) {
    if (!node || !targetInfo?.targetNode || !targetInfo?.edge?.side) return false;

    const target = getNodeRect(targetInfo.targetNode);
    const self = getNodeRect(node);
    const side = targetInfo.edge.side;

    if (side === "left") {
        node.pos[0] = snapValue(target.x - self.w, snap);
        node.pos[1] = snapValue(target.y, snap);
    } else if (side === "right") {
        node.pos[0] = snapValue(target.x + target.w, snap);
        node.pos[1] = snapValue(target.y, snap);
    } else if (side === "top") {
        node.pos[0] = snapValue(target.x, snap);
        node.pos[1] = snapValue(target.y - self.h, snap);
    } else if (side === "bottom") {
        node.pos[0] = snapValue(target.x, snap);
        node.pos[1] = snapValue(target.y + target.h, snap);
    } else {
        return false;
    }

    return true;
}

function reflowDockedNeighbors(node, graph, snap, moved = [], seen = new Set(), fromNodeId = null) {
    if (!node || !graph || seen.has(node.id)) return moved;
    seen.add(node.id);

    ["left", "right", "top", "bottom"].forEach((side) => {
        const neighbor = getPeerDeckNeighbor(node, graph, side);
        if (!neighbor || neighbor.id === fromNodeId) return;
        applyDeckEdgeSnap(neighbor, { targetNode: node, edge: { side } }, snap);
        moved.push(neighbor);
        reflowDockedNeighbors(neighbor, graph, snap, moved, seen, node.id);
    });

    return moved;
}

export function reflowDockedChildren(node, graph, snap = DEFAULT_DECK_SNAP) {
    return reflowDockedNeighbors(node, graph, snap);
}

export function normalizeDockedLayout(node, graph, snap = DEFAULT_DECK_SNAP) {
    if (!node || !graph) return [];
    const members = getDeckMembers(node, graph);
    const normalized = [];

    for (let pass = 0; pass < 2; pass += 1) {
        const seenEdges = new Set();
        members.forEach((member) => {
            ["left", "right", "top", "bottom"].forEach((side) => {
                const neighbor = getPeerDeckNeighbor(member, graph, side);
                if (!neighbor) return;
                const edgeKey = [Math.min(member.id, neighbor.id), Math.max(member.id, neighbor.id), side === "left" || side === "right" ? "h" : "v"].join(":");
                if (seenEdges.has(edgeKey)) return;
                seenEdges.add(edgeKey);
                if (normalizeSharedEdgePair(member, neighbor, side, graph, snap)) {
                    normalized.push(member, neighbor);
                }
            });
        });
    }

    return normalized;
}

export function drawDeckGhost(ctx, ghost, options = {}) {
    if (!ctx || !ghost) return;

    const fill = options.fill || "rgba(120, 200, 255, 0.18)";
    const stroke = options.stroke || "rgba(120, 200, 255, 0.9)";
    const edgeValid = options.valid !== false;
    const edgeStroke = edgeValid
        ? (options.edgeStrokeValid || "rgba(56, 202, 90, 0.95)")
        : (options.edgeStrokeInvalid || "rgba(255, 149, 0, 0.95)");
    const edgeLineWidth = isFiniteNumber(options.edgeLineWidth) ? options.edgeLineWidth : 4;
    const side = options.side || null;
    const targetEdgeLine = options.targetEdgeLine || null;
    const lineWidth = isFiniteNumber(options.lineWidth) ? options.lineWidth : 2;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h);
    ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);

    if (side) {
        ctx.strokeStyle = edgeStroke;
        ctx.lineWidth = edgeLineWidth;
        ctx.beginPath();
        if (side === "left") {
            ctx.moveTo(ghost.x, ghost.y);
            ctx.lineTo(ghost.x, ghost.y + ghost.h);
        } else if (side === "right") {
            ctx.moveTo(ghost.x + ghost.w, ghost.y);
            ctx.lineTo(ghost.x + ghost.w, ghost.y + ghost.h);
        } else if (side === "top") {
            ctx.moveTo(ghost.x, ghost.y);
            ctx.lineTo(ghost.x + ghost.w, ghost.y);
        } else if (side === "bottom") {
            ctx.moveTo(ghost.x, ghost.y + ghost.h);
            ctx.lineTo(ghost.x + ghost.w, ghost.y + ghost.h);
        }
        ctx.stroke();
    }

    if (targetEdgeLine) {
        ctx.strokeStyle = edgeStroke;
        ctx.lineWidth = edgeLineWidth;
        ctx.beginPath();
        ctx.moveTo(targetEdgeLine.x1, targetEdgeLine.y1);
        ctx.lineTo(targetEdgeLine.x2, targetEdgeLine.y2);
        ctx.stroke();
    }
    ctx.restore();
}

export class masterDockEngine {
    constructor(graph = null) {
        this.graph = graph;
        this.activeRootId = null;
        this.activeOffsets = new Map();
        this.activePositions = new Map();
        this.lastDeckTargetId = null;
        this.previewTarget = null;
    }

    setGraph(graph) {
        this.graph = graph;
        return this;
    }

    getNodeById(nodeId) {
        return getDeckNodeById(this.graph, nodeId);
    }

    getActiveRoot() {
        return this.getNodeById(this.activeRootId) || null;
    }

    getRoot(node) {
        return getDeckRoot(node, this.graph);
    }

    getMembers(node) {
        return getDeckMembers(node, this.graph);
    }

    beginDrag(node) {
        const root = getDeckRoot(node, this.graph);
        this.activeRootId = root?.id || null;
        this.activeOffsets = root ? captureDeckOffsets(root, this.graph) : new Map();
        this.activePositions = root ? captureDeckPositions(root, this.graph) : new Map();
        return root;
    }

    syncDraggedDeck(node, snap = DEFAULT_DECK_SNAP, delta = null) {
        if (delta && this.activePositions.size > 0) {
            return moveDeckByDelta(
                this.graph,
                this.activePositions,
                Number(delta.dx) || 0,
                Number(delta.dy) || 0,
                snap,
            );
        }

        const root = this.getActiveRoot() || getDeckRoot(node, this.graph);
        if (!root) return [];
        return moveDeck(root, this.graph, this.activeOffsets, snap);
    }

    resolveDeckTarget(node, options = {}) {
        const target = findDeckTarget(node, this.graph, options);
        this.previewTarget = target;
        this.lastDeckTargetId = target?.targetNode?.id || null;
        return target;
    }

    deckTo(node, leader) {
        return deckNodeToLeader(node, leader, this.graph, this.previewTarget?.edge?.side || null);
    }

    finalizeDeck(node, leader, snap = DEFAULT_DECK_SNAP) {
        return finalizeDeck(node, leader, this.graph, this.previewTarget?.edge?.side || null, snap);
    }

    finalizeDeckTarget(node, targetInfo, snap = DEFAULT_DECK_SNAP) {
        return finalizeDeckTarget(node, targetInfo, this.graph, snap);
    }

    applySnap(node, targetInfo, snap = DEFAULT_DECK_SNAP) {
        return applyDeckEdgeSnap(node, targetInfo, snap);
    }

    reflowChildren(node, snap = DEFAULT_DECK_SNAP) {
        return reflowDockedChildren(node, this.graph, snap);
    }

    drawPreview(ctx, options = {}) {
        const preview = this.previewTarget;
        if (!preview?.ghost && !preview?.hoverGhost) return;
        const drawOpts = {
            ...options,
            side: getGhostContactSide(preview?.edge?.side || null),
            valid: preview?.valid !== false,
            targetEdgeLine: preview?.edge?.hoverEdgeLine || null,
        };

        // Always draw hover-edge ghost first so the user sees intent near cursor.
        if (preview?.hoverGhost) {
            drawDeckGhost(ctx, preview.hoverGhost, drawOpts);
        }

        // Draw attach-endpoint ghost too for chain-extension visibility.
        if (preview?.ghost) {
            drawDeckGhost(ctx, preview.ghost, drawOpts);
        }
    }

    undeck(node) {
        return undeckNode(node);
    }

    endDrag() {
        this.activeRootId = null;
        this.activeOffsets = new Map();
        this.activePositions = new Map();
        this.lastDeckTargetId = null;
        this.previewTarget = null;
    }
}
