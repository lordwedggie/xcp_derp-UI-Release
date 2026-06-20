# <span style="color: #ff8080">Framework:</span> <span style="color: #ffffff">Clipping / Content Viewport</span>

## <span style="color: #80ffc0">Overview</span>

<span style="color: #80aaff"><strong>Purpose:</strong></span> The clipping / content viewport layer is Fatha's shared framework for regions that keep full internal content while exposing only a clipped visible window on the node face.

<span style="color: #80aaff"><strong>Primary use:</strong></span> It powers `scrollViewport: true` layout regions, including clipped entry walls such as `derpLoraStack`, `derpTriggerWall`, `derpSeedV3`, and loader decks that need a scrollbar without growing the whole node forever.

<span style="color: #80aaff"><strong>Ownership:</strong></span> Scrollbar drawing, wheel handling, thumb dragging, scroll state, hit filtering, and clipped draw remapping are framework-owned. Nodes opt in declaratively by defining viewport regions and clip-height policy.

<span style="color: #80aaff"><strong>Hub files:</strong></span>

| File | Role |
|------|------|
| `js/fatha/core/fathaContentViewport.js` | Core viewport state, clipping layout pass, scroll state, overflow detection, gutter allocation, redraw requests. |
| `js/fatha/core/fathaContentViewportDraw.js` | Canvas clipping helpers plus shared scrollbar drawing. |
| `js/fatha/core/fathaContentViewportShield.js` | Wheel input and scrollbar thumb/track drag behavior. |
| `js/fatha/core/masterLayoutEngine.js` | Calls viewport layout during layout passes. |
| `js/fatha/core/fathaDOMshield.js` | Routes pointer and wheel events into the viewport shield helpers. |
| `js/fatha/core/fathaHandler.js` | Filters hit testing so clipped-off descendants do not receive interaction. |
| `js/fatha/fatha.js` | Calls the shared scrollbar draw pass during node rendering. |

## <span style="color: #80ffc0">Core Model</span>

<span style="color: #80aaff"><strong>Opt-in contract:</strong></span> A region becomes a content viewport when its layout-map config sets `scrollViewport: true` and provides a positive `clipHeight` value.

<span style="color: #80aaff"><strong>Visible window:</strong></span> The viewport region stays physically clipped to `clipHeight` while its descendants keep their full measured content height behind the viewport.

<span style="color: #80aaff"><strong>Scroll state:</strong></span> Per-viewport scroll positions live on `node._contentViewportScroll[viewportKey]`. Derived live viewport metadata lives on `node._contentViewportState[viewportKey]`.

<span style="color: #80aaff"><strong>Overflow rule:</strong></span> The scrollbar appears only when `fullHeight > visibleHeight`.

<span style="color: #ffc680"><strong>Note:</strong></span> This framework is distinct from old per-widget editor scroll handling. EDITOR widgets still maintain their own internal text scroll state. Content viewports are region-level clipping and scrolling for layout-map subtrees.

## <span style="color: #80ffc0">Layout Pass</span>

<span style="color: #80aaff"><strong>Entry point:</strong></span> `masterLayoutEngine` imports and runs `applyContentViewportLayout()` from `fathaContentViewport.js`.

Relevant framework call sites:

- `js/fatha/core/masterLayoutEngine.js`
- `applyContentViewportLayout(this.owner, this.regions, this, { publishState: false })`
- `applyContentViewportLayout(this.owner, this.regions, this)`

<span style="color: #80aaff"><strong>What the layout pass does:</strong></span>

1. Finds every region with `scrollViewport: true`.
2. Resolves `clipHeight` and optional `minClipHeight`.
3. Measures descendant content bottom to get full internal height.
4. Shrinks the live region height to the clipped visible height.
5. Detects overflow and reserves scrollbar gutter width.
6. Publishes `_contentViewportState` and clamps `_contentViewportScroll`.
7. Recomputes `layout.totalHeight` and `layout.contentMinHeight` so hidden content stops growing the node.

<span style="color: #80aaff"><strong>Key fields written onto live regions:</strong></span>

- `region._contentViewport = true`
- `region._contentViewportFullHeight`
- `region._contentViewportClipHeight`
- `region._contentViewportHasOverflow`

<span style="color: #80aaff"><strong>Shared constants:</strong></span>

- `FATHA_CONTENT_SCROLLBAR_WIDTH`
- `FATHA_CONTENT_SCROLLBAR_MIN_THUMB`

<span style="color: #ffc680"><strong>Note:</strong></span> `minClipHeight` is separate from `clipHeight`. `clipHeight` controls the current visible height. `minClipHeight` controls how much the viewport contributes to manual resize floors through `_contentViewportState[viewportKey].minClipHeight` and `layout.contentMinHeight`.

## <span style="color: #80ffc0">Drawing</span>

<span style="color: #80aaff"><strong>Clipped draw remap:</strong></span> `fathaContentViewportDraw.js` exposes helpers that convert normal region drawing into viewport-aware drawing.

Main helpers:

- `getContentViewportDrawInfo(node, regionKey, geometry)`
- `withContentViewportClip(ctx, node, regionKey, geometry, drawFn)`
- `getContentViewportGeometry(node, regionKey, geometry)`
- `drawContentViewportScrollbars(ctx, node)`

<span style="color: #80aaff"><strong>Scrollbar rendering:</strong></span> The shared scrollbar track and thumb are drawn in `drawContentViewportScrollbars()` using `masterPainter()`.

<span style="color: #80aaff"><strong>Render owner:</strong></span> `js/fatha/fatha.js` calls `drawContentViewportScrollbars(activeCtx, this)` after the main region draw pass. Nodes do not draw their own viewport scrollbars.

<span style="color: #ffc680"><strong>Note:</strong></span> Scrollbar visuals are currently centralized but still hardcoded in this framework layer with simple neutral fills. If theme-driven viewport scrollbars are ever added, the shared draw path belongs here, not in individual node files.

## <span style="color: #80ffc0">Interaction</span>

<span style="color: #80aaff"><strong>Wheel handling:</strong></span> `fathaContentViewportShield.js` owns viewport wheel scroll behavior through `handleContentViewportWheel()`.

<span style="color: #80aaff"><strong>Scrollbar drag handling:</strong></span> The same file owns click-on-track and thumb dragging through `tryStartContentViewportScrollbarDrag()`.

<span style="color: #80aaff"><strong>Pointer mapping:</strong></span> `mapShieldPointThroughContentViewport()` remaps local shield coordinates so hovered/pressed descendants use the correct scrolled content-space `y` position.

<span style="color: #ffc680"><strong>Important:</strong></span> Hit testing must resolve pointer space per candidate region. Descendants inside a scrolled viewport are tested with content-space coordinates, while normal siblings below the viewport, footer controls, and the system button are tested with displayed node-local coordinates. Do not run one globally scrolled pointer through every region candidate.

Relevant integration in `fathaDOMshield.js`:

- pointer-down checks `tryStartContentViewportScrollbarDrag(...)`
- wheel checks `handleContentViewportWheel(...)`
- hover/press coordinate mapping goes through `mapShieldPointThroughContentViewport(...)`

<span style="color: #80aaff"><strong>Hit filtering:</strong></span> `fathaHandler.js` calls `isContentViewportRegionHitVisible()` so descendants clipped outside the viewport rectangle stop receiving hover, click, drag, and context menu hits.

<span style="color: #80aaff"><strong>Tooltip anchoring:</strong></span> Basta tooltips spawned for viewport descendants must anchor to the displayed viewport position, not the raw unscrolled content-space region. `basta.js` resolves the target through `getContentViewportForRegion()` and subtracts `scrollTop` before pinning the tooltip.

<span style="color: #80aaff"><strong>Drag-and-drop filtering:</strong></span> Stack/list DnD must use viewport-displayed regions only. `helpers/fathaDragDrop.js` filters drop candidates through `getContentViewportForRegion()` and keeps drop preview indexes in the real property-array insertion space. Custom DnD paths, such as TriggerWall group/item drag, must do the same when they bypass `updateStackDrag()`.

<span style="color: #80aaff"><strong>Drag floater coordinates:</strong></span> Viewport DnD stores pointer state in scrolled content space for hit testing and insertion math. Shared helpers in `helpers/fathaDragDrop.js` capture floating snapshots and resolve floater transforms through viewport-displayed geometry so dragged rows stay under the cursor after scrolling.

<span style="color: #ffc680"><strong>Note:</strong></span> Drag payloads from `fathaDOMshield.js` intentionally carry both coordinate spaces: `localX/localY` are viewport-remapped content coordinates, while `displayLocalX/displayLocalY` are raw displayed node-local coordinates. Stack/list floaters should use displayed coordinates for visuals and content coordinates for drop math.

## <span style="color: #80ffc0">Node Integration</span>

<span style="color: #80aaff"><strong>Framework expectation:</strong></span> Nodes should only declare viewport regions and provide clip sizing logic. They should not reimplement scrollbar drawing, wheel behavior, or thumb dragging.

Current node-side opt-in examples:

| File | Region | Node-side responsibility |
|------|--------|--------------------------|
| `js/derps/controldeck/derpLoraStack.js` | `loraEntriesRegion` | Enables `scrollViewport`, provides `resolveLoraStackClipHeight` and `resolveLoraStackMinClipHeight`. |
| `js/derps/controldeck/derpTriggerWall.js` | `triggerGroupsViewportRegion` | Enables `scrollViewport`, provides TriggerWall viewport clip/min-clip helpers. |
| `js/derps/controldeck/derpSeedV3.js` | `historyRegion` | Enables `scrollViewport`, provides history clip height and row-based minimum. |
| `js/derps/loaders/derpDiffusionLoader.js` | `sysContentRegion` | Enables `scrollViewport`, provides a simple fixed clip-height property. |

<span style="color: #80aaff"><strong>Allowed node-side customization:</strong></span>

- `scrollViewport: true`
- `clipHeight`
- `minClipHeight`
- `getDerpHeightModeConfig()` when the shared system-panel Height Mode control needs clipped-node-specific options such as `Fit Node` or measured entry/group counts
- `contentViewportClip: false` on descendants that must remain visually outside clipping

<span style="color: #80aaff"><strong>Height Mode contract:</strong></span> For clipped nodes, `Fit Node` is manual outer-node height (`autoHeight = false`) with a viewport that fits the current node/stack/deck height. Numeric modes set `autoHeight = true` and floor the viewport at the selected number of measured entries or groups before overflow scrolling begins.

<span style="color: #ffc680"><strong>Note:</strong></span> Clipped-node lifecycle/configure code must normalize the persisted Height Mode value and derive `autoHeight` from it. If a node shows `Fit Node` but still behaves like auto-height until the user changes modes, the properties are out of sync.

<span style="color: #ffc680"><strong>Note:</strong></span> When a footer, overlay, or loading control must stay outside the viewport clip, place it as a sibling after the viewport region or explicitly mark the subtree with `contentViewportClip: false`.

## <span style="color: #80ffc0">Resize and Docking Interactions</span>

<span style="color: #80aaff"><strong>Manual resize floors:</strong></span> `dockResize.js` contains viewport-aware minimum-floor logic so clipped regions contribute their visible/min-clip height instead of their hidden full content height.

Relevant helpers:

- `getVisibleRegionLayoutFloor()` in `js/fatha/core/dockResize.js`
- `getVerticalResizeTargetMinHeight()` in `js/fatha/core/dockResize.js`

<span style="color: #80aaff"><strong>Why it exists:</strong></span> Dock and manual height resizing need the clipped physical height, not the internal scrolled content height, or the node will immediately grow back after a manual shrink.

<span style="color: #80aaff"><strong>Live vs settled floors:</strong></span> Standalone/manual node resize should preserve the settled expanded floor during drag so the node cannot visually compress past the height it will snap to on pointer-up. Stack/deck seam math can use the viewport-aware min floor to divide a fixed stack span while still respecting each clipped node's declared `minClipHeight`.

<span style="color: #80aaff"><strong>Runtime sizing:</strong></span> Runtime-only expanded-height guards such as `_minExpandedHeight` must not override `Fit Node` manual height. Apply those guards only when the node is actually auto-height, otherwise a clipped node can look correct during drag and snap taller on release.

<span style="color: #ffc680"><strong>Note:</strong></span> This is still framework-owned behavior. It is viewport-aware resize math, not a second scrollbar implementation.

## <span style="color: #80ffc0">Consolidation Status</span>

<span style="color: #80aaff"><strong>Current verdict:</strong></span> The clipped-region / viewport system is properly consolidated in shared Fatha framework files.

Centralized in framework:

- overflow detection
- scroll state
- scrollbar gutter sizing
- scrollbar track/thumb geometry
- canvas clipping helpers
- scrollbar drawing
- wheel input
- thumb drag input
- redraw requests
- clipped hit filtering

Node-local only:

- whether a region uses `scrollViewport`
- how tall `clipHeight` should be for that node
- how much `minClipHeight` should contribute to manual floors
- whether Height Mode options need node-specific labels or measured entry/group counts
- whether a descendant subtree should opt out through `contentViewportClip: false`

<span style="color: #ffc680"><strong>Maintenance rule:</strong></span> Any future scrollbar visual, interaction, overflow, or clipped hit-test fix belongs in `fathaContentViewport*.js`, `fathaDOMshield.js`, `masterLayoutEngine.js`, `fatha.js`, or `dockResize.js` as appropriate. Do not fork viewport behavior per node unless there is a proven framework gap.

## <span style="color: #80ffc0">Debugging</span>

<span style="color: #80aaff"><strong>Viewport debug flag:</strong></span> Set `window.xcpDerpDebugContentViewports = true` in the browser console to draw viewport debug boxes.

Useful inspection targets:

- `node._contentViewportState`
- `node._contentViewportScroll`
- `layout.contentViewportGutter`
- live region fields such as `_contentViewportClipHeight` and `_contentViewportHasOverflow`

<span style="color: #80aaff"><strong>First files to inspect for viewport bugs:</strong></span>

1. `js/fatha/core/fathaContentViewport.js`
2. `js/fatha/core/fathaContentViewportDraw.js`
3. `js/fatha/core/fathaContentViewportShield.js`
4. `js/fatha/core/fathaDOMshield.js`
5. `js/fatha/core/masterLayoutEngine.js`
6. `js/fatha/core/dockResize.js`

## <span style="color: #80ffc0">Update Rule</span>

<span style="color: #80aaff"><strong>Keep this file synced</strong></span> whenever viewport behavior changes in any of these areas:

- `scrollViewport` layout semantics
- `clipHeight` / `minClipHeight` handling
- viewport scrollbar visuals
- viewport wheel or thumb drag behavior
- clipped hit testing
- viewport-aware manual resize floors
- node integration expectations for clipped regions
