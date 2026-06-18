import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import {
    computeDeckPressureGeometryPlan,
    getDeckParent,
    getDeckChildren,
    getDeckMembers,
    getDeckPressureBranchMembers,
    getDeckPressureBranchSideForNode,
    getDeckPressureBranchAxis,
    getDeckPressureHubMinWidth,
    getDeckPressureHubForNode,
    getNodeOnDeckEdge,
    applyDeckPressureLayout,
    isDeckPressureHub,
    isDeckPressureSideHorizontalHubEdge,
    isDeckPressureSideHorizontalBranchMember,
    isDeckPressureSideWidthResizeEdge,
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
    getDockNodeMinHeight,
    getDockNodeMinWidth,
    getSharedDockHeight,
    resolveDockResizeDimensions,
    resolveRuntimeDockSize,
    shouldPreserveDockHeight,
    shouldPreserveDockWidth,
} from "./dockDimensions.js";
import { canResizeHorizontalMemberWidth, canResizeHorizontalSeamPair, canResizeHorizontalSharedEdgeWidth, canResizeHorizontalStackWidth, getHorizontalDeckMembersByX, getHorizontalSameRowNeighbor } from "./dockResizeSharedEdges.js";
import { dockDebug, isDockDebugEnabled, snapshotDockNode } from "./dockDebugHelpers.js";
import { getVirtualNodeLayoutMap } from "../helpers/fathaLayoutMaps.js";
import { setDerpNodeSizeCompat } from "./fathaNode2Compat.js";

globalThis.DERP_DOCK_RESIZE_DEBUG = globalThis.DERP_DOCK_RESIZE_DEBUG === true;
if (globalThis.DERP_DOCK_RESIZE_DEBUG) globalThis.DERP_DOCK_RESIZE_LOGS = globalThis.DERP_DOCK_RESIZE_LOGS || [];

const LAYOUT_RESERVED_KEYS = new Set([
    "margin", "padding", "spacing", "width", "height",
    "minWidth", "minHeight",
    "objectAlign", "labelAlign", "themeKey", "align",
    "baseline", "anchor", "dir", "corners", "offset", "hidden",
    "text", "label", "measureText", "items", "prompt", "bypassHashOptimization",
    "palette"
]);

function snapshotDockMembers(node, graph) {
    if (!isDockDebugEnabled()) return [];
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
    if (getDeckPressureHubForNode(node, graph)?.id === node.id) return false;
    const members = getLinearResizeMembers(node, graph, "vertical");
    if (members.length > 1) return true;
    return shouldPreserveDockWidth(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function shouldPreserveHorizontalDeckHeight(node, graph = app.graph || node?.graph || null) {
    if (!graph || !node) return false;
    if (getDeckPressureHubForNode(node, graph)?.id === node.id) return false;
    const members = getLinearResizeMembers(node, graph, "horizontal");
    if (members.length > 1) return true;
    return shouldPreserveDockHeight(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function syncHorizontalDeckHeight(node, graph = app.graph || node?.graph || null, targetHeight = 0) {
    if (!graph || !node) return false;

    const members = getLinearResizeMembers(node, graph, "horizontal");
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
    const rawH = isMinState
        ? (entity.properties?.useCollapsedTotalHeight === true ? (Math.max(layoutContentH, layoutTotalH) || (SNAP * 2)) : (SNAP * 2))
        : (forceAutoHeight ? (layoutContentH || layoutTotalH || 40) : (layoutTotalH || layoutContentH || 40));
    const engineFloorH = isMinState ? rawH : Math.ceil(rawH / SNAP) * SNAP;
    const collapseMinimal = entity.properties?.collapseMinimal === true;
    const targetW = (autoWidth || (isMinState && collapseMinimal)) ? engineFloorW : Math.max(entity.properties.nodeSize?.[0] || 0, engineFloorW);
    const preserveCurrentHeight = options?.preserveCurrentHeight === true;
    const currentH = Number(entity.size?.[1]) || Number(entity.properties.nodeSize?.[1]) || 0;
    const targetH = preserveCurrentHeight
        ? currentH
        : (forceAutoHeight || autoHeight || isMinState) ? engineFloorH : Math.max(entity.properties.nodeSize?.[1] || 0, engineFloorH);

    dockDebug("settle-before-draw", () => ({
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
    }));

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
        const allowContentHeightShift = deltaH !== 0 && Number(node._allowDockContentHeightShiftFrames) > 0;
        const allowCollapseShift = node._allowDockCollapseShift === true || allowContentHeightShift;
        const deckAnchor = (deltaH !== 0)
            ? (allowCollapseShift ? getPinnedVerticalDeckAnchor(node, graph) : getPinnedVerticalDeckPositionAnchor(node, graph))
            : null;
        const shouldAnchorAfterReflow = !!deckAnchor && !allowCollapseShift;
        dockDebug("animate-size-before", () => ({
            node: snapshotDockNode(node),
            target: { width: targetW, height: targetH },
            deltaH,
            useAnim,
            options,
            allowCollapseShift,
            hasDeckAnchor: !!deckAnchor,
            shouldAnchorAfterReflow,
        }));
        setDerpNodeSizeCompat(node, targetW, targetH);
        if (node.properties) node.properties.nodeSize = [targetW, targetH];
        const shiftDirection = allowCollapseShift ? resolveCollapseShiftDirection(node, graph) : 0;
        const skipCollapseShift = node._skipNextAnimateCollapseShift === true;
        if (skipCollapseShift) node._skipNextAnimateCollapseShift = false;
        if (!skipCollapseShift && deltaH !== 0 && shiftDirection !== 0) {
            setDeckNodePos(node, Number(node.pos?.[0]) || 0, (Number(node.pos?.[1]) || 0) + (deltaH * shiftDirection));
        }
        if (allowContentHeightShift && deltaH !== 0) node._allowDockContentHeightShiftFrames = 0;
        const isVerticalDeck = graph && isLinearDeckGroup(node, graph, "vertical");
        const heightChanged = deltaH !== 0;
        const pressureHub = heightChanged && graph ? getDeckPressureHubForNode(node, graph) : null;
        const isPressureBranchMember = !!(pressureHub && pressureHub.id !== node.id);
        const shouldReflow = !isPressureBranchMember && (allowCollapseShift || (isVerticalDeck && heightChanged));

        if (graph && shouldReflow) {
            const moved = getDockResizeEngine()?.reflowChildren?.(node) || [];
            dockDebug("animate-size-reflow", () => ({
                node: snapshotDockNode(node),
                moved: moved.map(snapshotDockNode),
                shouldAnchorAfterReflow,
            }));
            if (shouldAnchorAfterReflow) {
                restorePinnedVerticalDeckPositionAnchor(deckAnchor);
            }
            moved.forEach((child) => {
                if (typeof child.syncUncleSlots === "function") child.syncUncleSlots();
                if (typeof child.setDirtyCanvas === "function") child.setDirtyCanvas(true, true);
            });
        }
        dockDebug("animate-size-after", () => ({
            node: snapshotDockNode(node),
            graphMembers: graph ? getDeckMembers(node, graph).map(snapshotDockNode) : [],
        }));
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
    const pressureHub = graph && node ? getDeckPressureHubForNode(node, graph) : null;
    const branchSide = pressureHub && pressureHub.id !== node?.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    const branchAxis = getDeckPressureBranchAxis(pressureHub, graph, branchSide);
    const axis = branchAxis || (graph && node ? getDockGroupAxisFromMembers(getDeckMembers(node, graph)) : null);
    const resolved = resolveRuntimeDockSize(node, axis, measured, vars);
    const isTriggerWall = String(node?.type || node?.comfyClass || node?.titleLabel || node?.title || "").toLowerCase().includes("triggerwall") || String(node?.titleLabel || node?.title || "").toLowerCase().includes("trigger wall");
    if (isTriggerWall) {
        const now = performance.now?.() || Date.now();
        const sig = `runtime node=${node?.id}:${node?.titleLabel || node?.title || node?.type} axis=${axis || "none"} autoH=${vars.autoHeight === true} storedH=${Number(node?.properties?.nodeSize?.[1] || 0).toFixed(1)} liveH=${Number(node?.size?.[1] || 0).toFixed(1)} measured=${Number(measured?.contentMinHeight || 0).toFixed(1)}/${Number(measured?.totalHeight || 0).toFixed(1)} floor=${Number(resolved.engineFloorH || 0).toFixed(1)} resolvedH=${Number(resolved.height || 0).toFixed(1)}`;
        if (sig !== node._twRuntimeDebugLastSig || now - Number(node._twRuntimeDebugLastAt || 0) >= 1200) {
            node._twRuntimeDebugLastSig = sig;
            node._twRuntimeDebugLastAt = now;
            console.log(`[TriggerWallResizeDebug] ${sig}`);
        }
    }
    const minExpandedHeight = Number(node?.properties?._minExpandedHeight) || 0;
    if (node?.properties?.contentCollapsed !== true && minExpandedHeight > 0) {
        resolved.height = Math.max(Number(resolved.height) || 0, minExpandedHeight);
    }
    return resolved;
}

export function resolveHorizontalDeckSharedHeightImpl(node, deps = {}) {
    const { getDerpVars } = deps;
    const graph = app.graph || node?.graph || null;
    if (!graph || !node || typeof getDerpVars !== "function") return 0;

    const members = getLinearResizeMembers(node, graph, "horizontal");
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
    entity._deckPressureActiveUntil = (performance.now?.() || Date.now()) + 1200;
    const { requestSyncFallback, settleDerpSizeBeforeDraw, resolveHorizontalDeckSharedHeight, syncHorizontalDeckHeight, closeSysPanel } = deps;
    const nextState = force !== undefined ? force : !entity.properties.contentCollapsed;
    const graph = app.graph || entity.graph || null;
    if (nextState === true && isDeckPressureSideHorizontalBranchMember(entity, graph)) return;
    const pressureHub = graph ? getDeckPressureHubForNode(entity, graph) : null;
    const pressureBranchSide = pressureHub && pressureHub.id !== entity.id ? getDeckPressureBranchSideForNode(pressureHub, graph, entity) : null;
    const isPressureSideBranch = pressureBranchSide === "left" || pressureBranchSide === "right";
    if (isPressureSideBranch) {
        if (nextState === true) entity._deckPressureSkipFillerUntil = (performance.now?.() || Date.now()) + 1200;
        else delete entity._deckPressureSkipFillerUntil;
    }
    const syncedCollapseEnabled = window.DERP_GLOBAL_SETTINGS?.syncedCollapse ?? true;
    const horizontalCollapseTargets = syncedCollapseEnabled
        ? getLinearResizeMembers(entity, graph, "horizontal")
        : [];
    const isHorizontalDeckGroup = horizontalCollapseTargets.length > 1;
    const collapseTargets = isHorizontalDeckGroup
        ? horizontalCollapseTargets
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

    if (pressureHub) {
        const snap = Number(deps.getDerpVars?.(pressureHub)?.SNAP) || 10;
        applyDeckPressureLayout(pressureHub, graph, snap);
    }

    if (app.graph && app.graph.change) app.graph.change();
}

export function handleHorizontalDeckTitleToggleImpl(entity, deps = {}) {
    const { requestSyncFallback, settleDerpSizeBeforeDraw, resolveHorizontalDeckSharedHeight, syncHorizontalDeckHeight } = deps;
    const graph = app.graph || entity?.graph || null;
    if (!graph || !entity) {
        if (entity?.requestDerpSync) entity.requestDerpSync();
        else if (entity && typeof requestSyncFallback === "function") requestSyncFallback(entity);
        return;
    }
    const members = getLinearResizeMembers(entity, graph, "horizontal");
    if (members.length <= 1) {
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
    const pressureHub = getDeckPressureHubForNode(anchorNode, graph);
    const branchSide = pressureHub && pressureHub.id !== anchorNode?.id ? getDeckPressureBranchSideForNode(pressureHub, graph, anchorNode) : null;
    const branchMembers = branchSide ? getDeckPressureBranchMembers(pressureHub, graph, branchSide) : [];
    const members = branchMembers.length > 1
        ? branchMembers
        : getHorizontalDeckMembersByX(anchorNode, graph).sort((a, b) => {
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

function getLinearResizeMembers(node, graph, axis) {
    if (!graph || !node) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (pressureHub?.id === node.id) return [];
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === axis) return getDeckPressureBranchMembers(pressureHub, graph, branchSide);
    return isLinearDeckGroup(node, graph, axis) ? getDeckMembers(node, graph) : [];
}

function getVerticalDeckMembersByY(node, graph) {
    const members = getLinearResizeMembers(node, graph, "vertical");
    if (members.length === 0) return [];

    const seen = new Set();
    const ordered = [];
    let current = node;
    while (current) {
        const above = getNodeOnDeckEdge(current, graph, "top");
        if (!above || seen.has(above.id)) break;
        current = above;
    }
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        ordered.push(current);
        current = getNodeOnDeckEdge(current, graph, "bottom");
    }
    if (ordered.length === members.length) return ordered;

    return members.slice().sort((a, b) => {
        const ay = Number(a?.pos?.[1]) || 0;
        const by = Number(b?.pos?.[1]) || 0;
        if (ay !== by) return ay - by;
        return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
}

function getDockFrameBounds(members = []) {
    const bounds = (Array.isArray(members) ? members : []).reduce((acc, member) => {
        if (!member) return acc;
        const x = Number(member.pos?.[0]) || 0;
        const y = Number(member.pos?.[1]) || 0;
        const w = getDockNodeWidth(member);
        const h = getDockNodeHeight(member);
        return {
            left: Math.min(acc.left, x),
            top: Math.min(acc.top, y),
            right: Math.max(acc.right, x + w),
            bottom: Math.max(acc.bottom, y + h),
        };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    return Number.isFinite(bounds.left) ? bounds : null;
}

function normalizeVerticalMemberPositions(anchorNode, graph) {
    const members = getVerticalDeckMembersByY(anchorNode, graph);
    if (members.length <= 1) return;

    let cursorY = Number(members[0]?.pos?.[1]) || 0;
    members.forEach((member) => {
        setDeckNodePos(member, Number(member.pos?.[0]) || 0, cursorY);
        cursorY += getDockNodeHeight(member);
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
    });
}

function markDockResizeActiveMembers(entity, members = [], pressureActiveNode = entity, options = {}) {
    if (!entity || !Array.isArray(members) || members.length === 0) return;
    if (!(entity._dockResizeActiveMembers instanceof Set)) entity._dockResizeActiveMembers = new Set();
    const markResizing = options.markResizing !== false;
    const horizontalWidthLock = options.horizontalWidthLock === true;
    const activeUntil = (performance.now?.() || Date.now()) + 1200;
    if (pressureActiveNode) pressureActiveNode._deckPressureActiveUntil = activeUntil;
    members.forEach((member) => {
        if (!member) return;
        if (markResizing) member._isDerpResizing = true;
        if (horizontalWidthLock) member._horizontalDeckWidthResizeLock = true;
        if (member !== entity) entity._dockResizeActiveMembers.add(member);
    });
}

function getVerticalResizeStartHeight(node, snap) {
    return node?.properties?.contentCollapsed === true
        ? getDockNodeMinHeight(node, 0, snap)
        : getDockNodeHeight(node);
}

function getVisibleRegionLayoutFloor(config, liveRegions = {}, key = null) {
    if (!config || config.hidden === true || config.ignoreLayout === true) return 0;

    const live = key ? liveRegions[key] : null;
    if (live?.ignoreLayout === true) return 0;

    const margin = live?.margin || config.margin || [0, 0];
    const marginTop = Number(margin?.[1]) || 0;
    const marginBottom = Number(margin?.length === 4 ? margin[3] : margin?.[1]) || 0;
    const heightProp = String(config.height === undefined ? "auto" : config.height).toLowerCase();
    const childFloors = Object.entries(config)
        .filter(([childKey, childConfig]) => !LAYOUT_RESERVED_KEYS.has(childKey) && childConfig && typeof childConfig === "object" && !Array.isArray(childConfig))
        .map(([childKey, childConfig]) => getVisibleRegionLayoutFloor(childConfig, liveRegions, childKey));
    const childTotal = childFloors.length === 0
        ? 0
        : (config.dir === "row" ? Math.max(...childFloors) : childFloors.reduce((sum, value) => sum + value, 0));
    let height = 0;

    if (heightProp === "fill" || heightProp === "full" || heightProp === "fit") {
        height = Number(config.minHeight) || Number(live?.minHeight) || Number(live?.baseHeight) || childTotal || 12;
    } else if (typeof config.height === "number") {
        height = Number(config.height) || 0;
    } else {
        height = Math.max(
            Number(live?.h) || 0,
            Number(config.minHeight) || 0,
            Number(live?.minHeight) || 0,
            Number(live?.baseHeight) || 0,
            childTotal,
            12
        );
    }

    return marginTop + height + marginBottom;
}

function getVerticalResizeTargetMinHeight(node, snap, options = {}) {
    if (node?.properties?.contentCollapsed === true) return getDockNodeMinHeight(node, 0, snap);

    const rootEntries = node?.layoutMap && typeof node.layoutMap === "object" ? Object.entries(node.layoutMap) : [];
    const liveRegions = node?.layout?.regions || {};
    const compactFloor = rootEntries.reduce((sum, [key, config]) => sum + getVisibleRegionLayoutFloor(config, liveRegions, key), 0);

    const currentMin = getDockNodeMinHeight(node, 0, snap);
    if (compactFloor <= 0) return currentMin;
    const compactMin = Math.ceil(Math.max(compactFloor, snap * 4) / snap) * snap;
    return options.preserveExpandedFloor === true
        ? Math.max(currentMin, compactMin)
        : Math.min(currentMin, compactMin);
}

function rememberExpandedDeckHeight(node, height) {
    if (!node?.properties || node.properties.contentCollapsed === true) return;
    const nextHeight = Number(height) || 0;
    if (nextHeight <= 0) return;
    node.properties._savedExpandedHeight = nextHeight;
    node._preCollapseHeight = nextHeight;
}

function applyVerticalStackSharedEdgeResize(entity, resizeAnchor, requestedEntityHeight, snap, result, addCounterpart, graph) {
    if (resizeAnchor !== "top" && resizeAnchor !== "bottom") return false;

    const members = getVerticalDeckMembersByY(entity, graph);
    if (members.length <= 1) return false;

    const entityIndex = members.findIndex((member) => member.id === entity.id);
    if (entityIndex < 0) return false;

    const topNode = resizeAnchor === "top" ? members[entityIndex - 1] : entity;
    const bottomNode = resizeAnchor === "top" ? entity : members[entityIndex + 1];
    if (!topNode || !bottomNode) return false;

    markDockResizeActiveMembers(entity, members, bottomNode);

    const topCollapsed = topNode?.properties?.contentCollapsed === true;
    const bottomCollapsed = bottomNode?.properties?.contentCollapsed === true;
    if (topCollapsed || bottomCollapsed) {
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = getDockNodeHeight(entity);
        members.forEach(addCounterpart);
        return true;
    }

    const sessionSide = "vertical-ordered-seam";
    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === sessionSide
        && currentSession.entityId === entity.id
        && currentSession.topNodeId === topNode.id
        && currentSession.bottomNodeId === bottomNode.id
        && Array.isArray(currentSession.memberIds)
        && currentSession.memberIds.length === members.length
        && currentSession.memberIds.every((id, index) => id === members[index].id);
    if (!sessionMatches) {
        entity._dockResizeSession = {
            side: sessionSide,
            entityId: entity.id,
            topNodeId: topNode.id,
            bottomNodeId: bottomNode.id,
            topStartH: getDockNodeHeight(topNode),
            bottomStartH: getDockNodeHeight(bottomNode),
            memberIds: members.map((member) => member.id),
        };
    }

    const session = entity._dockResizeSession;
    const totalHeight = (Number(session.topStartH) || getDockNodeHeight(topNode)) + (Number(session.bottomStartH) || getDockNodeHeight(bottomNode));
    const topMinH = getVerticalResizeTargetMinHeight(topNode, snap, { preserveExpandedFloor: true });
    const bottomMinH = getVerticalResizeTargetMinHeight(bottomNode, snap, { preserveExpandedFloor: true });
    if (totalHeight < topMinH + bottomMinH) {
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = getDockNodeHeight(entity);
        normalizeVerticalMemberPositions(topNode, graph);
        members.forEach(addCounterpart);
        return true;
    }

    const requestedHeight = Number(requestedEntityHeight) || getDockNodeHeight(entity);
    const draggedMinH = entity.id === topNode.id ? topMinH : bottomMinH;
    const counterpartMinH = entity.id === topNode.id ? bottomMinH : topMinH;
    const draggedHeight = Math.min(totalHeight - counterpartMinH, Math.max(draggedMinH, requestedHeight));
    const counterpartHeight = totalHeight - draggedHeight;
    const adjustedTopH = topNode.id === entity.id ? draggedHeight : counterpartHeight;
    const adjustedBottomH = bottomNode.id === entity.id ? draggedHeight : counterpartHeight;

    syncDeckNodeSize(topNode, getDockNodeWidth(topNode), adjustedTopH);
    syncDeckNodeSize(bottomNode, getDockNodeWidth(bottomNode), adjustedBottomH);
    rememberExpandedDeckHeight(topNode, adjustedTopH);
    rememberExpandedDeckHeight(bottomNode, adjustedBottomH);
    normalizeVerticalMemberPositions(topNode, graph);
    if (typeof topNode.syncUncleSlots === "function") topNode.syncUncleSlots();
    if (typeof bottomNode.syncUncleSlots === "function") bottomNode.syncUncleSlots();

    result.handledHeight = true;
    result.handledAll = true;
    result.appliedHeight = entity.id === topNode.id ? adjustedTopH : adjustedBottomH;
    members.forEach(addCounterpart);
    return true;
}


function getNormalizedVerticalResizeStartPositions(members, startHeights) {
    const positions = {};
    if (!Array.isArray(members) || members.length === 0) return positions;

    let cursorY = Number(members[0]?.pos?.[1]) || 0;
    members.forEach((member) => {
        positions[member.id] = [Number(member?.pos?.[0]) || 0, cursorY];
        cursorY += Number(startHeights?.[member.id]) || getDockNodeHeight(member);
    });
    return positions;
}

function applyCollapsedVerticalBoundaryResize(entity, resizeAnchor, requestedEntityHeight, snap, result, addCounterpart, graph) {
    if (entity?.properties?.contentCollapsed !== true) return false;
    const members = getVerticalDeckMembersByY(entity, graph);
    if (members.length <= 1) return false;

    const entityIndex = members.findIndex((member) => member.id === entity.id);
    if (entityIndex < 0) return false;
    const isTopHandle = resizeAnchor === "top" || resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomHandle = resizeAnchor === "bottom" || resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";
    const isTopBoundary = entityIndex === 0 && isTopHandle;
    const isBottomBoundary = entityIndex === members.length - 1 && isBottomHandle;
    if (!isTopBoundary && !isBottomBoundary) return false;

    const sessionSide = isTopBoundary ? "vertical-collapsed-top-boundary" : "vertical-collapsed-bottom-boundary";
    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === sessionSide
        && currentSession.entityId === entity.id
        && Array.isArray(currentSession.memberIds)
        && currentSession.memberIds.length === members.length
        && currentSession.memberIds.every((id, index) => id === members[index].id);
    if (!sessionMatches) {
        const startHeights = Object.fromEntries(members.map((member) => [member.id, getVerticalResizeStartHeight(member, snap)]));
        entity._dockResizeSession = {
            side: sessionSide,
            entityId: entity.id,
            memberIds: members.map((member) => member.id),
            startHeights,
            startPositions: getNormalizedVerticalResizeStartPositions(members, startHeights),
        };
    }

    const session = entity._dockResizeSession;
    const currentHeight = Number(session.startHeights?.[entity.id]) || getDockNodeHeight(entity);
    const targetIndex = isTopBoundary
        ? members.findIndex((member, index) => index > entityIndex && member?.properties?.contentCollapsed !== true)
        : (() => {
            for (let index = entityIndex - 1; index >= 0; index--) {
                if (members[index]?.properties?.contentCollapsed !== true) return index;
            }
            return -1;
        })();
    if (targetIndex < 0) {
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = currentHeight;
        members.forEach(addCounterpart);
        return true;
    }

    const targetMember = members[targetIndex];
    targetMember._isDerpResizing = true;
    if (entity._dockResizeActiveMembers instanceof Set) entity._dockResizeActiveMembers.add(targetMember);
    else entity._dockResizeActiveMembers = new Set([targetMember]);
    const targetStartHeight = Number(session.startHeights?.[targetMember.id]) || getDockNodeHeight(targetMember);
    const targetMinHeight = getVerticalResizeTargetMinHeight(targetMember, snap);
    const startStackHeight = members.reduce((sum, member) => sum + (Number(session.startHeights?.[member.id]) || getDockNodeHeight(member)), 0);
    const startTopY = Number(session.startPositions?.[entity.id]?.[1]) || Number(entity._startPos?.[1]) || Number(entity.pos?.[1]) || 0;
    const requestedStackHeight = isTopBoundary
        ? startStackHeight + (startTopY - (Number(entity.pos?.[1]) || 0))
        : startStackHeight + ((Number(requestedEntityHeight) || 0) - currentHeight);
    const requestedDelta = Math.round((requestedStackHeight - startStackHeight) / snap) * snap;
    const delta = Math.max(targetMinHeight - targetStartHeight, requestedDelta);
    if (delta === 0) {
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = currentHeight;
        members.forEach(addCounterpart);
        return true;
    }

    if (isTopBoundary) {
        members.forEach((member, index) => {
            const startPos = session.startPositions?.[member.id] || member.pos || [0, 0];
            const startHeight = Number(session.startHeights?.[member.id]) || getDockNodeHeight(member);
            const height = startHeight + (index === targetIndex ? delta : 0);
            if (index <= targetIndex) setDeckNodePos(member, Number(startPos[0]) || 0, (Number(startPos[1]) || 0) - delta);
            syncDeckNodeSize(member, getDockNodeWidth(member), height);
            rememberExpandedDeckHeight(member, height);
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            addCounterpart(member);
        });
    } else {
        members.forEach((member, index) => {
            const startPos = session.startPositions?.[member.id] || member.pos || [0, 0];
            const startHeight = Number(session.startHeights?.[member.id]) || getDockNodeHeight(member);
            const height = startHeight + (index === targetIndex ? delta : 0);
            if (index > targetIndex) setDeckNodePos(member, Number(startPos[0]) || 0, (Number(startPos[1]) || 0) + delta);
            syncDeckNodeSize(member, getDockNodeWidth(member), height);
            rememberExpandedDeckHeight(member, height);
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            addCounterpart(member);
        });
    }

    result.handledHeight = true;
    result.handledAll = true;
    result.appliedHeight = currentHeight;
    return true;
}

function snapResizeValue(value, snap) {
    const unit = Math.max(1, Number(snap) || 10);
    return Math.round((Number(value) || 0) / unit) * unit;
}

function reconcileManualWidthsToTarget(nextWidths, manualMembers, originalWidths, targetManualTotal, minW, snap) {
    const unit = Math.max(1, Number(snap) || 10);
    const mins = new Map(manualMembers.map((member) => [member.id, getDockNodeMinWidth(member, minW, snap)]));
    const minTotal = manualMembers.reduce((sum, member) => sum + (mins.get(member.id) || 0), 0);
    const targetTotal = Math.max(minTotal, Number(targetManualTotal) || 0);

    manualMembers.forEach((member) => {
        const minWidth = mins.get(member.id) || 0;
        nextWidths.set(member.id, Math.max(minWidth, originalWidths.get(member.id) || 0));
    });

    let currentTotal = manualMembers.reduce((sum, member) => sum + (nextWidths.get(member.id) || 0), 0);
    let diff = targetTotal - currentTotal;
    let growIndex = 0;

    while (Math.abs(diff) >= unit - 0.5) {
        const order = diff > 0
            ? manualMembers
            : manualMembers
                .slice()
                .sort((a, b) => ((nextWidths.get(b.id) || 0) - (mins.get(b.id) || 0)) - ((nextWidths.get(a.id) || 0) - (mins.get(a.id) || 0)));
        let adjusted = false;
        for (let i = 0; i < order.length; i += 1) {
            const member = diff > 0 ? order[(growIndex + i) % order.length] : order[i];
            const current = nextWidths.get(member.id) || 0;
            if (diff > 0) {
                nextWidths.set(member.id, current + unit);
                diff -= unit;
                growIndex += i + 1;
                adjusted = true;
            } else {
                const minWidth = mins.get(member.id) || 0;
                if (current - unit < minWidth - 0.5) continue;
                nextWidths.set(member.id, current - unit);
                diff += unit;
                adjusted = true;
            }
            if (Math.abs(diff) < unit - 0.5) break;
        }
        if (!adjusted) break;
    }

    return manualMembers.reduce((sum, member) => sum + (nextWidths.get(member.id) || 0), 0);
}

function applyHorizontalStackWidthResize(entity, resizeAnchor, requestedEntityWidth, minW, snap, result, addCounterpart, graph) {
    const members = getHorizontalDeckMembersByX(entity, graph);
    if (members.length <= 1) return false;

    const manualMembers = members.filter((member) => canResizeHorizontalMemberWidth(member, graph));
    if (manualMembers.length === 0) return false;

    const isLeftHandle = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    if (isDeckPressureSideHorizontalHubEdge(entity, graph, isLeftHandle ? "left" : "right")) return false;
    const entityIndex = members.findIndex((member) => member.id === entity.id);
    const isOuterBoundaryResize = isLeftHandle ? entityIndex === 0 : entityIndex === members.length - 1;
    if (!isOuterBoundaryResize) return false;

    markDockResizeActiveMembers(entity, members, entity, { markResizing: false, horizontalWidthLock: true });

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
    const explicitDelta = Number(entity._dockResizeRequestedDeltaW);
    const requestedDelta = Number.isFinite(explicitDelta)
        ? explicitDelta
        : Number(requestedEntityWidth) - entityStartWidth;
    if (!Number.isFinite(requestedDelta) || Math.abs(requestedDelta) < 0.5) return false;
    const snappedRequestedDelta = snapResizeValue(requestedDelta, snap);
    if (Math.abs(snappedRequestedDelta) < 0.5) return false;

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
    const manualMinTotal = manualMembers.reduce((sum, member) => sum + getDockNodeMinWidth(member, minW, snap), 0);
    const originalManualTotal = manualMembers.reduce((sum, member) => sum + (originalWidths.get(member.id) || 0), 0);
    const requestedTotalWidth = Math.max(0, originalTotalWidth + snappedRequestedDelta);
    const targetManualTotal = Math.max(manualMinTotal, originalManualTotal + snappedRequestedDelta);
    const nextWidths = new Map(originalWidths);

    members.forEach((member) => {
        if (canResizeHorizontalMemberWidth(member, graph)) return;
        const fixedAutoWidth = originalWidths.get(member.id) || getDockNodeWidth(member);
        nextWidths.set(member.id, fixedAutoWidth);
        member._horizontalDeckWidthBalanceObserved = fixedAutoWidth;
        member._horizontalDeckWidthBalanceReady = true;
    });
    const manualTotal = reconcileManualWidthsToTarget(nextWidths, manualMembers, originalWidths, targetManualTotal, minW, snap);
    const totalWidth = fixedWidth + manualTotal;

    let cursorX = isLeftHandle ? anchorX - totalWidth : anchorX;
    members.forEach((member) => {
        const width = nextWidths.get(member.id) || getDockNodeWidth(member);
        syncDeckNodeSize(member, width, getDockNodeHeight(member), { silent: true });
        setDeckNodePos(member, cursorX, Number(member.pos?.[1]) || 0);
        cursorX += width;
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
        addCounterpart(member);
    });

    result.handledWidth = true;
    result.handledAll = true;
    result.appliedWidth = nextWidths.get(entity.id) || getDockNodeWidth(entity);
    dockDebug("resize-horizontal-stack-width", () => ({
        entity: snapshotDockNode(entity),
        resizeAnchor,
        requested: { requestedEntityWidth, requestedDelta, snappedRequestedDelta, requestedTotalWidth },
        fixedWidth,
        targetManualTotal,
        members: members.map(snapshotDockNode),
    }));
    return true;
}

function applyDeckPressureSideWidthResize(entity, resizeAnchor, requestedEntityWidth, minW, snap, result, addCounterpart, graph) {
    if (resizeAnchor !== "left" && resizeAnchor !== "right") return false;
    const pressureHub = getDeckPressureHubForNode(entity, graph);
    if (!pressureHub || pressureHub.id === entity.id) return false;
    const branchSide = getDeckPressureBranchSideForNode(pressureHub, graph, entity);
    if (branchSide !== "left" && branchSide !== "right") return false;
    const branchAxis = getDeckPressureBranchAxis(pressureHub, graph, branchSide);
    if (branchAxis !== "vertical" && branchAxis !== "horizontal") return false;
    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === `deck-pressure-${branchSide}-seam`
        && currentSession.entityId === entity.id
        && currentSession.hubId === pressureHub.id;
    if (!sessionMatches && !isDeckPressureSideWidthResizeEdge(entity, graph, resizeAnchor)) return false;

    const branchMembers = getDeckPressureBranchMembers(pressureHub, graph, branchSide);
    if (!branchMembers.length) return false;

    const planBefore = computeDeckPressureGeometryPlan(pressureHub, graph, snap);
    const frameBefore = planBefore?.frame || null;
    if (!frameBefore) return false;

    if (!sessionMatches) {
        entity._dockResizeSession = {
            side: `deck-pressure-${branchSide}-seam`,
            entityId: entity.id,
            hubId: pressureHub.id,
            frameBounds: frameBefore,
            hubStartX: Number(pressureHub.pos?.[0]) || 0,
            hubStartW: getDockNodeWidth(pressureHub),
            branchStartWidth: branchAxis === "horizontal"
                ? branchMembers.reduce((sum, member) => sum + getDockNodeWidth(member), 0)
                : Math.max(...branchMembers.map((member) => getDockNodeWidth(member)), 0),
            branchStartWidths: Object.fromEntries(branchMembers.map((member) => [member.id, getDockNodeWidth(member)])),
            branchAxis,
            oppositeSideWidth: branchSide === "left" ? Number(planBefore?.constraints?.rightWidth) || 0 : Number(planBefore?.constraints?.leftWidth) || 0,
            topBottomMinWidth: Number(planBefore?.constraints?.topBottomMinWidth) || 0,
            arrangement: planBefore?.arrangement || null,
        };
    }
    const session = entity._dockResizeSession;
    const preservedFrame = session.frameBounds || frameBefore;
    const hubStartX = Number(session.hubStartX) || Number(pressureHub.pos?.[0]) || 0;
    const hubStartW = Number(session.hubStartW) || getDockNodeWidth(pressureHub);
    const startWidths = session.branchStartWidths || Object.fromEntries(branchMembers.map((member) => [member.id, getDockNodeWidth(member)]));
    const branchStartWidth = Number(session.branchStartWidth) || (branchAxis === "horizontal"
        ? branchMembers.reduce((sum, member) => sum + (Number(startWidths[member.id]) || getDockNodeWidth(member)), 0)
        : Math.max(...branchMembers.map((member) => Number(startWidths[member.id]) || getDockNodeWidth(member)), 0));
    const branchMinWidth = branchAxis === "horizontal"
        ? branchMembers.reduce((sum, member) => sum + getDockNodeMinWidth(member, minW, snap), 0)
        : Math.max(...branchMembers.map((member) => getDockNodeMinWidth(member, minW, snap)), 0);
    const preservedFrameWidth = Math.max(0, Number(preservedFrame.right) - Number(preservedFrame.left));
    const oppositeSideWidth = Math.max(0, Number(session.oppositeSideWidth) || (preservedFrameWidth - branchStartWidth - hubStartW));
    const fallbackHubMinWidth = getDockNodeMinWidth(pressureHub, minW, snap);
    const hubMinWidth = Math.max(fallbackHubMinWidth, getDeckPressureHubMinWidth(pressureHub, graph, snap, fallbackHubMinWidth));
    const topBottomMinWidth = Math.max(0, Number(session.topBottomMinWidth) || 0);
    const hubRequiredWidth = session.arrangement === "vertical_sandwich" ? Math.max(hubMinWidth, topBottomMinWidth) : hubMinWidth;
    const availableBranchWidth = Math.max(0, preservedFrameWidth - oppositeSideWidth - hubRequiredWidth);
    const maxBranchWidth = Math.max(0, availableBranchWidth);
    const explicitDelta = Number(entity._dockResizeRequestedDeltaW);
    const requestedDelta = Number.isFinite(explicitDelta) ? explicitDelta : (Number(requestedEntityWidth) - branchStartWidth);
    const lowerBranchWidth = Math.min(branchMinWidth, maxBranchWidth);
    const nextBranchWidth = Math.min(maxBranchWidth, Math.max(lowerBranchWidth, branchStartWidth + requestedDelta));
    const delta = nextBranchWidth - branchStartWidth;
    if (Math.abs(delta) < 0.5) {
        result.handledWidth = true;
        result.handledAll = true;
        result.appliedWidth = branchStartWidth;
        branchMembers.forEach(addCounterpart);
        addCounterpart(pressureHub);
        return true;
    }

    const currentPlan = computeDeckPressureGeometryPlan(pressureHub, graph, snap, { frameBounds: preservedFrame });
    const currentWidths = currentPlan?.constraints || {};
    const sideWidths = {
        left: branchSide === "left" ? nextBranchWidth : Number(currentWidths.leftWidth) || 0,
        right: branchSide === "right" ? nextBranchWidth : Number(currentWidths.rightWidth) || 0,
    };

    if (branchAxis === "horizontal") {
        const minWidths = new Map(branchMembers.map((member) => [member.id, getDockNodeMinWidth(member, minW, snap)]));
        const nextWidths = new Map(branchMembers.map((member) => [
            member.id,
            Math.max(minWidths.get(member.id) || 0, Number(startWidths[member.id]) || getDockNodeWidth(member)),
        ]));
        const minTotal = branchMembers.reduce((sum, member) => sum + (minWidths.get(member.id) || 0), 0);
        const spareTarget = Math.max(0, nextBranchWidth - minTotal);
        const startSpareTotal = branchMembers.reduce((sum, member) => {
            const startWidth = Number(startWidths[member.id]) || getDockNodeWidth(member);
            return sum + Math.max(0, startWidth - (minWidths.get(member.id) || 0));
        }, 0);
        let assigned = 0;
        branchMembers.forEach((member, index) => {
            const minWidth = minWidths.get(member.id) || 0;
            const startWidth = Number(startWidths[member.id]) || getDockNodeWidth(member);
            const startSpare = Math.max(0, startWidth - minWidth);
            const isLast = index === branchMembers.length - 1;
            const spare = isLast ? Math.max(0, spareTarget - assigned) : snapResizeValue(spareTarget * (startSpareTotal > 0 ? startSpare / startSpareTotal : 1 / branchMembers.length), snap);
            assigned += spare;
            nextWidths.set(member.id, minWidth + spare);
        });
        branchMembers.forEach((member) => {
            const width = nextWidths.get(member.id) || getDockNodeWidth(member);
            if (!member.properties) member.properties = {};
            member.properties.autoWidth = false;
            member._horizontalDeckWidthResizeLock = true;
            member._deckPressureSideHorizontalWidth = width;
            member.properties._deckPressureSideHorizontalWidth = width;
            member._horizontalDeckWidthBalanceObserved = width;
            member._horizontalDeckWidthBalanceReady = true;
            syncDeckNodeSize(member, width, getDockNodeHeight(member), { silent: true });
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            addCounterpart(member);
        });
        markDockResizeActiveMembers(entity, branchMembers, entity, { markResizing: false });
    } else {
        branchMembers.forEach(addCounterpart);
    }

    addCounterpart(pressureHub);
    pressureHub._deckPressureSideWidthOverrides = sideWidths;

    pressureHub._deckPressurePreserveFrameBounds = preservedFrame;
    try {
        applyDeckPressureLayout(pressureHub, graph, snap);
    } finally {
        delete pressureHub._deckPressurePreserveFrameBounds;
        delete pressureHub._deckPressureSideWidthOverrides;
    }

    result.handledWidth = true;
    result.handledAll = true;
    result.appliedWidth = nextBranchWidth;
    return true;
}

export function syncDockResizePair(entity, resizeAnchor, newW, newH, minW, minH, snap = 10) {
    const graph = app.graph || entity.graph || null;
    if (!graph) return { handledWidth: false, handledHeight: false, handledAll: false, appliedWidth: null, appliedHeight: null, counterparts: [] };
    const allowHeightIntent = entity?._dockResizeAllowHeight !== false;

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

    const isLeftHandle = resizeAnchor === "left" || resizeAnchor === "top-left" || resizeAnchor === "bottom-left";
    const isRightHandle = resizeAnchor === "right" || resizeAnchor === "top-right" || resizeAnchor === "bottom-right";
    const isTopHandle = resizeAnchor === "top" || resizeAnchor === "top-left" || resizeAnchor === "top-right";
    const isBottomHandle = resizeAnchor === "bottom" || resizeAnchor === "bottom-left" || resizeAnchor === "bottom-right";

    if ((isLeftHandle || isRightHandle) && applyDeckPressureSideWidthResize(entity, resizeAnchor, newW, minW, snap, result, addCounterpart, graph)) {
        return result;
    }

    const verticalResizeMembers = getLinearResizeMembers(entity, graph, "vertical");
    if (verticalResizeMembers.length > 1) {
        result.pinnedAnchor = getPinnedVerticalDeckPositionAnchor(entity, graph);
        dockDebug("resize-vertical-before", () => ({
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: verticalResizeMembers.map(snapshotDockNode),
        }));
        const dockSize = resolveDockResizeDimensions("vertical", verticalResizeMembers, { width: newW }, { minWidth: minW, height: getDockNodeHeight(entity) }, snap);
        const snappedWidth = dockSize.width;
        verticalResizeMembers.forEach((node) => {
            const nodeH = getVerticalResizeStartHeight(node, snap);
            syncDeckNodeSize(node, snappedWidth, nodeH, { silent: true });
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledWidth = true;
        result.appliedWidth = snappedWidth;
        dockDebug("resize-vertical-after", () => ({
            entity: snapshotDockNode(entity),
            appliedWidth: snappedWidth,
            members: verticalResizeMembers.map(snapshotDockNode),
        }));
    }

    const requestsHeightResize = allowHeightIntent && (isTopHandle || isBottomHandle) && newH !== getVerticalResizeStartHeight(entity, snap);

    const horizontalResizeMembers = getLinearResizeMembers(entity, graph, "horizontal");
    if (horizontalResizeMembers.length > 1 && requestsHeightResize) {
        dockDebug("resize-horizontal-before", () => ({
            entity: snapshotDockNode(entity),
            resizeAnchor,
            requested: { newW, newH, minW, minH, snap },
            members: horizontalResizeMembers.map(snapshotDockNode),
        }));
        const dockSize = resolveDockResizeDimensions("horizontal", horizontalResizeMembers, { height: newH }, { minHeight: minH, width: getDockNodeWidth(entity) }, snap);
        const snappedHeight = dockSize.height;
        horizontalResizeMembers.forEach((node) => {
            const nodeW = getDockNodeWidth(node);
            syncDeckNodeSize(node, nodeW, snappedHeight);
            if (typeof node.syncUncleSlots === "function") node.syncUncleSlots();
            addCounterpart(node);
        });
        result.handledHeight = true;
        result.appliedHeight = snappedHeight;
        dockDebug("resize-horizontal-after", () => ({
            entity: snapshotDockNode(entity),
            appliedHeight: snappedHeight,
            members: horizontalResizeMembers.map(snapshotDockNode),
        }));
    }

    if ((isLeftHandle || isRightHandle) && applyHorizontalStackWidthResize(entity, resizeAnchor, newW, minW, snap, result, addCounterpart, graph)) {
        return result;
    }

    if (requestsHeightResize && applyCollapsedVerticalBoundaryResize(entity, resizeAnchor, newH, snap, result, addCounterpart, graph)) {
        return result;
    }

    if (requestsHeightResize && applyVerticalStackSharedEdgeResize(entity, resizeAnchor, newH, snap, result, addCounterpart, graph)) {
        return result;
    }

    const parent = getDeckParent(entity, graph);
    const childNodes = getDeckChildren(entity, graph);
    const seamCandidates = [];
    const addSeamCandidate = (leader, docked, side) => {
        if (!leader || !docked || !side) return;
        if (seamCandidates.some((candidate) =>
            candidate.leader?.id === leader.id
            && candidate.docked?.id === docked.id
            && candidate.side === side
        )) return;
        seamCandidates.push({ leader, docked, side });
    };
    const orderedVerticalMembers = getVerticalDeckMembersByY(entity, graph);
    const verticalIndex = orderedVerticalMembers.findIndex((member) => member.id === entity.id);
    if (verticalIndex > 0) addSeamCandidate(orderedVerticalMembers[verticalIndex - 1], entity, "bottom");
    if (verticalIndex >= 0 && verticalIndex < orderedVerticalMembers.length - 1) addSeamCandidate(entity, orderedVerticalMembers[verticalIndex + 1], "bottom");

    const orderedHorizontalMembers = getHorizontalDeckMembersByX(entity, graph);
    const horizontalIndex = orderedHorizontalMembers.findIndex((member) => member.id === entity.id);
    if (horizontalIndex > 0) addSeamCandidate(orderedHorizontalMembers[horizontalIndex - 1], entity, "right");
    if (horizontalIndex >= 0 && horizontalIndex < orderedHorizontalMembers.length - 1) addSeamCandidate(entity, orderedHorizontalMembers[horizontalIndex + 1], "right");

    const peerAbove = getNodeOnDeckEdge(entity, graph, "top");
    const peerBelow = getNodeOnDeckEdge(entity, graph, "bottom");
    const peerLeft = getHorizontalSameRowNeighbor(entity, graph, "left");
    const peerRight = getHorizontalSameRowNeighbor(entity, graph, "right");
    addSeamCandidate(peerAbove, entity, "bottom");
    addSeamCandidate(entity, peerBelow, "bottom");
    addSeamCandidate(peerLeft, entity, "right");
    addSeamCandidate(entity, peerRight, "right");
    if (parent) {
        const parentEdges = parent.properties?.deckEdges || {};
        const parentSide = ["left", "right", "top", "bottom"].find(s => parentEdges[s] === entity.id);
        addSeamCandidate(parent, entity, parentSide || entity.properties?.deckDockSide || null);
    }
    childNodes.forEach((child) => {
        const entityEdges = entity.properties?.deckEdges || {};
        const childSide = ["left", "right", "top", "bottom"].find(s => entityEdges[s] === child.id);
        addSeamCandidate(entity, child, childSide || child.properties?.deckDockSide || null);
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

    const verticalResizeMembersForSession = (side === "top" || side === "bottom")
        ? getVerticalDeckMembersByY(entity, graph)
        : [];
    const currentSession = entity._dockResizeSession;
    const sessionMatches = currentSession
        && currentSession.side === side
        && currentSession.leaderId === leader.id
        && currentSession.dockedId === docked.id
        && (
            side !== "top" && side !== "bottom"
            || (
                Array.isArray(currentSession.memberIds)
                && currentSession.memberIds.length === verticalResizeMembersForSession.length
                && currentSession.memberIds.every((id, index) => id === verticalResizeMembersForSession[index]?.id)
            )
        );

    if (!sessionMatches) {
        entity._dockResizeSession = {
            side,
            leaderId: leader.id,
            dockedId: docked.id,
            leaderStartW: leader.size?.[0] || leader.properties?.nodeSize?.[0] || 0,
            leaderStartH: leader.size?.[1] || leader.properties?.nodeSize?.[1] || 0,
            dockedStartW: docked.size?.[0] || docked.properties?.nodeSize?.[0] || 0,
            dockedStartH: docked.size?.[1] || docked.properties?.nodeSize?.[1] || 0,
            memberIds: verticalResizeMembersForSession.map((member) => member.id),
        };
    }

    const session = entity._dockResizeSession;

    if (side === "left" || side === "right") {
        const totalWidth = session.leaderStartW + session.dockedStartW;

        const leftNode = side === "left" ? docked : leader;
        const rightNode = side === "left" ? leader : docked;
        if (!canResizeHorizontalSeamPair(leftNode, rightNode, graph)) {
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
        [leftNode, rightNode].forEach((member) => {
            const width = member.id === leftNode.id ? adjustedLeftW : adjustedRightW;
            if (!member.properties) member.properties = {};
            member.properties.autoWidth = false;
            member._horizontalDeckWidthResizeLock = true;
            member._deckPressureSideHorizontalWidth = width;
            member.properties._deckPressureSideHorizontalWidth = width;
            member._horizontalDeckWidthBalanceObserved = width;
            member._horizontalDeckWidthBalanceReady = true;
        });
        markDockResizeActiveMembers(entity, [leftNode, rightNode], entity, { markResizing: false });

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
        const verticalMembers = getVerticalDeckMembersByY(topNode, graph);
        if (resizeAnchor === "top" || resizeAnchor === "bottom") {
            markDockResizeActiveMembers(entity, verticalMembers, bottomNode);
        }

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

        const topMinH = getVerticalResizeTargetMinHeight(topNode, snap, { preserveExpandedFloor: true });
        const bottomMinH = getVerticalResizeTargetMinHeight(bottomNode, snap, { preserveExpandedFloor: true });
        if (totalHeight < topMinH + bottomMinH) {
            result.handledHeight = true;
            result.handledAll = true;
            result.appliedHeight = getDockNodeHeight(entity);
            normalizeVerticalMemberPositions(topNode, graph);
            verticalMembers.forEach(addCounterpart);
            return result;
        }

        const draggedMinH = entity.id === topNode.id ? topMinH : bottomMinH;
        const counterpartMinH = entity.id === topNode.id ? bottomMinH : topMinH;
        const draggedHeight = Math.min(totalHeight - counterpartMinH, Math.max(draggedMinH, newH));
        const counterpartHeight = totalHeight - draggedHeight;
        const adjustedTopH = topNode.id === entity.id ? draggedHeight : counterpartHeight;
        const adjustedBottomH = bottomNode.id === entity.id ? draggedHeight : counterpartHeight;

        syncDeckNodeSize(topNode, getDockNodeWidth(topNode), adjustedTopH);
        syncDeckNodeSize(bottomNode, getDockNodeWidth(bottomNode), adjustedBottomH);
        rememberExpandedDeckHeight(topNode, adjustedTopH);
        rememberExpandedDeckHeight(bottomNode, adjustedBottomH);
        setDeckNodePos(bottomNode, Number(bottomNode.pos?.[0]) || 0, (Number(topNode.pos?.[1]) || 0) + adjustedTopH);
        normalizeVerticalMemberPositions(topNode, graph);
        if (typeof topNode.syncUncleSlots === "function") topNode.syncUncleSlots();
        if (typeof bottomNode.syncUncleSlots === "function") bottomNode.syncUncleSlots();
        result.handledHeight = true;
        result.handledAll = true;
        result.appliedHeight = entity.id === topNode.id ? adjustedTopH : adjustedBottomH;
        verticalMembers.forEach(addCounterpart);
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
        dockDebug("apply-resize-result", () => ({
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
        }));
        entity._dockResizeSession = null;
    }

    if (dockResizeResult.handledWidth && getLinearResizeMembers(entity, app.graph || entity.graph || null, "vertical").length > 1) {
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
