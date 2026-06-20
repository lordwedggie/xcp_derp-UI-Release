# <span style="color: #ff8080">Framework:</span> <span style="color: #ffffff">Optimization</span>

## <span style="color: #80ffc0">Purpose</span>

Read this before optimizing any derp Fatha, Uncle, Basta, or Herbina widget path. The goal is to make the first pass sharp enough that ordinary node optimization does not require repeated browser-console archaeology.

<span style="color: #80aaff"><strong>Use this with:</strong></span> the matching framework doc for the code you are touching: `FRAMEWORK-Fatha.md`, `FRAMEWORK-Herbina.md`, `FRAMEWORK-Basta.md`, `FRAMEWORK-Docking.md`, `FRAMEWORK-Clipping.md`, or `FRAMEWORK-Nodes.md`.

<span style="color: #80aaff"><strong>Optimization target:</strong></span> reduce idle and interaction-frame cost without changing node behavior, visual state, docking geometry, editor focus, wireless signals, or theme/palette resolution.

## <span style="color: #80ffc0">Optimization Pass Order</span>

Do these in order. Most expensive nodes are not slow because of one heroic algorithm; they are slow because three small frame loops keep poking each other awake.

1. Establish the measured slow state: standalone, docked stack, Deck Pressure horizontal sandwich, Deck Pressure vertical sandwich, selected, hovered, editing, and during resize if relevant.
2. Find unnecessary layout-map rebuilds before adding draw caches.
3. Find dirty/sync loops before adding logs.
4. Guard no-op value changes, signal fanout, DOM/native widget mutation, and size setters.
5. Treat bitmap/layer caching as a last resort, not a normal optimization step. Use it only when the user explicitly asks for bitmap caching, or when a potentially extremely heavy node remains too slow after layout rebuilds, dirty/sync loops, and no-op guards are exhausted.
6. Verify in the same graph arrangement that was slow.
7. Remove temporary diagnostics when the cause is understood.

## <span style="color: #80ffc0">Layout Rebuilds</span>

`refreshNodeLayoutMap()` is structural. It should run when the node's shape, region tree, widget set, measured text requirements, clipped visible count, or theme/layout variables change. It should not run just because a displayed value changed.

Preferred pattern:

- Build a structural hash in `refreshNodeLayoutMap()`.
- Include every structure-affecting field: mode, visible row count, history length limit, color-key toggle, digit count, theme session, measured layout vars, row membership, and any property that changes widget count or dimensions.
- If the hash matches, update value-only fields in place and request a draw.
- Keep system-panel layout hashes separate from main-node layout hashes.
- When a system-panel or Basta control changes something visible on the main node, refresh both maps. When it only changes the panel itself, do not rebuild the host node.

Value-only sync must update all live copies that can be read by the next draw:

- `layoutMap` config object
- `layout.regions[key]`
- `_compDataCache[key]`
- DOM element `_config`
- editor line caches or DOM state hashes when text metrics changed

For canvas-shield editors, direct mutation is often safer than waiting for cache invalidation. The editor's real DOM text, caret, selection, IME behavior, and canvas duplicate can drift if only one layer changes.

## <span style="color: #80ffc0">Dirty And Sync Loops</span>

Treat `_forceSync`, `_layoutDirty`, and `_shouldSync` as expensive promises. Set them when something visible or geometric actually changed; clear or avoid them when the current visual key already describes the output.

Common loops to kill first:

- Calling `requestDerpSync()` from draw every frame.
- Rebuilding layout on busy/bypass/title/seed changes when only a label or button state changed.
- Running Vue/Node 2.0 size setters when width and height are already equal.
- Marking every deck member dirty when only one member changed size or position.
- Re-hiding native widgets or restyling DOM widgets every foreground draw.
- Rebroadcasting unchanged wireless/network state.

No-op guards are real optimization. Before writing a property, sending a fetch, resizing a node, or refreshing a map, compare the next signature to the last applied signature.

## <span style="color: #80ffc0">Fatha Draw Caches</span>

Bitmap draw caches are a last-resort optimization for potentially extremely heavy nodes. They can be fast, but they often look less sharp than direct canvas drawing and can introduce occasional flicker. Do not add a bitmap cache unless the user specifically asks for it, or unless measured rendering cost remains unacceptable after simpler optimizations are exhausted.

A draw cache is safe only when its key includes every visible input. If the key is incomplete, the cache is a bug with a pretty hat. Even when the key is complete, prefer no-op guards, layout-map hash fixes, direct value sync, and targeted measurement caches first.

Good cache key fields usually include:

- node size and cache scale bucket
- layout-map hash or equivalent structural hash
- active theme/session/palette state that affects paint
- selected state and true hover state if those visuals are cached
- bypass/busy/executing state
- title or displayed labels
- visible data rows, history values, active modes, toggles, and clipped count
- scroll position for clipped content
- image load/version signatures for image widgets

Cache blockers usually include:

- active press/recoil state
- active drag or resize
- awake animation frames
- focused editors or active DOM widgets
- active sliders, dropdowns, file browsers, or picker overlays when they affect the node face
- pending image loads for image-dependent caches

Selected and hovered visuals do not automatically block caching. If selection and hover are part of the key, the selected/hovered bitmap can be cached. Press, drag, editor focus, and awake animation usually cannot be cached because they are intentionally changing frame-to-frame.

Important Deck Pressure lesson: dirty is not the same as visually changed. A docked node may arrive with `_forceSync` or `_layoutDirty` set every frame because the deck owner is maintaining geometry. If an existing bitmap cache key still matches the complete visual state, reuse the bitmap and clear stale dirty flags. If there is no existing cache, it can still be correct to build the cache from the normal draw path even while dirty, provided the key fully represents the resulting visual.

For approved large whole-wall caches, keep backing scale zoom-aware but quantized/capped, and blit only the visible local slice when possible. Avoid huge per-frame bitmap work at high zoom.

## <span style="color: #80ffc0">Fatha Nodes</span>

For full virtual Fatha nodes:

- Keep native Comfy widgets hidden in lifecycle hooks or behind a signature guard, not in the hot draw path.
- Let `onDrawForeground()` update runtime state only when a compact state hash changed.
- Use in-place sync for value changes such as seed text, button labels, busy state, row labels, and history values.
- Avoid bitmap caches for simple nodes; if a last-resort bitmap cache is approved, call `syncDerpShield(node)` after cache draws so hitboxes stay aligned.
- Include color-key toggles and localized display text in layout/cache hashes when they affect measurement or output.
- Prefer local node helpers over broad framework changes unless multiple nodes share the same hot-path problem.

## <span style="color: #80ffc0">Uncle Nodes</span>

Uncle nodes preserve real LiteGraph slots, so optimization must not break slot visibility or link geometry.

- Guard `syncUncleSlots()` with an input/output signature when possible.
- Do not churn `_xcpTrueInputs` / `_xcpTrueOutputs` unless slot shape changed.
- Keep UNCLE link padding behavior intact.
- Guard Node 2.0/Vue size setters the same way as Fatha nodes: unchanged size means no setter call.
- Check both virtual rendering cost and native slot/link rendering cost before blaming the layout map.

## <span style="color: #80ffc0">Basta Panels</span>

Bastas render in screen space and share Fatha's layout/widget machinery, but they have their own lifecycle and cache pitfalls.

- Do not create a new overlay system for performance work; use the existing Basta instance and layout map.
- If a widget changes only overlay-local display, clear only the relevant Basta `_compDataCache[key]`, mark that Basta for sync, and leave the host node alone.
- If a widget changes host-node visual output, refresh the host main layout map too.
- Keep sticky/fixed position calculations out of per-widget sync paths.
- Include open Basta identity in host-node cache keys when the panel changes host rendering or should block a host cache.
- Close/destroy cleanup must remove shields, DOM widgets, and active state so invisible panels do not keep hit tests or animation awake.

## <span style="color: #80ffc0">Herbina Widgets</span>

Widget optimization starts with the shared widget protocol, not one-off paint shortcuts.

- Start sync paths with `resolveWidgetEnv(...)` when the widget needs theme, state, alpha, color segments, i18n, or display text resolution.
- Use `_hoveredRegionKey` and `_pressedRegionKey`; do not invent parallel hover/press flags without a hard reason.
- Do not recreate DOM nodes or rewrite inline styles every frame. Use state hashes and clear `_lastStateHash` only when the effective state changed.
- For segmented text, pass parsed segments to canvas text and use `colorSegmentsToHTML(...)` for HTML text. Do not bypass color-key parsing for speed.
- Cache expensive text measurement, image decoding, or static paint layers by the exact visual inputs that affect them.
- For sliders, editors, file browsers, dropdowns, and pickers, active interaction usually blocks whole-node bitmap caches. Prefer static-part or measurement caches before considering a whole-node bitmap cache.
- For canvas-shield editors, keep DOM text visible while active. Performance fixes must not hide the real editable DOM text behind a stale canvas duplicate.

## <span style="color: #80ffc0">Signals And Network Fanout</span>

Wireless signal writes and backend updates should be signature-driven.

- Always keep local registries correct, especially bypassed output records.
- Skip network/debounced fanout when the signal signature is unchanged.
- Include node id, display name, type, bypass state, and value in the signature.
- Force refresh only for one-shot source title changes or real output-shape changes.

## <span style="color: #80ffc0">Docking And Deck Pressure</span>

Docked performance must be verified in the shape that was slow. A node can be fine alone and awful in a vertical Deck Pressure sandwich.

- Do not mark unchanged deck members dirty.
- Use stable geometry signatures for idle dock maintenance.
- Let ImageDeck-owned Deck Pressure layout own hub/branch reflow; avoid generic normalization on hub seams.
- Preserve branch member order from topology, not transient x/y sorting during resize overlap.
- Treat Deck Pressure dirty flags as possible geometry maintenance noise; use complete visual keys before forcing redraw.
- Check standalone, vertical stack, horizontal stack, left/right branch, and top/bottom branch cases separately.

## <span style="color: #80ffc0">Debugging Policy</span>

Do not start with console logs when the checklist above points to a likely frame loop. Inspect hashes, dirty flags, cache keys, and no-op guards first.

When logs are needed, follow the debug-console-logs skill:

- no frame-spam logs
- use counters, throttles, one-shot logs, or state-change summaries
- print copyable scalar fields, not expandable object dumps
- include node id/title and the relevant state signature
- give the exact console command if a manual helper is required
- remove temporary diagnostics after the cause is fixed

Durable debug helpers are allowed only when they are explicitly useful for future diagnostics. Temporary cache counters, hot-path console logs, and manual window helpers should come back out during cleanup.

## <span style="color: #80ffc0">Done Means</span>

An optimization pass is not complete until all relevant checks pass:

- The node no longer dominates the Fatha performance overlay in the reported graph arrangement.
- Standalone, docked stack, Deck Pressure horizontal, and Deck Pressure vertical behavior still match before/after expectations.
- Selection, hover, press, editor focus, bypass, busy/executing, theme change, and locale/title display still update correctly.
- Native widgets remain hidden if the node is pure virtual.
- Wireless outputs and backend execution semantics are unchanged.
- Temporary logs/helpers are removed.
- The matching framework doc is updated if a framework contract changed.
