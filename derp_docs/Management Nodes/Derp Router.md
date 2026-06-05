# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Router</span>

![[derpRouter_01.jpg]]
The central nervous system of your derp-powered workflow. Routes wireless signals between nodes so your Model Loader, Sampler Loader, and every other loader can talk to each other without a single visible wire. Without this node, all those loaders are just very confident paperweights.

<span style="color: #ffc680"><strong>Important:</strong></span> Every derp loader node requires at least one derpRouter in the workflow. Add it first. Always.

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Signal detection</strong></span>: Automatically discovers every node in your workflow that's broadcasting a wireless signal. Shows you how many signals are detected and how many you've added as outputs.

<span style="color: #80aaff"><strong>Add signals dropdown</strong></span>: Browse detected signals and add them as outputs. Includes search because your workflow has forty nodes and you're not scrolling through all of them.

<span style="color: #80aaff"><strong>Drag and drop outputs</strong></span>: Reorder your output signals by dragging them around. Unlike the loader decks, this IS functional — output order matters when nodes receive multiple signals.

<span style="color: #80aaff"><strong>Refresh registry</strong></span>: New nodes added to the workflow? Click refresh instead of deleting and re-adding the router like some kind of psychopath.

<span style="color: #80aaff"><strong>Warp to node</strong></span>: Click a signal entry to teleport the canvas to the broadcasting node. Because your workflow is a sprawling mess and you've lost track of where you put the VAE loader.

<span style="color: #80aaff"><strong>Orphaned signal animation</strong></span>: Signals from deleted nodes pulse with a subtle animation until you clean them up. Guilt-tripping you into maintaining your workflow, one orphan at a time.

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>Show Signal IDs</strong></span>: Displays node IDs next to signal names. Useful when two nodes have the same name and you can't tell which is which.

<span style="color: #80aaff"><strong>Show Slot Names</strong></span>: Shows the full node name including any slot suffix. Turn it off for cleaner display names.

<span style="color: #80aaff"><strong>Show Slot Types</strong></span>: Appends the signal type (MODEL, CLIP, VAE, etc.) to each entry. Helpful when you're routing obscure signal types.

<span style="color: #80aaff"><strong>Show Virtual Links</strong></span>: Displays wireless virtual links between the router and connected nodes. Purely visual, but satisfying to look at.

<span style="color: #80aaff"><strong>Hide Link Slots</strong></span>: When enabled, link slots are only visible when the node is selected. Keeps your canvas from looking like a cyberpunk circuit board.

<span style="color: #80aaff"><strong>Sort Signals By</strong></span>: Sort the signal list by Name, Type, or ID. Because everyone has a different opinion on how lists should be organized.