/**
 * Path: ./js/core/derpSlider_core.js
 * ROLE: Logic, Lifecycle, and State Management for Derp Slider
 */
import { transmitDerpSignal } from "../../fatha/core/masterSignalEngine.js";

var BTN_LR_RATIO = 0.75;
var BTN_LR_FONTSIZE = 6;
var BTN_LR_MARGIN = 1;
var SLIDER_SIGNAL_POST_DEBOUNCE_MS = 250;
var SLIDER_SIGNAL_OUT_REFRESH_DEBOUNCE_MS = 250;

function wakeSliderNode(node) {
    if (!node) return;
    node._derpAwakeFrames = Math.max(Number(node._derpAwakeFrames || 0), 5);
    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
    if (window.app?.canvas?.setDirty) window.app.canvas.setDirty(true, true);
}

function resolveSliderValueFromX(reg, config, localX, options = {}) {
    const cMin = parseFloat(config.min ?? 0);
    const cMax = parseFloat(config.max ?? 1);
    const cStep = parseFloat(config.step ?? 0.05);
    const cDef = parseFloat(config.default ?? 0.5);
    const cDec = parseInt(config.decimal ?? config.decimals ?? 2);

    let newVal;
    if (options.useDefault) {
        newVal = cDef;
    } else {
        let trackX = reg.x;
        let trackW = reg.w;
        if (config?.btnLR) {
            const btnW = Math.round((reg.h || 14) * BTN_LR_RATIO);
            const mrg = BTN_LR_MARGIN;
            trackX = reg.x + mrg + btnW;
            trackW = Math.max(1, reg.w - (btnW + mrg) * 2);
        }
        const percent = Math.max(0, Math.min(1, (localX - trackX) / trackW));
        const rawVal = cMin + (percent * (cMax - cMin));
        newVal = options.snap ? Math.round(rawVal / cStep) * cStep : rawVal;
    }

    newVal = Math.max(cMin, Math.min(cMax, newVal));
    return {
        value: parseFloat(newVal.toFixed(cDec)),
        cMin,
        cMax,
        cStep,
        cDec,
    };
}

function tLocale(key, fallback = key) {
    if (!key || typeof key !== "string" || !key.startsWith("$")) return key;
    const path = key.substring(1).split(".");
    let target = window.xcpDerpLocaleData || {};
    for (const segment of path) {
        target = target?.[segment];
        if (target === undefined) return fallback;
    }
    return target;
}

export function setupDerpSliderCore(nodeType) {
    if (!nodeType.prototype.transmitDerpSignal) {
        nodeType.prototype.transmitDerpSignal = transmitDerpSignal;
    }

    // --- WIRELESS SIGNAL PROTOCOL ---
    nodeType.prototype.broadcastWirelessSignal = function(dataArray) {
        if (!this.transmitDerpSignal || this.id === -1 || !Array.isArray(dataArray) || dataArray.length === 0) return;
        if (!this._signalPostTimers) this._signalPostTimers = {};

        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;

        const fingerprint = dataArray.map(s => `${s.name}:${s.value}`).join("|") + (this.titleLabel || "");
        const gatedFingerprint = `${isBypassed ? "bypass" : "live"}__${fingerprint}`;
        if (this._lastSignalFingerprint === gatedFingerprint) return;
        this._lastSignalFingerprint = gatedFingerprint;

        const baseId = String(this.id);
        const nodeName = this.titleLabel || this.title || "Unknown";

        // 1. Update the global registry for individual sub-signals
        if (!window.xcpDerpSignals) window.xcpDerpSignals = {};

        dataArray.forEach((item, i) => {
            const val = parseFloat(item.value) || 0;
            const decSetting = parseInt(item.decimal ?? item.decimals ?? 2);
            const isInt = (decSetting === 0);

            // THE PORT-NAME FIX: Always use indexed IDs so derpSignalOut can resolve the specific slider name
            const signalId = `${baseId}:${i}`;
            const displayName = `${nodeName} [${item.name || `Slider_${i+1}`}]`;

            const finalValue = isBypassed ? null : (isInt ? Math.round(val) : val);
            const existing = window.xcpDerpSignals[signalId];

            if (!existing || existing.value !== finalValue) {
                window.xcpDerpSignals[signalId] = {
                    nodeId: signalId,
                    nodeName: displayName,
                    nodeType: this.type,
                    type: isBypassed ? "null" : (isInt ? "int" : "float"),
                    value: finalValue,
                    timestamp: Date.now()
                };

                if (this._signalPostTimers[signalId]) clearTimeout(this._signalPostTimers[signalId]);
                this._signalPostTimers[signalId] = setTimeout(() => {
                    delete this._signalPostTimers[signalId];
                    fetch("/xcp/update_signal", {
                        method: "POST",
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ node_id: signalId, value: finalValue })
                    });
                }, SLIDER_SIGNAL_POST_DEBOUNCE_MS);
            }
        });

        // 2. Broadcast the bulk object payload for the node output
        const signalPayload = dataArray.reduce((acc, item) => {
            const val = parseFloat(item.value) || 0;
            const decSetting = parseInt(item.decimal ?? item.decimals ?? 2);
            const isInt = (decSetting === 0);
            acc[item.name] = isBypassed ? null : (isInt ? Math.round(val) : val);
            return acc;
        }, {});

        this.transmitDerpSignal(this, signalPayload);

        // 3. Notify Signal Out nodes to update their dropdown lists
        if (window.app?.graph) {
            if (this._signalOutRefreshTimer) clearTimeout(this._signalOutRefreshTimer);
            this._signalOutRefreshTimer = setTimeout(() => {
                this._signalOutRefreshTimer = null;
                window.app.graph._nodes.forEach(n => {
                    if (n.type === "xcpDerpSignalOut" && n.updateReceivedSignals) n.updateReceivedSignals();
                });
            }, SLIDER_SIGNAL_OUT_REFRESH_DEBOUNCE_MS);
        }
    };

    nodeType.prototype.updateDerpSliderVisualValue = function(index, value) {
        const key = `dynamicSlider_${index}`;
        const valueKey = `dynamicSliderValue_${index}`;
        if (this.layout?.regions?.[key]) this.layout.regions[key].value = value;
        if (this._compDataCache?.[key]) this._compDataCache[key].value = value;

        const data = this.properties.sliderContainer?.[index];
        if (data) {
            const dec = data.decimal !== undefined ? parseInt(data.decimal) : 2;
            const text = parseFloat(value ?? 0).toFixed(dec);
            if (this.layout?.regions?.[valueKey]) {
                this.layout.regions[valueKey].text = text;
                this.layout.regions[valueKey].value = text;
            }
            if (this._compDataCache?.[valueKey]) {
                this._compDataCache[valueKey].text = text;
                this._compDataCache[valueKey].value = text;
            }
        }
    };

    nodeType.prototype.syncDerpOutputs = function() {
        if (this.purgeDerpSignal) this.purgeDerpSignal();
        this._lastSignalFingerprint = null;

        // THE PURE VIRTUAL ENFORCER: Ensure node is Pure Virtual (zero ports) for server validation
        if (this.outputs && this.outputs.length > 0) {
            this.outputs.forEach(o => { if (o.links) o.links = null; });
            this.outputs = [];
        } else {
            this.outputs = [];
        }

        const count = parseInt(this.properties.sliderCount) || 1;
        let data = this.properties.sliderContainer || [];

        let dataChanged = false;
        while (data.length < count) {
            data.push({
                name: `Slider_${(data.length + 1).toString().padStart(2, '0')}`,
                min: 0, max: 1, step: 0.05, default: 0.5, decimal: 2, value: 0.5, btnLR: false, fillbarHeight: 1.0, knobWidthScale: 1.0
            });
            dataChanged = true;
        }
        if (data.length > count) { data = data.slice(0, count); dataChanged = true; }
        if (dataChanged) this.properties.sliderContainer = data;

        if (this.broadcastWirelessSignal) this.broadcastWirelessSignal(data);
        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
        if (this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
        this.requestDerpSync();
    };

    // THE PROFILE PROTOCOL: Applies settings from the JSON server to the sliderContainer
    nodeType.prototype.applyDerpProfile = function(profileName) {
        if (!this._sysProfileData || !this._sysProfileData[profileName] || profileName === "(No Profiles Found)") return;

        const profileObj = this._sysProfileData[profileName];
        const targetData = profileObj.sliders || (Array.isArray(profileObj) ? profileObj : []);

        // Deep clone to ensure property serialization is clean
        this.properties.sliderContainer = JSON.parse(JSON.stringify(targetData));
        this.properties.sliderCount = profileObj.sliderCount || profileObj.count || targetData.length;
        if (profileObj.nameDisplay) this.properties.nameDisplay = profileObj.nameDisplay;

        if (this.syncDerpOutputs) this.syncDerpOutputs();
    };

    nodeType.prototype.exportDerpProfile = function() {
        return {
            sliders: JSON.parse(JSON.stringify(this.properties.sliderContainer || [])),
            sliderCount: this.properties.sliderCount || 1,
            nameDisplay: this.properties.nameDisplay || "Top"
        };
    };

    nodeType.prototype.handleSliderDraw = function() {
        if (this.flags?.collapsed) return;

        const isBypassed = this.mode === 4 || this.mode === 2 || this._derpSpoofedBypass;
        if (this._lastBypassState !== isBypassed) {
            this._lastBypassState = isBypassed;
            if (this.syncDerpOutputs) this.syncDerpOutputs();
            this.refreshNodeLayoutMap();
            this.requestDerpSync();
        }

        const currentW = Math.round(this.size[0]);
        if (this._lastDerpW !== currentW) {
            this._lastDerpW = currentW;
            this.refreshNodeLayoutMap();
        }
    };

    nodeType.prototype.handleSliderResize = function(size) {
        this.properties.nodeSize = [size[0], size[1]];
        this.refreshNodeLayoutMap();
    };

    // --- LIFECYCLE ---
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function() {
        if (!this.properties) this.properties = {};
        this.properties.sliderContainer = [{
            name: "Slider_01", min: 0, max: 1, step: 0.05, default: 0.5, decimal: 2, value: 0.5, btnLR: false, fillbarHeight: 1.0, knobWidthScale: 1.0
        }];
        this.properties.sliderCount = this.properties.sliderContainer.length;

        if (onCreated) onCreated.apply(this, arguments);

        this.properties.isWirelessTransmitter = true;
        this.properties.skipGenericWirelessHeartbeat = true;

        this.titleLabel = tLocale("$derp_slider.title", "Derp Slider");
        this.properties.titleLabel = tLocale("$derp_slider.title", "Derp Slider");
        this.properties.autoWidth = false;
        this.properties.autoHeight = true;
        this.properties.nodeSize = [300, 50];
        this.size = [300, 50];

        setTimeout(() => {
            if (typeof this.syncDerpOutputs === "function" && this.id !== -1) {
                this.syncDerpOutputs();
            }
        }, 1);
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function(info) {
        if (onConfigure) onConfigure.apply(this, arguments);

        // THE PURE VIRTUAL ENFORCER: Purge physical slots immediately on load
        if (this.outputs && this.outputs.length > 0) {
            this.outputs.forEach(o => { if (o.links) o.links = null; });
            this.outputs = [];
        }

        if (info.properties && this.refreshDerpSliderSysMap) this.refreshDerpSliderSysMap();
        this.properties.skipGenericWirelessHeartbeat = true;
        if (!this.properties.nameDisplay) this.properties.nameDisplay = "Top";
        const normalizedDisplay = String(this.properties.nameDisplay || "").trim().toLowerCase();
        const localizedDisplayMap = {
            [String(tLocale("$derp_slider.name_display.slider", "Slider")).trim().toLowerCase()]: "Slider",
            [String(tLocale("$derp_slider.name_display.top", "Top")).trim().toLowerCase()]: "Top",
            [String(tLocale("$derp_slider.name_display.left", "Left")).trim().toLowerCase()]: "Left",
            [String(tLocale("$derp_slider.name_display.none", "None")).trim().toLowerCase()]: "None",
        };
        if (localizedDisplayMap[normalizedDisplay]) this.properties.nameDisplay = localizedDisplayMap[normalizedDisplay];
        if (!this.titleLabel || this.titleLabel === "Derp Slider") this.titleLabel = tLocale("$derp_slider.title", "Derp Slider");
        if (!this.properties.titleLabel || this.properties.titleLabel === "Derp Slider") this.properties.titleLabel = tLocale("$derp_slider.title", "Derp Slider");
        if (typeof this.syncDerpOutputs === "function") this.syncDerpOutputs();
    };

    nodeType.prototype.onDerpSysPanelOpen = function(panel) {
        this._derpPanel = panel;
        if (panel.showProfiles) {
            panel.showProfiles("derpSlider", "nodeSettings");
        }
        if (this.sysLayoutMap) panel.setLayoutMap(this.sysLayoutMap);
    };

    // --- INTERACTION ---
    const baseHandleInteraction = nodeType.prototype.handleShieldInteraction;
    nodeType.prototype.handleShieldInteraction = function(type, data) {
        const sliderDragSessionActive =
            this._activeSliderIndex !== null && this._activeSliderIndex !== undefined;

        if (type === "resize") this._isDerpResizing = true;
        if (type === "dragStart") this._sliderInteractionMoved = false;
        if (type === "drag") this._sliderInteractionMoved = true;
        if (type === "dragEnd") {
            const activeIdx = this._activeSliderIndex;
            const activeCfg = Number.isInteger(activeIdx) ? this.properties.sliderContainer?.[activeIdx] : null;
            if (this._pendingSliderDraft && Number.isInteger(activeIdx) && activeCfg) {
                const { value, cMin, cMax, cStep, cDec } = this._pendingSliderDraft;
                const snappedVal = Math.max(cMin, Math.min(cMax, Math.round(value / cStep) * cStep));
                activeCfg.value = parseFloat(snappedVal.toFixed(cDec));
                if (this.updateDerpSliderVisualValue) this.updateDerpSliderVisualValue(activeIdx, activeCfg.value);
            }
            if (activeCfg) activeCfg._isDraggingSlider = false;
            const activeKey = Number.isInteger(activeIdx) ? `dynamicSlider_${activeIdx}` : null;
            if (activeKey && this._compDataCache?.[activeKey]) this._compDataCache[activeKey]._isDraggingSlider = false;
            this._pendingSliderDraft = null;
            this._activeSliderIndex = null;
            this._isDerpResizing = false;
            // THE FINAL SYNC: Finalize the wireless signal and Python registry state upon mouse release.
            if (this._sliderInteractionMoved && this.syncDerpOutputs) this.syncDerpOutputs();
            this._sliderInteractionMoved = false;
        }

        if (type === "hover" || type === "drag" || type === "dragStart" || type === "click" || type === "dblclick") {
            const { localX, localY } = data || {};
            let foundIdx = null;
            const regions = this.layout?.regions;

            if (regions && typeof localX === 'number' && typeof localY === 'number') {
                for (const key of Object.keys(regions).reverse()) {
                    const idx = parseInt(key.split("_")[1]);
                    if (key.startsWith("dynamicSlider_") && !isNaN(idx) && this.layout.hitTest([localX, localY], regions[key])) {
                        foundIdx = idx;
                        break;
                    }
                }
            }

            if (type === "dragStart" || type === "click" || type === "dblclick") { this._activeSliderIndex = foundIdx; this._pressedRegionIsDragHandle = true; }
            const interactionDuringDrag = type === "drag" || type === "hover" || type === "move";
            const effectiveFoundIdx = (sliderDragSessionActive && interactionDuringDrag)
                ? this._activeSliderIndex
                : foundIdx;
            const targetIdx = this._activeSliderIndex !== null ? this._activeSliderIndex : effectiveFoundIdx;

            if (sliderDragSessionActive && interactionDuringDrag) {
                this._hoveredRegionKey = `dynamicSlider_${this._activeSliderIndex}`;
            }

            // btnLR: intercept on dragStart/click before position-based handling
            if ((type === "dragStart" || type === "click" || type === "dblclick") && targetIdx !== null && !isNaN(targetIdx)) {
                const dataArr = this.properties.sliderContainer;
                const cfg = dataArr[targetIdx];
                // Skip click if already handled on dragStart (prevents double-step)
                if (type === "click" && this._btnLRHandledIdx === targetIdx) {
                    this._btnLRHandledIdx = null;
                    return true;
                }
                if (cfg?.btnLR) {
                    const btnReg = regions[`dynamicSlider_${targetIdx}`];
                    if (btnReg) {
                        const btnW = Math.round((btnReg.h || 14) * BTN_LR_RATIO);
                        const mrg = BTN_LR_MARGIN;
                        // Double-click on a btnLR button: absorb and mark handled
                        if (type === "dblclick") {
                            if (localX >= btnReg.x + mrg && localX <= btnReg.x + mrg + btnW) {
                                this._btnLRHandledIdx = targetIdx;
                                return true;
                            }
                            if (localX >= btnReg.x + btnReg.w - btnW - mrg && localX <= btnReg.x + btnReg.w - mrg) {
                                this._btnLRHandledIdx = targetIdx;
                                return true;
                            }
                            // dblclick on track area: fall through to normal dblclick reset
                        }
                        const step = parseFloat(cfg.step ?? 0.05);
                        const dec = parseInt(cfg.decimal ?? cfg.decimals ?? 2);
                        let val = parseFloat(cfg.value ?? 0.5);
                        const cMin = parseFloat(cfg.min ?? 0);
                        const cMax = parseFloat(cfg.max ?? 1);

                        if (localX >= btnReg.x + mrg && localX <= btnReg.x + mrg + btnW) {
                            // Left button: decrement
                            val = Math.max(cMin, val - step);
                        } else if (localX >= btnReg.x + btnReg.w - btnW - mrg && localX <= btnReg.x + btnReg.w - mrg) {
                            // Right button: increment
                            val = Math.min(cMax, val + step);
                        } else {
                            // Absorb clicks in margin/gap area (outside track)
                            const trackStart = btnReg.x + mrg + btnW;
                            const trackEnd = btnReg.x + btnReg.w - mrg - btnW;
                            if (localX < trackStart || localX > trackEnd) {
                                if (type === "dragStart") this._btnLRHandledIdx = targetIdx;
                                return true;
                            }
                            // Not a button click, fall through to normal handling
                            val = null;
                        }

                        if (val !== null) {
                            cfg.value = parseFloat(val.toFixed(dec));
                            this.properties.sliderContainer = dataArr;
                            if (this.updateDerpSliderVisualValue) this.updateDerpSliderVisualValue(targetIdx, cfg.value);
                            if (this.broadcastWirelessSignal) this.broadcastWirelessSignal(dataArr);
                            if (type !== "click" && type !== "dblclick" && this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                            this._shouldSync = true;
                            wakeSliderNode(this);
                            if (type === "dragStart") this._btnLRHandledIdx = targetIdx;
                            return true;
                        }
                    }
                }
            }
            if (targetIdx !== null && !isNaN(targetIdx) && (type === "drag" || type === "dragStart" || type === "click" || type === "dblclick")) {
                const reg = regions[`dynamicSlider_${targetIdx}`];
                if (reg && reg.state !== "DIS") {
                    try {
                        const dataArr = this.properties.sliderContainer;
                        const config = dataArr[targetIdx];
                        // Only treat active pointer movement as a drag.
                        // Track/background clicks also enter here as dragStart,
                        // and marking them as dragging suppresses the intended lerp.
                        if (config) config._isDraggingSlider = (type === "drag");
                        const targetKey = `dynamicSlider_${targetIdx}`;
                        if (this._compDataCache?.[targetKey]) {
                            this._compDataCache[targetKey]._isDraggingSlider = (type === "drag");
                        }

                        let valueResult;
                        if (config?.btnLR && type !== "dblclick") {
                            // btnLR mode: track inset with margin, click restricted to fill bar
                            const btnW = Math.round((reg.h || 14) * BTN_LR_RATIO);
                            const mrg = BTN_LR_MARGIN;
                            const trackX = reg.x + mrg + btnW;
                            const trackW = Math.max(0, reg.w - (btnW + mrg) * 2);

                            // Only restrict click (not drag/dragStart) to fill bar area
                            if (type === "click") {
                                const cMin = parseFloat(config.min ?? 0);
                                const cMax = parseFloat(config.max ?? 1);
                                const curVal = parseFloat(config.value ?? 0.5);
                                const fillPercent = Math.max(0, Math.min(1, (curVal - cMin) / (cMax - cMin)));
                                const fillRight = trackX + fillPercent * trackW;
                                if (localX < trackX || localX > fillRight) {
                                    return true;
                                }
                            }
                        }

                        valueResult = resolveSliderValueFromX(reg, config, localX, {
                            useDefault: type === "dblclick",
                            snap: type !== "drag",
                        });
                        config.value = valueResult.value;

                        // THE PERSISTENCE FIX: Explicitly update the node property and rebuild the layout map.
                        // This ensures that the property change is "locked in" and survives the end of the interaction.
                        this.properties.sliderContainer = dataArr;

                        if (this.updateDerpSliderVisualValue) this.updateDerpSliderVisualValue(targetIdx, config.value);
                        if (type === "drag") {
                            this._pendingSliderDraft = { index: targetIdx, value: config.value, ...valueResult };
                            this.setDirtyCanvas?.(true);
                            return true;
                        }

                        this._pendingSliderDraft = null;
                        if (this.broadcastWirelessSignal) {
                            this.broadcastWirelessSignal(dataArr);
                        }

                        // During drag, keep the current component cache hot and defer structural sync until dragEnd.
                        if (type !== "click" && type !== "dblclick" && this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();

                        this._shouldSync = true;
                        wakeSliderNode(this);
                        return true;
                    } catch(e) {}
                }
            }
        }

        if (sliderDragSessionActive && (type === "hover" || type === "move" || type === "drag")) {
            return true;
        }

        if (baseHandleInteraction) return baseHandleInteraction.apply(this, arguments);
        return false;
    };
}
