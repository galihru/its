/**
 * ITS Presentasi local AI pipeline.
 *
 * This file must not call paid/hosted inference APIs. Model-based OCR uses
 * Transformers.js in the browser, the same deployment style as RF-DETR:
 * model files are downloaded/cached by the browser and inference runs locally.
 */

type TextVariant = "title" | "body";
type ElementAnimation = "" | "appear" | "fade" | "fly" | "wipe" | "zoom" | "motion";

type TextElement = {
  id: string;
  type: "text";
  variant: TextVariant;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  animation?: ElementAnimation;
};

type ImageElement = {
  id: string;
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt?: string;
  animation?: ElementAnimation;
};

type CanvasElement = {
  id: string;
  type: "canvas";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt?: string;
  animation?: ElementAnimation;
};

type ShapeElement = {
  id: string;
  type: "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  tableId?: string;
  tableRow?: number;
  tableCol?: number;
  animation?: ElementAnimation;
};

type PhoneElement = {
  id: string;
  type: "phone";
  x: number;
  y: number;
  w: number;
  h: number;
  deviceSerial: string | null;
  deviceLabel?: string;
  animation?: ElementAnimation;
};

type SlideElement = TextElement | PhoneElement | ImageElement | CanvasElement | ShapeElement;
type Slide = { id: string; name: string; notes: string; elements: SlideElement[]; transition?: string; section?: string };
type Deck = { title: string; slides: Slide[] };

export interface PipelineOptions {
  onProgress?: (percent: number, message: string) => void;
  enableLayoutFix?: boolean;
  enableOcr?: boolean;
  enableTypoFix?: boolean;
  enableAcademic?: boolean;
  language?: "id" | "en";
}

const DEFAULT_OPTIONS: Required<PipelineOptions> = {
  onProgress: () => undefined,
  enableLayoutFix: true,
  enableOcr: true,
  enableTypoFix: true,
  enableAcademic: true,
  language: "id",
};

interface LayoutBox {
  label: "text" | "title" | "figure" | "table" | "formula" | "chart" | "header" | "footer";
  score: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function cloneSlide(slide: Slide): Slide {
  return structuredClone(slide);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function renderSlideToCanvas(slide: Slide, width = 640, height = 640): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scaleX = width / 960;
  const scaleY = height / 540;
  for (const el of slide.elements) {
    const x = el.x * scaleX;
    const y = el.y * scaleY;
    const w = el.w * scaleX;
    const h = el.h * scaleY;
    if (el.type === "shape") {
      ctx.fillStyle = el.shape === "line" ? "transparent" : el.fill || "transparent";
      ctx.strokeStyle = el.stroke || "transparent";
      if (el.shape === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (el.shape === "line") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.stroke();
      } else {
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    } else if (el.type === "text") {
      const size = Math.max(5, (el.fontSize || (el.variant === "title" ? 36 : 20)) * scaleY);
      ctx.font = `${el.bold ? "700" : "400"} ${size}px ${el.fontFamily || "Arial"}`;
      ctx.fillStyle = el.color || "#202124";
      ctx.fillText(el.text.slice(0, 120), x + 3, y + size);
    } else if (el.type === "image") {
      ctx.fillStyle = "#e8eaed";
      ctx.fillRect(x, y, w, h);
    }
  }
  return canvas;
}

async function detectLayout(slide: Slide): Promise<LayoutBox[]> {
  const ppuDoclayout = (globalThis as unknown as Record<string, unknown>)["ppuDoclayout"] as
    | { DocLayoutService: new () => { initialize(): Promise<void>; analyze(canvas: HTMLCanvasElement): Promise<{ boxes: Array<LayoutBox> }> } }
    | undefined;
  if (!ppuDoclayout) return heuristicLayoutBoxes(slide);
  try {
    const service = new ppuDoclayout.DocLayoutService();
    await service.initialize();
    const result = await service.analyze(renderSlideToCanvas(slide));
    return result.boxes;
  } catch {
    return heuristicLayoutBoxes(slide);
  }
}

function heuristicLayoutBoxes(slide: Slide): LayoutBox[] {
  return slide.elements.map((el) => {
    let label: LayoutBox["label"] = "text";
    if (el.type === "image") label = "figure";
    else if (el.type === "text" && el.variant === "title") label = "title";
    else if (el.type === "shape" && el.tableId) label = "table";
    return {
      label,
      score: 0.9,
      x1: el.x / 960 * 640,
      y1: el.y / 540 * 640,
      x2: (el.x + el.w) / 960 * 640,
      y2: (el.y + el.h) / 540 * 640,
    };
  });
}

function applyLayoutFix(slide: Slide, boxes: LayoutBox[]): Slide {
  const fixed = cloneSlide(slide);
  for (const el of fixed.elements) {
    el.x = clamp(el.x, -40, 960);
    el.y = clamp(el.y, -40, 540);
    el.w = clamp(el.w, 8, 1040);
    el.h = clamp(el.h, 8, 620);
  }
  for (const box of boxes) {
    if (box.score < 0.75 || box.label !== "title") continue;
    const bx = box.x1 / 640 * 960;
    const by = box.y1 / 640 * 540;
    const bw = (box.x2 - box.x1) / 640 * 960;
    const bh = (box.y2 - box.y1) / 640 * 540;
    const match = fixed.elements.find((el) => {
      const ix = Math.max(0, Math.min(el.x + el.w, bx + bw) - Math.max(el.x, bx));
      const iy = Math.max(0, Math.min(el.y + el.h, by + bh) - Math.max(el.y, by));
      return ix * iy > Math.min(el.w * el.h, bw * bh) * 0.35;
    });
    if (match?.type === "text") match.variant = "title";
  }
  return fixed;
}

type LocalOcrPipeline = ((input: string, options?: Record<string, unknown>) => Promise<unknown>) & {
  dispose?: () => void | Promise<void>;
};

let localOcrPipelinePromise: Promise<LocalOcrPipeline> | null = null;
let localOcrSkipUntil = 0;
const LOCAL_OCR_BOOT_TIMEOUT_MS = 3500;
const LOCAL_OCR_RETRY_DELAY_MS = 60000;

function normalizeOcrText(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  if (!first || typeof first !== "object") return "";
  const value = (first as Record<string, unknown>).generated_text;
  return typeof value === "string" ? value.trim() : "";
}

async function getLocalOcrPipeline(onProgress: (message: string) => void): Promise<LocalOcrPipeline> {
  if (!localOcrPipelinePromise) {
    localOcrPipelinePromise = (async () => {
      const mod = await import("@huggingface/transformers");
      mod.env.allowRemoteModels = true;
      mod.env.allowLocalModels = true;
      mod.env.useBrowserCache = true;
      return await mod.pipeline("image-to-text", "Xenova/trocr-small-printed", {
        dtype: "q8",
        progress_callback: (info: unknown) => {
          const record = info && typeof info === "object" ? info as Record<string, unknown> : {};
          const status = typeof record.status === "string" ? record.status : "memuat";
          const file = typeof record.file === "string" ? ` ${record.file}` : "";
          onProgress(`OCR lokal ${status}${file}`);
        },
      }) as unknown as LocalOcrPipeline;
    })();
  }
  return localOcrPipelinePromise;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("OCR lokal belum siap")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function getReadyLocalOcrPipeline(onProgress: (message: string) => void): Promise<LocalOcrPipeline> {
  if (Date.now() < localOcrSkipUntil) throw new Error("OCR lokal dilewati sementara");
  let active = true;
  try {
    return await withTimeout(getLocalOcrPipeline((message) => {
      if (active) onProgress(message);
    }), LOCAL_OCR_BOOT_TIMEOUT_MS);
  } catch (error) {
    localOcrSkipUntil = Date.now() + LOCAL_OCR_RETRY_DELAY_MS;
    throw error;
  } finally {
    active = false;
  }
}

async function runLocalOcrOnImages(slide: Slide, onProgress: (message: string) => void): Promise<Slide> {
  const fixed = cloneSlide(slide);
  const images = fixed.elements
    .filter((el): el is ImageElement => el.type === "image" && /^data:image\//i.test(el.src))
    .filter((el) => el.w <= 620 && el.h <= 360)
    .slice(0, 4);
  if (!images.length) return fixed;
  try {
    const ocr = await getReadyLocalOcrPipeline(onProgress);
    for (const image of images) {
      if (image.alt && image.alt.length > 10 && !/^(gambar|image|img|foto)/i.test(image.alt)) continue;
      const text = normalizeOcrText(await ocr(image.src, { max_new_tokens: 80 }));
      if (text.length < 3 || text.length > 260) continue;
      image.alt = text;
      fixed.notes = [fixed.notes, `[OCR lokal] ${text}`].filter(Boolean).join("\n\n");
    }
  } catch {
    return fixed;
  }
  return fixed;
}

function ruleBasedTypoFix(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ ([,;:.!?])/g, "$1")
    .replace(/([.!?]\s+)([a-z])/g, (_, prefix: string, char: string) => prefix + char.toUpperCase())
    .replace(/([a-zA-Z])\.([a-zA-Z]{3,})/g, "$1 $2")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function academicPolish(text: string, language: "id" | "en"): string {
  if (!text || text.length < 12) return text;
  const replacements: Array<[RegExp, string]> = language === "id"
    ? [
      [/\bnggak\b/gi, "tidak"],
      [/\bgak\b/gi, "tidak"],
      [/\bkarna\b/gi, "karena"],
      [/\bdgn\b/gi, "dengan"],
      [/\byg\b/gi, "yang"],
      [/\bjd\b/gi, "jadi"],
    ]
    : [
      [/\bdont\b/gi, "do not"],
      [/\bcant\b/gi, "cannot"],
      [/\bdoesnt\b/gi, "does not"],
    ];
  return replacements.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

function runTypoFix(slide: Slide): Slide {
  const fixed = cloneSlide(slide);
  for (const el of fixed.elements) {
    if ((el.type === "text" || el.type === "shape") && el.text) el.text = ruleBasedTypoFix(el.text);
  }
  return fixed;
}

function runAcademicPolish(slide: Slide, language: "id" | "en"): Slide {
  const fixed = cloneSlide(slide);
  for (const el of fixed.elements) {
    if ((el.type === "text" || el.type === "shape") && el.text) el.text = academicPolish(el.text, language);
  }
  return fixed;
}

export interface PipelineResult {
  deck: Deck;
  stats: {
    slidesProcessed: number;
    layoutFixed: number;
    ocrFound: number;
    typosFixed: number;
    academicImproved: number;
    durationMs: number;
  };
}

export async function runPptAiPipeline(inputDeck: Deck, options: PipelineOptions = {}): Promise<PipelineResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const result = structuredClone(inputDeck);
  const stats = {
    slidesProcessed: 0,
    layoutFixed: 0,
    ocrFound: 0,
    typosFixed: 0,
    academicImproved: 0,
    durationMs: 0,
  };
  const startedAt = Date.now();
  const total = Math.max(1, result.slides.length);

  for (let i = 0; i < result.slides.length; i++) {
    const slideNumber = i + 1;
    let slide = result.slides[i];

    if (opts.enableLayoutFix) {
      opts.onProgress(Math.round((i / total) * 76), `Slide ${slideNumber}/${total}: memeriksa layout lokal`);
      slide = applyLayoutFix(slide, await detectLayout(slide));
      stats.layoutFixed++;
    }

    if (opts.enableOcr) {
      const notesBefore = slide.notes || "";
      opts.onProgress(Math.round((i / total) * 76 + 8), `Slide ${slideNumber}/${total}: OCR lokal`);
      slide = await runLocalOcrOnImages(slide, (message) => opts.onProgress(Math.round((i / total) * 76 + 8), message));
      if ((slide.notes || "") !== notesBefore) stats.ocrFound++;
    }

    if (opts.enableTypoFix) {
      const before = JSON.stringify(slide.elements);
      opts.onProgress(Math.round((i / total) * 76 + 14), `Slide ${slideNumber}/${total}: merapikan teks`);
      slide = runTypoFix(slide);
      if (JSON.stringify(slide.elements) !== before) stats.typosFixed++;
    }

    if (opts.enableAcademic) {
      const before = JSON.stringify(slide.elements);
      opts.onProgress(Math.round((i / total) * 76 + 20), `Slide ${slideNumber}/${total}: polish akademik lokal`);
      slide = runAcademicPolish(slide, opts.language);
      if (JSON.stringify(slide.elements) !== before) stats.academicImproved++;
    }

    result.slides[i] = slide;
    stats.slidesProcessed++;
  }

  stats.durationMs = Date.now() - startedAt;
  opts.onProgress(100, "AI lokal selesai");
  return { deck: result, stats };
}
