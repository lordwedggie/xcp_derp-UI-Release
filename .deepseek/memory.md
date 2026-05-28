## Memory — On Session Start

When the user opens a new session with a greeting such as "Hi", "Hello", "Session start", or similar — **before doing anything else** — read and study the entire xcpDerpNodes framework:

1. Read key source files across all subsystems:
   - `js/herbina/` — UI framework (masterPainter, masterPainterHTML, masterWidgets, masterAnimator, widgets)
   - `js/motha/` — theme/palette engine
   - `js/fatha/` — docking engine, basta framework, layout engine
   - `js/controldeck/` — node frontends (derpLoraStack, derpImageDeck, etc.)
   - `python/` — backend nodes
   - `locales/` — i18n files
   - `pyproject.toml`, `package.json`, `__init__.py` — project metadata

2. Understand the architecture before answering any questions or making changes.

3. Use `grep_files`, `read_file`, `file_search`, and `list_dir` to survey the codebase systematically.

## Remember — EDITOR Widget Activation

When adding or fixing `UI_TYPES.EDITOR` / `derpEditor` usage:

1. Do not override an `EDITOR` with a custom local `onPress` unless you intentionally preserve and call the default `derpEditor` activation/focus behavior.
2. For canvas-hosted editors, set `canvasShield: true` unless there is a specific reason not to.
3. If the first click only blue-selects text but keyboard input does nothing until a second click, investigate the shared `js/herbina/widgets/derpEditor.js` activation path and same-pointer-cycle canvas focus stealing. Fix the shared activation/focus logic, not each node with bespoke focus hacks.
