# Basta — Floating Panel System

## Overview
Basta ("Bastard" Child Framework) is a multi-instance, canvas-native replacement for the old Singleton Engine. It inherits Fatha's layout/rendering DNA but lives in the global overlay layer — floating panels that sit above the node graph.

**Entry point:** `js/fatha/basta.js` (1083 lines)
**Panels:** `js/fatha/bastas/`
**Last reviewed:** 2026-06-04

## Architecture

### Core Basta Class (`basta.js`)
- Creates floating overlay panels with their own DOM shield, layout engine, and draw lifecycle
- Each Basta has `hostNode` — the node that spawned it
- Registered globally in `window.xcpActiveBastas` (Map)
- Uses same `masterLayoutEngine`, `COMPONENT_BLUEPRINTS`, `handleShieldInteraction`, `handleDrawCTX`
- Fade animation: `animateAlpha()` with `BASTA_FADE_SPEED = 0.4`
- Clip chain: `getRegionClipChain()` for nested clipping regions
- Tooltip animation: `drawAnimatedTooltipLabel()` for expanding labels

### Basta Lifecycle
1. Created via `showBasta*()` functions in panel modules
2. Builds layout map via `getBastaBaseMap()` + panel-specific regions
3. Renders each frame through `drawBastaLayer()` called from Fatha's `onDrawForeground`
4. Drawn in screen space (not canvas space) — positioned relative to host node
5. Can be sticky (follows host) or fixed position

### Panel Inventory
| File | Role |
|------|------|
| `bastas/bastaPalette.js` | Palette browser/selector |
| `bastas/bastaLoraDetail.js` | LoRA detail/info panel |
| `bastas/bastaFileHandler.js` | File operations panel |
| `bastas/bastaColorDesigner.js` | Color picker/designer |
| `bastas/bastaSignalReceiver.js` | Signal receiver config |
| `bastas/bastaSearchTab.js` | Search tab |
| `bastas/bastaSystemMessage.js` | System message/notification |
| `bastas/bastaTemplate.js` | Template browser |
| `bastas/bastaToggle.js` | Toggle config panel |
| `bastas/bastaTriggerWall.js` | Trigger wall config |
| `bastas/bastaMessage.js` | Message panel |
| `bastas/core/bastaLoraDetail_core.js` | LoRA detail panel implementation helpers/state logic. |

## Key Patterns

### Basta Show/Hide
```js
import { showBastaFileHandler } from "./fatha/bastas/bastaFileHandler.js";
showBastaFileHandler(hostNode, options);
```

### Global Registry
```js
window.xcpActiveBastas = new Map();
window.xcpActiveBastas.get(bastaId);  // { hostNode, properties, layout, ... }
```

### Sticky Drag Sync
When global `stickyDrag` setting changes, all active Bastas get updated:
```js
window.xcpActiveBastas.forEach(basta => {
    basta.properties.stickyDrag = value;
});
```

### Screen-Space Rendering
Bastas render in global overlay coordinates, not canvas space. The `ensureScreenRectVisible()` helper in `fathaWarp.js` keeps panels within viewport bounds.

### Clip Chain
Nested `imageHTML` regions can have `clipChildren: true`. The clip chain walks parent regions to accumulate clip paths for proper masking.

## LoRA Detail Panel (Special)
- ID: `basta_lora_detail_global_unique_id` (BLD_ID constant)
- Only one instance visible at a time
- Host node check: `isDetailOpen` flag in Passive Whole Wall Cache logic
- Affects LoraStack cache invalidation when open

## Interaction
- `handleShieldInteraction` routes mouse events from the DOM shield
- Bastas support the same interaction types as Fatha nodes (press, hover, drag, etc.)
- `isHostActive(nodeId)` checks if any Basta is hosted by a given node

## Maintenance Notes
- Avoid creating one-off overlay systems when a Basta panel can use existing layout maps and shield routing.
- If a Basta affects node visuals, check passive whole-wall cache invalidation in `fatha.js` and the owning node.
- Update this document when adding/removing panels or changing global Basta lifecycle/registry behavior.
