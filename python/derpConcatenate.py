class derpConcatenate:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text_a": ("STRING", {"default": "", "multiline": True}),
                "text_b": ("STRING", {"default": "", "multiline": True}),
            },
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "do_derp"
    CATEGORY = "🔞 derpNodes/Utilities"

    def do_derp(self, text_a, text_b, **kwargs):
        return (text_a + text_b,)


NODE_CLASS_MAPPINGS = {"derpConcatenate": derpConcatenate}
NODE_DISPLAY_NAME_MAPPINGS = {"derpConcatenate": "Derp Concatenate"}
