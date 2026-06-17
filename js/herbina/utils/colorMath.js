/**
 * PROJECT: xcpDerpNodes | MODULE: Shared Utilities
 * PURPOSE: Centralized color math and text measurement to reduce redundancy.
 */

// Singleton canvas for text measurement to avoid DOM thrashing
const _measureCanvas = document.createElement("canvas");
const _measureCtx = _measureCanvas.getContext("2d");

/**
 * Measures text width using a cached canvas context.
 * @param {string} text - The text to measure.
 * @param {number} fontSize - Font size in pixels.
 * @param {string} [fontFamily="DengXian"] - Font family name.
 * @param {number} [padding=0] - Extra width to add (e.g. for margins).
 * @returns {number} The measured width + padding.
 */
export function measureTextWidth(text, fontSize, fontFamily = "DengXian", padding = 0) {
    _measureCtx.font = `${fontSize}px ${fontFamily}`;
    return _measureCtx.measureText(text).width + padding;
}

/**
 * Converts RGB color values to HSL.
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Array<number>} [H (0-360), S (0-100), L (0-100)]
 */
export function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) h = s = 0;
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/**
 * Converts HSL color values to RGB.
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {Array<number>} [R (0-255), G (0-255), B (0-255)]
 */
export function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Convert an string to RGBA color
export function getRGBA(color) {
    return `rgba(${color})`;
}

/**
 * Converts a theme array [R, G, B, A] to a CSS rgba string.
 * @param {Array|null} arr - The color array from theme config.
 */
export function toRGBA(arr) {
    if (!Array.isArray(arr) || arr.length < 4) return null;
    // Explicitly mapping R, G, B, and Alpha
    return `rgba(${arr[0]}, ${arr[1]}, ${arr[2]}, ${arr[3]})`;
}

export function lerpColor(c1, c2, t) {
    if (!c1) return "rgba(0,0,0,0)";
    if (!c2) return `rgba(${c1.join(",")})`;
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    const a1 = c1[3] !== undefined ? c1[3] : 1;
    const a2 = c2[3] !== undefined ? c2[3] : 1;
    const a = a1 + (a2 - a1) * t;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
/**
 * Converts RGBA to HSVA.
 * Added for Color Designer live-sync support.
 */
export function rgbaToHsva(r, g, b, a) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) h = 0;
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s, v, a];
}

/**
 * Converts HSVA back to RGBA array.
 */
export function hsvaToRgba(h, s, v, a) {
    h /= 360;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a];
}