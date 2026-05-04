/**
 * Specialist: ./herbina/widgets/widget_Dropdown.js
 * ROLE: The "Oops, I dropped my options" selector.
 * STATUS: 100% Organic HTML-in-Canvas Hybrid.
 * PURPOSE: Making sure you can pick 'Tomato' without your OS making it look like a 1995 scrollbar.
 * * ACCEPTED CALLER ARGUMENTS:
 * - key (String): Unique ID for the widget instance.
 * - geometry (Object): {x, y, w, h} - Where it sits.
 * - themeKey (String): "bodyTheme, textTheme" pairing.
 * - items (Array): List of strings for the picker.
 * - indicator (Boolean/String): "on" or true shows the ▼ arrow.
 * - skipBackground (Boolean): If true, the trigger box becomes a ghost (no background).
 * - alpha (Number): Global transparency (0-1).
 * - padding (Array): [horizontal, vertical] spacing.
 * - canvasShield (Boolean): If true, draws to Canvas when not active.
 * - callbacks (Object): {onChange: (val) => ...}
 */
import { app as comfyApp } from "../../../../scripts/app.js";
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { masterPainter, masterPainterText, compileThemeData } from "../masterPainter.js";
import { toRGBA } from "../utils/colorMath.js";
import {
    syncSingletonShield,
    toggleSingletonShield,
    executeShieldedInteraction,
    syncElementToCanvas
} from "../utils/singletonController.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    getNextZIndex,
    applyInteractionStyles,
    getAlignmentMaps,
    snapToScreenGrid,
    parseThemeKey,
    measureTextHeight, // THE FIX: Import text math utility
    measureTextWidth,
    resolvePaletteEntry
} from "../utils/widgetsUtils.js";
import { lerpTo, animateAlpha, animateWidgetColors } from "../masterAnimator.js";
import { getDerpVars } from "../../fatha/fatha.js";
import { setupDerpScrollBar, updateDerpScrollBar } from "./derpScrollBar.js";
import {
    isWidgetAnimationEnabled,
    createHybridDropdownHTML,
    buildPickerDOMContainer,
    handleHybridPickerClosePhase,
    finalizeHybridPickerCleanup,
    appendHybridPickerRow,
    syncHybridScroll
} from "./helpers/dropdown_lib.js";

export const DROPDOWN_ANIM_SETTINGS = {
    lerpFactor: 0.25,   // Speed of box expansion/shrink
    lerpCurve: 0.5,    // THE FIX: Higher values slow the start and snap the end harder
    alphaFactor: 0.2,  // Speed of item fade
    fadeThreshold: 0.5, // Box must be 20% open before items fade in
    anchorSize: [10, 4] // Starting dimensions of the expansion dot
};
const DROPDOWN_GLYPH_SCALE = 0.55; // THE GLYPH SCALE FIX: Adjust this to change the relative size of the dropdown arrow/indicator
const PICKER_GLYPH_SCALE = 0.7;
const DROPDOWN_GLYPH_OFFSET = 1;
const lineTop = "rgba(0, 0, 0, 0.2)";
const lineBottom = "rgba(255, 255, 255, 0.05)";
const PREVIEW_BORDER_COLOR = "rgba(0, 0, 0, 0.5)";
const DEFAULT_VISIBLE_LIMIT = 15;

/**
 * THE FIX: Robust Animation Toggle Check mirroring singletonEngine's logic.
 * Scans widget config, host node properties, and global settings.
 */
let activePicker = null;
let lastOpenTime = 0; // THE FIX: Track open time to prevent instant-close

function closePicker() {
    if (handleHybridPickerClosePhase(activePicker, lastOpenTime, comfyApp)) return;
    finalizePickerCleanup();
}

/**
 * THE FIX: Final removal called after closing animation finishes
 */
function finalizePickerCleanup() {
    finalizeHybridPickerCleanup(activePicker, toggleSingletonShield, closePicker);
    activePicker = null;
}

// THE GLOBAL HOOK: Allow the framework to force-close pickers during major state transitions (like Basta switches)
window._xcpCloseActiveDropdown = () => {
    if (activePicker) {
        activePicker._isClosing = false;
        finalizePickerCleanup();
    }
};

/**
 * HTML Constructor for the Dropdown Trigger
 */
export function createDropdownDerp(callbacks = {}) {
    return createHybridDropdownHTML(callbacks, ["▶", "▼"]);
}

/**
 * Creates the floating list of options
 */
function openPicker(sourceEl, config, node, callbacks) {
    // THE GHOSTING FIX: Force immediate removal of any existing picker
    // to prevent orphaned DOM elements when spam-clicking or switching themes.
    if (activePicker) {
        activePicker.remove();
        activePicker = null;
    }

    // THE LOOP FIX: Immediately clear the engine's pressed state so this doesn't
    // re-trigger on the next animation frame.
    if (node && node._pressedRegionKey === config.key) {
        node._pressedRegionKey = null;
    }

    lastOpenTime = Date.now();
    const ds = comfyApp.canvas.ds;
    const scale = ds.scale;
    const items = config.items || [];

    const pX = (config.padding?.[0] || 4);
    const fs = (config.fontSize || 10);
    const iconOffset = (config.indicator === true || config.indicator === "on") ? (fs * PICKER_GLYPH_SCALE * 1.2) + DROPDOWN_GLYPH_OFFSET : 0;
    const { sH, oY, sW, mW } = getDerpVars(node);

    const { bodyKey, labelKey } = parseThemeKey(config.themeKey, "t_textsystem");
    const listPaint = resolvePaintData(node, bodyKey, "_OFF") || node._panelPaintData_OFF;
    const rowPaintOFF = resolvePaintData(node, labelKey, "_OFF") || node._t_textnormalPaintData_OFF;
    const rowPaintON = resolvePaintData(node, labelKey, "_ON") || node._t_textnormalPaintData_ON;

    const dynamicRowHeight = config.geometry?.h || 24;

    const picker = document.createElement("div");
    picker._sourceEl = sourceEl;
    picker._dynamicRowHeight = dynamicRowHeight;
    picker._offsetY = oY;
    picker.style.userSelect = "none"; // THE SELECTION FIX: Completely disable drag selection box

    picker._visibleLimit = node.properties?.dropdownVisibleLimit || DEFAULT_VISIBLE_LIMIT;
    picker._hideScrollbar = node.properties?.hideScrollbar !== false;

    picker._isClosing = false;

    const [aW, aH] = DROPDOWN_ANIM_SETTINGS.anchorSize;
    picker._currentSize = [config.geometry?.w || 200, aH];
    picker._itemAlpha = 0;

    picker.style.position = "fixed";
    picker.style.zIndex = getNextZIndex() + 2000;
    picker.style.opacity = 0;
    applyHTMLTheme(picker, listPaint, scale);
    picker.style.display = "flex";
    picker.style.flexDirection = "column";
    picker.style.overflow = "hidden";
    picker.classList.add("derp-scrollbar-hidden");

    const { headerWrapper, separator, scrollBounds, contentWrapper, previewBox, previewImg } = buildPickerDOMContainer(picker, listPaint, scale, sH);

    let hContent = "";
    if (config.dropdownHeaderText) {
        const onPaint = resolvePaintData(node, labelKey, "_ON");
        const lColor = onPaint?.textColor || onPaint?.fill || (rowPaintON?.textColor || rowPaintON?.fill || "#ffffff");
        hContent = `<span style="color: ${lColor}">${config.dropdownHeaderText}</span>`;
    } else if (config.label && config.text && config.label !== "") {
        const onPaint = resolvePaintData(node, labelKey, "_ON");
        const lColor = onPaint?.textColor || onPaint?.fill || (rowPaintON?.textColor || rowPaintON?.fill || "#ffffff");
        hContent = `<span style="color: ${lColor}">${config.label}</span><span>${config.text}</span>`;
    } else {
        hContent = config.displayText || "Select...";
    }
    const hasIndicator = config.indicator === true || config.indicator === "on";
    appendHybridPickerRow(headerWrapper, sourceEl, rowPaintOFF, rowPaintON, scale, dynamicRowHeight, hasIndicator ? sourceEl._glyphs[1] : null, hContent, false, pX, iconOffset, sW, PICKER_GLYPH_SCALE, 0);

    const maxH = picker._visibleLimit * dynamicRowHeight;
    picker.style.maxHeight = `${maxH * scale}px`;

    setupDerpScrollBar(scrollBounds, contentWrapper, scale, rowPaintON);

    const rect = sourceEl.getBoundingClientRect();
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.top}px`;
    picker.style.width = `${rect.width}px`;

    items.forEach(item => {
        const isObj = typeof item === 'object' && item !== null;
        const displayStr = isObj ? (item.display || item.name || item.value) : item;
        const valStr = isObj ? (item.value || item.key || item.name) : item;
        const imgUrl = isObj ? (item.imageUrl || item.image) : null;

        let rowHTML = "";
        if (isObj && item.label && displayStr) {
            const activeON = rowPaintON || rowPaintOFF;
            const lColor = activeON?.textColor || activeON?.fill || "#ffffff";
            rowHTML = `<span style="color: ${lColor}">${item.label}</span><span>${displayStr}</span>`;
        } else if (isObj && item.display) {
            rowHTML = displayStr;
        } else {
            rowHTML = displayStr;
        }

        const isSelected = valStr === config.value;
        const row = appendHybridPickerRow(contentWrapper, sourceEl, rowPaintOFF, rowPaintON, scale, dynamicRowHeight, null, rowHTML, isSelected, pX, iconOffset, sW, 0.8, mW);
        row.style.cursor = "pointer";

        row.onmouseenter = () => {
            row.style.backgroundColor = rowPaintON?.fill || "rgba(255,255,255,0.1)";
            // THE PREVIEW UPDATE: Show side-preview sidecar if the item has an image (matches widget_FileBrowser)
            if (imgUrl && picker._previewBox) {
                picker._previewImg.src = imgUrl;
                picker._previewBox.style.display = "block";
                const tempImg = new Image();
                tempImg.src = imgUrl;
                tempImg.onload = () => {
                    picker._aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;
                    if (node.setDirtyCanvas) node.setDirtyCanvas(true);
                };
            } else if (picker._previewBox) {
                picker._previewBox.style.display = "none";
            }
        };
        row.onmouseleave = () => {
            row.style.backgroundColor = "transparent";
            if (picker._previewBox) picker._previewBox.style.display = "none";
        };
        row.onclick = (e) => {
            e.stopPropagation();
            // THE AWAKE GATE: Ensure framework stays alive for the closure animation
            if (node) node._derpAwakeFrames = 10;
            if (callbacks.onChange) callbacks.onChange(valStr);
            closePicker();
        };

        contentWrapper.appendChild(row);
    });

    // THE AUTO-SCROLL ENGINE: On initial open, jump the scroll position to the selected item.
    if (!picker._hasAutoScrolled) {
        const selectedIndex = items.findIndex(item =>
            (item.name || item) === config.value || item.key === config.value || item.value === config.value || item === config.value
        );

        // THE ACTIVE SCROLL FIX: Only attempt auto-scroll if the list actually exceeds the visible limit.
        if (selectedIndex !== -1 && items.length > picker._visibleLimit) {
            const totalContentH = items.length * dynamicRowHeight;
            const viewportH = picker._visibleLimit * dynamicRowHeight;

            // Center the item: (Index * Height) - (Half Viewport) + (Half Item Height)
            let scrollPos = (selectedIndex * dynamicRowHeight) - (viewportH / 2) + (dynamicRowHeight / 2);

            // Clamp the scroll position so we don't show empty space at the top or bottom boundaries
            const maxScroll = Math.max(0, totalContentH - viewportH);
            const finalScroll = Math.max(0, Math.min(scrollPos, maxScroll));

            scrollBounds._scrollTop = finalScroll;
            if (scrollBounds._updateScroll) scrollBounds._updateScroll(scale);

            requestAnimationFrame(() => {
                if (scrollBounds) {
                    scrollBounds._scrollTop = finalScroll;
                    if (scrollBounds._updateScroll) scrollBounds._updateScroll(scale);
                }
            });
        }
        picker._hasAutoScrolled = true;
    }

    if (scrollBounds._updateScroll) scrollBounds._updateScroll(scale);

    document.body.appendChild(picker);
    activePicker = picker;

    toggleSingletonShield(true, closePicker);
}

/**
 * HTML Synchronizer
 */
export function syncDropdownDerp(context, node, app, config) {
    if (config === undefined && app?.geometry) {
        config = app;
        app = comfyApp;
    } else {
        app = app || comfyApp;
    }

    if (!config?.geometry) return;
    const safeConfig = config;
    const appRef = app;

    const isCanvas = !!(context && (context.canvas || context instanceof CanvasRenderingContext2D));
    const useCanvasShield = safeConfig.canvasShield === true; // Default OFF

    let el;
    if (isCanvas) {
        if (!node._derpDomElements) node._derpDomElements = {};
        el = node._derpDomElements[safeConfig.key];
        if (!el) {
            el = createDropdownDerp(safeConfig.callbacks || {});
            node._derpDomElements[safeConfig.key] = el;
        }

        // Setup Canvas click interception when DOM is shielded
        let liveReg = node.layout?.regions?.[safeConfig.key];
        if (safeConfig.isSysPanel && window.xcpFathaSysState?.layout?.regions) {
            liveReg = window.xcpFathaSysState.layout.regions[safeConfig.key];
        }

        if (liveReg) {
            if (!liveReg.onPress && !liveReg.onClick) {
                liveReg.onPress = (e) => {
                    // THE FIX: Stop propagation to prevent Fatha's global handler
                    if (e && e.stopPropagation) e.stopPropagation();
                    if (liveReg.state === "DIS") return;

                    executeShieldedInteraction(node, app, safeConfig.geometry.x, safeConfig.geometry.y, safeConfig.geometry.w, safeConfig.geometry.h, () => {
                        // THE AWAKE GATE: Keep engine active during picker initialization
                        node._derpAwakeFrames = 10;
                        if (activePicker && activePicker._sourceEl === el) {
                            closePicker();
                        } else {
                            // THE FIX: Pass safeConfig directly so it finds Fatha's onChange handler
                            openPicker(el, safeConfig, node, safeConfig);
                        }
                        node.setDirtyCanvas(true, true); // Force immediate visual update
                    });
                    return true;
                };
            }
        }
    } else {
        el = context;
    }

    if (!el) return;

    const { x, y, w, h } = safeConfig.geometry;
    const isAwake = activePicker && activePicker._sourceEl === el;

    // THE FAST-HASH GATING: Prevent redundant theme lookups and color math when the UI is static
    const isPressed = safeConfig.isPressed || node._pressedRegionKey === safeConfig.key || (el.dataset && el.dataset.isPressed === "true");
    const isHovered = (safeConfig.mouseOver !== false && (node._hoveredRegionKey === safeConfig.key || (el.dataset && el.dataset.isHovered === "true")));
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${safeConfig.value}_${isAwake}`;

    const needsFullSync = node._shouldSync || el._lastStateHash !== stateHash || (el._isAnimating && isWidgetAnimationEnabled(safeConfig, node, appRef));

    if (!needsFullSync && el._lastProps) {
        var { props, stateStr, bodyKey, labelKey, bodyPaint: paintData, labelPaint: labelData, fs, hasIndicator, arrowWidth, animatedFillColor, animatedTextColor, rawBg, rawIc, alpha } = el._lastProps;
    } else {
        const themeParts = (safeConfig.themeKey || "").split(",").map(p => p.trim());
        var bodyKey = themeParts.length > 1 ? themeParts[0] : "panel";
        var labelKey = themeParts.length === 1 ? themeParts[0] : (themeParts[1] || "t_textsmall");

        const envConfig = { ...safeConfig, themeKey: `${bodyKey}, ${labelKey}` };
        var { props, stateStr, bodyPaint: paintData, labelPaint: labelData, alpha } = resolveWidgetEnv(node, envConfig);

        // THE CENTRALIZED PALETTE PRIORITY: Check if a specific palette file/entry is requested
        const palConfig = safeConfig.palette;
        if (palConfig) {
            const rawEntry = resolvePaletteEntry(node, palConfig.path, palConfig.entry);
            if (rawEntry?.entries) {
                const state = (stateStr === "ON") ? "ON" : (stateStr === "DIS" ? "DIS" : "OFF");
                const compiled = compileThemeData({ ...rawEntry.entries.main, _category: "panel" }, bodyKey, state);
                if (compiled) {
                    paintData = compiled;
                }
            }
        }

        // THE BYPASS FIX: Ensure state remains OFF if explicitly requested and mouseOver is disabled
        if (stateStr === "ON" && (safeConfig.state === "OFF" && safeConfig.mouseOver === false)) {
            stateStr = "OFF";
            const resolved = resolveWidgetEnv(node, { ...envConfig, state: "OFF" });
            props = resolved.props;
            paintData = resolved.bodyPaint;
            labelData = resolved.labelPaint;
        }

        var fs = props.fontSize || labelData?.fontSize || 10;
        var hasIndicator = safeConfig.indicator === true || safeConfig.indicator === "on";
        var arrowWidth = hasIndicator ? (fs * DROPDOWN_GLYPH_SCALE * 1.2) + DROPDOWN_GLYPH_OFFSET : 0;

        var rawBg = safeConfig.btnColor || paintData?.fill || "transparent";
        var rawIc = safeConfig.textColor || labelData?.textColor || labelData?.fill || "red";
        const useAnim = isWidgetAnimationEnabled(safeConfig, node, app);
        const sysAlpha = safeConfig.alpha !== undefined ? safeConfig.alpha : 1;
        const animKey = `_derpDropdown_anim_${safeConfig.key}`;

        var { fillColor: animatedFillColor, iconColor: animatedTextColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);

        el._isAnimating = isAnimating;
        el._lastStateHash = stateHash;
        el._lastProps = { props, stateStr, bodyKey, labelKey, bodyPaint: paintData, labelPaint: labelData, fs, hasIndicator, arrowWidth, animatedFillColor, animatedTextColor, rawBg, rawIc, alpha };
        if (el.dataset) el.dataset.state = stateStr;
    }

    // --- CANVAS RENDERING PASS (SHIELD) ---
    if (isCanvas) {
        if (alpha <= 0) return;

        if (safeConfig.isPressed && !isAwake) {
            executeShieldedInteraction(node, app, safeConfig.geometry.x, safeConfig.geometry.y, safeConfig.geometry.w, safeConfig.geometry.h, () => {
                node._derpAwakeFrames = 10;
                openPicker(el, safeConfig, node, safeConfig);
                node.setDirtyCanvas(true, true);
            });
        }

        if (useCanvasShield && !isAwake) {
            const ctx = context;
            ctx.save();
            if (alpha < 1) ctx.globalAlpha *= alpha;

            const dsScale = app?.canvas?.ds?.scale || 1;
            const safePaintData = safeConfig.corners ? { ...paintData, corners: safeConfig.corners } : { ...paintData };

            if (!safeConfig.skipBackground) {
                masterPainter(ctx, {
                    width: w, height: h,
                    posX: snapToScreenGrid(x, dsScale),
                    posY: snapToScreenGrid(y, dsScale),
                    paintData: safePaintData,
                    color: animatedFillColor // THE FIX: Apply animated color
                });
            }

            if (labelData && props.displayText) {
                const { canvas: canvasAlignMap } = getAlignmentMaps();
                const [alignX, alignY] = props.labelAlign || ["left", "middle"];

                const pX = (safeConfig.padding?.[0] || 0);
                const iconOffset = hasIndicator ? (fs * DROPDOWN_GLYPH_SCALE * 1.2) + DROPDOWN_GLYPH_OFFSET : 0;

                let textX = snapToScreenGrid(x + pX + iconOffset, dsScale);
                if (alignX === "center") textX = snapToScreenGrid(x + (w / 2), dsScale);
                else if (alignX === "right") textX = snapToScreenGrid(x + w - pX, dsScale);

                const textY = snapToScreenGrid(y + (h / 2), dsScale);

                ctx.save();
                ctx.beginPath();
                ctx.rect(x + pX, y, w - (pX * 2), h);
                ctx.clip();

                const textPaint = {
                    ...labelData,
                    font: labelData.font || "Arial",
                    fontSize: fs,
                    fill: animatedTextColor
                };

                if (hasIndicator) {
                    masterPainterText(ctx, {
                        text: el._glyphs[0],
                        x: snapToScreenGrid(x + pX, dsScale),
                        y: textY,
                        align: "left",
                        baseline: "middle",
                        paintData: { ...textPaint, fontSize: fs * DROPDOWN_GLYPH_SCALE }
                    });
                }

                if (safeConfig.label && safeConfig.text && safeConfig.label !== "") {
                    // THE BYPASS FIX: Handle the explicit DIS state for bypassed LoRAs
                    const isDis = (stateStr === "DIS");

                    // When active (ON/OFF), labels are bright (_ON) and values are standard (_OFF)
                    const lblPaint = resolvePaintData(node, labelKey, isDis ? "_DIS" : "_ON");
                    const labelColor = lblPaint?.textColor || lblPaint?.fill || animatedTextColor;

                    const valPaint = resolvePaintData(node, labelKey, isDis ? "_DIS" : "_OFF");
                    const valueColor = valPaint?.textColor || valPaint?.fill || animatedTextColor;

                    const labelW = measureTextWidth(safeConfig.label, fs, textPaint.font, textPaint.fontWeight);
                    const textW = measureTextWidth(safeConfig.text, fs, textPaint.font, textPaint.fontWeight);
                    const totalW = labelW + textW;

                    let startX = textX;
                    if (canvasAlignMap[alignX] === "center") startX = textX - (totalW / 2);
                    else if (canvasAlignMap[alignX] === "right") startX = textX - totalW;

                    masterPainterText(ctx, {
                        text: safeConfig.label, x: startX, y: textY, align: "left", baseline: "middle", paintData: { ...textPaint, fill: labelColor }
                    });
                    masterPainterText(ctx, {
                        text: safeConfig.text, x: startX + labelW, y: textY, align: "left", baseline: "middle", paintData: { ...textPaint, fill: valueColor }
                    });
                } else {
                    masterPainterText(ctx, {
                        text: props.displayText,
                        x: textX,
                        y: textY,
                        align: canvasAlignMap[alignX] || "left",
                        baseline: "middle",
                        paintData: textPaint
                    });
                }

                ctx.restore();
            }
            ctx.restore();
        }
    }

    // --- HTML OVERLAY PASS ---
    if (!app || !app.canvas || !app.canvas.ds) return;
    const scale = syncElementToCanvas(el, node, app, x, y, w, h);
    if (scale === null) return;
    el.style.opacity = alpha;

    // THE OPTIMIZATION: DOM Thrash Gate using stable theme colors and content
    const syncKey = `${stateStr}-${rawBg}-${rawIc}-${props.displayText}-${scale}-${w}-${h}-${safeConfig.label}-${safeConfig.text}`;
    if (el._lastSyncKey !== syncKey || node._forceSync) {
        el._lastSyncKey = syncKey;

        // Physically sync engine dimensions to the DOM
        el.style.width = `${w * scale}px`;
        el.style.height = `${h * scale}px`;

        el._config = safeConfig;
        el._node = node;

        // HTML interaction interceptor (used when shield is off or picker is awake)
        el.onclick = (e) => {
            if (stateStr === "DIS") return;

            // THE HYBRID FIX: If the engine is already handling a press for this key,
            // let the Canvas/Shield logic take the lead to avoid double-spawning.
            if (node._pressedRegionKey === safeConfig.key) return;

            executeShieldedInteraction(node, app, x, y, w, h, () => {
                node._derpAwakeFrames = 10;
                if (activePicker && activePicker._sourceEl === el) {
                    closePicker();
                } else {
                    openPicker(el, safeConfig, node, safeConfig);
                }
            });
        };

        applyInteractionStyles(el, safeConfig, stateStr);

        if (safeConfig.skipBackground) {
            // THE FIX: Apply ghost mode to HTML overlay
            el.style.backgroundColor = "transparent";
            el.style.border = "none";
            el.style.boxShadow = "none";
            el.style.padding = "0px";
        } else if (paintData) {
            applyHTMLTheme(el, paintData, scale);
            // THE CANVAS PARITY FIX: Canvas ignores theme padding for absolute positioning.
            // We must override the HTML theme padding so the inner label spans the exact outer bounding box.
            el.style.padding = "0px";
        } else {
            el.style.borderRadius = `${4 * scale}px`;
            el.style.padding = "0px";
        }

        if (labelData) {
            const { justify: justifyMap, align: alignMap } = getAlignmentMaps();
            const [alignX, alignY] = props.labelAlign || ["left", "middle"];

            // THE PREVIEW FIX: Render active selection image inside the closed dropdown label
            el._label.innerHTML = "";

            // THE MULTI-KEY DISPLAY FIX: Render label and text distinctly in HTML overlay
            if (safeConfig.label && safeConfig.text && safeConfig.label !== "") {
                const isDis = (stateStr === "DIS");

                const lblPaint = resolvePaintData(node, labelKey, isDis ? "_DIS" : "_ON");
                const lblSpan = document.createElement("span");
                lblSpan.innerText = safeConfig.label;
                lblSpan.style.color = lblPaint?.textColor || lblPaint?.fill || rawIc;
                lblSpan.style.pointerEvents = "none";
                el._label.appendChild(lblSpan);

                const valPaint = resolvePaintData(node, labelKey, isDis ? "_DIS" : "_OFF");
                const txtSpan = document.createElement("span");
                txtSpan.innerText = safeConfig.text;
                txtSpan.style.color = valPaint?.textColor || valPaint?.fill || rawIc;
                txtSpan.style.pointerEvents = "none";
                el._label.appendChild(txtSpan);
            } else {
                const txtSpan = document.createElement("span");
                txtSpan.innerText = props.displayText || "Select...";
                txtSpan.style.pointerEvents = "none";
                el._label.appendChild(txtSpan);
            }

            el._label.style.color = rawIc; // Fallback text color on container

            el._label.style.fontSize = `${(props.fontSize || labelData.fontSize || 10) * scale}px`;
            el._label.style.fontFamily = labelData.font || "Arial";
            // THE BASELINE PARITY FIX: Force CSS line-height to exactly match font-size so flexbox centering acts identical to canvas "middle"
            el._label.style.lineHeight = "1";

            const fontWeight = props.fontWeight || labelData.fontWeight || "normal";
            el._label.style.fontWeight = (fontWeight === "bold" || fontWeight === "both") ? "bold" : "normal";
            el._label.style.fontStyle = (fontWeight === "italic" || fontWeight === "both") ? "italic" : "normal";

            el._label.style.justifyContent = justifyMap[alignX] || "flex-start";
            el._label.style.alignItems = alignMap[alignY] || "center";

            const hPad = (safeConfig.padding?.[0] || 0);

            const pX = (safeConfig.padding?.[0] || 4) * scale;
            const iconOffset = hasIndicator ? ((fs * DROPDOWN_GLYPH_SCALE * 1.2) + DROPDOWN_GLYPH_OFFSET) * scale : 0;

            let padL = pX + iconOffset;
            let padR = pX;
            if (alignX === "center") { padL = 0; padR = 0; }

            el._label.style.padding = `0px ${padR}px 0px ${padL}px`;
        }

        const arrowSizeDOM = (props.fontSize || 10) * DROPDOWN_GLYPH_SCALE * scale;
        el._arrow.style.fontSize = `${arrowSizeDOM}px`;
        el._arrow.style.left = `${(safeConfig.padding?.[0] || 4) * scale}px`;
        el._arrow.style.right = "auto";
        el._arrow.style.top = "50%";
        el._arrow.style.transform = "translateY(-50%)";
        el._arrow.style.opacity = "0.8";
        el._arrow.style.display = hasIndicator ? "block" : "none";
    }

    el._arrow.innerHTML = el._glyphs[0];

    // THE FAST-PATH FIX: Touch only bare colors for animations.
    // Moving applyHTMLTheme inside the syncKey gate prevents catastrophic Style Recalculation lag.
    if (!safeConfig.skipBackground) {
        el.style.backgroundColor = animatedFillColor;
    }

    el._label.style.color = animatedTextColor;
    if (el._label.children.length === 2) {
        const isDis = (stateStr === "DIS");
        const isOff = (stateStr === "OFF");

        const lblPaint = resolvePaintData(node, labelKey || "t_textsmall", isDis ? "_DIS" : (isOff ? "_OFF" : "_ON"));
        const valPaint = resolvePaintData(node, labelKey || "t_textsmall", isDis ? "_DIS" : (isOff ? "_DIS" : "_OFF"));

        el._label.children[0].style.color = lblPaint?.textColor || lblPaint?.fill || animatedTextColor;
        el._label.children[1].style.color = valPaint?.textColor || valPaint?.fill || animatedTextColor;
    } else if (el._label.children.length === 1) {
        el._label.children[0].style.color = animatedTextColor;
    }
    el._arrow.style.color = el._label.style.color;

    el.style.display = (isAwake || (isCanvas && useCanvasShield)) ? "none" : "block";

    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (el._isAnimating && node) node._derpAwakeFrames = 5;

    // THE ORPHAN GUARD: If a picker is active but its source element was ripped from the DOM
    // (e.g. during a Basta switch), force it to close immediately without waiting for an animation.
    if (activePicker && (!activePicker._sourceEl || !document.body.contains(activePicker._sourceEl))) {
        window._xcpCloseActiveDropdown();
    }

    // Continuous Frame Sync for active picker
    if (activePicker && activePicker._sourceEl === el) {
        const ds = app.canvas.ds;
        const canvasRect = app.canvas.canvas.getBoundingClientRect();

        const padL = node._padL || 0;
        const screenX = (canvasRect.left + (node.pos[0] + padL + x + ds.offset[0]) * scale).toFixed(2);
        const screenY = (canvasRect.top + (node.pos[1] + y + ds.offset[1]) * scale).toFixed(2);
        // THE FIX: Route the curtain expansion check through the bulletproof global helper
        const useAnim = isWidgetAnimationEnabled(safeConfig, node, app);

        const [aW, aH] = DROPDOWN_ANIM_SETTINGS.anchorSize;
        const dRowH = activePicker._dynamicRowHeight || 24;
        const limit = activePicker._visibleLimit || DEFAULT_VISIBLE_LIMIT;
        const maxH = limit * dRowH;

        const headerCount = activePicker._headerWrapper ? activePicker._headerWrapper.children.length : 0;
        const scrollCount = activePicker._contentWrapper ? activePicker._contentWrapper.children.length : 0;
        const sepHeightLocal = activePicker._sepHeightBase || 0;

        const { mW } = getDerpVars(node);
        const visibleScrollRows = Math.min(scrollCount, activePicker._visibleLimit - headerCount);
        const targetH = (headerCount + visibleScrollRows) * dRowH + sepHeightLocal + mW;

        const targetW = w;
        const targetX = screenX;
        const targetY = screenY;

        // 2. Run Position Lerp
        if (!activePicker._currentPos) activePicker._currentPos = [targetX, targetY];

        const lF = DROPDOWN_ANIM_SETTINGS.lerpFactor;
        const lC = DROPDOWN_ANIM_SETTINGS.lerpCurve || 1.0;

        // THE CURVE FIX: Calculate progress to adjust the speed curve
        // This makes the animation start slower and snap the end faster
        const currentH = activePicker._currentSize[1];
        const distRatio = Math.abs(targetH - currentH) / Math.max(0.1, Math.abs(targetH - aH));
        const activeLF = lF * (1.0 + (1.0 - distRatio) * lC);

        // THE ANTI-LAG FIX: Detect if the user is dragging the node or panning the canvas
        const isInteracting = window._xcpDerpState?.isInteracting === true;

        // THE LAG FIX: Immediate X alignment to screenX
        activePicker._currentPos[0] = targetX;
        activePicker._currentSize[0] = targetW;

        // THE GLUE FIX: Immediate Y alignment. The top edge of the list MUST snap
        // instantly to the node's position to prevent vertical wiggling during pans/drags.
        activePicker._currentPos[1] = targetY;

        // THE REFLOW FIX: Immediate size sync if interacting, otherwise lerp for opening[cite: 28, 50].
        if (isInteracting) {
            activePicker._currentSize[1] = targetH;
        } else {
            activePicker._currentSize[1] = lerpTo(activePicker._currentSize[1], targetH, activeLF, useAnim).value;
        }

        activePicker.style.left = `${activePicker._currentPos[0]}px`;
        activePicker.style.top = `${activePicker._currentPos[1]}px`;
        activePicker.style.width = `${(activePicker._currentSize[0] * scale).toFixed(2)}px`;
        activePicker.style.height = `${(activePicker._currentSize[1] * scale).toFixed(2)}px`;

        // 3. Alpha Fade Logic (Open phase only)
        const totalDistY = Math.max(0.1, Math.abs(targetH - aH));
        const currentDistY = Math.abs(targetH - activePicker._currentSize[1]);

        const canFade = (!useAnim || (currentDistY <= totalDistY * DROPDOWN_ANIM_SETTINGS.fadeThreshold));
        const targetAlpha = canFade ? 1 : 0;

        const alphaAnim = animateAlpha(activePicker._itemAlpha || 0, targetAlpha, DROPDOWN_ANIM_SETTINGS.alphaFactor, useAnim);
        activePicker._itemAlpha = alphaAnim.value;
        activePicker.style.opacity = activePicker._itemAlpha;

        if (alphaAnim.isAnimating || Math.abs(activePicker._currentSize[1] - targetH) > 0.5) {
            node._derpAwakeFrames = 5;
            if (node.requestDerpSync) node.requestDerpSync();
            else node.setDirtyCanvas(true, true);
        }

        activePicker.style.maxHeight = `${(maxH * scale).toFixed(2)}px`;
        syncHybridScroll(activePicker, scale, updateDerpScrollBar);

        const { sW: rowSW, mW: rowMW } = getDerpVars(node);
        const rowHash = `${scale.toFixed(3)}_${dRowH}_${rowSW}_${el._label.style.fontSize}_${activePicker._itemAlpha.toFixed(2)}`;
        if (activePicker._lastRowHash !== rowHash) {
            activePicker._lastRowHash = rowHash;
            const syncRow = (row) => {
                const rowPX = (safeConfig.padding?.[0] || 4);
                const rowFS = (safeConfig.fontSize || 10);
                const rowIconOffset = (safeConfig.indicator === true || safeConfig.indicator === "on") ? (rowFS * PICKER_GLYPH_SCALE * 1.2) + DROPDOWN_GLYPH_OFFSET : 0;

                const isHeader = row.parentElement === activePicker._headerWrapper;
                const currentMW = isHeader ? 0 : rowMW;

                row.style.height = `${dRowH * scale}px`;
                row.style.flexShrink = "0";
                row.style.padding = `0px ${(rowPX + currentMW) * scale}px`;
                if (row._glyphSpan) {
                    row._glyphSpan.style.width = `${rowIconOffset * scale}px`;
                    row._glyphSpan.style.marginRight = `${rowSW * scale}px`;
                    row._glyphSpan.style.fontSize = `${rowFS * PICKER_GLYPH_SCALE * scale}px`;
                }
                row.style.fontSize = el._label.style.fontSize;
                row.style.opacity = activePicker._itemAlpha;
            };
            if (activePicker._headerWrapper) Array.from(activePicker._headerWrapper.children).forEach(syncRow);
            if (activePicker._contentWrapper) Array.from(activePicker._contentWrapper.children).forEach(syncRow);
        }

        if (activePicker._separator) {
            const { sH } = getDerpVars(node);
            activePicker._separator.style.paddingTop = `${sH * scale}px`;
            activePicker._separator.style.paddingBottom = `${sH * scale}px`;
            activePicker._separator.style.opacity = activePicker._itemAlpha;
            const lines = activePicker._separator.children;
            if (lines.length === 2) {
                lines[0].style.height = `${1 * scale}px`;
                lines[1].style.height = `${1 * scale}px`;
                lines[0].style.backgroundColor = lineTop;
                lines[1].style.backgroundColor = lineBottom;
            }
        }

        if (activePicker._previewBox && activePicker._previewBox.style.display !== "none") {
            const targetW = (w * scale).toFixed(2);
            const targetH = (targetW / (activePicker._aspectRatio || 1)).toFixed(2);
            const { sH } = getDerpVars(node);

            activePicker._previewBox.style.width = `${targetW}px`;
            activePicker._previewBox.style.height = `${targetH}px`;
            activePicker._previewBox.style.left = `${screenX}px`;
            activePicker._previewBox.style.top = `${(screenY - (sH * scale) - targetH)}px`;
            activePicker._previewBox.style.opacity = activePicker._itemAlpha;
        }

        const canvas = app.canvas.canvas;
        syncSingletonShield(app, -ds.offset[0], -ds.offset[1], canvas.width / scale, canvas.height / scale);
    }
}