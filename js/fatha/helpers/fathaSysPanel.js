/**
 * Path: ./js/fatha/core/fathaSysPanel.js
 * ROLE: A Virtual Fatha "Child" that manages node-specific system settings.
 * INTEGRATION: Uses fathaDOMshield for interaction and GrandFathaLayoutEngine for geometry.
 */
import { app } from "../../../../scripts/app.js";
import { masterPainter } from "../../herbina/masterPainter.js";
import { masterLayoutEngine } from "../core/masterLayoutEngine.js";
import { createDerpShield, syncDerpShield, removeDerpShield } from "../core/fathaDOMshield.js";
import { UI_TYPES, COMPONENT_BLUEPRINTS } from "../core/masterLayoutTypes.js";
import { getPanelBaseMap } from "./fathaLayoutMaps.js";
import { animatePanelSlide, animateAlpha } from "../../herbina/masterAnimator.js";
import { resolvePaintData } from "../../herbina/utils/widgetsUtils.js";
import { loadDerpLocale, handleDerpRequestSync, handleTooltipHover, clearEntityTooltip } from "../core/fathaHandler.js";
import { showBastaFileHandler, getHandlerId } from "../bastas/bastaFileHandler.js";
import { showBastaMessage } from "../bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../bastas/bastaSystemMessage.js";
import { playKaChing, playKaboom } from "../../herbina/masterSoundEffects.js";
import { ensureScreenRectVisible, isWarping } from "../core/fathaWarp.js";

const PANEL_SLIDE_SPEED = 0.5;
const PANEL_FADE_SPEED = 0.3;
const SYS_PANEL_SHIELD_Z = 9000;
const SYS_PANEL_HTML_Z = 9500;

function resolveSavedProfileName(list, savedName) {
    if (!Array.isArray(list) || list.length === 0) return "(No Profiles Found)";
    if (!savedName) return list[0];
    if (list.includes(savedName)) return savedName;
    const lowered = String(savedName).toLowerCase();
    return list.find((name) => String(name).toLowerCase() === lowered) || list[0];
}

function syncCurrentProfileName(node, profileName) {
    if (!node) return;
    node._currentProfileName = profileName;
    if (node.properties) node.properties.selectedProfileName = profileName === "(No Profiles Found)" ? "" : profileName;
}

function logLoraStackProfileAnchor(node, label, payload) {
    if (!node || String(node.type || "").toLowerCase().includes("derplorastack") !== true) return;
    globalThis.DERP_LS_PROFILE_LOGS = globalThis.DERP_LS_PROFILE_LOGS || [];
    const entry = { label, payload, ts: Date.now() };
    globalThis.DERP_LS_PROFILE_LOGS.push(entry);
    if (globalThis.DERP_LS_PROFILE_LOGS.length > 200) globalThis.DERP_LS_PROFILE_LOGS.shift();
    if (globalThis.DERP_LS_PROFILE_CONSOLE === true) {
        console.log(`[LSProfile:${label}] ${JSON.stringify(payload)}`);
    }
}

/**
 * The System Panel State Controller
 * Acts strictly as a "Virtual Node" proxy to satisfy fathaDOMshield and the Layout Engine.
 */
export const sysPanel = {
    isVisible: false,
    isSysPanel: true,
    isSystemPanel: true,
    hostNode: null,
    dynamicElements: {},
    layout: null,
    sysLayoutMap: {},
    animHeight: 0,
    animAlpha: 0,
    offsetGap: 0, // State tracker for theme-driven gap

    // --- OPTIMIZATION TRACKERS (Parity with fatha.js) ---
    _shouldSync: false,
    _layoutDirty: false,
    _prevDerpState: null,

    _pressedRegionKey: null,
    _hoveredRegionKey: null,
    _derpAwakeFrames: 0,
    _pendingViewportFitFrames: 0,
    _viewportFitStarted: false,
    interactionShield: null,

    // --- VIRTUAL NODE INTERFACE ---
    get id() { return this.hostNode?.id || "fatha_sys_panel_global"; },
    get graph() { return this.hostNode?.graph || null; },
    get pos() {
        if (!this.hostNode || !this.hostNode.pos || !this.hostNode.size) return [0, 0];
        // THE TRUE ZERO FIX: Remove the margin subtraction.
        // When offsetGap is 0, the panel top will anchor exactly to the node bottom.
        return [this.hostNode.pos[0], this.hostNode.pos[1] + this.hostNode.size[1] + (this.offsetGap || 0)];
    },
    // THE CRASH FIX: Restored the accidentally deleted size getter!
    get size() {
        const reg = this.layout?.regions?.panelBackground;
        return [reg?.w || 100, this.animHeight];
    },
    get properties() { return this.hostNode?.properties || { debugMode: "None" }; },
    get flags() { return { collapsed: false }; },
    requestDerpSync() { handleDerpRequestSync(this); },

    // Fatha systemic fallback variables
    getDerpVars(self) {
        if (this.hostNode && typeof this.hostNode.getDerpVars === 'function') {
            return this.hostNode.getDerpVars(this.hostNode);
        }
        return { mW: 0, mH: 0, sW: 2, sH: 2, oX: 0, oY: 0, pW: 2, pH: 4, SNAP: 10 };
    },

    /**
     * INTERACTION BRIDGE: Routed from standard fathaDOMshield
     */
    handleShieldInteraction(type, data) {
        if (!this.isVisible || !this.layout) return false;

        const localMouse = [data.localX || 0, data.localY || 0];

        if (type === "hover") {
            let hoveredKey = null;
            const regions = Object.entries(this.layout.regions).reverse();
            for (const [key, reg] of regions) {
                if (reg.type && !reg.noHover && this.layout.hitTest(localMouse, reg)) {
                    hoveredKey = key;
                    break;
                }
            }
            if (this._hoveredRegionKey !== hoveredKey) {
                this._hoveredRegionKey = hoveredKey;
                this.setDirtyCanvas(true);
            }
            handleTooltipHover(this, hoveredKey, localMouse);
            return !!hoveredKey;
        }

        if (type === "dragStart") {
            clearEntityTooltip(this, true);
            const regions = Object.entries(this.layout.regions).reverse();
            for (const [key, reg] of regions) {
                const isInteractive = reg.onPress || reg.onClick || reg.onDblClick || reg.onChange ||
                    reg.type === UI_TYPES.DROPDOWN_DERP ||
                    reg.type === UI_TYPES.DROPDOWN ||
                    reg.type === UI_TYPES.FILEBROWSER ||
                    reg.type === UI_TYPES.TOGGLE ||
                    reg.type === UI_TYPES.TOGGLE_V2;

                if (isInteractive && this.layout.hitTest(localMouse, reg)) {
                    this._pressedRegionKey = key;
                    this._derpAwakeFrames = 15;
                    this.setDirtyCanvas(true);
                    return true;
                }
            }
            // Absorb background clicks so the canvas doesn't pan
            if (this.layout.hitTest(localMouse, this.layout.regions.panelBackground)) return true;
        }

        if (type === "click" || type === "pointerup") {
            clearEntityTooltip(this, true);
            const key = this._pressedRegionKey;
            this._pressedRegionKey = null;

            if (key && this.layout.regions[key]) {
                const reg = this.layout.regions[key];
                if (reg.onPress) reg.onPress(data.originalEvent, data);
                else if (reg.onClick) reg.onClick(data.originalEvent, data);
                else if (reg.onChange) {
                    this._derpAwakeFrames = 15;
                    reg.onChange(!reg.value, data);
                }

                if (reg.type === UI_TYPES.DROPDOWN_DERP || reg.type === UI_TYPES.FILEBROWSER) {
                    this._pressedRegionKey = key;
                }
                this.setDirtyCanvas(true);
                return true;
            }

            // Close if clicking completely outside the panel
            if (type === "click" && !this.layout.hitTest(localMouse, this.layout.regions.panelBackground)) {
                closeDerpSysPanel();
            }
            return true;
        }

        if (type === "dragEnd") {
            clearEntityTooltip(this, true);
            this._pressedRegionKey = null;
            return true;
        }

        return false;
    },

    setDirtyCanvas(b1, b2) {
        if (this.hostNode) this.hostNode.setDirtyCanvas(b1, b2);
    }
};

export function isHostActive(nodeId) {
    return sysPanel.isVisible && sysPanel.hostNode?.id === nodeId;
}

/**
 * MAIN RENDER LOOP: Mirrors Fatha's onDrawForeground but for the systemic overlay.
 */
export function drawDerpSysPanelGlobal(ctx) {
    // THE RENDER GATE: Block drawing if we're between visibility=true and the fetch completing
    if (!sysPanel.isVisible || !sysPanel.hostNode || !window.xcpDerpLocaleData) return;

    const node = sysPanel.hostNode;

    // THE ABSOLUTE STROKE WEIGHT FIX:
    // 1. Identify current state (Bypass > Selection > Normal)
    const isBypassed = node.mode === 4 || node.mode === 2 || node._derpSpoofedBypass;
    const isSelected = !!app.canvas.selected_nodes?.[node.id] || node.selected || node._isVirtualSelected;
    const suffix = isBypassed ? "_DIS" : (isSelected ? "_ON" : "");

    // 2. Pull the 'canvas' theme data
    const paint = resolvePaintData(node, "canvas", suffix);
    let pulledWeight = 0;

    if (paint) {
        if (typeof paint.lineWidth === 'number') pulledWeight = paint.lineWidth;
        else if (Array.isArray(paint.stroke)) pulledWeight = paint.stroke[0];

        if (!pulledWeight) {
            const sysCfg = window.xcpDerpThemeConfig;
            if (sysCfg && sysCfg.themes) {
                const themeName = node.properties?.selectedTheme || sysCfg.activeTheme || "Template_Standard_v02";
                const theme = sysCfg.themes[themeName];
                const rawCanvas = theme?.[`canvas${suffix}`] || theme?.canvas;
                if (rawCanvas && Array.isArray(rawCanvas.stroke)) {
                    pulledWeight = rawCanvas.stroke[0];
                }
            }
        }
    }

    sysPanel.offsetGap = 0;

    // --- THE OPTIMIZATION GATING ---
    const canvasDS = app.canvas.ds;
    const curX = sysPanel.pos[0], curY = sysPanel.pos[1];
    const curW = sysPanel.size[0], curH = sysPanel.size[1];
    const hostW = node.size[0]; // THE FIX: Track the host node's width specifically
    const curS = canvasDS.scale;
    const curOX = canvasDS.offset[0], curOY = canvasDS.offset[1];

    const hasMoved = !sysPanel._prevDerpState ||
        sysPanel._prevDerpState.posX !== curX || sysPanel._prevDerpState.posY !== curY ||
        sysPanel._prevDerpState.sizeW !== curW || sysPanel._prevDerpState.sizeH !== curH ||
        sysPanel._prevDerpState.hostW !== hostW || // THE FIX: Force sync if host width changes
        sysPanel._prevDerpState.scale !== curS ||
        sysPanel._prevDerpState.offsetX !== curOX || sysPanel._prevDerpState.offsetY !== curOY ||
        sysPanel._prevDerpState.selected !== isSelected ||
        sysPanel._prevDerpState.bypassed !== isBypassed ||
        sysPanel._prevDerpState.offsetGap !== sysPanel.offsetGap ||
        sysPanel._prevDerpState.hoveredKey !== sysPanel._hoveredRegionKey ||
        sysPanel._prevDerpState.pressedKey !== sysPanel._pressedRegionKey;

    let isAnimating = false;
    if (sysPanel._derpAwakeFrames > 0) {
        sysPanel._derpAwakeFrames--;
        isAnimating = true;
        sysPanel.setDirtyCanvas(true, true);
    }

    // Determine final sync requirement for this frame
    sysPanel._shouldSync = hasMoved || node._forceSync || sysPanel._layoutDirty || isAnimating;
    if (sysPanel._layoutDirty) sysPanel._layoutDirty = false;

    // 1. Setup Layout Engine
    if (!sysPanel.layout) sysPanel.layout = new masterLayoutEngine(sysPanel);

    if (sysPanel._shouldSync) {
        const { sysProfileRegion, footerMargin, ...baseFramework } = getPanelBaseMap(node, app, sysPanel, closeDerpSysPanel);

        if (sysProfileRegion) {
            const hasProfile = node._currentProfileName && node._currentProfileName !== "(No Profiles Found)";
            const resetFileHandlerAnchor = () => {
                if (node?.properties) delete node.properties[`bastaOffset_${getHandlerId()}`];
            };
            const captureAnchorState = (key) => {
                const sysReg = sysPanel.layout?.regions?.[key] || null;
                const hostReg = node.layout?.regions?.[`sys_${key}`] || null;
                return {
                    key,
                    hasSysReg: !!sysReg,
                    hasHostReg: !!hostReg,
                    sysReg: sysReg ? { x: sysReg.x, y: sysReg.y, w: sysReg.w, h: sysReg.h } : null,
                    hostReg: hostReg ? { x: hostReg.x, y: hostReg.y, w: hostReg.w, h: hostReg.h } : null,
                    nodePos: node.pos ? [node.pos[0], node.pos[1]] : null,
                    nodeSize: node.size ? [node.size[0], node.size[1]] : null,
                    panelPos: [sysPanel.pos[0], sysPanel.pos[1]],
                };
            };

            sysProfileRegion.btnSave.state = "OFF";

            sysProfileRegion.btnRename.onPress = () => {
                if (!hasProfile) return;
                resetFileHandlerAnchor();
                logLoraStackProfileAnchor(node, "beforeRename", captureAnchorState("btnRename"));
                showBastaFileHandler(node, "none", "sys_btnRename", {
                    title: `Rename Profile: ${node._currentProfileName}`,
                    message: "Enter new name for profile:",
                    confirm: "Rename",
                    warning: "Profile name already exists!",
                    originalName: node._currentProfileName,
                    fileList: node._sysProfileCache || [],
                    properties: { bastaMovalbe: false },
                    onConfirm: async (newName) => {
                        // overwrite allowed without confirm
                        if (node._sysProfileData && node._sysProfileData[node._currentProfileName]) {
                            node._sysProfileData[newName] = node._sysProfileData[node._currentProfileName];
                            if (node._currentProfileName !== newName) delete node._sysProfileData[node._currentProfileName];
                            node._currentProfileName = newName;
                            node._sysProfileCache = Object.keys(node._sysProfileData);

                            const fileName = node._sysProfileFile;
                            const category = node._sysProfileFolder === "nodeSettings" ? "settings" : node._sysProfileFolder;
                            try {
                                await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: fileName, data: node._sysProfileData })
                                });
                            } catch (e) { console.error(e); }

                            playKaChing();
                            showBastaSystemMessage(node, "Profile Renamed: ", 3000, { fade: true, grow: true }, "sys_btnRename", "warning", null, newName);
                            sysPanel._layoutDirty = true;
                            sysPanel.requestDerpSync();
                        }
                    }
                });
            };

            sysProfileRegion.btnCopy.onPress = () => {
                if (!hasProfile) return;
                resetFileHandlerAnchor();
                logLoraStackProfileAnchor(node, "beforeCopy", captureAnchorState("btnCopy"));
                showBastaFileHandler(node, "none", "sys_btnCopy", {
                    title: `Duplicate Profile: ${node._currentProfileName}`,
                    message: "Enter name for new profile copy:",
                    confirm: "Duplicate",
                    warning: "Profile name already exists!",
                    mode: "duplicate",
                    originalName: node._currentProfileName,
                    fileList: node._sysProfileCache || [],
                    properties: { bastaMovalbe: false },
                    onConfirm: async (newName) => {
                        // overwrite allowed without confirm
                        if (node._sysProfileData && node._sysProfileData[node._currentProfileName]) {
                            node._sysProfileData[newName] = JSON.parse(JSON.stringify(node._sysProfileData[node._currentProfileName]));
                            node._currentProfileName = newName;
                            node._sysProfileCache = Object.keys(node._sysProfileData);

                            const fileName = node._sysProfileFile;
                            const category = node._sysProfileFolder === "nodeSettings" ? "settings" : node._sysProfileFolder;
                            try {
                                await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: fileName, data: node._sysProfileData })
                                });
                            } catch (e) { console.error(e); }

                            playKaChing();
                            showBastaSystemMessage(node, "Profile Duplicated: ", 3000, { fade: true, grow: true }, "sys_btnCopy", "warning", null, newName);
                            sysPanel._layoutDirty = true;
                            sysPanel.requestDerpSync();
                        }
                    }
                });
            };

            sysProfileRegion.btnSave.onPress = () => {
                if (!hasProfile) {
                    resetFileHandlerAnchor();
                    logLoraStackProfileAnchor(node, "beforeSaveCreate", captureAnchorState("btnSave"));
                    showBastaFileHandler(node, "none", "sys_btnSave", {
                        title: "Create New Profile",
                        message: "Enter name for new profile:",
                        confirm: "Create",
                        warning: "Profile name already exists!",
                        mode: "newTrigger",
                        originalName: "Profile_01",
                        fileList: node._sysProfileCache || [],
                        properties: { bastaMovalbe: false },
                        onConfirm: async (newName) => {
                            // overwrite allowed without confirm
                            const fileName = node._sysProfileFile;
                            const category = node._sysProfileFolder === "nodeSettings" ? "settings" : node._sysProfileFolder;

                            if (!node._sysProfileData) node._sysProfileData = {};
                            if (node.exportDerpProfile) {
                                node._sysProfileData[newName] = node.exportDerpProfile();
                            } else {
                                node._sysProfileData[newName] = {};
                            }

                            try {
                                const res = await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: fileName, data: node._sysProfileData })
                                });
                                if (res.ok) {
                                    node._currentProfileName = newName;
                                    node._sysProfileCache = Object.keys(node._sysProfileData);
                                    playKaChing();
                                    showBastaSystemMessage(node, "Profile Saved: ", 3000, { fade: true, grow: true }, "sys_btnSave", "warning", null, newName);
                                    sysPanel._layoutDirty = true;
                                    sysPanel.requestDerpSync();
                                }
                            } catch (e) { console.error(e); }
                        }
                    });
                    return;
                }

                resetFileHandlerAnchor();
                logLoraStackProfileAnchor(node, "beforeSaveExisting", captureAnchorState("btnSave"));
                showBastaFileHandler(node, "none", "sys_btnSave", {
                    title: `Save Profile: ${node._currentProfileName}`,
                    message: `Save changes to current profile?`,
                    confirm: "Save",
                    mode: "save",
                    originalName: node._currentProfileName,
                    fileList: node._sysProfileCache || [],
                    properties: { bastaMovalbe: false },
                    onConfirm: async (newName) => {
                        // overwrite allowed without confirm
                        const fileName = node._sysProfileFile;
                        const category = node._sysProfileFolder === "nodeSettings" ? "settings" : node._sysProfileFolder;
                        if (node.exportDerpProfile) {
                            node._sysProfileData[newName] = node.exportDerpProfile();
                        }
                        if (newName !== node._currentProfileName) delete node._sysProfileData[node._currentProfileName];
                        node._currentProfileName = newName;
                        node._sysProfileCache = Object.keys(node._sysProfileData);
                        try {
                            const res = await fetch(`/xcp/save/${category}`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: fileName, data: node._sysProfileData })
                            });
                            if (res.ok) {
                                playKaChing();
                                showBastaSystemMessage(node, "Profile Saved: ", 3000, { fade: true, grow: true }, "sys_btnSave", "warning", null, newName);
                                sysPanel._layoutDirty = true;
                                sysPanel.requestDerpSync();
                            }
                        } catch (e) { console.error(e); }
                    }
                });
            };

            sysProfileRegion.btnDelete.onPress = () => {
                if (!hasProfile) return;
                resetFileHandlerAnchor();
                logLoraStackProfileAnchor(node, "beforeDelete", captureAnchorState("btnDelete"));
                showBastaFileHandler(node, "none", "sys_btnDelete", {
                    title: `Delete Profile: ${node._currentProfileName}`,
                    message: `Permanently delete profile: ${node._currentProfileName}?`,
                    confirm: "Delete",
                    mode: "delete",
                    originalName: node._currentProfileName,
                    properties: { bastaMovalbe: false },
                    onConfirm: async () => {
                        if (node._sysProfileData && node._sysProfileData[node._currentProfileName]) {
                            const deletedName = node._currentProfileName;
                            delete node._sysProfileData[node._currentProfileName];
                            node._sysProfileCache = Object.keys(node._sysProfileData);
                            if (node._sysProfileCache.length === 0) {
                                node._sysProfileCache = ["(No Profiles Found)"];
                                node._currentProfileName = node._sysProfileCache[0];
                            } else {
                                node._currentProfileName = node._sysProfileCache[0];
                            }

                            const fileName = node._sysProfileFile;
                            const category = node._sysProfileFolder === "nodeSettings" ? "settings" : node._sysProfileFolder;
                            try {
                                await fetch(`/xcp/save/${category}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: fileName, data: node._sysProfileData })
                                });
                            } catch (e) { console.error(e); }

                            playKaboom();
                            showBastaSystemMessage(node, "Profile Deleted: ", 3000, { fade: true, grow: true }, "sys_btnDelete", "critical", null, deletedName);
                            sysPanel._layoutDirty = true;
                            sysPanel.requestDerpSync();
                        }
                    }
                });
            };
        }

        const mergedMap = {
            ...baseFramework,
            ...node.sysLayoutMap,
            sysProfileRegion,
            footerMargin
        };

        const textTheme = node._t_textSmallPaintData || node._t_textNormalPaintData || { font: "Arial", fontSize: 10, fill: "red", textColor: "red" };
        const bounds = { x: 0, y: 0, w: node.size[0], h: 0 };

        sysPanel.layout.compute(bounds, mergedMap, {
            textTheme,
            isSystemPanel: true,
            debugMode: node.properties.debugMode
        }, node._forceSync || sysPanel._shouldSync);

        // Bridge sysPanel geometries into the host node so Bastas can anchor perfectly
        if (node.layout && node.layout.regions && sysPanel.layout.regions) {
            const yOffset = sysPanel.pos[1] - node.pos[1];
            ["btnRename", "btnCopy", "btnSave", "btnDelete"].forEach(key => {
                const reg = sysPanel.layout.regions[key];
                if (reg) {
                    node.layout.regions[`sys_${key}`] = { ...reg, y: reg.y + yOffset };
                }
            });
        }
    }

    const regions = sysPanel.layout.regions;
    const targetH = regions?.panelBackground?.h || 0;

    // 3. Handle Animations
    const useAnim = node.properties.useAnimations !== false;
    const slide = animatePanelSlide(sysPanel.animHeight, targetH, PANEL_SLIDE_SPEED, useAnim);
    const fade = animateAlpha(sysPanel.animAlpha, 1.0, PANEL_FADE_SPEED, useAnim);

    sysPanel.animHeight = slide.value;
    sysPanel.animAlpha = fade.value;

    if (slide.isAnimating || fade.isAnimating) {
        sysPanel._shouldSync = true;
        sysPanel.setDirtyCanvas(true, true);
    }

    if (sysPanel._pendingViewportFitFrames > 0) {
        if (!isWarping()) {
            sysPanel._pendingViewportFitFrames--;
            const ds = app.canvas?.ds;
            const canvasRect = app.canvas?.canvas?.getBoundingClientRect?.();
            if (ds && canvasRect) {
                const scale = Number(ds.scale) || 1;
                const fitHeight = Math.max(sysPanel.animHeight || 0, targetH || 0);
                const screenRect = {
                    left: canvasRect.left + ((sysPanel.pos[0] + (Number(ds.offset[0]) || 0)) * scale),
                    top: canvasRect.top + ((sysPanel.pos[1] + (Number(ds.offset[1]) || 0)) * scale),
                    width: Math.max(1, (sysPanel.size[0] || 0) * scale),
                    height: Math.max(1, fitHeight * scale),
                };
                ensureScreenRectVisible(screenRect, {
                    viewportMargin: 8,
                    axis: "y",
                    durationMs: 220,
                    easing: "easeOutQuad",
                });
                sysPanel._viewportFitStarted = true;
            }
        }
    }

    // 4. Draw the Physical Panel Context
    ctx.save();
    ctx.translate(sysPanel.pos[0], sysPanel.pos[1]);
    ctx.globalAlpha = sysPanel.animAlpha;

    const bgPaint = node._systemBackgroundPaintData_OFF || node._systemBackgroundPaintData || { fill: "red" };
    if (regions?.panelBackground && bgPaint) {
        const reg = regions.panelBackground;
        masterPainter(ctx, {
            posX: reg.x, posY: reg.y, width: reg.w, height: sysPanel.animHeight, // Removed + mH
            color: bgPaint.fill, paintData: bgPaint
        });
    }

    // 5. Component Blueprint Loop (Canvas & HTML Sync)
    const usedKeys = new Set();
    const textTheme = node._t_textSmallPaintData || node._t_textNormalPaintData || { font: "Arial", fontSize: 10, fill: "red", textColor: "red" };

    if (regions) {
        for (const [key, reg] of Object.entries(regions)) {
            if (!reg.type || key === "panelBackground") continue;

            const blueprint = COMPONENT_BLUEPRINTS[reg.type];
            if (!blueprint) continue;

            usedKeys.add(key);

            const finalReg = {
                ...reg,
                key: key,
                alpha: sysPanel.animAlpha,
                isSysPanel: true,
                isSystemPanel: true,
                isPressed: sysPanel._pressedRegionKey === key,
                isHovered: sysPanel._hoveredRegionKey === key,
                textTheme: textTheme,
                value: reg.value,
                geometry: { x: reg.x, y: reg.y, w: reg.w, h: reg.h }
            };

            // Garbage collect mismatched old HTML elements
            if (!blueprint.isHtml && !blueprint.isHybrid && sysPanel.dynamicElements[key]) {
                sysPanel.dynamicElements[key].remove();
                delete sysPanel.dynamicElements[key];
            }

            if (blueprint.isHtml) {
                let isNewElement = false;
                if (!sysPanel.dynamicElements[key]) {
                    sysPanel.dynamicElements[key] = blueprint.create(finalReg);
                    document.body.appendChild(sysPanel.dynamicElements[key]);
                    isNewElement = true;
                }

                // THE GATING FIX: Heavy HTML syncing is strictly gated by _shouldSync or initial creation
                if (sysPanel._shouldSync || isNewElement) {
                    blueprint.sync(sysPanel.dynamicElements[key], sysPanel, app, finalReg);
                }
            } else if (blueprint.isHybrid) {
                // Hybrid elements rely on canvas rendering every frame, their internal HTML manages itself
                blueprint.sync(ctx, sysPanel, app, finalReg);
            } else {
                // Pure Canvas elements MUST draw every frame to prevent vanishing
                blueprint.sync(ctx, sysPanel, finalReg);
            }
        }
    }

    // 6. HTML Garbage Collection for obsolete UI elements
    if (sysPanel.dynamicElements) {
        for (const domKey in sysPanel.dynamicElements) {
            if (!usedKeys.has(domKey)) {
                sysPanel.dynamicElements[domKey].remove();
                delete sysPanel.dynamicElements[domKey];
            }
        }
    }

    ctx.restore();

    // 7. Shield Sync (Updates physical hitboxes to match canvas)
    if (sysPanel.interactionShield) {
        syncDerpShield(sysPanel);
    }
    // 8. Update Optimization State Cache
    if (sysPanel._shouldSync) {
        sysPanel._prevDerpState = {
            posX: curX, posY: curY,
            sizeW: curW, sizeH: curH,
            hostW: node.size[0], // THE FIX: Store host width in the cache
            scale: curS,
            offsetX: curOX, offsetY: curOY,
            selected: isSelected,
            bypassed: isBypassed,
            offsetGap: sysPanel.offsetGap,
            hoveredKey: sysPanel._hoveredRegionKey,
            pressedKey: sysPanel._pressedRegionKey
        };
    }
}

export async function toggleDerpSysPanel(hostNode) {
    if (!hostNode) return;

    // THE COMPILED SYNC: Resolve the current language from ComfyUI's native settings
    if (!window.xcpDerpLocaleData) {
        const comfyLocale = app.ui.settings.getSettingValue("Comfy.Locale") || "en-US";
        await loadDerpLocale(comfyLocale);
    }

    if (sysPanel.isVisible) {
        const isSame = sysPanel.hostNode?.id === hostNode.id;
        closeDerpSysPanel();
        if (isSame) return;
    }

    // Ensure the singleton sysPanel never reuses paint data from a previously opened host.
    // resolvePaintData() checks panel-local *_PaintData first, so stale keys can leak theme style.
    Object.keys(sysPanel).forEach((k) => {
        if (/^_.*PaintData(?:_(?:ON|OFF|DIS))?$/i.test(k)) {
            delete sysPanel[k];
        }
    });
    Object.keys(hostNode).forEach((k) => {
        if (/^_.*PaintData(?:_(?:ON|OFF|DIS))?$/i.test(k)) {
            sysPanel[k] = hostNode[k];
        }
    });

    sysPanel.hostNode = hostNode;
    sysPanel.isVisible = true;
    window.xcpFathaSysState = sysPanel;
    sysPanel.baseZIndex = String(SYS_PANEL_SHIELD_Z);
    sysPanel._masterZHtml = SYS_PANEL_HTML_Z;
    sysPanel.animHeight = 0;
    sysPanel.animAlpha = 0;
    sysPanel._pendingViewportFitFrames = 6;
    sysPanel._viewportFitStarted = false;

    const SYS_PANEL_OUTSIDE_DRAG_THRESHOLD = 4;

    function isOutsideSysPanel(e) {
        if (window.DERP_GLOBAL_SETTINGS?.closeSysPanelOnOutsideClick === false) return false;
        if (!sysPanel.isVisible || !sysPanel.layout?.regions?.panelBackground) return false;
        if (window.__xcpHasActiveDropdown || window.__xcpHasActiveFileBrowser) return false;
        if (sysPanel.interactionShield?.contains(e.target)) return false;
        if (sysPanel.hostNode?.interactionShield?.contains?.(e.target)) {
            const host = sysPanel.hostNode;
            const sysBtn = host.layout?.regions?.systemBtn;
            if (sysBtn && app?.canvas?.canvas && app?.canvas?.ds) {
                const rect = app.canvas.canvas.getBoundingClientRect();
                const ds = app.canvas.ds;
                const canvasX = (e.clientX - rect.left) / ds.scale - ds.offset[0];
                const canvasY = (e.clientY - rect.top) / ds.scale - ds.offset[1];
                const localMouse = [canvasX - host.pos[0], canvasY - host.pos[1]];
                const isOnSystemBtn = sysBtn.hitTest
                    ? sysBtn.hitTest(localMouse, sysBtn)
                    : (host.layout?.hitTest ? host.layout.hitTest(localMouse, sysBtn) : false);
                if (isOnSystemBtn) return false;
            }
        }
        if (Object.values(sysPanel.dynamicElements || {}).some((el) => el?.contains?.(e.target))) return false;

        const rect = app.canvas.canvas.getBoundingClientRect();
        const ds = app.canvas.ds;
        const canvasX = (e.clientX - rect.left) / ds.scale - ds.offset[0];
        const canvasY = (e.clientY - rect.top) / ds.scale - ds.offset[1];
        const localMouse = [canvasX - sysPanel.pos[0], canvasY - sysPanel.pos[1]];

        return !sysPanel.layout.hitTest(localMouse, sysPanel.layout.regions.panelBackground);
    }

    if (sysPanel._outsidePointerDownHandler) {
        window.removeEventListener("pointerdown", sysPanel._outsidePointerDownHandler, true);
    }
    if (sysPanel._outsidePointerMoveHandler) {
        window.removeEventListener("pointermove", sysPanel._outsidePointerMoveHandler, true);
    }
    if (sysPanel._outsidePointerUpHandler) {
        window.removeEventListener("pointerup", sysPanel._outsidePointerUpHandler, true);
    }

    sysPanel._pendingOutsidePointerId = null;
    sysPanel._pendingOutsidePointerDragged = false;

    sysPanel._outsidePointerDownHandler = (e) => {
        if (!isOutsideSysPanel(e)) return;
        sysPanel._pendingOutsidePointerId = e.pointerId;
        sysPanel._pendingOutsidePointerStartX = e.clientX;
        sysPanel._pendingOutsidePointerStartY = e.clientY;
        sysPanel._pendingOutsidePointerDragged = false;
    };
    window.addEventListener("pointerdown", sysPanel._outsidePointerDownHandler, true);

    sysPanel._outsidePointerMoveHandler = (e) => {
        if (sysPanel._pendingOutsidePointerId !== e.pointerId) return;
        const dx = e.clientX - sysPanel._pendingOutsidePointerStartX;
        const dy = e.clientY - sysPanel._pendingOutsidePointerStartY;
        if (Math.hypot(dx, dy) >= SYS_PANEL_OUTSIDE_DRAG_THRESHOLD) {
            sysPanel._pendingOutsidePointerDragged = true;
        }
    };
    window.addEventListener("pointermove", sysPanel._outsidePointerMoveHandler, true);

    sysPanel._outsidePointerUpHandler = (e) => {
        if (sysPanel._pendingOutsidePointerId !== e.pointerId) return;
        const wasDragged = sysPanel._pendingOutsidePointerDragged;
        sysPanel._pendingOutsidePointerId = null;
        sysPanel._pendingOutsidePointerDragged = false;
        if (!wasDragged) {
            closeDerpSysPanel();
        }
    };
    window.addEventListener("pointerup", sysPanel._outsidePointerUpHandler, true);

    // THE OPTIMIZATION FIX: Purge the cache on open to force an immediate fresh sync
    sysPanel._prevDerpState = null;
    sysPanel._shouldSync = true;
    sysPanel._layoutDirty = true;

    createDerpShield(sysPanel);

    if (hostNode.onDerpSysPanelOpen) {
        hostNode.onDerpSysPanelOpen({
            setLayoutMap: (map) => { hostNode.sysLayoutMap = map; },
            showProfiles: (fileName, subFolder) => {
                const reportMissingProfiles = () => {
                    showBastaSystemMessage(hostNode, "Profile File Missing", 3200, { fade: true, grow: true }, null, "error", null, fileName);
                };

                hostNode._sysProfileActive = true;
                hostNode._sysProfileFile = fileName;
                hostNode._sysProfileFolder = subFolder;

                if (!hostNode._sysProfileCache) {
                    // INDIVIDUAL FILE NODES (Requires /xcp/list)
                    const isIndividual = (fileName === "derpPromptBook" || fileName === "triggerWallDeck");
                    if (isIndividual) {
                        fetch(`/xcp/list/${fileName}`)
                            .then(res => {
                                if (!res.ok) {
                                    reportMissingProfiles();
                                    throw new Error(`Profile list ${fileName} not found.`);
                                }
                                return res.json();
                            })
                            .then(res => {
                                hostNode._sysProfileCache = (res.items && res.items.length > 0) ? res.items.sort() : ["(No Profiles Found)"];
                                syncCurrentProfileName(hostNode, resolveSavedProfileName(hostNode._sysProfileCache, hostNode.properties?.selectedProfileName || hostNode._currentProfileName));
                                sysPanel._layoutDirty = true;
                                hostNode.setDirtyCanvas(true, true);
                            })
                            .catch((e) => {
                                console.error(e);
                                hostNode._sysProfileCache = ["(No Profiles Found)"];
                                syncCurrentProfileName(hostNode, hostNode._sysProfileCache[0]);
                                sysPanel._layoutDirty = true;
                                hostNode.setDirtyCanvas(true, true);
                            });
                    } else {
                        // SINGLE JSON ENTRY NODES (Requires /xcp/load keys)
                        const category = subFolder === "nodeSettings" ? "settings" : subFolder;
                        fetch(`/xcp/load/${category}?name=${fileName}`)
                            .then(res => {
                                if (!res.ok) {
                                    reportMissingProfiles();
                                    throw new Error(`Profile file ${fileName} not found.`);
                                }
                                return res.json();
                            })
                            .then(res => {
                                const data = res.data || {};
                                hostNode._sysProfileData = data;
                                hostNode._sysProfileCache = Object.keys(data).sort();
                                if (hostNode._sysProfileCache.length === 0) hostNode._sysProfileCache = ["(No Profiles Found)"];
                                syncCurrentProfileName(hostNode, resolveSavedProfileName(hostNode._sysProfileCache, hostNode.properties?.selectedProfileName || hostNode._currentProfileName));
                                sysPanel._layoutDirty = true;
                                hostNode.setDirtyCanvas(true, true);
                            })
                            .catch((e) => {
                                console.error(e);
                                hostNode._sysProfileData = {};
                                hostNode._sysProfileCache = ["(No Profiles Found)"];
                                syncCurrentProfileName(hostNode, hostNode._sysProfileCache[0]);
                                sysPanel._layoutDirty = true;
                                hostNode.setDirtyCanvas(true, true);
                            });
                    }
                }
            }
        });
    }

    sysPanel.setDirtyCanvas(true, true);
}

export function closeDerpSysPanel() {
    if (sysPanel.hostNode?.onDerpSysPanelClose) {
        sysPanel.hostNode.onDerpSysPanelClose();
    }

    if (sysPanel.hostNode?.layout?.regions) {
        ["sys_btnRename", "sys_btnCopy", "sys_btnSave", "sys_btnDelete"].forEach(key => {
            delete sysPanel.hostNode.layout.regions[key];
        });
        sysPanel.hostNode.setDirtyCanvas(true, true);
    }

    if (sysPanel.dynamicElements) {
        Object.values(sysPanel.dynamicElements).forEach(el => el?.remove());
        sysPanel.dynamicElements = {};
    }

    if (sysPanel._outsidePointerDownHandler) {
        window.removeEventListener("pointerdown", sysPanel._outsidePointerDownHandler, true);
        sysPanel._outsidePointerDownHandler = null;
    }
    if (sysPanel._outsidePointerMoveHandler) {
        window.removeEventListener("pointermove", sysPanel._outsidePointerMoveHandler, true);
        sysPanel._outsidePointerMoveHandler = null;
    }
    if (sysPanel._outsidePointerUpHandler) {
        window.removeEventListener("pointerup", sysPanel._outsidePointerUpHandler, true);
        sysPanel._outsidePointerUpHandler = null;
    }
    sysPanel._pendingOutsidePointerId = null;
    sysPanel._pendingOutsidePointerDragged = false;

    removeDerpShield(sysPanel);

    sysPanel.isVisible = false;
    if (window.xcpFathaSysState === sysPanel) {
        window.xcpFathaSysState = null;
    }
    sysPanel.hostNode = null;
    sysPanel.layout = null;

    // THE OPTIMIZATION FIX: Purge cache on close to free memory
    sysPanel._prevDerpState = null;

    if (app.graph) app.graph.setDirtyCanvas(true, true);
}
