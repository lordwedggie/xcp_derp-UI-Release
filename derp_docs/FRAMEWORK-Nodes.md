# Controldeck — Node Implementations

## Overview
Controldeck contains the JS widget implementations for every derp node type. Each node registers via `fatha()` or `uncle()` and provides a `refreshNodeLayoutMap()` method that declaratively defines its UI via the layout map system.

**Directory:** `js/derps/`
**Core engines:** `js/derps/core/` (files suffixed `_core.js`)
**Last reviewed:** 2026-06-04

## Signal Out (Wireless Router) — Special
The signal router lives at the top level rather than in derps/:
| File | Role |
|------|------|
| `js/derpSignalOut.js` | Layout maps for signal router UI (515 lines) |
| `js/derpSignalOut_core.js` | Core logic: signal scanning, output management, remote bypass (1074 lines) |

### Signal Out Features
- Scans all nodes in graph for wireless signals
- Sort modes: Type, Name, ID (localized)
- Signal list with drag-to-reorder (`fathaDragDrop.js`)
- Ghost height pattern for drag (record original height, use for placeholder)
- Per-signal display options: show IDs, names, types
- Output slot management: creates virtual outputs for each received signal
- Remote bypass: other nodes can listen to a signal and bypass based on it
- `updateReceivedSignals()` — scan graph for transmitting nodes
- `manageDerpOutputs()` — create/remove virtual output slots
- `syncDerpRouterDisplayLabels()` — update display labels with localization
- `formatDerpRouterSignalLabel()` — format signal label `[id] name [TYPE]`

## Concatenate (String Utility) — Special
The string concatenate node lives at the top level rather than in `derps/`:
| File | Role |
|------|------|
| `js/derpConcatenate.js` | Fatha-compliant string signal display/concatenate UI |
| `python/derpConcatenate.py` | Backend utility node returning `text_a + text_b` |

Current UI pattern:
- Uses in-node `FILEBROWSER` with `mode: "signal"` for signal selection.
- Avoid replacing the primary signal selection flow with header-only wireless selector behavior.
- Includes loop guards when listing candidate upstream string signals.
- Signal row reordering uses `fathaDragDrop.js` hold-first DnD; all normal click actions inside a draggable row must call `endStackDrag(node, "signalDeck")` to cancel the pending hold timer before toggling/removing/selecting.
- Follow the stack drag-and-hold DnD rules in `FRAMEWORK-Fatha.md` for layout hash gating, click cancellation, and `onDragEnd` cleanup.

## Node Inventory

### Controldeck Widgets
| JS File | Core File | Node(s) |
|---------|-----------|---------|
| `derpSeedV2.js` | `core/derpSeedV2_core.js` | Seed control node |
| `derpSlider.js` | `core/derpSlider_core.js` | Generic slider node |
| `derpToggle.js` | — | Boolean toggle node |
| `derpTriggerWall.js` | `core/derpTriggerWall_core.js` | Trigger wall (grid of triggers) |
| `derpLoraStack.js` | `core/derpLoraStack_core.js` | LoRA stack manager |
| `derpPromptBook.js` | `core/derpPromptBook_core.js` | Prompt book/browser |
| `derpModelLoader.js` | `core/derpModelLoader_core.js` | Model loader |
| `derpDiffusionLoader.js` | `core/derpDiffusionLoader_core.js` | Diffusion model loader |
| `derpSamplerLoader.js` | `core/derpSamplerLoader_core.js` | Sampler selector |
| `derpSchedulerLoader.js` | `core/derpSchedulerLoader_core.js` | Scheduler selector |
| `derpVaeLoader.js` | `core/derpVaeLoader_core.js` | VAE loader |
| `derpImageDeck.js` | `core/derpImageDeck_core.js` | Image deck/gallery |
| `derpLatent.js` | — | Latent image node |
| `derpSwatch.js` | — | Palette swatch drag/drop utility for default ComfyUI nodes |

### Controldeck Helpers
| File | Role |
|------|------|
| `helpers/loraComponents.js` | Shared LoRA UI components |
| `helpers/loraImages.js` | LoRA preview image handling |
| `helpers/derpPromptBook_imageHandler.js` | Prompt book image management |

## Layout Map Pattern
Every node defines its UI through `refreshNodeLayoutMap()` which builds a declarative tree:

```js
this.layoutMap = {
    headerRegion: {
        type: UI_TYPES.REGION,
        themeKey: "header",
        // children via object keys become named regions
        titleLabel: { type: UI_TYPES.TEXT, text: this.titleLabel, ... },
        btnSettings: { type: UI_TYPES.ICONBUTTON, icon: "settings", ... },
    },
    contentRegion: {
        anchor: { target: "headerRegion", axis: "y", offset: oY },
        dir: "col",
        // ... widget regions
    },
    footerRegion: { ... },
};
```

### Layout Map Conventions
- `anchor: { target: "parentName", axis: "x"|"y", offset: N }` — positioning
- `dir: "row"|"col"` — flex direction
- `width: "full"|"auto"|N`, `height: "full"|"auto"|"match"|N`
- `margin: [top, right, bottom, left]`, `padding: [x, y]`
- `themeKey: "keyName"` or compound `"bodyKey, labelKey, fontSize"`
- `hidden: true` — skip rendering
- `text: "$locale.key"` — localized string
- Dynamic regions use computed keys like `outputsRegion_display_0`, `outputsRegion_display_1`
- New visible strings should use locale keys, not permanent hard-coded display strings.

## Layout Map Hash
Nodes compute a `_layoutMapHash` from their structural state to skip rebuilds when nothing changed:
```js
const structureHash = `${JSON.stringify(activeOuts)}_${showSignalIds}_...`;
if (this._layoutMapHash === structureHash && this.layoutMap) {
    this.requestDerpSync();
    return;
}
```

## TriggerWall Special Behavior
- Passive Whole Wall Cache — caches entire panel as OffscreenCanvas
- Cache key includes: size, layout hash, theme name, mode, collapsed, settings active, header visibility, hover/press region, device pixel ratio
- Cache invalidated on: dropdown open, file browser open, drag, modal open, force sync, layout dirty
- `_triggerWallCacheSuspendUntil` — temporary cache suspension timestamp

## LoraStack Special Behavior
- Also uses Passive Whole Wall Cache
- Cache key additionally includes: stack values, preview list, name display, CLIP visibility, attention mode, toggle LR
- Cache invalidated on: detail panel open, slider interaction, live control interaction
- `_passiveWholeWallCacheSuspendUntil` — 220ms suspension on slider/press
- Interaction bindings wrapped via `ensurePassiveCacheInteractionBindings()`
- `properties.stackData` entries use array slots `[path, modelStrength, clipStrength, triggerKey, triggerText, bypassed, fuseQKV, noTriggerRequired]`; slot `7` is persisted workflow UI metadata for LoRAs with no trigger file.

## New Node Checklist
- Start from `js/derpFathaTemplate.js` for new Fatha node templates.
- Keep node-specific UI in the node file and reusable logic in `core/*_core.js` only when it is genuinely reusable or large enough to justify the split.
- Update Python registration if the node needs a backend shell.
- Update locale JSON when adding user-visible text.
- Add or refresh `_layoutMapHash` guards for structural layout rebuilds.
- Check passive whole-wall cache keys if the node uses full-panel caching or changes visual state outside the normal layout map.

## Palette Swatch Utility
- `derpSwatch.js` is a Fatha utility node with a pure virtual backend shell (`DerpSwatchNode`).
- It uses an in-node `FILEBROWSER` to select palette files from `/xcp/list/palettes` and `/xcp/load/palettes`.
- Swatch rows are simple Fatha `REGION` controls with drag handlers; they intentionally do not rely on LiteGraph context menus or browser DOM drop events.
- On drag end, the pointer is converted to graph coordinates and hit-tested against `app.graph._nodes`; Fatha and Uncle nodes are skipped.
- Successful drops apply `entry.main._ON` to `node.color`, `entry.main._OFF` to `node.bgcolor`, and persist metadata in `node.properties._lastDerpPalette`.

## Maintenance Notes
- Update this document when adding/removing node files, changing node registration patterns, or introducing shared node implementation rules.
- Before changing a node interaction pattern, verify the corresponding Fatha/Herbina docs and current implementation files.
