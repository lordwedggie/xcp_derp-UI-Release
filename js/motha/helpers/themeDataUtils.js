/**
 * Safely applies a multiplier to the alpha channel.
 * Silently anchors the current alpha as the baseline if missing.
 */

// 1. Robust Reset
export function resetAlphaToOriginal(colorArr) {
    if (colorArr && colorArr.length >= 4) {
        // If the anchor is missing, create it NOW from the current value
        if (colorArr._baseAlpha === undefined) {
            colorArr._baseAlpha = colorArr[3];
        }
        colorArr[3] = colorArr._baseAlpha;
    }
}

// 2. Robust Multiplier
export function applyAlphaMultiplier(colorArr, multiplierStr) {
    if (!colorArr || colorArr.length < 4) return;
    let m = parseFloat(multiplierStr);
    if (isNaN(m)) m = 1.0;
    // Anchor on first run
    if (colorArr._baseAlpha === undefined) {
        colorArr._baseAlpha = colorArr[3];
    }
    colorArr[3] = colorArr._baseAlpha * m;
}

export function enforceThemeLocks(themeObj, activeTheme, colorCache, nodeProperties) {
    if (!themeObj) return;

    const alphaActive = nodeProperties?._globalAlphaXActive || false;
    const alphaValues = nodeProperties?.globalAlphaXValues || ["1.00", "0.80", "0.20"];

    for (const key in themeObj) {
        const kData = themeObj[key];
        if (!kData || typeof kData !== 'object') continue;

        /**
         * Apply Alpha Multipliers to EVERYTHING.
         * Supports: _ON, _OFF, _DIS, _Shadow, _Shadow_OFF, _Shadow_DIS, etc.
         */
        const states = [
            { prop: '_ON',       alphaIndex: 0 },
            { prop: '_OFF',      alphaIndex: 1 },
            { prop: '_DIS',      alphaIndex: 2 },
            { prop: '_Shadow',   alphaIndex: 0 },
            { prop: '_Shadow_OFF', alphaIndex: 1 },
            { prop: '_Shadow_DIS', alphaIndex: 2 },
            { prop: '_Stroke',   alphaIndex: 0 },
            { prop: '_Stroke_OFF', alphaIndex: 1 },
            { prop: '_Stroke_DIS', alphaIndex: 2 },
            { prop: '_Glow',     alphaIndex: 0 },
            { prop: '_Glow_OFF', alphaIndex: 1 },
            { prop: '_Glow_DIS', alphaIndex: 2 }
        ];

        if (alphaActive) {
            states.forEach(({ prop, alphaIndex }) => {
                if (kData[prop]) {
                    applyAlphaMultiplier(kData[prop], alphaValues[alphaIndex]);
                }
            });
        } else {
            states.forEach(({ prop }) => {
                if (kData[prop]) {
                    resetAlphaToOriginal(kData[prop]);
                }
            });
        }
    }
}

/**
 * WYSIWYG PERSISTENCE:
 * Sanitizes the theme object for server storage by stripping internal session metadata.
 */
export function prepareThemeForPersistence(themes, defaultThemes) {
    const customThemes = {};
    for (const themeName in themes) {
        const themeObj = themes[themeName];
        // THE FIX: Skip default templates if provided in the exclusion map
        if (defaultThemes && defaultThemes[themeName]) continue;

        const themeClone = JSON.parse(JSON.stringify(themeObj));
        for (const key in themeClone) {
            const kObj = themeClone[key];
            if (!kObj || typeof kObj !== 'object') continue;

            const subKeys = [
                '_ON', '_OFF', '_DIS',
                '_Shadow', '_Shadow_OFF', '_Shadow_DIS',
                '_Stroke', '_Stroke_OFF', '_Stroke_DIS',
                '_Glow', '_Glow_OFF', '_Glow_DIS'
            ];

            subKeys.forEach(s => {
                if (!kObj[s]) return;

                // 1. Remove internal session anchor
                delete kObj[s]._baseAlpha;

                const isShadow = s.includes('Shadow');
                const isGlow = s.includes('Glow');
                const isStroke = s.includes('Stroke');

                // 2. Slice arrays to standard lengths based on their specific type
                // THE FIX: Maintain standard array lengths for physics authority arrays
                if ((isShadow || isGlow) && kObj[s].length > 7) {
                    kObj[s] = kObj[s].slice(0, 7);
                }
                else if (isStroke && kObj[s].length > 6) {
                    kObj[s] = kObj[s].slice(0, 6);
                }
                // Standard Color or active-display array: [r, g, b, a] (4)
                else if (!isShadow && !isGlow && !isStroke && kObj[s].length > 4) {
                    kObj[s] = kObj[s].slice(0, 4);
                }
            });

            delete kObj._baseAlpha;
        }
        customThemes[themeName] = themeClone;
    }
    return customThemes;
}

/**
 * Generates a stable hash for a theme key's visual properties.
 */
export function generateKeyHash(keyObj) {
    if (!keyObj || typeof keyObj !== 'object') return "";
    const cleanObj = {};
    // Added Glow keys and the variants (_OFF, _DIS) for all effects to ensure total change detection
    // THE FIX: Include active display arrays and clip modes in hash generation for 14-element protocol
    const relevantKeys = [
        "_ON", "_OFF", "_DIS", "corners", "font", "fontSize",
        "_Shadow", "_Shadow_OFF", "_Shadow_DIS",
        "_Stroke", "_Stroke_OFF", "_Stroke_DIS",
        "_Glow", "_Glow_OFF", "_Glow_DIS",
        "shadow", "shadowDisabled", "shadowClip",
        "stroke", "strokeDisabled", "glow", "glowDisabled", "glowClip", "_palette"
    ];
    relevantKeys.forEach(prop => {
        if (keyObj[prop] !== undefined) {
            cleanObj[prop] = keyObj[prop]; // Ensure this is 'cleanObj'
        }
    });
    return JSON.stringify(cleanObj);
}
