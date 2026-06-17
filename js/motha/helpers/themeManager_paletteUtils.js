export function normalizePaletteName(name) {
    return String(name || "").replace(/\\/g, "/");
}

export function getSystemPaletteDisplayName(name) {
    const normalized = normalizePaletteName(name);
    return normalized.startsWith("_system/") ? normalized.slice("_system/".length) : normalized;
}

export function toSystemPaletteDropdownItem(name) {
    const normalized = normalizePaletteName(name);
    return {
        value: normalized,
        display: getSystemPaletteDisplayName(normalized),
    };
}
