import { showBastaSystemMessage } from "./fatha/bastas/bastaSystemMessage.js";

app.registerExtension({
    name: "xcp.VersionCheck",
    async setup() {
        if (window._xcpVersionCheckDone) return;
        window._xcpVersionCheckDone = true;

        try {
            const resp = await fetch("/xcp/check_version");
            const data = await resp.json();

            if (data.status === "outdated") {
                const msg = `⚠️ xcpDerpNodes v${data.local} is outdated — v${data.remote} available on GitHub.`;
                setTimeout(() => {
                    showBastaSystemMessage(
                        { title: "xcpDerpNodes", titleLabel: "xcpDerpNodes" },
                        msg,
                        8000,
                        { fade: true, grow: true },
                        null,
                        "warning",
                        null
                    );
                }, 3000);
            } else if (data.status === "latest") {
                setTimeout(() => {
                    showBastaSystemMessage(
                        { title: "xcpDerpNodes", titleLabel: "xcpDerpNodes" },
                        `✅ xcpDerpNodes v${data.local} is up to date.`,
                        4000,
                        { fade: true, grow: true },
                        null,
                        "success",
                        null
                    );
                }, 4000);
            }
        } catch (e) {
            console.debug("xcpDerpNodes version check failed:", e);
        }
    }
});
