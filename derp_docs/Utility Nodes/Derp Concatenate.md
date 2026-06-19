# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Concatenate</span>

A wireless STRING concatenation node. Pick multiple signals from across your canvas — no wires, no drama — and it stitches them together into one combined text output. No limit on how many signals you can stack. Reorder them by dragging, hide previews with a right-click, and let derpRouter handle the routing.

---

## How It Works

You don't plug wires into this thing. It listens to the wireless signal registry and lets you pick which STRING-type signals to combine. Each selected signal gets its own entry with a live text preview, and the combined result is broadcast back out as a new wireless signal that derpRouter (or any wireless receiver) can pick up.

<span style="color: #80aaff"><strong>Select signals</strong></span> from the dropdown at the bottom of the node. Only STRING-type signals from signalOut nodes appear — the node filters out anything it can't concatenate.

<span style="color: #80aaff"><strong>Reorder by dragging</strong></span> any signal entry up or down. The concatenation order follows the visual order — top to bottom.

<span style="color: #80aaff"><strong>Toggle previews</strong></span> by right-clicking any signal entry. Hide the preview to keep the node compact when you've got a lot of signals stacked up.

<span style="color: #80aaff"><strong>Remove signals</strong></span> with the close button on each entry.

<span style="color: #80aaff"><strong>Auto-sizing</strong></span> adjusts the node height as signals come and go. Width is fixed at 180px.

<span style="color: #80aaff"><strong>Loop guard</strong></span> prevents you from selecting signals from nodes that are downstream of the Concatenate — no infinite signal loops allowed.

---

<span style="color: #ffc680">**Important:**</span> This node needs [derpRouter](../Management%20Nodes/Derp%20Router.md) to route its output to receivers. Wired connections don't interact with it at all — it's pure wireless.

---

## Ports

| Port | Direction | Type | Description |
|------|-----------|------|-------------|
| Output | Out | STRING | The concatenated result of all selected signals |


---

[? Back to Index](../INDEX.md)
