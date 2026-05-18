/**
 * Path: ./js/controldeck/derpToggle.js
 * ROLE: Derp Toggle pure virtual BOOL wireless broadcaster.
 * BASIS: derpFathaTemplate.js
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "../fatha/fatha.js";
import { refreshWirelessSignalConsumers, transmitDerpSignal } from "../fatha/core/masterSignalEngine.js";

app.registerExtension({
    name: "xcp.derpToggle_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("togglenode")) return;

        fatha(nodeType, nodeData, 120);

        if (!nodeType.prototype.transmitDerpSignal) {
            nodeType.prototype.transmitDerpSignal = transmitDerpSignal;
        }

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            const { mW, mH, sW, sH, oY, pW, pH } = this.getDerpVars(this);
            const isOn = this.properties.toggleState !== false;
            const toggleText = this.properties.signalName || "Bypass Toggle";
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    btnToggle: {
                        type: this.UI_TYPES.BUTTON,
                        themeKey: "button, t_textNormal", mouseOver: false,
                        text: toggleText,
                        state: isOn ? "ON" : "OFF",
                        width: "full",
                        height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                        labelAlign: ["center", "middle"],
                        onPress: () => {
                            this.properties.toggleState = !this.properties.toggleState;
                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                            this.refreshNodeLayoutMap();
                        }
                    },
                },
            };
            this._layoutMapHash = undefined;
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpToggleSysMap = function() {
            const { mW, mH, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, 0, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Derp Toggle properties:",
                        width: "full", padding: [pW, pH],
                    },
                    lblState: {
                        anchor: { target: "lblTitle", axis: "y", offset: oY },
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        text: `Output BOOL: ${this.properties.toggleState !== false ? "TRUE" : "FALSE"}`,
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        mouseOver: false,
                    },
                    layoutSpacer: {
                        anchor: { target: "lblState", axis: "y", offset: oY },
                    }
                }
            };
            this._layoutMapHash = undefined;
        };

        nodeType.prototype.broadcastWirelessSignal = function() {
            if (!this.transmitDerpSignal || this.id === -1) return;

            const toggleText = this.properties.signalName || "Bypass Toggle";
            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            const nodeName = this.titleLabel || this.title || "Derp Toggle";
            const signalId = `${this.id}:0`;
            const finalValue = isBypassed ? null : (this.properties.toggleState !== false);
            const displayName = `${nodeName} [${toggleText}]`;

            if (!window.xcpDerpSignals) window.xcpDerpSignals = {};
            const existing = window.xcpDerpSignals[signalId];
            if (!existing || existing.value !== finalValue || existing.nodeName !== displayName || existing.type !== "bool") {
                window.xcpDerpSignals[signalId] = {
                    nodeId: signalId,
                    nodeName: displayName,
                    nodeType: this.type,
                    type: isBypassed ? "null" : "bool",
                    value: finalValue,
                    upstreamIds: [],
                    timestamp: Date.now(),
                    isPureVirtual: true
                };

                setTimeout(() => {
                    fetch("/xcp/update_signal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ node_id: signalId, value: finalValue })
                    });
                }, 50);
            }

            refreshWirelessSignalConsumers();
        };

        nodeType.prototype.syncDerpOutputs = function() {
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach((o) => { if (o.links) o.links = null; });
                this.outputs = [];
            } else {
                this.outputs = [];
            }

            if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;
            this.outputs = [];

            this.titleLabel = "Derp Toggle";
            this.properties.titleLabel = "Derp Toggle";
            this.properties.toggleState = true;
            this.properties.outputName = "BOOL_OUT";
            this.properties.signalName = "Bypass Toggle";
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [100, 50];
            this.size = [100, 50];

            this.refreshNodeLayoutMap();
            this.refreshDerpToggleSysMap();

            setTimeout(() => {
                if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                    this.syncDerpOutputs();
                }
            }, 1);
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;

            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach((o) => { if (o.links) o.links = null; });
                this.outputs = [];
            }

            if (info.properties) {
                this.refreshDerpToggleSysMap();
            }
            if (this.syncDerpOutputs) this.syncDerpOutputs();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;

            const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
            if (this._lastBypassState !== isBypassed) {
                this._lastBypassState = isBypassed;
                if (this.syncDerpOutputs) this.syncDerpOutputs();
                this.refreshNodeLayoutMap();
                this.requestDerpSync();
            }

            if (this._lastTitleLabel !== this.titleLabel) {
                this._lastTitleLabel = this.titleLabel;
                if (this.broadcastWirelessSignal) this.broadcastWirelessSignal();
            }
        };
    }
});
