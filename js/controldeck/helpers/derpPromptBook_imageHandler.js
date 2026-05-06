/**
 * PROJECT: derpNodes | NODE: derpPromptBook
 * FILE: derpPromptBook_imageHandler.js
 * PURPOSE: Binary Disk-Streaming, Inside Selection Stroke, and Exact Canvas/HTML Parity.
 */

const imageResizeWidth = 512;

async function uploadBinaryToServer(file, node) {
    try {
        const formData = new FormData();
        // THE SYNC FIX: Trim the book name to match the server's folder structure exactly
        const currentName = (node.properties.bookName || "Untitled Book").trim();

        formData.append('bookName', currentName);
        formData.append('image', file);

        const response = await fetch("/xcp/upload_asset/derpPromptBook", {
            method: "POST",
            body: formData
        });
        if (response.ok) {
            const data = await response.json();
            return (data.filename === "null" || !data.filename) ? null : data.filename;
        }
    } catch (e) { console.error("Binary Upload Failed:", e); }
    return null;
}

async function deleteImageFromServer(filename, node) {
    if (!filename || filename.startsWith("data:") || filename.startsWith("http")) return;
    try {
        await fetch("/xcp/delete_asset/derpPromptBook", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: filename, bookName: node.properties.bookName || "Untitled Book" })
        });
    } catch (e) { console.error("Disk Cleanup Failed:", e); }
}

async function resizeImage(file, maxWidth) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob), 'image/png');
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export function setupPromptBookImageSupport(el, node) {
    if (!el || el._hasPromptBookImageSupport) return;

    el.addEventListener("keydown", (e) => {
        const selectedImg = el.querySelector("img[data-derp-selected='true']");
        if (selectedImg && (e.key === "Backspace" || e.key === "Delete")) {
            e.preventDefault();
            selectedImg.remove();
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });

    el.addEventListener("click", (e) => {
        if (e.target.tagName !== "IMG") {
            el.querySelectorAll("img[data-derp-image]").forEach(img => {
                img.style.outline = "none";
                img.setAttribute("data-derp-selected", "false");
            });
        }
    });

    Object.defineProperty(el, "innerText", {
        configurable: true,
        get: function() {
            let txt = "";
            // THE MULTI-IMAGE FIX: Recursively walk nodes to find images nested inside DIVs/P tags
            const walk = (node) => {
                node.childNodes.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        txt += child.textContent;
                    } else if (child.nodeName === "BR") {
                        txt += "\n";
                    } else if (child.nodeName === "IMG" && child.hasAttribute("data-derp-image")) {
                        const imgName = child.getAttribute("data-img-name") || "";
                        if (txt.length > 0 && !txt.endsWith("\n")) txt += "\n";
                        // THE CANVAS FIX: Restore the trailing \n to isolate the marker for the Canvas engine.
                        // The setter's trim logic will filter this out so HTML mode doesn't gap.
                        txt += `[[IMG:${imgName}]]\n`;
                    } else if (child.nodeName === "DIV" || child.nodeName === "P") {
                        // THE EXTRA LINE BREAK FIX: Only ensure newline BEFORE the block, not after
                        if (txt.length > 0 && !txt.endsWith("\n")) txt += "\n";
                        walk(child);
                    } else {
                        walk(child);
                    }
                });
            };
            walk(this);
            return txt.replace(/\n$/, ""); // Clean return without collapsing user spacing
        },
        set: function(v) {
            const cleanVal = v || "";
            if (this._lastDerpValue === cleanVal) return;
            this._lastDerpValue = cleanVal;
            this._isRebuildingImages = true;

            this.innerHTML = "";
            // THE MULTI-IMAGE FIX: Use a simple split to ensure every image marker is captured
            const parts = cleanVal.split(/(\[\[IMG:[\s\S]*?\]\])/g);

            parts.forEach((part, i) => {
                const imgMatch = part.match(/^\[\[IMG:([\s\S]*?)\]\]$/);
                if (imgMatch) {
                    const imgName = imgMatch[1].trim();
                    let imgSrc = imgName;
                    if (!imgName.startsWith("data:image") && !imgName.startsWith("http") && !imgName.startsWith("/")) {
                        const currentBook = (node.properties.bookName || "Untitled Book").trim();
                        // THE ASSET PATH FIX: Use the 'derpPromptBook' category to resolve assets from the correct user folder
                        imgSrc = `/xcp/get_asset/derpPromptBook?name=${encodeURIComponent(imgName)}&bookName=${encodeURIComponent(currentBook)}`;
                    }
                    const img = document.createElement("img");
                    img.src = imgSrc;
                    img.style.width = "100%"; img.style.height = "auto";
                    img.style.display = "block"; img.style.margin = "0 0 10px 0";
                    img.setAttribute("data-derp-image", "true");
                    img.setAttribute("data-img-name", imgName);
                    img.contentEditable = "false";
                    img.draggable = true;

                    img.style.cursor = "pointer";
                    img.addEventListener("click", (e) => {
                        el.querySelectorAll("img[data-derp-image]").forEach(i => {
                            i.style.outline = "none";
                            i.setAttribute("data-derp-selected", "false");
                        });
                        img.style.outline = "2px solid #00b4ff";
                        img.style.outlineOffset = "-2px";
                        img.setAttribute("data-derp-selected", "true");
                        e.stopPropagation();
                    });

                    img.addEventListener("dragstart", (e) => {
                        e.dataTransfer.setData("text/plain", `[[IMG:${imgName}]]`);
                        e.dataTransfer.effectAllowed = "move";
                    });
                    img.onload = () => { node.setDirtyCanvas(true); };
                    this.appendChild(img);
                } else if (part) {
                    // THE EXTRA LINE BREAK FIX: Aggressively trim all adjacent newlines touching images
                    let cleanPart = part;
                    if (i < parts.length - 1 && parts[i+1].startsWith("[[IMG:")) cleanPart = cleanPart.replace(/\n+$/, "");
                    if (i > 0 && parts[i-1].startsWith("[[IMG:")) cleanPart = cleanPart.replace(/^\n+/, "");

                    if (!cleanPart) return;

                    const lines = cleanPart.split('\n');
                    lines.forEach((line, j) => {
                        if (line) this.appendChild(document.createTextNode(line));
                        if (j < lines.length - 1) this.appendChild(document.createElement("br"));
                    });
                }
            });

            if (this._derpObserver) this._derpObserver.takeRecords();
            this._lastImgList = Array.from(this.querySelectorAll("img[data-derp-image]")).map(img => img.getAttribute("data-img-name")).filter(n => !!n);
            this._isRebuildingImages = false;
        }
    }); // THE SYNTAX FIX: Correctly closes the Object.defineProperty block

    el._lastImgList = Array.from(el.querySelectorAll("img[data-derp-image]")).map(img => img.getAttribute("data-img-name")).filter(n => !!n);

    el._derpObserver = new MutationObserver(() => {
        // THE BUG FIX: Prevent deletion/overwrite when Fatha destroys the element on blur
        if (el._isRebuildingImages || !document.body.contains(el)) return;
        const activePage = node.properties?.derpBook?.[node.properties?.currentPageIndex || 0];
        if (activePage) {
            const newContent = el.innerText;
            const currentImgList = Array.from(el.querySelectorAll("img[data-derp-image]")).map(img => img.getAttribute("data-img-name")).filter(n => !!n);

            el._lastImgList?.forEach(oldImg => {
                if (!currentImgList.includes(oldImg)) {
                    deleteImageFromServer(oldImg, node);
                }
            });
            el._lastImgList = [...currentImgList];

            if (activePage.content !== newContent) {
                activePage.content = newContent;
                activePage.images = currentImgList;
                node.properties.prompt = newContent;

                const w = node.widgets?.find(x => x.name === "prompt");
                if (w) w.value = newContent;

                if (node.syncDerpOutputs) node.syncDerpOutputs();
                node.setDirtyCanvas(true);
            }
        }
    });
    el._derpObserver.observe(el, { childList: true, subtree: true, characterData: true });

    el.addEventListener("paste", async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const range = sel.getRangeAt(0);

        el._isRebuildingImages = true;

        let containsImage = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                containsImage = true;
                break;
            }
        }

        if (containsImage) {
            e.preventDefault();
            e.stopImmediatePropagation();
            e.stopPropagation();

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf("image") !== -1) {
                    const originalFile = items[i].getAsFile();
                    const resizedBlob = await resizeImage(originalFile, imageResizeWidth);
                    const filename = await uploadBinaryToServer(resizedBlob, node);

                    if (filename && filename !== "null") {
                        const marker = `[[IMG:${filename}]]\n`;
                        range.deleteContents();
                        const textNode = document.createTextNode(marker);
                        range.insertNode(textNode);

                        // Update range for consecutive pastes
                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);

                        // Re-enable observer before forcing the innerText setter to rebuild the HTML
                        el._isRebuildingImages = false;
                        el.innerText = el.innerText;

                        // Guarantee data sync before Fatha blurs
                        const activePage = node.properties?.derpBook?.[node.properties?.currentPageIndex || 0];
                        if (activePage) activePage.content = el.innerText;

                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
        }
        el._isRebuildingImages = false; // THE SAFETY FIX: Ensure flag is cleared even on error
    }, true);

    el.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    });

    el.addEventListener("drop", (e) => {
        const data = e.dataTransfer.getData("text/plain");
        if (data && data.startsWith("[[IMG:")) {
            e.preventDefault();
            e.stopPropagation();
            const range = document.caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                range.deleteContents();
                // THE CANVAS FIX: Restore the trailing \n so dropped text doesn't glue to the marker
                const marker = `${data}\n`;
                const textNode = document.createTextNode(marker);
                range.insertNode(textNode);
                el.innerText = el.innerText;
            }
        }
    });

    el._hasPromptBookImageSupport = true;
    setTimeout(() => { el._lastDerpValue = null; el.innerText = el.innerText; }, 100);
}

export function stripImageBase64FromContent(content) {
    if (!content) return "";
    return content.replace(/\[\[IMG:data:image\/[\s\S]*?;base64,[\s\S]*?\]\]\n?/g, "");
}