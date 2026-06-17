---
name: debug-console-logs
description: Use when adding, adjusting, or removing console logs for debugging in the derp project, including performance tracing, state inspection, event-flow debugging, or temporary browser-console diagnostics. Applies to both CodeWhale and Codex.
---

# Debug Console Logs

Use console logs as temporary diagnostic tools that a human can copy from the browser console without extra work.

## Rules

1. Do not add logs that flood the console. Prefer thresholded, throttled, one-shot, sampled, or state-change logs. If a loop or draw path can run every frame, add a clear throttle or only log on meaningful deltas.
2. Do not require a console command or trigger word to enable logs unless the log targets a specific manual action or very noisy subsystem. If a manual trigger is necessary, give the exact command and keep the default state quiet.
3. Do not use expandable object logs when the needed data would be hidden in the collapsed console view. Format the useful fields directly into one line, such as `key=value`, compact phase lists, or short summaries.
4. Keep logs scoped to the node, subsystem, or condition under investigation. Include enough identity in the line to disambiguate node id/title, event source, state, cache status, zoom, or timing.
5. Clean up temporary debug code after the bug is understood or fixed. Keep only durable debug drawings/helpers when they are explicitly useful for future diagnostics.

## Preferred Pattern

Use a stable tag and a compact message:

```js
console.log(`[LoraStackPerf] frame node=${node.id}:${node.titleLabel || node.type} total=${totalMs.toFixed(1)} phases=${phaseText} slow=${slowText}`);
```

For hot paths, combine a threshold with a heartbeat:

```js
const isSlow = totalMs >= 25;
const throttleMs = isSlow ? 1200 : 3500;
if (now - lastLogAt >= throttleMs) {
    lastLogAt = now;
    console.log(`[Tag] total=${totalMs.toFixed(1)} state=${stateText}`);
}
```

Avoid:

```js
console.log({ node, layout, regions, timings });
```

because the user would have to expand/collapse console objects by hand and copy unstable browser object previews.
