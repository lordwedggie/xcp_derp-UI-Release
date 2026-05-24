/**
 * Path: ./js/fatha/bastas/bastaFileHandler.js
 * ROLE: A specialized file management utility for xcpDerp.
 * INTEGRATION: Inherits Header/Footer logic and theme variables from the core engine.
 */
import { spawnBasta, activeBastas } from "../basta.js";
import { UI_TYPES } from "../core/masterLayoutTypes.js";
import { showBastaMessage } from "./bastaMessage.js";
import { getPulsedColor, parseColor } from "../../herbina/masterAnimator.js";
import { resolvePaintData, measureTextWidth } from "../../herbina/utils/widgetsUtils.js";
import { SOUND_INDEX } from "../../herbina/masterSoundEffects.js";

/**
 * THE ID PROTOCOL: Ensures this basta acts as a singleton.
 */
export const getHandlerId = () => `basta_file_handler_global_singleton`;

function resolveFileHandlerTargetRegion(host, targetRegion) {
    const key = String(targetRegion || "").trim();
    if (!key || !host?.layout?.regions) return targetRegion;
    if (host.layout.regions[key]) return key;
    const sysKey = `sys_${key}`;
    if (host.layout.regions[sysKey]) return sysKey;
    return targetRegion;
}

function logLoraStackFileHandlerAnchor(host, label, payload) {
    if (!host || String(host.type || "").toLowerCase().includes("derplorastack") !== true) return;
    globalThis.DERP_LS_PROFILE_LOGS = globalThis.DERP_LS_PROFILE_LOGS || [];
    const entry = { label, payload, ts: Date.now() };
    globalThis.DERP_LS_PROFILE_LOGS.push(entry);
    if (globalThis.DERP_LS_PROFILE_LOGS.length > 200) globalThis.DERP_LS_PROFILE_LOGS.shift();
    if (globalThis.DERP_LS_PROFILE_CONSOLE === true) {
        console.log(`[LSProfile:${label}] ${JSON.stringify(payload)}`);
    }
}

/**
 * showBastaFileHandler: The entry point to spawn or refresh the handler.
 * @param {Object} host - The Fatha/Uncle node triggering this popup.
 * @param {string} category - The file category (themes, settings, books, palettes, locales).
 * @param {string} targetRegion - The layout key of the host to anchor to.
 */
export function showBastaFileHandler(host, category = "settings", targetRegion = null, { title = null, message = null, confirm = null, warning = null, mode = "rename", onConfirm = null, fileList = null, originalName = null, initialSize = [250, 100], properties = {}, playSound = null } = {}) {
    const id = getHandlerId();
    const resolvedTargetRegion = resolveFileHandlerTargetRegion(host, targetRegion);
    const shouldResetAnchor = resolvedTargetRegion && properties.reuseSavedOffset !== true;
    if (shouldResetAnchor && host?.properties) {
        delete host.properties[`bastaOffset_${id}`];
    }
    const vars = host.getDerpVars ? host.getDerpVars(host) : { mW: 4 }; // THE FIX: Get mW for width calculation
    const { mW } = vars;

    const refreshFileList = (instance, forceServer = false, showFeedback = false) => {
        // THE STATIC LIST FIX: Use provided fileList if available (e.g., for key entry names)
        // THE CATEGORY GUARD: Skip server fetch if category is "none" to prevent 400 errors
        if (!forceServer && (fileList || category === "none")) {
            instance._fileList = fileList || [];
            if (instance._compDataCache) delete instance._compDataCache.dropdownFolder;
            if (instance._fileBrowserCache) delete instance._fileBrowserCache.dropdownFolder;
            instance.requestDerpSync();
            return;
        }
        fetch(`/xcp/list/${category}`)
            .then(r => r.json())
            .then(data => {
                instance._fileList = data.items || [];
                if (instance._compDataCache) delete instance._compDataCache.dropdownFolder;
                if (instance._fileBrowserCache) delete instance._fileBrowserCache.dropdownFolder;
                instance._layoutDirty = true;
                instance._forceSync = true;
                instance.requestDerpSync();
                if (showFeedback) {
                    showBastaMessage(host, "Folder list refreshed", 1400, { width: 220 }, resolvedTargetRegion, false, "success");
                }
            })
            .catch((e) => {
                console.error("[File Handler] Refresh list failed:", e);
                if (showFeedback) {
                    showBastaMessage(host, "Refresh failed", 2400, { width: 220 }, resolvedTargetRegion, false, "error");
                }
            });
    };

    let finalWidth = initialSize[0];
    if (mode === "delete" && message) {
        const fontData = host._t_textnormalPaintData || host._t_textNormalPaintData || { fontSize: 12 };
        const fontSize = parseFloat(fontData.fontSize) || 12;
        const fontName = (fontData.font || "arial").replace(/[0-9]+px/ig, "").trim();
        const fontWeight = fontData.fontWeight || "normal";

        const textW = Math.ceil(measureTextWidth(message, fontSize, fontName, fontWeight));

        finalWidth = textW + (mW * 2) + 10;
        if (!properties.messageAlign) properties.messageAlign = ["center", "middle"];
        if (!properties.messageWidth) properties.messageWidth = "full";

        if (host.properties) {
            delete host.properties[`bastaSize_${id}`];
        }
    }

    const config = {
        host: host,
        titleLabel: title || `File Manager: ${category.toUpperCase()}`,
        autoSize: true,
        targetRegion: resolvedTargetRegion,
        properties: {
            category: category,
            mode: mode,
            showFolderBrowser: mode === "folder",
            customMessage: message,
            confirmMessage: confirm,
            warningMessage: warning,
            showOptions: false,
            onConfirm: onConfirm,
            originalName: originalName || host._currentProfileName || host.properties?.activePaletteName || host.properties?.activeFileName || "",
            pendingName: originalName || host._currentProfileName || host.properties?.activePaletteName || host.properties?.activeFileName || "",
            clickToClose: false,
            bastaMovalbe: true,
            bastaSingleton: true,
            autoWidth: false,
            snapHeight: false,
            playSound: playSound, // THE STATE SYNC: Preserving the sound key in properties for deferred playback
            ...properties
        },
        initialSize: [finalWidth, initialSize[1]], // THE SIZE FIX: Respect the initialSize or calculated dynamic width

        /**
         * THE LAYOUT MAP: Define the file browser and action buttons.
         */
        layoutMap: (basta, vars) => {
            const { mW, mH, sW, sH, oY, pW, pH } = vars;
            const currentCategory = basta.properties.category;
            const mode = basta.properties.mode || "rename";
            const currentName = basta.properties.pendingName || "";
            const isFolderMode = mode === "folder";
            // THE PATH-AWARE DUPLICATE CHECK: If folder browser is active, check against the target directory
            const selectedDir = (basta.properties.showFolderBrowser && basta.properties.selectedFolder !== "/") ? basta.properties.selectedFolder : "";
            const fullCheckPath = selectedDir ? `${selectedDir}/${currentName}` : currentName;

            const isDuplicate = isFolderMode ? false : (basta._fileList || []).some(f => {
                const fPath = (typeof f === "string" ? f : (f.name || f.path)).replace(/\\/g, "/");
                return fPath === fullCheckPath;
            });
            const isSame = isFolderMode ? false : (fullCheckPath === (basta.properties.originalName || "").replace(/\\/g, "/"));

            const isDelete = mode === "delete";
            const isSave = mode === "save";
            const isNew = mode === "new" || mode === "newTrigger" || mode === "create";

            // THE COMMIT FIX: Only valid (non-empty) names allowed. Duplicates trigger Overwrite mode.
            const isInvalid = currentName.trim() === "";

            const btnState = isFolderMode
                ? (selectedDir ? "OFF" : "DIS")
                : (isDelete ? "OFF" : (isInvalid ? "DIS" : "OFF"));
            // THE DETECTION FIX: Clashes trigger 'Overwrite' even if identical to source. Save/Duplicate/New now correctly detect collisions.
            const showWarning = !isDelete && isDuplicate && (mode === "rename" ? !isSame : true);
            const warningText = basta.properties.warningMessage || "Duplicate found!";

            // THE THEME-PULSE FIX: Resolve colors from the theme key for the pulse animation
            const paintOFF = resolvePaintData(basta, "t_textSmall", "_OFF");
            const paintON = resolvePaintData(basta, "t_textSmall", "_ON");
            const colA = parseColor(paintOFF?.textColor || paintOFF?.fill);
            const colB = parseColor(paintON?.textColor || paintON?.fill);

            // THE PULSE FIX: Keep the Basta awake to render the warning animation
            if (isDuplicate || isDelete) basta._forceSync = true;

            const map = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y" },
                    dir: "col", width: "full", height: "auto",
                    margin: [mW, 0], // THE FIX: Always respect mW margins to align with finalWidth
                    regionFolder: {
                        hidden: basta.properties.showFolderBrowser !== true,
                        anchor: { target: "contentRegion", axis: "y", offset: oY },
                        dir: "row", width: "full",
                        dropdownFolder: {
                            type: UI_TYPES.FILEBROWSER || "fileBrowser", themeKey: "dialog, t_textNormal",
                            width: "full", height: 20, padding: [pW, pH], spacing: [0, sH],
                            items: basta._fileList || [],
                            value: basta.properties.selectedFolder || "/",
                            mode: "folder",
                            rootName: category,
                            onChange: (v) => {
                                basta.properties.selectedFolder = v;
                                basta.requestDerpSync();
                                if (basta.properties.mode === "folder" && basta.properties.onConfirm) {
                                    basta.properties.onConfirm(v);
                                    basta.close();
                                }
                            }
                        },
                        btnRefreshFolder: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "buttonNode, t_textSystem",
                            icon: "revert",
                            width: "match",
                            height: 20,
                            padding: [pW, pH],
                            spacing: [sW, sH],
                            mouseOver: true,
                            state: "OFF",
                            onPress: () => refreshFileList(basta, true, true)
                        }
                    },
                    infoRegion: {
                        hidden: isFolderMode,
                        dir: "col", width: "full",
                        anchor: { target: "regionFolder", axis: "y", offset: mH },
                        labelMain: {
                            type: UI_TYPES.TEXT,
                            themeKey: basta.properties.messageThemeKey || "t_textNormal",
                            text: basta.properties.customMessage || "Custom message here",
                            labelColor: isDelete ? getPulsedColor(colA, colB, 0.005) : null,
                            width: basta.properties.messageWidth || "auto",
                            labelAlign: basta.properties.messageAlign || ["left", "middle"],
                            wrap: basta.properties.messageWrap || false,
                            margin: [0,mH],
                        },
                        messageBreak: {
                            type: UI_TYPES.LINEBREAK,
                            hidden: basta.properties.showMessageLinebreak !== true,
                            anchor: { target: "labelMain", axis: "y", offset: sH },
                            margin: [-mW, mH, -mW, mH],
                            width: "full"
                        }
                    },
                    editorRegion: {
                        hidden: isDelete || isFolderMode,
                        anchor: { target: "infoRegion", axis: "y", offset: oY },
                        dir: "col",
                        editorNewName: {
                            type: UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textNormal", canvasShield: true,
                            text: basta.properties.pendingName,
                            value: basta.properties.pendingName,
                            width: "full", height: 20, padding: [pW, pH], spacing: [0, sH],
                            onInput: (v) => {
                                basta.properties.pendingName = v;
                                const editorReg = basta.layout?.regions?.editorNewName;
                                if (editorReg) {
                                    editorReg.text = v;
                                    editorReg.value = v;
                                }
                                if (basta._compDataCache) delete basta._compDataCache.editorNewName;
                                basta._forceSync = true;
                                basta.requestDerpSync();
                            },
                            onBlur: (v) => {
                                basta.properties.pendingName = v;
                                const editorReg = basta.layout?.regions?.editorNewName;
                                if (editorReg) {
                                    editorReg.text = v;
                                    editorReg.value = v;
                                }
                                if (basta._compDataCache) delete basta._compDataCache.editorNewName;
                                basta._forceSync = true;
                                basta.requestDerpSync();
                            }
                        },
                    },
                    optionRegion: {
                        hidden: !basta.properties.showOptions,
                        anchor: { target: "editorRegion", axis: "y", offset: oY },
                        dir: "col", width: "full", height: "auto",
                        toggleOption_1: {
                            type: UI_TYPES.TOGGLE, themeKey: "systemButton, t_textSystem",
                            icon: "radio", labelAlign: ["left", "middle"],
                            label: basta.properties.toggleLabel_1 || "Option 1",
                            width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                            value: !!basta.properties.toggleOption_1,
                            onChange: (v) => {
                                basta.properties.toggleOption_1 = v;
                                basta.requestDerpSync();
                            }
                        }
                    }
                },
                footerRegion: {
                    anchor: { target: "contentRegion", axis: "y", offset: oY },
                    labelWarning: {
                        type: UI_TYPES.TEXT,
                        themeKey: "t_textSmall", labelAlign: ["center", "middle"],
                        hidden: isDelete,
                        text: warningText,
                        pulseStates: showWarning,
                        pulseFromState: "_ON",
                        pulseToState: "_DIS",
                        pulseSpeed: 0.005,
                        alpha: showWarning ? 1 : 0,
                        fontWeight: "italic",
                        width: "full", height: "auto", padding: [pW, 0],
                        objectAlign: ["left", "middle"],
                    },
                    regionButtons: {
                        anchor: { target: isDelete ? "contentRegion" : "labelWarning", axis: "y", offset: oY },
                        dir: "row", width: "full", height: "auto",
                        btnCancel: {
                            type: UI_TYPES.BUTTON, themeKey: "buttonNode, t_textSystem",
                            text: "Cancel",
                            width: "auto", height: "auto",
                            objectAlign: ["left", "middle"], labelAlign: ["center", "middle"],
                            onPress: () => basta.close()
                        },
                        btnConfirm: {
                            type: UI_TYPES.BUTTON, themeKey: "buttonNode, t_textSystem",
                            text: isFolderMode ? "Select" : (showWarning ? "Overwrite" : (basta.properties.confirmMessage || (isDelete ? "Delete" : (isSave ? "Save" : (isNew ? "Create" : "Apply"))))),
                            width: "auto", height: "auto",
                            state: btnState, mouseOver: true,
                            objectAlign: ["right", "middle"], labelAlign: ["center", "middle"],
                            onPress: async () => {
                                const soundKey = basta.properties.playSound || basta.properties.mode;
                                if (window.DERP_GLOBAL_SETTINGS?.playSound !== false && SOUND_INDEX[soundKey]) {
                                    SOUND_INDEX[soundKey]();
                                }

                                const oldName = basta.properties.originalName;
                                const selectedDir = (basta.properties.showFolderBrowser && basta.properties.selectedFolder !== "/") ? basta.properties.selectedFolder : "";
                                const newName = selectedDir ? `${selectedDir}/${basta.properties.pendingName}` : basta.properties.pendingName;
                                const mode = basta.properties.mode || "rename";
                                const isDelete = mode === "delete";
                                if (basta.properties.onConfirm) {
                                    await basta.properties.onConfirm(mode === "folder" ? selectedDir : (isDelete ? oldName : newName));
                                    basta.close();
                                    return;
                                }
                                const endpoint = mode === "duplicate" ? "duplicate" : "rename";
                                try {
                                    const res = await fetch(`/xcp/${endpoint}/${currentCategory}`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ oldName, newName })
                                    });
                                    if (res.ok) {
                                        showBastaMessage(host, `${mode.charAt(0).toUpperCase() + mode.slice(1)} Success`, 2000, { width: 250 }, resolvedTargetRegion, false, "success");
                                        if (mode !== "duplicate") {
                                            if (host.properties.activePaletteName !== undefined) host.properties.activePaletteName = newName;
                                            else host.properties.activeFileName = newName;
                                        }
                                        if (mode === "duplicate" && host.onDuplicateSuccess) host.onDuplicateSuccess(newName);
                                        else if (host.onRenameSuccess) host.onRenameSuccess(newName);
                                        basta.close();
                                    } else {
                                        showBastaMessage(host, `${mode.charAt(0).toUpperCase() + mode.slice(1)} Failed`, 3000, { width: 250 }, resolvedTargetRegion, false, "error");
                                    }
                                } catch (e) {
                                    console.error(`[File Handler] ${mode} Error:`, e);
                                    showBastaMessage(host, "Server Error", 3000, { width: 250 }, resolvedTargetRegion, false, "error");
                                }
                            }
                        }
                    }
                }
            };

            if (basta.properties.layoutMapOverride) {
                const ovr = typeof basta.properties.layoutMapOverride === "function" ? basta.properties.layoutMapOverride(basta, vars) : basta.properties.layoutMapOverride;
                if (ovr.contentRegion) {
                    for (const [k, v] of Object.entries(ovr.contentRegion)) {
                        const target = map.contentRegion[k];
                        if (target && typeof v === 'object' && !Array.isArray(v)) {
                            // THE DEEP-MERGE FIX: Recursively merge keys like 'labelMain' inside 'infoRegion' to prevent wiping UI elements
                            for (const [subK, subV] of Object.entries(v)) {
                                if (target[subK] && typeof subV === 'object' && !Array.isArray(subV)) Object.assign(target[subK], subV);
                                else target[subK] = subV;
                            }
                        } else {
                            map.contentRegion[k] = v;
                        }
                    }
                }
                if (ovr.footerRegion) Object.assign(map.footerRegion, ovr.footerRegion);
            }
            return map;
        }
    };

    const existing = activeBastas.get(id);
    logLoraStackFileHandlerAnchor(host, "showFileHandler", {
        targetRegion,
        resolvedTargetRegion,
        mode,
        category,
        hasExisting: !!existing,
        hasTarget: !!host?.layout?.regions?.[resolvedTargetRegion],
        target: host?.layout?.regions?.[resolvedTargetRegion]
            ? {
                x: host.layout.regions[resolvedTargetRegion].x,
                y: host.layout.regions[resolvedTargetRegion].y,
                w: host.layout.regions[resolvedTargetRegion].w,
                h: host.layout.regions[resolvedTargetRegion].h,
            }
            : null,
    });
    if (existing) {
        if (typeof window._xcpCloseActiveFileBrowser === "function") window._xcpCloseActiveFileBrowser();
        existing.hostNode = host;
        existing.targetRegion = resolvedTargetRegion;
        existing.titleLabel = config.titleLabel;
        existing.layoutMap = config.layoutMap;
        existing.properties = { ...existing.properties, ...config.properties };
        existing.properties.mode = mode;
        existing.properties.category = category;
        existing.properties.showFolderBrowser = mode === "folder";
        existing.targetSize = [...config.initialSize];
        existing.size = [...config.initialSize];
        existing._fileList = [];
        existing._compDataCache = {};
        existing._fileBrowserCache = {};
        existing._layoutDirty = true;
        if (resolvedTargetRegion && host?.layout?.regions?.[resolvedTargetRegion] && !host?.properties?.[`bastaOffset_${id}`]) {
            const { oY } = existing.getDerpVars();
            const target = host.layout.regions[resolvedTargetRegion];
            existing.offset = [
                Math.round(target.x + (target.w / 2) - (existing.targetSize[0] / 2)),
                Math.round(target.y - existing.targetSize[1] - oY)
            ];
        }
        existing._layoutMapHash = undefined;
        existing._forceSync = true;
    }

    const bastaInstance = spawnBasta(id, config);
    logLoraStackFileHandlerAnchor(host, "afterSpawnFileHandler", {
        targetRegion,
        resolvedTargetRegion,
        mode,
        category,
        bastaPos: bastaInstance?.pos ? [bastaInstance.pos[0], bastaInstance.pos[1]] : null,
        bastaOffset: bastaInstance?.offset ? [bastaInstance.offset[0], bastaInstance.offset[1]] : null,
        bastaSize: bastaInstance?.targetSize ? [bastaInstance.targetSize[0], bastaInstance.targetSize[1]] : null,
        hasTarget: !!host?.layout?.regions?.[resolvedTargetRegion],
    });

    refreshFileList(bastaInstance);

    return bastaInstance;
}
