/**
 * Path: ./js/fatha/nodes/derpFathaTemplate.js
 * STATUS: VIRTUAL FATHA COMPLIANT | FIXED: Pure Virtual Enforcer & Title Persistence
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "./fatha/fatha.js";

function buildTemplateLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const textValue = String(node?.properties?.textValue || "");
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    return `${textValue}_${window._xcpDerpSession}_${node.titleLabel || ""}_${width}_${mW}_${mH}_${oY}_${node.properties?.drawHeader !== false}`;
}

app.registerExtension({
    name: "xcp.derpTemplateV2_Extension",
    async setup() {
        initDerpGlobalListener();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!nodeData.name.toLowerCase().includes("templatev2")) return;

        console.log(`[Fatha] Intercepting Python Node: ${nodeData.name}`);

        // Initialize the Virtual Fatha framework hijacking
        fatha(nodeType, nodeData, 120);

        // --- THEME & LAYOUT REFRESH ---
        nodeType.prototype.onThemeUpdate = function(config) {
            this.handleThemeUpdate(config);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size[0] <= 0) return;
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const structureHash = buildTemplateLayoutHash(this, { mW, mH, oY });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    lblSample: {
                        type: this.UI_TYPES.TEXT,
                        themeKey: "t_textNormal",
                        text: "Fatha Template",
                        width: "full", height: "auto",
                        padding: [pW, pH],
                    },
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, sH, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    width: "full", height: "auto",
                    lblTitle: {
                        type: this.UI_TYPES.TEXT, mouseOver: false,
                        themeKey: "t_textsystem",
                        labelAlign: ["left", "middle"],
                        text: "Custom node properties:",
                        width: "full", padding: [pW, pH],
                    },
                    layoutSpacer: {
                        anchor: { target: "mainRow", axis: "y", offset: oY },
                    }
                }
            };
            if (this._derpPanel?.setLayoutMap) this._derpPanel.setLayoutMap(this.sysLayoutMap);
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

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            // THE ANTI-PRUNING FIX: Forces the engine to run this node even with 0 outputs.
            this.properties.isWirelessTransmitter = true;
            this.properties.skipGenericWirelessHeartbeat = true;
            this.isPureVirtual = true;
            this.properties.isPureVirtual = true;

            // THE OUTPUT FIX: Explicitly remove Fatha's auto-injected virtual output
            this.outputs = [];

            this.titleLabel = "Fatha Node Template";
            this.properties.titleLabel = "Fatha Node Template"; // THE TITLE FIX
            this.properties.textValue = "Template String Output";

            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [150, 50];
            this.size = [150, 50];

            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();

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

            // THE PURE VIRTUAL ENFORCER: Purge physical slots immediately on load
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            }

            this._layoutMapHash = null;
            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
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
                this.refreshDerpTemplateSysMap();
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