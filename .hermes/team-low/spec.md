# BSA Spec: Add LINEBREAK Below Book Selector Row

## Overview
Add a LINEBREAK region between the book selector row (`bookRegion`) and the content area (`mainRegion`) in `derpPromptBook`'s layout map, with single `sH` vertical spacing.

## Target File
- **File:** `js/derps/controldeck/derpPromptBook.js`
- **Function:** `refreshNodeLayoutMap` (starting at line 93)
- **Location:** `layoutMap` object (starting at line 142)

## Current Structure Analysis

### Layout Map Regions
```javascript
this.layoutMap = {
    bookRegion: {                    // Lines 142-199: Book selector row
        anchor: { target: "headerRegion", axis: "y", offset: oY },
        dir: "row", width: "full", height: "auto",
        margin: [mW, mH], ...
    },
    mainRegion: {                    // Lines 201-248: Content area
        anchor: { target: "bookRegion", axis: "y" },  // ← Anchors directly to bookRegion
        width: "full", height: "fill", dir: "col",
        margin: [mW, mH, mW, 0],
        contentRegion: { ... }
    },
    pageBreak: {                     // Lines 249-253: LINEBREAK between content and page selector
        type: this.UI_TYPES.LINEBREAK,
        margin: [-mW, mH],
        width: "full", height: 1,
    },
    pageRegion: { ... }              // Lines 254-298: Page selector row
}
```

### Variable Context
From `getDerpVars` (lines 94-97):
```javascript
const [mW, mH, sW, sH, oX, oY, pW, pH] = [
    vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
].map(v => Number(v.toFixed(2)));
```

- `mW` / `mH`: Horizontal/vertical margin
- `sW` / `sH`: Horizontal/vertical spacing (used by anchor mechanism)
- `oX` / `oY`: Offset values
- `pW` / `pH`: Padding values

### Anchor Spacing Mechanism
The anchor's `axis: "y"` automatically applies `sH` spacing between the target element and the anchored element. See `pageBreak` → `pageRegion` anchor at line 255.

## Required Changes

### 1. Insert `bookBreak` LINEBREAK Region
Add a new `bookBreak` region after `bookRegion` and before `mainRegion`:

```javascript
bookBreak: {
    type: this.UI_TYPES.LINEBREAK,
    margin: [-mW, mH],
    width: "full", height: 1,
},
```

**Placement:** Lines 200-204 (after `bookRegion` closes at line 199, before `mainRegion` opens at line 201)

### 2. Update `mainRegion` Anchor
Change `mainRegion` anchor from targeting `bookRegion` to targeting `bookBreak`:

**Before:**
```javascript
mainRegion: {
    anchor: { target: "bookRegion", axis: "y" },
    ...
},
```

**After:**
```javascript
mainRegion: {
    anchor: { target: "bookBreak", axis: "y" },
    ...
},
```

This ensures the anchor mechanism uses `sH` spacing between `bookBreak` and `mainRegion`.

## Expected Layout Flow
```
┌─────────────────────────────────────┐
│       headerRegion (parent)         │
│              ↓ oY offset            │
├─────────────────────────────────────┤
│       bookRegion (selector row)     │
├─────────────────────────────────────┤  ← sH spacing from anchor
│       bookBreak (LINEBREAK)         │
├─────────────────────────────────────┤  ← sH spacing from anchor
│       mainRegion (content area)     │
│              ↓ fill height          │
├─────────────────────────────────────┤
│       pageBreak (LINEBREAK)         │
├─────────────────────────────────────┤
│       pageRegion (page selector)    │
└─────────────────────────────────────┘
```

## Verification Steps
1. The `bookBreak` LINEBREAK should appear visually between the book selector row and content area
2. Spacing between `bookBreak` and `mainRegion` should use `sH` (single spacing unit)
3. Spacing between `bookRegion` and `bookBreak` should use margin `[-mW, mH]` (matching `pageBreak` pattern)
4. The node should still correctly anchor `mainRegion` to the LINEBREAK rather than directly to `bookRegion`

## Related Patterns
- `pageBreak` (lines 249-253): Same LINEBREAK pattern used between content and page selector
- `pageRegion.anchor` (line 255): Shows anchor mechanism with `target: "pageBreak", axis: "y"`
- Both LINEBREAKs use `margin: [-mW, mH]` for consistent spacing
