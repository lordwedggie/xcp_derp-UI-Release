/**
 * Path: ./js/fatha/fatha.js
 * ROLE: The Virtual "Fatha" framework.
 * STATUS: THE PERFECT HEIST - NATIVE SELECTION DESTROYED
 */
import { app } from "../../../scripts/app.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "./core/fathaDOMshield.js";
import { masterLayoutEngine } from "./core/masterLayoutEngine.js";
import { handleShieldInteraction, handleDrawCTX, handleThemeUpdate, handleInitDerpGlobalListener, getDerpVars, handleDerpRequestSync, handleDerpComputeSize, handleDerpCollapse, animateDerpSize, drawDeckPreviewGlobal, drawSharedResizeSeamGhostsGlobal, shouldPreserveHorizontalDeckHeight, shouldPreserveVerticalDeckWidth, balanceHorizontalDeckWidthChange, syncHorizontalDeckHeight, resolveDerpRuntimeSize, resolveHorizontalDeckSharedHeight, normalizeDerpDockedLayout, syncDerpLocalizedDefaultTitle, drawDeckResizeOptimizedNode, shouldLockDeckPressureSideHorizontalWidth, getDeckPressureSideHorizontalLockedWidth } from "./core/fathaHandler.js";
export { getDerpVars };
import { drawDerpSysPanelGlobal, isHostActive, closeDerpSysPanel, sysPanel } from "./helpers/fathaSysPanel.js";
import { drawBastaLayer } from "./basta.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./core/masterLayoutTypes.js";
import { getVirtualNodeLayoutMap } from "./helpers/fathaLayoutMaps.js";
import { transmitBypassedDerpSignals, transmitDerpSignal, purgeDerpSignal } from "./core/masterSignalEngine.js";
import { animateRecoil } from "../herbina/masterAnimator.js";
import { initPerfOverlay, togglePerfOverlay } from "./helpers/fathaPerfOverlay.js";
import { promoteMasterZ, syncMasterZ } from "./core/masterZ.js";
import { isComfyVueNodesMode, scheduleNativeVueNodeShellSuppression, shouldMutateLegacySelectionForDraw, suppressNativeVueNodeShell } from "./core/fathaNode2Compat.js";

const FATHA_OVERLAY_WINDOW_MS = 4000;
const FATHA_VIEWPORT_CULL_MARGIN_PX = 160;
const PASSIVE_WHOLE_WALL_CACHE_MAX_SCALE = 2;
const PASSIVE_WHOLE_WALL_CACHE_SCALE_STEP = 0.25;
const LORA_STACK_WHOLE_WALL_CACHE_MIN_ITEMS = 3;
const TRIGGER_WALL_WHOLE_WALL_CACHE_MIN_ITEMS = 10;
function isDerpLoraStackNode(node) {
    const text = [
        node?.type,
        node?.comfyClass,
        node?.constructor?.comfyClass,
        node?.titleLabel,
        node?.title,
    ].filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9]/g, "");
    return text.includes("derplorastack");
}

function getFathaNodeScreenRect(node, canvasDS, canvasEl) {
    if (!node || !canvasDS || !canvasEl) return null;
    const scale = Number(canvasDS.scale) || 1;
    const rect = canvasEl.getBoundingClientRect?.();
    if (!rect) return null;

    const padL = Number(node._padL || 0);
    const padR = Number(node._padR || 0);
    const x = Number(node.pos?.[0] || 0) + padL;
    const y = Number(node.pos?.[1] || 0);
    const w = Math.max(1, Number(node.size?.[0] || 1) - padL - padR);
    const h = Math.max(1, Number(node.size?.[1] || 1));

    return {
        left: rect.left + (x + (Number(canvasDS.offset?.[0]) || 0)) * scale,
        top: rect.top + (y + (Number(canvasDS.offset?.[1]) || 0)) * scale,
        right: rect.left + (x + w + (Number(canvasDS.offset?.[0]) || 0)) * scale,
        bottom: rect.top + (y + h + (Number(canvasDS.offset?.[1]) || 0)) * scale,
        canvasLeft: rect.left,
        canvasTop: rect.top,
        canvasRight: rect.right,
        canvasBottom: rect.bottom,
    };
}

function isFathaNodeOutsideViewport(node, canvasDS, canvasEl, marginPx = FATHA_VIEWPORT_CULL_MARGIN_PX) {
    const screen = getFathaNodeScreenRect(node, canvasDS, canvasEl);
    if (!screen) return false;
    return screen.right < screen.canvasLeft - marginPx ||
        screen.left > screen.canvasRight + marginPx ||
        screen.bottom < screen.canvasTop - marginPx ||
        screen.top > screen.canvasBottom + marginPx;
}

function canCullFathaNode(node, isTrueSelected, panelActive, isAnimating = false) {
    if (!node || isTrueSelected || panelActive) return false;
    if (isAnimating) return false;
    if (node._forceSync || node._layoutDirty) return false;
    if (node._isDragging || node._isDerpResizing || node._isDeckDragging || node._isFathaDragging) return false;
    if (node._pressedRegionKey || node._hoveredRegionKey || node._dragTrig || node._dragThresholdMet) return false;
    if (Number(node._derpAwakeFrames || 0) > 0) return false;
    return true;
}

function setFathaNodeDomVisibility(node, visible) {
    const value = visible ? "visible" : "hidden";
    if (node?.interactionShield) node.interactionShield.style.visibility = value;
    if (node?._derpDomElements) {
        Object.values(node._derpDomElements).forEach(el => {
            if (el) el.style.visibility = value;
        });
    }
}

function ensureFathaOverlayPerf(node) {
    if (!node) return null;
    if (!node._overlayPerf) {
        node._overlayPerf = {
            samples: [],
            totalMs: 0,
            updateMs: 0,
            drawMs: 0,
        };
    }
    return node._overlayPerf;
}

function trimFathaOverlayPerf(perf, now) {
    if (!perf?.samples) return;
    const cutoff = now - FATHA_OVERLAY_WINDOW_MS;
    while (perf.samples.length && perf.samples[0].ts < cutoff) {
        const sample = perf.samples.shift();
        perf.totalMs -= sample.totalMs || 0;
        perf.updateMs -= sample.updateMs || 0;
        perf.drawMs -= sample.drawMs || 0;
    }
    if (perf.samples.length === 0) {
        perf.totalMs = 0;
        perf.updateMs = 0;
        perf.drawMs = 0;
    }
}

function recordFathaOverlayPerf(node, drawMs) {
    const perf = ensureFathaOverlayPerf(node);
    if (!perf) return;
    const ts = performance.now();
    const sample = {
        ts,
        updateMs: 0,
        drawMs: Math.max(0, drawMs || 0),
        totalMs: Math.max(0, drawMs || 0),
    };
    perf.samples.push(sample);
    perf.totalMs += sample.totalMs;
    perf.drawMs += sample.drawMs;
    trimFathaOverlayPerf(perf, ts);
}

function isPassiveWholeWallCacheNode(node) {
    const typeName = String(node?.type || "").toLowerCase();
    return typeName.includes("triggerwall") || typeName.includes("derplorastack") || typeName.includes("imagedeck");
}

function suspendPassiveWholeWallCache(node, durationMs = 220) {
    if (!node) return;
    node._passiveWholeWallCacheSuspendUntil = Math.max(
        Number(node._passiveWholeWallCacheSuspendUntil || 0),
        performance.now() + durationMs
    );
}

function getPassiveWholeWallCacheScale(canvasScale = 1) {
    const dpr = typeof window !== "undefined" ? Number(window.devicePixelRatio || 1) : 1;
    const desiredScale = (dpr || 1) * Math.max(1, Number(canvasScale) || 1);
    // Quantize zoom-aware passive caches so they stay sharp when zoomed in, while
    // tiny DragAndScale jitter does not invalidate large LoRA/Trigger/ImageDeck caches.
    const bucketScale = Math.ceil(desiredScale / PASSIVE_WHOLE_WALL_CACHE_SCALE_STEP) * PASSIVE_WHOLE_WALL_CACHE_SCALE_STEP;
    return Math.max(1, Math.min(PASSIVE_WHOLE_WALL_CACHE_MAX_SCALE, bucketScale));
}


function createFathaCacheCanvas(width, height, scaleFactor = 1) {
    const safeW = Math.max(1, Math.round(width || 1));
    const safeH = Math.max(1, Math.round(height || 1));
    const safeScale = Math.max(1, Number(scaleFactor) || 1);
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(Math.max(1, Math.round(safeW * safeScale)), Math.max(1, Math.round(safeH * safeScale)));
    }
    if (typeof document !== "undefined" && typeof document.createElement === "function") {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(safeW * safeScale));
        canvas.height = Math.max(1, Math.round(safeH * safeScale));
        return canvas;
    }
    return null;
}

function buildLoraStackWidgetLayerCacheState(node, cacheScale, idleReady) {
    if (!idleReady || !isDerpLoraStackNode(node)) return { canUse: false, cacheReg: null, key: null };
    const cacheReg = node.layout?.regions?.panelBackground;
    const stackCount = Array.isArray(node.properties?.stackData) ? node.properties.stackData.length : 0;
    const detailBastaId = "basta_lora_detail_global_unique_id";
    const isDetailOpen = !!(window.xcpActiveBastas?.get(detailBastaId)?.hostNode === node);
    const hasOpenPicker = !!(window.__xcpHasActiveDropdown || window.__xcpHasActiveFileBrowser);
    const hasAwakeDom = !!(node._derpDomElements && Object.values(node._derpDomElements).some(el => el?._isAwake || document.activeElement === el));
    const canUse = !!(
        cacheReg &&
        stackCount > 0 &&
        !node._forceSync &&
        !node._layoutDirty &&
        !(Number(node._pendingImageLoads || 0) > 0) &&
        !node._dragTrig &&
        !node._dragThresholdMet &&
        !node._loraFloatingSnapshot &&
        !node._hasVisibleDerpEditorDom &&
        !node._hoveredRegionKey &&
        !node._pressedRegionKey &&
        !node._activeSliderKey &&
        !hasOpenPicker &&
        !hasAwakeDom &&
        !isDetailOpen &&
        (node._activeDetailSlot == null || node._activeDetailSlot < 0)
    );
    const valueHash = String(node._lastStackValues || "");
    const previewHash = Array.isArray(node._loraPreviewList) ? [...node._loraPreviewList].sort().join("|") : "";
    const key = canUse ? [
        Math.max(1, Math.round(cacheReg?.w || node.size?.[0] || 1)),
        Math.max(1, Math.round(cacheReg?.h || node.size?.[1] || 1)),
        node._layoutMapHash || "",
        valueHash,
        previewHash,
        node._currentThemeCacheKey || node._currentThemeName || "",
        node.mode || 0,
        node.properties?.contentCollapsed === true ? 1 : 0,
        node.properties?.nameDisplay || "",
        node.properties?.showCLIP === false ? 0 : 1,
        node.properties?.attentionMode || "",
        node.properties?.toggleLR ? 1 : 0,
        cacheScale,
    ].join("|") : null;
    return { canUse, cacheReg, key };
}

function getFathaVisibleLocalRect(node) {
    const canvas = app?.canvas?.canvas;
    const canvasDS = app?.canvas?.ds;
    const rect = canvas?.getBoundingClientRect?.();
    const scale = Number(canvasDS?.scale) || 1;
    if (!node || !rect || !(scale > 0)) return null;

    const offsetX = Number(canvasDS?.offset?.[0]) || 0;
    const offsetY = Number(canvasDS?.offset?.[1]) || 0;
    return {
        x: -offsetX - (Number(node.pos?.[0]) || 0),
        y: -offsetY - (Number(node.pos?.[1]) || 0),
        w: rect.width / scale,
        h: rect.height / scale,
    };
}

function drawPassiveWholeWallCache(node, ctx, cacheCanvas, cacheReg, fallbackScale = 1) {
    if (!cacheCanvas || !cacheReg) return false;

    const regX = Math.round(cacheReg.x || 0);
    const regY = Math.round(cacheReg.y || 0);
    const regW = Math.max(1, Math.round(cacheReg.w || node?.size?.[0] || 1));
    const regH = Math.max(1, Math.round(cacheReg.h || node?.size?.[1] || 1));
    const visible = getFathaVisibleLocalRect(node);
    if (!visible) {
        ctx.drawImage(cacheCanvas, regX, regY, regW, regH);
        return true;
    }

    const margin = 2;
    const drawX = Math.max(regX, Math.floor(visible.x) - margin);
    const drawY = Math.max(regY, Math.floor(visible.y) - margin);
    const drawRight = Math.min(regX + regW, Math.ceil(visible.x + visible.w) + margin);
    const drawBottom = Math.min(regY + regH, Math.ceil(visible.y + visible.h) + margin);
    const destW = drawRight - drawX;
    const destH = drawBottom - drawY;
    if (!(destW > 0) || !(destH > 0)) return true;

    const cacheScale = Math.max(1, Number(fallbackScale) || (cacheCanvas.width / regW) || 1);
    const sourceX = Math.max(0, Math.round((drawX - regX) * cacheScale));
    const sourceY = Math.max(0, Math.round((drawY - regY) * cacheScale));
    const sourceW = Math.max(1, Math.min(cacheCanvas.width - sourceX, Math.round(destW * cacheScale)));
    const sourceH = Math.max(1, Math.min(cacheCanvas.height - sourceY, Math.round(destH * cacheScale)));

    ctx.drawImage(cacheCanvas, sourceX, sourceY, sourceW, sourceH, drawX, drawY, sourceW / cacheScale, sourceH / cacheScale);
    return true;
}

function getWholeWallCacheGateValue(settingValue, fallbackValue) {
    const raw = String(settingValue ?? fallbackValue).trim().toLowerCase();
    if (raw === "none") return null;
    if (raw === "always") return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallbackValue;
}

function buildPassiveWholeWallCacheState(node, passiveCacheScale) {
    const typeName = String(node?.type || "").toLowerCase();
    if (typeName.includes("triggerwall")) {
        const cacheReg = node.layout?.regions?.panelBackground;
        const triggerWallCacheGate = getWholeWallCacheGateValue(
            window.DERP_GLOBAL_SETTINGS?.triggerWallWholeWallCacheGate,
            TRIGGER_WALL_WHOLE_WALL_CACHE_MIN_ITEMS
        );
        const triggerGroups = Array.isArray(node._triggerGroupData)
            ? node._triggerGroupData
            : (Array.isArray(node.properties?.triggerGroups) ? node.properties.triggerGroups : []);
        const triggerCount = triggerGroups.reduce((count, group) => {
            if (group?.hidden) return count;
            const triggers = Array.isArray(group?.triggers) ? group.triggers : [];
            return count + triggers.reduce((groupCount, trigger) => groupCount + (trigger?.hidden ? 0 : 1), 0);
        }, 0);
        const suspendUntil = Number(node._triggerWallCacheSuspendUntil || 0);
        const hasOpenPicker = !!(window.__xcpHasActiveDropdown || window.__xcpHasActiveFileBrowser);
        const canUse = !!(
            cacheReg &&
            triggerWallCacheGate !== null &&
            triggerCount >= triggerWallCacheGate &&
            !node._forceSync &&
            !node._layoutDirty &&
            performance.now() >= suspendUntil &&
            !hasOpenPicker &&
            !node._dragTrig &&
            !node._dragThresholdMet &&
            !node._floatingPreviewSnapshot &&
            !node._activeModalItemKey &&
            !node._triggerWallModalOpen
        );
        const key = canUse ? [
            Math.max(1, Math.round(cacheReg?.w || node.size?.[0] || 1)),
            Math.max(1, Math.round(cacheReg?.h || node.size?.[1] || 1)),
            node._layoutMapHash || "",
            node._currentThemeCacheKey || node._currentThemeName || "",
            node.mode || 0,
            node.properties?.contentCollapsed === true ? 1 : 0,
            node.properties?.settingActive === true ? 1 : 0,
            node.properties?.drawHeader === false ? 0 : 1,
            node._triggerWallVisualHash || "",
            node._hoveredRegionKey || "",
            node._pressedRegionKey || "",
            passiveCacheScale,
        ].join("|") : null;
        return { canUse, cacheReg, key, cacheSlot: "_triggerWallPassiveCanvasCache" };
    }

    if (typeName.includes("derplorastack")) {
        const cacheReg = node.layout?.regions?.panelBackground;
        const loraStackCacheGate = getWholeWallCacheGateValue(
            window.DERP_GLOBAL_SETTINGS?.loraStackWholeWallCacheGate,
            LORA_STACK_WHOLE_WALL_CACHE_MIN_ITEMS
        );
        const stackCount = Array.isArray(node.properties?.stackData) ? node.properties.stackData.length : 0;
        const detailBastaId = "basta_lora_detail_global_unique_id";
        const isDetailOpen = !!(window.xcpActiveBastas?.get(detailBastaId)?.hostNode === node);
        const suspendUntil = Number(node._passiveWholeWallCacheSuspendUntil || 0);
        const valueHash = String(node._lastStackValues || "");
        const previewHash = Array.isArray(node._loraPreviewList) ? [...node._loraPreviewList].sort().join("|") : "";
        const activeRegion = node._pressedRegionKey ? node.layout?.regions?.[node._pressedRegionKey] : null;
        const activeRegionType = String(activeRegion?.type || "");
        const hasOpenPicker = !!(window.__xcpHasActiveDropdown || window.__xcpHasActiveFileBrowser);
        const hasLiveControlInteraction = activeRegionType === UI_TYPES.SLIDER ||
            activeRegionType === UI_TYPES.DROPDOWN_DERP || activeRegionType === UI_TYPES.FILEBROWSER ||
            activeRegionType === UI_TYPES.DROPDOWN ||
            activeRegionType === UI_TYPES.EDITOR;
        const canUse = !!(
            cacheReg &&
            loraStackCacheGate !== null &&
            stackCount > loraStackCacheGate &&
            !node._forceSync &&
            !node._layoutDirty &&
            !(Number(node._pendingImageLoads || 0) > 0) &&
            performance.now() >= suspendUntil &&
            !node._dragTrig &&
            !node._dragThresholdMet &&
            !node._loraFloatingSnapshot &&
            !hasOpenPicker &&
            !node._hasVisibleDerpEditorDom &&
            !hasLiveControlInteraction &&
            !isDetailOpen &&
            (node._activeDetailSlot == null || node._activeDetailSlot < 0)
        );
        const key = canUse ? [
            Math.max(1, Math.round(cacheReg?.w || node.size?.[0] || 1)),
            Math.max(1, Math.round(cacheReg?.h || node.size?.[1] || 1)),
            node._layoutMapHash || "",
            valueHash,
            previewHash,
            node._currentThemeCacheKey || node._currentThemeName || "",
            node.mode || 0,
            node.properties?.contentCollapsed === true ? 1 : 0,
            node.properties?.nameDisplay || "",
            node.properties?.showCLIP === false ? 0 : 1,
            node.properties?.attentionMode || "",
            node.properties?.toggleLR ? 1 : 0,
            node._hoveredRegionKey || "",
            node._pressedRegionKey || "",
            passiveCacheScale,
        ].join("|") : null;
        return { canUse, cacheReg, key, cacheSlot: "_passiveWholeWallCanvasCache" };
    }

    if (typeName.includes("imagedeck")) {
        const cacheReg = node.layout?.regions?.panelBackground;
        const suspendUntil = Number(node._passiveWholeWallCacheSuspendUntil || 0);
        const activeRegion = node._pressedRegionKey ? node.layout?.regions?.[node._pressedRegionKey] : null;
        const activeRegionType = String(activeRegion?.type || "");
        const hasOpenPicker = !!(window.__xcpHasActiveDropdown || window.__xcpHasActiveFileBrowser);
        const hasAwakeDom = !!(node._derpDomElements && Object.values(node._derpDomElements).some(el => el?._isAwake));
        const hasLiveControlInteraction = activeRegionType === UI_TYPES.DROPDOWN_DERP ||
            activeRegionType === UI_TYPES.FILEBROWSER ||
            activeRegionType === UI_TYPES.DROPDOWN ||
            activeRegionType === UI_TYPES.EDITOR;
        const canUse = !!(
            cacheReg &&
            !node._forceSync &&
            !node._layoutDirty &&
            !(Number(node._pendingImageLoads || 0) > 0) &&
            node._derpImageDeckCrossfading !== true &&
            performance.now() >= suspendUntil &&
            !node._dragTrig &&
            !node._dragThresholdMet &&
            !hasOpenPicker &&
            !node._hasVisibleDerpEditorDom &&
            !hasAwakeDom &&
            !hasLiveControlInteraction
        );
        const imageListHash = Array.isArray(node._derpImageDeckList)
            ? node._derpImageDeckList.map(item => {
                if (!item || typeof item !== "object") return String(item || "");
                return `${item.filename || item.image || ""}|${item.type || "output"}|${item.subfolder || ""}`;
            }).join("\u0001")
            : "";
        const key = canUse ? [
            Math.max(1, Math.round(cacheReg?.w || node.size?.[0] || 1)),
            Math.max(1, Math.round(cacheReg?.h || node.size?.[1] || 1)),
            node._layoutMapHash || "",
            imageListHash,
            node._derpImageDeckIndex || 0,
            node._derpImageDeckDisplayUrl || "",
            node._derpImageDeckPrevDisplayUrl || "",
            node._currentThemeCacheKey || node._currentThemeName || "",
            node.mode || 0,
            node.properties?.contentCollapsed === true ? 1 : 0,
            node.properties?.imageDeckFilenamePrefix || "",
            node.properties?.imageDeckFilenameOverride || "",
            node.properties?.imageDeckCustomFolder || "",
            node.properties?.imageDeckSaveFormat || "",
            node.properties?.toggleModelInfo === false ? 0 : 1,
            node.properties?.toggleSamplerInfo === false ? 0 : 1,
            node.properties?.toggleSchedulerInfo === false ? 0 : 1,
            node.properties?.toggleAutoSave === true ? 1 : 0,
            node._hoveredRegionKey || "",
            node._pressedRegionKey || "",
            passiveCacheScale,
        ].join("|") : null;
        return { canUse, cacheReg, key, cacheSlot: "_imageDeckPassiveCanvasCache" };
    }

    return { canUse: false, cacheReg: null, key: null, cacheSlot: null };
}

function ensurePassiveCacheInteractionBindings(node, app) {
    if (!node?.layout?.regions) return;
    for (const [key, reg] of Object.entries(node.layout.regions)) {
        if (!reg?.type) continue;
        if (reg.type === UI_TYPES.SLIDER) {
            if (!reg._xcpPassiveCacheWrappedDragStart) {
                const originalOnDragStart = reg.onDragStart;
                reg.onDragStart = (...args) => {
                    suspendPassiveWholeWallCache(node);
                    if (typeof originalOnDragStart === "function") return originalOnDragStart(...args);
                    return false;
                };
                reg._xcpPassiveCacheWrappedDragStart = true;
            }
            if (!reg._xcpPassiveCacheWrappedPress) {
                const originalOnPress = reg.onPress;
                reg.onPress = (...args) => {
                    suspendPassiveWholeWallCache(node);
                    if (typeof originalOnPress === "function") return originalOnPress(...args);
                    return false;
                };
                reg._xcpPassiveCacheWrappedPress = true;
            }
        }
    }
}

// --- THE PERFECT HEIST (Ghost Slots & Selection Killer) ---
// By caching states and temporarily lying to LiteGraph during its render pass,
// we wipe out the native UI (dots & selection box) while keeping 100% functionality.
function scheduleSignalOutModeRefresh() {
    if (window._xcpSignalOutRefreshScheduled) return;
    window._xcpSignalOutRefreshScheduled = true;

    const runRefresh = () => {
        window._xcpSignalOutRefreshScheduled = false;
        const allNodes = app?.graph?._nodes || [];
        allNodes.forEach((n) => {
            if (n?.type === "xcpDerpSignalOut" && typeof n.forceSignalRefresh === "function") {
                n.forceSignalRefresh();
            }
        });
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(runRefresh);
        });
        return;
    }

    setTimeout(runRefresh, 0);
}

if (!window._xcpFathaGlobalHijack) {
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function (node, ctx) {
        const currentVueMode = !!(typeof LiteGraph !== "undefined" && LiteGraph.vueNodesMode);
        if (window._xcpLastVueNodesMode !== currentVueMode) {
            window._xcpLastVueNodesMode = currentVueMode;
            scheduleSignalOutModeRefresh();
        }

        // THE GLOBAL SLOT COLOR HIJACK: Apply Derp palette to ALL nodes' input/output dots
        if (window.xcpDerpTypeColors) {
            const applyColors = (slots) => {
                if (!slots) return;
                for (let i = 0; i < slots.length; i++) {
                    if (!slots[i] || !slots[i].type) continue;
                    let type = String(slots[i].type).toUpperCase();
                    if (type.includes("EMPTY") && type.includes("LATENT")) type = "EMPTY_LATENT";
                    else if (type.includes("LORA") && type.includes("STACK")) type = "LORA_STACK";
                    else if (type.includes("LORA")) type = "LORA";
                    else if (type === "*") type = "ANY";

                    if (window.xcpDerpTypeColors[type]) {
                        slots[i].color_off = window.xcpDerpTypeColors[type];
                        slots[i].color_on = window.xcpDerpTypeColors[type];
                    }
                }
            };
            applyColors(node.inputs);
            applyColors(node.outputs);
        }

        if (node.isFathaNode) {
            const drawStart = performance.now();
            suppressNativeVueNodeShell(node);
            // 1. Global Cull Sweeper Rescue (Restores DOM visibility when scrolled into view)
            node._lastDerpFrame = app.canvas?.frame;

            // 2. THE HEIST: Cache state and hide visuals
            node._xcpTrueSelected = node.selected;
            node._xcpTrueInMap = !!(app.canvas.selected_nodes && app.canvas.selected_nodes[node.id]);

            // GHOST SLOTS VOODOO: Cache true state so prototypes can calculate padding accurately
            node._xcpTrueInputs = node.inputs;
            node._xcpTrueOutputs = node.outputs;

            if (node.inputs) node.inputs = [];
            if (node.outputs) node.outputs = [];

            // Blind the selection engine to kill the dashed green box
            if (node.selected) node.selected = false;
            const mutateLegacySelection = shouldMutateLegacySelectionForDraw();
            if (mutateLegacySelection && node._xcpTrueInMap) delete app.canvas.selected_nodes[node.id];

            const isBypassed = node.mode === 4;
            if (isBypassed) {
                node.mode = 0;
                node._derpSpoofedBypass = true;
            }

            // EXECUTE DRAW (Suppresses native LiteGraph background and selection box)
            node.onDrawForeground(ctx);

            if (node._derpSpoofedBypass) {
                node.mode = 4;
                node._derpSpoofedBypass = false;
            }

            // 3. RESTORE REALITY: Re-enable slots and selection logic for interaction
            node.inputs = node._xcpTrueInputs;
            node.outputs = node._xcpTrueOutputs;
            if (node._xcpTrueSelected) node.selected = true;
            if (mutateLegacySelection && node._xcpTrueInMap) app.canvas.selected_nodes[node.id] = node;
            recordFathaOverlayPerf(node, performance.now() - drawStart);
        } else if (node.isUncleNode) {
            suppressNativeVueNodeShell(node);
            // UNCLE HEIST: Cache state and ghost slots (shared pattern with Fatha)
            node._xcpTrueSelected = node.selected;
            node._xcpTrueInMap = !!(app.canvas.selected_nodes && app.canvas.selected_nodes[node.id]);
            const keepSignalOutOutputsLive = node.type === "xcpDerpSignalOut";

            node._xcpTrueInputs = node.inputs;
            node._xcpTrueOutputs = node.outputs;
            if (node.inputs) node.inputs = [];
            if (node.outputs && !keepSignalOutOutputsLive) node.outputs = [];

            const isSelected = node._xcpTrueSelected || node._xcpTrueInMap;
            node._xcpGhosted = !isSelected;

            if (node.selected) node.selected = false;
            const mutateLegacySelection = shouldMutateLegacySelectionForDraw();
            if (mutateLegacySelection && node._xcpTrueInMap) delete app.canvas.selected_nodes[node.id];

            if (node.syncUncleSlots) node.syncUncleSlots();

            node.onDrawForeground(ctx);

            node.inputs = node._xcpTrueInputs;
            node.outputs = node._xcpTrueOutputs;
            node._xcpGhosted = false;
            if (node._xcpTrueSelected) node.selected = true;
            if (mutateLegacySelection && node._xcpTrueInMap) app.canvas.selected_nodes[node.id] = node;
        } else {
            originalDrawNode.apply(this, arguments);
        }
    };
    // THE LINK HIJACK: Force connections to use the Derp color palette
    if (!window._xcpLinkColorHijack) {
        const originalRenderLink = LGraphCanvas.prototype.renderLink;
        LGraphCanvas.prototype.renderLink = function (ctx, a, b, link, skip_border, flow, color, start_dir, end_dir) {
            const originId = link?.origin_id ?? link?.source_id;
            const originSlot = Number(link?.origin_slot ?? link?.source_slot);
            const originNode = originId !== undefined
                ? (app?.graph?.getNodeById?.(originId) || app?.graph?.getNodeById?.(Number(originId)))
                : null;
            if (originNode?.type === "xcpDerpSignalOut" && Number.isFinite(originSlot)) {
                originNode.syncUncleSlots?.();
                const slotPos = originNode.outputs?.[originSlot]?.pos || originNode._xcpTrueOutputs?.[originSlot]?.pos;
                if (Array.isArray(slotPos) && slotPos[0] !== -1000 && slotPos[1] !== -1000) {
                    a = [originNode.pos[0] + slotPos[0], originNode.pos[1] + slotPos[1]];
                }
            }

            if (link && link.type) {
                let type = String(link.type).toUpperCase();
                // Normalization for complex types
                if (type.includes("EMPTY") && type.includes("LATENT")) type = "EMPTY_LATENT";

                const derpColors = window.xcpDerpTypeColors;
                if (derpColors && derpColors[type]) {
                    color = derpColors[type];
                }
            }
            return originalRenderLink.call(this, ctx, a, b, link, skip_border, flow, color, start_dir, end_dir);
        };
        window._xcpLinkColorHijack = true;
    }

    if (!window._xcpMasterZSelectionHijack && app.canvas) {
        const originalSelectNode = app.canvas.selectNode;
        app.canvas.selectNode = function(node) {
            const result = originalSelectNode.apply(this, arguments);
            if (node?.isFathaNode || node?.isUncleNode) promoteMasterZ(node, app.graph || node.graph || null);
            return result;
        };

        const originalSelectNodes = app.canvas.selectNodes;
        if (typeof originalSelectNodes === "function") {
            app.canvas.selectNodes = function(nodes) {
                const result = originalSelectNodes.apply(this, arguments);
                const list = Array.isArray(nodes) ? nodes : Object.values(nodes || {});
                const target = list.find(node => node?.isFathaNode || node?.isUncleNode);
                if (target) promoteMasterZ(target, app.graph || target.graph || null);
                return result;
            };
        }

        window._xcpMasterZSelectionHijack = true;
    }
}

export function fatha(nodeType, nodeData, minWidth = 100) {
    nodeType.isFathaNode = true;
    nodeType.prototype.isFathaNode = true;
    nodeType.prototype.getDerpVars = getDerpVars;
    nodeType.prototype.transmitDerpSignal = transmitDerpSignal;
    nodeType.prototype.purgeDerpSignal = function() {
        purgeDerpSignal(this.id);
    };
    nodeType.prototype.handleThemeUpdate = function(config) {
        handleThemeUpdate(this, config);
    };
    const _fathaOnThemeUpdate = nodeType.prototype.onThemeUpdate;
    nodeType.prototype.onThemeUpdate = function(config) {
        if (_fathaOnThemeUpdate) {
            _fathaOnThemeUpdate.apply(this, arguments);
        } else {
            this.handleThemeUpdate(config);
            this.requestDerpSync();
        }
        syncDerpLocalizedDefaultTitle(this);
    };
    const _fathaApplyPalette = nodeType.prototype.applyPalette;
    nodeType.prototype.applyPalette = _fathaApplyPalette || function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        this.requestDerpSync();
    };
    nodeType.prototype.UI_TYPES = UI_TYPES;

    nodeType.prototype.drawNodeShape = function(ctx, canvas) { };
    nodeType.prototype.drawNodeBypass = function(ctx, canvas) { this.onDrawForeground(ctx); };
    nodeType.prototype.drawNode = function(ctx) {
        this.onDrawForeground(ctx);
    };

    nodeType.prototype.handleShieldInteraction = function(type, data) {
        return handleShieldInteraction(this, type, data);
    };

    nodeType.prototype.requestDerpSync = function() { handleDerpRequestSync(this); };
    nodeType.prototype.computeSize = function(out) { return handleDerpComputeSize(this, out, minWidth); };
    nodeType.prototype.collapse = function(force) { handleDerpCollapse(this, force); };

    const onModeChange = nodeType.prototype.onModeChange;
    nodeType.prototype.onModeChange = function(mode) {
        if (onModeChange) onModeChange.apply(this, arguments);
        if (this.isFathaNode && mode === 4) {
            this._derpSpoofedBypass = true;
        } else {
            this._derpSpoofedBypass = false;
        }
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
        if (onConfigure) onConfigure.apply(this, arguments);

        // THE SERIALIZATION SYNC: Restore the titleLabel to the instance for layout engine usage
        if (this.properties.titleLabel) this.titleLabel = this.properties.titleLabel;
        syncDerpLocalizedDefaultTitle(this);

        // THE REFRESH FIX: Re-resolve theme data once properties are restored from the workflow
        if (window.xcpDerpThemeConfig) {
            handleThemeUpdate(this, window.xcpDerpThemeConfig);
        }
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

        this.requestDerpSync();
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
        suppressNativeVueNodeShell(this);
        // THE ENGINE-LEVEL BYPASS FIX: Catch mode flips at the start of the frame to purge signals globally
        if (this._lastMode !== this.mode) {
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            if (isBypassed) {
                transmitBypassedDerpSignals(this, {
                    forceIndexedSingleOutput: !!this.properties?.skipGenericWirelessHeartbeat
                });
                if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);
            } else if (this.syncDerpOutputs) {
                this.syncDerpOutputs();
            }
            this._lastMode = this.mode;
        }

        // Update wireless registry if the title changed
        if (this._lastTitleLabel !== this.titleLabel) {
            this._lastTitleLabel = this.titleLabel;
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
        }

        if (this.flags?.collapsed) {
            if (this.interactionShield) this.interactionShield.style.display = "none";
            return;
        }
        if (drawDeckResizeOptimizedNode(this, ctx)) return;
        if (!this.layout) this.layout = new masterLayoutEngine(this);
        // THE COMP-DATA CACHE: Pre-allocate geometry objects to prevent per-frame garbage collection
        if (!this._compDataCache) this._compDataCache = {};

        const canvasDS = app.canvas.ds;
        const curX = this.pos[0], curY = this.pos[1];
        const curW = this.size[0], curH = this.size[1];
        const curS = canvasDS.scale;
        const curOX = canvasDS.offset[0], curOY = canvasDS.offset[1];

        // THE HEIST FIX: Read the true state cached by the Heist wrapper
        const isTrueSelected = this._xcpTrueSelected !== undefined ? this._xcpTrueSelected : this.selected;

        const hasLayoutChanged = !this._prevDerpState ||
            this._prevDerpState.sizeW !== curW || this._prevDerpState.sizeH !== curH ||
            this._prevDerpState.selected !== isTrueSelected ||
            this._prevDerpState.mode !== this.mode;

        const hasVisualChanged = !this._prevDerpState || hasLayoutChanged ||
            this._prevDerpState.posX !== curX || this._prevDerpState.posY !== curY ||
            this._prevDerpState.scale !== curS ||
            this._prevDerpState.offsetX !== curOX || this._prevDerpState.offsetY !== curOY ||
            this._prevDerpState.hoveredKey !== this._hoveredRegionKey;


        let isAnimating = false;

        if (this._derpAwakeFrames > 0) {
            this._derpAwakeFrames--;
            isAnimating = true;
            this.setDirtyCanvas(true, true);
            if (app.canvas) app.canvas.setDirty(true, true);
        }

        const panelActive = isHostActive(this.id);
        if (panelActive && !this._panelWasActive) {
            this._derpAwakeFrames = 10;
            this._panelWasActive = true;
        } else if (!panelActive) {
            this._panelWasActive = false;
        }

        const useAnim = this.properties.useAnimations !== false;
        const pressTarget = this._pressedRegionKey ? 1 : 0;
        const recoilRes = animateRecoil(this._visualPress || 0, pressTarget, undefined, useAnim);
        this._visualPress = recoilRes.value;
        if (recoilRes.isAnimating) isAnimating = true;

        if (canCullFathaNode(this, isTrueSelected, panelActive, isAnimating) &&
            isFathaNodeOutsideViewport(this, canvasDS, app.canvas?.canvas)) {
            this._isDerpCulled = true;
            setFathaNodeDomVisibility(this, false);
            this._shouldSync = false;
            return;
        }

        if (this._isDerpCulled) {
            this._isDerpCulled = false;
            setFathaNodeDomVisibility(this, true);
        }

        this._shouldSync = hasVisualChanged || this._forceSync || this._layoutDirty || (isAnimating && isTrueSelected);
        const needsLayoutCompute = hasLayoutChanged || this._forceSync || this._layoutDirty;
        const collapseStateChanged = this._prevContentCollapsed !== this.properties.contentCollapsed;
        if (this._layoutDirty) this._layoutDirty = false;

        if (this._prevContentCollapsed !== this.properties.contentCollapsed) {
            this._prevContentCollapsed = this.properties.contentCollapsed;
            if (this.layout) this.layout._lastCacheKey = "";
        }

        const { SNAP, autoWidth, autoHeight } = this.getDerpVars(this);
        const isMinState = this.properties.contentCollapsed;

        const preserveHorizontalDeckHeight = shouldPreserveHorizontalDeckHeight(this);
        const resolvedSize = resolveDerpRuntimeSize(this, {
            contentMinWidth: this.layout?.contentMinWidth || 0,
            contentMinHeight: this.layout?.contentMinHeight || 0,
            totalHeight: this.layout?.totalHeight || 0,
        }, { SNAP, autoWidth, autoHeight });
        const targetW = resolvedSize.width;
        const targetH = resolvedSize.height;

        // During live resize, preserve the manually dragged axis but still let the auto-managed
        // secondary axis respond immediately (e.g. width shrink causing auto-height growth).
        const lockHorizontalDeckResize = this._horizontalDeckWidthResizeLock === true || shouldLockDeckPressureSideHorizontalWidth(this);
        const lockedDeckPressureSideW = getDeckPressureSideHorizontalLockedWidth(this);
        const liveTargetW = lockedDeckPressureSideW > 0
            ? lockedDeckPressureSideW
            : ((this._isDerpResizing && !autoWidth) || lockHorizontalDeckResize ? this.size[0] : targetW);
        const liveTargetH = (this._isDerpResizing && !autoHeight) || lockHorizontalDeckResize ? this.size[1] : targetH;
        const preAnimateW = Number(this.size?.[0]) || 0;
        animateDerpSize(this, liveTargetW, liveTargetH, useAnim);
        balanceHorizontalDeckWidthChange(this, preAnimateW);

        const bounds = { x: 0, y: 0, w: this.size[0], h: this.size[1] };

        this.layout.compute(bounds, getVirtualNodeLayoutMap(this), {
            textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData,
            useAnim: false,
            spawnAnim: false,
            isVirtual: true
        }, needsLayoutCompute);

        if (preserveHorizontalDeckHeight) {
            if (!lockHorizontalDeckResize) {
                const postLayoutHeight = resolveHorizontalDeckSharedHeight(this);
                if (Number(postLayoutHeight) > 0 && this.size[1] !== postLayoutHeight) {
                    animateDerpSize(this, this.size[0], postLayoutHeight, useAnim);
                }
                if (Number(postLayoutHeight) > 0) syncHorizontalDeckHeight(this, postLayoutHeight);
                normalizeDerpDockedLayout(this);
            }
        } else if (shouldPreserveVerticalDeckWidth(this) || isComfyVueNodesMode()) {
            normalizeDerpDockedLayout(this);
        }

        if (this.properties.nodeSize && !isMinState) {
            if (lockedDeckPressureSideW > 0) this.properties.nodeSize[0] = lockedDeckPressureSideW;
            else if (autoWidth && !shouldPreserveVerticalDeckWidth(this) && !lockHorizontalDeckResize) this.properties.nodeSize[0] = targetW;
            if (autoHeight) this.properties.nodeSize[1] = preserveHorizontalDeckHeight
                ? (Number(this.size?.[1]) || targetH)
                : targetH;
        }

        // THE FOOTER SYNC: Anchor footer to the final physical bottom of the node
        const fReg = this.layout?.regions?.footerRegion;
        if (fReg && !this.properties.contentCollapsed) {
            const shiftY = (this.size[1] - (fReg.margin?.[3] || 0) - fReg.h) - fReg.y;
            if (Math.abs(shiftY) > 0.1) {
                Object.values(this.layout.regions).forEach(r => { if (r === fReg || r.isFooterChild) r.y += shiftY; });
            }
        }

        handleDrawCTX(this, ctx);

        const createPassiveCanvas = createFathaCacheCanvas;
        const passiveCacheScale = getPassiveWholeWallCacheScale(curS);
        const hasStructuralOrInteractionSync = !this._prevDerpState || hasLayoutChanged ||
            this._prevDerpState.hoveredKey !== this._hoveredRegionKey;
        const passiveWholeWall = isPassiveWholeWallCacheNode(this)
            ? buildPassiveWholeWallCacheState(this, passiveCacheScale)
            : { canUse: false, cacheReg: null, key: null, cacheSlot: null };
        const canUsePassiveWholeWallCache = !!(
            passiveWholeWall.canUse &&
            !hasStructuralOrInteractionSync
        );
        const loraWidgetLayer = buildLoraStackWidgetLayerCacheState(this, passiveCacheScale, !this._shouldSync && !needsLayoutCompute && !collapseStateChanged && !isAnimating);
        const loraWidgetLayerCache = this._loraStackWidgetLayerCanvasCache;
        if (loraWidgetLayer.canUse && loraWidgetLayerCache?.key === loraWidgetLayer.key && loraWidgetLayerCache?.canvas) {
            drawPassiveWholeWallCache(this, ctx, loraWidgetLayerCache.canvas, loraWidgetLayer.cacheReg, loraWidgetLayerCache.scale || passiveCacheScale);
            ensurePassiveCacheInteractionBindings(this, app);
            syncDerpShield(this);
            if (this._forceSync) this._forceSync = false;
            return;
        }
        const passiveWholeWallCache = passiveWholeWall.cacheSlot ? this[passiveWholeWall.cacheSlot] : null;

        if (canUsePassiveWholeWallCache && passiveWholeWallCache?.key === passiveWholeWall.key && passiveWholeWallCache?.canvas) {
            drawPassiveWholeWallCache(this, ctx, passiveWholeWallCache.canvas, passiveWholeWall.cacheReg, passiveWholeWallCache.scale || passiveCacheScale);
            ensurePassiveCacheInteractionBindings(this, app);
            syncDerpShield(this);
            if (this._shouldSync) {
                this._prevDerpState = {
                    posX: curX, posY: curY,
                    sizeW: curW, sizeH: curH,
                    scale: curS,
                    offsetX: curOX, offsetY: curOY,
                    selected: isTrueSelected,
                    mode: this.mode,
                    hoveredKey: this._hoveredRegionKey
                };
            }
            if (this._forceSync) this._forceSync = false;
            return;
        }

        if (this.layout?.regions) {
            ensurePassiveCacheInteractionBindings(this, app);
            const usedKeys = new Set();
            const cacheCanvas = canUsePassiveWholeWallCache ? createPassiveCanvas(
                Math.max(1, Math.round(passiveWholeWall.cacheReg?.w || this.size?.[0] || 1)),
                Math.max(1, Math.round(passiveWholeWall.cacheReg?.h || this.size?.[1] || 1)),
                passiveCacheScale
            ) : null;
            const widgetLayerCanvas = (!cacheCanvas && loraWidgetLayer.canUse) ? createFathaCacheCanvas(
                Math.max(1, Math.round(loraWidgetLayer.cacheReg?.w || this.size?.[0] || 1)),
                Math.max(1, Math.round(loraWidgetLayer.cacheReg?.h || this.size?.[1] || 1)),
                passiveCacheScale
            ) : null;
            const cacheCtx = cacheCanvas?.getContext?.("2d") || null;
            const widgetLayerCtx = widgetLayerCanvas?.getContext?.("2d") || null;
            const activeCtx = cacheCtx || widgetLayerCtx || ctx;

            if (cacheCtx) {
                cacheCtx.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);
                cacheCtx.save();
                cacheCtx.scale(passiveCacheScale, passiveCacheScale);
                cacheCtx.translate(-Math.round(passiveWholeWall.cacheReg.x || 0), -Math.round(passiveWholeWall.cacheReg.y || 0));
            }
            if (widgetLayerCtx) {
                widgetLayerCtx.clearRect(0, 0, widgetLayerCanvas.width, widgetLayerCanvas.height);
                widgetLayerCtx.save();
                widgetLayerCtx.scale(passiveCacheScale, passiveCacheScale);
                widgetLayerCtx.translate(-Math.round(loraWidgetLayer.cacheReg.x || 0), -Math.round(loraWidgetLayer.cacheReg.y || 0));
            }
            for (const [key, reg] of Object.entries(this.layout.regions)) {
                if (!reg.type || key === "systemBtn") continue;
                usedKeys.add(key);

                const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                if (!blueprint) continue;

                // Conservative draw culling: only skip canvas/hybrid widgets that are fully
                // outside the node's visible panel bounds. Layout and hit-testing remain intact.
                if (!blueprint.isHtml) {
                    const regX = reg.x || 0;
                    const regY = reg.y || 0;
                    const regW = reg.w || 0;
                    const regH = reg.h || 0;
                    if ((regX + regW) < 0 || regX > this.size[0] || (regY + regH) < 0 || regY > this.size[1]) {
                        continue;
                    }
                }

                // THE COMP-DATA CACHE: Reuse geometry and data objects unless a layout shift occurred
                let compData = this._compDataCache[key];
                if (needsLayoutCompute || collapseStateChanged || !compData) {
                    compData = { ...reg, key, useAnim, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } };
                    this._compDataCache[key] = compData;
                }

                if (!blueprint.isHtml && !blueprint.isHybrid && this._derpDomElements?.[key]) {
                    this._derpDomElements[key].remove();
                    delete this._derpDomElements[key];
                }

                if (blueprint.isHtml) {
                    if (!this._derpDomElements) this._derpDomElements = {};
                    let isNewElement = false;
                    if (!this._derpDomElements[key]) {
                        this._derpDomElements[key] = blueprint.create(reg);
                        document.body.appendChild(this._derpDomElements[key]);
                        isNewElement = true;
                    }
                    if (this._shouldSync || isNewElement) {
                        blueprint.sync(this._derpDomElements[key], this, app, compData);
                    }
                } else if (blueprint.isHybrid) {
                    blueprint.sync(activeCtx, this, app, compData);
                } else {
                    blueprint.sync(activeCtx, this, compData);
                }
            }

            handleDrawCTX(this, activeCtx, true);

            for (const [key, reg] of Object.entries(this.layout.regions)) {
                if (reg.strokeZIndex) {
                    const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                    if (blueprint && blueprint.isHybrid && this._compDataCache[key]) {
                        blueprint.sync(activeCtx, this, app, this._compDataCache[key], true);
                    }
                }
            }

            if (cacheCtx) {
                cacheCtx.restore();
                this[passiveWholeWall.cacheSlot] = {
                    key: passiveWholeWall.key,
                    canvas: cacheCanvas,
                    scale: passiveCacheScale,
                };
                drawPassiveWholeWallCache(this, ctx, cacheCanvas, passiveWholeWall.cacheReg, passiveCacheScale);
            }
            if (widgetLayerCtx) {
                widgetLayerCtx.restore();
                this._loraStackWidgetLayerCanvasCache = {
                    key: loraWidgetLayer.key,
                    canvas: widgetLayerCanvas,
                    scale: passiveCacheScale,
                };
                drawPassiveWholeWallCache(this, ctx, widgetLayerCanvas, loraWidgetLayer.cacheReg, passiveCacheScale);
            }

            if (this._derpDomElements) {
                for (const domKey in this._derpDomElements) {
                    if (!usedKeys.has(domKey)) {
                        this._derpDomElements[domKey].remove();
                        delete this._derpDomElements[domKey];
                    }
                }
            }
        }
        syncDerpShield(this);

        if (this._shouldSync) {
            this._prevDerpState = {
                posX: curX, posY: curY,
                sizeW: curW, sizeH: curH,
                scale: curS,
                offsetX: curOX, offsetY: curOY,
                selected: isTrueSelected,
                mode: this.mode,
                hoveredKey: this._hoveredRegionKey
            };
        }
        if (this._forceSync) this._forceSync = false;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function() {
        if (onRemoved) onRemoved.apply(this, arguments);
        if (isHostActive(this.id)) closeDerpSysPanel();

        if (this._derpDomElements) {
            Object.values(this._derpDomElements).forEach(el => { if (el && typeof el.remove === 'function') el.remove(); });
            this._derpDomElements = null;
        }

        for (const key in this) {
            if (Array.isArray(this[key])) {
                this[key].forEach(item => { if (item instanceof HTMLElement) item.remove(); });
            }
        }
        removeDerpShield(this);
        if (window.xcpDerpThemeConfig) window.xcpDerpThemeConfig.unregister(this);
    };

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
        if (onNodeCreated) onNodeCreated.apply(this, arguments);

        // THE ENGINE-LEVEL PROXY FIX: Globally silence custom child node broadcasters (like PromptBook) when bypassed
        if (typeof this.syncDerpOutputs === "function" && !this._derpSyncProxied) {
            const origSync = this.syncDerpOutputs;
            this.syncDerpOutputs = function() {
                if (this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass) {
                    transmitBypassedDerpSignals(this, {
                        forceIndexedSingleOutput: !!this.properties?.skipGenericWirelessHeartbeat
                    });
                    if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);
                    return;
                }
                return origSync.apply(this, arguments);
            };
            this._derpSyncProxied = true;
        }

        // THE COLOR FORMAT FIX: Use rgba(0,0,0,0) instead of "transparent" to satisfy ComfyUI's native colorUtil.ts
        Object.defineProperty(this, 'bgcolor', { get: () => "rgba(0,0,0,0)", set: () => {}, configurable: true });
        Object.defineProperty(this, 'color', { get: () => "rgba(0,0,0,0)", set: () => {}, configurable: true });
        Object.defineProperty(this, 'boxcolor', { get: () => "rgba(0,0,0,0)", set: () => {}, configurable: true });
        Object.defineProperty(this, 'title_mode', { get: () => LiteGraph.NO_TITLE, set: () => {}, configurable: true });
        this.title = "";

        if (!this.layout) this.layout = new masterLayoutEngine(this);
        createDerpShield(this);
        scheduleNativeVueNodeShellSuppression(this);
        const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;
        const existingProps = this.properties || {};
        const existingNodeSize = Array.isArray(existingProps.nodeSize)
            ? existingProps.nodeSize
            : (Array.isArray(this.size) ? this.size : null);
        this.properties = {
            titleLabel: "Virtual Node",
            selectedTheme: "_Templates/DerpTheme_Default",
            minWidth,
            nodeSize: existingNodeSize ? [...existingNodeSize] : [minWidth, 50],
            drawHeader: true,
            drawSignalBtn: false,
            drawSettingBtn: false,
            settingActive: false,
            contentCollapsed: false,
            collapseMinimal: false,
            stickyDrag: window.DERP_GLOBAL_SETTINGS?.stickyDrag ?? false,
            useAnimations,
            ...existingProps,
        };
        this.size = [...this.properties.nodeSize];

        // THE SIGNAL NAME COMPATIBILITY: Ensure virtual outputs have a valid name for masterSignalEngine
        if (!this.outputs || this.outputs.length === 0) {
            this.outputs = [{ name: this.properties.outputName || "Output_01", type: "*" }];
        }

        if (!this.flags) this.flags = {};
        this.flags.collapsed = false;

        if (window.xcpDerpThemeConfig) {
            window.xcpDerpThemeConfig.register(this);
            handleThemeUpdate(this, window.xcpDerpThemeConfig);
        }

        if (this.properties?.isWirelessTransmitter && this.transmitDerpSignal) {
            this._forceSync = true;
        }
    };
}

export function initDerpGlobalListener() {
    handleInitDerpGlobalListener(app);
}

if (!window._xcp_DerpVirtualLoader_Loaded) {
    window._xcp_DerpVirtualLoader_Loaded = true;
    try {
        app.registerExtension({
            name: "xcp.DerpVirtualLoader",
            init() {
                function DerpVirtualNode() {
                    this.serialize_widgets = true;
                    this.isFathaNode = true;
                    this.properties = { titleLabel: "Virtual Node", minWidth: 180, nodeSize: [180, 50], selectedTheme: "_Templates/DerpTheme_Default" };
                }
                DerpVirtualNode.title = "Derp Virtual Node";
                DerpVirtualNode.category = "DerpNodes/Virtual";
                fatha(DerpVirtualNode, {}, 180);
                LiteGraph.registerNodeType("DerpNodes/Virtual/LogicNode", DerpVirtualNode);
            },
            async setup() {
                initDerpGlobalListener();
                initPerfOverlay();
                if (!window.toggleDerpPerfOverlay) window.toggleDerpPerfOverlay = (force) => togglePerfOverlay(force);
                const orgOnDrawForeground = app.canvas.onDrawForeground;
                app.canvas.onDrawForeground = function(ctx) {
                    if (orgOnDrawForeground) orgOnDrawForeground.apply(this, arguments);
                    syncMasterZ(app.graph || null);

                    // Global Cull Sweeper (Hide DOM for off-screen nodes)
                    if (app.graph && app.graph._nodes) {
                        const currentFrame = app.canvas.frame;
                        // ZERO-INFERENCE OPTIMIZATION: Frame-gate the global loop to prevent O(N^2) layout thrashing per frame
                        if (window._lastFathaCullFrame !== currentFrame) {
                            window._lastFathaCullFrame = currentFrame;
                            app.graph._nodes.forEach(node => {
                                if (node.isFathaNode) {
                                    const frameGap = node._lastDerpFrame === undefined ? 999 : (currentFrame - node._lastDerpFrame);
                                    if (!node._isDerpCulled && frameGap > 2) {
                                        node._isDerpCulled = true;
                                        if (node.interactionShield) node.interactionShield.style.visibility = "hidden";
                                        if (node._derpDomElements) {
                                            setFathaNodeDomVisibility(node, false);
                                        }
                                    }
                                }
                            });
                        }
                    }

                     if (typeof drawDerpSysPanelGlobal === "function") drawDerpSysPanelGlobal(ctx);
                     if (typeof drawDeckPreviewGlobal === "function") drawDeckPreviewGlobal(ctx);
                     if (typeof drawSharedResizeSeamGhostsGlobal === "function") drawSharedResizeSeamGhostsGlobal(ctx);
                     // THE RENDER FIX: Actually call the Basta layer during the global draw pass
                     if (typeof drawDerpSignalOutGlobalWires === "function") drawDerpSignalOutGlobalWires(ctx);
                     if (typeof drawBastaLayer === "function") drawBastaLayer(ctx);
                    const fileBrowserBlueprint = COMPONENT_BLUEPRINTS[UI_TYPES.FILEBROWSER];
                    if (typeof fileBrowserBlueprint?.drawGlobalOverlay === "function") {
                        fileBrowserBlueprint.drawGlobalOverlay(ctx, app);
                    }
                 };
             },
         });
    } catch (e) {
        console.warn("xcp.DerpVirtualLoader extension already registered.");
    }
}
