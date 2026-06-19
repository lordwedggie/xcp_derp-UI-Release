/**
 * FIND BLOCK:
 * Path: ./js/fatha/bastas/bastaMessage.js
 * Replace the entire file with this rewritten version.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { measureTextWidth } from "../../herbina/utils/widgetsUtils.js";
import { playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";

export function showBastaMessage(host, text, duration = 3000, animations = {}, targetRegion = null, drawHeader = false, mode = "info") {
    const id = `basta_msg_${host.id}_${targetRegion || 'node'}`;
    if (activeBastas.has(id)) return null;

    const vars = host.getDerpVars ? host.getDerpVars(host) : { mW: 4, mH: 2, sW: 2, sH: 2, pW: 2, pH: 4, playSound: true };
    const { mW, mH, pW, pH, sW, sH } = vars;

    if (vars.playSound !== false) {
        if (mode === "success") playKaChing();
        else if (mode === "error") playKaboom();
    }

    const fontData = host._t_textnormalPaintData || host._t_textNormalPaintData || { fontSize: 12, font: "Arial" };
    const fontSize = parseInt(fontData.fontSize) || 12;
    const fontName = (fontData.font || "Arial").replace(/[0-9]+px/ig, "").trim();
    const fontWeight = fontData.fontWeight || "normal";

    const hasFixedW = animations && animations.width;
    let initialW = 50;

    if (hasFixedW) {
        initialW = animations.width;
    } else {
        const measuredW = Math.ceil(measureTextWidth(text, fontSize, fontName, fontWeight));
        initialW = measuredW + (pW * 4) + 16;
    }

    const BASTA_HEADER_H = 20;
    const lineH = fontSize + (pH * 2);
    const initialH = lineH + (drawHeader ? BASTA_HEADER_H : 0) + (mH * 2);

    const config = {
        host: host,
        targetRegion: targetRegion,
        animations: animations,
        initialSize: [initialW, initialH],
        getDerpVars: (node) => ({ ...vars, mW: 0, mH: 0 }),
        properties: {
            clickToClose: true,
            autoWidth: false,
            autoHeight: true,
            snapHeight: false,
            drawHeader: drawHeader
        },
        layoutMap: {
            contentRegion: {
                anchor: drawHeader ? { target: "headerRegion", axis: "y", offset: 0 } : null,
                dir: "col",
                width: "full",
                height: "auto",
                margin: [0, 0],
                objectAlign: ["center", "middle"],
                lblMessage: {
                    type: UI_TYPES.TEXT,
                    themeKey: "t_textnormal",
                    text: text,
                    width: "full",
                    height: "auto",
                    labelAlign: ["center", "middle"],
                    padding: [pW * 2, pH]
                }
            }
        }
    };

    const basta = spawnBasta(id, config);
    if (duration > 0) {
        setTimeout(() => { if (basta && !basta.isClosing) basta.close(); }, duration);
    }
    return basta;
}