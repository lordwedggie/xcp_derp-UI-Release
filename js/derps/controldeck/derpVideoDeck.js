/**
 * Path: ./js/derps/derpVideoDeck.js
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { initDerpVideoDeckCore, resizeNodeToVideoAspect, getDerpVideoDeckVideoEl } from "./core/derpVideoDeck_core.js";
import { runWirelessHeartbeat } from "../../fatha/core/masterSignalEngine.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaSystemMessage } from "../../fatha/bastas/bastaSystemMessage.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { activeBastas } from "../../fatha/basta.js";
import { getSignalReceiverId } from "../../fatha/bastas/bastaSignalReceiver.js";
import { getPinnedVerticalDeckAnchor, restorePinnedVerticalDeckAnchor } from "../../fatha/core/dockResize.js";

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

function getVideoDeckPrefixPlaceholder() {
    return tLocale("$derp_video_deck.prefix.placeholder", "Video Prefix");
}

function normalizeVideoDeckToken(raw) {
    return String(raw || "").trim();
}

function isVideoDeckPrefixPlaceholder(value) {
    const normalized = normalizeVideoDeckToken(value);
    return !normalized || normalized === "Video Prefix" || normalized === getVideoDeckPrefixPlaceholder();
}

function syncDerpVideoDeckLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_video_deck.title", "Derp Video Deck");
    const previousLocalizedTitle = node._lastLocalizedDerpVideoDeckTitle;
    if (!node.titleLabel || node.titleLabel === "Derp Video Deck" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Video Deck" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (isVideoDeckPrefixPlaceholder(node.properties.videoDeckFilenamePrefix)) {
        node.properties.videoDeckFilenamePrefix = getVideoDeckPrefixPlaceholder();
    }
    node._lastLocalizedDerpVideoDeckTitle = localizedTitle;
}

function getVideoDeckCurrentVideo(node) {
    const list = Array.isArray(node?._derpVideoDeckList) ? node._derpVideoDeckList : [];
    if (list.length === 0) return null;
    let idx = Number.isInteger(node?._derpVideoDeckIndex) ? node._derpVideoDeckIndex : (list.length - 1);
    if (idx < 0) idx = 0;
    if (idx >= list.length) idx = list.length - 1;
    return list[idx] || null;
}

function normalizeVideoDeckFilenameToken(raw) {
    return normalizeVideoDeckToken(raw)
        .replace(/\.(mp4|webm|mov|mkv|avi|gif)$/i, "");
}

function getVideoDeckCustomPrefix(raw) {
    const prefix = normalizeVideoDeckToken(raw);
    return prefix && !isVideoDeckPrefixPlaceholder(prefix) ? prefix : "";
}

function formatVideoDeckPrefixDisplay(raw) {
    return `{{t_text_warning::${String(raw || getVideoDeckPrefixPlaceholder())}}}`;
}

function getVideoDeckFilenameOverride(raw) {
    return String(raw || "").replace(/\{\{[^:}]+::([^}]*)\}\}/g, "$1").trim();
}

function getVideoDeckFilenameExt(format) {
    const cleanFormat = String(format || "MP4").trim().toUpperCase();
    return cleanFormat === "WEBM" ? ".webm" : ".mp4";
}

function getVideoDeckFilenameEditBase(raw) {
    const text = getVideoDeckFilenameOverride(raw).split(/[\\/]/).pop();
    return normalizeVideoDeckFilenameToken(text);
}

function normalizeVideoDeckFolderPath(raw) {
    return String(raw || "").replace(/\\/g, "/").trim().replace(/^\/+|\/+$/g, "");
}

function formatVideoDeckFilenameDisplay(baseName, format, customFolder = "") {
    const displayName = `{{t_text_accent::${baseName}${getVideoDeckFilenameExt(format)}}}`;
    const folder = normalizeVideoDeckFolderPath(customFolder || "");
    if (!folder) return displayName;
    const folderPath = `${folder.replace(/\//g, "\\")}\\`;
    return `{{t_text_highlight::${folderPath}}}${displayName}`;
}

function buildVideoDeckBaseName(node, fileNameOnly = "") {
    const override = getVideoDeckFilenameEditBase(node.properties?.videoDeckFilenameOverride);
    if (override) return override;
    const modelPrefix = node.getVideoDeckModelNamePrefix ? node.getVideoDeckModelNamePrefix() : "";
    const samplerPrefix = node.getVideoDeckSamplerNamePrefix ? node.getVideoDeckSamplerNamePrefix(fileNameOnly) : "";
    const schedulerPrefix = node.getVideoDeckSchedulerNamePrefix ? node.getVideoDeckSchedulerNamePrefix(fileNameOnly) : "";
    const customPrefix = node.getVideoDeckFilenamePrefix ? node.getVideoDeckFilenamePrefix() : "";
    const parsedName = [modelPrefix, samplerPrefix, schedulerPrefix].map(normalizeVideoDeckToken).filter(Boolean).join("-");
    return customPrefix && parsedName ? `${customPrefix}_${parsedName}` : (customPrefix || parsedName || normalizeVideoDeckFilenameToken(fileNameOnly));
}

function formatVideoDeckTimestamp(date = new Date()) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const sec = String(date.getSeconds()).padStart(2, "0");
    return `${yy}${mm}${dd}-${hh}${min}${sec}`;
}

function formatVideoDeckTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
}

function getVideoDeckBottomY(node) {
    const y = Number(node?.pos?.[1]) || 0;
    const h = Number(node?.size?.[1] ?? node?.properties?.nodeSize?.[1]) || 0;
    return y + h;
}

function getVideoDeckRefreshAnchor(node) {
    if (node?.properties?.pinActive !== true) return null;
    const graph = window.app?.graph || node?.graph || null;
    const deckAnchor = getPinnedVerticalDeckAnchor(node, graph);
    if (deckAnchor) {
        if (Number.isFinite(node._videoDeckConfiguredBottomY) && deckAnchor.pinned?.id === node.id) {
            return { ...deckAnchor, bottom: node._videoDeckConfiguredBottomY };
        }
        return deckAnchor;
    }
    return {
        node,
        bottom: Number.isFinite(node._videoDeckConfiguredBottomY)
            ? node._videoDeckConfiguredBottomY
            : getVideoDeckBottomY(node)
    };
}

function restoreVideoDeckRefreshAnchor(anchor) {
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

async function saveVideoDeckCurrentVideo(node, isAutoSave = false) {
    const video = getVideoDeckCurrentVideo(node);
    if (!video || !video.filename) {
        showBastaMessage(node, tLocale("$derp_video_deck.messages.no_video_to_save", "No video to save"), 1800, { fade: true }, "btnSaveVideo", false, "error");
        return;
    }

    const fileNameOnly = String(video.filename || "").split(/[\\/]/).pop();
    const saveBaseName = buildVideoDeckBaseName(node, fileNameOnly);
    const stampedSaveName = `${saveBaseName}_${formatVideoDeckTimestamp()}`;
    const payload = {
        filename: video.filename,
        type: video.type || "output",
        subfolder: video.subfolder || "",
        target_subfolder: node.properties.videoDeckCustomFolder || "",
        save_format: String(node.properties.videoDeckSaveFormat || "MP4").trim(),
        save_name: String(stampedSaveName || "").trim()
    };

    // Metadata rides along for the transcode path (same-format copies keep source metadata).
    try {
        const promptData = await app.graphToPrompt();
        if (promptData?.output) payload.prompt = promptData.output;
        if (promptData?.workflow) payload.extra_pnginfo = { workflow: promptData.workflow };
    } catch (e) {}

    const res = await fetch("/xcp/derp_video_deck/save_current_video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
        const msg = data?.error || tLocale("$derp_video_deck.messages.save_failed", "Save failed");
        showBastaMessage(node, msg, 2200, { fade: true }, "btnSaveVideo", false, "error");
        return;
    }

    const savedName = String(data.filename || "").split(/[\\/]/).pop() || String(data.filename || "");
    showBastaSystemMessage(node, isAutoSave ? tLocale("$derp_video_deck.messages.auto_saved_prefix", "Auto-saved: ") : tLocale("$derp_video_deck.messages.saved_prefix", "Saved: "), 2200, { fade: true, grow: true }, "btnSaveVideo", "success", null, savedName);
}

async function exportFramesFromCurrentVideo(node) {
    const video = getVideoDeckCurrentVideo(node);
    if (!video || !video.filename) {
        showBastaMessage(node, tLocale("$derp_video_deck.messages.no_video_to_export", "No video to export frames from"), 1800, { fade: true }, "btnExportFrames", false, "error");
        return;
    }

    const fileNameOnly = String(video.filename || "").split(/[\\/]/).pop();
    const saveBaseName = buildVideoDeckBaseName(node, fileNameOnly);
    const stampedSaveName = `${saveBaseName}_${formatVideoDeckTimestamp()}`;
    const payload = {
        filename: video.filename,
        type: video.type || "output",
        subfolder: video.subfolder || "",
        target_subfolder: node.properties.videoDeckCustomFolder || "",
        save_name: String(stampedSaveName || "").trim()
    };

    const res = await fetch("/xcp/derp_video_deck/export_frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
        const msg = data?.error || tLocale("$derp_video_deck.messages.export_frames_failed", "Frame export failed");
        showBastaMessage(node, msg, 2200, { fade: true }, "btnExportFrames", false, "error");
        return;
    }

    const folderName = String(data.folder || "").split(/[\\/]/).pop() || String(data.folder || "");
    showBastaSystemMessage(node, tLocale("$derp_video_deck.messages.exported_prefix", "Exported "), 2200, { fade: true, grow: true }, "btnExportFrames", "success", null, `${data.frame_count} frames to ${folderName}`);
}

function openVideoDeckFolderSelector(node, items = []) {
    showBastaFileHandler(node, "output", "btnFolderSelector", {
        title: tLocale("$derp_video_deck.dialogs.select_folder.title", "Select Folder"),
        confirm: tLocale("$derp_video_deck.dialogs.select_folder.confirm", "Select"),
        mode: "folder",
        fileList: items,
        initialSize: [260, 260],
        properties: {
            bastaMovalbe: false,
            showFolderBrowser: true,
            folderDisplayText: tLocale("$derp_video_deck.dialogs.select_folder.placeholder", "Click to select folder path"),
            folderPlaceholderWhenRoot: true,
            selectedFolder: node.properties.videoDeckCustomFolder || "/",
            pendingName: "",
            originalName: ""
        },
        onConfirm: async (selectedFolder) => {
            node.properties.videoDeckCustomFolder = normalizeVideoDeckFolderPath(selectedFolder);
            if (node.refreshNodeLayoutMap) node.refreshNodeLayoutMap();
            if (node.requestDerpSync) node.requestDerpSync();
        }
    });
}

app.registerExtension({
    name: "xcp.derpVideoDeck_Extension",

    async setup() {
        initDerpGlobalListener();

        if (!window._xcpDerpVideoDeckPromptBridgeInstalled) {
            window._xcpDerpVideoDeckPromptBridgeInstalled = true;
            const originalGraphToPrompt = app.graphToPrompt;
            app.graphToPrompt = function() {
                const injectWirelessVideoInputs = (promptData) => {
                    const output = promptData && promptData.output ? promptData.output : promptData;
                    if (!output || !app.graph || !app.graph._nodes) return promptData;

                    app.graph._nodes.forEach((node) => {
                        if (!node || node._isDerpVideoDeckNode !== true) return;
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
                        if (target.inputs.video) return;

                        target.inputs.video = [String(sourceId), Number.isNaN(sourceSlot) ? 0 : sourceSlot];
                    });

                    return promptData;
                };

                const res = originalGraphToPrompt.apply(this, arguments);
                return (res instanceof Promise) ? res.then(injectWirelessVideoInputs) : injectWirelessVideoInputs(res);
            };
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DerpVideoDeckNode") return;

        fatha(nodeType, nodeData, 220);
        nodeType.prototype.computeSize = function(out) {
            if (out) { out[0] = 500; out[1] = 500; return out; }
            return [500, 500];
        };
        nodeType.prototype.baseZIndex = "2";
        initDerpVideoDeckCore(nodeType);

        const _baseApplyList = nodeType.prototype.applyDerpVideoDeckList;
        nodeType.prototype.applyDerpVideoDeckList = function(list, source) {
            _baseApplyList.call(this, list, source);
            if (this.properties && this.properties.toggleAutoSave === true) {
                saveVideoDeckCurrentVideo(this, true);
            }
        };

        nodeType.prototype._isDerpVideoDeckNode = true;

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            syncDerpVideoDeckLocaleLabels(this);
            this.refreshNodeLayoutMap();
            this.refreshDerpVideoDeckSysMap();
        };

        nodeType.prototype.updateVideoDeckSignalFilters = function() {
            const baseTypes = ["VIDEO"];
            const additionalTypes = [];
            if (this.properties.toggleModelInfo !== false) additionalTypes.push("MODEL");
            if (this.properties.toggleSamplerInfo !== false) additionalTypes.push("SAMPLER");
            if (this.properties.toggleSchedulerInfo !== false) additionalTypes.push("SCHEDULER");
            this.signalFilters = {
                types: baseTypes,
                additionalTypes,
                layoutOverrides: {
                    signalLabelText: {
                        VIDEO: tLocale("$derp_video_deck.signals.video_required", "Select VIDEO signal (required):"),
                        MODEL: tLocale("$derp_video_deck.signals.optional_for_filename", "Select optional signals for file name parsing:")
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
            return outputs.some(output => String(output?.type || "").toUpperCase().includes("VIDEO"));
        };

        nodeType.prototype.refreshOpenVideoDeckSignalReceiver = function() {
            const receiver = activeBastas.get(getSignalReceiverId());
            if (!receiver || receiver.hostNode !== this || receiver.isClosing) return;
            receiver._layoutDirty = true;
            receiver._forceSync = true;
            if (typeof receiver.requestDerpSync === "function") receiver.requestDerpSync();
        };

        nodeType.prototype.fetchVideoDeckKSamplerInfo = function() {
            const session = window._xcpDerpSession || Date.now();
            fetch(`/object_info/KSampler?v=${session}`)
                .then(response => {
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    return response.json();
                })
                .then(data => {
                    const samplerInput = data?.KSampler?.input?.required?.sampler_name;
                    const schedulerInput = data?.KSampler?.input?.required?.scheduler;
                    this.properties.videoDeckSamplerNames = Array.isArray(samplerInput?.[0]) ? samplerInput[0] : [];
                    this.properties.videoDeckSchedulerNames = Array.isArray(schedulerInput?.[0]) ? schedulerInput[0] : [];
                    this.updateVideoDeckSignalFilters();
                    if (this.refreshDerpVideoDeckSysMap) this.refreshDerpVideoDeckSysMap();
                    if (this.requestDerpSync) this.requestDerpSync();
                })
                .catch(error => {
                    console.error("[DerpVideoDeck] Failed to fetch KSampler info:", error);
                    this.properties.videoDeckSamplerNames = [];
                    this.properties.videoDeckSchedulerNames = [];
                    this.updateVideoDeckSignalFilters();
                    if (this.refreshDerpVideoDeckSysMap) this.refreshDerpVideoDeckSysMap();
                });
        };

        nodeType.prototype.getVideoDeckInfoSignalIndex = function(kind) {
            const normalized = String(kind || "").toUpperCase();
            if (normalized === "MODEL") return 1;
            if (normalized === "SAMPLER") return 2;
            if (normalized === "SCHEDULER") return 3;
            return null;
        };

        nodeType.prototype.getVideoDeckSignalIdByKind = function(kind) {
            const idx = this.getVideoDeckInfoSignalIndex ? this.getVideoDeckInfoSignalIndex(kind) : null;
            if (idx === null) return null;
            const ids = this.properties.multiSignalIds || {};
            const signalId = ids[idx] || ids[String(idx)] || ids[kind] || ids[String(kind || "").toUpperCase()] || null;
            if (!signalId) return null;
            const sigs = window.xcpDerpSignals || {};
            const sig = sigs[signalId] || sigs[String(signalId).split(":")[0]] || null;
            return this.signalMatchesVideoDeckKind(sig, kind) ? signalId : null;
        };

        nodeType.prototype.signalMatchesVideoDeckKind = function(sig, kind) {
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

        nodeType.prototype.getVideoDeckSignalValueByKind = function(kind) {
            const signalId = this.getVideoDeckSignalIdByKind ? this.getVideoDeckSignalIdByKind(kind) : null;
            if (!signalId) return "";
            const sigs = window.xcpDerpSignals || {};
            const sig = sigs[signalId] || sigs[String(signalId).split(":")[0]] || null;
            return normalizeVideoDeckToken(sig?.value);
        };

        nodeType.prototype.parseVideoDeckNameToken = function(fileNameOnly, names = []) {
            const cleanFile = normalizeVideoDeckFilenameToken(fileNameOnly);
            if (!cleanFile || !Array.isArray(names) || names.length === 0) return "";
            const lowerFile = cleanFile.toLowerCase();
            const sorted = [...names].filter(Boolean).sort((a, b) => String(b).length - String(a).length);
            return sorted.find(name => lowerFile.includes(String(name).toLowerCase())) || "";
        };

        nodeType.prototype.getVideoDeckModelNamePrefix = function() {
            if (this.properties.toggleModelInfo === false) return "";
            const modelSignalId = this.getVideoDeckSignalIdByKind ? this.getVideoDeckSignalIdByKind("MODEL") : null;
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

        nodeType.prototype.getVideoDeckSamplerNamePrefix = function(fileNameOnly = "") {
            if (this.properties.toggleSamplerInfo === false) return "";
            const names = Array.isArray(this.properties.videoDeckSamplerNames) ? this.properties.videoDeckSamplerNames : [];
            return this.getVideoDeckSignalValueByKind("SAMPLER") || this.parseVideoDeckNameToken(fileNameOnly, names);
        };

        nodeType.prototype.getVideoDeckSchedulerNamePrefix = function(fileNameOnly = "") {
            if (this.properties.toggleSchedulerInfo === false) return "";
            const names = Array.isArray(this.properties.videoDeckSchedulerNames) ? this.properties.videoDeckSchedulerNames : [];
            return this.getVideoDeckSignalValueByKind("SCHEDULER") || this.parseVideoDeckNameToken(fileNameOnly, names);
        };

        nodeType.prototype.getVideoDeckFilenamePrefix = function() {
            return getVideoDeckCustomPrefix(this.properties.videoDeckFilenamePrefix);
        };

        nodeType.prototype.getVideoDeckFilenameText = function() {
            const override = getVideoDeckFilenameEditBase(this.properties.videoDeckFilenameOverride);
            const list = Array.isArray(this._derpVideoDeckList) ? this._derpVideoDeckList : [];
            const idx = Number.isInteger(this._derpVideoDeckIndex) ? this._derpVideoDeckIndex : (list.length - 1);
            const video = list[idx] || null;

            const rawFile = video
                ? (video.filename || video.image || (typeof video === "string" ? video : ""))
                : "";
            const fileNameOnly = String(rawFile || "").split(/[\\/]/).pop();
            const baseName = override || buildVideoDeckBaseName(this, fileNameOnly);
            return formatVideoDeckFilenameDisplay(baseName, this.properties.videoDeckSaveFormat, this.properties.videoDeckCustomFolder);
        };

        nodeType.prototype.getVideoDeckFilenamePrefix = function() {
            return getVideoDeckCustomPrefix(this.properties.videoDeckFilenamePrefix);
        };

        // --- PLAYBACK CONTROL POINTER HANDLING ---
        // The Fatha canvas interaction contract is node-owned for sliders: the base
        // shield dispatch only forwards onPress/onDragStart/onDrag and never derives
        // slider values from the pointer. These helpers convert pointer X into a
        // 0..1 fraction against the live region rect (same space layout.hitTest uses).
        nodeType.prototype.resolveVideoDeckSliderFraction = function(regionKey, data) {
            const reg = this.layout?.regions?.[regionKey];
            if (!reg || !(Number(reg.w) > 0)) return null;
            const localX = Number(data?.localX ?? data?.displayLocalX);
            if (!Number.isFinite(localX)) return null;
            return Math.max(0, Math.min(1, (localX - Number(reg.x || 0)) / Number(reg.w)));
        };

        // THE SCRUB SMOOTHER (rAF coalescer): pointermove seek bursts collapse into one
        // currentTime set per animation frame — latest target wins, and an in-flight
        // seek is chased on the next frame instead of piling up. The browser
        // cancel-replaces pending seeks, but coalescing keeps the seek pipeline
        // tracking the pointer at display rate with zero per-event main-thread cost.
        nodeType.prototype.scheduleVideoDeckSeekApply = function() {
            if (this._videoDeckSeekRafPending) return;
            this._videoDeckSeekRafPending = true;
            const step = () => {
                // THE STALE-CHASER FIX: the target is only valid while the user is
                // actually driving the seek slider. If the drag ended (or never really
                // started, e.g. a click that fired onChange but released off the shield),
                // a queued chaser must NOT fire — otherwise a stale target snaps
                // currentTime back after the user pressed play, making the video jump
                // or appear to ignore the press.
                if (this._pressedRegionKey !== "sliderSeek") {
                    this._videoDeckSeekRafPending = false;
                    this._videoDeckSeekTarget = null;
                    return;
                }
                const vidObj = getDerpVideoDeckVideoEl(this);
                const target = this._videoDeckSeekTarget;
                if (!vidObj || target == null || !Number.isFinite(target)) {
                    // THE MISSING-ELEMENT FIX: bail cleanly and clear the stale target —
                    // a missing/detached element would otherwise requeue forever and
                    // pin _videoDeckSeekRafPending, deadlocking every later seek.
                    this._videoDeckSeekRafPending = false;
                    this._videoDeckSeekTarget = null;
                    return;
                }
                if (vidObj.seeking) {
                    this._videoDeckSeekRafPending = true;
                    requestAnimationFrame(step);
                    return;
                }
                if (Math.abs((vidObj.currentTime || 0) - target) > 0.011) {
                    try { vidObj.currentTime = target; } catch (e) {}
                }
                // Applied (or already within tolerance): consume the target so a late
                // frame can't re-fire it after the drag ends.
                this._videoDeckSeekRafPending = false;
                this._videoDeckSeekTarget = null;
            };
            requestAnimationFrame(step);
        };

        nodeType.prototype.applyVideoDeckSeekFraction = function(frac) {
            if (frac == null || !Number.isFinite(frac)) return;
            const vidObj = getDerpVideoDeckVideoEl(this);
            const duration = Number(this._videoDeckDuration || (vidObj && Number.isFinite(vidObj.duration) ? vidObj.duration : 0)) || 0;
            if (duration <= 0) return;
            const nextTime = Math.max(0, Math.min(duration, frac * duration));
            this._videoDeckCurrentTime = nextTime;
            this._videoDeckSeekTarget = nextTime;
            this.scheduleVideoDeckSeekApply();

            // THE SCRUB SMOOTHER (no per-move rebuild): the old path nulled
            // _layoutMapHash + called refreshNodeLayoutMap() on EVERY pointermove,
            // forcing a full map rebuild AND layout.compute each event. Video
            // frames are painted by drawImage on the MAIN thread, so that churn
            // starved frame presentation — the "stuck then jumps" scrub feel.
            // Instead, update every cached layer in place (live regions, comp-data
            // cache, and the layoutMap object the engine copies regions from) and
            // just dirty the canvas; the one clean rebuild happens on dragEnd
            // (finalizeVideoDeckSeekDrag).
            const timeText = `${formatVideoDeckTime(nextTime)} / ${formatVideoDeckTime(duration)}`;
            const seekReg = this.layout?.regions?.sliderSeek;
            if (seekReg) seekReg.value = frac;
            const seekComp = this._compDataCache?.sliderSeek;
            if (seekComp) seekComp.value = frac;
            const mapSlider = this.layoutMap?.contentRegion?.regionVideoControls?.sliderSeek;
            if (mapSlider) mapSlider.value = frac;
            const timeReg = this.layout?.regions?.lblTime;
            if (timeReg) { timeReg.text = timeText; timeReg.value = timeText; timeReg._resolvedDisplayText = timeText; }
            const timeComp = this._compDataCache?.lblTime;
            if (timeComp) { timeComp.text = timeText; timeComp.value = timeText; timeComp._resolvedDisplayText = timeText; }
            const mapTime = this.layoutMap?.contentRegion?.regionVideoControls?.lblTime;
            if (mapTime) mapTime.text = timeText;
            if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true, false);
        };

        // THE SCRUB SMOOTHER (drag finalize): one clean rebuild after the drag so the
        // cached map/hash state resyncs from _videoDeckCurrentTime — cheap, once.
        nodeType.prototype.finalizeVideoDeckSeekDrag = function() {
            // THE SUB-FRAME FIX: a click-drag-release that lands within a single JS task
            // leaves a queued chaser whose guard then skips it (pressed key already
            // cleared) — dropping the final position. Apply any pending target here
            // before consuming it, so the release point is never lost.
            const pendingTarget = this._videoDeckSeekTarget;
            if (pendingTarget != null && Number.isFinite(pendingTarget)) {
                const vidObj = getDerpVideoDeckVideoEl(this);
                if (vidObj && !vidObj.seeking && Math.abs((vidObj.currentTime || 0) - pendingTarget) > 0.011) {
                    try { vidObj.currentTime = pendingTarget; this._videoDeckCurrentTime = pendingTarget; } catch (e) {}
                }
            }
            // Consume the target so a queued chaser can't re-fire it after the drag
            // has ended (playback handoff).
            this._videoDeckSeekTarget = null;
            this._layoutMapHash = null;
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
            if (typeof this.requestDerpSync === "function") this.requestDerpSync();
        };

        nodeType.prototype.applyVideoDeckVolumeFraction = function(frac) {
            if (frac == null || !Number.isFinite(frac)) return;
            this._videoDeckVolume = frac;
            this._layoutMapHash = null;
            const vidObj = getDerpVideoDeckVideoEl(this);
            if (vidObj) vidObj.volume = frac;
            const volReg = this.layout?.regions?.sliderVolume;
            if (volReg) volReg.value = frac;
            const volComp = this._compDataCache?.sliderVolume;
            if (volComp) volComp.value = frac;
            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this.refreshNodeLayoutMap();
            this.refreshDerpVideoDeckSysMap();
        };

        const baseOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (baseOnNodeCreated) baseOnNodeCreated.apply(this, arguments);
            this._derpVideoDeckList = this._derpVideoDeckList || [];
            this._derpVideoDeckIndex = Number.isInteger(this._derpVideoDeckIndex) ? this._derpVideoDeckIndex : 0;
            this.properties.toggleModelInfo = this.properties.toggleModelInfo !== false;
            this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo !== false;
            this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo !== false;
            this.properties.toggleAutoFit = this.properties.toggleAutoFit === true;
            this.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            this.properties.toggleLoop = this.properties.toggleLoop === true;
            this.properties.toggleMuted = this.properties.toggleMuted === true;
            this.properties.videoDeckSamplerNames = Array.isArray(this.properties.videoDeckSamplerNames) ? this.properties.videoDeckSamplerNames : [];
            this.properties.videoDeckSchedulerNames = Array.isArray(this.properties.videoDeckSchedulerNames) ? this.properties.videoDeckSchedulerNames : [];
            this.properties.videoDeckFilenamePrefix = typeof this.properties.videoDeckFilenamePrefix === "string"
                ? this.properties.videoDeckFilenamePrefix
                : getVideoDeckPrefixPlaceholder();
            this.properties.videoDeckFilenameOverride = typeof this.properties.videoDeckFilenameOverride === "string"
                ? this.properties.videoDeckFilenameOverride
                : "";
            this.properties.videoDeckSaveFormat = typeof this.properties.videoDeckSaveFormat === "string"
                ? this.properties.videoDeckSaveFormat
                : "MP4";
            this.properties.videoDeckCustomFolder = typeof this.properties.videoDeckCustomFolder === "string"
                ? normalizeVideoDeckFolderPath(this.properties.videoDeckCustomFolder)
                : "";
            this.updateVideoDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.titleLabel = this.titleLabel || tLocale("$derp_video_deck.title", "Derp Video Deck");
            this.properties.titleLabel = this.titleLabel;
            this.properties.autoWidth = false;
            this.properties.autoHeight = false;
            this.size = [...this.properties.nodeSize];
            this.properties.drawSignalBtn = true;
            this.properties.drawSettingBtn = false;
            this.properties.videoDeckState = this.properties.videoDeckState || {
                index: 0,
                videos: []
            };
            syncDerpVideoDeckLocaleLabels(this);

            this._videoDeckSyncBurst = this._videoDeckSyncBurst || null;
            this._videoDeckSyncRetry120 = this._videoDeckSyncRetry120 || null;
            this._videoDeckSyncRetry400 = this._videoDeckSyncRetry400 || null;
            this._videoDeckHeartbeatBurst = this._videoDeckHeartbeatBurst || null;

            if (!this._videoDeckExecHooksBound && app.api) {
                this._videoDeckExecHooksBound = true;
                const clearSyncRetryTimers = () => {
                    if (this._videoDeckSyncRetry120) {
                        clearTimeout(this._videoDeckSyncRetry120);
                        this._videoDeckSyncRetry120 = null;
                    }
                    if (this._videoDeckSyncRetry400) {
                        clearTimeout(this._videoDeckSyncRetry400);
                        this._videoDeckSyncRetry400 = null;
                    }
                };
                const runHeartbeatOnce = (sourceNode, burstKey) => {
                    if (!sourceNode || sourceNode.properties?.isWirelessTransmitter !== true) return;
                    if (this._videoDeckHeartbeatBurst === burstKey) return;
                    this._videoDeckHeartbeatBurst = burstKey;
                    runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                };
                const scheduleSignalSyncBurst = (sourceNode, burstKey) => {
                    if (typeof this.syncDerpOutputs !== "function") return;

                    if (this._derpVideoDeckCrossfading === true) {
                        clearSyncRetryTimers();
                        runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                        this.syncDerpOutputs();

                        this._videoDeckSyncRetry120 = setTimeout(() => {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                            this.syncDerpOutputs();
                        }, 120);

                        this._videoDeckSyncRetry400 = setTimeout(() => {
                            runWirelessHeartbeat(sourceNode, { forceIndexedSingleOutput: true });
                            this.syncDerpOutputs();
                            this._videoDeckSyncRetry120 = null;
                            this._videoDeckSyncRetry400 = null;
                        }, 400);
                        return;
                    }

                    if (this._videoDeckSyncBurst === burstKey) return;
                    this._videoDeckSyncBurst = burstKey;

                    clearSyncRetryTimers();
                    runHeartbeatOnce(sourceNode, burstKey);
                    this.syncDerpOutputs();

                    this._videoDeckSyncRetry120 = setTimeout(() => {
                        runHeartbeatOnce(sourceNode, burstKey);
                        this.syncDerpOutputs();
                    }, 120);

                    this._videoDeckSyncRetry400 = setTimeout(() => {
                        runHeartbeatOnce(sourceNode, burstKey);
                        this.syncDerpOutputs();
                        this._videoDeckSyncBurst = null;
                        this._videoDeckHeartbeatBurst = null;
                        this._videoDeckSyncRetry120 = null;
                        this._videoDeckSyncRetry400 = null;
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

                    if (eventNodeId && String(baseId) === eventNodeId && eventImages.length > 0 && typeof this.applyDerpVideoDeckList === "function") {
                        clearSyncRetryTimers();
                        this._videoDeckSyncBurst = null;
                        this._videoDeckHeartbeatBurst = null;
                        this.applyDerpVideoDeckList(eventImages, "execution-event");
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

                    if (images.length > 0 && typeof this.applyDerpVideoDeckList === "function") {
                        clearSyncRetryTimers();
                        this._videoDeckSyncBurst = null;
                        this._videoDeckHeartbeatBurst = null;
                        this.applyDerpVideoDeckList(images, "executed-event");
                    }
                };
                app.api.addEventListener("executed", applyExecutedOutput);
                app.api.addEventListener("executing", syncFromSignal);
                app.api.addEventListener("execution_success", syncFromSignal);
                app.api.addEventListener("execution_error", syncFromSignal);
                app.api.addEventListener("execution_interrupted", syncFromSignal);
            }

            this.refreshNodeLayoutMap();
            this.refreshDerpVideoDeckSysMap();
            this.fetchVideoDeckKSamplerInfo();
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
                this._videoDeckConfiguredBottomY = configuredBottomY;
                restoreVideoDeckRefreshAnchor(getVideoDeckRefreshAnchor(this));
            }
            const infoProps = info && info.properties ? info.properties : null;
            const localProps = this.properties || null;
            const state = (infoProps && infoProps.videoDeckState) || (localProps && localProps.videoDeckState) || null;
            const videos = state && Array.isArray(state.videos) ? state.videos : [];
            const index = state && Number.isInteger(state.index) ? state.index : 0;
            this._derpVideoDeckList = videos;
            this._derpVideoDeckIndex = index;
            this._derpVideoDeckRestoringState = videos.length > 0;
            this.properties.toggleModelInfo = this.properties.toggleModelInfo !== false;
            this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo !== false;
            this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo !== false;
            this.properties.toggleAutoFit = this.properties.toggleAutoFit === true;
            this.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            this.properties.toggleLoop = this.properties.toggleLoop === true;
            this.properties.toggleMuted = this.properties.toggleMuted === true;
            this.properties.videoDeckSamplerNames = Array.isArray(this.properties.videoDeckSamplerNames) ? this.properties.videoDeckSamplerNames : [];
            this.properties.videoDeckSchedulerNames = Array.isArray(this.properties.videoDeckSchedulerNames) ? this.properties.videoDeckSchedulerNames : [];
            this.updateVideoDeckSignalFilters();
            this.properties.multiSignalIds = this.properties.multiSignalIds || {};
            this.properties.multiSignalLabels = this.properties.multiSignalLabels || {};
            this.properties.drawSignalBtn = true;
            this.properties.drawSettingBtn = false;
            this.properties.autoHeight = false;
            this.refreshDerpVideoDeckSysMap();
            this.fetchVideoDeckKSamplerInfo();
            if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
            restoreVideoDeckRefreshAnchor(getVideoDeckRefreshAnchor(this));
            this._videoDeckConfiguredBottomY = null;
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
            data.properties.videoDeckCustomFolder = this.properties.videoDeckCustomFolder || "";
            data.properties.videoDeckFilenamePrefix = this.properties.videoDeckFilenamePrefix || getVideoDeckPrefixPlaceholder();
            data.properties.videoDeckFilenameOverride = this.properties.videoDeckFilenameOverride || "";
            data.properties.videoDeckSaveFormat = this.properties.videoDeckSaveFormat || "MP4";
            data.properties.toggleAutoSave = this.properties.toggleAutoSave === true;
            data.properties.toggleLoop = this.properties.toggleLoop === true;
            data.properties.toggleMuted = this.properties.toggleMuted === true;
            data.properties.videoDeckState = {
                videos: Array.isArray(this._derpVideoDeckList) ? this._derpVideoDeckList : [],
                index: Number.isInteger(this._derpVideoDeckIndex) ? this._derpVideoDeckIndex : 0
            };
        };

        const baseOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            if (baseOnRemoved) baseOnRemoved.apply(this, arguments);
            // The attached (invisible) <video> elements must not outlive the node —
            // a removed node stops drawing, so nothing else would pause/detach them.
            const cache = this._videoInstanceCache;
            if (cache) {
                Object.values(cache).forEach((vidObj) => {
                    try { vidObj.pause(); } catch (e) {}
                    vidObj.removeAttribute("src");
                    try { vidObj.load(); } catch (e) {}
                    try { vidObj.remove(); } catch (e) {}
                });
                this._videoInstanceCache = null;
            }
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
            const refreshAnchor = getVideoDeckRefreshAnchor(this);
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
            this._derpVideoDeckFrameFadeAlpha = 1;
            const wasCrossfading = this._derpVideoDeckCrossfading === true;
            if (typeof this.getDerpVideoDeckCrossfadeAlpha === "function") {
                const alpha = this.getDerpVideoDeckCrossfadeAlpha();
                this._derpVideoDeckFrameFadeAlpha = alpha;
                if (alpha < 1) {
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                } else if (wasCrossfading && this._derpVideoDeckCrossfading !== true) {
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                    if (typeof this.requestDerpSync === "function") this.requestDerpSync();
                }
            }

            // THE CLOCK TICK: During playback, rebuild the layout map whenever the 0.1s
            // time bucket changes so the seek bar and time display track the video.
            // Suppressed while the user is dragging the seek slider (pressed-region lock).
            const vidEl = getDerpVideoDeckVideoEl(this);
            if (vidEl && !vidEl.paused && !vidEl.ended && this._pressedRegionKey !== "sliderSeek") {
                const bucket = Math.floor((vidEl.currentTime || 0) * 10);
                if (bucket !== this._videoDeckTimeBucket) {
                    this._videoDeckTimeBucket = bucket;
                    this._videoDeckCurrentTime = vidEl.currentTime || 0;
                    if (Number.isFinite(vidEl.duration)) this._videoDeckDuration = vidEl.duration;
                    this._layoutMapHash = null;
                    if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                }
            }

            if (baseOnDrawForeground) baseOnDrawForeground.apply(this, arguments);
            this._derpVideoDeckFrameFadeAlpha = null;
            restoreVideoDeckRefreshAnchor(refreshAnchor);
        };

        nodeType.prototype.refreshNodeLayoutMap = function(scheduleSync = true) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            this.properties.drawSettingBtn = false;

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));
            this.properties.footerAnchorGap = Math.max(Number(this.properties.footerAnchorGap) || 0, mH);
            this.properties.footerGapHeight = mH;
            this.properties.footerHeight = mH;

            const count = Array.isArray(this._derpVideoDeckList) ? this._derpVideoDeckList.length : 0;
            const videoUrl = this.getDerpVideoDeckCurrentUrl ? this.getDerpVideoDeckCurrentUrl() : null;
            const posterUrl = this.getDerpVideoDeckPosterUrl ? this.getDerpVideoDeckPosterUrl() : null;
            const prevPosterUrl = this._derpVideoDeckPrevPosterUrl || null;
            const frameFadeAlpha = Number(this._derpVideoDeckFrameFadeAlpha);
            const fadeAlpha = Number.isFinite(frameFadeAlpha)
                ? frameFadeAlpha
                : (this._derpVideoDeckCrossfading === true
                    ? Math.max(0, Math.min(1, Number(this._derpVideoDeckCrossfadeFrom || 0)))
                    : 1);
            const filenameText = this.getVideoDeckFilenameText ? this.getVideoDeckFilenameText() : "";

            const hasVideo = !!videoUrl;
            if (!this._hasVideoDiagDone) { this._hasVideoDiagDone = true; console.log("[VD-DIAG] hasVideo=", hasVideo, "videoUrl=", videoUrl, "count=", count); }
            const vid = getDerpVideoDeckVideoEl(this);
            const isPlaying = this._videoDeckIsPlaying === true && !!vid && !vid.paused && !vid.ended;
            const curTime = Math.max(0, Number(this._videoDeckCurrentTime || 0));
            const duration = Math.max(0, Number(this._videoDeckDuration || (vid && Number.isFinite(vid.duration) ? vid.duration : 0) || 0));
            const seekFrac = duration > 0 ? Math.max(0, Math.min(1, curTime / duration)) : 0;
            const timeText = `${formatVideoDeckTime(curTime)} / ${formatVideoDeckTime(duration)}`;
            const isMuted = this.properties.toggleMuted === true;
            const volume = Number.isFinite(this._videoDeckVolume) ? this._videoDeckVolume : 1;
            const timeBucket = this._videoDeckTimeBucket || 0;

            const isLooping = this.properties.toggleLoop === true;
            const structureHash = `${count}_${videoUrl || "none"}_${posterUrl || "none"}_${prevPosterUrl || "none"}_${fadeAlpha.toFixed(3)}_${this.size[0].toFixed(2)}_${(this.size[1] || 0).toFixed(2)}_${mW}_${mH}_${sW}_${sH}_${pW}_${pH}_${this.titleLabel}_${filenameText}_${isPlaying}_${timeBucket}_${duration.toFixed(1)}_${isMuted}_${volume.toFixed(2)}_${hasVideo}_${isLooping}`;
            if (this._layoutMapHash === structureHash && this.layoutMap) return;
            this._layoutMapHash = structureHash;

            this.layoutMap = {
                    contentRegion: {
                        anchor: { target: "headerRegion", axis: "y" },
                        width: "full",
                        height: "fill",
                        dir: "col",
                        margin: [mW, mH, mW, 0],
                    videoRegion: {
                        type: this.UI_TYPES.IMAGE_HTML,
                        // NOTE: the engine overwrites `key` with the map slot name
                        // ("videoRegion"); the video element is cached under that name.
                        key: "videoRegion",
                        width: "full", height: "fill",
                        minHeight: 60,
                        padding: [0, 0],
                        themeKey: videoUrl ? "panel, t_textNormal" : "panel, t_textBig",
                        placeholderFontSize: 12,
                        imageUrl: posterUrl,
                        previousImageUrl: prevPosterUrl,
                        transitionAlpha: fadeAlpha,
                        videoUrl,
                        videoMuted: isMuted,
                        videoLoop: this.properties.toggleLoop === true,
                        useRenderCache: false,
                        imageSmoothingQuality: "high",
                        aspectFit: "contain",
                        cornerRadius: 0,
                        suppressPlaceholder: false,
                        placeholderEmptyText: tLocale("$derp_video_deck.placeholder.no_video", "No Video"),
                        drawMode: "both",
                        strokeZIndex: true,
                        onVideoMetadata: (vidObj) => {
                            if (Number.isFinite(vidObj?.duration)) this._videoDeckDuration = vidObj.duration;
                            if (vidObj && this._videoDeckVolume != null) vidObj.volume = this._videoDeckVolume;
                            if (!this._derpVideoDeckPosterUrl) {
                                // No poster: metadata is the only authoritative aspect source.
                                const preserveTop = this._derpVideoDeckRestoringState === true;
                                this._derpVideoDeckRestoringState = false;
                                resizeNodeToVideoAspect(this, vidObj, { preserveTop });
                            }
                            this._layoutMapHash = null;
                            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                        },
                        onPlayState: (vidObj) => {
                            this._videoDeckIsPlaying = !!vidObj && !vidObj.paused && !vidObj.ended;
                            if (vidObj) this._videoDeckCurrentTime = vidObj.currentTime || 0;
                            this._layoutMapHash = null;
                            if (typeof this.refreshNodeLayoutMap === "function") this.refreshNodeLayoutMap(false);
                        },
                        onVideoFrame: (vidObj) => {
                            if (!vidObj) return;
                            // THE SCRUB SMOOTHER: while the seek slider is being dragged, the
                            // pointer owns the slider/time display — the landed-frame
                            // self-correction (throttled at 200ms) would fight it and make
                            // the fill stutter backwards mid-scrub.
                            if (this._pressedRegionKey === "sliderSeek") return;
                            this._videoDeckCurrentTime = vidObj.currentTime || 0;
                            if (Number.isFinite(vidObj.duration)) this._videoDeckDuration = vidObj.duration;
                            const now = performance.now();
                            if (now - (this._lastVideoFrameUpdate || 0) < 200) return;
                            this._lastVideoFrameUpdate = now;
                            const cur = this._videoDeckCurrentTime;
                            const dur = this._videoDeckDuration || 0;
                            if (dur <= 0) return;
                            const frac = Math.max(0, Math.min(1, cur / dur));
                            const timeText = `${formatVideoDeckTime(cur)} / ${formatVideoDeckTime(dur)}`;
                            const seekReg = this.layout?.regions?.sliderSeek;
                            if (seekReg) seekReg.value = frac;
                            const seekComp = this._compDataCache?.sliderSeek;
                            if (seekComp) seekComp.value = frac;
                            const timeReg = this.layout?.regions?.lblTime;
                            if (timeReg) { timeReg.text = timeText; timeReg.value = timeText; timeReg._resolvedDisplayText = timeText; }
                            const timeComp = this._compDataCache?.lblTime;
                            if (timeComp) { timeComp.text = timeText; timeComp.value = timeText; timeComp._resolvedDisplayText = timeText; }
                            if (this.setDirtyCanvas) this.setDirtyCanvas(true, false);
                        }
                    },
                    regionVideoControls: {
                        anchor: { target: "videoRegion", axis: "y" },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [0, 0], margin: [0, mH, 0, 0],
                        btnPlayPause: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: isPlaying ? "pause" : "play",
                            themeKey: "button, t_textNormal",
                            width: "match", height: "fill", iconScale: 0.6,
                            spacing: [sW, 0],
                            padding: [pW, pH],
                            mouseOver: true,
                            state: hasVideo ? "OFF" : "DIS",
                            toolTip: isPlaying
                                ? tLocale("$derp_video_deck.tooltips.pause", "Pause playback")
                                : tLocale("$derp_video_deck.tooltips.play", "Play video"),
                            onPress: () => {
                                const vidObj = getDerpVideoDeckVideoEl(this);
                                if (!vidObj) {
                                    // Element is created at draw time; a missing element means the
                                    // display URL was not committed yet — force a refresh and retry.
                                    if (typeof this.syncDerpVideoDeckDisplayUrl === "function") this.syncDerpVideoDeckDisplayUrl();
                                    this._layoutMapHash = null;
                                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap(false);
                                    return;
                                }
                                if (vidObj._loadFailed) {
                                    showBastaMessage(this, tLocale("$derp_video_deck.messages.video_load_failed", "Video failed to load"), 2200, { fade: true }, "btnPlayPause", false, "error");
                                    return;
                                }
                                if (vidObj.paused || vidObj.ended) {
                                    // THE PLAY-vs-CHASER FIX: a seek slider chaser queued while the video
                                    // was paused/seeking must not fire once the user presses play — its
                                    // stale target would snap currentTime back and look like play did
                                    // nothing. Drop the pending target before starting playback.
                                    this._videoDeckSeekRafPending = false;
                                    this._videoDeckSeekTarget = null;
                                    if (vidObj.ended) {
                                        try { vidObj.currentTime = 0; } catch (e) {}
                                    }
                                    // play() is legal before loadeddata — the browser waits for data.
                                    const playPromise = vidObj.play();
                                    if (playPromise && typeof playPromise.catch === "function") {
                                        playPromise.catch(() => {
                                            this._layoutMapHash = null;
                                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap(false);
                                        });
                                    }
                                } else {
                                    vidObj.pause();
                                }
                            }
                        },
                        sliderSeek: {
                            type: this.UI_TYPES.SLIDER_V2,
                            themeKey: "slider, t_textSmall",
                            width: "full", height: "fill",
                            renderPath: "canvas",
                            spacing: [sW, 0],
                            padding: [pW, pH],
                            value: seekFrac,
                            min: 0, max: 1, step: 0.001, decimals: 3,
                            label: "",
                            state: hasVideo ? "OFF" : "DIS",
                            toolTip: tLocale("$derp_video_deck.tooltips.seek", "Seek through the video"),
                            onPress: (_e, data) => this.applyVideoDeckSeekFraction(this.resolveVideoDeckSliderFraction("sliderSeek", data)),
                            onDragStart: (_e, data) => this.applyVideoDeckSeekFraction(this.resolveVideoDeckSliderFraction("sliderSeek", data)),
                            onDrag: (_e, data) => this.applyVideoDeckSeekFraction(this.resolveVideoDeckSliderFraction("sliderSeek", data)),
                            // THE SCRUB SMOOTHER: the drag itself stays rebuild-free; the
                            // one full map/hash resync happens here, when the drag ends.
                            onDragEnd: () => this.finalizeVideoDeckSeekDrag(),
                            onChange: (v) => this.applyVideoDeckSeekFraction(Math.max(0, Math.min(1, Number(v) || 0)))
                        },
                        btnReplay: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "revert",
                            themeKey: "button, t_textNormal",
                            width: "match", height: "fill", iconScale: 0.6,
                            spacing: [sW, 0],
                            padding: [pW, pH],
                            mouseOver: true,
                            state: hasVideo ? (isLooping ? "ON" : "OFF") : "DIS",
                            toolTip: tLocale("$derp_video_deck.tooltips.replay", "Auto-replay when video ends"),
                            onPress: () => {
                                this.properties.toggleLoop = this.properties.toggleLoop !== true;
                                const vidObj = getDerpVideoDeckVideoEl(this);
                                if (vidObj) vidObj.loop = this.properties.toggleLoop === true;
                                this._layoutMapHash = null;
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap(false);
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        lblTime: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSmall",
                            spacing: [sW, 0],
                            labelAlign: ["center", "middle"],
                            text: timeText,
                            measureText: "00:00 / 00:00",
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        btnMute: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: isMuted ? "mute" : "volume",
                            themeKey: "button, t_textNormal",
                            width: "match", height: "fill", iconScale: 0.6,
                            spacing: [sW, 0],
                            padding: [pW, pH],
                            mouseOver: true,
                            state: hasVideo ? "OFF" : "DIS",
                            toolTip: isMuted
                                ? tLocale("$derp_video_deck.tooltips.unmute", "Unmute audio")
                                : tLocale("$derp_video_deck.tooltips.mute", "Mute audio"),
                            onPress: () => {
                                this.properties.toggleMuted = this.properties.toggleMuted !== true;
                                const vidObj = getDerpVideoDeckVideoEl(this);
                                if (vidObj) vidObj.muted = this.properties.toggleMuted === true;
                                this._layoutMapHash = null;
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap(false);
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        sliderVolume: {
                            type: this.UI_TYPES.SLIDER_V2,
                            themeKey: "slider, t_textSmall",
                            width: 60, height: "fill",
                            renderPath: "canvas",
                            padding: [pW, pH],
                            value: volume,
                            min: 0, max: 1, step: 0.05, decimals: 2,
                            label: "",
                            state: hasVideo && !isMuted ? "OFF" : "DIS",
                            toolTip: tLocale("$derp_video_deck.tooltips.volume", "Playback volume"),
                            onPress: (_e, data) => this.applyVideoDeckVolumeFraction(this.resolveVideoDeckSliderFraction("sliderVolume", data)),
                            onDragStart: (_e, data) => this.applyVideoDeckVolumeFraction(this.resolveVideoDeckSliderFraction("sliderVolume", data)),
                            onDrag: (_e, data) => this.applyVideoDeckVolumeFraction(this.resolveVideoDeckSliderFraction("sliderVolume", data)),
                            onChange: (v) => this.applyVideoDeckVolumeFraction(Math.max(0, Math.min(1, Number(v) || 0)))
                        }
                    },
                    regionVideoHandling1: {
                        anchor: { target: "regionVideoControls", axis: "y" },
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [0, sH], margin: [0, mH],
                        btnFolderSelector: {
                            type: this.UI_TYPES.ICONBUTTON,
                            icon: "file",
                            themeKey: "button, t_textNormal",
                            width: "match", height: "fill", iconScale: 0.6,
                            spacing: [sW, 0], padding: [pW, pH],
                            mouseOver: true,
                            state: "OFF",
                            toolTip: tLocale("$derp_video_deck.tooltips.folder_selector", "Selects {{t_toolTip_highlight::Folder Path}} where the video will be saved to disk"),
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
                                            const msg = data?.error ? `${tLocale("$derp_video_deck.messages.folder_list_failed_prefix", "Folder list failed: ")}${data.error}` : `${tLocale("$derp_video_deck.messages.folder_list_failed_status_prefix", "Folder list failed (")}${status})`;
                                            showBastaMessage(this, msg, 2800, { fade: true }, "btnFolderSelector", false, "error");
                                            return;
                                        }

                                        if (folderItems.length === 0) {
                                            showBastaMessage(this, tLocale("$derp_video_deck.messages.no_output_subfolders", "No output subfolders found"), 2400, { fade: true }, "btnFolderSelector", false, "info");
                                        }

                                        openVideoDeckFolderSelector(this, items);
                                    })
                                    .catch((e) => {
                                        console.warn("[DerpVideoDeck] Failed to load output folders:", e);
                                        showBastaMessage(this, tLocale("$derp_video_deck.messages.folder_list_request_failed", "Folder list request failed"), 2800, { fade: true }, "btnFolderSelector", false, "error");
                                    });
                            }
                        },
                        edtiorFilenamePrefix: {
                            type: this.UI_TYPES.EDITOR,
                            canvasShield: true,
                            toolTip: `{{t_text_highlight::Prefix}} for auto-generated video {{t_text_accent::Filename}}`,
                            themeKey: "dialog, t_textNormal",
                            width: "fit",
                            height: "auto",
                            padding: [pW, pH], spacing: [sH, 0],
                            labelAlign: ["left", "middle"],
                            text: formatVideoDeckPrefixDisplay(this.properties.videoDeckFilenamePrefix),
                            value: this.properties.videoDeckFilenamePrefix || getVideoDeckPrefixPlaceholder(),
                            onBlur: (v) => {
                                this.properties.videoDeckFilenamePrefix = String(v || "").trim() || getVideoDeckPrefixPlaceholder();
                                this.properties.videoDeckFilenameOverride = "";
                                const filenameText = this.getVideoDeckFilenameText ? this.getVideoDeckFilenameText() : "";
                                const filenameReg = this.layout?.regions?.editorVideoFilename;
                                if (filenameReg) {
                                    filenameReg.text = filenameText;
                                    filenameReg.value = filenameText;
                                }
                                const filenameComp = this._compDataCache?.editorVideoFilename;
                                if (filenameComp) {
                                    filenameComp.text = filenameText;
                                    filenameComp.value = filenameText;
                                }
                                if (this._editorLineCache?.editorVideoFilename) delete this._editorLineCache.editorVideoFilename;
                                const filenameEl = this._derpDomElements?.editorVideoFilename;
                                if (filenameEl?._config) {
                                    filenameEl._config.text = filenameText;
                                    filenameEl._config.value = filenameText;
                                    filenameEl._lastStateHash = null;
                                    if (!filenameEl._isAwake && document.activeElement !== filenameEl) filenameEl.value = filenameText.replace(/\{\{[^}]+\}\}/g, "");
                                }
                                this._layoutMapHash = null;
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        editorVideoFilename: {
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
                            onFocus: (_v, el) => {
                                const editBase = getVideoDeckFilenameEditBase(this.properties.videoDeckFilenameOverride || filenameText);
                                if (el && el.value !== editBase) el.value = editBase;
                                if (el?._config) {
                                    el._config.text = editBase;
                                    el._config.value = editBase;
                                }
                            },
                            onInput: (v) => {
                                this.properties.videoDeckFilenameOverride = getVideoDeckFilenameEditBase(v);
                                this._layoutMapHash = null;
                                if (this.requestDerpSync) this.requestDerpSync();
                                if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                            },
                            onBlur: (v) => {
                                this.properties.videoDeckFilenameOverride = getVideoDeckFilenameEditBase(v);
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        btnSaveVideo: {
                            type: this.UI_TYPES.BUTTON,
                            text: tLocale("$derp_video_deck.buttons.save_video", "SAVE VIDEO"),
                            themeKey: "button, t_textSmall",
                            width: "auto", height: "fill",
                            spacing: [sW, 0],
                            padding: [4, pH],
                            mouseOver: true,
                            state: hasVideo ? "OFF" : "DIS",
                            onPress: async () => {
                                if (!hasVideo) return;
                                try {
                                    await saveVideoDeckCurrentVideo(this);
                                } catch (e) {
                                    showBastaMessage(this, tLocale("$derp_video_deck.messages.save_failed", "Save failed"), 2200, { fade: true }, "btnSaveVideo", false, "error");
                                }
                            }
                        },
                        btnExportFrames: {
                            type: this.UI_TYPES.BUTTON,
                            text: tLocale("$derp_video_deck.buttons.export_frames", "EXPORT FRAMES"),
                            themeKey: "button, t_textSmall",
                            width: "auto", height: "fill",
                            spacing: [sW, 0],
                            padding: [4, pH],
                            mouseOver: true,
                            state: hasVideo ? "OFF" : "DIS",
                            onPress: async () => {
                                if (!hasVideo) return;
                                try {
                                    await exportFramesFromCurrentVideo(this);
                                } catch (e) {
                                    showBastaMessage(this, tLocale("$derp_video_deck.messages.export_frames_failed", "Frame export failed"), 2200, { fade: true }, "btnExportFrames", false, "error");
                                }
                            }
                        }
                    },
                    regionVideoSpacer: {
                        anchor: { target: "regionVideoHandling1", axis: "y" },
                        dir: "col",
                        width: "full",
                        height: mH,
                    },
                }
            };

            if (this.layout) this.layout._lastCacheKey = "";
            if (scheduleSync && typeof this.requestDerpSync === "function") this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpVideoDeckSysMap = function() {
            const vars = this.getDerpVars(this);
            const mW = vars.mW, mH = vars.mH, oY = vars.oY, pW = vars.pW, pH = vars.pH, sW = vars.sW, sH = vars.sH;
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    width: "full",
                    height: "auto",
                    margin: [mW, 0, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    lblInfo: {
                        type: this.UI_TYPES.TEXT, hidden: true,
                        mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_video_deck.system.settings", "Video Deck settings"),
                        width: "full",
                        padding: [pW, pH],
                    },
                    regionOption1: {
                        dir: "row", margin: [0, mH, 0, sH],
                        width: "full", height: "auto",
                        lblNodeSize: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_video_deck.system.node_size", "Node size:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        editorNodeSize: {
                            type: this.UI_TYPES.EDITOR,
                            canvasShield: true,
                            themeKey: "dialog, t_textSystem",
                            labelAlign: ["center", "middle"],
                            text: `${Math.round(this.size[0])}, ${Math.round(this.size[1])}`,
                            value: `${Math.round(this.size[0])}, ${Math.round(this.size[1])}`,
                            measureText: "9999, 9999",
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
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
                                    if (this.refreshDerpVideoDeckSysMap) this.refreshDerpVideoDeckSysMap();
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
                            label: tLocale("$derp_video_deck.system.auto_adjust_height", "Auto adjust node height"),
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
                                    this._videoDeckPinnedAnchor = null;
                                }
                                if (this.refreshDerpVideoDeckSysMap) this.refreshDerpVideoDeckSysMap();
                                if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                if (typeof this.syncDerpVideoDeckDisplayUrl === "function") this.syncDerpVideoDeckDisplayUrl();
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
                            label: tLocale("$derp_video_deck.system.auto_save_new", "Auto save new videos"),
                            value: this.properties.toggleAutoSave === true,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            spacing: [sW, 0],
                            onPress: () => {
                                this.properties.toggleAutoSave = this.properties.toggleAutoSave !== true;
                                if (this.refreshDerpVideoDeckSysMap) this.refreshDerpVideoDeckSysMap();
                                if (this.requestDerpSync) this.requestDerpSync();
                            }
                        },
                        lblVideoFormat: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textsystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_video_deck.system.video_format", "Video format:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        dropdownVideoFormat: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            themeKey: "dialog, t_textSmall",
                            canvasShield: true,
                            width: "fit", height: "auto",
                            padding: [pW, 1],
                            mode: "file",
                            rootName: "format",
                            spacing: [sW, 0],
                            items: ["MP4", "WEBM"],
                            value: this.properties.videoDeckSaveFormat || "MP4",
                            text: this.properties.videoDeckSaveFormat || "MP4",
                            onChange: (v) => {
                                this.properties.videoDeckSaveFormat = String(v || "MP4").trim().toUpperCase() || "MP4";
                                this.refreshDerpVideoDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
                    },

                    regionOption2: {
                        anchor: { target: "regionOption1", axis: "y"},
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        lblParseFilename: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_video_deck.system.parse_filename", "Parse filename:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        toggleModelInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_video_deck.system.get_model_name", "Get model name"),
                            value: this.properties.toggleModelInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleModelInfo = this.properties.toggleModelInfo === false;
                                this.updateVideoDeckSignalFilters();
                                this.refreshOpenVideoDeckSignalReceiver();
                                this.refreshDerpVideoDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleSamplerInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_video_deck.system.get_sampler_name", "Get sampler name"),
                            value: this.properties.toggleSamplerInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleSamplerInfo = this.properties.toggleSamplerInfo === false;
                                if (this.properties.toggleSamplerInfo !== false) this.fetchVideoDeckKSamplerInfo();
                                this.updateVideoDeckSignalFilters();
                                this.refreshOpenVideoDeckSignalReceiver();
                                this.refreshDerpVideoDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleSchedulerInfo: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_video_deck.system.get_scheduler_name", "Get scheduler name"),
                            value: this.properties.toggleSchedulerInfo !== false,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleSchedulerInfo = this.properties.toggleSchedulerInfo === false;
                                if (this.properties.toggleSchedulerInfo !== false) this.fetchVideoDeckKSamplerInfo();
                                this.updateVideoDeckSignalFilters();
                                this.refreshOpenVideoDeckSignalReceiver();
                                this.refreshDerpVideoDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
                    },

                    regionOption3: {
                        anchor: { target: "regionOption2", axis: "y"},
                        dir: "row",
                        width: "full",
                        height: "auto",
                        spacing: [sW, 0],
                        lblPlayback: {
                            type: this.UI_TYPES.TEXT,
                            mouseOver: false,
                            themeKey: "t_textSystem",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_video_deck.system.playback", "Playback:"),
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                        },
                        toggleLoop: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_video_deck.system.loop_playback", "Loop playback"),
                            value: this.properties.toggleLoop === true,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleLoop = this.properties.toggleLoop !== true;
                                const vidObj = getDerpVideoDeckVideoEl(this);
                                if (vidObj) vidObj.loop = this.properties.toggleLoop === true;
                                this.refreshDerpVideoDeckSysMap();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        toggleMuted: {
                            type: this.UI_TYPES.TOGGLE_V2,
                            themeKey: "dialog, button, t_textSystem", isTextOnly: true,
                            icon: "radio",
                            label: tLocale("$derp_video_deck.system.mute_audio", "Mute audio"),
                            value: this.properties.toggleMuted === true,
                            width: "auto",
                            height: "auto",
                            padding: [pW, pH],
                            onPress: () => {
                                this.properties.toggleMuted = this.properties.toggleMuted !== true;
                                const vidObj = getDerpVideoDeckVideoEl(this);
                                if (vidObj) vidObj.muted = this.properties.toggleMuted === true;
                                this.refreshDerpVideoDeckSysMap();
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
