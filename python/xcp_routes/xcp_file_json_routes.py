"""
Derp's generic paperwork office.
Listing, loading, saving, renaming, duplicating, deleting: all the glamorous desk goblin work.
If it's JSON-ish and bossy, it probably walks through here.
"""

import json
import os
import re
from urllib.parse import parse_qs, urlparse

import folder_paths
from aiohttp import web

from .xcp_file_categories import (
    get_category_file_extension,
    get_category_search_dirs,
    get_listable_file_extensions,
    resolve_category_context,
    should_preserve_listed_extension,
)
from .xcp_file_common import (
    attach_fallback_header,
    delete_lora_trigger_sidecar_entry,
    duplicate_companion_image_dir,
    duplicate_lora_trigger_sidecar_entry,
    get_companion_image_dir,
    remove_companion_image_dir,
    rename_companion_image_dir,
    rename_lora_trigger_sidecar_entry,
    resolve_case_insensitive_path,
)


PROMPT_BOOK_IMAGE_RE = re.compile(r"\[\[IMG:([\s\S]*?)\]\]\n?")


def normalize_prompt_book_image_name(raw_name):
    if not raw_name:
        return ""
    value = str(raw_name).strip()
    if not value or value.startswith("data:") or value.startswith("http"):
        return ""
    if value.startswith("/xcp/get_asset/derpPromptBook"):
        parsed = urlparse(value)
        value = parse_qs(parsed.query).get("name", [""])[0]
    return os.path.basename(value.replace("\\", "/"))


def clean_missing_prompt_book_images(data, target_dir, raw_book_name):
    if not isinstance(data, list):
        return data, False, 0

    img_dir = get_companion_image_dir(target_dir, raw_book_name)
    changed = False
    removed_count = 0

    def replace_marker(match):
        nonlocal changed, removed_count
        marker_value = match.group(1)
        image_name = normalize_prompt_book_image_name(marker_value)
        if not image_name:
            return match.group(0)
        image_path = resolve_case_insensitive_path(img_dir, image_name)
        if image_path and os.path.exists(image_path):
            return match.group(0)
        changed = True
        removed_count += 1
        return ""

    for page in data:
        if not isinstance(page, dict):
            continue
        content = page.get("content")
        if not isinstance(content, str) or "[[IMG:" not in content:
            continue
        cleaned_content = PROMPT_BOOK_IMAGE_RE.sub(replace_marker, content)
        if cleaned_content != content:
            page["content"] = cleaned_content
            image_names = []
            for marker in PROMPT_BOOK_IMAGE_RE.findall(cleaned_content):
                image_name = normalize_prompt_book_image_name(marker)
                if image_name:
                    image_names.append(image_name)
            page["images"] = image_names

    return data, changed, removed_count


def resolve_search_path(search_dirs, file_name):
    used_fallback = False
    target_path = None
    for index, search_dir in enumerate(search_dirs):
        candidate_path = resolve_case_insensitive_path(search_dir, file_name)
        if candidate_path and os.path.exists(candidate_path):
            target_path = candidate_path
            used_fallback = index > 0
            break
    if target_path is None and search_dirs:
        target_path = resolve_case_insensitive_path(search_dirs[0], file_name)
    return target_path, used_fallback


def resolve_category_file_path(category, target_dir, file_name):
    search_dirs = get_category_search_dirs(category)
    if search_dirs:
        return resolve_search_path(search_dirs, file_name)
    return resolve_case_insensitive_path(target_dir, file_name), False


async def list_files(request):
    category = request.match_info.get("category")
    spec, target_dir = resolve_category_context(category, request, create_dynamic_dir=True)
    if not target_dir:
        return web.json_response({"error": "Invalid category"}, status=400)
    try:
        if spec.get("model_category"):
            items = folder_paths.get_filename_list(spec["model_category"])
            return attach_fallback_header(web.json_response({"items": items}))

        items = []
        seen = set()
        search_roots = get_category_search_dirs(category, target_dir)
        for search_root in search_roots:
            if not search_root or not os.path.exists(search_root):
                continue
            for root, dirs, files in os.walk(search_root, followlinks=True):
                dirs[:] = [d for d in dirs if not d.endswith("_IMG")]

                if category == "output":
                    for d in dirs:
                        rel_dir = os.path.relpath(os.path.join(root, d), search_root).replace("\\", "/") + "/"
                        if rel_dir not in seen:
                            seen.add(rel_dir)
                            items.append(rel_dir)

                valid_exts = get_listable_file_extensions(category)
                for f in files:
                    if not f.lower().endswith(valid_exts):
                        continue
                    rel_path = os.path.relpath(os.path.join(root, f), search_root)
                    if should_preserve_listed_extension(category):
                        clean_item = rel_path.replace("\\", "/")
                    else:
                        clean_item = os.path.splitext(rel_path)[0].replace("\\", "/")
                    if clean_item not in seen:
                        seen.add(clean_item)
                        items.append(clean_item)
        return attach_fallback_header(web.json_response({"items": items}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"items": [], "error": str(e)}, status=500))


async def load_file(request):
    category = request.match_info.get("category")
    spec, target_dir = resolve_category_context(category, request)
    if not spec or not target_dir:
        return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
    try:
        file_name = request.query.get("name")
        if not file_name:
            return attach_fallback_header(web.json_response({"error": "No name provided"}, status=400))
        if not file_name.endswith(".json"):
            file_name += ".json"
        target_path, used_fallback = resolve_category_file_path(category, target_dir, file_name)
        if not target_path or not os.path.exists(target_path):
            return attach_fallback_header(web.json_response({"error": "File not found"}, status=404), used_fallback=used_fallback)
        with open(target_path, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
        if category == "derpPromptBook":
            raw_book_name = os.path.splitext(os.path.basename(file_name))[0]
            data, cleaned, removed_count = clean_missing_prompt_book_images(data, os.path.dirname(target_path), raw_book_name)
            if cleaned:
                with open(target_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=4)
            return attach_fallback_header(web.json_response({"data": data, "cleaned": cleaned, "removedImageLinks": removed_count}), used_fallback=used_fallback)
        return attach_fallback_header(web.json_response({"data": data}), used_fallback=used_fallback)
    except Exception as e:
        return attach_fallback_header(web.json_response({"error": str(e)}, status=500))


async def save_file(request):
    category = request.match_info.get("category")
    try:
        body = await request.json()
        file_name = body.get("name")
        data = body.get("data")
        spec, target_dir = resolve_category_context(category, request, create_dynamic_dir=True, fallback_name=file_name)
        if not spec or not target_dir:
            return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
        if not file_name or data is None:
            return attach_fallback_header(web.json_response({"error": "Missing name or data"}, status=400))

        ext = get_category_file_extension(category)
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


async def delete_file(request):
    category = request.match_info.get("category")
    spec, target_dir = resolve_category_context(category, request)
    if not spec or not target_dir:
        return attach_fallback_header(web.json_response({"error": "Invalid category"}, status=400))
    try:
        body = await request.json()
        file_name = body.get("name")
        if not file_name:
            return attach_fallback_header(web.json_response({"error": "No name provided"}, status=400))
        ext = get_category_file_extension(category)
        raw_name = file_name.replace(ext, "")
        if not file_name.endswith(ext):
            file_name += ext
        target_path = resolve_case_insensitive_path(target_dir, file_name)
        if os.path.exists(target_path):
            os.remove(target_path)
        if category == "lora_triggers":
            delete_lora_trigger_sidecar_entry(target_dir, raw_name)
        remove_companion_image_dir(target_dir, raw_name)
        return attach_fallback_header(web.json_response({"success": True}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"success": False, "error": str(e)}, status=500))


async def rename_file(request):
    category = request.match_info.get("category")
    spec, target_dir = resolve_category_context(category, request)
    if not spec or not target_dir:
        return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name:
            return web.json_response({"error": "Missing names"}, status=400)

        ext = get_category_file_extension(category)
        if not old_name.endswith(ext):
            old_name += ext
        if not new_name.endswith(ext):
            new_name += ext

        old_path = resolve_case_insensitive_path(target_dir, old_name)
        new_path = resolve_case_insensitive_path(target_dir, new_name, create_parent=True)
        if os.path.exists(old_path):
            os.replace(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            rename_companion_image_dir(target_dir, old_raw, new_raw)
            return web.json_response({"success": True})

        if category == "lora_triggers":
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            if rename_lora_trigger_sidecar_entry(target_dir, old_raw, new_raw):
                return web.json_response({"success": True})

        return web.json_response({"error": "File not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


async def duplicate_file(request):
    category = request.match_info.get("category")
    spec, target_dir = resolve_category_context(category, request)
    if not spec or not target_dir:
        return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name:
            return web.json_response({"error": "Missing names"}, status=400)
        ext = get_category_file_extension(category)
        if not old_name.endswith(ext):
            old_name += ext
        if not new_name.endswith(ext):
            new_name += ext
        old_path = resolve_case_insensitive_path(target_dir, old_name)
        new_path = resolve_case_insensitive_path(target_dir, new_name, create_parent=True)
        if os.path.exists(old_path):
            import shutil
            shutil.copy2(old_path, new_path)
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            duplicate_companion_image_dir(target_dir, old_raw, new_raw)
            return web.json_response({"success": True})

        if category == "lora_triggers":
            old_raw, new_raw = old_name.replace(ext, ""), new_name.replace(ext, "")
            if duplicate_lora_trigger_sidecar_entry(target_dir, old_raw, new_raw):
                return web.json_response({"success": True})

        return web.json_response({"error": "File not found"}, status=404)
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


def register_routes(safe_get, safe_post):
    safe_get("/xcp/list/{category}", list_files)
    safe_get("/xcp/load/{category}", load_file)
    safe_post("/xcp/save/{category}", save_file)
    safe_post("/xcp/delete/{category}", delete_file)
    safe_post("/xcp/rename/{category}", rename_file)
    safe_post("/xcp/duplicate/{category}", duplicate_file)
