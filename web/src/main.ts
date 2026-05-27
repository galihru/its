import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

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

type DeviceRecord = {
  id: string;
  label: string;
  status: DeviceStatus;
  lastSeen: number;
  lastSeenText?: string;
  note?: string;
  cameraUrl?: string;
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

// ─── Constants ──────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<AppConfig> = {
  snapshotUrl: "./data/its-state.json",
  refreshMs: 5000,
};

// DEFAULT_CENTER — fallback jika tidak ada device. Akan di-override saat snapshot dimuat.
// User harus set ITS_LATITUDE & ITS_LONGITUDE di env var controller untuk lokasi yang tepat.
const DEFAULT_CENTER: L.LatLngExpression = [0, 0]; // Neutral; peta akan auto-pan ke marker pertama
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
const MAPLIBRE_3D_PITCH = 52;

// ─── DOM bootstrap ──────────────────────────────────────────────

function requiredElement<T extends Element>(selector: string, name: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing required element: ${name}`);
  return el;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element.");
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

// ─── State ──────────────────────────────────────────────────────

const state = {
  config: DEFAULT_CONFIG,
  device: null as DeviceRecord | null,
  devices: [] as DeviceRecord[],
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
  userWatchId: null as number | null,
  lastUserPoiSyncAt: 0,
  tabletCategoryIndex: null as number | null,
  tabletSearchQuery: "",
  routeLayer: null as L.LayerGroup | null,
  destinationMarker: null as L.Marker | null,
  activeModalDeviceId: null as string | null,
  activeModalPoiId: null as string | null,
  trafficRefreshTimer: 0,
  offlineReported: new Set<string>(),
  overpassLayer: null as L.LayerGroup | null,
  modeControl: null as L.Control | null,
  routeRequestSeq: 0,
  prevPositionById: new Map<string, L.LatLng>(),
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

const streetLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const satelliteLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 20, attribution: "" },
);

if (map.attributionControl) {
  try { map.attributionControl.setPrefix("ITS Maps"); } catch { /* ignore */ }
}

// Add Overpass vector layer for clickable features (kept separate from POI markers)
state.overpassLayer = L.layerGroup().addTo(map);

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
  hospital: { icon: "🏥", color: "#ef4444" },
  mall: { icon: "🏬", color: "#8b5cf6" },
  campus: { icon: "🎓", color: "#0ea5e9" },
  parking: { icon: "🅿️", color: "#64748b" },
  park: { icon: "🌳", color: "#22c55e" },
  worship: { icon: "🕌", color: "#f59e0b" },
  school: { icon: "🏫", color: "#2563eb" },
  office: { icon: "🏢", color: "#14b8a6" },
  restaurant: { icon: "🍽️", color: "#fb7185" },
  terminal: { icon: "🚌", color: "#0f766e" },
  station: { icon: "🚉", color: "#1d4ed8" },
  shelter: { icon: "🚏", color: "#0ea5e9" },
  cemetery: { icon: "⚰️", color: "#64748b" },
  transport: { icon: "🚍", color: "#0284c7" },
  monument: { icon: "🗿", color: "#a16207" },
  other: { icon: "📍", color: "#475569" },
};

function classifyPoiKind(tags: Record<string, string>): PoiKind {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  if (amenity === "hospital") return "hospital";
  if (amenity === "place_of_worship" || tags.religion) return "worship";
  if (amenity === "school" || amenity === "kindergarten" || tags.education === "school") return "school";
  if (amenity === "university" || amenity === "college" || tourism === "university") return "campus";
  if (amenity === "restaurant" || amenity === "cafe" || amenity === "fast_food") return "restaurant";
  if (amenity === "parking" || tags.parking) return "parking";
  if (amenity === "bus_station" || amenity === "ferry_terminal" || amenity === "terminal" || tags.public_transport === "station") return "station";
  if (amenity === "bus_stop" || tags.highway === "bus_stop") return "shelter";
  if (amenity === "grave_yard" || tags.landuse === "cemetery") return "cemetery";
  if (amenity === "public_transport" || tags.public_transport) return "transport";
  if (amenity === "office" || tags.office) return "office";
  if (tags.shop) return "mall";
  if (tags.historic === "monument" || tourism === "attraction" || tags.building === "monument") return "monument";
  if (tags.leisure === "park") return "park";
  return "other";
}

function poiVisual(kind: PoiKind): { icon: string; color: string } {
  return POI_VISUALS[kind] || POI_VISUALS.other;
}

function poiMarkerSizeByZoom(): number {
  const zoom = map.getZoom();
  return clamp(12 + (zoom - 13) * 1.15, 12, 24);
}

function makePoiIcon(poi: PoiRecord, size: number): L.DivIcon {
  const visual = poiVisual(poi.kind);
  return L.divIcon({
    className: "poi-marker-icon",
    html: `<div class="poi-marker poi-kind-${poi.kind}" title="${escapeHtml(poi.title)}" style="--poi-accent:${visual.color}; --poi-size:${size}px;">
      <span class="poi-marker-glyph">${visual.icon}</span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
  });
}

function renderPoiModal(poi: PoiRecord): string {
  return `
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
        <img class="poi-hero-image" src="${escapeHtml(poi.imageUrl)}" alt="${escapeHtml(poi.title)}">
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
  closeModal();
  state.activeModalPoiId = poi.id;
  const overlay = createSwipeableSheetModal(
    "m-poi-modal",
    "m-poi-sheet m-device-sheet",
    `
      <div class="m-sheet-handle-bar"></div>
      ${renderPoiModal(poi)}
    `,
  );
  overlay.querySelector(".m-layer-backdrop")!.addEventListener("click", closeModal);
  const sheet = overlay.querySelector<HTMLElement>(".m-poi-sheet");
  if (!sheet) return;
  setupSheetSwipe(sheet, closeModal);
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", closeModal);

  // Wire up share and start buttons and populate distance/ETA + image
  const shareBtn = sheet.querySelector<HTMLButtonElement>(".btn-share");
  const startBtn = sheet.querySelector<HTMLButtonElement>(".btn-start");
  shareBtn?.addEventListener("click", async () => {
    const url = `https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lng}#map=${DEFAULT_ZOOM}/${poi.lat}/${poi.lng}`;
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

  // populate image from Unsplash (fallback) and compute distance/ETA via OSRM
  const heroImg = sheet.querySelector<HTMLImageElement>(".poi-hero-image");
  if (heroImg) {
    heroImg.src = `https://source.unsplash.com/featured/?${encodeURIComponent(poi.title)}`;
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
      <div class="ar-route-corridor" data-field="ar-route-corridor" aria-hidden="true">
        <div class="ar-route-glow"></div>
        <div class="ar-route-lane">
          <span></span><span></span><span></span>
        </div>
      </div>
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
      <div class="ar-poi-rail" data-field="ar-poi-rail"></div>
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
  const routeCorridor = overlay.querySelector<HTMLElement>('[data-field="ar-route-corridor"]');
  const poiLayer = overlay.querySelector<HTMLElement>('.ar-poi-layer');
  const objectLayer = overlay.querySelector<HTMLElement>('.ar-object-layer');
  const poiRail = overlay.querySelector<HTMLElement>('[data-field="ar-poi-rail"]');
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
  if (!video || !canvas || !routeCorridor || !poiLayer || !objectLayer || !poiRail || !statusEl || !distanceEl || !etaEl || !guidanceArrow || !guidanceText || !targetBeacon || !toggleBtn || !closeBtn || !pipContainer || !pipMapEl || !pipDistanceEl) return;

  const videoEl = video as HTMLVideoElement;
  const canvasEl = canvas as HTMLCanvasElement;
  const routeCorridorEl = routeCorridor as HTMLElement;
  const poiLayerEl = poiLayer as HTMLElement;
  const objectLayerEl = objectLayer as HTMLElement;
  const poiRailEl = poiRail as HTMLElement;
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
  let headingDeg = normBearing(map.getBearing?.() ?? 0);
  let hasLiveHeading = false;
  let lastHeadingAt = 0;
  let currentPos: L.LatLng | null = state.vehicleMarker?.getLatLng() ?? map.getCenter();
  let currentTarget = targetPoi;
  let activePoiLookup = new Map<string, PoiRecord>();
  let nearbyPois: PoiRecord[] = [];
  let destinationReached = false;
  let poiCards = new Map<string, HTMLElement>();
  let objectCards = new Map<string, HTMLElement>();
  let nearbyFetchToken = 0;
  let nearbyFetchBusy = false;
  let lastNearbyFetchAt = 0;
  let lastNearbyFetchPos: L.LatLng | null = null;
  let detectBusy = false;
  let ar3dEnabled = true;
  let arIsPrimary = true;
  let pipMapInstance: L.Map | null = null;
  let pipUserMarker: L.CircleMarker | null = null;
  let pipTargetMarker: L.CircleMarker | null = null;
  let pipRouteLine: L.Polyline | null = null;
  let cleanedUp = false;
  let routeRefreshAt = 0;
  let routeRefreshPos: L.LatLng | null = null;

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

  function setLiveHeading(rawHeading: number, live = true): void {
    if (!Number.isFinite(rawHeading)) return;
    const next = normBearing(rawHeading);
    const diff = bearingDelta(headingDeg, next);
    headingDeg = normBearing(headingDeg + diff * 0.35);
    if (live) {
      hasLiveHeading = true;
      lastHeadingAt = Date.now();
    }
  }

  function updateRouteCorridor(delta: number, dist: number): void {
    const turnOffset = clamp(delta / 48, -1, 1) * 34;
    const rotate = clamp(delta, -42, 42) * 0.45;
    const scale = clamp(1.1 - dist / 2400, 0.86, 1.12);
    routeCorridorEl.style.transform = `translateX(calc(-50% + ${turnOffset}px)) rotate(${rotate}deg) scale(${scale})`;
    routeCorridorEl.style.opacity = dist < 10 ? '0.25' : '1';
    routeCorridorEl.classList.toggle('is-turning-left', delta < -14);
    routeCorridorEl.classList.toggle('is-turning-right', delta > 14);
  }

  function ensurePipMap(): void {
    if (!currentPos) return;
    if (!pipMapInstance) {
      pipMapInstance = L.map(pipMapElDiv, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      }).setView([currentPos.lat, currentPos.lng], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
      }).addTo(pipMapInstance);
      pipRouteLine = L.polyline([], { color: '#2563eb', weight: 4, opacity: 0.9 }).addTo(pipMapInstance);
      pipUserMarker = L.circleMarker([currentPos.lat, currentPos.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }).addTo(pipMapInstance);
      pipTargetMarker = L.circleMarker([currentTarget.lat, currentTarget.lng], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ef4444',
        fillOpacity: 1,
      }).addTo(pipMapInstance);
    }
  }

  function updatePipMap(): void {
    if (!currentPos) return;
    ensurePipMap();
    if (!pipMapInstance) return;
    const target = L.latLng(currentTarget.lat, currentTarget.lng);
    pipUserMarker?.setLatLng(currentPos);
    pipTargetMarker?.setLatLng(target);
    pipRouteLine?.setLatLngs([currentPos, target]);
    const bounds = L.latLngBounds([currentPos, target]);
    pipMapInstance.fitBounds(bounds.pad(0.35), { animate: false, padding: [16, 16] });
    pipMapInstance.invalidateSize(false);
    setTimeout(() => pipMapInstance?.invalidateSize(false), 60);
  }

  function refreshRouteIfNeeded(force = false): void {
    if (!currentPos || arIsPrimary) return;
    const now = Date.now();
    const moved = routeRefreshPos
      ? haversineDistanceMeters(routeRefreshPos.lat, routeRefreshPos.lng, currentPos.lat, currentPos.lng)
      : Infinity;
    if (!force && now - routeRefreshAt < 15_000 && moved < 25) return;
    routeRefreshAt = now;
    routeRefreshPos = currentPos;
    setDestinationToPoi(currentTarget);
  }

  function updateCurrentPosition(latlng: L.LatLng, coords?: GeolocationCoordinates): void {
    const previous = currentPos;
    currentPos = latlng;
    if (coords && Number.isFinite(coords.heading ?? NaN) && (coords.speed ?? 0) > 0.4) {
      setLiveHeading(coords.heading as number, true);
    }
    if (state.vehicleMarker) {
      state.vehicleMarker.setLatLng(latlng);
    } else {
      showVehicleMarker([latlng.lat, latlng.lng]);
    }
    if (!arIsPrimary) {
      map.setView([latlng.lat, latlng.lng], Math.max(map.getZoom(), 17), { animate: true });
      if (hasLiveHeading) map.setBearing(headingDeg);
    }
    const moved = previous
      ? haversineDistanceMeters(previous.lat, previous.lng, latlng.lat, latlng.lng)
      : Infinity;
    updatePipMap();
    updateTargetStats();
    if (moved > 12) {
      renderNearbyPoiCards(nearbyPois);
      refreshRouteIfNeeded(false);
    }
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
    pipDistanceElDiv.textContent = `${formatDistance(dist)}`;
    updateRouteCorridor(deltaToTarget, dist);
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
    const inRange = dist <= 1300;
    const inView = Math.abs(delta) <= halfFov;
    if (!inRange) {
      card.remove();
      poiCards.delete(poi.id);
      return false;
    }
    const edgeSide = delta > 0 ? 91 : 9;
    const screenX = inView ? Math.max(8, Math.min(92, 50 + (delta / halfFov) * 40)) : edgeSide;
    const lift = inView ? clamp(68 - Math.log10(Math.max(dist, 5)) * 18, 8, 62) : clamp(44 + Math.abs(delta) / 6, 36, 70);
    const size = inView ? clamp(1.02 - dist / 2100, 0.86, 1.02) : 0.84;
    const dirLabel = bearingLabel(bearingToPoi);
    const turnLabel = turnInstructionFromDelta(delta);
    const centered = Math.abs(delta) < 8;
    card.classList.remove('ar-skeleton-card');
    card.classList.toggle('ar-poi-edge', !inView);
    card.title = `${poi.title} · ${dirLabel} · ${turnLabel}`;
    card.innerHTML = `
      <div class="ar-poi-icon">${escapeHtml(poi.icon || poiVisual(poi.kind).icon)}</div>
      <div class="ar-poi-distance">${formatDistance(dist)}</div>
    `;
    card.classList.toggle('ar-poi-centered', centered);
    Object.assign(card.style, {
      left: `${screenX}%`,
      top: `${lift}%`,
      transform: `translate(-50%, -50%) scale(${size}) perspective(900px) rotateX(${inView ? 16 : 4}deg) rotateY(${delta > 0 ? '-8deg' : '8deg'})`,
      opacity: `${clamp(1.15 - dist / 1500, inView ? 0.34 : 0.58, 1)}`,
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

  function renderPoiRail(pois: PoiRecord[]): void {
    if (!currentPos) return;
    poiRailEl.innerHTML = '';
    const nearest = pois
      .filter((poi) => poi.id !== currentTarget.id)
      .map((poi) => ({
        poi,
        dist: haversineDistanceMeters(currentPos!.lat, currentPos!.lng, poi.lat, poi.lng),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 6);
    poiRailEl.classList.toggle('is-empty', nearest.length === 0);
    nearest.forEach(({ poi, dist }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ar-poi-chip';
      button.dataset.poiId = poi.id;
      button.innerHTML = `
        <span class="ar-poi-chip-icon">${escapeHtml(poi.icon || poiVisual(poi.kind).icon)}</span>
        <span class="ar-poi-chip-main">${escapeHtml(poi.title)}</span>
        <span class="ar-poi-chip-distance">${formatDistance(dist)}</span>
      `;
      button.addEventListener('click', () => openPoiModal(poi));
      poiRailEl.appendChild(button);
    });
  }

  function renderNearbyPoiCards(pois: PoiRecord[]): void {
    activePoiLookup = new Map([[currentTarget.id, currentTarget], ...pois.map((p) => [p.id, p] as [string, PoiRecord])]);
    const activePoiIds = new Set<string>();
    activePoiIds.add(currentTarget.id);
    pois.forEach((poi) => {
      const card = ensureSkeletonCard(poi.id, poi.title, poi.kind);
      if (placePoiCard(card, poi)) activePoiIds.add(poi.id);
    });
    cleanupCollections(activePoiIds, new Set(objectCards.keys()));
    renderPoiRail(pois);
  }

  async function fetchNearbyPoiCards(force = false): Promise<void> {
    if (!currentPos) return;
    const now = Date.now();
    const moved = lastNearbyFetchPos
      ? haversineDistanceMeters(lastNearbyFetchPos.lat, lastNearbyFetchPos.lng, currentPos.lat, currentPos.lng)
      : Infinity;
    if (!force && nearbyPois.length && now - lastNearbyFetchAt < 10_000 && moved < 35) {
      renderNearbyPoiCards(nearbyPois);
      return;
    }
    if (nearbyFetchBusy) {
      renderNearbyPoiCards(nearbyPois);
      return;
    }
    nearbyFetchBusy = true;
    const token = ++nearbyFetchToken;
    setStatus('Memuat POI sekitar...');
    const bounds = L.latLngBounds(
      [currentPos.lat - 0.012, currentPos.lng - 0.012],
      [currentPos.lat + 0.012, currentPos.lng + 0.012],
    );
    let pois = await fetchOverpassFeaturesForBounds(bounds).catch(() => [] as PoiRecord[]);
    if (token !== nearbyFetchToken) {
      nearbyFetchBusy = false;
      return;
    }
    if (!pois.length) {
      const c = currentPos;
      pois = [
        { id: 'ar-local-terminal', kind: 'terminal', title: 'Terminal Terdekat', description: '', address: '', imageUrl: POI_LIBRARY.terminal.imageUrl, rating: POI_LIBRARY.terminal.rating, icon: poiVisual('terminal').icon, lat: c.lat + 0.0014, lng: c.lng + 0.0011 },
        { id: 'ar-local-station', kind: 'station', title: 'Stasiun Terdekat', description: '', address: '', imageUrl: POI_LIBRARY.station.imageUrl, rating: POI_LIBRARY.station.rating, icon: poiVisual('station').icon, lat: c.lat - 0.0011, lng: c.lng + 0.0016 },
        { id: 'ar-local-shelter', kind: 'shelter', title: 'Shelter / Halte', description: '', address: '', imageUrl: POI_LIBRARY.shelter.imageUrl, rating: POI_LIBRARY.shelter.rating, icon: poiVisual('shelter').icon, lat: c.lat + 0.0009, lng: c.lng - 0.0015 },
        { id: 'ar-local-cemetery', kind: 'cemetery', title: 'Pemakaman', description: '', address: '', imageUrl: POI_LIBRARY.cemetery.imageUrl, rating: POI_LIBRARY.cemetery.rating, icon: poiVisual('cemetery').icon, lat: c.lat - 0.0018, lng: c.lng - 0.0010 },
      ];
    }
    nearbyPois = pois.slice(0, 14);
    lastNearbyFetchAt = now;
    lastNearbyFetchPos = currentPos;
    nearbyFetchBusy = false;
    renderNearbyPoiCards(nearbyPois);
    setStatus('POI sekitar aktif');
  }

  function arObjectCategory(label: string): 'person' | 'vehicle' | 'plant' | 'traffic' | 'other' {
    const key = label.toLowerCase();
    if (/person/.test(key)) return 'person';
    if (/car|truck|bus|motorcycle|bicycle|vehicle/.test(key)) return 'vehicle';
    if (/plant|tree|flower|potted/.test(key)) return 'plant';
    if (/traffic light|stop sign/.test(key)) return 'traffic';
    return 'other';
  }

  function updateObjectOverlays(predictions: Array<{ bbox: number[]; class?: string; score?: number }>): void {
    const active = new Set<string>();
    predictions.filter((p) => (p.score ?? 0) > 0.32).slice(0, 10).forEach((p, index) => {
      const key = `${p.class || 'object'}-${index}`;
      active.add(key);
      const label = p.class || 'object';
      const readableLabel = detectionLabel(label);
      const category = arObjectCategory(label);
      const card = ensureObjectCard(key, label);
      const [x, y, w, h] = p.bbox;
      const bw = Math.max(8, (w / Math.max(videoEl.videoWidth, 1)) * 100);
      const bh = Math.max(8, (h / Math.max(videoEl.videoHeight, 1)) * 100);
      const cx = ((x + w / 2) / Math.max(videoEl.videoWidth, 1)) * 100;
      const cy = ((y + h / 2) / Math.max(videoEl.videoHeight, 1)) * 100;
      const distanceHint = Math.max(1, Math.round(1200 / Math.max(bw, 8)));
      const scorePct = Math.round((p.score ?? 0) * 100);
      card.className = `ar-object-card ar-object-${category}`;
      card.innerHTML = `
        <div class="ar-object-shape"></div>
        <div class="ar-object-tag">
          <span class="ar-object-label">${escapeHtml(readableLabel)}</span>
          <span class="ar-object-distance">${distanceHint}m · ${scorePct}%</span>
        </div>
      `;
      Object.assign(card.style, {
        left: `${cx}%`,
        top: `${cy}%`,
        width: `${bw}%`,
        height: `${bh}%`,
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
    if (pipDistanceElDiv) {
      pipDistanceElDiv.textContent = `${formatDistance(distToTarget)}`;
    }
    if (!hasLiveHeading || Date.now() - lastHeadingAt > 6000) {
      setLiveHeading(map.getBearing?.() ?? headingDeg, false);
    }
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

      const onGeoPosition = (pos: GeolocationPosition): void => {
        updateCurrentPosition(L.latLng(pos.coords.latitude, pos.coords.longitude), pos.coords);
      };
      navigator.geolocation?.getCurrentPosition?.(
        onGeoPosition,
        () => setStatus('GPS belum tersedia, memakai posisi peta'),
        { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 },
      );
      watchId = navigator.geolocation?.watchPosition?.(
        onGeoPosition,
        () => setStatus('Menunggu update GPS realtime...'),
        { enableHighAccuracy: true, maximumAge: 500, timeout: 12_000 },
      ) ?? null;

      try {
        const OrientationEvent = window.DeviceOrientationEvent as any;
        if (OrientationEvent && typeof OrientationEvent.requestPermission === 'function') {
          await OrientationEvent.requestPermission();
        }
      } catch {
        /* continue without explicit compass permission */
      }
      const onOrientation = (ev: DeviceOrientationEvent) => {
        const webkitHeading = (ev as any).webkitCompassHeading;
        if (typeof webkitHeading === 'number') {
          setLiveHeading(webkitHeading, true);
          return;
        }
        if (typeof ev.alpha === 'number') {
          setLiveHeading(360 - ev.alpha, true);
        }
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
        overlay.style.pointerEvents = arIsPrimary ? 'auto' : 'none';
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
        overlay.style.pointerEvents = primaryCamera ? 'auto' : 'none';
        overlay.style.background = primaryCamera ? '#000' : 'transparent';
        pipContainerEl.style.display = primaryCamera ? 'block' : 'none';
        poiLayerEl.style.display = primaryCamera ? 'block' : 'none';
        objectLayerEl.style.display = primaryCamera ? 'block' : 'none';
        poiRailEl.style.display = primaryCamera ? 'flex' : 'none';
        routeCorridorEl.style.display = primaryCamera ? 'block' : 'none';
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
        updatePipMap();
        if (!primaryCamera) {
          setTimeout(() => map.invalidateSize(), 80);
          refreshRouteIfNeeded(true);
        }
      };

      targetBeaconEl.addEventListener('click', () => openPoiModal(currentTarget));
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
          pipUserMarker = null;
          pipTargetMarker = null;
          pipRouteLine = null;
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

      currentPos = currentPos || map.getCenter();
      updatePipMap();
      setStatus(model ? 'Kamera dan deteksi objek aktif' : 'Kamera aktif, model AI belum termuat');
      await fetchNearbyPoiCards(true);
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
      const name = tags.name || tags.official_name || tags['brand'] || tags['operator'] || tags.amenity || tags.shop || tags.tourism || `${tags.amenity || tags.shop || 'POI'}`;
      const lat = el.type === 'node' ? el.lat : (el.center && el.center.lat) || el.lat || 0;
      const lng = el.type === 'node' ? el.lon : (el.center && el.center.lon) || el.lon || 0;
      const kind = classifyPoiKind(tags);
      const imageUrl = tags.image || tags['image:source'] || POI_LIBRARY[kind].imageUrl;
      const description = tags.description || tags['note'] || POI_LIBRARY[kind].description;
      const addressParts = [] as string[];
      if (tags['addr:street']) addressParts.push(tags['addr:street']);
      if (tags['addr:housenumber']) addressParts.push(tags['addr:housenumber']);
      if (tags['addr:city']) addressParts.push(tags['addr:city']);
      const address = addressParts.join(" ") || (tags['addr'] || "");
      return {
        id: `overpass-${el.type}-${el.id}`,
        kind,
        title: name || `POI ${el.id}`,
        description: description || '',
        address: address || '',
        imageUrl: imageUrl || POI_LIBRARY[kind].imageUrl,
        rating: POI_LIBRARY[kind].rating,
        icon: poiVisual(kind).icon,
        lat, lng,
      };
    }).filter((p: PoiRecord) => p.lat && p.lng && !Number.isNaN(p.lat) && !Number.isNaN(p.lng));
    return pois;
  } catch (err) {
    console.warn("Overpass fetch failed:", err);
    return [];
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
      title: tags.name || tags.amenity || tags.shop || `Feature ${el.id}`,
      description: tags.description || tags['note'] || '',
      address: (tags['addr:street'] || '') + (tags['addr:city'] ? ', ' + tags['addr:city'] : ''),
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
    return;
  }
  void refreshOverpassLayer();
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
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
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

function detectionSummaryText(detections?: YoloDetection[]): string {
  if (!detections?.length) return "Belum ada objek";
  const counts = new Map<string, number>();
  detections.forEach((d) => counts.set(d.label, (counts.get(d.label) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${detectionLabel(label)} ${count}`)
    .join(" / ");
}

function topDetectionText(detections?: YoloDetection[]): string {
  const top = detections?.[0];
  if (!top) return "-";
  return `${detectionLabel(top.label)} ${(top.confidence * 100).toFixed(0)}%`;
}

function renderDetectionChips(detections?: YoloDetection[]): string {
  if (!detections?.length) return `<div class="m-detection-empty">Belum ada objek terdeteksi</div>`;
  return `<div class="m-detection-chips">
    ${detections.slice(0, 12).map((d) => `
      <span class="m-detection-chip${d.vehicle ? " is-vehicle" : ""}">
        ${escapeHtml(detectionLabel(d.label))}
        <strong>${(d.confidence * 100).toFixed(0)}%</strong>
      </span>
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
  const lat = typeof raw.position?.lat === "number" ? raw.position.lat
    : typeof raw.position?.y === "number" ? raw.position.y : null;
  const lng = typeof raw.position?.lng === "number" ? raw.position.lng
    : typeof raw.position?.x === "number" ? raw.position.x : null;
  if (lat === null || lng === null) return null;
  const lastSeen = normalizeEpoch(typeof raw.lastSeen === "number" ? raw.lastSeen : 0);
  const rawStatus = isDeviceStatus(raw.status) ? raw.status : "offline";
  const status = lastSeen > 0 && Date.now() - lastSeen > OFFLINE_AFTER_MS ? "offline" : rawStatus;
  const rawRecord = raw as Record<string, unknown>;
  const rawCameraMode = rawRecord.cameraMode;
  const cameraUrl = raw.cameraUrl?.trim() || undefined;
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
    id: raw.id?.trim() || "raspberry-its",
    label: raw.label?.trim() || "Raspberry Pi 5 Controller",
    status, lastSeen,
    lastSeenText: raw.lastSeenText?.trim() || undefined,
    note: raw.note?.trim() || undefined,
    cameraUrl,
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
    position: { lat: clamp(lat, -90, 90), lng: clamp(lng, -180, 180) },
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
  const detector = device.detectorStatus
    ? `${device.detectorStatus}${device.detectorFps ? ` (${device.detectorFps.toFixed(1)} FPS)` : ""}`
    : "-";
  const breakdown = escapeHtml(vehicleBreakdownText(device.vehicleBreakdown));
  const objects = escapeHtml(detectionSummaryText(device.detections));
  const topObject = escapeHtml(topDetectionText(device.detections));
  const detectorNote = escapeHtml(device.detectorNote || "-");
  const detectorSource = escapeHtml(device.detectorCameraSource || "-");
  const gpio = escapeHtml(`${device.gpioBackend || "-"}${device.gpioReady === false ? " / error" : ""}`);
  const gpioNote = escapeHtml(device.gpioNote || "-");
  return `
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
        <div class="info-row"><span class="label">Road</span><span class="value" data-field="device-road">${road}</span></div>
        <div class="info-row"><span class="label">AI Detector</span><span class="value">${escapeHtml(detector)}</span></div>
        <div class="info-row"><span class="label">AI Source</span><span class="value">${detectorSource}</span></div>
        <div class="info-row"><span class="label">AI Note</span><span class="value">${detectorNote}</span></div>
        <div class="info-row"><span class="label">Objek</span><span class="value">${objects}</span></div>
        <div class="info-row"><span class="label">Akurasi Tertinggi</span><span class="value">${topObject}</span></div>
      </div>
      <div class="modal-tab-pane" data-tab="traffic">
        <div class="info-row"><span class="label">Jalan</span><span class="value" data-field="traffic-road">${road}</span></div>
        <div class="info-row"><span class="label">Jumlah Kendaraan</span><span class="value" data-field="traffic-count">${traffic.vehicleCount}</span></div>
        <div class="info-row"><span class="label">Rincian</span><span class="value">${breakdown}</span></div>
        <div class="info-row"><span class="label">Durasi Lampu</span><span class="value" data-field="traffic-duration">${traffic.duration}s (${traffic.color})</span></div>
        <div class="info-row"><span class="label">Rekomendasi</span><span class="value" data-field="traffic-recommendation">${recommendation}</span></div>
        <div class="info-row"><span class="label">GPIO</span><span class="value">${gpio}</span></div>
        <div class="info-row"><span class="label">GPIO Note</span><span class="value">${gpioNote}</span></div>
      </div>
    </div>`;
}

function closeModal(): void {
  document.querySelectorAll(".modal-wrapper, #m-device-modal, #m-poi-modal").forEach((m) => m.remove());
  state.activeModalDeviceId = null;
  state.activeModalPoiId = null;
  window.clearInterval(state.trafficRefreshTimer);
  state.trafficRefreshTimer = 0;
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
  requestAnimationFrame(() => overlay.classList.add("open"));
  L.DomEvent.disableClickPropagation(overlay);
  L.DomEvent.disableScrollPropagation(overlay);
  return overlay;
}

function openModal(device: DeviceRecord): void {
  closeModal();
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

  overlay.querySelector(".m-layer-backdrop")!.addEventListener("click", closeModal);
  const sheet = overlay.querySelector<HTMLElement>(".m-device-sheet");
  if (!sheet) return;
  setupSheetSwipe(sheet, closeModal);
  sheet.querySelectorAll<HTMLButtonElement>(".modal-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => setSheetActiveTab(sheet, btn.dataset.tab || "system"));
  });
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", closeModal);

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
  sheet.querySelector<HTMLButtonElement>(".modal-close")?.addEventListener("click", closeModal);
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
      pitch: MAPLIBRE_3D_PITCH,
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

        // Add POI symbol layer using text labels with emoji icons (simple, no drift)
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
              "text-opacity": 1
            }
          }, "building");
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
  const pitch = MAPLIBRE_3D_PITCH;

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
      pitch: MAPLIBRE_3D_PITCH,

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
}

// ─── Camera tile ────────────────────────────────────────────────

function publicCameraUrl(device: DeviceRecord | null): string {
  return device?.cameraUrl?.trim() || device?.webrtcUrl?.trim() || "";
}

function isLikelyImageUrl(url: string): boolean {
  return /^data:image/i.test(url) || /\.(mjpg|mjpeg|jpg|jpeg|png|webp)(\?|$)/i.test(url);
}

function cameraModeFor(device: DeviceRecord | null): CameraMode | null {
  if (!device || device.status === "offline") return null;
  if (publicCameraUrl(device)) return device.cameraMode || "mjpeg";
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
  const url = publicCameraUrl(device);
  if (url) {
    return isLikelyImageUrl(url)
      ? `<img class="${imageClass}" src="${escapeHtml(url)}" alt="Camera preview">`
      : `<iframe class="${frameClass}" src="${escapeHtml(url)}" allow="autoplay; camera; microphone; fullscreen" referrerpolicy="no-referrer" loading="lazy"></iframe>`;
  }
  if (device && isWebRtcSignalingCamera(device)) return renderWebRtcSurface(device, imageClass);
  return "";
}

function renderCameraTile(): void {
  if (!state.cameraPreview) return;
  const device = state.device;
  const url = publicCameraUrl(device);
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

function locateUser(): void {
  if (!navigator.geolocation) return;
  const applyPosition = (pos: GeolocationPosition, focusMap: boolean): void => {
    const latlng: [number, number] = [pos.coords.latitude, pos.coords.longitude];
    if (focusMap) {
      map.setView(latlng, Math.max(map.getZoom(), 16), { animate: true });
    }
    if (state.vehicleMarker) {
      state.vehicleMarker.setLatLng(latlng);
    } else {
      showVehicleMarker(latlng);
    }
    const now = Date.now();
    if (now - state.lastUserPoiSyncAt > 10_000) {
      state.lastUserPoiSyncAt = now;
      syncPoiMarkers(latlng);
    }
    if (isTablet() && focusMap) createTabletCategoryPanel();
  };
  navigator.geolocation.getCurrentPosition(
    (pos) => applyPosition(pos, true),
    () => { /* silent */ },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 1000 },
  );
  if (state.userWatchId !== null) {
    navigator.geolocation.clearWatch(state.userWatchId);
  }
  state.userWatchId = navigator.geolocation.watchPosition(
    (pos) => applyPosition(pos, false),
    () => { /* silent */ },
    { enableHighAccuracy: true, timeout: 12_000, maximumAge: 1000 },
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
  // remove existing
  if (state.vehicleMarker) {
    try { map.removeLayer(state.vehicleMarker); } catch { }
    state.vehicleMarker = null;
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
      <button class="mode-btn" data-mode="3d" title="3D">3D</button>
      <button class="mode-btn" data-mode="satellite" title="Satellite">Sat</button>
    `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    container.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const m = (btn.dataset.mode as BaseMapMode) || 'street';
        void setBaseMap(m);
      });
    });
    return container;
  }
});

function syncModeControlVisibility(): void {
  const shouldShowModeControl = !isMobile() && !isTablet();
  if (shouldShowModeControl) {
    if (!state.modeControl) {
      state.modeControl = new ModeControl();
      state.modeControl.addTo(map);
    }
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
          <span>Normal</span>
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

function setupSheetSwipe(sheetEl: HTMLElement, onClose: () => void): void {
  let startY = 0;
  let currentY = 0;

  const onTouchStart = (e: TouchEvent) => {
    startY = e.touches[0].clientY;
    currentY = 0;
    sheetEl.style.transition = "none";
  };

  const onTouchMove = (e: TouchEvent) => {
    const delta = e.touches[0].clientY - startY;
    currentY = Math.max(0, delta);
    sheetEl.style.transform = `translateY(${currentY}px)`;
  };

  const onTouchEnd = () => {
    sheetEl.style.transition = "";
    if (currentY > 80) {
      onClose();
    } else {
      sheetEl.style.transform = "";
    }
  };

  sheetEl.addEventListener("touchstart", onTouchStart, { passive: true });
  sheetEl.addEventListener("touchmove", onTouchMove, { passive: true });
  sheetEl.addEventListener("touchend", onTouchEnd);
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

function setMapHeight(heightPx: number): void {
  const mapEl = getMapEl();
  if (!mapEl) return;
  const total = window.innerHeight - 64;
  const mapH = Math.max(60, total - heightPx);
  document.documentElement.style.setProperty("--its-sheet-height", `${Math.max(0, heightPx)}px`);
  mapEl.style.height = `${mapH}px`;
  mapEl.style.transition = "height 0.32s cubic-bezier(0.32,0.72,0,1)";
  mapEl.classList.toggle("its-open", heightPx > 0);
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
  }, { passive: true });

  sheet.addEventListener("touchmove", (e: TouchEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".m-its-handle-zone")) return;
    const delta = e.touches[0].clientY - touchStartY;
    const rawY = touchStartTranslate + delta;
    const minY = window.innerHeight - ITS_SNAP.full() - 64;
    const maxY = window.innerHeight - 64;
    const clampedY = Math.max(minY, Math.min(maxY, rawY));
    sheet.style.transform = `translateY(${clampedY}px)`;
    const sheetH = window.innerHeight - 64 - clampedY;
    setMapHeight(Math.max(0, sheetH));
  }, { passive: true });

  sheet.addEventListener("touchend", () => {
    const matrix = new DOMMatrix(getComputedStyle(sheet).transform);
    const currentY = matrix.m42;
    const sheetH = window.innerHeight - 64 - currentY;
    const peekH = ITS_SNAP.peek();
    const fullH = ITS_SNAP.full();

    let snap: "closed" | "peek" | "full";
    if (sheetH < peekH * 0.4) {
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
  const breakdown = device?.vehicleBreakdown;
  const detectorStatus = device?.detectorStatus
    ? `${device.detectorStatus}${device.detectorFps ? ` / ${device.detectorFps.toFixed(1)} FPS` : ""}`
    : "-";
  const objectCount = device?.objectCount ?? device?.detections?.length ?? 0;
  const topObject = topDetectionText(device?.detections);
  const detectorNote = device?.detectorNote || "";
  const gpioText = device ? `${device.gpioBackend || "-"}${device.gpioReady === false ? " / error" : ""}` : "-";

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
      <div class="m-its-section-title">Data Scan</div>
      <div class="m-its-chart-wrap">
        <canvas id="m-traffic-chart" width="320" height="180"></canvas>
      </div>
      ${device ? `<div class="m-ai-scan-grid">
        <div><span>AI</span><strong>${escapeHtml(detectorStatus)}</strong></div>
        <div><span>Objek</span><strong>${objectCount}</strong></div>
        <div><span>Top</span><strong>${escapeHtml(topObject)}</strong></div>
        <div><span>Kendaraan</span><strong>${traffic?.vehicleCount ?? 0}</strong></div>
        <div><span>GPIO</span><strong>${escapeHtml(gpioText)}</strong></div>
        <div><span>Mobil</span><strong>${breakdown?.car ?? 0}</strong></div>
        <div><span>Motor</span><strong>${breakdown?.motorcycle ?? 0}</strong></div>
      </div>` : ""}
      ${device ? renderDetectionChips(device.detections) : ""}
      ${detectorNote ? `<div class="m-detector-note">${escapeHtml(detectorNote)}</div>` : ""}
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

// ─── PWA: Service Worker registration and install prompt handler ─────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registered');
    } catch (err) {
      console.warn('[PWA] Service Worker registration failed', err);
    }
  });
}

let deferredPrompt: any = null;
function createInstallButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.className = 'pwa-install-btn';
  btn.textContent = 'Pasang Aplikasi';
  Object.assign(btn.style, {
    position: 'fixed',
    right: '12px',
    bottom: '84px',
    zIndex: '9999',
    padding: '8px 12px',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 6px 14px rgba(37,99,235,0.24)',
    cursor: 'pointer'
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      console.log('[PWA] install outcome', choice.outcome);
      if (choice.outcome === 'accepted') btn.style.display = 'none';
    } catch (e) {
      console.warn('[PWA] prompt error', e);
    }
    deferredPrompt = null;
  });
  return btn;
}

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
  if (!document.getElementById('pwa-install-btn')) {
    const btn = createInstallButton();
    document.body.appendChild(btn);
  } else {
    (document.getElementById('pwa-install-btn') as HTMLElement).style.display = 'block';
  }
});

window.addEventListener('appinstalled', () => {
  console.log('[PWA] appinstalled');
  const b = document.getElementById('pwa-install-btn');
  if (b) b.remove();
});
