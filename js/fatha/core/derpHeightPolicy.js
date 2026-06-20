export function hasDerpSavedAutoHeightPreference(node) {
    return Object.prototype.hasOwnProperty.call(node?.properties || {}, "deckSavedAutoHeight");
}

export function resolveDerpPreferredAutoHeight(node) {
    const props = node?.properties || {};
    if (typeof node?.getDerpPreferredAutoHeight === "function") {
        return node.getDerpPreferredAutoHeight() === true;
    }
    if (props._derpPreferredAutoHeight !== undefined) {
        return props._derpPreferredAutoHeight === true;
    }
    return props.autoHeight !== false;
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
