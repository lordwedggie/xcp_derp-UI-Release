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
import { handleShieldInteraction, getDerpVars, handleThemeUpdate, handleDrawCTX } from "./core/fathaHandler.js";
import { animateAlpha, lerpTo } from "../herbina/masterAnimator.js";
import { masterPainterText } from "../herbina/masterPainter.js";
import { resolvePaintData, parseColorKeyText } from "../herbina/utils/widgetsUtils.js";
import { getBastaBaseMap } from "./helpers/bastaLayoutMaps.js";
import { ensureScreenRectVisible, isWarping } from "./core/fathaWarp.js";

const BASTA_FADE_SPEED = 0.4;
const BLD_ID = "basta_lora_detail_global_unique_id";
const BASTA_OVERLAY_WINDOW_MS = 4000;

function getRegionClipChain(layout, region) {
    if (!layout?.regions || !region?.parentKey) return null;
    const chain = [];
    let current = layout.regions[region.parentKey];
    while (current) {
        if (current.type === "imageHTML" || current.clipChildren === true) {
            chain.unshift(current);
        }
        current = current.parentKey ? layout.regions[current.parentKey] : null;
    }
    return chain.length > 0 ? chain : null;
}

function applyRegionClipChain(ctx, clipChain) {
    if (!ctx || !clipChain?.length) return false;
    ctx.save();
    for (let i = 0; i < clipChain.length; i++) {
        const clipRegion = clipChain[i];
        const x = Math.floor(clipRegion.x || 0);
        const y = Math.floor(clipRegion.y || 0);
        const w = Math.max(0, Math.floor(clipRegion.w || 0));
        const h = Math.max(0, Math.floor(clipRegion.h || 0));
        if (w <= 0 || h <= 0) continue;
        const radius = Math.max(0, Number(clipRegion.cornerRadius ?? (clipRegion.type === "imageHTML" ? 4 : 0)) || 0);
        ctx.beginPath();
        if (ctx.roundRect && radius > 0) ctx.roundRect(x, y, w, h, radius);
        else ctx.rect(x, y, w, h);
        ctx.clip();
    }
    return true;
}

function drawAnimatedTooltipLabel(ctx, basta, region) {
    if (!ctx || !basta?.properties?.tooltipExpand || !region) return false;
    const text = String(basta.properties?.tooltipText || region.text || "");
    if (!text) return false;

    const paddingX = Number(region.padding?.[0] ?? basta._tooltipExpandPaddingX ?? 0) || 0;
    const paddingY = Number(region.padding?.[1] ?? 0) || 0;
    const bastaWidth = Math.max(0, Number(basta.size?.[0]) || 0);
    const visibleRegionW = Math.max(0, Math.min(Number(region.w) || 0, bastaWidth - (Number(region.x) || 0)));
    const clipW = Math.max(0, visibleRegionW - (paddingX * 2));
    const clipH = Math.max(0, Number(region.h) || 0);
    if (clipW <= 0 || clipH <= 0) return true;

    const rawKey = basta.properties.messageThemeKey || "t_textNormal";
    // Parse compound key: "bodyKey, labelKey" → use labelKey for text
    const parts = String(rawKey).split(",").map(p => p.trim());
    const paintKey = parts.length > 1 ? (parts[1] || parts[0]) : parts[0];
    const tooltipPalette = { path: "_system/_toolTip.json" };
    const sysFallback = resolvePaintData(basta, "t_textSystem", "_OFF")
        || basta.hostNode?._t_textSystemPaintData_OFF
        || basta.hostNode?._t_textsystemPaintData_OFF;
    const rawTheme = resolvePaintData(basta, paintKey, "_OFF", null, tooltipPalette)
        || resolvePaintData(basta, paintKey, "_OFF")
        || basta[`_${paintKey}PaintData`]
        || basta.hostNode?.[`_${paintKey}PaintData`]
        || sysFallback
        || { fontSize: 12, font: "arial", fill: "rgba(180,180,180,0.6)" };
    const fontSize = parseFloat(rawTheme.fontSize) || 12;
    const fontWeight = rawTheme.fontWeight || "normal";

    ctx.save();
    ctx.beginPath();
    ctx.rect(
        Math.floor(region.x + paddingX),
        Math.floor(region.y),
        Math.floor(clipW),
        Math.floor(clipH)
    );
    ctx.clip();

    const tipColor = rawTheme.textColor || rawTheme.fill || "rgba(180,180,180,0.6)";
    const { segments: tipSegs, hasColorKeys: tipKeys } = parseColorKeyText(
        text, basta, "_OFF", tipColor
    );

    masterPainterText(ctx, {
        x: region.x + Math.round((Number(region.w) || 0) / 2),
        y: region.y + Math.round(region.h / 2) + Math.round(paddingY / 2),
        text,
        paintData: {
            ...rawTheme,
            fontSize,
            fontWeight,
            fill: tipColor
        },
        align: "center",
        baseline: "middle",
        segments: (tipKeys && tipSegs) ? tipSegs : null
    });
    ctx.restore();
    return true;
}

function ensureBastaOverlayPerf(basta) {
    if (!basta) return null;
    if (!basta._overlayPerf) {
        basta._overlayPerf = {
            samples: [],
            totalMs: 0,
            updateMs: 0,
            drawMs: 0,
            awakeFrames: 0,
        };
    }
    return basta._overlayPerf;
}

function trimBastaOverlayPerf(perf, now) {
    if (!perf?.samples) return;
    const cutoff = now - BASTA_OVERLAY_WINDOW_MS;
    while (perf.samples.length && perf.samples[0].ts < cutoff) {
        const sample = perf.samples.shift();
        perf.totalMs -= sample.totalMs || 0;
        perf.updateMs -= sample.updateMs || 0;
        perf.drawMs -= sample.drawMs || 0;
        perf.awakeFrames -= sample.awake ? 1 : 0;
    }
    if (perf.samples.length === 0) {
        perf.totalMs = 0;
        perf.updateMs = 0;
        perf.drawMs = 0;
        perf.awakeFrames = 0;
    }
}

function recordBastaOverlayPerf(basta, updateMs, drawMs, awake) {
    const perf = ensureBastaOverlayPerf(basta);
    if (!perf) return;
    const ts = performance.now();
    const sample = {
        ts,
        updateMs: Math.max(0, updateMs || 0),
        drawMs: Math.max(0, drawMs || 0),
        totalMs: Math.max(0, (updateMs || 0) + (drawMs || 0)),
        awake: !!awake,
    };
    perf.samples.push(sample);
    perf.totalMs += sample.totalMs;
    perf.updateMs += sample.updateMs;
    perf.drawMs += sample.drawMs;
    if (sample.awake) perf.awakeFrames += 1;
    trimBastaOverlayPerf(perf, ts);
}

function getBLDPerf(basta) {
    if (!basta || basta.id !== BLD_ID || !window.DERP_BLD_PROFILE) return null;
    if (!basta._bldPerf) basta._bldPerf = { lastLog: performance.now() };
    return basta._bldPerf;
}

function bumpBLDPerf(basta, key, amount = 1) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    perf[key] = (perf[key] || 0) + amount;
}

function bumpBLDComponentPerf(basta, key, type, kind, elapsedMs) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    if (!perf.componentDetail) perf.componentDetail = new Map();
    const detailKey = `${kind}:${type || "unknown"}:${key || "unknown"}`;
    let row = perf.componentDetail.get(detailKey);
    if (!row) {
        row = { count: 0, ms: 0 };
        perf.componentDetail.set(detailKey, row);
    }
    row.count++;
    row.ms += elapsedMs || 0;
}

function getBLDSourceLine(stack) {
    if (!stack) return "unknown";
    const lines = String(stack).split("\n").map(line => line.trim());
    return lines.find(line =>
        line &&
        !line.includes("set _forceSync") &&
        !line.includes("BastaInstance.set") &&
        !line.includes("trackBLDForceSync") &&
        !line.includes("Error")
    ) || "unknown";
}

function trackBLDForceSync(basta) {
    if (!basta || basta.id !== BLD_ID || !window.DERP_BLD_PROFILE) return;
    basta._bldLastForceSource = getBLDSourceLine(new Error().stack);
}

function bumpBLDForceSource(basta) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    const source = basta._bldLastForceSource || "unknown";
    if (!perf.forceSources) perf.forceSources = new Map();
    perf.forceSources.set(source, (perf.forceSources.get(source) || 0) + 1);
}

function flushBLDPerf(basta) {
    const perf = getBLDPerf(basta);
    if (!perf) return;
    const now = performance.now();
    if (now - perf.lastLog < 1000) return;
    const seconds = Math.max((now - perf.lastLog) / 1000, 0.001);
    const perSec = (value) => Math.round((value || 0) / seconds);
    const avgDrawMs = perf.draw > 0 ? (perf.drawMs || 0) / perf.draw : 0;
    const avgComponentMs = perf.componentSync > 0 ? (perf.componentMs || 0) / perf.componentSync : 0;
    const avgBgMs = perf.bgDraw > 0 ? (perf.bgMs || 0) / perf.bgDraw : 0;
    const avgLayoutMs = perf.layoutCall > 0 ? (perf.layoutMs || 0) / perf.layoutCall : 0;
    const avgOverlayMs = perf.overlayBg > 0 ? (perf.overlayBgMs || 0) / perf.overlayBg : 0;
    const avgLoopMs = perf.componentLoop > 0 ? (perf.componentLoopMs || 0) / perf.componentLoop : 0;
    const avgShieldMs = perf.shieldSync > 0 ? (perf.shieldMs || 0) / perf.shieldSync : 0;
    console.log(
        `[BLDPerf] ${basta.title || basta.titleLabel || "bastaLoraDetail"} | ` +
        `draw=${perSec(perf.draw)}/s ` +
        `avgDrawMs=${avgDrawMs.toFixed(3)} ` +
        `layoutCompute=${perSec(perf.layoutCompute)}/s ` +
        `layoutForce=${perSec(perf.layoutForce)}/s ` +
        `layoutDirty=${perSec(perf.layoutDirty)}/s ` +
        `layoutSize=${perSec(perf.layoutSize)}/s ` +
        `layoutHash=${perSec(perf.layoutHash)}/s ` +
        `layoutCall=${perSec(perf.layoutCall)}/s ` +
        `layoutSkip=${perSec(perf.layoutSkip)}/s ` +
        `avgLayoutMs=${avgLayoutMs.toFixed(3)} ` +
        `bg=${perSec(perf.bgDraw)}/s ` +
        `avgBgMs=${avgBgMs.toFixed(3)} ` +
        `overlayBg=${perSec(perf.overlayBg)}/s ` +
        `avgOverlayMs=${avgOverlayMs.toFixed(3)} ` +
        `avgLoopMs=${avgLoopMs.toFixed(3)} ` +
        `componentSync=${perSec(perf.componentSync)}/s ` +
        `avgComponentMs=${avgComponentMs.toFixed(3)} ` +
        `canvas=${perSec(perf.canvasSync)}/s ` +
        `hybrid=${perSec(perf.hybridSync)}/s ` +
        `html=${perSec(perf.htmlSync)}/s ` +
        `htmlOpacity=${perSec(perf.htmlOpacity)}/s ` +
        `overlayHybrid=${perSec(perf.overlayHybrid)}/s ` +
        `shield=${perSec(perf.shieldSync)}/s ` +
        `avgShieldMs=${avgShieldMs.toFixed(3)}`
    );
    if (perf.componentDetail?.size) {
        const top = [...perf.componentDetail.entries()]
            .sort((a, b) => b[1].ms - a[1].ms)
            .slice(0, 8)
            .map(([key, row]) => `${key} ${perSec(row.count)}/s avg=${(row.count > 0 ? row.ms / row.count : 0).toFixed(3)}ms`);
        console.log(`[BLDPerf:components] ${top.join(" | ")}`);
        perf.componentDetail.clear();
    }
    if (perf.forceSources?.size) {
        const topSources = [...perf.forceSources.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([source, count]) => `${perSec(count)}/s ${source}`);
        console.log(`[BLDPerf:forceSources] ${topSources.join(" | ")}`);
        perf.forceSources.clear();
    }
    perf.draw = 0;
    perf.drawMs = 0;
    perf.layoutCompute = 0;
    perf.layoutForce = 0;
    perf.layoutDirty = 0;
    perf.layoutSize = 0;
    perf.layoutHash = 0;
    perf.layoutCall = 0;
    perf.layoutSkip = 0;
    perf.layoutMs = 0;
    perf.bgDraw = 0;
    perf.bgMs = 0;
    perf.overlayBg = 0;
    perf.overlayBgMs = 0;
    perf.componentLoop = 0;
    perf.componentLoopMs = 0;
    perf.componentSync = 0;
    perf.componentMs = 0;
    perf.canvasSync = 0;
    perf.hybridSync = 0;
    perf.htmlSync = 0;
    perf.htmlOpacity = 0;
    perf.overlayHybrid = 0;
    perf.shieldSync = 0;
    perf.shieldMs = 0;
    perf.lastLog = now;
}

function getBastaScreenRect(basta) {
    const canvas = app?.canvas?.canvas;
    const ds = app?.canvas?.ds;
    if (!canvas || !ds) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = Number(ds.scale) || 1;
    const worldX = Number(basta?.pos?.[0]) || 0;
    const worldY = Number(basta?.pos?.[1]) || 0;
    const worldW = Number(basta?.size?.[0]) || 0;
    const worldH = Number(basta?.size?.[1]) || 0;
    return {
        left: rect.left + ((worldX + (Number(ds.offset?.[0]) || 0)) * scale),
        top: rect.top + ((worldY + (Number(ds.offset?.[1]) || 0)) * scale),
        width: Math.max(1, worldW * scale),
        height: Math.max(1, worldH * scale),
    };
}

function requestBastaViewportFit(basta, options = {}) {
    const screenRect = getBastaScreenRect(basta);
    if (!screenRect) return false;
    return ensureScreenRectVisible(screenRect, {
        viewportMargin: 8,
        durationMs: 220,
        easing: "easeOutQuad",
        ...options,
    });
}

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
        if (this.id === BLD_ID && !this._bldForceTracked) {
            let forceValue = false;
            Object.defineProperty(this, "_forceSync", {
                configurable: true,
                get() { return forceValue; },
                set(value) {
                    if (value === true) trackBLDForceSync(this);
                    forceValue = value;
                }
            });
            this._bldForceTracked = true;
        }
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
                if (bMap.footerRegion) {
                    bMap.footerRegion.hidden = true;
                    bMap.footerRegion.anchor = null;
                }
            }
            const rawMeasureKey = this.properties.messageThemeKey || "t_textNormal";
            const measureParts = String(rawMeasureKey).split(",").map(p => p.trim());
            const measureThemeKey = measureParts.length > 1 ? (measureParts[1] || measureParts[0]) : measureParts[0];
            const tooltipPal = { path: "_system/_toolTip.json" };
            const tTheme = resolvePaintData(this, measureThemeKey, "_OFF", null, tooltipPal)
                || resolvePaintData(this, measureThemeKey, "_OFF")
                || this.hostNode?._t_textsystemPaintData_OFF
                || this.hostNode?._t_textSystemPaintData_OFF
                || this.hostNode?._t_textnormalPaintData
                || this.hostNode?._t_textNormalPaintData
                || this._t_textSystemPaintData_OFF
                || this._t_textNormalPaintData;

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
        this._warpOnOpen = config?.warpOnOpen !== false;
        this._pendingViewportFitFrames = this._warpOnOpen ? 10 : 0;

        this.baseZIndex = "10000";
        createDerpShield(this);
        if (this.interactionShield) {
            this.interactionShield.style.zIndex = this.baseZIndex;
        }

        activeBastas.set(this.id, this);
        if (this.hostNode && this.hostNode.refreshNodeLayoutMap) this.hostNode.refreshNodeLayoutMap();

        if (this._warpOnOpen) {
            requestAnimationFrame(() => {
                requestBastaViewportFit(this);
            });
        }
    }

    onThemeUpdate(config) {
        handleThemeUpdate(this, config);
        this._layoutDirty = true;
        this._forceSync = true;
        this.setDirtyCanvas(true, true);
    }

    requestDerpSync() {
        // Basta callers often use requestDerpSync for visual refreshes. Structural paths set
        // _layoutDirty/_forceSync directly before requesting a redraw.
        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
    }

    requestViewportFit(frames = 8) {
        const n = Math.max(1, Number(frames) || 1);
        this._pendingViewportFitFrames = Math.max(this._pendingViewportFitFrames || 0, n);
        this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, Math.min(24, n + 4));
        this._forceSync = true;
        this.setDirtyCanvas(true, true);
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

        if (type === "dragStart") this._isDraggingBasta = !!this.properties.bastaMovalbe && !this._pressedRegionKey;
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

        if (!this.isClosing && this._pendingViewportFitFrames > 0) {
            this._pendingViewportFitFrames--;
            if (!isWarping()) {
                requestBastaViewportFit(this);
            }
        }

        const targetAlpha = this.isClosing ? 0 : 1;
        const alphaRes = animateAlpha(this.alpha, targetAlpha, BASTA_FADE_SPEED, this.animations.fade);
        this.alpha = alphaRes.value;

        this.size = [...this.targetSize];

        if (this.properties?.tooltipExpand === true) {
            const useAnim = window.DERP_GLOBAL_SETTINGS?.useAnimation !== false && this.properties.useAnimations !== false;
            const currentWidth = Number(this._tooltipExpandCurrentWidth || this.size[0] || 1);
            const targetWidth = Math.max(1, Number(this._tooltipExpandTargetWidth || this.targetSize?.[0] || this.size[0] || 1));
            const animSpeed = Number(this.properties.tooltipExpandAnimationSpeed || 0.35);
            const widthAnim = lerpTo(currentWidth, targetWidth, animSpeed, useAnim);
            this._tooltipExpandCurrentWidth = Math.max(1, widthAnim.value);
            this.size[0] = this._tooltipExpandCurrentWidth;
            if (this.hostNode && !this._isDraggingBasta) {
                const anchorCenterX = Number(this._tooltipExpandAnchorCenterX);
                const baseOffsetY = Number(this._tooltipExpandBaseOffsetY);
                if (Number.isFinite(anchorCenterX)) {
                    this.offset[0] = anchorCenterX - (this.size[0] / 2);
                    this.pos[0] = this.hostNode.pos[0] + this.offset[0];
                }
                if (Number.isFinite(baseOffsetY)) {
                    this.offset[1] = baseOffsetY;
                    this.pos[1] = this.hostNode.pos[1] + this.offset[1];
                }
            }
            if (widthAnim.isAnimating) this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, 6);
        }

        if (this._searchTabAnchorRegion && this.hostNode?.layout?.regions?.[this._searchTabAnchorRegion] && !this._isDraggingBasta) {
            const target = this.hostNode.layout.regions[this._searchTabAnchorRegion];
            this._searchTabFinalOffset = [
                Math.round(target.x),
                Math.round(target.y - this.targetSize[1])
            ];
        }

        if (Array.isArray(this._searchTabFinalOffset) && !this._isDraggingBasta) {
            const useAnim = window.DERP_GLOBAL_SETTINGS?.useAnimation !== false && this.properties.useAnimations !== false;
            const nextX = lerpTo(this.offset[0], this._searchTabFinalOffset[0], 0.28, useAnim);
            const nextY = lerpTo(this.offset[1], this._searchTabFinalOffset[1], 0.28, useAnim);
            this.offset[0] = nextX.value;
            this.offset[1] = nextY.value;
            this.pos[0] = this.hostNode.pos[0] + this.offset[0];
            this.pos[1] = this.hostNode.pos[1] + this.offset[1];
            if (nextX.isAnimating || nextY.isAnimating) {
                this._derpAwakeFrames = Math.max(this._derpAwakeFrames || 0, 6);
            } else if (!this._searchTabAnchorRegion) {
                this.offset[0] = this._searchTabFinalOffset[0];
                this.offset[1] = this._searchTabFinalOffset[1];
                this._searchTabFinalOffset = null;
            }
        }

        if (this.isClosing && this.alpha <= 0.01) {
            this.alpha = 0;
            this.destroy();
            return false;
        }

        return alphaRes.isAnimating;
    }

    draw(ctx) {
        if (this.alpha <= 0) return;
        const bldDrawStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;

        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.pos[0], this.pos[1]);

        const paintKey = this.properties.messageThemeKey || "t_textNormal";
        const rawTheme = resolvePaintData(this, paintKey, "_OFF") || this[`_${paintKey}PaintData`] || this.hostNode?.[`_${paintKey}PaintData`] || { fontSize: 12, font: "arial", fill: "red" };
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
        const prevStructureHash = this._lastStructureHash;
        const structureHash = `${window._xcpDerpSession}_${this.hostNode?._layoutMapHash || ""}`;
        const structureChanged = prevStructureHash !== structureHash;
        const liveResizeReason = !!this._isDerpResizing;
        const layoutForceReason = !!this._forceSync || liveResizeReason;
        const layoutDirtyReason = !!this._layoutDirty;
        const layoutSizeReason = !!hasLayoutChanged;
        const needsLayoutCompute = layoutForceReason || layoutDirtyReason || layoutSizeReason || structureChanged;
        const needsSync = this._forceSync || liveResizeReason || hasVisualChanged || structureChanged;
        this._lastStructureHash = structureHash;

        // THE COMP-DATA CACHE: Pre-allocate geometry objects to prevent per-frame garbage collection
        if (!this._compDataCache) this._compDataCache = {};

        const useAnim = this.properties.useAnimations !== false;
        window.useAnim = useAnim; // THE RESCUE FIX: Export globally for widgets resolving without props

        // 1. Layout Pass
        const layoutW = this.properties?.tooltipExpand === true
            ? Math.max(1, Number(this._tooltipExpandCurrentWidth || this.size[0] || this.targetSize[0]))
            : this.targetSize[0];
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

        const hasLayoutRegions = this.layout?.regions && Object.keys(this.layout.regions).length > 0;
        if (needsLayoutCompute || !hasLayoutRegions) {
            const bldLayoutStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
            if (needsLayoutCompute) {
                bumpBLDPerf(this, "layoutCompute");
                if (layoutForceReason) {
                    bumpBLDPerf(this, "layoutForce");
                    bumpBLDForceSource(this);
                }
                if (layoutDirtyReason) bumpBLDPerf(this, "layoutDirty");
                if (layoutSizeReason) bumpBLDPerf(this, "layoutSize");
                if (structureChanged) bumpBLDPerf(this, "layoutHash");
            }
            this.layout.compute(bounds, baseMap, { textTheme: engineTextTheme, isVirtual: true, useAnim: false, spawnAnim: false }, true);
            if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                bumpBLDPerf(this, "layoutCall");
                bumpBLDPerf(this, "layoutMs", performance.now() - bldLayoutStart);
            }
        } else {
            bumpBLDPerf(this, "layoutSkip");
        }
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
        const bldBgStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
        handleDrawCTX(this, ctx);
        if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
            bumpBLDPerf(this, "bgDraw");
            bumpBLDPerf(this, "bgMs", performance.now() - bldBgStart);
        }

        // 3. Components
        if (this.layout.regions) {
            const bldLoopStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
            // THE COMPONENT ITERATION FIX: Avoid Object.entries and per-frame object allocation.
            if (needsLayoutCompute || !this._activeRegionKeys) {
                this._activeRegionKeys = Object.keys(this.layout.regions).filter(k => k !== "panelBackground" && this.layout.regions[k].type);
                // THE Z-ORDER FIX: Sort region keys by explicit zIndex to ensure correct rendering overlap for canvas components
                this._activeRegionKeys.sort((a, b) => {
                    const zA = this.layout.regions[a].zIndex || 0;
                    const zB = this.layout.regions[b].zIndex || 0;
                    return zA - zB;
                });
                this._activeRegionEntries = this._activeRegionKeys
                    .map(key => ({ key, reg: this.layout.regions[key], blueprint: COMPONENT_BLUEPRINTS[this.layout.regions[key]?.type] }))
                    .filter(entry => entry.blueprint);
                this._overlayHybridEntries = this._activeRegionEntries
                    .filter(entry => entry.reg.strokeZIndex && entry.blueprint.isHybrid);
            }

            const activeEntries = this._activeRegionEntries || [];
            for (let i = 0; i < activeEntries.length; i++) {
                const { key, reg, blueprint } = activeEntries[i];
                if (!blueprint.isHtml && Number(reg.alpha) <= 0.001) continue;

                // THE COMP-DATA CACHE: Reuse geometry and data objects unless a layout shift occurred.
                let compData = this._compDataCache[key];
                if (needsLayoutCompute || !compData) {
                    compData = { ...reg, key, useAnim, geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h } };
                    this._compDataCache[key] = compData;
                }

                if (this.properties?.tooltipExpand === true && key === "lblMessage") {
                    drawAnimatedTooltipLabel(ctx, this, reg);
                    continue;
                }

                const clipChain = getRegionClipChain(this.layout, reg);
                const hasClip = !blueprint.isHtml && applyRegionClipChain(ctx, clipChain);

                if (blueprint.isHtml && this.dynamicElements) {
                    let isNewElement = false;
                    if (!this.dynamicElements[key]) {
                        this.dynamicElements[key] = blueprint.create(reg);
                        document.body.appendChild(this.dynamicElements[key]);
                        isNewElement = true;
                    }
                    if (needsSync || isNewElement) {
                        const bldCompStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
                        blueprint.sync(this.dynamicElements[key], this, app, compData);
                        if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                            const bldCompElapsed = performance.now() - bldCompStart;
                            bumpBLDPerf(this, "componentSync");
                            bumpBLDPerf(this, "htmlSync");
                            bumpBLDPerf(this, "componentMs", bldCompElapsed);
                            bumpBLDComponentPerf(this, key, reg.type, "html", bldCompElapsed);
                        }
                    }
                    bumpBLDPerf(this, "htmlOpacity");
                    this.dynamicElements[key].style.opacity = this.alpha;
                    if (reg.zIndex !== undefined) {
                        this.dynamicElements[key].style.zIndex = reg.zIndex;
                    }
                } else if (blueprint.isHybrid) {
                    const bldCompStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
                    compData.alpha = this.alpha;
                    blueprint.sync(ctx, this, app, compData);
                    if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                        const bldCompElapsed = performance.now() - bldCompStart;
                        bumpBLDPerf(this, "componentSync");
                        bumpBLDPerf(this, "hybridSync");
                        bumpBLDPerf(this, "componentMs", bldCompElapsed);
                        bumpBLDComponentPerf(this, key, reg.type, "hybrid", bldCompElapsed);
                    }
                } else {
                    const bldCompStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
                    blueprint.sync(ctx, this, compData);
                    if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                        const bldCompElapsed = performance.now() - bldCompStart;
                        bumpBLDPerf(this, "componentSync");
                        bumpBLDPerf(this, "canvasSync");
                        bumpBLDPerf(this, "componentMs", bldCompElapsed);
                        bumpBLDComponentPerf(this, key, reg.type, "canvas", bldCompElapsed);
                    }
                }
                if (hasClip) ctx.restore();
            }

            // THE OVERLAY BACKDROP FIX: Draw regions requested to render above components
            const bldOverlayStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
            handleDrawCTX(this, ctx, true);
            if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                bumpBLDPerf(this, "overlayBg");
                bumpBLDPerf(this, "overlayBgMs", performance.now() - bldOverlayStart);
            }

            // THE HYBRID OVERLAY PASS: Call widgets that requested Z-Index priority
            const overlayEntries = this._overlayHybridEntries || [];
            for (let i = 0; i < overlayEntries.length; i++) {
                const { key, reg, blueprint } = overlayEntries[i];
                if (Number(reg.alpha) <= 0.001) continue;
                const bldCompStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
                const overlayData = this._compDataCache[key];
                if (overlayData) {
                    const hasClip = applyRegionClipChain(ctx, getRegionClipChain(this.layout, reg));
                    overlayData.alpha = this.alpha;
                    blueprint.sync(ctx, this, app, overlayData, true);
                    if (hasClip) ctx.restore();
                    if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                        const bldCompElapsed = performance.now() - bldCompStart;
                        bumpBLDPerf(this, "componentSync");
                        bumpBLDPerf(this, "hybridSync");
                        bumpBLDPerf(this, "overlayHybrid");
                        bumpBLDPerf(this, "componentMs", bldCompElapsed);
                        bumpBLDComponentPerf(this, key, reg.type, "overlayHybrid", bldCompElapsed);
                    }
                }
            }
            if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
                bumpBLDPerf(this, "componentLoop");
                bumpBLDPerf(this, "componentLoopMs", performance.now() - bldLoopStart);
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
        const bldShieldStart = window.DERP_BLD_PROFILE && this.id === BLD_ID ? performance.now() : 0;
        syncDerpShield(this);
        if (window.DERP_BLD_PROFILE && this.id === BLD_ID) {
            bumpBLDPerf(this, "shieldSync");
            bumpBLDPerf(this, "shieldMs", performance.now() - bldShieldStart);
            bumpBLDPerf(this, "draw");
            bumpBLDPerf(this, "drawMs", performance.now() - bldDrawStart);
            flushBLDPerf(this);
        }

        if (needsSync) {
            this._prevBastaState = {
                posX: this.pos[0], posY: this.pos[1],
                sizeW: this.size[0], sizeH: this.size[1],
                scale: app.canvas.ds.scale,
                offsetX: app.canvas.ds.offset[0], offsetY: app.canvas.ds.offset[1]
            };
        }
    }

    close(reason = "implicit") {
        if (this.properties?.explicitCloseOnly === true) {
            const allowedReasons = Array.isArray(this.properties.explicitCloseReasons)
                ? this.properties.explicitCloseReasons
                : ["headerButton", "footerButton"];
            if (!allowedReasons.includes(reason)) return false;
        }
        this.isClosing = true;
        this._forceSync = true;
        if (this.hostNode) {
            if (this.hostNode.refreshNodeLayoutMap) this.hostNode.refreshNodeLayoutMap();
            if (this.hostNode.setDirtyCanvas) this.hostNode.setDirtyCanvas(true);
        }
        return true;
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
        if (config.layoutMap) existing.layoutMap = config.layoutMap;

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
        existing._warpOnOpen = config?.warpOnOpen !== false;
        existing._pendingViewportFitFrames = existing._warpOnOpen ? 10 : 0;
        if (existing._warpOnOpen) {
            requestAnimationFrame(() => {
                requestBastaViewportFit(existing);
            });
        }
        return existing;
    }

    if (activeBastas.has(id)) activeBastas.get(id).destroy();
    return new BastaInstance(id, config);
}

export function drawBastaLayer(ctx) {
    if (activeBastas.size === 0) return;

    for (const basta of activeBastas.values()) {
        const updateStart = performance.now();
        const isAlive = basta.update();
        const updateMs = performance.now() - updateStart;

        // THE AWAKE CONSUMPTION: Allow Bastas to request canvas dirtying for local animations
        let isAwake = false;
        if (basta._derpAwakeFrames > 0) {
            basta._derpAwakeFrames--;
            isAwake = true;
        }

        if (isAlive || isAwake || (basta.alpha > 0)) {
            const drawStart = performance.now();
            basta.draw(ctx);
            const drawMs = performance.now() - drawStart;
            recordBastaOverlayPerf(basta, updateMs, drawMs, isAwake || isAlive);
            if (isAlive || isAwake) app.canvas.setDirty(true, true);
        } else {
            recordBastaOverlayPerf(basta, updateMs, 0, false);
        }
    }
}
