/**
 * Path: ./js/fatha/bastas/bastaPalette.js
 * ROLE: A general-purpose container Basta adapted to the new framework skeleton.
 * INTEGRATION: Inherits Header/Footer logic from bastaLayoutMaps.js.
 * STATUS: FIX APPLIED - Theme context injection added.
 */
import { spawnBasta } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { showBastaColorDesigner } from "./bastaColorDesigner.js";
import { showBastaSystemMessage } from "./bastaSystemMessage.js";
import { showBastaFileHandler } from "./bastaFileHandler.js";
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

function markPaletteDirty(basta, options = {}) {
    basta._paletteDirty = true;
    refreshPaletteLayout(basta, options);
}

function syncActivePalettePreview(basta) {
    const activeName = normalizePaletteName(basta?.properties?.activePaletteName || "");
    if (!activeName) return false;

    if (!window.xcpPaletteCache || typeof window.xcpPaletteCache !== "object") window.xcpPaletteCache = {};
    window.xcpPaletteCache[activeName] = {
        effects: basta.properties.includeEffectKeys === true,
        palettes: basta._availablePalettes || [],
    };
    if (normalizePaletteName(window.xcpActivePaletteName || "") === activeName) {
        if (!window.xcpActivePalette) window.xcpActivePalette = {};
        window.xcpActivePalette.effects = basta.properties.includeEffectKeys === true;
        window.xcpActivePalette.palettes = basta._availablePalettes || [];
        window.xcpActivePaletteName = activeName;
    }
    return true;
}

function schedulePalettePreviewRedraw(basta) {
    if (!syncActivePalettePreview(basta)) return;
    if (basta._palettePreviewRaf) return;

    basta._palettePreviewRaf = requestAnimationFrame(() => {
        basta._palettePreviewRaf = null;
        if (basta.isClosing) return;

        const nodes = window.app?.graph?._nodes || [];
        nodes.forEach(node => {
            if (!node?.isFathaNode && !node?.isUncleNode) return;
            if (normalizePaletteName(node._headerPaletteName || "") !== normalizePaletteName(basta.properties.activePaletteName || "")) return;
            if (node._derpBgCache) node._derpBgCache.key = "";
            if (node._compDataCache) node._compDataCache = {};
            if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, false);
        });

        if (window.app?.canvas) window.app.canvas.setDirty(true, false);
    });
}

function markPaletteColorEdited(basta) {
    basta._paletteDirty = true;
    schedulePalettePreviewRedraw(basta);

    if (basta.layout) basta.layout._lastCacheKey = "";
    basta._layoutDirty = true;
    basta._forceSync = true;
    if (basta.setDirtyCanvas) basta.setDirtyCanvas(true, false);
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
        if (options.showError) showBastaSystemMessage(basta, "Palette List Error", 3000, { width: 250 }, options.anchor || false, "error", null, "");
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
            const hasChanges = !!basta._paletteDirty || (basta._lastFileHash && (basta._lastFileHash !== currentHash));

            // THE SAVE PULSE: Button pulses when changes are detected (handled internally by btnIcon via config.pulse)
            const openDesigner = (targetTheme, keyName, exactKey, persistentKey) => {
                const safeHost = Object.create(host || basta); // FIXED: Changed hostNode to host
                safeHost.themeToEdit = targetTheme;
                safeHost._selectedKeyName = keyName;
                safeHost._selectedThemeName = "__PALETTE_LOCAL__"; // Block designer from overwriting global theme config
                safeHost.requestDerpSync = () => basta.requestDerpSync();
                safeHost.onPaletteEdit = () => markPaletteColorEdited(basta);
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
                btnNewFile: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "new", width: "match", height: "auto", spacing: [sW, 0],
                    state: "OFF",
                    onPress: () => showBastaFileHandler(basta, "palettes", "btnNewFile", {
                        title: "New Palette File",
                        message: "Enter name for new palette:",
                        confirm: "Create",
                        warning: "File already exists!",
                        mode: "new",
                        originalName: "",
                        onConfirm: async (newName) => {
                            try {
                                const res = await fetch(`/xcp/save/palettes`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        name: newName,
                                        data: { effects: false, palettes: [] }
                                    })
                                });
                                if (res.ok) {
                                    showBastaSystemMessage(basta, "Palette Created: ", 3000, { fade: true, grow: true }, "btnNewFile", "success", null, newName);
                                    refreshPaletteFileList(basta, { showError: true, anchor: "btnNewFile" });
                                } else {
                                    showBastaSystemMessage(basta, "Palette Create Failed", 3000, { width: 250 }, "btnNewFile", "error", null, "");
                                }
                            } catch (e) {
                                console.error("[Palette Manager] Create File Error:", e);
                                showBastaSystemMessage(basta, "Server Error", 3000, { width: 250 }, "btnNewFile", "error", null, "");
                            }
                        }
                    })
                },
                btnRename: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "rename", width: "match", height: "auto", spacing: [sW, 0], 
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
                    icon: "copy", width: "match", height: "auto", spacing: [sW, 0],
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
                    icon: "file", width: "match", height: "auto", spacing: [sW, 0],
                    state: "OFF",
                    onPress: () => fetch("/xcp/open_folder?name=palettes")
                },
                browserPalette: {
                    type: UI_TYPES.FILEBROWSER, themeKey: "dialog, t_textSmall", displayMode: "cutoff", 
                    width: "full", height: "auto", padding: [pW, pH], canvasShield: true,
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
                            basta._paletteDirty = false;

                            // THE AUTO-SELECT: Jump to the first entry so the preview region populates immediately
                            if (basta._availablePalettes.length > 0) {
                                const firstEntry = basta._availablePalettes[0];
                                basta.properties.activePaletteId = firstEntry.id;
                                basta._selectedPaletteEntry = firstEntry;
                            } else {
                                basta.properties.activePaletteId = null;
                                basta._selectedPaletteEntry = null;
                            }
                        } catch (e) {
                            console.error("[Palette Manager] Collection Load Error:", e);
                            showBastaSystemMessage(basta, "Palette Load Failed", 3000, { width: 250 }, "browserPalette", "error", null, "");
                        }
                        refreshPaletteLayout(basta);
                    },
                },
                btnDelete: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "trash", width: "match", height: "auto", spacing: [sW, 0],
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
                                        showBastaSystemMessage(basta, "Palette Delete Failed", 3000, { width: 250 }, "btnDelete", "error", null, "");
                                    }
                                } catch (e) {
                                    console.error("[Palette Manager] Delete Error:", e);
                                    showBastaSystemMessage(basta, "Server Error", 3000, { width: 250 }, "btnDelete", "error", null, "");
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
            const sortedPaletteEntries = [...(basta._availablePalettes || [])].sort((a, b) => {
                const nameA = String(a?.name || "").toLowerCase();
                const nameB = String(b?.name || "").toLowerCase();
                return nameA.localeCompare(nameB) || ((parseInt(a?.id) || 0) - (parseInt(b?.id) || 0));
            });

            contentRegions.keysHandling = {
                dir: "row", width: "full", height: "auto", margin: [0, mH], spacing: [sW, 0],
                btnNewKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "new", width: "match", height: "auto", spacing: [sW, 0],
                    state: hasFile ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "none", "btnNewKey", {
                        title: "New Entry",
                        message: "Enter name for new color key entry:",
                        confirm: "Create",
                        warning: "Entry name already exists!",
                        mode: "new",
                        originalName: "",
                        fileList: (basta._availablePalettes || []).map(p => p.name),
                        onConfirm: async (newName) => {
                            const maxId = Math.max(0, ...(basta._availablePalettes || []).map(p => parseInt(p.id) || 0));
                            const newEntry = {
                                id: maxId + 1,
                                name: newName,
                                entries: {
                                    main: { _ON: [255, 255, 255, 1], _OFF: [128, 128, 128, 1], _DIS: [64, 64, 64, 1] },
                                    shadow: JSON.parse(JSON.stringify(DEFAULT_SHADOW)),
                                    stroke: JSON.parse(JSON.stringify(DEFAULT_STROKE)),
                                    glow: JSON.parse(JSON.stringify(DEFAULT_GLOW))
                                },
                                showShadow: false,
                                showStroke: false,
                                showGlow: false
                            };
                            basta._availablePalettes.push(newEntry);
                            basta.properties.activePaletteId = newEntry.id;
                            basta._selectedPaletteEntry = newEntry;
                            showBastaSystemMessage(basta, "Entry Created: ", 3000, { fade: true, grow: true }, "btnNewKey", "success", null, newName);
                            markPaletteDirty(basta);
                        }
                    })
                },
                btnRenameKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "rename", width: "match", height: "auto", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId) ? "OFF" : "DIS",
                    onPress: () => showBastaFileHandler(basta, "none", "btnRenameKey", {
                        title: `Rename Entry: ${currentPal?.name || ""}`,
                        message: "Enter new name for color key entry:", confirm: "Rename", warning: "Entry name already exists!",
                        originalName: currentPal?.name,
                        fileList: (basta._availablePalettes || []).map(p => p.name),
                        onConfirm: async (newName) => {
                            if (currentPal) {
                                currentPal.name = newName;
                                showBastaSystemMessage(basta, "Entry Renamed: ", 3000, { fade: true, grow: true }, "btnRenameKey", "success", null, newName);
                                markPaletteDirty(basta);
                            }
                        }
                    })
                },
                btnCopyKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "copy", width: "match", height: "auto", spacing: [sW, 0],
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
                                showBastaSystemMessage(basta, "Entry Duplicated: ", 3000, { fade: true, grow: true }, "btnCopyKey", "warning", null, newName);
                                markPaletteDirty(basta);
                            }
                        }
                    })
                },
                btnSaveKey: { type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal",
                    icon: "save", width: "match", height: "auto", spacing: [sW, 0],
                    state: (hasFile && basta.properties.activePaletteId && hasChanges) ? "OFF" : "DIS",
                    pulse: hasChanges,
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
                                basta._lastFileHash = getPaletteHash(basta._availablePalettes, basta.properties.includeEffectKeys);
                                basta._paletteDirty = false;
                                showBastaSystemMessage(basta, "Palette Saved: ", 3000, { fade: true, grow: true }, "btnSaveKey", "warning", null, String(basta.properties.activePaletteName || "").split(/[\\/]/).pop().replace(/\.json$/i, ""));
                                refreshPaletteLayout(basta);
                            } else {
                                showBastaSystemMessage(basta, "Palette Save Failed", 3000, { fade: true, grow: true }, "btnSaveKey", "error", null, "");
                            }
                        } catch (e) {
                            console.error(e);
                            showBastaSystemMessage(basta, "Palette Save Error", 3000, { fade: true, grow: true }, "btnSaveKey", "error", null, "");
                        }
                    }
                },
                dropdownKeys: {
                    type: UI_TYPES.FILEBROWSER,
                    icon: "dropdown",
                    themeKey: "button, t_textSmall",
                    displayMode: "cutoff",
                    width: "full", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                    mode: "file",
                    rootName: "palettes",
                    state: basta.properties.activePaletteName ? "OFF" : "DIS",
                    items: sortedPaletteEntries.map(p => `${String(p.id).padStart(2, '0')}: ${p.name}`),
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
                    icon: "trash", width: "match", height: "auto", spacing: [sW, 0],
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
                                showBastaSystemMessage(basta, "Entry Deleted: ", 3000, { fade: true, grow: true }, "btnDeleteKey", "critical", null, currentPal.name);
                                markPaletteDirty(basta);
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
                        onPress: () => { if (palEntry) { const cur = palEntry.showShadow ?? !!palEntry?.entries?.shadow; palEntry.showShadow = !cur; markPaletteDirty(basta); } }
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
                        onPress: () => { if (palEntry) { const cur = palEntry.showStroke ?? !!palEntry?.entries?.stroke; palEntry.showStroke = !cur; markPaletteDirty(basta); } }
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
                        onPress: () => { if (palEntry) { const cur = palEntry.showGlow ?? !!palEntry?.entries?.glow; palEntry.showGlow = !cur; markPaletteDirty(basta); } }
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
        },
        onClose: () => {
            const instance = window.xcpActiveBastas?.get?.(id);
            if (instance?._palettePreviewRaf) {
                cancelAnimationFrame(instance._palettePreviewRaf);
                instance._palettePreviewRaf = null;
            }
        }
    };

    const bastaInstance = spawnBasta(id, config);

    // THE SUCCESS FEEDBACK: Handle UI updates and messaging after a successful file rename
    bastaInstance.onRenameSuccess = (newName) => {
        showBastaSystemMessage(bastaInstance, "Palette Renamed: ", 3000, { fade: true, grow: true }, "btnRename", "success", null, newName);
        refreshPaletteFileList(bastaInstance, { showError: true, anchor: "btnRename" });
    };

    bastaInstance.onDuplicateSuccess = (newName) => {
        showBastaSystemMessage(bastaInstance, "Palette Duplicated: ", 3000, { fade: true, grow: true }, "btnCopy", "warning", null, newName);
        refreshPaletteFileList(bastaInstance, { showError: true, anchor: "btnCopy" });
    };

    bastaInstance.onDeleteSuccess = (deletedName) => {
        showBastaSystemMessage(bastaInstance, "Palette Deleted: ", 3000, { fade: true, grow: true }, "btnDelete", "critical", null, deletedName);
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
