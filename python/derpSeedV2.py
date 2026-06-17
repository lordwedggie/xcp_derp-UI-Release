class derpSeedV2:
    INVISIBLE_CHAR = '\u200b'

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "display": "number"}),
                "values_data": ("STRING", {"default": "{}", "multiline": True}),
            },
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = (INVISIBLE_CHAR,)

    FUNCTION = "do_derp"
    CATEGORY = "🔞 derpNodes/ControlDeck"
    OUTPUT_NODE = True

    def do_derp(self, value, values_data, **kwargs):
        return (int(value),)

    @classmethod
    def IS_CHANGED(s, value, values_data, **kwargs):
        return float("NaN")

NODE_CLASS_MAPPINGS = {"derpSeedV2": derpSeedV2}
NODE_DISPLAY_NAME_MAPPINGS = {"derpSeedV2": "Derp Seed V2"}