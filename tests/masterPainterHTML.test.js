import { describe, expect, it } from 'vitest';

import { applyHTMLTheme, syncHTMLGlowLayer } from '../js/herbina/masterPainterHTML.js';

describe('masterPainterHTML effects', () => {
  it('draws outside glow as a filter halo instead of only tinting box-shadow', () => {
    const el = document.createElement('div');

    applyHTMLTheme(el, {
      fill: 'rgba(20, 20, 20, 1)',
      corners: [4, 4, 4, 4],
      glow: {
        color: 'rgba(80, 255, 180, 0.8)',
        blur: 6,
        offsetX: 0,
        offsetY: 0,
      },
      glowClip: 'c_glowOutside',
    }, 1);

    expect(el.style.filter).toContain('drop-shadow');
    expect(el.style.filter).toContain('rgba(80, 255, 180, 0.8)');
    expect(el.style.boxShadow).not.toContain('rgba(80, 255, 180, 0.8)');
    expect(el.style.overflow).toBe('visible');
  });

  it('keeps chamfer stroke filters valid so glow drop-shadows survive', () => {
    const el = document.createElement('div');

    applyHTMLTheme(el, {
      fill: 'rgba(20, 20, 20, 1)',
      corners: [-4, -4, -4, -4],
      border: {
        width: 1,
        placement: 2,
        color: 'rgba(255, 255, 255, 0.6)',
      },
      glow: {
        color: 'rgba(80, 255, 180, 0.8)',
        blur: 6,
        offsetX: 0,
        offsetY: 0,
      },
      glowClip: 'c_glowOutside',
    }, 1);

    expect(el.style.filter).toContain('drop-shadow');
    expect(el.style.filter).toContain('rgba(80, 255, 180, 0.8)');
    expect(el.style.filter).not.toContain(') 0 0 0');
    expect(el.style.overflow).toBe('visible');
  });

  it('builds unclipped explicit glow layers for negative chamfer corners', () => {
    const container = document.createElement('div');

    const glowEl = syncHTMLGlowLayer(container, 'test-glow', {
      left: 2,
      top: 4,
      width: 60,
      height: 12,
    }, {
      corners: [-2, 1, -2, 1],
      glow: {
        color: 'rgba(82, 163, 136, 0.28273809523809523)',
        blur: 8,
        offsetX: 0,
        offsetY: 0,
      },
      glowClip: 'c_glowNone',
    }, {
      scale: 1,
      zIndex: 2,
    });

    expect(glowEl).toBeTruthy();
    expect(glowEl.style.display).toBe('block');
    expect(glowEl.style.filter).toContain('blur');
    expect(glowEl.style.backgroundColor).toContain('rgba(82, 163, 136, 0.28273809523809523)');
    expect(glowEl.style.clipPath).toBe('none');
    expect(glowEl.style.webkitClipPath).toBe('none');
  });
});
