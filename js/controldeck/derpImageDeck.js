/**
 * Path: ./js/controldeck/derpImageDeck.js
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpImageDeckCore } from "./core/derpImageDeck_core.js";
import { runWirelessHeartbeat } from "../fatha/core/masterSignalEngine.js";
import { showBastaMessage } from "../fatha/bastas/bastaMessage.js";

async function copyImageUrlToClipboard(imageUrl) {
    if (!imageUrl || !navigator.clipboard || typeof navigator.clipboard.write !== "function") return;
    const res = await fetch(imageUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
        new ClipboardItem({ [blob.type || "image/png"]: blob })
    ]);
}

function getImageDeckCurrentImage(node) {
    const list = Array.isArray(node?._derpImageDeckList) ? node._derpImageDeckList : [];
    if (list.length === 0) return null;
    let idx = Number.isInteger(node?._derpImageDeckIndex) ? node._derpImageDeckIndex : (list.length - 1);
    if (idx < 0) idx = 0;
    if (idx >= list.length) idx = list.length - 1;
    return list[idx] || null;
}

async function saveImageDeckCurrentImage(node) {
    const image = getImageDeckCurrentImage(node);
    if (!image || !image.filename) {
        showBastaMessage(node, "No image to save", 1800, { fade: true }, "btnSaveImage", false, "error");
        return;
    }

    const editorName = node.getImageDeckFilenameText ? node.getImageDeckFilenameText() : "";
    const payload = {
        filename: image.filename,
        type: image.type || "output",
        subfolder: image.subfolder || "",
        save_name: String(editorName || "").trim()
    };

    const res = await fetch("/xcp/derp_image_deck/save_current_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
        const msg = data?.error || "Save failed";
        showBastaMessage(node, msg, 2200, { fade: true }, "btnSaveImage", false, "error");
        return;
    }

    showBastaMessage(node, `Saved: ${data.filename}`, 2200, { fade: true, grow: true }, "btnSaveImage", false, "success");
}

app.registerExtension({
    name: "xcp.derpImageDeck_Extension",

    async setup() {
        initDerpGlobalListener();

        if (!window._xcpDerpImageDeckPromptBridgeInstalled) {
            window._xcpDerpImageDeckPromptBridgeInstalled = true;
            const originalGraphToPrompt = app.graphToPrompt;
            app.graphToPrompt = function() {
                const injectWirelessImageInputs = (promptData) => {
                    const output = promptData && promptData.output ? promptData.output : promptData;
                    if (!output || !app.graph || !app.graph._nodes) return promptData;

                    app.graph._nodes.forEach((node) => {
                        if (!node || node._isDerpImageDeckNode !== true) return;
                        const signalId = node.properties && node.properties.multiSignalIds
                            ? (node.properties.multiSignalIds[0] || node.properties.multiSignalIds["0"])
                            : null;
                        if (!signalId) return;

                        const parts = String(signalId).split(":");
                        const sourceId = parts[0];
                        const sourceSlot = parts.length > 1 ? parseInt(parts[1], 10) : 0;
                        const target = output[String(node.id)];
                        if (!target) return;
                        if (!target.inputs) target.inputs = {};
                        if (target.inputs.images) return;

                        target.inputs.images = [String(sourceId), Number.isNaN(sourceSlot) ? 0 : sourceSlot];
                    });

                    return promptData;
                };

                const res = originalGraphToPrompt.apply(this, arguments);
                return (res instanceof Promise) ? res.then(injectWirelessImageInputs) : injectWirelessImageInputs(res);
            };
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const nodeName = nodeData && typeof nodeData.name === "string" ? nodeData.name.toLowerCase() : "";
        if (!nodeName.includes("imagedeck")) return;

        fatha(nodeType, nodeData, 220);
        initDerpImageDeckCore(nodeType);
        nodeType.prototype._isDerpImageDeckNode = true;

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this.refreshNodeLayoutMap();
            this.refreshDerpImageDeckSysMap();
        };

        nodeType.prototype.updateImageDeckSignalFilters = function() {
            const baseTypes = ["IMAGE"];
            const additionalTypes = this.properties.toggleModelInfo === false ? [] : ["MODEL"];
            this.signalFilters = { types: baseTypes, additionalTypes };
        };

        nodeType.prototype.getImageDeckModelNamePrefix = function() {
            if (this.properties.toggleModelInfo === false) return "";
            const ids = this.properties.multiSignalIds || {};
            const modelSignalId = ids[1] || ids["1"] || ids.Model || ids.MODEL || null;
            const sigs = window.xcpDerpSignals || {};
            const sig = modelSignalId ? sigs[modelSignalId] : Object.values(sigs).find(s => String(s?.type || "").toUpperCase() === "MODEL");
            if (!sig) return "";

            const v = sig.value;
            const normalizeModelName = (raw) => {
                if (!raw) return "";
                const name = String(raw).split(/[\\/]/).pop() || "";
                return name.replace(/\.(safetensors|ckpt|pt)$/i, "");
            };
            if (v && typeof v === "object") {
                return normalizeModelName(v.model_name_prefix || v.ckpt_name || v.model_name || "");
            }
            if (typeof v === "string") return normalizeModelName(v);
            return "";
        };

        nodeType.prototype.getImageDeckFilenameText = function() {
            const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
            const idx = Number.isInteger(this._derpImageDeckIndex) ? this._derpImageDeckIndex : (list.length - 1);
            const image = list[idx] || null;

            const rawFile = image
                ? (image.filename || image.image || (typeof image === "string" ? image : ""))
                : "";
            const fileNameOnly = String(rawFile || "").split(/[\\/]/).pop();

            const modelPrefix = this.getImageDeckModelNamePrefix ? this.getImageDeckModelNamePrefix() : "";
            if (modelPrefix && fileNameOnly) return `${modelPrefix}_${fileNameOnly}`;
            return modelPrefix || fileNameOnly || "";
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this.refreshNodeLayoutMap();
            this.refreshDerpImageDeckSysMap();
        };

        const baseOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (baseOnNodeCreated) baseOnNodeCreated.apply(this, arguments);
            this._derpImageDeckList = this._derpImageDeckList || [];
            this._derpImageDeckIndex = Number.isInteger(this._derpImageDeckIndex) ? this._derpImageDeckIndex : 0;
            this.properties.toggleModelInfo = this.properties.toggleModelInfo !== false;
            this.updateImageDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.titleLabel = this.titleLabel || "Derp Image Deck";
            this.properties.titleLabel = this.titleLabel;
            this.properties.autoWidth = false;
            this.properties.autoHeight = false;
            this.size = [...this.properties.nodeSize];
            this.properties.drawSignalBtn = true;
            this.properties.drawSettingBtn = false;
            this.properties.imageDeckState = this.properties.imageDeckState || {
                index: 0,
                images: []
            };

            if (!this._imageDeckExecHooksBound && app.api) {
                this._imageDeckExecHooksBound = true;
                const syncFromSignal = (e) => {
                    const ids = this.properties && this.properties.multiSignalIds ? this.properties.multiSignalIds : {};
                    const signalId = ids[0] || ids["0"];
                    const baseId = parseInt(String(signalId || "").split(":")[0], 10);
                    const sourceNode = (!Number.isNaN(baseId) && app.graph) ? app.graph.getNodeById(baseId) : null;

                    const eventNodeId = e && e.detail ? String(e.detail.node || "") : "";
                    const eventOutput = e && e.detail ? e.detail.output : null;
                    const eventImages = eventOutput && Array.isArray(eventOutput.images)
                        ? eventOutput.images
                        : eventOutput && eventOutput.ui && Array.isArray(eventOutput.ui.images)
                            ? eventOutput.ui.images
                            : eventOutput && eventOutput.output && Array.isArray(eventOutput.output.images)
                                ? eventOutput.output.images
                                : [];

                    if (eventNodeId && String(baseId) === eventNodeId && eventImages.length > 0 && typeof this.applyDerpImageDeckList === "function") {
                        this.applyDerpImageDeckList(eventImages, "execution-event");
                        return;
                    }

                    if (sourceNode && sourceNode.properties && sourceNode.properties.isWirelessTransmitter) {
                        runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                    }

                    if (typeof this.syncDerpOutputs !== "function") return;
                    this.syncDerpOutputs();
                    setTimeout(() => {
                        if (sourceNode && sourceNode.properties && sourceNode.properties.isWirelessTransmitter) {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                        }
                        this.syncDerpOutputs();
                    }, 120);
                    setTimeout(() => {
                        if (sourceNode && sourceNode.properties && sourceNode.properties.isWirelessTransmitter) {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                        }
                        this.syncDerpOutputs();
                    }, 400);
                };
                const applyExecutedOutput = (e) => {
                    const ids = this.properties && this.properties.multiSignalIds ? this.properties.multiSignalIds : {};
                    const signalId = ids[0] || ids["0"];
                    const baseId = String(signalId || "").split(":")[0];
                    const eventNodeId = e && e.detail ? String(e.detail.node || "") : "";
                    if (!baseId || !eventNodeId || eventNodeId !== baseId) return;

                    const output = e && e.detail ? e.detail.output : null;
                    const images = output && Array.isArray(output.images)
                        ? output.images
                        : output && output.ui && Array.isArray(output.ui.images)
                            ? output.ui.images
                            : output && output.output && Array.isArray(output.output.images)
                                ? output.output.images
                                : [];

                    if (images.length > 0 && typeof this.applyDerpImageDeckList === "function") {
                        this.applyDerpImageDeckList(images, "executed-event");
                    }
                };
                app.api.addEventListener("executed", applyExecutedOutput);
                app.api.addEventListener("executing", syncFromSignal);
                app.api.addEventListener("execution_success", syncFromSignal);
                app.api.addEventListener("execution_error", syncFromSignal);
                app.api.addEventListener("execution_interrupted", syncFromSignal);
            }

            this.refreshNodeLayoutMap();
            this.refreshDerpImageDeckSysMap();
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
            this.requestDerpSync();
        };

        const baseOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (baseOnConfigure) baseOnConfigure.apply(this, arguments);
            const infoProps = info && info.properties ? info.properties : null;
            const localProps = this.properties || null;
            const state = (infoProps && infoProps.imageDeckState) || (localProps && localProps.imageDeckState) || null;
            const images = state && Array.isArray(state.images) ? state.images : [];
            const index = state && Number.isInteger(state.index) ? state.index : 0;
            this._derpImageDeckList = images;
            this._derpImageDeckIndex = index;
            this.properties.toggleModelInfo = this.properties.toggleModelInfo !== false;
            this.updateImageDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.properties.drawSignalBtn = true;
            this.properties.drawSettingBtn = false;
            this.properties.autoHeight = false;
            this.refreshDerpImageDeckSysMap();
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
        };

        nodeType.prototype.onResize = function(size) {
            this.properties.nodeSize = [size[0], size[1]];
            this.refreshNodeLayoutMap();
        };

        const baseOnSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(data) {
            if (baseOnSerialize) baseOnSerialize.apply(this, arguments);
            if (!data.properties) data.properties = {};
            data.properties.imageDeckState = {
                images: Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [],
                index: Number.isInteger(this._derpImageDeckIndex) ? this._derpImageDeckIndex : 0
            };
        };

        const baseOnAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            if (baseOnAdded) baseOnAdded.apply(this, arguments);

            if (this.size?.[0] !== 220 || this.size?.[1] !== 50) return;
            this.properties.nodeSize = [400, 400];
            this.size = [400, 400];
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
            if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
        };

        const baseOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            const wasCollapsed = this._lastContentCollapsed === true;
            const isCollapsed = this.properties?.contentCollapsed === true;

            if (wasCollapsed && !isCollapsed) {
                const restoreH = Number(this._preCollapseHeight || 0);
                if (restoreH > 0) {
                    const restoreW = Number(this.properties?.nodeSize?.[0] || this.size?.[0] || 400);
                    this.properties.nodeSize = [restoreW, restoreH];
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                }
            }

            this._lastContentCollapsed = isCollapsed;
            if (typeof this.getDerpImageDeckCrossfadeAlpha === "function") {
                const alpha = this.getDerpImageDeckCrossfadeAlpha();
                if (alpha < 1) {
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                }
            }
            if (baseOnDrawForeground) baseOnDrawForeground.apply(this, arguments);
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = false;

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            const count = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList.length : 0;
            const imageUrl = this.getDerpImageDeckCurrentUrl ? this.getDerpImageDeckCurrentUrl() : null;
            const prevImageUrl = this._derpImageDeckPrevDisplayUrl || null;
            const fadeAlpha = this.getDerpImageDeckCrossfadeAlpha ? this.getDerpImageDeckCrossfadeAlpha() : 1;
            const structureHash = `${count}_${imageUrl || "none"}_${prevImageUrl || "none"}_${fadeAlpha.toFixed(3)}_${this.size[0].toFixed(2)}_${(this.size[1] || 0).toFixed(2)}_${mW}_${mH}_${sW}_${sH}_${pW}_${pH}_${this.titleLabel}`;
            if (this._layoutMapHash === structureHash && this.layoutMap) return;
            this._layoutMapHash = structureHash;

            this.layoutMap = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full",
                    height: "fill",
                    dir: "col",
                    margin: [mW, mH, mW, mH],
                    spacing: [0, sH],

                    imageRegion: {
                        type: this.UI_TYPES.IMAGE_HTML,
                        key: "imageDeckPreview",
                        width: "full",
                        height: "fill",
                        minHeight: 60,
                        padding: [0, 0], spacing: [0, sH],
                        themeKey: "panel, t_textNormal",
                        imageUrl,
                        previousImageUrl: prevImageUrl,
                        transitionAlpha: fadeAlpha,
                        aspectFit: "contain",
                        suppressPlaceholder: false,
                        drawMode: "both",
                        strokeZIndex: true,
                        onContextMenu: () => {
                            if (!imageUrl) return [];
                            return [{
                                content: "Copy Image",
                                callback: async () => {
                                    try {
                                        await copyImageUrlToClipboard(imageUrl);
                                    } catch (e) {
                                        console.warn("[DerpImageDeck] Copy Image failed:", e);
                                    }
                                }
                            }];
                        }
                    },
                    regionImageHandling1: {
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        editorImageFilename: {
                            type: this.UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textSystem",
                            width: "full",
                            height: "auto",
                            padding: [pW, pH],
                            labelAlign: ["left", "middle"],
                            text: this.getImageDeckFilenameText ? this.getImageDeckFilenameText() : "",
                            value: this.getImageDeckFilenameText ? this.getImageDeckFilenameText() : "",
                            onBlur: () => {
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        btnSaveImage: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "save",
                            themeKey: "button, t_textSystem",
                            width: "match",
                            height: "auto",
                            spacing: [sW, 0],
                            mouseOver: true,
                            state: "OFF",
                            onPress: async () => {
                                try {
                                    await saveImageDeckCurrentImage(this);
                                } catch (e) {
                                    showBastaMessage(this, "Save failed", 2200, { fade: true }, "btnSaveImage", false, "error");
                                }
                            }
                        }
                    }
                }
            };

            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpImageDeckSysMap = function() {
            const vars = this.getDerpVars(this);
            const mW = vars.mW, mH = vars.mH, oY = vars.oY, pW = vars.pW, pH = vars.pH, sW = vars.sW;
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, 0, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    lblInfo: {
                        type: this.UI_TYPES.TEXT,
                        mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Image Deck settings",
                        width: "full",
                        padding: [pW, pH],
                    },
                    regionOption1: {
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        toggleModelInfo: {
                            type: this.UI_TYPES.TOGGLE,
                            textThemeKey: "t_textSystem",
                            icon: "radio",
                            label: "Get model name",
                            value: this.properties.toggleModelInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleModelInfo = this.properties.toggleModelInfo === false;
                                this.updateImageDeckSignalFilters();
                                this.refreshDerpImageDeckSysMap();
                                this.requestDerpSync();
                            }
                        }
                    }
                }
            };
            if (this._derpPanel) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

    }
});
