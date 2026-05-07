/**
 * PROJECT: xcpDerpNodes
 * PATH: ./js/fatha/core/masterDockEngine.js
 */

const DEFAULT_DECK_SNAP = 10;
const DEFAULT_DECK_RADIUS = 48;
const DEFAULT_DECK_GHOST_THICKNESS = 10;

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

function getNodeCenter(node) {
    const x = Number(node?.pos?.[0]) || 0;
    const y = Number(node?.pos?.[1]) || 0;
    const w = getNodeSizeValue(node, 0);
    const h = getNodeSizeValue(node, 1);
    return [x + (w / 2), y + (h / 2)];
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

export function getClosestDeckEdge(dragNode, targetNode, options = {}) {
    if (!dragNode || !targetNode) return null;

    const ghostThickness = isFiniteNumber(options.ghostThickness) ? options.ghostThickness : DEFAULT_DECK_GHOST_THICKNESS;
    const snap = isFiniteNumber(options.snap) && options.snap > 0 ? options.snap : DEFAULT_DECK_SNAP;
    const edgeSnapThreshold = snap * 2;
    const drag = getNodeRect(dragNode);
    const target = getNodeRect(targetNode);
    const dragCX = drag.x + (drag.w / 2);
    const dragCY = drag.y + (drag.h / 2);
    const targetCX = target.x + (target.w / 2);
    const targetCY = target.y + (target.h / 2);
    const overlapX = Math.max(0, Math.min(drag.x + drag.w, target.x + target.w) - Math.max(drag.x, target.x));
    const overlapY = Math.max(0, Math.min(drag.y + drag.h, target.y + target.h) - Math.max(drag.y, target.y));
    const gapLeft = Math.abs((drag.x + drag.w) - target.x);
    const gapRight = Math.abs(drag.x - (target.x + target.w));
    const gapTop = Math.abs((drag.y + drag.h) - target.y);
    const gapBottom = Math.abs(drag.y - (target.y + target.h));
    const horizontalGap = Math.min(gapLeft, gapRight);
    const verticalGap = Math.min(gapTop, gapBottom);
    const overlapRatioX = overlapX / Math.max(1, Math.min(drag.w, target.w));
    const overlapRatioY = overlapY / Math.max(1, Math.min(drag.h, target.h));
    const deltaX = Math.abs(dragCX - targetCX);
    const deltaY = Math.abs(dragCY - targetCY);

    if (overlapX > 0 && gapBottom <= edgeSnapThreshold) {
        return {
            side: "bottom",
            distance: gapBottom,
            ghost: getDeckGhostRect("bottom", drag, target, ghostThickness),
        };
    }

    if (overlapX > 0 && gapTop <= edgeSnapThreshold) {
        return {
            side: "top",
            distance: gapTop,
            ghost: getDeckGhostRect("top", drag, target, ghostThickness),
        };
    }

    if (overlapY > 0 && gapRight <= edgeSnapThreshold) {
        return {
            side: "right",
            distance: gapRight,
            ghost: getDeckGhostRect("right", drag, target, ghostThickness),
        };
    }

    if (overlapY > 0 && gapLeft <= edgeSnapThreshold) {
        return {
            side: "left",
            distance: gapLeft,
            ghost: getDeckGhostRect("left", drag, target, ghostThickness),
        };
    }

    if (overlapRatioX >= 0.35 && overlapRatioY >= 0.35) {
        if (deltaY > deltaX) {
            return dragCY < targetCY
                ? {
                    side: "top",
                    distance: gapTop,
                    ghost: getDeckGhostRect("top", drag, target, ghostThickness),
                }
                : {
                    side: "bottom",
                    distance: gapBottom,
                    ghost: getDeckGhostRect("bottom", drag, target, ghostThickness),
                };
        }

        return dragCX < targetCX
            ? {
                side: "left",
                distance: gapLeft,
                ghost: getDeckGhostRect("left", drag, target, ghostThickness),
            }
            : {
                side: "right",
                distance: gapRight,
                ghost: getDeckGhostRect("right", drag, target, ghostThickness),
            };
    }

    if (overlapY > 0 && horizontalGap <= verticalGap) {
        return gapLeft <= gapRight
            ? {
                side: "left",
                distance: gapLeft,
                ghost: getDeckGhostRect("left", drag, target, ghostThickness),
            }
            : {
                side: "right",
                distance: gapRight,
                ghost: getDeckGhostRect("right", drag, target, ghostThickness),
            };
    }

    if (overlapX > 0 && verticalGap <= horizontalGap) {
        return gapTop <= gapBottom
            ? {
                side: "top",
                distance: gapTop,
                ghost: getDeckGhostRect("top", drag, target, ghostThickness),
            }
            : {
                side: "bottom",
                distance: gapBottom,
                ghost: getDeckGhostRect("bottom", drag, target, ghostThickness),
            };
    }

    const candidates = [
        {
            side: "left",
            distance: gapLeft,
            ghost: getDeckGhostRect("left", drag, target, ghostThickness),
        },
        {
            side: "right",
            distance: gapRight,
            ghost: getDeckGhostRect("right", drag, target, ghostThickness),
        },
        {
            side: "top",
            distance: gapTop,
            ghost: getDeckGhostRect("top", drag, target, ghostThickness),
        },
        {
            side: "bottom",
            distance: gapBottom,
            ghost: getDeckGhostRect("bottom", drag, target, ghostThickness),
        },
    ];

    return candidates.sort((a, b) => a.distance - b.distance)[0] || null;
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

function getPeerDeckNeighbor(node, graph, side) {
    const neighborId = node?.properties?.deckEdges?.[side];
    if (neighborId === null || neighborId === undefined) return null;
    return getDeckNodeById(graph, neighborId);
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
    if (!node || !leader) return false;
    if (node.id === leader.id) return false;
    if (!isDeckableDerpNode(node) || !isDeckableDerpNode(leader)) return false;
    if (!isClosedDeckTarget(leader)) return false;
    if (isNodeInDeckBranch(node, leader, graph)) return false;
    if (isNodeDocked(node, graph)) return false;
    if (!side) return true;

    const leaderOccupied = getOccupiedDeckEdges(leader, graph);
    if (leaderOccupied.has(side)) return false;

    const nodeOccupied = getOccupiedDeckEdges(node, graph);
    const oppositeSide = getOppositeDeckSide(side);
    if (oppositeSide && nodeOccupied.has(oppositeSide)) return false;
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

    if (side === "left" || side === "right") {
        const maxH = Math.max(nodeRect.h, leaderRect.h);
        nextH = maxH;
        nextLeaderH = maxH;
    } else if (side === "top" || side === "bottom") {
        const maxW = Math.max(nodeRect.w, leaderRect.w);
        nextW = maxW;
        nextLeaderW = maxW;
    } else {
        const maxW = Math.max(nodeRect.w, leaderRect.w);
        const maxH = Math.max(nodeRect.h, leaderRect.h);
        nextW = maxW;
        nextH = maxH;
        nextLeaderW = maxW;
        nextLeaderH = maxH;
    }

    const nodeChanged = syncDeckNodeSize(node, nextW, nextH);
    const leaderChanged = syncDeckNodeSize(leader, nextLeaderW, nextLeaderH);
    return nodeChanged || leaderChanged;
}

export function deckNodeToLeader(node, leader, graph, side = null) {
    if (!canDeckNodeToLeader(node, leader, graph)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(leader, side);
    matchDeckNodeSizes(node, leader, side);
    const props = ensureDeckProps(node);
    props.deckParentId = leader.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(leader, side, node);
    return true;
}

export function finalizeDeck(node, leader, graph, side = null, snap = DEFAULT_DECK_SNAP) {
    if (!canDeckNodeToLeader(node, leader, graph)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(leader, side);
    matchDeckNodeSizes(node, leader, side);
    const targetInfo = { targetNode: leader, edge: { side } };
    applyDeckEdgeSnap(node, targetInfo, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = leader.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(leader, side, node);
    return true;
}

export function finalizeDeckTarget(node, targetInfo, graph, snap = DEFAULT_DECK_SNAP) {
    if (!node || !targetInfo?.targetNode) return false;
    const side = targetInfo.edge?.side || null;
    if (!canDeckNodeToLeader(node, targetInfo.targetNode, graph)) return false;
    lockDeckNodeAxes(node, side);
    lockDeckNodeAxes(targetInfo.targetNode, side);
    matchDeckNodeSizes(node, targetInfo.targetNode, side);
    applyDeckEdgeSnap(node, { targetNode: targetInfo.targetNode, edge: { side } }, snap);
    const props = ensureDeckProps(node);
    props.deckParentId = targetInfo.targetNode.id;
    props.deckDockSide = side;
    connectPeerDeckEdge(targetInfo.targetNode, side, node);
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
    if (!dragNode || !graph) return null;

    const radius = isFiniteNumber(options.radius) ? options.radius : DEFAULT_DECK_RADIUS;
    const dragRect = getNodeRect(dragNode);
    const candidates = getDeckNodes(graph).filter((node) => {
        if (node.id === dragNode.id) return false;
        if (!isClosedDeckTarget(node)) return false;
        if (!isWithinDeckSearchRadius(dragRect, getNodeRect(node), radius)) return false;
        return true;
    });

    if (candidates.length === 0) return null;

    let bestNode = null;
    let bestDistance = Infinity;
    let bestEdge = null;

    candidates.forEach((node) => {
        const edge = getClosestDeckEdge(dragNode, node, options);
        const dist = edge?.distance ?? Infinity;
        if (!edge?.side) return;
        if (!canDeckNodeToLeader(dragNode, node, graph, edge.side)) return;
        if (dist <= radius && dist < bestDistance) {
            bestNode = node;
            bestDistance = dist;
            bestEdge = edge;
        }
    });

    if (!bestNode) return null;

    return {
        targetNode: bestNode,
        distance: bestDistance,
        edge: bestEdge,
        ghost: bestEdge?.ghost || null,
    };
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

export function drawDeckGhost(ctx, ghost, options = {}) {
    if (!ctx || !ghost) return;

    const fill = options.fill || "rgba(120, 200, 255, 0.18)";
    const stroke = options.stroke || "rgba(120, 200, 255, 0.9)";
    const lineWidth = isFiniteNumber(options.lineWidth) ? options.lineWidth : 2;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h);
    ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);
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
        if (!this.previewTarget?.ghost) return;
        drawDeckGhost(ctx, this.previewTarget.ghost, options);
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
