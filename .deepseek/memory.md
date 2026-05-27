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
