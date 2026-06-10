# AGENTS.md � xcp_derp-UI

## Project Overview

xcp_derp-UI is a ComfyUI custom node pack (v0.7.6) that replaces ComfyUI's default LiteGraph rendering with a custom layout/docking/theming system. Lives at `ComfyUI/custom_nodes/xcp_derp-UI/`.

### Architecture (4 frameworks)
- **Fatha** (`js/fatha/`) � Virtual DOM / layout orchestration layer. Hijacks `LGraphCanvas.prototype.drawNode`, registers nodes via `fatha()` / `uncle()`, manages the per-frame draw lifecycle.
- **Herbina** (`js/herbina/`) � Widget / UI component library. All visual widgets (buttons, sliders, toggles, editors, file browsers) live here. Re-exported through `masterWidgets.js`.
- **Basta** (`js/fatha/basta.js` + `bastas/`) � Floating panel system. Multi-instance overlay panels sitting above the node graph. Uses same layout engine as Fatha but renders in screen space.
- **Motha** (`js/motha/`) � Theme management system. Runtime theme swaps, palette resolution, template synchronization.

### Directory layout
| Path | Purpose |
|------|---------|
| `python/` | Python backend: ComfyUI nodes with `NODE_CLASS_MAPPINGS` / `NODE_DISPLAY_NAME_MAPPINGS` |
| `python/xcp_routes/` | File server, asset/image/json/prompt-book routes |
| `js/` | JavaScript frontend: widgets, docking, layout, themes |
| `js/fatha/` | Fatha layout engine + Basta panels |
| `js/herbina/` | Herbina widget library |
| `js/motha/` | Motha theme manager |
| `derp_docs/` | Documentation (EN + ZH for each node) |
| `locales/` | i18n files (`en-US.json`, `zh-CN.json`) |
| `__init__.py` | Plugin entry point: imports all node modules, merges mappings, sets `WEB_DIRECTORY = "./js"` |

---

## Development Conventions

### Python nodes
- Each node module in `python/` exports `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS` dicts.
- New nodes must be imported and merged in `__init__.py`.
- JS counterpart files in `js/controldeck/` share the same name stem (e.g., `derpSeedV2.py` ? `derpSeedV2.js`).
- Core logic split into `*_core.js` files when the main file is a thin ComfyUI glue layer.

### JavaScript frontend
- Fatha nodes register with `fatha(nodeType, nodeData, minWidth)` or `uncle(...)`.
- Widgets in `js/herbina/widgets/` are re-exported through `js/herbina/masterWidgets.js`.
- Basta panels register in `window.xcpActiveBastas` Map.
- Theme keys use three-part format: `"BodyKey, LabelKey, FontSizeOverride"`. Parsed with `parseThemeKey`, resolved with `resolvePaintData`.
- Always respect `_ON` / `_DIS` state suffixes when resolving theme keys.

### Framework Documentation
- Eight FRAMEWORK-*.md files live in derp_docs/ covering Fatha, Herbina, Basta, Motha, Backend, Docking, Nodes, and ThemePalette.
- When framework code changes (e.g., new widget API, theme key parsing, palette resolution), the relevant FRAMEWORK doc must be updated at commit time to reflect the changes.
- Docs are kept in sync with code � stale docs are a bug.

### CHANGELOG
- When updating `CHANGELOG.md`, each version (including `[Unreleased]`) must have at most three sections: `### Added`, `### Changed`, `### Fixed`. Do not create duplicate section headers. Merge entries into the existing section of the same name. If a needed section does not exist, add it once.

### i18n
- Locale strings in `locales/{lang}.json`. Keep EN and ZH in sync when adding keys.

---

## Coding Guidelines

0. **TOP PRIORITY � Report changed files.** At the very bottom of every message, always report the files you have changed during the turn with full paths highlighted as clickable inline code (e.g., ` js/controldeck/derpSeedV2.js `). Group them under a **Files Changed** header.

1. **Review FRAMEWORK docs.** Before making changes, check derp_docs/FRAMEWORK-*.md for the relevant subsystem (Fatha, Herbina, Basta, Motha, Backend, Docking, Nodes, ThemePalette). Understand the existing patterns and conventions before coding.

2. **Think before coding.** State assumptions explicitly. If something is unclear, ask.
3. **Simplicity first.** Minimum code that solves the problem. No abstractions for single-use code, no premature configurability.
4. **Surgical changes.** Touch only what you must. Match existing style. Do not refactor things that are not broken.
5. **Goal-driven execution.** Define success criteria before implementing. Loop until verified.

6. **Self-maintain AGENTS.md.** When you encounter a new pattern, learn from a mistake, or discover an undocumented convention, update the Lessons Learned section (or add a new one) in AGENTS.md without being asked. This file is your only persistent memory across sessions — stale or missing lessons will cause repeated mistakes.


---

## Lessons Learned (do not repeat these mistakes)

### Color-key / palette resolution (2026-06-09)
1. **Never call `resolveColorKey` directly from widget code.** Always construct a `{{keyName:stateSuffix:::displayText}}` string and pass it through the existing `parseColorKeyText` framework. The `:::` (three-colon) syntax tells the parser: keyName, then state suffix (`_ON`/`_OFF`/`_DIS`), then display text.
2. **The `{{}}` token path handles everything:** palette lookup, state resolution, AND effects (shadow/border/glow) — all in one call. Bypassing it means you have to reimplement all three.
3. **For HTML widgets,** use `colorSegmentsToHTML(segments, fallbackColor, { getTextShadow })` to render palette-colored text in DOM elements — don't just set `innerText`.
4. **For canvas widgets,** pass `segments: iconColorSegments` to `masterPainterText` — it has a full segmented rendering path with per-segment effects.
5. **Update cache hashes** whenever adding a new config parameter that affects visual output. Include the parameter value AND a status/availability check in the hash.
6. **`resolvePaintData` works for THEME keys only.** Palette entries (like `t_text_accent`, `t_text_error`) have no compiled theme paint data — `resolvePaintData` returns null for them. Use the `{{}}` / `resolveColorKey` path for palette entries.
7. **Always read `derp_docs/FRAMEWORK-*.md` first** before touching framework code. These docs describe the resolution chains and patterns that exist.

### Framework-wide patterns (2026-06-09)
- **All FRAMEWORK-*.md docs are authoritative.** `derp_docs/` contains 8 framework docs: Fatha, Herbina, Basta, Motha, Backend, Docking, Nodes, ThemePalette. Read the relevant ones before touching any framework code. Stale docs = bug.
- **Layout maps are declarative trees.** Every node defines UI via `refreshNodeLayoutMap()` returning `{ region: { type, themeKey, children... } }`. Anchors (`{ target, axis, offset }`) position regions relative to named siblings. Flex: `dir: "row"|"col"`. Sizing: `"full"|"auto"|"match"|N`.
- **Layout map hashing prevents rebuilds.** Nodes compute `_layoutMapHash` from structural state. Include any config property that changes visual output. Skip rebuild on hash match.
- **New user-visible strings must be localized.** Add entries to `locales/{lang}.json` for both EN and ZH. Never hardcode display strings.
- **Pure virtual shell pattern for Python nodes.** Most Controldeck nodes are virtual `do_nothing()` shells — JS handles all logic. They exist only for graph presence, wireless signals, and remote bypass.
- **Cache hashes must include all visual state.** When adding a config parameter that affects rendering, include it in the state hash (`stateHash`/`syncKey`). Missing hash entries cause stale cache hits.
- **Force Sync pattern:** Set `node._forceSync = true` to trigger full layout recompute next frame. For layout changes: `node._layoutDirty = true`. For post-interaction animation: `node._derpAwakeFrames = N`.
- **Two node registration paths:** `fatha()` (full framework, no LiteGraph slots) and `uncle()` (hybrid, keeps real input/output slots for connections). Uncle pads links with `UNCLE_LINK_PAD` (15px).
- **Stack drag-and-drop is hold-first.** `startStackDrag` arms a timer; structural changes only after `_dragThresholdMet`. Click actions must call `endStackDrag` to cancel pending hold. Layout hashes gate on `_dragThresholdMet`.
- **Basta panels render in screen space** (not canvas space). Registered in `window.xcpActiveBastas` Map. Use `showBasta*()` functions from `js/fatha/bastas/`. Same layout engine as Fatha.
- **Virtual node template:** Start from `js/derpFathaTemplate.js`. Keep reusable logic in `core/*_core.js` only when genuinely reusable or large.
### Widget architecture patterns (2026-06-09)
- **
esolveWidgetEnv is the universal widget entry point.** Every widget's syncDerp* function starts by calling 
esolveWidgetEnv(node, config, app). It returns { props, bodyPaint, labelPaint, content, textAnchor, suffix, useAnim, playSound, alpha, colorSegments, hasColorKeys, visibleDisplayText }. Never bypass it � it handles theme resolution, i18n, state suffixes, and animation gating in one call.
- **Three animation primitives:** nimatePaintData(node, animKey, target, useAnim, speed) for paint interpolation, nimateWidgetColors(node, key, paintData, useAnim) for color-only transitions, nimateAlpha(nodeValue, target, speed, useAnim) for numeric position/alpha lerp. All require 
ode._derpAwakeFrames = N to keep the canvas alive during animation.
- **Interaction state tracking:** Widgets use 
ode._hoveredRegionKey === config.key and 
ode._pressedRegionKey === config.key for hover/press visual states. These are set by the Fatha interaction system, not by widget code.
- **Sub-element theme keys:** Theme authors can override specific widget sub-elements via # keys (e.g., #slider_background, #slider_fillbar, #slider_knob, #slider_btnLR). Widgets resolve these via 
esolvePaintData(node, "#elementKey", suffix, fallbackColor) before falling back to the main theme key.
- **Multi-key theme system:** Some widgets (ToggleV2) use a 3-part theme key: "slotKey, dotKey, textKey" � each part gets independent _ON/_OFF/_DIS resolution and animation. Distinguish 3-key format from 2-key "bodyKey, labelKey" by checking parts.length === 3 && isNaN(parts[2]).
- **Fill strength interpolation:** Slider fills animate color between _OFF and _ON states proportionally to the slider value (0?1 range). 
esolveInterpolatedPaint handles this with illStrength: true config.
- **Bitmap caching for performance:** TriggerWall nodes use offscreen OffscreenCanvas bitmaps to cache entire widget renders. The _triggerBitmapCache Map stores { key: cacheKey, bitmap } entries. Cache invalidates on _forceSync, drag, or alpha < 1. Always include all visual state in the cache key.
- **Overlay picker lifecycle:** FileBrowser manages a complex overlay picker via xcpActiveFileBrowser global state. Pickers auto-flip direction based on screen space, have scrollable panes with custom scrollbars, breadcrumb navigation, and search-tab integration. Always test overlay positioning at screen edges.

### Color-key resolution chain (2026-06-09)
- **4-step lookup in 
esolveColorKey:** (1) Node's stringPaletteData (in-memory), (2) Async-fetched stringPalette entry (triggers redraw on arrival), (3) window.xcpActivePalette (global), (4) 
esolveExactColorKeyPaint (legacy exact match). Palette entries are fetched via /xcp/load/palettes?name=... and cached in _paletteCache.
- **String palette defaults are theme-category aware.** Missing/`Other` theme `Category` uses `_system/_defaultTheme.json`; `Dark`, `Light`, and `Neutral` use `_system/_DK_defaultTheme.json`, `_system/_LT_defaultTheme.json`, and `_system/_NE_defaultTheme.json`, falling back to `_system/_defaultTheme.json` if the category file is missing.
- **Tooltip color keys use the host string palette context.** Tooltip entries live in the category-aware `_defaultTheme` palette files and resolve through the host node's `_derpStringPalette`; retired `_system/_toolTip` palette names are tolerated only as legacy settings and must not be used by new tooltip code.
- **parseColorKeyText regex:** Matches {{keyName:stateSuffix:::displayText}}. ::: separates state from display text. If displayText is omitted, the raw {{...}} token is shown. Returns { segments: [{text, color, effects}], hasColorKeys: boolean }.
- **Effects carry through segments:** Each segment carries effects (shadow/glow/border) from the palette entry. Adjacent segments with identical color+effects are merged. colorSegmentsToHTML applies 	ext-shadow via options.getTextShadow(seg).
- **
esolvePaintData vs 
esolveColorKey:** 
esolvePaintData resolves compiled THEME paint data (with fill, fontSize, corners, etc.). 
esolveColorKey resolves PALETTE color entries (just color + effects). They serve different purposes � theme keys for widget body, palette keys for text coloring.
### Fatha layout engine internals (2026-06-09)
- **Two-pass layout system:** compute() in masterLayoutEngine runs PASS 1 (rigid floor measurement) at SQUISH_WIDTH (10px) to determine minimum content width, then PASS 2 (content alignment) at the real node width. PASS 1 is skipped when _lastStructureHash matches and a cached contentMinWidth exists.
- **Measurement cache:** _buildMeasureCacheKey creates a hash from ALL config properties (type, themeKey, width, height, text, font, icon, items, margins, padding, spacing, etc.). Cache hits skip expensive _calculateReservedWidth calls. Every new widget parameter must be added to this cache key.
- **Layout map hash:** _hashMap recursively hashes the layout map to detect structural/value changes. Bypass keys with ypassHashOptimization: true (forces hash to include _hashStamp). Functions, LiteGraph nodes, and internal properties (parentKey, hostNode, 
ode, pp) are filtered out.
- **Sizing modes:** match (proportional to height), it (sum children in row / max child in col), uto (same as fit but without minWidth floor), ull (fills parent), explicit N (pixels). width: "match" with a float suffix (e.g., "match:0.5") scales by that factor.
- **Height snapping:** Conforms to LiteGraph's SNAP grid (default 10px). Controlled by 
ode.properties.snapHeight. Skipped for system panels.
- **Header width floor:** _ignoreHeaderWidthFloor allows header regions to span beyond body width without being constrained. Set when drawHeader === false or explicitly.
- **Child iteration:** RESERVED_KEYWORDS filters out non-child keys from children iteration � only object-typed keys that aren't in the reserved set are treated as child regions.
- **Cache invalidation on ypass_:** When mapHash contains ypass_, the engine invalidates _btnSimpleCache, _dropdownCache, _fileBrowserCache, and sets _shouldSync = true.
- **Widget type mapping:** COMPONENT_BLUEPRINTS in masterLayoutTypes.js maps UI_TYPES (e.g., "btnIcon", "slider", "derpToggleV2") to their sync functions and create factories. Each blueprint defines default 	hemeKey, width, height, isHtml flag.
- **i18n (	 function):** Resolves $-prefixed keys against window.xcpDerpLocaleData. Called during _localize before measurement. Returns "MISSING: " on failure.
### Fatha node lifecycle (2026-06-09)
- **atha() registration** sets up the full virtual node: isFathaNode, prototypal methods (getDerpVars, 	ransmitDerpSignal, handleThemeUpdate, pplyPalette, drawNode, computeSize, collapse), hooks into onThemeUpdate, onConfigure, onDrawForeground, onRemoved. Also wraps syncDerpOutputs for bypass-aware signal transmission.
- **onDrawForeground is the main frame loop.** It: (1) catches mode flips for bypass signal transmission, (2) checks collapsed state (early return), (3) creates masterLayoutEngine if missing, (4) detects state changes via _prevDerpState (pos, size, scale, offset, selected, mode, hoveredKey), (5) manages _derpAwakeFrames for animation keep-alive, (6) runs nimateRecoil for press feedback, (7) culls off-screen nodes via viewport check + DOM hide, (8) computes layout on structural change, (9) runs passive whole-wall bitmap caching, (10) iterates layout regions calling COMPONENT_BLUEPRINTS[reg.type].sync().
- **Viewport culling:** isFathaNodeOutsideViewport with 160px margin. Only culls when all gates pass: not selected, not animating, no forceSync, not dragging, no hovered/pressed regions, no awake frames. Culled nodes get DOM isibility: hidden.
- **Passive whole-wall cache:** For eligible nodes, renders the entire node into an OffscreenCanvas at devicePixelRatio � canvasScale. Cache invalidates on structural/interaction changes. Subsequent frames just drawImage the cached bitmap.
- **nimateDerpSize** smoothly lerps node dimensions to target. Respects utoWidth/utoHeight � during live resize, the manually-dragged axis is preserved while the auto-managed axis responds immediately.
- **_compDataCache:** Per-widget geometry/data cache keyed by region key. Reused across frames unless layout changed. Prevents per-frame garbage collection.
- **Cleanup on onRemoved:** Removes DOM elements, interaction shield, theme registration. Closes system panel if host is active.
- **onConfigure:** Restores 	itleLabel from properties, re-resolves theme data, calls 
efreshNodeLayoutMap(), requests sync.
- **onNodeCreated:** Proxies syncDerpOutputs for bypass-aware signal transmission, sets gcolor to 
gba(0,0,0,0) for ComfyUI compatibility.
- **uncle() hybrid path:** Same lifecycle as atha() but preserves LiteGraph input/output slots with UNCLE_LINK_PAD (15px) padding. Uses suppressDefaultWidgets and syncUncleSlots for legacy widget management.

### State change detection (2026-06-09)
- **_prevDerpState** tracks: posX, posY, sizeW, sizeH, scale, offsetX, offsetY, selected, mode, hoveredKey. Any change triggers _shouldSync = true.
- **_shouldSync** gates full rendering. Set when: visual state changed, _forceSync is true, _layoutDirty is true, or animating while selected.
- **
eedsLayoutCompute** gates layout engine recompute. Set when: size/mode/selected changed, _forceSync, or _layoutDirty.
- **_forceSync** triggers full layout rebuild next frame. Automatically cleared after use. _layoutDirty same but also auto-clears.
- **_derpAwakeFrames** keeps the canvas alive during animation. Decremented each frame. Widgets set it when animating (typically 2-10 frames).
### Basta panel system (2026-06-09)
- **Screen-space overlays:** Bastas render in screen space (not canvas space) via drawBastaLayer(ctx). Each Basta has its own masterLayoutEngine, DOM shield, and widget rendering � same architecture as Fatha nodes but positioned absolutely on screen.
- **ctiveBastas Map** is the global registry. spawnBasta(id, config) creates or reuses singleton instances. drawBastaLayer iterates all active bastas each frame, calling update() then draw().
- **Singleton pattern:** Bastas with astaSingleton: true reuse the same instance when re-spawned. The existing instance updates its host, layoutMap, and properties. isClosing is reset to false for quick re-open.
- **Position anchoring:** Bastas anchor to a 	argetRegion on the host node. Offset is computed as center-aligned above the target. Saved in hostNode.properties[bastaOffset_]. Search tabs use _searchTabAnchorRegion with lerp-based position tracking.
- **Lifecycle:** update() checks for orphan hosts, handles drag, fades alpha (0?1 open, 1?0 close), runs tooltip expand lerp. draw() runs the full layout+widget pipeline. Destroys when alpha = 0.01 and isClosing.
- **Interaction:** handleShieldInteraction supports dragging (when astaMovalbe), saves size/offset on drag end, click-to-close (when clickToClose !== false), absorbs clicks when astaSelectable: false.
- **Size persistence:** Saves to hostNode.properties[bastaSize_] on drag end. Restored on re-spawn with minWidth enforcement.
- **Viewport warping:** _warpOnOpen + 
equestBastaViewportFit ensures panels remain fully visible on screen. Applies for 10 frames after open.
- **Performance tracking:** Built-in BLD (Basta LoRA Detail) profiling with per-operation timing (layoutCompute, layoutForce, layoutDirty, layoutSize, layoutHash, layoutCall, layoutSkip).

### Motha theme system (2026-06-09)
- **Theme data structure:** Each theme key is a flat object with _ON/_OFF/_DIS arrays [r,g,b,a], corners, _Shadow/_Stroke/_Glow physics arrays, and compiled CSS-friendly shadow/stroke/glow arrays with clip modes (c_shadowOutside, c_glowNone, etc.).
- **compileThemeData(themeMain, keyName, state):** Compiles raw theme arrays into paintData objects with ill, shadow (color+offsetX+offsetY+blur), order (color+width+placement), glow (color+offsetX+offsetY+blur), corners, ont, ontSize, ontWeight. Cached per-theme per-state via WeakMap keyed by state::paletteName.
- **@key legacy palette:** 
esolvePaletteColor(val) resolves @keyName strings against window.xcpActivePalette. This is the LEGACY path � new code uses {{keyName}} via parseColorKeyText.
- **FALLBACK_THEME:** Hardcoded default theme with all required keys (canvas, ackground, dialog, panel, utton, header, etc.). Used when no theme is configured.
- **Theme manager node:** A Fatha-registered node (	hemeManagerV2.js) with full UI for editing themes � key editor, effect editor, font picker, palette selector. Uses 	hemeManagerV2_core.js for initialization, layout, and event binding.
- **handleThemeUpdate(node, config):** Called on theme change for ALL derp nodes. Recompiles theme paint data, sets _headerPaletteName, calls loadDerpPalette(), then 
equestDerpSync().

### Painting pipeline (2026-06-09)
- **masterPainter(ctx, options):** 5-layer canvas rendering: (1) outside shadow (evenodd clip), (2) background fill (with optional attached shadow), (3) inside shadow (inverse evenodd), (4) glow (Outside/Inside/None clip modes), (5) border (center/inside/outside placement). Canvas tuning factors: blur �2.0, alpha �0.7, offset �1.5.
- **masterPainterText(ctx, options):** Triple-pass vector text rendering. Supports segments for per-segment color-key text, cutoff for text clipping, lign/aseline positioning.
- **compileAnimatedPaint(paintData, config, sysAlpha, animColors):** Merges static theme paint with live animation arrays. Applies sysAlpha to all color channels. Fades shadow/glow/border when sysAlpha < 1.

### Animation system (2026-06-09)
- **nimateWidgetColors(node, animKey, targetBg, targetIc, sysAlpha, useAnim, speed):** Full widget color animation � lerps fill AND icon color in parallel. Returns { fillColor, iconColor, isAnimating }. Stores current values on 
ode._animCache[animKey].
- **nimatePaintData(node, animKey, targetPaint, useAnim, speed):** Interpolates entire paint data objects (fill + shadow + border + glow). Used by ToggleV2 and Trigger for state transitions.
- **nimateAlpha(current, target, factor, useAnim):** Generic alpha lerp. Returns { value, isAnimating }. Teleports to target when useAnim is false.
- **nimateRecoil(current, target, factor, useAnim):** Spring-like recoil for physical press feedback. Uses overshoot dampening.
- **colorPulse2 / getPulsedColor:** Time-based color pulsing using performance.now() bucketed by PULSE_FRAME_BUCKET_MS.
- **Global channel system:** startAnimatorChannel(id, frameFn) / stopAnimatorChannel(id) for persistent animation loops independent of canvas frames.

### Docking system (2026-06-09)
- **Dock groups:** Nodes share _deckGroupId. The master dock engine (masterDockEngine.js, 1610+ lines) manages pairs, groups, and size normalization.
- **Leader/follower:** When docking, the stationary node becomes leader, dragged node becomes follower. Leader determines shared dimensions.
- **Normalization:** Horizontal docks normalize heights to shared max. Vertical docks normalize widths. itSizesToTotal distributes space with minimum-size respect.
- **Key files:** masterDockEngine.js, dockDimensions.js, dockResize.js, dockDrag.js, dockTargetPicking.js.
### Python backend (2026-06-09)
- **Virtual shell pattern:** Most Controldeck Python nodes are do_nothing() shells � FUNCTION returns (), RETURN_TYPES is empty. They exist only for graph presence, wireless signal registry, and remote bypass. JS handles all logic in onDrawForeground and syncDerpOutputs.
- **Node registration:** __init__.py merges NODE_CLASS_MAPPINGS from each module. Conditional imports (try/except) for optional modules. WEB_DIRECTORY = "./js" tells ComfyUI where to serve frontend files.
- **Signal router:** derpSignalOut.py maintains DERP_LIVE_REGISTRY dict for wireless signal values. 16 virtual outputs of AnyType("*"). API routes: /xcp/purge_signal, /xcp/update_signal.
- **File server:** xcp_file_server.py wires all HTTP routes with safe_post()/safe_get() guards against duplicate registration. Routes organized into modules: assets, images, JSON, prompt book, version check.
- **LoRA API:** Full CRUD for LoRA files � get/list, check files, info, triggers, preview/images, ratings, notes, rename, delete, upload, cover image. Also save/load/list for LoRA stacks via /xcp/save|load|list/derpLoraStack.
- **Palette serving:** /xcp/load/palettes?name=... serves palette JSON files from user/derpNodes/Palettes/_system/. The X-Xcp-Using-Fallback header indicates fallback palette was used. Cache-busted with ?t= query param.
- **Settings persistence:** Theme config, Basta sizes/offsets, palette selections saved to/loaded from workflow JSON via 
ode.properties. All persistence uses ComfyUI's built-in serialization � no separate file storage for node state.
### Signal engine (2026-06-09)
- **Wireless signal registry:** window.xcpDerpSignals is the global signal store. Signals are published via 	ransmitDerpSignal(node, value, options) and consumed by xcpDerpSignalOut nodes and remote bypass listeners.
- **Type color coding:** window.xcpDerpTypeColors maps signal types (INT, FLOAT, STRING, MODEL, VAE, LATENT, IMAGE, LORA, etc.) to hex colors. Used for colored link dots and signal display badges.
- **Bypass forwarding:** 	ransmitBypassedDerpSignals(node, options) handles signal passthrough when a node is bypassed (mode 2 or 4). Critical for maintaining signal chains through bypassed nodes.
- **Signal refresh:** 
efreshWirelessSignalConsumers() notifies all signal routers and remote bypass nodes when signals change. Called after graph modifications, node additions, or connection changes.
- **Heartbeat:** 
unWirelessHeartbeat(node) sends periodic signal updates with debouncing via _signalSyncDebouncer timeout.
- **Purge:** purgeDerpSignal(nodeId) removes all signals for a node when it's deleted.

### DOM shield system (2026-06-09)
- **createDerpShield(node):** Creates a position: fixed overlay div with pointer-events: auto that captures all mouse events before they reach the canvas. Includes 4 corner resize handles with appropriate cursors. Handles pointerdown/pointermove/pointerup/wheel/dblclick/contextmenu events.
- **syncDerpShield(node):** Positions/shows the shield to match node position on screen. Uses a stateHash to skip redundant syncs � checks pos, size, scale, offset, collapsed, debugMode, canvas rect, deck edges, autoWidth/autoHeight. Translates canvas coordinates to CSS transforms.
- **Coordinate translation:** Shield events provide localX/localY (node-relative) and screenX/screenY (screen-absolute). Translation accounts for canvas scale, offset, and node padding.
- **Resize handles:** Dynamic cursor and visibility based on utoWidth/utoHeight. 
wse-resize (bottom-right), 
esw-resize (bottom-left), plus top corners. Disabled for system panels.
- **Debug modes:** Hitbox/WIdgets Hitbox mode renders red rectangles over layout regions. Z-index elevated to MASTER_Z.debugHitbox in debug mode.
- **Signal Out link handles:** Special handling for xcpDerpSignalOut nodes � creates individual link handle divs for each output slot.

### handleDrawCTX (2026-06-09)
- **Canvas rendering dispatch:** Called from onDrawForeground for each frame. Paints the entire node: background, header region, content regions, footer.
- **Background paint:** Resolves canvas theme key paint data with palette overrides via pplyNodeCanvasPalette. Handles bypassed state (_DIS) and selected state (_ON pulse).
- **Header/body split:** When a headerRegion exists, splits painting into header (top, rounded top corners) and body (bottom, rounded bottom corners). Uses different paint data for each.
- **Selection pulse:** When selected and not bypassed, alternates between _ON and _OFF paint states for a subtle glow animation. Gated by ANIM_SELECTION_PULSE.
- **Static background cache:** For non-rounded/non-effect backgrounds, caches the rendered background as a bitmap. Keyed by size + paint fingerprint. Skips repaint on cache hit.
- **Collapsed state:** Uses special corner cap rendering that rounds ALL corners (no body split). Header theme paint overrides body paint.
- **Deck corner overrides:** Docked nodes get corner overrides from getDeckCornerOverride � adjacent docked edges get square corners.

### Widget factory (masterWidgets.js) (2026-06-09)
- **Re-export hub:** Every widget's create/sync function flows through masterWidgets.js. The COMPONENT_BLUEPRINTS registry in masterLayoutTypes.js imports from here.
- **Widget protocol:** Three-part themeKey (BodyKey, LabelKey, FontSizeOverride), parsed via parseThemeKey, resolved via 
esolvePaintData, font override from 3rd part.
- **HTML vs Canvas:** Most widgets have both canvas and HTML variants (e.g., syncBtnSimple vs syncBtnSimpleHTML). HTML widgets create DOM elements inside the shield, canvas widgets draw on the main canvas context.
- **Z-index allocation:** getNextZIndex() starts at 10001, increments per HTML widget. Used for DOM stacking order within the shield overlay.

### Fatha framework docs (2026-06-09)
- **FRAMEWORK-Fatha.md:** Authoritative reference for the entire Fatha architecture. Covers the render hijack (Perfect Heist), node registration, draw lifecycle, core engines, helpers, and Uncle hybrid framework. The authoritative source for onDrawForeground frame loop details.
- **FRAMEWORK-Basta.md:** Basta panel system reference. Covers BastaInstance lifecycle, panel inventory (11 panel types), show/hide patterns, global registry, sticky drag sync, collision detection, and search tab anchoring.
- **FRAMEWORK-Motha.md:** Theme system reference. Covers theme data structure (three-tier resolution: state-specific, @key palette, per-node palette), theme config layout, theme actions (delete, rename, copy, save), and the PRIVATE MODULE designation for themeManagerV2 files.
### Drag-and-drop system (2026-06-09)
- **Hold-first activation:** startStackDrag arms a 500ms hold timer. _dragThresholdMet is only set to true after the hold completes (ctivateStackDrag). Click actions must call endStackDrag(node, arrayKey) to cancel the pending hold timer and prevent unintended drag activation.
- **Update/drop:** updateStackDrag handles pointer movement during drag, computes drop target index based on pointer position relative to row positions. endStackDrag finalizes the reorder by mutating the node's property array.
- **Release lock:** STACK_DRAG_RELEASE_LOCK_MS = 120 � prevents accidental re-trigger after a drag completes. All horizontal deck members get the lock.
- **Horizontal deck sync:** inalizeHorizontalStackStructure remeasures all dock members and syncs heights after DnD-induced structural changes.
- **Layout hash gating:** Layout maps include _dragThresholdMet in their state hash. When a drag is active, the hash changes, forcing layout rebuild for drop preview rendering.

### System panel (fathaSysPanel.js) (2026-06-09)
- **Virtual node proxy:** sysPanel is a singleton object that impersonates a node � it has isSysPanel: true, isSystemPanel: true, hostNode, dynamicElements, layout (masterLayoutEngine), interactionShield. Satisfies all Fatha APIs without being a real LiteGraph node.
- **Layout:** Uses getPanelBaseMap() from athaLayoutMaps.js for the system panel's layout map. Same masterLayoutEngine as Fatha nodes.
- **Shield:** Own DOM shield at z-index 9000 (SYS_PANEL_SHIELD_Z), HTML elements at 9500 (SYS_PANEL_HTML_Z).
- **Animation:** Slide (nimatePanelSlide, speed 0.5) + fade (nimateAlpha, speed 0.3) for open/close transitions. Viewport fitting via ensureScreenRectVisible.
- **Close conditions:** Click outside (closeOnClickOutside), drag of host node, host node deletion, graph mode changes.
- **Basta integration:** Can spawn Basta panels (file handler, message, system message, palette) from within the system panel.

### Extender system (2026-06-09)
- **ComfyUI extension pattern:** Extenders use pp.registerExtension({ name, setup, beforeRegisterNodeDef }). They hook into ComfyUI's native API to bridge between the LiteGraph graph system and derp's custom frameworks.
- **wirelessExtender.js:** Listens for executed API events. When a node with isWirelessTransmitter property finishes executing, transmits its output as a wireless signal. Adds context menu options to enable/disable wireless on non-derp nodes.
- **bypassExtender.js:** Handles remote bypass � nodes can configure derpRemoteBypass.signalId to listen to another node's signal and bypass/unbypass based on it.
- **paletteExtender.js:** Context menu palette application for non-derp nodes. Uses window.xcpDerpPaletteCache (separate from window.xcpPaletteCache).

### Dropdown/FileBrowser HTML overlay (dropdown_lib.js) (2026-06-09)
- **HTML overlay engine:** Shared infrastructure for dropdown menus and file browser pickers. Renders picker panels as HTML elements overlaid on the canvas.
- **HTML effect factors:** DERP_HTML_ALPHA_FACTOR, DERP_HTML_BLUR_FACTOR, DERP_HTML_CORNER_SCALE, DERP_HTML_OFFSET_FACTOR � compensate for HTML's different shadow rendering vs Canvas.
- **Hybrid theme keys:** 
esolveHybridThemeKeys(themeKey) splits compound keys for picker dropdowns (bodyKey for background, pickerKey for dropdown panel, textKey for row text).
- **Animation:** DROPDOWN_ANIM_SETTINGS with lerpFactor 0.325, alphaFactor 0.2, fadeThreshold 0.5.
- **CSS color conversion:** 	oCssColor handles both string colors and [r,g,b,a] arrays ? 
gba().

### Small widget patterns (2026-06-09)
- **widget_LineBreak:** Simplest widget � dual 1px lines (dark top + light bottom) for visual separation. Uses 
esolveWidgetEnv for alpha. Factory returns { type, themeKey, margin }.
- **widget_Region:** Container widget with 
egionOffset for visual padding expansion. Three-tier paint resolution: (1) explicit palette file/entry, (2) node-level 	hemeToEdit injection, (3) global theme registry. Supports hoverEffect � checks parentKey chain for hovered descendants.
- **popupPrompt:** HTML-only single-line text input. position: fixed with getNextZIndex(). Stops event propagation. onChange/onEnter callbacks.
- **btnCheckBox.js:** Empty stub (0 bytes) � placeholder for future checkbox widget.
### Layout engine traps (2026-06-09)
- **match sizing is height-dependent.** width: "match" computes as height � multiplier. If the parent is height: "auto" and the height isn't resolved yet, it falls back to parentHeight (from context) or 12px. This means match-sized children can temporarily render at 12 � multiplier pixels during the first measurement pass, then snap to the correct size on the second pass.
- **PASS 1 runs at SQUISH_WIDTH = 10.** All text measurement in the rigid floor pass happens in a 10px-wide container. This is intentional � it forces every widget to report its minimum possible width. But if a widget's minWidth is set higher than the squished text width, the contentMinWidth gets inflated, and PASS 2 then uses that inflated width for all subsequent measurements. This compounding effect means an overly conservative minWidth in one child can balloon the entire node.
- **ypassHashOptimization: true disables layout caching for that subtree.** Every frame, the engine skips the hash check and recomputes that region and all its descendants. If set on a high-level region (like the root panel), every node using that pattern pays the full layout cost every frame. Only use it on regions that genuinely change every frame (animated text, dynamic children).
- **Footer anchoring is fragile during animation.** The footer sync formula in onDrawForeground is (nodeHeight - footerMargin - footerH) - footerY. During nimateDerpSize, the node height is lerping but the layout engine's ooterY was computed against the TARGET height. This mismatch causes the footer to visually jump until the size animation completes.
- **4-value vs 2-value margins behave differently in the measurement pass.** A 2-value margin [x, y] is converted to [x, y, x, y] internally, BUT the layout engine's measurement cache key uses the raw config value. If you pass [mW, mH] and later change to [mW, mH, mW, mH], the cache key differs even though the effective margin is identical � triggering unnecessary recomputation.
- **RESERVED_KEYWORDS defines what ISN'T a child.** The layout engine treats every object-typed key in a region config as a child region UNLESS it's in the reserved list. This means adding a new config property with an object value (like palette: { path: "...", entry: "..." }) will be misidentified as a child region UNLESS it's added to RESERVED_KEYWORDS. Symptoms: mysterious extra "children" appearing in layout, or the engine trying to measure a config object as a widget.
- **The measurement cache key includes parentHeight.** _buildMeasureCacheKey hashes the context.parentHeight into the cache key. If the parent height changes (e.g., during node resize), all cached measurements are invalidated. This is correct behavior but means that resizing a node triggers a full measurement pass � the layout cache doesn't help during drag-resize.

### EDITOR alignment consistency (2026-06-09)
- **Do not split EDITOR vertical alignment by host type.** System panels, regular Fatha nodes, and ThemeManager fields must use the same `labelAlign` math; special flex handling for `isSysPanel` makes identical configs render differently.
- **Do not apply `numberOnly` baseline nudges.** Numeric EDITOR fields and text EDITOR fields should share the same center calculation. If numeric glyphs look different, fix the renderer baseline globally rather than adding per-config offsets.
- **EDITOR metric caches must include alignment inputs.** Cache keys must include `labelAlign`, padding, theme/font parameters, `numberOnly`, and scale when those values affect vertical positioning.

### Agent memory maintenance (2026-06-09)
- **Use `AGENTS.md` as Codex's primary project memory.** This project now uses Codex as a parallel agent, so persistent instructions and lessons must be kept current here.
- **Maintain `.monkeycode/MEMORY.md` as a backup memory file.** When adding durable user/project lessons to `AGENTS.md`, also mirror a concise backup entry into `.monkeycode/MEMORY.md` if the file exists.
- **Preserve `.monkeycode/` across git workflows.** It is agent workspace data, not repo source, and must not be overwritten or removed by git, stash, pull, checkout, cleanup, or sync workflows.
- **Do not edit the `## Coding Guidelines` section casually.** Keep memory-policy updates in Lessons Learned unless the user explicitly asks to change Coding Guidelines.

### User communication preferences (2026-06-09)
- **Default to English.** Respond in English unless the user explicitly asks for another language in the current conversation.
- **Keep replies concise and direct.** Prefer executing the requested fix over repeatedly pausing for confirmation when the task is clear.
- **Report only current-turn file changes.** At the bottom of each response, list only files changed in the current turn; if no files changed, state none. Do not list line-level changes unless asked.
- **Avoid noisy implementation details in final reports.** Summarize intent and verification, not every internal edit.

### Git and workspace rules (2026-06-09)
- **Default branch for sync is `daily-development`.** Use another branch only when explicitly requested.
- **When user says `GIT PULL`, they mean sync this workspace to their pushed remote state.** Agent tracked edits may be discarded only when explicitly syncing as requested, but untracked agent workspace data must be preserved.
- **Never use broad untracked-file stash/cleanup on agent data.** In particular, do not use `git stash -u` or similar workflows that can hide `.monkeycode/`.
- **Public release flow is separate.** Public release state should be synced to the public repo `main` before version/tag/release work; Deepseek handles remote/ComfyUI Registry publishing.
- **Repository names:** private repo is `xcpDerpNodes`; public release repo is `xcpDerpNodes-release`.

### Localization and text rules (2026-06-09)
- **Node/user-visible text requires locale updates.** Add/update locale entries instead of leaving final UI strings hardcoded in layout maps.
- **`fathaLayoutMaps.js` tooltips must call `tLocale(...)`.** `masterLayoutEngine` does not auto-localize `toolTip`, so do not leave raw `$...` keys or hardcoded final text.
- **Keep EN/ZH/RU tooltip locales in sync** when adding fatha layout tooltip text.
- **Default node titles use shared localization.** Keep default title locale keys at top-level `derp_*.title` or `fatha_layout.title_default`; title editors must set `properties._derpCustomTitle` when users rename nodes.
- **Preferred translations:** `derp Prompt Book` -> `永登宝典`; `WarpPoint` -> `传送点`.

### Node 2.0 compatibility lessons (2026-06-09)
- **Isolate Node 2.0 fixes.** Put Node 2.0/Vue compatibility logic behind `isComfyVueNodesMode()` or a dedicated compatibility layer; do not pollute legacy shared paths.
- **Do not regress legacy mode.** When fixing a mode-specific bug, explain how the change avoids affecting the other mode.
- **Use size setters in Node 2.0.** For real Fatha/Uncle graph nodes in Vue mode, update size through `node.size = [w, h]` or `setDerpNodeSizeCompat(node, w, h)`, not `node.size[0]`/`node.size[1]` mutation.
- **Basta overlays are not real graph nodes.** Do not blindly apply Node 2.0 graph-node size setter rules to Bastas/dialog overlays.
- **Node 2.0 group-move release drift is mode-specific.** Legacy group movement works for docked stacks; avoid legacy hooks unless new evidence appears.

### Docking and sizing lessons (2026-06-09)
- **Vertical docking free-height mode uses `autoHeight = false`.** Docking into a vertical stack should set manual height unless the node forces auto height via `properties.deckForceAutoHeight = true`; restore the prior setting on undock.
- **Vertical seam resize is disabled for collapsed/auto-height nodes.** Only show height resize handles when both neighboring nodes are expanded and manual-height.
- **Horizontal dock maintenance must be gated.** Do not run shared-height sync/normalization for every deck member every draw frame; use geometry signatures and graph indexes to avoid 30 FPS regressions.
- **SeedV2 docking issues are not automatically LoRAStack bugs.** Do not change `derpLoraStack` footer/layout for SeedV2 horizontal docking collapse unless evidence points there.
- **Loader-like nodes can trigger shared-height collapse.** Compare common loader layout/docking features before blaming Seed-only sizing.

### FileBrowser and Basta lessons (2026-06-09)
- **Loader FileBrowser triggers should follow the performant pattern.** Use `mouseOver: false`, `themeKey: "dialog, t_textNormal"`, normal text font sizing, and an appropriate `fileType`.
- **Do not remove `derpSamplerLoader` search.** It explicitly needs `searchTab: true`; fix performance at the FileBrowser/searchTab root cause.
- **FileBrowser picker should preserve canvas pan.** Opening a picker should not block external pointerdown pan/drag; outside close should happen on pointerup and ignore completed canvas drags.
- **Picker visual rules:** picker panel should use theme corners, avoid hardcoded child `corners`, and draw in a late/high canvas overlay phase to avoid being covered.
- **Picker warp parameters belong at file top.** Keep key picker warp/spacing variables explicit and account for current canvas zoom.
- **Search tab lifecycle:** `bastaSearchTab` is a minimal EDITOR-only Basta tied to picker open/close, positioned from the caller rect, not the picker panel; clicking it must not close the picker.
- **Search behavior scrolls, not filters.** Search should keep the full picker list and scroll to the best match.

### DerpEditor and title editing lessons (2026-06-09)
- **Do not debug editor alignment through unrelated widgets.** For HTML/canvas editor shifts, stay scoped to `derpEditor` alignment unless hard evidence points elsewhere.
- **Canvas-shield editors hide DOM while asleep.** CSS changes to asleep DOM do not affect visible non-editing state when canvas shield rendering is active.
- **Canvas owns asleep EDITOR visuals.** For `canvasShield` EDITORs, Canvas must draw the asleep background and text; DOM stays as an invisible hit/focus/editing surface. DOM-rendered asleep boxes/text drift against canvas controls under zoom because CSS transforms and Canvas use different subpixel/compositor paths.
- **Do not solve EDITOR zoom drift with per-zoom nudges.** If background/text drift changes with canvas zoom, move asleep visuals into the Canvas path instead of adding height, baseline, or translation compensation to the DOM overlay.
- **Do not override EDITOR activation locally.** Avoid layout-level `onPress` replacements for editor focus; fix/reuse `derpEditor` activation so first click can focus and select text correctly.
- **Title editing uses the in-place header EDITOR.** Do not add Basta wrappers for node title editing; title click should focus/select the existing header editor.

### FileBrowser refactor lessons (2026-06-09)
- **Keep helper files under `js/herbina/widgets/helpers/`.** Continue gradual FileBrowser refactors there.
- **Current split:** `widget_FileBrowser.js` keeps state/events/orchestration; `fileBrowserHelpers.js` holds pure logic; `fileBrowserPreview.js` handles preview loading/drawing/pending state; `fileBrowserDraw.js` handles rows and breadcrumbs.
- **Refactor pure logic first.** Defer drawing/event splits until data helpers are stable.

### Signal and wireless lessons (2026-06-09)
- **Wireless receiver pattern:** set `properties.isWirelessReceiver = true` and `properties.drawSignalBtn = true`; use existing header `btnSignal` and `showBastaSignalReceiver(node, "btnSignal", signalFilters)`.
- **Indexed wireless transmitter IDs:** use `${baseId}:${index}` and write complete signal records into `window.xcpDerpSignals`; debounce backend `/xcp/update_signal` updates.
- **Bypass indexed outputs to empty strings.** For indexed wireless outputs, emit empty content when `mode === 4` or `_derpSpoofedBypass`.
- **Force `derpSignalOut` refresh for one-shot title changes.** Its 200ms throttle can swallow immediate title-change notifications unless a force-refresh path is used.
- **Signal-source rename warnings use `showBastaSystemMessage`.** Use warning mode and accent text with default registered source names.

### Node-specific lessons (2026-06-09)
- **Derp Concatenate signal selection:** use in-node `FILEBROWSER` with `mode: "signal"`, not the header Basta wireless selector; signal entries should become a dynamic array-driven list.
- **Diffusion Loader structure:** `derpDiffusionLoader.js` lives in `js/controldeck/`; core logic in `js/controldeck/core/derpDiffusionLoader_core.js`; backend source covers both `diffusion_models` and `unet`.
- **SeedV2 fixed-mode hashing:** inject virtual wireless state affecting execution into `derpSeedV2_core.js` prompt-state hash, including model deck active model and bypass state.
- **LoRA distortion clue:** fixed SeedV2 mode can trigger persistent render-state pollution affecting both joint and cross attention; changing seed alone may not recover output.
- **ThemeManager font weight:** font weight support may drop legacy italic/both semantics; include font weight in change detection and JSON persistence, and prefer actual font weight detection when available.
- **Bundled user assets:** `bundled_asset_sync.py` should sync all direct subdirectories under `user/derpNodes/`, not a fixed whitelist.

### Debugging and failed-fix lessons (2026-06-09)
- **Investigate before broad FileBrowser punch-through fixes.** Prior ineffective attempts included global pointermove consumption, Basta wrapper hover blocking, client-coordinate hover payloads, shared handler panel-rect checks, and active-owner blocking.
- **Do not stabilize LoRA drag by rendering transparent full rows.** That creates ghost entries; stabilize the add-LoRA anchor/drag preview without generating extra rows.
- **Whole-wall cache can hide correct state.** If state/layout are correct but visuals revert, inspect passive whole-wall cache keys, not just widget state or local bitmap cache.
- **TriggerWall active visual state belongs in whole-wall cache keys** via `_triggerWallVisualHash` or equivalent visual hash.
- **For layout anomalies, trace `masterLayoutEngine` and `widget_Region` first** before patching symptoms.
- **Color-key tokens override paint overrides on the same widget.** If a widget has both `{{keyName}}` tokens in its text AND `labelColor`/`btnColor` overrides, the `{{}}` tokens produce explicit `colorSegments` that the canvas renders per-segment, silently bypassing the unified `fill`/`textColor` from the paint override. Either remove `{{}}` tokens when the toggle is off (gate the format function), or use only one coloring mechanism. **Fix pattern:** create a wrapper like `seedDisplayText(text, index)` that calls the format function only when `useColorKeys` is true, returns plain text otherwise.
- **When asking user to enable debug logs, include exact console commands** in the same response.

### Dual-path state logic must stay in sync (2026-06-10)
- **Layout map widgets with a value-hydration fast-path have two code paths that set `state`**: the initial layout map definition and the value-hydration block inside the structure-hash cache check. Both must contain identical state logic. When one path has extra conditions (e.g., `no triggers ? DIS`) and the other doesn't, unrelated toggle changes that hit the hydration path will silently reset the widget to the wrong state.

### Trigger widget paint overrides (2026-06-10)
- **`bodyPaint` overrides `themeKey` state resolution in `COMPOSITE_TRIGGER`.** Use explicit `bodyPaint` only when intentionally decoupling visual colors from functional widget state, such as clickable inactive TriggerWall triggers that need `_DIS` colors while remaining functional `_OFF`. Otherwise prefer the normal `themeKey` + suffix path so ThemeManager edits apply predictably.
