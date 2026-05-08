/**
 * Path: ./js/fatha/core/masterSettings.js
 * ROLE: Standalone registry for Derp ecosystem global settings.
 */
import { app } from "../../../scripts/app.js";

const HOTKEY_SETTINGS = [];

function normalizeHotkeyString(value, fallback = "") {
    const raw = String(value || "").trim();
    return raw || fallback;
}

function formatHotkeyFromEvent(event) {
    const key = String(event.key || "").trim();
    if (!key) return "";

    const lower = key.toLowerCase();
    if (["control", "shift", "alt", "meta"].includes(lower)) return "";

    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");

    let mainKey = key.length === 1 ? key.toUpperCase() : key;
    if (lower === " ") mainKey = "Space";
    if (lower === "escape") mainKey = "Escape";

    parts.push(mainKey);
    return parts.join("+");
}

function matchesSettingContainer(el, setting) {
    let cur = el;
    for (let i = 0; cur && i < 6; i++, cur = cur.parentElement) {
        const text = String(cur.textContent || "").replace(/\s+/g, " ").trim();
        if (text.includes(setting.name)) return true;
        if (cur.getAttribute?.("data-setting-id") === setting.id) return true;
    }
    return false;
}

function getHotkeySettingForInput(el) {
    if (!el || el.tagName !== "INPUT") return null;
    if ((el.type || "text").toLowerCase() !== "text") return null;

    if (el.dataset.xcpHotkeySettingId) {
        return HOTKEY_SETTINGS.find(setting => setting.id === el.dataset.xcpHotkeySettingId) || null;
    }

    const matched = HOTKEY_SETTINGS.find(setting => matchesSettingContainer(el, setting));
    if (matched) el.dataset.xcpHotkeySettingId = matched.id;
    return matched || null;
}

function syncHotkeySetting(setting, value, input) {
    const normalized = normalizeHotkeyString(value, setting.defaultValue);
    if (input) input.value = normalized;
    if (app.ui?.settings?.setSettingValue) app.ui.settings.setSettingValue(setting.id, normalized);
    setting.onValue(normalized);
}

function installHotkeyCapture() {
    if (window.__xcpHotkeyCaptureInstalled) return;
    window.__xcpHotkeyCaptureInstalled = true;

    document.addEventListener("focusin", (event) => {
        const input = event.target;
        const setting = getHotkeySettingForInput(input);
        if (!setting) return;

        input.autocomplete = "off";
        input.spellcheck = false;
        input.title = "Press a key combination to capture it. Backspace clears. Escape restores the current value.";
        requestAnimationFrame(() => input.select?.());
    }, true);

    document.addEventListener("keydown", (event) => {
        const input = event.target;
        const setting = getHotkeySettingForInput(input);
        if (!setting) return;

        if (event.key === "Tab") return;

        event.preventDefault();
        event.stopPropagation();

        if (event.key === "Escape") {
            const current = app.ui?.settings?.getSettingValue?.(setting.id, setting.defaultValue) || setting.defaultValue;
            input.value = normalizeHotkeyString(current, setting.defaultValue);
            return;
        }

        if (event.key === "Backspace" || event.key === "Delete") {
            syncHotkeySetting(setting, "", input);
            return;
        }

        const combo = formatHotkeyFromEvent(event);
        if (!combo) return;
        syncHotkeySetting(setting, combo, input);
    }, true);
}

function registerHotkeySetting({ id, name, defaultValue, onValue }) {
    HOTKEY_SETTINGS.push({ id, name, defaultValue, onValue });

    app.ui.settings.addSetting({
        id,
        name,
        type: "text",
        default: defaultValue,
        onChange: (v) => onValue(normalizeHotkeyString(v, defaultValue))
    });
}

function normalizeVariantIndex(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(4, Math.floor(n)));
}

app.registerExtension({
    name: "xcp.DerpSettings",
    init() {
        installHotkeyCapture();

        // REGISTER GLOBAL SETTINGS IN THE COMFYUI MENU
        app.ui.settings.addSetting({
            id: "Derp.PlaySound",
            name: "Derp Nodes: Play Sound",
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.playSound = v;
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.UseAnimation",
            name: "Derp Nodes: Use Animation",
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.useAnimation = v;

                // THE WORKFLOW SYNC: Update all existing nodes to match the global setting
                if (app.graph && app.graph._nodes) {
                    app.graph._nodes.forEach(node => {
                        if (node.isFathaNode || node.isUncleNode) {
                            node.properties.useAnimations = v;
                        }
                    });
                }

                // THE BASTA SYNC: Update all active floating panels
                if (window.xcpActiveBastas) {
                    window.xcpActiveBastas.forEach(basta => {
                        basta.properties.useAnimations = v;
                    });
                }

                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        registerHotkeySetting({
            id: "Derp.PerfOverlayHotkey",
            name: "Derp Nodes: Perf Overlay Hotkey",
            defaultValue: "Alt+Shift+P",
            onValue: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.perfOverlayHotkey = normalizeHotkeyString(v, "Alt+Shift+P");
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.SystemBypassSoundIndex",
            name: "Derp Nodes: Bypass Sound Variant (0-4)",
            type: "number",
            default: 0,
            attrs: { min: 0, max: 4, step: 1 },
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.systemBypassSoundIndex = normalizeVariantIndex(v, 0);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.SystemCollapseSoundIndex",
            name: "Derp Nodes: Collapse Sound Variant (0-4)",
            type: "number",
            default: 0,
            attrs: { min: 0, max: 4, step: 1 },
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.systemCollapseSoundIndex = normalizeVariantIndex(v, 0);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.SystemDockSoundIndex",
            name: "Derp Nodes: Dock Sound Variant (0-4)",
            type: "number",
            default: 0,
            attrs: { min: 0, max: 4, step: 1 },
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.systemDockSoundIndex = normalizeVariantIndex(v, 0);
            }
        });

        // Initialize global object for immediate access by nodes
        window.DERP_GLOBAL_SETTINGS = {
            playSound: app.ui.settings.getSettingValue("Derp.PlaySound", true),
            useAnimation: app.ui.settings.getSettingValue("Derp.UseAnimation", true),
            perfOverlayHotkey: normalizeHotkeyString(app.ui.settings.getSettingValue("Derp.PerfOverlayHotkey", "Alt+Shift+P"), "Alt+Shift+P"),
            systemBypassSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemBypassSoundIndex", 0), 0),
            systemCollapseSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemCollapseSoundIndex", 0), 0),
            systemDockSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemDockSoundIndex", 0), 0)
        };
    }
});
