/**
 * Path: ./js/fatha/legacy/fathaDragDrop.js
 * ROLE: Consolidated Drag-and-Drop utility for stack-based REGION widgets.
 * Logic generalized from derpTriggerWall_core.js.
 */
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";

/**
 * Initializes the drag state for an item in a stack.
 * @param {Object} node - The host Fatha node.
 * @param {Object} data - Interaction coordinate data from the shield.
 * @param {number} index - The starting index of the item in the property array.
 * @param {string} regionKey - The layoutMap key of the region being dragged.
 */
export function startStackDrag(node, data, index, regionKey) {
    const reg = node.layout.regions[regionKey];
    if (!reg) return;

    node._dragTrig = { index, regionKey };
    node._dragMouse = [data.localX, data.localY];
    node._dragOffset = [data.localX - reg.x, data.localY - reg.y];
    node._dragThresholdMet = false;
    node._derpAwakeFrames = 10;

    if (node._dragHoldTimer) clearTimeout(node._dragHoldTimer);
    node._dragHoldTimer = setTimeout(() => {
        if (node._dragTrig) {
            node._dragThresholdMet = true;
            if (window.DERP_GLOBAL_SETTINGS?.playSound && SOUND_INDEX.pickup) SOUND_INDEX.pickup();
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.requestDerpSync) node.requestDerpSync();
            if (node.setDirtyCanvas) node.setDirtyCanvas(true);
        }
    }, 500);
}

/**
 * Updates the calculated drop preview index based on current mouse position.
 * @param {Object} node - The host Fatha node.
 * @param {Object} data - Interaction coordinate data from the shield.
 * @param {string} regionPrefix - The key prefix used for regions in the stack (e.g., "loraRow_").
 * @param {number} itemCount - Total number of items in the stack.
 */
export function updateStackDrag(node, data, regionPrefix, itemCount) {
    if (!node._dragTrig) return;

    if (!node._dragThresholdMet) {
        const dist = Math.hypot(data.localX - node._dragMouse[0], data.localY - node._dragMouse[1]);
        if (dist < 20) return; // Increased threshold to prevent twitchy clicks from triggering drag
        node._dragThresholdMet = true;
        if (node._dragHoldTimer) clearTimeout(node._dragHoldTimer);
        if (window.DERP_GLOBAL_SETTINGS?.playSound && SOUND_INDEX.pickup) SOUND_INDEX.pickup();
    }

    node._dragMouse = [data.localX, data.localY];
    const mouseY = data.localY;

    // Identify stable regions in the stack to compare midpoints
    const stableRegs = [];
    for (let i = 0; i < itemCount; i++) {
        if (i === node._dragTrig.index) continue;
        const r = node.layout.regions[`${regionPrefix}${i}`];
        if (r) stableRegs.push(r);
    }

    // Sort by vertical position to ensure linear traversal[cite: 43]
    stableRegs.sort((a, b) => a.y - b.y);

    let targetIdx = 0;
    for (let i = 0; i < stableRegs.length; i++) {
        const reg = stableRegs[i];
        const thresholdY = reg.y + (reg.h / 2);
        // If mouse is below the midpoint of a stable item, move target index past it
        if (mouseY > thresholdY) {
            targetIdx = i + 1;
        } else {
            break;
        }
    }

    // Prefer tail insertion when hovering the lower half of the last visible row
    // or any space directly below it. This ensures reliable append behavior.
    if (stableRegs.length > 0) {
        const lastReg = stableRegs[stableRegs.length - 1];
        const tailThresholdY = lastReg.y + (lastReg.h * 0.5);
        const belowLastRowY = lastReg.y + lastReg.h;
        if (mouseY >= tailThresholdY || mouseY >= belowLastRowY) {
            targetIdx = stableRegs.length;
        }
    }

    if (node._dropPreviewIdx !== targetIdx) {
        node._dropPreviewIdx = targetIdx;
        node.refreshNodeLayoutMap();
    }
    node.setDirtyCanvas(true);
}

/**
 * Finalizes the drag operation by reordering the underlying property array.
 * @param {Object} node - The host Fatha node.
 * @param {string} arrayKey - The key of the property array to mutate (e.g., "stackData").
 */
export function endStackDrag(node, arrayKey) {
    if (node._dragHoldTimer) {
        clearTimeout(node._dragHoldTimer);
        node._dragHoldTimer = null;
    }

    const drag = node._dragTrig;
    const thresholdMet = node._dragThresholdMet;
    const finalTarget = node._dropPreviewIdx;

    // Suppress the synthetic click that some canvases emit right after drag end.
    // This prevents opening detail panels when the intent was only dragging.
    if (thresholdMet) node._suppressClickAfterDrag = true;

    if (thresholdMet && window.DERP_GLOBAL_SETTINGS?.playSound && SOUND_INDEX.dropdown) {
        SOUND_INDEX.dropdown();
    }

    node._dragTrig = null;
    node._dragMouse = null;
    node._dragOffset = null;
    node._dropPreviewIdx = undefined;
    node._dragThresholdMet = false;

    if (!drag || !thresholdMet) return;

    if (finalTarget !== undefined) {
        const stack = node.properties[arrayKey];
        if (Array.isArray(stack) && finalTarget !== drag.index) {
            const [moved] = stack.splice(drag.index, 1);
            stack.splice(finalTarget, 0, moved);

            if (node.syncDerpOutputs) node.syncDerpOutputs();
        }
    }

    node.refreshNodeLayoutMap();
    node.setDirtyCanvas(true, true);
}
