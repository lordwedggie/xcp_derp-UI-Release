import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";

export function beginDockDrag(entity, deckEngine) {
    const deckRoot = deckEngine.beginDrag(entity);
    entity._deckDragRootId = deckRoot?.id || entity.id;
    entity._deckDragRootStartPos = [...(deckRoot?.pos || entity.pos || [0, 0])];
}

export function updateDockDrag(entity, deckEngine, data, scale) {
    const { SNAP } = entity.getDerpVars(entity);
    const dragRoot = deckEngine.getActiveRoot?.() || deckEngine.getRoot(entity) || entity;
    const rootStartPos = entity._deckDragRootStartPos || entity._startPos || dragRoot.pos || [0, 0];
    const deltaX = data.dx / scale;
    const deltaY = data.dy / scale;
    dragRoot.pos[0] = Math.round((rootStartPos[0] + deltaX) / SNAP) * SNAP;
    dragRoot.pos[1] = Math.round((rootStartPos[1] + deltaY) / SNAP) * SNAP;
    deckEngine.syncDraggedDeck(dragRoot, SNAP, { dx: deltaX, dy: deltaY }).forEach((member) => {
        syncDerpShield(member);
    });
    if (data.originalEvent?.altKey) {
        deckEngine.resolveDeckTarget(entity, { radius: 120, ghostThickness: 10 });
    } else {
        deckEngine.previewTarget = null;
        deckEngine.lastDeckTargetId = null;
    }
    entity.setDirtyCanvas(true, true);
    syncDerpShield(dragRoot);
}

export function endDockDrag(entity, deckEngine, data) {
    const shouldFinalizeAltDock = !!data.originalEvent?.altKey;
    let handledRegionDragEnd = false;
    if (entity._pressedRegionKey) {
        const reg = entity.layout?.regions[entity._pressedRegionKey];
        if (reg && reg.onDragEnd) {
            reg.onDragEnd(data.originalEvent, data);
            handledRegionDragEnd = true;
        }
    }
    if (shouldFinalizeAltDock) {
        const { SNAP } = entity.getDerpVars(entity);
        const targetInfo = deckEngine.resolveDeckTarget(entity, { radius: 120, ghostThickness: 10 });
        if (targetInfo?.targetNode) {
            deckEngine.finalizeDeckTarget(entity, targetInfo, SNAP);
            if (typeof entity.syncUncleSlots === "function") entity.syncUncleSlots();
        }
    }
    entity._pressedRegionKey = null;
    entity._deckDragAltActive = false;
    entity._deckDragRootId = null;
    entity._deckDragRootStartPos = null;
    deckEngine.endDrag();
    entity.setDirtyCanvas(true, true);

    if (app.graph && app.graph.change) app.graph.change();
    if (app.canvas && app.canvas.onNodeMoved && (entity.isFathaNode || entity.isUncleNode)) {
        app.canvas.onNodeMoved(entity);
    }
}
