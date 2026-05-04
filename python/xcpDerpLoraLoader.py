import os
import sys
import subprocess
import folder_paths
import hashlib
import json
import base64
import shutil
from io import BytesIO
from PIL import Image, ImageOps
from PIL.PngImagePlugin import PngInfo
from pathlib import Path
import comfy.sd
import comfy.utils
from server import PromptServer
from aiohttp import web

print("### DEBUG: xcpDerpLoraLoader.py imported successfully ###")

# Helper function for CivitAI Hash Lookup
def get_file_hash(filename):
    hash_sha256 = hashlib.sha256()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hash_sha256.update(chunk)
    return hash_sha256.hexdigest().upper()

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
    CATEGORY = "🔞 xcpDerpNodes/Loaders"

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

# ============================================================================
# API ENDPOINTS
# ============================================================================

@PromptServer.instance.routes.get("/xcp/get_civitai_url")
async def get_civitai_url(request):
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name or lora_name == "None":
        return web.json_response({"url": None})

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.exists(lora_path):
        return web.json_response({"url": None})

    try:
        print(f"[API] Calculating hash for CivitAI lookup: {lora_name}")
        file_hash = get_file_hash(lora_path)
        api_url = f"https://civitai.com/api/v1/model-versions/by-hash/{file_hash}"

        return web.json_response({
            "hash_url": api_url,
            "search_url": f"https://civitai.com/search/models?query={Path(lora_name).stem}"
        })
    except Exception as e:
        print(f"[API] Error hashing file: {e}")
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.get("/xcp/fetch_lora_tags")
async def fetch_lora_tags(request):
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name or lora_name == "None":
        return web.json_response({"tags": []})

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.exists(lora_path):
        return web.json_response({"tags": [], "error": "File not found"})

    lora_stem = Path(lora_name).stem
    lora_dir = Path(lora_path).parent
    prompt_subfolder = lora_dir / lora_stem

    prompt_strings = []
    print(f"[API] Fetching tags for: {lora_name}")

    if prompt_subfolder.is_dir():
        txt_files = sorted(prompt_subfolder.glob("*.txt"))
        valid_txt_files = [f for f in txt_files if f.name != "#instructions.txt"]

        if valid_txt_files:
            print(f"[API] Successful: Found {len(valid_txt_files)} text files in string array.")
            for txt_file in valid_txt_files:
                try:
                    with open(txt_file, "r", encoding="utf-8") as f:
                        content = f.read().strip()
                        if content:
                            prompt_strings.append(content)
                except Exception as e:
                    pass

    return web.json_response({"tags": prompt_strings})

@PromptServer.instance.routes.get("/xcp/open_lora_folder")
async def open_lora_folder(request):
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name or lora_name == "None":
        return web.json_response({"error": "No LoRA provided"})

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.exists(lora_path):
        return web.json_response({"error": "File not found"})

    lora_stem = Path(lora_name).stem
    lora_dir = Path(lora_path).parent
    tag_folder = lora_dir / lora_stem
    target_path = tag_folder if tag_folder.is_dir() else lora_dir
    target_path_str = str(target_path)

    print(f"[API] Opening folder: {target_path_str}")

    try:
        if os.name == 'nt':
            abs_path = os.path.abspath(target_path_str)
            subprocess.Popen(['explorer', abs_path])
        elif sys.platform == 'darwin':
            subprocess.run(['open', target_path_str])
        else:
            subprocess.run(['xdg-open', target_path_str])
        return web.json_response({"status": "success"})
    except Exception as e:
        print(f"[API] Error opening folder: {e}")
        return web.json_response({"error": str(e)})

@PromptServer.instance.routes.get("/xcp/open_lora_file_location")
async def open_lora_file_location(request):
    lora_name = request.rel_url.query.get("lora_name", "")
    if not lora_name or lora_name == "None":
        return web.json_response({"error": "No LoRA provided"})

    lora_path = folder_paths.get_full_path("loras", lora_name)
    if not lora_path or not os.path.exists(lora_path):
        return web.json_response({"error": "File not found"})

    print(f"[API] Opening LoRA file location: {lora_path}")

    try:
        if os.name == 'nt':
            abs_path = os.path.abspath(lora_path)
            subprocess.Popen(['explorer', '/select,', abs_path])
        elif sys.platform == 'darwin':
            subprocess.run(['open', '-R', lora_path])
        else:
            folder = os.path.dirname(lora_path)
            subprocess.run(['xdg-open', folder])
        return web.json_response({"status": "success"})
    except Exception as e:
        print(f"[API] Error opening file location: {e}")
        return web.json_response({"error": str(e)})

@PromptServer.instance.routes.post("/xcp/upload_lora_preview")
async def upload_lora_preview(request):
    try:
        body = await request.json()
        lora_id = body.get("loraPath") or body.get("name")
        image_b64 = body.get("image")
        is_cover = body.get("is_cover", False)

        if not lora_id or not image_b64:
            return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = folder_paths.get_full_path("loras", lora_id.replace("\\", "/"))
        if not full_path:
            return web.json_response({"error": "LoRA not found"}, status=404)

        model_name = os.path.splitext(os.path.basename(full_path))[0]
        base_name = os.path.join(os.path.dirname(full_path), model_name)
        sidecar_dir = os.path.splitext(full_path)[0]
        os.makedirs(sidecar_dir, exist_ok=True)

        if "," in image_b64:
            image_b64 = image_b64.split(",")[1]

        img_data = base64.b64decode(image_b64)
        img = Image.open(BytesIO(img_data))

        if img.mode != "RGB":
            img = img.convert("RGB")

        model_name_prefix = body.get("model_name_prefix")
        if model_name_prefix and model_name_prefix.lower().endswith(".safetensors"):
            base_filename = model_name_prefix.replace("\\", "_").replace("/", "_")[:-12]
        else:
            base_filename = model_name_prefix.replace("\\", "_").replace("/", "_") if model_name_prefix else model_name

        idx = 1
        while True:
            sub_name = f"{base_filename}_{idx:03d}.png"
            sub_path = os.path.join(sidecar_dir, sub_name)
            if not os.path.exists(sub_path):
                break
            idx += 1

        if is_cover:
            target_name = f"{model_name}.png"
            target_path = f"{base_name}.png"
        else:
            target_name = sub_name
            target_path = sub_path

        # THE METADATA EMBEDDING: Capture ComfyUI workflow and prompt data into the PNG header
        metadata = PngInfo()
        if body.get("prompt"):
            metadata.add_text("prompt", json.dumps(body.get("prompt")))
        if body.get("extra_pnginfo"):
            for k, v in body.get("extra_pnginfo").items():
                metadata.add_text(k, json.dumps(v))

        img.save(target_path, "PNG", pnginfo=metadata)

        if is_cover:
            img.save(sub_path, "PNG", pnginfo=metadata)
            try:
                thumb_path = os.path.join(sidecar_dir, "_thumbnail.jpg")
                thumb = ImageOps.fit(img, (128, 128), Image.Resampling.LANCZOS)
                if thumb.mode in ("RGBA", "P"):
                    thumb = thumb.convert("RGB")
                thumb.save(thumb_path, "JPEG", quality=85)
            except Exception as e:
                print(f"⚠️ [xcpDerp] Cover thumbnail generation failed during upload: {e}")

        return web.json_response({"success": True, "file": target_name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)