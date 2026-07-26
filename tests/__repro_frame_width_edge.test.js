import { describe, expect, it } from 'vitest';

import { handleNodeResize } from '../js/fatha/core/fathaNodeResize.js';
import { applyDeckPressureLayout, deckNodeToLeader, getDeckPressureBranchSideForNode, getDeckPressureHubForNode } from '../js/fatha/core/masterDockEngine.js';

function makeNode(id, x, y, width, height, minWidth = 0) {
  return {
    id,
    isFathaNode: true,
    pos: [x, y],
    size: [width, height],
    properties: {
      autoWidth: false,
      autoHeight: false,
      nodeSize: [width, height],
      deckParentId: null,
      deckDockSide: null,
      deckEdges: { left: null, right: null, top: null, bottom: null },
    },
    layout: { regions: {}, contentMinWidth: minWidth, contentMinHeight: 0, totalHeight: height },
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

function makeImageDeck(id, x, y, width, height) {
  const node = makeNode(id, x, y, width, height);
  node.type = 'xcpDerpImageDeck';
  node._isDerpImageDeckNode = true;
  return node;
}

function snap(label, hub, members) {
  return {
    label,
    hub: { x: hub.pos[0], y: hub.pos[1], w: hub.size[0], h: hub.size[1] },
    members: members.map((m) => ({ id: m.id, x: m.pos[0], y: m.pos[1], w: m.size[0], h: m.size[1] })),
  };
}

describe('repro: bottom-branch horizontal stack frame width edge (real dock)', () => {
  it('left and right edge drags resize the deck frame, not just the stack', () => {
    const hub = makeImageDeck(1, 200, 200, 300, 220);
    const a = makeNode(2, 200, 420, 150, 90);
    const b = makeNode(3, 350, 420, 150, 90);
    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 1;
    globalThis.app = window.app;

    expect(deckNodeToLeader(a, hub, graph, 'bottom')).toBe(true);
    applyDeckPressureLayout(hub, graph, 10);

    const diag = {
      hubFound: getDeckPressureHubForNode(a, graph)?.id ?? null,
      branchSideA: getDeckPressureBranchSideForNode(hub, graph, a),
      branchSideB: getDeckPressureBranchSideForNode(hub, graph, b),
      aDeckDockSide: a.properties.deckDockSide,
      aParent: a.properties.deckParentId,
      bDeckDockSide: b.properties.deckDockSide,
      bParent: b.properties.deckParentId,
    };
    const before = snap('before', hub, [a, b]);

    // LEFT edge of leftmost member
    a._startPos = [...a.pos];
    a._startSize = [...a.size];
    handleNodeResize(a, { dx: -40, dy: 0, resizeAnchor: 'left' }, 1);
    const afterLeft = snap('afterLeft', hub, [a, b]);

    // RIGHT edge of rightmost member
    b._startPos = [...b.pos];
    b._startSize = [...b.size];
    handleNodeResize(b, { dx: 30, dy: 0, resizeAnchor: 'right' }, 1);
    const afterRight = snap('afterRight', hub, [a, b]);

    console.log(JSON.stringify({ diag, before, afterLeft, afterRight }));

    expect(hub.pos[0]).toBe(before.hub.x - 40);
    expect(hub.size[0]).toBe(before.hub.w + 40 + 30);
    expect(a.pos[0]).toBe(before.members[0].x - 40);
    expect(a.size[0] + b.size[0]).toBe(before.hub.w + 40 + 30);
  });

  it('clamps frame shrink when the bottom row is already at min width', () => {
    const hub = makeImageDeck(1, 200, 200, 300, 220);
    // Members carry their min width from the start (150 + 150 = frame width),
    // so the pressure min-span cache never serves a pre-mutation floor.
    const a = makeNode(2, 200, 420, 150, 90, 150);
    const b = makeNode(3, 350, 420, 150, 90, 150);
    a.properties.deckEdges.right = b.id;
    b.properties.deckEdges.left = a.id;

    const graph = { _nodes: [hub, a, b] };
    window.app.graph = graph;
    window.app.canvas.frame = 1;
    globalThis.app = window.app;

    expect(deckNodeToLeader(a, hub, graph, 'bottom')).toBe(true);
    applyDeckPressureLayout(hub, graph, 10);

    const before = snap('before', hub, [a, b]);

    // Shrink intent on the left edge: the hub must not move right or shrink.
    a._startPos = [...a.pos];
    a._startSize = [...a.size];
    handleNodeResize(a, { dx: 30, dy: 0, resizeAnchor: 'left' }, 1);

    // Shrink intent on the right edge: the hub must not shrink either.
    b._startPos = [...b.pos];
    b._startSize = [...b.size];
    handleNodeResize(b, { dx: -30, dy: 0, resizeAnchor: 'right' }, 1);

    console.log(JSON.stringify({ before, after: snap('after', hub, [a, b]) }));

    expect(hub.pos[0]).toBe(before.hub.x);
    expect(hub.size[0]).toBe(before.hub.w);
    expect(a.pos[0]).toBe(before.members[0].x);
    expect(a.size[0] + b.size[0]).toBe(before.hub.w);
  });
});
