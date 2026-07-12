## BSA Spec: Extract shared tLocale() from derpSignalOut

### Goal
Eliminate duplicated `tLocale()` function from `js/derpSignalOut.js` (lines 16-25) and `js/derpSignalOut_core.js` (lines 9-18) into a shared importable helper.

### Finding: Broader Duplication
`tLocale()` is copy-pasted in **15+ files** across the project (`js/derps/loaders/*.js`, `js/derps/controldeck/*.js`, `js/derps/utils/*.js`, `js/fatha/helpers/fathaLayoutMaps.js`, `js/fatha/helpers/fathaSysPanel.js`, etc.). One file (`derpSeedV3_core.js`) already uses `export function tLocale(...)` — the only existing named export.

**Scope for this ticket**: the two `derpSignalOut` files only. The broader consolidation is a separate cleanup.

### Target files (derpSignalOut pair)

| File | Lines | Pattern |
|------|-------|---------|
| `js/derpSignalOut.js` | 16-25 | `function tLocale(key, fallback = key)` (private function) |
| `js/derpSignalOut_core.js` | 9-18 | `function tLocale(key, fallback = key)` (private function, identical body) |

### Landing file: `js/herbina/utils/localeUtils.js` (NEW)
**Rationale**: Both source files can reach `./herbina/utils/localeUtils.js` from their `js/` location with a clean relative import. Herbina utils is the existing shared utility zone (alongside `widgetsUtils.js`). No existing file that both already import from is a natural home — fathaHandler is imported by `_core.js` but not `derpSignalOut.js`.

### Implementation plan

1. **Create** `js/herbina/utils/localeUtils.js`:
   ```js
   /**
    * Path: ./js/herbina/utils/localeUtils.js
    * ROLE: Shared locale/i18n helpers.
    */
   export function tLocale(key, fallback = key) {
       if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
       const path = key.substring(1).split(".");
       let target = window.xcpDerpLocaleData || {};
       for (const segment of path) {
           target = target?.[segment];
           if (target === undefined) return fallback;
       }
       return target;
   }
   ```

2. **In `js/derpSignalOut.js`**:
   - Add import: `import { tLocale } from "./herbina/utils/localeUtils.js";`
   - Delete lines 16-25 (the private `function tLocale`)

3. **In `js/derpSignalOut_core.js`**:
   - Add import: `import { tLocale } from "./herbina/utils/localeUtils.js";`
   - Delete lines 9-18 (the private `function tLocale`)

4. **Verify**: `npm test` passes; no `tLocale is not defined` runtime errors.

### Not in scope
- The other 13+ duplicated `tLocale()` instances across loaders, controldecks, utils, and fatha helpers.
- The `export function tLocale` in `derpSeedV3_core.js` (already exported; this new file would be the canonical source going forward, but migrating consumers is a separate task).
