/**
 * Path: ./js/fatha/legacy/uncleSlotHelper.js
 * ROLE: Specialized assistant for the Uncle Hybrid framework.
 * PURPOSE: Manages the suppression of default LiteGraph UI elements
 * while maintaining logical slot integrity.
 */
import { lerpTo, animateAlpha, parseColor } from "../../herbina/masterAnimator.js";

const UNCLE_SLOT_FADE_IN_SPEED = 0.30;
const UNCLE_SLOT_FADE_OUT_SPEED = 0.40;
const manualOffsetInput = 0;
const manualOffsetOutput = -2;

/**
 * lerpUnclePadding: Smoothly transitions the padding values used for the Squeeze.
 * @param {Object} node - The Uncle node.
 * @param {number} targetL - The target left padding.
 * @param {number} targetR - The target right padding.
 * @param {boolean} useAnim - Toggle to skip animation logic
 */
export function lerpUnclePadding(node, targetL, targetR, useAnim) {
    if (!useAnim) {
        node._padL = targetL;
        node._padR = targetR;
        node._alphaIn = targetL > 0 ? 1 : 0;
        node._alphaOut = targetR > 0 ? 1 : 0;
        return;
    }

    // THE SPEED SEPARATION: Determine speed based on whether we are moving to an active (target > 0) or inactive state
    const speedL = targetL > 0 ? UNCLE_SLOT_FADE_IN_SPEED : UNCLE_SLOT_FADE_OUT_SPEED;
    const speedR = targetR > 0 ? UNCLE_SLOT_FADE_IN_SPEED : UNCLE_SLOT_FADE_OUT_SPEED;

    const resL = lerpTo(node._padL || 0, targetL, speedL, true);
    const resR = lerpTo(node._padR || 0, targetR, speedR, true);

    const targetAlphaIn = targetL > 0 ? 1 : 0;
    const targetAlphaOut = targetR > 0 ? 1 : 0;

    const alphaInRes = animateAlpha(node._alphaIn || 0, targetAlphaIn, speedL, true);
    const alphaOutRes = animateAlpha(node._alphaOut || 0, targetAlphaOut, speedR, true);

    node._padL = resL.value;
    node._padR = resR.value;
    node._alphaIn = alphaInRes.value;
    node._alphaOut = alphaOutRes.value;

    if (resL.isAnimating || resR.isAnimating || alphaInRes.isAnimating || alphaOutRes.isAnimating) {
        node._derpAwakeFrames = 5;
        node._forceSync = true;
    }
}

/**
 * suppressDefaultWidgets: Forces native ComfyUI widgets to the shadow realm.
 * This ensures they don't draw over the Fatha Layout Engine regions.
 * @param {Object} node - The Uncle node instance.
 */
export function suppressDefaultWidgets(node) {
    if (!node.widgets) return;
    const isSelected = node.selected || node._xcpTrueSelected || node._xcpTrueInMap;

    node.widgets.forEach(w => {
        w.last_y = -5000;

        if (w.element) {
            w.element.style.display = "none";
            w.element.style.pointerEvents = "none";
        }

        w.hidden = true;
    });
}

export function syncUncleSlots(node) {
    const inputs = node._xcpTrueInputs || node.inputs;
    const outputs = node._xcpTrueOutputs || node.outputs;
    if (!inputs && !outputs) return;

    const applyDerpColor = (slot, alpha = 1) => {
        if (!slot || !slot.type) return;
        let type = String(slot.type).toUpperCase();
        if (type.includes("EMPTY") && type.includes("LATENT")) type = "EMPTY_LATENT";
        else if (type.includes("LORA") && type.includes("STACK")) type = "LORA_STACK";
        else if (type.includes("LORA")) type = "LORA";
        else if (type === "*") type = "ANY";

        const rawColor = window.xcpDerpTypeColors?.[type] || "#ffffff";

        const nodeTheme = node.theme || {};
        const basePaint = nodeTheme[type] || nodeTheme[`t_${type.toLowerCase()}`] || { fill: rawColor };

        const applyAlpha = (colStr) => {
            if (!colStr) return null;
            const parsed = parseColor(colStr);
            if (!parsed) return colStr;
            const r = Math.round(parsed[0]);
            const g = Math.round(parsed[1]);
            const b = Math.round(parsed[2]);
            const a = parsed[3] !== undefined ? parsed[3] : 1;
            return `rgba(${r}, ${g}, ${b}, ${a * alpha})`;
        };

        const fillCol = applyAlpha(basePaint.fill || rawColor);

        slot.color = fillCol;
        slot.color_off = fillCol;
        slot.color_on = fillCol;

        const rawBorder = basePaint.border?.color || basePaint.stroke?.color || basePaint.fill || rawColor;
        slot.stroke_color = applyAlpha(rawBorder);
        slot.stroke_width = basePaint.border?.width || basePaint.stroke?.width || 1.0;

        if (basePaint.shadow) {
            slot.shadow = { ...basePaint.shadow, color: applyAlpha(basePaint.shadow.color || rawColor) };
        } else {
            slot.shadow = null;
        }

        if (basePaint.glow) {
            slot.glow = { ...basePaint.glow, color: applyAlpha(basePaint.glow.color || rawColor) };
        } else {
            slot.glow = null;
        }
    };

    const isCollapsed = node.properties.contentCollapsed;
    const regions = node.layout?.regions || {};
    const regionsArray = Object.values(regions);

    const padL = node._padL || 0;
    const padR = node._padR || 0;

    const inputX = padL > 0 ? (padL / 2) + manualOffsetInput : 0;
    const outputX = padR > 0 ? (node.size[0] - (padR / 2)) + manualOffsetOutput : node.size[0];

    if (outputs) {
        const bypass = regions.btnBypass;
        outputs.forEach((slot, i) => {
            if (isCollapsed && bypass) {
                slot.pos = [outputX, bypass.y + (bypass.h / 2)];
            } else {
                const targetRegion = regionsArray.find(r => r.outSlotIdx === i);
                if (targetRegion) {
                    slot.pos = [outputX, targetRegion.y + (targetRegion.h / 2)];
                } else {
                    slot.pos = [-1000, -1000];
                }
            }
            applyDerpColor(slot, node._alphaOut ?? 1);
        });
    }

    if (inputs) {
        const collapse = regions.btnCollapse;
        const validInputs = inputs.filter(inp => !inp.name.startsWith("_hidden_wire_"));
        validInputs.forEach((slot, i) => {
            if (isCollapsed && collapse) {
                slot.pos = [inputX, collapse.y + (collapse.h / 2)];
            } else {
                const targetRegion = regionsArray.find(r => r.inSlotIdx === i);
                if (targetRegion) {
                    slot.pos = [inputX, targetRegion.y + (targetRegion.h / 2)];
                } else {
                    slot.pos = [-1000, -1000];
                }
            }
            applyDerpColor(slot, node._alphaIn ?? 1);
        });
    }

    if (node.setDirtyCanvas) node.setDirtyCanvas(true);
}

/**
 * drawUncleSlots: Manually renders the slots onto the canvas, bypassing LiteGraph.
 * This ensures the framework can draw animated borders, shadows, and glows.
 */
export function drawUncleSlots(node, ctx) {
    const inputs = node._xcpTrueInputs || node.inputs;
    const outputs = node._xcpTrueOutputs || node.outputs;
    if (!inputs && !outputs) return;

    const isSelected = node._xcpTrueSelected || node._xcpTrueInMap;
    const regions = node.layout?.regions || {};

    const drawSlot = (slot, alpha) => {
        if (alpha <= 0.01 || !slot.pos) return;
        const [x, y] = slot.pos;
        if (x === -1000 || y === -1000) return; // THE ORPHAN GUARD: Ignore slots without layout regions

        ctx.save();
        ctx.beginPath();
        // THE RADIUS FIX: Reduced from 4 to 3 to precisely match ComfyUI native slot sizes
        ctx.arc(x, y, 3, 0, Math.PI * 2);

        // Apply visual effects (Canvas only supports one shadow effect at a time, glow takes priority)
        const fx = slot.glow || slot.shadow;
        if (fx) {
            ctx.shadowColor = fx.color || "transparent";
            ctx.shadowBlur = fx.blur || 0;
            ctx.shadowOffsetX = fx.offsetX || 0;
            ctx.shadowOffsetY = fx.offsetY || 0;
        }

        if (slot.color) {
            ctx.fillStyle = slot.color;
            ctx.fill();
        }

        if (slot.stroke_color) {
            ctx.strokeStyle = slot.stroke_color;
            ctx.lineWidth = slot.stroke_width || 1.0;
            ctx.stroke();
        }

        ctx.restore();
    };

    if (inputs) {
        const validIn = new Set(Object.values(regions).map(r => r.inSlotIdx).filter(v => v !== undefined));
        const canShowIn = (isSelected || (node._alphaIn > 0.01)) && node.properties.showInputs !== false;
        if (canShowIn) {
            inputs.forEach((inp, i) => {
                if (validIn.has(i) && !inp.name.startsWith("_hidden_wire_")) {
                    drawSlot(inp, node._alphaIn ?? 1);
                }
            });
        }
    }

    if (outputs) {
        const validOut = new Set(Object.values(regions).map(r => r.outSlotIdx).filter(v => v !== undefined));
        const canShowOut = (isSelected || (node._alphaOut > 0.01)) && node.properties.showOutputs !== false;
        if (canShowOut) {
            outputs.forEach((out, i) => {
                if (validOut.has(i)) {
                    drawSlot(out, node._alphaOut ?? 1);
                }
            });
        }
    }
}