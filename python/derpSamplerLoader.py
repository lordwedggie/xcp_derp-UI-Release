def get_sampler_names():
    try:
        from comfy.samplers import KSampler
        samplers = getattr(KSampler, "SAMPLERS", None)
        if samplers:
            return list(samplers)
    except Exception:
        pass

    return ["euler"]

class derpSamplerLoader:
    INVISIBLE_CHAR = '\u200b'

    @classmethod
    def INPUT_TYPES(s):
        sampler_names = get_sampler_names()
        return {
            "required": {},
            "optional": {
                "sampler_name": (sampler_names,),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = (INVISIBLE_CHAR,)
    FUNCTION = "load_sampler"
    CATEGORY = "🔞 derpNodes/Loaders"
    OUTPUT_NODE = True

    def load_sampler(self, sampler_name=""):
        sampler_names = get_sampler_names()
        if sampler_name in sampler_names:
            return (sampler_name,)
        return (sampler_names[0] if sampler_names else "euler",)


NODE_CLASS_MAPPINGS = {
    "derpSamplerLoader": derpSamplerLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "derpSamplerLoader": "Derp Sampler Loader"
}
