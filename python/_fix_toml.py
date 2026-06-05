from pathlib import Path
import re
p = Path("pyproject.toml")
s = p.read_text(encoding="utf-8")
s = re.sub(r'version\s*=\s*"[^"]*"', 'version = "1.0.6"', s)
p.write_text(s, encoding="utf-8")
print("pyproject.toml updated")
