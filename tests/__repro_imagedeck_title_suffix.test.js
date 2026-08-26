import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression test for the ImageDeck title-bar signal info suffix:
// " - Image received at HH:MM:SS, Res: WxH, Generated in HH:MM:SS".
// The suffix must be display-only (never part of the editable title) and must
// be produced by the framework hook getDerpTitleDisplaySuffix().

async function makeImageDeckNode(overrides = {}) {
  const { initDerpImageDeckCore } = await import('../js/derps/controldeck/core/derpImageDeck_core.js');

  class NodeType {}
  initDerpImageDeckCore(NodeType);
  const proto = NodeType.prototype;

  const node = Object.create(proto);
  Object.assign(node, {
    id: 42,
    type: 'DerpImageDeckNode',
    mode: 0,
    flags: { collapsed: false },
    pos: [0, 0],
    size: [500, 500],
    properties: {
      nodeSize: [500, 500],
      multiSignalIds: { 0: '7:0' },
      toggleAutoFit: false,
      contentCollapsed: false,
      pinActive: false,
    },
    _derpImageDeckList: [],
    _derpImageDeckIndex: 0,
    getDerpVars: () => ({ SNAP: 10, mW: 8, mH: 6, sW: 4, sH: 3, pW: 4, pH: 2 }),
    refreshNodeLayoutMap: vi.fn(),
    requestDerpSync: vi.fn(),
    setDirtyCanvas: vi.fn(),
    syncUncleSlots: vi.fn(),
    ...overrides,
  });
  return node;
}

// The suffix lives in derpImageDeck.js (prototype registered on the full node
// type), so replicate the exact provider contract for the core-level fields it
// reads: _imageDeckReceivedAt / _imageDeckImageResolution / _imageDeckExecDurationMs.
function buildSuffix(node) {
  const receivedAt = node._imageDeckReceivedAt instanceof Date ? node._imageDeckReceivedAt : null;
  if (!receivedAt) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const clock = `${pad(receivedAt.getHours())}:${pad(receivedAt.getMinutes())}:${pad(receivedAt.getSeconds())}`;
  const res = String(node._imageDeckImageResolution || "...");
  // Gate on the raw value: Number(null) === 0 would fake a "00:00:00" duration.
  const durationMs = node._imageDeckExecDurationMs;
  const totalSeconds = Number.isFinite(durationMs) && durationMs >= 0 ? Math.floor(durationMs / 1000) : null;
  const duration = totalSeconds !== null
    ? `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds % 3600) / 60))}:${pad(totalSeconds % 60)}`
    : "--:--:--";
  return ` - Image received at ${clock}, Res: ${res}, Generated in ${duration}`;
}

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpLocaleData = {};
  window.xcpDerpSignals = {};
  window.app.graph = { links: {}, getNodeById: () => null, _nodes: [] };
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('derpImageDeck title signal info suffix', () => {
  it('applyDerpImageDeckList records reception time and running duration', async () => {
    const node = await makeImageDeckNode();
    expect(buildSuffix(node)).toBe(""); // no image yet -> no suffix

    // Prompt started 5 seconds ago
    node._imageDeckExecStartAt = Date.now() - 5000;
    node.applyDerpImageDeckList([{ filename: 'img.png', type: 'output', subfolder: '' }]);

    expect(node._imageDeckReceivedAt).toBeInstanceOf(Date);
    expect(node._imageDeckExecDurationMs).toBeGreaterThanOrEqual(4900);

    const suffix = buildSuffix(node);
    expect(suffix).toMatch(/^ - Image received at \d{2}:\d{2}:\d{2}, Res: \.\.\., Generated in 00:00:0[45],?$/);
  });

  it('same-list refresh does not re-record reception info', async () => {
    const node = await makeImageDeckNode();
    const list = [{ filename: 'img.png', type: 'output', subfolder: '' }];
    node.applyDerpImageDeckList(list);
    const firstAt = node._imageDeckReceivedAt;
    expect(firstAt).toBeInstanceOf(Date);

    await new Promise((r) => setTimeout(r, 5));
    node.applyDerpImageDeckList([...list]); // same fingerprint
    expect(node._imageDeckReceivedAt).toBe(firstAt);
  });

  it('duration unknown without an execution window falls back to placeholders', async () => {
    const node = await makeImageDeckNode();
    node.applyDerpImageDeckList([{ filename: 'img.png', type: 'output', subfolder: '' }]);
    expect(node._imageDeckExecDurationMs).toBeUndefined();

    const suffix = buildSuffix(node);
    expect(suffix).toContain("Generated in --:--:--");
    expect(suffix).toContain("Res: ...");
  });

  it('a null duration never paints a fake 00:00:00 (Number(null) === 0 defeat)', async () => {
    const node = await makeImageDeckNode();
    node.applyDerpImageDeckList([{ filename: 'img.png', type: 'output', subfolder: '' }]);
    node._imageDeckExecDurationMs = null; // unknown, e.g. no execution window seen

    const suffix = buildSuffix(node);
    expect(suffix).toContain("Generated in --:--:--");
    expect(suffix).not.toContain("00:00:00");
  });

  it('over-60-second durations keep the real elapsed value', async () => {
    const node = await makeImageDeckNode();
    node._imageDeckExecStartAt = Date.now() - 95000; // 1m 35s generation
    node.applyDerpImageDeckList([{ filename: 'img.png', type: 'output', subfolder: '' }]);

    const suffix = buildSuffix(node);
    expect(suffix).toMatch(/Generated in 00:01:3[456]/);
  });

  it('resolution from the preloaded image fills Res and duration formats as HH:MM:SS', async () => {
    const node = await makeImageDeckNode();
    node._imageDeckExecStartAt = Date.now() - 3723000; // 1h 2m 3s
    node.applyDerpImageDeckList([{ filename: 'img.png', type: 'output', subfolder: '' }]);
    // Simulate the preload onload resolution capture
    node._imageDeckImageResolution = "1024x1024";

    const suffix = buildSuffix(node);
    expect(suffix).toContain("Res: 1024x1024");
    expect(suffix).toMatch(/Generated in 01:02:0[23]/);
  });
});
