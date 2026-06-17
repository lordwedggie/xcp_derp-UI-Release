# Theme & Palette — Resolution and Mechanics

## Overview

This document covers the practical mechanics of how themes and palettes interact — the resolution chain, the update flow, and the debugging checklist. For the theme system architecture (data structures, painting pipeline, key anatomy), see `FRAMEWORK-Motha.md`. For the palette editor UI, see `FRAMEWORK-Basta.md`.

**Last reviewed:** 2026-06-04

---

## The Two Systems, Summarized

| System | Lives in | Controls |
|--------|----------|----------|
| **Theme** | `window.xcpDerpThemeConfig` | Colors, fonts, shadows, strokes, glow, layout for every UI region |
| **Palette** | JSON files in `user/derpNodes/Palettes/_system/` | Named palette entries used by header palette matching, color-key text, the palette editor, and legacy direct `@key` lookup |

Themes are the *structure*. Palettes are the *paint buckets*. In current code, palette files are primarily consumed as full palette documents with a `palettes` array. Some painter paths still support direct top-level `@key` lookup for legacy theme values, but the active system palette files are not flattened automatically before being assigned to `window.xcpActivePalette`.

---

## Palette File Format

Palettes are JSON files with an optional `effects` boolean and a `palettes` array:

```json
{
    "effects": true,
    "palettes": [
        {
            "name": "header_DerpSeedV2",
            "entries": {
                "main": { "_ON": [100, 200, 255, 1], "_OFF": [30, 60, 90, 1] },
                "shadow": { "_ON": [0, 0, 0, 0.5], "_OFF": [0, 0, 0, 0.3] },
                "stroke": { "_ON": [255, 255, 255, 1], "_OFF": [200, 200, 200, 0.5] },
                "glow": { "_ON": [100, 200, 255, 0.5], "_OFF": [50, 100, 150, 0.3] }
            }
        },
        {
            "name": "button",
            "entries": {
                "main": { "_ON": [80, 180, 220, 1], "_OFF": [40, 60, 80, 1], "_DIS": [60, 60, 60, 0.5] }
            }
        }
    ]
}
```

**Key rules:**
- `effects: true` enables shadow/stroke/glow color replacement. When `false` (or omitted), only `main` fill colors are applied; effects keep their theme-defined colors.
- A theme's `_palette` is inherited by generic widget paint resolution. Explicit widget palette config still wins, but otherwise matching palette entries can override theme-key `main`, `shadow`, `stroke`, and `glow` colors while preserving theme geometry and effect physics.
- Each palette entry is keyed by `name`. The `name` determines which theme key it overrides (e.g., `header_DerpSeedV2` overrides the `header` theme key for nodes of type `DerpSeedV2`).
- Missing effect keys (`shadow`, `stroke`, `glow`) stay omitted when a palette loads. In the Palette Manager, enabling an effect toggle creates a default entry for that effect; disabling the toggle omits that effect on save.
- Storage location: `ComfyUI/user/derpNodes/Palettes/_system/` (system-managed) or subdirectories. The `_system/` prefix is stripped for display but preserved internally.

---

## Theme Key Reference

Every theme JSON object is a flat dictionary of named keys (e.g., `"canvas"`, `"button"`, `"t_textNormal"`). Each key defines its own fill colors, corners, shadows, strokes, glow, font, and font size. Widgets reference these keys via `themeKey` in their layout map definitions.

Keys fall into two categories: **container keys** (define backgrounds and effects for regions) and **text keys** (define font family, size, and text color). Most widgets use a **compound key** format: `"containerKey, textKey"` (optionally with a third font-size override).

### Container Keys (Required keys for a theme file)

These define the visual surface behind a widget — fill, corners, shadows, strokes, glow.

| Key | Used By |
|-----|---------|
| `canvas` | All Fatha/Uncle node bodies. The main node background. |
| `background` | ❌ Deprecated — removed from all code references (2026-06-04). Was used by `bastaLoraDetail.js` REGION widgets; now uses `region` key with diagnostic red `btnColor` fallback. Safe to delete from theme files. |
| `dialog` | Mainly used for text editing field, by the EDITOR widget. |
| `panel` | Mainly used for dropdown menus, by the FILEBROWSER widget. |
| `button` | Standard interactive buttons — file browser rows, action buttons, LoRA detail buttons. |
| `buttonNode` | Node header icon buttons — collapse, settings, signal, undock, pin, wireless. |
| `systemBackground` | System panels and settings overlays (theme manager internal regions, Fatha settings panel). |
| `systemButton` | System panel icon buttons — save, rename, copy, delete profile. |
| `region` | Generic `UI_TYPES.REGION` container widgets. Heavily used — 15+ references across loader nodes, LoraStack, TriggerWall, SignalOut, Concatenate. Default for `UI_TYPES.REGION` in `masterLayoutTypes.js`. |
| `header` | 🆕 Optional — detected at theme load time, not referenced via `themeKey` in layout maps. If present, used to render the node header section separately from the body. If absent, the `canvas` key renders the entire node background including the header area. |

### Text Keys

These define font family, font size, and text color (`_ON` / `_OFF` / `_DIS`). They have no corners, shadows, strokes, or glow — text rendering reads only `font`, `fontSize`, `fontWeight`, and `_ON`/`_OFF`/`_DIS` for color.

| Key | Default Size | Used By |
|-----|-------------|---------|
| `t_textBig` | 14px | Node title labels, primary headings |
| `t_textNormal` | 14px | File browser items, dropdown options, general labels, action buttons |
| `t_textSmall` | 10px | Secondary labels, file browser row metadata, helper text, Basta panel labels |
| `t_textSystem` | 12px | System panel labels, Fatha layout toolbar button text, warning/info messages |

### Optional Override Keys (`#` prefix)

Keys prefixed with `#` are optional overrides for specific widget rendering paths. The theme manager's save logic places them at the bottom of the theme key list. If a `#` key exists, the widget uses it instead of its layout map's `themeKey`. If absent, the widget falls back to its normal `themeKey` behavior.

| Key | Overrides |
|-----|-----------|
| `#picker` | FILEBROWSER picker panel/background rect color. When present, the open picker uses this key's `_OFF` fill instead of the widget's `themeKey`. |
| `#picker_highlight` | FILEBROWSER hovered picker row highlight rectangle. When present, the hover band resolves this key's default/`_OFF` fill first, with `_ON` as a legacy fallback. |
| `#picker_hightlight` | Legacy typo fallback for `#picker_highlight`. Accepted for old themes, but new themes should use the corrected `#picker_highlight` key. |
| `#slider_background` | SLIDER background track. When present, the slider track uses this key instead of the widget background key from `themeKey`. |
| `#slider_fillbar` | SLIDER filled value bar. When present, the filled bar uses this key instead of the normal slider fill fallback. |
| `#slider_knob` | SLIDER knob marker. When present, knob-style sliders use this key for rectangular or round knob rendering, including supported effects. |
| `#slider_btnLR` | SLIDER left/right step buttons. When present, `btnLR` buttons use this key instead of the slider's normal button/body fallback. |
| `_ICONBTN_<icon>` | ICONBUTTON background override from the theme-attached palette file. `<icon>` matches the `btnIcon.js` `ICON_MAP` key, such as `_ICONBTN_add` for `icon: "add"` or `_ICONBTN_wireless` for `icon: "wireless"`. |

These are full theme keys with `_ON`/`_OFF`/`_DIS` fills and optional effects (corners, shadow, stroke, glow). They are **not** referenced by layout maps directly — widgets detect them at paint time. Slider round knobs use a local circle painter so fill, shadow, stroke, and glow remain available even though the shape is not drawn by `masterPainter()`.

`_ICONBTN_<icon>` entries live in the palette document attached to the active theme via `_palette`, not in the layout map and not in the global active palette fallback. `btnIcon.js` checks the icon key from the `ICON_MAP` lookup and, when a matching entry is present in `node._headerPaletteName`, replaces only the icon button background rect paint (`main`, plus `shadow`/`stroke`/`glow` when the palette has `effects: true`). The override participates in normal hover, press, pulse, and effect color animation paths. The glyph color, font, geometry, recoil, and layout sizing continue to come from the widget's normal `themeKey` and icon color paths.

### Compound Key Format

When a widget needs both a background and text styling, the `themeKey` uses a comma-separated compound:

```
"containerKey, textKey"
```

The layout engine parses this via `parseThemeKey()` in `widgetsUtils.js`. The first segment controls the widget's background surface; the second controls text rendering. An optional third segment overrides `fontSize`.

**Common compounds seen across the codebase:**

| Compound | Where |
|----------|-------|
| `"button, t_textNormal"` | Standard action buttons, file browser rows |
| `"button, t_textSmall"` | Compact buttons, LoRA stack row labels |
| `"buttonNode, t_textSystem"` | Node header icon buttons |
| `"dialog, t_textNormal"` | File browser overlays, dropdown popups |
| `"dialog, t_textSmall"` | Compact dropdowns, Basta message bodies |
| `"dialog, t_textBig"` | Node title editor |
| `"dialog, t_textSystem"` | System dropdowns, profile loaders |
| `"systemButton, t_textSystem"` | System panel action buttons |
| `"canvas, t_textSmall"` | (rare) small text directly on canvas background |

### Minimal Required Key Set

A theme MUST define at minimum these keys or nothing will render properly:

| Key | Why it's required |
|-----|-------------------|
| `canvas` | Every node's body. Without it, nodes are invisible. |
| `button` | File browsers, dropdowns, action buttons everywhere. Without it, all interactive widgets have no background. |
| `dialog` | Text input fields (EDITOR widget). Without it, text editors have no background. |
| `panel` | FILEBROWSER widget dropdowns and floating elements. Without it, file browsers and floating panels have no background. |
| `t_textNormal` | Most text in the UI — file browser items, dropdowns, button labels. Without it, most text is invisible. |
| `t_textSmall` | Secondary labels everywhere. Without it, LoRA stack metadata, helper text, Basta labels are invisible. |
| `t_textBig` | Node titles. Without it, node title bars show no text. |
| `t_textSystem` | System panel text, header button icons (via `buttonNode, t_textSystem`). Without it, system UI text and header buttons are invisible. |
| `buttonNode` | Header collapse/settings/signal/undock buttons. Without it, header icon buttons have no background. |
| `header` | 🆕 Optional — separates header background from node body. If absent, `canvas` covers the whole node. |
| `systemBackground` | Fatha settings panel, theme manager internal regions. Without it, system panels have no background. |
| `systemButton` | System panel save/rename/copy/delete buttons. Without it, system action buttons have no background. |

**Practical minimum for a working theme:** `canvas`, `panel`, `dialog`, `button`, `buttonNode`, `systemBackground`, `systemButton`, `t_textBig`, `t_textNormal`, `t_textSmall`, `t_textSystem` — plus `region` for full coverage. `header` is optional (falls back to `canvas` if missing). `background` is deprecated and safe to delete.

> **TODO: Fill in** — expand with actual RGBA values, corner presets, and shadow/stroke/glow defaults for each key.

---

## The Palette Resolution Chain

When a Fatha/Uncle node renders, its colors go through a four-stage resolution:

### Stage 1: Theme Compilation (`masterPainter.js`)

`compileThemeData(themeMain, keyName, state)` takes a theme key (e.g., `header`) and resolves it to concrete RGBA/CSS-ready paint data:

```js
// Legacy direct-key path: if a theme value starts with '@', look it up directly
// on window.xcpActivePalette. This only works when that object exposes key arrays
// at the top level; normal palette files are stored as { effects, palettes }.
function resolvePaletteColor(val) {
    if (typeof val === 'string' && val.startsWith('@')) {
        const key = val.substring(1);
        if (window.xcpActivePalette && window.xcpActivePalette[key]) {
            return window.xcpActivePalette[key];
        }
    }
    return val;  // Falls back to raw value — this is the silent failure case
}
```

**Critical gotcha:** If `@key` references a key that does not exist directly on `window.xcpActivePalette`, `resolvePaletteColor()` returns the raw `@key` string. `compileThemeData()` guards fill colors through `ensureArray()`, but shadow/stroke/glow paths can still build invalid CSS if given unresolved strings. **No user-facing error is thrown.**

The compiled result is cached in a WeakMap keyed by `"OFF::paletteName"` / `"ON::paletteName"` / `"DIS::paletteName"`. Changing the active palette name automatically invalidates this cache.

### Stage 2: Per-Node Header Palette (`headerPaletteIdentity.js`)

After the global palette is applied, `applyNodeHeaderPalette()` can override individual nodes based on their `_headerPaletteName`:

```js
// For a node with _headerPaletteName = "_system/xcpDerp_v02.json":
// 1. Look up that palette file in window.xcpPaletteCache
// 2. Find the palette entry whose name matches the node type
//    (e.g., "header_DerpSeedV2" for a node of type DerpSeedV2)
// 3. Replace the paint data's fill/shadow/stroke/glow with the entry's values
```

This is how different node types can get different header colors from the same palette file — the `name` matching is based on `entity.type`, `entity.constructor.type`, `entity.comfyClass`, or `entity._sysProfileFile`.

**Header palette naming convention:** Entry names are `header_<NodeType>` (e.g., `header_DerpSeedV2`, `header_DerpLoraStack`). The `findHeaderPaletteEntry()` function also checks aliases — if the node type is `DerpSeedV2Node`, it also tries `header_derpSeedV2`.

**Collapsed header state:** The node header background is drawn by `fathaHandler.js`'s canvas base renderer, not by the layout-map `headerMain` region. Expanded headers use `_OFF` by default, selected headers use `_ON`, bypassed headers use `_DIS`, and collapsed headers also use `_ON`. If a node has an attached header palette, the palette entry's `main._ON` overrides the theme `header._ON`; otherwise the renderer falls back to the theme `header._ON`. Theme and palette authors should treat `header._ON` / `header_<NodeType>.entries.main._ON` as the collapsed-header color.

**Collapsed title text state:** The node title editor (`dialog, t_textBig`) also receives state `ON` while collapsed. If no string palette or color-key override resolves for the title text, the label paint falls back to the active theme's `t_textBig._ON`. Theme authors should set `t_textBig._ON` for collapsed node title text contrast.

### Stage 3: Theme Manager System Palette (`themeManagerV2.js` / `themeManagerV2_core.js`)

The theme manager node has a system palette dropdown that sets `themeToEdit._palette` and `node.properties.systemPaletteName`. This is stored on the edited theme and later copied into `window.xcpDerpThemeConfig.themes[name]._palette` when the binding path or save path runs:

```js
// Current binding path in themeManagerV2_core.js:
node.properties.systemPaletteName = paletteName;
if (paletteName) themeObj._palette = paletteName;
else delete themeObj._palette;
```

The `None` option sets the value to empty string `""`, which means "no palette override — use the global default."

### Stage 4: Global Default Palette

The global default is set via the ComfyUI setting `Derp.Palette`:

```js
// In fathaThemeRuntime.js (init):
const initialPalette = appInstance.ui.settings.getSettingValue("Derp.Palette") || "Derp_Default_v01";
loadDerpPalette(initialPalette);
```

This calls `loadDerpPalette()` which fetches the palette JSON and sets:
- `window.xcpActivePalette` — the active palette-file data, usually `{ effects, palettes: [...] }`
- `window.xcpActivePaletteName` — the palette file name
- `window.xcpPaletteCache[paletteName]` — the full raw palette data (for header palette resolution)

---

## The Full Resolution Order

For any given node, the effective color is determined by:

```
1. Theme key value (e.g., header._OFF = "@header_main")
       ↓
2. Legacy direct `@key` lookup checks top-level keys on `window.xcpActivePalette`
       ↓
3. Theme `_palette` sets `node._headerPaletteName` and loads/caches that palette file
       ↓
4. Per-node header palette override applies if `_headerPaletteName` matches a `header_*` entry
       ↓
5. Fallback: raw theme key value (if no @key, or palette not loaded)
```

**Practical rule:** The per-theme `_palette` is the source for `node._headerPaletteName`, so it controls per-node header palette matching. Framework text color-key strings use the per-node `node._derpStringPalette` context first. By default this loads `_system/_defaultTheme.json`; themes with `Category: "Dark"`, `"Light"`, or `"Neutral"` load `_system/_DK_defaultTheme.json`, `_system/_LT_defaultTheme.json`, or `_system/_NE_defaultTheme.json` respectively, falling back to `_system/_defaultTheme.json` if the category file is missing. Tooltip text/background paint uses the same host string palette context; legacy `_system/_toolTip` palette names are sanitized at runtime and must not be used by new tooltip code. The global `Derp.Palette` setting remains the fallback active palette document for legacy/color-key lookups. If nothing resolves, you get the raw theme color or a broken unresolved `@key` string.

Color-key markup is display-only. Framework text measurement paths strip `{{key::display}}` down to `display`, so color tags do not contribute to auto width, wrapped height, cutoff, overflow detection, or shrink calculations. Missing color-key entries leave the visible segment uncolored, so rendering uses the same layoutMap text theme key paint path it would have used without color-key markup. Color-key lookup must not use generic `resolvePaintData()` fallback behavior for missing keys; only exact palette entries or exact hydrated paint keys should colorize a segment. Segmented canvas text preserves the same theme text effects as normal text rendering, including shadow and glow passes. Palette string color keys control segment-level effect colors and effect enablement: if a palette key has `shadow` or `glow`, that segment uses the palette effect color with the current theme text key's offset/blur physics; if an effect key is missing, that effect is disabled for the segment. `textLabel` HTML rendering maps theme text shadow/glow onto CSS `text-shadow` because `applyHTMLTheme()` clears glyph shadows while applying box effects. Color-key strings are supported on all layout text theme keys, including `t_textNormal`, `t_textSmall`, `t_textBig`, and `t_textSystem`; wrapped canvas text must preserve per-line color segments instead of falling back to plain visible text. Prefer the `t_text_*` key pattern for string color entries, such as `{{t_text_accent::Accent}}`, `{{t_text_highlight::Highlight}}`, `{{t_text_warning::Warning}}`, and `{{t_text_error::Error}}`.

---

## Palette Update Flow (End to End)

### When the user opens the Palette Manager Basta (`bastaPalette.js`):

1. `showBastaPalette(host)` is called from a Fatha/Uncle node
2. `refreshPaletteFileList()` fetches `/xcp/list/palettes` for the file list
3. User selects a palette file → `fetch(/xcp/load/palettes?name=...)` loads it
4. Existing effect keys set their visibility toggles; missing effect keys stay omitted unless the user enables their toggle
5. User edits colors via `bastaColorDesigner.js` → writes directly to `basta._availablePalettes`
6. `markPaletteColorEdited()` fires -> `schedulePalettePreviewRedraw()` writes the edited palette into the in-memory palette caches, updates matching string-palette data, and redraws all Fatha/Uncle nodes so color-key text reparses live.
7. Dirty state is tracked by `_paletteDirty` plus a `getPaletteHash()` baseline (`_lastFileHash`). If the user closes Palette Manager from the header close button or footer Done button while dirty, the panel opens a `bastaFileHandler` discard confirmation before closing.
8. User clicks Save → `fetch(/xcp/save/palettes, {method: "POST", body: ...})` persists to disk

### When palette is saved (propagation):

1. `syncActivePalettePreview()` writes the edited palette document to `window.xcpPaletteCache[activeName]`
2. If the saved palette is the *currently active* palette, it mutates `window.xcpActivePalette.effects` and `window.xcpActivePalette.palettes`
3. `schedulePalettePreviewRedraw()` iterates ALL Fatha/Uncle nodes, finds those with matching `_headerPaletteName`, and invalidates their caches

### When the theme manager changes a theme's palette:

1. Dropdown change fires `dropdownPalette.onChange`
2. Sets `node.properties.systemPaletteName` and `themeToEdit._palette`
3. Syncs to `window.xcpDerpThemeConfig.themes[name]._palette`
4. Triggers `handleThemeUpdate()` → re-compiles all paint data → flushes all caches

### When `Derp.Palette` ComfyUI setting changes:

1. `loadDerpPalette(newPalette)` is called
2. Sets `window.xcpActivePalette` to the loaded palette document
3. Sets `window.xcpActivePaletteName`
4. `window.xcpPaletteCache` is NOT cleared — old palettes remain available for per-node header resolution
5. All Fatha/Uncle nodes call `applyPalette()` → `handleThemeUpdate()` → re-compiles paint data

---

## Key Variables and Their Meanings

| Variable | Scope | Meaning |
|----------|-------|---------|
| `window.xcpActivePalette` | Global | Active palette document, usually `{effects, palettes: [...]}`. Some legacy painter code also checks it for direct top-level `@key` arrays. |
| `window.xcpActivePaletteName` | Global | File name of the active palette (e.g., `"_system/Derp_Default_v01.json"`) |
| `window.xcpPaletteCache` | Global | `{fileName: {effects, palettes: [...]}}` — raw loaded palette documents. Used by `headerPaletteIdentity.js` for per-node matching. |
| `window.xcpDerpPaletteCache` | Global | `{fileName: [...]}` — palette entries array for non-derp nodes (populated by `paletteExtender.js`). Separate from `xcpPaletteCache`. |
| `node._headerPaletteName` | Per-node | The palette file name this node should use for header colors. Set during `handleThemeUpdate()` from `theme._palette`. |
| `node._derpStringPalette` | Per-node | The palette context used by multi color-key strings, defaulting to `{ path: "_system/_defaultTheme.json" }` or a category-specific default for `Dark`, `Light`, or `Neutral` themes. Future nodes can override this with their own palette file. |
| `node._derpStringPaletteData` | Per-node | Cached raw palette document used by `parseColorKeyText()` before falling back to the global active palette. |
| `node.properties.systemPaletteName` | Per-node (theme manager) | The system palette selected in the theme manager dropdown. |
| `theme._palette` | Per-theme | The palette file name this theme should use. Set via theme manager dropdown. Stored in `window.xcpDerpThemeConfig.themes[name]._palette`. |
| `basta._availablePalettes` | Per-Basta | The currently loaded palette entries being edited in the Palette Manager. |

---

## The `paletteExtender.js` (Non-Derp Nodes)

`paletteExtender` is retained in the workspace for reference, but its `app.registerExtension(...)` block is intentionally commented out and it no longer registers itself with ComfyUI. Default-node palette application is moving to explicit utility-node flows such as `derpSwatch` instead of a global context menu extender.

Historical behavior, when enabled:

- Pre-fetches all palettes into `window.xcpDerpPaletteCache` at startup
- Applies palette colors to `node.color` and `node.bgcolor` (LiteGraph's native properties)
- Stores the selection in `node.properties._lastDerpPalette`
- **Intentionally skips Fatha/Uncle nodes** — those get palette colors through the theme resolution chain, not through this extender

---

## Node 2.0 Changeable Elements (Default ComfyUI Nodes)

Node 2.0/Vue-rendered default nodes expose more colorable surfaces than legacy LiteGraph nodes, but they do not all use the same mechanism. Header and body colors remain per-node LiteGraph properties, while most additional Node 2.0 surfaces are design-system CSS tokens.

### Per-node LiteGraph Properties

These can be changed per default node and are the safest fit for palette swatch application:

| Element | Control | Notes |
|---------|---------|-------|
| Header shell / title bar background | `node.color` | Used by default-node palette application paths such as `paletteExtender.js`. |
| Body background | `node.bgcolor` | Also maps into the Node 2.0 body background surface. |

### Node 2.0 CSS Token Surfaces

These are changeable through CSS variable overrides. Treat them as theme/global Node 2.0 controls unless a scoped per-node DOM strategy is deliberately implemented later.

| Element | CSS token | Observed impact |
|---------|-----------|-----------------|
| Node border | `--node-component-border` | Normal Node 2.0 node border. |
| Selected / focus outline | `--node-component-outline` | Selection, focus, and state outline styling. |
| Executing outline | `--node-stroke-executing` | Node execution/running outline color. |
| Header text | `--node-component-header` | Node title text color. |
| Header icon | `--node-component-header-icon` | Header icon color. |
| Slot text | `--node-component-slot-text` | Input/output slot label text color. |
| Widget background | `--component-node-widget-background` | Default widget background. |
| Widget hovered background | `--component-node-widget-background-hovered` | Widget hover state background. |
| Widget selected background | `--component-node-widget-background-selected` | Widget selected state background. |
| Widget disabled background | `--component-node-widget-background-disabled` | Disabled widget background. |
| Widget highlighted background | `--component-node-widget-background-highlighted` | Highlighted widget background. |
| Promoted widget marker/background | `--component-node-widget-promoted` | Promoted widget visual marker/background. |
| Advanced widget marker/background | `--component-node-widget-advanced` | Advanced widget visual marker/background. |

### Implementation Guidance

Do not assume all Node 2.0 colors belong in one palette entry. The cleaner split is:

| Layer | Intended scope | Recommended use |
|-------|----------------|-----------------|
| Swatch entry layer | Per default node | Apply `main._ON` / `main._OFF` to `node.color` / `node.bgcolor`. |
| Node 2.0 token layer | Theme/global, or explicitly scoped DOM override | Control borders, outlines, header text/icons, slot text, widget backgrounds, and node state colors. |

Slot-type colors are still separate from these Node 2.0 component tokens and should continue to be treated as Comfy palette `node_slot` colors unless Derp intentionally adds its own mapping layer.

---

## Bundle Sync (`bundled_asset_sync.py`)

Default palettes are shipped with the extension in `user/derpNodes/Palettes/_system/`. At startup:

1. `sync_bundled_assets()` copies from extension root to ComfyUI's user directory
2. System-managed paths (containing `_` prefix in directory names, or `_*.json` files) are treated specially
3. Conflicts prompt the user in interactive mode; non-interactive mode uses file timestamps
4. State tracked in `.xcp_sync_state.json` for differential sync

---

## Common Failure Modes

### "I changed a palette but nothing happened"
1. Is `window.xcpActivePaletteName` pointing at the right file?
2. Did the theme key actually use `@key` syntax? (Check the theme JSON — if the value is a raw `[r,g,b,a]` array, it won't use the palette at all.)
3. Is the `_palette` key on the theme pointing to the right palette file?
4. Did `loadDerpPalette()` actually complete? (Check network tab — if the palette file 404'd, `@key` references silently fail.)

### "The header color is wrong on one node type"
1. Check `headerPaletteIdentity.js` — does the node type match a `header_*` entry name in the palette?
2. Check the aliases in `buildHeaderPaletteAliases()` — the entry name might need to be `header_derpLoraStack` not `header_DerpLoraStack`.
3. Is `_headerPaletteName` set on the node? (It's set during `handleThemeUpdate()` from `theme._palette`.)

### "The theme manager's palette dropdown shows 'None' but the node still has palette colors"
- The `None` value clears the per-theme `_palette` override. The node will fall through to the global `Derp.Palette` setting. If that's also set, the node will still get palette colors.

### "Colors are broken/garbled after palette change"
- The `compileThemeData` cache is keyed by `state::paletteName` per theme object. If the palette name did not change but the same theme object remains cached, stale compiled paint data can be served. Force-invalidate by calling `invalidateCompiledThemeCache(themeKeyObject)` or by triggering a normal theme update path that invalidates each theme key.
- Direct `@key` references that fail silently return the raw string `"@key"` instead of an RGBA array. Fill colors fall back more safely than effect colors; unresolved shadow/stroke/glow values can still produce invalid CSS.

---

## Files Reference

| File | Role |
|------|------|
| `js/herbina/widgets/widget_Slider.js` | Slider renderer — detects `#slider_background`, `#slider_fillbar`, `#slider_knob`, and `#slider_btnLR` optional keys. Respects `fillbarHeight`, `knobWidthScale`, `knobHeightOffset`, `roundKnob`, and `knobRadiusOffset` per-slider geometry. |
| `js/herbina/masterPainter.js` | `resolvePaletteColor()`, `compileThemeData()` — where `@key` references are resolved |
| `js/fatha/helpers/headerPaletteIdentity.js` | Per-node header palette matching and color application |
| `js/fatha/helpers/fathaThemeRuntime.js` | `handleThemeUpdate()` — compiles theme paint data, sets `_headerPaletteName`, calls `loadDerpPalette()` |
| `js/fatha/fatha.js` | `applyPalette()` — re-applies theme + palette to a node |
| `js/fatha/bastas/bastaPalette.js` | Palette Manager UI — load, edit, save, preview palettes |
| `js/fatha/bastas/bastaColorDesigner.js` | Color picker for editing individual palette entries |
| `js/herbina/extenders/paletteExtender.js` | Context menu palette application for non-derp nodes |
| `js/motha/themeManagerV2_core.js` | System palette dropdown logic (`systemPaletteName`, `_palette`) |
| `js/motha/themeManagerV2.js` | Theme manager node — palette list loading, layout hash |
| `js/motha/helpers/themeManager_paletteUtils.js` | `normalizePaletteName()`, `getSystemPaletteDisplayName()` |
| `js/motha/helpers/themeManager_themeHandler.js` | Theme selection handler — restores `systemPaletteName` on theme switch |
| `js/motha/core/themeConfig.js` | Theme config load/save — includes palette data in persistence |
| `js/fatha/helpers/fathaThemeRuntime.js` | Global init — reads `Derp.Palette` setting, calls `loadDerpPalette()` |
| `bundled_asset_sync.py` | Default palette sync from extension to user directory |
| `user/derpNodes/Palettes/_system/` | Palette file storage (system-managed) |

---

## Maintenance Notes

- When adding a new node type that needs distinct header colors, add a `header_<NodeType>` entry to the palette file AND verify the aliases in `buildHeaderPaletteAliases()` match.
- When changing how `@key` references work, update `resolvePaletteColor()` in `masterPainter.js`, color-key text resolution in `widgetsUtils.js`, and this document.
- When changing the palette file format, update `bastaPalette.js` hydration logic AND the palette files in `user/derpNodes/Palettes/_system/`.
- The `Derp.Palette` ComfyUI setting must be registered in the extension setup — if it's missing, `loadDerpPalette()` will never be called on startup.
- `window.xcpDerpPaletteCache` and `window.xcpPaletteCache` are two different caches. Do not merge them — they serve different consumers (non-derp context menu vs. derp node rendering).
