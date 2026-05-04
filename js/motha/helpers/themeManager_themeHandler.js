/**
 * Path: ./nodes/themeManager_themeHandler.js
 * Specialist: Theme-Level Actions & Layout Sync
 */
import { app } from "../../../../scripts/app.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { safeClick, safePersist, playSuccessSound } from "../themeManagerV2_core.js";

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
                    showBastaMessage(node, `Theme '${currentTheme}' deleted.`, 2000, { width: 250 }, "btnThemeDelete", false, "success");
                } catch (err) { console.error("Theme Deletion Error:", err); }
            }
            node.requestDerpSync();
        }
    });
};

export const handleThemeDropdownChange = (node, val, updateThemeLayoutFn) => {
    node._selectedThemeName = val;
    node.properties.selectedThemeName = val; // THE REFRESH FIX: Persist selection to survive browser reload
    if (node.layoutMap?.themeManagementRegion?.dropdownTheme) {
        node.layoutMap.themeManagementRegion.dropdownTheme.value = val;
    }
    const source = window.xcpDerpThemeConfig?.themes?.[val];
    if (source) {
        node.themeToEdit = JSON.parse(JSON.stringify(source));
        if (!node.themeToEdit._layout) node.themeToEdit._layout = [4, 2, 2, 2, 2, 4, 2, 4];

        const availableKeys = Object.keys(node.themeToEdit).filter(k => k !== "_category" && k !== "_layout");
        node._selectedKeyName = availableKeys[0] || "";
        if (node.layoutMap?.keyManagementRegion?.dropdownKey) {
            node.layoutMap.keyManagementRegion.dropdownKey.items = availableKeys;
            node.layoutMap.keyManagementRegion.dropdownKey.value = node._selectedKeyName;
        }
    }

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
                    await fetch("/xcp/save/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newName, data: cfg.themes[currentTheme] })
                    });
                    await fetch("/xcp/delete/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: currentTheme })
                    });
                    delete cfg.themes[currentTheme];
                    if (cfg.activeTheme === currentTheme) cfg.activeTheme = newName;
                    safePersist(cfg, newName);
                    playSuccessSound();
                    const dropdown = node.layoutMap?.themeManagementRegion?.dropdownTheme;
                    if (dropdown) dropdown.items = Object.keys(cfg.themes);
                    handleThemeDropdownChange(node, newName, updateThemeLayoutFn);
                    showBastaMessage(node, `Theme renamed to '${newName}'`, 2000, { width: 250 }, "btnThemeRename", false, "success");
                } catch (err) {
                    showBastaMessage(node, "Rename failed!", 3000, { width: 250 }, "btnThemeRename", false, "error");
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
                    await fetch("/xcp/save/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newName, data: newThemeData })
                    });
                    cfg.themes[newName] = newThemeData;
                    const dropdown = node.layoutMap?.themeManagementRegion?.dropdownTheme;
                    if (dropdown) dropdown.items = Object.keys(cfg.themes);
                    handleThemeDropdownChange(node, newName, updateThemeLayoutFn);
                    playSuccessSound();
                    showBastaMessage(node, `Theme copied as '${newName}'`, 2000, { width: 250 }, "btnThemeCopy", false, "success");
                } catch (err) {
                    showBastaMessage(node, "Save failed!", 3000, { width: 250 }, "btnThemeCopy", false, "error");
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

    showBastaFileHandler(node, "themes", "btnThemeSave", {
        title: "Save Configuration",
        mode: "save",
        message: "Save all changes to theme file?",
        onConfirm: async () => {
            try {
                const themeName = node._selectedThemeName;
                cfg.themes[themeName] = JSON.parse(JSON.stringify(node.themeToEdit));
                safePersist(cfg, themeName);
                await fetch("/xcp/save/themes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: themeName, data: cfg.themes[themeName] })
                });
                playSuccessSound();
                showBastaMessage(node, "Configuration saved successfully!", 2000, { width: 250 }, "btnThemeSave", false, "success");
            } catch (err) {
                showBastaMessage(node, "Save failed!", 3000, { width: 250 }, "btnThemeSave", false, "error");
                console.error("Theme Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};