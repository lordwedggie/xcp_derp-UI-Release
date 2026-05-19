/**
 * Path: ./Herbina/widgets/widget_ColorKey.js
 * Canvas-based Color Key Editor implementing 3-color problem logic.
 * STATUS: PROTOCOL COMPLIANT | REFACTORED
 */
import { masterPainter, masterPainterText } from "../masterPainter.js";
import { getPulsedColor } from "../masterAnimator.js";
import { cdState } from "../../fatha/bastas/bastaColorDesigner.js";
import { resolvePaintData, resolveWidgetState, interpretLayoutProps, resolveWidgetEnv } from "../utils/widgetsUtils.js";
const CHECKER_COLOR_A = "rgba(100, 100, 100, 0.5)";
const CHECKER_COLOR_B = "rgba(10, 10, 10, 0.5)";
const CHECKER_SIZE = 8;
// --- GLOBAL MOUSE TRACKER ---
// Bypasses the Fatha DOM shield which blocks native canvas mouse events
let _screenMouseX = -1000;
let _screenMouseY = -1000;
window.addEventListener("pointermove", (e) => {
    _screenMouseX = e.clientX;
    _screenMouseY = e.clientY;
});

// --- GLOBAL DRAG STATE ---
if (!window._derpColorDrag) {
    window._derpColorDrag = { active: false, startTime: 0, lastEndTime: 0, color: null, sourceSuffix: null, sourceNodeId: null, sourceRegionKey: null };
}

// --- CONFIGURATION ---
const STROKE_COLOR_A = [255, 255, 255, 0.9]; // Pure White
const STROKE_COLOR_B = [0, 0, 0, 0.5]; // Faded White
const STROKE_WEIGHT = 1;
const ANIM_SPEED = 0.003; // Lower is slower

function enforceStatePair(arrA, arrB) {
    if (!arrA || !arrB) return;
    for (let i = 0; i < 3; i++) arrB[i] = arrA[i];
    const targetAlpha = arrA._baseAlpha !== undefined ? arrA._baseAlpha : arrA[3];
    arrB[3] = targetAlpha;
    if (arrB._baseAlpha !== undefined) arrB._baseAlpha = targetAlpha;
}

export function createColorKeyEdit() {
    return { type: "colorKeyEdit" };
}

export function syncColorKeyEdit(ctx, node, config) {
    const { geometry } = config;
    // THE CONTEXT OVERRIDE: Prioritize config-level theme settings for isolated preview widgets
    const targetTheme = config.themeToEdit || node.themeToEdit;
    const targetKeyName = config._selectedKeyName || node._selectedKeyName;

    if (!geometry || !targetTheme || !targetKeyName) return;

    // 1. Resolve State via Protocol
    const stateStr = resolveWidgetState(config);

// --- DISABLED MODE: Bypass all logic and draw placeholder ---
    if (stateStr === "DIS") {
        const { x, y, w, h } = geometry;
        const { props, bodyPaint, labelPaint } = resolveWidgetEnv(node, config);

        const fillColor = bodyPaint?.fill || "red";
        const cStr = Array.isArray(fillColor) ? `rgba(${fillColor[0]},${fillColor[1]},${fillColor[2]},${fillColor[3]})` : fillColor;

        masterPainter(ctx, {
            posX: x, posY: y, width: w, height: h,
            color: cStr,
            paintData: bodyPaint || { corners: [2, 2, 2, 2] }
        });

        masterPainterText(ctx, {
            text: config.text || "no effect key",
            x: x + w / 2, y: y + h / 2,
            align: "center", baseline: "middle",
            paintData: {
                ...labelPaint,
                font: labelPaint?.font || "Arial",
                fontSize: props.fontSize || labelPaint?.fontSize || 10,
                fontWeight: props.fontWeight || "normal",
                fill: labelPaint?.textColor || labelPaint?.fill || "red"
            }
        });

        if (config.key && node.layout?.regions?.[config.key]) {
            node.layout.regions[config.key].onClick = null;
        }
        return;
    }

    // --- ANIMATION ENGINE ---
    const currentStrokeColor = getPulsedColor(STROKE_COLOR_A, STROKE_COLOR_B, ANIM_SPEED);

    requestAnimationFrame(() => {
        if (node) node.setDirtyCanvas(true, true);
    });

    const x = geometry.x, y = geometry.y, width = geometry.w, height = geometry.h;
    const colorData = targetTheme[targetKeyName];
    if (!colorData) return;

    const sfx = config.colorSuffix || "";

    const kON = sfx ? `${sfx}_ON` : "_ON";
    const kOFF = sfx ? `${sfx}_OFF` : "_OFF";
    const kDIS = sfx ? `${sfx}_DIS` : "_DIS";
    const kLockL = sfx ? `${sfx}_lockL` : "_lockL";
    const kLockR = sfx ? `${sfx}_lockR` : "_lockR";

    // THE HYBRID FIX: Transparently route flat keys to nested palette objects
    const resolveVal = (key) => {
        if (key.includes("_")) {
            const parts = key.split("_");
            const base = parts[0];
            const suffix = "_" + parts[1];
            if (base && colorData[base] && typeof colorData[base] === 'object' && !Array.isArray(colorData[base])) return colorData[base][suffix];
            if (!base && colorData.main && typeof colorData.main === 'object' && !Array.isArray(colorData.main)) return colorData.main[suffix];
        }
        return colorData[key];
    };

    const assignVal = (key, val) => {
        if (key.includes("_")) {
            const parts = key.split("_");
            const base = parts[0];
            const suffix = "_" + parts[1];
            if (base && colorData[base] && typeof colorData[base] === 'object' && !Array.isArray(colorData[base])) { colorData[base][suffix] = val; return; }
            if (!base && colorData.main && typeof colorData.main === 'object' && !Array.isArray(colorData.main)) { colorData.main[suffix] = val; return; }
        }
        colorData[key] = val;
    };

    if (resolveVal(kON) === undefined) assignVal(kON, [0,0,0,1]);
    if (resolveVal(kOFF) === undefined) assignVal(kOFF, [0,0,0,1]);
    if (resolveVal(kDIS) === undefined) assignVal(kDIS, [0,0,0,1]);
    if (resolveVal(kLockL) === undefined) assignVal(kLockL, false);
    if (resolveVal(kLockR) === undefined) assignVal(kLockR, false);

    if (resolveVal(kLockL)) enforceStatePair(resolveVal(kOFF), resolveVal(kON));
    if (resolveVal(kLockR)) enforceStatePair(resolveVal(kOFF), resolveVal(kDIS));

    const LL = resolveVal(kLockL);
    const LR = resolveVal(kLockR);

    // 4. Compute Grid (Separated by sH gap)
    const lMap = node.layoutMap || {};
    const gap = lMap.sH || 2;
    const sW = (width - (gap * 2)) / 3;

    const xON  = x;
    const xOFF = xON + sW + gap;
    const xDIS = xOFF + sW + gap;

    // 5. Track Perfect Local Mouse for Interactions
    let mx = -1000, my = -1000;
    const canvas = node.graph?.canvas || window.app?.canvas;

    if (canvas && canvas.ds && canvas.canvas) {
        const rect = canvas.canvas.getBoundingClientRect();
        const ds = canvas.ds;
        mx = (_screenMouseX - rect.left) / ds.scale - ds.offset[0] - node.pos[0];
        my = (_screenMouseY - rect.top) / ds.scale - ds.offset[1] - node.pos[1];
    }

    const hitTest = (bx, by, bw, bh) => (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh);

    const isEditingThisWidget = cdState.isVisible && cdState.hostNode === node && cdState.activeWidgetKey === config.key;
    const checkState = (suffix) => cdState.activeStateSuffix === suffix;

    const vON  = (cdState.isVisible) ? (isEditingThisWidget && checkState(kON)) : hitTest(xON, y, sW, height);
    const vOFF = (cdState.isVisible) ? (isEditingThisWidget && checkState(kOFF)) : hitTest(xOFF, y, sW, height);
    const vDIS = (cdState.isVisible) ? (isEditingThisWidget && checkState(kDIS)) : hitTest(xDIS, y, sW, height);

    const hON  = !cdState.isVisible && hitTest(xON, y, sW, height);
    const hOFF = !cdState.isVisible && hitTest(xOFF, y, sW, height);
    const hDIS = !cdState.isVisible && hitTest(xDIS, y, sW, height);

    // 7. Draw Main Segments
    const drawSeg = (sx, sy, sw, sh, corners, rgba, isHover) => {
        // THE CHECKERBOARD PASS: Draw an inset grid behind the color for transparency previewing
        if (typeof ctx.roundRect === "function") {
            ctx.save();
            // THE INSET FIX: Shrink the checkerboard container rect by 1px on all sides
            const iX = sx + 1, iY = sy + 1, iW = sw - 2, iH = sh - 2;
            const radii = Array.isArray(corners) ? corners : [corners, corners, corners, corners];
            ctx.beginPath();
            ctx.roundRect(iX, iY, iW, iH, radii);
            ctx.clip();

            const rows = Math.ceil(iH / CHECKER_SIZE);
            const cols = Math.ceil(iW / CHECKER_SIZE);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? CHECKER_COLOR_A : CHECKER_COLOR_B;
                    ctx.fillRect(iX + (c * CHECKER_SIZE), iY + (r * CHECKER_SIZE), CHECKER_SIZE, CHECKER_SIZE);
                }
            }
            ctx.restore();
        }

        const cStr = rgba ? `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]})` : "rgba(0,0,0,0.5)";
        masterPainter(ctx, {
            posX: sx, posY: sy, width: sw, height: sh,
            color: cStr,
            paintData: { corners }
        });
        if (isHover) {
            masterPainter(ctx, {
                posX: sx, posY: sy, width: sw, height: sh,
                color: "rgba(255,255,255,0.15)",
                paintData: { corners }
            });
        }
    };

    const drawInnerStroke = (sx, sy, sw, sh, corners, activeColor) => {
        if (typeof ctx.roundRect !== "function") return;
        ctx.save();
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = STROKE_WEIGHT;
        const inset = STROKE_WEIGHT / 2;
        const radii = Array.isArray(corners) ? corners.map(r => Math.max(0, r - inset)) : [corners, corners, corners, corners];
        ctx.beginPath();
        ctx.roundRect(sx + inset, sy + inset, sw - STROKE_WEIGHT, sh - STROKE_WEIGHT, radii);
        ctx.stroke();
        ctx.restore();
    };

    // Draw buttons with separate rounding
    drawSeg(xON, y, sW, height, [2, 2, 2, 2], resolveVal(kON), hON);
    drawSeg(xOFF, y, sW, height, [2, 2, 2, 2], resolveVal(kOFF), hOFF);
    drawSeg(xDIS, y, sW, height, [2, 2, 2, 2], resolveVal(kDIS), hDIS);

    // 8. Draw Inner Strokes
    if (vON) drawInnerStroke(xON, y, sW, height, [2, 2, 2, 2], currentStrokeColor);
    if (vOFF) drawInnerStroke(xOFF, y, sW, height, [2, 2, 2, 2], currentStrokeColor);
    if (vDIS) drawInnerStroke(xDIS, y, sW, height, [2, 2, 2, 2], currentStrokeColor);

    // 10. Interaction Handler
// --- 10. Interaction Handler (RECALIBRATED FOR SEPARATED LAYOUT) ---
    if (config.key && node.layout?.regions?.[config.key]) {
        const persistentReg = node.layout.regions[config.key];

        persistentReg.onClick = (e, clickData) => {
            if (cdState.isVisible) return;

            // THE CLICK DEBOUNCE: Prevent a successful drag release from being registered as a single click
            if (window._derpColorDrag && (Date.now() - window._derpColorDrag.lastEndTime < 100)) return;

            // THE STICKY DRAG FIX: Clear drag state on click to prevent the color from getting stuck
            if (window._derpColorDrag) window._derpColorDrag.active = false;

            // 1. Safety Guard: Use physical geometry, as layout engine strips config.width
            if (width === 0 || height === 0) return;

            // 2. Coordinate Resolution
            let clickX = (clickData && clickData.localX !== undefined) ? clickData.localX : mx;
            let clickY = (clickData && clickData.localY !== undefined) ? clickData.localY : my;

            // 3. Precise Hit-Test Helper (Includes jitter padding)
            const isHit = (bx, by, bw, bh, padding = 0) => (
                clickX >= bx - padding &&
                clickX <= bx + bw + padding &&
                clickY >= by - padding &&
                clickY <= by + bh + padding
            );

            // 4. Vertical Bounds Check
            if (clickY < y - 5 || clickY > y + height + 5) return;

            // 5. Check Color Segments
            if (isHit(xON, y, sW, height)) {
                if (config.onColorClick) config.onColorClick("_ON", kON);
            }
            else if (isHit(xOFF, y, sW, height)) {
                if (config.onColorClick) config.onColorClick("_OFF", kOFF);
            }
            else if (isHit(xDIS, y, sW, height)) {
                if (config.onColorClick) config.onColorClick("_DIS", kDIS);
            }

            // 8. Theme Broadcast (Bypass if this widget is an isolated preview)
            if (node.properties?.pushChanges && !config.themeToEdit) {
                const cfg = window.xcpDerpThemeConfig;
                if (cfg && node._selectedThemeName && cfg.themes[node._selectedThemeName]) {
                    const cleanData = JSON.parse(JSON.stringify(colorData));
                    Object.keys(cleanData).forEach(k => { if (k.includes("_lock")) delete cleanData[k]; });

                    cfg.themes[node._selectedThemeName][node._selectedKeyName] = cleanData;

                    const nodes = app.graph._nodes;
                    if (nodes) {
                        nodes.forEach(n => {
                            if (n && typeof n.onThemeUpdate === "function") n.onThemeUpdate(cfg);
                        });
                    }
                }
            }
            node.requestDerpSync();
        };

        persistentReg.onDragStart = (e, clickData) => {
            if (cdState.isVisible) return;
            // THE PREVIEW DRAG ENABLE: Allows dragging colors from read-only preview widgets (like Palette Manager)
            let clickX = (clickData && clickData.localX !== undefined) ? clickData.localX : mx;
            let clickY = (clickData && clickData.localY !== undefined) ? clickData.localY : my;
            const isHit = (bx, by, bw, bh, padding = 0) => (
                clickX >= bx - padding && clickX <= bx + bw + padding &&
                clickY >= by - padding && clickY <= by + bh + padding
            );

            if (clickY < y - 5 || clickY > y + height + 5) return;
            let sourceSuffix = null;
            if (isHit(xON, y, sW, height)) sourceSuffix = kON;
            else if (isHit(xOFF, y, sW, height)) sourceSuffix = kOFF;
            else if (isHit(xDIS, y, sW, height)) sourceSuffix = kDIS;

            if (sourceSuffix && colorData[sourceSuffix]) {
                window._derpColorDrag.active = true;
                window._derpColorDrag.startTime = Date.now(); // THE DRAG TIMER: Records when the hold began to differentiate from a click
                window._derpColorDrag.color = [...colorData[sourceSuffix]];
                window._derpColorDrag.sourceSuffix = sourceSuffix;
                window._derpColorDrag.sourceNodeId = node.id;
                window._derpColorDrag.sourceRegionKey = config.key;
            }
        };

        persistentReg.onDrag = (e, clickData) => {
            if (window._derpColorDrag && window._derpColorDrag.active) {
                node.setDirtyCanvas(true, true);
            }
        };

        persistentReg.onDragEnd = (e, clickData) => {
            if (!window._derpColorDrag || !window._derpColorDrag.active) return;

            // THE DRAG THRESHOLD: Ignore drops that happen too quickly (prevents click confusion)
            if (Date.now() - (window._derpColorDrag.startTime || 0) < 150) {
                window._derpColorDrag.active = false;
                node.setDirtyCanvas(true, true);
                return;
            }

            const dragColor = window._derpColorDrag.color;
            window._derpColorDrag.active = false;
            window._derpColorDrag.lastEndTime = Date.now(); // THE DEBOUNCE TRACKER

            const ds = canvas.ds;
            const canvasX = (_screenMouseX - canvas.canvas.getBoundingClientRect().left) / ds.scale - ds.offset[0];
            const canvasY = (_screenMouseY - canvas.canvas.getBoundingClientRect().top) / ds.scale - ds.offset[1];

            let targetEntity = null;
            const entities = [...(app.graph._nodes || [])];
            if (window.xcpActiveBastas) entities.push(...window.xcpActiveBastas.values());

            for (let i = entities.length - 1; i >= 0; i--) {
                const ent = entities[i];
                if (ent.flags?.collapsed || !ent.size) continue;
                if (canvasX >= ent.pos[0] && canvasX <= ent.pos[0] + ent.size[0] &&
                    canvasY >= ent.pos[1] && canvasY <= ent.pos[1] + ent.size[1]) {
                    targetEntity = ent;
                    break;
                }
            }

            if (targetEntity && targetEntity.layout && targetEntity.themeToEdit && targetEntity._selectedKeyName) {
                const localX = canvasX - targetEntity.pos[0];
                const localY = canvasY - targetEntity.pos[1];

                for (const [key, reg] of Object.entries(targetEntity.layout.regions)) {
                    if (reg.type === "colorKeyEdit" && targetEntity.layout.hitTest([localX, localY], reg)) {
                        // THE PREVIEW DROP ENABLE: Prioritize the region's isolated theme/key if provided
                        const tTheme = reg.themeToEdit || targetEntity.themeToEdit;
                        const tKey = reg._selectedKeyName || targetEntity._selectedKeyName;

                        const tSfx = reg.colorSuffix || "";
                        const tON = tSfx ? `${tSfx}_ON` : "_ON";
                        const tOFF = tSfx ? `${tSfx}_OFF` : "_OFF";
                        const tDIS = tSfx ? `${tSfx}_DIS` : "_DIS";
                        const tlMap = targetEntity.layoutMap || {};
                        const tGap = tlMap.sH || 2;
                        const tSW = (reg.w - (tGap * 2)) / 3;

                        const txON  = reg.x;
                        const txOFF = txON + tSW + tGap;
                        const txDIS = txOFF + tSW + tGap;

                        const isHitSeg = (bx) => (localX >= bx && localX <= bx + tSW && localY >= reg.y && localY <= reg.y + reg.h);

                        let dropSuffix = null;
                        if (isHitSeg(txON)) dropSuffix = tON;
                        else if (isHitSeg(txOFF)) dropSuffix = tOFF;
                        else if (isHitSeg(txDIS)) dropSuffix = tDIS;

                        if (dropSuffix && tTheme[tKey]) {
                            const targetData = tTheme[tKey];
                            const isSwap = e && e.shiftKey;

                            // THE SWAP PROTOCOL: Capture target color to restore to source if Shift is held
                            const getNested = (data, suffix) => {
                                if (suffix.includes("_")) {
                                    const parts = suffix.split("_");
                                    const b = parts[0], s = "_" + parts[1];
                                    if (b && data[b] && typeof data[b] === 'object' && !Array.isArray(data[b])) return data[b][s];
                                    if (!b && data.main && typeof data.main === 'object' && !Array.isArray(data.main)) return data.main[s];
                                }
                                return data[suffix];
                            };
                            const oldTargetColor = isSwap ? getNested(targetData, dropSuffix) : null;

                            let dropAssigned = false;
                            if (dropSuffix.includes("_")) {
                                const parts = dropSuffix.split("_");
                                const b = parts[0], s = "_" + parts[1];
                                if (b && targetData[b] && typeof targetData[b] === 'object' && !Array.isArray(targetData[b])) {
                                    targetData[b][s] = [...dragColor];
                                    dropAssigned = true;
                                } else if (!b && targetData.main && typeof targetData.main === 'object' && !Array.isArray(targetData.main)) {
                                    targetData.main[suffix] = [...dragColor];
                                    dropAssigned = true;
                                }
                            }
                            if (!dropAssigned) targetData[dropSuffix] = [...dragColor];

                            if (isSwap && oldTargetColor) {
                                const sNodeId = window._derpColorDrag.sourceNodeId;
                                const sSuffix = window._derpColorDrag.sourceSuffix;
                                const sEnt = entities.find(ent => ent.id === sNodeId);
                                if (sEnt && sEnt.themeToEdit && sEnt._selectedKeyName) {
                                    const sData = sEnt.themeToEdit[sEnt._selectedKeyName];
                                    if (sData) {
                                        let sourceAssigned = false;
                                        if (sSuffix.includes("_")) {
                                            const parts = sSuffix.split("_");
                                            const b = parts[0], s = "_" + parts[1];
                                            if (b && sData[b] && typeof sData[b] === 'object' && !Array.isArray(sData[b])) {
                                                sData[b][s] = [...oldTargetColor];
                                                sourceAssigned = true;
                                            } else if (!b && sData.main && typeof sData.main === 'object' && !Array.isArray(sData.main)) {
                                                sData.main[s] = [...oldTargetColor];
                                                sourceAssigned = true;
                                            }
                                        }
                                        if (!sourceAssigned) sData[sSuffix] = [...oldTargetColor];

                                        if (sEnt.properties?.pushChanges) {
                                            const cfg = window.xcpDerpThemeConfig;
                                            if (cfg && sEnt._selectedThemeName && cfg.themes[sEnt._selectedThemeName]) {
                                                const clean = JSON.parse(JSON.stringify(sData));
                                                Object.keys(clean).forEach(k => { if (k.includes("_lock")) delete clean[k]; });
                                                cfg.themes[sEnt._selectedThemeName][sEnt._selectedKeyName] = clean;
                                                app.graph._nodes.forEach(n => { if (n?.onThemeUpdate) n.onThemeUpdate(cfg); });
                                            }
                                        }
                                        if (sEnt.requestDerpSync) sEnt.requestDerpSync();
                                    }
                                }
                            }

                            // THE BROADCAST GUARD: Only sync with the global theme config if we are NOT editing a preview
                            if (targetEntity.properties?.pushChanges && !reg.themeToEdit) {
                                const cfg = window.xcpDerpThemeConfig;
                                if (cfg && targetEntity._selectedThemeName && cfg.themes[targetEntity._selectedThemeName]) {
                                    const cleanData = JSON.parse(JSON.stringify(targetData));
                                    Object.keys(cleanData).forEach(k => { if (k.includes("_lock")) delete cleanData[k]; });
                                    cfg.themes[targetEntity._selectedThemeName][targetEntity._selectedKeyName] = cleanData;
                                    app.graph._nodes.forEach(n => { if (n?.onThemeUpdate) n.onThemeUpdate(cfg); });
                                }
                            }
                            if (targetEntity.requestDerpSync) targetEntity.requestDerpSync();
                        }
                        break;
                    }
                }
            }
            node.setDirtyCanvas(true, true);
        };
    }

    if (window._derpColorDrag && window._derpColorDrag.active && window._derpColorDrag.sourceNodeId === node.id && config.key === window._derpColorDrag.sourceRegionKey) {
        // THE GHOST DELAY: Only show the dragging color once the hold duration exceeds the threshold
        if (Date.now() - (window._derpColorDrag.startTime || 0) < 150) return;

        const ds = canvas.ds;
        const mouseLocalX = (_screenMouseX - canvas.canvas.getBoundingClientRect().left) / ds.scale - ds.offset[0] - node.pos[0];
        const mouseLocalY = (_screenMouseY - canvas.canvas.getBoundingClientRect().top) / ds.scale - ds.offset[1] - node.pos[1];

        ctx.save();
        ctx.globalAlpha = 0.9;
        const c = window._derpColorDrag.color;
        const cStr = `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`;

        // THE SHAPE & STROKE FIX: Use the calculated sW and height, scaled to 80%.
        // Convert the currentStrokeColor array into a CSS string to prevent canvas context errors.
        const dragW = sW * 0.8;
        const dragH = height * 0.8;
        const pulse = currentStrokeColor || [255, 255, 255, 1];
        const strokeStr = `rgba(${pulse[0]},${pulse[1]},${pulse[2]},${pulse[3]})`;

        masterPainter(ctx, {
            posX: mouseLocalX - (dragW / 2), posY: mouseLocalY - (dragH / 2), width: dragW, height: dragH,
            color: cStr, paintData: { corners: 2, strokeSize: 2, strokeColor: strokeStr, shadowSize: 4, shadowColor: "rgba(0,0,0,0.5)" }
        });
        ctx.restore();
    }
}
