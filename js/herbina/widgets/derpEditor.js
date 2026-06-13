/**
 * Specialist: ./herbina/widgets/derpEditor.js
 * STATUS: PROTOCOL COMPLIANT | HYBRID CANVAS-DOM
 * * ACCEPTED PARAMETERS (props):
 * @param {string} text|value - The content of the editor.
 * @param {boolean} multiline - Enables multi-line support and vertical expansion.
 * @param {string} placeholder - Ghost text displayed when the editor is empty.
 * @param {boolean} readOnly - Prevents user interaction and content modification.
 * @param {boolean} spellCheck - Controls native browser spellcheck on the HTML element.
 * @param {number} fontSize - Overrides the default font size derived from themeKey.
 * @param {string} themeKey - Style identifier used to resolve colors and typography from the palette.
 * @param {Array} labelAlign - Horizontal and vertical alignment (e.g., ["left", "top"]).
 * @param {number} alpha - Global transparency override for the editor.
 * @param {boolean} isSysPanel - Internal flag identifying system panel hosts.
 * @param {boolean} useCanvasShield - If true, hides the DOM element when not in an 'awake' (editing) state.
 * @param {function} onChange - Callback triggered immediately upon content change.
 * @param {function} onBlur - Callback triggered when the editor loses focus.
 * @param {function} onFocus - Callback triggered when the editor gains focus.
 * @param {number|string} width|height - Dimensions for the editor region.
 * @param {number} minWidth|minHeight - Minimum dimension constraints for layout calculation.
 * @param {boolean} skipBackground - If true, skips background rendering and draws text only. Default: false.
 * @param {boolean} deferAsleepDomHitTest - If true, asleep DOM pointer hits fall through to layout hit testing.
 * @param {boolean} richImageContent - If true, syncs DOM content through innerText so PromptBook image embeds survive.
 *  */
import { app as comfyApp } from "../../../../scripts/app.js";
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { masterPainter, masterPainterText } from "../masterPainter.js";
import { toRGBA } from "../utils/colorMath.js";
import {
    resolveWidgetEnv,
    getNextZIndex,
    measureTextWidth,
    getDerpTextLineHeight,
    snapToScreenGrid
} from "../utils/widgetsUtils.js";
import { animateWidgetColors } from "../masterAnimator.js";

const BYPASS_BRIGHTNESS = 0.6;

function measureDerpEditorPrefixGlyphWidth(glyphText, fontSize, fontFamily, fontWeight) {
    if (!glyphText) return 0;
    return measureTextWidth(glyphText, fontSize, fontFamily || "Arial", fontWeight || "normal");
}

function setStyleIfChanged(el, key, value) {
    if (el && el.style[key] !== value) el.style[key] = value;
}

function toDerpEditorCssPx(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0px";
    return `${Math.round(num * 1000) / 1000}px`;
}

function getDerpEditorCanvasScreenRect(ctx, canvasRect, x, y, w, h) {
    if (!ctx?.getTransform || !ctx.canvas || !(w > 0) || !(h > 0)) return null;
    const rect = canvasRect?.width ? canvasRect : ctx.canvas.getBoundingClientRect?.();
    if (!rect) return null;

    const matrix = ctx.getTransform();
    const cssScaleX = ctx.canvas.width ? rect.width / ctx.canvas.width : 1;
    const cssScaleY = ctx.canvas.height ? rect.height / ctx.canvas.height : 1;
    const points = [
        matrix.transformPoint(new DOMPoint(x, y)),
        matrix.transformPoint(new DOMPoint(x + w, y)),
        matrix.transformPoint(new DOMPoint(x + w, y + h)),
        matrix.transformPoint(new DOMPoint(x, y + h))
    ];
    const xs = points.map(p => rect.left + (p.x * cssScaleX));
    const ys = points.map(p => rect.top + (p.y * cssScaleY));
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const width = Math.max(...xs) - left;
    const height = Math.max(...ys) - top;
    if (!(width > 0) || !(height > 0)) return null;
    return {
        left, top, width, height,
        scaleX: width / w,
        scaleY: height / h
    };
}

function getDerpEditorHtmlScale(el) {
    const scale = Number(el?._derpEditorHtmlScale);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getDerpEditorDomValue(el) {
    return el?._config?.richImageContent ? el.innerText : el.value;
}

function setDerpEditorDomValue(el, value) {
    if (!el) return;
    if (el._config?.richImageContent) el.innerText = value;
    else el.value = value;
}

function setDerpEditorCaretFromPoint(el, clientX, clientY) {
    if (!el || clientX === null || clientY === null) return false;

    let range = null;
    if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
    } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
    }

    if (!range || !el.contains(range.commonAncestorContainer)) return false;

    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
}

function ensureDerpEditorWrapper(el) {
    if (!el) return null;
    if (el._derpEditorWrapper?.isConnected) return el._derpEditorWrapper;

    const wrapper = document.createElement("div");
    wrapper.className = "derp-hybrid-editor-wrapper";
    wrapper.style.position = "fixed";
    wrapper.style.pointerEvents = "auto";
    wrapper.style.boxSizing = "border-box";
    wrapper.style.transformOrigin = "0 0";

    const glyph = document.createElement("div");
    glyph.className = "derp-hybrid-editor-prefix";
    glyph.setAttribute("aria-hidden", "true");
    glyph.style.position = "absolute";
    glyph.style.left = "0";
    glyph.style.top = "0";
    glyph.style.height = "100%";
    glyph.style.pointerEvents = "none";
    glyph.style.userSelect = "none";
    glyph.style.display = "none";
    glyph.style.alignItems = "center";
    glyph.style.justifyContent = "flex-start";
    wrapper.appendChild(glyph);

    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.transform = "none";
    el.style.transformOrigin = "0 0";
    el.style.pointerEvents = "auto";
    wrapper.appendChild(el);
    document.body.appendChild(wrapper);

    if (!el._derpEditorNativeRemove) el._derpEditorNativeRemove = el.remove.bind(el);
    el.remove = () => {
        if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        else el._derpEditorNativeRemove();
    };

    el._derpEditorWrapper = wrapper;
    el._derpEditorPrefixEl = glyph;
    return wrapper;
}

function removeDerpEditorWrapper(el) {
    const wrapper = el?._derpEditorWrapper;
    if (!el || !wrapper) return;
    const nativeRemove = el._derpEditorNativeRemove;
    document.body.appendChild(el);
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
    el._derpEditorWrapper = null;
    el._derpEditorPrefixEl = null;
    el.style.position = "fixed";
    el.style.transformOrigin = "0 0";
    el.style.transform = "";
    if (nativeRemove) el.remove = nativeRemove;
}

function resolveDerpEditorImageSrc(src) {
    const rawSrc = String(src || "").trim();
    if (!rawSrc) return "";
    if (rawSrc.startsWith("data:image") || rawSrc.startsWith("http") || rawSrc.startsWith("/")) {
        return rawSrc;
    }
    return window.location.origin + `/xcp/get_prompt_book_image?name=${encodeURIComponent(rawSrc)}`;
}

function getDerpEditorContentHeight(node, safeConfig, lines) {
    const uiLineHeight = getDerpTextLineHeight(safeConfig.geometry?.fontSize || 10);
    const drawW = Math.max(0, (safeConfig.geometry?.w || 0) - ((safeConfig.padding?.[0] || 4) * 2));
    let totalHeight = 0;

    lines.forEach(item => {
        if (typeof item === "string") {
            totalHeight += uiLineHeight;
            return;
        }
        if (item?.type === "img") {
            const imgObj = node._derpImgCache?.[resolveDerpEditorImageSrc(item.src)];
            if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
                totalHeight += (drawW * (imgObj.naturalHeight / imgObj.naturalWidth)) + 10;
            } else {
                totalHeight += uiLineHeight;
            }
        }
    });

    return totalHeight;
}

function clampDerpEditorScroll(node, safeConfig) {
    if (!node?._derpScrollOffsets || !safeConfig?.key) return 0;
    const lines = node._editorLineCache?.[safeConfig.key]?.lines || [];
    const totalHeight = getDerpEditorContentHeight(node, safeConfig, lines);
    const viewHeight = safeConfig.geometry?.h || 0;
    const maxScroll = Math.max(0, totalHeight - viewHeight + 20);
    node._derpScrollOffsets[safeConfig.key] = Math.max(0, Math.min(node._derpScrollOffsets[safeConfig.key] || 0, maxScroll));
    return maxScroll;
}

/**
 * Creates the HTML portion of the Hybrid Editor.
 */
export function createDerpEditorHTML(callbacks = {}) {
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.spellcheck = callbacks.spellCheck === true;
    el.className = "derp-hybrid-editor";

    // THE SCROLLBAR HIDE FIX: Disable native OS scrollbars specifically for the editor class
    if (!document.getElementById("derp-editor-scrollbar-hide")) {
        const style = document.createElement("style");
        style.id = "derp-editor-scrollbar-hide";
        style.innerHTML = `
            .derp-hybrid-editor::-webkit-scrollbar { display: none !important; }
            .derp-hybrid-editor { -ms-overflow-style: none !important; scrollbar-width: none !important; }
        `;
        document.head.appendChild(style);
    }

    el.style.position = "fixed";
    el.style.outline = "none";
    el.style.border = "none";
    el.style.overflowX = "hidden";
    el.style.overflowY = "auto";

    Object.defineProperty(el, "value", {
        get() { return this.textContent; },
        set(v) { this.textContent = v; }
    });

    const stopPropagation = (e) => e.stopPropagation();

    if (!el._hasDerpHandlers) {
        el.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
                e.preventDefault();
                const originalValue = el._editStartValue ?? "";
                el._cancelEdit = true;
                setDerpEditorDomValue(el, originalValue);
                if (el._config) {
                    el._config.value = originalValue;
                    el._config.text = originalValue;
                }
                el.blur();
                return;
            }
            if (e.key === "Enter") {
                if (!el._isMultiline) {
                    e.preventDefault();
                    el.blur();
                } else {
                    e.preventDefault();
                    document.execCommand('insertLineBreak');
                }
            }
        });
        // Stop keyup propagation to prevent ComfyUI from reacting to key releases after a paste.
        el.addEventListener("keyup", stopPropagation);
        el._hasDerpHandlers = true;
    }

    el.addEventListener("mousedown", stopPropagation);
    // THE PASTE FIX: Intercept the paste event and stop propagation to prevent ComfyUI's
    // global window listener from mistakenly spawning nodes (like derpSignalOut) from the clipboard.
    el.addEventListener("paste", (e) => {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    });
    el.addEventListener("input", () => {
        const nextValue = getDerpEditorDomValue(el);
        if (el._config) {
            el._config.value = nextValue;
            el._config.text = nextValue;
        }
        if (el._nodeRef) el._nodeRef._derpAwakeFrames = 5;
        const cb = el._config?.onInput || callbacks.onInput;
        if (cb) cb(nextValue);
    });

    el.addEventListener("focus", () => {
        el._isAwake = true;
        el._editStartValue = getDerpEditorDomValue(el);
        el._cancelEdit = false;
        if (el._nodeRef) {
            el._nodeRef._derpAwakeFrames = 10;
            if (el._nodeRef.requestDerpSync) el._nodeRef.requestDerpSync();
            else if (el._nodeRef.setDirtyCanvas) el._nodeRef.setDirtyCanvas(true);
        }

        if (el._isMultiline && el._nodeRef && el._config) {
            const scroll = el._nodeRef._derpScrollOffsets?.[el._config.key] || 0;
            el.scrollTop = scroll * getDerpEditorHtmlScale(el);
        }

        const config = el._config || {};
        const isMultiline = !!(config.multiline || config.wrap);
        const entryMode = config.entryMode || (isMultiline ? "precise" : "selectAll");

        if (entryMode === "selectAll") {
            setTimeout(() => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                if (sel) {
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }, 20);
        }
    });

    el.addEventListener("blur", () => {
        const finalValue = el._cancelEdit ? (el._editStartValue ?? "") : getDerpEditorDomValue(el);
        el._isAwake = false;
        if (el._config) {
            el._config.value = finalValue;
            el._config.text = finalValue;
        }
        const cb = el._config?.onBlur || callbacks.onBlur;
        if (cb) cb(finalValue);
        el._cancelEdit = false;
        if (el._nodeRef) {
            el._nodeRef._derpAwakeFrames = 5;
            if (el._nodeRef.requestDerpSync) el._nodeRef.requestDerpSync();
            else el._nodeRef.setDirtyCanvas(true, true);
        }
    });

    el.addEventListener("pointerdown", (e) => e.stopPropagation());

    document.body.appendChild(el);
    return el;
}

export function syncDerpEditor(context, node, app, config) {
    if (config === undefined && app && app.geometry) {
        config = app;
        app = comfyApp;
    } else {
        app = app || comfyApp;
    }

    const isCanvas = !!context.canvas || (context instanceof CanvasRenderingContext2D);
    const safeConfig = config || {};
    const requestedCanvasShield = safeConfig.canvasShield !== false;
    const useCanvasShield = requestedCanvasShield;
    const isMultiline = !!(safeConfig.multiline || safeConfig.wrap);
    if (isCanvas && requestedCanvasShield && !useCanvasShield) {
        node._hasVisibleDerpEditorDom = true;
    }

    let el;
    if (isCanvas) {
        if (!node._derpDomElements) node._derpDomElements = {};
        el = node._derpDomElements[safeConfig.key];

        if (!el) {
            el = createDerpEditorHTML({
                spellCheck: safeConfig.spellCheck,
                onInput: safeConfig.onInput,
                onBlur: safeConfig.onBlur
            });
            node._derpDomElements[safeConfig.key] = el;
        }
    } else {
        el = context;
    }

    el._nodeRef = node;
    el._config = safeConfig;
    el._isMultiline = isMultiline; // THE FIX: Sync flag so the Enter key handler knows the mode

    // THE AWAKE FIX: Declare visibility state before use
    const isAwake = el._isAwake || document.activeElement === el;

    // --- SCROLL ENGINE INITIALIZATION ---
    if (node._derpScrollOffsets === undefined) node._derpScrollOffsets = {};
    if (isMultiline) {
        if (node._derpScrollOffsets[safeConfig.key] === undefined) node._derpScrollOffsets[safeConfig.key] = 0;
    } else if (Object.prototype.hasOwnProperty.call(node._derpScrollOffsets, safeConfig.key)) {
        delete node._derpScrollOffsets[safeConfig.key];
    }

    if (!el._hasScrollSync) {
        // 1. Sync native HTML scrolling
        el.addEventListener("scroll", () => {
            if (!el._isMultiline) return;
            node._derpScrollOffsets[safeConfig.key] = el.scrollTop / getDerpEditorHtmlScale(el);
            node._derpAwakeFrames = 5;
            if (node.requestDerpSync) node.requestDerpSync();
            else node.setDirtyCanvas(true);
        });

        // 2. THE CANVAS SCROLL FIX: Catch wheel events when the HTML overlay is asleep
        app.canvas.canvas.addEventListener("wheel", (e) => {
            if (el._isMultiline && !el._isAwake && node._hoveredRegionKey === safeConfig.key) {
                e.preventDefault(); // Stop canvas zoom
                e.stopPropagation();

                node._derpScrollOffsets[safeConfig.key] += e.deltaY;
                clampDerpEditorScroll(node, safeConfig);

                node._derpAwakeFrames = 5;
                if (node.requestDerpSync) node.requestDerpSync();
                else if (node.setDirtyCanvas) node.setDirtyCanvas(true);
                else app.canvas.setDirty(true, true);
            }
        }, { passive: false });

        el._hasScrollSync = true;
    }
    const currentScroll = isMultiline ? (node._derpScrollOffsets[safeConfig.key] || 0) : 0;
    const { x, y, w, h } = safeConfig.geometry || { x: 0, y: 0, w: 0, h: 0 };
    const isHovered = (safeConfig.mouseOver !== false && node._hoveredRegionKey === safeConfig.key);
    const valStr = (safeConfig.value !== undefined ? safeConfig.value : (node.properties?.[safeConfig.key] ?? "")).toString();

    // THE OPTIMIZATION FIX: Move skipBg initialization above the stateHash to prevent ReferenceError.
    const skipBg = safeConfig.skipBackground || false;
    const hashScale = app?.canvas?.ds?.scale || 1;
    const stateHash = `${isAwake}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${valStr}_${safeConfig.text ?? ""}_${currentScroll}_${w}_${h}_${skipBg}_${safeConfig.labelAlign}_${safeConfig.padding}_${safeConfig.themeKey}_${safeConfig.fontSize}_${safeConfig.fontWeight}_${safeConfig.numberOnly}_${safeConfig.labelColor ?? ""}_${safeConfig.btnColor ?? ""}_${hashScale}`;
    const needsFullSync = node._shouldSync || el._lastStateHash !== stateHash || (el._isAnimating && (window.xcpDerpSettings?.useAnimations !== false));

    if (!needsFullSync && el._lastProps) {
        var { props, bodyPaint, labelPaint, effectiveState, content, alignments, coords, textAnchor, colorSegments, hasColorKeys } = el._lastProps;
    } else {
        const themeParts = (safeConfig.themeKey || "").split(",").map(p => p.trim());
        const bodyKey = themeParts.length > 1 ? themeParts[0] : "panel";
        const labelKey = themeParts.length === 1 ? themeParts[0] : (themeParts[1] || "t_textnormal");

        const envConfig = { ...safeConfig, themeKey: `${bodyKey}, ${labelKey}` };
        const baseState = (safeConfig.state !== undefined) ? safeConfig.state : (safeConfig.disabled ? "DIS" : "OFF");
        if (isAwake && baseState !== "DIS" && safeConfig.switchOnEditing !== false) envConfig.state = "ON";

        var {
            props, bodyPaint, labelPaint, stateStr: effectiveState,
            content, alignments, coords, textAnchor, colorSegments, hasColorKeys
        } = resolveWidgetEnv(node, envConfig, app, isCanvas ? null : el);

        el._lastProps = { props, bodyPaint, labelPaint, effectiveState, content, alignments, coords, textAnchor, colorSegments, hasColorKeys };
        el._lastStateHash = stateHash;
    }

    const isEditorBypassed = effectiveState === "DIS" || node.mode === 2 || node.mode === 4 || node._derpSpoofedBypass;

    const paintData = bodyPaint;
    const labelData = labelPaint;

    const fontSize = props.fontSize || labelPaint?.fontSize || 10;
    const font = safeConfig.fontFamily || labelPaint?.font || "Arial";
    const fontWeight = safeConfig.fontWeight || labelPaint?.fontWeight || props.fontWeight || "normal";
    const prefixGlyphText = safeConfig.prefixGlyph ? String(safeConfig.prefixGlyph) : "";
    const prefixGlyphScale = Number(safeConfig.prefixGlyphScale || 1);
    const prefixGlyphMargin = Number(safeConfig.prefixGlyphMargin || 0);
    const prefixGlyphSpacing = Number(safeConfig.prefixGlyphSpacing || 0);
    const prefixGlyphFontSize = fontSize * Math.max(0.0001, prefixGlyphScale);
    let prefixGlyphWidth = 0;
    if (prefixGlyphText) {
        const prefixGlyphMeasureKey = `${prefixGlyphText}|${prefixGlyphFontSize}|${font}|${fontWeight}`;
        if (el._prefixGlyphMeasureKey !== prefixGlyphMeasureKey) {
            el._prefixGlyphMeasureKey = prefixGlyphMeasureKey;
            el._prefixGlyphWidth = measureDerpEditorPrefixGlyphWidth(prefixGlyphText, prefixGlyphFontSize, font, fontWeight);
        }
        prefixGlyphWidth = Number(el._prefixGlyphWidth || 0);
    }
    const prefixGlyphPad = prefixGlyphText ? Math.round(prefixGlyphMargin + prefixGlyphWidth + prefixGlyphSpacing) : 0;

    if (safeConfig.propertyName && !safeConfig._onBlurWrapped) {
        const origBlur = safeConfig.onBlur;
        safeConfig.onBlur = (v) => {
            node.properties[safeConfig.propertyName] = v;
            if (safeConfig.autoRefresh !== false && node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.syncDerpOutputs) node.syncDerpOutputs();
            if (origBlur) origBlur(v);
        };
        safeConfig._onBlurWrapped = true;
    }

    let displayVal = content.value;
    if (safeConfig.propertyName && (safeConfig.text === undefined && safeConfig.value === undefined)) {
        displayVal = node.properties?.[safeConfig.propertyName] ?? "";
    }
    const valToSync = (displayVal !== undefined ? displayVal : "").toString().replace(/\r/g, "");
    // Strip {{}} color-key syntax for DOM display (canvas handles colors via segments)
    const domVal = valToSync.replace(/\{\{[^}]+\}\}/g, "");
    if (isCanvas && node.layout?.regions?.[safeConfig.key]) {
        const liveReg = node.layout.regions[safeConfig.key];

        if (!liveReg.hitTest) {
            liveReg.hitTest = (localMouse) => {
                return node.layout.hitTest(localMouse, liveReg);
            };
        }

        if (!liveReg.onPress && !liveReg.onClick) {
            liveReg.onPress = (e, data) => {
                if (e && e.stopPropagation) e.stopPropagation();
                if (liveReg.state === "DIS") return;

                const ds = app?.canvas?.ds || { scale: 1, offset: [0,0] };
                const canvasRect = app?.canvas?.canvas?.getBoundingClientRect() || { left: 0, top: 0 };
                const pressWrapper = safeConfig.prefixGlyph ? ensureDerpEditorWrapper(el) : null;
                const pressPositionEl = pressWrapper || el;
                const pressUsesShieldHost = isCanvas && !useCanvasShield && node.interactionShield;
                const pressUsesPhysicalBox = pressUsesShieldHost || (isCanvas && requestedCanvasShield);
                const pressCanvasScreenRect = (!pressUsesShieldHost && isCanvas && requestedCanvasShield) ? el._derpEditorCanvasScreenRect : null;
                const pressHtmlScale = pressCanvasScreenRect
                    ? Math.max(pressCanvasScreenRect.scaleY || pressCanvasScreenRect.scaleX || ds.scale || 1, 0.0001)
                    : (pressUsesPhysicalBox ? Math.max(ds.scale || 1, 0.0001) : 1);
                const pressCssWidth = pressCanvasScreenRect ? pressCanvasScreenRect.width : (w * pressHtmlScale);
                const pressCssHeight = pressCanvasScreenRect ? pressCanvasScreenRect.height : (h * pressHtmlScale);
                const physL = pressCanvasScreenRect ? pressCanvasScreenRect.left : Math.round(canvasRect.left + (node.pos[0] + ds.offset[0] + x) * ds.scale);
                const physT = pressCanvasScreenRect ? pressCanvasScreenRect.top : Math.round(canvasRect.top + (node.pos[1] + ds.offset[1] + y) * ds.scale);

                el._derpEditorHtmlScale = pressHtmlScale;

                if (pressUsesShieldHost) {
                    if (pressPositionEl.parentNode !== node.interactionShield) node.interactionShield.appendChild(pressPositionEl);
                    pressPositionEl.style.position = "absolute";
                    pressPositionEl.style.left = `${x * ds.scale}px`;
                    pressPositionEl.style.top = `${y * ds.scale}px`;
                } else {
                    pressPositionEl.style.position = "fixed";
                    pressPositionEl.style.left = toDerpEditorCssPx(physL);
                    pressPositionEl.style.top = toDerpEditorCssPx(physT);
                }
                el.style.width = toDerpEditorCssPx(pressCssWidth);
                el.style.height = toDerpEditorCssPx(pressCssHeight);
                pressPositionEl.style.transformOrigin = "0 0";
                pressPositionEl.style.transform = pressUsesPhysicalBox ? "none" : `scale(${ds.scale})`;
                if (pressWrapper) {
                    pressWrapper.style.width = toDerpEditorCssPx(pressCssWidth);
                    pressWrapper.style.height = toDerpEditorCssPx(pressCssHeight);
                    el.style.left = "0";
                    el.style.top = "0";
                    el.style.transform = "none";
                }

                el._isAwake = true;
                el.style.display = "block";
                el.style.opacity = "1";
                el.style.pointerEvents = "auto";

                const entryMode = safeConfig.entryMode || (isMultiline ? "precise" : "selectAll");

                // Force layout recalculation so the browser registers pointer-events: auto
                void el.offsetHeight;

                // Reconstruct physical screen coordinates from Fatha's local pointer data.
                const cx = (e && e.clientX !== undefined) ? e.clientX : (data && data.localX !== undefined ? canvasRect.left + (node.pos[0] + ds.offset[0] + data.localX) * ds.scale : null);
                const cy = (e && e.clientY !== undefined) ? e.clientY : (data && data.localY !== undefined ? canvasRect.top + (node.pos[1] + ds.offset[1] + data.localY) * ds.scale : null);

                el.focus({ preventScroll: true });

                // Some node layouts update focus back to the canvas later in the same
                // pointer cycle. Restore editor focus after that cycle so the first
                // click actually accepts keyboard input instead of only selecting text.
                setTimeout(() => {
                    if (!el.isConnected || !el._isAwake) return;
                    if (document.activeElement !== el) el.focus({ preventScroll: true });
                }, 0);

                if (entryMode === "precise" && cx !== null && cy !== null) {
                    setDerpEditorCaretFromPoint(el, cx, cy);
                }

                node._derpAwakeFrames = 10;
                if (node.requestDerpSync) node.requestDerpSync();
                else if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);

                return true;
            };
        }
    }

    // --- 1. SHARED METRICS & ALIGNMENT ---
    const padX = props.padding?.[0] || 0;
    const padY = props.padding?.[1] || 0;
    const isCutoff = safeConfig.displayMode === "cutoff";
    const cutoffRightPad = isCutoff ? padX : 0;
    const textPadX = prefixGlyphText ? Math.max(padX, prefixGlyphPad) : padX;

    const ds = app?.canvas?.ds || { scale: 1, offset: [0, 0] };
    const rect = app?.canvas?.canvas?.getBoundingClientRect() || { left: 0, top: 0 };

    const availableWidth = Math.max(0, w - (padX * 2) - cutoffRightPad);
    const EPSILON = 0.01; // Tightened buffer now that sub-pixel math is removed
    const rawBg = paintData?.fill || config.btnColor || "transparent";
    // THE THEME FIX: Removed hardcoded DIS alpha override so the _DIS theme key is strictly respected
    let rawIc = labelData?.textColor || labelData?.fill || "red";

    const useAnim = (config.showAnim !== false) && (window.xcpDerpSettings?.useAnimations !== false);
    const sysAlpha = safeConfig.alpha !== undefined ? safeConfig.alpha : 1;
    const animKey = `_derpEditor_anim_${safeConfig.key}`;

    const { fillColor: animatedFillColor, iconColor: animatedTextColor, isAnimating } = animateWidgetColors(node, animKey, rawBg, rawIc, sysAlpha, useAnim);
    el._isAnimating = isAnimating;
    let textColor = animatedTextColor;

    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    const lineHeight = getDerpTextLineHeight(fontSize);

    // Word Wrapping Cache
    // THE FIX: The cache key MUST use valToSync, not measureText, otherwise the Canvas
    // layer will never update when the value changes but the physical layout width remains static.
    const cacheW = Math.round(availableWidth * 10) / 10;
    const cacheKey = `${valToSync}_${cacheW}_${fontSize}_${font}_${fontWeight}`;
    if (!node._editorLineCache) node._editorLineCache = {};
    if (!node._derpScrollConfigs) node._derpScrollConfigs = {};
    let lines = node._editorLineCache[safeConfig.key]?.key === cacheKey ? node._editorLineCache[safeConfig.key].lines : null;

    if (!lines) {
        lines = [];
        if (isMultiline) {
            // THE FIX: Always parse the actual value for rendering, never the measureText proxy
            const paragraphs = valToSync.toString().split('\n');

            // THE FIX: Support numeric-only height measurement parity for Canvas pass
            const numberOnly = safeConfig.numberOnly === true;
            const numMeasureStr = "9876543210";

            paragraphs.forEach(para => {
                // THE PARSER FIX: Make the wrapper immune to trailing whitespace
                // which causes Canvas to shatter the Base64 image marker.
                const cleanPara = para.trim();
                const imgMatch = cleanPara.match(/^\[\[IMG:([\s\S]*?)\]\]$/);
                if (imgMatch) {
                    lines.push({ type: 'img', src: imgMatch[1].trim() });
                    return;
                }

                if (para.length === 0) {
                    lines.push("");
                    return;
                }

                // THE FIX: Use numeric string for measurement if flag is active
                const targetPara = numberOnly ? numMeasureStr : para;

                // THE EXACT CJK PARITY FIX: HTML evaluates CJK text character-by-character,
                // NOT by dictionary words. Intl.Segmenter groups Chinese characters into words,
                // causing the Canvas to wrap entirely differently than HTML.
                // We split by spaces, hyphens, OR any individual CJK character/punctuation (\u3000-\u9fff).
                // THE WORD-BREAK FIX: Removed '\b' so canvas stops incorrectly breaking unbroken words like "powerful,octane"
                const tokens = para.split(/([\s\-]|(?<=[\u3000-\u9fff])|(?=[\u3000-\u9fff]))/).filter(Boolean);

                let currentLine = "";
                // KINSOKU SHORI: Universal punctuation that cannot start a new line
                const PUNC_NO_START = /^[\uff0c\u3002\uff1f\uff01\u3001\uff1a\uff1b\u201d\u2019\u300b\u300f\u3011\u3009\u3015\u3017\u3019\u00b7\u2014\u2026,\.\?!:;"]/;

                tokens.forEach(token => {
                    if (token === "") return;
                    let testLine = currentLine + token;
                    // THE FIX: If numberOnly is true, we measure against a numeric-length proxy for the token
                    const measureToken = numberOnly ? "9" : token;
                    let testW = measureTextWidth(currentLine + measureToken, fontSize, font, fontWeight);

                    if (testW > (availableWidth + EPSILON) && currentLine.length > 0) {
                        // KINSOKU SHORI FIX: Prevent forbidden punctuation from starting a new line alone.
                        // By forcing the preceding character down with it, we match HTML grammar wrapping.
                        if (PUNC_NO_START.test(token.trim()) && currentLine.length > 1) {
                            const lastChar = currentLine.slice(-1);
                            const lineWithoutLast = currentLine.slice(0, -1);
                            lines.push(lineWithoutLast.replace(/\s+$/, ''));
                            currentLine = lastChar + token.replace(/^\s+/, '');
                        } else {
                            lines.push(currentLine.replace(/\s+$/, ''));
                            currentLine = token.replace(/^\s+/, '');
                        }
                    } else {
                        currentLine = testLine;
                    }

                    // THE FIX: Apply numeric measurement to the break-word loop
                    while (measureTextWidth(numberOnly ? "9".repeat(currentLine.length) : currentLine, fontSize, font, fontWeight) > (availableWidth + EPSILON) && currentLine.length > 1) {
                        let tempLine = "";
                        let cutIndex = 0;
                        for (let i = 0; i < currentLine.length; i++) {
                            let tempW = measureTextWidth(numberOnly ? "9".repeat(tempLine.length + 1) : (tempLine + currentLine[i]), fontSize, font, fontWeight);
                            if (tempW > (availableWidth + EPSILON) && tempLine.length > 0) {
                                cutIndex = i;
                                break;
                            }
                            tempLine += currentLine[i];
                        }
                        if (cutIndex > 0) {
                            lines.push(tempLine);
                            currentLine = currentLine.slice(cutIndex);
                        } else {
                            lines.push(currentLine[0]);
                            currentLine = currentLine.slice(1);
                        }
                    }
                });

                if (currentLine.length > 0) {
                    lines.push(currentLine.replace(/\s+$/, ''));
                }
            });
        } else {
            lines = [valToSync.toString()];
        }
        node._editorLineCache[safeConfig.key] = { key: cacheKey, lines };
    }

    if (isMultiline) {
        safeConfig._clampScroll = () => clampDerpEditorScroll(node, safeConfig);
        node._derpScrollConfigs[safeConfig.key] = safeConfig;
        clampDerpEditorScroll(node, safeConfig);
    } else if (node._derpScrollConfigs[safeConfig.key]) {
        delete node._derpScrollConfigs[safeConfig.key];
    }

// THE VERTICAL STABILITY FIX: Ensure Canvas and HTML use identical start offsets
    const [alignX, alignY] = props.labelAlign || ["left", "middle"];
    // Removed duplicate 'ds' and 'rect' declarations since they are now initialized in Phase 1

    // THE CACHE GATING: Use the cached metrics to avoid O(N) line traversal unless structure changed
    if (!needsFullSync && el._lastMetrics) {
        var { totalPhysicalTextHeight, baseRelativeStartY } = el._lastMetrics;
    } else {
        const scaledFS_calc = fontSize * ds.scale;
        const uiLineHeight_calc = Math.round(getDerpTextLineHeight(scaledFS_calc));
        const drawW_calc = (w - (padX * 2)) * ds.scale;
        var totalPhysicalTextHeight = 0;

        lines.forEach(item => {
            if (typeof item === 'string') {
                totalPhysicalTextHeight += uiLineHeight_calc;
            } else if (item.type === 'img') {
                const imgObj = node._derpImgCache?.[resolveDerpEditorImageSrc(item.src)];
                if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
                    totalPhysicalTextHeight += (drawW_calc * (imgObj.naturalHeight / imgObj.naturalWidth)) + (10 * ds.scale);
                } else {
                    totalPhysicalTextHeight += uiLineHeight_calc;
                }
            }
        });

        const physicalHeight = h * ds.scale;
        const [_, alignY] = props.labelAlign || ["left", "middle"];
        if (alignY === "middle") {
            const physCenterY = (physicalHeight / 2) - (totalPhysicalTextHeight / 2);
            var baseRelativeStartY = physCenterY / ds.scale;
        } else if (alignY === "bottom") {
            var baseRelativeStartY = h - padY - (totalPhysicalTextHeight / ds.scale);
        } else {
            var baseRelativeStartY = padY;
        }
        el._lastMetrics = { totalPhysicalTextHeight, baseRelativeStartY };
    }

    // THE SCROLL FIX: Canvas needs the scroll offset manually applied, but HTML uses native scrollTop.
    // By applying CSS transform scaling (added below), 'currentScroll' becomes exact local pixels.
    let canvasRelativeStartY = baseRelativeStartY - currentScroll;

    // Allow a buffer so descenders (y, g, p) aren't cut off by the clip()
    const verticalBleedBuffer = 2;


    // --- 2. CANVAS RENDERING PASS ---
    if (isCanvas) {
        const ctx = context;
        const screenRect = getDerpEditorCanvasScreenRect(ctx, rect, x, y, w, h);
        if (screenRect) el._derpEditorCanvasScreenRect = screenRect;
        const drawCanvasShieldText = requestedCanvasShield && !isAwake;
        if (requestedCanvasShield && isAwake && !drawCanvasShieldText) {
            if (sysAlpha > 0) {
                const themeKeys = String(safeConfig.themeKey || "").split(",").filter(k => k.trim().length > 0);
                const shouldDrawBg = themeKeys.length > 1 || !!safeConfig.btnColor;
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, sysAlpha));
                if (shouldDrawBg && bodyPaint && !skipBg) {
                    masterPainter(ctx, {
                        width: w, height: h, posX: x, posY: y,
                        paintData: safeConfig.corners ? { ...bodyPaint, corners: safeConfig.corners } : bodyPaint,
                        color: animatedFillColor
                    });
                }
                ctx.restore();
            }
        }

        // Canvas owns asleep visuals and the active canvasShield background.
        if (drawCanvasShieldText) {
            if (sysAlpha <= 0 && !isAwake) return;
            if (sysAlpha > 0) {
                // THE SINGLE-KEY FIX: If only one key is present (text theme), skip the background container.
                const themeKeys = String(safeConfig.themeKey || "").split(",").filter(k => k.trim().length > 0);
                const shouldDrawBg = themeKeys.length > 1 || !!safeConfig.btnColor;

                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, sysAlpha));

                if (shouldDrawBg && bodyPaint && !skipBg) {
                    masterPainter(ctx, {
                        width: w, height: h, posX: x, posY: y,
                        paintData: safeConfig.corners ? { ...bodyPaint, corners: safeConfig.corners } : bodyPaint,
                        color: animatedFillColor // THE FIX: Apply animated color
                    });
                }

                if (labelPaint && requestedCanvasShield) {
                    // THE FIX: Use pre-resolved alignments from the environment instead of calling utility
                    const canvasAlignMap = alignments.canvas;

                    // THE EXACT PARITY FIX: Synchronize Canvas X/Y perfectly with HTML CSS scale
                    const physicalTopRaw = rect.top + (node.pos[1] + ds.offset[1] + y) * ds.scale;
                    const physicalLeftRaw = rect.left + (node.pos[0] + ds.offset[0] + x) * ds.scale;
                    const physT_floor = Math.round(physicalTopRaw);
                    const physL_floor = Math.round(physicalLeftRaw);

                    // Back-calculate local origin from the floored physical origin
                    const localTop = ((physT_floor - rect.top) / ds.scale) - (node.pos[1] + ds.offset[1]);
                    const localLeft = ((physL_floor - rect.left) / ds.scale) - (node.pos[0] + ds.offset[0]);

                    const uiLineHeight = getDerpTextLineHeight(fontSize);
                    const finalPadY = Math.max(0, baseRelativeStartY);

                    // Use pure local coordinates just like the CSS Box Padding
                    let textX = localLeft + textPadX;
                    if (alignX === "center") textX = localLeft + (w / 2);
                    else if (alignX === "right") textX = localLeft + w - padX;

                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, Math.max(0, w - cutoffRightPad), h);
                    ctx.clip(); // Horizontal and Vertical Cutoff Fix

                    let currentY = localTop + finalPadY - currentScroll;
                    lines.forEach((item) => {
                        if (typeof item === 'string') {
                            const lineY = currentY + (uiLineHeight / 2) + (props.fontOffset || 0);

                            if (lineY + (uiLineHeight / 2) >= y - verticalBleedBuffer && lineY - (uiLineHeight / 2) <= y + h + verticalBleedBuffer) {
                                masterPainterText(ctx, {
                                    text: item,
                                    x: textX, y: lineY,
                                    align: canvasAlignMap[alignX] || "left",
                                    baseline: "middle",
                                    paintData: {...labelPaint, font, fontSize, fontWeight, fill: textColor},
                                    segments: hasColorKeys ? colorSegments : null
                                });
                            }
                            currentY += uiLineHeight;
                        } else if (item.type === 'img') {
                            // THE FIX: Interleave image drawing based on their logical paragraph order.
                            if (!node._derpImgCache) node._derpImgCache = {};
                            const imgSrc = resolveDerpEditorImageSrc(item.src);

                            if (!node._derpImgCache[imgSrc]) {
                                const img = new Image();
                                img.src = imgSrc;
                                img.onload = () => { node.setDirtyCanvas(true); };
                                node._derpImgCache[imgSrc] = img;
                            }

                            const imgObj = node._derpImgCache[imgSrc];
                            if (imgObj && imgObj.complete && imgObj.naturalWidth > 0) {
                                const aspect = imgObj.naturalHeight / imgObj.naturalWidth;
                                const drawW = w - (padX * 2);
                                const drawH = drawW * aspect;

                                if (currentY + drawH > y && currentY < y + h) {
                                    if (isEditorBypassed) {
                                        ctx.save();
                                        ctx.filter = `grayscale(100%) brightness(${BYPASS_BRIGHTNESS})`;
                                        ctx.drawImage(imgObj, localLeft + padX, currentY, drawW, drawH);
                                        ctx.restore();
                                    } else {
                                        ctx.drawImage(imgObj, localLeft + padX, currentY, drawW, drawH);
                                    }
                                }
                                currentY += drawH + 10;
                            }
                        }
                    });
                    ctx.restore();
                }

                ctx.restore();
            }
        }
    }


    // --- 3. HTML OVERLAY PASS ---
    if (!app || !app.canvas || !app.canvas.ds) return;

    // THE FIX: Only early-exit if the element is already hidden.
    if (!node._shouldSync && el._lastGeoKey && !isAwake && el.style.display === "none") return;

    if (!coords) return; // coords was resolved at the top of syncDerpEditor

    // Canvas-shield editors use the canvas transform as the placement source.
    // The DOM remains as the hit/focus/text surface.
    if (!prefixGlyphText && el._derpEditorWrapper) removeDerpEditorWrapper(el);
    const editorWrapper = prefixGlyphText ? ensureDerpEditorWrapper(el) : null;
    const editorPositionEl = editorWrapper || el;
    const useShieldHost = isCanvas && !useCanvasShield && node.interactionShield;
    const usePhysicalHtmlBox = useShieldHost || (isCanvas && requestedCanvasShield);
    const canvasScreenRect = (!useShieldHost && isCanvas && requestedCanvasShield) ? el._derpEditorCanvasScreenRect : null;
    const htmlScale = canvasScreenRect
        ? Math.max(canvasScreenRect.scaleY || canvasScreenRect.scaleX || ds.scale || 1, 0.0001)
        : (usePhysicalHtmlBox ? Math.max(ds.scale || 1, 0.0001) : 1);
    const editorCssWidth = canvasScreenRect ? canvasScreenRect.width : (w * htmlScale);
    const editorCssHeight = canvasScreenRect ? canvasScreenRect.height : (h * htmlScale);
    const physL = useShieldHost ? x * ds.scale : (canvasScreenRect ? canvasScreenRect.left : Math.round(rect.left + (node.pos[0] + ds.offset[0] + x) * ds.scale));
    const physT = useShieldHost ? y * ds.scale : (canvasScreenRect ? canvasScreenRect.top : Math.round(rect.top + (node.pos[1] + ds.offset[1] + y) * ds.scale));
    el._derpEditorHtmlScale = htmlScale;

    if (useShieldHost && editorPositionEl.parentNode !== node.interactionShield) {
        node.interactionShield.appendChild(editorPositionEl);
    }

    const masterZ = node?._masterZHtml || 10000;
    const geoKey = `${physL}-${physT}-${editorCssWidth}-${editorCssHeight}-${ds.scale}-${isAwake}-${masterZ}`;
    if (el._lastGeoKey !== geoKey) {
        el._lastGeoKey = geoKey;
        setStyleIfChanged(editorPositionEl, "position", useShieldHost ? "absolute" : "fixed");
        setStyleIfChanged(editorPositionEl, "left", toDerpEditorCssPx(physL));
        setStyleIfChanged(editorPositionEl, "top", toDerpEditorCssPx(physT));

        const shouldExpand = safeConfig.inputExpand === true;

        let baseZ = masterZ;
        if (safeConfig.zIndex !== undefined) {
            baseZ = parseInt(safeConfig.zIndex);
        }
        el._baseZ = baseZ;

        if (isAwake && node.size && shouldExpand) {
            const expandedWidth = node.size[0] - x - padX;
            setStyleIfChanged(el, "width", `${Math.max(editorCssWidth, expandedWidth * htmlScale)}px`);
            el._lastAwakeZ = baseZ + 500;
            setStyleIfChanged(editorPositionEl, "zIndex", String(el._lastAwakeZ));
        } else {
            setStyleIfChanged(el, "width", `${editorCssWidth}px`);
            el._lastAwakeZ = null;
            setStyleIfChanged(editorPositionEl, "zIndex", String(baseZ));
        }
        setStyleIfChanged(el, "zIndex", editorWrapper ? "auto" : editorPositionEl.style.zIndex);
        setStyleIfChanged(el, "height", `${editorCssHeight}px`);
        if (editorWrapper) {
            setStyleIfChanged(editorWrapper, "width", `${editorCssWidth}px`);
            setStyleIfChanged(editorWrapper, "height", `${editorCssHeight}px`);
            setStyleIfChanged(el, "left", "0px");
            setStyleIfChanged(el, "top", "0px");
            setStyleIfChanged(el, "transform", "none");
        }

        setStyleIfChanged(editorPositionEl, "transformOrigin", "0 0");
        setStyleIfChanged(editorPositionEl, "transform", usePhysicalHtmlBox ? "none" : `scale(${ds.scale})`);
    }

    const scaledFS = fontSize;
    const uiLineHeight = getDerpTextLineHeight(fontSize);
    const cssFontSize = fontSize * htmlScale;
    const cssLineHeight = uiLineHeight * htmlScale;

    const isSingleLineMiddle = !isMultiline && alignY === "middle";
    const useCanvasShieldTextLayout = isCanvas && requestedCanvasShield;
    const useSingleLineFlex = !useCanvasShieldTextLayout && isSingleLineMiddle && !prefixGlyphText && alignX === "left";
    const useSingleLineFullLineBox = isSingleLineMiddle && !useSingleLineFlex;
    const finalPadY = (useSingleLineFlex || useSingleLineFullLineBox) ? 0 : Math.max(0, baseRelativeStartY);
    const htmlPadTop = finalPadY * htmlScale;
    const htmlPadX = textPadX * htmlScale;
    const htmlPadRight = htmlPadX + (cutoffRightPad * htmlScale);
    const htmlLayoutMode = useSingleLineFlex ? "flex" : (useSingleLineFullLineBox ? "singleLineBox" : "block");
    const domTextColor = animatedTextColor;
    const syncKey = `${ds.scale}-${effectiveState}-${rawIc}-${rawBg}_${prefixGlyphText}_${prefixGlyphScale}_${prefixGlyphMargin}_${prefixGlyphSpacing}-${valToSync}-${finalPadY}-${htmlPadTop}-${htmlPadX}-${htmlPadRight}-${scaledFS}-${font}-${fontWeight}-${isMultiline}-${isAwake}-${safeConfig.btnColor}-${htmlLayoutMode}`;

    if (el._lastSyncKey !== syncKey) {
        el._lastSyncKey = syncKey;

        const paintData = { ...(bodyPaint || {}) };
        paintData.font = font;
        paintData.fontSize = fontSize;
        paintData.fontWeight = fontWeight;
        // Use animated colors for the base theme application to prevent color flickering on sync
        paintData.textColor = domTextColor;
        paintData.fill = animatedFillColor;

        if (labelPaint) {
            paintData.textShadow = labelPaint.textShadow || labelPaint.shadow;
            paintData.glow = labelPaint.glow;
        }

        applyHTMLTheme(el, paintData, htmlScale);

        // Bind resolved layout font metrics so DOM text stays aligned with canvas text.
        el.style.fontFamily = font;
        el.style.fontSize = `${cssFontSize}px`;
        el.style.fontWeight = fontWeight;
        el.style.fontOpticalSizing = "none";
        el.style.fontVariationSettings = isMultiline ? `"opsz" ${fontSize}` : "normal";

        el.style.textAlign = textAnchor ? textAnchor.align : alignX;
        el.style.display = useSingleLineFlex ? "flex" : "block";
        el.style.alignItems = useSingleLineFlex ? "center" : "";
        el.style.justifyContent = "";

        el.style.outline = "none";
        el.style.boxSizing = "border-box";
        el.style.margin = "0";
        el.style.padding = (useSingleLineFlex || useSingleLineFullLineBox)
            ? `0px ${htmlPadRight}px 0px ${htmlPadX}px`
            : `${htmlPadTop}px ${htmlPadRight}px 0px ${htmlPadX}px`;
        el.style.lineHeight = useSingleLineFullLineBox ? `${editorCssHeight}px` : `${cssLineHeight}px`;
        el.style.overflowX = "hidden";
        el.style.overflowY = isMultiline ? "auto" : "hidden";
        el.style.resize = "none";

        el.style.whiteSpace = isMultiline ? "pre-wrap" : "nowrap";
        el.style.wordBreak = "normal";
        el.style.overflowWrap = isMultiline ? "anywhere" : "normal";
        el.style.lineBreak = isMultiline ? "strict" : "auto";
        el.style.hyphens = "none";

        // Canvas text uses unkerned glyph advances; keep the visible editable DOM in the same metric family.
        el.style.fontKerning = "none";
        el.style.fontVariantLigatures = "none";
        el.style.letterSpacing = "0px";
        el.style.textRendering = "auto";
        el.style.webkitFontSmoothing = "auto";
        el.style.mozOsxFontSmoothing = "auto";
    }

    // THE FAST-PATH FIX: Apply animated colors inline without expensive theme re-application
    if (el.style.color !== domTextColor) el.style.color = domTextColor;
    if (el.style.caretColor !== "auto") {
        el.style.caretColor = "auto";
    }
    const canvasOwnsEditorBackground = isCanvas && requestedCanvasShield && bodyPaint && !skipBg;
    const canvasOwnsAsleepVisuals = isCanvas && requestedCanvasShield && !isAwake;
    if (canvasOwnsEditorBackground) {
        el.style.backgroundColor = "transparent";
        el.style.border = "none";
        el.style.boxShadow = "none";
        el.style.filter = "none";
        el.style.clipPath = "none";
        el.style.webkitClipPath = "none";
        el.style.outline = "none";
    } else if (bodyPaint && !skipBg) {
        if (el.style.backgroundColor !== animatedFillColor) el.style.backgroundColor = animatedFillColor;
    } else if (skipBg) {
        el.style.backgroundColor = "transparent";
    }

    const baseAlpha = sysAlpha;
    const domPointerEvents = (effectiveState === "DIS" || (safeConfig.deferAsleepDomHitTest && !isAwake)) ? "none" : "auto";

    el.style.display = useSingleLineFlex ? "flex" : "block";
    el.style.alignItems = useSingleLineFlex ? "center" : "";
    el.style.justifyContent = "";

    // Keep PromptBook inline images visually consistent with bypassed IMAGE_HTML previews.
    const imageFilter = isEditorBypassed ? `grayscale(100%) brightness(${BYPASS_BRIGHTNESS})` : "none";
    if (el._lastImgFilter !== imageFilter) {
        el._lastImgFilter = imageFilter;
        el.querySelectorAll("img[data-derp-image]").forEach((img) => {
            img.style.filter = imageFilter;
        });
    }

    // THE THEME FIX: Removed hardcoded opacity multipliers for DIS state.
    // The theme's _DIS key handles transparency via its own fill/textColor.
    if (isCanvas && useCanvasShield && !isAwake) {
        el.style.display = useSingleLineFlex ? "flex" : "block";
        el.style.opacity = "0";
        el.style.pointerEvents = domPointerEvents;
    } else {
        el.style.display = useSingleLineFlex ? "flex" : "block";
        el.style.opacity = canvasOwnsAsleepVisuals ? "0" : String(baseAlpha);
        el.style.pointerEvents = domPointerEvents;
    }

    if (editorWrapper) {
        const glyph = el._derpEditorPrefixEl;
        setStyleIfChanged(editorWrapper, "display", "block");
        setStyleIfChanged(editorWrapper, "opacity", String(baseAlpha));
        setStyleIfChanged(editorWrapper, "pointerEvents", "auto");
        if (glyph) {
            const glyphStyleKey = `${prefixGlyphText}|${prefixGlyphPad}|${prefixGlyphMargin}|${font}|${prefixGlyphFontSize}|${fontWeight}|${uiLineHeight}`;
            if (glyph._lastStyleKey !== glyphStyleKey) {
                glyph._lastStyleKey = glyphStyleKey;
                glyph.textContent = prefixGlyphText;
                setStyleIfChanged(glyph, "display", "flex");
                setStyleIfChanged(glyph, "width", `${prefixGlyphPad}px`);
                setStyleIfChanged(glyph, "paddingLeft", `${prefixGlyphMargin}px`);
                setStyleIfChanged(glyph, "fontFamily", font);
                setStyleIfChanged(glyph, "fontSize", `${prefixGlyphFontSize}px`);
                setStyleIfChanged(glyph, "fontWeight", fontWeight);
                setStyleIfChanged(glyph, "lineHeight", `${uiLineHeight}px`);
            }
            setStyleIfChanged(glyph, "color", animatedTextColor);
        }
        if (isCanvas && useCanvasShield && !isAwake) {
            el.style.display = "block";
            el.style.opacity = "0";
            el.style.pointerEvents = domPointerEvents;
        } else {
            el.style.opacity = String(baseAlpha);
            el.style.pointerEvents = domPointerEvents;
        }
    }

    if (!isAwake && document.activeElement !== el && domVal !== undefined && getDerpEditorDomValue(el) !== domVal) {
        setDerpEditorDomValue(el, domVal);
    }

    // THE SCROLL FIX: Only force the HTML element to match the node's scroll state
    // when NOT awake to avoid fighting the user's manual scrolling.
    if (isMultiline && !isAwake) {
        const targetScrollTop = currentScroll * htmlScale;
        if (Math.abs(el.scrollTop - targetScrollTop) > 1) el.scrollTop = targetScrollTop;
    }
}
