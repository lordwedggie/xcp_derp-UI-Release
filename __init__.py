# Path: ./__init__.py
import os
from .bundled_asset_sync import sync_bundled_assets
from .python.xcp_routes import xcp_file_server

sync_bundled_assets()

# Ensure these python files are in the 'python' subfolder
try:
    from .python.derpThemeManagerV2 import NODE_CLASS_MAPPINGS as THEME_V2_NODES, NODE_DISPLAY_NAME_MAPPINGS as THEME_V2_DISPLAY
    THEME_V2_NODES.update({})  # ensure dict
    THEME_V2_DISPLAY.update({})
except ImportError:
    THEME_V2_NODES = {}
    THEME_V2_DISPLAY = {}
from .python.derpSeedV2 import NODE_CLASS_MAPPINGS as SEED_V2_NODES, NODE_DISPLAY_NAME_MAPPINGS as SEED_V2_DISPLAY
from .python.derpTemplate import NODE_CLASS_MAPPINGS as TEMPLATE_NODES, NODE_DISPLAY_NAME_MAPPINGS as TEMPLATE_DISPLAY
from .python.derpControldeck import NODE_CLASS_MAPPINGS as CONTROLDECK_NODES, NODE_DISPLAY_NAME_MAPPINGS as CONTROLDECK_DISPLAY
from .python.derpSignalOut import NODE_CLASS_MAPPINGS as SIGNAL_OUT_NODES, NODE_DISPLAY_NAME_MAPPINGS as SIGNAL_OUT_DISPLAY
from .python.derpConcatenate import NODE_CLASS_MAPPINGS as CONCATENATE_NODES, NODE_DISPLAY_NAME_MAPPINGS as CONCATENATE_DISPLAY

# Import Lora Loader with safety check
try:
    from .python import xcpDerpLoraLoader
except ImportError:
    class xcpDerpLoraLoader:
        xcpDerpLoraLoader = None

# --- 1. MAPPINGS ---
NODE_CLASS_MAPPINGS = {}

# Merging all node versions and the new Signal Out node into the registry
NODE_CLASS_MAPPINGS.update(THEME_V2_NODES)
NODE_CLASS_MAPPINGS.update(SEED_V2_NODES)
NODE_CLASS_MAPPINGS.update(TEMPLATE_NODES)
NODE_CLASS_MAPPINGS.update(SIGNAL_OUT_NODES)
NODE_CLASS_MAPPINGS.update(CONTROLDECK_NODES)
NODE_CLASS_MAPPINGS.update(CONCATENATE_NODES)

if xcpDerpLoraLoader.xcpDerpLoraLoader is not None:
    NODE_CLASS_MAPPINGS["xcpDerpLoraLoader"] = xcpDerpLoraLoader.xcpDerpLoraLoader

NODE_DISPLAY_NAME_MAPPINGS = {
    **THEME_V2_DISPLAY,
    **SEED_V2_DISPLAY,
    **TEMPLATE_DISPLAY,
    **CONTROLDECK_DISPLAY,
    **SIGNAL_OUT_DISPLAY,
    **CONCATENATE_DISPLAY,
}

# Ensure new ControlDeck nodes are always exposed from package root mappings.
if "DerpImageDeckNode" in CONTROLDECK_NODES:
    NODE_CLASS_MAPPINGS["DerpImageDeckNode"] = CONTROLDECK_NODES["DerpImageDeckNode"]
    NODE_DISPLAY_NAME_MAPPINGS["DerpImageDeckNode"] = CONTROLDECK_DISPLAY.get("DerpImageDeckNode", "Derp Image Deck")

if "DerpToggleNode" in CONTROLDECK_NODES:
    NODE_CLASS_MAPPINGS["DerpToggleNode"] = CONTROLDECK_NODES["DerpToggleNode"]
    NODE_DISPLAY_NAME_MAPPINGS["DerpToggleNode"] = CONTROLDECK_DISPLAY.get("DerpToggleNode", "Derp Toggle")

# Point to your JS folder
WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]