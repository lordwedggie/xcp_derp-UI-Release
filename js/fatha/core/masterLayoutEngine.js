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
    "minWidth", "minHeight", // THE FIX: Register static constraints
    "objectAlign", "labelAlign", "themeKey", "align",
    "baseline", "anchor", "dir", "corners", "offset", "hidden",
    "text", "label", "measureText", "items", "prompt", "bypassHashOptimization",
    "palette"
];

// THE FIX: Exclusion list removed. All 'auto' requests are now fulfilled via utility measurement.
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

        return [
            key,
            this.originalWidth,
            parentH,
            c.type || "",
            c.themeKey || "",
            c.width,
            c.height,
            c.minWidth,
            c.minHeight,
            c.dir || "",
            c.wrap === true ? 1 : 0,
            c.cutoff === true ? 1 : 0,
            c.displayMode || "",
            c.indicator === true ? 1 : (c.indicator || 0),
            c.toggleWidth,
            c.gap,
            c.showWeight === true ? 1 : 0,
            c.weight,
            c.fontWeight || "",
            c.text || "",
            c.label || "",
            c.value || "",
            c.measureText || "",
            c.icon || "",
            itemsLen,
            margin,
            padding,
            spacing
        ].join("|");
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
                if (v.bypassHashOptimization) { str += `${k}:bypass_${Math.random()}|`; continue; }
                if (Array.isArray(v)) str += `${k}:[${v.join(",")}]|`;
                else str += `${k}:{${this._hashMap(v, depth + 1)}}|`;
            } else {
                if (k === "bypassHashOptimization" && v) str += `bypass_${Math.random()}|`;
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
        this.contentMinHeight = 0; // THE FIX: Tracks absolute minimum height from measurement pass
        this._lastCacheKey = ""; // Optimization: Tracks the previous state hash
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
        if (cfg.hidden || p.hidden) return 0; // THE FIX: Hidden widgets take zero space

        const padX = p.padding ? (p.padding.length === 4 ? p.padding[0] + p.padding[2] : (p.padding[0] * 2)) : 0;
        const wProp = String(cfg.width === undefined ? "full" : cfg.width).toLowerCase();
        const hProp = String(cfg.height === undefined ? "auto" : cfg.height).toLowerCase();

        // THE MIN-WIDTH OVERRIDE FIX: When autoWidth is off, explicitly provided minWidth
        // completely overrides text-measured minimums to allow node shrinking.
        // THE IMMUNITY FIX: System panels float independently and must never inherit the node's shrinkage restrictions.
        const isAutoWidth = this.owner?.properties?.autoWidth !== false || context.isSystemPanel;
        const useExplicitMin = !isAutoWidth && cfg.minWidth !== undefined;

        if (wProp.startsWith("match")) {
            const multiplier = parseFloat(wProp.split(":")[1]) || 1.0;
            let base = 0;
            if (typeof p.height === 'number') {
                // THE FIX: Padding removed. Width is based on strict height.
                base = p.height;
            } else if (hProp === "fill" || hProp === "full" || hProp === "fit" || hProp.startsWith("match")) {
                // THE BUDGET FIX: Accurately subtract vertical margins from parentHeight to find true match width
                const mY = (p.margin?.length === 4) ? ((p.margin[1] || 0) + (p.margin[3] || 0)) : ((p.margin?.[1] || 0) * 2);
                base = (context.parentHeight || 24) - mY;
            } else {
                // THE FIX: Padding removed. Use strict baseHeight.
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
            // THE CLEANUP: Redundant padX declaration removed
            if (childKeys.length > 0) {
                childKeys.forEach(k => {
                    const cW = this._getReservedWidth(cfg[k], context, k);
                    childSum += cW;
                    childMax = Math.max(childMax, cW);
                });
                // THE FIX: Include horizontal padding in the fit requirement to prevent cut-off
                if (useExplicitMin) return cfg.minWidth + padX;
                const baseMin = p.minWidth || 0;
                return Math.max(baseMin, (isRow ? childSum : childMax) + padX);
            }
            // THE PADDING FIX: Apply horizontal padding to empty/text-only fit widgets to prevent them from drawing outside their layout box
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
                // THE INVARIANT AUTO FIX: 'auto' elements strictly wrap their content and ignore node-level shrinkage overrides.
                const baseMin = p.minWidth || 0;
                // THE EXPANSION FIX: Apply padX to the row-level autoSum
                return Math.max(baseMin, (isRow ? autoSum : autoMax) + padX);
            }

            const evalW = (typeof p.width === 'number') ? p.width : 0;
            // THE TARGETED PADDING FIX: 'auto' widths are pre-padded by interpretLayoutProps.
            // We only add padX for numeric/fixed widths to avoid the double-padding bug.
            const isAuto = wProp === "auto";
            const baseMin = p.minWidth || 0;
            return Math.max(baseMin, evalW + (isAuto ? 0 : padX));
        }

        const evalW = (typeof p.width === 'number') ? p.width : 0;
        // THE WRAP WIDTH FIX: Wrapping items must not claim width during the measurement pass
        const contentFloor = cfg.wrap ? (cfg.minWidth || 0) : (evalW + padX);

        // THE RECURSION FIX: "full" items must also recurse to identify their content floor
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

        // THE FIX: Pull systemic constants from the owner's getter
        const { SNAP } = this.owner?.getDerpVars ? this.owner.getDerpVars(this.owner) : { SNAP: 10 };

        // THE FIX: Always hide at start of frame. regionVisualizer will re-show it
        // ONLY if the host actually calls drawDebug() in "Layout" mode.
        if (this._debugContainer) this._debugContainer.style.display = "none";

        const drawHeader = this.owner?.properties?.drawHeader;
        const dMode = String(this.owner?.properties?.debugMode ?? context.debugMode ?? "None");
        const currentH = this.owner?._derpVisualHeight || 0;
        const isSys = context.isSystemPanel === true;

        const isForced = forceOverride || this.owner?._forceSync;
        const hSlot = isSys ? "sys" : (this.owner?._hideSlot);

        // THE GC CHURN FIX: Use the host's pre-calculated hash if available to completely bypass the O(N) deep object traversal every frame
        const mapHash = (this.owner && this.owner._layoutMapHash !== undefined) ? this.owner._layoutMapHash : (this._hashMap ? this._hashMap(profileMap) : "");

        // THE ENGINE-WIDGET BRIDGE: If any region requires a hash bypass, we must also surgically
        // invalidate common widget caches on the owner to ensure the new data is actually painted.
        if (this.owner && mapHash.includes("bypass_")) {
            this.owner._btnSimpleCache = {};
            this.owner._dropdownCache = {};
            this.owner._fileBrowserCache = {};
            this.owner._shouldSync = true; // THE WAKE FIX: Force the Fatha/Basta sync loop to run
        }

        const structureHash = `${hSlot}_${drawHeader}_${dMode}_${this.owner?._currentThemeName}_${this.owner?.titleLabel}_${mapHash}`;
        const cacheKey = `${bounds.x},${bounds.y},${bounds.w},${bounds.h}_${currentH}_${structureHash}`;

        // THE FIX: Allow isForced to bypass the cache check to satisfy per-frame animation overrides
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

        // THE SLOT-ONLY SQUEEZE: Non-slot items span the full physical node width.
        const physicalW = isSys ? bounds.w : (this.owner?.size?.[0] || bounds.w);
        const layoutX = isSys ? bounds.x : 0;

        const finalUsableW = Math.max(MIN_WIDGET_WIDTH, rigidMinWidth, (isSys ? bounds.w : physicalW));
        const newBounds = { ...bounds, x: layoutX, w: finalUsableW };
        this.originalWidth = finalUsableW;
        this.runLayoutPass(newBounds, profileMap, context);

        // THE INFINITE GROWTH FIX: Restore the rigid floor so external node enforcers don't blow up the bounds.
        this.contentMinWidth = rigidMinWidth;

        const finalWidth = finalUsableW;
        this.regions.panelBackground.x = isSys ? bounds.x : 0;
        // THE SYNC DRIFT FIX: Always draw the background to the calculated finalWidth.
        // This ensures margins are visible even while the node size is lerping to catch up.
        this.regions.panelBackground.w = finalWidth;

        const rootRegions = Object.entries(this.regions)
            .filter(([k, r]) => !r.isChild && k !== "panelBackground" && !r.ignoreLayout)
            .map(([k, r]) => r);

        const bottomPoint = rootRegions.length > 0 ? Math.max(...rootRegions.map(r => r.y + r.h + (r.margin?.[3] || 0))) : bounds.y;
        let rawHeight = (bottomPoint - bounds.y);

        // THE FIX: Snap the final calculated node height directly. This allows the physical background
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

        // THE FIX: Stop the leak. Do not reach out to this.owner.layoutMap internally.
        // The caller (grandFatha.js or grandFathaSysPanel.js) is now responsible for providing the full map.
        const { footerRegion, ...mainMap } = profileMap;

        const fullContext = { ...context, owner: this.owner };
        this.processRecursive(mainMap, this.regions.panelBackground, fullContext);

        if (footerRegion) {
            this.processRecursive({ footerRegion }, this.regions.panelBackground, context);
            // THE SNAP ROUNDING FIX: Remove artificial push-down to ensure the exact layoutMap gap is preserved.
        }

        const allRegions = this._layoutCache_all || Object.values(this.regions).filter(r => r.key !== "panelBackground" && !r.ignoreLayout);
        this._layoutCache_all = allRegions;
        const propMinW = this.owner?.properties?.minWidth || 0;
        if (allRegions.length > 0) {
            const contentRequired = Math.max(...allRegions.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0)))) - bounds.x;
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
        // THE FIX: Filter out hidden regions upfront so they are completely ignored by the layout engine
        const entries = Object.entries(map).filter(([k, config]) => {
            if (!config || typeof config !== 'object') return true;
            const p = interpretLayoutProps(config, { ...context, originalWidth: this.originalWidth });
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
                    const p = interpretLayoutProps(entries[i][1], { ...context, originalWidth: this.originalWidth });
                    if (p.height !== "fill" && !String(p.height).startsWith("match")) {
                        const rigidH = (typeof p.height === 'number') ? p.height : (p.baseHeight || 12);
                        estH = Math.max(estH, rigidH);
                    }
                }
            }
            context.parentHeight = estH || 24;

            for (let i = 0; i < entries.length; i++) {
                const [ckey, config] = entries[i];
                const p = interpretLayoutProps(config, { ...context, originalWidth: this.originalWidth });
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
                // THE FIT-SPRING FIX: "fit" items must rigidly hug their content.
                // Only "full" items should act as flex springs and absorb leftover row space.
                if (wStr === "full") fitCount++;

                totalReservedWidth += this._getReservedWidth(config, context, ckey) + itemOverhead;
            }

            if (fitCount > 0) {
                const parentPadX = (parent.padding?.[0] || 0) * 2;
                // THE MARGIN SYNC FIX: Explicitly account for both left and right margins to prevent right-side clipping
                const parentMX = (parent.margin?.length === 4) ? (parent.margin[0] + parent.margin[2]) : (parent.margin?.[0] * 2 || 0);
                const availableW = isChild ? parent.w : (this.originalWidth - parentMX);
                const leftoverSpace = (availableW - parentPadX) - totalReservedWidth;
                fitSharedExpansion = Math.max(0, leftoverSpace / fitCount);
            }
        }
        for (const [key, config] of entries) {
            const localCfg = this._localize(config);
            const props = interpretLayoutProps(localCfg, { ...context, originalWidth: this.originalWidth });

            // THE SQUEEZE FIX: Identify the root of a slot chain to prevent double-padding children
            const isOut = (config.outSlotIdx !== undefined) || (props.outSlotIdx !== undefined);
            const isIn = (config.inSlotIdx !== undefined) || (props.inSlotIdx !== undefined);
            const isSlotRoot = (isIn || isOut) && (!parent || (parent.outSlotIdx === undefined && parent.inSlotIdx === undefined));

            const padL = (!context.isSystemPanel && isSlotRoot && isIn) ? (this.owner?._padL || 0) : 0;
            const padR = (!context.isSystemPanel && isSlotRoot && isOut) ? (this.owner?._padR || 0) : 0;
            // THE FIX: Standardize margin to 4-way [Left, Top, Right, Bottom] mapping [0, 0, Right, 0] to the correct axis
            const rawM = props.margin || [0, 0];
            const margin = rawM.length === 4 ? rawM : [rawM[0] ?? 0, rawM[1] ?? 0, rawM[0] ?? 0, rawM[1] ?? 0];
            const spacing = props.spacing || [0, 0];

            // --- UPDATED: Cross-Axis Match Support ---
            const anchor = config.anchor;

            // THE SCOPE FIX: Declare layout variables at the root of the loop
            // so they survive the fallback `if/else` checks below.
            let regW, regH, regX, regY;

            // FIX FOR V4: Default undefined widths to 'full' so root containers behave correctly
            // without needing the obsolete dynamic getter injection.
            const wProp = props.width === undefined ? "full" : String(props.width).toLowerCase();

            // --- UPDATED: Cross-Axis Match Support ---
            const hPropResolved = String(config.height === undefined ? "auto" : config.height).toLowerCase();
            const wPropResolved = String(config.width === undefined ? "full" : config.width).toLowerCase();

            // --- THE ENGINE FIX: Pre-Calculate Base Y & Positions ---
            // We calculate coordinates independent of widths/heights so the engine
            // doesn't crash if it hits a dimension fallback.
            let baseY;

            // THE TARGET-MISSING FIX: Preserve the intentional anchor offset even if the target region was hidden
            const fallbackOffsetY = (anchor && anchor.axis === "y" && anchor.offset) ? anchor.offset : 0;
            const fallbackOffsetX = (anchor && anchor.axis !== "y" && anchor.offset) ? anchor.offset : 0;

            if (anchor && this.regions[anchor.target]) {
                const target = this.regions[anchor.target];
                const tM = target.margin || [0, 0, 0, 0];
                if (anchor.axis === "y") {
                    // THE ANCHOR MARGIN FIX: Respect the target's bottom margin
                    baseY = target.y + target.h + tM[3] + (spacing[1] || 0) + (anchor.offset || 0) + margin[1];
                } else {
                    baseY = target.y + margin[1];
                }
            } else if (isParentRow) {
                // THE FIX: Row items must respect the parent container's top padding + fallback offset
                baseY = parent.y + (parent.padding?.[1] || 0) + margin[1] + fallbackOffsetY;
            } else {
                baseY = currentLevelMaxY + margin[1] + fallbackOffsetY;
            }

            // Calculate Base X & Y Coordinates
            if (anchor && this.regions[anchor.target]) {
                const target = this.regions[anchor.target];
                const tM = target.margin || [0, 0, 0, 0];
                if (anchor.axis === "y") {
                    // THE ANCHOR MARGIN FIX: Push down based on the target's bottom margin
                    regX = parent.x + margin[0] + padL;
                    regY = target.y + target.h + tM[3] + (anchor.offset || 0) + margin[1];
                } else {
                    // THE ANCHOR MARGIN FIX: Push right based on the target's right margin
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
                // THE INITIAL-MATCH FIX: Accurately resolve fill height to prevent alignment drift before late-binding
                if (typeof props.height === 'number') {
                    // THE FIX: Padding removed.
                    regH = props.height;
                } else if (hPropResolved === "fill" || hPropResolved === "full" || hPropResolved === "fit") {
                    const mY = (props.margin?.length === 4) ? ((props.margin[1] || 0) + (props.margin[3] || 0)) : ((props.margin?.[1] || 0) * 2);
                    // THE FALLBACK FIX: Use estimated parentHeight if parent.h is not yet finalized
                    regH = ((parent ? (parent.h || context.parentHeight) : context.parentHeight) || 24) - mY;
                } else {
                    // THE FIX: Padding removed.
                    regH = (props.baseHeight || 12);
                }
                regW = regH * multiplier;
            } else if (wPropResolved === "full" && isParentRow) {
                regW = this._getReservedWidth(config, context, key) + fitSharedExpansion;
            } else if (wPropResolved === "fit" && isParentRow) {
                // THE FIT-SPRING FIX: Do not inflate "fit" regions with shared expansion
                regW = this._getReservedWidth(config, context, key);
            } else if (wPropResolved === "auto") {
                regW = this._getReservedWidth(config, context, key);
            } else if ((wPropResolved === "fit" || wPropResolved === "full") && !isParentRow) {
                const isRootFooter = !isChild && key === "footerRegion";
                const usePhysicalSize = isRootFooter && this.originalWidth !== SQUISH_WIDTH;
                const effectiveParentW = usePhysicalSize ? (this.owner?.size?.[0] || parent.w) : parent.w;

                // THE RIGID FLOOR FIX: Respect asymmetric margins [0] Left and [2] Right during expansion
                // Also prevent NaN by strictly ensuring props.width is numeric.
                const evalW = (typeof props.width === 'number') ? props.width : 0;
                const padX = props.padding ? (props.padding[0] * 2) : 0;
                const hasContent = config.text !== undefined || config.value !== undefined || config.label !== undefined || config.icon !== undefined;
                // THE WRAP WIDTH FIX: Ensure wrapping elements contribute 0 (or minWidth) to the container's width requirement
                const contentFloor = Math.max(props.minWidth || 10, (hasContent && !config.wrap) ? (evalW + padX) : 0);
                const pPadR = parent.padding ? (parent.padding.length === 4 ? parent.padding[2] : (parent.padding[0] || 0)) : 0;
                const consumedX = regX - parent.x;
                const availableSpace = effectiveParentW - consumedX - margin[2] - padR - pPadR;

                regW = Math.max(contentFloor, availableSpace);
            } else {
                regW = typeof props.width === 'number' ? props.width : this._getReservedWidth(config, context, key);
            }

            // 2. Calculate Initial Height
            let isFillHeight = false;

            // THE FIX: Prioritize 'fill' detection so wProp='match' doesn't skip it!
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

                    // THE SPACING FIX: Aggregate local spacing values for the filler and its subsequent
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
                            // THE FIX: Padding removed.
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
                    // THE FIX: Padding removed.
                    regH = (props.baseHeight || 12);
                }
            } else if (wPropResolved === "match") {
                // Height was calculated in Step 1 as a fallback, keep it
            } else if (hPropResolved === "match") {
                if (anchor && this.regions[anchor.target]) {
                    regH = this.regions[anchor.target].h;
                } else if (isParentRow) {
                    // THE PRE-MATCH FIX: Match items in a row must contribute 0 height during the measurement pass.
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

                // THE EXACT 20PX BUG FIX: Even explicitly right-aligned items MUST respect the sequential
                // row cursor during the measurement pass. If they bypass it when the parent is squished,
                // they overlap the left side and their width (18px + 2px = 20px) is completely erased from the total requirement!
                regX = isParentRow ? Math.max(proposedX, currentLevelMaxX + margin[0]) : Math.max(parent.x + margin[0], proposedX);
                regY = proposedY;
            }

            if (regX === undefined || regY === undefined) continue;

            const currentRegion = {
                ...localCfg,
                ignoreLayout: localCfg.ignoreLayout || props.ignoreLayout,
                key: key,
                parentKey: parent.key, // THE HIERARCHY FIX: Track parent lineage for cascading slot squeezes
                padR: padR, // THE SQUEEZE FIX: Store localized padding requirement for rigid floor calculation
                x: regX,
                y: regY,
                w: regW,
                h: regH,
                isAutoHeight: hPropResolved === "auto",
                isFillHeight: this._isFillHeight,
                wPropStr: wPropResolved,
                hPropStr: hPropResolved,
                margin, spacing, padding: props.padding,
                dir: config.dir || "col", themeKey: config.themeKey,
                isChild, labelAlign: props.labelAlign,
                objX: props.objX,
                rigidFloor: Math.max(props.minWidth || MIN_WIDGET_WIDTH, this._getReservedWidth(config, context, key))
            };

            // THE TRANSLATION FIX: Transfer props from localCfg (localized) to prevent clobbering
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

                // THE FIX: Use Right margin [2] to advance the row cursor
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
                // THE FIX: Use Bottom margin [3] to advance the column cursor
                const itemEndPlusMarginY = currentRegion.y + currentRegion.h + margin[3];
                currentLevelMaxY = itemEndPlusMarginY;
                currentLevelMaxX = Math.max(currentLevelMaxX, currentRegion.x + currentRegion.w + margin[2]);

                if ((spacing[1] || 0) > 0 && !isLastItem) {
                    this.regions[`_spacing_y_${key}`] = { x: currentRegion.x, y: itemEndPlusMarginY, w: currentRegion.w, h: spacing[1], isSpacing: true };
                    currentLevelMaxY += spacing[1];
                }
            }

            // 4. Recursion & Container Expansion (THE FIX)
            const children = {};
            for (const [ck, cv] of Object.entries(config)) {
                if (!RESERVED_KEYWORDS.includes(ck) && typeof cv === 'object' && cv !== null && !Array.isArray(cv)) children[ck] = cv;
            }

            if (Object.keys(children).length > 0) {
                this.processRecursive(children, currentRegion, context, true);
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

                        // THE FIX: Parent height now strictly matches the required content depth
                        currentRegion.h = Math.max(currentRegion.h || 0, maxContentBottom + paddingB);

                        if (!isParentRow && !anchor) {
                            // THE OVERLAP FIX: Cursor respects expanded height and bottom margin
                            currentLevelMaxY = currentRegion.y + currentRegion.h + margin[3] + (isLastItem ? 0 : (spacing[1] || 0));
                        }
                    }
                    let shiftX = 0;
                    let shiftY = 0;
                    childRegs.forEach(childReg => {
                        // Apply accumulated shift from previous sibling expansions
                        if (Math.abs(shiftX) > 0.01 && currentRegion.dir === "row") childReg.x += shiftX;
                        // THE COLLISION FIX: Shift sequential column siblings down if a previous item expanded
                        if (Math.abs(shiftY) > 0.01 && currentRegion.dir === "col" && !childReg.anchor) childReg.y += shiftY;

                        // THE FIX: Fill height matches the parent row while respecting 4-way vertical margins [Top:1, Bottom:3]
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
                            const anchor = childReg.anchor; // THE SYNTAX FIX: Prevent undefined array index lookup errors
                            if (anchor && anchor.target && this.regions[anchor.target]) {
                                childReg.h = this.regions[anchor.target].h * multiplier;
                            } else if (currentRegion.dir === "row") {
                                // THE ENGINE FIX 2: Unanchored 'match' inside a row correctly matches the finalized row height minus vertical margins
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

                        // THE RECURSIVE REFLOW FIX: If the height of this region was changed by late-binding (match/fill),
                        // we must re-process its children so they can update their own 'fill' or 'match' dimensions.
                        if (childReg.h !== oldH || childReg.w !== oldW) {
                            const subChildren = {};
                            Object.keys(childReg).forEach(ck => {
                                if (!RESERVED_KEYWORDS.includes(ck) && typeof childReg[ck] === 'object' && childReg[ck] !== null && !Array.isArray(childReg[ck])) {
                                    subChildren[ck] = childReg[ck];
                                }
                            });
                            if (Object.keys(subChildren).length > 0) {
                                this.processRecursive(subChildren, childReg, context, true);
                            }
                        }

                        // Accumulate shift for the next siblings
                        if (currentRegion.dir === "row" && childReg.w !== oldW) {
                            // THE LATE-BINDING ALIGNMENT FIX:
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

                    // 3. THE TWO-WAY SPRING FIX: Allocate space to, or absorb overflow from, 'fit' and 'full' children
                    if (currentRegion.dir === "row") {
                        // THE GAP-BRIDGE FIX: Identify the true available space by looking at the rightmost edge
                        // of the parent vs the rightmost edge of the content.
                        const fullChildren = childRegs.filter(r => r.wPropStr === "full");

                        // Identify if we have explicitly right-aligned items that are creating a "dead zone" in the middle
                        const rightPinnedItems = childRegs.filter(r => r.objX === "right");

                        if (fullChildren.length > 0) {
                            const maxChildRight = Math.max(...childRegs.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0))));
                            const actualContainerRight = currentRegion.x + currentRegion.w;
                            const trailingGap = actualContainerRight - maxChildRight;

                            if (Math.abs(trailingGap) > 0.5) {
                                const adjustmentPerFull = trailingGap / fullChildren.length;
                                let subsequentShiftX = 0;

                                // THE SEQUENTIAL REFLOW: We must iterate and shift/expand in order to maintain row integrity
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

                                    // THE RECURSIVE REFLOW FIX: Inner children must be re-processed to expand OR visually shift
                                    if (needsReflow) {
                                        const subChildren = {};
                                        Object.keys(childReg).forEach(ck => {
                                            if (!RESERVED_KEYWORDS.includes(ck) && typeof childReg[ck] === 'object' && childReg[ck] !== null && !Array.isArray(childReg[ck])) {
                                                subChildren[ck] = childReg[ck];
                                            }
                                        });
                                        if (Object.keys(subChildren).length > 0) {
                                            this.processRecursive(subChildren, childReg, context, true);
                                        }
                                    }
                                });
                            }
                        }
                    }

                    const maxChildRight = Math.max(...childRegs.map(r => r.x + r.w + (r.margin?.length === 4 ? r.margin[2] : (r.margin?.[0] || 0))));
                    const padRight = props.padding ? (props.padding.length === 4 ? props.padding[2] : (props.padding[0] || 0)) : 0;
                    const requiredW = (maxChildRight - currentRegion.x) + padRight;

                    // THE FIX: Calculate the final target width by comparing content needs vs natural constraints
                    const naturalW = (typeof props.width === 'number') ? props.width : 0;

                    // THE PROPORTIONAL GAP FIX: Use the raw config string to ensure expansion locks are honored
                    let finalW = Math.max(naturalW, props.minWidth || 0, requiredW);
                    const wStrRaw = String(config.width || "full").toLowerCase();
                    if (wStrRaw === "full" || wStrRaw === "fill") {
                        finalW = Math.max(finalW, currentRegion.w);
                    }

                    if (Math.abs(finalW - currentRegion.w) > 0.5) {
                        currentRegion.w = finalW;
                        if (!props.ignoreLayout && !config.ignoreLayout) {
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
