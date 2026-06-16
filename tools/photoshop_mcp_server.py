"""
Photoshop MCP Server — exposes core Photoshop automation as CodeWhale tools.

REQUIREMENTS: Photoshop must be running. The server connects via COM.

Install: pip install photoshop-python-api mcp
Register: deepseek mcp add photoshop --command python --arg tools/photoshop_mcp_server.py
"""
import sys
import os
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("photoshop")

# --------------- helpers ---------------

def _get_app():
    """Connect to the running Photoshop instance. Raise if unavailable."""
    from photoshop import Session
    import photoshop.api as ps
    try:
        # Session auto-connects to the running PS COM instance
        session = Session()
        app = session.app
        return app, ps
    except Exception as e:
        raise ConnectionError(
            "Photoshop is not running or the COM bridge failed. "
            "Start Photoshop, then retry."
        ) from e

def _active_doc(ps):
    """Return the active document, or raise if none is open."""
    app = ps.Application()
    doc = app.activeDocument
    if doc is None:
        raise RuntimeError("No document is open in Photoshop.")
    return doc

def _path_str(p) -> str:
    return str(Path(p).resolve())

# --------------- tools ---------------

@mcp.tool()
def photoshop_open(path: str) -> dict:
    """Open an image file in Photoshop. Returns document info."""
    app, ps = _get_app()
    p = _path_str(path)
    if not os.path.exists(p):
        raise FileNotFoundError(f"File not found: {p}")
    doc = app.open(p)
    return {
        "name": doc.name,
        "width": doc.width,
        "height": doc.height,
        "resolution": doc.resolution,
        "mode": str(doc.mode),
        "path": p,
    }

@mcp.tool()
def photoshop_get_info() -> dict:
    """Get info about the currently active Photoshop document."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    layers = [lyr.name for lyr in doc.artLayers]
    return {
        "name": doc.name,
        "path": getattr(doc, 'fullName', None) and str(doc.fullName),
        "width": doc.width,
        "height": doc.height,
        "resolution": round(doc.resolution, 2),
        "mode": str(doc.mode),
        "bits_per_channel": doc.bitsPerChannel,
        "layer_count": len(layers),
        "layers": layers,
    }

@mcp.tool()
def photoshop_save(path: str = "") -> dict:
    """Save the active document. If path is empty, save in place. If a new path, use Save As."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    if path:
        p = _path_str(path)
        doc.saveAs(Path(p), ps.JPEGSaveOptions(quality=10))
        return {"action": "save_as", "path": p}
    else:
        doc.save()
        return {"action": "save", "path": str(doc.fullName) if doc.fullName else "(unsaved)"}

@mcp.tool()
def photoshop_export(path: str, format: str = "png", quality: int = 10) -> dict:
    """Export the active document to PNG or JPEG. quality 1-12 (JPEG only)."""
    from pathlib import Path
    app, ps = _get_app()
    doc = _active_doc(ps)
    p = _path_str(path)
    fmt = format.lower()
    if fmt == "png":
        options = ps.PNGSaveOptions()
        doc.saveAs(Path(p), options, asCopy=True)
    elif fmt in ("jpg", "jpeg"):
        q = max(1, min(12, quality))
        options = ps.JPEGSaveOptions(quality=q)
        doc.saveAs(Path(p), options, asCopy=True)
    elif fmt == "psd":
        doc.saveAs(Path(p), ps.PhotoshopSaveOptions(), asCopy=True)
    else:
        raise ValueError(f"Unsupported format: {format}. Use png, jpg, or psd.")
    return {"exported": p, "format": fmt}

@mcp.tool()
def photoshop_resize(width: int = 0, height: int = 0, percent: float = 0) -> dict:
    """Resize the active document. Provide width+height in pixels, or a percent scale (e.g. 50 for half)."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    if percent > 0:
        doc.resizeImage(None, None, percent, ps.ResampleMethod.Automatic)
        new_w, new_h = doc.width, doc.height
    elif width > 0 and height > 0:
        doc.resizeImage(width, height, None, ps.ResampleMethod.Automatic)
        new_w, new_h = width, height
    else:
        raise ValueError("Provide width+height in pixels, or percent scale (e.g. 50).")
    return {"width": new_w, "height": new_h, "action": "resize"}

@mcp.tool()
def photoshop_crop(x: int = 0, y: int = 0, width: int = 100, height: int = 100) -> dict:
    """Crop the active document to the given rectangle (pixels)."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    bounds = [x, y, x + width, y + height]
    doc.crop(bounds)
    return {"width": doc.width, "height": doc.height, "action": "crop"}

@mcp.tool()
def photoshop_create_text_layer(text: str, font_size: float = 48, x: float = 100, y: float = 100, color: str = "#ffffff") -> dict:
    """Add a text layer to the active document at position (x, y) with the given font size and hex color."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    # Parse hex color
    hex_str = color.lstrip("#")
    r = int(hex_str[0:2], 16)
    g = int(hex_str[2:4], 16)
    b = int(hex_str[4:6], 16)
    rgb = ps.SolidColor()
    rgb.rgb.red = r
    rgb.rgb.green = g
    rgb.rgb.blue = b

    new_layer = doc.artLayers.add()
    new_layer.kind = ps.LayerKind.TextLayer
    text_item = new_layer.textItem
    text_item.contents = text
    text_item.position = [x, y]
    text_item.size = font_size
    text_item.color = rgb
    return {"layer": new_layer.name, "text": text, "size": font_size, "position": [x, y]}

@mcp.tool()
def photoshop_detect_tool(name: str) -> dict:
    """Select a Photoshop tool by name (e.g. 'move', 'brush', 'text', 'crop', 'marquee')."""
    app, ps = _get_app()
    tool_map = {
        "move": ps.ToolType.MoveTool,
        "brush": ps.ToolType.BrushTool,
        "text": ps.ToolType.TextTool,
        "crop": ps.ToolType.CropTool,
        "marquee": ps.ToolType.MarqueeTool,
        "lasso": ps.ToolType.LassoTool,
        "magic_wand": ps.ToolType.MagicWandTool,
        "eyedropper": ps.ToolType.EyedropperTool,
        "hand": ps.ToolType.HandTool,
        "zoom": ps.ToolType.ZoomTool,
        "pencil": ps.ToolType.PencilTool,
        "eraser": ps.ToolType.EraserTool,
        "paint_bucket": ps.ToolType.PaintBucketTool,
        "gradient": ps.ToolType.GradientTool,
        "blur": ps.ToolType.BlurTool,
        "dodge": ps.ToolType.DodgeTool,
        "pen": ps.ToolType.PenTool,
        "type": ps.ToolType.TextTool,
        "rectangle": ps.ToolType.RectangleTool,
        "clone_stamp": ps.ToolType.CloneStampTool,
    }
    key = name.lower().replace(" ", "_")
    if key not in tool_map:
        available = ", ".join(sorted(tool_map.keys()))
        raise ValueError(f"Unknown tool '{name}'. Available: {available}")
    app.currentTool = tool_map[key]
    return {"tool": key}

@mcp.tool()
def photoshop_close(save: bool = False) -> dict:
    """Close the active document. Set save=True to save before closing."""
    app, ps = _get_app()
    doc = _active_doc(ps)
    name = doc.name
    doc.close(save and ps.SaveOptions.SaveChanges or ps.SaveOptions.DoNotSaveChanges)
    return {"closed": name, "saved": save}

# --------------- entry ---------------

if __name__ == "__main__":
    mcp.run()
