# AGENTS.md � xcp_derp-UI

## Project Overview

xcp_derp-UI is a ComfyUI custom node pack (v0.7.6) that replaces ComfyUI's default LiteGraph rendering with a custom layout/docking/theming system. Lives at `ComfyUI/custom_nodes/xcp_derp-UI/`.

### Architecture (4 frameworks)
- **Fatha** (`js/fatha/`) � Virtual DOM / layout orchestration layer. Hijacks `LGraphCanvas.prototype.drawNode`, registers nodes via `fatha()` / `uncle()`, manages the per-frame draw lifecycle.
- **Herbina** (`js/herbina/`) � Widget / UI component library. All visual widgets (buttons, sliders, toggles, editors, file browsers) live here. Re-exported through `masterWidgets.js`.
- **Basta** (`js/fatha/basta.js` + `bastas/`) � Floating panel system. Multi-instance overlay panels sitting above the node graph. Uses same layout engine as Fatha but renders in screen space.
- **Motha** (`js/motha/`) � Theme management system. Runtime theme swaps, palette resolution, template synchronization.

### Directory layout
| Path | Purpose |
|------|---------|
| `python/` | Python backend: ComfyUI nodes with `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS` |
| `python/xcp_routes/` | File server, asset/image/json/prompt-book routes |
| `js/` | JavaScript frontend: widgets, docking, layout, themes |
| `js/fatha/` | Fatha layout engine + Basta panels |
| `js/herbina/` | Herbina widget library |
| `js/motha/` | Motha theme manager |
| `derp_docs/` | Documentation (EN + ZH for each node) |
| `locales/` | i18n files (`en-US.json`, `zh-CN.json`) |
| `__init__.py` | Plugin entry point: imports all node modules, merges mappings, sets `WEB_DIRECTORY = "./js"` |

---

## Development Conventions

### Python nodes
- Each node module in `python/` exports `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS` dicts.
- New nodes must be imported and merged in `__init__.py`.
- JS counterpart files in `js/controldeck/` share the same name stem (e.g., `derpSeedV2.py` ? `derpSeedV2.js`).
- Core logic split into `*_core.js` files when the main file is a thin ComfyUI glue layer.

### JavaScript frontend
- Fatha nodes register with `fatha(nodeType, nodeData, minWidth)` or `uncle(...)`.
- Widgets in `js/herbina/widgets/` are re-exported through `js/herbina/masterWidgets.js`.
- Basta panels register in `window.xcpActiveBastas` Map.
- Theme keys use three-part format: `"BodyKey, LabelKey, FontSizeOverride"`. Parsed with `parseThemeKey`, resolved with `resolvePaintData`.
- Always respect `_ON` / `_DIS` state suffixes when resolving theme keys.

### Framework Documentation
- Eight FRAMEWORK-*.md files live in derp_docs/ covering Fatha, Herbina, Basta, Motha, Backend, Docking, Nodes, and ThemePalette.
- When framework code changes (e.g., new widget API, theme key parsing, palette resolution), the relevant FRAMEWORK doc must be updated at commit time to reflect the changes.
- Docs are kept in sync with code � stale docs are a bug.

### i18n
- Locale strings in `locales/{lang}.json`. Keep EN and ZH in sync when adding keys.

---

## Coding Guidelines

0. **TOP PRIORITY � Report changed files.** At the very bottom of every message, always report the files you have changed during the turn with full paths highlighted as clickable inline code (e.g., ` js/controldeck/derpSeedV2.js `). Group them under a **Files Changed** header.

1. **Review FRAMEWORK docs.** Before making changes, check derp_docs/FRAMEWORK-*.md for the relevant subsystem (Fatha, Herbina, Basta, Motha, Backend, Docking, Nodes, ThemePalette). Understand the existing patterns and conventions before coding.

2. **Think before coding.** State assumptions explicitly. If something is unclear, ask.
3. **Simplicity first.** Minimum code that solves the problem. No abstractions for single-use code, no premature configurability.
4. **Surgical changes.** Touch only what you must. Match existing style. Do not refactor things that are not broken.
5. **Goal-driven execution.** Define success criteria before implementing. Loop until verified.

6. **Self-maintain AGENTS.md.** When you encounter a new pattern, learn from a mistake, or discover an undocumented convention, update the Lessons Learned section (or add a new one) in AGENTS.md without being asked. This file is your only persistent memory across sessions — stale or missing lessons will cause repeated mistakes.


---

## Lessons Learned (do not repeat these mistakes)

### Color-key / palette resolution (2026-06-09)
1. **Never call `resolveColorKey` directly from widget code.** Always construct a `{{keyName:stateSuffix:::displayText}}` string and pass it through the existing `parseColorKeyText` framework. The `:::` (three-colon) syntax tells the parser: keyName, then state suffix (`_ON`/`_OFF`/`_DIS`), then display text.
2. **The `{{}}` token path handles everything:** palette lookup, state resolution, AND effects (shadow/border/glow) — all in one call. Bypassing it means you have to reimplement all three.
3. **For HTML widgets,** use `colorSegmentsToHTML(segments, fallbackColor, { getTextShadow })` to render palette-colored text in DOM elements — don't just set `innerText`.
4. **For canvas widgets,** pass `segments: iconColorSegments` to `masterPainterText` — it has a full segmented rendering path with per-segment effects.
5. **Update cache hashes** whenever adding a new config parameter that affects visual output. Include the parameter value AND a status/availability check in the hash.
6. **`resolvePaintData` works for THEME keys only.** Palette entries (like `t_text_accent`, `t_text_error`) have no compiled theme paint data — `resolvePaintData` returns null for them. Use the `{{}}` / `resolveColorKey` path for palette entries.
7. **Always read `derp_docs/FRAMEWORK-*.md` first** before touching framework code. These docs describe the resolution chains and patterns that exist.
