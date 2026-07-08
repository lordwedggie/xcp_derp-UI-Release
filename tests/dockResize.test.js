import { describe, expect, it } from 'vitest';

import { resolveHorizontalSeamResizeWidths, syncDockResizePair } from '../js/fatha/core/dockResize.js';
import { getActiveVerticalDeckWidthLock } from '../js/fatha/core/dockDimensions.js';
import { handleNodeResize } from '../js/fatha/core/fathaNodeResize.js';

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
});
