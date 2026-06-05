import { app } from "../../../scripts/app.js";
import { showBastaSystemMessage } from "./fatha/bastas/bastaSystemMessage.js";

const VERSION_CHECK_HOST = {
    id: "xcp_version_check",
    title: "xcp_derp-UI",
    titleLabel: "xcp_derp-UI",
    properties: {},
};

function showVersionMessage(prefix, accentText, mode = "info") {
    showBastaSystemMessage(
        VERSION_CHECK_HOST,
        prefix,
        5000,
        { fade: true, grow: true, silent: true },
        null,
        mode,
        false,
        accentText
    );
}

app.registerExtension({
    name: "xcp.VersionCheck",
    async setup() {
        if (window.__xcpVersionCheckStarted) return;
        window.__xcpVersionCheckStarted = true;

        try {
            const response = await fetch("/xcp/check_version", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                console.warn("[xcp_derp-UI] Version check failed:", data.error || response.statusText);
                return;
            }
            if (data.notify === false) return;

            if (data.status === "outdated") {
                showVersionMessage("xcp_derp-UI update available: ", `${data.local} -> ${data.remote}`, "warning");
            } else if (data.status === "latest") {
                showVersionMessage("xcp_derp-UI is up to date: ", data.local || "unknown", "success");
            }
        } catch (error) {
            console.warn("[xcp_derp-UI] Version check request failed:", error);
        }
    },
});