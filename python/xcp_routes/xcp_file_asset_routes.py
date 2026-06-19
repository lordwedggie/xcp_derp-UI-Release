"""
Derp's sticker drawer.
This file babysits prompt-book images and makes sure the shiny bits go in the right folder.
Tiny art goblin energy, fully intentional.
"""

import os
import uuid
from urllib.parse import parse_qs, urlparse

from aiohttp import web

from .xcp_file_categories import get_category_dir
from .xcp_file_common import get_companion_image_dir, resolve_case_insensitive_path


def _normalize_asset_name(raw_name):
    if not raw_name:
        return ""
    value = str(raw_name).strip()
    if value.startswith("/xcp/get_asset/"):
        parsed = urlparse(value)
        value = parse_qs(parsed.query).get("name", [""])[0]
    return os.path.basename(value.replace("\\", "/"))


def _is_path_inside(parent, child):
    try:
        return os.path.commonpath([os.path.abspath(parent), os.path.abspath(child)]) == os.path.abspath(parent)
    except ValueError:
        return False


async def upload_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir:
        return web.json_response({"error": "Invalid category"}, status=400)
    try:
        reader = await request.multipart()
        book_name = "Untitled"
        file_data = None
        async for field in reader:
            if field.name == "bookName":
                book_name = (await field.read(decode=True)).decode("utf-8").replace(".json", "").strip()
            elif field.name == "image":
                file_data = await field.read()
        if file_data:
            img_dir = get_companion_image_dir(target_dir, book_name)
            os.makedirs(img_dir, exist_ok=True)
            filename = f"asset_{uuid.uuid4().hex[:8]}.png"
            file_path = os.path.join(img_dir, filename)
            with open(file_path, "wb") as f:
                f.write(file_data)
            return web.json_response({"success": True, "filename": filename})
        return web.json_response({"error": "No image provided"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def get_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir:
        return web.Response(status=400)
    try:
        file_name = request.query.get("name")
        book_name = request.query.get("bookName")
        if not file_name:
            return web.Response(status=400)
        if book_name:
            book_name_clean = book_name.replace(".json", "").strip()
            primary_dir = get_companion_image_dir(target_dir, book_name_clean)
            primary_path = resolve_case_insensitive_path(primary_dir, file_name)
            if os.path.exists(primary_path):
                return web.FileResponse(primary_path)
        if os.path.exists(target_dir):
            for item in os.listdir(target_dir):
                if item.lower().endswith("_img"):
                    potential_path = resolve_case_insensitive_path(os.path.join(target_dir, item), file_name)
                    if os.path.exists(potential_path):
                        return web.FileResponse(potential_path)
        return web.Response(status=404)
    except Exception:
        return web.Response(status=500)


async def delete_asset(request):
    category = request.match_info.get("category")
    target_dir = get_category_dir(category)
    if not target_dir:
        return web.json_response({"error": "Invalid category"}, status=400)
    try:
        body = await request.json()
        file_name, book_name = body.get("name"), body.get("bookName")
        if not file_name or not book_name:
            return web.json_response({"error": "Missing params"}, status=400)
        file_name = _normalize_asset_name(file_name)
        if not file_name:
            return web.json_response({"error": "Missing params"}, status=400)
        img_dir = get_companion_image_dir(target_dir, book_name)
        img_path = resolve_case_insensitive_path(img_dir, file_name)
        if img_dir and _is_path_inside(img_dir, img_path) and os.path.exists(img_path):
            os.remove(img_path)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


def register_routes(safe_get, safe_post):
    safe_post("/xcp/upload_asset/{category}", upload_asset)
    safe_get("/xcp/get_asset/{category}", get_asset)
    safe_post("/xcp/delete_asset/{category}", delete_asset)
