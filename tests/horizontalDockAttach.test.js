import { describe, expect, it } from 'vitest';

import { syncHorizontalDeckHeight } from '../js/fatha/core/fathaHandler.js';
import { deckNodeToLeader } from '../js/fatha/core/masterDockEngine.js';

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
    setDirtyCanvas: () => {},
    refreshNodeLayoutMap: () => {},
    requestDerpSync: () => {},
    syncUncleSlots: () => {},
    settleBeforeDockSnap: () => {},
    settleAfterDockWidthMatch: () => {},
    getDerpVars: () => ({ SNAP: 10, autoWidth: false, autoHeight: false }),
  };
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
});
