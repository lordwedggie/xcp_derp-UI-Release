/**
 * Path: ./Herbina/widgets/widget_LineBreak.js
 * ROLE: A simple 1px horizontal separator for layout division.
 * STATUS: PROTOCOL COMPLIANT
 */
import { masterPainter } from "../masterPainter.js";
import { resolveWidgetEnv } from "../utils/widgetsUtils.js";
import { toRGBA } from "../utils/colorMath.js";

const lineTop = [0, 0, 0, 0.2];
const lineBottom = [255, 255, 255, 0.05];

/**
 * Factory for the LineBreak widget.
 */
export function createLineBreak(callbacks = {}) {
    return {
        type: "lineBreak",
        themeKey: callbacks.themeKey || "panel",
        margin: callbacks.margin || [0, 4, 0, 4]
    };
}

/**
 * Canvas Painter for the LineBreak.
 */
export function syncLineBreak(ctx, node, config) {
    if (!config.geometry) return;
    const { x, y, w } = config.geometry;

    // 1. Resolve Environment via Protocol
    const { bodyPaint } = resolveWidgetEnv(node, config);

    // 2. Resolve Colors
    const topColor = toRGBA(lineTop);
    const bottomColor = toRGBA(lineBottom);

    // 3. Draw dual 1px lines (Total 2px height)
    masterPainter(ctx, {
        posX: x,
        posY: y,
        width: w,
        height: 1,
        color: topColor,
        paintData: { corners: 0 }
    });

    masterPainter(ctx, {
        posX: x,
        posY: y + 1,
        width: w,
        height: 1,
        color: bottomColor,
        paintData: { corners: 0 }
    });
}