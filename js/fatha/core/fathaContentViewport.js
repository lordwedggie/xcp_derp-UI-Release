import { app } from "../../../../scripts/app.js";

export const FATHA_CONTENT_SCROLLBAR_WIDTH = 2;
export const FATHA_CONTENT_SCROLLBAR_MIN_THUMB = 14;
export const FATHA_CONTENT_VIEWPORT_DEBUG_FLAG = "xcpDerpDebugContentViewports";

function numberOr(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function normalizeMargin(margin) {
    if (!Array.isArray(margin)) return [0, 0, 0, 0];
    return margin.length === 4
        ? [margin[0] || 0, margin[1] || 0, margin[2] || 0, margin[3] || 0]
        : [margin[0] || 0, margin[1] || 0, margin[0] || 0, margin[1] || 0];
}

function isDescendantOf(region, rootKey, regions) {
    let current = region;
    const seen = new Set();
    while (current?.parentKey && !seen.has(current.parentKey)) {
        if (current.parentKey === rootKey) return true;
        seen.add(current.parentKey);
        current = regions?.[current.parentKey];
    }
    return false;
}

function isViewportClipDisabled(region, viewportKey, regions) {
    let current = region;
    const seen = new Set();
    while (current && !seen.has(current.key)) {
        if (current.contentViewportClip === false) return true;
        if (current.key === viewportKey) return false;
        seen.add(current.key);
        current = regions?.[current.parentKey];
    }
    return false;
}

function shiftRegionSubtree(regions, rootKey, dy, seen = new Set()) {
    if (!regions || !rootKey || seen.has(rootKey)) return;
    seen.add(rootKey);
    const root = regions[rootKey];
    if (!root) return;
    root.y = numberOr(root.y) + dy;
    for (const child of Object.values(regions)) {
        if (child?.parentKey === rootKey) shiftRegionSubtree(regions, child.key, dy, seen);
    }
}

function recomputeAutoHeightAncestors(regions, startParentKey) {
    let parentKey = startParentKey;
    const seen = new Set();
    while (parentKey && parentKey !== "panelBackground" && !seen.has(parentKey)) {
        seen.add(parentKey);
        const parent = regions[parentKey];
        if (!parent) break;
        if (parent.isAutoHeight) {
            const children = Object.values(regions).filter((candidate) => candidate?.parentKey === parentKey && !candidate.ignoreLayout);
            if (children.length > 0) {
                const paddingB = parent.padding ? (parent.padding.length === 4 ? parent.padding[3] : (parent.padding[1] || 0)) : 0;
                parent.h = Math.max(0, ...children.map((child) => {
                    const marginB = child.margin?.length === 4 ? child.margin[3] : (child.margin?.[1] || 0);
                    return (numberOr(child.y) - numberOr(parent.y)) + numberOr(child.h) + marginB + paddingB;
                }));
            }
        }
        parentKey = parent.parentKey;
    }
}

function shiftFollowingAncestorSiblings(regions, startKey, dy) {
    if (!regions || !startKey || !(Math.abs(numberOr(dy)) > 0.5)) return;
    let currentKey = startKey;
    const seen = new Set();
    while (currentKey && currentKey !== "panelBackground" && !seen.has(currentKey)) {
        seen.add(currentKey);
        const current = regions[currentKey];
        const parentKey = current?.parentKey;
        if (!current || !parentKey) break;
        const currentBottom = numberOr(current.y) + numberOr(current.h) + normalizeMargin(current.margin)[3];
        for (const candidate of Object.values(regions)) {
            if (!candidate || candidate.key === currentKey || candidate.parentKey !== parentKey) continue;
            if (numberOr(candidate.y) > currentBottom + 0.5) shiftRegionSubtree(regions, candidate.key, -dy);
        }
        currentKey = parentKey;
    }
}

function compactViewportAncestors(regions, startParentKey, delta) {
    if (!regions || !startParentKey || !(Math.abs(numberOr(delta)) > 0.5)) return;
    recomputeAutoHeightAncestors(regions, startParentKey);
    shiftFollowingAncestorSiblings(regions, startParentKey, delta);
    recomputeAutoHeightAncestors(regions, regions[startParentKey]?.parentKey);
}

export function getContentViewportState(node, viewportKey) {
    return node?._contentViewportState?.[viewportKey] || null;
}

export function getContentViewportForRegion(node, regionKey) {
    const states = node?._contentViewportState;
    const regions = node?.layout?.regions;
    if (!states || !regions || !regionKey) return null;
    if (states[regionKey]) return states[regionKey];
    const region = regions[regionKey];
    if (!region) return null;
    return Object.values(states).find((state) => {
        return isDescendantOf(region, state.key, regions) && !isViewportClipDisabled(region, state.key, regions);
    }) || null;
}

export function getContentViewportDisplayedGeometry(node, regionKey, geometry = null) {
    const base = geometry || node?.layout?.regions?.[regionKey];
    if (!base) return null;
    const state = getContentViewportForRegion(node, regionKey);
    if (!state?.rect || state.key === regionKey) return base;
    return { ...base, y: numberOr(base.y) - numberOr(state.scrollTop) };
}

export function isContentViewportRegionHitVisible(node, regionKey, localPoint) {
    const state = getContentViewportForRegion(node, regionKey);
    if (!state) return true;
    const rect = state.rect;
    if (!rect || !localPoint) return true;
    const rawY = numberOr(localPoint.y) - (state.key === regionKey ? 0 : numberOr(state.scrollTop));
    return rawY >= numberOr(rect.y) && rawY <= numberOr(rect.y) + numberOr(rect.h);
}

export function getContentViewportScroll(node, viewportKey) {
    return numberOr(node?._contentViewportScroll?.[viewportKey], 0);
}

export function setContentViewportScroll(node, viewportKey, value) {
    if (!node || !viewportKey) return 0;
    const state = getContentViewportState(node, viewportKey);
    const maxScroll = Math.max(0, numberOr(state?.maxScroll, 0));
    const next = Math.max(0, Math.min(numberOr(value, 0), maxScroll));
    if (!node._contentViewportScroll) node._contentViewportScroll = {};
    node._contentViewportScroll[viewportKey] = next;
    if (state) state.scrollTop = next;
    return next;
}

export function scrollContentViewport(node, viewportKey, deltaY) {
    const current = getContentViewportScroll(node, viewportKey);
    return setContentViewportScroll(node, viewportKey, current + numberOr(deltaY, 0));
}

export function mapPointThroughContentViewport(node, point) {
    if (!node || !point) return point;
    const states = Object.values(node._contentViewportState || {});
    if (!states.length) return point;
    const hit = states.find((state) => {
        const rect = state.rect;
        return rect && point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
    });
    if (!hit) return point;
    return { ...point, y: point.y + getContentViewportScroll(node, hit.key), _contentViewportKey: hit.key };
}

export function isContentViewportDebugEnabled() {
    return !!window?.[FATHA_CONTENT_VIEWPORT_DEBUG_FLAG];
}

export function getContentViewportGutter(node) {
    return numberOr(node?._contentViewportGutter, 0);
}

export function hasContentViewportOverflow(node) {
    return Object.values(node?._contentViewportState || {}).some((state) => state?.hasOverflow);
}

export function applyContentViewportLayout(node, regions, layout, options = {}) {
    if (!node || !regions) return false;
    const publishState = options.publishState !== false;
    const viewportHeightDeltas = [];
    const viewportMinHeightDeltas = [];
    const nextState = {};
    let hasOverflow = false;
    let hasViewport = false;
    let maxGutter = 0;

    for (const [key, region] of Object.entries(regions)) {
        if (!region?.scrollViewport) continue;
        hasViewport = true;
        const clipHeight = numberOr(typeof region.clipHeight === "function" ? region.clipHeight(node, region, regions) : region.clipHeight, 0);
        if (!(clipHeight > 0)) continue;

        const rawMinClipHeight = numberOr(typeof region.minClipHeight === "function" ? region.minClipHeight(node, region, regions) : region.minClipHeight, 0);
        const descendants = Object.values(regions).filter((candidate) => candidate && candidate.key !== key && !candidate.ignoreLayout && isDescendantOf(candidate, key, regions));
        const contentBottom = descendants.length
            ? Math.max(...descendants.map((child) => {
                const margin = normalizeMargin(child.margin);
                return (numberOr(child.y) - numberOr(region.y)) + numberOr(child.h) + margin[3];
            }))
            : numberOr(region.h);
        const fullHeight = Math.max(numberOr(region.h), contentBottom);
        const visibleHeight = Math.min(fullHeight, clipHeight);
        const minVisibleHeight = rawMinClipHeight > 0 ? Math.min(visibleHeight, rawMinClipHeight) : visibleHeight;
        const overflow = fullHeight > visibleHeight + 0.5;
        const gutter = overflow ? FATHA_CONTENT_SCROLLBAR_WIDTH : 0;
        const visibleWidth = Math.max(1, numberOr(region.w) - gutter);
        if (overflow) {
            hasOverflow = true;
            maxGutter = Math.max(maxGutter, FATHA_CONTENT_SCROLLBAR_WIDTH);
        }

        region._contentViewport = true;
        region._contentViewportFullHeight = fullHeight;
        region._contentViewportClipHeight = visibleHeight;
        region._contentViewportHasOverflow = overflow;
        const heightDelta = numberOr(region.h) - visibleHeight;
        region.h = visibleHeight;
        if (heightDelta > 0.5) viewportHeightDeltas.push({ key, region, delta: heightDelta });
        const minHeightDelta = visibleHeight - minVisibleHeight;
        if (minHeightDelta > 0.5) viewportMinHeightDeltas.push(minHeightDelta);

        const scrollTop = Math.max(0, Math.min(getContentViewportScroll(node, key), Math.max(0, fullHeight - visibleHeight)));
        nextState[key] = {
            key,
            rect: { x: numberOr(region.x), y: numberOr(region.y), w: visibleWidth, h: visibleHeight },
            fullHeight,
            clipHeight: visibleHeight,
            minClipHeight: minVisibleHeight,
            maxScroll: Math.max(0, fullHeight - visibleHeight),
            scrollTop,
            hasOverflow: overflow,
            gutter,
        };
    }

    for (const { key, region, delta } of viewportHeightDeltas) {
        for (const candidate of Object.values(regions)) {
            if (!candidate || candidate.key === key || candidate.parentKey !== region.parentKey) continue;
            if (numberOr(candidate.y) >= numberOr(region.y) + numberOr(region.h) - 0.5) shiftRegionSubtree(regions, candidate.key, -delta);
        }
        compactViewportAncestors(regions, region.parentKey, delta);
    }

    if (!publishState) return hasOverflow;

    node._contentViewportState = nextState;
    node._contentViewportCandidate = hasViewport;
    node._contentViewportGutter = 0;
    if (!node._contentViewportScroll) node._contentViewportScroll = {};
    Object.entries(nextState).forEach(([key, state]) => {
        node._contentViewportScroll[key] = Math.max(0, Math.min(numberOr(node._contentViewportScroll[key], 0), state.maxScroll));
        state.scrollTop = node._contentViewportScroll[key];
    });

    const staleKeys = Object.keys(node._contentViewportScroll).filter((key) => !nextState[key]);
    staleKeys.forEach((key) => { delete node._contentViewportScroll[key]; });

    if (layout) layout.contentViewportGutter = 0;
    if ((hasOverflow || viewportMinHeightDeltas.length > 0) && layout) {
        const rootRegions = Object.entries(regions)
            .filter(([k, r]) => !r.isChild && k !== "panelBackground" && !r.ignoreLayout)
            .map(([, r]) => r);
        const bottomPoint = rootRegions.length > 0
            ? Math.max(...rootRegions.map((r) => numberOr(r.y) + numberOr(r.h) + normalizeMargin(r.margin)[3]))
            : 40;
        const nextHeight = Math.max(1, bottomPoint - numberOr(regions.panelBackground?.y));
        layout.totalHeight = nextHeight;
        const minDelta = viewportMinHeightDeltas.reduce((sum, delta) => sum + delta, 0);
        layout.contentMinHeight = Math.max(1, nextHeight - minDelta);
        if (regions.panelBackground) regions.panelBackground.h = nextHeight;
        layout.contentViewportGutter = maxGutter;
        node._contentViewportGutter = maxGutter;
        layout.contentMinWidth = numberOr(layout.contentMinWidth) + maxGutter;
        layout.totalWidth = numberOr(layout.totalWidth) + maxGutter;
        if (regions.panelBackground) regions.panelBackground.w = numberOr(regions.panelBackground.w) + maxGutter;
    }
    return hasOverflow;
}

export function getContentViewportSignature(node) {
    const states = Object.values(node?._contentViewportState || {});
    if (!states.length) return "no-viewports";
    return states.map((state) => [
        state.key,
        Math.round(numberOr(state.fullHeight)),
        Math.round(numberOr(state.clipHeight)),
        Math.round(numberOr(state.scrollTop)),
        state.hasOverflow ? 1 : 0,
        Math.round(numberOr(state.minClipHeight)),
    ].join(":")) .join("|");
}

export function requestContentViewportRedraw(node) {
    node._derpAwakeFrames = Math.max(numberOr(node._derpAwakeFrames), 2);
    if (typeof node.requestDerpSync === "function") node.requestDerpSync();
    else if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    else app.canvas?.setDirty?.(true, true);
}
