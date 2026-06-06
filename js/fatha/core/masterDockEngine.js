/**
 * PROJECT: xcpDerpNodes
 * PATH: ./js/fatha/core/masterDockEngine.js
 */

import { dockDebug, snapshotDockNode } from "./dockDebugHelpers.js";
import { resolveDockTarget } from "./dockTargetPicking.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";
import { getDockNodeMinHeight, getDockNodeMinWidth, getSharedDockMinWidth, getSharedDockWidth, resolveDockAttachDimensions, resolveRuntimeDockSize } from "./dockDimensions.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";

const DEFAULT_DECK_SNAP = 10;
const DEFAULT_DECK_RADIUS = 48;
const DEFAULT_DECK_GHOST_THICKNESS = 10;
let deckGraphIndexFrame = null;
let deckGraphIndexGraph = null;
let deckGraphIndex = null;

function dockDebugLog(label, payload = {}) {
    dockDebug(`target:${label}`, payload);
}

function snapshotDockMembers(node, graph) {
    return graph && node ? getDeckMembers(node, graph).map(snapshotDockNode) : [];
}

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

function getDeckGraphIndex(graph) {
    if (!graph) return null;
    const frame = Number(globalThis.app?.canvas?.frame ?? globalThis.app?.canvas?.drawCount) || 0;
    if (deckGraphIndex && deckGraphIndexGraph === graph && deckGraphIndexFrame === frame) return deckGraphIndex;

    const byId = new Map();
    const reverseEdges = new Map();
    const children = new Map();

    getDeckNodes(graph).forEach((node) => {
        byId.set(node.id, node);
    });

    byId.forEach((node) => {
        const parentId = node?.properties?.deckParentId;
        if (parentId !== null && parentId !== undefined) {
            if (!children.has(parentId)) children.set(parentId, []);
            children.get(parentId).push(node);
        }

        const edges = node?.properties?.deckEdges || {};
        ["left", "right", "top", "bottom"].forEach((side) => {
            const neighborId = edges[side];
            if (neighborId === null || neighborId === undefined) return;
            if (!reverseEdges.has(neighborId)) reverseEdges.set(neighborId, []);
            reverseEdges.get(neighborId).push({ node, side });
        });
    });

    deckGraphIndex = { byId, reverseEdges, children };
    deckGraphIndexGraph = graph;
    deckGraphIndexFrame = frame;
    return deckGraphIndex;
}

export function setDeckNodePos(node, x, y) {
    if (!node) return false;
    const nextX = Number(x) || 0;
    const nextY = Number(y) || 0;
    const prevX = Number(node.pos?.[0]) || 0;
    const prevY = Number(node.pos?.[1]) || 0;
    if (prevX === nextX && prevY === nextY) return false;

    // Node 2.0 syncs its Vue layout store through the LGraphNode.pos setter.
    // Direct element mutation can leave native shells at stale coordinates.
    node.pos = [nextX, nextY];
    return true;
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
    return getDockNodeMinHeight(node, 0, snap);
}

function getNodeMinWidth(node, snap = DEFAULT_DECK_SNAP) {
    return getDockNodeMinWidth(node, 0, snap);
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
        if (getPeerDeckNeighbor(current, graph, side) && isPinnedVerticalInsertTarget(current, graph, side)) break;
        current = next;
    }
    return current || leader;
}

function getPeerDeckNeighbor(node, graph, side) {
    const neighborId = node?.properties?.deckEdges?.[side];
    if (neighborId === null || neighborId === undefined) return null;
    return getDeckGraphIndex(graph)?.byId.get(neighborId) || getDeckNodeById(graph, neighborId);
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

    let assigned = 0;
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
        const resolvedH = heights[index] || getNodeAxisSize(node, "height");
        syncDeckNodeSize(node, width, resolvedH, { silent: true });
        setDeckNodePos(node, x, cursorY);
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        cursorY += resolvedH;
    });
}

function applyRowLayout(nodes, x, y, widths, height) {
    let cursorX = x;
    nodes.forEach((node, index) => {
        syncDeckNodeSize(node, widths[index], height, { silent: true });
        setDeckNodePos(node, cursorX, y);
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        cursorX += widths[index];
    });
}

function getFirstPositiveAxisSize(nodes = [], axis = "width", fallback = 0) {
    for (const node of nodes) {
        const size = getNodeAxisSize(node, axis);
        if (size > 0) return size;
    }
    return Number(fallback) || 0;
}

function getFirstFinitePosition(nodes = [], index = 0, fallback = 0) {
    for (const node of nodes) {
        const value = node?.pos?.[index];
        if (isFiniteNumber(value)) return value;
    }
    return Number(fallback) || 0;
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
        const totalHeight = Math.max(
            ...leftColumn.concat(rightColumn).map((node) => getNodeAxisSize(node, "height"))
        );
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
        const column = sortDeckNodesByAxis(collectDeckLine(topSeed, graph, "top", "bottom"), "y");
        if (column.length === 0) return false;
        const width = Math.max(
            getSharedDockWidth(column, getNodeAxisSize(topSeed, "width") || getNodeAxisSize(bottomSeed, "width")),
            getSharedDockMinWidth(column, getNodeAxisSize(topSeed, "width") || getNodeAxisSize(bottomSeed, "width"), snap)
        );
        const heights = column.map((member) => getNodeAxisSize(member, "height"));
        const leftX = getFirstFinitePosition(column, 0);
        const pinnedIndex = column.findIndex((member) => member?.properties?.pinActive === true);
        const topY = pinnedIndex >= 0
            ? (Number(column[pinnedIndex]?.pos?.[1]) || 0) - heights.slice(0, pinnedIndex).reduce((sum, value) => sum + value, 0)
            : Math.min(...column.map((member) => Number(member.pos?.[1]) || 0));

        applyColumnLayout(column, leftX, topY, width, heights);
        return true;
    }

    return false;
}

export function normalizeDockPair(a, b, side, graph, snap = DEFAULT_DECK_SNAP) {
    dockDebug("normalize-pair-before", {
        a: snapshotDockNode(a),
        b: snapshotDockNode(b),
        side,
        snap,
        members: snapshotDockMembers(a, graph),
    });
    const changed = normalizeSharedEdgePair(a, b, side, graph, snap);
    dockDebug("normalize-pair-after", {
        changed,
        a: snapshotDockNode(a),
        b: snapshotDockNode(b),
        side,
        members: snapshotDockMembers(a, graph),
    });
    return changed;
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

function isPinnedVerticalInsertTarget(node, graph, side) {
    return !!(node && graph && (side === "top" || side === "bottom") && node.properties?.pinActive === true && isLinearDeckGroup(node, graph, "vertical"));
}

function connectPeerDeckEdgeForDock(a, side, b, graph) {
    if (!a || !b || !side) return false;
    const oppositeSide = getOppositeDeckSide(side);
    if (!oppositeSide) return false;

    const existing = getPeerDeckNeighbor(a, graph, side);
    if (existing && isPinnedVerticalInsertTarget(a, graph, side)) {
        setPeerDeckNeighbor(existing, oppositeSide, b.id);
        setPeerDeckNeighbor(b, side, existing.id);
    }

    return connectPeerDeckEdge(a, side, b);
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
    const index = getDeckGraphIndex(graph);

    ["left", "right", "top", "bottom"].forEach((side) => {
        const neighbor = getPeerDeckNeighbor(node, graph, side);
        if (neighbor) neighbors.set(neighbor.id, neighbor);
    });

    const parent = index?.byId.get(node?.properties?.deckParentId) || getDeckNodeById(graph, node?.properties?.deckParentId);
    if (parent) neighbors.set(parent.id, parent);

    (index?.children.get(node.id) || []).forEach((candidate) => {
        if (candidate.id === node.id) return;
        neighbors.set(candidate.id, candidate);
    });

    (index?.reverseEdges.get(node.id) || []).forEach(({ node: candidate }) => {
        if (!candidate || candidate.id === node.id) return;
        neighbors.set(candidate.id, candidate);
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
    const index = getDeckGraphIndex(graph);

    (index?.children.get(node.id) || []).forEach((candidate) => {
        if (candidate.id === node.id) return;
        children.set(candidate.id, candidate);
    });

    (index?.reverseEdges.get(node.id) || []).forEach(({ node: candidate }) => {
        if (!candidate || candidate.id === node.id) return;
        const dockSide = candidate.properties?.deckDockSide;
        if (dockSide) {
            if (candidate.properties?.deckEdges?.[getOppositeDeckSide(dockSide)] === node.id) {
                children.set(candidate.id, candidate);
            }
        } else {
            // Fallback: dockSide is null, check all four deck edges for a connection
            // Exclude parents: if this candidate is node's parent, it's handled by getDeckParent
            if (node.properties?.deckParentId === candidate.id) return;
            const edges = candidate.properties?.deckEdges || {};
            if (["left", "right", "top", "bottom"].some(side => edges[side] === node.id)) {
                children.set(candidate.id, candidate);
            }
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
    if (leaderOccupied.has(side) && !isPinnedVerticalInsertTarget(attachLeader, graph, side)) {
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

function refreshDeckStateWidgets(nodes = []) {
    const seen = new Set();
    nodes.forEach((node) => {
        if (!node || seen.has(node.id)) return;
        seen.add(node.id);
        node._layoutMapHash = undefined;
        node._lastMapStructure = undefined;
        node._prevDerpState = null;
        node._forceSync = true;
        node._layoutDirty = true;
        if (node.layout) node.layout._lastCacheKey = "";
        if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    });
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
    props.pinActive = false;
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
    const affectedMembers = getDeckMembers(node, activeGraph);
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

    if (changed) {
        refreshDeckStateWidgets(affectedMembers.length > 0 ? affectedMembers : [node, ...directNeighbors]);
    }

    return changed;
}

export function syncDeckNodeSize(node, width, height, options = {}) {
    if (!node) return false;
    const nextW = Number(width) || 0;
    const nextH = Number(height) || 0;
    const silent = options?.silent === true;

    const prevW = getNodeSizeValue(node, 0);
    const prevH = getNodeSizeValue(node, 1);
    const changed = prevW !== nextW || prevH !== nextH;

    dockDebug("sync-node-size", {
        before: snapshotDockNode(node),
        requested: { width: nextW, height: nextH },
        previous: { width: prevW, height: prevH },
        changed,
    });
    setDerpNodeSizeCompat(node, nextW, nextH);
    if (!node.properties) node.properties = {};
    node.properties.nodeSize = [nextW, nextH];
    if (!changed) return false;

    if (node.layout) node.layout._lastCacheKey = "";
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    if (!silent && typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (!silent && typeof node.requestDerpSync === "function") node.requestDerpSync();
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

function settleNodesAfterDockWidthMatch(nodes = []) {
    nodes.forEach((node) => {
        if (!node || typeof node.settleAfterDockWidthMatch !== "function") return;
        node.settleAfterDockWidthMatch();
    });
}

export function matchDeckNodeSizes(node, leader, side = null) {
    if (!node || !leader) return false;
    const nodeRect = getNodeRect(node);
    const leaderRect = getNodeRect(leader);

    const graph = node.graph || leader.graph || globalThis?.app?.graph || null;
    const members = graph ? getDeckMembers(leader, graph) : [leader];
    const next = resolveDockAttachDimensions(node, leader, side, members, DEFAULT_DECK_SNAP);
    const nextW = next.nodeWidth ?? nodeRect.w;
    const nextH = next.nodeHeight ?? nodeRect.h;
    const nextLeaderW = next.leaderWidth ?? leaderRect.w;
    const nextLeaderH = next.leaderHeight ?? leaderRect.h;

    const shouldSettleAfterWidthMatch = side === "top" || side === "bottom";
    const silentNodeSync = shouldSettleAfterWidthMatch && typeof node.settleAfterDockWidthMatch === "function";
    const silentLeaderSync = shouldSettleAfterWidthMatch && typeof leader.settleAfterDockWidthMatch === "function";

    const nodeChanged = syncDeckNodeSize(node, nextW, nextH, { silent: silentNodeSync });
    const leaderChanged = syncDeckNodeSize(leader, nextLeaderW, nextLeaderH, { silent: silentLeaderSync });
    return nodeChanged || leaderChanged;
}

function forceDockResizeRefresh(node) {
    if (!node) return;
    const graph = node.graph || globalThis?.app?.graph || null;
    dockDebug("force-refresh-start", {
        node: snapshotDockNode(node),
        members: snapshotDockMembers(node, graph),
    });
    const preserveVerticalWidths = graph && getDeckGroupAxis(node, graph) === "vertical"
        ? getDeckMembers(node, graph).map((member) => [member, getNodeSizeValue(member, 0)])
        : null;
    const restoreVerticalWidths = () => {
        if (!preserveVerticalWidths) return;
        preserveVerticalWidths.forEach(([member, width]) => {
            if (!member || width <= 0 || getNodeSizeValue(member, 0) === width) return;
            syncDeckNodeSize(member, width, getNodeSizeValue(member, 1));
        });
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
    restoreVerticalWidths();
    dockDebug("force-refresh-after-handle", {
        node: snapshotDockNode(node),
        members: snapshotDockMembers(node, graph),
    });
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
        restoreVerticalWidths();
        dockDebug("force-refresh-wake-after-handle", {
            node: snapshotDockNode(node),
            members: snapshotDockMembers(node, graph),
        });
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        syncDerpShield(node);
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    }, 0);
}

export function deckNodeToLeader(node, leader, graph, side = null) {
    const attachLeader = side ? getDeckAttachLeaderForSide(leader, side, graph) : leader;
    dockDebug("deck-node-to-leader-start", {
        node: snapshotDockNode(node),
        leader: snapshotDockNode(leader),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        leaderMembers: snapshotDockMembers(attachLeader, graph),
    });
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, node, graph);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, DEFAULT_DECK_SNAP);
    normalizeDockPair(attachLeader, node, side, graph, DEFAULT_DECK_SNAP);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    dockDebug("deck-node-to-leader-end", {
        node: snapshotDockNode(node),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        members: snapshotDockMembers(attachLeader, graph),
    });
    return true;
}

export function finalizeDeck(node, leader, graph, side = null, snap = DEFAULT_DECK_SNAP) {
    const attachLeader = side ? getDeckAttachLeaderForSide(leader, side, graph) : leader;
    dockDebug("finalize-deck-start", {
        node: snapshotDockNode(node),
        leader: snapshotDockNode(leader),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        snap,
        leaderMembers: snapshotDockMembers(attachLeader, graph),
    });
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    const targetInfo = { targetNode: attachLeader, edge: { side } };
    applyDeckEdgeSnap(node, targetInfo, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, node, graph);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    normalizeDockPair(attachLeader, node, side, graph, snap);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    dockDebug("finalize-deck-end", {
        node: snapshotDockNode(node),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        members: snapshotDockMembers(attachLeader, graph),
    });
    return true;
}

export function finalizeDeckTarget(node, targetInfo, graph, snap = DEFAULT_DECK_SNAP) {
    if (!node || !targetInfo?.targetNode) return false;
    const side = targetInfo.edge?.side || null;
    dockDebug("finalize-target-start", {
        node: snapshotDockNode(node),
        target: snapshotDockNode(targetInfo.targetNode),
        edge: targetInfo.edge,
        side,
        snap,
        targetMembers: snapshotDockMembers(targetInfo.targetNode, graph),
    });

    if (targetInfo.edge?.stackMode) {
        const occupied = targetInfo.targetNode;
        const stackSide = targetInfo.edge?.stackSide || "bottom";
        if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
        if (typeof occupied.settleBeforeDockSnap === "function") occupied.settleBeforeDockSnap();
        const occupiedRect = getNodeRect(occupied);

        if (stackSide === "bottom") {
            const minH = getNodeMinHeight(occupied, snap);
            if (occupiedRect.h <= minH) return false;
            syncDeckNodeSize(occupied, occupiedRect.w, minH, { silent: true });
        } else if (stackSide === "right") {
            const minW = getNodeMinWidth(occupied, snap);
            if (occupiedRect.w <= minW) return false;
            syncDeckNodeSize(occupied, minW, occupiedRect.h, { silent: true });
        }

        lockDeckNodeAxes(node, stackSide);
        lockDeckNodeAxes(occupied, stackSide);
        matchDeckNodeSizes(node, occupied, stackSide);
        settleNodesAfterDockWidthMatch([node, occupied]);
        applyDeckEdgeSnap(node, { targetNode: occupied, edge: { side: stackSide } }, snap);
        const props = ensureDeckProps(node);
        props.deckParentId = occupied.id;
        props.deckDockSide = stackSide;
        connectPeerDeckEdgeForDock(occupied, stackSide, node, graph);
        matchDeckNodeSizes(node, occupied, stackSide);
        settleNodesAfterDockWidthMatch([node, occupied]);
        applyDeckEdgeSnap(node, { targetNode: occupied, edge: { side: stackSide } }, snap);
        normalizeDockPair(occupied, node, stackSide, graph, snap);
        normalizeVerticalStackPins(occupied, graph, occupied?.properties?.pinActive === true ? occupied : node);
        forceDockResizeRefresh(node);
        forceDockResizeRefresh(occupied);
        dockDebug("finalize-target-stackmode-end", {
            node: snapshotDockNode(node),
            occupied: snapshotDockNode(occupied),
            stackSide,
            members: snapshotDockMembers(occupied, graph),
        });
        return true;
    }

    const attachLeader = side ? getDeckAttachLeaderForSide(targetInfo.targetNode, side, graph) : targetInfo.targetNode;
    if (!canDeckNodeToLeader(node, attachLeader, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, node, graph);
    matchDeckNodeSizes(node, attachLeader, side);
    settleNodesAfterDockWidthMatch([node, attachLeader]);
    applyDeckEdgeSnap(node, { targetNode: attachLeader, edge: { side } }, snap);
    normalizeDockPair(attachLeader, node, side, graph, snap);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : node);
    forceDockResizeRefresh(node);
    forceDockResizeRefresh(attachLeader);
    dockDebug("finalize-target-end", {
        node: snapshotDockNode(node),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        members: snapshotDockMembers(attachLeader, graph),
    });
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
        // Keep stacked members as a rigid body relative to the snapped root.
        // Snapping each child independently introduces per-node rounding drift
        // which causes Y position shift after page refresh.
        setDeckNodePos(node, rootX + dx, rootY + dy);
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    });

    return members;
}

export function moveDeckByDelta(graph, positions = new Map(), dx = 0, dy = 0, snap = DEFAULT_DECK_SNAP, rootNodeId = null) {
    if (!graph || !(positions instanceof Map) || positions.size === 0) return [];

    if (rootNodeId === null || rootNodeId === undefined || !positions.has(rootNodeId)) {
        rootNodeId = [...positions.entries()]
            .sort((a, b) => {
                const ay = Number(a?.[1]?.[1]) || 0;
                const by = Number(b?.[1]?.[1]) || 0;
                if (ay !== by) return ay - by;
                const ax = Number(a?.[1]?.[0]) || 0;
                const bx = Number(b?.[1]?.[0]) || 0;
                if (ax !== bx) return ax - bx;
                return Number(a?.[0]) - Number(b?.[0]);
            })?.[0]?.[0];
    }

    const rootStart = positions.get(rootNodeId) || [0, 0];
    const rootStartX = Number(rootStart?.[0]) || 0;
    const rootStartY = Number(rootStart?.[1]) || 0;
    const snappedRootX = snapValue(rootStartX + dx, snap);
    const snappedRootY = snapValue(rootStartY + dy, snap);
    const snappedDx = snappedRootX - rootStartX;
    const snappedDy = snappedRootY - rootStartY;

    const moved = [];
    positions.forEach((startPos, nodeId) => {
        const node = getDeckNodeById(graph, nodeId);
        if (!node) return;
        const startX = Number(startPos?.[0]) || 0;
        const startY = Number(startPos?.[1]) || 0;
        // Move the whole deck as one rigid body using the root's snapped delta.
        // This preserves contact between collapsed/expanded members and avoids drift.
        setDeckNodePos(node, startX + snappedDx, startY + snappedDy);
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
    const before = snapshotDockNode(node);

    if (side === "left") {
        setDeckNodePos(node, snapValue(target.x - self.w, snap), snapValue(target.y, snap));
    } else if (side === "right") {
        setDeckNodePos(node, snapValue(target.x + target.w, snap), snapValue(target.y, snap));
    } else if (side === "top") {
        setDeckNodePos(node, snapValue(target.x, snap), snapValue(target.y - self.h, snap));
    } else if (side === "bottom") {
        setDeckNodePos(node, snapValue(target.x, snap), snapValue(target.y + target.h, snap));
    } else {
        return false;
    }

    dockDebug("apply-edge-snap", {
        side,
        snap,
        before,
        after: snapshotDockNode(node),
        targetNode: snapshotDockNode(targetInfo.targetNode),
        targetRect: target,
        selfRect: self,
    });

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
                this.activeRootId,
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