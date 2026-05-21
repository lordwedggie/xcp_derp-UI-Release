/**
 * MODULE: Theme Configuration (Data Authority)
 * PURPOSE: Manages global state, API calls, and the default data constants.
 * LOCATION: core/themeConfig.js
 */

import { prepareThemeForPersistence, enforceThemeLocks, generateKeyHash } from "../helpers/themeDataUtils.js";

// --- CONSTANTS ---
export const DEFAULT_THEME_KEY = "bg";
export const UNLOCKED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square"><rect x="5" y="11" width="14" height="10" rx="1"></rect><path d="M8 11V7a4 4 0 017-3.3"></path></svg>`;

export const FALLBACK_THEME = {
    "_layout": [4, 2, 2, 2, 2, 4, 2, 4],
    "canvas": {
        "_ON": [56, 56, 56, 1], "_OFF": [61, 61, 61, 1], "_DIS": [15, 15, 15, 1],
        "corners": [4, 4, 4, 4],
        "_Shadow": [0, 0, 0, 0.5, 0, 2, 8],
        "_Stroke": [250, 250, 250, 0.39, 1, 2],
        "_Glow": [255, 255, 255, 1, 0, 0, 20],
        "shadow": [0, 2, 8, "rgba(0,0,0,0.5)"],
        "shadowDisabled": [0, 2, 8, "rgba(0,0,0,0.5)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [1, 2, "rgba(250,250,250,0.39)"],
        "strokeDisabled": [1, 2, "rgba(250,250,250,0.39)"],
        "glow": [0, 0, 20, "rgba(255,255,255,1)"],
        "glowDisabled": [0, 0, 20, "rgba(255,255,255,1)"],
        "glowClip": "c_glowOutside"
    },
    "background": {
        "_ON": [45, 45, 45, 0.8], "_OFF": [35, 35, 35, 0.7], "_DIS": [20, 20, 20, 0.3],
        "corners": [4, 4, 4, 4],
        "_Shadow": [0, 0, 0, 0.2, 0, 4, 12],
        "_Stroke": [255, 255, 255, 0.1, 1, 0],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 4, 12, "rgba(0,0,0,0.2)"],
        "shadowDisabled": [0, 4, 12, "rgba(0,0,0,0.2)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [1, 0, "rgba(255,255,255,0.1)"],
        "strokeDisabled": [1, 0, "rgba(255,255,255,0.1)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "dialog": {
        "_ON": [60, 60, 60, 1], "_OFF": [45, 45, 45, 0.95], "_DIS": [30, 30, 30, 0.8],
        "corners": [6, 6, 6, 6],
        "_Shadow": [0, 0, 0, 0.4, 0, 8, 24],
        "_Stroke": [255, 255, 255, 0.1, 1, 1],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 8, 24, "rgba(0,0,0,0.4)"],
        "shadowDisabled": [0, 8, 24, "rgba(0,0,0,0.4)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [1, 1, "rgba(255,255,255,0.1)"],
        "strokeDisabled": [1, 1, "rgba(255,255,255,0.1)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "panel": {
        "_ON": [35, 35, 35, 0.8], "_OFF": [30, 30, 30, 0.6], "_DIS": [25, 25, 25, 0.4],
        "corners": [4, 4, 4, 4],
        "_Shadow": [0, 0, 0, 0.2, 0, 2, 6],
        "_Stroke": [255, 255, 255, 0.08, 1, 0],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 2, 6, "rgba(0,0,0,0.2)"],
        "shadowDisabled": [0, 2, 6, "rgba(0,0,0,0.2)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [1, 0, "rgba(255,255,255,0.08)"],
        "strokeDisabled": [1, 0, "rgba(255,255,255,0.08)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "button": {
        "_ON": [80, 80, 80, 1], "_OFF": [40, 40, 40, 0.8], "_DIS": [40, 40, 40, 0.2],
        "corners": [2, 2, 2, 2],
        "_Shadow": [0, 0, 0, 0.15, 0, 1, 3],
        "_Stroke": [255, 255, 255, 0.1, 0.5, 0],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 1, 3, "rgba(0,0,0,0.15)"],
        "shadowDisabled": [0, 1, 3, "rgba(0,0,0,0.15)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [0.5, 0, "rgba(255,255,255,0.1)"],
        "strokeDisabled": [0.5, 0, "rgba(255,255,255,0.1)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "systemBackground": {
        "_ON": [40, 40, 40, 1], "_OFF": [30, 30, 30, 0.95], "_DIS": [20, 20, 20, 1],
        "corners": [4, 4, 4, 4],
        "_Shadow": [0, 0, 0, 0.5, 0, 4, 12],
        "_Stroke": [255, 255, 255, 0.2, 1, 1],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 4, 12, "rgba(0,0,0,0.5)"],
        "shadowDisabled": [0, 4, 12, "rgba(0,0,0,0.5)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [1, 1, "rgba(255,255,255,0.2)"],
        "strokeDisabled": [1, 1, "rgba(255,255,255,0.2)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "systemButton": {
        "_ON": [100, 100, 100, 1], "_OFF": [20, 20, 20, 0.5], "_DIS": [20, 20, 20, 0.1],
        "corners": [2, 2, 2, 2],
        "_Shadow": [0, 0, 0, 0.1, 0, 8, 16],
        "_Stroke": [255, 255, 255, 0.3, 0.5, 0],
        "_Glow": [255, 255, 255, 0, 0, 0, 0],
        "shadow": [0, 8, 16, "rgba(0,0,0,0.1)"],
        "shadowDisabled": [0, 8, 16, "rgba(0,0,0,0.1)"],
        "shadowClip": "c_shadowOutside",
        "stroke": [0.5, 0, "rgba(255,255,255,0.3)"],
        "strokeDisabled": [0.5, 0, "rgba(255,255,255,0.3)"],
        "glow": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowDisabled": [0, 0, 0, "rgba(255,255,255,0)"],
        "glowClip": "c_glowNone"
    },
    "t_textBig": { "font": "DengXian", "fontSize": 14, "_ON": [255, 255, 255, 1], "_OFF": [200, 200, 200, 0.8], "_DIS": [100, 100, 100, 0.1] },
    "t_textNormal": { "font": "DengXian", "fontSize": 14, "_ON": [255, 255, 255, 1], "_OFF": [180, 180, 180, 0.8], "_DIS": [120, 120, 120, 0.2] },
    "t_textSmall": { "font": "Arial", "fontSize": 10, "_ON": [255, 255, 255, 1], "_OFF": [150, 150, 150, 0.45], "_DIS": [100, 100, 100, 0.2] },
    "t_textSystem": { "font": "DengXian", "fontSize": 10, "_ON": [255, 255, 255, 1], "_OFF": [180, 180, 180, 0.6], "_DIS": [100, 100, 100, 0.2] }
};

// --- API WRAPPER ---
export const api = {
    /** Fetches the theme configuration from the server. */
    async get() {
        try {
            const r = await fetch("/xcp/list/themes");
            if (!r.ok) return {};
            const listData = await r.json();
            const themesObj = {};
            const themeSources = {};
            if (listData.items) {
                // THE 404 FIX: Filter out directories (ending in /) from the load queue
                const themeFiles = listData.items.filter(item => typeof item === "string" && !item.endsWith("/"));

                await Promise.all(themeFiles.map(async (tName) => {
                    const tr = await fetch(`/xcp/load/themes?name=${encodeURIComponent(tName)}`);
                    const usingFallback = tr?.headers?.get?.("X-Xcp-Using-Fallback") === "1";
                    if (tr.ok) {
                        const tData = await tr.json();
                        if (tData.data) {
                            themesObj[tName] = tData.data;
                            themeSources[tName] = usingFallback ? "fallback" : "primary";
                        }
                    }
                }));
            }
            let palettes = {};
            const pr = await fetch("/xcp/load/palettes?name=derpPalettes");
            if (pr.ok) {
                const pData = await pr.json();
                if (pData.data) palettes = pData.data;
            }
            return { customThemes: themesObj, palettes: palettes, themeSources };
        } catch { return {}; }
    },
    /** Saves the theme configuration to the server. */
    async set(d) {
        try {
            if (d.themes) {
                for (const [tName, tData] of Object.entries(d.themes)) {
                    await fetch("/xcp/save/themes", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: tName, data: tData })
                    });
                }
            }
            if (d.palettes) {
                await fetch("/xcp/save/palettes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: "derpPalettes", data: d.palettes })
                });
            }
        } catch (e) { console.error("[xcpDerp] API Set Error:", e); }
    }
};

/** Retrieves the base factory templates. */
export const getBaseTemplates = () => (typeof defaultTemplates === "function") ? defaultTemplates() : {};

/** * Initializes the global window object.
 * This must be called before the extension registers.
 */
export function initThemeConfig() {
    window.xcpDerpThemeConfig = {
        activeTheme: "User_Default",
        palettes: {},
        themes: {},
        subscribers: new Set(),
        _colorCache: new Map(),
        _revision: 0,
        _themeRevisions: {},

        // Change Detection State
        baselineHashes: {},
        _allBaselines: {},

        autoSave: false,
        isDirty: false,

        async init() {
            const d = await api.get();
            // THE FIX: Load activeTheme from localStorage as JSON no longer tracks it
            const storedTheme = localStorage.getItem("xcp_active_theme");
            if (storedTheme) this.activeTheme = storedTheme;

            if (d.palettes) this.palettes = d.palettes;
            this.themes = d.customThemes || {};
            this.themeSources = d.themeSources || {};
            this._isReady = true;

            // THE DEFAULT TEMPLATE AUTHORITY: Ensure the system anchor exists in memory
            const defaultPath = "_Templates/DerpTheme_Default";
            if (!this.themes[defaultPath]) {
                console.warn(`%c[xcpDerp] System Default Template not found on disk at: ${defaultPath}.json. Seeding memory from internal fallback.`, "color: #ffa500; font-weight: bold;");
                this.themes[defaultPath] = JSON.parse(JSON.stringify(FALLBACK_THEME));
                this.themeSources[defaultPath] = "hardcoded";
            }

            const themeNames = Object.keys(this.themes);
            if (!this.themes[this.activeTheme]) {
                this.activeTheme = this.themes[defaultPath] ? defaultPath : themeNames[0];
            }

            this.refreshBaselines();
            this.isDirty = false;
            this.notifyAll();
        },
        /**
         * CHANGE DETECTION: Captures the 'File State' of a theme.
         * By caching, we preserve 'Dirty' status even when swapping themes.
         */
        refreshBaselines(force = false, targetTheme = null) {
            const themeName = targetTheme || this.activeTheme;
            if (!this.themes[themeName]) return;

            if (!force && this._allBaselines[themeName]) {
                if (themeName === this.activeTheme) {
                    this.baselineHashes = this._allBaselines[themeName];
                }
                return;
            }

            const newBaselines = {};
            const theme = this.themes[themeName];

            for (const key in theme) {
                const kData = theme[key];
                if (kData && typeof kData === 'object') {
                    // THE FIX: Baseline now represents the exact data state, including alpha
                    newBaselines[key] = generateKeyHash(kData);
                }
            }

            this._allBaselines[themeName] = newBaselines;
            if (themeName === this.activeTheme) {
                this.baselineHashes = newBaselines;
            }
            console.log(`%c[xcpDerp] Baseline Captured: ${themeName}`, "color: #00ff00; font-weight: bold;");
        },

        /**
         * CHANGE DETECTION: Compares current key state to baseline.
         * Added 'silent' parameter to prevent console flooding during UI draws.
         */
        checkKeyStatus(key, currentData, silent = false) {
            if (!key || !currentData) return false;

            const currentHash = generateKeyHash(currentData);
            const baseHash = this.baselineHashes[key];
            const isChanged = currentHash !== baseHash;

            if (!silent) {
                const status = isChanged ? "Changed" : "Unchanged";
                const logColor = isChanged ? "color: #ff5555" : "color: #55ff55";
                console.log(`%c[xcpDerp] Status: ${status} (${key})`, logColor);
            }

            return isChanged;
        },

        /**
         * REVERT LOGIC: Restores a specific key directly from the server file.
         */
        async revertKey(key, node) {
            if (!key || !this.themes[this.activeTheme]) return;

            const serverData = await api.get();
            const originalTheme = (serverData.customThemes && serverData.customThemes[this.activeTheme])
                ? serverData.customThemes[this.activeTheme]
                : FALLBACK_THEME;

            if (originalTheme[key]) {
                // 1. Restore the data to memory
                this.themes[this.activeTheme][key] = JSON.parse(JSON.stringify(originalTheme[key]));

                // 2. Reset Node State (Turn off Global Alpha overrides)
                if (node && node.properties) {
                    node.properties[key] = JSON.parse(JSON.stringify(this.themes[this.activeTheme][key]));
                    node.properties._globalAlphaXActive = false;
                    if (node._states) node._states.gAlphaToggle = "OFF";
                }

                // 3. GENERATE ROBUST HASH: Baseline now represents the exact data state, including alpha
                const cleanHash = generateKeyHash(this.themes[this.activeTheme][key]);

                // 4. Force Update Hash Caches
                this.baselineHashes[key] = cleanHash;
                if (!this._allBaselines[this.activeTheme]) this._allBaselines[this.activeTheme] = {};
                this._allBaselines[this.activeTheme][key] = cleanHash;

                console.log(`%c[xcpDerp] Reverted ${key} | Hash Synced`, "color: #aaaaff;");

                // 5. Update UI
                this.notifyAll();
            }
        },
        /**
         * SAVE KEY LOGIC: Patches the JSON file with only this key's data.
         * FIXES: Removes stray "_ShadowData", forces integer types, and mirrors Master pos/blur to variants.
         */
        async saveKey(key) {
            if (!key || !this.themes[this.activeTheme]) return;

            const serverData = await api.get();
            if (!serverData.customThemes) serverData.customThemes = {};
            if (!serverData.customThemes[this.activeTheme]) serverData.customThemes[this.activeTheme] = {};

            const themeData = this.themes[this.activeTheme][key];
            const cleanKeyData = JSON.parse(JSON.stringify(themeData));

            const placementMap = { "Inside": 1, "Center": 0, "Outside": 2 };

            // --- 2. EFFECT SYNC & DATA INTEGRITY ---
            const syncEffect = (baseKey, variantSuffixes, targetLen) => {
                const baseArr = cleanKeyData[baseKey];
                if (!baseArr || !Array.isArray(baseArr)) return;

                // Ensure Master (Base) is correct length and type
                if (baseKey === '_Stroke' && typeof baseArr[5] === 'string') {
                    baseArr[5] = placementMap[baseArr[5]] ?? 0;
                }
                while (baseArr.length < targetLen) baseArr.push(0);
                cleanKeyData[baseKey] = baseArr.slice(0, targetLen);

                // Force Variants to Mirror Master Positional Values
                variantSuffixes.forEach(s => {
                    const vKey = baseKey + s;
                    if (cleanKeyData[vKey] && Array.isArray(cleanKeyData[vKey])) {
                        const vArr = cleanKeyData[vKey];
                        const newV = vArr.slice(0, 4); // Keep variant color (RGBA)
                        for (let i = 4; i < targetLen; i++) {
                            newV[i] = cleanKeyData[baseKey][i]; // Copy Master pos/blur/width
                        }
                        // Handle variant-specific stroke placement strings
                        if (baseKey === '_Stroke' && typeof newV[5] === 'string') {
                            newV[5] = placementMap[newV[5]] ?? 0;
                        }
                        cleanKeyData[vKey] = newV;
                    }
                });
            };

            syncEffect('_Shadow', ['_OFF', '_DIS'], 7);
            syncEffect('_Stroke', ['_OFF', '_DIS'], 6);
            syncEffect('_Glow',   ['_OFF', '_DIS'], 7);

            // Final cleanup of primary colors
            ['_ON', '_OFF', '_DIS'].forEach(k => {
                if (Array.isArray(cleanKeyData[k])) cleanKeyData[k] = cleanKeyData[k].slice(0, 4);
            });

            // 3. Patch and Save
            // Remove internal UI lock flags so they are never saved to the JSON file
            ["_lockL", "_lockR", "_Shadow_lockL", "_Shadow_lockR", "_Stroke_lockL", "_Stroke_lockR", "_Glow_lockL", "_Glow_lockR"].forEach(l => delete cleanKeyData[l]);

            // THE FIX: Save only the targeted theme file
            const targetTheme = this.activeTheme;
            serverData.customThemes[targetTheme][key] = cleanKeyData;

            const payload = { themes: { [targetTheme]: serverData.customThemes[targetTheme] } };
            await api.set(payload);

            this.baselineHashes[key] = generateKeyHash(themeData);
            console.log(`%c[xcpDerp] Saved ${key}: Strays removed and variants mirrored.`, "color: #55ff55;");
            this.notifyAll();
        },

        notifyAll() {
            // THE FIX: Ensure activeTheme is persisted to local storage on every change
            localStorage.setItem("xcp_active_theme", this.activeTheme);

            this.subscribers.forEach(n => {
                if (n.onThemeUpdate) n.onThemeUpdate(this);
                if (n.setDirtyCanvas) n.setDirtyCanvas(true, true);
            });
        },

        touchTheme(themeName) {
            this._revision++;
            if (!themeName) return this._revision;
            this._themeRevisions[themeName] = (this._themeRevisions[themeName] || 0) + 1;
            return this._themeRevisions[themeName];
        },

        getThemeRevision(themeName) {
            if (!themeName) return this._revision;
            return this._themeRevisions[themeName] || 0;
        },

        notifyTheme(themeName) {
            // THE TARGETED FANOUT: Live theme edits only need to hit nodes bound to the touched theme.
            localStorage.setItem("xcp_active_theme", this.activeTheme);

            this.subscribers.forEach(n => {
                const nodeTheme = n?.properties?.selectedTheme || n?.properties?.selectedThemeName || n?._selectedThemeName || this.activeTheme;
                if (nodeTheme !== themeName) return;
                if (n.layout) n.layout._lastCacheKey = "";
                if (n.onThemeUpdate) n.onThemeUpdate(this);
                if (n.setDirtyCanvas) n.setDirtyCanvas(true, true);
            });
        },

        register(n) {
            if (!n) return;
            this.subscribers.add(n);
            if (n.onThemeUpdate) n.onThemeUpdate(this);
        },
        unregister(n) { this.subscribers.delete(n); },

        /** Marks the current state as modified to enable the Save button. */
        markDirty() {
            this.isDirty = true;
            this.notifyAll();
        },

        persist(forceSave = false, targetTheme = null) {
            if (!forceSave && !this.autoSave) { this.isDirty = true; }

            if (this.autoSave || forceSave) {
                localStorage.setItem("xcp_active_theme", this.activeTheme);

                const themeName = targetTheme || this.activeTheme;
                if (this.themes[themeName]) {
                    // THE FIX: Use targeted themes object for the server payload
                    const themeToSave = { [themeName]: this.themes[themeName] };
                    const sanitizedThemes = prepareThemeForPersistence(themeToSave, {});

                    api.set({ themes: sanitizedThemes, palettes: this.palettes });
                    if (themeName === this.activeTheme) this.isDirty = false;
                }

                // Force refresh baseline to match the newly saved file state
                this.refreshBaselines(true, themeName);
            }
            this.notifyAll();
        }

    };

    window.xcpDerpThemeConfig.init();
}
