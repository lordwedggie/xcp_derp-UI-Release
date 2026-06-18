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
| `createMarkdownHTML`, `syncMarkdownHTML` | `widgets/widget_MarkdownHTML.js` | Sanitized Markdown HTML display |
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
| `masterAnimator.js` | Animation engine. `animateRecoil()` — spring-like recoil for press feedback. `animateAlpha()`, `lerpTo()`, and shared pulse helpers. `DEFAULT_PULSE_SPEED` matches the selected-node pulse cadence and is the default unless a caller explicitly passes another speed. |

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
├── widget_MarkdownHTML.js — Sanitized Markdown HTML display
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
- Trigger glyph-to-label spacing follows the widget's horizontal `spacing[0]`. Use `spacing: [sW, ...]` when the trigger needs the standard control gap between its indicator glyph and text.
- The open picker panel uses the optional `#picker` theme key when present.
- The hovered picker row band uses the optional `#picker_highlight` theme key as an exact lookup, resolving default/`_OFF` first and `_ON` as fallback; active pickers refresh when the theme cache key changes during live theme edits.
- For signal selection UIs, prefer `FILEBROWSER` with `mode: "signal"` instead of custom ad-hoc picker panels.


## Markdown HTML Notes
- `UI_TYPES.MARKDOWN_HTML` is an HTML widget backed by `widget_MarkdownHTML.js`.
- It renders a conservative Markdown subset plus sanitized safe HTML tags. Raw scripts, event handlers, unsafe URL schemes, arbitrary inline styles, and non-explicit remote URLs are stripped.
- Obsidian-style embeds (`![[clip.mp4]]`), Markdown image embeds (`![](clip.mp4)`), plain local video paths, and safe raw `<video>` tags whose target is a video extension render as native `<video controls playsinline preload="metadata">`.
- Normal image extensions render as images; plain Markdown links to `.md` files are intercepted by the node's `onNavigate` callback instead of leaving ComfyUI.
- Relative media URLs resolve through `/xcp/markdown_media` using the selected Markdown file path as context. Video playback uses that route directly as the browser `src`; do not reintroduce blob/base64 media wrappers unless the route behavior changes.
- Do not use `MARKDOWN_HTML` as a general arbitrary-file HTML renderer; local media access is expected to stay constrained by the backend Markdown route roots and extension whitelist.

## EDITOR Rendering Protocol
- `UI_TYPES.EDITOR` is a hybrid widget: Canvas draws asleep visuals and the DOM element handles hit testing, focus, selection, and editing.
- For `canvasShield` editors, asleep background and text must be rendered by Canvas, not by the DOM overlay. DOM-rendered asleep boxes/text drift relative to canvas controls under zoom because CSS transforms and Canvas compositing use different subpixel paths.
- For asleep `canvasShield` editors, the transparent DOM box must release pointer hit testing back to the node shield so hover states and tooltips still trigger across the full widget body instead of only the exposed margins.
- For active/focused `canvasShield` editors, the themed background rect is still Canvas-owned. Keep the DOM editor text visible because it is the native caret, selection, IME, and CJK hit-testing surface; only the DOM theme background/border/shadow should be transparent so the edit box matches the Canvas renderer.
- Variable fonts can diverge between Canvas and DOM when the browser applies automatic optical sizing. For editor parity, disable DOM `fontOpticalSizing` and pin `fontVariationSettings` `opsz` to the unscaled layout font size used by Canvas measurement.
- Active/focused `canvasShield` editor DOM must be positioned from the Canvas draw transform. Capture the screen rect from `ctx.getTransform()` plus the canvas bounding rect and reuse that rect for DOM `left`, `top`, `width`, and `height`; do not independently recompute placement from `node.pos + ds.offset`, which can diverge under zoom and make the editor drift upward.
- Canvas-shield HTML editors should use physical CSS pixel dimensions with `transform: none`; text metrics, padding, and multiline scroll sync scale through the captured HTML scale.
- While an EDITOR is focused, the next outside pointer-down commits/cancels through blur and is consumed before canvas, shield, or other widget handlers can also use that click.
- Body-level editor DOM must use the host node's `_masterZHtml` unless the editor config explicitly supplies `zIndex`; never preserve stale inline z-index across graph-order changes.
- Do not fix zoom-dependent EDITOR drift with per-zoom height, baseline, or translation nudges. If an asleep editor visual drifts, move that visual back into the Canvas path.
- Keep vertical alignment math host-independent. System panels, Fatha nodes, ThemeManager fields, and numeric editors should use the same `labelAlign` calculation unless a concrete renderer bug requires a shared fix.
- PromptBook image embeds use `richImageContent: true`; this makes `EDITOR` sync through `innerText` so the PromptBook image handler can preserve real `<img>` nodes instead of being overwritten by `textContent`.

## TOGGLE_V2 Optional `#` Theme Keys
- Theme authors can override individual toggle visual elements via `#`-prefixed theme keys in palette JSON. The `#` key takes priority over the 3-key themeKey system and falls back gracefully.
- Supported `#` keys with `_ON`/`_OFF`/`_DIS` state resolution:
  - `#toggle_body` — outer background (falls back to `bodyPaint` from themeKey)
  - `#toggle_slot` — track/slot (falls back to `keySlot`, 3-key parts[0])
  - `#toggle_knob` — sliding knob (falls back to `keyDot`, 3-key parts[1]; renamed from `dot` for consistency with Slider's `#slider_knob`)
  - `#t_toggle_text` — label text (falls back to `keyText`, 3-key parts[2])
- Each element resolves independently via `resolvePaintData(node, "#key", suffix)` before falling back to the standard key, and animates through `animatePaintData` with the same `TOGGLE_COLOR_SPEED`.
- Internal variable `dotPaint` renamed to `knobPaint` for consistency.

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
- Theme-attached palette entries named `_ICONBTN_<icon>` override only the background rect paint for matching icons, including hover/press/pulse animation colors. Example: `_ICONBTN_add` applies to `icon: "add"` and keeps glyph color/geometry on the normal theme path.

## Z-Index
`getNextZIndex()` starts at 10001, increments per widget. Used for stacking order in the DOM shield overlay.

## Slider Animation Notes
- Slider track clicks may animate the knob toward the snapped target value. A new drag-start on the visible knob interrupts that position lerp and snaps the animation state to the live value so dragging can take over immediately.

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
