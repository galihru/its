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

  const thumbnailSet = draft.imageSets?.thumbnail;
  const images = Array.isArray(thumbnailSet?.images) ? thumbnailSet.images : [];
  if (!images.length) throw new Error("Render slide Canva tidak tersedia pada link ini.");

  const pageCount = Number(draft.pageCount) || images.length;
  const maxSlides = Math.min(Math.max(Number(options.maxSlides) || images.length, 1), images.length);
  const selected = images
    .slice(0, Math.min(maxSlides, images.length))
    .sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0));

  const slides = [];
  for (const image of selected) {
    const rendered = await fetchImageAsDataUrl(image.url);
    slides.push({
      page: Number(image.page) || slides.length + 1,
      pageHash: Number(image.pageHash) || 0,
      width: Number(image.width) || rendered.width || 16,
      height: Number(image.height) || rendered.height || 9,
      mime: rendered.mime,
      src: rendered.src,
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
