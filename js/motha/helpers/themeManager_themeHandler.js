/**
 * Path: ./nodes/themeManager_themeHandler.js
 * Specialist: Theme-Level Actions & Layout Sync
 */
import { app } from "../../../../scripts/app.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { safeClick, safePersist, playSuccessSound, normalizeThemeCategory, syncThemeCategory } from "../themeManagerV2_core.js";
import { getSystemPaletteDisplayName } from "./themeManager_paletteUtils.js";

const THEME_META_KEYS = new Set(["Category", "_category", "_layout", "_palette"]);
const THEME_WEIGHT_PREFIX = "_WT_";
const THEME_WEIGHT_SYSTEM_DIR = "_System";
const THEME_WEIGHT_META_VERSION = 1;

function cloneWeightValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeThemeWeightName(name) {
    const raw = String(name || "ThemeWeight").replace(/\\/g, "/").split("/").pop().replace(/\.json$/i, "").trim() || "ThemeWeight";
    const prefixed = raw.toLowerCase().startsWith(THEME_WEIGHT_PREFIX.toLowerCase()) ? raw : `${THEME_WEIGHT_PREFIX}${raw}`;
    return `${THEME_WEIGHT_SYSTEM_DIR}/${prefixed}`;
}

function isThemeWeightName(name) {
    const raw = String(name || "").replace(/\\/g, "/").split("/").pop().replace(/\.json$/i, "");
    return raw.toLowerCase().startsWith(THEME_WEIGHT_PREFIX.toLowerCase());
}

export function isThemeWeightPath(name) {
    const normalized = String(name || "").replace(/\\/g, "/");
    return normalized.toLowerCase().startsWith(`${THEME_WEIGHT_SYSTEM_DIR.toLowerCase()}/`) && isThemeWeightName(normalized);
}

export function mapThemeWeightPickerItem(name) {
    const normalized = String(name || "").replace(/\\/g, "/");
    return { value: normalized, display: normalized.split("/").pop() };
}

export function mapThemeKeyPickerItem(key, dirtyKeyNames) {
    return {
        value: key,
        display: `${dirtyKeyNames?.has(key) ? "* " : ""}${key}`,
    };
}

export function getThemeWeightRootValue() {
    return `${THEME_WEIGHT_SYSTEM_DIR}/`;
}

export async function loadThemeWeightData(weightName) {
    if (!isThemeWeightPath(weightName)) return null;
    const res = await fetch(`/xcp/load/themes?name=${encodeURIComponent(weightName)}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.data || null;
}

export function applyThemeWeightToTheme(targetTheme, weightData) {
    if (!targetTheme || !weightData || typeof weightData !== "object") return false;
    const sourceKeys = weightData.keys && typeof weightData.keys === "object" ? weightData.keys : weightData;
    let changed = false;

    if (Array.isArray(weightData._layout)) {
        targetTheme._layout = cloneWeightValue(weightData._layout);
        changed = true;
    }

    Object.entries(sourceKeys || {}).forEach(([keyName, weightEntry]) => {
        if (THEME_META_KEYS.has(keyName) || keyName === "keys" || keyName === "meta" || !weightEntry || typeof weightEntry !== "object") return;
        const targetKey = targetTheme[keyName];
        if (!targetKey || typeof targetKey !== "object" || Array.isArray(targetKey)) return;
        ["corners", "font", "fontSize", "fontWeight"].forEach((prop) => {
            if (weightEntry[prop] === undefined) return;
            targetKey[prop] = cloneWeightValue(weightEntry[prop]);
            changed = true;
        });
    });

    return changed;
}

function collectThemeWeightData(themeObj, sourceThemeName = "") {
    const weightData = {
        meta: {
            type: "xcpThemeWeight",
            version: THEME_WEIGHT_META_VERSION,
            sourceTheme: sourceThemeName,
        },
        _layout: cloneWeightValue(themeObj?._layout || [4, 2, 2, 2, 2, 4, 2, 4]),
        keys: {},
    };

    Object.entries(themeObj || {}).forEach(([keyName, keyData]) => {
        if (THEME_META_KEYS.has(keyName) || !keyData || typeof keyData !== "object" || Array.isArray(keyData)) return;
        const entry = {};
        if (keyData.corners !== undefined) entry.corners = cloneWeightValue(keyData.corners);
        if (String(keyName).startsWith("t_")) {
            if (keyData.font !== undefined) entry.font = keyData.font;
            if (keyData.fontSize !== undefined) entry.fontSize = keyData.fontSize;
            if (keyData.fontWeight !== undefined) entry.fontWeight = keyData.fontWeight;
        }
        if (Object.keys(entry).length > 0) weightData.keys[keyName] = entry;
    });

    return weightData;
}

export const handleThemeDeleteAction = (node, updateThemeLayoutFn) => {
    const currentTheme = node._selectedThemeName;
    if (!currentTheme) return;
    if (isThemeWeightName(currentTheme)) {
        showBastaSystemMessage(node, "Theme Weight files cannot be deleted", 3000, { fade: true, grow: true }, "btnThemeDelete", "warning", null, currentTheme);
        node.requestDerpSync();
        return;
    }

    showBastaFileHandler(node, "themes", "btnThemeDelete", {
        title: "Delete Current Theme",
        mode: "delete",
        message: `Delete '${currentTheme}'?`,
        onConfirm: async () => {
            const cfg = window.xcpDerpThemeConfig;
            if (cfg && cfg.themes && currentTheme) {
                try {
                    await fetch("/xcp/delete/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: currentTheme })
                    });
                    delete cfg.themes[currentTheme];
                    const themes = Object.keys(cfg.themes);
                    const dropdown = node.layoutMap?.themeManagementRegion?.dropdownTheme;
                    if (dropdown) dropdown.items = themes;
                    const next = themes[0] || "";
                    if (cfg.activeTheme === currentTheme) cfg.activeTheme = next;
                    handleThemeDropdownChange(node, next, updateThemeLayoutFn);
                    showBastaSystemMessage(node, "Theme Deleted: ", 2000, { fade: true, grow: true }, "btnThemeDelete", "critical", null, currentTheme);
                } catch (err) { console.error("Theme Deletion Error:", err); }
            }
            node.requestDerpSync();
        }
    });
};

export const handleThemeDropdownChange = (node, val, updateThemeLayoutFn) => {
    node._selectedThemeName = val;
    node.properties.selectedThemeName = val; // Persist edit target across reloads; getDerpVars override protects layout
    node.properties.selectedTheme = ""; // Prevent onThemeUpdate from applying this as the active theme
    if (node.layoutMap?.themeManagementRegion?.dropdownTheme) {
        node.layoutMap.themeManagementRegion.dropdownTheme.value = val;
    }
    const source = window.xcpDerpThemeConfig?.themes?.[val];
    if (source) {
        node.themeToEdit = JSON.parse(JSON.stringify(source));
        if (!node.themeToEdit._layout) node.themeToEdit._layout = [4, 2, 2, 2, 2, 4, 2, 4];
        syncThemeCategory(node, normalizeThemeCategory(node.themeToEdit));
        node.properties.systemPaletteName = node.themeToEdit._palette || "";

        // Re-capture baseline for the newly-selected theme
        const cfg = window.xcpDerpThemeConfig;
        if (cfg?.refreshBaselines) cfg.refreshBaselines(true, val);
        node._isSelectedKeyDirty = false;
        node._dirtyKeyNames = new Set();

        if (node.layoutMap?.themeLayoutRegion?.dropdownPalette) {
            node.layoutMap.themeLayoutRegion.dropdownPalette.value = node.properties.systemPaletteName || "None";
            node.layoutMap.themeLayoutRegion.dropdownPalette.text = node.properties.systemPaletteName
                ? getSystemPaletteDisplayName(node.properties.systemPaletteName)
                : "None";
        }
        if (node.layoutMap?.themeLayoutRegion?.dropdownCategory) {
            node.layoutMap.themeLayoutRegion.dropdownCategory.value = node.properties.themeCategory || "Other";
        }

        const availableKeys = Object.keys(node.themeToEdit).filter(k => !THEME_META_KEYS.has(k));
        node._selectedKeyName = availableKeys.includes("canvas") ? "canvas" : (availableKeys[0] || "");
        if (node.layoutMap?.keyManagementRegion?.dropdownKey) {
            node.layoutMap.keyManagementRegion.dropdownKey.items = availableKeys.map(k => mapThemeKeyPickerItem(k, node._dirtyKeyNames));
            node.layoutMap.keyManagementRegion.dropdownKey.value = node._selectedKeyName;
        }
    }

    node._layoutMapHash = "";
    node._lastUISyncHash = "";
    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
    if (typeof updateThemeLayoutFn === "function") updateThemeLayoutFn(node);

    // THE ISOLATION FIX: Removed the global broadcast. Browsing themes in the Manager
    // should not trigger updates on other nodes until 'Save' is clicked.

    if (node.layout) node.layout._lastCacheKey = "";
    node.requestDerpSync();
};

export const handleThemeRenameAction = (node, updateThemeLayoutFn) => {
    const currentTheme = node._selectedThemeName;
    if (!currentTheme) return;

    const cfg = window.xcpDerpThemeConfig;
    showBastaFileHandler(node, "themes", "btnThemeRename", {
        title: "Rename Current Theme",
        mode: "rename",
        message: "Enter new name for theme profile:",
        originalName: currentTheme,
        onConfirm: async (newName) => {
            if (cfg && cfg.themes && newName && newName !== currentTheme) {
                try {
                    cfg.themes[newName] = JSON.parse(JSON.stringify(cfg.themes[currentTheme]));
                    await fetch("/xcp/delete/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: currentTheme })
                    });
                    delete cfg.themes[currentTheme];
                    if (cfg.activeTheme === currentTheme) cfg.activeTheme = newName;
                    safePersist(cfg, newName);
                    const dropdown = node.layoutMap?.themeManagementRegion?.dropdownTheme;
                    if (dropdown) dropdown.items = Object.keys(cfg.themes);
                    handleThemeDropdownChange(node, newName, updateThemeLayoutFn);
                    showBastaSystemMessage(node, "Theme Renamed: ", 2000, { fade: true, grow: true }, "btnThemeRename", "success", null, newName);
                } catch (err) {
                    showBastaSystemMessage(node, "Rename Failed", 3000, { fade: true, grow: true }, "btnThemeRename", "error", null, "");
                    console.error("Theme Rename Error:", err);
                }
            }
            node.requestDerpSync();
        }
    });
};

export const handleThemeCopyAction = (node, updateThemeLayoutFn) => {
    const currentTheme = node._selectedThemeName;
    if (!currentTheme) return;

    const cfg = window.xcpDerpThemeConfig;
    showBastaFileHandler(node, "themes", "btnThemeCopy", {
        title: "Copy Current Theme",
        mode: "duplicate",
        message: "Enter name for new theme profile:",
        originalName: `${currentTheme}_copy`,
        onConfirm: async (newName) => {
            if (cfg && cfg.themes && newName) {
                try {
                    const newThemeData = JSON.parse(JSON.stringify(cfg.themes[currentTheme]));
                    cfg.themes[newName] = newThemeData;
                    const dropdown = node.layoutMap?.themeManagementRegion?.dropdownTheme;
                    if (dropdown) dropdown.items = Object.keys(cfg.themes);
                    handleThemeDropdownChange(node, newName, updateThemeLayoutFn);
                    showBastaSystemMessage(node, "Theme Copied: ", 2000, { fade: true, grow: true }, "btnThemeCopy", "warning", null, newName);
                } catch (err) {
                    showBastaSystemMessage(node, "Save Failed", 3000, { fade: true, grow: true }, "btnThemeCopy", "error", null, "");
                    console.error("Theme Copy Error:", err);
                }
            }
            node.requestDerpSync();
        }
    });
};

export const handleThemeSaveAction = (node, updateThemeLayoutFn) => {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg) return;
    const themeName = node._selectedThemeName || node.properties?.selectedThemeName || "";

    showBastaFileHandler(node, "themes", "btnThemeSave", {
        title: "Save Configuration",
        mode: "save",
        message: "Save all changes to theme file?",
        originalName: themeName,
        onConfirm: async () => {
            try {
                cfg.themes[themeName] = JSON.parse(JSON.stringify(node.themeToEdit));
                safePersist(cfg, themeName);

                // Re-capture baseline and clear dirty state after save
                if (cfg.refreshBaselines) cfg.refreshBaselines(true, themeName);
                node._isSelectedKeyDirty = false;
                node._isThemeDirty = false;
                node._dirtyKeyNames = new Set();
                node._layoutMapHash = null;
                if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();

                showBastaSystemMessage(node, "Configuration Saved: ", 2000, { fade: true, grow: true }, "btnThemeSave", "warning", null, themeName);
            } catch (err) {
                showBastaSystemMessage(node, "Save Failed", 3000, { fade: true, grow: true }, "btnThemeSave", "error", null, "");
                console.error("Theme Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};

export const handleThemeSaveWeightAction = (node) => {
    const themeName = node._selectedThemeName || node.properties?.selectedThemeName || "ThemeWeight";
    const themeObj = node.themeToEdit;
    if (!themeObj) return;
    const weightList = Array.isArray(node._themeWeightList) ? node._themeWeightList.filter(isThemeWeightPath) : null;

    showBastaFileHandler(node, "themes", "btnSaveWeight", {
        title: "Save Theme Weight",
        mode: "save",
        message: "Save layout, corners, and fonts?",
        originalName: `${THEME_WEIGHT_PREFIX}${themeName}`,
        initialSize: [300, 120],
        fileList: weightList,
        properties: {
            filePicker: {
                displayText: "Replace existing weight",
                fileType: "theme",
                rootName: "themes",
                rootValue: `${THEME_WEIGHT_SYSTEM_DIR}/`,
                filter: isThemeWeightPath,
                mapItem: mapThemeWeightPickerItem,
                valueToName: (value) => String(value || ""),
            },
        },
        onConfirm: async (newName) => {
            const targetName = normalizeThemeWeightName(newName || themeName);
            const weightData = collectThemeWeightData(themeObj, themeName);
            try {
                const res = await fetch("/xcp/save/themes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: targetName, data: weightData })
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                if (Array.isArray(node._themeWeightList) && !node._themeWeightList.includes(targetName)) {
                    node._themeWeightList = [...node._themeWeightList, targetName]
                        .filter(isThemeWeightPath)
                        .sort((a, b) => String(a).localeCompare(String(b)));
                    node._layoutMapHash = null;
                    if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
                }
                showBastaSystemMessage(node, "Theme Weight Saved: ", 2000, { fade: true, grow: true }, "btnSaveWeight", "success", null, targetName);
            } catch (err) {
                showBastaSystemMessage(node, "Weight Save Failed", 3000, { fade: true, grow: true }, "btnSaveWeight", "error", null, "");
                console.error("Theme Weight Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};
