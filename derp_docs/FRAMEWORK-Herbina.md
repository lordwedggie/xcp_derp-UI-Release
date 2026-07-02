# <span style="color: #ff8080">Framework:</span> <span style="color: #ffffff">Herbina Widget / UI Component Library</span>

## <span style="color: #80ffc0">Overview</span>
Herbina is the UI toolkit layer. All visual widgets — buttons, sliders, toggles, labels, file browsers, editors — are defined here. Fatha's `masterLayoutEngine` consumes them via `COMPONENT_BLUEPRINTS` in `masterLayoutTypes.js`.

<span style="color: #80aaff"><strong>Hub:</strong></span> `js/herbina/masterWidgets.js`
<span style="color: #80aaff"><strong>Last reviewed:</strong></span> 2026-06-04

## <span style="color: #80ffc0">Architecture</span>

### <span style="color: #80ffc0">Widget Protocol (from masterWidgets.js)</span>
1. **Unified Theme Keys:** All text-drawing widgets support three-part themeKey: `"BodyKey, LabelKey, FontSizeOverride"`
2. **Parsing:** Use `parseThemeKey` from `utils/widgetsUtils.js`
3. **Resolution:** Use `resolvePaintData` for all node lookups (handles casing mismatches, state suffixes `_ON`/`_DIS`)
4. **Font Overrides:** 3rd part of themeKey overrides paintData's fontSize in both measurement and drawing

### <span style="color: #80ffc0">Widget Re-exports (masterWidgets.js hub)</span>
| Export | Source | Role |
|--------|--------|------|
| `createDerpEditorHTML`, `syncDerpEditor` | `widgets/derpEditor.js` | Multiline text editor |
| `createPopupPrompt`, `syncPopupPrompt` | `widgets/popupPrompt.js` | Popup prompt editor |
| `createBtnIcon`, `syncBtnIcon`, `syncBtnIconHTML` | `widgets/btnIcon.js` | Icon button |
| `createBtnSimple`, `syncBtnSimple`, `syncBtnSimpleHTML` | `widgets/btnSimple.js` | Simple text button |
| `createDerpSlider`, `syncDerpSliderCanvas`, `syncDerpSliderHTML` | `widgets/widget_Slider.js` | Range slider |
| `createDerpSliderV2`, `syncDerpSliderV2Canvas`, `syncDerpSliderV2HTML` | `widgets/widget_SliderV2.js` | Slider V2 numeric widget foundation |
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

### <span style="color: #80ffc0">Painting Layer</span>
| File | Role |
|------|------|
| `masterPainter.js` | Canvas 2D painting (450 lines). Theme compilation: `compileThemeData()` — resolves fill/shadow/stroke/glow from theme config with palette color references (`@key` syntax). Cache via WeakMap. |
| `masterPainterHTML.js` | HTML DOM painting for HTML-based widgets |

Canvas and HTML painter effects must keep the same theme semantics: shadow/glow `Outside` draws only outside the shape, `Inside` draws only inset, and `None` draws both passes. Canvas shadow/glow blur and offsets are scaled by the active canvas transform so they match HTML widgets whose DOM geometry is already synced to screen pixels. HTML widgets that need a visible Canvas-like outside glow should use `syncHTMLGlowLayer()` from `masterPainterHTML`; its glow layer intentionally approximates negative chamfer corners without `clip-path` so the blur halo is not clipped away.

### <span style="color: #80ffc0">Animation Layer</span>
| File | Role |
|------|------|
| `masterAnimator.js` | Animation engine. `animateRecoil()` — spring-like recoil for press feedback. `animateAlpha()`, `lerpTo()`, and shared pulse helpers. `DEFAULT_PULSE_SPEED` matches the selected-node pulse cadence and is the default unless a caller explicitly passes another speed. |

### <span style="color: #80ffc0">Sound Layer</span>
| File | Role |
|------|------|
| `masterSoundEffects.js` | Sound effects. `playKaChing()` and other sound triggers. |
| `sound_lib/` | Sound asset library |

### <span style="color: #80ffc0">Extenders</span>
| File | Role |
|------|------|
| `extenders/paletteExtender.js` | Node context/palette extension behavior. |
| `extenders/wirelessExtender.js` | Wireless signal extension behavior. |
| `extenders/bypassExtender.js` | Remote bypass extension behavior. |
| `extenders/helpers/bypassSignalPicker.js` | Shared bypass signal picker helper. |

### <span style="color: #80ffc0">Utilities</span>
| File | Role |
|------|------|
| `utils/widgetsUtils.js` | `interpretLayoutProps()`, `resolvePaintData()`, `parseColorKeyText()`, theme key parsing |
| `utils/colorMath.js` | Color manipulation utilities |
| `utils/singletonController.js` | Singleton pattern controller |

### <span style="color: #80ffc0">Complete Widget Inventory</span>
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
├── widget_SliderV2.js  — Slider V2 wrapper with shared numeric value engine
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

## <span style="color: #80ffc0">FileBrowser Notes</span>
- `widget_FileBrowser.js` remains the main widget entry and orchestration point.
- Keep pure data/state helpers in `helpers/fileBrowserHelpers.js`.
- Keep drawing-only helper work in `helpers/fileBrowserDraw.js`.
- Keep preview/pending state work in `helpers/fileBrowserPreview.js`.
- Trigger glyph-to-label spacing follows the widget's horizontal `spacing[0]`. Use `spacing: [sW, ...]` when the trigger needs the standard control gap between its indicator glyph and text.
- The open picker panel uses the optional `#picker` theme key when present.
- The hovered picker row band uses the optional `#picker_highlight` theme key as an exact lookup, resolving default/`_OFF` first and `_ON` as fallback; active pickers refresh when the theme cache key changes during live theme edits.
- For signal selection UIs, prefer `FILEBROWSER` with `mode: "signal"` instead of custom ad-hoc picker panels.


## <span style="color: #80ffc0">IMAGE_HTML Notes</span>
- `IMAGE_HTML` may pre-render images into a target-sized canvas for thumbnail-style widgets. Full UI previews such as ImageDeck should set `useRenderCache: false` so the preview draws from the loaded image element instead of a UI-side render cache.

## <span style="color: #80ffc0">Markdown HTML Notes</span>
- `UI_TYPES.MARKDOWN_HTML` is an HTML widget backed by `widget_MarkdownHTML.js`.
- It renders a conservative Markdown subset plus sanitized safe HTML tags. Raw scripts, event handlers, unsafe URL schemes, arbitrary inline styles, and non-explicit remote URLs are stripped.
- Obsidian-style embeds (`![[clip.mp4]]`), Markdown image embeds (`![](clip.mp4)`), plain local video paths, and safe raw `<video>` tags whose target is a video extension render as native `<video controls playsinline preload="metadata">`.
- Normal image extensions render as images; plain Markdown links to `.md` files are intercepted by the node's `onNavigate` callback instead of leaving ComfyUI.
- Relative media URLs resolve through `/xcp/markdown_media` using the selected Markdown file path as context. Video playback uses that route directly as the browser `src`; do not reintroduce blob/base64 media wrappers unless the route behavior changes.
- Do not use `MARKDOWN_HTML` as a general arbitrary-file HTML renderer; local media access is expected to stay constrained by the backend Markdown route roots and extension whitelist.

## <span style="color: #80ffc0">EDITOR Rendering Protocol</span>
- `UI_TYPES.EDITOR` is a hybrid widget: Canvas draws asleep visuals and the DOM element handles hit testing, focus, selection, and editing.
- For `canvasShield` editors, asleep background and text must be rendered by Canvas, not by the DOM overlay. DOM-rendered asleep boxes/text drift relative to canvas controls under zoom because CSS transforms and Canvas compositing use different subpixel paths.
- For asleep `canvasShield` editors, the transparent DOM box must release pointer hit testing back to the node shield so hover states and tooltips still trigger across the full widget body instead of only the exposed margins.
- For active/focused `canvasShield` editors, the themed background rect is still Canvas-owned. Keep the DOM editor text visible because it is the native caret, selection, IME, and CJK hit-testing surface; only the DOM theme background/border/shadow should be transparent so the edit box matches the Canvas renderer.
- Variable fonts can diverge between Canvas and DOM when the browser applies automatic optical sizing. For editor parity, disable DOM `fontOpticalSizing` and pin `fontVariationSettings` `opsz` to the unscaled layout font size used by Canvas measurement.
- Active/focused `canvasShield` editor DOM must be positioned from the Canvas draw transform. Capture the screen rect from `ctx.getTransform()` plus the canvas bounding rect and reuse that rect for DOM `left`, `top`, `width`, and `height`; do not independently recompute placement from `node.pos + ds.offset`, which can diverge under zoom and make the editor drift upward.
- Canvas-shield HTML editors should use physical CSS pixel dimensions with `transform: none`; text metrics, padding, and multiline scroll sync scale through the captured HTML scale.
- `canvasShield` editor wheel input belongs to the editor only while the current multiline content actually has vertical overflow. When the editor has no internal scroll range, pass the wheel event through so ComfyUI canvas zoom keeps working under the hovered editor.
- While an EDITOR is focused, pointer-down outside the host node commits/cancels through blur and is consumed before canvas, shield, or other widget handlers can also use that click. Pointer-down on another interactive UI region in the same host node blurs the editor first, then passes through to that region's normal handler.
- Body-level editor DOM must use the host node's `_masterZHtml` unless the editor config explicitly supplies `zIndex`; never preserve stale inline z-index across graph-order changes.
- Do not fix zoom-dependent EDITOR drift with per-zoom height, baseline, or translation nudges. If an asleep editor visual drifts, move that visual back into the Canvas path.
- Keep vertical alignment math host-independent. System panels, Fatha nodes, ThemeManager fields, and numeric editors should use the same `labelAlign` calculation unless a concrete renderer bug requires a shared fix.
- PromptBook image embeds use `richImageContent: true`; this makes `EDITOR` sync through `innerText` so the PromptBook image handler can preserve real `<img>` nodes instead of being overwritten by `textContent`.

## <span style="color: #80ffc0">TOGGLE_V2 Optional `#` Theme Keys</span>
- Theme authors can override individual toggle visual elements via `#`-prefixed theme keys in palette JSON. The `#` key takes priority over the 3-key themeKey system and falls back gracefully.
- Supported `#` keys with `_ON`/`_OFF`/`_DIS` state resolution:
  - `#toggle_body` — outer background (falls back to `bodyPaint` from themeKey)
  - `#toggle_slot` — track/slot (falls back to `keySlot`, 3-key parts[0])
  - `#toggle_knob` — sliding knob (falls back to `keyDot`, 3-key parts[1]; renamed from `dot` for consistency with Slider's `#slider_knob`)
  - `#t_toggle_text` — label text (falls back to `keyText`, 3-key parts[2])
- Each element resolves independently via `resolvePaintData(node, "#key", suffix)` before falling back to the standard key, and animates through `animatePaintData` with the same `TOGGLE_COLOR_SPEED`.
- Internal variable `dotPaint` renamed to `knobPaint` for consistency.

## <span style="color: #80ffc0">Text Wrapping</span>
- `textLabel` Canvas wrapping and layout height measurement use `wrapTextToLines()` from `widgetsUtils.js`; keep these paths in sync so rendered line count matches measured auto-height.
- CJK text must wrap at character boundaries because Chinese/Japanese/Korean strings often have no spaces. Do not use space-only splitting for wrapped labels.
- HTML `textLabel` wrapping should allow continuous CJK text to break with `overflow-wrap: anywhere` while preserving normal nowrap behavior when `wrap` is false.

## <span style="color: #80ffc0">ICONBUTTON Canonical Pattern</span>
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
- `btnIcon.js` now guards background corners against undersized buttons. Default guard ratio is `2.0`: width must fit `2x` the larger absolute value of top-left/top-right, and height must fit `2x` the larger absolute value of top-left/bottom-left. This applies to both normal rounded corners and negative chamfer corners. If either side is too small, the widget steps each corner magnitude toward `0` by `1` until they fit.
- Theme-attached palette entries named `_ICONBTN_<icon>` override only the background rect paint for matching icons, including hover/press/pulse animation colors. Example: `_ICONBTN_add` applies to `icon: "add"` and keeps glyph color/geometry on the normal theme path.

## <span style="color: #80ffc0">Z-Index</span>
`getNextZIndex()` starts at 10001, increments per widget. Used for stacking order in the DOM shield overlay.

## <span style="color: #80ffc0">Slider Animation Notes</span>
- Slider track clicks may animate the knob toward the snapped target value. A new drag-start on the visible knob interrupts that position lerp and snaps the animation state to the live value so dragging can take over immediately.

## <span style="color: #80ffc0">Slider V2 Notes</span>
- `UI_TYPES.SLIDER_V2` and `UI_TYPES.SLIDER_V2_HTML` route through `widget_SliderV2.js`. Canvas and HTML rendering are both V2-owned and must use the same visual part breakdown: background, fillBar, knob, btnLR, and label. All numeric behavior must go through `widgets/helpers/sliderV2Value.js`.
- `UI_TYPES.SLIDER_V2` is a hybrid widget. Calling nodes should keep using this one type; the widget chooses Canvas or HTML internally from the global `Derp.SliderV2RenderPath` setting (`canvas` by default, `html` optional).
- Changing `Derp.SliderV2RenderPath` must force existing Fatha/Uncle nodes and active Bastas through a fresh sync so Canvas widgets can remove stale HTML elements and HTML widgets can create their DOM surfaces immediately.
- `derpSkunk` is the current Slider V2 lab node and may expose FILEBROWSER controls for render path and style selection. Production nodes should keep passing `UI_TYPES.SLIDER_V2` and rely on the shared global setting instead of branching locally.
- `sliderV2Value.js` owns min/max normalization, int-vs-float typing, step snapping, decimal/display formatting, measure-text fallback, pointer-to-value mapping, btnLR stepping, horizontal interaction resolution, and reset defaults. Canvas and HTML render paths must call the same value helpers instead of duplicating math.
- INT Slider V2 specs coerce configured steps to whole numbers before snapping/stepping. Fractional INT steps are treated as caller mistakes and normalized to at least `1` so btnLR and keyboard-like step changes never get stuck on rounded `.5` values.
- `sliderV2Config.js` owns V2 config preparation, callback normalization, default numeric display text, value-setting helpers, and the type-dispatched interaction wrapper. Widget renderers and lab nodes should import these helpers instead of importing `widget_SliderV2.js` for non-rendering behavior.
- `widget_SliderV2.js` owns the HTML DOM renderer and pointer handlers so track drags, btnLR clicks, dead-gap handling, and reset/commit behavior all go through Slider V2 value helpers.
- `sliderV2Styles.js` owns the built-in style preset list, maps each `styleId` to Canvas/HTML renderer styles, and applies style-owned visual defaults before rendering. Callers should pass a preset `styleId` such as `knob`; only explicitly exposed caller/lab options should override preset defaults.
- `sliderV2Styles.js` also owns saved-style payload normalization for `derpSliderV2Editor`. Reusable style JSON travels through the `sliderV2Styles` backend category and should persist preset/shape controls only; color and effect identity remains palette/theme-owned.
- `sliderV2Types.js` owns the supported type IDs. `horizontal` is the only implemented interaction path for now; `vertical` and `radial` are recognized future presets and must return a clean unsupported interaction until their render/interaction paths are implemented.
- Calling nodes should use `widget_SliderV2.js` interaction helpers such as `resolveSliderV2Interaction()` rather than reimplementing pointer math locally.
- Slider V2 style and render-path work should stay presentation-only. Do not put colors/effects or arbitrary caller visual overrides into the value engine.

## <span style="color: #80ffc0">Global Animation Toggle</span>
<span style="color: #80aaff"><strong>Setting ID:</strong></span> `Derp.UseAnimation` (boolean, default: `true`)

<span style="color: #80aaff"><strong>Chain:</strong></span>
1. Setting toggle → `window.DERP_GLOBAL_SETTINGS.useAnimation`
2. Synced to `node.properties.useAnimations` on all Fatha/Uncle nodes
3. Synced to `basta.properties.useAnimations` on all active Bastas
4. `getDerpVars()` returns `useAnimation` for layout map code
5. In `onDrawForeground`: `const useAnim = this.properties.useAnimations !== false;`
6. Passed to every animation call as the `useAnim` parameter

<span style="color: #80aaff"><strong>When `false`:</strong></span> all animation functions (`lerpTo`, `animateRecoil`, `animateAlpha`, `animateWidgetColors`, `animatePaintData`, `animatePaintData`) skip interpolation and teleport directly to the target value. `isAnimating` returns `false`.

<span style="color: #ffc680"><strong>Any new animation MUST:</strong></span>
- Accept a `useAnim` parameter (or read `node.properties.useAnimations`)
- Return `{value, isAnimating}` matching the existing pattern
- Skip lerp and return target + `isAnimating: false` when `useAnim` is false
- Set `_derpAwakeFrames` only when actually animating

## <span style="color: #80ffc0">Maintenance Notes</span>
- Update this document when widget files are split, new extenders are added, or component blueprint expectations change.
- Before changing a widget protocol, verify `masterWidgets.js`, `masterLayoutTypes.js`, and the specific widget file together.
- Horizontal metrics in `sliderV2Value.js` mirror the visible V1 canvas geometry: `fillPadding`, btnLR button width, 1px track gaps, and knob travel are part of the shared contract. If a lab node or wrapper passes Slider V2 interactions around, it should feed the prepared style fields into the helper instead of recalculating pointer math locally.
