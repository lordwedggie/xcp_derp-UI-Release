import torch
import json

class derpStringV3:
    INVISIBLE_CHAR = '\u200b'

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "count": ("INT", {"default": 1, "min": 1, "max": 16, "step": 1, "display": "number"}),
                # FIX: We add a specific input to carry the text data
                # ComfyUI will only send data to the backend if it matches an INPUT_TYPE
                "values_data": ("STRING", {"default": "[]", "multiline": True}),
            },
        }

    # 16 Outputs to match max count
    RETURN_TYPES = ("STRING",) * 16
    RETURN_NAMES = (INVISIBLE_CHAR,) * 16

    OUTPUT_NODE = True
    FUNCTION = "do_derp"
    CATEGORY = "🔞 derpNodes/ControlDeck"

    def do_derp(self, count, values_data, **kwargs):
        # 1. Parse the JSON data bundled by the JS frontend
        try:
            text_values = json.loads(values_data)
        except Exception:
            text_values = []

        results = []

        # 2. Map values to outputs, padding with empty strings
        for i in range(16):
            if i < count and i < len(text_values):
                results.append(str(text_values[i]))
            else:
                results.append("")

        return tuple(results)

    @classmethod
    def IS_CHANGED(s, count, values_data, **kwargs):
        return float("NaN")

NODE_CLASS_MAPPINGS = {
    "derpStringV3": derpStringV3
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "derpStringV3": "Derp String V3"
}