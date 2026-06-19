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
    getPinnedVerticalDeckAnchor,
    restorePinnedVerticalDeckAnchor,
    resolveDerpRuntimeSizeImpl,
    resolveHorizontalDeckSharedHeightImpl,
    handleDerpComputeSizeImpl,
    handleDerpCollapseImpl,
    handleHorizontalDeckTitleToggleImpl,
} from "./dockResize.js";
import { masterDockEngine, getDeckMembers, getDeckCornerOverride, getNodeOnDeckEdge, isDeckPressureSideHorizontalBranchMember, isLinearDeckGroup, normalizeDockedLayout, setDeckNodePos, syncDeckNodeSize, isDeckPressureHub, getDeckPressureHubForNode, getDeckPressureBranchMembers, getDeckPressureBranchSideForNode, getDeckPressureBranchAxis, applyDeckPressureLayout, getDeckPressureSideHorizontalWidthLock, drawSharedResizeSeamGhosts } from "./masterDockEngine.js";
import { getDockGroupAxisFromMembers, getDockNodeHeight, getDockNodeMinWidth, getDockNodeWidth, getSharedDockMinWidth, getSharedDockWidth, shouldPreserveDockHeight, shouldPreserveDockWidth } from "./dockDimensions.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";
import {
    getNodeHeaderPaletteFingerprint,
    getNodeCanvasPaletteFingerprint,
    applyNodeHeaderPalette,
    applyNodeCanvasPalette,
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
import { resolveSystemThemePaint } from "../helpers/fathaSystemTheme.js";
import { isComfyVueNodesMode } from "./fathaNode2Compat.js";

const COLLAPSED_NODE_MAX_CORNER = 5;
const TOOLTIP_DELAY_MS = 650;
const TOOLTIP_DURATION_MS = 0; // 0 = infinite, stays until mouse moves
const TOOLTIP_MOVE_THRESHOLD = 5;
const DERP_BACKGROUND_SETTING_ID = "Derp.BackgroundImage";
const DECK_RESIZE_OPT_NONE = "none";
const DECK_RESIZE_OPT_GHOST = "ghost_layout";
const DECK_RESIZE_OPT_CACHE = "whole_wall_cache";
const DECK_RESIZE_OPT_MODES = new Set([DECK_RESIZE_OPT_NONE, DECK_RESIZE_OPT_GHOST, DECK_RESIZE_OPT_CACHE]);
const DERP_DEFAULT_TITLE_LOCALE_KEYS = [
    "fatha_layout.title_default",
    "derp_latent.title",
    "derp_slider.title",
    "derp_toggle.title",
    "derp_swatch.title",
    "derp_vae_loader.title",
    "derp_sampler_loader.title",
    "derp_scheduler_loader.title",
    "derp_concatenate.title",
    "derp_image_deck.title",
    "derp_lora_stack.title",
    "derp_trigger_wall.title",
    "derp_model_loader.title",
    "derp_diffusion_loader.title",
    "derp_clip_loader.title",
    "derp_prompt_book.title",
    "derp_router.title",
];
const derpDefaultTitleValues = new Set(["Node", "Virtual Node", "Derp Nodes"]);
const derpDefaultTitleValuesByKey = new Map();
let derpDefaultTitleRegistryPromise = null;
const deckFrameCache = new Map();
const deckNodeFrameCache = new Map();
let deckCacheFrame = null;
const deckPressureFrameCache = new Map();
const deckPressureStableCache = new Map();

function normalizeDerpLocaleKey(key) {
    return String(key || "").replace(/^\$/, "");
}

function getLocalePathValue(localeData, key) {
    const path = normalizeDerpLocaleKey(key).split(".").filter(Boolean);
    let target = localeData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return undefined;
    }
    return typeof target === "string" ? target : undefined;
}

function registerDefaultTitleValue(key, value) {
    if (typeof value !== "string" || value.trim() === "") return;
    const normalizedKey = normalizeDerpLocaleKey(key);
    derpDefaultTitleValues.add(value);
    if (normalizedKey) {
        if (!derpDefaultTitleValuesByKey.has(normalizedKey)) {
            derpDefaultTitleValuesByKey.set(normalizedKey, new Set());
        }
        derpDefaultTitleValuesByKey.get(normalizedKey).add(value);
    }
}

function registerDerpDefaultTitles(localeData) {
    DERP_DEFAULT_TITLE_LOCALE_KEYS.forEach((key) => registerDefaultTitleValue(key, getLocalePathValue(localeData, key)));
}

async function ensureDerpDefaultTitleRegistry(activeLocale, activeData) {
    registerDerpDefaultTitles(activeData);
    if (derpDefaultTitleRegistryPromise) return derpDefaultTitleRegistryPromise;

    derpDefaultTitleRegistryPromise = (async () => {
        const locales = Array.isArray(window.xcpDerpLocales) ? window.xcpDerpLocales : [];
        await Promise.all(locales.map(async (localeName) => {
            try {
                if (localeName === activeLocale) return;
                const response = await fetch(`/xcp/load/locales?name=${encodeURIComponent(localeName)}`);
                if (!response.ok) return;
                const result = await response.json();
                if (result?.data) registerDerpDefaultTitles(result.data);
            } catch (e) {
            }
        }));
    })();

    return derpDefaultTitleRegistryPromise;
}

function inferDerpTitleLocaleKey(entity) {
    const raw = [entity?.type, entity?.comfyClass, entity?.constructor?.comfyClass, entity?.constructor?.type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    const patterns = [
        ["concatenate", "derp_concatenate.title"],
        ["signalout", "derp_router.title"],
        ["router", "derp_router.title"],
        ["imagedeck", "derp_image_deck.title"],
        ["lorastack", "derp_lora_stack.title"],
        ["triggerwall", "derp_trigger_wall.title"],
        ["modelloader", "derp_model_loader.title"],
        ["diffusionloader", "derp_diffusion_loader.title"],
        ["cliploader", "derp_clip_loader.title"],
        ["vaeloader", "derp_vae_loader.title"],
        ["samplerloader", "derp_sampler_loader.title"],
        ["schedulerloader", "derp_scheduler_loader.title"],
        ["promptbook", "derp_prompt_book.title"],
        ["latent", "derp_latent.title"],
        ["slider", "derp_slider.title"],
        ["toggle", "derp_toggle.title"],
        ["swatch", "derp_swatch.title"],
    ];
    return patterns.find(([needle]) => raw.includes(needle))?.[1] || null;
}

export function isDerpDefaultLocalizedTitle(value, key = null) {
    if (typeof value !== "string" || value.trim() === "") return true;
    if (key && derpDefaultTitleValuesByKey.get(normalizeDerpLocaleKey(key))?.has(value)) return true;
    return derpDefaultTitleValues.has(value);
}

export function syncDerpLocalizedDefaultTitle(entity, titleKey = null, fallback = null) {
    if (!entity?.properties || entity.properties._derpCustomTitle === true) return false;
    const key = normalizeDerpLocaleKey(titleKey || entity.properties._derpTitleLocaleKey || inferDerpTitleLocaleKey(entity));
    if (!key) return false;

    const localizedTitle = getLocalePathValue(window.xcpDerpLocaleData, key) || fallback;
    if (typeof localizedTitle !== "string" || localizedTitle.trim() === "") return false;
    registerDefaultTitleValue(key, localizedTitle);
    if (fallback) registerDefaultTitleValue(key, fallback);

    const currentTitle = entity.properties.titleLabel || entity.titleLabel || "";
    const previousKey = entity.properties._derpTitleLocaleKey;
    const isDefaultTitle = isDerpDefaultLocalizedTitle(currentTitle, key) ||
        (previousKey && isDerpDefaultLocalizedTitle(currentTitle, previousKey));
    if (!isDefaultTitle) {
        entity.properties._derpCustomTitle = true;
        return false;
    }

    entity.properties._derpTitleLocaleKey = key;
    entity.properties._derpCustomTitle = false;
    if (entity.titleLabel !== localizedTitle || entity.properties.titleLabel !== localizedTitle) {
        entity.titleLabel = localizedTitle;
        entity.properties.titleLabel = localizedTitle;
        return true;
    }
    return false;
}

function getDeckFrameKey(node, members) {
    const frame = Number(app.canvas?.frame) || 0;
    const ids = (Array.isArray(members) ? members : [node])
        .map((member) => Number(member?.id) || 0)
        .sort((a, b) => a - b)
        .join(":");
    return `${frame}:${ids}`;
}

function getDeckGeometrySignature(members = [], value = 0, axis = "horizontal") {
    return (Array.isArray(members) ? members : [])
        .map((member) => [
            member?.id,
            Math.round(Number(member?.pos?.[0]) || 0),
            Math.round(Number(member?.pos?.[1]) || 0),
            Math.round(Number(member?.size?.[0] ?? member?.properties?.nodeSize?.[0]) || 0),
            Math.round(Number(member?.size?.[1] ?? member?.properties?.nodeSize?.[1]) || 0),
            member?.properties?.contentCollapsed === true ? 1 : 0,
        ].join(":"))
        .join("|") + `|${axis === "vertical" ? "w" : "h"}:${Math.round(Number(value) || 0)}`;
}

function isDeckPressureStable(members = []) {
    const now = performance.now?.() || Date.now();
    return Array.isArray(members) && members.every((member) => !(
        member?._forceSync ||
        member?._layoutDirty ||
        member?._isDerpResizing ||
        member?._isDragging ||
        member?._isDeckDragging ||
        Number(member?._derpAwakeFrames || 0) > 0 ||
        Number(member?._deckPressureActiveUntil || 0) > now
    ));
}

function getDeckSkipState(state) {
    if (!state?.members?.length) return null;
    const rootId = state.members
        .map((member) => Number(member?.id) || 0)
        .sort((a, b) => a - b)[0];
    const root = state.members.find((member) => Number(member?.id) === rootId) || state.members[0];
    if (!root) return null;
    if (!root._dockMaintenance) root._dockMaintenance = {};
    return root._dockMaintenance;
}

function isDeckHeightAligned(members = [], height = 0) {
    const targetHeight = Number(height) || 0;
    if (targetHeight <= 0 || !Array.isArray(members) || members.length <= 1) return false;
    const topY = Math.min(...members.map((member) => Number(member?.pos?.[1]) || 0));
    return members.every((member) => {
        const memberHeight = Number(member?.size?.[1] ?? member?.properties?.nodeSize?.[1]) || 0;
        const memberY = Number(member?.pos?.[1]) || 0;
        return Math.abs(memberHeight - targetHeight) < 0.5 && Math.abs(memberY - topY) < 0.5;
    });
}

function isDeckWidthAligned(members = [], width = 0) {
    const targetWidth = Number(width) || 0;
    if (targetWidth <= 0 || !Array.isArray(members) || members.length <= 1) return false;
    const leftX = Math.min(...members.map((member) => Number(member?.pos?.[0]) || 0));
    return members.every((member) => {
        const memberWidth = Number(member?.size?.[0] ?? member?.properties?.nodeSize?.[0]) || 0;
        const memberX = Number(member?.pos?.[0]) || 0;
        return Math.abs(memberWidth - targetWidth) < 0.5 && Math.abs(memberX - leftX) < 0.5;
    });
}

function getHorizontalDeckPositionAnchor(members = []) {
    if (!Array.isArray(members) || members.length <= 1) return null;
    const left = Math.min(...members.map((member) => Number(member?.pos?.[0]) || 0));
    const top = Math.min(...members.map((member) => Number(member?.pos?.[1]) || 0));
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { members: [...members], left, top };
}

function restoreHorizontalDeckPositionAnchor(anchor) {
    if (!anchor?.members?.length) return 0;
    const nextLeft = Math.min(...anchor.members.map((member) => Number(member?.pos?.[0]) || 0));
    const nextTop = Math.min(...anchor.members.map((member) => Number(member?.pos?.[1]) || 0));
    if (!Number.isFinite(nextLeft) || !Number.isFinite(nextTop)) return 0;
    const offsetX = (Number(anchor.left) || 0) - nextLeft;
    const offsetY = (Number(anchor.top) || 0) - nextTop;
    if (offsetX === 0 && offsetY === 0) return 0;
    anchor.members.forEach((member) => {
        if (!member?.pos) return;
        setDeckNodePos(member, (Number(member.pos?.[0]) || 0) + offsetX, (Number(member.pos?.[1]) || 0) + offsetY);
    });
    return Math.max(Math.abs(offsetX), Math.abs(offsetY));
}

function getDeckResizeOptimizationMode() {
    const raw = String(window.DERP_GLOBAL_SETTINGS?.deckResizeOptimization || DECK_RESIZE_OPT_CACHE).trim();
    return DECK_RESIZE_OPT_MODES.has(raw) ? raw : DECK_RESIZE_OPT_CACHE;
}

function setDeckResizeDomHidden(node, hidden) {
    if (!node?._derpDomElements) return;
    if (node._deckResizeDomHidden === hidden) return;
    Object.values(node._derpDomElements).forEach((el) => {
        if (!el?.style) return;
        if (hidden) {
            if (el._deckResizePrevVisibility === undefined) el._deckResizePrevVisibility = el.style.visibility || "";
            el.style.visibility = "hidden";
        } else if (el._deckResizePrevVisibility !== undefined) {
            el.style.visibility = el._deckResizePrevVisibility;
            delete el._deckResizePrevVisibility;
        } else {
            el.style.visibility = "";
        }
    });
    node._deckResizeDomHidden = hidden;
    if (!hidden) delete node._deckResizeDomHidden;
}

function createDeckResizeCanvas(width, height) {
    const safeW = Math.max(1, Math.round(Number(width) || 1));
    const safeH = Math.max(1, Math.round(Number(height) || 1));
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(safeW, safeH);
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = safeW;
        canvas.height = safeH;
        return canvas;
    }
    return null;
}

function captureDeckResizeSnapshot(node) {
    const canvas = app.canvas?.canvas;
    const ds = app.canvas?.ds;
    if (!node || !canvas || !ds) return null;
    const rect = canvas.getBoundingClientRect?.();
    const ratioX = rect?.width ? canvas.width / rect.width : 1;
    const ratioY = rect?.height ? canvas.height / rect.height : 1;
    const scale = Number(ds.scale) || 1;
    const x = (Number(node.pos?.[0]) + Number(ds.offset?.[0] || 0)) * scale * ratioX;
    const y = (Number(node.pos?.[1]) + Number(ds.offset?.[1] || 0)) * scale * ratioY;
    const w = Math.max(1, Number(node.size?.[0] || 1) * scale * ratioX);
    const h = Math.max(1, Number(node.size?.[1] || 1) * scale * ratioY);
    const sx = Math.max(0, Math.floor(x));
    const sy = Math.max(0, Math.floor(y));
    const right = Math.min(canvas.width, Math.ceil(x + w));
    const bottom = Math.min(canvas.height, Math.ceil(y + h));
    const sw = right - sx;
    const sh = bottom - sy;
    if (sw <= 0 || sh <= 0) return null;
    const snapshot = createDeckResizeCanvas(sw, sh);
    const targetCtx = snapshot?.getContext?.("2d");
    if (!snapshot || !targetCtx) return null;
    try {
        targetCtx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    } catch (_) {
        return null;
    }
    return {
        canvas: snapshot,
        width: sw,
        height: sh,
        nodeWidth: Math.max(1, Number(node.size?.[0] || 1)),
        nodeHeight: Math.max(1, Number(node.size?.[1] || 1)),
    };
}

function getDeckResizeHubMembers(hub, graph) {
    if (!isDeckPressureHub(hub) || !graph) return [];
    return getDeckMembers(hub, graph).filter((member) => member && member.id !== hub.id);
}

export function beginDeckResizeOptimization(hub, graph = app.graph || hub?.graph || null) {
    const mode = getDeckResizeOptimizationMode();
    if (mode === DECK_RESIZE_OPT_NONE || !isDeckPressureHub(hub) || !graph) return;
    const members = getDeckResizeHubMembers(hub, graph);
    if (!members.length) return;
    hub._deckResizeOptimizationMode = mode;
    hub._deckResizeOptimizationMembers = members;
    members.forEach((member) => {
        member._deckResizeOptimizationHubId = hub.id;
        member._deckResizeOptimizationMode = mode;
        member._deckResizeSnapshot = mode === DECK_RESIZE_OPT_CACHE ? captureDeckResizeSnapshot(member) : null;
        setDeckResizeDomHidden(member, true);
    });
}

export function endDeckResizeOptimization(hub) {
    const members = Array.isArray(hub?._deckResizeOptimizationMembers) ? hub._deckResizeOptimizationMembers : [];
    members.forEach((member) => {
        if (!member) return;
        setDeckResizeDomHidden(member, false);
        delete member._deckResizeOptimizationHubId;
        delete member._deckResizeOptimizationMode;
        delete member._deckResizeSnapshot;
        member._forceSync = true;
        member._layoutDirty = true;
        if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
        syncDerpShield(member);
    });
    if (hub) {
        delete hub._deckResizeOptimizationMode;
        delete hub._deckResizeOptimizationMembers;
    }
}

function getActiveDeckResizeModeForNode(node) {
    const activeMode = node?._deckResizeOptimizationMode;
    if (!DECK_RESIZE_OPT_MODES.has(activeMode) || activeMode === DECK_RESIZE_OPT_NONE) return null;
    if (getDeckResizeOptimizationMode() === DECK_RESIZE_OPT_NONE) return null;
    const graph = app.graph || node.graph || null;
    const hub = getDeckPressureHubForNode(node, graph);
    if (!hub || hub.id === node.id || hub.id !== node._deckResizeOptimizationHubId || hub._isDerpResizing !== true) return null;
    return activeMode === DECK_RESIZE_OPT_CACHE || activeMode === DECK_RESIZE_OPT_GHOST ? activeMode : null;
}

function drawDeckResizeGhost(node, ctx) {
    const w = Math.max(1, Number(node?.size?.[0] || 1));
    const h = Math.max(1, Number(node?.size?.[1] || 1));
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = node?._bodyPaintData?.fill || "rgba(80, 120, 160, 0.22)";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash([8, 5]);
    ctx.strokeStyle = node?._headerPaintData_ON?.fill || node?._headerPaintData?.fill || "rgba(230, 240, 255, 0.85)";
    ctx.strokeRect(0.5, 0.5, Math.max(1, w - 1), Math.max(1, h - 1));
    ctx.restore();
}

export function drawDeckResizeOptimizedNode(node, ctx) {
    const mode = getActiveDeckResizeModeForNode(node);
    if (!mode || !ctx) {
        if (node?._deckResizeOptimizationMode) setDeckResizeDomHidden(node, false);
        return false;
    }
    setDeckResizeDomHidden(node, true);
    const snapshot = mode === DECK_RESIZE_OPT_CACHE ? node._deckResizeSnapshot : null;
    if (snapshot?.canvas && snapshot.width > 0 && snapshot.height > 0) {
        ctx.drawImage(
            snapshot.canvas,
            0,
            0,
            snapshot.width,
            snapshot.height,
            0,
            0,
            Math.max(1, Number(node.size?.[0] || snapshot.nodeWidth || 1)),
            Math.max(1, Number(node.size?.[1] || snapshot.nodeHeight || 1))
        );
    } else {
        drawDeckResizeGhost(node, ctx);
    }
    if (node._forceSync) node._forceSync = false;
    return true;
}

function getLinearDeckMembers(node, graph, axis) {
    if (!graph || !node) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    if (pressureHub?.id === node.id) return [];
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === axis) return getDeckPressureBranchMembers(pressureHub, graph, branchSide);
    return isLinearDeckGroup(node, graph, axis) ? getDeckMembers(node, graph) : [];
}

function getHorizontalDeckMembersByX(node, graph) {
    const members = getLinearDeckMembers(node, graph, "horizontal");
    if (members.length === 0) return [];
    const pressureHub = getDeckPressureHubForNode(node, graph);
    const branchSide = pressureHub && pressureHub.id !== node.id ? getDeckPressureBranchSideForNode(pressureHub, graph, node) : null;
    if (getDeckPressureBranchAxis(pressureHub, graph, branchSide) === "horizontal") return members;
    return members.slice().sort((a, b) => {
        const ax = Number(a?.pos?.[0]) || 0;
        const bx = Number(b?.pos?.[0]) || 0;
        if (ax !== bx) return ax - bx;
        return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
}

function distributeHorizontalWidthDelta(members, delta, snap) {
    const unit = Math.max(1, Number(snap) || 10);
    let remaining = Math.round(Math.abs(Number(delta) || 0) / unit) * unit;
    if (remaining < 0.5 || !members.length) return true;

    if (delta > 0) {
        while (remaining >= unit - 0.5) {
            const shrinkable = members
                .map((member) => ({
                    member,
                    width: getDockNodeWidth(member),
                    minWidth: getDockNodeMinWidth(member, 0, snap),
                }))
                .filter((entry) => entry.width > entry.minWidth + 0.5);
            if (!shrinkable.length) return false;
            let consumed = 0;
            shrinkable.forEach((entry) => {
                if (remaining - consumed < unit - 0.5) return;
                const shrink = Math.min(unit, Math.floor((entry.width - entry.minWidth) / unit) * unit);
                if (shrink < unit - 0.5) return;
                syncDeckNodeSize(entry.member, entry.width - shrink, getDockNodeHeight(entry.member), { silent: true });
                consumed += shrink;
            });
            if (consumed <= 0.5) return false;
            remaining -= consumed;
        }
        return true;
    }

    let index = 0;
    while (remaining >= unit - 0.5) {
        const member = members[index % members.length];
        syncDeckNodeSize(member, getDockNodeWidth(member) + unit, getDockNodeHeight(member), { silent: true });
        remaining -= unit;
        index += 1;
    }
    return true;
}

function hasActiveHorizontalResize(members = []) {
    return members.some((member) =>
        member?._isDerpResizing === true
        || member?._horizontalDeckWidthResizeLock === true
        || !!member?._dockResizeSession
        || (member?._dockResizeActiveMembers instanceof Set && member._dockResizeActiveMembers.size > 0)
    );
}

export function balanceHorizontalDeckWidthChange(node, previousWidth = 0) {
    const graph = app.graph || node?.graph || null;
    const members = getHorizontalDeckMembersByX(node, graph);
    if (members.length <= 1) return false;

    const currentWidth = getDockNodeWidth(node);
    if (hasActiveHorizontalResize(members)) {
        node._horizontalDeckWidthBalanceObserved = currentWidth;
        return false;
    }

    const nodeIndex = members.findIndex((member) => member.id === node.id);
    if (nodeIndex !== 0 && nodeIndex !== members.length - 1) return false;

    const lastObservedWidth = Number(node._horizontalDeckWidthBalanceObserved) || 0;
    node._horizontalDeckWidthBalanceObserved = currentWidth;
    if (node._horizontalDeckWidthBalanceReady !== true) {
        if (lastObservedWidth > 0 && Math.abs(lastObservedWidth - currentWidth) < 0.5) {
            node._horizontalDeckWidthBalanceReady = true;
        }
        return false;
    }
    const delta = currentWidth - (Number(previousWidth) || 0);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.5) return false;

    const snap = getDerpVars(node).SNAP;
    const oppositeMembers = nodeIndex === members.length - 1
        ? members.slice(0, nodeIndex).reverse()
        : members.slice(nodeIndex + 1);
    if (!distributeHorizontalWidthDelta(oppositeMembers, delta, snap)) return false;

    const anchorX = nodeIndex === members.length - 1
        ? Math.min(...members.map((member) => Number(member?.pos?.[0]) || 0))
        : Math.max(...members.map((member) => (Number(member?.pos?.[0]) || 0) + getDockNodeWidth(member)));
    let cursorX = nodeIndex === members.length - 1
        ? anchorX
        : anchorX - members.reduce((sum, member) => sum + getDockNodeWidth(member), 0);

    members.forEach((member) => {
        setDeckNodePos(member, cursorX, Number(member.pos?.[1]) || 0);
        cursorX += getDockNodeWidth(member);
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
        if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
        syncDerpShield(member);
    });
    return true;
}
function getNodeGeometry(node) {
    return {
        x: Number(node?.pos?.[0]) || 0,
        y: Number(node?.pos?.[1]) || 0,
        w: Number(node?.size?.[0] ?? node?.properties?.nodeSize?.[0]) || 0,
        h: Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0,
    };
}

function areDockedEdgesAligned(members = [], graph = null, tolerance = 0.75) {
    if (!graph || !Array.isArray(members) || members.length <= 1) return false;
    const seenEdges = new Set();
    let edgeCount = 0;

    for (const member of members) {
        for (const side of ["left", "right", "top", "bottom"]) {
            const neighbor = getNodeOnDeckEdge(member, graph, side);
            if (!neighbor) continue;
            const edgeKey = [Math.min(member.id, neighbor.id), Math.max(member.id, neighbor.id), side === "left" || side === "right" ? "h" : "v"].join(":");
            if (seenEdges.has(edgeKey)) continue;
            seenEdges.add(edgeKey);
            edgeCount += 1;

            const a = getNodeGeometry(member);
            const b = getNodeGeometry(neighbor);
            let aligned = false;
            if (side === "right") {
                aligned = Math.abs((a.x + a.w) - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
            } else if (side === "left") {
                aligned = Math.abs(a.x - (b.x + b.w)) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
            } else if (side === "bottom") {
                aligned = Math.abs((a.y + a.h) - b.y) <= tolerance && Math.abs(a.x - b.x) <= tolerance;
            } else if (side === "top") {
                aligned = Math.abs(a.y - (b.y + b.h)) <= tolerance && Math.abs(a.x - b.x) <= tolerance;
            }
            if (!aligned) return false;
        }
    }

    return edgeCount > 0;
}

function getDeckFrameState(node) {
    const graph = app.graph || node?.graph || null;
    if (!graph || !node) return null;

    const frame = Number(app.canvas?.frame) || 0;
    if (deckCacheFrame !== frame) {
        deckFrameCache.clear();
        deckNodeFrameCache.clear();
        deckCacheFrame = frame;
    }
    const nodeFrameKey = `${frame}:${node.id}`;
    if (deckNodeFrameCache.has(nodeFrameKey)) return deckNodeFrameCache.get(nodeFrameKey);
    if (isDeckPressureHub(node)) {
        deckNodeFrameCache.set(nodeFrameKey, null);
        return null;
    }

    let members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) {
        deckNodeFrameCache.set(nodeFrameKey, null);
        return null;
    }
    let axis = getDockGroupAxisFromMembers(members);
    const horizontalMembers = getLinearDeckMembers(node, graph, "horizontal");
    const verticalMembers = getLinearDeckMembers(node, graph, "vertical");
    if (horizontalMembers.length > 1) {
        members = horizontalMembers;
        axis = "horizontal";
    } else if (verticalMembers.length > 1) {
        members = verticalMembers;
        axis = "vertical";
    }
    const preserveHeight = shouldPreserveDockHeight(axis);
    const preserveWidth = shouldPreserveDockWidth(axis);
    const cacheKey = getDeckFrameKey(node, members);
    let state = deckFrameCache.get(cacheKey);
    if (!state) {
        state = {
            graph,
            members,
            axis,
            preserveHeight,
            preserveWidth,
            sharedHeight: null,
            sharedWidth: null,
            didSync: false,
            syncedHeight: 0,
            syncedWidth: 0,
            didNormalize: false,
            normalizedHeight: 0,
            normalizedWidth: 0,
            skipState: null,
        };
        state.skipState = getDeckSkipState(state);
        deckFrameCache.set(cacheKey, state);
    }
    members.forEach((member) => {
        deckNodeFrameCache.set(`${frame}:${member.id}`, state);
    });
    return state;
}

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

function getTooltipHostPalette(entity) {
    if (entity?.properties?.tooltipExpand !== true) return null;
    const host = entity.hostNode || entity;
    const palette = entity.properties?.palette || null;
    const stringPalette = host?._derpStringPalette || host?.properties?._derpStringPalette || null;
    const path = palette?.path || stringPalette?.path || entity._derpStringPalette?.path || entity.properties?._derpStringPalette?.path;
    const data = palette?.data || stringPalette?.data || host?._derpStringPaletteData || entity._derpStringPaletteData || entity._derpStringPalette?.data || entity.properties?._derpStringPalette?.data;
    const entry = entity.properties?.tooltipBodyPaletteEntry || "toolTip_background";
    return path ? { path, data, entry } : null;
}

function mergePaintColorOverrides(basePaint, overridePaint) {
    if (!basePaint) return overridePaint ? { ...overridePaint } : null;
    if (!overridePaint) return { ...basePaint };
    return {
        ...basePaint,
        fill: overridePaint.fill || overridePaint.textColor || basePaint.fill,
        textColor: overridePaint.textColor || overridePaint.fill || basePaint.textColor,
        shadow: overridePaint.shadow || basePaint.shadow,
        border: overridePaint.border || basePaint.border,
        glow: overridePaint.glow || basePaint.glow,
    };
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
            textThemeKey: "tooltip_background, t_tooltip_Text",
            tooltipExpand: true
        }, regionKey, false, "info", false);
        if (!basta) return;
        state.activeKey = regionKey;
        state.activeText = tooltipText;
        state.shownSinceMoveToken = scheduledMoveToken;
    }, TOOLTIP_DELAY_MS);
}

export function handleTooltipHover(entity, regionKey, localMouse = null) {
    if (window.DERP_GLOBAL_SETTINGS?.showToolTips === false) return;
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

export function drawSharedResizeSeamGhostsGlobal(ctx) {
    drawSharedResizeSeamGhosts(ctx, app.graph || null);
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
            await ensureDerpDefaultTitleRegistry(target, result.data);
            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(node => {
                    if (!(node.isFathaNode || node.isUncleNode)) return;
                    if (typeof node.onThemeUpdate === "function") {
                        node.onThemeUpdate(window.xcpDerpThemeConfig);
                    } else if (node.requestDerpSync) {
                        node.requestDerpSync();
                    }
                    if (syncDerpLocalizedDefaultTitle(node) && typeof node.refreshNodeLayoutMap === "function") {
                        node.refreshNodeLayoutMap();
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
    const state = getDeckFrameState(node);
    return state?.preserveWidth === true;
}

export function shouldPreserveHorizontalDeckHeight(node) {
    const state = getDeckFrameState(node);
    return state?.preserveHeight === true;
}

export function getDeckPressureSideHorizontalLockedWidth(node) {
    const graph = app.graph || node?.graph || null;
    return getDeckPressureSideHorizontalWidthLock(node, graph);
}

export function shouldLockDeckPressureSideHorizontalWidth(node) {
    return getDeckPressureSideHorizontalLockedWidth(node) > 0;
}

export function resolveDerpRuntimeSize(node, measured, vars = {}) {
    return resolveDerpRuntimeSizeImpl(node, measured, vars);
}

export function resolveHorizontalDeckSharedHeight(node) {
    const state = getDeckFrameState(node);
    const resolvedHeight = resolveHorizontalDeckSharedHeightImpl(node, { getDerpVars });
    if (state?.preserveHeight === true && Number(resolvedHeight) > 0) {
        state.sharedHeight = resolvedHeight;
    }
    return resolvedHeight;
}

export function syncHorizontalDeckHeight(node, targetHeight = 0) {
    const state = getDeckFrameState(node);
    if (state?.preserveHeight === true) {
        const nextHeight = Number(targetHeight) || 0;
        if (nextHeight > 0) state.sharedHeight = nextHeight;
        const signature = getDeckGeometrySignature(state.members, nextHeight, "horizontal");
        if (nextHeight > 0 && isComfyVueNodesMode() && areDockedEdgesAligned(state.members, app.graph || node?.graph || null) && isDeckHeightAligned(state.members, nextHeight)) {
            state.didSync = true;
            state.syncedHeight = nextHeight;
            if (state.skipState) state.skipState.syncSignature = signature;
            return false;
        }
        if (nextHeight > 0 && state.skipState?.syncSignature === signature && isDeckHeightAligned(state.members, nextHeight)) {
            state.didSync = true;
            state.syncedHeight = nextHeight;
            return false;
        }
        if (state.didSync && Math.abs(nextHeight - (Number(state.syncedHeight) || 0)) < 0.5) {
            return false;
        }
        state.didSync = true;
        state.syncedHeight = nextHeight;
    }
    const graph = app.graph || node?.graph || null;
    const changed = syncHorizontalDeckHeightForGraph(node, graph, targetHeight);
    if (state?.skipState && Number(targetHeight) > 0 && isDeckHeightAligned(state.members, targetHeight)) {
        state.skipState.syncSignature = getDeckGeometrySignature(state.members, targetHeight, "horizontal");
    }
    return changed;
}

export function normalizeDerpDockedLayout(node) {
    const state = getDeckFrameState(node);
    const graph = app.graph || node?.graph || null;
    const pressureHub = isDeckPressureHub(node) ? node : getDeckPressureHubForNode(node, graph);
    if (pressureHub) {
        const frame = Number(app.canvas?.frame ?? app.canvas?.drawCount) || 0;
        const members = getDeckMembers(pressureHub, graph);
        const signature = getDeckGeometrySignature(members, pressureHub.id, "deck-pressure");
        const cacheKey = `${frame}:${pressureHub.id}`;
        const cached = deckPressureFrameCache.get(cacheKey);
        if (cached?.signature === signature) return [];
        const stableCacheKey = String(pressureHub.id);
        const stable = isDeckPressureStable(members);
        if (stable && deckPressureStableCache.get(stableCacheKey)?.signature === signature) return [];
        const moved = applyDeckPressureLayout(pressureHub, graph, getDerpVars(pressureHub).SNAP);
        const nextSignature = getDeckGeometrySignature(members, pressureHub.id, "deck-pressure");
        deckPressureFrameCache.set(cacheKey, { signature: nextSignature });
        if (stable) deckPressureStableCache.set(stableCacheKey, { signature: nextSignature });
        else deckPressureStableCache.delete(stableCacheKey);
        if (deckPressureFrameCache.size > 64) deckPressureFrameCache.clear();
        if (deckPressureStableCache.size > 64) deckPressureStableCache.clear();
        return moved;
    }
    if (state?.preserveWidth === true) {
        const snap = getDerpVars(node).SNAP;
        const sharedWidth = Math.max(
            getSharedDockWidth(state.members, 0),
            getSharedDockMinWidth(state.members, 0, snap)
        );
        const signature = getDeckGeometrySignature(state.members, sharedWidth, "vertical");
        const widthAligned = sharedWidth > 0 && state.members.every((member) => Number(member?.size?.[0]) === sharedWidth);
        if ((state.skipState?.normalizeSignature === signature || (isComfyVueNodesMode() && areDockedEdgesAligned(state.members, graph))) && widthAligned) {
            state.didNormalize = true;
            state.normalizedWidth = Math.max(Number(state.normalizedWidth) || 0, sharedWidth);
            if (state.skipState) state.skipState.normalizeSignature = signature;
            return [];
        }
        if (state.didNormalize && sharedWidth <= (Number(state.normalizedWidth) || 0) && widthAligned) {
            return [];
        }
        state.didNormalize = true;
        state.normalizedWidth = Math.max(Number(state.normalizedWidth) || 0, sharedWidth);
        const positionAnchor = isComfyVueNodesMode()
            ? getPinnedVerticalDeckAnchor(node, graph)
            : null;
        const moved = normalizeDockedLayout(node, graph, snap);
        if (positionAnchor) restorePinnedVerticalDeckAnchor(positionAnchor);
        if (state.skipState && sharedWidth > 0 && state.members.every((member) => Number(member?.size?.[0]) === sharedWidth)) {
            state.skipState.normalizeSignature = getDeckGeometrySignature(state.members, sharedWidth, "vertical");
        }
        moved.forEach((member) => {
            if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
            if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
            syncDerpShield(member);
        });
        return moved;
    }

    if (state?.preserveHeight === true) {
        const sharedHeight = Number(state.sharedHeight) || 0;
        const signature = getDeckGeometrySignature(state.members, sharedHeight, "horizontal");
        if (state.skipState?.normalizeSignature === signature || (isComfyVueNodesMode() && areDockedEdgesAligned(state.members, graph))) {
            state.didNormalize = true;
            state.normalizedHeight = sharedHeight;
            if (state.skipState) state.skipState.normalizeSignature = signature;
            return [];
        }
        if (state.didNormalize && Math.abs(sharedHeight - (Number(state.normalizedHeight) || 0)) < 0.5) {
            return [];
        }
        state.didNormalize = true;
        state.normalizedHeight = sharedHeight;
    }
    if (state?.axis !== "horizontal" || !graph) return [];
    const positionAnchor = isComfyVueNodesMode()
        ? getHorizontalDeckPositionAnchor(state.members)
        : null;
    const moved = normalizeDockedLayout(node, graph, getDerpVars(node).SNAP);
    if (positionAnchor) restoreHorizontalDeckPositionAnchor(positionAnchor);
    if (state?.skipState && Number(state.sharedHeight) > 0) {
        state.skipState.normalizeSignature = getDeckGeometrySignature(state.members, state.sharedHeight, "horizontal");
    }
    moved.forEach((member) => {
        if (typeof member.syncUncleSlots === "function") member.syncUncleSlots();
        if (typeof member.setDirtyCanvas === "function") member.setDirtyCanvas(true, true);
        syncDerpShield(member);
    });
    return moved;
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
    if (Array.isArray(safeNode._themeWeightOverlay?._layout)) tLayout = safeNode._themeWeightOverlay._layout;

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
        if (reg.isSpacing || (!reg.type && !reg.onPress && !reg.onClick && !reg.onDblClick && !reg.hoverEffect && !reg.onDragStart && !reg.onDrag && !reg.onDragEnd)) continue;
        const isInteractive = reg.onPress || reg.onClick || reg.onDblClick || reg.hoverEffect || reg.onChange ||
            reg.onDragStart || reg.onDrag || reg.onDragEnd ||
            reg.type === UI_TYPES.DROPDOWN_DERP || reg.type === UI_TYPES.DROPDOWN ||
            reg.type === UI_TYPES.BUTTON || reg.type === UI_TYPES.ICONBUTTON ||
            reg.type === UI_TYPES.SLIDER || reg.type === UI_TYPES.EDITOR ||
            reg.type === UI_TYPES.FILEBROWSER || reg.type === UI_TYPES.TOGGLE ||
            reg.type === UI_TYPES.TOGGLE_V2 || reg.type === UI_TYPES.TRIGGER;
        if (!isInteractive) continue;

        const isDisabled = reg.state === "DIS";
        const allowDisabledInteraction = reg.allowOpenWhenDisabled === true;
        if (isDisabled && !allowDisabledInteraction && !(allowDisabledDrag && reg.allowDragWhenDisabled)) continue;
        if (!(reg.hitTest ? reg.hitTest(localMouse, reg) : layout.hitTest(localMouse, reg))) continue;
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
    return !!(sysBtn && (sysBtn.hitTest ? sysBtn.hitTest(localMouse, sysBtn) : entity.layout.hitTest(localMouse, sysBtn)));
}

function handleShieldDragStart(entity, data, localMouse, scale, deckEngine) {
    entity._startPos = [...(entity.pos || [0, 0])];
    entity._startSize = [...(entity.size || [0, 0])];
    entity._deckDragAltActive = !!data.originalEvent?.altKey;
    entity._dragEndRegionKey = null;

    if (isSystemButtonHit(entity, localMouse, scale)) {
        entity._pressedRegionKey = "systemBtn";
        return true;
    }

    const hit = findHitRegion(entity.layout, localMouse, { allowDisabledDrag: true });
    if (hit && !hit.reg.noDragLock) {
        entity._pressedRegionKey = hit.key;
        entity._pressedRegionType = hit.reg?.type || null;
        entity._pressedRegionIsDragHandle = !!hit.reg.onDragStart || !!hit.reg.onDrag || hit.reg.type === UI_TYPES.SLIDER;
        if (hit.reg.onDragStart || hit.reg.onDrag || hit.reg.onDragEnd) entity._dragEndRegionKey = hit.key;
        if (hit.reg.onDragStart) hit.reg.onDragStart(data.originalEvent, data);
        entity._derpAwakeFrames = 15;
        entity.setDirtyCanvas(true);
        return true;
    }
    if (hit && hit.reg.noDragLock && (hit.reg.onDblClick || hit.reg.onPress || hit.reg.onClick)) {
        entity._pressedRegionKey = hit.key;
        entity._pressedRegionType = hit.reg?.type || null;
        entity._pressedRegionIsDragHandle = false;
    }

    beginDockDrag(entity, deckEngine);
    return false;
}

function handleShieldDrag(entity, data, scale, deckEngine) {
    if (entity._pressedRegionKey) {
        const reg = entity.layout?.regions[entity._pressedRegionKey];
        if (reg && !reg.noDragLock && reg.onDrag) {
            reg.onDrag(data.originalEvent, data);
            return false;
        }
        if (!entity._deckDragRootStartPos) return true;
    }

    if (entity.properties?.stickyDrag === true && !entity._deckDragRootStartPos) {
        beginDockDrag(entity, deckEngine);
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

    let handled = false;
    if (reg.onPress) {
        handled = reg.onPress(data.originalEvent, data) !== false;
    } else if (reg.onClick) {
        handled = reg.onClick(data.originalEvent, data) !== false;
    }
    entity.setDirtyCanvas(true);
    if (app.graph && app.graph.change) app.graph.change();
    return handled;
}

function handleVerticalHeaderClick(entity, localMouse, data) {
    const header = entity.layout?.regions?.headerRegion;
    const graph = app.graph || entity.graph || null;
    const headerCollapseEnabled = window.DERP_GLOBAL_SETTINGS?.verticalDockHeaderCollapse ?? true;
    const isVerticalDockHeaderHit = headerCollapseEnabled && header && graph && isLinearDeckGroup(entity, graph, "vertical") && entity.layout.hitTest(localMouse, header);
    if (!isVerticalDockHeaderHit) return false;
    if (isDeckPressureSideHorizontalBranchMember(entity, graph)) return false;

    const shiftKey = data?.originalEvent?.shiftKey;
    if (shiftKey) {
        const wasCollapsed = !!entity.properties?.contentCollapsed;
        const members = getDeckMembers(entity, graph);
        const soundKey = wasCollapsed ? "collapseoff" : "collapseon";
        if (SOUND_INDEX?.[soundKey]) SOUND_INDEX[soundKey]();
        if (wasCollapsed) {
            members.forEach(member => {
                if (member !== entity && member.properties?.contentCollapsed !== true && !isDeckPressureSideHorizontalBranchMember(member, graph)) {
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
        entity._pressedRegionIsDragHandle = false;
        return true;
    }

    const key = entity._pressedRegionKey;
    entity._pressedRegionKey = null;
    entity._pressedRegionType = null;
    entity._pressedRegionIsDragHandle = false;

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
        entity.properties._derpCustomTitle = !isDerpDefaultLocalizedTitle(newTitle, entity.properties._derpTitleLocaleKey);
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
    entity._pressedRegionIsDragHandle = false;
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
        const isOptionalBgKey = backgroundPaintKey.startsWith("#");
        const bgOffSuffix = isBypassed ? "_DIS" : (isOptionalBgKey ? "_DIS" : "");
        const bgOnSuffix  = isBypassed ? "_DIS" : (isOptionalBgKey ? "_DIS" : "_ON");
        const backgroundPalette = getTooltipHostPalette(entity);
        const skipNodePaletteInjection = entity.properties?.tooltipExpand === true && !!backgroundPalette;
        const canvasPaletteStateOFF = isBypassed ? "_DIS" : "_OFF";
        const canvasPaletteStateON = isBypassed ? "_DIS" : "_ON";
        const resolveTooltipBackgroundPaint = (stateSuffix) => {
            if (entity.properties?.tooltipExpand !== true) return null;
            const state = stateSuffix === "_ON" ? "ON" : stateSuffix === "_DIS" ? "DIS" : "OFF";
            const systemPaint = resolveSystemThemePaint(backgroundPaintKey, state);
            const palettePaint = backgroundPalette
                ? resolvePaintData(entity, backgroundPaintKey, stateSuffix, null, backgroundPalette)
                : null;
            return mergePaintColorOverrides(systemPaint, palettePaint) || systemPaint || palettePaint;
        };
        const basePaintOFF = resolveTooltipBackgroundPaint(bgOffSuffix)
            || resolvePaintData(entity, backgroundPaintKey, bgOffSuffix, null, backgroundPalette)
            || resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "", null, backgroundPalette);
        const basePaintON = resolveTooltipBackgroundPaint(bgOnSuffix)
            || resolvePaintData(entity, backgroundPaintKey, bgOnSuffix, null, backgroundPalette)
            || resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "_ON", null, backgroundPalette);
        const paintOFF = skipNodePaletteInjection ? basePaintOFF : applyNodeCanvasPalette(entity, basePaintOFF, canvasPaletteStateOFF, basePaintOFF, getPaletteCache);
        const paintON = skipNodePaletteInjection ? basePaintON : applyNodeCanvasPalette(entity, basePaintON, canvasPaletteStateON, basePaintON, getPaletteCache);
        // Zero bottom corners for search-tab-style bastas
        if (entity.properties?._bastaBottomCornersZero) {
            if (paintOFF?.corners?.length >= 4) paintOFF.corners = [paintOFF.corners[0], paintOFF.corners[1], 0, 0];
            if (paintON?.corners?.length >= 4) paintON.corners = [paintON.corners[0], paintON.corners[1], 0, 0];
        }
        const headerPaintOFF = isBypassed ? (entity._headerPaintData_DIS || entity._headerPaintData) : entity._headerPaintData;
        const headerPaintON = isBypassed ? (entity._headerPaintData_DIS || entity._headerPaintData) : (entity._headerPaintData_ON || entity._headerPaintData);
        const cornerOverride = getDeckCornerOverride(entity, app.graph || entity.graph || null);
        const applyNodeCornerOverride = (paint) => paint
            ? { ...paint, corners: applyCornerOverride(paint.corners || [8, 8, 8, 8], cornerOverride) }
            : paint;
        const withoutHeaderCorners = (paint) => {
            if (!paint) return null;
            const { corners, ...rest } = paint;
            return rest;
        };
        const resolveHeaderThemePaint = (state) => withoutHeaderCorners(state === "_ON" ? headerPaintON : headerPaintOFF);
        const headerPaintOFFFingerprint = getPaintFingerprint(withoutHeaderCorners(headerPaintOFF));
        const headerPaintONFingerprint = getPaintFingerprint(withoutHeaderCorners(headerPaintON));
        const nodeWantsCache = entity?.properties?.optimizeStaticBgCache !== false;
        // Quality guard: rounded corners / shadow / glow are prone to cache resample artifacts.
        // In those cases prefer direct paint to preserve smooth corners.
        const useStaticBgCache = nodeWantsCache && !hasRoundedOrFx(paintOFF) && !hasRoundedOrFx(paintON);

        const renderBaseBackground = (targetCtx, options = {}) => {
            const bodyPaint = options.bodyPaint || paintOFF;
            const headerPaletteState = options.headerPaletteState || (isBypassed ? "_DIS" : (isCollapsed || isSelected) ? "_ON" : "_OFF");
            const headerEffectPaint = options.headerEffectPaint || bodyPaint;

            if (header && bodyPaint && paintON) {
                const cOFF = applyCornerOverride(bodyPaint.corners || [8, 8, 8, 8], cornerOverride);
                const cON = applyCornerOverride((options.cornerPaint || paintON).corners || [8, 8, 8, 8], cornerOverride);

                if (isCollapsed) {
                    const headerThemePaint = resolveHeaderThemePaint(headerPaletteState);
                    const collapsedPaint = applyCollapsedCornerCap(
                        applyNodeHeaderPalette(entity, { ...bodyPaint, ...headerThemePaint, corners: [cON[0], cON[1], cOFF[2], cOFF[3]] }, headerPaletteState, headerEffectPaint, getPaletteCache),
                        isCollapsed
                    );
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: collapsedPaint.fill, paintData: collapsedPaint });
                } else {
                    const splitY = header.y + header.h + (header.margin?.length === 4 ? header.margin[3] : (header.margin?.[1] || 0));
                    const headerThemePaint = resolveHeaderThemePaint(headerPaletteState);
                    const headerBasePaint = { ...bodyPaint, border: null, shadow: null, glow: null, ...headerThemePaint, corners: [cON[0], cON[1], 0, 0] };
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
                    renderBaseBackground(ctx, { bodyPaint: paintOFF, headerPaletteState: isCollapsed ? "_ON" : "_OFF", headerEffectPaint: paintOFF });
                } else if (useStaticBgCache) {
                    const bw = Math.max(1, Math.round(entity.size[0]));
                    const bh = Math.max(1, Math.round(entity.size[1]));
                    const cache = getOrCreateBgCache(entity, bw, bh);
                    const cacheKey = `pulse|${bw}|${bh}|${isBypassed}|${entity.mode}|${entity._currentThemeCacheKey || entity._currentThemeName || ""}|${backgroundPaintKey}|${getPaintFingerprint(paintOFF)}`;
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
                const pulseAlpha = getPulseAlpha();
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
                    entity._currentThemeCacheKey || entity._currentThemeName || "",
                    isSelected ? "selected" : "normal",
                    header ? `${header.y}_${header.h}_${header.margin?.join?.("_") || ""}` : "noheader",
                    getNodeHeaderPaletteFingerprint(entity, getPaletteCache),
                    getNodeCanvasPaletteFingerprint(entity, getPaletteCache),
                    cornerOverride ? cornerOverride.join("_") : "nocorners",
                    backgroundPaintKey,
                    getPaintFingerprint(paintOFF),
                    getPaintFingerprint(paintON),
                    headerPaintOFFFingerprint,
                    headerPaintONFingerprint
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
