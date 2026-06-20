import {
  displayDetectionLabel,
  loadImageSource,
  runBrowserRfDetr,
  type BrowserRfDetrDetection,
} from "./browserRfDetr";

type LockScreenBridge = {
  onDetection?: (payload: string) => void;
};

type SnapshotHistory = {
  image1?: string;
  image2?: string;
  image1UpdatedAt?: number;
  image2UpdatedAt?: number;
};

const HISTORY_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/snapshotHistory.json";
const REFRESH_MS = 10_000;
const analyzedKeys = new Map<number, string>();
const statusEl = document.querySelector<HTMLElement>("[data-status]");
let busy = false;
let nextSlot = 1;

function bridge(): LockScreenBridge | null {
  return (window as Window & { LockScreenBridge?: LockScreenBridge }).LockScreenBridge || null;
}

function setStatus(message: string): void {
  if (statusEl) statusEl.textContent = message;
}

function detectionPayload(detection: BrowserRfDetrDetection): BrowserRfDetrDetection {
  return {
    ...detection,
    label: displayDetectionLabel(detection.label),
  };
}

function imageKey(value: string, updatedAt: number | undefined): string {
  return `${updatedAt || 0}:${value.length}:${value.slice(-48)}`;
}

async function loadHistory(): Promise<SnapshotHistory> {
  const response = await fetch(`${HISTORY_URL}?ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`RTDB HTTP ${response.status}`);
  return await response.json() as SnapshotHistory;
}

async function analyzeSlot(slot: number, history: SnapshotHistory): Promise<boolean> {
  const imageValue = slot === 2 ? history.image2 : history.image1;
  const updatedAt = slot === 2 ? history.image2UpdatedAt : history.image1UpdatedAt;
  if (!imageValue) return false;
  const key = imageKey(imageValue, updatedAt);
  if (analyzedKeys.get(slot) === key) return false;
  setStatus(`Menganalisis gambar ${slot} dengan RF-DETR...`);
  const image = await loadImageSource(imageValue);
  if (!image) throw new Error(`Gambar ${slot} tidak dapat dibaca`);
  const result = await runBrowserRfDetr(image);
  if (result.status !== "online") throw new Error(result.note || "RF-DETR belum siap");
  analyzedKeys.set(slot, key);
  bridge()?.onDetection?.(JSON.stringify({
    slot,
    frameWidth: result.frameWidth,
    frameHeight: result.frameHeight,
    updatedAt: updatedAt || Date.now(),
    detections: result.detections.slice(0, 24).map(detectionPayload),
  }));
  setStatus(`Gambar ${slot}: ${result.detections.length} object`);
  return true;
}

async function tick(initial = false): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const history = await loadHistory();
    if (initial) {
      await analyzeSlot(1, history);
      await analyzeSlot(2, history);
    } else {
      const slot = nextSlot;
      nextSlot = nextSlot === 1 ? 2 : 1;
      const changed = await analyzeSlot(slot, history);
      if (!changed) await analyzeSlot(nextSlot, history);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "RF-DETR tidak tersedia");
  } finally {
    busy = false;
  }
}

void tick(true);
window.setInterval(() => void tick(), REFRESH_MS);
