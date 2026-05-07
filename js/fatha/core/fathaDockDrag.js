import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";

function recordDockDebug(label, payload = {}) {
    const debugPayload = {
        label,
        time: Date.now(),
        ...payload,
    };
    window.xcpDockDebug = debugPayload;
    console.log("[xcpDockDebug]", debugPayload);
}

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
        recordDockDebug("dragEnd", {
            dragNodeId: entity.id,
            pressedRegionKey: entity._pressedRegionKey || null,
            handledRegionDragEnd,
            altKey: true,
            targetNodeId: targetInfo?.targetNode?.id || null,
            side: targetInfo?.edge?.side || null,
        });
        if (targetInfo?.targetNode) {
            recordDockDebug("before-finalize", {
                dragNodeId: entity.id,
                targetNodeId: targetInfo.targetNode.id,
                side: targetInfo.edge?.side || null,
                dragSizeBefore: Array.isArray(entity.size) ? [...entity.size] : null,
                dragNodeSizeBefore: Array.isArray(entity.properties?.nodeSize) ? [...entity.properties.nodeSize] : null,
                targetSizeBefore: Array.isArray(targetInfo.targetNode.size) ? [...targetInfo.targetNode.size] : null,
                targetNodeSizeBefore: Array.isArray(targetInfo.targetNode.properties?.nodeSize) ? [...targetInfo.targetNode.properties.nodeSize] : null,
            });
            deckEngine.finalizeDeckTarget(entity, targetInfo, SNAP);
            recordDockDebug("after-finalize", {
                dragNodeId: entity.id,
                targetNodeId: targetInfo.targetNode.id,
                side: targetInfo.edge?.side || null,
                dragSizeAfter: Array.isArray(entity.size) ? [...entity.size] : null,
                dragNodeSizeAfter: Array.isArray(entity.properties?.nodeSize) ? [...entity.properties.nodeSize] : null,
                targetSizeAfter: Array.isArray(targetInfo.targetNode.size) ? [...targetInfo.targetNode.size] : null,
                targetNodeSizeAfter: Array.isArray(targetInfo.targetNode.properties?.nodeSize) ? [...targetInfo.targetNode.properties.nodeSize] : null,
                autoHeightAfter: entity.properties?.autoHeight,
                autoWidthAfter: entity.properties?.autoWidth,
            });
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
