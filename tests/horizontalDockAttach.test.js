import { describe, expect, it } from 'vitest';

import { getDeckPressureSideHorizontalLockedWidth, getDerpVars, normalizeDerpDockedLayout, resolveDerpRuntimeSize, shouldLockDeckPressureSideHorizontalWidth, syncHorizontalDeckHeight } from '../js/fatha/core/fathaHandler.js';
import { resolveDerpPreferredAutoHeight, resolveDerpPreferredAutoWidth } from '../js/fatha/core/derpHeightPolicy.js';
import { canResizeDeckPressureSideWidthMember, canResizeHorizontalMemberWidth, canResizeVerticalSeamPair, canResizeVerticalSharedEdgeHeight } from '../js/fatha/core/dockResizeSharedEdges.js';
import { syncDockResizePair } from '../js/fatha/core/dockResize.js';
import { handleNodeResize } from '../js/fatha/core/fathaNodeResize.js';
import { createDerpShield, removeDerpShield, syncDerpShield } from '../js/fatha/core/fathaDOMshield.js';
import { applyDeckPressureLayout, computeDeckPressureGeometryPlan, deckNodeToLeader, getDeckCornerOverride, getDeckPressureSideHorizontalWidthLock, normalizeDockPair, setDeckPressureSideVerticalHeightCache } from '../js/fatha/core/masterDockEngine.js';
import { resizeNodeToImageAspect } from '../js/derps/controldeck/core/derpImageDeck_core.js';

function makeNode(id, x, width, height) {
  return {
    id,
    isFathaNode: true,
    pos: [x, 0],
    size: [width, height],
    properties: {
      autoWidth: false,
      autoHeight: false,
      nodeSize: [width, height],
      deckParentId: null,
      deckDockSide: null,
      deckEdges: { left: null, right: null, top: null, bottom: null },
    },
    layout: { regions: {}, contentMinWidth: 0, contentMinHeight: 0, totalHeight: height },
    layoutMap: {},
    setDirtyCanvas: () => {},
    refreshNodeLayoutMap: () => {},
    handleShieldInteraction: () => false,
    requestDerpSync: () => {},
    syncUncleSlots: () => {},
    settleBeforeDockSnap: () => {},
    settleAfterDockWidthMatch: () => {},
    getDerpVars: () => ({ SNAP: 10, autoWidth: false, autoHeight: false }),
  };
}

function makeImageDeck(id, x, width, height) {
  const node = makeNode(id, x, width, height);
  node.type = 'xcpDerpImageDeck';
  node._isDerpImageDeckNode = true;
  return node;
}

function markViewportNode(node, key = 'regionDeck', clipHeight = 34) {
  node.layoutMap = {
    [key]: {
      scrollViewport: true,
      clipHeight,
      minClipHeight: clipHeight,
    },
  };
  return node;
}

describe('syncHorizontalDeckHeight', () => {
  it('recomputes same-frame horizontal members after a third node attaches', () => {
    const a = makeNode(1, 0, 100, 120);
    const b = makeNode(2, 100, 100, 120);
    const c = makeNode(3, 200, 100, 80);

    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    let graph = { _nodes: [a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 1;
    globalThis.app = window.app;

    syncHorizontalDeckHeight(a, 120);

    graph = { _nodes: [a, b, c] };
    window.app.graph = graph;
    b.properties.deckEdges.right = c.id;
    c.properties.deckEdges.left = b.id;

    syncHorizontalDeckHeight(a, 120);

    expect(c.size[1]).toBe(120);
    expect(c.properties.nodeSize[1]).toBe(120);
  });

  it('refreshes the older left member during right-side attach finalization', () => {
    const a = makeNode(11, 0, 100, 80);
    const b = makeNode(12, 100, 100, 120);
    const c = makeNode(13, 200, 100, 120);
    a.properties.autoHeight = true;
    b.properties.autoHeight = true;
    c.properties.autoHeight = true;

    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [a, b, c] };
    window.app.graph = graph;
    window.app.canvas.frame = 2;
    globalThis.app = window.app;

    const attached = deckNodeToLeader(c, b, graph, 'right');

    expect(attached).toBe(true);
    expect(a.size[1]).toBe(120);
    expect(a.properties.nodeSize[1]).toBe(120);
  });

  it('keeps row-width fallback separate from side-horizontal Deck Pressure autoWidth locks', () => {
    const hub = makeImageDeck(20, 200, 300, 220);
    const a = makeNode(21, 0, 80, 90);
    const b = makeNode(22, 80, 120, 90);
    a.properties.autoWidth = true;
    b.properties.autoWidth = true;
    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 3;
    globalThis.app = window.app;

    expect(deckNodeToLeader(b, hub, graph, 'left')).toBe(true);
    expect(a.properties.autoWidth).toBe(true);
    expect(b.properties.autoWidth).toBe(true);
    expect(getDeckPressureSideHorizontalWidthLock(a, graph)).toBe(80);
    expect(getDeckPressureSideHorizontalWidthLock(b, graph)).toBe(120);
    expect(getDeckPressureSideHorizontalLockedWidth(a)).toBe(0);
    expect(getDeckPressureSideHorizontalLockedWidth(b)).toBe(0);
    expect(shouldLockDeckPressureSideHorizontalWidth(a)).toBe(false);
    expect(shouldLockDeckPressureSideHorizontalWidth(b)).toBe(false);

    a._deckPressureSideHorizontalWidth = 140;
    expect(getDeckPressureSideHorizontalWidthLock(a, graph)).toBe(140);
    expect(getDeckPressureSideHorizontalLockedWidth(a)).toBe(140);
    expect(shouldLockDeckPressureSideHorizontalWidth(a)).toBe(true);
  });

  it('keeps Deck Pressure awake after side-stack attach for viewport settlement', () => {
    const hub = makeImageDeck(2000, 200, 300, 220);
    const top = makeNode(2001, 0, 100, 80);
    const bottom = makeNode(2002, 0, 100, 80);
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 4;
    globalThis.app = window.app;

    expect(deckNodeToLeader(top, hub, graph, 'left')).toBe(true);

    expect(Number(hub._deckPressureActiveUntil || 0)).toBeGreaterThan(performance.now?.() || Date.now());
    expect(top.size[1] + bottom.size[1]).toBe(hub.size[1]);
  });

  it('blocks seam resize between two preferred-auto members of a side vertical branch', () => {
    const hub = makeImageDeck(3000, 200, 300, 220);
    const top = makeNode(3001, 0, 100, 80);
    const bottom = makeNode(3002, 0, 100, 80);
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 10;
    globalThis.app = window.app;

    expect(deckNodeToLeader(top, hub, graph, 'left')).toBe(true);

    // Docked preferred-auto state: runtime autoHeight forced off, saved preference on.
    [top, bottom].forEach((member) => {
      member.properties.deckSavedAutoHeight = true;
      member.properties._derpPreferredAutoHeight = true;
      member.properties.autoHeight = false;
    });
    expect(resolveDerpPreferredAutoHeight(top)).toBe(true);
    expect(resolveDerpPreferredAutoHeight(bottom)).toBe(true);
    // The side band owns both heights: the seam cannot resize either node.
    expect(canResizeVerticalSeamPair(top, bottom, graph)).toBe(false);
    expect(canResizeVerticalSharedEdgeHeight(top, graph, 'bottom')).toBe(false);

    // Mixed branch: one manual member can absorb the delta, so the seam opens.
    bottom.properties._derpPreferredAutoHeight = false;
    bottom.properties.deckSavedAutoHeight = false;
    expect(canResizeVerticalSeamPair(top, bottom, graph)).toBe(true);
  });

  it('restores runtime autoWidth for top Deck Pressure horizontal branches', () => {
    const hub = makeImageDeck(25, 200, 300, 220);
    const a = makeNode(26, 0, 80, 90);
    const b = makeNode(27, 80, 120, 90);
    a.properties.autoWidth = true;
    b.properties.autoWidth = true;
    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 6;
    globalThis.app = window.app;

    expect(deckNodeToLeader(b, hub, graph, 'top')).toBe(true);
    expect(a.properties.autoWidth).toBe(true);
    expect(b.properties.autoWidth).toBe(true);
    expect(getDerpVars(b).autoWidth).toBe(true);
  });

  it('hydrates saved horizontal-stack autoWidth back to runtime autoWidth', () => {
    const a = makeNode(35, 0, 180, 90);
    const b = makeNode(36, 180, 120, 90);
    a.properties.autoWidth = false;
    a.properties.deckSavedAutoWidth = true;
    a.properties._derpPreferredAutoWidth = true;
    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 7;
    globalThis.app = window.app;

    expect(getDerpVars(a).autoWidth).toBe(true);
    expect(a.properties.autoWidth).toBe(true);
  });

  it('keeps saved vertical-stack autoWidth forced off for shared width', () => {
    const top = makeNode(38, 0, 180, 90);
    const bottom = makeNode(39, 0, 120, 90);
    top.properties.autoWidth = false;
    top.properties.deckSavedAutoWidth = true;
    top.properties._derpPreferredAutoWidth = true;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 8;
    globalThis.app = window.app;

    expect(getDerpVars(top).autoWidth).toBe(false);
    expect(top.properties.autoWidth).toBe(false);
  });

  it('normalizes vertical stacks by deck topology instead of transient y order', () => {
    const top = makeNode(43, 0, 100, 80);
    const middle = makeNode(44, 0, 100, 100);
    const bottom = makeNode(45, 0, 100, 120);
    top.pos[1] = 160;
    middle.pos[1] = 0;
    bottom.pos[1] = 80;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckEdges.top = middle.id;

    const graph = { _nodes: [top, middle, bottom] };
    window.app.graph = graph;
    globalThis.app = window.app;

    normalizeDockPair(middle, bottom, 'bottom', graph, 10);

    expect(top.pos[1]).toBe(0);
    expect(middle.pos[1]).toBe(80);
    expect(bottom.pos[1]).toBe(180);
  });

  it('preserves runtime autoWidth in manual mode for side-horizontal Deck Pressure branches', () => {
    const originalGetSettingValue = window.app.ui.settings.getSettingValue;
    window.app.ui.settings.getSettingValue = (id) => (
      id === 'Derp.DeckAutoStackMode' ? 'manual' : originalGetSettingValue(id)
    );

    try {
      const hub = makeImageDeck(30, 200, 300, 220);
      const a = makeNode(31, 0, 80, 90);
      const b = makeNode(32, 80, 120, 90);
      a.properties.autoWidth = true;
      b.properties.autoWidth = true;
      a.properties.deckEdges.right = b.id;
      b.properties.deckEdges.left = a.id;

      const graph = { _nodes: [hub, a, b] };
      window.app.graph = graph;
      window.app.canvas.frame = 4;
      globalThis.app = window.app;

      expect(deckNodeToLeader(b, hub, graph, 'left')).toBe(true);
      expect(a.properties.deckSavedAutoWidth).toBe(true);
      expect(b.properties.deckSavedAutoWidth).toBe(true);
      expect(a.properties.autoWidth).toBe(true);
      expect(b.properties.autoWidth).toBe(true);
      expect(resolveDerpPreferredAutoWidth(a)).toBe(false);
      expect(resolveDerpPreferredAutoWidth(b)).toBe(false);
      expect(getDerpVars(a).autoWidth).toBe(true);
      expect(getDerpVars(b).autoWidth).toBe(true);
      expect(canResizeHorizontalMemberWidth(a, graph)).toBe(false);
      expect(canResizeHorizontalMemberWidth(b, graph)).toBe(false);
      expect(canResizeDeckPressureSideWidthMember(a, graph)).toBe(false);
      expect(canResizeDeckPressureSideWidthMember(b, graph)).toBe(false);
      expect(getDeckPressureSideHorizontalLockedWidth(a)).toBe(0);
      expect(getDeckPressureSideHorizontalLockedWidth(b)).toBe(0);
    } finally {
      window.app.ui.settings.getSettingValue = originalGetSettingValue;
    }
  });

  it('keeps side-vertical Deck Pressure branch width from growing on transient content min width', () => {
    const hub = makeImageDeck(40, 200, 300, 220);
    const top = makeNode(41, 100, 100, 90);
    const bottom = makeNode(42, 100, 100, 130);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 5;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    top.size[0] = 150;
    top.properties.nodeSize[0] = 150;
    top.layout.contentMinWidth = 150;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[0]).toBe(100);
    expect(bottom.size[0]).toBe(100);
    expect(hub.pos[0]).toBe(200);
  });

  it('keeps side-vertical runtime width pinned to the Deck side band after clipped content widens', () => {
    const hub = makeImageDeck(43, 200, 300, 220);
    const top = makeNode(44, 100, 100, 90);
    const bottom = makeNode(45, 100, 100, 130);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 6;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    top.layout.contentMinWidth = 180;
    const resolved = resolveDerpRuntimeSize(top, {
      contentMinWidth: top.layout.contentMinWidth,
      contentMinHeight: top.layout.contentMinHeight,
      totalHeight: top.layout.totalHeight,
    }, { SNAP: 10, autoWidth: false, autoHeight: false });

    expect(resolved.width).toBe(100);
  });

  it('reapplies Deck Pressure layout during side-vertical internal seam resize', () => {
    const hub = makeImageDeck(46, 200, 300, 220);
    const top = makeNode(47, 100, 100, 90);
    const bottom = makeNode(48, 100, 100, 130);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 9;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);
    top.size[0] = 150;
    top.properties.nodeSize[0] = 150;

    const result = syncDockResizePair(top, 'bottom', 150, 120, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(top.size[0]).toBe(100);
    expect(bottom.size[0]).toBe(100);
    expect(top.pos[0]).toBe(100);
    expect(bottom.pos[0]).toBe(100);
    expect(hub.pos[0]).toBe(200);
  });

  it('defers dirty work during live side-vertical pressure layout for viewport-backed members', () => {
    // Viewport-backed members have a scrollViewport that clips stale layout,
    // so deferring dirty work during live resize is safe and performant for
    // them. (Plain non-viewport members must NOT defer — see the dedicated
    // regression test below.)
    const hub = makeImageDeck(2040, 200, 300, 220);
    const top = markViewportNode(makeNode(2041, 100, 100, 90));
    const bottom = markViewportNode(makeNode(2042, 100, 100, 130));

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 25;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);
    let dirtyCalls = 0;
    [hub, top, bottom].forEach((node) => {
      node.setDirtyCanvas = () => { dirtyCalls += 1; };
    });
    top.size[0] = 150;
    top.properties.nodeSize[0] = 150;

    const changed = applyDeckPressureLayout(hub, graph, 10, { liveResize: true });

    expect(changed).toContain(top);
    expect(top.size[0]).toBe(100);
    expect(dirtyCalls).toBe(0);
    expect(top._layoutDirty).not.toBe(true);
  });

  it('forces dirty work during live side-vertical pressure layout for plain non-viewport members', () => {
    // Regression test for derpLatent-at-the-bottom overflow: plain non-viewport
    // members render content inline with no clipping fallback. During live deck
    // resize, their node.size changes but if layout invalidation + sync are
    // deferred (the viewport-backed fast path), the sync/draw cycle that calls
    // layout.compute() never runs — regions stay at the previous (larger)
    // positions and content is drawn outside the new node bounds. Plain
    // non-viewport members must force layout invalidation + sync even in live
    // resize mode so their content stays within node bounds during the drag.
    const hub = makeImageDeck(2050, 200, 300, 220);
    const top = makeNode(2051, 100, 100, 90);
    const bottom = makeNode(2052, 100, 100, 130);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 27;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);
    let dirtyCalls = 0;
    [hub, top, bottom].forEach((node) => {
      node.setDirtyCanvas = () => { dirtyCalls += 1; };
    });
    let topRefreshCalls = 0;
    let topSyncCalls = 0;
    top.refreshNodeLayoutMap = () => { topRefreshCalls += 1; };
    top.requestDerpSync = () => { topSyncCalls += 1; };
    top.size[0] = 150;
    top.properties.nodeSize[0] = 150;

    const changed = applyDeckPressureLayout(hub, graph, 10, { liveResize: true });

    expect(changed).toContain(top);
    expect(top.size[0]).toBe(100);
    // Plain non-viewport members must NOT defer dirty work during live resize.
    expect(dirtyCalls).toBeGreaterThan(0);
    expect(top._layoutDirty).toBe(true);
    expect(top._forceSync).toBe(true);
    expect(topRefreshCalls).toBeGreaterThan(0);
    expect(topSyncCalls).toBeGreaterThan(0);
  });

  it('preserves side-vertical branch live heights during active seam resize', () => {
    const hub = makeImageDeck(49, 200, 300, 320);
    const top = makeNode(50, 100, 100, 120);
    const middle = makeNode(51, 100, 100, 100);
    const bottom = makeNode(52, 100, 100, 90);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    top.size[1] = 130;
    top.properties.nodeSize[1] = 130;
    middle.size[1] = 80;
    middle.properties.nodeSize[1] = 80;
    bottom.size[1] = 110;
    bottom.properties.nodeSize[1] = 110;
    [top, middle, bottom].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 10;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(130);
    expect(middle.size[1]).toBe(80);
    expect(bottom.size[1]).toBe(110);
  });

  it('does not pressure-collapse clipped side-vertical siblings during lower seam live resize', () => {
    const hub = makeImageDeck(2043, 200, 300, 300);
    const top = markViewportNode(makeNode(2044, 100, 100, 100), 'regionDiffusionDeck', 40);
    const middle = markViewportNode(makeNode(2045, 100, 100, 100), 'regionSamplerDeck', 40);
    const bottom = makeNode(2046, 100, 100, 100);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    top.layout.contentMinHeight = 40;
    top.layout.totalHeight = 40;
    middle.layout.contentMinHeight = 260;
    middle.layout.totalHeight = 260;
    bottom.layout.contentMinHeight = 40;
    bottom.layout.totalHeight = 40;
    let middleMeasureCount = 0;
    middle.refreshNodeLayoutMap = () => { middleMeasureCount += 1; };

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 26;
    globalThis.app = window.app;

    const result = syncDockResizePair(middle, 'bottom', middle.size[0], 40, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
    expect(top.properties.contentCollapsed).not.toBe(true);
    expect(middle.properties.contentCollapsed).not.toBe(true);
    expect(bottom.properties.contentCollapsed).not.toBe(true);
    expect(top.size[1]).toBe(100);
    expect(middle.size[1]).toBe(40);
    expect(bottom.size[1]).toBe(160);
    expect(bottom.pos[1] + bottom.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(middleMeasureCount).toBe(0);
  });

  it('preserves freshly seam-resized side-vertical branch heights below pressure min during release settlement', () => {
    const hub = makeImageDeck(57, 200, 300, 300);
    const top = makeNode(58, 100, 100, 140);
    const middle = makeNode(59, 100, 100, 120);
    const bottom = makeNode(60, 100, 100, 40);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 100;
      member.layout.totalHeight = 100;
      member._deckPressureManualBranchFitUntil = Date.now() + 1000;
    });

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 11;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(140);
    expect(middle.size[1]).toBe(120);
    expect(bottom.size[1]).toBe(40);
  });

  it('does not redistribute side-vertical branch heights from a pressed loader row', () => {
    const hub = makeImageDeck(73, 200, 300, 300);
    const top = makeNode(74, 100, 100, 100);
    const middle = makeNode(75, 100, 100, 100);
    const bottom = makeNode(76, 100, 100, 100);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });
    middle._pressedRegionKey = 'modelEntry:1';
    middle.properties._savedExpandedHeight = 180;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 12;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(100);
    expect(middle.size[1]).toBe(100);
    expect(bottom.size[1]).toBe(100);
  });

  it('keeps lower side-vertical seam heights after the fresh-fit window expires', () => {
    const hub = makeImageDeck(61, 200, 300, 300);
    // Viewport-backed nodes can be compacted below their content min to the
    // viewport floor; plain non-viewport nodes now clamp at content min.
    const top = markViewportNode(makeNode(62, 100, 100, 140));
    const middle = markViewportNode(makeNode(63, 100, 100, 80));
    const bottom = markViewportNode(makeNode(64, 100, 100, 80));

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
      member.refreshNodeLayoutMap = () => {
        if (member._deckPressureMeasuringMinSpan === true) {
          member.layout.contentMinHeight = 100;
          member.layout.totalHeight = 100;
        }
      };
    });

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 12;
    globalThis.app = window.app;

    const result = syncDockResizePair(middle, 'bottom', middle.size[0], 120, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(top.size[1]).toBe(140);
    expect(middle.size[1]).toBe(120);
    expect(bottom.size[1]).toBe(40);

    [top, middle, bottom].forEach((member) => {
      member._deckPressureManualBranchFitUntil = 0;
      member._isDerpResizing = false;
      member._dockResizePreserveHeight = false;
    });

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(140);
    expect(middle.size[1]).toBe(120);
    expect(bottom.size[1]).toBe(40);
  });

  it('clamps plain non-viewport side-vertical members at content min during decked seam resize', () => {
    // Regression test for derpLatent-at-the-bottom overflow: plain non-viewport
    // nodes render content inline and must not be compacted below their measured
    // content min. When decked alongside an ImageDeck, the internal vertical seam
    // must use preserveExpandedFloor: true (content min floor) for these nodes,
    // matching their un-decked behavior. Viewport-backed nodes still use the
    // compact viewport floor.
    const hub = makeImageDeck(65, 200, 300, 300);
    const top = makeNode(66, 100, 100, 80);
    const middle = makeNode(67, 100, 100, 80);
    const bottom = makeNode(68, 100, 100, 140);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    top.layout.contentMinHeight = 40;
    top.layout.totalHeight = 40;
    middle.layout.contentMinHeight = 40;
    middle.layout.totalHeight = 40;
    bottom.layout.contentMinHeight = 100;
    bottom.layout.totalHeight = 100;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 13;
    globalThis.app = window.app;

    // Request middle=180 (which would force bottom=40, below its content min).
    // Bottom must clamp at its content min (100) so middle only gets the remainder (120).
    const result = syncDockResizePair(middle, 'bottom', middle.size[0], 180, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(top.size[1]).toBe(80);
    expect(middle.size[1]).toBe(120);
    expect(bottom.size[1]).toBe(100);
  });

  it('preserves side-vertical branch auto-height preference and heights during Deck side width resize', () => {
    const hub = makeImageDeck(69, 200, 300, 320);
    const top = makeNode(70, 100, 100, 90);
    const middle = makeNode(71, 100, 100, 80);
    const bottom = makeNode(72, 100, 100, 70);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.properties.autoHeight = false;
      member.properties.deckSavedAutoHeight = true;
      member.properties._derpPreferredAutoHeight = true;
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 14;
    globalThis.app = window.app;

    const result = syncDockResizePair(top, 'right', 130, top.size[1], 40, 40, 10);

    expect(result.handledAll).toBe(true);
    [top, middle, bottom].forEach((member) => {
      expect(resolveDerpPreferredAutoHeight(member)).toBe(true);
      expect(member.properties.deckSavedAutoHeight).toBe(true);
      expect(member.properties._derpPreferredAutoHeight).toBe(true);
    });
    expect(top.size[1]).toBe(90);
    expect(middle.size[1]).toBe(80);
    expect(bottom.size[1]).toBe(70);

    hub._deckPressureSideResizeSession = null;
    delete hub._deckPressurePreserveFrameBounds;
    delete hub._deckPressureSideWidthOverrides;
    top._horizontalDeckWidthResizeLock = false;
    middle._horizontalDeckWidthResizeLock = false;
    bottom._horizontalDeckWidthResizeLock = false;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(90);
    expect(middle.size[1]).toBe(80);
    expect(bottom.size[1]).toBe(70);
  });

  it('snapshots side-vertical viewport clip heights during Deck side width resize', () => {
    const hub = makeImageDeck(169, 200, 300, 320);
    const top = makeNode(170, 100, 100, 90);
    const middle = makeNode(171, 100, 100, 80);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;

    top._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 34 } };
    middle._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 32 } };

    const graph = { _nodes: [hub, top, middle] };
    window.app.graph = graph;
    window.app.canvas.frame = 15;
    globalThis.app = window.app;

    const result = syncDockResizePair(top, 'right', 130, top.size[1], 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(top._contentViewportPreserveClipHeights.regionDeck).toBe(34);
    expect(middle._contentViewportPreserveClipHeights.regionDeck).toBe(32);
    expect(top._contentViewportPreserveClipUntil).toBeGreaterThan(0);
    expect(middle._contentViewportPreserveClipUntil).toBeGreaterThan(0);
  });

  it('keeps clipped side-vertical branch members from receiving ImageDeck spare height', () => {
    const hub = makeImageDeck(172, 200, 300, 420);
    const diffusion = makeNode(173, 100, 100, 100);
    const sampler = makeNode(174, 100, 100, 80);
    const latent = makeNode(175, 100, 100, 70);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });
    diffusion._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 34, minClipHeight: 34 } };
    sampler._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 32, minClipHeight: 32 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 16;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.size[1]).toBe(100);
    expect(sampler.size[1]).toBe(80);
    expect(latent.size[1]).toBe(240);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
  });

  it('detects side-vertical clipped members from layout maps before viewport state exists', () => {
    const hub = makeImageDeck(180, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(181, 100, 100, 100), 'regionDiffusionDeck', 34);
    const sampler = markViewportNode(makeNode(182, 100, 100, 80), 'regionSamplerDeck', 32);
    const latent = makeNode(183, 100, 100, 70);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 18;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.size[1]).toBe(100);
    expect(sampler.size[1]).toBe(80);
    expect(latent.size[1]).toBe(240);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
  });

  it('fits over-tall clipped side-vertical members back to the ImageDeck height', () => {
    const hub = makeImageDeck(2003, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(2004, 100, 100, 900), 'regionDiffusionDeck', 34);
    const sampler = markViewportNode(makeNode(2005, 100, 100, 80), 'regionSamplerDeck', 32);
    const latent = makeNode(2006, 100, 100, 70);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 34, minClipHeight: 34 } };
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 32, minClipHeight: 32 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 22;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.size[1]).toBeLessThan(900);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
  });

  it('keeps all-clipped side-vertical branches height-matched when no plain filler exists', () => {
    const hub = makeImageDeck(184, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(185, 100, 100, 100), 'regionDiffusionDeck', 34);
    const sampler = markViewportNode(makeNode(186, 100, 100, 80), 'regionSamplerDeck', 32);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;

    [diffusion, sampler].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });

    const graph = { _nodes: [hub, diffusion, sampler] };
    window.app.graph = graph;
    window.app.canvas.frame = 19;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.size[1]).toBe(100);
    expect(diffusion.size[1] + sampler.size[1]).toBe(420);
    expect(sampler.pos[1] + sampler.size[1]).toBe(hub.pos[1] + hub.size[1]);
  });

  it('keeps Deck side-width resize height-matched while clipped members stay compact', () => {
    const hub = makeImageDeck(176, 200, 300, 420);
    const diffusion = makeNode(177, 100, 100, 100);
    const sampler = makeNode(178, 100, 100, 80);
    const latent = makeNode(179, 100, 100, 70);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });
    diffusion._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 34, minClipHeight: 34 } };
    sampler._contentViewportState = { regionDeck: { key: 'regionDeck', clipHeight: 32, minClipHeight: 32 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 17;
    globalThis.app = window.app;

    const result = syncDockResizePair(diffusion, 'right', 130, diffusion.size[1], 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(diffusion.size[1]).toBe(100);
    expect(sampler.size[1]).toBe(80);
    expect(latent.size[1]).toBe(240);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
  });

  it('uses compact viewport floors for the middle side-vertical seam', () => {
    const hub = makeImageDeck(187, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(188, 100, 100, 70), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(189, 100, 100, 200), 'regionSamplerDeck', 40);
    const latent = makeNode(190, 100, 100, 150);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    diffusion.layout.contentMinHeight = 40;
    diffusion.layout.totalHeight = 40;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler.layout.contentMinHeight = 200;
    sampler.layout.totalHeight = 200;
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    latent.layout.contentMinHeight = 40;
    latent.layout.totalHeight = 40;

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 20;
    globalThis.app = window.app;

    const result = syncDockResizePair(sampler, 'bottom', sampler.size[0], 80, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(diffusion.size[1]).toBe(70);
    expect(sampler.size[1]).toBe(80);
    expect(latent.size[1]).toBe(270);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(diffusion._contentViewportPreserveClipHeights).toBeUndefined();
    expect(sampler._contentViewportPreserveClipHeights).toBeUndefined();
  });

  it('keeps a clamped lower side-vertical seam on compact viewport floors', () => {
    const hub = makeImageDeck(2007, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(2008, 100, 100, 70), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(2009, 100, 100, 40), 'regionSamplerDeck', 40);
    const latent = makeNode(2010, 100, 100, 310);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    diffusion.layout.contentMinHeight = 40;
    diffusion.layout.totalHeight = 40;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler.layout.contentMinHeight = 200;
    sampler.layout.totalHeight = 200;
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    latent.layout.contentMinHeight = 40;
    latent.layout.totalHeight = 40;

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 23;
    globalThis.app = window.app;

    const result = syncDockResizePair(sampler, 'bottom', sampler.size[0], 40, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
    expect(diffusion.size[1]).toBe(70);
    expect(sampler.size[1]).toBe(40);
    expect(latent.size[1]).toBe(310);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(sampler._contentViewportPreserveClipHeights).toBeUndefined();
  });

  it('uses compact viewport floors through the live pointer resize path', () => {
    const hub = makeImageDeck(2011, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(2012, 100, 100, 70), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(2013, 100, 100, 200), 'regionSamplerDeck', 40);
    const latent = makeNode(2014, 100, 100, 150);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    diffusion.layout.contentMinHeight = 40;
    diffusion.layout.totalHeight = 40;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler.layout.contentMinHeight = 200;
    sampler.layout.totalHeight = 200;
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    latent.layout.contentMinHeight = 40;
    latent.layout.totalHeight = 40;

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 24;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);
    sampler._startPos = [...sampler.pos];
    sampler._startSize = [...sampler.size];

    handleNodeResize(sampler, { dx: 0, dy: -160, resizeAnchor: 'bottom' }, 1);

    expect(diffusion.size[1]).toBe(70);
    expect(sampler.size[1]).toBe(40);
    expect(latent.size[1]).toBe(310);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(sampler._contentViewportPreserveClipHeights).toBeUndefined();
  });

  it('preserves the canonical Deck frame during lower side-vertical seam resize', () => {
    const hub = makeImageDeck(191, 200, 300, 420);
    const diffusion = makeNode(192, 100, 100, 120);
    const sampler = markViewportNode(makeNode(193, 100, 100, 220), 'regionSamplerDeck', 40);
    const latent = makeNode(194, 100, 100, 160);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 21;
    globalThis.app = window.app;

    const result = syncDockResizePair(sampler, 'bottom', sampler.size[0], 100, 40, 40, 10);

    expect(result.handledAll).toBe(true);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
  });

  it('reruns Deck Pressure layout when viewport state changes without geometry changes', () => {
    const hub = makeImageDeck(195, 200, 300, 420);
    const diffusion = makeNode(196, 100, 100, 100);
    const sampler = markViewportNode(makeNode(197, 100, 100, 80), 'regionSamplerDeck', 40);
    const latent = makeNode(198, 100, 100, 70);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 22;
    globalThis.app = window.app;

    normalizeDerpDockedLayout(sampler);
    const previousSamplerHeight = sampler.size[1];
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler.layout.contentMinHeight = 120;
    sampler.layout.totalHeight = 120;

    window.app.canvas.frame = 23;
    const moved = normalizeDerpDockedLayout(sampler);

    expect(moved.length).toBeGreaterThan(0);
    expect(sampler.size[1]).toBeGreaterThan(previousSamplerHeight);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
  });

  it('blocks side-vertical Deck Pressure seams when both members are preferred auto-height', () => {
    const hub = makeImageDeck(92, 200, 300, 240);
    const top = makeNode(93, 100, 100, 140);
    const bottom = makeNode(94, 100, 100, 100);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = top.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = top.id;

    [top, bottom].forEach((member) => {
      member.properties.autoHeight = false;
      member.properties.deckSavedAutoHeight = true;
      member.properties._derpPreferredAutoHeight = true;
    });

    const graph = { _nodes: [hub, top, bottom] };
    window.app.graph = graph;
    globalThis.app = window.app;

    // Both members are preferred-auto: the side band owns both heights,
    // so the internal seam cannot resize either node (no manual member to absorb delta).
    expect(canResizeVerticalSharedEdgeHeight(top, graph, 'bottom')).toBe(false);
    expect(canResizeVerticalSharedEdgeHeight(bottom, graph, 'top')).toBe(false);

    // Mixed branch: one manual member can absorb the delta, seam opens.
    bottom.properties._derpPreferredAutoHeight = false;
    bottom.properties.deckSavedAutoHeight = false;
    expect(canResizeVerticalSharedEdgeHeight(top, graph, 'bottom')).toBe(true);
    expect(canResizeVerticalSharedEdgeHeight(bottom, graph, 'top')).toBe(true);

    // Ordinary auto+auto stack seam should still be blocked.
    const ordinaryTop = makeNode(95, 0, 100, 120);
    const ordinaryBottom = makeNode(96, 0, 100, 80);
    ordinaryTop.properties.autoHeight = true;
    ordinaryBottom.properties.autoHeight = true;
    ordinaryTop.properties.deckEdges.bottom = ordinaryBottom.id;
    ordinaryBottom.properties.deckEdges.top = ordinaryTop.id;
    const ordinaryGraph = { _nodes: [ordinaryTop, ordinaryBottom] };
    expect(canResizeVerticalSharedEdgeHeight(ordinaryTop, ordinaryGraph, 'bottom')).toBe(false);
  });

  it('keeps fractional side-vertical branch height aligned to the Deck frame after side width resize', () => {
    const originalCanvas = window.app.canvas.canvas;
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    window.app.canvas.canvas = canvas;
    let bottom = null;

    try {
      const hub = makeImageDeck(73, 200, 300, 323);
      const top = makeNode(74, 100, 100, 100);
      const middle = makeNode(75, 100, 100, 100);
      bottom = makeNode(76, 100, 100, 120);

      hub.properties.deckEdges.left = top.id;
      top.properties.deckParentId = hub.id;
      top.properties.deckDockSide = 'left';
      top.properties.deckEdges.right = hub.id;
      top.properties.deckEdges.bottom = middle.id;
      middle.properties.deckParentId = top.id;
      middle.properties.deckDockSide = 'bottom';
      middle.properties.deckEdges.top = top.id;
      middle.properties.deckEdges.bottom = bottom.id;
      bottom.properties.deckParentId = middle.id;
      bottom.properties.deckDockSide = 'bottom';
      bottom.properties.deckEdges.top = middle.id;

      [top, middle, bottom].forEach((member) => {
        member.layout.contentMinHeight = 40;
        member.layout.totalHeight = 40;
      });

      const graph = { _nodes: [hub, top, middle, bottom] };
      window.app.graph = graph;
      window.app.canvas.frame = 15;
      globalThis.app = window.app;

      const result = syncDockResizePair(top, 'right', 130, top.size[1], 40, 40, 10);
      expect(result.handledAll).toBe(true);

      hub._deckPressureSideResizeSession = null;
      delete hub._deckPressurePreserveFrameBounds;
      delete hub._deckPressureSideWidthOverrides;
      top._horizontalDeckWidthResizeLock = false;
      middle._horizontalDeckWidthResizeLock = false;
      bottom._horizontalDeckWidthResizeLock = false;

      applyDeckPressureLayout(hub, graph, 10);

      expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(323);
      expect(bottom.size[1]).toBe(123);
      expect(bottom.pos[1] + bottom.size[1]).toBe(hub.pos[1] + hub.size[1]);

      createDerpShield(bottom);
      syncDerpShield(bottom);
      expect(bottom.interactionShield._resizeHandleLeft.style.display).toBe('block');
      expect(bottom.interactionShield._resizeHandleLeft.style.cursor).toContain('resize');
    } finally {
      if (bottom) removeDerpShield(bottom);
      window.app.canvas.canvas = originalCanvas;
    }
  });

  it('fills mixed vertical-sandwich side stacks to the frame bottom after side width resize', () => {
    const originalCanvas = window.app.canvas.canvas;
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 700 });
    Object.defineProperty(canvas, 'clientWidth', { value: 900, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 700, configurable: true });
    window.app.canvas.canvas = canvas;
    let leftBottom = null;
    let rightBottom = null;

    try {
      const hub = makeImageDeck(77, 200, 300, 300);
      hub.properties.deckArrangement = 'vertical_sandwich';
      const leftTop = makeNode(78, 100, 100, 150);
      leftBottom = makeNode(79, 100, 100, 150);
      const rightTop = makeNode(80, 500, 100, 150);
      rightBottom = makeNode(81, 500, 100, 150);
      const bottom = makeNode(82, 200, 300, 30);

      hub.properties.deckEdges.left = leftTop.id;
      hub.properties.deckEdges.right = rightTop.id;
      hub.properties.deckEdges.bottom = bottom.id;

      leftTop.properties.deckParentId = hub.id;
      leftTop.properties.deckDockSide = 'left';
      leftTop.properties.deckEdges.right = hub.id;
      leftTop.properties.deckEdges.bottom = leftBottom.id;
      leftBottom.properties.deckParentId = leftTop.id;
      leftBottom.properties.deckDockSide = 'bottom';
      leftBottom.properties.deckEdges.top = leftTop.id;

      rightTop.properties.deckParentId = hub.id;
      rightTop.properties.deckDockSide = 'right';
      rightTop.properties.deckEdges.left = hub.id;
      rightTop.properties.deckEdges.bottom = rightBottom.id;
      rightBottom.properties.deckParentId = rightTop.id;
      rightBottom.properties.deckDockSide = 'bottom';
      rightBottom.properties.deckEdges.top = rightTop.id;

      bottom.properties.deckParentId = hub.id;
      bottom.properties.deckDockSide = 'bottom';
      bottom.properties.deckEdges.top = hub.id;

      [leftTop, leftBottom, rightTop, rightBottom, bottom].forEach((member) => {
        member.layout.contentMinHeight = 40;
        member.layout.totalHeight = 40;
      });

      const graph = { _nodes: [hub, leftTop, leftBottom, rightTop, rightBottom, bottom] };
      window.app.graph = graph;
      window.app.canvas.frame = 16;
      globalThis.app = window.app;

      const result = syncDockResizePair(leftTop, 'right', 130, leftTop.size[1], 40, 40, 10);
      expect(result.handledAll).toBe(true);

      hub._deckPressureSideResizeSession = null;
      delete hub._deckPressurePreserveFrameBounds;
      delete hub._deckPressureSideWidthOverrides;
      [leftTop, leftBottom, rightTop, rightBottom].forEach((member) => {
        member._horizontalDeckWidthResizeLock = false;
      });

      applyDeckPressureLayout(hub, graph, 10);

      const plan = computeDeckPressureGeometryPlan(hub, graph, 10);
      expect(leftBottom.pos[1] + leftBottom.size[1]).toBe(plan.frame.bottom);
      expect(rightBottom.pos[1] + rightBottom.size[1]).toBe(plan.frame.bottom);
      expect(getDeckCornerOverride(leftBottom, graph)[3]).toBe(null);
      expect(getDeckCornerOverride(rightBottom, graph)[2]).toBe(null);

      createDerpShield(leftBottom);
      createDerpShield(rightBottom);
      syncDerpShield(leftBottom);
      syncDerpShield(rightBottom);
      expect(leftBottom.interactionShield._resizeHandleLeft.style.display).toBe('block');
      expect(rightBottom.interactionShield._resizeHandle.style.display).toBe('block');
    } finally {
      if (leftBottom) removeDerpShield(leftBottom);
      if (rightBottom) removeDerpShield(rightBottom);
      window.app.canvas.canvas = originalCanvas;
    }
  });

  it('keeps raw fractional side-band bottoms on the composed Deck frame', () => {
    const hub = makeImageDeck(83, 1810, 510, 560);
    hub.properties.deckArrangement = 'vertical_sandwich';
    const leftTop = makeNode(84, 1550, 260, 430);
    const leftBottom = makeNode(85, 1550, 260, 240);
    const rightTop = makeNode(86, 2320, 260, 370);
    const rightMiddle = makeNode(87, 2320, 260, 190);
    const rightBottom = makeNode(88, 2320, 260, 110);
    const bottomA = makeNode(89, 1810, 200, 111.59);
    const bottomB = makeNode(90, 2010, 200, 111.59);
    const bottomC = makeNode(91, 2210, 110, 111.59);

    hub.properties.deckEdges.left = leftTop.id;
    hub.properties.deckEdges.right = rightTop.id;
    hub.properties.deckEdges.bottom = bottomA.id;

    leftTop.properties.deckParentId = hub.id;
    leftTop.properties.deckDockSide = 'left';
    leftTop.properties.deckEdges.right = hub.id;
    leftTop.properties.deckEdges.bottom = leftBottom.id;
    leftBottom.properties.deckParentId = leftTop.id;
    leftBottom.properties.deckDockSide = 'bottom';
    leftBottom.properties.deckEdges.top = leftTop.id;

    rightTop.properties.deckParentId = hub.id;
    rightTop.properties.deckDockSide = 'right';
    rightTop.properties.deckEdges.left = hub.id;
    rightTop.properties.deckEdges.bottom = rightMiddle.id;
    rightMiddle.properties.deckParentId = rightTop.id;
    rightMiddle.properties.deckDockSide = 'bottom';
    rightMiddle.properties.deckEdges.top = rightTop.id;
    rightMiddle.properties.deckEdges.bottom = rightBottom.id;
    rightBottom.properties.deckParentId = rightMiddle.id;
    rightBottom.properties.deckDockSide = 'bottom';
    rightBottom.properties.deckEdges.top = rightMiddle.id;

    bottomA.properties.deckParentId = hub.id;
    bottomA.properties.deckDockSide = 'bottom';
    bottomA.properties.deckEdges.top = hub.id;
    bottomA.properties.deckEdges.right = bottomB.id;
    bottomB.properties.deckParentId = bottomA.id;
    bottomB.properties.deckDockSide = 'right';
    bottomB.properties.deckEdges.left = bottomA.id;
    bottomB.properties.deckEdges.right = bottomC.id;
    bottomC.properties.deckParentId = bottomB.id;
    bottomC.properties.deckDockSide = 'right';
    bottomC.properties.deckEdges.left = bottomB.id;

    [leftTop, leftBottom, rightTop, rightMiddle, rightBottom, bottomA, bottomB, bottomC].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = member.size[1];
    });

    const graph = { _nodes: [hub, leftTop, leftBottom, rightTop, rightMiddle, rightBottom, bottomA, bottomB, bottomC] };
    window.app.graph = graph;
    window.app.canvas.frame = 17;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    const plan = computeDeckPressureGeometryPlan(hub, graph, 10);
    expect(leftBottom.pos[1] + leftBottom.size[1]).toBeCloseTo(plan.frame.bottom, 2);
    expect(rightBottom.pos[1] + rightBottom.size[1]).toBeCloseTo(plan.frame.bottom, 2);
    expect(getDeckCornerOverride(leftBottom, graph)[3]).toBe(null);
    expect(getDeckCornerOverride(rightBottom, graph)[2]).toBe(null);
  });

  it('resizes the bottom stack and not the hub when dragging the deck frame bottom edge', () => {
    const hub = makeImageDeck(501, 200, 300, 400);
    hub.properties.deckArrangement = 'vertical_sandwich';
    const leftNode = makeNode(502, 100, 100, 480);
    const bottomNode = makeNode(503, 200, 300, 80);

    hub.properties.deckEdges.left = leftNode.id;
    hub.properties.deckEdges.bottom = bottomNode.id;
    leftNode.properties.deckParentId = hub.id;
    leftNode.properties.deckDockSide = 'left';
    leftNode.properties.deckEdges.right = hub.id;
    bottomNode.properties.deckParentId = hub.id;
    bottomNode.properties.deckDockSide = 'bottom';
    bottomNode.properties.deckEdges.top = hub.id;

    [leftNode, bottomNode].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });

    const graph = { _nodes: [hub, leftNode, bottomNode] };
    window.app.graph = graph;
    window.app.canvas.frame = 120;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);
    expect(hub.size[1]).toBe(400);
    expect(leftNode.size[1]).toBe(480);
    expect(bottomNode.size[1]).toBe(80);

    bottomNode._startPos = [...bottomNode.pos];
    bottomNode._startSize = [...bottomNode.size];
    handleNodeResize(bottomNode, { dx: 0, dy: 60, resizeAnchor: 'bottom' }, 1);

    // The hub keeps its rect: the decked stacks absorb the frame delta.
    expect(hub.pos[1]).toBe(0);
    expect(hub.size[1]).toBe(400);
    expect(hub.properties.nodeSize[1]).toBe(400);
    expect(bottomNode.size[1]).toBe(140);
    expect(leftNode.size[1]).toBe(540);
    expect(bottomNode.pos[1] + bottomNode.size[1]).toBe(leftNode.pos[1] + leftNode.size[1]);
  });

  it('preserves side-vertical branch live heights when active Deck resize is not changing height', () => {
    const hub = makeImageDeck(57, 200, 300, 300);
    const top = makeNode(58, 100, 100, 140);
    const middle = makeNode(59, 100, 100, 110);
    const bottom = makeNode(60, 100, 100, 90);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });
    hub._isDerpResizing = true;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 11;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1]).toBe(140);
    expect(middle.size[1]).toBe(110);
    expect(bottom.size[1]).toBe(90);
  });

  it('grows side-vertical branch live heights during active Deck frame resize', () => {
    const hub = makeImageDeck(61, 200, 300, 380);
    const top = makeNode(62, 100, 100, 140);
    const middle = makeNode(63, 100, 100, 110);
    const bottom = makeNode(64, 100, 100, 90);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });
    hub._isDerpResizing = true;
    hub._deckPressureFrameHeightResizeActive = true;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 12;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(380);
    expect(top.size[1]).toBeGreaterThan(140);
    expect(middle.size[1]).toBeGreaterThan(110);
    expect(bottom.size[1]).toBeGreaterThan(90);
  });

  it('shrinks side-vertical branch live heights during active Deck frame height resize', () => {
    const hub = makeImageDeck(65, 200, 300, 300);
    const top = makeNode(66, 100, 100, 140);
    const middle = makeNode(67, 100, 100, 110);
    const bottom = makeNode(68, 100, 100, 90);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.layout.contentMinHeight = 40;
      member.layout.totalHeight = 40;
    });
    hub._isDerpResizing = true;
    hub._deckPressureFrameHeightResizeActive = true;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 13;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(300);
    expect(top.size[1]).toBeLessThan(140);
    expect(middle.size[1]).toBeLessThan(110);
    expect(bottom.size[1]).toBeLessThan(90);
  });

  it('does not collapse expanded side-vertical members when active Deck frame shrink fits below stale measured mins', () => {
    const hub = makeImageDeck(2065, 200, 300, 340);
    // Viewport-backed nodes use the compact viewport floor (not the full content
    // min) as the active resize floor. Plain non-viewport nodes now clamp at
    // their content min to prevent visible content overflow when decked.
    const top = markViewportNode(makeNode(2066, 100, 100, 140));
    const middle = markViewportNode(makeNode(2067, 100, 100, 110));
    const bottom = markViewportNode(makeNode(2068, 100, 100, 90));

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    top.layout.contentMinHeight = 320;
    top.layout.totalHeight = 320;
    middle.layout.contentMinHeight = 260;
    middle.layout.totalHeight = 260;
    bottom.layout.contentMinHeight = 220;
    bottom.layout.totalHeight = 220;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 113;
    globalThis.app = window.app;

    hub._startPos = [...hub.pos];
    hub._startSize = [...hub.size];
    hub._isDerpResizing = true;
    [top, middle, bottom].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    handleNodeResize(hub, { dx: 0, dy: -40, resizeAnchor: 'bottom-right' }, 1);

    expect(top.properties.contentCollapsed).toBeFalsy();
    expect(middle.properties.contentCollapsed).toBeFalsy();
    expect(bottom.properties.contentCollapsed).toBeFalsy();
    expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(300);
    expect(top.size[1]).toBeLessThan(140);
    expect(middle.size[1]).toBeLessThan(110);
    expect(bottom.size[1]).toBeLessThan(90);
  });

  it('clamps active Deck frame shrink instead of collapsing side-vertical members below their active floors', () => {
    const hub = makeImageDeck(3065, 200, 300, 390);
    const top = makeNode(3066, 100, 100, 130);
    const middle = makeNode(3067, 100, 100, 130);
    const bottom = makeNode(3068, 100, 100, 130);

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    [top, middle, bottom].forEach((member) => {
      member.properties.minHeight = 120;
      member.layout.contentMinHeight = 260;
      member.layout.totalHeight = 260;
    });

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 114;
    globalThis.app = window.app;

    hub._startPos = [...hub.pos];
    hub._startSize = [...hub.size];
    hub._isDerpResizing = true;
    [top, middle, bottom].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    handleNodeResize(hub, { dx: 0, dy: -90, resizeAnchor: 'bottom-right' }, 1);

    expect(hub.size[1]).toBe(360);
    expect(top.properties.contentCollapsed).toBeFalsy();
    expect(middle.properties.contentCollapsed).toBeFalsy();
    expect(bottom.properties.contentCollapsed).toBeFalsy();
    expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(360);
    expect(top.size[1]).toBeGreaterThanOrEqual(120);
    expect(middle.size[1]).toBeGreaterThanOrEqual(120);
    expect(bottom.size[1]).toBeGreaterThanOrEqual(120);
  });

  it('does not collapse compact clipped side-vertical members during active Deck frame height resize', () => {
    const hub = makeImageDeck(69, 200, 300, 420);
    const diffusion = markViewportNode(makeNode(70, 100, 100, 120), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(71, 100, 100, 100), 'regionSamplerDeck', 40);
    const latent = makeNode(72, 100, 100, 20);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;
    latent.properties.contentCollapsed = true;

    diffusion.layout.contentMinHeight = 320;
    diffusion.layout.totalHeight = 320;
    sampler.layout.contentMinHeight = 260;
    sampler.layout.totalHeight = 260;
    latent.layout.contentMinHeight = 20;
    latent.layout.totalHeight = 20;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    hub._isDerpResizing = true;
    hub._deckPressureFrameHeightResizeActive = true;

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 14;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
    expect(latent.size[1]).toBe(20);
  });

  it('does not collapse compact clipped side-vertical members while shrinking the Deck frame height', () => {
    const hub = makeImageDeck(73, 200, 300, 180);
    const diffusion = markViewportNode(makeNode(74, 100, 100, 120), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(75, 100, 100, 100), 'regionSamplerDeck', 40);
    const latent = makeNode(76, 100, 100, 20);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;
    latent.properties.contentCollapsed = true;

    diffusion.layout.contentMinHeight = 320;
    diffusion.layout.totalHeight = 320;
    sampler.layout.contentMinHeight = 260;
    sampler.layout.totalHeight = 260;
    latent.layout.contentMinHeight = 20;
    latent.layout.totalHeight = 20;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };
    hub._isDerpResizing = true;
    hub._deckPressureFrameHeightResizeActive = true;

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 15;
    globalThis.app = window.app;

    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(180);
    expect(latent.size[1]).toBe(20);
  });

  it('keeps clipped side-vertical members expanded after Deck frame height resize settles', () => {
    const hub = makeImageDeck(181, 200, 300, 300);
    const diffusion = markViewportNode(makeNode(182, 100, 100, 120), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(183, 100, 100, 100), 'regionSamplerDeck', 40);
    const latent = makeNode(184, 100, 100, 80);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;
    latent.properties.contentCollapsed = true;

    diffusion.layout.contentMinHeight = 320;
    diffusion.layout.totalHeight = 320;
    sampler.layout.contentMinHeight = 260;
    sampler.layout.totalHeight = 260;
    latent.layout.contentMinHeight = 20;
    latent.layout.totalHeight = 20;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 17;
    globalThis.app = window.app;

    hub._startPos = [...hub.pos];
    hub._startSize = [...hub.size];
    hub._isDerpResizing = true;
    [diffusion, sampler, latent].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    handleNodeResize(hub, { dx: 0, dy: 120, resizeAnchor: 'bottom-right' }, 1);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);

    hub._isDerpResizing = false;
    delete hub._deckPressureFrameHeightResizeActive;
    [diffusion, sampler, latent].forEach((member) => {
      member._isDerpResizing = false;
      member._dockResizePreserveHeight = false;
    });

    window.app.canvas.frame = 18;
    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(420);
    expect(latent.size[1]).toBe(20);
  });

  it('keeps clipped side-vertical members expanded after shrinking Deck frame height settles', () => {
    const hub = makeImageDeck(281, 200, 300, 300);
    const diffusion = markViewportNode(makeNode(282, 100, 100, 120), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(283, 100, 100, 100), 'regionSamplerDeck', 40);
    const latent = makeNode(284, 100, 100, 80);

    hub.properties.deckEdges.left = diffusion.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;
    latent.properties.contentCollapsed = true;

    diffusion.layout.contentMinHeight = 320;
    diffusion.layout.totalHeight = 320;
    sampler.layout.contentMinHeight = 260;
    sampler.layout.totalHeight = 260;
    latent.layout.contentMinHeight = 20;
    latent.layout.totalHeight = 20;
    diffusion._contentViewportState = { regionDiffusionDeck: { key: 'regionDiffusionDeck', clipHeight: 40, minClipHeight: 40 } };
    sampler._contentViewportState = { regionSamplerDeck: { key: 'regionSamplerDeck', clipHeight: 40, minClipHeight: 40 } };

    const graph = { _nodes: [hub, diffusion, sampler, latent] };
    window.app.graph = graph;
    window.app.canvas.frame = 19;
    globalThis.app = window.app;

    hub._startPos = [...hub.pos];
    hub._startSize = [...hub.size];
    hub._isDerpResizing = true;
    [diffusion, sampler, latent].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    handleNodeResize(hub, { dx: 0, dy: -120, resizeAnchor: 'bottom-right' }, 1);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(180);

    hub._isDerpResizing = false;
    delete hub._deckPressureFrameHeightResizeActive;
    [diffusion, sampler, latent].forEach((member) => {
      member._isDerpResizing = false;
      member._dockResizePreserveHeight = false;
    });

    window.app.canvas.frame = 20;
    applyDeckPressureLayout(hub, graph, 10);

    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBe(true);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(180);
    expect(latent.size[1]).toBe(20);
  });

  it('does not collapse an already fitting side-vertical branch while expanding the Deck frame', () => {
    const hub = makeImageDeck(185, 200, 300, 300);
    // Viewport-backed nodes can be compacted below their content min to the
    // viewport floor; plain non-viewport nodes now clamp at content min.
    const top = markViewportNode(makeNode(186, 100, 100, 120));
    const middle = markViewportNode(makeNode(187, 100, 100, 100));
    const bottom = markViewportNode(makeNode(188, 100, 100, 80));

    hub.properties.deckEdges.left = top.id;
    top.properties.deckParentId = hub.id;
    top.properties.deckDockSide = 'left';
    top.properties.deckEdges.right = hub.id;
    top.properties.deckEdges.bottom = middle.id;
    middle.properties.deckParentId = top.id;
    middle.properties.deckDockSide = 'bottom';
    middle.properties.deckEdges.top = top.id;
    middle.properties.deckEdges.bottom = bottom.id;
    bottom.properties.deckParentId = middle.id;
    bottom.properties.deckDockSide = 'bottom';
    bottom.properties.deckEdges.top = middle.id;

    top.layout.contentMinHeight = 280;
    top.layout.totalHeight = 280;
    middle.layout.contentMinHeight = 220;
    middle.layout.totalHeight = 220;
    bottom.layout.contentMinHeight = 180;
    bottom.layout.totalHeight = 180;

    const graph = { _nodes: [hub, top, middle, bottom] };
    window.app.graph = graph;
    window.app.canvas.frame = 19;
    globalThis.app = window.app;

    hub._startPos = [...hub.pos];
    hub._startSize = [...hub.size];
    hub._isDerpResizing = true;
    [top, middle, bottom].forEach((member) => {
      member._isDerpResizing = true;
      member._dockResizePreserveHeight = true;
    });

    handleNodeResize(hub, { dx: 0, dy: 120, resizeAnchor: 'bottom-right' }, 1);

    expect(top.properties.contentCollapsed).toBeFalsy();
    expect(middle.properties.contentCollapsed).toBeFalsy();
    expect(bottom.properties.contentCollapsed).toBeFalsy();
    expect(top.size[1] + middle.size[1] + bottom.size[1]).toBe(420);
  });

  it('keeps side-vertical branches expanded and aligned when ImageDeck auto-fit changes aspect', () => {
    const hub = makeImageDeck(4065, 200, 300, 600);
    const diffusion = markViewportNode(makeNode(4066, 100, 100, 200), 'regionDiffusionDeck', 40);
    const sampler = markViewportNode(makeNode(4067, 100, 100, 200), 'regionSamplerDeck', 40);
    const latent = markViewportNode(makeNode(4068, 100, 100, 200), 'regionLatentDeck', 40);
    const right = markViewportNode(makeNode(4069, 500, 140, 600));

    hub.properties.deckArrangement = 'horizontal_sandwich';
    hub.layout.regions.imageRegion = { w: 300, h: 560 };
    hub.properties.deckEdges.left = diffusion.id;
    hub.properties.deckEdges.right = right.id;
    diffusion.properties.deckParentId = hub.id;
    diffusion.properties.deckDockSide = 'left';
    diffusion.properties.deckEdges.right = hub.id;
    diffusion.properties.deckEdges.bottom = sampler.id;
    sampler.properties.deckParentId = diffusion.id;
    sampler.properties.deckDockSide = 'bottom';
    sampler.properties.deckEdges.top = diffusion.id;
    sampler.properties.deckEdges.bottom = latent.id;
    latent.properties.deckParentId = sampler.id;
    latent.properties.deckDockSide = 'bottom';
    latent.properties.deckEdges.top = sampler.id;
    right.properties.deckParentId = hub.id;
    right.properties.deckDockSide = 'right';
    right.properties.deckEdges.left = hub.id;

    [diffusion, sampler, latent].forEach((member) => {
      member.layout.contentMinHeight = 320;
      member.layout.totalHeight = 320;
    });
    right.layout.contentMinHeight = 600;
    right.layout.totalHeight = 600;

    const graph = { _nodes: [hub, diffusion, sampler, latent, right] };
    window.app.graph = graph;
    window.app.canvas.frame = 115;
    globalThis.app = window.app;

    resizeNodeToImageAspect(hub, { naturalWidth: 400, naturalHeight: 300 });

    expect(hub.size[1]).toBe(270);
    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBeFalsy();
    expect(diffusion.pos[1]).toBe(hub.pos[1]);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(hub.size[1]);
    expect(right.pos[1]).toBe(hub.pos[1]);
    expect(right.size[1]).toBe(hub.size[1]);

    hub.layout.regions.imageRegion = { w: 300, h: 230 };
    resizeNodeToImageAspect(hub, { naturalWidth: 300, naturalHeight: 400 });

    expect(hub.size[1]).toBe(440);
    expect(diffusion.properties.contentCollapsed).toBeFalsy();
    expect(sampler.properties.contentCollapsed).toBeFalsy();
    expect(latent.properties.contentCollapsed).toBeFalsy();
    expect(diffusion.pos[1]).toBe(hub.pos[1]);
    expect(latent.pos[1] + latent.size[1]).toBe(hub.pos[1] + hub.size[1]);
    expect(diffusion.size[1] + sampler.size[1] + latent.size[1]).toBe(hub.size[1]);
    expect(right.pos[1]).toBe(hub.pos[1]);
    expect(right.size[1]).toBe(hub.size[1]);
  });

  it('primes side-vertical branch members when Deck frame corner resize starts from a branch member', () => {
    const originalCanvas = window.app.canvas.canvas;
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    window.app.canvas.canvas = canvas;
    let latent = null;

    try {
      const hub = makeImageDeck(77, 200, 300, 420);
      const diffusion = markViewportNode(makeNode(78, 100, 100, 160), 'regionDiffusionDeck', 40);
      const sampler = markViewportNode(makeNode(79, 100, 100, 220), 'regionSamplerDeck', 40);
      latent = makeNode(80, 100, 100, 40);

      hub.properties.deckEdges.left = diffusion.id;
      diffusion.properties.deckParentId = hub.id;
      diffusion.properties.deckDockSide = 'left';
      diffusion.properties.deckEdges.right = hub.id;
      diffusion.properties.deckEdges.bottom = sampler.id;
      sampler.properties.deckParentId = diffusion.id;
      sampler.properties.deckDockSide = 'bottom';
      sampler.properties.deckEdges.top = diffusion.id;
      sampler.properties.deckEdges.bottom = latent.id;
      latent.properties.deckParentId = sampler.id;
      latent.properties.deckDockSide = 'bottom';
      latent.properties.deckEdges.top = sampler.id;
      latent.properties.contentCollapsed = true;

      [diffusion, sampler, latent].forEach((member) => {
        member.layout.contentMinHeight = member.properties.contentCollapsed ? 20 : 40;
        member.layout.totalHeight = member.size[1];
      });

      const graph = { _nodes: [hub, diffusion, sampler, latent] };
      window.app.graph = graph;
      window.app.canvas.frame = 16;
      globalThis.app = window.app;

      applyDeckPressureLayout(hub, graph, 10);
      createDerpShield(latent);
      syncDerpShield(latent);

      const handle = latent.interactionShield._resizeHandleLeft;
      expect(handle.style.display).toBe('block');

      handle.onpointerdown({
        button: 0,
        currentTarget: handle,
        pointerId: 1,
        clientX: 100,
        clientY: 420,
        stopPropagation: () => {},
        preventDefault: () => {},
      });

      expect(hub._isDerpResizing).toBe(true);
      expect(diffusion._isDerpResizing).toBe(true);
      expect(sampler._isDerpResizing).toBe(true);
      expect(latent._isDerpResizing).toBe(true);
      expect(diffusion._dockResizePreserveHeight).toBe(true);
      expect(sampler._dockResizePreserveHeight).toBe(true);
      expect(latent._dockResizePreserveHeight).toBe(true);
    } finally {
      if (latent) removeDerpShield(latent);
      window.app.canvas.canvas = originalCanvas;
    }
  });

  it('primes every side-vertical branch member when lower seam resize starts', () => {
    const originalCanvas = window.app.canvas.canvas;
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    Object.defineProperty(canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 600, configurable: true });
    window.app.canvas.canvas = canvas;
    let middle = null;

    try {
      const hub = makeImageDeck(53, 200, 300, 320);
      const top = makeNode(54, 100, 100, 120);
      middle = makeNode(55, 100, 100, 100);
      const bottom = makeNode(56, 100, 100, 90);

      hub.properties.deckEdges.left = top.id;
      top.properties.deckParentId = hub.id;
      top.properties.deckDockSide = 'left';
      top.properties.deckEdges.right = hub.id;
      top.properties.deckEdges.bottom = middle.id;
      middle.properties.deckParentId = top.id;
      middle.properties.deckDockSide = 'bottom';
      middle.properties.deckEdges.top = top.id;
      middle.properties.deckEdges.bottom = bottom.id;
      bottom.properties.deckParentId = middle.id;
      bottom.properties.deckDockSide = 'bottom';
      bottom.properties.deckEdges.top = middle.id;

      const graph = { _nodes: [hub, top, middle, bottom] };
      window.app.graph = graph;
      window.app.canvas.frame = 11;
      globalThis.app = window.app;

      applyDeckPressureLayout(hub, graph, 10);
      createDerpShield(middle);
      syncDerpShield(middle);

      const handle = middle.interactionShield._resizeHandle;
      expect(handle._resizeAnchorOverride).toBe('bottom');

      handle.onpointerdown({
        button: 0,
        currentTarget: handle,
        pointerId: 1,
        clientX: 140,
        clientY: 220,
        stopPropagation: () => {},
        preventDefault: () => {},
      });

      expect(top._isDerpResizing).toBe(true);
      expect(middle._isDerpResizing).toBe(true);
      expect(bottom._isDerpResizing).toBe(true);
      expect(top._dockResizePreserveHeight).toBe(true);
      expect(middle._dockResizePreserveHeight).toBe(true);
      expect(bottom._dockResizePreserveHeight).toBe(true);
    } finally {
      if (middle) removeDerpShield(middle);
      window.app.canvas.canvas = originalCanvas;
    }
  });

});
