import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: derpSeedV3 "Auto Logs" toggle.
// - Default ON: history rows pad to the 20-row cap and the viewport clip
//   floors to whole rows that exactly fit the available empty space.
// - OFF: rows follow seedHistoryLimit and the system-panel label/editor stay
//   visible; ON hides them.

async function buildSeedNode() {
  const extensions = [];
  window.app.registerExtension = (ext) => { extensions.push(ext); return ext; };
  await import('../js/derps/controldeck/derpSeedV3.js');
  const ext = extensions.find((e) => e.name === 'xcp.derpSeedV3_Extension');
  class NodeType {}
  await ext.beforeRegisterNodeDef(NodeType, { name: 'derpSeedV3' });
  return NodeType;
}

function makeSeedNode(NodeType, overrides = {}) {
  const node = new NodeType();
  Object.assign(node, {
    id: '42',
    type: 'derpSeedV3',
    mode: 0,
    flags: { collapsed: false },
    pos: [0, 0],
    size: [220, 400],
    widgets: [],
    properties: {},
    getDerpVars: () => ({ SNAP: 10, mW: 8, mH: 6, oY: 2, sW: 4, sH: 3, pW: 4, pH: 2, autoWidth: false }),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    ...overrides,
  });
  return node;
}

function historyRowKeys(layoutMap) {
  return Object.keys(layoutMap?.historyRegion || {}).filter((k) => k.startsWith('historySeed_'));
}

// Fabricate measured row regions: 20 rows, h=20, stride 24 (4px gap).
function fakeRowRegions() {
  const regions = {};
  for (let i = 0; i < 20; i++) regions[`historySeed_${i}`] = { y: i * 24, h: 20 };
  return regions;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'seed-auto-logs';
  window.xcpDerpSignals = {};
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpSeedV3 Auto Logs', () => {
  it('defaults ON and pads the display list to the 20-row cap', async () => {
    const NodeType = await buildSeedNode();
    const node = makeSeedNode(NodeType);
    node.refreshNodeLayoutMap();

    expect(node.properties.autoLogs).toBe(true);
    expect(historyRowKeys(node.layoutMap)).toHaveLength(20);
  });

  it('OFF keeps exactly seedHistoryLimit rows', async () => {
    const NodeType = await buildSeedNode();
    const node = makeSeedNode(NodeType, { properties: { autoLogs: false } });
    node.refreshNodeLayoutMap();

    expect(historyRowKeys(node.layoutMap)).toHaveLength(5);
  });

  it('clip floors to the whole-row count that exactly fits the available space', async () => {
    const NodeType = await buildSeedNode();
    const node = makeSeedNode(NodeType);
    node.refreshNodeLayoutMap();

    // available = 400 (nodeH) - 100 (regionY) - 6 (mH gap) - 0 (no footer) = 294
    // row span(k) = 24k - 4  ->  k=12 fits (284), k=13 (308) overflows
    const clip = node.layoutMap.historyRegion.clipHeight(node, { y: 100, h: 290 }, fakeRowRegions());
    expect(clip).toBe(284);
  });

  it('OFF clip keeps the limit-row fit behavior (partial-fit of full content)', async () => {
    const NodeType = await buildSeedNode();
    const node = makeSeedNode(NodeType, { properties: { autoLogs: false } });
    node.refreshNodeLayoutMap();

    // OFF: min(available 294, fullContent = 5 rows = 116), floored at 1 row
    const clip = node.layoutMap.historyRegion.clipHeight(node, { y: 100, h: 290 }, fakeRowRegions());
    expect(clip).toBe(294); // 20 fabricated rows fit -> full content span(20) = 476 > 294 -> min = 294
  });

  it('system panel hides History Logs label + count editor when ON, shows when OFF', async () => {
    const NodeType = await buildSeedNode();

    const nodeOn = makeSeedNode(NodeType);
    nodeOn.refreshDerpSeedV3SysMap();
    const rowOn = nodeOn.sysLayoutMap.sysContentRegion.settingsRow;
    expect(rowOn.toggleAutoLogs.value).toBe(true);
    expect(rowOn.toggleAutoLogs.toolTip).toContain('available space');
    expect(rowOn.historyLabel.hidden).toBe(true);
    expect(rowOn.historyCount.hidden).toBe(true);

    const nodeOff = makeSeedNode(NodeType, { properties: { autoLogs: false } });
    nodeOff.refreshDerpSeedV3SysMap();
    const rowOff = nodeOff.sysLayoutMap.sysContentRegion.settingsRow;
    expect(rowOff.historyLabel.hidden).toBe(false);
    expect(rowOff.historyCount.hidden).toBe(false);
  });
});
