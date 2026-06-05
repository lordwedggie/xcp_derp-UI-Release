# Path: ./python/derpSignalOut.py
import json
from server import PromptServer
from aiohttp import web
from .signalDictionaryDefault import process_signal_fallback, safe_clone

class AnyType(str):
    def __eq__(self, _) -> bool: return True
    def __ne__(self, _) -> bool: return False
    def __contains__(self, _) -> bool: return True
    def __hash__(self) -> int: return hash("*")

any_type = AnyType("*")

DERP_LIVE_REGISTRY = {}

def clone_runtime_signal_value(value, sig_type=""):
    upper_type = str(sig_type or "").upper()
    if any(x in upper_type for x in ["MODEL", "CLIP", "VAE"]):
        return safe_clone(value)
    return value

@PromptServer.instance.routes.post("/xcp/purge_signal")
async def purge_signal_api(request):
    json_data = await request.json()
    node_id = str(json_data.get("node_id"))
    if node_id in DERP_LIVE_REGISTRY:
        del DERP_LIVE_REGISTRY[node_id]
    return web.json_response({"status": "ok"})

@PromptServer.instance.routes.post("/xcp/update_signal")
async def update_signal_api(request):
    json_data = await request.json()
    node_id = str(json_data.get("node_id"))
    value = json_data.get("value")
    if node_id:
        DERP_LIVE_REGISTRY[node_id] = value
    return web.json_response({"status": "ok"})

class xcpDerpSignalOut:
    INVISIBLE_CHAR = '\u200b'

    @classmethod
    def INPUT_TYPES(s):
        opts = {"signal_data": ("STRING", {"default": "", "multiline": True})}
        for i in range(16):
            opts[f"_hidden_wire_{i}"] = (any_type, {"forceInput": True})
        return {"required": {}, "optional": opts}

    RETURN_TYPES = (any_type,) * 16
    RETURN_NAMES = (INVISIBLE_CHAR,) * 16
    FUNCTION = "broadcast_signals"
    CATEGORY = "🔞 derpNodes/Management"

    def broadcast_signals(self, signal_data="", **kwargs):
        try:
            package = json.loads(signal_data) if signal_data else {}
        except Exception:
            package = {}

        signals = package.get("signals", {})
        active_ids = package.get("activeOutputIds", [])

        out_signals = []
        for i in range(16):
            if i < len(active_ids):
                node_id = str(active_ids[i])
                sig_obj = signals.get(node_id, {})
                val = sig_obj.get("value")
                raw_sig_type = sig_obj.get("type", "")
                sig_type = "COMBO" if isinstance(raw_sig_type, list) else str(raw_sig_type).upper()

                is_live = False

                # 1. Invisible wire from physical connection
                wire_key = f"_hidden_wire_{i}"
                raw_val = kwargs.get(wire_key)
                if raw_val is not None and not isinstance(raw_val, str):
                    val = clone_runtime_signal_value(raw_val, sig_type)
                    is_live = True

                # 2. Global registry fallback
                elif not is_live and node_id in DERP_LIVE_REGISTRY:
                    reg_val = DERP_LIVE_REGISTRY[node_id]
                    is_media_dict = isinstance(reg_val, dict) and ("samples" in reg_val or "waveform" in reg_val)
                    if not isinstance(reg_val, (str, dict)) or is_media_dict:
                        val = clone_runtime_signal_value(reg_val, sig_type)
                        is_live = True
                    else:
                        val = reg_val

                # 3. Reconstruction engine
                if not is_live:
                    original_val = val
                    new_val = process_signal_fallback(val, sig_type, DERP_LIVE_REGISTRY)
                    if new_val is not None and new_val is not val:
                        val = new_val
                        is_live = True
                        # Keep descriptor payloads in the live registry; do not overwrite
                        # them with resolved MODEL/CLIP objects or they will accumulate
                        # patches across later generations.
                        original_is_descriptor = isinstance(original_val, dict) or isinstance(original_val, str)
                        if val is not None and not original_is_descriptor:
                            DERP_LIVE_REGISTRY[node_id] = clone_runtime_signal_value(val, sig_type)

                # Final output guard
                is_complex = any(x in sig_type for x in ["MODEL", "CLIP", "VAE", "IMAGE", "LATENT", "MASK", "CONDITIONING", "AUDIO"])

                if is_complex:
                    is_payload = isinstance(val, dict) and any(k in val for k in ["model_name_prefix", "ckpt_name", "stack", "triggers", "diffusion_name", "text_encoder_name"])
                    is_media = isinstance(val, dict) and ("samples" in val or "waveform" in val)

                    if not is_live and not is_media:
                        # For MODEL/CLIP/VAE, if still unresolved, try to load a default model
                        if sig_type in ["MODEL", "CLIP", "VAE"]:
                            from .signalDictionaryDefault import find_first_checkpoint, load_checkpoint_models
                            descriptor = val if is_payload else None
                            resolved = process_signal_fallback(descriptor, sig_type, DERP_LIVE_REGISTRY) if descriptor is not None else None
                            if resolved is not None and not isinstance(resolved, (str, dict)):
                                val = resolved
                            else:
                                default_ckpt = find_first_checkpoint()
                                if default_ckpt:
                                    m, c, v = load_checkpoint_models(default_ckpt, DERP_LIVE_REGISTRY)
                                    if "MODEL" in sig_type and m is not None:
                                        val = m
                                    elif "CLIP" in sig_type and c is not None:
                                        val = c
                                    elif "VAE" in sig_type and v is not None:
                                        val = v
                                    else:
                                        val = None
                                else:
                                    val = None
                        else:
                            val = None

                    if is_complex and isinstance(val, dict) and any(k in val for k in ["model_name_prefix", "ckpt_name", "stack", "triggers", "diffusion_name", "text_encoder_name"]):
                        val = None
                else:
                    if val is None:
                        val = ""
                    elif isinstance(val, (list, dict)):
                        try:
                            val = json.dumps(val)
                        except:
                            pass

                if is_complex and val is not None:
                    val = clone_runtime_signal_value(val, sig_type)

                out_signals.append(val)
            else:
                out_signals.append(None)

        return tuple(out_signals)

class xcpDerpSignalSender:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {"any_input": (any_type, {})},
            "hidden": {"node_id": "UNIQUE_ID"}
        }
    RETURN_TYPES = (any_type,)
    FUNCTION = "transmit"
    CATEGORY = "🔞 derpNodes/Management"

    def transmit(self, any_input, node_id):
        DERP_LIVE_REGISTRY[str(node_id)] = any_input
        return (any_input,)

NODE_CLASS_MAPPINGS = {
    "xcpDerpSignalOut": xcpDerpSignalOut,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "xcpDerpSignalOut": "Derp Router",
}
