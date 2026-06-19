/**
 * Path: ./js/fatha/legacy/fathaDragDrop.js
 * ROLE: Consolidated Drag-and-Drop utility for stack-based REGION widgets.
 * Logic generalized from derpTriggerWall_core.js.
 */
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import { app } from "../../../../scripts/app.js";
import { settleDerpSizeBeforeDraw, shouldPreserveHorizontalDeckHeight, syncHorizontalDeckHeight } from "../core/fathaHandler.js";
import { getContentViewportForRegion, isContentViewportRegionHitVisible } from "../core/fathaContentViewport.js";
import { getDeckMembers } from "../core/masterDockEngine.js";

const STACK_DRAG_HOLD_BOX_PX = 5;
const STACK_DRAG_HOLD_BOX_HALF = STACK_DRAG_HOLD_BOX_PX / 2;
const STACK_DRAG_RELEASE_LOCK_MS = 120;

function isStackDragRegionVisible(node, regionKey, localPoint) {
    return isContentViewportRegionHitVisible(node, regionKey, localPoint);
}

function numberOr(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function isStackDragRegionDisplayed(node, region) {
    if (!node || !region?.key) return false;
    const state = getContentViewportForRegion(node, region.key);
    if (!state?.rect || state.key === region.key) return true;
    const visibleTop = numberOr(state.rect.y) + numberOr(state.scrollTop);
    const visibleBottom = visibleTop + numberOr(state.rect.h);
    const regionTop = numberOr(region.y);
    const regionBottom = regionTop + numberOr(region.h);
    return regionBottom >= visibleTop && regionTop <= visibleBottom;
}

function getInsertionBefore(candidateIndex, dragIndex) {
    return candidateIndex < dragIndex ? candidateIndex : Math.max(0, candidateIndex - 1);
}

function getInsertionAfter(candidateIndex, dragIndex) {
    return candidateIndex < dragIndex ? candidateIndex + 1 : candidateIndex;
}

function activateStackDrag(node) {
    if (!node?._dragTrig || node._dragThresholdMet) return;

    if (node._dragHoldTimer) {
        clearTimeout(node._dragHoldTimer);
        node._dragHoldTimer = null;
    }

    node._dragThresholdMet = true;
    if (!Number.isInteger(node._dropPreviewIdx) && Number.isInteger(node._dragTrig?.index)) {
        node._dropPreviewIdx = node._dragTrig.index;
    }
    if (node._dragTrig?.regionKey) node._pressedRegionKey = node._dragTrig.regionKey;
    if (window.DERP_GLOBAL_SETTINGS?.playSound && SOUND_INDEX.pickup) SOUND_INDEX.pickup();
    if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
    if (node.requestDerpSync) node.requestDerpSync();
    if (node.setDirtyCanvas) node.setDirtyCanvas(true);
}

function finalizeHorizontalStackStructure(node) {
    if (!node || typeof shouldPreserveHorizontalDeckHeight !== "function" || !shouldPreserveHorizontalDeckHeight(node)) return;
    const graph = app.graph || node.graph || null;
    const members = graph ? getDeckMembers(node, graph) : [];
    if (!Array.isArray(members) || members.length <= 1) return;

    const remeasureNode = (target) => {
        if (!target || typeof settleDerpSizeBeforeDraw !== "function") return 0;
        settleDerpSizeBeforeDraw(target, {
            forceAutoHeight: true,
            suppressRequestSync: true,
        });
        return Number(target.properties?.nodeSize?.[1] ?? target.size?.[1]) || 0;
    };

    const targetHeight = members.reduce((maxHeight, member) => {
        return Math.max(maxHeight, remeasureNode(member));
    }, 0);

    if (targetHeight > 0 && typeof syncHorizontalDeckHeight === "function") {
        syncHorizontalDeckHeight(node, targetHeight);
    }

    members.forEach((member) => {
        if (member.requestDerpSync) member.requestDerpSync();
        if (member.setDirtyCanvas) member.setDirtyCanvas(true, true);
    });
}

function markHorizontalStackReleaseLock(node) {
    const graph = app.graph || node?.graph || null;
    const members = graph ? getDeckMembers(node, graph) : [];
    if (!Array.isArray(members) || members.length <= 1) return;
    const releaseLockUntil = Date.now() + STACK_DRAG_RELEASE_LOCK_MS;
    members.forEach((member) => {
        member._stackDragReleaseLockUntil = releaseLockUntil;
    });
}

/**
 * Initializes the drag state for an item in a stack.
 * @param {Object} node - The host Fatha node.
 * @param {Object} data - Interaction coordinate data from the shield.
 * @param {number} index - The starting index of the item in the property array.
 * @param {string} regionKey - The layoutMap key of the region being dragged.
 */
export function startStackDrag(node, data, index, regionKey, options = {}) {
    const reg = node.layout.regions[regionKey];
    if (!reg) return;
    const localPoint = { x: data.localX, y: data.localY };
    if (!isStackDragRegionVisible(node, regionKey, localPoint)) return;

    node._dragTrig = {
        index,
        regionKey,
        // Default to hold-first activation for row/list DnD.
        // Callers that truly want movement-armed drag must opt in with holdOnly: false.
        holdOnly: options?.holdOnly !== false
    };
    node._dragMouse = [data.localX, data.localY];
    node._dragOffset = [data.localX - reg.x, data.localY - reg.y];
    node._dragThresholdMet = false;
    node._derpAwakeFrames = 10;

    if (node._dragHoldTimer) clearTimeout(node._dragHoldTimer);
    node._dragHoldTimer = setTimeout(() => {
        activateStackDrag(node);
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
        const driftX = Math.abs(data.localX - node._dragMouse[0]);
        const driftY = Math.abs(data.localY - node._dragMouse[1]);
        if (node._dragTrig?.holdOnly) {
            // True click-and-hold: any meaningful pointer drift before the timer
            // completes cancels hold activation for this press.
            if (driftX > STACK_DRAG_HOLD_BOX_HALF || driftY > STACK_DRAG_HOLD_BOX_HALF) {
                if (node._dragHoldTimer) {
                    clearTimeout(node._dragHoldTimer);
                    node._dragHoldTimer = null;
                }
                node._dragTrig.holdCancelled = true;
            }
            return;
        }
        if (driftX > STACK_DRAG_HOLD_BOX_HALF || driftY > STACK_DRAG_HOLD_BOX_HALF) {
            activateStackDrag(node);
        }
        if (!node._dragThresholdMet) return;
    }

    node._dragMouse = [data.localX, data.localY];
    const mouseY = data.localY;

    // Identify stable regions in the stack to compare midpoints
    const stableRegs = [];
    for (let i = 0; i < itemCount; i++) {
        if (i === node._dragTrig.index) continue;
        const r = node.layout.regions[`${regionPrefix}${i}`];
        if (r && isStackDragRegionDisplayed(node, r)) stableRegs.push({ reg: r, index: i });
    }

    // Sort by vertical position to ensure linear traversal[cite: 43]
    stableRegs.sort((a, b) => a.reg.y - b.reg.y);

    let targetIdx = stableRegs.length ? getInsertionBefore(stableRegs[0].index, node._dragTrig.index) : node._dragTrig.index;
    for (let i = 0; i < stableRegs.length; i++) {
        const { reg, index } = stableRegs[i];
        const thresholdY = reg.y + (reg.h / 2);
        // If mouse is below the midpoint of a stable item, move target index past it
        if (mouseY > thresholdY) {
            targetIdx = getInsertionAfter(index, node._dragTrig.index);
        } else {
            break;
        }
    }

    // Prefer tail insertion when hovering the lower half of the last visible row
    // or any space directly below it. This ensures reliable append behavior.
    if (stableRegs.length > 0) {
        const { reg: lastReg, index: lastIndex } = stableRegs[stableRegs.length - 1];
        const tailThresholdY = lastReg.y + (lastReg.h * 0.5);
        const belowLastRowY = lastReg.y + lastReg.h;
        if (mouseY >= tailThresholdY || mouseY >= belowLastRowY) {
            targetIdx = getInsertionAfter(lastIndex, node._dragTrig.index);
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

    if (thresholdMet) {
        markHorizontalStackReleaseLock(node);
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

    if (typeof node.syncLoraStackStructureHeight === "function") {
        node.syncLoraStackStructureHeight();
    } else {
        finalizeHorizontalStackStructure(node);
    }

    node.refreshNodeLayoutMap();
    node.setDirtyCanvas(true, true);
}
