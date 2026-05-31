/**
 * Path: ./js/fatha/core/wirelessExtender.js
 */
import { app } from "../../../scripts/app.js";
import { runWirelessHeartbeat, purgeDerpSignal, transmitDerpSignal } from "./fatha/core/masterSignalEngine.js";

app.registerExtension({
    name: "xcp.WirelessExtender",
    async setup() {
        if (window._xcpWirelessExtenderExecutedHookInstalled || !app.api) return;
        window._xcpWirelessExtenderExecutedHookInstalled = true;

        app.api.addEventListener("executed", (e) => {
            const nodeId = e && e.detail ? e.detail.node : null;
            if (nodeId === null || nodeId === undefined || !app.graph) return;

            const node = app.graph.getNodeById(Number(nodeId));
            if (!node || !node.properties?.isWirelessTransmitter) return;

            const payload = e.detail ? e.detail.output : null;
            if (!payload) return;

            const images = Array.isArray(payload.images)
                ? payload.images
                : Array.isArray(payload.ui?.images)
                    ? payload.ui.images
                    : Array.isArray(payload.output?.images)
                        ? payload.output.images
                        : null;

            transmitDerpSignal(node, payload, {
                forceIndexedSingleOutput: true,
                ...(images && images.length > 0 ? { forceSignalType: "image" } : {})
            });
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {

        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            if (getExtraMenuOptions) getExtraMenuOptions.apply(this, arguments);

            // THE LIVE REGISTRY FIX: "Heavy" guard removed.
            // All nodes (Models, Images, Latents) are now allowed to broadcast their metadata or filenames wirelessly.
            // Real tensors are intercepted and handled by the Python Global Registry.
            if (this.isFathaNode || this.isUncleNode) return;
            const isTransmitting = this.properties?.isWirelessTransmitter;
            // Standard nodes use .title, Derp nodes use .titleLabel
            const titleProp = (this.titleLabel !== undefined) ? "titleLabel" : "title";

            options.push({
                content: isTransmitting ? "\uD83D\uDD1E Derp Wireless: Stop Broadcasting\uD83D\uDEF0\uFE0F" : "\uD83D\uDD1E Derp Wireless: Broadcast to Hub\uD83D\uDEF0\uFE0F",
                callback: () => {
                    this.properties = this.properties || {};
                    this.properties.isWirelessTransmitter = !isTransmitting;

                    if (this.properties.isWirelessTransmitter) {
                        const currentTitle = this[titleProp] || this.type || "Node";
                        if (!currentTitle.startsWith("\uD83D\uDEF0\uFE0F")) {
                            this[titleProp] = "\uD83D\uDEF0\uFE0F " + currentTitle;
                        }
                    } else {
                        if (this[titleProp]) this[titleProp] = this[titleProp].replace("\uD83D\uDEF0\uFE0F ", "");
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