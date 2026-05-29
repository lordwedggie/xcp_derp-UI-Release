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
            // Resolve signal value once to avoid duplicate lookups
            const resolveSignalId = (rawId) => {
                if (!rawId) return null;
                const directId = String(rawId);
                if (window.xcpDerpSignals?.[directId]) return directId;
                const baseId = directId.split(":")[0];
                if (window.xcpDerpSignals?.[baseId]) return baseId;
                return null;
            };
            const sigIds = this.properties?.multiSignalIds || {};
            const activeSignalId = resolveSignalId(sigIds[0] || sigIds["0"] || null);
            const signalText = activeSignalId
                ? String(window.xcpDerpSignals?.[activeSignalId]?.value ?? "No signal received")
                : "No signal received";
            const hasSignal = signalText !== "No signal received";
            // STRING signal list for dropdown
            const allSignals = window.xcpDerpSignals || {};
            const stringItems = Object.values(allSignals)
                .filter(s => s && s.nodeId && String(s.type || "").toUpperCase().includes("STRING"))
                .map(s => String(s.nodeName || s.nodeId || ""));
            const currentSignalName = activeSignalId
                ? (Object.values(allSignals).find(s => String(s.nodeId) === activeSignalId)?.nodeName || "")
                : "";
            const signalPrompt = currentSignalName || (stringItems[0] || "No signals...");
            this._concatSignalMap = new Map();
            Object.values(allSignals)
                .filter(s => s && s.nodeId && String(s.type || "").toUpperCase().includes("STRING"))
                .forEach(s => this._concatSignalMap.set(String(s.nodeName || s.nodeId || ""), String(s.nodeId)));
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
                        hidden: hasSignal,
                        width: "full",
                        padding: [pW, pH],
                        labelAlign: ["left", "middle"],
                        pulseStates: true,
                    },
                    regionSignalContent: {
                        anchor: { target: "lblWarningConcat", axis: "y", offset: sH },
                        dir: "col", width: "full", height: "auto",
                        margin: [0, mW, 0, mW],
                        regionHeader: {
                            dir: "row", width: "full", height: "auto",
                            spacing: [sW, 0],
                            dropdownSignal: {
                                type: this.UI_TYPES.FILEBROWSER,
                                icon: "dropdown",
                                themeKey: "dialog, t_textNormal",
                                canvasShield: true,
                                mouseOver: true,
                                canOpenPicker: stringItems.length > 0,
                                width: "full", height: "auto", padding: [pW, pH],
                                mode: "file",
                                rootName: "signals",
                                items: stringItems,
                                value: signalPrompt,
                                state: stringItems.length === 0 ? "DIS" : "OFF",
                                onChange: (val) => {
                                    if (this._concatSyncing) return;
                                    const id = this._concatSignalMap?.get(String(val || ""));
                                    if (id && this.properties) {
                                        this._concatSyncing = true;
                                        this.properties.multiSignalIds = { 0: id };
                                        this.refreshNodeLayoutMap();
                                        this.requestDerpSync();
                                        this._concatSyncing = false;
                                    }
                                },
                            },
                        },
                        textSignal: {
                            hidden: !hasSignal,
                            type: this.UI_TYPES.TEXT,
                            themeKey: "t_textNormal",
                            text: signalText,
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

            this.properties.multiSignalIds = {};
            this.properties.drawSignalBtn = false;
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
            this.properties.drawSignalBtn = false;

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