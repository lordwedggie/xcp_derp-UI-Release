/**
 * Path: ./js/fatha/core/fathaHandler.js
 * ROLE: Protocol-based interaction and theme engine for all Fatha entities.
 */
import { app } from "../../../../scripts/app.js";
import { syncDerpShield } from "./fathaDOMshield.js";
import { toggleDerpSysPanel, sysPanel, closeDerpSysPanel } from "../helpers/fathaSysPanel.js";
import { masterPainter, compileThemeData, invalidateCompiledThemeCache } from "../../herbina/masterPainter.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "./masterLayoutTypes.js";
import { resolvePaintData } from "../../herbina/utils/widgetsUtils.js";
import { lerpTo } from "../../herbina/masterAnimator.js";
import { beginDockDrag, updateDockDrag, endDockDrag } from "./dockDrag.js";
import { handleNodeResize } from "./fathaNodeResize.js";
import { masterDockEngine } from "./masterDockEngine.js";
import { getDeckCornerOverride } from "./masterDockEngine.js";
import { getDeckParent, getDeckChildren } from "./masterDockEngine.js";
import { getDeckMembers, isLinearDeckGroup, isNodeDocked } from "./masterDockEngine.js";

function getDeckEngine() {
    if (!window.xcpMasterDeckEngine) {
        window.xcpMasterDeckEngine = new masterDockEngine(app.graph || null);
    }
    window.xcpMasterDeckEngine.setGraph(app.graph || null);
    return window.xcpMasterDeckEngine;
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

            // GLOBAL REFLOW: All nodes using the Layout Engine will now physically resize
            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(node => {
                    if ((node.isFathaNode || node.isUncleNode) && node.requestDerpSync) {
                        node.requestDerpSync();
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
    try {
        const response = await fetch(`/xcp/load/palettes?name=${paletteName}`);
        if (!response.ok) throw new Error(`Palette ${paletteName} not found.`);

        const result = await response.json();
        if (result.data) {
            window.xcpActivePalette = result.data;
            window.xcpActivePaletteName = paletteName;

            // Fire event for paletteExtender.js
            window.dispatchEvent(new CustomEvent("xcp_palette_changed", { detail: result.data }));

            // GLOBAL REFLOW: Recompile theme colors for all Fatha/Uncle/Basta entities
            if (app.graph && app.graph._nodes) {
                app.graph._nodes.forEach(node => {
                    if ((node.isFathaNode || node.isUncleNode) && node.applyPalette) {
                        node.applyPalette();
                    }
                });
            }
            if (window.xcpActiveBastas) {
                window.xcpActiveBastas.forEach(basta => {
                    if (basta.id === "basta_lora_detail_global_unique_id") {
                        basta.close();
                    } else if (basta.onThemeUpdate) {
                        basta.onThemeUpdate(window.xcpDerpThemeConfig);
                    }
                });
            }
            if (app.canvas) app.canvas.setDirty(true, true);
        }
    } catch (e) {
        console.error(`❌ [xcpDerp] Palette Load Error:`, e);
    }
}

// --- ANIMATION TUNABLES ---
export const ANIM_SELECTION_PULSE = true;

function shouldExpandUpFromPin(node, graph) {
    if (!node || !graph) return false;
    if (!isNodeDocked(node, graph)) return false;
    if (!isLinearDeckGroup(node, graph, "vertical")) return false;

    const members = getDeckMembers(node, graph);
    if (!Array.isArray(members) || members.length <= 1) return false;

    const pinned = members.find((m) => m?.properties?.pinActive === true);
    if (!pinned || pinned.id === node.id) return false;

    const nodeY = Number(node.pos?.[1]) || 0;
    const pinY = Number(pinned.pos?.[1]) || 0;
    return nodeY < pinY;
}

export function animateDerpSize(node, targetW, targetH, useAnim) {
    if (node.size[0] !== targetW || node.size[1] !== targetH) {
        const prevH = Number(node.size?.[1]) || 0;
        node.size[0] = targetW;
        node.size[1] = targetH;
        if (node.properties) node.properties.nodeSize = [targetW, targetH];
        const graph = app.graph || node.graph || null;
        const deltaH = (Number(targetH) || 0) - prevH;
        if (deltaH !== 0 && shouldExpandUpFromPin(node, graph)) {
            node.pos[1] = (Number(node.pos?.[1]) || 0) - deltaH;
        }
        if (graph) {
            const moved = getDeckEngine().reflowChildren(node);
            moved.forEach((child) => {
                if (typeof child.syncUncleSlots === "function") child.syncUncleSlots();
                if (typeof child.setDirtyCanvas === "function") child.setDirtyCanvas(true, true);
            });
        }
        if (node.requestDerpSync) node.requestDerpSync();
    }
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
        autoHeight: safeNode.properties?.autoHeight !== false
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
    const minW = entity.layout?.contentMinWidth || minWidth;
    const minH = entity.layout?.totalHeight || 40;
    if (out) {
        out[0] = minW;
        out[1] = minH;
        return out;
    }
    return [minW, minH];
}

export function handleDerpCollapse(entity, force) {
    const nextState = force !== undefined ? force : !entity.properties.contentCollapsed;

    if (nextState === true && !entity.properties.contentCollapsed) {
        entity._preCollapseHeight = entity.size[1];
    }

    entity.properties.contentCollapsed = nextState;
    if (!entity.flags) entity.flags = {};
    entity.flags.collapsed = false;

    if (entity.syncUncleSlots) entity.syncUncleSlots();
    if (entity.requestDerpSync) entity.requestDerpSync();
    else handleDerpRequestSync(entity);

    if (app.graph && app.graph.change) app.graph.change();
}

function findHitRegion(layout, localMouse, options = {}) {
    if (!layout || !layout.regions) return null;
    const { allowDisabledDrag = false } = options;
    const regionEntries = Object.entries(layout.regions).reverse();
    for (const [key, reg] of regionEntries) {
        if (reg.isSpacing || (!reg.type && !reg.onPress && !reg.onClick && !reg.onDblClick && !reg.hoverEffect)) continue;
        const isInteractive = reg.onPress || reg.onClick || reg.onDblClick || reg.hoverEffect || reg.onChange ||
            reg.type === UI_TYPES.DROPDOWN_DERP || reg.type === UI_TYPES.DROPDOWN ||
            reg.type === UI_TYPES.BUTTON || reg.type === UI_TYPES.ICONBUTTON ||
            reg.type === UI_TYPES.SLIDER || reg.type === UI_TYPES.EDITOR ||
            reg.type === UI_TYPES.FILEBROWSER || reg.type === UI_TYPES.TOGGLE ||
            reg.type === UI_TYPES.TOGGLE_V2 || reg.type === UI_TYPES.TRIGGER ||
            reg.type === UI_TYPES.IMAGE_HTML;
        if (!isInteractive) continue;

        const isDisabled = reg.state === "DIS";
        if (isDisabled && !(allowDisabledDrag && reg.allowDragWhenDisabled)) continue;
        if (!(reg.hitTest ? reg.hitTest(localMouse) : layout.hitTest(localMouse, reg))) continue;

        if (isDisabled && allowDisabledDrag && reg.dragProxyKey) {
            const proxyReg = layout.regions[reg.dragProxyKey];
            if (proxyReg) return { key: reg.dragProxyKey, reg: proxyReg, sourceKey: key, sourceReg: reg };
        }

        return { key, reg };
    }
    return null;
}
export function handleShieldInteraction(entity, type, data = {}) {
    const scale = app.canvas.ds.scale;
    const localMouse = [data.localX || 0, data.localY || 0];
    const deckEngine = getDeckEngine();
    if (type === "dragStart") {
        entity._startPos = [...(entity.pos || [0,0])];
        entity._startSize = [...(entity.size || [0,0])];
        entity._deckDragAltActive = !!data.originalEvent?.altKey;
        const sysBtn = entity.layout?.regions?.systemBtn;
        if (sysBtn && entity.layout.hitTest(localMouse, sysBtn, Math.max(8, 8 / scale))) {
            entity._pressedRegionKey = "systemBtn";
            return true;
        }
        const hit = findHitRegion(entity.layout, localMouse, { allowDisabledDrag: true });
        if (hit && !hit.reg.noDragLock) {
            entity._pressedRegionKey = hit.key;
            if (hit.reg.onDragStart) hit.reg.onDragStart(data.originalEvent, data);
            entity._derpAwakeFrames = 15;
            entity.setDirtyCanvas(true);
            return true;
        }
        beginDockDrag(entity, deckEngine);
    } else if (type === "resize" && !entity.isSystemPanel) {
        handleNodeResize(entity, data, scale);
    } else if (type === "drag" && !entity.isSystemPanel) {
        if (entity._pressedRegionKey) {
            const reg = entity.layout?.regions[entity._pressedRegionKey];
            if (reg && reg.onDrag) reg.onDrag(data.originalEvent, data);
            return false;
        }
        updateDockDrag(entity, deckEngine, data, scale);
    } else if (type === "click" || type === "pointerup") {
        const key = entity._pressedRegionKey;
        entity._pressedRegionKey = null;
        if (key === "systemBtn") {
            if (type === "click") toggleDerpSysPanel(entity);
            if (app.graph && app.graph.change) app.graph.change();
            return true;
        }
        const reg = entity.layout?.regions[key];
        if (reg) {
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

            // THE INTERACTION FIX: Allow Toggles to fire onPress callbacks.
            // This prevents the framework from blocking manual property-flip logic in custom panels.
            if (reg.onPress) {
                reg.onPress(data.originalEvent, data);
            } else if (reg.onClick) {
                reg.onClick(data.originalEvent, data);
            }
            entity.setDirtyCanvas(true);
            if (app.graph && app.graph.change) app.graph.change();
            return true;
        }
    } else if (type === "dblclick") {
        const hit = findHitRegion(entity.layout, localMouse);

        if (hit && hit.reg.onDblClick) {
            hit.reg.onDblClick(data.originalEvent, hit.reg, data);
            if (app.graph && app.graph.change) app.graph.change();
            return true;
        }

        const header = entity.layout?.regions?.headerRegion;
        // THE BASTA PROTECTION: Only trigger the rename prompt for physical Graph Nodes.
        if (header && entity.layout.hitTest(localMouse, header) && !entity.isSystemPanel && (entity.isFathaNode || entity.isUncleNode)) {
            const currentTitle = entity.titleLabel || entity.type || "Node";
            const newTitle = prompt("Rename Node:", currentTitle);

            if (newTitle !== null && newTitle !== currentTitle) {
                entity.titleLabel = newTitle;
                // THE SERIALIZATION FIX: Persist renamed titles into the property block
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
    } else if (type === "hover") {
        const sysBtn = entity.layout?.regions?.systemBtn;
        const isOverSys = sysBtn && entity.layout.hitTest(localMouse, sysBtn, Math.max(8, 8 / scale));
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
            const useHoverFastPath = (entity?.properties?.optimizeHoverNoSync !== false) && !isPickerRegion;
            if (!useHoverFastPath) {
                entity._forceSync = true;
                if (typeof entity.requestDerpSync === "function") entity.requestDerpSync();
            }
            if (entity?.properties?.optimizeHoverDirty !== false && !isPickerRegion) {
                // Optional throttle: enable only for heavy nodes that benefit.
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
    }else if (type === "dragEnd") {
        endDockDrag(entity, deckEngine, data);
    }
}

export function handleDrawCTX(entity, ctx, overlayPass = false) {
    const isBypassed = entity.mode === 4 || entity.mode === 2 || entity._derpSpoofedBypass;
    const isSelected = entity._xcpTrueSelected !== undefined ? entity._xcpTrueSelected : !!(app.canvas.selected_nodes && app.canvas.selected_nodes[entity.id]);

    if (!overlayPass) {
        const header = entity.layout?.regions?.headerRegion;
        const isCollapsed = !!entity.properties?.contentCollapsed;
        const paintOFF = resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "");
        const paintON = resolvePaintData(entity, "canvas", isBypassed ? "_DIS" : "_ON");
        const paintDIS = resolvePaintData(entity, "canvas", "_DIS");
        const cornerOverride = getDeckCornerOverride(entity, app.graph || entity.graph || null);
        const nodeWantsCache = entity?.properties?.optimizeStaticBgCache !== false;
        // Quality guard: rounded corners / shadow / glow are prone to cache resample artifacts.
        // In those cases prefer direct paint to preserve smooth corners.
        const useStaticBgCache = nodeWantsCache && !hasRoundedOrFx(paintOFF) && !hasRoundedOrFx(paintON);

        const renderBaseBackground = (targetCtx) => {
            if (header && paintOFF && paintON) {
                const cOFF = applyCornerOverride(paintOFF.corners || [8, 8, 8, 8], cornerOverride);
                const cON = applyCornerOverride(paintON.corners || [8, 8, 8, 8], cornerOverride);

                if (isCollapsed) {
                    const collapsedPaint = { ...paintOFF, corners: [cON[0], cON[1], cOFF[2], cOFF[3]] };
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paintOFF.fill, paintData: collapsedPaint });
                } else {
                    const splitY = header.y + header.h + (header.margin?.length === 4 ? header.margin[3] : (header.margin?.[1] || 0));
                    const headerPaint = { ...paintOFF, corners: [cON[0], cON[1], 0, 0], border: null, shadow: null, glow: null };
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: splitY, color: paintOFF.fill, paintData: headerPaint });

                    const contentPaint = { ...paintOFF, corners: [0, 0, cOFF[2], cOFF[3]], border: null, shadow: null, glow: null };
                    masterPainter(targetCtx, { posX: 0, posY: splitY, width: entity.size[0], height: entity.size[1] - splitY, color: paintOFF.fill, paintData: contentPaint });

                    const silhouettePaint = { ...paintOFF, corners: [cON[0], cON[1], cOFF[2], cOFF[3]] };
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: "transparent", paintData: silhouettePaint });
                }
            } else {
                const paint = isSelected ? paintON : paintOFF;
                if (paint) {
                    masterPainter(targetCtx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paint.fill, paintData: paint });
                }
            }
        };

        if (isSelected && !isBypassed && ANIM_SELECTION_PULSE) {
            // --- SELECTION PULSE ---
            if (paintOFF) {
                if (useStaticBgCache) {
                    const bw = Math.max(1, Math.round(entity.size[0]));
                    const bh = Math.max(1, Math.round(entity.size[1]));
                    const cache = getOrCreateBgCache(entity, bw, bh);
                    const cacheKey = `pulse|${bw}|${bh}|${isBypassed}|${entity.mode}|${entity._currentThemeName || ""}|${getPaintFingerprint(paintOFF)}`;
                    if (cache) {
                        const pad = cache.pad || 0;
                        const ratio = cache.ratio || 1;
                        if (cache.key !== cacheKey) {
                            cache.key = cacheKey;
                            cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
                            cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
                            cache.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
                            masterPainter(cache.ctx, { posX: pad, posY: pad, width: bw, height: bh, color: paintOFF.fill, paintData: paintOFF });
                        }
                        ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, -pad, -pad, bw + pad * 2, bh + pad * 2);
                    } else {
                        masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paintOFF.fill, paintData: paintOFF });
                    }
                } else {
                    masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paintOFF.fill, paintData: paintOFF });
                }
            }
            if (paintON) {
                const pulseAlpha = (Math.sin(Date.now() * 0.003) + 1) / 2;
                ctx.save();
                ctx.globalAlpha = pulseAlpha;
                masterPainter(ctx, { posX: 0, posY: 0, width: entity.size[0], height: entity.size[1], color: paintON.fill, paintData: paintON });
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
    if (!config || !config.themes) return;
    const themeName = node.properties?.selectedTheme || node.properties?.selectedThemeName || node._selectedThemeName || config.activeTheme || "Template_Standard_v02";
    const theme = config.themes[themeName];
    if (theme) {
        Object.entries(theme).forEach(([key, val]) => {
            if (key === "_layout" || typeof val !== 'object' || Array.isArray(val)) return;
            invalidateCompiledThemeCache(val);
            node[`_${key}PaintData`] = compileThemeData(val, key, "OFF");
            node[`_${key}PaintData_ON`] = compileThemeData(val, key, "ON");
            node[`_${key}PaintData_DIS`] = compileThemeData(val, key, "DIS");
            if (sysPanel) {
                sysPanel[`_${key}PaintData`] = node[`_${key}PaintData`];
                sysPanel[`_${key}PaintData_ON`] = node[`_${key}PaintData_ON`];
                sysPanel[`_${key}PaintData_DIS`] = node[`_${key}PaintData_DIS`];
            }
        });
    }

    if (node._derpBgCache) {
        node._derpBgCache.key = "";
    }
    if (node.layout) {
        node.layout._lastCacheKey = "";
    }
    if (node._compDataCache) {
        node._compDataCache = {};
    }
    node._prevDerpState = null;
    node._forceSync = true;

    // THE UNIVERSAL AUTO-CLOSE: Immediately close all panels linked to this node when it undergoes a theme switch
    if (window.xcpActiveBastas) {
        window.xcpActiveBastas.forEach(basta => {
            if (basta.hostNode === node) basta.close();
        });
    }

    if (sysPanel.isVisible && sysPanel.hostNode === node) {
        sysPanel._prevDerpState = null;
        sysPanel._shouldSync = true;
        sysPanel._layoutDirty = true;
        closeDerpSysPanel();
    }

    node.setDirtyCanvas(true, true);
}

export function handleInitDerpGlobalListener(app) {
    if (window._xcpDerpGlobalActive) return;

    // THE STARTUP HYDRATION: Ensure nodes are localized on boot even without the panel
    const initialLocale = app.ui.settings.getSettingValue("Comfy.Locale") || "en-US";
    loadDerpLocale(initialLocale);

    // THE PALETTE HYDRATION: Load the active palette on boot
    const initialPalette = app.ui.settings.getSettingValue("Derp.Palette") || "Derp_Default_v01";
    loadDerpPalette(initialPalette);

    // THE FOOLPROOF LIVE SYNC: ComfyUI's settings UI often bypasses the standard setter
    // or fires while the graph is idle (so pipeline hooks fail). A lightweight interval is bulletproof.
    let lastKnownLocale = initialLocale;
    setInterval(() => {
        if (!app.ui || !app.ui.settings) return;
        const currentLocale = app.ui.settings.getSettingValue("Comfy.Locale");
        if (currentLocale && currentLocale !== lastKnownLocale) {
            lastKnownLocale = currentLocale;
            loadDerpLocale(currentLocale);
        }
    }, 500);

    const originalRefresh = app.refreshPipeline;
    app.refreshPipeline = function() {
        if (originalRefresh) originalRefresh.apply(this, arguments);
        app.graph._nodes.forEach(node => {
            // THE FAMILY FIX: Refresh both Fatha and Uncle identities
            if ((node.isFathaNode || node.isUncleNode) && node.onThemeUpdate) {
                node.onThemeUpdate(window.xcpDerpThemeConfig);
            }
        });

        if (window.xcpActiveBastas) {
            window.xcpActiveBastas.forEach(basta => basta.close());
        }
        if (sysPanel.isVisible) {
            closeDerpSysPanel();
        }
    };

    window._xcpDerpGlobalActive = true;
}
