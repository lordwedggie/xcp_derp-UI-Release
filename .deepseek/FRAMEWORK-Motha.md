# Motha — Theme System

## Overview
Motha manages the theme/palette/effect system for all derp nodes. Themes are JSON objects stored in `ComfyUI/user/derpNodes/Palettes/_system/`. The active theme config lives at `window.xcpDerpThemeConfig`.

**⚠️ PRIVATE MODULE:** `themeManagerV2.js` and `themeManagerV2_core.js` are excluded from public releases. Never publish these files.

**Entry point:** `js/motha/themeManagerV2.js` → `themeManagerV2_core.js`
**Core:** `js/motha/core/`

## Architecture

### Core Files
| File | Role |
|------|------|
| `core/themeConfig.js` | Theme configuration object structure |
| `core/themeExtension.js` | Extension registration for theme nodes |
| `core/themeHandlers.js` | Theme CRUD operations |
| `core/themeSyncNode.js` | Syncing theme changes to all Fatha/Uncle nodes |

### Helpers
| File | Role |
|------|------|
| `helpers/themeManager_keyHandler.js` | Theme key edit UI: `pushThemeUpdate()`, `updateMainEditRegion()`, `bindKeyMainEvents()` |
| `helpers/themeManager_effectHandler.js` | Effect region UI: `updateEffectRegions()`, `bindEffectEvents()` |
| `helpers/themeManager_themeHandler.js` | Theme actions: delete, rename, copy, save, dropdown change |
| `helpers/themeManager_paletteUtils.js` | Palette utilities: `getSystemPaletteDisplayName()` |
| `helpers/themeDataUtils.js` | General theme data helpers |

### Templates
| File | Role |
|------|------|
| `templates/defaultTemplates.js` | Default theme templates |

## Theme Data Structure
Themes have three-tier key resolution:
1. **State-specific:** `key_ON`, `key_OFF`, `key_DIS` (disabled)
2. **Palette references:** `@paletteKey` syntax in color values resolved through `window.xcpActivePalette`
3. **Per-node palette resolution:** Using `headerPaletteIdentity.js`, each node can have its own `_palette` override

### Theme Config (window.xcpDerpThemeConfig)
```js
{
    activeTheme: "Template_Standard_v02",
    themes: {
        "ThemeName": {
            _category: "...",
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

### Theme Key Anatomy
Each theme key has:
- `_OFF` / `_ON` / `_DIS` — RGBA fill arrays (state-dependent)
- `stroke` — `[width, placement]` + `stroke_ON`/`stroke_OFF`/`stroke_DIS` colors
- `shadow` — `[offsetX, offsetY, blur]` + shadow color per state
- `glow` — glow effect parameters
- `font`, `fontSize`, `fontStyle` — text rendering
- `align`, `labelAlign`, `objectAlign` — positioning

## Painting Pipeline (masterPainter.js)
1. `compileThemeData(themeMain, keyName, state)` — resolves fill/shadow/stroke/glow from theme
2. Color resolution: `resolvePaletteColor(val)` — if value starts with `@`, look up in `window.xcpActivePalette`
3. Cache: WeakMap keyed by `state::paletteName`
4. Returns structured `{fill, fillStyle, shadowData, borderData, glowData}`

## Theme Update Flow
1. Theme manager node edits a theme key → `pushThemeUpdate()` in keyHandler
2. `handleThemeUpdate()` on every Fatha/Uncle node resolves theme data
3. Node calls `requestDerpSync()` → next frame redraws with new colors
4. `onConfigure()` re-resolves theme on workflow load

## Palette System
- Palettes stored in `ComfyUI/user/derpNodes/Palettes/_system/`
- Active palette: `window.xcpActivePalette`, `window.xcpActivePaletteName`
- Per-node `_palette` key in theme JSON: node-specific palette override
- `headerPaletteIdentity.js` handles per-node palette identity resolution
- `bastaPalette.js` provides palette selection UI (Basta panel)

## Key Functions (themeManagerV2_core.js)
- `getThemeManagerSystemTheme(node, cfg)` — resolve active theme with fallback chain
- `purgeLocks(obj)` — recursive lock key removal
- `safePersist(cfg, targetTheme)` — persist theme config
- `safeClick(fn)` — 300ms debounce wrapper
- `playSuccessSound()` — sound feedback on theme operations
- `THEME_META_KEYS` — Set of `["_category", "_layout", "_palette"]`
