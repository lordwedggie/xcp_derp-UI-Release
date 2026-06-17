/**
 * Path: ./grandFatha/legacy/debugPainter.js
 * Centralized debug drawing logic for Master Layout Engine and DOM Shields.
 */
import { app } from "../../../../scripts/app.js";
import { applyHTMLTheme } from "../../herbina/masterPainterHTML.js";
import { MASTER_Z } from "../core/masterZ.js";

const debugPaints = {
    Hitbox: { fill: "rgba(255, 0, 0, 0.2)", border: { width: 1, color: "rgba(255, 0, 0, 0.8)", placement: "Inside" }, corners: 4 },
    Widgets: { fill: "rgba(255, 0, 0, 0.15)", border: { width: 1, color: "rgba(255, 0, 0, 0.9)", placement: "Inside" }, corners: 2 }
};

export function renderHitboxDebug(shieldEl, regions, debugMode, scale, config = {}) {
    if (!shieldEl) return;
    const isHitboxMode = debugMode === "Hitbox" || debugMode === "Widgets Hitbox";

    if (!shieldEl._debugLayer) {
        shieldEl._debugLayer = document.createElement("div");
        shieldEl._debugLayer.style.cssText = `position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:${MASTER_Z.debugHitboxLayer};`;
        shieldEl.appendChild(shieldEl._debugLayer);
    }
    const dbg = shieldEl._debugLayer;
    dbg.innerHTML = "";

    if (!isHitboxMode || !regions) {
        shieldEl.style.background = "transparent";
        shieldEl.style.border = "none";
        shieldEl.style.boxShadow = "none";
        return;
    }

    const {
        offsetX = 0,
        offsetY = 0,
        isSystemPanel = false,
        panelBgX = 0,
        panelBgY = 0
    } = config;

    if (debugMode === "Hitbox") {
        const corners = isSystemPanel ? 6 : 4;
        applyHTMLTheme(shieldEl, { ...debugPaints.Hitbox, corners }, 1);
    } else if (debugMode === "Widgets Hitbox") {
        shieldEl.style.background = "transparent";
        shieldEl.style.border = "none";
        shieldEl.style.boxShadow = "none";

        for (const [name, reg] of Object.entries(regions)) {
            if (!reg.type || name === "systemBtn" || name === "panelBackground" || reg.isSpacing) continue;

            const el = document.createElement("div");
            el.style.position = "absolute";

            // THE FIX: Use absolute local coordinates to match getLocalCoords exactly.
            // We no longer add/subtract artificial offsets because the Shield and
            // the Engine now share a 1:1 coordinate origin.
            if (isSystemPanel) {
                el.style.left = `${(reg.x - panelBgX) * scale}px`;
                el.style.top = `${(reg.y - panelBgY) * scale}px`;
            } else {
                // For standard nodes, reg.x/y are already relative to node.pos
                // Since the shield is transformed to (node.pos - bleed),
                // we only shift by the internal bleed (offsetX) to align them.
                el.style.left = `${(reg.x + offsetX) * scale}px`;
                el.style.top = `${(reg.y + offsetY) * scale}px`;
            }

            el.style.width = `${reg.w * scale}px`;
            el.style.height = `${reg.h * scale}px`;

            applyHTMLTheme(el, debugPaints.Widgets, scale);

            const label = document.createElement("div");
            label.innerText = `< ${name}`;
            label.style.cssText = `position:absolute; right:0; bottom:0; background:rgba(0,0,0,0.8); color:white; font-size:${3 * scale}px; padding:0.5px 1.5px; white-space:nowrap;`;
            el.appendChild(label);
            dbg.appendChild(el);
        }
    }
}

export function renderLayoutDebug(engine, node, regions) {
    if (!regions || !node || !engine) return;

    if (!engine._debugContainer) {
        engine._debugContainer = document.createElement("div");
        engine._debugContainer.className = "derp-debug-layer";
        engine._debugContainer.style.position = "absolute";
        engine._debugContainer.style.pointerEvents = "none";
        engine._debugContainer.style.zIndex = String(MASTER_Z.layoutDebug);
        engine._debugContainer.style.transformOrigin = "0 0";
        document.body.appendChild(engine._debugContainer);
    }

    const container = engine._debugContainer;
    container.style.display = "block";
    container.innerHTML = "";

    const dMode = node.properties?.debugMode || "None";
    if (dMode !== "Layout") return;

    const ds = app.canvas.ds;
    const scale = ds.scale;
    const canvasRect = app.canvas.canvas.getBoundingClientRect();

    const baseX = canvasRect.left + (node.pos[0] + ds.offset[0]) * scale;
    const baseY = canvasRect.top + (node.pos[1] + ds.offset[1]) * scale;

    container.style.transform = `translate3d(${baseX}px, ${baseY}px, 0) scale(${scale})`;

    for (const name of Object.keys(regions)) {
        const reg = regions[name];
        if (name === "panelBackground" || reg.isSpacing || name.startsWith("_spacing_")) continue;

        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = `${reg.x}px`;
        el.style.top = `${reg.y}px`;
        el.style.width = `${reg.w}px`;
        el.style.height = `${reg.h}px`;
        el.style.boxSizing = "border-box";

        const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
        el.style.backgroundColor = `hsla(${Math.abs(hash) % 360}, 70%, 50%, ${reg.isChild ? 0.2 : 0.4})`;
        el.style.border = `1px solid hsla(${Math.abs(hash) % 360}, 100%, 30%, 0.8)`;

        const label = document.createElement("div");
        label.innerText = reg.isChild ? `< ${name}` : name;
        label.style.position = "absolute";
        label.style.top = "0px";

        if (reg.isChild) {
            label.style.right = "0px";
        } else {
            label.style.left = "0px";
        }

        label.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
        label.style.color = "white";
        label.style.fontSize = "3px";
        label.style.fontFamily = "DengXian Light, Arial";
        label.style.padding = "0.5px 1.5px";
        label.style.whiteSpace = "nowrap";
        el.appendChild(label);

        container.appendChild(el);
    }
}
