import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: derpConcatenate must never list its own signal in the add-signal
// picker — across the spawn("-1" ghost) -> graph.add(real id) transition.
// The frontend assigns ids as strings, so the guards must be string-safe.

async function buildConcatNode() {
  const extensions = [];
  window.app.registerExtension = (ext) => { extensions.push(ext); return ext; };
  await import('../js/derps/utils/derpConcatenate.js');
  const ext = extensions.find((e) => e.name === 'xcp.derpConcatenate_Extension');
  class NodeType {}
  await ext.beforeRegisterNodeDef(NodeType, { name: 'derpConcatenate' });
  return NodeType;
}

function makeConcatNode(NodeType) {
  const node = new NodeType();
  node.id = '-1'; // freshly spawned, not yet added — string ghost id
  node.type = 'derpConcatenate';
  node.mode = 0;
  node.flags = { collapsed: false };
  node.pos = [0, 0];
  node.size = [300, 200];
  node.properties = { multiSignalIds: {}, multiSignalLabels: {}, signalDeck: [] };
  node.outputs = [];
  node.titleLabel = 'Concat';
  return node;
}

function pickerItems(node) {
  const region = node.layoutMap?.contentRegion?.regionSignals;
  const picker = region ? Object.values(region).find((r) => r && r.icon === 'signal') : null;
  return (picker?.items || []).map((it) => it.value);
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'concat-self';
  window.xcpDerpSignals = { '7:0': { nodeId: '7:0', nodeName: 'Src [STRING]', type: 'STRING', value: 'x' } };
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  window.app.canvas = { setDirty: vi.fn(), ds: { scale: 1, offset: [0, 0] }, canvas: document.createElement('canvas') };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpConcatenate self-filter', () => {
  it('never writes a ghost "-1" signal, and self-filters after graph.add', async () => {
    const NodeType = await buildConcatNode();
    const node = makeConcatNode(NodeType);

    // Stage 1: ghost spawn. syncDerpOutputs must NOT write a "-1:0" entry.
    node.refreshNodeLayoutMap();
    node.syncDerpOutputs();
    expect(window.xcpDerpSignals['-1:0']).toBeUndefined();

    // Stage 2: graph.add assigns the real id.
    node.id = '42';
    window.app.graph.getNodeById = (id) => (String(id) === '42' ? node : null);
    window.app.graph._nodes = [node];
    node.refreshNodeLayoutMap();
    node.syncDerpOutputs();

    // Own signal registered under the real id.
    expect(window.xcpDerpSignals['42:0']).toBeTruthy();

    // The add-signal picker must never list the node itself or a ghost id.
    // (Source-presence depends on a live graph source node, which the mock graph
    // doesn't provide, so we only assert the negative: self + ghosts excluded.)
    const items = pickerItems(node);
    expect(items.some((v) => String(v).startsWith('42:'))).toBe(false);
    expect(items.some((v) => String(v).startsWith('-1'))).toBe(false);
  });

  it('excludes already-selected inputs from the picker', async () => {
    const NodeType = await buildConcatNode();
    const node = makeConcatNode(NodeType);
    node.id = '42';
    node.properties.multiSignalIds = { 0: '7:0' };
    window.app.graph.getNodeById = (id) => (String(id) === '42' ? node : null);
    window.app.graph._nodes = [node];
    node.refreshNodeLayoutMap();

    const items = pickerItems(node);
    expect(items).not.toContain('7:0'); // already selected
  });
});
