/**
 * Path: ./nodes/themeManager_keyHandler.js
 * Specialist: Key-Level Actions & Main Edit Region Properties
 */
import { app } from "../../../../scripts/app.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { showBastaPalette, getPaletteId } from "../../fatha/bastas/bastaPalette.js";
import { activeBastas } from "../../fatha/basta.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { playKaChing } from "../../herbina/masterSoundEffects.js";
import { safeClick, safePersist, playSuccessSound } from "../themeManagerV2_core.js";

export function pushThemeUpdate(node, key, prop, val) {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg || !node._selectedThemeName) return;

    if (prop.toLowerCase().includes("lock")) return; // STRICTER CATCH

    cfg.themes[node._selectedThemeName][key][prop] = val;

    // FATHA FIX: Clear local and global layout caches to allow for text-driven expansion
    if (node.layout) node.layout._lastCacheKey = "";
    Object.values(app.graph._nodes).forEach(n => {
        if (n?.onThemeUpdate) n.onThemeUpdate(cfg);
        if (n.layout) n.layout._lastCacheKey = "";
    });
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

    if (isTextKey) {
        const rawFont = keyData.font || "Arial";
        // Re-apply the dot visually if the font is in the safe list
        const safeFonts = ["DengXian", "DengXian Light", "Arial", "Verdana", "Tahoma", "Trebuchet MS", "Times New Roman", "Georgia", "Garamond", "Courier New"];
        mReg.dropdownFonts.value = safeFonts.includes(rawFont) ? `• ${rawFont}` : rawFont;
        mReg.promptFontSize.value = (keyData.fontSize || 10).toString();
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

        node.themeToEdit[val].font = cleanFont;
        if (node.properties.pushChanges) pushThemeUpdate(node, val, "font", cleanFont);

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
    const remainingKeys = Object.keys(node.themeToEdit).filter(k => k !== "_category");
    const safeKey = newKey || remainingKeys[0] || "";
    if (dropdown) {
        dropdown.items = remainingKeys;
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
            showBastaMessage(node, `Key '${currentKey}' deleted.`, 2000, { width: 250 }, "btnKeyDelete", false, "success");
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
                playKaChing();
                showBastaMessage(node, `Key renamed to '${newName}'.`, 2000, { width: 250 }, "btnKeyRename", false, "success");
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
                playSuccessSound();
                showBastaMessage(node, `Key copied as '${newName}'.`, 2000, { width: 250 }, "btnKeyCopy", false, "success");
            }
            node.requestDerpSync();
        }
    });
};

export const handleKeySaveAction = (node, updateThemeLayoutFn) => {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg || !node._selectedThemeName) return;

    showBastaFileHandler(node, "none", "btnKeySave", {
        title: "Save Theme Keys",
        mode: "save",
        message: `Save keys to theme '${node._selectedThemeName}'?`,
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
                if (node.layout) node.layout._lastCacheKey = "";
                showBastaMessage(node, "Keys Saved", 2000, { width: 250 }, "btnKeySave", false, "success");
            } catch (err) {
                showBastaMessage(node, "Save Failed", 3000, { width: 250 }, "btnKeySave", false, "error");
                console.error("Key Save Error:", err);
            }
            node.requestDerpSync();
        }
    });
};