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
- Tooltip animation: `drawAnimatedTooltipLabel()` for expanding labels; tooltip base paint now comes from the system theme `_System/_DK_System` keys `tooltip_background` and `t_tooltip_Text`, while tooltip color overrides still resolve through the host node's category-aware string palette entries `toolTip_background` and `t_toolTip_normal`.

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

## Background Key Resolution

Basta body backgrounds are painted by `fathaHandler.js` using `entity.properties.bastaBackgroundKey`.

### Standard resolution
If `bastaBackgroundKey` is a normal theme key (e.g. `"canvas"`, `"systemBackground"`), the background resolves through the standard `resolvePaintData` cascade: `_OFF` for normal state, `_ON` for selected/hovered, `_DIS` for bypassed.

### Optional `#` keys
If `bastaBackgroundKey` starts with `#` (e.g. `"#picker"`), the key is treated as **optional** — the theme is not required to define it. Resolution uses `_DIS` state for both OFF and ON suffixes (bypassed state is unchanged). When the optional key is absent from the theme, `resolvePaintData` returns `null` and the engine falls back to the `canvas` key.

```js
// fathaHandler.js
const isOptionalBgKey = backgroundPaintKey.startsWith("#");
const bgOffSuffix = isBypassed ? "_DIS" : (isOptionalBgKey ? "_DIS" : "");
const bgOnSuffix  = isBypassed ? "_DIS" : (isOptionalBgKey ? "_DIS" : "_ON");
```

| `bastaBackgroundKey` | Theme has key | Theme lacks key |
|------|---------------|-----------------|
| `"#picker"` | Renders with `_DIS` colors | Falls back to `canvas` |
| `"canvas"` | Renders normally (`_OFF`/`_ON`) | (canvas is always present) |

## Maintenance Notes
- Avoid creating one-off overlay systems when a Basta panel can use existing layout maps and shield routing.
- `bastaFileHandler` save/rename flows can accept a `filePicker` property to render an optional file-mode `FILEBROWSER` above the name editor. Selecting a file updates `pendingName`, allowing callers such as Theme Weight save to overwrite an existing managed file without custom dialog code.
- `bastaFileHandler` folder flows can pass `folderDisplayText` plus `folderPlaceholderWhenRoot: true` to show a placeholder label while the picker is still at its root path. This is useful for callers like ImageDeck that want an explicit "choose a folder" prompt before a custom subfolder is selected.
- If a Basta affects node visuals, check passive whole-wall cache invalidation in `fatha.js` and the owning node.
- Update this document when adding/removing panels or changing global Basta lifecycle/registry behavior.
