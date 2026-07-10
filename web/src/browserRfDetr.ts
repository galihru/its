export type BrowserRfDetrDetection = {
  label: string;
  confidence: number;
  vehicle?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserRfDetrBreakdown = {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
  bicycle: number;
  total: number;
};

export type BrowserRfDetrResult = {
  status: "online" | "no-frame" | "error";
  note: string;
  updatedAt: number;
  fps: number;
  frameWidth: number;
  frameHeight: number;
  objectCount: number;
  vehicleCount: number;
  vehicleBreakdown: BrowserRfDetrBreakdown;
  detections: BrowserRfDetrDetection[];
  rawThumbnailUrl?: string;
  annotatedThumbnailUrl?: string;
  modelUrl: string;
  outputShape: string;
};

export type BrowserRfDetrRunOptions = {
  captureMaxEdge?: number;
  detailCrops?: boolean;
  modelId?: string;
  worker?: boolean;
  workerFallbackToMainThread?: boolean;
  includeThumbnails?: boolean;
  confidenceThreshold?: number;
  minLabelConfidenceScale?: number;
};

export type DrawRfDetrDetectionsOptions = {
  hud?: boolean;
  scanActive?: boolean;
  scannerFocus?: BrowserRfDetrDetection | null;
};

type ImageSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;
type DetectorCanvas = HTMLCanvasElement | OffscreenCanvas;
type RfDetrOutput = import("@huggingface/transformers").ObjectDetectionOutput;
type RfDetrPipeline = ((image: DetectorCanvas, options?: {
  threshold?: number;
  percentage?: boolean;
}) => Promise<RfDetrOutput>) & {
  dispose?: () => Promise<void>;
};

export const RF_DETR_ANDROID_MODEL_ID = "onnx-community/rfdetr_nano-ONNX";
const RF_DETR_MODEL_ID = RF_DETR_ANDROID_MODEL_ID;
const RF_DETR_MODEL_URL = `https://hf.co/${RF_DETR_MODEL_ID}`;
const DETR_FALLBACK_MODEL_ID = "Xenova/detr-resnet-50";
const RF_DETR_CONFIDENCE = 0.2;
const RF_DETR_MAX_DETECTIONS = 48;
const RF_DETR_DETAIL_CROP_LIMIT = 3;
const RF_DETR_CAPTURE_MAX_EDGE = 960;
const RF_DETR_DEFAULT_CONFIDENCE = 0.18;
const RF_DETR_NMS = 0.52;
const RF_DETR_CANDIDATE_LIMIT = 72;
const RF_DETR_SOFT_NMS_SIGMA = 0.55;
const RENDER_TRACK_LIMIT = 14;
const RENDER_TRACK_TTL_MS = 1200;
const RENDER_TRACK_TAU_MS = 190;
const RENDER_SCANNER_LOCK_MS = 620;
const VEHICLE_LABELS = new Set(["bicycle", "car", "motorcycle", "bus", "truck"]);
const MIN_CONFIDENCE_BY_LABEL: Record<string, number> = {
  person: 0.22,
  bicycle: 0.18,
  car: 0.18,
  motorcycle: 0.18,
  bus: 0.2,
  truck: 0.2,
  "traffic light": 0.2,
  "stop sign": 0.22,
  "parking meter": 0.92,
  tie: 0.82,
  sink: 0.76,
  spoon: 0.72,
  fork: 0.58,
  knife: 0.58,
  bottle: 0.3,
  toothbrush: 0.48,
};
const VEHICLE_COUNT_CONFIDENCE: Record<string, number> = {
  bicycle: 0.92,
  car: 0.24,
  motorcycle: 0.24,
  bus: 0.28,
  truck: 0.28,
};

type CapturedFrame = {
  canvas: DetectorCanvas;
  imageData: ImageData;
  width: number;
  height: number;
};

type DetectionCrop = CapturedFrame & {
  x: number;
  y: number;
};

type DetectionTrack = BrowserRfDetrDetection & {
  id: number;
  createdAt: number;
  lastSeen: number;
  seen: number;
  alpha: number;
};

const DETECTION_LABEL_ALIASES: Record<string, string> = {
  human: "person",
  pedestrian: "person",
  orang: "person",
  manusia: "person",
  bike: "bicycle",
  cycle: "bicycle",
  sepeda: "bicycle",
  auto: "car",
  automobile: "car",
  vehicle: "car",
  mobil: "car",
  motorbike: "motorcycle",
  motor: "motorcycle",
  sepeda_motor: "motorcycle",
  "sepeda motor": "motorcycle",
  truk: "truck",
  bis: "bus",
  lampu: "traffic light",
  "lampu lalu lintas": "traffic light",
  tanaman: "potted plant",
  tumbuhan: "potted plant",
  pohon: "tree",
  rumput: "grass",
  pembatas: "barrier",
  palang: "barrier",
  "palang parkir": "parking gate",
  wastafel: "sink",
};

const DETECTION_LABELS_ID: Record<string, string> = {
  person: "Orang",
  bicycle: "Sepeda",
  car: "Mobil",
  motorcycle: "Motor",
  airplane: "Pesawat",
  bus: "Bus",
  train: "Kereta",
  truck: "Truk",
  boat: "Perahu",
  "traffic light": "Lampu Lalu Lintas",
  "fire hydrant": "Hidran",
  "stop sign": "Rambu Stop",
  "parking meter": "Meter Parkir",
  bench: "Bangku",
  bird: "Burung",
  cat: "Kucing",
  dog: "Anjing",
  horse: "Kuda",
  sheep: "Domba",
  cow: "Sapi",
  elephant: "Gajah",
  bear: "Beruang",
  zebra: "Zebra",
  giraffe: "Jerapah",
  backpack: "Ransel",
  umbrella: "Payung",
  handbag: "Tas",
  tie: "Dasi",
  suitcase: "Koper",
  frisbee: "Frisbee",
  skis: "Ski",
  snowboard: "Snowboard",
  "sports ball": "Bola",
  kite: "Layang-layang",
  "baseball bat": "Tongkat Baseball",
  "baseball glove": "Sarung Tangan Baseball",
  skateboard: "Skateboard",
  surfboard: "Papan Selancar",
  "tennis racket": "Raket Tenis",
  bottle: "Botol",
  "wine glass": "Gelas",
  cup: "Cangkir",
  fork: "Garpu",
  knife: "Pisau",
  spoon: "Sendok",
  bowl: "Mangkuk",
  banana: "Pisang",
  apple: "Apel",
  sandwich: "Roti Lapis",
  orange: "Jeruk",
  broccoli: "Brokoli",
  carrot: "Wortel",
  "hot dog": "Hot Dog",
  pizza: "Pizza",
  donut: "Donat",
  cake: "Kue",
  chair: "Kursi",
  couch: "Sofa",
  "potted plant": "Tanaman",
  plant: "Tanaman",
  tree: "Pohon",
  grass: "Rumput",
  barrier: "Pembatas Jalan",
  "parking gate": "Palang Parkir",
  road: "Jalan",
  sidewalk: "Trotoar",
  bed: "Tempat Tidur",
  "dining table": "Meja Makan",
  toilet: "Toilet",
  tv: "TV",
  laptop: "Laptop",
  mouse: "Mouse",
  remote: "Remote",
  keyboard: "Keyboard",
  "cell phone": "Ponsel",
  object: "Benda",
  "unknown object": "Benda",
  "toy vehicle": "Miniatur Kendaraan",
  floor: "Lantai",
  microwave: "Microwave",
  oven: "Oven",
  toaster: "Pemanggang",
  sink: "Wastafel",
  refrigerator: "Kulkas",
  book: "Buku",
  clock: "Jam",
  vase: "Vas",
  scissors: "Gunting",
  "teddy bear": "Boneka",
  "hair drier": "Pengering Rambut",
  toothbrush: "Sikat Gigi",
};

const rfDetrPipelinePromises = new Map<string, Promise<RfDetrPipeline>>();
let rfDetrLoadingNote = "";
let activeObjectDetectionModelId = RF_DETR_MODEL_ID;
let rfDetrInferenceQueue: Promise<void> = Promise.resolve();
let rfDetrWorker: Worker | null = null;
let rfDetrWorkerRequestId = 0;
const rfDetrWorkerRequests = new Map<number, {
  resolve: (result: BrowserRfDetrResult) => void;
  reject: (error: Error) => void;
  timer: number;
}>();
let nextDetectionTrackId = 1;
const detectionTracksByCanvas = new WeakMap<HTMLCanvasElement, DetectionTrack[]>();

export function resolvePublicAssetUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const here = new URL(".", window.location.href);
  if (/\/desktop\/[^/]*$/i.test(window.location.pathname)) {
    return new URL(`../${clean}`, here).toString();
  }
  return new URL(clean, here).toString();
}

export function browserRfDetrModelUrl(modelId = RF_DETR_MODEL_ID): string {
  return modelId === RF_DETR_MODEL_ID ? RF_DETR_MODEL_URL : `https://hf.co/${modelId}`;
}

export function vehicleBreakdownFromRfDetrDetections(
  detections: BrowserRfDetrDetection[],
  frameWidth = 0,
  frameHeight = 0,
): BrowserRfDetrBreakdown {
  const breakdown: BrowserRfDetrBreakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
  compactCountableVehicles(detections, frameWidth, frameHeight).forEach((det) => {
    const label = canonicalDetectionLabel(det.label);
    if (label === "car") breakdown.car += 1;
    else if (label === "motorcycle") breakdown.motorcycle += 1;
    else if (label === "bus") breakdown.bus += 1;
    else if (label === "truck") breakdown.truck += 1;
    else if (label === "bicycle") breakdown.bicycle += 1;
  });
  breakdown.total = breakdown.car + breakdown.motorcycle + breakdown.bus + breakdown.truck + breakdown.bicycle;
  return breakdown;
}

function canonicalDetectionLabel(label: string): string {
  const key = label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return DETECTION_LABEL_ALIASES[key] || key;
}

function activeModelIsRfDetr(): boolean {
  return activeObjectDetectionModelId.toLowerCase().includes("rfdetr_");
}

export function displayDetectionLabel(label: string): string {
  const key = canonicalDetectionLabel(label);
  return DETECTION_LABELS_ID[key] || titleCaseLabel(label);
}

function titleCaseLabel(label: string): string {
  return label
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function detectionColorFor(label: string): string {
  const key = canonicalDetectionLabel(label);
  if (key === "person") return "#00ff88";
  if (VEHICLE_LABELS.has(key)) return "#4488ff";
  if (["cat", "dog", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"].includes(key)) return "#ffaa00";
  if (key === "traffic light" || key === "stop sign") return "#ff44aa";
  return "#36d7ff";
}

function detectionFillFor(label: string): string {
  const key = canonicalDetectionLabel(label);
  if (key === "person") return "rgba(0, 255, 136, 0.92)";
  if (VEHICLE_LABELS.has(key)) return "rgba(68, 136, 255, 0.92)";
  if (["cat", "dog", "bird", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"].includes(key)) return "rgba(255, 170, 0, 0.92)";
  if (key === "traffic light" || key === "stop sign") return "rgba(255, 68, 170, 0.92)";
  return "rgba(54, 215, 255, 0.92)";
}

function mixHexColor(from: string, to: string, amount: number): string {
  const parse = (value: string) => {
    const hex = value.replace("#", "");
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  };
  const start = parse(from);
  const end = parse(to);
  const t = clamp(amount, 0, 1);
  const channel = (index: number) => Math.round(start[index] + (end[index] - start[index]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

export function drawRfDetrDetections(
  canvas: HTMLCanvasElement,
  detections: BrowserRfDetrDetection[],
  frameWidth: number,
  frameHeight: number,
  options: DrawRfDetrDetectionsOptions = {},
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx || frameWidth <= 0 || frameHeight <= 0) return;
  const instantStaticBoxes = options.scanActive === false;
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
  const fit = canvas.dataset.detectorFit === "contain" ? "contain" : "cover";
  const scale = fit === "contain"
    ? Math.min(canvas.width / frameWidth, canvas.height / frameHeight)
    : Math.max(canvas.width / frameWidth, canvas.height / frameHeight);
  const drawnWidth = frameWidth * scale;
  const drawnHeight = frameHeight * scale;
  const offsetX = (canvas.width - drawnWidth) / 2;
  const offsetY = (canvas.height - drawnHeight) / 2;
  const tracks = updateDetectionTracks(canvas, detections, frameWidth, frameHeight);
  const now = performance.now();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  ctx.save();
  ctx.beginPath();
  ctx.rect(offsetX, offsetY, drawnWidth, drawnHeight);
  ctx.clip();
  ctx.translate(offsetX, offsetY);
  if (options.hud !== false) drawHudGuide(ctx, drawnWidth, drawnHeight, ratio, tracks.length);
  const focusDetection = options.scannerFocus || tracks[0] || null;
  const scannerFocus = focusDetection
    ? {
      x: (focusDetection.x + focusDetection.width / 2) * scale,
      y: (focusDetection.y + focusDetection.height / 2) * scale,
      width: focusDetection.width * scale,
      height: focusDetection.height * scale,
    }
    : null;
  if (!tracks.length) {
    if (options.scanActive !== false) drawCinematicScanner(ctx, drawnWidth, drawnHeight, ratio, now, 0.95, scannerFocus);
  }
  else {
    if (options.scanActive) drawCinematicScanner(ctx, drawnWidth, drawnHeight, ratio, now, 0.62, scannerFocus);
  }
  ctx.restore();
  if (tracks.length && !instantStaticBoxes) drawScannerLocks(ctx, tracks, scale, offsetX, offsetY, ratio, now);
  tracks.slice(0, RENDER_TRACK_LIMIT).forEach((det) => {
    if (!isRenderableDetection(det, frameWidth, frameHeight)) return;
    const age = instantStaticBoxes ? 720 : Math.max(0, now - det.createdAt);
    const grow = instantStaticBoxes ? 1 : easeOutCubic(clamp(age / 720, 0, 1));
    const steadyPulse = 1 + Math.sin(now / 260 + det.id) * 0.008;
    const boxScale = Math.max(0.04, grow) * steadyPulse;
    const baseWidth = det.width * scale;
    const baseHeight = det.height * scale;
    const centerX = (det.x + det.width / 2) * scale + offsetX;
    const centerY = (det.y + det.height / 2) * scale + offsetY;
    const w = baseWidth * boxScale;
    const h = baseHeight * boxScale;
    const x = centerX - w / 2;
    const y = centerY - h / 2;
    const left = clamp(x, 0, canvas.width);
    const top = clamp(y, 0, canvas.height);
    const right = clamp(x + w, 0, canvas.width);
    const bottom = clamp(y + h, 0, canvas.height);
    const boxWidth = right - left;
    const boxHeight = bottom - top;
    if (boxWidth < 5 * ratio || boxHeight < 5 * ratio) return;
    const canonicalLabel = canonicalDetectionLabel(det.label);
    const vehicle = Boolean(det.vehicle || VEHICLE_LABELS.has(canonicalLabel));
    const finalStroke = detectionColorFor(canonicalLabel);
    const stroke = mixHexColor("#00ff88", finalStroke, easeOutCubic(clamp((grow - 0.08) / 0.92, 0, 1)));
    const fill = detectionFillFor(canonicalLabel);
    const confidence = clamp(det.confidence, 0, 1);
    const text = `${displayDetectionLabel(det.label)} ${Math.round(confidence * 100)}%`;
    ctx.font = `700 ${Math.max(10, 10 * ratio)}px "Courier New", Consolas, monospace`;
    const labelWidth = Math.min(ctx.measureText(text).width + 12 * ratio, Math.max(58 * ratio, canvas.width - left));
    const labelHeight = 20 * ratio;
    const confirmed = instantStaticBoxes || (grow >= 0.72 && (det.seen >= 2 || confidence >= 0.34));
    ctx.globalAlpha = instantStaticBoxes ? 1 : clamp(det.alpha, 0, 1);
    ctx.fillStyle = vehicle ? "rgba(0, 255, 136, 0.055)" : "rgba(54, 215, 255, 0.055)";
    ctx.fillRect(left, top, boxWidth, boxHeight);
    if (grow < 1) {
      const scanY = top + boxHeight * clamp(age / 720, 0, 1);
      const grad = ctx.createLinearGradient(left, scanY - 16 * ratio, left, scanY + 5 * ratio);
      grad.addColorStop(0, vehicle ? "rgba(0,255,136,0)" : "rgba(54,215,255,0)");
      grad.addColorStop(0.72, vehicle ? "rgba(0,255,136,0.28)" : "rgba(54,215,255,0.28)");
      grad.addColorStop(1, vehicle ? "rgba(0,255,136,0.72)" : "rgba(54,215,255,0.72)");
      ctx.fillStyle = grad;
      ctx.fillRect(left, Math.max(top, scanY - 16 * ratio), boxWidth, Math.min(20 * ratio, bottom - top));
      ctx.fillStyle = stroke;
      ctx.globalAlpha = (instantStaticBoxes ? 1 : clamp(det.alpha, 0, 1)) * 0.82;
      ctx.fillRect(left, clamp(scanY, top, bottom), boxWidth, Math.max(1, ratio));
      ctx.globalAlpha = clamp(det.alpha, 0, 1);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1.4, 1.5 * ratio);
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 8 * ratio;
    if (!confirmed) {
      ctx.setLineDash([8 * ratio, 5 * ratio]);
      ctx.lineDashOffset = -((now / 45) % (32 * ratio));
    }
    ctx.strokeRect(left, top, boxWidth, boxHeight);
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    drawDetectionCorners(ctx, left, top, boxWidth, boxHeight, ratio, stroke, confirmed ? 1 : 0.76);
    if (!instantStaticBoxes) drawDetectionTicks(ctx, left, top, boxWidth, boxHeight, ratio, stroke);
    if (!confirmed) {
      ctx.globalAlpha = 1;
      return;
    }
    ctx.fillStyle = fill;
    const labelTop = Math.max(0, top - labelHeight - 1 * ratio);
    ctx.shadowColor = stroke;
    ctx.shadowBlur = 8 * ratio;
    ctx.fillRect(left, labelTop, Math.max(58 * ratio, labelWidth), labelHeight);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#03120b";
    ctx.fillText(text, left + 6 * ratio, labelTop + 13 * ratio);
    ctx.globalAlpha = 1;
  });
  ctx.restore();
}

export async function warmBrowserRfDetr(modelId = RF_DETR_MODEL_ID): Promise<string> {
  await loadRfDetrPipeline(modelId);
  return activeObjectDetectionModelId;
}

export function browserRfDetrProgressNote(): string {
  return rfDetrLoadingNote;
}

export async function runBrowserRfDetr(
  source: ImageSource,
  options: BrowserRfDetrRunOptions = {},
): Promise<BrowserRfDetrResult> {
  const startedAt = performance.now();
  const modelUrl = browserRfDetrModelUrl(options.modelId);
  const frame = captureImageSource(source, options.captureMaxEdge);
  if (!frame) {
    return emptyResult("no-frame", "Frame kamera belum tersedia", modelUrl);
  }
  if (!imageHasSignal(frame.imageData)) {
    return emptyResult("no-frame", "Frame video belum valid", modelUrl);
  }
  const execute = async () => {
    try {
      if (options.worker && typeof Worker !== "undefined") {
        try {
          const result = await runRfDetrWorker(frame.imageData, {
            ...options,
            worker: false,
            includeThumbnails: false,
          });
          if (options.includeThumbnails !== false && isHtmlCanvas(frame.canvas)) {
            result.rawThumbnailUrl = frame.canvas.toDataURL("image/jpeg", 0.56);
            result.annotatedThumbnailUrl = annotatedSnapshot(frame.canvas, result.detections, frame.width, frame.height);
          }
          return result;
        } catch (workerError) {
          if (options.workerFallbackToMainThread === false) {
            console.warn("[ITS] RF-DETR worker failed:", workerError);
            const message = workerError instanceof Error ? workerError.message : "Worker RF-DETR gagal";
            return emptyResult("error", message, modelUrl);
          }
          console.warn("[ITS] RF-DETR worker failed, retrying on main thread:", workerError);
        }
      }
      return await runRfDetrFrame(frame, startedAt, options);
    } catch (rfDetrError) {
      console.warn("[ITS] RF-DETR browser failed:", rfDetrError);
      const rfMessage = rfDetrError instanceof Error ? rfDetrError.message : "RF-DETR browser gagal";
      return emptyResult("error", rfMessage, modelUrl);
    }
  };
  const pending = rfDetrInferenceQueue.then(execute, execute);
  rfDetrInferenceQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function runBrowserRfDetrImageData(
  imageData: ImageData,
  options: BrowserRfDetrRunOptions = {},
): Promise<BrowserRfDetrResult> {
  const modelUrl = browserRfDetrModelUrl(options.modelId);
  const frame = capturedFrameFromImageData(imageData);
  if (!frame || !imageHasSignal(frame.imageData)) {
    return emptyResult("no-frame", "Frame video belum valid", modelUrl);
  }
  return runRfDetrFrame(frame, performance.now(), { ...options, worker: false });
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

export async function publishBrowserRfDetrResult(
  firebaseRootUrl: string,
  deviceId: string,
  _viewerId: string,
  cameraUrl: string,
  result: BrowserRfDetrResult,
): Promise<void> {
  if (!firebaseRootUrl || !deviceId || result.status !== "online") return;
  const vehicleOnly = {
    source: "browser-rfdetr",
    status: result.status,
    note: result.note,
    updatedAt: result.updatedAt,
    vehicleCount: result.vehicleBreakdown.total,
    objectCount: result.objectCount,
    vehicleBreakdown: result.vehicleBreakdown,
    fps: result.fps,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    modelUrl: result.modelUrl,
    outputShape: result.outputShape,
    cameraUrl,
  };
  const devicePatch = {
    detectorStatus: result.status,
    detectorNote: result.note,
    detectorUpdatedAt: result.updatedAt,
    detectorFps: result.fps,
    detectorFrameWidth: result.frameWidth,
    detectorFrameHeight: result.frameHeight,
    detectorCameraSource: cameraUrl,
    objectCount: result.objectCount,
    vehicleCount: result.vehicleCount,
    vehicleBreakdown: result.vehicleBreakdown,
    detections: result.detections.map((detection) => ({
      label: detection.label,
      confidence: detection.confidence,
      vehicle: detection.vehicle,
      x: detection.x,
      y: detection.y,
      width: detection.width,
      height: detection.height,
    })),
    objectDetection: {
      source: vehicleOnly.source,
      status: vehicleOnly.status,
      note: vehicleOnly.note,
      updatedAt: vehicleOnly.updatedAt,
      car: result.vehicleBreakdown.car,
      motorcycle: result.vehicleBreakdown.motorcycle,
      bus: result.vehicleBreakdown.bus,
      truck: result.vehicleBreakdown.truck,
      bicycle: result.vehicleBreakdown.bicycle,
      total: result.vehicleBreakdown.total,
      objectCount: vehicleOnly.objectCount,
      fps: vehicleOnly.fps,
      frameWidth: vehicleOnly.frameWidth,
      frameHeight: vehicleOnly.frameHeight,
      modelUrl: vehicleOnly.modelUrl,
      outputShape: vehicleOnly.outputShape,
      cameraUrl: vehicleOnly.cameraUrl,
    },
  };
  await firebasePatch(firebaseRootUrl, `devices/${deviceId}`, devicePatch);
}

function emptyResult(status: BrowserRfDetrResult["status"], note: string, modelUrl: string): BrowserRfDetrResult {
  const vehicleBreakdown: BrowserRfDetrBreakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
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

function detectorConfidenceThreshold(options: BrowserRfDetrRunOptions): number {
  const threshold = Number(options.confidenceThreshold);
  return Number.isFinite(threshold) ? clamp(threshold, 0.05, 0.95) : RF_DETR_CONFIDENCE;
}

function detectorConfidenceScale(options: BrowserRfDetrRunOptions): number {
  const scale = Number(options.minLabelConfidenceScale);
  return Number.isFinite(scale) ? clamp(scale, 0.42, 1.25) : 1;
}

async function runRfDetrFrame(
  frame: CapturedFrame,
  startedAt: number,
  options: BrowserRfDetrRunOptions,
): Promise<BrowserRfDetrResult> {
  const detector = await loadRfDetrPipeline(options.modelId);
  const htmlCanvas = isHtmlCanvas(frame.canvas) ? frame.canvas : null;
  const inferenceThreshold = detectorConfidenceThreshold(options);
  const confidenceScale = detectorConfidenceScale(options);
  let detections = await inferRfDetrFrame(detector, frame, 0, 0, inferenceThreshold, confidenceScale);
  if (htmlCanvas && options.detailCrops !== false && shouldRunDetailCrops(frame, detections)) {
    const crops = detailCropsForFrame(frame, htmlCanvas).slice(0, RF_DETR_DETAIL_CROP_LIMIT);
    for (const crop of crops) {
      detections = detections.concat(await inferRfDetrFrame(detector, crop, crop.x, crop.y, inferenceThreshold, confidenceScale));
    }
  }
  detections = resolveCrossClassAmbiguity(nonMaxSuppression(detections, RF_DETR_NMS, confidenceScale), confidenceScale)
    .slice(0, RF_DETR_MAX_DETECTIONS);
  const breakdown = vehicleBreakdownFromRfDetrDetections(detections, frame.width, frame.height);
  const includeThumbnails = options.includeThumbnails !== false && Boolean(htmlCanvas);
  const rawThumbnailUrl = includeThumbnails ? htmlCanvas?.toDataURL("image/jpeg", 0.56) : undefined;
  const annotatedThumbnailUrl = includeThumbnails && htmlCanvas
    ? annotatedSnapshot(htmlCanvas, detections, frame.width, frame.height)
    : undefined;
  const elapsed = Math.max(1, performance.now() - startedAt);
  const note = detections.length
    ? `${activeModelIsRfDetr() ? "RF-DETR" : "DETR fallback"} browser mendeteksi objek`
    : rfDetrLoadingNote || `${activeModelIsRfDetr() ? "RF-DETR" : "DETR fallback"} browser aktif, masih memindai objek`;
  const activeModelUrl = `https://hf.co/${activeObjectDetectionModelId}`;
  return {
    status: "online",
    note,
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
    modelUrl: activeModelUrl,
    outputShape: `${activeObjectDetectionModelId}; detections=${detections.length}`,
  };
}

async function loadRfDetrPipeline(requestedModelId = RF_DETR_MODEL_ID): Promise<RfDetrPipeline> {
  const existing = rfDetrPipelinePromises.get(requestedModelId);
  if (existing) return existing;
  const pending = (async () => {
    const mod = await import("@huggingface/transformers");
    mod.env.allowRemoteModels = true;
    mod.env.useBrowserCache = true;
    const progressCallback = (info: unknown) => updateRfDetrProgress(info);
    const wasmOptions = {
      dtype: "q8",
      progress_callback: progressCallback,
    } as Record<string, unknown>;
    const gpu = typeof navigator !== "undefined" ? (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    }).gpu : undefined;
    const gpuAdapter = requestedModelId === RF_DETR_ANDROID_MODEL_ID && gpu
      ? await gpu.requestAdapter().catch(() => null)
      : null;
    const canUseAndroidWebGpu = Boolean(gpuAdapter);
    if (canUseAndroidWebGpu) {
      try {
        const detector = await createRfDetrManualDetector(mod, requestedModelId, {
          device: "webgpu",
          dtype: "fp16",
          progress_callback: progressCallback,
        });
        activeObjectDetectionModelId = requestedModelId;
        return detector;
      } catch (webGpuFp16Error) {
        console.warn("[ITS] RF-DETR WebGPU fp16 failed, retrying fp32:", webGpuFp16Error);
        try {
          const detector = await createRfDetrManualDetector(mod, requestedModelId, {
            device: "webgpu",
            dtype: "fp32",
            progress_callback: progressCallback,
          });
          activeObjectDetectionModelId = requestedModelId;
          return detector;
        } catch (webGpuFp32Error) {
          console.warn("[ITS] RF-DETR WebGPU failed, retrying with WASM q8:", webGpuFp32Error);
        }
      }
    }
    try {
      const detector = await createRfDetrManualDetector(mod, requestedModelId, wasmOptions);
      activeObjectDetectionModelId = requestedModelId;
      return detector;
    } catch (error) {
      console.warn("[ITS] RF-DETR manual load failed, using DETR fallback:", error);
      rfDetrLoadingNote = "RF-DETR belum kompatibel di browser ini; DETR fallback aktif";
      const detector = await mod.pipeline("object-detection", DETR_FALLBACK_MODEL_ID, {
        dtype: "q8",
        progress_callback: progressCallback,
      } as Record<string, unknown>) as RfDetrPipeline;
      activeObjectDetectionModelId = DETR_FALLBACK_MODEL_ID;
      return detector;
    }
  })();
  rfDetrPipelinePromises.set(requestedModelId, pending);
  return pending;
}

async function createRfDetrManualDetector(
  mod: typeof import("@huggingface/transformers"),
  modelId: string,
  options: Record<string, unknown>,
): Promise<RfDetrPipeline> {
  const processor = await mod.AutoProcessor.from_pretrained(modelId, options);
  const model = await mod.RFDetrForObjectDetection.from_pretrained(modelId, options);
  const detector = (async (image: DetectorCanvas, detectorOptions?: { threshold?: number; percentage?: boolean }) => {
    const threshold = detectorOptions?.threshold ?? RF_DETR_CONFIDENCE;
    const percentage = detectorOptions?.percentage ?? false;
    const preparedImages = [await mod.RawImage.read(image)];
    const imageSizes = percentage ? null : preparedImages.map((item: { height: number; width: number }) => [item.height, item.width]);
    const inputs = await processor(preparedImages);
    const output = await model({ pixel_values: inputs.pixel_values, pixel_mask: inputs.pixel_mask });
    const imageProcessor = (processor as any).image_processor;
    const processed = imageProcessor.post_process_object_detection(output, threshold, imageSizes);
    const id2label = ((model as any).config?.id2label || {}) as Record<string | number, string>;
    const first = processed[0] || { boxes: [], scores: [], classes: [] };
    return first.boxes.map((box: number[], index: number) => ({
      score: Number(first.scores[index] ?? 0),
      label: String(id2label[first.classes[index]] ?? first.classes[index] ?? "object"),
      box: boundingBoxFromArray(box, !percentage),
    }));
  }) as RfDetrPipeline;
  detector.dispose = async () => {
    await model.dispose?.();
  };
  return detector;
}

function boundingBoxFromArray(box: ArrayLike<number>, asInteger: boolean): { xmin: number; ymin: number; xmax: number; ymax: number } {
  const values = Array.from(box, (value) => Number(value));
  const [rawXmin = 0, rawYmin = 0, rawXmax = 0, rawYmax = 0] = values;
  const xmin = asInteger ? rawXmin | 0 : rawXmin;
  const ymin = asInteger ? rawYmin | 0 : rawYmin;
  const xmax = asInteger ? rawXmax | 0 : rawXmax;
  const ymax = asInteger ? rawYmax | 0 : rawYmax;
  return { xmin, ymin, xmax, ymax };
}

function updateRfDetrProgress(info: unknown): void {
  if (!info || typeof info !== "object") return;
  const raw = info as Record<string, unknown>;
  const status = typeof raw.status === "string" ? raw.status : "";
  const file = typeof raw.file === "string" ? raw.file.split("/").pop() || raw.file : "";
  const progress = typeof raw.progress === "number" && Number.isFinite(raw.progress)
    ? ` ${Math.round(raw.progress)}%`
    : "";
  if (status || file || progress) {
    rfDetrLoadingNote = `RF-DETR ${status}${file ? ` ${file}` : ""}${progress}`.trim();
  }
}

async function inferRfDetrFrame(
  detector: RfDetrPipeline,
  frame: CapturedFrame,
  offsetX: number,
  offsetY: number,
  threshold: number,
  confidenceScale: number,
): Promise<BrowserRfDetrDetection[]> {
  const output = await detector(frame.canvas, { threshold, percentage: false });
  return output.flatMap((item) => {
    const label = canonicalDetectionLabel(item.label || "");
    const score = clamp(Number(item.score) || 0, 0, 1);
    if (!label || score < scaledConfidenceForLabel(label, confidenceScale)) return [];
    const xmin = clamp(Number(item.box?.xmin) || 0, 0, frame.width);
    const ymin = clamp(Number(item.box?.ymin) || 0, 0, frame.height);
    const xmax = clamp(Number(item.box?.xmax) || 0, 0, frame.width);
    const ymax = clamp(Number(item.box?.ymax) || 0, 0, frame.height);
    const width = Math.max(0, xmax - xmin);
    const height = Math.max(0, ymax - ymin);
    const detection = normalizeDetection({ label, confidence: score, x: xmin, y: ymin, width, height }, frame.width, frame.height, confidenceScale);
    return detection ? [{ ...detection, x: detection.x + offsetX, y: detection.y + offsetY }] : [];
  });
}

function captureImageSource(source: ImageSource, requestedMaxEdge?: number): CapturedFrame | null {
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
  const maxEdge = clamp(
    Number.isFinite(requestedMaxEdge) ? Number(requestedMaxEdge) : RF_DETR_CAPTURE_MAX_EDGE,
    320,
    RF_DETR_CAPTURE_MAX_EDGE,
  );
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
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

function capturedFrameFromImageData(imageData: ImageData): CapturedFrame | null {
  if (!imageData.width || !imageData.height) return null;
  const canvas = createDetectorCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.putImageData(imageData, 0, 0);
  return { canvas, imageData, width: imageData.width, height: imageData.height };
}

function createDetectorCanvas(width: number, height: number): DetectorCanvas {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return new OffscreenCanvas(width, height);
}

function isHtmlCanvas(canvas: DetectorCanvas): canvas is HTMLCanvasElement {
  return typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement;
}

function shouldRunDetailCrops(frame: CapturedFrame, detections: BrowserRfDetrDetection[]): boolean {
  if (Math.max(frame.width, frame.height) < 520) return false;
  const confident = detections.filter((det) => det.confidence >= 0.24);
  const vehicles = detections.filter((det) => VEHICLE_LABELS.has(det.label));
  return detections.length < 3 || vehicles.length === 0 || confident.length < 2;
}

function detailCropsForFrame(frame: CapturedFrame, source: HTMLCanvasElement): DetectionCrop[] {
  const width = frame.width;
  const height = frame.height;
  const cropWidth = Math.round(width * 0.58);
  const cropHeight = Math.round(height * 0.72);
  const crops = [
    { x: 0, y: Math.round(height * 0.12), width: cropWidth, height: cropHeight },
    { x: width - cropWidth, y: Math.round(height * 0.12), width: cropWidth, height: cropHeight },
    { x: Math.round((width - cropWidth) / 2), y: Math.round(height * 0.04), width: cropWidth, height: Math.round(height * 0.82) },
  ];
  return crops.flatMap((crop) => cropImageData(source, crop.x, crop.y, crop.width, crop.height));
}

function cropImageData(source: HTMLCanvasElement, x: number, y: number, width: number, height: number): DetectionCrop[] {
  const left = clamp(Math.round(x), 0, source.width - 1);
  const top = clamp(Math.round(y), 0, source.height - 1);
  const cropWidth = Math.max(1, Math.min(Math.round(width), source.width - left));
  const cropHeight = Math.max(1, Math.min(Math.round(height), source.height - top));
  if (cropWidth < 160 || cropHeight < 120) return [];
  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return [{
    canvas,
    imageData: ctx.getImageData(0, 0, cropWidth, cropHeight),
    width: cropWidth,
    height: cropHeight,
    x: left,
    y: top,
  }];
}

function imageHasSignal(image: ImageData): boolean {
  const data = image.data;
  let samples = 0;
  let alphaSamples = 0;
  let min = 255;
  let max = 0;
  let colorDelta = 0;
  const total = Math.max(1, image.width * image.height);
  const step = Math.max(4, Math.floor(data.length / 18_000 / 4) * 4);
  for (let i = 0; i < data.length; i += step) {
    const alpha = data[i + 3] / 255;
    if (alpha < 0.1) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    alphaSamples += step / 4;
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    colorDelta += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    samples += 1;
  }
  if (!samples || alphaSamples / total < 0.18) return false;
  if (max - min > 8) return true;
  return colorDelta / samples > 4;
}

function ensureRfDetrWorker(): Worker {
  if (rfDetrWorker) return rfDetrWorker;
  const worker = new Worker(new URL("./browserRfDetrWorker.ts", import.meta.url), { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<{
    id: number;
    result?: BrowserRfDetrResult;
    error?: string;
  }>) => {
    const request = rfDetrWorkerRequests.get(event.data.id);
    if (!request) return;
    rfDetrWorkerRequests.delete(event.data.id);
    window.clearTimeout(request.timer);
    if (event.data.result) request.resolve(event.data.result);
    else request.reject(new Error(event.data.error || "Worker RF-DETR gagal"));
  });
  worker.addEventListener("error", (event) => {
    const error = new Error(event.message || "Worker RF-DETR berhenti");
    for (const request of rfDetrWorkerRequests.values()) {
      window.clearTimeout(request.timer);
      request.reject(error);
    }
    rfDetrWorkerRequests.clear();
    worker.terminate();
    if (rfDetrWorker === worker) rfDetrWorker = null;
  });
  rfDetrWorker = worker;
  return worker;
}

function runRfDetrWorker(
  imageData: ImageData,
  options: BrowserRfDetrRunOptions,
): Promise<BrowserRfDetrResult> {
  const worker = ensureRfDetrWorker();
  const id = ++rfDetrWorkerRequestId;
  const pixels = new Uint8ClampedArray(imageData.data);
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      rfDetrWorkerRequests.delete(id);
      reject(new Error("Worker RF-DETR melewati batas waktu"));
    }, 120_000);
    rfDetrWorkerRequests.set(id, { resolve, reject, timer });
    worker.postMessage({
      id,
      width: imageData.width,
      height: imageData.height,
      pixels: pixels.buffer,
      options,
    }, [pixels.buffer]);
  });
}

function normalizeDetection(
  det: BrowserRfDetrDetection,
  frameWidth: number,
  frameHeight: number,
  confidenceScale = 1,
): BrowserRfDetrDetection | null {
  const key = canonicalDetectionLabel(det.label);
  const normalized = { ...det, label: key, confidence: clamp(det.confidence, 0, 1), vehicle: VEHICLE_LABELS.has(key) };
  return detectionMatchesClassGeometry(normalized, frameWidth, frameHeight, confidenceScale) ? normalized : null;
}

function confidenceForLabel(label: string): number {
  const key = canonicalDetectionLabel(label);
  return MIN_CONFIDENCE_BY_LABEL[key] ?? RF_DETR_DEFAULT_CONFIDENCE;
}

function scaledConfidenceForLabel(label: string, scale = 1): number {
  return clamp(confidenceForLabel(label) * scale, 0.05, 0.95);
}

function countConfidenceForVehicle(label: string): number {
  const key = canonicalDetectionLabel(label);
  return VEHICLE_COUNT_CONFIDENCE[key] ?? 0.3;
}

function detectionMatchesClassGeometry(
  det: BrowserRfDetrDetection,
  frameWidth: number,
  frameHeight: number,
  confidenceScale = 1,
): boolean {
  if (!boxIsReasonable(det.x, det.y, det.width, det.height, frameWidth, frameHeight)) return false;
  const label = canonicalDetectionLabel(det.label);
  const aspect = det.width / Math.max(1, det.height);
  const areaRatio = (det.width * det.height) / Math.max(1, frameWidth * frameHeight);
  if (det.confidence < adaptiveConfidenceForDetection(det, frameWidth, frameHeight, confidenceScale)) return false;
  if (label === "person") {
    return aspect >= 0.12 && aspect <= 2.2 && areaRatio <= 0.88;
  }
  if (VEHICLE_LABELS.has(label)) {
    if (areaRatio > 0.42 && det.confidence < 0.4) return false;
    return aspect >= 0.16 && aspect <= 8.6 && areaRatio <= 0.86;
  }
  return aspect >= 0.05 && aspect <= 18 && areaRatio <= 0.9;
}

function nonMaxSuppression(detections: BrowserRfDetrDetection[], threshold: number, confidenceScale = 1): BrowserRfDetrDetection[] {
  const queue = detections
    .map((det) => ({ ...det }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, RF_DETR_CANDIDATE_LIMIT * 2);
  const kept: BrowserRfDetrDetection[] = [];
  while (queue.length && kept.length < RF_DETR_CANDIDATE_LIMIT) {
    queue.sort((a, b) => b.confidence - a.confidence);
    const current = queue.shift();
    if (!current) break;
    kept.push(current);
    for (const candidate of queue) {
      if (canonicalDetectionLabel(candidate.label) !== canonicalDetectionLabel(current.label)) continue;
      const overlap = iou(current, candidate);
      if (overlap <= threshold) continue;
      candidate.confidence *= Math.exp(-((overlap * overlap) / RF_DETR_SOFT_NMS_SIGMA));
    }
    for (let i = queue.length - 1; i >= 0; i -= 1) {
      if (queue[i].confidence < scaledConfidenceForLabel(queue[i].label, confidenceScale) * 0.62) queue.splice(i, 1);
    }
  }
  return kept;
}

function resolveCrossClassAmbiguity(detections: BrowserRfDetrDetection[], confidenceScale = 1): BrowserRfDetrDetection[] {
  const sorted = detections
    .filter((det) => det.confidence >= scaledConfidenceForLabel(det.label, confidenceScale) * 0.74)
    .sort((a, b) => detectionPriority(b) - detectionPriority(a));
  const kept: BrowserRfDetrDetection[] = [];
  for (const det of sorted) {
    const duplicate = kept.some((other) => detectionsLookDuplicated(det, other));
    if (!duplicate) kept.push(det);
  }
  return kept.sort((a, b) => b.confidence - a.confidence);
}

function detectionPriority(det: BrowserRfDetrDetection): number {
  const label = canonicalDetectionLabel(det.label);
  const preferredBoost = label === "person"
    ? 0.16
    : VEHICLE_LABELS.has(label)
      ? 0.14
      : label === "traffic light" || label === "stop sign"
        ? 0.08
        : 0;
  const penalty = label === "parking meter" || label === "tie" || label === "sink" || label === "spoon" || label === "fork" || label === "knife" ? 0.28 : 0;
  return det.confidence + preferredBoost - penalty;
}

function detectionsLookDuplicated(a: BrowserRfDetrDetection, b: BrowserRfDetrDetection): boolean {
  const aLabel = canonicalDetectionLabel(a.label);
  const bLabel = canonicalDetectionLabel(b.label);
  const overlap = iou(a, b);
  const nested = intersectionOverMinArea(a, b);
  if (aLabel === bLabel && (overlap > 0.3 || nested > 0.78)) return true;
  if (nested > 0.86 && a.confidence <= b.confidence * 1.18) return true;
  if (overlap > 0.48 && a.confidence <= b.confidence * 1.1) return true;
  const bPreferred = bLabel === "person" || VEHICLE_LABELS.has(bLabel) || bLabel === "traffic light" || bLabel === "stop sign";
  const aPreferred = aLabel === "person" || VEHICLE_LABELS.has(aLabel) || aLabel === "traffic light" || aLabel === "stop sign";
  return bPreferred && !aPreferred && nested > 0.62 && b.confidence >= a.confidence * 0.62;
}

function compactCountableVehicles(
  detections: BrowserRfDetrDetection[],
  frameWidth: number,
  frameHeight: number,
): BrowserRfDetrDetection[] {
  return detections
    .filter((det) => isCountableVehicleDetection(det, frameWidth, frameHeight))
    .sort((a, b) => b.confidence - a.confidence)
    .reduce<BrowserRfDetrDetection[]>((kept, candidate) => {
      const duplicate = kept.some((existing) => {
        const overlap = iou(existing, candidate);
        if (overlap > 0.3) return true;
        const centerDistance = Math.hypot(centerX(existing) - centerX(candidate), centerY(existing) - centerY(candidate));
        const scale = Math.max(existing.width, existing.height, candidate.width, candidate.height, 1);
        return overlap > 0.08 && centerDistance < scale * 0.34;
      });
      return duplicate ? kept : [...kept, candidate];
    }, []);
}

function isCountableVehicleDetection(det: BrowserRfDetrDetection, frameWidth: number, frameHeight: number): boolean {
  const label = canonicalDetectionLabel(det.label);
  if (!VEHICLE_LABELS.has(label)) return false;
  if (det.confidence < countConfidenceForVehicle(label)) return false;
  const aspect = det.width / Math.max(1, det.height);
  if (aspect < 0.12 || aspect > 10) return false;
  if (frameWidth > 0 && frameHeight > 0) {
    const areaRatio = (det.width * det.height) / Math.max(1, frameWidth * frameHeight);
    if (areaRatio < 0.0009 && det.confidence < 0.42) return false;
    if (areaRatio > 0.78 && det.confidence < 0.62) return false;
    if (label === "bicycle" && areaRatio > 0.36 && det.confidence < 0.72) return false;
  }
  return true;
}

function annotatedSnapshot(source: HTMLCanvasElement, detections: BrowserRfDetrDetection[], frameWidth: number, frameHeight: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source.toDataURL("image/jpeg", 0.68);
  ctx.drawImage(source, 0, 0, frameWidth, frameHeight);
  drawRfDetrDetections(canvas, detections, frameWidth, frameHeight);
  return canvas.toDataURL("image/jpeg", 0.62);
}

function firebasePatch(rootUrl: string, path: string, payload: unknown): Promise<void> {
  return firebaseWrite("PATCH", rootUrl, path, payload);
}

function firebaseWrite(method: "PATCH" | "PUT", rootUrl: string, path: string, payload: unknown): Promise<void> {
  const url = `${rootUrl.replace(/\/+$/, "")}/${path.split("/").map(encodeURIComponent).join("/")}.json`;
  return fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then((res) => {
    if (!res.ok) throw new Error(`Firebase ${method} ${path} HTTP ${res.status}`);
  });
}

function boxIsReasonable(x: number, y: number, width: number, height: number, frameWidth: number, frameHeight: number): boolean {
  if (![x, y, width, height, frameWidth, frameHeight].every(Number.isFinite)) return false;
  if (width < 2 || height < 2 || frameWidth <= 0 || frameHeight <= 0) return false;
  if (x + width <= 0 || y + height <= 0 || x >= frameWidth || y >= frameHeight) return false;
  const widthRatio = width / frameWidth;
  const heightRatio = height / frameHeight;
  const aspect = width / Math.max(1, height);
  if (widthRatio > 1.05 || heightRatio > 1.05) return false;
  if (aspect > 18 || aspect < 0.05) return false;
  const areaRatio = (width * height) / Math.max(1, frameWidth * frameHeight);
  if (areaRatio > 0.94) return false;
  return true;
}

function isRenderableDetection(det: BrowserRfDetrDetection, frameWidth: number, frameHeight: number): boolean {
  return boxIsReasonable(det.x, det.y, det.width, det.height, frameWidth, frameHeight);
}

function iou(a: BrowserRfDetrDetection, b: BrowserRfDetrDetection): number {
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

function intersectionOverMinArea(a: BrowserRfDetrDetection, b: BrowserRfDetrDetection): number {
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
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea <= 0 ? 0 : (interWidth * interHeight) / minArea;
}

function adaptiveConfidenceForDetection(
  det: BrowserRfDetrDetection,
  frameWidth: number,
  frameHeight: number,
  confidenceScale = 1,
): number {
  const base = scaledConfidenceForLabel(det.label, confidenceScale);
  const areaRatio = (det.width * det.height) / Math.max(1, frameWidth * frameHeight);
  const smallObjectBoost = areaRatio < 0.015 ? 0.055 : areaRatio < 0.05 ? 0.035 : areaRatio < 0.1 ? 0.018 : 0;
  return clamp(base - smallObjectBoost, 0.045, 0.52);
}

function updateDetectionTracks(
  canvas: HTMLCanvasElement,
  detections: BrowserRfDetrDetection[],
  frameWidth: number,
  frameHeight: number,
): DetectionTrack[] {
  const now = performance.now();
  const previous = detectionTracksByCanvas.get(canvas) || [];
  const next: DetectionTrack[] = [];
  const used = new Set<DetectionTrack>();
  const sorted = detections
    .filter((det) => isRenderableDetection(det, frameWidth, frameHeight))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, RENDER_TRACK_LIMIT);

  for (const det of sorted) {
    const match = bestTrackMatch(det, previous, used);
    if (match) {
      used.add(match);
      const dt = clamp(now - match.lastSeen, 16, 600);
      const alpha = 1 - Math.exp(-dt / RENDER_TRACK_TAU_MS);
      match.x = lerp(match.x, det.x, alpha);
      match.y = lerp(match.y, det.y, alpha);
      match.width = lerp(match.width, det.width, alpha);
      match.height = lerp(match.height, det.height, alpha);
      match.confidence = lerp(match.confidence, det.confidence, 0.54);
      match.vehicle = det.vehicle;
      match.label = det.label;
      match.seen += 1;
      match.lastSeen = now;
      match.alpha = Math.min(1, match.alpha + 0.28);
      next.push(match);
    } else {
      next.push({
        ...det,
        id: nextDetectionTrackId++,
        createdAt: now,
        lastSeen: now,
        seen: 1,
        alpha: 0.42,
      });
    }
  }

  for (const track of previous) {
    if (used.has(track) || next.includes(track)) continue;
    const age = now - track.lastSeen;
    if (age > RENDER_TRACK_TTL_MS) continue;
    next.push({ ...track, alpha: clamp(1 - age / RENDER_TRACK_TTL_MS, 0, 1) });
  }

  const tracked = next
    .sort((a, b) => b.confidence * b.alpha - a.confidence * a.alpha)
    .slice(0, RENDER_TRACK_LIMIT);
  detectionTracksByCanvas.set(canvas, tracked);
  return tracked;
}

function bestTrackMatch(
  det: BrowserRfDetrDetection,
  tracks: DetectionTrack[],
  used: Set<DetectionTrack>,
): DetectionTrack | null {
  let best: DetectionTrack | null = null;
  let bestScore = 0;
  for (const track of tracks) {
    if (used.has(track) || canonicalDetectionLabel(track.label) !== canonicalDetectionLabel(det.label)) continue;
    const overlap = iou(track, det);
    const centerDistance = Math.hypot(centerX(track) - centerX(det), centerY(track) - centerY(det));
    const size = Math.max(track.width, track.height, det.width, det.height, 1);
    const proximity = Math.max(0, 1 - centerDistance / (size * 0.9));
    const score = overlap * 0.74 + proximity * 0.26;
    if (score > bestScore) {
      bestScore = score;
      best = track;
    }
  }
  return bestScore >= 0.18 ? best : null;
}

function centerX(det: BrowserRfDetrDetection): number {
  return det.x + det.width / 2;
}

function centerY(det: BrowserRfDetrDetection): number {
  return det.y + det.height / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function easeOutCubic(value: number): number {
  const t = clamp(value, 0, 1);
  return 1 - Math.pow(1 - t, 3);
}

function drawHudGuide(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number,
  _count: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = "rgba(0,255,136,0.055)";
  ctx.lineWidth = Math.max(0.5, 0.5 * ratio);
  const gridX = Math.max(44 * ratio, width / 12);
  const gridY = Math.max(44 * ratio, height / 8);
  for (let x = gridX; x < width; x += gridX) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = gridY; y < height; y += gridY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCinematicScanner(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ratio: number,
  now: number,
  alpha = 0.95,
  focus?: { x: number; y: number; width: number; height: number } | null,
): void {
  const phase = now / 1250;
  const travelX = Math.max(1, width - 64 * ratio);
  const travelY = Math.max(1, height - 64 * ratio);
  const orbit = focus
    ? clamp(Math.min(focus.width, focus.height) * 0.14, 5 * ratio, 18 * ratio)
    : 0;
  const x = focus
    ? clamp(focus.x + Math.sin(now / 280) * orbit, 20 * ratio, width - 20 * ratio)
    : 32 * ratio + ((Math.sin(phase) + 1) / 2) * travelX;
  const y = focus
    ? clamp(focus.y + Math.cos(now / 310) * orbit, 20 * ratio, height - 20 * ratio)
    : 32 * ratio + ((Math.cos(phase * 0.82) + 1) / 2) * travelY;
  const focusSize = focus ? clamp(Math.min(focus.width, focus.height) * 0.18, 16 * ratio, 34 * ratio) : 0;
  const size = focusSize || (14 + Math.sin(now / 360) * 2.5) * ratio;
  const corner = size * 0.56;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now / 650);
  ctx.strokeStyle = "#00ff88";
  ctx.lineWidth = Math.max(1.2, 1.4 * ratio);
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 9 * ratio;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(-size, -size + corner);
  ctx.lineTo(-size, -size);
  ctx.lineTo(-size + corner, -size);
  ctx.moveTo(size - corner, -size);
  ctx.lineTo(size, -size);
  ctx.lineTo(size, -size + corner);
  ctx.moveTo(size, size - corner);
  ctx.lineTo(size, size);
  ctx.lineTo(size - corner, size);
  ctx.moveTo(-size + corner, size);
  ctx.lineTo(-size, size);
  ctx.lineTo(-size, size - corner);
  ctx.stroke();
  ctx.globalAlpha = alpha * 0.44;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(-size * 0.35, 0);
  ctx.lineTo(size * 0.35, 0);
  ctx.moveTo(0, -size * 0.35);
  ctx.lineTo(0, size * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawScannerLocks(
  ctx: CanvasRenderingContext2D,
  tracks: DetectionTrack[],
  scale: number,
  offsetX: number,
  offsetY: number,
  ratio: number,
  now: number,
): void {
  tracks.slice(0, 4).forEach((track, index) => {
    const age = now - track.createdAt;
    if (age > RENDER_SCANNER_LOCK_MS) return;
    const progress = clamp(age / RENDER_SCANNER_LOCK_MS, 0, 1);
    const cx = (track.x + track.width / 2) * scale + offsetX;
    const cy = (track.y + track.height / 2) * scale + offsetY;
    const color = detectionColorFor(track.label);
    const size = (18 + Math.sin(now / 180 + index) * 3) * ratio * (1 - progress * 0.18);
    const alpha = clamp(1 - progress * 0.22, 0, 1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(now / 520 + index * 0.7);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, 1.5 * ratio);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * ratio;
    ctx.beginPath();
    ctx.arc(0, 0, size * (1.05 + progress * 0.5), Math.PI * 0.05, Math.PI * 1.55);
    ctx.stroke();
    drawScannerBracketShape(ctx, size, ratio);
    ctx.globalAlpha = alpha * 0.42;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, 0);
    ctx.lineTo(size * 0.4, 0);
    ctx.moveTo(0, -size * 0.4);
    ctx.lineTo(0, size * 0.4);
    ctx.stroke();
    ctx.restore();
  });
}

function drawScannerBracketShape(ctx: CanvasRenderingContext2D, size: number, ratio: number): void {
  const corner = size * 0.55;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(-size, -size + corner);
  ctx.lineTo(-size, -size);
  ctx.lineTo(-size + corner, -size);
  ctx.moveTo(size - corner, -size);
  ctx.lineTo(size, -size);
  ctx.lineTo(size, -size + corner);
  ctx.moveTo(size, size - corner);
  ctx.lineTo(size, size);
  ctx.lineTo(size - corner, size);
  ctx.moveTo(-size + corner, size);
  ctx.lineTo(-size, size);
  ctx.lineTo(-size, size - corner);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.6, 1.8 * ratio), 0, Math.PI * 2);
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.fill();
}

function drawDetectionTicks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  ratio: number,
  color: string,
): void {
  const tick = Math.min(6 * ratio, Math.max(3 * ratio, Math.min(width, height) * 0.08));
  ctx.save();
  ctx.globalAlpha *= 0.36;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.7, 0.8 * ratio);
  ctx.beginPath();
  ctx.moveTo(x + width / 2 - tick, y);
  ctx.lineTo(x + width / 2 + tick, y);
  ctx.moveTo(x + width / 2 - tick, y + height);
  ctx.lineTo(x + width / 2 + tick, y + height);
  ctx.moveTo(x, y + height / 2 - tick);
  ctx.lineTo(x, y + height / 2 + tick);
  ctx.moveTo(x + width, y + height / 2 - tick);
  ctx.lineTo(x + width, y + height / 2 + tick);
  ctx.stroke();
  ctx.restore();
}

function drawDetectionCorners(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  ratio: number,
  color: string,
  alpha: number,
): void {
  const length = Math.min(Math.max(10 * ratio, width * 0.18), 30 * ratio);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, 3 * ratio);
  ctx.beginPath();
  ctx.moveTo(x, y + length);
  ctx.lineTo(x, y);
  ctx.lineTo(x + length, y);
  ctx.moveTo(x + width - length, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + length);
  ctx.moveTo(x + width, y + height - length);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - length, y + height);
  ctx.moveTo(x + length, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + height - length);
  ctx.stroke();
  ctx.restore();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
