/**
 * Path: ./js/fatha/core/masterSettings.js
 * ROLE: Standalone registry for Derp ecosystem global settings.
 */
import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "xcp.DerpSettings",
    init() {
        // REGISTER GLOBAL SETTINGS IN THE COMFYUI MENU
        app.ui.settings.addSetting({
            id: "Derp.PlaySound",
            name: "Derp Nodes: Play Sound",
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.playSound = v;
                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        app.ui.settings.addSetting({
            id: "Derp.UseAnimation",
            name: "Derp Nodes: Use Animation",
            type: "boolean",
            default: true,
            onChange: (v) => {
                window.DERP_GLOBAL_SETTINGS = window.DERP_GLOBAL_SETTINGS || {};
                window.DERP_GLOBAL_SETTINGS.useAnimation = v;

                // THE WORKFLOW SYNC: Update all existing nodes to match the global setting
                if (app.graph && app.graph._nodes) {
                    app.graph._nodes.forEach(node => {
                        if (node.isFathaNode || node.isUncleNode) {
                            node.properties.useAnimations = v;
                        }
                    });
                }

                // THE BASTA SYNC: Update all active floating panels
                if (window.xcpActiveBastas) {
                    window.xcpActiveBastas.forEach(basta => {
                        basta.properties.useAnimations = v;
                    });
                }

                if (app.canvas) app.canvas.setDirty(true, true);
            }
        });

        // Initialize global object for immediate access by nodes
        window.DERP_GLOBAL_SETTINGS = {
            playSound: app.ui.settings.getSettingValue("Derp.PlaySound", true),
            useAnimation: app.ui.settings.getSettingValue("Derp.UseAnimation", true)
        };
    }
});