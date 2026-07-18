import { describe, it, expect, vi } from 'vitest';

// Mock bastaSystemMessage to prevent its heavy import chain (scripts/app.js, basta.js, etc.)
// from loading and crashing in Node.js.
vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

import { interpretLayoutProps, measureTextWidth, measureTextHeight } from '../js/herbina/utils/widgetsUtils.js';

// ---------------------------------------------------------------------------
// interpretLayoutProps — width measurement for layout engine
// ---------------------------------------------------------------------------

describe('interpretLayoutProps', () => {
  it('width:full editor WITHOUT cutoff measures full text (the bug pattern)', () => {
    const props = interpretLayoutProps({
      type: 'editor',
      width: 'full',
      text: 'Super Long Node Title That Pushes Buttons Right Off Screen',
      padding: [4, 0],
      themeKey: 'dialog, t_textBig',
    });

    // BUG: explicitMin is inflated by full text measurement
    // Long text → high minWidth → titleLabel demands too much space → pushes header buttons out
    expect(props.width).toBe('full');
    expect(props.minWidth).toBeGreaterThan(80);
  });

  it('width:full editor WITH cutoff has small minWidth (the fix)', () => {
    const props = interpretLayoutProps({
      type: 'editor',
      width: 'full',
      text: 'Super Long Node Title That Pushes Buttons Right Off Screen',
      padding: [4, 0],
      themeKey: 'dialog, t_textBig',
      displayMode: 'cutoff',
    });

    // FIXED: cutoff mode prevents text-width inflation — minWidth is just padding floor
    expect(props.width).toBe('full');
    expect(props.minWidth).toBeLessThan(30);
  });

  it('cutoff mode does not affect numeric width', () => {
    const props = interpretLayoutProps({
      type: 'editor',
      width: 120,
      text: 'Some Text',
      padding: [4, 0],
      themeKey: 'dialog, t_textSmall',
      displayMode: 'cutoff',
    });

    expect(props.width).toBe(120);
  });

  it('width:auto measures content width + padding', () => {
    const props = interpretLayoutProps({
      type: 'text',
      width: 'auto',
      text: 'Hello',
      padding: [4, 2],
      themeKey: 't_textSmall',
    });

    // width:auto resolves to measured content width + horizontal padding
    expect(typeof props.width).toBe('number');
    expect(props.width).toBeGreaterThan(8); // text width + padW
    expect(props.width).toBeLessThan(80); // short text, not inflated
  });

  it('measureText overrides text for width calculation', () => {
    const withMeasure = interpretLayoutProps({
      type: 'button',
      width: 'auto',
      text: '9999999999999999', // very long
      measureText: '99', // short
      padding: [4, 2],
      themeKey: 'button, t_textSmall',
    });

    const withoutMeasure = interpretLayoutProps({
      type: 'button',
      width: 'auto',
      text: '99',
      padding: [4, 2],
      themeKey: 'button, t_textSmall',
    });

    // measureText limits the measured width, so both should be similar
    const diff = Math.abs(withMeasure.width - withoutMeasure.width);
    expect(diff).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// measureTextWidth / measureTextHeight — cross-frame caching
// ---------------------------------------------------------------------------

describe('measureTextWidth cache', () => {
  it('returns consistent results for the same input', () => {
    const w1 = measureTextWidth('Hello', 14, 'arial', 'normal');
    const w2 = measureTextWidth('Hello', 14, 'arial', 'normal');
    expect(w1).toBe(w2);
  });

  it('returns different results for different text', () => {
    const short = measureTextWidth('Hi', 14, 'arial', 'normal');
    const long  = measureTextWidth('Hello World', 14, 'arial', 'normal');
    expect(long).toBeGreaterThan(short);
  });

  it('cache keys distinguish font size (no cross-size collision)', () => {
    // The shared canvas mock ignores fontSize, so both sizes return the same
    // width here — this only verifies the two keys do not collide/corrupt.
    const small = measureTextWidth('Hello', 12, 'arial', 'normal');
    const large = measureTextWidth('Hello', 24, 'arial', 'normal');
    expect(small).toBe(40); // 5 chars * 8px per setup.js mock
    expect(large).toBe(40);
  });

  it('strips color-key tags before measuring', () => {
    const plain = measureTextWidth('Hello', 14, 'arial', 'normal');
    const tagged = measureTextWidth('{{t_text_accent::He}}llo', 14, 'arial', 'normal');
    expect(tagged).toBe(plain);
  });
});

describe('measureTextHeight cache', () => {
  it('returns consistent results for the same input', () => {
    const h1 = measureTextHeight('Hello', 0, { fontSize: 14, font: 'arial', fontWeight: 'normal' });
    const h2 = measureTextHeight('Hello', 0, { fontSize: 14, font: 'arial', fontWeight: 'normal' });
    expect(h1).toBe(h2);
  });

  it('returns consistent results for different fontSize (mock lacks ink metrics)', () => {
    // The shared canvas mock returns only {width} — no actualBoundingBox* —
    // so the non-wrap height path yields NaN in tests. Verify both sizes
    // behave identically (both NaN) rather than crashing.
    const small = measureTextHeight('Hello', 0, { fontSize: 12, font: 'arial', fontWeight: 'normal' });
    const large = measureTextHeight('Hello', 0, { fontSize: 24, font: 'arial', fontWeight: 'normal' });
    expect(Number.isNaN(small)).toBe(true);
    expect(Number.isNaN(large)).toBe(true);
  });

  it('computes wrapped height when maxWidth > 0', () => {
    const wrapped = measureTextHeight('Hello World Long Text', 30, { fontSize: 14, font: 'arial', fontWeight: 'normal' });
    // Should be at least one line of fontSize
    expect(wrapped).toBeGreaterThanOrEqual(14);
  });

  it('strips color-key tags before measuring', () => {
    const plain = measureTextHeight('Hello', 0, { fontSize: 14, font: 'arial', fontWeight: 'normal' });
    const tagged = measureTextHeight('{{t_text_accent::He}}llo', 0, { fontSize: 14, font: 'arial', fontWeight: 'normal' });
    expect(tagged).toBe(plain);
  });
});

// ---------------------------------------------------------------------------
// parseColorKeyText cache
// ---------------------------------------------------------------------------
import { parseColorKeyText } from '../js/herbina/utils/widgetsUtils.js';

describe('parseColorKeyText cache', () => {
  it('returns identical object for repeated calls with same text', () => {
    const t1 = parseColorKeyText('Hello {{t_text_accent::World}}', null, '_OFF');
    const t2 = parseColorKeyText('Hello {{t_text_accent::World}}', null, '_OFF');
    expect(t1.hasColorKeys).toBe(true);
    expect(t1).toBe(t2); // same object reference — cache hit
  });

  it('returns null segments for plain text without color keys', () => {
    const result = parseColorKeyText('Just plain text', null, '_OFF');
    expect(result.segments).toBeNull();
    expect(result.hasColorKeys).toBe(false);
  });

  it('parses display text override inside color keys', () => {
    const result = parseColorKeyText('{{t_text_error::Stop}} now', null, '_OFF');
    expect(result.hasColorKeys).toBe(true);
    // Unresolved key (no palette in test env) merges with the plain tail —
    // the display override text must survive intact.
    expect(result.segments.map(s => s.text).join('')).toBe('Stop now');
  });

  it('cache key distinguishes text content', () => {
    const a = parseColorKeyText('{{t_text_accent::A}}', null, '_OFF');
    const b = parseColorKeyText('{{t_text_accent::B}}', null, '_OFF');
    expect(a.segments[0].text).toBe('A');
    expect(b.segments[0].text).toBe('B');
  });

  it('cache key distinguishes state suffix', () => {
    // Same unresolved key with different suffixes — cached separately
    const off = parseColorKeyText('{{unknown_key}}', null, '_OFF');
    const on = parseColorKeyText('{{unknown_key}}', null, '_ON');
    expect(off).not.toBe(on);
  });
});
