/**
 * Path: ./js/fatha/nodes/derpLoraStack.js
 * ROLE: UI Layout Maps for derpLoraStack.
 */
import { app } from "../../../../scripts/app.js";
import { showBastaLoraDetail } from "../../fatha/bastas/bastaLoraDetail.js";
import { showBastaMessage } from "../../fatha/bastas/bastaMessage.js";
import { showBastaFileHandler } from "../../fatha/bastas/bastaFileHandler.js";
import { startStackDrag, updateStackDrag, endStackDrag } from "../../fatha/helpers/fathaDragDrop.js";
import { isComfyVueNodesMode } from "../../fatha/core/fathaNode2Compat.js";
import {
    resolveRatingColor,
    buildLoraDetailPayload,
    buildTriggerDropdownItems,
    resolveTriggerDisplayState,
    resolveTriggerSelectionValue,
    isLoraNoTriggerRequired,
    captureLoraFloatingSnapshot,
    estimateLoraDropGapHeight,
    getLoraDisplayName,
} from "./helpers/loraComponents.js";
import { getPreviewImageUrl } from "./helpers/loraImages.js";

const LORA_STACK_CLIP_VISIBLE_LIMIT_ITEMS = ["Auto", "1", "2", "3", "4", "5"];

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

function persistLoraStackSettings(node) {
    if (!node) return;
    if (typeof node.flushDerpLoraStackSysSettings === "function") {
        node.flushDerpLoraStackSysSettings();
    }
    if (node.requestDerpSync) node.requestDerpSync();
    if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
    if (app.graph && typeof app.graph.change === "function") app.graph.change();
}

function flushLoraStackSysSettings(node) {
    if (!node) return;
    const sysState = window.xcpFathaSysState;
    if (!sysState || sysState.hostNode !== node) return;

    const dynamicElements = sysState.dynamicElements || {};
    const clipLimitEl = dynamicElements.dropdownClipVisibleLimit;
    if (clipLimitEl?.value !== undefined) {
        node.properties.loraStackClipVisibleLimit = normalizeLoraStackClipVisibleLimit(clipLimitEl.value);
    }

    const numericFields = [
        ["editorMin", "sliderMin"],
        ["editorMax", "sliderMax"],
        ["editorStep", "sliderStep"],
        ["editorDefault", "sliderDefault"],
        ["editorCLIPMin", "clipMin"],
        ["editorCLIPMax", "clipMax"],
        ["editorCLIPStep", "clipStep"],
        ["editorCLIPDefault", "clipDefault"],
    ];

    numericFields.forEach(([elementKey, propertyKey]) => {
        const el = dynamicElements[elementKey];
        if (!el) return;
        const parsed = parseFloat(el.value);
        if (Number.isFinite(parsed)) {
            node.properties[propertyKey] = parsed;
        }
    });
}

function normalizeLoraStackClipVisibleLimit(value) {
    const raw = String(value ?? "Auto");
    return LORA_STACK_CLIP_VISIBLE_LIMIT_ITEMS.includes(raw) ? raw : "Auto";
}

function getLoraStackClipVisibleLimit(node) {
    return normalizeLoraStackClipVisibleLimit(node?.properties?.loraStackClipVisibleLimit);
}

function getLoraStackNumericClipVisibleLimit(node) {
    const value = getLoraStackClipVisibleLimit(node);
    if (value === "Auto") return null;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : null;
}

function getRegionBottom(reg) {
    if (!reg) return 0;
    const marginB = Array.isArray(reg.margin) ? (reg.margin.length === 4 ? reg.margin[3] : (reg.margin[1] || 0)) : 0;
    return (Number(reg.y) || 0) + (Number(reg.h) || 0) + marginB;
}

function getLoraStackFooterReserve(regions = {}) {
    const footer = regions.footerRegion;
    const systemBtn = regions.systemBtn;
    const footerMin = Number(footer?.minHeight || 0);
    const footerGap = Number(regions.footerGap?.h || 0);
    const systemBtnH = systemBtn ? Math.max(0, getRegionBottom(systemBtn) - (Number(systemBtn.y) || 0)) : 0;
    const footerBody = Math.max(footerMin, footerGap + systemBtnH, 0);
    return footerBody + footerGap;
}

function resolveLoraStackAutoClipHeight(node, region, regions = {}, fullContentHeight = 0) {
    const nodeH = Number(node?.size?.[1] || node?.properties?.nodeSize?.[1] || 0);
    const regionY = Number(region?.y) || 0;
    if (nodeH <= 0 || regionY <= 0) return 0;

    const footer = regions.footerControls || regions.regionWarning;
    const footerH = footer ? Math.max(0, getRegionBottom(footer) - (Number(footer.y) || 0)) : 0;
    const vars = typeof node?.getDerpVars === "function" ? node.getDerpVars(node) : null;
    const viewportGap = Math.max(0, Number(vars?.mH || 0));
    const fathaFooterH = getLoraStackFooterReserve(regions);
    const available = nodeH - regionY - viewportGap - footerH - viewportGap - fathaFooterH;
    if (!Number.isFinite(available) || available <= 0) return 0;
    return fullContentHeight > 0 ? Math.min(available, fullContentHeight) : available;
}

function resolveLoraStackClipHeight(node, region, regions = {}) {
    const explicitHeight = Number(node?.properties?.contentClipHeight ?? node?.properties?.loraStackClipHeight);
    if (Number.isFinite(explicitHeight) && explicitHeight > 0) return explicitHeight;

    const rows = Array.isArray(node?.properties?.stackData) ? node.properties.stackData.length : 0;
    if (rows <= 0) return 0;

    const numericLimit = getLoraStackNumericClipVisibleLimit(node);
    const autoMinimumRows = 1;
    const visibleRows = Math.max(1, Math.min(rows, numericLimit || autoMinimumRows));
    const firstRow = regions.loraRow_0;
    const lastRow = regions[`loraRow_${visibleRows - 1}`];
    if (firstRow && lastRow) {
        const top = Number(firstRow.y) || 0;
        const bottom = getRegionBottom(lastRow);
        if (bottom > top) {
            const measuredHeight = bottom - top;
            if (numericLimit !== null) return measuredHeight;
            const fullLastRow = regions[`loraRow_${rows - 1}`] || lastRow;
            const fullBottom = getRegionBottom(fullLastRow);
            const fullContentHeight = fullBottom > top ? fullBottom - top : measuredHeight;
            const autoHeight = resolveLoraStackAutoClipHeight(node, region, regions, fullContentHeight);
            if (autoHeight > 0) return Math.max(measuredHeight, autoHeight);
            return measuredHeight;
        }
    }

    return Number(region?.h) || 180;
}

function resolveLoraStackMinClipHeight(node, region, regions = {}) {
    const rows = Array.isArray(node?.properties?.stackData) ? node.properties.stackData.length : 0;
    if (rows <= 0) return 0;
    const firstRow = regions.loraRow_0;
    if (firstRow) return Math.max(1, getRegionBottom(firstRow) - (Number(firstRow.y) || 0));
    return Number(region?.h) || 180;
}

function resolveLoraStackOneEntryHeight(node) {
    const regions = node?.layout?.regions || {};
    const header = regions.headerRegion;
    const main = regions.mainContentRegion;
    const row = regions.loraRow_0;
    const footer = regions.footerControls || regions.regionWarning;
    const panel = regions.panelBackground;
    if (!panel || !main || !footer) return 0;

    const top = Number(panel.y) || 0;
    let bottom = 0;
    if (header) bottom = Math.max(bottom, (Number(header.y) || 0) + (Number(header.h) || 0) + (Array.isArray(header.margin) ? (header.margin[3] || header.margin[1] || 0) : 0));
    if (row) bottom = Math.max(bottom, (Number(row.y) || 0) + (Number(row.h) || 0) + (Array.isArray(row.margin) ? (row.margin[3] || row.margin[1] || 0) : 0));
    bottom = Math.max(bottom, (Number(footer.y) || 0) + (Number(footer.h) || 0) + (Array.isArray(footer.margin) ? (footer.margin[3] || footer.margin[1] || 0) : 0));
    return Math.max(0, bottom - top);
}

if (!window._xcp_derpLoraStack_Layout_Loaded) {
    window._xcp_derpLoraStack_Layout_Loaded = true;
    try {
        app.registerExtension({
            name: "xcp.derpLoraStack_Layout",
            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (!nodeData.name.toLowerCase().includes("derplorastack")) return;

                nodeType.prototype.onResize = function(size) {
                    const storedW = Number(this.properties?.nodeSize?.[0]) || 0;
                    const nextW = Number(size?.[0]) || storedW;
                    const nextH = Number(size?.[1]) || Number(this.properties?.nodeSize?.[1]) || 0;
                    const preserveNode2ManualWidth = isComfyVueNodesMode()
                        && this.properties?.autoWidth === false
                        && this._isDerpResizing !== true
                        && storedW > 0;
                    const resolvedW = preserveNode2ManualWidth ? storedW : nextW;

                    this.properties.nodeSize = [resolvedW, nextH];
                    if (preserveNode2ManualWidth && Array.isArray(this.size)) this.size[0] = resolvedW;
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                };

                nodeType.prototype.flushDerpLoraStackSysSettings = function() {
                    flushLoraStackSysSettings(this);
                };

                nodeType.prototype.resolveLoraStackOneEntryHeight = function() {
                    return resolveLoraStackOneEntryHeight(this);
                };

                const onNodeCreated = nodeType.prototype.onNodeCreated;
                nodeType.prototype.onNodeCreated = function () {
                    if (onNodeCreated) onNodeCreated.apply(this, arguments);
                };

                nodeType.prototype.toggleLoraEntryBypass = function(index) {
                    const currentStack = Array.isArray(this.properties.stackData) ? this.properties.stackData : [];
                    if (!Number.isInteger(index) || index < 0 || index >= currentStack.length) return;
                    const nextStack = currentStack.map((entry, idx) => {
                        if (idx !== index || !Array.isArray(entry)) return entry;
                        const nextEntry = [...entry];
                        nextEntry[5] = !nextEntry[5];
                        return nextEntry;
                    });
                    this.properties.stackData = nextStack;
                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                    this.refreshNodeLayoutMap();
                };

                // --- MAIN UI LAYOUT (NODE FACE) ---
                nodeType.prototype.refreshNodeLayoutMap = function() {
                    // ZERO-INFERENCE OPTIMIZATION: Precision Jitter Lock (toFixed 2) to block zoom-coordinate drift
                    const vars = this.getDerpVars(this);
                    const [mW, mH, oY, pW, pH, sH, sW] = [
                        vars.mW, vars.mH, vars.oY, vars.pW, vars.pH, vars.sH, vars.sW
                    ].map(v => Number(v.toFixed(2)));
                    const { t_textNormal_size, t_textSmall_size } = vars;

                    const stack = this.properties.stackData || [];
                    const signalIds = this.properties.multiSignalIds || {};
                    const globalSignals = window.xcpDerpSignals || {};
                    const resolveActiveSignalId = (rawId) => {
                        if (!rawId) return null;
                        const directId = String(rawId);
                        if (globalSignals[directId]) return directId;
                        const baseId = directId.split(":")[0];
                        if (globalSignals[baseId]) return baseId;
                        return null;
                    };
                    const modelSignalId = resolveActiveSignalId(signalIds[0] || signalIds["0"] || null);
                    const clipSignalId = resolveActiveSignalId(signalIds[1] || signalIds["1"] || null);
                    const isJointAttention = this.properties.attentionMode === "Joint-Attention";
                    const hasRequiredSignals = isJointAttention ? !!modelSignalId : (!!modelSignalId && !!clipSignalId);
                    if (this._dragTrig && this._dragThresholdMet && Number.isInteger(this._dragTrig.index) && this.layout?.regions) {
                        const dragRowKey = `loraRow_${this._dragTrig.index}`;
                        if (!this._loraFloatingSnapshot || this._loraFloatingSnapshot.rowKey !== dragRowKey) {
                            this._loraFloatingSnapshot = captureLoraFloatingSnapshot(this, dragRowKey);
                        }
                    } else {
                        this._loraFloatingSnapshot = null;
                    }
                    const nameDisplay = this.properties.nameDisplay || "Top";
                    const bastaId = "basta_lora_detail_global_unique_id";
                    const bObj = window.xcpActiveBastas?.get(bastaId);
                    const activeSlot = (bObj?.hostNode === this && !bObj.isClosing) ? (bObj._loraData?.slotIndex ?? this._activeDetailSlot ?? -1) : -1;
                    const toggleLoraDetail = (slotIdx, targetKey, loraEntry) => {
                        const liveBasta = window.xcpActiveBastas?.get(bastaId);
                        const liveActiveSlot = (liveBasta?.hostNode === this && !liveBasta.isClosing)
                            ? (liveBasta._loraData?.slotIndex ?? this._activeDetailSlot ?? -1)
                            : -1;

                        if (liveActiveSlot === slotIdx) {
                            this._activeDetailSlot = null;
                            if (liveBasta && liveBasta.hostNode === this) liveBasta.close();
                            if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                            if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                            return;
                        }

                        this._activeDetailSlot = slotIdx;
                        showBastaLoraDetail(this, targetKey, buildLoraDetailPayload(this, loraEntry, slotIdx));
                    };
                    const trigHash = stack.map(l => (this._loraTriggerArrayCache?.[l[0]] || []).length).join('|');
                    const signalSelectionHash = `${modelSignalId || ""}_${clipSignalId || ""}`;

                    const dragIdxHash = (this._dragTrig) ? `drag_${this._dragTrig.index}_${this._dragThresholdMet}_${this._dropPreviewIdx}` : "no-drag";
                    const clipVisibleLimit = getLoraStackClipVisibleLimit(this);
                    const numericClipLimit = getLoraStackNumericClipVisibleLimit(this);
                    const useEntryViewport = this.properties.loraStackClipEntries === true || (numericClipLimit !== null ? stack.length > numericClipLimit : stack.length > 1);
                    const structureHash = `${stack.length}_${stack.map(l => `${l[0]}_${l[5]}`).join('|')}_${trigHash}_${this.properties.nameDisplay}_${this.properties.showCLIP}_${this.properties.attentionMode}_${this.properties.toggleLR}_${signalSelectionHash}_${window._xcpDerpSession}_${activeSlot}_${mW}_${mH}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${(this.size?.[1] || 0).toFixed(2)}_${dragIdxHash}_${useEntryViewport ? 1 : 0}_${clipVisibleLimit}`;

                    // ZERO-INFERENCE VALUE GATE: Block redundant property hydration on idle nodes
                    // Hover already has a dedicated visual invalidation path in Fatha.
                    // Keeping it out of the stack value hash prevents idle hover-key jitter
                    // from re-triggering value hydration and passive whole-wall cache churn.
                    const valueHash = stack.map(l => `${l[1]}_${l[2]}_${l[3]}_${l[4]}_${l[5]}_${l[6]}_${isLoraNoTriggerRequired(l) ? 1 : 0}`).join('|') + `_${this.mode}_${signalSelectionHash}`;

                    // SYNCHRONIZED CACHE CHECK
                    if (this._layoutMapHash === structureHash && this.layoutMap) {
                        if (this._lastStackValues === valueHash) {
                            return;
                        }
                        this._lastStackValues = valueHash;

                        // RE-HYDRATE VISUALS: Update icons, colors, and animations in-place on the cached structure
                        stack.forEach((lora, i) => {
                            const loraRow = this.layoutMap.mainContentRegion?.loraEntriesRegion?.[`loraRow_${i}`] || this.layoutMap.mainContentRegion?.[`loraRow_${i}`];
                            if (loraRow) {
                                // THE BYPASS SYNC: Detect if the entire node (mode 2/4, properties, or bypass widget) or just this LoRA entry is bypassed
                                const nodeBypassed = this.mode === 2 || this.mode === 4 || this.properties.isBypassed || (this.widgets && this.widgets[0] && this.widgets[0].value === "bypass");
                                const rowBypassed = !!lora[5];
                                const isBypassed = rowBypassed || nodeBypassed;
                                const isDragged = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === i);
                                const isSelected = (activeSlot !== -1 && i === activeSlot);
                                if (activeSlot === -1 && this._colorAnimCache) {
                                    delete this._colorAnimCache[`_derpRegion_anim_loraRow_${i}`];
                                }

                                // THE REGION STATE LOGIC: Selection (ON) > Bypass (DIS) > Idle (OFF)
                                loraRow.state = isSelected ? "ON" : (isBypassed ? "DIS" : "OFF");
                                loraRow.alpha = isDragged ? 0 : 1;

                                const rating = parseInt(this._loraRatings?.[lora[0]] || 0, 10);
                                const ratingColor = resolveRatingColor(this, lora[0], isSelected, isBypassed);

                                const preview = loraRow[`loraPreview_${i}`];
                                if (preview) {
                                    preview.borderColor = ratingColor;
                                    preview.alpha = isDragged ? 0 : (isBypassed ? 0.5 : 1.0);
                                    preview.state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                    preview.grayscale = isBypassed;
                                    preview.imageUrl = (lora[0] && this._loraPreviewList?.includes(lora[0])) ? getPreviewImageUrl(lora[0], true) : null;
                                    const rIcon = preview[`loraRating_${i}`];
                                    if (rIcon) {
                                        rIcon.hidden = (rating === 0);
                                        rIcon.alpha = isDragged ? 0 : 1;
                                        rIcon.iconIndex = rating;
                                        rIcon.key = `loraRating_${lora[0]}`;
                                        rIcon.state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                        rIcon.labelColor = ratingColor;
                                        rIcon.skipBackground = true;
                                    }
                                }

                                const loraMid = loraRow[`loraMiddle_${i}`];
                                if (loraMid) {
                                    const topRow = loraMid[`topRow_${i}`];
                                    if (topRow) {
                                        const useAnim = this.properties.useAnimations !== false && window.xcpDerpSettings?.useAnimations !== false;
                                        if (topRow[`btnEnable_${i}`]) topRow[`btnEnable_${i}`].state = nodeBypassed ? "DIS" : (!rowBypassed ? "ON" : "OFF");
                                        if (topRow[`lblLoraNameTop_${i}`]) {
                                            topRow[`lblLoraNameTop_${i}`].state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                        }
                                        // THE CACHE PRESERVATION FIX: Prevent resetting the layout cache during pure visual hydration
                                    }
                                    const modelRow = loraMid[`modelRow_${i}`];
                                    if (modelRow) {
                                        if (modelRow[`btnEnableLeft_${i}`]) modelRow[`btnEnableLeft_${i}`].state = nodeBypassed ? "DIS" : (!rowBypassed ? "ON" : "OFF");
                                        if (modelRow[`sldModel_${i}`]) {
                                            modelRow[`sldModel_${i}`].value = lora[1];
                                            modelRow[`sldModel_${i}`].state = isBypassed ? "DIS" : "OFF";
                                            modelRow[`sldModel_${i}`].min = this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.sliderMin ?? -2.0;
                                            modelRow[`sldModel_${i}`].max = this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.sliderMax ?? 2.0;
                                            modelRow[`sldModel_${i}`].step = this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.sliderStep ?? 0.05;
                                        }
                                        if (modelRow[`valModel_${i}`]) {
                                            const mVal = parseFloat(lora[1] ?? 1.0).toFixed(2);
                                            modelRow[`valModel_${i}`].text = mVal;
                                            modelRow[`valModel_${i}`].value = mVal;
                                            modelRow[`valModel_${i}`].state = isBypassed ? "DIS" : "OFF";
                                        }
                                    }
                                    const clipRow = loraMid[`clipRow_${i}`];
                                    if (clipRow) {
                                        if (clipRow[`sldClip_${i}`]) {
                                            clipRow[`sldClip_${i}`].value = lora[2];
                                            clipRow[`sldClip_${i}`].state = isBypassed ? "DIS" : "OFF";
                                            clipRow[`sldClip_${i}`].min = this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.clipMin ?? -2.0;
                                            clipRow[`sldClip_${i}`].max = this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.clipMax ?? 2.0;
                                            clipRow[`sldClip_${i}`].step = this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.clipStep ?? 0.05;
                                        }
                                        if (clipRow[`valClip_${i}`]) {
                                            const cVal = parseFloat(lora[2] ?? 1.0).toFixed(2);
                                            clipRow[`valClip_${i}`].text = cVal;
                                            clipRow[`valClip_${i}`].value = cVal;
                                            clipRow[`valClip_${i}`].state = isBypassed ? "DIS" : "OFF";
                                        }
                                    }
                                    const trigRow = loraMid[`triggerRow_${i}`];
                                    if (trigRow) {
                                        const matched = (this._loraTriggerArrayCache?.[lora[0]] || []).find(t => t.key === lora[3]);

                                        if (trigRow[`dropTrigger_${i}`]) {
                                            const widget = trigRow[`dropTrigger_${i}`];
                                            const noTriggerRequired = isLoraNoTriggerRequired(lora);
                                            const triggerNoneText = noTriggerRequired
                                                ? tLocale("$derp_lora_stack.trigger.no_trigger_required", "LoRA requires no trigger")
                                                : tLocale("$derp_lora_stack.trigger.none", "None");
                                            const displayState = resolveTriggerDisplayState(lora[0], this._loraTriggerArrayCache?.[lora[0]] || [], lora[3], lora[4], triggerNoneText);
                                            widget.value = matched ? matched.key : (lora[3] || "None");
                                            widget.text = displayState.text;
                                            widget.display = displayState.text;
                                            widget.imageUrl = displayState.imageUrl;
                                            widget.label = displayState.label;
                                            widget.items = buildTriggerDropdownItems(lora[0], this._loraTriggerArrayCache?.[lora[0]] || [], triggerNoneText);
                                            widget.state = (isBypassed || !(this._loraTriggerArrayCache?.[lora[0]] || []).length) ? "DIS" : (isSelected ? "ON" : "OFF");
                                        }
                                        if (trigRow[`toggleFuseQKV_${i}`]) {
                                            trigRow[`toggleFuseQKV_${i}`].state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                            trigRow[`toggleFuseQKV_${i}`].value = !!lora[6];
                                            trigRow[`toggleFuseQKV_${i}`].hidden = nameDisplay !== "Top" || this.properties.attentionMode !== "Joint-Attention";
                                        }
                                    }
                                }
                            }
                        });
                        this.requestDerpSync();
                        return;
                    }
                    this._layoutMapHash = structureHash;
                    const glyphSizeOffset = 2;

                    const detailBastaId = "basta_lora_detail_global_unique_id";
                    const isDetailOpen = !!(window.xcpActiveBastas?.get(detailBastaId)?.hostNode === this);
                    if (!isDetailOpen) this._activeDetailSlot = -1;

                    const dropGapHeight = estimateLoraDropGapHeight(this, "loraRow_");
                    const dropGapWithTrailingSeparatorHeight = dropGapHeight + 1 + mH + oY;

                    const isDragPreviewActive = !!(this._dragTrig && this._dragThresholdMet);
                    const dragIdx = this._dragTrig?.index;
                    const rawDropIdx = this._dropPreviewIdx;
                    const stableCount = stack.length - (isDragPreviewActive ? 1 : 0);
                    const hasPreviewIndex = Number.isInteger(rawDropIdx);
                    const dropIdx = hasPreviewIndex ? Math.max(0, Math.min(rawDropIdx, Math.max(0, stableCount))) : null;
                    const hasEffectiveDropTarget = isDragPreviewActive && Number.isInteger(dragIdx) && hasPreviewIndex;
                    const draggedRowWasTail = isDragPreviewActive && dragIdx === stack.length - 1;

                    let lastVisibleRowKey = null;
                    let draggedRowAnchorKey = null;

                    const stackRows = stack.reduce((acc, lora, i) => {
                        let prev = lastVisibleRowKey;
                        const loraName = getLoraDisplayName(lora[0]);
                        // THE BYPASS SYNC: Detect if the entire node (mode 2/4, properties, or bypass widget) or just this LoRA entry is bypassed
                        const nodeBypassed = this.mode === 2 || this.mode === 4 || this.properties.isBypassed || (this.widgets && this.widgets[0] && this.widgets[0].value === "bypass");
                        const rowBypassed = !!lora[5];
                        const isBypassed = rowBypassed || nodeBypassed;
                        const isDragged = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === i);

                        if (prev) {
                            acc[`loraSep_${i}`] = {
                                anchor: { target: prev, axis: "y", offset: oY },
                                type: this.UI_TYPES.LINEBREAK, width: "full", height: 1, margin: [-mW, 0, -mW, mH],
                            };
                            prev = `loraSep_${i}`;
                        }

                        // THE DROP PREVIEW GAP: Render an explicit empty slot where the item would be dropped.
                        // We attach it before the row currently occupying that visual index.
                        let visualPos = i;
                        if (isDragPreviewActive && Number.isInteger(dragIdx)) {
                            if (i > dragIdx) visualPos -= 1;
                            if (i === dragIdx) visualPos = -1;
                        }

                        const shouldPlaceGapBeforeThisRow = hasEffectiveDropTarget && visualPos === dropIdx;
                        if (shouldPlaceGapBeforeThisRow) {
                            const gapKey = `loraDropPreview_${i}`;
                            acc[gapKey] = {
                                anchor: prev ? { target: prev, axis: "y", offset: oY } : null,
                                type: this.UI_TYPES.REGION,
                                themeKey: "region",
                                state: "OFF",
                                hoverEffect: false,
                                alpha: 0.18,
                                dir: "row",
                                width: "full",
                                height: dropGapWithTrailingSeparatorHeight,
                                margin: [mW * 2, 0, mW * 2, mH],
                                regionOffset: [mW, 2, mW, 2],
                                dropPreviewGhost: {
                                    type: this.UI_TYPES.TEXT,
                                    text: tLocale("$derp_lora_stack.drop_here", "Drop here"),
                                    themeKey: "t_textSmall",
                                    state: "OFF",
                                    alpha: 0.55,
                                    width: "full",
                                    height: "fill",
                                    padding: [pW, pH],
                                    labelAlign: ["center", "middle"]
                                }
                            };
                            prev = gapKey;
                        }

                        if (isDragged) {
                            draggedRowAnchorKey = prev || lastVisibleRowKey;
                            return acc;
                        }

                        const isSelected = (i === activeSlot);
                        const noTriggerRequired = isLoraNoTriggerRequired(lora);
                        const triggerNoneText = noTriggerRequired
                            ? tLocale("$derp_lora_stack.trigger.no_trigger_required", "LoRA requires no trigger")
                            : tLocale("$derp_lora_stack.trigger.none", "None");
                        const rating = parseInt(this._loraRatings?.[lora[0]] || 0, 10);
                        const ratingColor = resolveRatingColor(this, lora[0], isSelected, isBypassed);
                        let previewBorder = ratingColor;

                        const rowAlpha = isDragged ? 0 : 1;
                        const previewAlpha = isDragged ? 0 : (isBypassed ? 0.5 : 1.0);

                        acc[`loraRow_${i}`] = {
                            type: this.UI_TYPES.REGION, themeKey: "region", regionOffset: [mW, 2, mW, 2],
                            state: (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                            alpha: rowAlpha,
                            anchor: prev ? { target: prev, axis: "y", offset: oY  } : null,
                            dir: "row", width: "full", height: "auto",
                            hoverEffect: false,
                            margin: [mW * 2, 0, mW * 2, mH],
                            onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                            onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                            onDragEnd: () => endStackDrag(this, "stackData"),
                            onPress: isSelected ? (() => toggleLoraDetail(i, `loraPreview_${i}`, lora)) : undefined,
                                [`loraPreview_${i}`]: {
                                    hidden: false,
                                    isThumbnail: true, // THE CACHE OPTIMIZATION: Use THUMBNAIL_LONG_SIDE_TARGET for stack images
                                    type: this.UI_TYPES.IMAGE_HTML,
                                    placeholderShrinkToFit: true,
                                    placeholderPadX: sW,
                                    borderColor: resolveRatingColor(this, lora[0], isSelected, isBypassed),
                                    imageUrl: (lora[0] && this._loraPreviewList?.includes(lora[0])) ? getPreviewImageUrl(lora[0], true) : null,
                                    btnColor: "rgba(0,0,0,0.2)",
                                alpha: previewAlpha,
                                state: (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                allowDragWhenDisabled: isBypassed,
                                dragProxyKey: `loraRow_${i}`,
                                grayscale: isBypassed, margin: [-mW * 2 + sW, 0, 0, 0],
                                width: "match", height: "fill", spacing: [ 4 , 0],
                                toolTip: tLocale("$derp_lora_stack.tooltips.preview_image", "Click on the preview image for more Lora control options"),
                                onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                                onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                                onDragEnd: () => endStackDrag(this, "stackData"),
                                onPress: () => toggleLoraDetail(i, `loraPreview_${i}`, lora),
                                [`loraRating_${i}`]: {
                                    hidden: rating === 0,
                                    type: this.UI_TYPES.ICONBUTTON, themeKey: "t_textNormal",
                                    skipBackground: true,
                                    key: `loraRating_${lora[0]}`,
                                    icon: "ratingGlyph", iconIndex: rating,
                                    btnColor: "transparent",
                                    alpha: rowAlpha,
                                    labelColor: resolveRatingColor(this, lora[0], isSelected, isBypassed),
                                    width: "auto", height: "auto",
                                    fontSize: (t_textNormal_size || 12) + glyphSizeOffset,
                                    state: (i === this._activeDetailSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                    margin: [0, -1, 0, 0], padding: [0, 0],
                                    objectAlign: ["left", "top"], labelAlign: ["left", "top"]
                                }
                            },
                            [`loraMiddle_${i}`]: {
                                alpha: rowAlpha,
                                dir: "col", width: "full", height: "auto", spacing: [0, sH], margin: [0, 0, -mW, 0],
                                minWidth: 10,
                                [`topRow_${i}`]: {
                                    alpha: rowAlpha,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                    margin: [0, 0, -mW + sW, 0],
                                    [`lblLoraNameTop_${i}`]: {
                                        hidden: nameDisplay !== "Top",
                                        type: this.UI_TYPES.TEXT, themeKey: "t_textNormal",
                                        text: loraName, width: "full", mouseOver: false,
                                        displayMode: "cutoff", alpha: rowAlpha, spacing: [sW, 0],
                                        state: (i === this._activeDetailSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                        allowDragWhenDisabled: isBypassed,
                                        dragProxyKey: `loraRow_${i}`,
                                        onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                                        onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                                        onDragEnd: () => endStackDrag(this, "stackData"),
                                        onPress: () => toggleLoraDetail(i, `lblLoraNameTop_${i}`, lora)
                                    },
                                    [`btnEnable_${i}`]: {
                                        hidden: nameDisplay !== "Top",
                                        type: this.UI_TYPES.ICONBUTTON, icon: "power", themeKey: "button, t_textNormal", mouseOver: false,
                                        width: "match", height: "fill", spacing: [sW, 0], alpha: rowAlpha,
                                        state: nodeBypassed ? "DIS" : (!rowBypassed ? "ON" : "OFF"),
                                        playSound: rowBypassed ? "powerUp" : "powerDown",
                                        onPress: () => {
                                            if (nodeBypassed) return;
                                            this.toggleLoraEntryBypass(i);
                                        }
                                    },
                                    [`btnRemoveTop_${i}`]: {
                                        hidden: nameDisplay !== "Top", mouseOver: false,
                                        type: this.UI_TYPES.ICONBUTTON, icon: "close", themeKey: "button, t_textSystem",
                                        width: "match", height: "fill",
                                        spacing: [sW, 0], alpha: rowAlpha,
                                        playSound: "delete",
                                        state: "OFF",
                                        onPress: () => {
                                            const loraName = this.properties.stackData[i]?.[0] || "";
                                            const loraDisplay = loraName.split(/[\\/]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "");
                                            showBastaFileHandler(this, "none", `btnRemoveTop_${i}`, {
                                                title: tLocale("$derp_lora_stack.dialogs.remove_lora.title", "Remove LoRA"),
                                                message: `${tLocale("$derp_lora_stack.dialogs.remove_lora.message_prefix", "Remove")} ${loraDisplay} ${tLocale("$derp_lora_stack.dialogs.remove_lora.message_suffix", "from stack?")}`,
                                                confirm: tLocale("$derp_lora_stack.dialogs.remove_lora.confirm", "Remove"),
                                                mode: "delete",
                                                playSound: "delete",
                                                onConfirm: () => {
                                                    const bId = "basta_lora_detail_global_unique_id";
                                                    if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();
                                                    const currentStack = [...this.properties.stackData];
                                                    currentStack.splice(i, 1);
                                                    this.properties.stackData = currentStack;
                                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                                    this.refreshNodeLayoutMap();
                                                    if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
                                                }
                                            });
                                        }
                                    }
                                },
                                [`modelRow_${i}`]: {
                                    alpha: rowAlpha,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH], margin: [0, 0, -mW + sW, 0],
                                    [`sldModel_${i}`]: {
                                        type: this.UI_TYPES.SLIDER, style: "knob", mouseOver: false,
                                        text: nameDisplay === "Slider" ? loraName : "",
                                        padding: [pW, pH], fillPadding: [1, 1], fillbarHeight: .5,
                                        displayMode: "cutoff", alpha: rowAlpha,
                                        measureText: nameDisplay === "Slider" ? loraName : tLocale("$derp_lora_stack.labels.strength", "Strength"),
                                        value: lora[1],
                                        min: this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.sliderMin ?? -2.0,
                                        max: this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.sliderMax ?? 2.0,
                                        step: this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.sliderStep ?? 0.05,
                                        btnLR: this.properties.toggleLR ?? false,
                                        state: isBypassed ? "DIS" : "OFF",
                                        allowDragWhenDisabled: isBypassed,
                                        dragProxyKey: `loraRow_${i}`,
                                        onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                                        onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                                        onDragEnd: () => endStackDrag(this, "stackData"),
                                        width: "full", height: "auto", themeKey: "panel, button, t_textSmall", labelAlign: ["center", "middle"], spacing: [sW, 0]
                                    },
                                    [`valModel_${i}`]: {
                                        type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textSmall", labelAlign: ["center", "middle"],
                                        text: parseFloat(lora[1] ?? 1.0).toFixed(2), measureText: "-9.99",
                                        state: isBypassed ? "DIS" : "OFF", mouseOver: false, alpha: rowAlpha,
                                        width: "auto", height: "fill", padding: [pW, 0], spacing: [sW, 0],
                                        onBlur: (v) => {
                                            const val = parseFloat(v);
                                            if (!isNaN(val)) { lora[1] = val; if (this.syncDerpOutputs) this.syncDerpOutputs(); this.refreshNodeLayoutMap(); }
                                        }
                                    },
                                    [`btnEnableLeft_${i}`]: {
                                        hidden: nameDisplay !== "Slider",
                                        type: this.UI_TYPES.ICONBUTTON, icon: "power", themeKey: "button, t_textNormal", mouseOver: false,
                                        width: "match", height: "fill", spacing: [sW, 0], alpha: rowAlpha,
                                        state: nodeBypassed ? "DIS" : (!rowBypassed ? "ON" : "OFF"),
                                        playSound: rowBypassed ? "powerUp" : "powerDown",
                                        onPress: () => {
                                            if (nodeBypassed) return;
                                            this.toggleLoraEntryBypass(i);
                                        }
                                    },
                                    [`btnRemoveSlider_${i}`]: {
                                        hidden: nameDisplay !== "Slider", mouseOver: false,
                                        type: this.UI_TYPES.ICONBUTTON, icon: "close", themeKey: "button, t_textSystem",
                                        width: "match", height: "fill", spacing: [sW, 0], alpha: rowAlpha,
                                        playSound: "delete",
                                        state: "OFF",
                                        onPress: () => {
                                            const loraName = this.properties.stackData[i]?.[0] || "";
                                            const loraDisplay = loraName.split(/[\\/]/).pop().replace(/\.(safetensors|pt|ckpt)$/i, "");
                                            showBastaFileHandler(this, "none", `btnRemoveSlider_${i}`, {
                                                title: tLocale("$derp_lora_stack.dialogs.remove_lora.title", "Remove LoRA"),
                                                message: `${tLocale("$derp_lora_stack.dialogs.remove_lora.message_prefix", "Remove")} ${loraDisplay} ${tLocale("$derp_lora_stack.dialogs.remove_lora.message_suffix", "from stack?")}`,
                                                confirm: tLocale("$derp_lora_stack.dialogs.remove_lora.confirm", "Remove"),
                                                mode: "delete",
                                                playSound: "delete",
                                                onConfirm: () => {
                                                    const bId = "basta_lora_detail_global_unique_id";
                                                    if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();
                                                    const currentStack = [...this.properties.stackData];
                                                    currentStack.splice(i, 1);
                                                    this.properties.stackData = currentStack;
                                                    if (this.syncDerpOutputs) this.syncDerpOutputs();
                                                    this.refreshNodeLayoutMap();
                                                    if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
                                                }
                                            });
                                        }
                                    }
                                },
                                [`clipRow_${i}`]: {
                                    hidden: this.properties.attentionMode === "Joint-Attention" || this.properties.showCLIP === false,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH], alpha: rowAlpha, margin: [0, 0, -mW + sW, 0],
                                    [`sldClip_${i}`]: {
                                        type: this.UI_TYPES.SLIDER, style: "knob", mouseOver: false,
                                        text: tLocale("$derp_lora_stack.labels.clip", "Clip"), padding: [pW, pH], fillPadding: [1, 1], fillbarHeight: 8,
                                        displayMode: "cutoff", alpha: rowAlpha,
                                        measureText: tLocale("$derp_lora_stack.labels.clip", "Clip"),
                                        value: lora[2],
                                        min: this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.clipMin ?? -2.0,
                                        max: this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.clipMax ?? 2.0,
                                        step: this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.clipStep ?? 0.05,
                                        btnLR: this.properties.toggleLR ?? false,
                                        state: isBypassed ? "DIS" : "OFF",
                                        allowDragWhenDisabled: isBypassed,
                                        dragProxyKey: `loraRow_${i}`,
                                        onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                                        onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                                        onDragEnd: () => endStackDrag(this, "stackData"),
                                        width: "full", height: "auto", themeKey: "panel, button, t_textSmall", labelAlign: ["center", "middle"], spacing: [sW, 0]
                                    },
                                    [`valClip_${i}`]: {
                                        type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textSmall", labelAlign: ["center", "middle"],
                                        text: parseFloat(lora[2] ?? 1.0).toFixed(2), measureText: "-9.99",
                                        state: isBypassed ? "DIS" : "OFF", alpha: rowAlpha,
                                        width: "auto", height: "fill", padding: [pW, 0], spacing: [0, 0],
                                        onBlur: (v) => {
                                            const val = parseFloat(v);
                                            if (!isNaN(val)) { lora[2] = val; if (this.syncDerpOutputs) this.syncDerpOutputs(); this.refreshNodeLayoutMap(); }
                                        }
                                    }
                                },
                                [`triggerRow_${i}`]: {
                                    dir: "row", width: "full", height: "auto", spacing: [sW, 0], alpha: rowAlpha, margin: [0, 0, -mW + sW, 0],
                                    [`dropTrigger_${i}`]: {
                                        type: this.UI_TYPES.FILEBROWSER,
                                        icon: "dropdown",
                                        themeKey: "dialog, t_textSmall",
                                        canvasShield: true, width: "full", height: "auto", padding: [pW, pH], alpha: rowAlpha,
                                        state: (isBypassed || !(this._loraTriggerArrayCache?.[lora[0]] || []).length) ? "DIS" : (isSelected ? "ON" : "OFF"),
                                        mouseOver: false,
                                        mode: "file",
                                        rootName: "triggers",
                                        onDragStart: (e, data) => startStackDrag(this, data, i, `loraRow_${i}`),
                                        onDrag: (e, data) => { updateStackDrag(this, data, "loraRow_", stack.length); },
                                        onDragEnd: () => endStackDrag(this, "stackData"),
                                        items: buildTriggerDropdownItems(lora[0], this._loraTriggerArrayCache?.[lora[0]] || [], triggerNoneText),
                                        ...resolveTriggerDisplayState(
                                            lora[0],
                                            this._loraTriggerArrayCache?.[lora[0]] || [],
                                            lora[3],
                                            lora[4],
                                            triggerNoneText
                                        ),
                                        displayMode: "cutoff",
                                        onChange: (v) => {
                                            if (!v || v === "None") {
                                                lora[3] = "None";
                                                lora[4] = "";
                                            } else {
                                                const triggers = this._loraTriggerArrayCache?.[lora[0]] || [];
                                                const entry = resolveTriggerSelectionValue(triggers, v);

                                                lora[3] = entry ? entry.key : "None";
                                                lora[4] = entry ? entry.tag : "";
                                            }

                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    },
                                    [`toggleFuseQKV_${i}`]: {
                                        hidden: nameDisplay !== "Top" || this.properties.attentionMode !== "Joint-Attention",
                                        type: this.UI_TYPES.TOGGLE_V2, themeKey: "panel, button, t_textSmall",
                                        label: tLocale("$derp_lora_stack.fuse_qkv", "Fuse QKV"), icon: "ring", width: "auto", height: "match", padding: [pW, pH], spacing: [0, 0], margin: [0, 0, -mH, 0],
                                        isTextOnly: true, mouseOver: false, alpha: rowAlpha,
                                        state: (i === this._activeDetailSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                        toolTip: tLocale("$derp_lora_stack.tooltips.fuse_qkv", "{{t_toolTip_highlight::ZIT}} lora patch, may (or may not) fix undesired results or improve the output. Made by {{t_toolTip_Accent::Capitan01R@civitai.com}}"),
                                        value: !!lora[6],
                                        onPress: () => {
                                            lora[6] = !lora[6];
                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    }
                                }
                            }
                        };

                        if (!isDragged) lastVisibleRowKey = `loraRow_${i}`;

                        return acc;
                    }, {});

                    const hasTailDropPreview = hasEffectiveDropTarget && dropIdx === stableCount;
                    if (hasTailDropPreview) {
                        const tailPreviewAnchorKey = draggedRowWasTail ? (draggedRowAnchorKey || lastVisibleRowKey) : lastVisibleRowKey;
                        stackRows.loraDropPreview_tail = {
                            anchor: tailPreviewAnchorKey ? { target: tailPreviewAnchorKey, axis: "y", offset: oY } : null,
                            type: this.UI_TYPES.REGION,
                            themeKey: "region",
                            state: "OFF",
                            hoverEffect: false,
                            alpha: 0.22,
                            dir: "row",
                            width: "full",
                            height: draggedRowWasTail ? dropGapHeight : dropGapWithTrailingSeparatorHeight,
                            margin: [mW * 2, 0, mW * 2, mH],
                            regionOffset: [mW, 2, mW, 2],
                            dropPreviewGhost: {
                                type: this.UI_TYPES.TEXT,
                                text: tLocale("$derp_lora_stack.drop_here", "Drop here"),
                                themeKey: "t_textSmall",
                                state: "OFF",
                                alpha: 0.65,
                                width: "full",
                                height: "fill",
                                padding: [pW, pH],
                                labelAlign: ["center", "middle"]
                            }
                        };
                    }

                    this.layoutMap = {
                        mainContentRegion: {
                            anchor: { target: "headerRegion", axis: "y", offset: oY },
                            // THE MARGIN FIX: Remove internal padding and use mW margin to align with header buttons
                            width: "full", height: "auto", dir: "col",
                            margin: [mW, mH, mW, 0],
                            loraEntriesRegion: {
                                scrollViewport: useEntryViewport,
                                clipHeight: resolveLoraStackClipHeight,
                                minClipHeight: resolveLoraStackMinClipHeight,
                                width: "full", height: "auto", dir: "col",
                                margin: [0, 0, 0, 0],
                                ...stackRows,
                            },
                            footerControls: {
                                anchor: {
                                    target: "loraEntriesRegion",
                                    axis: "y",
                                    offset: sH
                                },
                                contentViewportClip: false,
                                hidden: !hasRequiredSignals,
                                dir: "row", width: "full", height: "auto", spacing: [0, 0],
                                margin: [0, mH, 0, mH],
                                btnClear: {
                                    type: this.UI_TYPES.BUTTON,
                                    text: "Clear",
                                    corners: [3, 0, 0, 3],
                                    width: "auto", height: "fill", padding: [pW, pH],
                                    labelAlign: ["center", "middle"],
                                    state: stack.length > 0 ? "OFF" : "DIS",
                                    pulseStates: true,
                                    themeKey: "button, t_textSmall",
                                    onPress: () => {
                                        showBastaFileHandler(this, "none", "btnClear", {
                                            title: tLocale("$derp_lora_stack.dialogs.clear_deck.title", "Clear LoRA Stack"),
                                            message: tLocale("$derp_lora_stack.dialogs.clear_deck.message", "Clear the LoRA stack?"),
                                            confirm: tLocale("$derp_lora_stack.dialogs.clear_deck.confirm", "Clear"),
                                            mode: "delete",
                                            playSound: "delete",
                                            properties: { bastaMovalbe: false },
                                            onConfirm: () => {
                                                const bId = "basta_lora_detail_global_unique_id";
                                                if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();
                                                this.properties.stackData = [];
                                                if (this.syncDerpOutputs) this.syncDerpOutputs();
                                                this.refreshNodeLayoutMap();
                                                if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
                                            }
                                        });
                                    }
                                },
                                loraSelector: {
                                    type: this.UI_TYPES.FILEBROWSER, items: this._loraList || [],
                                    corners: [0, 0, 0, 0],
                                    mode: "file", mouseOver: false, searchTab: true,
                                    rootName: "loras", skipBackground: true,
                                    previewList: this._loraPreviewList,
                                    ratingsList: this._loraRatings || {}, // THE RATING PASS: Provide the node's rating cache to the browser
                                    ratingsPalette: this._ratingsPalette, // THE PALETTE PASS: Color the icons in the browser
                                    fileType: "lora",
                                    value: `{{t_text_accent::${tLocale("$derp_lora_stack.browser.add", "Add Lora to Stack...")}}}`, width: "full", height: "auto",
                                    triggerIconColorKey: "t_text_warning",
                                    themeKey: "dialog, t_textNormal", canvasShield: true,
                                    searchThemeKey: "panel, t_textSystem",
                                    padding: [pW, pH],
                                    onChange: (val) => {
                                        if (!this.properties.stackData) this.properties.stackData = [];
                                        const sliderDefault = parseFloat(this.properties.sliderDefault);
                                        const clipDefault = parseFloat(this.properties.clipDefault);
                                        const defVal = Number.isFinite(sliderDefault) ? sliderDefault : 1.0;
                                        const defClip = Number.isFinite(clipDefault) ? clipDefault : 1.0;
                                        this.properties.stackData.push([val, defVal, defClip, "None", "", false, false, false]);
                                        if (this.fetchDerpLoraTriggers) this.fetchDerpLoraTriggers(val, this.properties.stackData.length - 1);
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                        if (this.syncLoraStackStructureHeight) this.syncLoraStackStructureHeight();
                                        if (app.graph && app.graph.change) app.graph.change();
                                    }
                                },
                                btnRefresh: {
                                    type: this.UI_TYPES.ICONBUTTON,
                                    icon: "refresh",
                                    corners: [0, 3, 3, 0],
                                    width: "match", height: "fill", objectAlign: ["left", "middle"],
                                    themeKey: "button, t_textNormal",
                                    onPress: () => {
                                        const bId = "basta_lora_detail_global_unique_id";
                                        if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();

                                        window._xcpDerpSession = Date.now();
                                        if (this.fetchDerpLoraData) this.fetchDerpLoraData(true);

                                    }
                                }
                            },
                            regionWarning: {
                                anchor: {
                                    target: "loraEntriesRegion",
                                    axis: "y",
                                    offset: sH
                                },
                                contentViewportClip: false,
                                hidden: hasRequiredSignals,
                                dir: "col",
                                width: "full",
                                height: "auto",
                                margin: [0, mH, 0, mH],
                                lblWarningCrossAttention: { pulseStates: true,
                                    type: this.UI_TYPES.TEXT,
                                    themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.warnings.cross_attention", "MODEL and CLIP signals required, click the wireless button in the header."),
                                    hidden: hasRequiredSignals || isJointAttention,
                                    width: "full",
                                    padding: [pW, pH],
                                    labelAlign: ["left", "middle"],
                                },
                                lblWarningJointAttention: { pulseStates: true,
                                    type: this.UI_TYPES.TEXT,
                                    themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.warnings.joint_attention", "MODEL signal required, click the wireless button in the header."),
                                    hidden: hasRequiredSignals || !isJointAttention,
                                    width: "full",
                                    padding: [pW, pH],
                                    labelAlign: ["left", "middle"],
                                }
                            }
                        },
                    };

                    this.requestDerpSync();
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                };

                // --- SYSTEM PANEL LAYOUT (RIGHT CLICK) ---
                nodeType.prototype.refreshDerpLoraStackSysMap = function() {
                    const { mW, mH, oX, oY, pW, pH, sW, sH } = this.getDerpVars(this);

                    this.sysLayoutMap = {
                        sysContentRegion: {
                            dir: "col",
                            anchor: { target: "sysDefaultControlsRegion", axis: "y", }, margin: [mW, mH],
                            width: "full", height: "auto",
                            sysRow_1: {
                                dir: "row", width: "full", height: "auto", margin: [mW, mH],
                                lblClipVisibleLimit: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.clip_visible_limit", "Visible before clip:"), width: "auto", padding: [pW, 0], spacing: [sW, 0],
                                },
                                dropdownClipVisibleLimit: {
                                    type: this.UI_TYPES.FILEBROWSER,
                                    icon: "dropdown",
                                    themeKey: "button, t_textSystem",
                                    canvasShield: true, padding: [pW, pH],
                                    width: "auto", height: "auto",
                                    mode: "file",
                                    rootName: "visible-before-clip",
                                    mouseOver: false,
                                    items: LORA_STACK_CLIP_VISIBLE_LIMIT_ITEMS,
                                    value: getLoraStackClipVisibleLimit(this),
                                    onChange: (v) => {
                                        this.properties.loraStackClipVisibleLimit = normalizeLoraStackClipVisibleLimit(v);
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        persistLoraStackSettings(this);
                                    }
                                },
                                btnToggleMode: {
                                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSystem",
                                    text: `${tLocale("$derp_lora_stack.system.mode", "Mode")}: ${this.properties.attentionMode || "Cross-Attention"}`,
                                    measureText: `${tLocale("$derp_lora_stack.system.mode", "Mode")}: Cross-Attention`,
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    onPress: () => {
                                        this.properties.attentionMode = this.properties.attentionMode === "Joint-Attention" ? "Cross-Attention" : "Joint-Attention";
                                        this.signalFilters = { types: this.properties.attentionMode === "Joint-Attention" ? ["MODEL"] : ["MODEL", "CLIP"] };
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                                        if (app.graph?.setDirtyCanvas) app.graph.setDirtyCanvas(true, true);
                                        persistLoraStackSettings(this);
                                    }
                                },
                                btnToggleCLIP: {
                                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSystem",
                                    text: `${tLocale("$derp_lora_stack.system.show_clip", "Show CLIP")}: ${this.properties.showCLIP ? tLocale("$derp_lora_stack.system.states.on", "ON") : tLocale("$derp_lora_stack.system.states.off", "OFF")}`,
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    onPress: () => {
                                        this.properties.showCLIP = !this.properties.showCLIP;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        persistLoraStackSettings(this);
                                    }
                                },
                                lblDisplay: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.name_display", "Name display:"), width: "auto", padding: [pW, 0],
                                },
                                dropdownNameDisplay: {
                                    type: this.UI_TYPES.FILEBROWSER,
                                    icon: "dropdown",
                                    themeKey: "button, t_textSystem",
                                    canvasShield: true, padding: [pW, pH],
                                    width: "auto", height: "auto",
                                    mode: "file",
                                    rootName: "display",
                                    mouseOver: false,
                                    items: ["Slider", "Top", "None"],
                                    value: this.properties.nameDisplay || "Top",
                                    onChange: (v) => {
                                        this.properties.nameDisplay = v;
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        persistLoraStackSettings(this);
                                    }
                                },
                            },
                            sysRow_2: {
                                anchor: { target: "sysRow_1", axis: "y"},
                                dir: "row", width: "full", height: "auto", margin: [mW, sH], 
                                labelHeader: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.strength_setting", "Strength Setting"), width: "auto", spacing: [sW, 0],
                                },
                                labelMin: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.min", "Min:"), width: "auto", spacing: [sW, 0],
                                },
                                editorMin: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderMin ?? -2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.sliderMin = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelMax: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.max", "Max:"), width: "auto", spacing: [sW, 0],
                                },
                                editorMax: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderMax ?? 2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.sliderMax = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelStep: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.step", "Step:"), width: "auto", spacing: [sW, 0],
                                },
                                editorStep: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderStep ?? 0.05), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.sliderStep = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelDefault: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.default", "Default:"), width: "auto", spacing: [sW, 0],
                                },
                                editorDefault: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderDefault ?? 1.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.sliderDefault = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                toggleLR: {
                                    type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                                    isTextOnly: true, mouseOver: false, icon: "ring",
                                    label: tLocale("$derp_lora_stack.system.lr_button", "LR button"),
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    value: this.properties.toggleLR ?? false,
                                    onPress: () => {
                                        this.properties.toggleLR = !this.properties.toggleLR;
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        persistLoraStackSettings(this);
                                    }
                                },
                            },
                            sysRow_3: {
                                hidden: this.properties.attentionMode === "Joint-Attention" || this.properties.showCLIP === false,
                                anchor: { target: "sysRow_2", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                                labelCLIPHeader: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.clip_setting", "CLIP Setting"), width: "auto", spacing: [sW, 0],
                                    measureText: tLocale("$derp_lora_stack.system.strength_setting", "Strength Setting"),
                                },
                                labelCLIPMin: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.min", "Min:"), width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPMin: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"], height: "fill",
                                    text: String(this.properties.clipMin ?? -2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.clipMin = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelCLIPMax: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.max", "Max:"), width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPMax: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"], height: "fill",
                                    text: String(this.properties.clipMax ?? 2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.clipMax = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelCLIPStep: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.step", "Step:"), width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPStep: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"], height: "fill",
                                    text: String(this.properties.clipStep ?? 0.05), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.clipStep = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                                labelCLIPDefault: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: tLocale("$derp_lora_stack.system.default", "Default:"), width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPDefault: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"], height: "fill",
                                    text: String(this.properties.clipDefault ?? 1.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.clipDefault = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); persistLoraStackSettings(this); }
                                },
                            },
                        }
                    };

                    if (this._derpPanel && typeof this._derpPanel.setLayoutMap === "function") {
                        this._derpPanel.setLayoutMap(this.sysLayoutMap);
                    }
                };
            }
        });
    } catch (e) { console.warn("xcp.derpLoraStack_Layout error:", e); }
}
