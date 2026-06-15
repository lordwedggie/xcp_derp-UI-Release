/**
 * Standard Markdown HTML renderer with safe local media embeds.
 */
import { applyHTMLTheme } from "../masterPainterHTML.js";
import { calculateScreenCoords, resolvePaintData, resolveWidgetEnv } from "../utils/widgetsUtils.js";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".ogg", ".ogv", ".mov", ".m4v"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);
const SAFE_LINK_SCHEMES = ["http:", "https:", "mailto:"];
const VIDEO_HOST_PATTERNS = [
    /^https:\/\/github\.com\/user-attachments\/assets\//i,
];
const VIDEO_EXTENSION_PATTERN = /\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:[?#][^\s<]*)?$/i;
const MARKDOWN_RENDER_VERSION = "direct-media-src-2026-06-15";
const MARKDOWN_NAV_HANDLER_VERSION = "doc-link-click-2026-06-15";

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function decodeHtmlAttributeText(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
}

function sanitizeColorStyle(styleValue) {
    const colorRule = String(styleValue || "")
        .split(";")
        .map(part => part.trim())
        .find(part => /^color\s*:/i.test(part));
    if (!colorRule) return "";

    const color = colorRule.replace(/^color\s*:/i, "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(color)) return `color: ${color}`;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return `color: ${color}`;
    if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return `color: ${color}`;
    return "";
}

function restoreEscapedInlineHtml(output, basePath) {
    return String(output || "").replace(/&lt;(\/?)(span|strong|b|em|i|br)(.*?)&gt;/gi, (match, slash, tag, attrs) => {
        const normalizedTag = String(tag || "").toLowerCase();
        if (slash) return normalizedTag === "br" ? "" : `</${normalizedTag}>`;
        const rawAttrs = decodeHtmlAttributeText(attrs || "");
        const safe = sanitizeInlineHtml(`<${normalizedTag}${rawAttrs}></${normalizedTag}>`, basePath);
        const open = safe.match(/^<[^>]+>/);
        return open ? open[0] : "";
    });
}

function getMediaPathForType(rawUrl) {
    const value = String(rawUrl || "");
    try {
        const parsed = new URL(value, window.location.href);
        if (parsed.pathname.endsWith("/xcp/markdown_media")) {
            return decodeMarkdownPath(parsed.searchParams.get("path") || value);
        }
    } catch {}
    return value;
}

function getLocalMarkdownMediaPath(rawUrl) {
    try {
        const parsed = new URL(String(rawUrl || ""), window.location.href);
        if (parsed.origin === window.location.origin && parsed.pathname.endsWith("/xcp/markdown_media")) {
            return decodeMarkdownPath(parsed.searchParams.get("path") || "");
        }
    } catch {}
    return "";
}

function isLocalMarkdownMediaUrl(rawUrl) {
    return Boolean(getLocalMarkdownMediaPath(rawUrl));
}

function getPathExtension(url) {
    const clean = getMediaPathForType(url).split("#")[0].split("?")[0].toLowerCase();
    const dot = clean.lastIndexOf(".");
    return dot >= 0 ? clean.slice(dot) : "";
}

function isVideoPath(url) {
    return VIDEO_EXTENSIONS.has(getPathExtension(url));
}

function isVideoUrl(url) {
    const value = String(url || "").trim();
    return isVideoPath(value) || VIDEO_HOST_PATTERNS.some(pattern => pattern.test(value));
}

function isImagePath(url) {
    return IMAGE_EXTENSIONS.has(getPathExtension(url));
}

function getVideoMimeType(url) {
    switch (getPathExtension(url)) {
        case ".mp4":
        case ".m4v":
            return "video/mp4";
        case ".webm":
            return "video/webm";
        case ".ogg":
        case ".ogv":
            return "video/ogg";
        case ".mov":
            return "video/quicktime";
        default:
            return "";
    }
}

function isSafeRemoteUrl(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
    try {
        const parsed = new URL(value);
        return SAFE_LINK_SCHEMES.includes(parsed.protocol);
    } catch {
        return false;
    }
}

function isBlockedPath(rawUrl) {
    const value = String(rawUrl || "").trim();
    if (!value || value.startsWith("#")) return false;
    if (/^(javascript|data|vbscript):/i.test(value)) return true;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !isSafeRemoteUrl(value)) return true;
    return false;
}

function normalizeMarkdownRelativePath(path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/");
    const stack = [];
    for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") {
            if (!stack.length) return "";
            stack.pop();
            continue;
        }
        stack.push(part);
    }
    return stack.join("/");
}

function decodeMarkdownPath(path) {
    try {
        return decodeURIComponent(String(path || ""));
    } catch {
        return String(path || "");
    }
}

function resolveMarkdownMediaUrl(rawUrl, basePath = "") {
    const value = String(rawUrl || "").trim();
    if (!value || isBlockedPath(value)) return "";
    if (value.startsWith("/xcp/") || value.startsWith("#") || isSafeRemoteUrl(value)) return value;

    const normalizedBase = String(basePath || "").replace(/\\/g, "/");
    const base = normalizedBase.includes("/") ? normalizedBase.replace(/\/[^/]*$/, "") : "";
    const joined = normalizeMarkdownRelativePath(base ? `${base}/${value}` : value);
    if (!joined) return "";
    return `/xcp/markdown_media?path=${encodeURIComponent(joined)}`;
}

function resolveMarkdownDocPath(rawUrl, basePath = "") {
    const value = String(rawUrl || "").trim();
    if (!value || isBlockedPath(value) || value.startsWith("#")) return "";
    if (isSafeRemoteUrl(value) || value.startsWith("/xcp/")) return "";

    const normalizedBase = String(basePath || "").replace(/\\/g, "/");
    const base = normalizedBase.includes("/") ? normalizedBase.replace(/\/[^/]*$/, "") : "";
    const joined = normalizeMarkdownRelativePath(base ? `${base}/${value}` : value);
    const decoded = decodeMarkdownPath(joined);
    return decoded && /\.(md|markdown)$/i.test(decoded) ? decoded : "";
}

function resolveClickedMarkdownDocPath(anchor, basePath = "") {
    const taggedPath = anchor?.getAttribute?.("data-markdown-doc");
    if (taggedPath) return decodeMarkdownPath(taggedPath);

    const rawHref = anchor?.getAttribute?.("href") || "";
    if (!rawHref || rawHref.startsWith("#")) return "";

    if (rawHref.startsWith("/xcp/markdown_media")) {
        try {
            const parsed = new URL(rawHref, window.location.href);
            const mediaPath = decodeMarkdownPath(parsed.searchParams.get("path") || "");
            return /\.(md|markdown)$/i.test(mediaPath) ? mediaPath : "";
        } catch {
            return "";
        }
    }

    return resolveMarkdownDocPath(rawHref, basePath);
}

function sanitizeInlineHtml(rawHtml, basePath) {
    const template = document.createElement("template");
    template.innerHTML = rawHtml;
    const allowedTags = new Set(["VIDEO", "SOURCE", "TRACK", "P", "BR", "STRONG", "B", "EM", "I", "CODE", "PRE", "UL", "OL", "LI", "BLOCKQUOTE", "A", "IMG", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "SPAN"]);
    const allowedAttrs = {
        A: new Set(["href", "title", "data-markdown-doc"]),
        IMG: new Set(["src", "alt", "title", "width", "height"]),
        VIDEO: new Set(["src", "controls", "muted", "loop", "poster", "preload", "playsinline", "width", "height", "title", "data-markdown-src", "data-video-type"]),
        SOURCE: new Set(["src", "type"]),
        TRACK: new Set(["src", "kind", "srclang", "label", "default"]),
        SPAN: new Set(["title", "style"]),
    };
    const booleanAttrs = new Set(["controls", "muted", "loop", "playsinline", "default"]);

    const normalizeLocalVideoSources = (root) => {
        root.querySelectorAll?.("video").forEach((video) => {
            const source = video.querySelector("source[src]");
            const sourceSrc = source?.getAttribute("src");
            if (!video.getAttribute("src") && sourceSrc) {
                video.setAttribute("src", sourceSrc);
            }
            video.querySelectorAll("source[src]").forEach((childSource) => {
                if (isLocalMarkdownMediaUrl(childSource.getAttribute("src"))) childSource.remove();
            });
        });
    };

    const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.COMMENT_NODE) {
                child.remove();
                continue;
            }
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            if (!allowedTags.has(child.tagName)) {
                child.replaceWith(document.createTextNode(child.textContent || ""));
                continue;
            }

            const tagAttrs = allowedAttrs[child.tagName] || new Set();
            for (const attr of Array.from(child.attributes)) {
                const name = attr.name.toLowerCase();
                if (name.startsWith("on") || name === "style" || !tagAttrs.has(attr.name)) {
                    if (child.tagName === "SPAN" && name === "style" && tagAttrs.has("style")) {
                        const safeStyle = sanitizeColorStyle(attr.value);
                        if (safeStyle) child.setAttribute("style", safeStyle);
                        else child.removeAttribute(attr.name);
                    } else {
                        child.removeAttribute(attr.name);
                    }
                    continue;
                }
                if (["src", "poster", "href"].includes(name)) {
                    if (name === "href") {
                        const docPath = resolveMarkdownDocPath(attr.value, basePath);
                        if (docPath) {
                            child.setAttribute("href", "#");
                            child.setAttribute("data-markdown-doc", docPath);
                        } else if (!attr.value || isBlockedPath(attr.value)) {
                            child.removeAttribute(attr.name);
                        }
                    } else {
                        const resolved = resolveMarkdownMediaUrl(attr.value, basePath);
                        if (!resolved || isBlockedPath(resolved)) child.removeAttribute(attr.name);
                        else child.setAttribute(attr.name, resolved);
                    }
                }
            }
            if (child.tagName === "VIDEO") {
                child.setAttribute("controls", "");
                child.setAttribute("playsinline", "");
                if (!child.getAttribute("preload")) child.setAttribute("preload", "auto");
                child.removeAttribute("autoplay");
            }
            for (const name of booleanAttrs) {
                if (child.hasAttribute(name)) child.setAttribute(name, "");
            }
            walk(child);
        }
    };

    walk(template.content);
    normalizeLocalVideoSources(template.content);
    return template.innerHTML;
}

function getMarkdownMediaLabel(path, fallback = "Video") {
    const value = decodeMarkdownPath(getMediaPathForType(path).split("?")[0].split("#")[0]);
    const parts = value.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] || fallback;
}

function renderMarkdownVideo(src, label, title = "") {
    const display = String(label || title || getMarkdownMediaLabel(src, "Video")).trim() || "Video";
    const safeSrc = escapeHtml(src);
    const safeTitle = escapeHtml(title || display);
    const mimeType = getVideoMimeType(src);
    const typeAttr = mimeType ? ` data-video-type="${escapeHtml(mimeType)}"` : "";
    const sourceAttr = isLocalMarkdownMediaUrl(src) ? ` data-markdown-src="${safeSrc}"` : "";
    return `<video controls playsinline preload="metadata" src="${safeSrc}"${sourceAttr} title="${safeTitle}"${typeAttr}></video>`;
}

function renderInlineMarkdown(text, basePath) {
    let output = escapeHtml(text);
    output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
    output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    output = output.replace(/!\[\[([^\]]+)\]\]/g, (match, target) => {
        const [rawPath, rawLabel] = decodeHtmlAttributeText(target).split("|");
        const mediaPath = String(rawPath || "").trim();
        const label = String(rawLabel || mediaPath).trim();
        const resolved = resolveMarkdownMediaUrl(mediaPath, basePath);
        if (!resolved) return `<span class="derp-md-missing">${escapeHtml(label)}</span>`;
        if (isVideoUrl(mediaPath)) {
            return renderMarkdownVideo(resolved, label);
        }
        if (isImagePath(mediaPath)) {
            return `<img class="derp-md-image" src="${escapeHtml(resolved)}" alt="${escapeHtml(label)}">`;
        }
        return match;
    });
    output = output.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (match, alt, url, title) => {
        const resolved = resolveMarkdownMediaUrl(url, basePath);
        if (!resolved) return `<span class="derp-md-missing">${escapeHtml(alt || url)}</span>`;
        if (isVideoUrl(url)) {
            return renderMarkdownVideo(resolved, alt || title || getMarkdownMediaLabel(url), title);
        }
        if (isImagePath(url)) {
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
            return `<img class="derp-md-image" src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}"${titleAttr}>`;
        }
        return `<a href="${escapeHtml(resolved)}">${escapeHtml(alt || url)}</a>`;
    });
    output = output.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (match, label, url, title) => {
        if (isBlockedPath(url)) return escapeHtml(label);
        const docPath = resolveMarkdownDocPath(url, basePath);
        if (docPath) {
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
            return `<a href="#" data-markdown-doc="${escapeHtml(docPath)}"${titleAttr}>${label}</a>`;
        }
        const href = isSafeRemoteUrl(url) || String(url).startsWith("#") ? url : resolveMarkdownMediaUrl(url, basePath);
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return href ? `<a href="${escapeHtml(href)}"${titleAttr}>${label}</a>` : label;
    });
    output = output.replace(/(^|[\s>])&lt;(https?:\/\/[^<>\s]+)&gt;/g, (match, prefix, url) => {
        if (!isVideoUrl(url)) return match;
        const resolved = resolveMarkdownMediaUrl(url, basePath);
        return resolved ? `${prefix}${renderMarkdownVideo(resolved, getMarkdownMediaLabel(url))}` : match;
    });
    output = output.replace(/(^|[\s>])&lt;([^<>\s]+)&gt;/g, (match, prefix, url) => {
        if (!VIDEO_EXTENSION_PATTERN.test(url)) return match;
        const resolved = resolveMarkdownMediaUrl(url, basePath);
        return resolved ? `${prefix}${renderMarkdownVideo(resolved, getMarkdownMediaLabel(url))}` : match;
    });
    output = output.replace(/(^|[\s>])(https?:\/\/[^\s<]+)(?=$|[\s<])/g, (match, prefix, url) => {
        if (!isVideoUrl(url)) return match;
        const resolved = resolveMarkdownMediaUrl(url, basePath);
        return resolved ? `${prefix}${renderMarkdownVideo(resolved, getMarkdownMediaLabel(url))}` : match;
    });
    output = output.replace(/(^|[\s>])((?:\.{0,2}\/)?[^\s<>"']+\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:[?#][^\s<]*)?)(?=$|[\s<])/gi, (match, prefix, url) => {
        const resolved = resolveMarkdownMediaUrl(url, basePath);
        return resolved ? `${prefix}${renderMarkdownVideo(resolved, getMarkdownMediaLabel(url))}` : match;
    });
    return restoreEscapedInlineHtml(output, basePath);
}

function syncMarkdownMediaStyles(element, scale) {
    const mediaMaxWidth = "100%";
    element.querySelectorAll("img").forEach((media) => {
        media.style.maxWidth = mediaMaxWidth;
        media.style.height = "auto";
        media.style.display = "block";
        media.style.margin = `${4 * scale}px 0`;
        media.style.pointerEvents = "auto";
    });
    element.querySelectorAll("video").forEach((media) => {
        media.style.maxWidth = mediaMaxWidth;
        media.style.height = "auto";
        media.style.display = "block";
        media.style.margin = `${4 * scale}px 0`;
        media.style.background = "#000";
        media.style.pointerEvents = "auto";
        media.setAttribute("controls", "");
        media.setAttribute("playsinline", "");
        if (!media.getAttribute("preload")) media.setAttribute("preload", "auto");
    });
}

function getMarkdownVideoSource(video) {
    return video?.getAttribute?.("data-markdown-src")
        || video?.getAttribute?.("src")
        || video?.querySelector?.("source[src]")?.getAttribute?.("src")
        || "";
}

function resolveMarkdownVideoSource(rawUrl, basePath = "") {
    const value = String(rawUrl || "").trim();
    if (!value) return "";
    if (isLocalMarkdownMediaUrl(value) || isSafeRemoteUrl(value)) return value;
    if (isVideoUrl(value)) return resolveMarkdownMediaUrl(value, basePath);
    return value;
}

function normalizeRawMarkdownVideos(element, basePath = "") {
    element.querySelectorAll("video").forEach((video) => {
        let sourceUrl = getMarkdownVideoSource(video);
        if (!sourceUrl) {
            video.remove();
            return;
        }
        const resolvedSourceUrl = resolveMarkdownVideoSource(sourceUrl, basePath);
        if (resolvedSourceUrl && resolvedSourceUrl !== sourceUrl) {
            sourceUrl = resolvedSourceUrl;
            if (isLocalMarkdownMediaUrl(sourceUrl)) video.setAttribute("data-markdown-src", sourceUrl);
            video.setAttribute("src", sourceUrl);
            video.querySelectorAll("source").forEach(source => source.remove());
            video._derpMarkdownLoadRequested = false;
        }
        video.setAttribute("controls", "");
        video.setAttribute("playsinline", "");
        if (!video.getAttribute("preload")) video.setAttribute("preload", "metadata");
        if (isLocalMarkdownMediaUrl(sourceUrl)) {
            video.setAttribute("data-markdown-src", sourceUrl);
            if (video.getAttribute("src") !== sourceUrl) {
                video.setAttribute("src", sourceUrl);
                video._derpMarkdownLoadRequested = false;
            }
        }
        if (!video._derpMarkdownLoadRequested) {
            video._derpMarkdownLoadRequested = true;
            video.load();
        }
    });
}

export function renderDerpMarkdown(markdown, options = {}) {
    const basePath = options.basePath || "";
    const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let listType = null;
    let inCode = false;
    let codeLines = [];

    const flushParagraph = () => {
        if (!paragraph.length) return;
        html.push(`<p>${renderInlineMarkdown(paragraph.join(" "), basePath)}</p>`);
        paragraph = [];
    };
    const closeList = () => {
        if (!listType) return;
        html.push(`</${listType}>`);
        listType = null;
    };

    for (const line of lines) {
        const raw = line;
        if (/^```/.test(raw.trim())) {
            if (inCode) {
                html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
                codeLines = [];
                inCode = false;
            } else {
                flushParagraph();
                closeList();
                inCode = true;
            }
            continue;
        }
        if (inCode) {
            codeLines.push(raw);
            continue;
        }

        if (/^\s*$/.test(raw)) {
            flushParagraph();
            closeList();
            continue;
        }

        if (/^\s*</.test(raw)) {
            flushParagraph();
            closeList();
            html.push(sanitizeInlineHtml(raw, basePath));
            continue;
        }

        const heading = raw.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            flushParagraph();
            closeList();
            const level = heading[1].length;
            html.push(`<h${level}>${renderInlineMarkdown(heading[2], basePath)}</h${level}>`);
            continue;
        }

        if (/^\s*---+\s*$/.test(raw)) {
            flushParagraph();
            closeList();
            html.push("<hr>");
            continue;
        }

        const unordered = raw.match(/^\s*[-*+]\s+(.+)$/);
        const ordered = raw.match(/^\s*\d+[.)]\s+(.+)$/);
        if (unordered || ordered) {
            flushParagraph();
            const nextType = unordered ? "ul" : "ol";
            if (listType !== nextType) {
                closeList();
                listType = nextType;
                html.push(`<${listType}>`);
            }
            html.push(`<li>${renderInlineMarkdown((unordered || ordered)[1], basePath)}</li>`);
            continue;
        }

        const quote = raw.match(/^>\s?(.*)$/);
        if (quote) {
            flushParagraph();
            closeList();
            html.push(`<blockquote>${renderInlineMarkdown(quote[1], basePath)}</blockquote>`);
            continue;
        }

        paragraph.push(raw.trim());
    }

    if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    flushParagraph();
    closeList();
    return sanitizeInlineHtml(html.join("\n"), basePath);
}

export function createMarkdownHTML() {
    const el = document.createElement("div");
    el.className = "derp-markdown-html";
    el.style.willChange = "transform, opacity";
    return el;
}

export function syncMarkdownHTML(element, node, app, config) {
    if (!element || !config.geometry) return;
    if (!element.parentNode) document.body.appendChild(element);

    const { x, y, w, h } = config.geometry;
    const coords = calculateScreenCoords(node, app, x, y, w, h);
    if (!coords) return;

    const { props, bodyPaint, labelPaint, alpha } = resolveWidgetEnv(node, config, app);
    const scale = coords.scale || 1;
    const markdown = String(config.markdown ?? config.value ?? config.text ?? "");
    const basePath = config.basePath || config.markdownPath || "";
    const zIndex = config.zIndex ?? ((Number(node._masterZHtml) || Number(node._masterZShield) || 1000) + 1);
    const renderHash = `${MARKDOWN_RENDER_VERSION}|${markdown}|${basePath}`;
    const styleHash = `${renderHash}|${coords.left}|${coords.top}|${coords.width}|${coords.height}|${scale}|${alpha}|${zIndex}`;

    element._markdownDocNavigate = typeof config.onNavigate === "function" ? config.onNavigate : null;
    element._markdownBasePath = basePath;
    if (element._markdownDocNavHandlerVersion !== MARKDOWN_NAV_HANDLER_VERSION) {
        if (element._markdownDocNavHandler) {
            element.removeEventListener("click", element._markdownDocNavHandler);
            element.removeEventListener("click", element._markdownDocNavHandler, true);
        }
        element._markdownDocNavHandler = (event) => {
            const anchor = event.target?.closest?.("a");
            if (!anchor) return;

            const docPath = resolveClickedMarkdownDocPath(anchor, element._markdownBasePath || "");
            if (!docPath) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            if (typeof element._markdownDocNavigate === "function") element._markdownDocNavigate(docPath);
        };
        element.addEventListener("click", element._markdownDocNavHandler, true);
        element._markdownDocNavHandlerVersion = MARKDOWN_NAV_HANDLER_VERSION;
    }

    if (element._lastMarkdownRenderHash !== renderHash) {
        element._lastMarkdownRenderHash = renderHash;
        element.dataset.markdownRenderVersion = MARKDOWN_RENDER_VERSION;
        element.innerHTML = renderDerpMarkdown(markdown, { basePath });
        normalizeRawMarkdownVideos(element, basePath);
        syncMarkdownMediaStyles(element, scale);
    }

    if (element._lastMarkdownStyleHash !== styleHash || node._forceSync) {
        element._lastMarkdownStyleHash = styleHash;
        const paint = bodyPaint || resolvePaintData(node, props.bodyKey || "panel", config.state || "OFF");
        const textPaint = labelPaint || resolvePaintData(node, props.textKey || "t_textNormal", config.state || "OFF");
        applyHTMLTheme(element, {
            ...(paint || {}),
            font: textPaint?.font || paint?.font || "Arial",
            fontSize: textPaint?.fontSize || paint?.fontSize || 10,
            fontWeight: textPaint?.fontWeight || paint?.fontWeight || "normal",
            textColor: textPaint?.textColor || textPaint?.fill || paint?.textColor || "white",
        }, scale);
        Object.assign(element.style, {
            position: "absolute",
            left: coords.left,
            top: coords.top,
            width: coords.width,
            height: coords.height,
            boxSizing: "border-box",
            display: "block",
            overflow: config.overflow || "auto",
            pointerEvents: "auto",
            zIndex: String(zIndex),
            opacity: String(alpha),
            lineHeight: "1.45",
            whiteSpace: "normal",
        });
        syncMarkdownMediaStyles(element, scale);
    }
}
