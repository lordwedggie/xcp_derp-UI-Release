import { describe, expect, it } from 'vitest';

import {
  DIFFUSION_LOADER_MIN_DISPLAYED_MODEL_ENTRIES,
  getDiffusionLoaderDeckRows,
  resolveDiffusionLoaderDeckClipHeight,
  resolveDiffusionLoaderDeckMinClipHeight,
} from '../js/derps/loaders/derpDiffusionLoader.js';

function makeNode(height = 180) {
  return {
    size: [220, height],
    properties: { nodeSize: [220, height] },
    getDerpVars: () => ({ mH: 6 }),
  };
}

function makeRegions() {
  return {
    regionDiffusionDeck: { key: 'regionDiffusionDeck', y: 20, h: 120 },
    diffusionRow_1: { key: 'diffusionRow_1', parentKey: 'regionDiffusionDeck', y: 58, h: 28, margin: [0, 0, 0, 4] },
    diffusionRow_0: { key: 'diffusionRow_0', parentKey: 'regionDiffusionDeck', y: 20, h: 28, margin: [0, 0, 0, 4] },
    loaderRegion: { key: 'loaderRegion', y: 60, h: 42 },
  };
}

describe('derpDiffusionLoader manual-height deck viewport', () => {
  it('uses one displayed model entry as the viewport minimum', () => {
    const regions = makeRegions();
    const rows = getDiffusionLoaderDeckRows(regions);

    expect(DIFFUSION_LOADER_MIN_DISPLAYED_MODEL_ENTRIES).toBe(1);
    expect(rows.map(({ key }) => key)).toEqual(['diffusionRow_0', 'diffusionRow_1']);
    expect(resolveDiffusionLoaderDeckMinClipHeight(makeNode(), regions.regionDiffusionDeck, regions)).toBe(32);
  });

  it('clips to available manual height without going below one model entry', () => {
    const regions = makeRegions();

    expect(resolveDiffusionLoaderDeckClipHeight(makeNode(), regions.regionDiffusionDeck, regions)).toBe(34);

    regions.loaderRegion.y = 42;
    expect(resolveDiffusionLoaderDeckClipHeight(makeNode(), regions.regionDiffusionDeck, regions)).toBe(32);
  });

  it('does not expand to all entries when release layout reports the loader after full content', () => {
    const regions = makeRegions();
    regions.loaderRegion.y = 200;

    expect(resolveDiffusionLoaderDeckClipHeight(makeNode(58), regions.regionDiffusionDeck, regions)).toBe(32);
  });
});
