# Syncing & Multi-Agent Safety Plan

> **Status:** Draft — for review tomorrow
> **Date:** 2026-06-22

## Problem

Monkeycode (remote AI via Syncthing) committed broad checkpoint changes to `daily-development`. Syncthing synced those to the user's main worktree, silently overwriting uncommitted working-tree files. Features developed locally but never committed were lost. 61 `.sync-conflict-*` files were created (all whitespace-only, no recoverable content).

## Root Cause

Multiple writers to `daily-development` + Syncthing bidirectional sync + uncommitted working-tree = silent data loss.

## New Rules

### 1. Hermes is the single committer

Only Hermes commits to `daily-development`. Not monkeycode, not Orca, not the user directly.

### 2. Monkeycode → read-only

- Add `.stignore` entries to exclude `js/`, `python/`, `derp_docs/` from monkeycode's Syncthing sync
- Monkeycode can still read the repo via `git pull` from the `github` remote
- Monkeycode writes go to `.monkeycode/` only

### 3. Orca → isolated branches

- Orca (Codex, OpenClaude) works in its own worktree on `orca/<task>` branches
- Orca NEVER touches `daily-development`
- Merging Orca's changes: `git merge orca/<task>` from the main worktree
- No fetch/push needed — worktrees share one `.git`

### 4. Commit discipline

- Commit before stepping away from the keyboard
- Uncommitted working-tree = vulnerable to any sync or concurrent write
- `git stash` is a valid temporary save

## Worktree Quick Reference

```
Main worktree:  E:\Stable_Diffusion\ComfyUI-Easy_CU130_Developer\ComfyUI\custom_nodes\xcp_derp-UI\
Orca worktrees: E:\Stable_Diffusion\ComfyUI-Easy_CU130_Developer\ComfyUI\worktrees\orca\
Hermes worktree: E:\Stable_Diffusion\ComfyUI-Easy_CU130_Developer\ComfyUI\worktrees\hermes\
Codex worktree:  E:\Stable_Diffusion\ComfyUI-Easy_CU130_Developer\ComfyUI\worktrees\codex\
```

All worktrees share one `.git` directory. A commit in any worktree is immediately visible in all others. Never check out the same branch in two worktrees.

## Agent Responsibility Matrix

| Agent | Works In | Branch | Commits? | Syncthing? |
|---|---|---|---|---|
| Hermes | Main worktree | `daily-development` | Yes | No |
| You | Main worktree | `daily-development` | No (delegate to Hermes) | Yes (read) |
| Monkeycode | Remote via Syncthing | N/A | No | Read-only, `.monkeycode/` only |
| Orca/Codex | Orca worktree | `orca/<task>` | Yes, its own branch | No |
| Orca/OpenClaude | Orca worktree | `orca/<task>` | Yes, its own branch | No |

## Recovery

- 61 `.sync-conflict-*` files deleted (2026-06-22)
- Committed features intact (`ae981eb3`, `65a94189`, etc.)
- Uncommitted working-tree features lost (PromptBook scrollbar/zoom, LoRA custom-slider _ON state) — must be re-implemented
