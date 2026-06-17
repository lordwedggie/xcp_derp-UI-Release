/**
 * Path: ./nodes/themeManager_keyHandler.js
 * Specialist: Key-Level Actions & Main Edit Region Properties
 */
import { app } from "../../../../scripts/app.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { showBastaPalette, getPaletteId } from "../../fatha/bastas/bastaPalette.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { playKaChing } from "../../herbina/masterSoundEffects.js";
import { generateKeyHash } from "./themeDataUtils.js";
import { safeClick, safePersist, playSuccessSound } from "../themeManagerV2_core.js";

const THEME_META_KEYS = new Set(["Category", "_category", "_layout", "_palette"]);
const FONT_WEIGHT_OPTIONS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

function mapThemeKeyPickerItem(key, dirtyKeyNames) {
    return {
        value: key,
        display: `${dirtyKeyNames?.has(key) ? "* " : ""}${key}`,
    };
}

function normalizeFontWeight(weight) {
    const val = String(weight || "normal");
    if (val === "normal") return "400";
    if (val === "bold") return "700";
    return FONT_WEIGHT_OPTIONS.includes(val) ? val : "400";
}

function resolveFontWeightOptions(node, font) {
    const weights = node?._fontWeightMap?.[font];
    if (Array.isArray(weights) && weights.length > 0) return weights;
    return FONT_WEIGHT_OPTIONS;
}

function nearestFontWeight(weight, options) {
    const normalized = normalizeFontWeight(weight);
    if (options.includes(normalized)) return normalized;
    const target = Number(normalized);
    return options.reduce((best, curr) => {
        return Math.abs(Number(curr) - target) < Math.abs(Number(best) - target) ? curr : best;
    }, options[0] || "400");
}

export function pushThemeUpdate(node, key, prop, val) {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg || !node._selectedThemeName) return;

    if (prop.toLowerCase().includes("lock")) return; // STRICTER CATCH

    cfg.themes[node._selectedThemeName][key][prop] = val;
    if (cfg.touchTheme) cfg.touchTheme(node._selectedThemeName);

    // Directly update save button pulse state
    const isMeta = THEME_META_KEYS.has(key);
    const baselines = cfg._allBaselines?.[node._selectedThemeName] || {};

    if (isMeta) {
        // Meta keys: compare with JSON.stringify, pulse theme save only
        const currentData = cfg.themes[node._selectedThemeName]?.[key];
        const currentHash = currentData ? JSON.stringify(currentData) : "";
        const isDirty = (currentHash !== baselines[key]);
        node._isThemeDirty = isDirty;
        const tm = node.layoutMap?.themeManagementRegion;
        if (tm?.btnThemeSave) tm.btnThemeSave.pulse = isDirty;
    } else if (key === node._selectedKeyName) {
        // Regular keys: compare with generateKeyHash, pulse both buttons
        const currentData = node.themeToEdit?.[key];
        const currentHash = currentData ? generateKeyHash(currentData) : "";
        const isDirty = (currentHash !== baselines[key]);
        node._isSelectedKeyDirty = isDirty;
        node._isThemeDirty = isDirty;
        if (isDirty) {
            if (node._dirtyKeyNames) node._dirtyKeyNames.add(key);
        } else {
            if (node._dirtyKeyNames) node._dirtyKeyNames.delete(key);
        }
        const tm = node.layoutMap?.themeManagementRegion;
        if (tm?.btnThemeSave) tm.btnThemeSave.pulse = isDirty;
        const km = node.layoutMap?.keyManagementRegion;
        if (km?.btnKeySave) km.btnKeySave.pulse = isDirty;
    }

    // FATHA FIX: Clear local and global layout caches to allow for text-driven expansion
    if (node.layout) node.layout._lastCacheKey = "";
    if (cfg.notifyTheme) cfg.notifyTheme(node._selectedThemeName);
}

export function updateMainEditRegion(node) {
    if (!node.layoutMap) return;
    const val = node._selectedKeyName;
    if (!val) return;

    const isTextKey = val.startsWith("t_");
    const keyData = node.themeToEdit[val] || {};
    const mReg = node.layoutMap.mainEditRegion;

    // Toggle Font vs Corner visibility without overwriting original types from layoutMap
    mReg.lblCorners.hidden = isTextKey;
    mReg.promptCorners.hidden = isTextKey;

    // THE FIX: Hide the layoutMap spring when a text key is selected
    if (mReg.spring) mReg.spring.hidden = isTextKey;

    mReg.lblFonts.hidden = !isTextKey;
    mReg.dropdownFonts.hidden = !isTextKey;
    mReg.lblFontSize.hidden = !isTextKey;
    mReg.promptFontSize.hidden = !isTextKey;
    mReg.lblFontWeight.hidden = !isTextKey;
    mReg.dropdownFontWeight.hidden = !isTextKey;

    if (isTextKey) {
        const rawFont = keyData.font || "Arial";
        const rawWeight = keyData.fontWeight || "normal";
        const weightOptions = resolveFontWeightOptions(node, rawFont);
        const resolvedWeight = nearestFontWeight(rawWeight, weightOptions);
        // Re-apply the dot visually if the font is in the safe list
        const safeFonts = ["Inter", "DengXian Light", "DengXian", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Times New Roman", "Georgia", "Garamond", "Courier New"];
        mReg.dropdownFonts.value = safeFonts.includes(rawFont) ? `• ${rawFont}` : rawFont;
        mReg.promptFontSize.value = (keyData.fontSize || 10).toString();
        mReg.dropdownFontWeight.items = weightOptions;
        mReg.dropdownFontWeight.value = resolvedWeight;
    } else {
        mReg.promptCorners.value = JSON.stringify(keyData.corners || [0,0,0,0]).slice(1, -1);
    }
}

export function bindKeyMainEvents(node, updateThemeLayoutFn) {
    if (!node.layoutMap) return;

    // 2. Static Key Management Events
    const kReg = node.layoutMap.keyManagementRegion;
    if (kReg) {
        kReg.btnKeyDelete.onClick = safeClick(() => handleKeyDeleteAction(node, updateThemeLayoutFn));
        kReg.dropdownKey.onChange = (val) => handleKeyDropdownChange(node, val, updateThemeLayoutFn);
        kReg.btnKeyRename.onClick = safeClick(() => handleKeyRenameAction(node, updateThemeLayoutFn));
        kReg.btnKeyCopy.onClick = safeClick(() => handleKeyCopyAction(node, updateThemeLayoutFn));
        kReg.btnKeySave.onClick = safeClick(() => handleKeySaveAction(node, updateThemeLayoutFn));
        if (kReg.btnPaletteDesigner) {
            kReg.btnPaletteDesigner.onClick = safeClick(() => {
                showBastaPalette(node, "btnPaletteDesigner");
                if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            });
        }
    }

    // 3. Color Key Edit Events (Main edit region only)
    const mReg = node.layoutMap.mainEditRegion;
    if (mReg?.mainColorEdit) {
        // THE BASTA TRANSITION: Use the new canvas-based color designer for the main key
        mReg.mainColorEdit.onColorClick = (base, exactKey) => {
            const safeHost = Object.create(node);
            safeHost._designerEditHost = node;
            safeHost.themeToEdit = node.themeToEdit;
            safeHost._selectedKeyName = node._selectedKeyName;
            safeHost._selectedThemeName = "__PALETTE_LOCAL__";
            safeHost.requestDerpSync = () => node.requestDerpSync();
            showBastaColorDesigner(safeHost, exactKey, "mainColorEdit");
        };
    }
    // THE FIX: Fallback binding in case the button was actually placed in the Main Edit Region
    if (mReg && mReg.btnPaletteDesigner) {
        mReg.btnPaletteDesigner.onClick = safeClick(() => {
            // THE BASTA TRANSITION: Open the singleton movable palette (Removed the dubious trailing comma)
            showBastaPalette(node, "btnPaletteDesigner");
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
        });
    }
    mReg.dropdownFonts.onChange = (f) => {
        const val = node._selectedKeyName;
        const cleanFont = f.startsWith("• ") ? f.replace("• ", "") : f; // Strip visual indicator before saving
        const weightOptions = resolveFontWeightOptions(node, cleanFont);
        const nextWeight = nearestFontWeight(node.themeToEdit[val].fontWeight, weightOptions);

        node.themeToEdit[val].font = cleanFont;
        node.themeToEdit[val].fontWeight = nextWeight;
        if (node.properties.pushChanges) pushThemeUpdate(node, val, "font", cleanFont);
        if (node.properties.pushChanges) pushThemeUpdate(node, val, "fontWeight", nextWeight);
        if (mReg.dropdownFontWeight) {
            mReg.dropdownFontWeight.items = weightOptions;
            mReg.dropdownFontWeight.value = nextWeight;
        }

        updateThemeLayoutFn(node);
        node.requestDerpSync();
    };

    const updateFontSize = (v) => {
        const num = parseInt(v);
        if (!isNaN(num)) {
            const key = node._selectedKeyName;
            node.themeToEdit[key].fontSize = num;
            if (node.properties.pushChanges) pushThemeUpdate(node, key, "fontSize", num);
            updateThemeLayoutFn(node);
            node.requestDerpSync();
        }
    };

    mReg.dropdownFontWeight.onChange = (weight) => {
        const key = node._selectedKeyName;
        if (!key || !node.themeToEdit?.[key]) return;
        const weightOptions = resolveFontWeightOptions(node, node.themeToEdit[key].font || "Arial");
        const cleanWeight = weightOptions.includes(String(weight)) ? String(weight) : nearestFontWeight(weight, weightOptions);
        node.themeToEdit[key].fontWeight = cleanWeight;
        if (node.properties.pushChanges) pushThemeUpdate(node, key, "fontWeight", cleanWeight);
        updateThemeLayoutFn(node);
        node.requestDerpSync();
    };

    const updateCorners = (v, isBlur = false) => {
        const parts = v.split(',').map(s => s.trim()).filter(s => s !== "").map(Number);
        const key = node._selectedKeyName;
        let finalCorners = null;

        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
            finalCorners = parts;
        } else if (isBlur && parts.length === 1 && !isNaN(parts[0])) {
            finalCorners = [parts[0], parts[0], parts[0], parts[0]];
        }

        if (finalCorners) {
            node.themeToEdit[key].corners = finalCorners;
            if (node.properties.pushChanges) pushThemeUpdate(node, key, "corners", finalCorners);
            updateThemeLayoutFn(node);
            node.requestDerpSync();
        }
    };

    mReg.promptCorners.onInput = (v) => updateCorners(v, false);
    mReg.promptCorners.onBlur = (v) => updateCorners(v, true);
    mReg.promptFontSize.onInput = (v) => updateFontSize(v);
    mReg.promptFontSize.onBlur = (v) => updateFontSize(v);
}

const syncAndPersistKey = async (node, newKey, updateThemeLayoutFn) => {
    const cfg = window.xcpDerpThemeConfig;
    const themeName = node._selectedThemeName;
    if (cfg && themeName) {
        cfg.themes[themeName] = JSON.parse(JSON.stringify(node.themeToEdit));

        // 1. Hygiene pass: Scrub locks and sort keys
        safePersist(cfg, themeName);

        // 2. THE DISK FIX: Explicitly trigger the network IO to the Python server
        await fetch("/xcp/save/themes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: themeName, data: cfg.themes[themeName] })
        });
    }
    const dropdown = node.layoutMap?.keyManagementRegion?.dropdownKey;
    const remainingKeys = Object.keys(node.themeToEdit).filter(k => !THEME_META_KEYS.has(k));
    const safeKey = newKey || remainingKeys[0] || "";
    if (dropdown) {
        dropdown.items = remainingKeys.map(k => mapThemeKeyPickerItem(k, node._dirtyKeyNames));
        dropdown.value = safeKey;
    }
    node._selectedKeyName = safeKey;
    node.properties.selectedKeyName = safeKey; // THE REFRESH FIX: Keep property in sync during delete/rename
    updateThemeLayoutFn(node);
};

export const handleKeyDeleteAction = (node, updateThemeLayoutFn) => {
    const currentKey = node._selectedKeyName || Object.keys(node.themeToEdit)[0];
    if (!currentKey) return;

    showBastaFileHandler(node, "none", "btnKeyDelete", {
        title: "Delete Theme Key",
        mode: "delete",
        message: `Delete key '${currentKey}'?`,
        onConfirm: async () => {
            delete node.themeToEdit[currentKey];
            await syncAndPersistKey(node, null, updateThemeLayoutFn);
            showBastaSystemMessage(node, "Key Deleted: ", 2000, { fade: true, grow: true }, "btnKeyDelete", "critical", null, currentKey);
            node.requestDerpSync();
        }
    });
};

export const handleKeyDropdownChange = (node, val, updateThemeLayoutFn) => {
    node._selectedKeyName = val;
    node.properties.selectedKeyName = val;
    if (node.layoutMap?.keyManagementRegion?.dropdownKey) {
        node.layoutMap.keyManagementRegion.dropdownKey.value = val;
    }
    updateThemeLayoutFn(node);
    node.requestDerpSync();
};

export const handleKeyRenameAction = (node, updateThemeLayoutFn) => {
    const currentKey = node._selectedKeyName || Object.keys(node.themeToEdit)[0];
    if (!currentKey) return;

    showBastaFileHandler(node, "none", "btnKeyRename", {
        title: "Rename Theme Key",
        mode: "rename",
        message: "Enter new name for key:",
        originalName: currentKey,
        fileList: Object.keys(node.themeToEdit),
        onConfirm: async (newName) => {
            if (newName && newName !== currentKey) {
                node.themeToEdit[newName] = node.themeToEdit[currentKey];
                delete node.themeToEdit[currentKey];
                await syncAndPersistKey(node, newName, updateThemeLayoutFn);
                showBastaSystemMessage(node, "Key Renamed: ", 2000, { fade: true, grow: true }, "btnKeyRename", "success", null, newName);
            }
            node.requestDerpSync();
        }
    });
};

export const handleKeyCopyAction = (node, updateThemeLayoutFn) => {
    const currentKey = node._selectedKeyName || Object.keys(node.themeToEdit)[0];
    if (!currentKey) return;

    showBastaFileHandler(node, "none", "btnKeyCopy", {
        title: "Copy Theme Key",
        mode: "duplicate",
        message: "Enter name for key copy:",
        originalName: `${currentKey}_copy`,
        fileList: Object.keys(node.themeToEdit),
        onConfirm: async (newName) => {
            if (newName) {
                node.themeToEdit[newName] = JSON.parse(JSON.stringify(node.themeToEdit[currentKey]));
                await syncAndPersistKey(node, newName, updateThemeLayoutFn);
                showBastaSystemMessage(node, "Key Copied: ", 2000, { fade: true, grow: true }, "btnKeyCopy", "warning", null, newName);
            }
            node.requestDerpSync();
        }
    });
};

export const handleKeySaveAction = (node, updateThemeLayoutFn) => {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg || !node._selectedThemeName) return;
    const currentKey = node._selectedKeyName || Object.keys(node.themeToEdit || {}).find(k => !THEME_META_KEYS.has(k)) || "";

    showBastaFileHandler(node, "none", "btnKeySave", {
        title: "Save Theme Keys",
        mode: "save",
        message: `Save keys to theme '${node._selectedThemeName}'?`,
        originalName: currentKey,
        fileList: Object.keys(node.themeToEdit || {}).filter(k => !THEME_META_KEYS.has(k)),
        onConfirm: async () => {
            try {
                const themeName = node._selectedThemeName;
                cfg.themes[themeName] = JSON.parse(JSON.stringify(node.themeToEdit));
                safePersist(cfg, themeName);

                // Re-capture baseline and clear dirty state after save
                if (cfg.refreshBaselines) cfg.refreshBaselines(true, themeName);
                node._isSelectedKeyDirty = false;
                node._isThemeDirty = false;
                node._dirtyKeyNames = new Set();
                node._layoutMapHash = null;
                if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();

                if (node.layout) node.layout._lastCacheKey = "";
                showBastaSystemMessage(node, "Key Saved: ", 2000, { fade: true, grow: true }, "btnKeySave", "warning", null, currentKey);
            } catch (err) {
                showBastaSystemMessage(node, "Save Failed", 3000, { fade: true, grow: true }, "btnKeySave", "error", null, "");
                console.error("Key Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};
