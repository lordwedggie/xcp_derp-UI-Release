# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **ICONBUTTON `iconColorKey` parameter**: New `iconColorKey` config property for icon buttons that accepts a palette/theme string color key (e.g., `"t_text_accent"`, `"t_text_error"`). Resolves the key through the full `{{}}` token pipeline (`parseColorKeyText` → `resolveColorKey`) with proper state suffix, effects (shadow/glow), and cache hash integration. Both HTML and canvas rendering paths supported.
- **derpEditor color-key text support**: Editor DOM now renders `{{keyName}}` color-key markup when not in editing mode, preserving palette-colored text display. `syncDerpEditorDomContent` uses `colorSegmentsToHTML` with per-segment text shadows. Raw/visible value tracking added for proper focus/blur transitions without losing markup.
- **derpSeedV2 color-key highlighting**: Active seed value uses `formatSeedHistoryDisplayText` wrapping in `{{t_text_highlight}}` tokens for the editor widget. `btnSeedControl` mode text uses `{{t_text_warning}}` color key. Execute button (▶) uses `iconColorKey: "t_text_accent"`. Stop button (⏹) uses `iconColorKey: "t_text_error"`.
- **derpSeedV2 Color Overlay toggle**: New `toggleColorKey` TOGGLE_V2 in system panel `sysCustomRegion`. When ON (default), active seed value uses `t_text_highlight` palette color (via `labelColor` override on EDITOR), mode text uses `{{t_text_warning}}`, execute button uses `t_text_accent`, stop button uses `t_text_error`. When OFF, all color keys are stripped — plain text and default button glyphs. `seedDisplayText` wrapper gates `formatSeedHistoryDisplayText` to omit `{{t_text_highlight}}` tokens when toggle is off.
- **derpEditor stateHash cache hardening**: `safeConfig.text`, `labelColor`, and `btnColor` now included in the editor widget state hash, ensuring cache invalidation when only color overrides change (no geometry/layout shift).

### Changed
- **derpImageDeck system panel**: Option row margins tightened, `lblInfo` hidden.
- **Framework color-key string palette support**: Fatha/Uncle nodes now attach a per-node string palette context for color-key text, defaulting to `_system/_defaultTheme.json`; `derpSignalOut` face labels now use `t_text_warning` (signal names), `t_text_accent` (node IDs), `t_text_highlight` (signal types), and `t_text_error` (orphaned signals) segments. Orphaned signal rows and the signal picker both use color-key labels. LoRA trigger dropdown items use `t_text_highlight` for trigger names.
- **Color-key text state pulsing**: `btnSimple` now supports `pulseStates`, `pulseFromState`, and `pulseToState` config — when enabled, color-key text is parsed in both states and each segment's color is interpolated via `getPulsedColor`, producing animated per-segment pulsing between two palette states. Works for both canvas and HTML rendering.
- **Loader node registration**: `DerpLoraStack`, `DerpModelLoader`, `DerpDiffusionLoader`, and `DerpVaeLoader` now registered as loader nodes (`🔞 derpNodes/Loaders` category) alongside existing `derpSamplerLoader` and `derpSchedulerLoader`, so ComfyUI's loader menus pick them all up.
- **Slider theme and geometry customization**: Each slider now supports `fillbarHeight` (1.0 = full height, scales down proportionally) and `knobWidthScale` (1.0 = default, scales knob diameter). New themeKey `#slider_btnLR` for left/right increment button styling. Fillbar renders with separate `sliderFillbarData` paint data independent of the active track. `FILLBAR_MARGIN` and `BTN_LR_HEIGHTOFFSET` constants for visual fine-tuning. Layout structure hash updated to include fillbar/knob geometry.
- **new labelParts layoutMap parameter**: Parsed display strings can be configured at different width and properly displayed in the picker now. Godamn I'm so an*l about these things...
- **derpImageDeck system panel**: Swapped option row order — autoFit/autoSave/imageFormat now above model/sampler/scheduler toggles. "Parse filename:" label added to option row 2. Node size editor (`editorNodeSize`) with center-aligned text displays current `W, H`, accepts new values on blur, clamped 200–2000 width / 100–2000 height. Auto-adjust height defaults to OFF on node creation.
- **derpConcatenate UI overhaul**: Collapse/expand button on each signal entry toggles preview visibility, with "add"/"subtract" icon reflecting state. Linebreak separator between header and content, hidden when collapsed. Concatenated output region also collapsable with matching button, linebreak, and margins. Signal source names use `t_text_accent` color-key labels in both dropdown and entry headers. Empty incoming signals display "Incoming signal is an {{t_text_error::empty string...}}" message. "Concatenated text:" header uses `t_text_highlight` color key. All localized (EN/ZH).

### Changed
- **Docked vertical stack auto-height is now opt-out**: When docking top/bottom, `lockDeckNodeAxes()` sets `autoHeight = false` to allow free manual height adjustment, but nodes can now opt out via `properties.deckForceAutoHeight = true` to keep automatic height after docking. (Due to failure to implement stack-node-stack docking. New idea is to use stack containers, but that's a lot of work so... we'll just allow manual placement for now.)
- **Palette effects are now opt-in per-toggle**: Palette entries no longer auto-hydrate missing `shadow`/`stroke`/`glow` effect keys with defaults. The Palette Manager's effect toggles now create default entries only when explicitly enabled; disabling a toggle omits that effect on save. `_defaultTheme.json` no longer carries auto-generated defaults.
- **derpImageDeck toggleAutoFit now locks the node at its current size**: Toggling auto-fit off now snapshots the current dimensions into `nodeSize`, clears the pinned anchor, and blocks `resizeNodeToImageAspect` from snapping to image dimensions. The deck stays put until you toggle auto-fit back on — no more phantom snapping after you've deliberately set a size.

### Removed
- **Legacy xcpDerpLoraLoader registration**: Removed from `__init__.py` — fully replaced by `derpLoraStack`. Stripped dead API routes (`get_civitai_url`, `fetch_lora_tags`, `open_lora_folder`, `open_lora_file_location`) from `xcpDerpLoraLoader.py` — these endpoints are now served by `xcp_file_server.py`. Cleaned unused imports. CATEGORY updated from `xcpDerpNodes` to `xcp_derp-UI`.

### Fixed
- **derpEditor performance and correctness**: Removed color-key DOM handling (`getDerpEditorVisibleText`, `syncDerpEditorDomContent`, `parseColorKeyText` imports) — color keys now handled by canvas renderer only. `innerText` replaced with `textContent` for value getter/setter, eliminating forced reflow. Focus/blur logic simplified, `_derpEditorDidInput` flag removed. Physical positioning uses `Math.round` instead of `Math.floor` to prevent sub-pixel drift.
- **Panel layout margins**: `fathaLayoutMaps` panel base map left margins zeroed (`mW` → `0`) to remove unnecessary left gutter. `mouseOver: false` added to `lblTheme`.
- **derpSeedV2 system panel**: History/log editors switched from `EDITOR_HTML` to `EDITOR` with `canvasShield`. Margins tightened. "Lucky Num" row removed.
- **derpSchedulerLoader / derpLoraStack**: Browser theming fixed (`dialog, t_textNormal` + `fontSize`), root name localized. `mouseOver: false` on dropdowns.
- **Node titles stuck in previous locale after switching languages**: Title localization now uses a default-title registry built from all available locale files. `syncDerpLocalizedDefaultTitle()` auto-replaces known default titles with the active locale's version on locale load, theme update, and node configure. Custom user-renamed titles (via double-click or settings text field) are flagged with `_derpCustomTitle = true` and excluded from auto-localization, so user edits survive locale switches.
- **Stack drag-and-drop click-vs-hold**: Every `onPress` handler in derpConcatenate now cancels any pending drag state via `cancelConcatStackDrag()` before executing its action, preventing stale drag timers from activating on subsequent clicks. Layout hash and `refreshNodeLayoutMap` calls are gated behind `_dragThresholdMet` so the hold period doesn't thrash the layout.
- **Regional `onDragEnd` dispatch**: `handleShieldDragStart` now saves the hit region key as `_dragEndRegionKey` when the region has drag handlers. `endDockDrag` dispatches `onDragEnd` to the correct region instead of relying solely on `_pressedRegionKey`, which could be stale when multiple regions were involved.
- **Wrapped text color-key rendering**: `textLabel` now slices color segments per-line via `getLineColorSegments()` / `sliceColorSegmentsByVisibleRange()`, so wrapped multi-line text with `{{key}}` markup renders per-line segment colors instead of getting `null` segments.
- **Orphaned derpSignalOut rows now pulse between DIS and ON states**: Orphan signal entries use color-key state pulsing (`pulseStates: true`) to animate between `_DIS` and `_ON` palette colors, making orphaned signals visually distinct from normal disconnected/broken states. Orphan face labels also render with `t_text_error` color-key markup.
- **LoRA trigger dropdown DIS state**: Trigger dropdowns now display as disabled when the LoRA has no triggers available, not just when bypassed. LoRA trigger items simplified to use `t_text_highlight`.
- **derpSignalOut defaults**: `showSlotNames` now defaults to `true` for new signal out nodes.
- **Signal picker label lookup**: Both plain and color-key label formats are now registered in `_signalLabelToId`, fixing signal selection when color-key markup is active.
- **derpSignalOut signal reference fallback**: Signal resolution now falls back to `this.activeOutputs[idx]` when `globalSignals[sigId]` doesn't contain the entry, validated via `isSignalInCurrentGraph`. Fixes orphaned signal references when the global signal registry and active output array get out of sync after node graph changes.
- **Color-key text rendering consistency**: Color-key markup is now stripped from text measurement/cutoff/shrink calculations, missing color-key entries no longer force fallback colors, and unresolved segments render through the normal layoutMap text paint path.
- **Per-segment text effects from palette string color keys**: Palette string color entries now carry per-segment `shadow`/`glow` effect colors alongside fill colors. `masterPainterText` applies per-segment shadow/glow passes using the segment's effect color with the theme text key's offset/blur physics. HTML `textLabel` and `btnSimple` map per-segment shadow/glow to CSS `text-shadow`. Missing effect keys on a palette entry disable that effect for the segment entirely. Segments now merge only when both fill color AND effects match.
- **Node 2.0 group-release dock drift**: Moving a default ComfyUI group containing Derp docked stacks no longer nudges already-aligned vertical or horizontal stacks on mouse release. Vue-mode dock maintenance now skips shared-height sync and normalization when docked edges are already geometrically aligned.
- **Image widget now shows a dark background fill behind images**: When `drawBackground` is enabled, the image widget now draws a semi-transparent black fill (`rgba(0,0,0,0.5)`) behind the image area before the paintData background. The `hideBackgroundWhenImage` flag on derpImageDeck has been removed so the background is always visible — no more empty transparent gaps when images load in.
- **System panel resize handles disabled**: System panels (`fathaSysPanel`) now have their resize handles hidden systemically via `disableResizeHandles()` in `syncDerpShield` instead of an ad-hoc inline `style.display = "none"` hack. The old ad-hoc code in `toggleDerpSysPanel` has been removed. System panels also get `resizable = false` for good measure.
- **Vertical dock resize min-height**: `syncDockResizePair` now uses `getDockNodeMinHeight` per-node instead of a shared `minH`, preventing taller nodes from being crushed below their minimum when resizing vertical dock pairs.
- **Pure vertical resize cursors**: Top/bottom shared-edge resize anchors now show `ns-resize` cursor and block horizontal width changes instead of using the corner resize cursor. No more diagonal cursors on purely vertical drags.
- **derpImageDeck height not snapping to 10px grid**: Height in `resizeNodeToImageAspect` now snaps via `Math.ceil / SNAP * SNAP`. Bottom edge anchoring snaps to grid coordinates so the bottom edge stays put after page refreshes and latent aspect ratio changes.
- **Horizontal docking height collapse**: Nodes of different heights would collapse the taller node when docked horizontally (e.g., derpDiffusionLoader docked to derpSeedV2). Root cause was dual: (1) `fitSizesToTotal` initialized `assigned = minTotal` which double-counted minimums, causing single-node columns to receive `totalHeight - min` instead of the full target height. Changed to `assigned = 0`. (2) `applyColumnLayout`/`applyRowLayout` called `syncDeckNodeSize` non-silently, triggering an immediate `refreshNodeLayoutMap` that recalculated autoHeight and overwrote the normalized shared height. Changed to `{ silent: true }`.
- **Fixed mouse hit detection is punching through the picker in widget_FileBrowser**
- **README video now actually exists in the repo**: The `<video>` tag was there but the `.mp4` file was MIA. Now it's actually tracked.

## [0.7.5] - 2026-06-06

### Added

- **ICONBUTTON `iconColorKey` parameter**: New `iconColorKey` config property for icon buttons that accepts a palette/theme string color key (e.g., `"t_text_accent"`, `"t_text_error"`). Resolves the key through the full `{{}}` token pipeline (`parseColorKeyText` → `resolveColorKey`) with proper state suffix, effects (shadow/glow), and cache hash integration. Both HTML and canvas rendering paths supported.
- **derpEditor color-key text support**: Editor DOM now renders `{{keyName}}` color-key markup when not in editing mode, preserving palette-colored text display. `syncDerpEditorDomContent` uses `colorSegmentsToHTML` with per-segment text shadows. Raw/visible value tracking added for proper focus/blur transitions without losing markup.
- **derpSeedV2 color-key highlighting**: Active seed value uses `formatSeedHistoryDisplayText` wrapping in `{{t_text_highlight}}` tokens for the editor widget. `btnSeedControl` mode text uses `{{t_text_warning}}` color key. Execute button (▶) uses `iconColorKey: "t_text_accent"`. Stop button (⏹) uses `iconColorKey: "t_text_error"`.

### Changed
- **derpImageDeck system panel**: Option row margins tightened, `lblInfo` hidden.
- **Added ZIT samplers profile for derpSamplerLoader**
- **NE_Full_v01 palette**: Bright/neutral full palette with header and canvas entries for all loader nodes, scaled ~1.6× from the dark variant for readability on neutral themes.
- **Canvas support for attached theme palettes**: Nodes can now have automatically applied header and body colors by node type (derp nodes only).
- **Added padding overwrite for derpPromptBook's multiline editor**: Now it looks slightly better.
- **VRAM clearing for Diffusion Loader**: derpDiffusionLoader now clears VRAM when switching between diffusion models, just like derpModelLoader. Toggle in system panel, default on.

### Changed
- **bastaPalette FILEBROWSER now sorts entries by name instead of ID**: Palette entries in the key dropdown are now alphabetically sorted by name, falling back to ID for ties.

### Fixed
- **Fixed Image widget's border not matching actual image's height (always a little bit taller).**
- **Clear buttons on all loader nodes now use `_OFF` state instead of `_ON`**: They looked like active toggles instead of neutral clickable buttons. Now they sit quietly until hovered.
- **Fixed Vertical Stack and derpImageDeck's bottom edge anchor handling so they do not shift positions after page refreshes**: Anchor calculations now correctly account for resized layouts after page reload, preventing docked stacks and image decks from drifting downward on every refresh.
- **Fixed derpSignalOut not sending out correct seed signals when derpSeed switches from fixed to increment mode**: Seed signals now properly re-evaluate the registry for live complex types (MODEL/CLIP/VAE) instead of caching stale scalar values, fixing increment-mode seed broadcasts going silent after switching modes.
- **Critical bug causing some signal types (Diffusion model) to return 'None', causing Comfy runtime error**: derpSignalOut now properly raises descriptive errors for unresolved diffusion/text encoder signals instead of silently passing None. signalDictionaryDefault also raises FileNotFoundError instead of None when models can't be found, preventing silent downstream crashes.

## [0.7.4] - 2026-06-05

### Added

- **ICONBUTTON `iconColorKey` parameter**: New `iconColorKey` config property for icon buttons that accepts a palette/theme string color key (e.g., `"t_text_accent"`, `"t_text_error"`). Resolves the key through the full `{{}}` token pipeline (`parseColorKeyText` → `resolveColorKey`) with proper state suffix, effects (shadow/glow), and cache hash integration. Both HTML and canvas rendering paths supported.
- **derpEditor color-key text support**: Editor DOM now renders `{{keyName}}` color-key markup when not in editing mode, preserving palette-colored text display. `syncDerpEditorDomContent` uses `colorSegmentsToHTML` with per-segment text shadows. Raw/visible value tracking added for proper focus/blur transitions without losing markup.
- **derpSeedV2 color-key highlighting**: Active seed value uses `formatSeedHistoryDisplayText` wrapping in `{{t_text_highlight}}` tokens for the editor widget. `btnSeedControl` mode text uses `{{t_text_warning}}` color key. Execute button (▶) uses `iconColorKey: "t_text_accent"`. Stop button (⏹) uses `iconColorKey: "t_text_error"`.

### Changed
- **derpImageDeck system panel**: Option row margins tightened, `lblInfo` hidden.
- **Canvas Color Palettes**: ComfyUI's Color Palette system, now with easier loading — just pick a profile and go. Two default profiles included. No more spelunking through nested menus just to change the damn grid color.
- **DerpNodes is now compatible with Node 2.0**: Full compatibility with ComfyUI's Vue-based Node 2.0 rendering — DOM shields, event pass-through, and native shell suppression all adapted for the new architecture.
- **Multi-Color-Key Text Framework**: Every widget now supports `{{keyName}}` syntax in text strings for per-segment color from themes or palettes. Extended syntax supports `{{key:_ON::displayText}}` for state-specific coloring with custom display text. Framework-level — all widgets inherit automatically via `resolveWidgetEnv`.
- **Two-color trigger display in derpLoraStack**: Trigger names render in `_ON` state colors, trigger tags in `_OFF` state colors, both in the collapsed trigger and the picker dropdown.
- **bastaSystemMessage color-key support**: System messages now detect `{{...}}` in message text and render colored segments via `colorSegmentsToHTML`.
- Major refactor of `xcp_file_server.py` — the very long messy file server code now lives in dedicated route modules (`xcp_file_asset_routes.py`, `xcp_file_categories.py`, `xcp_file_common.py`, `xcp_file_image_routes.py`, `xcp_file_json_routes.py`, `xcp_file_prompt_book_routes.py`).
- Added Diffusion model loader for ZIT, Wan, and Flux.
- Added CHANGELOG.md to keep versioned change logs.
- Added parallax effect to background image pan and zoom. Added five background images and 3 ComfyUI appearance Color Palette themes.
- Added background CSS image display. Select it in the derp global settings panel. Background images are stored in `user/derpNodes/background`.

### Changed
- `masterPainterText` upgraded with optional `segments` parameter for per-segment colored Canvas rendering.
- `resolveWidgetEnv` now auto-parses display text for color keys and returns `colorSegments` + `hasColorKeys`.
- Cleaned up dead `widget_Dropdown` remnants from `derpLoraStack.js`.

### Fixed
- **NODE 2.0 right-click context submenu is broken**: Added (fake) derp context menus so now paletteExtender and bypassExtender are both working again in NODE 2.0.
- **Docked stack overlay bug (one whole day of pain)**: Rare edge case where vertically and horizontally docked nodes would completely overlap — two nodes sitting at the exact same position like one sad ghost. Root cause: `normalizeSharedEdgePair` in the dock engine was using only the two seed nodes to calculate `totalHeight`, ignoring non-seed members in multi-column dock groups. Fixed by taking the max height across ALL column members.

## [1.0.2] - 2026-05-24

### Fixed
- `__init__.py` now safely handles the absence of `derpThemeManagerV2` via try/except, preventing import crashes when the module is excluded from release builds.

## [1.0.1] - 2026-05-24

### Added

- **ICONBUTTON `iconColorKey` parameter**: New `iconColorKey` config property for icon buttons that accepts a palette/theme string color key (e.g., `"t_text_accent"`, `"t_text_error"`). Resolves the key through the full `{{}}` token pipeline (`parseColorKeyText` → `resolveColorKey`) with proper state suffix, effects (shadow/glow), and cache hash integration. Both HTML and canvas rendering paths supported.
- **derpEditor color-key text support**: Editor DOM now renders `{{keyName}}` color-key markup when not in editing mode, preserving palette-colored text display. `syncDerpEditorDomContent` uses `colorSegmentsToHTML` with per-segment text shadows. Raw/visible value tracking added for proper focus/blur transitions without losing markup.
- **derpSeedV2 color-key highlighting**: Active seed value uses `formatSeedHistoryDisplayText` wrapping in `{{t_text_highlight}}` tokens for the editor widget. `btnSeedControl` mode text uses `{{t_text_warning}}` color key. Execute button (▶) uses `iconColorKey: "t_text_accent"`. Stop button (⏹) uses `iconColorKey: "t_text_error"`.

### Changed
- **derpImageDeck system panel**: Option row margins tightened, `lblInfo` hidden.
- **i18n**: Full UI translations for English, Chinese, and Russian across all widgets, system messages, and confirmation dialogs.
- **Tooltips**: Widget tooltips via `toolTip` property in layout maps, supported across the UI framework.
- **Prompt Book**: Trigger-style clean button for resetting new prompt-book pages.

### Changed
- Removed unused prompt books and their assets; added new bundled themes (Derp Dark HD, Galactica Dark, Menace, Mono Neutral, NeonBlue Dark).
- `cnr_id` references cleaned up (removed fork-base Flux-Continuum references).

### Fixed
- **Docking**: Vertical docked-stack width sync bug corrected; page-refresh no longer disrupts vertical stack auto-height reflow.
- **derpEditor**: Padding corrected in cutoff mode.
- **derpImageDeck**: Restored stable expanded height on uncollapse; icons rendered at correct size.
- **LoRA Tools**: Renaming a LoRA now renames its preview image and sidecar files together; confirmation dialogs routed through bastaSystemMessage; new trigger names default to the current LoRA basename.
- **Signal / Corners**: Refactored signal handling and corner cap/radius application across `derpSignalOut`, `fathaHandler`, and `masterPainter`.
