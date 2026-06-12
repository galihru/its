import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import WIN_PREVIEW_WELCOME from "./windows/welcome.png";
import WIN_PREVIEW_OPTIONS from "./windows/pilihopsiinstaller.png";
import WIN_PREVIEW_DONE from "./windows/selesaiinstaller.png";
import ITS_APP_ICON from "./icon/its.png";

const APP_SCREENSHOT_MODULES = import.meta.glob("./ss/**/*.{png,jpg,jpeg,webp,avif,svg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const POI_ASSET_MODULES = import.meta.glob("./poi/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function poiAssetUrl(fileName: string): string {
  return Object.entries(POI_ASSET_MODULES).find(([path]) => path.endsWith(`/${fileName}`))?.[1] || ITS_APP_ICON;
}

function escapeMapServiceHtml(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

const FREE_MAP_SERVICE_STACK = [
  ["OpenStreetMap", "Data nama jalan, bangunan, POI, arah jalan, trotoar, dan koordinat. Lisensi data memakai ODbL dari OSMF.", "https://www.openstreetmap.org/copyright"],
  ["CARTO Voyager", "Basemap 2D raster tanpa API key berbayar di aplikasi. Tile berbasis data OpenStreetMap dan tetap memakai atribusi CARTO/OSM.", "https://carto.com/attributions"],
  ["Overpass API", "Query POI, bangunan bernama, jalan, arah jalan, dan fitur sekitar berdasarkan viewport. Tidak perlu API key, tetapi sebaiknya self-host bila trafik besar.", "https://overpass-api.de/"],
  ["OSRM Project", "Routing dan estimasi rute berbasis data OpenStreetMap. Untuk produksi/traffic besar bisa self-host OSRM sendiri; dokumentasi Node/API ada di link ini.", "https://project-osrm.org/docs/v26.6.1/nodejs/api"],
  ["MapLibre GL JS", "Renderer open-source untuk mode 3D/vector map tanpa vendor/API key berbayar.", "https://maplibre.org/"],
  ["OpenFreeMap", "Style/vector tile 3D gratis tanpa API key untuk bangunan dan orientasi visual.", "https://openfreemap.org/"],
  ["Leaflet", "Library open-source untuk peta 2D, marker, kontrol, dan interaksi touch/mouse.", "https://leafletjs.com/"],
  ["Esri World Imagery", "Mode satelit memakai tile publik tanpa API key di kode aplikasi. Jika ingin 100% self-hosted, ganti sumber ini dengan server imagery milik sendiri.", "https://www.esri.com/en-us/legal/terms/full-master-agreement"],
] as const;

function mapServiceStackHtml(): string {
  return FREE_MAP_SERVICE_STACK.map(([name, description, url]) => `
    <article>
      <strong>${escapeMapServiceHtml(name)}</strong>
      <p>${escapeMapServiceHtml(description)}</p>
      <a href="${escapeMapServiceHtml(url)}" target="_blank" rel="noopener">${escapeMapServiceHtml(url.replace(/^https?:\/\//, ""))}</a>
    </article>
  `).join("");
}


// ─── Type augmentation untuk leaflet-rotate ─────────────────────
declare module "leaflet" {
  interface Map {
    getBearing(): number;
    setBearing(bearing: number): void;
  }
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    rotateControl?: boolean | object;
  }
}

// ─── Types ──────────────────────────────────────────────────────

type DeviceStatus = "online" | "offline" | "degraded";
type CameraMode = "webrtc" | "mjpeg";
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
type ControllerUpdateInfo = {
  status?: "running" | "complete" | "error";
  stage?: string;
  message?: string;
  updatedAt?: number;
  source?: string;
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
  cameraDataset?: TrafficCameraDataset;
  cameraMode?: CameraMode;
  webrtcEnabled?: boolean;
  webrtcPath?: string;
  webrtcUrl?: string;
  cameraReady?: boolean;
  roadName?: string;
  roadHint?: string;
  trafficColor?: "red" | "yellow" | "green";
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
  detectorConfidence?: number;
  detectorOutputShape?: string;
  objectCount?: number;
  detections?: YoloDetection[];
  trafficSource?: string;
  gpioBackend?: string;
  gpioReady?: boolean;
  gpioNote?: string;
  update?: ControllerUpdateInfo;
  position: { lat: number; lng: number };
};

type SnapshotDevice = Partial<Omit<DeviceRecord, "position" | "lastSeen">> & {
  lastSeen?: number;
  position?: Partial<DeviceRecord["position"]> & { x?: number; y?: number };
};

type Snapshot = {
  updatedAt?: number;
  source?: string;
  devices?: SnapshotDevice[] | Record<string, SnapshotDevice>;
};
type AppConfig = { snapshotUrl?: string; refreshMs?: number };
type WebRtcStatus = "idle" | "connecting" | "live" | "failed";
type WebRtcRuntime = {
  pc: RTCPeerConnection | null;
  deviceId: string;
  signalPath: string;
  sessionId: string;
  stream: MediaStream | null;
  pollTimer: number;
  heartbeatTimer: number;
  candidateSeq: number;
  seenCameraCandidates: Set<string>;
  pendingCandidates: RTCIceCandidateInit[];
  sessionReady: boolean;
  startedAt: number;
  status: WebRtcStatus;
  message: string;
};
type WebRtcSessionRecord = {
  answer?: RTCSessionDescriptionInit;
  cameraCandidates?: Record<string, RTCIceCandidateInit>;
  streamerStatus?: string;
  streamerError?: string;
};
type BaseMapMode = "street" | "3d" | "satellite";
type TrafficColor = "red" | "yellow" | "green";
type NoticeKind = "info" | "success" | "warning" | "error";
type TrafficState = {
  color: TrafficColor;
  duration: number;
  phaseStartedAt: number;
  vehicleCount: number;
  roadName: string;
  recommendation: string;
  updatedAt: number;
};

type PoiKind = "hospital" | "mall" | "campus" | "parking" | "park" | "worship" | "school" | "office" | "restaurant" | "monument" | "terminal" | "station" | "shelter" | "cemetery" | "transport" | "other";

type PoiRecord = {
  id: string;
  kind: PoiKind;
  title: string;
  description: string;
  address: string;
  imageUrl: string;
  rating: string;
  icon: string;
  lat: number;
  lng: number;
};

type RoadGuideRecord = {
  id: string;
  name: string;
  ref: string;
  highway: string;
  oneway: boolean;
  hasSidewalk: boolean;
  hasMedian: boolean;
  treeLined: boolean;
  waterMedian: boolean;
  isRoundabout: boolean;
  lanes: number;
  surface: string;
  roadType: "expressway" | "avenue" | "street" | "service" | "foot";
  points: L.LatLng[];
};

type RailGuideRecord = {
  id: string;
  name: string;
  railway: string;
  points: L.LatLng[];
};

type CrossingGuideRecord = {
  id: string;
  name: string;
  latlng: L.LatLng;
  type: "rail" | "road";
};

type WaterGuideRecord = {
  id: string;
  name: string;
  waterway: string;
  points: L.LatLng[];
};

type GreenGuideRecord = {
  id: string;
  name: string;
  kind: string;
  points: L.LatLng[];
};

type RoadGuideBundle = {
  roads: RoadGuideRecord[];
  rails: RailGuideRecord[];
  crossings: CrossingGuideRecord[];
  waterways: WaterGuideRecord[];
  greens: GreenGuideRecord[];
};

type VisionFeatureKind = "road" | "sidewalk" | "vegetation" | "water" | "building";

type VisionFeatureRecord = {
  id: string;
  kind: VisionFeatureKind;
  latlng: L.LatLng;
  score: number;
  radius: number;
};

type CachedVisionFeature = {
  kind: VisionFeatureKind;
  lat: number;
  lng: number;
  score: number;
  radius: number;
};

type VisionFeatureCacheEntry = {
  key: string;
  createdAt: number;
  features: CachedVisionFeature[];
};

type SatelliteVisionCapture = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  zoom: number;
  pixelToLatLng: (x: number, y: number) => L.LatLng;
};

type VisionMaskData = {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
  channels: number;
};

type NativeLocationResult = {
  ok?: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  source?: string;
  error?: string;
};

type ItsDesktopBridge = {
  isElectron?: boolean;
  platform?: string;
  requestWindowsLocation?: () => Promise<NativeLocationResult>;
  openLocationSettings?: () => Promise<boolean>;
};

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<AppConfig> = {
  snapshotUrl: "./data/its-state.json",
  refreshMs: 5000,
};

// DEFAULT_CENTER — fallback jika tidak ada device. Akan di-override saat snapshot dimuat.
// User harus set ITS_LATITUDE & ITS_LONGITUDE di env var controller untuk lokasi yang tepat.
const DEFAULT_CENTER: L.LatLngExpression = [-6.180487, 106.90368];
const DEFAULT_ZOOM = 17;
const OFFLINE_AFTER_MS = 60_000;
const FIREBASE_DEVICES_URL =
  "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices.json";
const FIREBASE_ROOT_URL = FIREBASE_DEVICES_URL.replace(/\/devices\.json$/, "");
const WEBRTC_SIGNAL_ROOT = "webrtc/devices";
const WEBRTC_POLL_MS = 700;
const WEBRTC_HEARTBEAT_MS = 5_000;
const WEBRTC_ANSWER_TIMEOUT_MS = 18_000;
const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

const BEARING_STEP = 90;
const BEARING_SNAP = 5;
const MAPLIBRE_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MAPLIBRE_3D_PITCH = 66;
const VISION_SEGMENTATION_MODEL = "Xenova/segformer-b0-finetuned-ade-512-512";
const VISION_MIN_ZOOM = 16;
const VISION_CANVAS_SIZE = 512;
const VISION_FEATURE_CACHE_STORAGE_KEY = "its-map-vision-features:v2";
const VISION_FEATURE_CACHE_LIMIT = 54;
const VISION_FEATURE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 45;
const LAST_DEVICE_POSITIONS_STORAGE_KEY = "its-web-device-positions:v1";

// ─── DOM bootstrap ──────────────────────────────────────────────

function requiredElement<T extends Element>(selector: string, name: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${name}`);
  return el;
}

function staticRouteName(pathname: string): "document" | "new" | null {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized.endsWith("/document") || normalized.endsWith("/documentation")) return "document";
  if (normalized.endsWith("/new")) return "new";
  return null;
}

function escapeStaticHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function terminalStatic(commands: string[]): string {
  return `
    <div class="static-terminal" data-static-terminal>
      <div class="static-terminal-output" data-terminal-output>
        <div>ITS Maps terminal siap. Ketik <strong>help</strong> lalu Enter.</div>
        ${commands.map((command) => `<div><span>$</span> ${escapeStaticHtml(command)}</div>`).join("")}
      </div>
      <form class="static-terminal-form" data-terminal-form>
        <span>$</span>
        <input data-terminal-input autocomplete="off" spellcheck="false" aria-label="Terminal command" placeholder="help">
        <button type="submit">Run</button>
      </form>
      <div class="static-terminal-chips">
        ${["help", "npm run build", "npm run desktop:custom-installer", "firebase deploy", "open /new"].map((command) => `<button type="button" data-terminal-command="${escapeStaticHtml(command)}">${escapeStaticHtml(command)}</button>`).join("")}
      </div>
    </div>
  `;
}

function staticTerminalResponse(command: string): string[] {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) return ["Ketik command dulu, contoh: help"];
  if (normalized === "help") {
    return [
      "Command: npm ci, npm run dev, npm run build, npm run desktop:open, npm run desktop:custom-installer, firebase deploy.",
      "Command navigasi: open /documentation, open /document, open /new, open /.",
      "Command info: docs, structure, notifications, map, installer, clear.",
    ];
  }
  if (normalized === "clear") return ["__CLEAR__"];
  if (normalized === "docs") {
    return [
      "Dokumentasi mencakup website, PWA/native browser install, notifikasi publik, map Carto+OSM, modal download aplikasi, Windows Electron, service worker, Firebase, dan installer custom.",
    ];
  }
  if (normalized === "structure") {
    return [
      "web/src/main.ts: website, peta, PWA, notifikasi, dokumentasi, release notes, modal aplikasi.",
      "web/src/windows.ts: renderer Electron Windows.",
      "web/electron/main.cjs: window native, update, notification click, permissions.",
      "web/scripts/build-custom-windows-installer.ps1: build web, package Electron, publish .NET installer, copy artifact update.",
    ];
  }
  if (normalized === "notifications") {
    return [
      "Service worker: /sw.js.",
      "Payload push memakai data.url, lalu notificationclick membuka link tersebut.",
      "Fallback update publik membaca /app-update.json saat izin notifikasi sudah granted.",
    ];
  }
  if (normalized === "map") {
    return [
      "2D tile: CARTO Voyager.",
      "Data nama jalan/bangunan/POI: OSM melalui tile dan Overpass.",
      "3D: MapLibre/OpenFreeMap, satelit: Esri World Imagery.",
      "Lisensi dibuka dari tombol Lisensi Peta di attribution.",
    ];
  }
  if (normalized === "installer") {
    return [
      "Installer lokal: web/release/ITS-Maps-Windows-Custom-Setup-1.0.14-x64.exe.",
      "Update artifact: web/dist/artifacts/apps/ITS-Maps-Windows-Custom-Setup-1.0.14-x64.download.",
      "GitHub Actions workflow: Build Windows EXE.",
    ];
  }
  if (normalized === "npm ci") return ["Menginstal dependency sesuai package-lock.json...", "OK: dependency siap."];
  if (normalized === "npm run dev") return ["Vite dev server: http://localhost:5173", "Gunakan Ctrl+C di terminal asli untuk berhenti."];
  if (normalized === "npm run build") return ["tsc selesai.", "vite build selesai.", "Output: web/dist"];
  if (normalized === "npm run desktop:open") return ["Membuka Electron dengan renderer dari web/dist/desktop/renderer.html."];
  if (normalized === "npm run desktop:custom-installer") {
    return [
      "Build web assets...",
      "Package Electron app directory...",
      "Publish native custom setup...",
      "Custom setup ready: web/release/ITS-Maps-Windows-Custom-Setup-1.0.14-x64.exe",
    ];
  }
  if (normalized === "firebase deploy") return ["Deploy target: hosting:itstelkom", "Hosting URL: https://itstelkom.web.app"];
  if (normalized.startsWith("open ")) {
    const target = normalized.slice(5).trim();
    const safeTargets = new Set(["/", "/document", "/documentation", "/new"]);
    if (safeTargets.has(target)) {
      window.setTimeout(() => { window.location.href = target; }, 180);
      return [`Membuka ${target} ...`];
    }
    return [`Route ${target} tidak dikenal. Coba open /documentation atau open /new.`];
  }
  return [`Command tidak dikenal: ${normalized}`, "Ketik help untuk daftar command."];
}

function renderStaticSitePage(root: HTMLElement, route: "document" | "new"): void {
  document.body.classList.add("static-site-body");
  const isDocs = route === "document";
  document.title = isDocs ? "ITS Maps Documentation" : "What's New | ITS Maps";
  root.innerHTML = `
    <div class="static-splash" data-static-splash>
      <img src="/its.png" alt="ITS Maps">
    </div>
    <main class="static-page ${isDocs ? "doc-page" : "news-page"}">
      <aside class="static-sidebar">
        <a class="static-brand" href="/">
          <img src="/its.png" alt="">
          <span>ITS Maps</span>
        </a>
        <nav aria-label="${isDocs ? "Dokumentasi" : "Catatan pembaruan"}">
          ${(isDocs ? [
      ["Mulai", "#mulai"],
      ["Arsitektur", "#arsitektur"],
      ["Peta", "#peta"],
      ["Aplikasi", "#aplikasi"],
      ["Windows", "#windows"],
      ["Notifikasi", "#notifikasi"],
      ["Build", "#build"],
      ["Terminal", "#terminal"],
    ] : [
      ["Highlights", "#highlights"],
      ["Windows app", "#windows"],
      ["Website", "#website"],
      ["Fixed", "#fixed"],
      ["Terminal", "#terminal"],
    ]).map(([label, href]) => `<a href="${href}">${label}</a>`).join("")}
        </nav>
      </aside>
      <section class="static-content">
        ${isDocs ? docsPageHtml() : newsPageHtml()}
      </section>
      <button class="static-floating-terminal" type="button" data-open-static-terminal>Terminal</button>
      <section class="static-modal" data-static-modal hidden>
        <div class="static-modal-panel" data-static-modal-panel>
          <header>
            <strong>Terminal</strong>
            <button type="button" data-close-static-modal aria-label="Tutup">x</button>
          </header>
          ${terminalStatic(["cd web", "npm ci", "npm run dev", "npm run build", "npm run desktop:open"])}
        </div>
      </section>
    </main>
  `;
  bindStaticModal();
  window.setTimeout(() => {
    const splash = document.querySelector<HTMLElement>("[data-static-splash]");
    splash?.classList.add("hide");
    window.setTimeout(() => splash?.remove(), 220);
  }, 420);
}

function docsPageHtml(): string {
  return `
    <header class="static-hero" id="mulai">
      <span>Documentation</span>
      <h1>ITS Maps Windows</h1>
      <p>Dokumentasi teknis untuk website, PWA/native browser install, aplikasi Windows, peta Carto + data OSM, kamera realtime, notifikasi publik, dan installer update.</p>
    </header>
    <section class="static-section" id="arsitektur">
      <h2>Arsitektur</h2>
      <div class="static-card-grid">
        <article><strong>src/main.ts</strong><p>Website utama: Leaflet map, mobile sheet, POI Overpass, AR/camera sheet, route /document, /documentation, /new, service worker registration, public notification, modal download aplikasi, dan modal Lisensi Peta.</p></article>
        <article><strong>src/style.css</strong><p>Style website: splash putih, layout mobile/desktop, sheet swipeable, toolbar peta, carousel preview aplikasi, dokumentasi, dan terminal interaktif.</p></article>
        <article><strong>src/windows.ts</strong><p>Renderer Electron: Home, Peta, Kamera, Statistics, Setting, History, Documentation, What's New, titlebar custom, dan integrasi update status dari main process.</p></article>
        <article><strong>src/windows.css</strong><p>Style aplikasi Windows: warna Windows/accent, panel kanan, sheet, titlebar, map, kamera, dokumentasi, lisensi, dan terminal panel.</p></article>
        <article><strong>electron/main.cjs</strong><p>Native window, splash awal, auto-update, permission lokasi/media/notifikasi, dan klik notifikasi.</p></article>
        <article><strong>public/sw.js</strong><p>Cache offline, push notification, dan routing saat notifikasi ditekan.</p></article>
        <article><strong>scripts/build-custom-windows-installer.ps1</strong><p>Build web, package Electron, publish uninstaller .NET, zip payload aplikasi, publish custom setup, dan copy artifact .download untuk update.</p></article>
        <article><strong>src/ss</strong><p>Folder screenshot preview aplikasi. Gambar baru di subfolder windows atau mobile otomatis masuk carousel melalui import.meta.glob.</p></article>
      </div>
    </section>
    <section class="static-section" id="peta">
      <h2>Peta</h2>
      <p>Mode 2D memakai CARTO Voyager agar tampilan lebih bersih dan tidak terlalu mentah seperti OSM default. Data nama jalan, nama bangunan, area, dan POI tetap berasal dari OpenStreetMap serta Overpass API. Mode 3D memakai MapLibre/OpenFreeMap, sedangkan satelit memakai Esri World Imagery.</p>
      <div class="static-doc-list">
        <article><strong>Lisensi Peta</strong><span>Attribution bawah peta diganti menjadi tombol Lisensi Peta. Saat dibuka, modal menjelaskan OSM, CARTO, Overpass, Esri, dan MapLibre/OpenFreeMap.</span></article>
        <article><strong>POI viewport</strong><span>POI diambil berdasarkan bounds peta, diberi prioritas Indonesia, lalu marker disusun ulang ketika peta bergerak.</span></article>
        <article><strong>Mobile ITS sheet</strong><span>Ketika sheet ITS aktif, tinggi peta, tombol zoom, home, lokasi, dan tombol aplikasi mengikuti offset sheet agar tidak tertutup.</span></article>
      </div>
    </section>
    <section class="static-section" id="aplikasi">
      <h2>Modal Aplikasi</h2>
      <p>Tombol download menyesuaikan device: Windows menampilkan .exe, Android menampilkan .apk, dan iOS menampilkan .app/PWA guidance. Desktop membuka panel kanan agar peta menyusut dengan animasi; mobile membuka bottom sheet yang bisa di-swipe turun.</p>
      <div class="static-doc-list">
        <article><strong>Ringkasan</strong><span>Icon aplikasi, nama, versi, carousel preview, deskripsi singkat, tombol Download, dan menu detail.</span></article>
        <article><strong>Detail</strong><span>Tombol kembali, icon aplikasi, nama, versi, deskripsi panjang, serta daftar akses aplikasi dan alasan penggunaannya.</span></article>
        <article><strong>Preview otomatis</strong><span>Screenshot dibaca dari web/src/ss/windows dan web/src/ss/mobile. Tambahkan gambar baru di folder itu tanpa mengubah kode.</span></article>
      </div>
    </section>
    <section class="static-section" id="windows">
      <h2>Windows App</h2>
      <p>Aplikasi Windows adalah renderer Electron yang memakai data Firebase realtime, kamera HLS/WebRTC, map Carto/3D/satelit, panel history, panel pembaruan, dokumentasi, dan auto-update via custom setup.</p>
      <div class="static-doc-list">
        <article><strong>Titlebar</strong><span>Ikon dokumentasi, update, minimize, maximize, close, dan tooltip disediakan di titlebar custom.</span></article>
        <article><strong>Splash</strong><span>Splash putih sederhana dan durasi mengikuti kesiapan data, mirip aplikasi desktop modern.</span></article>
        <article><strong>Installer</strong><span>File .exe dibuat oleh PowerShell builder dan artifact .download dipakai website serta auto-update.</span></article>
      </div>
    </section>
    <section class="static-section" id="notifikasi">
      <h2>Notifikasi Publik</h2>
      <p>Website mendaftarkan service worker, meminta izin notifikasi, dan service worker siap menerima push event. Saat notifikasi ditekan, link tujuan dari payload dibuka dengan benar, misalnya /new untuk catatan pembaruan.</p>
      <button class="static-action" type="button" data-enable-notifications>Aktifkan notifikasi</button>
    </section>
    <section class="static-section" id="build">
      <h2>Build & Deploy</h2>
      <p>Build web memakai TypeScript dan Vite. Build Windows custom menjalankan build web, packaging Electron, publish .NET installer/uninstaller, lalu menyiapkan artifact update. Firebase deploy memakai folder web/dist sebagai hosting live.</p>
      <div class="static-doc-list">
        <article><strong>Local web</strong><span>npm run build menghasilkan web/dist dan bisa dicek dengan npm run preview.</span></article>
        <article><strong>Local Windows</strong><span>npm run desktop:custom-installer menghasilkan web/release/ITS-Maps-Windows-Custom-Setup-1.0.14-x64.exe.</span></article>
        <article><strong>GitHub</strong><span>Workflow Build Windows EXE berjalan otomatis setelah branch dipush dan mengupload artifact installer.</span></article>
      </div>
    </section>
    <section class="static-section" id="terminal">
      <h2>Terminal</h2>
      ${terminalStatic(["cd web", "npm ci", "npm run dev", "npm run build", "npm run desktop:custom-installer"])}
    </section>
  `;
}

function newsPageHtml(): string {
  return `
    <header class="static-hero" id="highlights">
      <span>What's New</span>
      <h1>ITS Maps 1.0.14</h1>
      <p>Catatan pembaruan untuk UI Windows, website, notifikasi, dokumentasi, dan workflow build.</p>
    </header>
    <section class="static-release" id="windows">
      <h2>Windows app</h2>
      <article><span>New</span><strong>Titlebar custom dengan dokumentasi</strong><p>Ikon buku, tombol pembaruan, minimize, maximize, close, dan tooltip berada di area titlebar.</p></article>
      <article><span>Changed</span><strong>Splash lebih sederhana</strong><p>Logo berada di tengah, warna mengikuti gaya Windows, dan durasi mengikuti data yang dimuat.</p></article>
      <article><span>Changed</span><strong>Kontrol peta lebih ringkas</strong><p>Pitch peta dipadatkan menjadi 2D dan 3D agar layar tidak penuh tombol.</p></article>
    </section>
    <section class="static-release" id="website">
      <h2>Website</h2>
      <article><span>New</span><strong>/documentation dan /new</strong><p>Halaman dokumentasi dan release notes bisa dibuka langsung dari web maupun Windows app.</p></article>
      <article><span>New</span><strong>Push notification ready</strong><p>Service worker dapat menampilkan push notification publik dan membuka URL payload saat diklik.</p></article>
    </section>
    <section class="static-release" id="fixed">
      <h2>Fixed</h2>
      <article><span>Fixed</span><strong>Workflow GitHub Pages</strong><p>Path build disesuaikan dengan struktur repo saat ini supaya tidak mencari folder yang salah.</p></article>
    </section>
    <section class="static-section" id="terminal">
      <h2>Terminal</h2>
      ${terminalStatic(["cd web", "npm run build", "npm run desktop:open"])}
    </section>
  `;
}

function bindStaticModal(): void {
  const modal = document.querySelector<HTMLElement>("[data-static-modal]");
  const panel = document.querySelector<HTMLElement>("[data-static-modal-panel]");
  const close = () => {
    if (!modal || !panel) return;
    modal.classList.remove("open");
    window.setTimeout(() => { modal.hidden = true; panel.style.transform = ""; }, 180);
  };
  document.querySelector<HTMLButtonElement>("[data-open-static-terminal]")?.addEventListener("click", () => {
    if (!modal) return;
    modal.hidden = false;
    window.setTimeout(() => modal.classList.add("open"), 20);
  });
  document.querySelector<HTMLButtonElement>("[data-close-static-modal]")?.addEventListener("click", close);
  document.querySelector<HTMLButtonElement>("[data-enable-notifications]")?.addEventListener("click", requestPublicNotificationPermission);
  bindStaticTerminals();
  if (!panel) return;
  let startX = 0;
  let startY = 0;
  let current = 0;
  let dragging = false;
  panel.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a")) return;
    startX = event.clientX;
    startY = event.clientY;
    current = 0;
    dragging = true;
    panel.setPointerCapture?.(event.pointerId);
  });
  panel.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const desktop = window.matchMedia("(min-width: 760px)").matches;
    current = desktop ? Math.max(0, event.clientX - startX) : Math.max(0, event.clientY - startY);
    if (current < 2) return;
    event.preventDefault();
    panel.style.transform = desktop ? `translateX(${current}px)` : `translateY(${current}px)`;
  });
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    if (current > 84) close();
    else panel.style.transform = "";
  };
  panel.addEventListener("pointerup", finish);
  panel.addEventListener("pointercancel", finish);
}

function bindStaticTerminals(): void {
  document.querySelectorAll<HTMLElement>("[data-static-terminal]").forEach((terminal) => {
    const output = terminal.querySelector<HTMLElement>("[data-terminal-output]");
    const form = terminal.querySelector<HTMLFormElement>("[data-terminal-form]");
    const input = terminal.querySelector<HTMLInputElement>("[data-terminal-input]");
    if (!output || !form || !input || terminal.dataset.bound === "true") return;
    terminal.dataset.bound = "true";
    const append = (line: string, kind = "") => {
      if (line === "__CLEAR__") {
        output.innerHTML = "";
        return;
      }
      const row = document.createElement("div");
      if (kind) row.className = kind;
      row.textContent = line;
      output.appendChild(row);
      output.scrollTop = output.scrollHeight;
    };
    const run = (command: string) => {
      const value = command.trim();
      append(`$ ${value}`, "static-terminal-command");
      staticTerminalResponse(value).forEach((line) => append(line));
      input.value = "";
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run(input.value);
    });
    terminal.querySelectorAll<HTMLButtonElement>("[data-terminal-command]").forEach((button) => {
      button.addEventListener("click", () => run(button.dataset.terminalCommand || ""));
    });
  });
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element.");
const staticRoute = staticRouteName(window.location.pathname);
const desktopBridge = (window as Window & { itsDesktop?: ItsDesktopBridge }).itsDesktop;
let itsInitialDataReady = false;
let itsMapReady = false;
if (staticRoute) {
  renderStaticSitePage(app, staticRoute);
} else {
app.innerHTML = `<div id="map" class="map" aria-label="Raspberry Pi realtime map"></div>`;
const mapRoot = requiredElement<HTMLDivElement>("#map", "map");

// ─── Map init ───────────────────────────────────────────────────

const map = L.map(mapRoot, {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  zoomControl: false,
  preferCanvas: true,
  rotate: true,
  bearing: 0,
  touchRotate: true,
  rotateControl: false,
});

map.whenReady(() => {
  itsMapReady = true;
  window.dispatchEvent(new CustomEvent("its:map-ready"));
});

// ─── State ──────────────────────────────────────────────────────

const state = {
  config: DEFAULT_CONFIG,
  device: null as DeviceRecord | null,
  devices: [] as DeviceRecord[],
  knownDevicePositions: loadKnownDevicePositions(),
  snapshotCache: new Map<string, TrafficCameraDataset>(),
  splashReady: false,
  refreshTimer: 0,
  refreshBusy: false,
  hasCentered: false,
  baseMode: "street" as BaseMapMode,
  compassNeedle: null as SVGGElement | null,
  compassBtn: null as HTMLButtonElement | null,
  cameraPreview: null as HTMLDivElement | null,
  cameraButton: null as HTMLButtonElement | null,
  markers: new Map<string, L.Marker>(),
  poiMarkers: new Map<string, L.Marker>(),
  poiData: new Map<string, PoiRecord>(),
  trafficById: new Map<string, TrafficState>(),
  roadNameById: new Map<string, string>(),
  maplibreMap: null as any,
  maplibreContainer: null as HTMLDivElement | null,
  maplibreSyncing: false,
  // Tablet / routing helpers
  vehicleMarker: null as L.Marker | null,
  tabletCategoryIndex: null as number | null,
  tabletSearchQuery: "",
  routeLayer: null as L.LayerGroup | null,
  destinationMarker: null as L.Marker | null,
  userLocationWatchId: null as number | null,
  nativeLocationPollTimer: 0,
  activeModalDeviceId: null as string | null,
  activeModalPoiId: null as string | null,
  trafficRefreshTimer: 0,
  offlineReported: new Set<string>(),
  overpassLayer: null as L.LayerGroup | null,
  roadGuideLayer: null as L.LayerGroup | null,
  visionLayer: null as L.LayerGroup | null,
  modeControl: null as L.Control | null,
  routeRequestSeq: 0,
  prevPositionById: new Map<string, L.LatLng>(),
  lastUpdateNoticeKey: "",
  notificationPromptShown: false,
  webrtc: {
    pc: null,
    deviceId: "",
    signalPath: "",
    sessionId: "",
    stream: null,
    pollTimer: 0,
    heartbeatTimer: 0,
    candidateSeq: 0,
    seenCameraCandidates: new Set<string>(),
    pendingCandidates: [],
    sessionReady: false,
    startedAt: 0,
    status: "idle",
    message: "",
  } as WebRtcRuntime,
};

// ─── Tile layers ────────────────────────────────────────────────

const CARTO_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const CARTO_ATTRIBUTION = '<button type="button" class="map-license-link" data-map-license>Lisensi Peta</button>';

const streetLayer = L.tileLayer(CARTO_TILE_URL, {
  maxZoom: 20,
  subdomains: "abcd",
  className: "its-carto-map-tile",
  attribution: CARTO_ATTRIBUTION,
} as L.TileLayerOptions & { className: string; subdomains: string }).addTo(map);

const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 20, attribution: "" },
);

if (map.attributionControl) {
  try { map.attributionControl.setPrefix("ITS Maps"); } catch { /* ignore */ }
}

// Add Overpass vector layer for clickable features (kept separate from POI markers)
state.overpassLayer = L.layerGroup().addTo(map);
state.roadGuideLayer = L.layerGroup().addTo(map);
state.visionLayer = L.layerGroup().addTo(map);

function applySharedLocationFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!isValidCoordinate(lat, lng)) return;
  const zoom = clamp(Number(params.get("z")) || DEFAULT_ZOOM, 12, 20);
  const title = params.get("place") || "Lokasi dibagikan";
  const latlng = L.latLng(lat, lng);
  map.setView(latlng, zoom, { animate: false });
  L.circleMarker(latlng, {
    radius: 7,
    color: "#2563eb",
    weight: 2,
    fillColor: "#ffffff",
    fillOpacity: 0.9,
  }).addTo(map).bindPopup(escapeHtml(title)).openPopup();
}

map.whenReady(applySharedLocationFromUrl);

// ─── Scale Control ──────────────────────────────────────────────
// Custom scale ruler yang dinamis sesuai zoom level
const ScaleControl = L.Control.extend({
  options: { position: "bottomleft" },
  onAdd(): HTMLElement {
    const container = L.DomUtil.create("div", "map-scale-control");
    const updateScale = () => {
      const bounds = map.getBounds();
      const maxMeters = bounds.getNorthEast().distanceTo(bounds.getSouthWest()) / 2;
      let dist: string, unit = "m";
      if (maxMeters > 1000) {
        dist = (maxMeters / 1000).toFixed(1);
        unit = "km";
      } else {
        dist = Math.round(maxMeters).toString();
      }
      container.innerHTML = `<div class="scale-label">≈ ${dist} ${unit}</div>`;
    };
    map.on("moveend zoomend", updateScale);
    updateScale();
    return container;
  },
});
new ScaleControl().addTo(map);

// ─── POI Layer ─────────────────────────────────────────────────────

const POI_LIBRARY: Record<PoiKind, {
  rating: string;
  imageUrl: string;
  description: string;
}> = {
  hospital: {
    rating: "4.7",
    imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80",
    description: "Layanan kesehatan dengan akses darurat, IGD, dan area parkir pasien.",
  },
  mall: {
    rating: "4.5",
    imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80",
    description: "Area belanja, restoran, dan fasilitas publik yang ramai di jam sibuk.",
  },
  campus: {
    rating: "4.8",
    imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=80",
    description: "Area pendidikan dengan gedung perkuliahan, kantor akademik, dan akses pejalan kaki.",
  },
  parking: {
    rating: "4.2",
    imageUrl: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=900&q=80",
    description: "Zona parkir kendaraan dengan akses masuk-keluar yang terkontrol.",
  },
  park: {
    rating: "4.6",
    imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80",
    description: "Ruang hijau untuk istirahat, jalan santai, dan titik orientasi di peta.",
  },
  worship: {
    rating: "4.7",
    imageUrl: "https://images.unsplash.com/photo-1514222497938-d0edb2e47c23?auto=format&fit=crop&w=900&q=80",
    description: "Tempat ibadah dan pusat kegiatan keagamaan di sekitar lokasi.",
  },
  school: {
    rating: "4.4",
    imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80",
    description: "Fasilitas pendidikan seperti sekolah dasar, menengah, dan setara.",
  },
  office: {
    rating: "4.1",
    imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
    description: "Bangunan kantor, administrasi, dan fasilitas kerja.",
  },
  restaurant: {
    rating: "4.3",
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80",
    description: "Tempat makan, kafe, atau layanan kuliner di area sekitar.",
  },
  terminal: {
    rating: "4.0",
    imageUrl: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=900&q=80",
    description: "Terminal transportasi dengan akses angkutan dan titik naik-turun penumpang.",
  },
  station: {
    rating: "4.1",
    imageUrl: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80",
    description: "Stasiun transportasi untuk transit dan perjalanan lanjutan.",
  },
  shelter: {
    rating: "4.0",
    imageUrl: "https://images.unsplash.com/photo-1528928716400-4a2f2f6df4fc?auto=format&fit=crop&w=900&q=80",
    description: "Shelter atau halte untuk tunggu kendaraan umum.",
  },
  cemetery: {
    rating: "4.0",
    imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80",
    description: "Area pemakaman atau kuburan terdekat.",
  },
  transport: {
    rating: "4.0",
    imageUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=80",
    description: "Titik transportasi umum di sekitar lokasi.",
  },
  monument: {
    rating: "4.2",
    imageUrl: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80",
    description: "Landmark, monumen, atau penanda sejarah yang mudah dikenali.",
  },
  other: {
    rating: "4.0",
    imageUrl: "https://images.unsplash.com/photo-1524429656589-6633a470097c?auto=format&fit=crop&w=900&q=80",
    description: "Titik orientasi umum di peta.",
  },
};

const POI_VISUALS: Record<PoiKind, { icon: string; color: string }> = {
  hospital: { icon: "RS", color: "#e5484d" },
  mall: { icon: "Mall", color: "#7c3aed" },
  campus: { icon: "Edu", color: "#2563eb" },
  parking: { icon: "P", color: "#64748b" },
  park: { icon: "Park", color: "#16a34a" },
  worship: { icon: "Ibd", color: "#d97706" },
  school: { icon: "Sch", color: "#0f6cbd" },
  office: { icon: "Off", color: "#0f766e" },
  restaurant: { icon: "Eat", color: "#e11d48" },
  terminal: { icon: "Bus", color: "#0f766e" },
  station: { icon: "Rail", color: "#2563eb" },
  shelter: { icon: "Stop", color: "#0284c7" },
  cemetery: { icon: "Cem", color: "#64748b" },
  transport: { icon: "Bus", color: "#0284c7" },
  monument: { icon: "Mon", color: "#a16207" },
  other: { icon: "POI", color: "#475569" },
};

const POI_SPRITES: Partial<Record<PoiKind, { image: string; x: number; y: number }>> = {
  worship: { image: poiAssetUrl("poi5.png"), x: 0, y: 52 },
  monument: { image: poiAssetUrl("monas.png"), x: 50, y: 50 },
  park: { image: poiAssetUrl("tamanminiindonesia.png"), x: 50, y: 50 },
  campus: { image: poiAssetUrl("poi1.png"), x: 0, y: 52 },
  school: { image: poiAssetUrl("poi1.png"), x: 0, y: 52 },
  station: { image: poiAssetUrl("poi3.png"), x: 50, y: 52 },
  terminal: { image: poiAssetUrl("poi3.png"), x: 50, y: 52 },
  transport: { image: poiAssetUrl("poi3.png"), x: 50, y: 52 },
};

const POI_HERO_BY_KIND: Partial<Record<PoiKind, string>> = {
  worship: poiAssetUrl("poi5.png"),
  monument: poiAssetUrl("monas.png"),
  park: poiAssetUrl("tamanminiindonesia.png"),
  campus: poiAssetUrl("gedungsate.png"),
  school: poiAssetUrl("poi1.png"),
  station: poiAssetUrl("poi3.png"),
  terminal: poiAssetUrl("poi3.png"),
  transport: poiAssetUrl("poi3.png"),
};

function customPoiImageForTags(tags: Record<string, string>, kind: PoiKind): string {
  const name = `${tags.name || ""} ${tags["name:id"] || ""}`.toLowerCase();
  if (name.includes("monas") || name.includes("monumen nasional")) return poiAssetUrl("monas.png");
  if (name.includes("gedung sate")) return poiAssetUrl("gedungsate.png");
  if (name.includes("taman mini")) return poiAssetUrl("tamanminiindonesia.png");
  if (name.includes("konferensi asia afrika") || name.includes("kaa")) return poiAssetUrl("musium kaa.png");
  if (name.includes("alun-alun") || name.includes("alun alun")) return poiAssetUrl("alunalunbandung.png");
  if (name.includes("prj") || name.includes("jakarta international expo")) return poiAssetUrl("monumenPRJB.png");
  return POI_HERO_BY_KIND[kind] || ITS_APP_ICON;
}

function classifyPoiKind(tags: Record<string, string>): PoiKind {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  if (amenity === "hospital" || tags.healthcare === "hospital" || tags.healthcare === "clinic" || tags.healthcare === "doctor") return "hospital";
  if (amenity === "place_of_worship" || tags.religion) return "worship";
  if (amenity === "school" || amenity === "kindergarten" || tags.education === "school" || tags.building === "school") return "school";
  if (amenity === "university" || amenity === "college" || tourism === "university" || tags.building === "university") return "campus";
  if (amenity === "restaurant" || amenity === "cafe" || amenity === "fast_food") return "restaurant";
  if (amenity === "parking" || tags.parking) return "parking";
  if (amenity === "bus_station" || amenity === "ferry_terminal" || amenity === "terminal") return "terminal";
  if (tags.railway === "station" || tags.public_transport === "station") return "station";
  if (amenity === "bus_stop" || tags.highway === "bus_stop" || tags.public_transport === "platform") return "shelter";
  if (amenity === "grave_yard" || tags.landuse === "cemetery") return "cemetery";
  if (amenity === "public_transport" || tags.public_transport) return "transport";
  if (amenity === "office" || tags.office || tags.craft || tags.man_made) return "office";
  if (tags.shop) return "mall";
  if (tags.historic === "monument" || tourism === "attraction" || tags.building === "monument" || tags.tourism === "museum") return "monument";
  if (tags.leisure === "park" || tags.landuse === "grass" || tags.place === "neighbourhood" || tags.place === "suburb") return "park";
  return "other";
}

function poiVisual(kind: PoiKind): { icon: string; color: string } {
  return POI_VISUALS[kind] || POI_VISUALS.other;
}

function poiMarkerSizeByZoom(): number {
  const zoom = map.getZoom();
  return clamp(18 + (zoom - 13) * 1.6, 18, 34);
}

function makePoiIcon(poi: PoiRecord, size: number): L.DivIcon {
  const visual = poiVisual(poi.kind);
  const sprite = POI_SPRITES[poi.kind];
  const width = Math.max(size + 16, 24 + visual.icon.length * 5);
  const spriteHtml = sprite
    ? `<span class="poi-marker-sprite" style="--poi-sprite:url('${escapeHtml(sprite.image)}'); --poi-sprite-x:${sprite.x}%; --poi-sprite-y:${sprite.y}%;"></span>`
    : "";
  return L.divIcon({
    className: "poi-marker-icon",
    html: `<div class="poi-marker ${sprite ? "poi-marker-custom" : ""} poi-kind-${poi.kind}" data-kind="${poi.kind}" title="${escapeHtml(poi.title)}" style="--poi-accent:${visual.color}; --poi-size:${size}px; --poi-width:${width}px;">
    ${spriteHtml}
    <span class="poi-marker-glyph">${escapeHtml(visual.icon)}</span>
  </div>`,
    iconSize: [width, size + 10],
    iconAnchor: [Math.round(width / 2), Math.round((size + 10) / 2)],
  });
}

function renderPoiModal(poi: PoiRecord): string {
  const visual = poiVisual(poi.kind);
  return `
  <div class="sheet-panel-header poi-panel-header">
    <button class="sheet-icon-btn modal-close" data-action="close" aria-label="Kembali" title="Kembali">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <div class="sheet-title-cluster">
      <div class="sheet-place-icon" style="--poi-accent:${visual.color};">${escapeHtml(poi.icon)}</div>
      <div class="sheet-title-copy">
        <h2 class="modal-title">${escapeHtml(poi.title)}</h2>
        <p>${escapeHtml(poi.kind)}${poi.address ? ` · ${escapeHtml(poi.address)}` : ""}</p>
      </div>
    </div>
    <div class="sheet-header-actions">
      <button class="sheet-icon-btn btn-share" data-action="share" aria-label="Bagikan lokasi" title="Bagikan">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 1.2 2.4L8.8 10.1a3 3 0 1 0 0 3.8l7.4 3.7A3 3 0 1 0 17 16a2.9 2.9 0 0 0-.8.1l-7.4-3.7a3 3 0 0 0 0-.8l7.4-3.7A2.9 2.9 0 0 0 18 8Z"/></svg>
      </button>
      <button class="sheet-icon-btn btn-start" data-action="start" aria-label="Mulai rute" title="Rute">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 19-7-4-7 4 7-19Z"/></svg>
      </button>
      <button class="sheet-icon-btn btn-camera" data-action="camera" aria-label="Buka kamera AR" title="Kamera">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.6-2h6.8L17 8h3v10H4V8Zm8 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/></svg>
      </button>
    </div>
  </div>
  <div class="modal-header poi-modal-header">
    <button class="modal-close" data-action="close">×</button>
    <h2 class="modal-title">${escapeHtml(poi.title)}</h2>
    <div class="poi-actions">
      <button class="btn-share" data-action="share">Share</button>
      <button class="btn-start" data-action="start">Pergi</button>
    </div>
  </div>
  <div class="modal-content poi-modal-content">
    <div class="poi-hero">
      <img class="poi-hero-image ${poi.imageUrl === ITS_APP_ICON ? "poi-hero-image-contained" : ""}" src="${escapeHtml(poi.imageUrl)}" alt="${escapeHtml(poi.title)}">
      <div class="poi-hero-overlay">
        <span class="poi-badge">${escapeHtml(poi.kind.toUpperCase())}</span>
        <span class="poi-rating">★ ${escapeHtml(poi.rating)}</span>
      </div>
    </div>
    <div class="poi-summary">
      <div class="poi-icon-large">${poi.icon}</div>
      <div>
        <div class="poi-title">${escapeHtml(poi.title)}</div>
        <div class="poi-address">${escapeHtml(poi.address)}</div>
        <div class="poi-meta"><span data-field="poi-distance">-</span> • <span data-field="poi-eta">-</span></div>
      </div>
    </div>
    <div class="poi-description">${escapeHtml(poi.description)}</div>
    <div class="poi-route-summary" data-field="poi-route"></div>
    <div class="info-row"><span class="label">Kategori</span><span class="value">${escapeHtml(poi.kind)}</span></div>
    <div class="info-row"><span class="label">Koordinat</span><span class="value">${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}</span></div>
  </div>`;
}

function openPoiModal(poi: PoiRecord): void {
  closeModal(false);
  closePromptPanels();
  state.activeModalPoiId = poi.id;
  const overlay = createSwipeableSheetModal(
    "m-poi-modal",
    "m-poi-sheet m-device-sheet",
    `
    <div class="m-sheet-handle-bar"></div>
    ${renderPoiModal(poi)}
  `,
  );
  overlay.querySelector(".m-layer-backdrop")!.addEventListener("click", () => closeModal());
  const sheet = overlay.querySelector<HTMLElement>(".m-poi-sheet");
  if (!sheet) return;
  setupSheetSwipe(sheet, closeModal);
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", () => closeModal());

  // Wire up share and start buttons and populate distance/ETA + image
  const shareBtn = sheet.querySelector<HTMLButtonElement>(".btn-share");
  const startBtn = sheet.querySelector<HTMLButtonElement>(".btn-start");
  const cameraBtn = sheet.querySelector<HTMLButtonElement>(".btn-camera");
  shareBtn?.addEventListener("click", async () => {
    const url = appPlaceUrl(poi.lat, poi.lng, poi.title);
    try {
      if ((navigator as any).share) {
        await (navigator as any).share({ title: poi.title, text: poi.description || poi.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Link lokasi disalin ke clipboard");
      }
    } catch (err) { console.warn(err); }
  });
  startBtn?.addEventListener("click", async () => {
    // Start navigation: draw route and if mobile open AR camera view
    void setDestinationToPoi(poi);
    if (isMobile()) {
      openARCameraSheet(poi);
    }
  });
  cameraBtn?.addEventListener("click", () => openARCameraSheet(poi));

  // Compute distance/ETA via OSRM. Image source stays from POI data/library so it
  // remains deterministic in desktop and mobile previews.
  const heroImg = sheet.querySelector<HTMLImageElement>(".poi-hero-image");
  if (heroImg) {
    heroImg.onerror = () => {
      heroImg.src = ITS_APP_ICON;
    };
  }

  const distanceEl = sheet.querySelector<HTMLElement>("[data-field=poi-distance]");
  const etaEl = sheet.querySelector<HTMLElement>("[data-field=poi-eta]");
  const routeSummaryEl = sheet.querySelector<HTMLElement>("[data-field=poi-route]");

  (async () => {
    try {
      const fromLatLng = state.vehicleMarker ? state.vehicleMarker.getLatLng() : map.getCenter();
      if (!fromLatLng) return;
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLatLng.lng},${fromLatLng.lat};${poi.lng},${poi.lat}?overview=false&steps=true&geometries=geojson`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("route failed");
      const data = await res.json();
      const route = data.routes?.[0];
      const dist = route?.distance ?? haversineDistanceMeters(fromLatLng.lat, fromLatLng.lng, poi.lat, poi.lng);
      const dur = route?.duration ?? (dist / 1000) / 40 * 3600; // fallback assume 40 km/h
      if (distanceEl) distanceEl.textContent = formatDistance(dist);
      if (etaEl) etaEl.textContent = formatEtaSeconds(dur);
      if (routeSummaryEl && route && route.legs && route.legs.length) {
        const steps = route.legs[0].steps || [];
        routeSummaryEl.innerHTML = `<div class="route-steps"><strong>Rute:</strong><ol>${steps.slice(0, 6).map((s: any) => `<li>${escapeHtml(String(s.maneuver?.instruction || s.name || 'Lurus'))} (${formatDistance(s.distance)})</li>`).join('')}</ol></div>`;
      }
    } catch (err) {
      try {
        // fallback compute straight-line distance
        const fromLatLng = state.vehicleMarker ? state.vehicleMarker.getLatLng() : map.getCenter();
        if (fromLatLng && distanceEl && etaEl) {
          const dist = haversineDistanceMeters(fromLatLng.lat, fromLatLng.lng, poi.lat, poi.lng);
          distanceEl.textContent = formatDistance(dist);
          etaEl.textContent = formatEtaSeconds((dist / 1000) / 40 * 3600);
        }
      } catch { }
    }
  })();
}

function openARCameraSheet(targetPoi: PoiRecord): void {
  const overlay = document.createElement('div');
  overlay.id = 'm-ar-fullscreen';
  overlay.innerHTML = `
  <div class="ar-fullscreen-wrapper">
    <video class="ar-video" autoplay playsinline muted></video>
    <canvas class="ar-canvas"></canvas>
    <div class="ar-guidance">
      <div class="ar-guidance-arrow" data-field="ar-arrow">↑</div>
      <div class="ar-guidance-text" data-field="ar-direction">Arah tujuan</div>
    </div>
    <button class="ar-target-beacon" data-field="ar-target-beacon" type="button">
      <span class="ar-target-beacon-icon">📍</span>
      <span class="ar-target-beacon-text">Tujuan</span>
    </button>
    <div class="ar-hud-bottom">
      <div class="ar-hud-status" data-field="ar-status">🎥 AR Mode aktif</div>
      <div class="ar-hud-info">
        <span data-field="ar-target">Tujuan: ${escapeHtml(targetPoi.title)}</span>
        <span data-field="ar-distance">Jarak: -</span>
        <span data-field="ar-eta">Waktu: -</span>
      </div>
    </div>
    <div class="ar-poi-layer"></div>
    <div class="ar-object-layer"></div>
    <div class="ar-controls-bottom">
      <button class="ar-toggle-3d" aria-label="Toggle 3D">3D</button>
      <button class="ar-swap-pip" aria-label="Swap PiP">↔️</button>
      <button class="ar-close">✕</button>
    </div>
    <div class="ar-pip-map-container" style="display:none">
      <div id="ar-pip-map" class="ar-pip-map"></div>
      <div class="ar-pip-info" data-field="pip-distance">Jarak: -</div>
    </div>
  </div>
`;
  document.body.appendChild(overlay);

  const video = overlay.querySelector<HTMLVideoElement>('.ar-video');
  const canvas = overlay.querySelector<HTMLCanvasElement>('.ar-canvas');
  const poiLayer = overlay.querySelector<HTMLElement>('.ar-poi-layer');
  const objectLayer = overlay.querySelector<HTMLElement>('.ar-object-layer');
  const statusEl = overlay.querySelector<HTMLElement>('[data-field="ar-status"]');
  const distanceEl = overlay.querySelector<HTMLElement>('[data-field="ar-distance"]');
  const etaEl = overlay.querySelector<HTMLElement>('[data-field="ar-eta"]');
  const guidanceArrow = overlay.querySelector<HTMLElement>('[data-field="ar-arrow"]');
  const guidanceText = overlay.querySelector<HTMLElement>('[data-field="ar-direction"]');
  const targetBeacon = overlay.querySelector<HTMLButtonElement>('[data-field="ar-target-beacon"]');
  const toggleBtn = overlay.querySelector<HTMLButtonElement>('.ar-toggle-3d');
  const swapBtn = overlay.querySelector<HTMLButtonElement>('.ar-swap-pip');
  const closeBtn = overlay.querySelector<HTMLButtonElement>('.ar-close');
  const pipContainer = overlay.querySelector<HTMLElement>('.ar-pip-map-container');
  const pipMapEl = overlay.querySelector<HTMLElement>('#ar-pip-map');
  const pipDistanceEl = overlay.querySelector<HTMLElement>('[data-field="pip-distance"]');
  if (!video || !canvas || !poiLayer || !objectLayer || !statusEl || !distanceEl || !etaEl || !guidanceArrow || !guidanceText || !targetBeacon || !toggleBtn || !closeBtn || !pipContainer || !pipMapEl || !pipDistanceEl) return;

  const videoEl = video as HTMLVideoElement;
  const canvasEl = canvas as HTMLCanvasElement;
  const poiLayerEl = poiLayer as HTMLElement;
  const objectLayerEl = objectLayer as HTMLElement;
  const statusElEl = statusEl as HTMLElement;
  const distanceElEl = distanceEl as HTMLElement;
  const etaElEl = etaEl as HTMLElement;
  const guidanceArrowEl = guidanceArrow as HTMLElement;
  const guidanceTextEl = guidanceText as HTMLElement;
  const targetBeaconEl = targetBeacon as HTMLButtonElement;
  const toggleBtnEl = toggleBtn as HTMLButtonElement;
  const closeBtnEl = closeBtn as HTMLButtonElement;
  const swapBtnEl = swapBtn as HTMLButtonElement;
  const pipContainerEl = pipContainer as HTMLElement;
  const pipMapElDiv = pipMapEl as HTMLElement;
  const pipDistanceElDiv = pipDistanceEl as HTMLElement;

  let stream: MediaStream | null = null;
  let running = true;
  let headingDeg = map.getBearing?.() ?? 0;
  let currentPos: L.LatLng | null = state.vehicleMarker?.getLatLng() ?? null;
  let currentTarget = targetPoi;
  let activePoiLookup = new Map<string, PoiRecord>();
  let destinationReached = false;
  let poiCards = new Map<string, HTMLElement>();
  let objectCards = new Map<string, HTMLElement>();
  let nearbyFetchToken = 0;
  let detectBusy = false;
  let ar3dEnabled = true;
  let arIsPrimary = true;
  let pipMapInstance: L.Map | null = null;
  let cleanedUp = false;

  function setStatus(text: string): void {
    statusElEl.textContent = text;
  }

  function bearingDelta(from: number, to: number): number {
    return ((to - from + 540) % 360) - 180;
  }

  function turnInstructionFromDelta(delta: number): string {
    const abs = Math.abs(delta);
    if (abs < 12) return 'Lurus';
    if (delta > 0) return abs < 35 ? 'Belok kanan' : 'Ke kanan';
    return abs < 35 ? 'Belok kiri' : 'Ke kiri';
  }

  function ensureSkeletonCard(id: string, title: string, kind: string): HTMLElement {
    const existing = poiCards.get(id);
    if (existing) return existing;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ar-poi-card ar-skeleton-card';
    card.dataset.poiId = id;
    card.title = title;
    card.innerHTML = `
    <div class="ar-poi-icon">${escapeHtml(poiVisual(kind as PoiKind).icon)}</div>
    <div class="ar-poi-distance">-</div>
  `;
    card.addEventListener('click', () => {
      const poi = activePoiLookup.get(id);
      if (!poi) return;
      openPoiModal(poi);
    });
    poiLayerEl.appendChild(card);
    poiCards.set(id, card);
    return card;
  }

  function ensureObjectCard(key: string, label: string): HTMLElement {
    const existing = objectCards.get(key);
    if (existing) return existing;
    const card = document.createElement('div');
    card.className = 'ar-object-card ar-skeleton-card';
    card.dataset.objectKey = key;
    card.innerHTML = `
    <div class="ar-object-label">${escapeHtml(label)}</div>
    <div class="ar-skeleton-box"></div>
  `;
    objectLayerEl.appendChild(card);
    objectCards.set(key, card);
    return card;
  }

  function cleanupCollections(activePoiIds: Set<string>, activeObjectKeys: Set<string>): void {
    for (const [id, el] of poiCards.entries()) {
      if (!activePoiIds.has(id)) {
        el.remove();
        poiCards.delete(id);
      }
    }
    for (const [key, el] of objectCards.entries()) {
      if (!activeObjectKeys.has(key)) {
        el.remove();
        objectCards.delete(key);
      }
    }
  }

  function updateTargetStats(): void {
    if (!currentPos) return;
    const dist = haversineDistanceMeters(currentPos.lat, currentPos.lng, currentTarget.lat, currentTarget.lng);
    const eta = (dist / 1000) / 40 * 3600;
    distanceElEl.textContent = `Jarak: ${formatDistance(dist)}`;
    etaElEl.textContent = `Waktu: ${formatEtaSeconds(eta)}`;
    const bearingToTarget = computeBearing(currentPos.lat, currentPos.lng, currentTarget.lat, currentTarget.lng);
    const deltaToTarget = bearingDelta(headingDeg, bearingToTarget);
    const halfFov = 36;
    const beaconX = Math.max(8, Math.min(92, 50 + (deltaToTarget / halfFov) * 42));
    const beaconY = Math.max(14, Math.min(66, 36 + (dist / 1500) * 12));
    guidanceArrowEl.style.transform = `rotate(${deltaToTarget}deg)`;
    guidanceArrowEl.classList.toggle('is-centered', Math.abs(deltaToTarget) < 8);
    guidanceTextEl.textContent = `${bearingLabel(bearingToTarget)} · ${turnInstructionFromDelta(deltaToTarget)} · ${formatDistance(dist)}`;
    targetBeaconEl.style.left = `${beaconX}%`;
    targetBeaconEl.style.top = `${beaconY}%`;
    targetBeaconEl.title = `${currentTarget.title} · ${bearingLabel(bearingToTarget)} · ${formatDistance(dist)}`;
    targetBeaconEl.querySelector('.ar-target-beacon-text')!.textContent = `${formatDistance(dist)}`;
    targetBeaconEl.classList.toggle('is-centered', Math.abs(deltaToTarget) < 8);
    if (dist < 18 && !destinationReached) {
      destinationReached = true;
      setStatus('Anda sudah sampai tujuan');
      closeModal();
      const reached = createSwipeableSheetModal('m-arrived-modal', 'm-arrived-sheet', `
      <div class="m-sheet-handle-bar"></div>
      <div class="ar-arrived">
        <div class="ar-arrived-title">Anda sudah sampai tujuan</div>
        <div class="ar-arrived-subtitle">${escapeHtml(currentTarget.title)}</div>
      </div>
    `);
      setTimeout(() => reached.remove(), 2600);
    }
  }

  function placePoiCard(card: HTMLElement, poi: PoiRecord): boolean {
    if (poi.id === currentTarget.id) return false;
    if (!currentPos) return false;
    const dist = haversineDistanceMeters(currentPos.lat, currentPos.lng, poi.lat, poi.lng);
    const bearingToPoi = computeBearing(currentPos.lat, currentPos.lng, poi.lat, poi.lng);
    const delta = bearingDelta(headingDeg, bearingToPoi);
    const fov = 72;
    const halfFov = fov / 2;
    const inRange = dist <= 850;
    const inView = Math.abs(delta) <= halfFov;
    const visible = inRange && inView;
    if (!visible) {
      card.remove();
      poiCards.delete(poi.id);
      return false;
    }
    const screenX = Math.max(8, Math.min(92, 50 + (delta / halfFov) * 40));
    const lift = clamp(68 - Math.log10(Math.max(dist, 5)) * 18, 8, 62);
    const size = clamp(1.02 - dist / 2100, 0.86, 1.02);
    const dirLabel = bearingLabel(bearingToPoi);
    const turnLabel = turnInstructionFromDelta(delta);
    const centered = Math.abs(delta) < 8;
    card.classList.remove('ar-skeleton-card');
    card.title = `${poi.title} · ${dirLabel} · ${turnLabel}`;
    card.innerHTML = `
    <div class="ar-poi-icon">${escapeHtml(poi.icon || poiVisual(poi.kind).icon)}</div>
    <div class="ar-poi-distance">${formatDistance(dist)}</div>
  `;
    card.classList.toggle('ar-poi-centered', centered);
    Object.assign(card.style, {
      left: `${screenX}%`,
      top: `${lift}%`,
      transform: `translate(-50%, -50%) scale(${size}) perspective(900px) rotateX(16deg) rotateY(${delta > 0 ? '-8deg' : '8deg'})`,
      opacity: `${clamp(1.15 - dist / 1300, 0.3, 1)}`,
    });
    if (poi.id === currentTarget.id) {
      card.classList.add('ar-target-card');
    }
    card.dataset.bearing = String(Math.round(bearingToPoi));
    card.dataset.delta = String(Math.round(delta));
    card.dataset.distance = String(Math.round(dist));
    return true;
  }
  mapRoot.classList.add('hidden');
  document.getElementById('m-bottom-nav')?.classList.add('hidden');

  async function fetchNearbyPoiCards(): Promise<void> {
    if (!currentPos) return;
    const token = ++nearbyFetchToken;
    setStatus('Memuat POI sekitar...');
    const bounds = L.latLngBounds(
      [currentPos.lat - 0.01, currentPos.lng - 0.01],
      [currentPos.lat + 0.01, currentPos.lng + 0.01],
    );
    let pois = await fetchOverpassFeaturesForBounds(bounds).catch(() => [] as PoiRecord[]);
    if (token !== nearbyFetchToken) return;
    if (!pois.length) {
      const c = currentPos;
      pois = [
        { id: 'ar-local-terminal', kind: 'terminal', title: 'Terminal Terdekat', description: '', address: '', imageUrl: POI_LIBRARY.terminal.imageUrl, rating: POI_LIBRARY.terminal.rating, icon: poiVisual('terminal').icon, lat: c.lat + 0.0014, lng: c.lng + 0.0011 },
        { id: 'ar-local-station', kind: 'station', title: 'Stasiun Terdekat', description: '', address: '', imageUrl: POI_LIBRARY.station.imageUrl, rating: POI_LIBRARY.station.rating, icon: poiVisual('station').icon, lat: c.lat - 0.0011, lng: c.lng + 0.0016 },
        { id: 'ar-local-shelter', kind: 'shelter', title: 'Shelter / Halte', description: '', address: '', imageUrl: POI_LIBRARY.shelter.imageUrl, rating: POI_LIBRARY.shelter.rating, icon: poiVisual('shelter').icon, lat: c.lat + 0.0009, lng: c.lng - 0.0015 },
        { id: 'ar-local-cemetery', kind: 'cemetery', title: 'Pemakaman', description: '', address: '', imageUrl: POI_LIBRARY.cemetery.imageUrl, rating: POI_LIBRARY.cemetery.rating, icon: poiVisual('cemetery').icon, lat: c.lat - 0.0018, lng: c.lng - 0.0010 },
      ];
    }
    pois = pois.slice(0, 12);
    activePoiLookup = new Map(pois.map((p) => [p.id, p]));
    const activePoiIds = new Set<string>();
    activePoiIds.add(currentTarget.id);
    pois.forEach((poi) => {
      const card = ensureSkeletonCard(poi.id, poi.title, poi.kind);
      if (placePoiCard(card, poi)) activePoiIds.add(poi.id);
    });
    cleanupCollections(activePoiIds, new Set(objectCards.keys()));
    setStatus('POI sekitar aktif');
  }

  function updateObjectOverlays(predictions: Array<{ bbox: number[]; class?: string; score?: number }>): void {
    const active = new Set<string>();
    predictions.filter((p) => (p.score ?? 0) > 0.45).slice(0, 10).forEach((p, index) => {
      const key = `${p.class || 'object'}-${index}`;
      active.add(key);
      const label = p.class || 'object';
      const card = ensureObjectCard(key, label);
      const [x, y, w, h] = p.bbox;
      const bw = Math.max(8, (w / Math.max(videoEl.videoWidth, 1)) * 100);
      const bh = Math.max(8, (h / Math.max(videoEl.videoHeight, 1)) * 100);
      const cx = ((x + w / 2) / Math.max(videoEl.videoWidth, 1)) * 100;
      const cy = ((y + h / 2) / Math.max(videoEl.videoHeight, 1)) * 100;
      const bg = /person/i.test(label) ? 'linear-gradient(180deg,#2563eb,#93c5fd)' : /car|truck|bus|motorcycle|vehicle/i.test(label) ? 'linear-gradient(180deg,#ef4444,#fb7185)' : /plant|tree/i.test(label) ? 'linear-gradient(180deg,#16a34a,#86efac)' : 'linear-gradient(180deg,#475569,#94a3b8)';
      card.classList.remove('ar-skeleton-card');
      card.innerHTML = `
      <div class="ar-object-label">${escapeHtml(label)}</div>
      <div class="ar-object-distance">${Math.max(1, Math.round(1200 / Math.max(bw, 8)))}m</div>
    `;
      Object.assign(card.style, {
        left: `${cx}%`,
        top: `${cy}%`,
        width: `${bw}%`,
        height: `${bh}%`,
        background: bg,
        transform: ar3dEnabled ? 'perspective(900px) rotateX(18deg)' : '',
        opacity: '1',
      });
    });
    cleanupCollections(new Set(poiCards.keys()), active);
  }

  async function loadTfModel(): Promise<any | null> {
    if (!(window as any).tf) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.8.0/dist/tf.min.js';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('tfjs load failed'));
        document.head.appendChild(s);
      });
    }
    if (!(window as any).cocoSsd) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('coco-ssd load failed'));
        document.head.appendChild(s);
      });
    }
    return (window as any).cocoSsd.load();
  }

  async function refreshAr(): Promise<void> {
    if (!running || !currentPos) return;
    updateTargetStats();
    const distToTarget = haversineDistanceMeters(currentPos.lat, currentPos.lng, currentTarget.lat, currentTarget.lng);
    const etaToTarget = formatEtaSeconds((distToTarget / 1000) / 40 * 3600);
    distanceElEl.textContent = `Jarak: ${formatDistance(distToTarget)}`;
    etaElEl.textContent = `Waktu: ${etaToTarget}`;
    if (pipDistanceElDiv && !arIsPrimary) {
      pipDistanceElDiv.textContent = `${formatDistance(distToTarget)}`;
    }
    headingDeg = map.getBearing?.() ?? headingDeg;
    await fetchNearbyPoiCards();
    if (model && !detectBusy && ar3dEnabled) {
      detectBusy = true;
      try {
        const preds = await model.detect(videoEl as any);
        updateObjectOverlays(preds || []);
      } catch (err) {
        console.warn('detect error', err);
      } finally {
        detectBusy = false;
      }
    }
    if (running) setTimeout(() => void refreshAr(), 320);
  }

  let model: any | null = null;
  let watchId: number | null = null;
  let orientationCleanup = () => { /* noop */ };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      videoEl.srcObject = stream;
      await videoEl.play();
      await new Promise<void>((resolve) => {
        if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) return resolve();
        videoEl.onloadedmetadata = () => resolve();
      });
      canvasEl.width = videoEl.videoWidth || 1280;
      canvasEl.height = videoEl.videoHeight || 720;
      const ctx = canvasEl.getContext('2d');
      if (!ctx) throw new Error('canvas context unavailable');

      const skeletonPoi = document.createElement('div');
      skeletonPoi.className = 'ar-skeleton-anchor';
      poiLayerEl.appendChild(skeletonPoi);

      try {
        model = await loadTfModel();
      } catch (err) {
        console.warn('TF model load failed', err);
      }

      watchId = navigator.geolocation?.watchPosition?.((pos) => {
        currentPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (pipMapInstance && !arIsPrimary) {
          pipMapInstance.setView([currentPos.lat, currentPos.lng], pipMapInstance.getZoom());
          if (pipDistanceElDiv) {
            const distToPoi = haversineDistanceMeters(currentPos.lat, currentPos.lng, currentTarget.lat, currentTarget.lng);
            pipDistanceElDiv.textContent = `${formatDistance(distToPoi)}`;
          }
        }
      }, () => { /* ignore */ }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 8000 }) ?? null;

      const onOrientation = (ev: DeviceOrientationEvent) => {
        const webkitHeading = (ev as any).webkitCompassHeading;
        if (typeof webkitHeading === 'number') headingDeg = webkitHeading;
      };
      window.addEventListener('deviceorientationabsolute', onOrientation, true);
      window.addEventListener('deviceorientation', onOrientation, true);
      orientationCleanup = () => {
        window.removeEventListener('deviceorientationabsolute', onOrientation, true);
        window.removeEventListener('deviceorientation', onOrientation, true);
      };

      const drawLoop = (): void => {
        if (!running) return;
        try {
          ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
          if (ar3dEnabled) {
            const grd = ctx.createLinearGradient(0, 0, canvasEl.width, canvasEl.height);
            grd.addColorStop(0, 'rgba(59,130,246,0.08)');
            grd.addColorStop(0.5, 'rgba(16,185,129,0.04)');
            grd.addColorStop(1, 'rgba(236,72,153,0.06)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
          }
        } catch {
          /* ignore */
        }
        requestAnimationFrame(drawLoop);
        overlay.style.pointerEvents = 'auto';
      };
      drawLoop();

      toggleBtnEl.addEventListener('click', () => {
        ar3dEnabled = !ar3dEnabled;
        toggleBtnEl.textContent = ar3dEnabled ? '3D On' : '3D Off';
        poiLayerEl.classList.toggle('ar-3d-off', !ar3dEnabled);
        objectLayerEl.classList.toggle('ar-3d-off', !ar3dEnabled);
      });

      const applySwapState = (primaryCamera: boolean): void => {
        arIsPrimary = primaryCamera;
        overlay.classList.toggle('ar-swapped', !primaryCamera);
        overlay.style.background = primaryCamera ? '#000' : 'transparent';
        pipContainerEl.style.display = primaryCamera ? 'block' : 'none';
        poiLayerEl.style.display = primaryCamera ? 'block' : 'none';
        objectLayerEl.style.display = primaryCamera ? 'block' : 'none';
        statusElEl.style.display = primaryCamera ? 'block' : 'none';
        distanceElEl.style.display = primaryCamera ? 'block' : 'none';
        etaElEl.style.display = primaryCamera ? 'block' : 'none';
        toggleBtnEl.style.display = primaryCamera ? 'inline-flex' : 'none';
        swapBtnEl.style.display = 'inline-flex';
        closeBtnEl.style.display = 'inline-flex';
        videoEl.style.position = primaryCamera ? 'absolute' : 'absolute';
        videoEl.style.top = primaryCamera ? '0' : '16px';
        videoEl.style.left = primaryCamera ? '0' : 'auto';
        videoEl.style.right = primaryCamera ? '0' : '16px';
        videoEl.style.bottom = primaryCamera ? '0' : 'auto';
        videoEl.style.width = primaryCamera ? '100%' : 'min(42vw, 188px)';
        videoEl.style.height = primaryCamera ? '100%' : 'min(30vw, 134px)';
        videoEl.style.objectFit = primaryCamera ? 'cover' : 'cover';
        videoEl.style.borderRadius = primaryCamera ? '0' : '16px';
        videoEl.style.zIndex = primaryCamera ? '1' : '15';
        mapRoot.classList.toggle('hidden', primaryCamera);
        document.getElementById('m-bottom-nav')?.classList.toggle('hidden', primaryCamera);
        targetBeaconEl.addEventListener('click', () => openPoiModal(currentTarget));
        if (!primaryCamera) {
          if (currentPos) {
            const distToPoi = haversineDistanceMeters(currentPos.lat, currentPos.lng, currentTarget.lat, currentTarget.lng);
            pipDistanceElDiv.textContent = `${formatDistance(distToPoi)}`;
          }
          if (!pipMapInstance && currentPos) {
            pipMapInstance = L.map(pipMapElDiv).setView([currentPos.lat, currentPos.lng], 17);
            L.tileLayer(CARTO_TILE_URL, { maxZoom: 20, subdomains: "abcd", attribution: CARTO_ATTRIBUTION }).addTo(pipMapInstance);
            L.marker([currentPos.lat, currentPos.lng], { icon: L.icon({ iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSIjZmY0NDQ0Ii8+PC9zdmc+', iconSize: [24, 24] }) }).addTo(pipMapInstance);
            L.marker([currentTarget.lat, currentTarget.lng], { icon: L.icon({ iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiMxMGI5ODEiIHJ4PSIyIi8+PC9zdmc+', iconSize: [24, 24] }) }).addTo(pipMapInstance);
          }
        }
      };

      swapBtnEl.addEventListener('click', () => applySwapState(!arIsPrimary));
      pipContainerEl.addEventListener('click', () => {
        if (arIsPrimary) applySwapState(false);
      });
      videoEl.addEventListener('click', () => {
        if (!arIsPrimary) applySwapState(true);
      });
      applySwapState(true);

      const cleanupArSession = (removeOverlay: boolean): void => {
        if (cleanedUp) return;
        cleanedUp = true;
        running = false;
        orientationCleanup();
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        if (stream) stream.getTracks().forEach((track) => track.stop());
        if (pipMapInstance) {
          pipMapInstance.remove();
          pipMapInstance = null;
        }
        poiCards.forEach((el) => el.remove());
        objectCards.forEach((el) => el.remove());
        poiCards.clear();
        objectCards.clear();
        mapRoot.classList.remove('hidden');
        document.getElementById('m-bottom-nav')?.classList.remove('hidden');
        if (removeOverlay) overlay.remove();
      };

      closeBtnEl.addEventListener('click', () => cleanupArSession(true));
      overlay.addEventListener('remove', () => cleanupArSession(false));

      currentPos = currentPos || L.latLng(targetPoi.lat, targetPoi.lng);
      setStatus('Kamera aktif');
      await fetchNearbyPoiCards();
      void refreshAr();
    } catch (err) {
      console.warn('camera denied or unavailable', err);
      poiLayerEl.innerHTML = '<div class="ar-error" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(239, 68, 68, 0.9); color: white; padding: 20px; border-radius: 10px; text-align: center;">Tidak dapat mengakses kamera.</div>';
    }
  })();
}

function syncPoiMarkers(anchor: L.LatLngExpression): void {
  const center = L.latLng(anchor);
  const radiusMeters = 400; // search radius for nearby POIs

  // Build a small bbox around center (approximate degrees)
  const lat = center.lat;
  const lng = center.lng;
  const latDelta = radiusMeters / 111320; // ~ meters to degrees
  const lngDelta = Math.abs(radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180)));
  const bounds = L.latLngBounds([lat - latDelta, lng - lngDelta], [lat + latDelta, lng + lngDelta]);
  void fetchOverpassFeaturesForBounds(bounds).then((pois) => {
    let finalPois = pois;
    // If Overpass returned no POIs for this area, always fall back to local sample POIs
    // so the UI remains usable offline or when the API times out.
    if (!pois || pois.length === 0) {
      // fallback local POIs
      const c = center;
      finalPois = [
        { id: 'local-school-1', kind: 'campus', title: 'SD Negeri 1', description: '', address: '', imageUrl: POI_LIBRARY.campus.imageUrl, rating: POI_LIBRARY.campus.rating, icon: poiVisual('campus').icon, lat: c.lat + 0.0012, lng: c.lng + 0.0012 },
        { id: 'local-mall-1', kind: 'mall', title: 'Pusat Perbelanjaan', description: '', address: '', imageUrl: POI_LIBRARY.mall.imageUrl, rating: POI_LIBRARY.mall.rating, icon: poiVisual('mall').icon, lat: c.lat - 0.0014, lng: c.lng + 0.0018 },
        { id: 'local-hospital-1', kind: 'hospital', title: 'Klinik Sehat', description: '', address: '', imageUrl: POI_LIBRARY.hospital.imageUrl, rating: POI_LIBRARY.hospital.rating, icon: poiVisual('hospital').icon, lat: c.lat + 0.0020, lng: c.lng - 0.0010 },
        { id: 'local-parking-1', kind: 'parking', title: 'Parkir Umum', description: '', address: '', imageUrl: POI_LIBRARY.parking.imageUrl, rating: POI_LIBRARY.parking.rating, icon: poiVisual('parking').icon, lat: c.lat - 0.0018, lng: c.lng - 0.0015 },
      ];
    }

    const keep = new Set<string>();
    const iconSize = poiMarkerSizeByZoom();
    finalPois.forEach((poi) => {
      keep.add(poi.id);
      state.poiData.set(poi.id, poi);
      const existing = state.poiMarkers.get(poi.id);
      const icon = makePoiIcon(poi, iconSize);
      if (!existing) {
        const marker = L.marker([poi.lat, poi.lng], {
          icon,
          interactive: true,
          riseOnHover: true,
          zIndexOffset: 500,
        }).addTo(map);
        (marker.options as any).poiId = poi.id;
        marker.on("click", () => handlePoiClick(poi));
        const el = marker.getElement() as HTMLElement | null;
        if (el) el.style.display = '';
        state.poiMarkers.set(poi.id, marker);
        return;
      }
      existing.setLatLng([poi.lat, poi.lng]);
      existing.setIcon(icon);
      existing.off("click");
      existing.on("click", () => handlePoiClick(poi));
      const el2 = existing.getElement() as HTMLElement | null;
      if (el2) el2.style.display = '';
    });

    // Remove stale POI markers
    for (const [id, marker] of state.poiMarkers.entries()) {
      id;
      if (!keep.has(id)) {
        map.removeLayer(marker);
        state.poiMarkers.delete(id);
        state.poiData.delete(id);
      }
    }
  }).catch(() => { /* ignore */ });
}

// ─── Overpass / Vector overlay for clickable raster-like features ─────────────────

function buildOverpassBBoxString(bounds: L.LatLngBounds): string {
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  return `${s},${w},${n},${e}`;
}

function poiNameFromTags(tags: Record<string, string>, fallback: string): string {
  return tags["name:id"]
    || tags.name
    || tags.official_name
    || tags.brand
    || tags.operator
    || tags.amenity
    || tags.shop
    || tags.tourism
    || tags.office
    || tags.healthcare
    || tags.craft
    || tags.place
    || tags.building
    || fallback;
}

function poiAddressFromTags(tags: Record<string, string>): string {
  const parts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:subdistrict"],
    tags["addr:city"],
  ].filter(Boolean);
  return parts.join(" ") || tags.addr || "";
}

function poiPriority(poi: PoiRecord): number {
  const weights: Record<PoiKind, number> = {
    station: 1,
    terminal: 2,
    shelter: 3,
    hospital: 4,
    campus: 5,
    school: 6,
    worship: 7,
    parking: 8,
    mall: 9,
    restaurant: 10,
    office: 11,
    park: 12,
    monument: 13,
    transport: 14,
    cemetery: 15,
    other: 20,
  };
  return weights[poi.kind] ?? 20;
}

function visiblePoiLimit(): number {
  const zoom = map.getZoom();
  if (zoom < 14) return 52;
  if (zoom < 16) return 110;
  if (zoom < 18) return 180;
  return 240;
}

function rankPoisForView(pois: PoiRecord[]): PoiRecord[] {
  const center = map.getCenter();
  return pois
    .filter((poi) => isValidCoordinate(poi.lat, poi.lng))
    .sort((a, b) => {
      const priority = poiPriority(a) - poiPriority(b);
      if (priority !== 0) return priority;
      const da = center.distanceTo([a.lat, a.lng]);
      const db = center.distanceTo([b.lat, b.lng]);
      return da - db;
    })
    .slice(0, visiblePoiLimit());
}

async function fetchOverpassFeaturesForBounds(bounds: L.LatLngBounds): Promise<PoiRecord[]> {
  const bbox = buildOverpassBBoxString(bounds);
  // Query common POI tags; return nodes + ways + relations with center
  const q = `
  [out:json][timeout:15];
  (
    node["amenity"](${bbox});
    way["amenity"](${bbox});
    relation["amenity"](${bbox});
    node["shop"](${bbox});
    way["shop"](${bbox});
    relation["shop"](${bbox});
    node["tourism"](${bbox});
    way["tourism"](${bbox});
    relation["tourism"](${bbox});
    node["office"](${bbox});
    way["office"](${bbox});
    relation["office"](${bbox});
    node["leisure"="park"](${bbox});
    way["leisure"="park"](${bbox});
    relation["leisure"="park"](${bbox});
    node["public_transport"](${bbox});
    way["public_transport"](${bbox});
    relation["public_transport"](${bbox});
    node["public_transport"~"station|platform|stop_position"](${bbox});
    way["public_transport"~"station|platform|stop_position"](${bbox});
    node["highway"="bus_stop"](${bbox});
    node["amenity"="bus_station"](${bbox});
    way["amenity"="bus_station"](${bbox});
    node["railway"~"station|halt|tram_stop|subway_entrance"](${bbox});
    way["railway"~"station|halt|tram_stop|subway_entrance"](${bbox});
    relation["railway"~"station|halt|tram_stop|subway_entrance"](${bbox});
    node["historic"](${bbox});
    way["historic"](${bbox});
    relation["historic"](${bbox});
    node["healthcare"](${bbox});
    way["healthcare"](${bbox});
    relation["healthcare"](${bbox});
    node["craft"](${bbox});
    way["craft"](${bbox});
    node["emergency"](${bbox});
    way["emergency"](${bbox});
    node["place"~"neighbourhood|suburb|quarter|village|hamlet"](${bbox});
    way["place"~"neighbourhood|suburb|quarter|village|hamlet"](${bbox});
    node["man_made"]["name"](${bbox});
    way["man_made"]["name"](${bbox});
    node["sport"]["name"](${bbox});
    way["sport"]["name"](${bbox});
    node["building"]["name"](${bbox});
    way["building"]["name"](${bbox});
  );
  out center tags;
`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: q,
    });
    if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
    const data = await res.json();
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const pois: PoiRecord[] = elements.map((el: any) => {
      const tags = el.tags || {};
      const name = poiNameFromTags(tags, `POI ${el.id}`);
      const lat = el.type === 'node' ? el.lat : (el.center && el.center.lat) || el.lat || 0;
      const lng = el.type === 'node' ? el.lon : (el.center && el.center.lon) || el.lon || 0;
      const kind = classifyPoiKind(tags);
      const imageUrl = tags.image || tags['image:source'] || customPoiImageForTags(tags, kind);
      const description = tags.description || tags['note'] || POI_LIBRARY[kind].description;
      const address = poiAddressFromTags(tags);
      return {
        id: `overpass-${el.type}-${el.id}`,
        kind,
        title: name || `POI ${el.id}`,
        description: description || '',
        address: address || '',
        imageUrl: imageUrl || ITS_APP_ICON,
        rating: POI_LIBRARY[kind].rating,
        icon: poiVisual(kind).icon,
        lat, lng,
      };
    }).filter((p: PoiRecord) => isValidCoordinate(p.lat, p.lng));
    return rankPoisForView(pois);
  } catch (err) {
    console.warn("Overpass fetch failed:", err);
    return [];
  }
}

let lastRoadGuideFetchBounds: L.LatLngBounds | null = null;

function numberTag(tags: Record<string, string>, key: string): number {
  const raw = tags[key];
  if (!raw) return 0;
  const parsed = Number(String(raw).split(";")[0].trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function elementGeometryPoints(el: any): L.LatLng[] {
  const geometry = Array.isArray(el.geometry) ? el.geometry : [];
  return geometry
    .map((p: any) => L.latLng(Number(p.lat), Number(p.lon)))
    .filter((p: L.LatLng) => isValidCoordinate(p.lat, p.lng));
}

function isClosedGuideRing(points: L.LatLng[]): boolean {
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.abs(first.lat - last.lat) < 0.00002 && Math.abs(first.lng - last.lng) < 0.00002;
}

function guideCentroid(points: L.LatLng[]): L.LatLng | null {
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => {
    acc.lat += point.lat;
    acc.lng += point.lng;
    return acc;
  }, { lat: 0, lng: 0 });
  return L.latLng(sum.lat / points.length, sum.lng / points.length);
}

function appPlaceUrl(lat: number, lng: number, title?: string): string {
  const origin = window.location.protocol.startsWith("http")
    ? window.location.origin
    : "https://itstelkom.web.app";
  const url = new URL(origin);
  url.pathname = "/";
  url.searchParams.set("lat", lat.toFixed(6));
  url.searchParams.set("lng", lng.toFixed(6));
  url.searchParams.set("z", String(Math.max(16, Math.round(map.getZoom() || DEFAULT_ZOOM))));
  if (title) url.searchParams.set("place", title);
  return url.toString();
}

function roadNameLooksAvenue(name: string): boolean {
  return /\b(raya|boulevard|avenue|arteri|ring road|lingkar|protokol|jenderal|perintis|kemerdekaan|sudirman|thamrin|gatot|tol)\b/i.test(name);
}

function detectRoadType(tags: Record<string, string>, name: string): RoadGuideRecord["roadType"] {
  const highway = tags.highway || "";
  if (/motorway|trunk/.test(highway) || /\btol\b/i.test(name)) return "expressway";
  if (/footway|path|pedestrian|cycleway|steps/.test(highway)) return "foot";
  if (/service|track/.test(highway)) return "service";
  const lanes = numberTag(tags, "lanes") || numberTag(tags, "lanes:forward") + numberTag(tags, "lanes:backward");
  if (/primary|secondary|tertiary/.test(highway) || lanes >= 4 || roadNameLooksAvenue(name)) return "avenue";
  return "street";
}

function roadRenderClass(road: RoadGuideRecord): "major" | "street" | "foot" | "service" {
  if (road.roadType === "expressway" || road.roadType === "avenue") return "major";
  if (road.roadType === "foot") return "foot";
  if (road.roadType === "service") return "service";
  return "street";
}

function roadZoomScale(min = 0.78, max = 1.24): number {
  return clamp(0.84 + (map.getZoom() - 15) * 0.12, min, max);
}

function roadGuideStyle(road: RoadGuideRecord, casing = false): L.PolylineOptions {
  const cls = roadRenderClass(road);
  const scale = roadZoomScale();
  if (casing) {
    return {
      color: road.roadType === "expressway" ? "#fff7d6" : cls === "major" ? "#ffffff" : "#f8fafc",
      weight: (road.roadType === "expressway" ? 13 : cls === "major" ? 11 : cls === "foot" ? 4 : 7) * scale,
      opacity: cls === "foot" ? 0.75 : 0.88,
      interactive: false,
    };
  }
  if (cls === "foot") {
    return {
      color: road.hasSidewalk ? "#77d5c6" : "#b7c6d8",
      weight: 2.2 * scale,
      opacity: 0.84,
      dashArray: "7 7",
      interactive: false,
    };
  }
  if (cls === "major") {
    return {
      color: road.roadType === "expressway" ? "#ffb36c" : road.roadType === "avenue" ? "#ffd878" : "#ffe08a",
      weight: (road.roadType === "expressway" ? 8.4 : road.roadType === "avenue" ? 7.4 : 6.6) * scale,
      opacity: 0.9,
      interactive: false,
    };
  }
  if (cls === "service") {
    return { color: "#d8e1ea", weight: 3.4 * scale, opacity: 0.82, interactive: false };
  }
  return { color: "#ffffff", weight: 4.2 * scale, opacity: 0.92, interactive: false };
}

function mapLibrePitchByZoom(zoom: number): number {
  if (zoom < 14) return 38;
  return clamp(42 + (zoom - 14) * 6, 42, MAPLIBRE_3D_PITCH);
}

function roadMedianStyle(road: RoadGuideRecord): L.PolylineOptions {
  const scale = roadZoomScale(0.76, 1.18);
  return {
    color: road.treeLined ? "#56c786" : "#82d6bb",
    weight: (road.treeLined ? 3 : 2) * scale,
    opacity: 0.84,
    dashArray: road.treeLined ? "1 9" : "10 12",
    lineCap: "round",
    interactive: false,
  };
}

function roadLaneDividerStyle(road: RoadGuideRecord): L.PolylineOptions {
  const scale = roadZoomScale(0.72, 1.12);
  return {
    color: road.roadType === "expressway" ? "#fff3b0" : "#ffffff",
    weight: 1.2 * scale,
    opacity: 0.8,
    dashArray: road.oneway ? "8 12" : "14 14",
    interactive: false,
  };
}

function roadSidewalkStyle(road: RoadGuideRecord): L.PolylineOptions {
  const cls = roadRenderClass(road);
  const scale = roadZoomScale(0.76, 1.18);
  return {
    color: cls === "major" ? "rgb(215, 230, 247)" : "#c7d6e6",
    weight: (cls === "major" ? 14.5 : cls === "service" ? 6.5 : 9) * scale,
    opacity: cls === "foot" ? 0 : 0.62,
    dashArray: road.hasSidewalk ? "10 9" : "2 14",
    lineCap: "round",
    interactive: false,
  };
}

function roadAvenueTreeStyle(road: RoadGuideRecord): L.PolylineOptions {
  const scale = roadZoomScale(0.72, 1.16);
  return {
    color: road.treeLined ? "#20b36b" : "#7bd389",
    weight: (road.treeLined ? 5 : 3.2) * scale,
    opacity: road.treeLined ? 0.9 : 0.55,
    dashArray: road.treeLined ? "1 13" : "2 18",
    lineCap: "round",
    interactive: false,
  };
}

function roadWaterMedianStyle(): L.PolylineOptions {
  const scale = roadZoomScale(0.74, 1.18);
  return {
    color: "#77cbe8",
    weight: 3.2 * scale,
    opacity: 0.72,
    dashArray: "18 14",
    lineCap: "round",
    interactive: false,
  };
}

function roadRoundaboutGreenStyle(): L.PolylineOptions {
  return {
    color: "#9adea9",
    fillColor: "#d8f6d8",
    fillOpacity: 0.78,
    weight: 1.2,
    opacity: 0.92,
    interactive: false,
  };
}

function railGuideStyle(casing = false): L.PolylineOptions {
  return {
    color: casing ? "#ffffff" : "#596273",
    weight: casing ? 6 : 3,
    opacity: casing ? 0.92 : 0.86,
    dashArray: casing ? undefined : "10 8",
    lineCap: "butt",
    interactive: false,
  };
}

function railSleeperStyle(): L.PolylineOptions {
  return {
    color: "#111827",
    weight: 1.4,
    opacity: 0.58,
    dashArray: "2 12",
    lineCap: "butt",
    interactive: false,
  };
}

function waterGuideStyle(water: WaterGuideRecord): L.PolylineOptions {
  const isRiver = /river|canal/.test(water.waterway);
  const scale = roadZoomScale(0.8, 1.2);
  return {
    color: isRiver ? "#77cbe8" : "#8bd8ef",
    weight: (isRiver ? 5.5 : 3.4) * scale,
    opacity: 0.82,
    lineCap: "round",
    interactive: false,
  };
}

function greenGuideStyle(green: GreenGuideRecord): L.PolylineOptions {
  const darker = /park|forest|wood/.test(green.kind);
  return {
    color: darker ? "#7edc91" : "#b9efb7",
    fillColor: darker ? "#ccf2ce" : "#e3f8d6",
    fillOpacity: 0.54,
    weight: 1,
    opacity: 0.8,
    interactive: false,
  };
}

function roadGuideMidpoint(points: L.LatLng[]): { latlng: L.LatLng; bearing: number } | null {
  if (points.length < 2) return null;
  const index = Math.max(0, Math.min(points.length - 2, Math.floor(points.length / 2) - 1));
  const a = points[index];
  const b = points[index + 1];
  return {
    latlng: L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2),
    bearing: computeBearing(a.lat, a.lng, b.lat, b.lng),
  };
}

function makeRoadArrowIcon(bearing: number, road: RoadGuideRecord): L.DivIcon {
  const cls = roadRenderClass(road);
  return L.divIcon({
    className: "road-guide-arrow-icon",
    html: `<span class="road-guide-arrow road-guide-${cls} road-guide-${road.roadType}" style="--road-bearing:${bearing}deg"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function makeRoadTypeIcon(road: RoadGuideRecord): L.DivIcon {
  const label = road.roadType === "expressway"
    ? "TOL"
    : road.roadType === "avenue"
      ? "AVE"
      : road.roadType === "foot"
        ? "WALK"
        : road.roadType === "service"
          ? "SRV"
          : "JLN";
  return L.divIcon({
    className: "road-guide-type-icon",
    html: `<span class="road-guide-type road-type-${road.roadType}">${label}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function makeRoundaboutIcon(road: RoadGuideRecord): L.DivIcon {
  const label = road.name || road.ref || "Bundaran";
  return L.divIcon({
    className: "road-guide-roundabout-icon",
    html: `<span title="${escapeHtml(label)}"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function makeRailCrossingIcon(crossing: CrossingGuideRecord): L.DivIcon {
  const size = clamp(20 + (map.getZoom() - 15) * 3, 20, 34);
  return L.divIcon({
    className: "rail-crossing-icon",
    html: `<span class="rail-crossing-mark" style="--crossing-size:${size}px" title="${escapeHtml(crossing.name || "Perlintasan kereta")}"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function makeRoadNameIcon(name: string, bearing: number): L.DivIcon {
  const readableBearing = bearing > 90 && bearing < 270 ? bearing + 180 : bearing;
  return L.divIcon({
    className: "road-guide-name-icon",
    html: `<span style="--road-label-bearing:${readableBearing}deg">${escapeHtml(name)}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function makeWaterNameIcon(name: string, bearing: number): L.DivIcon {
  const readableBearing = bearing > 90 && bearing < 270 ? bearing + 180 : bearing;
  return L.divIcon({
    className: "water-guide-name-icon",
    html: `<span style="--water-label-bearing:${readableBearing}deg">${escapeHtml(name)}</span>`,
    iconSize: [1, 1],
    iconAnchor: [0, 0],
  });
}

function roadGuideSamplePoints(points: L.LatLng[], maxCount: number): { latlng: L.LatLng; bearing: number }[] {
  if (points.length < 2 || maxCount <= 0) return [];
  const samples: { latlng: L.LatLng; bearing: number }[] = [];
  const step = Math.max(1, Math.floor((points.length - 1) / Math.max(1, maxCount)));
  for (let i = step; i < points.length - 1 && samples.length < maxCount; i += step) {
    const a = points[i - 1];
    const b = points[i];
    samples.push({
      latlng: L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2),
      bearing: computeBearing(a.lat, a.lng, b.lat, b.lng),
    });
  }
  return samples;
}

async function fetchRoadGuidesForBounds(bounds: L.LatLngBounds): Promise<RoadGuideBundle> {
  const bbox = buildOverpassBBoxString(bounds);
  const q = `
  [out:json][timeout:18];
  (
    way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street|pedestrian|footway|path|cycleway|steps"](${bbox});
    way["railway"~"rail|light_rail|tram|subway|narrow_gauge"](${bbox});
    node["railway"~"level_crossing|crossing|tram_crossing"](${bbox});
    way["waterway"~"river|stream|canal|drain|ditch"](${bbox});
    way["man_made"~"canal|drain|ditch"](${bbox});
    way["natural"="water"](${bbox});
    way["water"~"river|stream|canal|drain|ditch|pond|lake|reservoir"](${bbox});
    way["leisure"~"park|garden|recreation_ground"](${bbox});
    way["landuse"~"grass|forest|meadow|village_green|recreation_ground"](${bbox});
    way["natural"~"wood|grassland|scrub|tree_row"](${bbox});
  );
  out tags geom 650;
`;

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: q,
    });
    if (!res.ok) throw new Error(`Overpass road HTTP ${res.status}`);
    const data = await res.json();
    const elements = Array.isArray(data.elements) ? data.elements : [];
    const bundle: RoadGuideBundle = {
      roads: [],
      rails: [],
      crossings: [],
      waterways: [],
      greens: [],
    };

    elements.forEach((el: any) => {
      const tags = el.tags || {};

      if (el.type === "node") {
        const lat = Number(el.lat);
        const lng = Number(el.lon);
        if (isValidCoordinate(lat, lng) && /level_crossing|crossing|tram_crossing/.test(tags.railway || "")) {
          bundle.crossings.push({
            id: `crossing-${el.id}`,
            name: tags.name || tags.ref || "Perlintasan kereta",
            latlng: L.latLng(lat, lng),
            type: "rail",
          });
        }
        return;
      }

      const points = elementGeometryPoints(el);
      if (points.length < 2) return;

      if (tags.highway) {
        const name = tags["name:id"] || tags.name || tags.ref || tags["addr:street"] || "";
        const lanes = numberTag(tags, "lanes") || (numberTag(tags, "lanes:forward") + numberTag(tags, "lanes:backward"));
        const roadType = detectRoadType(tags, name);
        const isRoundabout = tags.junction === "roundabout" || tags.junction === "circular";
        bundle.roads.push({
          id: `road-${el.id}`,
          name,
          ref: tags.ref || "",
          highway: tags.highway,
          oneway: tags.oneway === "yes" || tags.oneway === "1" || isRoundabout,
          hasSidewalk: Boolean(tags.sidewalk && tags.sidewalk !== "no") || /footway|pedestrian|path/.test(tags.highway),
          hasMedian: tags.dual_carriageway === "yes"
            || Boolean(tags.divider && tags.divider !== "no")
            || roadType === "avenue"
            || roadType === "expressway",
          treeLined: tags.tree_lined === "yes"
            || tags["tree_lined:both"] === "yes"
            || (roadType === "avenue" && !/flyover|bridge/.test(tags.layer || "")),
          waterMedian: tags.waterway === "stream" || tags.water === "canal" || /\b(kali|sungai|kanal|sunter)\b/i.test(name),
          isRoundabout,
          lanes,
          surface: tags.surface || "",
          roadType,
          points,
        });
        return;
      }

      if (tags.railway && /rail|light_rail|tram|subway|narrow_gauge/.test(tags.railway)) {
        bundle.rails.push({
          id: `rail-${el.id}`,
          name: tags.name || tags.ref || "",
          railway: tags.railway,
          points,
        });
        return;
      }

      if (tags.waterway || tags.natural === "water" || tags.water || /canal|drain|ditch/.test(tags.man_made || "")) {
        bundle.waterways.push({
          id: `water-${el.id}`,
          name: tags.name || "",
          waterway: tags.waterway || tags.water || tags.natural || tags.man_made || "water",
          points,
        });
        return;
      }

      if (tags.leisure || tags.landuse || /wood|grassland|scrub|tree_row/.test(tags.natural || "")) {
        bundle.greens.push({
          id: `green-${el.id}`,
          name: tags.name || "",
          kind: tags.leisure || tags.landuse || tags.natural || "green",
          points,
        });
      }
    });

    return bundle;
  } catch (err) {
    console.warn("Overpass road guide failed:", err);
    return { roads: [], rails: [], crossings: [], waterways: [], greens: [] };
  }
}

async function refreshRoadGuideLayer(force = false): Promise<void> {
  if (!state.roadGuideLayer) state.roadGuideLayer = L.layerGroup().addTo(map);
  if (state.baseMode !== "street") {
    state.roadGuideLayer.clearLayers();
    return;
  }

  const zoom = map.getZoom();
  if (zoom < 15) {
    state.roadGuideLayer.clearLayers();
    return;
  }

  const bounds = map.getBounds();
  if (!force && lastRoadGuideFetchBounds && lastRoadGuideFetchBounds.contains(bounds.getSouthWest()) && lastRoadGuideFetchBounds.contains(bounds.getNorthEast())) return;
  lastRoadGuideFetchBounds = bounds.pad(0.2);

  const guide = await fetchRoadGuidesForBounds(bounds);
  state.roadGuideLayer.clearLayers();
  const limit = zoom >= 18 ? 120 : zoom >= 16 ? 84 : 52;

  guide.greens.slice(0, zoom >= 17 ? 80 : 44).forEach((green) => {
    if (green.points.length >= 4 && isClosedGuideRing(green.points)) {
      L.polygon(green.points, greenGuideStyle(green)).addTo(state.roadGuideLayer as L.LayerGroup);
    } else {
      L.polyline(green.points, { ...greenGuideStyle(green), fillOpacity: 0, weight: 3.5, opacity: 0.5 }).addTo(state.roadGuideLayer as L.LayerGroup);
    }
  });

  guide.waterways.slice(0, zoom >= 17 ? 70 : 36).forEach((water) => {
    if (water.points.length >= 4 && isClosedGuideRing(water.points)) {
      L.polygon(water.points, {
        color: "#8bd8ef",
        fillColor: "#c9f0fb",
        fillOpacity: 0.64,
        weight: 1,
        opacity: 0.78,
        interactive: false,
      }).addTo(state.roadGuideLayer as L.LayerGroup);
    } else {
      L.polyline(water.points, waterGuideStyle(water)).addTo(state.roadGuideLayer as L.LayerGroup);
    }
    const mid = roadGuideMidpoint(water.points);
    if (mid && water.name && zoom >= 16) {
      L.marker(mid.latlng, {
        icon: makeWaterNameIcon(water.name, mid.bearing),
        interactive: false,
        zIndexOffset: 110,
      }).addTo(state.roadGuideLayer as L.LayerGroup);
    }
  });

  guide.rails.slice(0, zoom >= 17 ? 55 : 30).forEach((rail) => {
    L.polyline(rail.points, railGuideStyle(true)).addTo(state.roadGuideLayer as L.LayerGroup);
    L.polyline(rail.points, railGuideStyle(false)).addTo(state.roadGuideLayer as L.LayerGroup);
    L.polyline(rail.points, railSleeperStyle()).addTo(state.roadGuideLayer as L.LayerGroup);
  });

  guide.roads
    .sort((a, b) => {
      const ca = roadRenderClass(a);
      const cb = roadRenderClass(b);
      const weight = { major: 0, street: 1, foot: 2, service: 3 };
      return weight[ca] - weight[cb];
    })
    .slice(0, limit)
    .forEach((road, index) => {
      const cls = roadRenderClass(road);
      if (road.isRoundabout && isClosedGuideRing(road.points)) {
        L.polygon(road.points, roadRoundaboutGreenStyle()).addTo(state.roadGuideLayer as L.LayerGroup);
        const center = guideCentroid(road.points);
        if (center && zoom >= 16) {
          L.marker(center, {
            icon: makeRoundaboutIcon(road),
            interactive: false,
            zIndexOffset: 107,
          }).addTo(state.roadGuideLayer as L.LayerGroup);
        }
      }
      if (road.hasSidewalk && cls !== "foot") {
        L.polyline(road.points, roadSidewalkStyle(road)).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      if (cls !== "foot") {
        L.polyline(road.points, roadGuideStyle(road, true)).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      L.polyline(road.points, roadGuideStyle(road, false)).addTo(state.roadGuideLayer as L.LayerGroup);
      if (road.hasMedian) {
        L.polyline(road.points, roadMedianStyle(road)).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      if (road.treeLined && road.roadType !== "foot") {
        L.polyline(road.points, roadAvenueTreeStyle(road)).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      if (road.waterMedian && road.roadType !== "foot") {
        L.polyline(road.points, roadWaterMedianStyle()).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      if (road.roadType === "avenue" || road.roadType === "expressway") {
        L.polyline(road.points, roadLaneDividerStyle(road)).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      const mid = roadGuideMidpoint(road.points);
      if (!mid) return;
      const shouldShowArrow = road.oneway || cls === "major" || index % 2 === 0;
      if (shouldShowArrow) {
        const arrowCount = road.roadType === "avenue" || road.roadType === "expressway" ? 3 : road.oneway ? 2 : 1;
        roadGuideSamplePoints(road.points, arrowCount).forEach((sample) => {
          L.marker(sample.latlng, {
            icon: makeRoadArrowIcon(sample.bearing, road),
            interactive: false,
            zIndexOffset: 112,
          }).addTo(state.roadGuideLayer as L.LayerGroup);
        });
      }
      if (road.name && zoom >= 16 && index % (zoom >= 18 ? 2 : 4) === 0) {
        L.marker(mid.latlng, {
          icon: makeRoadNameIcon(road.name, mid.bearing),
          interactive: false,
          zIndexOffset: 109,
        }).addTo(state.roadGuideLayer as L.LayerGroup);
      }
      if (zoom >= 17 && road.roadType !== "foot" && index % (zoom >= 18 ? 3 : 5) === 0) {
        L.marker(mid.latlng, {
          icon: makeRoadTypeIcon(road),
          interactive: false,
          zIndexOffset: 108,
        }).addTo(state.roadGuideLayer as L.LayerGroup);
      }
    });

  guide.crossings.slice(0, zoom >= 17 ? 80 : 38).forEach((crossing) => {
    L.marker(crossing.latlng, {
      icon: makeRailCrossingIcon(crossing),
      interactive: false,
      zIndexOffset: 118,
    }).addTo(state.roadGuideLayer as L.LayerGroup);
  });
}

let visionSegmenterPromise: Promise<any> | null = null;
let visionBusy = false;
let lastVisionKey = "";
let visionStatusHideTimer = 0;
let visionFeatureCache: VisionFeatureCacheEntry[] = loadVisionFeatureCache();

function showVisionStatus(message: string, progress?: number, done = false): void {
  let el = document.getElementById("vision-status") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "vision-status";
    el.className = "vision-status";
    mapRoot.appendChild(el);
  }
  el.classList.toggle("done", done);
  const pct = typeof progress === "number" ? clamp(progress, 0, 100) : null;
  el.innerHTML = `
  <span class="vision-status-dot"></span>
  <span>${escapeHtml(message)}</span>
  ${pct === null ? "" : `<strong>${Math.round(pct)}%</strong>`}
`;
  window.clearTimeout(visionStatusHideTimer);
  if (done) {
    visionStatusHideTimer = window.setTimeout(() => el?.remove(), 1900);
  }
}

function hideVisionStatusSoon(): void {
  const el = document.getElementById("vision-status");
  window.clearTimeout(visionStatusHideTimer);
  visionStatusHideTimer = window.setTimeout(() => el?.remove(), 1200);
}

function loadVisionFeatureCache(): VisionFeatureCacheEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(VISION_FEATURE_CACHE_STORAGE_KEY) || "[]") as VisionFeatureCacheEntry[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((entry) => entry && typeof entry.key === "string" && Array.isArray(entry.features))
      .filter((entry) => now - Number(entry.createdAt || 0) < VISION_FEATURE_CACHE_MAX_AGE)
      .slice(0, VISION_FEATURE_CACHE_LIMIT);
  } catch {
    return [];
  }
}

function saveVisionFeatureCache(): void {
  try {
    localStorage.setItem(VISION_FEATURE_CACHE_STORAGE_KEY, JSON.stringify(visionFeatureCache.slice(0, VISION_FEATURE_CACHE_LIMIT)));
  } catch {
    visionFeatureCache = visionFeatureCache.slice(0, Math.max(12, Math.floor(VISION_FEATURE_CACHE_LIMIT / 2)));
  }
}

function cachedVisionFeatures(key: string): VisionFeatureRecord[] | null {
  const hitIndex = visionFeatureCache.findIndex((entry) => entry.key === key);
  if (hitIndex < 0) return null;
  const [entry] = visionFeatureCache.splice(hitIndex, 1);
  visionFeatureCache.unshift(entry);
  return entry.features
    .filter((feature) => isValidCoordinate(feature.lat, feature.lng))
    .map((feature, index) => ({
      id: `vision-cache-${key}-${index}`,
      kind: feature.kind,
      latlng: L.latLng(feature.lat, feature.lng),
      score: feature.score,
      radius: feature.radius,
    }));
}

function rememberVisionFeatures(key: string, features: VisionFeatureRecord[]): void {
  const compact = features.slice(0, 360).map((feature) => ({
    kind: feature.kind,
    lat: Number(feature.latlng.lat.toFixed(7)),
    lng: Number(feature.latlng.lng.toFixed(7)),
    score: Number(feature.score.toFixed(3)),
    radius: Number(feature.radius.toFixed(2)),
  }));
  visionFeatureCache = visionFeatureCache.filter((entry) => entry.key !== key);
  visionFeatureCache.unshift({ key, createdAt: Date.now(), features: compact });
  visionFeatureCache = visionFeatureCache.slice(0, VISION_FEATURE_CACHE_LIMIT);
  saveVisionFeatureCache();
}

async function loadVisionSegmenter(progress?: (value: number) => void): Promise<any> {
  if (visionSegmenterPromise) return visionSegmenterPromise;
  visionSegmenterPromise = (async () => {
    const mod = await import("@huggingface/transformers");
    const pipeline = (mod as any).pipeline;
    const env = (mod as any).env;
    if (env) {
      env.allowRemoteModels = true;
      env.useBrowserCache = true;
      env.allowLocalModels = false;
    }

    const progressByFile: Record<string, number> = {};
    const progressCallback = (info: any) => {
      if (info?.status === "progress" && info.file) {
        progressByFile[info.file] = Number(info.progress) || 0;
        const values = Object.values(progressByFile);
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        progress?.(avg);
      } else if (info?.status === "ready") {
        progress?.(100);
      }
    };

    const preferred: any = {
      dtype: "q8",
      progress_callback: progressCallback,
    };
    if ((navigator as any).gpu) preferred.device = "webgpu";

    try {
      return await pipeline("image-segmentation", VISION_SEGMENTATION_MODEL, preferred);
    } catch (firstErr) {
      console.warn("Vision WebGPU/q8 load failed, falling back to WASM:", firstErr);
      try {
        return await pipeline("image-segmentation", VISION_SEGMENTATION_MODEL, {
          dtype: "q8",
          progress_callback: progressCallback,
        });
      } catch (secondErr) {
        console.warn("Vision q8 load failed, falling back to default dtype:", secondErr);
        return pipeline("image-segmentation", VISION_SEGMENTATION_MODEL, {
          progress_callback: progressCallback,
        });
      }
    }
  })();
  return visionSegmenterPromise;
}

function latLngToGlobalPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const size = 256 * Math.pow(2, zoom);
  return {
    x: ((lng + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * size,
  };
}

function globalPixelToLatLng(x: number, y: number, zoom: number): L.LatLng {
  const size = 256 * Math.pow(2, zoom);
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return L.latLng(lat, lng);
}

function satelliteVisionTileUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function loadVisionTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function captureSatelliteVisionCanvas(): Promise<SatelliteVisionCapture> {
  const zoom = clamp(Math.round(map.getZoom()), VISION_MIN_ZOOM, 18);
  const size = isMobile() ? 384 : VISION_CANVAS_SIZE;
  const center = map.getCenter();
  const centerPx = latLngToGlobalPixel(center.lat, center.lng, zoom);
  const origin = {
    x: centerPx.x - size / 2,
    y: centerPx.y - size / 2,
  };
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D tidak tersedia");
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, size, size);

  const maxTile = Math.pow(2, zoom);
  const startX = Math.floor(origin.x / 256);
  const startY = Math.floor(origin.y / 256);
  const endX = Math.floor((origin.x + size) / 256);
  const endY = Math.floor((origin.y + size) / 256);
  const draws: Promise<void>[] = [];
  let loadedTiles = 0;

  for (let tx = startX; tx <= endX; tx += 1) {
    for (let ty = startY; ty <= endY; ty += 1) {
      if (ty < 0 || ty >= maxTile) continue;
      const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
      const dx = Math.round(tx * 256 - origin.x);
      const dy = Math.round(ty * 256 - origin.y);
      draws.push(loadVisionTileImage(satelliteVisionTileUrl(zoom, wrappedX, ty)).then((img) => {
        if (!img) return;
        loadedTiles += 1;
        ctx.drawImage(img, dx, dy, 256, 256);
      }));
    }
  }

  await Promise.all(draws);
  if (!loadedTiles) throw new Error("Tile satelit tidak bisa dibaca untuk computer vision");

  return {
    canvas,
    width: size,
    height: size,
    zoom,
    pixelToLatLng: (x, y) => globalPixelToLatLng(origin.x + x, origin.y + y, zoom),
  };
}

function visionKindFromLabel(rawLabel: string): VisionFeatureKind | null {
  const label = rawLabel.toLowerCase();
  if (/\b(water|river|sea|lake|canal|pool|pond|waterfall)\b/.test(label)) return "water";
  if (/\b(sidewalk|pavement|path|walkway|footpath|stairway|stairs)\b/.test(label)) return "sidewalk";
  if (/\b(road|street|runway|highway|route)\b/.test(label)) return "road";
  if (/\b(tree|plant|grass|field|earth|flower|palm|forest|wood|vegetation|land|terrain)\b/.test(label)) return "vegetation";
  if (/\b(building|house|skyscraper|edifice|apartment|booth|tower)\b/.test(label)) return "building";
  return null;
}

function visionMaskData(mask: any): VisionMaskData | null {
  if (!mask) return null;
  if (mask instanceof HTMLCanvasElement) {
    const ctx = mask.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const image = ctx.getImageData(0, 0, mask.width, mask.height);
    return { width: mask.width, height: mask.height, data: image.data, channels: 4 };
  }
  if (typeof ImageData !== "undefined" && mask instanceof ImageData) {
    return { width: mask.width, height: mask.height, data: mask.data, channels: 4 };
  }
  if (mask.canvas instanceof HTMLCanvasElement) return visionMaskData(mask.canvas);
  const width = Number(mask.width || mask.naturalWidth || 0);
  const height = Number(mask.height || mask.naturalHeight || 0);
  const data = mask.data as Uint8ClampedArray | Uint8Array | undefined;
  if (!width || !height || !data) return null;
  const channels = data.length >= width * height * 4 ? 4 : 1;
  return { width, height, data, channels };
}

function visionMaskValue(mask: VisionMaskData, x: number, y: number, capture: SatelliteVisionCapture): number {
  const ix = clamp(Math.floor((x / capture.width) * mask.width), 0, mask.width - 1);
  const iy = clamp(Math.floor((y / capture.height) * mask.height), 0, mask.height - 1);
  const offset = (iy * mask.width + ix) * mask.channels;
  if (mask.channels === 1) return Number(mask.data[offset] || 0);
  const alpha = Number(mask.data[offset + 3] || 0);
  if (alpha) return alpha;
  return (Number(mask.data[offset] || 0) + Number(mask.data[offset + 1] || 0) + Number(mask.data[offset + 2] || 0)) / 3;
}

function visionSampleStep(kind: VisionFeatureKind): number {
  const zoom = map.getZoom();
  const zoomFactor = zoom >= 18 ? 0.78 : zoom >= 17 ? 0.9 : 1.18;
  const base = kind === "vegetation" ? 26 : kind === "water" ? 22 : kind === "sidewalk" ? 28 : kind === "road" ? 34 : 42;
  return Math.round(base * zoomFactor);
}

function visionFeatureLimit(kind: VisionFeatureKind): number {
  const zoom = map.getZoom();
  const zoomFactor = zoom >= 18 ? 1.2 : zoom >= 17 ? 1 : 0.62;
  const base = kind === "vegetation" ? 120 : kind === "water" ? 96 : kind === "sidewalk" ? 86 : kind === "road" ? 64 : 44;
  return Math.round(base * zoomFactor);
}

function visionRadius(kind: VisionFeatureKind, score: number): number {
  const zoomScale = map.getZoom() >= 18 ? 1.08 : map.getZoom() >= 17 ? 0.96 : 0.76;
  const base = kind === "vegetation" ? 2.8 : kind === "water" ? 3.2 : kind === "sidewalk" ? 2.2 : kind === "road" ? 2.5 : 2.4;
  return clamp((base + score * 2) * zoomScale, 1.8, 6.2);
}

function extractVisionFeatures(result: any, capture: SatelliteVisionCapture): VisionFeatureRecord[] {
  const segments = Array.isArray(result) ? result : Array.isArray(result?.segments) ? result.segments : [];
  const features: VisionFeatureRecord[] = [];
  const countByKind: Record<VisionFeatureKind, number> = {
    road: 0,
    sidewalk: 0,
    vegetation: 0,
    water: 0,
    building: 0,
  };

  segments.forEach((segment: any, segmentIndex: number) => {
    const kind = visionKindFromLabel(String(segment.label || segment.class || ""));
    if (!kind) return;
    const mask = visionMaskData(segment.mask || segment.bitmap || segment.image);
    if (!mask) return;
    const score = clamp(Number(segment.score) || 0.55, 0.2, 1);
    const step = visionSampleStep(kind);
    const limit = visionFeatureLimit(kind);
    const phase = (segmentIndex * 11) % step;

    for (let y = phase; y < capture.height && countByKind[kind] < limit; y += step) {
      for (let x = phase; x < capture.width && countByKind[kind] < limit; x += step) {
        const value = visionMaskValue(mask, x, y, capture);
        if (value < 46) continue;
        if (((Math.round(x) + Math.round(y) + segmentIndex * 17) % (kind === "vegetation" ? 2 : 3)) !== 0) continue;
        const latlng = capture.pixelToLatLng(x, y);
        if (!map.getBounds().pad(0.08).contains(latlng)) continue;
        countByKind[kind] += 1;
        features.push({
          id: `vision-${kind}-${segmentIndex}-${countByKind[kind]}`,
          kind,
          latlng,
          score,
          radius: visionRadius(kind, score),
        });
      }
    }
  });

  return features;
}

function renderVisionFeatures(features: VisionFeatureRecord[]): void {
  if (!state.visionLayer) state.visionLayer = L.layerGroup().addTo(map);
  state.visionLayer.clearLayers();

  const styleByKind: Record<VisionFeatureKind, L.CircleMarkerOptions> = {
    vegetation: {
      radius: 3,
      color: "#16a34a",
      fillColor: "#4ade80",
      fillOpacity: 0.72,
      opacity: 0.62,
      weight: 1,
      interactive: false,
    },
    water: {
      radius: 3.4,
      color: "#0284c7",
      fillColor: "#7dd3fc",
      fillOpacity: 0.64,
      opacity: 0.62,
      weight: 1,
      interactive: false,
    },
    sidewalk: {
      radius: 2.5,
      color: "#94a3b8",
      fillColor: "#e2e8f0",
      fillOpacity: 0.76,
      opacity: 0.56,
      weight: 1,
      interactive: false,
    },
    road: {
      radius: 2.6,
      color: "#f59e0b",
      fillColor: "#fde68a",
      fillOpacity: 0.46,
      opacity: 0.44,
      weight: 1,
      interactive: false,
    },
    building: {
      radius: 2.3,
      color: "#c08457",
      fillColor: "#f1d6bb",
      fillOpacity: 0.42,
      opacity: 0.4,
      weight: 1,
      interactive: false,
    },
  };

  features.forEach((feature) => {
    const style = { ...styleByKind[feature.kind], radius: feature.radius };
    L.circleMarker(feature.latlng, style).addTo(state.visionLayer as L.LayerGroup);
  });
}

function visionRefreshKey(): string {
  const zoom = clamp(Math.round(map.getZoom()), VISION_MIN_ZOOM, 18);
  const center = map.getCenter();
  const px = latLngToGlobalPixel(center.lat, center.lng, zoom);
  return `${state.baseMode}:${zoom}:${Math.floor(px.x / 192)}:${Math.floor(px.y / 192)}`;
}

async function refreshVisionLayer(force = false): Promise<void> {
  if (!state.visionLayer) state.visionLayer = L.layerGroup().addTo(map);
  if (state.baseMode !== "street" || map.getZoom() < VISION_MIN_ZOOM) {
    state.visionLayer.clearLayers();
    return;
  }
  if (visionBusy) return;
  const key = visionRefreshKey();
  if (!force && key === lastVisionKey) return;
  const cached = cachedVisionFeatures(key);
  if (cached && cached.length) {
    lastVisionKey = key;
    renderVisionFeatures(cached);
    showVisionStatus(`Vision 2D dari cache lokal - ${cached.length} petunjuk`, 100, true);
    hideVisionStatusSoon();
    return;
  }
  visionBusy = true;
  lastVisionKey = key;
  showVisionStatus("Memuat AI vision peta 2D...");
  try {
    const segmenter = await loadVisionSegmenter((progress) => {
      showVisionStatus("Mengunduh model vision peta 2D", progress);
    });
    showVisionStatus("Membaca citra satelit viewport...");
    const capture = await captureSatelliteVisionCanvas();
    showVisionStatus("Mendeteksi pohon, air, trotoar, dan bangunan...");
    const result = await segmenter(capture.canvas);
    const features = extractVisionFeatures(result, capture);
    renderVisionFeatures(features);
    rememberVisionFeatures(key, features);
    showVisionStatus(`Vision 2D selesai - ${features.length} petunjuk real`, 100, true);
  } catch (err) {
    console.warn("Vision enhancement failed:", err);
    showVisionStatus("Vision belum tersedia, memakai OSM/Overpass", undefined, true);
  } finally {
    visionBusy = false;
    hideVisionStatusSoon();
  }
}

let lastOverpassFetchBounds: L.LatLngBounds | null = null;

// Helper: Update MapLibre POI layer with GeoJSON features
function updateMapLibrePoiLayer(pois: PoiRecord[]): void {
  const maplibreMap = state.maplibreMap;
  if (!maplibreMap || state.baseMode !== "3d") return;

  try {
    const features = pois.map(poi => ({
      type: "Feature",
      properties: {
        id: poi.id,
        title: poi.title,
        kind: poi.kind,
        "icon-emoji": poi.icon // Use emoji from POI record
      },
      geometry: { type: "Point", coordinates: [poi.lng, poi.lat] }
    }));

    const source = maplibreMap.getSource("poi-source");
    if (source && "setData" in source) {
      (source as any).setData({ type: "FeatureCollection", features });
    }
  } catch (err) {
    console.warn("Failed to update POI layer:", err);
  }
}

async function refreshOverpassLayer(): Promise<void> {
  const bounds = map.getBounds();
  // Avoid refetch if bounds similar
  if (lastOverpassFetchBounds && lastOverpassFetchBounds.contains(bounds.getSouthWest()) && lastOverpassFetchBounds.contains(bounds.getNorthEast())) return;
  lastOverpassFetchBounds = bounds.pad(0.2);
  const pois = await fetchOverpassFeaturesForBounds(bounds);

  // If Overpass returned empty and we have no POI data yet, provide a local fallback
  let finalPois = pois;
  if (!pois || pois.length === 0) {
    console.warn("Overpass empty — using local POI fallback for UI testing.");
    const c = map.getCenter();
    finalPois = [
      { id: 'local-school-1', kind: 'campus', title: 'SD Negeri 1', description: '', address: '', imageUrl: POI_LIBRARY.campus.imageUrl, rating: POI_LIBRARY.campus.rating, icon: poiVisual('campus').icon, lat: c.lat + 0.0012, lng: c.lng + 0.0012 },
      { id: 'local-worship-1', kind: 'worship', title: 'Masjid Al Furqan', description: '', address: '', imageUrl: POI_LIBRARY.worship.imageUrl, rating: POI_LIBRARY.worship.rating, icon: poiVisual('worship').icon, lat: c.lat - 0.0010, lng: c.lng - 0.0016 },
      { id: 'local-mall-1', kind: 'mall', title: 'Pusat Perbelanjaan', description: '', address: '', imageUrl: POI_LIBRARY.mall.imageUrl, rating: POI_LIBRARY.mall.rating, icon: poiVisual('mall').icon, lat: c.lat - 0.0014, lng: c.lng + 0.0018 },
      { id: 'local-hospital-1', kind: 'hospital', title: 'Klinik Sehat', description: '', address: '', imageUrl: POI_LIBRARY.hospital.imageUrl, rating: POI_LIBRARY.hospital.rating, icon: poiVisual('hospital').icon, lat: c.lat + 0.0020, lng: c.lng - 0.0010 },
      { id: 'local-parking-1', kind: 'parking', title: 'Parkir Umum', description: '', address: '', imageUrl: POI_LIBRARY.parking.imageUrl, rating: POI_LIBRARY.parking.rating, icon: poiVisual('parking').icon, lat: c.lat - 0.0018, lng: c.lng - 0.0015 },
    ];
  }

  finalPois = rankPoisForView(finalPois);

  // Update MapLibre POI layer (for 3D)
  updateMapLibrePoiLayer(finalPois);

  if (!state.overpassLayer) state.overpassLayer = L.layerGroup().addTo(map);
  state.overpassLayer.clearLayers();
  finalPois.forEach((poi) => {
    const marker = L.marker([poi.lat, poi.lng], {
      icon: makePoiIcon(poi, poiMarkerSizeByZoom()),
      interactive: true,
      riseOnHover: true,
      zIndexOffset: 450,
    }).addTo(state.overpassLayer as L.LayerGroup);
    (marker.options as any).poiId = poi.id;
    marker.on('click', () => handlePoiClick(poi));
    const el = marker.getElement() as HTMLElement | null;
    if (el) el.style.display = '';
    // track poi data/marker so other features can use them
    state.poiData.set(poi.id, poi);
    state.poiMarkers.set(poi.id, marker);
  });

  updateTabletCategoryView();
}

// When user clicks on raster tile, query a small radius for nearby features and open modal
map.on('click', async (ev: L.LeafletMouseEvent) => {
  const lat = ev.latlng.lat;
  const lng = ev.latlng.lng;

  // In 3D mode, check if click is on a MapLibre POI
  if (state.baseMode === '3d' && state.maplibreMap) {
    try {
      const features = state.maplibreMap.querySourceFeatures("poi-source", {
        sourceLayer: undefined
      }).filter((f: any) => {
        if (!f.properties || !f.geometry) return false;
        const [lng2, lat2] = f.geometry.coordinates;
        const dist = Math.sqrt(Math.pow(lat2 - lat, 2) + Math.pow(lng2 - lng, 2));
        return dist < 0.003; // ~300m at this zoom level
      });

      if (features.length > 0) {
        const feature = features[0];
        const poi = state.poiData.get(feature.properties?.id);
        if (poi) {
          handlePoiClick(poi);
          return;
        }
      }
    } catch (err) {
      // ignore MapLibre query errors
    }
  }

  // Fallback: query Overpass for nearby features
  try {
    const q = `
    [out:json][timeout:10];
    (
      node(around:80,${lat},${lng})["amenity"];
      way(around:80,${lat},${lng})["amenity"];
      relation(around:80,${lat},${lng})["amenity"];
      node(around:80,${lat},${lng})["shop"];
      way(around:80,${lat},${lng})["shop"];
      relation(around:80,${lat},${lng})["shop"];
      node(around:80,${lat},${lng})["tourism"];
      way(around:80,${lat},${lng})["tourism"];
      relation(around:80,${lat},${lng})["tourism"];
      node(around:80,${lat},${lng})["public_transport"];
      node(around:80,${lat},${lng})["highway"="bus_stop"];
      node(around:80,${lat},${lng})["railway"="station"];
      way(around:80,${lat},${lng})["leisure"="park"];
      relation(around:80,${lat},${lng})["leisure"="park"];
    );
    out center tags;
  `;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: q,
    });
    if (!res.ok) return;
    const data = await res.json();
    const el = (data.elements || [])[0];
    if (!el) return;
    const tags = el.tags || {};
    const latR = el.type === 'node' ? el.lat : (el.center && el.center.lat) || el.lat;
    const lngR = el.type === 'node' ? el.lon : (el.center && el.center.lon) || el.lon;
    const kind = classifyPoiKind(tags);
    const poi: PoiRecord = {
      id: `overpass-click-${el.type}-${el.id}`,
      kind,
      title: poiNameFromTags(tags, `Feature ${el.id}`),
      description: tags.description || tags['note'] || '',
      address: poiAddressFromTags(tags),
      imageUrl: tags.image || POI_LIBRARY[kind].imageUrl,
      rating: POI_LIBRARY[kind].rating,
      icon: poiVisual(kind).icon,
      lat: latR, lng: lngR,
    };
    handlePoiClick(poi);
  } catch (err) {
    // ignore
  }
});

map.on('moveend', () => {
  if (state.baseMode === '3d') {
    if (state.overpassLayer) state.overpassLayer.clearLayers();
    if (state.roadGuideLayer) state.roadGuideLayer.clearLayers();
    if (state.visionLayer) state.visionLayer.clearLayers();
    return;
  }
  void refreshOverpassLayer();
  void refreshRoadGuideLayer();
  void refreshVisionLayer();
});

// ─── Helpers ────────────────────────────────────────────────────

function isDeviceStatus(v: unknown): v is DeviceStatus {
  return v === "online" || v === "offline" || v === "degraded";
}
function isCameraMode(v: unknown): v is CameraMode {
  return v === "webrtc" || v === "mjpeg";
}
function isTrafficColor(v: unknown): v is TrafficColor {
  return v === "red" || v === "yellow" || v === "green";
}
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function finiteNumber(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
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

function normalizeCameraDataset(raw: unknown): TrafficCameraDataset | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const dataset: TrafficCameraDataset = {
    snapshot1Url: stringValue(record.snapshot1Url) || stringValue(record.nama1) || stringValue(record.image1),
    snapshot2Url: stringValue(record.snapshot2Url) || stringValue(record.nama2) || stringValue(record.image2),
    updatedAt: normalizeEpoch(finiteNumber(record.updatedAt) ?? 0),
    source: stringValue(record.source),
    path: stringValue(record.path),
  };
  return dataset.snapshot1Url || dataset.snapshot2Url || dataset.updatedAt ? dataset : undefined;
}

function normalizeUpdateInfo(rawRecord: Record<string, unknown>): ControllerUpdateInfo | undefined {
  const nested = rawRecord.update && typeof rawRecord.update === "object"
    ? rawRecord.update as Record<string, unknown>
    : {};
  const status = typeof nested.status === "string" ? nested.status
    : typeof rawRecord.updateStatus === "string" ? rawRecord.updateStatus
      : undefined;
  const stage = typeof nested.stage === "string" ? nested.stage
    : typeof rawRecord.updateStage === "string" ? rawRecord.updateStage
      : undefined;
  const message = typeof nested.message === "string" ? nested.message
    : typeof rawRecord.updateMessage === "string" ? rawRecord.updateMessage
      : undefined;
  const updatedAt = finiteNumber(nested.updatedAt) ?? finiteNumber(rawRecord.updateUpdatedAt);
  const source = typeof nested.source === "string" ? nested.source
    : typeof rawRecord.updateSource === "string" ? rawRecord.updateSource
      : undefined;

  if (!status && !stage && !message && !updatedAt) return undefined;
  return {
    status: status === "running" || status === "complete" || status === "error" ? status : undefined,
    stage: stage?.trim() || undefined,
    message: message?.trim() || undefined,
    updatedAt,
    source: source?.trim() || undefined,
  };
}
function normalizeVehicleBreakdown(v: unknown): VehicleBreakdown | undefined {
  if (!v || typeof v !== "object") return undefined;
  const raw = v as Record<string, unknown>;
  const car = Math.max(0, Math.round(finiteNumber(raw.car) ?? 0));
  const motorcycle = Math.max(0, Math.round(finiteNumber(raw.motorcycle) ?? 0));
  const bus = Math.max(0, Math.round(finiteNumber(raw.bus) ?? 0));
  const truck = Math.max(0, Math.round(finiteNumber(raw.truck) ?? 0));
  const bicycle = Math.max(0, Math.round(finiteNumber(raw.bicycle) ?? 0));
  const total = Math.max(car + motorcycle + bus + truck + bicycle, Math.round(finiteNumber(raw.total) ?? 0));
  return { car, motorcycle, bus, truck, bicycle, total };
}
const VEHICLE_LABELS = new Set(["car", "motorcycle", "bus", "truck", "bicycle"]);
const DETECTION_LABELS_ID: Record<string, string> = {
  person: "Orang",
  bicycle: "Sepeda",
  car: "Mobil",
  motorcycle: "Motor",
  bus: "Bus",
  truck: "Truk",
  "traffic light": "Lampu",
};
function detectionLabel(label: string): string {
  const key = label.trim().toLowerCase();
  return DETECTION_LABELS_ID[key] || label;
}
function normalizeDetections(v: unknown): YoloDetection[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const confidence = clamp(finiteNumber(raw.confidence) ?? 0, 0, 1);
    const x = Math.max(0, finiteNumber(raw.x) ?? 0);
    const y = Math.max(0, finiteNumber(raw.y) ?? 0);
    const width = Math.max(0, finiteNumber(raw.width) ?? 0);
    const height = Math.max(0, finiteNumber(raw.height) ?? 0);
    if (!label || confidence <= 0 || width <= 0 || height <= 0) return [];
    const key = label.toLowerCase();
    const vehicle = typeof raw.vehicle === "boolean" ? raw.vehicle : VEHICLE_LABELS.has(key);
    return [{ label, confidence, vehicle, x, y, width, height }];
  }).sort((a, b) => b.confidence - a.confidence).slice(0, 80);
}
function normalizeEpoch(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v < 1e11 ? v * 1000 : v;
}
function formatTime(v: number): string {
  if (v <= 0) return "-";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" })
    .format(new Date(v));
}
function formatAge(v: number): string {
  if (v <= 0) return "-";
  const ms = Math.max(0, Date.now() - v);
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}
function escapeHtml(v: string): string {
  return v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// Helpers: bearing and distance/ETA formatting
function toRad(deg: number) { return deg * Math.PI / 180; }
function toDeg(rad: number) { return rad * 180 / Math.PI; }
function computeBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatEtaSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "-";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function trafficColorLabel(color: TrafficColor): string {
  if (color === "red") return "🔴 Tunggu sebentar";
  if (color === "yellow") return "🟡 Bersiaplah";
  return "🟢 Lewati sekarang";
}

function trafficColorFor(device: DeviceRecord): TrafficColor {
  if (device.trafficColor) return device.trafficColor;
  const seed = hashString(`${device.id}:${Math.floor(Date.now() / 4000)}`);
  const colors: TrafficColor[] = ["red", "yellow", "green"];
  return colors[seed % colors.length];
}

function trafficDurationFor(color: TrafficColor, device: DeviceRecord): number {
  if (typeof device.trafficDuration === "number" && Number.isFinite(device.trafficDuration)) {
    return Math.max(1, Math.round(device.trafficDuration));
  }
  const seed = hashString(`${device.id}:${Math.floor(Date.now() / 4000)}:${color}`);
  if (color === "red") return 8 + (seed % 18);
  if (color === "yellow") return 3 + (seed % 4);
  return 10 + (seed % 20);
}

function vehicleCountFor(device: DeviceRecord): number {
  if (typeof device.vehicleCount === "number" && Number.isFinite(device.vehicleCount)) {
    return Math.max(0, Math.round(device.vehicleCount));
  }
  const seed = hashString(`${device.id}:${Math.floor(Date.now() / 5000)}`);
  return 5 + (seed % 70);
}

function buildTrafficState(device: DeviceRecord): TrafficState {
  const color = trafficColorFor(device);
  const roadName = state.roadNameById.get(device.id) || device.roadName || device.roadHint || "Jalan tidak terdeteksi";
  const vehicleCount = vehicleCountFor(device);
  const duration = trafficDurationFor(color, device);
  return {
    color,
    duration,
    phaseStartedAt: device.trafficStartedAt || 0,
    vehicleCount,
    roadName,
    recommendation: trafficColorLabel(color),
    updatedAt: Date.now(),
  };
}

function vehicleBreakdownText(breakdown?: VehicleBreakdown): string {
  if (!breakdown) return "-";
  const parts = [
    ["Mobil", breakdown.car],
    ["Motor", breakdown.motorcycle],
    ["Bus", breakdown.bus],
    ["Truk", breakdown.truck],
    ["Sepeda", breakdown.bicycle],
  ].filter(([, value]) => Number(value) > 0);
  return parts.length ? parts.map(([label, value]) => `${label} ${value}`).join(" / ") : "0 kendaraan";
}

function vehicleStatsForDevice(device?: DeviceRecord | null, traffic?: TrafficState | null): VehicleBreakdown {
  const source = device?.vehicleBreakdown;
  const total = Math.max(0, Math.round(
    source?.total
    ?? device?.vehicleCount
    ?? traffic?.vehicleCount
    ?? 0,
  ));
  return {
    car: Math.max(0, Math.round(source?.car ?? 0)),
    motorcycle: Math.max(0, Math.round(source?.motorcycle ?? 0)),
    bicycle: Math.max(0, Math.round(source?.bicycle ?? 0)),
    bus: Math.max(0, Math.round(source?.bus ?? 0)),
    truck: Math.max(0, Math.round(source?.truck ?? 0)),
    total,
  };
}

function renderVehicleStatsGrid(device?: DeviceRecord | null, traffic?: TrafficState | null, className = "m-vehicle-stats-grid"): string {
  const stats = vehicleStatsForDevice(device, traffic);
  const items = [
    ["Mobil", stats.car],
    ["Motor", stats.motorcycle],
    ["Sepeda", stats.bicycle],
    ["Bus", stats.bus],
    ["Truck", stats.truck],
    ["Total", stats.total],
  ];
  return `<div class="${className}">
  ${items.map(([label, value]) => `
    <div>
      <span>${escapeHtml(String(label))}</span>
      <strong>${Number(value)}</strong>
    </div>
  `).join("")}
</div>`;
}

function renderDetectionOverlay(device: DeviceRecord | null): string {
  const detections = device?.detections || [];
  const frameWidth = device?.detectorFrameWidth || 0;
  const frameHeight = device?.detectorFrameHeight || 0;
  if (!detections.length || frameWidth <= 0 || frameHeight <= 0) return "";
  return `<div class="m-detection-overlay" aria-hidden="true">
  ${detections.slice(0, 12).map((d) => {
    const left = clamp((d.x / frameWidth) * 100, 0, 100);
    const top = clamp((d.y / frameHeight) * 100, 0, 100);
    const width = clamp((d.width / frameWidth) * 100, 1, 100 - left);
    const height = clamp((d.height / frameHeight) * 100, 1, 100 - top);
    const label = `${detectionLabel(d.label)} ${(d.confidence * 100).toFixed(0)}%`;
    return `<span class="m-detection-box${d.vehicle ? " is-vehicle" : ""}${top < 8 ? " is-top-edge" : ""}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%">
      <span class="m-detection-label">${escapeHtml(label)}</span>
    </span>`;
  }).join("")}
</div>`;
}

async function resolveRoadName(device: DeviceRecord): Promise<string> {
  const cached = state.roadNameById.get(device.id);
  if (cached) return cached;

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${device.position.lat}&lon=${device.position.lng}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { address?: Record<string, string>; display_name?: string };
    const address = data.address || {};
    const road = address.road || address.pedestrian || address.footway || address.path || address.cycleway || address.service || address.residential;
    const fallback = data.display_name?.split(",")[0]?.trim();
    const resolved = road || fallback || device.roadName || device.label;
    state.roadNameById.set(device.id, resolved);
    return resolved;
  } catch {
    const fallback = device.roadName || device.roadHint || device.label;
    state.roadNameById.set(device.id, fallback);
    return fallback;
  }
}

function markerSizeByZoom(): number {
  const zoom = map.getZoom();
  return clamp(24 + (zoom - 13) * 2.4, 22, 54);
}

function markerAnchorBySize(size: number): [number, number] {
  return [Math.round(size / 2), Math.round(size * 1.5)];
}

// FIX: normalizeOneDevice — parser untuk satu raw device object langsung,
// tidak membungkus ulang dalam Snapshot sehingga tidak ada double-wrapping.
function normalizeOneDevice(raw: SnapshotDevice): DeviceRecord | null {
  const rawRecord = raw as Record<string, unknown>;
  const rawId = typeof rawRecord.id === "string" ? rawRecord.id.trim() : "";
  const id = raw.id?.trim() || rawId || "raspberry-its";
  let lat = typeof raw.position?.lat === "number" ? raw.position.lat
    : typeof raw.position?.y === "number" ? raw.position.y : null;
  let lng = typeof raw.position?.lng === "number" ? raw.position.lng
    : typeof raw.position?.x === "number" ? raw.position.x : null;
  if (lat === null || lng === null) return null;
  if (!isValidCoordinate(lat, lng)) {
    const known = state.knownDevicePositions[id];
    lat = known?.lat ?? (DEFAULT_CENTER as [number, number])[0];
    lng = known?.lng ?? (DEFAULT_CENTER as [number, number])[1];
  } else {
    saveKnownDevicePosition(id, lat, lng);
  }
  const safeLat = lat ?? (DEFAULT_CENTER as [number, number])[0];
  const safeLng = lng ?? (DEFAULT_CENTER as [number, number])[1];
  const lastSeen = normalizeEpoch(typeof raw.lastSeen === "number" ? raw.lastSeen : 0);
  const rawStatus = isDeviceStatus(raw.status) ? raw.status : "offline";
  const status = lastSeen > 0 && Date.now() - lastSeen > OFFLINE_AFTER_MS ? "offline" : rawStatus;
  const rawCameraMode = rawRecord.cameraMode;
  const cameraUrl = raw.cameraUrl?.trim() || undefined;
  const cameraHlsUrl = typeof rawRecord.cameraHlsUrl === "string" ? rawRecord.cameraHlsUrl.trim() || undefined : undefined;
  const webrtcUrl = typeof rawRecord.webrtcUrl === "string" ? rawRecord.webrtcUrl.trim() || undefined : undefined;
  const cameraMode = isCameraMode(rawCameraMode)
    ? rawCameraMode
    : cameraUrl || webrtcUrl
      ? "mjpeg"
      : undefined;
  const trafficDuration = finiteNumber(rawRecord.trafficDuration)
    ?? finiteNumber(rawRecord.trafficDurationSec);
  const vehicleCount = finiteNumber(rawRecord.vehicleCount)
    ?? finiteNumber(rawRecord.vehicles)
    ?? normalizeVehicleBreakdown(rawRecord.vehicleBreakdown)?.total;
  const vehicleBreakdown = normalizeVehicleBreakdown(rawRecord.vehicleBreakdown);
  const detections = normalizeDetections(rawRecord.detections);
  return {
    id,
    label: raw.label?.trim() || "Raspberry Pi 5 Controller",
    status, lastSeen,
    lastSeenText: raw.lastSeenText?.trim() || undefined,
    note: raw.note?.trim() || undefined,
    cameraUrl,
    cameraHlsUrl,
    cameraThumbnailUrl: typeof rawRecord.cameraThumbnailUrl === "string" ? rawRecord.cameraThumbnailUrl.trim() || undefined : undefined,
    cameraDataset: normalizeCameraDataset(rawRecord.cameraDataset),
    cameraMode,
    webrtcEnabled: typeof rawRecord.webrtcEnabled === "boolean" ? rawRecord.webrtcEnabled : undefined,
    webrtcPath: typeof rawRecord.webrtcPath === "string" ? rawRecord.webrtcPath.trim() || undefined : undefined,
    webrtcUrl,
    cameraReady: typeof rawRecord.cameraReady === "boolean" ? rawRecord.cameraReady : undefined,
    roadName: raw.roadName?.trim() || undefined,
    roadHint: raw.roadHint?.trim() || undefined,
    trafficColor: isTrafficColor(rawRecord.trafficColor) ? rawRecord.trafficColor : undefined,
    trafficDuration,
    trafficStartedAt: finiteNumber(rawRecord.trafficStartedAt),
    vehicleCount,
    vehicleBreakdown,
    detectorStatus: typeof rawRecord.detectorStatus === "string" ? rawRecord.detectorStatus.trim() || undefined : undefined,
    detectorNote: typeof rawRecord.detectorNote === "string" ? rawRecord.detectorNote.trim() || undefined : undefined,
    detectorUpdatedAt: finiteNumber(rawRecord.detectorUpdatedAt),
    detectorFps: finiteNumber(rawRecord.detectorFps),
    detectorFrameWidth: finiteNumber(rawRecord.detectorFrameWidth),
    detectorFrameHeight: finiteNumber(rawRecord.detectorFrameHeight),
    detectorCameraSource: typeof rawRecord.detectorCameraSource === "string" ? rawRecord.detectorCameraSource.trim() || undefined : undefined,
    detectorConfidence: finiteNumber(rawRecord.detectorConfidence),
    detectorOutputShape: typeof rawRecord.detectorOutputShape === "string" ? rawRecord.detectorOutputShape.trim() || undefined : undefined,
    objectCount: Math.max(0, Math.round(finiteNumber(rawRecord.objectCount) ?? detections.length)),
    detections,
    trafficSource: typeof rawRecord.trafficSource === "string" ? rawRecord.trafficSource.trim() || undefined : undefined,
    gpioBackend: typeof rawRecord.gpioBackend === "string" ? rawRecord.gpioBackend.trim() || undefined : undefined,
    gpioReady: typeof rawRecord.gpioReady === "boolean" ? rawRecord.gpioReady : undefined,
    gpioNote: typeof rawRecord.gpioNote === "string" ? rawRecord.gpioNote.trim() || undefined : undefined,
    update: normalizeUpdateInfo(rawRecord),
    position: { lat: clamp(safeLat, -90, 90), lng: clamp(safeLng, -180, 180) },
  };
}

// FIX: normalizeDevices langsung iterasi tiap entry dan panggil normalizeOneDevice.
// Juga handle format Firebase lama di mana node device masih berisi nested
// {devices:[...], source, updatedAt} — unwrap otomatis jika position tidak ada
// tapi ada field "devices" di dalamnya.
function normalizeDevices(snapshot: Snapshot): DeviceRecord[] {
  const rawDevices = snapshot.devices;

  if (Array.isArray(rawDevices)) {
    return rawDevices
      .flatMap((raw) => {
        // Handle format lama: device node yang masih berisi nested snapshot wrapper
        if (!raw.position && Array.isArray((raw as Record<string, unknown>).devices)) {
          const nested = (raw as Record<string, unknown>).devices as SnapshotDevice[];
          return nested.map((d) => normalizeOneDevice(d));
        }
        return [normalizeOneDevice(raw)];
      })
      .filter((d): d is DeviceRecord => d !== null);
  }

  if (rawDevices && typeof rawDevices === "object") {
    return Object.entries(rawDevices)
      .flatMap(([key, raw]) => {
        // Handle format Firebase lama: raspberry-its → {devices:[...], source, updatedAt}
        if (!raw.position && Array.isArray((raw as Record<string, unknown>).devices)) {
          const nested = (raw as Record<string, unknown>).devices as SnapshotDevice[];
          return nested.map((d) => normalizeOneDevice({ ...d, id: d.id?.trim() || key }));
        }
        return [normalizeOneDevice({ ...raw, id: raw.id?.trim() || key })];
      })
      .filter((d): d is DeviceRecord => d !== null);
  }

  return [];
}

// ─── Marker (Traffic Light) ─────────────────────────────────────

function trafficStateForDevice(device: DeviceRecord): TrafficState {
  const cached = state.trafficById.get(device.id);
  const roadName = state.roadNameById.get(device.id) || device.roadName || device.roadHint || device.label;
  const next = buildTrafficState({ ...device, roadName });
  if (
    cached &&
    cached.roadName === next.roadName &&
    cached.color === next.color &&
    cached.duration === next.duration &&
    cached.phaseStartedAt === next.phaseStartedAt &&
    cached.vehicleCount === next.vehicleCount &&
    Date.now() - cached.updatedAt < 1200
  ) {
    return cached;
  }

  state.trafficById.set(device.id, next);
  return next;
}

function makeTrafficLightSvg(state: TrafficState, size: number): string {
  const colorMap: Record<TrafficColor, string> = {
    red: "#ef4444",
    yellow: "#facc15",
    green: "#22c55e",
  };
  const active = colorMap[state.color];
  const inactive = "#4b5563";
  const bulb = (cx: number, cy: number, lit: boolean, fill: string) => `
  <circle cx="${cx}" cy="${cy}" r="5.6" fill="${lit ? fill : inactive}" opacity="${lit ? 1 : 0.45}"/>
  <circle cx="${cx}" cy="${cy}" r="2.4" fill="${lit ? "#fff" : "#9ca3af"}" opacity="${lit ? 0.35 : 0.2}"/>
`;
  return `<svg viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg" class="traffic-light-marker" width="${size}" height="${size * 1.5}">
  <rect x="2" y="2" width="28" height="44" rx="6" fill="#111827" stroke="#374151" stroke-width="1.2"/>
  ${bulb(16, 11, state.color === "red", active)}
  ${bulb(16, 24, state.color === "yellow", active)}
  ${bulb(16, 37, state.color === "green", active)}
</svg>`;
}

function renderDeviceModal(device: DeviceRecord, traffic: TrafficState): string {
  const road = escapeHtml(traffic.roadName);
  const recommendation = escapeHtml(traffic.recommendation);
  const statsGrid = renderVehicleStatsGrid(device, traffic, "modal-vehicle-grid");
  return `
  <div class="sheet-panel-header device-panel-header">
    <button class="sheet-icon-btn modal-close" data-action="close" aria-label="Kembali" title="Kembali">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    </button>
    <div class="sheet-title-cluster">
      <div class="sheet-device-icon" aria-hidden="true">${makeTrafficLightSvg(traffic, 28)}</div>
      <div class="sheet-title-copy">
        <h2 class="modal-title">${escapeHtml(device.label)}</h2>
        <p>${escapeHtml(device.status)} · ${road}</p>
      </div>
    </div>
  </div>
  <div class="modal-header">
    <button class="modal-close" data-action="close">×</button>
    <h2 class="modal-title">${escapeHtml(device.label)}</h2>
  </div>
  <div class="modal-tabs">
    <button class="modal-tab-btn active" data-tab="system">
      <span class="tab-icon">ℹ️</span> Sistem
    </button>
    <button class="modal-tab-btn" data-tab="traffic">
      <span class="tab-icon">🚦</span> Lalu Lintas
    </button>
  </div>
  <div class="modal-content">
    <div class="modal-tab-pane active" data-tab="system">
      <div class="info-row"><span class="label">Lokasi</span><span class="value" data-field="device-location">${device.position.lat.toFixed(6)}, ${device.position.lng.toFixed(6)}</span></div>
      <div class="info-row"><span class="label">ID Sistem</span><span class="value" data-field="device-id">${escapeHtml(device.id)}</span></div>
      <div class="info-row"><span class="label">Status</span><span class="value status-${device.status}" data-field="device-status">${escapeHtml(device.status)}</span></div>
      <div class="info-row"><span class="label">Last Seen</span><span class="value" data-field="device-last-seen">${escapeHtml(device.lastSeenText || formatTime(device.lastSeen))}</span></div>
      <div class="info-row"><span class="label">Age</span><span class="value" data-field="device-age">${formatAge(device.lastSeen)}</span></div>
      <div class="info-row"><span class="label">Jalan</span><span class="value" data-field="device-road">${road}</span></div>
    </div>
    <div class="modal-tab-pane" data-tab="traffic">
      ${statsGrid}
      <div class="info-row"><span class="label">Jalan</span><span class="value" data-field="traffic-road">${road}</span></div>
      <div class="info-row"><span class="label">Durasi Lampu</span><span class="value" data-field="traffic-duration">${traffic.duration}s (${traffic.color})</span></div>
      <div class="info-row"><span class="label">Rekomendasi</span><span class="value" data-field="traffic-recommendation">${recommendation}</span></div>
    </div>
  </div>`;
}

function usesDesktopSidePanel(): boolean {
  return window.matchMedia("(min-width: 721px)").matches;
}

function setSidePanelWidth(widthPx: number): void {
  const width = usesDesktopSidePanel() ? Math.max(0, Math.round(widthPx)) : 0;
  document.documentElement.style.setProperty("--side-panel-active-width", `${width}px`);
  document.body.classList.toggle("side-panel-open", width > 0);
  window.dispatchEvent(new Event("resize"));
}

function setSidePanelWidthFromSheet(sheetEl: HTMLElement | null): void {
  if (!sheetEl || !usesDesktopSidePanel()) return;
  setSidePanelWidth(sheetEl.getBoundingClientRect().width);
}

function clearSidePanelWidth(delayMs = 260): void {
  setSidePanelWidth(0);
  window.setTimeout(() => {
    if (!document.querySelector("#windows-download-modal.open, #map-license-modal.open, #m-device-modal.open, #m-poi-modal.open")) {
      document.body.classList.remove("side-panel-open", "app-download-panel-open", "map-license-panel-open", "map-modal-panel-open");
      document.documentElement.style.removeProperty("--side-panel-active-width");
    }
  }, delayMs);
}

function closePromptPanels(): void {
  const downloadModal = document.getElementById("windows-download-modal");
  if (downloadModal) downloadModal.remove();
  const licenseModal = document.getElementById("map-license-modal");
  if (licenseModal) licenseModal.remove();
  document.body.classList.remove("app-download-panel-open", "map-license-panel-open");
  clearSidePanelWidth(0);
}

function closeModal(animate = true): void {
  const modals = Array.from(document.querySelectorAll<HTMLElement>(".modal-wrapper, #m-device-modal, #m-poi-modal"));
  modals.forEach((modal) => {
    if (!animate) {
      modal.remove();
      return;
    }
    modal.classList.remove("open");
    modal.classList.add("closing");
    window.setTimeout(() => modal.remove(), 260);
  });
  state.activeModalDeviceId = null;
  state.activeModalPoiId = null;
  window.clearInterval(state.trafficRefreshTimer);
  state.trafficRefreshTimer = 0;
  document.body.classList.remove("map-modal-panel-open");
  clearSidePanelWidth();
}

function setSheetActiveTab(sheet: HTMLElement, tabName: string): void {
  sheet.querySelectorAll(".modal-tab-btn").forEach((btn) => btn.classList.remove("active"));
  sheet.querySelectorAll(".modal-tab-pane").forEach((pane) => pane.classList.remove("active"));
  sheet.querySelector<HTMLButtonElement>(`.modal-tab-btn[data-tab="${tabName}"]`)?.classList.add("active");
  sheet.querySelector<HTMLElement>(`.modal-tab-pane[data-tab="${tabName}"]`)?.classList.add("active");
}

function getActiveModalTab(sheet: HTMLElement): string {
  return sheet.querySelector<HTMLButtonElement>(".modal-tab-btn.active")?.dataset.tab || "system";
}

function createSwipeableSheetModal(id: string, sheetClass: string, bodyHtml: string): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = id;
  overlay.innerHTML = `
  <div class="m-layer-backdrop"></div>
  <div class="${sheetClass}">${bodyHtml}</div>
`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("open");
    const sheet = overlay.querySelector<HTMLElement>(`.${sheetClass.split(" ")[0]}`);
    if (id === "m-device-modal" || id === "m-poi-modal") {
      document.body.classList.add("map-modal-panel-open");
      setSidePanelWidthFromSheet(sheet);
    }
  });
  L.DomEvent.disableClickPropagation(overlay);
  L.DomEvent.disableScrollPropagation(overlay);
  return overlay;
}

function openModal(device: DeviceRecord): void {
  closeModal(false);
  closePromptPanels();
  state.activeModalDeviceId = device.id;
  state.activeModalPoiId = null;
  const traffic = trafficStateForDevice(device);

  const overlay = createSwipeableSheetModal(
    "m-device-modal",
    "m-device-sheet",
    `
    <div class="m-sheet-handle-bar"></div>
    ${renderDeviceModal(device, traffic)}
  `,
  );

  overlay.querySelector(".m-layer-backdrop")!.addEventListener("click", () => closeModal());
  const sheet = overlay.querySelector<HTMLElement>(".m-device-sheet");
  if (!sheet) return;
  setupSheetSwipe(sheet, closeModal);
  sheet.querySelectorAll<HTMLButtonElement>(".modal-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSheetActiveTab(sheet, btn.dataset.tab || "system"));
  });
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", () => closeModal());

  window.clearInterval(state.trafficRefreshTimer);
  state.trafficRefreshTimer = window.setInterval(() => {
    const active = state.device;
    const activeId = state.activeModalDeviceId;
    if (!active || !activeId || active.id !== activeId) return;
    refreshOpenDeviceModal(active);
  }, 2500);
}

function refreshOpenDeviceModal(device: DeviceRecord): void {
  const sheet = document.querySelector<HTMLElement>(".m-device-sheet");
  if (!sheet) return;

  const activeTab = getActiveModalTab(sheet);
  const nextTraffic = trafficStateForDevice(device);
  sheet.innerHTML = `
  <div class="m-sheet-handle-bar"></div>
  ${renderDeviceModal(device, nextTraffic)}
`;
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", () => closeModal());
  sheet.querySelectorAll<HTMLButtonElement>(".modal-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSheetActiveTab(sheet, btn.dataset.tab || "system"));
  });
  setSheetActiveTab(sheet, activeTab);
}

function ensureMarker(device: DeviceRecord): void {
  const traffic = trafficStateForDevice(device);
  const size = markerSizeByZoom();
  const icon = L.divIcon({
    className: "traffic-light-marker-icon",
    html: makeTrafficLightSvg(traffic, size),
    iconSize: [size, Math.round(size * 1.5)],
    iconAnchor: markerAnchorBySize(size),
    popupAnchor: [0, -Math.round(size * 1.2)],
  });
  const existing = state.markers.get(device.id);

  const latlng = L.latLng(device.position.lat, device.position.lng);

  if (!existing) {
    const m = L.marker(latlng, {
      icon,
      interactive: true,
      zIndexOffset: 1000,
      riseOnHover: true,
    }).addTo(map);
    m.on("click", () => {
      state.device = device;
      renderCameraTile();
      openModal(device);
    });
    state.markers.set(device.id, m);
    state.prevPositionById.set(device.id, latlng);
    return;
  }

  // Update position and icon
  existing.setLatLng(latlng);
  existing.setIcon(icon);

  // compute heading from previous position (if any) and apply rotation/greyscale
  const prev = state.prevPositionById.get(device.id) || null;
  try {
    const el = existing.getElement?.() as HTMLElement | null;
    if (el) {
      if (prev) {
        const bearing = computeBearing(prev.lat, prev.lng, latlng.lat, latlng.lng);
        el.style.transform = `rotate(${bearing}deg)`;
      } else {
        el.style.transform = "";
      }
      el.style.filter = "grayscale(0.35)";
      el.style.transition = "transform 300ms linear, filter 300ms";
      el.style.pointerEvents = "auto";
    }
  } catch { /* ignore DOM access errors */ }

  state.prevPositionById.set(device.id, latlng);

  existing.off("click");
  existing.on("click", () => {
    state.device = device;
    renderCameraTile();
    openModal(device);
  });
}

function rescaleMarkers(): void {
  const deviceSize = markerSizeByZoom();
  for (const device of state.devices) {
    const marker = state.markers.get(device.id);
    if (!marker) continue;
    marker.setIcon(L.divIcon({
      className: "traffic-light-marker-icon",
      html: makeTrafficLightSvg(trafficStateForDevice(device), deviceSize),
      iconSize: [deviceSize, Math.round(deviceSize * 1.5)],
      iconAnchor: markerAnchorBySize(deviceSize),
      popupAnchor: [0, -Math.round(deviceSize * 1.2)],
    }));
  }

  const poiSize = poiMarkerSizeByZoom();
  for (const [id, poi] of state.poiData.entries()) {
    const marker = state.poiMarkers.get(id);
    if (!marker) continue;
    marker.setIcon(makePoiIcon(poi, poiSize));
  }

  // Rescale MapLibre POI layer text size
  const maplibreMap = state.maplibreMap;
  if (maplibreMap && state.baseMode === "3d") {
    try {
      const scaledSize = 14 + (map.getZoom() - 13) * 1.2;
      maplibreMap.setLayoutProperty("poi-symbols", "text-size", Math.min(Math.max(scaledSize, 10), 24));
    } catch {
      /* ignore */
    }
  }
}

function removeMissingMarkers(activeIds: Set<string>): void {
  for (const [deviceId, marker] of state.markers.entries()) {
    if (!activeIds.has(deviceId)) {
      map.removeLayer(marker);
      state.markers.delete(deviceId);
    }
  }
}

// ─── Compass ────────────────────────────────────────────────────

function bearingLabel(deg: number): string {
  const n = ((deg % 360) + 360) % 360;
  if (n < 22.5 || n >= 337.5) return "Utara (N)";
  if (n < 67.5) return "Timur Laut (NE)";
  if (n < 112.5) return "Timur (E)";
  if (n < 157.5) return "Tenggara (SE)";
  if (n < 202.5) return "Selatan (S)";
  if (n < 247.5) return "Barat Daya (SW)";
  if (n < 292.5) return "Barat (W)";
  return "Barat Laut (NW)";
}

function normBearing(raw: number): number {
  return ((raw % 360) + 360) % 360;
}

function updateCompass(): void {
  if (!state.compassNeedle) return;
  const norm = normBearing(map.getBearing?.() ?? 0);
  state.compassNeedle.setAttribute("transform", `rotate(${norm}, 24, 24)`);
  if (state.compassBtn) {
    const isNorth = norm < BEARING_SNAP || norm > (360 - BEARING_SNAP);
    state.compassBtn.classList.toggle("compass-active", !isNorth);
    const tip = state.compassBtn.querySelector<HTMLSpanElement>(".toolbar-tip");
    if (tip) {
      tip.textContent = isNorth
        ? "Kompas - klik untuk putar peta ke Timur (90 deg)"
        : `Kompas mengarah ke ${bearingLabel(norm)} - klik lagi untuk lanjut`;
    }
    window.setTimeout(() => state.compassBtn?.removeAttribute("title"), 0);
    state.compassBtn.title = isNorth
      ? "Kompas – klik untuk putar peta ke Timur (90°)"
      : `Kompas mengarah ke ${bearingLabel(norm)} — klik lagi untuk lanjut`;
  }
}

function handleCompassClick(): void {
  const norm = normBearing(map.getBearing?.() ?? 0);
  const snapped = Math.round(norm / BEARING_STEP) * BEARING_STEP;
  const nextBearing = (snapped + BEARING_STEP) % 360;
  map.setBearing(nextBearing);
  map.closePopup();
}

// ─── Base map ───────────────────────────────────────────────────

async function ensureMapLibreMap(): Promise<any | null> {
  if (state.maplibreMap) return state.maplibreMap;

  try {
    const maplibreglImport = await import("maplibre-gl");
    const maplibregl = (maplibreglImport as any).default || maplibreglImport;

    if (!state.maplibreContainer) {
      const container = document.createElement("div");
      container.className = "maplibre-overlay";
      mapRoot.appendChild(container);
      state.maplibreContainer = container;
    }

    const maplibreMap = new maplibregl.Map({
      container: state.maplibreContainer,
      style: MAPLIBRE_STYLE_URL,
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing?.() ?? 0,
      pitch: mapLibrePitchByZoom(map.getZoom()),
      attributionControl: false,
      interactive: false,
      preserveDrawingBuffer: false,
      fadeDuration: 0,
    });

    maplibreMap.on("load", () => {
      syncMapLibreView(true);

      // Some MapLibre builds do not implement setFog.
      const maybeSetFog = (maplibreMap as any).setFog;
      if (typeof maybeSetFog === "function") {
        maybeSetFog.call(maplibreMap, {
          "range": [0.5, 10],
          "color": "#ffffff",
          "high-color": "#245cdf",
          "space-color": "#000000"
        });
      }

      // Prevent noisy runtime warnings when style references icons not present
      // in the remote sprite sheet.
      maplibreMap.on("styleimagemissing", (e: any) => {
        const id = e?.id;
        if (!id || maplibreMap.hasImage(id)) return;
        const transparentPixel = new Uint8Array([0, 0, 0, 0]);
        maplibreMap.addImage(id, { width: 1, height: 1, data: transparentPixel });
      });

      // Add POI GeoJSON source for 3D rendering (prevents drift)
      try {
        if (!maplibreMap.getSource("poi-source")) {
          maplibreMap.addSource("poi-source", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] }
          });
        }

        if (!maplibreMap.getLayer("poi-halo")) {
          maplibreMap.addLayer({
            id: "poi-halo",
            type: "circle",
            source: "poi-source",
            paint: {
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 4, 18, 10],
              "circle-color": [
                "match", ["get", "kind"],
                "hospital", "#ef4444",
                "mall", "#8b5cf6",
                "campus", "#2563eb",
                "school", "#0f6cbd",
                "station", "#2563eb",
                "terminal", "#0f766e",
                "shelter", "#0284c7",
                "park", "#16a34a",
                "worship", "#d97706",
                "restaurant", "#e11d48",
                "monument", "#a16207",
                "#475569"
              ],
              "circle-opacity": 0.9,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2
            }
          });
        }

        // Add POI symbol layer using compact text labels (simple, no drift)
        if (!maplibreMap.getLayer("poi-symbols")) {
          maplibreMap.addLayer({
            id: "poi-symbols",
            type: "symbol",
            source: "poi-source",
            layout: {
              "text-field": ["get", "icon-emoji"],
              "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
              "text-size": 18,
              "text-offset": [0, 0],
              "text-allow-overlap": true,
              "text-ignore-placement": true
            },
            paint: {
              "text-color": "#111827",
              "text-halo-color": "#ffffff",
              "text-halo-width": 1.4,
              "text-opacity": 1
            }
          });
        }

        // Add click handler for POI (allow MapLibre to detect clicks)
        // Note: MapLibre is non-interactive by default, so we detect features via ray casting
        // when Leaflet receives a click and is in 3D mode
      } catch (err) {
        console.warn("Failed to setup POI layer:", err);
      }

      const style = maplibreMap.getStyle();
      if (style && style.layers) {
        style.layers.forEach((layer: any) => {
          const id = layer.id;
          const sourceLayer = layer['source-layer'];

          // 1. Mewarnai Tata Guna Lahan (Tanah Dasar)
          if (sourceLayer === 'landuse' && layer.type === 'fill') {
            try {
              maplibreMap.setPaintProperty(id, 'fill-color', [
                'match', ['get', 'class'],
                'hospital', '#ffd6d6',
                'school', '#fff4c2',
                'education', '#fff4c2',
                'residential', '#def7e3',
                'commercial', '#ffe4c7',
                'industrial', '#e2d9f3',
                '#eef2f5'
              ]);
              maplibreMap.setPaintProperty(id, 'fill-opacity', 0.95);
            } catch {
              /* ignore layer incompatibility */
            }
          }

          // Taman & Air
          if ((sourceLayer === 'landcover' || sourceLayer === 'park') && layer.type === 'fill') {
            try {
              maplibreMap.setPaintProperty(id, 'fill-color', [
                'match', ['get', 'class'],
                'grass', '#d8efcf',
                'wood', '#bde09b',
                '#e9f7de'
              ]);
              maplibreMap.setPaintProperty(id, 'fill-opacity', 0.95);
            } catch {
              /* ignore layer incompatibility */
            }
          }
          if (sourceLayer === 'water' && layer.type === 'fill') {
            try {
              maplibreMap.setPaintProperty(id, 'fill-color', '#8ec5f7');
              maplibreMap.setPaintProperty(id, 'fill-opacity', 0.93);
            } catch {
              /* ignore layer incompatibility */
            }
          }

          // 2. Mewarnai Jalan Tol dan Raya
          if (sourceLayer === 'transportation' && layer.type === 'line') {
            try {
              maplibreMap.setPaintProperty(id, 'line-color', [
                'match', ['get', 'class'],
                'motorway', '#f59e0b',
                'trunk', '#f59e0b',
                'primary', '#ffffff',
                '#f8fafc'
              ]);
            } catch {
              /* ignore layer incompatibility */
            }
          }

          // 3. Bangunan 3D Berwarna berdasarkan Tinggi Gedung
          if (layer.type === 'fill-extrusion' || id.includes('building')) {
            try {
              const buildingHeightExpression = [
                "interpolate", ["linear"], ["zoom"],
                14, 0,
                15.5, ["*", ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], ["*", ["to-number", ["coalesce", ["get", "building:levels"], 2]], 3], 9]], 0.45],
                18, ["*", ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], ["*", ["to-number", ["coalesce", ["get", "building:levels"], 2]], 3], 9]], 1.25]
              ];
              maplibreMap.setPaintProperty(id, 'fill-extrusion-color', [
                'interpolate',
                ['linear'],
                ['to-number', ['coalesce', ['get', 'render_height'], ['get', 'height'], ['*', ['to-number', ['coalesce', ['get', 'building:levels'], 0], 0], 3], 0], 0],
                0, '#fbbf24',
                10, '#4ade80',
                25, '#60a5fa',
                50, '#a78bfa',
                100, '#f87171'
              ]);
              maplibreMap.setPaintProperty(id, 'fill-extrusion-height', buildingHeightExpression);
              maplibreMap.setPaintProperty(id, 'fill-extrusion-base', 0);
              maplibreMap.setPaintProperty(id, 'fill-extrusion-opacity', 0.92);
            } catch {
              /* ignore layer incompatibility */
            }
          }

          if ((sourceLayer === 'building' || id.includes('building')) && layer.type === 'fill') {
            try {
              maplibreMap.setPaintProperty(id, 'fill-color', '#d6e4d4');
              maplibreMap.setPaintProperty(id, 'fill-opacity', 0.88);
            } catch {
              /* ignore layer incompatibility */
            }
          }
        });
      }
    });
    state.maplibreMap = maplibreMap;
    return maplibreMap;
  } catch (err) {
    console.error("ensureMapLibreMap error:", err);
    return null;
  }
}

async function removeMapLibreMap(): Promise<void> {
  if (!state.maplibreMap) return;
  try {
    state.maplibreMap.remove();
  } catch {
    /* ignore */
  }
  state.maplibreMap = null;
  if (state.maplibreContainer) {
    state.maplibreContainer.remove();
    state.maplibreContainer = null;
  }
}

function syncMapLibreView(force = false): void {
  const maplibreMap = state.maplibreMap;
  if (!maplibreMap) return;
  if (state.maplibreSyncing && !force) return;

  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing?.() ?? 0;
  const pitch = mapLibrePitchByZoom(zoom);

  const currentCenter = maplibreMap.getCenter();
  const currentZoom = maplibreMap.getZoom();
  const currentBearing = maplibreMap.getBearing();
  const currentPitch = maplibreMap.getPitch();

  const centerChanged = currentCenter.lat !== center.lat || currentCenter.lng !== center.lng;
  const zoomChanged = currentZoom !== zoom;
  const bearingChanged = currentBearing !== bearing;
  const pitchChanged = currentPitch !== pitch;

  if (!force && !centerChanged && !zoomChanged && !bearingChanged && !pitchChanged) return;

  state.maplibreSyncing = true;
  try {
    maplibreMap.jumpTo({
      animate: false,
      center,
      zoom,
      bearing,
      pitch,

    });
    // Do not hide Leaflet POI markers in 3D — prefer custom Leaflet icons consistently
    if (state.overpassLayer) {
      state.overpassLayer.getLayers().forEach((layer: any) => {
        if (layer._path) layer._path.style.display = '';
        if (layer._icon) layer._icon.style.display = '';
      });
    }
    for (const marker of state.poiMarkers.values()) {
      const el = marker.getElement() as HTMLElement | null;
      if (el) el.style.display = '';
    }
  } finally {
    state.maplibreSyncing = false;
  }
}

async function setBaseMap(mode: BaseMapMode): Promise<void> {
  if (state.baseMode === mode) return;

  // Reset any previous 3D CSS transform (legacy fallback)
  const mapEl = mapRoot as HTMLElement;
  mapEl.style.transform = "";
  mapEl.style.transformOrigin = "";
  mapEl.style.perspective = "";
  (mapEl.parentElement as HTMLElement | null)?.style.setProperty("perspective", "");
  mapEl.classList.remove("map-mode-3d");

  if (mode === "street") {
    // remove any GL or satellite layer
    await removeMapLibreMap();
    if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
  } else if (mode === "3d") {
    // Prefer true 3D: render MapLibre GL above the Leaflet map.
    if (map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
    if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);

    const gl = await ensureMapLibreMap();
    if (!gl) {
      // fallback: use CSS tilt if MapLibre not available
      if (!map.hasLayer(streetLayer)) streetLayer.addTo(map);
      const wrapper = mapEl.parentElement as HTMLElement | null;
      if (wrapper) wrapper.style.perspective = "800px";
      mapEl.style.transform = "rotateX(45deg) scale(1.4)";
      mapEl.style.transformOrigin = "50% 100%";
      mapEl.style.transition = "transform 0.5s ease";
      state.baseMode = "street";
      return;
    }

    mapEl.classList.add("map-mode-3d");
    syncMapLibreView(true);
    map.invalidateSize();
  } else {
    // satellite
    await removeMapLibreMap();
    if (map.hasLayer(streetLayer)) map.removeLayer(streetLayer);
    if (!map.hasLayer(satelliteLayer)) satelliteLayer.addTo(map);
  }

  state.baseMode = mode;
  updateModeControlButtons();
  void refreshRoadGuideLayer(true);
  if (mode === "street") void refreshVisionLayer(true);
  else state.visionLayer?.clearLayers();
}

// ─── Camera tile ────────────────────────────────────────────────

function publicCameraUrl(device: DeviceRecord | null): string {
  return usablePublicMediaUrl(device?.cameraUrl) || usablePublicMediaUrl(device?.webrtcUrl) || "";
}

function publicCameraHlsUrl(device: DeviceRecord | null): string {
  return usablePublicMediaUrl(device?.cameraHlsUrl) || "";
}

function publicCameraPageUrl(device: DeviceRecord | null): string {
  return publicCameraUrl(device) || hlsPageUrl(publicCameraHlsUrl(device));
}

function usablePublicMediaUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!url) return "";
  if (/^https?:\/\/(?:127\.0\.0\.1|0\.0\.0\.0|localhost)(?::|\/|$)/i.test(url)) return "";
  return url;
}

function hlsPageUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.href);
    if (/\/index\.m3u8$/i.test(url.pathname)) {
      url.pathname = url.pathname.replace(/index\.m3u8$/i, "");
      url.search = "";
      return url.toString();
    }
  } catch {
    // Keep the caller fallback empty when URL parsing fails.
  }
  return "";
}

function isLikelyImageUrl(url: string): boolean {
  return /^data:image/i.test(url) || /\.(mjpg|mjpeg|jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function cameraModeFor(device: DeviceRecord | null): CameraMode | null {
  if (!device || device.status === "offline") return null;
  if (publicCameraPageUrl(device) || publicCameraHlsUrl(device)) return device.cameraMode || "mjpeg";
  if (device.cameraMode === "webrtc" || device.webrtcEnabled || device.cameraReady) return "webrtc";
  return null;
}

function isWebRtcSignalingCamera(device: DeviceRecord | null): boolean {
  return cameraModeFor(device) === "webrtc" && !publicCameraUrl(device);
}

function webRtcSignalPath(device: DeviceRecord): string {
  return (device.webrtcPath?.trim() || `${WEBRTC_SIGNAL_ROOT}/${device.id}`).replace(/^\/+|\/+$/g, "");
}

function firebaseDbUrl(path: string): string {
  const encoded = path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${FIREBASE_ROOT_URL}/${encoded}.json`;
}

async function firebaseGetPath<T>(path: string): Promise<T | null> {
  const res = await fetch(firebaseDbUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Firebase GET ${path} failed: HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text === "null") return null;
  return JSON.parse(text) as T;
}

async function firebaseWritePath(method: "PUT" | "PATCH" | "DELETE", path: string, payload?: unknown): Promise<void> {
  const res = await fetch(firebaseDbUrl(path), {
    method,
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Firebase ${method} ${path} failed: HTTP ${res.status}`);
}

function browserViewerId(): string {
  const storageKey = "its-webrtc-viewer-id";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const id = `viewer-${random.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  window.sessionStorage.setItem(storageKey, id);
  return id;
}

function newWebRtcSessionId(deviceId: string): string {
  const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeDeviceId = deviceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeDeviceId}-${random.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function webRtcSessionPath(): string {
  return `${state.webrtc.signalPath}/sessions/${state.webrtc.sessionId}`;
}

function webRtcStatusText(): string {
  if (state.webrtc.status === "live") return "Live WebRTC";
  if (state.webrtc.status === "failed") return state.webrtc.message || "WebRTC gagal tersambung";
  if (state.webrtc.status === "connecting") return state.webrtc.message || "Menghubungkan WebRTC...";
  return "Menunggu kamera WebRTC";
}

function updateWebRtcStatusElements(): void {
  const text = webRtcStatusText();
  document.querySelectorAll<HTMLElement>("[data-webrtc-status]").forEach((el) => {
    el.textContent = text;
    el.dataset.status = state.webrtc.status;
  });
  document.querySelectorAll<HTMLElement>("[data-webrtc-dot]").forEach((el) => {
    el.dataset.status = state.webrtc.status;
  });
  state.cameraButton?.classList.toggle("camera-live", state.webrtc.status === "live");
  state.cameraButton?.classList.toggle("camera-failed", state.webrtc.status === "failed");
}

function setWebRtcStatus(status: WebRtcStatus, message = ""): void {
  state.webrtc.status = status;
  state.webrtc.message = message;
  updateWebRtcStatusElements();
}

function attachWebRtcStream(): void {
  const stream = state.webrtc.stream;
  document.querySelectorAll<HTMLVideoElement>("video[data-webrtc-camera]").forEach((video) => {
    if (video.dataset.webrtcCamera !== state.webrtc.deviceId) return;
    if (stream && video.srcObject !== stream) video.srcObject = stream;
    if (stream) void video.play().catch(() => { /* autoplay may wait for user interaction */ });
  });
  updateWebRtcStatusElements();
}

function resetWebRtcRuntime(): void {
  Object.assign(state.webrtc, {
    pc: null,
    deviceId: "",
    signalPath: "",
    sessionId: "",
    stream: null,
    pollTimer: 0,
    heartbeatTimer: 0,
    candidateSeq: 0,
    seenCameraCandidates: new Set<string>(),
    pendingCandidates: [],
    sessionReady: false,
    startedAt: 0,
    status: "idle" as WebRtcStatus,
    message: "",
  });
}

function stopWebRtcSession(removeRemote = true): void {
  const sessionPath = state.webrtc.signalPath && state.webrtc.sessionId ? webRtcSessionPath() : "";
  window.clearInterval(state.webrtc.pollTimer);
  window.clearInterval(state.webrtc.heartbeatTimer);
  if (removeRemote && sessionPath) {
    void firebaseWritePath("PATCH", sessionPath, {
      viewerStatus: "closed",
      updatedAt: Date.now(),
    })
      .finally(() => {
        void firebaseWritePath("DELETE", sessionPath).catch(() => { /* ignore cleanup errors */ });
      })
      .catch(() => { /* ignore cleanup errors */ });
  }
  state.webrtc.pc?.close();
  state.webrtc.stream?.getTracks().forEach((track) => track.stop());
  document.querySelectorAll<HTMLVideoElement>("video[data-webrtc-camera]").forEach((video) => {
    video.srcObject = null;
  });
  resetWebRtcRuntime();
  updateWebRtcStatusElements();
}

async function sendViewerCandidate(candidate: RTCIceCandidateInit): Promise<void> {
  if (!state.webrtc.signalPath || !state.webrtc.sessionId) return;
  if (!state.webrtc.sessionReady) {
    state.webrtc.pendingCandidates.push(candidate);
    return;
  }
  state.webrtc.candidateSeq += 1;
  const key = `${Date.now()}_${state.webrtc.candidateSeq}`;
  await firebaseWritePath("PUT", `${webRtcSessionPath()}/viewerCandidates/${key}`, candidate);
}

function flushPendingViewerCandidates(): void {
  const pending = state.webrtc.pendingCandidates.splice(0);
  pending.forEach((candidate) => {
    void sendViewerCandidate(candidate).catch((err) => console.warn("[ITS] WebRTC candidate failed:", err));
  });
}

async function pollWebRtcSession(): Promise<void> {
  const pc = state.webrtc.pc;
  if (!pc || !state.webrtc.sessionId) return;
  const session = await firebaseGetPath<WebRtcSessionRecord>(webRtcSessionPath());
  if (!session) return;

  if (session.streamerStatus === "failed") {
    throw new Error(session.streamerError || "Streamer Raspberry gagal membuat answer");
  }

  if (session.answer && !pc.currentRemoteDescription) {
    await pc.setRemoteDescription(session.answer);
    setWebRtcStatus("connecting", "Answer diterima, membuka jalur video...");
  }

  if (session.cameraCandidates && typeof session.cameraCandidates === "object") {
    for (const [key, candidate] of Object.entries(session.cameraCandidates)) {
      if (state.webrtc.seenCameraCandidates.has(key)) continue;
      state.webrtc.seenCameraCandidates.add(key);
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  if (!pc.currentRemoteDescription && Date.now() - state.webrtc.startedAt > WEBRTC_ANSWER_TIMEOUT_MS) {
    throw new Error("Timeout menunggu answer WebRTC dari Raspberry Pi");
  }
}

async function startWebRtcSession(device: DeviceRecord): Promise<void> {
  if (!isWebRtcSignalingCamera(device)) return;
  if (!("RTCPeerConnection" in window)) {
    setWebRtcStatus("failed", "Browser tidak mendukung WebRTC");
    return;
  }
  if (state.webrtc.pc && state.webrtc.deviceId === device.id && state.webrtc.status !== "failed") {
    attachWebRtcStream();
    return;
  }

  stopWebRtcSession(true);
  const signalPath = webRtcSignalPath(device);
  const sessionId = newWebRtcSessionId(device.id);
  const pc = new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });

  Object.assign(state.webrtc, {
    pc,
    deviceId: device.id,
    signalPath,
    sessionId,
    stream: null,
    pollTimer: 0,
    heartbeatTimer: 0,
    candidateSeq: 0,
    seenCameraCandidates: new Set<string>(),
    pendingCandidates: [],
    sessionReady: false,
    startedAt: Date.now(),
    status: "connecting" as WebRtcStatus,
    message: "Mengirim offer ke Raspberry Pi...",
  });
  updateWebRtcStatusElements();

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    state.webrtc.stream = remoteStream || new MediaStream([event.track]);
    setWebRtcStatus("live");
    attachWebRtcStream();
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    void sendViewerCandidate(event.candidate.toJSON()).catch((err) => {
      console.warn("[ITS] WebRTC ICE candidate publish failed:", err);
    });
  };
  pc.onconnectionstatechange = () => {
    void firebaseWritePath("PATCH", webRtcSessionPath(), {
      viewerConnectionState: pc.connectionState,
      viewerSeenAt: Date.now(),
      updatedAt: Date.now(),
    }).catch(() => { /* ignore heartbeat errors */ });
    if (pc.connectionState === "connected") setWebRtcStatus("live");
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      setWebRtcStatus("failed", `Koneksi WebRTC ${pc.connectionState}`);
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (!pc.localDescription) throw new Error("Local WebRTC offer kosong");

    await firebaseWritePath("PUT", webRtcSessionPath(), {
      deviceId: device.id,
      sessionId,
      viewerId: browserViewerId(),
      viewerStatus: "offer-sent",
      viewerSeenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      offer: {
        type: pc.localDescription.type,
        sdp: pc.localDescription.sdp,
      },
    });

    state.webrtc.sessionReady = true;
    flushPendingViewerCandidates();
    state.webrtc.pollTimer = window.setInterval(() => {
      void pollWebRtcSession().catch((err) => {
        console.warn("[ITS] WebRTC poll failed:", err);
        setWebRtcStatus("failed", err instanceof Error ? err.message : "WebRTC poll gagal");
      });
    }, WEBRTC_POLL_MS);
    state.webrtc.heartbeatTimer = window.setInterval(() => {
      void firebaseWritePath("PATCH", webRtcSessionPath(), {
        viewerStatus: "watching",
        viewerSeenAt: Date.now(),
        updatedAt: Date.now(),
      }).catch(() => { /* ignore heartbeat errors */ });
    }, WEBRTC_HEARTBEAT_MS);
    await pollWebRtcSession();
  } catch (err) {
    console.warn("[ITS] WebRTC start failed:", err);
    setWebRtcStatus("failed", err instanceof Error ? err.message : "WebRTC gagal dimulai");
  }
}

function syncCameraViews(device: DeviceRecord | null = state.device): void {
  if (!device || !isWebRtcSignalingCamera(device)) {
    if (!device || state.webrtc.deviceId !== device.id) stopWebRtcSession(true);
    return;
  }
  if (state.webrtc.pc && state.webrtc.deviceId === device.id && state.webrtc.status !== "failed") {
    attachWebRtcStream();
    return;
  }
  void startWebRtcSession(device);
}

function renderWebRtcSurface(device: DeviceRecord, videoClass: string): string {
  const status = escapeHtml(webRtcStatusText());
  return `
  <div class="webrtc-video-wrap">
    <video class="${videoClass} webrtc-video" data-webrtc-camera="${escapeHtml(device.id)}" autoplay playsinline muted></video>
    <div class="webrtc-status-bar">
      <span class="webrtc-dot" data-webrtc-dot data-status="${state.webrtc.status}"></span>
      <span data-webrtc-status data-status="${state.webrtc.status}">${status}</span>
    </div>
  </div>
`;
}

function renderCameraSurface(device: DeviceRecord | null, imageClass: string, frameClass: string): string {
  const url = publicCameraPageUrl(device);
  const hlsUrl = publicCameraHlsUrl(device);
  if (url) {
    return isLikelyImageUrl(url)
      ? `<img class="${imageClass}" src="${escapeHtml(url)}" alt="Camera preview">`
      : `<iframe class="${frameClass}" src="${escapeHtml(url)}" allow="autoplay; camera; microphone; fullscreen" referrerpolicy="no-referrer" loading="lazy"></iframe>`;
  }
  if (hlsUrl) {
    return `<video class="${imageClass}" src="${escapeHtml(hlsUrl)}" autoplay playsinline muted controls></video>`;
  }
  if (device && isWebRtcSignalingCamera(device)) return renderWebRtcSurface(device, imageClass);
  return "";
}

function renderCameraTile(): void {
  if (!state.cameraPreview) return;
  const device = state.device;
  const url = publicCameraPageUrl(device);
  state.cameraPreview.innerHTML = url && isLikelyImageUrl(url)
    ? `<img class="camera-thumb-img" src="${escapeHtml(url)}" alt="Camera preview">`
    : device && (url || isWebRtcSignalingCamera(device))
      ? `<div class="camera-live-badge"><span data-webrtc-dot data-status="${state.webrtc.status}"></span>LIVE</div>`
      : "";
  syncCameraViews(device);
}

// ─── Map actions ────────────────────────────────────────────────

// FIX: goHome sekarang fly ke posisi device pertama yang diketahui,
// bukan ke DEFAULT_CENTER yang hardcoded.
function goHome(): void {
  const primary = state.devices[0] ?? state.device;
  if (primary) {
    map.setView([primary.position.lat, primary.position.lng], DEFAULT_ZOOM, { animate: true });
  } else {
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
  }
  map.setBearing(0);
}

function applyLocatedUser(lat: number, lng: number, accuracy?: number, center = true, source = "gps"): void {
  const latlng: [number, number] = [lat, lng];
  if (center) map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true });
  showVehicleMarker(latlng);
  state.vehicleMarker?.bindPopup(`Lokasi Anda${accuracy ? ` ±${Math.round(accuracy)}m` : ""}`);
  if (center) state.vehicleMarker?.openPopup();
  state.vehicleMarker?.getElement()?.setAttribute("title", `Lokasi Anda (${source})`);
  if (isTablet()) createTabletCategoryPanel();
}

function requestBrowserPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("browser-geolocation-unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 9000,
      maximumAge: 12_000,
    });
  });
}

async function requestNativeDesktopPosition(): Promise<NativeLocationResult | null> {
  if (!desktopBridge?.requestWindowsLocation) return null;
  try {
    const result = await desktopBridge.requestWindowsLocation();
    const lat = Number(result?.lat);
    const lng = Number(result?.lng);
    if (result?.ok && Number.isFinite(lat) && Number.isFinite(lng)) return { ...result, lat, lng };
  } catch (err) {
    console.warn("Native Windows location failed:", err);
  }
  return null;
}

function startDesktopLocationPolling(): void {
  if (!desktopBridge?.requestWindowsLocation) return;
  window.clearInterval(state.nativeLocationPollTimer);
  state.nativeLocationPollTimer = window.setInterval(() => {
    void requestNativeDesktopPosition().then((result) => {
      if (!result?.ok || typeof result.lat !== "number" || typeof result.lng !== "number") return;
      applyLocatedUser(result.lat, result.lng, result.accuracy, false, result.source || "windows-location");
    });
  }, 5000);
}

function startBrowserLocationWatch(): void {
  if (!navigator.geolocation || state.userLocationWatchId !== null) return;
  state.userLocationWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      applyLocatedUser(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, false, "browser-gps");
    },
    () => {
      if (state.userLocationWatchId !== null) {
        navigator.geolocation.clearWatch(state.userLocationWatchId);
        state.userLocationWatchId = null;
      }
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
  );
}

async function locateUser(): Promise<void> {
  showGlobalNotice("warning", "Mencari lokasi", "Mengambil lokasi terkini dari Windows atau browser...");
  const preferNative = Boolean(desktopBridge?.isElectron && desktopBridge.platform === "win32");
  const native = preferNative ? await requestNativeDesktopPosition() : null;
  if (native?.ok && typeof native.lat === "number" && typeof native.lng === "number") {
    applyLocatedUser(native.lat, native.lng, native.accuracy, true, native.source || "windows-location");
    startDesktopLocationPolling();
    showGlobalNotice("success", "Lokasi aktif", "GPS Windows tersambung dan akan diperbarui berkala.");
    return;
  }

  try {
    const pos = await requestBrowserPosition();
    applyLocatedUser(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true, "browser-gps");
    startBrowserLocationWatch();
    showGlobalNotice("success", "Lokasi aktif", "Lokasi browser tersambung dan bergerak realtime.");
    return;
  } catch {
    const fallbackNative = preferNative ? null : await requestNativeDesktopPosition();
    if (fallbackNative?.ok && typeof fallbackNative.lat === "number" && typeof fallbackNative.lng === "number") {
      applyLocatedUser(fallbackNative.lat, fallbackNative.lng, fallbackNative.accuracy, true, fallbackNative.source || "windows-location");
      startDesktopLocationPolling();
      return;
    }
  }

  showGlobalNotice(
    "error",
    "Lokasi belum tersedia",
    "Aktifkan Location Services Windows lalu izinkan ITS Maps memakai lokasi.",
    desktopBridge?.openLocationSettings
      ? { actionLabel: "Settings lokasi", onAction: () => { void desktopBridge.openLocationSettings?.(); } }
      : undefined,
  );
}

function openCameraPreview(): void {
  const device = state.device;
  const anchor = map.getCenter();
  const cameraSurface = renderCameraSurface(device, "camera-image camera-video-popup", "camera-frame");
  const content = cameraSurface
    ? `<div class="camera-card">
      ${cameraSurface}
      <div class="camera-caption">${escapeHtml(device?.label || "Raspberry camera")} live</div>
    </div>`
    : `<div class="camera-card">
      <div class="camera-placeholder">Camera preview belum tersedia.</div>
      <div class="camera-caption">Controller belum mengirim URL publik atau path WebRTC.</div>
    </div>`;
  L.popup({ className: "camera-popup", closeButton: true, autoPan: true, maxWidth: 320 })
    .setLatLng(anchor).setContent(content).openOn(map);
  syncCameraViews(device);
  attachWebRtcStream();
}

function openVideoFullscreen(device: DeviceRecord | null): void {
  if (document.getElementById("video-fullscreen-modal")) return;
  const activeDevice = device ?? state.device ?? null;
  const traffic = activeDevice ? trafficStateForDevice(activeDevice) : null;
  const surface = renderCameraSurface(activeDevice, "video-fullscreen-media", "video-fullscreen-frame");
  const ambient = traffic?.color === "red" ? "#7f1d1d" : traffic?.color === "yellow" ? "#854d0e" : "#064e3b";
  const overlay = document.createElement("div");
  overlay.id = "video-fullscreen-modal";
  overlay.className = "video-fullscreen";
  overlay.style.setProperty("--video-ambient-a", ambient);
  overlay.innerHTML = `
  <div class="video-fullscreen-shell">
    <section class="video-fullscreen-stage" aria-label="Video realtime">
      <div class="video-fullscreen-ambient" aria-hidden="true"></div>
      <div class="video-fullscreen-surface" data-video-surface>
        ${surface || `<div class="video-fullscreen-empty">Kamera realtime belum tersedia</div>`}
        ${activeDevice ? renderDetectionOverlay(activeDevice) : ""}
      </div>
      <div class="video-fullscreen-status">
        <span class="webrtc-dot" data-status="${state.webrtc.status}"></span>
        <strong>${escapeHtml(activeDevice?.label || "Video Realtime")}</strong>
      </div>
      <div class="video-fullscreen-caption">${escapeHtml(webRtcStatusText())}</div>
      <button type="button" class="video-fullscreen-play" data-video-play aria-label="Putar video">▶</button>
      <div class="video-fullscreen-controls">
        <button type="button" class="video-fullscreen-ai" data-video-ai>AI</button>
        <button type="button" class="video-fullscreen-fit" data-video-fit aria-label="Fit to screen">⌖</button>
        <button type="button" class="video-fullscreen-close" data-video-close aria-label="Tutup">x</button>
      </div>
    </section>
    <aside class="video-ai-panel" aria-label="AI kendaraan">
      <div class="video-ai-handle" data-swipe-handle aria-hidden="true"></div>
      <header>
        <div>
          <span>AI YOLO</span>
          <strong>${escapeHtml(webRtcStatusText())}</strong>
        </div>
        <button type="button" data-video-ai-close aria-label="Tutup AI">x</button>
      </header>
      ${renderVehicleStatsGrid(activeDevice, traffic, "video-ai-stats")}
    </aside>
  </div>
`;
  document.body.appendChild(overlay);
  mapRoot.classList.add("hidden");
  document.getElementById("m-bottom-nav")?.classList.add("hidden");

  let scale = 1;
  const pointers = new Map<number, PointerEvent>();
  let startDistance = 0;
  let startScale = 1;
  const surfaceEl = overlay.querySelector<HTMLElement>("[data-video-surface]");
  const aiPanel = overlay.querySelector<HTMLElement>(".video-ai-panel");
  const setScale = (next: number) => {
    scale = clamp(next, 0.82, 1.55);
    overlay.style.setProperty("--video-scale", scale.toFixed(3));
  };
  const setAiWidth = (widthPx: number) => {
    if (!usesDesktopSidePanel()) return;
    overlay.style.setProperty("--video-ai-live-width", `${Math.max(0, Math.round(widthPx))}px`);
  };
  const closeVideo = () => {
    overlay.classList.remove("open", "ai-open");
    mapRoot.classList.remove("hidden");
    document.getElementById("m-bottom-nav")?.classList.remove("hidden");
    window.setTimeout(() => overlay.remove(), 220);
  };
  const openAi = () => {
    if (aiPanel) aiPanel.style.transform = "";
    overlay.classList.add("ai-open");
    requestAnimationFrame(() => setAiWidth(aiPanel?.getBoundingClientRect().width || 0));
  };
  const closeAi = () => {
    overlay.classList.remove("ai-open");
    if (aiPanel) aiPanel.style.transform = "";
    setAiWidth(0);
  };

  surfaceEl?.addEventListener("wheel", (event) => {
    event.preventDefault();
    setScale(scale + (event.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });
  surfaceEl?.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, event);
    surfaceEl.setPointerCapture?.(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      startDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      startScale = scale;
    }
  });
  surfaceEl?.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, event);
    if (pointers.size === 2 && startDistance > 0) {
      event.preventDefault();
      const [a, b] = [...pointers.values()];
      const nextDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      setScale(startScale * (nextDistance / startDistance));
    }
  });
  const clearPointer = (event: PointerEvent) => pointers.delete(event.pointerId);
  surfaceEl?.addEventListener("pointerup", clearPointer);
  surfaceEl?.addEventListener("pointercancel", clearPointer);

  overlay.querySelector<HTMLButtonElement>("[data-video-play]")?.addEventListener("click", () => {
    overlay.querySelectorAll<HTMLVideoElement>("video").forEach((video) => {
      void video.play().catch(() => undefined);
    });
  });
  overlay.querySelector<HTMLButtonElement>("[data-video-fit]")?.addEventListener("click", () => setScale(1));
  overlay.querySelector<HTMLButtonElement>("[data-video-ai]")?.addEventListener("click", openAi);
  overlay.querySelector<HTMLButtonElement>("[data-video-ai-close]")?.addEventListener("click", closeAi);
  overlay.querySelector<HTMLButtonElement>("[data-video-close]")?.addEventListener("click", closeVideo);

  if (aiPanel) {
    setupVideoAiSwipe(aiPanel, () => closeAi(), setAiWidth);
  }
  syncCameraViews(activeDevice);
  attachWebRtcStream();
  window.setTimeout(() => overlay.classList.add("open"), 20);
}

function setupVideoAiSwipe(sheetEl: HTMLElement, onClose: () => void, onWidthChange: (widthPx: number) => void): void {
  let startAxis = 0;
  let currentAxis = 0;
  let pointerId = -1;
  let startedAt = 0;
  let dragging = false;

  sheetEl.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    const startsOnHandle = Boolean(target.closest("[data-swipe-handle], header"));
    if (!startsOnHandle && target.closest("button, a, input, label, select, textarea")) return;
    const horizontal = usesDesktopSidePanel();
    startAxis = horizontal ? event.clientX : event.clientY;
    currentAxis = 0;
    pointerId = event.pointerId;
    startedAt = performance.now();
    dragging = true;
    sheetEl.dataset.swipeAxis = horizontal ? "x" : "y";
    sheetEl.style.transition = "none";
    sheetEl.setPointerCapture?.(event.pointerId);
  });

  sheetEl.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const horizontal = sheetEl.dataset.swipeAxis === "x";
    const axis = horizontal ? event.clientX : event.clientY;
    currentAxis = Math.max(0, axis - startAxis);
    if (currentAxis > 2) event.preventDefault();
    sheetEl.style.transform = horizontal ? `translateX(${currentAxis}px)` : `translateY(${currentAxis}px)`;
    if (horizontal) onWidthChange(Math.max(0, sheetEl.getBoundingClientRect().width - currentAxis));
  });

  const finish = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    sheetEl.style.transition = "";
    const velocity = currentAxis / Math.max(1, performance.now() - startedAt);
    if (currentAxis > 56 || velocity > 0.55) {
      onClose();
    } else {
      sheetEl.style.transform = "";
      onWidthChange(sheetEl.getBoundingClientRect().width);
    }
  };
  sheetEl.addEventListener("pointerup", finish);
  sheetEl.addEventListener("pointercancel", finish);
  installWheelSheetDismiss(sheetEl, onClose);
}

// Tablet & POI interactions
const TABLET_CATEGORIES = ["all", "hospital", "worship", "mall", "campus", "parking"] as const;
const TABLET_CATEGORY_LABELS: Record<(typeof TABLET_CATEGORIES)[number], string> = {
  all: "Semua",
  hospital: "Rumah Sakit",
  worship: "Mesjid",
  mall: "Belanja",
  campus: "Sekolah/Kampus",
  parking: "Parkir",
};

function showVehicleMarker(latlng: [number, number]): void {
  if (state.vehicleMarker) {
    state.vehicleMarker.setLatLng(latlng);
    return;
  }
  const icon = L.divIcon({
    className: "vehicle-marker-icon",
    html: `<div class="vehicle-marker-shell"><div class="vehicle-marker-pulse"></div><div class="vehicle-marker-core"><div class="vehicle-glyph">🚗</div></div></div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
  });
  const m = L.marker(latlng, { icon, interactive: true, zIndexOffset: 2000 }).addTo(map);
  m.on("click", () => {
    if (isTablet()) createTabletCategoryPanel(true);
  });
  // Ensure marker DOM accepts pointer events (some CSS may disable them)
  setTimeout(() => {
    try {
      const el = m.getElement() as HTMLElement | null;
      if (el) {
        el.style.pointerEvents = 'auto';
        el.style.cursor = 'pointer';
        el.setAttribute('title', 'Lokasi Anda');
      }
    } catch {
      /* ignore */
    }
  }, 0);
  state.vehicleMarker = m;
}

function createTabletCategoryPanel(autoFocus = false): void {
  // If already open, keep it
  const existing = document.getElementById("m-tablet-categories");
  if (existing) {
    if (autoFocus) {
      existing.querySelector<HTMLInputElement>(".tablet-search-input")?.focus();
    }
    return;
  }
  const bodyHtml = `
  <div class="m-sheet-handle-bar"></div>
  <div class="tablet-categories">
    <div class="tablet-header">
      <div class="tablet-title">Lokasi Anda</div>
      <div class="tablet-subtitle">Cari POI atau pilih kategori untuk menampilkan tempat terdekat</div>
    </div>
    <label class="tablet-search">
      <span class="tablet-search-icon">⌕</span>
      <input type="search" class="tablet-search-input" placeholder="Cari masjid, sekolah, SPBU, mall..." autocomplete="off" />
    </label>
    <div class="tablet-cats-list">
      ${TABLET_CATEGORIES.map((c, i) => `<button class="tablet-cat-btn" data-index="${i}">${TABLET_CATEGORY_LABELS[c]}</button>`).join("")}
    </div>
    <div class="tablet-hint">Ketuk marker POI di peta untuk memilih tujuan.</div>
  </div>`;
  const overlay = createSwipeableSheetModal("m-tablet-categories", "m-tablet-sheet", bodyHtml);
  overlay.querySelector<HTMLDivElement>('.m-layer-backdrop')?.addEventListener('click', () => { overlay.remove(); });
  const sheet = overlay.querySelector<HTMLElement>(".m-tablet-sheet");
  if (!sheet) return;
  setupSheetSwipe(sheet, () => overlay.remove());
  const searchInput = sheet.querySelector<HTMLInputElement>(".tablet-search-input");
  if (searchInput) {
    searchInput.value = state.tabletSearchQuery || "";
    searchInput.addEventListener("input", () => {
      state.tabletSearchQuery = searchInput.value.trim().toLowerCase();
      updateTabletCategoryView();
    });
    if (autoFocus) window.setTimeout(() => searchInput.focus(), 0);
  }
  sheet.querySelectorAll<HTMLButtonElement>(".tablet-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.index || 0);
      state.tabletCategoryIndex = idx;
      updateTabletCategoryView();
      overlay.remove();
    });
  });
}

function updateTabletCategoryView(): void {
  const idx = state.tabletCategoryIndex ?? 0;
  const kind = TABLET_CATEGORIES[idx] || "all";
  const query = (state.tabletSearchQuery || "").trim();
  for (const [id, marker] of state.poiMarkers.entries()) {
    const poi = state.poiData.get(id);
    const el = marker.getElement() as HTMLElement | null;
    if (!poi) continue;
    const matchesQuery = !query || `${poi.title} ${poi.kind} ${poi.address || ""}`.toLowerCase().includes(query);
    const show = (kind === "all" || poi.kind === kind) && matchesQuery;
    if (el) el.style.display = show ? "" : "none";
  }

  // If the filter is not all, ensure the POI layer remains visually filtered after map moves.
  if (state.overpassLayer) {
    state.overpassLayer.getLayers().forEach((layer: any) => {
      const poiId = layer?.options?.poiId;
      if (!poiId) return;
      const poi = state.poiData.get(poiId);
      if (!poi) return;
      const visible = (kind === "all" || poi.kind === kind) && (!query || `${poi.title} ${poi.kind} ${poi.address || ""}`.toLowerCase().includes(query));
      const layerEl = layer.getElement?.() as HTMLElement | null;
      if (layerEl) layerEl.style.display = visible ? "" : "none";
    });
  }
}

function clearDestinationRoute(): void {
  if (state.routeLayer) {
    try { map.removeLayer(state.routeLayer); } catch { }
    state.routeLayer = null;
  }
  if (state.destinationMarker) {
    try { map.removeLayer(state.destinationMarker); } catch { }
    state.destinationMarker = null;
  }
}

function setDestinationToPoi(poi: PoiRecord): void {
  clearDestinationRoute();
  const from = state.vehicleMarker ? state.vehicleMarker.getLatLng() : map.getCenter();
  const to = L.latLng(poi.lat, poi.lng);
  const routeRequestId = ++state.routeRequestSeq;

  const drawRoute = (points: L.LatLngExpression[]): void => {
    if (routeRequestId !== state.routeRequestSeq) return;
    const poly = L.polyline(points, { color: "#2563eb", weight: 4, opacity: 0.9 }).addTo(map);
    const dest = L.marker(to, { title: poi.title }).addTo(map);
    const group = L.layerGroup([poly, dest]);
    state.routeLayer = group.addTo(map);
    state.destinationMarker = dest;
    map.fitBounds(poly.getBounds().pad(0.2));
  };

  const drawFallback = (): void => drawRoute([from, to]);

  void (async () => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Route request failed: ${res.status}`);
      const data = await res.json() as {
        routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
      };
      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!coords || coords.length < 2) throw new Error("Route geometry missing");
      drawRoute(coords.map(([lng, lat]) => [lat, lng] as L.LatLngExpression));
    } catch {
      drawFallback();
    }
  })();
}

function handlePoiClick(poi: PoiRecord): void {
  if (isTablet()) {
    // If tablet category is active, treat POI as destination; otherwise open modal
    if (state.tabletCategoryIndex !== null) {
      void setDestinationToPoi(poi);
      // close tablet sheet if open
      document.getElementById("m-tablet-categories")?.remove();
      return;
    }
    // fallback: open modal
    openPoiModal(poi);
    return;
  }
  // desktop: open modal as before
  openPoiModal(poi);
}

// ─── Toolbar Control ─────────────────────────────────────────────

function firebaseDeviceUrl(deviceId: string): string {
  return FIREBASE_DEVICES_URL.replace(/\.json$/, `/${encodeURIComponent(deviceId)}.json`);
}

async function patchFirebaseDevice(deviceId: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(firebaseDeviceUrl(deviceId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Firebase PATCH ${deviceId} failed: HTTP ${res.status}`);
}

function makeCompassSvg(): string {
  return `<svg class="compass-svg" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="24" cy="24" r="21.5" class="compass-ring-bg"/>
  <path d="M11.2 24 L15.2 20.8 L15.2 27.2 Z" class="compass-arrow-left"/>
  <path d="M36.8 24 L32.8 20.8 L32.8 27.2 Z" class="compass-arrow-right"/>
  <text x="24" y="9.8" text-anchor="middle" class="compass-label compass-label-n">N</text>
  <text x="24" y="42.4" text-anchor="middle" class="compass-label">S</text>
  <text x="9" y="26.4" text-anchor="middle" class="compass-label">W</text>
  <text x="39" y="26.4" text-anchor="middle" class="compass-label">E</text>
  <g class="compass-needle-group">
    <polygon points="24,13.5 28.4,24 24,34.5 19.6,24" class="compass-needle-shadow"/>
    <polygon points="24,13.5 28.4,24 24,24 19.6,24" class="compass-needle-north"/>
    <polygon points="24,34.5 28.4,24 24,24 19.6,24" class="compass-needle-south"/>
    <circle cx="24" cy="24" r="2.2" class="compass-needle-cap"/>
  </g>
</svg>`;
}

const BottomRightControl = L.Control.extend({
  options: { position: "bottomright" },
  onAdd(): HTMLElement {
    const mobile = isMobile();
    const container = L.DomUtil.create("div", mobile ? "map-toolbar map-toolbar-mobile" : "map-toolbar");
    container.innerHTML = mobile ? `
    <button type="button" class="toolbar-compass" data-action="compass"
            title="Kompas – klik untuk putar peta">
      ${makeCompassSvg()}
    </button>
    <button type="button" class="toolbar-btn" data-action="locate" title="Lokasi saya">
      <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
        <circle cx="10" cy="10" r="3.2" stroke="currentColor" stroke-width="1.7"/>
        <path d="M10 1.5v2.8M10 15.7v2.8M1.5 10h2.8M15.7 10h2.8"
              stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <button type="button" class="toolbar-btn" data-action="home" title="Kembali ke posisi device">
      <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
              stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M7.5 18v-5h5v5"
              stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="toolbar-divider"></div>
    <button type="button" class="toolbar-btn toolbar-zoom" data-action="zoom-in"  title="Zoom in">+</button>
    <button type="button" class="toolbar-btn toolbar-zoom" data-action="zoom-out" title="Zoom out">−</button>
    <div class="toolbar-divider"></div>
    <button type="button" class="toolbar-camera" data-action="camera" title="Camera preview">
      <div class="camera-thumb-wrap"></div>
      <span class="camera-tile-label">全景</span>
    </button>
  ` : `
    <button type="button" class="toolbar-compass" data-action="compass"
            title="Kompas – klik untuk putar peta">
      ${makeCompassSvg()}
    </button>
    <button type="button" class="toolbar-btn" data-action="locate" title="Lokasi saya">
      <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
        <circle cx="10" cy="10" r="3.2" stroke="currentColor" stroke-width="1.7"/>
        <path d="M10 1.5v2.8M10 15.7v2.8M1.5 10h2.8M15.7 10h2.8"
              stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      </svg>
    </button>
    <button type="button" class="toolbar-btn" data-action="home" title="Kembali ke posisi device">
      <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M3 9.5L10 3l7 6.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"
              stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
        <path d="M7.5 18v-5h5v5"
              stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
      </svg>
    </button>
    <div class="toolbar-divider"></div>
    <button type="button" class="toolbar-btn toolbar-zoom" data-action="zoom-in"  title="Zoom in">+</button>
    <button type="button" class="toolbar-btn toolbar-zoom" data-action="zoom-out" title="Zoom out">−</button>
    <div class="toolbar-divider"></div>
    <button type="button" class="toolbar-camera" data-action="camera" title="Camera preview">
      <div class="camera-thumb-wrap"></div>
      <span class="camera-tile-label">全景</span>
    </button>
  `;

    const tooltipLabels: Record<string, string> = {
      compass: "Kompas - klik untuk putar peta ke Timur (90 deg)",
      mode: "Ganti tampilan peta",
      locate: "Lokasi saya",
      home: "Kembali ke posisi device",
      "zoom-in": "Zoom in",
      "zoom-out": "Zoom out",
      camera: "Camera preview",
    };
    container.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
      const action = btn.dataset.action || "";
      const label = tooltipLabels[action] || btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
      btn.removeAttribute("title");
      if (!btn.getAttribute("aria-label") && label) btn.setAttribute("aria-label", label);
      if (!btn.querySelector(".toolbar-tip") && label) {
        const tip = document.createElement("span");
        tip.className = "toolbar-tip";
        tip.textContent = label;
        btn.appendChild(tip);
      }
    });

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    state.compassNeedle = container.querySelector<SVGGElement>(".compass-needle-group");
    state.compassBtn = container.querySelector<HTMLButtonElement>(".toolbar-compass");
    state.cameraPreview = container.querySelector<HTMLDivElement>(".camera-thumb-wrap");
    state.cameraButton = container.querySelector<HTMLButtonElement>(".toolbar-camera");

    container.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (action === "compass") handleCompassClick();
        else if (action === "locate") locateUser();
        else if (action === "home") goHome();
        else if (action === "camera") {
          if (isMobile()) {
            switchMobileTab("its");
            focusITSVideoSection();
          } else {
            openCameraPreview();
          }
        }
        else if (action === "zoom-in") map.zoomIn();
        else if (action === "zoom-out") map.zoomOut();
      });
    });

    renderCameraTile();
    updateCompass();
    return container;
  },
});

new BottomRightControl().addTo(map);

// Mode control for switching base maps (street / 3d / satellite)
const ModeControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd(): HTMLElement {
    const container = L.DomUtil.create('div', 'mode-control');
    container.innerHTML = `
    <button class="mode-btn" data-mode="street" title="Street">2D</button>
    <button class="mode-btn mode-legend-btn" data-map-symbol-legend type="button" title="Legenda simbol peta" aria-label="Legenda simbol peta" aria-expanded="false">?</button>
    <div class="map-symbol-legend" data-map-symbol-panel hidden>
      <strong>Legenda 2D</strong>
      <span><i class="legend-road"></i> Jalan utama / avenue</span>
      <span><i class="legend-tree"></i> Median atau tepi berpohon</span>
      <span><i class="legend-water"></i> Sungai, kanal, drainase</span>
      <span><i class="legend-sidewalk"></i> Trotoar / jalur jalan kaki</span>
      <span><i class="legend-rail"></i> Rel dan palang perlintasan</span>
      <span><i class="legend-ai"></i> Petunjuk AI dari satelit</span>
    </div>
    <button class="mode-btn" data-mode="3d" title="3D">3D</button>
    <button class="mode-btn" data-mode="satellite" title="Satellite">Sat</button>
  `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    container.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.mapSymbolLegend !== undefined) return;
        const m = (btn.dataset.mode as BaseMapMode) || 'street';
        void setBaseMap(m);
      });
    });
    const legendBtn = container.querySelector<HTMLButtonElement>("[data-map-symbol-legend]");
    const legendPanel = container.querySelector<HTMLElement>("[data-map-symbol-panel]");
    legendBtn?.addEventListener("click", () => {
      const open = legendPanel?.hidden ?? true;
      if (legendPanel) legendPanel.hidden = !open;
      legendBtn.setAttribute("aria-expanded", String(open));
    });
    return container;
  }
});

function updateModeControlButtons(): void {
  document.querySelectorAll<HTMLButtonElement>(".mode-control [data-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.baseMode);
  });
}

function syncModeControlVisibility(): void {
  const shouldShowModeControl = !isMobile() && !isTablet();
  if (shouldShowModeControl) {
    if (!state.modeControl) {
      state.modeControl = new ModeControl();
      state.modeControl.addTo(map);
    }
    updateModeControlButtons();
    return;
  }

  if (state.modeControl) {
    map.removeControl(state.modeControl);
    state.modeControl = null;
  }
}

syncModeControlVisibility();

map.on("rotate", updateCompass);
map.on("move zoom", updateCompass);
map.on("zoomend", rescaleMarkers);
map.on("move zoom rotate", () => syncMapLibreView());
map.on("resize", () => {
  state.maplibreMap?.resize();
  syncMapLibreView(true);
  syncModeControlVisibility();
});
window.addEventListener("resize", syncModeControlVisibility);

// ─── Fetch & refresh ────────────────────────────────────────────

// Firebase RTDB — dibaca langsung sebagai fallback jika file lokal tidak tersedia
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const text = await res.text();
  // Guard: pastikan response adalah JSON, bukan HTML 404 page
  if (text.trimStart().startsWith("<")) {
    throw new Error(`Expected JSON but got HTML from ${url}`);
  }
  return JSON.parse(text) as T;
}

/**
 * Baca Firebase RTDB: GET /devices.json
 * Hasilnya Record<id, DeviceRecord|LegacyWrapper> dibungkus sebagai Snapshot.
 */
async function fetchFirebaseDevices(): Promise<Snapshot> {
  const res = await fetch(FIREBASE_DEVICES_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Firebase HTTP ${res.status}`);
  const data = await res.json() as Record<string, unknown> | null;
  if (!data || typeof data !== "object") throw new Error("Firebase: empty/null");
  return { devices: data as Record<string, SnapshotDevice>, source: "firebase" };
}

function applyDevices(devices: DeviceRecord[]): void {
  state.devices = devices;
  const activeIds = new Set(devices.map((d) => d.id));
  removeMissingMarkers(activeIds);
  devices.forEach((d) => ensureMarker(d));
  const selected = state.device && activeIds.has(state.device.id)
    ? devices.find((d) => d.id === state.device!.id) ?? devices[0]
    : devices[0];
  state.device = selected;
  showUpdateNoticeForDevice(selected);
  renderCameraTile();
  devices.forEach((device) => {
    void resolveRoadName(device).then(() => {
      state.trafficById.set(device.id, buildTrafficState(device));
      const marker = state.markers.get(device.id);
      if (marker) {
        const size = markerSizeByZoom();
        marker.setIcon(L.divIcon({
          className: "traffic-light-marker-icon",
          html: makeTrafficLightSvg(trafficStateForDevice(device), size),
          iconSize: [size, Math.round(size * 1.5)],
          iconAnchor: markerAnchorBySize(size),
          popupAnchor: [0, -Math.round(size * 1.2)],
        }));
      }
      if (state.activeModalDeviceId === device.id && state.device?.id === device.id) {
        refreshOpenDeviceModal(device);
      }
    });
  });
  if (!state.hasCentered) {
    map.setView([selected.position.lat, selected.position.lng],
      map.getZoom() || DEFAULT_ZOOM, { animate: false });
    state.hasCentered = true;
  }

  syncPoiMarkers([selected.position.lat, selected.position.lng]);
  rescaleMarkers();
}

function updateNoticeTitle(update: ControllerUpdateInfo): string {
  if (update.status === "error") return "Update controller gagal";
  if (update.stage === "downloading") return "Mengunduh update controller";
  if (update.stage === "downloaded") return "Update controller berhasil diunduh";
  if (update.stage === "installing") return "Menerapkan update controller";
  if (update.stage === "rebooting") return "Raspberry Pi akan restart";
  if (update.stage === "restarted") return "Controller berhasil direstart";
  if (update.stage === "up-to-date") return "Controller sudah versi terbaru";
  if (update.status === "complete") return "Update controller selesai";
  return "Status update controller";
}

function maybeShowBrowserNotification(title: string, message: string): void {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body: message,
      tag: "its-controller-update",
      silent: false,
    });
    window.setTimeout(() => notification.close(), 7000);
  } catch {
    // Browser may block system notifications despite a granted permission.
  }
}

function requestBrowserNotificationPermission(): void {
  if (!("Notification" in window)) {
    showGlobalNotice("warning", "Notifikasi browser tidak didukung", "Browser ini belum mendukung notifikasi sistem");
    return;
  }
  void Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      showGlobalNotice("success", "Notifikasi aktif", "Update Raspberry Pi akan muncul sebagai notifikasi browser");
      maybeShowBrowserNotification("Notifikasi ITS aktif", "Dashboard akan memberi kabar saat update controller berjalan");
    } else {
      showGlobalNotice("warning", "Notifikasi belum aktif", "Izin notifikasi browser belum diberikan");
    }
  });
}

function maybePromptNotificationPermission(): void {
  if (state.notificationPromptShown) return;
  if (!("Notification" in window) || Notification.permission !== "default") return;
  state.notificationPromptShown = true;
  showGlobalNotice(
    "info",
    "Aktifkan notifikasi update",
    "Tekan Aktifkan agar status download, restart, dan update Raspberry muncul di browser",
    { actionLabel: "Aktifkan", onAction: requestBrowserNotificationPermission },
  );
}

function showGlobalNotice(
  kind: NoticeKind,
  title: string,
  message: string,
  action?: { actionLabel: string; onAction: () => void },
): void {
  let host = document.querySelector<HTMLDivElement>(".global-notice-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "global-notice-host";
    document.body.appendChild(host);
  }

  const notice = document.createElement("div");
  notice.className = `global-notice global-notice-${kind}`;
  notice.innerHTML = `
  <div class="global-notice-dot"></div>
  <div class="global-notice-copy">
    <strong>${escapeHtml(title)}</strong>
    <span>${escapeHtml(message)}</span>
  </div>
  ${action ? `<button class="global-notice-action" type="button">${escapeHtml(action.actionLabel)}</button>` : ""}
`;
  notice.querySelector<HTMLButtonElement>(".global-notice-action")?.addEventListener("click", () => {
    action?.onAction();
    notice.classList.remove("show");
    window.setTimeout(() => notice.remove(), 220);
  });
  host.appendChild(notice);
  window.setTimeout(() => notice.classList.add("show"), 20);
  window.setTimeout(() => {
    notice.classList.remove("show");
    window.setTimeout(() => notice.remove(), 220);
  }, action ? 12000 : kind === "error" ? 9000 : 6500);
}

function showUpdateNoticeForDevice(device: DeviceRecord | null): void {
  const update = device?.update;
  if (!device || !update) return;
  const updatedAt = normalizeEpoch(update.updatedAt ?? 0);
  if (!updatedAt) return;
  const ageMs = Date.now() - updatedAt;
  if (ageMs > 20 * 60_000 && update.status !== "running") return;
  const key = `${device.id}:${update.status || ""}:${update.stage || ""}:${updatedAt}`;
  if (state.lastUpdateNoticeKey === key) return;
  state.lastUpdateNoticeKey = key;

  const kind = update.status === "error"
    ? "error"
    : update.status === "complete"
      ? "success"
      : update.stage === "rebooting"
        ? "warning"
        : "info";
  const title = updateNoticeTitle(update);
  const message = update.message || "Status update controller berubah";
  showGlobalNotice(kind, title, message);
  maybeShowBrowserNotification(title, message);
}

function reportOfflineDevices(devices: DeviceRecord[]): void {
  const staleOffline = devices.filter((device) =>
    device.status === "offline"
    && device.lastSeen > 0
    && Date.now() - device.lastSeen > OFFLINE_AFTER_MS
    && !state.offlineReported.has(device.id),
  );

  staleOffline.forEach((device) => {
    state.offlineReported.add(device.id);
    void patchFirebaseDevice(device.id, {
      status: "offline",
      note: "controller tidak mengirim heartbeat; status diset offline oleh dashboard",
    }).catch((err) => {
      state.offlineReported.delete(device.id);
      console.warn("[ITS] Failed to mark device offline:", err);
    });
  });
}

async function refreshSnapshot(): Promise<void> {
  if (state.refreshBusy) return;
  state.refreshBusy = true;
  try {
    // Baca config — jangan crash jika tidak ada (return HTML 404)
    try {
      const config = await fetchJson<AppConfig>("./data/its-config.json");
      state.config = {
        snapshotUrl: config.snapshotUrl?.trim() || DEFAULT_CONFIG.snapshotUrl,
        refreshMs: config.refreshMs && config.refreshMs > 0
          ? config.refreshMs : DEFAULT_CONFIG.refreshMs,
      };
    } catch {
      state.config = DEFAULT_CONFIG;
    }

    // Coba snapshot lokal → fallback Firebase
    let snapshot: Snapshot | null = null;
    try {
      snapshot = await fetchJson<Snapshot>(state.config.snapshotUrl);
    } catch (localErr) {
      console.warn("[ITS] Local snapshot failed, trying Firebase:", localErr);
      snapshot = await fetchFirebaseDevices();
    }

    let devices = normalizeDevices(snapshot);

    // Jika lokal ada tapi kosong, coba Firebase
    if (!devices.length) {
      console.warn("[ITS] Local snapshot empty, trying Firebase...");
      try {
        const fbSnapshot = await fetchFirebaseDevices();
        devices = normalizeDevices(fbSnapshot);
      } catch { /* Firebase juga gagal, biarkan devices tetap kosong */ }
    }

    if (!devices.length) throw new Error("No valid devices found (local & Firebase)");

    applyDevices(devices);
    maybePromptNotificationPermission();
    reportOfflineDevices(devices);
  } catch (err) {
    console.warn("[ITS] Snapshot error:", err);
    for (const marker of state.markers.values()) map.removeLayer(marker);
    state.markers.clear();
    state.devices = [];
    state.device = null;
  } finally {
    state.refreshBusy = false;
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refreshSnapshot, state.config.refreshMs);
    itsInitialDataReady = true;
    window.dispatchEvent(new CustomEvent("its:initial-data-ready"));
  }
}

window.addEventListener("beforeunload", () => {
  window.clearTimeout(state.refreshTimer);
  stopWebRtcSession(true);
  map.remove();
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE UI PATCH — VERSI FIXED (semua error TS6133 sudah diperbaiki)
// Ganti seluruh blok mobile patch di main.ts dengan file ini
// ═══════════════════════════════════════════════════════════════════════════

// ─── Mobile Detection ───────────────────────────────────────────────────────

function isMobile(): boolean {
  // Treat narrow phones as mobile. Tablets (~768px) should NOT be classified as mobile
  return window.innerWidth <= 600 || /Mobi|Android|iPhone(?!.*iPad)|Android.*Mobile/i.test(navigator.userAgent);
}

function isTablet(): boolean {
  // Classify tablet purely by width to avoid UA inconsistencies in responsive emulation
  const w = window.innerWidth;
  return w >= 601 && w <= 1200;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MobileTab = "peta" | "its" | "profil";
type LayerMode = "street" | "satellite" | "3d";

const mobileState = {
  activeTab: "peta" as MobileTab,
  layerModalOpen: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ─── 1. Bottom Navigation (Blur) ─────────────────────────────────────────────

function createMobileBottomNav(): HTMLElement {
  const nav = document.createElement("nav");
  nav.id = "m-bottom-nav";
  nav.innerHTML = `
  <button class="m-nav-tab active" data-tab="peta">
    <span class="m-nav-icon">
      <img src="/petaits.png" alt="" width="22" height="22"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <svg style="display:none" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <path d="M3 6l7-3 4 2 7-3v15l-7 3-4-2-7 3V6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M10 3v15M14 5v15" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </span>
    <span class="m-nav-label">Peta</span>
  </button>
  <button class="m-nav-tab" data-tab="its">
    <span class="m-nav-icon">
      <img src="/itss.png" alt="" width="22" height="22"
           onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <svg style="display:none" viewBox="0 0 24 24" fill="none" width="22" height="22">
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="1.8"/>
        <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="m-nav-label">ITS</span>
  </button>
  <button class="m-nav-tab" data-tab="profil">
    <span class="m-nav-icon">
      <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
        <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
        <path d="M4 20c0-3.314 3.582-6 8-6s8 2.686 8 6"
              stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>
    </span>
    <span class="m-nav-label">Profil</span>
  </button>
`;

  nav.querySelectorAll<HTMLButtonElement>(".m-nav-tab").forEach(btn => {
    btn.addEventListener("click", () => switchMobileTab(btn.dataset.tab as MobileTab));
  });

  return nav;
}

function switchMobileTab(tab: MobileTab): void {
  mobileState.activeTab = tab;

  document.querySelectorAll(".m-nav-tab").forEach(b => b.classList.remove("active"));
  document.querySelector<HTMLButtonElement>(`.m-nav-tab[data-tab="${tab}"]`)?.classList.add("active");

  if (tab === "peta") {
    closeITSSheet();
  } else if (tab === "its") {
    openITSSheet();
  } else if (tab === "profil") {
    closeITSSheet();
    openProfilSheet();
  }
}

// ─── 2. Layer Button + Swipeable Layer Modal ──────────────────────────────────

function createLayerButton(): HTMLElement {
  const btn = document.createElement("button");
  btn.id = "m-layer-btn";
  btn.setAttribute("aria-label", "Ganti lapisan peta");
  btn.innerHTML = `
  <img src="/lapisan.svg" alt="Lapisan" width="20" height="20"
       onerror="this.outerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' width=\\'20\\' height=\\'20\\'><path d=\\'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5\\' stroke=\\'currentColor\\' stroke-width=\\'1.8\\' stroke-linejoin=\\'round\\'/></svg>'">
`;
  // Prevent clicks on the layer button from propagating to the map (which
  // could trigger marker popups underneath). Also stop default to avoid
  // unexpected map interactions.
  L.DomEvent.disableClickPropagation(btn);
  L.DomEvent.disableScrollPropagation(btn);
  btn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); openLayerModal(); });
  return btn;
}

function openLayerModal(): void {
  if (document.getElementById("m-layer-modal")) return;
  mobileState.layerModalOpen = true;

  const overlay = document.createElement("div");
  overlay.id = "m-layer-modal";
  overlay.innerHTML = `
  <div class="m-layer-backdrop"></div>
  <div class="m-layer-sheet">
    <div class="m-sheet-handle-bar"></div>
    <div class="m-layer-title">Pilih Tampilan Peta</div>
    <div class="m-layer-options">
      <button class="m-layer-opt ${state.baseMode === 'street' ? 'active' : ''}" data-mode="street">
        <div class="m-layer-icon">🗺️</div>
        <span>Carto 2D</span>
      </button>
      <button class="m-layer-opt ${state.baseMode === 'satellite' ? 'active' : ''}" data-mode="satellite">
        <div class="m-layer-icon">🛰️</div>
        <span>Satelit</span>
      </button>
      <button class="m-layer-opt ${state.baseMode === '3d' ? 'active' : ''}" data-mode="3d">
        <div class="m-layer-icon">🏙️</div>
        <span>3D</span>
      </button>
    </div>
  </div>
`;

  overlay.querySelector(".m-layer-backdrop")!.addEventListener("click", closeLayerModal);

  overlay.querySelectorAll<HTMLButtonElement>(".m-layer-opt").forEach(btn => {
    btn.addEventListener("click", async () => {
      const mode = btn.dataset.mode as LayerMode;
      overlay.querySelectorAll(".m-layer-opt").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      await setBaseMap(mode);
      setTimeout(closeLayerModal, 280);
    });
  });

  setupSheetSwipe(
    overlay.querySelector<HTMLElement>(".m-layer-sheet")!,
    closeLayerModal
  );

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
}

function closeLayerModal(): void {
  const modal = document.getElementById("m-layer-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.classList.add("closing");
  setTimeout(() => modal.remove(), 320);
  mobileState.layerModalOpen = false;
}

// ─── 3. Generic Sheet Swipe Handler ──────────────────────────────────────────

function sheetSwipeHandleTarget(target: HTMLElement | null): boolean {
  return Boolean(target?.closest(
    "[data-swipe-handle], .m-sheet-handle-bar, .m-layer-title, .modal-header, .poi-modal-header, .sheet-panel-header, .windows-download-head, .windows-download-detail-head, .map-license-head, .m-profil-inner",
  ));
}

function nearestScrollableSheetTarget(target: HTMLElement | null, sheetEl: HTMLElement): HTMLElement {
  let node: HTMLElement | null = target;
  while (node && node !== sheetEl) {
    const style = window.getComputedStyle(node);
    const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
    if (canScroll) return node;
    node = node.parentElement;
  }
  return sheetEl;
}

function canStartSheetDismiss(target: HTMLElement | null, sheetEl: HTMLElement, horizontal: boolean): boolean {
  if (horizontal) return true;
  const scrollTarget = nearestScrollableSheetTarget(target, sheetEl);
  return scrollTarget.scrollTop <= 1;
}

function installWheelSheetDismiss(sheetEl: HTMLElement, onClose: () => void): void {
  let offset = 0;
  let resetTimer = 0;
  sheetEl.addEventListener("wheel", (event) => {
    if (usesDesktopSidePanel()) return;
    const target = event.target as HTMLElement | null;
    const scrollTarget = nearestScrollableSheetTarget(target, sheetEl);
    const atTop = scrollTarget.scrollTop <= 1;
    const atBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 2;
    const pullDownFromTop = atTop && event.deltaY < -8;
    const pushPastBottom = atBottom && event.deltaY > 10;
    const wheelPull = pullDownFromTop ? Math.abs(event.deltaY) : pushPastBottom ? event.deltaY * 0.55 : 0;
    if (!wheelPull) return;
    event.preventDefault();
    offset = clamp(offset + wheelPull, 0, 190);
    sheetEl.style.transition = "none";
    sheetEl.style.transform = `translateY(${offset}px)`;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      sheetEl.style.transition = "";
      if (offset > 74) onClose();
      else sheetEl.style.transform = "";
      offset = 0;
    }, 110);
  }, { passive: false });
}

function setupSheetSwipe(sheetEl: HTMLElement, onClose: () => void): void {
  let startAxis = 0;
  let currentAxis = 0;
  let dragging = false;
  let pointerId = -1;
  let startedAt = 0;

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement;
    const startsOnHandle = sheetSwipeHandleTarget(target);
    if (!startsOnHandle && target.closest("button, a, input, label, select, textarea")) return;
    const horizontal = usesDesktopSidePanel();
    if (!startsOnHandle && !canStartSheetDismiss(target, sheetEl, horizontal)) return;
    startAxis = horizontal ? e.clientX : e.clientY;
    currentAxis = 0;
    dragging = true;
    pointerId = e.pointerId;
    startedAt = performance.now();
    sheetEl.dataset.swipeAxis = horizontal ? "x" : "y";
    sheetEl.style.transition = "none";
    sheetEl.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    const horizontal = sheetEl.dataset.swipeAxis === "x";
    const axis = horizontal ? e.clientX : e.clientY;
    currentAxis = Math.max(0, axis - startAxis);
    if (currentAxis > 2) e.preventDefault();
    sheetEl.style.transform = horizontal ? `translateX(${currentAxis}px)` : `translateY(${currentAxis}px)`;
    if (horizontal && document.body.classList.contains("map-modal-panel-open")) {
      const remaining = Math.max(0, sheetEl.getBoundingClientRect().width - currentAxis);
      setSidePanelWidth(remaining);
    }
  };

  const onPointerEnd = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    sheetEl.style.transition = "";
    const elapsed = Math.max(1, performance.now() - startedAt);
    const velocity = currentAxis / elapsed;
    if (currentAxis > 56 || velocity > 0.55) {
      onClose();
    } else {
      sheetEl.style.transform = "";
      if (sheetEl.dataset.swipeAxis === "x" && document.body.classList.contains("map-modal-panel-open")) {
        setSidePanelWidthFromSheet(sheetEl);
      }
    }
  };

  sheetEl.addEventListener("pointerdown", onPointerDown);
  sheetEl.addEventListener("pointermove", onPointerMove);
  sheetEl.addEventListener("pointerup", onPointerEnd);
  sheetEl.addEventListener("pointercancel", onPointerEnd);
  installWheelSheetDismiss(sheetEl, onClose);
}

// ─── 4. ITS Sheet (Swipeable, Dynamic Map Resize) ────────────────────────────

const ITS_SNAP = {
  closed: 0,
  peek: () => Math.round((window.innerHeight - 64) * 0.65),
  full: () => Math.round((window.innerHeight - 64) * 0.85),
};

// FIX 1: hapus itsSheetDragY yang tidak pernah dipakai
let itsCurrentSnap: "closed" | "peek" | "full" = "closed";

function getMapEl(): HTMLElement | null {
  return document.getElementById("map");
}

function setMobileToolbarSheetOffset(heightPx: number): void {
  if (!isMobile()) {
    document.documentElement.style.setProperty("--m-sheet-offset", "0px");
    document.documentElement.style.setProperty("--m-sheet-progress", "0");
    return;
  }
  const offset = Math.max(0, Math.round(heightPx > 0 ? heightPx + 64 : 0));
  const progress = clamp(heightPx / Math.max(1, ITS_SNAP.peek()), 0, 1);
  const root = document.documentElement;
  root.style.setProperty("--m-sheet-offset", `${offset}px`);
  root.style.setProperty("--m-sheet-progress", progress.toFixed(3));
  root.style.setProperty("--m-locate-left", `${Math.round(lerp(12, 82, progress))}px`);
  root.style.setProperty("--m-home-left", `${Math.round(lerp(12, 28, progress))}px`);
  root.style.setProperty("--m-zoom-in-right", `${Math.round(lerp(12, 82, progress))}px`);
  root.style.setProperty("--m-zoom-out-right", `${Math.round(lerp(12, 28, progress))}px`);
  root.style.setProperty("--m-locate-bottom", `${Math.round(lerp(120, 28, progress) + offset)}px`);
  root.style.setProperty("--m-home-bottom", `${Math.round(lerp(168, 28, progress) + offset)}px`);
  root.style.setProperty("--m-zoom-in-bottom", `${Math.round(lerp(216, 28, progress) + offset)}px`);
  root.style.setProperty("--m-zoom-out-bottom", `${Math.round(168 + (28 - 168) * progress + offset)}px`);
  root.style.setProperty("--m-camera-opacity", `${(1 - progress).toFixed(3)}`);
  root.style.setProperty("--m-camera-y", `${Math.round(12 * progress)}px`);
  root.style.setProperty("--m-camera-scale", `${(1 - progress * 0.04).toFixed(3)}`);
}

function setMapHeight(heightPx: number, immediate = false): void {
  const mapEl = getMapEl();
  if (!mapEl) return;
  const total = window.innerHeight - 64;
  const mapH = Math.max(60, total - heightPx);
  const progress = isMobile() ? clamp(heightPx / Math.max(1, ITS_SNAP.peek()), 0, 1) : 0;
  document.documentElement.style.setProperty("--its-sheet-height", `${Math.max(0, heightPx)}px`);
  document.documentElement.style.setProperty("--m-map-inset", `${Math.round(8 * progress)}px`);
  document.documentElement.style.setProperty("--m-map-radius", `${Math.round(18 * progress)}px`);
  mapEl.style.height = `${mapH}px`;
  mapEl.style.transition = immediate ? "none" : "height 0.32s cubic-bezier(0.32,0.72,0,1)";
  mapEl.classList.toggle("its-open", heightPx > 0);
  setMobileToolbarSheetOffset(heightPx);
  map.invalidateSize();
}

function openITSSheet(): void {
  let sheet = document.getElementById("m-its-sheet");
  if (!sheet) {
    sheet = createITSSheet();
    document.getElementById("app")!.appendChild(sheet);
  }
  document.body.classList.add("its-sheet-open");
  renderITSSheetContent();
  snapITSSheet("peek");
}

function closeITSSheet(): void {
  snapITSSheet("closed");
  document.body.classList.remove("its-sheet-open");
  setMobileToolbarSheetOffset(0);
  setTimeout(() => {
    const mapEl = getMapEl();
    if (mapEl) {
      mapEl.style.height = "";
      map.invalidateSize();
    }
    document.getElementById("m-its-sheet")?.remove();
  }, 340);
}

function snapITSSheet(snap: "closed" | "peek" | "full"): void {
  const sheet = document.getElementById("m-its-sheet");
  if (!sheet) return;
  itsCurrentSnap = snap;

  const h = snap === "closed" ? 0 : snap === "peek" ? ITS_SNAP.peek() : ITS_SNAP.full();

  sheet.style.transition = "transform 0.34s cubic-bezier(0.32,0.72,0,1)";
  sheet.style.transform = `translateY(${window.innerHeight - h - 64}px)`;

  setMapHeight(h);
}

function createITSSheet(): HTMLElement {
  const sheet = document.createElement("div");
  sheet.id = "m-its-sheet";

  let touchStartY = 0;
  let touchStartTranslate = 0;

  sheet.addEventListener("touchstart", (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".m-its-handle-zone")) return;
    touchStartY = e.touches[0].clientY;
    const matrix = new DOMMatrix(getComputedStyle(sheet).transform);
    touchStartTranslate = matrix.m42;
    sheet.style.transition = "none";
    document.body.classList.add("its-sheet-dragging");
  }, { passive: true });

  sheet.addEventListener("touchmove", (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".m-its-handle-zone")) return;
    e.preventDefault();
    const delta = e.touches[0].clientY - touchStartY;
    const rawY = touchStartTranslate + delta;
    const minY = window.innerHeight - ITS_SNAP.full() - 64;
    const maxY = window.innerHeight - 64;
    const clampedY = Math.max(minY, Math.min(maxY, rawY));
    sheet.style.transform = `translateY(${clampedY}px)`;
    const sheetH = window.innerHeight - 64 - clampedY;
    setMapHeight(Math.max(0, sheetH), true);
  }, { passive: false });

  sheet.addEventListener("touchend", () => {
    document.body.classList.remove("its-sheet-dragging");
    const matrix = new DOMMatrix(getComputedStyle(sheet).transform);
    const currentY = matrix.m42;
    const sheetH = window.innerHeight - 64 - currentY;
    const peekH = ITS_SNAP.peek();
    const fullH = ITS_SNAP.full();

    let snap: "closed" | "peek" | "full";
    if (sheetH < peekH * 0.55) {
      closeITSSheet();
      setTimeout(() => {
        document.querySelectorAll(".m-nav-tab").forEach(b => b.classList.remove("active"));
        document.querySelector<HTMLButtonElement>('.m-nav-tab[data-tab="peta"]')?.classList.add("active");
        mobileState.activeTab = "peta";
      }, 340);
      return;
    } else if (sheetH < lerp(peekH, fullH, 0.55)) {
      snap = "peek";
    } else {
      snap = "full";
    }

    snapITSSheet(snap);
  });

  sheet.addEventListener("touchcancel", () => {
    document.body.classList.remove("its-sheet-dragging");
    snapITSSheet(itsCurrentSnap);
  });

  sheet.innerHTML = `
  <div class="m-its-handle-zone">
    <div class="m-its-handle-bar"></div>
  </div>
  <div class="m-its-scroll-content" id="m-its-scroll"></div>
`;

  sheet.style.transform = `translateY(${window.innerHeight - 64}px)`;
  return sheet;
}

function focusITSVideoSection(): void {
  if (!isMobile()) return;
  const target = document.getElementById("m-its-video");
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderITSSheetContent(): void {
  const scroll = document.getElementById("m-its-scroll");
  if (!scroll) return;

  const device = state.device;
  const traffic = device ? trafficStateForDevice(device) : null;
  const cameraSurface = renderCameraSurface(device, "m-camera-img", "m-camera-frame");
  const statsGrid = renderVehicleStatsGrid(device, traffic);

  const colorMap: Record<string, string> = {
    red: "#ef4444", yellow: "#facc15", green: "#22c55e",
  };
  const bulbColor = traffic ? colorMap[traffic.color] : "#9ca3af";

  scroll.innerHTML = `
  <div class="m-its-section" id="m-its-video">
    <div class="m-its-section-title">Video Realtime</div>
    <div class="m-its-camera-box">
      ${cameraSurface || `<div class="m-camera-placeholder">
             <svg viewBox="0 0 48 48" fill="none" width="36" height="36">
               <rect x="4" y="12" width="34" height="26" rx="4" stroke="#9ca3af" stroke-width="2"/>
               <path d="M38 20l6-4v16l-6-4V20z" stroke="#9ca3af" stroke-width="2" stroke-linejoin="round"/>
             </svg>
             <span>Belum ada kamera</span>
           </div>`}
      ${cameraSurface ? renderDetectionOverlay(device) : ""}
      <button class="m-camera-fullscreen" aria-label="Fullscreen">
        <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
          <path d="M1 6V1h5M10 1h5v5M15 10v5h-5M6 15H1v-5"
                stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>

  <div class="m-its-section">
    <div class="m-its-section-title">Data Kendaraan</div>
    ${statsGrid}
  </div>

  ${traffic ? `
  <div class="m-its-section">
    <div class="m-its-section-title">Status Lalu Lintas</div>
    <div class="m-its-traffic-row">
      <div class="m-traffic-light-col">
        ${makeTrafficLightSvg(traffic, 32)}
      </div>
      <div class="m-traffic-info-col">
        <div class="m-traffic-road">${escapeHtml(traffic.roadName)}</div>
        <div class="m-traffic-recom" style="color:${bulbColor}">${escapeHtml(traffic.recommendation)}</div>
        <div class="m-traffic-meta">
          <span>🚗 ${traffic.vehicleCount} kendaraan</span>
          <span>${escapeHtml(vehicleBreakdownText(device?.vehicleBreakdown))}</span>
          <span>⏱ ${traffic.duration}s</span>
        </div>
      </div>
    </div>
  </div>` : ""}

  <div class="m-its-section">
    <div class="m-its-section-title">Perangkat (${state.devices.length})</div>
    ${state.devices.map(d => {          // FIX 2: hapus parameter idx yang tidak dipakai
    const t = trafficStateForDevice(d);
    const c = colorMap[t.color];
    return `<div class="m-device-row" data-id="${d.id}">
        <span class="m-device-bulb" style="background:${c}"></span>
        <span class="m-device-name">${escapeHtml(d.label)}</span>
        <span class="m-device-status status-${d.status}">${d.status}</span>
      </div>`;
  }).join("")}
  </div>

  <div style="height:24px"></div>
`;

  syncCameraViews(device);
  attachWebRtcStream();
  requestAnimationFrame(() => drawTrafficChart());
  scroll.querySelector<HTMLButtonElement>(".m-camera-fullscreen")?.addEventListener("click", () => openVideoFullscreen(device));

  scroll.querySelectorAll<HTMLDivElement>(".m-device-row").forEach(row => {
    row.addEventListener("click", () => {
      const id = row.dataset.id;
      const d = state.devices.find(x => x.id === id);
      if (!d) return;
      snapITSSheet("peek");
      setTimeout(() => {
        map.setView([d.position.lat, d.position.lng], 17, { animate: true });
      }, 200);
    });
  });
}

function drawTrafficChart(): void {
  const canvas = document.getElementById("m-traffic-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const seed = hashString(`chart:${i}:${Math.floor(Date.now() / 8000)}`);
    points.push({ x: 5 + (seed % 95), y: 3 + ((seed * 7) % 40) });
  }
  state.devices.forEach(d => {
    const t = trafficStateForDevice(d);
    points.push({ x: t.vehicleCount, y: t.duration });
  });

  const padL = 42, padB = 30, padT = 14, padR = 16;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxX = 120, maxY = 45;

  const toScreen = (x: number, y: number) => ({
    sx: padL + (x / maxX) * chartW,
    sy: padT + chartH - (y / maxY) * chartH,
  });

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  for (let y = 0; y <= maxY; y += 5) {
    const { sy } = toScreen(0, y);
    ctx.beginPath(); ctx.moveTo(padL, sy); ctx.lineTo(W - padR, sy); ctx.stroke();
  }

  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  for (let y = 0; y <= maxY; y += 10) {
    const { sy } = toScreen(0, y);
    ctx.fillText(String(y), padL - 4, sy + 3);
  }

  ctx.textAlign = "center";
  [4, 20, 60, 100].forEach(x => {
    const { sx } = toScreen(x, 0);
    ctx.fillText(String(x), sx, H - 6);
  });

  ctx.save();
  ctx.translate(10, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = "#64748b";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Waktu Hijau", 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = "#64748b";
  ctx.font = "9px monospace";
  ctx.fillText("Jumlah Kendaraan", W / 2, H - 1);

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  const { sy: threshSy } = toScreen(0, 8);
  ctx.beginPath(); ctx.moveTo(padL, threshSy); ctx.lineTo(W - padR, threshSy); ctx.stroke();
  ctx.setLineDash([]);

  points.forEach(p => {
    const { sx, sy } = toScreen(p.x, p.y);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(sx - 2, sy - 5, 4, 10);
  });

  const colorMap: Record<string, string> = { red: "#ef4444", yellow: "#facc15", green: "#22c55e" };
  state.devices.forEach(d => {
    const t = trafficStateForDevice(d);
    const { sx, sy } = toScreen(t.vehicleCount, t.duration);
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = colorMap[t.color] || "#60a5fa";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

// ─── 5. Profil Sheet ─────────────────────────────────────────────────────────

function openProfilSheet(): void {
  if (document.getElementById("m-profil-sheet")) return;

  const sheet = document.createElement("div");
  sheet.id = "m-profil-sheet";

  const online = state.devices.filter(d => d.status === "online").length;
  const offline = state.devices.filter(d => d.status === "offline").length;

  sheet.innerHTML = `
  <div class="m-layer-backdrop"></div>
  <div class="m-profil-inner">
    <div class="m-sheet-handle-bar" style="margin:0 auto 16px"></div>
    <div class="m-profil-avatar">
      <svg viewBox="0 0 64 64" fill="none" width="56" height="56">
        <circle cx="32" cy="24" r="14" fill="#3b82f6" opacity="0.15"/>
        <circle cx="32" cy="24" r="10" stroke="#3b82f6" stroke-width="2"/>
        <path d="M8 56c0-11 10.745-20 24-20s24 8.955 24 20"
              stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <div class="m-profil-name">Operator ITS Maps</div>
    <div class="m-profil-role">Sistem Manajemen Lalu Lintas</div>
    <div class="m-profil-stats">
      <div class="m-stat">
        <span class="m-stat-val">${state.devices.length}</span>
        <span class="m-stat-lbl">Perangkat</span>
      </div>
      <div class="m-stat">
        <span class="m-stat-val" style="color:#22c55e">${online}</span>
        <span class="m-stat-lbl">Online</span>
      </div>
      <div class="m-stat">
        <span class="m-stat-val" style="color:#ef4444">${offline}</span>
        <span class="m-stat-lbl">Offline</span>
      </div>
    </div>
  </div>
`;

  const goBackToPeta = () => {
    sheet.remove();
    document.querySelectorAll(".m-nav-tab").forEach(b => b.classList.remove("active"));
    document.querySelector<HTMLButtonElement>('.m-nav-tab[data-tab="peta"]')?.classList.add("active");
    mobileState.activeTab = "peta";
  };

  sheet.querySelector(".m-layer-backdrop")!.addEventListener("click", goBackToPeta);
  setupSheetSwipe(sheet.querySelector<HTMLElement>(".m-profil-inner")!, goBackToPeta);

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("open"));
}

// ─── 6. Repositioning Leaflet Controls untuk Mobile ──────────────────────────

// FIX 3, 4, 5: hapus const zoomIn, zoomOut, compassBtn yang tidak dipakai
function repositionLeafletControls(): void {
  if (!isMobile()) return;
  const toolbar = document.querySelector<HTMLElement>(".map-toolbar");
  if (toolbar) {
    // Keep mobile toolbar as-is; individual controls are positioned by CSS
    // Do NOT add m-toolbar-repositioned which bundles controls into one column
  }
}

// ─── 7. Init ──────────────────────────────────────────────────────────────────

function initMobileUI(): void {
  if (!isMobile()) return;

  const appEl = document.getElementById("app");
  if (!appEl) return;

  appEl.appendChild(createMobileBottomNav());

  const mapEl = document.getElementById("map");
  if (mapEl) {
    // Do not force calc-based height; allow JS `setMapHeight` to control height
    // to ensure the map fills the viewport on initial load
    mapEl.classList.add("m-map");
    mapEl.appendChild(createLayerButton());
  }

  repositionLeafletControls();

  // FIX 6: hapus const _orig yang tidak dipakai
  setInterval(() => {
    if (mobileState.activeTab === "its" && document.getElementById("m-its-scroll")) {
      renderITSSheetContent();
    }
  }, 4000);

  window.addEventListener("resize", () => {
    if (itsCurrentSnap !== "closed") snapITSSheet(itsCurrentSnap);
  });

  map.invalidateSize();
}
initMobileUI();
void refreshSnapshot();
// Also fetch nearby POIs immediately so tablet filters have data even if devices are empty
void refreshOverpassLayer();
void refreshRoadGuideLayer(true);
void refreshVisionLayer(true);
}

// ─── PWA: Service Worker registration and install prompt handler ─────
async function requestPublicNotificationPermission(): Promise<void> {
  if (!("Notification" in window)) return;
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return;
  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  await registration?.showNotification("Notifikasi ITS Maps aktif", {
    body: "Update aplikasi dan status publik akan muncul di sini.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-96.png",
    tag: "its-public-notification-ready",
    data: { url: "/new" },
  });
}

async function notifyLatestPublicUpdate(registration: ServiceWorkerRegistration): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const response = await fetch("/app-update.json", { cache: "no-store" });
    if (!response.ok) return;
    const update = await response.json() as { versionName?: string; version?: string; releaseNotes?: string[]; updatedAt?: string };
    const version = update.versionName || update.version || "";
    const key = `${version}:${update.updatedAt || ""}`;
    if (!version || localStorage.getItem("its-public-update-notified:v1") === key) return;
    localStorage.setItem("its-public-update-notified:v1", key);
    await registration.showNotification(`ITS Maps ${version}`, {
      body: update.releaseNotes?.[0] || "Catatan pembaruan terbaru tersedia.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      tag: "its-public-app-update",
      data: { url: "/new" },
    });
  } catch {
    // Notification polling is best-effort; push events cover true background delivery.
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registered');
      void notifyLatestPublicUpdate(registration);
    } catch (err) {
      console.warn('[PWA] Service Worker registration failed', err);
    }
  });
}

// PWA install UI is intentionally left to the browser, so Chrome/Edge can show
// their native install and notification affordances without an extra app button.

function promptUsesDesktopSidePanel(): boolean {
  return window.matchMedia("(min-width: 721px)").matches;
}

function setPromptSidePanelWidth(widthPx: number): void {
  const width = promptUsesDesktopSidePanel() ? Math.max(0, Math.round(widthPx)) : 0;
  document.documentElement.style.setProperty("--side-panel-active-width", `${width}px`);
  document.body.classList.toggle("side-panel-open", width > 0);
  window.dispatchEvent(new Event("resize"));
}

function setPromptSidePanelWidthFromSheet(sheetEl: HTMLElement | null): void {
  if (!sheetEl || !promptUsesDesktopSidePanel()) return;
  setPromptSidePanelWidth(sheetEl.getBoundingClientRect().width);
}

function clearPromptSidePanelWidth(delayMs = 260): void {
  setPromptSidePanelWidth(0);
  window.setTimeout(() => {
    if (!document.querySelector("#windows-download-modal.open, #map-license-modal.open, #m-device-modal.open, #m-poi-modal.open")) {
      document.body.classList.remove("side-panel-open", "app-download-panel-open", "map-license-panel-open", "map-modal-panel-open");
      document.documentElement.style.removeProperty("--side-panel-active-width");
    }
  }, delayMs);
}

function promptSheetSwipeHandleTarget(target: HTMLElement | null): boolean {
  return Boolean(target?.closest(
    "[data-swipe-handle], .windows-download-head, .windows-download-detail-head, .map-license-head",
  ));
}

function promptNearestScrollableTarget(target: HTMLElement | null, sheetEl: HTMLElement): HTMLElement {
  let node: HTMLElement | null = target;
  while (node && node !== sheetEl) {
    const style = window.getComputedStyle(node);
    const canScroll = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2;
    if (canScroll) return node;
    node = node.parentElement;
  }
  return sheetEl;
}

function promptCanStartDismiss(target: HTMLElement | null, sheetEl: HTMLElement, horizontal: boolean): boolean {
  if (horizontal) return true;
  return promptNearestScrollableTarget(target, sheetEl).scrollTop <= 1;
}

function installPromptWheelDismiss(sheetEl: HTMLElement, onClose: () => void): void {
  let offset = 0;
  let resetTimer = 0;
  sheetEl.addEventListener("wheel", (event) => {
    if (promptUsesDesktopSidePanel()) return;
    const scrollTarget = promptNearestScrollableTarget(event.target as HTMLElement | null, sheetEl);
    const atTop = scrollTarget.scrollTop <= 1;
    const atBottom = scrollTarget.scrollTop + scrollTarget.clientHeight >= scrollTarget.scrollHeight - 2;
    const pull = atTop && event.deltaY < -8 ? Math.abs(event.deltaY) : atBottom && event.deltaY > 10 ? event.deltaY * 0.55 : 0;
    if (!pull) return;
    event.preventDefault();
    offset = Math.min(190, Math.max(0, offset + pull));
    sheetEl.style.transition = "none";
    sheetEl.style.transform = `translateY(${offset}px)`;
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      sheetEl.style.transition = "";
      if (offset > 74) onClose();
      else sheetEl.style.transform = "";
      offset = 0;
    }, 110);
  }, { passive: false });
}

function closeFloatingMapPanels(): void {
  document.querySelectorAll("#windows-download-modal, #map-license-modal, #m-device-modal, #m-poi-modal").forEach((modal) => modal.remove());
  document.body.classList.remove("app-download-panel-open", "map-license-panel-open", "map-modal-panel-open");
  clearPromptSidePanelWidth(0);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-map-license]")) {
    event.preventDefault();
    event.stopPropagation();
    itsShowMapLicenseModal();
  }
});

function itsShowMapLicenseModal(): void {
  if (document.getElementById("map-license-modal")) return;
  closeFloatingMapPanels();
  const modal = document.createElement("div");
  modal.id = "map-license-modal";
  modal.className = "map-license-modal";
  modal.innerHTML = `
    <section class="map-license-sheet" role="dialog" aria-modal="true" aria-labelledby="map-license-title">
      <div class="map-license-grip" data-swipe-handle aria-hidden="true"></div>
      <header class="map-license-head">
        <div>
          <span>ITS Maps</span>
          <h2 id="map-license-title">Lisensi Peta</h2>
        </div>
        <button type="button" aria-label="Tutup Lisensi Peta" title="Tutup" data-license-close>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </header>
      <div class="map-license-list">
        ${mapServiceStackHtml()}
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  let closeLicenseModal: () => void = () => undefined;
  const keyHandler = (keyEvent: KeyboardEvent) => {
    if (keyEvent.key === "Escape") closeLicenseModal();
  };
  closeLicenseModal = () => {
    window.removeEventListener("keydown", keyHandler);
    modal.classList.remove("open");
    document.body.classList.remove("map-license-panel-open");
    clearPromptSidePanelWidth();
    window.setTimeout(() => modal.remove(), 220);
  };
  modal.addEventListener("click", (clickEvent) => {
    if (clickEvent.target === modal) closeLicenseModal();
  });
  modal.querySelector<HTMLButtonElement>("[data-license-close]")?.addEventListener("click", closeLicenseModal);
  const sheet = modal.querySelector<HTMLElement>(".map-license-sheet");
  if (sheet) setupPromptSheetSwipe(sheet, closeLicenseModal);
  window.addEventListener("keydown", keyHandler);
  window.setTimeout(() => {
    modal.classList.add("open");
    document.body.classList.add("map-license-panel-open");
    setPromptSidePanelWidthFromSheet(sheet);
  }, 20);
}

const ITS_WINDOWS_INSTALL_URL = "https://itstelkom.web.app/artifacts/apps/ITS-Maps-Windows-Custom-Setup-1.0.14-x64.download";
const ITS_WINDOWS_INSTALL_NAME = "ITS-Maps-Windows-Custom-Setup-1.0.14-x64.exe";
const ITS_ANDROID_INSTALL_URL = "https://itstelkom.web.app/artifacts/apps/ITS.apk";
const ITS_ANDROID_INSTALL_NAME = "ITS.apk";
const ITS_IOS_INSTALL_URL = "https://itstelkom.web.app/?install=ios";
const ITS_APP_VERSION = "1.0.14";
const ITS_FALLBACK_PREVIEWS = [WIN_PREVIEW_WELCOME, WIN_PREVIEW_OPTIONS, WIN_PREVIEW_DONE];
const ITS_APP_ACCESS_ITEMS = [
  ["Lokasi", "Dipakai untuk marker user realtime, jarak ke POI, tombol lokasi terkini, dan sinkronisasi posisi antar perangkat."],
  ["Kamera", "Dipakai untuk halaman kamera realtime, AR camera sheet, dan preview lalu lintas dari Raspberry Pi."],
  ["Notifikasi", "Dipakai untuk update publik, catatan pembaruan, status Raspberry, dan informasi penting tanpa membuka website."],
  ["Jaringan", "Dipakai untuk mengambil tile peta, data Firebase, Overpass POI, HLS/WebRTC, dan artifact update aplikasi."],
  ["Penyimpanan", "Dipakai oleh installer Windows atau browser untuk menyimpan aplikasi, cache peta, dan file update."],
];

type AppDownloadPlatform = "windows" | "android" | "ios";
type AppDownloadInfo = {
  platform: AppDownloadPlatform;
  platformName: string;
  extension: ".exe" | ".apk" | ".app";
  fileName: string;
  url: string;
  previewFolder: "windows" | "mobile";
  shortDescription: string;
  longDescription: string;
};

function appScreenshotUrls(folder: "windows" | "mobile"): string[] {
  const prefix = `./ss/${folder}/`;
  return Object.entries(APP_SCREENSHOT_MODULES)
    .filter(([path]) => path.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url);
}

function detectAppDownloadPlatform(): AppDownloadPlatform {
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  if (/iPad|iPhone|iPod/i.test(ua) || (/Mac/i.test(platform) && navigator.maxTouchPoints > 1)) return "ios";
  if (/android/i.test(ua) || window.innerWidth <= 720 || navigator.maxTouchPoints > 1) return "android";
  return "windows";
}

function getAppDownloadInfo(): AppDownloadInfo {
  const platform = detectAppDownloadPlatform();
  if (platform === "android") {
    return {
      platform,
      platformName: "Android",
      extension: ".apk",
      fileName: ITS_ANDROID_INSTALL_NAME,
      url: ITS_ANDROID_INSTALL_URL,
      previewFolder: "mobile",
      shortDescription: "Aplikasi Android ITS Maps untuk peta realtime, kamera, notifikasi, dan kontrol Raspberry Pi.",
      longDescription: "ITS Maps Android membawa peta realtime berbasis data OSM, lokasi user, kamera Raspberry Pi, notifikasi publik, dan ringkasan data lalu lintas ke layar sentuh. Build APK dipakai untuk instalasi manual di perangkat Android.",
    };
  }
  if (platform === "ios") {
    return {
      platform,
      platformName: "iOS",
      extension: ".app",
      fileName: "ITS-Maps-iOS.app",
      url: ITS_IOS_INSTALL_URL,
      previewFolder: "mobile",
      shortDescription: "Mode iOS ITS Maps memakai pengalaman app-like dengan Safari/PWA dan tampilan mobile.",
      longDescription: "ITS Maps di iOS berjalan sebagai pengalaman web app yang dapat dipasang dari Safari. Fitur peta, notifikasi yang didukung browser, preview kamera, dan dokumentasi tetap mengikuti tampilan mobile yang sama.",
    };
  }
  return {
    platform,
    platformName: "Windows",
    extension: ".exe",
    fileName: ITS_WINDOWS_INSTALL_NAME,
    url: ITS_WINDOWS_INSTALL_URL,
    previewFolder: "windows",
    shortDescription: "Installer Windows ITS Maps dengan peta Carto, data OSM, kamera realtime, notifikasi desktop, dan pembaruan aplikasi.",
    longDescription: "ITS Maps Windows adalah aplikasi desktop Electron untuk memantau Raspberry Pi, peta realtime, kamera, grafik lalu lintas, history, update otomatis, dokumentasi, dan panel What's New. Installer custom menyiapkan aplikasi native dan artifact .download dipakai untuk pembaruan.",
  };
}

function appPreviewImages(info: AppDownloadInfo): string[] {
  const screenshots = appScreenshotUrls(info.previewFolder);
  return screenshots.length ? screenshots : ITS_FALLBACK_PREVIEWS;
}

function itsCreateSplash(): void {
  if (document.getElementById("its-splash")) return;
  const startedAt = performance.now();
  const splash = document.createElement("div");
  splash.id = "its-splash";
  splash.innerHTML = `
    <div class="its-splash-card">
      <img src="/its.png" alt="ITS Maps">
      <strong>ITS Maps</strong>
      <span>Menyiapkan peta OSM...</span>
      <i aria-hidden="true"></i>
    </div>
  `;
  document.body.appendChild(splash);

  let done = false;
  let mapReady = itsMapReady;
  let dataReady = itsInitialDataReady;
  const hide = () => {
    if (done) return;
    done = true;
    const wait = Math.max(0, 520 - (performance.now() - startedAt));
    window.setTimeout(() => splash.classList.add("hide"), wait);
    window.setTimeout(() => splash.remove(), wait + 320);
  };
  const hideWhenReady = () => {
    if (mapReady && dataReady) hide();
  };

  window.addEventListener("its:map-ready", () => {
    mapReady = true;
    hideWhenReady();
  }, { once: true });
  window.addEventListener("its:initial-data-ready", () => {
    dataReady = true;
    hideWhenReady();
  }, { once: true });
  hideWhenReady();
  window.setTimeout(hide, 3200);
}

function itsDownloadApp(info: AppDownloadInfo): void {
  const link = document.createElement("a");
  link.href = info.url;
  link.download = info.fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function itsCreateWindowsDownloadButton(): void {
  if (document.getElementById("windows-download-app")) return;
  const info = getAppDownloadInfo();
  const previews = appPreviewImages(info);
  const host = document.createElement("div");
  host.id = "windows-download-app";
  host.className = "windows-download-app";
  host.innerHTML = `
    <button type="button" class="windows-download-trigger" aria-label="Download ITS Maps ${info.platformName}" title="Download ITS Maps ${info.platformName}" data-tooltip="Download ITS Maps ${info.platformName}">
      <img src="${ITS_APP_ICON}" alt="">
      <span class="windows-download-badge" aria-hidden="true"></span>
    </button>
    <div class="windows-download-hover-card" aria-hidden="true">
      <div class="windows-download-hover-head">
        <img src="${ITS_APP_ICON}" alt="">
        <div>
          <strong>ITS Maps ${info.platformName}</strong>
          <span>Versi ${ITS_APP_VERSION}</span>
        </div>
      </div>
      <img class="windows-download-hover-preview" src="${previews[0] || "/screenshots/desktop-map.png"}" alt="">
    </div>
  `;
  host.querySelector<HTMLButtonElement>(".windows-download-trigger")?.addEventListener("click", itsShowWindowsDownloadModal);
  document.body.appendChild(host);
}

function itsShowWindowsDownloadModal(): void {
  if (document.getElementById("windows-download-modal")) return;
  closeFloatingMapPanels();
  const licenseModal = document.getElementById("map-license-modal");
  if (licenseModal) licenseModal.remove();
  document.body.classList.remove("map-license-panel-open");
  const info = getAppDownloadInfo();
  const previews = appPreviewImages(info);
  const modal = document.createElement("div");
  modal.id = "windows-download-modal";
  modal.className = "windows-download-modal";
  modal.innerHTML = `
    <section class="windows-download-sheet" role="dialog" aria-modal="true" aria-labelledby="windows-download-title">
      <div class="windows-download-grip" data-swipe-handle aria-hidden="true"></div>
      <div class="windows-download-view windows-download-summary active" data-download-view="summary">
        <div class="windows-download-head">
          <img class="windows-download-icon" src="${ITS_APP_ICON}" alt="">
          <div>
            <h2 id="windows-download-title">ITS Maps ${info.platformName}</h2>
            <p>Versi ${ITS_APP_VERSION}</p>
          </div>
          <button type="button" class="windows-download-close" aria-label="Tutup" title="Tutup" data-windows-close>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <div class="windows-download-modal-actions">
          <button type="button" class="windows-download-primary" data-windows-download>Download ${info.extension}</button>
        </div>
        <div class="windows-download-section-title">Gambar Preview</div>
        <div class="windows-download-modal-carousel" aria-label="Preview aplikasi ${info.platformName}">
          ${previews.map((src, index) => `<img src="${src}" alt="Preview ITS Maps ${info.platformName} ${index + 1}" class="${index === 0 ? "active" : ""}">`).join("")}
          <div class="windows-download-dots">
            ${previews.map((_, index) => `<button type="button" aria-label="Preview ${index + 1}" class="${index === 0 ? "active" : ""}"></button>`).join("")}
          </div>
        </div>
        <div class="windows-download-section-title">Deskripsi</div>
        <p class="windows-download-description">${info.shortDescription}</p>
        <button type="button" class="windows-download-detail-row" data-download-detail>
          <span>Lihat detail aplikasi</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>
      <div class="windows-download-view windows-download-detail" data-download-view="detail">
        <div class="windows-download-detail-head">
          <button type="button" class="windows-download-back" data-download-back aria-label="Kembali" title="Kembali">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <img class="windows-download-icon" src="${ITS_APP_ICON}" alt="">
          <div>
            <h2>ITS Maps ${info.platformName}</h2>
            <p>Versi ${ITS_APP_VERSION}</p>
          </div>
          <button type="button" class="windows-download-close" aria-label="Tutup" title="Tutup" data-windows-close>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>
        <p class="windows-download-description long">${info.longDescription}</p>
        <div class="windows-download-section-title">Akses aplikasi</div>
        <div class="windows-access-list">
          ${ITS_APP_ACCESS_ITEMS.map(([title, description]) => `
            <article>
              <strong>${title}</strong>
              <span>${description}</span>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("app-download-panel-open");

  let carouselIndex = 0;
  let carouselTimer = 0;
  let closeDownloadModal: () => void = () => undefined;
  const keyHandler = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeDownloadModal();
  };
  closeDownloadModal = () => {
    window.clearInterval(carouselTimer);
    window.removeEventListener("keydown", keyHandler);
    modal.classList.remove("open");
    document.body.classList.remove("app-download-panel-open");
    clearPromptSidePanelWidth();
    window.setTimeout(() => modal.remove(), 220);
  };
  const setCarouselIndex = (nextIndex: number) => {
    const images = modal.querySelectorAll<HTMLImageElement>(".windows-download-modal-carousel img");
    const dots = modal.querySelectorAll<HTMLButtonElement>(".windows-download-dots button");
    if (!images.length) return;
    images[carouselIndex]?.classList.remove("active");
    dots[carouselIndex]?.classList.remove("active");
    carouselIndex = nextIndex % images.length;
    images[carouselIndex]?.classList.add("active");
    dots[carouselIndex]?.classList.add("active");
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeDownloadModal();
  });
  modal.querySelectorAll<HTMLButtonElement>("[data-windows-close]").forEach((button) => {
    button.addEventListener("click", closeDownloadModal);
  });
  modal.querySelector<HTMLButtonElement>("[data-windows-download]")?.addEventListener("click", () => itsDownloadApp(info));
  modal.querySelector<HTMLButtonElement>("[data-download-detail]")?.addEventListener("click", () => {
    modal.classList.add("detail-open");
  });
  modal.querySelector<HTMLButtonElement>("[data-download-back]")?.addEventListener("click", () => {
    modal.classList.remove("detail-open");
  });
  modal.querySelectorAll<HTMLButtonElement>(".windows-download-dots button").forEach((dot, index) => {
    dot.addEventListener("click", () => setCarouselIndex(index));
  });
  const sheet = modal.querySelector<HTMLElement>(".windows-download-sheet");
  if (sheet) setupPromptSheetSwipe(sheet, closeDownloadModal);
  window.addEventListener("keydown", keyHandler);
  window.setTimeout(() => {
    modal.classList.add("open");
    setPromptSidePanelWidthFromSheet(sheet);
  }, 20);
  carouselTimer = window.setInterval(() => setCarouselIndex(carouselIndex + 1), 2600);
}

function setupPromptSheetSwipe(sheetEl: HTMLElement, onClose: () => void): void {
  let startAxis = 0;
  let currentAxis = 0;
  let dragging = false;
  let pointerId = -1;
  let startedAt = 0;

  sheetEl.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    const startsOnHandle = promptSheetSwipeHandleTarget(target);
    if (!startsOnHandle && target.closest("button, a, input, label, select, textarea")) return;
    const horizontal = window.matchMedia("(min-width: 721px)").matches;
    if (!startsOnHandle && !promptCanStartDismiss(target, sheetEl, horizontal)) return;
    startAxis = horizontal ? event.clientX : event.clientY;
    currentAxis = 0;
    dragging = true;
    pointerId = event.pointerId;
    startedAt = performance.now();
    sheetEl.dataset.swipeAxis = horizontal ? "x" : "y";
    sheetEl.style.transition = "none";
    sheetEl.setPointerCapture?.(event.pointerId);
  });

  sheetEl.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    const horizontal = sheetEl.dataset.swipeAxis === "x";
    const axis = horizontal ? event.clientX : event.clientY;
    currentAxis = Math.max(0, axis - startAxis);
    if (currentAxis > 2) event.preventDefault();
    sheetEl.style.transform = horizontal ? `translateX(${currentAxis}px)` : `translateY(${currentAxis}px)`;
    if (horizontal) {
      const remaining = Math.max(0, sheetEl.getBoundingClientRect().width - currentAxis);
      setPromptSidePanelWidth(remaining);
    }
  });

  const finish = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== pointerId) return;
    dragging = false;
    pointerId = -1;
    sheetEl.style.transition = "";
    const elapsed = Math.max(1, performance.now() - startedAt);
    const velocity = currentAxis / elapsed;
    if (currentAxis > 56 || velocity > 0.55) onClose();
    else {
      sheetEl.style.transform = "";
      if (sheetEl.dataset.swipeAxis === "x") setPromptSidePanelWidthFromSheet(sheetEl);
    }
  };

  sheetEl.addEventListener("pointerup", finish);
  sheetEl.addEventListener("pointercancel", finish);
  installPromptWheelDismiss(sheetEl, onClose);
}

if (!staticRoute) {
  itsCreateSplash();
  itsCreateWindowsDownloadButton();
}
