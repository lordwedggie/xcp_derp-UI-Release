# <span style="color: #ff8080">Derp</span> <span style="color: #ffffff">Model Loader</span>

![image](../_assets/images/derpModelLoader_01.jpg)
Loads SDXL-based checkpoints (.safetensors and .pt files) onto the node's deck so you can hot-swap models with a single click — no dropdown menus, no scrolling through a list of 200 checkpoints named "final_final_v3_actually_final." 

<span style="color: #ffc680"><strong>Important:</strong></span> This loader needs [derpRouter](../Management%20Nodes/Derp%20Router.md) to function. Without it, it's just a very enthusiastic paperweight. 

### <span style="color: #80ffc0">Features</span>

<span style="color: #80aaff"><strong>Refresh button</strong></span>: New models in your folder? Click this instead of reloading ComfyUI like some kind of caveman.

<span style="color: #80aaff"><strong>Remove button</strong></span>: Evict a model from the deck. It won't be offended. Probably.

<span style="color: #80aaff"><strong>Drag and drop</strong></span>: Rearrange your model entries by dragging them around. Purely cosmetic — it won't change your workflow output, but it *will* satisfy your inner control freak.

#### <span style="color: #80ffc0">System Panel Options</span>

<span style="color: #80aaff"><strong>Show Folder Names</strong></span>: Toggles folder names in the model display. Turn it off if you'd rather not be reminded of your chaotic directory structure.

<span style="color: #80aaff"><strong>Clear VRAM on new model selection</strong></span>: Dumps VRAM the moment you pick a different model. On by default, because ComfyUI's memory management has enough problems without you hoarding gigabytes.

<span style="color: #80aaff"><strong>Load Settings</strong></span>: Save, load, rename, and duplicate deck arrangements for different workflows — your "portrait models" deck, your "architectural renders" deck, whatever. The default profile is intentionally empty because your models are scattered across seventeen folders with inconsistent names and nobody can make sense of them but you.

---

[? Back to Index](../INDEX.md)
