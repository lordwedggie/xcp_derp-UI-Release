# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">VAE Loader</span>

![image](derpVaeLoader_01.jpg)
Loads VAE files (.safetensors, .pt, .ckpt) onto the node's deck for one-click switching without ever opening that godforsaken default dropdown again. Also capable of ripping VAEs straight out of your model files, because downloading them separately is for people with too much free time.

<span style="color: #ffc680"><strong>Important:</strong></span> This loader needs [derpRouter](Management%20Nodes/Derp%20Router.md) to function. Without it, it's just a decorative rectangle.

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Refresh button</strong></span>: New VAE appeared in your folder? Click this instead of restarting ComfyUI like it's 2022.

<span style="color: #80aaff"><strong>Remove button</strong></span>: Kick a VAE off the deck. It'll find its way home. Probably.

<span style="color: #80aaff"><strong>Drag and drop</strong></span>: Reorder your VAE entries to match your current emotional state. Purely cosmetic — your workflow doesn't care, but you might.

<span style="color: #80aaff"><strong>Search tab</strong></span>: Type to filter your VAE list instead of scrolling past eighty-seven files named "vae-ft-mse-840000-ema-pruned."

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>Show Folder Names</strong></span>: Toggles folder paths in the VAE display. Disable it if your directory names embarrass you.

<span style="color: #80aaff"><strong>Extract VAE from model</strong></span>: Instead of pointing at a dedicated VAE folder, this switches the file browser to your models directory and extracts the VAE directly from checkpoint files. One less folder to manage, one less thing to forget to download.