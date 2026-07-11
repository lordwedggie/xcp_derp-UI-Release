# <span style="color: #ff8080">Framework:</span> <span style="color: #ffffff">Docking System</span>

## <span style="color: #80ffc0">Overview</span>
The docking system allows derp nodes to be dragged into horizontal/vertical stacks where they share edges, normalize sizes, and resize together as a group. It's implemented entirely within the Fatha framework, bypassing LiteGraph's native node positioning.

<span style="color: #80aaff"><strong>Last reviewed:</strong></span> 2026-06-11

## <span style="color: #80ffc0">Key Files</span>

| File | Role |
|------|------|
| `core/masterDockEngine.js` | Master orchestrator (1610+ lines). Dock pair management, deck group tracking, size normalization, member registration, attach/detach, floating state. |
| `core/dockDimensions.js` | Dimension calculations for dock attach/detach. Computes shared heights/widths for dock groups. |
| `core/dockResize.js` | Resize handling for docked stacks. Propagates resize from one member to all. `handleNodeResize`, `syncDockResizePair`. |
| `core/dockResizeSharedEdges.js` | Shared horizontal seam eligibility and same-row neighbor detection used by both resize handling and DOM shield hitboxes. |
| `core/dockDrag.js` | Drag logic for initiating and completing a dock action. |
| `core/dockTargetPicking.js` | Edge detection — which edge of which node are we being dragged near? |
| `core/dockDebugHelpers.js` | Debug logging utilities for docking state. |

## <span style="color: #80ffc0">Dock Group Architecture</span>

### <span style="color: #80ffc0">Member Registration</span>
Each node tracks its dock group via `_deckGroupId`. The dock engine maintains an internal registry of dock groups mapping `groupId → { members: [...], axis: "horizontal"|"vertical"|"stack" }`.

### <span style="color: #80ffc0">Dock Pair</span>
When two nodes dock, they form a pair: a **leader** (the node that stayed still) and a **follower** (the node that was dragged). The leader's position/size typically determines the shared dimensions.

### <span style="color: #80ffc0">Deck Group Detection</span>
`getDeckGroupAxis(node, graph)` returns `"horizontal"`, `"vertical"`, or `null`. A group requires `members.length > 1`. A single node is not a group.

## <span style="color: #80ffc0">Dock Flow (Deep Dive)</span>

```
drag starts → target detection → attach → normalizeDockPair → forceDockResizeRefresh
```

### <span style="color: #80ffc0">1. Target Detection (`dockTargetPicking.js`)</span>
Detects proximity of dragged node to edges of potential dock targets. Returns target node + edge.
When the dragged item is already a docked stack, target detection excludes every member of that moving stack. This prevents Alt-attach previews from targeting another member of the same stack and drawing a second ghost over the moving stack itself.
Linear dragged stacks use their whole stack bounds for edge-distance checks and attach ghosts, so Deck Pressure side/top/bottom detection follows the stack's outer edge instead of the drag-root node edge.

### <span style="color: #80ffc0">2. Attach (`masterDockEngine.js`)</span>
- Registers the new member in the dock group
- Leader and follower snap their edges together
- Sets up shared `_deckGroupId`

### <span style="color: #80ffc0">3. Normalize (`normalizeDockPair`)</span>
- Horizontal docks: normalizes HEIGHTS to shared max
- Vertical docks: normalizes WIDTHS to shared max
- Uses `getDeckMembers` to collect all members in the group

### <span style="color: #80ffc0">4. Post-Attach Refresh (`forceDockResizeRefresh`)</span>
After normalizing, the attach flow forces a layout recompute for the affected dock members. Horizontal left/right attaches first run a whole-line horizontal normalize, then refresh the whole horizontal line, so older members in a 3+ node stack re-enter the same shared-height pass as the newly attached node.

## <span style="color: #80ffc0">Size Normalization</span>

### <span style="color: #80ffc0">No-op size syncs stay quiet</span>
`syncDeckNodeSize()` must return before calling Node 2.0/Vue size setters when width and height are unchanged. Those compatibility setters mark nodes layout-dirty, so calling them for an already-aligned deck member can force `_forceSync` every frame and keep horizontal stacks such as `derpLoraStack` in a permanent layout loop.
During active horizontal seam drags, callers may pass `liveResize: true` with silent/deferred flags so the physical size and stored `nodeSize` update without forcing full layout dirty state on every pointer move. The size change itself still makes Fatha recompute geometry for the next draw; release/final dirty paths keep shields and slots synchronized.

### <span style="color: #80ffc0">Automatic horizontal edge width compensation</span>
When a left-most or right-most member in a horizontal stack changes width from runtime layout changes, the stack first tries to keep its total width stable. Growth borrows shrinkable width from members on the opposite side down to their measured minimums; shrinkage gives the freed width to those opposite members. If there is not enough spare room, the stack is allowed to grow.
The first observed width for an edge member after load/dock is treated as the baseline and is not rebalanced; this prevents autoWidth hydration from being counted as a real width delta on every page refresh.
During direct outer-edge stack resizing, the resize delta comes from the snapped pointer movement rather than the measured width of the grabbed edge node. This keeps stacks with explicit auto-width edge members moving in single `SNAP` increments and prevents post-drag auto-width balancing from adding a second step.
Outer horizontal stack corner resizing uses full `SNAP` thresholds from the gesture start, snapping the pointer delta toward zero instead of rounding to the nearest snap. This keeps low-zoom pointer samples such as a 15px graph-space drag from applying a premature 20px stack-width jump.
During the same active gesture, a snapped stack delta of `0` is a real restore state, not a no-op. If a drag crosses from `-10` back into the zero-snap band, `applyHorizontalStackWidthResize()` must restore every member to the session's original width and position before a later `+10` step is applied. Otherwise the live stack can visually jump from `-10` straight to `+10`, appearing as a 20px increment.
The outer-edge stack width resize path (`applyHorizontalStackWidthResize` in `dockResize.js`) is used for **any** corner entity in a horizontal stack, regardless of whether the grabbed node is auto-width or manual-width. The snapped pointer delta is distributed across all resizable (manual-width) members via `reconcileManualWidthsToTarget`, with each member clamped to its own `getDockNodeMinWidth`. autoWidth/fixed members keep their original width. The resize only stops when every resizable member has reached its min-width. The stack distribution path must not be gated on `!resizeAxes.allowWidth`, because manual-width corner entities have `allowWidth = true` and would otherwise fall through to the single-node clamp path, stopping the resize at the corner node's own min-width.
For shared horizontal seams, `syncDockResizePair()` snaps the saved two-node total width before calculating the counterpart width. This prevents autoWidth hydration or other off-grid session widths from preserving a half-snap overhang after the dragged side has already snapped.

### <span style="color: #80ffc0">Vertical stack outer-edge height resize</span>
The outer-edge stack height resize path (`applyVerticalStackHeightResize` in `dockResize.js`) mirrors the horizontal stack width resize for vertical stacks. Dragging the top of the topmost node or the bottom of the bottommost node — via pure top/bottom handles OR corner handles (top-left, top-right, bottom-left, bottom-right) — distributes the snapped pointer delta across all resizable (manual-height) members via `reconcileManualHeightsToTarget`, with each member clamped to its own `getVerticalResizeTargetMinHeight` (using `preserveExpandedFloor: true`). autoHeight members and collapsed members keep their original height (they are "fixed" during height distribution). The resize only stops when every resizable member has reached its min-height. Fixed members are identified by `canResizeVerticalMemberHeight` (returns `false` for collapsed or preferred-autoHeight nodes). The path is gated on `canResizeVerticalStackHeight` (entity must be at the top or bottom outer boundary of a non-Deck-Pressure vertical stack with at least one resizable member). Corner handles on vertical stacks that fail this gate have height resize blocked (width still works). Collapsed boundary growth is still handled by `applyCollapsedVerticalBoundaryResize` first; internal vertical seams are still handled by `applyVerticalStackSharedEdgeResize`. Heights are pinned during the live drag via `markDockResizeActiveMembers` with `preserveHeight: true`, which sets `_dockResizePreserveHeight` and `_isDerpResizing` on all stack members so the draw cycle does not override the manually distributed heights.
During outer vertical stack height resize, pure top/bottom handles and height-only corner drags apply a temporary vertical-stack width lock. This preserves the stack's starting shared width while height changes wake layout measurement; otherwise a transient wider `contentMinWidth` from one member can flicker that node wider and then expand the whole stack on mouse release. If the same corner drag is also resizing width, the lock is updated to the applied stack width each pass so intentional width resizing is not pulled back to the height-only start width.
At resize start, the DOM shield primes all members of a vertical stack to one stable starting width before the first pointermove. If a member has already drifted wider from measurement, the stack uses the smallest current member width as the startup lock so the top node cannot flash wider for a frame before `syncDockResizePair()` runs.

### <span style="color: #80ffc0">Seam resize eligibility — auto members are fixed</span>
autoWidth and autoHeight nodes cannot be seam-resized. A seam (shared edge between two docked nodes) is only resizable when **both** neighbors are manual-mode on the resize axis. This is enforced by `canResizeHorizontalSeamPair` (both members must pass `canResizeHorizontalMemberWidth`) and `canResizeVerticalSeamPair` (both members must pass `canResizeVerticalMemberHeight`). The DOM shield does not create vertical seam strips (`hasInternalTopResizeEdge`/`hasInternalBottomResizeEdge` include `canResizeVerticalSharedEdgeHeight` checks) and the JS hit-test fallback (`getSharedResizeAnchorAtPointer`) also checks pair eligibility. Because no hover session is created for an ineligible seam, no seam ghost is drawn. This means an autoHeight node in a vertical stack floats at its content height — seams touching it are blocked in both directions. The outer-edge stack resize paths still work: auto members are "fixed" participants that keep their current size while manual members absorb the delta.
Horizontal stack corner affordance uses separate width and height gates. A corner on an internal shared side only shows/uses width resize when `canResizeHorizontalSharedEdgeWidth()` passes for that side; a corner on an outer stack boundary uses `canResizeHorizontalStackWidth()`. The height half is independent: horizontal-row corners expose height resize only when `canResizeHorizontalStackHeight()` finds at least one non-collapsed row member whose preferred Height Mode is manual/Fit Node (`resolveDerpPreferredAutoHeight(node) === false`). DOM shield cursors should reflect the axes that are actually live: `ew-resize` for width only, `ns-resize` for height only, and diagonal only when both gates pass.

### <span style="color: #80ffc0">Horizontal stack corner height resize</span>
Horizontal rows still normalize to one shared height. When corner height resize is allowed, `syncDockResizePair()` applies the snapped target row height to every horizontal member; top-corner drags move the row y-position so the bottom edge stays pinned. Rows where every member is fixed/numeric height (`preferred autoHeight === true`) stay height-locked. The row minimum is the max of `getVerticalResizeTargetMinHeight(member, snap)` across the row without preserving the expanded floor, so clipped Fit Node nodes such as `derpLoraStack` and `derpSeedV3` can shrink to their declared one-entry/one-group viewport floor instead of their full hidden content height.
After mouse release, `resolveHorizontalDeckSharedHeight()` must treat preferred-manual/Fit Node row members as manual height owners. It should use their current/stored height plus the compact floor, not force them through auto-height content measurement, or the row can snap back to min-height and trigger width compensation.

### <span style="color: #80ffc0">Resize eligibility uses preferred autoHeight/autoWidth, not runtime</span>
`handleNodeResize` in `fathaNodeResize.js` and the DOM shield's own-handle affordance (`canW`/`canH` in `fathaDOMshield.js`) both use `resolveDerpPreferredAutoHeight` and `resolveDerpPreferredAutoWidth` (the user's chosen Height/Width Mode) for resize axis eligibility, not runtime values. This is critical because `lockDeckNodeAxes` forces runtime `autoHeight = false` and `autoWidth = false` on docked/decked nodes, which would otherwise make `resolveDockResizeAxes` return `allowHeight/allowWidth: true` for preferred-auto nodes. By using preferred values, corner handles and pure top/bottom handles on vertical stacks correctly block height resize for autoHeight nodes even when the node is docked to a deck, horizontal stack seams are blocked for autoWidth nodes, and horizontal stack corner height resize stays blocked unless a row member's preferred Height Mode is manual/Fit Node. The shield does not render resize handles or cursors that the resize path would reject. All-auto stacks therefore have seam resize completely disabled (no manual members to absorb the delta), while mixed stacks allow resize on axes with manual participants.

`resolveDerpPreferredAutoHeight` and `resolveDerpPreferredAutoWidth` are symmetric: each checks its `_derpPreferred*` override first (set by Manual mode), then the corresponding `deckSaved*` saved value, then falls back to runtime `autoHeight !== false` / `autoWidth === true`. Both overrides are **only honored when the node is actively docked** (has the corresponding `deckSaved*` property). For standalone nodes, a stale `_derpPreferred*` from a prior Manual-mode session is ignored, and the resolver falls back to runtime `autoHeight`/`autoWidth` — which `applyDerpPreferredAutoHeight` keeps in sync for standalone height-mode changes. Manual mode sets `_derpPreferredAutoHeight = false` / `_derpPreferredAutoWidth = false` to open seams; Scale mode restores them from `deckSavedAutoHeight` / `deckSavedAutoWidth`. On undock, `restoreDeckNodeAxes` restores `autoHeight` from `deckSavedAutoHeight` and deletes both `_derpPreferredAutoWidth` and `_derpPreferredAutoHeight` unconditionally, so standalone nodes revert to their default (or user-changed) height/width mode.

### <span style="color: #80ffc0">Auto stack deck fit mode (global preference)</span>
Runtime autoWidth is dock-axis aware. Saved horizontal stacks restore runtime `autoWidth` from `deckSavedAutoWidth`, including Deck Pressure top/bottom branches, so auto-width nodes can re-measure to their content floor after workflow reload while Manual mode can still set `_derpPreferredAutoWidth = false` for seam eligibility. Saved vertical stacks keep runtime `autoWidth = false` while docked because their shared width is owned by the stack.

The global setting `Derp.DeckAutoStackMode` controls how all-auto stacks behave when attached to a Deck Pressure hub:
- **`scale` (default)**: Auto members absorb the deck dimension delta proportionally. Auto members stay auto; `fitDeckPressureRowWidths` has an all-auto fallback that distributes via `fitSizesToTotal`. `fitDeckPressureSideHeights` includes autoHeight members in distribution. This is non-destructive — auto-mode is preserved.
- **`manual`**: Force-convert all stack members to manual on deck attach via `lockDeckStackMembersForAttach`. This extends `lockDeckNodeAxes` beyond the two attach-point nodes to all stack members, and forces the seam axis to manual at the preferred-value level. For vertical stacks, `_derpPreferredAutoHeight = false` and `autoHeight = false` are set on all members. For horizontal stacks, `_derpPreferredAutoWidth = false` is set on all members so seam eligibility opens; runtime `autoWidth` is restored from `deckSavedAutoWidth` for horizontal Scale-mode rows so Fatha layout sizing stays content-driven unless `_deckPressureSideHorizontalWidth` is explicitly set. The saved `deckSavedAutoHeight`/`deckSavedAutoWidth` (written by `saveDeckNodeAxes`) are preserved so restore-on-undock reverts to the original state.

### <span style="color: #80ffc0">Mode switching and preferred-value corruption recovery</span>
When switching from Manual to Scale mode, nodes may still have `_derpPreferredAutoHeight = false` or `autoWidth = false` from the prior Manual session. Three safeguards prevent this corruption from persisting:
1. **`lockDeckNodeAxes`** reads `preferredAutoHeight` from `deckSavedAutoHeight` (the original saved value) if it exists, NOT from the current `_derpPreferredAutoHeight`. This prevents `applyDerpPreferredAutoHeight` from overwriting `deckSavedAutoHeight` with the corrupted `false` value, which would destroy the saved original.
2. **`lockDeckStackMembersForAttach`** in Scale mode restores `_derpPreferredAutoHeight` from `deckSavedAutoHeight` for all non-hub members (including attach-point nodes — idempotent since `lockDeckNodeAxes` already set it).
3. **`lockDeckStackMembersForAttach`** snapshots `deckSavedAutoWidth` for every non-hub stack member before Manual-mode mutation, then restores runtime `autoWidth` from that saved value for horizontal rows in Scale mode. For vertical stacks, `lockDeckNodeAxes` keeps `autoWidth = false` because shared width ownership belongs to the stack.

### <span style="color: #80ffc0">Layout-driven horizontal height changes</span>
When any member of a horizontal dock stack changes height from runtime layout growth or shrinkage, the shared-height pass recomputes from current member layouts and resyncs every docked member to that height. This includes structural row changes such as adding or removing `derpLoraStack` entries. Deck Pressure top/bottom branches must be classified by their branch-only horizontal member list, because the full ImageDeck-owned group is mixed-axis. The per-frame dock maintenance cache must not preserve a previous taller height, or shrinking content can leave the stack uneven or oversized.
The same whole-line resync must happen immediately after a new left/right attach. Refreshing only the leader/follower pair can leave an older member at the previous shorter height until a later interaction wakes that node.
The shared-height fast path must key off full horizontal geometry, not only the numeric shared height. A 2-node stack can grow to 3 nodes while keeping the same tallest height, and that attach still requires a fresh whole-line sync/normalize pass.

### <span style="color: #80ffc0">Theme-driven vertical width growth</span>
When a member of a vertical dock stack changes theme, its measured content floor can grow while the stack is already width-locked. Runtime dock sizing preserves the current shared width only as a floor, not as a ceiling, and vertical normalization runs after layout so all stack members adopt the new widest measured width.

### <span style="color: #80ffc0">fitSizesToTotal (masterDockEngine.js)</span>
Distributes total available space among members while respecting minimum sizes.

<span style="color: #ffc680"><strong>Critical fix (2026-06-07):</strong></span> Changed `let assigned = minTotal` → `let assigned = 0`. The old code double-counted minimums, causing single-node columns (the horizontal dock case) to receive `totalHeight - min` instead of `totalHeight`. This caused the shorter node in a horizontal pair to collapse to its minimum height.

<span style="color: #ffc680"><strong>Manual-mode height preservation (2026-07-01):</strong></span> `normalizeSharedEdgePair` for `left`/`right` edges (vertical stack docked beside an ImageDeck) now checks whether any non-hub member in the column is manual-height (preferred autoHeight = false). If so, current heights are preserved instead of calling `fitSizesToTotal`. This prevents content changes (e.g., dropdown selection) that don't affect height from triggering proportional redistribution of all stack members' heights. In Scale mode (all autoHeight), `fitSizesToTotal` still runs to scale the stack to match the deck height.

### <span style="color: #80ffc0">applyColumnLayout / applyRowLayout (masterDockEngine.js)</span>
Sets member sizes to normalized values.

<span style="color: #ffc680"><strong>Critical fix (2026-06-07):</strong></span> Both functions now call `syncDeckNodeSize(node, w, h, { silent: true })`. The `silent: true` flag prevents `syncDeckNodeSize` from calling `refreshNodeLayoutMap()`, which would recalculate autoHeight for loader nodes and overwrite the normalized shared height. Without this, the layout recompute would immediately undo the normalization.

### <span style="color: #80ffc0">handleNodeResize (dockResize.js)</span>
When a user drags a resize handle on a docked node:
- **Horizontal dock:** base `resolveDockResizeAxes()` returns `allowHeight = false`; `fathaNodeResize.js` opens corner height resize only when `canResizeHorizontalStackHeight()` passes. Width still follows the side/seam gates.
- **Vertical dock:** `allowWidth = false` — width changes are blocked; only height can be dragged
- `syncDockResizePair` with `dx:0, dy:0` does NOT trigger re-normalization for blocked axes
- Pure top/bottom vertical stack seam drags preserve the stack's starting shared width during the live resize window, growing only to a freshly measured content floor if that starting width is genuinely too small. This prevents stale wider member sizes from being reintroduced when height-only seam drags wake runtime sizing and vertical normalization.
- Active pointer-drag resize paths write node sizes with `silent`, `deferDirty`, `deferSync`, and `liveResize`, then batch DOM shield updates through the live resize scheduler. Slot sync stays local to nodes whose geometry changed. This avoids a per-pointermove fight between layout rebuilds, shield sync, and dock normalization.

### <span style="color: #80ffc0">settleDerpSizeBeforeDrawImpl (dockResize.js)</span>
Handles SNAP alignment for nodes whose size isn't yet on the SNAP grid. Called for autoHeight nodes and nodes with explicit size changes. Uses `getNodeSizeBounds` for min/max clamping and `syncDockResizePair` for group propagation.

### <span style="color: #80ffc0">Node 2.0 Group Release Maintenance (fathaHandler.js)</span>
When ComfyUI Node 2.0/Vue mode moves a default group containing docked Derp stacks, positions can be correct during drag but still enter Derp's draw-time dock maintenance on mouse release. `fathaHandler.js` now checks whether every recorded dock edge is already geometrically aligned before running release-time maintenance:
- `areDockedEdgesAligned()` compares each connected edge with a small tolerance.
- `syncHorizontalDeckHeight()` skips shared-height sync when horizontal stack edges and heights are already aligned.
- `normalizeDerpDockedLayout()` skips vertical and horizontal relayout when edges are already aligned.
- Legacy LiteGraph mode does not use this aligned-edge skip; it keeps the existing normalization flow.

## <span style="color: #80ffc0">Dock Types</span>

### <span style="color: #80ffc0">Horizontal Dock</span>
- Nodes are docked side-by-side
- Heights are normalized to the tallest member
- Widths are distributed across available horizontal space
- Base `allowHeight = false` during resize; corner height resize is enabled only for rows with at least one preferred-manual/Fit Node member. All fixed/numeric-height rows remain height-locked.

### <span style="color: #80ffc0">Vertical Dock</span>
- Nodes are docked top-to-bottom
- Widths are normalized to the widest member
- Heights are distributed across available vertical space
- `allowWidth = false` during resize — only height can be dragged
- `masterDockEngine.lockDeckNodeAxes()` saves each node's preferred height mode, forces manual runtime height for top/bottom docking, and restores the saved preference on undock
- A node that must keep automatic height can opt out by setting `properties.deckForceAutoHeight = true` before docking

### <span style="color: #80ffc0">Vertical Stack</span>
- Nodes are stacked vertically with their own independent heights
- Widths are normalized to the widest member
- Each node keeps its own height (no height normalization)
- `allowWidth = false` during resize
- Member height defaults to free/manual runtime resize through the shared height-policy contract unless the node explicitly forces auto-height on

### <span style="color: #80ffc0">Preferred vs Runtime Height</span>
- `js/fatha/core/derpHeightPolicy.js` is the shared contract for height ownership.
- `resolveDerpPreferredAutoHeight(node)` answers the node's saved Height Mode preference.
- `resolveDerpRuntimeAutoHeight(node)` answers the live dock-aware behavior the resize engine should use.
- `applyDerpPreferredAutoHeight(node, preferred)` updates both standalone behavior and dock-saved preference without letting child nodes punch raw `autoHeight` values back into vertical stacks.
- Dock locking must capture the preferred height mode before writing runtime `autoHeight = false`; resolving preference after that mutation can accidentally save the forced manual runtime state as the user's Height Mode.
- Child nodes such as `derpSeedV3`, `derpTriggerWall`, and `derpLoraStack` now write Height Mode changes through that helper instead of open-coding `deckSavedAutoHeight` and `autoHeight` mutations.
- If the outer top/bottom member is collapsed, boundary resize keeps that collapsed header at compact height and applies the added height to the nearest expanded member inside the stack
- Collapsed boundary resize sessions must snapshot collapsed members at their compact minimum height, not stale live `nodeSize`, so top/bottom boundary drags cannot reintroduce phantom gaps.
- Expanded filler members changed by collapsed boundary resize stay marked as actively resizing until pointer-up, so draw-time auto sizing cannot fight live shrink drags.
- Collapsed boundary corner handles require clear vertical drag intent before changing stack height; left/right movement remains width-only
- Normal collapsed node height is the fixed compact header (`SNAP * 2`) and does not grow from width-dependent layout measurements; only nodes that set `useCollapsedTotalHeight` opt into measured collapsed height
- Reflow after vertical-stack height changes runs over one topology-ordered column and preserves the pinned member anchor; recursive neighbor snapping is avoided because it can leave gaps when collapsed heights change.
- Deck Pressure layout only dirties members whose size or position actually changed; unchanged branch members must not be marked dirty during idle pressure passes.


### <span style="color: #80ffc0">Deck Pressure Hub</span>
- V1 is limited to `derpImageDeck` nodes (`_isDerpImageDeckNode` / `xcpDerpImageDeck`).
- Deck Pressure geometry is owned by the canonical plan from `computeDeckPressureGeometryPlan()` in `masterDockEngine.js`: one frame, one hub rect, four branch bands, and member rects solved inside those bands. Layout, side-seam resizing, outer-frame corner bounds, and seam ghosts should read from that plan rather than re-deriving bounds from live child extents.
- Child node extents must not silently redefine the Deck frame during resize. Side seams adjust only the side branch / hub split inside the preserved frame; outer Deck width and height should change only through explicit outer-frame resize handles.
- If side-seam min constraints cannot fit inside the preserved frame, the seam clamps inside that frame; layout must not repair the impossible split by growing the outer Deck frame.
- Alt-drag a node or existing docked stack near an ImageDeck edge to attach it as a Deck Pressure branch.
- A hub can own one linear branch per edge: `left`, `right`, `top`, and `bottom`.
- Branches remain normal graph-space docked nodes; there is no nested container, viewport, clipping, or custom serialization.
- Experimental Fatha content viewports are opt-in inside branch nodes: a scroll-enabled content region may expose a clipped physical height to Deck Pressure while preserving its full internal content height behind a scrollbar. Deck math should use the clipped physical node height; widget drawing and hit-testing are remapped by `fathaContentViewport*.js`.
- Existing linear stacks may attach to any ImageDeck edge. Deck Pressure preserves the stack's own orientation and infers branch axis from the branch topology instead of from the hub side; single-node branches still fall back to the side's original default axis.
- Deck Pressure hubs expose their own header deck control only while branches are attached. Ordinary stack undock buttons are hidden on nodes that are themselves inside a Deck Pressure group, so stack controls do not double as deck controls.
- The hub deck control detaches every Deck Pressure branch from the hub while leaving ordinary stacks inside those branches intact.
- Deck Pressure attach ghosts and highlighted edge lines use the composed Deck frame, including already-attached branches, so left/right previews span the whole Deck height and top/bottom previews span the whole Deck width. Valid ghost edges pulse through `masterAnimator` between `_System/_DK_System` `ghost_deck_valid._OFF` and `_ON`, using the shared selected-node default pulse speed unless overridden.
- `Derp.DeckArrangement` controls how an empty ImageDeck resolves new Deck Pressure branches. Values are `automatic`, `vertical_sandwich`, and `horizontal_sandwich`.
- Each hub persists its resolved arrangement in `properties.deckArrangement` when the first branch attaches. Changing the global setting later does not rearrange hubs that already have members, but an empty/detached hub resolves again from the current setting on its next first attach.
- `automatic` resolves from the first attached branch: top/bottom first creates a `vertical_sandwich`; left/right first creates a `horizontal_sandwich`.
- `vertical_sandwich` is the original layout: side branches (`left`/`right`) target the full Deck frame height including top branch + ImageDeck hub + bottom branch, while top/bottom branches align to the ImageDeck hub width.
- `horizontal_sandwich` makes side branches target the ImageDeck hub height only, while top/bottom branches span the full Deck frame width including left branch + ImageDeck hub + right branch.
- When a branch overflows, Deck Pressure keeps the active/hovered/pressed or just-toggled member expanded, collapses non-active siblings first, and grows the hub frame only when collapsed minimum sizes still cannot fit.
- Side-branch pressure compares expanded minimum requirements before collapsing, so multiple nodes can stay expanded whenever the branch can fit them by resizing.
- Horizontal stacks attached to the left/right side of a Deck Pressure hub cannot be collapsed; pressure layout reopens any already-collapsed side-horizontal members.
- Dock finalization treats the ImageDeck hub position as anchored; normal pair normalization may move attached branches, but must not move the hub itself.
- ImageDeck-owned pressure attaches skip generic `normalizeDockPair()` / `forceDockResizeRefresh()` because those normal stack helpers can reinterpret the new hub seam as a resizable shared edge and move the hub.
- Ordinary dock normalization and draw-time dock frame state must not treat the ImageDeck hub seam as a normal horizontal or vertical stack edge; Deck Pressure layout owns hub-to-branch sizing.
- Shared-edge resizing inside a Deck branch must resolve the branch's linear member list (`getDeckPressureBranchMembers`) and actual branch axis (`getDeckPressureBranchAxis`) instead of using whole-group `isLinearDeckGroup()` or side-implied orientation, because the full ImageDeck-owned group is intentionally mixed-axis.
- Side-branch width resizing is exposed on the shared vertical seam between the `derpImageDeck` hub and a left/right branch. The resize changes the branch width and compensates the hub width while preserving the outer Deck frame bounds.
- In every Deck Pressure arrangement, hub-facing seams for left/right side branches resize the side stack and compensate the ImageDeck hub width inside the existing Deck frame; they must not grow or shrink the whole Deck frame.
- Left/right Deck Pressure side seams are one continuous Deck-side edge, even when the side branch or center frame is visually segmented by stacked/decked nodes. Hover ghosts and resize handling must route every segment on that physical seam through Deck Pressure side-width resize, not ordinary member-to-member stack resizing.
- Once a Deck Pressure side seam resize session starts, that session remains authoritative until pointer-up. Do not reclassify the gesture from live seam geometry on every move, because clamp/max-edge frames can momentarily fail the geometric seam test and break through into ordinary stack or whole-frame resizing.
- During that live side-seam resize session, the hub keeps the preserved Deck frame bounds and active side-width override until pointer-up, including at the min/max clamp boundary; draw-time or idle pressure layout must not recompute the side branch from clipped-region content width and grow the outer Deck frame by a snap step.
- Left/right vertical side branches also keep their member widths locked during the live side-seam gesture, because clipped-region redraws can otherwise reinterpret viewport gutter/content minimum changes as real branch-width growth.
- Left/right vertical side branches cache their branch band width on the hub after attach and intentional side-seam resizing. Idle pressure layout must use that cached width instead of recalculating from live `layout.contentMinWidth`, because transient content measurement can otherwise widen the side branch and shift the Deck frame.
- When a left/right Deck Pressure branch is horizontal, the hub-facing seam is a Deck Pressure side-width split: it redistributes side-branch and hub width inside the existing frame, and must not expose the horizontal stack's ordinary outer-edge width resize.
- For left/right horizontal Deck Pressure branches, `_deckPressureSideHorizontalWidth` is the only draw-time width lock. Row layout can still use current width as a sizing fallback, but plain branch membership must not lock autoWidth members or they stop resolving back through their layout-measured width.
- The shield hitbox for a left/right horizontal Deck Pressure branch must still expose the hub-facing mid-edge strip and route it to Deck Pressure side-width resizing; otherwise the branch shield can cover the hub seam so only top/bottom portions feel draggable.
- Left/right horizontal Deck Pressure branches grow their own row height to fit the Deck side band or their own minimum; they must not shrink or pressure-grow the ImageDeck hub height during attach.
- When a left/right horizontal Deck Pressure branch is undecked, its member widths are preserved as explicit manual widths so restored auto-width cannot grow the stack after the detach refresh.
- In `horizontal_sandwich`, preserved frame bounds still span top/bottom rows, but side branches use the hub's vertical band for their `y` and height so top branches do not pull side stacks upward.
- Pure top/bottom shared-edge resizing in a side branch is handled as an ordered vertical seam before generic node resize, so dragging one member cannot move it behind its neighbor.
- During internal vertical seam drags in left/right Deck Pressure branches, the live pass must preserve the canonical Deck frame and immediately run Deck Pressure layout for the branch; generic vertical position normalization can push later branch members outside the side band until idle layout snaps them back.
- Viewport-backed branch nodes must not use the full expanded layout height as their seam minimum; their declared viewport `minClipHeight` is the floor so Fit Node modes can shrink to one visible entry/group.
- Active-resize and fresh manual seam-fit height preservation in left/right vertical Deck Pressure branches must keep live member heights while their sum still fits the side band, even if the actively dragged pair is temporarily below measured floors. Otherwise pressure layout may redistribute height into unrelated siblings during the drag. If the branch total no longer fits, pressure layout must refit/clamp inside the fixed frame.
- Internal vertical seam drags in Deck Pressure side branches snapshot every branch member's seam-fitted height so later pressure passes do not redistribute spare height into unrelated siblings such as Slider or LoraStack. The DOM shield resize-start path must use the same branch-aware member list before the first pointer move; ordinary `isLinearDeckGroup()` checks see the mixed ImageDeck group and can miss lower side-branch seams.
- Horizontal shared-edge resize must also normalize positions against that branch-only member list; using `getDeckMembers()` here will march the whole mixed Deck group sideways.
- Internal node-to-node seams in left/right Deck Pressure horizontal branches must resolve same-row branch neighbors by geometry and hub membership, not only generic `deckEdges`; the outer hub-facing seam remains reserved for hub/frame resize.
- Horizontal shared-edge resize in side Deck Pressure branches writes explicit manual widths back to both seam members so later pressure layout preserves the adjusted row instead of restoring auto-width sizing.
- Internal horizontal NODE-to-NODE seams use dedicated full-height DOM shield strips so adjacent branch shields cannot cover the draggable vertical seam.
- Shared-edge resize hover and active dragging draw a 1px seam ghost centered exactly on the shared seam through `masterPainter`, so `ghost_seam_valid` fill and effects are honored. Seam ghosts use `_System/_DK_System` theme key `ghost_seam_valid`: `_OFF` when animation is disabled, or the same `_OFF`/`_ON` pulse speed used by `ghost_deck_valid` when animation is enabled.
- Horizontal collapse/uncollapse sync and shared-height normalization for Deck Pressure top/bottom branches must also resolve the branch-only horizontal member list. The full ImageDeck pressure group is mixed-axis and is not a valid horizontal stack for this purpose.
- Lower-left hub resize must clamp to top/bottom branch minimum widths and preserve the right edge if pressure layout grows the hub back to minimum width.
- Idle Deck Pressure maintenance should skip across frames using a stable geometry signature. Only rerun pressure layout when a member is dirty, resizing, dragging, awake, inside `_deckPressureActiveUntil`, or when geometry changes.
- Active Deck Pressure hub resize should batch member dirty/shield sync and flush once per changed node after `applyDeckPressureLayout()`. Do not call `syncUncleSlots`, `setDirtyCanvas`, or `syncDerpShield` repeatedly inside each branch row/column pass.
- `Derp.DeckResizeOptimization` controls branch rendering during active ImageDeck frame resize. `none` keeps full rendering, and `ghost_layout` draws branch outlines while hiding branch DOM widgets until release. The old bitmap snapshot resize mode was removed; use true whole-wall cache paths only where whole-wall caching is explicitly enabled. The hub remains fully rendered and Deck Pressure geometry math is unchanged.
- ImageDeck auto-fit height changes from newly loaded images must call Deck Pressure layout immediately so attached branches resize with the hub in the same load callback.
- Deck Pressure branch order is derived from deck-edge topology rather than live x/y sorting, so temporary overlap during shared-edge resize cannot swap branch members.
- Side-branch pressure measures collapsed minimums by temporarily recomputing the collapsed layout; collapsed members stay at that minimum and only expanded members receive spare Deck-frame height.
- Side branches always keep one expanded filler member; if all branch members are collapsed, Deck Pressure re-expands the active member before fitting the branch to the Deck frame.
- Pressure min-span measurement is cached per node by axis, collapsed state, snap, width, and layout hash; current height is deliberately excluded because pressure layout changes it during fitting.
- Active filler selection ignores hover-only state; it prefers the current interaction window, pressed nodes, selected expanded nodes, then any already-expanded side-branch member before falling back to branch order.
- Top/bottom vertical Deck Pressure branches preserve their own member heights during ImageDeck frame resize; hub height deltas must not be fit into those branch columns.
- Left/right vertical Deck Pressure branches preserve freshly seam-resized member heights during release settlement; saved expanded heights must not immediately re-grow the active lower member after mouse-up.
- Collapsed pressure height uses the recomputed collapsed virtual layout only; hidden expanded `layoutMap` regions and their `minHeight` values are ignored for collapsed side-branch sizing.
- Collapsed pressure height falls back to the compact collapsed header height (`DEFAULT_DECK_SNAP * 2`) rather than the generic 40px node fallback.
- Pressure layout keeps the ImageDeck hub position anchored during collapse/un-collapse passes; only active hub resize may move it to preserve the dragged edge.
- Collapse/un-collapse size changes for Deck Pressure branch members skip generic `reflowChildren()` so branch positions are written only by Deck Pressure layout, preventing one-frame bottom-node flicker.
- Ordinary mixed-axis docking remains rejected outside ImageDeck-owned Deck Pressure branches.
- ImageDeck and outer Deck-frame corner resize handles route to the hub; attached branch seams must not steal the hub corners.
- Deck Pressure corner resize handles belong to the outer frame bounds of the hub plus all branches; branch-member corners may resize the frame only when they are actual frame corners, while internal branch seam handles remain available.
- Deck Pressure visual corner overrides are separate from resize-hit detection and use the composed Deck frame. When a hub has attached branches, `getDeckCornerOverride()` compares each hub/branch member corner against the whole-frame bounds. Only corners that coincide with the Deck frame's four outer corners keep the node theme corner radius; all internal hub/branch/member seam corners are forced to zero.
- Ordinary linear stack visual corner overrides remain local occupied-edge based, so this composed-frame rule must stay gated to ImageDeck-owned Deck Pressure groups with attached branches.

## <span style="color: #80ffc0">Known Pitfalls</span>

### <span style="color: #80ffc0">Horizontal Docking Height Collapse (fixed 2026-06-07)</span>
<span style="color: #80aaff"><strong>Symptom:</strong></span> When horizontally docking nodes of different heights, the taller node collapses/shrinks instead of normalizing to shared height.

<span style="color: #80aaff"><strong>Root causes:</strong></span>
1. `fitSizesToTotal` double-counted minimum sizes (`assigned = minTotal` instead of `0`)
2. `applyColumnLayout`/`applyRowLayout` called `syncDeckNodeSize` without `silent: true`, triggering `refreshNodeLayoutMap` which recalculated autoHeight and overwrote the normalized shared height

<span style="color: #ffc680"><strong>Fix:</strong></span> Both bugs fixed in commit `a46f6f3`.

### <span style="color: #80ffc0">derpImageDeck Height Not Snapping (fixed 2026-06-07)</span>
<span style="color: #80aaff"><strong>Symptom:</strong></span> Image deck height drifts off the 10px SNAP grid, especially after aspect ratio changes.

<span style="color: #80aaff"><strong>Root cause:</strong></span> `resizeNodeToImageAspect` computed raw height delta without snapping. `restoreImageDeckRefreshAnchor` positioned without snapping the bottom coordinate.

<span style="color: #ffc680"><strong>Fix:</strong></span> Height snapped via `Math.ceil / SNAP * SNAP` in `resizeNodeToImageAspect`. Bottom coordinate snapped in both `resizeNodeToImageAspect` and `restoreImageDeckRefreshAnchor`.

### <span style="color: #80ffc0">Node 2.0 Group Release Dock Drift (fixed 2026-06-08)</span>
<span style="color: #80aaff"><strong>Symptom:</strong></span> In Node 2.0/Vue mode only, moving a default ComfyUI group containing a Derp docked stack showed correct positions during drag, then shifted slightly on mouse release. Legacy mode did not reproduce it.

<span style="color: #80aaff"><strong>Root cause:</strong></span> After group movement ended, Derp's Vue-mode dock maintenance ran shared-height sync or normalization even when the stack was already edge-aligned. The release-time pass could move members to a recomputed top/left and introduce a small visual drift.

<span style="color: #ffc680"><strong>Fix:</strong></span> `fathaHandler.js` now skips horizontal shared-height sync and vertical/horizontal normalization when `areDockedEdgesAligned()` confirms the dock stack is already geometrically aligned.
