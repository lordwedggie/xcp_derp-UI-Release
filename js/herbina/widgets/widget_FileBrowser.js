/**
 * Specialist: ./herbina/widgets/widget_FileBrowser.js
 * ROLE: A hybrid dropdown-style selector specifically for file navigation.
 * STATUS: 100% Organic HTML-in-Canvas Hybrid.
 */
import { app as comfyApp } from "../../../../scripts/app.js";
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { masterPainter, masterPainterText } from "../masterPainter.js";
import {
    syncSingletonShield,
    toggleSingletonShield,
    executeShieldedInteraction,
    syncElementToCanvas
} from "../utils/singletonController.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    measureTextHeight, // THE HEIGHT FIX: Import the height measurement utility
    applyInteractionStyles,
    getAlignmentMaps,
    snapToScreenGrid
} from "../utils/widgetsUtils.js";
import { lerpTo, animateAlpha, animateWidgetColors } from "../masterAnimator.js";
import { getDerpVars } from "../../fatha/fatha.js";
import { ensureElementVisibleInViewport } from "../../fatha/core/fathaWarp.js";
import {
    isWidgetAnimationEnabled,
    createHybridDropdownHTML,
    resolveHybridThemeKeys,
    initializeHybridPicker,
    buildPickerDOMContainer,
    handleHybridPickerClosePhase,
    finalizeHybridPickerCleanup,
    appendHybridPickerRow,
    syncHybridScroll
} from "./helpers/dropdown_lib.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";

const FILEBROWSER_ICON_MAP = {
    folder:     ["📁", "📂"],
    dropdown:   ["▶", "▼"],
    palette:    ["❖", "❖"],
    file:       ["🖺", "🖺"],
    settings:   ["⛯", "⛯"],
    fallback:   ["📁", "📂"],
};

const BROWSER_ICONS = {
    DIR: "📁 ",
    UP: "⮤ ",
    FILE: "🖺 ",
    PALETTE: "❖ ",
    LORA: "🖺 ",
    LORAIMAGE: "🖻 ",
};

const lineTop = "rgba(0, 0, 0, 0.2)";
const lineBottom = "rgba(255, 255, 255, 0.05)";

const DROPDOWN_ANIM_SETTINGS = {
    lerpFactor: 0.325, // THE SPEED FIX: Increased by 30% (0.25 -> 0.325) for faster size lerping
    lerpCurve: 0.5,
    alphaFactor: 0.2,
    fadeThreshold: 0.5,
    anchorSize: [10, 4]
};

let activeFilePicker = null;
let lastOpenTime = 0;

function isValidRect(rect) {
    return !!rect && Number.isFinite(rect.left) && Number.isFinite(rect.top) && rect.width > 0 && rect.height > 0;
}

function computeScreenAnchorRect(node, app, geometry) {
    const ds = app?.canvas?.ds;
    const canvas = app?.canvas?.canvas;
    if (!ds || !canvas || !geometry) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scale = ds.scale;
    const screenX = rect.left + (((node?.pos?.[0] || 0) + geometry.x + ds.offset[0]) * scale);
    const screenY = rect.top + (((node?.pos?.[1] || 0) + geometry.y + ds.offset[1]) * scale);

    return {
        left: screenX,
        top: screenY,
        width: geometry.w * scale,
        height: geometry.h * scale,
    };
}

function resolveScreenAnchorRect(sourceEl, node, app, geometry) {
    const domRect = sourceEl?.getBoundingClientRect?.();
    if (isValidRect(domRect)) return domRect;

    const cachedRect = sourceEl?._screenRect;
    if (isValidRect(cachedRect)) return cachedRect;

    return computeScreenAnchorRect(node, app, geometry);
}

function closeFilePicker() {
    if (activeFilePicker) {
        if (activeFilePicker._previewBox) activeFilePicker._previewBox.style.display = "none";
    }
    if (handleHybridPickerClosePhase(activeFilePicker, lastOpenTime, comfyApp)) {
        // THE SHIELD WAKE FIX: Force canvas redraw so the closing animation actually plays when clicking outside
        if (comfyApp && comfyApp.canvas) comfyApp.canvas.setDirty(true, true);
        if (activeFilePicker && activeFilePicker._sourceEl && activeFilePicker._sourceEl._node) {
            activeFilePicker._sourceEl._node._derpAwakeFrames = 10;
        }
        return;
    }
    finalizeFilePickerCleanup();
}

function finalizeFilePickerCleanup() {
    if (activeFilePicker?._previewBox) activeFilePicker._previewBox.style.display = "none";
    finalizeHybridPickerCleanup(activeFilePicker, toggleSingletonShield, closeFilePicker);
    activeFilePicker = null;
    window.__xcpHasActiveFileBrowser = false;
}

function forceFileBrowserResync(node, config, sourceEl) {
    if (node && node._fileBrowserCache && config?.key) {
        delete node._fileBrowserCache[config.key];
    }
    if (sourceEl) {
        sourceEl._lastSyncKey = "";
    }
    if (node) {
        node._forceSync = true;
        node._layoutDirty = true;
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    }
}

// THE GLOBAL HOOK: Allow the framework to force-close pickers during major state transitions (like Basta switches)
window._xcpCloseActiveFileBrowser = () => {
    if (activeFilePicker) {
        activeFilePicker._isClosing = false;
        finalizeFilePickerCleanup();
    }
};


export function createFileBrowser(callbacks = {}) {
    const iconName = String(callbacks.icon || "folder").toLowerCase();
    const iconEntry = FILEBROWSER_ICON_MAP[iconName] || FILEBROWSER_ICON_MAP.fallback;
    const glyphs = (Array.isArray(iconEntry) && iconEntry.length >= 2)
        ? iconEntry
        : FILEBROWSER_ICON_MAP.fallback;
    const el = createHybridDropdownHTML(callbacks, glyphs);
    el._iconName = iconName;
    return el;
}

export function ensureFileBrowserBinding(node, app, config) {
    if (!node || !config?.key) return null;
    if (!node._derpDomElements) node._derpDomElements = {};
    let el = node._derpDomElements[config.key];
    if (!el) {
        el = createFileBrowser({ ...(config.callbacks || {}), icon: config.icon });
        node._derpDomElements[config.key] = el;
    }

    let liveReg = node.layout?.regions?.[config.key];
    if (!liveReg) return el;

    liveReg.onPress = (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        executeShieldedInteraction(node, app, config.geometry.x, config.geometry.y, config.geometry.w, config.geometry.h, () => {
            if (activeFilePicker && activeFilePicker._sourceEl === el) closeFilePicker();
            else openFilePicker(el, config, node, config);
            node.setDirtyCanvas(true, true);
        });
        return true;
    };

    return el;
}

function shouldShowFileBrowserIndicator(config) {
    const indicator = config?.indicator;
    return !(indicator === false || indicator === "off" || indicator === "false" || indicator === 0);
}

function openFilePicker(sourceEl, config, node, callbacks) {
    if (activeFilePicker) {
        finalizeFilePickerCleanup();
    }

    if (node && node._pressedRegionKey === config.key) {
        node._pressedRegionKey = null;
    }

    // Keep the host node actively redrawing while the picker performs opening lerp.
    if (node) {
        node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 24);
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    }

    lastOpenTime = Date.now();
    const ds = comfyApp.canvas.ds;
    const scale = ds.scale;
    const items = config.items || [];
    const itemsHash = JSON.stringify(items);
    const { oY, sH, sW, mH } = getDerpVars(node);
    const hasIndicator = shouldShowFileBrowserIndicator(config);

    const { bodyKey, pickerKey, textKey: labelKey } = resolveHybridThemeKeys(config.themeKey);
    const listPaint = resolvePaintData(node, bodyKey, "_OFF") || node._panelPaintData_OFF;
    const rowPaintOFF = resolvePaintData(node, labelKey, "_OFF") || node._t_textnormalPaintData_OFF;
    const rowPaintON = resolvePaintData(node, labelKey, "_ON") || node._t_textnormalPaintData_ON;

    const pX = (config.padding?.[0] || 4);
    const fs = (config.fontSize || rowPaintOFF?.fontSize || 10);
    const iconOffset = fs * 1.2;

    // THE HEIGHT FIX: Dynamically calculate row height using font metrics instead of hardcoded fallbacks.
    // This ensures descenders (g, j, p, q, y) are fully visible based on the active theme's font.
    const dynamicRowHeight = measureTextHeight("Hgyj", 0, rowPaintOFF) + (config.padding?.[1] || 2) * 2;

    const picker = document.createElement("div");
    picker._dynamicRowHeight = dynamicRowHeight;
    picker._bottomMarginUnits = mH || 0;

    const [aW, aH] = DROPDOWN_ANIM_SETTINGS.anchorSize;
    initializeHybridPicker(
        picker,
        sourceEl,
        config,
        config.geometry?.w || 200,
        aH,
        oY,
        node.properties?.dropdownVisibleLimit || 20,
        node.properties?.hideScrollbar !== false,
        listPaint,
        scale
    );
    picker.style.padding = "0px"; // THE MARGIN FIX: Ensure dropdown rows snap to the absolute top of the container

    const { headerWrapper, separator, scrollBounds, contentWrapper, previewBox, previewImg } = buildPickerDOMContainer(picker, listPaint, scale, sH);
    picker._aspectRatio = 1; // THE ASPECT RATIO FIX: Initialize default ratio

    const maxH = picker._visibleLimit * dynamicRowHeight;
    picker.style.maxHeight = `${maxH * scale}px`;

    const anchorRect = resolveScreenAnchorRect(sourceEl, node, comfyApp, config.geometry);
    picker._anchorRect = {
        left: anchorRect.left,
        top: anchorRect.top,
        width: anchorRect.width,
        height: anchorRect.height,
    };
    picker.style.left = `${anchorRect.left}px`;
    picker.style.top = `${anchorRect.top}px`;
    picker.style.width = `${anchorRect.width}px`;

    /**
     * THE NAVIGATION ENGINE: Recursively redraws the picker content based on the virtual path.
     */
    const renderRows = (dir) => {
        if (picker._previewBox) picker._previewBox.style.display = "none";

        if (picker._headerWrapper) while (picker._headerWrapper.firstChild) picker._headerWrapper.removeChild(picker._headerWrapper.firstChild);
        while (contentWrapper.firstChild) contentWrapper.removeChild(contentWrapper.firstChild);
        picker._currentDir = dir;

        const entries = new Set();
        const files = [];

        // THE ROOT NORMALIZATION FIX: Treat "/" as empty string to prevent rel-path filtering failures
        const normDir = (dir === "/" ? "" : (dir || "")).replace(/[\\/]/g, "/");

        items.forEach(item => {
            const fullPath = typeof item === "string"
                ? item
                : (item?.path ?? item?.value ?? item?.name ?? "");
            if (!fullPath) return;

            const normPath = fullPath.replace(/[\\/]/g, "/");
            if (normDir && !normPath.startsWith(normDir + "/")) return;
            const rel = normDir ? normPath.substring(normDir.length + 1) : normPath;

            const parts = rel.split("/");
            if (parts.length > 1) {
                entries.add(parts[0]);
            } else if (parts[0]) {
                files.push({ name: parts[0], path: fullPath, item });
            }
        });

        const list = [];
        const isDropdownMode = sourceEl._glyphs && sourceEl._glyphs[0] === "▶" && sourceEl._glyphs[1] === "▼";

        if (isDropdownMode) {
            // Dropdown mode — show current value header with open arrow, then flat items
            const displayVal = config.value || (items.length > 0 ? (typeof items[0] === "string" ? items[0] : (items[0].value || items[0].name || "")) : "");
            list.push({ name: displayVal, type: "select_current", path: displayVal });
            files.forEach(file => list.push({ name: file.name, path: file.path, type: "file", item: file.item }));
        } else {
            // THE ROOT FIX: Remove leading slash and handle empty root for file mode
            const rootDisplayName = t(config.rootName || (config.mode === "folder" ? "/" : ""));
            let currentPathDisplay = rootDisplayName;
            if (dir && dir !== "/") {
                const cleanDir = dir.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
                const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
                currentPathDisplay = `${rootDisplayName}${sep}${cleanDir}`;
            }
            list.push({ name: currentPathDisplay, type: "select_current", path: dir || "/" });
            if (dir) list.push({ name: t("$widgets.back") || ".. [Back]", type: "up" });
            Array.from(entries).sort().forEach(folder => list.push({ name: folder, type: "dir" }));
        }

        if (!isDropdownMode && config.mode !== "folder") {
            files.sort((a, b) => a.name.localeCompare(b.name)).forEach(file => list.push({ name: file.name, path: file.path, type: "file", item: file.item }));
        }

        list.forEach(entry => {
            const displayName = entry.type === "file" ? entry.name.replace(/\.(safetensors|json)$/i, "") : entry.name;
            // THE RICH FORMAT FIX: Support label/display split like DROPDOWN for object items
            let contentHTML = displayName;
            if (entry.type === "file" && entry.item && typeof entry.item === "object" && entry.item.label && (entry.item.display || entry.item.value)) {
                const displayStr = entry.item.display || entry.item.value;
                const lColor = rowPaintON?.textColor || rowPaintON?.fill || rowPaintOFF?.textColor || rowPaintOFF?.fill || "#ffffff";
                contentHTML = `<span style="color: ${lColor}; font-weight: bold">${entry.item.label}</span><span>${displayStr}</span>`;
            } else if (entry.item && typeof entry.item === "object" && entry.item.display) {
                contentHTML = entry.item.display;
            }

            let prefix = isDropdownMode ? null : BROWSER_ICONS.FILE;
            let prefixColor = null;
            if (entry.type === "select_current") prefix = hasIndicator ? sourceEl._glyphs[1] : null;
            else if (entry.type === "dir") prefix = BROWSER_ICONS.DIR;
            else if (entry.type === "up") prefix = BROWSER_ICONS.UP;
            else if (config.fileType === "palette") prefix = BROWSER_ICONS.PALETTE;
            else if (config.fileType === "lora") {
                const ratings = config.ratingsList || node?._loraRatings || {};
                const rating = parseInt(ratings[entry.path] || 0, 10);
                const ratingGlyphs = ["", "🆂 ", "🅰 ", "🅱 ", "🅲 ", "🅳 ", "🅴 ", "🅵 "];
                if (rating >= 1 && rating <= 7) {
                    prefix = ratingGlyphs[rating];
                    const palData = config.ratingsPalette || node?._ratingsPalette;
                    if (palData?.palettes) {
                        const pal = palData.palettes.find(p => parseInt(p.id, 10) === rating);
                        const c = pal?.entries?.main?._OFF || pal?.entries?.main?._ON;
                        if (c) prefixColor = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1.0})`;
                    }
                } else {
                    prefix = config.previewList?.includes(entry.path) ? BROWSER_ICONS.LORAIMAGE : BROWSER_ICONS.LORA;
                }
            }

            const isSelected = entry.type === "file" && (entry.path || "").replace(/\\/g, "/") === (config.value || "").replace(/\\/g, "/");
            const targetContainer = (entry.type === "select_current" || entry.type === "up") ? picker._headerWrapper : contentWrapper;

            const row = appendHybridPickerRow(targetContainer, sourceEl, rowPaintOFF, rowPaintON, scale, dynamicRowHeight, prefix, contentHTML, isSelected, pX, (entry.type === "select_current" && !hasIndicator) ? 0 : iconOffset, sW);
            row.style.cursor = (entry.type === "select_current") ? "default" : "pointer";
            if (entry.type === "select_current") row.style.fontStyle = "italic";
            if (prefixColor && row._glyphSpan) row._glyphSpan.style.color = prefixColor;

            row.onmouseenter = () => {
                // THE PREVIEW TRIGGER: Only show the box if the lora has a validated companion image
                const itemObj = (config.items || []).find(i => {
                    if (!i || typeof i !== "object") return false;
                    const iv = (i.path ?? i.value ?? i.name);
                    return (iv || "").replace(/\\/g, "/") === (entry.path || "").replace(/\\/g, "/");
                });
                const previewUrl = itemObj?.imageUrl || (config.previewList?.includes(entry.path)
                    ? `/xcp/get_lora_preview?name=${encodeURIComponent(entry.path)}`
                    : null);
                if (entry.type === "file" && previewUrl) {
                    // Avoid stale async image loads from reviving an old black preview box.
                    const token = (picker._previewToken || 0) + 1;
                    picker._previewToken = token;
                    picker._previewImg.onload = () => {
                        if (picker._previewToken !== token) return;
                        picker._aspectRatio = (picker._previewImg.naturalWidth / picker._previewImg.naturalHeight) || 1;
                        picker._previewBox.style.display = "block";
                    };
                    picker._previewImg.onerror = () => {
                        if (picker._previewToken !== token) return;
                        picker._previewBox.style.display = "none";
                    };
                    picker._previewImg.src = previewUrl;
                } else {
                    picker._previewBox.style.display = "none";
                }
            };
            row.onmouseleave = () => {
                picker._previewToken = (picker._previewToken || 0) + 1;
                picker._previewBox.style.display = "none";
            };
            row.onclick = (e) => {
                e.stopPropagation();
                if (entry.type === "up") {
                    const parts = dir.split("/");
                    parts.pop();
                    renderRows(parts.join("/"));
                } else if (entry.type === "select_current") {
                    // THE NAVIGATION FIX: Top path display is now read-only info; selection happens via bottom button
                    return;
                } else if (entry.type === "dir") {
                    renderRows(dir ? `${dir}/${entry.name}` : entry.name);
                } else {
                    forceFileBrowserResync(node, config, sourceEl);
                    if (callbacks.onChange) callbacks.onChange(entry.path);
                    closeFilePicker();
                }
                // Force immediate canvas sync to handle the browser's height animation loop
                node.setDirtyCanvas(true, true);
            };
            // THE CONTROL ROWS SPLIT: Ensure navigation and path display stay in the fixed header
            if (entry.type === "select_current" || entry.type === "up") {
                picker._headerWrapper.appendChild(row);
            } else {
                contentWrapper.appendChild(row);
            }
        });

        // Re-check viewport fit after navigation because folder depth/size can change picker height.
        requestAnimationFrame(() => {
            if (node) {
                node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 16);
                if (typeof node.requestDerpSync === "function") node.requestDerpSync();
                if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
            }
            // Force row-font re-sync after navigation rebuilds list rows.
            if (picker) picker._lastRowHash = "";
            ensureElementVisibleInViewport(picker, {
                viewportMargin: 8,
                durationMs: 220,
                easing: "easeOutQuad",
                followFrames: 8,
            });
        });

        // THE ACTION FIX: Add dedicated "Select Folder" confirmation button at the bottom of the list
        if (config.mode === "folder") {
            const selectBtn = document.createElement("div");
            selectBtn.style.boxSizing = "border-box";
            selectBtn.style.height = `${dynamicRowHeight * scale}px`;
            selectBtn.style.flexShrink = "0";
            selectBtn.style.display = "flex";
            selectBtn.style.alignItems = "center";
            selectBtn.style.justifyContent = "center";
            selectBtn.style.cursor = "pointer";
            selectBtn.style.fontWeight = "normal";
            selectBtn.style.marginTop = "4px";
            selectBtn.style.borderTop = "1px solid rgba(255,255,255,0.15)";

            selectBtn.innerText = "Select Folder";

            const btnPaint = rowPaintON || rowPaintOFF;
            selectBtn.style.fontSize = btnPaint?.fontSize ? `${btnPaint.fontSize * scale}px` : (sourceEl._label?.style.fontSize || `${10 * scale}px`);
            selectBtn.style.fontFamily = btnPaint?.font || "Arial";
            selectBtn.style.color = btnPaint?.textColor || btnPaint?.fill || "white";

            selectBtn.onclick = (e) => {
                e.stopPropagation();
                const finalPath = picker._currentDir || "/";
                forceFileBrowserResync(node, config, sourceEl);
                if (callbacks.onChange) callbacks.onChange(finalPath);
                closeFilePicker();
                node.setDirtyCanvas(true, true);
            };
            contentWrapper.appendChild(selectBtn);
        }

        // THE AUTO-SCROLL ENGINE: On initial open, jump the scroll position to the selected item.
        if (!picker._hasAutoScrolled) {
            const headerCount = list.filter(e => e.type === "select_current" || e.type === "up").length;
            const selectedIdxInList = list.findIndex(e => e.type === "file" && (e.path || "").replace(/\\/g, "/") === (config.value || "").replace(/\\/g, "/"));

            if (selectedIdxInList !== -1) {
                const scrollIdx = selectedIdxInList - headerCount;
                const scrollItemsCount = contentWrapper.children.length;
                const viewportRows = picker._visibleLimit - headerCount;

                if (scrollItemsCount > viewportRows) {
                    // THE SCROLL CENTER ENGINE: Calculate target scroll in base units (unscaled).
                    // This prevents coordinate drift and ensures centering works at all zoom levels.
                    const totalContentH = scrollItemsCount * dynamicRowHeight;
                    const viewportH = viewportRows * dynamicRowHeight;

                    // Center the item: (Index * Height) - (Half Viewport) + (Half Item Height)
                    let scrollPos = (scrollIdx * dynamicRowHeight) - (viewportH / 2) + (dynamicRowHeight / 2);

                    const maxScroll = Math.max(0, totalContentH - viewportH);
                    const finalScroll = Math.max(0, Math.min(scrollPos, maxScroll));

                    picker._targetAutoScroll = finalScroll * scale;
                    scrollBounds.scrollTop = picker._targetAutoScroll;

                    requestAnimationFrame(() => {
                        if (scrollBounds) {
                            scrollBounds.scrollTop = picker._targetAutoScroll;
                        }
                    });
                }
            }
            picker._hasAutoScrolled = true;
        }
    };

    // THE INITIAL DIRECTORY FIX: Extract the folder path from the current value
    let startDir = "";
    if (config.value && typeof config.value === "string") {
        const normalized = config.value.replace(/[\\/]/g, "/");
        // THE FOLDER MODE FIX: Folder browsers start at the value itself, not the parent directory
        if (config.mode === "folder") {
            startDir = normalized === "/" ? "" : normalized;
        } else if (normalized.includes("/")) {
            startDir = normalized.substring(0, normalized.lastIndexOf("/"));
        }
    }

    renderRows(startDir);
    picker._configItemsHash = itemsHash;
    picker._renderRows = renderRows;

    picker.onmouseleave = () => {
        if (picker._previewBox) picker._previewBox.style.display = "none";
    };

    document.body.appendChild(picker);
    activeFilePicker = picker;
    window.__xcpHasActiveFileBrowser = true;

    ensureElementVisibleInViewport(picker, {
        viewportMargin: 8,
        durationMs: 220,
        easing: "easeOutQuad",
        followFrames: 8,
    });

    if (node) {
        node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, 24);
        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    }

    toggleSingletonShield(true, closeFilePicker);
}

export function syncFileBrowser(context, node, app, config) {
    if (!config?.geometry) return;
    const safeConfig = config;
    const isCanvas = !!(context && (context.canvas || context instanceof CanvasRenderingContext2D));
    const useCanvasShield = safeConfig.canvasShield === true;

    let el;
    if (isCanvas) {
        if (!node._derpDomElements) node._derpDomElements = {};
        el = node._derpDomElements[safeConfig.key];
        if (!el) {
            // THE CALLBACK FIX: Map safeConfig directly to support root-level onChange handlers.
            el = createFileBrowser({ ...(safeConfig.callbacks || {}), icon: safeConfig.icon });
            node._derpDomElements[safeConfig.key] = el;
        }

        let liveReg = node.layout?.regions?.[safeConfig.key];

        const togglePicker = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            executeShieldedInteraction(node, app, safeConfig.geometry.x, safeConfig.geometry.y, safeConfig.geometry.w, safeConfig.geometry.h, () => {
                if (activeFilePicker && activeFilePicker._sourceEl === el) closeFilePicker();
                else openFilePicker(el, safeConfig, node, safeConfig);
                node.setDirtyCanvas(true, true);
            });
            return true;
        };

        if (liveReg && !liveReg.onPress) {
            liveReg.onPress = togglePicker;
        }

        // THE HTML NATIVE CLICK FIX: Bind directly to the HTML overlay so it triggers
        // when clicked above the Fatha interaction shield.
        el.onpointerdown = togglePicker;
    } else {
        el = context;
    }

    if (!el) return;

    const { x, y, w, h } = safeConfig.geometry;
    const isAwake = activeFilePicker && activeFilePicker._sourceEl === el;
    const useAnim = isWidgetAnimationEnabled(safeConfig, node, app);

    // THE FAST-HASH GATING: Prevent expensive theme resolution and environment lookups if the UI state is static
    const isPressed = node._pressedRegionKey === safeConfig.key || (el.dataset && el.dataset.isPressed === "true");
    const isHovered = (safeConfig.mouseOver !== false && (node._hoveredRegionKey === safeConfig.key || (el.dataset && el.dataset.isHovered === "true")));
    const itemsHash = JSON.stringify(safeConfig.items || []);
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${safeConfig.value}_${itemsHash}_${isAwake}`;

    const cache = node._fileBrowserCache || (node._fileBrowserCache = {});
    const itemCache = cache[safeConfig.key] || (cache[safeConfig.key] = {});

    // THE ANIMATION TRAP FIX: Bypass the static hash lock if the widget is actively interpolating its color
    const isAnim = itemCache.res && itemCache.res.isAnimating;
    const needsFullSync =
        node._forceSync ||
        safeConfig.bypassHashOptimization === true ||
        itemCache.hash !== stateHash ||
        isAnim;

    if (!needsFullSync && itemCache.res) {
        var { props, stateStr, bodyPaint, labelPaint, fs, rawIc, animatedFillColor, animatedTextColor, isAnimating } = itemCache.res;
    } else {
        const resolvedThemeKeys = resolveHybridThemeKeys(safeConfig.themeKey);
        const bodyKey = resolvedThemeKeys.bodyKey;
        const labelKey = resolvedThemeKeys.textKey;

        const envConfig = { ...safeConfig, themeKey: `${bodyKey}, ${labelKey}` };
        var { props, stateStr, bodyPaint, labelPaint } = resolveWidgetEnv(node, envConfig);
        var fs = props.fontSize || labelPaint?.fontSize || 10;
        var rawIc = safeConfig.textColor || labelPaint?.textColor || labelPaint?.fill || "red";

        const sysAlpha = safeConfig.alpha !== undefined ? safeConfig.alpha : 1;
        var { fillColor: animatedFillColor, iconColor: animatedTextColor, isAnimating } = animateWidgetColors(node, `_file_anim_${safeConfig.key}`, safeConfig.btnColor || bodyPaint?.fill || "transparent", rawIc, sysAlpha, useAnim);

        itemCache.hash = stateHash;
        itemCache.res = { props, stateStr, bodyPaint, labelPaint, fs, rawIc, animatedFillColor, animatedTextColor, isAnimating };
    }

    el._isAnimating = isAnimating;
    // THE AWAKE GATE: Ensure framework identifies active color transitions
    if (isAnimating && node) node._derpAwakeFrames = 5;

    // THE ORPHAN GUARD: If a picker is active but its source element was ripped from the DOM
    // (e.g. during a Basta switch), force it to close immediately without waiting for an animation.
    if (activeFilePicker && (!activeFilePicker._sourceEl || !document.body.contains(activeFilePicker._sourceEl))) {
        if (typeof window._xcpCloseActiveFileBrowser === "function") window._xcpCloseActiveFileBrowser();
    }

    if (isCanvas && useCanvasShield && !isAwake) {
        const ctx = context;
        const dsScale = app?.canvas?.ds?.scale || 1;
        if (!safeConfig.skipBackground) {
            masterPainter(ctx, { width: w, height: h, posX: snapToScreenGrid(x, dsScale), posY: snapToScreenGrid(y, dsScale), paintData: bodyPaint, color: animatedFillColor });
        }

        const rootDisplayName = t(safeConfig.rootName || (safeConfig.mode === "folder" ? "/" : ""));
        const isSelection = safeConfig.value && safeConfig.value !== "/" && (safeConfig.mode === "folder" || (safeConfig.items || []).some(item => {
            const itemValue = typeof item === "string" ? item : (item?.path ?? item?.value ?? item?.name);
            return itemValue === safeConfig.value;
        }));
        let currentVal = rootDisplayName;
        if (isSelection) {
            const cleanPath = safeConfig.value.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
            const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
            currentVal = `${rootDisplayName}${sep}${cleanPath}`;
        }

        const labelStr = (safeConfig.mode === "folder" || (safeConfig.mode === "file" && isSelection)) ? currentVal : (props.displayText || "Browse Files...");

        if (labelPaint) {
            const pX = props.padding[0];
            const iconOffset = fs * 1.2; // THE ALIGNMENT FIX: Space for the folder icon on the left
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + pX, y, w - (pX * 2), h);
            ctx.clip();

            // Draw indicator on canvas (LEFT SIDE)
            if (shouldShowFileBrowserIndicator(safeConfig)) {
                masterPainterText(ctx, {
                    text: el._glyphs[0],
                    x: snapToScreenGrid(x + pX, dsScale),
                    y: snapToScreenGrid(y + (h / 2), dsScale),
                    align: "left", baseline: "middle",
                    paintData: { ...labelPaint, fontSize: fs * 0.8, fill: animatedTextColor }
                });
            }

            // Draw path label (OFFSET TO RIGHT)
            masterPainterText(ctx, {
                text: labelStr,
                x: snapToScreenGrid(x + pX + (shouldShowFileBrowserIndicator(safeConfig) ? iconOffset : 0), dsScale),
                y: snapToScreenGrid(y + (h / 2), dsScale),
                align: "left", baseline: "middle",
                paintData: { ...labelPaint, fontSize: fs, fill: animatedTextColor }
            });

            ctx.restore();
        }
    }

    const scale = syncElementToCanvas(el, node, app, x, y, w, h);
    if (scale === null) return;

    // THE FAST-HASH GATING: Prevent layout thrashing and theme resolution unless state or content changes
    const rootDisplayName = t(safeConfig.rootName || (safeConfig.mode === "folder" ? "/" : ""));
    const isSelection = safeConfig.value && safeConfig.value !== "/" && (safeConfig.mode === "folder" || (safeConfig.items || []).some(item => {
        const itemValue = typeof item === "string" ? item : (item?.path ?? item?.value ?? item?.name);
        return itemValue === safeConfig.value;
    }));
    let currentVal = rootDisplayName;
    if (isSelection) {
        const cleanPath = safeConfig.value.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentVal = `${rootDisplayName}${sep}${cleanPath}`;
    }
    const labelStr = (safeConfig.mode === "folder" || (safeConfig.mode === "file" && isSelection)) ? currentVal : (props.displayText || "Browse Files...");

    const htmlSyncKey = `${scale}_${stateStr}_${animatedFillColor}_${animatedTextColor}_${labelStr}_${fs}_${isAwake}`;
    if (el._lastSyncKey !== htmlSyncKey || node._forceSync) {
        el._lastSyncKey = htmlSyncKey;
        el.style.width = `${w * scale}px`;
        el.style.height = `${h * scale}px`;
        el._config = safeConfig;
        el._node = node;

        applyInteractionStyles(el, safeConfig, stateStr);
        if (bodyPaint) applyHTMLTheme(el, { ...bodyPaint, fill: animatedFillColor }, scale);

        el._label.innerText = labelStr;
        el._label.style.color = animatedTextColor;
        el._label.style.fontSize = `${fs * scale}px`;
        el._label.style.fontFamily = labelPaint?.font || "Arial";
        el._label.style.justifyContent = "flex-start";
        el._label.style.alignItems = "center";

        // THE ICON ALIGNMENT FIX: Move arrow to left and adjust label padding
        const pX = (safeConfig.padding?.[0] || 4) * scale;
        const hasIndicator = shouldShowFileBrowserIndicator(safeConfig);
        const iconOffset = hasIndicator ? (fs * 1.2) * scale : 0;
        el._label.style.padding = `0px ${pX}px 0px ${pX + iconOffset}px`;

        el._arrow.style.fontSize = `${fs * 0.8 * scale}px`;
        el._arrow.style.left = `${pX}px`;
        el._arrow.style.right = "auto";
        el._arrow.style.top = "50%";
        el._arrow.style.transform = "translateY(-50%)";
    }

    el._arrow.innerHTML = el._glyphs[0];
    const hasIndicator = shouldShowFileBrowserIndicator(safeConfig);
    el._arrow.style.display = hasIndicator ? "block" : "none";

    el.style.display = (isAwake || (isCanvas && useCanvasShield)) ? "none" : "block";

    if (activeFilePicker && activeFilePicker._sourceEl === el) {
        if (activeFilePicker._configItemsHash !== itemsHash && typeof activeFilePicker._renderRows === "function") {
            activeFilePicker._configItemsHash = itemsHash;
            activeFilePicker._renderRows(activeFilePicker._currentDir || "");
        }
        const ds = app.canvas.ds;

        const liveAnchorRect = resolveScreenAnchorRect(el, node, app, safeConfig.geometry);
        const anchorRect = isValidRect(liveAnchorRect) ? liveAnchorRect : (activeFilePicker._anchorRect || el._screenRect);
        const canvasRect = app.canvas.canvas.getBoundingClientRect();
        const padL = node._padL || 0;
        const screenX = (anchorRect?.left ?? (canvasRect.left + (node.pos[0] + padL + x + ds.offset[0]) * scale)).toFixed(2);
        const screenY = (anchorRect?.top ?? (canvasRect.top + (node.pos[1] + y + ds.offset[1]) * scale)).toFixed(2);

        const {mW} = getDerpVars(node);
        const dRowH = activeFilePicker._dynamicRowHeight;
        const sepHeightLocal = activeFilePicker._sepHeightBase || 0;

        const headerCount = activeFilePicker._headerWrapper ? activeFilePicker._headerWrapper.children.length : 0;
        const scrollCount = activeFilePicker._contentWrapper ? activeFilePicker._contentWrapper.children.length : 0;

        const visibleScrollRows = Math.min(scrollCount, activeFilePicker._visibleLimit - headerCount);
        const targetH = (headerCount + visibleScrollRows) * dRowH + sepHeightLocal + mW;

        const isInteracting = window._xcpDerpState?.isInteracting === true;

        // THE REFLOW FIX: Immediate size sync if interacting, otherwise lerp for opening/resizing[cite: 28, 171].
        if (isInteracting) {
            activeFilePicker._currentSize[1] = targetH;
        } else {
            activeFilePicker._currentSize[1] = lerpTo(activeFilePicker._currentSize[1], targetH, DROPDOWN_ANIM_SETTINGS.lerpFactor, useAnim).value;
        }

        // Closing is now immediate, so we only track the fade-in animation[cite: 18, 52].
        const alphaAnim = animateAlpha(activeFilePicker._itemAlpha, 1, DROPDOWN_ANIM_SETTINGS.alphaFactor, useAnim);
        activeFilePicker._itemAlpha = alphaAnim.value;

        const overlayHash = `${screenX}_${screenY}_${(w * scale).toFixed(2)}_${activeFilePicker._currentSize[1].toFixed(2)}_${activeFilePicker._itemAlpha.toFixed(3)}_${isInteracting}`;
        if (activeFilePicker._lastOverlayHash !== overlayHash || node._forceSync) {
            activeFilePicker._lastOverlayHash = overlayHash;

            activeFilePicker.style.left = `${screenX}px`;
            activeFilePicker.style.top = `${screenY}px`;
            activeFilePicker.style.width = `${(w * scale).toFixed(2)}px`;
            activeFilePicker.style.height = `${(activeFilePicker._currentSize[1] * scale).toFixed(2)}px`;
            activeFilePicker.style.opacity = activeFilePicker._itemAlpha;
            activeFilePicker.style.maxHeight = `${(activeFilePicker._visibleLimit * dRowH * scale).toFixed(2)}px`;

            // THE O(N) DOM THRASH FIX: Only update row scales when physical zoom changes, not during animation
            const {sW: rowSW} = getDerpVars(node);
            const rowHash = `${scale}_${dRowH}_${rowSW}_${fs}_${headerCount}_${scrollCount}`;
            if (activeFilePicker._lastRowHash !== rowHash) {
                activeFilePicker._lastRowHash = rowHash;

                const syncRow = (row) => {
                    const rowPX = (safeConfig.padding?.[0] || 4);
                    const rowFS = Number(row._baseFontSize) || (typeof fs !== "undefined" ? fs : (safeConfig.fontSize || 10));
                    const glyphMult = Number(row._glyphSizeMult) || 1;
                    const rowIconOffset = rowFS * 1.2;

                    row.style.height = `${dRowH * scale}px`;
                    row.style.padding = `0px ${rowPX * scale}px`;
                    if (row._glyphSpan) {
                        row._glyphSpan.style.width = `${rowIconOffset * scale}px`;
                        row._glyphSpan.style.marginRight = `${rowSW * scale}px`;
                        row._glyphSpan.style.fontSize = `${rowFS * glyphMult * scale}px`;
                    }
                    row.style.fontSize = `${rowFS * scale}px`;
                };

                if (activeFilePicker._headerWrapper) Array.from(activeFilePicker._headerWrapper.children).forEach(syncRow);
                if (activeFilePicker._contentWrapper) Array.from(activeFilePicker._contentWrapper.children).forEach(syncRow);

                if (activeFilePicker._separator) {
                    const {sH} = getDerpVars(node);
                    activeFilePicker._separator.style.paddingTop = `${sH * scale}px`;
                    activeFilePicker._separator.style.paddingBottom = `${sH * scale}px`;
                    const lines = activeFilePicker._separator.children;
                    if (lines.length === 2) {
                        lines[0].style.height = `${1 * scale}px`;
                        lines[1].style.height = `${1 * scale}px`;
                        lines[0].style.backgroundColor = lineTop;
                        lines[1].style.backgroundColor = lineBottom;
                    }
                }
            }

        }

        // Keep preview box in lockstep with canvas zoom/pan every frame (same behavior as dropdown).
        if (activeFilePicker._previewBox && activeFilePicker._previewBox.style.display !== "none") {
            const { sH } = getDerpVars(node);
            const targetW = (w * scale).toFixed(2);
            const targetH = (targetW / (activeFilePicker._aspectRatio || 1)).toFixed(2);

            activeFilePicker._previewBox.style.width = `${targetW}px`;
            activeFilePicker._previewBox.style.height = `${targetH}px`;
            activeFilePicker._previewBox.style.left = `${screenX}px`;
            activeFilePicker._previewBox.style.top = `${(screenY - (sH * scale) - targetH)}px`;
            activeFilePicker._previewBox.style.opacity = activeFilePicker._itemAlpha;
        }

        // THE ANIMATION CLAMP FIX: Re-enforce the target scroll during the opening animation
        // so the scrollbar logic doesn't clamp it to 0 when the viewport is artificially small.
        if (activeFilePicker._targetAutoScroll !== undefined) {
            if (activeFilePicker._scrollBounds) {
                activeFilePicker._scrollBounds.scrollTop = activeFilePicker._targetAutoScroll;
            }

            // Release the lock when the animation completes
            if (Math.abs(activeFilePicker._currentSize[1] - targetH) < 2) {
                delete activeFilePicker._targetAutoScroll;
            }
        }
        const canvasEl = comfyApp.canvas.canvas;
        syncSingletonShield(comfyApp, -ds.offset[0], -ds.offset[1], canvasEl.width / scale, canvasEl.height / scale);

        syncHybridScroll(activeFilePicker, scale);
    }
}