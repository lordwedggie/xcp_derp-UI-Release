/**
 * Path: ./js/fatha/core/masterSettings.js
 * ROLE: Standalone registry for Derp ecosystem global settings.
 */
import { app } from "../../../scripts/app.js";
import { applyDerpBackgroundImage, hydrateDerpBackgroundSetting } from "./fatha/core/fathaHandler.js";

// --- WARP SPEED SETTING ---
// Warp 5 = current default (1.0). Each level compounds by 20%.
// Warp 1 is slowest, Warp 9 is fastest.
const _WARP_SPEED_BASE = 1.0; // Warp 5
const _WARP_SPEED_MULTIPLIER = 1.2;
const _WARP_SPEEDS = {};
for (let i = 1; i <= 9; i++) {
    _WARP_SPEEDS[i] = _WARP_SPEED_BASE * Math.pow(_WARP_SPEED_MULTIPLIER, i - 5);
}
export function getWarpTravelSpeed() {
    const level = (window.DERP_GLOBAL_SETTINGS && Number.isFinite(window.DERP_GLOBAL_SETTINGS.warpSpeedLevel))
        ? Math.max(1, Math.min(9, Math.round(window.DERP_GLOBAL_SETTINGS.warpSpeedLevel)))
        : 5;
    return _WARP_SPEEDS[level] || 1.0;
}

const HOTKEY_SETTINGS = [];
const CANVAS_PALETTE_SETTING_ID = "Derp.CanvasPalette";
const DERP_DEFAULT_SELECTION = "_default";
const CANVAS_PALETTE_NONE = "none";
const DERP_CATEGORY = "Derp";
function makeDerpCategory(group, leaf) {
    return [DERP_CATEGORY, group, leaf];
}
const DERP_GROUPS = {
    general: (leaf) => makeDerpCategory("General", leaf),
    ui: (leaf) => makeDerpCategory("User Interface", leaf),
    docking: (leaf) => makeDerpCategory("Docking", leaf),
    sound: (leaf) => makeDerpCategory("Sound", leaf),
    debugging: (leaf) => makeDerpCategory("Debugging", leaf),
    hotkeys: (leaf) => makeDerpCategory("Hotkeys", leaf)
};
const DERP_GROUP_SORT_ORDER = {
    general: 400,
    ui: 350,
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

async function fetchDerpList(category) {
    const response = await fetch(`/xcp/list/${encodeURIComponent(category)}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`Unable to list ${category}.`);
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
}

function makeComboOptions(items, firstOption = null) {
    const options = items.map((item) => ({ value: item, text: item }));
    return firstOption ? [firstOption, ...options] : options;
}

function getComfySettingStore() {
    const workspace = app.extensionManager?.stores?.workspace;
    return workspace?.setting || null;
}

function getComfyColorPaletteService() {
    const workspace = app.extensionManager?.stores?.workspace;
    return workspace?.colorPalette || null;
}

async function getComfySettingValue(id, fallback) {
    const store = getComfySettingStore();
    if (store?.get) {
        const value = store.get(id);
        if (value !== undefined) return value;
    }
    return app.ui?.settings?.getSettingValue?.(id, fallback) ?? fallback;
}

async function setComfySettingValue(id, value) {
    const store = getComfySettingStore();
    if (store?.set) {
        await store.set(id, value);
        return;
    }
    if (app.ui?.settings?.setSettingValue) {
        app.ui.settings.setSettingValue(id, value);
    }
}

async function applyDerpCanvasPalette(paletteName) {
    const name = String(paletteName || CANVAS_PALETTE_NONE).trim() || CANVAS_PALETTE_NONE;
    window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
    window.DERP_GLOBAL_SETTINGS.canvasPalette = name;
    if (name === CANVAS_PALETTE_NONE) return;

    const response = await fetch(`/xcp/load/canvasPalette?name=${encodeURIComponent(name)}&t=${Date.now()}`);
    if (!response.ok) throw new Error(`Canvas palette ${name} not found.`);
    const result = await response.json();
    const palette = result.data;
    const paletteId = String(palette?.id || "").trim();
    if (!paletteId) throw new Error(`Canvas palette ${name} is missing an id.`);

    const colorPaletteService = getComfyColorPaletteService();
    if (colorPaletteService?.addCustomColorPalette && colorPaletteService?.loadColorPalette) {
        try {
            await colorPaletteService.addCustomColorPalette(palette);
        } catch (err) {
            const message = String(err?.message || err || "");
            if (!message.toLowerCase().includes("already exists")) throw err;
        }
        await colorPaletteService.loadColorPalette(paletteId);
        await setComfySettingValue("Comfy.ColorPalette", paletteId);
        if (app.canvas) app.canvas.setDirty(true, true);
        return;
    }

    const currentPalettes = await getComfySettingValue("Comfy.CustomColorPalettes", {});
    const nextPalettes = { ...(currentPalettes && typeof currentPalettes === "object" ? currentPalettes : {}) };
    nextPalettes[paletteId] = palette;

    await setComfySettingValue("Comfy.CustomColorPalettes", nextPalettes);
    await setComfySettingValue("Comfy.ColorPalette", paletteId);
    if (app.canvas) app.canvas.setDirty(true, true);
}

async function hydrateDerpCanvasPaletteSetting() {
    const items = await fetchDerpList("canvasPalette");
    return makeComboOptions(items.sort(), { value: CANVAS_PALETTE_NONE, text: "None" });
}

app.registerExtension({
    name: "xcp.DerpSettings",
    init() {
        installHotkeyCapture();

        // REGISTER GLOBAL SETTINGS IN THE COMFYUI MENU
        app.ui.settings.addSetting({
            id: "Derp.StickyDrag",
            name: "stickyDrag: Enable Derp Sticky Drag, click and hold on a node to move it.",
            category: DERP_GROUPS.ui("Sticky Drag"),
            sortOrder: DERP_GROUP_SORT_ORDER.ui,
            type: "boolean",
            default: false,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.stickyDrag = normalizeBooleanSetting(v, false);

                // THE WORKFLOW SYNC: Update all existing nodes to match the global setting
                if (app.graph && app.graph._nodes) {
                    app.graph._nodes.forEach(node => {
                        if (node.isFathaNode || node.isUncleNode) {
                            node.properties.stickyDrag = normalizeBooleanSetting(v, false);
                        }
                    });
                }

                // THE BASTA SYNC: Update all active floating panels
                if (window.xcpActiveBastas) {
                    window.xcpActiveBastas.forEach(basta => {
                        basta.properties.stickyDrag = normalizeBooleanSetting(v, false);
                    });
                }

                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.PlaySound",
            name: "Play Sound",
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
            name: "Use Animation",
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
            name: "Close System Panel On Outside Click",
            category: DERP_GROUPS.ui("Close System Panel On Outside Click"),
            sortOrder: DERP_GROUP_SORT_ORDER.ui,

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
            name: "Background Image",
            category: DERP_GROUPS.general("Background Image"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,

            type: "combo",
            options: [{ value: "none", text: "None" }],
            default: DERP_DEFAULT_SELECTION,
            onChange: (v) => {
                const value = String(v || DERP_DEFAULT_SELECTION).trim() || DERP_DEFAULT_SELECTION;
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.backgroundImage = value;
                applyDerpBackgroundImage(value);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: CANVAS_PALETTE_SETTING_ID,
            name: "Canvas Color Palette",
            category: DERP_GROUPS.general("Canvas Color Palette"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,
            type: "combo",
            options: [{ value: CANVAS_PALETTE_NONE, text: "None" }],
            default: DERP_DEFAULT_SELECTION,
            onChange: (v) => {
                applyDerpCanvasPalette(v).catch((err) => console.error("[xcpDerp] Canvas palette load failed:", err));
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
            name: "Perf Overlay Hotkey",
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
            name: "Bypass Sound Variant (0-4)",
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
            name: "Collapse Sound Variant (0-4)",
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
            name: "Dock Sound Variant (0-4)",
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
            name: "Perf overlay shows the top slowests derp Nodes",
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

        app.ui.settings.addSetting({
            id: "Derp.PerfOverlayShowZOrder",
            name: "Perf overlay shows Derp z-order diagnostics",
            category: DERP_GROUPS.debugging("Perf Overlay Z-Order"),
            sortOrder: DERP_GROUP_SORT_ORDER.debugging,
            type: "boolean",
            default: false,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.perfOverlayShowZOrder = normalizeBooleanSetting(v, false);
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.WarpSpeedLevel",
            name: "Warp speed when panning canvas to a warp point",
            category: DERP_GROUPS.ui("Warp Speed"),
            sortOrder: DERP_GROUP_SORT_ORDER.ui,
            type: "combo",
            options: [
                { value: 1, text: "Warp 1 (slowest)" },
                { value: 2, text: "Warp 2" },
                { value: 3, text: "Warp 3" },
                { value: 4, text: "Warp 4" },
                { value: 5, text: "Warp 5 (default)" },
                { value: 6, text: "Warp 6" },
                { value: 7, text: "Warp 7" },
                { value: 8, text: "Warp 8" },
                { value: 9, text: "Warp 9 (fastest)" }
            ],
            default: 5,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                const n = Number(v);
                window.DERP_GLOBAL_SETTINGS.warpSpeedLevel = Number.isFinite(n) ? Math.max(1, Math.min(9, Math.round(n))) : 5;
            }
        });

        // Initialize global object for immediate access by nodes
        window.DERP_GLOBAL_SETTINGS = {
            stickyDrag: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.StickyDrag", false), false),
            playSound: app.ui.settings.getSettingValue("Derp.PlaySound", true),
            useAnimation: app.ui.settings.getSettingValue("Derp.UseAnimation", true),
            closeSysPanelOnOutsideClick: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.CloseSysPanelOnOutsideClick", true), true),
            backgroundImage: String(app.ui.settings.getSettingValue("Derp.BackgroundImage", DERP_DEFAULT_SELECTION) || DERP_DEFAULT_SELECTION),
            canvasPalette: String(app.ui.settings.getSettingValue(CANVAS_PALETTE_SETTING_ID, DERP_DEFAULT_SELECTION) || DERP_DEFAULT_SELECTION),
            verticalDockHeaderCollapse: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.VerticalDockHeaderCollapse", true), true),
            syncedCollapse: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.SyncedCollapse", true), true),
            perfOverlayHotkey: normalizeHotkeyString(app.ui.settings.getSettingValue("Derp.PerfOverlayHotkey", "Alt+Shift+P"), "Alt+Shift+P"),
            systemBypassSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemBypassSoundIndex", 0), 0),
            systemCollapseSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemCollapseSoundIndex", 0), 0),
            systemDockSoundIndex: normalizeVariantIndex(app.ui.settings.getSettingValue("Derp.SystemDockSoundIndex", 0), 0),
            perfOverlayFontSize: Number(app.ui.settings.getSettingValue("Derp.PerfOverlayFontSize", 12)) || 12,
            perfOverlayShowRanking: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.PerfOverlayShowRanking", true), true),
            perfOverlayShowZOrder: normalizeBooleanSetting(app.ui.settings.getSettingValue("Derp.PerfOverlayShowZOrder", false), false),
            warpSpeedLevel: Math.max(1, Math.min(9, Math.round(Number(app.ui.settings.getSettingValue("Derp.WarpSpeedLevel", 5)) || 5)))
        };

        hydrateDerpBackgroundSetting().then((options) => {
            const registry = app.ui?.settings?.settingsLookup;
            const setting = registry?.["Derp.BackgroundImage"];
            if (setting && Array.isArray(options) && options.length) {
                setting.options = options;
            }
            applyDerpBackgroundImage(window.DERP_GLOBAL_SETTINGS.backgroundImage);
        });

        hydrateDerpCanvasPaletteSetting().then((options) => {
            const registry = app.ui?.settings?.settingsLookup;
            const setting = registry?.[CANVAS_PALETTE_SETTING_ID];
            if (setting && Array.isArray(options) && options.length) {
                setting.options = options;
            }
            applyDerpCanvasPalette(window.DERP_GLOBAL_SETTINGS.canvasPalette).catch((err) => console.error("[xcpDerp] Canvas palette load failed:", err));
        });
    }
});