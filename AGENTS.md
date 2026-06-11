# AGENTS.md - xcp_derp-UI

## Coding Guidelines

This section is the top-priority project memory for coding behavior. Follow it before all other project guidance unless a direct user/developer/system instruction conflicts.

0. **Report changed files.** At the bottom of every response, include a **Files Changed** section listing only files changed during the current turn. Use full paths.
1. **Review relevant framework docs before edits.** Read the matching `derp_docs/FRAMEWORK-*.md` file before changing Fatha, Herbina, Basta, Motha, backend, docking, node, or theme-palette code.
2. **Think before coding.** State assumptions when they matter. If the request is unclear or has risky interpretations, ask before editing.
3. **Simplicity first.** Write the minimum code that solves the requested problem. Do not add speculative flexibility, broad abstractions, or unrelated cleanup.
4. **Surgical changes.** Touch only files and lines tied to the task. Match existing style. Do not refactor adjacent code unless the task requires it.
5. **Goal-driven execution.** Define the success check, implement, then verify with the narrowest useful command or inspection.
6. **Self-maintain this file.** When a durable project lesson is learned, add it under **Lessons Learned** without being asked.

---

## Project Overview

`xcp_derp-UI` is a ComfyUI custom node pack, currently version `0.7.7` in both `pyproject.toml` and `package.json`. It replaces much of ComfyUI/LiteGraph node rendering with custom layout, docking, widget, Basta overlay, and theme systems.

### Core Frameworks

- **Fatha** (`js/fatha/`): virtual node/layout orchestration, draw lifecycle, docking helpers, system panel integration.
- **Herbina** (`js/herbina/`): widget library and painter/animation utilities. Widgets are re-exported through `js/herbina/masterWidgets.js`.
- **Basta** (`js/fatha/basta.js`, `js/fatha/bastas/`): floating screen-space overlay panels using the same layout/widget stack as Fatha.
- **Motha** (`js/motha/`): theme, palette, ThemeManagerV2, string-color, and theme-weight systems.

### Current Layout

| Path | Purpose |
| --- | --- |
| `python/` | Backend node modules and virtual shells with `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS`. |
| `python/xcp_routes/` | HTTP routes for assets, image/json/prompt-book data, themes, palettes, LoRA APIs, and file serving. |
| `js/derps/controldeck/` | ControlDeck node frontends such as SeedV2, LoRA Stack, ImageDeck, TriggerWall, Toggle, Slider, Swatch, Latent, Prompt Book. |
| `js/derps/loaders/` | Loader frontends for Clip, Diffusion, Model, Sampler, Scheduler, and VAE. |
| `js/derps/utils/` | Utility node frontends such as Concatenate and Skunk. |
| `js/fatha/` | Fatha layout engine, draw handlers, docking, system panel, Basta panels. |
| `js/herbina/` | Widget/painter/animation library. |
| `js/motha/` | Motha theme manager, theme runtime, helpers, and templates. |
| `locales/` | Locale JSON files. Current repo has `en-US.json` and `zh-CN.json`. |
| `derp_docs/` | Framework and node documentation. |
| `user/derpNodes/` | Bundled/user-facing assets, palettes, themes, and theme weights. |

### Framework Docs

There are eight authoritative framework docs:

- `derp_docs/FRAMEWORK-Backend.md`
- `derp_docs/FRAMEWORK-Basta.md`
- `derp_docs/FRAMEWORK-Docking.md`
- `derp_docs/FRAMEWORK-Fatha.md`
- `derp_docs/FRAMEWORK-Herbina.md`
- `derp_docs/FRAMEWORK-Motha.md`
- `derp_docs/FRAMEWORK-Nodes.md`
- `derp_docs/FRAMEWORK-ThemePalette.md`

Docs must stay synced with framework behavior. Stale docs are treated as bugs.

---

## Development Conventions

### Python and Registration

- `__init__.py` imports node modules, merges mappings, and sets `WEB_DIRECTORY = "./js"`.
- `derpThemeManagerV2.py` import must remain guarded by `try/except ImportError` because ThemeManagerV2 is private and excluded from public release builds.
- Most ControlDeck nodes are virtual shells: Python registers graph presence, while JS owns UI and runtime behavior.
- New node modules must export both mapping dicts and be merged into `__init__.py`.
- `bundled_asset_sync.py` should sync user assets broadly under `user/derpNodes/`, not via a fragile fixed whitelist.

### JavaScript Nodes

- Fatha nodes register via `fatha(nodeType, nodeData, minWidth)` or `uncle(...)`.
- JS node files live under `js/derps/` category folders, not old flat `js/controldeck/` paths.
- Put large/reusable node logic in local `core/*_core.js` only when it actually reduces complexity.
- Layout maps are declarative trees returned by `refreshNodeLayoutMap()`.
- Include every visual-affecting setting in layout/widget/cache hashes.

### Theme and Palette

- Theme keys use the comma format: `"BodyKey, LabelKey, FontSizeOverride"`.
- Respect `_ON`, `_OFF`, and `_DIS` suffixes when resolving theme states.
- `resolvePaintData` is for compiled theme paint data. Palette entries such as `t_text_accent` and `t_text_error` must use the `{{}}` string-color pipeline.
- Category-aware string palettes are active: Dark/Light/Neutral themes use category-specific `_system/_*_defaultTheme.json` files; other/missing categories fall back to `_system/_defaultTheme.json`.

### CHANGELOG

- Keep each version, including `[Unreleased]`, to at most `### Added`, `### Changed`, and `### Fixed`.
- Do not create duplicate section headers. Merge new entries into existing sections.

### i18n

- User-visible strings need locale entries in both `locales/en-US.json` and `locales/zh-CN.json` unless the surrounding code intentionally uses dynamic/user-provided text.
- Do not add references to missing locale files.
- `fathaLayoutMaps.js` tooltips must call `tLocale(...)`; the layout engine does not auto-localize tooltip strings.

---

## Git, Remotes, and Release

- Default development branch is `daily-development`.
- Remotes currently used:
  - `github`: `git@github.com:lordwedggie/xcpDerpNodes.git` (SSH dev repo)
  - `origin`: `https://github.com/lordwedggie/xcpDerpNodes` (HTTPS dev repo, often less reliable)
  - `release`: `git@github.com:lordwedggie/xcp_derp-UI-Release.git` (public release repo)
- Public release excludes private ThemeManagerV2 files and `.deepseek/`:
  - `js/motha/themeManagerV2.js`
  - `js/motha/themeManagerV2_core.js`
  - `python/derpThemeManagerV2.py`
- Release version bumps must update and re-read both `pyproject.toml` and `package.json` before committing.
- Do not use destructive git commands or broad untracked cleanup unless explicitly requested.
- Preserve unrelated user changes in dirty worktrees.

---

## Lessons Learned

### Project Memory and Communication

- `AGENTS.md` is the primary project memory for Codex in this repo.
- Keep responses concise and default to English unless the user asks otherwise.
- Report only current-turn file changes in the final **Files Changed** section.
- Avoid noisy implementation details in final reports; summarize intent, verification, and risks.

### Framework Docs First

- Read the relevant `FRAMEWORK-*.md` before touching framework code.
- Update the same doc when changing framework contracts, widget APIs, palette resolution, layout behavior, docking, Basta lifecycle, or backend routes.

### Layout Engine

- Layout maps are declarative trees; object-valued config keys can be mistaken for child regions unless added to reserved keywords.
- Hashes prevent rebuilds. Every parameter that changes visible output must be represented in the appropriate hash.
- `width: "match"` depends on height and can temporarily measure at fallback size during early passes.
- PASS 1 measures at `SQUISH_WIDTH = 10`; high `minWidth` values can inflate the whole layout.
- Use `_forceSync`, `_layoutDirty`, and `_derpAwakeFrames` deliberately for recompute and animation wakeups.
- Whole-wall/passive caches can hide correct widget state; inspect cache keys when visuals revert unexpectedly.

### Widget Patterns

- Start widget sync paths with `resolveWidgetEnv(...)`. It handles theme resolution, i18n, state suffixes, color segments, animation gating, alpha, and visible display text.
- Widgets should use `_hoveredRegionKey` and `_pressedRegionKey`; do not invent parallel hover/press state unless necessary.
- Canvas segmented text should pass `segments` to `masterPainterText`; HTML segmented text should use `colorSegmentsToHTML(...)`.
- For new BUTTON layout-map entries, include `mouseOver: true` and `padding: [pW, pH]` unless matching a nearby non-interactive label pattern.
- Do not use `padding` on TEXT widgets when the background is disabled; position via parent margin/spacing instead.
- `btnIcon` fallback glyph is used by unknown icon keys such as SeedV2's stop button. Keep `fallback: "⏹"` in `ICON_MAP`.

### Editor Widgets

- Do not override `EDITOR` activation locally unless preserving the shared default activation/focus behavior.
- Canvas-hosted editors should generally set `canvasShield: true`.
- If first click selects text but typing fails until a second click, fix shared `derpEditor` activation/focus behavior instead of adding per-node hacks.
- Canvas-shield asleep editor visuals belong on canvas; DOM should act as hit/focus/editing surface.
- Do not solve zoom drift with per-zoom nudges.
- Title editing uses the in-place header editor; do not add Basta wrappers for node title editing.

### FileBrowser and Dropdowns

- Keep FileBrowser refactors under `js/herbina/widgets/helpers/`.
- Do not decorate persisted dropdown values. Use object items such as `{ value: "canvas", display: "* canvas" }` when display text differs from stored value.
- Primitive `"None"` items render as `None`; use object fallback items when the closed label needs custom text.
- Picker panels should preserve canvas pan and close on pointerup after outside interaction, ignoring completed canvas drags.
- Picker visuals should use theme corners and draw late/high enough not to be covered.
- Search tab behavior scrolls to best match; it should not filter the full picker list.
- `bastaFileHandler` supports optional `filePicker` in save/rename flows for choosing an existing file target before confirming.

### Color-Key Resolution

- Never call `resolveColorKey` directly from widget code. Use `parseColorKeyText` with `{{keyName:stateSuffix:::displayText}}` tokens.
- The `{{}}` path handles palette lookup, state resolution, and text effects.
- Color-key tokens override plain paint overrides on the same widget. When a toggle disables color keys, remove the tokens rather than only changing `labelColor`/`btnColor`.
- Tooltip color keys resolve through the host node's category-aware string palette. Do not introduce new `_system/_toolTip` usage.

### ThemeManager and Theme Weights

- `themeManagerV2.js`, `themeManagerV2_core.js`, and `derpThemeManagerV2.py` are private modules excluded from public release.
- Theme `Category` is a top-level property and should serialize first. Legacy `_category` is normalized to `Category`.
- Theme weight files live under `Themes/_System/` and use `_WT_` filename prefix.
- Weight files save/apply only `_layout`, per-key `corners`, and text-key `font`, `fontSize`, `fontWeight`.
- Weight files must not save/apply shadow, stroke, glow, color, clip, or palette data.
- ThemeManagerV2 weight loading mutates the active edit target; system panel weight loading uses `node._themeWeightOverlay` and must not mutate shared theme config.
- `_layout` weight overlays affect nodes through `getDerpVars()`; corners/fonts apply before `compileThemeData()`.

### Fatha and Basta

- Fatha full nodes own virtual rendering and usually suppress LiteGraph slots.
- Uncle nodes preserve real LiteGraph input/output slots with `UNCLE_LINK_PAD`.
- Basta panels render in screen space, not canvas space, and register in `window.xcpActiveBastas`.
- Prefer existing Basta panels instead of creating one-off overlay systems.
- System panel is a virtual node proxy, not a real LiteGraph node.

### Docking and Node 2.0

- Isolate Node 2.0/Vue compatibility behind `isComfyVueNodesMode()` or dedicated compatibility helpers.
- Do not regress legacy mode when fixing Node 2.0 behavior.
- For real graph nodes in Vue mode, use size setters or `setDerpNodeSizeCompat(node, w, h)` rather than mutating `node.size[0]` / `node.size[1]` directly.
- Basta overlays are not graph nodes; do not apply graph-node size rules blindly to them.
- Vertical docking free-height mode uses `autoHeight = false` unless `properties.deckForceAutoHeight = true`.
- Horizontal dock maintenance must be gated by geometry signatures/indexes; do not normalize all deck members every frame.
- Deck Pressure is ImageDeck-owned in V1. Pressure attaches must let `applyDeckPressureLayout()` own branch reflow; avoid generic `normalizeDockPair()` / `forceDockResizeRefresh()` on hub seams because they can move the anchored hub.

### Node-Specific Notes

- `derpSignalOut` refresh can be throttled; force refresh for one-shot source title changes.
- Indexed wireless transmitter IDs use `${baseId}:${index}` and should write complete signal records into `window.xcpDerpSignals`.
- Bypassed indexed wireless outputs should emit empty strings.
- LoRA no-trigger-required state is per-row persisted in `properties.stackData[i][7]`.
- TriggerWall active visual state belongs in whole-wall cache keys.
- `COMPOSITE_TRIGGER` `bodyPaint` overrides normal `themeKey` state resolution; use only when intentionally decoupling visual and functional state.
- SeedV2 fixed-mode hashing must include virtual wireless state that affects execution.

### Debugging

- For layout anomalies, inspect `masterLayoutEngine` and `widget_Region` before patching symptoms.
- When asking the user to enable debug logs, provide exact console commands in the same response.
- Investigate root causes before broad FileBrowser pointer/hover punch-through fixes.
