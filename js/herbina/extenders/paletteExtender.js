/**
 * Path: ./js/fatha/core/paletteExtender.js
 * ROLE: The "Diplomat" that brings Derp colors to standard, non-virtual nodes.
 * FIX: Pre-fetching palettes at startup to utilize LiteGraph's native, synchronous submenu engine.
 */
import { app } from "../../../../../scripts/app.js";
import { showFakeNestedMenu } from "./helpers/bypassSignalPicker.js";

const APPLY_DERP_PALETTE_MENU = "\uD83D\uDD1E Apply Derp Palette";

function isVueNodesMode() {
    return !!(typeof LiteGraph !== "undefined" && LiteGraph.vueNodesMode);
}

// Retained for reference, but no longer registered. derpSwatch now covers
// default-node palette application without adding a global context menu extender.
/* app.registerExtension({
    name: "xcp.PaletteExtender",

    // THE LIFECYCLE FIX: Pre-fetch palettes on UI load to avoid async event wiping
    async setup() {
        window.xcpDerpPaletteCache = {};
        try {
            const listRes = await fetch("/xcp/list/palettes");
            if (!listRes.ok) return;
            const listData = await listRes.json();
            const files = listData.items || [];

            for (const file of files) {
                // THE DIRECTORY FILTER FIX: Skip items ending in '/' (folders) to prevent .json 404s
                if (file.endsWith("/")) continue;

                const fileName = file.endsWith(".json") ? file : file + ".json";
                const palRes = await fetch(`/xcp/load/palettes?name=${fileName}`);
                if (!palRes.ok) continue;
                const palData = await palRes.json();
                // Handle Python backend data wrapper if present
                const payload = palData.data ? palData.data : palData;
                window.xcpDerpPaletteCache[fileName] = payload.palettes || [];
            }
        } catch (err) {
            console.error("[xcpDerp] Failed to pre-load palettes:", err);
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);

            // EXCLUSION: Skip Fatha and Uncle nodes to prevent UI conflicts.
            if (this.isFathaNode || this.isUncleNode) return;

            const node = this;
            const cache = window.xcpDerpPaletteCache || {};
            const files = Object.keys(cache);

            if (files.length === 0) return;

            const toRgba = (arr) => `rgba(${arr[0]}, ${arr[1]}, ${arr[2]}, ${arr[3]})`;

            // Build the native LiteGraph nested submenu structure synchronously
            const fileOptions = files.map(fileName => {
                const palettes = cache[fileName];
                const subOptions = [];

                palettes.forEach(p => {
                    Object.keys(p.entries || {}).forEach(keyName => {
                        if (keyName !== "main") return;
                        subOptions.push({
                            content: p.name,
                            callback: () => {
                                const entry = p.entries[keyName];
                                if (!entry) return;

                                // Apply _ON to Title and _OFF to Background
                                node.color = toRgba(entry._ON);
                                node.bgcolor = toRgba(entry._OFF);

                                node.properties = node.properties || {};
                                node.properties._lastDerpPalette = { fileName, name: p.name, key: keyName };

                                node.setDirtyCanvas(true, true);
                            }
                        });
                    });
                });

                return {
                    content: fileName.replace(".json", ""),
                    has_submenu: true,
                    // LiteGraph natively handles rendering and docking this submenu
                    submenu: {
                        options: subOptions
                    }
                };
            });

            if (isVueNodesMode()) {
                const groups = fileOptions.map(fileOption => ({
                    label: fileOption.content,
                    items: (fileOption.submenu?.options || []).map(item => ({
                        label: item.content,
                        callback: item.callback,
                    })),
                })).filter(group => group.items.length > 0);

                if (groups.length === 0) return;

                options.push({
                    content: APPLY_DERP_PALETTE_MENU,
                    callback: () => showFakeNestedMenu({
                        groups,
                        headerText: "Select palette file:",
                    })
                });
                return;
            }

            options.push({
                content: APPLY_DERP_PALETTE_MENU,
                has_submenu: true,
                submenu: {
                    options: fileOptions
                }
            });
        };
    }
}); */
