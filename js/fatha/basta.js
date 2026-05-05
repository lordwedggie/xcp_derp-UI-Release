/**
 * PATH: ./js/fatha/basta.js
 * ROLE: The "Basta" (Bastard) Child Framework.
 * PURPOSE: A multi-instance, canvas-native replacement for the Singleton Engine.
 * It inherits Fatha's layout and rendering DNA but lives in the global overlay layer.
 */
import { app } from "../../../scripts/app.js";
import { masterLayoutEngine } from "./core/masterLayoutEngine.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "./core/fathaDOMshield.js";
import { COMPONENT_BLUEPRINTS } from "./core/masterLayoutTypes.js";
import { handleShieldInteraction, getDerpVars, handleThemeUpdate, handleDrawCTX, handleDerpRequestSync } from "./core/fathaHandler.js";
import { animateAlpha, lerpTo } from "../herbina/masterAnimator.js";
import { getBastaBaseMap } from "./helpers/bastaLayoutMaps.js";

const BASTA_FADE_SPEED = 0.4;

// Global Registry for active Bastas
export const activeBastas = new Map();
window.xcpActiveBastas = activeBastas;

/**
 * BastaInstance: The internal controller for a floating canvas entity.
 */
class BastaInstance {
    constructor(id, config) {
        this.id = id;
        this.dynamicElements = {};
        this.hostNode = config.host || null;
        this.targetRegion = config.targetRegion || null; // THE PINNING FIX: Persist the anchor key
        this.themeName = config.themeName || this.hostNode?.properties?.selectedTheme;
        this.titleLabel = config.titleLabel || this.hostNode?.titleLabel || "Basta Panel";
        this.layoutMap = config.layoutMap || {};

        // State
        this.pos = config.pos || [0, 0];
        this.alpha = 0;
        this.isClosing = false;

        this.animations = {
            fade: config.animations?.fade !== false
        };
        this.onClose = config.onClose;

        const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;
        this.properties = {
            selectedTheme: this.themeName,
            minWidth: config.minWidth || (config.initialSize ? config.initialSize[0] : 150),
            bastaMovalbe: false,
            bastaSingleton: false,
            bastaSelectable: false,
            autoWidth: true,
            autoHeight: true,
            snapHeight: false,
            useAnimations,
            ...config.properties
        };
        this.layout = new masterLayoutEngine(this);

        if (window.xcpDerpThemeConfig) {
            window.xcpDerpThemeConfig.register(this);
            handleThemeUpdate(this, window.xcpDerpThemeConfig);
        }

        this.targetSize = config.initialSize ? [...config.initialSize] : [150, 50];

        if (this.properties.autoHeight !== false || this.properties.autoWidth !== false) {
            // THE PRE-COMPUTE FIX: Use the full base map including headers/footers to get accurate initial dimensions
            const bMap = getBastaBaseMap(this);
            if (this.properties.drawHeader === false) {
                if (bMap.headerRegion) bMap.headerRegion.hidden = true;
                if (bMap.footerRegion) bMap.footerRegion.hidden = true;
            }
            const tTheme = this.hostNode?._t_textnormalPaintData || this.hostNode?._t_textNormalPaintData || this._t_textNormalPaintData;

            // THE SPAWN JUMP FIX: Perform a multi-pass layout compute during instantiation to resolve nested auto-height dependencies
            for (let i = 0; i < 2; i++) {
                this.layout.compute({ x: 0, y: 0, w: this.targetSize[0], h: 0 }, bMap, { textTheme: tTheme, isVirtual: true }, true);
                if (this.properties.autoWidth !== false && this.layout.contentMinWidth > 0) {
                    this.targetSize[0] = Math.max(this.properties.minWidth || 0, this.layout.contentMinWidth);
                }
                if (this.properties.autoHeight !== false && this.layout.totalHeight > 0) {
                    const { SNAP } = this.getDerpVars();
                    this.targetSize[1] = this.properties.snapHeight === true ? Math.ceil(this.layout.totalHeight / SNAP) * SNAP : this.layout.totalHeight;
                }
            }
        }

        if (config.initialSize || this.targetSize) {
            this.size = [...this.targetSize];
            if (this.properties) this.properties.nodeSize = [...this.targetSize];
        }

        // THE PERSISTENCE FIX: Prioritize the user's manual resize (savedSize) over the initial code value.
        // This allows resizable panels to maintain their width across sessions and model swaps.
        if (this.hostNode && this.hostNode.properties[`bastaSize_${this.id}`]) {
            const savedSize = this.hostNode.properties[`bastaSize_${this.id}`];
            const loadW = Math.max(this.properties.minWidth || 0, savedSize[0]);
            this.targetSize = [loadW, savedSize[1]];
        }

        this.offset = config.offset || [0, 0];

        // Region Anchoring Math
        if (this.hostNode && this.targetRegion) {
            const { oY } = this.getDerpVars();
            // THE POSITION STABILITY FIX: Ensure target region properties exist before calculation to prevent NaN/Zero offsets
            const target = this.hostNode.layout?.regions?.[this.targetRegion];

            if (target) {
                // Pinning: Bottom of Basta to Top of Caller, centered horizontally on Caller.
                this.offset = [
                    Math.round(target.x + (target.w / 2) - (this.targetSize[0] / 2)),
                    Math.round(target.y - this.targetSize[1] - oY)
                ];
            } else {
                // Fallback: Center-top of Node
                this.offset = [
                    Math.round((this.hostNode.size[0] / 2) - (this.targetSize[0] / 2)),
                    Math.round(-this.targetSize[1] - oY)
                ];
            }
        }

        if (this.hostNode && this.hostNode.properties[`bastaOffset_${this.id}`]) {
            this.offset = [...this.hostNode.properties[`bastaOffset_${this.id}`]];
        }

        this.size = [...this.targetSize];
        this._padL = 0;
        this._padR = 0;

        this.properties.nodeSize = [...this.targetSize];
        this._derpAwakeFrames = 0;
        this._forceSync = true;

        this.baseZIndex = "10000";
        createDerpShield(this);
        if (this.interactionShield) {
            this.interactionShield.style.zIndex = this.baseZIndex;
        }

        activeBastas.set(this.id, this);
        if (this.hostNode && this.hostNode.refreshNodeLayoutMap) this.hostNode.refreshNodeLayoutMap();
    }

    onThemeUpdate(config) {
        handleThemeUpdate(this, config);
        this._layoutDirty = true;
        this._forceSync = true;
        this.setDirtyCanvas(true, true);
    }

    requestDerpSync() {
        handleDerpRequestSync(this);
    }

    // Fatha Interface Requirements
    getDerpVars() {
        const baseVars = this.hostNode?.getDerpVars ? this.hostNode.getDerpVars(this.hostNode) : getDerpVars(this);
        return {
            ...baseVars,
            // THE MIN-WIDTH FIX: Prioritize the Basta's internal minWidth property to override host node inheritance
            minWidth: (this.properties.minWidth !== undefined) ? this.properties.minWidth : baseVars.minWidth,
            autoWidth: this.properties.autoWidth !== false,
            autoHeight: this.properties.autoHeight !== false
        };
    }

    setDirtyCanvas(b1, b2) {
        if (app.canvas) app.canvas.setDirty(b1, b2);
    }

    handleShieldInteraction(type, data) {
        let handled = handleShieldInteraction(this, type, data);
        const absorbed = type === "click" && !handled && this.properties.bastaSelectable === false;

        if (type === "dragStart") this._isDraggingBasta = !this._pressedRegionKey;
        if (type === "dragEnd") {
            this._isDraggingBasta = false;
            if (this.hostNode && (!this.properties.autoWidth || !this.properties.autoHeight)) {
                this.hostNode.properties[`bastaSize_${this.id}`] = [...this.size];
            }
            if (app.graph && app.graph.change) app.graph.change();
        }

        if (type === "click" && !handled && this.properties.clickToClose !== false) {
            this.close();
        }
        return handled || absorbed;
    }

    update() {
        // THE ORPHAN CHECK: If the host node is deleted (removed from graph), close the Basta panel
        if (this.hostNode && !this.isClosing) {
            // THE NESTED BASTA FIX: Allow Bastas to host other Bastas (like Messages) without failing the graph check
            if (this.hostNode instanceof BastaInstance) {
                if (this.hostNode.isClosing) this.close();
            } else if (!this.hostNode.graph) {
                this.close();
            }
        }

        if (this.properties.nodeSize) {
            this.targetSize[0] = this.properties.nodeSize[0];
            this.targetSize[1] = this.properties.nodeSize[1];
        }

        if (this.hostNode) {
            if (this.properties.bastaMovalbe && this._isDraggingBasta) {
                this.offset = [this.pos[0] - this.hostNode.pos[0], this.pos[1] - this.hostNode.pos[1]];
                this.hostNode.properties[`bastaOffset_${this.id}`] = [...this.offset];
            } else {
                this.pos = [this.hostNode.pos[0] + this.offset[0], this.hostNode.pos[1] + this.offset[1]];
            }
        }

        const targetAlpha = this.isClosing ? 0 : 1;
        const alphaRes = animateAlpha(this.alpha, targetAlpha, BASTA_FADE_SPEED, this.animations.fade);
        this.alpha = alphaRes.value;

        this.size = [...this.targetSize];

        if (this.isClosing && this.alpha <= 0.01) {
            this.alpha = 0;
            this.destroy();
            return false;
        }

        return alphaRes.isAnimating;
    }

    draw(ctx) {
        if (this.alpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.pos[0], this.pos[1]);

        const paintKey = "t_textNormal";
        const rawTheme = this[`_${paintKey}PaintData`] || this.hostNode?.[`_${paintKey}PaintData`] || { fontSize: 12, font: "arial", fill: "red" };
        const engineTextTheme = { ...rawTheme, font: rawTheme.font.replace(" px", "") };

        const ds = app.canvas.ds;
        const hasLayoutChanged = !this._prevBastaState ||
            this._prevBastaState.sizeW !== this.size[0] || this._prevBastaState.sizeH !== this.size[1];

        const hasVisualChanged = !this._prevBastaState || hasLayoutChanged ||
            this._prevBastaState.posX !== this.pos[0] || this._prevBastaState.posY !== this.pos[1] ||
            this._prevBastaState.scale !== ds.scale ||
            this._prevBastaState.offsetX !== ds.offset[0] || this._prevBastaState.offsetY !== ds.offset[1];

        // THE STRUCTURAL HASH GATE: Prevent 20fps loss by skipping layout generation if state is static.
        // THE PERF FIX: Remove alpha from the structure hash so fade animations don't trigger deep layout computes
        const structureHash = `${app.canvas.ds.scale}_${window._xcpDerpSession}_${this.hostNode?._layoutMapHash || ""}`;
        const needsLayoutCompute = this._forceSync || this._layoutDirty || hasLayoutChanged || (this._lastStructureHash !== structureHash);
        const needsSync = this._forceSync || hasVisualChanged || (this._lastStructureHash !== structureHash);
        this._lastStructureHash = structureHash;

        // THE COMP-DATA CACHE: Pre-allocate geometry objects to prevent per-frame garbage collection
        if (!this._compDataCache) this._compDataCache = {};

        const useAnim = this.properties.useAnimations !== false;
        window.useAnim = useAnim; // THE RESCUE FIX: Export globally for widgets resolving without props

        // 1. Layout Pass
        const layoutW = this.targetSize[0];
        const layoutH = this.properties.autoHeight !== false ? 2000 : this.targetSize[1];
        const bounds = { x: 0, y: 0, w: layoutW, h: layoutH };

        // THE HEADER TOGGLE FIX: Check for the drawHeader argument to hide the title region
        // THE PERFORMANCE GATE: Only reconstruct the layout map if a change is detected
        if (needsLayoutCompute || !this._cachedBaseMap) {
            this._cachedBaseMap = getBastaBaseMap(this);
        }
        const baseMap = this._cachedBaseMap;

        if (this.properties.drawHeader === false) {
            if (baseMap.headerRegion) baseMap.headerRegion.hidden = true;
        }

        this.layout.compute(bounds, baseMap, { textTheme: engineTextTheme, isVirtual: true, useAnim: false, spawnAnim: false }, needsLayoutCompute);
        this._layoutDirty = false;
        this._forceSync = false;

        // THE SIZING GATE: Only perform expensive size enforcement and re-centering if layout actually re-calculated.
        if (needsLayoutCompute) {
            const vars = this.getDerpVars();
            const minFloor = vars.minWidth || 0;
            const contentFloor = this.layout.contentMinWidth || 0;
            const finalMinW = Math.max(minFloor, contentFloor);

            const needsResize = (this.targetSize[0] < finalMinW - 0.5) ||
                (this.properties.autoWidth !== false && Math.abs(this.targetSize[0] - finalMinW) > 1);

            if (finalMinW > 0 && needsResize) {
                const oldW = this.targetSize[0];
                this.targetSize[0] = Math.max(this.targetSize[0], finalMinW);
                if (this.properties.nodeSize) this.properties.nodeSize[0] = this.targetSize[0];
                this.size[0] = Math.max(this.size[0], finalMinW);

                if (this.hostNode && this.targetRegion && !this._isDraggingBasta && !this.hostNode.properties[`bastaOffset_${this.id}`]) {
                    this.offset[0] += (oldW - this.targetSize[0]) / 2;
                }
                this.setDirtyCanvas(true);
            }

            if (this.properties.autoHeight !== false && this.layout.totalHeight > 0) {
                const { SNAP } = this.getDerpVars();
                const shouldSnap = this.properties.snapHeight === true;
                const snappedH = shouldSnap ? Math.ceil(this.layout.totalHeight / SNAP) * SNAP : this.layout.totalHeight;

                if (Math.abs(this.targetSize[1] - snappedH) > 0.1) {
                    const oldH = this.targetSize[1];
                    this.targetSize[1] = snappedH;
                    if (this.properties.nodeSize) this.properties.nodeSize[1] = snappedH;

                    if (this.hostNode && this.targetRegion && !this._isDraggingBasta && !this.hostNode.properties[`bastaOffset_${this.id}`]) {
                        this.offset[1] += (oldH - this.targetSize[1]);
                    }

                    if (this.properties.autoWidth === false) this.size[1] = this.targetSize[1];
                    this.setDirtyCanvas(true);
                }
            }
        }

        // 2. Background Paint (Standardized to Fatha)
        handleDrawCTX(this, ctx);

        // 3. Components
        if (this.layout.regions) {
            // THE COMPONENT ITERATION FIX: Avoid Object.entries and per-frame object allocation.
            if (needsLayoutCompute || !this._activeRegionKeys) {
                this._activeRegionKeys = Object.keys(this.layout.regions).filter(k => k !== "panelBackground" && this.layout.regions[k].type);
                // THE Z-ORDER FIX: Sort region keys by explicit zIndex to ensure correct rendering overlap for canvas components
                this._activeRegionKeys.sort((a, b) => {
                    const zA = this.layout.regions[a].zIndex || 0;
                    const zB = this.layout.regions[b].zIndex || 0;
                    return zA - zB;
                });
            }

            for (let i = 0; i < this._activeRegionKeys.length; i++) {
                const key = this._activeRegionKeys[i];
                const reg = this.layout.regions[key];
                const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                if (!blueprint) continue;

                // THE COMP-DATA CACHE: Reuse geometry and data objects unless a layout shift occurred.
                let compData = this._compDataCache[key];
                if (needsLayoutCompute || !compData) {
                    compData = { ...reg, key, useAnim, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } };
                    this._compDataCache[key] = compData;
                }

                if (blueprint.isHtml && this.dynamicElements) {
                    let isNewElement = false;
                    if (!this.dynamicElements[key]) {
                        this.dynamicElements[key] = blueprint.create(reg);
                        document.body.appendChild(this.dynamicElements[key]);
                        isNewElement = true;
                    }
                    if (needsSync || isNewElement) {
                        blueprint.sync(this.dynamicElements[key], this, app, compData);
                    }
                    this.dynamicElements[key].style.opacity = this.alpha;
                    if (reg.zIndex !== undefined) {
                        this.dynamicElements[key].style.zIndex = reg.zIndex;
                    }
                } else if (blueprint.isHybrid) {
                    blueprint.sync(ctx, this, app, { ...compData, alpha: this.alpha });
                } else {
                    blueprint.sync(ctx, this, compData);
                }
            }

            // THE OVERLAY BACKDROP FIX: Draw regions requested to render above components
            handleDrawCTX(this, ctx, true);

            // THE HYBRID OVERLAY PASS: Call widgets that requested Z-Index priority
            for (let i = 0; i < this._activeRegionKeys.length; i++) {
                const key = this._activeRegionKeys[i];
                const reg = this.layout.regions[key];
                if (reg.strokeZIndex) {
                    const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                    if (blueprint && blueprint.isHybrid) {
                        blueprint.sync(ctx, this, app, { ...this._compDataCache[key], alpha: this.alpha }, true);
                    }
                }
            }

            // THE HYBRID ORPHAN CLEANUP: Remove shared DOM elements generated by hybrid widgets
            if (this._derpDomElements) {
                for (const domKey in this._derpDomElements) {
                    if (!this.layout.regions[domKey]) {
                        this._derpDomElements[domKey].remove();
                        delete this._derpDomElements[domKey];
                    }
                }
            }
        }

        ctx.restore();
        syncDerpShield(this);

        if (needsSync) {
            this._prevBastaState = {
                posX: this.pos[0], posY: this.pos[1],
                sizeW: this.size[0], sizeH: this.size[1],
                scale: app.canvas.ds.scale,
                offsetX: app.canvas.ds.offset[0], offsetY: app.canvas.ds.offset[1]
            };
        }
    }

    close() {
        this.isClosing = true;
        this._forceSync = true;
        if (this.hostNode) {
            if (this.hostNode.refreshNodeLayoutMap) this.hostNode.refreshNodeLayoutMap();
            if (this.hostNode.setDirtyCanvas) this.hostNode.setDirtyCanvas(true);
        }
    }

    destroy() {
        if (this.onClose) this.onClose();
        removeDerpShield(this);
        if (this.dynamicElements) {
            Object.values(this.dynamicElements).forEach(el => el.remove());
            this.dynamicElements = null;
        }

        // THE HYBRID DESTRUCTION FIX: Sweep the underlying _derpDomElements registry
        if (this._derpDomElements) {
            Object.values(this._derpDomElements).forEach(el => { if (el && typeof el.remove === 'function') el.remove(); });
            this._derpDomElements = null;
        }

        // Exhaustive sweep for any other dynamically attached HTML entities
        for (const key in this) {
            if (Array.isArray(this[key])) {
                this[key].forEach(item => { if (item instanceof HTMLElement) item.remove(); });
            } else if (this[key] instanceof HTMLElement) {
                this[key].remove();
            }
        }

        activeBastas.delete(this.id);

        if (this.properties.bastaSingleton && app.graph) {
            app.graph._nodes.forEach(n => n.refreshNodeLayoutMap?.());
        } else if (this.hostNode && this.hostNode.refreshNodeLayoutMap) {
            this.hostNode.refreshNodeLayoutMap();
        }
    }
}

export function spawnBasta(id, config = {}) {
    const existing = activeBastas.get(id);
    if (existing && existing.properties.bastaSingleton) {
        const oldHost = existing.hostNode;
        if (config.host) existing.hostNode = config.host;
        if (config.titleLabel) existing.titleLabel = config.titleLabel;

        // THE PROPERTY SYNC FIX: Update the singleton instance with the fresh configuration properties.
        if (config.properties) {
            existing.properties = { ...existing.properties, ...config.properties };
        }

        // THE INITIAL SIZE OVERRIDE: Prioritize the latest config size for singleton jumps
        // This ensures that panels can snap back to their code-defined width even if they were manually resized in a previous host.
        if (config.initialSize) {
            existing.targetSize = [...config.initialSize];
            existing.size = [...config.initialSize];
            if (existing.properties) {
                existing.properties.nodeSize = [...config.initialSize];
                // Force sync minWidth to the override size if not explicitly provided in properties
                if (config.properties?.minWidth === undefined) existing.properties.minWidth = config.initialSize[0];
            }
        } else if (existing.properties?.minWidth) {
            existing.targetSize[0] = Math.max(existing.targetSize[0], existing.properties.minWidth);
        }

        const savedOffset = existing.hostNode && existing.hostNode.properties[`bastaOffset_${existing.id}`];

        if (savedOffset) {
            existing.offset = [...savedOffset];
            if (config.targetRegion) existing.targetRegion = config.targetRegion;
        } else if (config.targetRegion) {
            existing.targetRegion = config.targetRegion;
            const regions = existing.hostNode.layout?.regions;
            const target = regions?.[existing.targetRegion];
            if (target) {
                const { oY } = existing.getDerpVars();
                existing.offset = [
                    Math.round(target.x + (target.w / 2) - (existing.targetSize[0] / 2)),
                    Math.round(target.y - existing.targetSize[1] - oY)
                ];
            }
        }

        const savedSize = existing.hostNode && existing.hostNode.properties[`bastaSize_${existing.id}`];
        if (savedSize) {
            // THE RESET FIX: Ensure loaded sizes still respect the panel's minWidth property
            const loadW = Math.max(existing.properties.minWidth || 0, savedSize[0]);
            existing.targetSize = [loadW, savedSize[1]];
            if (existing.properties.nodeSize) existing.properties.nodeSize = [...existing.targetSize];
        } else if (config.initialSize && existing.properties.autoWidth === false) {
            existing.targetSize[0] = config.initialSize[0];
            if (existing.properties.nodeSize) existing.properties.nodeSize[0] = config.initialSize[0];
        }

        // THE HANDOFF FIX: Toggle wireless buttons on both nodes when a singleton jumps
        if (oldHost && oldHost !== existing.hostNode && oldHost.refreshNodeLayoutMap) oldHost.refreshNodeLayoutMap();
        if (existing.hostNode && existing.hostNode.refreshNodeLayoutMap) existing.hostNode.refreshNodeLayoutMap();

        existing.isClosing = false; // THE RESURRECTION FIX: Abort any pending close animation if re-opened quickly
        existing._forceSync = true;
        return existing;
    }

    if (activeBastas.has(id)) activeBastas.get(id).destroy();
    return new BastaInstance(id, config);
}

export function drawBastaLayer(ctx) {
    if (activeBastas.size === 0) return;

    for (const basta of activeBastas.values()) {
        const isAlive = basta.update();

        // THE AWAKE CONSUMPTION: Allow Bastas to request canvas dirtying for local animations
        let isAwake = false;
        if (basta._derpAwakeFrames > 0) {
            basta._derpAwakeFrames--;
            isAwake = true;
        }

        if (isAlive || isAwake || (basta.alpha > 0)) {
            basta.draw(ctx);
            if (isAlive || isAwake) app.canvas.setDirty(true, true);
        }
    }
}
