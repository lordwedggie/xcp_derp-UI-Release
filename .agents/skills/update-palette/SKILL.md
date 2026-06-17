---
name: update-palette
description: Update many palette entries from one or a few hand-crafted exemplar entries. Use when editing palette JSON files under `user/derpNodes/Palettes/`, especially `_DK_defaultTheme.json`, `_LT_defaultTheme.json`, `_NE_defaultTheme.json`, `_defaultTheme.json`, header palettes, or other large palette files with repeated entry patterns.
---

# Update Palette

Use this skill when the user has manually crafted one or a few palette entries and wants the same design logic propagated across many related entries or multiple palette files.

## Source Access Assumption

Use this skill as if the agent cannot inspect the framework source code.

Everything below is the minimum framework model needed to work on palette files safely without opening runtime JS files.

## Core Intent

The user's hand-crafted entries are the source of truth.

This skill exists to learn the pattern behind those entries and apply that pattern consistently across a larger palette surface without flattening the palette's character, destroying category differences, or rewriting unrelated entries.

## Required Design Brief

Before editing, confirm the palette's intended high-level goal:

- category direction: `Light`, `Neutral`, or `Dark`
- visual intensity direction: clean, nearly monochromatic, or very vibrant

If the user did not state those goals clearly, ask before editing.

Treat this brief as the design target that guides the hue family, saturation/value strategy, and how bold the sibling entries should become.

## First Principle

Always start from the main fill colors:

- `_ON`
- `_OFF`
- `_DIS`

Build every effect from those main colors.

- stroke derives from the main colors
- shadow derives from the main colors
- glow derives from the main colors

Do not start by tweaking effect colors in isolation.

## Color Working Language

Palette JSON stores color arrays as RGBA.

Design thinking in this repo is usually HSVA or HSLA first.

When the user describes color changes, interpret them primarily in hue, saturation, and lightness or value terms, then convert the result back into RGBA arrays for storage.

Treat RGBA as the save format, not the primary design language.

## Common Color Strategy

For many palette families, especially header-like and canvas-adjacent color groups:

- choose hue first
- then decide saturation
- then decide lightness or value

Many sibling keys will intentionally share similar saturation and lightness or value, with hue carrying most of the variation.

## Warm Hue Exception

Warm hues from roughly violet-purple through orange-yellow often need different handling.

Using the exact same saturation and lightness or value as cooler hues can make those warmer colors look too dark, muddy, or dirty.

In this repo's preferred style, warmer hues often want:

- more brightness or value
- more saturation

This is a preference pattern, not a rigid law. Use judgment from the user's existing hand-crafted entries.

Color theory here should be treated as a learned preference model, not an exact formula.

## Palette Model In This Repo

- Palette files live under `user/derpNodes/Palettes/`, especially `user/derpNodes/Palettes/_system/`.
- System palette files are full palette documents with this shape:

```json
{
  "effects": true,
  "palettes": [
    {
      "id": 8,
      "name": "t_text_error",
      "entries": {
        "main": { "_ON": [255, 0, 0, 1], "_OFF": [200, 0, 0, 1], "_DIS": [120, 80, 80, 0.2] },
        "glow": { "_ON": [255, 0, 0, 0.7], "_OFF": [255, 0, 0, 0.5], "_DIS": [120, 80, 80, 0.2] }
      }
    }
  ]
}
```

- Each item in `palettes` is one named palette entry.
- The `name` is the identity of the entry and must stay stable.
- `entries.main` is the primary color payload.
- `entries.shadow`, `entries.stroke`, and `entries.glow` are optional effect payloads.
- Missing effect sections are meaningful and should stay omitted unless the exemplar clearly establishes that the effect now belongs there.

## What Palette Actually Controls

Palette is the selective color-override layer that sits on top of theme.

Palette mainly controls:

- named color replacements
- semantic color families
- per-entry main colors
- optional per-entry effect colors

Palette does not define the whole widget structure. Theme remains the source of:

- shape
- layout scale
- corners
- effect geometry and behavior
- typography structure

Practical consequence:

- theme defines the foundation
- palette swaps or steers colors on top of that foundation

## The Four Important Palette Roles

In this repo, palette files commonly serve four practical roles.

### 1. String color keys

Entries such as these are semantic text colors used by color-key text rendering:

- `t_text_error`
- `t_text_warning`
- `t_text_accent`
- `t_text_highlight`

These are some of the most important palette entries because they drive semantic text color systems.

### 2. Header palette entries

Entries named like `header_<NodeType>` control per-node-type header color overrides.

Examples:

- `header_DerpSeedV2`
- `header_DerpLoraStack`

These override header color identity while the underlying theme still controls the structural shape and effect physics.

### 3. Generic named surface overrides

Some entries mirror container-like keys such as `button` or other named surfaces.

These act like color replacement buckets for specific theme-facing surfaces.

### 4. Special override entries

Some palette files also contain special-purpose entries such as tooltip-related keys or icon-button variants. Preserve them unless the task directly targets them.

## Category Files

For category-aware defaults, these files matter most:

- `user/derpNodes/Palettes/_system/_DK_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_LT_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_NE_defaultTheme.json`
- `user/derpNodes/Palettes/_system/_defaultTheme.json`

Interpret them like this:

- `DK` is the dark-category default string palette.
- `LT` is the light-category default string palette.
- `NE` is the neutral-category default string palette.
- `_defaultTheme.json` is the general fallback.

Do not collapse category-specific files into one shared look unless the user explicitly asks for that.

## How Runtime Resolution Works In Practice

Use this simplified mental model:

1. Theme provides the base structure and default colors.
2. A palette may be attached globally or per-theme.
3. Named palette entries selectively replace the theme's colors.
4. The theme still supplies structure, size, corners, and effect behavior.

Practical consequence:

- when editing palettes, focus on color families and semantic intent
- do not treat palette work as if it were redefining the whole theme system

## What `effects` Means

At the top level, palette files may include:

- `"effects": true`

This means the palette is allowed to override effect colors such as shadow, stroke, and glow when those entries exist.

If `effects` is absent or false, the theme's own effect colors may continue to dominate while the palette mainly changes the primary fill colors.

## What To Preserve

Unless the task explicitly targets them, preserve:

- top-level `effects`
- the `palettes` array structure
- each entry's `id`
- each entry's `name`
- entry ordering
- omitted effect sections
- unrelated palette families

## Palette Editing Mental Model

When working without source access, use this order of thought:

1. Is this palette for a Light, Neutral, or Dark goal?
2. Should it feel clean, nearly monochromatic, or vibrant?
3. Which exemplar entries express that goal best?
4. Which sibling entries belong to the same semantic family?
5. Should those siblings share saturation and value, with hue doing most of the differentiation?
6. Do warm hues need a brightness or saturation lift to avoid looking muddy?
7. Are any effect sections intentionally omitted and therefore worth preserving?

## What “Learn From The Hand-Crafted Entry” Means

When the user gives one or more fully crafted entries, infer and reuse:

- hue family
- value and saturation relationships between `_ON`, `_OFF`, and `_DIS`
- alpha relationships between states
- HSLA or HSVA relationships even when the stored file uses RGBA arrays
- whether glow/shadow/stroke exist at all
- effect intensity differences by state after the main colors are established
- light-vs-dark behavior if exemplars exist in multiple category files
- naming groups, such as `t_text_error`, `t_text_warning`, `t_text_accent`, `t_text_highlight`
- whether warmer hues were intentionally lifted brighter or more saturated than cooler siblings

Apply the pattern, not a blind copy.

## Safe Workflow

1. Read the relevant palette files first.
2. Confirm the category direction and visual intensity goal if they are not already explicit.
3. Identify the exact exemplar entries the user crafted by hand.
4. Identify the target family that should inherit the same logic.
5. Compare the exemplar to its sibling entries and category siblings.
6. Infer the main `_ON/_OFF/_DIS` rule in plain language before editing.
7. Update the intended main colors first.
8. Derive `stroke`, `shadow`, and `glow` behavior from those main colors.
9. Update only the intended entries.
10. Preserve `id`, `name`, entry order, file structure, and unrelated entries.
11. Re-read the edited section and verify that every touched entry still has valid RGBA arrays and expected effect sections.

## Editing Rules

- Keep edits surgical.
- Preserve JSON formatting style already used by the file.
- Preserve `id` values exactly.
- Preserve `name` values exactly.
- Preserve entry ordering unless the task explicitly includes reordering.
- Preserve omitted effect sections unless the exemplar proves they should exist.
- Change `main._ON`, `main._OFF`, and `main._DIS` first.
- Derive effect colors from the resulting main color logic.
- Do not normalize all files to identical numbers just because they are similar.
- Do not invent new palette entries unless the user asked for them.
- Do not change `effects` at the top level unless the task explicitly requires it.

## Pattern Inference Heuristics

Use these heuristics when scaling from a few entries to many:

- Within a category file, sibling semantic keys often share similar alpha curves.
- `t_text_error`, `t_text_warning`, `t_text_accent`, and `t_text_highlight` often differ more by hue than by structural state logic.
- Many sibling palette entries share saturation and lightness or value, while hue does most of the work.
- In dark palettes, `_ON` and `_OFF` often stay brighter, with lower disabled alpha.
- In light palettes, shadows may matter more and colors may darken rather than brighten for contrast.
- If one exemplar adds `shadow` in light mode, inspect whether sibling light-mode entries already use the same structure before propagating it.
- Warm hues may need to be brighter and sometimes more saturated than a direct cool-hue translation.
- If multiple exemplars are available, prefer the common rule across them over the most dramatic one.

## Good Targets For Bulk Update

- semantic text groups: `t_text_error`, `t_text_warning`, `t_text_accent`, `t_text_highlight`
- tooltip-related entries
- header palette families with repeated per-node structure
- icon button overrides that share the same visual language

## Bad Bulk Update Behavior

Avoid these failure modes:

- copying one entry verbatim onto unrelated semantic entries
- making dark, light, and neutral files numerically identical
- adding glow or shadow everywhere because one exemplar had it
- changing fallback `_defaultTheme.json` without checking category-specific files
- touching palette entries outside the requested family

## Review Checklist

Before finishing, verify:

- every edited state array still has four numbers
- `_ON`, `_OFF`, and `_DIS` remain present where expected
- effect sections remain structurally valid
- the edited entries still fit the category file they belong to
- category-aware defaults remain distinct where appropriate
- no unrelated palette entries changed

## Reporting Back

When using this skill, report:

- which exemplar entries were treated as source of truth
- which files were updated
- which target entry families were changed
- the rule that was inferred from the exemplar
- any category-specific differences you preserved deliberately

## Typical Execution Pattern

1. Read `derp_docs/FRAMEWORK-ThemePalette.md` and `derp_docs/FRAMEWORK-Motha.md` if the agent has not already done so in the session.
2. Read the exemplar palette entries and the matching target files.
3. Edit the smallest set of entries necessary.
4. Re-read the modified sections for verification.

## Example Use Cases

- “I fixed `t_text_error` and `t_text_warning` by hand in `_DK_defaultTheme.json`. Apply the same style logic to `t_text_accent` and `t_text_highlight`.”
- “Use these three hand-tuned entries as the basis for updating the light, dark, and neutral default text palettes.”
- “I crafted one header palette entry exactly how I want it. Propagate that structure across the sibling header entries without flattening their colors.”
