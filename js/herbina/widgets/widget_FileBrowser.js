/**
 * Specialist: ./herbina/widgets/widget_FileBrowser.js
 * ROLE: Canvas-only file browser widget for file and folder navigation.
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    measureTextHeight,
    clampText,
    snapToScreenGrid
} from "../utils/widgetsUtils.js";
import { lerpTo, animateAlpha, animateWidgetColors } from "../masterAnimator.js";
import { getDerpVars } from "../../fatha/fatha.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";
import { ensureScreenRectVisible } from "../../fatha/core/fathaWarp.js";

const FILEBROWSER_ICON_MAP = {
    folder: ["📁", "📂"],
    dropdown: ["▶", "▼"],
    palette: ["❖", "❖"],
    file: ["🖺", "🖺"],
    settings: ["⛯", "⛯"],
    fallback: ["📁", "📂"],
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
const AUTO_FLIP_DROPDOWN_BY_SPACE = false;
const PICKER_WARP_MARGIN_UNITS = 10;
const PICKER_SCROLLBAR_WIDTH = 6;
const PICKER_SCROLLBAR_INSET = 2;
const PICKER_SCROLLBAR_MIN_THUMB = 18;

const DROPDOWN_ANIM_SETTINGS = {
    lerpFactor: 0.325,
    alphaFactor: 0.2,
};

let activeFilePicker = null;
let filePickerListenersInstalled = false;

function syncActiveFilePickerConfig(node, config) {
    if (!activeFilePicker) return;
    if (activeFilePicker.node !== node || activeFilePicker.key !== config?.key) return;
    activeFilePicker.config = config;
    activeFilePicker.callbacks = getFileBrowserCallbacks(config);
}

function getFileBrowserGlyphs(iconName) {
    const key = String(iconName || "folder").toLowerCase();
    return FILEBROWSER_ICON_MAP[key] || FILEBROWSER_ICON_MAP.fallback;
}

function markNodeDirty(node, awakeFrames = 12) {
    if (!node) return;
    node._derpAwakeFrames = Math.max(node._derpAwakeFrames || 0, awakeFrames);
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function computeScreenAnchorRect(node, app, geometry) {
    const ds = app?.canvas?.ds;
    const canvas = app?.canvas?.canvas;
    if (!ds || !canvas || !geometry) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    const scale = ds.scale;
    return {
        left: rect.left + (((node?.pos?.[0] || 0) + geometry.x + ds.offset[0]) * scale),
        top: rect.top + (((node?.pos?.[1] || 0) + geometry.y + ds.offset[1]) * scale),
        width: geometry.w * scale,
        height: geometry.h * scale,
    };
}

function isPointInRect(x, y, rect) {
    return !!rect && x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

function shouldShowFileBrowserIndicator(config) {
    const indicator = config?.indicator;
    return !(indicator === false || indicator === "off" || indicator === "false" || indicator === 0);
}

function isDropdownFileBrowser(config) {
    const glyphs = getFileBrowserGlyphs(config?.icon);
    return config?.icon === "dropdown" || glyphs[0] === "▶";
}

function getFileBrowserCallbacks(config) {
    return {
        onChange: config?.onChange || config?.callbacks?.onChange || null,
    };
}

function getFileBrowserItemValue(item) {
    return typeof item === "string" ? item : (item?.path ?? item?.value ?? item?.key ?? item?.id ?? item?.name ?? item?.title ?? "");
}

function getFileBrowserLeafDisplay(value) {
    return String(value || "")
        .replace(/[\\]/g, "/")
        .split("/")
        .pop()
        .replace(/\.(safetensors|json)$/i, "");
}

function getDropdownItemDisplay(item) {
    if (item && typeof item === "object") {
        const labelText = stripFileBrowserHTML(item.label);
        const displayText = String(item.display ?? item.text ?? item.name ?? item.title ?? item.key ?? item.value ?? "");
        if (labelText || displayText) return `${labelText}${displayText}`.trim();
    }
    return getFileBrowserLeafDisplay(getFileBrowserItemValue(item));
}

function stripFileBrowserHTML(value) {
    return String(value || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

function getFileBrowserCurrentDisplay(config, items = []) {
    if (!isDropdownFileBrowser(config)) return null;

    const selectedValue = String(config?.value || "");
    const selectedItem = items.find((item) => String(getFileBrowserItemValue(item)) === selectedValue);

    if (selectedItem && typeof selectedItem === "object") {
        const labelText = stripFileBrowserHTML(selectedItem.label);
        const displayText = String(selectedItem.display || "");
        return (labelText || displayText)
            ? `${labelText}${displayText}`.trim()
            : getFileBrowserLeafDisplay(getFileBrowserItemValue(selectedItem));
    }

    return getFileBrowserLeafDisplay(selectedValue || getFileBrowserItemValue(items[0]));
}

function resolvePickerTheme(config, node) {
    const parts = String(config?.themeKey || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const bodyKey = parts[0] || "panel";
    const pickerKey = parts.length >= 3 ? parts[1] : null;
    const textKey = parts.length >= 3 ? (parts[2] || "t_textsystem") : (parts[1] || parts[0] || "t_textsystem");
    const resolvedPickerKey = pickerKey || bodyKey;
    return {
        listPaint: resolvePaintData(node, resolvedPickerKey, "_OFF") || resolvePaintData(node, bodyKey, "_OFF") || node._panelPaintData_OFF,
        rowPaintOFF: resolvePaintData(node, textKey, "_OFF") || node._t_textnormalPaintData_OFF,
        rowTextON: resolvePaintData(node, textKey, "_ON") || resolvePaintData(node, textKey, "_OFF") || node._t_textnormalPaintData_OFF,
        rowPaintON: resolvePaintData(node, bodyKey, "_ON") || node._t_textnormalPaintData_ON,
    };
}

function inheritPickerCorners(primaryPaint, fallbackPaint) {
    if (primaryPaint?.corners != null) return primaryPaint.corners;
    if (fallbackPaint?.corners != null) return fallbackPaint.corners;
    return 0;
}

function getFileRowPrefix(config, node, entry) {
    if (entry.type === "select_current") {
        return { prefix: shouldShowFileBrowserIndicator(config) ? getFileBrowserGlyphs(config?.icon)[1] : null, prefixColor: null };
    }
    if (entry.type === "dir") return { prefix: BROWSER_ICONS.DIR, prefixColor: null };
    if (entry.type === "up") return { prefix: BROWSER_ICONS.UP, prefixColor: null };
    if (config.fileType === "palette") return { prefix: BROWSER_ICONS.PALETTE, prefixColor: null };

    if (config.fileType === "lora") {
        const ratings = config.ratingsList || node?._loraRatings || {};
        const rating = parseInt(ratings[entry.path] || 0, 10);
        const ratingGlyphs = ["", "🆂 ", "🅰 ", "🅱 ", "🅲 ", "🅳 ", "🅴 ", "🅵 "];
        if (rating >= 1 && rating <= 7) {
            let prefixColor = null;
            const palData = config.ratingsPalette || node?._ratingsPalette;
            if (palData?.palettes) {
                const pal = palData.palettes.find((item) => parseInt(item.id, 10) === rating);
                const c = pal?.entries?.main?._OFF || pal?.entries?.main?._ON;
                if (c) prefixColor = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3] ?? 1.0})`;
            }
            return { prefix: ratingGlyphs[rating], prefixColor };
        }
        return { prefix: config.previewList?.includes(entry.path) ? BROWSER_ICONS.LORAIMAGE : BROWSER_ICONS.LORA, prefixColor: null };
    }

    return { prefix: isDropdownFileBrowser(config) ? null : BROWSER_ICONS.FILE, prefixColor: null };
}

function closeFilePicker() {
    if (!activeFilePicker) return;
    const node = activeFilePicker.node;
    activeFilePicker = null;
    window.__xcpHasActiveFileBrowser = false;
    markNodeDirty(node, 8);
}

function forceFileBrowserResync(node, config) {
    if (node && node._fileBrowserCache && config?.key) {
        delete node._fileBrowserCache[config.key];
    }
    if (node) {
        node._forceSync = true;
        node._layoutDirty = true;
        markNodeDirty(node, 8);
    }
}

function clampPickerScroll(state) {
    if (!state) return;
    const viewportRows = Math.max(0, state.renderedScrollRows ?? state.visibleScrollRows ?? 0);
    const maxScroll = Math.max(0, (state.scrollRows.length * state.rowHeight) - (viewportRows * state.rowHeight));
    state.scrollOffset = Math.max(0, Math.min(state.scrollOffset || 0, maxScroll));
}

function getPickerScrollMetrics(state) {
    const viewportRows = Math.max(0, state.renderedScrollRows ?? state.visibleScrollRows ?? 0);
    const viewportHeight = viewportRows * state.rowHeight;
    const contentHeight = state.scrollRows.length * state.rowHeight;
    const maxScroll = Math.max(0, contentHeight - viewportHeight);
    return {
        viewportRows,
        viewportHeight,
        contentHeight,
        maxScroll,
        isScrollable: maxScroll > 0.5,
    };
}

function ensurePickerSelectionVisible(state) {
    if (!state || !state.scrollRows.length) return;
    const selectedIndex = state.scrollRows.findIndex((row) => row.type === "file" && (row.path || "").replace(/\\/g, "/") === (state.config.value || "").replace(/\\/g, "/"));
    if (selectedIndex === -1) return;

    const viewportH = Math.max(0, (state.renderedScrollRows ?? state.visibleScrollRows ?? 0) * state.rowHeight);
    if (viewportH <= 0) return;
    const itemCenter = (selectedIndex * state.rowHeight) + (state.rowHeight / 2);
    const target = itemCenter - (viewportH / 2);
    const maxScroll = Math.max(0, (state.scrollRows.length * state.rowHeight) - viewportH);
    state.scrollOffset = Math.max(0, Math.min(target, maxScroll));
}

function rebuildFilePickerRows(state) {
    const { config, node } = state;
    const items = config.items || [];
    const dropdownMode = isDropdownFileBrowser(config);

    if (dropdownMode) {
        const headerRows = [];
        const scrollRows = [];
        const displayVal = getFileBrowserCurrentDisplay(config, items);
        headerRows.push({ id: "current", name: displayVal, type: "select_current", path: displayVal });
        items.forEach((item, idx) => {
            const itemValue = getFileBrowserItemValue(item);
            scrollRows.push({
                id: `file:${idx}:${itemValue}`,
                name: getDropdownItemDisplay(item),
                path: itemValue,
                type: "file",
                item,
            });
        });

        state.headerRows = headerRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
        state.scrollRows = scrollRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
        state.footerRow = null;
        state.visibleScrollRows = Math.max(0, state.visibleLimit - state.headerRows.length);
        state.renderedScrollRows = Math.min(state.scrollRows.length, state.visibleScrollRows);
        clampPickerScroll(state);
        return;
    }

    const entries = new Set();
    const files = [];
    const dir = state.currentDir || "";
    const normalizedDir = (dir === "/" ? "" : dir).replace(/[\\]/g, "/");

    items.forEach((item) => {
        const fullPath = getFileBrowserItemValue(item);
        if (!fullPath) return;

        const normalizedPath = fullPath.replace(/[\\]/g, "/");
        if (normalizedDir && !normalizedPath.startsWith(`${normalizedDir}/`)) return;
        const rel = normalizedDir ? normalizedPath.substring(normalizedDir.length + 1) : normalizedPath;
        const parts = rel.split("/");
        if (parts.length > 1) {
            entries.add(parts[0]);
        } else if (parts[0]) {
            files.push({ name: parts[0], path: fullPath, item });
        }
    });

    const headerRows = [];
    const scrollRows = [];
    const rootDisplayName = t(config.rootName || (config.mode === "folder" ? "/" : ""));
    let currentPathDisplay = rootDisplayName;
    if (dir && dir !== "/") {
        const cleanDir = dir.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentPathDisplay = `${rootDisplayName}${sep}${cleanDir}`;
    }
    headerRows.push({ id: "current", name: currentPathDisplay, type: "select_current", path: dir || "/" });
    if (dir) headerRows.push({ id: "up", name: t("$widgets.back") || ".. [Back]", type: "up" });
    Array.from(entries).sort().forEach((folder) => scrollRows.push({ id: `dir:${folder}`, name: folder, type: "dir" }));
    if (config.mode !== "folder") {
        files.sort((a, b) => a.name.localeCompare(b.name)).forEach((file) => scrollRows.push({ id: `file:${file.path}`, name: file.name, path: file.path, type: "file", item: file.item }));
    }

    state.headerRows = headerRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
    state.scrollRows = scrollRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
    state.footerRow = config.mode === "folder"
        ? { id: "select-folder", name: "Select Folder", type: "select_folder", prefix: null, prefixColor: null }
        : null;
    state.visibleScrollRows = Math.max(0, state.visibleLimit - state.headerRows.length - (state.footerRow ? 1 : 0));
    state.renderedScrollRows = Math.min(state.scrollRows.length, state.visibleScrollRows);
    clampPickerScroll(state);
}

function openFilePicker(config, node) {
    if (activeFilePicker && (activeFilePicker.node !== node || activeFilePicker.key !== config.key)) {
        closeFilePicker();
    }

    const { oY, mW } = getDerpVars(node);
    const theme = resolvePickerTheme(config, node);
    const rowHeight = measureTextHeight("Hgyj", 0, theme.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
    const glyphs = getFileBrowserGlyphs(config?.icon);

    let currentDir = "";
    if (config.value && typeof config.value === "string") {
        const normalized = config.value.replace(/[\\]/g, "/");
        if (config.mode === "folder") {
            currentDir = normalized === "/" ? "" : normalized;
        } else if (normalized.includes("/")) {
            currentDir = normalized.substring(0, normalized.lastIndexOf("/"));
        }
    }

    activeFilePicker = {
        key: config.key,
        node,
        config,
        callbacks: getFileBrowserCallbacks(config),
        glyphs,
        listPaint: theme.listPaint,
        rowPaintOFF: theme.rowPaintOFF,
        rowPaintON: theme.rowPaintON,
        rowTextON: theme.rowTextON,
        rowHeight,
        visibleLimit: node.properties?.dropdownVisibleLimit || 20,
        currentDir,
        currentSize: [config.geometry?.w || 200, 4],
        itemAlpha: 0,
        scrollOffset: 0,
        hoverRowId: null,
        screenAnchorRect: null,
        panelScreenRect: null,
        scrollScreenRect: null,
        rowHitboxes: [],
        itemsHash: JSON.stringify(config.items || []),
        bottomMarginUnits: mW || 0,
        offsetY: oY || 0,
        footerRow: null,
        headerRows: [],
        scrollRows: [],
        renderedScrollRows: 0,
        viewportFollowFrames: 8,
        lastViewportWarpHash: "",
        scrollbarScreenRect: null,
        scrollbarThumbScreenRect: null,
        draggingScrollbar: false,
        dragScrollbarPointerId: null,
        dragScrollbarStartY: 0,
        dragScrollbarStartOffset: 0,
    };

    rebuildFilePickerRows(activeFilePicker);
    ensurePickerSelectionVisible(activeFilePicker);
    window.__xcpHasActiveFileBrowser = true;
    if (window.app?.canvas?.bringToFront) window.app.canvas.bringToFront(node);
    markNodeDirty(node, 24);
}

function consumeEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
}

function handlePickerRowAction(row) {
    const state = activeFilePicker;
    if (!state || !row) return;

    if (row.type === "up") {
        const parts = String(state.currentDir || "").split("/");
        parts.pop();
        state.currentDir = parts.join("/");
        state.scrollOffset = 0;
        rebuildFilePickerRows(state);
        state.viewportFollowFrames = 8;
        state.lastViewportWarpHash = "";
        markNodeDirty(state.node, 16);
        return;
    }

    if (row.type === "dir") {
        state.currentDir = state.currentDir ? `${state.currentDir}/${row.name}` : row.name;
        state.scrollOffset = 0;
        rebuildFilePickerRows(state);
        state.viewportFollowFrames = 8;
        state.lastViewportWarpHash = "";
        markNodeDirty(state.node, 16);
        return;
    }

    if (row.type === "file") {
        forceFileBrowserResync(state.node, state.config);
        if (state.callbacks.onChange) state.callbacks.onChange(row.path);
        closeFilePicker();
        return;
    }

    if (row.type === "select_folder") {
        const finalPath = state.currentDir || "/";
        forceFileBrowserResync(state.node, state.config);
        if (state.callbacks.onChange) state.callbacks.onChange(finalPath);
        closeFilePicker();
    }
}

function findPickerHit(clientX, clientY) {
    const state = activeFilePicker;
    if (!state) return null;
    for (const hitbox of state.rowHitboxes || []) {
        if (isPointInRect(clientX, clientY, hitbox.rect)) return hitbox.row;
    }
    return null;
}

function isPointInScrollbarThumb(clientX, clientY) {
    const state = activeFilePicker;
    return !!state?.scrollbarThumbScreenRect && isPointInRect(clientX, clientY, state.scrollbarThumbScreenRect);
}

function isPointInScrollbarTrack(clientX, clientY) {
    const state = activeFilePicker;
    return !!state?.scrollbarScreenRect && isPointInRect(clientX, clientY, state.scrollbarScreenRect);
}

function scrollPickerToTrackPosition(clientY) {
    const state = activeFilePicker;
    if (!state?.scrollbarScreenRect) return;
    const metrics = getPickerScrollMetrics(state);
    if (!metrics.isScrollable) return;

    const trackRect = state.scrollbarScreenRect;
    const thumbRect = state.scrollbarThumbScreenRect;
    const thumbHeight = thumbRect?.height || Math.max(PICKER_SCROLLBAR_MIN_THUMB, trackRect.height * (metrics.viewportHeight / Math.max(metrics.viewportHeight, metrics.contentHeight)));
    const thumbTravel = Math.max(1, trackRect.height - thumbHeight);
    const targetTop = clamp01((clientY - trackRect.top - (thumbHeight * 0.5)) / thumbTravel);
    state.scrollOffset = targetTop * metrics.maxScroll;
    clampPickerScroll(state);
    markNodeDirty(state.node, 8);
}

function ensureFilePickerListeners() {
    if (filePickerListenersInstalled) return;
    filePickerListenersInstalled = true;

    window.addEventListener("pointerdown", (event) => {
        if (!activeFilePicker) return;

        const state = activeFilePicker;
        const { clientX, clientY } = event;
        const onScrollbarThumb = isPointInScrollbarThumb(clientX, clientY);
        const onScrollbarTrack = isPointInScrollbarTrack(clientX, clientY);
        const insideAnchor = isPointInRect(clientX, clientY, state.screenAnchorRect);
        const insidePanel = isPointInRect(clientX, clientY, state.panelScreenRect);
        const row = findPickerHit(clientX, clientY);

        consumeEvent(event);
        if (onScrollbarThumb) {
            state.draggingScrollbar = true;
            state.dragScrollbarPointerId = event.pointerId;
            state.dragScrollbarStartY = clientY;
            state.dragScrollbarStartOffset = state.scrollOffset || 0;
            return;
        }
        if (onScrollbarTrack) {
            scrollPickerToTrackPosition(clientY);
            return;
        }
        if (insideAnchor) {
            closeFilePicker();
            return;
        }
        if (!insidePanel) {
            closeFilePicker();
            return;
        }
        handlePickerRowAction(row);
    }, true);

    window.addEventListener("pointermove", (event) => {
        if (!activeFilePicker) return;
        if (activeFilePicker.draggingScrollbar && activeFilePicker.dragScrollbarPointerId === event.pointerId) {
            consumeEvent(event);
            const state = activeFilePicker;
            const metrics = getPickerScrollMetrics(state);
            const trackRect = state.scrollbarScreenRect;
            const thumbRect = state.scrollbarThumbScreenRect;
            if (metrics.isScrollable && trackRect && thumbRect) {
                const trackTravel = Math.max(1, trackRect.height - thumbRect.height);
                const deltaRatio = (event.clientY - state.dragScrollbarStartY) / trackTravel;
                state.scrollOffset = state.dragScrollbarStartOffset + (deltaRatio * metrics.maxScroll);
                clampPickerScroll(state);
                markNodeDirty(state.node, 8);
            }
            return;
        }
        const row = findPickerHit(event.clientX, event.clientY);
        const nextHoverId = row?.id || null;
        if (activeFilePicker.hoverRowId !== nextHoverId) {
            activeFilePicker.hoverRowId = nextHoverId;
            markNodeDirty(activeFilePicker.node, 8);
        }
    }, true);

    window.addEventListener("wheel", (event) => {
        if (!activeFilePicker) return;
        if (!isPointInRect(event.clientX, event.clientY, activeFilePicker.scrollScreenRect || activeFilePicker.panelScreenRect)) return;
        consumeEvent(event);
        const scale = activeFilePicker.node?.graph?.canvas?.ds?.scale || window.app?.canvas?.ds?.scale || 1;
        activeFilePicker.scrollOffset += event.deltaY / Math.max(scale, 0.001);
        clampPickerScroll(activeFilePicker);
        markNodeDirty(activeFilePicker.node, 8);
    }, { capture: true, passive: false });

    window.addEventListener("keydown", (event) => {
        if (!activeFilePicker) return;
        if (event.key !== "Escape") return;
        consumeEvent(event);
        closeFilePicker();
    }, true);

    window.addEventListener("pointerup", (event) => {
        if (!activeFilePicker) return;
        if (!activeFilePicker.draggingScrollbar) return;
        if (activeFilePicker.dragScrollbarPointerId !== event.pointerId) return;
        consumeEvent(event);
        activeFilePicker.draggingScrollbar = false;
        activeFilePicker.dragScrollbarPointerId = null;
    }, true);
}

function drawPickerRow(ctx, state, row, rect, labelPaint, scale) {
    const hovered = state.hoverRowId === row.id;
    const selected = row.type === "file" && (row.path || "").replace(/\\/g, "/") === (state.config.value || "").replace(/\\/g, "/");
    const rowPaint = hovered ? state.rowPaintON : state.listPaint;
    const textColor = (hovered || selected)
        ? (state.rowTextON?.textColor || state.rowTextON?.fill || labelPaint?.textColor || labelPaint?.fill || "#ffffff")
        : (labelPaint?.textColor || labelPaint?.fill || "#ffffff");

    masterPainter(ctx, {
        width: rect.w,
        height: rect.h,
        posX: rect.x,
        posY: rect.y,
        paintData: { ...rowPaint, corners: inheritPickerCorners(rowPaint, state.listPaint) },
        color: rowPaint?.fill || "transparent"
    });

    const pX = state.config.padding?.[0] || 4;
    const fontSize = state.rowPaintOFF?.fontSize || labelPaint?.fontSize || 10;
    const iconOffset = row.prefix ? fontSize * 1.2 : 0;
    const maxTextWidth = Math.max(0, rect.w - (pX * 2) - iconOffset);
    const label = row.type === "file" ? row.name.replace(/\.(safetensors|json)$/i, "") : row.name;
    const drawLabel = clampText(label, maxTextWidth, fontSize, labelPaint?.font || "Arial", labelPaint?.fontWeight || "normal", state.config.displayMode === "ellipsis");

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (row.prefix) {
        masterPainterText(ctx, {
            text: row.prefix,
            x: snapToScreenGrid(rect.x + pX, scale),
            y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
            align: "left",
            baseline: "middle",
            paintData: {
                ...labelPaint,
                fontSize,
                fill: row.prefixColor || textColor,
            }
        });
    }

    masterPainterText(ctx, {
        text: drawLabel,
        x: snapToScreenGrid(rect.x + pX + iconOffset, scale),
        y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
        align: "left",
        baseline: "middle",
        paintData: {
            ...labelPaint,
            fontSize,
            fill: textColor,
        }
    });

    ctx.restore();
}

function drawActiveFilePicker(ctx, node, app, config, scale) {
    const state = activeFilePicker;
    if (!state || state.node !== node || state.key !== config.key) return;

    const nextItemsHash = JSON.stringify(config.items || []);
    if (state.itemsHash !== nextItemsHash || state.config.value !== config.value) {
        state.config = config;
        state.callbacks = getFileBrowserCallbacks(config);
        state.itemsHash = nextItemsHash;
        rebuildFilePickerRows(state);
        ensurePickerSelectionVisible(state);
    }

    const anchorRect = computeScreenAnchorRect(node, app, config.geometry);
    state.screenAnchorRect = anchorRect;

    const { sH, mW } = getDerpVars(node);
    const separatorHeight = sH || 0;
    const bottomGap = mW || 0;
    const footerCount = state.footerRow ? 1 : 0;
    const renderedScrollRows = Math.min(state.scrollRows.length, Math.max(0, state.visibleScrollRows || 0));
    state.renderedScrollRows = renderedScrollRows;
    const targetHeight = ((state.headerRows.length + renderedScrollRows + footerCount) * state.rowHeight) + separatorHeight + bottomGap;
    state.currentSize[1] = lerpTo(state.currentSize[1], targetHeight, DROPDOWN_ANIM_SETTINGS.lerpFactor, true).value;
    state.itemAlpha = animateAlpha(state.itemAlpha, 1, DROPDOWN_ANIM_SETTINGS.alphaFactor, true).value;
    clampPickerScroll(state);
    const scrollMetrics = getPickerScrollMetrics(state);

    const availableBelow = window.innerHeight - (anchorRect.top + anchorRect.height) - 8;
    const availableAbove = anchorRect.top - 8;
    const pickerHeightPx = state.currentSize[1] * scale;
    const openUpward = AUTO_FLIP_DROPDOWN_BY_SPACE
        ? (pickerHeightPx > availableBelow && availableAbove > availableBelow)
        : false;

    const panelX = config.geometry.x;
    const panelY = openUpward ? (config.geometry.y - state.currentSize[1]) : (config.geometry.y + config.geometry.h);
    const panelW = config.geometry.w;
    const panelH = state.currentSize[1];

    state.panelScreenRect = {
        left: anchorRect.left,
        top: openUpward ? (anchorRect.top - pickerHeightPx) : (anchorRect.top + anchorRect.height),
        width: anchorRect.width,
        height: pickerHeightPx,
    };

    if ((state.viewportFollowFrames || 0) > 0) {
        const viewportWarpHash = `${state.panelScreenRect.left.toFixed(2)}_${state.panelScreenRect.top.toFixed(2)}_${state.panelScreenRect.width.toFixed(2)}_${state.panelScreenRect.height.toFixed(2)}`;
        if (state.lastViewportWarpHash !== viewportWarpHash) {
            state.lastViewportWarpHash = viewportWarpHash;
            const effectiveWarpMargin = PICKER_WARP_MARGIN_UNITS * Math.max(0.000001, scale);
            ensureScreenRectVisible(state.panelScreenRect, {
                viewportMargin: effectiveWarpMargin,
                durationMs: 220,
                easing: "easeOutQuad",
            });
        }
        state.viewportFollowFrames -= 1;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, state.itemAlpha));
    masterPainter(ctx, {
        width: panelW,
        height: panelH,
        posX: panelX,
        posY: panelY,
        paintData: state.listPaint,
        color: state.listPaint?.fill || "transparent"
    });

    const labelPaint = state.rowPaintOFF || state.rowTextON;
    let cursorY = panelY;
    state.rowHitboxes = [];
    state.scrollbarScreenRect = null;
    state.scrollbarThumbScreenRect = null;

    for (const row of state.headerRows) {
        const rect = { x: panelX, y: cursorY, w: panelW, h: state.rowHeight };
        drawPickerRow(ctx, state, row, rect, labelPaint, scale);
        state.rowHitboxes.push({ row, rect: {
            left: state.panelScreenRect.left,
            top: state.panelScreenRect.top + ((cursorY - panelY) * scale),
            width: state.panelScreenRect.width,
            height: state.rowHeight * scale,
        }});
        cursorY += state.rowHeight;
    }

    if (separatorHeight > 0) {
        ctx.fillStyle = lineTop;
        ctx.fillRect(panelX, cursorY, panelW, 1);
        ctx.fillStyle = lineBottom;
        ctx.fillRect(panelX, cursorY + 1, panelW, 1);
        cursorY += separatorHeight;
    }

    const footerHeight = state.footerRow ? state.rowHeight : 0;
    const scrollAreaH = Math.max(0, panelH - (cursorY - panelY) - footerHeight - bottomGap);
    const needsScrollbar = scrollMetrics.isScrollable && scrollAreaH > 0;
    const scrollbarReserve = needsScrollbar ? (PICKER_SCROLLBAR_WIDTH + (PICKER_SCROLLBAR_INSET * 2)) : 0;
    state.scrollScreenRect = {
        left: state.panelScreenRect.left,
        top: state.panelScreenRect.top + ((cursorY - panelY) * scale),
        width: state.panelScreenRect.width,
        height: scrollAreaH * scale,
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX, cursorY, panelW - scrollbarReserve, scrollAreaH);
    ctx.clip();

    const firstVisibleY = cursorY - state.scrollOffset;
    for (let i = 0; i < state.scrollRows.length; i += 1) {
        const row = state.scrollRows[i];
        const rowY = firstVisibleY + (i * state.rowHeight);
        if (rowY + state.rowHeight < cursorY || rowY > cursorY + scrollAreaH) continue;
        const rect = { x: panelX, y: rowY, w: panelW - scrollbarReserve, h: state.rowHeight };
        drawPickerRow(ctx, state, row, rect, labelPaint, scale);
        state.rowHitboxes.push({ row, rect: {
            left: state.scrollScreenRect.left,
            top: state.scrollScreenRect.top + ((rowY - cursorY) * scale),
            width: (panelW - scrollbarReserve) * scale,
            height: state.rowHeight * scale,
        }});
    }
    ctx.restore();

    if (needsScrollbar) {
        const trackX = panelX + panelW - PICKER_SCROLLBAR_WIDTH - PICKER_SCROLLBAR_INSET;
        const trackY = cursorY + PICKER_SCROLLBAR_INSET;
        const trackH = Math.max(0, scrollAreaH - (PICKER_SCROLLBAR_INSET * 2));
        const thumbRatio = clamp01(scrollMetrics.viewportHeight / Math.max(scrollMetrics.viewportHeight, scrollMetrics.contentHeight));
        const thumbH = Math.max(PICKER_SCROLLBAR_MIN_THUMB, trackH * thumbRatio);
        const thumbTravel = Math.max(0, trackH - thumbH);
        const thumbT = scrollMetrics.maxScroll > 0 ? clamp01(state.scrollOffset / scrollMetrics.maxScroll) : 0;
        const thumbY = trackY + (thumbTravel * thumbT);

        masterPainter(ctx, {
            width: PICKER_SCROLLBAR_WIDTH,
            height: trackH,
            posX: trackX,
            posY: trackY,
            paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, null), border: null, shadow: null, glow: null },
            color: "rgba(0,0,0,0.22)"
        });
        masterPainter(ctx, {
            width: PICKER_SCROLLBAR_WIDTH,
            height: thumbH,
            posX: trackX,
            posY: thumbY,
            paintData: { ...state.rowPaintON, corners: inheritPickerCorners(state.rowPaintON, state.listPaint), border: null },
            color: state.rowTextON?.fill || state.rowTextON?.textColor || "rgba(255,255,255,0.5)"
        });

        state.scrollbarScreenRect = {
            left: state.panelScreenRect.left + ((trackX - panelX) * scale),
            top: state.panelScreenRect.top + ((trackY - panelY) * scale),
            width: PICKER_SCROLLBAR_WIDTH * scale,
            height: trackH * scale,
        };
        state.scrollbarThumbScreenRect = {
            left: state.panelScreenRect.left + ((trackX - panelX) * scale),
            top: state.panelScreenRect.top + ((thumbY - panelY) * scale),
            width: PICKER_SCROLLBAR_WIDTH * scale,
            height: thumbH * scale,
        };
    }

    if (bottomGap > 0) {
        const gapY = panelY + panelH - bottomGap;
        masterPainter(ctx, {
            width: panelW,
            height: bottomGap,
            posX: panelX,
            posY: gapY,
            paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, null), border: null, shadow: null, glow: null },
            color: state.listPaint?.fill || "transparent"
        });
    }

    if (state.footerRow) {
        const footerY = panelY + panelH - state.rowHeight;
        const rect = { x: panelX, y: footerY, w: panelW, h: state.rowHeight };
        drawPickerRow(ctx, state, state.footerRow, rect, labelPaint, scale);
        state.rowHitboxes.push({ row: state.footerRow, rect: {
            left: state.panelScreenRect.left,
            top: state.panelScreenRect.top + ((footerY - panelY) * scale),
            width: state.panelScreenRect.width,
            height: state.rowHeight * scale,
        }});
    }

    ctx.restore();
    markNodeDirty(node, 4);
}

export function drawActiveFilePickerGlobal(ctx, app) {
    const state = activeFilePicker;
    if (!state?.node || !state?.config) return;
    const dsScale = app?.canvas?.ds?.scale || 1;
    ctx.save();
    ctx.translate(state.node.pos?.[0] || 0, state.node.pos?.[1] || 0);
    drawActiveFilePicker(ctx, state.node, app, state.config, dsScale);
    ctx.restore();
}

window._xcpCloseActiveFileBrowser = () => {
    closeFilePicker();
};

export function createFileBrowser() {
    return null;
}

export function syncFileBrowser(context, node, app, config, overlayPass = false) {
    if (!config?.geometry) return;
    const isCanvas = !!(context && (context.canvas || context instanceof CanvasRenderingContext2D));
    if (!isCanvas) return;

    ensureFilePickerListeners();
    const safeConfig = config;
    syncActiveFilePickerConfig(node, safeConfig);
    const liveReg = node.layout?.regions?.[safeConfig.key];

    const togglePicker = (event) => {
        if (event?.stopPropagation) event.stopPropagation();
        if (activeFilePicker && activeFilePicker.node === node && activeFilePicker.key === safeConfig.key) {
            closeFilePicker();
        } else {
            openFilePicker(safeConfig, node);
        }
        markNodeDirty(node, 16);
        return true;
    };

    if (liveReg && !liveReg._fileBrowserOnPressWrapped) {
        const originalOnPress = liveReg.onPress;
        liveReg.onPress = (event, interactionData) => {
            if (typeof originalOnPress === "function") originalOnPress(event, interactionData);
            return togglePicker(event, interactionData);
        };
        liveReg._fileBrowserOnPressWrapped = true;
    }

    const { x, y, w, h } = safeConfig.geometry;
    const useAnim = true;
    const isPressed = node._pressedRegionKey === safeConfig.key;
    const isHovered = safeConfig.mouseOver !== false && node._hoveredRegionKey === safeConfig.key;
    const isAwake = !!(activeFilePicker && activeFilePicker.node === node && activeFilePicker.key === safeConfig.key);
    const itemsHash = JSON.stringify(safeConfig.items || []);
    const stateHash = `${isPressed}_${isHovered}_${node.mode}_${window._xcpDerpSession}_${safeConfig.value}_${itemsHash}_${isAwake}`;

    const cache = node._fileBrowserCache || (node._fileBrowserCache = {});
    const itemCache = cache[safeConfig.key] || (cache[safeConfig.key] = {});
    const isAnim = itemCache.res && itemCache.res.isAnimating;
    const needsFullSync = node._forceSync || safeConfig.bypassHashOptimization === true || itemCache.hash !== stateHash || isAnim;

    let props;
    let stateStr;
    let bodyPaint;
    let labelPaint;
    let fs;
    let rawIc;
    let animatedFillColor;
    let animatedTextColor;
    let isAnimating;

    if (!needsFullSync && itemCache.res) {
        ({ props, stateStr, bodyPaint, labelPaint, fs, rawIc, animatedFillColor, animatedTextColor, isAnimating } = itemCache.res);
    } else {
        const themeParts = String(safeConfig.themeKey || "").split(",").map((part) => part.trim()).filter(Boolean);
        const bodyKey = themeParts[0] || "panel";
        const labelKey = themeParts.length >= 3 ? (themeParts[2] || "t_textsystem") : (themeParts[1] || themeParts[0] || "t_textsystem");
        ({ props, stateStr, bodyPaint, labelPaint } = resolveWidgetEnv(node, { ...safeConfig, themeKey: `${bodyKey}, ${labelKey}` }));
        fs = props.fontSize || labelPaint?.fontSize || 10;
        rawIc = safeConfig.textColor || labelPaint?.textColor || labelPaint?.fill || "red";
        ({ fillColor: animatedFillColor, iconColor: animatedTextColor, isAnimating } = animateWidgetColors(
            node,
            `_file_anim_${safeConfig.key}`,
            safeConfig.btnColor || bodyPaint?.fill || "transparent",
            rawIc,
            safeConfig.alpha !== undefined ? safeConfig.alpha : 1,
            useAnim
        ));

        itemCache.hash = stateHash;
        itemCache.res = { props, stateStr, bodyPaint, labelPaint, fs, rawIc, animatedFillColor, animatedTextColor, isAnimating };
    }

    if (isAnimating) node._derpAwakeFrames = 5;

    const ctx = context;
    const dsScale = app?.canvas?.ds?.scale || 1;
    if (!safeConfig.skipBackground) {
        masterPainter(ctx, {
            width: w,
            height: h,
            posX: snapToScreenGrid(x, dsScale),
            posY: snapToScreenGrid(y, dsScale),
            paintData: bodyPaint,
            color: animatedFillColor
        });
    }

    const dropdownDisplay = getFileBrowserCurrentDisplay(safeConfig, safeConfig.items || []);
    const rootDisplayName = t(safeConfig.rootName || (safeConfig.mode === "folder" ? "/" : ""));
    const isSelection = safeConfig.value && safeConfig.value !== "/" && (safeConfig.mode === "folder" || (safeConfig.items || []).some((item) => getFileBrowserItemValue(item) === safeConfig.value));
    let currentVal = rootDisplayName;
    if (isSelection) {
        const cleanPath = safeConfig.value.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentVal = `${rootDisplayName}${sep}${cleanPath}`;
    }

    const labelStr = dropdownDisplay || ((safeConfig.mode === "folder" || (safeConfig.mode === "file" && isSelection)) ? currentVal : (props.displayText || "Browse Files..."));
    const glyphs = getFileBrowserGlyphs(safeConfig?.icon);

    if (labelPaint) {
        const pX = props.padding[0];
        const iconOffset = fs * 1.2;
        const indicatorOffset = shouldShowFileBrowserIndicator(safeConfig) ? iconOffset : 0;
        const textLimit = Math.max(0, w - (pX * 2) - indicatorOffset);
        const drawLabel = clampText(labelStr, textLimit, fs, labelPaint?.font || "Arial", labelPaint?.fontWeight || "normal", safeConfig.displayMode === "ellipsis");

        ctx.save();
        ctx.beginPath();
        ctx.rect(x + pX, y, w - (pX * 2), h);
        ctx.clip();

        if (shouldShowFileBrowserIndicator(safeConfig)) {
            masterPainterText(ctx, {
                text: glyphs[0],
                x: snapToScreenGrid(x + pX, dsScale),
                y: snapToScreenGrid(y + (h / 2), dsScale),
                align: "left",
                baseline: "middle",
                paintData: { ...labelPaint, fontSize: fs * 0.8, fill: animatedTextColor }
            });
        }

        masterPainterText(ctx, {
            text: drawLabel,
            x: snapToScreenGrid(x + pX + indicatorOffset, dsScale),
            y: snapToScreenGrid(y + (h / 2), dsScale),
            align: "left",
            baseline: "middle",
            paintData: { ...labelPaint, fontSize: fs, fill: animatedTextColor }
        });

        ctx.restore();
    }

    if (!overlayPass) return;
}
