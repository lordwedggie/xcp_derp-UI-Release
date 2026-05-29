/**
 * Path: ./js/derpConcatenate.js
 * STATUS: VIRTUAL FATHA COMPLIANT — Wireless concatenate node
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "./fatha/fatha.js";
import { suppressDefaultWidgets } from "./fatha/helpers/uncleSlotHelper.js";

function buildConcatLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    return `${window._xcpDerpSession}_${node.titleLabel || ""}_${width}_${mW}_${mH}_${oY}_${node.properties?.drawHeader !== false}`;
}

app.registerExtension({
    name: "xcp.derpConcatenate_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("derpconcatenate")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        fatha(nodeType, nodeData, 120);

        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildConcatLayoutHash(this, { mW, mH, oY });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            const hasStringSignal = (() => {
                const ids = this.properties?.multiSignalIds || {};
                const signals = window.xcpDerpSignals || {};
                return Object.values(ids).some(id => {
                    const rawId = String(id || "");
                    if (!rawId) return false;
                    if (signals[rawId]) return true;
                    return Object.keys(signals).some(k => k.startsWith(rawId) || String(rawId).startsWith(k.split(":")[0]));
                });
            })();
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    lblWarningConcat: {
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textSystem",
                        text: "STRING type signals required. Click the wireless button in the Header.",
                        hidden: (() => {
                            const ids = this.properties?.multiSignalIds || {};
                            const rawId = String(ids[0] || ids["0"] || "");
                            return !!rawId && !!window.xcpDerpSignals?.[rawId];
                        })(),
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        pulseStates: true,
                    },
                    regionSignalContent: {
                        hidden: (() => {
                            const ids = this.properties?.multiSignalIds || {};
                            const rawId = String(ids[0] || ids["0"] || "");
                            return !rawId || !window.xcpDerpSignals?.[rawId];
                        })(),
                        anchor: { target: "lblWarningConcat", axis: "y", offset: sH },
                        dir: "col", width: "full", height: "auto",
                        margin: [0, mW, 0, mW],
                        textSignal: {
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textNormal",
                            text: String((window.xcpDerpSignals?.[String(this.properties?.multiSignalIds?.[0] || this.properties?.multiSignalIds?.["0"] || "")]?.value) ?? "No signal received"),
                            width: "full", height: "auto",
                            padding: [pW, pH],
                            labelAlign: ["left", "top"],
                            wrap: true,
                        },
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        /**
         * THE PURE VIRTUAL ENFORCER: Standardizes wireless broadcast and
         * prevents backend validation errors by purging physical slots.
         */
        nodeType.prototype.syncDerpOutputs = function() {
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            } else {
                this.outputs = [];
            }

            if (this.transmitDerpSignal && this.id !== -1) {
                this.transmitDerpSignal(this.properties.textValue);
            }
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;

            this.outputs = [];
            suppressDefaultWidgets(this);

            this.titleLabel = "Derp Concatenate";
            this.properties.titleLabel = "Derp Concatenate";
            this.properties.textValue = "";

            this.properties.drawSignalBtn = true;
            this.signalFilters = { types: ["STRING"] };
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [150, 50];
            this.size = [150, 50];

            this.refreshNodeLayoutMap();

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
            this.properties.drawSignalBtn = true;
            this.signalFilters = { types: ["STRING"] };

            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            }
            suppressDefaultWidgets(this);

            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            this.requestDerpSync();
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

            const currentW = Math.round(this.size[0]);
            if (this._lastDerpW !== currentW) {
                this._lastDerpW = currentW;
                this.refreshNodeLayoutMap();
            }
        };
    }
});