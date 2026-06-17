/**
 * PROJECT: xcpDerpNodes | PURPOSE: Theme Extension Registration
 * LOCATION: core/themeExtension.js
 * STATUS: Cleaned of legacy Motha UI. Data Authority only.
 */
import { app } from "../../../../scripts/app.js";
import { initThemeConfig } from "./themeConfig.js";

// Initialize the global window.xcpDerpThemeConfig object
initThemeConfig();

app.registerExtension({
    name: "xcp.ThemeManagerExtension",
    async setup() {
        console.log("%c[xcpDerp] Data Authority: ONLINE", "color: #ffaa00; font-weight: bold;");

        // Global Hotkey for quick saving themes
        window.addEventListener("keydown", (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                const config = window.xcpDerpThemeConfig;
                // Allow saving any loaded theme
                if (config?.isDirty) {
                    config.persist(true);
                    app.ui.dialog.show("Theme Saved.");
                }
            }
        });
    }
});