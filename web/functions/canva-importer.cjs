const CANVA_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const DEFAULT_HEADERS = {
  "user-agent": CANVA_USER_AGENT,
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "cache-control": "no-cache",
  "pragma": "no-cache",
};

async function extractCanvaDeck(inputUrl, options = {}) {
  const normalized = normalizeCanvaUrl(inputUrl);
  if (!normalized) throw new Error("Link Canva tidak valid.");

  const resolvedUrl = await resolveCanvaUrl(normalized);
  const viewUrl = canvaViewUrl(resolvedUrl);
  const html = await fetchCanvaHtml(viewUrl);
  const bootstrap = extractBootstrap(html);
  const draft = findDraft(bootstrap);
  if (!draft) throw new Error("Data slide Canva tidak ditemukan. Pastikan link dibagikan publik.");
  const rasterAssets = collectCanvaRasterAssets(bootstrap);

  const thumbnailSet = draft.imageSets?.thumbnail;
  const images = Array.isArray(thumbnailSet?.images) ? thumbnailSet.images : [];
  if (!images.length) throw new Error("Render slide Canva tidak tersedia pada link ini.");

  const pageCount = Number(draft.pageCount) || images.length;
  const contentSize = canvaContentSize(draft.content);
  const maxSlides = Math.min(Math.max(Number(options.maxSlides) || images.length, 1), images.length);
  const selected = images
    .slice(0, Math.min(maxSlides, images.length))
    .sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0));

  const slides = [];
  for (const image of selected) {
    const rendered = await fetchImageAsDataUrl(image.url);
    const pageIndex = Math.max(0, (Number(image.page) || slides.length + 1) - 1);
    const page = Array.isArray(draft.content?.A) ? draft.content.A[pageIndex] : null;
    slides.push({
      page: Number(image.page) || slides.length + 1,
      pageHash: Number(image.pageHash) || 0,
      width: Number(image.width) || rendered.width || 16,
      height: Number(image.height) || rendered.height || 9,
      mime: rendered.mime,
      src: rendered.src,
      elements: await extractCanvaPageElements(page, contentSize, rasterAssets),
    });
  }

  const title = extractTitle(html) || draft.content?.D || "Presentasi Canva";
  const pageHashes = Array.isArray(draft.pageHashes)
    ? draft.pageHashes.map((item) => Number(item) || 0)
    : selected.map((item) => Number(item.pageHash) || 0);
  const signature = [
    String(draft.version || ""),
    String(draft.timestamp || ""),
    String(pageCount),
    selected.map((item) => `${item.page}:${item.pageHash}:${item.key || ""}`).join("|"),
  ].join("::");

  return {
    title,
    sourceUrl: normalized,
    resolvedUrl,
    viewUrl,
    importedAt: Date.now(),
    version: String(draft.version || ""),
    timestamp: Number(draft.timestamp) || 0,
    pageCount,
    pageHashes,
    signature,
    slides,
  };
}

function canvaContentSize(content) {
  const width = Number(content?.C?.A) || 1920;
  const height = Number(content?.C?.B) || 1080;
  return { width, height, sx: 960 / width, sy: 540 / height };
}

async function extractCanvaPageElements(page, size, rasterAssets) {
  if (!page || !Array.isArray(page.E)) return [];
  const elements = [];
  for (const element of page.E) {
    elements.push(...await convertCanvaElement(element, size, 0, 0, rasterAssets));
    if (elements.length >= 450) break;
  }
  return elements.slice(0, 450);
}

async function convertCanvaElement(element, size, offsetX, offsetY, rasterAssets) {
  if (!element || typeof element !== "object") return [];
  const type = element["A?"];
  if (type === "H" && Array.isArray(element.c)) {
    const groupX = offsetX + (Number(element.B) || 0);
    const groupY = offsetY + (Number(element.A) || 0);
    const groupElements = [];
    for (const child of element.c) groupElements.push(...await convertCanvaElement(child, size, groupX, groupY, rasterAssets));
    return groupElements;
  }
  if (type === "I") return await convertCanvaImageElement(element, size, offsetX, offsetY, rasterAssets);
  if (type === "K") {
    const text = canvaText(element.a);
    if (!text.trim()) return [];
    const style = canvaTextStyle(element.a);
    return [{
      type: "text",
      id: safeElementId(element._, "txt"),
      x: scaleX(offsetX + Number(element.B || 0), size),
      y: scaleY(offsetY + Number(element.A || 0), size),
      w: scaleX(Number(element.D || 10), size),
      h: scaleY(Number(element.C || 10), size),
      text,
      variant: style.fontSize >= 28 ? "title" : "body",
      fontSize: style.fontSize,
      color: style.color,
      fontFamily: style.fontFamily,
      bold: style.bold,
      italic: style.italic,
      underline: style.underline,
      align: style.align,
      lineHeight: style.lineHeight,
    }];
  }
  if (type === "J") {
    const fill = canvaShapeFill(element);
    const stroke = canvaShapeStroke(element);
    if (!fill && !stroke) return [];
    return [{
      type: "shape",
      id: safeElementId(element._, "shp"),
      x: scaleX(offsetX + Number(element.B || 0), size),
      y: scaleY(offsetY + Number(element.A || 0), size),
      w: scaleX(Number(element.D || 10), size),
      h: scaleY(Number(element.C || 10), size),
      shape: canvaShapeKind(element),
      fill: fill || "transparent",
      stroke: stroke || "transparent",
    }];
  }
  if (type === "U") {
    const rotation = Number(element.E) || 0;
    const horizontal = Math.abs(rotation % 180) < 45 || Math.abs(rotation % 180) > 135;
    return [{
      type: "shape",
      id: safeElementId(element._, "line"),
      x: scaleX(offsetX + Number(element.B || 0), size),
      y: scaleY(offsetY + Number(element.A || 0), size),
      w: Math.max(2, horizontal ? scaleX(Number(element.D || 10), size) : scaleX(Number(element.C || 4), size)),
      h: Math.max(2, horizontal ? scaleY(Number(element.C || 4), size) : scaleY(Number(element.D || 10), size)),
      shape: "line",
      fill: "transparent",
      stroke: cleanHex(element.d) || "#202124",
    }];
  }
  return [];
}

async function convertCanvaImageElement(element, size, offsetX, offsetY, rasterAssets) {
  const assetId = element?.a?.B?.A?.A || element?.a?.A?.A?.A || "";
  const asset = assetId ? rasterAssets.get(assetId) : null;
  if (!asset) return [];
  try {
    const frameWidth = Math.abs(Number(element.D || 10));
    const frameHeight = Math.abs(Number(element.C || 10));
    const file = selectCanvaAssetFile(asset, frameWidth, frameHeight);
    if (!file?.url) return [];
    if (!asset.dataUrl) {
      const rendered = await fetchImageAsDataUrl(file.url);
      asset.dataUrl = rendered.src;
      asset.mime = rendered.mime;
      asset.width = rendered.width || Number(file.width) || asset.width;
      asset.height = rendered.height || Number(file.height) || asset.height;
    }
    return [{
      type: "image",
      id: safeElementId(element._ || assetId, "img"),
      x: scaleX(offsetX + Number(element.B || 0), size),
      y: scaleY(offsetY + Number(element.A || 0), size),
      w: Math.max(1, scaleX(frameWidth, size)),
      h: Math.max(1, scaleY(frameHeight, size)),
      src: asset.dataUrl,
      alt: asset.title || `Canva image ${assetId}`,
    }];
  } catch {
    return [];
  }
}

function collectCanvaRasterAssets(root) {
  const map = new Map();
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (value.type === "RASTER" && typeof value.id === "string" && Array.isArray(value.files)) {
      map.set(value.id, {
        id: value.id,
        title: typeof value.title === "string" ? value.title : "",
        files: value.files.filter((file) => file && typeof file.url === "string"),
        width: Number(value.width) || 0,
        height: Number(value.height) || 0,
        dataUrl: "",
        mime: "",
      });
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  };
  visit(root);
  return map;
}

function selectCanvaAssetFile(asset, targetWidth, targetHeight) {
  const files = Array.isArray(asset?.files) ? asset.files : [];
  if (!files.length) return null;
  const targetPixels = Math.max(1, targetWidth * targetHeight);
  return files
    .slice()
    .sort((a, b) => {
      const aPixels = Math.max(1, (Number(a.width) || 0) * (Number(a.height) || 0));
      const bPixels = Math.max(1, (Number(b.width) || 0) * (Number(b.height) || 0));
      const aScore = aPixels >= targetPixels ? aPixels - targetPixels : targetPixels - aPixels + 10_000_000;
      const bScore = bPixels >= targetPixels ? bPixels - targetPixels : targetPixels - bPixels + 10_000_000;
      return aScore - bScore;
    })[0];
}

function safeElementId(value, prefix) {
  return `${prefix}_${String(value || Math.random().toString(36).slice(2)).replace(/[^a-z0-9_-]/gi, "").slice(0, 54)}`;
}

function scaleX(value, size) {
  return clampNumber(value * size.sx, -960, 1920);
}

function scaleY(value, size) {
  return clampNumber(value * size.sy, -540, 1080);
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function canvaText(rich) {
  if (!rich || typeof rich !== "object") return "";
  const chunks = [];
  const source = Array.isArray(rich.A) ? rich.A : [];
  for (const item of source) {
    if (item?.["A?"] === "A" && typeof item.A === "string") chunks.push(item.A);
  }
  return chunks.join("").replace(/\n$/, "");
}

function canvaTextStyle(rich) {
  const style = {};
  for (const run of Array.isArray(rich?.B) ? rich.B : []) {
    if (run?.["A?"] !== "A" || !run.A || typeof run.A !== "object") continue;
    for (const [key, value] of Object.entries(run.A)) {
      const next = value && typeof value === "object" && "B" in value ? value.B : undefined;
      if (next !== undefined && next !== null && next !== "") style[key] = next;
    }
  }
  const fontSize = clampNumber((Number(style["font-size"]) || 32) * 0.5, 6, 92);
  const fontWeight = String(style["font-weight"] || "").toLowerCase();
  return {
    fontSize,
    color: cleanHex(style.color) || "#202124",
    fontFamily: canvaFontFamily(style["font-family"]),
    bold: /bold|heavy|black|700|800|900/.test(fontWeight),
    italic: String(style["font-style"] || "").toLowerCase().includes("italic"),
    underline: String(style["text-decoration"] || "").toLowerCase().includes("underline"),
    align: ["left", "center", "right"].includes(String(style["text-align"])) ? String(style["text-align"]) : "left",
    lineHeight: clampNumber((Number(style.leading) || 1100) / 1000, 0.75, 2.4),
  };
}

function canvaFontFamily(value) {
  const token = String(value || "").split(",")[0].trim();
  if (!token) return "Arial";
  if (/YAD1aYG82rc/i.test(token)) return "Arial";
  return token.replace(/[;"<>]/g, "").slice(0, 80) || "Arial";
}

function cleanHex(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(text) ? text : "";
}

function canvaShapeFill(element) {
  const path = Array.isArray(element.b) ? element.b[0] : null;
  return cleanHex(path?.B?.C || path?.B?.B || "");
}

function canvaShapeStroke(element) {
  const path = Array.isArray(element.b) ? element.b[0] : null;
  return cleanHex(path?.C?.B || path?.C?.C || "");
}

function canvaShapeKind(element) {
  const path = Array.isArray(element.b) ? String(element.b[0]?.A || "") : "";
  return /C|c|Q|q/.test(path) && !/^M0 0H/i.test(path) ? "ellipse" : "rect";
}

function normalizeCanvaUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (host === "canva.link" || host.endsWith(".canva.link")) {
      url.search = "";
      url.hash = "";
      return url.href;
    }
    if (!/(^|\.)canva\.com$/i.test(url.hostname)) return null;
    if (!/^\/design\/[^/]+/i.test(url.pathname)) return null;
    url.hash = "";
    url.search = "";
    return url.href;
  } catch {
    return null;
  }
}

async function resolveCanvaUrl(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: DEFAULT_HEADERS,
  });
  if (!response.ok && response.status >= 400 && !response.url) {
    throw new Error(`Canva menolak link (${response.status}).`);
  }
  return normalizeCanvaUrl(response.url || url) || url;
}

function canvaViewUrl(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/(edit|watch|present|screen)(\/.*)?$/i, "/view");
  if (!/\/view$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/$/, "") + "/view";
  }
  url.search = "";
  url.hash = "";
  return url.href;
}

async function fetchCanvaHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: DEFAULT_HEADERS,
  });
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!response.ok) throw new Error(`Canva mengembalikan HTTP ${response.status}.`);
  if (!contentType.includes("text/html")) throw new Error("Canva tidak mengirim HTML presentasi.");
  if (/Unsupported client/i.test(text)) throw new Error("Canva menolak user-agent worker.");
  return text;
}

function extractBootstrap(html) {
  const marker = "window['bootstrap'] = JSON.parse(";
  const index = html.indexOf(marker);
  if (index < 0) throw new Error("Bootstrap Canva tidak ditemukan.");
  let cursor = index + marker.length;
  while (/\s/.test(html[cursor])) cursor += 1;
  const quote = html[cursor];
  if (quote !== "'" && quote !== '"') throw new Error("Format bootstrap Canva berubah.");
  let end = cursor + 1;
  let escaped = false;
  for (; end < html.length; end += 1) {
    const char = html[end];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === quote) break;
  }
  if (end >= html.length) throw new Error("Bootstrap Canva tidak lengkap.");
  const literal = html.slice(cursor, end + 1);
  const jsonText = Function(`"use strict"; return ${literal};`)();
  return JSON.parse(jsonText);
}

function findDraft(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 12) return null;
  if (value.imageSets?.thumbnail?.images && value.content && value.pageCount) return value;
  for (const child of Object.values(value)) {
    const found = findDraft(child, depth + 1);
    if (found) return found;
  }
  return null;
}

async function fetchImageAsDataUrl(url) {
  if (!url || typeof url !== "string") throw new Error("URL render slide kosong.");
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": CANVA_USER_AGENT,
      "accept": "image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8",
      "referer": "https://www.canva.com/",
    },
  });
  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new Error(`Render slide Canva gagal diambil (${response.status}).`);
  }
  const dimensions = imageDimensions(buffer, contentType);
  return {
    mime: contentType.split(";")[0],
    src: `data:${contentType.split(";")[0]};base64,${buffer.toString("base64")}`,
    ...dimensions,
  };
}

function imageDimensions(buffer, mime) {
  try {
    if (mime.includes("png") && buffer.length > 24 && buffer.subarray(1, 4).toString() === "PNG") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (mime.includes("jpeg") || mime.includes("jpg")) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        const length = buffer.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xc3) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
      }
    }
  } catch {
    // Dimensions are best-effort only.
  }
  return {};
}

function extractTitle(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html)?.[1];
  const title = og || /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1] || "";
  return decodeHtml(title).replace(/\s+-\s+Canva$/i, "").trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

module.exports = {
  extractCanvaDeck,
  normalizeCanvaUrl,
};
