import { describe, it, expect, vi } from 'vitest';

// Mock bastaSystemMessage to prevent its heavy import chain (scripts/app.js, basta.js, etc.)
// from loading and crashing in Node.js.
vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

import { interpretLayoutProps } from '../js/herbina/utils/widgetsUtils.js';

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
