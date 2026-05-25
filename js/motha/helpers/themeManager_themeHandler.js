/**
 * Path: ./nodes/themeManager_themeHandler.js
 * Specialist: Theme-Level Actions & Layout Sync
 */
import { app } from "../../../../scripts/app.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { safeClick, safePersist, playSuccessSound } from "../themeManagerV2_core.js";
import { getSystemPaletteDisplayName } from "./themeManager_paletteUtils.js";

const THEME_META_KEYS = new Set(["_category", "_layout", "_palette"]);

export const handleThemeDeleteAction = (node, updateThemeLayoutFn) => {
    const currentTheme = node._selectedThemeName;
    if (!currentTheme) return;

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
        node.properties.systemPaletteName = node.themeToEdit._palette || "";
        if (node.layoutMap?.themeLayoutRegion?.dropdownPalette) {
            node.layoutMap.themeLayoutRegion.dropdownPalette.value = node.properties.systemPaletteName || "None";
            node.layoutMap.themeLayoutRegion.dropdownPalette.text = node.properties.systemPaletteName
                ? getSystemPaletteDisplayName(node.properties.systemPaletteName)
                : "None";
        }

        const availableKeys = Object.keys(node.themeToEdit).filter(k => !THEME_META_KEYS.has(k));
        node._selectedKeyName = availableKeys[0] || "";
        if (node.layoutMap?.keyManagementRegion?.dropdownKey) {
            node.layoutMap.keyManagementRegion.dropdownKey.items = availableKeys;
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
                    showBastaSystemMessage(node, "Theme Renamed: ", 2000, { fade: true, grow: true }, "btnThemeRename", "warning", null, newName);
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
                showBastaSystemMessage(node, "Configuration Saved: ", 2000, { fade: true, grow: true }, "btnThemeSave", "warning", null, themeName);
            } catch (err) {
                showBastaSystemMessage(node, "Save Failed", 3000, { fade: true, grow: true }, "btnThemeSave", "error", null, "");
                console.error("Theme Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};
