import { t } from "../../../fatha/core/masterLayoutEngine.js";

export function getFileBrowserItemValue(item) {
    return typeof item === "string" ? item : (item?.path ?? item?.value ?? item?.key ?? item?.id ?? item?.name ?? item?.title ?? "");
}

export function getFileBrowserLeafDisplay(value) {
    return String(value || "")
        .replace(/[\\]/g, "/")
        .split("/")
        .pop()
        .replace(/\.(safetensors|json)$/i, "");
}

export function stripFileBrowserHTML(value) {
    return String(value || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();
}

export function getDropdownItemDisplay(item) {
    if (item && typeof item === "object") {
        const labelText = stripFileBrowserHTML(item.label);
        const displayText = String(item.display ?? item.text ?? item.name ?? item.title ?? item.key ?? item.value ?? "");
        if (labelText || displayText) return `${labelText}${displayText}`.trim();
    }
    return getFileBrowserLeafDisplay(getFileBrowserItemValue(item));
}

export function normalizePickerSearchValue(value) {
    return String(value || "").trim().toLowerCase();
}

export function pickerRowMatchesSearch(row, searchNeedle) {
    if (!searchNeedle) return false;
    if (!row || (row.type !== "file" && row.type !== "dir" && row.type !== "select_folder")) return false;
    return String(row.name || row.path || "").toLowerCase().includes(searchNeedle);
}

export function getPickerSearchMatch(state) {
    const needle = normalizePickerSearchValue(state?.searchQuery);
    if (!state || !needle || !state.scrollRows.length) return null;

    const searchableRows = state.scrollRows.filter((row) => pickerRowMatchesSearch(row, needle));
    if (!searchableRows.length) return null;

    const startsWithMatch = searchableRows.find((row) => String(row.name || row.path || "").toLowerCase().startsWith(needle));
    return startsWithMatch || searchableRows[0] || null;
}

export function getSearchMatchScrollTarget(state) {
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

export function getFileBrowserCurrentDisplay(config, items = [], isDropdownMode = false) {
    if (!isDropdownMode) return null;

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

export function clampPickerScroll(state) {
    if (!state) return;
    const viewportRows = Math.max(0, state.renderedScrollRows ?? state.visibleScrollRows ?? 0);
    const maxScroll = Math.max(0, (state.scrollRows.length * state.rowHeight) - (viewportRows * state.rowHeight));
    state.scrollOffset = Math.max(0, Math.min(state.scrollOffset || 0, maxScroll));
}

export function getPickerScrollMetrics(state) {
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

export function ensurePickerSelectionVisible(state) {
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

export function getFileRowPrefix(config, node, entry, deps) {
    const { shouldShowFileBrowserIndicator, getFileBrowserGlyphs, isDropdownFileBrowser, browserIcons } = deps;
    if (entry.type === "select_current") {
        return { prefix: shouldShowFileBrowserIndicator(config) ? getFileBrowserGlyphs(config?.icon)[1] : null, prefixColor: null };
    }
    if (entry.type === "dir") return { prefix: browserIcons.DIR, prefixColor: null };
    if (config.fileType === "palette") return { prefix: browserIcons.PALETTE, prefixColor: null };

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
        return { prefix: config.previewList?.includes(entry.path) ? browserIcons.LORAIMAGE : browserIcons.LORA, prefixColor: null };
    }

    if (String(config.icon || "").toLowerCase() === "signal") return { prefix: browserIcons.SIGNAL, prefixColor: null };
    return { prefix: isDropdownFileBrowser(config) ? null : browserIcons.FILE, prefixColor: null };
}

export function rebuildFilePickerRows(state, deps) {
    const { config, node } = state;
    const {
        getFileBrowserMode,
        isDropdownFileBrowser,
        getFileRowPrefix: resolveRowPrefix,
    } = deps;
    const items = config.items || [];
    const mode = getFileBrowserMode(config);
    const dropdownMode = isDropdownFileBrowser(config);
    if (dropdownMode) {
        const headerRows = [];
        const scrollRows = [];
        const displayVal = getFileBrowserCurrentDisplay(config, items, dropdownMode);
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
                hidePrefix: !!(item && typeof item === "object" && item.hidePrefix),
                reservePrefix: !!(item && typeof item === "object" && item.reservePrefix),
                disableSelectedStyle: !!(item && typeof item === "object" && item.disableSelectedStyle),
            };
            scrollRows.push(row);
        });

        state.headerRows = headerRows.map((entry) => ({ ...entry, ...resolveRowPrefix(config, node, entry) }));
        state.scrollRows = scrollRows.map((entry) => ({ ...entry, ...resolveRowPrefix(config, node, entry) }));
        state.footerRow = null;
        state.visibleScrollRows = Math.max(0, state.visibleLimit - state.headerRows.length);
        state.renderedScrollRows = Math.min(state.scrollRows.length, state.visibleScrollRows);
        clampPickerScroll(state);
        return;
    }

    const entries = new Set();
    const files = [];
    const alwaysVisibleFiles = [];
    const dir = state.currentDir || "";
    const normalizedDir = (dir === "/" ? "" : dir).replace(/[\\]/g, "/");

    items.forEach((item) => {
        const fullPath = getFileBrowserItemValue(item);
        if (!fullPath && !(item && typeof item === "object" && item.alwaysVisible)) return;
        if (item && typeof item === "object" && item.alwaysVisible) {
            alwaysVisibleFiles.push({ name: getDropdownItemDisplay(item), path: fullPath, item });
            return;
        }

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
    if (mode !== "folder") {
        alwaysVisibleFiles.forEach((file, idx) => {
            const item = file.item;
            scrollRows.push({
                id: `file:always:${idx}:${file.path}`,
                name: file.name,
                path: file.path,
                type: "file",
                item,
                hidePrefix: !!(item && typeof item === "object" && item.hidePrefix),
                reservePrefix: !!(item && typeof item === "object" && item.reservePrefix),
                disableSelectedStyle: !!(item && typeof item === "object" && item.disableSelectedStyle),
            });
        });
    }
    Array.from(entries).sort().forEach((folder) => {
        scrollRows.push({ id: `dir:${folder}`, name: folder, type: "dir" });
    });
    if (mode !== "folder") {
        files.sort((a, b) => a.name.localeCompare(b.name)).forEach((file) => {
            const item = file.item;
            scrollRows.push({
                id: `file:${file.path}`,
                name: file.name,
                path: file.path,
                type: "file",
                item,
                hidePrefix: !!(item && typeof item === "object" && item.hidePrefix),
                reservePrefix: !!(item && typeof item === "object" && item.reservePrefix),
                disableSelectedStyle: !!(item && typeof item === "object" && item.disableSelectedStyle),
            });
        });
    }

    state.headerRows = headerRows.map((entry) => ({ ...entry, ...resolveRowPrefix(config, node, entry) }));
    state.scrollRows = scrollRows.map((entry) => ({ ...entry, ...resolveRowPrefix(config, node, entry) }));
    state.footerRow = mode === "folder"
        ? { id: "select-folder", name: "Select Folder", type: "select_folder", prefix: null, prefixColor: null }
        : null;
    state.visibleScrollRows = Math.max(0, state.visibleLimit - state.headerRows.length - (state.footerRow ? 1 : 0));
    state.renderedScrollRows = Math.min(state.scrollRows.length, state.visibleScrollRows);
    clampPickerScroll(state);
}

export function refreshActiveFilePickerState(state, config, deps = {}) {
    const {
        getFileBrowserItemsFingerprint = () => "0:",
        getFileBrowserCallbacks = () => ({}),
        resolvePickerTheme = () => ({}),
        measureTextHeight = () => 0,
        rebuildFilePickerRows = () => {},
        ensurePickerSelectionVisible = () => {},
        getFileBrowserGlyphs = () => [],
    } = deps;
    const nextItemsHash = getFileBrowserItemsFingerprint(config.items || []);
    const nextRowHeight = measureTextHeight("Hgyj", 0, state.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
    if (state.itemsHash === nextItemsHash && state.config.value === config.value && state.rowHeight === nextRowHeight) {
        return false;
    }

    state.config = config;
    state.callbacks = getFileBrowserCallbacks(config);
    const theme = resolvePickerTheme(config, state.node);
    state.listPaint = theme.listPaint;
    state.rowPaintOFF = theme.rowPaintOFF;
    state.rowPaintON = theme.rowPaintON;
    state.rowTextON = theme.rowTextON;
    state.rowHeight = measureTextHeight("Hgyj", 0, theme.rowPaintOFF) + ((config.padding?.[1] || 2) * 2);
    state.glyphs = getFileBrowserGlyphs(config?.icon);
    state.itemsHash = nextItemsHash;
    rebuildFilePickerRows(state);
    ensurePickerSelectionVisible(state);
    return true;
}

export function syncActiveFilePickerSearch(state, deps = {}) {
    const {
        getFileBrowserMode = () => "browser",
        syncPickerSearchScroll = () => {},
    } = deps;
    if (getFileBrowserMode(state.config) !== "folder" && state.searchQuery) {
        syncPickerSearchScroll(state, false);
        return;
    }

    state.searchMatchRowId = null;
    state.searchScrollTarget = null;
}
