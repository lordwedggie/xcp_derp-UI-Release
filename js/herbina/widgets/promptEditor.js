/**
 * Specialist: ./herbina/widgets/promptEditor.js
 * STATUS: PROTOCOL COMPLIANT (Master Widget Hub v1.0) | REFACTORED
 */
import { applyHTMLTheme } from "../masterPainterHTML.js";
import {
    calculateScreenCoords,
    getNextZIndex,
    measureTextWidth,
    resolvePaintData,
    interpretLayoutProps,
    clampText,
    resolveWidgetState,
    applyInteractionStyles,
    getWidgetContent,
    getAlignmentMaps
} from "../utils/widgetsUtils.js";

/**
 * Creates the HTML Prompt Editor (contenteditable div).
 */
export function createPromptEditor(callbacks = {}) {
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.spellcheck = !!callbacks.spellCheck;

    el.style.position = "fixed";
    el.style.zIndex = getNextZIndex();
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.outline = "none";
    el.style.wordBreak = "break-word";

    // THE WEIRD EDITING FIX: Use block instead of flex to allow native line-breaking
    el.style.display = "block";
    el.style.overflow = "hidden";
    el.style.whiteSpace = "nowrap";

    // Ensuring the cursor has a minimum visual presence
    el.style.minHeight = "1em";
    el.style.minWidth = "1px";

    Object.defineProperty(el, "value", {
        get() { return this.innerText; },
        set(v) { this.innerText = v; }
    });

    // FIX: Stop LiteGraph from stealing keystrokes and triggering shortcuts!
    const stopPropagation = (e) => e.stopPropagation();
    el.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
            e.preventDefault();
            el.blur();
        }
    });
    el.addEventListener("keyup", stopPropagation);
    el.addEventListener("keypress", stopPropagation);
    el.addEventListener("mousedown", stopPropagation);

    el.addEventListener("input", () => { if (callbacks.onInput) callbacks.onInput(el.value); });
    el.addEventListener("blur", () => { if (callbacks.onBlur) callbacks.onBlur(el.value); });

    document.body.appendChild(el);
    return el;
}

export function syncPromptEditor(el, node, app, config) {
    if (!el || !config.geometry) {
        if (el) el.style.display = "none";
        return;
    }

    const props = interpretLayoutProps(config, { owner: node });

    // 1. Resolve State & Styles via Protocol
    const stateStr = resolveWidgetState(config);
    applyInteractionStyles(el, config, stateStr);

    // Prompt Editor overrides: specific handling for readOnly mode and cursor
    const isInteractionDisabled = config.readOnly || stateStr === "DIS";
    el.contentEditable = isInteractionDisabled ? "false" : "true";
    if (!isInteractionDisabled && !config.cursor) el.style.cursor = "text";
    el.style.pointerEvents = isInteractionDisabled ? "none" : "auto";

    let { x, y, w, h } = config.geometry;

    // 2. Determine State Suffix
    const suffix = stateStr === "DIS" ? "_DIS" : (stateStr === "ON" ? "_ON" : "");

    // 3. Resolve Paint Data
    const resolvedBody = resolvePaintData(node, props.bodyKey, suffix);
    const resolvedLabel = resolvePaintData(node, props.labelKey, suffix);

    // 4. Force Font Consistency & Fallback
    let fontSize = props.fontSize || resolvedLabel?.fontSize || 10;
    const fontFamily = config.fontFamily || resolvedLabel?.font || "Arial";

    // 5. Pre-calculate Metrics for Clamping
    const pX = (props.padding?.[0] || 0);
    const availableWidth = w - (pX * 2);

    // 6. Internal Auto-Width Logic
    if (config.autoWidth && document.activeElement !== el) {
        const measuredW = measureTextWidth(el.value, fontSize, fontFamily) + 10;
        w = Math.min(w, measuredW);
    }

    const coords = calculateScreenCoords(node, app, x, y, w, h);

    // Crash Prevention: Return if coords is null (off-screen/initializing)
    if (!coords) return;

    // 7. Update Value & Apply Text Clamp (Truncate with ellipsis if overflowing)
    const content = getWidgetContent(config);
    const valToSync = content.value;
    if (valToSync !== undefined && valToSync !== null && document.activeElement !== el) {
        const rawText = valToSync.toString();
        // Cut the string off and add "..." if it exceeds area allocated
        el.value = clampText(rawText, availableWidth, fontSize, fontFamily);
    }

    // 8. Position & Layout using standardized alignment map
    const [alignX, alignY] = props.labelAlign || ["left", "middle"];

    // THE LAG FIX: Only update DOM layout properties if they actually changed
    const geoKey = `${coords.left}-${coords.top}-${coords.width}-${coords.height}`;
    if (el._lastGeoKey !== geoKey) {
        el._lastGeoKey = geoKey;
        el.style.left = coords.left;
        el.style.top = coords.top;
        el.style.width = coords.width;
        el.style.height = coords.height;
    }

    el.style.display = "block";
    el.style.textAlign = alignX;

    // Cleanup legacy flexbox artifacts if present
    el.style.justifyContent = "";
    el.style.alignItems = "";

    // 9. Calculate Metrics
    const scaledFS = fontSize * coords.scale;
    const numH = parseFloat(coords.height); // Total height in px

    // Get raw horizontal padding (pX already declared in Step 5)
    const scaledPX = pX * coords.scale;

    // 10. Manual Vertical Centering Logic
    let finalPy = (props.padding?.[1] || 0) * coords.scale;

    if (alignY === "middle") {
        finalPy = Math.max(0, (numH - scaledFS) / 2);
    } else if (alignY === "bottom") {
        finalPy = Math.max(0, numH - scaledFS - finalPy);
    }

    // 11. Theme Rendering
    // STRICTLY follow the theme keys. No forced transparency or state switching.
    const paintData = { ...(resolvedBody || {}) };
    paintData.font = fontFamily;
    paintData.fontSize = fontSize;
    // THE FIX: Pure Red fallback for text color
    paintData.textColor = config.textColor || resolvedLabel?.textColor || resolvedLabel?.fill || "red";

    if (resolvedLabel) {
        paintData.textShadow = resolvedLabel.textShadow || resolvedLabel.shadow;
        paintData.glow = resolvedLabel.glow;
    }

    if (props.fontOffset) {
        el.style.transform = `translateY(${props.fontOffset * coords.scale}px)`;
    } else {
        el.style.transform = "none";
    }

    applyHTMLTheme(el, paintData, coords.scale);

    // 12. Final Box Sizing & CSS Padding
    el.style.boxSizing = "border-box";
    el.style.padding = `${finalPy}px ${scaledPX}px`;

    // CRITICAL: Force line-height to 1.
    el.style.lineHeight = "1";
    el.style.fontSize = `${scaledFS}px`;
}