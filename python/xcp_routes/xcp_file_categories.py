"""
Derp's filing cabinet map.
It remembers which category goes where so the rest of the code can stop guessing.
Basically the librarian, but with more folders and less judgment.
"""

import folder_paths

from .xcp_file_common import (
    BACKGROUNDS_DIR,
    CANVAS_PALETTE_DIR,
    LOCALE_DIR,
    LORA_STACKS_DIR,
    MODEL_FILE_EXTENSIONS,
    PALETTE_DIR,
    PROMPT_BOOK_DIR,
    SETTINGS_DIR,
    THEME_DIR,
    TRIGGER_WALL_DIR,
    resolve_lora_trigger_dir,
)


BACKGROUND_FILE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp")


def get_theme_search_dirs():
    from .xcp_file_common import PRIMARY_ROOT
    return [
        f"{PRIMARY_ROOT}/Themes",
    ]


def get_palette_search_dirs():
    from .xcp_file_common import PRIMARY_ROOT
    return [
        f"{PRIMARY_ROOT}/Palettes",
    ]


def get_background_search_dirs():
    from .xcp_file_common import PRIMARY_ROOT
    return [
        f"{PRIMARY_ROOT}/backgrounds",
    ]


def get_canvas_palette_search_dirs():
    from .xcp_file_common import PRIMARY_ROOT
    return [
        f"{PRIMARY_ROOT}/canvasPalette",
    ]


CATEGORY_SPECS = {
    "themes": {
        "dir": THEME_DIR,
        "file_extension": ".json",
        "search_dirs": get_theme_search_dirs,
        "use_search_lookup": True,
    },
    "settings": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "derpSlider": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "derpLatent": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "derpModelLoader": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "derpVaeLoader": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "derpLoraStack": {"dir": LORA_STACKS_DIR, "file_extension": ".json"},
    "palettes": {
        "dir": PALETTE_DIR,
        "file_extension": ".json",
        "search_dirs": get_palette_search_dirs,
        "use_search_lookup": True,
    },
    "backgrounds": {
        "dir": BACKGROUNDS_DIR,
        "file_extension": ".json",
        "search_dirs": get_background_search_dirs,
        "list_extensions": BACKGROUND_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "canvasPalette": {
        "dir": CANVAS_PALETTE_DIR,
        "file_extension": ".json",
        "search_dirs": get_canvas_palette_search_dirs,
        "use_search_lookup": True,
    },
    "derpPromptBook": {"dir": PROMPT_BOOK_DIR, "file_extension": ".json"},
    "books": {"dir": PROMPT_BOOK_DIR, "file_extension": ".json"},
    "locales": {"dir": LOCALE_DIR, "file_extension": ".json"},
    "models": {
        "dir": folder_paths.get_folder_paths("checkpoints")[0],
        "file_extension": ".json",
        "model_category": "checkpoints",
        "list_extensions": MODEL_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "diffusion_models": {
        "dir": folder_paths.get_folder_paths("diffusion_models")[0],
        "file_extension": ".json",
        "model_category": "diffusion_models",
        "list_extensions": MODEL_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "unet": {
        "dir": folder_paths.get_folder_paths("unet")[0],
        "file_extension": ".json",
        "model_category": "unet",
        "list_extensions": MODEL_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "text_encoders": {
        "dir": folder_paths.get_folder_paths("text_encoders")[0],
        "file_extension": ".json",
        "model_category": "text_encoders",
        "list_extensions": MODEL_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "vaes": {
        "dir": folder_paths.get_folder_paths("vae")[0],
        "file_extension": ".json",
        "model_category": "vae",
        "list_extensions": MODEL_FILE_EXTENSIONS,
        "preserve_extension": True,
    },
    "output": {
        "dir": folder_paths.get_output_directory(),
        "file_extension": ".json",
    },
    "triggerWall": {"dir": TRIGGER_WALL_DIR, "file_extension": ".json"},
    "triggerWallDeck": {"dir": SETTINGS_DIR, "file_extension": ".json"},
    "lora_triggers": {
        "dir": None,
        "file_extension": ".txt",
        "resolve_dir": resolve_lora_trigger_dir,
    },
}


def get_category_spec(category):
    return CATEGORY_SPECS.get(category)


def resolve_category_context(category, request=None, create_dynamic_dir=False, fallback_name=None):
    spec = get_category_spec(category)
    if not spec:
        return None, None

    target_dir = spec.get("dir")
    resolve_dir = spec.get("resolve_dir")
    if resolve_dir:
        name = None
        if request is not None:
            name = request.query.get("name")
        if not name:
            name = fallback_name
        if name:
            target_dir = resolve_dir(name, create_parent=create_dynamic_dir) or target_dir
    return spec, target_dir


def get_category_dir(category):
    spec = get_category_spec(category)
    return spec.get("dir") if spec else None


def get_category_file_extension(category):
    spec = get_category_spec(category)
    return spec.get("file_extension", ".json") if spec else ".json"


def get_listable_file_extensions(category):
    spec = get_category_spec(category)
    if not spec:
        return (".json",)
    if spec.get("list_extensions"):
        return spec["list_extensions"]
    return (spec.get("file_extension", ".json"),)


def get_category_search_dirs(category, target_dir=None):
    spec = get_category_spec(category)
    if spec and spec.get("search_dirs"):
        return spec["search_dirs"]()
    return [target_dir] if target_dir else []


def should_preserve_listed_extension(category):
    spec = get_category_spec(category)
    return bool(spec and spec.get("preserve_extension"))


def uses_search_dir_file_lookup(category):
    spec = get_category_spec(category)
    return bool(spec and spec.get("use_search_lookup"))
