## Architect Review: Move clipped links to output 0

**Verdict: PASS** (with one recommendation)

### Analysis

**1. drawUncleSlots guard (line 202): NO CHANGE NEEDED**

The orphan guard `if (x === -1000 || y === -1000) return;` will naturally stop catching scrolled-out slots once they receive real coordinates. This is correct — per spec §52-57, connected slots *should* draw their anchor dot at the fallback position. Multiple slot dots stacking at output 0's Y is the intended visual.

**2. Slot 0 existence: SAFE**

- `outputs` empty → line 138 `if (outputs)` short-circuits.
- `outputs` non-empty but no region with `outSlotIdx === 0` → `slot0FallbackPos` stays undefined, the `|| targetRegion.y + ...` fallback chain activates (existing non-clipped behavior). No regression.
- 0 slots → same as empty outputs, guard at line 138 handles it.

**3. LiteGraph wire rendering: CORRECT**

`LiteGraph.getConnectionPos()` reads `slot.pos` directly. Setting clipped slots to output 0's Y means wires from connected inputs terminate at the output column X, aligned with output 0. Wires stack visually — acceptable per spec §48.

**4. Virtual wires (derpSignalOut_core.js): UNAFFECTED**

The global virtual wire renderer derives endpoint Y from `node.layout.regions[...].y + h/2`, not from `slot.pos`. No change needed in that file.

### Recommendation: Drop the cache guard

The spec caches `slot0FallbackPos` once via `if (!this._slot0FallbackPos)`. Layout regions are rebuilt fresh each `syncUncleSlots` call (line 130), but the cached position survives layout changes. If the node resizes or content shifts, clipped slots go to a stale Y.

`regionsArray.find()` is O(n) on ~5-20 elements — negligible. Compute fresh each call:

```js
// Before the output loop (line 138):
const slot0Region = regionsArray.find(r => r.outSlotIdx === 0);
const slot0FallbackPos = slot0Region
    ? [outputX, slot0Region.y + (slot0Region.h / 2)]
    : null;

// Inside the clip check (replaces line 155):
slot.pos = slot0FallbackPos || [outputX, targetRegion.y + (targetRegion.h / 2)];
```

This eliminates the staleness concern entirely with no meaningful perf cost.

### Edge cases covered

| Case | Behavior |
|------|----------|
| 0 outputs | Guard at line 138, no-op |
| 0 layout regions | `slot0FallbackPos` null, falls through to `targetRegion` check → `[-1000,-1000]` (existing) |
| Slot 0 itself scrolled out | Slot 0 stays at its own layout position (harmless self-reference) |
| Node collapsed | Bypass path (line 141) fires first, never reaches clip check |
| No viewport on region | `getContentViewportForRegion` returns null, clip check skipped |
