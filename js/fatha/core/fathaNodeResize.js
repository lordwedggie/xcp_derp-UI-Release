import { sysPanel } from "../helpers/fathaSysPanel.js";
import { applyDockResizeResult, syncDockResizePair } from "./fathaDockResize.js";

export function handleNodeResize(entity, data, scale) {
    const { SNAP, autoWidth, autoHeight } = entity.getDerpVars ? entity.getDerpVars(entity) : getDerpVars(entity);
    if (autoWidth && autoHeight) return;

    const propMinW = entity.properties?.minWidth || 0;
    const padL = entity._padL || 0;
    const padR = entity._padR || 0;
    const contentMinW = entity.layout?.contentMinWidth || 60;
    const minW = Math.ceil(Math.max(propMinW, contentMinW + padL + padR) / SNAP) * SNAP;

    const isMinState = entity.properties?.contentCollapsed;

    let explicitMinH = 0;
    if (entity.layoutMap) {
        Object.values(entity.layoutMap).forEach((reg) => { if (reg.minHeight) explicitMinH += reg.minHeight; });
    }

    const minRawH = Math.max(explicitMinH, entity.layout?.contentMinHeight || entity.layout?.totalHeight || 40);
    const minH = isMinState ? minRawH : Math.ceil(minRawH / SNAP) * SNAP;

    const resizeAnchor = data.resizeAnchor || "bottom-right";
    const deltaX = data.dx / scale;
    const deltaY = data.dy / scale;

    const anchorMode = {
        "top-left": { wSign: -1, hSign: -1, moveX: true, moveY: true },
        "top-right": { wSign: 1, hSign: -1, moveX: false, moveY: true },
        "bottom-left": { wSign: -1, hSign: 1, moveX: true, moveY: false },
        "bottom-right": { wSign: 1, hSign: 1, moveX: false, moveY: false },
        "left": { wSign: -1, hSign: 1, moveX: true, moveY: false },
        "right": { wSign: 1, hSign: 1, moveX: false, moveY: false },
        "top": { wSign: 1, hSign: -1, moveX: false, moveY: true }
    }[resizeAnchor] || { wSign: 1, hSign: 1, moveX: false, moveY: false };

    const allowWidthResize = !autoWidth;
    const allowHeightResize = !autoHeight;

    const rawW = entity._startSize[0] + (deltaX * anchorMode.wSign);
    const newW = allowWidthResize ? Math.max(minW, Math.round(rawW / SNAP) * SNAP) : entity.size[0];

    const rawH = entity._startSize[1] + (deltaY * anchorMode.hSign);
    const newH = allowHeightResize ? Math.max(minH, Math.round(rawH / SNAP) * SNAP) : entity.size[1];

    const dockResizeResult = syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, SNAP);
    const appliedW = dockResizeResult.handledWidth ? (dockResizeResult.appliedWidth ?? newW) : newW;
    const appliedH = dockResizeResult.handledHeight ? (dockResizeResult.appliedHeight ?? newH) : newH;

    if (entity.size[0] === appliedW && entity.size[1] === appliedH && dockResizeResult.counterparts.length === 0) return;

    if (allowWidthResize && anchorMode.moveX) {
        entity.pos[0] = entity._startPos[0] + (entity._startSize[0] - appliedW);
    }

    if (allowHeightResize && anchorMode.moveY) {
        entity.pos[1] = entity._startPos[1] + (entity._startSize[1] - appliedH);
    }

    entity.size[0] = appliedW;
    entity.size[1] = appliedH;
    if (entity.properties) entity.properties.nodeSize = [appliedW, appliedH];

    const dockApplyResult = applyDockResizeResult(entity, dockResizeResult);
    if (dockApplyResult.handledAll) return;

    if (sysPanel.isVisible && sysPanel.hostNode?.id === entity.id) {
        sysPanel._layoutDirty = true;
        sysPanel._shouldSync = true;
    }

    entity.setDirtyCanvas(true, true);
    if (entity.syncUncleSlots) entity.syncUncleSlots();
}

function getDerpVars(entity) {
    return entity?.getDerpVars ? entity.getDerpVars(entity) : {
        SNAP: 10,
        autoWidth: entity?.properties?.autoWidth,
        autoHeight: entity?.properties?.autoHeight,
    };
}
