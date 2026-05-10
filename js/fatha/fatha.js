/**
 * Path: ./js/fatha/fatha.js
 * ROLE: The Virtual "Fatha" framework.
 * STATUS: THE PERFECT HEIST - NATIVE SELECTION DESTROYED
 */
import { app } from "../../../scripts/app.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "./core/fathaDOMshield.js";
import { masterLayoutEngine } from "./core/masterLayoutEngine.js";
import { handleShieldInteraction, handleDrawCTX, handleThemeUpdate, handleInitDerpGlobalListener, getDerpVars, handleDerpRequestSync, handleDerpComputeSize, handleDerpCollapse, animateDerpSize, drawDeckPreviewGlobal } from "./core/fathaHandler.js";
export { getDerpVars };
import { drawDerpSysPanelGlobal, isHostActive, closeDerpSysPanel, sysPanel } from "./helpers/fathaSysPanel.js";
import { drawBastaLayer } from "./basta.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./core/masterLayoutTypes.js";
import { getVirtualNodeLayoutMap } from "./helpers/fathaLayoutMaps.js";
import { transmitBypassedDerpSignals, transmitDerpSignal, purgeDerpSignal } from "./core/masterSignalEngine.js";
import { animateRecoil } from "../herbina/masterAnimator.js";
import { initPerfOverlay, togglePerfOverlay } from "./helpers/fathaPerfOverlay.js";

// --- THE PERFECT HEIST (Ghost Slots & Selection Killer) ---
// By caching states and temporarily lying to LiteGraph during its render pass,
// we wipe out the native UI (dots & selection box) while keeping 100% functionality.
if (!window._xcpFathaGlobalHijack) {
    const originalDrawNode = LGraphCanvas.prototype.drawNode;
    LGraphCanvas.prototype.drawNode = function (node, ctx) {
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
            // 1. Global Cull Sweeper Rescue (Restores DOM visibility when scrolled into view)
            node._lastDerpFrame = app.canvas?.frame;
            if (node._isDerpCulled) {
                node._isDerpCulled = false;
                if (node.interactionShield) node.interactionShield.style.visibility = "visible";
                if (node._derpDomElements) {
                    Object.values(node._derpDomElements).forEach(el => {
                        if (el) el.style.visibility = "visible";
                    });
                }
            }

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
            if (node._xcpTrueInMap) delete app.canvas.selected_nodes[node.id];

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
            if (node._xcpTrueInMap) app.canvas.selected_nodes[node.id] = node;
        } else {
            originalDrawNode.apply(this, arguments);
        }
    };
    // THE LINK HIJACK: Force connections to use the Derp color palette
    if (!window._xcpLinkColorHijack) {
        const originalRenderLink = LGraphCanvas.prototype.renderLink;
        LGraphCanvas.prototype.renderLink = function (ctx, a, b, link, skip_border, flow, color, start_dir, end_dir) {
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
    nodeType.prototype.onThemeUpdate = function(config) {
        this.handleThemeUpdate(config);
        this.requestDerpSync();
    };
    nodeType.prototype.applyPalette = function() {
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

        // THE REFRESH FIX: Re-resolve theme data once properties are restored from the workflow
        if (window.xcpDerpThemeConfig) {
            handleThemeUpdate(this, window.xcpDerpThemeConfig);
        }
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

        this.requestDerpSync();
    };

    nodeType.prototype.onDrawForeground = function(ctx) {
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

        if (this.flags?.collapsed) {
            if (this.interactionShield) this.interactionShield.style.display = "none";
            return;
        }
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

        // During live resize, preserve the manually dragged axis but still let the auto-managed
        // secondary axis respond immediately (e.g. width shrink causing auto-height growth).
        const liveTargetW = this._isDerpResizing && !autoWidth ? this.size[0] : targetW;
        const liveTargetH = this._isDerpResizing && !autoHeight ? this.size[1] : targetH;
        animateDerpSize(this, liveTargetW, liveTargetH, useAnim);

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
            const shiftY = (this.size[1] - (fReg.margin?.[3] || 0) - fReg.h) - fReg.y;
            if (Math.abs(shiftY) > 0.1) {
                Object.values(this.layout.regions).forEach(r => { if (r === fReg || r.isFooterChild) r.y += shiftY; });
            }
        }

        handleDrawCTX(this, ctx);

        if (this.layout?.regions) {
            const usedKeys = new Set();
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
                if (needsLayoutCompute || !compData) {
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
                    blueprint.sync(ctx, this, app, compData);
                } else {
                    blueprint.sync(ctx, this, compData);
                }
            }

            handleDrawCTX(this, ctx, true);

            for (const [key, reg] of Object.entries(this.layout.regions)) {
                if (reg.strokeZIndex) {
                    const blueprint = COMPONENT_BLUEPRINTS[reg.type];
                    if (blueprint && blueprint.isHybrid && this._compDataCache[key]) {
                        blueprint.sync(ctx, this, app, this._compDataCache[key], true);
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
        const useAnimations = window.DERP_GLOBAL_SETTINGS?.useAnimation ?? true;
        this.properties = { titleLabel: "Virtual Node", ...(this.properties || {}), minWidth: minWidth, nodeSize: [minWidth, 50], drawHeader: true, drawSignalBtn: false, drawSettingBtn: false, settingActive: false, contentCollapsed: false, collapseMinimal: false, stickyDrag: true, useAnimations };
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
                    this.properties = { titleLabel: "Virtual Node", minWidth: 180, nodeSize: [180, 50], selectedTheme: "Template_Standard_v02" };
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
                                            Object.values(node._derpDomElements).forEach(el => {
                                                if (el) el.style.visibility = "hidden";
                                            });
                                        }
                                    }
                                }
                            });
                        }
                    }

                    if (typeof drawDerpSysPanelGlobal === "function") drawDerpSysPanelGlobal(ctx);
                    if (typeof drawDeckPreviewGlobal === "function") drawDeckPreviewGlobal(ctx);
                    // THE RENDER FIX: Actually call the Basta layer during the global draw pass
                    if (typeof drawBastaLayer === "function") drawBastaLayer(ctx);
                };
            },
        });
    } catch (e) {
        console.warn("xcp.DerpVirtualLoader extension already registered.");
    }
}
