# v1.0.10 Registry Install Debug Handoff

User reports that the workspace was published as `1.0.10` on the ComfyUI Registry, but a fresh install from the Registry behaves differently from the workspace install even though files appear identical.

Reported symptoms on the Registry/fresh install:
- Node 2.0 compatibility shell suppression does not appear to work; the native Node 2.0 shell still shows.
- No version-check `bastaSystemMessage` report appears.
- `derpSignalOut` slots and links display, but positions are incorrect in Node 2.0, probably because the native Node 2.0 shell/slot DOM is not being suppressed or aligned correctly.

What was checked after `GIT PULL` to `origin/daily-development`:
- Current HEAD: `5f3f6bd restore excluded files to daily-development`.
- Release commit: `8f66e06 release v1.0.10`.
- `pyproject.toml` has `version = "1.0.10"`.
- `package.json` has `"version": "1.0.10"`.
- `WEB_DIRECTORY = "./js"` is present in `__init__.py`.
- `js/fatha/core/fathaNode2Compat.js` exists in the `8f66e06` release commit.
- `js/xcp_version_check.js` exists in the `8f66e06` release commit.
- `xcp_version_check.py` exists in the `8f66e06` release commit.
- `.comfyignore` does not exclude `js/` or `xcp_version_check.py`.

Strong suspicion:
- This does not look like the release commit is missing the relevant files.
- It looks more like the fresh Registry install is not actually loading the same frontend modules at runtime, is using stale frontend cache, or a JS module import fails early and prevents extension registration.
- Another possibility is that the fresh install's ComfyUI Node 2.0 DOM differs from the local workspace ComfyUI DOM, so selectors in `fathaNode2Compat.js` do not hit the native shell.

Specific things to double check in the publishing pattern:
- Confirm the Registry package generated from `v1.0.10` actually contains `js/fatha/core/fathaNode2Compat.js`, `js/xcp_version_check.js`, `xcp_version_check.py`, and `__init__.py` with `WEB_DIRECTORY = "./js"`.
- Confirm `.comfyignore` is being interpreted as intended and is not accidentally causing stale or unexpected packaged content.
- Confirm the release workflow publishes from `public/main` or the correct release commit, not only from a tag or stale branch.
- Confirm Registry/ComfyUI Manager install does not preserve old frontend assets under a cached custom node folder.
- Confirm the fresh install's browser actually loads `xcp_version_check.js` and `fathaNode2Compat.js` from network devtools.
- Confirm there are no console import errors before `xcp.VersionCheck` or `xcp.DerpVirtualLoader` registers.

Useful browser-console checks on the fresh install:

```js
window.__xcpVersionCheckStarted
```

If this is `undefined`, `js/xcp_version_check.js` did not run.

```js
await fetch("/xcp/check_version", { cache: "no-store" }).then(r => r.json())
```

If this fails, the backend route did not register or the route request failed.

```js
LiteGraph.vueNodesMode
```

Confirms whether the fresh install is actually in Node 2.0/Vue node mode.

```js
[...document.querySelectorAll("[data-node-id], .lg-node")].slice(0, 5).map(e => ({
  cls: e.className,
  id: e.getAttribute("data-node-id"),
  testid: e.getAttribute("data-testid")
}))
```

This checks whether `fathaNode2Compat.js` selectors can hit the current ComfyUI Node 2.0 DOM.

Known oddity noticed during review:
- `pyproject.toml` uses repository URL `https://github.com/lordwedggie/xcp_derpNodes_release`.
- `xcp_version_check.py` fetches `https://raw.githubusercontent.com/lordwedggie/xcpDerpNodes_release/main/pyproject.toml`.
- Both raw URL variants appeared reachable during this check, but the naming mismatch is still worth cleaning up to reduce release/debug ambiguity.

Current conclusion to verify:
- If the files are truly identical on disk, the most likely causes are runtime loading/cache/import failure or ComfyUI Node 2.0 DOM mismatch, not missing source files in the git release commit.
