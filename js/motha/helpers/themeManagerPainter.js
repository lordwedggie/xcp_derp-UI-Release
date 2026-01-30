/**
 * PROJECT: xcpDerpNodes | PURPOSE: Drawing the Title, Bar, and Preview Backgrounds.
 */
import { masterPainter } from "../../herbina/herbinaMasterPainter.js";

export function themeManagerPainter(ctx, node, layout) {
    const tb = layout.titleBar;
    const bg = layout.previewBG;
    const pa = layout.previewArea;

    // 1. Title Bar
    masterPainter(ctx, {
        posX: tb.x, posY: tb.y, width: tb.width, height: tb.height,
        color: "rgba(0, 0, 0, 0.30)", paintData: { corners: tb.radius }
    });

    // 2. PreviewBG (Drawn behind the area)
    if (bg) {
        masterPainter(ctx, {
            posX: bg.x, posY: bg.y, width: bg.width, height: bg.height,
            color: "rgba(0, 0, 0, 0.15)", // Darker background for the whole section
            paintData: { corners: 0 } // Hard corners as requested
        });
    }

    // 3. PreviewArea
    if (pa) {
        masterPainter(ctx, {
            posX: pa.x, posY: pa.y, width: pa.width, height: pa.height,
            color: "rgba(255, 255, 255, 0.05)",
            paintData: { corners: 4 }
        });
    }
}