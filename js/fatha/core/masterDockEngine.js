/**
 * PROJECT: xcpDerpNodes
 * PATH: ./js/fatha/core/masterDockEngine.js
 */

import { dockDebug, isDockDebugEnabled, snapshotDockNode } from "./dockDebugHelpers.js";
import { resolveDockTarget } from "./dockTargetPicking.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { applyDerpPreferredAutoHeight, resolveDerpPreferredAutoHeight } from "./derpHeightPolicy.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";
import { getActiveVerticalDeckWidthLock, getDockNodeMinHeight, getDockNodeMinWidth, getSharedDockMinWidth, getSharedDockWidth, resolveDockAttachDimensions, resolveRuntimeDockSize } from "./dockDimensions.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";
import { masterPainter } from "../../herbina/masterPainter.js";
import { DEFAULT_PULSE_SPEED, getPulsedColor, parseColor } from "../../herbina/masterAnimator.js";
import { resolveSystemThemeFill, resolveSystemThemePaint } from "../helpers/fathaSystemTheme.js";

const DEFAULT_DECK_SNAP = 10;
const DEFAULT_DECK_RADIUS = 48;
const DEFAULT_DECK_GHOST_THICKNESS = 10;
const DECK_ARRANGEMENT_AUTOMATIC = "automatic";
const DECK_ARRANGEMENT_VERTICAL = "vertical_sandwich";
const DECK_ARRANGEMENT_HORIZONTAL = "horizontal_sandwich";
let deckGraphIndexFrame = null;
let deckGraphIndexGraph = null;
let deckGraphIndex = null;

function invalidateDeckGraphIndex() {
    deckGraphIndexFrame = null;
    deckGraphIndexGraph = null;
    deckGraphIndex = null;
}

function dockDebugLog(label, payload = {}) {
    dockDebug(`target:${label}`, payload);
}

function snapshotDockMembers(node, graph) {
    if (!isDockDebugEnabled()) return [];
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

export function isDeckPressureHub(node) {
    return !!(node?._isDerpImageDeckNode === true || node?.type === "xcpDerpImageDeck");
}

function isDeckPressureBranchSide(side) {
    return side === "left" || side === "right" || side === "top" || side === "bottom";
}

export function getNodeRect(node) {
    return {
        x: Number(node?.pos?.[0]) || 0,
        y: Number(node?.pos?.[1]) || 0,
        w: getNodeSizeValue(node, 0),
        h: getNodeSizeValue(node, 1),
    };
}

function getDeckGhostRect(side, drag, target, ghostThickness, options = {}) {
    const matchTargetSpan = options?.matchTargetSpan === true;
    if (side === "left") {
        return { x: target.x - drag.w, y: target.y, w: drag.w, h: matchTargetSpan ? target.h : drag.h };
    }
    if (side === "right") {
        return { x: target.x + target.w, y: target.y, w: drag.w, h: matchTargetSpan ? target.h : drag.h };
    }
    if (side === "top") {
        return { x: target.x, y: target.y - drag.h, w: matchTargetSpan ? target.w : drag.w, h: drag.h };
    }
    if (side === "bottom") {
        return { x: target.x, y: target.y + target.h, w: matchTargetSpan ? target.w : drag.w, h: drag.h };
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

function getNodeCollapsedPressureHeight(node) {
    const contentMinH = Number(node?.layout?.contentMinHeight) || 0;
    const totalH = Number(node?.layout?.totalHeight) || 0;
    return totalH || contentMinH || (DEFAULT_DECK_SNAP * 2);
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
    return getDeckGraphIndex(graph)?.byId.get(nodeId) || null;
}

export function getDeckAttachLeaderForSide(leader, side, graph) {
    if (!leader || !side || !graph) return leader;
    if (isDeckPressureHub(leader)) {
        const branch = getDeckPressureBranchMembers(leader, graph, side);
        if (branch.length === 0) return leader;
        if (side === "left" || side === "top") return branch[0];
        return branch[branch.length - 1] || leader;
    }
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

function collectDeckLineExcluding(node, graph, negativeSide, positiveSide, excludedNodeId = null) {
    if (!node || !graph || node.id === excludedNodeId) return [];
    const out = [];
    const seen = new Set([excludedNodeId]);
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

function collectDeckLineOrdered(node, graph, negativeSide, positiveSide) {
    if (!node || !graph) return [];
    const seen = new Set();
    const negativeNodes = [];
    let current = getNodeOnDeckEdge(node, graph, negativeSide);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        negativeNodes.unshift(current);
        current = getNodeOnDeckEdge(current, graph, negativeSide);
    }

    const out = [...negativeNodes];
    current = node;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        out.push(current);
        current = getNodeOnDeckEdge(current, graph, positiveSide);
    }

    return out;
}

function collectDeckLineOrderedExcluding(node, graph, negativeSide, positiveSide, excludedNodeId = null) {
    if (!node || !graph || node.id === excludedNodeId) return [];
    const seen = new Set([excludedNodeId]);
    const negativeNodes = [];
    let current = getNodeOnDeckEdge(node, graph, negativeSide);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        negativeNodes.unshift(current);
        current = getNodeOnDeckEdge(current, graph, negativeSide);
    }

    const out = [...negativeNodes];
    current = node;
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        out.push(current);
        current = getNodeOnDeckEdge(current, graph, positiveSide);
    }

    return out;
}


export function getDeckPressureHubForNode(node, graph) {
    if (!node || !graph) return null;
    if (isDeckPressureHub(node)) return node;
    const index = getDeckGraphIndex(graph);
    const parent = index?.byId.get(node.properties?.deckParentId) || null;
    if (isDeckPressureHub(parent)) return parent;

    const visited = new Set();
    const queue = [node];
    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visited.has(current.id)) continue;
        visited.add(current.id);

        const currentParent = index?.byId.get(current.properties?.deckParentId) || null;
        if (isDeckPressureHub(currentParent)) return currentParent;

        const edges = current.properties?.deckEdges || {};
        ["left", "right", "top", "bottom"].forEach((side) => {
            const neighbor = index?.byId.get(edges[side]) || null;
            if (neighbor && !visited.has(neighbor.id)) queue.push(neighbor);
        });
        (index?.reverseEdges.get(current.id) || []).forEach(({ node: neighbor }) => {
            if (neighbor && !visited.has(neighbor.id)) queue.push(neighbor);
        });
    }

    return null;
}

export function getDeckPressureBranchMembers(hub, graph, side) {
    if (!isDeckPressureHub(hub) || !graph || !isDeckPressureBranchSide(side)) return [];
    const first = getPeerDeckNeighbor(hub, graph, side);
    if (!first) return [];
    const branchAxis = getDeckPressureBranchAxis(hub, graph, side);
    const axisSides = branchAxis === "vertical" ? ["top", "bottom"] : ["left", "right"];
    const ordered = collectDeckLineOrderedExcluding(first, graph, axisSides[0], axisSides[1], hub.id);
    return ordered.length > 0 ? ordered : sortDeckNodesByAxis(collectDeckLineExcluding(first, graph, axisSides[0], axisSides[1], hub.id), branchAxis === "vertical" ? "y" : "x");
}

export function getDeckPressureBranchSideForNode(hub, graph, node) {
    if (!isDeckPressureHub(hub) || !graph || !node) return null;
    return ["left", "right", "top", "bottom"].find((side) => getDeckPressureBranchMembers(hub, graph, side).some((member) => member.id === node.id)) || null;
}

export function getDeckPressureFrameRect(hub, graph) {
    if (!isDeckPressureHub(hub) || !graph) return getNodeRect(hub);
    const plan = computeDeckPressureGeometryPlan(hub, graph);
    return plan?.frame ? { x: plan.frame.left, y: plan.frame.top, w: plan.frame.width, h: plan.frame.height } : getNodeRect(hub);
}

function getDeckPressureHubBranchAxis(side) {
    if (side === "left" || side === "right") return "vertical";
    if (side === "top" || side === "bottom") return "horizontal";
    return null;
}

function getLinearDeckGroupAxis(node, graph) {
    if (isLinearDeckGroup(node, graph, "vertical")) return "vertical";
    if (isLinearDeckGroup(node, graph, "horizontal")) return "horizontal";
    return null;
}

function getDeckPressureFollowerForSide(node, graph, side) {
    if (!node || !graph || !isDeckPressureBranchSide(side)) return node;
    const branchAxis = getLinearDeckGroupAxis(node, graph);
    const attachSide = getOppositeDeckSide(side);
    if (!branchAxis || !attachSide) return node;
    if (branchAxis === "horizontal" && attachSide !== "left" && attachSide !== "right") return node;
    if (branchAxis === "vertical" && attachSide !== "top" && attachSide !== "bottom") return node;

    let current = node;
    const seen = new Set();
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        const next = getNodeOnDeckEdge(current, graph, attachSide);
        if (!next) return current;
        current = next;
    }
    return node;
}

function getDeckPressureDockFollower(node, leader, graph, side) {
    return isDeckPressureHub(leader) ? getDeckPressureFollowerForSide(node, graph, side) : node;
}

export function getDeckPressureBranchAxis(hub, graph, side) {
    if (!isDeckPressureHub(hub) || !graph || !isDeckPressureBranchSide(side)) return null;
    const first = getPeerDeckNeighbor(hub, graph, side);
    if (!first) return getDeckPressureHubBranchAxis(side);
    const hasHorizontal = ["left", "right"].some((edge) => {
        const neighbor = getNodeOnDeckEdge(first, graph, edge);
        return neighbor && neighbor.id !== hub.id;
    });
    const hasVertical = ["top", "bottom"].some((edge) => {
        const neighbor = getNodeOnDeckEdge(first, graph, edge);
        return neighbor && neighbor.id !== hub.id;
    });
    if (hasHorizontal && !hasVertical) return "horizontal";
    if (hasVertical && !hasHorizontal) return "vertical";
    return getDeckPressureHubBranchAxis(side);
}

export function isDeckPressureSideHorizontalBranchMember(node, graph) {
    if (!node || !graph) return false;
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (!pressureHub || pressureHub.id === node.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, node);
    if (branchSide !== "left" && branchSide !== "right") return false;
    return getDeckPressureBranchAxis(pressureHub, graph, branchSide) === "horizontal";
}

export function isDeckPressureSideHorizontalHubEdge(node, graph, side) {
    if (side !== "left" && side !== "right") return false;
    if (!isDeckPressureSideHorizontalBranchMember(node, graph)) return false;
    const pressureHub = getDeckPressureHubForNode(node, graph);
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, node);
    const hubFacingSide = branchSide === "left" ? "right" : "left";
    if (side !== hubFacingSide) return false;
    return getNodeOnDeckEdge(node, graph, side)?.id === pressureHub?.id;
}

export function isDeckPressureSideWidthResizeEdge(node, graph, side) {
    if (side !== "left" && side !== "right") return false;
    if (!node || !graph) return false;
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (!pressureHub || pressureHub.id === node.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, node);
    if (branchSide !== "left" && branchSide !== "right") return false;
    const branchAxis = getDeckPressureBranchAxis(pressureHub, graph, branchSide);
    if (branchAxis !== "vertical" && branchAxis !== "horizontal") return false;
    const hubFacingSide = branchSide === "left" ? "right" : "left";
    if (side !== hubFacingSide) return false;
    const x = Number(node.pos?.[0]) || 0;
    const w = getNodeSizeValue(node, 0);
    const edgeX = side === "left" ? x : x + w;
    const hubX = Number(pressureHub.pos?.[0]) || 0;
    const hubW = getNodeSizeValue(pressureHub, 0);
    const targetX = branchSide === "left" ? hubX : hubX + hubW;
    return Math.abs(edgeX - targetX) <= 4;
}

function isDeckPressureHubSeam(node, neighbor, graph) {
    if (!node || !neighbor || !graph) return false;
    return (isDeckPressureHub(node) && getDeckPressureHubForNode(neighbor, graph)?.id === node.id)
        || (isDeckPressureHub(neighbor) && getDeckPressureHubForNode(node, graph)?.id === neighbor.id);
}

function normalizeDeckArrangement(value, fallback = DECK_ARRANGEMENT_VERTICAL) {
    if (value === null || value === undefined) return fallback;
    const raw = String(value || "").trim();
    if (raw === DECK_ARRANGEMENT_VERTICAL || raw === DECK_ARRANGEMENT_HORIZONTAL || raw === DECK_ARRANGEMENT_AUTOMATIC) return raw;
    return fallback;
}

export function hasDeckPressureBranches(hub, graph) {
    if (!isDeckPressureHub(hub) || !graph) return false;
    return ["left", "right", "top", "bottom"].some((side) => getDeckPressureBranchMembers(hub, graph, side).length > 0);
}

function resolveAutomaticDeckArrangement(side) {
    return side === "left" || side === "right"
        ? DECK_ARRANGEMENT_HORIZONTAL
        : DECK_ARRANGEMENT_VERTICAL;
}

function getDeckArrangementSetting() {
    const stored = globalThis?.app?.ui?.settings?.getSettingValue?.("Derp.DeckArrangement");
    const globalValue = globalThis?.DERP_GLOBAL_SETTINGS?.deckArrangement;
    return normalizeDeckArrangement(stored ?? globalValue, DECK_ARRANGEMENT_AUTOMATIC);
}

function ensureDeckPressureArrangement(hub, graph, side = null) {
    if (!isDeckPressureHub(hub)) return DECK_ARRANGEMENT_VERTICAL;
    const props = ensureDeckProps(hub);
    const hasBranches = hasDeckPressureBranches(hub, graph);
    const saved = normalizeDeckArrangement(props.deckArrangement, null);
    if (hasBranches) {
        return saved === DECK_ARRANGEMENT_VERTICAL || saved === DECK_ARRANGEMENT_HORIZONTAL
            ? saved
            : DECK_ARRANGEMENT_VERTICAL;
    }

    const setting = getDeckArrangementSetting();
    if (!side) {
        return setting === DECK_ARRANGEMENT_HORIZONTAL
            ? DECK_ARRANGEMENT_HORIZONTAL
            : DECK_ARRANGEMENT_VERTICAL;
    }
    const arrangement = setting === DECK_ARRANGEMENT_AUTOMATIC
        ? resolveAutomaticDeckArrangement(side)
        : setting;
    props.deckArrangement = arrangement;
    return arrangement;
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

function applyColumnLayout(nodes, x, y, width, heights, options = {}) {
    let cursorY = y;
    const changed = [];
    const deferDirty = options?.deferDirty === true;
    const deferSync = options?.deferSync === true;
    nodes.forEach((node, index) => {
        const resolvedH = heights[index] || getNodeAxisSize(node, "height");
        const sizeChanged = syncDeckNodeSize(node, width, resolvedH, { silent: true, deferDirty, deferSync });
        const posChanged = setDeckNodePos(node, x, cursorY);
        if (sizeChanged || posChanged) {
            if (!deferSync && typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            changed.push(node);
        }
        cursorY += resolvedH;
    });
    return changed;
}

function applyRowLayout(nodes, x, y, widths, height, options = {}) {
    let cursorX = x;
    const changed = [];
    const deferDirty = options?.deferDirty === true;
    const deferSync = options?.deferSync === true;
    nodes.forEach((node, index) => {
        const sizeChanged = syncDeckNodeSize(node, widths[index], height, { silent: true, deferDirty, deferSync });
        const posChanged = setDeckNodePos(node, cursorX, y);
        if (sizeChanged || posChanged) {
            if (!deferSync && typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            changed.push(node);
        }
        cursorX += widths[index];
    });
    return changed;
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
        const fallbackWidth = getNodeAxisSize(topSeed, "width") || getNodeAxisSize(bottomSeed, "width");
        const minWidth = getSharedDockMinWidth(column, fallbackWidth, snap);
        const width = getActiveVerticalDeckWidthLock(column, minWidth) || Math.max(
            getSharedDockWidth(column, fallbackWidth),
            minWidth
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
    const nextId = neighborId ?? null;
    if (props.deckEdges[side] === nextId) return false;
    props.deckEdges[side] = nextId;
    invalidateDeckGraphIndex();
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

    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (pressureHub && hasDeckPressureBranches(pressureHub, graph)) {
        const frame = getDeckPressureFrameRect(pressureHub, graph);
        const rect = getNodeRect(node);
        const tolerance = 0.5;
        const same = (a, b) => Math.abs(a - b) <= tolerance;
        const onLeft = same(rect.x, frame.x);
        const onTop = same(rect.y, frame.y);
        const onRight = same(rect.x + rect.w, frame.x + frame.w);
        const onBottom = same(rect.y + rect.h, frame.y + frame.h);
        return [
            onLeft && onTop ? null : 0,
            onRight && onTop ? null : 0,
            onRight && onBottom ? null : 0,
            onLeft && onBottom ? null : 0,
        ];
    }

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
        const isPressureStackDock = isDeckPressureHub(leader) && !!getLinearDeckGroupAxis(node, graph);
        if (!isPressureStackDock) {
            dockDebugLog("reject: node already docked", { nodeId: node.id, side });
            return false;
        }
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

    const dockFollower = getDeckPressureDockFollower(node, leader, graph, side);
    const nodeOccupied = getOccupiedDeckEdges(dockFollower, graph);
    const oppositeSide = getOppositeDeckSide(side);
    if (oppositeSide && nodeOccupied.has(oppositeSide)) {
        dockDebugLog("reject: node opposite side occupied", {
            nodeId: dockFollower.id,
            side,
            oppositeSide,
            occupied: [...nodeOccupied],
        });
        return false;
    }

    const requestedAxis = isDeckPressureHub(leader)
        ? getDeckPressureHubBranchAxis(side)
        : getSideAxis(side);
    if (requestedAxis) {
        const leaderAxis = getDeckGroupAxis(attachLeader, graph);
        const isPressureHubAttach = isDeckPressureHub(leader);
        if (leaderAxis === "mixed" && !isPressureHubAttach) {
            dockDebugLog("reject: attach leader group mixed-axis", {
                nodeId: node.id,
                attachLeaderId: attachLeader.id,
                side,
                requestedAxis,
                leaderAxis,
            });
            return false;
        }
        if (!isPressureHubAttach && leaderAxis && leaderAxis !== requestedAxis) {
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
        props.deckSavedAutoWidth = props.autoWidth === true;
    }
    if (!Object.prototype.hasOwnProperty.call(props, "deckSavedAutoHeight")) {
        props.deckSavedAutoHeight = resolveDerpPreferredAutoHeight(node);
    }
}

function restoreDeckNodeAxes(node) {
    if (!node?.properties) return false;
    const hasSavedWidth = Object.prototype.hasOwnProperty.call(node.properties, "deckSavedAutoWidth");
    const hasSavedHeight = Object.prototype.hasOwnProperty.call(node.properties, "deckSavedAutoHeight");
    if (!hasSavedWidth && !hasSavedHeight) return false;

    if (hasSavedWidth) node.properties.autoWidth = node.properties.deckSavedAutoWidth;
    if (hasSavedHeight) {
        node.properties._derpPreferredAutoHeight = node.properties.deckSavedAutoHeight === true;
        node.properties.autoHeight = node.properties.deckSavedAutoHeight === true;
    }
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

function clearDeckPressureSideHorizontalWidthLock(node) {
    if (!node) return;
    delete node._deckPressureSideHorizontalWidth;
    if (node.properties) delete node.properties._deckPressureSideHorizontalWidth;
}

function captureDeckPressureSideHorizontalUndockWidths(node, graph) {
    const hub = getDeckPressureHubForNode(node, graph);
    const side = hub ? getDeckPressureBranchSideForNode(hub, graph, node) : null;
    if ((side !== "left" && side !== "right") || getDeckPressureBranchAxis(hub, graph, side) !== "horizontal") return null;
    const members = getDeckPressureBranchMembers(hub, graph, side);
    if (members.length <= 1) return null;
    return members.map((member) => ({
        node: member,
        width: getNodeSizeValue(member, 0),
        height: getNodeSizeValue(member, 1),
    }));
}

function restoreDeckPressureSideHorizontalUndockWidths(snapshot) {
    if (!Array.isArray(snapshot) || snapshot.length === 0) return false;
    let changed = false;
    snapshot.forEach(({ node, width, height }) => {
        if (!node || !(width > 0)) return;
        if (!node.properties) node.properties = {};
        node.properties.autoWidth = false;
        node._horizontalDeckWidthResizeLock = true;
        changed = syncDeckNodeSize(node, width, height > 0 ? height : getNodeSizeValue(node, 1), { silent: true }) || changed;
        node._horizontalDeckWidthBalanceObserved = width;
        node._horizontalDeckWidthBalanceReady = true;
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        syncDerpShield(node);
    });
    setTimeout(() => {
        snapshot.forEach(({ node }) => {
            if (node) node._horizontalDeckWidthResizeLock = false;
        });
    }, 250);
    return changed;
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

function captureDeckPressureHubUndockSize(node) {
    if (!isDeckPressureHub(node)) return null;
    const width = getNodeSizeValue(node, 0);
    const height = getNodeSizeValue(node, 1);
    if (!(width > 0 && height > 0)) return null;
    return { node, width, height };
}

function restoreDeckPressureHubUndockSize(snapshot) {
    const node = snapshot?.node;
    if (!node?.properties) return false;
    node.properties.autoHeight = false;
    syncDeckNodeSize(node, snapshot.width, snapshot.height, { silent: true });
    if (node.properties.contentCollapsed !== true) {
        node.properties._savedExpandedHeight = snapshot.height;
        node._preCollapseHeight = snapshot.height;
    }
    if (node.layout) node.layout._lastCacheKey = "";
    node._forceSync = true;
    node._layoutDirty = true;
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    syncDerpShield(node);
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
            clearDeckPressureSideHorizontalWidthLock(neighbor);
            legacyNeighborChanged = true;
        }
    });
    props.deckParentId = null;
    props.deckDockSide = null;
    clearDeckPressureSideHorizontalWidthLock(node);
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
    const preserveHubSize = captureDeckPressureHubUndockSize(node);
    const preserveSideHorizontalWidths = captureDeckPressureSideHorizontalUndockWidths(node, activeGraph);
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
        restoreDeckPressureHubUndockSize(preserveHubSize);
        restoreDeckPressureSideHorizontalUndockWidths(preserveSideHorizontalWidths);
        refreshDeckStateWidgets(affectedMembers.length > 0 ? affectedMembers : [node, ...directNeighbors]);
        // Reassert after widget refresh; refresh can rebuild ImageDeck layout from auto-size state.
        restoreDeckPressureHubUndockSize(preserveHubSize);
        restoreDeckPressureSideHorizontalUndockWidths(preserveSideHorizontalWidths);
    }

    return changed;
}

export function undeckDeckPressureBranches(hub, graph = null) {
    const activeGraph = graph || hub?.graph || null;
    if (!isDeckPressureHub(hub) || !activeGraph) return false;

    const branchMembers = ["left", "right", "top", "bottom"]
        .flatMap((side) => getDeckPressureBranchMembers(hub, activeGraph, side));
    const affected = new Map([[hub.id, hub], ...branchMembers.map((node) => [node.id, node])]);
    const preserveSideHorizontalWidths = ["left", "right"]
        .map((side) => getPeerDeckNeighbor(hub, activeGraph, side))
        .map((member) => captureDeckPressureSideHorizontalUndockWidths(member, activeGraph))
        .filter(Boolean);

    let changed = false;
    ["left", "right", "top", "bottom"].forEach((side) => {
        const branchRoot = getPeerDeckNeighbor(hub, activeGraph, side);
        if (!branchRoot) return;
        const branchProps = ensureDeckProps(branchRoot);
        changed = disconnectPeerDeckEdge(hub, activeGraph, side) || changed;
        if (branchProps.deckParentId === hub.id) {
            branchProps.deckParentId = null;
            branchProps.deckDockSide = null;
            clearDeckPressureSideHorizontalWidthLock(branchRoot);
            branchProps.pinActive = false;
            changed = true;
        }
        getDeckPressureBranchMembers(hub, activeGraph, side).forEach(clearDeckPressureSideHorizontalWidthLock);
        if (!isNodeDocked(branchRoot, activeGraph)) {
            restoreDeckNodeAxes(branchRoot);
        }
    });

    if (changed) {
        refreshDeckStateWidgets([...affected.values()]);
        preserveSideHorizontalWidths.forEach(restoreDeckPressureSideHorizontalUndockWidths);
    }

    return changed;
}

export function syncDeckNodeSize(node, width, height, options = {}) {
    if (!node) return false;
    const nextW = Number(width) || 0;
    const nextH = Number(height) || 0;
    const silent = options?.silent === true;
    const liveResize = options?.liveResize === true;
    const deferDirty = options?.deferDirty === true;
    const deferSync = options?.deferSync === true;

    const prevW = getNodeSizeValue(node, 0);
    const prevH = getNodeSizeValue(node, 1);
    const changed = prevW !== nextW || prevH !== nextH;

    dockDebug("sync-node-size", () => ({
        before: snapshotDockNode(node),
        requested: { width: nextW, height: nextH },
        previous: { width: prevW, height: prevH },
        changed,
    }));
    if (!node.properties) node.properties = {};
    const storedW = node.properties.nodeSize?.[0];
    const storedH = node.properties.nodeSize?.[1];
    if (!changed) {
        if (storedW !== nextW || storedH !== nextH) node.properties.nodeSize = [nextW, nextH];
        return false;
    }
    setDerpNodeSizeCompat(node, nextW, nextH);
    node.properties.nodeSize = [nextW, nextH];

    if (!liveResize) {
        if (node.layout) node.layout._lastCacheKey = "";
        node._forceSync = true;
        node._layoutDirty = true;
    }
    if (!deferSync && typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    if (!silent && typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (!silent && typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (!deferDirty && typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
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
    const preferredAutoHeight = resolveDerpPreferredAutoHeight(node);
    saveDeckNodeAxes(node);

    if (side === "left" || side === "right") {
        node.properties.autoHeight = false;
    } else if (side === "top" || side === "bottom") {
        node.properties.autoWidth = false;
        if (node.properties.deckForceAutoHeight !== true) {
            node.properties.autoHeight = false;
        }
    }
    applyDerpPreferredAutoHeight(node, preferredAutoHeight);
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
    const keepLeaderHeight = graph && isDeckPressureHub(leader) && (side === "left" || side === "right");
    const nextW = next.nodeWidth ?? nodeRect.w;
    const nextH = next.nodeHeight ?? nodeRect.h;
    const nextLeaderW = next.leaderWidth ?? leaderRect.w;
    const nextLeaderH = keepLeaderHeight ? leaderRect.h : (next.leaderHeight ?? leaderRect.h);

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


function applyDeckPressureAfterDock(hubCandidate, graph, snap = DEFAULT_DECK_SNAP) {
    const pressureHub = getDeckPressureHubForNode(hubCandidate, graph);
    if (!pressureHub) return [];
    return applyDeckPressureLayout(pressureHub, graph, snap);
}

function captureDeckPressureHubAnchor(node, leader, graph) {
    const hub = getDeckPressureHubForNode(leader, graph) || (isDeckPressureHub(leader) ? leader : null);
    if (!hub || !node || node.id === hub.id) return null;
    return { hub, x: Number(hub.pos?.[0]) || 0, y: Number(hub.pos?.[1]) || 0 };
}

function restoreDeckPressureHubAnchor(anchor) {
    if (!anchor?.hub) return false;
    const currentX = Number(anchor.hub.pos?.[0]) || 0;
    const currentY = Number(anchor.hub.pos?.[1]) || 0;
    if (currentX === anchor.x && currentY === anchor.y) return false;
    setDeckNodePos(anchor.hub, anchor.x, anchor.y);
    return true;
}

function captureDeckPressureHubSize(node, leader, graph) {
    const hub = getDeckPressureHubForNode(leader, graph) || (isDeckPressureHub(leader) ? leader : null);
    if (!hub || !node || node.id === hub.id) return null;
    return { hub, w: getNodeSizeValue(hub, 0), h: getNodeSizeValue(hub, 1) };
}

function restoreDeckPressureHubSize(snapshot) {
    if (!snapshot?.hub) return false;
    const currentW = getNodeSizeValue(snapshot.hub, 0);
    const currentH = getNodeSizeValue(snapshot.hub, 1);
    if (currentW === snapshot.w && currentH === snapshot.h) return false;
    return syncDeckNodeSize(snapshot.hub, snapshot.w, snapshot.h, { silent: true });
}

function captureDeckPressureHorizontalStackSnapshot(node, leader, graph, side) {
    if (!graph || !node || !isDeckPressureHub(leader) || (side !== "left" && side !== "right")) return null;
    if (getLinearDeckGroupAxis(node, graph) !== "horizontal") return null;
    const dockFollower = getDeckPressureDockFollower(node, leader, graph, side);
    const members = collectDeckLineOrdered(dockFollower, graph, "left", "right").filter((member) => member?.id !== leader.id);
    if (!dockFollower || members.length <= 1) return null;
    return {
        follower: dockFollower,
        members: members.map((member) => ({
            node: member,
            x: Number(member.pos?.[0]) || 0,
            y: Number(member.pos?.[1]) || 0,
            w: getNodeSizeValue(member, 0),
        })),
        followerX: Number(dockFollower.pos?.[0]) || 0,
        followerY: Number(dockFollower.pos?.[1]) || 0,
    };
}

function restoreDeckPressureHorizontalStackSnapshot(snapshot) {
    if (!snapshot?.follower || !Array.isArray(snapshot.members) || snapshot.members.length === 0) return false;
    const dx = (Number(snapshot.follower.pos?.[0]) || 0) - snapshot.followerX;
    const dy = (Number(snapshot.follower.pos?.[1]) || 0) - snapshot.followerY;
    let changed = false;
    snapshot.members.forEach(({ node, x, y, w }) => {
        if (!node) return;
        node._horizontalDeckWidthResizeLock = true;
        node._deckPressureSideHorizontalWidth = w;
        if (node.properties) node.properties._deckPressureSideHorizontalWidth = w;
        changed = syncDeckNodeSize(node, w, getNodeSizeValue(node, 1), { silent: true }) || changed;
        changed = setDeckNodePos(node, x + dx, y + dy) || changed;
        node._horizontalDeckWidthBalanceObserved = w;
        node._horizontalDeckWidthBalanceReady = true;
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
    });
    setTimeout(() => {
        snapshot.members.forEach(({ node }) => {
            if (node) node._horizontalDeckWidthResizeLock = false;
        });
    }, 250);
    return changed;
}
function maybeResolveDeckPressureArrangement(hubCandidate, graph, side) {
    const hub = getDeckPressureHubForNode(hubCandidate, graph) || (isDeckPressureHub(hubCandidate) ? hubCandidate : null);
    if (!hub) return DECK_ARRANGEMENT_VERTICAL;
    return ensureDeckPressureArrangement(hub, graph, side);
}
export function deckNodeToLeader(node, leader, graph, side = null) {
    const attachLeader = side ? getDeckAttachLeaderForSide(leader, side, graph) : leader;
    const dockFollower = getDeckPressureDockFollower(node, leader, graph, side);
    const hubAnchor = captureDeckPressureHubAnchor(node, leader, graph);
    const hubSize = captureDeckPressureHubSize(node, leader, graph);
    const stackSnapshot = captureDeckPressureHorizontalStackSnapshot(node, leader, graph, side);
    dockDebug("deck-node-to-leader-start", {
        node: snapshotDockNode(node),
        leader: snapshotDockNode(leader),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        leaderMembers: snapshotDockMembers(attachLeader, graph),
    });
    if (!canDeckNodeToLeader(node, leader, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(dockFollower, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    maybeResolveDeckPressureArrangement(leader, graph, side);
    const props = ensureDeckProps(dockFollower);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, dockFollower, graph);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    applyDeckEdgeSnap(dockFollower, { targetNode: attachLeader, edge: { side } }, DEFAULT_DECK_SNAP);
    restoreDeckPressureHorizontalStackSnapshot(stackSnapshot);
    if (!hubAnchor) normalizeDockPair(attachLeader, dockFollower, side, graph, DEFAULT_DECK_SNAP);
    restoreDeckPressureHubAnchor(hubAnchor);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : dockFollower);
    if (!hubAnchor) {
        forceDockResizeRefresh(dockFollower);
        forceDockResizeRefresh(attachLeader);
    }
    applyDeckPressureAfterDock(leader, graph, DEFAULT_DECK_SNAP);
    restoreDeckPressureHubAnchor(hubAnchor);
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
    const dockFollower = getDeckPressureDockFollower(node, leader, graph, side);
    const hubAnchor = captureDeckPressureHubAnchor(node, leader, graph);
    const hubSize = captureDeckPressureHubSize(node, leader, graph);
    const stackSnapshot = captureDeckPressureHorizontalStackSnapshot(node, leader, graph, side);
    dockDebug("finalize-deck-start", {
        node: snapshotDockNode(node),
        leader: snapshotDockNode(leader),
        attachLeader: snapshotDockNode(attachLeader),
        side,
        snap,
        leaderMembers: snapshotDockMembers(attachLeader, graph),
    });
    if (!canDeckNodeToLeader(node, leader, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(dockFollower, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    const targetInfo = { targetNode: attachLeader, edge: { side } };
    applyDeckEdgeSnap(dockFollower, targetInfo, snap);
    maybeResolveDeckPressureArrangement(leader, graph, side);
    const props = ensureDeckProps(dockFollower);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, dockFollower, graph);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    applyDeckEdgeSnap(dockFollower, { targetNode: attachLeader, edge: { side } }, snap);
    restoreDeckPressureHorizontalStackSnapshot(stackSnapshot);
    if (!hubAnchor) normalizeDockPair(attachLeader, dockFollower, side, graph, snap);
    restoreDeckPressureHubAnchor(hubAnchor);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : dockFollower);
    if (!hubAnchor) {
        forceDockResizeRefresh(dockFollower);
        forceDockResizeRefresh(attachLeader);
    }
    applyDeckPressureAfterDock(leader, graph, snap);
    restoreDeckPressureHubAnchor(hubAnchor);
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
    const dockFollower = getDeckPressureDockFollower(node, targetInfo.targetNode, graph, side);
    const hubAnchor = captureDeckPressureHubAnchor(node, targetInfo.targetNode, graph);
    const hubSize = captureDeckPressureHubSize(node, targetInfo.targetNode, graph);
    const stackSnapshot = captureDeckPressureHorizontalStackSnapshot(node, targetInfo.targetNode, graph, side);
    if (!canDeckNodeToLeader(node, targetInfo.targetNode, graph, side)) return false;
    if (typeof node.settleBeforeDockSnap === "function") node.settleBeforeDockSnap();
    if (typeof attachLeader.settleBeforeDockSnap === "function") attachLeader.settleBeforeDockSnap();
    lockDeckNodeAxes(dockFollower, side);
    lockDeckNodeAxes(attachLeader, side);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    applyDeckEdgeSnap(dockFollower, { targetNode: attachLeader, edge: { side } }, snap);
    maybeResolveDeckPressureArrangement(targetInfo.targetNode, graph, side);
    const props = ensureDeckProps(dockFollower);
    props.deckParentId = attachLeader.id;
    props.deckDockSide = side;
    connectPeerDeckEdgeForDock(attachLeader, side, dockFollower, graph);
    matchDeckNodeSizes(dockFollower, attachLeader, side);
    restoreDeckPressureHubSize(hubSize);
    settleNodesAfterDockWidthMatch([dockFollower, attachLeader]);
    applyDeckEdgeSnap(dockFollower, { targetNode: attachLeader, edge: { side } }, snap);
    restoreDeckPressureHorizontalStackSnapshot(stackSnapshot);
    if (!hubAnchor) normalizeDockPair(attachLeader, dockFollower, side, graph, snap);
    restoreDeckPressureHubAnchor(hubAnchor);
    normalizeVerticalStackPins(attachLeader, graph, attachLeader?.properties?.pinActive === true ? attachLeader : dockFollower);
    if (!hubAnchor) {
        forceDockResizeRefresh(dockFollower);
        forceDockResizeRefresh(attachLeader);
    }
    applyDeckPressureAfterDock(targetInfo.targetNode, graph, snap);
    restoreDeckPressureHubAnchor(hubAnchor);
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
            getDeckMembers,
            isLinearDeckGroup,
            getDeckSideDistance,
            getPeerDeckNeighbor,
            getNodeMinHeight,
            getNodeMinWidth,
            getDeckGhostRect,
            getRectEdgeLine,
            getDeckAttachLeaderForSide,
            getDeckPressureHubForNode,
            getDeckPressureFrameRect,
            isDeckPressureHub,
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
    if (node && graph && isLinearDeckGroup(node, graph, "vertical")) {
        const ordered = collectDeckLineOrdered(node, graph, "top", "bottom");
        const column = ordered.length > 0 ? ordered : sortDeckNodesByAxis(collectDeckLine(node, graph, "top", "bottom"), "y");
        if (column.length > 1) {
            const heights = column.map((member) => getNodeAxisSize(member, "height"));
            const fallbackWidth = getNodeAxisSize(node, "width");
            const minWidth = getSharedDockMinWidth(column, fallbackWidth, snap);
            const width = getActiveVerticalDeckWidthLock(column, minWidth) || Math.max(
                getSharedDockWidth(column, fallbackWidth),
                minWidth
            );
            const anchorIndex = Math.max(0, column.findIndex((member) => member?.properties?.pinActive === true));
            const anchorY = Number(column[anchorIndex]?.pos?.[1]) || 0;
            const topY = anchorY - heights.slice(0, anchorIndex).reduce((sum, value) => sum + value, 0);
            return applyColumnLayout(column, getFirstFinitePosition(column, 0), topY, width, heights);
        }
    }
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
                if (isDeckPressureHubSeam(member, neighbor, graph)) return;
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

function getDeckPressureActiveMember(members = []) {
    const now = performance.now?.() || Date.now();
    const fillerCandidates = members.filter((member) => Number(member?._deckPressureSkipFillerUntil || 0) <= now);
    const candidates = fillerCandidates.length > 0 ? fillerCandidates : members;
    return getDeckPressureFreshActiveMember(candidates, now)
        || candidates.find((member) => member?._pressedRegionKey)
        || candidates.find((member) => member?.selected && member?.properties?.contentCollapsed !== true)
        || candidates.find((member) => member?.properties?.contentCollapsed !== true)
        || candidates[0]
        || null;
}

function getDeckPressureFreshActiveMember(members = [], now = performance.now?.() || Date.now()) {
    return members.find((member) => Number(member?._deckPressureActiveUntil || 0) > now)
        || members.find((member) => member?._pressedRegionKey)
        || null;
}

function getDeckPressurePreferredExpandedHeight(member, minimum = 0) {
    const saved = Number(member?.properties?._savedExpandedHeight || 0);
    if (saved > 0) return Math.max(Number(minimum) || 0, saved);
    const previous = Number(member?._preCollapseHeight || 0);
    const live = getNodeSizeValue(member, 1);
    return Math.max(Number(minimum) || 0, previous, live);
}

function setDeckPressureCollapsed(node, collapsed) {
    if (!node?.properties) return false;
    if (node.properties.contentCollapsed === collapsed) return false;
    node.properties.contentCollapsed = collapsed;
    node._deckPressureMinCache = new Map();
    node._layoutDirty = true;
    node._forceSync = true;
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    return true;
}

function getDeckPressureMinSpanForState(node, axis, snap, collapsed) {
    if (!node?.properties) return axis === "vertical" ? getNodeMinHeight(node, snap) : getNodeMinWidth(node, snap);
    if (node._deckPressureMeasuringMinSpan === true) {
        return axis === "vertical" ? getNodeMinHeight(node, snap) : getNodeMinWidth(node, snap);
    }
    const cacheKey = [
        axis,
        collapsed ? 1 : 0,
        snap,
        Math.round(getNodeSizeValue(node, 0)),
        node._layoutMapHash || "",
    ].join(":");
    if (!(node._deckPressureMinCache instanceof Map)) node._deckPressureMinCache = new Map();
    if (node._deckPressureMinCache.has(cacheKey)) return node._deckPressureMinCache.get(cacheKey);
    const previous = node.properties.contentCollapsed;
    node.properties.contentCollapsed = collapsed;
    const recomputeLayout = () => {
        if (node._deckPressureMeasuringMinSpan === true) return;
        node._deckPressureMeasuringMinSpan = true;
        try {
        if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
        if (node.layout && typeof node.layout.compute === "function") {
            node.layout._lastCacheKey = "";
            const measureHeight = collapsed
                ? Math.max((Number(snap) || DEFAULT_DECK_SNAP) * 2, 1)
                : Math.max(getNodeSizeValue(node, 1), 1);
            node.layout.compute({
                x: 0,
                y: 0,
                w: Math.max(getNodeSizeValue(node, 0), getNodeMinWidth(node, snap)),
                h: measureHeight,
            }, getVirtualNodeLayoutMap(node), {
                textTheme: node._t_textSmallPaintData || node._t_textNormalPaintData,
                useAnim: false,
                spawnAnim: false,
                isVirtual: true,
            }, true);
        }
        } finally {
            delete node._deckPressureMeasuringMinSpan;
        }
    };
    recomputeLayout();
    const value = axis === "vertical"
        ? (collapsed ? getNodeCollapsedPressureHeight(node) : getNodeMinHeight(node, snap))
        : getNodeMinWidth(node, snap);
    node.properties.contentCollapsed = previous;
    if (previous !== collapsed) recomputeLayout();
    node._deckPressureMinCache.set(cacheKey, value);
    return value;
}

function getDeckPressureRequiredSpan(members, axis, snap, forcedCollapsedIds = new Set()) {
    return members.reduce((sum, member) => {
        const collapsed = forcedCollapsedIds.has(member.id) || member.properties?.contentCollapsed === true;
        return sum + getDeckPressureMinSpanForState(member, axis, snap, collapsed);
    }, 0);
}

function ensureDeckPressureFillerMember(members) {
    if (!Array.isArray(members) || members.length === 0) return false;
    if (members.some((member) => member?.properties?.contentCollapsed !== true)) return false;
    const filler = getDeckPressureActiveMember(members) || members[members.length - 1];
    return setDeckPressureCollapsed(filler, false);
}

function applyDeckPressureCollapse(members, targetSpan, axis, snap) {
    if (!Array.isArray(members) || members.length <= 1 || targetSpan <= 0) return false;
    const sizeIndex = axis === "vertical" ? 1 : 0;
    const requiredTotal = getDeckPressureRequiredSpan(members, axis, snap);
    if (requiredTotal <= targetSpan + 0.5) return false;

    const active = getDeckPressureActiveMember(members);
    let changed = false;
    const forcedCollapsedIds = new Set();
    const candidates = members
        .filter((member) => member.id !== active?.id && member.properties?.contentCollapsed !== true)
        .sort((a, b) => {
            // sizeIndex is 0 (width/x) for horizontal axis, 1 (height/y) for vertical;
            // it already selects the correct position component, so use it directly.
            const activePos = Number(active?.pos?.[sizeIndex]) || 0;
            const da = Math.abs((Number(a?.pos?.[sizeIndex]) || 0) - activePos);
            const db = Math.abs((Number(b?.pos?.[sizeIndex]) || 0) - activePos);
            return db - da;
        });

    for (const member of candidates) {
        changed = setDeckPressureCollapsed(member, true) || changed;
        forcedCollapsedIds.add(member.id);
        const projectedTotal = getDeckPressureRequiredSpan(members, axis, snap, forcedCollapsedIds);
        if (projectedTotal <= targetSpan + 0.5) break;
    }
    return changed;
}

function getDeckPressureBranchMinSpan(members, axis, snap) {
    if (!Array.isArray(members) || members.length === 0) return 0;
    return members.reduce((sum, member) => sum + getDeckPressureMinSpanForState(member, axis, snap, true), 0);
}

function getDeckPressureRowFixedWidth(member, snap) {
    const unit = Math.max(1, snap);
    const minWidth = quantizeSize(getDeckPressureMinSpanForState(member, "horizontal", snap, member?.properties?.contentCollapsed === true), unit);
    if (member?.properties?.autoWidth !== true) return minWidth;
    return Math.max(minWidth, quantizeSize(getNodeSizeValue(member, 0), unit));
}

function getDeckPressureRowMinSpan(members, snap) {
    if (!Array.isArray(members) || members.length === 0) return 0;
    return members.reduce((sum, member) => sum + getDeckPressureRowFixedWidth(member, snap), 0);
}

function getDeckPressureRowCurrentSpan(members, snap) {
    if (!Array.isArray(members) || members.length === 0) return 0;
    const unit = Math.max(1, snap);
    return members.reduce((sum, member) => {
        const minWidth = getDeckPressureRowFixedWidth(member, snap);
        return sum + Math.max(minWidth, quantizeSize(getNodeSizeValue(member, 0), unit));
    }, 0);
}

function getDeckPressureSideHorizontalLockedWidth(member) {
    const locked = Number(member?._deckPressureSideHorizontalWidth || member?.properties?._deckPressureSideHorizontalWidth);
    return locked > 0 ? locked : getNodeSizeValue(member, 0);
}

export function getDeckPressureSideHorizontalWidthLock(node, graph) {
    if (!isDeckPressureSideHorizontalBranchMember(node, graph)) return 0;
    return getDeckPressureSideHorizontalLockedWidth(node);
}

function getDeckPressureRowCurrentWidths(members) {
    if (!Array.isArray(members) || members.length === 0) return [];
    return members.map((member) => getDeckPressureSideHorizontalLockedWidth(member));
}

function getDeckPressureRowCurrentWidthTotal(members) {
    return getDeckPressureRowCurrentWidths(members).reduce((sum, width) => sum + width, 0);
}

function getDeckPressureColumnCurrentHeights(members, snap) {
    if (!Array.isArray(members) || members.length === 0) return [];
    const unit = Math.max(1, snap);
    return members.map((member) => {
        const minHeight = quantizeSize(getDeckPressureMinSpanForState(member, "vertical", snap, member?.properties?.contentCollapsed === true), unit);
        if (member?.properties?.contentCollapsed === true) return minHeight;
        return Math.max(minHeight, quantizeSize(getNodeSizeValue(member, 1), unit));
    });
}

function getDeckPressureColumnCurrentSpan(members, snap) {
    const heights = getDeckPressureColumnCurrentHeights(members, snap);
    if (!Array.isArray(heights)) return 0;
    return heights.reduce((sum, height) => sum + height, 0);
}

function getDeckPressureBranchHeight(branch, snap) {
    if (!branch?.members?.length) return 0;
    if (branch.axis === "vertical") return getDeckPressureColumnCurrentSpan(branch.members, snap);
    return Math.max(...branch.members.map((member) => getNodeSizeValue(member, 1)), ...branch.members.map((member) => getNodeMinHeight(member, snap)), 0);
}

function getDeckPressureBranchWidth(branch, snap) {
    if (!branch?.members?.length) return 0;
    if (branch.axis === "horizontal") {
        return (branch.side === "left" || branch.side === "right")
            ? getDeckPressureRowCurrentWidthTotal(branch.members)
            : getDeckPressureRowCurrentSpan(branch.members, snap);
    }
    return Math.max(...branch.members.map((member) => getNodeSizeValue(member, 0)), ...branch.members.map((member) => getNodeMinWidth(member, snap)), 0);
}

function getDeckPressureBranchEdgeMinSpan(branch, snap) {
    if (!branch?.members?.length) return 0;
    if (branch.side === "left" || branch.side === "right") {
        if (branch.axis === "vertical") return getDeckPressureBranchMinSpan(branch.members, "vertical", snap);
        return Math.max(...branch.members.map((member) => getNodeMinHeight(member, snap)), 0);
    }
    if (branch.axis === "horizontal") return getDeckPressureRowMinSpan(branch.members, snap);
    return Math.max(...branch.members.map((member) => getNodeMinWidth(member, snap)), 0);
}

export function getDeckPressureHubMinWidth(hub, graph, snap = DEFAULT_DECK_SNAP, fallbackMinWidth = 0) {
    if (!isDeckPressureHub(hub) || !graph) return fallbackMinWidth;
    const topBottomMinWidth = Math.max(...["top", "bottom"].map((side) => {
        const members = getDeckPressureBranchMembers(hub, graph, side);
        return getDeckPressureBranchEdgeMinSpan({ side, members, axis: getDeckPressureBranchAxis(hub, graph, side) }, snap);
    }), 0);
    if (ensureDeckPressureArrangement(hub, graph) !== DECK_ARRANGEMENT_HORIZONTAL) {
        return Math.max(fallbackMinWidth, topBottomMinWidth);
    }
    const sideWidth = ["left", "right"].reduce((sum, side) => {
        const branch = { side, members: getDeckPressureBranchMembers(hub, graph, side), axis: getDeckPressureBranchAxis(hub, graph, side) };
        return sum + getDeckPressureBranchWidth(branch, snap);
    }, 0);
    return Math.max(fallbackMinWidth, topBottomMinWidth - sideWidth);
}

function fitDeckPressureRowWidths(members, targetWidth, snap) {
    if (!Array.isArray(members) || members.length === 0) return [];

    const manualMembers = members.filter((member) => member?.properties?.autoWidth !== true);
    if (manualMembers.length === 0) return fitSizesToTotal(members, "width", targetWidth, snap);

    const unit = Math.max(1, snap);
    const widths = new Map();
    const manualMins = new Map(manualMembers.map((member) => [member.id, quantizeSize(getNodeMinWidth(member, snap), unit)]));
    const fixedTotal = members.reduce((sum, member) => {
        if (member?.properties?.autoWidth !== true) return sum;
        const width = getDeckPressureRowFixedWidth(member, snap);
        widths.set(member.id, width);
        return sum + width;
    }, 0);
    const manualMinTotal = manualMembers.reduce((sum, member) => sum + (manualMins.get(member.id) || 0), 0);
    const resolvedTarget = Math.max(Number(targetWidth) || 0, fixedTotal + manualMinTotal);
    const targetManualTotal = resolvedTarget - fixedTotal;
    const currentManualTotal = manualMembers.reduce((sum, member) => sum + Math.max(0, quantizeSize(getNodeSizeValue(member, 0), unit) - (manualMins.get(member.id) || 0)), 0);
    let assigned = 0;

    manualMembers.forEach((member, index) => {
        const minWidth = manualMins.get(member.id) || 0;
        if (index === manualMembers.length - 1) {
            widths.set(member.id, targetManualTotal - assigned);
            return;
        }

        const extraTotal = Math.max(0, targetManualTotal - manualMinTotal);
        const currentExtra = Math.max(0, quantizeSize(getNodeSizeValue(member, 0), unit) - minWidth);
        const weight = currentManualTotal > 0 ? currentExtra / currentManualTotal : 1 / manualMembers.length;
        const remainingMin = manualMembers.slice(index + 1).reduce((sum, later) => sum + (manualMins.get(later.id) || 0), 0);
        const remainingTarget = targetManualTotal - assigned - remainingMin;
        const nextWidth = Math.min(minWidth + Math.max(0, remainingTarget), Math.max(minWidth, quantizeSize(minWidth + (extraTotal * weight), unit)));
        widths.set(member.id, nextWidth);
        assigned += nextWidth;
    });

    return members.map((member) => widths.get(member.id) || quantizeSize(getNodeSizeValue(member, 0), unit));
}

function fitDeckPressureSideHeights(members, targetHeight, snap) {
    if (!Array.isArray(members) || members.length === 0) return [];
    const unit = Math.max(1, snap);
    const mins = members.map((member) => quantizeSize(getDeckPressureMinSpanForState(member, "vertical", snap, member.properties?.contentCollapsed === true), unit));
    const expandedIndexes = members
        .map((member, index) => member.properties?.contentCollapsed === true ? -1 : index)
        .filter((index) => index >= 0);
    const minTotal = mins.reduce((sum, value) => sum + value, 0);
    const resolvedTarget = Math.max(quantizeSize(targetHeight, unit), minTotal);
    const current = members.map((member) => quantizeSize(getNodeSizeValue(member, 1), unit));
    const collapsedClampedCurrent = current.map((value, index) => members[index].properties?.contentCollapsed === true ? mins[index] : value);
    const collapsedClampedTotal = collapsedClampedCurrent.reduce((sum, value) => sum + value, 0);
    if (expandedIndexes.length === 0) return mins;
    if (members.some((member) => member?._isDerpResizing === true) && collapsedClampedTotal <= resolvedTarget + 0.5 && collapsedClampedCurrent.every((value, index) => value >= mins[index])) {
        return collapsedClampedCurrent;
    }
    const now = performance.now?.() || Date.now();
    const hasFreshManualFit = members.some((member) => Number(member?._deckPressureManualBranchFitUntil || 0) > now);
    if (hasFreshManualFit && Math.abs(collapsedClampedTotal - resolvedTarget) <= 0.5 && collapsedClampedCurrent.every((value, index) => value >= mins[index])) {
        return collapsedClampedCurrent;
    }
    const freshActive = getDeckPressureFreshActiveMember(members);
    const freshActiveIndex = expandedIndexes.find((index) => members[index]?.id === freshActive?.id);
    const hasFreshActiveSavedHeight = freshActiveIndex >= 0 && Number(members[freshActiveIndex]?.properties?._savedExpandedHeight || 0) > 0;
    // Skip the "already aligned" fast-path when a freshly-activated member has a saved
    // expanded height to grow into: the stale live heights may already sum to the target,
    // which would otherwise pin the active member below its preferred size for a frame.
    const wantsFreshActiveGrowth = freshActiveIndex >= 0 && hasFreshActiveSavedHeight;
    if (!wantsFreshActiveGrowth && Math.abs(collapsedClampedTotal - resolvedTarget) <= 0.5 && collapsedClampedCurrent.every((value, index) => value >= mins[index])) return collapsedClampedCurrent;
    const sizes = [...mins];
    let extra = resolvedTarget - minTotal;
    if (extra <= 0) return sizes;

    if (freshActiveIndex >= 0) {
        const preferredHeight = quantizeSize(getDeckPressurePreferredExpandedHeight(members[freshActiveIndex], mins[freshActiveIndex]), unit);
        const preferredExtra = Math.max(0, preferredHeight - mins[freshActiveIndex]);
        const activeExtra = Math.min(extra, hasFreshActiveSavedHeight ? preferredExtra : (preferredExtra > 0 ? preferredExtra : extra));
        sizes[freshActiveIndex] += activeExtra;
        extra -= activeExtra;
        if (extra <= 0.5) return sizes;
    }

    const recipients = expandedIndexes.filter((index) => index !== freshActiveIndex);
    if (recipients.length === 0) {
        if (freshActiveIndex >= 0) sizes[freshActiveIndex] += extra;
        return sizes;
    }
    const currentExtras = recipients.map((index) => Math.max(0, getNodeSizeValue(members[index], 1) - mins[index]));
    const currentExtraTotal = currentExtras.reduce((sum, value) => sum + value, 0);

    recipients.forEach((index, recipientIndex) => {
        if (extra <= 0) return;
        const isLast = recipientIndex === recipients.length - 1;
        const weight = currentExtraTotal > 0 ? currentExtras[recipientIndex] / currentExtraTotal : 1 / recipients.length;
        const add = isLast ? extra : quantizeSize(extra * weight, unit);
        sizes[index] += add;
        extra -= add;
    });

    if (extra !== 0 && recipients.length > 0) sizes[recipients[recipients.length - 1]] += extra;
    return sizes;
}

function getDeckPressureBranchRecords(hub, graph) {
    return ["left", "right", "top", "bottom"]
        .map((side) => ({ side, members: getDeckPressureBranchMembers(hub, graph, side), axis: getDeckPressureBranchAxis(hub, graph, side) }))
        .filter((branch) => branch.members.length > 0);
}

function rectFromEdges(left, top, right, bottom) {
    const safeLeft = Number(left) || 0;
    const safeTop = Number(top) || 0;
    const safeRight = Math.max(safeLeft, Number(right) || safeLeft);
    const safeBottom = Math.max(safeTop, Number(bottom) || safeTop);
    return {
        left: safeLeft,
        top: safeTop,
        right: safeRight,
        bottom: safeBottom,
        width: safeRight - safeLeft,
        height: safeBottom - safeTop,
        x: safeLeft,
        y: safeTop,
        w: safeRight - safeLeft,
        h: safeBottom - safeTop,
    };
}

function normalizeFrameBounds(bounds) {
    if (!bounds) return null;
    if (isFiniteNumber(bounds.left) && isFiniteNumber(bounds.top) && isFiniteNumber(bounds.right) && isFiniteNumber(bounds.bottom)) {
        return rectFromEdges(bounds.left, bounds.top, bounds.right, bounds.bottom);
    }
    const x = Number(bounds.x) || 0;
    const y = Number(bounds.y) || 0;
    const w = Math.max(0, Number(bounds.w ?? bounds.width) || 0);
    const h = Math.max(0, Number(bounds.h ?? bounds.height) || 0);
    return rectFromEdges(x, y, x + w, y + h);
}

function makeDeckPressureMemberRects(members, band, axis, sizes) {
    const rects = [];
    let cursorX = band.left;
    let cursorY = band.top;
    members.forEach((member, index) => {
        if (axis === "horizontal") {
            const width = sizes[index] || getNodeSizeValue(member, 0);
            rects.push({ node: member, rect: rectFromEdges(cursorX, band.top, cursorX + width, band.bottom) });
            cursorX += width;
        } else {
            const height = sizes[index] || getNodeSizeValue(member, 1);
            rects.push({ node: member, rect: rectFromEdges(band.left, cursorY, band.right, cursorY + height) });
            cursorY += height;
        }
    });
    return rects;
}

export function computeDeckPressureGeometryPlan(hub, graph, snap = DEFAULT_DECK_SNAP, options = {}) {
    if (!isDeckPressureHub(hub) || !graph) return null;
    const branches = getDeckPressureBranchRecords(hub, graph);
    const arrangement = ensureDeckPressureArrangement(hub, graph);
    const rawHubRect = normalizeFrameBounds(options.hubRect || getNodeRect(hub));
    const branchBySide = Object.fromEntries(branches.map((branch) => [branch.side, branch]));
    const topBranch = branchBySide.top || null;
    const bottomBranch = branchBySide.bottom || null;
    const leftBranch = branchBySide.left || null;
    const rightBranch = branchBySide.right || null;
    const topHeight = getDeckPressureBranchHeight(topBranch, snap);
    const bottomHeight = getDeckPressureBranchHeight(bottomBranch, snap);
    const sideWidthOverrides = options.sideWidths || hub._deckPressureSideWidthOverrides || {};
    const leftWidth = Math.max(0, Number(sideWidthOverrides.left) || getDeckPressureBranchWidth(leftBranch, snap));
    const rightWidth = Math.max(0, Number(sideWidthOverrides.right) || getDeckPressureBranchWidth(rightBranch, snap));
    const sideMinHeight = Math.max(...branches.filter((branch) => (branch.side === "left" || branch.side === "right") && branch.axis === "vertical").map((branch) => getDeckPressureBranchEdgeMinSpan(branch, snap)), 0);
    const topBottomMinWidth = Math.max(...branches.filter((branch) => branch.side === "top" || branch.side === "bottom").map((branch) => getDeckPressureBranchEdgeMinSpan(branch, snap)), 0);
    const centerWidth = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? Math.max(rawHubRect.width, topBottomMinWidth - leftWidth - rightWidth) : Math.max(rawHubRect.width, topBottomMinWidth);
    const centerHeight = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? Math.max(rawHubRect.height, sideMinHeight) : Math.max(rawHubRect.height, sideMinHeight - topHeight - bottomHeight);
    const preservedFrame = normalizeFrameBounds(options.frameBounds || null);
    const frame = preservedFrame || rectFromEdges(rawHubRect.left - leftWidth, rawHubRect.top - topHeight, rawHubRect.left + centerWidth + rightWidth, rawHubRect.top + centerHeight + bottomHeight);
    const hubTop = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? rawHubRect.top : frame.top + topHeight;
    const hubBottom = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? rawHubRect.top + rawHubRect.height : frame.bottom - bottomHeight;
    const hubRect = preservedFrame ? rectFromEdges(frame.left + leftWidth, hubTop, frame.right - rightWidth, hubBottom) : rectFromEdges(rawHubRect.left, rawHubRect.top, rawHubRect.left + centerWidth, rawHubRect.top + centerHeight);
    const sideBandTop = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? hubRect.top : frame.top;
    const sideBandBottom = arrangement === DECK_ARRANGEMENT_HORIZONTAL ? hubRect.bottom : frame.bottom;
    const bands = {
        left: rectFromEdges(frame.left, sideBandTop, hubRect.left, sideBandBottom),
        right: rectFromEdges(hubRect.right, sideBandTop, frame.right, sideBandBottom),
        top: arrangement === DECK_ARRANGEMENT_HORIZONTAL ? rectFromEdges(frame.left, frame.top, frame.right, hubRect.top) : rectFromEdges(hubRect.left, frame.top, hubRect.right, hubRect.top),
        bottom: arrangement === DECK_ARRANGEMENT_HORIZONTAL ? rectFromEdges(frame.left, hubRect.bottom, frame.right, frame.bottom) : rectFromEdges(hubRect.left, hubRect.bottom, hubRect.right, frame.bottom),
    };
    const plannedBranches = branches.map((branch) => {
        const band = bands[branch.side];
        let memberRects = [];
        if ((branch.side === "left" || branch.side === "right") && branch.axis === "vertical") {
            memberRects = makeDeckPressureMemberRects(branch.members, band, "vertical", fitDeckPressureSideHeights(branch.members, band.height, snap));
        } else if (branch.side === "left" || branch.side === "right") {
            memberRects = makeDeckPressureMemberRects(branch.members, band, "horizontal", fitDeckPressureRowWidths(branch.members, band.width, snap));
        } else if (branch.axis === "horizontal") {
            memberRects = makeDeckPressureMemberRects(branch.members, band, "horizontal", fitDeckPressureRowWidths(branch.members, band.width, snap));
        } else {
            const heights = getDeckPressureColumnCurrentHeights(branch.members, snap);
            const width = preservedFrame ? band.width : Math.max(band.width, getDeckPressureBranchEdgeMinSpan(branch, snap));
            const columnBand = rectFromEdges(band.left, band.top, band.left + width, band.top + heights.reduce((sum, value) => sum + value, 0));
            memberRects = makeDeckPressureMemberRects(branch.members, columnBand, "vertical", heights);
        }
        return { ...branch, band, memberRects };
    });
    return { arrangement, frame, hubRect, branches: plannedBranches, bands, constraints: { sideMinHeight, topBottomMinWidth, leftWidth, rightWidth, topHeight, bottomHeight } };
}
export function applyDeckPressureLayout(hub, graph, snap = DEFAULT_DECK_SNAP) {
    if (!isDeckPressureHub(hub) || !graph) return [];
    const changed = new Set();
    const markChanged = (nodes) => {
        if (Array.isArray(nodes)) nodes.forEach((node) => { if (node) changed.add(node); });
        else if (nodes) changed.add(nodes);
    };
    const rawHubRect = getNodeRect(hub);
    const hubAnchor = { x: rawHubRect.x, y: rawHubRect.y };
    const branches = getDeckPressureBranchRecords(hub, graph);
    const arrangement = ensureDeckPressureArrangement(hub, graph);
    const preliminaryPlan = computeDeckPressureGeometryPlan(hub, graph, snap, { frameBounds: hub._deckPressurePreserveFrameBounds || null });
    if (!preliminaryPlan) return [];

    branches.forEach(({ side, members, axis }) => {
        if ((side !== "left" && side !== "right") || axis !== "horizontal") return;
        members.forEach((member) => {
            if (member?.properties?.contentCollapsed === true && setDeckPressureCollapsed(member, false)) markChanged(member);
        });
    });

    const sideCollapseTargetHeight = arrangement === DECK_ARRANGEMENT_HORIZONTAL
        ? preliminaryPlan.hubRect.height
        : preliminaryPlan.frame.height;
    branches.forEach(({ side, members, axis }) => {
        if (side !== "left" && side !== "right") return;
        if (axis !== "vertical") return;
        if (ensureDeckPressureFillerMember(members)) markChanged(members);
        if (applyDeckPressureCollapse(members, sideCollapseTargetHeight, "vertical", snap)) markChanged(members);
    });

    const plan = computeDeckPressureGeometryPlan(hub, graph, snap, { frameBounds: hub._deckPressurePreserveFrameBounds || null });
    if (!plan) return [];
    const hubRect = plan.hubRect;
    if (setDeckNodePos(hub, hubRect.left, hubRect.top)) markChanged(hub);
    if (syncDeckNodeSize(hub, hubRect.width, hubRect.height, { silent: true, deferDirty: true, deferSync: true })) markChanged(hub);

    plan.branches.forEach((branch) => {
        branch.memberRects.forEach(({ node, rect }) => {
            const sizeChanged = syncDeckNodeSize(node, rect.width, rect.height, { silent: true, deferDirty: true, deferSync: true });
            const posChanged = setDeckNodePos(node, rect.left, rect.top);
            if (sizeChanged || posChanged) markChanged(node);
        });
    });

    if (!hub._deckPressurePreserveFrameBounds && hub._isDerpResizing !== true && ((Number(hub.pos?.[0]) || 0) !== hubAnchor.x || (Number(hub.pos?.[1]) || 0) !== hubAnchor.y)) {
        setDeckNodePos(hub, hubAnchor.x, hubAnchor.y);
        markChanged(hub);
    }

    changed.forEach((node) => {
        if (node?.properties?.contentCollapsed !== true) delete node._deckPressureSkipFillerUntil;
        if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        syncDerpShield(node);
    });
    return [...changed];
}
export function drawDeckGhost(ctx, ghost, options = {}) {
    if (!ctx || !ghost) return;

    const edgeValid = options.valid !== false;
    const useAnim = options.useAnim !== false && window.DERP_GLOBAL_SETTINGS?.useAnimation !== false;
    const fallbackFill = edgeValid
        ? "rgba(120, 200, 255, 0.18)"
        : "rgba(255, 149, 0, 0.18)";
    const bodyPaint = edgeValid
        ? (resolveSystemThemePaint("ghost_deck_valid", "DIS") || { fill: fallbackFill, corners: 0 })
        : { fill: fallbackFill, corners: 0 };
    const fill = options.fill || bodyPaint.fill || fallbackFill;
    const edgeStroke = edgeValid
        ? (options.edgeStrokeValid || (useAnim
            ? getPulsedColor(
                parseColor(resolveSystemThemeFill("ghost_deck_valid", "rgba(56, 202, 90, 0.95)", "OFF")),
                parseColor(resolveSystemThemeFill("ghost_deck_valid", "rgba(120, 255, 150, 0.95)", "ON")),
                options.pulseSpeed || DEFAULT_PULSE_SPEED
            )
            : resolveSystemThemeFill("ghost_deck_valid", "rgba(56, 202, 90, 0.95)", "OFF")))
        : (options.edgeStrokeInvalid || "rgba(255, 149, 0, 0.95)");
    const edgeLineWidth = isFiniteNumber(options.edgeLineWidth) ? options.edgeLineWidth : 4;
    const side = options.side || null;
    const targetEdgeLine = options.targetEdgeLine || null;

    if (edgeValid && useAnim && !window._xcpDeckGhostPulsePending && window.app?.canvas) {
        window._xcpDeckGhostPulsePending = true;
        requestAnimationFrame(() => {
            window._xcpDeckGhostPulsePending = false;
            window.app?.canvas?.setDirty?.(true, true);
        });
    }

    ctx.save();
    masterPainter(ctx, {
        posX: ghost.x,
        posY: ghost.y,
        width: ghost.w,
        height: ghost.h,
        color: fill,
        paintData: { ...bodyPaint, fill },
    });

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

function getNodeBounds(node) {
    if (!node) return null;
    const x = Number(node.pos?.[0]) || 0;
    const y = Number(node.pos?.[1]) || 0;
    const w = Number(node.size?.[0] ?? node.properties?.nodeSize?.[0]) || 0;
    const h = Number(node.size?.[1] ?? node.properties?.nodeSize?.[1]) || 0;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h, right: x + w, bottom: y + h };
}

function getNodeById(graph, id) {
    if (!graph || id === null || id === undefined) return null;
    if (typeof graph.getNodeById === "function") return graph.getNodeById(id) || null;
    return graph._nodes?.find?.((node) => node?.id === id) || null;
}

function getBoundsForNodes(nodes = []) {
    const rects = nodes.map(getNodeBounds).filter(Boolean);
    if (!rects.length) return null;
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { x: left, y: top, w: right - left, h: bottom - top, right, bottom };
}

function getDeckPressureSideSeamGhost(entity, graph, session) {
    if (!entity || !graph || !session || typeof session.side !== "string" || !session.side.startsWith("deck-pressure-") || !session.side.endsWith("-seam")) return null;
    const hub = getNodeById(graph, session.hubId);
    if (!hub) return null;
    const branchSide = session.side.slice("deck-pressure-".length, -"-seam".length);
    if (branchSide !== "left" && branchSide !== "right") return null;
    const band = computeDeckPressureGeometryPlan(hub, graph)?.bands?.[branchSide];
    if (!band) return null;
    const seamX = branchSide === "left" ? band.right : band.left;
    return { x: seamX - 0.5, y: band.top, w: 1, h: band.height };
}

function getDeckPressureSideHoverGhost(entity, graph, session) {
    if (!entity || !graph || !session?.deckPressureSideWidth) return null;
    const hub = getNodeById(graph, session.hubId);
    if (!hub) return null;
    const branchSide = session.branchSide;
    if (branchSide !== "left" && branchSide !== "right") return null;
    const band = computeDeckPressureGeometryPlan(hub, graph)?.bands?.[branchSide];
    if (!band) return null;
    const seamX = branchSide === "left" ? band.right : band.left;
    return { x: seamX - 0.5, y: band.top, w: 1, h: band.height };
}

function getSeamGhostPairsForSession(entity, graph, session = entity?._dockResizeSession) {
    if (!session || !graph) return [];
    if (session.entityId !== undefined && session.neighborId !== undefined) {
        if (session.deckPressureSideWidth) return [];
        const entityNode = getNodeById(graph, session.entityId);
        const neighbor = getNodeById(graph, session.neighborId);
        return entityNode && neighbor ? [{ a: entityNode, b: neighbor, side: session.side }] : [];
    }
    if ((session.side === "left" || session.side === "right" || session.side === "top" || session.side === "bottom") && session.leaderId !== undefined && session.dockedId !== undefined) {
        const leader = getNodeById(graph, session.leaderId);
        const docked = getNodeById(graph, session.dockedId);
        return leader && docked ? [{ a: leader, b: docked, side: session.side }] : [];
    }
    if (session.side === "vertical-ordered-seam" && session.topNodeId !== undefined && session.bottomNodeId !== undefined) {
        const topNode = getNodeById(graph, session.topNodeId);
        const bottomNode = getNodeById(graph, session.bottomNodeId);
        return topNode && bottomNode ? [{ a: topNode, b: bottomNode, side: "bottom" }] : [];
    }
    if (typeof session.side === "string" && session.side.startsWith("deck-pressure-") && session.side.endsWith("-seam") && session.hubId !== undefined) {
        const hub = getNodeById(graph, session.hubId);
        return hub && hub.id !== entity.id ? [{ a: entity, b: hub, side: entity._resizeAnchor || "right" }] : [];
    }
    return [];
}

function drawSeamGhostRect(ctx, x, y, width, height, paint) {
    if (width <= 0 || height <= 0) return;
    masterPainter(ctx, {
        posX: x,
        posY: y,
        width,
        height,
        color: paint.fill,
        paintData: { ...paint, corners: 0 },
    });
}

function drawSeamGhostPair(ctx, pair, paint) {
    const a = getNodeBounds(pair?.a);
    const b = getNodeBounds(pair?.b);
    if (!a || !b) return;
    const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
    const vertical = overlapY > overlapX;
    ctx.save();
    if (vertical) {
        const left = a.x <= b.x ? a : b;
        const right = left === a ? b : a;
        const top = Math.max(left.y, right.y);
        const bottom = Math.min(left.bottom, right.bottom);
        const h = Math.max(0, bottom - top);
        if (h > 0) {
            const seamX = (left.right + right.x) * 0.5;
            drawSeamGhostRect(ctx, seamX - 0.5, top, 1, h, paint);
        }
    } else {
        const topNode = a.y <= b.y ? a : b;
        const bottomNode = topNode === a ? b : a;
        const left = Math.max(topNode.x, bottomNode.x);
        const right = Math.min(topNode.right, bottomNode.right);
        const w = Math.max(0, right - left);
        if (w > 0) {
            const seamY = (topNode.bottom + bottomNode.y) * 0.5;
            drawSeamGhostRect(ctx, left, seamY - 0.5, w, 1, paint);
        }
    }
    ctx.restore();
}

export function drawSharedResizeSeamGhosts(ctx, graph = globalThis?.app?.graph || null) {
    if (!ctx || !graph?._nodes?.length) return;
    const useAnim = window.DERP_GLOBAL_SETTINGS?.useAnimation !== false;
    const bodyPaint = resolveSystemThemePaint("ghost_seam_valid", "OFF") || { fill: "rgba(56, 202, 90, 0.95)", corners: 0 };
    const fill = useAnim
        ? getPulsedColor(
            parseColor(resolveSystemThemeFill("ghost_seam_valid", "rgba(56, 202, 90, 0.95)", "OFF")),
            parseColor(resolveSystemThemeFill("ghost_seam_valid", "rgba(120, 255, 150, 0.95)", "ON")),
            DEFAULT_PULSE_SPEED
        )
        : resolveSystemThemeFill("ghost_seam_valid", "rgba(56, 202, 90, 0.95)", "OFF");
    const paint = { ...bodyPaint, fill, corners: 0 };
    let drew = false;
    const seen = new Set();
    graph._nodes.forEach((node) => {
        const sessions = [];
        if (node?._isDerpResizing === true && node._dockResizeSession) sessions.push(node._dockResizeSession);
        if (node?._dockResizeHoverSession) sessions.push(node._dockResizeHoverSession);
        sessions.forEach((session) => {
            const seamGhost = getDeckPressureSideSeamGhost(node, graph, session) || getDeckPressureSideHoverGhost(node, graph, session);
            if (seamGhost) {
                const key = `deck-pressure:${session.hubId}:${session.branchSide || session.side}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    drawSeamGhostRect(ctx, seamGhost.x, seamGhost.y, seamGhost.w, seamGhost.h, paint);
                    drew = true;
                }
                return;
            }
            getSeamGhostPairsForSession(node, graph, session).forEach((pair) => {
                const ids = [pair.a?.id, pair.b?.id].sort().join(":");
                if (!ids || seen.has(ids)) return;
                seen.add(ids);
                drawSeamGhostPair(ctx, pair, paint);
                drew = true;
            });
        });
    });
    if (drew && useAnim && !window._xcpSeamGhostPulsePending && window.app?.canvas) {
        window._xcpSeamGhostPulsePending = true;
        requestAnimationFrame(() => {
            window._xcpSeamGhostPulsePending = false;
            window.app?.canvas?.setDirty?.(true, true);
        });
    }
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
