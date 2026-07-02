import { describe, expect, it } from 'vitest';

import {
  createDerpSliderV2,
  prepareSliderV2Config,
  refreshSliderV2RenderPathTargets,
  resolveSliderV2Interaction,
  setSliderV2GlobalRenderPath,
} from '../js/herbina/widgets/helpers/sliderV2Config.js';
import {
  getSliderV2TypePreset,
  listSliderV2TypePresets,
  normalizeSliderV2TypeId,
  resolveSliderV2UnsupportedInteraction,
} from '../js/herbina/widgets/helpers/sliderV2Types.js';

describe('Slider V2 type presets', () => {
  it('normalizes known and unknown type ids', () => {
    expect(normalizeSliderV2TypeId('horizontal')).toBe('horizontal');
    expect(normalizeSliderV2TypeId('VERTICAL')).toBe('vertical');
    expect(normalizeSliderV2TypeId('radial')).toBe('radial');
    expect(normalizeSliderV2TypeId('unknown')).toBe('horizontal');
    expect(normalizeSliderV2TypeId(undefined)).toBe('horizontal');
  });

  it('lists future slider types without marking them implemented yet', () => {
    expect(listSliderV2TypePresets()).toEqual([
      { id: 'horizontal', label: 'Horizontal', implemented: true },
      { id: 'vertical', label: 'Vertical', implemented: false },
      { id: 'radial', label: 'Radial', implemented: false },
    ]);
    expect(getSliderV2TypePreset('radial')).toMatchObject({ id: 'radial', implemented: false });
  });

  it('keeps non-horizontal types recognized but unsupported until implemented', () => {
    expect(createDerpSliderV2({ sliderType: 'vertical' }).sliderType).toBe('vertical');
    expect(createDerpSliderV2({ sliderType: 'bogus' }).sliderType).toBe('horizontal');
    expect(prepareSliderV2Config({ sliderType: 'radial', value: 0.5 })).toMatchObject({
      sliderType: 'radial',
      _sliderV2TypePreset: { id: 'radial', implemented: false },
    });

    const result = resolveSliderV2Interaction(
      { x: 0, y: 0, w: 100, h: 20 },
      { sliderType: 'vertical', value: 0.5 },
      50,
      'drag'
    );

    expect(result).toMatchObject({
      handled: false,
      action: 'unsupported',
      sliderType: 'vertical',
      value: 0.5,
      commit: false,
    });
    expect(resolveSliderV2UnsupportedInteraction({ sliderType: 'horizontal', value: 0.5 })).toBeNull();
  });

  it('marks existing Fatha nodes and active Bastas dirty when the global render path changes', () => {
    const calls = [];
    const node = {
      isFathaNode: true,
      _derpAwakeFrames: 0,
      requestDerpSync: () => calls.push('nodeSync'),
    };
    const basta = {
      setDirtyCanvas: () => calls.push('bastaDirty'),
    };
    const bastaMap = new Map([['editor', basta]]);
    const ignored = {
      requestDerpSync: () => calls.push('ignored'),
    };
    const canvas = {
      setDirty: () => calls.push('canvasDirty'),
    };

    expect(refreshSliderV2RenderPathTargets({
      nodes: [node, ignored],
      bastas: bastaMap.values(),
      canvas,
    })).toBe(2);
    expect(node._forceSync).toBe(true);
    expect(node._layoutDirty).toBe(true);
    expect(node._layoutMapHash).toBeNull();
    expect(node._derpAwakeFrames).toBe(2);
    expect(basta._forceSync).toBe(true);
    expect(calls).toEqual(['nodeSync', 'bastaDirty', 'canvasDirty']);
  });

  it('sets the global render path and persists the normalized value when a UI changes it', () => {
    const stored = [];
    const globals = {
      DERP_GLOBAL_SETTINGS: {},
      app: {
        ui: {
          settings: {
            setSettingValue: (id, value) => stored.push([id, value]),
          },
        },
      },
    };
    const node = {
      isFathaNode: true,
      setDirtyCanvas: () => {},
    };

    expect(setSliderV2GlobalRenderPath('HTML', { nodes: [node] }, globals)).toBe('html');
    expect(globals.DERP_GLOBAL_SETTINGS.sliderV2RenderPath).toBe('html');
    expect(globals.xcpDerpSettings).toBe(globals.DERP_GLOBAL_SETTINGS);
    expect(stored).toEqual([['Derp.SliderV2RenderPath', 'html']]);
    expect(node._forceSync).toBe(true);

    expect(setSliderV2GlobalRenderPath('bogus', {}, globals)).toBe('canvas');
    expect(globals.DERP_GLOBAL_SETTINGS.sliderV2RenderPath).toBe('canvas');
  });

  it('can skip persistence when called from the Comfy setting onChange path', () => {
    const stored = [];
    const globals = {
      DERP_GLOBAL_SETTINGS: {},
      app: {
        ui: {
          settings: {
            setSettingValue: (id, value) => stored.push([id, value]),
          },
        },
      },
    };

    expect(setSliderV2GlobalRenderPath('html', {}, globals, { persist: false })).toBe('html');
    expect(globals.DERP_GLOBAL_SETTINGS.sliderV2RenderPath).toBe('html');
    expect(stored).toEqual([]);
  });
});
