"""
Derp's toolbox drawer.
All the path-finding, folder-poking, and sidecar-wrangling junk lives here.
If the file system is being weird, this file is probably holding the flashlight.
"""

import json
import os
import shutil

import folder_paths

from .xcp_loraStack import get_lora_stack_profiles_dir


MODEL_FILE_EXTENSIONS = (".safetensors", ".ckpt", ".pt")


EXT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PRIMARY_ROOT = os.path.join(folder_paths.get_user_directory(), "derpNodes")
FALLBACK_ROOT = os.path.join(EXT_ROOT, "user", "derpNodes")
USING_FALLBACK_ROOT = False


def resolve_derp_root():
    global USING_FALLBACK_ROOT
    os.makedirs(PRIMARY_ROOT, exist_ok=True)
    USING_FALLBACK_ROOT = False
    return PRIMARY_ROOT


def attach_fallback_header(response, used_fallback=False):
    if response is not None and (USING_FALLBACK_ROOT or used_fallback):
        response.headers["X-Xcp-Using-Fallback"] = "1"
    return response


def _split_rel_path(path):
    normalized = str(path or "").replace("\\", "/").strip("/")
    return [part for part in normalized.split("/") if part]


def resolve_case_insensitive_path(base_dir, relative_path, create_parent=False):
    if not base_dir:
        return None
    if not os.path.exists(base_dir):
        if create_parent:
            return os.path.join(base_dir, relative_path)
        return None
    current = base_dir
    parts = _split_rel_path(relative_path)
    if not parts:
        return current

    for index, part in enumerate(parts):
        is_last = index == len(parts) - 1
        try:
            entries = os.listdir(current)
        except Exception:
            entries = []

        match = next((entry for entry in entries if entry.lower() == part.lower()), None)
        if match is not None:
            current = os.path.join(current, match)
            continue

        if create_parent or is_last:
            current = os.path.join(current, part)
            continue

        return None

    return current


def resolve_case_insensitive_dir(base_dir, folder_name):
    path = resolve_case_insensitive_path(base_dir, folder_name)
    if path and os.path.isdir(path):
        return path
    return os.path.join(base_dir, folder_name)


def resolve_derp_subdir_for_root(root_dir, preferred_name, *legacy_names, create=False):
    candidates = [preferred_name, *legacy_names]
    for name in candidates:
        path = os.path.join(root_dir, name)
        if os.path.exists(path):
            return path
    path = os.path.join(root_dir, preferred_name)
    if create:
        os.makedirs(path, exist_ok=True)
    return path


DERP_ROOT = resolve_derp_root()


def resolve_derp_subdir(preferred_name, *legacy_names):
    return resolve_derp_subdir_for_root(DERP_ROOT, preferred_name, *legacy_names, create=True)


THEME_DIR = resolve_derp_subdir("Themes", "themes")
PALETTE_DIR = resolve_derp_subdir("Palettes", "palettes")
CANVAS_PALETTE_DIR = resolve_derp_subdir("canvasPalette")
BACKGROUNDS_DIR = resolve_derp_subdir("backgrounds")
SETTINGS_DIR = resolve_derp_subdir("nodeSettings")
PROMPT_BOOK_DIR = resolve_derp_subdir("derpPromptBook")
TRIGGER_WALL_DIR = resolve_derp_subdir("derpTriggerWall")
TRIGGER_WALL_DECK_DIR = resolve_derp_subdir("derpTriggerWallDeck")
LOCALE_DIR = os.path.join(EXT_ROOT, "locales")
LORA_STACKS_DIR = get_lora_stack_profiles_dir(DERP_ROOT)

os.makedirs(LOCALE_DIR, exist_ok=True)

DEFAULT_SETTINGS_FILES = {
    "derpLoraStack.json": {},
}

for file_name, default_data in DEFAULT_SETTINGS_FILES.items():
    target_path = os.path.join(SETTINGS_DIR, file_name)
    if not os.path.exists(target_path):
        with open(target_path, "w", encoding="utf-8") as f:
            json.dump(default_data, f, indent=2)


def resolve_lora_trigger_dir(name, create_parent=False):
    if not name:
        return None

    full_path = folder_paths.get_full_path("loras", str(name).replace("\\", "/"))
    if not full_path:
        return None

    target_dir = os.path.splitext(full_path)[0]
    if create_parent:
        os.makedirs(target_dir, exist_ok=True)
    return target_dir


def get_companion_image_dir(target_dir, raw_name):
    return resolve_case_insensitive_dir(target_dir, f"{raw_name}_IMG")


def get_target_companion_image_dir(target_dir, raw_name):
    return resolve_case_insensitive_path(target_dir, f"{raw_name}_IMG", create_parent=True)


def remove_companion_image_dir(target_dir, raw_name):
    img_dir = get_companion_image_dir(target_dir, raw_name)
    if os.path.exists(img_dir):
        shutil.rmtree(img_dir)


def rename_companion_image_dir(target_dir, old_raw_name, new_raw_name):
    old_img = get_companion_image_dir(target_dir, old_raw_name)
    new_img = get_target_companion_image_dir(target_dir, new_raw_name)
    if os.path.exists(old_img):
        shutil.move(old_img, new_img)


def duplicate_companion_image_dir(target_dir, old_raw_name, new_raw_name):
    old_img = get_companion_image_dir(target_dir, old_raw_name)
    new_img = get_target_companion_image_dir(target_dir, new_raw_name)
    if os.path.exists(old_img):
        shutil.copytree(old_img, new_img)


def get_lora_trigger_info_path(target_dir):
    return os.path.join(target_dir, "_info.json")


def load_lora_trigger_info(target_dir):
    info_path = get_lora_trigger_info_path(target_dir)
    if not os.path.exists(info_path):
        return None, None
    with open(info_path, "r", encoding="utf-8") as f:
        return info_path, json.load(f)


def save_lora_trigger_info(info_path, data):
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)


def find_lora_trigger_entry(data, raw_name):
    for key, value in data.items():
        if (isinstance(value, dict) and value.get("name") == raw_name) or key == raw_name:
            return key, value
    return None, None


def delete_lora_trigger_sidecar_entry(target_dir, raw_name):
    info_path, data = load_lora_trigger_info(target_dir)
    if not info_path:
        return
    keys_to_delete = [key for key, value in data.items() if (isinstance(value, dict) and value.get("name") == raw_name) or key == raw_name]
    for key in keys_to_delete:
        data.pop(key, None)
    save_lora_trigger_info(info_path, data)


def rename_lora_trigger_sidecar_entry(target_dir, old_raw_name, new_raw_name):
    info_path, data = load_lora_trigger_info(target_dir)
    if not info_path:
        return False
    target_key, target_value = find_lora_trigger_entry(data, old_raw_name)
    if not target_key:
        return False
    if isinstance(target_value, dict):
        target_value["name"] = new_raw_name
    else:
        data[new_raw_name] = data.pop(target_key)
    save_lora_trigger_info(info_path, data)
    return True


def duplicate_lora_trigger_sidecar_entry(target_dir, old_raw_name, new_raw_name):
    info_path, data = load_lora_trigger_info(target_dir)
    if not info_path:
        return False
    target_key, target_value = find_lora_trigger_entry(data, old_raw_name)
    if not target_key:
        return False
    new_key = f"tag_{len([key for key in data.keys() if key.startswith('tag_')]) + 1:02d}"
    new_value = json.loads(json.dumps(target_value)) if isinstance(target_value, dict) else target_value
    if isinstance(new_value, dict):
        new_value["name"] = new_raw_name
    data[new_key] = new_value
    save_lora_trigger_info(info_path, data)
    return True
