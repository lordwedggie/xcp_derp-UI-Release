---
name: release-bump
description: Bump the version in pyproject.toml and package.json, verify CHANGELOG, commit, and push to both dev and release remotes. Use when the user says "release", "bump version", "publish", or asks to cut a new release.
---

# Release Bump

Bumps the project version across both config files, commits, and pushes to the dev and release remotes.

## Private Files (excluded from release)

These files must never appear in the release remote:

- `js/motha/themeManagerV2.js`
- `js/motha/themeManagerV2_core.js`
- `python/derpThemeManagerV2.py`
- `.deepseek/`
- `derp_docs/_development/`
- `derp_docs/.obsidian/`

## Workflow

1. **Sync docs to root**: Copy authoritative copies from `derp_docs/` to project root, fixing relative links for the new location.
   - `derp_docs/README.md` → root `README.md`
   - `derp_docs/CHANGELOG.md` → root `CHANGELOG.md`
   - Fix links: the authoritative copies in `derp_docs/` use paths WITHOUT the `derp_docs/` prefix (e.g. `ControlDeck Nodes/Derp Latent.md`). When copying to root, ADD `derp_docs/` prefix so links resolve correctly from root (e.g. `derp_docs/ControlDeck Nodes/Derp Latent.md`). Similarly, `_assets/` → `derp_docs/_assets/`.
   - Verify the root copies look correct (no broken links, no `../` references that shouldn't exist).
2. Read current version from `pyproject.toml` (`[project] version = "X.Y.Z"`) and `package.json` (`"version": "X.Y.Z"`). Confirm they match.
3. Ask the user what the new version should be (or infer from context if they already told you, e.g. "release 0.8.0").
4. Update the version in both files:
   - `pyproject.toml`: `version = "X.Y.Z"` → new version
   - `package.json`: `"version": "X.Y.Z"` → new version
5. Re-read both files to verify the version is correct.
6. Check `CHANGELOG.md` — the `## [Unreleased]` section should have entries. Warn if the Unreleased section appears empty (likely an oversight).
7. **Promote CHANGELOG `[Unreleased]` → `[X.Y.Z]`**: In `derp_docs/CHANGELOG.md` (authoritative), rename the `## [Unreleased]` header to `## [X.Y.Z] - YYYY-MM-DD`. Add a new empty `## [Unreleased]` section above it so future changes land in the right place. Sync the root copy: `Copy-Item derp_docs/CHANGELOG.md CHANGELOG.md -Force`.
8. Stage and commit all changed files: `chore: bump version to X.Y.Z`.
9. Push to the dev remote: `git push github daily-development`.
10. Push to the release remote: `git push release daily-development`.
    - If the release remote uses a different branch name, use `git push release daily-development:<branch-name>`.
11. Verify both pushes landed with `git log --oneline github/daily-development -1` and `git log --oneline release/daily-development -1`.

## Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `github` | `git@github.com:lordwedggie/xcpDerpNodes.git` | Dev repo |
| `release` | `git@github.com:lordwedggie/xcp_derp-UI-Release.git` | Public release (excludes private files) |

## Notes

- The Comfy Registry publish action triggers on push to `main`. If you need to trigger a registry publish, merge `daily-development` into `main` and push — but only do this when the user asks.
- The release remote should be configured to exclude private files (`.gitattributes` or server-side filtering). If the user hasn't set this up, remind them.
