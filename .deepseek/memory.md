## Memory — On Session Start

When the user opens a new session with a greeting such as "Hi", "Hello", "Session start", or similar — **before doing anything else** — read and study the entire xcpDerpNodes framework:

1. Read key source files across all subsystems:
   - `js/herbina/` — UI framework (masterPainter, masterPainterHTML, masterWidgets, masterAnimator, widgets)
   - `js/motha/` — theme/palette engine
   - `js/fatha/` — docking engine, basta framework, layout engine
   - `js/controldeck/` — node frontends (derpLoraStack, derpImageDeck, etc.)
   - `python/` — backend nodes
   - `locales/` — i18n files (en-US, zh-CN, ru-RU)
   - `pyproject.toml`, `package.json`, `__init__.py` — project metadata

2. Understand the architecture before answering any questions or making changes.

3. Use `grep_files`, `read_file`, `file_search`, and `list_dir` to survey the codebase systematically.

## Remember — EDITOR Widget Activation

When adding or fixing `UI_TYPES.EDITOR` / `derpEditor` usage:

1. Do not override an `EDITOR` with a custom local `onPress` unless you intentionally preserve and call the default `derpEditor` activation/focus behavior.
2. For canvas-hosted editors, set `canvasShield: true` unless there is a specific reason not to.
3. If the first click only blue-selects text but keyboard input does nothing until a second click, investigate the shared `js/herbina/widgets/derpEditor.js` activation path and same-pointer-cycle canvas focus stealing. Fix the shared activation/focus logic, not each node with bespoke focus hacks.

## Release Remotes

- `origin` — `https://github.com/lordwedggie/xcpDerpNodes` (HTTPS, often unreachable)
- `github` — `git@github.com:lordwedggie/xcpDerpNodes.git` (SSH, dev repo)
- `release` — `git@github.com:lordwedggie/xcpDerpNodes_release.git` (SSH, release repo — previously named `public` pointing to `derpNodes.git`, renamed 2026-05-30)

## Release Process — Use `release` remote

1. Bump version in `pyproject.toml` and `package.json` to X.Y.Z
2. **Verify the bump took effect** — read both files back from disk after writing
3. **Ensure __init__.py handles missing themeManagerV2** — the import must be wrapped in try/except
4. Strip excluded files: `git rm --cached js/motha/themeManagerV2.js js/motha/themeManagerV2_core.js python/derpThemeManagerV2.py` and `git rm --cached -r .deepseek/` and `git rm --cached notes.txt`
5. Ensure `.github/workflows/publish_action.yml` is present
6. Commit with message "release vX.Y.Z"
7. **Sync main FIRST**: `git push --force release daily-development:main`
8. Create tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`
9. Push tag: `git push release vX.Y.Z`
10. Push release branch: `git push release daily-development:refs/heads/release/vX.Y.Z`
11. Restore excluded files: `git add js/motha/themeManagerV2.js js/motha/themeManagerV2_core.js python/derpThemeManagerV2.py .deepseek/ notes.txt` and commit "restore excluded files to daily-development"
12. Push to dev: `git push --force-with-lease github daily-development`
13. **Verify**: confirm `release/main` pyproject.toml shows correct version, tag exists and points to same commit as main
