"""
xcpDerp HQ switchboard.
This file mostly stands around looking important while wiring routes together.
If something needs a desk job instead of real labor, it probably lives here.
"""

import json
import os

import server
from aiohttp import web

from .xcp_file_asset_routes import register_routes as register_asset_routes
from .xcp_file_categories import get_category_dir
from .xcp_file_common import resolve_case_insensitive_path
from .xcp_file_image_routes import register_routes as register_image_routes
from .xcp_file_json_routes import register_routes as register_json_routes
from .xcp_file_prompt_book_routes import register_routes as register_prompt_book_routes
from .xcp_loraStack import (
    handle_check_lora_files,
    handle_delete_lora_image,
    handle_delete_lora_preview,
    handle_get_lora_image,
    handle_get_lora_info,
    handle_get_lora_preview,
    handle_get_lora_triggers,
    handle_get_loras,
    handle_list_derpLoraStack,
    handle_list_lora_images,
    handle_load_derpLoraStack,
    handle_open_folder,
    handle_rename_lora_bundle,
    handle_save_derpLoraStack,
    handle_save_lora_notes,
    handle_save_lora_rating,
    handle_set_lora_cover,
    handle_upload_lora_preview,
)
from .xcp_tagHandling import handle_import_lora_tags, handle_manage_lora_tag


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


print("✅ [xcpDerp] Server Initialized (Split Route Modules).")


register_json_routes(safe_get, safe_post)
register_image_routes(safe_get, safe_post)
register_prompt_book_routes(safe_get, safe_post)
register_asset_routes(safe_get, safe_post)


async def get_loras(request):
    return await handle_get_loras(request)


async def check_lora_files(request):
    return await handle_check_lora_files(request)


async def get_lora_preview(request):
    return await handle_get_lora_preview(request)


async def get_lora_triggers(request):
    return await handle_get_lora_triggers(request)


async def get_lora_info(request):
    return await handle_get_lora_info(request)


async def open_folder(request):
    return await handle_open_folder(request)


async def save_lora_rating(request):
    return await handle_save_lora_rating(request)


async def save_lora_notes(request):
    return await handle_save_lora_notes(request)


async def rename_lora_bundle(request):
    return await handle_rename_lora_bundle(request)


async def delete_lora_preview(request):
    return await handle_delete_lora_preview(request)


async def list_derpLoraStack(request):
    return await handle_list_derpLoraStack(request)


async def save_derpLoraStack(request):
    return await handle_save_derpLoraStack(request)


async def load_derpLoraStack(request):
    return await handle_load_derpLoraStack(request)


async def load_settings_redirect(request):
    name = request.query.get("name")
    target_dir = get_category_dir("settings")
    try:
        if not name:
            return web.json_response({"error": "No name provided"}, status=400)
        if not name.endswith(".json"):
            name += ".json"
        target_path = resolve_case_insensitive_path(target_dir, name)
        if not os.path.exists(target_path):
            return web.json_response({"error": "File not found"}, status=404)
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response({"data": data})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def upload_lora_preview(request):
    return await handle_upload_lora_preview(request)


async def manage_lora_tag(request):
    return await handle_manage_lora_tag(request)


async def import_lora_tags(request):
    return await handle_import_lora_tags(request)


async def list_lora_images(request):
    return await handle_list_lora_images(request)


async def get_lora_image(request):
    return await handle_get_lora_image(request)


async def set_lora_cover(request):
    return await handle_set_lora_cover(request)


async def delete_lora_image(request):
    return await handle_delete_lora_image(request)


safe_get("/xcp/get_loras", get_loras)
safe_post("/xcp/check_lora_files", check_lora_files)
safe_get("/xcp/get_lora_preview", get_lora_preview)
safe_get("/xcp/get_lora_triggers", get_lora_triggers)
safe_get("/xcp/get_lora_info", get_lora_info)
safe_get("/xcp/open_folder", open_folder)
safe_post("/xcp/save_lora_rating", save_lora_rating)
safe_post("/xcp/save_lora_notes", save_lora_notes)
safe_post("/xcp/rename_lora_bundle", rename_lora_bundle)
safe_post("/xcp/delete_lora_preview", delete_lora_preview)
safe_get("/xcp/list/derpLoraStack", list_derpLoraStack)
safe_post("/xcp/save/derpLoraStack", save_derpLoraStack)
safe_get("/xcp/load/derpLoraStack", load_derpLoraStack)
safe_get("/xcp/load/settings", load_settings_redirect)
safe_post("/xcp/upload_lora_preview", upload_lora_preview)
safe_post("/xcp/manage_lora_tag", manage_lora_tag)
safe_post("/xcp/import_lora_tags", import_lora_tags)
safe_get("/xcp/list_lora_images", list_lora_images)
safe_get("/xcp/get_lora_image", get_lora_image)
safe_post("/xcp/set_lora_cover", set_lora_cover)
safe_post("/xcp/delete_lora_image", delete_lora_image)
