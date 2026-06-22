const fallbackApp = {
    graph: null,
    registerExtension: () => {},
    extensionManager: { stores: { workspace: null } },
    canvas: {
        frame: 0,
        drawCount: 0,
        ds: { scale: 1, offset: [0, 0] },
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
        setDirty: () => {},
    },
    ui: {
        settings: {
            addSetting: () => {},
            getSettingValue: () => undefined,
            setSettingValue: () => {},
        },
    },
};

const app = globalThis.window?.app || globalThis.app || fallbackApp;

if (globalThis.window && !globalThis.window.app) globalThis.window.app = app;
if (!globalThis.app) globalThis.app = app;

export { app };
