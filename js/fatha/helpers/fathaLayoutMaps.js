/**
 * Path: ./js/fatha/legacy/fathaLayoutMaps.js
 * STATUS: FIXED - NaN offset bug resolved, theme items injected.
 */
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { activeBastas } from "../basta.js";
import { showBastaSignalReceiver, getSignalReceiverId } from "../bastas/bastaSignalReceiver.js";
import { showBastaFileHandler, getHandlerId } from "../bastas/bastaFileHandler.js";
import { showBastaMessage } from "../bastas/bastaMessage.js";
import { playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";
import { resolvePaintData, measureTextWidth } from "../../herbina/utils/widgetsUtils.js";
import { isNodeDocked, undockNodeEdges, isLinearDeckGroup, getDeckMembers } from "../core/masterDockEngine.js";
import { clearBypassSignalDebouncers, transmitBypassedDerpSignals } from "../core/masterSignalEngine.js";
import { ensureNodeVisibleInViewport } from "../core/fathaWarp.js";
import { warpToPoint } from "../core/fathaWarp.js";
import { handleDerpCollapse, handleHorizontalDeckTitleToggle, isDerpDefaultLocalizedTitle, settleDerpSizeBeforeDraw } from "../core/fathaHandler.js";
import { findHeaderPaletteEntry } from "./headerPaletteIdentity.js";
import { showBastaSystemMessage } from "../bastas/bastaSystemMessage.js";
import { getDeckCornerOverride } from "../core/masterDockEngine.js";

const DEBUG_OPTIONS = ["None", "Layout", "Hitbox", "Widgets Hitbox"];
const TITLE_LABEL_DEFAULT = "$fatha_layout.title_default";
const DEFAULT_WARP_SHORTCUT_ZOOM = 1.5;
const WARP_SHORTCUT_TRAVEL_DURATION_MS = 600;
const WARP_SHORTCUT_ITEMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
// Collapsed nodes use a fixed compact header so theme margins do not skew top/bottom spacing.
const COLLAPSED_HEADER_HEIGHT = 20;
const COLLAPSED_HEADER_VERTICAL_MARGIN = 0;
const HEADER_ICON_SIZE = { width: "match", height: "auto" };
const HEADER_CORNER_MARGIN_THRESHOLD = 5;
const HEADER_CORNER_MARGIN_PER_POINT = 1;
const THEME_WEIGHT_PREFIX = "_WT_";
const THEME_WEIGHT_SYSTEM_DIR = "_System";
const THEME_WEIGHT_ROOT_VALUE = `${THEME_WEIGHT_SYSTEM_DIR}/`;
const THEME_WEIGHT_RESET_VALUE = "__theme_weight_reset__";
const THEME_WEIGHT_RESET_ITEM = {
    value: THEME_WEIGHT_RESET_VALUE,
    display: "Revert to Theme's weight",
    alwaysVisible: true,
    hidePrefix: true,
    disableSelectedStyle: true,
};

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

function paletteColorToCss(color) {
    if (!Array.isArray(color) || color.length < 3) return null;
    const r = Math.round(Number(color[0]) || 0);
    const g = Math.round(Number(color[1]) || 0);
    const b = Math.round(Number(color[2]) || 0);
    const a = color[3] === undefined ? 1 : Number(color[3]);
    return `rgba(${r}, ${g}, ${b}, ${Number.isFinite(a) ? a : 1})`;
}

function resolveHeaderPaletteFill(node) {
    const main = findHeaderPaletteEntry(window.xcpActivePalette?.palettes, node, false)?.entries?.main;
    return paletteColorToCss(main?._OFF || main?._ON || main?._DIS || null);
}

function resolveHeaderInsetLayoutState(node) {
    const graph = node?.graph || window.app?.graph || null;
    const cornerOverride = getDeckCornerOverride(node, graph);
    const isSelected = node?._xcpTrueSelected !== undefined
        ? node._xcpTrueSelected
        : !!(window.app?.canvas?.selected_nodes && window.app.canvas.selected_nodes[node.id]);
    const isBypassed = node?.mode === 4 || node?.mode === 2 || node?._derpSpoofedBypass;
    const stateSuffix = isBypassed ? "_DIS" : (isSelected ? "_ON" : "");

    return { cornerOverride, isSelected, stateSuffix };
}

function resolveHeaderSideInsetBoost(node) {
    const { cornerOverride, stateSuffix } = resolveHeaderInsetLayoutState(node);
    const canvasPaint = resolvePaintData(node, "canvas", stateSuffix)
        || (stateSuffix === "_ON" ? node?._canvasPaintData_ON : stateSuffix === "_DIS" ? node?._canvasPaintData_DIS : node?._canvasPaintData)
        || node?._canvasPaintData
        || null;
    const corners = Array.isArray(canvasPaint?.corners)
        ? [...canvasPaint.corners]
        : [canvasPaint?.corners, canvasPaint?.corners, canvasPaint?.corners, canvasPaint?.corners];

    if (cornerOverride) {
        for (let i = 0; i < 4; i++) {
            if (cornerOverride[i] !== null && cornerOverride[i] !== undefined) corners[i] = cornerOverride[i];
        }
    }

    const [topLeft = 0, topRight = 0] = corners;
    const calcBoost = (value) => {
        const absCorner = Math.abs(Number(value) || 0);
        return absCorner > HEADER_CORNER_MARGIN_THRESHOLD
            ? (absCorner - HEADER_CORNER_MARGIN_THRESHOLD) * HEADER_CORNER_MARGIN_PER_POINT
            : 0;
    };

    return {
        left: calcBoost(topLeft),
        right: calcBoost(topRight),
    };
}

function isThemeWeightFileName(name) {
    return String(name || "").replace(/\\/g, "/").split("/").pop().toLowerCase().startsWith(THEME_WEIGHT_PREFIX.toLowerCase());
}

function getThemeWeightItems(showResetItem = false) {
    const cachedItems = Array.isArray(window.xcpDerpThemeWeightItems) ? window.xcpDerpThemeWeightItems : [];
    if (!window.xcpDerpThemeWeightListPromise) {
        window.xcpDerpThemeWeightListPromise = fetch(`/xcp/list/themes?t=${Date.now()}`)
            .then((res) => res.ok ? res.json() : { items: [] })
            .then((data) => {
                const items = Array.isArray(data?.items) ? data.items : [];
                window.xcpDerpThemeWeightItems = items
                    .filter((item) => typeof item === "string" && item.replace(/\\/g, "/").toLowerCase().startsWith(`${THEME_WEIGHT_SYSTEM_DIR.toLowerCase()}/`))
                    .filter(isThemeWeightFileName)
                    .sort((a, b) => a.localeCompare(b))
                    .map((item) => ({ value: item, display: item.replace(/\\/g, "/").split("/").pop() }));
                return window.xcpDerpThemeWeightItems;
            })
            .catch((err) => {
                console.warn("[xcpDerp] Failed to list theme weights:", err);
                window.xcpDerpThemeWeightItems = [];
                return [];
            })
            .finally(() => { window.xcpDerpThemeWeightListPromise = null; });
    }
    return showResetItem ? [THEME_WEIGHT_RESET_ITEM, ...cachedItems] : cachedItems;
}

async function loadThemeJson(themeName) {
    if (!themeName) return null;
    const res = await fetch(`/xcp/load/themes?name=${encodeURIComponent(themeName)}&t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data?.data || null;
}

async function applyThemeWeightSelection(hostNode, sysState, themeName, weightName) {
    const cfg = window.xcpDerpThemeConfig;
    if (!cfg) return;

    if (weightName === THEME_WEIGHT_RESET_VALUE) {
        hostNode.properties.selectedThemeWeight = "";
        hostNode._themeWeightOverlay = null;
        hostNode._themeWeightOverlayName = "";
    } else {
        const sourceData = await loadThemeJson(weightName);
        if (!sourceData) return;
        hostNode.properties.selectedThemeWeight = weightName;
        hostNode._themeWeightOverlay = sourceData;
        hostNode._themeWeightOverlayName = weightName;
    }

    if (typeof hostNode.onThemeUpdate === "function") hostNode.onThemeUpdate(cfg);
    if (hostNode.layout) hostNode.layout._lastCacheKey = "";
    if (sysState?.layout) sysState.layout._lastCacheKey = "";
    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
}

function getHeaderInsetLayoutHash(node, insetBoost) {
    const { cornerOverride, isSelected } = resolveHeaderInsetLayoutState(node);

    return [
        node._currentThemeName || "",
        node.properties?.contentCollapsed ? 1 : 0,
        isSelected ? 1 : 0,
        cornerOverride ? cornerOverride.map(v => (v ?? "n")).join("_") : "nocorners",
        `${insetBoost.left},${insetBoost.right}`,
    ].join("|");
}

function resolveDockGlyph(node) {
    const edges = node?.properties?.deckEdges || {};
    const hasLeft = edges.left !== null && edges.left !== undefined;
    const hasRight = edges.right !== null && edges.right !== undefined;
    const hasTop = edges.top !== null && edges.top !== undefined;
    const hasBottom = edges.bottom !== null && edges.bottom !== undefined;

    if (hasLeft && hasRight) return "dockleftright";
    if (hasTop && hasBottom) return "docktopbottom";
    if (hasLeft) return "dockleft";
    if (hasRight) return "dockright";
    if (hasTop) return "docktop";
    if (hasBottom) return "dockbottom";
    return "undeck";
}

function isVerticalDockedGroup(node) {
    const graph = node?.graph || window.app?.graph || null;
    if (!node || !graph) return false;
    if (!isNodeDocked(node, graph)) return false;
    return isLinearDeckGroup(node, graph, "vertical");
}

function isHorizontalDockedGroup(node) {
    const graph = node?.graph || window.app?.graph || null;
    if (!node || !graph) return false;
    if (!isNodeDocked(node, graph)) return false;
    return isLinearDeckGroup(node, graph, "horizontal");
}

function setVerticalStackPin(node) {
    const graph = node?.graph || window.app?.graph || null;
    if (!node || !graph) return;
    const members = getDeckMembers(node, graph) || [node];
    members.forEach((member) => {
        if (!member?.properties) member.properties = {};
        member.properties.pinActive = false;
        if (member.requestDerpSync) member.requestDerpSync();
    });
    if (!node.properties) node.properties = {};
    node.properties.pinActive = true;
    if (node.requestDerpSync) node.requestDerpSync();
}

function parseWarpShortcutCombo(raw) {
    const value = String(raw || "").trim();
    if (!value) return { ctrl: false, shift: false, key: "" };
    const parts = value.split("-").map((p) => p.trim()).filter(Boolean);
    const ctrl = parts.some((p) => p.toLowerCase() === "ctrl");
    const shift = parts.some((p) => p.toLowerCase() === "shift");
    const key = (parts[parts.length - 1] || "").toLowerCase();
    return { ctrl, shift, key };
}

function buildWarpShortcutCombo(ctrl, key) {
    const k = String(key || "").trim();
    if (!k) return "";
    const segs = [];
    if (ctrl) segs.push("Ctrl");
    segs.push(k);
    return segs.join("-");
}

if (!window._xcpDerpWarpShortcutBound) {
    window._xcpDerpWarpShortcutBound = true;
    window.addEventListener("keydown", (e) => {
        const target = e.target;
        const tag = String(target?.tagName || "").toUpperCase();
        const isTyping = tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable === true;
        if (isTyping) return;

        const graph = app?.graph;
        const nodes = graph?._nodes || [];
        if (!Array.isArray(nodes) || nodes.length === 0) return;

        for (const node of nodes) {
            const p = node?.properties || {};
            const enabled = p._showWarpRegion === true;
            if (!enabled) continue;

            const combo = parseWarpShortcutCombo(p.warpShortcut ?? "1");
            if (!combo.key) continue;

            const pressedKey = String(e.key || "").toLowerCase();
            const ctrlMatch = combo.ctrl ? e.ctrlKey === true : e.ctrlKey === false;
            if (combo.shift) continue;
            if (pressedKey === combo.key && ctrlMatch && e.shiftKey === false) {
                e.preventDefault();
                const nx = Number(node?.pos?.[0]);
                const ny = Number(node?.pos?.[1]);
                const ownW = Number(node?.properties?.nodeSize?.[0]);
                const ownH = Number(node?.properties?.nodeSize?.[1]);
                const liveW = Number(node?.size?.[0]);
                const liveH = Number(node?.size?.[1]);
                const nw = Number.isFinite(ownW) && Number.isFinite(liveW) ? Math.max(ownW, liveW) : (Number.isFinite(ownW) ? ownW : liveW);
                const nh = Number.isFinite(ownH) && Number.isFinite(liveH) ? Math.max(ownH, liveH) : (Number.isFinite(ownH) ? ownH : liveH);
                if (!Number.isFinite(nx) || !Number.isFinite(ny)) break;

                const targetX = nx + ((Number.isFinite(nw) ? nw : 0) * 0.5);
                const targetY = ny + ((Number.isFinite(nh) ? nh : 0) * 0.5);

                const warpZoom = Number(node?.properties?._warpZoom) || DEFAULT_WARP_SHORTCUT_ZOOM;
                warpToPoint({
                    worldX: targetX,
                    worldY: targetY,
                    zoom: warpZoom,
                }, {
                    zoomMode: "absolute",
                    targetZoom: warpZoom,
                    durationMs: WARP_SHORTCUT_TRAVEL_DURATION_MS,
                    easing: "easeOutQuad",
                });
                break;
            }
        }
    }, true);
}

export const getPanelVars = (node) => {
    if (node && typeof node.getDerpVars === 'function') {
        const vars = node.getDerpVars(node);
        return { ...vars, oX: 0, oY: 0 };
    }
    // Strict fallback if host node is missing its Fatha variables
    return {
        mW: 0, mH: 0, sW: 2, sH: 2, oX: 0, oY: 0, pW: 2, pH: 4
    };
};

/**
 * REFACTORED: The standard layout map for Virtual Nodes.
 * Handles header, custom content regions, and the footer system button.
 */
export const getVirtualNodeLayoutMap = (node) => {
    const p = node.properties || {};
    const { mW, mH, sW, sH, oX, oY, pW, pH } = getPanelVars(node);
    const collapseIcon = p.contentCollapsed ? "add" : "subtract";
    const customKeys = Object.keys(node.layoutMap || {});
    const lastCustomRegion = (p.contentCollapsed || customKeys.length === 0) ? "headerRegion" : customKeys[customKeys.length - 1];
    const headerPaletteFill = resolveHeaderPaletteFill(node);
    const headerSideInsetBoost = resolveHeaderSideInsetBoost(node);
    
    node._layoutMapHash = getHeaderInsetLayoutHash(node, headerSideInsetBoost);

    const isVerticalDocked = isVerticalDockedGroup(node);
    const isHorizontalDocked = isHorizontalDockedGroup(node);
    const suppressHiddenHeaderDockGap = p.drawHeader === false && isHorizontalDocked && !p.contentCollapsed;
    const footerGapHeight = Number.isFinite(Number(p.footerGapHeight))
        ? Number(p.footerGapHeight)
        : (suppressHiddenHeaderDockGap ? 0 : oY);
    const titleVisible = isVerticalDocked || p.contentCollapsed || p.drawHeader !== false;
    const focusTitleEditor = (reg, data) => {
        const paintData = resolvePaintData(node, "t_textBig");
        const fontSize = paintData?.fontSize || 14;
        const font = paintData?.font || "arial";
        const textW = measureTextWidth(node.titleLabel || "Virtual Node", fontSize, font, paintData?.fontWeight || "normal");
        const startX = reg.x + pW;

        if (data?.localX < startX || data?.localX > startX + textW) return false;

        const el = node._derpDomElements?.titleLabel;
        if (!el) return false;
        el._isAwake = true;
        el.style.pointerEvents = "auto";
        el.style.opacity = "1";
        el.focus();
        requestAnimationFrame(() => {
            if (document.activeElement !== el) el.focus();
            const sel = window.getSelection?.();
            if (!sel) return;
            try {
                const range = document.createRange();
                range.selectNodeContents(el);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (_) {}
        });
        return true;
    };
    const isTitleTextHit = (localMouse, reg) => {
        const paintData = resolvePaintData(node, "t_textBig");
        const fontSize = paintData?.fontSize || 14;
        const font = paintData?.font || "arial";
        const textW = measureTextWidth(node.titleLabel || "Virtual Node", fontSize, font, paintData?.fontWeight || "normal");
        const startX = reg.x + pW;
        return localMouse[0] >= startX && localMouse[0] <= startX + textW && node.layout?.hitTest?.(localMouse, reg);
    };
    return {
        headerRegion: {
            dir: "col", width: "full", height: "auto",
            hidden: !titleVisible,
            inSlotIdx: p.contentCollapsed ? -1 : undefined,
            outSlotIdx: p.contentCollapsed ? -1 : undefined,
            spacing: [0, sH],
            headerMain: {
                dir: "row", width: "full", height: p.contentCollapsed ? COLLAPSED_HEADER_HEIGHT : "auto",
                btnColor: headerPaletteFill,
                margin: [2, p.contentCollapsed ? COLLAPSED_HEADER_VERTICAL_MARGIN : 2, 2, p.contentCollapsed ? COLLAPSED_HEADER_VERTICAL_MARGIN : 0],
                padding: [headerSideInsetBoost.left, 0, headerSideInsetBoost.right, 0],
                btnCollapse: {
                    type: UI_TYPES.ICONBUTTON,
                    themeKey: "buttonNode, t_textSystem",
                    toolTip: tLocale("$fatha_layout.tooltips.collapse_node", "Collapse or un-collapse the node"),
                    icon: collapseIcon,
                    ...HEADER_ICON_SIZE, spacing: [sW, 0],
                    playSound: p.contentCollapsed ? "collapseoff" : "collapseon",
                    onPress: () => {
                        const wasCollapsed = !!node.properties.contentCollapsed;
                        handleDerpCollapse(node);
                        if (wasCollapsed) {
                            ensureNodeVisibleInViewport(node, {
                                axis: "y",
                                durationMs: 220,
                                easing: "easeOutQuad",
                                followFrames: 8,
                            });
                        }
                    }
                },
                titleLabel: {
                    type: UI_TYPES.EDITOR, skipBackground: true, mouseOver: false,
                    themeKey: "dialog, t_textBig",
                    width: "full", height: "auto", padding: [pW, 0],
                    hitTest: isTitleTextHit, deferAsleepDomHitTest: true,
                    
                    text: node.titleLabel || "Virtual Node",
                    noDragLock: true, spacing: [sW, 0],
                    onPress: (e, data) => {
                        if (e?.originalEvent?.button === 2) return;
                        focusTitleEditor(data?.reg || node.layout?.regions?.titleLabel, data);
                    },
                    onClick: (e, reg, data) => {
                        if (e?.originalEvent?.button === 2) return;
                        focusTitleEditor(reg, data);
                    },
                    onDblClick: (e, reg, data) => {
                        if (e?.originalEvent?.button === 2) return;
                        focusTitleEditor(reg, data);
                    },
                    onBlur: (newVal) => {
                        if (newVal !== undefined) {
                            node.titleLabel = newVal;
                            node.properties.titleLabel = newVal;
                            node.properties._derpCustomTitle = !isDerpDefaultLocalizedTitle(newVal, node.properties._derpTitleLocaleKey);
                            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                            if (typeof node.syncDerpOutputs === "function") node.syncDerpOutputs();
                            node.requestDerpSync();
                        }
                    }
                },
                btnDeck: {
                    type: UI_TYPES.ICONBUTTON,
                    hidden: !isNodeDocked(node, node.graph || null),
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    toolTip: tLocale("$fatha_layout.tooltips.undock_node", "Disconnect this node from its docked stack"),
                    icon: resolveDockGlyph(node),
                    playSound: "undocked",
                    ...HEADER_ICON_SIZE, spacing: [sW, 0],
                    onPress: () => {
                        if (undockNodeEdges(node, node.graph || null)) {
                            node.requestDerpSync();
                        }
                    }
                },
                btnPin: {
                    type: UI_TYPES.ICONBUTTON,
                    hidden: !isVerticalDockedGroup(node),
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    toolTip: tLocale("$fatha_layout.tooltips.pin_anchor", "Pin this node as the docked stack anchor so it stays in place when the stack collapses"),
                    icon: "pin",
                    ...HEADER_ICON_SIZE, spacing: [sW, 0],
                    state: p.pinActive === true ? "ON" : "OFF",
                    onPress: () => {
                        if (!isVerticalDockedGroup(node)) return;
                        setVerticalStackPin(node);
                    }
                },
                btnSetting: {
                    type: UI_TYPES.ICONBUTTON, hidden: !p.drawSettingBtn,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    toolTip: tLocale("$fatha_layout.tooltips.advanced_settings", "Toggles advanced settings on the Node's Deck"),
                    icon: "settings",
                    ...HEADER_ICON_SIZE, spacing: [sW, 0],
                    state: p.settingActive ? "ON" : "OFF",
                    onPress: () => {
                        node.properties.settingActive = !node.properties.settingActive;
                        node._layoutMapHash = null;
                        if (node.layout) node.layout._lastCacheKey = "";
                        if (node.onDerpSettingsPress) node.onDerpSettingsPress(node.properties.settingActive);
                        if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
                        if (node.properties?.autoHeight !== false) {
                            node._allowDockContentHeightShiftFrames = 4;
                            settleDerpSizeBeforeDraw(node, {
                                forceAutoHeight: true,
                                suppressRequestSync: true,
                            });
                        }
                        node.requestDerpSync();
                    }
                },
                btnSignal: {
                    type: UI_TYPES.ICONBUTTON, hidden: !p.drawSignalBtn,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    toolTip: tLocale("$fatha_layout.tooltips.configure_wireless", "Configure wireless signals received by this node, similar to setting up input links in default ComfyUI"),
                    icon: "wireless",
                    ...HEADER_ICON_SIZE, spacing: [sW, 0],
                    state: activeBastas.get(getSignalReceiverId())?.hostNode === node && !activeBastas.get(getSignalReceiverId())?.isClosing ? "ON" : "OFF",
                    pulse: (() => {
                        const isBastaOpen = activeBastas.get(getSignalReceiverId())?.hostNode === node && !activeBastas.get(getSignalReceiverId())?.isClosing;
                        const hasRequiredSignals = typeof node.hasRequiredWirelessSignals === "function"
                            ? node.hasRequiredWirelessSignals()
                            : (() => {
                                const reqTypes = Array.isArray(node.signalFilters?.types) ? node.signalFilters.types : [];
                                const selectedIds = node.properties?.multiSignalIds || {};
                                const globalSignals = window.xcpDerpSignals || {};
                                return reqTypes.length === 0 || reqTypes.every((_, i) => {
                                    const rawId = selectedIds[i] || selectedIds[String(i)] || null;
                                    if (!rawId) return false;
                                    const directId = String(rawId);
                                    if (globalSignals[directId]) return true;
                                    const baseId = directId.split(":")[0];
                                    if (globalSignals[baseId]) return true;
                                    return Object.values(globalSignals).some(sig => String(sig?.nodeId || "").startsWith(`${baseId}:`));
                                });
                            })();
                        return !isBastaOpen && !hasRequiredSignals;
                    })(),
                    onPress: () => showBastaSignalReceiver(node, "btnSignal", node.signalFilters || {}),
                },
                btnBypass: {
                    type: UI_TYPES.ICONBUTTON, hidden: false,
                    themeKey: "buttonNode, t_textSystem",
                    objectAlign: ["left", "middle"],
                    toolTip: tLocale("$fatha_layout.tooltips.bypass_node", "Bypass the node. Works the same as default ComfyUI and uses the same shortcut"),
                    icon: "power",
                    ...HEADER_ICON_SIZE,
                    playSound: node.mode === 4 ? "systemoff" : "systemon",
                    onPress: () => {
                        const nextMode = (node.mode === 4) ? 0 : 4;
                        node.mode = nextMode;
                        if (typeof node.onModeChange === "function") node.onModeChange(nextMode);

                        node._lastMode = null;
                        node._lastBypassState = null;
                        node._lastSignalFingerprint = null;
                        node._lastSyncedContent = null;
                        node._lastBroadcastHash = null;
                        clearBypassSignalDebouncers(node);

                        if (nextMode === 4) {
                            transmitBypassedDerpSignals(node, {
                                forceIndexedSingleOutput: !!node.properties?.skipGenericWirelessHeartbeat
                            });
                        } else if (node.syncDerpOutputs) {
                            node.syncDerpOutputs();
                        }
                        node.requestDerpSync();
                    }
                },
            },
            headerBreak: {
                margin: [0,pH,0,0], height: 1,
                type: UI_TYPES.LINEBREAK,
                hidden: !!p.contentCollapsed
            },
        },
        ...Object.fromEntries(Object.entries(node.layoutMap || {}).map(([k, v]) => [
            k, { ...v, hidden: v.hidden || !!p.contentCollapsed }
        ])),
        footerRegion: {
            hidden: !!p.contentCollapsed,
            anchor: { target: lastCustomRegion, axis: "y", offset: 0},
            dir: "col", width: "full", height: "fill", minHeight: suppressHiddenHeaderDockGap ? 6 : (oY + 6),
            footerGap: { height: footerGapHeight },
            systemBtn: {
                type: UI_TYPES.ICONBUTTON, noHover: false,
                themeKey: "buttonNode, t_textSystem, 3",
                toolTip: tLocale("$fatha_layout.tooltips.open_system_panel", "Open the node system panel for advanced settings, similar to ComfyUI right-click Properties"),
                objectAlign: ["center", "bottom"],
                width: 32, height: 6,
                corners: [2, 2, 0, 0],
                hitTest: (localMouse, reg) => {
                    const x = Number(reg?.x) || 0;
                    const y = Number(reg?.y) || 0;
                    const visualW = Math.min(Number(reg?.w) || 32, 32);
                    const visualH = Math.min(Number(reg?.h) || 6, 6);
                    return localMouse[0] >= x && localMouse[0] <= x + visualW &&
                        localMouse[1] >= y && localMouse[1] <= y + visualH;
                }
            }
        }
    };
};

export function getPanelBaseMap(hostNode, app, sysState) {
    const { mW, mH, sW, sH, oX, oY, pW, pH } = getPanelVars(hostNode);
    const showWarpRegion = hostNode.properties?._showWarpRegion === true;
    const isDocked = isNodeDocked(hostNode, hostNode?.graph || app?.graph || null);
    const isVerticalDocked = isVerticalDockedGroup(hostNode);

    if (!Array.isArray(hostNode.properties.warpShortcutItems) || hostNode.properties.warpShortcutItems.length === 0) {
        hostNode.properties.warpShortcutItems = [...WARP_SHORTCUT_ITEMS];
    }

    const shortcutPool = hostNode.properties.warpShortcutItems
        .map((v) => String(v).trim())
        .filter(Boolean);

    const parsedCurrent = parseWarpShortcutCombo(hostNode.properties?.warpShortcut);
    const isCtrlOn = hostNode.properties?.warpShortcutCtrl === true || parsedCurrent.ctrl;
    const currentBaseKey = parsedCurrent.key || (hostNode.properties?.warpShortcutBase != null ? String(hostNode.properties.warpShortcutBase).trim().toLowerCase() : "");

    hostNode.properties.warpShortcutCtrl = isCtrlOn;
    hostNode.properties.warpShortcutShift = false;
    hostNode.properties.warpShortcutBase = currentBaseKey;

    const comboItems = shortcutPool.map((k) => buildWarpShortcutCombo(isCtrlOn, String(k).toLowerCase()));
    const graphNodes = app?.graph?._nodes || [];
    const usedByOthers = new Set(
        graphNodes
            .filter((n) => n && n !== hostNode && n.properties?._showWarpRegion === true)
            .filter((n) => n.properties?.warpShortcut)
            .map((n) => String(n.properties?.warpShortcut ?? "").trim())
            .filter(Boolean)
    );

    let selectedShortcut = buildWarpShortcutCombo(isCtrlOn, currentBaseKey);
    let availableShortcutItems = comboItems.filter((k) => !usedByOthers.has(k));
    if (!selectedShortcut) {
        selectedShortcut = "";
    }
    if (selectedShortcut && !availableShortcutItems.includes(selectedShortcut)) {
        availableShortcutItems = [selectedShortcut, ...availableShortcutItems];
    }

    const sysKeys = Object.keys(hostNode.sysLayoutMap || {});
    const lastSysRegion = sysKeys.length > 0 ? sysKeys[sysKeys.length - 1] : "sysDefaultControlsRegion";

    // Grab available themes dynamically from the global config
    const cfg = window.xcpDerpThemeConfig;
    const allThemes = cfg?.themes || {};
    const availableThemes = Object.keys(allThemes);
    const themePropertyName = hostNode?.comfyClass === "derpThemeManagerV2" ? "selectedSystemTheme" : "selectedTheme";
    const requestedTheme = hostNode.properties?.[themePropertyName] || cfg?.activeTheme || (availableThemes.length > 0 ? availableThemes[0] : "Default");
    const fallbackTheme = cfg?.activeTheme || (availableThemes.includes("Template_Standard_v02") ? "Template_Standard_v02" : (availableThemes[0] || "Default"));
    const activeTheme = availableThemes.includes(requestedTheme) ? requestedTheme : fallbackTheme;
    const selectedThemeWeight = String(hostNode.properties.selectedThemeWeight || "");
    const hasSelectedThemeWeight = !!selectedThemeWeight && selectedThemeWeight !== THEME_WEIGHT_RESET_VALUE;

    if (requestedTheme && requestedTheme !== activeTheme && hostNode._lastMissingThemeDropdownWarning !== requestedTheme) {
        hostNode._lastMissingThemeDropdownWarning = requestedTheme;
        showBastaSystemMessage(hostNode, "Theme File Missing", 3200, { fade: true, grow: true }, null, "error", null, requestedTheme);
        hostNode.properties[themePropertyName] = activeTheme;
    } else if (requestedTheme === activeTheme && hostNode._lastMissingThemeDropdownWarning === requestedTheme) {
        hostNode._lastMissingThemeDropdownWarning = "";
    }

    return {
        sysHeaderRegion: {
            width: "full", height: "auto", dir: "row",
            margin: [mW, mH, mW + sW, 0], 
            lblTheme: {
                type: UI_TYPES.TEXT, mouseOver: false,
                themeKey: "t_textSystem",
                text: "$fatha_layout.theme",
                width: "auto", height: "auto",
                objectAlign: ["left", "middle"],
                padding: [pW, pH],
                spacing: [sW, sH],
            },
            dropdownThemes: {
                type: UI_TYPES.FILEBROWSER,
                themeKey: "dialog, t_textSystem",
                toolTip: tLocale("$fatha_layout.tooltips.select_theme", "Select a new theme for the node"),
                canvasShield: true,
                indicator: true,
                displayMode: "cutoff",
                spacing: [sW, 0],
                padding: [pW, pH],
                width: "full", height: "auto", minWidth: 80,
                mode: "file",
                fileType: "theme",
                rootName: "themes",
                items: availableThemes,
                value: activeTheme,
                onChange: (val) => {
                    const node = app.graph.getNodeById(sysState.activeHostId || hostNode.id);
                    const sysCfg = window.xcpDerpThemeConfig;
                    if (node && sysCfg) {
                        sysCfg.activeTheme = val;
                        node.properties[themePropertyName] = val;
                        node.properties.selectedThemeWeight = "";
                        node._themeWeightOverlay = null;
                        node._themeWeightOverlayName = "";

                        if (sysState.sysLayoutMap?.sysHeaderRegion?.dropdownThemes) {
                            sysState.sysLayoutMap.sysHeaderRegion.dropdownThemes.value = val;
                        }
                        if (sysState.sysLayoutMap?.sysHeaderRegion?.dropdownThemeWeight) {
                            sysState.sysLayoutMap.sysHeaderRegion.dropdownThemeWeight.value = THEME_WEIGHT_ROOT_VALUE;
                            sysState.sysLayoutMap.sysHeaderRegion.dropdownThemeWeight.items = getThemeWeightItems(false);
                        }

                        if (node.layout) node.layout._lastCacheKey = "";
                        if (sysState.layout) sysState.layout._lastCacheKey = "";

                        if (typeof node.onThemeUpdate === "function") node.onThemeUpdate(sysCfg);
                        const bgKey = "systemBackground";
                        sysState.currentThemeData = node[`_${bgKey}PaintData_OFF`] || node[`_${bgKey}PaintData`];

                        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
                        else node.setDirtyCanvas(true, true);
                    }
                }
            },
            dropdownThemeWeight: {
                type: UI_TYPES.FILEBROWSER,
                themeKey: "dialog, t_textSystem",
                toolTip: tLocale("$fatha_layout.tooltips.select_theme_weight", "Apply saved theme weight settings to the selected theme"),
                canvasShield: true,
                indicator: true,
                displayMode: "cutoff",
                displayText: "Load theme weight",
                spacing: [sW, 0],
                padding: [pW, pH],
                width: "auto", height: "auto", minWidth: 82,
                mode: "file",
                icon: "dropdown",
                fileType: "theme",
                rootName: "themes",
                value: hasSelectedThemeWeight ? selectedThemeWeight : THEME_WEIGHT_ROOT_VALUE,
                items: getThemeWeightItems(hasSelectedThemeWeight),
                onChange: async (val) => {
                    if (!val) return;
                    try {
                        await applyThemeWeightSelection(hostNode, sysState, activeTheme, val);
                        if (sysState.sysLayoutMap?.sysHeaderRegion?.dropdownThemeWeight) {
                            sysState.sysLayoutMap.sysHeaderRegion.dropdownThemeWeight.value = val;
                        }
                    } catch (err) {
                        console.error("[xcpDerp] Theme weight apply failed:", err);
                        showBastaSystemMessage(hostNode, "Theme Weight Failed", 3000, { fade: true, grow: true }, "dropdownThemeWeight", "error", null, "");
                    }
                }
            },
            btnWarp: {
                type: UI_TYPES.BUTTON,
                themeKey: "button, t_textSystem",
                toolTip: tLocale("$fatha_layout.tooltips.add_warp_point", "Assign a Warp Point hotkey to this node so the canvas can center on it"),
                text: "$fatha_layout.add_warp_point",
                labelAlign: ["center", "middle"],
                width: "auto", height: "fill",
                spacing: [sW, 0],
                padding: [pW, pH],
                hidden: showWarpRegion,
                onPress: () => {
                    hostNode.properties._showWarpRegion = true;
                    hostNode.properties._warpZoom = Number(app?.canvas?.ds?.scale) || null;
                    hostNode.properties.warpShortcutBase = null;
                    hostNode.properties.warpShortcutCtrl = false;
                    hostNode.properties.warpShortcut = availableShortcutItems[0] || "";
                    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
                    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
                },
            },
            btnWarpDelete: {
                type: UI_TYPES.BUTTON,
                themeKey: "button, t_textSystem",
                toolTip: tLocale("$fatha_layout.tooltips.delete_warp_point", "Remove this node's Warp Point and free the shortcut key"),
                text: "$fatha_layout.delete_warp_point",
                labelAlign: ["center", "middle"],
                width: "auto", height: "fill",
                spacing: [sW, 0],
                padding: [pW, pH],
                hidden: !showWarpRegion,
                onPress: () => {
                    hostNode.properties._showWarpRegion = false;
                    hostNode.properties.warpShortcut = null;
                    hostNode.properties.warpShortcutBase = null;
                    hostNode.properties.warpShortcutCtrl = false;
                    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
                    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
                },
            },
        },
        regionWarp: {
            hidden: !showWarpRegion,
            anchor: { target: "sysHeaderRegion", axis: "y"},
            dir: "row",            
            width: "full", height: "auto",
            margin: [mW, mH, mW + sW, 0], 
            lblShortcut: {
                type: UI_TYPES.TEXT,
                themeKey: "t_textSystem",
                text: "$fatha_layout.warp_shortcut",
                width: "auto", height: "auto",
                objectAlign: ["left", "middle"],
                padding: [pW, pH],
                spacing: [sW, 0],
            },
            toggleCTRL: {
                type: UI_TYPES.TOGGLE,
                textThemeKey: "t_textSystem",
                icon: "radio",
                label: "$fatha_layout.ctrl",
                value: isCtrlOn,
                width: "auto", height: "auto",
                padding: [pW, pH],
                spacing: [sW, 0],
                onPress: () => {
                    hostNode.properties.warpShortcutCtrl = hostNode.properties.warpShortcutCtrl !== true;
                    const base = String(hostNode.properties.warpShortcutBase || currentBaseKey || "1").toLowerCase();
                    hostNode.properties.warpShortcut = buildWarpShortcutCombo(hostNode.properties.warpShortcutCtrl === true, base);
                    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
                    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
                }
            },
            dropdownShortcut: {
                type: UI_TYPES.FILEBROWSER,
                icon: "dropdown",
                themeKey: "dialog, t_textSystem",
                canvasShield: true,
                items: availableShortcutItems,
                value: selectedShortcut,
                width: "auto", height: "auto",
                padding: [pW, pH],
                mode: "file",
                rootName: "shortcut",
                spacing: [sW, 0],
                onChange: (val) => {
                    const nextCombo = String(val ?? "").trim();
                    const parsed = parseWarpShortcutCombo(nextCombo);
                    hostNode.properties.warpShortcut = nextCombo;
                    hostNode.properties.warpShortcutBase = parsed.key || hostNode.properties.warpShortcutBase || "1";
                    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
                    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
                },
            },
            lblZoom: {
                type: UI_TYPES.TEXT,
                themeKey: "t_textSystem",
                text: "$fatha_layout.zoom",
                width: "auto", height: "auto",
                objectAlign: ["left", "middle"],
                padding: [pW, pH],
                spacing: [sW, 0],
            },
            editorZoom: {
                type: UI_TYPES.EDITOR,
                themeKey: "dialog, t_textSystem",
                text: String(Number(hostNode.properties?._warpZoom || DEFAULT_WARP_SHORTCUT_ZOOM).toFixed(2)),
                width: "auto", height: "auto",
                labelAlign: ["center", "middle"],
                padding: [pW, pH],
                spacing: [sW, 0],
                measureText: "1.00",
                onBlur: (v) => {
                    const z = Math.max(1.0, Math.min(3.0, parseFloat(v) || DEFAULT_WARP_SHORTCUT_ZOOM));
                    hostNode.properties._warpZoom = z;
                    if (typeof hostNode.requestDerpSync === "function") hostNode.requestDerpSync();
                    else if (typeof hostNode.setDirtyCanvas === "function") hostNode.setDirtyCanvas(true, true);
                },
            },
        },
        sysDefaultControlsRegion: {
            anchor: { target: showWarpRegion ? "regionWarp" : "sysHeaderRegion", axis: "y" },
            dir: "row", margin: [mW, sH, mW + sW, mH],             
            width: "full", height: "auto",
            btnAutoWidth: {
                type: UI_TYPES.TOGGLE_V2,
                textThemeKey: "dialog, button, t_textSystem", skipBackground: true,
                toolTip: tLocale("$fatha_layout.tooltips.auto_width", "If disabled, the node width can be resized manually"),
                spacing: [sW, 0],
                value: hostNode.properties?.autoWidth !== false,
                state: isDocked ? "DIS" : "OFF",
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                label: "$system.auto_width",
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => {
                    if (isDocked) return;
                    hostNode.properties.autoWidth = (hostNode.properties.autoWidth !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            btnAutoHeight: {
                type: UI_TYPES.TOGGLE_V2,
                textThemeKey: "dialog, button, t_textSystem", skipBackground: true,
                toolTip: tLocale("$fatha_layout.tooltips.auto_height", "If disabled, the node height can be resized manually"),
                spacing: [sW, 0],
                value: hostNode.properties?.autoHeight !== false,
                state: isDocked ? "DIS" : "OFF",
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                label: "$system.auto_height",
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => {
                    if (isDocked) return;
                    hostNode.properties.autoHeight = (hostNode.properties.autoHeight !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            btnHideTitle: {
                type: UI_TYPES.TOGGLE_V2,
                textThemeKey: "dialog, button, t_textSystem", skipBackground: true,
                toolTip: tLocale("$fatha_layout.tooltips.hide_header", "Hide the node header. Headers cannot be hidden while vertically docked"),
                spacing: [sW, 0],
                value: isVerticalDocked || hostNode.properties?.drawHeader !== false,
                state: isVerticalDocked ? "DIS" : "OFF",
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                label: "$system.title",
                width: "auto", height: "fill",
                padding: [pW, pH], 
                onPress: () => {
                    if (isVerticalDocked) return;
                    hostNode.properties.drawHeader = (hostNode.properties.drawHeader !== false) ? false : true;
                    handleHorizontalDeckTitleToggle(hostNode);
                }
            },
            toggleUseAnimation: {
                type: UI_TYPES.TOGGLE_V2,
                textThemeKey: "dialog, button, t_textSystem", skipBackground: true,
                value: hostNode.properties?.useAnimations !== false,
                objectAlign: ["left", "top"], labelAlign: ["left", "middle"],
                toolTip: tLocale("$fatha_layout.tooltips.animation_toggle", "Toggle this node's individual animation setting"),
                label: "$system.animation",
                width: "auto", height: "fill",
                padding: [pW, pH],
                onPress: () => {
                    hostNode.properties.useAnimations = (hostNode.properties.useAnimations !== false) ? false : true;
                    hostNode.requestDerpSync();
                }
            },
            spring: { width: "fit", height: 0 },
            dropdownDebug: {
                type: UI_TYPES.FILEBROWSER,
                icon: "dropdown",
                value: hostNode.properties?.debugMode || "None",
                themeKey: "panel, t_textSystem",
                hidden: true,
                canvasShield: true,
                width: "auto", height: "auto", minWidth: 80,
                mode: "file",
                rootName: "debug",
                padding: [pW, pH],
                spacing: [sW, 0],
                items: DEBUG_OPTIONS,
                onChange: (val) => {
                    const node = app.graph.getNodeById(sysState.activeHostId || hostNode.id);
                    if (node) {
                        node.properties.debugMode = val;
                        if (node.layout) node.layout._lastCacheKey = "";
                        if (sysState.layout) sysState.layout._lastCacheKey = "";
                        if (typeof node.requestDerpSync === "function") node.requestDerpSync();
                        else node.setDirtyCanvas(true, true);
                    }
                }
            },
        },
        lineBreak: { type: UI_TYPES.LINEBREAK, anchor: { target: "sysDefaultControlsRegion", axis: "y" } }, 
        sysProfileRegion: {
            hidden: !hostNode._sysProfileActive,
            anchor: { target: lastSysRegion, axis: "y"},
            dir: "row", height: "auto", width: "full", margin: [mW * 2, mH, mW + sW, mH],
            themeKey: "panel",
            settingsLabel: {
                type: UI_TYPES.TEXT, text: "$fatha_layout.load_settings", themeKey: "t_textSystem", mouseOver: false,
                width: "auto", height: "auto", objectAlign: ["left", "middle"], disabled: false, 
            },
            dropdownProfiles: {
                type: UI_TYPES.FILEBROWSER,
                icon: "dropdown",
                canvasShield: true,
                themeKey: "dialog, t_textSystem",
                toolTip: tLocale("$fatha_layout.tooltips.load_profile", "Select a saved profile and load this node's settings from it"),
                width: "full", minWidth: 80,
                mode: "file",
                rootName: "profiles",
                items: hostNode._sysProfileCache || ["(No Profiles Found)"],
                value: hostNode._currentProfileName || (hostNode._sysProfileCache?.[0] || "(No Profiles Found)"),
                spacing: [sW, 0], padding: [pW, pH],
                onChange: (val) => {
                    hostNode._currentProfileName = val;
                    if (hostNode.properties) hostNode.properties.selectedProfileName = val === "(No Profiles Found)" ? "" : val;
                    if (hostNode.applyDerpProfile) hostNode.applyDerpProfile(val);
                }
            },
            btnRename: {
                type: UI_TYPES.ICONBUTTON, icon: "rename", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                toolTip: tLocale("$fatha_layout.tooltips.rename_profile", "Rename the currently selected profile"),
                onPress: () => {
                    if (hostNode.onDerpRenamePress) return hostNode.onDerpRenamePress();
                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    showBastaFileHandler(hostNode, "none", "btnRename", {
                        title: `Rename Profile: ${profileName}`,
                        message: "Enter new name for profile:", confirm: "Rename",
                        originalName: profileName,
                        fileList: hostNode._sysProfileCache || [],
                        onConfirm: async (newName) => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) { try { loadData = await loadRes.json(); } catch (e) {} }
                                const profiles = loadData.data || {};

                                // overwrite allowed without confirm

                                if (profiles[profileName]) {
                                    profiles[newName] = profiles[profileName];
                                    if (profileName !== newName) delete profiles[profileName];

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({name: fullFileName, data: profiles})
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaSystemMessage(hostNode, "Profile Renamed: ", 3000, { fade: true, grow: true }, "btnRename", "success", null, newName);
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = newName;
                                        if (hostNode.properties) hostNode.properties.selectedProfileName = newName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                }
                            } catch (e) { console.error("[Rename Error]:", e); }
                        }
                    });
                }
            },
            btnCopy: {
                type: UI_TYPES.ICONBUTTON, icon: "copy", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                toolTip: tLocale("$fatha_layout.tooltips.copy_profile", "Copy the currently selected profile into a new profile"),
                onPress: () => {
                    if (hostNode.onDerpCopyPress) return hostNode.onDerpCopyPress();
                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    showBastaFileHandler(hostNode, "none", "btnCopy", {
                        title: `Duplicate Profile: ${profileName}`,
                        message: "Enter name for new profile copy:", confirm: "Duplicate",
                        mode: "duplicate",
                        originalName: profileName,
                        fileList: hostNode._sysProfileCache || [],
                        onConfirm: async (newName) => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) { try { loadData = await loadRes.json(); } catch (e) {} }
                                const profiles = loadData.data || {};

                                // overwrite allowed without confirm

                                if (profiles[profileName]) {
                                    profiles[newName] = JSON.parse(JSON.stringify(profiles[profileName]));

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({name: fullFileName, data: profiles})
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaSystemMessage(hostNode, "Profile Duplicated: ", 3000, { fade: true, grow: true }, "btnCopy", "success", null, newName);
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = newName;
                                        if (hostNode.properties) hostNode.properties.selectedProfileName = newName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                }
                            } catch (e) { console.error("[Copy Error]:", e); }
                        }
                    });
                }
            },
            btnSave: {
                type: UI_TYPES.ICONBUTTON, icon: "save", width: "match", height: "fill", themeKey: "systemButton, t_textSystem", spacing: [sW, 0], labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                toolTip: tLocale("$fatha_layout.tooltips.save_profile", "Save the node's current state into the profile"),
                get onPress() {
                    if (typeof this._overrideOnPress === "function") return this._overrideOnPress;
                    return () => {
                        if (hostNode.onDerpSavePress) return hostNode.onDerpSavePress();

                        const isIndividual = (hostNode._sysProfileFile === "derpLoraStack" || hostNode._sysProfileFile === "derpPromptBook");
                        const bastaCategory = isIndividual ? hostNode._sysProfileFile : "settings";

                        showBastaFileHandler(hostNode, bastaCategory, "btnSave", {
                            title: "Save Profile",
                            message: "Enter name for this profile:",
                            confirm: "Save",
                            mode: "save",
                            initialSize: [250, 130],
                            fileList: hostNode._sysProfileCache || [],
                            onConfirm: async (profileName) => {
                                const profileData = hostNode.exportDerpProfile ? hostNode.exportDerpProfile() : { ...hostNode.properties };
                                const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                                const fileName = hostNode._sysProfileFile;
                                const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                                try {
                                    const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                    let loadData = { data: {} };
                                    if (loadRes.ok) { try { loadData = await loadRes.json(); } catch(e) {} }
                                    const profiles = loadData.data || {};

                                    // overwrite allowed without confirm

                                    profiles[profileName] = profileData;

                                    const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                    const saveRes = await fetch(`/xcp/save/${category}`, {
                                        method: "POST",
                                        body: JSON.stringify({ name: fullFileName, data: profiles })
                                    });

                                    if (saveRes.ok) {
                                        playKaChing();
                                        showBastaSystemMessage(hostNode, "Profile Saved: ", 3000, { fade: true, grow: true }, "btnSave", "success", null, profileName);
                                        hostNode._sysProfileData = profiles;
                                        hostNode._sysProfileCache = Object.keys(profiles).sort();
                                        hostNode._currentProfileName = profileName;
                                        if (hostNode.properties) hostNode.properties.selectedProfileName = profileName;
                                        if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                        hostNode.setDirtyCanvas(true, true);
                                    }
                                } catch (e) { console.error("[Save Error]:", e); }
                            }
                        });
                    };
                },
                set onPress(v) { this._overrideOnPress = v; }
            },
            btnDelete: {
                type: UI_TYPES.ICONBUTTON,
                icon: "trash",
                width: "match",
                height: "fill",
                themeKey: "systemButton, t_textSystem",
                labelAlign: ["center", "middle"],
                state: (hostNode._currentProfileName && hostNode._currentProfileName !== "(No Profiles Found)") ? "OFF" : "DIS",
                onPress: () => {
                    if (hostNode.onDerpDeletePress) return hostNode.onDerpDeletePress();

                    const profileName = hostNode._currentProfileName;
                    if (!profileName || profileName === "(No Profiles Found)") return;

                    const subFolder = hostNode._sysProfileFolder || "nodeSettings";
                    const fileName = hostNode._sysProfileFile;
                    const category = subFolder === "nodeSettings" ? "settings" : subFolder;

                    if (confirm(`Delete profile "${profileName}"?`)) {
                        (async () => {
                            try {
                                const loadRes = await fetch(`/xcp/load/${category}?name=${fileName}`);
                                let loadData = {data: {}};
                                if (loadRes.ok) {
                                    try {
                                        loadData = await loadRes.json();
                                    } catch (e) {
                                    }
                                }
                                const profiles = loadData.data || {};

                                delete profiles[profileName];

                                const fullFileName = fileName + (fileName.endsWith(".json") ? "" : ".json");
                                const saveRes = await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    body: JSON.stringify({name: fullFileName, data: profiles})
                                });

                                if (saveRes.ok) {
                                    playKaboom();
                                    showBastaSystemMessage(hostNode, "Profile Deleted: ", 3000, { fade: true, grow: true }, "btnDelete", "error", null, profileName);
                                    hostNode._sysProfileData = profiles;
                                    hostNode._sysProfileCache = Object.keys(profiles).sort();
                                    if (hostNode._sysProfileCache.length === 0) hostNode._sysProfileCache = ["(No Profiles Found)"];
                                    hostNode._currentProfileName = hostNode._sysProfileCache[0];
                                    if (hostNode.properties) hostNode.properties.selectedProfileName = hostNode._currentProfileName === "(No Profiles Found)" ? "" : hostNode._currentProfileName;
                                    if (hostNode._derpPanel) hostNode._derpPanel._layoutDirty = true;
                                    hostNode.setDirtyCanvas(true, true);
                                }
                            } catch (e) {
                                console.error("[Delete Error]:", e);
                            }
                        })();
                    }
                }
            }
        },
        footerMargin: {
            anchor: { target: "sysProfileRegion", axis: "y", offset: oY },  dir: "col",
            footerGap: { height: 4 },
        }
    };
}
