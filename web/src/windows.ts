import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./windows.css";

type DeviceStatus = "online" | "offline" | "degraded";
type RouteName = "home" | "map" | "camera" | "updates";
type TrafficColor = "red" | "yellow" | "green";

type DesktopLocationResult = {
  ok?: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  source?: string;
  error?: string;
};

type DesktopBridge = {
  isElectron?: boolean;
  requestWindowsLocation?: () => Promise<DesktopLocationResult>;
  openLocationSettings?: () => Promise<unknown>;
  notify?: (payload: { title: string; body: string; route?: string; silent?: boolean }) => Promise<boolean>;
  checkForUpdates?: (options?: { autoInstall?: boolean }) => Promise<UpdateStatus>;
  getUpdateHistory?: () => Promise<UpdateStatus[]>;
  openExternal?: (url: string) => Promise<unknown>;
  onNavigate?: (callback: (route: string) => void) => () => void;
  onUpdateStatus?: (callback: (status: UpdateStatus) => void) => () => void;
  onUpdateHistory?: (callback: (history: UpdateStatus[]) => void) => () => void;
};

type UserLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  source: "windows-geolocation" | "windows-location";
  updatedAt: number;
};

type DeviceRecord = {
  id: string;
  label: string;
  status: DeviceStatus;
  lastSeen: number;
  lastSeenText?: string;
  position: { lat: number; lng: number };
  roadName?: string;
  note?: string;
  cameraUrl?: string;
  cameraHlsUrl?: string;
  webrtcUrl?: string;
  cameraStatus?: string;
  cameraReady?: boolean;
  vehicleCount: number;
  objectCount: number;
  trafficColor?: TrafficColor;
  trafficDuration?: number;
  vehicleBreakdown?: Record<string, number>;
  detectorStatus?: string;
  detectorNote?: string;
  detectorFps?: number;
  snapshotUrl?: string;
  snapshot1Url?: string;
  snapshot2Url?: string;
};

type UpdateStatus = {
  at?: number;
  status?: string;
  message?: string;
  current?: string;
  latest?: string;
  progress?: number;
  filePath?: string;
};

type SnapshotDevice = Partial<DeviceRecord> & {
  position?: Partial<DeviceRecord["position"]> & { x?: number; y?: number };
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

declare global {
  interface Window {
    itsDesktop?: DesktopBridge;
  }
}

const FIREBASE_DEVICES_URL = "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
const OFFLINE_AFTER_MS = 60_000;
const REFRESH_MS = 5_000;
const APP_VERSION = "1.0.12";
const MAP_CENTER: L.LatLngExpression = [-6.9733, 107.6302];
const desktop = window.itsDesktop;
const app = document.querySelector<HTMLDivElement>("#windows-app")!;

if (!app) throw new Error("Missing #windows-app");

const state = {
  route: "home" as RouteName,
  device: null as DeviceRecord | null,
  userLocation: null as UserLocation | null,
  locationState: "menunggu izin lokasi presisi Windows",
  locationError: "",
  refreshTimer: 0,
  map: null as L.Map | null,
  markers: [] as L.Marker[],
  trafficHistory: [] as Array<{ at: number; red: number; yellow: number; green: number; vehicles: number }>,
  updateStatus: null as UpdateStatus | null,
  updateHistory: [] as UpdateStatus[],
  lastNotified: new Set<string>(),
  aiPanelOpen: false,
  pitch: 0,
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeEpoch(value: unknown): number {
  const n = finiteNumber(value);
  if (!n || n <= 0) return 0;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function formatAge(epoch: number): string {
  if (!epoch) return "belum ada data";
  const seconds = Math.max(0, Math.round((Date.now() - epoch) / 1000));
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.round(hours / 24)} hari lalu`;
}

function coordinateText(location?: { lat: number; lng: number } | null): string {
  if (!location) return "koordinat belum tersedia";
  return `${location.lat.toFixed(7)}, ${location.lng.toFixed(7)}`;
}

function normalizeStatus(rawStatus: unknown, lastSeen: number): DeviceStatus {
  const raw = String(rawStatus || "").toLowerCase();
  if (lastSeen > 0 && Date.now() - lastSeen > OFFLINE_AFTER_MS) return "offline";
  if (raw === "online" || raw === "degraded" || raw === "offline") return raw;
  return lastSeen > 0 ? "online" : "offline";
}

function normalizeDevice(id: string, raw: SnapshotDevice): DeviceRecord | null {
  const lat = finiteNumber(raw.position?.lat ?? raw.position?.y ?? raw.lat ?? raw.latitude);
  const lng = finiteNumber(raw.position?.lng ?? raw.position?.x ?? raw.lng ?? raw.longitude);
  if (lat === null || lng === null) return null;

  const lastSeen = normalizeEpoch(raw.lastSeen);
  const cameraUrl = String(raw.cameraUrl || raw.webrtcUrl || "").trim();
  const cameraHlsUrl = String(raw.cameraHlsUrl || "").trim();
  const cameraStatus = String(raw.cameraStatus || "").trim();
  const cameraReady = Boolean(raw.cameraReady || cameraStatus.toLowerCase() === "online" || cameraUrl || cameraHlsUrl);
  const vehicleCount = finiteNumber(raw.vehicleCount) ?? finiteNumber(raw.vehicleBreakdown?.total) ?? 0;
  const objectCount = finiteNumber(raw.objectCount) ?? vehicleCount;

  return {
    id,
    label: String(raw.label || raw.id || "Raspberry Pi 5 Controller"),
    status: normalizeStatus(raw.status, lastSeen),
    lastSeen,
    lastSeenText: raw.lastSeenText,
    position: { lat: clamp(lat, -90, 90), lng: clamp(lng, -180, 180) },
    roadName: raw.roadName || raw.note,
    note: raw.note,
    cameraUrl,
    cameraHlsUrl,
    webrtcUrl: String(raw.webrtcUrl || "").trim(),
    cameraStatus,
    cameraReady,
    vehicleCount,
    objectCount,
    trafficColor: raw.trafficColor,
    trafficDuration: finiteNumber(raw.trafficDuration) ?? undefined,
    vehicleBreakdown: raw.vehicleBreakdown,
    detectorStatus: raw.detectorStatus,
    detectorNote: raw.detectorNote,
    detectorFps: finiteNumber(raw.detectorFps) ?? undefined,
    snapshotUrl: raw.snapshotUrl,
    snapshot1Url: raw.snapshot1Url,
    snapshot2Url: raw.snapshot2Url,
  };
}

function normalizeDevices(payload: unknown): DeviceRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, SnapshotDevice>;
  return Object.entries(record)
    .map(([id, raw]) => normalizeDevice(id, raw))
    .filter((device): device is DeviceRecord => Boolean(device));
}

function notifyOnce(key: string, title: string, body: string, route: string): void {
  if (state.lastNotified.has(key)) return;
  state.lastNotified.add(key);
  void desktop?.notify?.({ title, body, route });
}

function trackDeviceEvents(previous: DeviceRecord | null, next: DeviceRecord): void {
  if ((!previous || previous.status !== "online") && next.status === "online") {
    notifyOnce(`device-online:${next.id}:${next.lastSeen}`, "Raspberry menyala", "Buka peta untuk melihat marker Raspberry terkini.", "map:raspberry");
  }
  if (next.cameraReady && (!previous || !previous.cameraReady)) {
    notifyOnce(`camera-ready:${next.id}:${next.lastSeen}`, "Video Live Traffic Light siap", "Camera Raspberry sudah siap ditonton.", "camera");
  }
}

function pushTrafficHistory(device: DeviceRecord): void {
  const last = state.trafficHistory.at(-1);
  const vehicles = Math.max(0, device.vehicleCount || 0);
  const red = device.trafficColor === "red" ? device.trafficDuration || 0 : 8;
  const yellow = device.trafficColor === "yellow" ? device.trafficDuration || 0 : 3;
  const green = device.trafficColor === "green" ? device.trafficDuration || 0 : 6;
  if (last && last.vehicles === vehicles && last.red === red && last.yellow === yellow && last.green === green) return;
  state.trafficHistory.push({ at: Date.now(), red, yellow, green, vehicles });
  state.trafficHistory = state.trafficHistory.slice(-36);
}

async function refreshDevices(): Promise<void> {
  try {
    const res = await fetch(FIREBASE_DEVICES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`);
    const devices = normalizeDevices(await res.json());
    const next = devices[0] || null;
    if (next) {
      const previous = state.device;
      state.device = next;
      trackDeviceEvents(previous, next);
      pushTrafficHistory(next);
    }
  } catch (err) {
    console.warn("[ITS Windows] refresh failed", err);
  } finally {
    render();
    updateMapMarkers();
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refreshDevices, REFRESH_MS);
  }
}

function setUserLocation(location: UserLocation): void {
  state.userLocation = location;
  state.locationError = "";
  state.locationState = `lokasi presisi aktif, akurasi ${Math.round(location.accuracy || 0)} m`;
  render();
  updateMapMarkers();
}

async function requestNativeLocation(): Promise<boolean> {
  if (!desktop?.requestWindowsLocation) return false;
  const result = await desktop.requestWindowsLocation();
  const lat = finiteNumber(result.lat);
  const lng = finiteNumber(result.lng);
  if (!result.ok || lat === null || lng === null) {
    state.locationError = result.error || "Windows belum mengirim koordinat";
    return false;
  }
  setUserLocation({
    lat: clamp(lat, -90, 90),
    lng: clamp(lng, -180, 180),
    accuracy: result.accuracy,
    source: "windows-location",
    updatedAt: Date.now(),
  });
  return true;
}

function requestBrowserLocation(): void {
  if (!navigator.geolocation) {
    state.locationError = "Runtime ini tidak menyediakan Geolocation API";
    state.locationState = "lokasi tidak tersedia";
    render();
    return;
  }
  state.locationState = "meminta izin lokasi presisi Windows";
  render();
  navigator.geolocation.getCurrentPosition((pos) => {
    setUserLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: "windows-geolocation",
      updatedAt: Date.now(),
    });
  }, (err) => {
    state.locationError = err.message || "Izin lokasi ditolak Windows";
    state.locationState = "koordinat user belum tersedia";
    render();
    void requestNativeLocation().then((ok) => {
      if (!ok) render();
    });
  }, {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 5_000,
  });

  navigator.geolocation.watchPosition((pos) => {
    setUserLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      source: "windows-geolocation",
      updatedAt: Date.now(),
    });
  }, () => undefined, {
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 5_000,
  });
}

function routeLabel(route: RouteName): string {
  if (route === "map") return "Peta";
  if (route === "camera") return "Camera";
  if (route === "updates") return "Update";
  return "Home";
}

function navigate(route: RouteName, focus?: "user" | "raspberry"): void {
  state.route = route;
  render();
  if (route === "map") {
    window.setTimeout(() => {
      mountMap();
      focusMap(focus || "raspberry");
    }, 40);
  }
}

function parseRoute(raw: string): void {
  if (raw.includes("camera")) navigate("camera");
  else if (raw.includes("update")) navigate("updates");
  else if (raw.includes("user")) navigate("map", "user");
  else if (raw.includes("raspberry") || raw.includes("map")) navigate("map", "raspberry");
  else navigate("home");
}

function snapshotUrl(device: DeviceRecord | null): string {
  return device?.snapshotUrl || device?.snapshot1Url || device?.snapshot2Url || "/itss.png";
}

function renderSidebar(): string {
  const items: Array<[RouteName, string, string]> = [
    ["home", "⌂", "Home"],
    ["map", "⌖", "Peta"],
    ["camera", "▣", "Camera"],
    ["updates", "↻", "Update"],
  ];
  return `
    <aside class="win-sidebar">
      <img class="win-logo" src="/itss.png" alt="ITS">
      ${items.map(([route, icon, label]) => `
        <button class="win-nav ${state.route === route ? "active" : ""}" data-route="${route}" type="button">
          <span>${icon}</span><b>${label}</b>
        </button>
      `).join("")}
      <div class="win-live ${state.device?.status === "online" ? "online" : "offline"}">
        <i></i><span>${state.device?.status === "online" ? "ONLINE" : "OFFLINE"}</span>
      </div>
    </aside>
  `;
}

function renderTopbar(): string {
  const device = state.device;
  return `
    <header class="win-topbar">
      <div>
        <strong>Raspberry Pi 5 Controller</strong>
        <span>${escapeHtml(device?.roadName || device?.note || "menunggu data RTDB")}</span>
      </div>
      <div class="win-status-row">
        <button data-action="locate" type="button">Minta lokasi</button>
        <button data-action="check-update" type="button">Cek update</button>
        <span class="win-pill ${device?.status || "offline"}">Raspberry ${device?.status || "offline"}</span>
        <span class="win-pill">${escapeHtml(routeLabel(state.route))}</span>
      </div>
    </header>
  `;
}

function renderLocationCard(): string {
  return `
    <section class="win-card win-location-card">
      <div>
        <strong>Lokasi user realtime</strong>
        <span>${escapeHtml(state.locationState)}</span>
      </div>
      <code>${escapeHtml(coordinateText(state.userLocation))}</code>
      ${state.userLocation ? `<small>Akurasi ${Math.round(state.userLocation.accuracy || 0)} m - ${escapeHtml(state.userLocation.source)} - ${formatAge(state.userLocation.updatedAt)}</small>` : ""}
      ${state.locationError ? `<small class="danger">${escapeHtml(state.locationError)}</small>` : ""}
      <button data-action="location-settings" type="button">Buka Windows Location Settings</button>
    </section>
  `;
}

function renderChart(): string {
  const width = 620;
  const height = 220;
  const points = state.trafficHistory.length ? state.trafficHistory : [
    { at: Date.now(), red: 8, yellow: 3, green: 6, vehicles: 0 },
  ];
  const maxVehicles = Math.max(20, ...points.map((p) => p.vehicles));
  const maxDuration = Math.max(12, ...points.flatMap((p) => [p.red, p.yellow, p.green]));
  const line = (key: "red" | "yellow" | "green") => points.map((p) => {
    const x = 42 + (p.vehicles / maxVehicles) * (width - 82);
    const y = height - 34 - (p[key] / maxDuration) * (height - 70);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `
    <section class="win-card">
      <div class="win-card-head">
        <div><strong>Grafik lalu lintas</strong><span>Jumlah kendaraan x waktu lampu</span></div>
        <div class="legend"><i class="red"></i>Merah <i class="yellow"></i>Kuning <i class="green"></i>Hijau</div>
      </div>
      <svg class="traffic-chart" viewBox="0 0 ${width} ${height}" role="img">
        <line x1="42" y1="${height - 34}" x2="${width - 20}" y2="${height - 34}"></line>
        <line x1="42" y1="22" x2="42" y2="${height - 34}"></line>
        <polyline class="old red" points="${line("red")}"></polyline>
        <polyline class="old yellow" points="${line("yellow")}"></polyline>
        <polyline class="old green" points="${line("green")}"></polyline>
        ${points.slice(-1).map((p) => `
          <circle class="fresh red" cx="${42 + (p.vehicles / maxVehicles) * (width - 82)}" cy="${height - 34 - (p.red / maxDuration) * (height - 70)}" r="5"></circle>
          <circle class="fresh yellow" cx="${42 + (p.vehicles / maxVehicles) * (width - 82)}" cy="${height - 34 - (p.yellow / maxDuration) * (height - 70)}" r="5"></circle>
          <circle class="fresh green" cx="${42 + (p.vehicles / maxVehicles) * (width - 82)}" cy="${height - 34 - (p.green / maxDuration) * (height - 70)}" r="5"></circle>
        `).join("")}
        <text x="${width / 2}" y="${height - 5}">Jumlah kendaraan</text>
        <text x="-135" y="14" transform="rotate(-90)">Waktu lampu (detik)</text>
      </svg>
    </section>
  `;
}

function renderHome(): string {
  const device = state.device;
  return `
    <main class="win-content home-grid">
      <section class="win-hero-shot" style="--shot:url('${escapeHtml(snapshotUrl(device))}')">
        <img src="${escapeHtml(snapshotUrl(device))}" alt="Snapshot Raspberry">
        <div class="shot-badge">Snapshot Raspberry</div>
        <div class="shot-copy">
          <strong>${escapeHtml(device?.roadName || device?.note || "Menunggu data Raspberry")}</strong>
          <span>${escapeHtml(device ? `${formatAge(device.lastSeen)} - ${device.vehicleCount} kendaraan` : "offline")}</span>
        </div>
      </section>
      ${renderChart()}
      <button class="win-map-mini user" data-route="map" data-focus="user" type="button">
        <strong>Peta user realtime</strong><span>${escapeHtml(coordinateText(state.userLocation))}</span>
      </button>
      <button class="win-map-mini raspberry" data-route="map" data-focus="raspberry" type="button">
        <strong>Peta Raspberry</strong><span>${escapeHtml(coordinateText(device?.position || null))}</span>
      </button>
      ${renderLocationCard()}
    </main>
  `;
}

function renderMapPanel(): string {
  const device = state.device;
  return `
    <main class="win-content map-view">
      <div id="win-map" data-pitch="${state.pitch}"></div>
      <div class="map-tools">
        <button data-action="focus-user" type="button">User</button>
        <button data-action="focus-raspberry" type="button">Raspberry</button>
        <button data-pitch="0" type="button">2D</button>
        <button data-pitch="60" type="button">60</button>
        <button data-pitch="75" type="button">75</button>
        <button data-pitch="90" type="button">90</button>
      </div>
      <aside class="map-info">
        <button data-action="close-info" type="button">×</button>
        <h2>Koordinat</h2>
        <p><b>User</b><br>${escapeHtml(coordinateText(state.userLocation))}</p>
        <p><b>Raspberry</b><br>${escapeHtml(coordinateText(device?.position || null))}</p>
        <p><b>Status</b><br>${escapeHtml(device?.status || "offline")} - ${escapeHtml(formatAge(device?.lastSeen || 0))}</p>
      </aside>
    </main>
  `;
}

function cameraSource(device: DeviceRecord | null): string {
  if (!device) return "";
  return device.cameraUrl || device.webrtcUrl || device.cameraHlsUrl || "";
}

function renderCamera(): string {
  const device = state.device;
  const source = cameraSource(device);
  const online = device?.status === "online" && Boolean(source);
  const stats = device?.vehicleBreakdown || {};
  return `
    <main class="win-content camera-view">
      <section class="camera-stage ${state.aiPanelOpen ? "ai-open" : ""}" style="--ambient:url('${escapeHtml(snapshotUrl(device))}')">
        <div class="camera-ambient"></div>
        <div class="camera-frame">
          ${online ? `<iframe src="${escapeHtml(source)}" title="Kamera Raspberry" allow="autoplay; fullscreen; camera; microphone"></iframe>` : `<div class="camera-offline">Video Raspberry offline<br><span>${escapeHtml(device ? formatAge(device.lastSeen) : "belum ada data")}</span></div>`}
          <div class="camera-live ${online ? "on" : "off"}">${online ? "LIVE" : "OFFLINE"}</div>
          <div class="camera-controls">
            <button data-action="play" type="button">▶</button>
            <div>
              <button data-action="ai" type="button">AI</button>
              <button data-action="fullscreen" type="button">⛶</button>
            </div>
          </div>
        </div>
        <aside class="ai-panel">
          <button data-action="ai" type="button">×</button>
          <h2>AI YOLO by-device</h2>
          <p>${escapeHtml(device?.detectorStatus || "menunggu frame video")}</p>
          <div class="ai-grid">
            ${["total", "car", "motorcycle", "bus", "truck", "bicycle"].map((key) => `
              <div><span>${key}</span><strong>${Number(stats[key] || (key === "total" ? device?.vehicleCount : 0))}</strong></div>
            `).join("")}
          </div>
        </aside>
      </section>
    </main>
  `;
}

function renderUpdates(): string {
  const status = state.updateStatus;
  return `
    <main class="win-content update-view">
      <section class="win-card update-card">
        <h1>${status?.status === "up-to-date" ? "You are up to date" : "ITS Maps Windows Update"}</h1>
        <p>${escapeHtml(status?.message || `Versi saat ini ${APP_VERSION}`)}</p>
        ${typeof status?.progress === "number" ? `<div class="progress"><i style="width:${status.progress}%"></i></div>` : ""}
        <div class="update-actions">
          <button data-action="check-update" type="button">Cek pembaruan</button>
          <button data-action="auto-update" type="button">Download dan install otomatis</button>
        </div>
      </section>
      <section class="win-card">
        <h2>Histori pembaruan</h2>
        <div class="update-history">
          ${state.updateHistory.length ? state.updateHistory.map((item) => `
            <article>
              <strong>${escapeHtml(item.status || "status")}</strong>
              <span>${escapeHtml(item.message || "")}</span>
              <small>${item.at ? new Date(item.at).toLocaleString("id-ID") : ""}</small>
            </article>
          `).join("") : `<p>Belum ada histori update.</p>`}
        </div>
      </section>
    </main>
  `;
}

function render(): void {
  app.innerHTML = `
    <div class="win-shell">
      ${renderSidebar()}
      <section class="win-main">
        ${renderTopbar()}
        ${state.route === "home" ? renderHome() : ""}
        ${state.route === "map" ? renderMapPanel() : ""}
        ${state.route === "camera" ? renderCamera() : ""}
        ${state.route === "updates" ? renderUpdates() : ""}
      </section>
    </div>
  `;
  bindEvents();
  if (state.route === "map") window.setTimeout(mountMap, 20);
}

function bindEvents(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.route as RouteName;
      navigate(route, button.dataset.focus as "user" | "raspberry" | undefined);
    });
  });
  app.querySelector<HTMLButtonElement>('[data-action="locate"]')?.addEventListener("click", () => {
    void requestNativeLocation();
    requestBrowserLocation();
  });
  app.querySelector<HTMLButtonElement>('[data-action="location-settings"]')?.addEventListener("click", () => {
    void desktop?.openLocationSettings?.();
  });
  app.querySelectorAll<HTMLButtonElement>("[data-pitch]").forEach((button) => {
    button.addEventListener("click", () => {
      state.pitch = Number(button.dataset.pitch) || 0;
      const mapEl = document.querySelector<HTMLElement>("#win-map");
      if (mapEl) mapEl.dataset.pitch = String(state.pitch);
    });
  });
  app.querySelector<HTMLButtonElement>('[data-action="focus-user"]')?.addEventListener("click", () => focusMap("user"));
  app.querySelector<HTMLButtonElement>('[data-action="focus-raspberry"]')?.addEventListener("click", () => focusMap("raspberry"));
  app.querySelectorAll<HTMLButtonElement>('[data-action="check-update"]').forEach((button) => {
    button.addEventListener("click", () => void desktop?.checkForUpdates?.({ autoInstall: false }));
  });
  app.querySelector<HTMLButtonElement>('[data-action="auto-update"]')?.addEventListener("click", () => {
    void desktop?.checkForUpdates?.({ autoInstall: true });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-action="ai"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.aiPanelOpen = !state.aiPanelOpen;
      render();
    });
  });
  app.querySelector<HTMLButtonElement>('[data-action="fullscreen"]')?.addEventListener("click", () => {
    const frame = document.querySelector<HTMLElement>(".camera-frame");
    void frame?.requestFullscreen?.();
  });
}

function trafficLightIcon(color: TrafficColor = "yellow"): L.DivIcon {
  return L.divIcon({
    className: "raspberry-marker",
    iconSize: [34, 48],
    iconAnchor: [17, 44],
    html: `<span class="${color}"></span>`,
  });
}

function userIcon(): L.DivIcon {
  return L.divIcon({
    className: "user-marker",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: "<span></span>",
  });
}

function mountMap(): void {
  const mapEl = document.querySelector<HTMLDivElement>("#win-map");
  if (!mapEl) return;
  if (state.map) {
    state.map.remove();
    state.map = null;
  }
  state.map = L.map(mapEl, { zoomControl: false }).setView(MAP_CENTER, 16);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap",
  }).addTo(state.map);
  updateMapMarkers();
}

function updateMapMarkers(): void {
  if (!state.map) return;
  state.markers.forEach((marker) => marker.remove());
  state.markers = [];
  const bounds: L.LatLngExpression[] = [];
  if (state.device) {
    const marker = L.marker([state.device.position.lat, state.device.position.lng], {
      icon: trafficLightIcon(state.device.trafficColor),
      title: "Marker Raspberry",
    }).addTo(state.map).bindPopup(`
      <strong>Raspberry Pi 5 Controller</strong><br>
      ${escapeHtml(coordinateText(state.device.position))}<br>
      ${escapeHtml(state.device.status)} - ${escapeHtml(formatAge(state.device.lastSeen))}
    `);
    state.markers.push(marker);
    bounds.push([state.device.position.lat, state.device.position.lng]);
  }
  if (state.userLocation) {
    const marker = L.marker([state.userLocation.lat, state.userLocation.lng], {
      icon: userIcon(),
      title: "Marker lokasi user terkini",
    }).addTo(state.map).bindPopup(`
      <strong>Lokasi user terkini</strong><br>
      ${escapeHtml(coordinateText(state.userLocation))}<br>
      Akurasi ${Math.round(state.userLocation.accuracy || 0)} m
    `);
    state.markers.push(marker);
    bounds.push([state.userLocation.lat, state.userLocation.lng]);
  }
  if (bounds.length > 1) state.map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [80, 80], maxZoom: 17 });
  else if (bounds.length === 1) state.map.setView(bounds[0], 17);
}

function focusMap(target: "user" | "raspberry"): void {
  if (!state.map) return;
  if (target === "user" && state.userLocation) {
    state.map.setView([state.userLocation.lat, state.userLocation.lng], 18, { animate: true });
  } else if (target === "raspberry" && state.device) {
    state.map.setView([state.device.position.lat, state.device.position.lng], 18, { animate: true });
  }
}

function initDesktopBridge(): void {
  desktop?.onNavigate?.(parseRoute);
  desktop?.onUpdateStatus?.((status) => {
    state.updateStatus = status;
    render();
  });
  desktop?.onUpdateHistory?.((history) => {
    state.updateHistory = history;
    render();
  });
  void desktop?.getUpdateHistory?.().then((history) => {
    state.updateHistory = history || [];
    render();
  });
}

function boot(): void {
  render();
  initDesktopBridge();
  requestBrowserLocation();
  void requestNativeLocation();
  void refreshDevices();
}

boot();
