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
        getDeckSideDistance,
        getDeckGhostRect,
        getRectEdgeLine,
        getDeckAttachLeaderForSide,
        canDeckNodeToLeader,
        dockDebugLog,
    } = utils;

    const radius = isFiniteNumber(options.radius) ? options.radius : DEFAULT_DECK_RADIUS;
    const dragRect = getNodeRect(dragNode);
    dockDebugLog("findDeckTarget:start", {
        dragNodeId: dragNode.id,
        radius,
        dragRect,
    });
    const coarseRadius = Math.max(radius + 8, radius);
    const lockedSide = options.lockedSide || null;
    const lockedHoverNodeId = options.lockedHoverNodeId ?? null;
    const candidates = getDeckNodes(graph).filter((node) => {
        if (node.id === dragNode.id) return false;
        if (!isClosedDeckTarget(node)) return false;
        if (lockedHoverNodeId !== null && lockedHoverNodeId !== undefined && node.id !== lockedHoverNodeId) return false;
        if (!isWithinDeckSearchRadius(dragRect, getNodeRect(node), coarseRadius)) return false;
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
        const nodeRect = getNodeRect(node);
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

        const attachLeader = getDeckAttachLeaderForSide(node, side, graph);
        if (!attachLeader) return;

        const hoverRect = nodeRect;
        const attachRect = getNodeRect(attachLeader);
        const edge = {
            side,
            distance: dist,
            ghost: getDeckGhostRect(
                side,
                dragRect,
                attachRect,
                isFiniteNumber(options.ghostThickness) ? options.ghostThickness : DEFAULT_DECK_GHOST_THICKNESS,
            ),
            hoverGhost: getDeckGhostRect(
                side,
                dragRect,
                hoverRect,
                isFiniteNumber(options.ghostThickness) ? options.ghostThickness : DEFAULT_DECK_GHOST_THICKNESS,
            ),
            hoverEdgeLine: getRectEdgeLine(side, hoverRect),
        };

        const canDock = canDeckNodeToLeader(dragNode, attachLeader, graph, side);
        dockDebugLog("candidate", {
            dragNodeId: dragNode.id,
            hoverNodeId: node.id,
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
            bestNode = attachLeader;
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
