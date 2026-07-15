import { describe, expect, it } from 'vitest';

import {
  SAMPLER_LOADER_MIN_DISPLAYED_SAMPLER_ENTRIES,
  getSamplerLoaderDeckRows,
  resolveSamplerLoaderDeckClipHeight,
  resolveSamplerLoaderDeckMinClipHeight,
} from '../js/derps/loaders/derpSamplerLoader.js';

function makeNode(height = 180) {
  return {
    size: [220, height],
    properties: { nodeSize: [220, height] },
    getDerpVars: () => ({ mH: 6 }),
  };
}

function makeRegions() {
  return {
    regionSamplerDeck: { key: 'regionSamplerDeck', y: 20, h: 120 },
    samplerRow_1: { key: 'samplerRow_1', parentKey: 'regionSamplerDeck', y: 58, h: 28, margin: [0, 0, 0, 4] },
    samplerRow_0: { key: 'samplerRow_0', parentKey: 'regionSamplerDeck', y: 20, h: 28, margin: [0, 0, 0, 4] },
    loaderRegion: { key: 'loaderRegion', y: 60, h: 42 },
  };
}

describe('derpSamplerLoader manual-height deck viewport', () => {
  it('uses one displayed sampler entry as the viewport minimum', () => {
    const regions = makeRegions();
    const rows = getSamplerLoaderDeckRows(regions);

    expect(SAMPLER_LOADER_MIN_DISPLAYED_SAMPLER_ENTRIES).toBe(1);
    expect(rows.map(({ key }) => key)).toEqual(['samplerRow_0', 'samplerRow_1']);
    expect(resolveSamplerLoaderDeckMinClipHeight(makeNode(), regions.regionSamplerDeck, regions)).toBe(32);
  });

  it('clips to available manual height without going below one sampler entry', () => {
    const regions = makeRegions();

    expect(resolveSamplerLoaderDeckClipHeight(makeNode(), regions.regionSamplerDeck, regions)).toBe(34);

    regions.loaderRegion.y = 42;
    expect(resolveSamplerLoaderDeckClipHeight(makeNode(), regions.regionSamplerDeck, regions)).toBe(32);
  });

  it('does not expand to all entries when release layout reports the loader after full content', () => {
    const regions = makeRegions();
    regions.loaderRegion.y = 200;

    expect(resolveSamplerLoaderDeckClipHeight(makeNode(58), regions.regionSamplerDeck, regions)).toBe(32);
  });
});
