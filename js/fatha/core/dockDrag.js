import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import { setDeckNodePos } from "./masterDockEngine.js";

const DOCK_TARGET_RADIUS = 14;
const DOCK_GHOST_THICKNESS = 10;

export function beginDockDrag(entity, deckEngine) {
    const deckRoot = deckEngine.beginDrag(entity);
    entity._deckDragRootId = deckRoot?.id || entity.id;
    entity._deckDragRootStartPos = [...(deckRoot?.pos || entity.pos || [0, 0])];
    entity._deckDragSideLock = null;
}

export function updateDockDrag(entity, deckEngine, data, scale) {
    const { SNAP } = entity.getDerpVars(entity);
    const dragRoot = deckEngine.getActiveRoot?.() || deckEngine.getRoot(entity) || entity;
    const rootStartPos = entity._deckDragRootStartPos || entity._startPos || dragRoot.pos || [0, 0];
    const deltaX = data.dx / scale;
    const deltaY = data.dy / scale;
    setDeckNodePos(
        dragRoot,
        Math.round((rootStartPos[0] + deltaX) / SNAP) * SNAP,
        Math.round((rootStartPos[1] + deltaY) / SNAP) * SNAP
    );
    deckEngine.syncDraggedDeck(dragRoot, SNAP, { dx: deltaX, dy: deltaY }).forEach((member) => {
        syncDerpShield(member);
    });
    if (data.originalEvent?.altKey) {
        entity._deckDragAltActive = true;
        const lockedSide = entity._deckDragSideLock?.side || null;
        const lockedHoverNodeId = entity._deckDragSideLock?.hoverNodeId ?? null;
        let target = deckEngine.resolveDeckTarget(dragRoot, {
            radius: DOCK_TARGET_RADIUS,
            ghostThickness: DOCK_GHOST_THICKNESS,
            lockedSide,
            lockedHoverNodeId,
        });

        // If locked side no longer yields a target, release lock and retry
        // so users can switch between horizontal/vertical edges in one drag.
        if (lockedSide && (!target || target.valid === false)) {
            entity._deckDragSideLock = null;
            target = deckEngine.resolveDeckTarget(dragRoot, {
                radius: DOCK_TARGET_RADIUS,
                ghostThickness: DOCK_GHOST_THICKNESS,
                lockedSide: null,
                lockedHoverNodeId: null,
            });
        }

        if (!entity._deckDragSideLock && target?.valid !== false && target?.edge?.side) {
            entity._deckDragSideLock = {
                side: target.edge.side,
                hoverNodeId: target.hoverNodeId ?? target.targetNode?.id ?? null,
            };
        }
    } else {
        deckEngine.previewTarget = null;
        deckEngine.lastDeckTargetId = null;
        entity._deckDragAltActive = false;
        entity._deckDragSideLock = null;
    }
    entity.setDirtyCanvas(true, true);
    syncDerpShield(dragRoot);
}

export function endDockDrag(entity, deckEngine, data) {
    const shouldFinalizeAltDock = !!data.originalEvent?.altKey || !!entity._deckDragAltActive;
    let handledRegionDragEnd = false;
    const dragEndRegionKey = entity._dragEndRegionKey || entity._pressedRegionKey;
    if (dragEndRegionKey) {
        const reg = entity.layout?.regions[dragEndRegionKey];
        if (reg && reg.onDragEnd) {
            reg.onDragEnd(data.originalEvent, data);
            handledRegionDragEnd = true;
        }
    }
    if (shouldFinalizeAltDock) {
        const { SNAP } = entity.getDerpVars(entity);
        const dragRoot = deckEngine.getActiveRoot?.() || deckEngine.getRoot(entity) || entity;
        const targetInfo = deckEngine.resolveDeckTarget(dragRoot, {
            radius: DOCK_TARGET_RADIUS,
            ghostThickness: DOCK_GHOST_THICKNESS,
            lockedSide: entity._deckDragSideLock?.side || null,
            lockedHoverNodeId: entity._deckDragSideLock?.hoverNodeId ?? null,
        });
        if (targetInfo?.targetNode) {
            const dockTarget = targetInfo.targetNode;
            const didDock = deckEngine.finalizeDeckTarget(dragRoot, targetInfo, SNAP);
            if (typeof dragRoot.syncUncleSlots === "function") dragRoot.syncUncleSlots();
            if (typeof dockTarget?.syncUncleSlots === "function") dockTarget.syncUncleSlots();

            // Ensure dock-state-dependent widgets (e.g., btnDeck) update immediately on both nodes.
            if (didDock) {
                if (typeof dragRoot.requestDerpSync === "function") dragRoot.requestDerpSync();
                if (typeof dockTarget?.requestDerpSync === "function") dockTarget.requestDerpSync();
                if (typeof dragRoot.setDirtyCanvas === "function") dragRoot.setDirtyCanvas(true, true);
                if (typeof dockTarget?.setDirtyCanvas === "function") dockTarget.setDirtyCanvas(true, true);
                if (window.DERP_GLOBAL_SETTINGS?.playSound !== false && SOUND_INDEX.docked) {
                    SOUND_INDEX.docked();
                }
            }
        }
    }
    entity._pressedRegionKey = null;
    entity._dragEndRegionKey = null;
    entity._deckDragAltActive = false;
    entity._deckDragSideLock = null;
    entity._deckDragRootId = null;
    entity._deckDragRootStartPos = null;
    deckEngine.endDrag();
    entity.setDirtyCanvas(true, true);

    if (app.graph && app.graph.change) app.graph.change();
    if (app.canvas && app.canvas.onNodeMoved && (entity.isFathaNode || entity.isUncleNode)) {
        app.canvas.onNodeMoved(entity);
    }
}
