# Fatha — The Virtual DOM / Layout Framework

## Overview
Fatha is the master orchestration layer that hijacks ComfyUI's native LiteGraph render pipeline and replaces it with a custom layout/rendering/docking system. Every derp node registers through `fatha()` or `uncle()` and becomes a `isFathaNode` / `isUncleNode`.

**Entry point:** `js/fatha/fatha.js`
**Last reviewed:** 2026-06-08

## Architecture Layers

### 1. The Perfect Heist (Render Hijack)
- Hijacks `LGraphCanvas.prototype.drawNode` globally
- Before LiteGraph draws: caches true state (`_xcpTrueSelected`, `_xcpTrueInputs`, `_xcpTrueOutputs`), sets slots to `[]`, kills selection box by setting `selected = false`
- Calls custom `onDrawForeground(ctx)` — Fatha's own render
- After draw: restores true state so interaction still works
- Also hijacks `LGraphCanvas.prototype.renderLink` for derp-colored links
- Applies `window.xcpDerpTypeColors` to ALL nodes' input/output dots globally

### 2. Node Registration: `fatha(nodeType, nodeData, minWidth)`
Sets up prototype methods:
- `getDerpVars()`, `handleThemeUpdate(config)`, `onThemeUpdate(config)`, `applyPalette()`
- `drawNodeShape(ctx)`, `drawNodeBypass(ctx)`, `drawNode(ctx)` → all route to `onDrawForeground`
- `handleShieldInteraction(type, data)` — DOM interaction routing
- `requestDerpSync()`, `computeSize(out)`, `collapse(force)`
- `onConfigure(info)` — deserialization hook
- `onModeChange(mode)` — bypass spoofing for mode 4

### 3. Draw Lifecycle (`onDrawForeground`)
Every frame:
1. **Mode change detection:** if mode flipped to bypass (4), transmit bypassed signals; if un-bypassed, sync outputs
2. **Title change detection:** update wireless registry
3. **Collapsed check:** if collapsed, hide shield and return
4. **Layout engine:** instantiate `masterLayoutEngine` if missing; pre-allocate `_compDataCache`
5. **Dirty detection:** check pos/size/scale/offset/selected/mode/hover against `_prevDerpState`
6. **Animation:** recoil via `animateRecoil()`, awake frames
7. **Panel active detection** (Basta host)
8. **Layout compute:** if size/mode/selected changed or `_forceSync`/`_layoutDirty`, recompute layout
9. **Collapse anim:** lerp target height
10. **Footer sync:** anchor footer to bottom
11. **Render:** `handleDrawCTX(this, ctx)` — paints all regions
12. **Passive Whole Wall Cache:** for TriggerWall/LoraStack, cache full panel as OffscreenCanvas; reuse if no structural/hover change

### 4. Core Engines
| File | Role |
|------|------|
| `core/masterLayoutEngine.js` | Recursive layout computation (1065 lines). Computes region positions/sizes from layout map declarative config. Handles anchors, flex directions, auto-sizing, text measurement, component blueprints. |
| `core/masterDockEngine.js` | Docking system (1610 lines). Drag-to-dock, deck snapping, dock member management, resize propagation. |
| `core/masterSignalEngine.js` | Wireless signal transmission (357 lines). `transmitDerpSignal()`, `transmitBypassedDerpSignals()`, `purgeDerpSignal()`. Color palette registry (`xcpDerpTypeColors`). |
| `core/fathaHandler.js` | Node lifecycle: shield interaction routing, draw CTX dispatch, theme update, global listener init, `getDerpVars()`, sync, compute size, collapse anim, deck preview. |
| `core/fathaDOMshield.js` | DOM overlay creation/sync/removal. Creates an interaction shield `<div>` over the node canvas for mouse events. |
| `core/fathaWarp.js` | Warp/drag/movement helpers. `ensureScreenRectVisible()`, `isWarping()`. |
| `core/fathaNode2Compat.js` | Compatibility shims for newer ComfyUI/LiteGraph behavior. |
| `core/fathaNodeResize.js` | Node resize handling. |
| `core/dockDrag.js` | Drag logic for docking. |
| `core/dockResize.js` | Resize logic for docked stacks. |
| `core/dockTargetPicking.js` | Target detection for dock zones. |
| `core/dockDimensions.js` | Dock dimension calculations. |
| `core/dockDebugHelpers.js` | Debug logging for docking. *Disabled by hardcode since we no longer have any layout problems...well for a while now. |
| `core/masterLayoutTypes.js` | `UI_TYPES` enum + `COMPONENT_BLUEPRINTS` registry. Maps type strings to Herbina widget creators/syncers. |
| `core/masterZ.js` | Shared z-index constants and promotion helpers for shields, overlays, and debug layers. |

### 5. Helpers
| File | Role |
|------|------|
| `helpers/fathaDragDrop.js` | Drag-and-drop reordering (`startStackDrag`, `updateStackDrag`, `endStackDrag`) |
| `helpers/fathaLayoutMaps.js` | Virtual node layout map generation |
| `helpers/fathaSysPanel.js` | System settings panel overlay |
| `helpers/fathaPerfOverlay.js` | FPS/performance overlay |
| `helpers/fathaThemeRuntime.js` | Runtime theme application, including category-specific string palette defaults |
| `helpers/bastaLayoutMaps.js` | Layout maps for floating Basta panels |
| `helpers/debugPainter.js` | Layout debug visualization |
| `helpers/derpBackgroundParallax.js` | Parallax background effect |
| `helpers/headerPaletteIdentity.js` | Header palette identity resolution |
| `helpers/uncleSlotHelper.js` | Uncle node slot management |

### 6. Uncle Framework (`js/fatha/uncle.js`, 490 lines)
A "hybrid" framework combining Fatha's modern engine with legacy node compatibility. Used by nodes that need both Fatha rendering AND native LiteGraph slots visible. Key differences from full Fatha:
- Keeps real input/output slots for LiteGraph connections
- Uses `syncUncleSlots()` to manage slot visibility
- Has UNCLE_LINK_PAD (LEFT:15, RIGHT:15) for link-dot spacing
- Ghosts unselected nodes (`_xcpGhosted`)

## Key Patterns
- **Ghost Slots:** Heist caches inputs/outputs as `_xcpTrueInputs`/`_xcpTrueOutputs`, sets real arrays to `[]` during draw
- **Passive Whole Wall Cache:** OffscreenCanvas cache for TriggerWall/LoraStack panel backgrounds — avoids redraw when only cursor position changes
- **Force Sync:** `node._forceSync = true` triggers full layout recompute next frame
- **Layout Dirty:** `node._layoutDirty = true` triggers layout recompute
- **Awake Frames:** `node._derpAwakeFrames` countdown for post-interaction animation frames
- **Visual Press:** Recoil animation via `animateRecoil()` for press feedback

## Localized Default Titles
- Default derp node titles are synchronized by `syncDerpLocalizedDefaultTitle()` in `core/fathaHandler.js`.
- The registry tracks known default title translations from all available locale files so a workflow saved in one language can relocalize after switching languages or reloading ComfyUI.
- User-renamed titles are protected by `properties._derpCustomTitle`; title editors must set this flag when writing `properties.titleLabel`.
- Keep node default title keys in the top-level `derp_* .title` locale entries so the shared registry can distinguish them from dialog titles.

## System Panel Theme Weights
- The system panel header includes `dropdownThemeWeight` between `dropdownThemes` and the Warp controls.
- It lists theme files under `Themes/_System/` whose leaf filename starts with `_WT_`; when an external weight is selected, the first pinned item is `Revert to Theme's weight`. When the theme uses its own weights, the reset item is hidden and the trigger shows `Load theme weight`.
- Selecting a `_WT_` file stores a node-local theme weight overlay in `node._themeWeightOverlay` and recompiles that node's paint data from an effective theme. The overlay only applies `_layout`, `corners`, and text `font` / `fontSize` / `fontWeight`; effect settings are ignored. It does not mutate `window.xcpDerpThemeConfig.themes`, so other nodes using the same theme keep their original weights.
- `getDerpVars()` also checks `node._themeWeightOverlay._layout` so node-local weight files affect margins, spacing, offsets, and padding without writing those values back into the shared theme.
- Selecting `Revert to Theme's weight` clears `properties.selectedThemeWeight` and the node-local overlay. Saved workflows rehydrate `selectedThemeWeight` lazily during the node's theme update path.

## Stack Drag-and-Hold DnD
- Stack/list reordering uses `helpers/fathaDragDrop.js` with `startStackDrag()`, `updateStackDrag()`, and `endStackDrag()`.
- `startStackDrag()` is hold-first by default: pointer-down arms `_dragHoldTimer`, and pickup only becomes visual/structural after `_dragThresholdMet` is true.
- Row/list layout hashes should ignore `_dragTrig`, `_dropPreviewIdx`, and `_dragMouse` until `_dragThresholdMet` is true, otherwise a plain click can rebuild into a drag-looking state.
- Normal click actions inside draggable rows must call `endStackDrag(node, arrayKey)` before toggling, selecting, expanding, or removing items; this cancels the pending hold timer.
- `fathaHandler.js` stores `_dragEndRegionKey` separately from `_pressedRegionKey`, because pointer-up click activation clears `_pressedRegionKey` before `dockDrag.js` runs `onDragEnd`.
- Drag-capable row regions should implement `onDragEnd` and call `endStackDrag(node, arrayKey)` so release cleanup runs even when no click action fires.

## Docking / Resize Notes
- Dock behavior is split across `masterDockEngine.js`, `dockDrag.js`, `dockTargetPicking.js`, `dockDimensions.js`, `dockResize.js`, and `fathaNodeResize.js`. Check all of them before changing docking rules.
- Horizontal stacks support width resize only from outer stack boundaries. Internal shared seams should only expose width resize when both seam nodes are manual-width (`autoWidth === false`).
- Vertical stack seam height resize should not expose handles when either connected node is collapsed or auto-height.
- In Node 2.0/Vue mode, `fathaHandler.js` performs an aligned-edge guard before release-time dock maintenance. If a default ComfyUI group move leaves a docked Derp stack already edge-aligned, shared-height sync and normalization should not re-layout the stack on mouse release.
- Avoid adding per-node docking hacks. Prefer shared fixes in the dock engine/resizer/shield layers.

## Maintenance Notes
- Do not trust old line-count comments in framework docs. Verify referenced files directly before editing.
- When changing Fatha framework behavior, update this document if the change affects render hijack, DOM shield behavior, docking, resize, layout lifecycle, or Uncle compatibility.
