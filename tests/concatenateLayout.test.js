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

function makeConcatenateNode(NodeType) {
  const node = new NodeType();
  Object.assign(node, {
    id: 1,
    type: 'derpConcatenate',
    mode: 0,
    flags: { collapsed: false },
    size: [220, 200],
    widgets: [],
    outputs: [],
    titleLabel: 'Derp Concatenate',
    properties: {
      drawHeader: true,
      concatContentCollapsed: false,
      hiddenSignalPreviews: {},
      multiSignalIds: { 0: '101:0' },
      multiSignalLabels: { 0: 'Source A [101:0]' },
      signalDeck: [{ id: '101:0', label: 'Source A [101:0]' }],
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
  window._xcpDerpSession = 'concat-layout-regression';
  window.xcpDerpSignals = {
    '101:0': {
      nodeId: '101:0',
      nodeName: 'Source A',
      slotName: '101:0',
      type: 'STRING',
      value: 'hello',
    },
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

describe('derpConcatenate layout', () => {
  it('packs concat sections tightly in auto height mode', async () => {
    const NodeType = await registerConcatenateNodeType();
    const node = makeConcatenateNode(NodeType);

    node.refreshNodeLayoutMap();

    expect(node.properties.footerHeight).toBe(12);
    expect(node.layoutMap).not.toHaveProperty('contentAndSpringRegion');
    expect(node.layoutMap).not.toHaveProperty('addSignalRegion');
    expect(node.layoutMap).toHaveProperty('contentRegion');

    const contentRegion = node.layoutMap.contentRegion;
    expect(contentRegion.height).toBe('auto');
    expect(contentRegion).not.toHaveProperty('springRegion');
    expect(contentRegion.regionSignals).toBeTruthy();
    expect(contentRegion.regionConcatenated).toBeTruthy();
    expect(contentRegion.linebreakBeforeAdd.margin).toEqual([-8, 6, -8, 0]);
    expect(contentRegion.dropdownSignalAdd.margin).toEqual([0, 6, 0, 0]);
    expect(contentRegion.regionSignals.linebreakBeforeConcat.margin).toEqual([-8, 6, -8, 6]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    expect(fullMap.footerRegion.anchor.target).toBe('contentRegion');
    expect(fullMap.footerRegion.height).toBe('fill');
  });

  it('bottom-aligns the add-signal group in manual height mode', async () => {
    const NodeType = await registerConcatenateNodeType();
    const node = makeConcatenateNode(NodeType);

    node.size = [220, 520];
    node.properties.nodeSize = [220, 520];
    node.properties.autoHeight = false;
    node.refreshNodeLayoutMap();

    expect(node.layoutMap).not.toHaveProperty('contentRegion');
    expect(node.layoutMap).toHaveProperty('contentAndSpringRegion');
    expect(node.layoutMap).toHaveProperty('addSignalRegion');
    expect(node.layoutMap.contentAndSpringRegion.height).toBe('fill');
    expect(node.layoutMap.contentAndSpringRegion.springRegion).toMatchObject({
      height: 'fill',
      minHeight: 0,
    });
    expect(node.layoutMap.addSignalRegion.linebreakBeforeAdd.margin).toEqual([-8, 6, -8, 0]);
    expect(node.layoutMap.addSignalRegion.dropdownSignalAdd.margin).toEqual([0, 6, 0, 0]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const tallFullMap = getVirtualNodeLayoutMap(node);
    expect(tallFullMap.footerRegion.anchor.target).toBe('addSignalRegion');

    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 220, h: 520 }, tallFullMap, { isVirtual: true }, true);

    const concatBottom = layout.regions.regionConcatenated.y + layout.regions.regionConcatenated.h;
    const surplusAboveAddGroup = layout.regions.linebreakBeforeAdd.y - concatBottom;
    const fixedFooterSpace = 12;

    expect(surplusAboveAddGroup).toBeGreaterThan(200);
    expect(layout.regions.dropdownSignalAdd.y + layout.regions.dropdownSignalAdd.h).toBeLessThanOrEqual(
      520 - fixedFooterSpace + 1,
    );
    expect(layout.regions.footerRegion.h).toBeLessThanOrEqual(fixedFooterSpace);
  });

  it('settles preferred-auto height changes while docked in a vertical stack', async () => {
    const NodeType = await registerConcatenateNodeType();
    const node = makeConcatenateNode(NodeType);
    const { settleDerpSizeBeforeDraw } = await import('../js/fatha/core/fathaHandler.js');

    node.properties.autoHeight = false;
    node.properties.deckSavedAutoHeight = true;
    node.properties._derpPreferredAutoHeight = true;
    node.refreshNodeLayoutMap();
    vi.mocked(settleDerpSizeBeforeDraw).mockClear();

    node.toggleDerpSignalPreview(0);

    expect(settleDerpSizeBeforeDraw).toHaveBeenCalledWith(node, {
      forceAutoHeight: true,
      suppressRequestSync: true,
    });
    expect(node._allowDockContentHeightShiftFrames).toBe(4);
  });
});
