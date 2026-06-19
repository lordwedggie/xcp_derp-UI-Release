/** * MODULE: Theme Sync Node
 * PURPOSE: Manages the node lifecycle and data syncing.
 * LOCATION: core/themeSyncNode.js
 * STATUS: Legacy UI logic removed. Headless data listener.
 */
import { app } from "../../../../scripts/app.js";

export function onNodeCreatedHandler() {
    this.titleLabel = "Theme Manager (Data)";
    window.xcpDerpThemeConfig?.register(this);
}

export function onThemeUpdateHandler(config) {
    if (!config || !config.themes) return;
    this.themeToEdit = config.themes[config.activeTheme] || {};
    this.setDirtyCanvas(true, true);
}

export function onDrawBackgroundHandler(ctx) {
    // UI Drawing removed. Node acts purely as a headless data listener.
}

export function onRemovedHandler(origOnRemoved) {
    window.xcpDerpThemeConfig?.unregister(this);
    if (origOnRemoved) origOnRemoved.apply(this, arguments);
}