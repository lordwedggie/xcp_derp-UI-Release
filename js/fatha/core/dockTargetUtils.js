export function isFiniteNumber(v) {
    return typeof v === "number" && Number.isFinite(v);
}

export function getDeckGhostRect(side, drag, target, ghostThickness) {
    if (side === "left") return { x: target.x - drag.w, y: target.y, w: drag.w, h: drag.h };
    if (side === "right") return { x: target.x + target.w, y: target.y, w: drag.w, h: drag.h };
    if (side === "top") return { x: target.x, y: target.y - drag.h, w: drag.w, h: drag.h };
    if (side === "bottom") return { x: target.x, y: target.y + target.h, w: drag.w, h: drag.h };
    return { x: target.x, y: target.y, w: Math.max(drag.w, ghostThickness), h: Math.max(drag.h, ghostThickness) };
}

export function getDeckSideDistance(dragRect, targetRect, side) {
    if (!dragRect || !targetRect || !side) return Infinity;
    if (side === "left") return Math.abs((dragRect.x + dragRect.w) - targetRect.x);
    if (side === "right") return Math.abs(dragRect.x - (targetRect.x + targetRect.w));
    if (side === "top") return Math.abs((dragRect.y + dragRect.h) - targetRect.y);
    if (side === "bottom") return Math.abs(dragRect.y - (targetRect.y + targetRect.h));
    return Infinity;
}

export function getRectEdgeLine(side, rect) {
    if (!side || !rect) return null;
    if (side === "left") return { x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.h };
    if (side === "right") return { x1: rect.x + rect.w, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h };
    if (side === "top") return { x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y };
    if (side === "bottom") return { x1: rect.x, y1: rect.y + rect.h, x2: rect.x + rect.w, y2: rect.y + rect.h };
    return null;
}

export function isWithinDeckSearchRadius(dragRect, targetRect, radius) {
    const dragLeft = dragRect.x;
    const dragRight = dragRect.x + dragRect.w;
    const dragTop = dragRect.y;
    const dragBottom = dragRect.y + dragRect.h;
    const targetLeft = targetRect.x;
    const targetRight = targetRect.x + targetRect.w;
    const targetTop = targetRect.y;
    const targetBottom = targetRect.y + targetRect.h;

    if (targetLeft > dragRight + radius) return false;
    if (targetRight < dragLeft - radius) return false;
    if (targetTop > dragBottom + radius) return false;
    if (targetBottom < dragTop - radius) return false;
    return true;
}

export function getGhostContactSide(side) {
    if (side === "left") return "right";
    if (side === "right") return "left";
    if (side === "top") return "bottom";
    if (side === "bottom") return "top";
    return side;
}

export function drawDeckGhost(ctx, ghost, options = {}) {
    if (!ctx || !ghost) return;

    const fill = options.fill || "rgba(120, 200, 255, 0.18)";
    const stroke = options.stroke || "rgba(120, 200, 255, 0.9)";
    const edgeValid = options.valid !== false;
    const edgeStroke = edgeValid
        ? (options.edgeStrokeValid || "rgba(56, 202, 90, 0.95)")
        : (options.edgeStrokeInvalid || "rgba(255, 149, 0, 0.95)");
    const edgeLineWidth = isFiniteNumber(options.edgeLineWidth) ? options.edgeLineWidth : 4;
    const side = options.side || null;
    const targetEdgeLine = options.targetEdgeLine || null;
    const lineWidth = isFiniteNumber(options.lineWidth) ? options.lineWidth : 2;

    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.fillRect(ghost.x, ghost.y, ghost.w, ghost.h);
    ctx.strokeRect(ghost.x, ghost.y, ghost.w, ghost.h);

    if (side) {
        ctx.strokeStyle = edgeStroke;
        ctx.lineWidth = edgeLineWidth;
        ctx.beginPath();
        if (side === "left") {
            ctx.moveTo(ghost.x, ghost.y);
            ctx.lineTo(ghost.x, ghost.y + ghost.h);
        } else if (side === "right") {
            ctx.moveTo(ghost.x + ghost.w, ghost.y);
            ctx.lineTo(ghost.x + ghost.w, ghost.y + ghost.h);
        } else if (side === "top") {
            ctx.moveTo(ghost.x, ghost.y);
            ctx.lineTo(ghost.x + ghost.w, ghost.y);
        } else if (side === "bottom") {
            ctx.moveTo(ghost.x, ghost.y + ghost.h);
            ctx.lineTo(ghost.x + ghost.w, ghost.y + ghost.h);
        }
        ctx.stroke();
    }

    if (targetEdgeLine) {
        ctx.strokeStyle = edgeStroke;
        ctx.lineWidth = edgeLineWidth;
        ctx.beginPath();
        ctx.moveTo(targetEdgeLine.x1, targetEdgeLine.y1);
        ctx.lineTo(targetEdgeLine.x2, targetEdgeLine.y2);
        ctx.stroke();
    }
    ctx.restore();
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
