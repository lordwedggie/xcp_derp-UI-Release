/**
 * Path: ./js/fatha/bastas/bastaSystemMessage.js
 */
import { app } from "../../../../scripts/app.js";
import { activeBastas } from "../basta.js";
import { handleThemeUpdate } from "../core/fathaHandler.js";
import { measureTextWidth, resolvePaintData } from "../../herbina/utils/widgetsUtils.js";
import { applyHTMLTheme } from "../../herbina/masterPainterHTML.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import { lerpTo, animateAlpha } from "../../herbina/masterAnimator.js";

const SYSTEM_MESSAGE_THEME_NAME = "_System/_bastaSystemMessage";
const SYSTEM_MESSAGE_ENTRY_OFFSET_Y = 90;
const SYSTEM_MESSAGE_TARGET_OFFSET_X = 10;
const SYSTEM_MESSAGE_TARGET_OFFSET_Y = 90;
const SYSTEM_MESSAGE_STACK_GAP = 12;
export const SYSTEM_MESSAGE_STAGGER_DELAY_MS = 1000;
const SYSTEM_MESSAGE_HOLD_MS = 5000;
const SYSTEM_MESSAGE_POSITION_LERP = 0.5;
const SYSTEM_MESSAGE_FADE_SPEED = 0.07;

const activeSystemMessages = [];
const queuedSystemMessages = [];
const systemMessageThemeHost = {
    properties: { selectedThemeName: SYSTEM_MESSAGE_THEME_NAME },
    setDirtyCanvas() {},
};
const systemMessageMeasureCache = new Map();
const SYSTEM_MESSAGE_MEASURE_CACHE_LIMIT = 128;
let systemMessageViewportRect = null;
let systemMessageViewportRectStamp = 0;
let systemMessageSlotsDirty = false;

let systemMessageThemeReady = false;
let systemMessageThemePromise = null;
let systemMessageThemeData = null;
let systemMessageDispatchTimer = null;
let systemMessageNextDispatchAt = 0;

function getSystemMessageVars(fallbackHost = null) {
    const layout = systemMessageThemeData?._layout;
    if (Array.isArray(layout)) {
        return {
            pW: Number(layout[6] ?? 2),
            pH: Number(layout[7] ?? 2),
        };
    }

    if (fallbackHost?.getDerpVars) {
        return fallbackHost.getDerpVars(fallbackHost);
    }

    return { pW: 2, pH: 2 };
}

function getSystemMessagePaints(themeNode) {
    return {
        bodyPaint: resolvePaintData(themeNode, "canvas", "_OFF") || themeNode._canvasPaintData || themeNode._panelPaintData_OFF || { fill: "rgba(20,20,20,0.92)", corners: [8, 8, 8, 8] },
        labelPaint: resolvePaintData(themeNode, "t_textNormal", "_OFF") || themeNode._t_textnormalPaintData || themeNode._t_textNormalPaintData || { textColor: "rgba(255,255,255,1)", font: "Arial", fontSize: 12 },
        accentPaint: resolvePaintData(themeNode, "t_textAccent", "_OFF") || resolvePaintData(themeNode, "t_textAccent") || null,
    };
}

function getSystemMessageDimensions(themeNode, text, accentText, fixedW, pW, pH) {
    const { bodyPaint, labelPaint, accentPaint } = getSystemMessagePaints(themeNode);
    const fontData = labelPaint || { fontSize: 12, font: "Arial" };
    const fontSize = parseFloat(fontData.fontSize) || 12;
    const fontName = (fontData.font || "Arial").replace(/[0-9]+px/ig, "").trim() || "Arial";
    const fontWeight = fontData.fontWeight || "normal";
    const accentFontName = (accentPaint?.font || labelPaint.font || fontName || "Arial").replace(/[0-9]+px/ig, "").trim() || "Arial";
    const accentFontSize = parseFloat(accentPaint?.fontSize) || fontSize;
    const accentFontWeight = accentPaint?.fontWeight || fontWeight;
    const cacheKey = [fixedW || 0, pW, pH, fontSize, fontName, fontWeight, accentFontSize, accentFontName, accentFontWeight, String(text || ""), String(accentText || "")].join("|");

    const cached = systemMessageMeasureCache.get(cacheKey);
    if (cached) return { ...cached, bodyPaint, labelPaint, accentPaint };

    const width = fixedW > 0
        ? fixedW
        : Math.ceil(
            measureTextWidth(String(text || ""), fontSize, fontName, fontWeight)
            + measureTextWidth(String(accentText || ""), accentFontSize, accentFontName, accentFontWeight)
        ) + (pW * 2) + 10;
    const height = Math.max(fontSize, accentFontSize) + (pH * 2) + 8;

    systemMessageMeasureCache.set(cacheKey, { width, height, fontSize, fontName, fontWeight, accentFontName, accentFontSize, accentFontWeight });
    if (systemMessageMeasureCache.size > SYSTEM_MESSAGE_MEASURE_CACHE_LIMIT) {
        const firstKey = systemMessageMeasureCache.keys().next().value;
        if (firstKey !== undefined) systemMessageMeasureCache.delete(firstKey);
    }

    return { width, height, fontSize, fontName, fontWeight, accentFontName, accentFontSize, accentFontWeight, bodyPaint, labelPaint, accentPaint };
}

function applySystemMessageThemeToRecord(record, themeNode) {
    if (!record || !themeNode || !record.el || !record.bgEl || !record.label) return;

    const dims = getSystemMessageDimensions(themeNode, record.text, record.accentText, record.fixedW, record.pW, record.pH);
    const { bodyPaint, labelPaint, accentPaint, fontName, fontSize, fontWeight, accentFontName, accentFontSize, accentFontWeight } = dims;

    record.fontName = fontName;
    record.fontSize = fontSize;
    record.fontWeight = fontWeight;
    record.width = dims.width;
    record.height = dims.height;

    record.el.style.width = `${record.width}px`;
    record.el.style.height = `${record.height}px`;
    record.el.style.minHeight = `${record.height}px`;
    record.bgEl.style.width = `${record.width}px`;
    record.bgEl.style.height = `${record.height}px`;
    record.bgEl.style.minHeight = `${record.height}px`;

    applyHTMLTheme(record.bgEl, {
        ...bodyPaint,
        fill: bodyPaint.fill || "rgba(20,20,20,0.92)",
        font: labelPaint.font || fontName,
        fontSize,
        textColor: labelPaint.textColor || labelPaint.fill || "rgba(255,255,255,1)",
    }, 1);
    record.bgEl.style.setProperty("background", bodyPaint.fill || "rgba(20,20,20,0.92)", "important");
    record.bgEl.style.setProperty("background-color", bodyPaint.fill || "rgba(20,20,20,0.92)", "important");

    record.label.style.padding = `${record.pH}px ${record.pW}px`;
    record.label.style.setProperty("font-family", labelPaint.font || fontName, "important");
    record.label.style.setProperty("font-size", `${fontSize}px`, "important");
    record.label.style.setProperty("font-weight", record.fontWeight || "normal", "important");
    record.label.style.setProperty("color", labelPaint.textColor || labelPaint.fill || "rgba(255,255,255,1)", "important");
    record.label.style.height = `${record.height}px`;

    if (record.accentEl) {
        record.accentEl.style.setProperty("font-family", accentPaint?.font || accentFontName, "important");
        record.accentEl.style.setProperty("font-size", `${accentFontSize}px`, "important");
        record.accentEl.style.setProperty("font-weight", accentFontWeight, "important");
        record.accentEl.style.setProperty("color", accentPaint?.textColor || accentPaint?.fill || labelPaint.textColor || labelPaint.fill || "rgba(255,255,255,1)", "important");
    }

}

function ensureSystemMessageThemeLoaded(forceRefresh = false) {
    if (!forceRefresh && systemMessageThemeReady) return Promise.resolve(systemMessageThemeHost);
    if (!forceRefresh && systemMessageThemePromise) return systemMessageThemePromise;

    systemMessageThemePromise = fetch(`/xcp/load/themes?name=${encodeURIComponent(SYSTEM_MESSAGE_THEME_NAME)}&t=${Date.now()}`, {
        cache: "no-store"
    })
        .then((res) => {
            if (!res.ok) throw new Error(`Theme load failed: ${res.status}`);
            return res.json();
        })
        .then((payload) => {
            const themeData = payload?.data;
            if (!themeData || typeof themeData !== "object") throw new Error("Theme data missing");
            systemMessageThemeData = themeData;
            handleThemeUpdate(systemMessageThemeHost, {
                themes: { [SYSTEM_MESSAGE_THEME_NAME]: themeData },
                activeTheme: SYSTEM_MESSAGE_THEME_NAME,
            });
            systemMessageThemeReady = true;
            activeSystemMessages.forEach((record) => applySystemMessageThemeToRecord(record, systemMessageThemeHost));
            updateSystemMessageSlots();
            return systemMessageThemeHost;
        })
        .catch(() => systemMessageThemeHost)
        .finally(() => {
            systemMessageThemePromise = null;
        });

    return systemMessageThemePromise;
}

ensureSystemMessageThemeLoaded();

function getViewportRect() {
    const now = performance.now();
    if (systemMessageViewportRect && (now - systemMessageViewportRectStamp) < 100) return systemMessageViewportRect;

    const canvas = app?.canvas?.canvas;
    systemMessageViewportRect = canvas ? canvas.getBoundingClientRect() : null;
    systemMessageViewportRectStamp = now;
    return systemMessageViewportRect;
}

function invalidateViewportRect() {
    systemMessageViewportRect = null;
    systemMessageViewportRectStamp = 0;
}

window.addEventListener("resize", invalidateViewportRect, { passive: true });
window.addEventListener("scroll", invalidateViewportRect, { passive: true, capture: true });

function getSystemMessagePositions(width, height) {
    const rect = getViewportRect();
    if (!rect) return null;
    return {
        startLeft: rect.left - width - 1,
        startTop: rect.top + SYSTEM_MESSAGE_ENTRY_OFFSET_Y,
        targetLeft: rect.left + SYSTEM_MESSAGE_TARGET_OFFSET_X,
        targetTop: rect.top + SYSTEM_MESSAGE_TARGET_OFFSET_Y,
    };
}

function buildSystemMessageId(host, targetRegion = null) {
    return `basta_sys_msg_${host.id}_${targetRegion || "node"}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function updateSystemMessageSlots() {
    let nextTop = null;
    let topRecordAssigned = false;
    for (const record of activeSystemMessages) {
        if (!record || record.isRemoved) continue;
        if (nextTop === null) {
            nextTop = record.baseTargetTop;
        }
        record.targetTop = nextTop;
        if (!topRecordAssigned) {
            if (record.holdStartAt === null || record.holdStartAt === undefined) {
                record.holdStartAt = performance.now();
            }
            topRecordAssigned = true;
        }
        nextTop += record.height + SYSTEM_MESSAGE_STACK_GAP;
    }
    systemMessageSlotsDirty = false;
}

function markSystemMessageSlotsDirty() {
    systemMessageSlotsDirty = true;
}

function syncSystemMessageSlots() {
    if (!systemMessageSlotsDirty) return;
    updateSystemMessageSlots();
}

function removeSystemMessageRecord(record) {
    if (!record || record.isRemoved) return;
    record.isRemoved = true;
    const idx = activeSystemMessages.indexOf(record);
    if (idx >= 0) activeSystemMessages.splice(idx, 1);
    markSystemMessageSlotsDirty();
    syncSystemMessageSlots();
}

function setStyleIfChanged(el, prop, value) {
    if (!el || el.style[prop] === value) return;
    el.style[prop] = value;
}

function spawnBastaSystemMessage(host, text, duration = 3000, animations = {}, targetRegion = null, mode = "info", playSound = null, accentText = "") {
    if (!systemMessageThemeReady) {
        ensureSystemMessageThemeLoaded().then(() => {
            spawnBastaSystemMessage(host, text, duration, animations, targetRegion, mode, playSound, accentText);
        });
        return null;
    }

    const id = buildSystemMessageId(host, targetRegion);
    const themeNode = systemMessageThemeHost;

    const vars = getSystemMessageVars(host);
    const pW = Number(vars.pW || 6);
    const pH = Number(vars.pH || 4);
    const fixedW = Number(animations?.width || 0);

    const dims = getSystemMessageDimensions(themeNode, text, accentText, fixedW, pW, pH);
    const { bodyPaint, labelPaint, accentPaint, fontSize, fontName, fontWeight, accentFontName, accentFontSize, accentFontWeight, width, height } = dims;

    const positions = getSystemMessagePositions(width, height);
    if (!positions) return null;
    const holdMs = SYSTEM_MESSAGE_HOLD_MS;

    const globalPlaySound = window.DERP_GLOBAL_SETTINGS?.playSound !== false;
    if (globalPlaySound) {
        const soundKey = playSound === false ? null : (playSound || mode);
        if (SOUND_INDEX[soundKey]) SOUND_INDEX[soundKey]();
    }

    const el = document.createElement("div");
    const bgEl = document.createElement("div");
    const label = document.createElement("div");
    const prefixEl = document.createElement("span");
    const accentEl = document.createElement("span");
    prefixEl.innerText = String(text || "");
    accentEl.innerText = String(accentText || "");
    label.appendChild(prefixEl);
    if (accentText) label.appendChild(accentEl);
    bgEl.appendChild(label);
    el.appendChild(bgEl);
    el.className = "derp-system-message";
    el.style.position = "fixed";
    el.style.left = `${positions.startLeft}px`;
    el.style.top = `${positions.startTop}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.minHeight = `${height}px`;
    el.style.boxSizing = "border-box";
    el.style.pointerEvents = "auto";
    el.style.zIndex = "10020";
    el.style.display = "block";
    el.style.overflow = "visible";
    el.style.opacity = "1";
    el.style.willChange = "transform, opacity";
    el.style.cursor = "pointer";
    el.style.background = "transparent";
    el.style.border = "none";
    el.style.padding = "0";

    bgEl.style.position = "absolute";
    bgEl.style.left = "0";
    bgEl.style.top = "0";
    bgEl.style.width = `${width}px`;
    bgEl.style.height = `${height}px`;
    bgEl.style.minHeight = `${height}px`;
    bgEl.style.display = "block";
    bgEl.style.boxSizing = "border-box";
    bgEl.style.pointerEvents = "none";

    applyHTMLTheme(bgEl, {
        ...bodyPaint,
        fill: bodyPaint.fill || "rgba(20,20,20,0.92)",
        font: labelPaint.font || fontName,
        fontSize,
        textColor: labelPaint.textColor || labelPaint.fill || "rgba(255,255,255,1)",
    }, 1);
    bgEl.style.setProperty("background", bodyPaint.fill || "rgba(20,20,20,0.92)", "important");
    bgEl.style.setProperty("background-color", bodyPaint.fill || "rgba(20,20,20,0.92)", "important");

    label.style.width = "100%";
    label.style.height = `${height}px`;
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.justifyContent = "center";
    label.style.gap = "0";
    label.style.boxSizing = "border-box";
    label.style.position = "relative";
    label.style.zIndex = "1";
    label.style.padding = `${pH}px ${pW}px`;
    label.style.setProperty("font-family", labelPaint.font || fontName, "important");
    label.style.setProperty("font-size", `${fontSize}px`, "important");
    label.style.setProperty("font-weight", fontWeight, "important");
    label.style.setProperty("color", labelPaint.textColor || labelPaint.fill || "rgba(255,255,255,1)", "important");
    label.style.textAlign = "center";
    label.style.lineHeight = "1";
    label.style.textShadow = "none";
    label.style.background = "transparent";

    prefixEl.style.whiteSpace = "pre";
    accentEl.style.whiteSpace = "pre";
    accentEl.style.background = "transparent";

    const record = {
        id,
        alpha: 1,
        isClosing: false,
        isRemoved: false,
        text: String(text || ""),
        accentText: String(accentText || ""),
        fixedW,
        pW,
        pH,
        fontName,
        fontSize,
        fontWeight,
        width,
        height,
        baseTargetTop: positions.targetTop,
        targetTop: positions.targetTop,
        currentLeft: positions.startLeft,
        currentTop: positions.targetTop,
        createdAt: performance.now(),
        holdStartAt: null,
        el,
        bgEl,
        label,
        prefixEl,
        accentEl,
        update: () => {
            const nextPositions = getSystemMessagePositions(record.width, record.height);
            if (!nextPositions) return false;
            record.baseTargetTop = nextPositions.targetTop;

            if (!record.isClosing && record.holdStartAt !== null && (performance.now() - record.holdStartAt) >= holdMs) {
                record.close();
            }

            const leftAnim = lerpTo(record.currentLeft, nextPositions.targetLeft, SYSTEM_MESSAGE_POSITION_LERP, true);
            const topAnim = lerpTo(record.currentTop, record.targetTop, SYSTEM_MESSAGE_POSITION_LERP, true);
            record.currentLeft = leftAnim.value;
            record.currentTop = topAnim.value;
            setStyleIfChanged(el, "left", `${record.currentLeft}px`);
            setStyleIfChanged(el, "top", `${record.currentTop}px`);

            let alphaAnimating = false;
            if (record.isClosing) {
                const alphaAnim = animateAlpha(record.alpha, 0, SYSTEM_MESSAGE_FADE_SPEED, true);
                record.alpha = alphaAnim.value;
                alphaAnimating = alphaAnim.isAnimating;
                setStyleIfChanged(el, "opacity", `${record.alpha}`);
                if (!alphaAnimating && record.alpha <= 0.01) {
                    removeSystemMessageRecord(record);
                    el.remove();
                    activeBastas.delete(id);
                    return false;
                }
            }

            return leftAnim.isAnimating || topAnim.isAnimating || alphaAnimating || !record.isClosing;
        },
        draw: () => {},
        close: () => {
            if (record.isClosing) return;
            record.isClosing = true;
            if (animations?.fade === false) {
                record.alpha = 0;
                removeSystemMessageRecord(record);
                el.remove();
                activeBastas.delete(id);
            }
        }
    };

    el.onclick = () => record.close();
    document.body.appendChild(el);
    activeSystemMessages.push(record);
    applySystemMessageThemeToRecord(record, themeNode);
    markSystemMessageSlotsDirty();
    updateSystemMessageSlots();
    record.currentTop = record.targetTop;
    setStyleIfChanged(el, "top", `${record.currentTop}px`);
    activeBastas.set(id, record);

    return record;
}

function scheduleQueuedSystemMessageDispatch() {
    if (systemMessageDispatchTimer || queuedSystemMessages.length === 0) return;
    const delay = Math.max(0, systemMessageNextDispatchAt - Date.now());
    systemMessageDispatchTimer = setTimeout(() => {
        systemMessageDispatchTimer = null;
        const nextMessage = queuedSystemMessages.shift();
        if (nextMessage) {
            spawnBastaSystemMessage(...nextMessage);
            systemMessageNextDispatchAt = Date.now() + SYSTEM_MESSAGE_STAGGER_DELAY_MS;
        }
        scheduleQueuedSystemMessageDispatch();
    }, delay);
}

export function showBastaSystemMessage(host, text, duration = 3000, animations = {}, targetRegion = null, mode = "info", playSound = null, accentText = "") {
    queuedSystemMessages.push([host, text, duration, animations, targetRegion, mode, playSound, accentText]);
    if (systemMessageNextDispatchAt <= Date.now()) {
        systemMessageNextDispatchAt = Date.now();
    }
    scheduleQueuedSystemMessageDispatch();
    return null;
}
