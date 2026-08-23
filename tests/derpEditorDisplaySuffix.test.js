import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDerpEditorHTML, syncDerpEditor } from '../js/herbina/widgets/derpEditor.js';

// Regression test for the EDITOR displaySuffix contract (framework plumbing
// used by the ImageDeck title-bar signal info):
//   - canvas display text = value + suffix (drives lines/measurement)
//   - domVal (editable DOM surface) = value WITHOUT the suffix
// so waking/editing/blur can never write the suffix into the stored value.

function makeNode(el) {
  return {
    id: 1,
    mode: 0,
    pos: [0, 0],
    getDerpVars: () => ({ SNAP: 10, mW: 8, mH: 6, sW: 4, sH: 3, pW: 4, pH: 2 }),
    _derpDomElements: { titleLabel: el },
    _derpScrollOffsets: {},
    _derpScrollConfigs: {},
    _editorLineCache: {},
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    layout: { regions: { titleLabel: { x: 0, y: 0, w: 200, h: 20 } }, hitTest: () => true },
  };
}

beforeEach(() => {
  // happy-dom lacks the 2D context global; derpEditor's isCanvas detection
  // references it via instanceof.
  if (typeof globalThis.CanvasRenderingContext2D === 'undefined') {
    globalThis.CanvasRenderingContext2D = class CanvasRenderingContext2D {};
  }
  window.xcpDerpLocaleData = {};
  window.xcpDerpSettings = {};
  window._xcpDerpSession = 'editor-suffix-test';
  window.app = { canvas: { ds: { scale: 1, offset: [0, 0] }, canvas: document.createElement('canvas') } };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpEditor displaySuffix', () => {
  it('keeps the suffix out of the editable DOM value while displaying it', () => {
    const el = createDerpEditorHTML({});
    const node = makeNode(el);

    const config = {
      key: 'titleLabel',
      text: 'Derp Image Deck',
      displaySuffix: ' - Image received at 12:00:00, Res: 1024x1024, Generated in 00:00:05',
      geometry: { x: 0, y: 0, w: 200, h: 20 },
      padding: [4, 0],
      themeKey: 'dialog, t_textBig',
      displayMode: 'cutoff',
      noShrink: true,
      skipBackground: true,
    };

    // Non-canvas path: context IS the DOM element.
    syncDerpEditor(el, node, window.app, config);

    // The DOM surface (hit/focus/editing) contains ONLY the clean value.
    expect(el.value ?? el.innerText ?? el.textContent).not.toContain('Image received at');

    // The measured line cache key must include the suffix so the canvas
    // display reflows when the suffix changes — verify via the line cache
    // entry produced for the combined display string.
    const cache = node._editorLineCache.titleLabel;
    expect(cache).toBeTruthy();
    expect(cache.lines[0]).toBe('Derp Image Deck - Image received at 12:00:00, Res: 1024x1024, Generated in 00:00:05');
  });

  it('suffix changes invalidate the line cache but keep domVal clean', () => {
    const el = createDerpEditorHTML({});
    const node = makeNode(el);

    const base = {
      key: 'titleLabel',
      text: 'Derp Image Deck',
      geometry: { x: 0, y: 0, w: 200, h: 20 },
      padding: [4, 0],
      themeKey: 'dialog, t_textBig',
      displayMode: 'cutoff',
      noShrink: true,
      skipBackground: true,
    };

    syncDerpEditor(el, node, window.app, { ...base, displaySuffix: ' - A' });
    const firstKey = node._editorLineCache.titleLabel.key;
    syncDerpEditor(el, node, window.app, { ...base, displaySuffix: ' - B' });
    expect(node._editorLineCache.titleLabel.key).not.toBe(firstKey);
    expect(node._editorLineCache.titleLabel.lines[0]).toBe('Derp Image Deck - B');
    expect(el.value ?? el.innerText ?? el.textContent).not.toContain('- B');
  });
});
