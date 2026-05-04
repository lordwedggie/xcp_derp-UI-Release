# Path: ./python/derpControldeck.py

class DerpTemplateV2Node:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/Templates"

    def do_nothing(self):
        return ()

# THE NEW FATHA CHILD: Pure virtual lora stack shell
class DerpLoraStackNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("LORA_STACK",)
    RETURN_NAMES = ("lora_stack",)
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None to force wireless signal handling
        return (None,)

# THE NEW FATHA CHILD: Pure virtual slider shell
class DerpSliderNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("FLOAT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None to force wireless signal handling
        return (None,)

class DerpPromptBookNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        return ()

class DerpLatentNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None so derpSignalOut is forced to reconstruct the true dimensions from metadata
        return (None,)

class DerpModelLoaderNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("model", "clip", "vae")
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None to force wireless signal handling
        return (None, None, None)

# THE NEW FATHA CHILD: Pure virtual vae loader shell
class DerpVaeLoaderNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("VAE",)
    RETURN_NAMES = ("vae",)
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None to force wireless signal handling
        return (None,)

class DerpTriggerWallNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("Triggers",)
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_nothing(self):
        # THE PURE VIRTUAL FIX: Return None to force wireless signal handling
        return (None,)

# --- MAPPINGS ---
NODE_CLASS_MAPPINGS = {
    "DerpTemplateV2Node": DerpTemplateV2Node,
    "DerpLoraStackNode": DerpLoraStackNode,
    "DerpSliderNode": DerpSliderNode,
    "DerpPromptBookNode": DerpPromptBookNode,
    "DerpLatentNode": DerpLatentNode,
    "DerpModelLoaderNode": DerpModelLoaderNode,
    "DerpVaeLoaderNode": DerpVaeLoaderNode,
    "DerpTriggerWallNode": DerpTriggerWallNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DerpTemplateV2Node": "Derp Template V2",
    "DerpLoraStackNode": "Derp Lora Stack",
    "DerpSliderNode": "Derp Slider",
    "DerpPromptBookNode": "Derp Prompt Book",
    "DerpLatentNode": "Derp Latent",
    "DerpModelLoaderNode": "Derp Model Loader",
    "DerpVaeLoaderNode": "Derp Vae Loader",
    "DerpTriggerWallNode": "Derp Trigger Wall"
}