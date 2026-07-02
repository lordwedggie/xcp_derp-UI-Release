import { describe, expect, it } from 'vitest';

import { prepareSliderV2Config } from '../js/herbina/widgets/helpers/sliderV2Config.js';
import {
  buildSliderV2StylePayload,
  getSliderV2StylePreset,
  listSliderV2StylePresets,
  normalizeSliderV2StyleId,
  normalizeSliderV2StyleForPersistence,
  prepareSliderV2StyleConfig,
  resolveSliderV2StyleConfigFromPayload,
  sanitizeSliderV2StyleFileName,
  SLIDER_V2_STYLE_FILE_KIND,
  SLIDER_V2_STYLE_FILE_VERSION,
} from '../js/herbina/widgets/helpers/sliderV2Styles.js';

describe('Slider V2 style presets', () => {
  it('normalizes supported and unsupported style ids to stable presets', () => {
    expect(normalizeSliderV2StyleId('knob')).toBe('knob');
    expect(normalizeSliderV2StyleId('KNOB')).toBe('knob');
    expect(normalizeSliderV2StyleId('default')).toBe('default');
    expect(normalizeSliderV2StyleId('unknown')).toBe('knob');
    expect(normalizeSliderV2StyleId(undefined)).toBe('knob');
  });

  it('maps presets to current canvas and HTML renderer styles', () => {
    expect(getSliderV2StylePreset('knob')).toMatchObject({
      id: 'knob',
      canvasStyle: 'knob',
      htmlStyle: 'knob',
    });
    expect(getSliderV2StylePreset('default')).toMatchObject({
      id: 'default',
      canvasStyle: 'default',
      htmlStyle: 'default',
    });
  });

  it('returns preset copies for dropdown/list callers', () => {
    const presets = listSliderV2StylePresets();
    expect(presets.map((preset) => preset.id)).toEqual(['knob', 'default']);
    presets[0].id = 'mutated';
    presets[0].visualDefaults.fillbarHeight = 0.2;
    expect(getSliderV2StylePreset('knob').id).toBe('knob');
    expect(getSliderV2StylePreset('knob').visualDefaults.fillbarHeight).toBe(1);
  });

  it('prepares renderer style fields and defaults from the selected preset', () => {
    expect(prepareSliderV2Config({ styleId: 'default', value: 0.5 })).toMatchObject({
      styleId: 'default',
      style: 'default',
      htmlStyle: 'default',
      fillbarHeight: 1,
      displayText: '0.50',
      measureText: '9.99',
    });
    expect(prepareSliderV2Config({ styleId: 'knob', value: 0.5 })).toMatchObject({
      styleId: 'knob',
      style: 'knob',
      htmlStyle: 'knob',
      fillbarHeight: 1,
      roundKnob: true,
      knobWidthScale: 1,
      knobHeightOffset: 0,
      knobRadiusOffset: 0,
    });
  });

  it('keeps style defaults out of presets that do not own that visual part', () => {
    expect(prepareSliderV2StyleConfig({ styleId: 'default' })).not.toHaveProperty('roundKnob');
    expect(prepareSliderV2StyleConfig({ styleId: 'default' })).not.toHaveProperty('knobWidthScale');
  });

  it('lets explicit caller values override preset defaults', () => {
    expect(prepareSliderV2Config({
      styleId: 'knob',
      value: 0.5,
      fillbarHeight: 0.5,
      roundKnob: false,
      knobWidthScale: 1.5,
      knobHeightOffset: 2,
      knobRadiusOffset: -1,
    })).toMatchObject({
      fillbarHeight: 0.5,
      roundKnob: false,
      knobWidthScale: 1.5,
      knobHeightOffset: 2,
      knobRadiusOffset: -1,
    });
  });

  it('preserves explicit display labels while still normalizing the value', () => {
    expect(prepareSliderV2Config({
      styleId: 'knob',
      value: 0.526,
      decimals: 2,
      step: 0.05,
      displayText: 'Strength',
      measureText: 'Strength',
    })).toMatchObject({
      value: 0.55,
      displayText: 'Strength',
      text: 'Strength',
      label: 'Strength',
      measureText: 'Strength',
    });
  });

  it('sanitizes saved style file names without requiring callers to include json extensions', () => {
    expect(sanitizeSliderV2StyleFileName('  Round Knob.json  ')).toBe('Round Knob');
    expect(sanitizeSliderV2StyleFileName('../bad:name*?')).toBe('_bad_name__');
    expect(sanitizeSliderV2StyleFileName('', 'fallback-name')).toBe('fallback-name');
  });

  it('normalizes persisted knob styles to the exposed style editor controls', () => {
    expect(normalizeSliderV2StyleForPersistence({
      styleId: 'knob',
      fillbarHeight: 5,
      roundKnob: false,
      knobWidthScale: 99,
      knobHeightOffset: -99,
      knobRadiusOffset: 99,
    })).toEqual({
      styleId: 'knob',
      fillbarHeight: 1,
      roundKnob: false,
      knobWidthScale: 2,
      knobHeightOffset: -5,
      knobRadiusOffset: 3,
    });
  });

  it('keeps default persisted styles compact and free of knob-only controls', () => {
    expect(normalizeSliderV2StyleForPersistence({
      styleId: 'default',
      fillbarHeight: 0.1,
      roundKnob: false,
      knobWidthScale: 1.8,
    })).toEqual({
      styleId: 'default',
      fillbarHeight: 0.2,
    });
  });

  it('builds versioned style file payloads for the editor save route', () => {
    expect(buildSliderV2StylePayload({
      styleId: 'knob',
      fillbarHeight: 0.5,
      roundKnob: true,
    }, 'saved:style.json')).toEqual({
      version: SLIDER_V2_STYLE_FILE_VERSION,
      kind: SLIDER_V2_STYLE_FILE_KIND,
      name: 'saved_style',
      styleId: 'knob',
      style: {
        styleId: 'knob',
        fillbarHeight: 0.5,
        roundKnob: true,
        knobWidthScale: 1,
        knobHeightOffset: 0,
        knobRadiusOffset: 0,
      },
    });
  });

  it('resolves versioned and flat loaded style payloads through the same normalization path', () => {
    expect(resolveSliderV2StyleConfigFromPayload({
      version: 1,
      styleId: 'knob',
      style: {
        fillbarHeight: 0.4,
        knobWidthScale: 0.1,
      },
    })).toEqual({
      styleId: 'knob',
      fillbarHeight: 0.4,
      roundKnob: true,
      knobWidthScale: 0.2,
      knobHeightOffset: 0,
      knobRadiusOffset: 0,
    });

    expect(resolveSliderV2StyleConfigFromPayload({
      styleId: 'default',
      fillbarHeight: 0.6,
      knobRadiusOffset: 2,
    })).toEqual({
      styleId: 'default',
      fillbarHeight: 0.6,
    });
  });
});
