/**
 * Path: ./grandFatha/uncle.js
 * ROLE: The Hybrid 'Uncle' framework. Combines Fatha's modern engine and system panel
 * while purging legacy slot logic and virtual space offsets.
 */
import { app } from "../../../../scripts/app.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "./core/fathaDOMshield.js";
import { masterLayoutEngine } from "./core/masterLayoutEngine.js";
import { handleShieldInteraction, handleDrawCTX, handleThemeUpdate, handleInitDerpGlobalListener, getDerpVars, handleDerpRequestSync, handleDerpComputeSize, handleDerpCollapse, animateDerpSize, drawDeckPreviewGlobal } from "./core/fathaHandler.js";
export { getDerpVars };
import { suppressDefaultWidgets, syncUncleSlots, lerpUnclePadding, drawUncleSlots } from "./helpers/uncleSlotHelper.js";
import { drawDerpSysPanelGlobal, isHostActive, closeDerpSysPanel, sysPanel } from "./helpers/fathaSysPanel.js";
import { drawBastaLayer } from "./basta.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./core/masterLayoutTypes.js";
import { getVirtualNodeLayoutMap } from "./helpers/fathaLayoutMaps.js";
import { transmitDerpSignal, purgeDerpSignal } from "./core/masterSignalEngine.js";
import { animateRecoil } from "../herbina/masterAnimator.js";

// THE SQUEEZE CONFIG: Centralized padding values for Uncle link-dots
const UNCLE_LINK_PAD = { LEFT: 15, RIGHT: 15 };

// --- THE PERFECT HEIST (Ghost Slots & Selection Killer) ---
// Injected directly into Uncle to wipe out native UI while keeping functionality.
if (!window._xcpUncleGhostSlotsHijack) {
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function(node, ctx) {
        if (node.isUncleNode) {
            // 1. Cache the true selection states so your custom UI still highlights
            node._xcpTrueSelected = node.selected;
            node._xcpTrueInMap = !!(app.canvas.selected_nodes && app.canvas.selected_nodes[node.id]);

            // 2. THE GHOST RECALL: Hide slots unless the node is active
            // This restores the visual 'Perfect Heist' while providing the data needed for the Squeeze logic
            // THE GHOST RECALL: Filter out internal wireless bridge wires from the visual drawing pass
            node._xcpTrueInputs = node.inputs;
            node._xcpTrueOutputs = node.outputs;
            const isSelected = node._xcpTrueSelected || node._xcpTrueInMap;
            const regions = node.layout?.regions || {};

            // THE FILTERED HEIST: Only present slots to the native renderer that are explicitly
            // defined in the current Layout Map via inSlotIdx or outSlotIdx.
            // THE FADE HEIST: Allow slots to remain visible while the alpha animation is active
            if (node.inputs) node.inputs = []; // THE MANUAL DRAW FIX: Blind LiteGraph completely to slots
            if (node.outputs) node.outputs = []; // THE MANUAL DRAW FIX: Blind LiteGraph completely to slots

            node._xcpGhosted = !isSelected;

            // 3. Blind the selection engine to kill the dashed green box
            if (node.selected) node.selected = false;
            if (node._xcpTrueInMap) delete app.canvas.selected_nodes[node.id];

            // 3.5 THE SLOT SYNC FIX: Force immediate slot alignment during the draw pass
            if (node.syncUncleSlots) node.syncUncleSlots();

            // EXECUTE DRAW (Suppresses native LiteGraph background and selection box)
            node.onDrawForeground(ctx);

            // 5. RESTORE REALITY: Put the arrays back immediately so mouse clicks and link wires still work
            node.inputs = node._xcpTrueInputs;
            node.outputs = node._xcpTrueOutputs;
            node._xcpGhosted = false;

            if (node._xcpTrueSelected) node.selected = true;
            if (node._xcpTrueInMap) app.canvas.selected_nodes[node.id] = node;
        } else {
            originalDrawNode.apply(this, arguments);
        }
    };
    window._xcpUncleGhostSlotsHijack = true;
}

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
        // THE ENGINE-LEVEL BYPASS FIX: Catch mode flips at the start of the frame to purge signals globally
        if (this._lastMode !== this.mode) {
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            if (isBypassed) {
                if (this.purgeDerpSignal) this.purgeDerpSignal();
                if (this._signalSyncDebouncer) clearTimeout(this._signalSyncDebouncer);
            } else if (this.syncDerpOutputs) {
                this.syncDerpOutputs();
            }
            this._lastMode = this.mode;
        }

        if (this.flags?.collapsed) {
            if (this.interactionShield) this.interactionShield.style.display = "none";
            this.syncUncleSlots(); // THE FIX: Keep slots pinned while collapsed
            if (this.drawUncleSlots) this.drawUncleSlots(ctx); // THE DRAW FIX: Render manual slots directly in node-space
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
        const canShowOutAnim = this.properties.showOutputs !== false;

        const targetL = (trueIn && trueIn.length > 0 && isTrueSelected && canShowInAnim) ? UNCLE_LINK_PAD.LEFT : 0;
        const targetR = (trueOut && trueOut.length > 0 && isTrueSelected && canShowOutAnim) ? UNCLE_LINK_PAD.RIGHT : 0;

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
        if (this._layoutDirty) this._layoutDirty = false;

        const { SNAP, autoWidth, autoHeight } = this.getDerpVars(this);
        const isMinState = this.properties.contentCollapsed;

        const contentReqW = this.layout?.contentMinWidth || 0;
        const engineFloorW = Math.ceil(contentReqW / SNAP) * SNAP;
        const rawH = this.layout?.contentMinHeight || this.layout?.totalHeight || 40;
        const engineFloorH = isMinState ? rawH : Math.ceil(rawH / SNAP) * SNAP;

        const collapseMinimal = this.properties?.collapseMinimal === true;
        const targetW = (autoWidth || (isMinState && collapseMinimal)) ? engineFloorW : Math.max(this.properties.nodeSize?.[0] || 0, engineFloorW);
        const targetH = (autoHeight || isMinState) ? engineFloorH : Math.max(this.properties.nodeSize?.[1] || 0, engineFloorH);

        // THE RESIZE INTERVENTION FIX: Skip animateDerpSize during active drag-resize.
        if (!this._isDerpResizing) animateDerpSize(this, targetW, targetH, useAnim);

        const bounds = { x: 0, y: 0, w: this.size[0], h: this.size[1] };

        if (this._prevContentCollapsed !== this.properties.contentCollapsed) {
            this._prevContentCollapsed = this.properties.contentCollapsed;
            if (this.layout) this.layout._lastCacheKey = "";
        }

        this.layout.compute(bounds, getVirtualNodeLayoutMap(this), {
            textTheme: this._t_textSmallPaintData || this._t_textNormalPaintData,
            useAnim: false,
            spawnAnim: false,
            isVirtual: true
        }, needsLayoutCompute);

        if (this.properties.nodeSize && !isMinState) {
            if (autoWidth) this.properties.nodeSize[0] = targetW;
            if (autoHeight) this.properties.nodeSize[1] = targetH;
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
                    if (this._shouldSync || isNewElement) {
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
                    if (this.purgeDerpSignal) this.purgeDerpSignal();
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
        const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;
        this.properties = { titleLabel: "Node", showInputs: true, showOutputs: true, ...(this.properties || {}), minWidth: minWidth, nodeSize: [minWidth, 50], drawHeader: true, drawSignalBtn: false, drawSettingBtn: false, settingActive: false, contentCollapsed: false, collapseMinimal: false, stickyDrag: true, useAnimations };
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
