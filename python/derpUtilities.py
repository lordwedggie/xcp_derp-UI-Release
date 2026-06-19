# Path: ./python/derpUtilities.py

class derpSkunk:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "🔞 derpNodes/Utilities"

    def do_nothing(self):
        return ()


class derpNotes:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "do_nothing"
    CATEGORY = "ðŸ”ž derpNodes/Utilities"

    def do_nothing(self):
        return ()


NODE_CLASS_MAPPINGS = {
    "derpSkunk": derpSkunk,
    "derpNotes": derpNotes,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "derpSkunk": "Derp Skunk Works",
    "derpNotes": "Derp Notes",
}
