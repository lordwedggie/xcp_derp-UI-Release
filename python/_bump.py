import json, re
from pathlib import Path

p = Path("package.json")
d = json.loads(p.read_text(encoding="utf-8"))
d["version"] = "1.0.13"
p.write_text(json.dumps(d, indent=2) + "\n", encoding="utf-8")

t = Path("pyproject.toml")
s = t.read_text(encoding="utf-8")
s = re.sub(r'version\s*=\s*"[^"]*"', 'version = "1.0.13"', s)
t.write_text(s, encoding="utf-8")

print("1.0.13")
