import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/fatha/core/fathaHandler.js', () => ({
  settleDerpSizeBeforeDraw: vi.fn(),
  shouldPreserveHorizontalDeckHeight: vi.fn(() => false),
  syncHorizontalDeckHeight: vi.fn(),
}));

vi.mock('../js/fatha/bastas/bastaSystemMessage.js', () => ({
  showBastaSystemMessage: vi.fn(),
}));

import {
  triggerWall_groupDrag,
  triggerWall_groupDragEnd,
  triggerWall_itemDrag,
  triggerWall_itemDragEnd,
  triggerWall_itemDragStart,
} from '../js/derps/controldeck/core/derpTriggerWall_core.js';

function makeTriggerWallNode() {
  const group = {
    triggers: [
      { id: 'a', label: 'A', active: true },
      { id: 'b', label: 'B', active: true },
      { id: 'c', label: 'C', active: true },
      { id: 'd', label: 'D', active: true },
    ],
  };

  return {
    _triggerGroupData: [group],
    properties: { triggerGroups: [group] },
    layout: {
      regions: {
        triggerItem_0_0: { key: 'triggerItem_0_0', x: 0, y: 0, w: 50, h: 20 },
        triggerItem_0_1: { key: 'triggerItem_0_1', x: 60, y: 0, w: 50, h: 20 },
        triggerItem_0_2: { key: 'triggerItem_0_2', x: 120, y: 0, w: 50, h: 20 },
        triggerItem_0_3: { key: 'triggerItem_0_3', x: 180, y: 0, w: 50, h: 20 },
      },
    },
    refreshNodeLayoutMap: vi.fn(),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    syncDerpOutputs: vi.fn(),
  };
}

function makeGroupedTriggerWallNode() {
  const groupA = {
    triggers: [
      { id: 'a', label: 'A', active: true },
      { id: 'b', label: 'B', active: true },
    ],
  };
  const groupB = {
    triggers: [
      { id: 'c', label: 'C', active: true },
      { id: 'd', label: 'D', active: true },
    ],
  };

  return {
    _triggerGroupData: [groupA, groupB],
    properties: { triggerGroups: [groupA, groupB] },
    layout: {
      regions: {
        triggerRegion_0: { key: 'triggerRegion_0', x: 0, y: 0, w: 140, h: 40 },
        triggerItem_0_0: { key: 'triggerItem_0_0', x: 0, y: 0, w: 50, h: 20 },
        triggerItem_0_1: { key: 'triggerItem_0_1', x: 60, y: 0, w: 50, h: 20 },
        triggerRegion_1: { key: 'triggerRegion_1', x: 0, y: 60, w: 140, h: 40 },
        triggerItem_1_0: { key: 'triggerItem_1_0', x: 0, y: 60, w: 50, h: 20 },
        triggerItem_1_1: { key: 'triggerItem_1_1', x: 60, y: 60, w: 50, h: 20 },
      },
    },
    refreshNodeLayoutMap: vi.fn(),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    syncDerpOutputs: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TriggerWall item drag and drop', () => {
  it('activates on pointer drift and reorders triggers on release', () => {
    vi.useFakeTimers();
    const node = makeTriggerWallNode();

    triggerWall_itemDragStart(node, {}, { localX: 10, localY: 10 }, 0, 0);
    expect(node._dragTrig?.holdOnly).toBe(false);
    expect(node._dragTrig?.dragKind).toBe('trigger');
    expect(node._dragThresholdMet).toBe(false);

    triggerWall_itemDrag(node, {}, { localX: 100, localY: 10 });

    expect(node._dragThresholdMet).toBe(true);
    expect(node._dropPreviewIdx).toBe(1);

    triggerWall_itemDragEnd(node, {}, { localX: 100, localY: 10 });

    expect(node._triggerGroupData[0].triggers.map((trigger) => trigger.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(node.syncDerpOutputs).toHaveBeenCalled();
    expect(node._dragTrig).toBeNull();
  });

  it('uses the release position so a trigger can move past multiple items', () => {
    vi.useFakeTimers();
    const node = makeTriggerWallNode();

    triggerWall_itemDragStart(node, {}, { localX: 10, localY: 10 }, 0, 0);
    triggerWall_itemDrag(node, {}, { localX: 100, localY: 10 });

    expect(node._dropPreviewIdx).toBe(1);

    triggerWall_itemDragEnd(node, {}, { localX: 240, localY: 10 });

    expect(node._triggerGroupData[0].triggers.map((trigger) => trigger.id)).toEqual(['b', 'c', 'd', 'a']);
    expect(node._dragTrig).toBeNull();
  });

  it('does not let trigger item drags enter the group drag path', () => {
    vi.useFakeTimers();
    const node = makeTriggerWallNode();

    triggerWall_itemDragStart(node, {}, { localX: 10, localY: 10 }, 0, 0);
    triggerWall_groupDrag(node, { localX: 100, localY: 10 }, [0]);

    expect(node._dragTrig?.dragKind).toBe('trigger');
    expect(node._dragThresholdMet).toBe(false);
    expect(node._dropPreviewIdx).toBeUndefined();

    triggerWall_groupDragEnd(node);

    expect(node._dragTrig?.dragKind).toBe('trigger');
  });

  it('moves triggers across groups', () => {
    vi.useFakeTimers();
    const node = makeGroupedTriggerWallNode();

    triggerWall_itemDragStart(node, {}, { localX: 10, localY: 10 }, 0, 0);
    triggerWall_itemDrag(node, {}, { localX: 40, localY: 70 });

    expect(node._dropPreviewGroupIdx).toBe(1);
    expect(node._dropPreviewIdx).toBe(1);
    expect(node._triggerGroupData[0].triggers.map((trigger) => trigger.id)).toEqual(['a', 'b']);
    expect(node._triggerGroupData[1].triggers.map((trigger) => trigger.id)).toEqual(['c', 'd']);
    expect(node._dragTrig?.dragKind).toBe('trigger');

    triggerWall_itemDragEnd(node, {}, { localX: 40, localY: 70 });

    expect(node._triggerGroupData[0].triggers.map((trigger) => trigger.id)).toEqual(['b']);
    expect(node._triggerGroupData[1].triggers.map((trigger) => trigger.id)).toEqual(['c', 'a', 'd']);
    expect(node.syncDerpOutputs).toHaveBeenCalled();
    expect(node._dragTrig).toBeNull();
    expect(node._dropPreviewGroupIdx).toBeUndefined();
  });
});
