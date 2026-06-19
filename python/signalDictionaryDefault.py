# Path: ./python/signalDictionaryDefault.py
import torch
import os
import numpy as np
import glob
from PIL import Image, ImageOps
import folder_paths
import comfy.lora
import comfy.model_base
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

def normalize_weight_dtype(weight_dtype):
    if weight_dtype in [None, "", "default", "auto", "Auto"]:
        return {}
    if not isinstance(weight_dtype, str):
        return {}
    if weight_dtype == "fp8_e4m3fn" and hasattr(torch, "float8_e4m3fn"):
        return {"dtype": torch.float8_e4m3fn}
    if weight_dtype == "fp8_e4m3fn_fast" and hasattr(torch, "float8_e4m3fn"):
        return {"dtype": torch.float8_e4m3fn, "fp8_optimizations": True}
    if weight_dtype == "fp8_e5m2" and hasattr(torch, "float8_e5m2"):
        return {"dtype": torch.float8_e5m2}
    legacy_dtype_map = {
        "bf16": torch.bfloat16,
        "fp16": torch.float16,
        "fp32": torch.float32,
    }
    dtype = legacy_dtype_map.get(weight_dtype)
    return {"dtype": dtype} if dtype is not None else {}

def find_full_path_from_categories(filename, *categories):
    if not filename:
        return None
    for category in categories:
        try:
            path = folder_paths.get_full_path(category, filename)
        except Exception:
            path = None
        if path:
            return path
    return None

def normalize_clip_type(clip_type):
    if not isinstance(clip_type, str) or not clip_type:
        return comfy.sd.CLIPType.STABLE_DIFFUSION
    clip_key = clip_type.upper().replace("-", "_")
    clip_type_aliases = {
        "ZIT": ["Z_IMAGE", "ZIMAGE", "ZIT"],
        "Z_IMAGE": ["Z_IMAGE", "ZIMAGE", "ZIT"],
        "ZIMAGE": ["Z_IMAGE", "ZIMAGE", "ZIT"],
    }
    for candidate in clip_type_aliases.get(clip_key, [clip_key]):
        resolved = getattr(comfy.sd.CLIPType, candidate, None)
        if resolved is not None:
            return resolved
    return comfy.sd.CLIPType.STABLE_DIFFUSION

def resolve_clip_type(text_encoder_name=None, clip_type=None):
    lower_name = str(text_encoder_name or "").lower()
    lower_type = str(clip_type or "").lower()
    if "qwen_3_4b" in lower_name or "qwen3_4b" in lower_name or "qwen-3-4b" in lower_name or "qwen3-4b" in lower_name:
        if clip_type in ["flux", "flux2"]:
            return clip_type
        return "stable_diffusion"
    if isinstance(clip_type, str) and clip_type not in ["", "default", "auto", "stable_diffusion"]:
        return clip_type
    if any(token in lower_name for token in ["z_image", "z-image", "zimage", "zit"]):
        return "z_image"
    if any(token in lower_type for token in ["z_image", "z-image", "zimage", "zit"]):
        return "z_image"
    if "qwen" in lower_name:
        return "qwen_image"
    return "stable_diffusion"

def build_clip_model_options(clip_device=None):
    model_options = {}
    if clip_device == "cpu":
        model_options["load_device"] = model_options["offload_device"] = torch.device("cpu")
    return model_options

def load_clip_model(text_encoder_name, registry, clip_type=None, clip_device=None):
    if not text_encoder_name:
        return None
    effective_clip_type = resolve_clip_type(text_encoder_name, clip_type)
    cache_key = f"CLIP:{text_encoder_name}|TYPE:{effective_clip_type}|DEVICE:{clip_device or 'default'}"
    cached = registry.get(cache_key)
    if cached is not None:
        return safe_clone(cached)

    text_encoder_path = find_full_path_from_categories(text_encoder_name, "text_encoders")
    if not text_encoder_path:
        raise FileNotFoundError(f"Derp CLIP Loader could not find text encoder: {text_encoder_name}")

    clip = comfy.sd.load_clip(
        ckpt_paths=[text_encoder_path],
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
        clip_type=normalize_clip_type(effective_clip_type),
        model_options=build_clip_model_options(clip_device)
    )
    registry[cache_key] = clip
    return safe_clone(clip)

def load_diffusion_model(diffusion_name, registry, weight_dtype=None):
    if not diffusion_name:
        return None
    cache_key = f"DIFFUSION:{diffusion_name}|DTYPE:{weight_dtype or 'auto'}"
    cached = registry.get(cache_key)
    if cached is not None:
        return safe_clone(cached)

    diffusion_path = find_full_path_from_categories(diffusion_name, "diffusion_models", "unet")
    if not diffusion_path:
        raise FileNotFoundError(f"Derp Diffusion Loader could not find diffusion model: {diffusion_name}")

    model_options = {}
    model_options.update(normalize_weight_dtype(weight_dtype))
    model = comfy.sd.load_diffusion_model(diffusion_path, model_options=model_options)
    registry[cache_key] = model
    return safe_clone(model)

def load_diffusion_and_clip(diffusion_name, text_encoder_name, registry, weight_dtype=None, clip_type=None, clip_device=None):
    if not diffusion_name or not text_encoder_name:
        return None, None
    effective_clip_type = resolve_clip_type(text_encoder_name, clip_type)
    cache_key = f"DIFFUSION:{diffusion_name}|CLIP:{text_encoder_name}|DTYPE:{weight_dtype or 'auto'}|CLIPTYPE:{effective_clip_type}|CLIPDEVICE:{clip_device or 'default'}"
    cached = registry.get(cache_key)
    if cached is not None:
        model, clip = cached
        return safe_clone(model), safe_clone(clip)

    diffusion_path = find_full_path_from_categories(diffusion_name, "diffusion_models", "unet")
    text_encoder_path = find_full_path_from_categories(text_encoder_name, "text_encoders")
    if not diffusion_path:
        raise FileNotFoundError(f"Derp Diffusion Loader could not find diffusion model: {diffusion_name}")
    if not text_encoder_path:
        raise FileNotFoundError(f"Derp CLIP Loader could not find text encoder: {text_encoder_name}")

    model_options = {}
    model_options.update(normalize_weight_dtype(weight_dtype))

    model = comfy.sd.load_diffusion_model(diffusion_path, model_options=model_options)
    clip = comfy.sd.load_clip(
        ckpt_paths=[text_encoder_path],
        embedding_directory=folder_paths.get_folder_paths("embeddings"),
        clip_type=normalize_clip_type(effective_clip_type),
        model_options=build_clip_model_options(clip_device)
    )
    registry[cache_key] = (model, clip)
    return safe_clone(model), safe_clone(clip)

def is_joint_attention_lora_entry(lora):
    return isinstance(lora, dict) and "fuse_qkv" in lora

def build_lumina2_key_map(model):
    key_map = {}

    if isinstance(getattr(model, "model", None), comfy.model_base.Lumina2):
        try:
            diffusers_keys = comfy.utils.z_image_to_diffusers(
                model.model.model_config.unet_config,
                output_prefix="diffusion_model.",
            )
            for k, target in diffusers_keys.items():
                if not k.endswith(".weight"):
                    continue
                lora_key = k[:-len(".weight")]
                key_map[f"diffusion_model.{lora_key}"] = target
                key_map[f"transformer.{lora_key}"] = target
                key_map[f"lycoris_{lora_key.replace('.', '_')}"] = target
                key_map[lora_key] = target
            return key_map
        except Exception as e:
            print(f"Lumina2 key map fallback: {e}")

    for model_key in model.model.state_dict().keys():
        if model_key.startswith("diffusion_model.") and model_key.endswith(".weight"):
            base = model_key[len("diffusion_model."):-len(".weight")]
            key_map[base] = model_key
            key_map[f"diffusion_model.{base}"] = model_key
            key_map[f"transformer.{base}"] = model_key
    return key_map

def lora_has_separate_qkv(lora_sd):
    return any(
        ".to_q.lora_A" in k or ".to_k.lora_A" in k or ".to_v.lora_A" in k
        for k in lora_sd
    )

def convert_lora_to_lumina2_qkv(lora_sd, model):
    n_layers = getattr(model.model.model_config.unet_config, "n_layers", 30)
    converted = {}
    processed = set()

    for layer_idx in range(n_layers):
        for prefix in ("diffusion_model.", "transformer.", ""):
            base = f"{prefix}layers.{layer_idx}.attention"

            qkv_parts = {}
            for component in ("to_q", "to_k", "to_v"):
                down_key = f"{base}.{component}.lora_A.weight"
                up_key = f"{base}.{component}.lora_B.weight"
                if down_key in lora_sd and up_key in lora_sd:
                    qkv_parts[component] = (lora_sd[down_key], lora_sd[up_key])

            if len(qkv_parts) == 3:
                q_down, q_up = qkv_parts["to_q"]
                k_down, k_up = qkv_parts["to_k"]
                v_down, v_up = qkv_parts["to_v"]

                converted[f"{base}.qkv.lora_A.weight"] = torch.cat([q_down, k_down, v_down], dim=0)
                converted[f"{base}.qkv.lora_B.weight"] = torch.cat([q_up, k_up, v_up], dim=0)

                alphas = []
                for component in ("to_q", "to_k", "to_v"):
                    alpha_key = f"{base}.{component}.alpha"
                    if alpha_key in lora_sd:
                        alphas.append(lora_sd[alpha_key])
                        processed.add(alpha_key)
                if len(alphas) == 3:
                    converted[f"{base}.qkv.alpha"] = sum(alphas) / 3.0

                for component in ("to_q", "to_k", "to_v"):
                    processed.add(f"{base}.{component}.lora_A.weight")
                    processed.add(f"{base}.{component}.lora_B.weight")

                break

            out_down_key = f"{base}.to_out.0.lora_A.weight"
            out_up_key = f"{base}.to_out.0.lora_B.weight"
            if out_down_key in lora_sd and out_up_key in lora_sd:
                converted[f"{base}.out.lora_A.weight"] = lora_sd[out_down_key]
                converted[f"{base}.out.lora_B.weight"] = lora_sd[out_up_key]
                processed.update([out_down_key, out_up_key])

                out_alpha_key = f"{base}.to_out.0.alpha"
                if out_alpha_key in lora_sd:
                    converted[f"{base}.out.alpha"] = lora_sd[out_alpha_key]
                    processed.add(out_alpha_key)

                break

    for key, value in lora_sd.items():
        if key not in processed:
            converted[key] = value
    return converted

def apply_joint_attention_lora_stack(model, stack_data):
    if model is None:
        return None

    current = safe_clone(model)
    key_map = build_lumina2_key_map(current)

    for lora in stack_data:
        if not is_joint_attention_lora_entry(lora):
            continue

        lora_name = lora.get("lora_name", lora.get("name"))
        if not lora_name:
            continue

        strength_model = float(lora.get("strength_model", 1.0))
        if strength_model == 0:
            continue

        lora_path = folder_paths.get_full_path("loras", lora_name)
        if not lora_path:
            continue

        try:
            lora_sd = comfy.utils.load_torch_file(lora_path, safe_load=True)
            if lora.get("fuse_qkv", True) and lora_has_separate_qkv(lora_sd):
                lora_sd = convert_lora_to_lumina2_qkv(lora_sd, current)
            patch_dict = comfy.lora.load_lora(lora_sd, key_map, log_missing=False)
            next_model = current.clone()
            next_model.add_patches(patch_dict, strength_patch=strength_model, strength_model=1.0)
            current = next_model
        except Exception as e:
            print(f"Failed to load joint-attention Lora: {lora_name} - {e}")

    return current

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
            stack_data = val.get("stack", [])
            joint_stack = [l for l in stack_data if is_joint_attention_lora_entry(l)]
            regular_stack = [l for l in stack_data if not is_joint_attention_lora_entry(l)]
            needs_clip_for_stack = bool(regular_stack) or ("CLIP" in sig_type)

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
            if needs_clip_for_stack and (c is None or isinstance(c, (str, dict))):
                c = process_signal_fallback(registry.get(c_id) if c_id else None, "CLIP", registry) if c_id else None

            need_m = m is None or isinstance(m, (str, dict))
            need_c = needs_clip_for_stack and (c is None or isinstance(c, (str, dict)))

            if need_m or need_c:
                m_fallback = val.get("model_fallback")
                c_fallback = val.get("clip_fallback")
                if need_m and m_fallback is not None:
                    m = process_signal_fallback(m_fallback, "MODEL", registry)
                if need_c and c_fallback is not None:
                    c = process_signal_fallback(c_fallback, "CLIP", registry)

                still_need_m = m is None or isinstance(m, (str, dict))
                still_need_c = need_c and (c is None or isinstance(c, (str, dict)))

                if still_need_m or still_need_c:
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
                    if still_need_m:
                        m = m_new
                    if still_need_c:
                        c = c_new

                if m is None or isinstance(m, (str, dict)):
                    print("Failed to resolve base model for LoRA stack")
                    return None
                if need_c and (c is None or isinstance(c, (str, dict))):
                    print("Failed to resolve base clip for LoRA stack")
                    return None

            if isinstance(m, str): m = None
            if isinstance(c, str): c = None

            # Clone to prevent mutation
            m = safe_clone(m)
            c = safe_clone(c)
            v = safe_clone(v)

            if joint_stack and m is not None:
                m = apply_joint_attention_lora_stack(m, joint_stack)

            if regular_stack and m is not None and c is not None:
                for lora in regular_stack:
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

            if "MODEL" in sig_type and m is not None:
                return m
            if "CLIP" in sig_type and c is not None:
                return c
            if "VAE" in sig_type and v is not None:
                return v
            return None

        # Diffusion-family payload
        if isinstance(val, dict) and (val.get("diffusion_name") or val.get("text_encoder_name")):
            if "MODEL" in sig_type and val.get("diffusion_name"):
                return load_diffusion_model(
                    val.get("diffusion_name"),
                    registry,
                    val.get("weight_dtype")
                )
            if "CLIP" in sig_type and val.get("text_encoder_name"):
                return load_clip_model(
                    val.get("text_encoder_name"),
                    registry,
                    val.get("clip_type"),
                    val.get("clip_device")
                )
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
