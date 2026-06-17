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

function getDockNeighbors(node, graph) {
    if (!node || !graph?._nodes) return [];
    const ids = new Set();
    const props = node.properties || {};
    if (props.deckParentId !== null && props.deckParentId !== undefined) ids.add(String(props.deckParentId));
    Object.values(props.deckEdges || {}).forEach((id) => {
        if (id !== null && id !== undefined) ids.add(String(id));
    });

    const out = [];
    for (const candidate of graph._nodes) {
        if (!isDerpNode(candidate) || candidate === node) continue;
        const candidateProps = candidate.properties || {};
        if (ids.has(String(candidate.id))) {
            out.push(candidate);
            continue;
        }
        if (candidateProps.deckParentId !== null && candidateProps.deckParentId !== undefined && String(candidateProps.deckParentId) === String(node.id)) {
            out.push(candidate);
            continue;
        }
        if (Object.values(candidateProps.deckEdges || {}).some((id) => String(id) === String(node.id))) {
            out.push(candidate);
        }
    }
    return out;
}

function getDeckMembersLocal(rootNode, graph) {
    if (!rootNode || !graph?._nodes) return [];
    const queue = [rootNode];
    const members = [];
    const seen = new Set();
    while (queue.length > 0) {
        const node = queue.shift();
        if (!node || seen.has(node.id)) continue;
        seen.add(node.id);
        members.push(node);
        queue.push(...getDockNeighbors(node, graph));
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
    for (const item of uniqueNodes(seed)) {
        const members = getDeckMembersLocal(item, graph);
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
        const htmlZ = shieldZ + 1;
        node.baseZIndex = String(shieldZ);
        node._masterZShield = shieldZ;
        node._masterZHtml = htmlZ;
        if (node.interactionShield) {
            const dMode = node.properties?.debugMode;
            node.interactionShield.style.zIndex = (dMode === "Hitbox" || dMode === "Widgets Hitbox")
                ? String(MASTER_Z.debugHitbox)
                : String(shieldZ);
        }
    });
}

export function promoteMasterZ(node, graph = getGraph(node)) {
    if (!node || !graph || !Array.isArray(graph._nodes)) return false;
    const set = getMasterZPromotionSet(node, graph);
    if (!set.length) return false;

    const promoteIds = new Set(set.map((item) => item.id));
    const before = graph._nodes.map((item) => item.id).join("|");
    const remaining = graph._nodes.filter((item) => !promoteIds.has(item.id));
    const promoted = graph._nodes.filter((item) => promoteIds.has(item.id));
    graph._nodes.length = 0;
    graph._nodes.push(...remaining, ...promoted);
    const after = graph._nodes.map((item) => item.id).join("|");
    syncMasterZ(graph);

    if (before !== after) {
        graph.change?.();
        app?.canvas?.setDirty?.(true, true);
        return true;
    }
    return false;
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
