import { describe, expect, it } from 'vitest';

import {
  FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH,
  FATHA_CONTENT_SCROLLBAR_GUTTER_WIDTH,
  preserveContentViewportClipHeightsForResize,
} from '../js/fatha/core/fathaContentViewport.js';
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
  it('keeps viewport scrollbar gutter out of node minimum width', () => {
    const owner = makeOwner();
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    expect(layout.intrinsicContentMinWidth).toBe(100);
    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(100);
    expect(layout.regions.panelBackground.w).toBe(100);
    expect(FATHA_CONTENT_SCROLLBAR_GUTTER_WIDTH).toBeGreaterThan(FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH);
    expect(owner._contentViewportState.mainContentRegion.gutter).toBe(FATHA_CONTENT_SCROLLBAR_GUTTER_WIDTH);
    expect(owner._contentViewportState.mainContentRegion.rect.w).toBe(100 - FATHA_CONTENT_SCROLLBAR_GUTTER_WIDTH);

    owner.size[1] = 130;
    owner.properties.nodeSize[1] = 130;
    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, false);

    expect(layout.intrinsicContentMinWidth).toBe(100);
    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(100);
    expect(layout.regions.panelBackground.w).toBe(100);
  });

  it('uses existing right-side node margin as the scrollbar lane', () => {
    const owner = makeOwner(112, 120);
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    const state = owner._contentViewportState.mainContentRegion;
    const trackX = state.rect.x + state.rect.w + ((state.gutter - FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH) / 2);
    const trackRight = trackX + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH;

    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(112);
    expect(state.rect.w).toBe(100);
    expect(state.gutter).toBe(12);
    expect(trackX - (state.rect.x + state.rect.w)).toBe(112 - trackRight);
  });

  it('does not widen an existing narrow right margin to the fallback gutter', () => {
    const owner = makeOwner(104, 120);
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    const state = owner._contentViewportState.mainContentRegion;
    const trackX = state.rect.x + state.rect.w + ((state.gutter - FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH) / 2);
    const trackRight = trackX + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH;

    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(104);
    expect(state.rect.w).toBe(100);
    expect(state.gutter).toBe(4);
    expect(trackX - (state.rect.x + state.rect.w)).toBe(104 - trackRight);
  });

  it('preserves viewport clip height during Deck Pressure side-width resize', () => {
    const owner = makeOwner();
    owner._horizontalDeckWidthResizeLock = true;
    owner._deckPressureSideResizeMember = true;
    owner._contentViewportState = {
      mainContentRegion: {
        clipHeight: 50,
        gutter: 2,
      },
    };
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();
    map.mainContentRegion.clipHeight = 100;

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    expect(owner._contentViewportState.mainContentRegion.clipHeight).toBe(50);
    expect(layout.regions.mainContentRegion.h).toBe(50);
  });

  it('preserves viewport clip height during post-resize settlement', () => {
    const owner = makeOwner();
    owner._contentViewportState = {
      mainContentRegion: {
        key: 'mainContentRegion',
        clipHeight: 50,
      },
    };
    preserveContentViewportClipHeightsForResize(owner);
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();
    map.mainContentRegion.clipHeight = 100;

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    expect(owner._contentViewportState.mainContentRegion.clipHeight).toBe(50);
    expect(layout.regions.mainContentRegion.h).toBe(50);
  });
});
