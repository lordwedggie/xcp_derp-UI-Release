export function buildHeaderPaletteAliases(name) {
    const value = String(name || "").trim();
    if (!value) return [];

    const aliases = [];
    if (value.startsWith("xcpDerp")) aliases.push(value.replace(/^xcp/, ""));
    if (/^Derp.+Node$/.test(value)) {
        const withoutSuffix = value.replace(/Node$/, "");
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
