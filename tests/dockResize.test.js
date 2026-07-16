import { describe, expect, it } from 'vitest';

import { handleDerpComputeSizeImpl, resolveHorizontalDeckSharedHeightImpl, resolveHorizontalSeamResizeWidths, syncDockResizePair } from '../js/fatha/core/dockResize.js';
import { getActiveVerticalDeckWidthLock, getActiveVerticalNodeWidthLock } from '../js/fatha/core/dockDimensions.js';
import { handleNodeResize } from '../js/fatha/core/fathaNodeResize.js';
import { fatha } from '../js/fatha/fatha.js';
import { uncle } from '../js/fatha/uncle.js';

function makeNode(id, y, width = 100, height = 100) {
  return {
    id,
    isFathaNode: true,
    pos: [0, y],
    size: [width, height],
    properties: {
      autoWidth: false,
      autoHeight: false,
      nodeSize: [width, height],
      deckParentId: null,
      deckDockSide: null,
      deckEdges: { left: null, right: null, top: null, bottom: null },
    },
    layout: { regions: {}, contentMinHeight: 0, totalHeight: 0 },
    layoutMap: {},
    setDirtyCanvas: () => {},
    refreshNodeLayoutMap: () => {},
    requestDerpSync: () => {},
    syncUncleSlots: () => {},
    getDerpVars: () => ({ SNAP: 10, autoWidth: false, autoHeight: false }),
  };
}

function makeVerticalPair() {
  const top = makeNode(1, 0);
  const bottom = makeNode(2, 100);
  top.properties.deckEdges.bottom = bottom.id;
  bottom.properties.deckEdges.top = top.id;
  const graph = { _nodes: [top, bottom] };
  window.app.graph = graph;
  globalThis.app = window.app;
  return { top, bottom, graph };
}

function makeHorizontalPair() {
  const left = makeNode(1, 0);
  const right = makeNode(2, 0);
  right.pos[0] = 100;
  left.properties.deckEdges.right = right.id;
  right.properties.deckEdges.left = left.id;
  const graph = { _nodes: [left, right] };
  window.app.graph = graph;
  globalThis.app = window.app;
  return { left, right, graph };
}

function markFixedHeight(node) {
  node.properties.autoHeight = true;
  node.getDerpVars = () => ({ SNAP: 10, autoWidth: false, autoHeight: true });
}

function markFitHeight(node, minHeight = 40) {
  node.properties.autoHeight = false;
  node.layout.contentMinHeight = minHeight;
  node.layout.totalHeight = Math.max(node.size[1], minHeight);
}

function getHorizontalSpan(nodes) {
  const left = Math.min(...nodes.map((node) => node.pos[0]));
  const right = Math.max(...nodes.map((node) => node.pos[0] + node.size[0]));
  return right - left;
}

function makeDrawCtx() {
  return {
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    rect: () => {},
    clip: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: (text) => ({ width: String(text || '').length * 8 }),
    setLineDash: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
  };
}

describe('dock resize pair math', () => {
  it('snaps the preserved horizontal seam total before calculating the counterpart width', () => {
    const result = resolveHorizontalSeamResizeWidths(105, 100, 90, 60, 60, 10);

    expect(result).toEqual({
      draggedWidth: 90,
      counterpartWidth: 110,
      totalWidth: 200,
    });
  });

  it('keeps already snapped horizontal seam totals unchanged', () => {
    const result = resolveHorizontalSeamResizeWidths(110, 100, 100, 60, 60, 10);

    expect(result).toEqual({
      draggedWidth: 100,
      counterpartWidth: 110,
      totalWidth: 210,
    });
  });
});

describe('dock resize live shield sync', () => {
  it('marks vertical stack outer height drags as live resize', () => {
    const { bottom } = makeVerticalPair();
    bottom._dockResizeRequestedDeltaH = 30;

    const result = syncDockResizePair(bottom, 'bottom', 100, 130, 40, 40, 10);

    expect(result.handledHeight).toBe(true);
    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
  });

  it('marks vertical seam height drags as live resize', () => {
    const { top, bottom } = makeVerticalPair();

    const result = syncDockResizePair(top, 'bottom', 100, 130, 40, 40, 10);

    expect(result.handledHeight).toBe(true);
    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
    expect(top.size[1]).toBe(130);
    expect(bottom.size[1]).toBe(70);
  });

  it('keeps saturated vertical seam drags on the live resize path', () => {
    const { top, bottom } = makeVerticalPair();
    top.size[1] = 60;
    top.properties.nodeSize[1] = 60;
    top.layout.contentMinHeight = 100;
    top.layout.totalHeight = 100;
    bottom.pos[1] = 60;
    bottom.size[1] = 60;
    bottom.properties.nodeSize[1] = 60;
    bottom.layout.contentMinHeight = 100;
    bottom.layout.totalHeight = 100;

    const result = syncDockResizePair(top, 'bottom', 100, 80, 40, 40, 10);

    expect(result.handledHeight).toBe(true);
    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
    expect(top.size[1]).toBe(60);
    expect(bottom.size[1]).toBe(60);
  });

  it('keeps vertical seam height drags pinned to the starting stack width', () => {
    const { top, bottom } = makeVerticalPair();

    syncDockResizePair(top, 'bottom', 100, 130, 40, 40, 10);
    top.size[0] = 140;
    top.properties.nodeSize[0] = 140;
    top.layout.contentMinWidth = 140;

    const lockedWidth = getActiveVerticalDeckWidthLock([top, bottom], 140);
    const result = syncDockResizePair(top, 'bottom', 140, 120, 40, 40, 10);

    expect(lockedWidth).toBe(100);
    expect(result.liveResize).toBe(true);
    expect(top.size[0]).toBe(100);
    expect(bottom.size[0]).toBe(100);
  });

  it('keeps repeated outer height drags pinned to the session-start min width', () => {
    const { top, bottom } = makeVerticalPair();

    top.size[0] = 140;
    top.properties.nodeSize[0] = 140;
    top.layout.contentMinWidth = 140;
    bottom.size[0] = 140;
    bottom.properties.nodeSize[0] = 140;
    bottom.layout.contentMinWidth = 140;

    const first = syncDockResizePair(bottom, 'bottom', 140, 130, 40, 40, 10);

    top.size[0] = 160;
    top.properties.nodeSize[0] = 160;
    top.layout.contentMinWidth = 160;
    bottom.size[0] = 160;
    bottom.properties.nodeSize[0] = 160;
    bottom.layout.contentMinWidth = 160;

    const lockedWidth = getActiveVerticalDeckWidthLock([top, bottom], 160);
    const second = syncDockResizePair(bottom, 'bottom', 160, 120, 40, 40, 10);

    expect(first.liveResize).toBe(true);
    expect(lockedWidth).toBe(140);
    expect(second.liveResize).toBe(true);
    expect(top.size[0]).toBe(140);
    expect(bottom.size[0]).toBe(140);
  });

  it('keeps corner height-only drags pinned when one member measures wider mid-resize', () => {
    const { top, bottom } = makeVerticalPair();

    const first = syncDockResizePair(bottom, 'bottom-right', 100, 130, 40, 40, 10);

    top.size[0] = 140;
    top.properties.nodeSize[0] = 140;
    top.layout.contentMinWidth = 140;

    const lockedWidth = getActiveVerticalDeckWidthLock([top, bottom], 140);
    const second = syncDockResizePair(bottom, 'bottom-right', 100, 120, 40, 40, 10);

    expect(first.liveResize).toBe(true);
    expect(lockedWidth).toBe(100);
    expect(second.liveResize).toBe(true);
    expect(top.size[0]).toBe(100);
    expect(bottom.size[0]).toBe(100);
  });

  it('does not let first-pass contentMinWidth growth widen a vertical stack corner height drag', () => {
    const { top, bottom } = makeVerticalPair();
    top.layout.contentMinWidth = 140;
    bottom._startPos = [0, 100];
    bottom._startSize = [100, 100];

    handleNodeResize(bottom, { dx: 0, dy: 30, resizeAnchor: 'bottom-right' }, 1);

    expect(top.size[0]).toBe(100);
    expect(bottom.size[0]).toBe(100);
    expect(top.size[1] + bottom.size[1]).toBe(230);
  });

  it('keeps growing width during repeated diagonal vertical stack corner drags', () => {
    const { top, bottom } = makeVerticalPair();

    syncDockResizePair(bottom, 'bottom-right', 130, 130, 40, 40, 10);
    const result = syncDockResizePair(bottom, 'bottom-right', 150, 140, 40, 40, 10);

    expect(result.handledWidth).toBe(true);
    expect(result.handledHeight).toBe(true);
    expect(top.size[0]).toBe(150);
    expect(bottom.size[0]).toBe(150);
    expect(getActiveVerticalDeckWidthLock([top, bottom], 40)).toBe(150);
  });

  it('lets width-only corner drags override a previous height-only width lock', () => {
    const { top, bottom } = makeVerticalPair();

    syncDockResizePair(bottom, 'bottom-right', 100, 130, 40, 40, 10);
    const result = syncDockResizePair(bottom, 'bottom-right', 140, bottom.size[1], 40, 40, 10);

    expect(result.handledWidth).toBe(true);
    expect(result.handledHeight).toBe(false);
    expect(top.size[0]).toBe(140);
    expect(bottom.size[0]).toBe(140);
    expect(getActiveVerticalDeckWidthLock([top, bottom], 40)).toBe(140);
  });

  it('uses active vertical width locks instead of transient node width during resize measurement', () => {
    const node = makeNode(3, 0, 160, 100);
    node.layout.contentMinWidth = 180;
    node._isDerpResizing = true;
    node._dockResizePreserveHeight = true;
    node._verticalDeckWidthLock = 100;
    node._verticalDeckWidthLockUntil = (performance.now?.() || Date.now()) + 1200;
    node._verticalDeckWidthLockExact = true;

    const out = [];
    handleDerpComputeSizeImpl(node, out, 40);

    expect(getActiveVerticalNodeWidthLock(node, 180)).toBe(100);
    expect(out[0]).toBe(100);
  });

  it('keeps Uncle nodes pinned to vertical stack live resize dimensions during draw', () => {
    class TestUncleNode {}
    uncle(TestUncleNode, {}, 40);
    const node = new TestUncleNode();
    node.id = 30;
    node.type = 'xcpDerpUncleTest';
    node.mode = 0;
    node.pos = [0, 0];
    node.size = [100, 120];
    node.properties = {
      autoWidth: true,
      autoHeight: true,
      contentCollapsed: false,
      nodeSize: [100, 120],
      showInputs: false,
      showOutputs: false,
      useAnimations: false,
    };
    node.inputs = [];
    node.outputs = [];
    node.layout = {
      contentMinWidth: 180,
      contentMinHeight: 160,
      totalHeight: 160,
      regions: {},
      compute: () => {},
    };
    node.getDerpVars = () => ({ SNAP: 10, autoWidth: true, autoHeight: true });
    node.setDirtyCanvas = () => {};
    node.requestDerpSync = () => {};
    node.suppressDefaultWidgets = () => {};
    node.syncUncleSlots = () => {};
    node.drawUncleSlots = () => {};
    node.refreshNodeLayoutMap = () => {};
    node._isDerpResizing = true;
    node._dockResizePreserveHeight = true;
    node._verticalDeckWidthLock = 100;
    node._verticalDeckWidthLockUntil = (performance.now?.() || Date.now()) + 1200;
    node._verticalDeckWidthLockExact = true;

    node.onDrawForeground(makeDrawCtx());

    expect(node.size).toEqual([100, 120]);
    expect(node.properties.nodeSize).toEqual([100, 120]);
  });

  it('keeps Fatha nodes pinned to vertical stack live resize dimensions during draw', () => {
    class TestFathaNode {}
    fatha(TestFathaNode, {}, 40);
    const node = new TestFathaNode();
    node.id = 31;
    node.type = 'xcpDerpFathaTest';
    node.mode = 0;
    node.pos = [0, 0];
    node.size = [100, 120];
    node.flags = {};
    node.properties = {
      autoWidth: true,
      autoHeight: true,
      contentCollapsed: false,
      nodeSize: [100, 120],
      showInputs: false,
      showOutputs: false,
      useAnimations: false,
    };
    node.inputs = [];
    node.outputs = [];
    node.layout = {
      contentMinWidth: 180,
      contentMinHeight: 160,
      totalHeight: 160,
      regions: {},
      compute: () => {},
    };
    node.getDerpVars = () => ({ SNAP: 10, autoWidth: true, autoHeight: true });
    node.setDirtyCanvas = () => {};
    node.requestDerpSync = () => {};
    node.refreshNodeLayoutMap = () => {};
    node._isDerpResizing = true;
    node._dockResizePreserveHeight = true;
    node._verticalDeckWidthLock = 100;
    node._verticalDeckWidthLockUntil = (performance.now?.() || Date.now()) + 1200;
    node._verticalDeckWidthLockExact = true;

    node.onDrawForeground(makeDrawCtx());

    expect(node.size).toEqual([100, 120]);
    expect(node.properties.nodeSize).toEqual([100, 120]);
  });

  it('lets vertical stack corner drags change width and height in the same pass', () => {
    const { top, bottom } = makeVerticalPair();

    const result = syncDockResizePair(bottom, 'bottom-right', 140, 130, 40, 40, 10);

    expect(result.handledWidth).toBe(true);
    expect(result.handledHeight).toBe(true);
    expect(result.handledAll).toBe(true);
    expect(result.liveResize).toBe(true);
    expect(top.size[0]).toBe(140);
    expect(bottom.size[0]).toBe(140);
    expect(top.size[1] + bottom.size[1]).toBe(230);
  });

  it('keeps the right edge pinned for diagonal left-corner vertical stack resize', () => {
    const { top, bottom } = makeVerticalPair();
    bottom._startPos = [0, 100];
    bottom._startSize = [100, 100];

    handleNodeResize(bottom, { dx: -40, dy: 30, resizeAnchor: 'bottom-left' }, 1);

    expect(top.pos[0]).toBe(-40);
    expect(bottom.pos[0]).toBe(-40);
    expect(top.size[0]).toBe(140);
    expect(bottom.size[0]).toBe(140);
    expect(top.pos[0] + top.size[0]).toBe(100);
    expect(bottom.pos[0] + bottom.size[0]).toBe(100);
    expect(top.size[1] + bottom.size[1]).toBe(230);
  });

  it('uses full snap thresholds for horizontal stack corner width resize at zoomed-out scale', () => {
    const { left, right } = makeHorizontalPair();
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 7.5, dy: 0, resizeAnchor: 'bottom-right' }, 0.5);

    expect(getHorizontalSpan([left, right])).toBe(210);
    expect(left.size[0] + right.size[0]).toBe(210);
  });

  it('restores horizontal stack widths when a corner drag returns to the zero-snap band', () => {
    const { left, right } = makeHorizontalPair();
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: -15, dy: 0, resizeAnchor: 'bottom-right' }, 1);
    expect(getHorizontalSpan([left, right])).toBe(190);

    handleNodeResize(right, { dx: -9, dy: 0, resizeAnchor: 'bottom-right' }, 1);
    expect(getHorizontalSpan([left, right])).toBe(200);

    handleNodeResize(right, { dx: 10, dy: 0, resizeAnchor: 'bottom-right' }, 1);
    expect(getHorizontalSpan([left, right])).toBe(210);
  });

  it('blocks horizontal stack corner height resize when every member is fixed-height', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFixedHeight(right);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 0, dy: 40, resizeAnchor: 'bottom-right' }, 1);

    expect(left.size[1]).toBe(100);
    expect(right.size[1]).toBe(100);
  });

  it('allows horizontal stack corner height resize when one member is Fit Node height', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFitHeight(right, 70);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 0, dy: 40, resizeAnchor: 'bottom-right' }, 1);

    expect(left.size[1]).toBe(140);
    expect(right.size[1]).toBe(140);
    expect(left.pos[1]).toBe(0);
    expect(right.pos[1]).toBe(0);
  });

  it('clamps horizontal stack height resize to the Fit Node compact floor', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFitHeight(right, 70);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 0, dy: -100, resizeAnchor: 'bottom-right' }, 1);

    expect(left.size[1]).toBe(70);
    expect(right.size[1]).toBe(70);
  });

  it('keeps the bottom edge pinned for top-corner horizontal stack height resize', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFitHeight(right, 70);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 0, dy: -30, resizeAnchor: 'top-right' }, 1);

    expect(left.size[1]).toBe(130);
    expect(right.size[1]).toBe(130);
    expect(left.pos[1]).toBe(-30);
    expect(right.pos[1]).toBe(-30);
  });

  it('does not undo horizontal stack top-corner y when width delta returns to zero', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFitHeight(right, 70);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 10, dy: -30, resizeAnchor: 'top-right' }, 1);
    handleNodeResize(right, { dx: 0, dy: -40, resizeAnchor: 'top-right' }, 1);

    expect(left.size[1]).toBe(140);
    expect(right.size[1]).toBe(140);
    expect(left.pos[1]).toBe(-40);
    expect(right.pos[1]).toBe(-40);
  });

  it('keeps manual Fit Node row height after horizontal stack resize release', () => {
    const { left, right } = makeHorizontalPair();
    markFixedHeight(left);
    markFitHeight(right, 70);
    right._startPos = [100, 0];
    right._startSize = [100, 100];

    handleNodeResize(right, { dx: 0, dy: 40, resizeAnchor: 'bottom-right' }, 1);
    left._isDerpResizing = false;
    right._isDerpResizing = false;
    left._dockResizePreserveHeight = false;
    right._dockResizePreserveHeight = false;

    const sharedHeight = resolveHorizontalDeckSharedHeightImpl(right, {
      getDerpVars: (node) => node.getDerpVars(node),
    });

    expect(sharedHeight).toBe(140);
  });
});
