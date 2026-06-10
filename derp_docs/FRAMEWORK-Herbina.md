# Herbina — Widget / UI Component Library

## Overview
Herbina is the UI toolkit layer. All visual widgets — buttons, sliders, toggles, labels, file browsers, editors — are defined here. Fatha's `masterLayoutEngine` consumes them via `COMPONENT_BLUEPRINTS` in `masterLayoutTypes.js`.

**Hub:** `js/herbina/masterWidgets.js`
**Last reviewed:** 2026-06-04

## Architecture

### Widget Protocol (from masterWidgets.js)
1. **Unified Theme Keys:** All text-drawing widgets support three-part themeKey: `"BodyKey, LabelKey, FontSizeOverride"`
2. **Parsing:** Use `parseThemeKey` from `utils/widgetsUtils.js`
3. **Resolution:** Use `resolvePaintData` for all node lookups (handles casing mismatches, state suffixes `_ON`/`_DIS`)
4. **Font Overrides:** 3rd part of themeKey overrides paintData's fontSize in both measurement and drawing

### Widget Re-exports (masterWidgets.js hub)
| Export | Source | Role |
|--------|--------|------|
| `createDerpEditorHTML`, `syncDerpEditor` | `widgets/derpEditor.js` | Multiline text editor |
| `createPopupPrompt`, `syncPopupPrompt` | `widgets/popupPrompt.js` | Popup prompt editor |
| `createBtnIcon`, `syncBtnIcon`, `syncBtnIconHTML` | `widgets/btnIcon.js` | Icon button |
| `createBtnSimple`, `syncBtnSimple`, `syncBtnSimpleHTML` | `widgets/btnSimple.js` | Simple text button |
| `createDerpSlider`, `syncDerpSliderCanvas`, `syncDerpSliderHTML` | `widgets/widget_Slider.js` | Range slider |
| `createTextLabel`, `syncTextLabel`, `syncTextLabelHTML` | `widgets/textLabel.js` | Text label |
| `createColorKeyEdit`, `syncColorKeyEdit` | `widgets/widget_ColorKey.js` | Color key editor |
| `createLineBreak`, `syncLineBreak` | `widgets/widget_LineBreak.js` | Visual separator |
| `createFileBrowser`, `syncFileBrowser`, `drawActiveFilePickerGlobal` | `widgets/widget_FileBrowser.js` | File browser/picker |
| `syncDerpToggle` | `widgets/widget_Toggle.js` | Boolean toggle |
| `syncDerpToggleV2` | `widgets/widget_ToggleV2.js` | V2 toggle |
| `syncImageHTML` | `widgets/widget_ImageHTML.js` | HTML image display |
| `createDerpRegion`, `syncDerpRegion` | `widgets/widget_Region.js` | Container region |
| `syncDerpTrigger`, `syncDerpCompositeTrigger` | `widgets/widget_Trigger.js` | Trigger button |

### Painting Layer
| File | Role |
|------|------|
| `masterPainter.js` | Canvas 2D painting (450 lines). Theme compilation: `compileThemeData()` — resolves fill/shadow/stroke/glow from theme config with palette color references (`@key` syntax). Cache via WeakMap. |
| `masterPainterHTML.js` | HTML DOM painting for HTML-based widgets |

### Animation Layer
| File | Role |
|------|------|
| `masterAnimator.js` | Animation engine. `animateRecoil()` — spring-like recoil for press feedback. `animateAlpha()`, `lerpTo()`. |

### Sound Layer
| File | Role |
|------|------|
| `masterSoundEffects.js` | Sound effects. `playKaChing()` and other sound triggers. |
| `sound_lib/` | Sound asset library |

### Extenders
| File | Role |
|------|------|
| `extenders/paletteExtender.js` | Node context/palette extension behavior. |
| `extenders/wirelessExtender.js` | Wireless signal extension behavior. |
| `extenders/bypassExtender.js` | Remote bypass extension behavior. |
| `extenders/helpers/bypassSignalPicker.js` | Shared bypass signal picker helper. |

### Utilities
| File | Role |
|------|------|
| `utils/widgetsUtils.js` | `interpretLayoutProps()`, `resolvePaintData()`, `parseColorKeyText()`, theme key parsing |
| `utils/colorMath.js` | Color manipulation utilities |
| `utils/singletonController.js` | Singleton pattern controller |

### Complete Widget Inventory
```
widgets/
├── btnIcon.js          — Icon button (canonical pattern: width:"match", height:"fill", objectAlign:["left","middle"])
├── btnSimple.js        — Simple text button
├── btnCheckBox.js      — Checkbox
├── textLabel.js        — Text label (canvas + HTML variants)
├── derpEditor.js       — Multiline text editor
├── popupPrompt.js      — Popup prompt editor
├── promptEditor.js     — Prompt editor
├── derpScrollBar.js    — Custom scrollbar
├── widget_Slider.js    — Range slider (canvas + HTML)
├── widget_SliderHTML.js— HTML-based slider
├── widget_Toggle.js    — Boolean toggle
├── widget_ToggleV2.js  — Toggle v2
├── widget_FileBrowser.js— File picker/browser
├── widget_ColorKey.js  — Color key editor
├── widget_LineBreak.js — Visual separator
├── widget_Region.js    — Container region
├── widget_Trigger.js   — Trigger button
├── widget_ImageHTML.js — HTML image display
└── helpers/
    ├── dropdown_lib.js         — Shared dropdown/picker helper utilities
    ├── fileBrowserHelpers.js   — FileBrowser state/data helpers
    ├── fileBrowserDraw.js      — FileBrowser row/breadcrumb/picker drawing helpers
    └── fileBrowserPreview.js   — FileBrowser preview loading/drawing helpers
```

## FileBrowser Notes
- `widget_FileBrowser.js` remains the main widget entry and orchestration point.
- Keep pure data/state helpers in `helpers/fileBrowserHelpers.js`.
- Keep drawing-only helper work in `helpers/fileBrowserDraw.js`.
- Keep preview/pending state work in `helpers/fileBrowserPreview.js`.
- For signal selection UIs, prefer `FILEBROWSER` with `mode: "signal"` instead of custom ad-hoc picker panels.

## EDITOR Rendering Protocol
- `UI_TYPES.EDITOR` is a hybrid widget: Canvas draws asleep visuals and the DOM element handles hit testing, focus, selection, and editing.
- For `canvasShield` editors, asleep background and text must be rendered by Canvas, not by the DOM overlay. DOM-rendered asleep boxes/text drift relative to canvas controls under zoom because CSS transforms and Canvas compositing use different subpixel paths.
- While asleep, keep the DOM editor present for interaction but transparent; while awake/editing, let the DOM editor show text/background so native selection and keyboard input work.
- Do not fix zoom-dependent EDITOR drift with per-zoom height, baseline, or translation nudges. If an asleep editor visual drifts, move that visual back into the Canvas path.
- Keep vertical alignment math host-independent. System panels, Fatha nodes, ThemeManager fields, and numeric editors should use the same `labelAlign` calculation unless a concrete renderer bug requires a shared fix.
- PromptBook image embeds use `richImageContent: true`; this makes `EDITOR` sync through `innerText` so the PromptBook image handler can preserve real `<img>` nodes instead of being overwritten by `textContent`.

## Text Wrapping
- `textLabel` Canvas wrapping and layout height measurement use `wrapTextToLines()` from `widgetsUtils.js`; keep these paths in sync so rendered line count matches measured auto-height.
- CJK text must wrap at character boundaries because Chinese/Japanese/Korean strings often have no spaces. Do not use space-only splitting for wrapped labels.
- HTML `textLabel` wrapping should allow continuous CJK text to break with `overflow-wrap: anywhere` while preserving normal nowrap behavior when `wrap` is false.

## ICONBUTTON Canonical Pattern
```js
{
    type: UI_TYPES.ICONBUTTON,
    icon: "refresh",
    width: "match", height: "fill",
    objectAlign: ["left", "middle"],
    spacing: [sW, 0],
    themeKey: "button, t_textNormal",
}
```
Rules:
- Always `width: "match"`, `height: "fill"` — never `width: "auto"`
- Always `objectAlign: ["left", "middle"]` — centers glyph
- Never add `padding: [pW, pH]` — shrinks icon
- `spacing: [sW, 0]` for horizontal gap between adjacent buttons
- `themeKey: "button, t_textNormal"` — standard

## Z-Index
`getNextZIndex()` starts at 10001, increments per widget. Used for stacking order in the DOM shield overlay.

## Global Animation Toggle
**Setting ID:** `Derp.UseAnimation` (boolean, default: `true`)

**Chain:**
1. Setting toggle → `window.DERP_GLOBAL_SETTINGS.useAnimation`
2. Synced to `node.properties.useAnimations` on all Fatha/Uncle nodes
3. Synced to `basta.properties.useAnimations` on all active Bastas
4. `getDerpVars()` returns `useAnimation` for layout map code
5. In `onDrawForeground`: `const useAnim = this.properties.useAnimations !== false;`
6. Passed to every animation call as the `useAnim` parameter

**When `false`:** all animation functions (`lerpTo`, `animateRecoil`, `animateAlpha`, `animateWidgetColors`, `animatePaintData`, `animatePaintData`) skip interpolation and teleport directly to the target value. `isAnimating` returns `false`.

**Any new animation MUST:**
- Accept a `useAnim` parameter (or read `node.properties.useAnimations`)
- Return `{value, isAnimating}` matching the existing pattern
- Skip lerp and return target + `isAnimating: false` when `useAnim` is false
- Set `_derpAwakeFrames` only when actually animating

## Maintenance Notes
- Update this document when widget files are split, new extenders are added, or component blueprint expectations change.
- Before changing a widget protocol, verify `masterWidgets.js`, `masterLayoutTypes.js`, and the specific widget file together.
