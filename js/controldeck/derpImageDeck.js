/**
 * Path: ./js/controldeck/derpImageDeck.js
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { initDerpImageDeckCore } from "./core/derpImageDeck_core.js";
import { runWirelessHeartbeat } from "../fatha/core/masterSignalEngine.js";
import { showBastaMessage } from "../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../fatha/bastas/bastaSystemMessage.js";
import { showBastaFileHandler } from "../fatha/bastas/bastaFileHandler.js";
import { activeBastas } from "../fatha/basta.js";
import { getSignalReceiverId } from "../fatha/bastas/bastaSignalReceiver.js";
import { getPinnedVerticalDeckAnchor, restorePinnedVerticalDeckAnchor } from "../fatha/core/dockResize.js";

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

function getImageDeckPrefixPlaceholder() {
    return tLocale("$derp_image_deck.prefix.placeholder", "Image Prefix");
}

function isImageDeckPrefixPlaceholder(value) {
    const normalized = normalizeImageDeckToken(value);
    return !normalized || normalized === "Image Prefix" || normalized === getImageDeckPrefixPlaceholder();
}

function syncDerpImageDeckLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_image_deck.title", "Derp Image Deck");
    const previousLocalizedTitle = node._lastLocalizedDerpImageDeckTitle;
    if (!node.titleLabel || node.titleLabel === "Derp Image Deck" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Image Deck" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (isImageDeckPrefixPlaceholder(node.properties.imageDeckFilenamePrefix)) {
        node.properties.imageDeckFilenamePrefix = getImageDeckPrefixPlaceholder();
    }
    node._lastLocalizedDerpImageDeckTitle = localizedTitle;
}

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

function normalizeImageDeckToken(raw) {
    return String(raw || "").trim();
}

function normalizeImageDeckFilenameToken(raw) {
    return normalizeImageDeckToken(raw)
        .replace(/\.(png|jpg|jpeg|webp|gif|bmp)$/i, "");
}

function getImageDeckCustomPrefix(raw) {
    const prefix = normalizeImageDeckToken(raw);
    return prefix && !isImageDeckPrefixPlaceholder(prefix) ? prefix : "";
}

function normalizeImageDeckFolderPath(raw) {
    return String(raw || "").replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
}

function buildImageDeckBaseName(node, fileNameOnly = "") {
    const modelPrefix = node.getImageDeckModelNamePrefix ? node.getImageDeckModelNamePrefix() : "";
    const samplerPrefix = node.getImageDeckSamplerNamePrefix ? node.getImageDeckSamplerNamePrefix(fileNameOnly) : "";
    const schedulerPrefix = node.getImageDeckSchedulerNamePrefix ? node.getImageDeckSchedulerNamePrefix(fileNameOnly) : "";
    const customPrefix = node.getImageDeckFilenamePrefix ? node.getImageDeckFilenamePrefix() : "";
    const parsedName = [modelPrefix, samplerPrefix, schedulerPrefix].map(normalizeImageDeckToken).filter(Boolean).join("-");
    return customPrefix && parsedName ? `${customPrefix}_${parsedName}` : (customPrefix || parsedName || normalizeImageDeckFilenameToken(fileNameOnly));
}

function formatImageDeckTimestamp(date = new Date()) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${yy}${mm}${dd}-${hh}${min}${sec}`;
}

function getImageDeckBottomY(node) {
    const y = Number(node?.pos?.[1]) || 0;
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
    return y + h;
}

function getImageDeckRefreshAnchor(node) {
    if (node?.properties?.pinActive !== true) return null;
    const graph = window.app?.graph || node?.graph || null;
    const deckAnchor = getPinnedVerticalDeckAnchor(node, graph);
    if (deckAnchor) {
        if (Number.isFinite(node._imageDeckConfiguredBottomY) && deckAnchor.pinned?.id === node.id) {
            return { ...deckAnchor, bottom: node._imageDeckConfiguredBottomY };
        }
        return deckAnchor;
    }
    return {
        node,
        bottom: Number.isFinite(node._imageDeckConfiguredBottomY)
            ? node._imageDeckConfiguredBottomY
            : getImageDeckBottomY(node)
    };
}

function restoreImageDeckRefreshAnchor(anchor) {
    if (!anchor) return;
    if (anchor.pinned) {
        restorePinnedVerticalDeckAnchor(anchor);
        return;
    }
    const node = anchor.node;
    if (!node?.pos || node?.properties?.pinActive !== true) return;
    const h = Number(node.size?.[1] ?? node.properties?.nodeSize?.[1]) || 0;
    if (!(h > 0)) return;
    const SNAP = node.getDerpVars ? node.getDerpVars(node).SNAP || 10 : 10;
    const snappedBottom = Math.ceil(anchor.bottom / SNAP) * SNAP;
    node.pos[1] = snappedBottom - h;
}

async function saveImageDeckCurrentImage(node, isAutoSave = false) {
    const image = getImageDeckCurrentImage(node);
    if (!image || !image.filename) {
        showBastaMessage(node, tLocale("$derp_image_deck.messages.no_image_to_save", "No image to save"), 1800, { fade: true }, "btnSaveImage", false, "error");
        return;
    }

    const fileNameOnly = String(image.filename || "").split(/[\\/]/).pop();
    const saveBaseName = buildImageDeckBaseName(node, fileNameOnly);
    const stampedSaveName = `${saveBaseName}_${formatImageDeckTimestamp()}`;
    const payload = {
        filename: image.filename,
        type: image.type || "output",
        subfolder: image.subfolder || "",
        target_subfolder: node.properties.imageDeckCustomFolder || "",
        save_format: String(node.properties.imageDeckSaveFormat || "PNG").trim(),
        save_name: String(stampedSaveName || "").trim()
    };

    const res = await fetch("/xcp/derp_image_deck/save_current_image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
        const msg = data?.error || tLocale("$derp_image_deck.messages.save_failed", "Save failed");
        showBastaMessage(node, msg, 2200, { fade: true }, "btnSaveImage", false, "error");
        return;
    }

    const savedName = String(data.filename || "").split(/[\\/]/).pop() || String(data.filename || "");
    showBastaSystemMessage(node, isAutoSave ? tLocale("$derp_image_deck.messages.auto_saved_prefix", "Auto-saved: ") : tLocale("$derp_image_deck.messages.saved_prefix", "Saved: "), 2200, { fade: true, grow: true }, "btnSaveImage", "success", null, savedName);
}

function openImageDeckFolderSelector(node, items = []) {
    showBastaFileHandler(node, "output", "btnFolderSelector", {
        title: tLocale("$derp_image_deck.dialogs.select_folder.title", "Select Folder"),
        confirm: tLocale("$derp_image_deck.dialogs.select_folder.confirm", "Select"),
        mode: "folder",
        fileList: items,
        initialSize: [260, 260],
        properties: {
            bastaMovalbe: false,
            showFolderBrowser: true,
            selectedFolder: node.properties.imageDeckCustomFolder || "/",
            pendingName: "",
            originalName: ""
        },
        onConfirm: async (selectedFolder) => {
            node.properties.imageDeckCustomFolder = normalizeImageDeckFolderPath(selectedFolder);
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.requestDerpSync) node.requestDerpSync();
        }
    });
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
        nodeType.prototype.computeSize = function(out) {
            if (out) { out[0] = 500; out[1] = 500; return out; }
            return [500, 500];
        };
        nodeType.prototype.baseZIndex = "2";
        initDerpImageDeckCore(nodeType);

        const _baseApplyList = nodeType.prototype.applyDerpImageDeckList;
        nodeType.prototype.applyDerpImageDeckList = function(list, source) {
            _baseApplyList.call(this, list, source);
            if (this.properties && this.properties.toggleAutoSave === true) {
                saveImageDeckCurrentImage(this, true);
            }
        };

        nodeType.prototype._isDerpImageDeckNode = true;

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            syncDerpImageDeckLocaleLabels(this);
            this.refreshNodeLayoutMap();
            this.refreshDerpImageDeckSysMap();
        };

        nodeType.prototype.updateImageDeckSignalFilters = function() {
            const baseTypes = ["IMAGE"];
            const additionalTypes = [];
            if (this.properties.toggleModelInfo !== false) additionalTypes.push("MODEL");
            if (this.properties.toggleSamplerInfo !== false) additionalTypes.push("SAMPLER");
            if (this.properties.toggleSchedulerInfo !== false) additionalTypes.push("SCHEDULER");
            this.signalFilters = {
                types: baseTypes,
                additionalTypes,
                layoutOverrides: {
                    signalLabelText: {
                        IMAGE: tLocale("$derp_image_deck.signals.image_required", "Select IMAGE signal (required):"),
                        MODEL: tLocale("$derp_image_deck.signals.optional_for_filename", "Select optional signals for file name parsing:")
                    },
                    hiddenSignalLabels: ["SAMPLER", "SCHEDULER"]
                }
            };
        };

        nodeType.prototype.hasRequiredWirelessSignals = function() {
            const ids = this.properties?.multiSignalIds || {};
            const signalId = ids[0] || ids["0"] || null;
            if (!signalId) return false;

            const signals = window.xcpDerpSignals || {};
            const directId = String(signalId);
            if (signals[directId]) return true;

            const baseId = directId.split(":")[0];
            if (signals[baseId]) return true;
            if (Object.values(signals).some(sig => String(sig?.nodeId || "").startsWith(`${baseId}:`))) return true;

            const numericBaseId = parseInt(baseId, 10);
            if (Number.isNaN(numericBaseId) || !app.graph) return false;

            const sourceNode = app.graph.getNodeById(numericBaseId);
            if (!sourceNode?.properties?.isWirelessTransmitter) return false;
            const outputs = Array.isArray(sourceNode.outputs) ? sourceNode.outputs : [];
            return outputs.some(output => String(output?.type || "").toUpperCase().includes("IMAGE"));
        };

        nodeType.prototype.refreshOpenImageDeckSignalReceiver = function() {
            const receiver = activeBastas.get(getSignalReceiverId());
            if (!receiver || receiver.hostNode !== this || receiver.isClosing) return;
            receiver._layoutDirty = true;
            receiver._forceSync = true;
            if (typeof receiver.requestDerpSync === "function") receiver.requestDerpSync();
        };

        nodeType.prototype.fetchImageDeckKSamplerInfo = function() {
            const session = window._xcpDerpSession || Date.now();
            fetch(`/object_info/KSampler?v=${session}`)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    const samplerInput = data?.KSampler?.input?.required?.sampler_name;
                    const schedulerInput = data?.KSampler?.input?.required?.scheduler;
                    this.properties.imageDeckSamplerNames = Array.isArray(samplerInput?.[0]) ? samplerInput[0] : [];
                    this.properties.imageDeckSchedulerNames = Array.isArray(schedulerInput?.[0]) ? schedulerInput[0] : [];
                    this.updateImageDeckSignalFilters();
                    if (this.refreshDerpImageDeckSysMap) this.refreshDerpImageDeckSysMap();
                    if (this.requestDerpSync) this.requestDerpSync();
                })
                .catch(error => {
                    console.error("[DerpImageDeck] Failed to fetch KSampler info:", error);
                    this.properties.imageDeckSamplerNames = [];
                    this.properties.imageDeckSchedulerNames = [];
                    this.updateImageDeckSignalFilters();
                    if (this.refreshDerpImageDeckSysMap) this.refreshDerpImageDeckSysMap();
                });
        };

        nodeType.prototype.getImageDeckInfoSignalIndex = function(kind) {
            const normalized = String(kind || "").toUpperCase();
            if (normalized === "MODEL") return 1;
            if (normalized === "SAMPLER") return 2;
            if (normalized === "SCHEDULER") return 3;
            return null;
        };

        nodeType.prototype.getImageDeckSignalIdByKind = function(kind) {
            const idx = this.getImageDeckInfoSignalIndex ? this.getImageDeckInfoSignalIndex(kind) : null;
            if (idx === null) return null;
            const ids = this.properties.multiSignalIds || {};
            const signalId = ids[idx] || ids[String(idx)] || ids[kind] || ids[String(kind || "").toUpperCase()] || null;
            if (!signalId) return null;
            const sigs = window.xcpDerpSignals || {};
            const sig = sigs[signalId] || sigs[String(signalId).split(":")[0]] || null;
            return this.signalMatchesImageDeckKind(sig, kind) ? signalId : null;
        };

        nodeType.prototype.signalMatchesImageDeckKind = function(sig, kind) {
            const normalized = String(kind || "").toUpperCase();
            if (!sig) return false;
            if (normalized === "SAMPLER") {
                const nodeType = String(sig.nodeType || "").toLowerCase();
                const nodeName = String(sig.nodeName || "").toLowerCase();
                return nodeType.includes("samplerloader") || nodeName.includes("[sampler]");
            }
            if (normalized === "SCHEDULER") {
                const nodeType = String(sig.nodeType || "").toLowerCase();
                const nodeName = String(sig.nodeName || "").toLowerCase();
                return nodeType.includes("schedulerloader") || nodeName.includes("[scheduler]");
            }
            const rawType = sig.type;
            if (Array.isArray(rawType)) return rawType.some(item => String(item || "").toUpperCase() === normalized);
            return String(rawType || "").toUpperCase() === normalized;
        };

        nodeType.prototype.getImageDeckSignalIdByValueType = function(typeList) {
            const ids = this.properties.multiSignalIds || {};
            const sigs = window.xcpDerpSignals || {};
            const targets = new Set((Array.isArray(typeList) ? typeList : [typeList]).map(item => String(item || "").toUpperCase()));
            const matchesType = (sig) => {
                const rawType = sig?.type;
                if (Array.isArray(rawType)) return rawType.some(item => targets.has(String(item || "").toUpperCase()));
                return targets.has(String(rawType || "").toUpperCase());
            };

            const selected = Object.values(ids).find(signalId => matchesType(sigs[signalId] || sigs[String(signalId).split(":")[0]]));
            if (selected) return selected;
            const fallback = Object.values(sigs).find(matchesType);
            return fallback?.nodeId || null;
        };

        nodeType.prototype.getImageDeckSignalValueByType = function(typeList) {
            const signalId = this.getImageDeckSignalIdByValueType ? this.getImageDeckSignalIdByValueType(typeList) : null;
            if (!signalId) return "";
            const sigs = window.xcpDerpSignals || {};
            const sig = sigs[signalId] || sigs[String(signalId).split(":")[0]] || null;
            return normalizeImageDeckToken(sig?.value);
        };

        nodeType.prototype.getImageDeckSignalValueByKind = function(kind) {
            const signalId = this.getImageDeckSignalIdByKind ? this.getImageDeckSignalIdByKind(kind) : null;
            if (!signalId) return "";
            const sigs = window.xcpDerpSignals || {};
            const sig = sigs[signalId] || sigs[String(signalId).split(":")[0]] || null;
            return normalizeImageDeckToken(sig?.value);
        };

        nodeType.prototype.parseImageDeckNameToken = function(fileNameOnly, names = []) {
            const cleanFile = normalizeImageDeckFilenameToken(fileNameOnly);
            if (!cleanFile || !Array.isArray(names) || names.length === 0) return "";
            const lowerFile = cleanFile.toLowerCase();
            const sorted = [...names].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
            return sorted.find(name => lowerFile.includes(String(name).toLowerCase())) || "";
        };

        nodeType.prototype.getImageDeckModelNamePrefix = function() {
            if (this.properties.toggleModelInfo === false) return "";
            const modelSignalId = this.getImageDeckSignalIdByKind ? this.getImageDeckSignalIdByKind("MODEL") : null;
            const sigs = window.xcpDerpSignals || {};
            const fallbackSignalId = this.properties?.multiSignalIds?.Model || this.properties?.modelSignalId;
            const sig = sigs[modelSignalId]
                || sigs[fallbackSignalId]
                || Object.values(sigs).find(s => String(s?.type || "").toUpperCase() === "MODEL" && s.value?.model_name_prefix)
                || Object.values(sigs).find(s => String(s?.type || "").toUpperCase() === "MODEL");
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

        nodeType.prototype.getImageDeckSamplerNamePrefix = function(fileNameOnly = "") {
            if (this.properties.toggleSamplerInfo === false) return "";
            const names = Array.isArray(this.properties.imageDeckSamplerNames) ? this.properties.imageDeckSamplerNames : [];
            return this.getImageDeckSignalValueByKind("SAMPLER") || this.parseImageDeckNameToken(fileNameOnly, names);
        };

        nodeType.prototype.getImageDeckSchedulerNamePrefix = function(fileNameOnly = "") {
            if (this.properties.toggleSchedulerInfo === false) return "";
            const names = Array.isArray(this.properties.imageDeckSchedulerNames) ? this.properties.imageDeckSchedulerNames : [];
            return this.getImageDeckSignalValueByKind("SCHEDULER") || this.parseImageDeckNameToken(fileNameOnly, names);
        };

        nodeType.prototype.getImageDeckFilenamePrefix = function() {
            return getImageDeckCustomPrefix(this.properties.imageDeckFilenamePrefix);
        };

        nodeType.prototype.getImageDeckFilenameText = function() {
            const list = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [];
            const idx = Number.isInteger(this._derpImageDeckIndex) ? this._derpImageDeckIndex : (list.length - 1);
            const image = list[idx] || null;

            const rawFile = image
                ? (image.filename || image.image || (typeof image === "string" ? image : ""))
                : "";
            const fileNameOnly = String(rawFile || "").split(/[\\/]/).pop();
            const baseName = buildImageDeckBaseName(this, fileNameOnly);
            const extension = (String(fileNameOnly || "").match(/(\.[^.\\/]+)$/) || [""])[0];
            const displayName = `${baseName}${extension}`;
            const customFolder = normalizeImageDeckFolderPath(this.properties.imageDeckCustomFolder || "");
            if (!customFolder) return displayName;
            const folderPath = `${customFolder.replace(/\\/g, "/")}/`;
            return `{{t_text_highlight::${folderPath}}}${displayName}`;
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
            this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo !== false;
            this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo !== false;
            this.properties.toggleAutoFit = this.properties.toggleAutoFit === true;
            this.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            this.properties.imageDeckSamplerNames = Array.isArray(this.properties.imageDeckSamplerNames) ? this.properties.imageDeckSamplerNames : [];
            this.properties.imageDeckSchedulerNames = Array.isArray(this.properties.imageDeckSchedulerNames) ? this.properties.imageDeckSchedulerNames : [];
            this.properties.imageDeckFilenamePrefix = typeof this.properties.imageDeckFilenamePrefix === "string"
                ? this.properties.imageDeckFilenamePrefix
                : getImageDeckPrefixPlaceholder();
            this.properties.imageDeckSaveFormat = typeof this.properties.imageDeckSaveFormat === "string"
                ? this.properties.imageDeckSaveFormat
                : "PNG";
            this.properties.imageDeckCustomFolder = typeof this.properties.imageDeckCustomFolder === "string"
                ? normalizeImageDeckFolderPath(this.properties.imageDeckCustomFolder)
                : "";
            this.updateImageDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.titleLabel = this.titleLabel || tLocale("$derp_image_deck.title", "Derp Image Deck");
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
            syncDerpImageDeckLocaleLabels(this);

            this._imageDeckSyncBurst = this._imageDeckSyncBurst || null;
            this._imageDeckSyncRetry120 = this._imageDeckSyncRetry120 || null;
            this._imageDeckSyncRetry400 = this._imageDeckSyncRetry400 || null;
            this._imageDeckHeartbeatBurst = this._imageDeckHeartbeatBurst || null;

            if (!this._imageDeckExecHooksBound && app.api) {
                this._imageDeckExecHooksBound = true;
                const clearSyncRetryTimers = () => {
                    if (this._imageDeckSyncRetry120) {
                        clearTimeout(this._imageDeckSyncRetry120);
                        this._imageDeckSyncRetry120 = null;
                    }
                    if (this._imageDeckSyncRetry400) {
                        clearTimeout(this._imageDeckSyncRetry400);
                        this._imageDeckSyncRetry400 = null;
                    }
                };
                const runHeartbeatOnce = (sourceNode, burstKey) => {
                    if (!sourceNode || sourceNode.properties?.isWirelessTransmitter !== true) return;
                    if (this._imageDeckHeartbeatBurst === burstKey) return;
                    this._imageDeckHeartbeatBurst = burstKey;
                    runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                };
                const scheduleSignalSyncBurst = (sourceNode, burstKey) => {
                    if (typeof this.syncDerpOutputs !== "function") return;

                    // During active image crossfade, disable burst coalescing and
                    // use eager sync retries so animation updates are not delayed.
                    if (this._derpImageDeckCrossfading === true) {
                        clearSyncRetryTimers();
                        runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                        this.syncDerpOutputs();

                        this._imageDeckSyncRetry120 = setTimeout(() => {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                            this.syncDerpOutputs();
                        }, 120);

                        this._imageDeckSyncRetry400 = setTimeout(() => {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                            this.syncDerpOutputs();
                            this._imageDeckSyncRetry120 = null;
                            this._imageDeckSyncRetry400 = null;
                        }, 400);
                        return;
                    }

                    if (this._imageDeckSyncBurst === burstKey) return;
                    this._imageDeckSyncBurst = burstKey;

                    clearSyncRetryTimers();
                    runHeartbeatOnce(sourceNode, burstKey);
                    this.syncDerpOutputs();

                    this._imageDeckSyncRetry120 = setTimeout(() => {
                        runHeartbeatOnce(sourceNode, burstKey);
                        this.syncDerpOutputs();
                    }, 120);

                    this._imageDeckSyncRetry400 = setTimeout(() => {
                        runHeartbeatOnce(sourceNode, burstKey);
                        this.syncDerpOutputs();
                        this._imageDeckSyncBurst = null;
                        this._imageDeckHeartbeatBurst = null;
                        this._imageDeckSyncRetry120 = null;
                        this._imageDeckSyncRetry400 = null;
                    }, 400);
                };
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
                        clearSyncRetryTimers();
                        this._imageDeckSyncBurst = null;
                        this._imageDeckHeartbeatBurst = null;
                        this.applyDerpImageDeckList(eventImages, "execution-event");
                        return;
                    }

                    const eventType = String(e?.type || "signal");
                    const burstKey = `${String(baseId || "none")}:${eventType}`;
                    scheduleSignalSyncBurst(sourceNode, burstKey);
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
                        clearSyncRetryTimers();
                        this._imageDeckSyncBurst = null;
                        this._imageDeckHeartbeatBurst = null;
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
            this.fetchImageDeckKSamplerInfo();
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
            this.requestDerpSync();
        };

        const baseOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            const infoY = Number(info?.pos?.[1]);
            const infoH = Number(info?.size?.[1] ?? info?.properties?.nodeSize?.[1]);
            const configuredBottomY = Number.isFinite(infoY) && Number.isFinite(infoH) ? infoY + infoH : null;
            if (baseOnConfigure) baseOnConfigure.apply(this, arguments);
            if (Array.isArray(info?.size) && info.size.length >= 2) {
                this.size = [Number(info.size[0]) || this.size?.[0] || 400, Number(info.size[1]) || this.size?.[1] || 400];
                this.properties.nodeSize = [...this.size];
            }
            if (configuredBottomY !== null && this.properties?.pinActive === true) {
                this._imageDeckConfiguredBottomY = configuredBottomY;
                restoreImageDeckRefreshAnchor(getImageDeckRefreshAnchor(this));
            }
            const infoProps = info && info.properties ? info.properties : null;
            const localProps = this.properties || null;
            const state = (infoProps && infoProps.imageDeckState) || (localProps && localProps.imageDeckState) || null;
            const images = state && Array.isArray(state.images) ? state.images : [];
            const index = state && Number.isInteger(state.index) ? state.index : 0;
            this._derpImageDeckList = images;
            this._derpImageDeckIndex = index;
            this._derpImageDeckRestoringState = images.length > 0;
            this.properties.toggleModelInfo = this.properties.toggleModelInfo !== false;
            this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo !== false;
            this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo !== false;
            this.properties.toggleAutoFit = this.properties.toggleAutoFit === true;
            this.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            this.properties.imageDeckSamplerNames = Array.isArray(this.properties.imageDeckSamplerNames) ? this.properties.imageDeckSamplerNames : [];
            this.properties.imageDeckSchedulerNames = Array.isArray(this.properties.imageDeckSchedulerNames) ? this.properties.imageDeckSchedulerNames : [];
            this.updateImageDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.properties.drawSignalBtn = true;
            this.properties.drawSettingBtn = false;
            this.properties.autoHeight = false;
            this.refreshDerpImageDeckSysMap();
            this.fetchImageDeckKSamplerInfo();
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
            restoreImageDeckRefreshAnchor(getImageDeckRefreshAnchor(this));
            this._imageDeckConfiguredBottomY = null;
        };

        nodeType.prototype.onResize = function(size) {
            this.properties.nodeSize = [size[0], size[1]];
            this.refreshNodeLayoutMap();
        };

        const baseOnSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function(data) {
            if (baseOnSerialize) baseOnSerialize.apply(this, arguments);
            if (!data.properties) data.properties = {};
            data.size = Array.isArray(this.size) ? [...this.size] : data.size;
            data.properties.nodeSize = Array.isArray(this.size) ? [...this.size] : this.properties.nodeSize;
            data.properties.imageDeckCustomFolder = this.properties.imageDeckCustomFolder || "";
            data.properties.imageDeckFilenamePrefix = this.properties.imageDeckFilenamePrefix || getImageDeckPrefixPlaceholder();
            data.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            data.properties.imageDeckState = {
                images: Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList : [],
                index: Number.isInteger(this._derpImageDeckIndex) ? this._derpImageDeckIndex : 0
            };
        };

        const baseOnAdded = nodeType.prototype.onAdded;
        nodeType.prototype.onAdded = function() {
            if (baseOnAdded) baseOnAdded.apply(this, arguments);

            if (this.size?.[0] !== 220 || this.size?.[1] !== 50) return;
            this.properties.nodeSize = [500, 500];
            this.size = [500, 500];
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
            if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, true);
        };

        const baseOnDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            const refreshAnchor = getImageDeckRefreshAnchor(this);
            const wasCollapsed = this._lastContentCollapsed === true;
            const isCollapsed = this.properties?.contentCollapsed === true;

            if (wasCollapsed && !isCollapsed) {
                const restoreH = Number(this.properties?._savedExpandedHeight || this._preCollapseHeight || 0);
                if (restoreH > 0) {
                    const restoreW = Number(this.properties?.nodeSize?.[0] || this.size?.[0] || 400);
                    this.properties.nodeSize = [restoreW, restoreH];
                    this._preCollapseHeight = restoreH;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap();
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                }
            }

            this._lastContentCollapsed = isCollapsed;
            this._derpImageDeckFrameFadeAlpha = 1;
            const wasCrossfading = this._derpImageDeckCrossfading === true;
            if (typeof this.getDerpImageDeckCrossfadeAlpha === "function") {
                const alpha = this.getDerpImageDeckCrossfadeAlpha();
                this._derpImageDeckFrameFadeAlpha = alpha;
                if (alpha < 1) {
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                } else if (wasCrossfading && this._derpImageDeckCrossfading !== true) {
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                }
            }
            if (baseOnDrawForeground) baseOnDrawForeground.apply(this, arguments);
            this._derpImageDeckFrameFadeAlpha = null;
            restoreImageDeckRefreshAnchor(refreshAnchor);
        };

        nodeType.prototype.refreshNodeLayoutMap = function(scheduleSync = true) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = false;

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            this.properties.footerAnchorGap = Math.max(Number(this.properties.footerAnchorGap) || 0, mH);

            const count = Array.isArray(this._derpImageDeckList) ? this._derpImageDeckList.length : 0;
            const imageUrl = this.getDerpImageDeckCurrentUrl ? this.getDerpImageDeckCurrentUrl() : null;
            const prevImageUrl = this._derpImageDeckPrevDisplayUrl || null;
            const frameFadeAlpha = Number(this._derpImageDeckFrameFadeAlpha);
            const fadeAlpha = Number.isFinite(frameFadeAlpha)
                ? frameFadeAlpha
                : (this._derpImageDeckCrossfading === true
                    ? Math.max(0, Math.min(1, Number(this._derpImageDeckCrossfadeFrom || 0)))
                    : 1);
            const filenameText = this.getImageDeckFilenameText ? this.getImageDeckFilenameText() : "";
            const structureHash = `${count}_${imageUrl || "none"}_${prevImageUrl || "none"}_${fadeAlpha.toFixed(3)}_${this.size[0].toFixed(2)}_${(this.size[1] || 0).toFixed(2)}_${mW}_${mH}_${sW}_${sH}_${pW}_${pH}_${this.titleLabel}_${filenameText}`;
            if (this._layoutMapHash === structureHash && this.layoutMap) return;
            this._layoutMapHash = structureHash;

            this.layoutMap = {
                    contentRegion: {
                        anchor: { target: "headerRegion", axis: "y" },
                        width: "full",
                        height: "fill",
                        dir: "col",
                        margin: [mW, mH],
                    //spacing: [0, sH],
                    imageRegion: {                        
                        type: this.UI_TYPES.IMAGE_HTML,
                        key: "imageDeckPreview",
                        width: "full", height: "fill", 
                        minHeight: 60,
                        padding: [0, 0], 
                        themeKey: imageUrl ? "panel, t_textNormal" : "panel, t_textBig",
                        imageUrl,
                        previousImageUrl: prevImageUrl,
                        transitionAlpha: fadeAlpha,
                        aspectFit: "contain",
                        cornerRadius: 0,
                        suppressPlaceholder: false,
                        drawMode: "both",
                        strokeZIndex: true,
                        onContextMenu: () => {
                            if (!imageUrl) return [];
                            return [{
                                content: tLocale("$derp_image_deck.menu.copy_image", "Copy Image"),
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
                        anchor: { target: "imageRegion", axis: "y" },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [0, sH], margin: [0, mH],
                        btnFolderSelector: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "file",
                            themeKey: "button, t_textNormal",
                            width: "match", height: "fill", iconScale: 0.72,
                            spacing: [sW, 0], padding: [pW, pH],
                            mouseOver: true,
                            state: "OFF",
                            toolTip: tLocale("$derp_image_deck.tooltips.folder_selector", "Selects {{t_toolTip_highlight::Folder Path}} where the image will be saved to disk"),
                            onPress: () => {
                                fetch("/xcp/list/output")
                                    .then(async (r) => {
                                        const data = await r.json().catch(() => ({}));
                                        return { ok: r.ok, status: r.status, data };
                                    })
                                    .then(({ ok, status, data }) => {
                                        const items = Array.isArray(data?.items) ? data.items : [];
                                        const folderItems = items.filter(item => typeof item === "string" && item.endsWith("/"));

                                        if (!ok) {
                                            const msg = data?.error ? `${tLocale("$derp_image_deck.messages.folder_list_failed_prefix", "Folder list failed: ")}${data.error}` : `${tLocale("$derp_image_deck.messages.folder_list_failed_status_prefix", "Folder list failed (")}${status})`;
                                            showBastaMessage(this, msg, 2800, { fade: true }, "btnFolderSelector", false, "error");
                                            return;
                                        }

                                        if (folderItems.length === 0) {
                                            showBastaMessage(this, tLocale("$derp_image_deck.messages.no_output_subfolders", "No output subfolders found"), 2400, { fade: true }, "btnFolderSelector", false, "info");
                                        }

                                        openImageDeckFolderSelector(this, items);
                                    })
                                    .catch((e) => {
                                        console.warn("[DerpImageDeck] Failed to load output folders:", e);
                                        showBastaMessage(this, tLocale("$derp_image_deck.messages.folder_list_request_failed", "Folder list request failed"), 2800, { fade: true }, "btnFolderSelector", false, "error");
                                    });
                            }
                        },
                        edtiorFilenamePrefix: {
                            type: this.UI_TYPES.EDITOR,
                            canvasShield: true,
                            themeKey: "dialog, t_textNormal",
                            width: "fit",
                            height: "auto",
                            padding: [pW, pH], spacing: [sH, 0],
                            labelAlign: ["left", "middle"],
                            text: this.properties.imageDeckFilenamePrefix || getImageDeckPrefixPlaceholder(),
                            value: this.properties.imageDeckFilenamePrefix || getImageDeckPrefixPlaceholder(),
                            onBlur: (v) => {
                                this.properties.imageDeckFilenamePrefix = String(v || "").trim() || getImageDeckPrefixPlaceholder();
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        editorImageFilename: {
                            type: this.UI_TYPES.EDITOR, mouseOver: false,
                            canvasShield: true,
                            themeKey: "dialog, t_textNormal",
                            displayMode: "cutoff",
                            width: "full",
                            height: "auto",
                            padding: [pW, pH], spacing: [sH, 0],
                            labelAlign: ["left", "middle"],
                            text: filenameText,
                            value: filenameText,
                            onBlur: () => {
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        btnSaveImage: {
                            type: this.UI_TYPES.BUTTON,
                            text: tLocale("$derp_image_deck.buttons.save_image", "SAVE IMAGE"),
                            themeKey: "button, t_textSmall",
                            width: "auto", height: "fill",
                            padding: [4, pH],
                            mouseOver: true,
                            state: "OFF",
                            onPress: async () => {
                                try {
                                    await saveImageDeckCurrentImage(this);
                                } catch (e) {
                                    showBastaMessage(this, tLocale("$derp_image_deck.messages.save_failed", "Save failed"), 2200, { fade: true }, "btnSaveImage", false, "error");
                                }
                            }
                        }
                    },
                    regionImageSpacer: {
                        anchor: { target: "regionImageHandling1", axis: "y" },
                        dir: "col",
                        width: "full",
                        height: mH,
                    },
                }
            };

            if (this.layout) this.layout._lastCacheKey = "";
            if (scheduleSync && typeof this.requestDerpSync === "function") this.requestDerpSync();
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
                        text: tLocale("$derp_image_deck.system.settings", "Image Deck settings"),
                        width: "full",
                        padding: [pW, pH],
                    },
                    regionOption1: {
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        lblNodeSize: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: "Node size:",
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        editorNodeSize: {
                            type: this.UI_TYPES.EDITOR,
                            canvasShield: true,
                            themeKey: "dialog, t_textSmall",
                            labelAlign: ["center", "middle"],
                            text: `${Math.round(this.size[0])}, ${Math.round(this.size[1])}`,
                            value: `${Math.round(this.size[0])}, ${Math.round(this.size[1])}`,
                            measureText: "9999, 9999",
                            width: "auto",
                            height: "auto",
                            padding: [pW, 1],
                            spacing: [sW, 0],
                            onBlur: (v) => {
                                const parts = String(v || "").split(/[,\sx]+/);
                                const w = Math.round(parseFloat(parts[0]));
                                const h = Math.round(parseFloat(parts[1]));
                                if (!isNaN(w) && !isNaN(h)) {
                                    const minW = 200, minH = 100, max = 2000;
                                    const cw = Math.min(max, Math.max(minW, w));
                                    const ch = Math.min(max, Math.max(minH, h));
                                    this.size = [cw, ch];
                                    if (this.properties) this.properties.nodeSize = [cw, ch];
                                    if (this.refreshDerpImageDeckSysMap) this.refreshDerpImageDeckSysMap();
                                    if (this.requestDerpSync) this.requestDerpSync();
                                }
                            },
                        },
                        toggleAutoFit: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem",
                            isTextOnly: true,
                            mouseOver: false,
                            iconAlign: "right",
                            icon: "ring",
                            label: tLocale("$derp_image_deck.system.auto_adjust_height", "Auto adjust node height"),
                            value: this.properties.toggleAutoFit === true,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            spacing: [sW, 0],
                            onPress: () => {
                                this.properties.toggleAutoFit = this.properties.toggleAutoFit === false;
                                if (this.properties.toggleAutoFit === false) {
                                    const currentW = Number(this.size?.[0] || this.properties?.nodeSize?.[0] || 500);
                                    const currentH = Number(this.size?.[1] || this.properties?.nodeSize?.[1] || 500);
                                    this.properties.nodeSize = [currentW, currentH];
                                    this._preCollapseHeight = currentH;
                                    this._imageDeckPinnedAnchor = null;
                                }
                                if (this.refreshDerpImageDeckSysMap) this.refreshDerpImageDeckSysMap();
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (typeof this.syncDerpImageDeckDisplayUrl === "function") this.syncDerpImageDeckDisplayUrl();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        toggleAutoSave: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem",
                            isTextOnly: true,
                            mouseOver: false,
                            iconAlign: "right",
                            icon: "ring",
                            label: tLocale("$derp_image_deck.system.auto_save_new", "Auto save new images"),
                            value: this.properties.toggleAutoSave === true,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            spacing: [sW, 0],
                            onPress: () => {
                                this.properties.toggleAutoSave = this.properties.toggleAutoSave !== true;
                                if (this.refreshDerpImageDeckSysMap) this.refreshDerpImageDeckSysMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        lblImageFormat: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_image_deck.system.image_format", "Image format:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        dropdownImageFormat: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            themeKey: "dialog, t_textSmall",
                            canvasShield: true,
                            width: "fit", height: "auto",
                            padding: [pW, 1],
                            mode: "file",
                            rootName: "format",
                            spacing: [sW, 0],
                            items: ["PNG", "JPEG", "WebP"],
                            value: this.properties.imageDeckSaveFormat || "PNG",
                            text: this.properties.imageDeckSaveFormat || "PNG",
                            onChange: (v) => {
                                this.properties.imageDeckSaveFormat = String(v || "PNG").trim() || "PNG";
                                this.refreshDerpImageDeckSysMap();
                                this.requestDerpSync();
                            }
                        }
                    },

                    regionOption2: {
                        anchor: { target: "regionOption1", axis: "y", offset: oY },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        lblParseFilename: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: "Parse filename:",
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        toggleModelInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_image_deck.system.get_model_name", "Get model name"),
                            value: this.properties.toggleModelInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleModelInfo = this.properties.toggleModelInfo === false;
                                this.updateImageDeckSignalFilters();
                                this.refreshOpenImageDeckSignalReceiver();
                                this.refreshDerpImageDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleSamplerInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_image_deck.system.get_sampler_name", "Get sampler name"),
                            value: this.properties.toggleSamplerInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo === false;
                                if (this.properties.toggleSamplerInfo !== false) this.fetchImageDeckKSamplerInfo();
                                this.updateImageDeckSignalFilters();
                                this.refreshOpenImageDeckSignalReceiver();
                                this.refreshDerpImageDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleSchedulerInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_image_deck.system.get_scheduler_name", "Get scheduler name"),
                            value: this.properties.toggleSchedulerInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo === false;
                                if (this.properties.toggleSchedulerInfo !== false) this.fetchImageDeckKSamplerInfo();
                                this.updateImageDeckSignalFilters();
                                this.refreshOpenImageDeckSignalReceiver();
                                this.refreshDerpImageDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
                    },
                }
            };
            if (this._derpPanel) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

    }
});