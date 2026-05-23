/**
 * Path: ./js/fatha/bastas/bastaMessage.js
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { measureTextWidth } from "../../herbina/utils/widgetsUtils.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";

export function getBastaMessageId(host, targetRegion = null) {
    return `basta_msg_${host.id}_${targetRegion || 'node'}`;
}

export function closeBastaMessage(host, targetRegion = null, reason = "implicit") {
    const id = getBastaMessageId(host, targetRegion);
    const basta = activeBastas.get(id);
    if (!basta) return false;
    return basta.close(reason);
}

export function showBastaMessage(host, text, duration = 3000, animations = {}, targetRegion = null, drawHeader = false, mode = "info", playSound = null) {
    const id = getBastaMessageId(host, targetRegion);
    if (activeBastas.has(id)) return null;

    const vars = host.getDerpVars ? host.getDerpVars(host) : { mW: 4, mH: 2, sW: 2, sH: 2, pW: 2, pH: 4, playSound: true };
    const { mW, mH, pH } = vars;

    const globalPlaySound = window.DERP_GLOBAL_SETTINGS?.playSound !== false;
    if (globalPlaySound) {
        const soundKey = playSound || mode; // Fallback to mode if no specific sound is provided
        if (SOUND_INDEX[soundKey]) {
            SOUND_INDEX[soundKey]();
        }
    }

    const hasFixedW = animations && animations.width;
    const fontData = host._t_textnormalPaintData || host._t_textNormalPaintData || { fontSize: 12 };
    const fontSize = parseFloat(fontData.fontSize) || 12;
    const BASTA_HEADER_H = 20;

    let initialW = 50;
    if (hasFixedW) {
        initialW = animations.width;
    } else {
        const fontName = (fontData.font || "arial").replace(/[0-9]+px/ig, "").trim();
        const fontWeight = fontData.fontWeight || "normal";
        initialW = Math.ceil(measureTextWidth(text, fontSize, fontName, fontWeight)) + 10;
    }

    const initialH = fontSize + (pH * 2) + (drawHeader ? BASTA_HEADER_H : 0) + (mH * 2);

    const config = {
        host: host,
        targetRegion: targetRegion,
        animations: animations,
        initialSize: [initialW, initialH],
        properties: {
            clickToClose: true,
            autoWidth: !hasFixedW,
            autoHeight: true,
            snapHeight: false,
            drawHeader: drawHeader
        },
        layoutMap: {
            contentRegion: {
                anchor: drawHeader ? { target: "headerRegion", axis: "y", offset: 0 } : null,
                dir: "col",
                width: hasFixedW ? "full" : "auto",
                height: "auto",
                margin: [0, mH],
                objectAlign: ["center", "top"],
                lblMessage: {
                    type: UI_TYPES.TEXT,
                    themeKey: "t_textnormal",
                    text: text,
                    width: hasFixedW ? "full" : "auto",
                    height: "auto",
                    labelAlign: ["center", "middle"],
                    padding: [0, pH]
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
