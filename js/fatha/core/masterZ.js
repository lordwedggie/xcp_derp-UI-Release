import { app } from "../../../../scripts/app.js";

export const MASTER_Z = {
    nodeShieldBase: 5,
    nodeHtmlBase: 105,
    activeHtmlLift: 500,
    bastaBase: 10000,
    systemMessage: 10020,
    perfOverlay: 99999,
    layoutDebug: 100000,
    debugHitbox: 200000,
    debugHitboxLayer: 200001,
    searchGlyphOverlay: 999999,
};

export function masterZValue(key, fallback = 0) {
    const value = MASTER_Z[key];
    return Number.isFinite(value) ? value : fallback;
}

export function masterZString(key, fallback = "0") {
    return String(masterZValue(key, Number(fallback) || 0));
}

function isDerpNode(node) {
    return !!(node && (node.isFathaNode || node.isUncleNode));
}

function getNodeLabel(node) {
    return String(node?.titleLabel || node?.title || node?.type || node?.id || "unknown");
}

function getGraph(nodeOrGraph = null) {
    if (nodeOrGraph?._nodes) return nodeOrGraph;
    return nodeOrGraph?.graph || app?.graph || null;
}

function uniqueNodes(nodes = []) {
    const seen = new Set();
    const out = [];
    for (const node of nodes) {
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        out.push(node);
    }
    return out;
}

function getSelectedDerpNodes(graph) {
    const selected = app?.canvas?.selected_nodes || {};
    return Object.values(selected).filter((node) => isDerpNode(node) && node?.graph === graph);
}

// Per-promote lookup maps: the old getDockNeighbors scanned every graph node for
// every dequeued member (O(graph) per member, O(graph × members) per promote).
// The deck relation is pure id data, so one O(graph) pass building byId +
// reverse parent/edge indexes lets the BFS resolve neighbors in O(degree).
function buildDeckLookupMaps(graph) {
    const byId = new Map();
    const childrenByParentId = new Map();
    const sourcesByEdgeTargetId = new Map();
    for (const candidate of graph._nodes) {
        if (!isDerpNode(candidate)) continue;
        byId.set(String(candidate.id), candidate);
        const candidateProps = candidate.properties || {};
        if (candidateProps.deckParentId !== null && candidateProps.deckParentId !== undefined) {
            const key = String(candidateProps.deckParentId);
            let list = childrenByParentId.get(key);
            if (!list) childrenByParentId.set(key, (list = []));
            list.push(candidate);
        }
        for (const id of Object.values(candidateProps.deckEdges || {})) {
            if (id === null || id === undefined) continue;
            const key = String(id);
            let list = sourcesByEdgeTargetId.get(key);
            if (!list) sourcesByEdgeTargetId.set(key, (list = []));
            list.push(candidate);
        }
    }
    return { byId, childrenByParentId, sourcesByEdgeTargetId };
}

function pushDeckNeighbors(node, lookup, queue) {
    const props = node.properties || {};
    if (props.deckParentId !== null && props.deckParentId !== undefined) {
        const parent = lookup.byId.get(String(props.deckParentId));
        if (parent) queue.push(parent);
    }
    for (const id of Object.values(props.deckEdges || {})) {
        if (id === null || id === undefined) continue;
        const edgeNode = lookup.byId.get(String(id));
        if (edgeNode) queue.push(edgeNode);
    }
    const key = String(node.id);
    const children = lookup.childrenByParentId.get(key);
    if (children) queue.push(...children);
    const edgeSources = lookup.sourcesByEdgeTargetId.get(key);
    if (edgeSources) queue.push(...edgeSources);
}

function getDeckMembersLocal(rootNode, graph, lookup = buildDeckLookupMaps(graph)) {
    if (!rootNode || !graph?._nodes) return [];
    const queue = [rootNode];
    const members = [];
    const seen = new Set();
    while (queue.length > 0) {
        const node = queue.shift();
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        members.push(node);
        pushDeckNeighbors(node, lookup, queue);
    }
    return members;
}

export function getMasterZIndex(node, graph = getGraph(node), offset = MASTER_Z.nodeShieldBase) {
    const nodes = graph?._nodes || [];
    const idx = nodes.indexOf(node);
    return offset + (idx < 0 ? 0 : idx * 2);
}

export function getMasterZPromotionSet(node, graph = getGraph(node)) {
    if (!node || !graph) return [];

    const seed = [];
    const selected = getSelectedDerpNodes(graph);
    if (selected.includes(node)) seed.push(...selected);
    else seed.push(node);

    const expanded = [];
    // One shared lookup for all seed items: multi-select promotes used to pay a
    // full O(graph) map build (previously O(graph) scans) per selected node.
    const lookup = buildDeckLookupMaps(graph);
    for (const item of uniqueNodes(seed)) {
        const members = getDeckMembersLocal(item, graph, lookup);
        expanded.push(...(members.length ? members : [item]));
    }

    const selectedIds = new Set(seed.map((item) => item.id));
    const expandedIds = new Set(expanded.map((item) => item.id));
    for (const item of selected) {
        if (!expandedIds.has(item.id) && selectedIds.has(item.id)) expanded.push(item);
    }

    return uniqueNodes(expanded).filter((item) => graph._nodes.includes(item));
}

export function syncMasterZ(graph = app?.graph || null) {
    const nodes = graph?._nodes || [];
    nodes.forEach((node, idx) => {
        if (!isDerpNode(node)) return;
        const shieldZ = MASTER_Z.nodeShieldBase + (idx * 2);
        // Change-guard: a node's z band only moves when its graph index moves
        // (promote/reorder) or hitbox-debug mode flips. Between those events this
        // per-frame onDrawForeground pass would rewrite identical values into JS
        // props and the DOM — and DOM style writes cost style time even when the
        // assigned string is unchanged. Skip when nothing moved. syncDerpShield
        // independently writes the same z from baseZIndex on shield (re)creation,
        // so a fresh element can never strand a stale value behind the guard.
        if (node._masterZShield !== shieldZ) {
            node._masterZShield = shieldZ;
            node._masterZHtml = shieldZ + 1;
            node.baseZIndex = String(shieldZ);
        }
        const shield = node.interactionShield;
        if (!shield) return;
        const dMode = node.properties?.debugMode;
        const domTarget = (dMode === "Hitbox" || dMode === "Widgets Hitbox") ? MASTER_Z.debugHitbox : shieldZ;
        if (node._masterZDomTarget !== domTarget) {
            node._masterZDomTarget = domTarget;
            shield.style.zIndex = String(domTarget);
        }
    });
}

export function promoteMasterZ(node, graph = getGraph(node)) {
    if (!node || !graph || !Array.isArray(graph._nodes)) return false;
    const set = getMasterZPromotionSet(node, graph);
    if (!set.length) return false;

    const promoteIds = new Set(set.map((item) => item.id));
    const remaining = graph._nodes.filter((item) => !promoteIds.has(item.id));
    const promoted = graph._nodes.filter((item) => promoteIds.has(item.id));

    // No-op fast path: promoting an already-top set leaves graph._nodes
    // elementwise identical. Ref compare with early exit replaces the old
    // before/after full id-string joins (two O(graph) string builds per click);
    // the common click-on-already-top-node case exits at the tail comparison.
    // Z values depend only on this order, so an unchanged order means
    // syncMasterZ has nothing new to write — skip it and let the per-frame
    // onDrawForeground sync own steady state.
    const next = remaining.concat(promoted);
    if (next.length === graph._nodes.length) {
        let unchanged = true;
        for (let i = 0; i < next.length; i++) {
            if (graph._nodes[i] !== next[i]) { unchanged = false; break; }
        }
        if (unchanged) return false;
    }

    graph._nodes.length = 0;
    graph._nodes.push(...next);
    syncMasterZ(graph);
    graph.change?.();
    app?.canvas?.setDirty?.(true, true);
    return true;
}

export function getMasterZDebugSnapshot(graph = app?.graph || null, limit = 6) {
    const nodes = graph?._nodes || [];
    const derpNodes = nodes.filter(isDerpNode);
    const selected = getSelectedDerpNodes(graph);
    const selectedIds = new Set(selected.map((node) => node.id));
    const top = derpNodes.slice(-Math.max(1, limit)).reverse().map((node) => ({
        id: node.id,
        title: getNodeLabel(node),
        graphIndex: nodes.indexOf(node),
        shieldZ: node._masterZShield ?? null,
        htmlZ: node._masterZHtml ?? null,
        domZ: node.interactionShield?.style?.zIndex || null,
        selected: selectedIds.has(node.id),
    }));

    const mismatches = derpNodes.filter((node) => {
        if (!node.interactionShield) return false;
        const dMode = node.properties?.debugMode;
        if (dMode === "Hitbox" || dMode === "Widgets Hitbox") return false;
        return String(node._masterZShield ?? "") !== String(node.interactionShield.style.zIndex || "");
    }).map((node) => ({
        id: node.id,
        title: getNodeLabel(node),
        expected: node._masterZShield ?? null,
        actual: node.interactionShield?.style?.zIndex || null,
    }));

    return {
        totalGraphNodes: nodes.length,
        derpNodes: derpNodes.length,
        selectedDerpNodes: selected.length,
        top,
        mismatches,
        bands: { ...MASTER_Z },
    };
}

if (typeof window !== "undefined") {
    window.xcpMasterZ = { MASTER_Z, masterZValue, masterZString, promoteMasterZ, syncMasterZ, getMasterZPromotionSet, getMasterZIndex, getMasterZDebugSnapshot };
}
