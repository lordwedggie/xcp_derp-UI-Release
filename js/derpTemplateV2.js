/**
 * Path: ./js/fatha/nodes/derpTemplateV2.js
 * STATUS: VIRTUAL FATHA COMPLIANT | FIXED: Pure Virtual Enforcer & Title Persistence
 */
import { app } from "../../../scripts/app.js";
import { fatha, initDerpGlobalListener } from "./fatha/fatha.js";

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
            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        };

        nodeType.prototype.applyPalette = function() {
            if (window.xcpDerpThemeConfig) this.handleThemeUpdate(window.xcpDerpThemeConfig);
            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
        };

        // --- MAIN UI LAYOUT ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.layoutMap = {
                sysContentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    width: "full", height: "auto",
                    dir: "col",
                    padding: [0, 0],
                    margin: this.properties?.drawHeader === true ? [mW, mH] : [0, 0],
                    editorInput: {
                        type: this.UI_TYPES.EDITOR,
                        canvasShield: true,
                        themeKey: "dialog, t_textnormal",
                        text: this.properties.textValue || "",
                        width: "full", height: "auto",
                        padding: [pW, pH],
                        spacing: [0, sH],
                        onBlur: (v) => {
                            this.properties.textValue = String(v);
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

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    dir: "col", margin: [mW, 0, mW, mH],
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: oY },
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
            this._layoutMapHash = undefined;
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
                this.transmitDerpSignal(this, this.properties.textValue);
            }
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        // --- LIFECYCLE ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            // THE ANTI-PRUNING FIX: Forces the engine to run this node even with 0 outputs.
            this.properties.isWirelessTransmitter = true;

            // THE OUTPUT FIX: Explicitly remove Fatha's auto-injected virtual output
            this.outputs = [];

            this.titleLabel = "Lord of Bastas";
            this.properties.titleLabel = "Lord of Bastas"; // THE TITLE FIX
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

            // THE PURE VIRTUAL ENFORCER: Purge physical slots immediately on load
            if (this.outputs && this.outputs.length > 0) {
                this.outputs.forEach(o => { if (o.links) o.links = null; });
                this.outputs = [];
            }

            if (info.properties) {
                this.refreshDerpTemplateSysMap();
            }
            if (this.syncDerpOutputs) this.syncDerpOutputs();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            if (this.flags?.collapsed) return;

            // THE TITLE REFRESH FIX: Update wireless registry if the title label changed
            if (this._lastTitleLabel !== this.titleLabel) {
                this._lastTitleLabel = this.titleLabel;
                if (this.syncDerpOutputs) this.syncDerpOutputs();
            }
        };
    }
});