import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import {
    getDeckParent,
    getDeckChildren,
    getDeckMembers,
    isLinearDeckGroup,
    isNodeDocked,
    syncDeckNodeSize,
    setDeckNodePos,
    masterDockEngine,
} from "./masterDockEngine.js";
import {
    getDockGroupAxisFromMembers,
    getDockNodeHeight,
    getDockNodeWidth,
    getDockNodeMinWidth,
    getSharedDockHeight,
    resolveDockResizeDimensions,
    resolveRuntimeDockSize,
    shouldPreserveDockHeight,
    shouldPreserveDockWidth,
} from "./dockDimensions.js";
import { dockDebug, snapshotDockNode } from "./dockDebugHelpers.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";

globalThis.DERP_DOCK_RESIZE_DEBUG = true;
globalThis.DERP_DOCK_RESIZE_CONSOLE = false;
globalThis.DERP_DOCK_RESIZE_LOGS = globalThis.DERP_DOCK_RESIZE_LOGS || [];

function snapshotDockMembers(node, graph) {
    return graph && node ? getDeckMembers(node, graph).map(snapshotDockNode) : [];
}

export function resolveCollapseShiftDirection(node, graph) {
    if (!node || !graph) return 0;
    if (!isNodeDocked(node, graph)) return 0;
    if (!isLinearDeckGroup(node, graph, "vertical")) return 0;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return 0;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return 0;

    if (pinned.id === node.id) {
        const collapseUpward = window.DERP_GLOBAL_SETTINGS?.verticalPinnedCollapseUpward ?? true;
        return collapseUpward ? -1 : 0;
    }

    const nodeY = Number(node.pos?.[1]) || 0;
    const pinY = Number(pinned.pos?.[1]) || 0;
    return nodeY < pinY ? -1 : 0;
}

export function getPinnedVerticalDeckAnchor(node, graph) {
    if (!node || !graph) return null;
    if (!isNodeDocked(node, graph)) return null;
    if (!isLinearDeckGroup(node, graph, "vertical")) return null;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return null;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return null;

    const pinnedY = Number(pinned.pos?.[1]) || 0;
    const pinnedH = Number(pinned.size?.[1] ?? pinned.properties?.nodeSize?.[1]) || 0;
    const anchor = { members, pinned, bottom: pinnedY + pinnedH };
    dockDebug("pin-anchor-capture", {
        node: snapshotDockNode(node),
        pinned: snapshotDockNode(pinned),
        bottom: anchor.bottom,
        members: members.map(snapshotDockNode),
    });
    return anchor;
}

export function getPinnedVerticalDeckPositionAnchor(node, graph) {
    if (!node || !graph) return null;
    if (!isNodeDocked(node, graph)) return null;
    if (!isLinearDeckGroup(node, graph, "vertical")) return null;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return null;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned) return null;

    const anchor = {
        members,
        pinned,
        y: Number(pinned.pos?.[1]) || 0,
    };
    dockDebug("pin-position-capture", {
        node: snapshotDockNode(node),
        pinned: snapshotDockNode(pinned),
        y: anchor.y,
        members: members.map(snapshotDockNode),
    });
    return anchor;
}

export function restorePinnedVerticalDeckAnchor(anchor) {
    const pinned = anchor?.pinned;
    if (!pinned) return 0;

    const nextPinnedY = Number(pinned.pos?.[1]) || 0;
    const nextPinnedH = Number(pinned.size?.[1] ?? pinned.properties?.nodeSize?.[1]) || 0;
    const offsetY = (Number(anchor.bottom) || 0) - (nextPinnedY + nextPinnedH);
    dockDebug("pin-anchor-restore-before", {
        pinned: snapshotDockNode(pinned),
        targetBottom: anchor.bottom,
        nextBottom: nextPinnedY + nextPinnedH,
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    if (offsetY === 0) return 0;

    anchor.members.forEach((member) => {
        if (!member?.pos) return;
        setDeckNodePos(member, Number(member.pos?.[0]) || 0, (Number(member.pos?.[1]) || 0) + offsetY);
    });
    dockDebug("pin-anchor-restore-after", {
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    return offsetY;
}

export function restorePinnedVerticalDeckPositionAnchor(anchor) {
    const pinned = anchor?.pinned;
    if (!pinned) return 0;

    const nextPinnedY = Number(pinned.pos?.[1]) || 0;
    const offsetY = (Number(anchor.y) || 0) - nextPinnedY;
    dockDebug("pin-position-restore-before", {
        pinned: snapshotDockNode(pinned),
        targetY: anchor.y,
        nextY: nextPinnedY,
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    if (offsetY === 0) return 0;

    anchor.members.forEach((member) => {
        if (!member?.pos) return;
        setDeckNodePos(member, Number(member.pos?.[0]) || 0, (Number(member.pos?.[1]) || 0) + offsetY);
    });
    dockDebug("pin-position-restore-after", {
        offsetY,
        members: anchor.members.map(snapshotDockNode),
    });
    return offsetY;
}

export function shouldPreserveVerticalDeckWidth(node, graph = app.graph || node?.graph || null) {
    if (!graph || !node) return false;
    return shouldPreserveDockWidth(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function shouldPreserveHorizontalDeckHeight(node, graph = app.graph || node?.graph || null) {
    if (!graph || !node) return false;
    return shouldPreserveDockHeight(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function syncHorizontalDeckHeight(node, graph = app.graph || node?.graph || null, targetHeight = 0) {
    if (!graph || !node || !isLinearDeckGroup(node, graph, "horizontal")) return false;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return false;

    const explicitTargetHeight = Number(targetHeight) || 0;
    const now = Date.now();
    const hasActiveStackDrag = members.some((member) =>
        (member?._dragTrig && member?._dragThresholdMet) || (Number(member?._stackDragReleaseLockUntil) || 0) > now
    );
    const resolvedHeight = explicitTargetHeight > 0
        ? (hasActiveStackDrag ? Math.max(getSharedDockHeight(members, targetHeight), explicitTargetHeight) : explicitTargetHeight)
        : getSharedDockHeight(members, targetHeight);
    if (resolvedHeight <= 0) return false;

    const topY = members.reduce((minY, member) => {
        return Math.min(minY, Number(member?.pos?.[1]) || 0);
    }, Number.POSITIVE_INFINITY);
    const resolvedY = Number.isFinite(topY) ? topY : (Number(node.pos?.[1]) || 0);
    let changed = false;

    members.forEach((member) => {
        const heightChanged = syncDeckNodeSize(member, getDockNodeWidth(member), resolvedHeight);
        const yChanged = (Number(member?.pos?.[1]) || 0) !== resolvedY;
        if (member?.pos && yChanged) setDeckNodePos(member, Number(member.pos?.[0]) || 0, resolvedY);
        if (heightChanged || yChanged) {
            changed = true;
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
        }
    });

    return changed;
}

function getDockResizeEngine() {
    if (!window.xcpMasterDeckEngine) {
        window.xcpMasterDeckEngine = new masterDockEngine(app.graph || null);
    }
    if (window.xcpMasterDeckEngine?.setGraph) {
        window.xcpMasterDeckEngine.setGraph(app.graph || null);
    }
    return window.xcpMasterDeckEngine;
}

export function settleDerpSizeBeforeDrawImpl(entity, options = {}, deps = {}) {
    const { getDerpVars, animateDerpSize } = deps;
    if (!entity?.layout || !entity?.properties || typeof getDerpVars !== "function" || typeof animateDerpSize !== "function") return;

    if (entity.layout) entity.layout._lastCacheKey = "";
    entity.layout.compute({ x: 0, y: 0, w: entity.size?.[0] || 0, h: entity.size?.[1] || 0 }, getVirtualNodeLayoutMap(entity), {
        textTheme: entity._t_textSmallPaintData || entity._t_textNormalPaintData,
        useAnim: false,
        spawnAnim: false,
        isVirtual: true,
    }, true);

    const { SNAP, autoWidth, autoHeight } = getDerpVars(entity);
    const isMinState = entity.properties.contentCollapsed === true;
    const contentReqW = entity.layout?.contentMinWidth || 0;
    const engineFloorW = Math.ceil(contentReqW / SNAP) * SNAP;
    const layoutTotalH = Number(entity.layout?.totalHeight) || 0;
    const layoutContentH = Number(entity.layout?.contentMinHeight) || 0;
    const forceAutoHeight = options?.forceAutoHeight === true;
    const rawH = forceAutoHeight && !isMinState
        ? (layoutContentH || layoutTotalH || 40)
        : (isMinState && entity.properties?.useCollapsedTotalHeight === true)
            ? (Math.max(layoutContentH, layoutTotalH) || 40)
            : (layoutTotalH || layoutContentH || 40);
    const engineFloorH = isMinState ? rawH : Math.ceil(rawH / SNAP) * SNAP;
    const collapseMinimal = entity.properties?.collapseMinimal === true;
    const targetW = (autoWidth || (isMinState && collapseMinimal)) ? engineFloorW : Math.max(entity.properties.nodeSize?.[0] || 0, engineFloorW);
    const preserveCurrentHeight = options?.preserveCurrentHeight === true;
    const currentH = Number(entity.size?.[1]) || Number(entity.properties.nodeSize?.[1]) || 0;
    const targetH = preserveCurrentHeight
        ? currentH
        : (forceAutoHeight || autoHeight || isMinState) ? engineFloorH : Math.max(entity.properties.nodeSize?.[1] || 0, engineFloorH);

    dockDebug("settle-before-draw", {
        node: snapshotDockNode(entity),
        options,
        measured: {
            contentReqW,
            layoutContentH,
            layoutTotalH,
            engineFloorW,
            engineFloorH,
            preserveCurrentHeight,
        },
        target: { width: targetW, height: targetH },
    });

    animateDerpSize(entity, targetW, targetH, false, {
        suppressRequestSync: options?.suppressRequestSync === true,
    });
}

function settleCollapseSizeBeforeDrawImpl(entity, deps = {}) {
    settleDerpSizeBeforeDrawImpl(entity, {
        forceAutoHeight: entity?.properties?.contentCollapsed !== true && entity?.properties?.autoHeight !== false,
    }, deps);
}

export function animateDerpSizeImpl(node, targetW, targetH, useAnim, options = {}, deps = {}) {
    const { requestSyncFallback } = deps;
    if (node.size[0] !== targetW || node.size[1] !== targetH) {
        const prevH = Number(node.size?.[1]) || 0;
        const graph = app.graph || node.graph || null;
        const deltaH = (Number(targetH) || 0) - prevH;
        const allowCollapseShift = node._allowDockCollapseShift === true;
        const deckAnchor = (deltaH !== 0)
            ? getPinnedVerticalDeckPositionAnchor(node, graph)
            : null;
        const shouldAnchorAfterReflow = !!deckAnchor && !allowCollapseShift;
        dockDebug("animate-size-before", {
            node: snapshotDockNode(node),
            target: { width: targetW, height: targetH },
            deltaH,
            useAnim,
            options,
            allowCollapseShift,
            hasDeckAnchor: !!deckAnchor,
            shouldAnchorAfterReflow,
        });
        setDerpNodeSizeCompat(node, targetW, targetH);
        if (node.properties) node.properties.nodeSize = [targetW, targetH];
        const shiftDirection = allowCollapseShift ? resolveCollapseShiftDirection(node, graph) : 0;
        const skipCollapseShift = node._skipNextAnimateCollapseShift === true;
        if (skipCollapseShift) node._skipNextAnimateCollapseShift = false;
        if (!skipCollapseShift && deltaH !== 0 && shiftDirection !== 0) {
            setDeckNodePos(node, Number(node.pos?.[0]) || 0, (Number(node.pos?.[1]) || 0) + (deltaH * shiftDirection));
        }
        const isVerticalDeck = graph && isLinearDeckGroup(node, graph, "vertical");
        const heightChanged = deltaH !== 0;
        const shouldReflow = allowCollapseShift || (isVerticalDeck && heightChanged);

        if (graph && shouldReflow) {
            const moved = getDockResizeEngine()?.reflowChildren?.(node) || [];
            dockDebug("animate-size-reflow", {
                node: snapshotDockNode(node),
                moved: moved.map(snapshotDockNode),
                shouldAnchorAfterReflow,
            });
            if (shouldAnchorAfterReflow) {
                restorePinnedVerticalDeckPositionAnchor(deckAnchor);
            }
            moved.forEach((child) => {
                if (typeof child.syncUncleSlots === "function") child.syncUncleSlots();
                if (typeof child.setDirtyCanvas === "function") child.setDirtyCanvas(true, true);
            });
        }
        dockDebug("animate-size-after", {
            node: snapshotDockNode(node),
            graphMembers: graph ? getDeckMembers(node, graph).map(snapshotDockNode) : [],
        });
        if (options?.suppressRequestSync !== true) {
            if (node.requestDerpSync) node.requestDerpSync();
            else if (typeof requestSyncFallback === "function") requestSyncFallback(node);
        }
    }

    if (node?.properties?.contentCollapsed !== true && Number(targetH) > 0) {
        node._preCollapseHeight = Math.max(Number(node._preCollapseHeight || 0), Number(targetH));
    }
}

export function resolveDerpRuntimeSizeImpl(node, measured, vars = {}) {
    const graph = app.graph || node?.graph || null;
    const axis = graph && node ? getDockGroupAxisFromMembers(getDeckMembers(node, graph)) : null;
    return resolveRuntimeDockSize(node, axis, measured, vars);
}

export function resolveHorizontalDeckSharedHeightImpl(node, deps = {}) {
    const { getDerpVars } = deps;
    const graph = app.graph || node?.graph || null;
    if (!graph || !node || typeof getDerpVars !== "function") return 0;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length === 0) return 0;

    return members.reduce((maxHeight, member) => {
        const memberVars = typeof member?.getDerpVars === "function"
            ? member.getDerpVars(member)
            : getDerpVars(member);
        const measured = {
            contentMinWidth: member?.layout?.contentMinWidth || 0,
            contentMinHeight: member?.layout?.contentMinHeight || 0,
            totalHeight: member?.layout?.totalHeight || 0,
        };
        const resolved = resolveRuntimeDockSize(member, "horizontal", measured, {
            ...memberVars,
            autoHeight: true,
        });
        const memberHeight = Number(resolved?.height)
            || Number(member?.size?.[1])
            || Number(member?.properties?.nodeSize?.[1])
            || 0;
        return Math.max(maxHeight, memberHeight);
    }, 0);
}

export function handleDerpComputeSizeImpl(entity, out, minWidth = 100) {
    const minW = entity.layout?.contentMinWidth || minWidth;
    const minH = entity.layout?.totalHeight || 40;
    if (out) {
        out[0] = minW;
        out[1] = minH;
        return out;
    }
    return [minW, minH];
}

export function handleDerpCollapseImpl(entity, force, deps = {}) {
    const { requestSyncFallback, settleDerpSizeBeforeDraw, resolveHorizontalDeckSharedHeight, syncHorizontalDeckHeight, closeSysPanel } = deps;
    const nextState = force !== undefined ? force : !entity.properties.contentCollapsed;
    const graph = app.graph || entity.graph || null;
    const isHorizontalDeckGroup = !!(graph && isLinearDeckGroup(entity, graph, "horizontal"));
    const syncedCollapseEnabled = window.DERP_GLOBAL_SETTINGS?.syncedCollapse ?? true;
    const collapseTargets = (syncedCollapseEnabled && isHorizontalDeckGroup)
        ? getDeckMembers(entity, graph)
        : [entity];
    const orderedCollapseTargets = (syncedCollapseEnabled && isHorizontalDeckGroup && nextState === false)
        ? [...collapseTargets].sort((a, b) => {
            const ax = Number(a?.pos?.[0]) || 0;
            const bx = Number(b?.pos?.[0]) || 0;
            if (ax !== bx) return bx - ax;
            return (Number(b?.id) || 0) - (Number(a?.id) || 0);
        })
        : collapseTargets;

    const settleDeps = {
        getDerpVars: deps.getDerpVars,
        animateDerpSize: deps.animateDerpSize,
    };

    const applyCollapseState = (target) => {
        if (!target?.properties) target.properties = {};

        if (nextState === true && !target.properties.contentCollapsed) {
            if (typeof closeSysPanel === "function") closeSysPanel(target);
            if (target.properties.autoHeight === false) {
                const storedManualHeight = Number(target.properties?.nodeSize?.[1] || 0);
                const liveHeight = Number(target.size?.[1] || 0);
                target.properties._savedExpandedHeight = storedManualHeight > 0
                    ? storedManualHeight
                    : liveHeight;
            }
            target._preCollapseHeight = Math.max(
                Number(target._preCollapseHeight || 0),
                Number(target.size?.[1] || 0),
                Number(target.properties?.nodeSize?.[1] || 0),
                Number(target.layout?.totalHeight || 0),
                Number(target.layout?.contentMinHeight || 0)
            );
        }

        target.properties.contentCollapsed = nextState;
        if (nextState === false && target.properties.autoHeight === false) {
            const savedExpandedHeight = Number(target.properties._savedExpandedHeight || 0);
            if (savedExpandedHeight > 0) {
                if (!Array.isArray(target.properties.nodeSize)) {
                    target.properties.nodeSize = [
                        Number(target.size?.[0] || 0),
                        savedExpandedHeight,
                    ];
                } else {
                    target.properties.nodeSize[1] = savedExpandedHeight;
                }
                if (Array.isArray(target.size) && savedExpandedHeight > 0) {
                    setDerpNodeSizeCompat(target, Number(target.size?.[0] || 0), savedExpandedHeight);
                }
            }
        }
        if (!target.flags) target.flags = {};
        target.flags.collapsed = false;
        target._allowDockCollapseShift = true;
        try {
            settleCollapseSizeBeforeDrawImpl(target, settleDeps);
        } finally {
            target._allowDockCollapseShift = false;
        }

        if (target.syncUncleSlots) target.syncUncleSlots();
        if (target.requestDerpSync) target.requestDerpSync();
        else if (typeof requestSyncFallback === "function") requestSyncFallback(target);
    };

    orderedCollapseTargets.forEach(applyCollapseState);

    if (syncedCollapseEnabled && isHorizontalDeckGroup && typeof resolveHorizontalDeckSharedHeight === "function" && typeof syncHorizontalDeckHeight === "function") {
        const sharedHeight = resolveHorizontalDeckSharedHeight(entity);
        if (sharedHeight > 0) {
            syncHorizontalDeckHeight(entity, sharedHeight);
        }
    }

    if (app.graph && app.graph.change) app.graph.change();
}

export function handleHorizontalDeckTitleToggleImpl(entity, deps = {}) {
    const { requestSyncFallback, settleDerpSizeBeforeDraw, resolveHorizontalDeckSharedHeight, syncHorizontalDeckHeight } = deps;
    const graph = app.graph || entity?.graph || null;
    if (!graph || !entity || !isLinearDeckGroup(entity, graph, "horizontal")) {
        if (entity?.requestDerpSync) entity.requestDerpSync();
        else if (entity && typeof requestSyncFallback === "function") requestSyncFallback(entity);
        return;
    }

    const members = getDeckMembers(entity, graph);
    if (!Array.isArray(members) || members.length <= 1) {
        if (entity?.requestDerpSync) entity.requestDerpSync();
        else if (entity && typeof requestSyncFallback === "function") requestSyncFallback(entity);
        return;
    }

    const orderedMembers = [...members].sort((a, b) => {
        const ax = Number(a?.pos?.[0]) || 0;
        const bx = Number(b?.pos?.[0]) || 0;
        if (ax !== bx) return bx - ax;
        return (Number(b?.id) || 0) - (Number(a?.id) || 0);
    });

    orderedMembers.forEach((member) => {
        if (!member?.properties) member.properties = {};
        if (member.layout) member.layout._lastCacheKey = "";
        member._layoutMapHash = null;
        if (typeof settleDerpSizeBeforeDraw === "function") {
            settleDerpSizeBeforeDraw(member, {
                forceAutoHeight: member.properties?.autoHeight !== false,
                suppressRequestSync: true,
            });
        }
        if (member.syncUncleSlots) member.syncUncleSlots();
    });

    if (typeof resolveHorizontalDeckSharedHeight === "function" && typeof syncHorizontalDeckHeight === "function") {
        const sharedHeight = resolveHorizontalDeckSharedHeight(entity);
        if (sharedHeight > 0) {
            syncHorizontalDeckHeight(entity, sharedHeight);
        }
    }

    orderedMembers.forEach((member) => {
        if (member.requestDerpSync) member.requestDerpSync();
        else if (typeof requestSyncFallback === "function") requestSyncFallback(member);
    });

    if (app.graph && app.graph.change) app.graph.change();
}

function normalizeHorizontalMemberPositions(anchorNode, graph) {
    const members = getDeckMembers(anchorNode, graph)
        .sort((a, b) => {
            const ax = Number(a?.pos?.[0]) || 0;
            const bx = Number(b?.pos?.[0]) || 0;
            if (ax !== bx) return ax - bx;
            return (Number(a?.id) || 0) - (Number(b?.id) || 0);
        });
    if (members.length <= 1) return;

    let cursorX = Number(members[0]?.pos?.[0]) || 0;
    members.forEach((member) => {
        setDeckNodePos(member, cursorX, Number(member.pos?.[1]) || 0);
        cursorX += getDockNodeWidth(member);
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
    });
}

function getHorizontalDeckMembersByX(node, graph) {
    if (!graph || !node || !isLinearDeckGroup(node, graph, "horizontal")) return [];
    return getDeckMembers(node, graph).slice().sort((a, b) => {
        const ax = Number(a?.pos?.[0]) || 0;
        const bx = Number(b?.pos?.[0]) || 0;
        if (ax !== bx) return ax - bx;
        return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
}

export function canResizeHorizontalStackWidth(node, graph = app.graph || node?.graph || null, side = null) {
    const members = getHorizontalDeckMembersByX(node, graph);
    if (members.length <= 1 || !members.some((member) => member?.properties?.autoWidth === false)) return false;
    const nodeIndex = members.findIndex((member) => member.id === node.id);
    if (side === "left") return nodeIndex === 0;
    if (side === "right") return nodeIndex === members.length - 1;
    return nodeIndex === 0 || nodeIndex === members.length - 1;
}

function applyHorizontalStackWidthResize(entity, resizeAnchor, requestedEntityWidth, minW, snap, result, addCounterpart, graph) {
    const members = getHorizontalDeckMembersByX(entity, graph);
    if (members.length <= 1) return false;

    const manualMembers = members.filter((member) => member?.properties?.autoWidth === false);
    if (manualMembers.length === 0) return false;

    const isLeftHandle = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    const entityIndex = members.findIndex((member) => member.id === entity.id);
    const isOuterBoundaryResize = isLeftHandle ? entityIndex === 0 : entityIndex === members.length - 1;
    if (!isOuterBoundaryResize) return false;

    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === (isLeftHandle ? "stack-left" : "stack-right")
        && currentSession.entityId === entity.id;
    if (!sessionMatches) {
        entity._dockResizeSession = {
            side: isLeftHandle ? "stack-left" : "stack-right",
            entityId: entity.id,
            stackStartWidths: Object.fromEntries(members.map((member) => [member.id, getDockNodeWidth(member)])),
            stackStartPositions: Object.fromEntries(members.map((member) => [member.id, [Number(member.pos?.[0]) || 0, Number(member.pos?.[1]) || 0]])),
        };
    }

    const session = entity._dockResizeSession;
    const originalWidths = new Map(members.map((member) => [member.id, Number(session.stackStartWidths?.[member.id]) || getDockNodeWidth(member)]));
    const originalTotalWidth = members.reduce((sum, member) => sum + (originalWidths.get(member.id) || 0), 0);
    const entityStartWidth = originalWidths.get(entity.id) || getDockNodeWidth(entity);
    const requestedDelta = Number(requestedEntityWidth) - entityStartWidth;
    if (!Number.isFinite(requestedDelta) || Math.abs(requestedDelta) < 0.5) return false;

    const anchorX = isLeftHandle
        ? members.reduce((max, member) => {
            const startPos = session.stackStartPositions?.[member.id] || member.pos || [0, 0];
            return Math.max(max, (Number(startPos[0]) || 0) + (originalWidths.get(member.id) || 0));
        }, Number.NEGATIVE_INFINITY)
        : members.reduce((min, member) => {
            const startPos = session.stackStartPositions?.[member.id] || member.pos || [0, 0];
            return Math.min(min, Number(startPos[0]) || 0);
        }, Number.POSITIVE_INFINITY);
    const fixedWidth = members
        .filter((member) => member?.properties?.autoWidth !== false)
        .reduce((sum, member) => sum + (originalWidths.get(member.id) || 0), 0);
    const requestedTotalWidth = Math.max(0, originalTotalWidth + requestedDelta);
    const manualMinTotal = manualMembers.reduce((sum, member) => sum + getDockNodeMinWidth(member, minW, snap), 0);
    const targetManualTotal = Math.max(manualMinTotal, requestedTotalWidth - fixedWidth);
    const originalManualTotal = manualMembers.reduce((sum, member) => sum + (originalWidths.get(member.id) || 0), 0);
    const nextWidths = new Map(originalWidths);

    if (targetManualTotal >= originalManualTotal) {
        const growDelta = targetManualTotal - originalManualTotal;
        const growBase = manualMembers.reduce((sum, member) => sum + Math.max(0, (originalWidths.get(member.id) || 0) - getDockNodeMinWidth(member, minW, snap)), 0) || manualMembers.length;
        manualMembers.forEach((member) => {
            const current = originalWidths.get(member.id) || 0;
            const minWidth = getDockNodeMinWidth(member, minW, snap);
            const weight = growBase === manualMembers.length ? 1 : Math.max(0, current - minWidth);
            nextWidths.set(member.id, current + (growDelta * (weight / growBase)));
        });
    } else {
        let remainingShrink = originalManualTotal - targetManualTotal;
        const shrinkable = manualMembers.map((member) => ({
            member,
            width: originalWidths.get(member.id) || 0,
            minWidth: getDockNodeMinWidth(member, minW, snap),
        }));
        while (remainingShrink > 0.5) {
            const active = shrinkable.filter((entry) => entry.width > entry.minWidth + 0.5);
            if (active.length === 0) break;
            const share = remainingShrink / active.length;
            let consumed = 0;
            active.forEach((entry) => {
                const shrink = Math.min(share, entry.width - entry.minWidth);
                entry.width -= shrink;
                consumed += shrink;
            });
            if (consumed <= 0.5) break;
            remainingShrink -= consumed;
        }
        shrinkable.forEach((entry) => nextWidths.set(entry.member.id, entry.width));
    }

    let totalWidth = 0;
    members.forEach((member) => {
        const isManualWidth = member?.properties?.autoWidth === false;
        const minWidth = isManualWidth ? getDockNodeMinWidth(member, minW, snap) : 0;
        const snapped = isManualWidth
            ? Math.max(minWidth, Math.round((nextWidths.get(member.id) || 0) / snap) * snap)
            : (originalWidths.get(member.id) || getDockNodeWidth(member));
        nextWidths.set(member.id, snapped);
        totalWidth += snapped;
    });

    let cursorX = isLeftHandle ? anchorX - totalWidth : anchorX;
    members.forEach((member) => {
        const width = nextWidths.get(member.id) || getDockNodeWidth(member);
        syncDeckNodeSize(member, width, getDockNodeHeight(member));
        setDeckNodePos(member, cursorX, Number(member.pos?.[1]) || 0);
        cursorX += width;
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
        addCounterpart(member);
    });

    result.handledWidth = true;
    result.handledAll = true;
    result.appliedWidth = nextWidths.get(entity.id) || getDockNodeWidth(entity);
    dockDebug("resize-horizontal-stack-width", {
        entity: snapshotDockNode(entity),
        resizeAnchor,
        requested: { requestedEntityWidth, requestedDelta, requestedTotalWidth },
        fixedWidth,
        targetManualTotal,
        members: members.map(snapshotDockNode),
    });
    return true;
}

export function syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, snap = 10) {
    const graph = app.graph || entity.graph || null;
    if (!graph) return { handledWidth: false, handledHeight: false, handledAll: false, appliedWidth: null, appliedHeight: null, counterparts: [] };

    const result = {
        handledWidth: false,
        handledHeight: false,
        handledAll: false,
        appliedWidth: null,
        appliedHeight: null,
        counterparts: [],
        pinnedAnchor: null,
    };
    const counterpartIds = new Set();
    const addCounterpart = (node) => {
        if (!node || node.id === entity.id || counterpartIds.has(node.id)) return;
        counterpartIds.add(node.id);
        result.counterparts.push(node);
    };

    const deckMembers = getDeckMembers(entity, graph);
    if (isLinearDeckGroup(entity, graph, "vertical")) {
        result.pinnedAnchor = getPinnedVerticalDeckPositionAnchor(entity, graph);
        dockDebug("resize-vertical-before", {
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: deckMembers.map(snapshotDockNode),
        });
        const dockSize = resolveDockResizeDimensions("vertical", deckMembers, { width: newW }, { minWidth: minW, height: getDockNodeHeight(entity) }, snap);
        const snappedWidth = dockSize.width;
        deckMembers.forEach((node) => {
            const nodeH = getDockNodeHeight(node);
            syncDeckNodeSize(node, snappedWidth, nodeH, { silent: true });
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledWidth = true;
        result.appliedWidth = snappedWidth;
        dockDebug("resize-vertical-after", {
            entity: snapshotDockNode(entity),
            appliedWidth: snappedWidth,
            members: deckMembers.map(snapshotDockNode),
        });
    }

    const isLeftHandle = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    const isRightHandle = resizeAnchor === "right" || resizeAnchor === "top-right" || resizeAnchor === "bottom-right";
    const isTopHandle = resizeAnchor === "top" || resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomHandle = resizeAnchor === "bottom" || resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";
    const requestsHeightResize = (isTopHandle || isBottomHandle) && newH !== getDockNodeHeight(entity);

    if (isLinearDeckGroup(entity, graph, "horizontal") && requestsHeightResize) {
        dockDebug("resize-horizontal-before", {
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: deckMembers.map(snapshotDockNode),
        });
        const dockSize = resolveDockResizeDimensions("horizontal", deckMembers, { height: newH }, { minHeight: minH, width: getDockNodeWidth(entity) }, snap);
        const snappedHeight = dockSize.height;
        deckMembers.forEach((node) => {
            const nodeW = getDockNodeWidth(node);
            syncDeckNodeSize(node, nodeW, snappedHeight);
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledHeight = true;
        result.appliedHeight = snappedHeight;
        dockDebug("resize-horizontal-after", {
            entity: snapshotDockNode(entity),
            appliedHeight: snappedHeight,
            members: deckMembers.map(snapshotDockNode),
        });
    }

    if ((isLeftHandle || isRightHandle) && applyHorizontalStackWidthResize(entity, resizeAnchor, newW, minW, snap, result, addCounterpart, graph)) {
        return result;
    }

    const parent = getDeckParent(entity, graph);
    const childNodes = getDeckChildren(entity, graph);
    const seamCandidates = [];
    if (parent) {
        const parentEdges = parent.properties?.deckEdges || {};
        const parentSide = ["left", "right", "top", "bottom"].find(s => parentEdges[s] === entity.id);
        seamCandidates.push({
            leader: parent,
            docked: entity,
            side: parentSide || entity.properties?.deckDockSide || null,
        });
    }
    childNodes.forEach((child) => {
        const entityEdges = entity.properties?.deckEdges || {};
        const childSide = ["left", "right", "top", "bottom"].find(s => entityEdges[s] === child.id);
        seamCandidates.push({
            leader: entity,
            docked: child,
            side: childSide || child.properties?.deckDockSide || null,
        });
    });

    const matchingCandidate = seamCandidates.find(({ leader, docked, side }) => {
        if (!leader || !docked || !side) return false;
        if (side === "left" || side === "right") {
            const leaderSeamUsesLeftHandle = side === "left";
            const dockedSeamUsesLeftHandle = side === "right";
            return (
                (entity.id === leader.id && (leaderSeamUsesLeftHandle ? isLeftHandle : isRightHandle)) ||
                (entity.id === docked.id && (dockedSeamUsesLeftHandle ? isLeftHandle : isRightHandle))
            );
        }
        if (side === "top" || side === "bottom") {
            const leaderSeamUsesTopHandle = side === "top";
            const dockedSeamUsesTopHandle = side === "bottom";
            return (
                (entity.id === leader.id && (leaderSeamUsesTopHandle ? isTopHandle : isBottomHandle)) ||
                (entity.id === docked.id && (dockedSeamUsesTopHandle ? isTopHandle : isBottomHandle))
            );
        }
        return false;
    });

    if (!matchingCandidate) return result;

    const { leader, docked, side } = matchingCandidate;

    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === side
        && currentSession.leaderId === leader.id
        && currentSession.dockedId === docked.id;

    if (!sessionMatches) {
        entity._dockResizeSession = {
            side,
            leaderId: leader.id,
            dockedId: docked.id,
            leaderStartW: leader.size?.[0] || leader.properties?.nodeSize?.[0] || 0,
            leaderStartH: leader.size?.[1] || leader.properties?.nodeSize?.[1] || 0,
            dockedStartW: docked.size?.[0] || docked.properties?.nodeSize?.[0] || 0,
            dockedStartH: docked.size?.[1] || docked.properties?.nodeSize?.[1] || 0,
        };
    }

    const session = entity._dockResizeSession;

    if (side === "left" || side === "right") {
        const totalWidth = session.leaderStartW + session.dockedStartW;

        const leftNode = side === "left" ? docked : leader;
        const rightNode = side === "left" ? leader : docked;
        if (leftNode?.properties?.autoWidth !== false || rightNode?.properties?.autoWidth !== false) {
            result.handledWidth = true;
            result.handledAll = true;
            result.appliedWidth = getDockNodeWidth(entity);
            addCounterpart(leftNode);
            addCounterpart(rightNode);
            return result;
        }

        const leftMinW = getDockNodeMinWidth(leftNode, minW, snap);
        const rightMinW = getDockNodeMinWidth(rightNode, minW, snap);

        if (totalWidth < leftMinW + rightMinW) {
            result.handledWidth = true;
            result.handledAll = true;
            result.appliedWidth = getDockNodeWidth(entity);
            addCounterpart(leftNode);
            addCounterpart(rightNode);
            return result;
        }

        const draggedMinW = entity.id === leftNode.id ? leftMinW : rightMinW;
        const counterpartMinW = entity.id === leftNode.id ? rightMinW : leftMinW;
        const maxDraggedWidth = Math.max(draggedMinW, totalWidth - counterpartMinW);
        const draggedWidth = Math.min(maxDraggedWidth, Math.max(draggedMinW, newW));
        const counterpartWidth = Math.max(counterpartMinW, totalWidth - draggedWidth);
        const adjustedLeftW = leftNode.id === entity.id ? draggedWidth : counterpartWidth;
        const adjustedRightW = rightNode.id === entity.id ? draggedWidth : counterpartWidth;

        syncDeckNodeSize(leftNode, adjustedLeftW, getDockNodeHeight(leftNode));
        syncDeckNodeSize(rightNode, adjustedRightW, getDockNodeHeight(rightNode));
        setDeckNodePos(rightNode, (Number(leftNode.pos?.[0]) || 0) + adjustedLeftW, Number(rightNode.pos?.[1]) || 0);
        normalizeHorizontalMemberPositions(leftNode, graph);
        if (typeof leftNode.syncUncleSlots === "function") leftNode.syncUncleSlots();
        if (typeof rightNode.syncUncleSlots === "function") rightNode.syncUncleSlots();
        result.handledWidth = true;
        result.handledAll = true;
        result.appliedWidth = entity.id === leftNode.id ? adjustedLeftW : adjustedRightW;
        addCounterpart(leftNode);
        addCounterpart(rightNode);
        return result;
    }

    if (side === "top" || side === "bottom") {
        const totalHeight = session.leaderStartH + session.dockedStartH;

        const topNode = side === "top" ? docked : leader;
        const bottomNode = side === "top" ? leader : docked;

        const topCollapsed = topNode?.properties?.contentCollapsed === true;
        const bottomCollapsed = bottomNode?.properties?.contentCollapsed === true;
        if (topCollapsed && bottomCollapsed) {
            result.handledHeight = true;
            result.handledAll = true;
            result.appliedHeight = getDockNodeHeight(entity);
            addCounterpart(topNode);
            addCounterpart(bottomNode);
            return result;
        }

        const isPureEdge = resizeAnchor === "top" || resizeAnchor === "bottom";

        if (isPureEdge && (topCollapsed || bottomCollapsed)) {
            result.handledHeight = true;
            result.handledAll = true;
            result.appliedHeight = getDockNodeHeight(entity);
            addCounterpart(topNode);
            addCounterpart(bottomNode);
            return result;
        }

        const draggedHeight = Math.min(totalHeight - minH, Math.max(minH, newH));
        const counterpartHeight = Math.max(minH, totalHeight - draggedHeight);
        const adjustedTopH = topNode.id === entity.id ? draggedHeight : counterpartHeight;
        const adjustedBottomH = bottomNode.id === entity.id ? draggedHeight : counterpartHeight;

        syncDeckNodeSize(topNode, getDockNodeWidth(topNode), adjustedTopH);
        syncDeckNodeSize(bottomNode, getDockNodeWidth(bottomNode), adjustedBottomH);
        setDeckNodePos(bottomNode, Number(bottomNode.pos?.[0]) || 0, (Number(topNode.pos?.[1]) || 0) + adjustedTopH);
        if (typeof topNode.syncUncleSlots === "function") topNode.syncUncleSlots();
        if (typeof bottomNode.syncUncleSlots === "function") bottomNode.syncUncleSlots();
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = entity.id === topNode.id ? adjustedTopH : adjustedBottomH;
        addCounterpart(topNode);
        addCounterpart(bottomNode);
        return result;
    }

    return result;
}

export function applyDockResizeResult(entity, dockResizeResult) {
    if (!dockResizeResult) {
        return { applied: false, handledAll: false };
    }

    if (dockResizeResult.handledAll) {
        entity.setDirtyCanvas(true, true);
        syncDerpShield(entity);
        dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
        return { applied: true, handledAll: true };
    }

    if (dockResizeResult.handledWidth || dockResizeResult.handledHeight) {
        dockDebug("apply-resize-result", {
            entity: snapshotDockNode(entity),
            result: {
                handledWidth: dockResizeResult.handledWidth,
                handledHeight: dockResizeResult.handledHeight,
                handledAll: dockResizeResult.handledAll,
                appliedWidth: dockResizeResult.appliedWidth,
                appliedHeight: dockResizeResult.appliedHeight,
            },
            counterparts: dockResizeResult.counterparts.map(snapshotDockNode),
            members: snapshotDockMembers(entity, app.graph || entity.graph || null),
        });
        entity._dockResizeSession = null;
    }

    if (dockResizeResult.handledWidth && isLinearDeckGroup(entity, app.graph || entity.graph || null, "vertical")) {
        dockResizeResult.counterparts.forEach((node) => {
            setDeckNodePos(node, Number(entity.pos?.[0]) || 0, Number(node.pos?.[1]) || 0);
        });
        if (dockResizeResult.pinnedAnchor) {
            restorePinnedVerticalDeckPositionAnchor(dockResizeResult.pinnedAnchor);
        }
    }

    if (dockResizeResult.handledHeight) {
        dockResizeResult.counterparts.forEach((node) => {
            setDeckNodePos(node, Number(node.pos?.[0]) || 0, Number(entity.pos?.[1]) || 0);
        });
    }

    syncDerpShield(entity);
    dockResizeResult.counterparts.forEach((node) => syncDerpShield(node));
    return { applied: dockResizeResult.handledWidth || dockResizeResult.handledHeight, handledAll: false };
}
