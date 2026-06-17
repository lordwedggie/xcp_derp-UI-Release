import json

class derpThemeManagerV2:
    @classmethod
    def INPUT_TYPES(s):
        # Empty dictionary removes all input sockets from the node
        return {
            "required": {},
        }

    # Setting these to empty tuples removes the output sockets
    RETURN_TYPES = ()
    RETURN_NAMES = ()

    FUNCTION = "manage_theme"
    CATEGORY = "🔞 derpNodes/Management"
    OUTPUT_NODE = True

    def manage_theme(self):
        # Function no longer accepts arguments as inputs were removed
        return ()

    @classmethod
    def IS_CHANGED(s, **kwargs):
        # Always return a value to ensure visibility if needed,
        # or use a static value since there are no inputs to track
        return float("nan")

# Mapping for ComfyUI to recognize the node
NODE_CLASS_MAPPINGS = {
    "derpThemeManagerV2": derpThemeManagerV2
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "derpThemeManagerV2": "Derp Theme Manager V2"
}