# Comprehensive list of common ComfyUI samplers
SAMPLER_NAMES = [
    "euler", "euler_ancestral", "heun", "heunpp2", "dpm_2", "dpm_2_ancestral",
    "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", "dpmpp_sde",
    "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", "ddpm", "lcm"
]

class derpSamplerLoader:
    INVISIBLE_CHAR = '\u200b'

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "sampler_name": (SAMPLER_NAMES,),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = (INVISIBLE_CHAR,)
    FUNCTION = "load_sampler"
    CATEGORY = "🔞 derpNodes/Loaders"
    OUTPUT_NODE = True

    def load_sampler(self, sampler_name=""):
        # Validate that the sampler name is in our list
        if sampler_name in SAMPLER_NAMES:
            return (sampler_name,)
        else:
            # Fallback to first sampler if not found
            return (SAMPLER_NAMES[0] if SAMPLER_NAMES else "euler",)


NODE_CLASS_MAPPINGS = {
    "derpSamplerLoader": derpSamplerLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "derpSamplerLoader": "Derp Sampler Loader"
}
