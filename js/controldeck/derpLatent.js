/**
 * Path: ./js/derpLatent.js
 * STATUS: VIRTUAL FATHA COMPLIANT
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { measureTextWidth, resolvePaintData } from "../herbina/utils/widgetsUtils.js";
import { transmitDerpSignal } from "../fatha/core/masterSignalEngine.js";

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
            this.properties.mode = profile.mode ?? "Landscape";
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

        nodeType.prototype.loadFirstProfile = async function() {
            try {
                const res = await fetch("/xcp/load/settings?name=derpLatent.json");
                if (!res.ok) return;
                const result = await res.json();
                const profiles = result.data || {};
                const profileNames = Object.keys(profiles).sort();
                if (profileNames.length === 0) return;
                const firstName = profileNames[0];
                this._sysProfileData = profiles;
                this._sysProfileCache = profileNames;
                this._currentProfileName = firstName;
                this.applyDerpProfile(firstName);
            } catch (e) {
                console.warn("[DerpLatent] Failed to load profiles:", e);
            }
        };

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this.refreshNodeLayoutMap();
            this.refreshDerpLatentSysMap();
            this.requestDerpSync();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            const presets = this.properties.latentPresets || [];
            const mode = this.properties.mode || "Landscape";

            const vars = this.getDerpVars(this);
            const [mW, mH, sW, sH, oX, oY, pW, pH] = [
                vars.mW, vars.mH, vars.sW, vars.sH, vars.oX, vars.oY, vars.pW, vars.pH
            ].map(v => Number(v.toFixed(2)));

            const structureHash = `${mode}_${this.properties.selectedLatent}_${this.properties.batchSize}_${presets.length}_${mW}_${mH}_${sW}_${sH}_${window._xcpDerpSession}_${this.properties.drawHeader}_${this.titleLabel}`;

            if (this._lastMapStructure === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }
            this._lastMapStructure = structureHash;
            const isPortrait = mode === "Portrait";
            const getLabel = (p, m) => {
                const isP = m === "Portrait";
                const w = isP ? p.height : p.width;
                const h = isP ? p.width : p.height;
                const ar = (isP ? p.aspectRatio.split(" : ").reverse().join(":") : p.aspectRatio).replace(/\s*:\s*/g, ":");
                return `${ar} - ${w} x ${h}`;
            };

            const paint = resolvePaintData(this, "t_textNormal") || { fontSize: 10, font: "DengXian Light" };
            let maxW = 0, arLabel = "1:1";

            presets.forEach(p => {
                const ar = (isPortrait ? p.aspectRatio.split(" : ").reverse().join(":") : p.aspectRatio).replace(/\s*:\s*/g, ":");
                const w = measureTextWidth(ar, paint.fontSize, paint.font, paint.fontWeight || "normal");
                if (w > maxW) {
                    maxW = w;
                    arLabel = ar;
                }
            });

            const emWidth = maxW / (paint.fontSize || 10);

            const dropdownItems = presets.map(p => {
                const full = getLabel(p, mode);
                const ar = full.split("- ")[0];
                const res = full.split("- ")[1];
                return {
                    label: `<span style="display:inline-block; width:${emWidth + 0.4}em">${ar}</span>`,
                    display: " - " + res,
                    value: full
                };
            });

            const currentFull = this.properties.selectedLatent || (presets[0] ? getLabel(presets[0], mode) : "Select - ...");
            const currentAr = currentFull.includes(" - ") ? currentFull.split(" - ")[0] : "Select";
            const currentRes = currentFull.includes(" - ") ? " - " + currentFull.split(" - ")[1] : "...";

            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", dir: "row",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader !== false ? [mW, mH] : [mW, 0],
                    spacing: [0, sH],

                    latentMode: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "systemButton, t_textNormal", labelAlign: ["center", "middle"],
                        state: isPortrait,
                        text: mode, measureText: "Landscape ",
                        width: "auto", height: "fill",
                        padding: [pW, pH], spacing: [sW, 0],
                        onPress: () => {
                            const oldMode = this.properties.mode || "Landscape";
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
                        type: this.UI_TYPES.DROPDOWN_DERP, indicator: "on",
                        themeKey: "panel, t_textNormal",
                        canvasShield: true,
                        labelAlign: ["left", "middle"],
                        width: "full", height: "auto",
                        padding: [pW, pH], spacing: [sW, 0],
                        measureText: [arLabel, "t_textNormal"],
                        label: currentAr,
                        text: currentRes,
                        value: currentFull,
                        options: dropdownItems.map(i => i.value),
                        items: dropdownItems,
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
                    batchCount: {
                        type: this.UI_TYPES.EDITOR,
                        themeKey: "dialog, t_textNormal",
                        width: 30, height: "fill",
                        padding: [pW, pH],
                        labelAlign: ["center", "middle"],
                        text: (this.properties.batchSize || 1).toString(),
                        value: (this.properties.batchSize || 1).toString(),
                        onBlur: (val) => {
                            const intVal = parseInt(val);
                            if (!isNaN(intVal) && intVal >= 1) {
                                this.properties.batchSize = intVal;
                                this.broadcastLatentState();
                                this.refreshNodeLayoutMap();
                                this.requestDerpSync();
                            }
                        }
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
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    width: "full", height: "auto", margin: [mW, 0, mW, mH],
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Latent Configuration:",
                        width: "full", padding: [pW, pH],
                    }
                }
            };
            this._lastMapStructure = undefined;
        };

        // --- WIRELESS BROADCAST ---
        nodeType.prototype.broadcastLatentState = function() {
            if (this.id === -1 || this.mode === 4 || this.mode === 2) return;

            const state = {
                width: this.properties.width || 512,
                height: this.properties.height || 512,
                batch_size: this.properties.batchSize || 1
            };

            const fingerprint = `${state.width}_${state.height}_${state.batch_size}_${this.titleLabel}_${this.id}`;
            if (this._lastSignalFingerprint === fingerprint) return;
            this._lastSignalFingerprint = fingerprint;

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;

            // THE VIRTUAL BROADCASTpattern: Uses indexed signal IDs to ensure detection by SignalOut
            const baseId = String(this.id);
            const signalId = `${baseId}:0`;
            const nodeName = this.titleLabel || this.title || "Derp Latent";

            window.xcpDerpSignals[signalId] = {
                nodeId: signalId,
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
                body: JSON.stringify({ node_id: signalId, value: state })
            });

            if (window.app?.graph?._nodes) {
                window.app.graph._nodes.forEach(n => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
                });
            }
        };

        nodeType.prototype.syncDerpOutputs = function() {
            this.broadcastLatentState();
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.outputName = "Latent";
            this.outputs = [{ name: this.properties.outputName, type: "LATENT" }];

            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;

            this.titleLabel = "Derp Latent";
            this.properties.titleLabel = "Derp Latent";

            this.properties.width = 400;
            this.properties.height = 100;
            this.properties.batchSize = 1;
            this.properties.mode = "Landscape";
            this.properties.autoWidth = false;
            this.properties.latentPresets = [];

            this.refreshNodeLayoutMap();
            this.refreshDerpLatentSysMap();

            if (window.purgeDerpSignal) window.purgeDerpSignal(this.id);
            this._lastSignalFingerprint = null;

            setTimeout(() => {
                this.loadFirstProfile();
                this.broadcastLatentState();
            }, 100);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.refreshDerpLatentSysMap();
            this._lastSignalFingerprint = null;
            this.broadcastLatentState();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (this.flags.collapsed || this.size[0] <= 0) return;
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (this._lastTitleLabel !== this.titleLabel) {
                this._lastTitleLabel = this.titleLabel;
                this.broadcastLatentState();
            }
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (panel.showProfiles) {
                panel.showProfiles("derpLatent", "nodeSettings");
            }
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };
    }
});
