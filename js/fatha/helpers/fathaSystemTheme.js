import { compileThemeData, invalidateCompiledThemeCache } from "../../herbina/masterPainter.js";

export const SYSTEM_THEME_NAME = "_System/_DK_System";
let systemThemePromise = null;

function normalizeThemeName(name) {
    return String(name || SYSTEM_THEME_NAME).replace(/\\/g, "/").replace(/\.json$/i, "").trim();
}

function normalizeThemeState(state) {
    return String(state || "OFF").replace(/^_/, "").toUpperCase();
}

function getSystemThemeCache() {
    if (!window.xcpDerpSystemThemeCache || typeof window.xcpDerpSystemThemeCache !== "object") window.xcpDerpSystemThemeCache = {};
    return window.xcpDerpSystemThemeCache;
}

function invalidateSystemThemeEntries(themeData) {
    Object.values(themeData || {}).forEach((entry) => {
        if (entry && typeof entry === "object" && !Array.isArray(entry)) invalidateCompiledThemeCache(entry);
    });
}

function getLiveSystemThemeRecord(themeName = SYSTEM_THEME_NAME) {
    const themes = window.xcpDerpThemeConfig?.themes;
    if (!themes) return null;
    const normalizedName = normalizeThemeName(themeName).toLowerCase();
    const liveName = Object.keys(themes).find((key) => normalizeThemeName(key).toLowerCase() === normalizedName);
    if (!liveName || !themes[liveName]) return null;
    const cfg = window.xcpDerpThemeConfig;
    const revision = typeof cfg.getThemeRevision === "function"
        ? cfg.getThemeRevision(liveName)
        : (cfg._themeRevisions?.[liveName] || cfg._revision || 0);
    return { name: liveName, theme: themes[liveName], revision };
}

export function syncDerpSystemThemeFromConfig(themeName = SYSTEM_THEME_NAME) {
    const record = getLiveSystemThemeRecord(themeName);
    if (!record) return null;

    const normalizedName = normalizeThemeName(record.name);
    if (
        window.xcpDerpSystemTheme === record.theme
        && window.xcpDerpSystemThemeName === normalizedName
        && window.xcpDerpSystemThemeRevision === record.revision
    ) {
        return record.theme;
    }

    getSystemThemeCache()[normalizedName] = record.theme;
    window.xcpDerpSystemTheme = record.theme;
    window.xcpDerpSystemThemeName = normalizedName;
    window.xcpDerpSystemThemeRevision = record.revision;
    invalidateSystemThemeEntries(record.theme);
    if (window.app?.canvas) window.app.canvas.setDirty(true, true);
    return record.theme;
}

export async function loadDerpSystemTheme(themeName = SYSTEM_THEME_NAME) {
    const normalizedName = normalizeThemeName(themeName);
    if (!normalizedName) return null;
    const liveTheme = syncDerpSystemThemeFromConfig(normalizedName);
    if (liveTheme) return liveTheme;

    const cache = getSystemThemeCache();
    if (window.xcpDerpSystemThemeName === normalizedName && window.xcpDerpSystemTheme) return window.xcpDerpSystemTheme;
    if (cache[normalizedName]) {
        window.xcpDerpSystemTheme = cache[normalizedName];
        window.xcpDerpSystemThemeName = normalizedName;
        window.xcpDerpSystemThemeRevision = null;
        return cache[normalizedName];
    }
    if (systemThemePromise) return systemThemePromise;

    systemThemePromise = fetch(`/xcp/load/themes?name=${encodeURIComponent(normalizedName)}&t=${Date.now()}`, {
        cache: "no-store",
    })
        .then((res) => {
            if (!res.ok) throw new Error(`Theme load failed: ${res.status}`);
            return res.json();
        })
        .then((payload) => {
            const themeData = payload?.data;
            if (!themeData || typeof themeData !== "object") throw new Error("Theme data missing");
            cache[normalizedName] = themeData;
            window.xcpDerpSystemTheme = themeData;
            window.xcpDerpSystemThemeName = normalizedName;
            window.xcpDerpSystemThemeRevision = null;
            invalidateSystemThemeEntries(themeData);
            if (window.app?.canvas) window.app.canvas.setDirty(true, true);
            return themeData;
        })
        .catch((error) => {
            if (window._xcpDerpSystemThemeWarningShown !== true) {
                window._xcpDerpSystemThemeWarningShown = true;
                console.warn("[xcpDerp] System theme load failed:", error);
            }
            return null;
        })
        .finally(() => {
            systemThemePromise = null;
        });

    return systemThemePromise;
}

export function resolveSystemThemePaint(keyName, state = "OFF") {
    syncDerpSystemThemeFromConfig(window.xcpDerpSystemThemeName || SYSTEM_THEME_NAME);
    const theme = window.xcpDerpSystemTheme;
    const key = theme?.[keyName];
    if (!key || typeof key !== "object" || Array.isArray(key)) return null;
    return compileThemeData(key, keyName, normalizeThemeState(state));
}

export function resolveSystemThemeFill(keyName, fallback = null, state = "OFF") {
    const theme = syncDerpSystemThemeFromConfig(window.xcpDerpSystemThemeName || SYSTEM_THEME_NAME) || window.xcpDerpSystemTheme;
    const key = theme?.[keyName];
    const stateSuffix = `_${normalizeThemeState(state)}`;
    if (!key || typeof key !== "object" || Array.isArray(key) || !Array.isArray(key[stateSuffix])) return fallback;
    const paint = resolveSystemThemePaint(keyName, state);
    return paint?.fill || fallback;
}
