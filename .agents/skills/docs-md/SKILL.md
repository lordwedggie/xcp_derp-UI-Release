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

## CHANGELOG Section Colors

Use inline HTML `<span>` — NO CSS snippets. Apply per-section colors via regex split:

| Section | Hex | Preview |
|---------|-----|---------|
| Added | `#80ffc0` | teal |
| Changed | `#80aaff` | blue |
| Fixed | `#ffc680` | orange |
| Removed | `#ff8080` | red |

**Headers:** `### <span style="color: #XXXXXX">SectionName</span>`
**Bold entries:** `- <span style="color:#XXXXXX"><strong>Title</strong></span>: description`

**To color all sections at once** (PowerShell):
```powershell
$c = [System.IO.File]::ReadAllText("derp_docs/CHANGELOG.md")
$sections = [regex]::Split($c, '(?=^### )', 'Multiline')
$out = @()
foreach ($s in $sections) {
    if ($s -match 'Added</span>')      { $s = $s -replace 'color: ?#?\w+', 'color: #80ffc0' }
    elseif ($s -match 'Changed</span>') { $s = $s -replace 'color: ?#?\w+', 'color: #80aaff' }
    elseif ($s -match 'Fixed</span>')   { $s = $s -replace 'color: ?#?\w+', 'color: #ffc680' }
    elseif ($s -match '^### Removed$')  { $s = $s -replace '^### Removed$', '### <span style="color: #ff8080">Removed</span>'; $s = [regex]::Replace($s, '(?m)^(- )\*\*(.+?)\*\*', '$1<span style="color:#ff8080"><strong>$2</strong></span>') }
    $out += $s
}
[System.IO.File]::WriteAllText("derp_docs/CHANGELOG.md", ($out -join ''))
```

**New entries** should be written directly with `<span>` + `<strong>` format from the start. Do NOT use plain `**text**` and color it later — write colored from the beginning.

## Sync to Root (for release)

When publishing a release:
1. Copy `derp_docs/README.md` → root `README.md`
2. Copy `derp_docs/CHANGELOG.md` → root `CHANGELOG.md`
3. Fix relative links: strip `derp_docs/` prefix from internal links. Update `_assets/` paths to `derp_docs/_assets/`.
4. Run control-character cleanup on both root copies.