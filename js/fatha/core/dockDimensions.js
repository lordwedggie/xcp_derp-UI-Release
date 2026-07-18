const DEFAULT_SNAP = 10;

// Combined node structure hash + header inset hash for layout/engine cache keys.
// _layoutMapHash is written by each node's refreshNodeLayoutMap (map content);
// _headerInsetLayoutHash is written by getVirtualNodeLayoutMap (collapse /
// drawHeader / selection / corners / insets). One helper keeps every cache-key
// site on the same contract so a third component only ever changes here.
export function getDerpLayoutCacheHash(node) {
    return (node?._layoutMapHash || "") + "~" + (node?._headerInsetLayoutHash || "");
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}

function snapCeil(value, snap = DEFAULT_SNAP) {
    const unit = isFiniteNumber(snap) && snap > 0 ? snap : DEFAULT_SNAP;
    return Math.ceil((Number(value) || 0) / unit) * unit;
}

function snapRound(value, snap = DEFAULT_SNAP) {
    const unit = isFiniteNumber(snap) && snap > 0 ? snap : DEFAULT_SNAP;
    return Math.round((Number(value) || 0) / unit) * unit;
}

// Deep-walks a layout map for explicit region minHeight values. The walk
// mirrors the layout engine's own region discovery (any object value may be a
// child region), so nested regions (e.g. derpPromptBook's contentRegion) count
// toward the floor. Function-valued minHeight (viewport configs) resolves to
// NaN and is ignored.
export function sumLayoutMapMinHeights(config, seen = new Set()) {
    if (!config || typeof config !== "object" || seen.has(config)) return 0;
    seen.add(config);
    const own = Number(config.minHeight);
    let sum = Number.isFinite(own) && own > 0 ? own : 0;
    Object.values(config).forEach((value) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            sum += sumLayoutMapMinHeights(value, seen);
        }
    });
    return sum;
}

function getCollapsedDockHeight(node, snap = DEFAULT_SNAP, measured = {}) {
    const unit = isFiniteNumber(snap) && snap > 0 ? snap : DEFAULT_SNAP;
    if (node?.properties?.useCollapsedTotalHeight === true) {
        const contentMinH = Number(measured.contentMinHeight ?? node?.layout?.contentMinHeight) || 0;
        const totalH = Number(measured.totalHeight ?? node?.layout?.totalHeight) || 0;
        return Math.max(contentMinH, totalH) || (unit * 2);
    }
    return unit * 2;
}

export function getDockNodeWidth(node) {
    return Number(node?.size?.[0] ?? node?.properties?.nodeSize?.[0]) || 0;
}

export function getDockNodeHeight(node) {
    return Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
}

export function getDockNodeMinWidth(node, fallback = 0, snap = DEFAULT_SNAP) {
    const propMinW = Number(node?.properties?.minWidth) || 0;
    const contentMinW = Number(node?.layout?.contentMinWidth) || 60;
    const padL = Number(node?._padL) || 0;
    const padR = Number(node?._padR) || 0;
    return snapCeil(Math.max(Number(fallback) || 0, propMinW, contentMinW + padL + padR), snap);
}

export function getDockNodeMinHeight(node, fallback = 0, snap = DEFAULT_SNAP) {
    if (node?.properties?.contentCollapsed) {
        return Math.max(Number(fallback) || 0, getCollapsedDockHeight(node, snap));
    }

    const explicitMinH = sumLayoutMapMinHeights(node?.layoutMap);
    const contentMinH = Number(node?.layout?.contentMinHeight) || Number(node?.layout?.totalHeight) || 40;
    const raw = Math.max(Number(fallback) || 0, explicitMinH, contentMinH);
    return snapCeil(raw, snap);
}

export function getDockGroupAxisFromMembers(members = []) {
    if (!Array.isArray(members) || members.length <= 1) return null;

    let hasHorizontal = false;
    let hasVertical = false;
    for (const member of members) {
        const edges = member?.properties?.deckEdges || {};
        if (edges.left !== null && edges.left !== undefined) hasHorizontal = true;
        if (edges.right !== null && edges.right !== undefined) hasHorizontal = true;
        if (edges.top !== null && edges.top !== undefined) hasVertical = true;
        if (edges.bottom !== null && edges.bottom !== undefined) hasVertical = true;
        if (hasHorizontal && hasVertical) return "mixed";
    }

    if (hasHorizontal) return "horizontal";
    if (hasVertical) return "vertical";
    return null;
}

export function shouldPreserveDockWidth(axis) {
    return axis === "vertical";
}

export function shouldPreserveDockHeight(axis) {
    return axis === "horizontal";
}

export function resolveDockResizeAxes(axis, vars = {}) {
    const autoWidth = vars.autoWidth === true;
    const autoHeight = vars.autoHeight === true;

    if (axis === "vertical") {
        return {
            allowWidth: !autoWidth,
            allowHeight: !autoHeight,
        };
    }

    if (axis === "horizontal") {
        return {
            allowWidth: !autoWidth,
            allowHeight: false,
        };
    }

    return {
        allowWidth: !autoWidth,
        allowHeight: !autoHeight,
    };
}

export function resolveRuntimeDockSize(node, axis, measured, vars = {}) {
    const snap = Number(vars.SNAP) || DEFAULT_SNAP;
    const isMinState = node?.properties?.contentCollapsed === true;
    const collapseMinimal = node?.properties?.collapseMinimal === true;
    const autoWidth = vars.autoWidth === true;
    const autoHeight = vars.autoHeight === true;

    const contentReqW = Number(measured?.contentMinWidth) || 0;
    const engineFloorW = snapCeil(contentReqW, snap);
    const contentMinH = Number(measured?.contentMinHeight) || 0;
    const totalH = Number(measured?.totalHeight) || 0;
    const rawH = isMinState
        ? getCollapsedDockHeight(node, snap, { contentMinHeight: contentMinH, totalHeight: totalH })
        : (contentMinH || totalH || 40);
    const engineFloorH = isMinState ? rawH : snapCeil(rawH, snap);

    const storedW = Number(node?.properties?.nodeSize?.[0]) || 0;
    const storedH = Number(node?.properties?.nodeSize?.[1]) || 0;
    const liveW = Number(node?.size?.[0]) || 0;
    const liveH = Number(node?.size?.[1]) || 0;

    const width = shouldPreserveDockWidth(axis)
        ? Math.max(storedW || liveW || 0, engineFloorW)
        : ((autoWidth || (isMinState && collapseMinimal)) ? engineFloorW : Math.max(storedW, engineFloorW));

    const height = shouldPreserveDockHeight(axis)
        ? (autoHeight ? engineFloorH : Math.max(storedH, liveH, 0))
        : (autoHeight
            ? engineFloorH
            : (isMinState
                ? engineFloorH
                : Math.max(storedH || liveH || 0, engineFloorH)));

    return { width, height, engineFloorW, engineFloorH };
}

export function resolveDockAttachDimensions(node, leader, side, members = [], snap = DEFAULT_SNAP) {
    const nodeW = getDockNodeWidth(node);
    const nodeH = getDockNodeHeight(node);
    const leaderW = getDockNodeWidth(leader);
    const leaderH = getDockNodeHeight(leader);
    const attachMembers = Array.isArray(members) ? [...members, node] : [leader, node];

    if (side === "top" || side === "bottom") {
        const stackWidth = Math.max(
            getSharedDockWidth(members, leaderW || nodeW),
            getSharedDockMinWidth(members, leaderW || nodeW, snap),
            getDockNodeMinWidth(node, 0, snap),
            getDockNodeMinWidth(leader, 0, snap)
        );
        return {
            nodeWidth: stackWidth,
            nodeHeight: nodeH,
            leaderWidth: stackWidth,
            leaderHeight: leaderH,
        };
    }

    if (side === "left" || side === "right") {
        const stackHeight = Math.max(
            getSharedDockHeight(attachMembers, Math.max(leaderH, nodeH)),
            getDockNodeMinHeight(node, 0, snap),
            getDockNodeMinHeight(leader, 0, snap)
        );
        return {
            nodeWidth: nodeW,
            nodeHeight: stackHeight,
            leaderWidth: leaderW,
            leaderHeight: stackHeight,
        };
    }

    return {
        nodeWidth: Math.max(leaderW, getDockNodeMinWidth(node, 0, snap)),
        nodeHeight: Math.max(leaderH, getDockNodeMinHeight(node, 0, snap)),
        leaderWidth: Math.max(leaderW, getDockNodeMinWidth(leader, 0, snap)),
        leaderHeight: Math.max(leaderH, getDockNodeMinHeight(leader, 0, snap)),
    };
}

export function getSharedDockWidth(members = [], fallback = 0) {
    const widths = (Array.isArray(members) ? members : [])
        .map(getDockNodeWidth)
        .filter((width) => width > 0);
    return widths.length ? Math.max(...widths) : (Number(fallback) || 0);
}

export function getSharedDockMinWidth(members = [], fallback = 0, snap = DEFAULT_SNAP) {
    const minWidths = (Array.isArray(members) ? members : [])
        .map((member) => getDockNodeMinWidth(member, 0, snap))
        .filter((width) => width > 0);
    return minWidths.length ? Math.max(...minWidths) : (Number(fallback) || 0);
}

export function getActiveVerticalDeckWidthLock(members = [], minWidth = 0) {
    const now = performance.now?.() || Date.now();
    const locks = members
        .map((member) => ({
            width: Number(member?._verticalDeckWidthLock) || 0,
            until: Number(member?._verticalDeckWidthLockUntil) || 0,
            floor: Number(member?._verticalDeckWidthLockFloor) || 0,
            floorUntil: Number(member?._verticalDeckWidthLockFloorUntil) || 0,
            exact: member?._verticalDeckWidthLockExact === true,
            freezeFloor: member?._verticalDeckWidthLockFreezeFloor === true,
        }))
        .filter((lock) => lock.width > 0 && lock.until > now);
    if (locks.length !== members.length || locks.length === 0) return 0;
    const width = Math.min(...locks.map((lock) => lock.width));
    if (locks.every((lock) => lock.exact)) return width;
    const freezeFloor = locks.every((lock) => lock.freezeFloor);
    const floor = Math.max(
        ...locks.map((lock) => lock.floorUntil > now ? lock.floor : 0),
        freezeFloor ? 0 : Number(minWidth) || 0
    );
    return Math.max(width, floor);
}

export function getActiveVerticalNodeWidthLock(node, minWidth = 0) {
    const width = Number(node?._verticalDeckWidthLock) || 0;
    const until = Number(node?._verticalDeckWidthLockUntil) || 0;
    const now = performance.now?.() || Date.now();
    if (width <= 0 || until <= now) return 0;
    if (node?._verticalDeckWidthLockExact === true) return width;
    const floor = node?._verticalDeckWidthLockFreezeFloor === true
        ? Number(node?._verticalDeckWidthLockFloor) || 0
        : Number(minWidth) || 0;
    const target = Math.max(width, floor);
    if (node?._verticalDeckWidthLockFreezeFloor !== true) {
        node._verticalDeckWidthLockFloor = Math.max(Number(node?._verticalDeckWidthLockFloor) || 0, target);
        node._verticalDeckWidthLockFloorUntil = until;
    }
    return target;
}

export function getSharedDockHeight(members = [], fallback = 0) {
    const heights = (Array.isArray(members) ? members : [])
        .map(getDockNodeHeight)
        .filter((height) => height > 0);
    return heights.length ? Math.max(...heights) : (Number(fallback) || 0);
}

export function resolveDockResizeDimensions(axis, members = [], requested = {}, fallback = {}, snap = DEFAULT_SNAP) {
    const requestedW = snapRound(requested.width, snap);
    const requestedH = snapRound(requested.height, snap);

    if (axis === "vertical") {
        const groupMinW = (Array.isArray(members) ? members : []).reduce((maxMin, node) => {
            return Math.max(maxMin, getDockNodeMinWidth(node, 0, snap));
        }, Number(fallback.minWidth) || 0);
        return {
            width: Math.max(requestedW, groupMinW),
            height: getSharedDockHeight(members, fallback.height),
        };
    }

    if (axis === "horizontal") {
        const groupMinH = (Array.isArray(members) ? members : []).reduce((maxMin, node) => {
            return Math.max(maxMin, getDockNodeMinHeight(node, 0, snap));
        }, Number(fallback.minHeight) || 0);
        return {
            width: Math.max(
                getSharedDockWidth(members, fallback.width),
                getSharedDockMinWidth(members, fallback.width, snap)
            ),
            height: Math.max(requestedH, groupMinH),
        };
    }

    return { width: requestedW, height: requestedH };
}
