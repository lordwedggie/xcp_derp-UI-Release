/**
 * Path: ./js/derpLatent.js
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../../fatha/fatha.js";
import { transmitDerpSignal } from "../../fatha/core/masterSignalEngine.js";

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

function normalizeLatentMode(mode) {
    const raw = String(mode || "").trim();
    const lower = raw.toLowerCase();
    const portraitLabel = String(tLocale("$derp_latent.mode.portrait", "Portrait")).trim().toLowerCase();
    const landscapeLabel = String(tLocale("$derp_latent.mode.landscape", "Landscape")).trim().toLowerCase();
    if (lower === "portrait" || lower === portraitLabel) return "Portrait";
    return "Landscape";
}

// MP scaling convention (matches ComfyUI core ResolutionSelector, the node used
// by the official Krea-2 workflow): megapixels = TOTAL pixel area, so linear
// dimensions scale by sqrt(MP). Krea-2 requires dimensions divisible by 16
// (Qwen VAE 8x spatial factor + DiT patch size 2), so snap the scaled result
// to the nearest multiple of 16. 1024 @ MP 2.0 -> 1448 -> 1456; MP 4.0 -> 2048.
function snapDerpLatentTo16(value) {
    return Math.max(16, Math.round(Number(value) / 16) * 16);
}

function syncDerpLatentLocaleLabels(node) {
    if (!node?.properties) return;
    const localizedTitle = tLocale("$derp_latent.title", "Derp Latent");
    const localizedOutput = tLocale("$derp_latent.output", "Latent");
    const previousLocalizedTitle = node._lastLocalizedDerpLatentTitle;
    const previousLocalizedOutput = node._lastLocalizedDerpLatentOutput;

    if (!node.titleLabel || node.titleLabel === "Derp Latent" || (previousLocalizedTitle && node.titleLabel === previousLocalizedTitle)) {
        node.titleLabel = localizedTitle;
    }
    if (!node.properties.titleLabel || node.properties.titleLabel === "Derp Latent" || (previousLocalizedTitle && node.properties.titleLabel === previousLocalizedTitle)) {
        node.properties.titleLabel = localizedTitle;
    }
    if (!node.properties.outputName || node.properties.outputName === "Latent" || (previousLocalizedOutput && node.properties.outputName === previousLocalizedOutput)) {
        node.properties.outputName = localizedOutput;
    }
    if (Array.isArray(node.outputs) && node.outputs[0] && (!node.outputs[0].name || node.outputs[0].name === "Latent" || (previousLocalizedOutput && node.outputs[0].name === previousLocalizedOutput))) {
        node.outputs[0].name = localizedOutput;
    }

    node._lastLocalizedDerpLatentTitle = localizedTitle;
    node._lastLocalizedDerpLatentOutput = localizedOutput;
}

app.registerExtension({
    name: "xcp.derpLatent_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "DerpLatentNode") return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 200);

        // --- PROFILE LOGIC ---
        nodeType.prototype.applyDerpProfile = function(profileName) {
            if (!this._sysProfileData || !this._sysProfileData[profileName] || profileName === "(No Profiles Found)") return;
            const profile = this._sysProfileData[profileName];

            this.properties.batchSize = profile.batch ?? 1;
            this.properties.mode = normalizeLatentMode(profile.mode ?? "Landscape");
            this.properties.latentPresets = profile.presets || [];
            const isPortrait = this.properties.mode === "Portrait";

            if (this.properties.latentPresets.length > 0) {
                const first = this.properties.latentPresets[0];
                this.properties.width = isPortrait ? first.height : first.width;
                this.properties.height = isPortrait ? first.width : first.height;
                const ar = (isPortrait ? first.aspectRatio.split(" : ").reverse().join(":") : first.aspectRatio).replace(/\s*:\s*/g, ":");
                this.properties.selectedLatent = `${ar} - ${this.properties.width} x ${this.properties.height}`;
            }

            this.refreshNodeLayoutMap();
            this.broadcastLatentState();
            this.requestDerpSync();
        };

        nodeType.prototype.hydrateDerpLatentProfileData = function(profileName = null) {
            if (!this._sysProfileData) return false;
            const allNames = Object.keys(this._sysProfileData);
            const pickDefault = (names) => {
                if (names.includes("Krea2")) return "Krea2";
                const sorted = [...names].sort();
                return sorted[0];
            };
            const selectedName = profileName || this._currentProfileName || pickDefault(allNames);
            const profile = this._sysProfileData[selectedName];
            if (!profile || selectedName === "(No Profiles Found)") return false;

            this._currentProfileName = selectedName;
            this.properties.latentPresets = profile.presets || [];
            if (!this.properties.selectedLatent && this.properties.latentPresets.length > 0) {
                this.applyDerpProfile(selectedName);
                return true;
            }

            this.refreshNodeLayoutMap();
            this.broadcastLatentState();
            this.requestDerpSync();
            return true;
        };

        nodeType.prototype.loadFirstProfile = async function() {
            try {
                const res = await fetch("/xcp/load/settings?name=derpLatent.json");
                if (!res.ok) return;
                const result = await res.json();
                const profiles = result.data || {};
                const profileNames = Object.keys(profiles);
                if (profileNames.length === 0) return;
                // Prefer Krea2 as the shipped default on fresh node spawns
                // (alphabetical sort is the fallback so any future profile pack
                // still gets a stable first-selection when Krea2 is absent).
                const defaultName = profileNames.includes("Krea2")
                    ? "Krea2"
                    : [...profileNames].sort()[0];
                this._sysProfileData = profiles;
                this._sysProfileCache = [...profileNames].sort();
                this._currentProfileName = this._currentProfileName || defaultName;
                this.hydrateDerpLatentProfileData(this._currentProfileName);
            } catch (e) {
                console.warn("[DerpLatent] Failed to load profiles:", e);
            }
        };

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            syncDerpLatentLocaleLabels(this);
            this.properties.mode = normalizeLatentMode(this.properties.mode);
            this.refreshNodeLayoutMap();
            this.refreshDerpLatentSysMap();
            this.requestDerpSync();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            const presets = this.properties.latentPresets || [];
            const portraitLabel = tLocale("$derp_latent.mode.portrait", "Portrait");
            const landscapeLabel = tLocale("$derp_latent.mode.landscape", "Landscape");
            const mode = normalizeLatentMode(this.properties.mode);

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            const isPortrait = mode === "Portrait";
            const getLabel = (p, m) => {
                const isP = m === "Portrait";
                const w = isP ? p.height : p.width;
                const h = isP ? p.width : p.height;
                const ar = (isP ? p.aspectRatio.split(" : ").reverse().join(":") : p.aspectRatio).replace(/\s*:\s*/g, ":");
                return `${ar} - ${w} x ${h}`;
            };
            // Preset labels (not just count) and widget padding must be hashed:
            // same-length profile swaps change dropdown items, and pW/pH are
            // baked into the map but not otherwise represented.
            const presetLabels = presets.map(p => getLabel(p, mode));
            const outputResolution = this.properties.outputResolution === true;
            const outputLatent = this.properties.outputLatent !== false;
            const structureHash = `${mode}_${this.properties.selectedLatent}_${this.properties.batchSize}_${this.properties.editorMP}_${outputResolution}_${outputLatent}_${presetLabels.join("|")}_${mW}_${mH}_${sW}_${sH}_${pW}_${pH}_${window._xcpDerpSession}_${this.properties.drawHeader}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}`;

            if (this._lastMapStructure === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._lastMapStructure = structureHash;

            const dropdownItems = presets.map(p => {
                const full = getLabel(p, mode);
                const ar = full.split(" - ")[0];
                const res = full.split(" - ")[1];
                return {
                    display: full,
                    labelParts: [
                        { key: "aspect", text: ar, widthMode: "max" },
                        { text: " - " },
                        { text: res || "" },
                    ],
                    value: full
                };
            });

            const selectLabel = tLocale("$derp_latent.select", "Select");
            const currentFull = this.properties.selectedLatent || (presets[0] ? getLabel(presets[0], mode) : `${selectLabel} - ...`);
            const currentAr = currentFull.includes(" - ") ? currentFull.split(" - ")[0] : selectLabel;
            const currentRes = currentFull.includes(" - ") ? " - " + currentFull.split(" - ")[1] : "...";

            const mp = this.properties.editorMP ?? 1;
            const scaleFactor = Math.sqrt(mp);
            let displayValue = currentFull;
            if (currentFull.includes(" - ") && currentFull.includes(" x ")) {
                const resParts = currentFull.split(" - ")[1].split(" x ");
                const sw = snapDerpLatentTo16(parseInt(resParts[0]) * scaleFactor);
                const sh = snapDerpLatentTo16(parseInt(resParts[1]) * scaleFactor);
                displayValue = `${currentAr} - ${sw} x ${sh}`;
            }

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y"},
                    width: "full", height: "auto", dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader !== false ? [mW, mH] : [mW, 0],
                    spacing: [0, sH],
                    row1: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                        latentMode: {
                            type: this.UI_TYPES.BUTTON,
                            themeKey: "Button, t_textNormal", labelAlign: ["center", "middle"],
                            state: isPortrait,
                            text: mode === "Portrait" ? portraitLabel : landscapeLabel, measureText: `${landscapeLabel} `,
                            width: "auto", height: "fill",
                            padding: [pW, pH], spacing: [sW, 0],
                            toolTip: tLocale("$derp_latent.tooltips.mode", "Click to switch between portrait and landscape modes"),
                            onPress: () => {
                                const oldMode = normalizeLatentMode(this.properties.mode);
                                const newMode = oldMode === "Portrait" ? "Landscape" : "Portrait";
                                this.properties.mode = newMode;

                                const tempW = this.properties.width;
                                this.properties.width = this.properties.height;
                                this.properties.height = tempW;

                                const currentPreset = presets.find(p => getLabel(p, oldMode) === this.properties.selectedLatent);
                                if (currentPreset) {
                                    this.properties.selectedLatent = getLabel(currentPreset, newMode);
                                }

                                this.refreshNodeLayoutMap();
                                this.broadcastLatentState();
                                this.requestDerpSync();
                            }
                        },
                        latentSelector: {
                            type: this.UI_TYPES.FILEBROWSER,
                            icon: "dropdown",
                            themeKey: "panel, t_textNormal",
                            canvasShield: true,
                            width: "full", height: "auto",
                            padding: [pW, pH], spacing: [sW, 0],
                            mode: "file",
                            rootName: "latents",
                            value: displayValue,
                            items: dropdownItems,
                            toolTip: tLocale("$derp_latent.tooltips.selector", "Click to select available resolutions in the profile"),
                            onChange: (val) => {
                                this.properties.selectedLatent = val;
                                const found = presets.find(p => getLabel(p, mode) === val);
                                if (found) {
                                    this.properties.width = isPortrait ? found.height : found.width;
                                    this.properties.height = isPortrait ? found.width : found.height;
                                }
                                this.broadcastLatentState();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                        mpLabel: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textNormal",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_latent.mp_label", "MP:"),
                            width: "auto", height: "auto", spacing: [sW, 0],
                        },
                            editorMP: {
                            type: this.UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textNormal",
                            width: 30, height: "auto",
                            padding: [pW, pH],
                            labelAlign: ["center", "middle"],
                            text: (this.properties.editorMP ?? 1).toFixed(1),
                            value: (this.properties.editorMP ?? 1).toFixed(1),
                            toolTip: tLocale("$derp_latent.tooltips.mp", "Click to change megapixel multiplier (1.0-4.0)"),
                            onBlur: (val) => {
                                let floatVal = parseFloat(val);
                                if (isNaN(floatVal)) floatVal = 1;
                                floatVal = Math.max(1.0, Math.min(4.0, floatVal));
                                floatVal = Math.round(floatVal * 10) / 10;
                                this.properties.editorMP = floatVal;
                                this.broadcastLatentState();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
                    },
                    row2: {
                        dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                        batchLabel: {
                            type: this.UI_TYPES.TEXT, mouseOver: false,
                            themeKey: "t_textNormal",
                            labelAlign: ["left", "middle"],
                            text: tLocale("$derp_latent.batch_label", "Batch size:"),
                            width: "auto", height: "auto", spacing: [sW, 0],
                        },
                        batchCount: {
                            type: this.UI_TYPES.EDITOR,
                            themeKey: "dialog, t_textNormal",
                            width: 30, height: "auto",
                            padding: [pW, pH],
                            labelAlign: ["center", "middle"],
                            text: (this.properties.batchSize || 1).toString(),
                            value: (this.properties.batchSize || 1).toString(),
                            toolTip: tLocale("$derp_latent.tooltips.batch", "Click to change batch number"),
                            onBlur: (val) => {
                                const intVal = parseInt(val);
                                if (!isNaN(intVal) && intVal >= 1) {
                                    this.properties.batchSize = intVal;
                                } else {
                                    this.properties.batchSize = this.properties.batchSize || 1;
                                }
                                this.broadcastLatentState();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        },
                    }
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpLatentSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col",
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto", margin: [mW, sH, mW, mH],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: tLocale("$derp_latent.system.configuration", "Latent Configuration:"),
                        width: "full", padding: [pW, pH],
                    },
                    outputResolution: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true,
                        themeKey: "dialog, button, t_textSystem",
                        text: tLocale("$derp_latent.system.output_resolution", "Output Resolution"),
                        width: "full", height: "auto", padding: [pW, pH],
                        value: this.properties.outputResolution === true,
                        toolTip: tLocale("$derp_latent.tooltips.output_resolution", "When enabled, also output Width and Height as wireless INT signals (MP-multiplied)."),
                        onChange: (v) => {
                            this.properties.outputResolution = !!v;
                            this.refreshNodeLayoutMap();
                            this.refreshDerpLatentSysMap();
                            this.broadcastLatentState();
                            this.requestDerpSync();
                        }
                    },
                    outputLatent: {
                        type: this.UI_TYPES.TOGGLE_V2, isTextOnly: true,
                        themeKey: "dialog, button, t_textSystem",
                        text: tLocale("$derp_latent.system.output_latent", "Output Latent"),
                        width: "full", height: "auto", padding: [pW, pH],
                        value: this.properties.outputLatent !== false,
                        toolTip: tLocale("$derp_latent.tooltips.output_latent", "When disabled, the wireless Latent signal is not broadcast."),
                        onChange: (v) => {
                            this.properties.outputLatent = !!v;
                            this.refreshNodeLayoutMap();
                            this.refreshDerpLatentSysMap();
                            this.broadcastLatentState();
                            this.requestDerpSync();
                        }
                    }
                }
            };
            if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                this._derpPanel.setLayoutMap(this.sysLayoutMap);
            }
        };

        // --- WIRELESS BROADCAST ---
        nodeType.prototype.purgeDerpSignal = function() {
            const baseId = String(this.id);
            // Slots: 0=LATENT, 1=Width INT, 2=Height INT. Clear all so stale
            // resolutions don't linger after toggle-off or node removal.
            for (let i = 0; i < 3; i++) {
                delete window.xcpDerpSignals?.[`${baseId}:${i}`];
            }
            this._lastSignalFingerprint = null;
        };

        nodeType.prototype.broadcastLatentState = function() {
            if (Number(this.id) === -1 || this.mode === 4 || this.mode === 2) return;

            const mp = this.properties.editorMP ?? 1;
            const scaleFactor = Math.sqrt(mp);
            const baseW = this.properties.width || 512;
            const baseH = this.properties.height || 512;

            const scaledW = snapDerpLatentTo16(baseW * scaleFactor);
            const scaledH = snapDerpLatentTo16(baseH * scaleFactor);
            const state = {
                width: scaledW,
                height: scaledH,
                batch_size: this.properties.batchSize || 1,
                editor_mp: mp
            };

            const outputLatent = this.properties.outputLatent !== false;
            const outputResolution = this.properties.outputResolution === true;

            const fingerprint = `${scaledW}_${scaledH}_${state.batch_size}_${state.editor_mp}_${outputLatent}_${outputResolution}_${this.titleLabel}_${this.id}`;
            if (this._lastSignalFingerprint === fingerprint) return;
            this._lastSignalFingerprint = fingerprint;

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;

            const baseId = String(this.id);
            const nodeName = this.titleLabel || this.title || tLocale("$derp_latent.title", "Derp Latent");
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

            if (!window.xcpDerpSignals) window.xcpDerpSignals = {};

            // Slot 0: Latent wireless signal (gated by outputLatent).
            const latentId = `${baseId}:0`;
            if (outputLatent && !isBypassed) {
                window.xcpDerpSignals[latentId] = {
                    nodeId: latentId,
                    nodeName: `${nodeName} [Latent]`,
                    nodeType: this.type || "Node",
                    type: "LATENT",
                    value: state,
                    upstreamIds: [],
                    timestamp: Date.now()
                };
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: latentId, value: state })
                }).catch(() => {});
            } else {
                delete window.xcpDerpSignals[latentId];
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: latentId, value: null })
                }).catch(() => {});
            }

            // Slot 1: Width INT, Slot 2: Height INT (gated by outputResolution).
            const wId = `${baseId}:1`;
            const hId = `${baseId}:2`;
            if (outputResolution && !isBypassed) {
                window.xcpDerpSignals[wId] = {
                    nodeId: wId,
                    nodeName: `${nodeName} [Width]`,
                    nodeType: this.type || "Node",
                    type: "INT",
                    value: scaledW,
                    upstreamIds: [],
                    timestamp: Date.now()
                };
                window.xcpDerpSignals[hId] = {
                    nodeId: hId,
                    nodeName: `${nodeName} [Height]`,
                    nodeType: this.type || "Node",
                    type: "INT",
                    value: scaledH,
                    upstreamIds: [],
                    timestamp: Date.now()
                };
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: wId, value: scaledW })
                }).catch(() => {});
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: hId, value: scaledH })
                }).catch(() => {});
            } else {
                delete window.xcpDerpSignals[wId];
                delete window.xcpDerpSignals[hId];
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: wId, value: null })
                }).catch(() => {});
                fetch("/xcp/update_signal", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ node_id: hId, value: null })
                }).catch(() => {});
            }

            if (window.app?.graph?._nodes) {
                window.app.graph._nodes.forEach(n => {
                    // FORCED refresh (derpConcatenate/derpLoraStack pattern): the
                    // Router's 200ms throttle silently drops unforced updates, and
                    // a dropped update is never retried — the Router's queued
                    // signal_data widget then freezes at the last successful write,
                    // so Width/Height INT (and Latent) values stop tracking MP and
                    // aspect changes at execution time even though the live
                    // window.xcpDerpSignals registry is fresh.
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals(true);
                });
            }
        };

        nodeType.prototype.syncDerpOutputs = function() {
            if (this.purgeDerpSignal) this.purgeDerpSignal();
            this._lastSignalFingerprint = null;
            this.broadcastLatentState();
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.outputName = tLocale("$derp_latent.output", "Latent");
            this.outputs = [{ name: this.properties.outputName, type: "LATENT" }];

            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;

            this.titleLabel = tLocale("$derp_latent.title", "Derp Latent");
            this.properties.titleLabel = tLocale("$derp_latent.title", "Derp Latent");

            this.properties.width = 400;
            this.properties.height = 100;
            this.properties.batchSize = 1;
            this.properties.editorMP = 1;
            this.properties.mode = "Landscape";
            this.properties.autoWidth = false;
            this.properties.latentPresets = [];
            // Toggle defaults: outputResolution off (opt-in extra INT signals),
            // outputLatent on (preserves existing wireless Latent behavior).
            if (!(this.properties.outputResolution in this.properties)) {
                this.properties.outputResolution = false;
            }
            if (!(this.properties.outputLatent in this.properties)) {
                this.properties.outputLatent = true;
            }
            syncDerpLatentLocaleLabels(this);

            this.refreshNodeLayoutMap();
            this.refreshDerpLatentSysMap();

            if (this.purgeDerpSignal) this.purgeDerpSignal();
            else if (window.purgeDerpSignal) window.purgeDerpSignal(this.id);
            this._lastSignalFingerprint = null;

            setTimeout(() => {
                if (this._configuredFromWorkflow === true) return;
                this.loadFirstProfile();
                this.broadcastLatentState();
            }, 100);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this._configuredFromWorkflow = true;
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.properties.latentPresets = Array.isArray(this.properties.latentPresets) ? this.properties.latentPresets : [];
            this.properties.mode = normalizeLatentMode(this.properties.mode);
            // Loaded workflows from before the toggle was added inherit opt-in defaults.
            // Use !== true / !== false so explicitly-saved values survive round-trips.
            if (!(this.properties.outputResolution in this.properties)) {
                this.properties.outputResolution = false;
            }
            if (!(this.properties.outputLatent in this.properties)) {
                this.properties.outputLatent = true;
            }
            syncDerpLatentLocaleLabels(this);
            if (!this.properties.selectedLatent && this.properties.width && this.properties.height) {
                const mode = normalizeLatentMode(this.properties.mode);
                const isPortrait = mode === "Portrait";
                const width = Number(this.properties.width) || 512;
                const height = Number(this.properties.height) || 512;
                const major = isPortrait ? height : width;
                const minor = isPortrait ? width : height;
                this.properties.selectedLatent = `${major}:${minor} - ${width} x ${height}`;
            }
            if (this._sysProfileData) this.hydrateDerpLatentProfileData(this._currentProfileName);
            else this.loadFirstProfile();
            this.refreshNodeLayoutMap();
            this.refreshDerpLatentSysMap();
            this._lastSignalFingerprint = null;
            this.broadcastLatentState();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            this._sysProfileActive = true;
            this._sysProfileFile = "derpLatent";
            this._sysProfileFolder = "nodeSettings";
            delete this._sysProfileCache;
            delete this._sysProfileData;
            if (panel.showProfiles) {
                panel.showProfiles("derpLatent", "nodeSettings");
            }
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    }
});
