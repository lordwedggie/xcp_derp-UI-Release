## Architect Review: Extract shared tLocale() from derpSignalOut

**Date**: 2026-07-12  
**Spec**: `.hermes/team/spec.md`  
**Verdict**: **PASS**

---

### STEP 1 — Placeholder

Written at start.

### STEP 2 — Spec Summary

- Spec targets exactly 2 files: `js/derpSignalOut.js` (lines 16-25) and `js/derpSignalOut_core.js` (lines 9-18).
- Both define identical `function tLocale(key, fallback = key)` private to their module scope.
- New shared file: `js/herbina/utils/localeUtils.js` — an `export function tLocale`.
- Broader 15+ file duplication is noted as out-of-scope; this ticket is the derpSignalOut pair only.

### STEP 3 — Path and Directory Verification

| Check | Result |
|-------|--------|
| `js/herbina/utils/` exists? | ✅ Yes — contains `colorMath.js`, `singletonController.js`, `widgetsUtils.js` |
| `derpSignalOut.js` → `./herbina/utils/localeUtils.js` | ✅ Resolves to `js/herbina/utils/localeUtils.js` (both source files live at `js/`) |
| `derpSignalOut_core.js` → `./herbina/utils/localeUtils.js` | ✅ Same resolution |
| Pattern confirmation from another file | ✅ `js/fatha/basta.js` line 14: `import { resolvePaintData, parseColorKeyText } from "../herbina/utils/widgetsUtils.js"` — confirms `herbina/utils/` is used as a shared import zone with the `../herbina/utils/` pattern from `fatha/`, equivalent to `./herbina/utils/` from `js/` |

### STEP 4 — tLocale() Caller Validation

**derpSignalOut.js** (8 call sites):

| Line | Context | Post-import |
|------|---------|-------------|
| 29 | `getLocalizedSortModeLabel()` — module-level function | ✅ accessible |
| 30 | Same function | ✅ accessible |
| 31 | Same function | ✅ accessible |
| 37 | `normalizeSortModeLabel()` — module-level function | ✅ accessible |
| 38 | Same function | ✅ accessible |
| 39 | Same function | ✅ accessible |
| 268 | `refreshNodeLayoutMap()` — inside registered extension | ✅ accessible |
| 269 | Same method | ✅ accessible |
| 301 | Same method | ✅ accessible |
| 351 | Same method | ✅ accessible |
| 397 | Same method | ✅ accessible |
| 532 | Same method | ✅ accessible |

**derpSignalOut_core.js** (4 call sites):

| Line | Context | Post-import |
|------|---------|-------------|
| 22 | `syncDerpRouterLocaleLabels()` — module-level function | ✅ accessible |
| 24 | Same function | ✅ accessible |
| 66 | `syncDerpRouterDisplayLabels()` — module-level function | ✅ accessible |
| 489 | Inside `app.registerExtension()` setup block | ✅ accessible |

**Function signature match**: `(key, fallback = key)` — identical in both source files and in the proposed `localeUtils.js`. All callers pass 1 or 2 string arguments; fallback defaults to `key` in single-arg calls, preserving current behavior exactly.

### Risk Assessment

- **Circular imports**: None — `localeUtils.js` imports nothing (`window.xcpDerpLocaleData` is global), and neither source file currently imports from `herbina/utils/` (they import from `fatha/` paths only).
- **Scope leakage**: None — both files delete the private definition, the import replaces it exactly.
- **Test impact**: Neither file is covered by Vitest tests (test suite covers pure layout/measurement functions). `npm test` remains a smoke check only.

### Recommendation

**PASS** — spec is clean, paths check out, all callers survive the import, no risk of circular deps or scope breakage. Proceed to implement.
