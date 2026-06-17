/**
 * Path: ./grandFatha/core/masterLayoutTypes.js
 * STATUS: UPDATED - GPU Acceleration hints (will-change) added to HTML creation.
 */
import {
    getNextZIndex,
    syncDerpEditor,
    createDerpEditorHTML,
    syncBtnSimple,
    syncBtnSimpleHTML,
    syncTextLabel,
    syncTextLabelHTML,
    syncDerpSliderCanvas,
    syncDerpSliderHTML,
    createBtnIcon,
    syncBtnIcon,
    syncBtnIconHTML,
    createColorKeyEdit,
    syncColorKeyEdit,
    createLineBreak,
    syncLineBreak,
    createFileBrowser,
    syncFileBrowser,
    drawActiveFilePickerGlobal,
    syncDerpToggle,
    syncDerpToggleV2,
    syncDerpTrigger,
    syncDerpCompositeTrigger,
    syncImageHTML,
    createMarkdownHTML,
    syncMarkdownHTML,
    createDerpRegion,
    syncDerpRegion
} from "../../herbina/masterWidgets.js";

export const UI_TYPES = {
    PROMPT: "prompt",
    EDITOR: "derpEditor",
    EDITOR_HTML: "derpEditorHTML",
    DROPDOWN: "dropdown",
    DROPDOWN_DERP: "dropdownDerp",
    DROPDOWN_HTML: "dropdownHTML",
    BUTTON: "simpleBtn",
    BUTTON_HTML: "simpleBtnHTML",
    TEXT: "textLabel",
    TEXT_HTML: "htmlLabel",
    SLIDER: "slider",
    SLIDER_HTML: "sliderHTML",
    ICONBUTTON: "btnIcon",
    ICONBUTTON_HTML: "btnIconHTML",
    COLORKEYEDIT: "colorKeyEdit",
    LINEBREAK: "lineBreak",
    FILEBROWSER: "fileBrowser",
    IMAGE_HTML: "imageHTML",
    IMAGE_CANVAS: "imageCanvas",
    MARKDOWN_HTML: "markdownHTML",
    TOGGLE: "derpToggle",
    TOGGLE_V2: "derpToggleV2",
    COMPOSITE_TRIGGER: "compositeTrigger",
    REGION: "derpRegion",
};

export const COMPONENT_BLUEPRINTS = {
    [UI_TYPES.BUTTON]: {
        themeKey: "button",
        width: 32, height: 6,
        isHtml: false,
        create: () => ({ type: "btnSimple" }),
        sync: syncBtnSimple
    },
    [UI_TYPES.BUTTON_HTML]: {
        themeKey: "button",
        width: 32, height: 6,
        isHtml: true,
        create: () => {
            const btn = document.createElement("div");
            btn.className = "derp-sys-btn";
            // GPU HINT: Improves recoil animation responsiveness
            btn.style.willChange = "transform, opacity, scale";
            return btn;
        },
        sync: (el, node, app, props) => syncBtnSimpleHTML(el, node, app, props)
    },
    [UI_TYPES.TEXT]: {
        themeKey: "t_textsystem",
        width: "auto", height: "auto",
        isHtml: false,
        create: () => ({ type: "textLabel" }),
        sync: syncTextLabel
    },
    [UI_TYPES.TEXT_HTML]: {
        themeKey: "t_textsystem",
        isHtml: true,
        create: () => {
            const el = document.createElement("div");
            el.className = "derp-text-html";
            el.style.zIndex = "1"; // THE Z-INDEX FIX: Drop to bottom of shield context to prevent Basta occlusion
            // GPU HINT: Eliminates text jitter during slide transitions
            el.style.willChange = "transform, opacity";
            return el;
        },
        sync: (el, node, app, config) => {
            if (!el.parentNode) {
                const target = node.interactionShield || document.body;
                target.appendChild(el);
            }
            const safeConfig = { ...config, value: config.value ?? config.text };
            syncTextLabelHTML(el, node, app, safeConfig);
        }
    },
    [UI_TYPES.ICONBUTTON]: {
        themeKey: "button, t_textsystem",
        width: "auto", height: "auto",
        isHtml: false,
        create: () => ({ type: "btnIcon" }),
        sync: syncBtnIcon
    },
    [UI_TYPES.ICONBUTTON_HTML]: {
        themeKey: "button, t_textsystem",
        width: "auto", height: "auto",
        isHtml: true,
        create: (props) => {
            const el = createBtnIcon(props, props.icon || "fallback");
            // GPU HINT: Optimizes icon swapping and opacity fades
            el.style.willChange = "transform, opacity";
            return el;
        },
        sync: syncBtnIconHTML
    },
    [UI_TYPES.COLORKEYEDIT]: {
        themeKey: "panel",
        width: "full", height: 24,
        isHtml: false,
        create: () => createColorKeyEdit(),
        sync: syncColorKeyEdit
    },
    [UI_TYPES.LINEBREAK]: {
        themeKey: "panel",
        width: "full", height: 1,
        isHtml: false,
        create: () => createLineBreak(),
        sync: syncLineBreak
    },
    [UI_TYPES.FILEBROWSER]: {
        themeKey: "panel, t_textsystem",
        width: "fit", height: "auto",
        padding: [2, 2],
        isHtml: false,
        isHybrid: true,
        strokeZIndex: true,
        drawGlobalOverlay: drawActiveFilePickerGlobal,
        sync: (ctx, node, app, props, overlayPass) => syncFileBrowser(ctx, node, app, props, overlayPass)
    },
    [UI_TYPES.IMAGE_HTML]: {
        themeKey: "panel",
        width: "auto", height: "auto",
        // THE CANVAS NATIVE FIX: Convert to hybrid to draw natively on the canvas z-layer
        isHtml: false,
        isHybrid: true,
        sync: (ctx, node, app, config, overlayPass) => syncImageHTML(ctx, node, app, config, overlayPass)
    },
    [UI_TYPES.IMAGE_CANVAS]: {
        themeKey: "panel",
        width: "auto", height: "auto",
        isHtml: false,
        isHybrid: true,
        sync: (ctx, node, app, config, overlayPass) => syncImageHTML(ctx, node, app, config, overlayPass)
    },
    [UI_TYPES.MARKDOWN_HTML]: {
        themeKey: "panel, t_textNormal",
        width: "full", height: "auto",
        isHtml: true,
        create: () => createMarkdownHTML(),
        sync: syncMarkdownHTML
    },
    [UI_TYPES.SLIDER]: {
        themeKey: "slider, t_textsmall",
        width: "full", height: "auto",
        isHtml: false,
        create: () => ({ type: "derpSlider" }),
        sync: syncDerpSliderCanvas
    },
    [UI_TYPES.SLIDER_HTML]: {
        themeKey: "slider, t_textsmall",
        width: "full", height: "auto",
        isHtml: true,
        create: () => {
            const el = document.createElement("div");
            el.className = "derp-slider-html";
            el.style.zIndex = String(getNextZIndex());
            // GPU HINT: Allows high-frequency slider updates without layout thrashing
            el.style.willChange = "transform, opacity";
            return el;
        },
        sync: syncDerpSliderHTML
    },
    [UI_TYPES.EDITOR]: {
        themeKey: "panel, t_textnormal",
        isHtml: false,
        isHybrid: true,
        sync: (ctx, node, app, props) => {
            const el = node._derpDomElements?.[props.key];
            if (el && !el._onKeyDownWrapped && props.onKeyDown) {
                el.addEventListener("keydown", (e) => props.onKeyDown(e, el.innerText || el.value));
                el._onKeyDownWrapped = true;
            }
            return syncDerpEditor(ctx, node, app, props);
        }
    },
    [UI_TYPES.EDITOR_HTML]: {
        themeKey: "panel, t_textnormal",
        isHtml: true,
        create: (props) => {
            const el = createDerpEditorHTML(props);
            // GPU HINT: Ensures editor stays pinned during node dragging
            el.style.willChange = "transform, opacity";
            return el;
        },
        sync: (el, node, app, props) => {
            if (!el._onPressWrapped && props.onPress) {
                const original = props.onPress;
                props.onPress = () => {
                    el._isAwake = true;
                    el.style.display = "flex";
                    el.focus();
                    original();
                };
                el._onPressWrapped = true;
            }
            syncDerpEditor(el, node, app, props);
        }
    },
    [UI_TYPES.TOGGLE]: {
        themeKey: "button, t_textsystem",
        width: "fit", height: "auto",
        isHybrid: true,
        sync: (ctx, node, app, props) => syncDerpToggle(ctx, node, app, props)
    },
    [UI_TYPES.TOGGLE_V2]: {
        themeKey: "button, t_textsystem",
        width: "fit", height: "auto",
        isHybrid: true,
        sync: (ctx, node, app, props) => syncDerpToggleV2(ctx, node, app, props)
    },
    [UI_TYPES.TRIGGER]: {
        themeKey: "button, t_textsystem",
        width: "fit", height: "auto",
        isHybrid: true,
        sync: (ctx, node, app, props) => syncDerpTrigger(ctx, node, app, props)
    },
    [UI_TYPES.COMPOSITE_TRIGGER]: {
        themeKey: "button, t_textsystem",
        width: "fit", height: "auto",
        isHybrid: true,
        sync: (ctx, node, app, props) => syncDerpCompositeTrigger(ctx, node, app, props)
    },
    [UI_TYPES.REGION]: {
        themeKey: "region",
        width: "full", height: "auto",
        isHtml: false,
        create: () => createDerpRegion(),
        sync: syncDerpRegion
    },
};
