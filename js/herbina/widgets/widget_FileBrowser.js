/**
 * Specialist: ./herbina/widgets/widget_FileBrowser.js
 * ROLE: Canvas-only file browser widget for file and folder navigation.
 *
 * Accepted config parameters:
 * - `key`: Unique region/widget key used to bind picker state to the live layout region.
 * - `geometry`: Required `{ x, y, w, h }` canvas rect for the trigger and picker anchoring.
 * - `items`: Source list for files, folders, or dropdown entries.
 * - `value`: Current selected path/value shown in the trigger and used for selection state.
 * - `onChange`: Selection callback fired with the chosen file path, folder path, or dropdown value.
 * - `callbacks.onChange`: Alternate place for the same selection callback if the caller uses nested callbacks.
 * - `mode`: Browser behavior mode. Use `"browser"` for the full file browser flow, `"folder"` for the same navigation flow without search-tab spawn plus explicit folder confirmation, or `"file"` for legacy file-style behavior.
 * - `rootName`: Optional root label shown in the trigger and breadcrumb/current-path header.
 * - `icon`: Trigger/picker glyph style. Supports mapped names like `folder`, `dropdown`, `palette`, `file`, `settings`.
 * - `indicator`: Controls whether the trigger/current-row indicator glyph is shown. Set false-like values to hide it.
 * - `themeKey`: Main widget theme string. Used for trigger body, picker body, and picker text theme resolution.
 * - `searchThemeKey`: Optional theme string for the `bastaSearchTab` editor. Defaults to `"dialog, t_textSmall"`. Ignored in `folder` mode.
 * - `searchTab`: Set to `true` to enable the search tab (bastaSearchTab). Defaults to `false`.
 * - `padding`: Optional `[x, y]` inner padding used for trigger text and picker row sizing.
 * - `displayMode`: Text overflow mode passed to `clampText`; use `"ellipsis"` when truncation should show ellipsis.
 * - `mouseOver`: Set to `false` to disable hover-state styling on the trigger.
 * - `skipBackground`: Set to `true` to skip drawing the trigger background panel.
 * - `btnColor`: Optional trigger background override used by the animated trigger paint.
 * - `textColor`: Optional trigger text/icon color override.
 * - `alpha`: Optional trigger alpha override.
 * - `fileType`: Optional file-row prefix mode. Special handling exists for `"palette"` and `"lora"`.
 * - `previewList`: For `fileType: "lora"`, paths in this list render with the preview-image prefix glyph.
 * - `ratingsList`: For `fileType: "lora"`, per-path rating map used to draw rating glyphs.
 * - `ratingsPalette`: For `fileType: "lora"`, palette source used to tint rating glyphs.
 *
 *
 * Terminology — named parts of the FileBrowser widget:
 * - `Trigger`: The compact clickable bar rendered inline in the node. Shows the current selected value
 *   and an optional indicator glyph. Clicking it spawns the Picker.
 * - `Picker`: The dropdown overlay panel that opens above or below the Trigger. Contains header rows,
 *   a scrollable pane of file/folder rows, an optional footer, and a scrollbar. Auto-flips direction
 *   based on available screen space.
 * - `Row`: A single list item inside the Picker. Types include: `"file"`, `"folder"`, `"select_folder"`,
 *   `"select_current"`, `"back"`, `"search_tab"`. Each row has a rect hitbox for pointer interaction.
 * - `Breadcrumb`: The clickable path-navigation header row at the top of the Picker. For browser mode,
 *   it shows segmented path parts that jump to parent directories. For folder mode, it shows a
 *   confirmation button ("select current folder").
 * - `HeaderRows`: The rows pinned at the top of the Picker, typically the Breadcrumb and a
 *   "select_current" row. Always visible, not scrolled.
 * - `FooterRow`: An optional row pinned at the bottom of the Picker. Used for "back" navigation
 *   or search-tab spawn triggers in browser mode.
 * - `Scrollbar`: A custom vertical scrollbar with a draggable thumb, rendered on the right edge
 *   of the Picker's scrollable pane. Sized by PICKER_SCROLLBAR_WIDTH, PICKER_SCROLLBAR_INSET,
 *   and PICKER_SCROLLBAR_MIN_THUMB.
 * - `Indicator`: The toggle-able open/closed icon glyph on the right side of the Trigger (e.g.,
 *   ▼ for closed, ▲ for open). Controlled by the `indicator` config parameter.
 * - `Icon` / `Glyph`: The Trigger/Picker icon style set by the `icon` config. Maps to named
 *   glyph sets: `"folder"`, `"dropdown"`, `"palette"`, `"file"`, `"settings"`. Each set has
 *   an open and closed variant.
 * - `Prefix`: The per-row icon character drawn before the row text (e.g., 📁 for folders,
 *   🖺 for files, ❖ for palettes, 🖻 for LoRA preview images). Controlled by `fileType`.
 * - `Ratings` / `RatingGlyph`: For `fileType: "lora"`, per-row rating bars drawn from
 *   `ratingsList` and tinted by `ratingsPalette`.
 * - `SearchTab`: An optional search input spawned via `bastaSearchTab` in browser mode.
 *   Controlled by `searchTab` config. Uses `searchThemeKey` for theming.
 * - `Pane`: The scrollable area containing the file/folder rows, positioned between the
 *   HeaderRows and FooterRow (or the panel bottom).
 * - `Mode`: The browser behavior mode — `"browser"` (full navigation + search tab),
 *   `"folder"` (navigation without search tab + explicit confirmation), or `"file"`
 *   (legacy single-file picker).
 *
 * Maintenance rule:
 * - Keep this parameter list in sync whenever this widget gains, removes, or changes accepted config parameters.
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import {
    resolveWidgetEnv,
    resolvePaintData,
    measureTextHeight,
    measureTextWidth,
    clampText,
    snapToScreenGrid,
    parseColorKeyText
} from "../utils/widgetsUtils.js";
import { lerpTo, animateAlpha, animateWidgetColors } from "../masterAnimator.js";
import { getDerpVars } from "../../fatha/fatha.js";
import { t } from "../../fatha/core/masterLayoutEngine.js";
import { ensureScreenRectVisible } from "../../fatha/core/fathaWarp.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaSearchTab, closeBastaSearchTab, getBastaSearchTabId } from "../../fatha/bastas/bastaSearchTab.js";

const FILEBROWSER_ICON_MAP = {
    folder: ["🗀", "🗁"],
    dropdown: ["▶", "▼"],
    palette: ["❖", "❖"],
    file: ["🖺", "🖺"],
    settings: ["⛯", "⛯"],
    fallback: ["📁", "📂"],
};

const BROWSER_ICONS = {
    DIR: "🗀 ",
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
const OUTSIDE_DRAG_CLOSE_THRESHOLD_PX = 4;
const PICKER_PREFIX_GAP_PX = 0;
const PICKER_BREADCRUMB_PADDING = [4, 1];
const PICKER_BREADCRUMB_TEXT_KEY = "t_textSystem";

const DROPDOWN_ANIM_SETTINGS = {
    lerpFactor: 0.325,
    alphaFactor: 0.2,
};

let activeFilePicker = null;
let filePickerListenersInstalled = false;

function getFileBrowserItemsFingerprint(items) {
    if (!Array.isArray(items) || items.length === 0) return "0:";
    const parts = new Array(items.length);
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (typeof item === "string") {
            parts[i] = item;
            continue;
        }
        const value = getFileBrowserItemValue(item);
        const display = typeof item === "object"
            ? String(item.display ?? item.text ?? item.name ?? item.title ?? item.label ?? "")
            : "";
        parts[i] = `${value}|${display}`;
    }
    return `${items.length}:${parts.join("\u0001")}`;
}

function getFileBrowserMode(config) {
    const mode = String(config?.mode || "browser").trim().toLowerCase();
    if (mode === "folder") return "folder";
    if (mode === "file") return "file";
    return "browser";
}

function syncActiveFilePickerConfig(node, config) {
    if (!activeFilePicker) return;
    if (activeFilePicker.node !== node || activeFilePicker.key !== config?.key) return;
    activeFilePicker.config = config;
    activeFilePicker.callbacks = getFileBrowserCallbacks(config);
    const theme = resolvePickerTheme(config, node);
    activeFilePicker.listPaint = theme.listPaint;
    activeFilePicker.rowPaintOFF = theme.rowPaintOFF;
    activeFilePicker.rowPaintON = theme.rowPaintON;
    activeFilePicker.rowTextON = theme.rowTextON;
    activeFilePicker.rowHeight = measureTextHeight("Hgyj", 0, theme.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
    activeFilePicker.glyphs = getFileBrowserGlyphs(config?.icon);
    activeFilePicker.itemsHash = getFileBrowserItemsFingerprint(config.items || []);
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

function getEventClientPoint(event, interactionData = null) {
    const clientX = Number(event?.clientX ?? interactionData?.clientX);
    const clientY = Number(event?.clientY ?? interactionData?.clientY);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    return { clientX, clientY };
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
        onFolderConfirm: config?.onFolderConfirm || config?.callbacks?.onFolderConfirm || null,
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

function normalizePickerSearchValue(value) {
    return String(value || "").trim().toLowerCase();
}

function pickerRowMatchesSearch(row, searchNeedle) {
    if (!searchNeedle) return false;
    if (!row || (row.type !== "file" && row.type !== "dir" && row.type !== "select_folder")) return false;
    return String(row.name || row.path || "").toLowerCase().includes(searchNeedle);
}

function getPickerSearchMatch(state) {
    const needle = normalizePickerSearchValue(state?.searchQuery);
    if (!state || !needle || !state.scrollRows.length) return null;

    const searchableRows = state.scrollRows.filter((row) => pickerRowMatchesSearch(row, needle));
    if (!searchableRows.length) return null;

    const startsWithMatch = searchableRows.find((row) => String(row.name || row.path || "").toLowerCase().startsWith(needle));
    return startsWithMatch || searchableRows[0] || null;
}

function getSearchMatchScrollTarget(state) {
    const matchRow = getPickerSearchMatch(state);
    if (!state || !matchRow || !state.scrollRows.length) return null;
    const matchIndex = state.scrollRows.findIndex((row) => row.id === matchRow.id);
    if (matchIndex < 0) return null;
    const viewportRows = Math.max(0, state.renderedScrollRows ?? state.visibleScrollRows ?? 0);
    const viewportHeight = viewportRows * state.rowHeight;
    if (viewportHeight <= 0) return 0;
    const itemCenter = (matchIndex * state.rowHeight) + (state.rowHeight / 2);
    const target = itemCenter - (viewportHeight / 2);
    const maxScroll = Math.max(0, (state.scrollRows.length * state.rowHeight) - viewportHeight);
    return Math.max(0, Math.min(target, maxScroll));
}

function syncPickerSearchScroll(state, forceInstant = false) {
    if (!state) return;
    state.searchMatchRowId = getPickerSearchMatch(state)?.id || null;
    const target = getSearchMatchScrollTarget(state);
    state.searchScrollTarget = target;
    if (target == null) return false;
    const useAnim = !forceInstant && window.DERP_GLOBAL_SETTINGS?.useAnimation !== false;
    if (!useAnim) {
        state.scrollOffset = target;
        clampPickerScroll(state);
        return false;
    }
    const nextOffset = lerpTo(state.scrollOffset || 0, target, 0.28, true);
    state.scrollOffset = nextOffset.value;
    clampPickerScroll(state);
    if (nextOffset.isAnimating) markNodeDirty(state.node, 8);
    return nextOffset.isAnimating;
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
    closeBastaSearchTab(activeFilePicker.node, activeFilePicker.key, "implicit");
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

function computePickerPrefixSlotWidth(state, ctx, labelPaint) {
    if (!state || !ctx) return 0;
    const fontSize = state.rowPaintOFF?.fontSize || labelPaint?.fontSize || 10;
    const fallback = fontSize * 1.2;
    const rows = [
        ...(state.headerRows || []),
        ...(state.scrollRows || []),
        ...(state.footerRow ? [state.footerRow] : []),
    ];
    let maxWidth = fallback;
    for (const row of rows) {
        if (!row?.prefix) continue;
        const prefixText = String(row.prefix).replace(/\s+$/, "");
        const measured = ctx.measureText?.(prefixText).width || fallback;
        if (measured > maxWidth) maxWidth = measured;
    }
    return maxWidth;
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
    const selectedIndex = state.scrollRows.findIndex((row) => row.type === "file" && String(row.path ?? "").replace(/\\/g, "/") === String(state.config.value ?? "").replace(/\\/g, "/"));
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
    const mode = getFileBrowserMode(config);
    const dropdownMode = isDropdownFileBrowser(config);
    if (dropdownMode) {
        const headerRows = [];
        const scrollRows = [];
        const displayVal = getFileBrowserCurrentDisplay(config, items);
        const selectedItem = items.find((item) => String(getFileBrowserItemValue(item)) === String(config?.value || ""));
        const triggerDisplay = (selectedItem && typeof selectedItem === "object" && selectedItem._triggerDisplay) ? selectedItem._triggerDisplay : null;
        headerRows.push({ id: "current", name: triggerDisplay || displayVal, type: "select_current", path: displayVal });
        items.forEach((item, idx) => {
            const itemValue = getFileBrowserItemValue(item);
            const row = {
                id: `file:${idx}:${itemValue}`,
                name: (item && typeof item === "object" && item._triggerDisplay) ? item._triggerDisplay : getDropdownItemDisplay(item),
                path: itemValue,
                type: "file",
                item,
            };
            scrollRows.push(row);
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
    const rootDisplayName = t(config.rootName || (mode === "folder" ? "/" : ""));
    let currentPathDisplay = rootDisplayName;
    if (dir && dir !== "/") {
        const cleanDir = dir.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentPathDisplay = `${rootDisplayName}${sep}${cleanDir}`;
    }
    headerRows.push({ id: "current", name: currentPathDisplay, type: "select_current", path: dir || "/", hidePrefix: true });
    Array.from(entries).sort().forEach((folder) => {
        scrollRows.push({ id: `dir:${folder}`, name: folder, type: "dir" });
    });
    if (mode !== "folder") {
        files.sort((a, b) => a.name.localeCompare(b.name)).forEach((file) => {
            scrollRows.push({ id: `file:${file.path}`, name: file.name, path: file.path, type: "file", item: file.item });
        });
    }

    state.headerRows = headerRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
    state.scrollRows = scrollRows.map((entry) => ({ ...entry, ...getFileRowPrefix(config, node, entry) }));
    state.footerRow = mode === "folder"
        ? { id: "select-folder", name: "Select Folder", type: "select_folder", prefix: null, prefixColor: null }
        : null;
    state.visibleScrollRows = Math.max(0, state.visibleLimit - state.headerRows.length - (state.footerRow ? 1 : 0));
    state.renderedScrollRows = Math.min(state.scrollRows.length, state.visibleScrollRows);
    clampPickerScroll(state);
}

function loadPreviewImageForRow(state, row) {
    if (!state || !row) return;
    let imgUrl = row?.item?.imageUrl;
    if ((!imgUrl || typeof imgUrl !== "string") && row?.type === "file" && state?.config?.fileType === "lora" && state?.config?.previewList && row?.path) {
        const normPath = String(row.path).replace(/\\/g, "/");
        const inPreview = state.config.previewList.some(p => String(p).replace(/\\/g, "/") === normPath);
        if (inPreview) {
            imgUrl = `/xcp/get_lora_preview?name=${encodeURIComponent(row.path)}&v=${window._xcpDerpSession || Date.now()}`;
        }
    }
    if (!imgUrl || typeof imgUrl !== "string") {
        if (state._activePreviewRowId !== null) {
            state._activePreviewRowId = null;
            state._activePreviewUrl = null;
            state._activePreviewAspect = null;
            state._previewToken = (state._previewToken || 0) + 1;
            markNodeDirty(state.node, 8);
        }
        return;
    }

    const cache = state._previewImageCache;
    const cached = cache[imgUrl];
    if (cached && cached.loaded) {
        state._activePreviewRowId = row.id;
        state._activePreviewUrl = imgUrl;
        state._activePreviewAspect = cached.aspectRatio;
        markNodeDirty(state.node, 8);
        return;
    }

    if (cached && cached.loading) return;

    cache[imgUrl] = { loading: true, loaded: false, image: null, aspectRatio: null };
    state._activePreviewRowId = row.id;
    state._activePreviewUrl = imgUrl;
    state._activePreviewAspect = null;
    state._previewToken = (state._previewToken || 0) + 1;
    const token = state._previewToken;
    markNodeDirty(state.node, 8);

    const img = new Image();
    img.onload = () => {
        if (state._previewToken !== token) return;
        const ratio = img.naturalWidth / Math.max(1, img.naturalHeight);
        cache[imgUrl] = { loading: false, loaded: true, image: img, aspectRatio: ratio };
        if (state._activePreviewRowId === row.id) {
            state._activePreviewAspect = ratio;
            markNodeDirty(state.node, 8);
        }
    };
    img.onerror = () => {
        if (state._previewToken !== token) return;
        cache[imgUrl] = { loading: false, loaded: false, image: null, aspectRatio: null };
        if (state._activePreviewRowId === row.id) {
            state._activePreviewRowId = null;
            state._activePreviewUrl = null;
            state._activePreviewAspect = null;
            markNodeDirty(state.node, 8);
        }
    };
    img.src = imgUrl;
}

function openFilePicker(config, node) {
    if (activeFilePicker && (activeFilePicker.node !== node || activeFilePicker.key !== config.key)) {
        closeFilePicker();
    }

    const { oY, mW } = getDerpVars(node);
    const theme = resolvePickerTheme(config, node);
    const mode = getFileBrowserMode(config);
    const rowHeight = measureTextHeight("Hgyj", 0, theme.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
    const glyphs = getFileBrowserGlyphs(config?.icon);

    let currentDir = "";
    if (config.value && typeof config.value === "string") {
        const normalized = config.value.replace(/[\\]/g, "/");
        if (mode === "folder") {
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
        breadcrumbHitboxes: [],
        itemsHash: getFileBrowserItemsFingerprint(config.items || []),
        bottomMarginUnits: mW || 0,
        offsetY: oY || 0,
        prefixGap: PICKER_PREFIX_GAP_PX,
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
        suppressNextOutsidePointerUp: true,
        pendingOutsidePointerId: null,
        pendingOutsidePointerStartX: 0,
        pendingOutsidePointerStartY: 0,
        pendingOutsidePointerDragged: false,
        searchQuery: "",
        searchMatchRowId: null,
        searchScrollTarget: null,
        searchBastaId: getBastaSearchTabId(node, config.key),
        _previewImageCache: {},
        _previewToken: 0,
        _activePreviewRowId: null,
        _activePreviewUrl: null,
        _activePreviewAspect: null,
    };

    rebuildFilePickerRows(activeFilePicker);
    ensurePickerSelectionVisible(activeFilePicker);
    if (mode !== "folder") {
        syncPickerSearchScroll(activeFilePicker, true);
    }
    window.__xcpHasActiveFileBrowser = true;
    if (mode !== "folder" && config.searchTab === true) {
        showBastaSearchTab(node, config.key, {
            value: activeFilePicker.searchQuery,
            width: config.geometry?.w || 180,
            height: config.geometry?.h || 20,
            themeKey: config.searchThemeKey || "dialog, t_textSmall",
            backgroundThemeKey: "dialog",
            onInput: (value) => {
                if (!activeFilePicker || activeFilePicker.node !== node || activeFilePicker.key !== config.key) return;
                activeFilePicker.searchQuery = String(value || "");
                rebuildFilePickerRows(activeFilePicker);
                syncPickerSearchScroll(activeFilePicker, false);
                activeFilePicker.viewportFollowFrames = 4;
                activeFilePicker.lastViewportWarpHash = "";
                markNodeDirty(node, 12);
            },
            onEnter: () => {
                if (!activeFilePicker || activeFilePicker.node !== node || activeFilePicker.key !== config.key) return;
                const row = getPickerSearchMatch(activeFilePicker);
                if (!row) return;

                if (row.type === "file" || row.type === "select_folder") {
                    handlePickerRowAction(row);
                }
            },
        });
    }
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

    if (row.type === "dir") {
        state.currentDir = state.currentDir ? `${state.currentDir}/${row.name}` : row.name;
        state.scrollOffset = 0;
        rebuildFilePickerRows(state);
        if (getFileBrowserMode(state.config) === "folder" && state.callbacks.onChange) state.callbacks.onChange(state.currentDir || "/");
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
        if (state.callbacks.onFolderConfirm) {
            state.callbacks.onFolderConfirm(finalPath);
            closeFilePicker();
            return;
        }
        forceFileBrowserResync(state.node, state.config);
        if (state.callbacks.onChange) state.callbacks.onChange(finalPath);
        closeFilePicker();
    }
}

function handleBreadcrumbRowAction(path) {
    const state = activeFilePicker;
    if (!state) return;
    state.currentDir = path || "";
    state.scrollOffset = 0;
    rebuildFilePickerRows(state);
    if (getFileBrowserMode(state.config) === "folder" && state.callbacks.onChange) state.callbacks.onChange(state.currentDir || "/");
    state.viewportFollowFrames = 8;
    state.lastViewportWarpHash = "";
    markNodeDirty(state.node, 16);
}

function findPickerHit(clientX, clientY) {
    const state = activeFilePicker;
    if (!state) return null;
    for (const crumb of state.breadcrumbHitboxes || []) {
        if (isPointInRect(clientX, clientY, crumb.rect)) return { type: "breadcrumb", path: crumb.path, id: crumb.id };
    }
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

function isEventInsideSearchTab(event, state = activeFilePicker) {
    if (!state?.searchBastaId) return false;
    const basta = activeBastas.get(state.searchBastaId);
    if (!basta) return false;
    if (basta.interactionShield?.contains?.(event.target)) return true;
    if (Object.values(basta._derpDomElements || {}).some((el) => el?.contains?.(event.target))) return true;

    const ds = window.app?.canvas?.ds;
    const canvasRect = window.app?.canvas?.canvas?.getBoundingClientRect?.();
    if (!ds || !canvasRect) return false;
    const scale = Number(ds.scale) || 1;
    const screenRect = {
        left: canvasRect.left + (((basta.pos?.[0] || 0) + (Number(ds.offset?.[0]) || 0)) * scale),
        top: canvasRect.top + (((basta.pos?.[1] || 0) + (Number(ds.offset?.[1]) || 0)) * scale),
        width: Math.max(1, (basta.size?.[0] || 0) * scale),
        height: Math.max(1, (basta.size?.[1] || 0) * scale),
    };
    return isPointInRect(event.clientX, event.clientY, screenRect);
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
        const insideSearchTab = isEventInsideSearchTab(event, state);
        const row = findPickerHit(clientX, clientY);

        if (onScrollbarThumb) {
            consumeEvent(event);
            state.draggingScrollbar = true;
            state.dragScrollbarPointerId = event.pointerId;
            state.dragScrollbarStartY = clientY;
            state.dragScrollbarStartOffset = state.scrollOffset || 0;
            return;
        }
        if (onScrollbarTrack) {
            consumeEvent(event);
            scrollPickerToTrackPosition(clientY);
            return;
        }
        if (insideSearchTab) {
            state.pendingOutsidePointerId = null;
            return;
        }
        if (insidePanel) {
            state.pendingOutsidePointerId = null;
            state.suppressNextOutsidePointerUp = true;
            consumeEvent(event);
            if (row?.type === "breadcrumb") handleBreadcrumbRowAction(row.path);
            else handlePickerRowAction(row);
            return;
        }
        if (insideAnchor) {
            state.pendingOutsidePointerId = null;
            return;
        }
        if (!insidePanel) {
            state.pendingOutsidePointerId = event.pointerId;
            state.pendingOutsidePointerStartX = clientX;
            state.pendingOutsidePointerStartY = clientY;
            state.pendingOutsidePointerDragged = false;
            return;
        }
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
        if (activeFilePicker.pendingOutsidePointerId === event.pointerId) {
            const dx = event.clientX - activeFilePicker.pendingOutsidePointerStartX;
            const dy = event.clientY - activeFilePicker.pendingOutsidePointerStartY;
            if (Math.hypot(dx, dy) >= OUTSIDE_DRAG_CLOSE_THRESHOLD_PX) {
                activeFilePicker.pendingOutsidePointerDragged = true;
            }
        }
        const row = findPickerHit(event.clientX, event.clientY);
        const nextHoverId = row?.id || null;
        if (activeFilePicker.hoverRowId !== nextHoverId) {
            activeFilePicker.hoverRowId = nextHoverId;
            loadPreviewImageForRow(activeFilePicker, row);
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

        const state = activeFilePicker;
        if (state.draggingScrollbar) {
            if (state.dragScrollbarPointerId !== event.pointerId) return;
            consumeEvent(event);
            state.draggingScrollbar = false;
            state.dragScrollbarPointerId = null;
            return;
        }

        if (state.pendingOutsidePointerId === event.pointerId) {
            const wasDragged = state.pendingOutsidePointerDragged;
            state.pendingOutsidePointerId = null;
            state.pendingOutsidePointerDragged = false;
            if (wasDragged) return;
        }

        const insideAnchor = isPointInRect(event.clientX, event.clientY, state.screenAnchorRect);
        const insidePanel = isPointInRect(event.clientX, event.clientY, state.panelScreenRect);
        const insideSearchTab = isEventInsideSearchTab(event, state);
        if (state.suppressNextOutsidePointerUp) {
            state.suppressNextOutsidePointerUp = false;
            return;
        }
        if (!insideAnchor && !insidePanel && !insideSearchTab) {
            closeFilePicker();
        }
    }, true);
}

function drawPickerRow(ctx, state, row, rect, labelPaint, scale) {
    const hovered = state.hoverRowId === row.id;
    const selected = row.type === "file" && String(row.path ?? "").replace(/\\/g, "/") === String(state.config.value ?? "").replace(/\\/g, "/");
    const searchMatched = !!(state.searchMatchRowId && row.id === state.searchMatchRowId);
    const emphasized = hovered || selected || searchMatched;
    const rowPaint = emphasized ? state.rowPaintON : state.listPaint;
    const textColor = emphasized
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
    const prefixText = (!row.hidePrefix && row.prefix) ? String(row.prefix).replace(/\s+$/, "") : "";
    const normalizedPrefixW = state.prefixSlotWidth || (fontSize * 1.2);
    const iconGap = state.prefixGap || 0;
    const iconOffset = prefixText ? (normalizedPrefixW + iconGap) : 0;
    const maxTextWidth = Math.max(0, rect.w - (pX * 2) - iconOffset);
    const rawLabel = row.type === "file" ? row.name.replace(/\.(safetensors|json)$/i, "") : row.name;
    const { segments: pickerSegments, hasColorKeys: pickerHasKeys } = parseColorKeyText(
        rawLabel, state.node, "_OFF", textColor
    );
    const drawLabel = (pickerHasKeys && pickerSegments)
        ? rawLabel
        : clampText(rawLabel, maxTextWidth, fontSize, labelPaint?.font || "Arial", labelPaint?.fontWeight || "normal", state.config.displayMode === "ellipsis");

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    if (prefixText) {
        masterPainterText(ctx, {
            text: prefixText,
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
        x: row.type === "select_folder"
            ? snapToScreenGrid(rect.x + (rect.w / 2), scale)
            : snapToScreenGrid(rect.x + pX + iconOffset, scale),
        y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
        align: row.type === "select_folder" ? "center" : "left",
        baseline: "middle",
        paintData: {
            ...labelPaint,
            fontSize,
            fill: textColor,
        },
        segments: (pickerHasKeys && pickerSegments) ? pickerSegments : null
    });

    ctx.restore();
}

function drawBreadcrumbHeaderRow(ctx, state, row, rect, labelPaint, scale) {
    const cfg = state.config || {};
    if (isDropdownFileBrowser(cfg)) {
        drawPickerRow(ctx, state, row, rect, labelPaint, scale);
        return;
    }

    const rootLabel = String(t(cfg.rootName || "/") || "/");
    const dir = String(state.currentDir || "").replace(/^\/+|\/+$/g, "");
    const segs = dir ? dir.split("/") : [];
    const crumbs = [{ label: rootLabel, path: "" }];
    let accum = "";
    for (const seg of segs) {
        accum = accum ? `${accum}/${seg}` : seg;
        crumbs.push({ label: seg, path: accum });
    }

    masterPainter(ctx, {
        width: rect.w,
        height: rect.h,
        posX: rect.x,
        posY: rect.y,
        paintData: { ...state.listPaint, corners: inheritPickerCorners(state.listPaint, state.listPaint) },
        color: state.listPaint?.fill || "transparent"
    });

    const pX = state.config.padding?.[0] || 4;
    const [crumbPadX, crumbPadY] = PICKER_BREADCRUMB_PADDING;
    const fontSize = state.rowPaintOFF?.fontSize || labelPaint?.fontSize || 10;
    const font = labelPaint?.font || "Arial";
    const fontWeight = labelPaint?.fontWeight || "normal";
    const btnPaintOFF = resolvePaintData(state.node, "button", "_OFF") || state.listPaint;
    const btnPaintON = resolvePaintData(state.node, "button", "_ON") || state.rowPaintON || btnPaintOFF;
    const btnTextOFF = resolvePaintData(state.node, PICKER_BREADCRUMB_TEXT_KEY, "_OFF") || labelPaint;
    const btnTextON = resolvePaintData(state.node, PICKER_BREADCRUMB_TEXT_KEY, "_ON") || state.rowTextON || btnTextOFF;
    const sep = "\\";
    const sepW = measureTextWidth(sep, fontSize, font, fontWeight) || (fontSize * 0.6);
    const gap = Math.max(1, state.prefixGap || 0);
    const maxX = rect.x + rect.w - pX;
    let cursorX = rect.x + pX;
    const lastCrumb = crumbs[crumbs.length - 1] || null;
    const minLastTextW = Math.max(fontSize * 4, 32);
    const minLastBtnW = minLastTextW + (crumbPadX * 2);

    const drawCrumbButton = (crumb, idx, x, width, allowClamp = false) => {
        if (!crumb || width <= 0) return 0;
        const hovered = state.hoverRowId === `crumb:${idx}:${crumb.path}`;
        const btnPaint = hovered ? btnPaintON : btnPaintOFF;
        const btnTextPaint = hovered ? btnTextON : btnTextOFF;
        const txtColor = btnTextPaint?.textColor || btnTextPaint?.fill || "#ffffff";
        const textLimit = Math.max(0, width - (crumbPadX * 2));
        const drawText = allowClamp
            ? clampText(String(crumb.label || ""), textLimit, fontSize, font, fontWeight, true)
            : String(crumb.label || "");
        if (!drawText) return 0;

        masterPainter(ctx, {
            width,
            height: rect.h,
            posX: x,
            posY: rect.y,
            paintData: { ...btnPaint, corners: inheritPickerCorners(btnPaint, state.listPaint) },
            color: btnPaint?.fill || "transparent"
        });
        masterPainterText(ctx, {
            text: drawText,
            x: snapToScreenGrid(x + (width / 2), scale),
            y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
            align: "center",
            baseline: "middle",
            paintData: { ...btnTextPaint, fontSize, fill: txtColor }
        });

        state.breadcrumbHitboxes.push({
            id: `crumb:${idx}:${crumb.path}`,
            path: crumb.path,
            rect: {
                left: state.panelScreenRect.left + ((x - rect.x) * scale),
                top: state.panelScreenRect.top + ((rect.y - state.panelY) * scale),
                width: width * scale,
                height: rect.h * scale,
            },
        });
        return width;
    };

    for (let i = 0; i < crumbs.length; i += 1) {
        const crumb = crumbs[i];
        const isLastCrumb = i === crumbs.length - 1;
        const text = String(crumb.label || "");
        const textW = Math.max(8, measureTextWidth(text, fontSize, font, fontWeight) || 8);
        const btnW = textW + (crumbPadX * 2);
        if (isLastCrumb) {
            const remainingW = Math.max(0, maxX - cursorX);
            drawCrumbButton(crumb, i, cursorX, Math.min(btnW, remainingW), btnW > remainingW);
            break;
        }

        const reserveForLast = lastCrumb ? (sepW + gap + minLastBtnW) : 0;
        if (cursorX + btnW + reserveForLast > maxX) {
            if (lastCrumb) {
                const remainingW = Math.max(0, maxX - cursorX);
                drawCrumbButton(lastCrumb, crumbs.length - 1, cursorX, remainingW, true);
            }
            break;
        }

        drawCrumbButton(crumb, i, cursorX, btnW, false);
        cursorX += btnW;
        if (i < crumbs.length - 1) {
            if (cursorX + sepW + minLastBtnW > maxX) {
                const remainingW = Math.max(0, maxX - cursorX);
                if (remainingW > 0 && lastCrumb) {
                    drawCrumbButton(lastCrumb, crumbs.length - 1, cursorX, remainingW, true);
                }
                break;
            }
            masterPainterText(ctx, {
                text: sep,
                x: snapToScreenGrid(cursorX + (sepW / 2), scale),
                y: snapToScreenGrid(rect.y + (rect.h / 2), scale),
                align: "center",
                baseline: "middle",
                paintData: { ...btnTextOFF, fontSize, fill: btnTextOFF?.textColor || btnTextOFF?.fill || "#ffffff" }
            });
            cursorX += sepW + gap;
        }
    }
}

function drawActiveFilePicker(ctx, node, app, config, scale) {
    const state = activeFilePicker;
    if (!state || state.node !== node || state.key !== config.key) return;

    const nextItemsHash = getFileBrowserItemsFingerprint(config.items || []);
    if (state.itemsHash !== nextItemsHash || state.config.value !== config.value || state.rowHeight !== (measureTextHeight("Hgyj", 0, state.rowPaintOFF) + ((config.padding?.[1] || 2) * 2))) {
        state.config = config;
        state.callbacks = getFileBrowserCallbacks(config);
        const theme = resolvePickerTheme(config, node);
        state.listPaint = theme.listPaint;
        state.rowPaintOFF = theme.rowPaintOFF;
        state.rowPaintON = theme.rowPaintON;
        state.rowTextON = theme.rowTextON;
        state.rowHeight = measureTextHeight("Hgyj", 0, theme.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
        state.glyphs = getFileBrowserGlyphs(config?.icon);
        state.itemsHash = nextItemsHash;
        rebuildFilePickerRows(state);
        ensurePickerSelectionVisible(state);
    }

    if (getFileBrowserMode(state.config) !== "folder" && state.searchQuery) {
        syncPickerSearchScroll(state, false);
    } else {
        state.searchMatchRowId = null;
        state.searchScrollTarget = null;
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
    const panelY = openUpward ? (config.geometry.y + config.geometry.h - state.currentSize[1]) : config.geometry.y;
    const panelW = config.geometry.w;
    const panelH = state.currentSize[1];
    state.panelY = panelY;

    state.panelScreenRect = {
        left: anchorRect.left,
        top: openUpward ? (anchorRect.top + anchorRect.height - pickerHeightPx) : anchorRect.top,
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
    state.prefixSlotWidth = computePickerPrefixSlotWidth(state, ctx, labelPaint);
    let cursorY = panelY;
    state.rowHitboxes = [];
    state.breadcrumbHitboxes = [];
    state.scrollbarScreenRect = null;
    state.scrollbarThumbScreenRect = null;

    for (const row of state.headerRows) {
        const rect = { x: panelX, y: cursorY, w: panelW, h: state.rowHeight };
        if (row.type === "select_current") drawBreadcrumbHeaderRow(ctx, state, row, rect, labelPaint, scale);
        else drawPickerRow(ctx, state, row, rect, labelPaint, scale);
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

    const previewAspect = state._activePreviewAspect;
    const previewCache = state._previewImageCache || {};
    const previewUrl = state._activePreviewUrl;
    if (previewAspect && previewUrl && previewCache[previewUrl]?.loaded) {
        const s = state.offsetY || 4;
        const previewW = panelW;
        const previewH = Math.min(previewW / previewAspect, panelW);
        const previewX = panelX;

        const panelScreenTop = state.panelScreenRect?.top || 0;
        const previewScreenH = previewH * scale;
        const gapScreen = s * scale;
        const previewAboveScreenTop = panelScreenTop - previewScreenH - gapScreen;
        const roomAbove = previewAboveScreenTop - 4;
        const previewBelowScreenTop = panelScreenTop + (panelH * scale) + gapScreen;
        const roomBelow = window.innerHeight - previewBelowScreenTop - previewScreenH - 4;
        const placeBelow = roomAbove < 8 && roomBelow > roomAbove;
        const previewY = placeBelow ? (panelY + panelH + s) : (panelY - previewH - s);

        ctx.save();
        ctx.globalAlpha = state.itemAlpha;
        masterPainter(ctx, {
            width: previewW,
            height: previewH,
            posX: previewX,
            posY: previewY,
            paintData: { corners: [4, 4, 4, 4], border: 1, borderFill: "rgba(0,0,0,0.5)" },
            color: "rgba(0,0,0,0.8)"
        });
        const img = previewCache[previewUrl].image;
        if (img) {
            const imgW = img.naturalWidth;
            const imgH = img.naturalHeight;
            const fitScale = Math.min(previewW / imgW, previewH / imgH);
            const drawW = imgW * fitScale;
            const drawH = imgH * fitScale;
            const drawX = previewX + (previewW - drawW) / 2;
            const drawY = previewY + (previewH - drawH) / 2;
            ctx.drawImage(img, drawX, drawY, drawW, drawH);
        }
        ctx.restore();
    }

    ctx.restore();

    const heightAnimating = Math.abs((state.currentSize?.[1] || 0) - targetHeight) > 0.5;
    const alphaAnimating = Math.abs((state.itemAlpha || 0) - 1) > 0.01;
    const previewPending = !!previewUrl && !previewCache[previewUrl]?.loaded;
    const shouldStayAwake = heightAnimating || alphaAnimating || (state.viewportFollowFrames || 0) > 0 || previewPending;
    if (shouldStayAwake) {
        markNodeDirty(node, 4);
    }
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
            if (activeFilePicker && activeFilePicker.node === node && activeFilePicker.key === safeConfig.key) {
                const point = getEventClientPoint(event, interactionData);
                if (point && isPointInRect(point.clientX, point.clientY, activeFilePicker.panelScreenRect)) {
                    return true;
                }
            }
            return togglePicker(event, interactionData);
        };
        liveReg._fileBrowserOnPressWrapped = true;
    }

    const { x, y, w, h } = safeConfig.geometry;
    const useAnim = true;
    const isPressed = node._pressedRegionKey === safeConfig.key;
    const isHovered = safeConfig.mouseOver !== false && node._hoveredRegionKey === safeConfig.key;
    const isAwake = !!(activeFilePicker && activeFilePicker.node === node && activeFilePicker.key === safeConfig.key);

    if (isAwake) return;

    const itemsHash = getFileBrowserItemsFingerprint(safeConfig.items || []);
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
    const mode = getFileBrowserMode(safeConfig);
    const rootDisplayName = t(safeConfig.rootName || (mode === "folder" ? "/" : ""));
    const isSelection = typeof safeConfig.value === "string" && safeConfig.value !== "/" && (mode === "folder" || (safeConfig.items || []).some((item) => getFileBrowserItemValue(item) === safeConfig.value));
    let currentVal = rootDisplayName;
    if (isSelection) {
        const cleanPath = safeConfig.value.replace(/\.(safetensors|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentVal = `${rootDisplayName}${sep}${cleanPath}`;
    }

    // Check if the selected item carries a _triggerDisplay with {{}} color-key syntax
    const selectedValue = String(safeConfig?.value || "");
    const selectedItem = (safeConfig.items || []).find((item) => String(getFileBrowserItemValue(item)) === selectedValue);
    const triggerDisplay = (selectedItem && typeof selectedItem === "object" && selectedItem._triggerDisplay)
        ? selectedItem._triggerDisplay
        : null;
    const labelStr = triggerDisplay || dropdownDisplay || ((mode === "folder" || ((mode === "file" || mode === "browser") && isSelection)) ? currentVal : (props.displayText || "Browse Files..."));
    const glyphs = getFileBrowserGlyphs(safeConfig?.icon);

    // Parse labelStr for color keys (may differ from props.displayText when items carry {{}} syntax)
    const suffix = stateStr === "DIS" ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");
    const { segments: labelSegments, hasColorKeys: labelHasKeys } = parseColorKeyText(
        labelStr, node, suffix, labelPaint?.textColor || labelPaint?.fill
    );

    if (labelPaint) {
        const pX = props.padding[0];
        const iconOffset = fs * 1.2;
        const indicatorOffset = shouldShowFileBrowserIndicator(safeConfig) ? iconOffset : 0;
        const textLimit = Math.max(0, w - (pX * 2) - indicatorOffset);
        const drawLabel = (labelHasKeys && labelSegments)
            ? labelStr
            : clampText(labelStr, textLimit, fs, labelPaint?.font || "Arial", labelPaint?.fontWeight || "normal", safeConfig.displayMode === "ellipsis");

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
            paintData: { ...labelPaint, fontSize: fs, fill: animatedTextColor },
            segments: (labelHasKeys && labelSegments) ? labelSegments : null
        });

        ctx.restore();
    }

    if (!overlayPass) return;
}
