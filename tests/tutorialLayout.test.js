import { beforeEach, describe, expect, it, vi } from 'vitest';

async function registerTutorialNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };
  window._xcp_DerpVirtualLoader_Loaded = false;

  await import('../js/derps/controldeck/derpTutorial.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpTutorial_Extension');
  expect(extension).toBeTruthy();

  class NodeType {}
  await extension.beforeRegisterNodeDef(NodeType, { name: 'DerpTutorialNode' });
  return NodeType;
}

function makeTutorialNode(NodeType, overrides = {}) {
  const node = new NodeType();
  Object.assign(node, {
    id: 1,
    type: 'DerpTutorialNode',
    mode: 0,
    flags: { collapsed: false },
    pos: [0, 0],
    size: overrides.size || [360, 900],
    widgets: [],
    outputs: [],
    properties: {
      drawHeader: true,
      autoWidth: false,
      autoHeight: overrides.autoHeight ?? false,
      nodeSize: overrides.size || [360, 900],
      ...overrides.properties,
    },
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
  });
  node.onNodeCreated();
  if (overrides.autoHeight === false) {
    node.properties.autoHeight = false;
    node.properties.nodeSize = overrides.size || [360, 900];
    node.size = overrides.size || [360, 900];
  }
  return node;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'tutorial-layout-regression';
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ items: [] }),
    text: async () => '',
  }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpTutorial layout', () => {
  it('keeps the packed resize floor small after a versioned manual height is large', async () => {
    const NodeType = await registerTutorialNodeType();
    const node = makeTutorialNode(NodeType, { autoHeight: false, size: [360, 900] });
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { getVerticalResizeTargetMinHeight } = await import('../js/fatha/core/dockResize.js');

    node.layout = new masterLayoutEngine(node);
    node.refreshNodeLayoutMap();
    node.layout.compute({ x: 0, y: 0, w: 360, h: 900 }, getVirtualNodeLayoutMap(node), { isVirtual: true }, true);

    expect(node.layout.regions.tutorialRegion.h).toBeLessThan(140);
    expect(getVerticalResizeTargetMinHeight(node, 10)).toBeLessThan(180);
  });

  it('migrates unversioned oversized tutorial nodes back to compact Auto height', async () => {
    const NodeType = await registerTutorialNodeType();
    const node = makeTutorialNode(NodeType, {
      autoHeight: false,
      size: [360, 900],
    });
    delete node.properties._derpTutorialSizingVersion;

    node.onConfigure({});

    expect(node.properties.autoHeight).toBe(true);
    expect(node.properties.nodeSize[1]).toBeLessThan(140);
    expect(node.properties._derpTutorialSizingVersion).toBe(2);
  });

  it('compacts versioned saved manual height on graph configure', async () => {
    const NodeType = await registerTutorialNodeType();
    const node = makeTutorialNode(NodeType, {
      autoHeight: false,
      size: [360, 900],
      properties: { _derpTutorialSizingVersion: 2 },
    });

    node.onConfigure({});

    expect(node.properties.autoHeight).toBe(true);
    expect(node.properties.nodeSize[1]).toBeLessThan(140);
  });

  it('restores stale deck-saved Auto height to standalone Auto height', async () => {
    const NodeType = await registerTutorialNodeType();
    const node = makeTutorialNode(NodeType, {
      autoHeight: false,
      size: [360, 900],
    });
    node.properties.deckSavedAutoHeight = true;
    node.properties._derpPreferredAutoHeight = true;

    node.onConfigure({});

    expect(node.properties.autoHeight).toBe(true);
    expect(node.properties.deckSavedAutoHeight).toBeUndefined();
    expect(node.properties._derpPreferredAutoHeight).toBeUndefined();
    expect(node.properties.nodeSize[1]).toBeLessThan(140);
  });

  it('does not inflate contentMinHeight when introText wraps during PASS 1 (SQUISH_WIDTH)', async () => {
    // Regression: PASS 1 measures layout at SQUISH_WIDTH=10. Without the
    // isMeasurePass flag, interpretLayoutProps would use geometry.w (10px) as
    // the wrap boundary for the introText widget, producing ~75 lines instead
    // of ~2 and inflating contentMinHeight from ~120 to ~900. This blocked
    // auto-height from settling to the packed size (excessive empty space).
    const NodeType = await registerTutorialNodeType();
    const node = makeTutorialNode(NodeType, { autoHeight: true, size: [360, 50] });
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');

    // Test environment has no theme config; provide paint data so measureTextHeight
    // gets a real fontSize and actually exercises the wrap path.
    node._t_textSmallPaintData = { fontSize: 10, font: 'Arial', fontWeight: 'normal' };
    node._t_textNormalPaintData = { fontSize: 12, font: 'Arial', fontWeight: 'normal' };
    node._t_textBigPaintData = { fontSize: 14, font: 'Arial', fontWeight: 'normal' };

    node.layout = new masterLayoutEngine(node);
    node.refreshNodeLayoutMap();
    node.layout.compute({ x: 0, y: 0, w: 360, h: 50 }, getVirtualNodeLayoutMap(node), { isVirtual: true }, true);

    const pass1ContentMinH = Number(node.layout.contentMinHeight) || 0;
    const pass2TotalH = Number(node.layout.totalHeight) || 0;

    // PASS 1 must measure wrap at the node's physical width (via fallback),
    // not at SQUISH_WIDTH=10. Inflated PASS 1 would put contentMinHeight at
    // ~900 (75 lines * 12px); correct measurement keeps it under ~300.
    expect(pass1ContentMinH).toBeLessThan(300);
    // PASS 1 content minimum should stay within a small factor of PASS 2 total
    // (both reflect ~2-line wrap at ~360px). A 5x+ ratio indicates inflation.
    expect(pass1ContentMinH).toBeLessThan(pass2TotalH * 3 + 50);
  });
});
