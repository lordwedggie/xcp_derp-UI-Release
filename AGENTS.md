# AGENTS.md - xcp_derp-UI

## Coding Guidelines

This section is the top-priority project memory for coding behavior. Follow it before all other project guidance unless a direct user/developer/system instruction conflicts.

1. **Think before coding.** State assumptions when they matter. If the request is unclear or has risky interpretations, ask before editing.
2. **Simplicity first.** Write the minimum code that solves the requested problem. Do not add speculative flexibility, broad abstractions, or unrelated cleanup.
3. **Surgical changes.** Touch only files and lines tied to the task. Match existing style. Do not refactor adjacent code unless the task requires it.
4. **Goal-driven execution.** Define the success check, implement, then verify with the narrowest useful command or inspection.
5. **Report changed files.** At the bottom of every response, include a **Files Changed** section listing only files changed during the current turn. Use full paths.
6. **Review relevant framework docs before edits.** Read the matching `derp_docs/FRAMEWORK-*.md` file before changing Fatha, Herbina, Basta, Motha, backend, docking, node, or theme-palette code.
7. **Self-maintain this file.** When a durable project lesson is learned, add it under **Lessons Learned** without being asked.
8. **NEVER use destructive git commands.** `git reset --hard`, `git clean -fd`, `git checkout -- .`, or any command that discards uncommitted work is FORBIDDEN unless the user explicitly types the exact command themselves. Use `git stash` only with explicit approval.
9. **Do not blindly agree.** If a requested implementation seems illogical, risky, or there is a clearly better approach, stop and explain the concern before editing.
10. **Framework-owned UI behavior stays consolidated.** Whenever possible, do not add specialized UI mechanics, visual behavior, drag/drop behavior, clipping behavior, scrollbar behavior, widget behavior, or interaction plumbing inside individual Derp child nodes. Fatha/Uncle child nodes should contain only node-specific domain logic and layout maps that arrange their UI. Shared UI behavior belongs in Fatha, Uncle, Herbina widgets, or other consolidated framework helpers via explicit parameters. If existing child-node code violates this rule, warn the user and ask whether to fix/remove it before expanding that pattern.

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

There are ten authoritative framework docs:

- `derp_docs/FRAMEWORK-Backend.md`
- `derp_docs/FRAMEWORK-Basta.md`
- `derp_docs/FRAMEWORK-Clipping.md`
- `derp_docs/FRAMEWORK-Docking.md`
- `derp_docs/FRAMEWORK-Fatha.md`
- `derp_docs/FRAMEWORK-Herbina.md`
- `derp_docs/FRAMEWORK-Motha.md`
- `derp_docs/FRAMEWORK-Nodes.md`
- `derp_docs/FRAMEWORK-Optimization.md`
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
- Keep shared UI mechanics out of child nodes. Node files may declare layout-map structure and domain-specific behavior such as seed, LoRA, trigger, or loader data handling; framework/widget behavior such as viewport DnD floaters, clipping, scrollbars, hover/press plumbing, and generic visuals must be centralized and parameterized instead of duplicated per node.
- Include every visual-affecting setting in layout/widget/cache hashes.

### Theme and Palette

- Theme keys use the comma format: `"BodyKey, LabelKey, FontSizeOverride"`.
- Respect `_ON`, `_OFF`, and `_DIS` suffixes when resolving theme states.
- `resolvePaintData` is for compiled theme paint data. Palette entries such as `t_text_accent` and `t_text_error` must use the `{{}}` string-color pipeline.
- Category-aware string palettes are active: Dark/Light/Neutral themes use category-specific `_system/_*_defaultPalette.json` files; other/missing categories fall back to `_system/_defaultPalette.json`.

### CHANGELOG

- **Authoritative copies live in `derp_docs/`**: `README.md` and `CHANGELOG.md` are maintained under `derp_docs/`. The root copies are publication-only mirrors. When copying from `derp_docs/` to root (e.g., during release), update all relative links so they remain valid from the new location.
- Keep each version, including `[Unreleased]`, to at most `### Added`, `### Changed`, and `### Fixed`.
- Do not create duplicate section headers. Merge new entries into existing sections.
- Keep sections clean: no double blank lines, no broken Unicode characters (verify `→` arrows, `fatha`/`basta` paths are not corrupted to FF/BS control chars).

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
- **Line endings are pinned via `.gitattributes** (`* text=auto eol=crlf`, binary assets marked `binary`, `derp_docs/.obsidian/workspace.json -text`). Git normalizes on commit, so an editor saving LF will not produce full-file line-ending churn. Never delete or weaken these rules. If a commit's `--stat` shows hundreds of lines changed but `git show --ignore-all-space --stat` shows almost none, line-ending normalization has regressed — re-add the `.gitattributes` rules and run `git add --renormalize .`.

---

## Agent Skills

Reusable task workflows live in `.agents/skills/` as `SKILL.md` files. Each skill is loaded on-demand when the task matches its description, never on every session.

- **commit-push** — stages changes, writes conventional commits, pushes to `github/daily-development`. Does not update CHANGELOG.
- **release-bump** — bumps version in `pyproject.toml` + `package.json`, verifies CHANGELOG entries exist, pushes to `github` and `release` remotes. Does not edit CHANGELOG.
- **syncthing-debug** — diagnoses and recovers MonkeyCode Syncthing connection issues, stale relay sessions, device identity drift, and workspace sync confusion.
- **update-palette** — updates many palette JSON entries from one or a few hand-crafted exemplar entries while preserving category-specific behavior and palette structure.
- **update-theme** — updates many theme JSON keys from one or a few hand-crafted exemplar keys, starting from `canvas` and the main `_ON/_OFF/_DIS` colors before deriving effects.
- **video-editor** — automates video editing with FFmpeg: trim, cut, concatenate, text overlays, intro/outro cards, speed ramps, and MP4 rendering for tutorial videos.

To add a skill, create `.agents/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) and a workflow body. Keep skills project-scoped so all agents share them.

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
- Treat `derp_docs/FRAMEWORK-Clipping.md` as the authoritative doc for `scrollViewport`, clipped-region behavior, shared scrollbar drawing, viewport wheel/drag handling, and viewport-aware resize floors.

### Layout Engine

- Layout maps are declarative trees; object-valued config keys can be mistaken for child regions unless added to reserved keywords.
- Hashes prevent rebuilds. Every parameter that changes visible output must be represented in the appropriate hash.
- `width: "match"` depends on height and can temporarily measure at fallback size during early passes.
- PASS 1 measures at `SQUISH_WIDTH = 10`; high `minWidth` values can inflate the whole layout.
- Derp nodes default to manual width; only explicit `properties.autoWidth = true` opts into auto width. Missing `autoWidth` must be treated like `false` in layout, docking, and resize paths.
- System panel height selection is one shared Height Mode FILEBROWSER. Standard nodes expose Auto/Manual; clipped nodes should provide `getDerpHeightModeConfig()` instead of adding separate viewport-height controls.
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
- Active canvas-shield editors must keep DOM text visible; do not hide editable DOM text behind a canvas-rendered duplicate because caret, selection, IME, and CJK hit-testing depend on the real DOM text metrics.
- For Inter or other variable fonts, editor DOM/canvas parity requires disabling automatic optical sizing and pinning `opsz` to the unscaled layout font size.
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
- For both theme and palette design work, start from the main `_ON` / `_OFF` / `_DIS` colors first; derive stroke, shadow, and glow from those main colors instead of designing effects in isolation.
- For theme design, start on the `canvas` key first because it establishes the core LT/NE/DK tone, saturation, and transparency of the whole theme.
- For theme size, treat `_layout` plus the text-key `font` and `fontSize` settings as one coordinated system because together they determine whether a themed node feels large or compact.
- Text-key sizes should usually move together as a family; avoid mixed size hierarchies unless the design is intentionally special-case.
- For theme and palette color work, think in HSVA/HSLA terms first even though files store RGBA arrays; hue usually leads, with sibling entries often sharing similar saturation and lightness/value.
- Warm hues from violet-purple through orange-yellow often need higher brightness/value and sometimes higher saturation than cooler-hue equivalents to avoid looking muddy.
- For theme or palette design work, clarify the high-level goal up front: Light/Neutral/Dark plus clean, nearly monochromatic, or very vibrant. If the user did not specify that brief, ask before editing.
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
- Ordinary vertical stack boundary resize must not stretch a collapsed boundary header; route boundary growth into the nearest expanded member and keep collapsed headers compact.
- Vertical stack resize sessions must snapshot collapsed members at compact minimum height, not stale live `nodeSize`, before distributing growth to expanded members.
- Expanded filler members changed by collapsed boundary resize must stay marked as actively resizing until pointer-up, or draw-time auto sizing can fight live shrink drags.
- Collapsed vertical stack boundary corners should only trigger height growth for clear vertical drags; horizontal drags should stay width-only.
- Normal collapsed node height is the compact collapsed header (`SNAP * 2`); do not derive it from width-dependent layout measurements unless `useCollapsedTotalHeight` is explicitly set.
- Vertical stack reflow should run once over topology-ordered members (`collectDeckLineOrdered`) and preserve the pinned member anchor; recursive neighbor snapping can leave gaps or jump the top member after collapse changes.
- Deck Pressure layout should only dirty/sync members whose size or position actually changed; marking every branch member dirty can cause idle FPS drops.
- Horizontal dock maintenance must be gated by geometry signatures/indexes; do not normalize all deck members every frame.
- Deck Pressure is ImageDeck-owned in V1. Pressure attaches must let `applyDeckPressureLayout()` own branch reflow; avoid generic `normalizeDockPair()` / `forceDockResizeRefresh()` on hub seams because they can move the anchored hub.
- Deck Pressure branches live inside a mixed-axis hub group. Shared-edge resize code must query the branch members/axis, not the full deck group axis, or branch stacks look non-resizable.
- Horizontal Deck-branch resize position normalization must use the branch member list, not `getDeckMembers()`, or dragging an internal vertical seam can move the entire Deck group sideways.
- ImageDeck lower-left hub resize must clamp against top/bottom branch minimum width and preserve the right edge when pressure layout enforces that minimum, or repeated drags can ratchet the whole Deck rightward.
- Deck Pressure idle optimization should use a stable geometry signature cache; do not rerun pressure reflow every frame when all members are idle and unchanged.
- Deck Pressure branch member order must follow deck topology, not live x/y sorting; shared-edge resize can temporarily overlap positions and would otherwise swap nodes.
- Horizontal stack width compensation must ignore the first observed edge-member width after load/dock; first-pass autoWidth settling is baseline hydration, not a runtime delta to rebalance.
- Deck Pressure collapsed side-branch heights must be measured from a recomputed collapsed layout, not stale expanded layout caches; collapsed members must never receive spare frame height.
- Deck Pressure side branches must keep at least one member expanded as the filler; if every member is collapsed, uncollapse the active member before distributing spare height.
- Deck Pressure min-span measurement is hot-path code; cache per node by axis/collapsed state/snap/width/layout hash, not current height, because pressure reflow changes height continuously.
- Deck Pressure filler selection must not use hover alone; prefer the active timeout, pressed node, selected expanded node, then already-expanded member. Hover-only promotion can uncollapse nodes just by moving the mouse.
- Deck Pressure collapsed height must use the recomputed collapsed virtual layout (`layout.contentMinHeight`/`totalHeight`) and must not include raw hidden `layoutMap` minHeight from expanded custom content.
- Deck Pressure collapsed height fallback is the compact collapsed header (`DEFAULT_DECK_SNAP * 2`, currently 20px), not the generic node fallback of 40px.
- Deck Pressure layout must preserve the hub node position during collapse/un-collapse pressure passes unless the hub is actively being resized.
- Nodes inside Deck Pressure branches should skip generic `reflowChildren()` during collapse/un-collapse size changes; Deck Pressure layout must be the single source of branch positions to avoid one-frame flicker.
- Ordinary dock normalization, draw-time frame state, and resize-axis helpers must skip ImageDeck hub seams; Deck Pressure layout is the single source for hub-to-branch sizing.
- Deck Pressure arrangement must resolve before writing the first branch member's `deckParentId` / `deckDockSide`; resolving after that makes the empty hub look like it already has branches and can freeze new decks into the legacy vertical sandwich fallback.
- Saved Deck Pressure arrangement only locks hubs with active branches; empty/detached hubs must resolve from the current `Derp.DeckArrangement` setting on their next first attach.
- Deck Pressure left branch X must mirror the right branch from the hub edge (`hub.x - branchWidth`), not reuse the Deck frame left; in vertical sandwich the frame left can equal hub X for top/bottom alignment and would overlay the left branch on the hub.
- Top/bottom vertical Deck Pressure branches preserve their own member heights during ImageDeck hub resize; do not distribute hub height/frame deltas into those branch columns.
- Horizontal stacks attached to Deck Pressure left/right sides must stay expanded; hide/guard collapse controls and reopen already-collapsed members during pressure layout.
- For horizontal stacks attached to Deck Pressure left/right sides, the hub-facing seam is a hub/deck width resize only; do not expose the branch stack's outer-edge width resize on that connected edge.
- For horizontal stacks attached to Deck Pressure left/right sides, the branch shield must expose the hub-facing mid-edge hitbox and route it to the ImageDeck hub resize, or the middle of the seam can be covered while only top/bottom portions respond.
- Horizontal stacks attached to Deck Pressure left/right sides must grow their own row height; attach sizing and pressure layout must never shrink or pressure-grow the ImageDeck hub height for that branch.
- Pressed non-drag widget regions must absorb pointer movement; otherwise a small click twitch can fall through to `updateDockDrag()` and move a deck root using a child node's press-start position.
- Deck target picking for dragged linear stacks must use the stack bounding rect, not only the drag root's node rect, so side/top/bottom attach detection follows the moving stack's outer edge.
- Shared-edge DOM hitboxes and resize handlers must use the same seam eligibility helpers; duplicated seam predicates between `fathaDOMshield.js` and `dockResize.js` can show a handle that the resize path later rejects, or hide a seam that would resize correctly.
- Vertical stack seam resizing must pin active members to the seam-assigned physical height during the live gesture, even when a clipped node's Height Mode normally resolves through numeric/auto sizing. Otherwise viewport-backed nodes can redraw taller than the stack frame while the seam is dragged.
- Pure top/bottom vertical stack seam resizing must preserve the stack's starting shared width during the live resize window, growing only to a freshly measured content floor when the start width is genuinely too small. Apparent width creep can come from stale wider member widths being propagated by later normalization, not from the seam resize code directly.
- Node-local Height Mode normalization must not overwrite docking's live `autoHeight = false` lock while `deckSavedAutoHeight` exists; update the saved standalone preference instead so vertical stack resize handles stay height-capable while docked.
- Tooltips for content viewport descendants must anchor to displayed viewport coordinates, not raw unscrolled content-space region positions; resolve through viewport state and subtract scroll before pinning Basta overlays.
- Left/right vertical Deck Pressure branch seam resizing must preserve the freshly fitted member heights during mouse-up settlement; saved expanded-height preferences should not immediately re-grow a lower active member after release.
- Internal vertical seam drags in left/right Deck Pressure branches must preserve the canonical Deck frame and immediately rerun Deck Pressure layout; generic vertical normalization can push later branch members outside the side band until idle layout repairs them.
- Content viewport resize floors must use `_contentViewportMinClipHeight` / `minClipHeight` rather than the current visible clip height, so Fit Node clipped regions can shrink to one visible entry/group during seam resizing.
- Deck Pressure side-branch active-resize and fresh manual seam-fit preservation must never preserve live heights whose total exceeds the canonical side band; over-tall live totals push lower members outside the frame at clamp/release.
- Deck Pressure internal vertical seam drags should snapshot all branch member heights after the seam fit; otherwise subsequent pressure passes can redistribute spare height into unrelated siblings and make Slider/LoraStack change height during another seam's resize.

### Node-Specific Notes

- `derpSignalOut` refresh can be throttled; force refresh for one-shot source title changes.
- Indexed wireless transmitter IDs use `${baseId}:${index}` and should write complete signal records into `window.xcpDerpSignals`.
- Bypassed indexed wireless outputs should emit empty strings.
- LoRA no-trigger-required state is per-row persisted in `properties.stackData[i][7]`.
- TriggerWall active visual state belongs in whole-wall cache keys.
- `COMPOSITE_TRIGGER` `bodyPaint` overrides normal `themeKey` state resolution; use only when intentionally decoupling visual and functional state.
- SeedV2 fixed-mode hashing must include virtual wireless state that affects execution.

### Debugging

- User wants turn-completion voice notifications when practical. Run the matching script as the final tool call before the final response, then reply immediately — do not wait for completion:
  - **CodeWhale**: `tools/codewhale_turn_complete_piper.ps1` (Piper TTS, male voice `en_US-ryan-high`)
  - **Codex**: `tools/codex_turn_complete_piper.ps1` (Piper TTS, female voice `en_GB-cori-high`)
  - Acceptable address terms include Sir, Dude, Bruce, Lord Wedggie, My Lord, and your Lordship.
- Syncthing device identity comes from `cert.pem` and `key.pem` under `/root/.config/syncthing-xcp/`; if the workspace is rebuilt, back up and restore that directory to keep the same device ID.

- For layout anomalies, inspect `masterLayoutEngine` and `widget_Region` before patching symptoms.
- For node optimization work, read `derp_docs/FRAMEWORK-Optimization.md` first, then the matching framework docs for Fatha, Uncle, Basta, Herbina, docking, clipping, or node-specific behavior.
- Bitmap/offscreen-canvas draw caching is a last-resort optimization for potentially extremely heavy nodes. It can be fast, but it may look less sharp and can flicker; do not add it unless explicitly requested or after simpler rendering optimizations are exhausted.
- When asking the user to enable debug logs, provide exact console commands in the same response.
- Investigate root causes before broad FileBrowser pointer/hover punch-through fixes.

### System Panel / Basta → Main Layout Sync

When a system panel dropdown or Basta overlay widget changes a property that affects the main node's visual display, the `onChange`/`onPress` handler must rebuild BOTH layout maps — not just the panel's own:

- **System panel handlers**: always follow `refreshDerpXxxSysMap()` with `refreshNodeLayoutMap()` if the changed property appears in the main node's layout map or hashes.
- **Basta overlay handlers**: if a widget inside a Basta changes a property that affects a widget in the same Basta, clear `_compDataCache[key]`, set `_forceSync = true`, and call `requestDerpSync()`. If it also affects the host node's main layout, call `refreshNodeLayoutMap()` on the host.

**This bit us twice in one session**: ImageDeck format dropdown (system panel) and PromptBook "insert after" toggle (Basta overlay). Both changed a property, refreshed only the panel/Basta, and left the main display stale until an unrelated click forced a full redraw.

### Whole-Wall Passive Cache and Editor Updates

When a `canvasShield` EDITOR widget's text must update and the node uses whole-wall passive caching (ImageDeck, LoraStack, TriggerWall), do NOT rely on cache invalidation + draw cycle. The draw cycle races against multiple cached layers (`_compDataCache`, `_editorLineCache`, `el._config`, layout regions, DOM element state hashes). Instead, **directly mutate all cached objects in-place** — the same approach as `syncImageDeckFilenameEditorDisplay`:

- `editor.text/value` — the layout map config
- `reg.text/value` — the live layout region
- `_compDataCache[key].text/value` — the comp data cache
- `el._config.text/value` — the DOM element's config
- `el._lastStateHash = null` — forces DOM re-render

This bypasses the whole-wall cache staleness entirely: the next whole-wall render captures the already-updated values, and the DOM resyncs because its state hash is cleared.
