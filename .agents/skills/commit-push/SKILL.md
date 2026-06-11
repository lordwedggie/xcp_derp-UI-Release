---
name: commit-push
description: Commit all current changes with a descriptive message, then push to github/daily-development. Use when the user says "commit", "push", "commit and push", or "commit push my changes".
---

# Commit & Push

Commits all working-tree changes and pushes to the primary dev remote.

## Workflow

1. Run `git status` to inventory changed files.
2. Run `git diff` on each changed file to understand the changes.
3. Group related changes into logical commits — one feature per commit, not one giant blob.
4. For each commit:
   - Write a descriptive conventional-commit message: `type: short description`.
   - For features, include a bullet-point body summarizing what changed.
   - `git add` only the files for that commit.
   - `git commit -m "..."`.
5. Push all commits: `git push github daily-development`.
6. Verify clean with `git status`. Skip `.obsidian/workspace.json` (editor state, not code).

## CHANGELOG

Do NOT update `CHANGELOG.md` unless the user explicitly asks for it. The user and other agents handle CHANGELOG entries manually.

## Remote

- Primary: `github` (SSH: `git@github.com:lordwedggie/xcpDerpNodes.git`)
- Fallback: `origin` (HTTPS) — usually out of sync, prefer `github`

## Commit Convention

| Prefix | When |
|--------|------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `chore:` | Maintenance (deps, config, version bumps) |
| `docs:` | Documentation only |
| `refine:` | Small UX/polish improvements |
| `tweak:` | Minor visual/numeric adjustments |
| `refactor:` | Code restructuring, no behavior change |

## Skipping

Always skip `derp_docs/.obsidian/workspace.json` — it's Obsidian editor state, not project code.
