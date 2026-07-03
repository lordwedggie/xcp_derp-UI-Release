export function hasDerpSavedAutoHeightPreference(node) {
    return Object.prototype.hasOwnProperty.call(node?.properties || {}, "deckSavedAutoHeight");
}

export function hasDerpSavedAutoWidthPreference(node) {
    return Object.prototype.hasOwnProperty.call(node?.properties || {}, "deckSavedAutoWidth");
}

export function resolveDerpPreferredAutoHeight(node) {
    const props = node?.properties || {};
    if (typeof node?.getDerpPreferredAutoHeight === "function") {
        return node.getDerpPreferredAutoHeight() === true;
    }
    // _derpPreferredAutoHeight is set by lockDeckStackMembersForAttach (Manual
    // mode) and applyDerpPreferredAutoHeight. Only honor it when the node is
    // actively docked (has deckSavedAutoHeight). For standalone nodes,
    // _derpPreferredAutoHeight may be a stale override from a previous
    // Manual-mode session that wasn't cleaned up — ignore it and fall back to
    // runtime autoHeight, which applyDerpPreferredAutoHeight keeps in sync for
    // standalone nodes.
    if (hasDerpSavedAutoHeightPreference(node)) {
        if (props._derpPreferredAutoHeight !== undefined) {
            return props._derpPreferredAutoHeight === true;
        }
        return props.deckSavedAutoHeight === true;
    }
    return props.autoHeight !== false;
}

export function resolveDerpPreferredAutoWidth(node) {
    const props = node?.properties || {};
    // _derpPreferredAutoWidth is only set by lockDeckStackMembersForAttach
    // (Manual mode) during deck attach, which always runs after saveDeckNodeAxes.
    // Only honor it when the node is actively docked (has deckSavedAutoWidth).
    // For standalone nodes, _derpPreferredAutoWidth may be a stale override
    // from a previous Manual-mode session that wasn't cleaned up — ignore it
    // and fall back to runtime autoWidth.
    if (hasDerpSavedAutoWidthPreference(node)) {
        if (props._derpPreferredAutoWidth !== undefined) {
            return props._derpPreferredAutoWidth === true;
        }
        return props.deckSavedAutoWidth === true;
    }
    return props.autoWidth === true;
}

export function resolveDerpRuntimeAutoHeight(node) {
    const props = node?.properties || {};
    const preferred = resolveDerpPreferredAutoHeight(node);
    if (!hasDerpSavedAutoHeightPreference(node)) return preferred;
    if (props.deckForceAutoHeight === true) return preferred;
    return false;
}

export function applyDerpPreferredAutoHeight(node, preferred = resolveDerpPreferredAutoHeight(node)) {
    if (!node?.properties) node.properties = {};
    const nextPreferred = preferred === true;
    node.properties._derpPreferredAutoHeight = nextPreferred;
    if (hasDerpSavedAutoHeightPreference(node)) {
        node.properties.deckSavedAutoHeight = nextPreferred;
        node.properties.autoHeight = node.properties.deckForceAutoHeight === true ? nextPreferred : false;
        return nextPreferred;
    }
    node.properties.autoHeight = nextPreferred;
    return nextPreferred;
}
