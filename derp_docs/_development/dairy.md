# Child-Node Ownership Audit Diary

Date: 2026-06-20

## Ownership V2 Framework Update

This entry updates the earlier ownership audit with the framework changes that have now been implemented.

The earlier audit described overlapping ownership around `autoHeight`, dock-aware height persistence, node-manufactured runtime floors, and node-local interaction wrappers. That overlap is no longer just a suspicion on paper. The framework now has explicit shared policy modules and the main clipped-node paths have been migrated onto them.

This entry records the new contract.

## What Changed In The Framework

### Shared height policy now has its own framework owner

New file:

- `js/fatha/core/derpHeightPolicy.js`

The framework now distinguishes two different questions that used to get smashed into raw `properties.autoHeight`:

- preferred height mode for the node itself
- runtime auto-height behavior after docking or stack participation

The shared policy now exposes these roles through:

- `resolveDerpPreferredAutoHeight(node)`
- `resolveDerpRuntimeAutoHeight(node)`
- `applyDerpPreferredAutoHeight(node, preferred)`

That means child nodes no longer need to guess when `autoHeight` should mean “my saved Height Mode preference” versus “the live stack is forcing me to behave manually right now.”

### Docking and resize paths now consume runtime height through the shared contract

Updated framework paths:

- `js/fatha/core/fathaHandler.js`
- `js/fatha/core/dockResize.js`
- `js/fatha/core/masterDockEngine.js`
- `js/fatha/helpers/fathaLayoutMaps.js`

The important ownership shift is that docked runtime behavior is now interpreted by framework code instead of being open-coded by child nodes.

Vertical stacks can temporarily force manual runtime height without erasing the node's saved preferred Height Mode.

System-panel Height Mode display also now reads the preferred value instead of guessing from raw `properties.autoHeight`.

### Clipped nodes now publish preference and viewport hints, not dock commands

Updated child-node paths:

- `js/derps/controldeck/derpSeedV3.js`
- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/core/derpTriggerWall_core.js`
- `js/derps/controldeck/derpLoraStack.js`
- `js/derps/controldeck/core/derpLoraStack_core.js`

The practical split is now much cleaner:

- SeedV3 owns history visibility policy and measured history viewport sizing
- TriggerWall owns clip-visible presets and viewport sizing policy
- LoraStack owns LoRA-row viewport sizing policy and one-entry measurement
- Fatha owns how those preferences behave once the node is in a stack, seam resize, collapse restore, or dock settlement path

This is the big line that was missing before.

## Specific Audit Findings That Are Now Resolved

### 1. SeedV3 local dock-aware height ownership is removed

SeedV3 no longer needs its own dock-aware `deckSavedAutoHeight` branch logic as the source of truth.

It now writes Height Mode changes through the shared height-policy helper and exposes `getDerpPreferredAutoHeight()` for the framework contract.

### 2. TriggerWall raw auto-height writes are replaced by shared preference writes

TriggerWall Height Mode changes now route through `applyDerpPreferredAutoHeight(...)`.

That keeps the node responsible for TriggerWall-specific clip policy while giving Fatha the final say over dock-aware runtime behavior.

### 3. LoraStack runtime min-height is demoted from command to hint

LoraStack no longer pushes `_minExpandedHeight` as a node-owned runtime command and no longer immediately drives horizontal shared-height sync from its structure refresh path.

Instead it publishes `_derpMeasuredMinExpandedHeight`, and `dockResize.js` consumes that only when the resolved runtime mode is actually auto-height.

That is the correct ownership direction.

### 4. Child nodes no longer issue horizontal shared-height commands from local structure updates

The LoraStack path that immediately called `syncHorizontalDeckHeight()` from node-local structure maintenance is gone.

The node now dirties layout and requests sync, while the framework remains the owner of whether a shared-height resync should happen.

## Interaction Ownership Also Moved In The Right Direction

New file:

- `js/fatha/core/derpInteractionPolicy.js`

This does not eliminate all node-local interaction wrappers, and that is fine. Sliders, row drag rules, and custom panel behavior are still node-specific work.

What changed is that the repeated shared glue has started moving out of child nodes:

- drag-suppressed click consumption is now shared through `consumeSuppressedDragClick(...)`
- queued hover replay / throttled hover flood control is now shared through `queueDerpHoverReplay(...)`

Current adopters in this pass:

- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/fatha/bastas/core/bastaLoraDetail_core.js`

That means the wrappers are slimmer and more obviously focused on node-specific behavior rather than quietly duplicating framework event policy.

## New Framework Boundary After Ownership V2

### Child nodes own

- viewport declaration through `scrollViewport`
- node-specific `clipHeight` and `minClipHeight` logic
- node-specific Height Mode labels and persisted values through `getDerpHeightModeConfig()`
- measured viewport hints such as one-entry or one-group floors
- widget-specific interaction semantics for their own sliders, rows, and custom controls

### Fatha owns

- preferred versus runtime height semantics
- dock-aware interpretation of Height Mode
- collapse/restore interaction with saved height state
- seam-resize behavior for docked members
- whether measured min-height hints affect live runtime size
- shared interaction glue such as drag-suppressed click handling and queued hover replay

## Updated Judgment

The original audit was directionally right.

The biggest bug source really was child nodes writing values that looked local in standalone mode but became shared contract data in stack and deck contexts. Ownership V2 fixes that at the contract boundary instead of just patching one resize symptom.

The framework is now much closer to the intended split:

- child nodes declare content policy
- Fatha interprets docked runtime behavior

That is the right foundation for the next round of live resize and deck regression checks.

Date: 2026-06-20

## Scope

This audit reviews how several clipped or dock-aware derp child nodes behave in four contexts:

- standalone
- vertical stack
- horizontal stack
- decked sandwich layouts owned by `derpImageDeck`

The goal is to identify places where child nodes are doing work that overlaps with Fatha's shared ownership of viewport sizing, resize settlement, dock height behavior, or shield interaction routing.

This is a code-reading audit only. No runtime code was changed as part of this review.

## Files Reviewed

### Shared framework files

- `js/fatha/core/fathaHandler.js`
- `js/fatha/core/fathaDOMshield.js`
- `js/fatha/core/dockResize.js`
- `js/fatha/core/masterDockEngine.js`
- `derp_docs/FRAMEWORK-Fatha.md`
- `derp_docs/FRAMEWORK-Docking.md`
- `derp_docs/FRAMEWORK-Clipping.md`

### Child-node files checked

- `js/derps/controldeck/derpSeedV3.js`
- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/derpLoraStack.js`
- `js/derps/controldeck/core/derpLoraStack_core.js`
- `js/derps/controldeck/core/derpSlider_core.js`
- `js/derps/controldeck/derpImageDeck.js`
- `js/derps/loaders/derpDiffusionLoader.js`

## Executive Judgment

The biggest ownership conflict is height state.

Several clipped child nodes still treat `autoHeight`, `deckSavedAutoHeight`, `_minExpandedHeight`, and `_savedExpandedHeight` as if they can safely manage those values locally. The shared framework also interprets the same values during dock resize, collapse restore, viewport floor calculation, and stack settlement.

That overlap is mild in standalone mode because the node is mostly arguing with itself.

Once the same node enters a vertical stack, a horizontal stack, or a Deck Pressure branch, the framework starts using those same properties as cross-node layout contract data. That is the point where node-local assumptions can turn into stack or deck regressions.

## Main Findings

### 1. SeedV3 owns dock-aware height semantics locally

Severity: High

`js/derps/controldeck/derpSeedV3.js:108-131` directly maps Height Mode to `properties.autoHeight`, and when docked it also writes `properties.deckSavedAutoHeight` while forcing `properties.autoHeight = false`.

`js/derps/controldeck/derpSeedV3.js:369-385` repeats that ownership in the system-panel Height Mode callback.

Judgment:

- Node-owned: choosing the visible history policy and the row-count-based `clipHeight` / `minClipHeight`
- Framework-owned: how docked stacks interpret `autoHeight` and saved manual-height state

Why this matters:

SeedV3 is already aware that docked mode changes semantics, which is why it branches on `deckSavedAutoHeight`. That is useful evidence, but it also means the node is partially re-implementing stack policy that the framework also owns.

### 2. TriggerWall still writes raw auto-height directly from its custom Height Mode

Severity: High

`js/derps/controldeck/derpTriggerWall.js:1142-1155` sets `properties.autoHeight` directly from the TriggerWall clip-visible setting.

`js/derps/controldeck/derpTriggerWall.js:927-935` defines a viewport correctly through `scrollViewport`, `clipHeight`, and `minClipHeight`.

Judgment:

- Node-owned: group-count-based viewport sizing policy
- Framework-owned: how `autoHeight` behaves after the node is docked, resized by a seam, collapsed, or pressure-fit inside a deck

Why this matters:

The viewport declaration is clean. The height-state write is where standalone assumptions leak into stack and deck behavior.

### 3. LoraStack writes an explicit runtime floor that the framework later treats as authoritative

Severity: High

`js/derps/controldeck/core/derpLoraStack_core.js:109-140` measures one-entry height, writes `properties._minExpandedHeight`, clamps live height to that floor, and may immediately call `syncHorizontalDeckHeight()`.

`js/fatha/core/dockResize.js:409-412` later applies `_minExpandedHeight` whenever `vars.autoHeight === true`.

Judgment:

- Node-owned: measuring one-entry viewport floor for LoRA rows
- Framework-owned: deciding when that floor applies during runtime sizing, seam resize, and stack/deck settlement

Why this matters:

This is the clearest duplicated contract in the audit. The node manufactures a runtime floor, then the framework consumes it later in a broader context that includes dock groups.

### 4. LoraStack also mixes structure refresh with horizontal shared-height enforcement

Severity: High

`js/derps/controldeck/core/derpLoraStack_core.js:134-140` calls `syncHorizontalDeckHeight()` from inside node-local structure-height maintenance.

Judgment:

- Node-owned: telling the framework that structure changed
- Framework-owned: deciding whether horizontal deck height should be resynced, and to what height

Why this matters:

This is a classic standalone-to-stack escalation point. In standalone mode it behaves like a harmless refresh. In a horizontal group it becomes a shared layout command issued from a child node.

### 5. TriggerWall and LoraStack both wrap `handleShieldInteraction` with node-local routing logic

Severity: Medium-High

`js/derps/controldeck/derpTriggerWall.js:1172-1210` intercepts dropdown and filebrowser hits, writes `_pressedRegionKey`, suspends passive cache, and changes resize-time minimum-width behavior before delegating.

`js/derps/controldeck/core/derpLoraStack_core.js:784-879` throttles hover, manages `_isDerpResizing`, finalizes slider drafts, cancels stack drag state, and performs its own hit-search ordering before delegating deeper.

`js/fatha/core/fathaDOMshield.js:616-994` and `js/fatha/core/fathaHandler.js:1563-1587` already own the shared drag, resize, click, dblclick, hover, and dragEnd pipeline.

Judgment:

- Node-owned: widget-specific interaction semantics for sliders, rows, and custom controls
- Framework-owned: event phase ordering, resize session state, dock drag state, viewport-aware hit routing

Why this matters:

These wrappers are not automatically wrong, but they raise the risk that node-local state machines drift away from the framework's assumptions about the same gesture.

### 6. LoraStack's viewport contract is mostly clean, and that contrast is useful

Severity: Medium

`js/derps/controldeck/derpLoraStack.js:856-863` declares `loraEntriesRegion` through `scrollViewport`, `clipHeight`, and `minClipHeight`.

`js/derps/controldeck/derpLoraStack.js:870-875` and `js/derps/controldeck/derpLoraStack.js:952-957` correctly mark footer and warning regions with `contentViewportClip: false`.

Judgment:

- Node-owned: exactly this kind of declarative viewport shape
- Framework-owned: scrollbar draw, wheel, thumb drag, clipped hit filtering, and dock-aware viewport floor behavior

Why this matters:

This is the healthiest pattern in the audit. It shows the viewport system itself is already centralized enough; the trouble is the extra height and interaction state wrapped around it.

### 7. DiffusionLoader looks like the simpler baseline contract

Severity: Low

`js/derps/loaders/derpDiffusionLoader.js:233-239` uses a straightforward viewport declaration with a property-driven fixed `clipHeight` and no node-local dock policy.

Judgment:

- Node-owned: fixed clip-height choice
- Framework-owned: everything else about clipped-region behavior

Why this matters:

This is useful as a control sample. It is much less likely to develop stack/deck-only regressions because it declares viewport policy without also manufacturing extra dock semantics.

### 8. ImageDeck is the correct place for Deck Pressure ownership, which makes child-side deck writes easier to spot

Severity: Medium

`js/derps/controldeck/derpImageDeck.js:774-782` restores `_savedExpandedHeight` on uncollapse for the hub itself.

That behavior is much less suspicious than the child-node cases because `derpImageDeck` is the actual Deck Pressure hub owner, and deck docs explicitly assign that responsibility to the hub side of the framework contract.

Judgment:

- Hub-owned or framework-adjacent: Deck Pressure frame and hub restoration behavior
- Child-node-owned: their own local content policy only

Why this matters:

It sharpens the boundary. ImageDeck is expected to care about deck-wide geometry. Side branch children are expected to declare local content and let the framework solve the deck.

## Root-Cause Pattern Most Likely Explaining The Reported Regressions

The strongest pattern is this:

1. A clipped child node stores a local meaning into `autoHeight`, `deckSavedAutoHeight`, `_minExpandedHeight`, or `_savedExpandedHeight`.
2. In standalone mode that meaning remains mostly local.
3. Once docked, the framework reads the same field as shared resize or settlement contract state.
4. A later seam drag, collapse restore, horizontal shared-height sync, or Deck Pressure fit pass reuses the value in a broader context than the child node expected.
5. The node then looks fine during one phase and wrong during the next frame, release settle, or branch reflow.

That matches the user-visible shape of bugs that appear only after stack or deck participation.

## Recommended Ownership Split

The clean split should be:

- Child nodes declare `scrollViewport`, `clipHeight`, `minClipHeight`, and any node-specific Height Mode labels or row-count options.
- Child nodes may measure local content spans and expose them through declarative or helper inputs.
- Fatha owns how `autoHeight`, saved manual height, seam resize floors, collapse restore, and deck/stack settlement interpret those inputs once the node joins a dock group.
- Child nodes should avoid issuing direct shared-height sync commands unless they are true layout owners like the ImageDeck hub.

## Final Verdict

The viewport subsystem itself is already fairly consolidated.

The unstable ownership boundary sits one layer above that: child nodes still hold too much authority over height-state fields that the docking and resize framework also treats as shared truth.

That is the most credible explanation for nodes that behave correctly in standalone mode and become inconsistent only after entering stacks or decked sandwich layouts.

# Clipped Viewport Scrollbar Audit Diary

Date: 2026-06-20

## Scope

This report audits how the current clipped viewport scrollbar is implemented across Fatha and the derp nodes. The goal is to determine whether scrollbar behavior is centralized in shared framework code or scattered across child-node implementations.

This is a code-reading audit only. No code was changed as part of this review.

## Files Reviewed

### Shared framework files

- `js/fatha/core/fathaContentViewport.js`
- `js/fatha/core/fathaContentViewportDraw.js`
- `js/fatha/core/fathaContentViewportShield.js`
- `js/fatha/core/fathaDOMshield.js`
- `js/fatha/fatha.js`
- `derp_docs/FRAMEWORK-Clipping.md`
- `derp_docs/FRAMEWORK-Docking.md`

### Node-side viewport declarations checked

- `js/derps/controldeck/derpSeedV3.js`
- `js/derps/controldeck/derpTriggerWall.js`
- `js/derps/controldeck/derpLoraStack.js`
- `js/derps/loaders/derpDiffusionLoader.js`

## Executive Judgment

The clipped viewport scrollbar is already largely consolidated in shared framework code.

The child nodes are mainly declarative clients of that shared system. They decide whether a region uses a clipped viewport and what the region's `clipHeight` and `minClipHeight` policy should be. They are not currently drawing their own viewport scrollbars or owning their own viewport wheel and thumb-drag behavior.

That is the good news.

The slightly spicy news is that the consolidation is real, but the viewport contract is broader than just painting a scrollbar. The shared framework also owns viewport layout shrink, overflow state, scroll state, pointer remapping, hit filtering, and redraw requests. That means one bug in the shared viewport contract can affect many node families at once even when the scrollbar itself is centralized.

## Current Architecture Summary

The scrollbar path is split cleanly by responsibility inside the shared framework:

1. `fathaContentViewport.js` owns viewport state and layout consequences.
2. `fathaContentViewportDraw.js` owns scrollbar geometry and drawing.
3. `fathaContentViewportShield.js` owns wheel scrolling and thumb/track dragging.
4. `fathaDOMshield.js` integrates those handlers into the node interaction shield.
5. `fatha.js` calls the shared scrollbar draw pass during node rendering.

This is one coherent framework pipeline, not a per-node scrollbar zoo.

## Main Findings

### 1. Scrollbar drawing is centralized

Severity: Low risk structurally, high leverage when broken

`drawContentViewportScrollbars()` in `js/fatha/core/fathaContentViewportDraw.js` is the single shared draw path for clipped viewport scrollbars.

It computes:

- track rect
- thumb rect
- thumb size floor
- thumb position from `scrollTop / maxScroll`

It then draws the track and thumb via `masterPainter()`.

`js/fatha/fatha.js` imports that helper and calls it after the main region draw pass.

Practical consequence:

- Nodes are not painting their own viewport scrollbars.
- Scrollbar visuals are centralized.
- A visual change to viewport scrollbars belongs in one framework file.

### 2. Wheel scrolling and scrollbar drag are centralized

Severity: Low risk structurally, high leverage when broken

`js/fatha/core/fathaContentViewportShield.js` owns:

- wheel scrolling through `handleContentViewportWheel()`
- track click and thumb drag through `tryStartContentViewportScrollbarDrag()`
- pointer-to-viewport remapping through `mapShieldPointThroughContentViewport()`

`js/fatha/core/fathaDOMshield.js` wires those handlers into normal pointer and wheel event flow.

Practical consequence:

- Child nodes are not each implementing their own viewport wheel logic.
- Child nodes are not each implementing their own scrollbar thumb drag logic.
- Interaction bugs in viewport scrollbars should be investigated in the shared shield path first.

### 3. Scroll state is centralized

Severity: Medium

`js/fatha/core/fathaContentViewport.js` owns the scroll state and derived viewport metadata:

- `node._contentViewportScroll`
- `node._contentViewportState`
- `getContentViewportScroll()`
- `setContentViewportScroll()`
- `scrollContentViewport()`
- `requestContentViewportRedraw()`

This is strong consolidation.

Practical consequence:

- Scroll position persistence and clamping are shared.
- Overflow state is shared.
- Any desync between visible geometry and stored state will propagate to all viewport-enabled nodes.

### 4. Hit filtering and coordinate remapping are also centralized

Severity: Medium

The viewport system does more than scrollbars.

Shared viewport-aware interaction behavior currently includes:

- draw clipping in `withContentViewportClip()`
- displayed geometry remap in `getContentViewportGeometry()`
- hit visibility filtering in `isContentViewportRegionHitVisible()`
- pointer coordinate remap through `mapPointThroughContentViewport()`
- DOM shield integration in `fathaDOMshield.js`

Practical consequence:

- The scrollbar itself is centralized.
- The entire clipped viewport interaction model is centralized too.
- Bugs that look like "the scrollbar is wrong" may really be layout, hit-test, or remap bugs in the same shared subsystem.

### 5. Node-side responsibility is mostly declarative

Severity: Low

The nodes I checked are mainly responsible for:

- setting `scrollViewport: true`
- providing `clipHeight`
- providing `minClipHeight`
- shaping Height Mode policy around those values

Examples:

- `derpSeedV3` declares a history viewport and computes its clip height from visible history count or Fit Node height.
- `derpTriggerWall` declares a groups viewport and computes its clip height from visible group count or auto-fit height.
- `derpLoraStack` declares an entries viewport and computes clip/min-clip from visible row count.
- `derpDiffusionLoader` declares a viewport with a simple property-driven fixed clip height.

Practical consequence:

- Child nodes are not scattering scrollbar implementation details around the codebase.
- They are supplying viewport sizing policy, which is the correct node-side responsibility.

### 6. Consolidated does not mean isolated

Severity: High

The scrollbar implementation is centralized, but the viewport system participates directly in layout and resize math.

`applyContentViewportLayout()` does all of the following in one pass:

- resolves `clipHeight`
- measures full internal content height
- shrinks live region height to visible height
- determines overflow
- stores shared viewport state
- recomputes `layout.totalHeight`
- recomputes `layout.contentMinHeight`

That means the viewport layer is not a thin cosmetic scrollbar feature. It is part of the physical node sizing contract.

Practical consequence:

- Centralization reduces duplication.
- Centralization increases blast radius.
- A bug in viewport floor or visible-height math can hit scrollbar drawing, resize floors, and stack behavior all at once.

## Final Verdict

The current clipped viewport scrollbar handling is consolidated in the framework, not scattered among child nodes.

More specifically:

- scrollbar drawing is centralized
- wheel scrolling is centralized
- thumb dragging is centralized
- scroll state is centralized
- viewport hit filtering is centralized
- viewport draw clipping is centralized

The child nodes mainly provide viewport sizing policy and opt-in declarations.

So if the question is "do the child nodes each own their own scrollbar behavior?" the answer is no.

If the question is "can a clipped viewport bug still appear across many different nodes at once?" the answer is yes, because the shared viewport layer also owns layout consequences, not just scrollbar cosmetics.

## Suggested Next Step

When debugging clipped viewport issues, treat this subsystem as one framework-owned pipeline:

1. `fathaContentViewport.js`
2. `fathaContentViewportDraw.js`
3. `fathaContentViewportShield.js`
4. `fathaDOMshield.js`
5. `fatha.js`

The child nodes should be checked after that, mainly to confirm whether they are declaring the right `clipHeight` and `minClipHeight` policy.

---

# Animation Framework Audit Diary

Date: 2026-06-19

## Scope

This report audits the current animation framework used across Herbina, Fatha, Basta, and the derp node widgets. The goal is to assess structural risk, identify concrete failure modes, and decide whether a rewrite is justified.

This is a code-reading audit only. No code was changed as part of this review.

## Executive Judgment

The animation system is worth rewriting.

The right rewrite target is the animation protocol layer, not a one-shot rewrite of every widget and node animation call site.

The current system still works because it has a large amount of embedded local knowledge and tolerant fallback behavior. That same tolerance now hides real bugs, allows API drift, and makes future maintenance harder than it needs to be.

The safest path is:

1. Preserve the existing exported function names.
2. Introduce a new internal animation runtime.
3. Keep a compatibility shell around the old API.
4. Migrate high-traffic widgets incrementally.

## Files Reviewed

### Core animation files

- `js/herbina/masterAnimator.js`
- `js/masterSettings.js`

### Framework and runtime integration

- `js/fatha/fatha.js`
- `js/fatha/core/fathaHandler.js`
- `js/fatha/core/dockResize.js`
- `js/fatha/core/fathaWarp.js`
- `js/fatha/helpers/fathaSysPanel.js`
- `js/fatha/core/masterDockEngine.js`

### Widget call sites and helpers

- `js/herbina/widgets/btnSimple.js`
- `js/herbina/widgets/btnIcon.js`
- `js/herbina/widgets/textLabel.js`
- `js/herbina/widgets/derpEditor.js`
- `js/herbina/widgets/widget_Slider.js`
- `js/herbina/widgets/widget_SliderHTML.js`
- `js/herbina/widgets/widget_Toggle.js`
- `js/herbina/widgets/widget_ToggleV2.js`
- `js/herbina/widgets/widget_Trigger.js`
- `js/herbina/widgets/widget_Region.js`
- `js/herbina/widgets/widget_FileBrowser.js`
- `js/herbina/widgets/helpers/dropdown_lib.js`

### Framework docs checked first

- `derp_docs/FRAMEWORK-Herbina.md`
- `derp_docs/FRAMEWORK-Fatha.md`

## Current Architecture Summary

The current animation layer is not one single unified system. It is a cluster of animation utilities plus several framework-side wake and redraw mechanisms.

### Present animation primitives

- `lerpTo()`
- `animateRecoil()`
- `animateAlpha()`
- `animateSpring()`
- `animatePanelSlide()`
- `getPulseMix()`
- `getPulseAlpha()`
- `getPulsedColor()`
- `animateWidgetColors()`
- `animatePaintData()`
- `startAnimatorChannel()` / `stopAnimatorChannel()`

### Present execution styles

- Per-frame value interpolation using fixed factors
- Quantized sinusoidal pulse animation based on wall-clock time
- Dedicated `requestAnimationFrame` channel loops for some motion paths
- Fatha awake-frame countdowns driving redraw pressure

### Present state storage styles

- Dynamic properties on `node[animKey]`
- Dynamic per-feature keys like `_visualPress`, `_derpAwakeFrames`, `_derpAnimPending`
- Global maps like `_ANIMATOR_CHANNELS`
- Ad hoc widget-local state fields in configs and node properties

This means the current framework already contains multiple animation models and multiple scheduling models.

## Main Findings

### 1. The API contract has already drifted

Severity: High

`animateWidgetColors()` has a concrete function signature in `js/herbina/masterAnimator.js`, but some call sites are no longer using it consistently.

The clearest example is in `js/herbina/widgets/widget_ToggleV2.js`:

```js
const colors = animateWidgetColors(node, config.key, bodyPaint, useAnim);
```

The function expects:

```js
animateWidgetColors(node, animKey, targetBg, targetIc, sysAlpha = 1, useAnim = true, speed = 0.45)
```

That means `bodyPaint` is being supplied where a background color is expected, and `useAnim` is being supplied where a text color is expected. This should be a hard failure from an API design perspective.

It stays alive because `parseColor()` is highly tolerant and falls back to pure red when the input is invalid.

Practical consequence:

- Real bugs can survive without obvious crashes.
- The framework cannot trust its own call surface.
- A rewrite that tightens correctness will expose latent misuse quickly.

### 2. Animation enablement rules are fragmented

Severity: High

There are several overlapping ways to decide whether animation is enabled:

- `window.DERP_GLOBAL_SETTINGS.useAnimation`
- `window.DERP_GLOBAL_SETTINGS.useAnimations`
- `window.xcpDerpSettings.useAnimations`
- `node.properties.useAnimations`
- `node.properties.useAnim`
- `node.properties.showAnim`
- `node.properties.animations`
- `config.showAnim`
- `config.useAnim`
- `config.useAnimations`

Different components read different subsets of these flags.

Examples:

- `widget_Region.js` checks framework + global + node + config
- `btnSimple.js` checks only `config.showAnim` and `window.xcpDerpSettings.useAnimations`
- `widget_Toggle.js` checks only `node.properties.useAnimations`
- `btnIcon.js` checks a much broader set including `showAnim`, `useAnim`, and `animations`

Practical consequence:

- Two widgets on the same node can disagree about whether animation is enabled.
- The global animation setting does not form a single predictable policy.
- Future maintenance requires component authors to remember hidden flag conventions.

### 3. Most interpolation is frame-rate dependent

Severity: High

Core functions such as `lerpTo()` and `animateAlpha()` use a fixed factor per frame and do not use delta time.

This means:

- Higher frame rate produces faster convergence.
- Lower frame rate produces slower or stickier motion.
- Animation feel varies with canvas load.

That matters here because this project runs inside a draw-heavy custom canvas environment where frame timing can fluctuate due to layout, theme, docking, and whole-wall cache behavior.

The warp channel in `fathaWarp.js` already uses elapsed time to compute normalized progress. That is a more robust model than the widget animation layer currently uses.

Practical consequence:

- Animation timing is not portable across load conditions.
- Motion tuning is harder because coefficients are tied to frame cadence instead of elapsed time.

### 4. State storage is ad hoc and unbounded in style

Severity: High

Animation state is typically stored directly on node objects using dynamic keys such as:

- `node[animKey]`
- `node._visualPress`
- `node._derpAnimPending`
- `node._derpAwakeFrames`

This pattern is flexible, but the framework does not provide a strict registry, a lifecycle policy, or a namespace contract beyond local naming habits.

Risks:

- Key collisions between features
- State buildup on long-lived nodes
- Hidden coupling between widgets that share a key convention
- Harder debugging because animation state is spread across arbitrary properties

The `widget_ToggleV2` usage of `config.key` as an animation key is especially weak because it uses a short generic identifier instead of a namespaced one.

### 5. Interpolation and redraw scheduling are tightly coupled

Severity: High

`animateWidgetColors()` and `animatePaintData()` do more than animate values. They also:

- extend passive cache suspension
- mutate `_derpAwakeFrames`
- schedule `requestAnimationFrame`
- mark the ComfyUI canvas dirty

That means the animation functions are not pure math helpers. They are also redraw coordinators.

Practical consequence:

- Any caller automatically inherits Fatha-specific wake behavior.
- The framework cannot easily reuse these functions in a different execution context.
- Unit reasoning is difficult because one call both computes values and triggers side effects.

### 6. Pulse animation forms a side-channel outside the main policy

Severity: Medium-High

Pulse behavior is handled in a different style than lerp-based transitions.

Examples:

- `btnSimple.js` explicitly comments that pulse ignores the global animation toggle.
- `widget_Toggle.js` and `btnIcon.js` pulse by directly calling `getPulsedColor()` and forcing wake/dirty behavior.
- `textLabel.js` and `widget_Region.js` have their own pulse-state logic.

Practical consequence:

- Turning animation off does not mean all time-based visual motion stops.
- Pulse behavior is not governed by the same contract as interpolation behavior.
- Pulse tuning is scattered across widgets via repeated literal speeds like `0.005`.

### 7. There are already at least two generations of animation infrastructure

Severity: Medium-High

The old-style model is the helper-family centered on `lerpTo`, `animateAlpha`, `animateWidgetColors`, and `animatePaintData`.

The newer-style model is `startAnimatorChannel()` and `stopAnimatorChannel()`, which provide a controllable RAF loop and are currently used by `fathaWarp.js`.

This is important because it shows the codebase has already started to evolve beyond the original helper pattern.

Practical consequence:

- A rewrite would not be introducing a new idea from scratch.
- There is already precedent for channel-based animation runtime control.

### 8. Some exported helpers look partially integrated or low-authority

Severity: Medium

Examples:

- `isWidgetAnimationEnabled()` exists but appears unused.
- `animateSpring()` exists but does not appear to be a central primitive in the live widget layer.
- `colorPulse2()` appears superseded by `getPulsedColor()`.

This is a maintenance smell rather than a direct bug.

Practical consequence:

- The public shape of the animation layer is larger than the stable contract it actually uses.
- Rewriters must separate active protocol from legacy residue.

## What The Current System Still Does Well

The current framework is not a failure. It has several strengths that are worth preserving.

### 1. It is extremely pragmatic

The system prioritizes visible behavior over abstraction purity. That made it possible to ship a large number of animated widgets without needing a formal animation engine first.

### 2. It contains useful compatibility instincts

Several parts are clearly designed to survive bad inputs and partial migration states. That tolerance helped the project evolve quickly.

### 3. It already knows about redraw economics

The coupling between animation and wake/dirty behavior is architecturally messy, but it also proves the framework is aware of performance pressure, sleep gates, and passive cache interactions.

### 4. It already has a viable seed for a better runtime

`startAnimatorChannel()` plus the warp system shows a workable direction for a more disciplined, time-based, channel-managed animation core.

## Why I Recommend A Rewrite

The case for rewrite is structural, not aesthetic.

You have reached the point where:

- the animation API is no longer self-policing
- feature flags are inconsistent
- time behavior is inconsistent
- state ownership is inconsistent
- redraw control is mixed into value interpolation

At this point, patching individual widgets will continue to cost more while improving the underlying system less.

## Rewrite Goal

The rewrite target should be:

### A unified animation runtime with compatibility wrappers

It should provide:

- one animation policy resolver
- one state registry model
- one time-step model
- one redraw scheduling contract
- one channel/cancellation system
- compatibility exports for old widget calls

## Recommended Rewrite Shape

### Phase 1: Define the protocol without changing widget behavior

Create the internal model first.

Suggested internal responsibilities:

- resolve whether animation is enabled
- resolve whether pulse is enabled
- provide `dt` and normalized time progress
- own per-node and per-channel animation state
- request redraws through one framework service
- expose helper primitives for value, color, alpha, and spring motion

### Phase 2: Keep the old exported API names

Preserve:

- `lerpTo`
- `animateAlpha`
- `animateRecoil`
- `animateWidgetColors`
- `animatePaintData`
- `getPulsedColor`

At first, these should become compatibility shims that forward into the new runtime.

This preserves old nodes and old widgets while allowing the internals to become coherent.

### Phase 3: Add developer diagnostics

In development mode, the compatibility layer should detect bad calls and warn loudly.

Examples:

- object passed where color string or RGBA array is expected
- boolean passed where text color is expected
- missing `animKey`
- duplicate animation key patterns on the same widget family

This matters because the current framework hides bad calls too effectively.

### Phase 4: Migrate highest-traffic widgets first

Best first migration group:

- `btnSimple`
- `btnIcon`
- `textLabel`
- `derpEditor`
- `widget_Slider`

These give the biggest behavioral coverage for the least protocol surface area.

### Phase 5: Migrate framework-owned motion paths

After widget color and alpha transitions are stable, migrate:

- system panel open/fade
- Fatha recoil
- warp-related motion if desired under a shared runtime abstraction
- dropdown and picker scroll lerps

## Compatibility Requirements For A Safe Rewrite

These are the rules I would keep non-negotiable.

### 1. Old nodes must keep working without layout-map changes

Any node currently relying on `config.showAnim`, `config.useAnim`, `node.properties.useAnimations`, or pulse-related flags should continue to render correctly during migration.

### 2. Old exported functions must remain callable

Even if the internals change, call sites should not have to switch in one shot.

### 3. Wake behavior must remain visually compatible

Nodes that currently depend on `_derpAwakeFrames` to stay alive through transitions must continue to do so until the whole stack is migrated.

### 4. Passive whole-wall cache interactions must stay protected

The current animator explicitly suspends some passive caches during animation. A rewrite must preserve that behavior through a cleaner interface.

### 5. HTML and canvas paths must share timing policy

The current project already has parity pressure between canvas and HTML renderers. A new runtime should unify timing and enablement semantics for both.

## Recommended New Internal Design

### Animation policy resolver

One function should compute the effective animation policy from:

- local widget config
- node properties
- Fatha/Basta framework variables
- global settings

That function should be the only authority.

### Animation state registry

Suggested shape:

- registry keyed by node id or stable object reference
- subkeys by animation channel name
- explicit cleanup on node removal
- support for stateless pulse helpers where appropriate

### Time model

Use elapsed time or delta time for all interpolated motion.

You can still preserve the current visual feel by fitting current per-frame coefficients to time-based decay constants.

### Redraw broker

The runtime should request wake and dirty states through a single adapter instead of letting every helper mutate `_derpAwakeFrames` on its own.

### Compatibility facade

The old functions should become small wrappers that:

- normalize legacy arguments
- validate inputs in development mode
- delegate into the new runtime

## Concrete Risks If You Do Nothing

1. API drift will continue until animation helpers become impossible to trust.
2. New widgets will keep copying local gate logic instead of using one contract.
3. Performance debugging will stay harder because animation math and redraw side effects remain fused.
4. Future parity bugs between HTML and canvas will keep accumulating because timing and policy are not centrally owned.
5. A later rewrite will cost more because more undocumented local conventions will accumulate.

## Concrete Risks If You Rewrite Too Aggressively

1. Old nodes could lose pulse or wake behavior.
2. Widgets that currently rely on tolerant fallback behavior could suddenly break hard.
3. Deck and whole-wall cache interactions could regress if redraw semantics change carelessly.
4. The system panel, Basta overlays, and node widgets could diverge during partial migration.

These risks are real, which is exactly why I recommend a compatibility-shell rewrite instead of a direct replacement.

## Bottom Line

The current animation framework is hand-built, pragmatic, and clearly battle-adapted. It also has enough protocol drift and cross-cutting coupling that a structural rewrite is justified.

I would rewrite it.

I would not rewrite it by changing every call site first.

I would rewrite the runtime underneath the existing API, add diagnostics, and migrate widgets in controlled batches.

## Suggested Next Step

If you decide to proceed, the best next deliverable is a design document for `masterAnimator v2` that defines:

- policy resolution
- state ownership
- time model
- redraw integration
- compatibility shims
- migration order

# Startup Warning: Toast Notification for Missing user/derpNodes Folder

Date: 2026-06-21

## Source

Inspected the `ComfyUI-NL_Nodes` repo to understand how it pops up a user-visible warning when `extra_model_paths.yaml` is missing. The mechanism is clean and reusable for our own startup checks.

## The NL_Nodes Pattern

### Python backend (`model_localizer.py` / `nl_templates.py`)

1. A helper function checks for the required resource at import/startup time:

```python
def _extra_model_paths_config_path() -> str:
    path = find_extra_model_paths(logger=LOGGER, log_prefix="NL Model Localizer")
    if not path:
        raise FileNotFoundError(
            "extra_model_paths.yaml not found. Set --extra-model-paths-config or place it next to ComfyUI."
        )
    return path
```

2. When the resource is missing, `FileNotFoundError` is raised with a clear user-facing message.

3. API route handlers catch exceptions and return JSON:

```python
@routes.get("/nl_templates/list")
async def list_templates(request):
    try:
        payload = await run_sync(_list_templates, username)
        return web.json_response(payload)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)
```

### JS frontend (`nl_templates.js`)

4. The frontend receives the JSON error, extracts `error` field, and calls a shared `notifyUser()` helper:

```javascript
function notifyUser(message) {
    if (app?.ui?.showToast) {
        app.ui.showToast(message);       // ComfyUI's built-in toast popup
        return;
    }
    void showNlAlertDialog({             // custom dialog fallback
        title: "NL Templates",
        message,
    });
}
```

`app.ui.showToast()` is ComfyUI's standard notification popup — it appears as a small toast at the top of the canvas, auto-dismisses. No custom UI needed.

## How To Apply This Pattern To xcp_derp-UI

### The check

At startup (in `__init__.py` or a dedicated startup-check module), verify that `user/derpNodes/` exists relative to the node pack root. If it's missing, raise a descriptive error:

```python
import os

def _check_user_derpnodes():
    base = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base, "user", "derpNodes")
    if not os.path.isdir(path):
        raise FileNotFoundError(
            "user/derpNodes folder is missing. "
            "This folder contains bundled themes, palettes, and assets required by derp-UI. "
            "Reinstall the node pack or restore the folder from the release archive."
        )
```

### Surface to user

Two options:

**Option A — Block node registration (same pattern as NL_Nodes).** Raise the error during `__init__.py` import. ComfyUI prints a warning to console but the node pack fails to load. Simple, but the user only sees it in the terminal/log.

**Option B — Deferred check via API route.** Register a lightweight health-check route that the JS frontend can call on page load. If the folder is missing, return `{"error": "..."}`. The JS side calls `app.ui.showToast("derp-UI: user/derpNodes folder is missing...")` and the user sees a visible toast popup.

Option B is better UX — the toast is visible in the ComfyUI canvas, not buried in terminal logs.

### JS frontend hook

In the node pack's main JS entry point (registered via `WEB_DIRECTORY`), add:

```javascript
// On ComfyUI page load, check if user/derpNodes is present
fetch("/xcp/health/derpnodes")
    .then(r => r.json())
    .then(data => {
        if (data.error && app?.ui?.showToast) {
            app.ui.showToast("derp-UI: " + data.error);
        }
    })
    .catch(() => {}); // silent if route not available
```

### Files involved

| File | Change |
|------|--------|
| `python/xcp_routes/` (new route or existing) | Add `GET /xcp/health/derpnodes` that checks `user/derpNodes/` exists, returns `{"ok":true}` or `{"error":"..."}` |
| `js/` entry point | Add fetch-on-load health check that calls `app.ui.showToast()` on error |
| `python/__init__.py` | Optional: early-exit if folder missing (Option A) |

### Key insight

`app.ui.showToast()` is the ComfyUI standard. It's already available in every ComfyUI instance, no dependency needed. The NL_Nodes team uses it for all their user-facing notifications. We should too.
