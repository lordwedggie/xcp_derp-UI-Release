# Python Backend

## Overview
The Python layer handles node registration, file serving, API routes, LoRA management, theme persistence, and asset syncing.

**Entry point:** `__init__.py`
**Directory:** `python/` (node implementations), root (server/routes)
**Last reviewed:** 2026-06-04

## Node Registration (`__init__.py`)
Registers all node class mappings and display names into ComfyUI's registry:

```python
NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(THEME_V2_NODES)      # from derpThemeManagerV2
NODE_CLASS_MAPPINGS.update(SEED_V2_NODES)       # from derpSeedV2
NODE_CLASS_MAPPINGS.update(TEMPLATE_NODES)       # from derpTemplate
NODE_CLASS_MAPPINGS.update(SIGNAL_OUT_NODES)     # from derpSignalOut
NODE_CLASS_MAPPINGS.update(CONTROLDECK_NODES)    # from derpControldeck
NODE_CLASS_MAPPINGS.update(CONCATENATE_NODES)    # from derpConcatenate
NODE_CLASS_MAPPINGS.update(UTILITIES_NODES)      # from derpUtilities
```

Conditional imports:
- `derpThemeManagerV2` — try/except, skips if missing
- `xcpDerpLoraLoader` — try/except, sets to None if missing

Hard-registered nodes: `DerpImageDeckNode`, `DerpToggleNode` (always in root mappings)

## Python Node Files
| File | Role |
|------|------|
| `python/derpSignalOut.py` | Signal router node (173 lines). `DERP_LIVE_REGISTRY` dict for signal values. API: `/xcp/purge_signal`, `/xcp/update_signal`. `xcpDerpSignalOut` class with `AnyType("*")` for 16 virtual outputs. |
| `python/derpControldeck.py` | ControlDeck nodes (299 lines): `DerpTemplateV2Node`, `DerpLoraStackNode`, `DerpSliderNode`, `DerpToggleNode`, `DerpSeedV2Node`, `DerpTriggerWallNode`, `DerpImageDeckNode`, loader nodes. Utility: `get_sampler_names()`, `get_scheduler_names()`. |
| `python/derpSeedV2.py` | Seed node |
| `python/derpStringV3.py` | String node |
| `python/derpTemplate.py` | Template node |
| `python/derpThemeManagerV2.py` | PRIVATE — Theme manager Python node |
| `python/derpConcatenate.py` | String concatenate utility node |
| `python/derpUtilities.py` | Utility virtual shells such as `derpSkunk` and `derpNotes` |
| `python/signalDictionaryDefault.py` | Signal fallback dictionary |

## File Server (`xcp_file_server.py`, 184 lines)
HTTP route wiring for the entire backend API. Uses `safe_post()` / `safe_get()` to prevent duplicate route registration.

### Route Modules
| File | Routes |
|------|--------|
| `xcp_file_asset_routes.py` | Bundled asset serving |
| `xcp_file_image_routes.py` | Image serving/upload |
| `xcp_file_json_routes.py` | JSON data endpoints |
| `xcp_file_markdown_routes.py` | Markdown note list/load plus restricted local media serving |
| `xcp_file_prompt_book_routes.py` | Prompt book CRUD |
| `xcp_version_check.py` | Version/check endpoints |
| `xcp_file_common.py` | `resolve_case_insensitive_path()` utility |
| `xcp_file_categories.py` | `get_category_dir()` utility |

### LoRA Stack API (`xcp_loraStack.py`)
| Handler | Endpoint |
|---------|----------|
| `handle_get_loras` | GET `/xcp/get_loras` |
| `handle_check_lora_files` | POST `/xcp/check_lora_files` |
| `handle_get_lora_info` | GET `/xcp/get_lora_info` |
| `handle_get_lora_triggers` | GET `/xcp/get_lora_triggers` |
| `handle_get_lora_preview` | GET `/xcp/get_lora_preview` |
| `handle_get_lora_image` | GET `/xcp/get_lora_image` |
| `handle_list_lora_images` | GET `/xcp/list_lora_images` |
| `handle_save_lora_rating` | POST `/xcp/save_lora_rating` |
| `handle_save_lora_notes` | POST `/xcp/save_lora_notes` |
| `handle_rename_lora_bundle` | POST `/xcp/rename_lora_bundle` |
| `handle_delete_lora_preview` | POST `/xcp/delete_lora_preview` |
| `handle_delete_lora_image` | POST `/xcp/delete_lora_image` |
| `handle_upload_lora_preview` | POST `/xcp/upload_lora_preview` |
| `handle_set_lora_cover` | POST `/xcp/set_lora_cover` |
| `handle_open_folder` | GET `/xcp/open_folder` |
| `handle_save_derpLoraStack` | POST `/xcp/save/derpLoraStack` |
| `handle_load_derpLoraStack` | GET `/xcp/load/derpLoraStack` |
| `handle_list_derpLoraStack` | GET `/xcp/list/derpLoraStack` |
| `load_settings_redirect` | GET `/xcp/load/settings` |

### Tag Handling (`xcp_tagHandling.py`)
| Handler | Endpoint |
|---------|----------|
| `handle_import_lora_tags` | POST `/xcp/import_lora_tags` |
| `handle_manage_lora_tag` | POST `/xcp/manage_lora_tag` |

## Bundled Asset Sync (`bundled_asset_sync.py`)
Syncs default assets from extension's `user/derpNodes/` to ComfyUI's user directory.

- Source: `EXT_ROOT/user/derpNodes/`
- Dest: `folder_paths.get_user_directory()/derpNodes/`
- State tracking: `.xcp_sync_state.json` for differential sync
- Sync folders are discovered dynamically from directories under `user/derpNodes/`
- System-managed folders/files (prefixed with `_`) get special handling
- Called at startup via `sync_bundled_assets()` in `__init__.__init__.py`

## Markdown Routes (`xcp_file_markdown_routes.py`)
- `/xcp/list_markdown` lists `.md` / `.markdown` files from the configured derpNotes and `derp_docs` roots.
- `/xcp/load_markdown` returns UTF-8 Markdown content plus its root-relative path so frontend widgets can resolve adjacent media.
- `/xcp/markdown_media` serves whitelisted Markdown-adjacent media files directly with their guessed MIME type and no attachment/download header, allowing native browser playback for local video embeds.
- Markdown media resolution must reject traversal and unsupported extensions; it is not a general filesystem route.

## Version Check (`xcp_version_check.py`)
- GET `/xcp/check_version` compares the local `pyproject.toml` version with the release repo `pyproject.toml`.
- Success returns `local`, `remote`, `status`, `url`, and `notify`.
- Transient network failures from the remote fetch, including short SSL EOF handshake failures, return a quiet `status: "unavailable"` with `notify: false` so the frontend skips noisy console warnings.
- Hard failures such as malformed local or remote version data still return HTTP `502` with an `error` message.

## Signal System (Python)
- `DERP_LIVE_REGISTRY` — global dict mapping `node_id → value` for wireless signals
- API: `/xcp/update_signal` (POST) — register a signal value
- API: `/xcp/purge_signal` (POST) — remove a signal
- `AnyType("*")` — wildcard type that matches everything for virtual slots
- `clone_runtime_signal_value()` — safe clone for MODEL/CLIP/VAE types
- Signal out node has 16 hidden wireless inputs (`_hidden_wire_0..15`) and 16 virtual outputs

## Key Pattern: Virtual Nodes
Most Controldeck nodes are "pure virtual shells" — they have no real inputs, minimal outputs, and `do_nothing()` as their function. All actual logic happens in the JS frontend. They exist only for:
1. Appearing in the node graph
2. Transmitting wireless signals
3. Receiving remote bypass signals

Example:
```python
class DerpLoraStackNode:
    RETURN_TYPES = ("LORA_STACK",)
    FUNCTION = "do_nothing"
    def do_nothing(self):
        return (None,)  # Pure virtual — JS handles everything
```

## Maintenance Notes
- Treat this document as a route/register map, not implementation truth. Verify `__init__.py`, `xcp_file_server.py`, and route modules before backend edits.
- Update this document whenever a Python node module, backend route, or bundled asset sync behavior changes.
