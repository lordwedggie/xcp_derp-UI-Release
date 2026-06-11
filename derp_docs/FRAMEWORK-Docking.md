# Docking System

## Overview
The docking system allows derp nodes to be dragged into horizontal/vertical stacks where they share edges, normalize sizes, and resize together as a group. It's implemented entirely within the Fatha framework, bypassing LiteGraph's native node positioning.

**Last reviewed:** 2026-06-08

## Key Files

| File | Role |
|------|------|
| `core/masterDockEngine.js` | Master orchestrator (1610+ lines). Dock pair management, deck group tracking, size normalization, member registration, attach/detach, floating state. |
| `core/dockDimensions.js` | Dimension calculations for dock attach/detach. Computes shared heights/widths for dock groups. |
| `core/dockResize.js` | Resize handling for docked stacks. Propagates resize from one member to all. `handleNodeResize`, `syncDockResizePair`. |
| `core/dockDrag.js` | Drag logic for initiating and completing a dock action. |
| `core/dockTargetPicking.js` | Edge detection — which edge of which node are we being dragged near? |
| `core/dockDebugHelpers.js` | Debug logging utilities for docking state. |

## Dock Group Architecture

### Member Registration
Each node tracks its dock group via `_deckGroupId`. The dock engine maintains an internal registry of dock groups mapping `groupId → { members: [...], axis: "horizontal"|"vertical"|"stack" }`.

### Dock Pair
When two nodes dock, they form a pair: a **leader** (the node that stayed still) and a **follower** (the node that was dragged). The leader's position/size typically determines the shared dimensions.

### Deck Group Detection
`getDeckGroupAxis(node, graph)` returns `"horizontal"`, `"vertical"`, or `null`. A group requires `members.length > 1`. A single node is not a group.

## Dock Flow (Deep Dive)

```
drag starts → target detection → attach → normalizeDockPair → forceDockResizeRefresh
```

### 1. Target Detection (`dockTargetPicking.js`)
Detects proximity of dragged node to edges of potential dock targets. Returns target node + edge.

### 2. Attach (`masterDockEngine.js`)
- Registers the new member in the dock group
- Leader and follower snap their edges together
- Sets up shared `_deckGroupId`

### 3. Normalize (`normalizeDockPair`)
- Horizontal docks: normalizes HEIGHTS to shared max
- Vertical docks: normalizes WIDTHS to shared max
- Uses `getDeckMembers` to collect all members in the group

### 4. Post-Attach Refresh (`forceDockResizeRefresh`)
After normalizing, triggers a layout recompute for the leader and all members. This is where most bugs live — see "Horizontal Docking Height Collapse" below.

## Size Normalization

### Automatic horizontal edge width compensation
When a left-most or right-most member in a horizontal stack changes width from runtime layout changes, the stack first tries to keep its total width stable. Growth borrows shrinkable width from members on the opposite side down to their measured minimums; shrinkage gives the freed width to those opposite members. If there is not enough spare room, the stack is allowed to grow.
### Theme-driven vertical width growth
When a member of a vertical dock stack changes theme, its measured content floor can grow while the stack is already width-locked. Runtime dock sizing preserves the current shared width only as a floor, not as a ceiling, and vertical normalization runs after layout so all stack members adopt the new widest measured width.

### fitSizesToTotal (masterDockEngine.js)
Distributes total available space among members while respecting minimum sizes.

**Critical fix (2026-06-07):** Changed `let assigned = minTotal` → `let assigned = 0`. The old code double-counted minimums, causing single-node columns (the horizontal dock case) to receive `totalHeight - min` instead of `totalHeight`. This caused the shorter node in a horizontal pair to collapse to its minimum height.

### applyColumnLayout / applyRowLayout (masterDockEngine.js)
Sets member sizes to normalized values.

**Critical fix (2026-06-07):** Both functions now call `syncDeckNodeSize(node, w, h, { silent: true })`. The `silent: true` flag prevents `syncDeckNodeSize` from calling `refreshNodeLayoutMap()`, which would recalculate autoHeight for loader nodes and overwrite the normalized shared height. Without this, the layout recompute would immediately undo the normalization.

### handleNodeResize (dockResize.js)
When a user drags a resize handle on a docked node:
- **Horizontal dock:** `allowHeight = false` — height changes are blocked; only width can be dragged
- **Vertical dock:** `allowWidth = false` — width changes are blocked; only height can be dragged
- `syncDockResizePair` with `dx:0, dy:0` does NOT trigger re-normalization for blocked axes

### settleDerpSizeBeforeDrawImpl (dockResize.js)
Handles SNAP alignment for nodes whose size isn't yet on the SNAP grid. Called for autoHeight nodes and nodes with explicit size changes. Uses `getNodeSizeBounds` for min/max clamping and `syncDockResizePair` for group propagation.

### Node 2.0 Group Release Maintenance (fathaHandler.js)
When ComfyUI Node 2.0/Vue mode moves a default group containing docked Derp stacks, positions can be correct during drag but still enter Derp's draw-time dock maintenance on mouse release. `fathaHandler.js` now checks whether every recorded dock edge is already geometrically aligned before running release-time maintenance:
- `areDockedEdgesAligned()` compares each connected edge with a small tolerance.
- `syncHorizontalDeckHeight()` skips shared-height sync when horizontal stack edges and heights are already aligned.
- `normalizeDerpDockedLayout()` skips vertical and horizontal relayout when edges are already aligned.
- Legacy LiteGraph mode does not use this aligned-edge skip; it keeps the existing normalization flow.

## Dock Types

### Horizontal Dock
- Nodes are docked side-by-side
- Heights are normalized to the tallest member
- Widths are distributed across available horizontal space
- `allowHeight = false` during resize — only width can be dragged

### Vertical Dock
- Nodes are docked top-to-bottom
- Widths are normalized to the widest member
- Heights are distributed across available vertical space
- `allowWidth = false` during resize — only height can be dragged
- `masterDockEngine.lockDeckNodeAxes()` saves each node's original `autoHeight`, sets `autoHeight = false` for top/bottom docking so member height can be freely adjusted, and restores the saved value on undock
- A node that must keep automatic height can opt out by setting `properties.deckForceAutoHeight = true` before docking

### Vertical Stack
- Nodes are stacked vertically with their own independent heights
- Widths are normalized to the widest member
- Each node keeps its own height (no height normalization)
- `allowWidth = false` during resize
- Member height defaults to free/manual resize through temporary `autoHeight = false` unless the node explicitly forces auto-height on

## Known Pitfalls

### Horizontal Docking Height Collapse (fixed 2026-06-07)
**Symptom:** When horizontally docking nodes of different heights, the taller node collapses/shrinks instead of normalizing to shared height.

**Root causes:**
1. `fitSizesToTotal` double-counted minimum sizes (`assigned = minTotal` instead of `0`)
2. `applyColumnLayout`/`applyRowLayout` called `syncDeckNodeSize` without `silent: true`, triggering `refreshNodeLayoutMap` which recalculated autoHeight and overwrote the normalized shared height

**Fix:** Both bugs fixed in commit `a46f6f3`.

### derpImageDeck Height Not Snapping (fixed 2026-06-07)
**Symptom:** Image deck height drifts off the 10px SNAP grid, especially after aspect ratio changes.

**Root cause:** `resizeNodeToImageAspect` computed raw height delta without snapping. `restoreImageDeckRefreshAnchor` positioned without snapping the bottom coordinate.

**Fix:** Height snapped via `Math.ceil / SNAP * SNAP` in `resizeNodeToImageAspect`. Bottom coordinate snapped in both `resizeNodeToImageAspect` and `restoreImageDeckRefreshAnchor`.

### Node 2.0 Group Release Dock Drift (fixed 2026-06-08)
**Symptom:** In Node 2.0/Vue mode only, moving a default ComfyUI group containing a Derp docked stack showed correct positions during drag, then shifted slightly on mouse release. Legacy mode did not reproduce it.

**Root cause:** After group movement ended, Derp's Vue-mode dock maintenance ran shared-height sync or normalization even when the stack was already edge-aligned. The release-time pass could move members to a recomputed top/left and introduce a small visual drift.

**Fix:** `fathaHandler.js` now skips horizontal shared-height sync and vertical/horizontal normalization when `areDockedEdgesAligned()` confirms the dock stack is already geometrically aligned.
