/**
 * Path: ./Herbina/utils/singletonController.js
 * STATUS: CENTRALIZED SINGLETON UTILITY
 * PURPOSE: A shared interaction shield and coordinate provider for Fatha widgets.
 */
import { getNextZIndex } from "./widgetsUtils.js";

let singletonShield = null;
let _activeCloseCallback = null;

export function setSingletonInteractionHandler(callback) {
    _activeCloseCallback = callback;
}

export function createSingletonShield() {
    if (singletonShield) return singletonShield;

    const el = document.createElement("div");
    el.className = "derp-singleton-shield";

    const baseZ = getNextZIndex() + 1000;

    Object.assign(el.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "0",
        height: "0",
        zIndex: baseZ,
        display: "none",
        pointerEvents: "auto",
        boxSizing: "border-box",
        willChange: "transform"
    });

    let dragStartX = 0;
    let dragStartY = 0;
    let pendingDownEvent = null;
    let isDragging = false;

    const forwardToCanvas = (e, overrideType = null) => {
        const canvas = window.app?.canvas?.canvas;
        if (!canvas) return;
        const clone = new PointerEvent(overrideType || e.type, {
            view: window, bubbles: true, cancelable: true,
            clientX: e.clientX, clientY: e.clientY,
            screenX: e.screenX, screenY: e.screenY,
            button: e.button, buttons: e.buttons,
            pointerId: e.pointerId, pointerType: e.pointerType,
            isPrimary: e.isPrimary, pressure: e.pressure,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey,
            altKey: e.altKey, metaKey: e.metaKey
        });
        canvas.dispatchEvent(clone);
    };

    el.onpointerdown = (e) => {
        if (e.target === el) {
            e.preventDefault();
            el.setPointerCapture(e.pointerId);

            dragStartX = e.clientX;
            dragStartY = e.clientY;
            isDragging = false;
            pendingDownEvent = e;
        }
    };

    el.onpointermove = (e) => {
        if (e.target === el || el.hasPointerCapture(e.pointerId)) {
            const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);

            if (!isDragging && dist >= 5) {
                isDragging = true;
                if (pendingDownEvent) {
                    forwardToCanvas(pendingDownEvent, "pointerdown");
                    pendingDownEvent = null;
                }
            }

            if (isDragging) {
                forwardToCanvas(e);
            }
        }
    };

    el.onpointerup = (e) => {
        if (e.target === el || el.hasPointerCapture(e.pointerId)) {
            el.releasePointerCapture(e.pointerId);

            if (!isDragging) {
                if (_activeCloseCallback) {
                    _activeCloseCallback();
                }
            } else {
                forwardToCanvas(e);
            }

            pendingDownEvent = null;
            isDragging = false;
        }
    };

    el.addEventListener("wheel", (e) => {
        window.app?.canvas?.canvas?.dispatchEvent(new WheelEvent("wheel", e));
    }, { passive: true });

    document.body.appendChild(el);
    singletonShield = el;
    return el;
}

export function syncSingletonShield(app, graphX, graphY, w, h) {
    if (!singletonShield || singletonShield.style.display === "none") return;

    const ds = app.canvas.ds;
    const scale = ds.scale;
    const offset = ds.offset;
    const rect = app.canvas.canvas.getBoundingClientRect();

    const screenX = rect.left + (graphX + offset[0]) * scale;
    const screenY = rect.top + (graphY + offset[1]) * scale;

    const s = singletonShield.style;
    s.width = `${w * scale}px`;
    s.height = `${h * scale}px`;
    s.transform = `translate3d(${screenX}px, ${screenY}px, 0)`;
}

export function toggleSingletonShield(visible, callback = null) {
    if (!singletonShield) createSingletonShield();

    if (visible) {
        if (_activeCloseCallback && callback && _activeCloseCallback !== callback) {
            _activeCloseCallback();
        }
        if (callback) _activeCloseCallback = callback;
        singletonShield.style.display = "block";
    } else {
        if (!callback || _activeCloseCallback === callback) {
            _activeCloseCallback = null;
            singletonShield.style.display = "none";
        }
    }
}

export function syncElementToCanvas(el, node, app, localX, localY, w, h) {
    if (!el || !app?.canvas?.ds) return null;
    const ds = app.canvas.ds;
    const scale = ds.scale;
    const offset = ds.offset;
    const rect = app.canvas.canvas.getBoundingClientRect();

    const graphX = (node ? node.pos[0] : 0) + localX;
    const graphY = (node ? node.pos[1] : 0) + localY;

    const screenX = rect.left + (graphX + offset[0]) * scale;
    const screenY = rect.top + (graphY + offset[1]) * scale;

    Object.assign(el.style, {
        left: "0px", top: "0px",
        width: `${w * scale}px`,
        height: `${h * scale}px`,
        transform: `translate3d(${screenX}px, ${screenY}px, 0)`
    });

    const liveRect = el.getBoundingClientRect();
    el._screenRect = {
        left: liveRect.left,
        top: liveRect.top,
        width: liveRect.width,
        height: liveRect.height,
        scale,
    };

    return scale;
}

export function executeShieldedInteraction(node, app, x, y, w, h, callback, ...args) {
    const tempClose = () => toggleSingletonShield(false, tempClose);
    toggleSingletonShield(true, tempClose);

    const graphX = (node ? node.pos[0] : 0) + x;
    const graphY = (node ? node.pos[1] : 0) + y;
    syncSingletonShield(app, graphX, graphY, w, h);

    if (callback) callback(...args);
    setTimeout(tempClose, 100);
}
