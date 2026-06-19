"""
xcp_vision_bridge.py — DeepSeek's eyes via local Qwen vision
Usage: python xcp_vision_bridge.py <image_path> [question]
Sends image to local Qwen (llama.cpp server), returns text analysis.
"""
import sys
import base64
import json
import urllib.request
import os

QWEN_URL = os.environ.get("QWEN_VISION_URL", "http://127.0.0.1:8080/v1/chat/completions")
QWEN_MODEL = os.environ.get("QWEN_VISION_MODEL", "Qwen3.6-35B-A3B-Uncensored.IQ4_NL")

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def analyze_image(image_path, question=None):
    if not os.path.exists(image_path):
        return f"ERROR: File not found: {image_path}"

    ext = os.path.splitext(image_path)[1].lower()
    mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp"}
    mime = mime_map.get(ext, "image/png")

    if question is None:
        question = (
            "Describe this image in detail. Focus on: "
            "1) What UI elements are visible (buttons, text, panels, nodes, etc.) "
            "2) Any text or labels you can read "
            "3) Colors, layout, and visual state "
            "4) Any anomalies or notable details "
            "Be thorough and specific."
        )

    b64 = encode_image(image_path)
    payload = {
        "model": QWEN_MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                {"type": "text", "text": question}
            ]
        }],
        "max_tokens": 2048,
        "temperature": 0.1
    }

    req = urllib.request.Request(
        QWEN_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return result["choices"][0]["message"]["content"]
    except urllib.error.URLError as e:
        return f"ERROR: Cannot reach Qwen server at {QWEN_URL}. Is start.bat running?\n{str(e)}"
    except Exception as e:
        return f"ERROR: {str(e)}"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python xcp_vision_bridge.py <image_path> [question]")
        sys.exit(1)

    image_path = sys.argv[1]
    question = sys.argv[2] if len(sys.argv) > 2 else None
    print(analyze_image(image_path, question))
