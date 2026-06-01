/**
 * Specialist: ./herbina/widgets/btnIcon.js
 * PURPOSE: Emoji-based icons for high-visibility IDE aesthetics.
 * STATUS: PROTOCOL COMPLIANT
 * * ACCEPTED PARAMETERS:
 * @param {string} icon - The key from ICON_MAP (e.g., "add", "save", "power").
 * @param {number} iconIndex - For array-based icons, selects the specific symbol (default: 0).
 * @param {string} btnColor - Hardcoded background color override.
 * @param {string} labelColor - Hardcoded icon/text color override.
 * @param {string} state - Force a specific state: "DIS" (disabled), "OFF", "ON".
 * @param {boolean} mouseOver - Enable/disable hover state highlighting (default: true).
 * @param {boolean} pulse - Enable/disable the color pulsing animation.
 * @param {boolean} playSound - Key for SOUND_INDEX to play on press (e.g., "powerUp", "delete").
 * @param {number} alpha - Global opacity multiplier (0.0 to 1.0).
 * @param {number|Array} corners - Border radius override for the background.
 * @param {boolean} skipBackground - If true, only the icon symbol is rendered.
 * @param {number} fontSize - Font size override.
 * @param {string} font - Font family override.
 * @param {Array} padding - [w, h] inner spacing for the icon.
 * @param {function} onPress - Callback fired when the button is clicked/pressed.
 * @param {boolean} useAnim - Toggle to enable/disable specific widget animations.
 */
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { masterPainter, masterPainterText, compileThemeData } from "../masterPainter.js";
import { animateRecoil, RECOIL_SHRINK, RECOIL_SHIFT, animateWidgetColors, getPulsedColor, parseColor } from "../masterAnimator.js";
import { SOUND_INDEX } from "../masterSoundEffects.js";
import {
    resolveWidgetEnv,
    resolveWidgetState,
    resolvePaintData,
    calculateScreenCoords,
    getNextZIndex,
    applyInteractionStyles,
    getWidgetCallbacks,
    getAlignmentMaps,
    resolvePaletteEntry,
    compileAnimatedPaint
} from "../utils/widgetsUtils.js";

const ICON_MAP = {
    add: "＋",
    subtract: "－",
    deck: "⊢",
    undeck: "⊣",
    dockleft: "⊣",
    dockright: "⊢",
    dockleftright: "⊣⊢",
    docktop: "⊤",
    dockbottom: "⊥",
    docktopbottom: "⊤⊥",
    delete: "✕️",
    new: "🗋",
    copy: "❐",
    rename: "✎", // 🖌
    revert: "↺",
    refresh: "⟲",
    save: "🖫",
    trash: "⊝",
    close: "✕",
    power: "⏻",
    anchor: "⚓",
    pin: "⚲",
    fallback: "⏹",
    play: "▶",
    uparrow: "▲",
    downarrow: "▼",
    leftarrow: "❮",
    rightarrow: "❯",
    wireless: "ᯤ",
    preview: "🖺", //🖺, 🖻
    file: "🗀",
    clean: "⌬", //⏚,
    folder: "🗀",
    settings: "⛯", // ⛯, ⛭, ⚙
    ratingglyph: ["", "🆂", "🅰", "🅱", "🅲", "🅳", "🅴", "🅵"] // ☐, ☑, ▢, ▣, ◻, ◼, ☐, ☒, ⭘, ⦿, ⭘, ●,
    // ⌕, 👁, 🎚, 🗁, 🗀, 🗂, 
};

/**
 * HTML Constructor
 */
export function createBtnIcon(callbacks = {}, iconName = "fallback") {
    const el = document.createElement("div");

    el.btnColor = callbacks.btnColor || null;
    el.labelColor = callbacks.labelColor || null;
    el.style.position = "fixed";
    el.style.zIndex = getNextZIndex();
    el.style.cursor = "pointer";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.pointerEvents = "auto";
    el.style.userSelect = "none";

    const lookup = String(iconName).toLowerCase();
    const iconEntry = ICON_MAP[lookup];
    if (Array.isArray(iconEntry)) {
        el.innerText = iconEntry[callbacks.iconIndex || 0] || "";
    } else {
        el.innerText = iconEntry || ICON_MAP.fallback;
    }
    el.dataset.icon = lookup;

    el.dataset.isHovered = "false";
    el.dataset.isPressed = "false";
    el._callbacks = callbacks; // THE FIX: Store for event listeners

    el.addEventListener("pointerenter", () => {
        if (el.dataset.state === "DIS") return;
        el.dataset.isHovered = "true";
        if (el._nodeRef?.requestDerpSync) el._nodeRef.requestDerpSync();
    });
    el.addEventListener("pointerleave", () => {
        el.dataset.isHovered = "false";
        if (el._nodeRef?.requestDerpSync) el._nodeRef.requestDerpSync();
    });

    el.addEventListener("pointerdown", (e) => {
        if (el.dataset.state === "DIS") return;
        el.dataset.isPressed = "true";

        const state = el.dataset.state;
        const { handlePress } = getWidgetCallbacks(el._callbacks, state);
        handlePress(e, e);
        if (el._nodeRef?.requestDerpSync) el._nodeRef.requestDerpSync();
    });

    window.addEventListener("pointerup", () => {
        if (el.dataset.isPressed === "true") {
            el.dataset.isPressed = "false";
            if (el._nodeRef?.requestDerpSync) el._nodeRef.requestDerpSync();
        }
    });

    document.body.appendChild(el);
    return el;
}

/**
 * HTML Synchronizer
 */
export function syncBtnIconHTML(el, node, app, config) {
    if (!el || !node || node.flags?.collapsed || !config.geometry) {
        if (el) el.style.display = "none";
        return;
    }

    let { x, y, w, h } = config.geometry;
    el._nodeRef = node;
    // THE CALLBACK REFRESH FIX: Re-bind the layout configuration every frame.
    // This prevents the HTML element from holding onto stale function closures.
    el._callbacks = config;

    const { alpha: _visibilityCheck } = resolveWidgetEnv(node, config);
    if (_visibilityCheck <= 0) {
        el.style.display = "none";
        return;
    }

    let activeState = resolveWidgetState(config);
    const isPressed = node._pressedRegionKey === config.key || el.dataset.isPressed === "true";
    const isHovered = (config.mouseOver !== false && (node._hoveredRegionKey === config.key || el.dataset.isHovered === "true"));

    const lastValKey = `_btn_html_last_${config.key}`;
    if (node[lastValKey] !== undefined && node[lastValKey] !== isPressed) {
        if (isPressed && config.playSound && SOUND_INDEX && SOUND_INDEX[config.playSound]) {
            SOUND_INDEX[config.playSound]();
        }
    }
    node[lastValKey] = isPressed;

    if (activeState !== "DIS") {
        if (isPressed || isHovered) activeState = "ON";
    }
    el.dataset.state = activeState;

    // THE FAST-HASH GATING: Only resolve theme and recalculate animations if the interactive state,
    // bypass mode, or global session has changed.
    const palStatus = config.palette ? !!resolvePaletteEntry(node, config.palette.path, config.palette.entry || config.key) : false;
    const stateHash = `${activeState}_${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${config.iconIndex || 0}_${config.icon}_${config.btnColor || ""}_${palStatus}_${config.alpha ?? 1}`;
    const needsFullSync = node._shouldSync || el._lastStateHash !== stateHash || (el._isAnimating && (node.properties?.useAnimations !== false));

    if (!needsFullSync && el._lastProps) {
        var { props, bodyPaint, labelPaint } = el._lastProps;
    } else {
        var { props, stateStr, bodyPaint, labelPaint, alpha } = resolveWidgetEnv(node, { ...config, state: activeState });
        el._lastProps = { props, bodyPaint, labelPaint, alpha };
        el._lastStateHash = stateHash;
        applyInteractionStyles(el, config, stateStr);
    }

    // THE DOM SYNC GATING: Prevent layout thrashing by gating coordinate updates with the host's sync state.
    if (app && app.canvas && (node._shouldSync || !el._lastHash)) {
        const coords = calculateScreenCoords(node, app, x, y, w, h);
        const hash = `${coords?.left}_${coords?.top}_${coords?.width}_${coords?.height}_${activeState}`;

        if (coords && el._lastHash !== hash) {
            el._lastHash = hash;
            el.style.display = "flex";
            el.style.left = coords.left;
            el.style.top = coords.top;
            el.style.width = coords.width;
            el.style.height = coords.height;
            // GPU HINT: Promote to compositor layer for high-frequency coordinate/transform shifts
            el.style.willChange = "transform, opacity";
        }
    }

    const { justify: justifyMap, align: alignMap } = getAlignmentMaps();

    // THE CENTER FIX: Icons must ALWAYS be centered regardless of parent layout context
    // THE OPTICAL FIX: Symbols in HTML flex-center often sit 1-2px too low.
    // We force the icon up by 1px to hit the true geometric center.
    const alignX = "center";
    const alignY = "middle";

    el.style.justifyContent = justifyMap[alignX] || "center";
    el.style.alignItems = alignMap[alignY] || "center";
    el.style.textAlign = "center";
    // THE OPTICAL FIX: Push the HTML font up slightly to counteract its bottom-heavy baseline
    el.style.paddingBottom = "1px";
    // THE FIX: Padding is handled by geometry now. CSS padding shifts the flexbox center.
    el.style.padding = "0px";

    const lookup = String(config.icon || "fallback").toLowerCase();
    const iconEntry = ICON_MAP[lookup];
    if (Array.isArray(iconEntry)) {
        const idx = config.iconIndex !== undefined ? config.iconIndex : 0;
        el.innerText = iconEntry[idx] ?? "";
    } else {
        el.innerText = iconEntry || ICON_MAP.fallback;
    }

    // THE FIX: HTML Centralized Animation Implementation
    // THE FIX: HTML Centralized Animation Implementation
    if (bodyPaint && labelPaint) {
        const getFill = (bp) => bp?.fill || bp?.bgColor || bp?.backgroundColor;
        let rawBg = config.btnColor || getFill(bodyPaint) || "transparent";

        // This prevents background overrides (like "transparent") from making the icon text invisible.
        let rawIc = labelPaint?.textColor || labelPaint?.fill || bodyPaint?.textColor || "red";

        if (config.pulse) {
            const bodyOn = resolvePaintData(node, props.bodyKey, "_ON");
            const bodyOff = resolvePaintData(node, props.bodyKey, "_OFF");
            const lblOn = resolvePaintData(node, props.labelKey, "_ON");
            const lblOff = resolvePaintData(node, props.labelKey, "_OFF");

            const cBgOn = parseColor(bodyOn?.fill) || [255, 0, 0, 1];
            const cBgOff = parseColor(bodyOff?.fill) || [100, 100, 100, 1];
            const cIcOn = parseColor(bodyOn?.textColor || lblOn?.textColor || lblOn?.fill) || [255, 255, 255, 1];
            const cIcOff = parseColor(bodyOff?.textColor || lblOff?.textColor || lblOff?.fill) || [150, 150, 150, 1];

            rawBg = getPulsedColor(cBgOff, cBgOn, 0.005);
            rawIc = getPulsedColor(cIcOff, cIcOn, 0.005);
            node._derpAwakeFrames = 2; // Keep Fatha awake
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        }

        const nodeAnims = node.properties?.useAnim !== false && node.properties?.useAnimations !== false && node.properties?.animations !== false && node.properties?.showAnim !== false;
        const globalAnims = window.xcpDerpSettings?.useAnimations !== false && window.xcpDerpSettings?.showAnim !== false;
        const useAnim = (config.showAnim !== false) && (config.useAnim !== false) && (props.showAnim !== false) && (props.useAnim !== false) && nodeAnims && globalAnims;

        // THE FIX: Prefix the animation state key if inside the System Panel to prevent
        // cross-bleeding colors when buttons share the same layout key (e.g., 'btnSaveBook')
        const prefix = config.isSysPanel ? "_sys_" : "";
        const animKey = `_btnIcon_html_anim${prefix}_${config.key}`;

        const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, alpha, useAnim);
        el._isAnimating = isAnimating;

        if (useAnim && isAnimating) {
            if (node._derpAwakeFrames !== undefined) node._derpAwakeFrames = 2;
        }

        el.style.opacity = alpha;
        const animatedPaint = compileAnimatedPaint(bodyPaint, config, alpha, { fill: fillColor, textColor: iconColor, corners: config.corners });

        // 1. Apply theme FIRST so it doesn't overwrite our custom font math below
        applyHTMLTheme(el, animatedPaint, coords.scale);

        // 2. THE PARITY FIX: Match Canvas sizing math exactly.
        // 2. THE PARITY FIX: Match Canvas sizing math exactly.
        const padW = (props.padding ? props.padding[0] * 2 : 0);
        const padH = (props.padding ? props.padding[1] * 2 : 0);
        const themeFontSize = props.fontSize || labelPaint.fontSize || 12;
        const innerDim = Math.min(w - padW, h - padH);
        const iconScale = Number(config.iconScale);
        const resolvedIconScale = Number.isFinite(iconScale) ? iconScale : 0.5;
        // THE SCALE FIX: Explicit font sizes stay authoritative. When iconScale is provided,
        // allow the glyph to grow with the button instead of being capped by the theme font size.
        const fontSize = props.fontSize
            ? Math.min(themeFontSize, innerDim)
            : (Number.isFinite(iconScale)
                ? Math.min(innerDim, Math.max(themeFontSize, innerDim * resolvedIconScale))
                : Math.min(themeFontSize, innerDim * resolvedIconScale));

        // Apply text styling LAST so the element keeps the calculated size
        el.style.fontSize = `${fontSize * coords.scale}px`;
        const parsedFont = (labelPaint?.font || "arial").replace(/px/g, '').trim();
        el.style.fontFamily = `"${parsedFont}"`;
        el.style.fontWeight = props.fontWeight || labelPaint?.fontWeight || "normal";
    }
}

/**
 * Canvas Synchronizer
 */
export function syncBtnIcon(ctx, node, config) {
    if (node.flags?.collapsed || !config.geometry) return;

    const { alpha: _visibilityCheck } = resolveWidgetEnv(node, config);
    if (_visibilityCheck <= 0) return;

    let { x, y, w, h } = config.geometry;

    let activeState = resolveWidgetState(config);
    const isPressed = node._pressedRegionKey === config.key;
    const isHovered = (config.mouseOver !== false && node._hoveredRegionKey === config.key);

    const lastValKey = `_btn_last_${config.key}`;
    if (node[lastValKey] !== undefined && node[lastValKey] !== isPressed) {
        if (isPressed && config.playSound && SOUND_INDEX && SOUND_INDEX[config.playSound]) {
            SOUND_INDEX[config.playSound]();
        }
    }
    node[lastValKey] = isPressed;

    if (activeState !== "DIS") {
        if (isPressed || isHovered) activeState = "ON";
    }

    // THE FAST-HASH GATING: Reuse resolved theme properties if the button's visual state is static.
    // THE PALETTE HASH FIX: Include palette load status so the cache busts when the async fetch completes.
    const palStatus = config.palette ? !!resolvePaletteEntry(node, config.palette.path, config.palette.entry || config.key) : false;
    const stateHash = `${activeState}_${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${config.iconIndex || 0}_${config.icon}_${config.btnColor || ""}_${palStatus}_${config.alpha ?? 1}`;
    const cache = node._btnCache || (node._btnCache = {});
    const itemCache = cache[config.key] || (cache[config.key] = {});

    if (itemCache.hash === stateHash && itemCache.props && !node._forceSync) {
        var { props, bodyPaint, labelPaint, alpha } = itemCache.props;
        var state = activeState;
    } else {
        var { props, stateStr: state, bodyPaint, labelPaint, alpha } = resolveWidgetEnv(node, { ...config, state: activeState });
        if (!bodyPaint || !labelPaint) return;
        itemCache.hash = stateHash;
        itemCache.props = { props, bodyPaint, labelPaint, alpha };
    }

    // Recoil Animation Logic
    const pressAmt = (node._pressedRegionKey === config.key && state !== "DIS") ? (node._visualPress || 0) : 0;
    if (pressAmt > 0) {
        const shrink = RECOIL_SHRINK * pressAmt;
        const shiftX = (w * RECOIL_SHIFT) * pressAmt;
        const shiftY = (h * RECOIL_SHIFT) * pressAmt;
        x += shiftX; y += shiftY;
        w *= (1 - shrink); h *= (1 - shrink);
    }

    const getFill = (bp) => bp?.fill || bp?.bgColor || bp?.backgroundColor;
    let rawBg = config.btnColor || getFill(bodyPaint) || "transparent";
    let rawIc = labelPaint?.textColor || labelPaint?.fill || bodyPaint?.textColor || "red";

    if (config.pulse) {
        const bodyOn = resolvePaintData(node, props.bodyKey, "_ON");
        const bodyOff = resolvePaintData(node, props.bodyKey, "_OFF");
        const lblOn = resolvePaintData(node, props.labelKey, "_ON");
        const lblOff = resolvePaintData(node, props.labelKey, "_OFF");

        const cBgOn = parseColor(bodyOn?.fill) || [255, 0, 0, 1];
        const cBgOff = parseColor(bodyOff?.fill) || [100, 100, 100, 1];
        const cIcOn = parseColor(bodyOn?.textColor || lblOn?.textColor || lblOn?.fill) || [255, 255, 255, 1];
        const cIcOff = parseColor(bodyOff?.textColor || lblOff?.textColor || lblOff?.fill) || [150, 150, 150, 1];

            rawBg = getPulsedColor(cBgOff, cBgOn, 0.005);
            rawIc = getPulsedColor(cIcOff, cIcOn, 0.005);
        node._derpAwakeFrames = 2; // Keep Fatha awake
        if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    }

    const nodeAnims = node.properties?.useAnim !== false && node.properties?.useAnimations !== false && node.properties?.animations !== false && node.properties?.showAnim !== false;
    const globalAnims = window.xcpDerpSettings?.useAnimations !== false && window.xcpDerpSettings?.showAnim !== false;
    const useAnim = (config.showAnim !== false) && (config.useAnim !== false) && (props.showAnim !== false) && (props.useAnim !== false) && nodeAnims && globalAnims;

    const prefix = config.isSysPanel ? "_sys_" : "";
    const animKey = `_btnIcon_anim${prefix}_${config.key}`;

    const { fillColor, iconColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, alpha, useAnim);

    if (useAnim && (isAnimating || pressAmt > 0)) {
        if (node._derpAwakeFrames !== undefined) node._derpAwakeFrames = 2;
    }

    const animatedPaint = compileAnimatedPaint(bodyPaint, config, alpha, { fill: fillColor, textColor: iconColor, corners: config.corners });
    if (config.corners !== undefined) {
        animatedPaint.corners = config.corners;
    }

    if (alpha < 1) {
        ctx.save();
        ctx.globalAlpha *= alpha;
    }

    // Background Render
    if (!config.skipBackground) {
        masterPainter(ctx, {
            width: w, height: h, posX: x, posY: y,
            paintData: animatedPaint,
            color: fillColor
        });
    }

    const lookup = String(config.icon || "fallback").toLowerCase();
    const iconEntry = ICON_MAP[lookup];
    const idx = config.iconIndex !== undefined ? config.iconIndex : 0;
    const symbol = Array.isArray(iconEntry) ? (iconEntry[idx] ?? "") : (iconEntry || ICON_MAP.fallback);

    // Text Geometry
    const padW = (props.padding ? props.padding[0] * 2 : 0);
    const padH = (props.padding ? props.padding[1] * 2 : 0);
    const themeFontSize = props.fontSize || labelPaint.fontSize || 12;
    const innerDim = Math.min(w - padW, h - padH);
    const iconScale = Number(config.iconScale);
    const resolvedIconScale = Number.isFinite(iconScale) ? iconScale : 0.5;
    // THE SCALE FIX: Explicit font sizes stay authoritative. When iconScale is provided,
    // allow the glyph to grow with the button instead of being capped by the theme font size.
    const fontSize = props.fontSize
        ? Math.min(themeFontSize, innerDim)
        : (Number.isFinite(iconScale)
            ? Math.min(innerDim, Math.max(themeFontSize, innerDim * resolvedIconScale))
            : Math.min(themeFontSize, innerDim * resolvedIconScale));

    // THE OPTICAL FIX: Canvas 'middle' baseline often floats slightly high for square icons.
    // THE PARITY FIX: Use proportional nudge (0.125 * h) instead of static 1.5 to maintain alignment when scaled.
    masterPainterText(ctx, {
        text: symbol,
        x: x + (w / 2),
        y: y + (h / 2),
        align: "center",
        baseline: "middle",
        paintData: {
            ...labelPaint,
            font: labelPaint.font || "Arial",
            fontSize: fontSize,
            fontWeight: props.fontWeight || labelPaint?.fontWeight || "normal",
            fill: iconColor
        }
    });

    if (alpha < 1) ctx.restore();
}
