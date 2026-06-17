function getLinearDragRect(dragNode, graph, getNodeRect, getDeckMembers, isLinearDeckGroup) {
    const fallback = getNodeRect(dragNode);
    const members = getDeckMembers?.(dragNode, graph) || [dragNode];
    if (members.length <= 1) return fallback;
    if (!isLinearDeckGroup?.(dragNode, graph, "horizontal") && !isLinearDeckGroup?.(dragNode, graph, "vertical")) return fallback;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    members.forEach((member) => {
        const rect = getNodeRect(member);
        left = Math.min(left, rect.x);
        top = Math.min(top, rect.y);
        right = Math.max(right, rect.x + rect.w);
        bottom = Math.max(bottom, rect.y + rect.h);
    });

    if (![left, top, right, bottom].every(Number.isFinite)) return fallback;
    return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

export function resolveDockTarget({
                                      dragNode,
                                      graph,
                                      options = {},
                                      constants,
                                      utils,
                                  }) {
    if (!dragNode || !graph) return null;

    const {
        DEFAULT_DECK_RADIUS,
        DEFAULT_DECK_GHOST_THICKNESS,
    } = constants;

    const {
        isFiniteNumber,
        getNodeRect,
        isClosedDeckTarget,
        isWithinDeckSearchRadius,
        getDeckNodes,
        getDeckMembers,
        isLinearDeckGroup,
        getDeckSideDistance,
        getDeckGhostRect,
        getRectEdgeLine,
        getDeckAttachLeaderForSide,
        isDeckPressureHub,
        canDeckNodeToLeader,
        dockDebugLog,
    } = utils;

    const radius = isFiniteNumber(options.radius) ? options.radius : DEFAULT_DECK_RADIUS;
    const dragRect = getLinearDragRect(dragNode, graph, getNodeRect, getDeckMembers, isLinearDeckGroup);
    dockDebugLog("findDeckTarget:start", {
        dragNodeId: dragNode.id,
        radius,
        dragRect,
    });
    const coarseRadius = Math.max(radius + 8, radius);
    const lockedSide = options.lockedSide || null;
    const lockedHoverNodeId = options.lockedHoverNodeId ?? null;
    const draggedMemberIds = new Set((getDeckMembers?.(dragNode, graph) || [dragNode])
        .map((node) => node?.id)
        .filter((id) => id !== null && id !== undefined));
    const candidates = getDeckNodes(graph).filter((node) => {
        if (draggedMemberIds.has(node.id)) return false;
        if (!isClosedDeckTarget(node)) return false;
        if (lockedHoverNodeId !== null && lockedHoverNodeId !== undefined && node.id !== lockedHoverNodeId) return false;
        const hoverHub = utils.getDeckPressureHubForNode?.(node, graph) || node;
        const searchRect = isDeckPressureHub?.(hoverHub) && utils.getDeckPressureFrameRect
            ? utils.getDeckPressureFrameRect(hoverHub, graph)
            : getNodeRect(node);
        if (!isWithinDeckSearchRadius(dragRect, searchRect, coarseRadius)) return false;
        return true;
    });
    dockDebugLog("findDeckTarget:candidates", {
        dragNodeId: dragNode.id,
        radius,
        coarseRadius,
        count: candidates.length,
        ids: candidates.map((n) => n.id),
    });

    if (candidates.length === 0) {
        dockDebugLog("findDeckTarget:no-candidates", { dragNodeId: dragNode.id, radius });
        return null;
    }

    let bestNode = null;
    let bestDistance = Infinity;
    let bestEdge = null;
    let bestInvalid = null;
    let bestHoverNodeId = null;

    candidates.forEach((node) => {
        const hoverHub = utils.getDeckPressureHubForNode?.(node, graph) || node;
        const pressureFrameRect = isDeckPressureHub?.(hoverHub) && utils.getDeckPressureFrameRect
            ? utils.getDeckPressureFrameRect(hoverHub, graph)
            : null;
        const nodeRect = pressureFrameRect || getNodeRect(node);
        const sideDistances = ["left", "right", "top", "bottom"].map((sideKey) => ({
            side: sideKey,
            distance: getDeckSideDistance(dragRect, nodeRect, sideKey),
        }));

        const chosen = sideDistances
            .filter((entry) => (lockedSide ? entry.side === lockedSide : true))
            .sort((a, b) => a.distance - b.distance)[0] || null;

        const side = chosen?.side || null;
        const dist = chosen?.distance ?? Infinity;
        if (!side || !isFiniteNumber(dist) || dist > radius) return;

        const attachLeader = getDeckAttachLeaderForSide(hoverHub, side, graph);
        if (!attachLeader) return;

        const hoverRect = pressureFrameRect || nodeRect;
        const attachRect = pressureFrameRect || getNodeRect(attachLeader);
        const usePressureFrameSpan = !!pressureFrameRect;
        const edge = {
            side,
            distance: dist,
            ghost: getDeckGhostRect(
                side,
                dragRect,
                attachRect,
                isFiniteNumber(options.ghostThickness) ? options.ghostThickness : DEFAULT_DECK_GHOST_THICKNESS,
                { matchTargetSpan: usePressureFrameSpan },
            ),
            hoverGhost: getDeckGhostRect(
                side,
                dragRect,
                hoverRect,
                isFiniteNumber(options.ghostThickness) ? options.ghostThickness : DEFAULT_DECK_GHOST_THICKNESS,
                { matchTargetSpan: usePressureFrameSpan },
            ),
            hoverEdgeLine: getRectEdgeLine(side, hoverRect),
        };

        const canDock = canDeckNodeToLeader(dragNode, hoverHub, graph, side);
        dockDebugLog("candidate", {
            dragNodeId: dragNode.id,
            hoverNodeId: node.id,
            hubNodeId: hoverHub.id,
            attachLeaderId: attachLeader.id,
            side,
            chosenDistance: dist,
            canDock,
        });

        if (!canDock) {
            if (!bestInvalid || dist < bestInvalid.distance) {
                bestInvalid = {
                    targetNode: null,
                    distance: dist,
                    edge,
                    ghost: edge.ghost || null,
                    hoverGhost: edge.hoverGhost || null,
                    hoverNodeId: node.id,
                    valid: false,
                };
            }
            return;
        }

        if (dist < bestDistance) {
            bestNode = hoverHub;
            bestDistance = dist;
            bestEdge = edge;
            bestHoverNodeId = node.id;
        }
    });

    dockDebugLog("best target", {
        dragNodeId: dragNode.id,
        bestNodeId: bestNode?.id || null,
        bestSide: bestEdge?.side || null,
        bestDistance,
    });

    if (!bestNode) {
        dockDebugLog("findDeckTarget:no-valid-target", { dragNodeId: dragNode.id });
        return bestInvalid;
    }

    return {
        targetNode: bestNode,
        hoverNodeId: bestHoverNodeId,
        distance: bestDistance,
        edge: bestEdge,
        ghost: bestEdge?.ghost || null,
        hoverGhost: bestEdge?.hoverGhost || null,
        valid: true,
    };
}
