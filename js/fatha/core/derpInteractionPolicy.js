export function consumeSuppressedDragClick(entity, type, options = {}) {
    const { clearPressed = false } = options;
    if (type !== "click" || entity?._suppressClickAfterDrag !== true) return false;
    entity._suppressClickAfterDrag = false;
    if (clearPressed) {
        entity._pressedRegionKey = null;
        entity._pressedRegionData = null;
        entity._pressedRegionType = null;
        entity._pressedRegionIsDragHandle = false;
    }
    return true;
}

export function queueDerpHoverReplay(entity, type, data, replay, options = {}) {
    const { delay = 32, requireHoverState = false } = options;
    if (type === "hover") entity._uiHovered = true;
    if (type !== "move" && type !== "hover") return false;
    if (entity._syncLock) {
        entity._pendingHoverData = data;
        return true;
    }
    entity._syncLock = true;
    setTimeout(() => {
        entity._syncLock = false;
        if (!entity._pendingHoverData) return;
        const pendingData = entity._pendingHoverData;
        entity._pendingHoverData = null;
        if (requireHoverState && entity._uiHovered === false) return;
        replay.call(entity, type, pendingData);
    }, delay);
    return false;
}
