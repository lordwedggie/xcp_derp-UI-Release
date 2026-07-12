## BSA Spec: Move clipped links to output 0 position

### Problem

In `js/fatha/helpers/uncleSlotHelper.js`, the `syncUncleSlots()` function hides output slots that are scrolled out of view by setting their position to `[-1000, -1000]` (lines 149-157). This hides both:

1. **LiteGraph physical link rendering** (slots at `[-1000,-1000]` means wires disappear into the void)
2. **The slot dot itself** (the orphan guard in `drawUncleSlots` skips `[-1000,-1000]`)

For Derp Router nodes with scrollable content viewports, this means physical wires to scrolled-out slots vanish entirely instead of stacking at output 0's position.

### Files Touched

| File | Role | Change |
|------|------|--------|
| `js/fatha/helpers/uncleSlotHelper.js` | **Primary fix** | Instead of `[-1000,-1000]`, move scrolled-out slots to output 0's computed position |
| `js/derpSignalOut_core.js` | **Audit only** | The global virtual wire renderer (`drawDerpSignalOutGlobalWires`, lines 916-958) derives endpoint Y from `node.layout.regions[...].y + h/2`, NOT from `slot.pos`. Virtual wires are unaffected. The deprecated local renderer (lines 874-903) is disabled (`if(false)`). **No change needed** in this file. |

### Approach — uncleSlotHelper.js

**Before** (line 155):
```js
slot.pos = [-1000, -1000];
```

**After** (collapsed for the fix):
```js
if (!this._slot0FallbackPos) {
  const slot0Region = regionsArray.find(r => r.outSlotIdx === 0);
  if (slot0Region) {
    this._slot0FallbackPos = [outputX, slot0Region.y + (slot0Region.h / 2)];
  }
}
slot.pos = this._slot0FallbackPos || [outputX, targetRegion.y + (targetRegion.h / 2)];
```

**Detailed logic**:

1. Before the output loop (line 138), compute output slot 0's position: `[outputX, slot0Region.y + slot0Region.h/2]`. Store it as `slot0FallbackPos`.
2. Inside the loop, where the scroll-clip check fires (line 154-155), replace `[-1000, -1000]` with `slot0FallbackPos`.
3. This makes physical LiteGraph wires stack at output 0's vertical position.
4. The `drawUncleSlots` orphan guard (line 202) must also skip `slot0FallbackPos` — no, actually we WANT the slot dot drawn there so connected wires have an anchor.

### LiteGraph Link Rendering Path

- `LiteGraph.getConnectionPos(node, slot_type, slot_index)` returns `node.outputs[slot_index].pos` for outputs (source: LiteGraph source).
- When `slot.pos` is `[-1000, -1000]`, the Bezier curve control points extend off-canvas into the upper-left void.
- When `slot.pos` is set to output 0's Y-coordinate, the wire from the connected input terminates at the output column X, aligned with output 0's Y. The wire overlaps output 0's wire, which is acceptable — the user sees the wire terminates on the node.

### DrawUncleSlots Guard

`drawUncleSlots` (line 202) has:
```js
if (x === -1000 || y === -1000) return; // THE ORPHAN GUARD
```

After the fix, scrolled-out slots will have real coordinates, so they will draw their slot dot at the fallback position. This is correct — a connected slot should still show its anchor dot even when the underlying region is scrolled out.

### Verification

1. Create a Derp Router with 5+ signals, viewport tall enough to scroll.
2. Scroll signal 5 out of view.
3. Physical wire to signal 5 should terminate at the Router's output column, same Y as output 0, rather than disappearing.
4. Signal 0's slot dot should not move; the stack of wires is visually acceptable.
