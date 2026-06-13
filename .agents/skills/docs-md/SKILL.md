---
name: docs-md
description: Maintain and repair README.md and CHANGELOG.md files. Clean control characters, sync authoritative copies between derp_docs/ and root, fix broken arrows and paths. Use when the user mentions corrupted docs, broken CHANGELOG characters, FF/BS diamonds, or syncing docs for publishing.
---

# Docs MD — README & CHANGELOG Maintenance

## Authoritative Source

`README.md` and `CHANGELOG.md` are maintained in `derp_docs/`. Root copies are publication-only mirrors.

## Cleanup — Control Character Repair

When Obsidian or any renderer shows white diamonds with `?` (U+FFFD) or red `FF`/`BS` icons, do byte-level repair:

| Symptom | Bytes | Fix |
|---------|-------|-----|
| Red `FF` icon, missing `f` in `fatha` | `0x0C` (form feed) | Replace with `0x66` (`f`) |
| Red `BS` icon, missing `b` in `basta` | `0x08` (backspace) | Replace with `0x62` (`b`) |
| White diamond `?` replacing `→` | `0xEF 0xBF 0xBD` (U+FFFD) | Replace with `0xE2 0x86 0x92` (`→`) |

Use byte-level replacement — PowerShell `[IO.File]::ReadAllBytes` / `WriteAllBytes`. String-level `-replace` is unreliable for control characters.

## Format

- Each version (including `[Unreleased]`) has at most `### Added`, `### Changed`, `### Fixed`.
- No duplicate section headers. Merge into existing sections.
- No double blank lines within sections.
- Arrows use `→` (U+2192), not `->`, `→`, or `?`.
- Paths: `fatha` and `basta` should render correctly — verify after any file move or encoding change.

## Sync to Root (for release)

When publishing a release:
1. Copy `derp_docs/README.md` → root `README.md`
2. Copy `derp_docs/CHANGELOG.md` → root `CHANGELOG.md`
3. Fix relative links: strip `derp_docs/` prefix from internal links. Update `_assets/` paths to `derp_docs/_assets/`.
4. Run control-character cleanup on both root copies.
