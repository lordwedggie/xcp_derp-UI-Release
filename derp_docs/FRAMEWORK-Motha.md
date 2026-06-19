# <span style="color: #ff8080">Framework:</span> <span style="color: #ffffff">Motha Theme System</span>

## <span style="color: #80ffc0">Overview</span>
Motha manages the theme/palette/effect system for all derp nodes. Themes are JSON objects stored in `ComfyUI/user/derpNodes/Palettes/_system/`. The active theme config lives at `window.xcpDerpThemeConfig`.

<span style="color: #ffc680"><strong>PRIVATE MODULE:</strong></span> `themeManagerV2.js` and `themeManagerV2_core.js` are excluded from public releases. Never publish these files.

<span style="color: #80aaff"><strong>Entry point:</strong></span> `js/motha/themeManagerV2.js` → `themeManagerV2_core.js`
<span style="color: #80aaff"><strong>Core:</strong></span> `js/motha/core/`
<span style="color: #80aaff"><strong>Last reviewed:</strong></span> 2026-06-04

## <span style="color: #80ffc0">Architecture</span>

### <span style="color: #80ffc0">Core Files</span>
| File | Role |
|------|------|
| `core/themeConfig.js` | Theme configuration object structure |
| `core/themeExtension.js` | Extension registration for theme nodes |
| `core/themeHandlers.js` | Theme CRUD operations |
| `core/themeSyncNode.js` | Syncing theme changes to all Fatha/Uncle nodes |

### <span style="color: #80ffc0">Helpers</span>
| File | Role |
|------|------|
| `helpers/themeManager_keyHandler.js` | Theme key edit UI: `pushThemeUpdate()`, `updateMainEditRegion()`, `bindKeyMainEvents()` |
| `helpers/themeManager_effectHandler.js` | Effect region UI: `updateEffectRegions()`, `bindEffectEvents()` |
| `helpers/themeManager_themeHandler.js` | Theme actions: delete, rename, copy, save, dropdown change |
| `helpers/themeManager_paletteUtils.js` | Palette utilities: `getSystemPaletteDisplayName()` |
| `helpers/themeDataUtils.js` | General theme data helpers |

### <span style="color: #80ffc0">Templates</span>
| File | Role |
|------|------|
| `templates/defaultTemplates.js` | Default theme templates |

## <span style="color: #80ffc0">Theme Data Structure</span>
Themes have three-tier key resolution:
1. **State-specific:** `key_ON`, `key_OFF`, `key_DIS` (disabled)
2. **Palette references:** `@paletteKey` syntax in color values resolved through `window.xcpActivePalette`
3. **Per-node palette resolution:** Using `headerPaletteIdentity.js`, each node can have its own `_palette` override

### <span style="color: #80ffc0">Theme Config (window.xcpDerpThemeConfig)</span>
```js
{
    activeTheme: "Template_Standard_v02",
    themes: {
        "ThemeName": {
            Category: "Light",
            _layout: {...},
            _palette: {...},
            body: { _OFF: [...], _ON: [...], stroke: [...], shadow: [...], glow: [...] },
            header: {...},
            button: {...},
            // ... theme keys
        }
    }
}
```

### <span style="color: #80ffc0">Theme Key Anatomy</span>
Each theme key has:
- `_OFF` / `_ON` / `_DIS` — RGBA fill arrays (state-dependent)
- `stroke` — `[width, placement]` + `stroke_ON`/`stroke_OFF`/`stroke_DIS` colors
- `shadow` — `[offsetX, offsetY, blur]` + shadow color per state
- `glow` — glow effect parameters
- `font`, `fontSize`, `fontStyle` — text rendering
- `align`, `labelAlign`, `objectAlign` — positioning

## <span style="color: #80ffc0">Painting Pipeline (masterPainter.js)</span>
1. `compileThemeData(themeMain, keyName, state)` — resolves fill/shadow/stroke/glow from theme
2. Color resolution: `resolvePaletteColor(val)` — if value starts with `@`, look up in `window.xcpActivePalette`
3. Cache: WeakMap keyed by `state::paletteName`
4. Returns structured `{fill, fillStyle, shadowData, borderData, glowData}`

## <span style="color: #80ffc0">Theme Update Flow</span>
1. Theme manager node edits a theme key → `pushThemeUpdate()` in keyHandler
2. `handleThemeUpdate()` on every Fatha/Uncle node resolves theme data
3. Node calls `requestDerpSync()` → next frame redraws with new colors
4. `onConfigure()` re-resolves theme on workflow load

## <span style="color: #80ffc0">Palette System</span>
- Palettes stored in `ComfyUI/user/derpNodes/Palettes/_system/`
- Active palette: `window.xcpActivePalette`, `window.xcpActivePaletteName`
- Per-node `_palette` key in theme JSON: node-specific palette override
- `headerPaletteIdentity.js` handles per-node palette identity resolution
- `bastaPalette.js` provides palette selection UI (Basta panel)
- The system palette dropdown supports an explicit `None` item that clears `_palette`/`systemPaletteName` with an empty string value.

## <span style="color: #80ffc0">Key Functions (themeManagerV2_core.js)</span>
- `getThemeManagerSystemTheme(node, cfg)` — resolve active theme with fallback chain
- `purgeLocks(obj)` — recursive lock key removal
- `safePersist(cfg, targetTheme)` — persist theme config
- `safeClick(fn)` — 300ms debounce wrapper
- `playSuccessSound()` — sound feedback on theme operations
- `THEME_META_KEYS` — includes top-level `Category` plus internal `_layout` / `_palette` metadata
- `Category` is saved as the first top-level key in each theme JSON file. Old themes without `Category`, or legacy `_category`, load as `"Other"` unless a category value is present.
- `handleThemeSaveWeightAction(node)` — opens `bastaFileHandler` in save mode and writes theme-weight JSON files under `Themes/_System/` with a case-insensitive `_WT_` filename prefix. The dialog includes an optional `_WT_` file picker so an existing weight file can be selected and overwritten. Weight files contain `_layout`, per-key `corners`, and text-key `font` / `fontSize` / `fontWeight`; they deliberately exclude shadow, stroke, glow, color, clip, and palette data. `_WT_` weight files are protected from ThemeManager delete actions.
- ThemeManager's `themeManagementRegion.dropdownThemeWeight` appears between `dropdownCategory` and `btnThemeDelete`. It loads a `_WT_` file into `node.themeToEdit` and `window.xcpDerpThemeConfig.themes[node._selectedThemeName]`, so the active edit target receives the weight values rather than ThemeManagerV2's own appearance theme.
- System panel `dropdownThemeWeight` loads those `_WT_` files as node-local overlays. It stores the selected file in `properties.selectedThemeWeight`, keeps the loaded data on `node._themeWeightOverlay`, and leaves the shared theme config untouched so the weight change affects only the selected node.

## <span style="color: #80ffc0">Maintenance Notes</span>
- Any user-visible theme manager text should use locale keys rather than permanent hard-coded strings.
- When changing palette dropdown behavior, check `themeManagerV2.js`, `themeManager_paletteUtils.js`, `widget_FileBrowser.js`, and FileBrowser helper drawing together.
