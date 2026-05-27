/**
 * Path: ./js/fatha/core/fathaHandler.js
 * ROLE: Protocol-based interaction and theme engine for all Fatha entities.
 */
import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { toggleDerpSysPanel, sysPanel, closeDerpSysPanel } from "../helpers/fathaSysPanel.js";
import { masterPainter } from "../../herbina/masterPainter.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./masterLayoutTypes.js";
import { measureTextWidth, resolvePaintData } from "../../herbina/utils/widgetsUtils.js";
import { beginDockDrag, updateDockDrag, endDockDrag } from "./dockDrag.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import {
    syncHorizontalDeckHeight as syncHorizontalDeckHeightForGraph,
    settleDerpSizeBeforeDrawImpl,
    animateDerpSizeImpl,
    resolveDerpRuntimeSizeImpl,
    resolveHorizontalDeckSharedHeightImpl,
    handleDerpComputeSizeImpl,
    handleDerpCollapseImpl,
    handleHorizontalDeckTitleToggleImpl,
} from "./dockResize.js";
import { masterDockEngine, getDeckMembers, getDeckCornerOverride, isLinearDeckGroup } from "./masterDockEngine.js";
import { getDockGroupAxisFromMembers, shouldPreserveDockHeight, shouldPreserveDockWidth } from "./dockDimensions.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import {
    getNodeHeaderPaletteFingerprint,
    applyNodeHeaderPalette,
} from "../helpers/headerPaletteIdentity.js";
import { getPulseAlpha } from "../../herbina/masterAnimator.js";
import { showBastaMessage, closeBastaMessage } from "../bastas/bastaMessage.js";
import {
    applyDerpBackgroundImageImpl,
    hydrateDerpBackgroundSettingImpl,
} from "../helpers/derpBackgroundParallax.js";
import {
    loadDerpPaletteImpl,
    handleThemeUpdateImpl,
    handleInitDerpGlobalListenerImpl,
    getPaletteCache,
} from "../helpers/fathaThemeRuntime.js";

const COLLAPSED_NODE_MAX_CORNER = 5;
const TOOLTIP_DELAY_MS = 650;
const TOOLTIP_DURATION_MS = 0; // 0 = infinite, stays until mouse moves
const TOOLTIP_MOVE_THRESHOLD = 5;
const DERP_BACKGROUND_SETTING_ID = "Derp.BackgroundImage";

export function applyDerpBackgroundImage(backgroundName = "") {
    return applyDerpBackgroundImageImpl(backgroundName);
}

export async function hydrateDerpBackgroundSetting(settingId = DERP_BACKGROUND_SETTING_ID) {
    return hydrateDerpBackgroundSettingImpl(settingId);
}

function getDeckEngine() {
    if (!window.xcpMasterDeckEngine) {
        window.xcpMasterDeckEngine = new masterDockEngine(app.graph || null);
    }
    window.xcpMasterDeckEngine.setGraph(app.graph || null);
    return window.xcpMasterDeckEngine;
}

function getTooltipHost(entity) {
    if (entity?.isSystemPanel === true || entity?.isSysPanel === true) return entity;
    return entity?.hostNode || entity;
}

function getTooltipState(entity) {
    if (!entity) return null;
    if (!entity._xcpTooltipState) {
        entity._xcpTooltipState = {
            timer: null,
            pendingKey: null,
            pendingText: "",
            activeKey: null,
            activeText: "",
            shownSinceMoveToken: null,
            moveToken: 0,
            lastLocalPos: null,
            lastRegionKey: null,
        };
    }
    return entity._xcpTooltipState;
}

function isPointerOverEditableTitleText(entity, localMouse) {
    const titleReg = entity?.layout?.regions?.titleLabel;
    if (!titleReg || !Array.isArray(localMouse)) return false;
    if (!entity.layout?.hitTest?.(localMouse, titleReg)) return false;

    const paintData = resolvePaintData(entity, "t_textBig");
    const fontSize = paintData?.fontSize || 14;
    const font = paintData?.font || "arial";
    const text = String(entity?.titleLabel || entity?.title || "Virtual Node");
    const textW = measureTextWidth(text, fontSize, font, paintData?.fontWeight || "normal");
    const padX = Array.isArray(titleReg.padding)
        ? (titleReg.padding.length === 4 ? (titleReg.padding[0] || 0) : (titleReg.padding[0] || 0))
        : 0;
    const startX = titleReg.x + padX;
    const pointerX = Number(localMouse[0]);
    return pointerX >= startX && pointerX <= (startX + textW);
}

function clearTooltipTimer(state) {
    if (!state?.timer) return;
    clearTimeout(state.timer);
    state.timer = null;
}

function closeActiveTooltip(entity) {
    const state = getTooltipState(entity);
    if (!state?.activeKey) return false;
    const host = getTooltipHost(entity);
    const closed = closeBastaMessage(host, state.activeKey, "tooltip");
    state.activeKey = null;
    state.activeText = "";
    return closed;
}

function cancelTooltip(entity, closeVisible = false) {
    const state = getTooltipState(entity);
    if (!state) return;
    clearTooltipTimer(state);
    state.pendingKey = null;
    state.pendingText = "";
    if (closeVisible) closeActiveTooltip(entity);
}

function bumpTooltipMoveToken(entity) {
    const state = getTooltipState(entity);
    if (!state) return;
    state.moveToken = (Number(state.moveToken) || 0) + 1;
    state.shownSinceMoveToken = null;
}

function scheduleTooltip(entity, regionKey, tooltipText) {
    const host = getTooltipHost(entity);
    const state = getTooltipState(entity);
    if (!host || !state || !regionKey || !tooltipText) return;

    if (state.pendingKey === regionKey && state.pendingText === tooltipText && state.timer) return;
    if (state.activeKey === regionKey && state.activeText === tooltipText) return;
    if (state.shownSinceMoveToken === state.moveToken && state.activeKey !== regionKey) return;

    clearTooltipTimer(state);
    state.pendingKey = regionKey;
    state.pendingText = tooltipText;
    const scheduledMoveToken = state.moveToken;

    state.timer = setTimeout(() => {
        state.timer = null;
        if (entity._hoveredRegionKey !== regionKey) return;
        if (state.moveToken !== scheduledMoveToken) return;
        if (state.activeKey === regionKey && state.activeText === tooltipText) return;

        if (state.activeKey && state.activeKey !== regionKey) {
            closeActiveTooltip(entity);
        }
        closeBastaMessage(host, regionKey, "tooltip-refresh");
        const basta = showBastaMessage(host, tooltipText, TOOLTIP_DURATION_MS, {
            fade: true,
            textThemeKey: "background, t_toolTip_normal",
            tooltipExpand: true
        }, regionKey, false, "info", false);
        if (!basta) return;
        state.activeKey = regionKey;
        state.activeText = tooltipText;
        state.shownSinceMoveToken = scheduledMoveToken;
    }, TOOLTIP_DELAY_MS);
}

export function handleTooltipHover(entity, regionKey, localMouse = null) {
    const state = getTooltipState(entity);
    if (!state) return;

    if (!localMouse || !Array.isArray(localMouse)) {
        cancelTooltip(entity, true);
        state.lastLocalPos = null;
        return;
    }

    const prevPos = state.lastLocalPos;
    state.lastLocalPos = [...localMouse];
    if (state.lastRegionKey !== regionKey) {
        state.lastRegionKey = regionKey;
        bumpTooltipMoveToken(entity);
        cancelTooltip(entity, false);
    }
    if (!prevPos) {
        bumpTooltipMoveToken(entity);
    } else {
        const dx = localMouse[0] - prevPos[0];
        const dy = localMouse[1] - prevPos[1];
        if (Math.hypot(dx, dy) > TOOLTIP_MOVE_THRESHOLD) {
            bumpTooltipMoveToken(entity);
            cancelTooltip(entity, false);
        }
    }

    if (!regionKey) {
        cancelTooltip(entity, false);
        return;
    }

    const reg = entity.layout?.regions?.[regionKey];
    const tooltipText = String(reg?.toolTip || "").trim();
    if (!tooltipText) {
        cancelTooltip(entity, false);
        return;
    }

    if (state.pendingKey && state.pendingKey !== regionKey) {
        cancelTooltip(entity, false);
    }

    scheduleTooltip(entity, regionKey, tooltipText);
}

export function clearEntityTooltip(entity, closeVisible = true) {
    const state = getTooltipState(entity);
    if (!state) return;
    state.lastLocalPos = null;
    bumpTooltipMoveToken(entity);
    cancelTooltip(entity, closeVisible);
}

function playRegionSound(region) {
    const soundKey = region?.playSound;
    if (!soundKey || window.DERP_GLOBAL_SETTINGS?.playSound === false) return;
    if (SOUND_INDEX?.[soundKey]) SOUND_INDEX[soundKey]();
}

export function drawDeckPreviewGlobal(ctx) {
    getDeckEngine().drawPreview(ctx);
}

function getOrCreateBgCache(entity, width, height) {
    if (!entity) return null;
    if (!entity._derpBgCache) {
        const canvas = document.createElement("canvas");
        const bgCtx = canvas.getContext("2d");
        entity._derpBgCache = { canvas, ctx: bgCtx, key: "", pad: 2 };
    }
    const cache = entity._derpBgCache;
    if (!cache.ctx) return null;
    const pad = cache.pad || 0;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const targetW = width + pad * 2;
    const targetH = height + pad * 2;
    const pixelW = Math.max(1, Math.round(targetW * ratio));
    const pixelH = Math.max(1, Math.round(targetH * ratio));
    if (cache.canvas.width !== pixelW) cache.canvas.width = pixelW;
    if (cache.canvas.height !== pixelH) cache.canvas.height = pixelH;
    cache.ratio = ratio;
    return cache;
}

function getPaintFingerprint(paint) {
    if (!paint) return "none";
    const corners = Array.isArray(paint.corners) ? paint.corners.join(",") : "";
    const border = paint.border ? JSON.stringify(paint.border) : "";
    const shadow = paint.shadow ? JSON.stringify(paint.shadow) : "";
    const glow = paint.glow ? JSON.stringify(paint.glow) : "";
    return `${paint.fill || ""}|${corners}|${border}|${shadow}|${glow}`;
}

function hasRoundedOrFx(paint) {
    if (!paint) return false;
    const corners = Array.isArray(paint.corners)
        ? paint.corners.some(v => Number(v) > 0)
        : Number(paint.corners || 0) > 0;
    return corners || !!paint.shadow || !!paint.glow;
}

function applyCornerOverride(corners, override) {
    if (!override) return corners;
    const base = Array.isArray(corners) ? [...corners] : [8, 8, 8, 8];
    for (let i = 0; i < 4; i++) {
        if (override[i] !== null && override[i] !== undefined) base[i] = override[i];
    }
    return base;
}

function applyCollapsedCornerCap(paint, isCollapsed) {
    if (!paint || !isCollapsed) return paint;
    const capCorner = (value) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return 0;
        const mag = Math.min(Math.abs(num), COLLAPSED_NODE_MAX_CORNER);
        return num < 0 ? -mag : mag;
    };
    const corners = Array.isArray(paint.corners)
        ? paint.corners.slice(0, 4).map(capCorner)
        : capCorner(paint.corners ?? 0);
    return { ...paint, corners };
}

/**
 * loadDerpLocale: Centralized loader for the framework.
 * Fetches JSON from /locales/, handles short-code mapping (en -> en-US), and triggers a global reflow.
 */
export async function loadDerpLocale(langCode = "en-US") {
    try {
        if (!window.xcpDerpLocales) {
            const listRes = await fetch("/xcp/list/locales");
            const listData = await listRes.json();
            if (listData.items) window.xcpDerpLocales = listData.items;
        }

        let target = langCode;
        if (window.xcpDerpLocales && !window.xcpDerpLocales.includes(target)) {
            const match = window.xcpDerpLocales.find(l => l.startsWith(target + "-") || l === target);
            if (match) target = match;
        }

        const response = await fetch(`/xcp/load/locales?name=${target}`);
        if (!response.ok) {
            if (target !== "en-US") return loadDerpLocale("en-US");
            throw new Error("Base locale en-US not found.");
        }

        const result = await response.json();
        if (result.data) {
            window.xcpDerpLocaleData = result.data;
            window.xcpDerpActiveLocale = target;
            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(node => {
                    if (!(node.isFathaNode || node.isUncleNode)) return;
                    if (typeof node.onThemeUpdate === "function") {
                        node.onThemeUpdate(window.xcpDerpThemeConfig);
                    } else if (node.requestDerpSync) {
                        node.requestDerpSync();
                    }
                });
            }
            if (window.xcpActiveBastas) {
                window.xcpActiveBastas.forEach(basta => {
                    if (!basta || basta.isClosing) return;
                    if (typeof basta.onThemeUpdate === "function") {
                        basta.onThemeUpdate(window.xcpDerpThemeConfig);
                    } else {
                        if (typeof basta.requestDerpSync === "function") {
                            basta.requestDerpSync();
                        } else if (typeof basta.setDirtyCanvas === "function") {
                            basta.setDirtyCanvas(true, true);
                        }
                    }
                });
            }
            if (app.canvas) app.canvas.setDirty(true, true);
        }
    } catch (e) {
        console.error(`❌ [xcpDerp] Localization Load Error:`, e);
    }
}

/**
 * loadDerpPalette: Fetches the active palette and triggers a global reflow.
 */
export async function loadDerpPalette(paletteName = "Derp_Default_v01") {
    return loadDerpPaletteImpl(paletteName);
}

// --- ANIMATION TUNABLES ---
export const ANIM_SELECTION_PULSE = true;

function debugPinnedCollapse(label, node, extra = {}) {
    return;
}

function debugPinnedDraw(label, node, extra = {}) {
    return;
}

export function settleDerpSizeBeforeDraw(entity, options = {}) {
    return settleDerpSizeBeforeDrawImpl(entity, options, {
        getDerpVars,
        animateDerpSize,
    });
}

function settleCollapseSizeBeforeDraw(entity) {
    return settleDerpSizeBeforeDraw(entity, {
        forceAutoHeight: entity?.properties?.contentCollapsed !== true && entity?.properties?.autoHeight !== false,
    });
}

export function animateDerpSize(node, targetW, targetH, useAnim, options = {}) {
    return animateDerpSizeImpl(node, targetW, targetH, useAnim, options, {
        requestSyncFallback: handleDerpRequestSync,
    });
}

export function shouldPreserveVerticalDeckWidth(node) {
    const graph = app.graph || node?.graph || null;
    if (!graph || !node) return false;
    return shouldPreserveDockWidth(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function shouldPreserveHorizontalDeckHeight(node) {
    const graph = app.graph || node?.graph || null;
    if (!graph || !node) return false;
    return shouldPreserveDockHeight(getDockGroupAxisFromMembers(getDeckMembers(node, graph)));
}

export function resolveDerpRuntimeSize(node, measured, vars = {}) {
    return resolveDerpRuntimeSizeImpl(node, measured, vars);
}

export function resolveHorizontalDeckSharedHeight(node) {
    return resolveHorizontalDeckSharedHeightImpl(node, { getDerpVars });
}

export function syncHorizontalDeckHeight(node, targetHeight = 0) {
    const graph = app.graph || node?.graph || null;
    return syncHorizontalDeckHeightForGraph(node, graph, targetHeight);
}

export const getDerpVars = (node) => {
    let tLayout = [4, 2, 2, 2, 2, 4, 2, 4];
    const cfg = window.xcpDerpThemeConfig;
    const safeNode = node || { properties: {} };

    const playSound = window.DERP_GLOBAL_SETTINGS?.playSound ?? true;
    const useAnimation = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;

    if (cfg) {
        const themes = cfg.customThemes || cfg.themes || {};
        const tName = safeNode.properties?.selectedTheme || safeNode.properties?.selectedThemeName || safeNode._selectedThemeName || cfg.activeTheme || "Template_Standard_v02";
        const target = themes[tName];
        if (target && Array.isArray(target._layout)) tLayout = target._layout;
    }

    const getV = (prop, i1, i2, d1, d2) => {
        if (tLayout) return [tLayout[i1] ?? d1, tLayout[i2] ?? d2];
        return [d1, d2];
    };

    const m = getV("margin", 0, 1, 4, 2);
    const s = getV("spacing", 2, 3, 2, 2);
    const o = getV("offset", 4, 5, 2, 4);
    const p = getV("padding", 6, 7, 2, 4);

    // ZERO-INFERENCE OPTIMIZATION: Precision Jitter Lock (toFixed 2)
    const lock = (v) => Number(v.toFixed(2));
    return {
        mW: lock(m[0]), mH: lock(m[1]), sW: lock(s[0]), sH: lock(s[1]),
        oX: lock(o[0]), oY: lock((safeNode.properties?.drawHeader === false) ? Math.max(o[1], 6) : o[1]),
        pW: lock(p[0]), pH: lock(p[1]),
        playSound,
        useAnimation,
        SNAP: 10,
        MIN_FOOTER_H: 6,
        collapseToMinWidth: true,
        autoWidth: safeNode.properties?.autoWidth !== false,
        autoHeight: safeNode.properties?.autoHeight !== false,
    };
};

export function handleDerpRequestSync(entity) {
    // ZERO-INFERENCE GATING: Prevent infinite dirty-canvas layout thrashing loops within a single frame
    if (app.canvas && entity._lastSyncFrame === app.canvas.frame) return;
    if (app.canvas) entity._lastSyncFrame = app.canvas.frame;

    entity._forceSync = true;
    if (sysPanel.isVisible && sysPanel.hostNode?.id === entity.id) {
        sysPanel._layoutDirty = true;
    }
    if (entity.setDirtyCanvas) entity.setDirtyCanvas(true, true);
}

export function handleDerpComputeSize(entity, out, minWidth = 100) {
    return handleDerpComputeSizeImpl(entity, out, minWidth);
}

export function handleDerpCollapse(entity, force) {
    return handleDerpCollapseImpl(entity, force, {
        getDerpVars,
        animateDerpSize,
        requestSyncFallback: handleDerpRequestSync,
        settleDerpSizeBeforeDraw,
        resolveHorizontalDeckSharedHeight,
        syncHorizontalDeckHeight,
        closeSysPanel: (target) => {
            if (sysPanel.isVisible && sysPanel.hostNode?.id === target.id) {
                closeDerpSysPanel();
            }
        },
    });
}

export function handleHorizontalDeckTitleToggle(entity) {
    return handleHorizontalDeckTitleToggleImpl(entity, {
        requestSyncFallback: handleDerpRequestSync,
        settleDerpSizeBeforeDraw,
        resolveHorizontalDeckSharedHeight,
        syncHorizontalDeckHeight,
    });
}

function findHitRegion(layout, localMouse, options = {}) {
    if (!layout || !layout.regions) return null;
    const { allowDisabledDrag = false } = options;

    const isInsideClipAncestors = (reg) => {
        let current = reg?.parentKey ? layout.regions[reg.parentKey] : null;
        while (current) {
            if ((current.type === UI_TYPES.IMAGE_HTML || current.clipChildren === true) && !layout.hitTest(localMouse, current)) {
                return false;
            }
            current = current.parentKey ? layout.regions[current.parentKey] : null;
        }
        return true;
    };

    const regionEntries = Object.entries(layout.regions).reverse();
    for (const [key, reg] of regionEntries) {
        if (reg.isSpacing || (!reg.type && !reg.onPress && !reg.onClick && !reg.onDblClick && !reg.hoverEffect)) continue;
        const isInteractive = reg.onPress || reg.onClick || reg.onDblClick || reg.hoverEffect || reg.onChange ||
            reg.type === UI_TYPES.DROPDOWN_DERP || reg.type === UI_TYPES.DROPDOWN ||
            reg.type === UI_TYPES.BUTTON || reg.type === UI_TYPES.ICONBUTTON ||
            reg.type === UI_TYPES.SLIDER || reg.type === UI_TYPES.EDITOR ||
            reg.type === UI_TYPES.FILEBROWSER || reg.type === UI_TYPES.TOGGLE ||
            reg.type === UI_TYPES.TOGGLE_V2 || reg.type === UI_TYPES.TRIGGER;
        if (!isInteractive) continue;

        const isDisabled = reg.state === "DIS";
        const allowDisabledInteraction = reg.allowOpenWhenDisabled === true;
        if (isDisabled && !allowDisabledInteraction && !(allowDisabledDrag && reg.allowDragWhenDisabled)) continue;
        if (!(reg.hitTest ? reg.hitTest(localMouse) : layout.hitTest(localMouse, reg))) continue;
        if (!isInsideClipAncestors(reg)) continue;

        if (isDisabled && allowDisabledDrag && reg.dragProxyKey) {
            const proxyReg = layout.regions[reg.dragProxyKey];
            if (proxyReg) return { key: reg.dragProxyKey, reg: proxyReg, sourceKey: key, sourceReg: reg };
        }

        return { key, reg };
    }
    return null;
}

function isSystemButtonHit(entity, localMouse, scale) {
    const sysBtn = entity.layout?.regions?.systemBtn;
    return !!(sysBtn && entity.layout.hitTest(localMouse, sysBtn, Math.max(8, 8 / scale)));
}

function handleShieldDragStart(entity, data, localMouse, scale, deckEngine) {
    entity._startPos = [...(entity.pos || [0, 0])];
    entity._startSize = [...(entity.size || [0, 0])];
    entity._deckDragAltActive = !!data.originalEvent?.altKey;

    if (isSystemButtonHit(entity, localMouse, scale)) {
        entity._pressedRegionKey = "systemBtn";
        return true;
    }

    const hit = findHitRegion(entity.layout, localMouse, { allowDisabledDrag: true });
    if (hit && !hit.reg.noDragLock) {
        entity._pressedRegionKey = hit.key;
        entity._pressedRegionType = hit.reg?.type || null;
        if (hit.reg.onDragStart) hit.reg.onDragStart(data.originalEvent, data);
        entity._derpAwakeFrames = 15;
        entity.setDirtyCanvas(true);
        return true;
    }

    beginDockDrag(entity, deckEngine);
    return false;
}

function handleShieldDrag(entity, data, scale, deckEngine) {
    if (entity._pressedRegionKey) {
        const reg = entity.layout?.regions[entity._pressedRegionKey];
        if (reg && reg.onDrag) reg.onDrag(data.originalEvent, data);
        return false;
    }

    updateDockDrag(entity, deckEngine, data, scale);
    return false;
}

function handlePressedRegionActivation(entity, key, data) {
    if (key === "systemBtn") {
        toggleDerpSysPanel(entity);
        if (app.graph && app.graph.change) app.graph.change();
        return true;
    }

    const reg = entity.layout?.regions[key];
    if (!reg) return null;

    if (reg.type === UI_TYPES.TOGGLE || reg.type === UI_TYPES.TOGGLE_V2) {
        reg.value = !reg.value;

        if (key === "togglePlaySound") {
            app.ui.settings.setSettingValue("Derp.PlaySound", reg.value);
        }
        if (key === "toggleUseAnimation") {
            app.ui.settings.setSettingValue("Derp.UseAnimation", reg.value);
        }

        if (reg.onChange) reg.onChange(reg.value, data.originalEvent, data);
    }

    if (reg.onPress) {
        reg.onPress(data.originalEvent, data);
    } else if (reg.onClick) {
        reg.onClick(data.originalEvent, data);
    }
    entity.setDirtyCanvas(true);
    if (app.graph && app.graph.change) app.graph.change();
    return true;
}

function handleVerticalHeaderClick(entity, localMouse, data) {
    const header = entity.layout?.regions?.headerRegion;
    const graph = app.graph || entity.graph || null;
    const headerCollapseEnabled = window.DERP_GLOBAL_SETTINGS?.verticalDockHeaderCollapse ?? true;
    const isVerticalDockHeaderHit = headerCollapseEnabled && header && graph && isLinearDeckGroup(entity, graph, "vertical") && entity.layout.hitTest(localMouse, header);
    if (!isVerticalDockHeaderHit) return false;

    const shiftKey = data?.originalEvent?.shiftKey;
    if (shiftKey) {
        const wasCollapsed = !!entity.properties?.contentCollapsed;
        const members = getDeckMembers(entity, graph);
        const soundKey = wasCollapsed ? "collapseoff" : "collapseon";
        if (SOUND_INDEX?.[soundKey]) SOUND_INDEX[soundKey]();
        if (wasCollapsed) {
            members.forEach(member => {
                if (member !== entity && member.properties?.contentCollapsed !== true) {
                    if (typeof member.collapse === "function") member.collapse(true);
                    else member.properties.contentCollapsed = true;
                    member.setDirtyCanvas?.(true, true);
                }
            });
            if (typeof entity.collapse === "function") entity.collapse(false);
            else entity.properties.contentCollapsed = false;
            entity._derpAwakeFrames = Math.max(Number(entity._derpAwakeFrames || 0), 8);
        } else {
            if (typeof entity.collapse === "function") entity.collapse(true);
            else entity.properties.contentCollapsed = true;
        }
    } else {
        // Plain left-click no longer toggles — use shift+left-click or right-click
        return false;
    }
    entity.setDirtyCanvas(true, true);
    if (app.graph && app.graph.change) app.graph.change();
    return true;
}

function handleShieldClickOrPointerUp(entity, type, data, localMouse) {
    if (type === "click" && entity._suppressClickAfterDrag) {
        entity._suppressClickAfterDrag = false;
        entity._pressedRegionKey = null;
        return true;
    }

    const key = entity._pressedRegionKey;
    entity._pressedRegionKey = null;
    entity._pressedRegionType = null;

    if (key === "systemBtn") {
        if (type === "click") {
            toggleDerpSysPanel(entity);
            if (app.graph && app.graph.change) app.graph.change();
        }
        return true;
    }

    const handledRegion = handlePressedRegionActivation(entity, key, data);
    if (handledRegion !== null) return handledRegion;

    return handleVerticalHeaderClick(entity, localMouse, data);
}

function handleHeaderRenameDblClick(entity, localMouse) {
    const header = entity.layout?.regions?.headerRegion;
    if (!(header && entity.layout.hitTest(localMouse, header) && !entity.isSystemPanel && (entity.isFathaNode || entity.isUncleNode))) {
        return false;
    }

    const currentTitle = entity.titleLabel || entity.type || "Node";
    const newTitle = prompt("Rename Node:", currentTitle);

    if (newTitle !== null && newTitle !== currentTitle) {
        entity.titleLabel = newTitle;
        entity.properties.titleLabel = newTitle;
        if (typeof entity.syncDerpOutputs === "function") {
            entity.syncDerpOutputs();
        }
        if (typeof entity.refreshNodeLayoutMap === "function") {
            entity.refreshNodeLayoutMap();
        }
        entity.setDirtyCanvas(true, true);
        if (app.graph && app.graph.change) app.graph.change();
    }
    return true;
}

function handleShieldDblClick(entity, data, localMouse) {
    const hit = findHitRegion(entity.layout, localMouse);

    if (hit && hit.reg.onDblClick) {
        hit.reg.onDblClick(data.originalEvent, hit.reg, data);
        if (app.graph && app.graph.change) app.graph.change();
        return true;
    }

    return handleHeaderRenameDblClick(entity, localMouse);
}

function handleShieldHover(entity, localMouse, scale) {
    const sliderDragActive = entity._pressedRegionType === UI_TYPES.SLIDER && !!entity._pressedRegionKey;

    if (sliderDragActive) {
        const lockedKey = entity._pressedRegionKey;
        if (entity.interactionShield) {
            entity.interactionShield.style.cursor = "pointer";
        }
        if (entity._hoveredRegionKey !== lockedKey) {
            entity._hoveredRegionKey = lockedKey;
            entity._derpAwakeFrames = 1;
            if (typeof entity.setDirtyCanvas === "function") entity.setDirtyCanvas(true, false);
            if (window.app && window.app.canvas) window.app.canvas.setDirty(true, false);
        }
        handleTooltipHover(entity, lockedKey, localMouse);
        return;
    }

    const isOverSys = isSystemButtonHit(entity, localMouse, scale);
    const hit = findHitRegion(entity.layout, localMouse);
    const hitType = hit?.reg?.type;
    const isPickerRegion = hitType === UI_TYPES.DROPDOWN_DERP || hitType === UI_TYPES.DROPDOWN || hitType === UI_TYPES.FILEBROWSER;

    if (entity.interactionShield) {
        entity.interactionShield.style.cursor = (hit || isOverSys) ? "pointer" : "default";
    }

    const nextKey = isOverSys ? "systemBtn" : (hit ? hit.key : null);
    if (entity._hoveredRegionKey !== nextKey) {
        entity._hoveredRegionKey = nextKey;
        entity._derpAwakeFrames = (entity?.properties?.optimizeHoverDirty !== false && !isPickerRegion) ? 1 : 5;
        const isBasta = entity?.properties?.bastaSingleton !== undefined || entity?.properties?.bastaMovalbe !== undefined;
        const useHoverFastPath = isBasta || ((entity?.properties?.optimizeHoverNoSync !== false) && !isPickerRegion);
        if (!useHoverFastPath) {
            entity._forceSync = true;
            if (typeof entity.requestDerpSync === "function") entity.requestDerpSync();
        }
        if (entity?.properties?.optimizeHoverDirty !== false && !isPickerRegion) {
            const frame = app.canvas?.frame;
            if (frame === undefined || entity._lastHoverDirtyFrame !== frame) {
                entity._lastHoverDirtyFrame = frame;
                if (typeof entity.setDirtyCanvas === "function") entity.setDirtyCanvas(true, false);
                if (window.app && window.app.canvas) window.app.canvas.setDirty(true, false);
            }
        } else {
            if (typeof entity.setDirtyCanvas === "function") entity.setDirtyCanvas(true, true);
            if (window.app && window.app.canvas) window.app.canvas.setDirty(true, true);
        }
    }
    handleTooltipHover(entity, nextKey, localMouse);
}

function handleShieldDragEnd(entity, data, deckEngine) {
    entity._pressedRegionType = null;
    endDockDrag(entity, deckEngine, data);
}

export function handleShieldInteraction(entity, type, data = {}) {
    const scale = app.canvas.ds.scale;
    const localMouse = [data.localX || 0, data.localY || 0];
    const deckEngine = getDeckEngine();
    if (type === "dragStart") {
        clearEntityTooltip(entity, true);
        return handleShieldDragStart(entity, data, localMouse, scale, deckEngine);
    } else if (type === "resize" && !entity.isSystemPanel) {
        clearEntityTooltip(entity, true);
        handleNodeResize(entity, data, scale);
    } else if (type === "drag" && !entity.isSystemPanel) {
        clearEntityTooltip(entity, true);
        return handleShieldDrag(entity, data, scale, deckEngine);
    } else if (type === "click" || type === "pointerup") {
        clearEntityTooltip(entity, true);
        return handleShieldClickOrPointerUp(entity, type, data, localMouse);
    } else if (type === "dblclick") {
        clearEntityTooltip(entity, true);
        return handleShieldDblClick(entity, data, localMouse);
    } else if (type === "hover") {
        handleShieldHover(entity, localMouse, scale);
    } else if (type === "dragEnd") {
        clearEntityTooltip(entity, true);
        handleShieldDragEnd(entity, data, deckEngine);
    }
}

export function handleDrawCTX(entity, ctx, overlayPass = false) {
    debugPinnedDraw(overlayPass ? "draw-overlay-enter" : "draw-base-enter", entity, {
        overlayPass,
        bgCacheKey: entity?._derpBgCache?.key || null,
        compCacheKeys: entity?._compDataCache ? Object.keys(entity._compDataCache) : [],
        layoutCacheKey: entity?.layout?._lastCacheKey || null,
    });
    const isBypassed = entity.mode === 4 || entity.mode === 2 || entity._derpSpoofedBypass;
    const isSelected = entity._xcpTrueSelected !== undefined ? entity._xcpTrueSelected : !!(app.canvas.selected_nodes && app.canvas.selected_nodes[entity.id]);

    if (!overlayPass) {
        const header = entity.layout?.regions?.headerRegion;
        const isCollapsed = !!entity.properties?.contentCollapsed;
        const backgroundPaintKey = entity.properties?.bastaBackgroundKey || "canvas";
        const paintOFF = resolvePaintData(entity, backgroundPaintKey, isBypassed ? "_DIS" : "") || resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "");
        const paintON = resolvePaintData(entity, backgroundPaintKey, isBypassed ? "_DIS" : "_ON") || resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "_ON");
        const cornerOverride = getDeckCornerOverride(entity, app.graph || entity.graph || null);
        const applyNodeCornerOverride = (paint) => paint
            ? { ...paint, corners: applyCornerOverride(paint.corners || [8, 8, 8, 8], cornerOverride) }
            : paint;
        const nodeWantsCache = entity?.properties?.optimizeStaticBgCache !== false;
        // Quality guard: rounded corners / shadow / glow are prone to cache resample artifacts.
        // In those cases prefer direct paint to preserve smooth corners.
        const useStaticBgCache = nodeWantsCache && !hasRoundedOrFx(paintOFF) && !hasRoundedOrFx(paintON);

        const renderBaseBackground = (targetCtx, options = {}) => {
            const bodyPaint = options.bodyPaint || paintOFF;
            const headerPaletteState = options.headerPaletteState || (isBypassed ? "_DIS" : isSelected ? "_ON" : "_OFF");
            const headerEffectPaint = options.headerEffectPaint || bodyPaint;

            if (header && bodyPaint && paintON) {
                const cOFF = applyCornerOverride(bodyPaint.corners || [8, 8, 8, 8], cornerOverride);
                const cON = applyCornerOverride((options.cornerPaint || paintON).corners || [8, 8, 8, 8], cornerOverride);

                if (isCollapsed) {
                    const collapsedPaint = applyCollapsedCornerCap(
                        applyNodeHeaderPalette(entity, { ...bodyPaint, corners: [cON[0], cON[1], cOFF[2], cOFF[3]] }, headerPaletteState, headerEffectPaint, getPaletteCache),
                        isCollapsed
                    );
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: collapsedPaint.fill, paintData: collapsedPaint });
                } else {
                    const splitY = header.y + header.h + (header.margin?.length === 4 ? header.margin[3] : (header.margin?.[1] || 0));
                    const headerBasePaint = { ...bodyPaint, corners: [cON[0], cON[1], 0, 0], border: null, shadow: null, glow: null };
                    const headerPaint = applyNodeHeaderPalette(entity, headerBasePaint, headerPaletteState, headerEffectPaint, getPaletteCache);
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: splitY, color: headerPaint.fill, paintData: headerPaint });

                    const contentPaint = { ...bodyPaint, corners: [0, 0, cOFF[2], cOFF[3]], border: null, shadow: null, glow: null };
                    masterPainter(targetCtx, { posX: 0, posY: splitY, width: entity.size[0], height: entity.size[1] - splitY, color: bodyPaint.fill, paintData: contentPaint });

                    const silhouettePaint = { ...bodyPaint, corners: [cON[0], cON[1], cOFF[2], cOFF[3]] };
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: "transparent", paintData: silhouettePaint });
                }
            } else {
                const paint = applyCollapsedCornerCap(
                    applyNodeCornerOverride(options.bodyPaint || (isSelected ? paintON : paintOFF)),
                    isCollapsed
                );
                if (paint) {
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paint.fill, paintData: paint });
                }
            }
        };

        if (isSelected && !isBypassed && ANIM_SELECTION_PULSE) {
            // --- SELECTION PULSE ---
            if (paintOFF) {
                if (header && paintON) {
                    renderBaseBackground(ctx, { bodyPaint: paintOFF, headerPaletteState: "_OFF", headerEffectPaint: paintOFF });
                } else if (useStaticBgCache) {
                    const bw = Math.max(1, Math.round(entity.size[0]));
                    const bh = Math.max(1, Math.round(entity.size[1]));
                    const cache = getOrCreateBgCache(entity, bw, bh);
                    const cacheKey = `pulse|${bw}|${bh}|${isBypassed}|${entity.mode}|${entity._currentThemeName || ""}|${backgroundPaintKey}|${getPaintFingerprint(paintOFF)}`;
                    if (cache) {
                        const pad = cache.pad || 0;
                        const ratio = cache.ratio || 1;
                        if (cache.key !== cacheKey) {
                            cache.key = cacheKey;
                            cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
                            cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
                            cache.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                            const cachedPaintOFF = applyCollapsedCornerCap(applyNodeCornerOverride(paintOFF), isCollapsed);
                            masterPainter(cache.ctx, { posX: pad, posY: pad, width: bw, height: bh, color: cachedPaintOFF.fill, paintData: cachedPaintOFF });
                        }
                        ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, -pad, -pad, bw + pad * 2, bh + pad * 2);
                    } else {
                        const directPaintOFF = applyCollapsedCornerCap(applyNodeCornerOverride(paintOFF), isCollapsed);
                        masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: directPaintOFF.fill, paintData: directPaintOFF });
                    }
                } else {
                    const directPaintOFF = applyCollapsedCornerCap(applyNodeCornerOverride(paintOFF), isCollapsed);
                    masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: directPaintOFF.fill, paintData: directPaintOFF });
                }
            }
            if (paintON) {
                const pulseAlpha = getPulseAlpha(0.003);
                ctx.save();
                ctx.globalAlpha = pulseAlpha;
                if (header) {
                    renderBaseBackground(ctx, { bodyPaint: paintON, headerPaletteState: "_ON", headerEffectPaint: paintON, cornerPaint: paintON });
                } else {
                    const directPaintON = applyCollapsedCornerCap(applyNodeCornerOverride(paintON), isCollapsed);
                    masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: directPaintON.fill, paintData: directPaintON });
                }
                ctx.restore();
            }
            entity.setDirtyCanvas(true, false);
        } else {
            if (useStaticBgCache) {
                const bw = Math.max(1, Math.round(entity.size[0]));
                const bh = Math.max(1, Math.round(entity.size[1]));
                const cache = getOrCreateBgCache(entity, bw, bh);
                const cacheKey = [
                    "base",
                    bw,
                    bh,
                    isBypassed,
                    isCollapsed,
                    entity.mode,
                    entity._currentThemeName || "",
                    isSelected ? "selected" : "normal",
                    header ? `${header.y}_${header.h}_${header.margin?.join?.("_") || ""}` : "noheader",
                    getNodeHeaderPaletteFingerprint(entity, getPaletteCache),
                    cornerOverride ? cornerOverride.join("_") : "nocorners",
                    backgroundPaintKey,
                    getPaintFingerprint(paintOFF),
                    getPaintFingerprint(paintON)
                ].join("|");
                if (cache) {
                    const pad = cache.pad || 0;
                    const ratio = cache.ratio || 1;
                    if (cache.key !== cacheKey) {
                        cache.key = cacheKey;
                        cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
                        cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
                        cache.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                        cache.ctx.save();
                        cache.ctx.translate(pad, pad);
                        renderBaseBackground(cache.ctx);
                        cache.ctx.restore();
                    }
                    ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, -pad, -pad, bw + pad * 2, bh + pad * 2);
                } else {
                    renderBaseBackground(ctx);
                }
            } else {
                renderBaseBackground(ctx);
            }
        }
    }
    if (!overlayPass) {
        const sysBtn = entity.layout?.regions?.systemBtn;
        if (sysBtn && !entity.isSystemPanel) {
            const isActive = sysPanel.isVisible && sysPanel.hostNode?.id === entity.id;
            COMPONENT_BLUEPRINTS[UI_TYPES.ICONBUTTON].sync(ctx, entity, {
                ...sysBtn, geometry: { x: sysBtn.x, y: sysBtn.y, w: sysBtn.w, h: sysBtn.h },
                icon: isActive ? "uparrow" : "downarrow",
                state: (entity._hoveredRegionKey === "systemBtn" || isActive) ? "ON" : "OFF",
                corners: [2, 2, 0, 0]
            });
        }
    }
}

export function handleThemeUpdate(node, config) {
    return handleThemeUpdateImpl(node, config, {
        loadDerpPalette,
    });
}

export function handleInitDerpGlobalListener(app) {
    return handleInitDerpGlobalListenerImpl(app, {
        loadDerpLocale,
        loadDerpPalette,
        hydrateDerpBackgroundSetting,
    });
}
