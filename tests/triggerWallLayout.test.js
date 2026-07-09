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

  it('uses sH as the only spacing between trigger group entries', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [300, 260],
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
    const fullMap = getVirtualNodeLayoutMap(node);
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 300, h: 260 }, fullMap, { isVirtual: true }, true);

    const first = layout.regions.triggerRegion_0;
    const middle = layout.regions.triggerRegion_1;
    const last = layout.regions.triggerRegion_2;
    const firstGap = middle.y - (first.y + first.h);
    const secondGap = last.y - (middle.y + middle.h);

    expect(first.margin[1]).toBe(6);
    expect(first.margin[3]).toBe(0);
    expect(middle.margin[1]).toBe(3);
    expect(middle.margin[3]).toBe(0);
    expect(last.margin[1]).toBe(3);
    expect(last.margin[3]).toBe(6);
    expect(first.anchor.offset).toBe(0);
    expect(middle.anchor.offset).toBe(0);
    expect(last.anchor.offset).toBe(0);
    expect(firstGap).toBe(3);
    expect(secondGap).toBe(3);
  });

  it('keeps trigger rows evenly inset inside every trigger group', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [620, 300],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData.push(
      {
        id: 'group_loaded_2',
        title: 'Loaded Group 2',
        isExclusive: false,
        triggers: [{ id: 'trigger_b', label: 'New Trigger', active: true, weight: 1 }],
      },
      {
        id: 'group_loaded_3',
        title: 'Loaded Group 3',
        isExclusive: false,
        triggers: [
          { id: 'trigger_c', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_d', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_e', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_f', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_g', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_h', label: 'New Trigger', active: true, weight: 1 },
        ],
      },
    );

    node.refreshNodeLayoutMap();

    const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
    const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
    const fullMap = getVirtualNodeLayoutMap(node);
    const layout = new masterLayoutEngine(node);
    layout.compute({ x: 0, y: 0, w: 620, h: 300 }, fullMap, { isVirtual: true }, true);

    const getInsets = (groupIdx) => {
      const group = layout.regions[`triggerRegion_${groupIdx}`];
      const rows = Object.entries(layout.regions)
        .filter(([key]) => key.startsWith(`triggerRow_${groupIdx}_`))
        .map(([, row]) => row)
        .sort((a, b) => a.y - b.y);
      const firstRow = rows[0];
      const lastRow = rows[rows.length - 1];
      return {
        top: firstRow.y - group.y,
        bottom: group.y + group.h - (lastRow.y + lastRow.h),
      };
    };

    const referenceInset = getInsets(2).top;

    expect(layout.regions.triggerRow_0_0.margin[0]).toBe(-8);
    expect(layout.regions.triggerRow_0_0.margin[2]).toBe(-8);
    expect(layout.regions.triggerRow_2_0.margin[0]).toBe(-8);
    expect(layout.regions.triggerRow_2_0.margin[2]).toBe(-8);
    expect(layout.regions.triggerRow_2_1.x).toBe(layout.regions.triggerRow_2_0.x);
    expect(layout.regions.triggerRow_2_1.x + layout.regions.triggerRow_2_1.w).toBe(layout.regions.triggerRow_2_0.x + layout.regions.triggerRow_2_0.w);
    expect(getInsets(0)).toEqual({ top: referenceInset, bottom: referenceInset });
    expect(getInsets(1)).toEqual({ top: referenceInset, bottom: referenceInset });
    expect(getInsets(2)).toEqual({ top: referenceInset, bottom: referenceInset });
  });

  it('changes the visual hash when same-looking trigger groups are reordered', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [620, 300],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData = [
      {
        id: 'group_a',
        title: 'Group A',
        isExclusive: false,
        triggers: [{ id: 'trigger_a', label: 'New Trigger', active: true, weight: 1 }],
      },
      {
        id: 'group_b',
        title: 'Group B',
        isExclusive: false,
        triggers: [{ id: 'trigger_b', label: 'New Trigger', active: true, weight: 1 }],
      },
      {
        id: 'group_c',
        title: 'Group C',
        isExclusive: false,
        triggers: [{ id: 'trigger_c', label: 'New Trigger', active: true, weight: 1 }],
      },
    ];

    node.refreshNodeLayoutMap();
    const originalHash = node._triggerWallVisualHash;

    const { triggerWall_reorderGroups } = await import('../js/derps/controldeck/core/derpTriggerWall_core.js');
    triggerWall_reorderGroups(node, 0, 2);
    node.refreshNodeLayoutMap();

    expect(node._triggerGroupData.map((group) => group.id)).toEqual(['group_b', 'group_c', 'group_a']);
    expect(node._triggerWallVisualHash).not.toBe(originalHash);
  });

  it('keeps trigger rows evenly inset after moving a wrapped trigger group to the middle', async () => {
    const NodeType = await registerTriggerWallNodeType();
    const node = await makeTriggerWallNode(NodeType, {
      autoHeight: false,
      size: [520, 500],
      properties: { triggerWallClipVisibleLimit: 'Auto' },
    });
    node._triggerGroupData = [
      {
        id: 'group_a',
        title: 'Group A',
        isExclusive: false,
        triggers: [
          { id: 'trigger_a1', label: 'Test', active: true, weight: 1 },
          { id: 'trigger_a2', label: 'New Trigger', active: true, weight: 1 },
        ],
      },
      {
        id: 'group_b',
        title: 'Group B',
        isExclusive: false,
        triggers: [{ id: 'trigger_b1', label: 'New Trigger', active: true, weight: 1 }],
      },
      {
        id: 'group_c',
        title: 'Group C',
        isExclusive: false,
        triggers: [
          { id: 'trigger_c1', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_c2', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_c3', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_c4', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_c5', label: 'New Trigger', active: true, weight: 1 },
          { id: 'trigger_c6', label: 'New Trigger', active: true, weight: 1 },
        ],
      },
    ];

    const computeLayout = async () => {
      node.refreshNodeLayoutMap();
      const { getVirtualNodeLayoutMap } = await import('../js/fatha/helpers/fathaLayoutMaps.js');
      const { masterLayoutEngine } = await import('../js/fatha/core/masterLayoutEngine.js');
      const fullMap = getVirtualNodeLayoutMap(node);
      const layout = new masterLayoutEngine(node);
      layout.compute({ x: 0, y: 0, w: 520, h: 500 }, fullMap, { isVirtual: true }, true);
      return layout;
    };
    const getInsets = (layout, groupIdx) => {
      const group = layout.regions[`triggerRegion_${groupIdx}`];
      const rows = Object.entries(layout.regions)
        .filter(([key]) => key.startsWith(`triggerRow_${groupIdx}_`))
        .map(([, row]) => row)
        .sort((a, b) => a.y - b.y);
      const firstRow = rows[0];
      const lastRow = rows[rows.length - 1];
      return {
        top: firstRow.y - group.y,
        bottom: group.y + group.h - (lastRow.y + lastRow.h),
      };
    };

    const { triggerWall_reorderGroups } = await import('../js/derps/controldeck/core/derpTriggerWall_core.js');
    triggerWall_reorderGroups(node, 2, 1);
    const layout = await computeLayout();
    const referenceInset = getInsets(layout, 1).top;

    expect(node._triggerGroupData.map((group) => group.id)).toEqual(['group_a', 'group_c', 'group_b']);
    expect(getInsets(layout, 0)).toEqual({ top: referenceInset, bottom: referenceInset });
    expect(getInsets(layout, 1)).toEqual({ top: referenceInset, bottom: referenceInset });
    expect(getInsets(layout, 2)).toEqual({ top: referenceInset, bottom: referenceInset });
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
    const viewportBottom = layout.regions.triggerGroupsViewportRegion.y + layout.regions.triggerGroupsViewportRegion.h;
    const visibleGroupBottom = Math.min(lastGroupBottom, viewportBottom);
    const gapAboveLinebreak = layout.regions.linebreakBeforeSelectTriggerGroup.y - visibleGroupBottom;

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
