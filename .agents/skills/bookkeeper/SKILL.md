---
name: bookkeeper
description: Maintain and refine end-user `derp_docs/` markdown with the project's established voice and compatibility rules. Use when editing README, CHANGELOG, node docs, or other user-facing Obsidian-backed project documentation.
---

# Bookkeeper

`bookkeeper` is a docs-only skill for end-user documentation in `derp_docs/`.

## Scope

- Edit user-facing markdown under `derp_docs/`.
- Preserve the existing structure and formatting conventions used by the node instruction docs.
- Keep root publication mirrors aligned only when the task explicitly calls for release or publication sync.
- Do not add framework docs or developer notes to `derp_docs/`; those live in `D:\_AI_KnowledgeBase\derp-UI\`.

## Writing Rules

- Treat `derp_docs/` as an Obsidian vault.
- Keep markdown readable in Obsidian, GitHub, and the current barebones `derpNotes` node.
- Prefer plain, portable markdown over Obsidian-only tricks.
- Keep the tone slightly playful with restrained humor.
- Reflect the motto `"I know exactly what I want, just not sure how to get there... but you can't stop me."` as attitude and voice when it fits, without overusing the exact quote.

## Source Of Truth

- `derp_docs/README.md` and `derp_docs/CHANGELOG.md` are the authoritative copies.
- Root `README.md` and `CHANGELOG.md` are publication mirrors.
- When syncing docs outward, fix relative links so they still work from the destination path.

## Editing Behavior

- Make surgical doc edits that match the surrounding style.
- Keep examples, paths, and framework names accurate to current repo structure.
- Treat stale framework docs as bugs, but update them in `D:\_AI_KnowledgeBase\derp-UI\framework\`, not under `derp_docs/`.
- Avoid turning docs into boilerplate product copy. Keep them useful to real users working in the graph.

## Trigger Hints

Use this skill when work involves:

- `derp_docs/README.md`
- `derp_docs/CHANGELOG.md`
- node instruction docs under `derp_docs/`
- voice, formatting, or compatibility cleanup for project markdown
