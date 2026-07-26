import { describe, expect, it } from 'vitest';

import {
  applyDeckPressureLayout,
  deckNodeToLeader,
  getDeckPressureBranchSideForNode,
  getDeckPressureHubForNode,
  undeckDeckPressureBranches,
} from '../js/fatha/core/masterDockEngine.js';

function makeNode(id, x, y, width, height, opts = {}) {
  const autoHeight = opts.autoHeight === true;
  const autoWidth = opts.autoWidth === true;
  return {
    id,
    isFathaNode: true,
    pos: [x, y],
    size: [width, height],
    properties: {
      autoWidth,
      autoHeight,
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
    getDerpVars: () => ({ SNAP: 10, autoWidth, autoHeight }),
  };
}

function makeImageDeck(id, x, y, width, height) {
  const node = makeNode(id, x, y, width, height);
  node.type = 'xcpDerpImageDeck';
  node._isDerpImageDeckNode = true;
  return node;
}

function snap(label, members) {
  return {
    label,
    members: members.map((m) => ({ id: m.id, w: m.size[0], h: m.size[1], autoH: m.properties.autoHeight, autoW: m.properties.autoWidth })),
  };
}

describe('repro: vertical stack resumes pre-deck sizes on undock', () => {
  it('restores manual-height members to their pre-deck pixel heights after undeckDeckPressureBranches', () => {
    const hub = makeImageDeck(1, 200, 200, 300, 400);
    // Two manual-height nodes stacked vertically (top/bottom edges).
    const a = makeNode(2, 100, 200, 120, 100);  // 100px tall, manual
    const b = makeNode(3, 100, 300, 120, 120);  // 120px tall, manual
    a.properties.deckEdges.bottom = b.id;
    b.properties.deckEdges.top = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 1;
    globalThis.app = window.app;

    // Dock the vertical stack to the LEFT of the hub.
    expect(deckNodeToLeader(a, hub, graph, 'left')).toBe(true);
    applyDeckPressureLayout(hub, graph, 10);

    // Sanity: the stack is now a left branch of the hub.
    expect(getDeckPressureHubForNode(a, graph)?.id).toBe(hub.id);
    expect(getDeckPressureBranchSideForNode(hub, graph, a)).toBe('left');

    const beforeUndock = snap('beforeUndock', [a, b]);
    // Deck Pressure may have modified the heights; confirm the members are no
    // longer at their pre-deck heights (otherwise the test is a no-op).
    const deckChangedHeights = a.size[1] !== 100 || b.size[1] !== 120;
    expect(deckChangedHeights).toBe(true);

    // Undock all branches from the hub.
    const changed = undeckDeckPressureBranches(hub, graph);
    expect(changed).toBe(true);

    const afterUndock = snap('afterUndock', [a, b]);
    // The manual-height members should be restored to their pre-deck heights.
    expect(a.size[1]).toBe(100);
    expect(b.size[1]).toBe(120);
    // autoHeight should still be false (manual) — it was manual before dock.
    expect(a.properties.autoHeight).toBe(false);
    expect(b.properties.autoHeight).toBe(false);
    // The saved pixel properties should be cleaned up.
    expect(a.properties.deckSavedHeight).toBeUndefined();
    expect(b.properties.deckSavedHeight).toBeUndefined();
    expect(a.properties.deckSavedWidth).toBeUndefined();
    expect(b.properties.deckSavedWidth).toBeUndefined();
    // The pixel-restored flag should be cleared.
    expect(a._derpPixelSizesRestored).toBeUndefined();
    expect(b._derpPixelSizesRestored).toBeUndefined();
  });

  it('does not save pixel height for auto-height members (they re-measure from content)', () => {
    const hub = makeImageDeck(1, 200, 200, 300, 400);
    const a = makeNode(2, 100, 200, 120, 100, { autoHeight: true });
    const b = makeNode(3, 100, 300, 120, 120, { autoHeight: true });
    a.properties.deckEdges.bottom = b.id;
    b.properties.deckEdges.top = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 1;
    globalThis.app = window.app;

    expect(deckNodeToLeader(a, hub, graph, 'left')).toBe(true);
    applyDeckPressureLayout(hub, graph, 10);

    // Auto-height members should NOT have deckSavedHeight (only manual-mode
    // nodes get pixel saves; auto-mode nodes re-measure from content).
    expect(a.properties.deckSavedHeight).toBeUndefined();
    expect(b.properties.deckSavedHeight).toBeUndefined();

    // After undock, autoHeight should be restored to true.
    undeckDeckPressureBranches(hub, graph);
    expect(a.properties.autoHeight).toBe(true);
    expect(b.properties.autoHeight).toBe(true);
    // No pixel-restored flag (no pixel restoration happened).
    expect(a._derpPixelSizesRestored).toBeUndefined();
    expect(b._derpPixelSizesRestored).toBeUndefined();
  });
});
