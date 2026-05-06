/**
 * Path: ./js/fatha/core/wirelessExtender.js
 */
import { app } from "../../../scripts/app.js";
import { runWirelessHeartbeat, purgeDerpSignal } from "./fatha/core/masterSignalEngine.js";

app.registerExtension({
    name: "xcp.WirelessExtender",
    async beforeRegisterNodeDef(nodeType, nodeData) {

        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);

            // THE LIVE REGISTRY FIX: "Heavy" guard removed.
            // All nodes (Models, Images, Latents) are now allowed to broadcast their metadata or filenames wirelessly.
            // Real tensors are intercepted and handled by the Python Global Registry.
            const isTransmitting = this.properties?.isWirelessTransmitter;
            // Standard nodes use .title, Derp nodes use .titleLabel
            const titleProp = (this.titleLabel !== undefined) ? "titleLabel" : "title";

            options.push({
                content: isTransmitting ? "🛰️ Derp Wireless: Stop Broadcasting" : "🛰️ Derp Wireless: Broadcast to Hub",
                callback: () => {
                    this.properties = this.properties || {};
                    this.properties.isWirelessTransmitter = !isTransmitting;

                    if (this.properties.isWirelessTransmitter) {
                        const currentTitle = this[titleProp] || this.type || "Node";
                        if (!currentTitle.startsWith("🛰️")) {
                            this[titleProp] = "🛰️ " + currentTitle;
                        }
                    } else {
                        if (this[titleProp]) this[titleProp] = this[titleProp].replace("🛰️ ", "");
                        purgeDerpSignal(this.id);
                    }

                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                    this.setDirtyCanvas(true);
                }
            });
        };

        const onDrawForeground = nodeType.prototype.onDrawForeground;
        nodeType.prototype.onDrawForeground = function(ctx) {
            if (onDrawForeground) onDrawForeground.apply(this, arguments);

            // THE HEARTBEAT BRIDGE: Ensure wireless signals are transmitted every frame
            if (this.properties?.isWirelessTransmitter) {
                runWirelessHeartbeat(this, { forceIndexedSingleOutput: true });
            }
        };

        // THE LIFECYCLE PURGE: Ensure that deleting a node also kills its wireless signal
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            if (onRemoved) onRemoved.apply(this, arguments);
            purgeDerpSignal(this.id);
        };
    }
});
