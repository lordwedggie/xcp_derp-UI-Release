# Multi-Color-Key Text System

Framework-level color-key interpolation for any widget text string.

## Syntax

| Pattern | Meaning |
|---------|---------|
| `{{keyName}}` | Color from `keyName` at current widget state, displays "{{keyName}}" |
| `{{keyName::displayText}}` | Color from `keyName` at current state, displays `displayText` |
| `{{keyName:_ON}}` | Color from `keyName` at `_ON` state, displays "{{keyName:_ON}}" |
| `{{keyName:_ON::displayText}}` | Color from `keyName` at `_ON` state, displays `displayText` |

## Color Resolution Order

1. Active palette entries (`window.xcpActivePalette.palettes[]`) — matched by name
2. Flat palette keys (`window.xcpActivePalette[key]`)
3. Theme paint data (`resolvePaintData(node, key, stateSuffix).fill`)
4. Fallback: current `labelPaint` color

## Usage Examples

### In widget labels
```js
{ type: "TEXT", text: "Seed: {{KSampler}} → {{VAE}}", themeKey: "t_textSmall" }
```
Renders "Seed: " in default color, "{{KSampler}}" in KSampler palette color, " → " default, "{{VAE}}" in VAE color.

### In LoRA trigger display
```js
_triggerDisplay: "{{t_textSmall:_ON::Full Trigger: }}actualTag"
```
Renders "Full Trigger: " in `_ON` label color, "actualTag" in `_OFF` fallback color.

### In system messages
```js
showBastaSystemMessage(host, "Palette fallback found: {{Derp_Default_v01}}", ...)
```
Auto-detects `{{}}` and renders colored segments via `colorSegmentsToHTML`.

## Architecture

```
Text with {{key}} 
  → resolveWidgetEnv (auto-parses)
  → parseColorKeyText (regex + resolveColorKey)
  → segments array [{text, color}]
  → masterPainterText(segments) [Canvas] or colorSegmentsToHTML [DOM]
```

All widgets inherit support via `resolveWidgetEnv` returning `colorSegments` + `hasColorKeys`.

## Wired Widgets

- textLabel, btnSimple, widget_ColorKey, widget_Toggle, widget_ToggleV2
- widget_Trigger, widget_Slider, derpEditor, widget_FileBrowser (trigger + picker)
- bastaSystemMessage (DOM-based system messages)
