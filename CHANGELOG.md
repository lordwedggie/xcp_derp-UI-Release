# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **new labelParts layoutMap parameter**: Parsed display strings can be configured at different width and properly displayed in the picker now. Godamn I'm so an*l about these things...

### Fixed
- **Horizontal docking height collapse**: Nodes of different heights would collapse the taller node when docked horizontally (e.g., derpDiffusionLoader docked to derpSeedV2). Root cause was dual: (1) `fitSizesToTotal` initialized `assigned = minTotal` which double-counted minimums, causing single-node columns to receive `totalHeight - min` instead of the full target height. Changed to `assigned = 0`. (2) `applyColumnLayout`/`applyRowLayout` called `syncDeckNodeSize` non-silently, triggering an immediate `refreshNodeLayoutMap` that recalculated autoHeight and overwrote the normalized shared height. Changed to `{ silent: true }`.
- **Fixed mouse hit detection is punching through the picker in widget_FileBrowser**

### Fixed
- **README video now actually exists in the repo**: The `<video>` tag was there but the `.mp4` file was MIA. Now it's actually tracked.

## [0.7.5] - 2026-06-06

### Fixed
- **Fixed Image widget's border not matching actual image's height (always a little bit taller).**
- **Clear buttons on all loader nodes now use `_OFF` state instead of `_ON`**: They looked like active toggles instead of neutral clickable buttons. Now they sit quietly until hovered.
- **Fixed Vertical Stack and derpImageDeck's bottom edge anchor handling so they do not shift positions after page refreshes**: Anchor calculations now correctly account for resized layouts after page reload, preventing docked stacks and image decks from drifting downward on every refresh.
- **Fixed derpSignalOut not sending out correct seed signals when derpSeed switches from fixed to increment mode**: Seed signals now properly re-evaluate the registry for live complex types (MODEL/CLIP/VAE) instead of caching stale scalar values, fixing increment-mode seed broadcasts going silent after switching modes.
- **Critical bug causing some signal types (Diffusion model) to return 'None', causing Comfy runtime error**: derpSignalOut now properly raises descriptive errors for unresolved diffusion/text encoder signals instead of silently passing None. signalDictionaryDefault also raises FileNotFoundError instead of None when models can't be found, preventing silent downstream crashes.

### Added
- **Added ZIT samplers profile for derpSamplerLoader**
- **NE_Full_v01 palette**: Bright/neutral full palette with header and canvas entries for all loader nodes, scaled ~1.6× from the dark variant for readability on neutral themes.
- **Canvas support for attached theme palettes**: Nodes can now have automatically applied header and body colors by node type (derp nodes only).
- **Added padding overwrite for derpPromptBook's multiline editor**: Now it looks slightly better.
- **VRAM clearing for Diffusion Loader**: derpDiffusionLoader now clears VRAM when switching between diffusion models, just like derpModelLoader. Toggle in system 
panel, default on.

### Changed
- **bastaPalette FILEBROWSER now sorts entries by name instead of ID**: Palette entries in the key dropdown are now alphabetically sorted by name, falling back to ID for ties.

## [0.7.4] - 2026-06-05

### Fixed
- **NODE 2.0 right-click context submenu is broken**: Added (fake) derp context menus so now paletteExtender and bypassExtender are both working again in NODE 2.0.
- **Docked stack overlay bug (one whole day of pain)**: Rare edge case where vertically and horizontally docked nodes would completely overlap — two nodes sitting at the exact same position like one sad ghost. Root cause: `normalizeSharedEdgePair` in the dock engine was using only the two seed nodes to calculate `totalHeight`, ignoring non-seed members in multi-column dock groups. Fixed by taking the max height across ALL column members.

### Added
- **Canvas Color Palettes**: ComfyUI's Color Palette system, now with easier loading — just pick a profile and go. Two default profiles included. No more spelunking through nested menus just to change the damn grid color.
- **DerpNodes is now compatible with Node 2.0**: Full compatibility with ComfyUI's Vue-based Node 2.0 rendering — DOM shields, event pass-through, and native shell suppression all adapted for the new architecture.
- **Multi-Color-Key Text Framework**: Every widget now supports `{{keyName}}` syntax in text strings for per-segment color from themes or palettes. Extended syntax supports `{{key:_ON::displayText}}` for state-specific coloring with custom display text. Framework-level — all widgets inherit automatically via `resolveWidgetEnv`.
- **Two-color trigger display in derpLoraStack**: Trigger names render in `_ON` state colors, trigger tags in `_OFF` state colors, both in the collapsed trigger and the picker dropdown.
- **bastaSystemMessage color-key support**: System messages now detect `{{...}}` in message text and render colored segments via `colorSegmentsToHTML`.

### Changed
- `masterPainterText` upgraded with optional `segments` parameter for per-segment colored Canvas rendering.
- `resolveWidgetEnv` now auto-parses display text for color keys and returns `colorSegments` + `hasColorKeys`.
- Cleaned up dead `widget_Dropdown` remnants from `derpLoraStack.js`.

### Added
- Major refactor of `xcp_file_server.py` — the very long messy file server code now lives in dedicated route modules (`xcp_file_asset_routes.py`, `xcp_file_categories.py`, `xcp_file_common.py`, `xcp_file_image_routes.py`, `xcp_file_json_routes.py`, `xcp_file_prompt_book_routes.py`).
- Added Diffusion model loader for ZIT, Wan, and Flux.
- Added CHANGELOG.md to keep versioned change logs.
- Added parallax effect to background image pan and zoom. Added five background images and 3 ComfyUI appearance Color Palette themes.
- Added background CSS image display. Select it in the derp global settings panel. Background images are stored in `user/derpNodes/background`.

## [1.0.2] - 2026-05-24

### Fixed
- `__init__.py` now safely handles the absence of `derpThemeManagerV2` via try/except, preventing import crashes when the module is excluded from release builds.

## [1.0.1] - 2026-05-24

### Added
- **i18n**: Full UI translations for English, Chinese, and Russian across all widgets, system messages, and confirmation dialogs.
- **Tooltips**: Widget tooltips via `toolTip` property in layout maps, supported across the UI framework.
- **Prompt Book**: Trigger-style clean button for resetting new prompt-book pages.

### Fixed
- **Docking**: Vertical docked-stack width sync bug corrected; page-refresh no longer disrupts vertical stack auto-height reflow.
- **derpEditor**: Padding corrected in cutoff mode.
- **derpImageDeck**: Restored stable expanded height on uncollapse; icons rendered at correct size.
- **LoRA Tools**: Renaming a LoRA now renames its preview image and sidecar files together; confirmation dialogs routed through bastaSystemMessage; new trigger names default to the current LoRA basename.
- **Signal / Corners**: Refactored signal handling and corner cap/radius application across `derpSignalOut`, `fathaHandler`, and `masterPainter`.

### Changed
- Removed unused prompt books and their assets; added new bundled themes (Derp Dark HD, Galactica Dark, Menace, Mono Neutral, NeonBlue Dark).
- `cnr_id` references cleaned up (removed fork-base Flux-Continuum references).