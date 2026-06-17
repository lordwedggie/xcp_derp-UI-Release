# derpNodes — Node Implementations

## Overview
derpNodes contains the JS widget implementations for every derp node type, organized into category subfolders under `js/derps/`. Each node registers via `fatha()` or `uncle()` and provides a `refreshNodeLayoutMap()` method that declaratively defines its UI via the layout map system.

**Directory:** `js/derps/` (loaders/ | controldeck/ | utils/)
**Core engines:** `_core.js` files live in `core/` within each category subfolder
**Last reviewed:** 2026-06-10

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

## Concatenate (String Utility)
The string concatenate node lives in `js/derps/utils/`:
| File | Role |
|------|------|
| `js/derps/utils/derpConcatenate.js` | Fatha-compliant string signal display/concatenate UI |
| `python/derpConcatenate.py` | Backend utility node returning `text_a + text_b` |

Current UI pattern:
- Uses in-node `FILEBROWSER` with `mode: "signal"` for signal selection.
- Avoid replacing the primary signal selection flow with header-only wireless selector behavior.
- Includes loop guards when listing candidate upstream string signals.
- Signal row reordering uses `fathaDragDrop.js` hold-first DnD; all normal click actions inside a draggable row must call `endStackDrag(node, "signalDeck")` to cancel the pending hold timer before toggling/removing/selecting.
- Follow the stack drag-and-hold DnD rules in `FRAMEWORK-Fatha.md` for layout hash gating, click cancellation, and `onDragEnd` cleanup.

## Node Inventory

### Loaders (`loaders/`)
| JS File | Core File | Node(s) |
|---------|-----------|---------|
| `derpClipLoader.js` | `core/derpClipLoader_core.js` | CLIP model loader |
| `derpDiffusionLoader.js` | `core/derpDiffusionLoader_core.js` | Diffusion model loader |
| `derpModelLoader.js` | `core/derpModelLoader_core.js` | Combined model/CLIP/VAE loader |
| `derpSamplerLoader.js` | `core/derpSamplerLoader_core.js` | Sampler selector |
| `derpSchedulerLoader.js` | `core/derpSchedulerLoader_core.js` | Scheduler selector |
| `derpVaeLoader.js` | `core/derpVaeLoader_core.js` | VAE loader |

### ControlDeck Widgets (`controldeck/`)
| JS File | Core File | Node(s) |
|---------|-----------|---------|
| `derpImageDeck.js` | `core/derpImageDeck_core.js` | Image deck/gallery |
| `derpLatent.js` | — | Latent image node |
| `derpLoraStack.js` | `core/derpLoraStack_core.js` | LoRA stack manager |
| `derpPromptBook.js` | `core/derpPromptBook_core.js` | Prompt book/browser |
| `derpSeedV2.js` | `core/derpSeedV2_core.js` | Seed control node |
| `derpSlider.js` | `core/derpSlider_core.js` | Generic slider node |
| `derpSwatch.js` | — | Palette swatch drag/drop utility |
| `derpToggle.js` | — | Boolean toggle node |
| `derpTriggerWall.js` | `core/derpTriggerWall_core.js` | Trigger wall (grid of triggers) |

### ControlDeck Helpers (`controldeck/helpers/`)
| File | Role |
|------|------|
| `loraComponents.js` | Shared LoRA UI components |
| `loraImages.js` | LoRA preview image handling |
| `derpPromptBook_imageHandler.js` | Prompt book image management |

### Utilities (`utils/`)
| JS File | Core File | Node(s) |
|---------|-----------|---------|
| `derpConcatenate.js` | — | String concatenate/signal display |
| `derpNotes.js` | — | Markdown notes viewer |
| `derpSkunk.js` | — | Skunkworks prototyping/test node |


## Notes Utility

`derpNotes` lives in `js/derps/utils/derpNotes.js` with a pure virtual backend shell in `python/derpUtilities.py`.

Current behavior:
- Uses an in-node `FILEBROWSER` to list Markdown files from `/xcp/list_markdown`.
- Loads selected files through `/xcp/load_markdown`.
- Displays content through `UI_TYPES.MARKDOWN_HTML`, including sanitized Markdown HTML, Obsidian-style media embeds, Markdown image embeds, and safe raw `<video>` tags.
- Local video embeds play through native browser controls using `/xcp/markdown_media` as the direct media source.
- Markdown/media roots are restricted by backend routes; this node is not a general filesystem browser.

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
- Passive whole-wall caching is gated by `Derp.TriggerWallWholeWallCacheGate` in masterSettings (`None`, `10`, `15`, `20`, `30`, `Always`; default `10`). It activates when the visible individual trigger count in the runtime deck data (`_triggerGroupData`, with `properties.triggerGroups` fallback) is at least the numeric threshold; `Always` enables it whenever normal cache safety gates allow it; `None` disables it.
- Cache key includes: size, layout hash, theme name, mode, collapsed, settings active, header visibility, hover/press region, device pixel ratio
- Cache invalidated on: dropdown open, file browser open, drag, modal open, force sync, layout dirty
- `_triggerWallCacheSuspendUntil` — temporary cache suspension timestamp

## LoraStack Special Behavior
- Also uses Passive Whole Wall Cache
- Passive whole-wall caching is gated by `Derp.LoraStackWholeWallCacheGate` in masterSettings (`None`, `3`, `5`, `8`, `Always`; default `3`). It activates only when `properties.stackData.length` is greater than the numeric threshold; `Always` enables it whenever normal cache safety gates allow it; `None` disables it.
- Cache backing scale is zoom-aware but capped/quantized in Fatha; cache reuse draws only the visible local slice to avoid high-zoom FPS drops.
- Cache key additionally includes: stack values, preview list, name display, CLIP visibility, attention mode, toggle LR, passive cache scale
- Cache invalidated on: detail panel open, slider interaction, live control interaction
- `_passiveWholeWallCacheSuspendUntil` — 220ms suspension on slider/press
- Interaction bindings wrapped via `ensurePassiveCacheInteractionBindings()`
- `properties.stackData` entries use array slots `[path, modelStrength, clipStrength, triggerKey, triggerText, bypassed, fuseQKV, noTriggerRequired]`; slot `7` is persisted workflow UI metadata for LoRAs with no trigger file.

## New Node Checklist
- Start from the appropriate category folder under `js/derps/` for new Fatha node templates.
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
