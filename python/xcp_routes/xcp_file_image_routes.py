"""
Derp's image kitchen.
It serves backgrounds, reheats saved images, and occasionally changes the file format seasoning.
Messy apron, useful results.
"""

import os
import json
import re
import shutil

import folder_paths
from aiohttp import web
from PIL import Image
from PIL.PngImagePlugin import PngInfo

from .xcp_file_categories import get_background_search_dirs
from .xcp_file_common import attach_fallback_header, resolve_case_insensitive_path


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


def _resolve_search_path(search_dirs, file_name):
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


def _build_png_metadata(img, body):
    metadata = PngInfo()
    for key, value in (img.info or {}).items():
        if isinstance(key, str) and isinstance(value, str):
            metadata.add_text(key, value)

    prompt = body.get("prompt")
    if prompt is not None:
        metadata.add_text("prompt", json.dumps(prompt))

    extra_pnginfo = body.get("extra_pnginfo") or {}
    if isinstance(extra_pnginfo, dict):
        for key, value in extra_pnginfo.items():
            if isinstance(key, str):
                metadata.add_text(key, json.dumps(value))

    return metadata


async def get_background_file(request):
    file_name = request.query.get("name")
    if not file_name:
        return attach_fallback_header(web.Response(status=400))
    try:
        target_path, used_fallback = _resolve_search_path(get_background_search_dirs(), file_name)
        if not target_path or not os.path.exists(target_path):
            return attach_fallback_header(web.Response(status=404), used_fallback=used_fallback)
        return attach_fallback_header(web.FileResponse(target_path), used_fallback=used_fallback)
    except Exception:
        return attach_fallback_header(web.Response(status=500))


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

        if save_format == "PNG" and not (body.get("prompt") or body.get("extra_pnginfo")):
            shutil.copy2(src_path, target_path)
        else:
            with Image.open(src_path) as img:
                if save_format == "PNG":
                    metadata = _build_png_metadata(img, body)
                    img.save(target_path, "PNG", pnginfo=metadata, compress_level=4)
                elif save_format == "JPEG":
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


def register_routes(safe_get, safe_post):
    safe_get("/xcp/get_background", get_background_file)
    safe_post("/xcp/derp_image_deck/save_current_image", save_current_image_from_deck)
