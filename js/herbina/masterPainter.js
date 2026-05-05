/**
 * Herbina Master Painter & Theme Compiler
 * Path: ./Herbina/masterPainter.js
 */

// Replace compileThemeData: Prepares theme data before painting
function resolvePaletteColor(val) {
    if (typeof val === 'string' && val.startsWith('@')) {
        const key = val.substring(1);
        if (window.xcpActivePalette && window.xcpActivePalette[key]) {
            return window.xcpActivePalette[key];
        }
    }
    return val;
}

const _compiledThemeCache = new WeakMap();

function getCompiledThemeCache(themeMain, state) {
    const paletteKey = window.xcpActivePaletteName || "";
    const cacheKey = `${state}::${paletteKey}`;
    let perTheme = _compiledThemeCache.get(themeMain);
    if (!perTheme) {
        perTheme = new Map();
        _compiledThemeCache.set(themeMain, perTheme);
    }
    return { perTheme, cacheKey };
}

export function compileThemeData(themeMain, keyName = "Unknown", state = "OFF") {
    if (!themeMain) return null;
    const { perTheme, cacheKey } = getCompiledThemeCache(themeMain, state);
    if (perTheme.has(cacheKey)) return perTheme.get(cacheKey);

    const ensureArray = (c) => {
        const resolved = resolvePaletteColor(c);
        return Array.isArray(resolved) ? resolved : null;
    };

    // 1. RESOLVE FILL COLOR
    let fillRaw = (state === "ON") ? ensureArray(themeMain._ON) :
        (state === "DIS") ? ensureArray(themeMain._DIS) : ensureArray(themeMain._OFF);
    if (!fillRaw) fillRaw = ensureArray(themeMain._ON) || [255, 26, 26, 1];

    // 2. RESOLVE SHADOW
    let shadowData = null;
    if (Array.isArray(themeMain.shadow)) {
        const physics = themeMain.shadow;
        const colorRaw = themeMain[`shadow_${state}`] || themeMain.shadow_ON || [0,0,0,1];
        const color = resolvePaletteColor(colorRaw);
        shadowData = {
            color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] ?? 1})`,
            offsetX: parseFloat(physics[0] ?? 0),
            offsetY: parseFloat(physics[1] ?? 0),
            blur: parseFloat(physics[2] ?? 10)
        };
    }

    // 3. RESOLVE STROKE
    let borderData = null;
    if (Array.isArray(themeMain.stroke)) {
        const physics = themeMain.stroke;
        const colorRaw = themeMain[`stroke_${state}`] || themeMain.stroke_ON || [0,0,0,1];
        const color = resolvePaletteColor(colorRaw);
        borderData = {
            color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] ?? 1})`,
            width: parseFloat(physics[0] ?? 1),
            placement: parseInt(physics[1] ?? 0) // 0=Outer, 1=Center, 2=Inner
        };
    }

    // 4. RESOLVE GLOW
    let glowData = null;
    if (Array.isArray(themeMain.glow)) {
        const physics = themeMain.glow;
        const colorRaw = themeMain[`glow_${state}`] || themeMain.glow_ON || [255,255,255,1];
        const color = resolvePaletteColor(colorRaw);
        glowData = {
            color: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] ?? 1})`,
            offsetX: parseFloat(physics[0] ?? 0),
            offsetY: parseFloat(physics[1] ?? 0),
            blur: parseFloat(physics[2] ?? 12)
        };
    }

    const compiled = {
        fill: `rgba(${fillRaw[0]}, ${fillRaw[1]}, ${fillRaw[2]}, ${fillRaw[3] ?? 1})`,
        corners: themeMain.corners ?? 6,
        font: themeMain.font || "DengXian",
        fontSize: themeMain.fontSize || 10,
        shadow: shadowData,
        border: borderData,
        glow: glowData,
        // THE FIX: Default both to 'None' if the flag is missing in JSON
        glowClip: themeMain.glowClip || "c_glowNone",
        shadowClip: themeMain.shadowClip || "c_shadowNone"
    };

    perTheme.set(cacheKey, compiled);
    return compiled;
}

// Helper to safely multiply the alpha of an already-compiled rgba() string
function scaleAlpha(colorStr, factor) {
    if (!colorStr) return "transparent";
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
        const r = match[1];
        const g = match[2];
        const b = match[3];
        const a = match[4] !== undefined ? parseFloat(match[4]) : 1.0;
        return `rgba(${r}, ${g}, ${b}, ${a * factor})`;
    }
    return colorStr;
}

function parseCornerToken(token) {
    if (typeof token === "object" && token) {
        const r = Math.max(0, Number(token.r ?? token.radius ?? 0) || 0);
        return { r, straight: !!token.straight };
    }
    if (typeof token === "string") {
        const s = token.trim();
        const straightMatch = s.match(/^s\s*([0-9]*\.?[0-9]+)$/i);
        if (straightMatch) {
            return { r: Math.max(0, Number(straightMatch[1]) || 0), straight: true };
        }
        return { r: Math.max(0, Number(s) || 0), straight: false };
    }
    return { r: Math.max(0, Number(token) || 0), straight: false };
}

function normalizeCornerSpec(radii, width, height) {
    const maxR = Math.max(0, Math.min(width, height) / 2);
    let raw;
    if (Array.isArray(radii)) {
        raw = radii;
    } else if (typeof radii === "string") {
        const tokens = radii.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
        if (tokens.length >= 4) raw = tokens.slice(0, 4);
        else if (tokens.length === 1) raw = [tokens[0], tokens[0], tokens[0], tokens[0]];
        else raw = [radii, radii, radii, radii];
    } else {
        raw = [radii, radii, radii, radii];
    }
    const arr = [raw[0], raw[1], raw[2], raw[3]].map(parseCornerToken);
    return arr.map(c => ({ ...c, r: Math.min(c.r, maxR) }));
}

function buildRoundedPath(ctx, x, y, width, height, radii, begin = true) {
    const [tl, tr, br, bl] = normalizeCornerSpec(radii, width, height);
    if (begin) ctx.beginPath();
    ctx.moveTo(x + tl.r, y);
    ctx.lineTo(x + width - tr.r, y);
    if (tr.r > 0) {
        if (tr.straight) ctx.lineTo(x + width, y + tr.r);
        else ctx.quadraticCurveTo(x + width, y, x + width, y + tr.r);
    }

    ctx.lineTo(x + width, y + height - br.r);
    if (br.r > 0) {
        if (br.straight) ctx.lineTo(x + width - br.r, y + height);
        else ctx.quadraticCurveTo(x + width, y + height, x + width - br.r, y + height);
    }

    ctx.lineTo(x + bl.r, y + height);
    if (bl.r > 0) {
        if (bl.straight) ctx.lineTo(x, y + height - bl.r);
        else ctx.quadraticCurveTo(x, y + height, x, y + height - bl.r);
    }

    ctx.lineTo(x, y + tl.r);
    if (tl.r > 0) {
        if (tl.straight) ctx.lineTo(x + tl.r, y);
        else ctx.quadraticCurveTo(x, y, x + tl.r, y);
    }
    ctx.closePath();
}

/**
 * Herbina Master Painter
 * Fixed: Consolidated Glow Pass with Unclipped 'None' Mode
 */
export function masterPainter(ctx, options) {
    const { width, height, color = "#1a1a1a", posX = 0, posY = 0, paintData = null } = options;
    const glowClip = paintData?.glowClip || options.glowClip || "c_glowNone"; // Default to None
    const shadowClip = paintData?.shadowClip || "c_shadowNone";
    const radii = paintData?.corners || 6;

    // --- LOCAL TUNING: Adjust Canvas rendering to mimic CSS HTML softness ---
    const CANVAS_BLUR_FACTOR   = 2.0;
    const CANVAS_ALPHA_FACTOR  = 0.7;
    const CANVAS_OFFSET_FACTOR = 1.5;

    ctx.save();

    // 0. RESET STATE
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    // --- LAYER 1: OUTSIDE SHADOW ---
    if (paintData?.shadow && shadowClip === "c_shadowOutside") {
        const s = paintData.shadow;
        ctx.save();
        ctx.beginPath();
        ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
        buildRoundedPath(ctx, posX, posY, width, height, radii, false);
        ctx.clip("evenodd");

        ctx.shadowColor = scaleAlpha(s.color, CANVAS_ALPHA_FACTOR);
        ctx.shadowBlur = s.blur * CANVAS_BLUR_FACTOR;
        ctx.shadowOffsetX = s.offsetX; ctx.shadowOffsetY = s.offsetY;
        ctx.fillStyle = "black";
        buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.fill();
        ctx.restore();
    }

    // --- LAYER 2: BACKGROUND FILL ---
    ctx.save();
    if (paintData?.shadow && shadowClip === "c_shadowNone") {
        const s = paintData.shadow;
        ctx.shadowColor = scaleAlpha(s.color, CANVAS_ALPHA_FACTOR);
        ctx.shadowBlur = s.blur * CANVAS_BLUR_FACTOR;
        ctx.shadowOffsetX = s.offsetX * CANVAS_OFFSET_FACTOR;
        ctx.shadowOffsetY = s.offsetY * CANVAS_OFFSET_FACTOR;
    }
    ctx.fillStyle = color;
    buildRoundedPath(ctx, posX, posY, width, height, radii, true);
    ctx.fill();
    ctx.restore();

    // --- LAYER 3: INSIDE SHADOW ---
    if (paintData?.shadow && shadowClip === "c_shadowInside") {
        const s = paintData.shadow;
        ctx.save();
        buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.clip();

        ctx.shadowColor = scaleAlpha(s.color, CANVAS_ALPHA_FACTOR);
        ctx.shadowBlur = s.blur * CANVAS_BLUR_FACTOR;
        ctx.shadowOffsetX = s.offsetX * CANVAS_OFFSET_FACTOR;
        ctx.shadowOffsetY = s.offsetY * CANVAS_OFFSET_FACTOR;

        ctx.beginPath();
        ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
        buildRoundedPath(ctx, posX, posY, width, height, radii, false);
        ctx.fillStyle = "black";
        ctx.fill("evenodd");
        ctx.restore();
    }

    // --- LAYER 4: GLOW PASS (ON TOP OF FILL) ---
    // THE FIX: Consolidation ensures correct layering and unclipped 'None' behavior.
    if (paintData?.glow) {
        const g = paintData.glow;
        const blur = g.blur * CANVAS_BLUR_FACTOR;
        const offX = g.offsetX * CANVAS_OFFSET_FACTOR;
        const offY = g.offsetY * CANVAS_OFFSET_FACTOR;
        const gColor = scaleAlpha(g.color, CANVAS_ALPHA_FACTOR);

        if (glowClip === "c_glowOutside") {
            ctx.save();
            ctx.beginPath();
            ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
            buildRoundedPath(ctx, posX, posY, width, height, radii, false);
            ctx.clip("evenodd");
            ctx.shadowColor = gColor; ctx.shadowBlur = blur;
            ctx.shadowOffsetX = offX; ctx.shadowOffsetY = offY;
            ctx.fillStyle = "black";
            buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.fill();
            ctx.restore();
        }
        else if (glowClip === "c_glowInside") {
            ctx.save();
            buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.clip();
            ctx.shadowColor = gColor; ctx.shadowBlur = blur;
            ctx.shadowOffsetX = offX; ctx.shadowOffsetY = offY;
            ctx.beginPath();
            ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
            buildRoundedPath(ctx, posX, posY, width, height, radii, false);
            ctx.fillStyle = "black";
            ctx.fill("evenodd");
            ctx.restore();
        }
        else if (glowClip === "c_glowNone") {
            // THE FIX: Execute BOTH the inside and outside passes sequentially.
            // This achieves the bidirectional bleed ("BOTH" effect) while hiding the solid black
            // source shapes that Canvas requires to cast a shadow.

            // Pass 1: Outside Glow
            ctx.save();
            ctx.beginPath();
            ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
            buildRoundedPath(ctx, posX, posY, width, height, radii, false);
            ctx.clip("evenodd");
            ctx.shadowColor = gColor; ctx.shadowBlur = blur;
            ctx.shadowOffsetX = offX; ctx.shadowOffsetY = offY;
            ctx.fillStyle = "black";
            buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.fill();
            ctx.restore();

            // Pass 2: Inside Glow
            ctx.save();
            buildRoundedPath(ctx, posX, posY, width, height, radii, true); ctx.clip();
            ctx.shadowColor = gColor; ctx.shadowBlur = blur;
            ctx.shadowOffsetX = offX; ctx.shadowOffsetY = offY;
            ctx.beginPath();
            ctx.rect(posX - 5000, posY - 5000, width + 10000, height + 10000);
            buildRoundedPath(ctx, posX, posY, width, height, radii, false);
            ctx.fillStyle = "black";
            ctx.fill("evenodd");
            ctx.restore();
        }
    }

    // --- LAYER 5: BORDER ---
    if (paintData?.border) {
        const b = paintData.border;
        ctx.save();
        ctx.strokeStyle = b.color;
        const align = b.placement ?? 0;
        const lineWidth = b.width;
        ctx.lineWidth = lineWidth;

        if (align === 1) buildRoundedPath(ctx, posX + (lineWidth / 2), posY + (lineWidth / 2), width - lineWidth, height - lineWidth, radii);
        else if (align === 2) buildRoundedPath(ctx, posX - (lineWidth / 2), posY - (lineWidth / 2), width + lineWidth, height + lineWidth, radii);
        else buildRoundedPath(ctx, posX, posY, width, height, radii);

        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}

const _fontCache = new Map();

/**
 * Enhanced Master Text Painter (Triple-Pass Vector)
 * Path: ./Herbina/masterPainter.js
 */
export function masterPainterText(ctx, options) {
    const { text, x, y, paintData, align = "left", baseline = "middle" } = options;
    if (!paintData || text === null || text === undefined) return;

    const requestedFont = paintData.font || "Arial";
    let safeFont = _fontCache.get(requestedFont);
    if (!safeFont) {
        const isAvailable = (document.fonts && document.fonts.check(`12px "${requestedFont}"`));
        if (isAvailable) {
            safeFont = requestedFont;
        } else {
            safeFont = "Arial";
        }
        _fontCache.set(requestedFont, safeFont);
    }

    ctx.save();

    let parsedFont = safeFont.replace(/px/g, '').trim();
    if (parsedFont.includes(" ") && !parsedFont.includes("'") && !parsedFont.includes('"')) {
        parsedFont = `'${parsedFont}'`;
    }

    // THE WEIGHT FIX: Correctly resolve unified fontWeight string into style and weight passes
    const weightStr = paintData.fontWeight || "normal";
    let style = "normal", w = "normal";
    if (weightStr === "italic") style = "italic";
    else if (weightStr === "bold") w = "bold";
    else if (weightStr === "both") { style = "italic"; w = "bold"; }

    ctx.font = `${style} ${w} ${paintData.fontSize || 10}px ${parsedFont}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    const renderShape = () => {
        if (paintData.fill) {
            ctx.fillStyle = paintData.fill;
            ctx.fillText(text, x, y);
        }
    };

    if (paintData.glow) {
        ctx.save();
        ctx.shadowColor = paintData.glow.color;
        ctx.shadowBlur = paintData.glow.blur;
        ctx.shadowOffsetX = paintData.glow.offsetX;
        ctx.shadowOffsetY = paintData.glow.offsetY;
        renderShape();
        ctx.restore();
    }

    if (paintData.shadow) {
        ctx.save();
        ctx.shadowColor = paintData.shadow.color;
        ctx.shadowBlur = paintData.shadow.blur;
        ctx.shadowOffsetX = paintData.shadow.offsetX;
        ctx.shadowOffsetY = paintData.shadow.offsetY;
        renderShape();
        ctx.restore();
    }

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    renderShape();

    ctx.restore();
}
