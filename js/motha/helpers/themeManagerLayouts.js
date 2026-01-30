/**
 * PROJECT: xcpDerpNodes | PURPOSE: Dynamic Layout Engine & HTML Hybrid Sync
 */
import { themeManagerPainter } from "./themeManagerPainter.js";
import { syncSystemBtn, syncDropdown } from "../../herbina/herbinaMasterWidgets.js";
import { sync3colorProblem } from "../../herbina/widgets/3colorProblem.js";

export function drawThemeManagerLayout(ctx, node, app, dynamicWidth = 160) {
    const p = node.properties;
    const mX = p.marginX || 0, sH = p.spacingH || 0, sW = p.spacingW || 2;
    const tH = p.titleHeight || 20, bH = p.themeBarHeight || 14;
    const dH = p.controlDeckGlobalsHeight || 14;

    const bW = (p.breakW || 4) * 2, bH_gap = (p.breakH || 4) * 2;
    const xOff = p.previewAreaXoffset || 0, yOff = p.previewAreaYoffset || 0;

    const titleBar = { x: 0, y: 0, width: node.size[0], height: tH, radius: [8, 8, 0, 0] };

    // --- TOP: Theme Bar Area ---
    const themeBar = { x: mX, y: tH + sH, width: node.size[0] - (mX * 2), height: bH, radius: 4 };
    const themeBarBtnTrash = { x: themeBar.x, y: themeBar.y, size: bH };
    const themeSelector = { x: themeBarBtnTrash.x + themeBarBtnTrash.size + sW, y: themeBar.y, width: dynamicWidth, height: bH };
    const tBtnStartX = themeSelector.x + themeSelector.width + sW;
    const themeBarBtnAdd    = { x: tBtnStartX, y: themeBar.y, size: bH };
    const themeBarBtnCopy   = { x: themeBarBtnAdd.x + bH + sW, y: themeBar.y, size: bH };
    const themeBarBtnRename = { x: themeBarBtnCopy.x + bH + sW, y: themeBar.y, size: bH };
    const themeBarBtnSave   = { x: themeBarBtnRename.x + bH + sW, y: themeBar.y, size: bH };

    // --- MIDDLE: Preview Area ---
    const previewBG = {
        x: mX, y: themeBar.y + themeBar.height + bH_gap,
        width: node.size[0] - (mX * 2), height: 100 + (yOff * 2), radius: 0
    };
    const previewArea = {
        x: bW + xOff, y: previewBG.y + yOff,
        width: node.size[0] - (bW * 2) - (xOff * 2), height: 100
    };

    // --- BOTTOM: Control Bar Area ---
    const controlBar = {
        x: mX, y: previewBG.y + previewBG.height + bH_gap,
        width: node.size[0] - (mX * 2), height: bH, radius: 4
    };
    const controlBarBtnTrash = { x: controlBar.x, y: controlBar.y, size: bH };
    const keySelector = {
        x: controlBarBtnTrash.x + controlBarBtnTrash.size + sW,
        y: controlBar.y, width: dynamicWidth, height: bH
    };
    const cBtnStartX = keySelector.x + keySelector.width + sW;
    const controlBarBtnAdd    = { x: cBtnStartX, y: controlBar.y, size: bH };
    const controlBarBtnCopy   = { x: controlBarBtnAdd.x + bH + sW, y: controlBar.y, size: bH };
    const controlBarBtnRename = { x: controlBarBtnCopy.x + bH + sW, y: controlBar.y, size: bH };
    const controlBarBtnSave   = { x: controlBarBtnRename.x + bH + sW, y: controlBar.y, size: bH };

    // --- NEW: Control Deck Globals Area ---
    const controlDeckGlobals = {
        x: mX,
        y: controlBar.y + controlBar.height + sH,
        width: node.size[0] - (mX * 2),
        height: dH,
        radius: 4
    };

    const tripleBtnW = Math.max(60, controlDeckGlobals.width);
    const tripleBtnPos = {
        x: controlDeckGlobals.x,
        y: controlDeckGlobals.y,
        width: tripleBtnW,
        height: dH
    };

    const layout = {
        titleBar, themeBar, themeBarBtnTrash, themeSelector, themeBarBtnAdd, themeBarBtnCopy, themeBarBtnRename, themeBarBtnSave,
        previewBG, previewArea, controlBar, controlBarBtnTrash, keySelector, controlBarBtnAdd, controlBarBtnCopy, controlBarBtnRename, controlBarBtnSave,
        controlDeckGlobals, tripleBtnPos
    };

    node._currentLayout = layout;

    // --- HYBRID HTML SYNC ---
    if (node.htmlWidgets) {
        const sync = (id, layoutObj, stateKey, iconCol = "#ffffff") => {
            const widget = node.htmlWidgets[id];
            if (!widget) return;
            const state = node._states[stateKey] || "OFF";
            const finalState = (state !== "DIS" && node._hovers[stateKey]) ? "ON" : state;
            syncSystemBtn(widget, node, app, {
                x: layoutObj.x, y: layoutObj.y, size: layoutObj.size,
                state: finalState, iconColor: iconCol
            });
        };

        sync("themeBarBtnTrash",  layout.themeBarBtnTrash,  'tTrash',  "#ff6666");
        sync("themeBarBtnAdd",    layout.themeBarBtnAdd,    'tAdd',    "#88ccff");
        sync("themeBarBtnCopy",   layout.themeBarBtnCopy,   'tCopy',   "#aaaaff");
        sync("themeBarBtnRename", layout.themeBarBtnRename, 'tRename', "#ffcc88");
        sync("themeBarBtnSave",   layout.themeBarBtnSave,   'tSave',   "#88ff88");
        syncDropdown(node.htmlWidgets.themeSelector, node, app, {
            x: layout.themeSelector.x, y: layout.themeSelector.y,
            w: layout.themeSelector.width, h: layout.themeSelector.height
        });

        sync("controlBarBtnTrash",  layout.controlBarBtnTrash,  'cTrash',  "#ff6666");
        sync("controlBarBtnAdd",    layout.controlBarBtnAdd,    'cAdd',    "#88ccff");
        sync("controlBarBtnCopy",   layout.controlBarBtnCopy,   'cCopy',   "#aaaaff");
        sync("controlBarBtnRename", layout.controlBarBtnRename, 'cRename', "#ffcc88");
        sync("controlBarBtnSave",   layout.controlBarBtnSave,   'cSave',   "#88ff88");
        syncDropdown(node.htmlWidgets.keySelector, node, app, {
            x: layout.keySelector.x, y: layout.keySelector.y,
            w: layout.keySelector.width, h: layout.keySelector.height
        });

        // --- SPECIAL SYNC: 3ColorProblem (Now handles the object) ---
        if (node.htmlWidgets.tripleBtn) {
            sync3colorProblem(node.htmlWidgets.tripleBtn, node, app, {
                x: layout.tripleBtnPos.x,
                y: layout.tripleBtnPos.y,
                width: layout.tripleBtnPos.width,
                height: layout.tripleBtnPos.height
            });
        }
    }

    themeManagerPainter(ctx, node, layout);
}