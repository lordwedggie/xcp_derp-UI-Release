## Architect Review: FILEBROWSER min-width

### Vitals
- **Date**: 2026-07-13
- **Turn**: 1
- **Reviewer**: CodeWhale
- **Verdict**: PASS

### Analysis

**Single enforcement point — correct.**
`currentSize[0]` is set once in `openFilePicker` (line 608) and never mutated for width after initialization. Only `currentSize[1]` is animated for height (line 1114). Clamping at the source propagates the guarantee everywhere.

**Math.max won't break fallback logic.**
`Math.max(config.geometry?.w || 200, FILEBROWSER_MIN_TRIGGER_WIDTH)` (constant = 200):
- `w = 120` → `Math.max(120, 200)` → 200 ✓
- `w = 300` → `Math.max(300, 200)` → 300 ✓
- `geometry` undefined → `Math.max(200, 200)` → 200 ✓

The `|| 200` fallback is subsumed but harmless.

**Downstream propagation — complete.**
After both spec changes, all width consumers flow through `calculatePickerPanelLayout` return:

| Consumer | Current source | New source | Status |
|---|---|---|---|
| `panelW` (line 334) | `config.geometry.w` | `state.currentSize[0]` | Changed ✓ |
| `panelScreenRect.width` (line 339) | `anchorRect.width` | `state.currentSize[0] * scale` | Changed ✓ |
| `drawPickerRows` geometry.w (line 365) | From `panelW` return | Same path — clamped | Propagated ✓ |
| `drawPickerSeparator` panelW (line 393) | From `panelW` return | Same path — clamped | Propagated ✓ |
| `calculatePickerScrollViewport` panelW (line 408) | From `panelW` return | Same path — clamped | Propagated ✓ |
| `scrollScreenRect.width` (line 415) | `state.panelScreenRect.width` | Same state — clamped | Propagated ✓ |
| `panelEventRect` (line 1127) | From `panelW` return | Same path — clamped | Propagated ✓ |
| `masterPainter` width (line 1139) | From `panelW` return | Same path — clamped | Propagated ✓ |

**`anchorRect` decoupling — safe.**
`computeScreenAnchorRect` (line 294) bases `anchorRect.width` on `geometry.w` for the original trigger width. After the spec change, `panelScreenRect.width` reads `state.currentSize[0] * scale` directly, so the anchor's width is no longer consumed for picker sizing. `anchorRect.left` is still used for positioning (line 337) and is correct regardless of width expansion — min-width expands rightward from trigger left edge.

**Search tab — intentionally excluded.**
Search tab (line 658) is a separate `bastaSearchTab` overlay bound to trigger width. Spec rationale confirms this is intentional.

**No unaddressed consumers.**
Every picker width path — render geometry, hitboxes, event shield, scrollbar, screen-space rects — derives from `calculatePickerPanelLayout` return. All will receive the clamped width.

### Edge cases covered
- `geometry.w < 200` → clamped up
- `geometry.w ≥ 200` → preserved
- `geometry` undefined → fallback to 200, then clamp to 200 (no-op)
- `geometry.w = 0` → `Math.max(0, 200)` → 200 ✓
- Picker positioned from `geometry.x` with rightward expansion — matches existing scrollbar behavior (scrollbar always consumes right-side space)

### Recommendation
PASS. Apply exactly as specified. No additional changes, no missed consumers, no fallback breakage.

HEARTBEAT OK | TURNS_USED: 1 | TOKENS: ~4800
