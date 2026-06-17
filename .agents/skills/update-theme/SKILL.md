---
name: update-theme
description: Update many theme JSON keys from one or a few hand-crafted exemplar keys. Use when editing theme files under `user/derpNodes/Themes/`, especially when propagating a handcrafted `canvas` key, tuning `_ON/_OFF/_DIS` base colors, or scaling one theme language across many related theme keys.
---

# Update Theme

Use this skill when the user has manually crafted one or a few theme keys and wants that design logic propagated across the rest of a theme or across related theme files.

## Source Access Assumption

Use this skill as if the agent cannot inspect the framework source code.

Everything below is the minimum framework model needed to work on theme files safely without opening runtime JS files.

## Core Intent

Theme is the foundation layer.

Palette works on top of theme to replace colors selectively when needed, while preserving the theme's underlying structure.

This skill exists to expand a hand-crafted theme language safely across many theme keys without flattening the theme's character or damaging the key structure.

## Required Design Brief

Before editing, confirm the theme's intended high-level goal:

- category direction: `Light`, `Neutral`, or `Dark`
- visual intensity direction: clean, nearly monochromatic, or very vibrant

If the user did not state those goals clearly, ask before editing.

Treat this brief as the design target that guides `canvas`, `_layout`, text scale, and color decisions.

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

Theme JSON stores colors as RGBA arrays.

Design thinking in this repo is usually HSVA or HSLA first.

When the user describes theme color work, interpret it mainly in hue, saturation, and lightness or value terms, then write the final result back as RGBA arrays.

Treat RGBA as storage, not as the main design language.

## Common Color Strategy

For many theme keys, especially `canvas`, header-adjacent surfaces, and major containers:

- choose hue first
- then decide saturation
- then decide lightness or value

Many related keys will intentionally share similar saturation and lightness or value, with hue doing most of the variation work.

## Warm Hue Exception

Warm hues from roughly violet-purple through orange-yellow often need different handling.

Keeping the exact same saturation and lightness or value as cooler hues can make these warmer tones feel too dark, muddy, or dirty.

In this repo's preferred style, warmer hues often want:

- more brightness or value
- more saturation

This remains a preference pattern rather than an exact formula. Learn it from the user's existing hand-crafted themes and keep refining the skill's color instincts over time.

## Theme Priority Rule

For theme work, start with the `canvas` key first.

`canvas` is the anchor of the whole theme because it establishes:

- whether the theme reads as `LT`, `NE`, or `DK`
- the baseline saturation level
- the baseline transparency level
- the overall tonal attitude of the theme

If `canvas` is wrong, the rest of the theme will drift even when individual keys look locally correct.

## Next Priority After Canvas

After `canvas`, the next most important layer is the sizing system:

- `_layout`
- text-key `font`
- text-key `fontSize`

These settings work together to determine how large or compact a themed node feels.

Treat them as a coordinated system, not isolated knobs.

In normal theme work, text sizes should move as a family.

Typical rule:

- big themes use a consistently larger text scale
- compact themes use a consistently smaller text scale

Avoid mismatched size hierarchies like one medium key, one oversized key, and one tiny system key unless the user explicitly wants a special-case design.

## Theme Model In This Repo

- Theme files live under `user/derpNodes/Themes/`.
- Themes contain top-level metadata such as `Category`, `_layout`, and optional `_palette`.
- Visual keys like `canvas`, `button`, `buttonNode`, `dialog`, `panel`, `region`, `systemBackground`, `systemButton`, and text keys such as `t_textNormal` each define their own state colors and effect data.
- `_layout` controls the shared margin, spacing, and padding rhythm that strongly affects perceived node size.
- Text keys such as `t_textBig`, `t_textNormal`, `t_textSmall`, and `t_textSystem` define the font family and font scale for the whole theme.

## What Theme Actually Controls

Theme is the structural styling layer for Derp UI.

Theme controls:

- base surface colors for node regions
- state colors through `_ON`, `_OFF`, `_DIS`
- corners
- stroke behavior
- shadow behavior
- glow behavior
- fonts
- font sizes
- layout rhythm through `_layout`

Theme does not primarily exist to enumerate every alternate color variation. That is where palettes come in.

Palette can replace theme colors selectively later, while keeping the theme's structure and effect logic intact.

## Theme Metadata

At the top level, expect these important fields:

- `Category`
- `_layout`
- `_palette`

Meaning:

- `Category` tells the runtime whether the theme is fundamentally `Light`, `Neutral`, `Dark`, or fallback `Other`.
- `_layout` is the shared spacing and size rhythm.
- `_palette` attaches a palette file to the theme for palette-driven overrides.

Preserve these carefully.

## Key Categories

Think of theme keys in three groups.

### 1. Major container keys

These establish the major surfaces of a node:

- `canvas`
- `header`
- `button`
- `buttonNode`
- `dialog`
- `panel`
- `region`
- `systemBackground`
- `systemButton`

These keys usually carry fill, corners, stroke, shadow, and glow behavior.

### 2. Text keys

These define typography and text color behavior:

- `t_textBig`
- `t_textNormal`
- `t_textSmall`
- `t_textSystem`

These usually matter for:

- font family
- font size
- font weight
- text color in `_ON`, `_OFF`, `_DIS`

Text keys are part of the theme's size system, not just decoration.

### 3. Optional override keys

Some themes may also include special override-style keys for specific widget paths, such as picker or slider-specific variants. Preserve them unless the task directly targets them.

Typical key structure:

```json
"canvas": {
  "_ON": [0, 0, 0, 0.3],
  "_OFF": [0, 0, 0, 0.2],
  "_DIS": [0, 0, 0, 0.1],
  "corners": [4, 4, 2, 2],
  "shadow": [1, 2, 4, "rgba(0,0,0,0.15)"],
  "shadow_ON": [0, 0, 0, 0.2],
  "shadow_OFF": [0, 0, 0, 0.1],
  "shadow_DIS": [0, 0, 0, 0.05],
  "stroke": [0.5, 1, "rgba(255,255,255,0.1)"],
  "stroke_ON": [255, 255, 255, 0.3],
  "stroke_OFF": [255, 255, 255, 0.2],
  "stroke_DIS": [255, 255, 255, 0.1],
  "glow": [0, 0, 8, "rgba(255,255,255,0)"],
  "glow_ON": [255, 255, 255, 0.3],
  "glow_OFF": [255, 255, 255, 0.1],
  "glow_DIS": [0, 0, 0, 0]
}
```

## How Runtime Resolution Works In Practice

Use this simplified mental model:

1. A widget asks for a theme key.
2. The theme provides the base `_ON`, `_OFF`, `_DIS` colors and effect settings.
3. If a palette is attached, some color portions may later be replaced by palette entries.
4. The theme still remains the source of structure, sizing, corners, and effect physics.

Practical consequence:

- when editing themes, think in terms of foundational surfaces and structure
- when editing palettes, think in terms of selective color replacement on top of that structure

## How `_layout` Affects Node Size

`_layout` is one of the strongest determinants of perceived theme size.

Treat it as the shared rhythm for things like:

- outer margins
- inner padding
- spacing between sections
- general compactness versus airiness

The exact numeric slot meanings live in the framework, and this skill does not require memorizing each index by source code. The safe practical rule is:

- if the user wants a larger, roomier theme, `_layout` usually grows together with text scale
- if the user wants a compact theme, `_layout` usually shrinks together with text scale

## How Text Scale Affects Node Size

The text keys are part of the same size system as `_layout`.

Together, these control whether a node feels:

- large
- compact
- balanced

Do not design text-key sizes independently from `_layout`.

## What To Preserve

Unless the task explicitly targets them, preserve:

- `Category`
- `_layout`
- `_palette`
- key names
- key ordering
- any existing optional override keys
- geometry arrays such as `corners`, `stroke`, `shadow`, `glow`

## Theme Editing Mental Model

When working without source access, use this order of thought:

1. What category should this theme read as: Light, Neutral, or Dark?
2. Should it feel clean, nearly monochromatic, or vibrant?
3. Does `canvas` establish that correctly?
4. Do `_layout` and the text keys agree on size?
5. Do the other container keys feel like siblings of `canvas`?
6. Do text keys stay readable on top of those surfaces?
7. Do effect colors still feel derived from the main fills?

## Safe Workflow

1. Read `derp_docs/FRAMEWORK-Motha.md` and `derp_docs/FRAMEWORK-ThemePalette.md` if needed.
2. Confirm the category direction and visual intensity goal if they are not already explicit.
3. Read the exemplar key or keys the user crafted by hand.
4. Start with `canvas` if the request affects the overall theme language.
5. If the theme's scale is part of the request, set `_layout` and the text-key font scale next.
6. Keep text sizes coherent across `t_textBig`, `t_textNormal`, `t_textSmall`, and `t_textSystem`.
7. Infer the main `_ON/_OFF/_DIS` pattern.
8. Propagate that logic to sibling keys.
9. Derive `stroke_*`, `shadow_*`, and `glow_*` from the established main colors.
10. Preserve metadata, key names, ordering, and unrelated keys.
11. Re-read the touched sections and verify structural validity.

## Editing Rules

- Keep edits surgical.
- Preserve `Category`, `_layout`, and `_palette` unless the task explicitly targets them.
- Preserve key names and ordering unless reordering is part of the request.
- Preserve geometry values like `corners`, `stroke`, `shadow`, and `glow` parameter arrays unless the exemplar clearly changes those too.
- When changing theme size, update `_layout` and text-key font sizes as a coordinated set.
- Keep `t_textBig`, `t_textNormal`, `t_textSmall`, and `t_textSystem` in a coherent size family.
- Change the main `_ON/_OFF/_DIS` colors first.
- Only then update `stroke_*`, `shadow_*`, and `glow_*` to match the new color logic.
- Do not force all keys to numerically match `canvas`; each key can carry the same language with different intensity and contrast.

## Pattern Inference Heuristics

- `canvas` establishes the theme's category feel and should guide the rest.
- `_layout` and text-key sizes establish whether the theme feels large or compact.
- Many related theme keys share saturation and lightness or value, while hue carries most of the personality shift.
- `button`, `dialog`, `panel`, and `region` usually inherit the same tonal family with different contrast and opacity.
- `buttonNode` often needs stronger contrast than ordinary surfaces because header controls must stay readable.
- Text keys should preserve readability against the new `canvas` and container surfaces.
- Text-key sizes usually move together; avoid random scale inversions unless the theme is a deliberate special case.
- Warm hues often need extra brightness and sometimes extra saturation compared with cooler-hue translations.
- Light themes often lean on darker shadow/stroke logic for separation.
- Dark themes often lean on brighter stroke/glow logic for separation.
- Neutral themes should stay balanced rather than drifting too far toward light or dark drama.

## Good Targets For Propagation

- `canvas` to the other container keys
- one text-key family to sibling text keys
- one polished button surface to related button surfaces
- one header treatment to the rest of the header-adjacent keys

## Bad Update Behavior

Avoid these failure modes:

- tuning glow before the main colors are right
- changing one text key to a wildly different size family while leaving the others behind
- changing `_layout` toward a compact theme while text sizes still imply a large theme
- copying `canvas` values verbatim into every other key
- changing metadata while doing a color-only task
- flattening light, neutral, and dark themes into the same visual attitude
- editing text keys without checking readability against the updated surfaces

## Review Checklist

Before finishing, verify:

- every touched key still has valid `_ON`, `_OFF`, and `_DIS` arrays where expected
- the main colors read correctly for the intended category
- `_layout` and text-key sizes agree on whether the theme should feel large or compact
- effect colors still look derived from the main colors
- readability still makes sense for text keys against the surrounding surfaces
- metadata and unrelated keys did not drift

## Reporting Back

When using this skill, report:

- which exemplar key or keys were treated as source of truth
- whether `canvas` was used as the theme anchor
- whether `_layout` and text-key sizes were used to set the overall size system
- which files were updated
- which theme key families were changed
- how the main color logic was propagated
- how stroke, shadow, and glow were derived from the main colors

## Example Use Cases

- “I hand-tuned the `canvas` key. Propagate that language across the rest of the dark theme.”
- “Use this handcrafted `button` key and make the rest of the interactive keys match it.”
- “I fixed the main states on `canvas` and `dialog`. Update the rest of the theme around them.”
