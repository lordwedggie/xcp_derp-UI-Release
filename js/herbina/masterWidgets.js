/**
 * Herbina Master Widgets (The Hub)
 * Path: ./Herbina/masterWidgets.js
 * * --- MASTER WIDGET PROTOCOL ---
 * 1. UNIFIED THEME KEYS: All widgets that has text drawing must support a three-part themeKey string:
 * "BodyKey, LabelKey, FontSizeOverride".
 * 2. PARSING: Use 'parseThemeKey' from utils/widgetsUtils.js to decompose keys.
 * 3. RESOLUTION & DEBUG: Use 'resolvePaintData' for all node lookups.
 * This centralizes casing-mismatch warnings and state-suffix (_ON, _DIS) logic.
 * 4. FONT OVERRIDES: If a 3rd part is provided in the themeKey, it MUST override
 * the paintData's fontSize in both measurement and drawing.
 */

// --- RE-EXPORTING SPECIALISTS ---
// This allows xcpThemeManager.js to find them through this Hub.
export { createDerpEditorHTML, syncDerpEditor } from "./widgets/derpEditor.js";
export { createPopupPrompt, syncPopupPrompt } from "./widgets/popupPrompt.js";
export { createBtnIcon, syncBtnIcon, syncBtnIconHTML } from "./widgets/btnIcon.js";
export { createBtnSimple, syncBtnSimple, syncBtnSimpleHTML } from "./widgets/btnSimple.js";
export { createDerpSlider, syncDerpSliderCanvas, syncDerpSliderHTML } from "./widgets/widget_Slider.js";
export { createTextLabel, syncTextLabel, syncTextLabelHTML } from "./widgets/textLabel.js";
export { createColorKeyEdit, syncColorKeyEdit } from "./widgets/widget_ColorKey.js";
export { createLineBreak, syncLineBreak } from "./widgets/widget_LineBreak.js";
export { createFileBrowser, syncFileBrowser, drawActiveFilePickerGlobal } from "./widgets/widget_FileBrowser.js";
export { syncDerpToggle } from "./widgets/widget_Toggle.js";
export { syncDerpToggleV2 } from "./widgets/widget_ToggleV2.js";
export { syncImageHTML } from "./widgets/widget_ImageHTML.js";
export { createMarkdownHTML, syncMarkdownHTML } from "./widgets/widget_MarkdownHTML.js";
export { createDerpRegion, syncDerpRegion } from "./widgets/widget_Region.js";
export { syncDerpTrigger, syncDerpCompositeTrigger } from "./widgets/widget_Trigger.js";

let currentZ = 10001;
export function getNextZIndex() { return currentZ++; }
