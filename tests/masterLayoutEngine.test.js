import { describe, expect, it } from 'vitest';

import { masterLayoutEngine } from '../js/fatha/core/masterLayoutEngine.js';

function makeOwner(width = 100, height = 120) {
  return {
    size: [width, height],
    properties: {
      autoWidth: false,
      autoHeight: false,
      nodeSize: [width, height],
      debugMode: 'None',
      drawHeader: false,
      snapHeight: false,
    },
    _layoutMapHash: 'viewport-gutter-regression',
    getDerpVars: () => ({ SNAP: 10, autoWidth: false, autoHeight: false }),
  };
}

function makeViewportMap() {
  return {
    mainContentRegion: {
      width: 100,
      height: 100,
      scrollViewport: true,
      clipHeight: 50,
      dir: 'col',
      loraRow_0: { width: 100, height: 40 },
      loraRow_1: { width: 100, height: 40 },
    },
  };
}

describe('masterLayoutEngine content viewport sizing', () => {
  it('does not compound viewport gutter into cached intrinsic width', () => {
    const owner = makeOwner();
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    expect(layout.intrinsicContentMinWidth).toBe(100);
    expect(layout.contentMinWidth).toBe(102);

    owner.size[1] = 130;
    owner.properties.nodeSize[1] = 130;
    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, false);

    expect(layout.intrinsicContentMinWidth).toBe(100);
    expect(layout.contentMinWidth).toBe(102);
  });
});
