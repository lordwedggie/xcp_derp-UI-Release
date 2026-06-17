/**
 * PROJECT: derpNodes | NODE: derpTemplate
 * STATUS: UNCLE PROTOCOL COMPLIANT - REFACTORED
 * ROLE: Clean starting template for building new Hybrid Uncle nodes.
 */
import { app } from "../../../scripts/app.js";
import { uncle, initDerpGlobalListener } from "./fatha/uncle.js";
import { UI_TYPES } from "./fatha/core/masterLayoutTypes.js";

function buildTemplateLayoutHash(node, vars) {
    const width = (Number(node?.size?.[0]) || 0).toFixed(2);
    const mW = Number(vars.mW || 0).toFixed(2);
    const mH = Number(vars.mH || 0).toFixed(2);
    const oY = Number(vars.oY || 0).toFixed(2);
    const title = String(node?.titleLabel || "");
    const outputName = String(node?.properties?.outputName || "TEXT_OUT");
    return `${title}_${outputName}_${window._xcpDerpSession}_${width}_${mW}_${mH}_${oY}_${node?.properties?.drawHeader !== false}_${node?.mode || 0}`;
}

app.registerExtension({
    name: "xcp.derpTemplate_Extension",
    async setup() { initDerpGlobalListener(); },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpTemplate") return;

        // --- 1. PROTOTYPE INJECTION ---
        // Hijacks the node with the Uncle framework (Canvas-native UI with Slot support)
        uncle(nodeType, nodeData, 150);

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

        // --- 2. CORE PROTOCOL HOOKS ---
        nodeType.prototype.onSerialize = function(info) {
            info.properties = { ...this.properties };
        };

        const onConf = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConf) onConf.apply(this, arguments);

            // THE PERSISTENCE FIX: Explicitly restore the titleLabel after page refresh
            if (this.properties.titleLabel) this.titleLabel = this.properties.titleLabel;

             this._layoutMapHash = null;

            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();

            // THE SIGNAL TYPE FIX: Restore physical name and type during configuration
            if (this.outputs && this.outputs[0]) {
                this.outputs[0].name = this.properties.outputName || "TEXT_OUT";
                this.outputs[0].type = "STRING";
            }
            this.requestDerpSync();
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);
            if (this.flags?.collapsed) return;

            const currentW = Math.round(this.size?.[0] || 0);
            if (this._lastDerpW !== currentW) {
                this._lastDerpW = currentW;
                this.refreshNodeLayoutMap();
            }

            if (this._lastMode !== this.mode) {
                this._lastMode = this.mode;
                this._layoutMapHash = null;
                this.refreshNodeLayoutMap();
                this.refreshDerpTemplateSysMap();
                this.requestDerpSync();
            }

        };

        // --- 3. LAYOUT MAPS ---
        nodeType.prototype.refreshNodeLayoutMap = function() {
            if (this.flags?.collapsed || this.size?.[0] <= 0) return;
            const { mW, mH, pW, pH, oY } = this.getDerpVars(this);
            const structureHash = buildTemplateLayoutHash(this, { mW, mH, oY });

            if (this._layoutMapHash === structureHash && this.layoutMap) {
                this.requestDerpSync();
                return;
            }

            this._layoutMapHash = structureHash;
            this.layoutMap = {
                contentRegion: {
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "col", width: "full", height: "auto",
                    margin: [mW, 0, mW, 0], padding: [pW, pH],
                    lblDefault: {
                        type: UI_TYPES.TEXT, themeKey: "t_textnormal",
                        outSlotIdx: 0, // Maps this region to the first link-dot
                        text: "Insert custom layout map here",
                        labelAlign: ["center", "middle"],
                        width: "full", height: "auto"
                    }
                },
            };
            if (this.layout) this.layout._lastCacheKey = "";
            this.requestDerpSync();
        };

        nodeType.prototype.refreshDerpTemplateSysMap = function() {
            const { mW, sH, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysContentRegion: {
                    anchor: { target: "sysDefaultControlsRegion", axis: "y", offset: sH },
                    width: "full", height: "auto", margin: [mW, 0, mW, 0],
                    lblInfo: {
                        type: UI_TYPES.TEXT_HTML, themeKey: "t_textsystem",
                        text: "System Settings: Template",
                        width: "auto", height: "auto", padding: [pW, pH]
                    }
                },
            };
            if (this._derpPanel) this._derpPanel.setLayoutMap(this.sysLayoutMap);
        };

        // --- 4. INITIALIZATION ---
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);

            // ANTI-PRUNING: Forces engine to treat this as an output node for wireless signals
            this.properties.isWirelessTransmitter = true;

            this.titleLabel = "Uncle Template";
            this.properties.titleLabel = "Uncle Template";
            this.properties.outputName = "TEXT_OUT";
            this.properties.autoWidth = false;
            this.properties.autoHeight = true;
            this.properties.nodeSize = [150, 50];
            this.size = [150, 50];

            if (this.outputs && this.outputs[0]) {
                this.outputs[0].name = this.properties.outputName;
                this.outputs[0].type = "STRING";
            }

            this.refreshNodeLayoutMap();
            this.refreshDerpTemplateSysMap();
            setTimeout(() => {
                if (this.transmitDerpSignal && this.id !== -1) this.transmitDerpSignal("");
            }, 1);
        };

        nodeType.prototype.onDerpSysPanelOpen = function(panel) {
            this._derpPanel = panel;
            if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
        };

        nodeType.prototype.onAdded = function() { this.suppressDefaultWidgets(); };
    }
});
