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
const DERP_CATEGORY = "🔞 Derp Nodes";
function makeDerpCategory(group, leaf) {
    return [DERP_CATEGORY, group, leaf];
}
const DERP_GROUPS = {
    general: (leaf) => makeDerpCategory("General", leaf),
    ui: (leaf) => makeDerpCategory("User Interface", leaf),
    docking: (leaf) => makeDerpCategory("Docking and Decking", leaf),
    sound: (leaf) => makeDerpCategory("Sound", leaf),
    optimization: (leaf) => makeDerpCategory("Optimization", leaf),
    debugging: (leaf) => makeDerpCategory("Debugging", leaf),
    hotkeys: (leaf) => makeDerpCategory("Hotkeys", leaf)
};
const DERP_GROUP_SORT_ORDER = {
    general: 400,
    ui: 350,
    docking: 300,
    sound: 200,
    optimization: 175,
    debugging: 150,
    hotkeys: 100,
};
const DERP_SETTING_DEFAULTS = {
    stickyDrag: false,
    playSound: true,
    useAnimation: true,
    useAnimations: true,
    closeSysPanelOnOutsideClick: true,
    showToolTips: true,
    backgroundImage: DERP_DEFAULT_SELECTION,
    canvasPalette: CANVAS_PALETTE_NONE,
    verticalDockHeaderCollapse: true,
    syncedCollapse: true,
    verticalPinnedCollapseUpward: true,
    verticalDeckExpandCount: "auto_fit",
    deckArrangement: "automatic",
    deckResizeOptimization: "whole_wall_cache",
    loraStackWholeWallCacheGate: "3",
    triggerWallWholeWallCacheGate: "10",
    perfOverlayHotkey: "Alt+Shift+P",
    systemBypassSoundIndex: 0,
    systemCollapseSoundIndex: 0,
    systemDockSoundIndex: 0,
    perfOverlayFontSize: 12,
    perfOverlayShowRanking: true,
    perfOverlayShowZOrder: false,
    warpSpeedLevel: 5,
};
const DERP_SETTING_DEFAULT_IDS = {
    "Derp.StickyDrag": DERP_SETTING_DEFAULTS.stickyDrag,
    "Derp.PlaySound": DERP_SETTING_DEFAULTS.playSound,
    "Derp.UseAnimation": DERP_SETTING_DEFAULTS.useAnimation,
    "Derp.CloseSysPanelOnOutsideClick": DERP_SETTING_DEFAULTS.closeSysPanelOnOutsideClick,
    "Derp.ShowToolTips": DERP_SETTING_DEFAULTS.showToolTips,
    "Derp.BackgroundImage": DERP_SETTING_DEFAULTS.backgroundImage,
    [CANVAS_PALETTE_SETTING_ID]: DERP_SETTING_DEFAULTS.canvasPalette,
    "Derp.VerticalDockHeaderCollapse": DERP_SETTING_DEFAULTS.verticalDockHeaderCollapse,
    "Derp.SyncedCollapse": DERP_SETTING_DEFAULTS.syncedCollapse,
    "Derp.VerticalPinnedCollapseUpward": DERP_SETTING_DEFAULTS.verticalPinnedCollapseUpward,
    "Derp.VerticalDeckExpandCount": DERP_SETTING_DEFAULTS.verticalDeckExpandCount,
    "Derp.DeckArrangement": DERP_SETTING_DEFAULTS.deckArrangement,
    "Derp.DeckResizeOptimization": DERP_SETTING_DEFAULTS.deckResizeOptimization,
    "Derp.LoraStackWholeWallCacheGate": DERP_SETTING_DEFAULTS.loraStackWholeWallCacheGate,
    "Derp.TriggerWallWholeWallCacheGate": DERP_SETTING_DEFAULTS.triggerWallWholeWallCacheGate,
    "Derp.PerfOverlayHotkey": DERP_SETTING_DEFAULTS.perfOverlayHotkey,
    "Derp.SystemBypassSoundIndex": DERP_SETTING_DEFAULTS.systemBypassSoundIndex,
    "Derp.SystemCollapseSoundIndex": DERP_SETTING_DEFAULTS.systemCollapseSoundIndex,
    "Derp.SystemDockSoundIndex": DERP_SETTING_DEFAULTS.systemDockSoundIndex,
    "Derp.PerfOverlayFontSize": DERP_SETTING_DEFAULTS.perfOverlayFontSize,
    "Derp.PerfOverlayShowRanking": DERP_SETTING_DEFAULTS.perfOverlayShowRanking,
    "Derp.PerfOverlayShowZOrder": DERP_SETTING_DEFAULTS.perfOverlayShowZOrder,
    "Derp.WarpSpeedLevel": DERP_SETTING_DEFAULTS.warpSpeedLevel,
};

function syncDerpGlobalSettingsAlias() {
    window.DERP_GLOBAL_SETTINGS = {
        ...DERP_SETTING_DEFAULTS,
        ...(window.DERP_GLOBAL_SETTINGS || {}),
    };
    window.DERP_GLOBAL_SETTINGS.useAnimations = window.DERP_GLOBAL_SETTINGS.useAnimation !== false;
    window.xcpDerpSettings = window.DERP_GLOBAL_SETTINGS;
}

function getStoredSettingValue(id, fallback) {
    const value = app.ui?.settings?.getSettingValue?.(id);
    return value === undefined ? fallback : value;
}

function seedMissingDerpSettingDefaults() {
    if (!app.ui?.settings?.getSettingValue || !app.ui?.settings?.setSettingValue) return;
    Object.entries(DERP_SETTING_DEFAULT_IDS).forEach(([id, defaultValue]) => {
        if (app.ui.settings.getSettingValue(id) === undefined) {
            app.ui.settings.setSettingValue(id, defaultValue);
        }
    });
}

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
            const current = app.ui?.settings?.getSettingValue?.(setting.id) ?? setting.defaultValue;
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
    return app.ui?.settings?.getSettingValue?.(id) ?? fallback;
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
    syncDerpGlobalSettingsAlias();
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
        syncDerpGlobalSettingsAlias();

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
                syncDerpGlobalSettingsAlias();

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
                syncDerpGlobalSettingsAlias();
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
                window.DERP_GLOBAL_SETTINGS.useAnimations = v;
                syncDerpGlobalSettingsAlias();

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
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.ShowToolTips",
            name: "Show Tool Tips",
            category: DERP_GROUPS.general("Show Tool Tips"),
            sortOrder: DERP_GROUP_SORT_ORDER.general,

            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.showToolTips = v;
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
            default: CANVAS_PALETTE_NONE,
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.VerticalDeckExpandCount",
            name: "Number of nodes expanded in decked Vertical Stacks",
            category: DERP_GROUPS.docking("Vertical Deck Expand Count"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "combo",
            options: [
                { value: "always_one", text: "Always One" },
                { value: "auto_fit", text: "Auto Fit" }
            ],
            default: "auto_fit",
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.verticalDeckExpandCount = String(v || "auto_fit").trim() || "auto_fit";
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.DeckArrangement",
            name: "Deck arrangement",
            category: DERP_GROUPS.docking("Deck arrangement"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "combo",
            options: [
                { value: "automatic", text: "Automatic" },
                { value: "vertical_sandwich", text: "Vertical Sandwich" },
                { value: "horizontal_sandwich", text: "Horizontal Sandwich" }
            ],
            default: "automatic",
            onChange: (v) => {
                const value = String(v || "automatic").trim();
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.deckArrangement = ["automatic", "vertical_sandwich", "horizontal_sandwich"].includes(value)
                    ? value
                    : "automatic";
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.DeckResizeOptimization",
            name: "Deck resize optimization",
            category: DERP_GROUPS.docking("Deck resize optimization"),
            sortOrder: DERP_GROUP_SORT_ORDER.docking,
            type: "combo",
            options: [
                { value: "none", text: "None" },
                { value: "ghost_layout", text: "Ghost Layout" },
                { value: "whole_wall_cache", text: "Whole-Wall Cache" }
            ],
            default: "whole_wall_cache",
            onChange: (v) => {
                const value = String(v || "whole_wall_cache").trim();
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.deckResizeOptimization = ["none", "ghost_layout", "whole_wall_cache"].includes(value)
                    ? value
                    : "whole_wall_cache";
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.LoraStackWholeWallCacheGate",
            name: "Derp LoRA Stack Whole-Wall Cache Gate",
            category: DERP_GROUPS.optimization("Derp LoRA Stack Whole-Wall Cache Gate"),
            sortOrder: DERP_GROUP_SORT_ORDER.optimization,
            type: "combo",
            options: [
                { value: "none", text: "None" },
                { value: "3", text: "3" },
                { value: "5", text: "5" },
                { value: "8", text: "8" }
            ],
            default: "3",
            onChange: (v) => {
                const value = String(v || "3").trim().toLowerCase();
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.loraStackWholeWallCacheGate = ["none", "3", "5", "8"].includes(value) ? value : "3";
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.TriggerWallWholeWallCacheGate",
            name: "Derp Trigger Wall Whole-Wall Cache Gate",
            category: DERP_GROUPS.optimization("Derp Trigger Wall Whole-Wall Cache Gate"),
            sortOrder: DERP_GROUP_SORT_ORDER.optimization,
            type: "combo",
            options: [
                { value: "none", text: "None" },
                { value: "10", text: "10" },
                { value: "15", text: "15" },
                { value: "20", text: "20" },
                { value: "30", text: "30" }
            ],
            default: "10",
            onChange: (v) => {
                const value = String(v || "10").trim().toLowerCase();
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.triggerWallWholeWallCacheGate = ["none", "10", "15", "20", "30"].includes(value) ? value : "10";
                syncDerpGlobalSettingsAlias();
                if (app.canvas) app.canvas.setDirty(true, true);
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
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
                syncDerpGlobalSettingsAlias();
            }
        });

        seedMissingDerpSettingDefaults();

        // Initialize global object for immediate access by nodes
        window.DERP_GLOBAL_SETTINGS = {
            stickyDrag: normalizeBooleanSetting(getStoredSettingValue("Derp.StickyDrag", DERP_SETTING_DEFAULTS.stickyDrag), DERP_SETTING_DEFAULTS.stickyDrag),
            playSound: normalizeBooleanSetting(getStoredSettingValue("Derp.PlaySound", DERP_SETTING_DEFAULTS.playSound), DERP_SETTING_DEFAULTS.playSound),
            useAnimation: normalizeBooleanSetting(getStoredSettingValue("Derp.UseAnimation", DERP_SETTING_DEFAULTS.useAnimation), DERP_SETTING_DEFAULTS.useAnimation),
            closeSysPanelOnOutsideClick: normalizeBooleanSetting(getStoredSettingValue("Derp.CloseSysPanelOnOutsideClick", DERP_SETTING_DEFAULTS.closeSysPanelOnOutsideClick), DERP_SETTING_DEFAULTS.closeSysPanelOnOutsideClick),
            showToolTips: normalizeBooleanSetting(getStoredSettingValue("Derp.ShowToolTips", DERP_SETTING_DEFAULTS.showToolTips), DERP_SETTING_DEFAULTS.showToolTips),
            backgroundImage: String(getStoredSettingValue("Derp.BackgroundImage", DERP_SETTING_DEFAULTS.backgroundImage)),
            canvasPalette: String(getStoredSettingValue(CANVAS_PALETTE_SETTING_ID, DERP_SETTING_DEFAULTS.canvasPalette)),
            verticalDockHeaderCollapse: normalizeBooleanSetting(getStoredSettingValue("Derp.VerticalDockHeaderCollapse", DERP_SETTING_DEFAULTS.verticalDockHeaderCollapse), DERP_SETTING_DEFAULTS.verticalDockHeaderCollapse),
            syncedCollapse: normalizeBooleanSetting(getStoredSettingValue("Derp.SyncedCollapse", DERP_SETTING_DEFAULTS.syncedCollapse), DERP_SETTING_DEFAULTS.syncedCollapse),
            verticalPinnedCollapseUpward: normalizeBooleanSetting(getStoredSettingValue("Derp.VerticalPinnedCollapseUpward", DERP_SETTING_DEFAULTS.verticalPinnedCollapseUpward), DERP_SETTING_DEFAULTS.verticalPinnedCollapseUpward),
            verticalDeckExpandCount: String(getStoredSettingValue("Derp.VerticalDeckExpandCount", DERP_SETTING_DEFAULTS.verticalDeckExpandCount) || DERP_SETTING_DEFAULTS.verticalDeckExpandCount),
            deckArrangement: String(getStoredSettingValue("Derp.DeckArrangement", DERP_SETTING_DEFAULTS.deckArrangement) || DERP_SETTING_DEFAULTS.deckArrangement),
            deckResizeOptimization: String(getStoredSettingValue("Derp.DeckResizeOptimization", DERP_SETTING_DEFAULTS.deckResizeOptimization) || DERP_SETTING_DEFAULTS.deckResizeOptimization),
            loraStackWholeWallCacheGate: String(getStoredSettingValue("Derp.LoraStackWholeWallCacheGate", DERP_SETTING_DEFAULTS.loraStackWholeWallCacheGate) || DERP_SETTING_DEFAULTS.loraStackWholeWallCacheGate).toLowerCase(),
            triggerWallWholeWallCacheGate: String(getStoredSettingValue("Derp.TriggerWallWholeWallCacheGate", DERP_SETTING_DEFAULTS.triggerWallWholeWallCacheGate) || DERP_SETTING_DEFAULTS.triggerWallWholeWallCacheGate).toLowerCase(),
            perfOverlayHotkey: normalizeHotkeyString(getStoredSettingValue("Derp.PerfOverlayHotkey", DERP_SETTING_DEFAULTS.perfOverlayHotkey), DERP_SETTING_DEFAULTS.perfOverlayHotkey),
            systemBypassSoundIndex: normalizeVariantIndex(getStoredSettingValue("Derp.SystemBypassSoundIndex", DERP_SETTING_DEFAULTS.systemBypassSoundIndex), DERP_SETTING_DEFAULTS.systemBypassSoundIndex),
            systemCollapseSoundIndex: normalizeVariantIndex(getStoredSettingValue("Derp.SystemCollapseSoundIndex", DERP_SETTING_DEFAULTS.systemCollapseSoundIndex), DERP_SETTING_DEFAULTS.systemCollapseSoundIndex),
            systemDockSoundIndex: normalizeVariantIndex(getStoredSettingValue("Derp.SystemDockSoundIndex", DERP_SETTING_DEFAULTS.systemDockSoundIndex), DERP_SETTING_DEFAULTS.systemDockSoundIndex),
            perfOverlayFontSize: Number(getStoredSettingValue("Derp.PerfOverlayFontSize", DERP_SETTING_DEFAULTS.perfOverlayFontSize)) || DERP_SETTING_DEFAULTS.perfOverlayFontSize,
            perfOverlayShowRanking: normalizeBooleanSetting(getStoredSettingValue("Derp.PerfOverlayShowRanking", DERP_SETTING_DEFAULTS.perfOverlayShowRanking), DERP_SETTING_DEFAULTS.perfOverlayShowRanking),
            perfOverlayShowZOrder: normalizeBooleanSetting(getStoredSettingValue("Derp.PerfOverlayShowZOrder", DERP_SETTING_DEFAULTS.perfOverlayShowZOrder), DERP_SETTING_DEFAULTS.perfOverlayShowZOrder),
            warpSpeedLevel: Math.max(1, Math.min(9, Math.round(Number(getStoredSettingValue("Derp.WarpSpeedLevel", DERP_SETTING_DEFAULTS.warpSpeedLevel)) || DERP_SETTING_DEFAULTS.warpSpeedLevel)))
        };
        syncDerpGlobalSettingsAlias();

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
