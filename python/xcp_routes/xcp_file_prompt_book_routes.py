"""
Derp's prompt-book concierge desk.
Opens the right folder, renames the right book, tries not to trip over the _IMG baggage.
Polite on the outside, absolute file wrangler underneath.
"""

import os
import subprocess
import sys

from aiohttp import web

from .xcp_file_categories import get_category_dir
from .xcp_file_common import attach_fallback_header, rename_companion_image_dir, resolve_case_insensitive_path


async def open_prompt_book_folder(request):
    try:
        target_dir = get_category_dir("derpPromptBook")
        os.makedirs(target_dir, exist_ok=True)
        if os.name == "nt":
            os.startfile(target_dir)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", target_dir])
        else:
            subprocess.Popen(["xdg-open", target_dir])
        return attach_fallback_header(web.json_response({"success": True}))
    except Exception as e:
        return attach_fallback_header(web.json_response({"error": str(e)}, status=500))


async def rename_prompt_book(request):
    try:
        body = await request.json()
        old_name, new_name = body.get("oldName"), body.get("newName")
        if not old_name or not new_name:
            return web.Response(status=400)

        target_dir = get_category_dir("derpPromptBook")
        if not target_dir:
            return web.Response(status=500)

        old_json = resolve_case_insensitive_path(target_dir, f"{old_name}.json")
        new_json = resolve_case_insensitive_path(target_dir, f"{new_name}.json", create_parent=True)
        if os.path.exists(old_json):
            os.rename(old_json, new_json)

        old_clean = old_name.replace(".json", "").strip()
        new_clean = new_name.replace(".json", "").strip()
        rename_companion_image_dir(target_dir, old_clean, new_clean)
        return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)}, status=500)


def register_routes(safe_get, safe_post):
    safe_get("/xcp/open_prompt_book_folder", open_prompt_book_folder)
    safe_post("/xcp/rename_prompt_book", rename_prompt_book)
