import { app } from "../../../scripts/app.js";
import { drawThemeManagerLayout } from "./helpers/themeManagerLayouts.js";
import { createSystemBtn, createDropdown } from "../herbina/herbinaMasterWidgets.js";
import { create3colorProblem } from "../herbina/widgets/3colorProblem.js";

const DEFAULT_THEME_KEY = "bg";

app.registerExtension({
    name: "xcp.ThemeManagerExtension",
    async beforeRegisterNodeDef(nodeDef, nodeData, app) {
        if (nodeData.name === "xcpThemeManager") {
            const nodeType = nodeDef;
            nodeType.title_mode = LiteGraph.NO_TITLE;

            const getAutoHeight = (node) => {
                const p = node.properties;
                const tH = p.titleHeight || 20, sH = p.spacingH || 0;
                const bH = p.themeBarHeight || 14;
                const dH = p.controlDeckGlobalsHeight || 14;
                const breakH = (p.breakH || 4) * 2;
                const previewH = 100, yOff = p.previewAreaYoffset || 0, marginB = p.marginB || 4;
                return tH + (sH * 2) + bH + (breakH * 2) + (yOff * 2) + previewH + bH + sH + dH + marginB;
            };

            nodeType.prototype.onResize = function(size) {
                const p = this.properties, mX = p.marginX || 4, sW = p.spacingW || 2, bH = p.themeBarHeight || 14;
                const minNodeW = mX + (bH * 5) + (sW * 5) + 160 + mX + 10;
                if (size[0] < minNodeW) size[0] = minNodeW;
                this._dynamicDropdownW = size[0] - (mX * 2) - (bH * 5) - (sW * 5);
                size[1] = getAutoHeight(this);
            };

            nodeType.prototype.onNodeCreated = function() {
                this.size = [360, 240];
                this._hovers = {};
                this.activeControlKey = DEFAULT_THEME_KEY;
                const makeHover = (key) => (h) => { this._hovers[key] = h; this.setDirtyCanvas(true); };

                const config = window.xcpDerpThemeConfig;
                const themeList = config?.themes ? Object.keys(config.themes) : ["Standard"];
                const keyList = config?.themes[config.activeTheme] ? Object.keys(config.themes[config.activeTheme]) : [DEFAULT_THEME_KEY];

                this.htmlWidgets = {
                    themeBarBtnTrash:  createSystemBtn({ onClick: () => {}, onHover: makeHover('tTrash') }, "trash"),
                    themeSelector:     createDropdown({
                        onChange: (v) => {
                            config.activeTheme = v;
                            config.persist();
                            const newKeys = config.themes[v] ? Object.keys(config.themes[v]) : [DEFAULT_THEME_KEY];
                            this.htmlWidgets.keySelector.updateOptions(newKeys);
                        }
                    }, themeList),
                    themeBarBtnAdd:    createSystemBtn({ onClick: () => {}, onHover: makeHover('tAdd') }, "Add"),
                    themeBarBtnCopy:   createSystemBtn({ onClick: () => {}, onHover: makeHover('tCopy') }, "Copy"),
                    themeBarBtnRename: createSystemBtn({ onClick: () => {}, onHover: makeHover('tRename') }, "Rename"),
                    themeBarBtnSave:   createSystemBtn({ onClick: () => {}, onHover: makeHover('tSave') }, "Save"),

                    controlBarBtnTrash:  createSystemBtn({ onClick: () => {}, onHover: makeHover('cTrash') }, "trash"),
                    keySelector:         createDropdown({ onChange: (v) => { this.activeControlKey = v; } }, keyList),
                    controlBarBtnAdd:    createSystemBtn({ onClick: () => {}, onHover: makeHover('cAdd') }, "Add"),
                    controlBarBtnCopy:   createSystemBtn({ onClick: () => {}, onHover: makeHover('cCopy') }, "Copy"),
                    controlBarBtnRename: createSystemBtn({ onClick: () => {}, onHover: makeHover('cRename') }, "Rename"),
                    controlBarBtnSave:   createSystemBtn({ onClick: () => {}, onHover: makeHover('cSave') }, "Save"),

                    // FIXED: Now passing 'this' (the node) as the first argument
                    tripleBtn: create3colorProblem(this, {
                        onLeft: () => console.log("colorON triggered"),
                        onMid:  () => console.log("colorOFF triggered"),
                        onRight: () => console.log("colorDIS triggered"),
                        onBridgeLeft: (e, locked) => console.log("lockOne triggered", locked),
                        onBridgeRight: (e, locked) => console.log("lockTwo triggered", locked)
                    })
                };

                for (const key in this.htmlWidgets) {
                    const w = this.htmlWidgets[key];
                    if (w instanceof HTMLElement) {
                        document.body.appendChild(w);
                    } else if (typeof w === 'object' && w !== null) {
                        Object.values(w).forEach(btn => document.body.appendChild(btn));
                    }
                }

                this._states = {
                    tTrash: "DIS", tAdd: "OFF", tCopy: "OFF", tRename: "OFF", tSave: "OFF",
                    cTrash: "DIS", cAdd: "OFF", cCopy: "OFF", cRename: "OFF", cSave: "OFF"
                };

                Object.assign(this.properties, {
                    titleHeight: 20, themeBarHeight: 14, controlDeckGlobalsHeight: 14,
                    spacingH: 4, spacingW: 2, marginX: 4, marginB: 4,
                    breakW: 4, breakH: 4, previewAreaXoffset: 4, previewAreaYoffset: 8
                });
            };

            nodeType.prototype.onDrawBackground = function(ctx) {
                if (this.flags?.collapsed) {
                    for (const key in this.htmlWidgets) {
                        const w = this.htmlWidgets[key];
                        if (w instanceof HTMLElement) w.style.display = "none";
                        else if (typeof w === 'object' && w !== null) Object.values(w).forEach(b => b.style.display = "none");
                    }
                    return;
                }
                drawThemeManagerLayout(ctx, this, app, this._dynamicDropdownW);
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                if (onRemoved) onRemoved.apply(this, arguments);
                for (const key in this.htmlWidgets) {
                    const w = this.htmlWidgets[key];
                    if (w instanceof HTMLElement) w.remove();
                    else if (typeof w === 'object' && w !== null) Object.values(w).forEach(btn => btn.remove());
                }
            };
        }
    }
});