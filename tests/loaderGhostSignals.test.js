import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: loader signal writers must never park ghost signals under the
// unassigned string id "-1" (this frontend assigns node ids as STRINGS, so
// strict `=== -1` guards were type-defeated and creation-time syncs leaked
// "[-1]" / "[-1:0]" entries into the shared wireless pickers).

beforeEach(() => {
  vi.resetModules();
  window.xcpDerpSignals = {};
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  globalThis.fetch = fetchMock;
  window.fetch = fetchMock;
});

describe('loader ghost signal guards', () => {
  it('publishIndexedModelSignals refuses the unassigned "-1" id', async () => {
    await import('../js/derps/loaders/core/derpModelLoader_core.js');
    const publish = window.xcpPublishDerpModelLoaderSignals;
    expect(typeof publish).toBe('function');

    // Ghost spawn state: id is the string "-1" before graph.add.
    publish({ id: '-1', type: 'DerpModelLoader', title: 'Loader' }, 'model.safetensors');
    expect(Object.keys(window.xcpDerpSignals)).toHaveLength(0);

    // After graph.add assigns the real id, publishing works normally.
    publish({ id: '42', type: 'DerpModelLoader', title: 'Loader' }, 'model.safetensors');
    expect(window.xcpDerpSignals['42:0']).toBeTruthy();
    expect(window.xcpDerpSignals['42:1']).toBeTruthy();
    expect(window.xcpDerpSignals['42:2']).toBeTruthy();
    expect(window.xcpDerpSignals['-1:0']).toBeUndefined();
  });
});
