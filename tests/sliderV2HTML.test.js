import { describe, expect, it, vi } from 'vitest';

vi.mock('../js/herbina/widgets/widget_Slider.js', () => ({
  syncDerpSliderCanvas: vi.fn(),
}));

vi.mock('../js/herbina/utils/widgetsUtils.js', () => {
  const resolvePaintData = (node, key, suffix = '', overrideColor = null) => {
    if (key?.startsWith?.('#')) return null;
    const direct = node?.[`_${key}PaintData${suffix}`] || node?.[`_${key}PaintData`];
    if (direct) return direct;
    return overrideColor ? { fill: overrideColor, corners: [0, 0, 0, 0] } : null;
  };

  return {
    applyInteractionStyles: (el, config, state) => {
      el.style.cursor = state === 'DIS' ? 'default' : 'pointer';
      el.style.pointerEvents = state === 'DIS' ? 'none' : 'auto';
    },
    calculateScreenCoords: (node, app, x, y, w, h) => ({
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`,
      scale: 1,
    }),
    colorSegmentsToHTML: (segments, fallbackColor) => (segments || [])
      .map((segment) => `<span style="color:${segment.color || fallbackColor}">${segment.text}</span>`)
      .join(''),
    getAlignmentMaps: () => ({
      justify: { left: 'flex-start', center: 'center', right: 'flex-end' },
      align: { top: 'flex-start', middle: 'center', bottom: 'flex-end' },
    }),
    resolveInterpolatedPaint: (node, key, percent, fallbackColor) => resolvePaintData(node, key, '_ON', fallbackColor),
    resolvePaintData,
    resolveWidgetEnv: (node, config) => {
      const disabled = config.state === 'DIS' || config.disabled === true;
      const stateStr = disabled ? 'DIS' : (node._hoveredRegionKey === config.key ? 'ON' : 'OFF');
      const suffix = stateStr === 'DIS' ? '_DIS' : (stateStr === 'ON' ? '_ON' : '_OFF');
      const displayText = config.displayText ?? config.text ?? config.label ?? '';
      return {
        props: {
          ...config,
          bodyKey: 'slider',
          labelKey: 't_textsmall',
          displayText,
          label: config.label ?? displayText,
          padding: config.padding || [0, 0, 0, 0],
          labelAlign: config.labelAlign || ['center', 'middle'],
          fillPadding: config.fillPadding || [0, 0, 0, 0],
          fillStrength: config.fillStrength ?? true,
        },
        stateStr,
        bodyPaint: resolvePaintData(node, 'slider', suffix, config.btnColor),
        labelPaint: resolvePaintData(node, 't_textsmall', suffix, config.labelColor),
        alpha: config.alpha ?? 1,
        colorSegments: null,
        hasColorKeys: false,
      };
    },
  };
});

const { syncDerpSliderV2HTML } = await import('../js/herbina/widgets/widget_SliderV2.js');

function makeNode() {
  return {
    mode: 0,
    selected: false,
    pos: [0, 0],
    _masterZHtml: 1234,
    _sliderPaintData_OFF: { fill: 'rgba(20,20,20,1)', corners: [2, 2, 2, 2] },
    _sliderPaintData_ON: { fill: 'rgba(80,160,240,1)', corners: [2, 2, 2, 2] },
    _sliderPaintData_DIS: { fill: 'rgba(40,40,40,0.5)', corners: [2, 2, 2, 2] },
    _t_textsmallPaintData_OFF: { textColor: 'rgba(240,240,240,1)', fontSize: 10, font: 'Arial' },
    _t_textsmallPaintData_ON: { textColor: 'rgba(255,255,255,1)', fontSize: 10, font: 'Arial' },
    _t_textsmallPaintData_DIS: { textColor: 'rgba(160,160,160,1)', fontSize: 10, font: 'Arial' },
    _hoveredRegionKey: null,
    _pressedRegionKey: null,
    setDirtyCanvas() {},
    requestDerpSync() {},
  };
}

function eventAt(clientX) {
  return {
    clientX,
    pointerId: 1,
    stopPropagation() {},
    preventDefault() {},
  };
}

function syncSlider({ value = 0.5, onChange = () => {}, onCommit = () => {}, btnLR = true, styleId = 'knob' } = {}) {
  const el = document.createElement('div');
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 20, right: 120, bottom: 20 });

  const node = makeNode();
  syncDerpSliderV2HTML(el, node, window.app, {
    key: 'sliderTest',
    geometry: { x: 0, y: 0, w: 120, h: 20 },
    themeKey: 'slider, t_textsmall',
    value,
    min: 0,
    max: 1,
    step: 0.05,
    decimals: 2,
    default: 0.5,
    btnLR,
    styleId,
    onChange,
    onCommit,
  });

  return { el, node };
}

describe('Slider V2 HTML renderer', () => {
  it('renders V2-owned HTML parts for the knob preset', () => {
    const { el } = syncSlider({ value: 0.5, styleId: 'knob' });

    expect(el.className).not.toContain('derp-slider-html');
    expect(el.style.position).toBe('fixed');
    expect(el.style.zIndex).toBe('1234');
    expect(el.querySelector('.derp-slider-v2-background')).toBeTruthy();
    expect(el.querySelector('.derp-slider-v2-fill')).toBeTruthy();
    expect(el.querySelector('.derp-slider-v2-knob').style.display).toBe('block');
    expect(el.querySelector('.derp-slider-v2-btn-left')).toBeTruthy();
    expect(el.querySelector('.derp-slider-v2-btn-right')).toBeTruthy();
    expect(el.querySelector('.derp-slider-v2-label').textContent).toBe('0.50');
  });

  it('uses the V2 value engine for btnLR, gap, drag, and reset interactions', () => {
    const changes = [];
    const commits = [];
    const { el } = syncSlider({
      value: 0.5,
      onChange: (next) => changes.push(next),
      onCommit: (next) => commits.push(next),
    });

    el.onpointerdown(eventAt(8));
    expect(changes.at(-1)).toBe(0.45);
    expect(commits.at(-1)).toBe(0.45);

    const beforeGap = changes.length;
    el.onpointerdown(eventAt(15.5));
    expect(changes.length).toBe(beforeGap);

    el.onpointerdown(eventAt(60));
    el.onpointermove(eventAt(74));
    el.onpointerup(eventAt(74));
    expect(changes.at(-1)).toBe(0.85);
    expect(commits.at(-1)).toBe(0.85);

    el.ondblclick(eventAt(60));
    expect(changes.at(-1)).toBe(0.5);
    expect(commits.at(-1)).toBe(0.5);

    const beforeButtonDoubleClick = changes.length;
    el.ondblclick(eventAt(8));
    expect(changes.length).toBe(beforeButtonDoubleClick);

    const beforeGapDoubleClick = changes.length;
    el.ondblclick(eventAt(15.5));
    expect(changes.length).toBe(beforeGapDoubleClick);
  });

  it('removes optional parts when the default style and no side buttons are selected', () => {
    const { el } = syncSlider({ value: 0.5, styleId: 'default', btnLR: false });

    expect(el.querySelector('.derp-slider-v2-knob').style.display).toBe('none');
    expect(el.querySelector('.derp-slider-v2-btn-left')).toBeNull();
    expect(el.querySelector('.derp-slider-v2-btn-right')).toBeNull();
  });
});
