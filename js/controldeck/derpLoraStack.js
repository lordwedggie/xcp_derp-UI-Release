/**
 * Path: ./js/fatha/nodes/derpLoraStack.js
 * ROLE: UI Layout Maps for derpLoraStack.
 */
import { app } from "../../../scripts/app.js";
import { showBastaLoraDetail } from "../fatha/bastas/bastaLoraDetail.js";
import { showBastaMessage } from "../fatha/bastas/bastaMessage.js";
import { resolveRatingColor } from "./helpers/loraComponents.js";
import { getPreviewImageUrl } from "./helpers/loraImages.js";

if (!window._xcp_derpLoraStack_Layout_Loaded) {
    window._xcp_derpLoraStack_Layout_Loaded = true;
    try {
        app.registerExtension({
            name: "xcp.derpLoraStack_Layout",
            async beforeRegisterNodeDef(nodeType, nodeData) {
                if (!nodeData.name.toLowerCase().includes("derplorastack")) return;

                nodeType.prototype.onDerpSettingsPress = function() {
                    this.refreshNodeLayoutMap();
                };

                nodeType.prototype.onResize = function(size) {
                    this.properties.nodeSize = [size[0], size[1]];
                    if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                };

                const onNodeCreated = nodeType.prototype.onNodeCreated;
                nodeType.prototype.onNodeCreated = function () {
                    if (onNodeCreated) onNodeCreated.apply(this, arguments);
                    this.properties.drawSettingBtn = true;
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
                    const nameDisplay = this.properties.nameDisplay || "Top";
                    const bastaId = "basta_lora_detail_global_unique_id";
                    const bObj = window.xcpActiveBastas?.get(bastaId);
                    const activeSlot = (bObj?.hostNode === this && !bObj.isClosing) ? (bObj._loraData?.slotIndex ?? this._activeDetailSlot ?? -1) : -1;
                    const trigHash = stack.map(l => (this._loraTriggerArrayCache?.[l[0]] || []).length).join('|');

                    const dragIdxHash = (this._dragTrig) ? `drag_${this._dragTrig.index}_${this._dragThresholdMet}_${this._dropPreviewIdx}` : "no-drag";
                    const structureHash = `${stack.length}_${stack.map(l => `${l[0]}_${l[5]}`).join('|')}_${trigHash}_${this.properties.nameDisplay}_${this.properties.showCLIP}_${this.properties.attentionMode}_${this.properties.settingActive}_${window._xcpDerpSession}_${activeSlot}_${mW}_${mH}_${this.titleLabel}_${(this.size?.[0] || 0).toFixed(2)}_${dragIdxHash}`;

                    // ZERO-INFERENCE VALUE GATE: Block redundant property hydration on idle nodes
                    const valueHash = stack.map(l => `${l[1]}_${l[2]}_${l[3]}_${l[4]}_${l[5]}_${l[6]}`).join('|') + `_${this.mode}_${this._hoveredRegionKey}`;

                    // SYNCHRONIZED CACHE CHECK
                    if (this._layoutMapHash === structureHash && this.layoutMap) {
                        if (this._lastStackValues === valueHash) {
                            return;
                        }
                        this._lastStackValues = valueHash;

                        // RE-HYDRATE VISUALS: Update icons, colors, and animations in-place on the cached structure
                        stack.forEach((lora, i) => {
                            const loraRow = this.layoutMap.mainContentRegion[`loraRow_${i}`];
                            if (loraRow) {
                                // THE BYPASS SYNC: Detect if the entire node (mode 2/4, properties, or bypass widget) or just this LoRA entry is bypassed
                                const nodeBypassed = this.mode === 2 || this.mode === 4 || this.properties.isBypassed || (this.widgets && this.widgets[0] && this.widgets[0].value === "bypass");
                                const isBypassed = !!lora[5] || nodeBypassed;
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
                                        if (topRow[`btnEnable_${i}`]) topRow[`btnEnable_${i}`].state = isSelected ? "DIS" : (!isBypassed ? "ON" : "OFF");
                                        if (topRow[`lblLoraNameTop_${i}`]) {
                                            topRow[`lblLoraNameTop_${i}`].state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                        }
                                        if (topRow[`toggleFuseQKV_${i}`]) {
                                            topRow[`toggleFuseQKV_${i}`].state = (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF");
                                            topRow[`toggleFuseQKV_${i}`].value = !!lora[6];
                                            topRow[`toggleFuseQKV_${i}`].hidden = nameDisplay !== "Top" || this.properties.attentionMode !== "Joint-Attention";
                                        }
                                        // THE CACHE PRESERVATION FIX: Prevent resetting the layout cache during pure visual hydration
                                    }
                                    const modelRow = loraMid[`modelRow_${i}`];
                                    if (modelRow) {
                                        if (modelRow[`btnEnableLeft_${i}`]) modelRow[`btnEnableLeft_${i}`].state = isSelected ? "DIS" : (!isBypassed ? "ON" : "OFF");
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
                                            widget.value = matched ? matched.key : (lora[3] || "None");
                                            widget.label = matched ? `${matched.display}:\u00A0` : "";
                                            widget.text = (lora[4] && lora[4] !== "") ? lora[4] : (matched ? (matched.tag || matched.name) : (lora[3] || "None"));
                                            widget.dropdownHeaderText = matched ? matched.display : (lora[3] || "Select Trigger...");
                                            // THE BYPASS SYNC: Ensure the widget state matches the bypass flag to trigger the widget_Dropdown fix
                                            widget.state = isBypassed ? "DIS" : (isSelected ? "ON" : "OFF");
                                            widget.labelState = isBypassed ? "DIS" : (isSelected ? "ON" : "OFF");
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

                    const estimateDropGapHeight = () => {
                        if (this._dragTrig && this.layout?.regions) {
                            const dragRow = this.layout.regions[`loraRow_${this._dragTrig.index}`];
                            if (dragRow && Number.isFinite(dragRow.h) && dragRow.h > 0) {
                                return Math.round(dragRow.h);
                            }
                        }
                        if (this.layout?.regions) {
                            const heights = [];
                            for (const [k, r] of Object.entries(this.layout.regions)) {
                                if (k.startsWith("loraRow_") && Number.isFinite(r.h) && r.h > 0) heights.push(r.h);
                            }
                            if (heights.length > 0) {
                                const avg = heights.reduce((sum, h) => sum + h, 0) / heights.length;
                                return Math.round(avg);
                            }
                        }
                        return 84;
                    };
                    const dropGapHeight = estimateDropGapHeight();

                    const isDragPreviewActive = !!(this._dragTrig && this._dragThresholdMet);
                    const dragIdx = this._dragTrig?.index;
                    const rawDropIdx = this._dropPreviewIdx;
                    const stableCount = stack.length - (isDragPreviewActive ? 1 : 0);
                    const dropIdx = Math.max(0, Math.min(Number.isInteger(rawDropIdx) ? rawDropIdx : 0, Math.max(0, stableCount)));
                    const hasEffectiveDropTarget = isDragPreviewActive && Number.isInteger(dragIdx) && dropIdx !== dragIdx;

                    let lastVisibleRowKey = null;

                    const stackRows = stack.reduce((acc, lora, i) => {
                        let prev = i === 0 ? null : `loraRow_${i-1}`;
                        const loraName = (lora[0] || "").split(/[\\/]/).pop().replace(/\.safetensors$/i, "");
                        // THE BYPASS SYNC: Detect if the entire node (mode 2/4, properties, or bypass widget) or just this LoRA entry is bypassed
                        const nodeBypassed = this.mode === 2 || this.mode === 4 || this.properties.isBypassed || (this.widgets && this.widgets[0] && this.widgets[0].value === "bypass");
                        const isBypassed = !!lora[5] || nodeBypassed;

                        if (i > 0) {
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
                                height: dropGapHeight,
                                margin: [mW * 2, 0, mW * 2, mH],
                                regionOffset: [mW, 2, mW, 2],
                                dropPreviewGhost: {
                                    type: this.UI_TYPES.TEXT,
                                    text: "Drop here",
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

                        const isSelected = (i === activeSlot);
                        const rating = parseInt(this._loraRatings?.[lora[0]] || 0, 10);
                        const ratingColor = resolveRatingColor(this, lora[0], isSelected, isBypassed);
                        let previewBorder = ratingColor;

                        const isDragged = !!(this._dragTrig && this._dragThresholdMet && this._dragTrig.index === i);
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
                            [`loraPreview_${i}`]: {
                                hidden: false,
                                isThumbnail: true, // THE CACHE OPTIMIZATION: Use THUMBNAIL_LONG_SIDE_TARGET for stack images
                                type: this.UI_TYPES.IMAGE_HTML,
                                borderColor: resolveRatingColor(this, lora[0], isSelected, isBypassed),
                                imageUrl: (lora[0] && this._loraPreviewList?.includes(lora[0])) ? getPreviewImageUrl(lora[0], true) : null,
                                btnColor: "rgba(0,0,0,0.2)",
                                alpha: previewAlpha,
                                state: (i === activeSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                grayscale: isBypassed, margin: [-mW + 2, 0],
                                width: "match", height: "fill", spacing: [mW + 2, 0],
                                onPress: () => {
                                    this._activeDetailSlot = i;
                                    const previewUrl = (this._loraPreviewList?.includes(lora[0])) ? getPreviewImageUrl(lora[0], false) : null;
                                    const path = lora[0].toLowerCase();
                                    let detectedBase = "SDXL"; // Default
                                    if (path.includes("pony")) detectedBase = "Pony Diffusion V6";
                                    else if (path.includes("illustrious")) detectedBase = "Illustrious XL";
                                    else if (path.includes("1.5") || path.includes("v1-5")) detectedBase = "SD 1.5";
                                    const rawTags = (typeof lora[4] === "object") ? (lora[4].tag || "") : (lora[4] || "");
                                    const tags = rawTags.trim() !== ""
                                        ? rawTags.split(',').map(t => t.trim()).filter(t => t !== "")
                                        : ["None"];

                                    showBastaLoraDetail(this, `loraPreview_${i}`, {
                                        name: loraName,
                                        slotIndex: i,
                                        rawFileName: (lora[0] || "").replace(/\//g, "\\"),
                                        previewUrl: previewUrl,
                                        baseModel: detectedBase,
                                        tags: tags,
                                        loraList: this._loraList || [],
                                        loraPreviewList: this._loraPreviewList || [],
                                        ratingsPalette: this._ratingsPalette
                                    });
                                },
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
                                    margin: [0, 1, 0, 0], padding: [0, 0],
                                    objectAlign: ["left", "top"], labelAlign: ["left", "top"]
                                }
                            },
                            [`loraMiddle_${i}`]: {
                                alpha: rowAlpha,
                                dir: "col", width: "full", height: "auto", spacing: [0, sH], margin: [0, 0, -mW + 2, 0],
                                minWidth: 10,
                                [`topRow_${i}`]: {
                                    alpha: rowAlpha,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH],

                                    [`lblLoraNameTop_${i}`]: {
                                        hidden: nameDisplay !== "Top",
                                        type: this.UI_TYPES.TEXT, themeKey: "t_textNormal",
                                        text: loraName, width: "full", mouseOver: false,
                                        displayMode: "cutoff", alpha: rowAlpha,
                                        state: (i === this._activeDetailSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                        onPress: () => {
                                            this._activeDetailSlot = i;
                                            const previewUrl = (this._loraPreviewList?.includes(lora[0])) ? getPreviewImageUrl(lora[0], false) : null;
                                            const path = lora[0].toLowerCase();
                                            let detectedBase = "SDXL";
                                            if (path.includes("pony")) detectedBase = "Pony Diffusion V6";
                                            else if (path.includes("illustrious")) detectedBase = "Illustrious XL";
                                            else if (path.includes("1.5") || path.includes("v1-5")) detectedBase = "SD 1.5";
                                            const rawTags = (typeof lora[4] === "object") ? (lora[4].tag || "") : (lora[4] || "");
                                            const tags = rawTags.trim() !== "" ? rawTags.split(',').map(t => t.trim()).filter(t => t !== "") : ["None"];

                                            showBastaLoraDetail(this, `lblLoraNameTop_${i}`, {
                                                name: loraName,
                                                slotIndex: i,
                                                rawFileName: (lora[0] || "").replace(/\//g, "\\"),
                                                previewUrl: previewUrl,
                                                baseModel: detectedBase,
                                                tags: tags,
                                                loraList: this._loraList || [],
                                                loraPreviewList: this._loraPreviewList || [],
                                                ratingsPalette: this._ratingsPalette
                                            });
                                        }
                                    },
                                    [`toggleFuseQKV_${i}`]: {
                                        hidden: nameDisplay !== "Top" || this.properties.attentionMode !== "Joint-Attention",
                                        type: this.UI_TYPES.TOGGLE_V2, themeKey: "dialog, button, t_textSystem",
                                        label: "Fuse QKV", icon: "ring", width: "auto", height: "fill", padding: [pW, pH],
                                        isTextOnly: true, mouseOver: false, alpha: rowAlpha,
                                        state: (i === this._activeDetailSlot) ? "ON" : (isBypassed ? "DIS" : "OFF"),
                                        value: !!lora[6],
                                        onPress: () => {
                                            lora[6] = !lora[6];
                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    },
                                    [`btnEnable_${i}`]: {
                                        hidden: nameDisplay !== "Top", mouseOver: false,
                                        type: this.UI_TYPES.ICONBUTTON, icon: "power", themeKey: "button, t_textNormal",
                                        width: "match", height: "fill", spacing: [sW, 0], alpha: rowAlpha,
                                        state: isSelected ? "DIS" : (!isBypassed ? "ON" : "OFF"),
                                        playSound: lora[5] ? "powerUp" : "powerDown",
                                        onPress: () => {
                                            lora[5] = !lora[5]; // Toggle the bypass flag
                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    },
                                },
                                [`modelRow_${i}`]: {
                                    alpha: rowAlpha,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH],
                                    [`btnEnableLeft_${i}`]: {
                                        hidden: nameDisplay !== "Slider", mouseOver: false,
                                        type: this.UI_TYPES.ICONBUTTON, icon: "power", themeKey: "button, t_textNormal",
                                        width: "match", height: "fill", spacing: [sW, 0], alpha: rowAlpha,
                                        state: isSelected ? "DIS" : (!isBypassed ? "ON" : "OFF"),
                                        playSound: lora[5] ? "powerUp" : "powerDown",
                                        onPress: () => {
                                            lora[5] = !lora[5]; // Toggle the bypass flag
                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    },
                                    [`sldModel_${i}`]: {
                                        type: this.UI_TYPES.SLIDER, mouseOver: false,
                                        text: nameDisplay === "Slider" ? loraName : "Strength",
                                        padding: [pW, pH], fillPadding: [1, 1],
                                        displayMode: "cutoff", alpha: rowAlpha,
                                        measureText: nameDisplay === "Slider" ? loraName : "Strength",
                                        value: lora[1],
                                        min: this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.sliderMin ?? -2.0,
                                        max: this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.sliderMax ?? 2.0,
                                        step: this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.sliderStep ?? 0.05,
                                        state: isBypassed ? "DIS" : "OFF",
                                        width: "full", height: "auto", themeKey: "panel, button, t_textSmall", labelAlign: ["center", "middle"], spacing: [sW, 0]
                                    },
                                    [`valModel_${i}`]: {
                                        type: this.UI_TYPES.EDITOR, canvasShield: true, themeKey: "dialog, t_textSmall", labelAlign: ["center", "middle"],
                                        text: parseFloat(lora[1] ?? 1.0).toFixed(2), measureText: "-9.99",
                                        state: isBypassed ? "DIS" : "OFF", mouseOver: false, alpha: rowAlpha,
                                        width: "auto", height: "fill", padding: [pW, 0], spacing: [0, 0],
                                        onBlur: (v) => {
                                            const val = parseFloat(v);
                                            if (!isNaN(val)) { lora[1] = val; if (this.syncDerpOutputs) this.syncDerpOutputs(); this.refreshNodeLayoutMap(); }
                                        }
                                    }
                                },
                                [`clipRow_${i}`]: {
                                    hidden: this.properties.attentionMode === "Joint-Attention" || this.properties.showCLIP === false,
                                    dir: "row", width: "full", height: "auto", spacing: [sW, sH], alpha: rowAlpha,
                                    [`sldClip_${i}`]: {
                                        type: this.UI_TYPES.SLIDER, mouseOver: false,
                                        text: "Clip", padding: [pW, pH], fillPadding: [1, 1],
                                        displayMode: "cutoff", alpha: rowAlpha,
                                        measureText: "Clip",
                                        value: lora[2],
                                        min: this._loraSetup?.[lora[0]]?.sliderStrength?.[0] ?? this.properties.clipMin ?? -2.0,
                                        max: this._loraSetup?.[lora[0]]?.sliderStrength?.[1] ?? this.properties.clipMax ?? 2.0,
                                        step: this._loraSetup?.[lora[0]]?.sliderStrength?.[2] ?? this.properties.clipStep ?? 0.05,
                                        state: isBypassed ? "DIS" : "OFF",
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
                                    dir: "row", width: "full", height: "auto", spacing: [sW, 0], alpha: rowAlpha,
                                    [`dropTrigger_${i}`]: {
                                        type: this.UI_TYPES.DROPDOWN_DERP, themeKey: "dialog, t_textSmall",
                                        canvasShield: true, width: "full", height: "auto", padding: [pW, pH], alpha: rowAlpha,
                                        state: isBypassed ? "DIS" : (isSelected ? "ON" : "OFF"),
                                        labelState: isBypassed ? "DIS" : (isSelected ? "ON" : "OFF"),
                                        mouseOver: false,
                                        indicator: "on",
                                        items: (() => {
                                            const triggers = this._loraTriggerArrayCache?.[lora[0]] || [];
                                            const session = window._xcpDerpSession || Date.now();
                                            const mapped = triggers.map(t => ({
                                                ...t,
                                                name: (t.tag && t.tag !== t.name) ? `${t.name}:\u00A0${t.tag}` : t.name,
                                                display: (t.tag && t.tag !== t.name) ? `${t.name}:\u00A0${t.tag}` : t.name,
                                                value: t.key,
                                                imageUrl: t.image ? `/xcp/get_lora_image?name=${encodeURIComponent(lora[0])}&file=${encodeURIComponent(t.image)}&v=${session}` : null
                                            }));
                                            return mapped.length > 0 ? mapped : ["None"];
                                        })(),
                                        imageUrl: (() => {
                                            const matched = (this._loraTriggerArrayCache?.[lora[0]] || []).find(t => t.key === lora[3]);
                                            const session = window._xcpDerpSession || Date.now();
                                            return (matched && matched.image) ? `/xcp/get_lora_image?name=${encodeURIComponent(lora[0])}&file=${encodeURIComponent(matched.image)}&v=${session}` : null;
                                        })(),
                                        value: (() => {
                                            const matched = (this._loraTriggerArrayCache?.[lora[0]] || []).find(t => t.key === lora[3]);
                                            return matched ? matched.key : (lora[3] || "None");
                                        })(),
                                        label: (() => {
                                            const matched = (this._loraTriggerArrayCache?.[lora[0]] || []).find(t => t.key === lora[3]);
                                            return matched ? `${matched.display}:\u00A0` : "";
                                        })(),
                                        text: (() => {
                                            const matched = (this._loraTriggerArrayCache?.[lora[0]] || []).find(t => t.key === lora[3]);
                                            return (lora[4] && lora[4] !== "") ? lora[4] : (matched ? (matched.tag || matched.name) : (lora[3] || "None"));
                                        })(),
                                        displayMode: "cutoff",
                                        onChange: (v) => {
                                            if (!v || v === "None") {
                                                lora[3] = "None";
                                                lora[4] = "";
                                            } else {
                                                // THE RESOLUTION FIX: Extract the key safely to bypass truncation bugs
                                                const valStr = (typeof v === "object") ? (v.value || v.key || v.name) : v;
                                                const triggers = this._loraTriggerArrayCache?.[lora[0]] || [];

                                                const entry = triggers.find(t =>
                                                    t.key === valStr ||
                                                    ((t.tag && t.tag !== t.name) ? `${t.name}:\u00A0${t.tag}` : t.name) === valStr ||
                                                    (t.tag || t.name) === valStr
                                                );

                                                lora[3] = entry ? entry.key : "None";
                                                lora[4] = entry ? entry.tag : "";
                                            }

                                            if (this.syncDerpOutputs) this.syncDerpOutputs();
                                            this.refreshNodeLayoutMap();
                                        }
                                    }
                                }
                            },
                            [`btnCol_${i}`]: {
                                alpha: rowAlpha,
                                hidden: !this.properties.settingActive,
                                dir: "col", width: "auto", height: "fill", margin: [pW, 0, 0, 0], spacing: [0, sH],
                                objX: "right",
                                [`btnUp_${i}`]: {
                                    type: this.UI_TYPES.ICONBUTTON, icon: "uparrow", themeKey: "button, t_textSystem",
                                    width: "auto", height: "auto", spacing: [0, sW], alpha: rowAlpha,

                                    state: (i === 0) ? "DIS" : "OFF",
                                    onPress: (e) => {
                                        if (i === 0) return;
                                        if (e && e.shiftKey) {
                                            showBastaMessage(this, "Stack Shuffled", 800, {fade:true}, null, false, "info", "shuffle");
                                        } else {
                                            showBastaMessage(this, "Moved Up", 800, {fade:true}, null, false, "info", "powerUp");
                                        }
                                        const bId = "basta_lora_detail_global_unique_id";
                                        if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();

                                        const currentStack = [...this.properties.stackData];
                                        const item = currentStack.splice(i, 1)[0];

                                        // THE SHIFT OVERRIDE: Shift-click moves the LoRA to the absolute top of the stack
                                        if (e && e.shiftKey) currentStack.unshift(item);
                                        else currentStack.splice(i - 1, 0, item);

                                        this.properties.stackData = currentStack;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                    }
                                },
                                [`btnRemove_${i}`]: {
                                    type: this.UI_TYPES.ICONBUTTON, icon: "close", themeKey: "button, t_textSystem",
                                    width: "auto", height: "fill", spacing: [0, sW], alpha: rowAlpha,
                                    playSound: "delete",
                                    state: "OFF",
                                    onPress: () => {
                                        const bId = "basta_lora_detail_global_unique_id";
                                        if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();

                                        const currentStack = [...this.properties.stackData];
                                        currentStack.splice(i, 1);
                                        this.properties.stackData = currentStack;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                    }
                                },
                                [`btnDown_${i}`]: {
                                    type: this.UI_TYPES.ICONBUTTON, icon: "downarrow", themeKey: "button, t_textSystem",
                                    width: "auto", height: "auto", alpha: rowAlpha,
                                    state: (i === stack.length - 1) ? "DIS" : "OFF",
                                    onPress: (e) => {
                                        if (i === stack.length - 1) return;
                                        if (e && e.shiftKey) {
                                            showBastaMessage(this, "Stack Shuffled", 800, {fade:true}, null, false, "info", "shuffle");
                                        } else {
                                            showBastaMessage(this, "Moved Down", 800, {fade:true}, null, false, "info", "powerDown");
                                        }
                                        const bId = "basta_lora_detail_global_unique_id";
                                        if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();

                                        const currentStack = [...this.properties.stackData];
                                        const item = currentStack.splice(i, 1)[0];
                                        if (e && e.shiftKey) currentStack.push(item);
                                        else currentStack.splice(i + 1, 0, item);

                                        this.properties.stackData = currentStack;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                    }
                                }
                            }
                        };

                        if (!isDragged) lastVisibleRowKey = `loraRow_${i}`;

                        return acc;
                    }, {});

                    const hasTailDropPreview = hasEffectiveDropTarget && dropIdx === stableCount;
                    if (hasTailDropPreview) {
                        stackRows.loraDropPreview_tail = {
                            anchor: lastVisibleRowKey ? { target: lastVisibleRowKey, axis: "y", offset: oY } : null,
                            type: this.UI_TYPES.REGION,
                            themeKey: "region",
                            state: "OFF",
                            hoverEffect: false,
                            alpha: 0.22,
                            dir: "row",
                            width: "full",
                            height: dropGapHeight,
                            margin: [mW * 2, 0, mW * 2, mH],
                            regionOffset: [mW, 2, mW, 2],
                            dropPreviewGhost: {
                                type: this.UI_TYPES.TEXT,
                                text: "Drop here",
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
                            margin: this.properties?.drawHeader === true ? [mW, mH, mW, 0] : [0, 0],
                            ...stackRows,
                            footerControls: {
                                anchor: {
                                    target: hasTailDropPreview
                                        ? "loraDropPreview_tail"
                                        : (stack.length > 0 ? `loraRow_${stack.length - 1}` : null),
                                    axis: "y",
                                    offset: sH
                                },
                                dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                                margin: [0, mH, 0, mH],
                                loraSelector: {
                                    type: this.UI_TYPES.FILEBROWSER, items: this._loraList || [],
                                    mode: "file", mouseOver: false,
                                    rootName: "loras",
                                    previewList: this._loraPreviewList,
                                    ratingsList: this._loraRatings || {}, // THE RATING PASS: Provide the node's rating cache to the browser
                                    ratingsPalette: this._ratingsPalette, // THE PALETTE PASS: Color the icons in the browser
                                    fileType: "lora",
                                    value: "Add Lora to Stack...", width: "full", height: "auto",
                                    themeKey: "dialog, t_textNormal", canvasShield: true, spacing: [sW, 0], padding: [pW, pH],
                                    onChange: (val) => {
                                        if (!this.properties.stackData) this.properties.stackData = [];
                                        const defVal = this._loraSetup?.[val]?.sliderStrength?.[3] ?? this.properties.sliderDefault ?? 1.0;
                                        const defClip = this.properties.clipDefault ?? 1.0;
                                        this.properties.stackData.push([val, defVal, defClip, "None", "", false]);
                                        if (this.fetchDerpLoraTriggers) this.fetchDerpLoraTriggers(val, this.properties.stackData.length - 1);
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        this.refreshNodeLayoutMap();
                                    }
                                },
                                btnRefresh: {
                                    type: this.UI_TYPES.BUTTON, text: "Refresh",
                                    width: "auto", height: "fill", padding: [pW, pH],
                                    labelAlign: ["center", "middle"], themeKey: "button, t_textSmall",
                                    onPress: () => {
                                        const bId = "basta_lora_detail_global_unique_id";
                                        if (window.xcpActiveBastas?.has(bId)) window.xcpActiveBastas.get(bId).close();

                                        window._xcpDerpSession = Date.now();
                                        if (this.fetchDerpLoraData) this.fetchDerpLoraData(true);
                                        showBastaMessage(this, "Refreshing Metadata...", 2000, { width: this.size[0] }, null, false, "info", "microwave");
                                    }
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
                            anchor: { target: "sysDefaultControlsRegion", axis: "y", }, margin: [mW, 0],
                            width: "full", height: "auto",
                            sysRow_1: {
                                dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                                btnToggleMode: {
                                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSystem",
                                    text: `Mode: ${this.properties.attentionMode || "Cross-Attention"}`,
                                    measureText: "Mode: Cross-Attention",
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    onPress: () => {
                                        this.properties.attentionMode = this.properties.attentionMode === "Joint-Attention" ? "Cross-Attention" : "Joint-Attention";
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                    }
                                },
                                btnToggleCLIP: {
                                    type: this.UI_TYPES.BUTTON, themeKey: "button, t_textSystem",
                                    text: `Show CLIP: ${this.properties.showCLIP ? "ON" : "OFF"}`,
                                    width: "auto", height: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    onPress: () => {
                                        this.properties.showCLIP = !this.properties.showCLIP;
                                        if (this.syncDerpOutputs) this.syncDerpOutputs();
                                        if (this.refreshNodeLayoutMap) this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                    }
                                },
                                lblDisplay: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Name display:", width: "auto", padding: [pW, 0],
                                },
                                dropdownNameDisplay: {
                                    type: this.UI_TYPES.DROPDOWN_DERP, themeKey: "button, t_textSystem",
                                    canvasShield: true, labelAlign: ["center", "middle"], padding: [pW, pH],
                                    width: "auto", height: "auto", measureText: "Slider",
                                    items: ["Slider", "Top", "None"],
                                    value: this.properties.nameDisplay || "Top",
                                    onChange: (v) => {
                                        this.properties.nameDisplay = v;
                                        this.refreshNodeLayoutMap();
                                        this.refreshDerpLoraStackSysMap();
                                        this.requestDerpSync();
                                    }
                                },
                            },
                            sysRow_2: {
                                anchor: { target: "sysRow_1", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                                labelHeader: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSmall",
                                    text: "Strength Setting", width: "auto", spacing: [sW, 0],
                                },
                                labelMin: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Min:", width: "auto", spacing: [sW, 0],
                                },
                                editorMin: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderMin ?? -2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.sliderMin = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelMax: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Max:", width: "auto", spacing: [sW, 0],
                                },
                                editorMax: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderMax ?? 2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.sliderMax = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelStep: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Step:", width: "auto", spacing: [sW, 0],
                                },
                                editorStep: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderStep ?? 0.05), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.sliderStep = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelDefault: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Default:", width: "auto", spacing: [sW, 0],
                                },
                                editorDefault: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.sliderDefault ?? 1.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.sliderDefault = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                            },
                            sysRow_3: {
                                hidden: this.properties.attentionMode === "Joint-Attention" || this.properties.showCLIP === false,
                                anchor: { target: "sysRow_2", axis: "y", offset: sH },
                                dir: "row", width: "full", height: "auto", spacing: [sW, 0],
                                labelCLIPHeader: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSmall",
                                    text: "CLIP Setting", width: "auto", spacing: [sW, 0],
                                    measureText: "Strength Setting",
                                },
                                labelCLIPMin: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Min:", width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPMin: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.clipMin ?? -2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.clipMin = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelCLIPMax: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Max:", width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPMax: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.clipMax ?? 2.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "00",
                                    onBlur: (v) => { this.properties.clipMax = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelCLIPStep: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Step:", width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPStep: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.clipStep ?? 0.05), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.clipStep = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
                                },
                                labelCLIPDefault: {
                                    type: this.UI_TYPES.TEXT, themeKey: "t_textSystem",
                                    text: "Default:", width: "auto", spacing: [sW, 0],
                                },
                                editorCLIPDefault: {
                                    type: this.UI_TYPES.EDITOR, themeKey: "dialog, t_textSystem", labelAlign: ["center", "middle"],
                                    text: String(this.properties.clipDefault ?? 1.0), width: "auto", padding: [pW, pH], spacing: [sW, 0],
                                    measureText: "0.00",
                                    onBlur: (v) => { this.properties.clipDefault = parseFloat(v); this.refreshNodeLayoutMap(); this.refreshDerpLoraStackSysMap(); this.syncDerpOutputs(); }
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
