/**
 * PROJECT: xcpDerpNodes Theme Management System
 * PURPOSE: External storage for default theme templates.
 */

/**
 * PROJECT: xcpDerpNodes Theme Management System
 * PURPOSE: External storage for default theme templates.
 * Formatted for vertical alignment and clear index referencing.
 */
export function defaultTemplates() {
    return {
        "Template_Standard": {
            // Key           [  R,   G,   B,   A,  ...Props ]
            "bg": {         // mostly used to draw backgrounds like the fake background that covers the comfyUI default (which I couldn't figure out how to hide)
                "_ON":       [  45,  45,  45, 1.0 ],
                "_OFF":      [  30,  30,  30, 1.0 ],
                "_DIS": [  20,  20,  20, 1.0 ],
                "corners":   [   4,   4,   4,   4 ],
                "_Shadow":   [   0,   0,   0, 0.5,   0,   2,   8, 0.8, 0.5 ], // [R,G,B,A, OX,OY,Blur,OFF,DIS]
                "_Stroke":   [   0,   0,   0, 0.5,   1,   0, 0.8, 0.5 ]  // [R,G,B,A, Wid,Pla,OFF,DIS]
            },
            "dialog": {     // mostly used to draw backgrounds for text display areas
                "_ON":       [  45,  45,  45, 1.0 ],
                "_OFF":      [  30,  30,  30, 1.0 ],
                "_DIS": [  20,  20,  20, 1.0 ],
                "corners":   [   4,   4,   4,   4 ],
                "_Shadow":   [   0,   0,   0, 0.5,   0,   2,   8, 0.8, 0.5 ],
                "_Stroke":   [   0,   0,   0, 0.5,   1,   0, 0.8, 0.5 ]
            },
            "panel": {      // just...panels
                "_ON":       [  60,  60,  60, 1.0 ],
                "_OFF":      [  55,  55,  55, 1.0 ],
                "_DIS": [  40,  40,  40, 1.0 ],
                "corners":   [   4,   4,   4,   4 ]
            },
            "btn": {     // just...buttons
                "_ON":       [  60,  60,  60, 1.0 ],
                "_OFF":      [  55,  55,  55, 1.0 ],
                "_DIS": [  40,  40,  40, 1.0 ],
                "corners":   [   4,   4,   4,   4 ]
            },
            "t_textBig": {     // Primary text, mostly used for titles
                "_ON":       [ 255, 255, 255, 1.0, 0.7, 0.3 ], // [R,G,B,A, OFF_Mult, DIS_Mult]
                "_OFF":      [ 180, 180, 180, 1.0 ],
                "_DIS": [  80,  80,  80, 1.0 ]
            },
            "t_textNormal": {    // Normal text
                "_ON":       [ 255, 255, 255, 1.0, 0.7, 0.3 ],
                "_OFF":      [ 180, 180, 180, 1.0 ],
                "_DIS": [  80,  80,  80, 1.0 ]
            },
            "t_textSmall": {    // small text, instructions, big content areas and such
                "_ON": [255, 255, 255, 1.0, 0.7, 0.3],
                "_OFF": [180, 180, 180, 1.0],
                "_DIS": [80, 80, 80, 1.0]
            }
        },
       // Gemini's creations
        "Obsidian_Vapor": {
            "bg": {
                "_ON":       [  10,  10,  14, 0.95 ], // Deep void purple-grey
                "_OFF":      [   8,   8,  10, 0.98 ],
                "_DIS": [   5,   5,   5, 1.0 ],
                "corners":   [  12,   0,  12,   0 ], // Aggressive diagonal "cut" look
                "_Shadow":   [  138,  43, 226, 0.4,   0,   0,  15, 0.6, 0.2 ], // Deep violet outer glow
                "_Stroke":   [  255,   0, 255, 0.8,   1,   0, 0.8, 0.5 ]  // Electric magenta razor edge
            },
            "dialog": {
                "_ON":       [   0,   0,   0, 0.4 ], // Sunken "glass" effect
                "_OFF":      [   0,   0,   0, 0.6 ],
                "_DIS": [   0,   0,   0, 0.8 ],
                "corners":   [   2,   2,   2,   2 ],
                "_Stroke":   [   0, 255, 255, 0.5,   1,   1, 0.8, 0.5 ] // Cyan internal "circuit" line
            },
            "panel": {
                "_ON":       [  30,  30,  40, 0.6 ], // Frosted midnight panel
                "_OFF":      [  25,  25,  35, 0.7 ],
                "_DIS": [  15,  15,  20, 0.8 ],
                "corners":   [   0,   8,   0,   8 ], // Inverse corners to the bg
                "_Shadow":   [   0, 255, 255, 0.2,   0,   0,   5, 0.8, 0.5 ] // Subtle cyan hum
            },
            "btn": {
                "_ON":       [ 255,   0, 255, 0.9 ], // Hot Pink "Active" state
                "_OFF":      [  40,  40,  50, 1.0 ],
                "_DIS": [  20,  20,  25, 1.0 ],
                "corners":   [   4,   4,   4,   4 ],
                "_Shadow":   [ 255,   0, 255, 0.5,   0,   0,   8, 0.8, 0.5 ]
            },
            "t_textBig": {
                "_ON":       [   0, 255, 255, 1.0, 0.8, 0.3 ], // Neon Cyan Title
                "_OFF":      [   0, 200, 200, 1.0 ],
                "_DIS": [   0,  80,  80, 1.0 ]
            },
            "t_textNormal": {
                "_ON":       [ 255, 255, 255, 1.0, 0.9, 0.5 ], // Pure white focus
                "_OFF":      [ 180, 180, 200, 1.0 ],
                "_DIS": [  80,  80, 100, 1.0 ]
            },
            "t_textSmall": {
                "_ON":       [ 255,   0, 255, 1.0, 0.8, 0.4 ], // Magenta accents
                "_OFF":      [ 150,   0, 150, 1.0 ],
                "_DIS": [  60,   0,  60, 1.0 ]
            }
        },
        // another gemini thing
        "Deep_Evergreen": {
            "bg": {
                "_ON":       [  34,  44,  34, 1.0 ], // Deep Moss Green
                "_OFF":      [  28,  34,  28, 1.0 ],
                "_DIS": [  20,  25,  20, 1.0 ],
                "corners":   [  10,  10,  10,  10 ], // Organic, rounded feel
                "_Shadow":   [  10,  20,  10, 0.4,   0,   4,  10, 0.8, 0.5 ], // Earthy dark shadow
                "_Stroke":   [  85, 107,  47, 0.5,   1,   0, 0.8, 0.5 ]  // Olive Drab subtle border
            },
            "dialog": {
                "_ON":       [  20,  26,  20, 0.8 ], // Recessed forest floor
                "_OFF":      [  15,  20,  15, 0.9 ],
                "_DIS": [  10,  12,  10, 1.0 ],
                "corners":   [   4,   4,   4,   4 ],
                "_Stroke":   [  60,  80,  60, 0.3,   1,   1, 0.8, 0.5 ] // Soft lichen-green inset
            },
            "panel": {
                "_ON":       [  60,  50,  40, 0.9 ], // Warm Cedar/Bark wood tone
                "_OFF":      [  50,  42,  34, 0.9 ],
                "_DIS": [  35,  30,  25, 1.0 ],
                "corners":   [   6,   6,   6,   6 ],
                "_Shadow":   [   0,   0,   0, 0.2,   0,   2,   4, 0.8, 0.5 ]
            },
            "btn": {
                "_ON":       [ 144, 238, 144, 0.9 ], // Bright "Spring Bud" green for interaction
                "_OFF":      [  85, 107,  47, 1.0 ], // Muted olive button
                "_DIS": [  40,  50,  40, 1.0 ],
                "corners":   [  20,  20,  20,  20 ], // Very rounded, "pebble" like buttons
                "_Shadow":   [  70,  90,  70, 0.4,   0,   1,   4, 0.8, 0.5 ]
            },
            "t_textBig": {
                "_ON":       [ 245, 255, 235, 1.0, 0.8, 0.4 ], // Soft "Morning Light" cream
                "_OFF":      [ 180, 190, 170, 1.0 ],
                "_DIS": [  90, 100,  90, 1.0 ]
            },
            "t_textNormal": {
                "_ON":       [ 220, 230, 210, 1.0, 0.8, 0.4 ],
                "_OFF":      [ 150, 160, 140, 1.0 ],
                "_DIS": [  70,  80,  70, 1.0 ]
            },
            "t_textSmall": {
                "_ON":       [ 255, 215,   0, 0.8, 0.7, 0.3 ], // "Sunlight" Gold accents
                "_OFF":      [ 180, 150,   0, 0.8 ],
                "_DIS": [  80,  70,   0, 1.0 ]
            }
        }
    };
}

/**
 * System Default Values
 * Stores internal constants used for generating new subsystems and initial states.
 */
export function ThemeDefaults() {
    return {
        "SubsystemArrays": {
            // [R, G, B, A, OffsetX, OffsetY, Blur, OFF_Multiplier, DISABLED_Multiplier]
            "_Shadow": [0, 0, 0, 0.5, 0, 2, 8, 0.8, 0.5],
            // [R, G, B, A, OffsetX, OffsetY, Blur, OFF_Multiplier, DISABLED_Multiplier]
            "_Glow": [0, 0, 0, 0.5, 0, 2, 8, 0.8, 0.5],
            // [R, G, B, A, Width, Placement, OFF_Multiplier, DISABLED_Multiplier]
            "_Stroke": [0, 0, 0, 0.5, 1, 0, 0.8, 0.5]
        },
        "InitializationMultipliers": {
            "OFF": 0.7,
            "DISABLED": 0.3
        },
        "NodeDefaults": {
            "nodeCorner": 6,
            "fontSize": 10,
            "fontMain": "Dengxian",
            "fontSec": "Dengxian Light",
            "bgColor": "036, 036, 036, 1.00",
            "shadowAlpha_OFF": 0.5,
            "shadowAlpha_DIS": 0.1
        },
        "TextLabelMultipliers": {
            "OFF": 0.7,
            "DISABLED": 0.3
        }
    };
}