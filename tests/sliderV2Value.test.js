import { describe, expect, it } from 'vitest';

import {
  formatSliderV2DisplayValue,
  getSliderV2HorizontalMetrics,
  getSliderV2MeasureText,
  getSliderV2Percent,
  normalizeSliderV2RenderPath,
  normalizeSliderV2Spec,
  normalizeSliderV2Value,
  resolveSliderV2HorizontalInteraction,
  resetSliderV2Value,
  sliderV2LocalXFromClientX,
  sliderV2ValueFromPercent,
  sliderV2ValueFromPointer,
  stepSliderV2Value,
} from '../js/herbina/widgets/helpers/sliderV2Value.js';

describe('Slider V2 value engine', () => {
  it('clamps and snaps float values to the configured step', () => {
    const cfg = { min: 0, max: 1, step: 0.05, decimals: 2 };
    expect(normalizeSliderV2Value(0.524, cfg)).toBe(0.5);
    expect(normalizeSliderV2Value(0.526, cfg)).toBe(0.55);
    expect(normalizeSliderV2Value(-1, cfg)).toBe(0);
    expect(normalizeSliderV2Value(2, cfg)).toBe(1);
  });

  it('handles integer sliders as true integer editors', () => {
    const cfg = { min: -5, max: 5, step: 1, decimals: 0 };
    expect(normalizeSliderV2Value(2.4, cfg)).toBe(2);
    expect(normalizeSliderV2Value(2.6, cfg)).toBe(3);
    expect(stepSliderV2Value(5, cfg, 1)).toBe(5);
    expect(stepSliderV2Value(-5, cfg, -1)).toBe(-5);
  });

  it('formats normalized float and integer display values consistently', () => {
    expect(formatSliderV2DisplayValue(0.526, { min: 0, max: 1, step: 0.05, decimals: 2 })).toBe('0.55');
    expect(formatSliderV2DisplayValue(2.6, { min: -5, max: 5, step: 1, decimals: 0 })).toBe('3');
    expect(formatSliderV2DisplayValue(5, { min: 0, max: 1, step: 0.1, decimals: 1 })).toBe('1.0');
  });

  it('builds stable numeric measure text from slider bounds', () => {
    expect(getSliderV2MeasureText({ min: 0, max: 1, step: 0.01, decimals: 2 })).toBe('9.99');
    expect(getSliderV2MeasureText({ min: -10, max: 5, step: 1, decimals: 0 })).toBe('-99');
  });

  it('normalizes reversed ranges and invalid integer steps predictably', () => {
    const spec = normalizeSliderV2Spec({ min: 10, max: 0, step: 0, decimals: 0, value: 4 });
    expect(spec.min).toBe(0);
    expect(spec.max).toBe(10);
    expect(spec.step).toBe(1);
    expect(normalizeSliderV2Value(4.7, spec)).toBe(5);
  });

  it('coerces fractional integer slider steps to whole steps', () => {
    const cfg = { min: 0, max: 10, step: 0.5, decimals: 0, value: 1 };
    expect(normalizeSliderV2Spec(cfg)).toMatchObject({
      step: 1,
      valueType: 'int',
    });
    expect(stepSliderV2Value(1, cfg, -1)).toBe(0);
    expect(stepSliderV2Value(1, cfg, 1)).toBe(2);
  });

  it('keeps invalid float steps on a useful float fallback', () => {
    const spec = normalizeSliderV2Spec({ min: 0, max: 1, step: 0, decimals: 2, value: 0.53 });
    expect(spec.step).toBe(0.05);
    expect(normalizeSliderV2Value(0.53, spec)).toBe(0.55);
  });

  it('maps percentages and pointer positions through the same normalization path', () => {
    const cfg = { min: -1, max: 1, step: 0.1, decimals: 1 };
    expect(sliderV2ValueFromPercent(0.75, cfg)).toBe(0.5);
    expect(sliderV2ValueFromPointer({ x: 10, w: 200 }, cfg, 160)).toBe(0.5);
    expect(getSliderV2Percent(0.5, cfg)).toBe(0.75);
  });

  it('uses default reset with clamp and snap applied', () => {
    expect(resetSliderV2Value({ min: 0, max: 1, step: 0.1, decimals: 1, default: 0.77 })).toBe(0.8);
    expect(resetSliderV2Value({ min: 0, max: 1, step: 0.1, decimals: 1, default: 5 })).toBe(1);
  });

  it('resolves track, btnLR, and reset interactions through one horizontal path', () => {
    const cfg = { min: 0, max: 1, step: 0.05, decimals: 2, default: 0.5, value: 0.5, btnLR: true };
    const reg = { x: 10, y: 0, w: 110, h: 20 };

    expect(getSliderV2HorizontalMetrics(reg, cfg)).toMatchObject({
      fillPadding: [0, 0, 0, 0],
      fullFillH: 20,
      btnW: 15,
      leftButtonStart: 10,
      leftButtonEnd: 25,
      rightButtonStart: 105,
      rightButtonEnd: 120,
      trackStart: 26,
      trackEnd: 104,
      trackW: 78,
      knobW: 0,
      knobTravelW: 78,
      interactionW: 78,
      styleId: '',
    });

    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 22, 'click')).toMatchObject({
      action: 'stepMinus',
      value: 0.45,
      commit: true,
    });

    const gapResult = resolveSliderV2HorizontalInteraction(reg, cfg, 25.5, 'click');
    expect(gapResult).toMatchObject({
      action: 'trackGap',
      commit: false,
    });
    expect(gapResult).not.toHaveProperty('value');

    const gapDoubleClick = resolveSliderV2HorizontalInteraction(reg, cfg, 25.5, 'dblclick');
    expect(gapDoubleClick).toMatchObject({
      action: 'trackGap',
      commit: false,
    });
    expect(gapDoubleClick).not.toHaveProperty('value');

    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 108, 'click')).toMatchObject({
      action: 'stepPlus',
      value: 0.55,
      commit: true,
    });
    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 65, 'drag')).toMatchObject({
      action: 'dragMove',
      value: 0.5,
      commit: false,
    });
    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 65, 'dblclick')).toMatchObject({
      action: 'reset',
      value: 0.5,
      commit: true,
    });

    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 20, 'dblclick')).toMatchObject({
      action: 'buttonDblClick',
      commit: false,
    });
  });

  it('uses whole-step btnLR changes for integer sliders even when callers pass fractional steps', () => {
    const reg = { x: 10, y: 0, w: 110, h: 20 };
    const cfg = { min: 0, max: 10, step: 0.5, decimals: 0, value: 1, btnLR: true };

    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 22, 'click')).toMatchObject({
      action: 'stepMinus',
      value: 0,
      commit: true,
    });
    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 108, 'click')).toMatchObject({
      action: 'stepPlus',
      value: 2,
      commit: true,
    });
  });

  it('maps knob sliders through the visible knob travel instead of the full track width', () => {
    const reg = { x: 0, y: 0, w: 120, h: 20 };
    const cfg = {
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      value: 0.5,
      styleId: 'knob',
      fillPadding: [2, 3, 4, 5],
      knobWidthScale: 1.5,
    };

    expect(getSliderV2HorizontalMetrics(reg, cfg)).toMatchObject({
      fillPadding: [2, 3, 4, 5],
      fullFillH: 14,
      btnW: 0,
      trackStart: 5,
      trackEnd: 117,
      trackW: 112,
      knobW: 21,
      knobTravelW: 91,
      interactionW: 91,
      styleId: 'knob',
    });

    expect(sliderV2ValueFromPointer(reg, cfg, 50.5)).toBe(0.5);
    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 50.5, 'drag')).toMatchObject({
      action: 'dragMove',
      value: 0.5,
      commit: false,
    });
    expect(resolveSliderV2HorizontalInteraction(reg, cfg, 96, 'drag')).toMatchObject({
      value: 1,
      commit: false,
    });
  });

  it('normalizes the global render path setting', () => {
    expect(normalizeSliderV2RenderPath('html')).toBe('html');
    expect(normalizeSliderV2RenderPath('HTML')).toBe('html');
    expect(normalizeSliderV2RenderPath('canvas')).toBe('canvas');
    expect(normalizeSliderV2RenderPath('bogus')).toBe('canvas');
    expect(normalizeSliderV2RenderPath(undefined)).toBe('canvas');
  });

  it('maps HTML client coordinates back through the same V2 interaction metrics', () => {
    const geometry = { x: 10, y: 0, w: 110, h: 20 };
    const rect = { left: 100, width: 220 };
    const cfg = { min: 0, max: 10, step: 1, decimals: 0, value: 4, btnLR: true };

    expect(sliderV2LocalXFromClientX(124, rect, geometry)).toBe(22);
    expect(resolveSliderV2HorizontalInteraction(geometry, cfg, sliderV2LocalXFromClientX(124, rect, geometry), 'click')).toMatchObject({
      action: 'stepMinus',
      value: 3,
      commit: true,
    });
    expect(resolveSliderV2HorizontalInteraction(geometry, cfg, sliderV2LocalXFromClientX(210, rect, geometry), 'drag')).toMatchObject({
      action: 'dragMove',
      value: 5,
      commit: false,
    });
  });
});
