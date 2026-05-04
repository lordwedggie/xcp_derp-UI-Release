# Path: ./python/signalDictionaryDefault.py
import torch
import os
import numpy as np
import glob
from PIL import Image, ImageOps
import folder_paths
import comfy.sd
import comfy.utils

def reconstruct_latent(v, w, h, b):
    return {"samples": torch.zeros([b, 4, h // 8, w // 8])}

def reconstruct_image(v, w, h, b):
    return torch.zeros([b, h, w, 3])

def reconstruct_mask(v, w, h, b):
    return torch.zeros([b, h, w])

def reconstruct_audio(v, w, h, b):
    return {"waveform": torch.zeros([1, 2, 44100]), "sample_rate": 44100}

def reconstruct_conditioning(v, w, h, b):
    return [[torch.zeros([1, 77, 768]), {"pooled_output": torch.zeros([1, 768])}]]

RECONSTRUCTION_MAP = {
    "EMPTY_LATENT": reconstruct_latent,
    "LATENT": reconstruct_latent,
    "IMAGE": reconstruct_image,
    "MASK": reconstruct_mask,
    "AUDIO": reconstruct_audio,
    "CONDITIONING": reconstruct_conditioning,
}

def find_first_checkpoint():
    ckpt_list = folder_paths.get_filename_list("checkpoints")
    if ckpt_list:
        return ckpt_list[0]
    return None

def safe_clone(obj):
    if obj is None:
        return None
    if hasattr(obj, 'clone'):
        try:
            return obj.clone()
        except Exception:
            return obj
    return obj

def load_checkpoint_models(ckpt_name, registry):
    if not ckpt_name or ckpt_name == "None":
        return None, None, None
    cache_key = f"CKPT:{ckpt_name}"
    cached = registry.get(cache_key)
    if cached is not None:
        m, c, v = cached
        return safe_clone(m), safe_clone(c), safe_clone(v)
    ckpt_path = folder_paths.get_full_path("checkpoints", ckpt_name)
    if not ckpt_path:
        vae_path = folder_paths.get_full_path("vae", ckpt_name)
        if vae_path:
            sd = comfy.utils.load_torch_file(vae_path)
            v = comfy.sd.VAE(sd)
            registry[cache_key] = (None, None, v)
            return None, None, safe_clone(v)
        return None, None, None
    out = comfy.sd.load_checkpoint_guess_config(
        ckpt_path,
        output_vae=True,
        output_clip=True,
        output_model=True,
        embedding_directory=folder_paths.get_folder_paths("embeddings")
    )
    m, c, v = out[:3]
    registry[cache_key] = (m, c, v)
    return safe_clone(m), safe_clone(c), safe_clone(v)

def process_signal_fallback(val, sig_type, registry):
    # IMAGE FALLBACK
    if "IMAGE" in sig_type:
        filename = val if isinstance(val, str) else (val.get("image") if isinstance(val, dict) else None)
        if isinstance(filename, str):
            img_path = folder_paths.get_annotated_filepath(filename)
            if os.path.exists(img_path):
                img = Image.open(img_path)
                img = ImageOps.exif_transpose(img).convert("RGB")
                image = np.array(img).astype(np.float32) / 255.0
                return torch.from_numpy(image)[None,]

    # MODEL, CLIP, VAE
    if any(x in sig_type for x in ["MODEL", "CLIP", "VAE"]):
        # Handle LoRA stack dictionaries
        if isinstance(val, dict) and "stack" in val:
            m_id_raw = val.get("model_id")
            m_id = str(m_id_raw) if m_id_raw not in [None, ""] else ""
            c_id_raw = val.get("clip_id")
            c_id = str(c_id_raw) if c_id_raw not in [None, ""] else ""

            # Try to get already resolved tensors from registry
            m = registry.get(m_id) if m_id else None
            c = registry.get(c_id) if c_id else None
            v = None

            # If m or c are strings or dicts, we need to resolve them via fallback
            if m is None or isinstance(m, (str, dict)):
                m = process_signal_fallback(registry.get(m_id) if m_id else None, "MODEL", registry) if m_id else None
            if c is None or isinstance(c, (str, dict)):
                c = process_signal_fallback(registry.get(c_id) if c_id else None, "CLIP", registry) if c_id else None

            need_m = m is None or isinstance(m, (str, dict))
            need_c = c is None or isinstance(c, (str, dict))

            if need_m or need_c:
                m_fallback = val.get("model_fallback")
                c_fallback = val.get("clip_fallback")
                ckpt_name = None
                if isinstance(m_fallback, dict):
                    ckpt_name = m_fallback.get("ckpt_name")
                elif isinstance(m_fallback, str):
                    ckpt_name = m_fallback
                if not ckpt_name and isinstance(c_fallback, dict):
                    ckpt_name = c_fallback.get("ckpt_name")
                elif not ckpt_name and isinstance(c_fallback, str):
                    ckpt_name = c_fallback
                if not ckpt_name or ckpt_name == "None":
                    ckpt_name = find_first_checkpoint()
                    if not ckpt_name:
                        print("No checkpoint found for LoRA stack")
                        return None
                m_new, c_new, v_new = load_checkpoint_models(ckpt_name, registry)
                if need_m: m = m_new
                if need_c: c = c_new
                if m is None or c is None:
                    print(f"Failed to load base model/clip from {ckpt_name}")
                    return None

            if isinstance(m, str): m = None
            if isinstance(c, str): c = None

            # Clone to prevent mutation
            m = safe_clone(m)
            c = safe_clone(c)
            v = safe_clone(v)

            # Apply LoRAs
            if m is not None and c is not None:
                stack_data = val.get("stack", [])
                for lora in stack_data:
                    lora_name = None
                    str_model = 1.0
                    str_clip = 1.0
                    if isinstance(lora, (list, tuple)) and len(lora) >= 3:
                        lora_name = lora[0]
                        str_model = float(lora[1] if lora[1] is not None else 1.0)
                        str_clip = float(lora[2] if lora[2] is not None else 1.0)
                    elif isinstance(lora, dict):
                        lora_name = lora.get("lora_name", lora.get("name"))
                        str_model = float(lora.get("strength_model", 1.0))
                        str_clip = float(lora.get("strength_clip", 1.0))
                    if not lora_name:
                        continue
                    lora_path = folder_paths.get_full_path("loras", lora_name)
                    if not lora_path:
                        continue
                    try:
                        lora_tensor = comfy.utils.load_torch_file(lora_path, safe_load=True)
                        m, c = comfy.sd.load_lora_for_models(m, c, lora_tensor, str_model, str_clip)
                    except Exception as e:
                        print(f"Failed to load Lora: {lora_name} - {e}")

                # Cache resolved tensors back into registry
                if m_id and m is not None:
                    registry[m_id] = m
                if c_id and c is not None:
                    registry[c_id] = c

                if "MODEL" in sig_type and m is not None:
                    return m
                if "CLIP" in sig_type and c is not None:
                    return c
                if "VAE" in sig_type and v is not None:
                    return v
            return None

        # Plain checkpoint name (string) or dict with ckpt_name
        filename = None
        if isinstance(val, str):
            filename = val
        elif isinstance(val, dict):
            filename = val.get("ckpt_name", val.get("vae_name"))
        if filename and filename != "None":
            m, c, v = load_checkpoint_models(filename, registry)
            if "MODEL" in sig_type and m is not None:
                return m
            if "CLIP" in sig_type and c is not None:
                return c
            if "VAE" in sig_type and v is not None:
                return v
        return None

    # Reconstruction for dimension metadata
    is_meta = isinstance(val, dict) and "width" in val and "height" in val
    constructor = next((f for k, f in RECONSTRUCTION_MAP.items() if k in sig_type), None)
    if constructor:
        w = val.get("width", 512) if is_meta else 512
        h = val.get("height", 512) if is_meta else 512
        b = val.get("batch_size", 1) if is_meta else 1
        return constructor(val, w, h, b)

    if isinstance(val, dict):
        if "samples" in val or "waveform" in val:
            return val
        if "ckpt_name" in val and sig_type in ["MODEL", "CLIP", "VAE"]:
            return process_signal_fallback(val["ckpt_name"], sig_type, registry)
        return None

    if any(x in sig_type for x in ["MODEL", "CLIP", "VAE", "IMAGE", "LATENT", "MASK", "CONDITIONING", "AUDIO"]):
        return val if not isinstance(val, str) else None

    return val