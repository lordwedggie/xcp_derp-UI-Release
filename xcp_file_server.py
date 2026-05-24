import server
from aiohttp import web
import json
import folder_paths
import os
import uuid
import shutil
import sys
import subprocess
import re
from PIL import Image
from .xcp_tagHandling import handle_import_lora_tags, handle_manage_lora_tag
from .xcp_loraStack import (handle_save_lora_rating, handle_save_lora_notes, handle_get_loras, handle_check_lora_files, handle_get_lora_preview,
                             handle_get_lora_triggers, handle_get_lora_info, handle_open_folder, handle_delete_lora_preview, handle_upload_lora_preview, get_lora_stack_profiles_dir,
                             handle_list_derpLoraStack, handle_save_derpLoraStack, handle_load_derpLoraStack, handle_list_lora_images, handle_get_lora_image, handle_set_lora_cover, handle_delete_lora_image,
                             handle_rename_lora_bundle)

# --- PATH SETUP ---
EXT_ROOT = os.path.dirname(os.path.abspath(__file__))
PRIMARY_ROOT = os.path.join(folder_paths.get_user_directory(), "derpNodes")
FALLBACK_ROOT = os.path.join(EXT_ROOT, "user", "derpNodes")
USING_FALLBACK_ROOT = False

def resolve_derp_root():
    global USING_FALLBACK_ROOT
    if os.path.exists(PRIMARY_ROOT):
        USING_FALLBACK_ROOT = False
        return PRIMARY_ROOT
    os.makedirs(FALLBACK_ROOT, exist_ok=True)
    USING_FALLBACK_ROOT = True
    print(f"⚠️ [xcpDerp] Using fallback extension storage: '{FALLBACK_ROOT}'")
    return FALLBACK_ROOT

def attach_fallback_header(response, used_fallback=False):
    if response is not None and (USING_FALLBACK_ROOT or used_fallback):
        response.headers["X-Xcp-Using-Fallback"] = "1"
    return response

def _split_rel_path(path):
    normalized = str(path or "").replace("\\", "/").strip("/")
    return [part for part in normalized.split("/") if part]

def resolve_case_insensitive_path(base_dir, relative_path, create_parent=False):
    if not base_dir:
        return None
    if not os.path.exists(base_dir):
        if create_parent:
            return os.path.join(base_dir, relative_path)
        return None
    current = base_dir
    parts = _split_rel_path(relative_path)
    if not parts:
        return current

    for index, part in enumerate(parts):
        is_last = index == len(parts) - 1
        try:
            entries = os.listdir(current)
        except Exception:
            entries = []

        match = next((entry for entry in entries if entry.lower() == part.lower()), None)
        if match is not None:
            current = os.path.join(current, match)
            continue

        if create_parent or is_last:
            current = os.path.join(current, part)
            continue

        return None

    return current

def resolve_case_insensitive_dir(base_dir, folder_name):
    path = resolve_case_insensitive_path(base_dir, folder_name)
    if path and os.path.isdir(path):
        return path
    return os.path.join(base_dir, folder_name)

def resolve_derp_subdir_for_root(root_dir, preferred_name, *legacy_names, create=False):
    candidates = [preferred_name, *legacy_names]
    for name in candidates:
        path = os.path.join(root_dir, name)
        if os.path.exists(path):
            return path
    path = os.path.join(root_dir, preferred_name)
    if create:
        os.makedirs(path, exist_ok=True)
    return path

DERP_ROOT = resolve_derp_root()

def resolve_derp_subdir(preferred_name, *legacy_names):
    return resolve_derp_subdir_for_root(DERP_ROOT, preferred_name, *legacy_names, create=True)

THEME_DIR = resolve_derp_subdir("Themes", "themes")

PALETTE_DIR = resolve_derp_subdir("Palettes", "palettes")

BACKGROUNDS_DIR = resolve_derp_subdir("backgrounds")

SETTINGS_DIR = resolve_derp_subdir("nodeSettings")

DEFAULT_SETTINGS_FILES = {
    "derpLoraStack.json": {},
}

for file_name, default_data in DEFAULT_SETTINGS_FILES.items():
    target_path = os.path.join(SETTINGS_DIR, file_name)
    if not os.path.exists(target_path):
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2)

PROMPT_BOOK_DIR = resolve_derp_subdir("derpPromptBook")

TRIGGER_WALL_DIR = resolve_derp_subdir("derpTriggerWall")

TRIGGER_WALL_DECK_DIR = resolve_derp_subdir("derpTriggerWallDeck")

LOCALE_DIR = os.path.join(EXT_ROOT, "locales")
os.makedirs(LOCALE_DIR, exist_ok=True)

LORA_STACKS_DIR = get_lora_stack_profiles_dir(DERP_ROOT)

CATEGORIES = {
    "themes": THEME_DIR,
    "settings": SETTINGS_DIR,
    "derpSlider": SETTINGS_DIR,
    "derpLatent": SETTINGS_DIR,
    "derpModelLoader": SETTINGS_DIR,
    "derpVaeLoader": SETTINGS_DIR,
    "derpLoraStack": LORA_STACKS_DIR,
    "palettes": PALETTE_DIR,
    "backgrounds": BACKGROUNDS_DIR,
    "derpPromptBook": PROMPT_BOOK_DIR,
    "books": PROMPT_BOOK_DIR, # THE COMPATIBILITY FIX: Add 'books' alias for legacy URL requests
    "locales": LOCALE_DIR,
    "models": folder_paths.get_folder_paths("checkpoints")[0],
    "diffusion_models": folder_paths.get_folder_paths("diffusion_models")[0],
    "unet": folder_paths.get_folder_paths("unet")[0],
    "text_encoders": folder_paths.get_folder_paths("text_encoders")[0],
    "vaes": folder_paths.get_folder_paths("vae")[0],
    "output": folder_paths.get_output_directory(),
    "triggerWall": TRIGGER_WALL_DIR,
    "triggerWallDeck": SETTINGS_DIR,
}

def get_category_dir(category):
    return CATEGORIES.get(category)

def get_theme_search_dirs():
    return [
        os.path.join(PRIMARY_ROOT, "Themes"),
        os.path.join(FALLBACK_ROOT, "themes"),
    ]

def get_palette_search_dirs():
    return [
        os.path.join(PRIMARY_ROOT, "Palettes"),
        os.path.join(FALLBACK_ROOT, "palettes"),
    ]

def get_background_search_dirs():
    return [
        os.path.join(PRIMARY_ROOT, "backgrounds"),
        os.path.join(FALLBACK_ROOT, "backgrounds"),
    ]

# SAFETY UTILITY: Prevents duplicate route registration crashes
def safe_post(path, handler):
    for route in server.PromptServer.instance.routes:
        if route.method == "POST" and route.path == path:
            print(f"⚠️ [xcpDerp] Route {path} already registered. Skipping.")
            return
    server.PromptServer.instance.routes.post(path)(handler)

def safe_get(path, handler):
    for route in server.PromptServer.instance.routes:
        if route.method == "GET" and route.path == path:
            return
    server.PromptServer.instance.routes.get(path)(handler)

print(f"✅ [xcpDerp] Server Initialized (Namespace Pattern).")

# ==========================================
# 1. GENERIC JSON IO HUB
# ==========================================

async def list_files(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    model_categories = {"models", "vaes", "diffusion_models", "unet", "text_encoders"}
    # THE VIRTUAL CATEGORY FIX: Dynamically resolve LoRA sidecar path for trigger file management
    if category == "lora_triggers":
        name = request.query.get("name")
        if name:
            full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
            if full_path:
                target_dir = os.path.splitext(full_path)[0]
                os.makedirs(target_dir, exist_ok=True)
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        if category in model_categories:
            items = folder_paths.get_filename_list(category)
            return attach_fallback_header(web.json_response({"items": items}))

        items = []
        seen = set()
        search_roots = get_theme_search_dirs() if category == "themes" else get_palette_search_dirs() if category == "palettes" else get_background_search_dirs() if category == "backgrounds" else [target_dir]
        # THE SYMLINK FIX: followlinks=True ensures symlinked folders (common in ComfyUI) are traversed
        for search_root in search_roots:
            if not search_root or not os.path.exists(search_root):
                continue
            for root, dirs, files in os.walk(search_root, followlinks=True):
                # Ignore internal image preview folders
                dirs[:] = [d for d in dirs if not d.endswith("_IMG")]

                # THE FOLDER PICKER FIX: The output folder browser needs explicit directory entries.
                # Add subfolders with trailing slashes so FILEBROWSER mode "folder" can navigate them.
                if category == "output":
                    for d in dirs:
                        rel_dir = os.path.relpath(os.path.join(root, d), search_root).replace("\\", "/") + "/"
                        if rel_dir not in seen:
                            seen.add(rel_dir)
                            items.append(rel_dir)

                for f in files:
                    # THE EXTENSION FILTER FIX: Allow model files (.safetensors, .ckpt, .pt) for model categories
                    valid_exts = (".safetensors", ".ckpt", ".pt") if category in ["models", "vaes", "diffusion_models", "unet", "text_encoders"] else ((".jpg", ".jpeg", ".png", ".webp") if category == "backgrounds" else (".txt" if category == "lora_triggers" else ".json"))
                    if f.lower().endswith(valid_exts):
                        rel_path = os.path.relpath(os.path.join(root, f), search_root)

                        if category in ["models", "vaes", "diffusion_models", "unet", "text_encoders", "backgrounds"]:
                            clean_item = rel_path.replace("\\", "/")
                        else:
                            clean_item = os.path.splitext(rel_path)[0].replace("\\", "/")

                        if clean_item not in seen:
                            seen.add(clean_item)
                            items.append(clean_item)
        return attach_fallback_header(web.json_response({"items": items}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"items": [], "error": str(e)}, status=500))
safe_get("/xcp/list/{category}", list_files)

async def get_background_file(request):
    file_name = request.query.get("name")
    if not file_name:
        return attach_fallback_header(web.Response(status=400))
    try:
        used_fallback = False
        target_path = None
        search_dirs = get_background_search_dirs()
        for index, search_dir in enumerate(search_dirs):
            candidate_path = resolve_case_insensitive_path(search_dir, file_name)
            if candidate_path and os.path.exists(candidate_path):
                target_path = candidate_path
                used_fallback = index > 0
                break
        if not target_path or not os.path.exists(target_path):
            return attach_fallback_header(web.Response(status=404), used_fallback=used_fallback)
        return attach_fallback_header(web.FileResponse(target_path), used_fallback=used_fallback)
    except Exception:
        return attach_fallback_header(web.Response(status=500))
safe_get("/xcp/get_background", get_background_file)

async def open_prompt_book_folder(request):
    try:
        target_dir = PROMPT_BOOK_DIR
        os.makedirs(target_dir, exist_ok=True)

        if os.name == 'nt':
            os.startfile(target_dir)
        elif sys.platform == 'darwin':
            subprocess.Popen(['open', target_dir])
        else:
            subprocess.Popen(['xdg-open', target_dir])

        return attach_fallback_header(web.json_response({"success": True}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"error": str(e)}, status=500))
safe_get("/xcp/open_prompt_book_folder", open_prompt_book_folder)

async def load_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if category != "themes" and not target_dir:
        return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
    try:
        file_name = request.query.get("name")
        if not file_name: return attach_fallback_header(web.json_response({"error": "No name provided"}, status=400))
        if not file_name.endswith(".json"): file_name += ".json"
        used_fallback = False

        if category == "themes":
            target_path = None
            search_dirs = get_theme_search_dirs()
            for index, search_dir in enumerate(search_dirs):
                candidate_path = resolve_case_insensitive_path(search_dir, file_name)
                if candidate_path and os.path.exists(candidate_path):
                    target_path = candidate_path
                    used_fallback = index > 0
                    break
            if target_path is None:
                target_path = resolve_case_insensitive_path(search_dirs[0], file_name)
        elif category == "palettes":
            target_path = None
            search_dirs = get_palette_search_dirs()
            for index, search_dir in enumerate(search_dirs):
                candidate_path = resolve_case_insensitive_path(search_dir, file_name)
                if candidate_path and os.path.exists(candidate_path):
                    target_path = candidate_path
                    used_fallback = index > 0
                    break
            if target_path is None:
                target_path = resolve_case_insensitive_path(search_dirs[0], file_name)
        else:
            target_path = resolve_case_insensitive_path(target_dir, file_name)
        if not target_path or not os.path.exists(target_path): return attach_fallback_header(web.json_response({"error": "File not found"}, status=404), used_fallback=used_fallback)
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return attach_fallback_header(web.json_response({"data": data}), used_fallback=used_fallback)
    except Exception as e:
        return attach_fallback_header(web.json_response({"error": str(e)}, status=500))
safe_get("/xcp/load/{category}", load_file)

async def save_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    try:
        body = await request.json()
        file_name = body.get("name")
        data = body.get("data")

        if category == "lora_triggers":
            name = request.query.get("name") or file_name
            if name:
                full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
                if full_path: target_dir = os.path.splitext(full_path)[0]

        if not target_dir: return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
        if not file_name or data is None: return attach_fallback_header(web.json_response({"error": "Missing name or data"}, status=400))

        ext = ".txt" if category == "lora_triggers" else ".json"
        clean_name = file_name.replace(ext, "").strip() + ext
        target_path = os.path.normpath(resolve_case_insensitive_path(target_dir, clean_name, create_parent=True))

        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            if target_path.endswith(".txt"):
                f.write(str(data))
            else:
                json.dump(data, f, indent=4)
        return attach_fallback_header(web.json_response({"success": True}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"success": False, "error": str(e)}, status=500))
safe_post("/xcp/save/{category}", save_file)

async def delete_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if category == "lora_triggers":
        name = request.query.get("name")
        if name:
            full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
            if full_path: target_dir = os.path.splitext(full_path)[0]
    if not target_dir: return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
    try:
        body = await request.json()
        file_name = body.get("name")
        if not file_name: return attach_fallback_header(web.json_response({"error": "No name provided"}, status=400))
        ext = ".txt" if category == "lora_triggers" else ".json"
        raw_name = file_name.replace(ext, "")
        if not file_name.endswith(ext): file_name += ext
        target_path = resolve_case_insensitive_path(target_dir, file_name)
        if os.path.exists(target_path): os.remove(target_path)

        # THE SIDECAR JSON FALLBACK: Remove tag entries from _info.json
        if category == "lora_triggers":
            info_path = os.path.join(target_dir, "_info.json")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f: data = json.load(f)
                keys_to_del = [k for k, v in data.items() if (isinstance(v, dict) and v.get("name") == raw_name) or k == raw_name]
                for k in keys_to_del: data.pop(k, None)
                with open(info_path, "w", encoding="utf-8") as f: json.dump(data, f, indent=4)

        img_folder = resolve_case_insensitive_dir(target_dir, f"{raw_name}_IMG")
        if os.path.exists(img_folder): shutil.rmtree(img_folder)
        return attach_fallback_header(web.json_response({"success": True}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"success": False, "error": str(e)}, status=500))
safe_post("/xcp/delete/{category}", delete_file)


def _resolve_image_source_directory(image_type):
    image_type = str(image_type or "output").lower()
    if image_type == "temp":
        return folder_paths.get_temp_directory()
    if image_type == "input" and hasattr(folder_paths, "get_input_directory"):
        return folder_paths.get_input_directory()
    return folder_paths.get_output_directory()


def _sanitize_save_name(name, fallback_name):
    raw = str(name or "").strip()
    if not raw:
        raw = str(fallback_name or "saved_image")
    raw = raw.replace("\\", "_").replace("/", "_")
    raw = re.sub(r"[^a-zA-Z0-9._ -]", "_", raw)
    raw = re.sub(r"\s+", " ", raw).strip(" .")
    return raw or "saved_image"


def _sanitize_subfolder_path(path):
    raw = str(path or "").replace("\\", "/").strip()
    if not raw:
        return ""

    parts = []
    for part in raw.split("/"):
        part = part.strip()
        if not part or part == ".":
            continue
        if part == "..":
            raise ValueError("Invalid subfolder path")
        part = part.replace("\x00", "")
        part = re.sub(r"[\r\n\t]", " ", part).strip()
        if part:
            parts.append(part)
    return "/".join(parts)


def _normalize_image_save_format(raw_format):
    fmt = str(raw_format or "PNG").strip().upper()
    if fmt == "JPG":
        fmt = "JPEG"
    return fmt if fmt in {"PNG", "JPEG", "WEBP"} else "PNG"


def _extension_for_image_format(image_format):
    return {
        "PNG": ".png",
        "JPEG": ".jpg",
        "WEBP": ".webp",
    }.get(image_format, ".png")


async def save_current_image_from_deck(request):
    try:
        body = await request.json()
        filename = str(body.get("filename") or "").strip()
        image_type = str(body.get("type") or "output").strip().lower()
        subfolder = _sanitize_subfolder_path(body.get("subfolder") or "")
        target_subfolder = _sanitize_subfolder_path(body.get("target_subfolder") or body.get("subfolder") or "")
        save_name = body.get("save_name")
        save_format = _normalize_image_save_format(body.get("save_format"))

        if not filename:
            return web.json_response({"success": False, "error": "Missing filename"}, status=400)

        src_root = _resolve_image_source_directory(image_type)
        src_dir = os.path.normpath(os.path.join(src_root, subfolder)) if subfolder else src_root
        src_path = os.path.normpath(os.path.join(src_dir, filename))

        if not src_path.startswith(os.path.normpath(src_root)):
            return web.json_response({"success": False, "error": "Invalid source path"}, status=400)
        if not os.path.exists(src_path):
            return web.json_response({"success": False, "error": "Source image not found"}, status=404)

        output_dir = folder_paths.get_output_directory()
        target_dir = os.path.normpath(os.path.join(output_dir, target_subfolder)) if target_subfolder else output_dir
        if not target_dir.startswith(os.path.normpath(output_dir)):
            return web.json_response({"success": False, "error": "Invalid target path"}, status=400)
        os.makedirs(target_dir, exist_ok=True)

        sanitized_name = _sanitize_save_name(save_name, os.path.splitext(filename)[0])
        forced_ext = _extension_for_image_format(save_format)
        sanitized_name = f"{os.path.splitext(sanitized_name)[0]}{forced_ext}"

        base_name, ext = os.path.splitext(sanitized_name)
        target_name = f"{base_name}{ext}"
        target_path = os.path.join(target_dir, target_name)

        index = 1
        while os.path.exists(target_path):
            target_name = f"{base_name}_{index:03d}{ext}"
            target_path = os.path.join(target_dir, target_name)
            index += 1

        if save_format == "PNG":
            shutil.copy2(src_path, target_path)
        else:
            with Image.open(src_path) as img:
                if save_format == "JPEG":
                    if img.mode not in ("RGB", "L"):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        alpha = img.getchannel("A") if "A" in img.getbands() else None
                        bg.paste(img.convert("RGBA"), mask=alpha)
                        img = bg
                    else:
                        img = img.convert("RGB")
                    img.save(target_path, "JPEG", quality=95)
                elif save_format == "WEBP":
                    img.save(target_path, "WEBP", quality=95)
                else:
                    img.save(target_path, "PNG", compress_level=4)
        result_name = f"{target_subfolder}/{target_name}" if target_subfolder else target_name
        return web.json_response({"success": True, "filename": result_name})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


safe_post("/xcp/derp_image_deck/save_current_image", save_current_image_from_deck)

async def rename_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if category == "lora_triggers":
        name = request.query.get("name")
        if name:
            full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
            if full_path: target_dir = os.path.splitext(full_path)[0]
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name: return web.json_response({"error": "Missing names"}, status=400)

        ext = ".txt" if category == "lora_triggers" else ".json"
        if not old_name.endswith(ext): old_name += ext
        if not new_name.endswith(ext): new_name += ext

        old_path = resolve_case_insensitive_path(target_dir, old_name)
        new_path = resolve_case_insensitive_path(target_dir, new_name, create_parent=True)

        if os.path.exists(old_path):
            # THE RENAME FIX: Use move to rename the physical file and cleanup the old one
            shutil.move(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            old_img = resolve_case_insensitive_dir(target_dir, f"{old_raw}_IMG")
            new_img = resolve_case_insensitive_path(target_dir, f"{new_raw}_IMG", create_parent=True)
            if os.path.exists(old_img): shutil.move(old_img, new_img)
            return web.json_response({"success": True})

        # THE SIDECAR JSON FALLBACK: Rename tag entries in _info.json
        if category == "lora_triggers":
            info_path = os.path.join(target_dir, "_info.json")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f: data = json.load(f)
                old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
                target_key, target_val = None, None
                for k, v in data.items():
                    if (isinstance(v, dict) and v.get("name") == old_raw) or k == old_raw:
                        target_key, target_val = k, v
                        break
                if target_key:
                    # THE SIDECAR RENAME FIX: Modify the existing entry/key instead of adding a new one
                    if isinstance(target_val, dict):
                        target_val["name"] = new_raw
                    else:
                        data[new_raw] = data.pop(target_key)

                    with open(info_path, "w", encoding="utf-8") as f: json.dump(data, f, indent=4)
                    return web.json_response({"success": True})

        return web.json_response({"error": "File not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/rename/{category}", rename_file)

async def duplicate_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if category == "lora_triggers":
        name = request.query.get("name")
        if name:
            full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
            if full_path: target_dir = os.path.splitext(full_path)[0]
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name: return web.json_response({"error": "Missing names"}, status=400)
        ext = ".txt" if category == "lora_triggers" else ".json"
        if not old_name.endswith(ext): old_name += ext
        if not new_name.endswith(ext): new_name += ext
        old_path = resolve_case_insensitive_path(target_dir, old_name)
        new_path = resolve_case_insensitive_path(target_dir, new_name, create_parent=True)
        if os.path.exists(old_path):
            shutil.copy2(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            old_img = resolve_case_insensitive_dir(target_dir, f"{old_raw}_IMG")
            new_img = resolve_case_insensitive_path(target_dir, f"{new_raw}_IMG", create_parent=True)
            if os.path.exists(old_img): shutil.copytree(old_img, new_img)
            return web.json_response({"success": True})

        # THE SIDECAR JSON FALLBACK: Duplicate tag entries in _info.json
        if category == "lora_triggers":
            info_path = os.path.join(target_dir, "_info.json")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f: data = json.load(f)
                old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
                target_key, target_val = None, None
                for k, v in data.items():
                    if (isinstance(v, dict) and v.get("name") == old_raw) or k == old_raw:
                        target_key, target_val = k, v
                        break
                if target_key:
                    # THE DUPLICATION FIX: Use Python's json module to clone the entry and assign a unique tag index
                    new_key = f"tag_{len([k for k in data.keys() if k.startswith('tag_')]) + 1:02d}"
                    new_val = json.loads(json.dumps(target_val)) if isinstance(target_val, dict) else target_val
                    if isinstance(new_val, dict): new_val["name"] = new_raw
                    data[new_key] = new_val
                    with open(info_path, "w", encoding="utf-8") as f: json.dump(data, f, indent=4)
                    return web.json_response({"success": True})

        return web.json_response({"error": "File not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/duplicate/{category}", duplicate_file)

async def rename_prompt_book(request):
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name: return web.Response(status=400)

        target_dir = CATEGORIES.get("derpPromptBook")
        if not target_dir: return web.Response(status=500)

        old_json = resolve_case_insensitive_path(target_dir, f"{old_name}.json")
        new_json = resolve_case_insensitive_path(target_dir, f"{new_name}.json", create_parent=True)
        if os.path.exists(old_json): os.rename(old_json, new_json)

        old_clean = old_name.replace(".json", "").strip()
        new_clean = new_name.replace(".json", "").strip()

        old_img = resolve_case_insensitive_dir(target_dir, f"{old_clean}_IMG")
        new_img = resolve_case_insensitive_path(target_dir, f"{new_clean}_IMG", create_parent=True)
        if os.path.exists(old_img): os.rename(old_img, new_img)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/rename_prompt_book", rename_prompt_book)

# ==========================================
# 2. GENERIC ASSET HUB (IMAGES)
# ==========================================

async def upload_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        reader = await request.multipart()
        book_name = "Untitled"
        file_data = None
        async for field in reader:
            if field.name == 'bookName':
                book_name = (await field.read(decode=True)).decode("utf-8").replace(".json", "").strip()
            elif field.name == 'image':
                # THE ASYNC STREAM FIX: Multipart payload must be read into memory before the iterator advances
                file_data = await field.read()
        if file_data:
            # Ensure the directory name is consistent with the cleaned book name
            img_dir = resolve_case_insensitive_dir(target_dir, f"{book_name}_IMG")
            os.makedirs(img_dir, exist_ok=True)
            filename = f"asset_{uuid.uuid4().hex[:8]}.png"
            file_path = os.path.join(img_dir, filename)
            with open(file_path, "wb") as f:
                f.write(file_data)
            return web.json_response({"success": True, "filename": filename})
        return web.json_response({"error": "No image provided"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
safe_post("/xcp/upload_asset/{category}", upload_asset)

async def get_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir: return web.Response(status=400)
    try:
        file_name = request.query.get("name")
        book_name = request.query.get("bookName")
        if not file_name: return web.Response(status=400)

        # THE ASSET RESOLUTION FIX: Sanitize book names and handle extension-less file lookups
        if book_name:
            book_name_clean = book_name.replace(".json", "").strip()
            primary_dir = resolve_case_insensitive_dir(target_dir, f"{book_name_clean}_IMG")
            primary_path = resolve_case_insensitive_path(primary_dir, file_name)
            if os.path.exists(primary_path): return web.FileResponse(primary_path)

        # THE SEARCH FIX: Deep-scan all asset subfolders for the file if the primary path fails (handles renamed books)
        if os.path.exists(target_dir):
            for item in os.listdir(target_dir):
                if item.lower().endswith("_img"):
                    potential_path = resolve_case_insensitive_path(os.path.join(target_dir, item), file_name)
                    if os.path.exists(potential_path): return web.FileResponse(potential_path)

        return web.Response(status=404)
    except Exception as e:
        return web.Response(status=500)
safe_get("/xcp/get_asset/{category}", get_asset)

async def delete_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        file_name, book_name = body.get("name"), body.get("bookName")
        if not file_name or not book_name: return web.json_response({"error": "Missing params"}, status=400)
        img_dir = resolve_case_insensitive_dir(target_dir, f"{book_name}_IMG")
        img_path = resolve_case_insensitive_path(img_dir, file_name)
        if os.path.exists(img_path): os.remove(img_path)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/delete_asset/{category}", delete_asset)

# ==========================================
# 3. COMFYUI MODEL HUB
# ==========================================

async def get_loras(request):
    return await handle_get_loras(request)
safe_get("/xcp/get_loras", get_loras)

async def check_lora_files(request):
    return await handle_check_lora_files(request)
safe_post("/xcp/check_lora_files", check_lora_files)

async def get_lora_preview(request):
    return await handle_get_lora_preview(request)
safe_get("/xcp/get_lora_preview", get_lora_preview)

async def get_lora_triggers(request):
    return await handle_get_lora_triggers(request)
safe_get("/xcp/get_lora_triggers", get_lora_triggers)

async def get_lora_info(request):
    return await handle_get_lora_info(request)
safe_get("/xcp/get_lora_info", get_lora_info)

async def open_folder(request):
    return await handle_open_folder(request)
safe_get("/xcp/open_folder", open_folder)

async def save_lora_rating(request):
    return await handle_save_lora_rating(request)
safe_post("/xcp/save_lora_rating", save_lora_rating)

async def save_lora_notes(request):
    return await handle_save_lora_notes(request)
safe_post("/xcp/save_lora_notes", save_lora_notes)

async def rename_lora_bundle(request):
    return await handle_rename_lora_bundle(request)
safe_post("/xcp/rename_lora_bundle", rename_lora_bundle)

async def delete_lora_preview(request):
    return await handle_delete_lora_preview(request)
safe_post("/xcp/delete_lora_preview", delete_lora_preview)

async def list_derpLoraStack(request):
    return await handle_list_derpLoraStack(request)
safe_get("/xcp/list/derpLoraStack", list_derpLoraStack)

async def save_derpLoraStack(request):
    return await handle_save_derpLoraStack(request)
safe_post("/xcp/save/derpLoraStack", save_derpLoraStack)

async def load_derpLoraStack(request):
    return await handle_load_derpLoraStack(request)
safe_get("/xcp/load/derpLoraStack", load_derpLoraStack)

async def load_settings_redirect(request):
    name = request.query.get("name")
    if name == "derpLoraStack":
        return await handle_load_derpLoraStack(request)

    # Generic fallback logic for settings
    target_dir = CATEGORIES.get("settings")
    try:
        if not name: return web.json_response({"error": "No name provided"}, status=400)
        if not name.endswith(".json"): name += ".json"
        target_path = resolve_case_insensitive_path(target_dir, name)
        if not os.path.exists(target_path): return web.json_response({"error": "File not found"}, status=404)
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response({"data": data})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
safe_get("/xcp/load/settings", load_settings_redirect)

async def upload_lora_preview(request):
    return await handle_upload_lora_preview(request)
safe_post("/xcp/upload_lora_preview", upload_lora_preview)

async def manage_lora_tag(request):
    return await handle_manage_lora_tag(request)
safe_post("/xcp/manage_lora_tag", manage_lora_tag)

async def import_lora_tags(request):
    return await handle_import_lora_tags(request)
safe_post("/xcp/import_lora_tags", import_lora_tags)

async def list_lora_images(request):
    return await handle_list_lora_images(request)
safe_get("/xcp/list_lora_images", list_lora_images)

async def get_lora_image(request):
    return await handle_get_lora_image(request)
safe_get("/xcp/get_lora_image", get_lora_image)

async def set_lora_cover(request):
    return await handle_set_lora_cover(request)
safe_post("/xcp/set_lora_cover", set_lora_cover)

async def delete_lora_image(request):
    return await handle_delete_lora_image(request)
safe_post("/xcp/delete_lora_image", delete_lora_image)

async def import_lora_tags(request):
    return await handle_import_lora_tags(request)

safe_post("/xcp/import_lora_tags", import_lora_tags)
async def manage_lora_tag(request):
    return await handle_manage_lora_tag(request)

safe_post("/xcp/manage_lora_tag", manage_lora_tag)
