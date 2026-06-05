# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Latent</span>

![image](../_assets/images/derpLatent_01.jpg)
Generates an empty latent image with configurable width, height, and batch size. The node that starts it all — no models, no checkpoints, just a blank canvas and your questionable resolution choices.

<span style="color: #ffc680"><strong>Note:</strong></span> This node broadcasts its output as a wireless signal. If you're using derp loaders downstream, you'll need a [derpRouter](../Management%20Nodes/Derp%20Router.md) to route it. 

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Portrait / Landscape toggle</strong></span>: Click to flip between orientation modes. Swaps width and height for you because doing it manually is what default nodes are for.

<span style="color: #80aaff"><strong>Resolution selector</strong></span>: Click the resolution display to cycle through your preset sizes. Saves you from typing "512" and "768" forty times a day.

<span style="color: #80aaff"><strong>Batch size</strong></span>: Click the number to edit how many latents to generate at once. Minimum 1, maximum however much VRAM you're willing to sacrifice.

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>Latent configuration</strong></span>: Create and manage resolution presets. Define custom width/height pairs so you're not stuck with just 512×512 and 768×768.

<span style="color: #80aaff"><strong>Load Settings</strong></span>: Save, load, rename, and duplicate profile arrangements. Keep separate presets for SD1.5, SDXL, Flux — whatever resolution targets your current model expects without you having to remember them.