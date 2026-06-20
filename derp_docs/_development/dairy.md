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

That would make the rewrite predictable and keep the old system functional while the new one comes online.
