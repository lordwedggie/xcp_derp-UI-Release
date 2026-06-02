# Controldeck — Node Implementations

## Overview
Controldeck contains the JS widget implementations for every derp node type. Each node registers via `fatha()` or `uncle()` and provides a `refreshNodeLayoutMap()` method that declaratively defines its UI via the layout map system.

**Directory:** `js/controldeck/`
**Core engines:** `js/controldeck/core/` (files suffixed `_core.js`)

## Signal Out (Wireless Router) — Special
The signal router lives at the top level rather than in controldeck/:
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
