import { describe, expect, it } from 'vitest';

import { masterLayoutEngine } from '../js/fatha/core/masterLayoutEngine.js';

const ROW_H = 28;
const GAP = 6;

function makeOwner(width = 220, height = 300) {
  return {
    size: [width, height],
    properties: {
      autoWidth: false,
      autoHeight: false,
      nodeSize: [width, height],
      debugMode: 'None',
      drawHeader: true,
      snapHeight: false,
      footerHeight: 6 + GAP,
    },
    _layoutMapHash: 'loader-anchor-viewport-repro',
    getDerpVars: () => ({ SNAP: 10, autoWidth: false, autoHeight: false, mH: GAP }),
  };
}

function resolveClipHeight(node, region, regions = {}) {
  const rows = Object.values(regions).filter((r) => r.parentKey === 'regionDiffusionDeck');
  if (!rows.length) return 0;
  const fullContentHeight = Math.max(...rows.map((r) => (r.y - region.y) + r.h));
  const regionY = Number(region?.y) || 0;
  const loaderTop = Number(regions.loaderRegion?.y);
  const nodeH = Number(node?.size?.[1] || 0);
  const physicalAvailable = nodeH > 0 ? nodeH - regionY - GAP : 0;
  let available = loaderTop > regionY ? loaderTop - regionY - GAP : 0;
  if (physicalAvailable > 0) available = available > 0 ? Math.min(available, physicalAvailable) : physicalAvailable;
  if (!(available > 0)) available = physicalAvailable;
  if (!(available > 0)) return ROW_H;
  return Math.max(ROW_H, Math.min(fullContentHeight, available));
}

function makeLoaderMap(rowCount) {
  const deckRows = {};
  for (let i = 0; i < rowCount; i++) {
    deckRows[`diffusionRow_${i}`] = { width: 'full', height: ROW_H, margin: [0, 0, 0, 4] };
  }
  return {
    headerRegion: { width: 'full', height: 24, dir: 'row' },
    deckAndSpringRegion: {
      anchor: { target: 'headerRegion', axis: 'y' },
      width: 'full', height: 'fill', dir: 'col',
      margin: [GAP, GAP, GAP, 0],
      regionDiffusionDeck: {
        width: 'full', height: 'auto', dir: 'col', spacing: [0, 4],
        scrollViewport: true,
        clipHeight: resolveClipHeight,
        margin: [0, 0, 0, GAP],
        ...deckRows,
      },
      springRegion: { width: 'full', height: 'fill', minHeight: 0 },
    },
    loaderRegion: {
      width: 'full', height: 'auto', dir: 'col',
      margin: [GAP, 0, GAP, 0],
      pickerRow: { width: 'full', height: ROW_H },
    },
  };
}

describe('loader anchored-fill + viewport bottom pinning', () => {
  it('keeps the loader row bottom-pinned when the deck viewport overflows', () => {
    const owner = makeOwner(220, 300);
    const layout = new masterLayoutEngine(owner);
    layout.compute({ x: 0, y: 0, w: 220, h: 300 }, makeLoaderMap(10), { isVirtual: true }, true);

    const loader = layout.regions.loaderRegion;
    const deck = layout.regions.regionDiffusionDeck;
    const container = layout.regions.deckAndSpringRegion;
    console.log('[repro] nodeH=300 loader.y=', loader.y, 'loader.h=', loader.h,
      'deck.y=', deck.y, 'deck.h=', deck.h,
      'container.y=', container.y, 'container.h=', container.h,
      'containerBottom=', container.y + container.h,
      'viewportState=', JSON.stringify(owner._contentViewportState?.regionDiffusionDeck));

    // Loader should be bottom-pinned: its bottom should sit near the node bottom.
    expect(loader.y + loader.h).toBeGreaterThan(300 - 40);
  });

  it('tracks the bottom across sequential heights (seam-resize simulation)', () => {
    const owner = makeOwner(220, 300);
    const layout = new masterLayoutEngine(owner);
    const map = makeLoaderMap(10);
    const heights = [300, 280, 260, 240, 260, 280, 320, 340];
    for (const h of heights) {
      owner.size[1] = h;
      owner.properties.nodeSize[1] = h;
      layout.compute({ x: 0, y: 0, w: 220, h }, map, { isVirtual: true }, false);
      const loader = layout.regions.loaderRegion;
      console.log(`[repro] nodeH=${h} loader.y=${loader.y} loaderBottom=${loader.y + loader.h} deckH=${layout.regions.regionDiffusionDeck.h}`);
      expect(loader.y + loader.h).toBeGreaterThan(h - 40);
    }
  });

  it('reports contentMinHeight vs node height (draw-loop floor fight check)', () => {
    const owner = makeOwner(220, 300);
    const layout = new masterLayoutEngine(owner);
    const map = makeLoaderMap(10);
    const heights = [340, 300, 260, 200, 160, 120];
    for (const h of heights) {
      owner.size[1] = h;
      owner.properties.nodeSize[1] = h;
      layout.compute({ x: 0, y: 0, w: 220, h }, map, { isVirtual: true }, true);
      const contentMinH = layout.contentMinHeight || 0;
      const totalH = layout.totalHeight || 0;
      const rawH = contentMinH || totalH || 40;
      const engineFloorH = Math.ceil(rawH / 10) * 10;
      const storedH = Number(owner.properties.nodeSize?.[1]) || 0;
      const liveH = Number(owner.size?.[1]) || 0;
      // resolveRuntimeDockSize height for a vertical member with runtime autoHeight=false:
      const drawTargetH = Math.max(storedH || liveH || 0, engineFloorH);
      console.log(`[floor] nodeH=${h} contentMinHeight=${contentMinH} totalHeight=${totalH} engineFloorH=${engineFloorH} drawTargetH=${drawTargetH} FIGHT=${drawTargetH > h}`);
    }
  });
});
