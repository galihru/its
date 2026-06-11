import L from "leaflet";
import "leaflet/dist/leaflet.css";
import FALLBACK_IMAGE_URL from "../public/bwits.png?url";
import MAP_ICON_URL from "../public/petaits.png?url";
import APP_ICON_URL from "./icon/its.png";
import "./windows.css";

type DeviceStatus = "online" | "offline" | "degraded";
type CameraMode = "webrtc" | "mjpeg";
type TrafficColor = "red" | "yellow" | "green";

type VehicleBreakdown = {
  car: number;
  motorcycle: number;
  bus: number;
  truck: number;
  bicycle: number;
  total: number;
};

type YoloDetection = {
  label: string;
  confidence: number;
  vehicle?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

type TrafficCameraDataset = {
  snapshot1Url?: string;
  snapshot2Url?: string;
  updatedAt?: number;
  source?: string;
  path?: string;
};

type DeviceRecord = {
  id: string;
  label: string;
  status: DeviceStatus;
  lastSeen: number;
  lastSeenText?: string;
  note?: string;
  cameraUrl?: string;
  cameraHlsUrl?: string;
  cameraThumbnailUrl?: string;
  cameraStatus?: string;
  cameraUpdatedAt?: number;
  cameraDataset?: TrafficCameraDataset;
  cameraMode?: CameraMode;
  webrtcEnabled?: boolean;
  webrtcPath?: string;
  webrtcUrl?: string;
  cameraReady?: boolean;
  roadName?: string;
  roadHint?: string;
  trafficColor?: TrafficColor;
  trafficDuration?: number;
  trafficStartedAt?: number;
  vehicleCount?: number;
  vehicleBreakdown?: VehicleBreakdown;
  detectorStatus?: string;
  detectorNote?: string;
  detectorUpdatedAt?: number;
  detectorFps?: number;
  detectorFrameWidth?: number;
  detectorFrameHeight?: number;
  detectorCameraSource?: string;
  objectCount?: number;
  detections?: YoloDetection[];
  trafficLevel?: "lancar" | "sedang" | "padat";
  trafficSource?: string;
  position: { lat: number; lng: number };
};

type SnapshotDevice = Partial<Omit<DeviceRecord, "position" | "lastSeen">> & {
  id?: string;
  lastSeen?: number | string;
  position?: Partial<DeviceRecord["position"]> & { x?: number; y?: number };
};

type Snapshot = {
  updatedAt?: number;
  source?: string;
  devices?: SnapshotDevice[] | Record<string, SnapshotDevice>;
};

type AppConfig = {
  snapshotUrl?: string;
  refreshMs?: number;
};

type UserLocation = {
  lat: number;
  lng: number;
  accuracy?: number;
  updatedAt: number;
  source?: string;
};

type NativeLocationResult = {
  ok?: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  source?: string;
  error?: string;
};

type UpdateStatus = {
  status?: string;
  message?: string;
  current?: string;
  latest?: string;
  progress?: number;
  filePath?: string;
  at?: string;
};

type ItsDesktopBridge = {
  isElectron?: boolean;
  platform?: string;
  requestWindowsLocation?: () => Promise<NativeLocationResult>;
  openLocationSettings?: () => Promise<boolean>;
  checkForUpdates?: (options?: { autoInstall?: boolean }) => Promise<UpdateStatus>;
  getUpdateHistory?: () => Promise<UpdateStatus[]>;
  minimizeWindow?: () => Promise<void>;
  toggleMaximizeWindow?: () => Promise<boolean>;
  closeWindow?: () => Promise<void>;
  rendererReady?: (message?: string) => void;
  onOpenPanel?: (callback: (panel: AppPanel) => void) => () => void;
  onUpdateStatus?: (callback: (status: UpdateStatus) => void) => () => void;
  onUpdateHistory?: (callback: (history: UpdateStatus[]) => void) => () => void;
};

type DesktopClientRecord = {
  id?: string;
  label?: string;
  status?: DeviceStatus;
  updatedAt?: number;
  position?: { lat?: number; lng?: number };
};

type TrafficHistoryPoint = {
  at: number;
  deviceId: string;
  vehicleCount: number;
  red: number;
  yellow: number;
  green: number;
  activeColor: TrafficColor;
};

type PoiRecord = {
  id: string;
  title: string;
  kind: string;
  address: string;
  description: string;
  lat: number;
  lng: number;
  source: string;
};

type AppTab = "home" | "map" | "camera";
type MapFocus = "user" | "raspi";
type AppPanel = "settings" | "statistics" | "licenses" | "history" | "document" | "new";
type ThemeMode = "system" | "dark" | "light";
type AccentTheme = "classic" | "bloom" | "agave" | "rose";

const DEFAULT_CONFIG: Required<AppConfig> = {
  snapshotUrl: "./data/its-state.json",
  refreshMs: 5000,
};
const FIREBASE_DEVICES_URL =
  "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
const FIREBASE_ROOT_URL = FIREBASE_DEVICES_URL.replace(/\/devices\.json$/, "");
const FIREBASE_TRAFFIC_DATASET_ROOT = `${FIREBASE_ROOT_URL}/trafficObjectDetectionDataset/devices`;
const FIREBASE_BROWSER_YOLO_ROOT = `${FIREBASE_ROOT_URL}/browserYolo/devices`;
const OFFLINE_AFTER_MS = 60_000;
const HLS_JS_URL = "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js";
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const DEFAULT_CENTER: [number, number] = [-6.180487, 106.90368];
const DEFAULT_ZOOM = 16;
const HISTORY_STORAGE_KEY = "its-windows-traffic-history:v1";
const CLIENT_ID_STORAGE_KEY = "its-windows-client-id:v1";
const LAST_LOCATION_STORAGE_KEY = "its-windows-user-location:v1";
const LAST_DEVICE_POSITIONS_STORAGE_KEY = "its-windows-device-positions:v1";
const CUSTOM_ACCENT_STORAGE_KEY = "its-windows-custom-accent:v1";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const VEHICLE_LABELS = new Set(["bicycle", "car", "motorcycle", "bus", "truck"]);
const ACCENT_COLORS: Record<AccentTheme, string> = {
  classic: "#0078d4",
  bloom: "#2458d6",
  agave: "#11777b",
  rose: "#b11945",
};

const app = document.querySelector<HTMLDivElement>("#windows-app");
if (!app) throw new Error("Missing #windows-app element.");
const appRoot = app;
const desktopBridge = (window as Window & { itsDesktop?: ItsDesktopBridge }).itsDesktop;

const state = {
  config: DEFAULT_CONFIG,
  devices: [] as DeviceRecord[],
  device: null as DeviceRecord | null,
  desktopClients: [] as DesktopClientRecord[],
  activeTab: "home" as AppTab,
  activePanel: null as AppPanel | null,
  themeMode: (localStorage.getItem("its-windows-theme-mode:v1") as ThemeMode | null) || "system",
  accentTheme: (localStorage.getItem("its-windows-accent:v1") as AccentTheme | null) || "classic",
  customAccent: localStorage.getItem(CUSTOM_ACCENT_STORAGE_KEY) || "",
  mapFocus: "raspi" as MapFocus,
  mapPitch: 0,
  userLocation: loadLastUserLocation(),
  knownDevicePositions: loadKnownDevicePositions(),
  geolocationState: "menunggu izin lokasi" as string,
  locationPromptOpen: false,
  clientId: clientId(),
  history: loadTrafficHistory(),
  lastHistoryKey: "",
  galleryIndex: 0,
  syncStatus: "warn" as "live" | "warn",
  syncText: "menunggu",
  updateStatus: { status: "idle", message: "Auto-update aktif" } as UpdateStatus,
  updateHistory: [] as UpdateStatus[],
  refreshTimer: 0,
  carouselTimer: 0,
  geolocationWatch: 0,
  userPublishAt: 0,
  hlsInstance: null as any,
  hlsScriptPromise: null as Promise<void> | null,
  cameraKey: "",
  ambientTimer: 0,
  cameraReadyTimer: 0,
  appDataReady: false,
  snapshotCache: new Map<string, TrafficCameraDataset>(),
  maps: {
    homeUser: null as L.Map | null,
    homeRaspi: null as L.Map | null,
    full: null as L.Map | null,
  },
  markers: {
    homeUser: null as L.Marker | null,
    homeRaspi: null as L.Marker | null,
    fullUser: null as L.Marker | null,
    fullRaspi: null as L.Marker | null,
  },
  poiLayer: null as L.LayerGroup | null,
  poiMarkers: new Map<string, L.Marker>(),
  pois: [] as PoiRecord[],
  poiFetchKey: "",
  poiFetchTimer: 0,
};

boot();

function boot(): void {
  appRoot.innerHTML = shellHtml();
  applyAppearance();
  bindNavigation();
  initMaps();
  bindStaticActions();
  bindUpdateBridge();
  showLocationPromptIfNeeded();
  startUserLocation();
  startCarousel();
  renderAll();
  void refreshData();
  window.addEventListener("resize", () => {
    invalidateMaps();
    drawTrafficChart();
  });
  document.addEventListener("fullscreenchange", syncFullscreenButtons);
}

function bindUpdateBridge(): void {
  desktopBridge?.onOpenPanel?.((panel) => {
    if (["settings", "statistics", "licenses", "history", "document", "new"].includes(panel)) {
      openPanel(panel);
    }
  });
  desktopBridge?.onUpdateStatus?.((status) => {
    state.updateStatus = status || state.updateStatus;
    if (state.activePanel === "settings") {
      openPanel("settings");
    }
  });
  desktopBridge?.onUpdateHistory?.((history) => {
    state.updateHistory = Array.isArray(history) ? history : [];
  });
  void desktopBridge?.getUpdateHistory?.().then((history) => {
    state.updateHistory = Array.isArray(history) ? history : [];
  }).catch(() => {
    state.updateHistory = [];
  });
}

function shellHtml(): string {
  return `
    <div class="win-shell">
      <header class="win-windowbar">
        <div class="win-window-drag">
          <img src="${APP_ICON_URL}" alt="" aria-hidden="true">
          <span>ITS Maps Windows</span>
        </div>
        <div class="win-window-actions">
          <button class="win-window-tool has-tooltip" type="button" data-open-panel="document" data-tip="Buka dokumentasi">${bookIcon()}</button>
          <button class="win-window-tool has-tooltip" type="button" data-open-panel="new" data-tip="Lihat pembaruan">${sparkleIcon()}</button>
          <button class="win-window-tool has-tooltip" type="button" data-window-minimize data-tip="Minimize">${minimizeIcon()}</button>
          <button class="win-window-tool has-tooltip" type="button" data-window-maximize data-tip="Maximize">${maximizeIcon()}</button>
          <button class="win-window-tool win-window-close has-tooltip" type="button" data-window-close data-tip="Close">${closeIcon()}</button>
        </div>
      </header>
      <div class="win-shell-body">
      <div class="win-app-splash" data-app-splash>
        <div class="win-app-splash-card">
          <img src="${APP_ICON_URL}" alt="ITS Maps">
          <strong>ITS Maps Windows</strong>
          <span data-app-splash-text>Mengambil data Raspberry dan peta...</span>
          <i></i>
        </div>
      </div>
      <aside class="win-sidebar">
        <div class="win-brand">
          <img src="${APP_ICON_URL}" alt="ITS">
          <span>ITS</span>
        </div>
        <nav class="win-nav" aria-label="Menu utama">
          ${navButton("home", "Home", homeIcon())}
          ${navButton("map", "Peta", `<img class="win-nav-map-icon" src="${MAP_ICON_URL}" alt="">`)}
          ${navButton("camera", "Camera", cameraIcon())}
        </nav>
        <div class="win-sync-pill" data-sync-pill data-sync="warn">
          <span class="win-sync-dot"></span>
          <span data-sync-word>SYNC</span>
        </div>
      </aside>

      <main class="win-main">
        <header class="win-titlebar">
          <div class="win-title-main">
            <strong data-title-device>ITS Maps Windows</strong>
            <span data-title-meta>Raspberry Pi live traffic</span>
          </div>
          <div class="win-title-actions">
            <div class="win-title-status">
              <span class="win-chip">Raspberry <b data-raspi-state>-</b></span>
              <span class="win-chip">Windows <b data-windows-state>-</b></span>
              <button class="win-chip win-chip-button has-tooltip" type="button" data-open-panel="history" data-tip="Histori lalu lintas">History <b data-history-count>0</b></button>
            </div>
            <div class="win-title-tools">
              <button class="win-action-button has-tooltip" type="button" data-request-location data-tip="Minta lokasi Windows">${targetIcon()}</button>
              <button class="win-action-button has-tooltip" type="button" data-open-panel="statistics" data-tip="Statistik realtime">${chartIcon()}</button>
              <button class="win-action-button has-tooltip" type="button" data-open-panel="settings" data-tip="Pengaturan">${settingsIcon()}</button>
            </div>
          </div>
        </header>

        <section class="win-content">
          <section class="win-view win-home-view active" data-view="home">
            <div class="win-home-grid">
              <article class="win-widget win-gallery" data-gallery style="--gallery-image:url('${FALLBACK_IMAGE_URL}')"></article>
              <article class="win-widget win-chart-widget">
                <div class="win-chart-header">
                  <div>
                    <h2>Grafik lalu lintas</h2>
                    <span>Jumlah kendaraan x waktu lampu</span>
                  </div>
                  <div class="win-chart-legend">
                    <span data-color="red"><i></i>Merah</span>
                    <span data-color="yellow"><i></i>Kuning</span>
                    <span data-color="green"><i></i>Hijau</span>
                  </div>
                </div>
                <div class="win-chart-wrap">
                  <canvas id="win-traffic-chart"></canvas>
                </div>
              </article>
              <div class="win-mini-map-grid">
                <article class="win-widget win-mini-map-widget" data-clickable="true" data-open-map="user">
                  <div class="win-map-card-header">
                    <strong><i class="win-map-dot user"></i> Peta user realtime</strong>
                    <span data-user-location-text>mencari lokasi</span>
                  </div>
                  <div id="win-home-user-map" class="win-map-surface"></div>
                </article>
                <article class="win-widget win-mini-map-widget" data-clickable="true" data-open-map="raspi">
                  <div class="win-map-card-header">
                    <strong><i class="win-map-dot raspi"></i> Peta Raspberry</strong>
                    <span data-raspi-location-text>menunggu data</span>
                  </div>
                  <div id="win-home-raspi-map" class="win-map-surface"></div>
                </article>
              </div>
            </div>
          </section>

          <section class="win-view win-map-view" data-view="map">
            <div id="win-full-map" class="win-full-map"></div>
            <div class="win-map-topbar">
              <div class="win-segment">
                <button class="win-segment-button" type="button" data-map-focus="user">${userIcon()}User</button>
                <button class="win-segment-button active" type="button" data-map-focus="raspi">${raspiSmallIcon()}Raspberry</button>
              </div>
              <div class="win-map-status" data-map-status>Menunggu lokasi</div>
            </div>
            <div class="win-map-controls" aria-label="Kontrol peta">
              <button class="has-tooltip" type="button" data-map-locate data-tip="Lokasi terkini">${targetIcon()}</button>
              <button class="has-tooltip active" type="button" data-map-pitch="0" data-tip="Mode peta 2D">2D</button>
              <button class="has-tooltip" type="button" data-map-pitch="60" data-tip="Mode peta 3D">3D</button>
              <button class="has-tooltip" type="button" data-map-zoom="in" data-tip="Zoom in">+</button>
              <button class="has-tooltip" type="button" data-map-zoom="out" data-tip="Zoom out">-</button>
              <button type="button" class="win-compass has-tooltip" data-map-compass data-tip="Reset arah utara"><span>N</span><i></i></button>
            </div>
            <div class="win-poi-sheet" data-poi-sheet></div>
          </section>

          <section class="win-view win-camera-view" data-view="camera">
            <div class="win-camera-page">
              <div class="win-camera-header">
                <div>
                  <h2>Kamera Raspberry Pi</h2>
                  <span data-camera-source>menunggu stream</span>
                </div>
                <span data-camera-ai-summary>AI sinkron RTDB</span>
              </div>
              <div class="win-camera-stage-host" data-camera-host></div>
            </div>
          </section>
        </section>
        <div class="win-side-sheet" data-side-sheet></div>
        <div class="win-location-consent" data-location-consent hidden>
          <section class="win-location-card">
            <div class="win-location-icon">${targetIcon()}</div>
            <div>
              <strong>Izinkan akses lokasi terkini</strong>
              <p>ITS Maps Windows membutuhkan latitude dan longitude realtime untuk marker user, peta 3D, dan sinkronisasi ke Firebase RTDB.</p>
            </div>
        <div class="win-location-actions">
              <button type="button" class="win-location-secondary" data-location-settings>Settings lokasi</button>
              <button type="button" class="win-location-secondary" data-location-later>Nanti</button>
              <button type="button" class="win-location-primary" data-location-allow>Izinkan lokasi</button>
            </div>
          </section>
        </div>
      </main>
      </div>
    </div>
  `;
}

function navButton(tab: AppTab, label: string, icon: string): string {
  return `
    <button type="button" class="win-nav-button has-tooltip${tab === "home" ? " active" : ""}" data-tab="${tab}" aria-label="${label}" data-tip="${label}">
      <span class="win-nav-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
}

function bindNavigation(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab as AppTab));
  });
}

function bindStaticActions(): void {
  document.querySelectorAll<HTMLElement>("[data-open-map]").forEach((el) => {
    el.addEventListener("click", () => {
      setTab("map");
      focusFullMap((el.dataset.openMap as MapFocus) || "user");
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-map-focus]").forEach((button) => {
    button.addEventListener("click", () => focusFullMap((button.dataset.mapFocus as MapFocus) || "raspi"));
  });

  document.querySelectorAll<HTMLButtonElement>("[data-open-panel]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.openPanel as AppPanel));
  });

  document.querySelector<HTMLButtonElement>("[data-request-location]")?.addEventListener("click", () => {
    requestUserLocation();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-map-zoom]").forEach((button) => {
    button.addEventListener("click", () => {
      const map = state.maps.full;
      if (!map) return;
      button.dataset.mapZoom === "in" ? map.zoomIn() : map.zoomOut();
    });
  });

  document.querySelector<HTMLButtonElement>("[data-map-locate]")?.addEventListener("click", () => {
    requestUserLocation();
    focusFullMap("user");
  });

  document.querySelectorAll<HTMLButtonElement>("[data-map-pitch]").forEach((button) => {
    button.addEventListener("click", () => setMapPitch(Number(button.dataset.mapPitch || 0)));
  });

  document.querySelector<HTMLButtonElement>("[data-map-compass]")?.addEventListener("click", () => resetMapNorth());

  document.querySelector<HTMLButtonElement>("[data-window-minimize]")?.addEventListener("click", () => {
    void desktopBridge?.minimizeWindow?.();
  });
  document.querySelector<HTMLButtonElement>("[data-window-maximize]")?.addEventListener("click", () => {
    void desktopBridge?.toggleMaximizeWindow?.();
  });
  document.querySelector<HTMLButtonElement>("[data-window-close]")?.addEventListener("click", () => {
    void desktopBridge?.closeWindow?.();
  });

  document.querySelector<HTMLButtonElement>("[data-location-allow]")?.addEventListener("click", requestUserLocation);
  document.querySelector<HTMLButtonElement>("[data-location-later]")?.addEventListener("click", hideLocationPrompt);
  document.querySelector<HTMLButtonElement>("[data-location-settings]")?.addEventListener("click", () => {
    void desktopBridge?.openLocationSettings?.();
  });
}

function openPanel(panel: AppPanel): void {
  state.activePanel = panel;
  const host = document.querySelector<HTMLElement>("[data-side-sheet]");
  if (!host) return;
  host.innerHTML = sidePanelHtml(panel);
  host.classList.add("open");
  host.querySelector<HTMLButtonElement>("[data-close-side-panel]")?.addEventListener("click", closePanel);
  host.querySelectorAll<HTMLButtonElement>("[data-theme-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.themeMode as ThemeMode;
      if (!["system", "dark", "light"].includes(mode)) return;
      state.themeMode = mode;
      localStorage.setItem("its-windows-theme-mode:v1", mode);
      applyAppearance();
      openPanel("settings");
    });
  });
  host.querySelectorAll<HTMLButtonElement>("[data-accent-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      const accent = button.dataset.accentTheme as AccentTheme;
      if (!["classic", "bloom", "agave", "rose"].includes(accent)) return;
      state.accentTheme = accent;
      state.customAccent = ACCENT_COLORS[accent];
      localStorage.setItem("its-windows-accent:v1", accent);
      localStorage.setItem(CUSTOM_ACCENT_STORAGE_KEY, state.customAccent);
      applyAppearance();
      openPanel("settings");
    });
  });
  const customAccent = host.querySelector<HTMLInputElement>("[data-custom-accent]");
  customAccent?.addEventListener("input", () => {
    const value = customAccent.value;
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    state.customAccent = value;
    localStorage.setItem(CUSTOM_ACCENT_STORAGE_KEY, value);
    applyAppearance();
  });
  host.querySelector<HTMLButtonElement>("[data-check-update]")?.addEventListener("click", async () => {
    state.updateStatus = { status: "checking", message: "Memeriksa pembaruan..." };
    openPanel("settings");
    const result = await desktopBridge?.checkForUpdates?.({ autoInstall: false });
    state.updateStatus = result || state.updateStatus;
    openPanel("settings");
  });
  host.querySelector<HTMLButtonElement>("[data-auto-install-update]")?.addEventListener("click", async () => {
    state.updateStatus = { status: "checking", message: "Memeriksa dan menyiapkan auto-update..." };
    openPanel("settings");
    const result = await desktopBridge?.checkForUpdates?.({ autoInstall: true });
    state.updateStatus = result || state.updateStatus;
    openPanel("settings");
  });
  host.querySelector<HTMLButtonElement>("[data-request-location]")?.addEventListener("click", requestUserLocation);
  host.querySelectorAll<HTMLButtonElement>("[data-open-panel]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.openPanel as AppPanel));
  });
  const panelEl = host.querySelector<HTMLElement>("[data-side-panel]");
  if (panelEl) setupSwipeClose(panelEl, closePanel, "right");
}

function closePanel(): void {
  const host = document.querySelector<HTMLElement>("[data-side-sheet]");
  if (!host) return;
  state.activePanel = null;
  host.classList.remove("open");
  window.setTimeout(() => {
    if (!host.classList.contains("open")) host.innerHTML = "";
  }, 280);
}

function sidePanelHtml(panel: AppPanel): string {
  const title = panel === "settings" ? "Setting"
    : panel === "statistics" ? "Statistics"
      : panel === "licenses" ? "Licence"
        : panel === "document" ? "Documentation"
          : panel === "new" ? "What's New"
            : "History";
  return `
    <section class="win-side-panel" data-side-panel>
      <header class="win-side-head">
        <div>
          <span>ITS Maps Windows</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        <button class="win-icon-button" type="button" data-close-side-panel aria-label="Tutup">${closeIcon()}</button>
      </header>
      <div class="win-side-body">
        ${panel === "settings" ? settingsPanelHtml()
          : panel === "statistics" ? statisticsPanelHtml()
            : panel === "licenses" ? licensePanelHtml()
              : panel === "document" ? documentPanelHtml()
                : panel === "new" ? whatsNewPanelHtml()
                  : historyPanelHtml()}
      </div>
    </section>
  `;
}

function settingsPanelHtml(): string {
  const currentAccent = validColor(state.customAccent) || ACCENT_COLORS[state.accentTheme] || ACCENT_COLORS.classic;
  const modeButton = (mode: ThemeMode, label: string, description: string) => `
    <button class="win-choice-card${state.themeMode === mode ? " active" : ""}" type="button" data-theme-mode="${mode}">
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(description)}</small>
    </button>`;
  const accentButton = (accent: AccentTheme, label: string) => `
    <button class="win-accent-choice${state.accentTheme === accent ? " active" : ""}" type="button" data-accent-theme="${accent}" data-accent="${accent}">
      <i></i><span>${escapeHtml(label)}</span>
    </button>`;
  return `
    <section class="win-panel-card">
      <h3>Appearance</h3>
      <div class="win-choice-grid">
        ${modeButton("system", "System", "Ikuti mode Windows")}
        ${modeButton("dark", "Dark", "Tema gelap")}
        ${modeButton("light", "Light", "Tema terang")}
      </div>
    </section>
    <section class="win-panel-card">
      <h3>Theme</h3>
      <div class="win-accent-grid">
        ${accentButton("classic", "Windows")}
        ${accentButton("bloom", "Bloom")}
        ${accentButton("agave", "Agave")}
        ${accentButton("rose", "Rose")}
      </div>
      <label class="win-color-picker">
        <span>Custom palette</span>
        <input type="color" value="${escapeHtml(currentAccent)}" data-custom-accent>
      </label>
      <p class="win-panel-note">Warna ini dipakai untuk sidebar aktif, toolbar, glow, tombol peta, dan aksen panel.</p>
    </section>
    <section class="win-panel-card">
      <h3>Operasi</h3>
      <button class="win-wide-action" type="button" data-request-location>${targetIcon()} Minta akses lokasi terkini</button>
      <button class="win-wide-action" type="button" data-open-panel="licenses">${licenseIcon()} Lihat licence pihak ketiga</button>
    </section>
    <section class="win-panel-card">
      <h3>Pembaruan aplikasi</h3>
      <div class="win-info-table">
        ${infoRow("Status", updateStatusLine())}
        ${infoRow("Versi saat ini", state.updateStatus.current || "1.0.13")}
        ${infoRow("Versi terbaru", state.updateStatus.latest || "-")}
        ${infoRow("Progress", typeof state.updateStatus.progress === "number" ? `${state.updateStatus.progress}%` : "-")}
        ${infoRow("Histori terakhir", updateHistoryLine())}
      </div>
      <button class="win-wide-action" type="button" data-check-update>${settingsIcon()} Cek pembaruan</button>
      <p class="win-panel-note">Auto-update tetap berjalan di background. Jika versi baru tersedia, aplikasi mengunduh custom setup, menjalankan installer native secara silent, lalu membuka aplikasi kembali.</p>
    </section>
  `;
}

function documentPanelHtml(): string {
  return `
    <section class="win-panel-card win-doc-card">
      <h3>Jalankan project</h3>
      <p class="win-panel-note">Command ini bisa dijalankan dari folder <strong>web</strong> untuk website, preview build, dan aplikasi Windows.</p>
      ${terminalBlock(["npm ci", "npm run dev", "npm run build", "npm run desktop:open"])}
    </section>
    <section class="win-panel-card win-doc-card">
      <h3>Struktur perubahan</h3>
      <div class="win-doc-list">
        <article><strong>electron/main.cjs</strong><span>Splash native sederhana, kontrol window, klik notifikasi update, dan sinyal data-ready.</span></article>
        <article><strong>src/windows.ts</strong><span>Titlebar custom, panel dokumentasi, panel pembaruan, tooltip, dan splash renderer dinamis.</span></article>
        <article><strong>src/windows.css</strong><span>Visual Windows yang lebih tenang tanpa blur/glow berlebihan, layout penuh, dan tombol lebih ringkas.</span></article>
        <article><strong>src/main.ts</strong><span>Route /documentation, /document, dan /new untuk website, notifikasi publik, serta splash web yang lebih sederhana.</span></article>
      </div>
    </section>
    <section class="win-panel-card win-doc-card">
      <h3>Alur splash</h3>
      <p class="win-panel-note">Splash muncul cepat jika data lokal/Firebase siap cepat, dan bertahan lebih lama saat konfigurasi, snapshot, kamera, atau telemetry masih dimuat. Jika jaringan gagal, aplikasi masuk mode offline dan tetap membuka dashboard.</p>
    </section>
  `;
}

function whatsNewPanelHtml(): string {
  return `
    <section class="win-panel-card win-doc-card">
      <h3>Highlights</h3>
      <div class="win-doc-list">
        <article><strong>Splash baru</strong><span>Logo di tengah, warna mengikuti Windows, tanpa blur dan tanpa kartu dekoratif berlebihan.</span></article>
        <article><strong>Titlebar Windows</strong><span>Ikon buku dokumentasi, ikon pembaruan, tooltip, minimize, maximize, dan close dalam satu area.</span></article>
        <article><strong>UI lebih ringkas</strong><span>Tombol header dan kontrol peta dipadatkan agar layar utama lebih penuh untuk kamera, peta, dan grafik.</span></article>
        <article><strong>Notifikasi publik</strong><span>Service worker sekarang siap menerima push notification dan membuka URL tujuan saat notifikasi ditekan.</span></article>
      </div>
    </section>
    <section class="win-panel-card">
      <h3>Release terminal</h3>
      ${terminalBlock(["npm run build", "npm run desktop:custom-installer"])}
    </section>
    <section class="win-panel-card">
      <h3>Link cepat</h3>
      <button class="win-wide-action" type="button" data-open-panel="document">${bookIcon()} Buka dokumentasi</button>
      <button class="win-wide-action" type="button" data-open-panel="settings">${settingsIcon()} Cek pembaruan</button>
    </section>
  `;
}

function terminalBlock(commands: string[]): string {
  return `
    <pre class="win-terminal" aria-label="Terminal"><code>${commands.map((line) => `$ ${escapeHtml(line)}`).join("\n")}</code></pre>
  `;
}

function updateStatusLine(): string {
  const status = state.updateStatus.status || "idle";
  const message = state.updateStatus.message || "Auto-update aktif";
  return `${status} - ${message}`;
}

function updateHistoryLine(): string {
  const latest = state.updateHistory[state.updateHistory.length - 1];
  if (!latest) return "Belum ada histori update";
  const time = latest.at ? new Date(latest.at).toLocaleString("id-ID") : "-";
  return `${latest.status || "-"} - ${time}`;
}

function statisticsPanelHtml(): string {
  const device = state.device;
  const stats = aiStatsForDevice(device);
  const lastSeen = device ? formatAge(device.lastSeen) : "-";
  return `
    <section class="win-panel-card">
      <h3>Realtime</h3>
      <div class="win-stat-grid">
        ${panelStat("Raspberry", device?.status || "-")}
        ${panelStat("Last seen", lastSeen)}
        ${panelStat("Kendaraan", String(stats.breakdown.total))}
        ${panelStat("Objek AI", String(stats.objectCount))}
      </div>
    </section>
    <section class="win-panel-card">
      <h3>Camera & AI</h3>
      <div class="win-info-table">
        ${infoRow("Stream", cameraStatusText(device))}
        ${infoRow("AI", aiStatusText(device))}
        ${infoRow("Model", "YOLO ONNX offline, dibundle di artifacts/yolo26n.onnx")}
        ${infoRow("Snapshot", device?.cameraDataset?.updatedAt ? formatAge(device.cameraDataset.updatedAt) : "fallback bwits.png saat offline")}
      </div>
    </section>
    <section class="win-panel-card">
      <h3>Peta</h3>
      <div class="win-info-table">
        ${infoRow("User", state.userLocation ? coordinateText(state.userLocation) : state.geolocationState)}
        ${infoRow("Raspberry", device ? coordinateText(device.position) : "menunggu data")}
        ${infoRow("POI", `${state.pois.length} item di viewport aktif`)}
        ${infoRow("Mode", state.mapPitch ? `Sudut ${state.mapPitch} derajat` : "2D")}
      </div>
    </section>
  `;
}

function licensePanelHtml(): string {
  const entries = [
    ["Leaflet", "Peta 2D, marker, gesture, dan overlay", "BSD-2-Clause"],
    ["CARTO / OpenStreetMap", "Basemap dan data jalan/POI", "ODbL dan ketentuan provider"],
    ["Overpass API", "Query POI sekitar viewport", "OpenStreetMap data"],
    ["hls.js", "Fallback live stream HLS kamera Raspberry", "Apache-2.0"],
    ["Mapbox Maki", "Ikon kartografi POI", "CC0 / BSD style distribution"],
    ["Electron", "Runtime desktop Windows", "MIT"],
    ["Firebase RTDB", "Sinkronisasi Raspberry, Windows, dan website", "Google Firebase terms"],
    ["YOLO ONNX", "Model AI offline untuk deteksi video", "Sesuai lisensi model yang dibundle"],
  ];
  return `
    <section class="win-panel-card">
      <h3>Licence pihak ketiga</h3>
      <p class="win-panel-note">Komponen ini dibundle atau dipakai agar aplikasi bisa berjalan sebagai aplikasi Windows, membaca peta, sinkronisasi realtime, dan menjalankan kamera/AI.</p>
      <div class="win-license-list">
        ${entries.map(([name, role, license]) => `
          <article>
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(role)}</span>
            <small>${escapeHtml(license)}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function historyPanelHtml(): string {
  const rows = state.history.slice(-28).reverse();
  return `
    <section class="win-panel-card">
      <h3>History grafik lalu lintas</h3>
      <p class="win-panel-note">Data lama tidak dihapus otomatis. Titik terbaru tetap dibuat lebih terang pada grafik.</p>
      <div class="win-history-list">
        ${rows.length ? rows.map((point) => `
          <article>
            <strong>${new Date(point.at).toLocaleTimeString("id-ID")}</strong>
            <span>${point.vehicleCount} kendaraan</span>
            <small>Merah ${point.red}s - Kuning ${point.yellow}s - Hijau ${point.green}s</small>
          </article>
        `).join("") : `<p class="win-empty">Belum ada histori dari Raspberry.</p>`}
      </div>
    </section>
  `;
}

function panelStat(label: string, value: string): string {
  return `<div class="win-panel-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function infoRow(label: string, value: string): string {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function applyAppearance(): void {
  appRoot.dataset.theme = state.themeMode;
  appRoot.dataset.accent = state.accentTheme;
  const accent = validColor(state.customAccent) || ACCENT_COLORS[state.accentTheme] || ACCENT_COLORS.classic;
  const soft = hexToRgb(accent);
  appRoot.style.setProperty("--accent", accent);
  appRoot.style.setProperty("--blue", accent);
  appRoot.style.setProperty("--accent-soft", `rgba(${soft.r}, ${soft.g}, ${soft.b}, 0.18)`);
  appRoot.style.setProperty("--accent-glow", `rgba(${soft.r}, ${soft.g}, ${soft.b}, 0.34)`);
}

function setTab(tab: AppTab): void {
  state.activeTab = tab;
  document.querySelectorAll<HTMLElement>("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === tab);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  if (tab === "map") {
    window.setTimeout(() => {
      invalidateMaps();
      focusFullMap(state.mapFocus);
      schedulePoiFetch(120);
    }, 60);
  }
  if (tab === "camera") {
    renderCameraView();
  }
}

function initMaps(): void {
  state.maps.homeUser = createMap("win-home-user-map", false);
  state.maps.homeRaspi = createMap("win-home-raspi-map", false);
  state.maps.full = createMap("win-full-map", true);
  state.poiLayer = L.layerGroup().addTo(state.maps.full);
  state.maps.full.on("moveend zoomend", () => schedulePoiFetch(260));
  state.maps.full.on("move zoom", updateCompass);
}

function createMap(id: string, interactive: boolean): L.Map {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing map element: ${id}`);
  const map = L.map(el, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    attributionControl: false,
    dragging: interactive,
    scrollWheelZoom: interactive,
    doubleClickZoom: interactive,
    touchZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
  });
  L.tileLayer(TILE_URL, {
    subdomains: "abcd",
    maxZoom: 20,
  }).addTo(map);
  return map;
}

function invalidateMaps(): void {
  Object.values(state.maps).forEach((map) => map?.invalidateSize());
}

async function refreshData(): Promise<void> {
  try {
    setAppSplashText("Membaca konfigurasi...");
    await refreshConfig();
    setAppSplashText("Mengambil data Raspberry...");
    const devices = await enrichDevices(await fetchDevices());
    setAppSplashText("Menyiapkan peta dan kamera...");
    state.devices = devices;
    state.device = selectActiveDevice(devices);
    state.desktopClients = await fetchDesktopClients().catch(() => []);
    if (state.device) recordTrafficHistory(state.device);
    state.syncStatus = "live";
    state.syncText = "live";
    hideAppSplash("Data realtime siap");
  } catch (err) {
    console.warn("[ITS Windows] sync failed:", err);
    state.syncStatus = "warn";
    state.syncText = "offline";
    hideAppSplash("Mode offline, memakai data terakhir");
  } finally {
    renderAll();
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refreshData, Math.max(3000, state.config.refreshMs));
  }
}

async function refreshConfig(): Promise<void> {
  try {
    const config = await fetchJson<AppConfig>("./data/its-config.json");
    state.config = {
      snapshotUrl: config.snapshotUrl?.trim() || DEFAULT_CONFIG.snapshotUrl,
      refreshMs: config.refreshMs && config.refreshMs > 0 ? config.refreshMs : DEFAULT_CONFIG.refreshMs,
    };
  } catch {
    state.config = DEFAULT_CONFIG;
  }
}

function setAppSplashText(message: string): void {
  const text = document.querySelector<HTMLElement>("[data-app-splash-text]");
  if (text) text.textContent = message;
}

async function fetchDevices(): Promise<DeviceRecord[]> {
  const urls = uniqueStrings([
    state.config.snapshotUrl,
    FIREBASE_DEVICES_URL,
    "./data/its-state.json",
  ]);

  for (const url of urls) {
    try {
      const raw = await fetchJson<unknown>(url);
      const devices = normalizeDevices(snapshotFromUnknown(raw));
      if (devices.length) return devices;
    } catch (err) {
      console.warn(`[ITS Windows] device source failed: ${url}`, err);
    }
  }
  throw new Error("No valid devices found");
}

function hideAppSplash(message = "Data siap"): void {
  if (state.appDataReady) return;
  state.appDataReady = true;
  const splash = document.querySelector<HTMLElement>("[data-app-splash]");
  const text = splash?.querySelector<HTMLElement>("[data-app-splash-text]");
  if (text) text.textContent = message;
  desktopBridge?.rendererReady?.(message);
  window.setTimeout(() => {
    splash?.classList.add("hide");
    window.setTimeout(() => splash?.remove(), 260);
  }, 180);
}

async function enrichDevices(devices: DeviceRecord[]): Promise<DeviceRecord[]> {
  return Promise.all(devices.map(async (device) => {
    const id = encodeURIComponent(device.id);
    const telemetry = await fetchDeviceTelemetry(id).catch(() => ({ traffic: null, yolo: null }));
    return mergeDeviceTelemetry(device, telemetry.traffic, telemetry.yolo);
  }));
}

async function fetchDeviceTelemetry(id: string): Promise<{ traffic: unknown; yolo: unknown }> {
  const trafficFields = [
    "updatedAt", "source", "vehicleCount", "cameraUrl", "detectorStatus",
    "trafficDurationSec", "trafficColor", "detectorFrameHeight", "detectorFrameWidth",
    "vehicleBreakdown", "locationLabel", "position",
  ];
  const yoloFields = [
    "updatedAt", "thumbnailUpdatedAt", "source", "vehicleCount", "cameraUrl", "fps",
    "status", "note", "frameWidth", "frameHeight", "objectCount", "vehicleBreakdown",
  ];
  const [trafficEntries, yoloEntries] = await Promise.all([
    readFirebaseFields(`${FIREBASE_TRAFFIC_DATASET_ROOT}/${id}`, trafficFields),
    readFirebaseFields(`${FIREBASE_BROWSER_YOLO_ROOT}/${id}`, yoloFields),
  ]);
  const traffic = trafficEntries as Record<string, unknown>;
  const yolo = yoloEntries as Record<string, unknown>;
  const trafficUpdatedAt = normalizeEpoch(finiteNumber(traffic.updatedAt) ?? 0);
  const cached = state.snapshotCache.get(id);
  if (trafficUpdatedAt && cached?.updatedAt === trafficUpdatedAt) {
    traffic.snapshot1Url = cached.snapshot1Url;
    traffic.snapshot2Url = cached.snapshot2Url;
  } else if (trafficUpdatedAt) {
    const snapshots = await readFirebaseFields(`${FIREBASE_TRAFFIC_DATASET_ROOT}/${id}`, ["snapshot1Url", "snapshot2Url"])
      .catch(() => ({} as Record<string, unknown>));
    traffic.snapshot1Url = stringValue(snapshots.snapshot1Url);
    traffic.snapshot2Url = stringValue(snapshots.snapshot2Url);
    const dataset = normalizeCameraDataset(traffic);
    if (dataset) state.snapshotCache.set(id, dataset);
  }
  return { traffic, yolo };
}

async function readFirebaseFields(baseUrl: string, fields: string[]): Promise<Record<string, unknown>> {
  const pairs = await Promise.all(fields.map(async (field) => {
    const value = await fetchJson<unknown>(`${baseUrl}/${field}.json`).catch(() => undefined);
    return [field, value] as const;
  }));
  return Object.fromEntries(pairs.filter(([, value]) => value !== undefined));
}

function mergeDeviceTelemetry(device: DeviceRecord, trafficRaw: unknown, yoloRaw: unknown): DeviceRecord {
  const traffic = objectRecord(trafficRaw);
  const yolo = objectRecord(yoloRaw);
  const trafficDataset = normalizeCameraDataset(traffic);
  const yoloDataset = normalizeCameraDataset(objectRecord(yolo.cameraDataset));
  const yoloUpdatedAt = normalizeEpoch(finiteNumber(yolo.updatedAt) ?? finiteNumber(yolo.thumbnailUpdatedAt) ?? 0);
  const trafficUpdatedAt = normalizeEpoch(finiteNumber(traffic.updatedAt) ?? 0);
  const mergedDataset = mergeCameraDataset(device.cameraDataset, trafficDataset, yoloDataset);
  const yoloBreakdown = normalizeVehicleBreakdown(yolo.vehicleBreakdown);
  const trafficBreakdown = normalizeVehicleBreakdown(traffic.vehicleBreakdown);
  const yoloCameraUrl = usablePublicMediaUrl(stringValue(yolo.cameraUrl));
  const trafficCameraUrl = usablePublicMediaUrl(stringValue(traffic.cameraUrl));
  const yoloThumbnail = stringValue(yolo.thumbnailUrl);
  const trafficThumbnail = stringValue(traffic.thumbnailUrl);
  const yoloStatus = stringValue(yolo.status);
  const trafficDetectorStatus = stringValue(traffic.detectorStatus);

  return {
    ...device,
    cameraUrl: device.cameraUrl || yoloCameraUrl || trafficCameraUrl,
    cameraThumbnailUrl: device.cameraThumbnailUrl || yoloThumbnail || trafficThumbnail || mergedDataset?.snapshot1Url || mergedDataset?.snapshot2Url,
    cameraDataset: mergedDataset,
    cameraUpdatedAt: Math.max(device.cameraUpdatedAt || 0, yoloUpdatedAt, trafficUpdatedAt) || device.cameraUpdatedAt,
    detectorStatus: yoloStatus || trafficDetectorStatus || device.detectorStatus,
    detectorNote: stringValue(yolo.note) || stringValue(traffic.detectorNote) || device.detectorNote,
    detectorUpdatedAt: Math.max(device.detectorUpdatedAt || 0, yoloUpdatedAt, trafficUpdatedAt) || device.detectorUpdatedAt,
    detectorFps: finiteNumber(yolo.fps) ?? device.detectorFps,
    detectorFrameWidth: finiteNumber(yolo.frameWidth) ?? finiteNumber(traffic.detectorFrameWidth) ?? device.detectorFrameWidth,
    detectorFrameHeight: finiteNumber(yolo.frameHeight) ?? finiteNumber(traffic.detectorFrameHeight) ?? device.detectorFrameHeight,
    vehicleBreakdown: yoloBreakdown || trafficBreakdown || device.vehicleBreakdown,
    vehicleCount: finiteNumber(yolo.vehicleCount)
      ?? finiteNumber(traffic.vehicleCount)
      ?? device.vehicleCount,
    objectCount: Math.max(
      device.objectCount || 0,
      Math.round(finiteNumber(yolo.objectCount) ?? 0),
      Math.round(finiteNumber(traffic.objectCount) ?? 0),
    ),
    trafficColor: isTrafficColor(traffic.trafficColor) ? traffic.trafficColor : device.trafficColor,
    trafficDuration: finiteNumber(traffic.trafficDurationSec) ?? finiteNumber(traffic.trafficDuration) ?? device.trafficDuration,
    trafficSource: stringValue(traffic.source) || device.trafficSource,
  };
}

function mergeCameraDataset(...datasets: Array<TrafficCameraDataset | undefined>): TrafficCameraDataset | undefined {
  const merged: TrafficCameraDataset = {};
  datasets.forEach((dataset) => {
    if (!dataset) return;
    if (!merged.snapshot1Url && dataset.snapshot1Url) merged.snapshot1Url = dataset.snapshot1Url;
    if (!merged.snapshot2Url && dataset.snapshot2Url && dataset.snapshot2Url !== merged.snapshot1Url) merged.snapshot2Url = dataset.snapshot2Url;
    if (!merged.updatedAt || (dataset.updatedAt || 0) > merged.updatedAt) merged.updatedAt = dataset.updatedAt;
    if (!merged.source && dataset.source) merged.source = dataset.source;
    if (!merged.path && dataset.path) merged.path = dataset.path;
  });
  return merged.snapshot1Url || merged.snapshot2Url || merged.updatedAt ? merged : undefined;
}

async function fetchDesktopClients(): Promise<DesktopClientRecord[]> {
  const data = await fetchJson<Record<string, DesktopClientRecord> | null>(`${firebaseRootUrl()}/desktopClients.json`);
  if (!data || typeof data !== "object") return [];
  return Object.entries(data)
    .map(([id, value]) => ({ ...value, id: value.id || id }))
    .filter((client) => client.position?.lat && client.position?.lng);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error(`Expected JSON from ${url}`);
  return JSON.parse(text) as T;
}

function snapshotFromUnknown(raw: unknown): Snapshot {
  if (!raw || typeof raw !== "object") return {};
  const record = raw as Record<string, unknown>;
  if ("devices" in record) return raw as Snapshot;
  return { devices: raw as Record<string, SnapshotDevice>, source: "firebase" };
}

function normalizeDevices(snapshot: Snapshot): DeviceRecord[] {
  const rawDevices = snapshot.devices;
  if (Array.isArray(rawDevices)) {
    return rawDevices.flatMap((raw) => normalizeDeviceEntry(raw.id || "raspberry-its", raw));
  }
  if (rawDevices && typeof rawDevices === "object") {
    return Object.entries(rawDevices).flatMap(([key, raw]) => normalizeDeviceEntry(key, raw));
  }
  return [];
}

function normalizeDeviceEntry(key: string, raw: SnapshotDevice): DeviceRecord[] {
  const record = raw as Record<string, unknown>;
  if (!record.position && Array.isArray(record.devices)) {
    return (record.devices as SnapshotDevice[])
      .map((device) => normalizeOneDevice({ ...device, id: device.id || key }))
      .filter((device): device is DeviceRecord => Boolean(device));
  }
  const normalized = normalizeOneDevice({ ...raw, id: raw.id || key });
  return normalized ? [normalized] : [];
}

function normalizeOneDevice(raw: SnapshotDevice): DeviceRecord | null {
  const record = raw as Record<string, unknown>;
  const position = record.position as Record<string, unknown> | undefined;
  let lat = finiteNumber(position?.lat) ?? finiteNumber(position?.y);
  let lng = finiteNumber(position?.lng) ?? finiteNumber(position?.x);
  if (lat === undefined || lng === undefined) return null;
  const id = stringValue(record.id) || raw.id || "raspberry-its";
  if (!isValidCoordinate(lat, lng)) {
    const known = state.knownDevicePositions[id];
    lat = known?.lat ?? DEFAULT_CENTER[0];
    lng = known?.lng ?? DEFAULT_CENTER[1];
  } else {
    saveKnownDevicePosition(id, lat, lng);
  }

  const lastSeen = normalizeEpoch(finiteNumber(raw.lastSeen) ?? 0);
  const rawStatus = isDeviceStatus(record.status) ? record.status : "offline";
  const status = lastSeen > 0 && Date.now() - lastSeen > OFFLINE_AFTER_MS ? "offline" : rawStatus;
  const detections = normalizeDetections(record.detections);
  const vehicleBreakdown = normalizeVehicleBreakdown(record.vehicleBreakdown);
  const vehicleCount = finiteNumber(record.vehicleCount)
    ?? finiteNumber(record.vehicles)
    ?? vehicleBreakdown?.total;
  const cameraMode = isCameraMode(record.cameraMode)
    ? record.cameraMode
    : stringValue(record.cameraUrl) ? "mjpeg" : undefined;

  return {
    id,
    label: stringValue(record.label) || "Raspberry Pi 5 Controller",
    status,
    lastSeen,
    lastSeenText: stringValue(record.lastSeenText),
    note: stringValue(record.note),
    cameraUrl: stringValue(record.cameraUrl),
    cameraHlsUrl: stringValue(record.cameraHlsUrl) || stringValue(record.hlsUrl),
    cameraThumbnailUrl: stringValue(record.cameraThumbnailUrl),
    cameraStatus: stringValue(record.cameraStatus),
    cameraUpdatedAt: finiteNumber(record.cameraUpdatedAt),
    cameraDataset: normalizeCameraDataset(record.cameraDataset),
    cameraMode,
    webrtcEnabled: typeof record.webrtcEnabled === "boolean" ? record.webrtcEnabled : undefined,
    webrtcPath: stringValue(record.webrtcPath),
    webrtcUrl: stringValue(record.webrtcUrl),
    cameraReady: typeof record.cameraReady === "boolean" ? record.cameraReady : undefined,
    roadName: stringValue(record.roadName),
    roadHint: stringValue(record.roadHint),
    trafficColor: isTrafficColor(record.trafficColor) ? record.trafficColor : undefined,
    trafficDuration: finiteNumber(record.trafficDuration) ?? finiteNumber(record.trafficDurationSec),
    trafficStartedAt: finiteNumber(record.trafficStartedAt),
    vehicleCount,
    vehicleBreakdown,
    detectorStatus: stringValue(record.detectorStatus),
    detectorNote: stringValue(record.detectorNote),
    detectorUpdatedAt: finiteNumber(record.detectorUpdatedAt),
    detectorFps: finiteNumber(record.detectorFps),
    detectorFrameWidth: finiteNumber(record.detectorFrameWidth),
    detectorFrameHeight: finiteNumber(record.detectorFrameHeight),
    detectorCameraSource: stringValue(record.detectorCameraSource),
    objectCount: Math.max(0, Math.round(finiteNumber(record.objectCount) ?? detections.length)),
    detections,
    trafficLevel: isTrafficLevel(record.trafficLevel) ? record.trafficLevel : undefined,
    trafficSource: stringValue(record.trafficSource),
    position: { lat: clamp(lat, -90, 90), lng: clamp(lng, -180, 180) },
  };
}

function renderAll(): void {
  renderTitle();
  renderGallery();
  drawTrafficChart();
  updateMaps();
  updateMapStatus();
  updateCameraSummary();
  if (state.activeTab === "camera") renderCameraView();
}

function renderTitle(): void {
  const device = state.device;
  setText("[data-title-device]", device?.label || "ITS Maps Windows");
  const raspiOnline = deviceIsOnline(device);
  setText("[data-title-meta]", device
    ? `${raspiOnline ? "online" : "offline"} - ${locationLabel(device)} - update ${formatAge(device.lastSeen)}`
    : "Raspberry Pi live traffic");
  setText("[data-raspi-state]", device ? (raspiOnline ? "online" : "offline") : "-");
  setText("[data-windows-state]", state.userLocation ? locationStateLabel(state.userLocation) : state.geolocationState);
  setText("[data-history-count]", String(state.history.length));
  const pill = document.querySelector<HTMLElement>("[data-sync-pill]");
  if (pill) pill.dataset.sync = device ? (raspiOnline ? "live" : "offline") : state.syncStatus;
  setText("[data-sync-word]", device ? (raspiOnline ? "ONLINE" : "OFFLINE") : state.syncText.toUpperCase());
  setText("[data-user-location-text]", state.userLocation ? coordinateText(state.userLocation) : "mencari lokasi");
  setText("[data-raspi-location-text]", device ? coordinateText(device.position) : "menunggu data");
}

function renderGallery(): void {
  const gallery = document.querySelector<HTMLElement>("[data-gallery]");
  if (!gallery) return;
  const images = carouselImages();
  state.galleryIndex = clamp(state.galleryIndex, 0, Math.max(0, images.length - 1));
  const active = images[state.galleryIndex] || FALLBACK_IMAGE_URL;
  gallery.style.setProperty("--gallery-image", `url('${active.replaceAll("'", "%27")}')`);
  gallery.innerHTML = `
    <div class="win-widget-head">${cameraSmallIcon()} Snapshot Raspberry</div>
    ${images.map((url, index) => `
      <div class="win-gallery-slide${index === state.galleryIndex ? " active" : ""}">
        <img src="${escapeHtml(url)}" alt="Snapshot Raspberry ${index + 1}" loading="${index === 0 ? "eager" : "lazy"}" crossorigin="anonymous">
      </div>
    `).join("")}
    <div class="win-gallery-shade"></div>
    <div class="win-gallery-caption">
      <div>
        <strong>${escapeHtml(state.device?.roadName || state.device?.label || "Raspberry Pi Camera")}</strong>
        <span>${escapeHtml(galleryCaption())}</span>
      </div>
      <div class="win-carousel-dots">
        ${images.map((_, index) => `<span class="${index === state.galleryIndex ? "active" : ""}"></span>`).join("")}
      </div>
    </div>
  `;
  syncImageAmbient(gallery, gallery.querySelector<HTMLImageElement>(".win-gallery-slide.active img"), "gallery");
}

function carouselImages(): string[] {
  const device = state.device;
  const liveImages = uniqueStrings([
    device?.cameraDataset?.snapshot1Url,
    device?.cameraDataset?.snapshot2Url,
    device?.cameraThumbnailUrl,
  ]);
  return liveImages.length ? liveImages.slice(0, 2) : [FALLBACK_IMAGE_URL];
}

function galleryCaption(): string {
  const device = state.device;
  if (!device) return "menunggu sinkronisasi";
  const updated = device.cameraDataset?.updatedAt || device.detectorUpdatedAt || device.lastSeen;
  return `update ${formatAge(normalizeEpoch(updated || 0))} - ${vehicleCountFor(device)} kendaraan`;
}

function startCarousel(): void {
  window.clearInterval(state.carouselTimer);
  state.carouselTimer = window.setInterval(() => {
    const images = carouselImages();
    if (images.length <= 1) return;
    state.galleryIndex = (state.galleryIndex + 1) % images.length;
    renderGallery();
  }, 10_000);
}

function updateMaps(): void {
  const device = state.device;
  const user = state.userLocation;
  const fallback = user ? [user.lat, user.lng] as [number, number]
    : device ? [device.position.lat, device.position.lng] as [number, number]
      : DEFAULT_CENTER;

  if (state.maps.homeUser) {
    state.maps.homeUser.setView(user ? [user.lat, user.lng] : fallback, user ? 16 : 14, { animate: false });
    state.markers.homeUser = syncUserMarker(state.maps.homeUser, state.markers.homeUser, user);
  }
  if (state.maps.homeRaspi) {
    state.maps.homeRaspi.setView(device ? [device.position.lat, device.position.lng] : fallback, device ? 16 : 14, { animate: false });
    state.markers.homeRaspi = syncRaspiMarker(state.maps.homeRaspi, state.markers.homeRaspi, device);
  }
  if (state.maps.full) {
    state.markers.fullUser = syncUserMarker(state.maps.full, state.markers.fullUser, user, () => focusFullMap("user"));
    state.markers.fullRaspi = syncRaspiMarker(state.maps.full, state.markers.fullRaspi, device, () => focusFullMap("raspi"));
  }
  invalidateMaps();
}

function syncUserMarker(map: L.Map, marker: L.Marker | null, user: UserLocation | null, onClick?: () => void): L.Marker | null {
  if (!user) {
    if (marker) map.removeLayer(marker);
    return null;
  }
  const latLng: L.LatLngExpression = [user.lat, user.lng];
  if (!marker) {
    marker = L.marker(latLng, {
      icon: userMarkerIcon(),
      zIndexOffset: 1200,
      title: "Lokasi user Windows",
    }).addTo(map);
    marker.on("click", () => {
      onClick?.();
      openUserSheet(user);
    });
  } else {
    marker.setLatLng(latLng);
    marker.setIcon(userMarkerIcon());
  }
  return marker;
}

function syncRaspiMarker(map: L.Map, marker: L.Marker | null, device: DeviceRecord | null, onClick?: () => void): L.Marker | null {
  if (!device) {
    if (marker) map.removeLayer(marker);
    return null;
  }
  const latLng: L.LatLngExpression = [device.position.lat, device.position.lng];
  if (!marker) {
    marker = L.marker(latLng, {
      icon: raspiMarkerIcon(device),
      zIndexOffset: 1500,
      title: device.label,
    }).addTo(map);
    marker.on("click", () => {
      onClick?.();
      openDeviceSheet(device);
    });
    if (map.getContainer().id === "win-full-map") {
      marker.bindPopup(trafficPreviewHtml(device), {
        closeButton: true,
        autoPan: false,
        offset: L.point(0, -30),
        className: "win-video-popup",
      });
      marker.on("mouseover", () => {
        marker?.openPopup();
        bindTrafficPreviewPopup();
      });
      marker.on("popupopen", bindTrafficPreviewPopup);
    }
  } else {
    marker.setLatLng(latLng);
    marker.setIcon(raspiMarkerIcon(device));
    if (map.getContainer().id === "win-full-map") marker.setPopupContent(trafficPreviewHtml(device));
  }
  return marker;
}

function focusFullMap(focus: MapFocus): void {
  state.mapFocus = focus;
  const map = state.maps.full;
  if (!map) return;
  document.querySelectorAll<HTMLButtonElement>("[data-map-focus]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mapFocus === focus);
  });
  const user = state.userLocation;
  const device = state.device;
  if (focus === "user" && user) {
    map.flyTo([user.lat, user.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.7 });
  } else if (focus === "raspi" && device) {
    map.flyTo([device.position.lat, device.position.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.7 });
  } else {
    const center = device ? [device.position.lat, device.position.lng] as [number, number] : DEFAULT_CENTER;
    map.flyTo(center, DEFAULT_ZOOM, { animate: true, duration: 0.7 });
  }
  updateMapStatus();
  schedulePoiFetch(200);
}

function setMapPitch(pitch: number): void {
  state.mapPitch = [0, 60, 75, 90].includes(pitch) ? pitch : 0;
  const mapEl = document.querySelector<HTMLElement>("#win-full-map");
  if (mapEl) {
    mapEl.dataset.pitch = String(state.mapPitch);
  }
  document.querySelector<HTMLElement>("[data-view='map']")?.style.setProperty("--map-pitch", String(state.mapPitch));
  document.querySelectorAll<HTMLButtonElement>("[data-map-pitch]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.mapPitch || 0) === state.mapPitch);
  });
  updateMapStatus();
  updateCompass();
  window.setTimeout(() => state.maps.full?.invalidateSize(), 260);
}

function updateMapStatus(): void {
  const pitchLabel = state.mapPitch ? ` - simulasi sudut ${state.mapPitch} derajat` : " - 2D";
  const text = state.mapFocus === "user"
    ? state.userLocation ? `User ${coordinateText(state.userLocation)}${pitchLabel}` : `Lokasi user belum tersedia (${state.geolocationState})`
    : state.device ? `Raspberry ${locationLabel(state.device)} - ${coordinateText(state.device.position)}${pitchLabel}` : "Lokasi Raspberry belum tersedia";
  setText("[data-map-status]", text);
}

function resetMapNorth(): void {
  setMapPitch(0);
  focusFullMap(state.mapFocus);
  const compass = document.querySelector<HTMLElement>("[data-map-compass]");
  if (compass) {
    compass.classList.add("pulse");
    window.setTimeout(() => compass.classList.remove("pulse"), 420);
  }
}

function updateCompass(): void {
  const compass = document.querySelector<HTMLElement>("[data-map-compass]");
  if (!compass) return;
  compass.style.setProperty("--bearing", "0deg");
  compass.dataset.pitch = String(state.mapPitch);
}

function schedulePoiFetch(delay: number): void {
  window.clearTimeout(state.poiFetchTimer);
  state.poiFetchTimer = window.setTimeout(() => void refreshPois(), delay);
}

async function refreshPois(): Promise<void> {
  const map = state.maps.full;
  if (!map || state.activeTab !== "map") return;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const radius = Math.round(clamp(3400 - zoom * 110, 850, 1900));
  const key = `${center.lat.toFixed(3)}:${center.lng.toFixed(3)}:${radius}`;
  if (state.poiFetchKey === key) return;
  state.poiFetchKey = key;

  try {
    const query = overpassQuery(center.lat, center.lng, radius);
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      body: query,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data = await res.json() as { elements?: Array<Record<string, any>> };
    state.pois = normalizePois(data.elements || []);
    renderPois();
  } catch (err) {
    console.warn("[ITS Windows] POI fetch failed:", err);
  }
}

function overpassQuery(lat: number, lng: number, radius: number): string {
  return `[out:json][timeout:12];
(
  node(around:${radius},${lat},${lng})["amenity"];
  node(around:${radius},${lat},${lng})["tourism"];
  node(around:${radius},${lat},${lng})["leisure"];
  node(around:${radius},${lat},${lng})["shop"];
  node(around:${radius},${lat},${lng})["railway"~"station|halt|tram_stop"];
  node(around:${radius},${lat},${lng})["public_transport"];
);
out body 90;`;
}

function normalizePois(elements: Array<Record<string, any>>): PoiRecord[] {
  return elements.flatMap((el) => {
    const lat = finiteNumber(el.lat);
    const lng = finiteNumber(el.lon);
    const tags = (el.tags || {}) as Record<string, string>;
    const title = tags.name || tags["name:id"] || tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.railway;
    if (lat === undefined || lng === undefined || !title) return [];
    const kind = tags.amenity || tags.tourism || tags.leisure || tags.shop || tags.railway || "poi";
    const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
    const address = street || tags["addr:city"] || tags.operator || "OpenStreetMap";
    return [{
      id: String(el.id || `${lat},${lng}`),
      title: String(title),
      kind: String(kind),
      address,
      description: poiDescription(kind, tags),
      lat,
      lng,
      source: "OpenStreetMap",
    }];
  });
}

function renderPois(): void {
  const map = state.maps.full;
  const layer = state.poiLayer;
  if (!map || !layer) return;
  const activeIds = new Set(state.pois.map((poi) => poi.id));
  for (const [id, marker] of state.poiMarkers.entries()) {
    if (!activeIds.has(id)) {
      layer.removeLayer(marker);
      state.poiMarkers.delete(id);
    }
  }
  state.pois.forEach((poi) => {
    let marker = state.poiMarkers.get(poi.id);
    if (!marker) {
      marker = L.marker([poi.lat, poi.lng], {
        icon: poiMarkerIcon(poi),
        title: poi.title,
      }).addTo(layer);
      marker.on("click", () => openPoiSheet(poi));
      state.poiMarkers.set(poi.id, marker);
    } else {
      marker.setLatLng([poi.lat, poi.lng]);
      marker.setIcon(poiMarkerIcon(poi));
    }
  });
}

function openPoiSheet(poi: PoiRecord): void {
  const map = state.maps.full;
  if (map) map.flyTo([poi.lat, poi.lng], Math.max(map.getZoom(), 17), { animate: true, duration: 0.7 });
  openInfoSheet(`
    <p>${escapeHtml(poi.description)}</p>
    <div class="win-poi-meta">
      <div><span>Latitude</span><strong>${poi.lat.toFixed(6)}</strong></div>
      <div><span>Longitude</span><strong>${poi.lng.toFixed(6)}</strong></div>
      <div><span>Sumber</span><strong>${escapeHtml(poi.source)}</strong></div>
      <div><span>Jarak</span><strong>${escapeHtml(distanceToPoi(poi))}</strong></div>
    </div>
  `, poi.title, `${poi.kind} - ${poi.address}`);
}

function openDeviceSheet(device: DeviceRecord): void {
  const stats = aiStatsForDevice(device);
  const online = deviceIsOnline(device);
  const camera = publicCameraHlsUrl(device) || publicCameraUrl(device);
  openInfoSheet(`
    <p>${escapeHtml(device.note || "Data Raspberry disinkronkan realtime dari Firebase RTDB.")}</p>
    <div class="win-poi-meta">
      <div><span>Status</span><strong class="${online ? "win-ok" : "win-bad"}">${online ? "online" : "offline"}</strong></div>
      <div><span>Last seen</span><strong>${escapeHtml(device.lastSeenText || formatAbsoluteTime(device.lastSeen))}</strong></div>
      <div><span>Lokasi</span><strong>${escapeHtml(coordinateText(device.position))}</strong></div>
      <div><span>Road</span><strong>${escapeHtml(locationLabel(device))}</strong></div>
      <div><span>AI device</span><strong>YOLO ONNX offline</strong></div>
      <div><span>AI status</span><strong>${escapeHtml(aiStatusText(device))}</strong></div>
      <div><span>Total kendaraan</span><strong>${stats.breakdown.total}</strong></div>
      <div><span>Total objek</span><strong>${stats.objectCount}</strong></div>
      <div><span>Kamera</span><strong>${escapeHtml(camera ? cameraHostLabel(camera) : "URL kamera belum tersedia")}</strong></div>
      <div><span>Sumber</span><strong>${escapeHtml(device.trafficSource || "Firebase RTDB")}</strong></div>
    </div>
  `, device.label, `${online ? "online" : `offline - terakhir ${formatAge(device.lastSeen)}`} - ${locationLabel(device)}`);
}

function openUserSheet(user: UserLocation): void {
  openInfoSheet(`
    <p>Lokasi user Windows dipakai untuk marker realtime, fokus peta, jarak POI, dan sinkronisasi desktop client ke Firebase RTDB.</p>
    <div class="win-poi-meta">
      <div><span>Latitude</span><strong>${user.lat.toFixed(6)}</strong></div>
      <div><span>Longitude</span><strong>${user.lng.toFixed(6)}</strong></div>
      <div><span>Akurasi</span><strong>${user.accuracy ? `${Math.round(user.accuracy)} m` : "-"}</strong></div>
      <div><span>Update</span><strong>${escapeHtml(formatAge(user.updatedAt))}</strong></div>
    </div>
  `, "Lokasi user Windows", "Realtime dari permission lokasi perangkat");
}

function openInfoSheet(bodyHtml: string, title: string, subtitle: string): void {
  const host = document.querySelector<HTMLElement>("[data-poi-sheet]");
  if (!host) return;
  host.innerHTML = `
    <section class="win-poi-sheet-panel" data-poi-panel>
      <header class="win-poi-header">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(subtitle)}</span>
        </div>
        <button class="win-icon-button" type="button" data-close-poi aria-label="Tutup panel">${closeIcon()}</button>
      </header>
      <div class="win-poi-body">${bodyHtml}</div>
    </section>
  `;
  host.classList.add("open");
  host.querySelector<HTMLButtonElement>("[data-close-poi]")?.addEventListener("click", closePoiSheet);
  const panel = host.querySelector<HTMLElement>("[data-poi-panel]");
  if (panel) setupSwipeClose(panel, closePoiSheet, "right");
}

function closePoiSheet(): void {
  const host = document.querySelector<HTMLElement>("[data-poi-sheet]");
  if (!host) return;
  host.classList.remove("open");
  window.setTimeout(() => {
    if (!host.classList.contains("open")) host.innerHTML = "";
  }, 280);
}

function trafficPreviewHtml(device: DeviceRecord): string {
  const poster = latestCameraSnapshot(device) || FALLBACK_IMAGE_URL;
  const label = deviceIsOnline(device) ? "LIVE" : "OFFLINE";
  return `
    <button type="button" class="win-map-video-preview" data-open-camera-from-map>
      <span class="win-map-video-head">
        <strong>${escapeHtml(cameraHostLabel(publicCameraHlsUrl(device) || publicCameraUrl(device)) || "Kamera Raspberry")}</strong>
        <b data-live="${deviceIsOnline(device) ? "true" : "false"}">${label}</b>
      </span>
      <img src="${escapeHtml(poster)}" alt="Preview kamera Raspberry">
      <span class="win-map-video-foot">${escapeHtml(deviceIsOnline(device) ? cameraStatusText(device) : `offline - terakhir ${formatAge(device.lastSeen)}`)}</span>
    </button>
  `;
}

function bindTrafficPreviewPopup(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-open-camera-from-map]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      setTab("camera");
      renderCameraView();
    });
  });
}

function drawTrafficChart(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#win-traffic-chart");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(220, rect.height);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#12161c";
  ctx.fillRect(0, 0, width, height);

  const entries = state.history;
  const pad = { left: 58, right: 18, top: 18, bottom: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const maxVehicles = Math.max(20, ...entries.map((p) => p.vehicleCount)) + 4;
  const maxDuration = Math.max(10, ...entries.flatMap((p) => [p.red, p.yellow, p.green])) + 3;
  const toX = (vehicleCount: number) => pad.left + (vehicleCount / maxVehicles) * chartW;
  const toY = (duration: number) => pad.top + chartH - (duration / maxDuration) * chartH;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= maxDuration; y += Math.max(2, Math.ceil(maxDuration / 6))) {
    const sy = toY(y);
    ctx.beginPath();
    ctx.moveTo(pad.left, sy);
    ctx.lineTo(width - pad.right, sy);
    ctx.stroke();
  }
  for (let x = 0; x <= maxVehicles; x += Math.max(5, Math.ceil(maxVehicles / 5))) {
    const sx = toX(x);
    ctx.beginPath();
    ctx.moveTo(sx, pad.top);
    ctx.lineTo(sx, height - pad.bottom);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, height - pad.bottom);
  ctx.lineTo(width - pad.right, height - pad.bottom);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.66)";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 0; y <= maxDuration; y += Math.max(2, Math.ceil(maxDuration / 6))) {
    ctx.fillText(String(y), pad.left - 9, toY(y));
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let x = 0; x <= maxVehicles; x += Math.max(5, Math.ceil(maxVehicles / 5))) {
    ctx.fillText(String(x), toX(x), height - pad.bottom + 12);
  }

  ctx.save();
  ctx.translate(17, pad.top + chartH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Waktu lampu lalu lintas (detik)", 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.58)";
  ctx.fillText("Jumlah kendaraan", pad.left + chartW / 2, height - 14);

  drawTrafficSeries(ctx, entries, "red", toX, toY);
  drawTrafficSeries(ctx, entries, "yellow", toX, toY);
  drawTrafficSeries(ctx, entries, "green", toX, toY);

  if (!entries.length) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Menunggu histori lalu lintas", width / 2, height / 2);
  }
}

function drawTrafficSeries(
  ctx: CanvasRenderingContext2D,
  entries: TrafficHistoryPoint[],
  color: TrafficColor,
  toX: (vehicleCount: number) => number,
  toY: (duration: number) => number,
): void {
  if (!entries.length) return;
  const oldColors: Record<TrafficColor, string> = {
    red: "rgba(117,49,59,0.76)",
    yellow: "rgba(116,98,44,0.8)",
    green: "rgba(36,102,73,0.82)",
  };
  const brightColors: Record<TrafficColor, string> = {
    red: "#ff4d5c",
    yellow: "#ffd44d",
    green: "#37dd86",
  };
  const glowColors: Record<TrafficColor, string> = {
    red: "rgba(255,77,92,0.28)",
    yellow: "rgba(255,212,77,0.28)",
    green: "rgba(55,221,134,0.28)",
  };
  ctx.lineWidth = 2;
  ctx.strokeStyle = oldColors[color];
  ctx.beginPath();
  entries.forEach((point, index) => {
    const x = toX(point.vehicleCount);
    const y = toY(point[color]);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  entries.forEach((point, index) => {
    const latest = index === entries.length - 1;
    const x = toX(point.vehicleCount);
    const y = toY(point[color]);
    ctx.beginPath();
    ctx.arc(x, y, latest ? 5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = latest ? brightColors[color] : oldColors[color];
    ctx.fill();
    if (latest) {
      ctx.strokeStyle = "rgba(255,255,255,0.86)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = glowColors[color];
      ctx.stroke();
    }
  });
}

function recordTrafficHistory(device: DeviceRecord): void {
  const duration = phaseDurations(device);
  const point: TrafficHistoryPoint = {
    at: Date.now(),
    deviceId: device.id,
    vehicleCount: vehicleCountFor(device),
    red: duration.red,
    yellow: duration.yellow,
    green: duration.green,
    activeColor: trafficColorFor(device),
  };
  const key = `${point.deviceId}:${device.lastSeen}:${point.vehicleCount}:${point.red}:${point.yellow}:${point.green}:${point.activeColor}`;
  if (state.lastHistoryKey === key) return;
  state.lastHistoryKey = key;
  state.history.push(point);
  saveTrafficHistory(state.history);
}

function phaseDurations(device: DeviceRecord): Record<TrafficColor, number> {
  const count = vehicleCountFor(device);
  const level = count <= 5 ? "lancar" : count <= 10 ? "sedang" : "padat";
  const base = {
    red: level === "padat" ? 5 : level === "sedang" ? 7 : 8,
    yellow: 3,
    green: level === "padat" ? 22 : level === "sedang" ? 12 : 6,
  };
  const active = trafficColorFor(device);
  const duration = device.trafficDuration && Number.isFinite(device.trafficDuration)
    ? Math.max(1, Math.round(device.trafficDuration))
    : base[active];
  return { ...base, [active]: duration };
}

function renderCameraView(): void {
  const host = document.querySelector<HTMLElement>("[data-camera-host]");
  if (!host) return;
  const device = state.device;
  const key = cameraSurfaceKey(device);
  if (state.cameraKey === key && host.querySelector("[data-camera-frame]")) {
    updateCameraAiPanel();
    return;
  }
  resetCameraRuntime();
  state.cameraKey = key;
  host.innerHTML = cameraSurfaceHtml(device);
  setupCameraSurface();
}

function cameraSurfaceHtml(device: DeviceRecord | null): string {
  const media = cameraMediaHtml(device);
  const live = Boolean(device && deviceIsOnline(device) && (publicCameraUrl(device) || publicCameraHlsUrl(device)));
  return `
    <section class="win-camera-surface" data-camera-surface data-live-state="${live ? "online" : "offline"}">
      <div class="win-camera-frame" data-camera-frame data-ai-open="false">
        <div class="win-camera-media" data-camera-media>${media}</div>
        <div class="win-camera-live"><span></span>${live ? "LIVE" : "OFFLINE"}</div>
        <div class="win-camera-status" data-camera-status>${escapeHtml(cameraStatusText(device))}</div>
        <div class="win-camera-controls">
          <button class="win-camera-button" type="button" data-camera-play aria-label="Play pause">${playIcon()}</button>
          <div class="win-camera-controls-right">
            <button class="win-camera-button ai" type="button" data-camera-ai aria-label="AI">AI</button>
            <button class="win-camera-button" type="button" data-camera-fullscreen aria-label="Fullscreen">${fullscreenIcon(false)}</button>
          </div>
        </div>
        <aside class="win-camera-ai-panel" data-camera-ai-panel></aside>
      </div>
    </section>
  `;
}

function cameraMediaHtml(device: DeviceRecord | null): string {
  const url = publicCameraUrl(device);
  const hlsUrl = publicCameraHlsUrl(device);
  const poster = latestCameraSnapshot(device);
  if (device && !deviceIsOnline(device)) {
    return `<img src="${escapeHtml(poster || FALLBACK_IMAGE_URL)}" alt="Snapshot kamera offline" data-camera-image crossorigin="anonymous">`;
  }
  if (url && isLikelyImageUrl(url)) {
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(device?.label || "Kamera Raspberry")}" data-camera-image crossorigin="anonymous">`;
  }
  if (url || hlsUrl) {
    const src = hlsUrl || url;
    const pageAttr = url ? ` data-page-src="${escapeHtml(url)}"` : "";
    const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : "";
    return `
      <video data-camera-video muted playsinline autoplay preload="auto" disablepictureinpicture crossorigin="anonymous"${posterAttr} data-src="${escapeHtml(src)}"${pageAttr}></video>
      <iframe class="win-camera-fallback-frame" data-camera-iframe hidden src="about:blank" allow="autoplay; camera; microphone; fullscreen" referrerpolicy="no-referrer"></iframe>
      <div class="win-camera-media-message" data-camera-media-message hidden></div>
    `;
  }
  if (poster) {
    return `<img src="${escapeHtml(poster)}" alt="${escapeHtml(device?.label || "Kamera Raspberry")}" data-camera-image crossorigin="anonymous">`;
  }
  if (device?.webrtcEnabled || device?.cameraMode === "webrtc") {
    return `<div class="win-camera-placeholder">${cameraLargeIcon()}<span>WebRTC Raspberry menunggu URL publik atau signaling aktif.</span></div>`;
  }
  return `<img src="${FALLBACK_IMAGE_URL}" alt="Fallback kamera offline" data-camera-image crossorigin="anonymous">`;
}

function setupCameraSurface(): void {
  const surface = document.querySelector<HTMLElement>("[data-camera-surface]");
  const frame = document.querySelector<HTMLElement>("[data-camera-frame]");
  const video = document.querySelector<HTMLVideoElement>("[data-camera-video]");
  if (!surface || !frame) return;

  updateCameraAiPanel();
  frame.querySelector<HTMLButtonElement>("[data-camera-ai]")?.addEventListener("click", () => {
    setAiOpen(frame.dataset.aiOpen !== "true");
  });
  frame.querySelector<HTMLButtonElement>("[data-camera-play]")?.addEventListener("click", () => {
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
    window.setTimeout(syncPlayButton, 0);
  });
  frame.querySelector<HTMLButtonElement>("[data-camera-fullscreen]")?.addEventListener("click", () => {
    toggleCameraFullscreen(surface, frame);
  });
  const aiPanel = frame.querySelector<HTMLElement>("[data-camera-ai-panel]");
  if (aiPanel) setupSwipeClose(aiPanel, () => setAiOpen(false), window.matchMedia("(max-width: 760px)").matches ? "down" : "right");

  if (video) {
    setupVideo(video);
    video.addEventListener("play", syncPlayButton);
    video.addEventListener("pause", syncPlayButton);
    video.addEventListener("loadeddata", () => hideCameraFrameFallback(video));
    video.addEventListener("canplay", () => hideCameraFrameFallback(video));
    video.addEventListener("error", () => showCameraFrameFallback(video, "Video HLS belum dapat diputar, membuka halaman kamera Raspberry..."));
    startCameraAmbient(video, surface);
  } else {
    const image = frame.querySelector<HTMLImageElement>("[data-camera-image]");
    syncImageAmbient(surface, image, "camera");
  }
  syncFullscreenButtons();
}

function toggleCameraFullscreen(surface: HTMLElement, frame: HTMLElement): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
    return;
  }
  const request = surface.requestFullscreen();
  void request.catch((err) => {
    console.warn("[ITS Windows] fullscreen surface failed:", err);
    void frame.requestFullscreen().catch((fallbackErr) => console.warn("[ITS Windows] fullscreen frame failed:", fallbackErr));
  });
}

function setupVideo(video: HTMLVideoElement): void {
  const src = video.dataset.src || "";
  if (!src) return;
  scheduleCameraFallback(video);
  if (isLikelyHlsUrl(src)) {
    const playlist = hlsPlaylistUrl(src);
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlist;
      void video.play().catch(() => undefined);
      return;
    }
    void loadHlsScript().then(() => {
      const Hls = (window as any).Hls;
      if (Hls?.isSupported()) {
        state.hlsInstance = new Hls({
          lowLatencyMode: true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
        });
        state.hlsInstance.loadSource(playlist);
        state.hlsInstance.attachMedia(video);
        state.hlsInstance.on?.(Hls.Events.ERROR, (_event: unknown, data: { fatal?: boolean }) => {
          if (data?.fatal) showCameraFrameFallback(video, "HLS live gagal, membuka halaman kamera Raspberry...");
        });
      } else {
        video.src = playlist;
      }
      void video.play().catch(() => undefined);
    }).catch((err) => {
      console.warn("[ITS Windows] HLS failed:", err);
      video.src = playlist;
      window.setTimeout(() => showCameraFrameFallback(video, "hls.js tidak tersedia, membuka halaman kamera Raspberry..."), 1200);
    });
    return;
  }
  video.src = src;
  void video.play().catch(() => undefined);
}

function scheduleCameraFallback(video: HTMLVideoElement): void {
  window.clearTimeout(state.cameraReadyTimer);
  state.cameraReadyTimer = window.setTimeout(() => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      showCameraFrameFallback(video, "Stream belum mengirim frame, membuka halaman kamera Raspberry...");
    }
  }, 8000);
}

function showCameraFrameFallback(video: HTMLVideoElement, message: string): void {
  const frame = video.closest<HTMLElement>("[data-camera-frame]");
  const iframe = frame?.querySelector<HTMLIFrameElement>("[data-camera-iframe]");
  const messageEl = frame?.querySelector<HTMLElement>("[data-camera-media-message]");
  const pageUrl = usablePublicMediaUrl(video.dataset.pageSrc);
  if (!frame || !iframe || !pageUrl) {
    if (messageEl) {
      messageEl.hidden = false;
      messageEl.textContent = message;
    }
    return;
  }
  if (iframe.src !== pageUrl) iframe.src = pageUrl;
  iframe.hidden = false;
  video.classList.add("fallback-hidden");
  if (messageEl) {
    messageEl.hidden = false;
    messageEl.textContent = message;
  }
  const poster = latestCameraSnapshot(state.device);
  const surface = frame.closest<HTMLElement>("[data-camera-surface]");
  if (surface) {
    const image = poster ? new Image() : null;
    if (image) {
      image.src = poster;
      syncImageAmbient(surface, image, "camera");
    } else {
      applyAmbientColors(surface, "camera", { r: 85, g: 142, b: 255 }, { r: 68, g: 218, b: 177 });
    }
  }
}

function hideCameraFrameFallback(video: HTMLVideoElement): void {
  window.clearTimeout(state.cameraReadyTimer);
  const frame = video.closest<HTMLElement>("[data-camera-frame]");
  const iframe = frame?.querySelector<HTMLIFrameElement>("[data-camera-iframe]");
  const messageEl = frame?.querySelector<HTMLElement>("[data-camera-media-message]");
  video.classList.remove("fallback-hidden");
  if (iframe) iframe.hidden = true;
  if (messageEl) messageEl.hidden = true;
}

function loadHlsScript(): Promise<void> {
  if ((window as any).Hls) return Promise.resolve();
  if (state.hlsScriptPromise) return state.hlsScriptPromise;
  state.hlsScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = HLS_JS_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("hls.js load failed"));
    document.head.appendChild(script);
  });
  return state.hlsScriptPromise;
}

function resetCameraRuntime(): void {
  window.clearInterval(state.ambientTimer);
  window.clearTimeout(state.cameraReadyTimer);
  state.ambientTimer = 0;
  state.cameraReadyTimer = 0;
  if (state.hlsInstance?.destroy) {
    try { state.hlsInstance.destroy(); } catch { /* ignore */ }
  }
  state.hlsInstance = null;
}

function startCameraAmbient(video: HTMLVideoElement, surface: HTMLElement): void {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 14;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const sample = () => {
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 16) {
        r += data[i] || 0;
        g += data[i + 1] || 0;
        b += data[i + 2] || 0;
        count += 1;
      }
      if (!count) return;
      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);
      surface.style.setProperty("--camera-ambient-color", `rgba(${r}, ${g}, ${b}, 0.52)`);
      surface.style.setProperty("--camera-ambient-soft", `rgba(${r}, ${g}, ${b}, 0.28)`);
    } catch {
      surface.style.setProperty("--camera-ambient-color", "rgba(45,140,255,0.46)");
      surface.style.setProperty("--camera-ambient-soft", "rgba(55,221,134,0.2)");
    }
  };
  sample();
  state.ambientTimer = window.setInterval(sample, 520);
}

function syncImageAmbient(host: HTMLElement, image: HTMLImageElement | null, target: "gallery" | "camera"): void {
  const fallback = () => applyAmbientColors(host, target, { r: 85, g: 142, b: 255 }, { r: 68, g: 218, b: 177 });
  if (!image) {
    fallback();
    return;
  }
  image.crossOrigin = "anonymous";
  const sample = () => {
    try {
      const colors = sampleElementColors(image);
      applyAmbientColors(host, target, colors.primary, colors.secondary);
    } catch {
      fallback();
    }
  };
  if (image.complete && image.naturalWidth) sample();
  else {
    image.addEventListener("load", sample, { once: true });
    image.addEventListener("error", fallback, { once: true });
  }
}

function sampleElementColors(source: CanvasImageSource): { primary: RgbColor; secondary: RgbColor } {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let warm = { r: 0, g: 0, b: 0, score: -1 };
  let cool = { r: 0, g: 0, b: 0, score: -1 };
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < data.length; i += 16) {
    const pr = data[i] || 0;
    const pg = data[i + 1] || 0;
    const pb = data[i + 2] || 0;
    const alpha = data[i + 3] || 0;
    if (alpha < 40) continue;
    const saturation = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
    const brightness = (pr + pg + pb) / 3;
    const warmScore = saturation + pr * 0.44 + pg * 0.18 - pb * 0.12 + brightness * 0.08;
    const coolScore = saturation + pb * 0.34 + pg * 0.26 - pr * 0.08 + brightness * 0.08;
    if (warmScore > warm.score) warm = { r: pr, g: pg, b: pb, score: warmScore };
    if (coolScore > cool.score) cool = { r: pr, g: pg, b: pb, score: coolScore };
    r += pr;
    g += pg;
    b += pb;
    count += 1;
  }
  const average = count ? { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) } : { r: 85, g: 142, b: 255 };
  return {
    primary: warm.score > 0 ? warm : average,
    secondary: cool.score > 0 ? cool : average,
  };
}

type RgbColor = { r: number; g: number; b: number };

function applyAmbientColors(host: HTMLElement, target: "gallery" | "camera", primary: RgbColor, secondary: RgbColor): void {
  if (target === "gallery") {
    host.style.setProperty("--ambient-a", `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.58)`);
    host.style.setProperty("--ambient-b", `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.44)`);
    host.style.setProperty("--ambient-c", `rgba(${primary.r}, ${Math.round((primary.g + secondary.g) / 2)}, ${secondary.b}, 0.26)`);
    return;
  }
  host.style.setProperty("--camera-ambient-color", `rgba(${primary.r}, ${primary.g}, ${primary.b}, 0.52)`);
  host.style.setProperty("--camera-ambient-soft", `rgba(${secondary.r}, ${secondary.g}, ${secondary.b}, 0.28)`);
}

function setAiOpen(open: boolean): void {
  const frame = document.querySelector<HTMLElement>("[data-camera-frame]");
  if (!frame) return;
  const panel = frame.querySelector<HTMLElement>("[data-camera-ai-panel]");
  if (panel) panel.style.transform = "";
  frame.dataset.aiOpen = open ? "true" : "false";
  updateCameraAiPanel();
}

function updateCameraAiPanel(): void {
  const panel = document.querySelector<HTMLElement>("[data-camera-ai-panel]");
  if (!panel) return;
  const stats = aiStatsForDevice(state.device);
  panel.innerHTML = `
    <div class="win-ai-head">
      <div>
        <span>AI YOLO</span>
        <strong>${escapeHtml(aiStatusText(state.device))}</strong>
      </div>
      <button class="win-icon-button" type="button" data-ai-close aria-label="Tutup AI">${closeIcon()}</button>
    </div>
    <div class="win-ai-grid">
      ${aiStat("Kendaraan", stats.breakdown.total)}
      ${aiStat("Mobil", stats.breakdown.car)}
      ${aiStat("Motor", stats.breakdown.motorcycle)}
      ${aiStat("Bus", stats.breakdown.bus)}
      ${aiStat("Truk", stats.breakdown.truck)}
      ${aiStat("Sepeda", stats.breakdown.bicycle)}
      ${aiStat("Objek lain", stats.others)}
      ${aiStat("Total objek", stats.objectCount)}
    </div>
    <p class="win-ai-note">${escapeHtml(stats.otherSummary)}</p>
  `;
  panel.querySelector<HTMLButtonElement>("[data-ai-close]")?.addEventListener("click", () => setAiOpen(false));
}

function aiStat(label: string, value: number): string {
  return `<div class="win-ai-stat"><span>${escapeHtml(label)}</span><strong>${Math.max(0, Math.round(value))}</strong></div>`;
}

function syncPlayButton(): void {
  const video = document.querySelector<HTMLVideoElement>("[data-camera-video]");
  const button = document.querySelector<HTMLButtonElement>("[data-camera-play]");
  if (!button) return;
  button.innerHTML = video && !video.paused ? pauseIcon() : playIcon();
}

function syncFullscreenButtons(): void {
  const button = document.querySelector<HTMLButtonElement>("[data-camera-fullscreen]");
  if (!button) return;
  const active = Boolean(document.fullscreenElement);
  button.innerHTML = fullscreenIcon(active);
  button.setAttribute("aria-label", active ? "Keluar fullscreen" : "Fullscreen");
}

function updateCameraSummary(): void {
  const device = state.device;
  setText("[data-camera-source]", cameraStatusText(device));
  const stats = aiStatsForDevice(device);
  setText("[data-camera-ai-summary]", `${stats.breakdown.total} kendaraan - ${stats.objectCount} objek`);
}

function startUserLocation(): void {
  showLocationPromptIfNeeded();
  requestUserLocation();
  if (!navigator.geolocation || state.geolocationWatch) return;
  state.geolocationWatch = navigator.geolocation.watchPosition((pos) => {
    applyUserPosition(pos);
  }, (err) => {
    console.warn("[ITS Windows] geolocation failed:", err);
    state.geolocationState = geolocationErrorText(err);
    renderTitle();
    updateMapStatus();
  }, {
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 12_000,
  });
}

function requestUserLocation(): void {
  if (!navigator.geolocation) {
    state.geolocationState = "GPS tidak tersedia";
    showLocationPrompt("GPS perangkat tidak tersedia di runtime Windows ini.");
    void requestFallbackLocation("browser geolocation tidak tersedia");
    renderTitle();
    updateMapStatus();
    return;
  }
  state.geolocationState = "meminta izin lokasi";
  showLocationPrompt("Menunggu izin lokasi dari Windows untuk membaca posisi realtime user.");
  renderTitle();
  navigator.geolocation.getCurrentPosition((pos) => {
    applyUserPosition(pos);
    focusMapIfVisible("user");
  }, (err) => {
    console.warn("[ITS Windows] geolocation request failed:", err);
    state.geolocationState = geolocationErrorText(err);
    showLocationPrompt(state.geolocationState);
    void requestFallbackLocation(state.geolocationState);
    renderTitle();
    updateMapStatus();
  }, {
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 8_000,
  });
}

function applyUserPosition(pos: GeolocationPosition): void {
  applyUserLocation({
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    updatedAt: Date.now(),
    source: "windows-geolocation",
  });
}

function applyUserLocation(location: UserLocation): void {
  state.userLocation = {
    lat: clamp(location.lat, -90, 90),
    lng: clamp(location.lng, -180, 180),
    accuracy: location.accuracy,
    updatedAt: location.updatedAt || Date.now(),
    source: location.source,
  };
  state.geolocationState = location.source === "network" ? "lokasi jaringan aktif" : "lokasi aktif";
  hideLocationPrompt();
  saveLastUserLocation(state.userLocation);
  publishUserLocation();
  renderAll();
}

async function requestFallbackLocation(reason: string): Promise<void> {
  const native = await requestNativeWindowsLocation();
  if (native) return;
  const network = await requestNetworkLocation();
  if (network) return;
  state.geolocationState = `${reason}; koordinat belum tersedia`;
  renderTitle();
  updateMapStatus();
}

async function requestNativeWindowsLocation(): Promise<boolean> {
  if (!desktopBridge?.requestWindowsLocation) return false;
  try {
    const result = await desktopBridge.requestWindowsLocation();
    const lat = Number(result?.lat);
    const lng = Number(result?.lng);
    if (result?.ok && Number.isFinite(lat) && Number.isFinite(lng)) {
      applyUserLocation({
        lat,
        lng,
        accuracy: result.accuracy,
        updatedAt: Date.now(),
        source: result.source || "windows-location",
      });
      focusMapIfVisible("user");
      return true;
    }
    state.geolocationState = "Windows belum memberi koordinat";
  } catch (err) {
    console.warn("[ITS Windows] native location failed:", err);
  }
  return false;
}

async function requestNetworkLocation(): Promise<boolean> {
  try {
    const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
    if (!res.ok) return false;
    const data = await res.json() as { latitude?: number; longitude?: number; city?: string };
    const lat = Number(data.latitude);
    const lng = Number(data.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    applyUserLocation({
      lat,
      lng,
      accuracy: 25_000,
      updatedAt: Date.now(),
      source: "network",
    });
    focusMapIfVisible("user");
    state.geolocationState = `lokasi jaringan aktif${data.city ? ` (${data.city})` : ""}`;
    renderTitle();
    updateMapStatus();
    return true;
  } catch (err) {
    console.warn("[ITS Windows] network location failed:", err);
    return false;
  }
}

function showLocationPromptIfNeeded(): void {
  if (!state.userLocation || Date.now() - state.userLocation.updatedAt > 120_000) {
    showLocationPrompt("Aplikasi akan meminta akses lokasi realtime user setiap dibuka.");
  }
}

function showLocationPrompt(message?: string): void {
  const host = document.querySelector<HTMLElement>("[data-location-consent]");
  if (!host) return;
  state.locationPromptOpen = true;
  host.hidden = false;
  host.classList.add("open");
  const text = host.querySelector<HTMLParagraphElement>("p");
  if (text && message) {
    text.textContent = `${message} Marker user, jarak POI, dan sinkronisasi Windows membutuhkan latitude/longitude terkini.`;
  }
}

function hideLocationPrompt(): void {
  const host = document.querySelector<HTMLElement>("[data-location-consent]");
  if (!host) return;
  state.locationPromptOpen = false;
  host.classList.remove("open");
  window.setTimeout(() => {
    if (!host.classList.contains("open")) host.hidden = true;
  }, 220);
}

function geolocationErrorText(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return "izin lokasi ditolak";
  if (err.code === err.POSITION_UNAVAILABLE) return "lokasi belum tersedia";
  if (err.code === err.TIMEOUT) return "mencari GPS";
  return "lokasi menunggu";
}

function focusMapIfVisible(focus: MapFocus): void {
  if (state.activeTab === "map") {
    focusFullMap(focus);
  }
}

function publishUserLocation(): void {
  const user = state.userLocation;
  if (!user || Date.now() - state.userPublishAt < 2500) return;
  state.userPublishAt = Date.now();
  const payload = {
    id: state.clientId,
    label: "ITS Maps Windows",
    platform: "windows",
    status: "online",
    updatedAt: Date.now(),
    position: { lat: user.lat, lng: user.lng },
    accuracy: user.accuracy || null,
  };
  void fetch(`${firebaseRootUrl()}/desktopClients/${encodeURIComponent(state.clientId)}.json`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn("[ITS Windows] user location publish failed:", err));
}

function firebaseRootUrl(): string {
  const url = state.config.snapshotUrl || FIREBASE_DEVICES_URL;
  return /\/devices\.json(?:\?|$)/.test(url) ? url.replace(/\/devices\.json(?:\?.*)?$/, "") : FIREBASE_ROOT_URL;
}

function selectActiveDevice(devices: DeviceRecord[]): DeviceRecord | null {
  if (!devices.length) return null;
  const current = devices.find((device) => device.id === state.device?.id);
  if (current) return current;
  return devices.find((device) => device.status === "online") || devices[0];
}

function setupSwipeClose(panel: HTMLElement, onClose: () => void, direction: "right" | "down"): void {
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let current = 0;
  panel.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, textarea, select")) return;
    startX = event.clientX;
    startY = event.clientY;
    current = 0;
    dragging = true;
    panel.classList.add("dragging");
    panel.setPointerCapture?.(event.pointerId);
  });
  panel.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    current = direction === "right" ? Math.max(0, dx) : Math.max(0, dy);
    if (current < 2) return;
    event.preventDefault();
    panel.style.transform = direction === "right" ? `translateX(${current}px)` : `translateY(${current}px)`;
  });
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove("dragging");
    if (current > 84) {
      panel.style.transform = direction === "right" ? "translateX(calc(100% + 22px))" : "translateY(calc(100% + 20px))";
      window.setTimeout(onClose, 130);
    } else {
      panel.style.transform = "";
    }
  };
  panel.addEventListener("pointerup", finish);
  panel.addEventListener("pointercancel", finish);
}

function normalizeVehicleBreakdown(raw: unknown): VehicleBreakdown | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const breakdown = {
    car: Math.max(0, Math.round(finiteNumber(record.car) ?? 0)),
    motorcycle: Math.max(0, Math.round(finiteNumber(record.motorcycle) ?? 0)),
    bus: Math.max(0, Math.round(finiteNumber(record.bus) ?? 0)),
    truck: Math.max(0, Math.round(finiteNumber(record.truck) ?? 0)),
    bicycle: Math.max(0, Math.round(finiteNumber(record.bicycle) ?? 0)),
    total: Math.max(0, Math.round(finiteNumber(record.total) ?? 0)),
  };
  const computed = breakdown.car + breakdown.motorcycle + breakdown.bus + breakdown.truck + breakdown.bicycle;
  breakdown.total = Math.max(breakdown.total, computed);
  return breakdown;
}

function normalizeDetections(raw: unknown): YoloDetection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const label = stringValue(record.label);
    const confidence = clamp(finiteNumber(record.confidence) ?? 0, 0, 1);
    const x = Math.max(0, finiteNumber(record.x) ?? 0);
    const y = Math.max(0, finiteNumber(record.y) ?? 0);
    const width = Math.max(0, finiteNumber(record.width) ?? 0);
    const height = Math.max(0, finiteNumber(record.height) ?? 0);
    if (!label || confidence <= 0 || width <= 0 || height <= 0) return [];
    const key = label.trim().toLowerCase();
    return [{ label, confidence, vehicle: typeof record.vehicle === "boolean" ? record.vehicle : VEHICLE_LABELS.has(key), x, y, width, height }];
  });
}

function normalizeCameraDataset(raw: unknown): TrafficCameraDataset | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const dataset = {
    snapshot1Url: stringValue(record.snapshot1Url)
      || stringValue(record.nama1)
      || stringValue(record.image1)
      || stringValue(record.imageUrl)
      || stringValue(record.snapshotUrl)
      || stringValue(record.thumbnailUrl),
    snapshot2Url: stringValue(record.snapshot2Url)
      || stringValue(record.nama2)
      || stringValue(record.image2),
    updatedAt: finiteNumber(record.updatedAt),
    source: stringValue(record.source),
    path: stringValue(record.path),
  };
  return dataset.snapshot1Url || dataset.snapshot2Url || dataset.updatedAt ? dataset : undefined;
}

function aiStatsForDevice(device: DeviceRecord | null): {
  breakdown: VehicleBreakdown;
  others: number;
  objectCount: number;
  otherSummary: string;
} {
  const fromDetections = vehicleBreakdownFromDetections(device?.detections || []);
  const source = device?.vehicleBreakdown;
  const breakdown = {
    car: Math.max(source?.car || 0, fromDetections.car),
    motorcycle: Math.max(source?.motorcycle || 0, fromDetections.motorcycle),
    bus: Math.max(source?.bus || 0, fromDetections.bus),
    truck: Math.max(source?.truck || 0, fromDetections.truck),
    bicycle: Math.max(source?.bicycle || 0, fromDetections.bicycle),
    total: 0,
  };
  breakdown.total = breakdown.car + breakdown.motorcycle + breakdown.bus + breakdown.truck + breakdown.bicycle;
  const objectCount = Math.max(device?.objectCount || 0, device?.detections?.length || 0, breakdown.total);
  const others = Math.max(0, objectCount - breakdown.total);
  const otherSummary = objectSummary(device?.detections || [], others);
  return { breakdown, others, objectCount, otherSummary };
}

function vehicleBreakdownFromDetections(detections: YoloDetection[]): VehicleBreakdown {
  const breakdown = { car: 0, motorcycle: 0, bus: 0, truck: 0, bicycle: 0, total: 0 };
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

function objectSummary(detections: YoloDetection[], fallbackOthers: number): string {
  const counts = new Map<string, number>();
  detections.forEach((det) => {
    const key = det.label.trim().toLowerCase();
    if (!key || VEHICLE_LABELS.has(key)) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const summary = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, count]) => `${label} ${count}`)
    .join(" / ");
  return summary || (fallbackOthers > 0 ? `Objek non-kendaraan ${fallbackOthers}` : "Belum ada objek lain");
}

function cameraStatusText(device: DeviceRecord | null): string {
  if (!device) return "menunggu sinkronisasi kamera";
  if (!deviceIsOnline(device)) {
    return `Raspberry offline - terakhir ${formatAge(device.lastSeen)}${device.lastSeenText ? ` (${device.lastSeenText})` : ""}`;
  }
  const url = publicCameraUrl(device) || publicCameraHlsUrl(device);
  if (url) {
    const host = cameraHostLabel(url);
    return host ? `stream ${host}` : "stream kamera aktif";
  }
  if (device.webrtcEnabled || device.cameraMode === "webrtc") return "WebRTC Firebase signaling";
  return "URL kamera belum dikirim Raspberry";
}

function aiStatusText(device: DeviceRecord | null): string {
  if (!device) return "menunggu data AI";
  const status = device.detectorStatus || "menunggu";
  const fps = device.detectorFps && device.detectorFps > 0 ? ` - ${device.detectorFps.toFixed(1)} FPS` : "";
  if (status === "disabled") return "YOLO offline siap by device";
  return `${status}${fps}`;
}

function publicCameraUrl(device: DeviceRecord | null): string {
  return usablePublicMediaUrl(device?.cameraUrl) || usablePublicMediaUrl(device?.webrtcUrl) || "";
}

function publicCameraHlsUrl(device: DeviceRecord | null): string {
  const explicit = usablePublicMediaUrl(device?.cameraHlsUrl);
  if (explicit) return explicit;
  const url = publicCameraUrl(device);
  return url && isLikelyHlsUrl(url) ? hlsPlaylistUrl(url) : "";
}

function latestCameraSnapshot(device: DeviceRecord | null): string {
  return device?.cameraThumbnailUrl?.trim()
    || device?.cameraDataset?.snapshot1Url?.trim()
    || device?.cameraDataset?.snapshot2Url?.trim()
    || "";
}

function hlsPlaylistUrl(url: string): string {
  const clean = url.trim();
  if (/\.m3u8(\?|$)/i.test(clean)) return clean;
  const [base, query = ""] = clean.split("?");
  const playlist = `${base.replace(/\/?$/, "/")}index.m3u8`;
  return query ? `${playlist}?${query}` : playlist;
}

function isLikelyHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\/cam\/?(\?|$)/i.test(url);
}

function isLikelyImageUrl(url: string): boolean {
  return /^data:image/i.test(url) || /\.(mjpg|mjpeg|jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function cameraSurfaceKey(device: DeviceRecord | null): string {
  const url = publicCameraHlsUrl(device) || publicCameraUrl(device) || device?.cameraThumbnailUrl || "";
  return `${device?.id || "none"}:${device?.status || "none"}:${device?.lastSeen || 0}:${device?.cameraMode || "auto"}:${device?.cameraDataset?.updatedAt || 0}:${url}`;
}

function deviceIsOnline(device: DeviceRecord | null): boolean {
  if (!device) return false;
  return device.status === "online" && device.lastSeen > 0 && Date.now() - device.lastSeen <= OFFLINE_AFTER_MS;
}

function cameraHostLabel(url: string): string {
  if (!url) return "";
  try {
    return new URL(url, window.location.href).hostname;
  } catch {
    return url.replace(/^https?:\/\//i, "").split("/")[0] || url;
  }
}

function userMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: "win-user-marker",
    html: `<div class="win-marker" style="--marker-color:var(--blue)"><div class="win-marker-core">${userIcon()}</div></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

function raspiMarkerIcon(device: DeviceRecord): L.DivIcon {
  const color = trafficColorFor(device);
  return L.divIcon({
    className: "win-traffic-marker",
    html: trafficLightSvg(color),
    iconSize: [34, 50],
    iconAnchor: [17, 45],
  });
}

function poiMarkerIcon(poi: PoiRecord): L.DivIcon {
  const visual = poiVisual(poi.kind);
  return L.divIcon({
    className: "win-poi-marker-icon",
    html: `<div class="win-poi-marker" style="--poi-color:${visual.color}">${escapeHtml(visual.label)}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function trafficLightSvg(color: TrafficColor): string {
  const active = color === "red" ? "#ff4d5c" : color === "yellow" ? "#ffd44d" : "#37dd86";
  const bulb = (name: TrafficColor, y: number) => {
    const lit = name === color;
    const fill = lit ? active : "#535b66";
    return `<circle cx="17" cy="${y}" r="5.7" fill="${fill}" opacity="${lit ? 1 : 0.44}"/>
      <circle cx="17" cy="${y}" r="2.3" fill="#fff" opacity="${lit ? 0.36 : 0.14}"/>`;
  };
  return `<svg viewBox="0 0 34 50" width="34" height="50" aria-hidden="true">
    <rect x="4" y="2" width="26" height="44" rx="6" fill="#111820" stroke="#ffffff" stroke-opacity=".72" stroke-width="1.2"/>
    ${bulb("red", 11.5)}
    ${bulb("yellow", 24)}
    ${bulb("green", 36.5)}
    <path d="M17 46v4" stroke="#111820" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}

function trafficColorFor(device: DeviceRecord): TrafficColor {
  return device.trafficColor || "red";
}

function vehicleCountFor(device: DeviceRecord): number {
  return Math.max(0, Math.round(device.vehicleCount ?? device.vehicleBreakdown?.total ?? 0));
}

function poiVisual(kind: string): { label: string; color: string } {
  const k = kind.toLowerCase();
  if (k.includes("hospital") || k.includes("clinic") || k.includes("pharmacy")) return { label: "+", color: "#ff4d5c" };
  if (k.includes("school") || k.includes("college") || k.includes("university")) return { label: "S", color: "#2d8cff" };
  if (k.includes("restaurant") || k.includes("cafe") || k.includes("food")) return { label: "F", color: "#ffd44d" };
  if (k.includes("park") || k.includes("garden")) return { label: "P", color: "#37dd86" };
  if (k.includes("station") || k.includes("transport")) return { label: "T", color: "#36d7ff" };
  if (k.includes("shop") || k.includes("mall") || k.includes("market")) return { label: "M", color: "#c084fc" };
  if (k.includes("parking")) return { label: "P", color: "#2d8cff" };
  return { label: "i", color: "#36d7ff" };
}

function poiDescription(kind: string, tags: Record<string, string>): string {
  const details = [
    tags.opening_hours ? `Jam buka: ${tags.opening_hours}` : "",
    tags.phone ? `Telepon: ${tags.phone}` : "",
    tags.website ? `Website: ${tags.website}` : "",
  ].filter(Boolean).join(" - ");
  return details || `POI ${kind} di sekitar viewport peta.`;
}

function distanceToPoi(poi: PoiRecord): string {
  const origin = state.userLocation || state.device?.position;
  if (!origin) return "-";
  const meters = haversineMeters(origin.lat, origin.lng, poi.lat, poi.lng);
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function locationLabel(device: DeviceRecord): string {
  return device.roadName || device.roadHint || device.label;
}

function coordinateText(pos: { lat: number; lng: number }): string {
  return `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
}

function locationStateLabel(location: UserLocation): string {
  return location.source === "network" ? "lokasi jaringan" : "lokasi aktif";
}

function finiteNumber(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function normalizeEpoch(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v < 1e11 ? v * 1000 : v;
}

function formatAge(v: number): string {
  const epoch = normalizeEpoch(v);
  if (epoch <= 0) return "-";
  const ms = Math.max(0, Date.now() - epoch);
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatAbsoluteTime(v: number): string {
  const epoch = normalizeEpoch(v);
  if (epoch <= 0) return "-";
  return new Date(epoch).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function stringValue(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180
    && !(Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001);
}

function objectRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? v as Record<string, unknown> : {};
}

function usablePublicMediaUrl(v: unknown): string | undefined {
  const value = stringValue(v);
  if (!value) return undefined;
  if (/^https?:\/\/(?:127\.0\.0\.1|0\.0\.0\.0|localhost)(?::|\/|$)/i.test(value)) return undefined;
  return value;
}

function isDeviceStatus(v: unknown): v is DeviceStatus {
  return v === "online" || v === "offline" || v === "degraded";
}

function isTrafficColor(v: unknown): v is TrafficColor {
  return v === "red" || v === "yellow" || v === "green";
}

function isCameraMode(v: unknown): v is CameraMode {
  return v === "webrtc" || v === "mjpeg";
}

function isTrafficLevel(v: unknown): v is "lancar" | "sedang" | "padat" {
  return v === "lancar" || v === "sedang" || v === "padat";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function validColor(value: string | undefined): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : "";
}

function hexToRgb(hex: string): RgbColor {
  const clean = validColor(hex) || "#2d8cff";
  const value = Number.parseInt(clean.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function escapeHtml(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setText(selector: string, value: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (el) el.textContent = value;
}

function clientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const id = `windows-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return `windows-${Date.now()}`;
  }
}

function loadTrafficHistory(): TrafficHistoryPoint[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrafficHistoryPoint[];
    return Array.isArray(parsed) ? parsed.filter((point) => point && Number.isFinite(point.at)) : [];
  } catch {
    return [];
  }
}

function saveTrafficHistory(history: TrafficHistoryPoint[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    console.warn("[ITS Windows] traffic history could not be persisted");
  }
}

function loadLastUserLocation(): UserLocation | null {
  try {
    const raw = localStorage.getItem(LAST_LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    return Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) ? parsed : null;
  } catch {
    return null;
  }
}

function saveLastUserLocation(location: UserLocation): void {
  try {
    localStorage.setItem(LAST_LOCATION_STORAGE_KEY, JSON.stringify(location));
  } catch {
    /* ignore */
  }
}

function loadKnownDevicePositions(): Record<string, { lat: number; lng: number; updatedAt: number }> {
  try {
    const raw = localStorage.getItem(LAST_DEVICE_POSITIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number; updatedAt: number }>;
    return Object.fromEntries(Object.entries(parsed).filter(([, pos]) => isValidCoordinate(pos.lat, pos.lng)));
  } catch {
    return {};
  }
}

function saveKnownDevicePosition(id: string, lat: number, lng: number): void {
  if (!id || !isValidCoordinate(lat, lng)) return;
  state.knownDevicePositions[id] = { lat, lng, updatedAt: Date.now() };
  try {
    localStorage.setItem(LAST_DEVICE_POSITIONS_STORAGE_KEY, JSON.stringify(state.knownDevicePositions));
  } catch {
    /* ignore */
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const earth = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bookIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5v-17Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 4.5A2.5 2.5 0 0 1 7.5 7H20M9 11h7M9 15h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function sparkleIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14ZM5.5 14l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7.7-1.6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function minimizeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function maximizeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.6" stroke="currentColor" stroke-width="1.8"/></svg>`;
}

function homeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function cameraIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" stroke-width="1.8"/><path d="m17 10 4-2v8l-4-2" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function chartIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h16M7 17V9m5 8V5m5 12v-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="m6.5 10 4-4 3.2 3.2L18.5 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function settingsIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.5a7.8 7.8 0 0 0 .05-3l2-1.5-2-3.4-2.4 1a8 8 0 0 0-2.6-1.5L12 2.5 9.55 5.1A8 8 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 .05 3l-2.05 1.55 2 3.4 2.45-1.05a8 8 0 0 0 2.5 1.45L12 21.5l2.45-2.65a8 8 0 0 0 2.5-1.45l2.45 1.05 2-3.4-2-1.55Z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/></svg>`;
}

function targetIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function licenseIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v5h5M8 13h8M8 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function cameraSmallIcon(): string {
  return `<svg viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6"/><path d="m14.5 8 3-1.5v7l-3-1.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function cameraLargeIcon(): string {
  return `<svg viewBox="0 0 48 48" fill="none" width="42" height="42" aria-hidden="true"><path d="M7 16a4 4 0 0 1 4-4h21a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4V16Z" stroke="currentColor" stroke-width="2.4"/><path d="m36 21 7-4v16l-7-4" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
}

function userIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="10" r="3.4" stroke="currentColor" stroke-width="1.8"/><path d="M5.5 20c.9-3.4 3.4-5.2 6.5-5.2s5.6 1.8 6.5 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function raspiSmallIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="3" width="8" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="7" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/></svg>`;
}

function playIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" fill="currentColor"/></svg>`;
}

function pauseIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6h3v12H8V6Zm5 0h3v12h-3V6Z" fill="currentColor"/></svg>`;
}

function fullscreenIcon(active: boolean): string {
  return active
    ? `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M20 15h-5v5M9 20v-5H4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function closeIcon(): string {
  return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
}
