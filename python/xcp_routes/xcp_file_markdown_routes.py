"""
Safe local media serving for Markdown viewer content.
"""

import mimetypes
import os

from aiohttp import web

from .xcp_file_common import EXT_ROOT, FALLBACK_ROOT, PRIMARY_ROOT, resolve_case_insensitive_path


MARKDOWN_ROOTS = (
    os.path.join(PRIMARY_ROOT, "derpNotes"),
    os.path.join(FALLBACK_ROOT, "derpNotes"),
    os.path.join(EXT_ROOT, "derp_docs"),
)

MARKDOWN_FILE_EXTENSIONS = (".md", ".markdown")
MARKDOWN_MEDIA_EXTENSIONS = (
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg",
    ".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v",
    ".vtt",
)


def _is_path_inside(parent, child):
    try:
        parent_abs = os.path.abspath(parent)
        child_abs = os.path.abspath(child)
        return os.path.commonpath([parent_abs, child_abs]) == parent_abs
    except ValueError:
        return False


def _resolve_markdown_media_path(raw_path):
    rel_path = str(raw_path or "").replace("\\", "/").strip("/")
    if not rel_path or ".." in rel_path.split("/"):
        return None
    if not rel_path.lower().endswith(MARKDOWN_MEDIA_EXTENSIONS):
        return None

    for root in (*MARKDOWN_ROOTS, EXT_ROOT):
        target_path = resolve_case_insensitive_path(root, rel_path)
        if target_path and _is_path_inside(root, target_path) and os.path.isfile(target_path):
            return target_path
    return None


def _resolve_markdown_file_path(raw_path):
    rel_path = str(raw_path or "").replace("\\", "/").strip("/")
    if not rel_path or ".." in rel_path.split("/"):
        return None
    if not rel_path.lower().endswith(MARKDOWN_FILE_EXTENSIONS):
        return None

    for root in MARKDOWN_ROOTS:
        target_path = resolve_case_insensitive_path(root, rel_path)
        if target_path and _is_path_inside(root, target_path) and os.path.isfile(target_path):
            return target_path
    return None


async def list_markdown_files(request):
    items = []
    seen = set()
    os.makedirs(MARKDOWN_ROOTS[0], exist_ok=True)
    for root in MARKDOWN_ROOTS:
        if not os.path.isdir(root):
            continue
        for current_root, dirs, files in os.walk(root):
            dirs[:] = [name for name in dirs if not name.startswith(".")]
            for file_name in files:
                if not file_name.lower().endswith(MARKDOWN_FILE_EXTENSIONS):
                    continue
                rel_path = os.path.relpath(os.path.join(current_root, file_name), root).replace("\\", "/")
                if rel_path not in seen:
                    seen.add(rel_path)
                    items.append(rel_path)
    return web.json_response({"items": sorted(items)})


async def load_markdown_file(request):
    target_path = _resolve_markdown_file_path(request.query.get("path") or request.query.get("name"))
    if not target_path:
        return web.json_response({"error": "File not found"}, status=404)
    try:
        with open(target_path, "r", encoding="utf-8-sig") as handle:
            content = handle.read()
        root_path = next((root for root in MARKDOWN_ROOTS if _is_path_inside(root, target_path)), MARKDOWN_ROOTS[0])
        rel_path = os.path.relpath(target_path, root_path).replace("\\", "/")
        return web.json_response({"content": content, "path": rel_path})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def get_markdown_media(request):
    target_path = _resolve_markdown_media_path(request.query.get("path"))
    if not target_path:
        return web.Response(status=404)

    content_type, _encoding = mimetypes.guess_type(target_path)
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    return web.FileResponse(target_path, headers=headers)


def register_routes(safe_get, safe_post):
    safe_get("/xcp/list_markdown", list_markdown_files)
    safe_get("/xcp/load_markdown", load_markdown_file)
    safe_get("/xcp/markdown_media", get_markdown_media)
