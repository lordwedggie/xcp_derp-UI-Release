import { app } from "../../../../scripts/app.js";
import { compileThemeData, invalidateCompiledThemeCache } from "../../herbina/masterPainter.js";
import { closeDerpSysPanel, sysPanel } from "./fathaSysPanel.js";
import { showBastaSystemMessage } from "../bastas/bastaSystemMessage.js";

function getSystemMessageHost(preferredNode = null, fallbackId = "xcp_system_message_host") {
    return preferredNode || app?.graph?._nodes?.find?.(node => node?.isFathaNode || node?.isUncleNode) || {
        id: fallbackId,
        properties: {},
        setDirtyCanvas() {},
    };
}

function getThemeWarningNodeName(node) {
    return node?.titleLabel || node?.title || node?.type || `Node ${node?.id ?? "unknown"}`;
}

function showFallbackStatusMessage(host, kind, name, status) {
    const safeHost = getSystemMessageHost(host, `xcp_${kind}_status_host`);
    const normalizedKind = kind === "theme" ? "Theme" : "Palette";
    const prefix = status === "fallback"
        ? `${normalizedKind} fallback found: `
        : `${normalizedKind} missing, no fallback: `;
    showBastaSystemMessage(safeHost, prefix, 3200, { fade: true, grow: true }, null, status === "fallback" ? "info" : "error", null, name || "");
}

function showPerNodeThemeStatusMessage(node, status, requestedTheme, resolvedTheme = "") {
    if (!node || !requestedTheme) return;
    window._xcpPerNodeThemeWarnings = window._xcpPerNodeThemeWarnings || {};
    const accent = status === "fallback-loaded"
        ? resolvedTheme
        : status === "fallback-switched"
            ? `${requestedTheme} -> ${resolvedTheme}`
            : status === "hardcoded-switched"
                ? `${requestedTheme} -> ${resolvedTheme}`
            : requestedTheme;
    const warningKey = `${node.id || getThemeWarningNodeName(node)}::${status}::${accent}`;
    if (window._xcpPerNodeThemeWarnings[warningKey]) return;
    window._xcpPerNodeThemeWarnings[warningKey] = true;

    const prefix = status === "fallback-loaded"
        ? `${getThemeWarningNodeName(node)} loaded fallback theme: `
        : status === "fallback-switched"
            ? `${getThemeWarningNodeName(node)} switched to fallback theme: `
            : status === "hardcoded-switched"
                ? `${getThemeWarningNodeName(node)} switched to hardcoded fallback theme: `
                : `${getThemeWarningNodeName(node)} missing theme, no fallback: `;
    const mode = status === "missing" ? "error" : "info";
    showBastaSystemMessage(node, prefix, 3600, { fade: true, grow: true }, null, mode, null, accent);
}

function normalizePaletteName(name) {
    return String(name || "").replace(/\\/g, "/").trim();
}

function isRetiredPaletteName(name) {
    const normalizedName = normalizePaletteName(name)
        .replace(/\.json$/i, "")
        .replace(/^\/+/, "")
        .toLowerCase();
    return normalizedName === "_system/_tooltip" || normalizedName.endsWith("/_system/_tooltip");
}

function findCaseInsensitiveKey(source, target) {
    if (!source || !target) return null;
    const normalizedTarget = String(target).toLowerCase();
    return Object.keys(source).find((key) => String(key).toLowerCase() === normalizedTarget) || null;
}

function getPaletteCache() {
    if (!window.xcpPaletteCache || typeof window.xcpPaletteCache !== "object") window.xcpPaletteCache = {};
    return window.xcpPaletteCache;
}

function getStringPaletteCache() {
    if (!window.xcpStringPaletteCache || typeof window.xcpStringPaletteCache !== "object") window.xcpStringPaletteCache = {};
    return window.xcpStringPaletteCache;
}

const DEFAULT_STRING_PALETTE = "_system/_defaultTheme.json";
const CATEGORY_STRING_PALETTES = {
    dark: "_system/_DK_defaultTheme.json",
    light: "_system/_LT_defaultTheme.json",
    neutral: "_system/_NE_defaultTheme.json",
    netural: "_system/_NE_defaultTheme.json",
};
const THEME_WEIGHT_ROOT_VALUE = "_System/";
const THEME_WEIGHT_RESET_VALUE = "__theme_weight_reset__";

function getThemeStringPaletteName(theme) {
    const category = String(theme?.Category || "").trim().toLowerCase();
    return CATEGORY_STRING_PALETTES[category] || DEFAULT_STRING_PALETTE;
}

function cloneThemeWeightValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function applyThemeWeightOverlay(baseTheme, overlay) {
    if (!baseTheme || !overlay || typeof overlay !== "object") return baseTheme;
    const sourceKeys = overlay.keys && typeof overlay.keys === "object" ? overlay.keys : overlay;
    const effectiveTheme = { ...baseTheme };
    if (Array.isArray(overlay._layout)) effectiveTheme._layout = cloneThemeWeightValue(overlay._layout);

    Object.entries(sourceKeys || {}).forEach(([keyName, weightEntry]) => {
        if (keyName === "keys" || keyName === "meta" || keyName === "Category" || keyName === "_category" || keyName === "_layout" || keyName === "_palette") return;
        const baseKey = baseTheme[keyName];
        if (!baseKey || !weightEntry || typeof baseKey !== "object" || typeof weightEntry !== "object" || Array.isArray(baseKey)) return;
        const nextKey = { ...baseKey };
        ["corners", "font", "fontSize", "fontWeight"].forEach((prop) => {
            if (weightEntry[prop] !== undefined) nextKey[prop] = cloneThemeWeightValue(weightEntry[prop]);
        });
        effectiveTheme[keyName] = nextKey;
    });

    return effectiveTheme;
}

function requestThemeWeightOverlayHydration(node) {
    const selectedWeight = String(node?.properties?.selectedThemeWeight || "");
    if (!node || !selectedWeight || selectedWeight === THEME_WEIGHT_ROOT_VALUE || selectedWeight === THEME_WEIGHT_RESET_VALUE) {
        if (node) {
            node._themeWeightOverlay = null;
            node._themeWeightOverlayName = "";
            node._themeWeightOverlayPendingName = "";
        }
        return;
    }
    if (node._themeWeightOverlayName === selectedWeight && node._themeWeightOverlay) return;
    if (node._themeWeightOverlayPendingName === selectedWeight) return;

    node._themeWeightOverlayPendingName = selectedWeight;
    fetch(`/xcp/load/themes?name=${encodeURIComponent(selectedWeight)}&t=${Date.now()}`)
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data) => {
            if (node.properties?.selectedThemeWeight !== selectedWeight) return;
            node._themeWeightOverlayName = selectedWeight;
            node._themeWeightOverlay = data?.data || null;
            if (node._themeWeightOverlay && typeof node.onThemeUpdate === "function" && window.xcpDerpThemeConfig) {
                node.onThemeUpdate(window.xcpDerpThemeConfig);
            }
        })
        .catch((err) => {
            console.warn("[xcpDerp] Failed to hydrate theme weight:", err);
        })
        .finally(() => {
            if (node._themeWeightOverlayPendingName === selectedWeight) node._themeWeightOverlayPendingName = "";
        });
}

function attachStringPalette(node, paletteName = DEFAULT_STRING_PALETTE, fallbackPaletteName = DEFAULT_STRING_PALETTE) {
    if (!node) return;
    const normalizedName = normalizePaletteName(paletteName || DEFAULT_STRING_PALETTE);
    if (!normalizedName) return;
    node._derpStringPalette = { path: normalizedName };
    const cache = getStringPaletteCache();
    const cachedKey = findCaseInsensitiveKey(cache, normalizedName);
    if (cachedKey && cache[cachedKey]) {
        node._derpStringPaletteData = cache[cachedKey];
        node._derpStringPalette.data = cache[cachedKey];
        return;
    }
    if (node._derpStringPalettePendingName === normalizedName) return;
    node._derpStringPalettePendingName = normalizedName;
    fetch(`/xcp/load/palettes?name=${encodeURIComponent(normalizedName)}&t=${Date.now()}`)
        .then(response => {
            if (!response.ok) throw new Error(`String palette ${normalizedName} not found.`);
            return response.json();
        })
        .then(result => {
            if (!result?.data) return;
            cache[normalizedName] = result.data;
            node._derpStringPaletteData = result.data;
            node._derpStringPalette = { path: normalizedName, data: result.data };
            if (node.requestDerpSync) node.requestDerpSync();
            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
        })
        .catch(error => {
            const normalizedFallback = normalizePaletteName(fallbackPaletteName || DEFAULT_STRING_PALETTE);
            if (normalizedName !== normalizedFallback) {
                attachStringPalette(node, normalizedFallback, normalizedFallback);
                return;
            }
            if (window._xcpStringPaletteMissingWarnings?.[normalizedName] !== true) {
                window._xcpStringPaletteMissingWarnings = window._xcpStringPaletteMissingWarnings || {};
                window._xcpStringPaletteMissingWarnings[normalizedName] = true;
                showFallbackStatusMessage(node, "palette", normalizedName, "missing");
            }
            console.error("[xcpDerp] String Palette Load Error:", error);
        })
        .finally(() => {
            if (node._derpStringPalettePendingName === normalizedName) node._derpStringPalettePendingName = "";
        });
}

function clearHydratedPaintData(target) {
    if (!target) return;
    Object.keys(target).forEach((key) => {
        if (/^_.+PaintData(?:_(?:ON|DIS))?$/.test(key)) delete target[key];
    });
}

function rememberPaletteData(paletteName, data) {
    const normalizedName = normalizePaletteName(paletteName);
    if (!normalizedName || !data) return;
    getPaletteCache()[normalizedName] = data;
}

export async function loadDerpPaletteImpl(paletteName = "Derp_Default_v01") {
    if (!paletteName) return;
    const normalizedName = normalizePaletteName(paletteName);
    if (!normalizedName) return;
    if (isRetiredPaletteName(normalizedName)) return loadDerpPaletteImpl("Derp_Default_v01");
    const paletteCache = getPaletteCache();
    const cachedKey = findCaseInsensitiveKey(paletteCache, normalizedName);
    if (window.xcpActivePaletteName === normalizedName && paletteCache[normalizedName]) return;
    if (cachedKey && paletteCache[cachedKey]) {
        window.xcpActivePalette = paletteCache[cachedKey];
        window.xcpActivePaletteName = cachedKey;
        return;
    }
    if (window.xcpActivePalettePendingName === normalizedName) return;
    window.xcpActivePalettePendingName = normalizedName;
    try {
        const response = await fetch(`/xcp/load/palettes?name=${encodeURIComponent(normalizedName)}`);
        const usingFallback = response?.headers?.get?.("X-Xcp-Using-Fallback") === "1";
        if (!response.ok) throw new Error(`Palette ${normalizedName} not found.`);

        const result = await response.json();
        if (result.data) {
            rememberPaletteData(normalizedName, result.data);
            window.xcpActivePalette = result.data;
            window.xcpActivePaletteName = normalizedName;
            if (usingFallback && window._xcpPaletteFallbackWarnings?.[normalizedName] !== true) {
                window._xcpPaletteFallbackWarnings = window._xcpPaletteFallbackWarnings || {};
                window._xcpPaletteFallbackWarnings[normalizedName] = true;
                showFallbackStatusMessage(null, "palette", normalizedName, "fallback");
            }

            window.dispatchEvent(new CustomEvent("xcp_palette_changed", { detail: result.data }));

            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(node => {
                    if ((node.isFathaNode || node.isUncleNode) && node.applyPalette) {
                        node.applyPalette();
                    }
                });
            }
            if (window.xcpActiveBastas) {
                window.xcpActiveBastas.forEach(basta => {
                    if (basta.id === "basta_lora_detail_global_unique_id") {
                        basta.close();
                    } else if (basta.onThemeUpdate) {
                        basta.onThemeUpdate(window.xcpDerpThemeConfig);
                    }
                });
            }
            if (app.canvas) app.canvas.setDirty(true, true);
        }
    } catch (e) {
        if (window._xcpPaletteMissingWarnings?.[normalizedName] !== true) {
            window._xcpPaletteMissingWarnings = window._xcpPaletteMissingWarnings || {};
            window._xcpPaletteMissingWarnings[normalizedName] = true;
            const requester = window._xcpPaletteRequesters?.[normalizedName] || "";
            const displayName = requester ? `${normalizedName} (requested by ${requester})` : normalizedName;
            showFallbackStatusMessage(null, "palette", displayName, "missing");
        }
        console.error(`❌ [xcpDerp] Palette Load Error:`, e);
    } finally {
        if (window.xcpActivePalettePendingName === normalizedName) window.xcpActivePalettePendingName = "";
    }
}

export function handleThemeUpdateImpl(node, config, deps = {}) {
    const { loadDerpPalette } = deps;
    if (!config || !config.themes) return;
    const isThemeManagerV2 = node?.comfyClass === "derpThemeManagerV2";
    const themeName = isThemeManagerV2
        ? (node.properties?.selectedSystemTheme || node.properties?.selectedTheme || config.activeTheme || "Template_Standard_v02")
        : (node.properties?.selectedTheme || node.properties?.selectedThemeName || node._selectedThemeName || config.activeTheme || "Template_Standard_v02");
    const resolvedThemeKey = findCaseInsensitiveKey(config.themes, themeName) || themeName;
    let effectiveThemeKey = resolvedThemeKey;
    let theme = config.themes[resolvedThemeKey];
    const defaultTheme = "_Templates/DerpTheme_Default";

    if (themeName && themeName !== config.activeTheme) {
        if (theme && config.themeSources?.[resolvedThemeKey] === "fallback") {
            showPerNodeThemeStatusMessage(node, "fallback-loaded", themeName, resolvedThemeKey);
        } else if (!theme) {
            const resolvedDefaultTheme = findCaseInsensitiveKey(config.themes, defaultTheme) || defaultTheme;
            const fallbackTheme = config.themes[resolvedDefaultTheme];
            const fallbackSource = config.themeSources?.[resolvedDefaultTheme] || "unknown";
            if (fallbackTheme) {
                showPerNodeThemeStatusMessage(
                    node,
                    fallbackSource === "hardcoded" ? "hardcoded-switched" : "fallback-switched",
                    themeName,
                    resolvedDefaultTheme
                );
                theme = fallbackTheme;
                effectiveThemeKey = resolvedDefaultTheme;
                if (node.properties?.selectedTheme !== undefined) node.properties.selectedTheme = resolvedDefaultTheme;
                if (isThemeManagerV2) {
                    if (node.properties?.selectedSystemTheme !== undefined) node.properties.selectedSystemTheme = resolvedDefaultTheme;
                } else {
                    if (node.properties?.selectedThemeName !== undefined) node.properties.selectedThemeName = resolvedDefaultTheme;
                    if (node._selectedThemeName !== undefined) node._selectedThemeName = resolvedDefaultTheme;
                }
            } else {
                showPerNodeThemeStatusMessage(node, "missing", themeName, "");
            }
        }
    }

    if (theme) {
        requestThemeWeightOverlayHydration(node);
        clearHydratedPaintData(node);
        clearHydratedPaintData(sysPanel);
        if (node.properties?.selectedTheme !== undefined) node.properties.selectedTheme = resolvedThemeKey;
        if (isThemeManagerV2) {
            if (node.properties?.selectedSystemTheme !== undefined) node.properties.selectedSystemTheme = resolvedThemeKey;
        } else {
            if (node.properties?.selectedThemeName !== undefined) node.properties.selectedThemeName = resolvedThemeKey;
            if (node._selectedThemeName !== undefined) node._selectedThemeName = resolvedThemeKey;
        }
        const themeRevision = typeof config.getThemeRevision === "function"
            ? config.getThemeRevision(effectiveThemeKey)
            : (config._revision || 0);
        node._currentThemeName = effectiveThemeKey;
        node._currentThemeRevision = themeRevision;
        node._currentThemeCacheKey = `${effectiveThemeKey}:${themeRevision}`;
        const effectiveTheme = applyThemeWeightOverlay(theme, node._themeWeightOverlay);
        Object.entries(effectiveTheme).forEach(([key, val]) => {
            if (key.startsWith("_") || typeof val !== "object" || Array.isArray(val)) return;
            invalidateCompiledThemeCache(val);
            node[`_${key}PaintData`] = compileThemeData(val, key, "OFF");
            node[`_${key}PaintData_ON`] = compileThemeData(val, key, "ON");
            node[`_${key}PaintData_DIS`] = compileThemeData(val, key, "DIS");
            if (sysPanel) {
                sysPanel[`_${key}PaintData`] = node[`_${key}PaintData`];
                sysPanel[`_${key}PaintData_ON`] = node[`_${key}PaintData_ON`];
                sysPanel[`_${key}PaintData_DIS`] = node[`_${key}PaintData_DIS`];
            }
        });
        const paletteName = typeof effectiveTheme._palette === "string" ? effectiveTheme._palette.trim() : "";
        node._headerPaletteName = normalizePaletteName(paletteName);
        if (isRetiredPaletteName(node._headerPaletteName)) node._headerPaletteName = "";
        if (node._headerPaletteName && typeof loadDerpPalette === "function") {
            window._xcpPaletteRequesters = window._xcpPaletteRequesters || {};
            window._xcpPaletteRequesters[node._headerPaletteName] = resolvedThemeKey || themeName;
            loadDerpPalette(node._headerPaletteName);
        }
        attachStringPalette(node, getThemeStringPaletteName(effectiveTheme));
    }

    if (node._derpBgCache) {
        node._derpBgCache.key = "";
    }
    if (node.layout) {
        node.layout._lastCacheKey = "";
    }
    if (node._compDataCache) {
        node._compDataCache = {};
    }
    node._prevDerpState = null;
    node._forceSync = true;

    if (deps.preserveBastas !== true && window.xcpActiveBastas) {
        window.xcpActiveBastas.forEach(basta => {
            if (basta.hostNode === node) basta.close();
        });
    }

    if (sysPanel.isVisible && sysPanel.hostNode === node) {
        sysPanel._prevDerpState = null;
        sysPanel._shouldSync = true;
        sysPanel._layoutDirty = true;
        closeDerpSysPanel();
    }

    node.setDirtyCanvas(true, true);
}

export function handleInitDerpGlobalListenerImpl(appInstance, deps = {}) {
    const { loadDerpLocale, loadDerpPalette, hydrateDerpBackgroundSetting } = deps;
    if (window._xcpDerpGlobalActive) return;

    const initialLocale = appInstance.ui.settings.getSettingValue("Comfy.Locale") || "en-US";
    if (typeof loadDerpLocale === "function") loadDerpLocale(initialLocale);

    const configuredPalette = appInstance.ui.settings.getSettingValue("Derp.Palette") || "Derp_Default_v01";
    const initialPalette = isRetiredPaletteName(configuredPalette) ? "Derp_Default_v01" : configuredPalette;
    if (typeof loadDerpPalette === "function") loadDerpPalette(initialPalette);

    if (typeof hydrateDerpBackgroundSetting === "function") hydrateDerpBackgroundSetting();

    let lastKnownLocale = initialLocale;
    setInterval(() => {
        if (!appInstance.ui || !appInstance.ui.settings) return;
        const currentLocale = appInstance.ui.settings.getSettingValue("Comfy.Locale");
        if (currentLocale && currentLocale !== lastKnownLocale) {
            lastKnownLocale = currentLocale;
            if (typeof loadDerpLocale === "function") loadDerpLocale(currentLocale);
        }
    }, 500);

    const originalRefresh = appInstance.refreshPipeline;
    appInstance.refreshPipeline = function() {
        if (originalRefresh) originalRefresh.apply(this, arguments);
        appInstance.graph._nodes.forEach(node => {
            if ((node.isFathaNode || node.isUncleNode) && node.onThemeUpdate) {
                node.onThemeUpdate(window.xcpDerpThemeConfig);
            }
        });

        if (window.xcpActiveBastas) {
            window.xcpActiveBastas.forEach(basta => basta.close());
        }
        if (sysPanel.isVisible) {
            closeDerpSysPanel();
        }
    };

    window._xcpDerpGlobalActive = true;
}

export { getPaletteCache };
