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
 * - `showRootName`: Set `true` to include `rootName` in trigger/breadcrumb display. Defaults to hidden.
 * - `rootBreadcrumbName`: Optional label for the root navigation crumb. Defaults to `Root`.
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
import { ensureScreenRectVisible } from "../../fatha/core/fathaWarp.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaSearchTab, closeBastaSearchTab, getBastaSearchTabId } from "../../fatha/bastas/bastaSearchTab.js";
import {
    clampPickerScroll,
    ensurePickerSelectionVisible,
    getFileBrowserCurrentDisplay,
    getFileBrowserRootBreadcrumbName,
    getFileBrowserRootDisplayName,
    getFileBrowserItemValue,
    getFileRowPrefix as getFileRowPrefixHelper,
    getPickerScrollMetrics,
    getPickerSearchMatch,
    getSearchMatchScrollTarget,
    refreshActiveFilePickerState,
    rebuildFilePickerRows as rebuildFilePickerRowsHelper,
    syncActiveFilePickerSearch,
} from "./helpers/fileBrowserHelpers.js";
import {
    calculatePickerPanelLayout,
    calculatePickerRenderMetrics,
    calculatePickerScrollViewport,
    createFirstRowGeometry,
    drawBreadcrumbHeaderRow as drawBreadcrumbHeaderRowHelper,
    drawPickerBottomGap,
    drawPickerRow as drawPickerRowHelper,
    drawPickerRows,
    drawPickerSeparator,
    drawPickerScrollbar,
    getVisiblePickerScrollRows,
    preparePickerDrawState,
    shouldKeepPickerAwake,
    syncPickerViewportFollow,
} from "./helpers/fileBrowserDraw.js";
import {
    drawPreviewImagePanel,
    isPreviewImagePending,
    loadPreviewImageForRow as loadPreviewImageForRowHelper,
} from "./helpers/fileBrowserPreview.js";

const FILEBROWSER_ICON_MAP = {
    folder: ["🗀", "🗁"],
    dropdown: ["▶", "▼"],
    palette: ["❖", "❖"],
    file: ["🖺", "🖺"],
    settings: ["⛯", "⛯"],
    signal: ["ᯤ", "ᯤ"],
    fallback: ["📁", "📂"],
};

const BROWSER_ICONS = {
    DIR: "🗀 ",
    FILE: "🖺 ",
    PALETTE: "❖ ",
    LORA: "🖺 ",
    LORAIMAGE: "🖻 ",
    SIGNAL: "ᯤ ",
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
const PICKER_FIRST_ROW_MARGIN = [0, 0, 0, 0];

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
        const img = typeof item === "object" ? String(item.imageUrl ?? "") : "";
        parts[i] = `${value}|${display}|${img}`;
    }
    return `${items.length}:${parts.join("\u0001")}`;
}

function getFileBrowserMode(config) {
    const mode = String(config?.mode || "browser").trim().toLowerCase();
    if (mode === "folder") return "folder";
    if (mode === "file") return "file";
    if (mode === "signal") return "signal";
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

function normalizeFourSideMargin(margin) {
    if (!Array.isArray(margin) || margin.length === 0) return [0, 0, 0, 0];
    if (margin.length >= 4) {
        return margin.slice(0, 4).map((value) => Number(value) || 0);
    }
    if (margin.length === 2) {
        return [Number(margin[0]) || 0, Number(margin[1]) || 0, Number(margin[0]) || 0, Number(margin[1]) || 0];
    }
    if (margin.length === 1) {
        const value = Number(margin[0]) || 0;
        return [value, value, value, value];
    }
    return [0, 0, 0, 0];
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
    return config?.icon === "dropdown" || glyphs[0] === "▶" || getFileBrowserMode(config) === "signal";
}

function getFileBrowserCallbacks(config) {
    return {
        onChange: config?.onChange || config?.callbacks?.onChange || null,
        onFolderConfirm: config?.onFolderConfirm || config?.callbacks?.onFolderConfirm || null,
    };
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

function resolvePickerTheme(config, node) {
    const parts = String(config?.themeKey || "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
    const bodyKey = parts[0] || "panel";
    const pickerKey = parts.length >= 3 ? parts[1] : null;
    const textKey = parts.length >= 3 ? (parts[2] || "t_textsystem") : (parts[1] || parts[0] || "t_textsystem");
    const resolvedPickerKey = pickerKey || bodyKey;
    const hashPickerPaint = resolvePaintData(node, "#picker", "_OFF");
    const rawListPaint = hashPickerPaint || resolvePaintData(node, resolvedPickerKey, "_OFF") || resolvePaintData(node, bodyKey, "_OFF") || node._panelPaintData_OFF;
    if (config.searchTab && rawListPaint?.corners?.length >= 4) {
        rawListPaint.corners = [0, 0, rawListPaint.corners[2], rawListPaint.corners[3]];
    }
    return {
        listPaint: rawListPaint,
        rowPaintOFF: resolvePaintData(node, textKey, "_OFF") || node._t_textnormalPaintData_OFF,
        rowTextON: resolvePaintData(node, textKey, "_ON") || resolvePaintData(node, textKey, "_OFF") || node._t_textnormalPaintData_OFF,
        rowPaintON: resolvePaintData(node, "#picker_highlight", "_ON") || resolvePaintData(node, bodyKey, "_ON") || node._t_textnormalPaintData_ON,
    };
}

function inheritPickerCorners(primaryPaint, fallbackPaint) {
    if (primaryPaint?.corners != null) return primaryPaint.corners;
    if (fallbackPaint?.corners != null) return fallbackPaint.corners;
    return 0;
}

function getFileRowPrefix(config, node, entry) {
    return getFileRowPrefixHelper(config, node, entry, {
        shouldShowFileBrowserIndicator,
        getFileBrowserGlyphs,
        isDropdownFileBrowser,
        browserIcons: BROWSER_ICONS,
    });
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

function rebuildFilePickerRows(state) {
    return rebuildFilePickerRowsHelper(state, {
        getFileBrowserMode,
        isDropdownFileBrowser,
        getFileRowPrefix,
    });
}

function loadPreviewImageForRow(state, row) {
    return loadPreviewImageForRowHelper(state, row, { markNodeDirty });
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
    // If the resolved directory is the _Template folder, start at root instead
    if (currentDir && (currentDir === "_Template" || currentDir === "_Templates" || currentDir.startsWith("_Template/"))) {
        currentDir = "";
    }

    activeFilePicker = {
        key: config.key,
        node,
        config: { ...config, skipBackground: config.pickerSkipBackground || config.skipBackground },
        mode,
        _rawConfig: config,
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
        // Steal keyboard focus into the search editor so the user can type immediately
        setTimeout(() => {
            const b = activeBastas.get(getBastaSearchTabId(node, config.key));
            if (b) {
                const el = b._derpDomElements?.editorSearch;
                if (el) {
                    el._isAwake = true;
                    el.style.opacity = "1";
                    el.style.pointerEvents = "auto";
                    el.focus();
                    if (typeof el.select === "function") {
                        el.select();
                    } else {
                        const range = document.createRange();
                        range.selectNodeContents(el);
                        const selection = window.getSelection();
                        if (selection) {
                            selection.removeAllRanges();
                            selection.addRange(range);
                        }
                    }
                }
            }
        }, 50);
    }
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
        state.config.value = String(row.path ?? row.name ?? "");
        if (state.callbacks.onChange) state.callbacks.onChange(state.config.value);
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

function getSearchTabScreenRect(state = activeFilePicker) {
    if (!state?.searchBastaId) return null;
    const basta = activeBastas.get(state.searchBastaId);
    if (!basta) return null;

    const ds = window.app?.canvas?.ds;
    const canvasRect = window.app?.canvas?.canvas?.getBoundingClientRect?.();
    if (!ds || !canvasRect) return null;
    const scale = Number(ds.scale) || 1;
    return {
        left: canvasRect.left + (((basta.pos?.[0] || 0) + (Number(ds.offset?.[0]) || 0)) * scale),
        top: canvasRect.top + (((basta.pos?.[1] || 0) + (Number(ds.offset?.[1]) || 0)) * scale),
        width: Math.max(1, (basta.size?.[0] || 0) * scale),
        height: Math.max(1, (basta.size?.[1] || 0) * scale),
    };
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

    window.addEventListener("blur", () => {
        if (!activeFilePicker) return;
        closeFilePicker();
    });

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
    return drawPickerRowHelper(ctx, state, row, rect, labelPaint, scale, {
        masterPainter,
        masterPainterText,
        inheritPickerCorners,
        parseColorKeyText,
        clampText,
        snapToScreenGrid,
    });
}

function drawBreadcrumbHeaderRow(ctx, state, row, rect, labelPaint, scale) {
    return drawBreadcrumbHeaderRowHelper(ctx, state, row, rect, labelPaint, scale, {
        drawPickerRow,
        isDropdownFileBrowser,
        masterPainter,
        masterPainterText,
        inheritPickerCorners,
        resolvePaintData,
        measureTextWidth,
        clampText,
        snapToScreenGrid,
        breadcrumbPadding: PICKER_BREADCRUMB_PADDING,
        breadcrumbTextKey: PICKER_BREADCRUMB_TEXT_KEY,
        getRootBreadcrumbName: getFileBrowserRootBreadcrumbName,
    });
}

function drawActiveFilePicker(ctx, node, app, config, scale) {
    const state = activeFilePicker;
    if (!state || state.node !== node || state.key !== config.key) return;

    refreshActiveFilePickerState(state, config, {
        getFileBrowserItemsFingerprint,
        getFileBrowserCallbacks,
        resolvePickerTheme,
        measureTextHeight,
        rebuildFilePickerRows,
        ensurePickerSelectionVisible,
        getFileBrowserGlyphs,
    });

    syncActiveFilePickerSearch(state, { getFileBrowserMode, syncPickerSearchScroll });

    const anchorRect = computeScreenAnchorRect(node, app, config.geometry);
    state.screenAnchorRect = anchorRect;

    const { sH, mW } = getDerpVars(node);
    const separatorHeight = sH || 0;
    const bottomGap = mW || 0;
    const [firstRowMarginL, firstRowMarginT, firstRowMarginR, firstRowMarginB] = normalizeFourSideMargin(PICKER_FIRST_ROW_MARGIN);
    const firstRowExtraHeight = firstRowMarginT + firstRowMarginB;
    const { renderedScrollRows, targetHeight } = calculatePickerRenderMetrics(state, {
        separatorHeight,
        bottomGap,
        firstRowExtraHeight,
    });
    state.renderedScrollRows = renderedScrollRows;
    state.currentSize[1] = lerpTo(state.currentSize[1], targetHeight, DROPDOWN_ANIM_SETTINGS.lerpFactor, true).value;
    state.itemAlpha = animateAlpha(state.itemAlpha, 1, DROPDOWN_ANIM_SETTINGS.alphaFactor, true).value;
    clampPickerScroll(state);
    const scrollMetrics = getPickerScrollMetrics(state);

    const { panelX, panelY, panelW, panelH, panelScreenRect } = calculatePickerPanelLayout(state, config, anchorRect, scale, {
        windowHeight: window.innerHeight,
        autoFlipBySpace: AUTO_FLIP_DROPDOWN_BY_SPACE,
    });
    state.panelY = panelY;
    state.panelScreenRect = panelScreenRect;
    state.previewAvoidScreenRect = getSearchTabScreenRect(state);

    syncPickerViewportFollow(state, scale, {
        ensureScreenRectVisible,
        warpMarginUnits: PICKER_WARP_MARGIN_UNITS,
    });

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

    const { labelPaint } = preparePickerDrawState(state, ctx, { computePickerPrefixSlotWidth });
    let cursorY = panelY;
    const firstRowGeometry = createFirstRowGeometry([firstRowMarginL, firstRowMarginT, firstRowMarginR, firstRowMarginB], scale);

    cursorY = drawPickerRows(ctx, state, state.headerRows, { x: panelX, y: cursorY, w: panelW }, {
        drawPickerRow,
        drawBreadcrumbHeaderRow,
        firstRowGeometry,
        labelPaint,
        scale,
        firstRowExtraHeight,
        panelY,
        areaLeft: state.panelScreenRect.left,
        areaTop: state.panelScreenRect.top,
        yOffset: panelY,
        advanceCursor: true,
    });

    cursorY = drawPickerSeparator(ctx, { panelX, panelW, cursorY, separatorHeight }, { lineTop, lineBottom });

    const footerHeight = state.footerRow ? state.rowHeight : 0;
    const { scrollAreaH, needsScrollbar, scrollbarReserve, scrollScreenRect, clipRect } = calculatePickerScrollViewport(state, {
        panelX,
        panelY,
        panelW,
        panelH,
        cursorY,
        footerHeight,
        bottomGap,
        scale,
        scrollMetrics,
    }, {
        scrollbarWidth: PICKER_SCROLLBAR_WIDTH,
        scrollbarInset: PICKER_SCROLLBAR_INSET,
    });
    state.scrollScreenRect = scrollScreenRect;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipRect.x, clipRect.y, clipRect.w, clipRect.h);
    ctx.clip();

    const { rows: visibleRows, rowYByRow } = getVisiblePickerScrollRows(state, { cursorY, scrollAreaH });
    drawPickerRows(ctx, state, visibleRows, {
        x: panelX,
        y: cursorY,
        w: panelW - scrollbarReserve,
        getRowY: (row) => rowYByRow.get(row) ?? cursorY,
    }, {
        drawPickerRow,
        firstRowGeometry,
        labelPaint,
        scale,
        areaLeft: state.scrollScreenRect.left,
        areaTop: state.scrollScreenRect.top,
        yOffset: cursorY,
    });
    ctx.restore();

    if (needsScrollbar) {
        drawPickerScrollbar(ctx, state, { panelX, panelY, panelW, cursorY, scrollAreaH, scale }, scrollMetrics, {
            masterPainter,
            inheritPickerCorners,
            clamp01,
            scrollbarWidth: PICKER_SCROLLBAR_WIDTH,
            scrollbarInset: PICKER_SCROLLBAR_INSET,
            scrollbarMinThumb: PICKER_SCROLLBAR_MIN_THUMB,
        });
    }

    drawPickerBottomGap(ctx, state, { panelX, panelY, panelW, panelH, bottomGap }, { masterPainter, inheritPickerCorners });

    if (state.footerRow) {
        const footerY = panelY + panelH - state.rowHeight;
        drawPickerRows(ctx, state, [state.footerRow], { x: panelX, y: footerY, w: panelW }, {
            drawPickerRow,
            firstRowGeometry,
            labelPaint,
            scale,
            areaLeft: state.panelScreenRect.left,
            areaTop: state.panelScreenRect.top,
            yOffset: panelY,
        });
    }

    drawPreviewImagePanel(ctx, state, { panelX, panelY, panelW, panelH, scale }, { masterPainter });

    ctx.restore();

    if (shouldKeepPickerAwake(state, targetHeight, { isPreviewImagePending })) {
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
    masterPainter(ctx, {
            width: w,
            height: h,
            posX: snapToScreenGrid(x, dsScale),
            posY: snapToScreenGrid(y, dsScale),
            paintData: bodyPaint,
            color: animatedFillColor
        });

    const dropdownDisplay = getFileBrowserCurrentDisplay(safeConfig, safeConfig.items || [], isDropdownFileBrowser(safeConfig));
    const mode = getFileBrowserMode(safeConfig);
    const rootDisplayName = getFileBrowserMode(safeConfig) === "signal" ? "" : getFileBrowserRootDisplayName(safeConfig, mode);
    const isSelection = typeof safeConfig.value === "string" && safeConfig.value !== "/" && (mode === "folder" || (safeConfig.items || []).some((item) => getFileBrowserItemValue(item) === safeConfig.value));
    let currentVal = rootDisplayName;
    if (isSelection) {
        const cleanPath = safeConfig.value.replace(/\.(safetensors|pt|pth|ckpt|bin|gguf|json)$/i, "").replace(/\/$/, "").replace(/\//g, "\\");
        const sep = rootDisplayName && rootDisplayName !== "/" ? "\\" : "";
        currentVal = String(safeConfig.icon || "").toLowerCase() === "signal" ? cleanPath : `${rootDisplayName}${sep}${cleanPath}`;
    }

    // Check if the selected item carries a _triggerDisplay with {{}} color-key syntax
    const selectedValue = String(safeConfig?.value || "");
    const selectedItem = (safeConfig.items || []).find((item) => String(getFileBrowserItemValue(item)) === selectedValue);
    const triggerDisplay = (selectedItem && typeof selectedItem === "object" && selectedItem._triggerDisplay)
        ? selectedItem._triggerDisplay
        : null;
    const labelStr = triggerDisplay || dropdownDisplay || ((mode === "folder" || mode === "signal" || ((mode === "file" || mode === "browser") && isSelection)) ? currentVal : (props.displayText || "Browse Files..."));
    const glyphs = getFileBrowserGlyphs(safeConfig?.icon);

    // Parse labelStr for color keys (may differ from props.displayText when items carry {{}} syntax)
    const suffix = stateStr === "DIS" ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");
    const { segments: labelSegments, hasColorKeys: labelHasKeys } = parseColorKeyText(
        labelStr, node, suffix, labelPaint?.textColor || labelPaint?.fill
    );

    if (labelPaint) {
        const pX = props.padding[0];
        const iconOffset = fs * 1.2;
        const indicatorOffset = iconOffset;
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
