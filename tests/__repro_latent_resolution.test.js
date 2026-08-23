import { beforeEach, describe, expect, it, vi } from 'vitest';

const KREA2_PRESETS = [
  { aspectRatio: '1 : 1', width: 1024, height: 1024 },
  { aspectRatio: '4 : 3', width: 1152, height: 864 },
  { aspectRatio: '3 : 2', width: 1248, height: 832 },
  { aspectRatio: '16 : 9', width: 1280, height: 720 },
];

// Must mirror snapDerpLatentTo16 in derpLatent.js: sqrt(MP) scaling of the
// 1MP base preset (ComfyUI core ResolutionSelector convention), snapped to
// the nearest multiple of 16 (Krea-2 VAE 8x + patch 2 requirement).
const snap16 = (value) => Math.max(16, Math.round(value / 16) * 16);

async function registerLatentNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };

  await import('../js/derps/controldeck/derpLatent.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpLatent_Extension');
  expect(extension).toBeTruthy();

  class NodeType {}
  await extension.beforeRegisterNodeDef(NodeType, { name: 'DerpLatentNode' });
  return NodeType;
}

function makeLatentNode(NodeType, overrides = {}) {
  const node = new NodeType();
  Object.assign(node, {
    id: 42,
    type: 'DerpLatentNode',
    mode: 0,
    flags: { collapsed: false },
    size: [300, 200],
    outputs: [{ name: 'Latent', type: 'LATENT' }],
    titleLabel: 'Derp Latent',
    getDerpVars: () => ({
      SNAP: 10, mW: 8, mH: 6, sW: 4, sH: 3, pW: 4, pH: 2, oX: 0, oY: 0,
      t_textNormal_size: 12,
    }),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    properties: {
      width: 1024,
      height: 1024,
      batchSize: 1,
      editorMP: 2.0,
      mode: 'Landscape',
      latentPresets: KREA2_PRESETS,
      selectedLatent: '1:1 - 1024 x 1024',
      outputResolution: true,
      outputLatent: true,
      drawHeader: true,
      ...overrides.properties,
    },
    ...overrides.node,
  });
  return node;
}

async function registerSignalOutNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };

  await import('../js/derpSignalOut_core.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpSignalOut_Core');
  expect(extension).toBeTruthy();

  class RouterType {}
  await extension.beforeRegisterNodeDef(RouterType, { name: 'xcpDerpSignalOut' });
  return RouterType;
}

function makeSignalOutNode(RouterType, overrides = {}) {
  const activeOutputs = overrides.activeOutputs || [];
  const node = new RouterType();
  Object.assign(node, {
    id: 10,
    type: 'xcpDerpSignalOut',
    mode: 0,
    flags: { collapsed: false },
    size: [300, 180],
    widgets: [{ name: 'signal_data', value: '' }],
    outputs: activeOutputs.map(() => ({ links: [] })),
    _xcpTrueOutputs: activeOutputs.map(() => ({ links: [] })),
    titleLabel: 'Router',
    properties: {
      activeOutputs: activeOutputs.length,
      showSignalIds: true,
      showSlotNames: true,
      showSlotTypes: true,
      showVirtualLinks: false,
      hideLinkSlots: true,
      signalSortMode: 'Type',
      ...(overrides.properties || {}),
    },
    activeOutputs,
    receivedSignals: [...activeOutputs],
    getDerpVars: () => ({
      SNAP: 10, mW: 8, mH: 6, sW: 4, sH: 3, pW: 4, pH: 2,
      t_textNormal_size: 12, t_textSmall_size: 10,
    }),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    manageDerpOutputs: vi.fn(),
    refreshNodeLayoutMap: vi.fn(),
  });
  return node;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'latent-resolution-repro';
  window.xcpDerpSignals = {};
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpLatent Output Resolution signals', () => {
  it('broadcasts aspect-aware Width/Height INT signals at MP 2.0', async () => {
    const NodeType = await registerLatentNodeType();
    const node = makeLatentNode(NodeType);

    node.refreshNodeLayoutMap();

    const selector = node.layoutMap?.sysContentRegion?.row1?.latentSelector;
    expect(selector).toBeTruthy();

    // User selects 16:9 aspect ratio
    selector.onChange('16:9 - 1280 x 720');

    const wSig = window.xcpDerpSignals['42:1'];
    const hSig = window.xcpDerpSignals['42:2'];
    expect(wSig?.type).toBe('INT');
    expect(hSig?.type).toBe('INT');
    // Exact expected values at MP 2.0: sqrt(2) scaling of the 16:9 preset, /16 snapped
    expect(wSig?.value).toBe(1808);  // snap16(1280 * sqrt(2))
    expect(hSig?.value).toBe(1024);  // snap16(720 * sqrt(2))

    // Switch to 4:3 — values must track the new aspect
    selector.onChange('4:3 - 1152 x 864');
    expect(window.xcpDerpSignals['42:1']?.value).toBe(snap16(1152 * Math.sqrt(2)));
    expect(window.xcpDerpSignals['42:2']?.value).toBe(snap16(864 * Math.sqrt(2)));

    // Switch to 1:1 — 1024 @ MP 2.0 is 1456 (2.1MP), NOT 2048 (that is MP 4.0)
    selector.onChange('1:1 - 1024 x 1024');
    expect(window.xcpDerpSignals['42:1']?.value).toBe(1456);
    expect(window.xcpDerpSignals['42:2']?.value).toBe(1456);
  });

  it('updates Width/Height signals when MP changes via editor blur (full Router pipeline)', async () => {
    const NodeType = await registerLatentNodeType();
    const node = makeLatentNode(NodeType, { properties: { editorMP: 1.0 } });
    node.refreshNodeLayoutMap();
    node.broadcastLatentState();

    // Router picks up Width/Height signals
    const RouterType = await registerSignalOutNodeType();
    const router = makeSignalOutNode(RouterType, {
      activeOutputs: [
        { nodeId: '42:1', nodeName: 'Derp Latent [Width]', type: 'INT', value: 1280 },
        { nodeId: '42:2', nodeName: 'Derp Latent [Height]', type: 'INT', value: 720 },
      ],
    });
    router.widgets = [{ name: 'signal_data', value: '' }];
    window.app.graph._nodes = [router];
    window.app.graph.getNodeById = (id) => (String(id) === '42' ? node : null);
    router.updateReceivedSignals(true);

    const readQueuedSignalData = () => JSON.parse(router.widgets[0].value);
    let queued = readQueuedSignalData();
    expect(queued.signals['42:1']?.value).toBe(1024); // MP 1.0 baseline (1:1 preset)

    // --- User changes MP from 1.0 to 2.0 via the MP editor's onBlur ---
    const mpEditor = node.layoutMap?.sysContentRegion?.row1?.editorMP;
    expect(mpEditor).toBeTruthy();
    mpEditor.onBlur('2.0');

    // Registry signals must reflect sqrt(2) scaling, /16 snapped
    expect(window.xcpDerpSignals['42:1']?.value).toBe(snap16(1024 * Math.sqrt(2)));
    expect(window.xcpDerpSignals['42:2']?.value).toBe(snap16(1024 * Math.sqrt(2)));

    // The Router's queued signal_data widget must carry the fresh values
    queued = readQueuedSignalData();
    expect(queued.signals['42:1']?.value).toBe(snap16(1024 * Math.sqrt(2)));
    expect(queued.signals['42:2']?.value).toBe(snap16(1024 * Math.sqrt(2)));

    // --- User changes MP to 3.0 ---
    node.layoutMap.sysContentRegion.row1.editorMP.onBlur('3.0');
    queued = readQueuedSignalData();
    expect(queued.signals['42:1']?.value).toBe(snap16(1024 * Math.sqrt(3)));
    expect(queued.signals['42:2']?.value).toBe(snap16(1024 * Math.sqrt(3)));

    // --- Aspect change must also flow through to queued data ---
    node.layoutMap.sysContentRegion.row1.latentSelector.onChange('16:9 - 1280 x 720');
    queued = readQueuedSignalData();
    expect(queued.signals['42:1']?.value).toBe(snap16(1280 * Math.sqrt(3)));
    expect(queued.signals['42:2']?.value).toBe(snap16(720 * Math.sqrt(3)));
  });

  it('purges Width/Height slots when Output Resolution is toggled off', async () => {
    const NodeType = await registerLatentNodeType();
    const node = makeLatentNode(NodeType, { properties: { outputResolution: false } });
    node.refreshNodeLayoutMap();
    node.broadcastLatentState();
    expect(window.xcpDerpSignals['42:1']).toBeUndefined();
    expect(window.xcpDerpSignals['42:2']).toBeUndefined();
  });
});
