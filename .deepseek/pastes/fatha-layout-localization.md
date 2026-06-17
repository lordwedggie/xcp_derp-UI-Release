# fathaLayoutMaps.js — Tooltip Localization Rules

Last updated: 2026-05-27

## Core Rule

`masterLayoutEngine` only auto-localizes `text`, `label`, and `measureText`. It does **not** auto-localize `toolTip`. Every tooltip in `js/fatha/helpers/fathaLayoutMaps.js` must be wrapped with `tLocale(key, fallback)`.

## Correct Pattern

```js
toolTip: tLocale("$fatha_layout.tooltips.undock_node", "Disconnect this node from its docked stack")
```

## Reference Implementation

Follow `derpLatent` (in the derps) as the pattern for tooltip localization.

## Rules

1. For every new or changed tooltip in `fathaLayoutMaps.js`, wrap it with `tLocale(key, fallback)`.
2. Use locale keys under `$fatha_layout.tooltips.*`.
3. Always update both locale files together:
   - `locales/en-US.json`
   - `locales/zh-CN.json`
4. Do not hardcode final tooltip text in the layout config unless it is the fallback inside `tLocale(...)`.

## Verification

After editing, verify there are no remaining patterns like:
```js
toolTip: "$..."
```
They should all be:
```js
toolTip: tLocale(...)
```
