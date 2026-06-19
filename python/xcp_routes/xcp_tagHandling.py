"""
Path: ./xcp_tagHandling.py
"""
import os
import json
from aiohttp import web
from .xcp_loraStack import get_existing_lora_full_path, get_lora_sidecar_base_path

async def handle_import_lora_tags(request):
    try:
        body = await request.json()
        lora_name = body.get("name")
        remove_txt = body.get("remove_txt", False)

        if not lora_name:
            return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = get_existing_lora_full_path(lora_name)
        if not full_path:
            return web.json_response({"error": "LoRA not found"}, status=404)

        target_dir = get_lora_sidecar_base_path(full_path)
        info_path = os.path.join(target_dir, "_info.json")

        data = {}
        if os.path.exists(info_path):
            with open(info_path, "r", encoding="utf-8") as f:
                try: data = json.load(f)
                except: data = {}

        count = 0
        if os.path.exists(target_dir) and os.path.isdir(target_dir):
            max_idx = 0
            existing_names = set()
            for k, v in data.items():
                if k.startswith("tag_"):
                    try: max_idx = max(max_idx, int(k.split("_")[1]))
                    except: pass
                if isinstance(v, dict) and "name" in v:
                    existing_names.add(v["name"])

            txt_files = [f for f in os.listdir(target_dir) if f.lower().endswith(".txt")]
            for f in txt_files:
                tag_name = os.path.splitext(f)[0]
                file_path = os.path.join(target_dir, f)

                if tag_name in existing_names:
                    if remove_txt: os.remove(file_path)
                    continue

                count += 1
                max_idx += 1
                tag_key = f"tag_{max_idx:02d}"
                with open(file_path, "r", encoding="utf-8") as t:
                    content = t.read().strip()

                data[tag_key] = { "name": tag_name, "tag": content }
                if remove_txt: os.remove(file_path)

        if count > 0:
            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
        return web.json_response({"success": True, "count": count, "triggers": data})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_manage_lora_tag(request):
    try:
        body = await request.json()
        lora_name = body.get("name")
        action = body.get("action")
        tag_key = body.get("tagKey") or body.get("tagName")
        tag_content = body.get("tagContent", "")

        if not lora_name or not action:
            return web.json_response({"error": "Missing parameters"}, status=400)
        if not tag_key and action not in ["update_setup", "init"]:
            return web.json_response({"error": "Missing parameters"}, status=400)

        full_path = get_existing_lora_full_path(lora_name)
        if not full_path: return web.json_response({"error": "LoRA not found"}, status=404)

        target_dir = get_lora_sidecar_base_path(full_path)
        # THE CONFLICT FIX: Ensure we aren't trying to create a folder where a file (like the LoRA itself) already exists
        if os.path.exists(target_dir) and not os.path.isdir(target_dir):
            target_dir = target_dir + "_triggers"

        try:
            os.makedirs(target_dir, exist_ok=True)
        except Exception as e:
            return web.json_response({"error": f"Failed to create sidecar directory: {str(e)}"}, status=500)

        info_path = os.path.join(target_dir, "_info.json")

        if action == "new_tag":
            # THE NORMALIZATION FIX: Ensure tag names are logical and clean
            tag_key = tag_key.replace(".txt", "")
            data = {}
            if os.path.exists(info_path):
                try:
                    with open(info_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        # THE INTEGRITY FIX: Force dictionary type to prevent .keys() crashes on null/list files
                        if not isinstance(data, dict): data = {}
                except Exception:
                    data = {}

            max_idx = 0
            for k in data.keys():
                if k.startswith("tag_"):
                    try: max_idx = max(max_idx, int(k.split("_")[1]))
                    except: pass

            new_key = f"tag_{max_idx + 1:02d}"
            data[new_key] = { "name": tag_key, "tag": tag_content }
            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            # THE NEW KEY RETURN FIX: Return the generated dictionary key so the frontend can select it correctly
            return web.json_response({"success": True, "new_key": new_key})

        if action == "rename":
            # THE NORMALIZATION FIX: Strip .txt from new_name to treat entries as logical tags
            new_name = body.get("newName", "").replace(".txt", "")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

                # THE VIRTUAL RENAME FIX: Find the entry by its ID key (tag_XX) and update the name field
                if tag_key in data:
                    entry = data[tag_key]

                    # Capture the old logical name to rename the physical file on disk
                    old_display_name = entry.get("name") if isinstance(entry, dict) else tag_key.replace(".txt", "")

                    if isinstance(entry, dict):
                        entry["name"] = new_name
                        updated_key = tag_key
                    else:
                        data[new_name] = data.pop(tag_key)
                        updated_key = new_name

                    with open(info_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=4)

                    # THE SYNC FIX: Also rename the physical file if it exists to prevent the scan from
                    # rediscovering the old filename as a duplicate entry.
                    if old_display_name:
                        old_file = os.path.join(target_dir, f"{old_display_name}.txt")
                        if os.path.exists(old_file):
                            new_file = os.path.join(target_dir, f"{new_name}.txt")
                            # Prevent overwriting existing files
                            if not os.path.exists(new_file):
                                os.rename(old_file, new_file)

                    return web.json_response({"success": True, "updated_key": updated_key})

            # Fallback: Physical .txt file rename for tags not managed in _info.json
            old_path = os.path.join(target_dir, tag_key if tag_key.endswith(".txt") else f"{tag_key}.txt")
            if os.path.exists(old_path):
                new_path = os.path.join(target_dir, new_name if new_name.endswith(".txt") else f"{new_name}.txt")
                if not os.path.exists(new_path):
                    os.rename(old_path, new_path)
                updated_key = new_name if new_name.endswith(".txt") else f"{new_name}.txt"
                return web.json_response({"success": True, "updated_key": updated_key})
            return web.json_response({"error": "Tag not found"}, status=404)

        # 3. Action: Copy (JSON entry Master)
        if action == "copy":
            # THE NORMALIZATION FIX: Strip .txt from new_name
            new_name = body.get("newName", "").replace(".txt", "")
            data = {}
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

            # THE ID PARITY FIX: Use .keys() and robust numeric parsing to prevent ID collisions
            max_idx = 0
            for k in data.keys():
                if k.startswith("tag_"):
                    try:
                        idx_val = int(k.split("_")[1])
                        if idx_val > max_idx: max_idx = idx_val
                    except: pass
            new_key = f"tag_{max_idx + 1:02d}"

            content = ""
            if tag_key in data:
                entry = data[tag_key]
                content = entry.get("tag", "") if isinstance(entry, dict) else entry
            else:
                src_path = os.path.join(target_dir, tag_key if tag_key.endswith(".txt") else f"{tag_key}.txt")
                if os.path.exists(src_path):
                    with open(src_path, "r", encoding="utf-8") as f: content = f.read().strip()

            data[new_key] = { "name": new_name, "tag": content }
            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            # THE NEW KEY RETURN FIX: Return the generated dictionary key so the frontend can select it correctly
            return web.json_response({"success": True, "new_key": new_key})

        if action == "delete":
            deleted = False
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}
                if tag_key in data:
                    data.pop(tag_key)
                    with open(info_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=4)
                    deleted = True

            file_path = os.path.join(target_dir, tag_key if tag_key.endswith(".txt") else f"{tag_key}.txt")
            if os.path.exists(file_path):
                os.remove(file_path)
                deleted = True

            if deleted: return web.json_response({"success": True})
            return web.json_response({"error": "Tag not found"}, status=404)

        if action == "save":
            file_name = tag_key if tag_key.endswith(".txt") else f"{tag_key}.txt"
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

                if tag_key in data:
                    entry = data[tag_key]
                    if isinstance(entry, dict):
                        entry["tag"] = tag_content
                        custom_name = entry.get("name")
                        if custom_name:
                            file_name = custom_name if custom_name.endswith(".txt") else f"{custom_name}.txt"
                    else:
                        data[tag_key] = tag_content

                    with open(info_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=4)

            target_path = os.path.join(target_dir, file_name)
            if os.path.exists(target_path) or tag_key.endswith(".txt"):
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(tag_content)

            return web.json_response({"success": True})

        if action == "link_image":
            image_name = body.get("image")
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}

                if tag_key in data:
                    entry = data[tag_key]
                    if isinstance(entry, dict):
                        entry["image"] = image_name
                    else:
                        data[tag_key] = {"name": tag_key.replace(".txt", ""), "tag": entry, "image": image_name}

                    with open(info_path, "w", encoding="utf-8") as f:
                        json.dump(data, f, indent=4)
                    return web.json_response({"success": True})
            return web.json_response({"error": "Tag not found"}, status=404)

        # THE DIRECTORY INIT FIX: Safe "init" action to trigger the directory creation logic at the top of the handler
        if action == "update_setup":
            setup_data = body.get("setup_data", {})
            data = {}
            if os.path.exists(info_path):
                with open(info_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                        if not isinstance(data, dict): data = {}
                    except: data = {}
            if "setup" not in data or not isinstance(data["setup"], dict):
                data["setup"] = {}
            data["setup"].update(setup_data)
            with open(info_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=4)
            return web.json_response({"success": True})

        if action == "init":
            return web.json_response({"success": True})

        return web.json_response({"error": "Invalid action"}, status=400)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
