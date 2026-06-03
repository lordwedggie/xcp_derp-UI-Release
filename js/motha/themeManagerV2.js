/**
 * Path: ./nodes/themeManagerV2.js
 * ROLE: The 'Project Runway' station. The ultimate beauty salon for your nodes.
 * * WHAT IS HAPPENING HERE:
 * This is the master command center where you get to play god with the colors and
 * fonts of your entire workspace. It creates a special node
 * that acts like a remote control for every other node's outfit, letting you tweak
 * themes until everything looks exactly how you want it.
 * * It uses the 'Fatha' engine to build a complex skyscraper of buttons and
 * editors that let you micromanage shadows, strokes, and glows without ever
 * touching a single line of CSS.
 * * It’s also got a curated list of 'legal' fonts to make sure your UI doesn't
 * look like a ransom note by accident. It’s basically
 * the professional interior designer that makes sure your workflow stays looking
 * sharp while you’re busy generating whatever the crap it is that you are
 * making with Stable Diffusion.
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js"; //
import { UI_TYPES } from "../fatha/core/masterLayoutTypes.js";
import { generateKeyHash } from "./helpers/themeDataUtils.js"; //
import { getPaletteId, showBastaPalette } from "../fatha/bastas/bastaPalette.js";
import { activeBastas } from "../fatha/basta.js";
import {
    initThemeManager,
    updateThemeLayout,
    bindThemeEvents
} from "./themeManagerV2_core.js";
import { handleThemeDropdownChange } from "./helpers/themeManager_themeHandler.js";
import { getSystemPaletteDisplayName, toSystemPaletteDropdownItem } from "./helpers/themeManager_paletteUtils.js";

const CSS_FONT_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

function inferFontWeightFromFace(face) {
    const text = `${face?.style || ""} ${face?.fullName || ""} ${face?.postscriptName || ""}`.toLowerCase();
    if (/\bthin\b|\bhairline\b/.test(text)) return "100";
    if (/\bextra\s*light\b|\bultra\s*light\b/.test(text)) return "200";
    if (/\blight\b/.test(text)) return "300";
    if (/\bregular\b|\bbook\b|\broman\b|\bnormal\b/.test(text)) return "400";
    if (/\bmedium\b/.test(text)) return "500";
    if (/\bsemi\s*bold\b|\bdemi\s*bold\b/.test(text)) return "600";
    if (/\bextra\s*bold\b|\bultra\s*bold\b/.test(text)) return "800";
    if (/\bblack\b|\bheavy\b/.test(text)) return "900";
    if (/\bbold\b/.test(text)) return "700";
    return "400";
}

function buildFontWeightMap(fontFaces) {
    const map = {};
    for (const face of fontFaces || []) {
        const family = face?.family;
        if (!family) continue;
        if (!map[family]) map[family] = new Set();
        map[family].add(inferFontWeightFromFace(face));
    }
    const out = {};
    for (const [family, weights] of Object.entries(map)) {
        const sorted = Array.from(weights).sort((a, b) => Number(a) - Number(b));
        out[family] = sorted.length > 0 ? sorted : CSS_FONT_WEIGHTS;
    }
    return out;
}

function refreshSystemPaletteList(node) {
    if (!node || node._loadingSystemPaletteList) return;
    node._loadingSystemPaletteList = true;
    fetch(`/xcp/list/palettes?t=${Date.now()}`)
        .then(r => r.json())
        .then(data => {
            node._systemPaletteList = (data.items || [])
                .map(item => String(item || "").replace(/\\/g, "/"))
                .filter(item => item.startsWith("_system/"))
                .sort((a, b) => String(a).localeCompare(String(b)));
            node._systemPaletteListLoaded = true;
            const themePalette = node.themeToEdit?._palette || "";
            if (themePalette && node._systemPaletteList.includes(themePalette)) {
                node.properties.systemPaletteName = themePalette;
            } else if (!node._systemPaletteList.includes(node.properties.systemPaletteName)) {
                node.properties.systemPaletteName = "";
            }
            node._layoutMapHash = "";
            if (typeof node.refreshNodeLayoutMap === "function") node.refreshNodeLayoutMap();
            if (typeof node.requestDerpSync === "function") node.requestDerpSync();
        })
        .catch(() => {
            node._systemPaletteList = [];
            node._systemPaletteListLoaded = true;
        })
        .finally(() => {
            node._loadingSystemPaletteList = false;
        });
}

app.registerExtension({
    name: "xcp.derpThemeManagerV2_Extension",
    async setup() { initDerpGlobalListener(); },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpThemeManagerV2") return;

        // Fatha handles internal prototype injection and visual armor
        fatha(nodeType, nodeData, 200);

        nodeType.prototype.drawNodeShape = function(ctx, canvas) { };
        nodeType.prototype.drawNodeBypass = function(ctx, canvas) { this.onDrawForeground(ctx); };
        nodeType.prototype.drawNode = function(ctx) {
            this.onDrawForeground(ctx);
        };

        // THE FIX: Use Fatha's unified loop. Regions are automatically drawn by the engine
        nodeType.prototype.onNodeMoved = function() {
            // THE OPTIMIZATION FIX: Do not force complete DOM reflows and canvas redraws on every drag pixel. Fatha DOM shield handles interaction translations natively.
        };

        // THE FIX: Protocol Authority. Using Fatha's centralized variable resolver
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (!Array.isArray(this._systemPaletteList)) refreshSystemPaletteList(this);
            const paletteBasta = activeBastas.get(getPaletteId(this));
            const isPaletteOpen = paletteBasta && !paletteBasta.isClosing;
            // THE STRUCTURAL HASH FIX: Include the active theme to ensure
            // the map re-binds correctly when the global state shifts.
            // THE THRASHING FIX: Removed volatile _forceSync from hash which was causing infinite map rebuilds.
            const cfg = window.xcpDerpThemeConfig;

            // Check for unsaved key changes (pulse save buttons + star prefix on dirty keys)
            const THEME_META_KEYS = new Set(["_category", "_layout", "_palette"]);
            let isSelectedKeyDirty = false;
            let isThemeDirty = false;
            const dirtyKeys = new Set();
            if (cfg && this.themeToEdit && this._selectedThemeName) {
                const baselines = cfg._allBaselines?.[this._selectedThemeName] || {};
                const hasBaselineData = Object.keys(baselines).length > 0;
                if (hasBaselineData) {
                for (const key of Object.keys(this.themeToEdit)) {
                    if (THEME_META_KEYS.has(key)) continue;
                    const currentHash = generateKeyHash(this.themeToEdit[key]);
                    const baseHash = baselines[key];
                    if (baseHash !== undefined && currentHash !== baseHash) {
                        dirtyKeys.add(key);
                        if (key === this._selectedKeyName) { isSelectedKeyDirty = true; isThemeDirty = true; }
                    }
                }
                // Meta keys (_layout, _palette) use JSON.stringify — not theme key structure
                for (const meta of THEME_META_KEYS) {
                    if (this.themeToEdit[meta] !== undefined) {
                        if (baselines[meta] !== undefined && JSON.stringify(this.themeToEdit[meta]) !== baselines[meta]) {
                            isThemeDirty = true;
                            break;
                        }
                    }
                }
                }
            }
            this._isSelectedKeyDirty = isSelectedKeyDirty;
            this._isThemeDirty = isThemeDirty || isSelectedKeyDirty;
            this._dirtyKeyNames = dirtyKeys;

            const layoutHash = `${this._selectedThemeName}_${this._selectedKeyName}_${this._cachedFonts?.length || 0}_${this._systemPaletteList?.length || 0}_${this._systemPaletteListLoaded ? 1 : 0}_${this.properties.systemPaletteName || ""}_${isPaletteOpen}_${window.xcpDerpThemeConfig?.activeTheme}`;

            if (this._layoutMapHash === layoutHash && this.layoutMap) return;
            const mapChanged = this._layoutMapHash !== layoutHash;
            this._layoutMapHash = layoutHash;
            if (mapChanged) this._lastUISyncHash = "";

            const applyName = (this.properties?.selectedTheme && this.properties.selectedTheme !== "") ? this.properties.selectedTheme : (cfg?.activeTheme || "Template_Standard_v02");
            const applyTheme = cfg?.themes?.[applyName];
            const applyLayout = applyTheme?._layout || [0, 0, 2, 2, 0, 0, 2, 4];
            const mW = Number(applyLayout[0] ?? 0), mH = Number(applyLayout[1] ?? 0);
            const sW = Number(applyLayout[2] ?? 2), sH = Number(applyLayout[3] ?? 2);
            const oX = Number(applyLayout[4] ?? 0), oY = Number(applyLayout[5] ?? 0);
            const pW = Number(applyLayout[6] ?? 2), pH = Number(applyLayout[7] ?? 4);
            const tLayout = this.themeToEdit?._layout || [4, 2, 2, 2, 2, 4, 2, 4];

            // THE REFRESH FIX: Ensure items list is never empty during the initial boot sequence
            const themeList = Object.keys(window.xcpDerpThemeConfig?.themes || {});
            const keyList = Object.keys(this.themeToEdit || {})
                .filter(k => !k.startsWith("_"))
                .sort((a, b) => {
                    const rank = (k) => {
                        if (k.startsWith("#t_")) return 3;
                        if (k.startsWith("#")) return 2;
                        if (k.startsWith("t_")) return 1;
                        return 0;
                    };
                    const ra = rank(a), rb = rank(b);
                    return ra !== rb ? ra - rb : a.localeCompare(b);
                });
            const systemPaletteList = Array.isArray(this._systemPaletteList) && this._systemPaletteList.length > 0
                ? ["None", ...this._systemPaletteList.map(toSystemPaletteDropdownItem)]
                : [this._systemPaletteListLoaded ? "No _system palettes found" : "Loading palettes..."];
            const selectedSystemPalette = this._systemPaletteList?.includes(this.properties.systemPaletteName)
                ? this.properties.systemPaletteName
                : "None";
            const selectedSystemPaletteText = selectedSystemPalette === "None"
                ? "None"
                : getSystemPaletteDisplayName(selectedSystemPalette);

            this.layoutMap = {
                themeManagementRegion: {
                    anchor: { target: "headerRegion", axis: "y" }, objectAlign: ["left", "top"], dir: "row",
                    width: "full", height: "auto", margin: [mW, mH], padding: [0, 0],
                    btnThemeRename: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "rename", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                    },
                    btnThemeCopy: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "copy", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                    },
                    btnThemeSave: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "save", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                        pulse: this._isThemeDirty,
                    },
                    dropdownTheme: {
                        type: UI_TYPES.FILEBROWSER, themeKey: "dialog, t_textNormal", canvasShield: true,
                        indicator: true, mode: "file", fileType: "theme", rootName: "themes",
                        displayText: "Select Theme...", mouseOver: false,
                        width: "full", height: "auto", minWidth: 80,
                        items: themeList.length > 0 ? themeList : [this._selectedThemeName || "Default"],
                        value: this._selectedThemeName, objectAlign: ["left", "middle"], padding: [pW, pH], spacing: [sW, 0],
                        onChange: (val) => {
                            handleThemeDropdownChange(this, val, updateThemeLayout);
                        }
                    },
                    btnThemeDelete: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "trash", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                    },
                },
                themeLayoutRegion: {
                    anchor: { target: "themeManagementRegion", axis: "y", offset: sH },
                    objectAlign: ["left", "top"], dir: "row", width: "full", height: "auto",
                    margin: [mW, 0],
                    lblMargin: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Margin:", noHover: true,
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    editorMargin: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall",
                        numberOnly: false, measureText: "99.99",
                        value: `${tLayout[0] ?? 4}, ${tLayout[1] ?? 2}`,
                        labelAlign: ["center", "middle"], width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    lblSpacing: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Spacing:", noHover: true,
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    editorSpacing: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall",
                        numberOnly: false, value: `${tLayout[2] ?? 2}, ${tLayout[3] ?? 2}`,
                        labelAlign: ["center", "middle"], measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    lblOffset: { hidden: true,
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Offset:", noHover: true,
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    editorOffset: { hidden: true,
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall",
                        numberOnly: false, value: `${tLayout[4] ?? 2}, ${tLayout[5] ?? 4}`,
                        labelAlign: ["center", "middle"], measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    lblPadding: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Padding:", noHover: true,
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    editorPadding: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall",
                        numberOnly: false, value: `${tLayout[6] ?? 2}, ${tLayout[7] ?? 4}`,
                        labelAlign: ["center", "middle"], measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    spring: { width: "full", height: 0 },
                    lblPalSelector: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Palette:", noHover: true,
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    dropdownPalette: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "palette",
                        themeKey: "dialog, t_textSmall", canvasShield: true,
                        width: "fit", height: "auto", minWidth: 120,
                        mode: "file",
                        fileType: "palette",
                        rootName: "palettes",
                        items: systemPaletteList,
                        value: selectedSystemPalette,
                        onChange: (v) => {
                            this.properties.systemPaletteName = (v === "None" || !v) ? "" : v;
                            this.themeToEdit._palette = this.properties.systemPaletteName;
                            this._layoutMapHash = null;
                            this.refreshNodeLayoutMap();
                        },
                        padding: [pW, pH], spacing: [sW, 0]
                    },
                },
                previewRegion: {
                    anchor: { target: "themeLayoutRegion", axis: "y", offset: oY }, state: "_DIS",
                    objectAlign: ["left", "top"], dir: "col", width: "full", height: "auto", margin: [mW, mH],
                    btnPaletteDesigner: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall", mouseOver: false,
                        text: "Palette Editor",
                        width: "auto", height: "fill", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                        padding:[pW, pH], spacing: [sW, 0],
                        state: (() => {
                            const b = activeBastas.get(getPaletteId(this));
                            return (b && !b.isClosing) ? "ON" : "OFF";
                        })(),
                        onClick: () => {
                            showBastaPalette(this, "btnPaletteDesigner");
                            this.refreshNodeLayoutMap();
                        },
                    }
                },
                keyManagementRegion: {
                    anchor: { target: "previewRegion", axis: "y", offset: oY }, objectAlign: ["left", "top"], dir: "row",
                    width: "full", height: "auto", margin: [mW, mH], padding: [0, 0],
                    btnKeyRename: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "rename", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                    },
                    btnKeyCopy: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "copy", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                    },
                    btnKeySave: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", noHover: false,
                        state: "OFF", icon: "save", width: "match", height: "fill", objectAlign: ["left", "middle"],
                        spacing: [sW, 0],
                        pulse: this._isSelectedKeyDirty,
                    },
                    dropdownKey: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown",
                        themeKey: "dialog, t_textNormal", canvasShield: true,
                        width: "full", height: "auto", minWidth: 80,
                        mode: "file",
                        rootName: "keys",
                        items: keyList.length > 0
                            ? keyList.map(k => (this._dirtyKeyNames?.has(k) ? "* " : "") + k)
                            : [this._selectedKeyName || "None"],
                        value: this._selectedKeyName, padding: [pW, pH], spacing: [sW, 0],
                        onChange: (val) => {
                            this._selectedKeyName = val;
                            updateThemeLayout(this);
                            this.requestDerpSync();
                        }
                    },
                    btnKeyDelete: {
                        type: UI_TYPES.ICONBUTTON, themeKey: "button, t_textNormal", objectAlign: ["left", "middle"],
                        noHover: false, state: "OFF", icon: "trash",
                        width: "match", height: "fill", spacing: [sW, 0],
                    },
                },
                mainEditRegion: {
                    anchor: { target: "keyManagementRegion", axis: "y", offset: oY }, objectAlign: ["left", "top"],
                    dir: "row", width: "full", height: "auto", margin: [mW, mH],
                    lblMain: {
                        type: UI_TYPES.BUTTON, themeKey: "t_textSmall", labelAlign: ["left", "middle"],
                        text: "Main colors", noHover: true, measureText: "Shadow OFFW",
                        width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    mainColorEdit: {
                        type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "mainColorEdit",
                        colorSuffix: "", width: 120, height: 20, spacing: [sW, 0],
                    },

                    lblFonts: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Font:",
                        width: "auto", height: "auto", padding: [pW, pH]
                    },
                    dropdownFonts: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown",
                        themeKey: "panel, t_textSmall", width: "fit",
                        height: "auto", padding: [pW, 2], minWidth: 100,
                        mode: "file", rootName: "fonts", spacing: [sW, 0],
                        items: this._cachedFonts || ["Loading..."]
                    },
                    lblFontSize: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Size:",
                        width: "auto", height: "auto", padding: [pW, pH]
                    },
                    promptFontSize: {
                        type: UI_TYPES.EDITOR, canvasShield:true,   themeKey: "dialog, t_textSystem",
                        numberOnly: true, value: "10", width: "auto", height: "auto", padding: [pW, pH], labelAlign: ["center", "middle"],
                        spacing: [sW, 0],                        
                    },
                    spring: { width: "full", height: 0 },
                    lblFontWeight: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Weight:",
                        width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    dropdownFontWeight: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown", measureText: "Normal", indicator: true, text: "Normal",
                        themeKey: "panel, t_textSmall", width: "auto",
                        height: "auto", padding: [pW, 2], minWidth: 40,
                        mode: "file",
                        rootName: "weights",
                        items: ["100", "200", "300", "400", "500", "600", "700", "800", "900", "normal", "bold"]
                    },
                    spring: { width: "full", height: 0 },
                    lblCorners: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", numberOnly: true,
                        text: "Corners:", width: "auto", height: "auto", spacing: [sW, 0],
                    },
                    promptCorners: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "panel, t_textSmall",
                        numberOnly: true,
                        measureText: "9S, 9S, 9S, 9S", width: "auto", height: "auto", labelAlign:["center", "middle"], padding: [pW, pH], minWidth: 40,
                    }
                },
                shadowRegion: {
                    anchor: { target: "mainEditRegion", axis: "y", offset: sH }, objectAlign: ["left", "top"],
                    dir: "row", width: "full", height: "auto", margin: [mW, 0],
                    lblShadow: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall", labelAlign: ["center","middle"],
                        text: "Shadow OFF", noHover: true, measureText: "Shadow OFFW",
                        width: "auto", height: "auto", spacing: [sW, 0], padding: [0, pH],
                    },
                    shadowColorEdit: {
                        type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "shadowColorEdit",
                        colorSuffix: "shadow", width: 120, height: 20, spacing: [sW, 0]
                    },
                    lblShadowOffset: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Offset:",
                        noHover: true, measureText: "Weight:", width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    promptShadowOffset: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall",
                        numberOnly: true, labelAlign: ["center", "middle"], minWidth:30, measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    lblShadowBlur: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Blur:",
                        noHover: true, width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    promptShadowBlur: {
                        type: UI_TYPES.EDITOR, canvasShield:true, themeKey: "dialog, t_textSmall", numberOnly: true,
                        labelAlign: ["center", "middle"], minWidth:30, measureText: "999", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    spring: { width: "full", height: 0 },
                    lblShadowClip: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Clip:",
                        noHover: true, width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    dropdownShadowClip: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown",
                        canvasShield:true, themeKey: "panel, t_textSmall",
                        width: "auto", height: "auto", padding: [pW, pH], minWidth: 40,
                        mode: "file",
                        rootName: "clip",
                        items: ["None", "Inside", "Outside"]
                    },
                },
                strokeRegion: {
                    anchor: { target: "shadowRegion", axis: "y", offset: sH },
                    objectAlign: ["left", "top"], dir: "row", width: "full", height: "auto", margin: [mW, 0],
                    lblStroke: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall", labelAlign: ["center","middle"],
                        text: "Stroke OFF", noHover: true, measureText: "Shadow OFFW",
                        width: "auto", height: "auto", spacing: [sW, 0], padding: [0, pH],
                    },
                    strokeColorEdit: {
                        type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "strokeColorEdit",
                        colorSuffix: "stroke", width: 120, height: 20, spacing: [sW, 0]
                    },
                    lblStrokeWeight: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Weight:",
                        noHover: true, measureText: "Weight:", width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    promptStrokeWeight: {
                        type: UI_TYPES.EDITOR, canvasShield:true,   themeKey: "dialog, t_textSmall", numberOnly: true,
                        labelAlign: ["center", "middle"], minWidth:30, measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    spring: { width: "full", height: 0 },
                    lblStrokeMode: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Stroke mode:",
                        noHover: true, width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    dropdownStrokeMode: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown",
                        canvasShield:true, themeKey: "panel, t_textSmall",
                        width: "auto", height: "auto", padding: [pW, pH], minWidth: 40,
                        mode: "file",
                        rootName: "mode",
                        items: ["Outside", "Center", "Inside"]
                    },
                },
                glowRegion: {
                    anchor: { target: "strokeRegion", axis: "y", offset: sH },
                    objectAlign: ["left", "top"], dir: "row", width: "full", height: "auto", margin: [mW, 0],
                    lblGlow: {
                        type: UI_TYPES.BUTTON, themeKey: "button, t_textSmall", text: "Glow OFF",
                        noHover: true, state: "OFF", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                        measureText: "Shadow OFFW", width: "auto", height: "auto", padding: [0, pH], spacing: [sW, 0]
                    },
                    glowColorEdit: {
                        type: UI_TYPES.COLORKEYEDIT, themeKey: "button, t_textSmall", key: "glowColorEdit",
                        colorSuffix: "glow", width: 120, height: 20, spacing: [sW, 0]
                    },
                    lblGlowOffset: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Offset:",
                        noHover: true, measureText: "Weight:", width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    promptGlowOffset: {
                        type: UI_TYPES.EDITOR, canvasShield:true,   themeKey: "dialog, t_textSmall", numberOnly: true,
                        labelAlign: ["center", "middle"], minWidth:30, measureText: "10, 10", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    lblGlowBlur: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Blur:",
                        noHover: true, width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    promptGlowBlur: {
                        type: UI_TYPES.EDITOR, canvasShield:true,   themeKey: "dialog, t_textSmall", numberOnly: true,
                        labelAlign: ["center", "middle"], minWidth:30, measureText: "999", width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0]
                    },
                    spring: { width: "full", height: 0 },
                    lblGlowClip: {
                        type: UI_TYPES.TEXT, themeKey: "t_textSmall", text: "Clip:",
                        noHover: true, width: "auto", height: "auto", spacing: [sW, 0]
                    },
                    dropdownGlowClip: {
                        type: UI_TYPES.FILEBROWSER,
                        icon: "dropdown",
                        canvasShield:true, themeKey: "panel, t_textSmall",
                        width: "auto", height: "auto", padding: [pW, pH], minWidth: 40,
                        mode: "file",
                        rootName: "clip",
                        items: ["None", "Inside", "Outside"]
                    },
                },
            };

            // THE INTERACTION FIX: Re-bind events and sync UI values after every layout map reconstruction.
            if (typeof bindThemeEvents === "function") bindThemeEvents(this);
            if (typeof updateThemeLayout === "function") updateThemeLayout(this);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.properties.selectedThemeName = this.properties.selectedThemeName || "";
            this.properties.selectedSystemTheme = this.properties.selectedSystemTheme || this.properties.selectedTheme || "";
            initThemeManager(this);
            this.properties.padding = this.properties.padding || [2, 4];
            this.refreshNodeLayoutMap();
            this.loadSystemFonts();
        };

        // THE FONT PERSISTENCE FIX: Method moved to prototype to ensure shared font buffer accessibility
        nodeType.prototype.loadSystemFonts = async function() {
            if (this._fontsLoading) return;
            this._fontsLoading = true;

            const safePrefix = "• ";
            const safeFonts = ["Inter", "DengXian Light", "DengXian", "Arial", "helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Times New Roman", "Georgia", "Garamond", "Courier New"];
            const fallbackFonts = [...safeFonts, "Arial Black", "Calibri", "Comic Sans MS", "Consolas", "Impact"];

            const finalizeFonts = (fontList) => {
                const sorted = fontList.sort((a, b) => {
                    const aSafe = safeFonts.includes(a);
                    const bSafe = safeFonts.includes(b);
                    if (aSafe && !bSafe) return -1;
                    if (!aSafe && bSafe) return 1;
                    return a.localeCompare(b);
                }).map(f => safeFonts.includes(f) ? `${safePrefix}${f}` : f);

                this._cachedFonts = sorted;
                // THE REFRESH FIX: Trigger a full layout map reconstruction instead of poking the potentially stale map.
                this._fontsLoading = false;
                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                if (this.requestDerpSync) this.requestDerpSync();
            };

            if (window.queryLocalFonts) {
                try {
                    const localFonts = await window.queryLocalFonts();
                    this._fontWeightMap = buildFontWeightMap(localFonts);
                    const fontFamilies = new Set(safeFonts);
                    for (const f of localFonts) fontFamilies.add(f.family);
                    finalizeFonts(Array.from(fontFamilies));
                } catch (err) {
                    this._fontWeightMap = {};
                    finalizeFonts(fallbackFonts);
                }
            } else {
                this._fontWeightMap = {};
                finalizeFonts(fallbackFonts);
            }
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function() {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.properties.selectedSystemTheme = this.properties.selectedSystemTheme || this.properties.selectedTheme || "";
            if (this.properties.selectedThemeName) {
                this._selectedThemeName = this.properties.selectedThemeName;
                initThemeManager(this);
            }
            this.refreshNodeLayoutMap();
            this.loadSystemFonts();
        };

        nodeType.prototype.onThemeUpdate = function(config) {
            const explicitSelectedTheme = this.properties?.selectedSystemTheme || this.properties?.selectedTheme || "";
            const forceImmediateApply = !!explicitSelectedTheme && explicitSelectedTheme !== this._selectedThemeName;
            const preservedSelectedThemeName = this._selectedThemeName;
            const preservedSelectedThemeProp = this.properties?.selectedThemeName || "";
            const preservedThemeToEdit = this.themeToEdit ? JSON.parse(JSON.stringify(this.themeToEdit)) : null;
            const preservedSelectedKeyName = this._selectedKeyName || "";

            // THE PERFORMANCE GATE: Skip everything if culled or invisible.
            // This is the primary defense against global broadcast spam.
            let isVisible = true;
            if (app.canvas?.visible_area) {
                const va = app.canvas.visible_area;
                isVisible = !(this.pos[0] > va[2] || this.pos[0] + this.size[0] < va[0] || this.pos[1] > va[3] || this.pos[1] + this.size[1] < va[1]);
            }
            if (!forceImmediateApply && (this._isDerpCulled || !isVisible)) return;

            // THE BROADCAST HASH: Only recompile theme paint-data if the theme or local sync-state changed.
            // handleThemeUpdate and refreshNodeLayoutMap are O(N) and were previously thrashing the CPU.
            // THE THRASHING FIX: Removed volatile _forceSync from hash which caused infinite rebuild loops.
            const themeName = explicitSelectedTheme || this._selectedThemeName || this.properties?.selectedThemeName || config.activeTheme;
            const themeRevision = config.getThemeRevision ? config.getThemeRevision(themeName) : 0;
            const configHash = `${config.activeTheme}_${explicitSelectedTheme}_${themeName}_${this._selectedKeyName || ""}_${themeRevision}`;
            if (!forceImmediateApply && this._lastBroadcastHash === configHash) return;
            this._lastBroadcastHash = configHash;

            this.handleThemeUpdate(config);

            if (forceImmediateApply) {
                this._selectedThemeName = preservedSelectedThemeName;
                this.properties.selectedThemeName = preservedSelectedThemeProp;
                this._selectedKeyName = preservedSelectedKeyName;
                if (preservedThemeToEdit) this.themeToEdit = preservedThemeToEdit;
            }

            this._layoutMapHash = null;
            this._lastUISyncHash = "";
            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this.refreshNodeLayoutMap();

            const baseMap = panel.getPanelBaseMap ? panel.getPanelBaseMap(this, app, panel, () => panel.closeDerpSysPanel()) : {};
            panel.setLayoutMap({ ...baseMap });
        };

        // Override getDerpVars to ignore edit-only theme properties (selectedThemeName / _selectedThemeName).
        // Only selectedTheme (the APPLY property) or activeTheme should control this node's layout vars.
        const _getDerpVars = nodeType.prototype.getDerpVars;
        nodeType.prototype.getDerpVars = function(...args) {
            const savedName = this._selectedThemeName;
            const savedPropName = this.properties?.selectedThemeName;
            const systemTheme = (this.properties?.selectedSystemTheme && this.properties.selectedSystemTheme !== "")
                ? this.properties.selectedSystemTheme
                : ((this.properties?.selectedTheme && this.properties.selectedTheme !== "") ? this.properties.selectedTheme : "Template_Standard_v02");
            this._selectedThemeName = systemTheme;
            this.properties.selectedThemeName = this._selectedThemeName;
            const result = _getDerpVars.apply(this, args);
            this._selectedThemeName = savedName;
            this.properties.selectedThemeName = savedPropName;
            return result;
        };
    }
});
