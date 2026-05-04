"""
Path: ./xcp_loraStack.py
"""
import os
import sys
import json
import subprocess
import base64
from io import BytesIO
from aiohttp import web
from PIL import Image, ImageOps
from PIL.PngImagePlugin import PngInfo
import folder_paths
import shutil

async def handle_list_lora_images(request):
    try:
        lora_name = request.query.get("name")
        if not lora_name: return web.json_response({"error": "Missing name"}, status=400)

        full_path = folder_paths.get_full_path("loras", lora_name.replace("\\", "/"))
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        base_path_no_ext = os.path.splitext(full_path)[0]
        target_dir = base_path_no_ext
        images = []

        # THE PREVIEW DISCOVERY: Check for the primary preview image (e.g. lora.png)
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            if os.path.exists(base_path_no_ext + ext):
                # Use a reserved keyword to tell the server to fetch the main preview
                images.append("__PRIMARY_PREVIEW__" + ext)
                break

        # THE SCAN FIX: Live directory scan of the sidecar folder
        if os.path.exists(target_dir) and os.path.isdir(target_dir):
            sub_images = []
            for f in os.listdir(target_dir):
                if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")) and not f.startswith("_"):
                    sub_images.append(f)
            images.extend(sorted(sub_images))

        return web.json_response({"images": images})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_get_lora_image(request):
    try:
        lora_name = request.query.get("name")
        file_name = request.query.get("file")
        if not lora_name or not file_name: return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = folder_paths.get_full_path("loras", lora_name.replace("\\", "/"))
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        base_path_no_ext = os.path.splitext(full_path)[0]

        # THE PRIMARY FETCH FIX: Handle the reserved keyword for the main preview image
        if file_name.startswith("__PRIMARY_PREVIEW__"):
            ext = os.path.splitext(file_name)[1]
            img_path = base_path_no_ext + ext
        else:
            img_path = os.path.join(base_path_no_ext, file_name)

        if not os.path.exists(img_path): return web.json_response({"error": "Image not found"}, status=404)

        return web.FileResponse(img_path)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

def get_lora_stack_profiles_dir(derp_root):
    path = os.path.join(derp_root, "derpLoraStack")
    os.makedirs(path, exist_ok=True)
    return path
# INSERT ABOVE
async def handle_list_derpLoraStack(request):
    derp_root = os.path.join(folder_paths.get_user_directory(), "derpNodes")
    path = get_lora_stack_profiles_dir(derp_root)
    # THE RECURSIVE LIST FIX: Walk the directory to find all profiles and subfolders so the JS browser can build entries.
    items = []
    for root, dirs, files in os.walk(path):
        # THE FOLDER NAVIGATION FIX: Include directory markers so the JS browser can detect even empty subfolders.
        if root != path:
            rel_dir = os.path.relpath(root, path).replace("\\", "/")
            items.append(rel_dir + "/")

        for f in files:
            if f.endswith(".json"):
                rel_path = os.path.relpath(os.path.join(root, f), path).replace("\\", "/")
                items.append(os.path.splitext(rel_path)[0])
    return web.json_response({"items": items})

async def handle_save_derpLoraStack(request):
    try:
        body = await request.json()
        filename, data = body.get("filename"), body.get("data")
        if not filename: return web.Response(status=400)
        if not filename.endswith(".json"): filename += ".json"
        derp_root = os.path.join(folder_paths.get_user_directory(), "derpNodes")
        path = os.path.join(get_lora_stack_profiles_dir(derp_root), filename)
        # THE DIRECTORY FIX: Automatically create subfolders if they don't exist during save.
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return web.Response(status=200)
    except Exception as e:
        return web.Response(status=500, text=str(e))

async def handle_load_derpLoraStack(request):
    name = request.query.get("name")
    if not name: return web.Response(status=400)
    if not name.endswith(".json"): name += ".json"
    derp_root = os.path.join(folder_paths.get_user_directory(), "derpNodes")
    path = os.path.join(get_lora_stack_profiles_dir(derp_root), name)
    if not os.path.exists(path): return web.json_response({"data": {}})
    with open(path, "r", encoding="utf-8") as f:
        return web.json_response({"data": json.load(f)})
async def handle_save_lora_rating(request):
    try:
        body = await request.json()
        name, rating = body.get("name"), body.get("rating")
        if not name: return web.Response(status=400)
        full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
        if full_path:
            trigger_dir = os.path.splitext(full_path)[0]
            os.makedirs(trigger_dir, exist_ok=True)
            info_path = os.path.join(trigger_dir, "_info.json")
            data = {}
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

            # THE POSITIONING FIX: Reconstruct the dict to ensure 'rating' is immediately below 'effects'
            # If 'effects' is missing, it will be added to the end of the file.
            new_data = {}
            data.pop("rating", None) # Remove existing entry to handle re-insertion
            inserted = False
            for k, v in data.items():
                new_data[k] = v
                if k == "effects":
                    new_data["rating"] = rating
                    inserted = True

            if not inserted: new_data["rating"] = rating

            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(new_data, f, indent=4)
            return web.json_response({"success": True})
        return web.Response(status=404)
    except: return web.Response(status=500)

async def handle_save_lora_notes(request):
    try:
        body = await request.json()
        name, notes = body.get("name"), body.get("notes")
        if not name: return web.Response(status=400)
        full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
        if full_path:
            trigger_dir = os.path.splitext(full_path)[0]
            os.makedirs(trigger_dir, exist_ok=True)
            info_path = os.path.join(trigger_dir, "_info.json")
            data = {}
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

            data["notes"] = notes

            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            return web.json_response({"success": True})
        return web.Response(status=404)
    except: return web.Response(status=500)

async def handle_get_loras(request):
    try:
        # Uses ComfyUI's native folder_paths to find all valid lora files
        files = folder_paths.get_filename_list("loras")
        # THE PREVIEW SCAN: Identify which loras actually have companion images to prevent 404 console spam
        has_preview = []
        ratings = {}
        for f in files:
            full_path = folder_paths.get_full_path("loras", f)
            if full_path:
                base = os.path.splitext(full_path)[0]
                if any(os.path.exists(base + ext) for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                    has_preview.append(f)

                # THE RATING SCAN: Fetch rating from the _info.json sidecar
                info_path = os.path.join(base, "_info.json")
                if os.path.exists(info_path):
                    try:
                        with open(info_path, "r", encoding="utf-8") as info_f:
                            ratings[f] = json.load(info_f).get("rating", 0)
                    except:
                        ratings[f] = 0
                else:
                    ratings[f] = 0
        return web.json_response({"items": files, "has_preview": has_preview, "ratings": ratings})
    except Exception as e:
        return web.json_response({"items": [], "has_preview": [], "ratings": {}, "error": str(e)}, status=500)

async def handle_get_lora_preview(request):
    try:
        name = request.query.get("name")
        is_thumb = request.query.get("thumbnail") == "true"
        if not name: return web.Response(status=400)

        full_path = folder_paths.get_full_path("loras", name)
        if not full_path: return web.Response(status=404)

        base_path = os.path.splitext(full_path)[0]
        trigger_dir = base_path
        thumb_path = os.path.join(trigger_dir, "_thumbnail.jpg")

        # 2. Locate source preview image
        src_image = None
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            if os.path.exists(base_path + ext):
                src_image = base_path + ext
                break

        if not src_image: return web.Response(status=404)

        # 1. Validation Logic (MTime Check)
        if is_thumb and os.path.exists(thumb_path):
            # If the source image is newer than the thumbnail, we must regenerate
            if os.path.getmtime(src_image) <= os.path.getmtime(thumb_path):
                return web.FileResponse(thumb_path)

        # 3. Handle Thumbnail Generation (Rule 1 & 2)
        if is_thumb:
            try:
                os.makedirs(trigger_dir, exist_ok=True)
                with Image.open(src_image) as img:
                    # Use ImageOps.fit to perform a center-crop (faster for canvas drawing)
                    # and ensure the long side (and short side) is exactly 128px for 1:1 render.
                    thumb = ImageOps.fit(img, (128, 128), Image.Resampling.LANCZOS)
                    if thumb.mode in ("RGBA", "P"):
                        thumb = thumb.convert("RGB")
                    thumb.save(thumb_path, "JPEG", quality=85)

                # OPTIONAL: You can initialize your info .json here if it doesn't exist
                info_json = os.path.join(trigger_dir, "_info.json")
                if not os.path.exists(info_json):
                    with open(info_json, "w", encoding="utf-8") as f:
                        json.dump({"name": name, "setup": {}}, f, indent=4)

                return web.FileResponse(thumb_path)
            except Exception as e:
                print(f"❌ [xcpDerp] Thumbnail generation failed: {e}")
                return web.FileResponse(src_image) # Fallback to full image

        # 4. Standard Full-Res Request (Rule 3)
        return web.FileResponse(src_image, headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        })
    except:
        return web.Response(status=500)

async def handle_get_lora_triggers(request):
    try:
        name = request.query.get("name")
        if not name: return web.json_response({"triggers": {}})

        # THE NORMALIZATION FIX: Normalize slashes and handle extension-less lookups
        clean_name = name.replace("\\", "/")
        full_path = folder_paths.get_full_path("loras", clean_name)

        if not full_path:
            # Fallback: Try without the file extension
            name_no_ext = os.path.splitext(clean_name)[0]
            full_path = folder_paths.get_full_path("loras", name_no_ext)

        if not full_path: return web.json_response({"triggers": {}})

        # Folder matches lora filename (e.g., path/to/lora.safetensors -> path/to/lora/)
        trigger_dir = os.path.splitext(full_path)[0]
        triggers = {}

        if os.path.exists(trigger_dir) and os.path.isdir(trigger_dir):
            # 1. LOAD LEGACY .TXT TRIGGERS
            for f in os.listdir(trigger_dir):
                if f.endswith(".txt"):
                    with open(os.path.join(trigger_dir, f), "r", encoding="utf-8") as t:
                        triggers[f] = t.read().strip()

            # 2. LOAD SIDECAR _INFO.JSON TAGS
            info_path = os.path.join(trigger_dir, "_info.json")
            if os.path.exists(info_path):
                try:
                    with open(info_path, "r", encoding="utf-8") as f:
                        info_data = json.load(f)
                        for k, v in info_data.items():
                            # Include entries that are either tag_ objects or have a tag property
                            if k.startswith("tag_") or (isinstance(v, dict) and "tag" in v):
                                triggers[k] = v
                except: pass

        return web.json_response({"triggers": triggers})
    except Exception as e:
        return web.json_response({"triggers": {}, "error": str(e)}, status=500)

async def handle_get_lora_info(request):
    try:
        name = request.query.get("name")
        is_lite = request.query.get("lite") == "true"
        if not name: return web.Response(status=400)
        # THE NORMALIZATION FIX: Handle both slash types sent from the browser
        clean_name = name.replace("\\", "/")
        full_path = folder_paths.get_full_path("loras", clean_name)
        if not full_path: return web.Response(status=404)
        # THE FAST METADATA PATH: Prioritize reading _info.json before any heavy disk I/O
        rating = 0
        notes = ""
        setup = {}
        info_path = os.path.join(os.path.splitext(full_path)[0], "_info.json")
        if os.path.exists(info_path):
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    info_data = json.load(f)
                    rating = info_data.get("rating", 0)
                    notes = info_data.get("notes", "")
                    setup = info_data.get("setup", {})
            except: pass

        if is_lite:
            # THE MODEL NAME FIX: Ensure lite response also returns the clean model name without extension
            return web.json_response({ "name": os.path.splitext(os.path.basename(full_path))[0], "rating": rating, "setup": setup })
        metadata = {}
        base_model = "Unknown"

        # THE METADATA FIX: Fast-read the safetensors header directly in Python without loading the weights into VRAM
        if full_path.endswith(".safetensors"):
            try:
                import struct
                with open(full_path, "rb") as f:
                    header_size_bytes = f.read(8)
                    header_size = struct.unpack("<Q", header_size_bytes)[0]
                    # Safeguard against corrupted files (limit header reading to ~10MB)
                    if header_size < 10000000:
                        header_bytes = f.read(header_size)
                        header_json = json.loads(header_bytes.decode("utf-8"))
                        metadata = header_json.get("__metadata__", {})

                        # Prioritize CivitAI's modelspec format or fallback to standard Kohya tags
                        base_model = metadata.get("modelspec.architecture", metadata.get("ss_base_model_version", "Unknown"))
            except Exception as e:
                print(f"⚠️ [xcpDerp] Failed to read safetensors header for {clean_name}: {e}")

        # THE PYSSSSS REPLICATION: Search for CivitAI sidecar files (.civitai.info or .info) to find the direct link
        base_path = os.path.splitext(full_path)[0]
        for sidecar_ext in [".civitai.info", ".info"]:
            info_path = base_path + sidecar_ext
            if os.path.exists(info_path):
                try:
                    with open(info_path, "r", encoding="utf-8") as f:
                        sidecar_data = json.load(f)
                        if "modelId" in sidecar_data:
                            metadata["civitai_model_id"] = sidecar_data["modelId"]
                        if "id" in sidecar_data:
                            metadata["civitai_version_id"] = sidecar_data["id"]
                except: pass

        # THE HASH RESOLUTION: Calculate both Tensor-only (AutoV2) and Full File hashes.
        # CivitAI indexing varies; providing both maximize lookup success rates.
        tensor_hash = None
        full_hash = None
        if os.path.exists(full_path):
            try:
                import hashlib, struct

                # 1. Calculate Full File Hash
                sha_full = hashlib.sha256()
                with open(full_path, "rb") as f:
                    for chunk in iter(lambda: f.read(1048576), b""):
                        sha_full.update(chunk)
                full_hash = sha_full.hexdigest()

                # 2. Calculate Tensor-only Hash (AutoV2)
                sha_tensor = hashlib.sha256()
                with open(full_path, "rb") as f:
                    if full_path.lower().endswith(".safetensors"):
                        header_size_bytes = f.read(8)
                        if len(header_size_bytes) == 8:
                            header_size = struct.unpack("<Q", header_size_bytes)[0]
                            f.seek(8 + header_size)
                    for chunk in iter(lambda: f.read(1048576), b""):
                        sha_tensor.update(chunk)
                tensor_hash = sha_tensor.hexdigest()
            except Exception as e:
                print(f"⚠️ [xcpDerp] Hash calculation failed: {e}")

        # FRONTEND API HANDOFF: Provide a dictionary of hashes for the frontend to attempt lookups.
        return web.json_response({
            "baseModel": base_model,
            "name": os.path.splitext(os.path.basename(full_path))[0],
            "loraPath": name,
            "hash": tensor_hash,
            "full_hash": full_hash,
            "metadata": metadata,
            "rating": rating,
            "notes": notes,
            "setup": setup
        })
    except:
        return web.Response(status=500)

async def handle_open_folder(request):
    try:
        name = request.query.get("name")
        if not name: return web.Response(status=400)

        # THE SYSTEM CATEGORY FIX: Handle explicit directory names like "palettes" or "themes"
        if name in ["palettes", "themes"]:
            derp_root = os.path.join(folder_paths.get_user_directory(), "derpNodes")
            target_path = os.path.join(derp_root, name)
            if not os.path.exists(target_path): os.makedirs(target_path, exist_ok=True)

            if os.name == 'nt': os.startfile(target_path)
            elif sys.platform == 'darwin': subprocess.Popen(['open', target_path])
            else: subprocess.Popen(['xdg-open', target_path])
            return web.json_response({"success": True})

        # THE NORMALIZATION FIX: Handle both slash types and add extension-stripping fallback
        # to match get_lora_info logic and prevent 404s on explicit extensions.
        clean_name = name.replace("\\", "/")
        full_path = folder_paths.get_full_path("loras", clean_name)
        if not full_path:
            name_no_ext = os.path.splitext(clean_name)[0]
            full_path = folder_paths.get_full_path("loras", name_no_ext)

        if full_path and os.path.exists(full_path):
            # THE BEHAVIOR SWAP FIX: Normal click (subfolder=true) opens metadata dir. Shift click opens parent dir.
            if request.query.get("subfolder") == "true":
                target_dir = os.path.splitext(full_path)[0]
                # Ensure the metadata folder exists before attempting to open it
                if not os.path.exists(target_dir): os.makedirs(target_dir, exist_ok=True)
            else:
                target_dir = os.path.dirname(full_path)

            if os.name == 'nt': os.startfile(target_dir)
            elif sys.platform == 'darwin': subprocess.Popen(['open', target_dir])
            else: subprocess.Popen(['xdg-open', target_dir])
            return web.json_response({"success": True})
        return web.Response(status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_delete_lora_preview(request):
    try:
        body = await request.json()
        name = body.get("name")
        if not name: return web.json_response({"error": "Missing parameters"}, status=400)

        clean_name = name.replace("\\", "/")
        full_path = folder_paths.get_full_path("loras", clean_name)
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        base_name = os.path.splitext(full_path)[0]
        sidecar_dir = base_name
        os.makedirs(sidecar_dir, exist_ok=True)

        model_name_prefix = body.get("model_name_prefix")
        if model_name_prefix and model_name_prefix.lower().endswith(".safetensors"):
            orig_filename = model_name_prefix.replace("\\", "_").replace("/", "_")[:-12]
        else:
            orig_filename = name.replace("\\", "_").replace("/", "_")
            if orig_filename.lower().endswith(".safetensors"):
                orig_filename = orig_filename[:-12]

        moved_file = None
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            existing_path = base_name + ext
            if os.path.exists(existing_path):
                idx = 1
                while True:
                    archive_name = f"{orig_filename}_{idx:03d}{ext}"
                    archive_path = os.path.join(sidecar_dir, archive_name)
                    if not os.path.exists(archive_path):
                        shutil.move(existing_path, archive_path)
                        moved_file = archive_name
                        break
                    idx += 1

        # Remove the thumbnail so the UI clears immediately
        thumb_path = os.path.join(sidecar_dir, "_thumbnail.jpg")
        if os.path.exists(thumb_path): os.remove(thumb_path)

        return web.json_response({"success": True, "moved": moved_file})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_set_lora_cover(request):
    try:
        body = await request.json()
        name, file_name = body.get("name"), body.get("file")
        no_backup = body.get("no_backup", False) # THE NO-BACKUP FLAG FIX
        if not name or not file_name: return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        base_path_no_ext = os.path.splitext(full_path)[0]
        sidecar_dir = base_path_no_ext

        # 1. Find the current primary preview
        current_preview = None
        for ext in [".png", ".jpg", ".jpeg", ".webp"]:
            if os.path.exists(base_path_no_ext + ext):
                current_preview = base_path_no_ext + ext
                break

        # 2. Path to the new cover (the archived one being promoted)
        new_cover_path = os.path.join(sidecar_dir, file_name)
        if not os.path.exists(new_cover_path):
            return web.json_response({"error": "Target image not found"}, status=404)

        # 3. Perform the promotion (No-archive logic for existing cover)
        if current_preview:
            os.remove(current_preview)

        # THE COVER PROMOTION FIX: Copy the image so it remains in the subfolder while becoming the primary cover
        promoted_path = base_path_no_ext + ".png"
        shutil.copy(new_cover_path, promoted_path)

        # THE THUMBNAIL REGEN: Force regenerate thumbnail to match the new cover
        thumb_path = os.path.join(sidecar_dir, "_thumbnail.jpg")
        if os.path.exists(thumb_path): os.remove(thumb_path)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_delete_lora_image(request):
    try:
        body = await request.json()
        name = body.get("name")
        filename = body.get("filename")
        if not name or not filename: return web.json_response({"error": "Missing params"}, status=400)

        full_path = folder_paths.get_full_path("loras", name.replace("\\", "/"))
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        base_path = os.path.splitext(full_path)[0]
        # PRIMARY PREVIEW: Deletes the root image + sidecar thumbnail
        if filename.startswith("__PRIMARY_PREVIEW__"):
            ext = os.path.splitext(filename)[1]
            target = base_path + ext
            if os.path.exists(target): os.remove(target)
            thumb = os.path.join(base_path, "_thumbnail.jpg")
            if os.path.exists(thumb): os.remove(thumb)
        else:
            target = os.path.join(base_path, filename)
            if os.path.exists(target): os.remove(target)

        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_upload_lora_preview(request):
    try:
        body = await request.json()
        # THE RESOLUTION FIX: Prioritize loraPath for finding the file, fallback to name
        lora_id = body.get("loraPath") or body.get("name")
        image_b64 = body.get("image")
        is_cover = body.get("is_cover", False)

        if not lora_id or not image_b64:
            return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = folder_paths.get_full_path("loras", lora_id.replace("\\", "/"))
        if not full_path:
            return web.json_response({"error": "LoRA not found"}, status=404)

        # THE MODEL NAME FIX: Explicitly derive the clean model name (filename only) for image saving
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

        # THE CHECKPOINT MODEL NAME FIX: Restore the logic to name sidecar images using the checkpoint prefix
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

        metadata = PngInfo()
        if body.get("prompt"):
            metadata.add_text("prompt", json.dumps(body.get("prompt")))
        if body.get("extra_pnginfo"):
            for k, v in body.get("extra_pnginfo").items():
                metadata.add_text(k, json.dumps(v))

        img.save(target_path, "PNG", pnginfo=metadata)

        # THE DUAL-SAVE FIX: If setting as cover, also save a duplicate to the subfolder archive
        if is_cover:
            img.save(sub_path, "PNG", pnginfo=metadata)

        if is_cover:
            # THE THUMBNAIL UPLOAD FIX: Explicitly generate the thumbnail when saving a primary cover
            try:
                sidecar_dir = base_name
                os.makedirs(sidecar_dir, exist_ok=True)
                thumb_path = os.path.join(sidecar_dir, "_thumbnail.jpg")
                thumb = ImageOps.fit(img, (128, 128), Image.Resampling.LANCZOS)
                if thumb.mode in ("RGBA", "P"):
                    thumb = thumb.convert("RGB")
                thumb.save(thumb_path, "JPEG", quality=85)
            except Exception as e:
                print(f"⚠️ [xcpDerp] Cover thumbnail generation failed during upload: {e}")

        # THE UPLOAD FIX: Do not create sidecar thumbnails for archived images; these are reserved for the cover image
        return web.json_response({"success": True, "file": target_name})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)