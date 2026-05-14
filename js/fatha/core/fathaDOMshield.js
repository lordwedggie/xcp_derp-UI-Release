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
import { getNodeOnDeckEdge, isLinearDeckGroup } from "./masterDockEngine.js";

// DEBUG_MODE is now dynamically handled via node.properties.debugMode

export function createDerpShield(node) {
    if (node.interactionShield) return;

    const shield = document.createElement("div");

    shield.style.cssText = `
        position: fixed; 
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

    // THE FIX: Store a reference so we can dynamically adjust its offsets during zoom
    shield._resizeHandle = resizeHandle;
    shield._resizeHandleLeft = resizeHandleLeft;
    shield._resizeHandleTopLeft = resizeHandleTopLeft;
    shield._resizeHandleTopRight = resizeHandleTopRight;


    // --- STATE ---
    let startMouseX = 0, startMouseY = 0;
    let isResizing = false;
    let longPressed = false, holdTimer = null;
    let lastClickTime = 0; // THE FIX: Track manual double clicks

    // --- HELPERS ---
    const getLocalCoords = (e) => {
        const rect = app.canvas.canvas.getBoundingClientRect();
        const ds = app.canvas.ds;
        const canvasX = (e.clientX - rect.left) / ds.scale - ds.offset[0];
        const canvasY = (e.clientY - rect.top) / ds.scale - ds.offset[1];

        // THE FIX: Do not apply artificial offsets to the mouse pointer.
        // Fatha's GrandFathaLayoutEngine natively handles negative coordinates for the bleed area.
        return {
            x: canvasX - node.pos[0],
            y: canvasY - node.pos[1]
        };
    };

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

    const cleanup = () => {
        window.removeEventListener("pointermove", onWindowPointerMove);
        window.removeEventListener("pointerup", onWindowPointerUp);
        window.removeEventListener("pointercancel", onWindowPointerUp);
        if (holdTimer) clearTimeout(holdTimer);
        setVisualActive(false);
    };

    const copyPointerProps = (e, type) => {
        return new PointerEvent(type, {
            bubbles: true, cancelable: true, view: window,
            pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY,
            button: e.button, buttons: e.buttons, shiftKey: e.shiftKey
        });
    };

    // --- HANDLERS ---
    const onWindowPointerMove = (e) => {
        if (e._isProxyEvent || e.buttons === 0) { onWindowPointerUp(e); return; }

        const dx = e.clientX - startMouseX;
        const dy = e.clientY - startMouseY;

        // MODE 1: RESIZING (Delegate to Node)
        if (isResizing) {
            node.handleShieldInteraction("resize", {
                dx,
                dy,
                resizeAnchor: node._resizeAnchor || "bottom-right"
            });
            return;
        }

        // MODE 2: DRAGGING (Delegate to Node)
        if (longPressed) {
            const localPos = getLocalCoords(e);
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
            const rect = shield.getBoundingClientRect();

            // Check if node handled the click (e.g., hit a slider). If so, block native selection.
            const handled = node.handleShieldInteraction("click", {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: localPos.x,
                localY: localPos.y,
                originalEvent: e
            });

            if (!handled) {
                if (!e.shiftKey && !node.selected) app.canvas.deselectAllNodes();
                app.canvas.selectNode(node, e.shiftKey || node.selected);
                app.canvas.current_node = node;
                app.canvas.canvas.focus(); // THE FOCUS FIX: Ensure keyboard events reach the canvas
                if (app.canvas.bringToFront) app.canvas.bringToFront(node);
            }
        }

        const proxyUp = copyPointerProps(e, "pointerup");
        proxyUp._isProxyEvent = true;
        app.canvas.canvas.dispatchEvent(proxyUp);

        longPressed = false;
        isResizing = false;
        node._isDerpResizing = false;
        node._dockResizeSession = null;

        // THE FIX: Pass coordinate data to prevent 'undefined' errors in the handler
        const localPos = getLocalCoords(e);
        node.handleShieldInteraction("dragEnd", {
            x: e.clientX - shield.getBoundingClientRect().left,
            y: e.clientY - shield.getBoundingClientRect().top,
            localX: localPos.x,
            localY: localPos.y,
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

        e.stopPropagation(); e.preventDefault(); cleanup();
        app.canvas.canvas.focus(); // THE FOCUS FIX: Ensure keyboard events reach the canvas
        isResizing = true;
        node._resizeAnchor = anchor;
        node._isDerpResizing = true; // THE FIX: Pause Fatha's auto-enforcer during drag
        startMouseX = e.clientX;
        startMouseY = e.clientY; // THE FIX: Capture Y for vertical resizing

        // THE FIX: Sync LiteGraph mouse tracking immediately to prevent scale-induced jumps
        const rect = app.canvas.canvas.getBoundingClientRect();
        app.canvas.last_mouse = [e.clientX - rect.left, e.clientY - rect.top];

        // Notify node to cache start state with proper coordinates to pass the safety guard
        node.handleShieldInteraction("dragStart", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: localPos.x,
            localY: localPos.y,
            originalEvent: e
        });
        if (app.canvas.bringToFront) app.canvas.bringToFront(node);

        // THE DYNAMIC CURSOR FIX: Determine the global drag cursor based on auto-resize states
        const vars = node.getDerpVars ? node.getDerpVars(node) : { autoWidth: false, autoHeight: false };
        const canW = !vars.autoWidth;
        const canH = !vars.autoHeight;
        const isLeftOrRightCorner = anchor === "top-left" || anchor === "top-right" || anchor === "bottom-left" || anchor === "bottom-right";
        let dragCursor = "default";
        if (canW && canH && isLeftOrRightCorner) {
            dragCursor = (anchor === "top-left" || anchor === "bottom-right") ? "nwse-resize" : "nesw-resize";
        } else if (canW) dragCursor = "ew-resize";
        else if (canH) dragCursor = "ns-resize";

        setVisualActive(true, dragCursor);
        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
    };

    resizeHandle.onpointerdown = (e) => startResize(e, "bottom-right");
    resizeHandleLeft.onpointerdown = (e) => startResize(e, "bottom-left");
    resizeHandleTopLeft.onpointerdown = (e) => startResize(e, "top-left");
    resizeHandleTopRight.onpointerdown = (e) => startResize(e, "top-right");

    shield.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.stopPropagation(); e.preventDefault(); cleanup();
        app.canvas.canvas.focus();
        const now = Date.now();
        const isDblClick = (now - lastClickTime) < 300;
        lastClickTime = now;

        startMouseX = e.clientX;
        startMouseY = e.clientY;

        const localPos = getLocalCoords(e);
        const rect = shield.getBoundingClientRect();

        if (isDblClick) {
            node.handleShieldInteraction("dblclick", {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                localX: localPos.x,
                localY: localPos.y,
                originalEvent: e
            });
            lastClickTime = 0; // Reset
            return;
        }

        // Notify node to cache start state (Passes dual coords to satisfy both core and Custom Sliders)
        const handled = node.handleShieldInteraction("dragStart", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: localPos.x,
            localY: localPos.y,
            originalEvent: e
        });

        if (app.canvas.bringToFront) app.canvas.bringToFront(node);

        if (handled) {
            longPressed = true;
            app.canvas.dragging_canvas = false;
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
        const localPos = getLocalCoords(e);
        const rect = shield.getBoundingClientRect();
        node.handleShieldInteraction("hover", {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            localX: localPos.x,
            localY: localPos.y
        });
    };

    shield.onmouseenter = () => {
        const isBasta = node?.properties?.bastaSingleton !== undefined || node?.properties?.bastaMovalbe !== undefined;
        node._uiHovered = true;
        node._derpAwakeFrames = 5;
        if (!isBasta) node._forceSync = true;
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
    };
    shield.onmouseleave = () => {
        const isBasta = node?.properties?.bastaSingleton !== undefined || node?.properties?.bastaMovalbe !== undefined;
        node._uiHovered = false;
        node._systemBtnHovered = false;
        node._hoveredRegionKey = null; // --- Clear hover key to allow re-entry detection ---
        node._hoveredFieldIndex = null;
        if (shield) shield.style.cursor = "default";

        node._derpAwakeFrames = 5;
        if (!isBasta) node._forceSync = true;
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
        if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
    };

    shield.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        const scale = app.canvas?.ds?.scale || 1;
        const localMouse = [e.offsetX / scale, e.offsetY / scale];
        const regionEntries = Object.entries(node.layout?.regions || {}).reverse();
        for (const [, reg] of regionEntries) {
            if (!reg || typeof reg.onContextMenu !== "function") continue;
            const isHit = reg.hitTest ? reg.hitTest(localMouse) : node.layout?.hitTest?.(localMouse, reg);
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
        if (app.canvas.bringToFront) app.canvas.bringToFront(node);
        const options = app.canvas.getNodeMenuOptions(node);
        if (options) new LiteGraph.ContextMenu(options, { event: e });
        return false;
    };

    shield.onwheel = (e) => {
        // THE SCROLL PASS-THROUGH: If we are hovering over a scrollable region,
        // capture the wheel delta and apply it to the node's scroll state.
        if (node._hoveredRegionKey && node._derpScrollOffsets?.[node._hoveredRegionKey] !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            node._derpScrollOffsets[node._hoveredRegionKey] += e.deltaY;

            // Clamp scroll so it doesn't go into negative numbers
            node._derpScrollOffsets[node._hoveredRegionKey] = Math.max(0, node._derpScrollOffsets[node._hoveredRegionKey]);
            node.setDirtyCanvas(true);
            return;
        }
        app.canvas.canvas.dispatchEvent(new WheelEvent("wheel", e));
    };

    document.body.appendChild(shield);
    node.interactionShield = shield;
}

export function syncDerpShield(node) {
    if (!node.interactionShield) return;
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
    const stateHash = `${node.pos[0]},${node.pos[1]}_${visualW},${visualH}_${scale}_${ds.offset[0]},${ds.offset[1]}_${node.flags?.collapsed}_${node.properties?.debugMode}_${canvasEl.clientWidth}`;
    if (node.interactionShield._lastStateHash === stateHash && !node._forceSync) return;
    node.interactionShield._lastStateHash = stateHash;

    const rect = canvasEl.getBoundingClientRect();
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
    s.zIndex = (dMode === "Hitbox" || dMode === "Widgets Hitbox") ? "200000" : baseZ;
    s.display = node.flags?.collapsed ? "none" : "block";

    // THE DYNAMIC RESIZE CURSOR FIX:
    // Update the handle's cursor and interaction state based on the node's auto-resize properties.
    if (node.interactionShield._resizeHandle) {
        const vars = node.getDerpVars ? node.getDerpVars(node) : { autoWidth: true, autoHeight: true };
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

        const handleStyle = node.interactionShield._resizeHandle.style;
        const edges = node.properties?.deckEdges || {};
        const hasSharedLeftEdge = edges.left !== null && edges.left !== undefined;
        const hasSharedRightEdge = edges.right !== null && edges.right !== undefined;
        const sharedEdgeWidth = Math.max(4 * scale, Number(vars.mW || 0) * scale);
        const graph = app.graph || node.graph || null;
        const isVerticalDockStack = !!(graph && isLinearDeckGroup(node, graph, "vertical"));
        const allowTopResizeCorners = !isVerticalDockStack || !getNodeOnDeckEdge(node, graph, "top");
        const allowBottomResizeCorners = !isVerticalDockStack || !getNodeOnDeckEdge(node, graph, "bottom");
        node.interactionShield._resizeHandle._resizeAnchorOverride = (!isVerticalDockStack && hasSharedRightEdge) ? "right" : null;
        handleStyle.width = `${bottomRightWidth}px`;
        handleStyle.height = `${bottomCornerSize}px`;
        handleStyle.cursor = (canW && canH) ? "nwse-resize" : (canW ? "ew-resize" : "ns-resize");
        // THE INTERACTION GUARD: Disable handle interaction entirely if both axes are auto-managed
        node.resizable = !(vars.autoWidth && vars.autoHeight); // THE NATIVE FIX: Kill LiteGraph's own resize logic
        handleStyle.display = (node.resizable && allowBottomResizeCorners) ? "block" : "none"; // THE VISUAL FIX: Completely remove the handle
        handleStyle.pointerEvents = (node.resizable && allowBottomResizeCorners) ? "auto" : "none";
        handleStyle.right = `-${padR * scale}px`;

        if (!isVerticalDockStack && allowBottomResizeCorners && hasSharedRightEdge && canW) {
            handleStyle.width = `${sharedEdgeWidth}px`;
            handleStyle.height = `${visualH * scale}px`;
            handleStyle.cursor = "ew-resize";
            handleStyle.display = "block";
            handleStyle.pointerEvents = "auto";
        }

        if (node.interactionShield._resizeHandleLeft) {
            const leftStyle = node.interactionShield._resizeHandleLeft.style;
            node.interactionShield._resizeHandleLeft._resizeAnchorOverride = (!isVerticalDockStack && hasSharedLeftEdge) ? "left" : null;
            leftStyle.width = `${bottomLeftWidth}px`;
            leftStyle.height = `${bottomCornerSize}px`;
            leftStyle.cursor = (canW && canH) ? "nesw-resize" : (canW ? "ew-resize" : "ns-resize");
            leftStyle.display = (node.resizable && allowBottomResizeCorners) ? "block" : "none";
            leftStyle.pointerEvents = (node.resizable && allowBottomResizeCorners) ? "auto" : "none";
            leftStyle.left = `-${padL * scale}px`;

            if (!isVerticalDockStack && allowBottomResizeCorners && hasSharedLeftEdge && canW) {
                leftStyle.width = `${sharedEdgeWidth}px`;
                leftStyle.height = `${visualH * scale}px`;
                leftStyle.cursor = "ew-resize";
                leftStyle.display = "block";
                leftStyle.pointerEvents = "auto";
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
            topLeftStyle.width = `${topLeftWidth}px`;
            topLeftStyle.height = `${topCornerSize}px`;
            topLeftStyle.display = (showTopCorners && allowTopResizeCorners && !hasSharedLeftEdge) ? "block" : "none";
            topLeftStyle.pointerEvents = (showTopCorners && allowTopResizeCorners && !hasSharedLeftEdge) ? "auto" : "none";
            topLeftStyle.left = `-${padL * scale}px`;
            topLeftStyle.cursor = (canW && canH) ? "nwse-resize" : (canW ? "ew-resize" : "ns-resize");
        }

        if (node.interactionShield._resizeHandleTopRight) {
            const topRightStyle = node.interactionShield._resizeHandleTopRight.style;
            topRightStyle.width = `${topRightWidth}px`;
            topRightStyle.height = `${topCornerSize}px`;
            topRightStyle.display = (showTopCorners && allowTopResizeCorners && !hasSharedRightEdge) ? "block" : "none";
            topRightStyle.pointerEvents = (showTopCorners && allowTopResizeCorners && !hasSharedRightEdge) ? "auto" : "none";
            topRightStyle.right = `-${padR * scale}px`;
            topRightStyle.cursor = (canW && canH) ? "nesw-resize" : (canW ? "ew-resize" : "ns-resize");
        }
    }
}

export function removeDerpShield(node) {
    if (node.interactionShield) {
        node.interactionShield.remove();
        node.interactionShield = null;
    }
}
