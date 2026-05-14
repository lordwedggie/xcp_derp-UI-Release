/**
 * Path: ./js/fatha/bastas/bastaPalette.js
 * ROLE: A general-purpose container Basta adapted to the new framework skeleton.
 * INTEGRATION: Inherits Header/Footer logic from bastaLayoutMaps.js.
 * STATUS: FIX APPLIED - Theme context injection added.
 */
import { spawnBasta } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { showBastaColorDesigner } from "./bastaColorDesigner.js";
import { showBastaMessage } from "./bastaMessage.js";
import { showBastaFileHandler } from "./bastaFileHandler.js";
import { colorPulse2, parseColor } from "../../herbina/masterAnimator.js";
import { resolvePaintData } from "../../herbina/utils/widgetsUtils.js";

// THE DEFAULT EFFECT KEYS: Fallback values if the loaded JSON is missing effect data
const DEFAULT_SHADOW = { _ON: [0, 0, 0, 0.5], _OFF: [0, 0, 0, 0.5], _DIS: [0, 0, 0, 0.5] };
const DEFAULT_STROKE = { _ON: [0, 0, 0, 1], _OFF: [0, 0, 0, 1], _DIS: [0, 0, 0, 1] };
const DEFAULT_GLOW = { _ON: [0, 255, 255, 0.5], _OFF: [0, 255, 255, 0.5], _DIS: [0, 255, 255, 0.5] };

const getPaletteHash = (palettes, effects) => {
    if (!palettes) return JSON.stringify({ palettes: [], effects: !!effects });
    try {
        const palettesToHash = JSON.parse(JSON.stringify(palettes));
        palettesToHash.forEach(p => {
            if (p.showShadow === false && p.entries) delete p.entries.shadow;
            if (p.showStroke === false && p.entries) delete p.entries.stroke;
            if (p.showGlow === false && p.entries) delete p.entries.glow;
            if (p.entries) {
                Object.values(p.entries).forEach(entry => {
                    if (entry && typeof entry === 'object') {
                        // THE NESTED PURGE: Clean lock variables from state-specific color arrays
                        ["_ON", "_OFF", "_DIS"].forEach(s => { if (entry[s]) { delete entry[s]._lockL; delete entry[s]._lockR; } });
                        delete entry._lockL; delete entry._lockR;
                    }
                });
            }
            delete p.showShadow; delete p.showStroke; delete p.showGlow;
            delete p._lockL; delete p._lockR;
        });
        return JSON.stringify({ palettes: palettesToHash, effects: !!effects });
    } catch (e) {
        return "";
    }
};

function invalidatePaletteControls(basta, keys = ["browserPalette", "dropdownKeys"], options = {}) {
    basta._layoutDirty = true;
    basta._forceSync = true;
    if (basta.layout) basta.layout._lastCacheKey = "";
    keys.forEach(key => {
        if (basta._fileBrowserCache) delete basta._fileBrowserCache[key];
        if (basta._compDataCache) delete basta._compDataCache[key];
        const el = basta._derpDomElements?.[key];
        if (el) {
            el._lastStateHash = "";
            el._lastSyncKey = "";
            el._lastProps = null;
        }
    });
    if (options.request !== false) basta.requestDerpSync();
}

function refreshPaletteLayout(basta, options = {}) {
    invalidatePaletteControls(basta, [
        "browserPalette",
        "toggleEffectsKeys",
        "shadowRegion",
        "strokeRegion",
        "glowRegion",
        "colorkeyShadow",
        "colorkeyStroke",
        "colorkeyGlow",
        "dropdownKeys",
        "keysFromFile",
        "lblFileShadow",
        "lblFileStroke",
        "lblFileGlow",
        "fileShadowContainer",
        "fileStrokeContainer",
        "fileGlowContainer",
        "fileMain",
        "fileShadow",
        "fileStroke",
        "fileGlow",
    ], options);
}

function normalizePaletteName(name) {
    return String(name || "").replace(/\\/g, "/");
}

function applyPaletteFileList(basta, items, options = {}) {
    basta._paletteList = (items || []).map(item => String(item || "").replace(/\\/g, "/"));
    invalidatePaletteControls(basta, ["browserPalette"], options);
}

async function refreshPaletteFileList(basta, options = {}) {
    try {
        const res = await fetch(`/xcp/list/palettes?t=${Date.now()}`);
        if (!res.ok) throw new Error(`Palette list failed with status ${res.status}`);
        const data = await res.json();
        applyPaletteFileList(basta, data.items, options);
    } catch (e) {
        console.error("[Palette Manager] Palette List Error:", e);
        if (options.showError) showBastaMessage(basta, "Palette List Error", 3000, { width: 250 }, options.anchor || false, false, "error");
    }
}

/**
 * THE ID PROTOCOL: Centralized ID generator for global singleton checks.
 >>>>
 */
export const getPaletteId = () => `basta_palette_global_singleton`;

/**
 * showBastaPalette: Spawns or updates the Palette singleton.
 * @param {Object} host - The Fatha/Uncle node calling the basta.
 * @param {string} targetRegion - The layout region key to anchor the basta to.
 */
export function showBastaPalette(host, targetRegion = null) {
    const id = getPaletteId();

    const config = {
        host: host,
        titleLabel: "Palette Manager",
        autoSize: true,
        targetRegion: (host && host.properties && host.properties[`bastaOffset_${id}`]) ? null : targetRegion,
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            explicitCloseOnly: true,
            explicitCloseReasons: ["headerButton", "footerButton"],
            autoWidth: false,
            snapHeight: false
        },
        initialSize: [200, 200],     // Default dimensions

        /**
         * THE FUNCTIONAL MAP: Injects custom content into the base skeleton.
         * Reactive to theme-level variables (mW, mH, etc).
         */
        layoutMap: (basta, vars) => {
            const { mW, mH, sW, sH, pW, pH, oY } = vars;
            const includeEffects = basta.properties.includeEffectKeys || false;
            const hasFile = !!basta.properties.activePaletteName;

            // THE CHANGE DETECTION: Compare current state vs stored baseline
            const currentHash = getPaletteHash(basta._availablePalettes, basta.properties.includeEffectKeys);
            const hasChanges = basta._lastFileHash && (basta._lastFileHash !== currentHash);

            // THE SAVE PULSE: Pulse logic for save buttons if changes are detected
            let pulsedSaveColor = null;
            if (hasChanges && (window.xcpDerpSettings?.useAnimations !== false)) {
                if (!basta._savePulseColors) {
                    const paintDIS = resolvePaintData(basta, "button", "_DIS");
                    const paintON = resolvePaintData(basta, "button", "_ON");
                    basta._savePulseColors = { a: parseColor(paintDIS?.fill), b: parseColor(paintON?.fill) };
                }
                pulsedSaveColor = colorPulse2(basta._savePulseColors.a, basta._savePulseColors.b, 0.005);
                basta._derpAwakeFrames = 2;
            }
            const openDesigner = (targetTheme, keyName, exactKey, persistentKey) => {
                const safeHost = Object.create(host || basta); // FIXED: Changed hostNode to host
                safeHost.themeToEdit = targetTheme;
                safeHost._selectedKeyName = keyName;
                safeHost._selectedThemeName = "__PALETTE_LOCAL__"; // Block designer from overwriting global theme config
                safeHost.requestDerpSync = () => basta.requestDerpSync();
                showBastaColorDesigner(safeHost, exactKey, persistentKey);
            };

            const contentRegions = {
                anchor: { target: "headerRegion", axis: "y", offset: oY },
                dir: "col", width: "full", height: "auto", margin: [mW, 0],
                toggleEffectsKeys: {
                    type: UI_TYPES.TOGGLE_V2, textThemeKey: ["dialog", "button", "t_textSmall"],
                    label: "Include effect keys", icon: "ring", width: "auto", height: "auto", padding: [pW, pH], spacing: [0, sH],
                    value: basta.properties.includeEffectKeys || false, isTextOnly: true, mouseOver: false,
                    onPress: () => {
                        basta.properties.includeEffectKeys = !basta.properties.includeEffectKeys;
                        refreshPaletteLayout(basta);
                    }
                },
                mainRegion: {
                    dir: "row", width: "full", height: "auto", spacing: [0, sH],
                    lblMain: { type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Main Colors", width: "auto", height: "auto", padding: [pW, pH], spacing: [sH, 0] },
                    mainPaletteContainer: {
                        dir: "col", width: "full", height: "auto",
                        colorkeyActive: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "colorkeyActive", colorSuffix: "", width: "full", height: 16,
                            onColorClick: (base, exactKey) => openDesigner(basta.themeToEdit, basta._selectedKeyName, exactKey, "colorkeyActive")
                        }
                    }
                },
            };

            if (includeEffects) {
                contentRegions.shadowRegion = {
                    dir: "row", width: "full", height: "auto", spacing: [0, sH],
                    lblShadow: { type: UI_TYPES.TEXT, themeKey: "t_textSmall", measureText: "Main Colors", text: "Shadows", width: "auto", height: "auto", padding: [pW, pH], spacing: [sH, 0] },
                    shadowPaletteContainer: {
                        dir: "col", width: "full", height: "auto",
                        colorkeyShadow: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "colorkeyShadow", colorSuffix: "shadow", width: "full", height: 16,
                            onColorClick: (base, exactKey) => openDesigner(basta.themeToEdit, basta._selectedKeyName, exactKey, "colorkeyShadow")
                        }
                    }
                };
                contentRegions.strokeRegion = {
                    dir: "row", width: "full", height: "auto", spacing: [0, sH],
                    lblStroke: { type: UI_TYPES.TEXT, themeKey: "t_textSmall", measureText: "Main Colors", text: "Strokes", width: "auto", height: "auto", padding: [pW, pH], spacing: [sH, 0] },
                    strokePaletteContainer: {
                        dir: "col", width: "full", height: "auto",
                        colorkeyStroke: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "colorkeyStroke", colorSuffix: "stroke", width: "full", height: 16,
                            onColorClick: (base, exactKey) => openDesigner(basta.themeToEdit, basta._selectedKeyName, exactKey, "colorkeyStroke")
                        }
                    }
                };
                contentRegions.glowRegion = {
                    dir: "row", width: "full", height: "auto", spacing: [0, sH],
                    lblGlow: { type: UI_TYPES.TEXT, themeKey: "t_textSmall", measureText: "Main Colors", text: "Glows", width: "auto", height: "auto", padding: [pW, pH], spacing: [sH, 0] },
                    glowPaletteContainer: {
                        dir: "col", width: "full", height: "auto",
                        colorkeyGlow: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "colorkeyGlow", colorSuffix: "glow", width: "full", height: 16,
                            onColorClick: (base, exactKey) => openDesigner(basta.themeToEdit, basta._selectedKeyName, exactKey, "colorkeyGlow")
                        }
                    }
                };
            }

            // THE FULL-WIDTH FIX: Moving the separator outside the 'includeEffects' block makes it always visible.
            // Using a negative mW (Left/Right margin) cancels out the parent container's margin,
            // allowing the line to span the entire physical width of the node.
            contentRegions.seperator = {
                type: UI_TYPES.LINEBREAK, themeKey: "panel",
                width: "full", height: 1, margin: [0, mH]
            };

            contentRegions.paletteHandling = {
                dir: "row", width: "full", height: "auto", margin: [0, mH], spacing: [sW, 0],
                btnRename: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textBig",
                    icon: "rename", width: "match", height: "fill", spacing: [sW, 0],
                    state: hasFile ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "palettes", "btnRename", {
                        title: `Rename palette ${basta.properties.activePaletteName || ""}`,
                        message: "Enter new name for palette:",
                        confirm: "Rename",
                        warning: "Duplicate name for palette file!",
                        mode: "rename"
                    })
                },
                btnCopy: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "copy", width: "match", height: "fill", spacing: [sW, 0],
                    state: hasFile ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "palettes", "btnCopy", {
                        title: `Duplicate palette ${basta.properties.activePaletteName || ""}`,
                        message: "Enter name for new palette copy:",
                        confirm: "Duplicate",
                        warning: "File already exists!",
                        mode: "duplicate"
                    })
                },
                btnOpenFolder: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "file", width: "match", height: "fill", spacing: [sW, 0],
                    state: "OFF",
                    onPress: () => fetch("/xcp/open_folder?name=palettes")
                },
                browserPalette: {
                    type: UI_TYPES.FILEBROWSER, themeKey: "dialog, t_textNormal",  displayMode: "cutoff",
                    text: (basta.properties.activePaletteName || "Load Palette File...").split(/[\\/]/).pop().replace(/\.json$/i, ""),
                    value: basta.properties.activePaletteName || "",
                    fileType: "palette", // THE ICON HINT: Enables the ❖ glyph in the browser list
                    items: basta._paletteList || [],
                    onChange: async (selectedFile) => {
                        const normalizedSelected = normalizePaletteName(selectedFile);
                        try {
                            // THE URL ENCODING FIX: Safely encode filenames containing spaces, quotes, or special characters for the GET request
                            const res = await fetch(`/xcp/load/palettes?name=${encodeURIComponent(normalizedSelected)}`);
                            if (!res.ok) {
                                throw new Error(`Palette load failed with status ${res.status}`);
                            }
                            const json = await res.json();
                            // THE COLLECTION LOAD: Extract palettes array from root object and sync effect toggle
                            basta.properties.activePaletteName = normalizedSelected;
                            basta._availablePalettes = json.data?.palettes || [];

                            // THE UI INITIALIZATION: Set default visibility flags and hydrate missing effect keys
                            basta._availablePalettes.forEach(p => {
                                const hasShadow = !!p.entries?.shadow;
                                const hasStroke = !!p.entries?.stroke;
                                const hasGlow = !!p.entries?.glow;

                                if (!p.entries) p.entries = {};
                                if (!hasShadow) p.entries.shadow = JSON.parse(JSON.stringify(DEFAULT_SHADOW));
                                if (!hasStroke) p.entries.stroke = JSON.parse(JSON.stringify(DEFAULT_STROKE));
                                if (!hasGlow) p.entries.glow = JSON.parse(JSON.stringify(DEFAULT_GLOW));

                                p.showShadow = p.showShadow ?? hasShadow;
                                p.showStroke = p.showStroke ?? hasStroke;
                                p.showGlow = p.showGlow ?? hasGlow;
                            });
                            basta.properties.includeEffectKeys = json.data?.effects === true;
                            basta._lastFileHash = getPaletteHash(basta._availablePalettes, basta.properties.includeEffectKeys);

                            basta.properties.activePaletteId = null;
                            basta._selectedPaletteEntry = null;
                        } catch (e) {
                            console.error("[Palette Manager] Collection Load Error:", e);
                            showBastaMessage(basta, "Load Failed", 3000, { width: 250 }, "browserPalette", false, "error");
                        }
                        refreshPaletteLayout(basta);
                    },
                    width: "full", height: 20, padding: [pW, pH],
                    canvasShield: true, spacing: [sW, 0],
                },
                btnDelete: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "trash", width: "match", height: "fill", spacing: [sW, 0],
                    state: hasFile ? "OFF" : "DIS",
                    onPress: () => {
                        const targetFile = basta.properties.activePaletteName;
                        showBastaFileHandler(basta, "palettes", "btnDelete", {
                            title: `Delete palette ${targetFile || ""}`,
                            message: `Permanently delete palette file: ${targetFile}?`,
                            confirm: "Delete",
                            mode: "delete",
                            originalName: targetFile,
                            onConfirm: async (nameToDelete) => {
                                try {
                                    const res = await fetch(`/xcp/delete/palettes`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ name: nameToDelete })
                                    });
                                    if (res.ok) {
                                        if (basta.onDeleteSuccess) basta.onDeleteSuccess(nameToDelete);
                                    } else {
                                        showBastaMessage(basta, "Delete Failed", 3000, { width: 250 }, "btnDelete", false, "error");
                                    }
                                } catch (e) {
                                    console.error("[Palette Manager] Delete Error:", e);
                                    showBastaMessage(basta, "Server Error", 3000, { width: 250 }, "btnDelete", false, "error");
                                }
                            }
                        });
                    }
                },
            };

            // Calculate the active display label for the entries within the loaded file
            // THE ID FORMATTER: Normalize 2-digit padding for IDs (01-99)
            const currentPal = (basta._availablePalettes || []).find(p => String(p.id).padStart(2, '0') === String(basta.properties.activePaletteId).padStart(2, '0'));
            const entryCount = (basta._availablePalettes || []).length;
            const activeDisplay = currentPal
                ? `${String(currentPal.id).padStart(2, '0')}: ${currentPal.name}`
                : (entryCount > 0 ? `${entryCount} Entries found` : "Select Entry...");

            contentRegions.keysHandling = {
                dir: "row", width: "full", height: "auto", margin: [0, mH], spacing: [sW, 0],
                btnRenameKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textBig",
                    icon: "rename", width: "match", height: "fill", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId) ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "none", "btnRenameKey", {
                        title: `Rename Entry: ${currentPal?.name || ""}`,
                        message: "Enter new name for color key entry:", confirm: "Rename", warning: "Entry name already exists!",
                        originalName: currentPal?.name,
                        fileList: (basta._availablePalettes || []).map(p => p.name),
                        onConfirm: async (newName) => {
                            if (currentPal) {
                                currentPal.name = newName;
                                showBastaMessage(basta, `Entry Renamed: ${newName}`, 3000, { fade: true, grow: true }, "btnRenameKey", false, "success");
                                refreshPaletteLayout(basta);
                            }
                        }
                    })
                },
                btnCopyKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "copy", width: "match", height: "fill", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId) ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "none", "btnCopyKey", {
                        title: `Duplicate Entry: ${currentPal?.name || ""}`,
                        message: "Enter name for new entry copy:", confirm: "Duplicate", warning: "Entry name already exists!",
                        mode: "duplicate",
                        originalName: currentPal?.name,
                        fileList: (basta._availablePalettes || []).map(p => p.name),
                        onConfirm: async (newName) => {
                            if (currentPal) {
                                const newEntry = JSON.parse(JSON.stringify(currentPal));
                                // THE ID FIX: Find max ID in current collection and increment
                                const maxId = Math.max(0, ...(basta._availablePalettes || []).map(p => parseInt(p.id) || 0));
                                newEntry.id = maxId + 1;
                                newEntry.name = newName;
                                basta._availablePalettes.push(newEntry);
                                basta.properties.activePaletteId = newEntry.id;
                                basta._selectedPaletteEntry = newEntry;
                                showBastaMessage(basta, `Entry Duplicated: ${newName}`, 3000, { fade: true, grow: true }, "btnCopyKey", false, "success");
                                refreshPaletteLayout(basta);
                            }
                        }
                    })
                },
                btnSaveKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "save", width: "match", height: "fill", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId && hasChanges) ? "OFF" : "DIS",
                    btnColor: pulsedSaveColor,
                    onPress: async () => {
                        const fileName = basta.properties.activePaletteName;
                        if (!fileName || !basta._availablePalettes) return;

                        const palettesToSave = JSON.parse(JSON.stringify(basta._availablePalettes));
                        palettesToSave.forEach(p => {
                            if (p.showShadow === false) delete p.entries.shadow;
                            if (p.showStroke === false) delete p.entries.stroke;
                            if (p.showGlow === false) delete p.entries.glow;
                            // THE NESTED LOCK FIX: Purge legacy variables from all color entries (main, shadow, etc)
                            if (p.entries) {
                                Object.values(p.entries).forEach(entry => {
                                    if (entry && typeof entry === 'object') {
                                        ["_ON", "_OFF", "_DIS"].forEach(s => { if (entry[s]) { delete entry[s]._lockL; delete entry[s]._lockR; } });
                                        delete entry._lockL; delete entry._lockR;
                                    }
                                });
                            }
                            delete p.showShadow; delete p.showStroke; delete p.showGlow;
                            delete p._lockL; delete p._lockR;
                        });

                        try {
                            const res = await fetch(`/xcp/save/palettes`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    name: fileName,
                                    data: {
                                        effects: basta.properties.includeEffectKeys,
                                        palettes: palettesToSave
                                    }
                                })
                            });
                            if (res.ok) {
                                basta._lastFileHash = currentHash;
                                showBastaMessage(basta, `Collection Saved`, 3000, { fade: true, grow: true }, "btnSaveKey", false, "success");
                                refreshPaletteLayout(basta);
                            } else {
                                showBastaMessage(basta, "Save Failed", 3000, { fade: true, grow: true }, "btnSaveKey", false, "error");
                            }
                        } catch (e) {
                            console.error(e);
                            showBastaMessage(basta, "Save Error", 3000, { fade: true, grow: true }, "btnSaveKey", false, "error");
                        }
                    }
                },
                dropdownKeys: {
                    type: UI_TYPES.DROPDOWN_DERP, themeKey: "button, t_textNormal",  displayMode: "cutoff",
                    width: "full", height: 20, padding: [pW, pH], spacing: [sW, 0],
                    state: basta.properties.activePaletteName ? "OFF" : "DIS",
                    items: (basta._availablePalettes || []).map(p => `${String(p.id).padStart(2, '0')}: ${p.name}`),
                    value: activeDisplay,
                    text: activeDisplay,
                    onChange: (val) => {
                        const palette = (basta._availablePalettes || []).find(p => `${String(p.id).padStart(2, '0')}: ${p.name}` === val);
                        if (palette) {
                            basta.properties.activePaletteId = palette.id;
                            // THE PREVIEW BINDING: Assign the specific JSON entry to the preview storage
                            basta._selectedPaletteEntry = palette;
                            refreshPaletteLayout(basta);
                        }
                    },
                    canvasShield: true
                },
                btnDeleteKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "trash", width: "match", height: "fill", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId) ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "none", "btnDeleteKey", {
                        title: `Delete Entry: ${currentPal?.name || ""}`,
                        message: `Permanently delete entry: ${currentPal?.name}?`, confirm: "Delete",
                        mode: "delete",
                        onConfirm: async () => {
                            if (currentPal) {
                                basta._availablePalettes = basta._availablePalettes.filter(p => p.id !== currentPal.id);
                                basta.properties.activePaletteId = null;
                                basta._selectedPaletteEntry = null;
                                showBastaMessage(basta, "Entry Deleted", 3000, { fade: true, grow: true }, "btnDeleteKey", false, "success");
                                refreshPaletteLayout(basta);
                            }
                        }
                    })
                },
            };

            // THE FILE PREVIEW REGION: Directly bound to the loaded entry reference to allow persistent drag-drops
            const palEntry = basta._selectedPaletteEntry;

            contentRegions.keysFromFile = {
                hidden: !palEntry,
                dir: "col", width: "full", height: "auto", spacing: [0, sH],
                fileMainRow: {
                    dir: "row", width: "full", height: "auto",
                    lblFileMain: { type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Main Colors",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0] },
                    fileMainContainer: {
                        dir: "col", width: "full", height: "auto",
                        fileMain: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", width: "full", height: 16,
                            key: "fileMain",
                            colorSuffix: "",
                            themeToEdit: palEntry?.entries,
                            _selectedKeyName: "main",
                            onColorClick: (base, exactKey) => openDesigner(palEntry.entries, "main", exactKey, "fileMain")
                        }
                    }
                },
                fileShadowRow: {
                    hidden: !includeEffects,
                    anchor: { target: "fileMainRow", axis: "y", offset: sH },
                    dir: "row", width: "full", height: "auto", margin: [0, 0],
                    lblFileShadow: {
                        type: UI_TYPES.TOGGLE_V2, textThemeKey: ["dialog", "button", "t_textSmall"],
                        measureText: "Shadow", text: "Shadow",
                        width: "auto", height: "auto", padding: [1, pH],
                        isTextOnly: true, mouseOver: false,
                        // THE NULL GUARD: Prevent crash if no entry is currently selected
                        value: palEntry?.showShadow ?? !!palEntry?.entries?.shadow,
                        onPress: () => { if (palEntry) { const cur = palEntry.showShadow ?? !!palEntry?.entries?.shadow; palEntry.showShadow = !cur; refreshPaletteLayout(basta); } }
                    },
                    fileShadowContainer: {
                        hidden: !(palEntry?.showShadow ?? !!palEntry?.entries?.shadow),
                        dir: "col", width: "full", height: "auto",
                        fileShadow: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", width: "full", height: 16,
                            key: "fileShadow",
                            colorSuffix: "",
                            themeToEdit: palEntry?.entries,
                            _selectedKeyName: "shadow",
                            onColorClick: (base, exactKey) => openDesigner(palEntry.entries, "shadow", exactKey, "fileShadow")
                        }
                    }
                },
                fileStrokeRow: {
                    hidden: !includeEffects,
                    anchor: { target: "fileShadowRow", axis: "y", offset: sH },
                    dir: "row", width: "full", height: "auto", margin: [0, 0],
                    lblFileStroke: {
                        type: UI_TYPES.TOGGLE_V2, textThemeKey: ["dialog", "button", "t_textSmall"],
                        measureText: "Shadow", text: "Strokes",
                        width: "auto", height: "auto", padding: [1, pH],
                        isTextOnly: true, mouseOver: false,
                        // THE NULL GUARD: Prevent crash if no entry is currently selected
                        value: palEntry?.showStroke ?? !!palEntry?.entries?.stroke,
                        onPress: () => { if (palEntry) { const cur = palEntry.showStroke ?? !!palEntry?.entries?.stroke; palEntry.showStroke = !cur; refreshPaletteLayout(basta); } }
                    },
                    fileStrokeContainer: {
                        hidden: !(palEntry?.showStroke ?? !!palEntry?.entries?.stroke),
                        dir: "col", width: "full", height: "auto",
                        fileStroke: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", width: "full", height: 16,
                            key: "fileStroke",
                            colorSuffix: "",
                            themeToEdit: palEntry?.entries,
                            _selectedKeyName: "stroke",
                            onColorClick: (base, exactKey) => openDesigner(palEntry.entries, "stroke", exactKey, "fileStroke")
                        }
                    }
                },
                fileGlowRow: {
                    hidden: !includeEffects,
                    anchor: { target: "fileStrokeRow", axis: "y", offset: sH },
                    dir: "row", width: "full", height: "auto", margin: [0, 0],
                    lblFileGlow: {
                        type: UI_TYPES.TOGGLE_V2, textThemeKey: ["dialog", "button", "t_textSmall"],
                        measureText: "Shadow", text: "Glows",
                        width: "auto", height: "auto", padding: [1, pH],
                        isTextOnly: true, mouseOver: false,
                        value: palEntry?.showGlow ?? !!palEntry?.entries?.glow,
                        onPress: () => { if (palEntry) { const cur = palEntry.showGlow ?? !!palEntry?.entries?.glow; palEntry.showGlow = !cur; refreshPaletteLayout(basta); } }
                    },
                    fileGlowContainer: {
                        hidden: !(palEntry?.showGlow ?? !!palEntry?.entries?.glow),
                        dir: "col", width: "full", height: "auto",
                        fileGlow: {
                            type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", width: "full", height: 16,
                            key: "fileGlow",
                            colorSuffix: "",
                            themeToEdit: palEntry?.entries,
                            _selectedKeyName: "glow",
                            onColorClick: (base, exactKey) => openDesigner(palEntry.entries, "glow", exactKey, "fileGlow")
                        }
                    }
                }
            };

            return {
                contentRegion: { ...contentRegions },
                footerRegion: {
                    anchor: { target: "contentRegion", axis: "y", offset: oY },
                    btnOk: {
                        type: UI_TYPES.BUTTON,
                        themeKey: "buttonNode, t_textSystem",
                        text: "Done",
                        width: "auto",
                        height: "auto",
                        objectAlign: ["right", "middle"],
                        labelAlign: ["center", "middle"],
                        onPress: () => basta.close("footerButton")
                    }
                }
            };
        }
    };

    const bastaInstance = spawnBasta(id, config);

    // THE SUCCESS FEEDBACK: Handle UI updates and messaging after a successful file rename
    bastaInstance.onRenameSuccess = (newName) => {
        showBastaMessage(bastaInstance, `Renamed to: ${newName}`, 3000, { fade: true, grow: true }, "btnRename", false, "success");
        refreshPaletteFileList(bastaInstance, { showError: true, anchor: "btnRename" });
    };

    bastaInstance.onDuplicateSuccess = (newName) => {
        showBastaMessage(bastaInstance, `Duplicated to: ${newName}`, 3000, { fade: true, grow: true }, "btnCopy", false, "success");
        refreshPaletteFileList(bastaInstance, { showError: true, anchor: "btnCopy" });
    };

    bastaInstance.onDeleteSuccess = (deletedName) => {
        showBastaMessage(bastaInstance, `Deleted: ${deletedName}`, 3000, { fade: true, grow: true }, "btnDelete", false, "success");
        if (normalizePaletteName(bastaInstance.properties.activePaletteName) === normalizePaletteName(deletedName)) {
            bastaInstance.properties.activePaletteName = "";
            bastaInstance.properties.activePaletteId = null;
            bastaInstance._availablePalettes = [];
            bastaInstance._selectedPaletteEntry = null;
        }
        refreshPaletteFileList(bastaInstance, { showError: true, anchor: "btnDelete" });
    };

    refreshPaletteFileList(bastaInstance);

    /**
     * THE CONTEXT LINK: The widget_ColorKey requires themeToEdit and _selectedKeyName
     * on the calling entity (bastaInstance) to pass its internal safety guards.
     */
    if (host) {
        bastaInstance.themeToEdit = JSON.parse(JSON.stringify(host.themeToEdit || {}));
        bastaInstance._selectedKeyName = host._selectedKeyName;
        bastaInstance._activeThemeToEdit = bastaInstance.themeToEdit;
        bastaInstance._activeKeyName = bastaInstance._selectedKeyName;
        bastaInstance._selectedThemeName = host._selectedThemeName;
        bastaInstance.properties.pushChanges = false;
    }

    return bastaInstance;
}
