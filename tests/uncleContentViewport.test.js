import { describe, expect, it, vi } from 'vitest';

vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

import { uncle } from '../js/fatha/uncle.js';
import { UI_TYPES } from '../js/fatha/core/masterLayoutTypes.js';

function makeDrawCtx() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: (text) => ({ width: String(text || '').length * 8 }),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
}

function makeViewportUncleNode() {
  class TestUncleNode {}
  uncle(TestUncleNode, {}, 40);
  const node = new TestUncleNode();
  node.id = 88;
  node.type = 'xcpDerpUncleViewportTest';
  node.mode = 0;
  node.pos = [0, 0];
  node.size = [180, 120];
  node.properties = {
    autoWidth: false,
    autoHeight: false,
    contentCollapsed: false,
    drawHeader: false,
    drawSettingBtn: false,
    nodeSize: [180, 120],
    showInputs: false,
    showOutputs: false,
    useAnimations: false,
    footerHeight: 0,
  };
  node.inputs = [];
  node.outputs = [];
  node.layoutMap = {
    contentRegion: {
      width: 'full',
      height: 'auto',
      dir: 'col',
      viewportRegion: {
        width: 'full',
        height: 'auto',
        dir: 'col',
        scrollViewport: true,
        clipHeight: 20,
        minClipHeight: 20,
        rowA: {
          type: UI_TYPES.BUTTON,
          width: 'full',
          height: 18,
          text: 'A',
        },
        rowB: {
          type: UI_TYPES.BUTTON,
          anchor: { target: 'rowA', axis: 'y', offset: 4 },
          width: 'full',
          height: 18,
          text: 'B',
        },
      },
    },
  };
  node.getDerpVars = () => ({
    SNAP: 10,
    mW: 0,
    mH: 0,
    sW: 0,
    sH: 0,
    pW: 0,
    pH: 0,
    autoWidth: false,
    autoHeight: false,
  });
  node.setDirtyCanvas = vi.fn();
  node.requestDerpSync = vi.fn();
  node.suppressDefaultWidgets = vi.fn();
  node.syncUncleSlots = vi.fn();
  node.drawUncleSlots = vi.fn();
  return node;
}

describe('Uncle content viewport drawing', () => {
  it('clips canvas descendants of scrollViewport regions', () => {
    const node = makeViewportUncleNode();
    const ctx = makeDrawCtx();

    node.onDrawForeground(ctx);

    expect(node._contentViewportState?.viewportRegion?.hasOverflow).toBe(true);
    expect(ctx.clip).toHaveBeenCalled();
  });

  it('keeps one horizontal pixel of clip bleed on both sides of full-width stroked descendants', async () => {
    const { withContentViewportClip } = await import('../js/fatha/core/fathaContentViewportDraw.js');
    const ctx = makeDrawCtx();
    const node = {
      _contentViewportState: {
        viewportRegion: {
          key: 'viewportRegion',
          rect: { x: 10, y: 20, w: 100, h: 30 },
        },
      },
      layout: {
        regions: {
          viewportRegion: { key: 'viewportRegion' },
          rowRegion: { key: 'rowRegion', parentKey: 'viewportRegion' },
        },
      },
      _contentViewportScroll: {},
    };

    withContentViewportClip(ctx, node, 'rowRegion', { x: 10, y: 20, w: 100, h: 20 }, () => {});

    expect(ctx.rect).toHaveBeenCalledWith(9, 20, 102, 30);
  });
});
