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

async function registerTriggerWallNodeType() {
  const extensions = [];
  window.app.registerExtension = (extension) => {
    extensions.push(extension);
    return extension;
  };
  window._xcp_DerpVirtualLoader_Loaded = false;

  await import('../js/derps/controldeck/derpTriggerWall.js');

  const extension = extensions.find((item) => item.name === 'xcp.derpTriggerWall_Extension');
  expect(extension).toBeTruthy();

  class NodeType {}
  await extension.beforeRegisterNodeDef(NodeType, { name: 'DerpTriggerWallNode' });
  return NodeType;
}

async function makeTriggerWallNode(NodeType, overrides = {}) {
  const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
  const node = new NodeType();
  Object.assign(node, {
    id: 1,
    type: 'DerpTriggerWallNode',
    mode: 0,
    flags: { collapsed: false },
    pos: [0, 0],
    size: overrides.size || [300, 180],
    widgets: [],
    outputs: [],
    titleLabel: 'Derp Trigger Wall',
    properties: {
      drawHeader: true,
      drawSettingBtn: true,
      settingActive: false,
      triggerGroups: [],
      triggers: [],
      showWeight: true,
      toggleAddAlways: true,
      autoHeight: overrides.autoHeight ?? true,
      minWidth: 200,
      nodeSize: overrides.size || [300, 180],
      triggerWallClipVisibleLimit: '50',
      ...overrides.properties,
    },
    _triggerGroupData: [{
      id: 'group_loaded',
      title: 'Loaded Group',
      isExclusive: false,
      triggers: [{ id: 'trigger_a', label: 'A', active: true, weight: 1 }],
    }],
    _cachedPresetData: {
      triggerGroups: [
        { title: 'Loaded Group', triggers: [] },
        { title: 'Preset Group', triggers: [] },
      ],
    },
    _presetItems: [],
    _selectedRegions: {},
    _t_textSmallPaintData: { fontSize: 10, font: 'Arial', fontWeight: 'normal' },
    _t_textNormalPaintData: { fontSize: 12, font: 'Arial', fontWeight: 'normal' },
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
  });
  node.layout = new masterLayoutEngine(node);
  return node;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window._xcpDerpSession = 'trigger-wall-layout-regression';
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpTriggerWall layout', () => {
  it('packs the trigger-group selector tightly in runtime auto height mode', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, { autoHeight: true });

    node.refreshNodeLayoutMap();

    expect(node.properties.footerHeight).toBe(12);
    expect(node.layoutMap).toHaveProperty('contentRegion');
    expect(node.layoutMap).toHaveProperty('selectTriggerGroupRegion');
    expect(node.layoutMap).not.toHaveProperty('triggerWallContentAndSpringRegion');
    expect(node.layoutMap.selectTriggerGroupRegion).not.toHaveProperty('springRegion');
    expect(node.layoutMap.selectTriggerGroupRegion.linebreakBeforeSelectTriggerGroup).toMatchObject({
      type: node.UI_TYPES.LINEBREAK,
      width: 'full',
      height: 1,
      margin: [-8, 6, -8, 0],
    });
    expect(node.layoutMap.selectTriggerGroupRegion.regionSelectTriggerGroup.margin).toEqual([0, 6, 0, 0]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    expect(fullMap.footerRegion.anchor.target).toBe('selectTriggerGroupRegion');
  });

  it('bottom-aligns the trigger-group selector in runtime manual height mode', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [300, 520],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });

    node.refreshNodeLayoutMap();

    expect(node.layoutMap).toHaveProperty('triggerWallContentAndSpringRegion');
    expect(node.layoutMap).toHaveProperty('selectTriggerGroupRegion');
    expect(node.layoutMap.triggerWallContentAndSpringRegion.height).toBe('fill');
    expect(node.layoutMap.triggerWallContentAndSpringRegion.springRegion).toMatchObject({
      height: 'fill',
      minHeight: 0,
    });
    expect(node.layoutMap.selectTriggerGroupRegion.linebreakBeforeSelectTriggerGroup.margin).toEqual([-8, 6, -8, 0]);

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    expect(fullMap.footerRegion.anchor.target).toBe('selectTriggerGroupRegion');

    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: 520 }, fullMap, { isVirtual: true }, true);

    const groupBottom = layout.regions.triggerRegion_0.y + layout.regions.triggerRegion_0.h + layout.regions.triggerRegion_0.margin[3];
    const surplusAboveSelector = layout.regions.linebreakBeforeSelectTriggerGroup.y - groupBottom;

    expect(surplusAboveSelector).toBeGreaterThan(200);
    expect(layout.regions.dropdownTriggerGroup.y + layout.regions.dropdownTriggerGroup.h).toBeLessThanOrEqual(520 - 12 + 1);
    expect(layout.regions.footerRegion.h).toBeLessThanOrEqual(12);
  });

  it('does not show a groups scrollbar when all manual-height groups fit', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [620, 540],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData.push(
      {
        id: 'group_loaded_2',
        title: 'Loaded Group 2',
        isExclusive: false,
        triggers: [{ id: 'trigger_b', label: 'B', active: true, weight: 1 }],
      },
      {
        id: 'group_loaded_3',
        title: 'Loaded Group 3',
        isExclusive: false,
        triggers: [
          { id: 'trigger_c', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_d', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_e', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_f', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_g', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_h', label: 'Trigger Test', active: true, weight: 1 },
        ],
      },
    );

    node.refreshNodeLayoutMap();

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 620, h: 540 }, fullMap, { isVirtual: true }, true);

    const state = node._contentViewportState?.triggerGroupsViewportRegion;

    expect(state).toMatchObject({
      hasOverflow: false,
      gutter: 0,
    });
  });

  it('clips wrapped bottom trigger groups before the selector in squeezed manual height', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [620, 170],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData.push(
      {
        id: 'group_loaded_2',
        title: 'Loaded Group 2',
        isExclusive: false,
        triggers: [{ id: 'trigger_b', label: 'B', active: true, weight: 1 }],
      },
      {
        id: 'group_loaded_3',
        title: 'Loaded Group 3',
        isExclusive: false,
        triggers: [
          { id: 'trigger_c', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_d', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_e', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_f', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_g', label: 'Trigger Test', active: true, weight: 1 },
          { id: 'trigger_h', label: 'Trigger Test', active: true, weight: 1 },
        ],
      },
    );

    node.refreshNodeLayoutMap();

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 620, h: 170 }, fullMap, { isVirtual: true }, true);

    const viewportBottom = layout.regions.triggerGroupsViewportRegion.y + layout.regions.triggerGroupsViewportRegion.h;
    const linebreakTop = layout.regions.linebreakBeforeSelectTriggerGroup.y;
    const selectTop = layout.regions.regionSelectTriggerGroup.y;

    expect(viewportBottom).toBeLessThanOrEqual(linebreakTop - 6 + 1);
    expect(viewportBottom).toBeLessThanOrEqual(selectTop - 13);
    expect(node._contentViewportState?.triggerGroupsViewportRegion?.hasOverflow).toBe(true);
  });

  it('keeps the groups viewport clear of the selector linebreak', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [300, 220],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData.push({
      id: 'group_loaded_2',
      title: 'Loaded Group 2',
      isExclusive: false,
      triggers: [{ id: 'trigger_b', label: 'B', active: true, weight: 1 }],
    });

    node.refreshNodeLayoutMap();

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: 220 }, fullMap, { isVirtual: true }, true);

    const viewportBottom = layout.regions.triggerGroupsViewportRegion.y + layout.regions.triggerGroupsViewportRegion.h;
    const linebreakTop = layout.regions.linebreakBeforeSelectTriggerGroup.y;

    expect(viewportBottom).toBeLessThanOrEqual(linebreakTop - 6 + 1);
  });

  it('lets manual height shrink until group and selector gaps are compact', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [300, 520],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData.push(
      {
        id: 'group_loaded_2',
        title: 'Loaded Group 2',
        isExclusive: false,
        triggers: [{ id: 'trigger_b', label: 'B', active: true, weight: 1 }],
      },
      {
        id: 'group_loaded_3',
        title: 'Loaded Group 3',
        isExclusive: false,
        triggers: [{ id: 'trigger_c', label: 'C', active: true, weight: 1 }],
      },
    );

    node.refreshNodeLayoutMap();

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const { getVerticalResizeTargetMinHeight } = await import('../js/fatha/core/dockResize.js');
    const fullMap = getVirtualNodeLayoutMap(node);

    node.layout.compute({ x: 0, y: 0, w: 300, h: 520 }, fullMap, { isVirtual: true }, true);
    const minHeight = getVerticalResizeTargetMinHeight(node, 10);
    node.size = [300, minHeight];
    node.properties.nodeSize = [300, minHeight];

    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: minHeight }, fullMap, { isVirtual: true }, true);

    const gapBetweenGroups = layout.regions.triggerRegion_1.y
      - (layout.regions.triggerRegion_0.y + layout.regions.triggerRegion_0.h);
    const lastGroupBottom = layout.regions.triggerRegion_2.y + layout.regions.triggerRegion_2.h;
    const gapAboveLinebreak = layout.regions.linebreakBeforeSelectTriggerGroup.y - lastGroupBottom;
    const viewportBottom = layout.regions.triggerGroupsViewportRegion.y + layout.regions.triggerGroupsViewportRegion.h;

    expect(gapBetweenGroups).toBe(3);
    expect(gapAboveLinebreak).toBe(6);
    expect(viewportBottom).toBeLessThanOrEqual(lastGroupBottom);
  });

  it('clips viewport descendants even when overflow state is not raised', async () => {
    const { getContentViewportDrawInfo } = await import('../js/fatha/core/fathaContentViewportDraw.js');
    const node = {
      _contentViewportState: {
        triggerGroupsViewportRegion: {
          key: 'triggerGroupsViewportRegion',
          rect: { x: 0, y: 40, w: 300, h: 40 },
          hasOverflow: false,
        },
      },
      layout: {
        regions: {
          triggerGroupsViewportRegion: { key: 'triggerGroupsViewportRegion' },
          triggerRegion_2: { key: 'triggerRegion_2', parentKey: 'triggerGroupsViewportRegion' },
        },
      },
      _contentViewportScroll: {},
    };

    const info = getContentViewportDrawInfo(node, 'triggerRegion_2', { x: 0, y: 70, w: 300, h: 40 });

    expect(info?.state?.key).toBe('triggerGroupsViewportRegion');
    expect(info.hidden).toBe(false);
  });
});
