/**
 * PATH: ./js/fatha/core/dockDebugHelpers.js
 * ROLE: Shared dock debug logging and node-snapshot utilities.
 * Used by dockResize, fathaHandler, fathaNodeResize, masterDockEngine.
 */

export function dockDebug(label, payload = {}) {
    if (!globalThis?.DERP_DOCK_RESIZE_DEBUG) return;
    globalThis.DERP_DOCK_RESIZE_LOGS = globalThis.DERP_DOCK_RESIZE_LOGS || [];
    const entry = { label, payload, time: Date.now() };
    globalThis.DERP_DOCK_RESIZE_LOGS.push(entry);
    if (globalThis.DERP_DOCK_RESIZE_LOGS.length > 500) globalThis.DERP_DOCK_RESIZE_LOGS.shift();
}

export function snapshotDockNode(node) {
    if (!node) return null;
    return {
        id: node.id,
        type: node.type,
        title: node.titleLabel || node.title,
        pos: [...(node.pos || [])],
        size: [...(node.size || [])],
        nodeSize: [...(node.properties?.nodeSize || [])],
        autoWidth: node.properties?.autoWidth,
        autoHeight: node.properties?.autoHeight,
        pinActive: node.properties?.pinActive === true,
        contentCollapsed: node.properties?.contentCollapsed === true,
        contentMinWidth: node.layout?.contentMinWidth,
        contentMinHeight: node.layout?.contentMinHeight,
        totalHeight: node.layout?.totalHeight,
        deckParentId: node.properties?.deckParentId,
        deckDockSide: node.properties?.deckDockSide,
        deckEdges: { ...(node.properties?.deckEdges || {}) },
    };
}
