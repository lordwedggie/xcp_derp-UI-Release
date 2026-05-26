export function buildHeaderPaletteAliases(name) {
    const value = String(name || "").trim();
    if (!value) return [];

    const aliases = [];
    if (value.startsWith("xcpDerp")) aliases.push(value.replace(/^xcp/, ""));
    if (/^Derp.+Node$/i.test(value)) {
        const withoutSuffix = value.replace(/Node$/i, "");
        aliases.push(withoutSuffix.charAt(0).toLowerCase() + withoutSuffix.slice(1));
    }
    return aliases;
}

export function getHeaderPaletteCandidateNames(entity, includeProfileFile = false) {
    const baseNames = [
        entity?.type,
        entity?.constructor?.type,
        entity?.comfyClass,
        includeProfileFile ? entity?._sysProfileFile : null,
    ].filter(Boolean);

    return [...new Set([...baseNames, ...baseNames.flatMap((name) => buildHeaderPaletteAliases(name))])];
}

export function findHeaderPaletteEntry(palettes, entity, includeProfileFile = false) {
    if (!Array.isArray(palettes)) return null;
    const names = getHeaderPaletteCandidateNames(entity, includeProfileFile);
    for (const name of names) {
        const target = `header_${String(name || "")}`.toLowerCase();
        const entry = palettes.find((item) => String(item?.name || "").toLowerCase() === target);
        if (entry) return entry;
    }
    return null;
}

function normalizePaletteName(value) {
    const name = String(value || "").trim();
    return name && name.toLowerCase() !== "none" ? name : "";
}

function findPaletteEntry(data, entryName) {
    if (!data?.entries || !entryName) return null;
    return data.entries[entryName] || null;
}

function paletteColorToCss(value) {
    if (!value) return null;
    if (Array.isArray(value)) return `rgba(${value.join(",")})`;
    return String(value);
}

function resolvePaletteStateColor(entry, key, state = "_OFF") {
    if (!entry) return null;
    const normalizedState = String(state || "_OFF");
    const variants = [
        normalizedState,
        normalizedState === "_ON" ? "ACTIVE" : null,
        normalizedState === "_DIS" ? "DISABLED" : null,
    ].filter(Boolean);
    const ents = entry.entries || entry;
    const keyData = ents[key];
    if (!keyData) return null;
    for (const variant of variants) {
        if (keyData[variant] !== undefined && keyData[variant] !== null) return keyData[variant];
    }
    return keyData;
}

export function findNodePaletteEntry(entity, entryName, getPaletteCache) {
    const paletteName = normalizePaletteName(entity?._headerPaletteName || "");
    if (!paletteName || typeof getPaletteCache !== "function") return null;
    return findPaletteEntry(getPaletteCache()[paletteName], entryName);
}

export function getNodePaletteData(entity, getPaletteCache) {
    const paletteName = normalizePaletteName(entity?._headerPaletteName || "");
    return (paletteName && typeof getPaletteCache === "function") ? getPaletteCache()[paletteName] : null;
}

export function resolveNodeHeaderPaletteEntry(entity, getPaletteCache) {
    const paletteData = getNodePaletteData(entity, getPaletteCache);
    return findHeaderPaletteEntry(paletteData?.palettes, entity, true);
}

export function resolveNodeHeaderPaletteMatch(entity, getPaletteCache) {
    const paletteData = getNodePaletteData(entity, getPaletteCache);
    const entry = findHeaderPaletteEntry(paletteData?.palettes, entity, true);
    return entry ? { entry, paletteData } : null;
}

export function getNodeHeaderPaletteFingerprint(entity, getPaletteCache) {
    const match = resolveNodeHeaderPaletteMatch(entity, getPaletteCache);
    return match ? JSON.stringify({ effects: match.paletteData?.effects === true, entries: match.entry.entries || {} }) : "no-header-palette";
}

function applyPaletteEntryColors(paint, entry, state = "_OFF", effectSource = paint, effectsEnabled = false) {
    if (!paint || !entry) return paint;
    const next = { ...paint };
    const fill = paletteColorToCss(resolvePaletteStateColor(entry, "main", state));
    const shadow = effectsEnabled ? paletteColorToCss(resolvePaletteStateColor(entry, "shadow", state)) : null;
    const stroke = effectsEnabled ? paletteColorToCss(resolvePaletteStateColor(entry, "stroke", state)) : null;
    const glow = effectsEnabled ? paletteColorToCss(resolvePaletteStateColor(entry, "glow", state)) : null;

    if (fill) next.fill = fill;
    if (shadow && effectSource?.shadow) next.shadow = { ...effectSource.shadow, color: shadow };
    if (stroke && effectSource?.border) next.border = { ...effectSource.border, color: stroke };
    if (glow && effectSource?.glow) next.glow = { ...effectSource.glow, color: glow };

    return next;
}

export function applyNodeHeaderPalette(entity, paint, state = "_OFF", effectSource = paint, getPaletteCache) {
    const match = resolveNodeHeaderPaletteMatch(entity, getPaletteCache);
    return applyPaletteEntryColors(paint, match?.entry, state, effectSource, match?.paletteData?.effects === true);
}
