/**
 * PROJECT: derpNodes | CORE: themeManagerV2_core
 * STATUS: EXTERNALIZED CONTROLLER
 */
import { app } from "../../../scripts/app.js";
import { showBastaColorDesigner } from "../fatha/bastas/bastaColorDesigner.js";
import { UI_TYPES } from "../fatha/core/masterLayoutTypes.js";
import { playKaChing } from "../herbina/masterSoundEffects.js"; // THE FIX: Sound effects for success
import { pushThemeUpdate, updateMainEditRegion, bindKeyMainEvents } from "./helpers/themeManager_keyHandler.js";
import { updateEffectRegions, bindEffectEvents } from "./helpers/themeManager_effectHandler.js";
import {
    handleThemeDeleteAction,
    handleThemeDropdownChange,
    handleThemeRenameAction,
    handleThemeCopyAction,
    handleThemeSaveAction
} from "./helpers/themeManager_themeHandler.js";

const THEME_META_KEYS = new Set(["_category", "_layout", "_palette"]);

let _lastClickTime = 0;
export const safeClick = (fn) => {
    return (e) => {
        const now = Date.now();
        if (now - _lastClickTime < 300) return;
        _lastClickTime = now;
        fn();
    };
};
/**
 * CORE SOUND WRAPPER: Centralizes sound triggers to allow for a global toggle flag.
 */
export const playSuccessSound = () => {
    // THE FIX: Placeholder for future xcpDerpSettings.enableSounds check
    playKaChing();
};
// --- THE ULTIMATE LOCK PURGER & JSON SORTER ---
export const purgeLocks = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    Object.keys(obj).forEach(k => {
        if (k.toLowerCase().includes("lock")) {
            delete obj[k];
        } else {
            purgeLocks(obj[k]);
        }
    });
};

export const safePersist = (cfg, targetTheme = null) => {
    if (!cfg || !cfg.themes) return;

    // 1. Scrub the live object permanently.
    purgeLocks(cfg.themes);

    const PREFERRED_ORDER = [
        "font", "fontSize", "_ON", "_OFF", "_DIS", "corners",
        "shadow", "shadowDisabled", "shadow_ON", "shadow_OFF", "shadow_DIS",
        "stroke", "strokeDisabled", "stroke_ON", "stroke_OFF", "stroke_DIS",
        "glow", "glowDisabled", "glow_ON", "glow_OFF", "glow_DIS"
    ];

    const themesToProcess = targetTheme ? [targetTheme] : Object.keys(cfg.themes);

    themesToProcess.forEach(themeName => {
        const themeObj = cfg.themes[themeName];
        if (!themeObj) return;

        Object.keys(themeObj).forEach(keyName => {
            const keyData = themeObj[keyName];
            if (keyData && typeof keyData === "object" && !Array.isArray(keyData)) {
                if (keyData.glowClip === "c_glowNone") delete keyData.glowClip;
                if (keyData.shadowClip === "c_shadowNone") delete keyData.shadowClip;

                const sortedData = {};
                const currentKeys = Object.keys(keyData);
                currentKeys.sort((a, b) => {
                    const getRank = (k) => {
                        if (k === "shadow" || k === "shadowDisabled") return 6;
                        if (k === "stroke" || k === "strokeDisabled") return 11;
                        if (k === "glow" || k === "glowDisabled") return 16;
                        const idx = PREFERRED_ORDER.indexOf(k);
                        return idx === -1 ? 999 : idx;
                    };
                    const rankA = getRank(a), rankB = getRank(b);
                    return rankA !== rankB ? rankA - rankB : a.localeCompare(b);
                });
                currentKeys.forEach(k => { sortedData[k] = keyData[k]; });
                themeObj[keyName] = sortedData;
            }
        });
    });

    const alphabetizedThemes = {};
    Object.keys(cfg.themes).sort((a, b) => a.localeCompare(b)).forEach(t => {
        alphabetizedThemes[t] = cfg.themes[t];
    });
    cfg.themes = alphabetizedThemes;
    if (cfg.persist) cfg.persist(true, targetTheme);
};

export function initThemeManager(node) {
    node.titleLabel = "Theme Manager v2.3";
    node.properties.pushChanges = true;
    node.properties.autoWidth = false;
    node.properties.selectedThemeName = node.properties.selectedThemeName || "";

    node._selectedKeyName = node._selectedKeyName || null;

    node.outputs = [];
    node.widgets = [];
    node.inputs = [];

    const cfg = window.xcpDerpThemeConfig;
    const themeName = node.properties.selectedThemeName || node._selectedThemeName || cfg?.activeTheme || Object.keys(cfg?.themes || {})[0];

    if (themeName && cfg?.themes?.[themeName]) {
        node._selectedThemeName = themeName;
        node.properties.selectedThemeName = themeName;
        node.themeToEdit = JSON.parse(JSON.stringify(cfg.themes[themeName]));

        if (!node.themeToEdit._layout) node.themeToEdit._layout = [4, 2, 2, 2, 2, 4, 2, 4];
        node.properties.systemPaletteName = node.themeToEdit._palette || "";

        const availableKeys = Object.keys(node.themeToEdit).filter(k => !THEME_META_KEYS.has(k));
        if (!node._selectedKeyName || !availableKeys.includes(node._selectedKeyName)) {
            node._selectedKeyName = availableKeys[0] || "";
        }
    }
}

export function updateThemeLayout(node) {
    if (!node.layoutMap || node._isDerpCulled) return;

    // THE UI SYNC GATE: Specialist updates (Main/Effects) execute heavy string and regex operations.
    // We gate these using a hash of the selected key's data to stop the O(N) thrashing.
    const val = node._selectedKeyName;
    const keyData = node.themeToEdit?.[val] || {};
    const layoutData = node.themeToEdit?._layout || [];
    const dataHash = `${node._selectedThemeName}_${val}_${JSON.stringify(keyData)}_${JSON.stringify(layoutData)}`;

    if (node._lastUISyncHash === dataHash) return;
    node._lastUISyncHash = dataHash;
    node.properties.minWidth = 240;

    const lReg = node.layoutMap.themeLayoutRegion;
    let uiNeedsRefresh = false;

    if (lReg && node._selectedThemeName) {
        const checkSync = (key, i1, i2) => {
            const el = node._derpDomElements?.[key];
            if (el && (el === document.activeElement || el.contains(document.activeElement))) return;
            const layout = node.themeToEdit?._layout || [4, 2, 2, 2, 2, 4, 2, 4];

            const newVal = `${layout[i1] ?? 0}, ${layout[i2] ?? 0}`;

            const currentClean = String(lReg[key].value || "").replace(/\s+/g, "");
            const targetClean = newVal.replace(/\s+/g, "");

            if (currentClean !== targetClean) {
                lReg[key].value = newVal;
                uiNeedsRefresh = true;
            }
        };
        checkSync("editorMargin", 0, 1);
        checkSync("editorSpacing", 2, 3);
        checkSync("editorOffset", 4, 5);
        checkSync("editorPadding", 6, 7);
    }

    if (!val) return;

    updateMainEditRegion(node);
    updateEffectRegions(node);

    // Only force a layout reflow if the structural data values actually moved
    if (uiNeedsRefresh) {
        if (node.layout) node.layout._lastCacheKey = "";
        node.requestDerpSync();
    }
}

export function bindThemeEvents(node) {
    if (!node.layoutMap) return;

    // --- NEW: Theme Layout Region Events ---
    if (node.layoutMap.themeLayoutRegion) {
        const lReg = node.layoutMap.themeLayoutRegion;

        const updateLayoutProp = (propName, propIndexOffset, valStr, isCommit = false) => {
            // THE FIX: Smarter parsing that handles spaces and preserves the 2nd value while typing
            const parts = valStr.split(/[,\s]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            if (parts.length > 0) {
                const x = parts[0];
                // THE FIX: Update themeToEdit instead of node.properties to prevent the manager from morphing
                if (!node.themeToEdit._layout) node.themeToEdit._layout = [4, 2, 2, 2, 2, 4, 2, 4];
                const currentY = node.themeToEdit._layout[propIndexOffset + 1] ?? x;
                const y = (parts.length > 1) ? parts[1] : (isCommit ? x : currentY);

                node.themeToEdit._layout[propIndexOffset] = x;
                node.themeToEdit._layout[propIndexOffset + 1] = y;

                const cfg = window.xcpDerpThemeConfig;
                if (cfg && node._selectedThemeName) {
                    const themeObj = cfg.themes[node._selectedThemeName];
                    if (!themeObj._layout) themeObj._layout = [4, 2, 2, 2, 2, 4, 2, 4];
                    themeObj._layout[propIndexOffset] = x;
                    themeObj._layout[propIndexOffset + 1] = y;
                    if (cfg.touchTheme) cfg.touchTheme(node._selectedThemeName);

                    // THE PERFORMANCE FIX: Broadcast structural updates to the entire graph only on COMMIT (Blur).
                    // Running this $O(N)$ logic every frame during typing was destroying the framerate.
                    if (isCommit) {
                        if (cfg.notifyTheme) cfg.notifyTheme(node._selectedThemeName);
                        if (cfg.markDirty) cfg.markDirty();
                    }
                }

                // Internal UI refresh logic remains optimized to run during typing
                updateThemeLayout(node);
            }
        };

        lReg.editorMargin.onInput = (v) => updateLayoutProp("margin", 0, v, false);
        lReg.editorMargin.onBlur = (v) => updateLayoutProp("margin", 0, v, true);

        lReg.editorSpacing.onInput = (v) => updateLayoutProp("spacing", 2, v, false);
        lReg.editorSpacing.onBlur = (v) => updateLayoutProp("spacing", 2, v, true);

        lReg.editorOffset.onInput = (v) => updateLayoutProp("offset", 4, v, false);
        lReg.editorOffset.onBlur = (v) => updateLayoutProp("offset", 4, v, true);

        lReg.editorPadding.onInput = (v) => updateLayoutProp("padding", 6, v, false);
        lReg.editorPadding.onBlur = (v) => updateLayoutProp("padding", 6, v, true);

        if (lReg.dropdownPalette) {
            lReg.dropdownPalette.onChange = (v) => {
                if (v === "Loading palettes..." || v === "No _system palettes found") return;
                const paletteName = v === "None" ? "" : String(v || "").replace(/\\/g, "/");
                node.properties.systemPaletteName = paletteName;
                lReg.dropdownPalette.value = paletteName || "None";
                if (node.themeToEdit) {
                    if (paletteName) node.themeToEdit._palette = paletteName;
                    else delete node.themeToEdit._palette;
                }
                const cfg = window.xcpDerpThemeConfig;
                if (cfg?.themes && node._selectedThemeName) {
                    const themeObj = cfg.themes[node._selectedThemeName];
                    if (themeObj) {
                        if (paletteName) themeObj._palette = paletteName;
                        else delete themeObj._palette;
                    }
                    if (cfg.touchTheme) cfg.touchTheme(node._selectedThemeName);
                    if (cfg.markDirty) cfg.markDirty();
                }
                node.requestDerpSync();
            };
        }
    }

    // 1. Static Theme Management Events
    const tReg = node.layoutMap.themeManagementRegion;
    // THE FIX: Wrap remaining root buttons in safeClick to prevent double-fire bypasses
    tReg.btnThemeDelete.onClick = safeClick(() => handleThemeDeleteAction(node, updateThemeLayout));
    tReg.dropdownTheme.onChange = (val) => handleThemeDropdownChange(node, val);
    tReg.btnThemeRename.onClick = safeClick(() => handleThemeRenameAction(node, updateThemeLayout));
    tReg.btnThemeCopy.onClick = safeClick(() => handleThemeCopyAction(node, updateThemeLayout));
    tReg.btnThemeSave.onClick = safeClick(() => handleThemeSaveAction(node, updateThemeLayout));

    bindKeyMainEvents(node, updateThemeLayout);

    bindEffectEvents(node, updateThemeLayout);

    // THE BASTA TRANSITION: Re-bind effect-level Color Designer triggers (Main is handled by specialist)
    const openDesignerProxy = (exactKey, persistentKey) => {
        const safeHost = Object.create(node);
        safeHost.themeToEdit = node.themeToEdit;
        safeHost._selectedKeyName = node._selectedKeyName;
        safeHost._selectedThemeName = "__PALETTE_LOCAL__";
        safeHost.requestDerpSync = () => node.requestDerpSync();
        showBastaColorDesigner(safeHost, exactKey, persistentKey);
    };

    const sReg = node.layoutMap.shadowRegion;
    if (sReg?.shadowColorEdit) {
        sReg.shadowColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "shadowColorEdit");
    }

    const stReg = node.layoutMap.strokeRegion;
    if (stReg?.strokeColorEdit) {
        stReg.strokeColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "strokeColorEdit");
    }

    const gReg = node.layoutMap.glowRegion;
    if (gReg?.glowColorEdit) {
        gReg.glowColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "glowColorEdit");
    }
}
