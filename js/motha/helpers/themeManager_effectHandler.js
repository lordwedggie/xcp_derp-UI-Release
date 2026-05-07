/**
 * Path: ./nodes/themeManager_effectHandler.js
 * Specialist: Shadow, Stroke, and Glow Effect Properties
 */
import { app } from "../../../../scripts/app.js";
import { showBastaColorDesigner } from "../../fatha/bastas/bastaColorDesigner.js";
import { pushThemeUpdate } from "./themeManager_keyHandler.js";

const GLOW_CLIP_MAP = { "None": "c_glowNone", "Inside": "c_glowInside", "Outside": "c_glowOutside" };
const GLOW_CLIP_REV = { "c_glowNone": "None", "c_glowInside": "Inside", "c_glowOutside": "Outside" };
const SHADOW_CLIP_MAP = { "None": "c_shadowNone", "Inside": "c_shadowInside", "Outside": "c_shadowOutside" };
const SHADOW_CLIP_REV = { "c_shadowNone": "None", "c_shadowInside": "Inside", "c_shadowOutside": "Outside" };

export function updateEffectRegions(node) {
    if (!node.layoutMap) return;
    const val = node._selectedKeyName;
    if (!val) return;

    const isTextKey = val.startsWith("t_");
    const keyData = node.themeToEdit[val] || {};

    const hasShadow = keyData.hasOwnProperty("shadow");
    const hasStroke = keyData.hasOwnProperty("stroke");
    const hasGlow = keyData.hasOwnProperty("glow");

    if (node.layoutMap.shadowRegion) {
        // Reads disabled values so the UI displays correctly when toggled off
        const shadow = keyData.shadow || keyData.shadowDisabled || [0, 0, 4, "rgba(0,0,0,0.5)"];
        const sReg = node.layoutMap.shadowRegion;

        sReg.shadowColorEdit.disabled = !hasShadow;
        sReg.lblShadow.state = hasShadow ? "ON" : "OFF";
        // THE FIX: Dynamic state-based text
        sReg.lblShadow.text = hasShadow ? "Shadow ON" : "Shadow OFF";

        // Offset Logic
        if (sReg.lblShadowOffset) sReg.lblShadowOffset.state = hasShadow ? "OFF" : "DIS";
        sReg.promptShadowOffset.state = hasShadow ? "OFF" : "DIS";
        sReg.promptShadowOffset.value = `${shadow[0]}, ${shadow[1]}`;

        // Blur Logic
        if (sReg.lblShadowBlur) sReg.lblShadowBlur.state = hasShadow ? "OFF" : "DIS";
        sReg.promptShadowBlur.state = hasShadow ? "OFF" : "DIS";
        sReg.promptShadowBlur.value = String(shadow[2]);

        // Clip Logic
        if (sReg.lblShadowClip) sReg.lblShadowClip.state = hasShadow ? "OFF" : "DIS";
        if (sReg.dropdownShadowClip) {
            sReg.dropdownShadowClip.disabled = !hasShadow;
            // THE FIX: Default to 'None' for UI display
            const clipVal = keyData.shadowClip || "c_shadowNone";
            sReg.dropdownShadowClip.value = SHADOW_CLIP_REV[clipVal] || "None";
        }
    }
    if (node.layoutMap.strokeRegion) {
        const stroke = keyData.stroke || keyData.strokeDisabled || [0, 2, "rgba(0,0,0,1)"]; // Fallback sync
        const stReg = node.layoutMap.strokeRegion;
        const isTextDisabled = isTextKey;

        stReg.strokeColorEdit.disabled = isTextDisabled || !hasStroke;
        stReg.lblStroke.state = isTextDisabled ? "DIS" : (hasStroke ? "ON" : "OFF");
        stReg.lblStroke.text = hasStroke ? "Stroke ON" : "Stroke OFF";

        // Weight Sync (Index 0)
        const contentDisabled = isTextDisabled || !hasStroke;
        if (stReg.lblStrokeWeight) stReg.lblStrokeWeight.state = contentDisabled ? "DIS" : "OFF";
        if (stReg.promptStrokeWeight) {
            stReg.promptStrokeWeight.state = contentDisabled ? "DIS" : "OFF";
            stReg.promptStrokeWeight.value = String(stroke[0]);
        }

        // Mode Sync (Index 1: Mapping Number to Label)
        if (stReg.lblStrokeMode) stReg.lblStrokeMode.state = contentDisabled ? "DIS" : "OFF";
        if (stReg.dropdownStrokeMode) {
            stReg.dropdownStrokeMode.disabled = contentDisabled;
            const modeMap = { 0: "Center", 1: "Inside", 2: "Outside" };
            stReg.dropdownStrokeMode.value = modeMap[stroke[1]] || "Outside";
        }
    }
    if (node.layoutMap.glowRegion) {
        const glow = keyData.glow || keyData.glowDisabled || [0, 0, 4, "rgba(0,0,0,0.5)"];
        const gReg = node.layoutMap.glowRegion;

        const glowDisabledByDeps = !isTextKey && (!hasShadow || !hasStroke);

        gReg.glowColorEdit.disabled = !hasGlow || glowDisabledByDeps;
        gReg.lblGlow.state = glowDisabledByDeps ? "DIS" : (hasGlow ? "ON" : "OFF");
        gReg.lblGlow.text = hasGlow ? "Glow ON" : "Glow OFF";

        const contentDisabled = !hasGlow || glowDisabledByDeps;

        // Sync labels and inputs to the dependency state
        if (gReg.lblGlowOffset) gReg.lblGlowOffset.state = contentDisabled ? "DIS" : "OFF"; // FIXED
        gReg.promptGlowOffset.state = contentDisabled ? "DIS" : "OFF";
        gReg.promptGlowOffset.value = `${glow[0]}, ${glow[1]}`;

        if (gReg.lblGlowBlur) gReg.lblGlowBlur.state = contentDisabled ? "DIS" : "OFF";
        gReg.promptGlowBlur.state = contentDisabled ? "DIS" : "OFF";
        gReg.promptGlowBlur.value = String(glow[2]);

        if (gReg.lblGlowClip) gReg.lblGlowClip.state = contentDisabled ? "DIS" : "OFF";
        if (gReg.dropdownGlowClip) {
            gReg.dropdownGlowClip.disabled = contentDisabled;
            // THE FIX: Default to 'None' for UI display
            const clipVal = keyData.glowClip || "c_glowNone";
            gReg.dropdownGlowClip.value = GLOW_CLIP_REV[clipVal] || "None";
        }
    }
}

export function bindEffectEvents(node, updateThemeLayoutFn) {
    if (!node.layoutMap) return;

    const openDesignerProxy = (exactKey, persistentKey) => {
        const safeHost = Object.create(node);
        safeHost.themeToEdit = node.themeToEdit;
        safeHost._selectedKeyName = node._selectedKeyName;
        safeHost._selectedThemeName = "__PALETTE_LOCAL__";
        safeHost.requestDerpSync = () => node.requestDerpSync();
        showBastaColorDesigner(safeHost, exactKey, persistentKey);
    };
    node.layoutMap.shadowRegion.shadowColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "shadowColorEdit");
    node.layoutMap.strokeRegion.strokeColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "strokeColorEdit");
    node.layoutMap.glowRegion.glowColorEdit.onColorClick = (base, exactKey) => openDesignerProxy(exactKey, "glowColorEdit");

    const cfg = window.xcpDerpThemeConfig;
    const broadcastUpdate = () => {
        if (!cfg) return;
        if (node._selectedThemeName && cfg.touchTheme) cfg.touchTheme(node._selectedThemeName);
        if (node._selectedThemeName && cfg.notifyTheme) cfg.notifyTheme(node._selectedThemeName);
    };

    // 1. Shadow Toggle
    const sReg = node.layoutMap.shadowRegion;
    if (sReg) {
        const toggleShadow = () => {
            const val = node._selectedKeyName;
            const keyData = node.themeToEdit[val];
            const isTextKey = val.startsWith("t_");

            if (keyData.shadow) {
                keyData.shadowDisabled = JSON.parse(JSON.stringify(keyData.shadow));
                delete keyData.shadow;

                // THE FIX: Also disable Glow if Shadow is removed (Non-text only)
                if (!isTextKey && keyData.glow) {
                    keyData.glowDisabled = JSON.parse(JSON.stringify(keyData.glow));
                    delete keyData.glow;
                }
            } else if (keyData.shadowDisabled) {
                keyData.shadow = JSON.parse(JSON.stringify(keyData.shadowDisabled));
                delete keyData.shadowDisabled;
            } else {
                // Reads legacy property values if they exist
                const legacy = keyData._Shadow;
                if (legacy && Array.isArray(legacy)) {
                    keyData.shadow = [legacy[4] ?? 0, legacy[5] ?? 0, legacy[6] ?? 4, `rgba(${legacy[0]},${legacy[1]},${legacy[2]},${legacy[3] ?? 1})` ];
                    delete keyData._Shadow;
                } else {
                    let color = "rgba(0,0,0,0.5)";
                    const lc = keyData.shadow_ON || keyData.shadow_OFF;
                    if (lc) color = `rgba(${lc[0]},${lc[1]},${lc[2]},${lc[3] ?? 1})`;
                    keyData.shadow = [0, 0, 4, color];
                }
            }
            if (cfg && node._selectedThemeName) cfg.themes[node._selectedThemeName][val] = keyData;
            broadcastUpdate();
            updateThemeLayoutFn(node);
            node.requestDerpSync();
        };
        // Toggle logic is now handled solely by the interactive label button
        if (sReg.lblShadow) sReg.lblShadow.onClick = toggleShadow;

        // 5. Shadow Offset Event (Immediate Update)
        const updateShadowOffset = (v) => {
            const val = node._selectedKeyName;
            const parts = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

            if (parts.length > 0) {
                const x = parts[0];
                const y = parts.length > 1 ? parts[1] : x; // Fallback: both use X if only one number entered

                if (!node.themeToEdit[val].shadow) {
                    node.themeToEdit[val].shadow = [0, 0, 4, "rgba(0,0,0,0.5)"];
                }

                node.themeToEdit[val].shadow[0] = x;
                node.themeToEdit[val].shadow[1] = y;

                if (node.properties.pushChanges) {
                    pushThemeUpdate(node, val, "shadow", node.themeToEdit[val].shadow);
                }
                updateThemeLayoutFn(node);
                node.requestDerpSync();
            }
        };

        sReg.promptShadowOffset.onInput = (v) => updateShadowOffset(v); // Trigger on every keystroke
        sReg.promptShadowOffset.onBlur = (v) => updateShadowOffset(v);

        // 6. Shadow Blur Event (Immediate + Clamped 0-20)
        const updateShadowBlur = (v) => {
            const val = node._selectedKeyName;
            const num = parseInt(v);

            if (!isNaN(num)) {
                // Clamp value between 0 and 20
                const clamped = Math.max(0, Math.min(20, num));

                if (!node.themeToEdit[val].shadow) {
                    node.themeToEdit[val].shadow = [0, 0, 4, "rgba(0,0,0,0.5)"];
                }

                node.themeToEdit[val].shadow[2] = clamped;

                if (node.properties.pushChanges) {
                    pushThemeUpdate(node, val, "shadow", node.themeToEdit[val].shadow);
                }
                updateThemeLayoutFn(node);
                node.requestDerpSync();
                return clamped;
            }
        };

        sReg.promptShadowBlur.onInput = (v) => updateShadowBlur(v);
        sReg.promptShadowBlur.onBlur = (v) => {
            const finalVal = updateShadowBlur(v);
            if (finalVal !== undefined) sReg.promptShadowBlur.value = String(finalVal);
        };

        // THE FIX: Add Shadow Clip Event Handler with correct map and internal key prefix
        if (sReg.dropdownShadowClip) {
            sReg.dropdownShadowClip.onChange = (label) => {
                const k = node._selectedKeyName;
                const internalKey = SHADOW_CLIP_MAP[label] || "c_shadowNone";

                node.themeToEdit[k].shadowClip = internalKey;
                if (node.properties.pushChanges) pushThemeUpdate(node, k, "shadowClip", internalKey);
                updateThemeLayoutFn(node); // FORCE SYNC
                node.requestDerpSync();
            };
        }
    }

    // 2. Stroke Toggle (DECOUPLED)
    const stReg = node.layoutMap.strokeRegion;
    if (stReg) {
        const toggleStroke = () => {
            const val = node._selectedKeyName;
            const keyData = node.themeToEdit[val];
            if (val.startsWith("t_")) return;

            if (keyData.stroke) {
                keyData.strokeDisabled = JSON.parse(JSON.stringify(keyData.stroke));
                delete keyData.stroke;

                // ALSO TURN OFF GLOW (Non-text objects only, as text objects exit early above)
                if (keyData.glow) {
                    keyData.glowDisabled = JSON.parse(JSON.stringify(keyData.glow));
                    delete keyData.glow;
                }
            } else if (keyData.strokeDisabled) {
                keyData.stroke = JSON.parse(JSON.stringify(keyData.strokeDisabled));
                delete keyData.strokeDisabled;
            } else {
                let color = "rgba(0,0,0,1)";
                const lc = keyData.stroke_ON || keyData.stroke_OFF;
                if (lc) color = `rgba(${lc[0]},${lc[1]},${lc[2]},${lc[3] ?? 1})`;
                keyData.stroke = [1, 2, color];
            }

            if (cfg && node._selectedThemeName) cfg.themes[node._selectedThemeName][val] = keyData;
            broadcastUpdate();
            updateThemeLayoutFn(node);
            node.requestDerpSync();
        };
        if (stReg.lblStroke) stReg.lblStroke.onClick = toggleStroke;

        // 8. Stroke Weight & Mode Events (Immediate Updates)
        const updateStrokeWeight = (v) => {
            const val = node._selectedKeyName;
            const num = parseFloat(v);
            if (!isNaN(num)) {
                const clamped = Math.max(0, Math.min(10, num)); // Clamp 0-10
                if (!node.themeToEdit[val].stroke) {
                    // THE FIX: Use numeric placement default (2) instead of string
                    node.themeToEdit[val].stroke = [0, 2, "rgba(0,0,0,1)"];
                }
                node.themeToEdit[val].stroke[0] = clamped;
                if (node.properties.pushChanges) pushThemeUpdate(node, val, "stroke", node.themeToEdit[val].stroke);
                updateThemeLayoutFn(node);
                node.requestDerpSync();
                return clamped;
            }
        };

        if (stReg.promptStrokeWeight) {
            stReg.promptStrokeWeight.onInput = (v) => updateStrokeWeight(v);
            stReg.promptStrokeWeight.onBlur = (v) => {
                const finalVal = updateStrokeWeight(v);
                if (finalVal !== undefined) stReg.promptStrokeWeight.value = String(finalVal);
            };
        }

        if (stReg.dropdownStrokeMode) {
            stReg.dropdownStrokeMode.onChange = (val) => {
                const k = node._selectedKeyName;
                if (!node.themeToEdit[k].stroke) {
                    node.themeToEdit[k].stroke = [0, 2, "rgba(0,0,0,1)"]; // Default to 'Outside' (2)
                }
                // Mapping Label to Number for MasterPainter compliance
                const valMap = { "Center": 0, "Inside": 1, "Outside": 2 };
                node.themeToEdit[k].stroke[1] = valMap[val] ?? 2;

                if (node.properties.pushChanges) pushThemeUpdate(node, k, "stroke", node.themeToEdit[k].stroke);
                updateThemeLayoutFn(node); // FORCE SYNC
                node.requestDerpSync();
            };
        }
    }

    // 3. Glow Toggle (DECOUPLED)
    const gReg = node.layoutMap.glowRegion;
    if (gReg) {
        const toggleGlow = () => {
            const val = node._selectedKeyName;
            const keyData = node.themeToEdit[val];
            const isTextKey = val.startsWith("t_");

            // THE FIX: Block toggle if Shadow OR Stroke are missing for non-text objects
            if (!isTextKey && (!keyData.shadow || !keyData.stroke) && !keyData.glow) return;

            if (keyData.glow) {
                keyData.glowDisabled = JSON.parse(JSON.stringify(keyData.glow));
                delete keyData.glow;
            } else if (keyData.glowDisabled) {
                keyData.glow = JSON.parse(JSON.stringify(keyData.glowDisabled));
                delete keyData.glowDisabled;
            } else {
                let color = "rgba(255,255,255,1)";
                const lc = keyData.glow_ON || keyData.glow_OFF;
                if (lc) color = `rgba(${lc[0]},${lc[1]},${lc[2]},${lc[3] ?? 1})`;
                keyData.glow = [0, 0, 12, color];
            }

            if (cfg && node._selectedThemeName) cfg.themes[node._selectedThemeName][val] = keyData;
            broadcastUpdate();
            updateThemeLayoutFn(node);
            node.requestDerpSync();
        };
        if (gReg.lblGlow) gReg.lblGlow.onClick = toggleGlow;

        // 7. Glow Offset & Blur Events (Immediate Updates)
        const updateGlowOffset = (v) => {
            const val = node._selectedKeyName;
            const parts = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
            if (parts.length > 0) {
                const x = parts[0];
                const y = parts.length > 1 ? parts[1] : x;
                if (!node.themeToEdit[val].glow) node.themeToEdit[val].glow = [0, 0, 4, "rgba(0,0,0,0.5)"];
                node.themeToEdit[val].glow[0] = x;
                node.themeToEdit[val].glow[1] = y;
                if (node.properties.pushChanges) pushThemeUpdate(node, val, "glow", node.themeToEdit[val].glow);
                updateThemeLayoutFn(node);
                node.requestDerpSync();
            }
        };

        gReg.promptGlowOffset.onInput = (v) => updateGlowOffset(v);
        gReg.promptGlowOffset.onBlur = (v) => updateGlowOffset(v);

        const updateGlowBlur = (v) => {
            const val = node._selectedKeyName;
            const num = parseInt(v);
            if (!isNaN(num)) {
                const clamped = Math.max(0, Math.min(20, num)); // Clamp 0-20
                if (!node.themeToEdit[val].glow) node.themeToEdit[val].glow = [0, 0, 4, "rgba(0,0,0,0.5)"];
                node.themeToEdit[val].glow[2] = clamped;
                // FIXED: Using 'val' instead of undefined 'key'
                if (node.properties.pushChanges) pushThemeUpdate(node, val, "glow", node.themeToEdit[val].glow);
                updateThemeLayoutFn(node);
                node.requestDerpSync();
                return clamped;
            }
        };

        gReg.promptGlowBlur.onInput = (v) => updateGlowBlur(v);
        gReg.promptGlowBlur.onBlur = (v) => {
            const finalVal = updateGlowBlur(v);
            if (finalVal !== undefined) gReg.promptGlowBlur.value = String(finalVal);
        };

        // THE FIX: Handle Glow Clip selection with internal key translation
        if (gReg.dropdownGlowClip) {
            gReg.dropdownGlowClip.onChange = (label) => {
                const k = node._selectedKeyName;
                const internalKey = GLOW_CLIP_MAP[label] || "c_glowNone";

                node.themeToEdit[k].glowClip = internalKey;
                if (node.properties.pushChanges) pushThemeUpdate(node, k, "glowClip", internalKey);
                updateThemeLayoutFn(node); // FORCE SYNC
                node.requestDerpSync();
            };
        }
    }
}
