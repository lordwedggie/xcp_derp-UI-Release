/**
 * PROJECT: derpNodes | NODE: derpSeedV2
 * STATUS: FULLY INTEGRATED (V3/V4 DYNAMIC PATTERN)
 */
import { app } from "../../../../../scripts/app.js";
import { uncle, initDerpGlobalListener } from "../../fatha/uncle.js";
import { UI_TYPES } from "../../fatha/core/masterLayoutTypes.js";
import { parseColorKeyText } from "../../herbina/utils/widgetsUtils.js";
import {
    attachDerpSeedLogic,
    handleSeedInput,
    handleSeedBlur,
    handleSeedButtonPress,
    handleModeControlPress,
    handleExecutePress,
    handleStopPress,
    handleHistoryCountBlur,
    handleDigitValueBlur,
    formatSeedHistoryDisplayText
} from "./core/derpSeedV2_core.js";

app.registerExtension({
    name: "xcp.derpSeedV2_Extension",
    async setup() { initDerpGlobalListener(); },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "derpSeedV2") return;

        uncle(nodeType, nodeData, 100);

        const onThemeUpdate = nodeType.prototype.onThemeUpdate;
        nodeType.prototype.onThemeUpdate = function(config) {
            if (onThemeUpdate) onThemeUpdate.apply(this, arguments);
            this.refreshNodeLayoutMap();
            this.refreshDerpSeedSysMap();
            this.updateDerpSeedUI(this._comfyIsBusy);
            this.requestDerpSync();
        };

        // Inject all extracted logic, events, animations, and lifecycle hooks
        attachDerpSeedLogic(nodeType);
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            if (onCreated) onCreated.apply(this, arguments);
            this.properties.isWirelessTransmitter = true;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            if (onConfigure) onConfigure.apply(this, arguments);
            this.properties.isWirelessTransmitter = true;
        };

        nodeType.prototype.refreshNodeLayoutMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            const digits = this.properties.seedDigits || 15;
            const measurementStr = "9".repeat(digits);

            const history = this.properties.seedHistory || [];
            const _highlight = parseColorKeyText("{{t_text_highlight:::_}}", this, "_OFF");
            const highlightColor = _highlight.segments?.[0]?.color;
            const useColorKeys = this.properties.toggleColorKey !== false;
            const seedDisplayText = (seed, index) => {
                const rawText = seed?.toString() ?? "";
                return useColorKeys ? formatSeedHistoryDisplayText(rawText, index) : rawText;
            };
            this.layoutMap = {
                mainRow: {
                    // THE ANCHOR FIX: Apply oY offset to ensure content starts below the header, stabilizing anchor coordinates
                    anchor: { target: "headerRegion", axis: "y", offset: oY },
                    dir: "row", width: "full", height: "auto",
                    margin: [mW, mH, mW, mH], spacing: [sW, 0],
                    dynamicRegion: {
                        objectAlign: ["left", "top"],
                        dir: "col", height: "auto", width: "full",
                        ...Object.fromEntries(history.map((seed, i) => [
                            `rowSeed_${i}`, {
                                dir: "col",
                                //width: i === 0 ? "auto" : "full",
                                width: "auto",
                                height: "auto",
                                spacing: [0, sH],
                                [`labelSeed_${i}`]: i === 0 ? {
                                    type: UI_TYPES.EDITOR, canvasShield: true,
                                    labelColor: useColorKeys ? highlightColor : undefined,
                                    themeKey: "panel, t_textSmall", numberOnly: false,
                                    text: seedDisplayText(this._seedAnimStates?.[i] ? this._seedAnimStates[i].text : seed, i),
                                    value: this._seedAnimStates?.[i] ? this._seedAnimStates[i].text : seed.toString(),
                                    alpha: this._seedAnimStates?.[i] ? this._seedAnimStates[i].alpha : 1,
                                    measureText: [measurementStr],
                                    width: "auto", height: "auto",
                                    padding: [pW, pH],
                                    objectAlign: ["center", "middle"],
                                    labelAlign: ["center", "middle"],
                                    // THE REAL-TIME FIX: Broadcast on every keystroke
                                    onInput: (val) => handleSeedInput(this, val),
                                    onBlur: (val) => handleSeedBlur(this, val)
                                } : {
                                    type: UI_TYPES.BUTTON,
                                    themeKey: "button, t_textSmall", numberOnly: true,
                                    measureText: [measurementStr],
                                    text: this._seedAnimStates?.[i] ? this._seedAnimStates[i].text : seed.toString(),
                                    alpha: this._seedAnimStates?.[i] ? this._seedAnimStates[i].alpha : 1,
                                    noHover: false,
                                    width: "auto", height: "auto",
                                    padding: [pW, pH],
                                    objectAlign: ["center", "middle"],
                                    labelAlign: ["center", "middle"],
                                    onPress: () => handleSeedButtonPress(this, seed, i)
                                }
                            }
                        ]))
                    },
                    secondaryRegion: {
                        objectAlign: ["left", "top"],
                        dir: "col",
                        width: "full", height: "match",
                        btnSeedControl: {
                            type: UI_TYPES.BUTTON,
                            themeKey: "button, t_textSmall", measureText: "Increment",
                            state: this._comfyIsBusy ? "DIS" : "OFF",
                            text: useColorKeys ? `{{t_text_warning::${this.properties.seedMode || "Random"}}}` : (this.properties.seedMode || "Random"),
                            noHover: false, width: "full", height: "auto", padding: [pW, pH], spacing: [sW, sH],
                            objectAlign: ["left", "top"], labelAlign: ["center", "middle"],
                            onPress: () => handleModeControlPress(this)
                        },
                        btnExecute: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textNormal",
                            ...(useColorKeys ? { iconColorKey: "t_text_accent" } : {}),
                            state: this._comfyIsBusy ? "DIS" : "OFF",
                            noHover: false, noFilter: true,
                            icon: "play", width: "full", height: "fill", padding: [pW, pH], spacing: [0, sH],
                            objectAlign: ["left", "top"],
                            onPress: () => handleExecutePress(this)
                        },
                        btnStop: {
                            type: UI_TYPES.ICONBUTTON,
                            themeKey: "button, t_textBig",
                            ...(useColorKeys ? { iconColorKey: "t_text_error" } : {}),
                            state: this._comfyIsBusy ? "OFF" : "DIS",
                            noHover: false,
                            icon: "stop", width: "full", height: "auto", padding: [pW, pH],
                            objectAlign: ["left", "top"],
                            onPress: () => handleStopPress(this)
                        },
                    },
                },
                /*
                layoutSpacer: {
                    anchor: { target: "mainRow", axis: "y", offset: oY },
                }
                 */
            };
            this.requestDerpSync();
        };

        // --- SYSTEM PANEL LAYOUT ---
        nodeType.prototype.refreshDerpSeedSysMap = function() {
            const { mW, mH, sW, sH, oX, oY, pW, pH } = this.getDerpVars(this);
            this.sysLayoutMap = {
                sysCustomRegion: {
                    anchor: { target: "sysDefaultControlsRegion", axis: "y"},
                    dir: "row", width: "full", height: "auto", margin: [mW * 2, mH, mW + sH, mH],
                    historyCountLabel: {
                        type: UI_TYPES.TEXT, text: "History Logs:", themeKey: "t_textsystem", mouseOver: false,
                        width: "auto", height: "auto", 
                    },
                    historyCount: {
                        type: UI_TYPES.EDITOR, themeKey: "dialog, t_textsystem",
                        canvasShield: true,
                        paddings: [pW, pH],
                        width: 20, height: "auto", 
                        objectAlign: ["left", "middle"], labelAlign: ["center", "middle"], 
                        value: this.properties.seedHistoryLimit || 5,
                        spacing: [mW, 0],
                        onBlur: (val) => handleHistoryCountBlur(this, val)
                    },
                    digitLabel: {
                        type: UI_TYPES.TEXT, text: "Decimals:", themeKey: "t_textsystem", mouseOver: false,
                        width: "auto", height: "auto", objectAlign: ["left", "middle"], 
                    },
                    digitValue: {
                        type: UI_TYPES.EDITOR, themeKey: "dialog, t_textsystem",
                        measureText: "999", paddings: [pW, pH],
                        width: 20, height: "auto", objectAlign: ["left", "middle"], labelAlign: ["center", "middle"], spacing: [sW, 0],
                        value: this.properties.seedDigits || 15,
                        text: (this.properties.seedDigits || 15).toString(),
                        spacing: [sW, 0],
                        onBlur: (val) => handleDigitValueBlur(this, val)
                    },
                    toggleColorKey: {
                        type: UI_TYPES.TOGGLE_V2, isTextOnly: true,
                        themeKey: "dialog, button, t_textSystem",
                        text: "Color Overlay",
                        width: "full", height: "auto", padding: [pW, pH],
                        value: this.properties.toggleColorKey !== false,
                        onChange: (v) => {
                            this.properties.toggleColorKey = v;
                            this._layoutDirty = true;
                            this.refreshNodeLayoutMap();
                            this.refreshDerpSeedSysMap();
                    }
                    }
                },
            };

            if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                this._derpPanel.setLayoutMap(this.sysLayoutMap);
            }
        };
    }
});
