/**
 * Path: ./js/fatha/bastas/bastaColorDesigner.js
 * ROLE: A canvas-native port of the Color Designer singleton layout.
 * STATUS: FULLY FUNCTIONAL - Live-sync, state management, and revert-on-close added.
 */
import { app } from "../../../../scripts/app.js";
import { spawnBasta } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { rgbaToHsva, hsvaToRgba } from "../../herbina/utils/colorMath.js";

export const getColorDesignerId = () => `basta_color_designer_global_singleton`;

// --- STATE MANAGEMENT ---
export const cdState = {
    hostNode: null,
    mode: "HSVA",
    originalKeyData: null,
    activeStateSuffix: null,
    activeWidgetKey: null,
    currentVals: [0, 0, 0, 1],
    applyPressed: false
};

function updateHostThemeColor(basta) {
    const state = cdState;
    if (!state.hostNode || !state.activeStateSuffix) return;

    const [v1, v2, v3, a] = state.currentVals;
    const rgba = state.mode === "HSVA"
        ? hsvaToRgba(v1, v2, v3, a)
        : [Math.round(v1), Math.round(v2), Math.round(v3), a];

    // THE LIVE SYNC GATE: Clear layout cache before values are recalculated to force re-evaluation of currentVals in the map
    if (basta && basta.layout) {
        basta.layout._lastCacheKey = "";
        // THE LIVE INJECTION: Bypass layout-lock by surgically updating the computed region directly during the interaction frame
        if (basta.layout.computedRegions && basta.layout.computedRegions.swatchPreview) {
            const reg = basta.layout.computedRegions.swatchPreview;
            reg.btnColor = [Math.round(rgba[0]), Math.round(rgba[1]), Math.round(rgba[2]), rgba[3]];
            // THE CACHE BUSTER: Force the widget to ignore its internal paint-cache by modifying its local state string
            reg.state = `LIVE_${rgba.join('_')}`;
        }
    }

    const node = state.hostNode;
    const keyName = node._selectedKeyName;

    if (node.themeToEdit) {
        // THE HYBRID FIX: Support both nested objects (Palettes/Main Keys) and flat keys (Legacy Theme Effects)
        const target = node.themeToEdit[keyName];
        const isNested = (target && typeof target === 'object' && !Array.isArray(target));

        // Use the precise path discovered during initialization to ensure we write to the right place
        if (state._nestedPath && state._nestedPath.length === 2) {
            if (!target[state._nestedPath[0]]) target[state._nestedPath[0]] = {};
            target[state._nestedPath[0]][state._nestedPath[1]] = [...rgba];
        } else {
            const flatKey = (state._nestedPath && state._nestedPath[0]) ? state._nestedPath[0] : state.activeStateSuffix;
            target[flatKey] = [...rgba];
        }

        if (node.properties?.pushChanges) {
            const cfg = window.xcpDerpThemeConfig;
            const isLiveThemeManager = (node._selectedThemeName === "__PALETTE_LOCAL__" && node.__proto__ && node.themeToEdit === node.__proto__.themeToEdit);
            const tName = isLiveThemeManager
                ? (node.properties?.selectedThemeName || node.__proto__._selectedThemeName)
                : node._selectedThemeName;

            if (cfg && tName && cfg.themes[tName]) {
                const globalTheme = cfg.themes[tName];
                const gTarget = globalTheme[keyName];

                if (gTarget) {
                    if (state._nestedPath && state._nestedPath.length === 2) {
                        if (!gTarget[state._nestedPath[0]]) gTarget[state._nestedPath[0]] = {};
                        gTarget[state._nestedPath[0]][state._nestedPath[1]] = [...rgba];
                    } else {
                        const flatKey = (state._nestedPath && state._nestedPath[0]) ? state._nestedPath[0] : state.activeStateSuffix;
                        gTarget[flatKey] = [...rgba];
                    }
                } else {
                    globalTheme[`${keyName}${state.activeStateSuffix}`] = [...rgba];
                }

                Object.values(app.graph._nodes).forEach(n => {
                    if (n && n.onThemeUpdate) n.onThemeUpdate(cfg);
                });
            }
        }
        if (node.requestDerpSync) node.requestDerpSync();
    }

    if (basta) {
        basta._forceSync = true;
        if (basta.setDirtyCanvas) basta.setDirtyCanvas(true);
    }
}

function revertHostThemeColor() {
    const state = cdState;
    if (state.applyPressed) return;

    const node = state.hostNode;
    if (node && state.originalKeyData) {
        const keyName = node._selectedKeyName;
        const target = node.themeToEdit[keyName];
        const isNested = (target && typeof target === 'object' && !Array.isArray(target));

        // THE CATASTROPHIC FIX: Restore the entire theme block exactly as it was
        node.themeToEdit[keyName] = JSON.parse(JSON.stringify(state.originalKeyData));

        if (node.properties?.pushChanges) {
            const cfg = window.xcpDerpThemeConfig;
            const isLiveThemeManager = (node._selectedThemeName === "__PALETTE_LOCAL__" && node.__proto__ && node.themeToEdit === node.__proto__.themeToEdit);
            const tName = isLiveThemeManager
                ? (node.properties?.selectedThemeName || node.__proto__._selectedThemeName)
                : node._selectedThemeName;

            if (cfg && tName && cfg.themes[tName]) {
                const globalTheme = cfg.themes[tName];
                globalTheme[keyName] = JSON.parse(JSON.stringify(state.originalKeyData));

                Object.values(app.graph._nodes).forEach(n => {
                    if (n && typeof n.onThemeUpdate === "function") n.onThemeUpdate(cfg);
                });
            }
        }
        if (node.requestDerpSync) node.requestDerpSync();
    }
}

export function showBastaColorDesigner(host, exactKey = "_OFF", targetRegion = null) {
    const id = getColorDesignerId();

    cdState.hostNode = host;
    cdState.activeStateSuffix = exactKey;
    cdState.activeWidgetKey = targetRegion;
    cdState.applyPressed = false;

    cdState._nestedPath = null;
    let startColor = [128, 128, 128, 1];

    if (host && host.themeToEdit && host._selectedKeyName) {
        const targetObj = host.themeToEdit[host._selectedKeyName];
        // THE CATASTROPHIC FIX: Backup the ENTIRE theme block so revertHostThemeColor can fully restore it
        cdState.originalKeyData = (targetObj !== undefined) ? JSON.parse(JSON.stringify(targetObj)) : null;

        if (targetObj !== undefined) {
            // THE TYPED-ARRAY FIX: Support Float32Arrays and array-like proxies natively to prevent non-iterable crash loops
            const isArr = (val) => val && typeof val !== 'string' && (Array.isArray(val) || val.length !== undefined);

            if (isArr(targetObj[exactKey])) {
                startColor = Array.from(targetObj[exactKey]);
                cdState._nestedPath = [exactKey];
            } else if (exactKey && exactKey.includes("_") && targetObj[exactKey] === undefined) {
                const parts = exactKey.split("_");
                const base = parts[0];
                const suffix = "_" + parts[1];
                if (isArr(targetObj[base]?.[suffix])) {
                    startColor = Array.from(targetObj[base][suffix]);
                    cdState._nestedPath = [base, suffix];
                } else if (!base && targetObj.main && typeof targetObj.main === 'object' && isArr(targetObj.main[suffix])) {
                    startColor = Array.from(targetObj.main[suffix]);
                    cdState._nestedPath = ["main", suffix];
                } else if (targetObj[exactKey] && typeof targetObj[exactKey] === 'object') {
                    const fallback = targetObj[exactKey]["_ON"] || targetObj[exactKey]["_OFF"] || Object.values(targetObj[exactKey])[0];
                    startColor = isArr(fallback) ? Array.from(fallback) : [128, 128, 128, 1];
                    cdState._nestedPath = [exactKey, "_ON"];
                }
            } else if (targetObj[exactKey] && typeof targetObj[exactKey] === 'object' && !isArr(targetObj[exactKey])) {
                const subObj = targetObj[exactKey];
                const availableSuffix = subObj["_ON"] ? "_ON" : (subObj["_OFF"] ? "_OFF" : Object.keys(subObj)[0]);
                if (availableSuffix) {
                    const fallback = subObj[availableSuffix];
                    startColor = isArr(fallback) ? Array.from(fallback) : [128, 128, 128, 1];
                    cdState._nestedPath = [exactKey, availableSuffix];
                }
            } else {
                startColor = isArr(targetObj[exactKey]) ? Array.from(targetObj[exactKey]) : [128, 128, 128, 1];
                cdState._nestedPath = [exactKey];
            }
        }
    } else {
        cdState.originalKeyData = null;
    }

    if (startColor && startColor.length >= 4 && typeof startColor[3] === 'string') {
        const match = startColor[3].match(/rgba?\([\d\s]+,[\d\s]+,[\d\s]+,([\d.]+)\)/);
        startColor = [startColor[0], startColor[1], startColor[2], match ? parseFloat(match[1]) : 1];
    }
    cdState.currentVals = cdState.mode === "HSVA" ? rgbaToHsva(...startColor) : [...startColor];

    const config = {
        host: host,
        titleLabel: `Color Designer: ${exactKey}`,
        autoSize: true,
        targetRegion: (host && host.properties && host.properties[`bastaOffset_${id}`]) ? null : targetRegion,
        properties: {
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            autoWidth: true
        },
        layoutMap: (basta, vars) => {
            const { mW, mH, sW, sH, oY, pW, pH } = vars;
            const state = cdState;
            const mode = state.mode;
            const [v1, v2, v3, a] = state.currentVals;

            const labels = mode === "HSVA" ? ["HUE", "SATURATION", "VALUE", "ALPHA"] : ["RED", "GREEN", "BLUE", "ALPHA"];
            const ranges = mode === "HSVA" ? [[0, 360], [0, 1], [0, 1], [0, 1]] : [[0, 255], [0, 255], [0, 255], [0, 1]];

            const rawColor = mode === "HSVA"
                ? hsvaToRgba(v1, v2, v3, a)
                : [v1, v2, v3, a];

            // THE PRECISION FIX: Ensure values are 0-255 integers to prevent "Black" rendering in strict canvas context modes
            const currentColor = [Math.round(rawColor[0]), Math.round(rawColor[1]), Math.round(rawColor[2]), rawColor[3]];

            return {
                contentRegion: {
                    mainRow: {
                        anchor: { target: "headerRegion", axis: "y", offset: oY },
                        dir: "row", width: "full", height: "auto",
                        margin: [mW, mH], spacing: [0, sH],
                        sliderRegion: {
                            dir: "col", spacing: [sW, sH],
                            minWidth: 200, width: "full", height: "auto",
                            row_H: {
                                dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                prompt_H: {
                                    type: UI_TYPES.EDITOR, canvasShield: true,
                                    themeKey: "dialog, t_textSystem", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                                    width: 30, height: "auto", value: v1.toFixed((mode === "HSVA" || mode === "RGBA") ? 0 : 2), spacing: [sW, 0], padding: [pW, pH],
                                    // THE LIVE KEYBOARD FIX: Shift from onBlur to onInput for real-time reactivity
                                    onInput: (val) => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) { state.currentVals[0] = Math.max(ranges[0][0], Math.min(ranges[0][1], num)); updateHostThemeColor(basta); }
                                    }
                                },
                                slider_H: {
                                    type: UI_TYPES.SLIDER, label: labels[0], noHover: true, value: v1, min: ranges[0][0], max: ranges[0][1],
                                    themeKey: "button, t_textSystem", labelAlign: ["center", "middle"], width: "full", padding: [pW, pH], height: "auto",
                                    onChange: (val) => { state.currentVals[0] = val; updateHostThemeColor(basta); }
                                }
                            },
                            row_S: {
                                dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                prompt_S: {
                                    type: UI_TYPES.EDITOR, canvasShield: true,
                                    themeKey: "dialog, t_textSystem", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                                    width: 30, height: "auto", value: v2.toFixed(mode === "RGBA" ? 0 : 2), spacing: [sW, 0], padding: [pW, pH],
                                    onInput: (val) => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) { state.currentVals[1] = Math.max(ranges[1][0], Math.min(ranges[1][1], num)); updateHostThemeColor(basta); }
                                    }
                                },
                                slider_S: {
                                    type: UI_TYPES.SLIDER, label: labels[1], noHover: true, value: v2, min: ranges[1][0], max: ranges[1][1],
                                    themeKey: "button, t_textSystem", labelAlign: ["center", "middle"], width: "full", padding: [pW, pH], height: "auto",
                                    onChange: (val) => { state.currentVals[1] = val; updateHostThemeColor(basta); }
                                }
                            },
                            row_V: {
                                dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                prompt_V: {
                                    type: UI_TYPES.EDITOR, canvasShield: true,
                                    themeKey: "dialog, t_textSystem", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                                    width: 30, height: "auto", value: v3.toFixed(mode === "RGBA" ? 0 : 2), spacing: [sW, 0], padding: [pW, pH],
                                    onInput: (val) => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) { state.currentVals[2] = Math.max(ranges[2][0], Math.min(ranges[2][1], num)); updateHostThemeColor(basta); }
                                    }
                                },
                                slider_V: {
                                    type: UI_TYPES.SLIDER, label: labels[2], noHover: true, value: v3, min: ranges[2][0], max: ranges[2][1],
                                    themeKey: "button, t_textSystem", labelAlign: ["center", "middle"], width: "full", padding: [pW, pH], height: "auto",
                                    onChange: (val) => { state.currentVals[2] = val; updateHostThemeColor(basta); }
                                }
                            },
                            row_A: {
                                dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                prompt_A: {
                                    type: UI_TYPES.EDITOR, canvasShield: true,
                                    themeKey: "dialog, t_textSystem", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                                    width: 30, height: "auto", value: a.toFixed(2), spacing: [sW, 0], padding: [pW, pH],
                                    onInput: (val) => {
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) { state.currentVals[3] = Math.max(ranges[3][0], Math.min(ranges[3][1], num)); updateHostThemeColor(basta); }
                                    }
                                },
                                slider_A: {
                                    type: UI_TYPES.SLIDER, label: labels[3], noHover: true, value: a, min: ranges[3][0], max: ranges[3][1],
                                    themeKey: "button, t_textSystem", labelAlign: ["center", "middle"], width: "full", padding: [pW, pH], height: "auto",
                                    onChange: (val) => { state.currentVals[3] = val; updateHostThemeColor(basta); }
                                }
                            }
                        },

                        colorSettingRegion: {
                            dir: "col", spacing: [0, sH],
                            width: 50 , height: "match", padding: [0, 0],
                            btnColorMode: {
                                type: UI_TYPES.BUTTON, themeKey: "systemButton, t_textSmall",
                                text: mode, width: 50, height: "auto", padding: [pW, pH], spacing: [0, sH],
                                objectAlign: ["left", "top"], labelAlign: ["center", "middle"],
                                onPress: () => {
                                    state.mode = state.mode === "HSVA" ? "RGBA" : "HSVA";
                                    if (state.mode === "RGBA") {
                                        state.currentVals = hsvaToRgba(state.currentVals[0], state.currentVals[1], state.currentVals[2], state.currentVals[3]);
                                    } else {
                                        state.currentVals = rgbaToHsva(state.currentVals[0], state.currentVals[1], state.currentVals[2], state.currentVals[3]);
                                    }
                                    if (basta.layout) basta.layout._lastCacheKey = "";

                                    // THE DIRECT INJECTION FIX: Sync preview instantly on mode switch
                                    if (basta.layout && basta.layout.computedRegions && basta.layout.computedRegions.swatchPreview) {
                                        const c = state.currentVals;
                                        const liveRgba = state.mode === "HSVA" ? hsvaToRgba(c[0], c[1], c[2], c[3]) : [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), c[3]];
                                        basta.layout.computedRegions.swatchPreview.btnColor = [Math.round(liveRgba[0]), Math.round(liveRgba[1]), Math.round(liveRgba[2]), liveRgba[3]];
                                    }

                                    basta._forceSync = true;
                                    basta.setDirtyCanvas(true);
                                }
                            },
                            swatchPreview: {
                                // THE NATIVE PAINT FIX: Using UI_TYPES.BUTTON with an empty themeKey allows btnColor to override
                                // perfectly, but we must use a dynamic state string to bypass widget-level paint caching
                                // while the interaction lock is active during a slider drag.
                                type: UI_TYPES.BUTTON, themeKey: "", text: " ",
                                noHover: true,
                                bypassHashOptimization: true,
                                state: `LIVE_${currentColor.join('_')}`,
                                width: 50, height: "fill",
                                objectAlign: ["left", "top"], drawChecker: true,
                                btnColor: [...currentColor]
                            }
                        }
                    }
                },
                footerRegion: {
                    btnApply: {
                        type: UI_TYPES.BUTTON, themeKey: "buttonNode, t_textSystem", text: "Apply", noHover: false,
                        width: "auto", height: "auto",
                        objectAlign: ["right", "middle"], labelAlign: ["center", "middle"],
                        onPress: () => {
                            const node = cdState.hostNode;
                            if (node && node.themeToEdit && node._selectedKeyName) {
                                const cfg = window.xcpDerpThemeConfig;
                                const keyName = node._selectedKeyName;

                                // THE FIX: Pierce the proxy to retrieve the true theme name ONLY for live Theme Manager edits.
                                const isLiveThemeManager = (node._selectedThemeName === "__PALETTE_LOCAL__" && node.__proto__ && node.themeToEdit === node.__proto__.themeToEdit);
                                const tName = isLiveThemeManager
                                    ? (node.properties?.selectedThemeName || node.__proto__._selectedThemeName)
                                    : node._selectedThemeName;

                                // THE PALETTE GUARD: Ensure the theme exists and isn't the local staging proxy
                                if (tName && tName !== "__PALETTE_LOCAL__" && cfg && cfg.themes && cfg.themes[tName]) {
                                    const dataToSave = node.themeToEdit[keyName];
                                    if (dataToSave !== undefined) {
                                        cfg.themes[tName][keyName] = JSON.parse(JSON.stringify(dataToSave));
                                    }
                                }
                            }
                            cdState.applyPressed = true;
                            basta.close();
                        }
                    }
                }
            };
        }
    };

    const bastaInstance = spawnBasta(id, config);

    // THE THEME CONTEXT FIX: "Make it like the other bastas" - Decouple UI skinning from data editing
    if (host) {

        // THE REDIRECTION FIX: Ensure the designer uses a valid visual theme (e.g. Template_Standard_v02)
        // for its own UI components if the host is currently editing a local staging proxy.
        const visualTheme = host.properties?.selectedTheme || host._selectedThemeName || "Template_Standard_v02";
        const vThemeName = (visualTheme === "__PALETTE_LOCAL__") ? "Template_Standard_v02" : visualTheme;
        bastaInstance.properties.selectedTheme = vThemeName;

        // THE MERGE FIX: Ensure the Designer's themeToEdit contains the UI keys from the visual theme
        // so its own widgets (buttons, sliders) can render correctly while it edits the data.
        const globalTheme = window.xcpDerpThemeConfig?.themes?.[vThemeName] || {};
        bastaInstance.themeToEdit = Object.assign({}, globalTheme, JSON.parse(JSON.stringify(host.themeToEdit || {})));

        bastaInstance._selectedKeyName = host._selectedKeyName;
        bastaInstance._activeThemeToEdit = bastaInstance.themeToEdit;
        bastaInstance._activeKeyName = bastaInstance._selectedKeyName;
        bastaInstance._selectedThemeName = host._selectedThemeName;
        bastaInstance.properties.pushChanges = false;

        // Force an immediate hydration pass using the validated visual theme
        if (window.xcpDerpThemeConfig && typeof bastaInstance.onThemeUpdate === "function") {
            bastaInstance.onThemeUpdate(window.xcpDerpThemeConfig);
        }
    }

    bastaInstance._skipAnimOnce = true;

    if (!bastaInstance._isDerpClosePatched) {
        const originalClose = bastaInstance.close;
        bastaInstance.close = function() {
            if (this.isClosing) return;
            this.isClosing = true;
            revertHostThemeColor();
            originalClose.call(this);
        };

        const originalHandler = bastaInstance.handleShieldInteraction;
        bastaInstance.handleShieldInteraction = function(type, data) {
            // THE DERP-SLIDER FIX: Override interaction to handle live-dragging for canvas-based sliders.
            if (type === "down" || type === "drag") {
                const hit = this._pressedRegionKey || (this.layout ? this.layout.hitTest([data.localX, data.localY], null, 0) : null);
                if (hit && hit.startsWith("slider_")) {
                    const reg = this.layout.computedRegions[hit];
                    if (reg) {
                        const i = ["slider_H", "slider_S", "slider_V", "slider_A"].indexOf(hit);
                        if (i !== -1) {
                            const ranges = cdState.mode === "HSVA" ? [[0, 360], [0, 1], [0, 1], [0, 1]] : [[0, 255], [0, 255], [0, 255], [0, 1]];
                            const [min, max] = ranges[i];
                            const percent = Math.max(0, Math.min(1, (data.localX - reg.x) / reg.w));
                            let val = min + (percent * (max - min));

                            // Native Precision Matching
                            if (cdState.mode === "RGBA" && i < 3) val = Math.round(val);
                            else if (cdState.mode === "HSVA" && i === 0) val = Math.round(val);

                            cdState.currentVals[i] = val;

                            // THE INTERACTION SYNC: Push values and force an immediate frame redraw
                            updateHostThemeColor(this);
                            this._forceSync = true;
                            if (this.setDirtyCanvas) this.setDirtyCanvas(true);
                            if (app.canvas) app.canvas.setDirty(true, true); // THE WAKE FIX: Force LiteGraph to render while the pointer is locked

                            return true;
                        }
                    }
                }
            }
            if (originalHandler) return originalHandler.apply(this, arguments);
            return false;
        };
        bastaInstance._isDerpClosePatched = true;
    }

    return bastaInstance;
}