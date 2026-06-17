"""
xcp_derp-UI version check route.
"""

import asyncio
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from aiohttp import web


REMOTE_PYPROJECT_URL = "https://raw.githubusercontent.com/lordwedggie/xcp_derp-UI-Release/main/pyproject.toml"
VERSION_RE = re.compile(r'^\s*version\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
_version_notice_sent = False


def parse_version_text(text):
    match = VERSION_RE.search(text or "")
    return match.group(1).strip() if match else None


def version_tuple(version):
    parts = []
    for part in re.split(r"[.\-+]", str(version or "")):
        if part.isdigit():
            parts.append(int(part))
        else:
            break
    return tuple(parts)


def compare_versions(local, remote):
    local_tuple = version_tuple(local)
    remote_tuple = version_tuple(remote)
    max_len = max(len(local_tuple), len(remote_tuple), 1)
    local_tuple = local_tuple + (0,) * (max_len - len(local_tuple))
    remote_tuple = remote_tuple + (0,) * (max_len - len(remote_tuple))
    if local_tuple < remote_tuple:
        return "outdated"
    return "latest"


def get_local_version():
    pyproject_path = Path(__file__).resolve().parent.parent.parent / "pyproject.toml"
    text = pyproject_path.read_text(encoding="utf-8")
    version = parse_version_text(text)
    if not version:
        raise ValueError("Local pyproject.toml does not contain a version field")
    return version


def fetch_remote_version():
    request = Request(REMOTE_PYPROJECT_URL, headers={"User-Agent": "xcp_derp-UI-version-check"})
    with urlopen(request, timeout=8) as response:
        text = response.read().decode("utf-8", errors="replace")
    version = parse_version_text(text)
    if not version:
        raise ValueError("Remote pyproject.toml does not contain a version field")
    return version


async def check_version(request):
    global _version_notice_sent
    try:
        local_version = get_local_version()
        remote_version = await asyncio.to_thread(fetch_remote_version)
        notify = not _version_notice_sent
        _version_notice_sent = True
        return web.json_response({
            "local": local_version,
            "remote": remote_version,
            "status": compare_versions(local_version, remote_version),
            "url": REMOTE_PYPROJECT_URL,
            "notify": notify,
        })
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
        return web.json_response({"error": str(exc), "url": REMOTE_PYPROJECT_URL}, status=502)


def register_routes(safe_get, _safe_post=None):
    safe_get("/xcp/check_version", check_version)
    print("[xcp_derp-UI] Version check route registered: /xcp/check_version")
