## BSA Spec: Add FILEBROWSER picker min-width

### Goal
Enforce a minimum width of 200px for the FILEBROWSER picker dropdown panel. Currently the width is driven solely by `config.geometry.w`, which callers can set arbitrarily small — nodes like LoRAStack or tiny loaders may pass a geometry narrower than usable for the picker contents.

### Files to change

1. `js/herbina/widgets/widget_FileBrowser.js`
2. `js/herbina/widgets/helpers/fileBrowserDraw.js`

### Exact changes

#### File 1: widget_FileBrowser.js

**A. Add module-level constant** (after line 165, after `PICKER_FIRST_ROW_MARGIN`):

```
const FILEBROWSER_MIN_TRIGGER_WIDTH = 200;
```

**B. Enforce in `openFilePicker`** — line 608:

Before:
```js
currentSize: [config.geometry?.w || 200, 4],
```

After:
```js
currentSize: [Math.max(config.geometry?.w || 200, FILEBROWSER_MIN_TRIGGER_WIDTH), 4],
```

This ensures `state.currentSize[0]` (the stored picker width) always ≥ 200.

#### File 2: fileBrowserDraw.js — `calculatePickerPanelLayout`

**C. Use `state.currentSize[0]` for `panelW`** — line 334:

Before:
```js
const panelW = config.geometry.w;
```

After:
```js
const panelW = state.currentSize[0];
```

**D. Use `state.currentSize[0] * scale` for `panelScreenRect.width`** — line 339:

Before:
```js
width: anchorRect.width,
```

After:
```js
width: state.currentSize[0] * scale,
```

### Rationale

- **`currentSize[0]` is the canonical width source.** It's set once in `openFilePicker` and never mutated (only `currentSize[1]` is animated for height). Enforcing the min-width there propagates naturally to the panel layout and the screen-space hitbox rect.
- **No need to change search tab width** (line 658). The search Basta is a separate overlay — bounding it to the trigger width is intentional.
- **No need to center/offset wider panels.** The panel starts at `config.geometry.x` (trigger left) and extends right. Min-width expansion to the right is acceptable and matches existing scrollbar behavior (which always takes space from the right).

### Verification

1. Supply a config geometry with `w < 200` (e.g., `{ x: 0, y: 0, w: 120, h: 24 }`).
2. Open picker — panel width must be ≥ 200 (not 120).
3. Supply `w: 300` — panel width must be 300 (unchanged, no hard clamp).
4. Supply no geometry (`config.geometry` undefined) — falls back to `200` from `|| 200`, then `Math.max(200, 200)` → 200.
