/**
 * Path: ./grandFatha/uncle.js
 * ROLE: The Hybrid 'Uncle' framework. Combines Fatha's modern engine and system panel
 * while purging legacy slot logic and virtual space offsets.
 */
import { app } from "../../../../scripts/app.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "./core/fathaDOMshield.js";
import { masterLayoutEngine } from "./core/masterLayoutEngine.js";
import { handleShieldInteraction, handleDrawCTX, handleThemeUpdate, handleInitDerpGlobalListener, getDerpVars, handleDerpRequestSync, handleDerpComputeSize, handleDerpCollapse, animateDerpSize, drawDeckPreviewGlobal, shouldPreserveHorizontalDeckHeight, shouldPreserveVerticalDeckWidth, balanceHorizontalDeckWidthChange, syncHorizontalDeckHeight, resolveDerpRuntimeSize, resolveHorizontalDeckSharedHeight, normalizeDerpDockedLayout, syncDerpLocalizedDefaultTitle, drawDeckResizeOptimizedNode } from "./core/fathaHandler.js";
export { getDerpVars };
import { suppressDefaultWidgets, syncUncleSlots, lerpUnclePadding, drawUncleSlots } from "./helpers/uncleSlotHelper.js";
import { drawDerpSysPanelGlobal, isHostActive, closeDerpSysPanel, sysPanel } from "./helpers/fathaSysPanel.js";
import { drawBastaLayer } from "./basta.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./core/masterLayoutTypes.js";
import { getVirtualNodeLayoutMap } from "./helpers/fathaLayoutMaps.js";
import { transmitBypassedDerpSignals, transmitDerpSignal, purgeDerpSignal } from "./core/masterSignalEngine.js";
import { animateRecoil } from "../herbina/masterAnimator.js";
import { scheduleNativeVueNodeShellSuppression, suppressNativeVueNodeShell } from "./core/fathaNode2Compat.js";

// THE SQUEEZE CONFIG: Centralized padding values for Uncle link-dots
const UNCLE_LINK_PAD = { LEFT: 15, RIGHT: 15 };
const UNCLE_OVERLAY_WINDOW_MS = 4000;

function ensureUncleOverlayPerf(node) {
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

function trimUncleOverlayPerf(perf, now) {
    if (!perf?.samples) return;
    const cutoff = now - UNCLE_OVERLAY_WINDOW_MS;
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

function recordUncleOverlayPerf(node, drawMs) {
    const perf = ensureUncleOverlayPerf(node);
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
    trimUncleOverlayPerf(perf, ts);
}

// Uncle heist now lives in fatha.js unified drawNode wrapper
window._xcpUncleGhostSlotsHijack = true;

export function uncle(nodeType, nodeData, minWidth = 100) {
    // THE IDENTITY FIX: Core identity changed to Uncle
    nodeType.isUncleNode = true;
    nodeType.prototype.isUncleNode = true;
    nodeType.prototype.getDerpVars = getDerpVars;
    nodeType.prototype.transmitDerpSignal = transmitDerpSignal;
    nodeType.prototype.purgeDerpSignal = function() {
        purgeDerpSignal(this.id);
    };
    nodeType.prototype.handleThemeUpdate = function(config) {
        handleThemeUpdate(this, config);
    };
    // THE FIX: Standardize the listener hook so the global refresher can find it
    nodeType.prototype.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        syncDerpLocalizedDefaultTitle(this);
        this.requestDerpSync();
    };
    nodeType.prototype.applyPalette = function() {
        if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
        this.requestDerpSync();
    };
    nodeType.prototype.UI_TYPES = UI_TYPES;
    nodeType.prototype.suppressDefaultWidgets = function() { suppressDefaultWidgets(this); };
    nodeType.prototype.syncUncleSlots = function() { syncUncleSlots(this); };
    nodeType.prototype.drawUncleSlots = function(ctx) { drawUncleSlots(this, ctx); };
    // THE WIRELESS BRIDGE: Expose the signal engine to the prototype
    nodeType.prototype.transmitDerpSignal = function(value) {
        transmitDerpSignal(this, value);
    };

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

    nodeType.prototype.getConnectionPos = function(is_input, slot_number, out) {
        out = out || new Float32Array(2);

        const slots = is_input ? (this._xcpTrueInputs || this.inputs) : (this._xcpTrueOutputs || this.outputs);
        const slot = slots?.[slot_number];
        if (slot?.pos && slot.pos[0] !== -1000 && slot.pos[1] !== -1000) {
            out[0] = this.pos[0] + slot.pos[0];
            out[1] = this.pos[1] + slot.pos[1];
            return out;
        }

        if (!is_input && (this.properties?.showOutputs === false || this.isPureVirtual)) {
            out[0] = this.pos[0] + this.size[0];
            out[1] = this.pos[1] + 25;
            return out;
        }

        const num_slots = is_input ? (this.inputs ? this.inputs.length : 0) : (this.outputs ? this.outputs.length : 0);
        if (slot_number >= num_slots) {
            out[0] = this.pos[0];
            out[1] = this.pos[1];
            return out;
        }

        const offset = typeof LiteGraph !== "undefined" ? LiteGraph.NODE_SLOT_HEIGHT : 20;
        if (is_input) {
            out[0] = this.pos[0] + (this._padL || 0);
            out[1] = this.pos[1] + offset * (slot_number + 1);
        } else {
            out[0] = this.pos[0] + this.size[0] - (this._padR || 0);
            out[1] = this.pos[1] + offset * (slot_number + 1);
        }
        return out;
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
        const uncleDrawStart = performance.now();
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
            this.syncUncleSlots(); // THE FIX: Keep slots pinned while collapsed
            if (this.drawUncleSlots) this.drawUncleSlots(ctx); // THE DRAW FIX: Render manual slots directly in node-space
            return;
        }
        if (drawDeckResizeOptimizedNode(this, ctx)) {
            recordUncleOverlayPerf(this, performance.now() - uncleDrawStart);
            return;
        }
        if (!this.layout) this.layout = new masterLayoutEngine(this);

        const canvasDS = app.canvas.ds;
        const curX = this.pos[0], curY = this.pos[1];
        const curW = this.size[0], curH = this.size[1];
        const curS = canvasDS.scale;
        const curOX = canvasDS.offset[0], curOY = canvasDS.offset[1];

        // THE HEIST FIX: Read the true state cached by the Fatha wrapper
        const isTrueSelected = this._xcpTrueSelected !== undefined ? this._xcpTrueSelected : this.selected;

        // THE PROTOTYPE BOUNDARY SQUEEZE: Check the Heist cache to see if slots actually exist
        const trueIn = this._xcpTrueInputs || this.inputs;
        const trueOut = this._xcpTrueOutputs || this.outputs;
        const useAnim = this.properties.useAnimations !== false;

        // THE PROTOTYPE BOUNDARY SQUEEZE: Define targets before calling the lerp function
        const canShowInAnim = this.properties.showInputs !== false;
        const keepRouterOutputSlotsVisible = this.type === "xcpDerpSignalOut" && this.properties?.hideLinkSlots === false;
        const canShowOutAnim = this.properties.showOutputs !== false;

        const targetL = (trueIn && trueIn.length > 0 && isTrueSelected && canShowInAnim) ? UNCLE_LINK_PAD.LEFT : 0;
        const targetR = (trueOut && trueOut.length > 0 && canShowOutAnim && (isTrueSelected || keepRouterOutputSlotsVisible)) ? UNCLE_LINK_PAD.RIGHT : 0;

        // THE LERP ANIMATION: Smoothly transition padding values for the Squeeze
        // THE REORDER FIX: Execute lerp BEFORE _shouldSync check to influence current frame
        lerpUnclePadding(this, targetL, targetR, useAnim);
        const padL = this._padL || 0;
        const padR = this._padR || 0;

        const hasLayoutChanged = !this._prevDerpState ||
            this._prevDerpState.sizeW !== curW || this._prevDerpState.sizeH !== curH ||
            this._prevDerpState.selected !== isTrueSelected ||
            this._prevDerpState.mode !== this.mode ||
            this._prevDerpState.padL !== padL || this._prevDerpState.padR !== padR;

        const hasVisualChanged = !this._prevDerpState || hasLayoutChanged ||
            this._prevDerpState.posX !== curX || this._prevDerpState.posY !== curY ||
            this._prevDerpState.scale !== curS ||
            this._prevDerpState.offsetX !== curOX || this._prevDerpState.offsetY !== curOY ||
            this._prevDerpState.hoveredKey !== this._hoveredRegionKey;
        let isAnimating = false;

        if (this._derpAwakeFrames > 0) {
            this._derpAwakeFrames--;
            isAnimating = true;
            if (isTrueSelected) this.setDirtyCanvas(true, true);
        }

        const panelActive = isHostActive(this.id);
        if (panelActive && !this._panelWasActive) {
            this._derpAwakeFrames = 10;
            this._panelWasActive = true;
        } else if (!panelActive) {
            this._panelWasActive = false;
        }

        const pressTarget = this._pressedRegionKey ? 1 : 0;
        const recoilRes = animateRecoil(this._visualPress || 0, pressTarget, undefined, useAnim);
        this._visualPress = recoilRes.value;
        if (recoilRes.isAnimating) isAnimating = true;

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

        if (Number(this._allowDockContentHeightShiftFrames) > 0) {
            this.layout.compute({ x: 0, y: 0, w: this.size[0], h: this.size[1] }, getVirtualNodeLayoutMap(this), {
                textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData,
                useAnim: false,
                spawnAnim: false,
                isVirtual: true
            }, true);
        }

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
        const lockHorizontalDeckResize = this._horizontalDeckWidthResizeLock === true;
        const liveTargetW = (this._isDerpResizing && !autoWidth) || lockHorizontalDeckResize ? this.size[0] : targetW;
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
        } else if (shouldPreserveVerticalDeckWidth(this) || (typeof LiteGraph !== "undefined" && LiteGraph.vueNodesMode)) {
            normalizeDerpDockedLayout(this);
        }

        if (this.properties.nodeSize && !isMinState) {
            if (autoWidth && !shouldPreserveVerticalDeckWidth(this)) this.properties.nodeSize[0] = targetW;
            if (autoHeight) this.properties.nodeSize[1] = preserveHorizontalDeckHeight
                ? (Number(this.size?.[1]) || targetH)
                : targetH;
        }

        // THE FOOTER SYNC: Anchor footer to the final physical bottom of the node
        const fReg = this.layout?.regions?.footerRegion;
        if (fReg && !this.properties.contentCollapsed) {
            // PURE MATH FIX: Direct anchor to the exact physical bottom of the node
            const shiftY = (this.size[1] - (fReg.margin?.[3] || 0) - fReg.h) - fReg.y;

            if (Math.abs(shiftY) > 0.1) {
                Object.values(this.layout.regions).forEach(r => { if (r === fReg || r.isFooterChild) r.y += shiftY; });
            }
        }

        handleDrawCTX(this, ctx);

        this.suppressDefaultWidgets();
        syncUncleSlots(this); // Sync logical slot positions for connection handling
        if (this.drawUncleSlots) this.drawUncleSlots(ctx); // THE DRAW FIX: Render manual slots directly in node-space

        if (this.layout?.regions) {
            const usedKeys = new Set();

            for (const [key, reg] of Object.entries(this.layout.regions)) {
                if (key === "systemBtn") continue;
                if (!reg.type && !reg.drawRegionAbove) continue;

                if (reg.drawRegion && reg.drawRegionAbove) {
                    handleDrawCTX(this, ctx, true, key);
                }

                if (!reg.type) continue;
                usedKeys.add(key);

                if (!COMPONENT_BLUEPRINTS) break;
                const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                if (!blueprint) continue;

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
                    if (this._shouldSync || collapseStateChanged || isNewElement) {
                        blueprint.sync(this._derpDomElements[key], this, app, { ...reg, key, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } });
                    }
                } else if (blueprint.isHybrid) {
                    blueprint.sync(ctx, this, app, { ...reg, key, useAnim, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } });
                } else {
                    blueprint.sync(ctx, this, { ...reg, key, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } });
                }
            }

            handleDrawCTX(this, ctx, true);

            for (const [key, reg] of Object.entries(this.layout.regions)) {
                if (reg.strokeZIndex) {
                    const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                    if (blueprint && blueprint.isHybrid) {
                        blueprint.sync(ctx, this, app, { ...reg, key, useAnim, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } }, true);
                    }
                }
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

        recordUncleOverlayPerf(this, performance.now() - uncleDrawStart);

        if (this._shouldSync) {
            this._prevDerpState = {
                posX: curX, posY: curY,
                sizeW: curW, sizeH: curH,
                scale: curS,
                offsetX: curOX, offsetY: curOY,
                selected: isTrueSelected,
                mode: this.mode,
                padL, padR, // THE SYNC FIX: Cache padding values
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
            Object.values(this._derpDomElements).forEach(el => {
                if (el && typeof el.remove === 'function') el.remove();
            });
            this._derpDomElements = null;
        }

        for (const key in this) {
            if (Array.isArray(this[key])) {
                this[key].forEach(item => {
                    if (item instanceof HTMLElement) {
                        item.remove();
                    }
                });
            }
        }
        removeDerpShield(this);
        if (window.xcpDerpThemeConfig) window.xcpDerpThemeConfig.unregister(this);
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
        if (onConfigure) onConfigure.apply(this, arguments);

        // THE SERIALIZATION SYNC: Restore the titleLabel to the instance for layout engine usage
        if (this.properties.titleLabel) this.titleLabel = this.properties.titleLabel;
        syncDerpLocalizedDefaultTitle(this);

        // THE REFRESH FIX: Re-resolve theme data once properties are loaded from the workflow file
        if (window.xcpDerpThemeConfig) {
            handleThemeUpdate(this, window.xcpDerpThemeConfig);
        }
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        this.requestDerpSync();
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

        createDerpShield(this);
        scheduleNativeVueNodeShellSuppression(this);
        const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;
        const existingProps = this.properties || {};
        const existingNodeSize = Array.isArray(existingProps.nodeSize)
            ? existingProps.nodeSize
            : (Array.isArray(this.size) ? this.size : null);
        this.properties = {
            titleLabel: "Node",
            showInputs: true,
            showOutputs: true,
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

        // THE SIGNAL NAME COMPATIBILITY: Ensure outputs have a valid name for masterSignalEngine
        if (!this.outputs || this.outputs.length === 0) {
            this.outputs = [{ name: this.properties.outputName || "Output_01", type: "*" }];
        } else {
            this.outputs.forEach((out, i) => {
                if (!out.name || out.name === "" || out.name === "\u200b") {
                    out.name = this.properties.outputName || `Output_${String(i + 1).padStart(2, '0')}`;
                }
            });
        }

        // THE CONSOLIDATION FIX: Initialize centralized padding values
        this._padL = 0;
        this._padR = 0;

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

// --- GLOBAL UNCLE OVERLAY ---
// Removed redundant draw hooks. Floating overlays (Basta/SysPanel) are
// centrally managed by fatha.js to prevent double-execution errors.
