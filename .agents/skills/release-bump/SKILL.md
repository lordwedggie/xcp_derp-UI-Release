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

## Workflow

1. Read current version from `pyproject.toml` (`[project] version = "X.Y.Z"`) and `package.json` (`"version": "X.Y.Z"`). Confirm they match.
2. Ask the user what the new version should be (or infer from context if they already told you, e.g. "release 0.8.0").
3. Update the version in both files:
   - `pyproject.toml`: `version = "X.Y.Z"` → new version
   - `package.json`: `"version": "X.Y.Z"` → new version
4. Re-read both files to verify the version is correct.
5. Check `CHANGELOG.md` — the `## [Unreleased]` section should have entries. Do NOT modify CHANGELOG.md; the user handles that. Warn if the Unreleased section appears empty (likely an oversight).
6. Stage and commit both files: `chore: bump version to X.Y.Z`.
7. Push to the dev remote: `git push github daily-development`.
8. Push to the release remote: `git push release daily-development`.
   - If the release remote uses a different branch name, use `git push release daily-development:<branch-name>`.
9. Verify both pushes landed with `git log --oneline github/daily-development -1` and `git log --oneline release/daily-development -1`.

## Remotes

| Remote | URL | Purpose |
|--------|-----|---------|
| `github` | `git@github.com:lordwedggie/xcpDerpNodes.git` | Dev repo |
| `release` | `git@github.com:lordwedggie/xcp_derp-UI-Release.git` | Public release (excludes private files) |

## Notes

- The Comfy Registry publish action triggers on push to `main`. If you need to trigger a registry publish, merge `daily-development` into `main` and push — but only do this when the user asks.
- The release remote should be configured to exclude private files (`.gitattributes` or server-side filtering). If the user hasn't set this up, remind them.
