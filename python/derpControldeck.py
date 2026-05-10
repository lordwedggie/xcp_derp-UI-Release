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


class DerpImageDeckNode:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}, "optional": {"images": ("IMAGE",)}}

    RETURN_TYPES = ()
    FUNCTION = "preview_images"
    OUTPUT_NODE = True
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def __init__(self):
        import uuid
        self._image_deck_prefix = f"derp_image_deck_{uuid.uuid4().hex[:8]}"
        self._image_deck_counter = 0

    def _to_uint8(self, image_tensor):
        import numpy as np
        arr = 255.0 * image_tensor.cpu().numpy()
        arr = np.clip(arr, 0, 255).astype(np.uint8)
        return arr

    def preview_images(self, images=None):
        import os
        from PIL import Image
        import folder_paths

        if images is None:
            return {"ui": {"images": []}}

        output_dir = folder_paths.get_temp_directory()
        results = []

        for image in images:
            arr = self._to_uint8(image)
            pil = Image.fromarray(arr)

            filename = f"{self._image_deck_prefix}_{self._image_deck_counter:05}.png"
            self._image_deck_counter += 1
            full_path = os.path.join(output_dir, filename)
            pil.save(full_path, compress_level=4)

            results.append({
                "filename": filename,
                "subfolder": "",
                "type": "temp"
            })

        return {"ui": {"images": results}}

# --- MAPPINGS ---
NODE_CLASS_MAPPINGS = {
    "DerpTemplateV2Node": DerpTemplateV2Node,
    "DerpLoraStackNode": DerpLoraStackNode,
    "DerpSliderNode": DerpSliderNode,
    "DerpPromptBookNode": DerpPromptBookNode,
    "DerpLatentNode": DerpLatentNode,
    "DerpModelLoaderNode": DerpModelLoaderNode,
    "DerpVaeLoaderNode": DerpVaeLoaderNode,
    "DerpTriggerWallNode": DerpTriggerWallNode,
    "DerpImageDeckNode": DerpImageDeckNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DerpTemplateV2Node": "Derp Template V2",
    "DerpLoraStackNode": "Derp Lora Stack",
    "DerpSliderNode": "Derp Slider",
    "DerpPromptBookNode": "Derp Prompt Book",
    "DerpLatentNode": "Derp Latent",
    "DerpModelLoaderNode": "Derp Model Loader",
    "DerpVaeLoaderNode": "Derp Vae Loader",
    "DerpTriggerWallNode": "Derp Trigger Wall",
    "DerpImageDeckNode": "Derp Image Deck"
}
