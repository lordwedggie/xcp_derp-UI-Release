import os
import folder_paths
from pathlib import Path
import comfy.sd
import comfy.utils

class xcpDerpLoraLoader:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "\u200B": ("MODEL",),
                "\u200B\u200B": ("CLIP",),
            },
            "hidden": {
                "lora_name": "STRING",
                "strength_model": "FLOAT",
                "strength_clip": "FLOAT",
                "loraEnabled": "BOOLEAN",
                "tagsIndex": "INT" # New hidden input
            }
        }
    # 🔴 FIX 1: Define invisible character correctly (zero-width space U+200B)
    INVISIBLE_CHAR = '\u200b'
    # 🔴 FIX 2: RETURN_TYPES must use valid ComfyUI types (not the invisible char string)
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    # 🔴 FIX 3: RETURN_NAMES uses the actual invisible character (not "u200B")
    RETURN_NAMES = (INVISIBLE_CHAR, INVISIBLE_CHAR, INVISIBLE_CHAR)
    FUNCTION = "load_lora_with_prompt"
    CATEGORY = "🔞 xcp_derp-UI/Loaders"

    @classmethod
    def JS_FILES(cls):
        return ["js/xcpDerpLoraLoader.js"]

    def load_lora_with_prompt(self, **kwargs):
        model = kwargs.get("\u200B")
        clip = kwargs.get("\u200B\u200B")
        empty_text = ""

        lora_name = kwargs.get("lora_name", "None")
        lora_enabled = kwargs.get("loraEnabled", True)
        try:
            tags_index = int(kwargs.get("tagsIndex", 0)) # Read the index from JS
        except:
            tags_index = 0

        # 1. Check if disabled
        if not lora_enabled or not lora_name or lora_name == "None":
            print(f"[xcpDerpLoraLoader] LoRA disabled or no name - returning bypass")
            return (model, clip, empty_text)

        # 2. Locate LoRA Path
        lora_path = folder_paths.get_full_path("loras", lora_name)
        if not lora_path or not os.path.exists(lora_path):
            print(f"[xcpDerpLoraLoader] Failed: LoRA not found - {lora_name}")
            return (model, clip, empty_text)

        # 3. Locate Tags
        lora_stem = Path(lora_name).stem
        lora_dir = Path(lora_path).parent
        prompt_subfolder = lora_dir / lora_stem
        prompt_strings = []

        if prompt_subfolder.is_dir():
            txt_files = sorted(prompt_subfolder.glob("*.txt"))
            valid_txt_files = [f for f in txt_files if f.name != "#instructions.txt"]

            if valid_txt_files:
                print(f"[xcpDerpLoraLoader] Successful: Found {len(valid_txt_files)} text files.")
                for txt_file in valid_txt_files:
                    try:
                        with open(txt_file, "r", encoding="utf-8") as f:
                            content = f.read().strip()
                            if content:
                                prompt_strings.append(content)
                    except Exception as e:
                        print(f"[xcpDerpLoraLoader] Failed to read {txt_file.name}: {str(e)}")

        # Select correct string based on index
        prompt_text = empty_text
        if prompt_strings:
            # Clamp index to valid range
            if tags_index >= len(prompt_strings):
                tags_index = 0
            if tags_index < 0:
                tags_index = 0

            prompt_text = prompt_strings[tags_index]
            print(f"[xcpDerpLoraLoader] Outputting string index {tags_index} (Length: {len(prompt_text)} chars)")

        # 4. Load LoRA
        try:
            strength_model = float(kwargs.get("strength_model", 1.0))
            strength_clip = float(kwargs.get("strength_clip", 1.0))

            lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
            patched_model, patched_clip = comfy.sd.load_lora_for_models(
                model, clip, lora, strength_model, strength_clip
            )

            return (patched_model, patched_clip, prompt_text)

        except Exception as e:
            print(f"[xcpDerpLoraLoader] CRITICAL ERROR loading LoRA {lora_name}: {e}")
            return (model, clip, empty_text)
