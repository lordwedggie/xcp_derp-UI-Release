import server
from aiohttp import web
import json
import folder_paths
import os
import uuid
import shutil
from .xcp_tagHandling import handle_import_lora_tags, handle_manage_lora_tag
from .xcp_loraStack import (handle_save_lora_rating, handle_save_lora_notes, handle_get_loras, handle_get_lora_preview,
                            handle_get_lora_triggers, handle_get_lora_info, handle_open_folder, handle_delete_lora_preview, handle_upload_lora_preview, get_lora_stack_profiles_dir,
                            handle_list_derpLoraStack, handle_save_derpLoraStack, handle_load_derpLoraStack, handle_list_lora_images, handle_get_lora_image, handle_set_lora_cover, handle_delete_lora_image)

# --- PATH SETUP ---
PRIMARY_ROOT = os.path.join(folder_paths.get_user_directory(), "derpNodes")

try:
    if not os.path.exists(PRIMARY_ROOT):
        os.makedirs(PRIMARY_ROOT, exist_ok=True)
    DERP_ROOT = PRIMARY_ROOT
except Exception:
    DERP_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user", "derpNodes")
    print(f"⚠️ [xcpDerp] Falling back to internal extension storage: '{DERP_ROOT}'")

THEME_DIR = os.path.join(DERP_ROOT, "themes")
os.makedirs(THEME_DIR, exist_ok=True)

PALETTE_DIR = os.path.join(DERP_ROOT, "palettes")
os.makedirs(PALETTE_DIR, exist_ok=True)

SETTINGS_DIR = os.path.join(DERP_ROOT, "nodeSettings")
os.makedirs(SETTINGS_DIR, exist_ok=True)

PROMPT_BOOK_DIR = os.path.join(DERP_ROOT, "derpPromptBook")
os.makedirs(PROMPT_BOOK_DIR, exist_ok=True)

TRIGGER_WALL_DIR = os.path.join(DERP_ROOT, "derpTriggerWall")
os.makedirs(TRIGGER_WALL_DIR, exist_ok=True)

EXT_ROOT = os.path.dirname(os.path.abspath(__file__))
LOCALE_DIR = os.path.join(EXT_ROOT, "locales")
os.makedirs(LOCALE_DIR, exist_ok=True)

LORA_STACKS_DIR = get_lora_stack_profiles_dir(DERP_ROOT)

CATEGORIES = {
    "themes": THEME_DIR,
    "settings": SETTINGS_DIR,
    "derpSlider": SETTINGS_DIR,
    "derpLatent": SETTINGS_DIR,
    "derpLoraStack": LORA_STACKS_DIR,
    "palettes": PALETTE_DIR,
    "derpPromptBook": PROMPT_BOOK_DIR,
    "books": PROMPT_BOOK_DIR, # THE COMPATIBILITY FIX: Add 'books' alias for legacy URL requests
    "locales": LOCALE_DIR,
    "models": folder_paths.get_folder_paths("checkpoints")[0],
    "vaes": folder_paths.get_folder_paths("vae")[0],
    "triggerWall": TRIGGER_WALL_DIR
}

def get_category_dir(category):
    return CATEGORIES.get(category)

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
        items = []
        # THE SYMLINK FIX: followlinks=True ensures symlinked folders (common in ComfyUI) are traversed
        for root, dirs, files in os.walk(target_dir, followlinks=True):
            # Ignore internal image preview folders
            dirs[:] = [d for d in dirs if not d.endswith("_IMG")]

            for f in files:
                # THE EXTENSION FILTER FIX: Allow model files (.safetensors, .ckpt, .pt) for the 'models' and 'vaes' categories
                valid_exts = (".safetensors", ".ckpt", ".pt") if category in ["models", "vaes"] else (".txt" if category == "lora_triggers" else ".json")
                if f.lower().endswith(valid_exts):
                    rel_path = os.path.relpath(os.path.join(root, f), target_dir)

                    if category in ["models", "vaes"]:
                        items.append(rel_path.replace("\\", "/"))
                    else:
                        clean_path = os.path.splitext(rel_path)[0].replace("\\", "/")
                        items.append(clean_path)
        return web.json_response({"items": items})
    except Exception as e:
        return web.json_response({"items": [], "error": str(e)}, status=500)
safe_get("/xcp/list/{category}", list_files)

async def load_file(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
    try:
        file_name = request.query.get("name")
        if not file_name: return web.json_response({"error": "No name provided"}, status=400)
        if not file_name.endswith(".json"): file_name += ".json"
        target_path = os.path.join(target_dir, file_name)
        if not os.path.exists(target_path): return web.json_response({"error": "File not found"}, status=404)
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response({"data": data})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
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

        if not target_dir: return web.json_response({"error": "Invalid category"}, status=400)
        if not file_name or data is None: return web.json_response({"error": "Missing name or data"}, status=400)

        ext = ".txt" if category == "lora_triggers" else ".json"
        clean_name = file_name.replace(ext, "").strip() + ext
        target_path = os.path.normpath(os.path.join(target_dir, clean_name))

        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            if target_path.endswith(".txt"):
                f.write(str(data))
            else:
                json.dump(data, f, indent=4)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/save/{category}", save_file)

async def delete_file(request):
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
        file_name = body.get("name")
        if not file_name: return web.json_response({"error": "No name provided"}, status=400)
        ext = ".txt" if category == "lora_triggers" else ".json"
        raw_name = file_name.replace(ext, "")
        if not file_name.endswith(ext): file_name += ext
        target_path = os.path.join(target_dir, file_name)
        if os.path.exists(target_path): os.remove(target_path)

        # THE SIDECAR JSON FALLBACK: Remove tag entries from _info.json
        if category == "lora_triggers":
            info_path = os.path.join(target_dir, "_info.json")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f: data = json.load(f)
                keys_to_del = [k for k, v in data.items() if (isinstance(v, dict) and v.get("name") == raw_name) or k == raw_name]
                for k in keys_to_del: data.pop(k, None)
                with open(info_path, "w", encoding="utf-8") as f: json.dump(data, f, indent=4)

        img_folder = os.path.join(target_dir, f"{raw_name}_IMG")
        if os.path.exists(img_folder): shutil.rmtree(img_folder)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)
safe_post("/xcp/delete/{category}", delete_file)

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

        old_path = os.path.join(target_dir, old_name)
        new_path = os.path.join(target_dir, new_name)

        if os.path.exists(old_path):
            # THE RENAME FIX: Use move to rename the physical file and cleanup the old one
            shutil.move(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            old_img, new_img = os.path.join(target_dir, f"{old_raw}_IMG"), os.path.join(target_dir, f"{new_raw}_IMG")
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
        old_path = os.path.join(target_dir, old_name)
        new_path = os.path.join(target_dir, new_name)
        if os.path.exists(old_path):
            shutil.copy2(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            old_img, new_img = os.path.join(target_dir, f"{old_raw}_IMG"), os.path.join(target_dir, f"{new_raw}_IMG")
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

        old_json = os.path.join(target_dir, f"{old_name}.json")
        new_json = os.path.join(target_dir, f"{new_name}.json")
        if os.path.exists(old_json): os.rename(old_json, new_json)

        old_clean = old_name.replace(".json", "").strip()
        new_clean = new_name.replace(".json", "").strip()

        old_img = os.path.join(target_dir, f"{old_clean}_IMG")
        new_img = os.path.join(target_dir, f"{new_clean}_IMG")
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
            img_dir = os.path.join(target_dir, f"{book_name}_IMG")
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
            primary_path = os.path.join(target_dir, f"{book_name_clean}_IMG", file_name)
            if os.path.exists(primary_path): return web.FileResponse(primary_path)

        # THE SEARCH FIX: Deep-scan all asset subfolders for the file if the primary path fails (handles renamed books)
        if os.path.exists(target_dir):
            for item in os.listdir(target_dir):
                if item.endswith("_IMG"):
                    potential_path = os.path.join(target_dir, item, file_name)
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
        img_path = os.path.join(target_dir, f"{book_name}_IMG", file_name)
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
        target_path = os.path.join(target_dir, name)
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