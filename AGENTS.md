# AGENTS.md - xcp_derp-UI

## Coding Guidelines

This section is the top-priority project memory for coding behavior. Follow it before all other project guidance unless a direct user/developer/system instruction conflicts.

1. **Think before coding.** State assumptions when they matter. If the request is unclear or has risky interpretations, ask before editing.
2. **Simplicity first.** Write the minimum code that solves the requested problem. Do not add speculative flexibility, broad abstractions, or unrelated cleanup.
3. **Surgical changes.** Touch only files and lines tied to the task. Match existing style. Do not refactor adjacent code unless the task requires it.
4. **Goal-driven execution.** Define the success check, implement, then verify with the narrowest useful command or inspection.
5. **Report changed files.** At the bottom of every response, include a **Files Changed** section listing only files changed during the current turn. Use full paths.
6. **Review relevant reference docs before pattern-sensitive edits.** These documents encode known pitfalls and correct patterns. Read them BEFORE making structural layout changes, dock resize fixes, or drag-and-drop edits:

| When editing... | Read... |
|----------------|---------|
| Layout maps (regions, anchors, margins, LINEBREAKs) | `.agents/references/layout-engine-pitfalls.md`, `.agents/references/linebreak-layout-pattern.md` |
| Dock resize / seam drags | `.agents/references/dock-live-resize-shield-sync.md`, `.agents/references/vertical-stack-height-min-width-lock.md` |
| Drag-and-drop handlers | `.agents/references/triggerwall-drag-holdonly-regression.md` |
| Deck Pressure autoWidth | `.agents/references/deck-pressure-autowidth-seam-resize.md` |
| derpPromptBook / stale closures | `.agents/references/derppromptbook-stale-closure-audit.md` |

For architecture overview, see `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-*.md` (layout, docking, widgets, themes, etc.) and load the `derp-ui-dev` skill when available.
7. **Self-maintain this file.** When a durable project lesson is learned, add it under **Lessons Learned** without being asked.
8. **NEVER use destructive git commands.** `git reset --hard`, `git clean -fd`, `git checkout -- .`, or any command that discards uncommitted work is FORBIDDEN unless the user explicitly types the exact command themselves. Use `git stash` only with explicit approval.
9. **Do not blindly agree.** If a requested implementation seems illogical, risky, or there is a clearly better approach, stop and explain the concern before editing.
10. **Framework-owned UI behavior stays consolidated.** Whenever possible, do not add specialized UI mechanics, visual behavior, drag/drop behavior, clipping behavior, scrollbar behavior, widget behavior, or interaction plumbing inside individual Derp child nodes. Fatha/Uncle child nodes should contain only node-specific domain logic and layout maps that arrange their UI. Shared UI behavior belongs in Fatha, Uncle, Herbina widgets, or other consolidated framework helpers via explicit parameters. If existing child-node code violates this rule, warn the user and ask whether to fix/remove it before expanding that pattern.

Spend time on thinking; you do not need to use the commentary channel to report progress to me.

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
| `derp_docs/` | End-user documentation only. Developer notes and framework docs live in `D:\_AI_KnowledgeBase\derp-UI\`. |
| `user/derpNodes/` | Bundled/user-facing assets, palettes, themes, and theme weights. |

### Developer Knowledge Base

Canonical framework docs and developer notes live outside the workspace:

- `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-*.md`
- `D:\_AI_KnowledgeBase\derp-UI\dev-notes\`

Use the `derp-ui-dev` skill when it is available. Docs must stay synced with framework behavior. Stale docs are treated as bugs.

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
- **run-tests** — runs the Vitest test suite (`npm test`). Write or update tests when fixing layout/measurement bugs in pure functions. Covers `interpretLayoutProps`, width/height math, and theme resolution.

To add a skill, create `.agents/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) and a workflow body. Keep skills project-scoped so all agents share them.

---

## Lessons Learned

Lessons here are agent-facing reminders and sharp-edge indexes. Keep them short, operational, and linked to the authoritative `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-*.md` docs instead of re-explaining full framework contracts here.

### Project Memory and Communication

- `AGENTS.md` is the primary project memory for Codex in this repo.
- Keep responses concise and default to English unless the user asks otherwise.
- Report only current-turn file changes in the final **Files Changed** section.
- Avoid noisy implementation details in final reports; summarize intent, verification, and risks.

### Framework Docs First

- Read the relevant `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-*.md` before touching framework code.
- Update the same doc when changing framework contracts, widget APIs, palette resolution, layout behavior, docking, Basta lifecycle, or backend routes.
- Treat `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-Clipping.md` as the authoritative doc for `scrollViewport`, clipped-region behavior, shared scrollbar drawing, viewport wheel/drag handling, and viewport-aware resize floors.

### Layout Engine

- Layout maps are declarative trees; object-valued config keys can be mistaken for child regions unless added to reserved keywords.
- Hashes prevent rebuilds. Every parameter that changes visible output must be represented in the appropriate hash.
- `width: "match"` depends on height and can temporarily measure at fallback size during early passes.
- PASS 1 measures at `SQUISH_WIDTH = 10`; high `minWidth` values can inflate the whole layout.
- Derp nodes default to manual width; only explicit `properties.autoWidth = true` opts into auto width. Missing `autoWidth` must be treated like `false` in layout, docking, and resize paths.
- Height Mode ownership now has two layers: node preference and dock-aware runtime behavior. Child nodes should write Height Mode changes through the shared Fatha height-policy helper, while docking/resize code decides when vertical stacks temporarily force manual runtime height.
- If Auto height must stay tightly packed but Manual height must bottom-pin a trailing control group, branch the node layout map on `resolveDerpRuntimeAutoHeight(node)` and include that runtime mode in the layout hash. A single spring layout cannot satisfy both surplus-ownership rules without moving the visible gap between sections.
- For docked vertical-stack nodes, runtime `autoHeight` can be false while the user's saved/preferred Height Mode is Auto. Content shrink/grow settlement after node-local collapses, row hides, or removals must use preferred Auto height as well as runtime Auto height; otherwise nodes can expand from content pressure but fail to shrink after content is hidden.
- System panel height selection is one shared Height Mode FILEBROWSER. Standard nodes expose Auto/Manual; clipped nodes should provide `getDerpHeightModeConfig()` instead of adding separate viewport-height controls.
- Use `_forceSync`, `_layoutDirty`, and `_derpAwakeFrames` deliberately for recompute and animation wakeups.
- Whole-wall/passive caches can hide correct widget state; inspect cache keys when visuals revert unexpectedly.
- Do not y-anchor a child row to its own parent region when the row's inset must be independent of the parent's outer margins. The layout engine resolves y anchors from the target bottom plus the target bottom margin, so self-anchored rows can change internal top spacing when the parent becomes first/middle/last in a stack.
- Vertical springs use `height: "fill", minHeight: 0` in a column parent. For bottom-aligned content (loader row, notes picker, etc.), use the **two-sibling derpNotes pattern**: (1) an anchored fill container holding the top content + spring, and (2) a flow auto sibling holding the bottom content. The engine's top-level fill-rebalance pass recalculates anchored fill heights from actual measured sibling dimensions, so the spring pushes bottom content to the node bottom in Manual mode and collapses to 0 in Auto mode. Reserve footer gap space with `this.properties.footerHeight = 6 + mH` (matching derpNotes pattern) so the system button does not overlap bottom content. Fill-height column parents (non-`scrollViewport`) expand to contain their children during measurement like CSS `min-content`; do not work around this by wrapping fill regions in extra auto-height wrappers.
- `minHeight: 0` must use explicit `!== undefined` checks, never truthy/falsy — `0 || 12` silently falls back to 12px, breaking spring collapse. Check all code paths (fill floor, sibling estimate, column fill) for the `minHeight || 12` pattern.
- Fill rebalance is **top-level only** (`!isChild` guard). Nested fills inside anchored containers do NOT get rebalanced — the spring inside an anchored fill container works because it has no subsequent auto siblings, so its fill height is exact. Running rebalance at nested levels breaks ImageDeck and other complex nodes. Keep the rebalance scope narrow.
- `totalHeight = contentMinHeight` is the critical safety net for deck pressure. `contentMinHeight` is measured in PASS 1 at zero parent height, where all fills collapse to their `minHeight`, so deck pressure always sees the true content minimum and never inflates to fill heights.
- `_childConfigs` must be stored on every region during processing (`currentRegion._childConfigs = children`). Never iterate `Object.keys(region)` to find children — you'll pick up computed props like `x`, `y`, `w`, `h`, `_config`, etc. All reflow, rebalance, and contentMinHeight recursion must use `_childConfigs`.
- `contentMinHeight` must recursively walk into ALL children (including fill-height parents) because auto-height children inside collapsed fill parents still overflow below the fill region's tiny height. The true minimum node height is the maximum bottom of all nested content, not just the parent's direct children.
- Resize min-height (`getVerticalResizeTargetMinHeight`) must include header height and `footerHeight` in the compact floor calculation. Anchored fills in PASS 1 don't push flow siblings down, so just summing direct children misses header/footer and allows shrinking into content.
- Content viewport scrollbar gutter is not intrinsic content width. Keep PASS 1 rigid width in `layout.intrinsicContentMinWidth`, then publish gutter-adjusted `layout.contentMinWidth` afterward. Otherwise cached clipped viewport passes can add the same gutter repeatedly and make horizontal `Fit Node` stacks grow wider after each refresh.
- `scrollViewport` support has both a layout half and a renderer half. Full Fatha and Uncle both use `masterLayoutEngine`, but Uncle has its own draw loop; when viewport clipping works in Fatha but not an Uncle node, check `js/fatha/uncle.js` for `getContentViewportGeometry(...)`, `withContentViewportClip(...)`, and `drawContentViewportScrollbars(...)` wiring before patching the child node.

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
- Focused EDITOR outside-click blur consumes clicks outside the host node, but same-node clicks on another interactive region should blur first and then pass through to that region.
- Title editing uses the in-place header editor; do not add Basta wrappers for node title editing.

### FileBrowser and Dropdowns

- Keep FileBrowser refactors under `js/herbina/widgets/helpers/`.
- Do not decorate persisted dropdown values. Use object items such as `{ value: "canvas", display: "* canvas" }` when display text differs from stored value.
- Signal picker FILEBROWSER items should carry the stable signal id in `value` and the colorized/user-facing text in `label`; do not parse decorated labels as the data contract.
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

For docking, stack resize, Deck Pressure, and Node 2.0 compatibility work, read `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-Docking.md` first and keep the full behavior contract there. Keep this section as an operational index of the sharp edges agents most often trip over.

- Isolate Node 2.0/Vue compatibility behind `isComfyVueNodesMode()` or dedicated compatibility helpers; use `setDerpNodeSizeCompat(node, w, h)` for real graph nodes and do not apply graph-node size rules to Basta overlays.
- Treat ImageDeck Deck Pressure as the owner of hub/branch geometry. Avoid generic normalization, resize-axis helpers, or `forceDockResizeRefresh()` on hub seams; `applyDeckPressureLayout()` is the source of truth.
- Resolve branch operations from branch topology and branch-only member lists, not mixed Deck group membership or transient live x/y ordering. This applies to shared-edge resize, collapse/uncollapse, pressure fitting, and horizontal/vertical normalization.
- Keep resize affordances and resize execution in sync. DOM shield hitboxes, cursors, seam ghosts, and JS resize handlers should share the same eligibility helpers so handles do not appear for rejected resize paths.
- Preserve user-owned size intent during live stack resize: collapsed headers stay compact, active seam members stay pinned to seam-assigned dimensions, vertical width locks use the resize-type-specific rules, and manual/Fit Node members must not be forced through auto-height settlement.
- Deck Pressure side branches need stable frame ownership: preserve the hub frame during side seams, cache left/right vertical branch widths on the hub, keep horizontal side branches expanded, and do not let transient `layout.contentMinWidth` or scrollbar gutters resize the whole Deck.
- Left/right vertical Deck Pressure branches must resolve runtime width from the cached side-band width before content floors. Otherwise clipped viewport content can lay out wider after side-seam release, then Deck Pressure snaps the physical node back and leaves content pushed outside the node.
- Manual-height Deck Pressure side stacks should preserve current member heights during idle pressure layout when they already fit the side band; pressure fitting may clamp/refit over-tall stacks but must not distribute spare height into manual members after harmless refreshes.
- Active ImageDeck/Deck Pressure frame height resize must fit left/right vertical side branches to the live frame height both up and down from current heights; non-height active hub resize should still preserve branch heights against accidental compression.
- Fresh manual seam-fit preservation in Deck Pressure side branches must compare against the raw side-band target before pressure-min expansion; otherwise a valid seam-resized child below pressure min can bounce back on mouse release.
- Live Deck Pressure side-width seam resize is width-only for left/right vertical branches: preserve raw pixel member heights through the live drag and release-time idle pressure pass, clamping only to real per-member minimums. Do not snap-round this height snapshot; a tiny raw-frame edge correction (<= half a snap) may be applied so non-snap ImageDeck frame heights keep lower Deck corner handles active. Larger spare height must not be redistributed. Frame height resize clears the side-height snapshot.
- In `vertical_sandwich`, top/bottom Deck Pressure branch height is structural frame height. If a preserved left/right side-height snapshot is short by exactly that top/bottom contribution, absorb that difference into the side stack so lower outer corners and frame resize handles stay attached to the composed Deck frame.
- Deck Pressure side stacks may distribute heights on the snap grid, but their final physical edge must match the raw frame edge. A fractional frame such as `741.59` cannot leave the last side node ending at `740`, because the 1px corner tolerance then flattens theme corners and hides lower frame resize handles.
- Left/right Deck Pressure vertical branch seams are height-resizable even when branch members preserve preferred Auto Height. The ImageDeck side band owns their live fitted heights while docked; keep ordinary auto-height vertical stacks blocked.
- Full Fatha and Uncle draw loops must both preserve `properties.nodeSize` during live vertical stack/Deck Pressure seam resize. If only `size` is pinned, later pressure/layout passes can read stale auto-measured `nodeSize` and flicker preferred-auto branch members.
- `_pressedRegionKey` is only a Deck Pressure active/filler-selection signal. Saved-height regrowth must be gated by `_deckPressureActiveUntil`; otherwise ordinary loader row clicks can redistribute side-branch heights.
- Content viewport and clipped-node resize floors belong in `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-Clipping.md`; use `minClipHeight` / `_contentViewportMinClipHeight` for viewport-backed floors and preserve viewport scroll targets across transient measurement passes.
- Active pointer paths should avoid per-move dirty/layout/shield churn. Prefer live size sync with silent/deferred options and batched shield sync; otherwise stack resizing becomes jumpy and one-frame flicker is easy to reintroduce.
- Deck Pressure side-branch resize-start priming must use branch-aware member lists, not ordinary `isLinearDeckGroup()` checks against the mixed ImageDeck group. Keep DOM-shield helper changes local and avoid exporting shield internals just to test branch resize behavior.
- If a docking lesson needs more than one or two sentences, move the full rule to `FRAMEWORK-Docking.md` and keep only a short pointer here.

### Node-Specific Notes

- Derp-owned frontend `beforeRegisterNodeDef` guards must use exact backend class names. Fuzzy checks like `includes("modelloader")` or `includes("imagedeck")` can hijack third-party nodes with similar class names.
- `derpSignalOut` refresh can be throttled; force refresh for one-shot source title changes.
- Indexed wireless transmitter IDs use `${baseId}:${index}` and should write complete signal records into `window.xcpDerpSignals`.
- Bypassed indexed wireless outputs should emit empty strings.
- LoRA stack signal descriptors can reference upstream `model_id` / `clip_id` entries in `DERP_LIVE_REGISTRY`; backend fallback resolution must guard against descriptor cycles instead of relying on Python recursion depth.
- Base loader descriptors should not set `model_id` / `clip_id` to their own wireless output id. Those fields mean upstream source ids for composed descriptors; self-references make chained LoRAStack fallback resolution cyclic.
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
- For node optimization work, read `D:\_AI_KnowledgeBase\derp-UI\framework\FRAMEWORK-Optimization.md` first, then the matching framework docs for Fatha, Uncle, Basta, Herbina, docking, clipping, or node-specific behavior.
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

---

## Testing

Run `npm test` after touching layout/measurement/theme-resolution code. Write a regression test when fixing a bug in a pure function where the symptom is invisible in common cases but breaks in edge cases (long titles, specific dock arrangements, viewport states).

The test suite targets pure functions (`interpretLayoutProps`, `_calculateReservedWidth`, `resolvePaintData`, `measureTextWidth`, Deck Pressure helpers, string-color pipeline) — not canvas/DOM rendering or gesture handling. See the `run-tests` skill for mock patterns and infrastructure.
