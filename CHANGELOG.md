# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
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
