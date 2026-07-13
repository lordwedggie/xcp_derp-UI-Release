import { describe, expect, it } from 'vitest';

import { getDeckPressureSideHorizontalLockedWidth, getDerpVars, shouldLockDeckPressureSideHorizontalWidth, syncHorizontalDeckHeight } from '../js/fatha/core/fathaHandler.js';
import { resolveDerpPreferredAutoWidth } from '../js/fatha/core/derpHeightPolicy.js';
import { canResizeDeckPressureSideWidthMember, canResizeHorizontalMemberWidth } from '../js/fatha/core/dockResizeSharedEdges.js';
import { syncDockResizePair } from '../js/fatha/core/dockResize.js';
import { createDerpShield, removeDerpShield, syncDerpShield } from '../js/fatha/core/fathaDOMshield.js';
import { applyDeckPressureLayout, deckNodeToLeader, getDeckPressureSideHorizontalWidthLock, normalizeDockPair } from '../js/fatha/core/masterDockEngine.js';

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
