const DEFAULT_SNAP = 10;

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

export function getDockNodeWidth(node) {
    return Number(node?.properties?.nodeSize?.[0] ?? node?.size?.[0]) || 0;
}

export function getDockNodeHeight(node) {
    return Number(node?.properties?.nodeSize?.[1] ?? node?.size?.[1]) || 0;
}

export function getDockNodeMinWidth(node, fallback = 0, snap = DEFAULT_SNAP) {
    const propMinW = Number(node?.properties?.minWidth) || 0;
    const contentMinW = Number(node?.layout?.contentMinWidth) || 60;
    const padL = Number(node?._padL) || 0;
    const padR = Number(node?._padR) || 0;
    return snapCeil(Math.max(Number(fallback) || 0, propMinW, contentMinW + padL + padR), snap);
}

export function getDockNodeMinHeight(node, fallback = 0, snap = DEFAULT_SNAP) {
    let explicitMinH = 0;
    if (node?.layoutMap) {
        Object.values(node.layoutMap).forEach((reg) => {
            if (reg?.minHeight) explicitMinH += Number(reg.minHeight) || 0;
        });
    }
    const contentMinH = Number(node?.layout?.contentMinHeight) || Number(node?.layout?.totalHeight) || 40;
    const raw = Math.max(Number(fallback) || 0, explicitMinH, contentMinH);
    return node?.properties?.contentCollapsed ? raw : snapCeil(raw, snap);
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
    const rawH = isMinState ? (Math.max(contentMinH, totalH) || 40) : (contentMinH || totalH || 40);
    const engineFloorH = isMinState ? rawH : snapCeil(rawH, snap);

    const storedW = Number(node?.properties?.nodeSize?.[0]) || 0;
    const storedH = Number(node?.properties?.nodeSize?.[1]) || 0;
    const liveW = Number(node?.size?.[0]) || 0;
    const liveH = Number(node?.size?.[1]) || 0;

    const width = shouldPreserveDockWidth(axis)
        ? (storedW || liveW || engineFloorW)
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
        const stackHeight = getSharedDockHeight(members, leaderH || nodeH);
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
