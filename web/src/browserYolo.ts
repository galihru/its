export type BrowserYoloDetection = {
  label: string;
  confidence: number;
  vehicle?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserYoloBreakdown = {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
  bicycle: number;
  total: number;
};

export type BrowserYoloResult = {
  status: "online" | "no-frame" | "error";
  note: string;
  updatedAt: number;
  fps: number;
  frameWidth: number;
  frameHeight: number;
  objectCount: number;
  vehicleCount: number;
  vehicleBreakdown: BrowserYoloBreakdown;
  detections: BrowserYoloDetection[];
  rawThumbnailUrl?: string;
  annotatedThumbnailUrl?: string;
  modelUrl: string;
  outputShape: string;
};

type OrtModule = typeof import("onnxruntime-web");
type OrtSession = Awaited<ReturnType<typeof import("onnxruntime-web").InferenceSession.create>>;
type ImageSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

const YOLO_INPUT_SIZE = 640;
const YOLO_CAPTURE_MAX_EDGE = 960;
const YOLO_CONFIDENCE = 0.28;
const YOLO_NMS = 0.45;
const YOLO_MAX_DETECTIONS = 80;
const ORT_WASM_VERSION = "1.26.0-dev.20260416-b7804b056c";
const VEHICLE_LABELS = new Set(["bicycle", "car", "motorcycle", "bus", "truck"]);

const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
  "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
  "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
  "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
  "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
  "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake",
  "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop",
  "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
  "toothbrush",
];

let yoloSessionPromise: Promise<OrtSession> | null = null;
let ortModulePromise: Promise<OrtModule> | null = null;

export function resolvePublicAssetUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const here = new URL(".", window.location.href);
  if (/\/desktop\/[^/]*$/i.test(window.location.pathname)) {
    return new URL(`../${clean}`, here).toString();
  }
  return new URL(clean, here).toString();
}

export function browserYoloModelUrl(): string {
  return resolvePublicAssetUrl("artifacts/yolo26n.onnx");
}

export function vehicleBreakdownFromYoloDetections(detections: BrowserYoloDetection[]): BrowserYoloBreakdown {
  const breakdown: BrowserYoloBreakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
  detections.forEach((det) => {
    const label = det.label.trim().toLowerCase();
    if (label === "car") breakdown.car += 1;
    else if (label === "motorcycle") breakdown.motorcycle += 1;
    else if (label === "bus") breakdown.bus += 1;
    else if (label === "truck") breakdown.truck += 1;
    else if (label === "bicycle") breakdown.bicycle += 1;
  });
  breakdown.total = breakdown.car + breakdown.motorcycle + breakdown.bus + breakdown.truck + breakdown.bicycle;
  return breakdown;
}

export function drawYoloDetections(
  canvas: HTMLCanvasElement,
  detections: BrowserYoloDetection[],
  frameWidth: number,
  frameHeight: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || frameWidth <= 0 || frameHeight <= 0) return;
  const cssWidth = canvas.clientWidth || frameWidth;
  const cssHeight = canvas.clientHeight || frameHeight;
  const ratio = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.round(cssWidth * ratio));
  const targetHeight = Math.max(1, Math.round(cssHeight * ratio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const fit = canvas.dataset.yoloFit === "contain" ? "contain" : "cover";
  const scale = fit === "contain"
    ? Math.min(canvas.width / frameWidth, canvas.height / frameHeight)
    : Math.max(canvas.width / frameWidth, canvas.height / frameHeight);
  const drawnWidth = frameWidth * scale;
  const drawnHeight = frameHeight * scale;
  const offsetX = (canvas.width - drawnWidth) / 2;
  const offsetY = (canvas.height - drawnHeight) / 2;
  ctx.lineWidth = Math.max(2, 2 * ratio);
  ctx.font = `${Math.max(11, 11 * ratio)}px Segoe UI, Arial, sans-serif`;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  detections.slice(0, 18).forEach((det) => {
    if (!isRenderableDetection(det, frameWidth, frameHeight)) return;
    const x = det.x * scale + offsetX;
    const y = det.y * scale + offsetY;
    const w = det.width * scale;
    const h = det.height * scale;
    const left = clamp(x, 0, canvas.width);
    const top = clamp(y, 0, canvas.height);
    const right = clamp(x + w, 0, canvas.width);
    const bottom = clamp(y + h, 0, canvas.height);
    const boxWidth = right - left;
    const boxHeight = bottom - top;
    if (boxWidth < 5 * ratio || boxHeight < 5 * ratio) return;
    const vehicle = Boolean(det.vehicle || VEHICLE_LABELS.has(det.label.toLowerCase()));
    const stroke = vehicle ? "#37dd86" : "#36d7ff";
    const fill = vehicle ? "rgba(16, 185, 129, 0.92)" : "rgba(14, 116, 144, 0.92)";
    const confidence = clamp(det.confidence, 0, 1);
    const text = `${det.label} ${Math.round(confidence * 100)}%`;
    const labelWidth = Math.min(ctx.measureText(text).width + 12 * ratio, Math.max(58 * ratio, canvas.width - left));
    const labelHeight = 20 * ratio;
    ctx.strokeStyle = stroke;
    ctx.shadowColor = "rgba(0,0,0,0.52)";
    ctx.shadowBlur = 7 * ratio;
    ctx.strokeRect(left, top, boxWidth, boxHeight);
    ctx.shadowBlur = 0;
    ctx.fillStyle = fill;
    ctx.fillRect(left, Math.max(0, top - labelHeight), Math.max(58 * ratio, labelWidth), labelHeight);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, left + 6 * ratio, Math.max(14 * ratio, top - 6 * ratio));
  });
  ctx.restore();
}

export async function runBrowserYolo(source: ImageSource): Promise<BrowserYoloResult> {
  const startedAt = performance.now();
  const modelUrl = browserYoloModelUrl();
  const frame = captureImageSource(source);
  if (!frame) {
    return emptyResult("no-frame", "Frame kamera belum tersedia", modelUrl);
  }
  try {
    const ort = await loadOrtModule();
    const session = await loadYoloSession(modelUrl);
    const input = imageDataToTensor(ort, frame.imageData);
    const inputName = session.inputNames[0] || "images";
    const output = await session.run({ [inputName]: input });
    const outputName = session.outputNames[0] || Object.keys(output)[0];
    const tensor = output[outputName];
    const detections = nonMaxSuppression(
      parseYoloOutput(Array.from(tensor.data as Float32Array), tensor.dims, frame.width, frame.height),
      YOLO_NMS,
    ).slice(0, YOLO_MAX_DETECTIONS);
    const breakdown = vehicleBreakdownFromYoloDetections(detections);
    const rawThumbnailUrl = frame.canvas.toDataURL("image/jpeg", 0.56);
    const annotatedThumbnailUrl = annotatedSnapshot(frame.canvas, detections, frame.width, frame.height);
    const elapsed = Math.max(1, performance.now() - startedAt);
    return {
      status: "online",
      note: detections.length ? "YOLO ONNX browser mendeteksi objek" : "YOLO ONNX browser aktif, belum ada objek",
      updatedAt: Date.now(),
      fps: Number((1000 / elapsed).toFixed(2)),
      frameWidth: frame.width,
      frameHeight: frame.height,
      objectCount: detections.length,
      vehicleCount: breakdown.total,
      vehicleBreakdown: breakdown,
      detections,
      rawThumbnailUrl,
      annotatedThumbnailUrl,
      modelUrl,
      outputShape: tensor.dims.join("x"),
    };
  } catch (error) {
    return emptyResult("error", error instanceof Error ? error.message : "YOLO browser gagal", modelUrl);
  }
}

export async function loadImageSource(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function publishBrowserYoloResult(
  firebaseRootUrl: string,
  deviceId: string,
  viewerId: string,
  cameraUrl: string,
  result: BrowserYoloResult,
): Promise<void> {
  if (!firebaseRootUrl || !deviceId || result.status !== "online") return;
  const trafficLevel = result.vehicleCount >= 11 ? "padat" : result.vehicleCount >= 6 ? "sedang" : "lancar";
  const trafficColor = trafficLevel === "padat" ? "red" : trafficLevel === "sedang" ? "yellow" : "green";
  const compactDetections = result.detections.map((det) => ({
    label: det.label,
    confidence: Number(det.confidence.toFixed(4)),
    vehicle: Boolean(det.vehicle),
    x: Math.round(det.x),
    y: Math.round(det.y),
    width: Math.round(det.width),
    height: Math.round(det.height),
  }));
  const datasetPath = `trafficObjectDetectionDataset/devices/${deviceId}`;
  const datasetPayload = {
    deviceId,
    source: "browser-yolo",
    format: "image/jpeg",
    updatedAt: result.updatedAt,
    cameraUrl,
    snapshot1Url: result.annotatedThumbnailUrl || result.rawThumbnailUrl || "",
    snapshot2Url: result.rawThumbnailUrl || result.annotatedThumbnailUrl || "",
    vehicleCount: result.vehicleCount,
    vehicleBreakdown: result.vehicleBreakdown,
    objectCount: result.objectCount,
    detections: compactDetections,
    detectorStatus: result.status,
    detectorFrameWidth: result.frameWidth,
    detectorFrameHeight: result.frameHeight,
    trafficLevel,
    trafficColor,
  };
  const browserPayload = {
    source: "browser-yolo",
    status: result.status,
    note: result.note,
    updatedAt: result.updatedAt,
    thumbnailUpdatedAt: result.updatedAt,
    fps: result.fps,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    objectCount: result.objectCount,
    vehicleCount: result.vehicleCount,
    vehicleBreakdown: result.vehicleBreakdown,
    detections: compactDetections,
    cameraUrl,
    modelUrl: result.modelUrl,
    outputShape: result.outputShape,
    thumbnailUrl: result.annotatedThumbnailUrl || result.rawThumbnailUrl || "",
    viewerId,
    trafficLevel,
    trafficColor,
    cameraDataset: {
      path: datasetPath,
      source: "browser-yolo",
      updatedAt: result.updatedAt,
      snapshot1Url: result.annotatedThumbnailUrl || result.rawThumbnailUrl || "",
      snapshot2Url: result.rawThumbnailUrl || result.annotatedThumbnailUrl || "",
    },
  };
  const devicePatch = {
    detectorStatus: result.status,
    detectorNote: result.note,
    detectorUpdatedAt: result.updatedAt,
    detectorFps: result.fps,
    detectorFrameWidth: result.frameWidth,
    detectorFrameHeight: result.frameHeight,
    detectorCameraSource: cameraUrl || "browser-frame",
    detectorConfidence: YOLO_CONFIDENCE,
    detectorOutputShape: result.outputShape,
    objectCount: result.objectCount,
    vehicleCount: result.vehicleCount,
    vehicleBreakdown: result.vehicleBreakdown,
    detections: compactDetections,
    cameraThumbnailUrl: result.annotatedThumbnailUrl || result.rawThumbnailUrl || "",
    cameraDataset: {
      path: datasetPath,
      source: "browser-yolo",
      updatedAt: result.updatedAt,
      snapshot1Url: result.annotatedThumbnailUrl || result.rawThumbnailUrl || "",
      snapshot2Url: result.rawThumbnailUrl || result.annotatedThumbnailUrl || "",
    },
    trafficSource: `adaptive-browser-yolo-${trafficLevel}`,
  };
  await Promise.all([
    firebasePatch(firebaseRootUrl, `browserYolo/devices/${deviceId}`, browserPayload),
    firebasePatch(firebaseRootUrl, datasetPath, datasetPayload),
    firebasePatch(firebaseRootUrl, `devices/${deviceId}`, devicePatch),
  ]);
}

function emptyResult(status: BrowserYoloResult["status"], note: string, modelUrl: string): BrowserYoloResult {
  const vehicleBreakdown: BrowserYoloBreakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
  return {
    status,
    note,
    updatedAt: Date.now(),
    fps: 0,
    frameWidth: 0,
    frameHeight: 0,
    objectCount: 0,
    vehicleCount: 0,
    vehicleBreakdown,
    detections: [],
    modelUrl,
    outputShape: "",
  };
}

async function loadYoloSession(modelUrl: string): Promise<OrtSession> {
  if (yoloSessionPromise) return yoloSessionPromise;
  yoloSessionPromise = (async () => {
    const ort = await loadOrtModule();
    return ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  })();
  return yoloSessionPromise;
}

async function loadOrtModule(): Promise<OrtModule> {
  if (ortModulePromise) return ortModulePromise;
  ortModulePromise = import("onnxruntime-web").then((ort) => {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WASM_VERSION}/dist/`;
    return ort;
  });
  return ortModulePromise;
}

function captureImageSource(source: ImageSource): { canvas: HTMLCanvasElement; imageData: ImageData; width: number; height: number } | null {
  const sourceWidth = source instanceof HTMLVideoElement
    ? source.videoWidth
    : source instanceof HTMLImageElement
      ? source.naturalWidth || source.width
      : source.width;
  const sourceHeight = source instanceof HTMLVideoElement
    ? source.videoHeight
    : source instanceof HTMLImageElement
      ? source.naturalHeight || source.height
      : source.height;
  if (!sourceWidth || !sourceHeight) return null;
  const scale = Math.min(1, YOLO_CAPTURE_MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return { canvas, imageData, width, height };
}

function imageDataToTensor(ort: OrtModule, image: ImageData): import("onnxruntime-web").Tensor {
  const resized = document.createElement("canvas");
  resized.width = YOLO_INPUT_SIZE;
  resized.height = YOLO_INPUT_SIZE;
  const ctx = resized.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D tidak tersedia");
  const source = document.createElement("canvas");
  source.width = image.width;
  source.height = image.height;
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) throw new Error("Canvas source tidak tersedia");
  sourceCtx.putImageData(image, 0, 0);
  ctx.drawImage(source, 0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE);
  const data = ctx.getImageData(0, 0, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE).data;
  const tensor = new Float32Array(1 * 3 * YOLO_INPUT_SIZE * YOLO_INPUT_SIZE);
  const plane = YOLO_INPUT_SIZE * YOLO_INPUT_SIZE;
  for (let i = 0; i < plane; i += 1) {
    const offset = i * 4;
    tensor[i] = (data[offset] || 0) / 255;
    tensor[plane + i] = (data[offset + 1] || 0) / 255;
    tensor[plane * 2 + i] = (data[offset + 2] || 0) / 255;
  }
  return new ort.Tensor("float32", tensor, [1, 3, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]);
}

function parseYoloOutput(data: number[], dims: readonly number[], frameWidth: number, frameHeight: number): BrowserYoloDetection[] {
  if (!data.length || dims.length < 2) return [];
  const a = dims[dims.length - 2] || 0;
  const b = dims[dims.length - 1] || 0;
  if (a <= 0 || b < 6) return [];
  if (a > b) return parseRowsOutput(data, a, b, (row, attr) => row * b + attr, frameWidth, frameHeight);
  return parseRowsOutput(data, b, a, (row, attr) => attr * b + row, frameWidth, frameHeight);
}

function parseRowsOutput(
  data: number[],
  rows: number,
  attrs: number,
  index: (row: number, attr: number) => number,
  frameWidth: number,
  frameHeight: number,
): BrowserYoloDetection[] {
  if (attrs === 6) {
    const parsed = parseSixAttributeOutput(data, rows, index, frameWidth, frameHeight);
    if (parsed.length) return parsed;
  }
  const classStart = attrs >= 85 ? 5 : 4;
  const hasObjectness = attrs >= 85;
  const detections: BrowserYoloDetection[] = [];
  for (let row = 0; row < rows; row += 1) {
    const cx = read(data, index(row, 0));
    const cy = read(data, index(row, 1));
    const width = read(data, index(row, 2));
    const height = read(data, index(row, 3));
    const objectness = hasObjectness ? normalizeScore(read(data, index(row, 4))) : 1;
    let bestClass = -1;
    let bestScore = 0;
    for (let attr = classStart; attr < attrs; attr += 1) {
      const score = normalizeScore(read(data, index(row, attr))) * objectness;
      if (score > bestScore) {
        bestScore = score;
        bestClass = attr - classStart;
      }
    }
    const label = COCO_LABELS[bestClass] || `class-${bestClass}`;
    if (bestScore >= YOLO_CONFIDENCE) {
      const detection = toCenterDetection(label, bestScore, cx, cy, width, height, frameWidth, frameHeight);
      if (detection) detections.push(detection);
    }
  }
  return detections;
}

function parseSixAttributeOutput(
  data: number[],
  rows: number,
  index: (row: number, attr: number) => number,
  frameWidth: number,
  frameHeight: number,
): BrowserYoloDetection[] {
  const detections: BrowserYoloDetection[] = [];
  for (let row = 0; row < rows; row += 1) {
    const a0 = read(data, index(row, 0));
    const a1 = read(data, index(row, 1));
    const a2 = read(data, index(row, 2));
    const a3 = read(data, index(row, 3));
    const a4 = read(data, index(row, 4));
    const a5 = read(data, index(row, 5));
    const pair = isClassId(a5) && isProbabilityScore(a4) ? [Math.round(a5), a4]
      : isClassId(a4) && isProbabilityScore(a5) ? [Math.round(a4), a5]
        : null;
    if (!pair) continue;
    const [classId, rawScore] = pair;
    const score = clamp(rawScore, 0, 1);
    if (score < YOLO_CONFIDENCE) continue;
    const label = COCO_LABELS[classId] || `class-${classId}`;
    const detection = a2 > a0 && a3 > a1
      ? toCornerDetection(label, score, a0, a1, a2, a3, frameWidth, frameHeight)
      : toCenterDetection(label, score, a0, a1, a2, a3, frameWidth, frameHeight);
    if (detection) detections.push(detection);
  }
  return detections;
}

function toCenterDetection(label: string, confidence: number, cx: number, cy: number, width: number, height: number, frameWidth: number, frameHeight: number): BrowserYoloDetection | null {
  if (!rawBoxIsReasonable([cx, cy, width, height])) return null;
  const normalized = [cx, cy, width, height].every((value) => value >= 0 && value <= 1.5);
  if (!normalized && (width > YOLO_INPUT_SIZE * 1.12 || height > YOLO_INPUT_SIZE * 1.12)) return null;
  const scaleX = normalized ? frameWidth : frameWidth / YOLO_INPUT_SIZE;
  const scaleY = normalized ? frameHeight : frameHeight / YOLO_INPUT_SIZE;
  const boxWidth = clamp(width * scaleX, 0, frameWidth);
  const boxHeight = clamp(height * scaleY, 0, frameHeight);
  const x = clamp((cx * scaleX) - boxWidth / 2, 0, frameWidth);
  const y = clamp((cy * scaleY) - boxHeight / 2, 0, frameHeight);
  if (!boxIsReasonable(x, y, boxWidth, boxHeight, frameWidth, frameHeight)) return null;
  return normalizeDetection({ label, confidence, x, y, width: boxWidth, height: boxHeight });
}

function toCornerDetection(label: string, confidence: number, x1: number, y1: number, x2: number, y2: number, frameWidth: number, frameHeight: number): BrowserYoloDetection | null {
  if (!rawBoxIsReasonable([x1, y1, x2, y2])) return null;
  const normalized = [x1, y1, x2, y2].every((value) => value >= 0 && value <= 1.5);
  if (!normalized && [x1, y1, x2, y2].some((value) => value < -YOLO_INPUT_SIZE * 0.08 || value > YOLO_INPUT_SIZE * 1.08)) return null;
  const scaleX = normalized ? frameWidth : frameWidth / YOLO_INPUT_SIZE;
  const scaleY = normalized ? frameHeight : frameHeight / YOLO_INPUT_SIZE;
  const left = clamp(x1 * scaleX, 0, frameWidth);
  const top = clamp(y1 * scaleY, 0, frameHeight);
  const right = clamp(x2 * scaleX, 0, frameWidth);
  const bottom = clamp(y2 * scaleY, 0, frameHeight);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  if (!boxIsReasonable(left, top, width, height, frameWidth, frameHeight)) return null;
  return normalizeDetection({ label, confidence, x: left, y: top, width, height });
}

function normalizeDetection(det: BrowserYoloDetection): BrowserYoloDetection {
  const key = det.label.trim().toLowerCase();
  return { ...det, confidence: clamp(det.confidence, 0, 1), vehicle: VEHICLE_LABELS.has(key) };
}

function nonMaxSuppression(detections: BrowserYoloDetection[], threshold: number): BrowserYoloDetection[] {
  return detections
    .sort((a, b) => b.confidence - a.confidence)
    .reduce<BrowserYoloDetection[]>((kept, candidate) => {
      const overlaps = kept.some((existing) => existing.label === candidate.label && iou(existing, candidate) > threshold);
      return overlaps ? kept : [...kept, candidate];
    }, []);
}

function annotatedSnapshot(source: HTMLCanvasElement, detections: BrowserYoloDetection[], frameWidth: number, frameHeight: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.68);
  ctx.drawImage(source, 0, 0, frameWidth, frameHeight);
  drawYoloDetections(canvas, detections, frameWidth, frameHeight);
  return canvas.toDataURL("image/jpeg", 0.62);
}

function firebasePatch(rootUrl: string, path: string, payload: unknown): Promise<void> {
  const url = `${rootUrl.replace(/\/+$/, "")}/${path.split("/").map(encodeURIComponent).join("/")}.json`;
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) throw new Error(`Firebase PATCH ${path} HTTP ${res.status}`);
  });
}

function read(data: number[], index: number): number {
  return index >= 0 && index < data.length ? Number(data[index]) || 0 : 0;
}

function isClassId(value: number): boolean {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= 0.001 && rounded >= 0 && rounded < COCO_LABELS.length;
}

function isProbabilityScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1.05;
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;
  if (value > -50 && value < 50) return 1 / (1 + Math.exp(-value));
  return value > 0 ? 1 : 0;
}

function rawBoxIsReasonable(values: number[]): boolean {
  return values.every(Number.isFinite) && values[2] > 0 && values[3] > 0;
}

function boxIsReasonable(x: number, y: number, width: number, height: number, frameWidth: number, frameHeight: number): boolean {
  if (![x, y, width, height, frameWidth, frameHeight].every(Number.isFinite)) return false;
  if (width < 2 || height < 2 || frameWidth <= 0 || frameHeight <= 0) return false;
  if (x + width <= 0 || y + height <= 0 || x >= frameWidth || y >= frameHeight) return false;
  const widthRatio = width / frameWidth;
  const heightRatio = height / frameHeight;
  const aspect = width / Math.max(1, height);
  if (widthRatio > 0.82 || heightRatio > 0.82) return false;
  if (widthRatio > 0.54 && heightRatio > 0.18) return false;
  if (heightRatio > 0.54 && widthRatio > 0.18) return false;
  if ((x <= 2 || y <= 2) && (widthRatio > 0.04 || heightRatio > 0.04)) return false;
  if (aspect > 5.2 || aspect < 0.18) return false;
  const areaRatio = (width * height) / Math.max(1, frameWidth * frameHeight);
  if (areaRatio > 0.22) return false;
  if (width > frameWidth * 0.99 && height > frameHeight * 0.62) return false;
  if (height > frameHeight * 0.99 && width > frameWidth * 0.62) return false;
  return true;
}

function isRenderableDetection(det: BrowserYoloDetection, frameWidth: number, frameHeight: number): boolean {
  return boxIsReasonable(det.x, det.y, det.width, det.height, frameWidth, frameHeight);
}

function iou(a: BrowserYoloDetection, b: BrowserYoloDetection): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const interX1 = Math.max(a.x, b.x);
  const interY1 = Math.max(a.y, b.y);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);
  const interWidth = Math.max(0, interX2 - interX1);
  const interHeight = Math.max(0, interY2 - interY1);
  const union = a.width * a.height + b.width * b.height - interWidth * interHeight;
  return union <= 0 ? 0 : (interWidth * interHeight) / union;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
