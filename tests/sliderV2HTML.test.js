import { describe, expect, it, vi } from 'vitest';

vi.mock('../js/herbina/widgets/widget_Slider.js', () => ({
  syncDerpSliderCanvas: vi.fn(),
}));

vi.mock('../js/herbina/utils/widgetsUtils.js', () => {
  const resolvePaintData = (node, key, suffix = '', overrideColor = null) => {
    if (key?.startsWith?.('#')) return null;
    const direct = node?.[`_${key}PaintData${suffix}`] || node?.[`_${key}PaintData`];
    if (direct) return direct;
    if (!key?.startsWith?.('#')) {
      const fallbackKey = key?.toLowerCase?.().includes('text') ? 't_textSystem' : 'region';
      const fallback = node?.[`_${fallbackKey}PaintData${suffix}`] || node?.[`_${fallbackKey}PaintData`];
      if (fallback && fallbackKey !== key) return fallback;
    }
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

const legacySlider = await import('../js/herbina/widgets/widget_Slider.js');
const { syncDerpSliderV2Canvas, syncDerpSliderV2HTML } = await import('../js/herbina/widgets/widget_SliderV2.js');

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

function makeCanvasContext() {
  const ops = [];
  const ctx = {
    ops,
    save: () => ops.push({ op: 'save' }),
    restore: () => ops.push({ op: 'restore' }),
    beginPath: () => ops.push({ op: 'beginPath' }),
    closePath: () => ops.push({ op: 'closePath' }),
    moveTo: (...args) => ops.push({ op: 'moveTo', args }),
    lineTo: (...args) => ops.push({ op: 'lineTo', args }),
    arcTo: (...args) => ops.push({ op: 'arcTo', args }),
    rect: (...args) => ops.push({ op: 'rect', args }),
    clip: (...args) => ops.push({ op: 'clip', args }),
    fill: (...args) => ops.push({ op: 'fill', args, fillStyle: ctx.fillStyle }),
    stroke: () => ops.push({ op: 'stroke' }),
    fillText: (...args) => ops.push({ op: 'fillText', args, fillStyle: ctx.fillStyle }),
    measureText: (text) => ({ width: String(text || '').length * 8 }),
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'middle',
  };
  return ctx;
}

function syncSlider({ value = 0.5, onChange = () => {}, onCommit = () => {}, btnLR = true, styleId = 'knob', nodePatch = null } = {}) {
  const el = document.createElement('div');
  el.setPointerCapture = () => {};
  el.releasePointerCapture = () => {};
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 20, right: 120, bottom: 20 });

  const node = makeNode();
  if (nodePatch) Object.assign(node, nodePatch);
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

  it('does not clip themed outside glow on HTML btnLR parts', () => {
    const { el } = syncSlider({
      value: 0.5,
      nodePatch: {
        _sliderPaintData_OFF: {
          fill: 'rgba(20,20,20,1)',
          corners: [-2, 1, -2, 1],
          glow: {
            color: 'rgba(80, 255, 180, 0.8)',
            blur: 6,
            offsetX: 0,
            offsetY: 0,
          },
          glowClip: 'c_glowOutside',
        },
        _sliderPaintData_ON: {
          fill: 'rgba(80,160,240,1)',
          corners: [-2, 1, -2, 1],
          glow: {
            color: 'rgba(80, 255, 180, 0.8)',
            blur: 6,
            offsetX: 0,
            offsetY: 0,
          },
          glowClip: 'c_glowOutside',
        },
      },
    });

    expect(el.querySelector('.derp-slider-v2-fill-glow').style.display).toBe('block');
    expect(el.querySelector('.derp-slider-v2-fill-glow').style.filter).toContain('blur');
    expect(el.querySelector('.derp-slider-v2-fill-glow').style.clipPath).toBe('none');
    expect(el.querySelector('.derp-slider-v2-btn-left-glow').style.display).toBe('block');
    expect(el.querySelector('.derp-slider-v2-btn-right-glow').style.display).toBe('block');
    expect(el.querySelector('.derp-slider-v2-btn-left').style.overflow).toBe('visible');
    expect(el.querySelector('.derp-slider-v2-btn-right').style.overflow).toBe('visible');
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

  it('draws Canvas visuals through the V2 renderer instead of the legacy V1 slider painter', () => {
    const ctx = makeCanvasContext();
    const node = makeNode();

    syncDerpSliderV2Canvas(ctx, node, window.app, {
      key: 'sliderCanvasTest',
      geometry: { x: 0, y: 0, w: 120, h: 20 },
      themeKey: 'slider, t_textsmall',
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      default: 0.5,
      btnLR: true,
      styleId: 'knob',
    });

    expect(legacySlider.syncDerpSliderCanvas).not.toHaveBeenCalled();
    expect(ctx.ops.filter((op) => op.op === 'fill').length).toBeGreaterThan(3);
    expect(ctx.ops.some((op) => op.op === 'fillText' && op.args[0] === '0.50')).toBe(true);
  });

  it('falls missing slider body paint back to button instead of panel or region', () => {
    const ctx = makeCanvasContext();
    const node = {
      ...makeNode(),
      _buttonPaintData_OFF: { fill: 'rgba(30,40,50,1)', corners: [2, 2, 2, 2] },
      _panelPaintData_OFF: { fill: 'rgba(10,20,30,1)', corners: [2, 2, 2, 2] },
      _regionPaintData_OFF: { fill: 'rgba(200,10,10,1)', corners: [2, 2, 2, 2] },
    };
    delete node._sliderPaintData_OFF;
    delete node._sliderPaintData_ON;
    delete node._sliderPaintData_DIS;

    syncDerpSliderV2Canvas(ctx, node, window.app, {
      key: 'sliderPanelFallbackTest',
      geometry: { x: 0, y: 0, w: 120, h: 20 },
      themeKey: 'slider, t_textsmall',
      value: 0,
      min: 0,
      max: 1,
      step: 0.05,
      decimals: 2,
      default: 0.5,
      btnLR: false,
      styleId: 'default',
    });

    const fillStyles = ctx.ops
      .filter((op) => op.op === 'fill')
      .map((op) => String(op.fillStyle || '').replace(/\s+/g, ''));
    expect(fillStyles.includes('rgba(30,40,50,1)')).toBe(true);
    expect(fillStyles.includes('rgba(10,20,30,1)')).toBe(false);
    expect(fillStyles.includes('rgba(200,10,10,1)')).toBe(false);
  });
});
