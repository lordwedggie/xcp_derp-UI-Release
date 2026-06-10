/**
 * Herbina Master Widgets Utils | Path: ./Herbina/utils/widgetsUtils.js
 */

import { toRGBA, lerpColor } from "./colorMath.js";
import { parseColor } from "../masterAnimator.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";

const TEXT_EFFECT_ALPHA_FACTOR = 0.7;
const TEXT_EFFECT_BLUR_FACTOR = 2.0;
const TEXT_EFFECT_OFFSET_FACTOR = 1.5;

const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d");

// --- UNIFIED PALETTE HUB ---
const _paletteCache = {};

function getPaletteWarningHost(preferredNode = null) {
    return preferredNode || window.app?.graph?._nodes?.find?.(node => node?.isFathaNode || node?.isUncleNode) || {
        id: "xcp_palette_warning_host",
        properties: {},
        setDirtyCanvas() {},
    };
}

function showPaletteWarning(node, path, status) {
    const warningKey = `${String(path || "").toLowerCase()}::${status}`;
    window._xcpWidgetPaletteWarnings = window._xcpWidgetPaletteWarnings || {};
    if (window._xcpWidgetPaletteWarnings[warningKey]) return;
    window._xcpWidgetPaletteWarnings[warningKey] = true;
    const prefix = status === "fallback"
        ? "Palette fallback found: "
        : "Palette missing, no fallback: ";
    const msgText = prefix + "{{" + (path || "") + "}}";
    showBastaSystemMessage(getPaletteWarningHost(node), msgText, 3200, { fade: true, grow: true }, null, status === "fallback" ? "info" : "error", null, "");
}

/**
 * THE CENTRALIZED ALPHA & ANIMATION FIX:
 * Compiles the final paint object by merging static theme physics with live animation arrays.
 * Ensures that the full key (base color + shadow + stroke + glow) animates smoothly together
 * and scales correctly with transient transparency (sysAlpha).
 */
export function compileAnimatedPaint(paintData, config, sysAlpha = 1, animColors = null) {
    if (!paintData) return {};

    const toRGBAAlpha = (arr, m = 1) => {
        if (!arr || arr.length < 4) return null;
        return `rgba(${Math.round(arr[0])}, ${Math.round(arr[1])}, ${Math.round(arr[2])}, ${arr[3] * m})`;
    };

    const applyFade = (fx, animArr) => {
        if (!fx) return null;
        // 1. Fully animate the effect using masterAnimator's live arrays
        if (animArr && typeof fx === 'object') {
            return { ...fx, color: toRGBAAlpha(animArr, sysAlpha) };
        }
        // 2. Fallback to alpha-fading the static theme effect
        if (fx.color && sysAlpha < 1) {
            const match = typeof fx.color === 'string' && fx.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
            if (match) {
                const r = match[1], g = match[2], b = match[3], a = match[4] !== undefined ? parseFloat(match[4]) : 1;
                return { ...fx, color: `rgba(${r}, ${g}, ${b}, ${a * sysAlpha})` };
            }
        }
        return fx;
    };

    const cShadow = config.shadow !== undefined ? config.shadow : (paintData.shadow || paintData.shadowColor);
    const cGlow = config.glow !== undefined ? config.glow : (paintData.glow || paintData.glowColor);
    const cBorder = config.stroke !== undefined ?
        (typeof config.stroke === 'object' ? config.stroke : { color: config.stroke }) :
        (paintData.border || paintData.stroke || config.border);

    return {
        ...paintData,
        fill: animColors?.fill ? toRGBAAlpha(animColors.fill, sysAlpha) : paintData.fill,
        textColor: animColors?.fill ? toRGBAAlpha(animColors.fill, sysAlpha) : paintData.textColor,
        shadow: applyFade(cShadow, animColors?.shadow),
        glow: applyFade(cGlow, animColors?.glow),
        border: applyFade(cBorder, animColors?.stroke)
    };
}

/**
 * THE CENTRALIZED PALETTE RESOLVER: Fetches and caches palette files.
 * Returns the raw entry if cached, otherwise triggers a background fetch and returns null.
 */
export function resolvePaletteEntry(node, path, entryName) {
    if (!path || !entryName) return null;
    const normalizedPath = String(path || "").toLowerCase();
    const normalizedEntryName = String(entryName || "").toLowerCase();
    const cacheKey = `${normalizedPath}::${normalizedEntryName}`;

    if (!_paletteCache[cacheKey]) {
        _paletteCache[cacheKey] = "LOADING";
        // THE CACHE BUSTER FIX: Force the browser to fetch the updated JSON without physics arrays.
        // Without this, the browser permanently caches the corrupt legacy file.
        fetch(`/xcp/load/palettes?name=${encodeURIComponent(path)}&t=${Date.now()}`)
            .then(r => {
                const usingFallback = r?.headers?.get?.("X-Xcp-Using-Fallback") === "1";
                if (!r.ok) {
                    showPaletteWarning(node, path, "missing");
                    throw new Error(`Palette ${path} not found.`);
                }
                if (usingFallback) showPaletteWarning(node, path, "fallback");
                return r.json();
            })
            .then(json => {
                const palettes = json.data?.palettes || [];
                const targetName = String(entryName || "").toLowerCase();
                const entry = palettes.find(p => String(p?.name || "").toLowerCase() === targetName);
                _paletteCache[cacheKey] = entry || "NOT_FOUND";

                // Force a redraw once data arrives
                if (node.requestDerpSync) node.requestDerpSync();
                if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
            }).catch(() => { _paletteCache[cacheKey] = "ERROR"; });
    }

    const data = _paletteCache[cacheKey];
    return (data && data !== "LOADING" && data !== "NOT_FOUND" && data !== "ERROR") ? data : null;
}

// --- UNIFIED COLOR-KEY TEXT PARSER ---
// Parses {{keyName}} tokens in widget text strings and resolves them to colors
// from the active palette or theme paint data. Framework-level: all widgets inherit.

const COLOR_KEY_REGEX = /\{\{([a-zA-Z0-9_]+)(?::(_[A-Z]+))?(?:::([^}]*))?\}\}/g;

export function stripColorKeyTags(text) {
    if (text === null || text === undefined) return "";
    return String(text).replace(COLOR_KEY_REGEX, (match, keyName, stateSuffix, displayText) => {
        return displayText !== undefined ? displayText : match;
    });
}

function colorValueToCss(value) {
    if (!value) return null;
    if (Array.isArray(value)) return `rgba(${Math.round(value[0])},${Math.round(value[1])},${Math.round(value[2])},${value[3] ?? 1})`;
    return typeof value === 'string' ? value : null;
}

function resolveEntryStateColor(entry, stateSuffix = "_OFF") {
    const value = entry?.[stateSuffix] || entry?._OFF;
    return colorValueToCss(value);
}

function buildPaletteSegmentPaint(entry, stateSuffix = "_OFF") {
    if (!entry?.entries) return null;
    const color = resolveEntryStateColor(entry.entries.main, stateSuffix);
    if (!color) return null;
    return {
        color,
        effects: {
            shadow: resolveEntryStateColor(entry.entries.shadow, stateSuffix),
            border: resolveEntryStateColor(entry.entries.stroke, stateSuffix),
            glow: resolveEntryStateColor(entry.entries.glow, stateSuffix)
        }
    };
}

function findPalettePaint(palette, keyName, stateSuffix = "_OFF") {
    if (!palette || !keyName) return null;
    const keyLower = keyName.toLowerCase();
    if (palette?.palettes) {
        for (const entry of palette.palettes) {
            if (String(entry?.name || "").toLowerCase() === keyLower) {
                return buildPaletteSegmentPaint(entry, stateSuffix);
            }
        }
    }
    if (palette && palette[keyName] !== undefined) {
        const val = palette[keyName];
        const color = Array.isArray(val) ? toRGBA(val) : typeof val === 'string' ? val : null;
        return color ? { color, effects: undefined } : null;
    }
    return null;
}

function getNodeStringPaletteContext(node, palette = null) {
    if (palette) return palette;
    if (node?._derpStringPalette) return node._derpStringPalette;
    if (node?.hostNode?._derpStringPalette) return node.hostNode._derpStringPalette;
    if (node?.properties?._derpStringPalette) return node.properties._derpStringPalette;
    if (node?.hostNode?.properties?._derpStringPalette) return node.hostNode.properties._derpStringPalette;
    return null;
}

function getNodeStringPaletteData(node, context = null) {
    if (context?.data) return context.data;
    if (node?._derpStringPaletteData) return node._derpStringPaletteData;
    if (node?.hostNode?._derpStringPaletteData) return node.hostNode._derpStringPaletteData;
    return null;
}

function resolveExactColorKeyPaint(node, keyName, stateSuffix = "_OFF") {
    if (!node || !keyName) return null;
    const targetFull = `_${keyName}PaintData${stateSuffix}`.toLowerCase();
    const targetBase = `_${keyName}PaintData`.toLowerCase();
    const findData = (owner) => {
        if (!owner) return null;
        const keys = Object.keys(owner);
        const match = keys.find(key => key.toLowerCase() === targetFull)
            || keys.find(key => key.toLowerCase() === targetBase);
        return match ? owner[match] : null;
    };
    const paintData = findData(node) || findData(node.hostNode);
    const color = paintData?.fill || paintData?.textColor;
    const cssColor = Array.isArray(color) ? toRGBA(color) : typeof color === 'string' ? color : null;
    if (!cssColor) return null;
    return {
        color: cssColor,
        effects: {
            shadow: paintData?.shadow?.color || null,
            border: paintData?.border?.color || null,
            glow: paintData?.glow?.color || null
        }
    };
}

function findInlinePaletteEntry(palette, entryName) {
    const palettes = palette?.data?.palettes || palette?.palettes;
    if (!Array.isArray(palettes) || !entryName) return null;
    const target = String(entryName).toLowerCase();
    return palettes.find(item => String(item?.name || "").toLowerCase() === target) || null;
}

function resolveColorKey(node, keyName, stateSuffix = "_OFF", palette = null) {
    const stringPaletteContext = getNodeStringPaletteContext(node, palette);
    const stringPaletteData = getNodeStringPaletteData(node, stringPaletteContext);
    const stringPalettePaint = findPalettePaint(stringPaletteData, keyName, stateSuffix);
    if (stringPalettePaint) return stringPalettePaint;

    if (stringPaletteContext?.path) {
        const entry = resolvePaletteEntry(node, stringPaletteContext.path, keyName);
        const entryPaint = buildPaletteSegmentPaint(entry, stateSuffix);
        if (entryPaint) return entryPaint;
    }

    const globalPalettePaint = findPalettePaint(window.xcpActivePalette, keyName, stateSuffix);
    if (globalPalettePaint) return globalPalettePaint;

    return resolveExactColorKeyPaint(node, keyName, stateSuffix);
}

export function parseColorKeyText(text, node, stateSuffix = "_OFF", fallbackColor = null, palette = null) {
    if (!text || typeof text !== 'string') return { segments: null, hasColorKeys: false };
    COLOR_KEY_REGEX.lastIndex = 0;
    const raw = [];
    let lastIndex = 0, match, found = false;
    while ((match = COLOR_KEY_REGEX.exec(text)) !== null) {
        found = true;
        if (match.index > lastIndex) raw.push({ text: text.slice(lastIndex, match.index), color: null, effects: undefined });
        const tokenState = match[2] || stateSuffix;
        const displayText = match[3] !== undefined ? match[3] : match[0];
        const paint = resolveColorKey(node, match[1], tokenState, palette);
        raw.push({ text: displayText, color: paint?.color || null, effects: paint?.effects });
        lastIndex = COLOR_KEY_REGEX.lastIndex;
    }
    if (lastIndex < text.length) raw.push({ text: text.slice(lastIndex), color: null, effects: undefined });
    if (!found) return { segments: null, hasColorKeys: false };
    const segments = [];
    for (const seg of raw) {
        const prev = segments[segments.length - 1];
        const sameEffects = JSON.stringify(prev?.effects) === JSON.stringify(seg.effects);
        if (prev && prev.color === seg.color && sameEffects) prev.text += seg.text;
        else segments.push(seg);
    }
    return { segments, hasColorKeys: true };
}

export function colorSegmentsToHTML(segments, fallbackColor = null, options = {}) {
    if (!segments || segments.length === 0) return "";
    const div = document.createElement("div");
    return segments.map(seg => {
        div.textContent = seg.text;
        const escaped = div.innerHTML;
        const color = seg.color || fallbackColor;
        const styles = [];
        if (color) styles.push(`color:${color}`);
        if (typeof options.getTextShadow === "function") {
            const textShadow = options.getTextShadow(seg);
            if (textShadow) styles.push(`text-shadow:${textShadow}`);
        }
        return styles.length ? `<span style="${styles.join(";")}">${escaped}</span>` : escaped;
    }).join('');
}

function scaleTextEffectAlpha(colorStr, factor) {
    if (!colorStr) return "transparent";
    const match = String(colorStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!match) return colorStr;
    const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha * factor})`;
}

function buildTextShadowLayer(effect, scale) {
    if (!effect) return null;
    const offX = (Number(effect.offsetX) || 0) * TEXT_EFFECT_OFFSET_FACTOR * scale;
    const offY = (Number(effect.offsetY) || 0) * TEXT_EFFECT_OFFSET_FACTOR * scale;
    const blur = Math.max(0, (Number(effect.blur) || 0) * TEXT_EFFECT_BLUR_FACTOR * scale);
    const color = scaleTextEffectAlpha(effect.color, TEXT_EFFECT_ALPHA_FACTOR);
    return `${offX}px ${offY}px ${blur}px ${color}`;
}

export function buildColorSegmentTextShadow(segment, paintData, scale = 1) {
    if (!segment?.effects) return null;
    const shadow = segment.effects.shadow && paintData?.shadow
        ? { ...paintData.shadow, color: segment.effects.shadow }
        : null;
    const glow = segment.effects.glow && paintData?.glow
        ? { ...paintData.glow, color: segment.effects.glow }
        : null;
    const layers = [buildTextShadowLayer(shadow, scale), buildTextShadowLayer(glow, scale)].filter(Boolean);
    return layers.length ? layers.join(", ") : "none";
}

// --- UNIFIED DERP TEXT METRICS ---
export const DERP_FONT_SIZE_SCALE = 1.0;

/**
 * THE PARITY FIX: Forces a local coordinate to snap to the exact physical
 * pixel grid of the screen, matching the browser's HTML snapping logic.
 */
export function snapToScreenGrid(localVal, scale, screenOffset = 0) {
    if (!scale || scale === 0) return localVal;
    // THE FIX: Round the absolute screen-space coordinate, then convert back to local.
    // This ensures Canvas draw calls land on the same physical pixel as HTML elements.
    const absolutePos = (localVal * scale) + screenOffset;
    return (Math.round(absolutePos) - screenOffset) / scale;
}

export function getDerpTextLineHeight(fontSize) {
    // THE ACCURACY FIX: Removed the 1.2x multiplier to match raw font height
    return fontSize;
}

export function getDerpTextColor(safeConfig, labelPaint) {
    return safeConfig.textColor || labelPaint?.textColor || labelPaint?.fill || "white";
}
// --------------------------------

export function calculateScreenCoords(node, app, localX, localY, width, height) {
    if (!node || !app?.canvas?.ds) return null;
    const ds = app.canvas.ds;
    const scale = ds.scale;
    const canvasRect = window.xcpDerpSingleton?.getCanvasRect ? window.xcpDerpSingleton.getCanvasRect() : app.canvas.canvas.getBoundingClientRect();
    return {
        left: `${canvasRect.left + (node.pos[0] + ds.offset[0] + localX) * scale}px`,
        top: `${canvasRect.top + (node.pos[1] + ds.offset[1] + localY) * scale}px`,
        width: `${width * scale}px`,
        height: `${height * scale}px`,
        scale: scale
    };
}

let currentZ = 10001;
export function getNextZIndex() { return currentZ++; }

export function measureTextHeight(text, maxWidth, themeData, paddingH = 0) {
    const visibleText = stripColorKeyTags(text);
    const fontSize = themeData?.fontSize;
    const fontFamily = themeData?.font || "arial";
    const fontWeight = themeData?.fontWeight || "normal";
    if (typeof fontSize !== 'number' || fontSize <= 0) return 0;

    // THE SANITIZATION FIX: Prevent double-quoting and strip legacy " px" suffixes
    const baseFont = fontFamily || "arial";
    const cleanFont = baseFont.replace(/\bpx\b/gi, "").trim();
    const safeFont = (cleanFont.includes(",") || cleanFont.includes('"') || cleanFont.includes("'"))
        ? cleanFont
        : `"${cleanFont}"`;

    _measureCtx.font = `${fontWeight} ${fontSize}px ${safeFont}`;

    // THE FIX: If maxWidth is provided (wrapping enabled), calculate total line height
    if (maxWidth > 0) {
        const lines = wrapTextToLines(visibleText, maxWidth, fontSize, fontFamily, fontWeight);
        return (Math.max(1, lines.length) * fontSize) + paddingH;
    }

    // THE ACCURACY FIX: Measure the actual text provided and remove the 1.2x floor
    const metrics = _measureCtx.measureText(visibleText || "Hgyj");
    const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    return Math.max(inkHeight, fontSize);
}

export function measureTextWidth(text, fontSize, fontFamily, fontWeight = "normal") {
    const visibleText = stripColorKeyTags(text);
    const baseFont = fontFamily || "arial";
    const cleanFont = baseFont.replace(/\bpx\b/gi, "").trim(); // THE FIX: Remove rogue "px"
    const safeFont = (cleanFont.includes(",") || cleanFont.includes('"') || cleanFont.includes("'"))
        ? cleanFont
        : `"${cleanFont}"`;

    _measureCtx.font = `${fontWeight} ${fontSize}px ${safeFont}`;
    return _measureCtx.measureText(visibleText || "").width;
}

const CJK_WRAP_CHAR_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]/;

function getWrapTokens(text) {
    const tokens = [];
    let buffer = "";
    let bufferType = null;

    for (const char of Array.from(String(text || ""))) {
        if (char === "\n") {
            if (buffer) tokens.push(buffer);
            buffer = "";
            bufferType = null;
            tokens.push("\n");
            continue;
        }

        const type = /\s/.test(char) ? "space" : (CJK_WRAP_CHAR_RE.test(char) ? "cjk" : "word");
        if (type === "cjk") {
            if (buffer) tokens.push(buffer);
            buffer = "";
            bufferType = null;
            tokens.push(char);
            continue;
        }

        if (bufferType === type) {
            buffer += char;
        } else {
            if (buffer) tokens.push(buffer);
            buffer = char;
            bufferType = type;
        }
    }

    if (buffer) tokens.push(buffer);
    return tokens;
}

function pushWrappedLine(lines, line) {
    lines.push(String(line || "").trimEnd());
}

export function wrapTextToLines(text, maxWidth, fontSize, fontFamily, fontWeight = "normal") {
    const visibleText = stripColorKeyTags(text);
    if (!(maxWidth > 0)) return [String(visibleText || "")];

    const lines = [];
    let currentLine = "";

    for (const token of getWrapTokens(visibleText)) {
        if (token === "\n") {
            pushWrappedLine(lines, currentLine);
            currentLine = "";
            continue;
        }

        if (/^\s+$/.test(token) && currentLine === "") continue;

        const testLine = currentLine + token;
        if (currentLine && measureTextWidth(testLine, fontSize, fontFamily, fontWeight) > maxWidth) {
            pushWrappedLine(lines, currentLine);
            currentLine = /^\s+$/.test(token) ? "" : token;
        } else {
            currentLine = testLine;
        }

        if (currentLine && measureTextWidth(currentLine, fontSize, fontFamily, fontWeight) > maxWidth) {
            const chars = Array.from(currentLine);
            currentLine = "";
            for (const char of chars) {
                const testCharLine = currentLine + char;
                if (currentLine && measureTextWidth(testCharLine, fontSize, fontFamily, fontWeight) > maxWidth) {
                    pushWrappedLine(lines, currentLine);
                    currentLine = char;
                } else {
                    currentLine = testCharLine;
                }
            }
        }
    }

    pushWrappedLine(lines, currentLine);
    return lines.length ? lines : [""];
}
/**
 * Standardizes the parsing of themeKey strings: "BodyKey, LabelKey, FontSizeOverride"
 */
export function parseThemeKey(themeKey, defaultLabelKey = "t_textsmall") {
    if (!themeKey) return { bodyKey: "panel", labelKey: defaultLabelKey, fontSizeOverride: null };

    const parts = themeKey.split(",").map(p => p.trim());
    const fontSize = (parts.length === 3 && parts[2] !== "" && !isNaN(parts[2])) ? parseFloat(parts[2]) : null;

    return {
        bodyKey: parts[0] || "panel",
        labelKey: parts[1] || defaultLabelKey,
        fontSizeOverride: fontSize
    };
}
/**
 * Consolidates theme key lookup and error reporting.
 * @param {object} node - The host node.
 * @param {string} key - The base theme key (e.g., 'panel').
 * @param {string} suffix - The state suffix (e.g., '_ON').
 * @returns {object|null} - The paint data object or null.
 */
/**
 * resolvePaintData: The "Heist" Resolver.
 * Combines structural theme data with optional palette overrides.
 * Rule: Colors/Effects override, Geometry/Fonts stay theme-native.
 */
export function resolvePaintData(node, key, suffix = "", overrideColor = null, palette = null) {
    if (!node || !key || key === "null") return null;

    const targetFull = `_${key}PaintData${suffix}`.toLowerCase();
    const targetBase = `_${key}PaintData`.toLowerCase();

    let owner = node;
    let nodeKeys = Object.keys(owner);
    let matchedFull = nodeKeys.find(k => k.toLowerCase() === targetFull);
    let matchedBase = nodeKeys.find(k => k.toLowerCase() === targetBase);
    let data = owner[matchedFull] || owner[matchedBase];

    // THE CASCADE FIX: Allow Bastas to use their own hydrated paint data first,
    // before falling back to their hostNode for inherited styles.
    if (!data && node.hostNode) {
        owner = node.hostNode;
        nodeKeys = Object.keys(owner);
        matchedFull = nodeKeys.find(k => k.toLowerCase() === targetFull);
        matchedBase = nodeKeys.find(k => k.toLowerCase() === targetBase);
        data = owner[matchedFull] || owner[matchedBase];
    }

    // 1. Clone theme data (geometry source: font, fontSize, corners, etc.)
    // If key not found, try to inherit geometry from a fallback theme key
    if (!data) {
        // Fallback geometry: use t_textSystem for text keys, region for body keys
        const isTextKey = key.toLowerCase().includes("text") || key.toLowerCase().includes("tooltip");
        const fallbackKey = isTextKey ? "t_textSystem" : "region";
        if (fallbackKey !== key) {
            const fallbackFull = `_${fallbackKey}PaintData${suffix}`.toLowerCase();
            const fallbackBase = `_${fallbackKey}PaintData`.toLowerCase();
            let fOwner = owner;
            let fKeys = Object.keys(fOwner);
            let fMatch = fKeys.find(k => k.toLowerCase() === fallbackFull) || fKeys.find(k => k.toLowerCase() === fallbackBase);
            let fData = fOwner[fMatch];
            if (!fData && node.hostNode) {
                fOwner = node.hostNode;
                fKeys = Object.keys(fOwner);
                fMatch = fKeys.find(k => k.toLowerCase() === fallbackFull) || fKeys.find(k => k.toLowerCase() === fallbackBase);
                fData = fOwner[fMatch];
            }
            if (fData) data = { ...fData };
        }
    }
    if (data) data = { ...data };
    else data = null;

    // Apply manual override first (palette injection below takes priority)
    if (overrideColor && data) {
        const colorStr = Array.isArray(overrideColor) ? toRGBA(overrideColor) : overrideColor;
        data.fill = colorStr;
        data.textColor = colorStr;
    }

    // 2. Palette Injection (colors only — overwrites fill/textColor from theme)
    // THE INHERITANCE FIX: Automatically inherit palette from the node/basta properties if not provided in the widget config
    const activePalette = palette || node.properties?.palette;

    if (activePalette?.path) {
        // THE FUZZY FALLBACK FIX: If no entry is provided, try the specific key (buttonNode),
        // then fall back to the generic type (button, text) to match the "Only Colors" palette JSON.
        const targetEntry = activePalette.entry || key;
        let pal = findInlinePaletteEntry(activePalette, targetEntry);
        if (!pal) pal = resolvePaletteEntry(owner, activePalette.path, targetEntry);

        if (!pal && !activePalette.entry) {
            const genericKey = key.toLowerCase().includes("button") ? "button" : (key.toLowerCase().includes("text") ? "text" : null);
            if (genericKey) pal = findInlinePaletteEntry(activePalette, genericKey);
            if (!pal && genericKey) pal = resolvePaletteEntry(owner, activePalette.path, genericKey);
        }

        if (pal?.entries) {
            const e = pal.entries;
            const s = suffix || "_OFF";

            // THE FOOLPROOF EXTRACTION FIX: Extract color safely regardless of cached legacy arrays, raw RGBA arrays, or strings.
            const extractColor = (val) => {
                if (!val) return "transparent";
                if (typeof val === 'string') return val;
                if (Array.isArray(val)) {
                    // Legacy Fatha arrays [offsetX, offsetY, blur, "rgba(...)"]
                    if (typeof val[val.length - 1] === 'string') return val[val.length - 1];
                    // Raw Palette Arrays [r, g, b, a]
                    if (val.length >= 4) return `rgba(${Math.round(val[0])}, ${Math.round(val[1])}, ${Math.round(val[2])}, ${val[3]})`;
                    // Safe fallback
                    if (typeof toRGBA === 'function') return toRGBA(val);
                }
                return val;
            };

            if (!data) data = {};
            if (e.main?.[s]) {
                const c = extractColor(e.main[s]);
                data.fill = c;
                data.textColor = c;
            }

            // THE INJECTION FIX: Prevent invalid CSS strings from being silently rejected by the canvas.
            // THE NAMING ALIGNMENT: Hydrated paint data uses 'border', not 'stroke'.
            const applyEffectColor = (targetKey, entry) => {
                if (!entry?.[s]) return;
                const c = extractColor(entry[s]);

                if (Array.isArray(data[targetKey])) {
                    const newArr = [...data[targetKey]];
                    newArr[newArr.length - 1] = c;
                    data[targetKey] = newArr;
                } else if (data[targetKey] && typeof data[targetKey] === 'object') {
                    data[targetKey] = { ...data[targetKey], color: c };
                } else {
                    // THE PHYSICS FALLBACK: Provide default layout properties if the theme key was missing them
                    const defaults = {
                        shadow: { color: c, blur: 8, offsetX: 0, offsetY: 2 },
                        border: { color: c, width: 1, placement: 0 },
                        glow: { color: c, blur: 10, offsetX: 0, offsetY: 0 }
                    };
                    data[targetKey] = defaults[targetKey] || { color: c };
                }
            };

            applyEffectColor('shadow', e.shadow);
            applyEffectColor('border', e.stroke); // THE FIX: Map palette 'stroke' to hydrated 'border'
            applyEffectColor('glow', e.glow);
        }
    }

    // 3. If still no data but overrideColor is set, return minimal paint
    if (!data && overrideColor) {
        const c = Array.isArray(overrideColor) ? toRGBA(overrideColor) : overrideColor;
        return { fill: c, textColor: c, font: "Arial", fontSize: 10 };
    }

    return data;
}
export function parseInset(val) {
    if (!val) return [0, 0, 0, 0];
    let arr = val;
    if (typeof val === 'string') arr = val.split(",").map(v => parseFloat(v.trim()) || 0);
    if (!Array.isArray(arr)) return [0, 0, 0, 0];
    // THE ORDER FIX: Return [Left, Top, Right, Bottom]
    if (arr.length === 2) return [arr[0], arr[1], arr[0], arr[1]]; // [H, V] -> [L, T, R, B]
    if (arr.length === 4) return [arr[0], arr[1], arr[2], arr[3]]; // [L, T, R, B]
    return [0, 0, 0, 0];
}

export function resolveInterpolatedPaint(node, key, percent, overrideColor = null, palette = null) {

    const dataOff = resolvePaintData(node, key, "_OFF", overrideColor, palette);
    const dataOn = resolvePaintData(node, key, "_ON", overrideColor, palette);

    if (!dataOff && !dataOn) return null;
    if (!dataOff) return dataOn;
    if (!dataOn) return dataOff;

    const res = { ...dataOn };
    const c1 = parseColor(dataOff.fill || "transparent");
    const c2 = parseColor(dataOn.fill || "transparent");
    res.fill = lerpColor(c1, c2, percent);

    return res;
}

export function interpretLayoutProps(config, context = {}) {
    // --- SAFETY GUARD & VISIBILITY TOGGLE ---
    // 1. Prevents "Cannot read properties of null" if a property (like 'type: null') is falsely parsed as a child object.
    // 2. Zeroes out all dimensions if an element is explicitly hidden or its type is nulled.
    if (!config || typeof config !== 'object' || config.hidden || config.type === null) {
        return {
            objX: "left", objY: "top", labelAlign: ["left", "middle"],
            bodyKey: "panel", labelKey: "t_textsmall",
            width: 0, minWidth: 0, height: 0, baseHeight: 0,
            margin: [0, 0], padding: [0, 0], spacing: [0, 0]
        };
    }

    // 1. Syntax Validation for objectAlign
    if (config.objectAlign && !Array.isArray(config.objectAlign)) {
        console.warn(`[Layout Warning] 'objectAlign' for '${config.label || 'unknown'}' should be an Array [x, y]. Provided:`, config.objectAlign);
    }
    const obj = Array.isArray(config.objectAlign) ? config.objectAlign : [config.align || "left", config.baseline || "top"];

    // 2. Syntax Validation for labelAlign
    if (config.labelAlign && !Array.isArray(config.labelAlign)) {
        console.warn(`[Layout Warning] 'labelAlign' for '${config.label || 'unknown'}' should be an Array [x, y]. Provided:`, config.labelAlign);
    }
    const lbl = Array.isArray(config.labelAlign) ? config.labelAlign : [config.labelX || config.align || "left", config.labelY || config.baseline || "middle"];

    // 3. Unified Theme Interpretation
    // THE THEME-KEY PARITY FIX: Support both themeKey string and textThemeKey array to match widget behavior
    const tKeys = config.themeKey || config.textThemeKey || "";
    const themeParts = Array.isArray(tKeys) ? tKeys : tKeys.split(",").map(p => p.trim());

    // Logic: If 3 parts, it's Body, Fill, Label. If 2, it's Body, Label. If 1, it's Label.
    const isThreeKeys = themeParts.length === 3 && isNaN(themeParts[2]);
    const bodyKey = themeParts.length > 1 ? themeParts[0] : "panel";
    const labelKey = isThreeKeys ? themeParts[2] : (themeParts.length === 1 ? themeParts[0] : (themeParts[1] || "t_textsmall"));
    const fillKey = isThreeKeys ? themeParts[1] : null;
    const fillStrength = config.fillStrength !== false;
    const fillPadding = parseInset(config.fillPadding);

    // THE OVERRIDE FIX: Priority is Widget Config > Theme String > Paint Data
    const fontSize = config.fontSize || ((themeParts[2] && !isNaN(themeParts[2])) ? parseFloat(themeParts[2]) : null);
    const fontOffset = (themeParts[3] && !isNaN(themeParts[3])) ? parseFloat(themeParts[3]) : 0;

    // --- PADDING CALCULATIONS ---
    const padding = parseInset(config.padding || [0, 0]);
    const padW = (padding[0] || 0) + (padding[2] || 0); // Left + Right
    const padH = (padding[1] || 0) + (padding[3] || 0); // Top + Bottom

    // --- ENFORCED TEXT MEASUREMENT ---
    let measuredContentW = 0;
    let measuredContentH = 0;
    let labelPaintData = null;

    const labelToggle = config.label ?? config.text;
    const isLabelVisible = labelToggle !== "off" && labelToggle !== false;
    const labelStr = (labelToggle === "on" || labelToggle === "text" || typeof labelToggle === "boolean") ? "" : labelToggle;

    // THE FIX: If it's a container (has a direction), don't treat it as a measurement failure
    const isContainer = !!config.dir;

    // Trigger measurement if content exists or legacy label string is present
    if (!isContainer && (config.themeKey || config.text || config.label || config.value || config.icon || labelStr)) {
        // THE MULTI-KEY DISPLAY FIX: Combine label and text for accurate width measurement
        let txt = (config.label && config.text) ? `${config.label}${config.text}` : (config.text ?? config.displayText ?? labelStr ?? config.value);
        // THE FIX: Allow numeric seeds and dashes to be measured
        const hasText = isLabelVisible && (txt !== undefined && txt !== null && txt.toString().length > 0);
        const fontWeight = config.fontWeight || "normal";

        // THE FIX: Support numeric-only height measurement
        const numberOnly = config.numberOnly === true;
        const numMeasureStr = "9876543210";

        labelPaintData = resolvePaintData(context.owner, labelKey);
        const fs = fontSize || labelPaintData?.fontSize || context.textTheme?.fontSize || 0;
        const font = labelPaintData?.font || (context.textTheme ? context.textTheme.font : "DengXian Light");

        if (config.icon && !hasText) {
            // FIXED: Mirror the Engine's 12px fallback logic directly to create the square.
            const engineBaseHeight = fontSize || 12;
            measuredContentW = engineBaseHeight + (padH - padW);
            measuredContentH = engineBaseHeight;
        } else {
            // THE PROMPT-BOOK FIX: Strip base64 image markers before measuring text width
            // to prevent the node from expanding to 2000px+ based on binary data.
            const IMG_REGEX = /\[\[IMG:.*?\]\]/g;
            const contentString = String(txt ?? "99").replace(IMG_REGEX, "");

            // THE AUTO-INDICATOR FIX: Automatically reserve space for dropdown arrows or toggles
            const typeStr = String(config.type).toLowerCase();
            const isDropdown = typeStr.includes("dropdown") || typeStr.includes("filebrowser");
            const isTrigger = typeStr.includes("trigger");
            const isToggle = typeStr.includes("toggle") || isTrigger;
            const explicitIndicator = config.indicator === true || config.indicator === "on";

            // THE TOGGLE-WIDTH FIX: Support style: ["rect", 20] and prioritize icon width
            const styleRaw = config.style;
            const styleName = Array.isArray(styleRaw) ? styleRaw[0] : (styleRaw || "default");
            const styleIconW = Array.isArray(styleRaw) ? styleRaw[1] : null;

            const toggleFactor = typeStr.includes("trigger") ? 1.0 : (isToggle ? (styleName === "rect" ? 2.2 : 1.8) : 1.5);
            const triggerWeight = Number(config.weight);
            const allowTriggerWeight = config.showWeight !== false;
            const showTriggerWeight = allowTriggerWeight && Number.isFinite(triggerWeight) && Math.abs(triggerWeight - 1.0) > 1e-6;
            const triggerNeedsIndicator = isTrigger && (showTriggerWeight || !!styleIconW || !!config.toggleWidth);
            const hasIndicator = explicitIndicator || isDropdown || (!isTrigger && isToggle) || triggerNeedsIndicator;
            // THE INDICATOR GAP FIX: Explicitly account for the gap between glyph and text
            const widgetGap = hasIndicator ? (config.gap ?? (isToggle ? 4 : 0)) : 0;
            let baseIndicatorW = styleIconW || config.toggleWidth || (hasIndicator ? ((fs || 10) * toggleFactor) : 0);
            if (isTrigger && showTriggerWeight && !config.toggleWidth) {
                const weightFs = config.weightFontSize || Math.min((fs || 10), 5);
                const weightW = measureTextWidth(triggerWeight.toFixed(2), weightFs, font, config.fontWeight || "normal");
                baseIndicatorW = Math.max(baseIndicatorW, weightW + 6); // 6 = WEIGHT_ICON_PAD * 2
            }
            const indicatorBuffer = baseIndicatorW + (baseIndicatorW > 0 ? widgetGap : 0);
            // THE FIX: Support array-based [string, themeKey] for measureText
            let measureString = contentString;
            let measureThemeKey = labelKey;

            if (Array.isArray(config.measureText)) {
                measureString = String(config.measureText[0] ?? contentString);
                measureThemeKey = config.measureText[1] || labelKey;
            } else if (config.measureText !== undefined) {
                measureString = String(config.measureText);
            }

            // Resolve the specific paint data for measurement if a themeKey was provided in the array
            const measurePaint = (measureThemeKey !== labelKey) ? resolvePaintData(context.owner, measureThemeKey) : labelPaintData;
            const mFs = fontSize || measurePaint?.fontSize || context.textTheme?.fontSize || 0;
            const mFont = measurePaint?.font || font;
            const mWeight = config.fontWeight || measurePaint?.fontWeight || "normal";

            const heightMeasureString = numberOnly ? numMeasureStr : measureString;
            const isWrapping = !!config.wrap;

            // THE WRAP WIDTH FIX: Use the host node's physical width as a fallback during Pass 1
            // so text measuring has a boundary to calculate multi-line height against.
            const fallbackW = (context.owner && context.owner.size) ? Math.max(0, context.owner.size[0] - padW - 20) : 0;
            const engineInnerW = (context.geometry?.w !== undefined && context.geometry.w > 0) ? (context.geometry.w - padW) : fallbackW;
            // THE PADDING REFINEMENT: Ensure numeric widths also respect the padding floor for text clamping
            const innerW = (typeof config.width === 'number') ? Math.max(0, config.width - padW) : engineInnerW;

            const resolvedWeight = config.fontWeight || labelPaintData?.fontWeight || "normal";

            // THE DISPLAY MODE FIX: Respect "cutoff" vs "ellipsis" and account for indicator space
            const useEllipsis = config.displayMode === "ellipsis";

            const panelAutoWidth = context.owner?.properties?.autoWidth !== false;
            const isCutoff = config.cutoff === true || config.displayMode === "cutoff" || useEllipsis || (!panelAutoWidth && config.width === "full");
            const clampW = innerW - (isCutoff ? indicatorBuffer : 0);

            const safeFs = Math.max(1, fs);
            let resolvedText = contentString;
            const isAutoW = String(config.width).toLowerCase() === "auto";
            const typeLower = String(config.type || "").toLowerCase();
            const allowWidgetShrink = typeLower.includes("simplebtn") && config.noShrink !== true;


            if (innerW > 0 && !isWrapping && !isAutoW && (context.originalWidth > 20) && !/\{\{/.test(contentString)) {
                const targetW = isCutoff ? Math.max(0, clampW) : Math.max(0, innerW);
                resolvedText = allowWidgetShrink
                    ? contentString
                    : clampText(contentString, targetW, safeFs, font, resolvedWeight, useEllipsis);
            }

            measuredContentW = ((isCutoff || isWrapping) && !isAutoW) ? indicatorBuffer : Math.ceil(measureTextWidth(measureString, Math.max(1, mFs), mFont, mWeight) + indicatorBuffer);
            config._resolvedDisplayText = resolvedText;

            // THE HEIGHT MEASURE FIX: Use the engineInnerW calculated above to simulate wrapping width
            const maxWidth = isWrapping ? (typeof config.width === 'number' ? config.width : engineInnerW) : 0;
            measuredContentH = measureTextHeight(heightMeasureString, maxWidth, { fontSize: mFs, font: mFont, fontWeight: mWeight }) || mFs;
        }
    } else {
        measuredContentH = 0;
    }

    // --- WIDTH INTERPRETATION ---
    let w = config.width;
    let explicitMin = config.minWidth || 0;

    if (typeof w === 'string') {
        const lowW = w.toLowerCase();
        if (lowW === 'full') {
            // THE FIX: Enforce measured floor for 'full' elements so they reserve correct space in Pass 1
            explicitMin = Math.max(explicitMin, measuredContentW + padW);
            w = 'full';
        } else if (lowW === 'auto') {
            // THE FIX: Add Left and Right padding (padW) to the measured width so the Engine allocates enough room
            w = measuredContentW + padW;
        } else if (lowW === 'fit') {
            // Fit acts like "fill", but we enforce the measured text + padding as the minimum floor
            explicitMin = Math.max(explicitMin, measuredContentW + padW);
            w = 'fit';
        } else {
            w = lowW;
        }
    } else if (typeof w !== 'number') {
        w = padW; // Default to padding size if no width
    }

    // --- HEIGHT INTERPRETATION ---
    let h = config.height;

    if (h === 0) {
        h = 0;
    } else if (h === "auto" || h === undefined || h === null) {
        h = "auto";
    }

    // Return object with enforced minWidth
    return {
        objX: obj[0],
        objY: obj[1],
        labelAlign: [lbl[0], lbl[1]],
        bodyKey: bodyKey,
        fillKey: fillKey,
        fillStrength: fillStrength,
        fillPadding: fillPadding,
        fillbarHeight: config.fillbarHeight ?? null,
        labelKey: labelKey,
        fontSize: fontSize,
        fontOffset: fontOffset,
        fontWeight: config.fontWeight || labelPaintData?.fontWeight || "normal",
        numberOnly: config.numberOnly === true,
        displayText: config._resolvedDisplayText || "",
        width: w,
        minWidth: explicitMin, // <--- Engine will use this as the floor for 'fit' calculations
        height: h,
        // THE FIX: Add vertical padding to the measured text height to determine the final 'auto' region height
        baseHeight: measuredContentH + padH,
        margin: config.margin || null,
        padding: padding,
        spacing: config.spacing || (typeof config.spacing === 'number' ? [0, config.spacing] : null)
    };
}
/**
 * CATEGORY 1: INTERACTION & STATE RESOLUTION
 * Standardizes the logic for OFF, ON, and DIS (Disabled) states.
 */
export function resolveWidgetState(config) {
    const rawState = config.state;
    const isDisabled = config.disabled === true || rawState === "DIS" || rawState === null;

    if (isDisabled) return "DIS";
    if (rawState === true || rawState === "ON") return "ON";
    return "OFF";
}

/**
 * CATEGORY 2: HTML INTERACTION STYLES
 * Applies common CSS for cursors, pointer-events, and filters based on state.
 */
export function applyInteractionStyles(el, config, state) {
    if (!el) return;

    const isDisabled = state === "DIS";
    const isHoverDisabled = config.mouseOver === false;

    // 1. Cursor & Interaction
    el.style.cursor = (isDisabled || isHoverDisabled) ? (config.cursor || "default") : (config.cursor || "pointer");
    el.style.pointerEvents = isDisabled ? "none" : "auto";

    // 2. Visual Filtering (Standard hover/active brightness)
    // Preserve theme-provided drop-shadow filters (outside glow/shadow),
    // while still clearing legacy interaction filters.
    el.style.filter = el._derpThemeFilter || "none";

    // 3. Native Disabled Property (for <select>, <input>, etc.)
    if ('disabled' in el) {
        el.disabled = isDisabled;
    }
}

/**
 * CATEGORY 3: COMMON CONTENT & CALLBACK MAPPING
 * Standardizes label/text fallbacks and interaction callbacks.
 */
export function getWidgetContent(config) {
    return {
        text: config.text || config.label || config.value || "",
        value: config.value !== undefined ? config.value : (config.text || config.label || ""),
        icon: config.icon || "fallback"
    };
}

export function getWidgetCallbacks(config, state) {
    const isDisabled = state === "DIS";
    return {
        // THE ALIAS FIX: Support both onPress and onClick interchangeably
        onPress: config.onPress || config.onClick,
        // Blocks execution if the widget is disabled
        handlePress: (e, ...args) => {
            if (isDisabled) return;
            if (e?.stopPropagation) e.stopPropagation();
            if (e?.preventDefault) e.preventDefault();

            const callback = config.onPress || config.onClick;
            if (callback) callback(...args);
        }
    };
}

/**
 * CATEGORY 4: ALIGNMENT & GEOMETRY
 * Helpers for processing object and label alignment arrays.
 */
export function getAlignmentMaps() {
    return {
        justify: { left: "flex-start", center: "center", right: "flex-end" },
        align: { top: "flex-start", middle: "center", bottom: "flex-end" },
        canvas: { left: "left", center: "center", right: "right", top: "top", middle: "middle", bottom: "bottom" }
    };
}

/**
 * Truncates text to fit a specific width.
 * THE FIX: Default handling is now 'cutoff' (no ellipsis) per standardization.
 */
const _clampCache = new Map();
export function clampText(text, maxWidth, fontSize, fontFamily, fontWeight = "normal", useEllipsis = false) {
    if (!text) return "";
    const cacheKey = `${text}_${Math.floor(maxWidth)}_${fontSize}_${fontFamily}_${fontWeight}_${useEllipsis}`;
    if (_clampCache.has(cacheKey)) return _clampCache.get(cacheKey);

    if (measureTextWidth(text, fontSize, fontFamily, fontWeight) <= maxWidth) {
        _clampCache.set(cacheKey, text);
        return text;
    }
    const ellipsis = useEllipsis ? "..." : "";
    let truncated = String(text);
    while (truncated.length > 0 && measureTextWidth(truncated + ellipsis, fontSize, fontFamily, fontWeight) > maxWidth) {
        truncated = truncated.slice(0, -1);
    }
    const result = truncated.length > 0 ? truncated + ellipsis : "";
    _clampCache.set(cacheKey, result);
    return result;
}

/**
 * CATEGORY 5: UNIFIED ENVIRONMENT SETUP
 * Centralizes the boilerplate used at the top of almost every widget sync function.
 */
export function resolveWidgetEnv(node, config, app = null, element = null) {
    const props = interpretLayoutProps(config, { owner: node, geometry: config.geometry });

    const wState = resolveWidgetState(config);
    const isBypassed = node.mode === 4 || node._derpSpoofedBypass;

    // THE GATEKEEPER: If mouseOver is explicitly false, we bypass all interaction-based states (Hover/Selection)
    const isHovered = config.mouseOver !== false && node._hoveredRegionKey === config.key;
    const isSelected = config.mouseOver !== false && (node.selected || node._isVirtualSelected);

    const stateStr = (wState === "DIS" || isBypassed) ? "DIS" : (isHovered ? "ON" : (isSelected ? "ON" : wState));

    const suffix = (stateStr === "DIS") ? "_DIS" : (stateStr === "ON" ? "_ON" : "_OFF");

    const visualSuffix = config.visualState ? (config.visualState === "DIS" ? "_DIS" : (config.visualState === "ON" ? "_ON" : "_OFF")) : suffix;
    const bodyPaint = resolvePaintData(node, props.bodyKey, visualSuffix, config.btnColor, config.palette);
    const labelPaint = resolvePaintData(node, props.labelKey, visualSuffix, config.labelColor, config.palette);

    // --- COLOR-KEY TEXT PARSING ---
    const defaultTextColor = labelPaint?.textColor || labelPaint?.fill;
    const resolvedDisplayText = props.displayText || "";
    const visibleDisplayText = stripColorKeyTags(resolvedDisplayText);
    const { segments: colorSegments, hasColorKeys } = parseColorKeyText(
        resolvedDisplayText, node, suffix, defaultTextColor, config.stringPalette
    );

    // --- CONSOLIDATED UTILITY HANDLING ---
    // Handle Content, Callbacks, and Maps internally
    const content = getWidgetContent(config);
    const callbacks = getWidgetCallbacks(config, stateStr);
    const alignments = getAlignmentMaps();

    // --- UNIFIED TEXT ANCHOR RESOLUTION ---
    let textAnchor = null;
    if (config.geometry && (props.displayText || content.text)) {
        const textToMeasure = props.displayText ? visibleDisplayText : stripColorKeyTags(content.text);
        const fontSize = props.fontSize || labelPaint?.fontSize || 10;
        const font = labelPaint?.font || "arial";
        const fontWeight = config.fontWeight || labelPaint?.fontWeight || props.fontWeight || "normal";

        const pL = props.padding[0], pT = props.padding[1];
        const pR = props.padding[2], pB = props.padding[3];
        const usableW = config.geometry.w - (pL + pR);

        const textWidth = measureTextWidth(textToMeasure, fontSize, font, fontWeight);
        const isOverflowing = textWidth > usableW;
        const snapLeft = isOverflowing && !config.wrap;

        const [alignX, alignY] = props.labelAlign || ["left", "middle"];

        textAnchor = {
            isOverflowing,
            snapLeft,
            // Canvas Coordinates
            x: snapLeft ? config.geometry.x + pL : (
                (alignX === "center") ? config.geometry.x + (config.geometry.w / 2) :
                    (alignX === "right") ? config.geometry.x + config.geometry.w - pR :
                        config.geometry.x + pL
            ),
            y: (alignY === "middle") ? config.geometry.y + (config.geometry.h / 2) + (props.numberOnly ? (fontSize * 0.08) : 0) :
                (alignY === "bottom") ? config.geometry.y + config.geometry.h - pB :
                    config.geometry.y + pT,
            align: snapLeft ? "left" : alignX,
            // HTML Flex Alignment
            justifyContent: snapLeft ? "flex-start" : (alignments.justify[alignX] || "center")
        };
    }

    // Calculate Screen Coordinates if app context is provided
    let coords = null;
    if (app && config.geometry) {
        coords = calculateScreenCoords(node, app, config.geometry.x, config.geometry.y, config.geometry.w, config.geometry.h);
    }

    // Apply Interaction Styles if HTML element is provided
    if (element) {
        applyInteractionStyles(element, config, stateStr);
    }

    const { playSound, useAnimation } = node.getDerpVars ? node.getDerpVars(node) : { playSound: true, useAnimation: true };
    const useAnim = config.useAnimations !== false && (node.properties?.useAnimations !== false) && useAnimation !== false;
    const alpha = config.alpha !== undefined ? config.alpha : 1;

    return {
        props, stateStr, suffix, bodyPaint, labelPaint,
        content, callbacks, alignments, coords, textAnchor,
        colorSegments, hasColorKeys, visibleDisplayText,
        useAnim, playSound, alpha
    };
}
