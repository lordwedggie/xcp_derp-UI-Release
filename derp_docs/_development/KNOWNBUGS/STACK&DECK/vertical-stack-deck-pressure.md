# Known Bugs — Vertical Stack Decked to a Deck (Deck Pressure)

Audit of vertical stacks attached to a Deck Pressure hub, plus generic vertical-stack seam/outer-edge resize paths that interact with decks. Findings sourced from a code audit on 2026-07-10 against `derp_docs/FRAMEWORK-Docking.md`.

Each entry lists: location, what the code does, why it may be wrong, and the user-visible symptom. Severity ordering: HIGH → MEDIUM → LOW → LATENT.

---

## HIGH

### H1 — Viewport-backed nodes can never shrink to `minClipHeight` during vertical resize

`js/fatha/core/dockResize.js:836-844` — `getVerticalResizeTargetMinHeight`

`layoutFloor = layout.contentMinHeight || layout.totalHeight` for viewport-backed nodes, then fed into `Math.max(totalCompactFloor, layoutFloor, snap*4)`. `totalCompactFloor` (line 827, via `getVisibleRegionLayoutFloor`) already correctly uses `minClipHeight` for `scrollViewport` regions — but the larger `layoutFloor` (full expanded content height) overrides it. Both return paths (`preserveExpandedFloor` true and false) end up floored at full expanded height.

- **Symptom:** Clipped/viewport-backed nodes (derpLoraStack, derpSeedV3, derpTriggerWall with scrollViewport) in horizontal rows or Deck Pressure side branches cannot be height-resized down to one visible entry. Resize stalls at full expanded content height. Also inflates seam minimums in vertical side branches.
- **Doc violated:** FRAMEWORK-Docking.md lines 81, 221.

### H2 — Scale mode breaks shared-width ownership for vertical stacks attached left/right

`js/fatha/core/masterDockEngine.js:1588, 1598-1602` — `lockDeckStackMembersForAttach` (Scale mode)

`restoreRuntimeAutoWidth = stackAxis === "horizontal" || (side !== "top" && side !== "bottom")`. For a vertical stack (`stackAxis === "vertical"`) attached left/right, the second clause is true, so runtime `autoWidth` is restored from `deckSavedAutoWidth`. For an originally-auto-width node (e.g. derpSeedV3, default `autoWidth = true`), this sets `autoWidth = true` on a docked vertical-stack member.

- **Symptom:** After attaching a vertical stack containing an auto-width node to a Deck hub's left/right side in Scale mode, that member re-measures width from content each layout pass. The vertical stack loses its shared width — width drift/flicker between members, vertical normalization fighting the auto-width member every frame.
- **Doc violated:** FRAMEWORK-Docking.md line 90 ("Saved vertical stacks keep runtime `autoWidth = false` while docked").

### H3 — Collapsed boundary resize never refreshes the width lock

`js/fatha/core/dockResize.js:983-1086` — `applyCollapsedVerticalBoundaryResize`

Never calls `markVerticalStackWidthLock`. Relies solely on the 1.2-second exact-lock prime stamped at pointer-down (`fathaDOMshield.js:855-861`). Compare: seam drags refresh the lock every pointermove (line 1612), outer-edge height drags refresh every pointermove (lines 1240-1252).

- **Symptom:** Collapsed-top/bottom boundary drags lasting longer than 1.2 s lose the width lock; draw-cycle measurement drifts a member's width, then `syncDeckNodeSize` (lines 1061/1072) bakes that drifted width in. The stack width flickers or silently grows during long drags.

### H4 — Collapsed boundary resize syncs with raw live width, not lock-aware width

`js/fatha/core/dockResize.js:1061, 1072` — `applyCollapsedVerticalBoundaryResize`

Both top and bottom branches call `syncDeckNodeSize(member, getDockNodeWidth(member), height, ...)` — raw `member.size[0]`. The seam path at lines 948-949 correctly uses `getVerticalStackLiveResizeWidth(topNode, ...)`.

- **Symptom:** A single draw cycle that widens one member between pointermove events gets that wider width persisted for the rest of the drag — a one-frame width jump that sticks.

---

## MEDIUM

### M1 — Vertical seam resize in side branch derives preserved frame from live extents, not canonical plan

`js/fatha/core/dockResize.js:886` — `applyVerticalStackSharedEdgeResize`

`frameBefore = getDockFrameBounds(getDeckMembers(pressureContext.pressureHub, graph))` — bounding box of all deck members (hub + every branch). The sibling side-*width* path at lines 1447-1449 correctly uses `computeDeckPressureGeometryPlan(...)?.frame`.

- **Symptom:** If the session starts while a branch member is transiently overlapping/mid-settle, the frozen frame is oversized/shifted; later branch members push outside the side band until idle `applyDeckPressureLayout` re-asserts the canonical frame.
- **Doc violated:** FRAMEWORK-Docking.md lines 182, 220.

### M2 — `getDeckMembers` for side-branch min-width returns whole mixed-axis deck group

`js/fatha/core/fathaNodeResize.js:138` — `handleNodeResize`

`getDeckMembers(entity, graph)` returns the entire deck group for a side-branch member, so `stackMaxMinWidth` becomes the max across hub + all branches. The hub is typically wider, inflating `fallbackMinW`. The `Math.min(fallbackMinW, startWForMinClamp)` clamp at line 149 partially mitigates for corner drags but not for non-corner vertical edge drags.

- **Symptom:** Side-branch member (or frame corner it participates in) cannot be narrowed below the hub's min-width during resize, even though the branch column's own min-width is smaller.
- **Doc violated:** FRAMEWORK-Docking.md line 205 (must use `getDeckPressureBranchMembers`).

### M3 — `applyVerticalStackHeightResize` snapshots collapsed members via live nodeSize

`js/fatha/core/dockResize.js:1232` — `applyVerticalStackHeightResize`

`stackStartHeights` uses `getDockNodeHeight(member)` for all members including collapsed middle ones. `applyCollapsedVerticalBoundaryResize` (line 1005) correctly uses `getVerticalResizeStartHeight` (returns compact min for collapsed).

- **Symptom:** Outer-edge height resize on a stack with a recently-collapsed middle member distributes the delta wrong — the collapsed member's phantom expanded height is counted as fixed space, so the stack grows/shrinks by the wrong amount.

### M4 — `hasFreshManualFit` height preservation only fires on exact total==target equality

`js/fatha/core/masterDockEngine.js:2629-2640` — `fitDeckPressureSideHeights`

After an internal seam drag, `_deckPressureManualBranchFitUntil` is stamped on all members for 1200 ms, but the fast-path that preserves their current heights requires `Math.abs(collapsedClampedTotal - resolvedTarget) <= 0.5`. If the frame changes after pointer-up (preserve-frame cleared, hub auto-fit re-measures, image loads), equality breaks and `fitDeckPressureSideHeights` redistributes spare height into every expanded recipient.

- **Symptom:** A Slider or LoraStack in the same left/right side branch changes height shortly after a *different* seam is released, even though only two members were dragged.
- **Doc violated:** FRAMEWORK-Docking.md line 223.

### M5 — Manual mode asymmetric: does not restore runtime autoWidth for horizontal rows on top/bottom

`js/fatha/core/masterDockEngine.js:1555` — `lockDeckStackMembersForAttach` (Manual mode)

Manual mode: `restoreRuntimeAutoWidth = side !== "top" && side !== "bottom"` → false for top/bottom. Scale mode (line 1588): `stackAxis === "horizontal"` → true for top/bottom horizontal rows. So a horizontal row on top/bottom is content-driven in Scale mode but force-manual in Manual mode for the same geometry.

- **Symptom:** A horizontal stack docked top/bottom in Manual mode keeps fixed manual widths; if content grows (theme change, longer labels) members clip instead of re-measuring, whereas the same stack in Scale mode would re-measure.

### M6 — `undeckDeckPressureBranches` skips `restoreDeckNodeAxes` for members still docked to siblings

`js/fatha/core/masterDockEngine.js:1437-1441` — `undeckDeckPressureBranches`

`restoreDeckNodeAxes` is only called for members *no longer docked at all*. Members that stay docked to branch siblings keep Manual-mode's `_derpPreferredAutoHeight = false` / `autoHeight = false` plus the saved `deckSavedAutoHeight`. Compounded by H2: a Scale-mode-attached vertical stack also keeps the wrongly-restored `autoWidth = true`.

- **Symptom:** A vertical stack that was auto-height, after being attached to a Deck hub in Manual mode and then detached via hub deck control, stays permanently manual-height — internal seams become resizable, it no longer auto-collapses to content height. Switching global mode back to `scale` does not auto-revert it.

### M7 — `resolveDerpPreferredAutoWidth` honors stale override for standalone nodes (latent)

`js/fatha/core/derpHeightPolicy.js:44-52` — `resolveDerpPreferredAutoWidth`

When `deckSavedAutoWidth` is absent, it still honors `_derpPreferredAutoWidth`. The symmetric height resolver (line 27) correctly falls back to `autoHeight !== false`. The justifying comment is stale/false (`saveDeckNodeAxes` is called for all members, not just attach-point nodes).

- **Symptom (if triggered):** A standalone node resolves preferred-autoWidth to `false` from a stale override, permanently blocking width-resize eligibility. Dead code in the happy path today, but a latent trap and a real doc/code mismatch (FRAMEWORK-Docking.md line 87).

---

## LOW

### L1 — `canResizeVerticalSharedEdgeHeight` doesn't exclude Deck Pressure hub as the resizing node

`js/fatha/core/dockResizeSharedEdges.js:128-135`

Checks if the *neighbor* is a hub but not if *node* itself is a hub.

- **Symptom:** DOM shield may render a seam strip/ghost on the hub-to-branch edge; generic seam resize may run one pass before Deck Pressure layout corrects it — a one-frame seam jump on the hub boundary.

### L2 — `applyCollapsedVerticalBoundaryResize` bypasses `markDockResizeActiveMembers`

`js/fatha/core/dockResize.js:1033-1037`

Manually sets flags on only the target member, skipping `_deckPressureActiveUntil` on the pressure-active node (compare seam/outer-edge paths at lines 890, 1217). `markManualDeckPressureBranchFit` (line 1079) partially compensates.

- **Symptom:** In a Deck Pressure side branch, collapsed-boundary resize of a branch member may see the target member's height snap back to a pressure-fitted value between drag moves — jitter.

### L3 — "Keep one expanded filler" can re-expand the member just collapsed

`js/fatha/core/masterDockEngine.js:2271-2281, 2369-2374` — `getDeckPressureActiveMember` / `ensureDeckPressureFillerMember`

If the user collapses two side-branch members within the 1200 ms skip-filler window, every member carries a skip flag, `fillerCandidates` is empty, fallback lands on `candidates[0]` (first in deck-topology order) — which can be the member just collapsed.

- **Symptom:** Collapsing the second-to-last expanded side-branch member immediately re-expands the first collapsed one.

### L4 — Left/right column normalization uses live-y sort instead of topology

`js/fatha/core/masterDockEngine.js:713-714` — `normalizeSharedEdgePair` (left/right branch)

`sortDeckNodesByAxis(collectDeckLine(...), "y")` sorts on transient `pos[1]`; the top/bottom branch (line 748) correctly uses `collectDeckLineOrdered`. Largely latent today (columns are typically single-member) but a contract deviation.

- **Symptom:** If two members in a left/right column momentarily overlap during a drag, the y-sort swaps their order and `applyColumnLayout` repositions them wrong — a top/bottom gap or reordered column.

### L5 — Collapse/filler phase marks ALL branch members dirty

`js/fatha/core/masterDockEngine.js:2809-2810` — `applyDeckPressureLayout`

`markChanged(members)` adds every branch member when filler/collapse changes *any* member's state; later all get `setDirtyCanvas` + `syncDerpShield`. The rect-application phase (lines 2823-2827) correctly marks only actually-changed members.

- **Symptom:** During a collapse/uncollapse in a side branch, the whole branch redraws (canvas dirty + shield resync) even members that didn't move/resize. Transient FPS dip on large branches; not perpetual (idle skip re-engages after settle).
- **Doc violated:** FRAMEWORK-Docking.md line 177.

### L6 — Viewport floor fallback chain includes `live?.h` before `config.minHeight`

`js/fatha/core/dockResize.js:784` — `getVisibleRegionLayoutFloor`

The `||` chain falls through to `live?.h` (expanded rendered height) when clip-state values are falsy, before `config.minHeight`.

- **Symptom:** On the first resize after workflow load (before viewport clip state is populated), viewport-backed nodes resist shrinking below current expanded height even if `minClipHeight` is declared in config.

---

## LATENT / DEAD CODE

### D1 — Unguarded `normalizeDockPair`/`forceDockResizeRefresh` in dead `stackMode` branch

`js/fatha/core/masterDockEngine.js:1993-1996` — `finalizeDeckTarget` (stackMode branch)

`stackMode` is referenced only here and never assigned anywhere in `js/`. The branch lacks the `if (!hubAnchor)` guard and `applyDeckPressureAfterDock` call that all live sibling paths have. Currently unreachable; if stack-mode attach is ever re-enabled, this branch would move the ImageDeck hub and leave branch geometry stale.

---

## Fix Priority Recommendation

1. **H1** — viewport-backed nodes can't shrink to `minClipHeight` — affects every Fit Node member in any vertical/horizontal resize. Reproducible.
2. **H2** — Scale mode breaks shared-width ownership for vertical stacks attached left/right — reproducible with derpSeedV3 in a vertical stack docked to a Deck.
3. **H3/H4** — collapsed boundary width-lock drift — high-impact for any tall vertical stack.
4. **M1/M2** — side-branch frame/min-width derivation — affects Deck Pressure side-branch resize correctness.
5. Remaining MEDIUM/LOW items as time permits.
