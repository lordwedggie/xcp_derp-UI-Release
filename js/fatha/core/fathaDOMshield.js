/**
 * Path: ./js/fatha/core/fathaDOMshield.js
 * ROLE: The invisible ninja force-field that protects your node from the scary canvas.
 * * WHAT IS HAPPENING HERE:
 * Think of this as a giant piece of transparent plastic wrap we slap over your node
 * so the ComfyUI canvas can't touch it. This code creates
 * a 'Shield' (a hidden DIV) that sits perfectly on top of your node and kidnaps all
 * your mouse clicks, drags, and scrolls before they can trigger standard canvas
 * behavior.
 * * It does a bunch of frantic math to translate 'Where is the mouse on my monitor?'
 * into 'Where is the mouse on this specific button?' so your node doesn't get
 * confused. It also manages that tiny 'resize handle' in
 * the corner and forces the cursor to look like a little mover-thingy when you're
 * dragging. If you turn on Hitbox Debugging, the shield
 * stops being shy and shows you its true form as a collection of angry red
 * rectangles. It's basically a professional middleman that
 * keeps your node's custom UI from getting bullied by the background.
 */
import { app } from "../../../../scripts/app.js";
import { renderHitboxDebug } from "../helpers/debugPainter.js";
import { computeDeckPressureGeometryPlan, getDeckMembers, getDeckPressureBranchMembers, getDeckPressureBranchSideForNode, getDeckPressureBranchAxis, getDeckPressureHubForNode, getNodeOnDeckEdge, isDeckPressureHub, isDeckPressureSideHorizontalBranchMember, isDeckPressureSideHorizontalHubEdge, isDeckPressureSideWidthResizeEdge, isLinearDeckGroup } from "./masterDockEngine.js";
import { canResizeHorizontalSharedEdgeWidth as canResizeHorizontalSharedEdge, canResizeHorizontalStackWidth, getHorizontalSameRowNeighbor } from "./dockResizeSharedEdges.js";
import { beginDeckResizeOptimization, clearEntityTooltip, endDeckResizeOptimization, isSystemButtonHit } from "./fathaHandler.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import { MASTER_Z, promoteMasterZ } from "./masterZ.js";
import { isComfyVueNodesMode } from "./fathaNode2Compat.js";
import { handleContentViewportWheel, mapShieldPointThroughContentViewport, tryStartContentViewportScrollbarDrag } from "./fathaContentViewportShield.js";

// DEBUG_MODE is now dynamically handled via node.properties.debugMode
const CORNER_RESIZE_ANCHORS = new Set(["top-left", "top-right", "bottom-left", "bottom-right"]);
const SHIELD_CORNER_RESIZE_OUTWARD_PAD = 5;
const SHIELD_HITBOX_DEBUG_FLAG = "xcpDerpDebugShieldHitboxes";

function isCornerResizeAnchor(anchor) {
    return CORNER_RESIZE_ANCHORS.has(anchor);
}

function isDeckPressureBranchMember(node, graph) {
    const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
    return !!(pressureHub && pressureHub.id !== node?.id);
}

function getNodeResizeCornerPoint(node, anchor) {
    const x = Number(node?.pos?.[0]) || 0;
    const y = Number(node?.pos?.[1]) || 0;
    const w = Number(node?.size?.[0] ?? node?.properties?.nodeSize?.[0]) || 0;
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
    if (anchor === "top-left") return { x, y };
    if (anchor === "top-right") return { x: x + w, y };
    if (anchor === "bottom-left") return { x, y: y + h };
    if (anchor === "bottom-right") return { x: x + w, y: y + h };
    return null;
}

function getDeckPressureFrameBounds(hub, graph) {
    if (!hub || !graph) return null;
    const plan = computeDeckPressureGeometryPlan(hub, graph);
    return plan?.frame ? { left: plan.frame.left, top: plan.frame.top, right: plan.frame.right, bottom: plan.frame.bottom } : null;
}

function isDeckPressureFrameCorner(node, graph, anchor) {
    if (!isCornerResizeAnchor(anchor)) return false;
    const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
    if (!pressureHub) return false;
    const point = getNodeResizeCornerPoint(node, anchor);
    const bounds = getDeckPressureFrameBounds(pressureHub, graph);
    if (!point || !bounds) return false;
    const tolerance = 1;
    const matchesLeft = Math.abs(point.x - bounds.left) <= tolerance;
    const matchesRight = Math.abs(point.x - bounds.right) <= tolerance;
    const matchesTop = Math.abs(point.y - bounds.top) <= tolerance;
    const matchesBottom = Math.abs(point.y - bounds.bottom) <= tolerance;
    if (anchor === "top-left") return matchesLeft && matchesTop;
    if (anchor === "top-right") return matchesRight && matchesTop;
    if (anchor === "bottom-left") return matchesLeft && matchesBottom;
    if (anchor === "bottom-right") return matchesRight && matchesBottom;
    return false;
}

function isDeckPressureHubSeamSideEdge(node, graph, side) {
    if (side !== "left" && side !== "right") return false;
    const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
    if (!pressureHub) return false;
    if (pressureHub.id === node?.id) return getDeckPressureBranchMembers(pressureHub, graph, side).length > 0;
    return isDeckPressureSideWidthResizeEdge(node, graph, side);
}

function getNodeGraphRect(node) {
    if (!node) return null;
    const x = Number(node.pos?.[0]) || 0;
    const y = Number(node.pos?.[1]) || 0;
    const w = Number(node.size?.[0] ?? node.properties?.nodeSize?.[0]) || 0;
    const h = Number(node.size?.[1] ?? node.properties?.nodeSize?.[1]) || 0;
    return { x, y, w, h, right: x + w, bottom: y + h };
}

function resolveDeckPressureSideSeam(node, graph, side) {
    if (side !== "left" && side !== "right") return null;
    const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
    if (!pressureHub) return null;
    if (pressureHub.id === node?.id) {
        return getDeckPressureBranchMembers(pressureHub, graph, side).length > 0 ? { hub: pressureHub, branchSide: side } : null;
    }
    const directBranchSide = getDeckPressureBranchSideForNode(pressureHub, graph, node);
    if (isDeckPressureSideWidthResizeEdge(node, graph, side)) return { hub: pressureHub, branchSide: directBranchSide };
    const nodeRect = getNodeGraphRect(node);
    if (!nodeRect) return null;
    const edgeX = side === "left" ? nodeRect.x : nodeRect.right;
    for (const branchSide of ["left", "right"]) {
        const branchMembers = getDeckPressureBranchMembers(pressureHub, graph, branchSide);
        if (!branchMembers.length) continue;
        const targetX = branchSide === "left" ? (Number(pressureHub.pos?.[0]) || 0) : (Number(pressureHub.pos?.[0]) || 0) + (Number(pressureHub.size?.[0] ?? pressureHub.properties?.nodeSize?.[0]) || 0);
        if (Math.abs(edgeX - targetX) <= 4) return { hub: pressureHub, branchSide };
    }
    return null;
}

function getDeckPressureHubSeamResizeTarget(node, graph, anchor) {
    if (!isDeckPressureHub(node) || (anchor !== "left" && anchor !== "right")) return null;
    const branchSide = anchor;
    const branchMembers = getDeckPressureBranchMembers(node, graph, branchSide);
    const branchAxis = getDeckPressureBranchAxis(node, graph, branchSide);
    if (branchAxis !== "vertical" && branchAxis !== "horizontal") return null;
    const target = branchAxis === "horizontal"
        ? branchMembers.reduce((best, member) => {
            if (!best) return member;
            const memberX = Number(member?.pos?.[0]) || 0;
            const bestX = Number(best?.pos?.[0]) || 0;
            return branchSide === "left" ? (memberX > bestX ? member : best) : (memberX < bestX ? member : best);
        }, null)
        : (branchMembers[0] || null);
    if (!target) return null;
    return {
        node: target,
        anchor: branchSide === "left" ? "right" : "left",
    };
}

function getDeckPressureSideSeamResizeTarget(node, graph, anchor) {
    const seam = resolveDeckPressureSideSeam(node, graph, anchor);
    if (!seam) return null;
    if (isDeckPressureHub(node)) return getDeckPressureHubSeamResizeTarget(node, graph, anchor);
    const branchMembers = getDeckPressureBranchMembers(seam.hub, graph, seam.branchSide);
    const branchAxis = getDeckPressureBranchAxis(seam.hub, graph, seam.branchSide);
    const targetAnchor = seam.branchSide === "left" ? "right" : "left";
    const target = branchAxis === "horizontal"
        ? branchMembers.reduce((best, member) => {
            if (!best) return member;
            const memberX = Number(member?.pos?.[0]) || 0;
            const bestX = Number(best?.pos?.[0]) || 0;
            return seam.branchSide === "left" ? (memberX > bestX ? member : best) : (memberX < bestX ? member : best);
        }, null)
        : (branchMembers[0] || null);
    return target ? { node: target, anchor: targetAnchor } : null;
}

export function createDerpShield(node) {
    if (node.interactionShield) return;

    const shield = document.createElement("div");

    shield.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        z-index: 5;
        background: transparent;
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        cursor: default;
        transition: box-shadow 0.2s ease, filter 0.2s ease;
    `;

    // Resize Handle
    const SHIELD_BOTTOM_CORNER_HITBOX_PX = 9;
    const SHIELD_TOP_CORNER_HITBOX_PX = 10;
    const resizeHandle = document.createElement("div");
    resizeHandle.style.cssText = `
        position: absolute;
        right: 0;
        bottom: 0;
        width: ${SHIELD_BOTTOM_CORNER_HITBOX_PX}px;
        height: ${SHIELD_BOTTOM_CORNER_HITBOX_PX}px;
        cursor: nwse-resize;
        z-index: 10;
        background: transparent;
    `;
    shield.appendChild(resizeHandle);

    const resizeHandleLeft = document.createElement("div");
    resizeHandleLeft.style.cssText = `
        position: absolute;
        left: 0;
        bottom: 0;
        width: ${SHIELD_BOTTOM_CORNER_HITBOX_PX}px;
        height: ${SHIELD_BOTTOM_CORNER_HITBOX_PX}px;
        cursor: nesw-resize;
        z-index: 10;
        background: transparent;
    `;
    shield.appendChild(resizeHandleLeft);

    const resizeHandleTopLeft = document.createElement("div");
    resizeHandleTopLeft.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: ${SHIELD_TOP_CORNER_HITBOX_PX}px;
        height: ${SHIELD_TOP_CORNER_HITBOX_PX}px;
        cursor: nwse-resize;
        z-index: 10;
        background: transparent;
    `;
    shield.appendChild(resizeHandleTopLeft);

    const resizeHandleTopRight = document.createElement("div");
    resizeHandleTopRight.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        width: ${SHIELD_TOP_CORNER_HITBOX_PX}px;
        height: ${SHIELD_TOP_CORNER_HITBOX_PX}px;
        cursor: nesw-resize;
        z-index: 10;
        background: transparent;
    `;
    shield.appendChild(resizeHandleTopRight);

    const resizeHandleSharedLeft = document.createElement("div");
    resizeHandleSharedLeft.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 10px;
        height: 100%;
        cursor: ew-resize;
        z-index: 30;
        background: transparent;
        display: none;
        pointer-events: none;
    `;
    shield.appendChild(resizeHandleSharedLeft);

    const resizeHandleSharedRight = document.createElement("div");
    resizeHandleSharedRight.style.cssText = `
        position: absolute;
        right: 0;
        top: 0;
        width: 10px;
        height: 100%;
        cursor: ew-resize;
        z-index: 30;
        background: transparent;
        display: none;
        pointer-events: none;
    `;
    shield.appendChild(resizeHandleSharedRight);

    // THE FIX: Store a reference so we can dynamically adjust its offsets during zoom
    shield._resizeHandle = resizeHandle;
    shield._resizeHandleLeft = resizeHandleLeft;
    shield._resizeHandleTopLeft = resizeHandleTopLeft;
    shield._resizeHandleTopRight = resizeHandleTopRight;
    shield._resizeHandleSharedLeft = resizeHandleSharedLeft;
    shield._resizeHandleSharedRight = resizeHandleSharedRight;

    if (node.type === "xcpDerpSignalOut") {
        const linkHandleLayer = document.createElement("div");
        linkHandleLayer.style.cssText = `
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 20;
        `;
        shield.appendChild(linkHandleLayer);
        shield._signalOutLinkHandleLayer = linkHandleLayer;
        shield._signalOutLinkHandles = [];
    }


    // --- STATE ---
    let startMouseX = 0, startMouseY = 0;
    let isResizing = false;
    let longPressed = false, holdTimer = null;
    let pendingNodeHoldDrag = false;
    let lastClickTime = 0; // THE FIX: Track manual double clicks
    let activeResizeHandle = null;
    let activeResizePointerId = null;
    let activeResizeNode = node;

    // --- HELPERS ---
    const getLocalCoords = (e, targetNode = node) => {
        const rect = app.canvas.canvas.getBoundingClientRect();
        const ds = app.canvas.ds;
        const canvasX = (e.clientX - rect.left) / ds.scale - ds.offset[0];
        const canvasY = (e.clientY - rect.top) / ds.scale - ds.offset[1];

        // THE FIX: Do not apply artificial offsets to the mouse pointer.
        // Fatha's GrandFathaLayoutEngine natively handles negative coordinates for the bleed area.
        return {
            x: canvasX - (Number(targetNode?.pos?.[0]) || 0),
            y: canvasY - (Number(targetNode?.pos?.[1]) || 0),
        };
    };

    const getViewportLocalCoords = (e, targetNode = node) => mapShieldPointThroughContentViewport(targetNode, getLocalCoords(e, targetNode));

    const cursorStyleId = "derp-drag-cursor-override";

    // Initialize disabled style tag once
    let cursorStyleTag = document.getElementById(cursorStyleId);
    if (!cursorStyleTag) {
        cursorStyleTag = document.createElement("style");
        cursorStyleTag.id = cursorStyleId;
        cursorStyleTag.disabled = true;
        document.head.appendChild(cursorStyleTag);
    }

    const setVisualActive = (active, cursor = "move") => {
        if (active) {
            cursorStyleTag.innerHTML = `* { cursor: ${cursor} !important; }`;
            cursorStyleTag.disabled = false;
        } else {
            cursorStyleTag.disabled = true;
        }
    };

    const clearDockResizeActiveMembers = (resizeNode) => {
        const activeMembers = resizeNode?._dockResizeActiveMembers;
        const graph = app.graph || resizeNode?.graph || node?.graph || null;
        const clearPressureSession = (member) => {
            const pressureHub = graph && member ? getDeckPressureHubForNode(member, graph) : null;
            if (pressureHub) pressureHub._deckPressureVerticalSeamSession = null;
        };
        clearPressureSession(resizeNode);
        if (activeMembers instanceof Set) {
            activeMembers.forEach((member) => {
                if (!member) return;
                clearPressureSession(member);
                if (member !== resizeNode) member._isDerpResizing = false;
                member._dockResizePreserveHeight = false;
                member._horizontalDeckWidthResizeLock = false;
            });
            activeMembers.clear();
        }
        if (resizeNode) {
            resizeNode._horizontalDeckWidthResizeLock = false;
            resizeNode._dockResizePreserveHeight = false;
            resizeNode._dockResizeActiveMembers = null;
        }
    };

    const cleanup = () => {
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerUp);
        activeResizeHandle?.removeEventListener?.("lostpointercapture", onWindowPointerUp);
        if (activeResizeHandle && activeResizePointerId !== null && activeResizePointerId !== undefined && typeof activeResizeHandle.releasePointerCapture === "function") {
            try { activeResizeHandle.releasePointerCapture(activeResizePointerId); } catch (_) { /* Pointer capture may already be gone. */ }
        }
        activeResizeHandle = null;
        activeResizePointerId = null;
        isResizing = false;
        endDeckResizeOptimization(activeResizeNode);
        clearDockResizeActiveMembers(activeResizeNode);
        activeResizeNode._isDerpResizing = false;
        activeResizeNode._dockResizeSession = null;
        if (activeResizeNode !== node) {
            clearDockResizeActiveMembers(node);
            node._isDerpResizing = false;
            node._dockResizeSession = null;
        }
        activeResizeNode = node;
        if (holdTimer) clearTimeout(holdTimer);
        pendingNodeHoldDrag = false;
        setVisualActive(false);
    };

    const copyPointerProps = (e, type) => {
        return new PointerEvent(type, {
            bubbles: true, cancelable: true, view: window,
            pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY,
            button: e.button, buttons: e.buttons,
            altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey
        });
    };

    const getSignalOutCanvasPointerEvent = (e, type) => {
        const proxy = copyPointerProps(e, type);
        proxy._isProxyEvent = true;
        app.canvas?.adjustMouseEvent?.(proxy);
        return proxy;
    };

    const clientToGraphPos = (clientX, clientY) => {
        const canvas = app.canvas;
        const rect = canvas?.canvas?.getBoundingClientRect?.();
        const ds = canvas?.ds;
        if (!rect || !ds) return null;
        return [
            (clientX - rect.left) / ds.scale - ds.offset[0],
            (clientY - rect.top) / ds.scale - ds.offset[1]
        ];
    };

    const getGraphNodeFromElement = (el) => {
        const nodeEl = el?.closest?.(".lg-node[data-node-id]");
        const nodeId = nodeEl?.dataset?.nodeId;
        if (nodeId === undefined || nodeId === null) return null;
        const graph = app.graph || app.rootGraph || app.canvas?.graph;
        return graph?.getNodeById?.(nodeId) || graph?.getNodeById?.(Number(nodeId)) || null;
    };

    const getSignalOutSlotGraphPos = (slot) => {
        if (!slot?.pos || slot.pos[0] === -1000 || slot.pos[1] === -1000) return null;
        return [node.pos[0] + slot.pos[0], node.pos[1] + slot.pos[1]];
    };

    const forceSignalOutRenderLinkOrigin = (connector, slot) => {
        const origin = getSignalOutSlotGraphPos(slot);
        if (!origin) return;
        for (const link of connector.renderLinks || []) {
            link.fromPos = [origin[0], origin[1]];
        }
    };

    const handleSignalOutLinkPointerDown = (handle, e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        beginSignalOutSlotLinkDrag(e, handle._signalOutSlotIndex);
    };

    const resolveVueInputSlotAtClientPoint = (e, connector) => {
        const elements = document.elementsFromPoint?.(e.clientX, e.clientY) || [];
        for (const el of elements) {
            const slotEl = el.closest?.(".lg-slot--input");
            if (!slotEl) continue;
            const nativeNode = slotEl.closest?.(".lg-node[data-node-id]");
            const targetNode = getGraphNodeFromElement(slotEl);
            if (!nativeNode || !targetNode?.inputs) continue;

            const inputSlots = Array.from(nativeNode.querySelectorAll(".lg-slot--input"));
            const inputIndex = inputSlots.indexOf(slotEl);
            const input = targetNode.inputs[inputIndex];
            if (!input) continue;
            if (connector && !connector.isInputValidDrop(targetNode, input)) continue;

            const dot = slotEl.querySelector("[data-testid='slot-dot']") || slotEl.querySelector("[data-testid='slot-connection-dot']");
            const rect = dot?.getBoundingClientRect?.() || slotEl.getBoundingClientRect?.();
            const center = rect ? clientToGraphPos(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
            if (!center) continue;
            return { node: targetNode, input, inputIndex, pos: center };
        }
        return null;
    };

    const resolveLegacyInputSlotAtClientPoint = (e, connector) => {
        const graph = node.graph || app.graph || app.rootGraph || app.canvas?.graph;
        const pointer = clientToGraphPos(e.clientX, e.clientY);
        if (!graph?._nodes || !pointer) return null;

        let best = null;
        let bestDist = Infinity;
        const SNAP_RADIUS = 24;

        for (const targetNode of graph._nodes) {
            if (!targetNode || targetNode === node || !targetNode.inputs?.length) continue;

            for (let inputIndex = 0; inputIndex < targetNode.inputs.length; inputIndex++) {
                const input = targetNode.inputs[inputIndex];
                if (!input) continue;
                if (connector && !connector.isInputValidDrop(targetNode, input)) continue;

                const pos = targetNode.getConnectionPos?.(true, inputIndex);
                if (!pos) continue;

                const dx = pos[0] - pointer[0];
                const dy = pos[1] - pointer[1];
                const dist = Math.hypot(dx, dy);
                if (dist > SNAP_RADIUS || dist >= bestDist) continue;

                bestDist = dist;
                best = { node: targetNode, input, inputIndex, pos: [pos[0], pos[1]] };
            }
        }

        return best;
    };

    const resolveInputSlotAtClientPoint = (e, connector) => {
        if (isComfyVueNodesMode()) return resolveVueInputSlotAtClientPoint(e, connector);
        return resolveLegacyInputSlotAtClientPoint(e, connector);
    };

    const syncCanvasPointerState = (e, snapPos = null) => {
        const canvas = app.canvas;
        if (!canvas) return null;
        const proxy = getSignalOutCanvasPointerEvent(e, e.type || "pointermove");
        canvas.mouse[0] = e.clientX;
        canvas.mouse[1] = e.clientY;
        canvas.graph_mouse[0] = proxy.canvasX;
        canvas.graph_mouse[1] = proxy.canvasY;
        canvas.linkConnector.state.snapLinksPos = snapPos || [proxy.canvasX, proxy.canvasY];
        canvas.setDirty?.(true, true);
        return proxy;
    };

    const clearBrowserSelection = () => {
        const sel = window.getSelection?.();
        if (!sel) return;
        try {
            sel.removeAllRanges();
        } catch (_) {}
    };

    const beginSignalOutSlotLinkDrag = (e, slotIndex = null) => {
        if (node.type !== "xcpDerpSignalOut") return false;
        const canvas = app.canvas;
        const graph = node.graph || app.graph || app.rootGraph || canvas?.graph;
        const connector = canvas?.linkConnector;
        const output = Number.isInteger(slotIndex) ? node.outputs?.[slotIndex] : null;
        if (!canvas || !graph || !connector || !output) return false;

        if (connector.isConnecting) connector.reset?.(true);

        try {
            if (e.shiftKey && (output.links?.length || output._floatingLinks?.size)) {
                connector.moveOutputLink(graph, output);
            } else {
                connector.dragNewFromOutput(graph, node, output);
            }
        } catch (_) {
            return false;
        }

        forceSignalOutRenderLinkOrigin(connector, output);
        syncCanvasPointerState(e);
        let validTarget = null;

        const onLinkMove = (moveEvent) => {
            if (moveEvent.pointerId !== e.pointerId) return;
            validTarget = resolveInputSlotAtClientPoint(moveEvent, connector);
            app.canvas._highlight_pos = validTarget?.pos;
            app.canvas._highlight_input = validTarget?.input;
            forceSignalOutRenderLinkOrigin(connector, output);
            syncCanvasPointerState(moveEvent, validTarget?.pos || null);
        };

        const finishLinkDrag = (upEvent) => {
            if (upEvent.pointerId !== e.pointerId) return;
            window.removeEventListener("pointermove", onLinkMove, true);
            window.removeEventListener("pointerup", finishLinkDrag, true);
            window.removeEventListener("pointercancel", finishLinkDrag, true);
            validTarget = resolveInputSlotAtClientPoint(upEvent, connector) || validTarget;
            const proxyUp = syncCanvasPointerState(upEvent, validTarget?.pos || null) || getSignalOutCanvasPointerEvent(upEvent, "pointerup");
            forceSignalOutRenderLinkOrigin(connector, output);
            if (connector.isConnecting && validTarget?.node && validTarget?.input) {
                connector._dropOnInput?.(validTarget.node, validTarget.input);
            } else if (connector.isConnecting) {
                connector.dropLinks(graph, proxyUp);
            }
            app.canvas._highlight_pos = undefined;
            app.canvas._highlight_input = undefined;
            connector.state.snapLinksPos = undefined;
            connector.reset?.(true);
            canvas.setDirty?.(true, true);
        };

        window.addEventListener("pointermove", onLinkMove, true);
        window.addEventListener("pointerup", finishLinkDrag, true);
        window.addEventListener("pointercancel", finishLinkDrag, true);
        return true;
    };
    shield._beginSignalOutSlotLinkDrag = beginSignalOutSlotLinkDrag;

    const ensureSignalOutLinkHandle = (slotIndex) => {
        if (!shield._signalOutLinkHandleLayer) return null;
        if (!shield._signalOutLinkHandles[slotIndex]) {
            const handle = document.createElement("div");
            handle.style.cssText = `
                position: absolute;
                width: 24px;
                height: 24px;
                transform: translate(-12px, -12px);
                pointer-events: auto;
                cursor: crosshair;
                background: transparent;
                z-index: 1;
            `;
            handle._signalOutSlotIndex = slotIndex;
            handle.onpointerdown = (e) => handleSignalOutLinkPointerDown(handle, e);
            shield._signalOutLinkHandleLayer.appendChild(handle);
            shield._signalOutLinkHandles[slotIndex] = handle;
        }
        return shield._signalOutLinkHandles[slotIndex];
    };
    shield._ensureSignalOutLinkHandle = ensureSignalOutLinkHandle;

    // --- HANDLERS ---
    const onWindowPointerMove = (e) => {
        if (e._isProxyEvent || e.buttons === 0) { onWindowPointerUp(e); return; }

        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;

        // MODE 1: RESIZING (Delegate to Node)
        if (isResizing) {
            activeResizeNode.handleShieldInteraction("resize", {
                dx,
                dy,
                resizeAnchor: activeResizeNode._resizeAnchor || "bottom-right"
            });
            return;
        }

        // MODE 2: DRAGGING (Delegate to Node)
        if (longPressed) {
            const localPos = getViewportLocalCoords(e);
            const rect = shield.getBoundingClientRect();
            node.handleShieldInteraction("drag", {
                dx, dy,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: localPos.x,
                localY: localPos.y,
                originalEvent: e
            });
            return;
        }

        // MODE 2.5: Node-local hold drag is armed, but not active yet.
        // Keep feeding drag events into the node so helpers like stack DnD
        // can advance their own hold/threshold logic without letting the
        // canvas start panning underneath.
        if (pendingNodeHoldDrag) {
            const localPos = getViewportLocalCoords(e);
            const rect = shield.getBoundingClientRect();
            node.handleShieldInteraction("drag", {
                dx, dy,
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: localPos.x,
                localY: localPos.y,
                originalEvent: e
            });

            if (node._dragThresholdMet) {
                pendingNodeHoldDrag = false;
                longPressed = true;
                app.canvas.dragging_canvas = false;
                setVisualActive(true);
                return;
            }

            const holdWasCancelled = !!node._dragTrig?.holdOnly && !!node._dragTrig?.holdCancelled;
            if (holdWasCancelled) {
                pendingNodeHoldDrag = false;

                // Hold-based DnD was invalidated by pointer movement, so this
                // gesture should fall through to normal canvas pan/drag.
                const canvasRect = app.canvas.canvas.getBoundingClientRect();
                app.canvas.last_mouse = [e.clientX - canvasRect.left, e.clientY - canvasRect.top];
                app.canvas.dragging_canvas = true;
            } else {
                return;
            }
        }

        // MODE 3: PASS-THROUGH (Standard Canvas Drag)
        if (holdTimer && Math.hypot(dx, dy) > 5) {
            clearTimeout(holdTimer);
            holdTimer = null;

            // THE FIX: The threshold broke! Sync mouse coordinates EXACTLY now.
            // This prevents LiteGraph from teleporting the canvas to catch up with the first 5px.
            const canvasRect = app.canvas.canvas.getBoundingClientRect();
            app.canvas.last_mouse = [e.clientX - canvasRect.left, e.clientY - canvasRect.top];
            app.canvas.dragging_canvas = true;
        }

        if (holdTimer) {
            // Still in the deadzone: Block LiteGraph from moving the canvas.
            app.canvas.dragging_canvas = false;
        }

        const proxyEvent = copyPointerProps(e, "pointermove");
        proxyEvent._isProxyEvent = true;
        app.canvas.canvas.dispatchEvent(proxyEvent);
    };

    const onWindowPointerUp = (e) => {
        if (e._isProxyEvent) return;

        const movedSignificantly = Math.hypot(e.clientX - startMouseX, e.clientY - startMouseY) > 5;
        const heldStackDrag = !!node._dragThresholdMet;
        cleanup();
        app.canvas.dragging_canvas = false;
        if (app.canvas.node_draged === node) app.canvas.node_draged = null;
        if (app.canvas.moving_node === node) app.canvas.moving_node = null;

        // Select node on click natively
        if (!movedSignificantly && !isResizing && !heldStackDrag) {
            const localPos = getLocalCoords(e);
            const viewportLocalPos = getViewportLocalCoords(e);
            const rect = shield.getBoundingClientRect();

            // Check if node handled the click (e.g., hit a slider). If so, block native selection.
            const handled = node.handleShieldInteraction("click", {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: viewportLocalPos.x,
                localY: viewportLocalPos.y,
                originalEvent: e
            });

            if (!handled) {
                if (!e.shiftKey && !node.selected) app.canvas.deselectAllNodes();
                app.canvas.selectNode(node, e.shiftKey || node.selected);
                app.canvas.current_node = node;
                app.canvas.canvas.focus(); // THE FOCUS FIX: Ensure keyboard events reach the canvas
                promoteMasterZ(node, app.graph || node.graph || null);
            }
        }

        const proxyUp = copyPointerProps(e, "pointerup");
        proxyUp._isProxyEvent = true;
        app.canvas.canvas.dispatchEvent(proxyUp);

        longPressed = false;
        isResizing = false;
        clearDockResizeActiveMembers(node);
        node._isDerpResizing = false;
        node._dockResizeSession = null;

        // THE FIX: Pass coordinate data to prevent 'undefined' errors in the handler
        const viewportLocalPos = getViewportLocalCoords(e);
        node.handleShieldInteraction("dragEnd", {
            x: e.clientX - shield.getBoundingClientRect().left,
            y: e.clientY - shield.getBoundingClientRect().top,
            localX: viewportLocalPos.x,
            localY: viewportLocalPos.y,
            originalEvent: e
        });

        node.setDirtyCanvas(true, true);
    };

    // --- LISTENERS ---
    const startResize = (e, anchor = "bottom-right") => {
        anchor = e.currentTarget?._resizeAnchorOverride || anchor;
        const localPos = getLocalCoords(e);
        const localMouse = [localPos.x, localPos.y];
        const collapseBtn = node.layout?.regions?.btnCollapse;
        const bypassBtn = node.layout?.regions?.btnBypass;
        const isOverProtectedBtn = !!(
            (collapseBtn && node.layout?.hitTest(localMouse, collapseBtn)) ||
            (bypassBtn && node.layout?.hitTest(localMouse, bypassBtn))
        );
        if (isOverProtectedBtn) {
            shield.onpointerdown(e);
            return;
        }

        const graph = app.graph || node.graph || null;
        const pressureFrameCorner = isDeckPressureFrameCorner(node, graph, anchor);
        if (isDeckPressureBranchMember(node, graph) && isCornerResizeAnchor(anchor) && !pressureFrameCorner) {
            shield.onpointerdown(e);
            return;
        }

        e.stopPropagation(); e.preventDefault(); cleanup();
        activeResizeHandle = e.currentTarget || null;
        activeResizePointerId = e.pointerId;
        if (typeof activeResizeHandle?.setPointerCapture === "function" && activeResizePointerId !== undefined) {
            try { activeResizeHandle.setPointerCapture(activeResizePointerId); } catch (_) { /* Pointer capture can fail if the browser already released it. */ }
        }
        app.canvas.canvas.focus(); // THE FOCUS FIX: Ensure keyboard events reach the canvas
        isResizing = true;
        const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
        const routeToPressureHub = pressureHub && pressureHub.id !== node.id && pressureFrameCorner;
        const hubSeamResize = getDeckPressureSideSeamResizeTarget(node, graph, anchor);
        activeResizeNode = hubSeamResize?.node || (routeToPressureHub ? pressureHub : node);
        activeResizeNode._resizeAnchor = hubSeamResize?.anchor || anchor;
        node._dockResizeHoverSession = null;
        activeResizeNode._dockResizeHoverSession = null;
        activeResizeNode._isDerpResizing = true; // THE FIX: Pause Fatha's auto-enforcer during drag
        startMouseX = e.clientX;
        startMouseY = e.clientY; // THE FIX: Capture Y for vertical resizing

        // THE FIX: Sync LiteGraph mouse tracking immediately to prevent scale-induced jumps
        const rect = app.canvas.canvas.getBoundingClientRect();
        app.canvas.last_mouse = [e.clientX - rect.left, e.clientY - rect.top];

        // Notify node to cache start state with proper coordinates to pass the safety guard
        const resizeLocalPos = activeResizeNode === node ? localPos : getLocalCoords(e, activeResizeNode);
        activeResizeNode.handleShieldInteraction("dragStart", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: resizeLocalPos.x,
            localY: resizeLocalPos.y,
            originalEvent: e
        });
        if (isDeckPressureHub(activeResizeNode)) beginDeckResizeOptimization(activeResizeNode, graph);
        promoteMasterZ(activeResizeNode, app.graph || activeResizeNode.graph || null);

        // THE DYNAMIC CURSOR FIX: Determine the global drag cursor based on auto-resize states
        const vars = activeResizeNode.getDerpVars ? activeResizeNode.getDerpVars(activeResizeNode) : { autoWidth: false, autoHeight: false };
        const canW = !vars.autoWidth;
        const canH = !vars.autoHeight;
        const activeAnchor = activeResizeNode._resizeAnchor || anchor;
        const isLeftOrRightCorner = activeAnchor === "top-left" || activeAnchor === "top-right" || activeAnchor === "bottom-left" || activeAnchor === "bottom-right";
        let dragCursor = "default";
        if (activeAnchor === "top" || activeAnchor === "bottom") {
            dragCursor = canH ? "ns-resize" : "default";
        } else if (canW && canH && isLeftOrRightCorner) {
            dragCursor = (activeAnchor === "top-left" || activeAnchor === "bottom-right") ? "nwse-resize" : "nesw-resize";
        } else if (canW) dragCursor = "ew-resize";
        else if (canH) dragCursor = "ns-resize";

        setVisualActive(true, dragCursor);
        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
        window.addEventListener("pointercancel", onWindowPointerUp);
        activeResizeHandle?.addEventListener?.("lostpointercapture", onWindowPointerUp);
    };

    resizeHandle.onpointerdown = (e) => startResize(e, "bottom-right");
    resizeHandleLeft.onpointerdown = (e) => startResize(e, "bottom-left");
    resizeHandleTopLeft.onpointerdown = (e) => startResize(e, "top-left");
    resizeHandleTopRight.onpointerdown = (e) => startResize(e, "top-right");
    resizeHandleSharedLeft.onpointerdown = (e) => startResize(e, "left");
    resizeHandleSharedRight.onpointerdown = (e) => startResize(e, "right");

    const getSharedResizeAnchorAtPointer = (e) => {
        const graph = app.graph || node.graph || null;
        if (!graph || !node.interactionShield) return null;
        const vars = node.getDerpVars ? node.getDerpVars(node) : { mW: 0 };
        const rect = node.interactionShield.getBoundingClientRect();
        const edgeWidth = Math.max(10, Number(vars.mW || 0) * (app.canvas?.ds?.scale || 1));
        const localX = e.clientX - rect.left;
        if (localX <= edgeWidth && resolveDeckPressureSideSeam(node, graph, "left")) return "left";
        if (localX >= rect.width - edgeWidth && resolveDeckPressureSideSeam(node, graph, "right")) return "right";
        if (localX <= edgeWidth && canResizeHorizontalSharedEdge(node, graph, "left")) return "left";
        if (localX >= rect.width - edgeWidth && canResizeHorizontalSharedEdge(node, graph, "right")) return "right";
        return null;
    };

    const updateSharedResizeHoverSession = (e) => {
        const graph = app.graph || node.graph || null;
        const handleAnchor = e.target?._resizeAnchorOverride;
        const anchor = (handleAnchor === "top" || handleAnchor === "bottom") ? handleAnchor : getSharedResizeAnchorAtPointer(e);
        const neighbor = anchor && graph
            ? (anchor === "top" || anchor === "bottom" ? getVerticalSharedResizeNeighbor(node, graph, anchor) : getHorizontalSameRowNeighbor(node, graph, anchor))
            : null;
        const seam = anchor ? resolveDeckPressureSideSeam(node, graph, anchor) : null;
        const next = seam
            ? { side: anchor, entityId: node.id, neighborId: seam.hub.id, hubId: seam.hub.id, branchSide: seam.branchSide, deckPressureSideWidth: true }
            : (neighbor ? { side: anchor, entityId: node.id, neighborId: neighbor.id } : null);
        const prev = node._dockResizeHoverSession || null;
        const changed = (prev?.side || null) !== (next?.side || null)
            || (prev?.neighborId ?? null) !== (next?.neighborId ?? null)
            || (prev?.hubId ?? null) !== (next?.hubId ?? null)
            || (prev?.branchSide ?? null) !== (next?.branchSide ?? null);
        node._dockResizeHoverSession = next;
        if (changed && window.app?.canvas) window.app.canvas.setDirty(true, true);
    };

    shield.onpointerdown = (e) => {
        if (e.button !== 0) return;
        const sharedResizeAnchor = getSharedResizeAnchorAtPointer(e);
        if (sharedResizeAnchor) {
            startResize(e, sharedResizeAnchor);
            return;
        }
        e.stopPropagation(); e.preventDefault(); cleanup();
        promoteMasterZ(node, app.graph || node.graph || null);
        app.canvas.canvas.focus();
        const now = Date.now();
        const isDblClick = (now - lastClickTime) < 300;
        lastClickTime = now;

        startMouseX = e.clientX;
        startMouseY = e.clientY;

        const localPos = getLocalCoords(e);
        if (tryStartContentViewportScrollbarDrag(node, localPos, e, getLocalCoords)) return;
        const viewportLocalPos = getViewportLocalCoords(e);
        const rect = shield.getBoundingClientRect();

        if (isDblClick) {
            node.handleShieldInteraction("dblclick", {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: viewportLocalPos.x,
                localY: viewportLocalPos.y,
                originalEvent: e
            });
            clearBrowserSelection();
            lastClickTime = 0; // Reset
            return;
        }

        // Notify node to cache start state (Passes dual coords to satisfy both core and Custom Sliders)
        const handled = node.handleShieldInteraction("dragStart", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: viewportLocalPos.x,
            localY: viewportLocalPos.y,
            originalEvent: e
        });

        promoteMasterZ(node, app.graph || node.graph || null);

        if (handled) {
            const isPendingHoldDrag = !!node._dragTrig && !node._dragThresholdMet;
            if (isPendingHoldDrag) {
                pendingNodeHoldDrag = true;
                longPressed = false;
                app.canvas.dragging_canvas = false;
            } else if (node.properties?.stickyDrag === true && !node._pressedRegionIsDragHandle) {
                holdTimer = setTimeout(() => {
                    longPressed = true;
                    holdTimer = null;
                    setVisualActive(true);
                }, 500);
            } else {
                longPressed = true;
                app.canvas.dragging_canvas = false;
            }
        } else {
            // THE STICKY GRAB FIX: Read directly from the node's properties instead of a missing global config
            const isSticky = node.properties?.stickyDrag === true;
            if (isSticky) {
                // THE FIX: Do not activate canvas dragging yet. This creates a true deadzone
                // to absorb tiny mouse twitches without shifting the screen.
                holdTimer = setTimeout(() => {
                    longPressed = true;
                    holdTimer = null;
                    setVisualActive(true);
                }, 500);
            } else {
                longPressed = true;
                app.canvas.dragging_canvas = false;
                setVisualActive(true);
            }
        }

        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
    };

    // HOVER DELEGATION
    shield.onpointermove = (e) => {
        updateSharedResizeHoverSession(e);
        const localPos = getViewportLocalCoords(e);
        const rect = shield.getBoundingClientRect();
        // The footer system button can sit under the bottom resize seam div, whose static cursor is ns-resize.
        // That shows the up-down resize glyph over a clickable button, misleading the user into thinking the click
        // won't land (it does). The hover handler in fathaHandler.js already sets the shield's cursor to "pointer"
        // over the system button, but a child element's own cursor beats the parent's. So when the pointer is over
        // the system button, clear the inline cursor on the element actually under the pointer (the seam handle div)
        // so the shield's "pointer" shows through. The seam's own shield-sync owns ns-resize and re-applies it when
        // the pointer moves off the button, so we only ever neutralize here — never restore.
        const targetEl = e.target;
        if (targetEl && targetEl !== shield && isSystemButtonHit(node, [localPos.x, localPos.y], app.canvas?.ds?.scale || 1)) {
            targetEl.style.cursor = "";
        }
        node.handleShieldInteraction("hover", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: localPos.x,
            localY: localPos.y
        });
    };

    shield.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        clearBrowserSelection();
        return false;
    };

    shield.onmouseenter = () => {
        const sliderDragSessionActive =
            node._pressedRegionType === "SLIDER" ||
            node._activeSliderIndex !== null && node._activeSliderIndex !== undefined ||
            node._activeSliderKey !== null && node._activeSliderKey !== undefined;

        if (sliderDragSessionActive) {
            // Avoid one-frame re-enter flicker by skipping enter-time sync churn
            // while slider drag ownership is active.
            return;
        }

        const isBasta = node?.properties?.bastaSingleton !== undefined || node?.properties?.bastaMovalbe !== undefined;
        node._uiHovered = true;
        node._derpAwakeFrames = 5;
        if (!isBasta && !node._skipShieldHoverForceSync) {
            node._forceSync = true;
        }
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
    };
    shield.onmouseleave = () => {
        const sliderDragSessionActive =
            node._pressedRegionType === "SLIDER" ||
            node._activeSliderIndex !== null && node._activeSliderIndex !== undefined ||
            node._activeSliderKey !== null && node._activeSliderKey !== undefined;

        if (sliderDragSessionActive) {
            // Keep hover/interaction ownership stable while dragging a slider,
            // even if pointer temporarily leaves the node shield bounds.
            return;
        }

        const isBasta = node?.properties?.bastaSingleton !== undefined || node?.properties?.bastaMovalbe !== undefined;
        clearEntityTooltip(node, true);
        node._uiHovered = false;
        node._systemBtnHovered = false;
        node._hoveredRegionKey = null; // --- Clear hover key to allow re-entry detection ---
        node._hoveredFieldIndex = null;
        node._dockResizeHoverSession = null;
        if (shield) shield.style.cursor = "default";

        node._derpAwakeFrames = 5;
        if (!isBasta && !node._skipShieldHoverForceSync) {
            node._forceSync = true;
        }
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
    };

    shield.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        const scale = app.canvas?.ds?.scale || 1;
        const mappedContextPoint = mapShieldPointThroughContentViewport(node, { x: e.offsetX / scale, y: e.offsetY / scale });
        const localMouse = [mappedContextPoint.x, mappedContextPoint.y];

        // Right-click on header in vertical dock stack toggles collapse (no title exclusion)
        const headerRegion = node.layout?.regions?.headerRegion;
        const graph = app.graph || node.graph || null;
        const headerCollapseEnabled = window.DERP_GLOBAL_SETTINGS?.verticalDockHeaderCollapse ?? true;
        const collapseAllowed = !isDeckPressureSideHorizontalBranchMember(node, graph);
        if (collapseAllowed && headerCollapseEnabled && headerRegion && node.layout?.hitTest?.(localMouse, headerRegion)) {
            const wasCollapsed = !!node.properties?.contentCollapsed;
            const soundKey = wasCollapsed ? "collapseoff" : "collapseon";
            if (SOUND_INDEX?.[soundKey]) SOUND_INDEX[soundKey]();
            if (typeof node.collapse === "function") {
                node.collapse();
            } else {
                node.properties.contentCollapsed = !node.properties.contentCollapsed;
            }
            node.setDirtyCanvas?.(true, true);
            if (app.graph && app.graph.change) app.graph.change();
            return false;
        }

        const regionEntries = Object.entries(node.layout?.regions || {}).reverse();
        for (const [, reg] of regionEntries) {
            if (!reg || typeof reg.onContextMenu !== "function") continue;
            const isHit = reg.hitTest ? reg.hitTest(localMouse, reg) : node.layout?.hitTest?.(localMouse, reg);
            if (!isHit) continue;
            const customItems = reg.onContextMenu(e, node);
            if (customItems === false) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
                return false;
            }
            if (Array.isArray(customItems) && customItems.length > 0) {
                new LiteGraph.ContextMenu(customItems, { event: e });
                return false;
            }
        }
        app.canvas.selectNode(node);
        app.canvas.current_node = node;
        app.canvas.canvas.focus(); // THE FOCUS FIX: Ensure keyboard events reach the canvas
        promoteMasterZ(node, app.graph || node.graph || null);
        const options = app.canvas.getNodeMenuOptions(node);
        if (options) new LiteGraph.ContextMenu(options, { event: e });
        return false;
    };

    shield.onwheel = (e) => {
        const localPos = getLocalCoords(e);
        if (handleContentViewportWheel(node, localPos, e)) return;
        // THE SCROLL PASS-THROUGH: Only capture wheel input when the hovered
        // region actually has editor overflow to consume. Otherwise let ComfyUI
        // keep the normal canvas zoom behavior.
        if (node._hoveredRegionKey && node._derpScrollOffsets?.[node._hoveredRegionKey] !== undefined) {
            const regionKey = node._hoveredRegionKey;
            const scrollConfig = node._derpScrollConfigs?.[regionKey];
            const maxScroll = scrollConfig && typeof scrollConfig._clampScroll === "function"
                ? Number(scrollConfig._clampScroll()) || 0
                : 0;
            if (!(maxScroll > 0)) {
                app.canvas.canvas.dispatchEvent(new WheelEvent("wheel", e));
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            node._derpScrollOffsets[regionKey] += e.deltaY;

            if (scrollConfig && typeof scrollConfig._clampScroll === "function") {
                scrollConfig._clampScroll();
            } else {
                node._derpScrollOffsets[regionKey] = Math.max(0, node._derpScrollOffsets[regionKey]);
            }
            node.setDirtyCanvas(true);
            return;
        }
        app.canvas.canvas.dispatchEvent(new WheelEvent("wheel", e));
    };

    document.body.appendChild(shield);
    node.interactionShield = shield;
}

function getLinearResizeMembers(node, graph, axis) {
    if (!graph || !node) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === axis) return getDeckPressureBranchMembers(pressureHub, graph, branchSide);
    return isLinearDeckGroup(node, graph, axis) ? getDeckMembers(node, graph) : [];
}

function getVerticalSharedResizeNeighbor(node, graph, anchor) {
    if (anchor !== "top" && anchor !== "bottom") return null;
    const members = getLinearResizeMembers(node, graph, "vertical")
        .filter(Boolean)
        .sort((a, b) => (Number(a.pos?.[1]) || 0) - (Number(b.pos?.[1]) || 0));
    const index = members.findIndex((member) => member?.id === node?.id);
    if (index < 0) return null;
    return anchor === "top" ? members[index - 1] || null : members[index + 1] || null;
}

function disableResizeHandles(shield) {
    [
        shield?._resizeHandle,
        shield?._resizeHandleLeft,
        shield?._resizeHandleTopLeft,
        shield?._resizeHandleTopRight,
        shield?._resizeHandleSharedLeft,
        shield?._resizeHandleSharedRight,
    ].forEach((handle) => {
        if (!handle) return;
        handle.style.display = "none";
        handle.style.pointerEvents = "none";
        handle.style.cursor = "default";
        handle._resizeAnchorOverride = null;
    });
}

function isShieldHitboxDebugEnabled() {
    return !!window?.[SHIELD_HITBOX_DEBUG_FLAG];
}

function ensureShieldDebugRectLayer(shield) {
    if (!shield) return null;
    if (!shield._debugMouseLayer) {
        const layer = document.createElement("div");
        layer.style.cssText = `position:absolute; inset:0; pointer-events:none; z-index:${MASTER_Z.debugHitboxLayer + 1};`;
        shield.appendChild(layer);
        shield._debugMouseLayer = layer;
    }
    return shield._debugMouseLayer;
}

function syncShieldDebugRect(layer, key, rect, color, label) {
    let el = layer.querySelector(`[data-debug-rect="${key}"]`);
    if (!el) {
        el = document.createElement("div");
        el.dataset.debugRect = key;
        el.style.position = "absolute";
        el.style.boxSizing = "border-box";
        el.style.pointerEvents = "none";
        layer.appendChild(el);
        const tag = document.createElement("div");
        tag.dataset.debugRectLabel = "true";
        tag.style.cssText = "position:absolute; left:0; top:100%; padding:1px 3px; background:rgba(0,0,0,0.82); color:white; font:10px/1 monospace; white-space:nowrap;";
        el.appendChild(tag);
    }
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
    el.style.background = color.replace("0.9", "0.18");
    el.style.border = `1px solid ${color}`;
    const tag = el.querySelector("[data-debug-rect-label]");
    if (tag) tag.textContent = `${label} ${Math.round(rect.w)}x${Math.round(rect.h)}`;
}

function getHandleDebugRect(handle) {
    if (!handle || handle.style.display === "none") return null;
    return {
        x: handle.offsetLeft,
        y: handle.offsetTop,
        w: handle.offsetWidth,
        h: handle.offsetHeight,
    };
}

function syncMouseHitboxDebugRects(node, scale) {
    const shield = node?.interactionShield;
    if (!shield) return;
    if (!isShieldHitboxDebugEnabled()) {
        shield._debugMouseLayer?.remove?.();
        shield._debugMouseLayer = null;
        return;
    }
    const layer = ensureShieldDebugRectLayer(shield);
    if (!layer) return;
    layer.innerHTML = "";

    const handles = [
        ["resize-tl", shield._resizeHandleTopLeft, "rgba(255,64,64,0.9)", "resize TL"],
        ["resize-tr", shield._resizeHandleTopRight, "rgba(255,64,64,0.9)", "resize TR"],
        ["resize-bl", shield._resizeHandleLeft, "rgba(255,64,64,0.9)", "resize BL"],
        ["resize-br", shield._resizeHandle, "rgba(255,64,64,0.9)", "resize BR"],
    ];
    for (const [key, handle, color, label] of handles) {
        const rect = getHandleDebugRect(handle);
        if (rect) syncShieldDebugRect(layer, key, rect, color, label);
    }

    const sysBtn = node.layout?.regions?.systemBtn;
    if (sysBtn) {
        const rect = {
            x: (Number(sysBtn.x) || 0) * scale,
            w: Math.min(Number(sysBtn.w) || 32, 32) * scale,
            y: ((Number(sysBtn.y) || 0) - 3) * scale,
            h: (Math.min(Number(sysBtn.h) || 6, 6) + 3) * scale,
        };
        syncShieldDebugRect(layer, "system-btn", rect, "rgba(64,192,255,0.9)", "systemBtn");
    }
}

export function syncDerpShield(node) {
    if (!node.interactionShield) return;
    if (!node.interactionShield._resizeHandleSharedLeft || !node.interactionShield._resizeHandleSharedRight) {
        removeDerpShield(node);
        createDerpShield(node);
        if (!node.interactionShield) return;
    }
    const ds = app.canvas.ds;
    const scale = ds.scale;
    const defaultBottomCornerSize = 9 * scale;
    const defaultTopCornerSize = 10 * scale;

    // THE CONSOLIDATION FIX: Use the padding values calculated and owned by the Uncle prototype
    const padL = node._padL || 0;
    const padR = node._padR || 0;

    const visualW = node.size[0] - padL - padR;
    const visualH = node.size[1];

    // THE REFLOW FIX: Prevent getBoundingClientRect() from thrashing the browser's Main Thread
    // 60 times a second during idle animations (like Fatha's selection pulse).
    const canvasEl = app.canvas.canvas;
    const rect = canvasEl.getBoundingClientRect();
    const edgeState = node.properties?.deckEdges || {};
    const varsForHash = node.getDerpVars ? node.getDerpVars(node) : { autoWidth: false, autoHeight: true };
    const graphForHash = app.graph || node.graph || null;
    const pressureHubForHash = graphForHash ? getDeckPressureHubForNode(node, graphForHash) : null;
    const branchSideForHash = pressureHubForHash && pressureHubForHash.id !== node.id ? getDeckPressureBranchSideForNode(pressureHubForHash, graphForHash, node) : null;
    const branchAxisForHash = getDeckPressureBranchAxis(pressureHubForHash, graphForHash, branchSideForHash) || "n";
    const neighborLeftForHash = getNodeOnDeckEdge(node, graphForHash, "left")?.id ?? "n";
    const neighborRightForHash = getNodeOnDeckEdge(node, graphForHash, "right")?.id ?? "n";
    const canvasRectHash = `${rect.left.toFixed(2)},${rect.top.toFixed(2)},${rect.width.toFixed(2)},${rect.height.toFixed(2)}`;
    const stateHash = `${node.pos[0]},${node.pos[1]}_${visualW},${visualH}_${scale}_${ds.offset[0]},${ds.offset[1]}_${node.flags?.collapsed}_${node.properties?.contentCollapsed}_${node.properties?.debugMode}_${canvasEl.clientWidth},${canvasEl.clientHeight}_${canvasRectHash}_${edgeState.left ?? "n"},${edgeState.right ?? "n"},${edgeState.top ?? "n"},${edgeState.bottom ?? "n"}_${neighborLeftForHash},${neighborRightForHash}_${pressureHubForHash?.id ?? "n"},${branchSideForHash ?? "n"},${branchAxisForHash}_${varsForHash.autoWidth}_${varsForHash.autoHeight}`;
    if (node.interactionShield._lastStateHash === stateHash && !node._forceSync) return;
    node.interactionShield._lastStateHash = stateHash;

    const shieldX = rect.left + (node.pos[0] + padL + ds.offset[0]) * scale;
    const shieldY = rect.top + (node.pos[1] + ds.offset[1]) * scale;

    const s = node.interactionShield.style;
    const dMode = node.properties.debugMode;

// --- 1 & 2. DEBUG LAYER & HITBOX RENDER MODES ---
    // Pass the calculated offsets so the red boxes are forced to align
    // with the physical DOM element's interaction boundary.
    renderHitboxDebug(node.interactionShield, node.layout?.regions, dMode, scale, {
        offsetX: 0,
        offsetY: 0,
        isSystemPanel: false
    });

    // --- 3. BASE SHIELD TRANSFORM ---
    s.width = `${visualW * scale}px`;
    s.height = `${visualH * scale}px`;
    s.transform = `translate3d(${shieldX}px, ${shieldY}px, 0)`;
    // THE Z-INDEX FIX: Respect the base zIndex of the entity (essential for Bastas)
    const baseZ = node.baseZIndex || "5";
    s.zIndex = (dMode === "Hitbox" || dMode === "Widgets Hitbox") ? String(MASTER_Z.debugHitbox) : baseZ;
    s.display = node.flags?.collapsed ? "none" : "block";

    if (node.type === "xcpDerpSignalOut" && node.interactionShield._signalOutLinkHandles) {
        const outputs = node._xcpTrueOutputs || node.outputs || [];
        outputs.forEach((slot, idx) => {
            const handle = node.interactionShield._ensureSignalOutLinkHandle?.(idx);
            if (!handle) return;
            const pos = slot?.pos;
            const visible = pos && pos[0] !== -1000 && pos[1] !== -1000;
            handle.style.display = visible ? "block" : "none";
            if (visible) {
                handle.style.left = `${(pos[0] - padL) * scale}px`;
                handle.style.top = `${pos[1] * scale}px`;
            }
        });

        for (let i = outputs.length; i < node.interactionShield._signalOutLinkHandles.length; i++) {
            const handle = node.interactionShield._signalOutLinkHandles[i];
            if (handle) handle.style.display = "none";
        }
    }

    // THE DYNAMIC RESIZE CURSOR FIX:
    // Update the handle's cursor and interaction state based on the node's auto-resize properties.
    if (node.isSystemPanel || node.isSysPanel) {
        node.resizable = false;
        disableResizeHandles(node.interactionShield);
    } else if (node.interactionShield._resizeHandle) {
        const vars = node.getDerpVars ? node.getDerpVars(node) : { autoWidth: false, autoHeight: true };
        const themedBottomCornerSize = Math.max(6 * scale, (Number(vars.mW || 0) + Number(vars.mH || 0)) * 0.5 * scale);
        const themedTopCornerSize = Math.max(6 * scale, Number(vars.mH || 0) * scale);
        const bottomCornerSize = Number.isFinite(themedBottomCornerSize) ? themedBottomCornerSize : defaultBottomCornerSize;
        const topCornerSize = Number.isFinite(themedTopCornerSize) ? themedTopCornerSize : defaultTopCornerSize;
        const canW = !vars.autoWidth;
        const canH = !vars.autoHeight;
        const isBasta = !!node.hostNode;
        const bastaEdgeWidth = Math.max(1, (vars.mW || 0) * scale);
        const bottomRightWidth = isBasta ? bastaEdgeWidth : bottomCornerSize;
        const bottomLeftWidth = isBasta ? bastaEdgeWidth : bottomCornerSize;
        const cornerOutwardPad = Math.max(0, Number(SHIELD_CORNER_RESIZE_OUTWARD_PAD) || 0) * scale;

        const handleStyle = node.interactionShield._resizeHandle.style;
        const edges = node.properties?.deckEdges || {};
        const hasSharedLeftEdge = edges.left !== null && edges.left !== undefined;
        const hasSharedRightEdge = edges.right !== null && edges.right !== undefined;
        const hasSharedTopEdge = edges.top !== null && edges.top !== undefined;
        const hasSharedBottomEdge = edges.bottom !== null && edges.bottom !== undefined;
        const sharedEdgeWidth = Math.max(10, Number(vars.mW || 0) * scale);
        const graph = app.graph || node.graph || null;
        const isVerticalDockStack = getLinearResizeMembers(node, graph, "vertical").length > 1;
        const isHorizontalDockStack = getLinearResizeMembers(node, graph, "horizontal").length > 1;
        const isPressureHub = isDeckPressureHub(node);
        const pressureHub = graph ? getDeckPressureHubForNode(node, graph) : null;
        const isPressureMember = !!pressureHub;
        const canResizePressureSeamLeftW = isDeckPressureHubSeamSideEdge(node, graph, "left");
        const canResizePressureSeamRightW = isDeckPressureHubSeamSideEdge(node, graph, "right");
        const canResizePressureSideHorizontalLeftW = isDeckPressureSideHorizontalHubEdge(node, graph, "left");
        const canResizePressureSideHorizontalRightW = isDeckPressureSideHorizontalHubEdge(node, graph, "right");
        const canResizeStackLeftW = isHorizontalDockStack && canResizeHorizontalStackWidth(node, graph, "left");
        const canResizeStackRightW = isHorizontalDockStack && canResizeHorizontalStackWidth(node, graph, "right");
        const canResizeStackW = canResizeStackLeftW || canResizeStackRightW || canResizePressureSeamLeftW || canResizePressureSeamRightW || canResizePressureSideHorizontalLeftW || canResizePressureSideHorizontalRightW;
        const canResizeSharedLeftW = canResizeHorizontalSharedEdge(node, graph, "left");
        const canResizeSharedRightW = canResizeHorizontalSharedEdge(node, graph, "right");
        const canResizeSharedW = canResizeSharedLeftW || canResizeSharedRightW;
        const canUseLeftW = canW || canResizeStackLeftW || canResizeSharedLeftW || canResizePressureSeamLeftW || canResizePressureSideHorizontalLeftW;
        const canUseRightW = canW || canResizeStackRightW || canResizeSharedRightW || canResizePressureSeamRightW || canResizePressureSideHorizontalRightW;
        const isCollapsed = node.properties?.contentCollapsed === true;
        const nodeAbove = isVerticalDockStack ? getNodeOnDeckEdge(node, graph, "top") : null;
        const nodeBelow = isVerticalDockStack ? getNodeOnDeckEdge(node, graph, "bottom") : null;
        const isNodeAboveCollapsed = nodeAbove?.properties?.contentCollapsed === true;
        const isNodeBelowCollapsed = nodeBelow?.properties?.contentCollapsed === true;
        const hasInternalTopResizeEdge = hasSharedTopEdge && !!nodeAbove && !isCollapsed && !isNodeAboveCollapsed;
        const hasInternalBottomResizeEdge = hasSharedBottomEdge && !!nodeBelow && !isCollapsed && !isNodeBelowCollapsed;
        const isTopBoundary = !!isVerticalDockStack && !nodeAbove;
        const isBottomBoundary = !!isVerticalDockStack && !nodeBelow;
        const allowTopResizeCorners = !isVerticalDockStack || isTopBoundary;
        const allowBottomResizeCorners = !isVerticalDockStack || isBottomBoundary;
        const pressureSharedEdgeHeight = Math.max(1, (visualH * scale) - topCornerSize - bottomCornerSize);
        const allowFrameCornerTopLeft = !isPressureMember || isDeckPressureFrameCorner(node, graph, "top-left");
        const allowFrameCornerTopRight = !isPressureMember || isDeckPressureFrameCorner(node, graph, "top-right");
        const allowFrameCornerBottomLeft = !isPressureMember || isDeckPressureFrameCorner(node, graph, "bottom-left");
        const allowFrameCornerBottomRight = !isPressureMember || isDeckPressureFrameCorner(node, graph, "bottom-right");
        if (node.interactionShield._resizeHandleSharedLeft) {
            const sharedLeftStyle = node.interactionShield._resizeHandleSharedLeft.style;
            sharedLeftStyle.width = `${sharedEdgeWidth}px`;
            sharedLeftStyle.height = `${visualH * scale}px`;
            sharedLeftStyle.left = `-${padL * scale}px`;
            sharedLeftStyle.top = "0px";
            sharedLeftStyle.cursor = "ew-resize";
            const showSharedLeft = canResizeSharedLeftW || canResizePressureSeamLeftW || canResizePressureSideHorizontalLeftW;
            sharedLeftStyle.display = showSharedLeft ? "block" : "none";
            sharedLeftStyle.pointerEvents = showSharedLeft ? "auto" : "none";
            node.interactionShield._resizeHandleSharedLeft._resizeAnchorOverride = showSharedLeft ? "left" : null;
        }
        if (node.interactionShield._resizeHandleSharedRight) {
            const sharedRightStyle = node.interactionShield._resizeHandleSharedRight.style;
            sharedRightStyle.width = `${sharedEdgeWidth}px`;
            sharedRightStyle.height = `${visualH * scale}px`;
            sharedRightStyle.right = `-${padR * scale}px`;
            sharedRightStyle.top = "0px";
            sharedRightStyle.cursor = "ew-resize";
            const showSharedRight = canResizeSharedRightW || canResizePressureSeamRightW || canResizePressureSideHorizontalRightW;
            sharedRightStyle.display = showSharedRight ? "block" : "none";
            sharedRightStyle.pointerEvents = showSharedRight ? "auto" : "none";
            node.interactionShield._resizeHandleSharedRight._resizeAnchorOverride = showSharedRight ? "right" : null;
        }
        node.interactionShield._resizeHandle._resizeAnchorOverride = ((!isPressureHub && !isVerticalDockStack && canResizeSharedRightW) || canResizePressureSeamRightW || canResizePressureSideHorizontalRightW) ? "right" : null;
        handleStyle.width = `${bottomRightWidth}px`;
        handleStyle.height = `${bottomCornerSize}px`;
        handleStyle.cursor = (canUseRightW && canH) ? "nwse-resize" : (canUseRightW ? "ew-resize" : "ns-resize");
        // THE INTERACTION GUARD: Disable handle interaction entirely if both axes are auto-managed
        node.resizable = canResizeStackW || canResizeSharedW || !(vars.autoWidth && vars.autoHeight); // THE NATIVE FIX: Kill LiteGraph's own resize logic
        handleStyle.display = (node.resizable && allowBottomResizeCorners && allowFrameCornerBottomRight) ? "block" : "none"; // THE VISUAL FIX: Completely remove the handle
        handleStyle.pointerEvents = (node.resizable && allowBottomResizeCorners && allowFrameCornerBottomRight) ? "auto" : "none";
        handleStyle.right = `-${padR * scale}px`;
        handleStyle.bottom = "0px";
        if (handleStyle.display === "block" && !node.interactionShield._resizeHandle._resizeAnchorOverride) {
            handleStyle.width = `${bottomRightWidth + cornerOutwardPad}px`;
            handleStyle.height = `${bottomCornerSize + cornerOutwardPad}px`;
            handleStyle.right = `-${(padR * scale) + cornerOutwardPad}px`;
            handleStyle.bottom = `-${cornerOutwardPad}px`;
        }

        if (allowBottomResizeCorners && ((canResizeSharedRightW && !isVerticalDockStack && !isPressureHub) || canResizePressureSeamRightW || canResizePressureSideHorizontalRightW) && canUseRightW) {
            handleStyle.width = `${sharedEdgeWidth}px`; handleStyle.height = `${isPressureMember ? pressureSharedEdgeHeight : visualH * scale}px`; handleStyle.cursor = "ew-resize"; handleStyle.display = "block"; handleStyle.pointerEvents = "auto";
            handleStyle.bottom = isPressureMember ? `${bottomCornerSize}px` : "0px";
        }
        if (isVerticalDockStack && hasInternalBottomResizeEdge && canH) {
            if (isCollapsed && isBottomBoundary) {
                handleStyle.width = `${bottomRightWidth}px`;
                handleStyle.height = `${bottomCornerSize}px`;
                handleStyle.bottom = "0px";
                handleStyle.cursor = canUseRightW ? "ew-resize" : "default";
                handleStyle.display = (node.resizable && allowBottomResizeCorners) ? "block" : "none";
                handleStyle.pointerEvents = (node.resizable && allowBottomResizeCorners) ? "auto" : "none";
                node.interactionShield._resizeHandle._resizeAnchorOverride = canUseRightW ? "right" : null;
            } else {
                const seamWidth = isPressureMember ? Math.max(1, (visualW * scale) - bottomLeftWidth - bottomRightWidth) : visualW * scale;
                handleStyle.width = `${seamWidth}px`;
                handleStyle.height = `${sharedEdgeWidth}px`;
                handleStyle.right = isPressureMember ? `${bottomRightWidth - (padR * scale)}px` : `-${padR * scale}px`;
                handleStyle.bottom = "0px";
                handleStyle.cursor = "ns-resize";
                handleStyle.display = "block";
                handleStyle.pointerEvents = "auto";
                node.interactionShield._resizeHandle._resizeAnchorOverride = "bottom";
            }
        }

        if (node.interactionShield._resizeHandleLeft) {
            const leftStyle = node.interactionShield._resizeHandleLeft.style;
            node.interactionShield._resizeHandleLeft._resizeAnchorOverride = ((!isPressureHub && !isVerticalDockStack && canResizeSharedLeftW) || canResizePressureSeamLeftW || canResizePressureSideHorizontalLeftW) ? "left" : null;
            leftStyle.width = `${bottomLeftWidth}px`;
            leftStyle.height = `${bottomCornerSize}px`;
            leftStyle.cursor = (canUseLeftW && canH) ? "nesw-resize" : (canUseLeftW ? "ew-resize" : "ns-resize");
            leftStyle.display = (node.resizable && allowBottomResizeCorners && allowFrameCornerBottomLeft) ? "block" : "none";
            leftStyle.pointerEvents = (node.resizable && allowBottomResizeCorners && allowFrameCornerBottomLeft) ? "auto" : "none";
            leftStyle.left = `-${padL * scale}px`;
            leftStyle.bottom = "0px";
            if (leftStyle.display === "block" && !node.interactionShield._resizeHandleLeft._resizeAnchorOverride) {
                leftStyle.width = `${bottomLeftWidth + cornerOutwardPad}px`;
                leftStyle.height = `${bottomCornerSize + cornerOutwardPad}px`;
                leftStyle.left = `-${(padL * scale) + cornerOutwardPad}px`;
                leftStyle.bottom = `-${cornerOutwardPad}px`;
            }

            if (allowBottomResizeCorners && ((canResizeSharedLeftW && !isVerticalDockStack && !isPressureHub) || canResizePressureSeamLeftW || canResizePressureSideHorizontalLeftW) && canUseLeftW) {
                leftStyle.width = `${sharedEdgeWidth}px`; leftStyle.height = `${isPressureMember ? pressureSharedEdgeHeight : visualH * scale}px`; leftStyle.cursor = "ew-resize"; leftStyle.display = "block"; leftStyle.pointerEvents = "auto";
                leftStyle.bottom = isPressureMember ? `${bottomCornerSize}px` : "0px";
            }
            if (isVerticalDockStack && hasInternalBottomResizeEdge && canH) {
                if (isCollapsed && isBottomBoundary) {
                    leftStyle.width = `${bottomLeftWidth}px`;
                    leftStyle.height = `${bottomCornerSize}px`;
                    leftStyle.bottom = "0px";
                    leftStyle.cursor = canUseLeftW ? "ew-resize" : "default";
                    leftStyle.display = (node.resizable && allowBottomResizeCorners) ? "block" : "none";
                    leftStyle.pointerEvents = (node.resizable && allowBottomResizeCorners) ? "auto" : "none";
                    node.interactionShield._resizeHandleLeft._resizeAnchorOverride = canUseLeftW ? "left" : null;
                } else {
                    const seamWidth = isPressureMember ? Math.max(1, (visualW * scale) - bottomLeftWidth - bottomRightWidth) : visualW * scale;
                    leftStyle.width = `${seamWidth}px`;
                    leftStyle.height = `${sharedEdgeWidth}px`;
                    leftStyle.left = isPressureMember ? `${bottomLeftWidth - (padL * scale)}px` : `-${padL * scale}px`;
                    leftStyle.bottom = "0px";
                    leftStyle.cursor = "ns-resize";
                    leftStyle.display = "block";
                    leftStyle.pointerEvents = "auto";
                    node.interactionShield._resizeHandleLeft._resizeAnchorOverride = "bottom";
                }
            }
        }

        const showTopCorners = node.resizable;
        const headerVisible = node.properties?.drawHeader !== false;
        const collapseBtn = node.layout?.regions?.btnCollapse;
        const bypassBtn = node.layout?.regions?.btnBypass;
        const topLeftWidth = isBasta
            ? bastaEdgeWidth
            : (headerVisible && collapseBtn && Number.isFinite(collapseBtn.x))
                ? Math.max(1, collapseBtn.x * scale)
                : topCornerSize;
        const topRightWidth = isBasta
            ? bastaEdgeWidth
            : (headerVisible && bypassBtn && Number.isFinite(bypassBtn.x) && Number.isFinite(bypassBtn.w))
                ? Math.max(1, (visualW - (bypassBtn.x + bypassBtn.w)) * scale)
                : topCornerSize;

        if (node.interactionShield._resizeHandleTopLeft) {
            const topLeftStyle = node.interactionShield._resizeHandleTopLeft.style;
            node.interactionShield._resizeHandleTopLeft._resizeAnchorOverride = null;
            topLeftStyle.width = `${topLeftWidth}px`;
            topLeftStyle.height = `${topCornerSize}px`;
            topLeftStyle.display = (showTopCorners && allowTopResizeCorners && allowFrameCornerTopLeft && !hasSharedLeftEdge) ? "block" : "none";
            topLeftStyle.pointerEvents = (showTopCorners && allowTopResizeCorners && allowFrameCornerTopLeft && !hasSharedLeftEdge) ? "auto" : "none";
            topLeftStyle.left = `-${padL * scale}px`;
            topLeftStyle.top = "0px";
            if (topLeftStyle.display === "block" && !node.interactionShield._resizeHandleTopLeft._resizeAnchorOverride) {
                topLeftStyle.height = `${topCornerSize + cornerOutwardPad}px`;
                topLeftStyle.left = `-${(padL * scale) + cornerOutwardPad}px`;
                topLeftStyle.top = `-${cornerOutwardPad}px`;
                topLeftStyle.width = `${topLeftWidth + (cornerOutwardPad * 2)}px`;
            }
            if (isVerticalDockStack && hasInternalTopResizeEdge && canH) {
                if (isCollapsed && isTopBoundary) {
                    topLeftStyle.width = `${topLeftWidth}px`;
                    topLeftStyle.height = `${topCornerSize}px`;
                    topLeftStyle.top = "0px";
                    topLeftStyle.display = (showTopCorners && allowFrameCornerTopLeft && !hasSharedLeftEdge) ? "block" : "none";
                    topLeftStyle.pointerEvents = (showTopCorners && allowFrameCornerTopLeft && !hasSharedLeftEdge) ? "auto" : "none";
                    topLeftStyle.cursor = canUseLeftW ? "ew-resize" : "default";
                    node.interactionShield._resizeHandleTopLeft._resizeAnchorOverride = canUseLeftW ? "left" : null;
                } else {
                    const seamWidth = isPressureMember ? Math.max(1, (visualW * scale) - topLeftWidth - topRightWidth) : visualW * scale;
                    topLeftStyle.width = `${seamWidth}px`;
                    topLeftStyle.height = `${sharedEdgeWidth}px`;
                    topLeftStyle.left = isPressureMember ? `${topLeftWidth - (padL * scale)}px` : `-${padL * scale}px`;
                    topLeftStyle.top = "0px";
                    topLeftStyle.cursor = "ns-resize";
                    topLeftStyle.display = "block";
                    topLeftStyle.pointerEvents = "auto";
                    node.interactionShield._resizeHandleTopLeft._resizeAnchorOverride = "top";
                }
            } else {
                topLeftStyle.cursor = (canUseLeftW && canH) ? "nwse-resize" : (canUseLeftW ? "ew-resize" : "ns-resize");
            }
        }

        if (node.interactionShield._resizeHandleTopRight) {
            const topRightStyle = node.interactionShield._resizeHandleTopRight.style;
            node.interactionShield._resizeHandleTopRight._resizeAnchorOverride = null;
            topRightStyle.width = `${topRightWidth}px`;
            topRightStyle.height = `${topCornerSize}px`;
            topRightStyle.display = (showTopCorners && allowTopResizeCorners && allowFrameCornerTopRight && !hasSharedRightEdge) ? "block" : "none";
            topRightStyle.pointerEvents = (showTopCorners && allowTopResizeCorners && allowFrameCornerTopRight && !hasSharedRightEdge) ? "auto" : "none";
            topRightStyle.right = `-${padR * scale}px`;
            topRightStyle.top = "0px";
            if (topRightStyle.display === "block" && !node.interactionShield._resizeHandleTopRight._resizeAnchorOverride) {
                topRightStyle.height = `${topCornerSize + cornerOutwardPad}px`;
                topRightStyle.right = `-${(padR * scale) + cornerOutwardPad}px`;
                topRightStyle.top = `-${cornerOutwardPad}px`;
                topRightStyle.width = `${topRightWidth + (cornerOutwardPad * 2)}px`;
            }
            if (isVerticalDockStack && hasInternalTopResizeEdge && canH) {
                if (isCollapsed && isTopBoundary) {
                    topRightStyle.width = `${topRightWidth}px`;
                    topRightStyle.height = `${topCornerSize}px`;
                    topRightStyle.top = "0px";
                    topRightStyle.display = (showTopCorners && allowFrameCornerTopRight && !hasSharedRightEdge) ? "block" : "none";
                    topRightStyle.pointerEvents = (showTopCorners && allowFrameCornerTopRight && !hasSharedRightEdge) ? "auto" : "none";
                    topRightStyle.cursor = canUseRightW ? "ew-resize" : "default";
                    node.interactionShield._resizeHandleTopRight._resizeAnchorOverride = canUseRightW ? "right" : null;
                } else {
                    const seamWidth = isPressureMember ? Math.max(1, (visualW * scale) - topLeftWidth - topRightWidth) : visualW * scale;
                    topRightStyle.width = `${seamWidth}px`;
                    topRightStyle.height = `${sharedEdgeWidth}px`;
                    topRightStyle.right = isPressureMember ? `${topRightWidth - (padR * scale)}px` : `-${padR * scale}px`;
                    topRightStyle.top = "0px";
                    topRightStyle.cursor = "ns-resize";
                    topRightStyle.display = "block";
                    topRightStyle.pointerEvents = "auto";
                    node.interactionShield._resizeHandleTopRight._resizeAnchorOverride = "top";
                }
            } else {
                topRightStyle.cursor = (canUseRightW && canH) ? "nesw-resize" : (canUseRightW ? "ew-resize" : "ns-resize");
            }
        }
    }
    syncMouseHitboxDebugRects(node, scale);
    if (isShieldHitboxDebugEnabled()) {
        requestAnimationFrame(() => syncMouseHitboxDebugRects(node, scale));
    }
}

export function removeDerpShield(node) {
    if (node.interactionShield) {
        node.interactionShield.remove();
        node.interactionShield = null;
    }
    if (!node) return;
    node._hoveredRegionKey = null;
    node._pressedRegionKey = null;
    node._pressedRegionType = null;
    node._pressedRegionIsDragHandle = false;
    node._dragEndRegionKey = null;
    node._dockResizeHoverSession = null;
}
