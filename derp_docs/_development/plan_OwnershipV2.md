# Ownership V2 Fix Plan

Date: 2026-06-20

## Goal

Fix the ownership conflicts identified in the child-node audit by moving shared height, dock, viewport, and interaction semantics back into Fatha framework code, while leaving child nodes responsible only for node-specific display policy and local widget behavior.

## Core Diagnosis

The main failure pattern is shared state being owned twice.

Several clipped child nodes currently write local meaning into:

- `autoHeight`
- `deckSavedAutoHeight`
- `_minExpandedHeight`
- `_savedExpandedHeight`

Fatha and the dock/resize system also read and interpret those same fields during:

- runtime sizing
- seam resizing
- collapse restore
- dock settlement
- Deck Pressure branch fitting

That overlap stays mostly self-consistent in standalone mode.

Once a node enters a vertical stack, horizontal stack, or decked sandwich layout, the same fields become shared layout contract state, which is where regressions start.

## Target Ownership Split

### Child nodes should own

- `scrollViewport` declarations
- `clipHeight` and `minClipHeight` policy
- Height Mode labels and node-specific options such as row-count choices
- node-local content measurement helpers
- widget-specific behavior such as slider draft values or row toggles

### Fatha framework should own

- interpretation of `autoHeight` while docked
- interpretation of saved manual-height state
- runtime height floors during resize and settle
- collapse and uncollapse restore behavior
- horizontal shared-height synchronization
- Deck Pressure branch settlement
- shared pointer phase ordering and dock/resize lifecycle

## Implementation Phases

## Phase 1: Unify Height-State Contract

Primary goal:

Create one shared meaning for `autoHeight`, `deckSavedAutoHeight`, `_minExpandedHeight`, and `_savedExpandedHeight`.

Work:

1. Add or consolidate a single runtime-height resolution path in:
   - `js/fatha/core/fathaHandler.js`
   - `js/fatha/core/dockResize.js`
2. Separate three categories of state:
   - node declaration state
   - framework runtime state
   - collapse or detach restore state
3. Make `resolveDerpRuntimeSizeImpl()` the only place that applies runtime expanded-height floors.
4. Audit every read and write of `_savedExpandedHeight` and `_minExpandedHeight` in:
   - `js/fatha/core/dockResize.js`
   - `js/fatha/core/masterDockEngine.js`
5. Remove ambiguous mixed semantics where one field means one thing standalone and another thing while docked.

Expected files:

- `js/fatha/core/fathaHandler.js`
- `js/fatha/core/dockResize.js`
- `js/fatha/core/masterDockEngine.js`

## Phase 2: Make Height Mode Fully Declarative In Child Nodes

Primary goal:

Stop child nodes from directly deciding dock-aware auto-height behavior.

Target nodes:

- `js/derps/controldeck/derpSeedV3.js`
- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/derpLoraStack.js`

Work:

1. Keep `getDerpHeightModeConfig()` focused on node-local mode values only.
2. Remove direct writes of dock semantics through `properties.autoHeight` and `properties.deckSavedAutoHeight` from node-side Height Mode callbacks.
3. Introduce a framework-facing helper or derived policy input for standalone preferred auto-height behavior.
4. Let Fatha interpret the chosen Height Mode differently depending on standalone, stack, or deck context.

Success check:

Changing Height Mode updates the node's intended viewport policy, while dock behavior is resolved entirely by framework code.

## Phase 3: Convert `_minExpandedHeight` From Command To Hint

Primary goal:

Child nodes may measure a floor, but only the framework should decide when that floor is binding.

Target files:

- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/fatha/core/dockResize.js`

Work:

1. Replace direct node-side runtime clamping patterns with a measured-floor helper output.
2. Treat measured one-row or one-entry height as advisory input, not direct shared contract state.
3. Apply that floor in framework runtime sizing only when the current context requires it.
4. Ensure `Fit Node` behavior can still shrink correctly inside seam-resized stacks and Deck Pressure branches.

Success check:

The same measured floor can be reused safely across standalone, vertical stack, horizontal stack, and decked layouts without node-local override logic.

## Phase 4: Remove Child-Issued Shared Height Commands

Primary goal:

Only framework layout code should trigger horizontal shared-height synchronization.

Target files:

- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/fatha/core/fathaHandler.js`
- `js/fatha/core/dockDimensions.js`
- `js/fatha/core/masterDockEngine.js`

Work:

1. Remove direct child-node calls to `syncHorizontalDeckHeight()`.
2. Replace them with neutral structure-dirty signals such as `_layoutDirty` or `requestDerpSync()`.
3. Make framework docking logic detect when a horizontal group member changed structure and re-resolve shared height there.
4. Keep Deck Pressure branch calculations branch-local so mixed-axis membership does not corrupt height settlement.

Success check:

Adding or removing rows in a child node updates the stack height through framework recompute, not through child-node layout commands.

## Phase 5: Reduce Node Wrappers Around `handleShieldInteraction`

Primary goal:

Keep node wrappers only for true widget semantics, and move shared gesture lifecycle control back into framework code.

Target files:

- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/derps/controldeck/core/derpSlider_core.js`
- `js/fatha/core/fathaDOMshield.js`
- `js/fatha/core/fathaHandler.js`

Work:

1. Enumerate which interaction states are framework-owned:
   - resize session state
   - dock drag lifecycle
   - viewport hit remap
   - pressed and hovered region ownership
2. Enumerate which interaction states are node-owned:
   - slider draft value
   - row reorder intent
   - cache suspend window
   - widget-local click interpretation
3. Remove node-side wrappers that alter framework event phase ordering.
4. Add narrow framework hook points if a node still needs custom pre-click or drag-finalize behavior.

Success check:

Pointerdown, drag, resize, hover, and dragEnd sequencing are stable across all node types, while custom widgets still behave correctly.

## Phase 6: Migrate Nodes In Safe Order

Recommended order:

1. `derpSeedV3`
2. `derpTriggerWall`
3. `derpLoraStack`
4. `derpSlider`
5. `derpDiffusionLoader` as a baseline verification sample
6. `derpImageDeck` as final deck-pressure validation

Why this order:

- `derpSeedV3` is the smallest clipped-node Height Mode case.
- `derpTriggerWall` and `derpLoraStack` are more complex and benefit from a proven framework contract.
- `derpDiffusionLoader` is a simple control sample.
- `derpImageDeck` should be validated last because it is the deck hub owner.

## Phase 7: Verify In Four Contexts For Every Migrated Node

Each node should be validated in:

1. standalone
2. vertical stack
3. horizontal stack
4. Deck Pressure branch in a decked sandwich layout

For each context, check:

- Height Mode switching
- manual seam resize
- collapse and uncollapse restore
- release-settle next-frame behavior
- structural row or group changes
- branch reflow after attach, detach, or resize

Special watch points:

- looks correct during drag but snaps wrong on release
- collapse restore uses stale height
- shared-height sync grows siblings unexpectedly
- branch reflow redistributes height into unrelated members

## Phase 8: Update Framework Documentation

After the code contract is stable, update:

- `derp_docs/FRAMEWORK-Docking.md`
- `derp_docs/FRAMEWORK-Clipping.md`
- `derp_docs/FRAMEWORK-Fatha.md`
- `derp_docs/FRAMEWORK-Nodes.md`

Documentation updates should explicitly state:

- which height fields are framework-owned
- which values nodes are allowed to declare
- how clipped Height Mode integrates with stacks and decks
- where child-node interaction wrappers are acceptable

## First Cut Recommendation

The first implementation cut should be narrow and high leverage.

Recommended first cut:

1. Unify height-state semantics in `dockResize.js` and related framework helpers.
2. Migrate `derpSeedV3` to pure declarative Height Mode ownership.
3. Validate standalone, vertical stack, horizontal stack, and Deck Pressure branch behavior.

If that cut stabilizes, apply the same contract to `derpTriggerWall` and `derpLoraStack`.

## Practical Definition Of Done

Ownership V2 is complete when all of the following are true:

- clipped child nodes no longer write shared dock semantics directly
- runtime height floors are applied from one framework path
- horizontal shared-height sync is issued only by framework layout logic
- collapse restore uses one clear saved-height contract
- node wrappers around `handleShieldInteraction` only handle widget-local behavior
- standalone and docked behavior follow the same documented ownership model
