import {
  loadImageSource,
  RF_DETR_ANDROID_MODEL_ID,
  runBrowserRfDetr,
  vehicleBreakdownFromRfDetrDetections,
  type BrowserRfDetrDetection,
  type BrowserRfDetrResult,
} from "./browserRfDetr";

type LockScreenBridge = {
  onDetection?: (payload: string) => void;
  onStatus?: (payload: string) => void;
};

type SnapshotHistory = {
  image1?: string;
  image2?: string;
  image1UpdatedAt?: number;
  image2UpdatedAt?: number;
};

type SlotIdentity = {
  imageKey: string;
  imageLength: number;
  imageTail: string;
  updatedAt: number;
};

const HISTORY_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
const REFRESH_MS = 10_000;
const RETRY_MS = 2_000;
const analyzedKeys = new Map<number, string>();
const rfInFlightKeys = new Map<number, string>();
const statusEl = document.querySelector<HTMLElement>("[data-status]");
let busy = false;
let nextSlot = 1;
let refreshTimer = 0;

function bridge(): LockScreenBridge | null {
  return (window as Window & { LockScreenBridge?: LockScreenBridge }).LockScreenBridge || null;
}

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

function detectionPayload(detection: BrowserRfDetrDetection): BrowserRfDetrDetection {
  return {
    ...detection,
  };
}

function slotIdentity(value: string, updatedAt: number | undefined): SlotIdentity {
  const timestamp = Number(updatedAt) || 0;
  const imageTail = value.slice(-48);
  return {
    imageKey: `${value.length}:${imageTail}`,
    imageLength: value.length,
    imageTail,
    updatedAt: timestamp,
  };
}

function emitStatus(slot: number, identity: SlotIdentity, state: string, note: string): void {
  const payload = { slot, state, note, ...identity };
  bridge()?.onStatus?.(JSON.stringify(payload));
  setStatus(note);
}

function emitResult(slot: number, identity: SlotIdentity, result: BrowserRfDetrResult): void {
  bridge()?.onDetection?.(JSON.stringify({
    slot,
    state: result.status === "online" ? "done" : "error",
    note: result.note,
    modelUrl: result.modelUrl,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    detections: result.detections.slice(0, 24).map(detectionPayload),
    ...identity,
  }));
}

async function loadHistory(): Promise<SnapshotHistory> {
  const response = await fetch(`${HISTORY_URL}?ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`RTDB HTTP ${response.status}`);
  return await response.json() as SnapshotHistory;
}

function quickDetectionResult(image: HTMLImageElement): BrowserRfDetrResult | null {
  const frameWidth = image.naturalWidth || image.width || 0;
  const frameHeight = image.naturalHeight || image.height || 0;
  const detections = quickDetectObjects(image, frameWidth, frameHeight);
  if (!frameWidth || !frameHeight || detections.length === 0) return null;
  const vehicleBreakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
  return {
    status: "online",
    note: "AI cepat mengunci objek",
    updatedAt: Date.now(),
    fps: 0,
    frameWidth,
    frameHeight,
    objectCount: detections.length,
    vehicleCount: 0,
    vehicleBreakdown,
    detections,
    modelUrl: "local://lockscreen-quick-proposal",
    outputShape: `quick-lockscreen; detections=${detections.length}`,
  };
}

function quickDetectObjects(image: HTMLImageElement, sourceWidth: number, sourceHeight: number): BrowserRfDetrDetection[] {
  if (!sourceWidth || !sourceHeight) return [];
  const maxEdge = 320;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(image, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const gray = new Float32Array(width * height);
  const data = imageData.data;
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
  }

  let sum = 0;
  let sumSq = 0;
  let samples = 0;
  const edgeScore = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const gx = Math.abs(gray[index + 1] - gray[index - 1]);
      const gy = Math.abs(gray[index + width] - gray[index - width]);
      const value = gx + gy;
      edgeScore[index] = value;
      sum += value;
      sumSq += value * value;
      samples += 1;
    }
  }
  const mean = samples ? sum / samples : 0;
  const variance = samples ? Math.max(0, sumSq / samples - mean * mean) : 0;
  const threshold = Math.max(26, mean + Math.sqrt(variance) * 1.08);
  const mask = new Uint8Array(width * height);
  const radius = Math.max(2, Math.round(Math.min(width, height) / 95));
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (edgeScore[index] < threshold) continue;
      const p = index * 4;
      const chroma = Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
      if (edgeScore[index] < threshold * 1.35 && chroma < 14) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          mask[yy * width + xx] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const components: Array<{ x: number; y: number; width: number; height: number; pixels: number; score: number }> = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let pixels = 0;
    let score = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index / width) | 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;
      score += edgeScore[index] || threshold;
      const left = index - 1;
      const right = index + 1;
      const up = index - width;
      const down = index + width;
      if (x > 0 && mask[left] && !visited[left]) { visited[left] = 1; queue[tail++] = left; }
      if (x < width - 1 && mask[right] && !visited[right]) { visited[right] = 1; queue[tail++] = right; }
      if (y > 0 && mask[up] && !visited[up]) { visited[up] = 1; queue[tail++] = up; }
      if (y < height - 1 && mask[down] && !visited[down]) { visited[down] = 1; queue[tail++] = down; }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const areaRatio = boxArea / Math.max(1, width * height);
    const fillRatio = pixels / Math.max(1, boxArea);
    if (
      boxWidth < 12
      || boxHeight < 12
      || areaRatio < 0.004
      || areaRatio > 0.42
      || boxWidth / width > 0.82
      || boxHeight / height > 0.88
      || fillRatio < 0.018
    ) continue;
    components.push({ x: minX, y: minY, width: boxWidth, height: boxHeight, pixels, score: score / Math.max(1, pixels) });
  }

  const sorted = components
    .map((component) => tightenQuickBox(
      inflateQuickBox(component, width, height),
      edgeScore,
      data,
      width,
      height,
      threshold,
    ))
    .filter((component) => {
      const areaRatio = (component.width * component.height) / Math.max(1, width * height);
      return component.width >= 14
        && component.height >= 14
        && areaRatio <= 0.36
        && component.width / width <= 0.78
        && component.height / height <= 0.84;
    })
    .sort((a, b) => (b.score * Math.sqrt(b.width * b.height)) - (a.score * Math.sqrt(a.width * a.height)));
  const kept: typeof sorted = [];
  for (const component of sorted) {
    if (kept.some((other) => quickOverlap(component, other) > 0.42 || quickContained(component, other))) continue;
    kept.push(component);
    if (kept.length >= 4) break;
  }
  const detections = kept.map((box, index) => {
    const label = classifyQuickBox(box, data, width, height);
    return {
      label,
      confidence: quickConfidence(box, label, index, width, height, data),
      vehicle: false,
      x: Math.round(box.x / scale),
      y: Math.round(box.y / scale),
      width: Math.round(box.width / scale),
      height: Math.round(box.height / scale),
    };
  });
  const filtered = detections.filter((detection) => {
    const box = {
      x: detection.x * scale,
      y: detection.y * scale,
      width: detection.width * scale,
      height: detection.height * scale,
    };
    return quickDetectionWorthReporting(box, detection.label, data, width, height);
  });
  if (filtered.length) return filtered;
  const named = detections.filter((detection) => detection.label !== "object" && detection.label !== "unknown object");
  return (named.length ? named : detections).slice(0, 2);
}

function tightenQuickBox<T extends { x: number; y: number; width: number; height: number; score: number }>(
  box: T,
  edgeScore: Float32Array,
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
  edgeThreshold: number,
): T {
  let minX = frameWidth;
  let minY = frameHeight;
  let maxX = 0;
  let maxY = 0;
  let selected = 0;
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(frameWidth - 1, Math.ceil(box.x + box.width));
  const bottom = Math.min(frameHeight - 1, Math.ceil(box.y + box.height));
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const index = y * frameWidth + x;
      const p = index * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const chroma = max - min;
      if (edgeScore[index] < edgeThreshold * 0.72 && chroma < 42 && brightness > 42 && brightness < 220) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      selected += 1;
    }
  }
  if (selected < 12 || maxX <= minX || maxY <= minY) return box;
  const tightWidth = maxX - minX + 1;
  const tightHeight = maxY - minY + 1;
  if (tightWidth < 10 || tightHeight < 10) return box;
  const padX = Math.max(3, Math.round(tightWidth * 0.055));
  const padY = Math.max(3, Math.round(tightHeight * 0.055));
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const boxRight = Math.min(frameWidth, maxX + 1 + padX);
  const boxBottom = Math.min(frameHeight, maxY + 1 + padY);
  return { ...box, x, y, width: boxRight - x, height: boxBottom - y };
}

function inflateQuickBox<T extends { x: number; y: number; width: number; height: number; score: number }>(
  box: T,
  frameWidth: number,
  frameHeight: number,
): T {
  const padX = Math.max(4, Math.round(box.width * 0.075));
  const padY = Math.max(4, Math.round(box.height * 0.075));
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const right = Math.min(frameWidth, box.x + box.width + padX);
  const bottom = Math.min(frameHeight, box.y + box.height + padY);
  return { ...box, x, y, width: right - x, height: bottom - y };
}

function quickOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function quickContained(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 && intersection / minArea > 0.72;
}

type QuickBoxStats = {
  saturation: number;
  brightness: number;
  darkRatio: number;
  whiteRatio: number;
  grayRatio: number;
  redRatio: number;
  greenRatio: number;
  blueRatio: number;
  yellowRatio: number;
  skinRatio: number;
};

function quickBoxStats(
  box: { x: number; y: number; width: number; height: number },
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
): QuickBoxStats {
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const right = Math.min(frameWidth - 1, Math.ceil(box.x + box.width));
  const bottom = Math.min(frameHeight - 1, Math.ceil(box.y + box.height));
  const step = Math.max(1, Math.floor(Math.min(box.width, box.height) / 34));
  let samples = 0;
  let saturation = 0;
  let brightness = 0;
  let dark = 0;
  let white = 0;
  let gray = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let yellow = 0;
  let skin = 0;
  for (let y = top; y <= bottom; y += step) {
    for (let x = left; x <= right; x += step) {
      const p = (y * frameWidth + x) * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const bright = (r + g + b) / 3;
      const sat = max <= 0 ? 0 : chroma / max;
      samples += 1;
      saturation += sat;
      brightness += bright;
      if (bright < 66) dark += 1;
      if (bright > 204 && chroma < 42) white += 1;
      if (chroma < 28 && bright > 34 && bright < 224) gray += 1;
      if (r > 82 && r > g * 1.2 && r > b * 1.22) red += 1;
      if (g > 76 && g > r * 1.12 && g > b * 1.06) green += 1;
      if (b > 68 && b > r * 1.12 && b > g * 1.04) blue += 1;
      if (r > 132 && g > 108 && b < 118 && Math.abs(r - g) < 88) yellow += 1;
      if (r > 74 && g > 42 && b > 24 && r > g && g > b && r - b > 26 && r - g < 92) skin += 1;
    }
  }
  const total = Math.max(1, samples);
  return {
    saturation: saturation / total,
    brightness: brightness / total,
    darkRatio: dark / total,
    whiteRatio: white / total,
    grayRatio: gray / total,
    redRatio: red / total,
    greenRatio: green / total,
    blueRatio: blue / total,
    yellowRatio: yellow / total,
    skinRatio: skin / total,
  };
}

function classifyQuickBox(
  box: { x: number; y: number; width: number; height: number },
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
): string {
  const stats = quickBoxStats(box, data, frameWidth, frameHeight);
  const aspect = box.width / Math.max(1, box.height);
  const areaRatio = (box.width * box.height) / Math.max(1, frameWidth * frameHeight);
  if (
    areaRatio < 0.22
    && aspect > 1.35
    && aspect < 4.8
    && (stats.grayRatio > 0.30 || stats.darkRatio > 0.30)
    && stats.saturation < 0.40
  ) return "cell phone";
  if (areaRatio < 0.18 && aspect > 1.65 && stats.darkRatio > 0.32) return "cell phone";
  if (box.height > box.width * 1.12 && stats.skinRatio > 0.095) return "person";
  if (box.height > box.width * 1.45 && stats.skinRatio > 0.055 && (stats.redRatio + stats.yellowRatio) > 0.035) return "person";
  if (
    areaRatio < 0.24
    && aspect > 0.50
    && aspect < 1.36
    && (stats.yellowRatio > 0.12 || stats.redRatio > 0.14 || stats.blueRatio > 0.18)
  ) return "bottle";
  if (
    areaRatio < 0.28
    && aspect > 1.35
    && aspect < 4.2
    && (stats.greenRatio + stats.blueRatio + stats.redRatio > 0.16 || stats.darkRatio > 0.42)
  ) return "car";
  if (areaRatio < 0.20 && aspect > 1.12 && (stats.whiteRatio > 0.20 || stats.grayRatio > 0.44)) return "book";
  if (areaRatio < 0.12 && stats.greenRatio > 0.24 && stats.saturation > 0.20 && stats.whiteRatio < 0.18) return "potted plant";
  if (areaRatio > 0.05 && aspect > 0.72 && aspect < 1.55 && stats.grayRatio > 0.46) return "book";
  if (areaRatio < 0.22 && aspect > 1.15 && aspect < 4.6 && stats.saturation > 0.20) return "toy vehicle";
  if (areaRatio > 0.18 && stats.grayRatio + stats.whiteRatio > 0.48 && stats.saturation < 0.22) return "floor";
  return "unknown object";
}

function quickDetectionWorthReporting(
  box: { x: number; y: number; width: number; height: number },
  label: string,
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
): boolean {
  const stats = quickBoxStats(box, data, frameWidth, frameHeight);
  const aspect = box.width / Math.max(1, box.height);
  const areaRatio = (box.width * box.height) / Math.max(1, frameWidth * frameHeight);
  const colorRatio = stats.redRatio + stats.greenRatio + stats.blueRatio + stats.yellowRatio;
  if (areaRatio < 0.004 || areaRatio > 0.30) return false;
  if (aspect < 0.42 && stats.skinRatio < 0.075 && colorRatio < 0.16) return false;
  if (aspect > 5.1) return false;
  if ((label === "object" || label === "unknown object") && colorRatio < 0.18 && stats.skinRatio < 0.065 && stats.whiteRatio < 0.22) return false;
  if ((label === "object" || label === "unknown object") && (areaRatio > 0.22 || aspect < 0.55 || aspect > 4.6)) return false;
  return true;
}

function quickConfidence(
  box: { x: number; y: number; width: number; height: number },
  label: string,
  index: number,
  frameWidth: number,
  frameHeight: number,
  data: Uint8ClampedArray,
): number {
  const stats = quickBoxStats(box, data, frameWidth, frameHeight);
  const areaRatio = (box.width * box.height) / Math.max(1, frameWidth * frameHeight);
  const labelBoost = label === "object" || label === "unknown object" ? -0.08 : 0.05;
  const contrastBoost = Math.min(0.11, stats.saturation * 0.12 + stats.darkRatio * 0.08);
  const sizePenalty = areaRatio > 0.20 ? 0.08 : areaRatio < 0.006 ? 0.06 : 0;
  return Math.max(0.50, Math.min(0.90, 0.73 + labelBoost + contrastBoost - index * 0.035 - sizePenalty));
}

function credibleRfResult(result: BrowserRfDetrResult, fallback: BrowserRfDetrResult | null): BrowserRfDetrResult {
  if (result.status !== "online") return fallback || result;
  const detections = result.detections.filter((det) => {
    const label = String(det.label || "").toLowerCase();
    if (det.confidence >= 0.42) return true;
    if (det.confidence >= 0.30 && /^(person|car|motorcycle|bicycle|bus|truck|cell phone|laptop|traffic light)$/.test(label)) return true;
    return false;
  });
  if (!detections.length && fallback) return fallback;
  const vehicleBreakdown = vehicleBreakdownFromRfDetrDetections(detections, result.frameWidth, result.frameHeight);
  return {
    ...result,
    detections,
    objectCount: detections.length,
    vehicleCount: vehicleBreakdown.total,
    vehicleBreakdown,
  };
}

function scheduleRfDetrVerification(
  slot: number,
  identity: SlotIdentity,
  image: HTMLImageElement,
  quickResult: BrowserRfDetrResult | null,
): void {
  if (rfInFlightKeys.get(slot) === identity.imageKey) return;
  rfInFlightKeys.set(slot, identity.imageKey);
  void runBrowserRfDetr(image, {
    captureMaxEdge: 768,
    detailCrops: true,
    confidenceThreshold: 0.12,
    minLabelConfidenceScale: 0.62,
    modelId: RF_DETR_ANDROID_MODEL_ID,
  }).then((result) => {
    const nextResult = credibleRfResult(result, quickResult);
    emitResult(slot, identity, nextResult);
    if (result.status === "online") {
      analyzedKeys.set(slot, identity.imageKey);
      const total = nextResult.detections.length;
      setStatus(total > 0
        ? `Gambar ${slot}: ${total} objek terkonfirmasi`
        : `Gambar ${slot}: belum ada objek yang cukup yakin`);
    } else if (!quickResult) {
      emitStatus(slot, identity, "error", "Analisis akan dicoba kembali");
    }
  }).catch(() => {
    if (!quickResult) emitStatus(slot, identity, "error", "Analisis akan dicoba kembali");
  }).finally(() => {
    if (rfInFlightKeys.get(slot) === identity.imageKey) rfInFlightKeys.delete(slot);
  });
}

async function analyzeSlot(slot: number, history: SnapshotHistory): Promise<boolean> {
  const imageValue = slot === 2 ? history.image2 : history.image1;
  const updatedAt = slot === 2 ? history.image2UpdatedAt : history.image1UpdatedAt;
  if (!imageValue) return false;
  const identity = slotIdentity(imageValue, updatedAt);
  if (analyzedKeys.get(slot) === identity.imageKey || rfInFlightKeys.get(slot) === identity.imageKey) return false;

  emitStatus(slot, identity, "loading", "Menyiapkan gambar...");
  const image = await loadImageSource(imageValue);
  if (!image) {
    emitStatus(slot, identity, "error", `Gambar ${slot} tidak dapat dibaca`);
    return false;
  }

  emitStatus(slot, identity, "running", "Mencari objek...");
  const quickResult = quickDetectionResult(image);
  if (quickResult) {
    emitResult(slot, identity, quickResult);
    analyzedKeys.set(slot, identity.imageKey);
    setStatus(`Gambar ${slot}: ${quickResult.detections.length} objek terkonfirmasi`);
    scheduleRfDetrVerification(slot, identity, image, quickResult);
    return true;
  }
  scheduleRfDetrVerification(slot, identity, image, null);
  return true;
}

function schedule(delay: number): void {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => void tick(), delay);
}

async function tick(): Promise<void> {
  if (busy) {
    schedule(RETRY_MS);
    return;
  }
  busy = true;
  let analyzed = false;
  try {
    const history = await loadHistory();
    const preferred = nextSlot;
    nextSlot = nextSlot === 1 ? 2 : 1;
    analyzed = await analyzeSlot(preferred, history);
    if (!analyzed) analyzed = await analyzeSlot(nextSlot, history);
  } catch (error) {
    const note = error instanceof Error ? error.message : "AI tidak tersedia";
    setStatus(note);
  } finally {
    busy = false;
    schedule(analyzed ? RETRY_MS : REFRESH_MS);
  }
}

void tick();
