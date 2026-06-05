import { app } from "../../scripts/app.js";

const MAX_SLOTS = 10;
const PREFIXES = ["lora", "strength", "enabled", "fuse_qkv"];

function makeDivider(slotNum) {
    return {
        name: `divider_${slotNum}`,
        type: "divider",
        draw(ctx, node, width, y, height) {
            ctx.save();
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(10, y + height * 0.5);
            ctx.lineTo(width - 10, y + height * 0.5);
            ctx.stroke();
            ctx.restore();
        },
        computeSize() { return [0, 12]; },
        serialize: false,
    };
}

app.registerExtension({
    name: "ZImage.LoraStack",

    nodeCreated(node) {
        if (node.comfyClass !== "ZImageTurboLoraStack") return;

        node._slotBank = {};
        for (let i = MAX_SLOTS; i >= 1; i--) {
            const group = [];
            for (const prefix of PREFIXES) {
                const idx = node.widgets.findIndex(w => w.name === `${prefix}_${i}`);
                if (idx !== -1) group.unshift(node.widgets.splice(idx, 1)[0]);
            }
            if (group.length) node._slotBank[i] = group;
        }

        node._visibleSlots = 0;
        node.setSize([node.size[0], node.computeSize()[1]]);

        function removeSlot(slotNum) {
            for (let i = slotNum; i < node._visibleSlots; i++) {
                const src = node._slotBank[i + 1];
                const dst = node._slotBank[i];
                if (src && dst) {
                    for (let p = 0; p < PREFIXES.length; p++) {
                        if (dst[p] && src[p]) dst[p].value = src[p].value;
                    }
                }
            }

            const last = node._visibleSlots;
            const group     = node._slotBank[last];
            const divider   = node.widgets.find(w => w.name === `divider_${last}`);
            const removeBtn = node.widgets.find(w => w.name === `remove_${last}`);

            for (const w of [divider, ...(group ?? []), removeBtn].filter(Boolean)) {
                const idx = node.widgets.indexOf(w);
                if (idx !== -1) node.widgets.splice(idx, 1);
            }

            node._visibleSlots--;
            node.setSize([node.size[0], node.computeSize()[1]]);
            app.graph.setDirtyCanvas(true, false);
        }

        node._addSlot = function(values) {
            const next = node._visibleSlots + 1;
            if (next > MAX_SLOTS) return;
            const group = node._slotBank[next];
            if (!group) return;

            // Restore saved values if provided
            if (values) {
                for (let p = 0; p < PREFIXES.length; p++) {
                    if (group[p] && values[p] !== undefined) group[p].value = values[p];
                }
            }

            const addBtnIdx = node.widgets.length - 1;
            let insertAt = addBtnIdx;

            if (next > 1) {
                const div = makeDivider(next);
                node.widgets.splice(insertAt, 0, div);
                insertAt++;
            }

            for (let g = 0; g < group.length; g++) {
                node.widgets.splice(insertAt + g, 0, group[g]);
            }
            insertAt += group.length;

            node.addWidget("button", `✕ Remove LoRA ${next}`, null, () => removeSlot(next));
            const rw = node.widgets.pop();
            rw.name = `remove_${next}`;
            // FIX: Explicitly prevent this button from polluting the saved workflow data
            rw.serialize = false; 
            node.widgets.splice(insertAt, 0, rw);

            node._visibleSlots = next;
            node.setSize([node.size[0], node.computeSize()[1]]);
            app.graph.setDirtyCanvas(true, false);
        };

        node.addWidget("button", "+ Add LoRA", null, () => node._addSlot(null));
        // FIX: Explicitly prevent the Add button from saving as well
        node.widgets[node.widgets.length - 1].serialize = false; 

        // Intercept configure to restore saved slots with their values
        const origConfigure = node.onConfigure?.bind(node);
        node.onConfigure = function(config) {
            origConfigure?.(config);

            const vals = config.widgets_values;
            if (!vals) return;

            // FIX: Filter out null/undefined to handle varying ComfyUI serialization behavior.
            // This guarantees we only have the actual data widgets: [lora, strength, enabled, fuse_qkv] per slot.
            const dataVals = vals.filter(v => v !== null && v !== undefined);
            const numSlots = Math.floor(dataVals.length / PREFIXES.length);

            for (let i = 0; i < numSlots; i++) {
                const offset = i * PREFIXES.length;
                const chunk = dataVals.slice(offset, offset + PREFIXES.length);
                if (chunk[0] && chunk[0] !== "None") {
                    node._addSlot(chunk);
                }
            }
        };
    },
});
