import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

vi.mock('../js/fatha/core/fathaHandler.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    settleDerpSizeBeforeDraw: vi.fn(),
  };
});

async function registerConcatenateNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };
  window._xcp_DerpVirtualLoader_Loaded = false;

  await import('../js/derps/utils/derpConcatenate.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpConcatenate_Extension');
  expect(extension).toBeTruthy();

  class NodeType {}
  await extension.beforeRegisterNodeDef(NodeType, { name: 'derpConcatenate' });
  return NodeType;
}

const LONG_A = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu';
const LONG_B = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud';

function makeConcatenateNode(NodeType, height = 600) {
  const node = new NodeType();
  Object.assign(node, {
    id: 1,
    type: 'derpConcatenate',
    mode: 0,
    flags: { collapsed: false },
    size: [220, height],
    widgets: [],
    outputs: [],
    titleLabel: 'Derp Concatenate',
    properties: {
      drawHeader: true,
      autoHeight: false,
      concatContentCollapsed: false,
      hiddenSignalPreviews: {},
      multiSignalIds: { 0: '101:0', 1: '102:0' },
      multiSignalLabels: { 0: 'Source A [101:0]', 1: 'Source B [102:0]' },
      signalDeck: [
        { id: '101:0', label: 'Source A [101:0]' },
        { id: '102:0', label: 'Source B [102:0]' },
      ],
      nodeSize: [220, height],
    },
    getDerpVars: () => ({
      SNAP: 10,
      mW: 8,
      mH: 6,
      sW: 4,
      sH: 3,
      pW: 4,
      pH: 2,
      t_textNormal_size: 12,
      t_textSmall_size: 10,
    }),
    requestDerpSync: vi.fn(),
  });
  return node;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'concat-floor-repro';
  window.xcpDerpSignals = {
    '101:0': { nodeId: '101:0', nodeName: 'Source A', slotName: '101:0', type: 'STRING', value: LONG_A },
    '102:0': { nodeId: '102:0', nodeName: 'Source B', slotName: '102:0', type: 'STRING', value: LONG_B },
  };
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

async function runHeightSequence(forced, heights) {
  const NodeType = await registerConcatenateNodeType();
  const node = makeConcatenateNode(NodeType, heights[0]);
  const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
  const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
  const { getVerticalResizeTargetMinHeight } = await import('../js/fatha/core/dockResize.js');
  const { sumLayoutMapMinHeights } = await import('../js/fatha/core/dockDimensions.js');

  const layout = new masterLayoutEngine(node);
  node.layout = layout;
  const rows = [];
  for (const h of heights) {
    node.size = [220, h];
    node.properties.nodeSize = [220, h];
    node.refreshNodeLayoutMap();
    layout.compute({ x: 0, y: 0, w: 220, h }, getVirtualNodeLayoutMap(node), { isVirtual: true }, forced);
    const floor = getVerticalResizeTargetMinHeight(node, 10, { preserveExpandedFloor: true });
    // settleDerpSizeBeforeDraw manual branch: rawH = totalHeight || contentMinHeight
    const rawH = layout.totalHeight || layout.contentMinHeight || 40;
    const engineFloorH = Math.ceil(rawH / 10) * 10;
    const drawTargetH = Math.max(h, engineFloorH);
    const sig = node._contentViewportState?.regionSignalsViewport;
    const out = node._contentViewportState?.regionConcatContent;
    const explicitMinH = sumLayoutMapMinHeights(node.layoutMap);
    const contentMinH = Number(node?.layout?.contentMinHeight) || Number(node?.layout?.totalHeight) || 40;
    const currentMin = Math.ceil(Math.max(0, explicitMinH, contentMinH) / 10) * 10;
    const row = {
      h,
      contentMinHeight: Math.round(layout.contentMinHeight || 0),
      totalHeight: Math.round(layout.totalHeight || 0),
      resizeFloor: floor,
      drawTargetH,
      regrow: drawTargetH > h,
      explicitMinH,
      currentMin,
      sig: sig ? `${Math.round(sig.fullHeight)}/${Math.round(sig.clipHeight)}/${Math.round(sig.minClipHeight)}` : 'off',
      out: out ? `${Math.round(out.fullHeight)}/${Math.round(out.clipHeight)}/${Math.round(out.minClipHeight)}` : 'off',
    };
    rows.push(row);
    console.log(`[concat-floor forced=${forced ? 1 : 0}] h=${h} contentMinH=${row.contentMinHeight} totalH=${row.totalHeight} resizeFloor=${row.resizeFloor} explicitMinH=${row.explicitMinH} currentMin=${row.currentMin} REGROW=${row.regrow} sig(f/c/m)=${row.sig} out(f/c/m)=${row.out}`);
  }
  return rows;
}

describe('derpConcatenate manual-height resize floor (repro)', () => {
  it('reports the standalone shrink floor across descending heights (unforced passes)', async () => {
    const rows = await runHeightSequence(false, [600, 520, 440, 360, 300, 260, 220, 180]);
    // The resize floor must stay near the compact content minimum at every
    // height so the node can shrink; it must NOT track the current height.
    const maxFloor = Math.max(...rows.map((r) => r.resizeFloor));
    expect(maxFloor).toBeLessThan(300);
  });

  it('reports the standalone shrink floor across descending heights (forced passes)', async () => {
    const rows = await runHeightSequence(true, [600, 520, 440, 360, 300, 260, 220, 180]);
    const maxFloor = Math.max(...rows.map((r) => r.resizeFloor));
    expect(maxFloor).toBeLessThan(300);
  });
});
