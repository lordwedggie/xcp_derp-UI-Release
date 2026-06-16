"""Crop and save Photoshop document."""
import os
from pathlib import Path
from photoshop import Session
import photoshop.api as ps

session = Session()
app = session.app
doc = app.activeDocument

if doc is None:
    print("ERROR: No document open")
    exit(1)

print(f"Current: {doc.width:.0f}x{doc.height:.0f}")

# Crop to 1024x1024 from top-center
target = 1024
x = int((doc.width - target) / 2)   # centered horizontally
y = 0                                # top-aligned (titles usually at top)

# Clamp to document bounds
x = max(0, min(x, int(doc.width) - target))
y = max(0, min(y, int(doc.height) - target))

bounds = [x, y, x + target, y + target]
print(f"Cropping to: x={x}, y={y}, {target}x{target}")
doc.crop(bounds)
print(f"After crop: {doc.width:.0f}x{doc.height:.0f}")

# Save to Downloads as JPG
downloads = str(Path.home() / "Downloads")
name = Path(doc.name).stem
out_path = os.path.join(downloads, f"{name}_1024x1024.jpg")
options = ps.JPEGSaveOptions(quality=10)
doc.saveAs(str(Path(out_path)), options, asCopy=True)
print(f"Saved: {out_path}")
