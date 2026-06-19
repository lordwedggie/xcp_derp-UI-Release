/**
 * Specialist: ./herbina/widgets/popupPrompt.js
 * PURPOSE: A themed single-line text input for names or short prompts.
 */
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { calculateScreenCoords, getNextZIndex } from "../utils/widgetsUtils.js";
import { toRGBA } from "../utils/colorMath.js";

export function createPopupPrompt(callbacks = {}, placeholder = "Enter text...") {
    const el = document.createElement("input");
    el.type = "text";
    el.placeholder = placeholder;
    el.style.position = "fixed";
    el.style.zIndex = getNextZIndex();
    el.style.display = "none";
    el.style.outline = "none";
    el.style.border = "none";
    el.style.boxSizing = "border-box";
    el.style.padding = "0 6px";

    el.addEventListener("change", (e) => {
        if (callbacks.onChange) callbacks.onChange(e.target.value);
    });

    el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            if (callbacks.onEnter) callbacks.onEnter(el.value);
            el.value = ""; // Clear for next use
            el.blur();
        }
        e.stopPropagation();
    });

    el.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.body.appendChild(el);
    return el;
}

export function syncPopupPrompt(el, node, app, config) {
    if (!el || !node || node.flags?.collapsed) {
        if (el) el.style.display = "none";
        return;
    }

    const { x, y, w, h, themeKey = "bg", placeholder } = config; // Destructure placeholder
    const coords = calculateScreenCoords(node, app, x, y, w, h);
    if (!coords) return;

    el.style.display = "block";
    if (placeholder !== undefined) el.placeholder = placeholder; // Update placeholder text
    el.style.left = coords.left;
    el.style.top = coords.top;
    el.style.width = coords.width;
    el.style.height = coords.height;

    const cfg = window.xcpDerpThemeConfig;
    const targetTheme = cfg?.themes?.[cfg.activeTheme] || node.properties;
    const style = targetTheme[themeKey] || {};

    applyHTMLTheme(el, {
        fill: toRGBA(style._OFF || [30, 30, 30, 0.9]),
        corners: style.corners || 4
    }, coords.scale);

    el.style.color = "#ffffff";
    el.style.fontSize = `${12 * coords.scale}px`;
}