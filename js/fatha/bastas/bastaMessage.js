/**
 * Path: ./js/fatha/bastas/bastaMessage.js
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { measureTextWidth, resolvePaintData, parseColorKeyText } from "../../herbina/utils/widgetsUtils.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";

export const TOOLTIP_EXPAND_START_WIDTH = 1;
export const TOOLTIP_EXPAND_ANIMATION_SPEED = 0.22;
export const TOOLTIP_EXPAND_Y_SHIFT_ROWS = 1;

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
    const { mW, mH, sH, pW, pH } = vars;

    const globalPlaySound = window.DERP_GLOBAL_SETTINGS?.playSound !== false;
    if (globalPlaySound) {
        const soundKey = playSound || mode; // Fallback to mode if no specific sound is provided
        if (SOUND_INDEX[soundKey]) {
            SOUND_INDEX[soundKey]();
        }
    }

    const hasFixedW = animations && animations.width;
    const isTooltipMessage = animations?.tooltipExpand === true;
    // Tooltip uses _toolTip palette with background rect and dedicated text key
    const textThemeKey = isTooltipMessage
        ? (animations?.textThemeKey || "background, t_toolTip_normal")
        : (animations?.textThemeKey || animations?.messageThemeKey || "t_textnormal");
    const backgroundThemeKey = isTooltipMessage
        ? "background"
        : (animations?.backgroundThemeKey || null);
    const fontData = resolvePaintData(host, textThemeKey, "_OFF")
        || host._t_textsystemPaintData_OFF
        || host._t_textSystemPaintData_OFF
        || host._t_textnormalPaintData
        || host._t_textNormalPaintData
        || { fontSize: 12 };
    const fontSize = parseFloat(fontData.fontSize) || 12;
    // Fallback text color when _toolTip palette isn't loaded yet
    const sysTextPaint = resolvePaintData(host, "t_textSystem", "_OFF")
        || host._t_textSystemPaintData_OFF
        || host._t_textsystemPaintData_OFF;
    const tooltipLabelFallback = sysTextPaint?.textColor || sysTextPaint?.fill || "rgba(180,180,180,0.6)";
    // Pre-parse tooltip text for color keys so the widget doesn't need to
    const tooltipParsed = isTooltipMessage ? parseColorKeyText(String(text || ""), host, "_OFF", tooltipLabelFallback) : null;
    const BASTA_HEADER_H = 20;

    let initialW = 50;
    if (hasFixedW) {
        initialW = animations.width;
    } else {
        const fontName = (fontData.font || "arial").replace(/[0-9]+px/ig, "").trim();
        const fontWeight = fontData.fontWeight || "normal";
        if (isTooltipMessage && tooltipParsed?.segments) {
            const displayText = tooltipParsed.segments.map(s => s.text).join("");
            initialW = Math.ceil(measureTextWidth(displayText, fontSize, fontName, fontWeight)) + (pW * 2) + 10;
        } else {
            initialW = Math.ceil(measureTextWidth(text, fontSize, fontName, fontWeight)) + (pW * 2) + 10;
        }
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
            drawHeader: drawHeader,
            tooltipText: text,
            messageThemeKey: textThemeKey,
            bastaBackgroundKey: backgroundThemeKey,
            tooltipExpand: isTooltipMessage,
            tooltipExpandAnimationSpeed: TOOLTIP_EXPAND_ANIMATION_SPEED,
            tooltipExpandPaddingX: pW,
            tooltipExpandTargetWidth: initialW
        },
        layoutMap: {
            contentRegion: {
                anchor: drawHeader ? { target: "headerRegion", axis: "y", offset: 0 } : null,
                dir: "col",
                width: isTooltipMessage ? "full" : (hasFixedW ? "full" : "auto"),
                height: "auto",
                margin: [0, mH],
                clipChildren: isTooltipMessage,
                objectAlign: ["center", "top"],
                lblMessage: {
                    type: isTooltipMessage ? UI_TYPES.BUTTON : UI_TYPES.TEXT,
                    themeKey: textThemeKey,
                    palette: isTooltipMessage ? { path: "_system/_toolTip.json" } : undefined,
                    text: text,
                    width: isTooltipMessage ? "full" : (hasFixedW ? "full" : "auto"),
                    height: "auto",
                    labelAlign: ["center", "middle"],
                    padding: [pW, pH],
                    displayMode: isTooltipMessage ? "cutoff" : undefined,
                    skipBackground: true,
                    noShrink: true,
                    mouseOver: false,
                    labelColor: isTooltipMessage ? tooltipLabelFallback : null
                }
            }
        }
    };

    const basta = spawnBasta(id, config);
    if (basta) {
        basta.properties = basta.properties || {};
        basta.properties.tooltipText = text;
        basta.properties.messageThemeKey = textThemeKey;
        if (backgroundThemeKey) basta.properties.bastaBackgroundKey = backgroundThemeKey;
        basta.offset[1] -= sH; // default gap above target region
        if (isTooltipMessage) basta.properties.palette = { path: "_system/_toolTip.json" };
        if (isTooltipMessage) {
            basta.properties.nodeSize = [initialW, initialH];
            basta.targetSize = [initialW, initialH];
            basta.size = [TOOLTIP_EXPAND_START_WIDTH, initialH];
            basta._tooltipExpandCurrentWidth = TOOLTIP_EXPAND_START_WIDTH;
            basta._tooltipExpandTargetWidth = initialW;
            basta._tooltipExpandPaddingX = pW;
            basta._tooltipExpandAnchorCenterX = basta.offset[0] + (initialW / 2);
            basta._tooltipExpandBaseOffsetY = basta.offset[1];
            basta.offset[0] = basta._tooltipExpandAnchorCenterX - (TOOLTIP_EXPAND_START_WIDTH / 2);
            basta.pos[0] = basta.hostNode.pos[0] + basta.offset[0];
            basta.pos[1] = basta.hostNode.pos[1] + basta.offset[1];
            basta._forceSync = true;
            basta._derpAwakeFrames = Math.max(basta._derpAwakeFrames || 0, 10);
        }
    }
    if (duration > 0) {
        setTimeout(() => { if (basta && !basta.isClosing) basta.close(); }, duration);
    }
    return basta;
}
