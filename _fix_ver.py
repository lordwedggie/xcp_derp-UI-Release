import json
p = "package.json"
d = json.load(open(p, "r", encoding="utf-8"))
d["version"] = "1.0.6"
open(p, "w", encoding="utf-8").write(json.dumps(d, indent=2) + "\n")
print("package.json updated to 1.0.6")
