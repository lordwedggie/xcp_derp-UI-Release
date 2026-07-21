import { describe, expect, it } from 'vitest';

import {
  buildDerpEditorLines,
  getDerpEditorContentHeight,
  getDerpEditorContentWidth,
  resolveDerpEditorScrollbarGeometry,
} from '../js/herbina/widgets/derpEditor.js';

describe('derpEditor embedded image measurement', () => {
  it('uses the scrollbar-reserved content width for image scroll height', () => {
    const node = {
      getDerpVars: () => ({ sW: 3 }),
      // Overflowing editor DOM element: scrollbar reserve only applies when content overflows.
      _derpDomElements: { editorMain: { scrollHeight: 200, clientHeight: 100 } },
      _derpImgCache: {
        '/prompt-book-image.png': {
          complete: true,
          naturalWidth: 100,
          naturalHeight: 50,
        },
      },
    };
    const config = {
      key: 'editorMain',
      multiline: true,
      canvasShield: true,
      geometry: { w: 200, h: 100, fontSize: 10 },
      padding: [10, 0],
    };

    const contentWidth = getDerpEditorContentWidth(node, config);
    const contentHeight = getDerpEditorContentHeight(node, config, [
      { type: 'img', src: '/prompt-book-image.png' },
    ]);

    expect(contentWidth).toBe(169);
    expect(contentHeight).toBeCloseTo((169 * 0.5) + 10);
  });

  it('counts image markers embedded beside prompt text', () => {
    const lines = buildDerpEditorLines('soft light, [[IMG:/prompt-book-image.png]]', 500, 10, 'Arial', 'normal');

    expect(lines).toEqual([
      'soft light,',
      { type: 'img', src: '/prompt-book-image.png' },
    ]);
  });

  it('trims image-adjacent newlines like the PromptBook DOM image renderer', () => {
    const lines = buildDerpEditorLines('soft light,\n[[IMG:/prompt-book-image.png]]\n', 500, 10, 'Arial', 'normal');

    expect(lines).toEqual([
      'soft light,',
      { type: 'img', src: '/prompt-book-image.png' },
    ]);
  });

  it('uses the live editor line height when computing max scroll content height', () => {
    const node = {
      getDerpVars: () => ({ sW: 3 }),
      _derpDomElements: { editorMain: { scrollHeight: 200, clientHeight: 100 } },
      _derpImgCache: {
        '/prompt-book-image.png': {
          complete: true,
          naturalWidth: 100,
          naturalHeight: 50,
        },
      },
    };
    const config = {
      key: 'editorMain',
      multiline: true,
      canvasShield: true,
      geometry: { w: 200, h: 100, fontSize: 10 },
      padding: [10, 0],
      _editorLineHeight: 30,
    };

    const contentHeight = getDerpEditorContentHeight(node, config, [
      'soft light,',
      { type: 'img', src: '/prompt-book-image.png' },
    ]);

    expect(contentHeight).toBeCloseTo(30 + (169 * 0.5) + 10);
  });

  it('reserves no scrollbar width when the editor content does not overflow', () => {
    const node = {
      getDerpVars: () => ({ sW: 3 }),
      // Non-overflowing editor: content fits, so no scrollbar gutter is reserved.
      _derpDomElements: { editorMain: { scrollHeight: 80, clientHeight: 100 } },
    };
    const config = {
      key: 'editorMain',
      multiline: true,
      canvasShield: true,
      geometry: { w: 200, h: 100, fontSize: 10 },
      padding: [10, 0],
    };

    expect(getDerpEditorContentWidth(node, config)).toBe(180);
  });

  it('insets the editor scrollbar track by the requested vertical spacing', () => {
    const geometry = resolveDerpEditorScrollbarGeometry({
      x: 10,
      y: 20,
      w: 200,
      h: 100,
      scrollTop: 50,
      maxScroll: 100,
      verticalMargin: 6,
    });

    expect(geometry.trackY).toBe(26);
    expect(geometry.trackH).toBe(88);
    expect(geometry.thumbY).toBeGreaterThanOrEqual(26);
    expect(geometry.thumbY + geometry.thumbH).toBeLessThanOrEqual(114);
  });
});
