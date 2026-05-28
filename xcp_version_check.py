"""
xcpDerpNodes version checker.
Pulls latest version from the public release repo and compares.
"""
import json
import os
import re
import toml
from server import PromptServer
from aiohttp import web

EXT_ROOT = os.path.dirname(os.path.abspath(__file__))
RELEASE_REPO_TOML = "https://raw.githubusercontent.com/lordwedggie/xcp_derpNodes-release/main/pyproject.toml"


def _read_local_version():
    """Read version from local pyproject.toml."""
    try:
        with open(os.path.join(EXT_ROOT, "pyproject.toml"), "r", encoding="utf-8") as f:
            data = toml.load(f)
            return str(data.get("project", {}).get("version", "0.0.0"))
    except Exception:
        return "0.0.0"


@PromptServer.instance.routes.get("/xcp/check_version")
async def check_version_api(request):
    """Check if installed version is up to date with the release repo."""
    local = _read_local_version()

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            async with session.get(RELEASE_REPO_TOML, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status != 200:
                    return web.json_response({
                        "local": local,
                        "remote": None,
                        "status": "error",
                        "message": f"Could not fetch release info (HTTP {resp.status})"
                    })
                raw = await resp.text()
    except Exception as e:
        return web.json_response({
            "local": local,
            "remote": None,
            "status": "error",
            "message": str(e)
        })

    # Parse remote version from TOML
    remote = "0.0.0"
    for line in raw.split("\n"):
        m = re.match(r'^\s*version\s*=\s*["\']([^"\']+)["\']', line)
        if m:
            remote = m.group(1)
            break

    if not remote or remote == "0.0.0":
        return web.json_response({
            "local": local,
            "remote": None,
            "status": "error",
            "message": "Could not parse remote version"
        })

    # Compare versions (simple semver comparison)
    local_parts = [int(x) for x in local.split(".")]
    remote_parts = [int(x) for x in remote.split(".")]

    outdated = False
    for l, r in zip(local_parts, remote_parts):
        if r > l:
            outdated = True
            break
        elif l > r:
            break

    return web.json_response({
        "local": local,
        "remote": remote,
        "status": "outdated" if outdated else "latest",
        "outdated": outdated
    })
