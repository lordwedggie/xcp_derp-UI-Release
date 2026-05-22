/**
 * PROJECT: xcpDerpNodes
 * PATH: ./js/fatha/core/masterLayoutEngine.js
 */
import { interpretLayoutProps } from "../../herbina/utils/widgetsUtils.js";
import { renderLayoutDebug } from "../helpers/debugPainter.js";

/**
 * t: Translates a key using the global locale registry.
 * Moved to masterLayoutEngine to consolidate framework files.
 */
export const t = (key) => {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;

    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};

    for (const segment of path) {
        target = target[segment];
        if (target === undefined) {
            return `MISSING: ${key}`;
        }
    }
    return target;
};

const MIN_WIDGET_WIDTH = 10; // Systemic minimum floor to prevent negative width rendering
const SQUISH_WIDTH = 10;     // Arbitrary tiny width used during the rigid floor measurement pass

function isHeaderRegionDescendant(region, regionMap) {
    let current = region;
    while (current) {
        if (current.key === "headerRegion") return true;
        current = current.parentKey ? regionMap[current.parentKey] : null;
    }
    return false;
}

function toBox4(v) {
    if (!Array.isArray(v)) return [0, 0, 0, 0];
    if (v.length === 4) {
        return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0, Number(v[3]) || 0];
    }
    const x = Number(v[0]) || 0;
    const y = Number(v[1]) || 0;
    return [x, y, x, y];
}

function getRegionOffsetBox(cfg) {
    const typeStr = String(cfg?.type || "").toLowerCase();
    if (!typeStr.includes("region")) return [0, 0, 0, 0];
    return toBox4(cfg?.regionOffset);
}

const LAYOUT_PROFILE_WINDOW_MS = 1000;

function isLayoutProfilingEnabled() {
    return !!window.DERP_LAYOUT_PROFILING;
}

function flushLayoutProfile(engine) {
    if (!engine || !engine._profile || !engine.owner) return;
    const p = engine._profile;
    const now = performance.now();
    if ((now - p.windowStart) < LAYOUT_PROFILE_WINDOW_MS) return;

    const ownerName = engine.owner.titleLabel || engine.owner.title || engine.owner.type || "unknown";
    const avgComputeMs = p.computeCount > 0 ? (p.computeMs / p.computeCount) : 0;
    const hitRate = p.measureCalls > 0 ? ((p.measureHits / p.measureCalls) * 100) : 0;

    console.debug(
        `[FathaProfile] ${ownerName} | compute=${p.computeCount} avg=${avgComputeMs.toFixed(2)}ms ` +
        `measureCalls=${p.measureCalls} hits=${p.measureHits} misses=${p.measureMisses} hitRate=${hitRate.toFixed(1)}%`
    );

    p.windowStart = now;
    p.computeCount = 0;
    p.computeMs = 0;
    p.measureCalls = 0;
    p.measureHits = 0;
    p.measureMisses = 0;
}

const RESERVED_KEYWORDS = [
    "margin", "padding", "spacing", "width", "height",
    "minWidth", "minHeight",
    "objectAlign", "labelAlign", "themeKey", "align",
    "baseline", "anchor", "dir", "corners", "offset", "hidden",
    "text", "label", "measureText", "items", "prompt", "bypassHashOptimization",
    "palette"
];

/**
 * masterLayoutEngine: A unified layout processor for both UI Panels and Graph Nodes.
 * Optimized with a cache-key system to prevent redundant calculations.
 * STRICT MODE: No fallbacks. Reports all missing values.
 */
export class masterLayoutEngine {
    _buildMeasureCacheKey(cfg, context, key) {
        const c = cfg || {};
        const margin = Array.isArray(c.margin) ? c.margin.join(",") : "";
        const padding = Array.isArray(c.padding) ? c.padding.join(",") : "";
        const spacing = Array.isArray(c.spacing) ? c.spacing.join(",") : "";
        const itemsLen = Array.isArray(c.items) ? c.items.length : 0;
        const parentH = Number.isFinite(context?.parentHeight) ? Number(context.parentHeight).toFixed(2) : "";

        return `${key}|${this.originalWidth}|${parentH}|${c.type || ""}|${c.themeKey || ""}|${c.width}|${c.height}|${c.minWidth}|${c.minHeight}|${c.dir || ""}|${c.wrap === true ? 1 : 0}|${c.cutoff === true ? 1 : 0}|${c.displayMode || ""}|${c.indicator === true ? 1 : (c.indicator || 0)}|${c.toggleWidth}|${c.gap}|${c.showWeight === true ? 1 : 0}|${c.weight}|${c.fontWeight || ""}|${c.text || ""}|${c.label || ""}|${c.value || ""}|${c.measureText || ""}|${c.icon || ""}|${itemsLen}|${margin}|${padding}|${spacing}`;
    }

    /**
     * _hashMap: Generates a deep string hash of the layout map to detect structural/value changes
     */
    _hashMap(map, depth = 0) {
        if (!map || depth > 5) return "";
        let str = "";
        for (const k in map) {
            if (typeof map[k] === "function" || k === "parentKey" || k === "hostNode" || k === "node" || k === "app") continue;
            const v = map[k];
            if (typeof v === "object" && v !== null) {
                if (v.id && v.type) continue; // Skip LiteGraph nodes
                if (v.bypassHashOptimization) { str += `${k}:bypass_${this._hashStamp}|`; continue; }
                if (Array.isArray(v)) str += `${k}:[${v.join(",")}]|`;
                else str += `${k}:{${this._hashMap(v, depth + 1)}}|`;
            } else {
                if (k === "bypassHashOptimization" && v) str += `bypass_${this._hashStamp}|`;
                else str += `${k}:${v}|`;
            }
        }
        return str;
    }

    /**
     * _localize: Internal helper to resolve translation keys before measurement.
     */
    _localize(cfg) {
        if (!cfg || typeof cfg !== 'object') return cfg;
        const out = { ...cfg };
        ["text", "label", "measureText"].forEach(k => {
            if (typeof out[k] === "string") out[k] = t(out[k]);
        });
        if (Array.isArray(out.items)) {
            out.items = out.items.map(i => (typeof i === "string" ? t(i) : i));
        }
        return out;
    }
    constructor(owner = null) {
        this.owner = owner; // Context: can be a ComfyUI node or a system panel object
        this.regions = {};
        this.computedRegions = {}; // Finalized buffer for rendering
        this.totalHeight = 0;
        this.originalWidth = 0; // Stores the initial node width (before expansion)
        this.contentMinWidth = 0; // Tracks the absolute minimum width required by content
        this.contentMinHeight = 0;
        this._lastCacheKey = ""; // Optimization: Tracks the previous state hash
        this._cachedMapHash = ""; // Optimization: Cached _hashMap result to avoid per-frame recursion
        this._hashStamp = 1; // Optimization: Scoped invalidation stamp for bypassHashOptimization
        this._measureCache = new Map(); // Optimization: Tracks intra-pass measurements
        this._profile = {
            windowStart: performance.now(),
            computeCount: 0,
            computeMs: 0,
            measureCalls: 0,
            measureHits: 0,
            measureMisses: 0
        };
    }

    _getReservedWidth(cfg, context, key = "unknown") {
        const hash = this._buildMeasureCacheKey(cfg, context, key);
        const profiling = isLayoutProfilingEnabled();
        if (profiling) this._profile.measureCalls++;

        if (this._measureCache && this._measureCache.has(hash)) {
            if (profiling) this._profile.measureHits++;
            return this._measureCache.get(hash);
        }

        if (profiling) this._profile.measureMisses++;
        const result = this._calculateReservedWidth(cfg, context, key);
        if (this._measureCache) this._measureCache.set(hash, result);
        return result;
    }

    _calculateReservedWidth(cfg, context, key = "unknown") {
        const localCfg = this._localize(cfg);
        const p = interpretLayoutProps(localCfg, {...context, originalWidth: this.originalWidth});
        if (cfg.hidden || p.hidden) return 0;

        const padX = p.padding ? (p.padding.length === 4 ? p.padding[0] + p.padding[2] : (p.padding[0] * 2)) : 0;
        const wProp = String(cfg.width === undefined ? "full" : cfg.width).toLowerCase();
        const hProp = String(cfg.height === undefined ? "auto" : cfg.height).toLowerCase();

        // completely overrides text-measured minimums to allow node shrinking.
        const isAutoWidth = this.owner?.properties?.autoWidth !== false || context.isSystemPanel;
        const useExplicitMin = !isAutoWidth && cfg.minWidth !== undefined;

        if (wProp.startsWith("match")) {
            const multiplier = parseFloat(wProp.split(":")[1]) || 1.0;
            let base = 0;
            if (typeof p.height === 'number') {
                base = p.height;
            } else if (hProp === "fill" || hProp === "full" || hProp === "fit" || hProp.startsWith("match")) {
                const mY = (p.margin?.length === 4) ? ((p.margin[1] || 0) + (p.margin[3] || 0)) : ((p.margin?.[1] || 0) * 2);
                base = (context.parentHeight || 24) - mY;
            } else {
                base = (p.baseHeight || 12);
            }
            return base * multiplier;
        }

        if (wProp === "fit") {
            let childSum = 0;
            let childMax = 0;
            const isRow = cfg.dir === "row";
            const childKeys = Object.keys(cfg).filter(k => {
                if (RESERVED_KEYWORDS.includes(k) || typeof cfg[k] !== 'object' || cfg[k] === null || Array.isArray(cfg[k])) return false;
                const cp = interpretLayoutProps(cfg[k], {...context, originalWidth: this.originalWidth});
                return !(cfg[k].hidden || cp.hidden);
            });
            if (childKeys.length > 0) {
                childKeys.forEach(k => {
                    const cW = this._getReservedWidth(cfg[k], context, k);
                    childSum += cW;
                    childMax = Math.max(childMax, cW);
                });
                if (useExplicitMin) return cfg.minWidth + padX;
                const baseMin = p.minWidth || 0;
                return Math.max(baseMin, (isRow ? childSum : childMax) + padX);
            }
            if (useExplicitMin) return cfg.minWidth + padX;
            return (p.minWidth || 0) + padX;
        }

        if (wProp === "auto") {
            let autoSum = 0;
            let autoMax = 0;
            const isRow = cfg.dir === "row";
            const childKeys = Object.keys(cfg).filter(k => {
                if (RESERVED_KEYWORDS.includes(k) || typeof cfg[k] !== 'object' || cfg[k] === null || Array.isArray(cfg[k])) return false;
                const cp = interpretLayoutProps(cfg[k], {...context, originalWidth: this.originalWidth});
                return !(cfg[k].hidden || cp.hidden);
            });

            if (childKeys.length > 0) {
                childKeys.forEach(k => {
                    const cW = this._getReservedWidth(cfg[k], context, k);
                    autoSum += cW;
                    autoMax = Math.max(autoMax, cW);
                });
                const baseMin = p.minWidth || 0;
                return Math.max(baseMin, (isRow ? autoSum : autoMax) + padX);
            }

            const evalW = (typeof p.width === 'number') ? p.width : 0;
            // We only add padX for numeric/fixed widths to avoid the double-padding bug.
            const isAuto = wProp === "auto";
            const baseMin = p.minWidth || 0;
            return Math.max(baseMin, evalW + (isAuto ? 0 : padX));
        }

        const evalW = (typeof p.width === 'number') ? p.width : 0;
        const contentFloor = cfg.wrap ? (cfg.minWidth || 0) : (evalW + padX);

        // so that the row-level fitSharedExpansion uses accurate reserved widths.
        if (wProp === "fit" || wProp === "full") {
            let childSum = 0, childMax = 0;
            const isRow = cfg.dir === "row";
            const childKeys = Object.keys(cfg).filter(k => {
                if (RESERVED_KEYWORDS.includes(k) || typeof cfg[k] !== 'object' || cfg[k] === null || Array.isArray(cfg[k])) return false;
                const cp = interpretLayoutProps(cfg[k], {...context, originalWidth: this.originalWidth});
                return !(cfg[k].hidden || cp.hidden);
            });

            if (childKeys.length > 0) {
                childKeys.forEach(k => {
                    const cW = this._getReservedWidth(cfg[k], context, k);
                    childSum += cW;
                    childMax = Math.max(childMax, cW);
                });
                if (useExplicitMin) return cfg.minWidth + padX;
                const baseMin = p.minWidth || 0;
                return Math.max(baseMin, (isRow ? childSum : childMax) + padX);
            }
            if (useExplicitMin) return cfg.minWidth + padX;
            const baseMin = p.minWidth || MIN_WIDGET_WIDTH;
            return Math.max(baseMin, contentFloor);
        }

        if (useExplicitMin) return cfg.minWidth + padX;
        const fallbackMin = p.minWidth || 0;
        return Math.max(fallbackMin, contentFloor);
    }
    /**
     * Resets the engine state before a new computation.
     */
    begin() {
        this.regions = {};
        if (this._measureCache) this._measureCache.clear(); // Clear intra-pass cache
        // Automatically hide the HTML debug layer. It will be re-enabled
        // later in the frame if drawDebug() is actively called.
        if (this._debugContainer) this._debugContainer.style.display = "none";
    }

    /**
     * compute: Finalized width identification and alignment enforcement.
     * FIXED: Strictly prevents right-aligned items from floating outside bounds.
     * ADDED: forceOverride param to bypass cache check.
     */
    compute(bounds, profileMap = {}, context = {}, forceOverride = false) {
        if (!bounds) return;
        const profiling = isLayoutProfilingEnabled();
        const startTs = profiling ? performance.now() : 0;

        const { SNAP } = this.owner?.getDerpVars ? this.owner.getDerpVars(this.owner) : { SNAP: 10 };

        // ONLY if the host actually calls drawDebug() in "Layout" mode.
        if (this._debugContainer) this._debugContainer.style.display = "none";

        const drawHeader = this.owner?.properties?.drawHeader;
        const dMode = String(this.owner?.properties?.debugMode ?? context.debugMode ?? "None");
        const currentH = this.owner?._derpVisualHeight || 0;
        const isSys = context.isSystemPanel === true;

        const isForced = forceOverride || this.owner?._forceSync;
        if (isForced || forceOverride) this._hashStamp++;
        const hSlot = isSys ? "sys" : (this.owner?._hideSlot);

        if (isForced || forceOverride) this._cachedMapHash = "";
        const rawMapHash = (this.owner && this.owner._layoutMapHash !== undefined)
            ? this.owner._layoutMapHash
            : (this._cachedMapHash || (this._hashMap ? (this._cachedMapHash = this._hashMap(profileMap)) : ""));
        const mapHash = typeof rawMapHash === "string" ? rawMapHash : (rawMapHash == null ? "" : String(rawMapHash));

        // invalidate common widget caches on the owner to ensure the new data is actually painted.
        if (this.owner && mapHash.includes("bypass_")) {
            this.owner._btnSimpleCache = {};
            this.owner._dropdownCache = {};
            this.owner._fileBrowserCache = {};
            this.owner._shouldSync = true;
        }

        const structureHash = `${hSlot}_${drawHeader}_${dMode}_${this.owner?._currentThemeName}_${this.owner?.titleLabel}_${mapHash}`;
        const cacheKey = `${bounds.x},${bounds.y},${bounds.w},${bounds.h}_${currentH}_${structureHash}`;

        if (this._lastCacheKey === cacheKey && Object.keys(this.computedRegions).length > 0 && !isForced) {
            if (this.owner) this.owner._forceSync = false;
            return;
        }

        const canSkipPass1 = this._lastStructureHash === structureHash && this.contentMinWidth > 0 && !isForced;

        this._lastCacheKey = cacheKey;
        this._lastStructureHash = structureHash;
        this.rootX = bounds.x;
        this.rootY = bounds.y;

        const usableW = Math.max(MIN_WIDGET_WIDTH, bounds.w);

        // PASS 1: Rigid floor measurement (Cached if structure is identical)
        if (!canSkipPass1) {
            this.originalWidth = SQUISH_WIDTH;
            const measureBounds = { ...bounds, x: isSys ? bounds.x : 0, w: SQUISH_WIDTH, h: 0 };
            this.runLayoutPass(measureBounds, profileMap, context);

            const rootRegsMeasure = Object.entries(this.regions)
                .filter(([k, r]) => !r.isChild && k !== "panelBackground" && !r.ignoreLayout)
                .map(([k, r]) => r);
            this.contentMinHeight = rootRegsMeasure.length > 0 ? Math.max(...rootRegsMeasure.map(r => r.y + r.h + (r.margin?.length === 4 ? r.margin[3] : (r.margin?.[1] || 0)))) - bounds.y : 40;
        }
        const rigidMinWidth = this.contentMinWidth;

        // PASS 2: Content Alignment.
        const padL = this.owner?._padL || 0;
        const padR = this.owner?._padR || 0;

        const physicalW = isSys ? bounds.w : (this.owner?.size?.[0] || bounds.w);
        const layoutX = isSys ? bounds.x : 0;

        const finalUsableW = Math.max(MIN_WIDGET_WIDTH, rigidMinWidth, (isSys ? bounds.w : physicalW));
        const newBounds = { ...bounds, x: layoutX, w: finalUsableW };
        this.originalWidth = finalUsableW;
        this.runLayoutPass(newBounds, profileMap, context);

        this.contentMinWidth = rigidMinWidth;

        const finalWidth = finalUsableW;
        this.regions.panelBackground.x = isSys ? bounds.x : 0;
        // This ensures margins are visible even while the node size is lerping to catch up.
        this.regions.panelBackground.w = finalWidth;

        const rootRegions = Object.entries(this.regions)
            .filter(([k, r]) => !r.isChild && k !== "panelBackground" && !r.ignoreLayout)
            .map(([k, r]) => r);

        const bottomPoint = rootRegions.length > 0 ? Math.max(...rootRegions.map(r => r.y + r.h + (r.margin?.[3] || 0))) : bounds.y;
        let rawHeight = (bottomPoint - bounds.y);

        // to conform to LiteGraph constraints without disrupting rigid internal widget placement.
        const shouldSnap = this.owner?.properties?.snapHeight !== false;
        if (shouldSnap && !isSys) {
            rawHeight = Math.ceil(rawHeight / SNAP) * SNAP;
        }

        this.totalHeight = rawHeight;
        this.regions.panelBackground.h = this.totalHeight;

        this.totalWidth = finalWidth;

        this.computedRegions = { ...this.regions };

        if (profiling) {
            this._profile.computeCount++;
            this._profile.computeMs += (performance.now() - startTs);
            flushLayoutProfile(this);
        }
    }

    runLayoutPass(bounds, profileMap, context) {
        this.begin();

        const { SNAP: currentSnap } = this.owner?.getDerpVars ? this.owner.getDerpVars(this.owner) : { SNAP: 10 };

        this.regions.panelBackground = {
            key: "panelBackground",
            ...bounds,
            margin: [0, 0],
            padding: [0, 0],
            spacing: [0, 0]
        };

        // The caller (grandFatha.js or grandFathaSysPanel.js) is now responsible for providing the full map.
        const { footerRegion, ...mainMap } = profileMap;

        const fullContext = { ...context, owner: this.owner };
        this.processRecursive(mainMap, this.regions.panelBackground, fullContext);

        if (footerRegion) {
            this.processRecursive({ footerRegion }, this.regions.panelBackground, context);
        }

        const allRegions = Object.values(this.regions).filter(r => r.key !== "panelBackground" && !r.ignoreLayout);
        this._layoutCache_all = allRegions;
        const propMinW = this.owner?.properties?.minWidth || 0;
        const shouldIgnoreHeaderWidthFloor = this.owner?._ignoreHeaderWidthFloor === true || this.owner?.properties?.drawHeader === false;
        const widthRegions = shouldIgnoreHeaderWidthFloor
            ? allRegions.filter((region) => !isHeaderRegionDescendant(region, this.regions))
            : allRegions;
        if (widthRegions.length > 0) {
            const contentRequired = Math.max(...widthRegions.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0)))) - bounds.x;
            this.contentMinWidth = Math.max(propMinW, contentRequired);
        } else {
            this.contentMinWidth = propMinW;
        }
    }

    /**
     * processRecursive: Handles region placement, alignment, and PARENT EXPANSION.
     * FIXED: Now expands parent width if children overflow, ensuring margins are preserved.
     */

    processRecursive(map, parent, context, isChild = false) {
        const scopedContext = {
            ...context,
            geometry: { x: parent.x, y: parent.y, w: parent.w, h: parent.h }
        };

        const entries = Object.entries(map).filter(([k, config]) => {
            if (!config || typeof config !== 'object') return true;
            const p = interpretLayoutProps(config, { ...scopedContext, originalWidth: this.originalWidth });
            return !(config.hidden || p.hidden);
        });

        if (entries.length === 0) return;

        let currentLevelMaxY = parent.y;
        let currentLevelMaxX = parent.x + (parent.padding?.[0] || 0);
        const isParentRow = parent.dir === "row";

        // --- "fit" Logic Pre-calculation (Row Only) ---
        let fitSharedExpansion = 0;
        if (isParentRow) {
            let totalReservedWidth = 0;
            let fitCount = 0;

            let estH = parent.h || 0;
            if (!estH) {
                for (let i = 0; i < entries.length; i++) {
                    const p = interpretLayoutProps(entries[i][1], { ...scopedContext, originalWidth: this.originalWidth });
                    if (p.height !== "fill" && !String(p.height).startsWith("match")) {
                        const rigidH = (typeof p.height === 'number') ? p.height : (p.baseHeight || 12);
                        estH = Math.max(estH, rigidH);
                    }
                }
            }
            context.parentHeight = estH || 24;

            for (let i = 0; i < entries.length; i++) {
                const [ckey, config] = entries[i];
                const p = interpretLayoutProps(config, { ...scopedContext, originalWidth: this.originalWidth });
                const rawM = p.margin || [0, 0];
                const margin = rawM.length === 4 ? rawM : [rawM[0] ?? 0, rawM[1] ?? 0, rawM[0] ?? 0, rawM[1] ?? 0];
                const s = p.spacing || [0, 0];
                const anchor = config.anchor;

                let itemOverhead = (margin[0] + margin[2]);
                if (i < entries.length - 1) itemOverhead += (s[0] || 0);

                if (anchor && anchor.axis !== "y" && anchor.offset) {
                    itemOverhead += anchor.offset;
                }

                const wStr = String(p.width || "full").toLowerCase();
                // Only "full" items should act as flex springs and absorb leftover row space.
                if (wStr === "full") fitCount++;

                totalReservedWidth += this._getReservedWidth(config, scopedContext, ckey) + itemOverhead;
            }

            if (fitCount > 0) {
                const parentPadL = parent.padding ? (parent.padding.length === 4 ? (parent.padding[0] || 0) : (parent.padding[0] || 0)) : 0;
                const parentPadR = parent.padding ? (parent.padding.length === 4 ? (parent.padding[2] || 0) : (parent.padding[0] || 0)) : 0;
                const parentPadX = parentPadL + parentPadR;
                const parentMX = (parent.margin?.length === 4) ? (parent.margin[0] + parent.margin[2]) : (parent.margin?.[0] * 2 || 0);
                const availableW = isChild ? parent.w : (this.originalWidth - parentMX);
                const leftoverSpace = (availableW - parentPadX) - totalReservedWidth;
                fitSharedExpansion = Math.max(0, leftoverSpace / fitCount);
            }
        }
        for (const [key, config] of entries) {
            const localCfg = this._localize(config);
            const props = interpretLayoutProps(localCfg, { ...scopedContext, originalWidth: this.originalWidth });

            const isOut = (config.outSlotIdx !== undefined) || (props.outSlotIdx !== undefined);
            const isIn = (config.inSlotIdx !== undefined) || (props.inSlotIdx !== undefined);
            const isSlotRoot = (isIn || isOut) && (!parent || (parent.outSlotIdx === undefined && parent.inSlotIdx === undefined));

            const padL = (!context.isSystemPanel && isSlotRoot && isIn) ? (this.owner?._padL || 0) : 0;
            const padR = (!context.isSystemPanel && isSlotRoot && isOut) ? (this.owner?._padR || 0) : 0;
            const rawM = props.margin || [0, 0];
            const margin = rawM.length === 4 ? rawM : [rawM[0] ?? 0, rawM[1] ?? 0, rawM[0] ?? 0, rawM[1] ?? 0];
            const spacing = props.spacing || [0, 0];

            // --- UPDATED: Cross-Axis Match Support ---
            const anchor = config.anchor;

            // so they survive the fallback `if/else` checks below.
            let regW, regH, regX, regY;

            // FIX FOR V4: Default undefined widths to 'full' so root containers behave correctly
            // without needing the obsolete dynamic getter injection.
            const wProp = props.width === undefined ? "full" : String(props.width).toLowerCase();

            // --- UPDATED: Cross-Axis Match Support ---
            const hPropResolved = String(config.height === undefined ? "auto" : config.height).toLowerCase();
            const wPropResolved = String(config.width === undefined ? "full" : config.width).toLowerCase();

            // Pre-calculate base coordinates.
            // We calculate coordinates independent of widths/heights so the engine
            // doesn't crash if it hits a dimension fallback.
            let baseY;

            const fallbackOffsetY = (anchor && anchor.axis === "y" && anchor.offset) ? anchor.offset : 0;
            const fallbackOffsetX = (anchor && anchor.axis !== "y" && anchor.offset) ? anchor.offset : 0;

            if (anchor && this.regions[anchor.target]) {
                const target = this.regions[anchor.target];
                const tM = target.margin || [0, 0, 0, 0];
                if (anchor.axis === "y") {
                    baseY = target.y + target.h + tM[3] + (spacing[1] || 0) + (anchor.offset || 0) + margin[1];
                } else {
                    baseY = target.y + margin[1];
                }
            } else if (isParentRow) {
                baseY = parent.y + (parent.padding?.[1] || 0) + margin[1] + fallbackOffsetY;
            } else {
                baseY = currentLevelMaxY + margin[1] + fallbackOffsetY;
            }

            // Calculate Base X & Y Coordinates
            if (anchor && this.regions[anchor.target]) {
                const target = this.regions[anchor.target];
                const tM = target.margin || [0, 0, 0, 0];
                if (anchor.axis === "y") {
                    regX = parent.x + margin[0] + padL;
                    regY = target.y + target.h + tM[3] + (anchor.offset || 0) + margin[1];
                } else {
                    regX = target.x + target.w + tM[2] + (anchor.offset || 0) + margin[0] + padL;
                    regY = target.y + margin[1];
                }
            } else if (isParentRow) {
                regX = currentLevelMaxX + margin[0] + fallbackOffsetX + padL;
                regY = baseY;
            } else {
                regX = parent.x + (parent.padding?.[0] || 0) + margin[0] + fallbackOffsetX + padL;
                regY = baseY;
            }
            // --- DIMENSION CALCULATION ---
            // 1. Calculate Initial Width
            if (wPropResolved.startsWith("match")) {
                const multiplier = parseFloat(wPropResolved.split(":")[1]) || 1.0;
                if (typeof props.height === 'number') {
                    regH = props.height;
                } else if (hPropResolved === "fill" || hPropResolved === "full" || hPropResolved === "fit") {
                    const mY = (props.margin?.length === 4) ? ((props.margin[1] || 0) + (props.margin[3] || 0)) : ((props.margin?.[1] || 0) * 2);
                    regH = ((parent ? (parent.h || context.parentHeight) : context.parentHeight) || 24) - mY;
                } else {
                    regH = (props.baseHeight || 12);
                }
                regW = regH * multiplier;
            } else if (wPropResolved === "full" && isParentRow) {
                regW = this._getReservedWidth(config, scopedContext, key) + fitSharedExpansion;
            } else if (wPropResolved === "fit" && isParentRow) {
                regW = this._getReservedWidth(config, scopedContext, key);
            } else if (wPropResolved === "auto") {
                regW = this._getReservedWidth(config, scopedContext, key);
            } else if ((wPropResolved === "fit" || wPropResolved === "full") && !isParentRow) {
                const isRootFooter = !isChild && key === "footerRegion";
                const usePhysicalSize = isRootFooter && this.originalWidth !== SQUISH_WIDTH;
                const effectiveParentW = usePhysicalSize ? (this.owner?.size?.[0] || parent.w) : parent.w;

                // Also prevent NaN by strictly ensuring props.width is numeric.
                const evalW = (typeof props.width === 'number') ? props.width : 0;
                const padX = props.padding ? (props.padding[0] * 2) : 0;
                const hasContent = config.text !== undefined || config.value !== undefined || config.label !== undefined || config.icon !== undefined;
                const contentFloor = Math.max(props.minWidth || 10, (hasContent && !config.wrap) ? (evalW + padX) : 0);
                const pPadR = parent.padding ? (parent.padding.length === 4 ? parent.padding[2] : (parent.padding[0] || 0)) : 0;
                const consumedX = regX - parent.x;
                const availableSpace = effectiveParentW - consumedX - margin[2] - padR - pPadR;

                regW = Math.max(contentFloor, availableSpace);
            } else {
                regW = typeof props.width === 'number' ? props.width : this._getReservedWidth(config, scopedContext, key);
            }

            // 2. Calculate Initial Height
            let isFillHeight = false;

            if (hPropResolved === "fill" || hPropResolved === "full" || hPropResolved === "fit") {
                isFillHeight = true;
                if (isParentRow) {
                    regH = props.minHeight || 12; // Temporary floor
                } else if (parent) {
                    const usedHeight = baseY - parent.y;

                    let reservedBySiblings = 0;
                    const siblings = entries;
                    const currentIndex = siblings.findIndex(([k]) => k === key);

                    let siblingSpacingBuffer = 0;

                    // siblings to ensure the calculated height doesn't force a trailing overflow.
                    if (currentIndex < siblings.length - 1) {
                        siblingSpacingBuffer += (props.spacing?.[1] || (parent.spacing?.[1] || 0));
                    }

                    for (let j = currentIndex + 1; j < siblings.length; j++) {
                        const sibConfig = siblings[j][1];
                        const sibP = interpretLayoutProps(sibConfig, {
                            ...context,
                            originalWidth: this.originalWidth
                        });
                        const sibHProp = String(sibConfig.height === undefined ? "auto" : sibConfig.height).toLowerCase();

                        let estimatedSibH = 0;
                        if (typeof sibP.height === 'number') {
                            estimatedSibH = sibP.height;
                        } else if (sibHProp === "auto") {
                            estimatedSibH = (sibP.baseHeight || 12);
                        } else if (sibHProp === "fill" || sibHProp === "full" || sibHProp === "fit") {
                            estimatedSibH = sibP.minHeight || 12;
                        } else if (sibHProp === "match") {
                            estimatedSibH = (sibP.baseHeight || 12) + (sibP.padding?.[1] * 2 || 0);
                        }

                        reservedBySiblings += estimatedSibH + (sibP.margin?.[1] * 2 || 0);

                        // Accumulate spacings of subsequent siblings (except the last)
                        if (j < siblings.length - 1) {
                            siblingSpacingBuffer += (sibP.spacing?.[1] || (parent.spacing?.[1] || 0));
                        }
                    }

                    let footerBuffer = 0;
                    if (!isChild && this.owner?.properties?.footerHeight) {
                        footerBuffer = this.owner.properties.footerHeight + (this.owner.properties.spacing?.[1] || 0) + (this.owner.properties.margin?.[1] || 0);
                    }

                    const remaining = parent.h - usedHeight - reservedBySiblings - siblingSpacingBuffer - footerBuffer - margin[1];
                    const floorH = config.minHeight || props.minHeight || 12;
                    regH = Math.max(floorH, remaining);
                } else {
                    regH = (props.baseHeight || 12);
                }
            } else if (wPropResolved === "match") {
                // Height was calculated in Step 1 as a fallback, keep it
            } else if (hPropResolved === "match") {
                if (anchor && this.regions[anchor.target]) {
                    regH = this.regions[anchor.target].h;
                } else if (isParentRow) {
                    // This prevents them from bloating the row height with stale estimations or square-fallbacks.
                    regH = props.minHeight || 0;
                } else {
                    regH = regW;
                }
            } else {
                const baseH = hPropResolved === "auto" ? (props.baseHeight || 0) : (props.height || 0);
                const floorH = config.minHeight || props.minHeight || 0;
                regH = Math.max(baseH, floorH);
            }
            this._isFillHeight = isFillHeight;
            // FIX: Declare hAlign and vAlign with inheritance support
            const hAlign = props.objX || (isChild ? null : parent.objX);
            const vAlign = props.objY || (isChild ? null : parent.objY);

            if (hAlign || vAlign || isParentRow) {
                let proposedX = regX;
                let proposedY = regY;
                let isExplicitRight = false;

                // Horizontal alignment
                if (hAlign) {
                    if (hAlign.includes('center')) {
                        proposedX = parent.x + ((parent.w - regW) / 2);
                    } else if (hAlign.includes('right')) {
                        const parentPaddingR = parent.padding ? (parent.padding.length === 4 ? parent.padding[2] : (parent.padding[0] || 0)) : 0;
                        proposedX = parent.x + parent.w - regW - margin[2] - parentPaddingR;
                        isExplicitRight = true;
                    }
                }

                // Vertical alignment (FIX: Centers buttons in the Row's height)
                // If in a row, default to middle alignment unless specified otherwise
                const targetVAlign = vAlign || (isParentRow ? 'middle' : null);
                if (targetVAlign === 'middle') {
                    // --- FIXED: Prevent premature shifting if parent is expanding to fit children ---
                    proposedY = parent.isAutoHeight ? parent.y + margin[1] : parent.y + ((parent.h - regH) / 2);
                } else if (targetVAlign === 'bottom') {
                    proposedY = parent.isAutoHeight ? parent.y + margin[1] : parent.y + parent.h - regH - margin[1];
                }

                // row cursor during the measurement pass. If they bypass it when the parent is squished,
                // they overlap the left side and their width (18px + 2px = 20px) is completely erased from the total requirement!
                regX = isParentRow ? Math.max(proposedX, currentLevelMaxX + margin[0]) : Math.max(parent.x + margin[0], proposedX);
                regY = proposedY;
            }

            if (regX === undefined || regY === undefined) continue;

            const regionInset = getRegionOffsetBox(config);
            const basePadding = Array.isArray(props.padding) ? props.padding : [0, 0, 0, 0];
            const normalizedPadding = basePadding.length === 4
                ? [basePadding[0] || 0, basePadding[1] || 0, basePadding[2] || 0, basePadding[3] || 0]
                : [basePadding[0] || 0, basePadding[1] || 0, basePadding[0] || 0, basePadding[1] || 0];
            const effectivePadding = [
                normalizedPadding[0] + (regionInset[0] || 0),
                normalizedPadding[1] + (regionInset[1] || 0),
                normalizedPadding[2] + (regionInset[2] || 0),
                normalizedPadding[3] + (regionInset[3] || 0)
            ];

            const inheritedIgnoreLayout = !!(parent?.ignoreLayout || localCfg.ignoreLayout || props.ignoreLayout);
            const currentRegion = {
                ...localCfg,
                ignoreLayout: inheritedIgnoreLayout,
                key: key,
                parentKey: parent.key,
                padR: padR,
                x: regX,
                y: regY,
                w: regW,
                h: regH,
                isAutoHeight: hPropResolved === "auto",
                isFillHeight: this._isFillHeight,
                wPropStr: wPropResolved,
                hPropStr: hPropResolved,
                margin, spacing, padding: effectivePadding,
                dir: config.dir || "col", themeKey: config.themeKey,
                isChild, labelAlign: props.labelAlign,
                objX: props.objX,
                rigidFloor: Math.max(props.minWidth || MIN_WIDGET_WIDTH, this._getReservedWidth(config, scopedContext, key))
            };

            for (const [pk, pv] of Object.entries(localCfg)) {
                if (!RESERVED_KEYWORDS.includes(pk) && (typeof pv !== 'object' || typeof pv === 'function' || pv === null || Array.isArray(pv))) {
                    currentRegion[pk] = pv;
                }
            }

            // Tag regions as structural so they are excluded from the width expansion loop
            // and inherit immunity during the clamping pass.
            if (isChild && parent.isFooterStructural) currentRegion.isFooterChild = true;
            if (key === "footerRegion") currentRegion.isFooterStructural = true;

            this.regions[key] = currentRegion;

            // Update Flow Trackers and inject spacing regions for Debug
            const mapKeys = entries.map(e => e[0]);
            const isLastItem = (key === mapKeys[mapKeys.length - 1]);

            if (isParentRow) {
                const itemEndPlusMargin = currentRegion.x + currentRegion.w;

                currentLevelMaxX = itemEndPlusMargin + margin[2];
                currentLevelMaxY = Math.max(currentLevelMaxY, currentRegion.y + currentRegion.h);

                // DEBUG VISUALIZER & GAP LOGIC: Only apply spacing if NOT the last item
                if (spacing[0] > 0 && !isLastItem) {
                    this.regions[`_spacing_x_${key}`] = {
                        x: currentLevelMaxX,
                        y: currentRegion.y,
                        w: spacing[0],
                        h: currentRegion.h,
                        isSpacing: true
                    };
                    currentLevelMaxX += spacing[0]; // Only advance cursor for the actual gap
                }
            }else {
                const itemEndPlusMarginY = currentRegion.y + currentRegion.h + margin[3];
                currentLevelMaxY = itemEndPlusMarginY;
                currentLevelMaxX = Math.max(currentLevelMaxX, currentRegion.x + currentRegion.w + margin[2]);

                if ((spacing[1] || 0) > 0 && !isLastItem) {
                    this.regions[`_spacing_y_${key}`] = { x: currentRegion.x, y: itemEndPlusMarginY, w: currentRegion.w, h: spacing[1], isSpacing: true };
                    currentLevelMaxY += spacing[1];
                }
            }

            // 4. Recursion and container expansion.
            const children = {};
            for (const [ck, cv] of Object.entries(config)) {
                if (!RESERVED_KEYWORDS.includes(ck) && typeof cv === 'object' && cv !== null && !Array.isArray(cv)) children[ck] = cv;
            }

            if (Object.keys(children).length > 0) {
                this.processRecursive(children, currentRegion, scopedContext, true);
                const childRegs = Object.keys(children).map(ck => this.regions[ck]).filter(r => r && !r.ignoreLayout);
                if (childRegs.length > 0) {
                    // 1. Height Expansion
                    if (currentRegion.isAutoHeight) {
                        const childBottoms = childRegs.map(r => {
                            if (currentRegion.dir === "row" && r.hPropStr.startsWith("match") && (!r.anchor || !r.anchor.target)) {
                                return 0;
                            }
                            const marginY = r.margin?.length === 4 ? r.margin[3] : (r.margin?.[1] || 0);
                            return (r.y - currentRegion.y) + r.h + marginY;
                        });
                        const maxContentBottom = Math.max(...childBottoms);
                        const paddingB = currentRegion.padding ? (currentRegion.padding.length === 4 ? currentRegion.padding[3] : (currentRegion.padding[1] || 0)) : 0;

                        currentRegion.h = Math.max(currentRegion.h || 0, maxContentBottom + paddingB);

                        if (!isParentRow && !anchor) {
                            currentLevelMaxY = currentRegion.y + currentRegion.h + margin[3] + (isLastItem ? 0 : (spacing[1] || 0));
                        }
                    }
                    let shiftX = 0;
                    let shiftY = 0;
                    childRegs.forEach(childReg => {
                        // Apply accumulated shift from previous sibling expansions
                        if (Math.abs(shiftX) > 0.01 && currentRegion.dir === "row") childReg.x += shiftX;
                        if (Math.abs(shiftY) > 0.01 && currentRegion.dir === "col" && !childReg.anchor) childReg.y += shiftY;

                        if (currentRegion.dir === "row" && childReg.isFillHeight) {
                            const mY = (childReg.margin?.length === 4) ? (childReg.margin[1] + childReg.margin[3]) : (childReg.margin?.[1] * 2 || 0);
                            childReg.h = currentRegion.h - mY;
                        }
                        const oldW = childReg.w;
                        const oldH = childReg.h;
                        if (childReg.isFillHeight) {
                            if (currentRegion.dir === "col") {
                                let reserved = 0;
                                let spacingBuffer = 0;
                                let fillCount = 0;
                                childRegs.forEach((sib, idx) => {
                                    if (!sib.isFillHeight) {
                                        const mY = (sib.margin?.length === 4) ? (sib.margin[1] + sib.margin[3]) : (sib.margin?.[1] * 2 || 0);
                                        reserved += sib.h + mY;
                                    } else {
                                        fillCount++;
                                    }
                                    if (idx < childRegs.length - 1) {
                                        spacingBuffer += (sib.spacing?.[1] || (currentRegion.spacing?.[1] || 0));
                                    }
                                });
                                const sharedSpace = Math.max(0, currentRegion.h - reserved - spacingBuffer);
                                const childMY = (childReg.margin?.length === 4) ? (childReg.margin[1] + childReg.margin[3]) : (childReg.margin?.[1] * 2 || 0);
                                childReg.h = Math.max(12, (sharedSpace / Math.max(1, fillCount)) - childMY);
                            } else {
                                const childMY = (childReg.margin?.length === 4) ? (childReg.margin[1] + childReg.margin[3]) : (childReg.margin?.[1] * 2 || 0);
                                childReg.h = currentRegion.h - childMY;
                            }
                        }

                        if (childReg.hPropStr.startsWith("match")) {
                            const multiplier = parseFloat(childReg.hPropStr.split(":")[1]) || 1.0;
                            const anchor = childReg.anchor;
                            if (anchor && anchor.target && this.regions[anchor.target]) {
                                childReg.h = this.regions[anchor.target].h * multiplier;
                            } else if (currentRegion.dir === "row") {
                                const mY = (childReg.margin?.length === 4) ? (childReg.margin[1] + childReg.margin[3]) : (childReg.margin?.[1] * 2 || 0);
                                childReg.h = (currentRegion.h - mY) * multiplier;
                            } else {
                                childReg.h = childReg.w * multiplier; // Fallback to square
                            }
                        }
                        if (childReg.wPropStr.startsWith("match")) {
                            const multiplier = parseFloat(childReg.wPropStr.split(":")[1]) || 1.0;
                            childReg.w = childReg.h * multiplier;
                        }

                        // we must re-process its children so they can update their own 'fill' or 'match' dimensions.
                        if (childReg.h !== oldH || childReg.w !== oldW) {
                            const subChildren = {};
                            Object.keys(childReg).forEach(ck => {
                                if (!RESERVED_KEYWORDS.includes(ck) && typeof childReg[ck] === 'object' && childReg[ck] !== null && !Array.isArray(childReg[ck])) {
                                    subChildren[ck] = childReg[ck];
                                }
                            });
                            if (Object.keys(subChildren).length > 0) {
                                this.processRecursive(subChildren, childReg, scopedContext, true);
                            }
                        }

                        // Accumulate shift for the next siblings
                        if (currentRegion.dir === "row" && childReg.w !== oldW) {
                            // If a right-aligned item expands late, shift its X leftward to keep the right edge pinned.
                            const alignTarget = (childReg.objectAlign && childReg.objectAlign[0]) || childReg.align;
                            if (alignTarget === "right") {
                                childReg.x -= (childReg.w - oldW);
                            } else if (alignTarget === "center") {
                                childReg.x -= (childReg.w - oldW) / 2;
                                shiftX += (childReg.w - oldW) / 2;
                            } else {
                                shiftX += (childReg.w - oldW);
                            }
                        }
                        if (currentRegion.dir === "col" && childReg.h !== oldH) {
                            shiftY += (childReg.h - oldH);
                        }

                        if (currentRegion.dir === "row") {
                            const childVAlign = childReg.objY || "middle";
                            if (childVAlign === "middle") {
                                const offset = (currentRegion.h - childReg.h) / 2;
                                childReg.y = currentRegion.y + offset;
                            } else if (childVAlign === "bottom") {
                                const paddingB = currentRegion.padding ? (currentRegion.padding.length === 4 ? currentRegion.padding[3] : (currentRegion.padding[1] || 0)) : 0;
                                const offset = currentRegion.h - childReg.h - paddingB;
                                childReg.y = currentRegion.y + offset;
                            }
                        } else if (currentRegion.dir === "col" && childReg.objY === "bottom") {
                            const paddingB = currentRegion.padding ? (currentRegion.padding.length === 4 ? currentRegion.padding[3] : (currentRegion.padding[1] || 0)) : 0;
                            const marginB = childReg.margin?.length === 4 ? childReg.margin[3] : (childReg.margin?.[1] || 0);
                            childReg.y = currentRegion.y + currentRegion.h - childReg.h - paddingB - marginB;
                        }
                    });

                    // 3. Allocate/absorb row space for 'fit' and 'full' children.
                    if (currentRegion.dir === "row") {
                        // of the parent vs the rightmost edge of the content.
                        const fullChildren = childRegs.filter(r => r.wPropStr === "full");

                        // Identify if we have explicitly right-aligned items that are creating a "dead zone" in the middle
                        const rightPinnedItems = childRegs.filter(r => r.objX === "right");

                        if (fullChildren.length > 0) {
                            const maxChildRight = Math.max(...childRegs.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0))));
                            const currentPadR = currentRegion.padding ? (currentRegion.padding.length === 4 ? (currentRegion.padding[2] || 0) : (currentRegion.padding[0] || 0)) : 0;
                            const actualContainerRight = currentRegion.x + currentRegion.w - currentPadR;
                            const trailingGap = actualContainerRight - maxChildRight;

                            if (Math.abs(trailingGap) > 0.5) {
                                const adjustmentPerFull = trailingGap / fullChildren.length;
                                let subsequentShiftX = 0;

                                childRegs.forEach(childReg => {
                                    let needsReflow = false;

                                    // 1. Apply accumulated shift from previous expansions
                                    if (Math.abs(subsequentShiftX) > 0.1) {
                                        childReg.x += subsequentShiftX;
                                        needsReflow = true;
                                    }

                                    // 2. Expand "full" items to bridge the trailing gap
                                    if (childReg.wPropStr === "full") {
                                        const oldW = childReg.w;
                                        const floorW = childReg.rigidFloor || 10;
                                        childReg.w = Math.max(floorW, childReg.w + adjustmentPerFull);
                                        subsequentShiftX += (childReg.w - oldW);

                                        if (childReg.w !== oldW) needsReflow = true;
                                    }

                                    if (childReg.objX === "right") {
                                        const pPadR = currentRegion.padding ? (currentRegion.padding.length === 4 ? currentRegion.padding[2] : (currentRegion.padding[0] || 0)) : 0;
                                        const marginR = childReg.margin?.length === 4 ? childReg.margin[2] : (childReg.margin?.[0] || 0);
                                        const targetX = (currentRegion.x + currentRegion.w) - childReg.w - marginR - pPadR;

                                        const shiftX = targetX - childReg.x;
                                        if (Math.abs(shiftX) > 0.1) {
                                            subsequentShiftX += shiftX;
                                            childReg.x = targetX;
                                            needsReflow = true;
                                        }
                                    }

                                    if (needsReflow) {
                                        const subChildren = {};
                                        Object.keys(childReg).forEach(ck => {
                                            if (!RESERVED_KEYWORDS.includes(ck) && typeof childReg[ck] === 'object' && childReg[ck] !== null && !Array.isArray(childReg[ck])) {
                                                subChildren[ck] = childReg[ck];
                                            }
                                        });
                                        if (Object.keys(subChildren).length > 0) {
                                            this.processRecursive(subChildren, childReg, scopedContext, true);
                                        }
                                    }
                                });
                            }
                        }
                    }

                    const maxChildRight = Math.max(...childRegs.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0))));
                    const padRight = props.padding ? (props.padding.length === 4 ? props.padding[2] : (props.padding[0] || 0)) : 0;
                    const requiredW = (maxChildRight - currentRegion.x) + padRight;

                    const naturalW = (typeof props.width === 'number') ? props.width : 0;

                    let finalW = Math.max(naturalW, props.minWidth || 0, requiredW);
                    const wStrRaw = String(config.width || "full").toLowerCase();
                    if (wStrRaw === "full" || wStrRaw === "fill") {
                        finalW = Math.max(finalW, currentRegion.w);
                    }

                    if (Math.abs(finalW - currentRegion.w) > 0.5) {
                        currentRegion.w = finalW;
                        if (!currentRegion.ignoreLayout) {
                            if (isParentRow) {
                                currentLevelMaxX = Math.max(currentLevelMaxX, currentRegion.x + currentRegion.w + margin[2] + (spacing[0] || 0));
                            } else {
                                currentLevelMaxX = Math.max(currentLevelMaxX, currentRegion.x + currentRegion.w + margin[2]);
                            }
                        }
                    }
                }
            }
        }
    }

    measure(cfg, context = {}) {
        return this._getReservedWidth(cfg, { ...context, owner: this.owner });
    }

    drawDebug(ctx, nodeRef) {
        const targetNode = nodeRef || this.owner;
        renderLayoutDebug(this, targetNode, this.computedRegions);
    }
    hitTest(pos, box, pad = 0) {
        return (box &&
            pos[0] >= (box.x - pad) && pos[0] <= (box.x + box.w + pad) &&
            pos[1] >= (box.y - pad) && pos[1] <= (box.y + box.h + pad)
        );
    }
}
