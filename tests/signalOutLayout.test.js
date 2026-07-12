import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

async function registerSignalOutNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };
  window._xcp_derpSignalOut_Layout_Loaded = false;

  await import('../js/derpSignalOut.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpSignalOut_Layout');
  expect(extension).toBeTruthy();

  class NodeType {}
  await extension.beforeRegisterNodeDef(NodeType, { name: 'xcpDerpSignalOut' });
  return NodeType;
}

async function makeSignalOutNode(NodeType, overrides = {}) {
  const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
  const { UI_TYPES } = await import('../js/fatha/core/masterLayoutTypes.js');
  const activeOutputs = overrides.activeOutputs || [
    { nodeId: '101:0', nodeName: 'Source A', type: 'STRING' },
    { nodeId: '102:0', nodeName: 'Source B', type: 'STRING' },
    { nodeId: '103:0', nodeName: 'Source C', type: 'STRING' },
    { nodeId: '104:0', nodeName: 'Source D', type: 'STRING' },
  ];
  const node = new NodeType();
  Object.assign(node, {
    id: 10,
    type: 'xcpDerpSignalOut',
    mode: 0,
    flags: { collapsed: false },
    size: overrides.size || [300, 180],
    widgets: [],
    outputs: activeOutputs.map(() => ({ links: [] })),
    titleLabel: 'Router',
    UI_TYPES,
    properties: {
      drawHeader: true,
      drawSettingBtn: true,
      settingActive: false,
      autoHeight: overrides.autoHeight ?? true,
      nodeSize: overrides.size || [300, 180],
      showSignalIds: true,
      showSlotNames: true,
      showSlotTypes: true,
      showVirtualLinks: false,
      hideLinkSlots: true,
      signalSortMode: 'Type',
      ...overrides.properties,
    },
    activeOutputs,
    receivedSignals: [
      ...activeOutputs,
      { nodeId: '201:0', nodeName: 'Selectable Source', type: 'STRING' },
    ],
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
    setDirtyCanvas: vi.fn(),
    addDerpOutput: vi.fn(),
    removeDerpOutput: vi.fn(),
  });
  node.layout = new masterLayoutEngine(node);
  return node;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'signal-out-layout-regression';
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  window.app.canvas = { selectNode: vi.fn() };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpSignalOut layout', () => {
  it('packs the selector tightly in runtime auto height mode', async () => {
    const NodeType = await registerSignalOutNodeType();
    const node = await makeSignalOutNode(NodeType, {
      autoHeight: true,
      properties: { settingActive: true },
    });

    node.refreshNodeLayoutMap();

    expect(node.properties.footerHeight).toBe(12);
    expect(node.layoutMap).toHaveProperty('contentRegion');
    expect(node.layoutMap).not.toHaveProperty('routerContentAndSpringRegion');
    expect(node.layoutMap).not.toHaveProperty('selectSignalRegion');
    expect(node.layoutMap.contentRegion).not.toHaveProperty('springRegion');
    expect(node.layoutMap.contentRegion.signalBreak).toMatchObject({
      type: node.UI_TYPES.LINEBREAK,
      width: 'full',
      height: 1,
      margin: [-8, 6, -8, 0],
    });
    expect(node.layoutMap.contentRegion.signalRegion.margin).toEqual([0, 6, 0, 0]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    expect(fullMap.footerRegion.anchor.target).toBe('contentRegion');

    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: 220 }, fullMap, { isVirtual: true }, true);

    const lastOutput = layout.regions.outputsRegion_display_3;
    const lastOutputBottom = lastOutput.y + lastOutput.h;
    const linebreakTop = layout.regions.signalBreak.y;
    const selectTop = layout.regions.signalRegion.y;

    expect(linebreakTop).toBeGreaterThanOrEqual(lastOutputBottom + 6 - 1);
    expect(selectTop).toBeGreaterThanOrEqual(linebreakTop + layout.regions.signalBreak.h + 6 - 1);
  });

  it('clips output rows before the selector in squeezed runtime manual height', async () => {
    const NodeType = await registerSignalOutNodeType();
    const manyOutputs = Array.from({ length: 10 }, (_, idx) => ({
      nodeId: `${101 + idx}:0`,
      nodeName: `Source ${idx + 1}`,
      type: 'STRING',
    }));
    const node = await makeSignalOutNode(NodeType, {
      activeOutputs: manyOutputs,
      autoHeight: false,
      size: [300, 170],
      properties: { settingActive: true },
    });

    node.refreshNodeLayoutMap();

    expect(node.layoutMap).toHaveProperty('routerContentAndSpringRegion');
    expect(node.layoutMap).toHaveProperty('selectSignalRegion');
    expect(node.layoutMap.routerContentAndSpringRegion.height).toBe('fill');
    expect(node.layoutMap.routerContentAndSpringRegion.outputsViewportRegion).toMatchObject({
      scrollViewport: true,
      width: 'full',
      height: 'auto',
    });
    expect(node.layoutMap.routerContentAndSpringRegion.springRegion).toMatchObject({
      height: 'fill',
      minHeight: 0,
    });
    expect(node.layoutMap.selectSignalRegion.signalBreak.margin).toEqual([-8, 6, -8, 0]);
    expect(node.layoutMap.selectSignalRegion.signalRegion.margin).toEqual([0, 6, 0, 0]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    expect(fullMap.footerRegion.anchor.target).toBe('selectSignalRegion');

    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: 170 }, fullMap, { isVirtual: true }, true);

    const viewportBottom = layout.regions.outputsViewportRegion.y + layout.regions.outputsViewportRegion.h;
    const linebreakTop = layout.regions.signalBreak.y;
    const selectTop = layout.regions.signalRegion.y;

    expect(viewportBottom).toBeLessThanOrEqual(linebreakTop - 6 + 1);
    expect(viewportBottom).toBeLessThanOrEqual(selectTop - 13);
    expect(node._contentViewportState?.outputsViewportRegion?.hasOverflow).toBe(true);
  });
});
