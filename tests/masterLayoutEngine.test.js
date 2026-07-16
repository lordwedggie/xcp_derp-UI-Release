import { describe, expect, it } from 'vitest';

import {
  FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH,
  FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT,
  FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT,
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
    const expectedGutter = FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH + FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT;
    expect(expectedGutter).toBeGreaterThan(FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH);
    expect(owner._contentViewportState.mainContentRegion.gutter).toBe(expectedGutter);
    expect(owner._contentViewportState.mainContentRegion.rect.w).toBe(100 - expectedGutter);

    owner.size[1] = 130;
    owner.properties.nodeSize[1] = 130;
    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, false);

    expect(layout.intrinsicContentMinWidth).toBe(100);
    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(100);
    expect(layout.regions.panelBackground.w).toBe(100);
  });

  it('carves scrollbar lane from content regardless of outer margin', () => {
    const owner = makeOwner(112, 120);
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    const state = owner._contentViewportState.mainContentRegion;
    const expectedGutter = FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH + FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT;

    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(112);
    expect(state.rect.w).toBe(100 - expectedGutter);
    expect(state.gutter).toBe(expectedGutter);
  });

  it('carves scrollbar lane from content when outer margin is narrow', () => {
    const owner = makeOwner(104, 120);
    const layout = new masterLayoutEngine(owner);
    const map = makeViewportMap();

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    const state = owner._contentViewportState.mainContentRegion;
    const expectedGutter = FATHA_CONTENT_SCROLLBAR_MARGIN_LEFT + FATHA_CONTENT_SCROLLBAR_BACKGROUND_WIDTH + FATHA_CONTENT_SCROLLBAR_MARGIN_RIGHT;

    expect(layout.contentMinWidth).toBe(100);
    expect(layout.totalWidth).toBe(104);
    expect(state.rect.w).toBe(100 - expectedGutter);
    expect(state.gutter).toBe(expectedGutter);
  });

  it('keeps explicit match-width row buttons square and contained after scrollbar gutter carving', () => {
    const owner = makeOwner(100, 120);
    const layout = new masterLayoutEngine(owner);
    const map = {
      mainContentRegion: {
        width: 100,
        height: 'auto',
        scrollViewport: true,
        clipHeight: 28,
        dir: 'col',
        deckRow_0: {
          dir: 'row',
          width: 'full',
          height: 'auto',
          modelToggle_0: {
            type: 'derpToggleV2',
            text: 'model.safetensors',
            width: 'full',
            height: 'auto',
            padding: [4, 4],
          },
          btnRemove_0: {
            type: 'btnIcon',
            icon: 'close',
            width: 'match',
            height: 20,
            margin: [1, 1, 1, 1],
          },
        },
        deckRow_1: {
          dir: 'row',
          width: 'full',
          height: 'auto',
          modelToggle_1: {
            type: 'derpToggleV2',
            text: 'other.safetensors',
            width: 'full',
            height: 'auto',
            padding: [4, 4],
          },
        },
      },
    };

    layout.compute({ x: 0, y: 0, w: owner.size[0], h: owner.size[1] }, map, { isVirtual: true }, true);

    expect(owner._contentViewportState.mainContentRegion.hasOverflow).toBe(true);
    expect(layout.regions.btnRemove_0.x + layout.regions.btnRemove_0.w + layout.regions.btnRemove_0.margin[2])
      .toBeLessThanOrEqual(layout.regions.deckRow_0.x + layout.regions.deckRow_0.w);
    expect(layout.regions.btnRemove_0.y).toBeCloseTo(
      layout.regions.deckRow_0.y + ((layout.regions.deckRow_0.h - layout.regions.btnRemove_0.h) / 2),
      5
    );
    expect(layout.regions.btnRemove_0.y).toBeGreaterThanOrEqual(layout.regions.deckRow_0.y);
    expect(layout.regions.btnRemove_0.y + layout.regions.btnRemove_0.h)
      .toBeLessThanOrEqual(layout.regions.deckRow_0.y + layout.regions.deckRow_0.h);
    expect(layout.regions.btnRemove_0.w).toBe(20);
    expect(layout.regions.btnRemove_0.h).toBe(20);
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
