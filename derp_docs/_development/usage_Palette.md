# <span style="color: #ff8080">Palette</span> <span style="color: #ffffff">Usage Report</span>

This report maps which palette files the Derp framework actually uses today, which runtime paths consume them, and which file names still matter for authoring.

<span style="color: #ffc680"><strong>Note:</strong></span> The first section is the priority section. It lists the concrete palette files that are actively consumed by current framework paths. Broad inventory, legacy files, and deeper implementation notes come after that.

### <span style="color: #80ffc0">Currently Used By Framework</span>

<span style="color: #80aaff"><strong>Global active palette documents</strong></span>: These are the normal top-level palette files selected by the `Derp.Palette` setting and loaded into `window.xcpActivePalette`.

- `user/derpNodes/Palettes/Derp_Default_v01.json`
- `user/derpNodes/Palettes/ComfyUI_Default.json`
- `user/derpNodes/Palettes/ComfyUI_Default_Full.json`

<span style="color: #80aaff"><strong>Category-aware string palettes</strong></span>: These are the live semantic text and tooltip palettes selected by theme `Category` and attached through the string-palette runtime.

- `user/derpNodes/Palettes/_system/_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_DK_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_LT_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_NE_defaultTheme.json`

<span style="color: #80aaff"><strong>Theme-attached node palettes</strong></span>: These `_system/` files are the current header, canvas, and icon-button override documents used when a theme writes a file name into `theme._palette` and the runtime stores it on `node._headerPaletteName`.

- `user/derpNodes/Palettes/_system/DK_Full_v01.json`
- `user/derpNodes/Palettes/_system/NE_Full_v01.json`
- `user/derpNodes/Palettes/_system/LT_Header_v01.json`
- `user/derpNodes/Palettes/_system/Header_Neutral_v01.json`
- `user/derpNodes/Palettes/_system/Header_Dark_a50_v01.json`
- `user/derpNodes/Palettes/_system/Header_LT-A50_v01.json`

<span style="color: #80aaff"><strong>Business-specific live palettes</strong></span>: These are directly consumed by current node or Basta code paths rather than only appearing in the general palette picker.

- `user/derpNodes/Palettes/_system/PAL_ratings.json`
- `user/derpNodes/Palettes/_system/NODE_loraDetail_default.json`

<span style="color: #80aaff"><strong>Current hard-coded mismatch to watch</strong></span>: `js/fatha/bastas/bastaLoraDetail.js` still hard-codes `_system/PALETTE_ratings_default.json` for one ratings path, while the repo's active ratings palette file is `_system/PAL_ratings.json`.

### <span style="color: #80ffc0">Scope</span>

- which palette files exist
- which runtime paths consume them
- which files load, cache, resolve, preview, and save them
- what naming rules and fallback rules matter

This document focuses on palette usage. Theme structure is covered elsewhere, but key theme-to-palette connections are included here because palette resolution depends on them.

### <span style="color: #80ffc0">Core Model</span>

Palette is the color-override layer that sits on top of theme.

Theme provides:

- structure
- key names
- layout rhythm
- corners
- effect geometry and physics
- typography

Palette provides:

- named color buckets
- per-entry `main` colors
- optional per-entry `shadow`, `stroke`, and `glow` colors
- semantic string-color entries such as `t_text_error`
- per-node header and canvas overrides
- icon-button override entries such as `_ICONBTN_save`

In current code, palette files are usually stored and consumed as full palette documents:

```json
{
    "effects": true,
    "palettes": [
        {
            "id": 1,
            "name": "SomeEntry",
            "entries": {
                "main": { "_ON": [0, 0, 0, 1], "_OFF": [0, 0, 0, 1], "_DIS": [0, 0, 0, 0.5] },
                "stroke": { "_ON": [0, 0, 0, 1] },
                "glow": { "_ON": [0, 0, 0, 0.5] }
            }
        }
    ]
}
```

### <span style="color: #80ffc0">Runtime Entry Points</span>

### Global palette runtime

Primary file:

- `js/fatha/helpers/fathaThemeRuntime.js`

Main responsibilities:

- load the active global palette file
- cache raw palette documents
- attach string-color palette context to nodes
- attach per-theme palette file names to nodes
- trigger theme refresh when palette context changes

Important globals:

- `window.xcpActivePalette`
- `window.xcpActivePaletteName`
- `window.xcpPaletteCache`
- `window.xcpStringPaletteCache`

Important per-node fields:

- `node._headerPaletteName`
- `node._derpStringPalette`
- `node._derpStringPaletteData`

Key rules:

- Global setting `Derp.Palette` selects the active global palette document.
- Theme `_palette` attaches a palette file to a theme and later to a node.
- String-color palettes are chosen by theme `Category`.
- Retired tooltip palette names are sanitized away from `_system/_toolTip`.

### Header and canvas attached palette matching

Primary file:

- `js/fatha/helpers/headerPaletteIdentity.js`

Main responsibilities:

- find matching palette entries for node headers
- find matching palette entries for node canvas/body
- apply palette color replacement to compiled theme paint data

Key rules:

- Attached palette matching uses the palette file named by `node._headerPaletteName`.
- Header entry naming is suffix-based: `<NodeType>_header`.
- Canvas entry naming is suffix-based: `<NodeType>_canvas`.
- Matching candidates come from node type variants such as `entity.type`, `entity.constructor.type`, `entity.comfyClass`, and optional profile names.
- `effects: true` is required for palette `shadow`, `stroke`, and `glow` to replace theme effect colors. Otherwise only `main` is replaced.

### Draw-time application

Primary file:

- `js/fatha/core/fathaHandler.js`

Main responsibilities:

- apply canvas palette overrides during node body draw
- apply header palette overrides during node header draw
- choose tooltip palette context

Key rules:

- Collapsed headers use `_ON`.
- Selected headers also use `_ON`.
- Bypassed headers use `_DIS`.
- Tooltip palette context prefers explicit palette context, then host string-palette context.

### Legacy direct `@key` palette lookup

Primary file:

- `js/herbina/masterPainter.js`

Main responsibilities:

- resolve theme values that start with `@`
- compile theme data into concrete paint data

Key rules:

- This path only checks top-level keys on `window.xcpActivePalette`.
- Current palette files are usually `{ effects, palettes: [...] }` documents and are not automatically flattened.
- This means `@key` is now a legacy path and can fail silently if the key does not exist at the top level.

### Widget and text-color palette resolution

Primary file:

- `js/herbina/utils/widgetsUtils.js`

Main responsibilities:

- resolve explicit palette entries for widgets
- parse and resolve string color-key text such as `{{t_text_accent::Accent}}`
- merge palette paint over compiled theme paint
- resolve attached palette paint for icon-button overrides

Key rules:

- String color-key resolution checks node-local string palette data first.
- It then loads from the node string-palette path if needed.
- It then falls back to the global active palette.
- It finally falls back to exact hydrated theme paint keys if available.
- Missing color keys leave the visible text uncolored and keep normal theme text behavior.

### Icon button attached palette overrides

Primary file:

- `js/herbina/widgets/btnIcon.js`

Main responsibilities:

- resolve `_ICONBTN_<icon>` attached palette entries
- apply palette replacement to icon-button background paint only

Key rules:

- The glyph color still comes from normal theme or icon-color paths.
- Only the icon button background and optional effects are overridden.
- Example entry names: `_ICONBTN_add`, `_ICONBTN_save`, `_ICONBTN_wireless`.

### Layout helper palette use

Primary file:

- `js/fatha/helpers/fathaLayoutMaps.js`

Main responsibility:

- fetch a matching header fill from the active global palette for header inset UI paths

Key rule:

- This helper uses the active global palette document, not the attached node palette file.

### <span style="color: #80ffc0">Palette Resolution Modes</span>

There are five practical palette usage modes in this repo.

### 1. Global active palette

Selected by:

- ComfyUI setting `Derp.Palette`

Stored in:

- `window.xcpActivePalette`
- `window.xcpActivePaletteName`

Used for:

- legacy direct `@key` lookup
- string color-key fallback
- some layout helper and preview paths

### 2. Theme-attached palette

Selected by:

- `theme._palette`

Stored on nodes as:

- `node._headerPaletteName`

Used for:

- `<NodeType>_header`
- `<NodeType>_canvas`
- `_ICONBTN_<icon>`

### 3. String-color palette

Selected by:

- theme `Category`
- optional node-specific string palette path

Typical files:

- `_system/_defaultTheme.json`
- `_system/_DK_defaultTheme.json`
- `_system/_LT_defaultTheme.json`
- `_system/_NE_defaultTheme.json`

Used for:

- `{{t_text_error::...}}`
- `{{t_text_warning::...}}`
- `{{t_text_accent::...}}`
- `{{t_text_highlight::...}}`
- tooltip text/background color contexts

### 4. Explicit widget palette config

Selected by:

- widget config such as `palette: { path, entry }`

Used for:

- region widgets
- slider fill or specialty widget paint paths

### 5. Default-node / non-derp swatch use

Primary files:

- `js/derps/controldeck/derpSwatch.js`
- legacy `js/herbina/extenders/paletteExtender.js`

Used for:

- plain LiteGraph / default ComfyUI node `color` and `bgcolor`

Key rule:

- Fatha/Uncle nodes are intentionally excluded from this legacy-style swatch application path.

### <span style="color: #80ffc0">File Inventory By Purpose</span>

### System palette files in `_system/`

Category default string palettes:

- `user/derpNodes/Palettes/_system/_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_DK_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_LT_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_NE_defaultTheme.json`

Purpose:

- semantic text colors
- tooltip text/background colors
- category-aware string color fallback

Rules:

- `Dark` themes prefer `_DK_defaultTheme.json`
- `Light` themes prefer `_LT_defaultTheme.json`
- `Neutral` themes prefer `_NE_defaultTheme.json`
- unknown or missing category files fall back to `_defaultTheme.json`

Legacy retired tooltip palette:

- `user/derpNodes/Palettes/_system/_toolTip.json`

Purpose:

- historical tooltip palette file only

Rule:

- new code should not depend on this file; runtime sanitizes old `_toolTip` references away from this path

Header and full node palettes:

- `user/derpNodes/Palettes/_system/DK_Full_v01.json`
- `user/derpNodes/Palettes/_system/NE_Full_v01.json`
- `user/derpNodes/Palettes/_system/LT_Header_v01.json`
- `user/derpNodes/Palettes/_system/Header_Neutral_v01.json`
- `user/derpNodes/Palettes/_system/Header_Dark_a50_v01.json`
- `user/derpNodes/Palettes/_system/Header_LT-A50_v01.json`

Purpose:

- per-node header color identity
- sometimes per-node canvas/body identity
- icon-button background overrides

Rules:

- entries are usually named `<NodeType>_header`
- body overrides use `<NodeType>_canvas`
- icon button overrides use `_ICONBTN_<icon>`

LoRA detail palette:

- `user/derpNodes/Palettes/_system/NODE_loraDetail_default.json`

Purpose:

- business-specific color buckets for LoRA detail Basta UI

Ratings palettes:

- `user/derpNodes/Palettes/_system/PAL_ratings.json`
- `user/derpNodes/Palettes/_system/PAL_ratings_v01.json`

Purpose:

- rating band color semantics used by LoRA Stack business logic

Rule:

- `derpLoraStack` explicitly loads `PAL_ratings.json`

### Root palette files under `Palettes/`

General global palettes:

- `user/derpNodes/Palettes/Derp_Default_v01.json`
- `user/derpNodes/Palettes/ComfyUI_Default.json`
- `user/derpNodes/Palettes/ComfyUI_Default_Full.json`

Purpose:

- selectable global active palette documents

Experimental or sample palettes:

- `user/derpNodes/Palettes/derpPalettes_v02.json`
- `user/derpNodes/Palettes/Gemini's palette.json`
- `user/derpNodes/Palettes/Test.json`

Legacy or special files:

- `user/derpNodes/Palettes/derpPalettes.json`
- `user/derpNodes/Palettes/NODE_loraDetail_default.json`

Rules:

- `derpPalettes.json` is still referenced by theme config compatibility code but is not part of the main modern runtime chain
- root `NODE_loraDetail_default.json` looks like an older or simplified companion to the `_system/` version

### <span style="color: #80ffc0">Naming Rules</span>

### File-level naming

- `_system/` means system-managed palette file namespace
- `_defaultTheme` files are category-aware string-color defaults
- header palettes often use `Header_*` or `*_Full_*` file names
- ratings palettes use `PAL_*`
- node-specific or component-specific documents may use `NODE_*`

### Entry-level naming

Header entries:

- `<NodeType>_header`

Canvas entries:

- `<NodeType>_canvas`

Icon button entries:

- `_ICONBTN_<icon>`

String color entries:

- `t_text_error`
- `t_text_warning`
- `t_text_accent`
- `t_text_highlight`

Tooltip-related string entries often include:

- `toolTip_background`
- `t_toolTip_*`

### <span style="color: #80ffc0">Editing and Save Flow</span>

### Palette Manager Basta

Primary file:

- `js/fatha/bastas/bastaPalette.js`

Flow:

1. list palette files from `/xcp/list/palettes`
2. load a selected palette from `/xcp/load/palettes?name=...`
3. edit colors through `bastaColorDesigner.js`
4. update in-memory cache for live preview
5. on save, persist with `POST /xcp/save/palettes`

Preview rules:

- live preview mutates `window.xcpPaletteCache`
- if the edited file is the active global palette, preview also mutates `window.xcpActivePalette`
- matching Fatha/Uncle nodes are invalidated and redrawn

Effect toggle rules:

- missing `shadow`, `stroke`, `glow` keys stay omitted unless the user enables them
- disabling an effect removes that key on save

### Theme Manager palette dropdown

Primary files:

- `js/motha/themeManagerV2.js`
- `js/motha/themeManagerV2_core.js`
- `js/motha/helpers/themeManager_paletteUtils.js`

Flow:

1. load `_system/` palette list for dropdown display
2. set `node.properties.systemPaletteName`
3. write the file name into `theme._palette`
4. sync into `window.xcpDerpThemeConfig.themes[name]._palette`
5. trigger theme update and cache refresh

Rule:

- selecting `None` clears `_palette` and falls back to the global active palette path

### <span style="color: #80ffc0">Backend and Storage Paths</span>

Primary backend files:

- `python/xcp_routes/xcp_file_common.py`
- `python/xcp_routes/xcp_file_categories.py`
- `python/xcp_routes/xcp_file_json_routes.py`
- `python/xcp_routes/xcp_file_server.py`

Rules:

- palette root is resolved from `derpNodes/Palettes` with legacy lowercase fallback support
- list/load/save/delete/rename/duplicate all go through the generic JSON file routes
- front-end URLs such as `/xcp/list/palettes`, `/xcp/load/palettes`, and `/xcp/save/palettes` all resolve through this backend layer

### <span style="color: #80ffc0">Bundled Asset Sync Rules</span>

Primary files:

- `python/bundled_asset_sync.py`
- `__init__.py`

Rules:

- bundled palettes under `user/derpNodes` are synced into the ComfyUI user directory at startup
- `_system/` directories and `_*.json` files are treated as system-managed assets
- non-interactive conflict resolution uses timestamps

### <span style="color: #80ffc0">Display Name Rules In UI</span>

Theme Manager:

- only `_system/` palettes are shown
- `_system/` prefix is removed for display

Palette Manager:

- uses the full palette file list
- shows the basename without `.json`

Backend file list:

- returns relative palette paths without `.json`

### <span style="color: #80ffc0">Special Business Uses</span>

### LoRA Stack ratings palette

Primary file:

- `js/derps/controldeck/core/derpLoraStack_core.js`

Rule:

- this code explicitly fetches `_system/PAL_ratings.json`
- this is a dedicated business palette, not a general header/string palette path

### LoRA detail Basta palette

Primary file:

- `js/fatha/bastas/bastaLoraDetail.js`

Rule:

- this path uses dedicated palette entries for LoRA detail UI sections
- it explicitly mixes `_system/NODE_loraDetail_default.json` with a hard-coded ratings reference to `_system/PALETTE_ratings_default.json`

### <span style="color: #80ffc0">Legacy and Retired Paths</span>

### `@key` direct lookup

- still supported in `masterPainter.js`
- only checks top-level `window.xcpActivePalette[key]`
- modern palette documents are not automatically flattened, so this path is legacy and fragile

### `paletteExtender.js`

- historical default-node context-menu palette extender
- registration block is intentionally commented out
- kept for reference, not active runtime behavior

### `_toolTip.json`

- historical dedicated tooltip palette
- runtime and docs treat this as retired
- new tooltip code should use the category-aware default string palette path instead

### <span style="color: #80ffc0">Known Caveats</span>

### Naming rule in code is suffix-based

Actual matching code uses:

- `<NodeType>_header`
- `<NodeType>_canvas`

This is the rule to trust when authoring palette entries for node-type matching.

### Global active palette and attached palette are separate systems

- global active palette is not the same thing as `theme._palette`
- attached palette drives per-node header/canvas/icon-button overrides
- global active palette mainly supports legacy direct `@key`, string-color fallback, and some helper paths

### A suspicious ratings palette reference exists

`bastaLoraDetail.js` still references `_system/PALETTE_ratings_default.json`, but the repo contains `PAL_ratings.json` and `PAL_ratings_v01.json`.

That looks like a naming relic and should be treated carefully during future cleanup.

### <span style="color: #80ffc0">Most Important Files By Role</span>

Runtime palette core:

- `js/fatha/helpers/fathaThemeRuntime.js`
- `js/fatha/helpers/headerPaletteIdentity.js`
- `js/fatha/core/fathaHandler.js`
- `js/herbina/utils/widgetsUtils.js`
- `js/herbina/masterPainter.js`
- `js/herbina/widgets/btnIcon.js`

Palette editing UI:

- `js/fatha/bastas/bastaPalette.js`
- `js/motha/themeManagerV2.js`
- `js/motha/themeManagerV2_core.js`
- `js/motha/helpers/themeManager_paletteUtils.js`

Backend storage and routes:

- `python/xcp_routes/xcp_file_common.py`
- `python/xcp_routes/xcp_file_categories.py`
- `python/xcp_routes/xcp_file_json_routes.py`
- `python/xcp_routes/xcp_file_server.py`

Special business palette consumers:

- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/fatha/bastas/bastaLoraDetail.js`
- `js/derps/controldeck/derpSwatch.js`

### <span style="color: #80ffc0">Practical Authoring Rules</span>

When authoring or editing palette files in this repo:

1. Treat palette as color override, not structure.
2. Preserve `id`, `name`, entry order, and omitted effect keys unless the task clearly targets them.
3. Use `<NodeType>_header` and `<NodeType>_canvas` for attached node palette entries.
4. Use `_ICONBTN_<icon>` for icon-button background overrides.
5. Use `_defaultTheme` category files for semantic text colors and tooltip colors.
6. Remember that `effects: true` controls whether effect colors replace theme effect colors.
7. Be careful with legacy `@key` assumptions because modern palette files are document-shaped, not flat maps.
