# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Diffusion Loader</span>

![image](../_assets/images/derpDiffusionLoader_01.jpg)
Loads diffusion model files onto the deck for one-click switching, with configurable weight dtype. For CLIP models, see the separate [Derp CLIP Loader](Derp%20Clip%20Loader.md).

<span style="color: #ffc680"><strong>Important:</strong></span> This loader needs [derpRouter](../Management%20Nodes/Derp%20Router.md) to function.

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Diffusion model deck</strong></span>: Load and hot-swap your diffusion models. Click to activate, drag to reorder.

<span style="color: #80aaff"><strong>Refresh button</strong></span>: New models in your folder? Click instead of restarting.

<span style="color: #80aaff"><strong>Clear button</strong></span>: Wipe the deck. Grayed out when empty.

<span style="color: #80aaff"><strong>Remove button</strong></span>: Evict individual entries.

<span style="color: #80aaff"><strong>Drag and drop</strong></span>: Reorder your diffusion models.

<span style="color: #80aaff"><strong>Search tab</strong></span>: Filter your model list by typing.

<span style="color: #80aaff"><strong>Settings toggle</strong></span>: The ⚙️ button in the header. Once your deck is loaded, toggle it off to hide the file browser for a cleaner look. Toggle back on when you need to add models.

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>Show Folder Names</strong></span>: Toggles folder paths in the display.

<span style="color: #80aaff"><strong>Weight Dtype</strong></span>: Select precision for loading diffusion models. Options: default, fp8_e4m3fn, fp8_e4m3fn_fast, fp8_e5m2. Lower precision = less VRAM.

<span style="color: #80aaff"><strong>Clear VRAM on new model selection</strong></span>: Unloads the previous diffusion model from VRAM before switching to a new one. Keeps your 4090 from throwing a fit. On by default.

---

[? Back to Index](../INDEX.md)
