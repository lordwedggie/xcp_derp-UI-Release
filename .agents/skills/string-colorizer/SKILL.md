---
name: string-colorizer
description: Modify display strings and add or change color-key tokens in source code. Use whenever the user asks to change the text or label of a widget or node, add colored text to a node UI, insert {{keyName}} palette color-key tokens into a string, adjust color-key state suffixes or display text overrides, or when any node layout-map text/value field needs updating. Also use when the user mentions "color key", "color-code a string", "colored label", or "semantic text color" without specifying a palette file edit.
---

# String Colorizer

Use this skill when the user wants to edit a display string in the codebase — either its plain text content, or adding/changing `{{keyName:stateSuffix:::displayText}}` color-key tokens that pull palette colors into that string.

## Source Access Assumption

This skill is for source-level string edits in JS/Python/node files. For palette JSON file edits, use the **update-palette** skill instead.

## The Color-Key Token Format

```
{{keyName:stateSuffix:::displayText}}
```

All three parts after `keyName` are optional:

| Token | Meaning |
|---|---|
| `{{t_text_error}}` | Colorize with `t_text_error` palette entry, default state `_OFF` |
| `{{t_text_error:_ON}}` | Use `_ON` state from the palette entry |
| `{{t_text_error:::"Oh no"}}` | Display "Oh no" instead of the raw token text |
| `{{t_text_error:_DIS:::"N/A"}}` | `_DIS` state, display "N/A" |

Tokens can mix with plain text: `"Status: {{t_text_warning:::"⚠"}} Low memory"`

The regex that parses them (`COLOR_KEY_REGEX` in `js/herbina/utils/widgetsUtils.js`):

```
/\{\{([a-zA-Z0-9_]+)(?::(_[A-Z]+))?(?:::([^}]*))?\}\}/g
```

- Group 1: `keyName` — the palette entry name (e.g. `t_text_error`, `t_text_accent`)
- Group 2: `stateSuffix` — `_ON`, `_OFF`, or `_DIS` (defaults to `_OFF` when absent)
- Group 3: `displayText` — what the user sees (defaults to the raw token string when absent)

## Where Color Keys Appear

Color-key tokens can live in any string that passes through the widget rendering pipeline:

1. **Layout map `text`/`value` fields** — the most common location. Any `text` or `value` property on a TEXT, BUTTON, LABEL, or TITLE widget in a node's `refreshNodeLayoutMap()` return value.

2. **Locale strings** — `locales/en-US.json` and `locales/zh-CN.json` entries that will be displayed through widgets.

3. **Basta panel strings** — text rendered inside Basta overlays (system messages, tooltips, palette manager, etc.).

4. **Widget config `label`/`displayText`** — direct widget configuration objects passed to `resolveWidgetEnv`.

5. **Tooltip strings** — tooltip text in `fathaLayoutMaps.js` or Basta tooltip panels. Tooltip color keys resolve through the host node's category-aware string palette.

## The Resolution Pipeline

When a string containing `{{}}` tokens passes through the widget system:

```
string with {{tokens}}
    ↓
resolveWidgetEnv(node, config)           — called at the top of every widget sync path
    ↓
parseColorKeyText(text, node, stateSuffix, fallbackColor, palette)
    ↓
resolveColorKey(node, keyName, tokenState, palette)   — for each {{}} token
    ↓  → getNodeStringPaletteContext → getNodeStringPaletteData → findPalettePaint
    ↓  → resolvePaletteEntry → buildPaletteSegmentPaint
    ↓  → window.xcpActivePalette fallback
    ↓  → resolveExactColorKeyPaint final fallback
    ↓
returns { segments: [{text, color, effects}, ...], hasColorKeys: true }
    ↓
Canvas path: masterPainterText(segments) — draws colored segments on canvas
DOM path:    colorSegmentsToHTML(segments) — builds <span> HTML
```

Key rule from AGENTS.md: **Never call `resolveColorKey` directly from widget code.** Always use `parseColorKeyText` with `{{}}` tokens. The `{{}}` path handles palette lookup, state resolution, *and* text effects in one call.

## Editing a Plain String to Add Color Keys

When the user asks to add color to a string that currently has no `{{}}` tokens:

### Step 1: Find the string

Search the node's `refreshNodeLayoutMap()` return value for the `text` or `value` field being displayed. Also check locale files if the string comes from `tLocale(...)`.

### Step 2: Confirm the palette entry

The user should specify which palette entry to use (e.g. `t_text_accent`, `t_text_error`, `t_text_warning`, `t_text_highlight`). If they haven't, ask — or infer from context (error state → `t_text_error`, success → `t_text_accent`).

### Step 3: Wrap the text

Wrap the portion that should be colored in `{{keyName}}...{{/keyName}}`... no — wrap it as `{{keyName:::displayText}}`. The display text is the visible part; the token itself is invisible after parsing.

Example: changing `"Status: Low memory"` to color "Low memory" red:

```js
// Before
text: "Status: Low memory"

// After  
text: "Status: {{t_text_error:::"Low memory"}}"
```

If the entire string should be colored, the whole thing becomes one token:

```js
text: "{{t_text_accent:::"Ready"}}"
```

### Step 4: Consider state suffixes

By default, tokens use `_OFF` state. If the text should respond to widget state (e.g., active/pressed → `_ON`, bypassed/disabled → `_DIS`), add the state suffix:

```js
text: "{{t_text_accent:_ON:::"Active"}}"    // uses _ON state always
```

If the widget's `config.pulseStates` is `true`, `btnSimple` and `textLabel` will animate between `_ON`/`_OFF`/`_DIS` segment colors automatically — you don't need to manage state switches manually.

### Step 5: Ensure the downstream widget handles segments

Most widgets (`btnSimple`, `btnIcon`, `textLabel`, `derpEditor`, `ToggleV2`, `Trigger`) already pass `colorSegments` and `hasColorKeys` through `resolveWidgetEnv` → `parseColorKeyText` and render them via `masterPainterText` (canvas) or `colorSegmentsToHTML` (DOM).

Check that your target widget type is in this list. If the widget's draw/DOM sync code doesn't have a `hasColorKeys` branch, the token will render as raw `{{...}}` text — you'll need to add segment support to that widget. For BUTTON widgets using `btnSimple`, segment support is already built in.

## Changing Existing Color Keys

When the user wants to change an existing color key's palette entry, state suffix, or display text:

1. **Find the token** — search the node's file(s) for `{{` to locate the exact token.
2. **Change the keyName** — to point at a different palette entry.
3. **Change the state suffix** — to use a different state (`_ON` / `_OFF` / `_DIS`).
4. **Change the display text** — if the visible text should differ.
5. **Do not change the plain text outside the token** unless the user asked.

Example: changing `{{t_text_warning:::"⚠"}}` to use error color instead:

```js
// Before
text: "{{t_text_warning:::"⚠"}} Something"

// After
text: "{{t_text_error:::"⚠"}} Something"
```

## Removing Color Keys

When a toggle or mode disables color-key behavior:

- **Remove the `{{}}` tokens entirely** from the string, not just the keyName.
- Do NOT keep tokens and only change a `labelColor`/`btnColor` override — color-key tokens override plain paint overrides, so the token would still render colored.
- Restore the plain display text that was inside the `:::` displayText override.

```js
// Before (colored)
text: "{{t_text_accent:::"Ready"}}"

// After (plain, no color)
text: "Ready"
```

If the token had no displayText override (`{{t_text_error}}`), the raw token string was invisible anyway — just remove it.

## String Changes That Span Locale Files

If the string being edited comes from a locale lookup (`tLocale("someKey")` in layout maps, or `window.xcpLocaleText["someKey"]` elsewhere):

1. Edit the corresponding entry in **both** `locales/en-US.json` and `locales/zh-CN.json`.
2. The Chinese translation should be a proper translation, not a copy of the English.
3. Color-key tokens can appear inside locale strings — they resolve through `parseColorKeyText` the same way.

## Node-Specific: When Text Affects Hashes

Many nodes use hash-based caching to skip layout rebuilds. When you change a `text`/`value` field that appears in a hash key, that hash must include the new text or the change won't take visual effect.

Common hash patterns to check:

- Whole-wall caches (ImageDeck, LoraStack, TriggerWall) — the full wall hash must include the string
- `_compDataCache` keys — per-widget compiled data caches
- Layout map hashes — `_layoutHash` or similar regeneration guards

If the node uses whole-wall passive caching and the changed text appears inside a `canvasShield` EDITOR widget, follow the AGENTS.md "Whole-Wall Passive Cache and Editor Updates" rule: directly mutate `editor.text/value`, `reg.text/value`, `_compDataCache[key].text/value`, `el._config.text/value`, and set `el._lastStateHash = null`.

## Basta-Specific: Color Keys in Basta Panels

Basta panels render in screen space and use the same `resolveWidgetEnv` → `parseColorKeyText` pipeline. When adding color keys to a Basta's display text:

- Basta handlers that change a property affecting the host node's main layout must also call `refreshNodeLayoutMap()` on the host — not just refresh the Basta's own layout.
- Color keys in Basta tooltips resolve through the host node's category-aware string palette.

## Locale i18n Convention

New user-visible strings (including those with color keys) need locale entries in both `locales/en-US.json` and `locales/zh-CN.json` unless the surrounding code intentionally uses dynamic/user-provided text. Do not add references to missing locale files.

## What NOT to Do

- **Do not** call `resolveColorKey(node, keyName, state)` directly from widget code. Always go through `parseColorKeyText` with `{{}}` tokens.
- **Do not** add `labelColor`/`btnColor` overrides alongside color-key tokens expecting the override to win — tokens take priority.
- **Do not** leave tokens in place when a mode/toggle should disable color keys. Remove the tokens.
- **Do not** edit palette JSON files when the task is to change source-code strings. Use **update-palette** for palette file edits.
- **Do not** add color keys to strings rendered by widgets that lack segment support without also adding `hasColorKeys`/`colorSegments` handling to that widget.

## Typical Workflow

1. Identify which node's layout map or widget config contains the target string.
2. Read that file to see the current `text`/`value` and surrounding context.
3. Confirm the desired palette entry with the user (or infer from context).
4. Edit the string — add, change, or remove `{{}}` tokens as requested.
5. If locale strings are involved, update both `en-US.json` and `zh-CN.json`.
6. Check whether the node uses hash-based caching and update hashes if needed.
7. If the node uses whole-wall passive caching, follow the direct-mutation pattern from AGENTS.md.

## Reporting Back

When using this skill, report:

- Which file(s) were edited and at what line(s)
- The before/after string
- Which palette entry the token references
- Whether locale files were also updated
- Any hash/cache concerns addressed
