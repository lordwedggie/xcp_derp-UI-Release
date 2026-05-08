/**
 * Path: ./js/fatha/helpers/bastaLayoutMaps.js
 * ROLE: Standard layout maps for Basta instances.
 * PURPOSE: Isolates region definitions away from the Basta core, matching Fatha's architecture.
 */
import { UI_TYPES } from "../core/masterLayoutTypes.js";

export const getBastaBaseMap = (basta) => {
    const p = basta.properties || {};
    // Extract spacing and margins using Fatha's centralized theme getter
    const vars = basta.getDerpVars ? basta.getDerpVars(basta) : { mW: 0, mH: 0, pW: 2, pH: 4, sW: 2, sH: 2, oY: 4 };
    const { mW, mH, sW, sH, pW, pH, oX, oY } = vars;

    // THE THEME SYNC FIX: Evaluate dynamic layout maps to catch real-time theme variable changes
    const injectedMap = typeof basta.layoutMap === 'function' ? basta.layoutMap(basta, vars) : (basta.layoutMap || {});

    return {
        headerRegion: {
            dir: "col",
            width: "full",
            height: "auto",
            margin: [0, mH, 0, 0],
            spacing: [0, sH],
            headerMain: {
                dir: "row",
                width: "full",
                height: "auto",
                margin: [mW, 0],
                titleLabel: {
                    type: UI_TYPES.TEXT,
                    skipBackground: true,
                    themeKey: "dialog, t_textNormal",
                    width: "full",
                    height: "auto",
                    padding: [pW, pH],
                    text: basta.titleLabel || p.titleLabel || "Basta Panel",
                    labelAlign: ["left", "middle"],
                    spacing: [sW, 0]
                },
                btnClose: {
                    type: UI_TYPES.ICONBUTTON,
                    themeKey: "buttonNode, t_textSystem",
                    icon: "close",
                    width: "match: 1.0",
                    height: "fit",
                    padding: [pW, pH],
                    onPress: () => basta.close("headerButton")
                }
            },
            headerBreak: {
                margin: [0, pH, 0, 0], height: 1,
                type: UI_TYPES.LINEBREAK
            }
        },
        contentRegion: {
            anchor: { target: "headerRegion", axis: "y", offset: 0 },
            dir: "col", width: "full", height: "auto"
        },

        footerRegion: {
            anchor: { target: "contentRegion", axis: "y", offset: oY },
            dir: "row", width: "full", height: "auto"
        },
        ...Object.fromEntries(Object.entries(injectedMap).map(([k, v]) => {
            const base = {
                contentRegion: { anchor: { target: "headerRegion", axis: "y", offset: 0 }, dir: "col", width: "full", height: "auto" },
                footerRegion: { anchor: { target: "contentRegion", axis: "y", offset: 0 }, dir: "col", margin: [mW, 0, mW, mH], width: "full", height: "auto" }
            }[k] || {};
            return [k, { ...base, ...v }];
        }))
    };
};
