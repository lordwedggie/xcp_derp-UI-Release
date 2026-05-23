/**
 * Path: ./js/fatha/core/masterSettings.js
 * ROLE: Standalone registry for Derp ecosystem global settings.
 */
import { app } from "../../../scripts/app.js";
import { applyDerpBackgroundImage, hydrateDerpBackgroundSetting } from "./fatha/core/fathaHandler.js";

const HOTKEY_SETTINGS = [];
const DERP_CATEGORY = "Derp";
function makeDerpCategory(group, leaf) {
    return [DERP_CATEGORY, group, leaf];
}
const DERP_GROUPS = {
    general: (leaf) => makeDerpCategory("General", leaf),
    docking: (leaf) => makeDerpCategory("Docking", leaf),
    sound: (leaf) => makeDerpCategory("Sound", leaf),
    debugging: (leaf) => makeDerpCategory("Debugging", leaf),
    hotkeys: (leaf) => makeDerpCategory("Hotkeys", leaf)
};
const DERP_GROUP_SORT_ORDER = {
    general: 400,
    docking: 300,
    sound: 200,
    debugging: 150,
    hotkeys: 100,
};

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

function registerHotkeySetting({ id, name, defaultValue, onValue, category, sortOrder }) {
    HOTKEY_SETTINGS.push({ id, name, defaultValue, onValue });

    app.ui.settings.addSetting({
        id,
        name,
        category,
        sortOrder,
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

function normalizeBooleanSetting(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(v)) return true;
        if (["false", "0", "no", "off"].includes(v)) return false;
    }
    return fallback;
}

app.registerExtension({
    name: "xcp.DerpSettings",
    init() {
        installHotkeyCapture();

        // REGISTER GLOBAL SETTINGS IN THE COMFYUI MENU
        app.ui.settings.addSetting({
            id: "Derp.PlaySound",
            name: "Derp Nodes: Play Sound",
            category: DERP_GROUPS.sound("Play Sound"),
            sortOrder: DERP_GROUP_SORT_ORDER.sound,
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
            category: DERP_GROUPS.general("Use Animation"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,
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

        app.ui.settings.addSetting({
            id: "Derp.CloseSysPanelOnOutsideClick",
            name: "Derp Nodes: Close System Panel On Outside Click",
            category: DERP_GROUPS.general("Close System Panel On Outside Click"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.closeSysPanelOnOutsideClick = normalizeBooleanSetting(v, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.BackgroundImage",
            name: "Derp Nodes: Background Image",
            category: DERP_GROUPS.general("Background Image"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,
            type: "combo",
            options: [{ value: "none", text: "None" }],
            default: "none",
            onChange: (v) => {
                const value = String(v || "none").trim() || "none";
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.backgroundImage = value;
                applyDerpBackgroundImage(value);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.VerticalDockHeaderCollapse",
            name: "Header Collapse: Clicking on node header to toggle collapsing state of the node.",
            category: DERP_GROUPS.docking("Header Collapse Toggle"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.verticalDockHeaderCollapse = normalizeBooleanSetting(v, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.SyncedCollapse",
            name: "Synced Collapse: Horizontal docked stacks will collapse/un-collapse together.",
            category: DERP_GROUPS.docking("Synced Collapse"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.syncedCollapse = normalizeBooleanSetting(v, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.VerticalPinnedCollapseUpward",
            name: "Anchored node in a vertically docked stack collapses upwards",
            category: DERP_GROUPS.docking("Anchored Vertical Collapse Direction"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.verticalPinnedCollapseUpward = normalizeBooleanSetting(v, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        registerHotkeySetting({
            id: "Derp.PerfOverlayHotkey",
            name: "Derp Nodes: Perf Overlay Hotkey",
            defaultValue: "Alt+Shift+P",
            category: DERP_GROUPS.hotkeys("Perf Overlay Hotkey"),
            sortOrder: DERP_GROUP_SORT_ORDER.hotkeys,
            onValue: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.perfOverlayHotkey = normalizeHotkeyString(v, "Alt+Shift+P");
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.SystemBypassSoundIndex",
            name: "Derp Nodes: Bypass Sound Variant (0-4)",
            category: DERP_GROUPS.sound("Bypass Sound Variant"),
            sortOrder: DERP_GROUP_SORT_ORDER.sound,
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
            category: DERP_GROUPS.sound("Collapse Sound Variant"),
            sortOrder: DERP_GROUP_SORT_ORDER.sound,
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
            category: DERP_GROUPS.sound("Dock Sound Variant"),
            sortOrder: DERP_GROUP_SORT_ORDER.sound,
            type: "number",
            default: 0,
            attrs: { min: 0, max: 4, step: 1 },
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.systemDockSoundIndex = normalizeVariantIndex(v, 0);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.PerfOverlayFontSize",
            name: "Perf Overlay: Font Size",
            category: DERP_GROUPS.debugging("Perf Overlay Font Size"),
            sortOrder: DERP_GROUP_SORT_ORDER.debugging,
            type: "number",
            default: 12,
            attrs: { min: 9, max: 24, step: 1 },
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                const n = Number(v);
                window.DERP_GLOBAL_SETTINGS.perfOverlayFontSize = Number.isFinite(n) ? Math.max(9, Math.min(24, Math.floor(n))) : 12;
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.PerfOverlayShowRanking",
            name: "Perf Overlay: Show Ranking",
            category: DERP_GROUPS.debugging("Perf Overlay Ranking"),
            sortOrder: DERP_GROUP_SORT_ORDER.debugging,
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.perfOverlayShowRanking = normalizeBooleanSetting(v, true);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        // Initialize global object for immediate access by nodes
        window.DERP_GLOBAL_SETTINGS = {
            playSound: app.ui.settings.getSettingValue("Derp.PlaySound", true),
            useAnimation: app.ui.settings.getSettingValue("Derp.UseAnimation", true),
            closeSysPanelOnOutsideClick: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.CloseSysPanelOnOutsideClick", true), true),
            backgroundImage: String(app.ui.settings.getSettingValue("Derp.BackgroundImage", "none") || "none"),
            verticalDockHeaderCollapse: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.VerticalDockHeaderCollapse", true), true),
            syncedCollapse: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.SyncedCollapse", true), true),
            perfOverlayHotkey: normalizeHotkeyString(app.ui.settings.getSettingValue("Derp.PerfOverlayHotkey", "Alt+Shift+P"), "Alt+Shift+P"),
            systemBypassSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemBypassSoundIndex", 0), 0),
            systemCollapseSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemCollapseSoundIndex", 0), 0),
            systemDockSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemDockSoundIndex", 0), 0),
            perfOverlayFontSize: Number(app.ui.settings.getSettingValue("Derp.PerfOverlayFontSize", 12)) || 12,
            perfOverlayShowRanking: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.PerfOverlayShowRanking", true), true)
        };

        hydrateDerpBackgroundSetting().then((options) => {
            const registry = app.ui?.settings?.settingsLookup;
            const setting = registry?.["Derp.BackgroundImage"];
            if (setting && Array.isArray(options) && options.length) {
                setting.options = options;
            }
            applyDerpBackgroundImage(window.DERP_GLOBAL_SETTINGS.backgroundImage);
        });
    }
});
