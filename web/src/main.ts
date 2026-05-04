import "./style.css";

type BackendMode = "github-json" | "demo";
type DeviceStatus = "online" | "offline" | "degraded";
type EventSeverity = "info" | "good" | "warn" | "danger";

type DeviceRecord = {
  id: string;
  label: string;
  district: string;
  ip?: string;
  status: DeviceStatus;
  vehicles: number;
  congestion: number;
  speedKph: number;
  camera: string;
  note?: string;
  lastSeen: number;
  position: { x: number; y: number };
};

type EventRecord = {
  id: string;
  time: number;
  label: string;
  detail: string;
  severity: EventSeverity;
  deviceId?: string;
};

type Snapshot = {
  updatedAt?: number;
  source?: string;
  devices?: Array<Partial<DeviceRecord> & { position?: { x?: number; y?: number } }>;
  events?: Array<Partial<EventRecord>>;
};

type AppConfig = {
  snapshotUrl?: string;
  refreshMs?: number;
  mapAttribution?: string;
  mapLabel?: string;
  githubRepo?: string;
  githubBranch?: string;
};

type FallbackState = {
  updatedAt: number;
  source: string;
  devices: DeviceRecord[];
  events: EventRecord[];
};

const FALLBACK: FallbackState = {
  updatedAt: 1777870000000,
  source: "demo",
  devices: [
    {
      id: "raspberry-its",
      label: "Raspberry Pi 5 Controller",
      district: "Koridor Utama ITS",
      ip: "10.176.37.67",
      status: "online",
      vehicles: 28,
      congestion: 62,
      speedKph: 31,
      camera: "pending",
      note: "controller aktif; kamera belum terpasang",
      lastSeen: 1777869995000,
      position: { x: 54.8, y: 48.5 },
    },
    {
      id: "edge-sensor-02",
      label: "Edge Sensor Timur",
      district: "Simpang Timur",
      ip: "10.176.37.82",
      status: "offline",
      vehicles: 9,
      congestion: 18,
      speedKph: 40,
      camera: "offline",
      note: "node cadangan belum online",
      lastSeen: 1777868880000,
      position: { x: 70.5, y: 38.7 },
    },
    {
      id: "camera-gate-01",
      label: "Camera Gate Selatan",
      district: "Gerbang Selatan",
      ip: "10.176.37.120",
      status: "degraded",
      vehicles: 41,
      congestion: 78,
      speedKph: 22,
      camera: "pending",
      note: "AI detector menunggu kamera fisik",
      lastSeen: 1777869972000,
      position: { x: 43.8, y: 69.5 },
    },
  ],
  events: [
    {
      id: "ev-1",
      time: 1777869820000,
      label: "Heartbeat Raspberry Pi",
      detail: "device raspberry-its mengirim status online",
      severity: "good",
      deviceId: "raspberry-its",
    },
    {
      id: "ev-2",
      time: 1777869600000,
      label: "Lonjakan kendaraan",
      detail: "koridor timur naik ke 78% congestion",
      severity: "warn",
      deviceId: "camera-gate-01",
    },
  ],
};

const DEFAULT_SELECTED_DEVICE = FALLBACK.devices[0]!;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app element.");
}

app.innerHTML = `
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">ITS live map</p>
        <h1>Raspberry Pi traffic controller dashboard</h1>
        <p class="hero-copy">Dashboard ini membaca JSON statis dari GitHub Pages. Nanti saat controller Scala aktif, data tinggal diganti oleh snapshot realtime yang ditulis ke file JSON atau endpoint publik yang kamu pilih.</p>
      </div>
      <div class="hero-badges">
        <span id="backendBadge" class="badge">Github JSON</span>
        <span id="syncNote" class="sync">belum sinkron</span>
      </div>
    </header>

    <main class="layout">
      <section class="map-card">
        <div class="card-head">
          <div>
            <p class="eyebrow">Traffic map</p>
            <h2>Digital twin koridor ITS</h2>
          </div>
          <button id="refreshBtn" class="tool-btn" type="button">Refresh</button>
        </div>

        <div class="map-stage" id="mapStage">
          <svg class="map-svg" viewBox="0 0 1000 720" aria-hidden="true">
            <g id="riverLayer"></g>
            <g id="roadLayer"></g>
            <g id="labelLayer"></g>
          </svg>
          <div class="device-layer" id="deviceLayer"></div>
        </div>

        <div class="legend">
          <span><i class="dot good"></i>Online</span>
          <span><i class="dot warn"></i>Congestion watch</span>
          <span><i class="dot bad"></i>Offline</span>
          <span><i class="line"></i>Road corridor</span>
          <span><i class="water"></i>Water / boundary</span>
        </div>
        <div class="map-attribution">
          <span id="mapLabel">OpenStreetMap-style custom map</span>
          <span>Copyright ITS Telkom University</span>
        </div>
      </section>

      <aside class="side">
        <section class="stats">
          <article><small>Device aktif</small><strong id="activeDevices">0</strong><span id="offlineDevices">0 offline</span></article>
          <article><small>Jumlah kendaraan</small><strong id="vehicleTotal">0</strong><span>semua node</span></article>
          <article><small>Rata-rata congestion</small><strong id="averageCongestion">0%</strong><span>indikasi macet</span></article>
          <article><small>Kamera siap</small><strong id="cameraReady">0</strong><span>layer kamera</span></article>
        </section>

        <section class="panel">
          <div class="panel-headline">
            <div>
              <p class="eyebrow">Raspberry devices</p>
              <h3>Status node</h3>
            </div>
            <span id="syncAge" class="chip">demo</span>
          </div>
          <div id="deviceList" class="list"></div>
        </section>

        <section class="panel">
          <div class="panel-headline">
            <div>
              <p class="eyebrow">Event feed</p>
              <h3>Traffic signal</h3>
            </div>
          </div>
          <div id="eventFeed" class="feed"></div>
        </section>

        <section class="panel selected">
          <div class="panel-headline">
            <div>
              <p class="eyebrow">Selected device</p>
              <h3 id="selectedTitle">Raspberry Pi 5 Controller</h3>
            </div>
          </div>
          <div id="selectedBody"></div>
        </section>
      </aside>
    </main>
  </div>
`;

const DEFAULT_CONFIG: Required<Pick<AppConfig, "snapshotUrl" | "refreshMs" | "mapAttribution" | "mapLabel">> = {
  snapshotUrl: "./data/its-state.json",
  refreshMs: 5000,
  mapAttribution: "OpenStreetMap contributors",
  mapLabel: "Custom ITS map",
};

type AppState = {
  devices: DeviceRecord[];
  events: EventRecord[];
  backend: BackendMode;
  selectedId: string;
  updatedAt: number;
  zoom: number;
  config: typeof DEFAULT_CONFIG;
  refreshTimer: number;
  refreshBusy: boolean;
};

const state: AppState = {
  devices: [...FALLBACK.devices],
  events: [...FALLBACK.events],
  backend: "github-json",
  selectedId: DEFAULT_SELECTED_DEVICE.id,
  updatedAt: FALLBACK.updatedAt,
  zoom: 1,
  config: DEFAULT_CONFIG,
  refreshTimer: 0,
  refreshBusy: false,
};

const svgRoads = [
  "M 110 140 C 250 110, 410 120, 560 160 S 760 220, 930 190",
  "M 70 250 C 230 225, 360 245, 510 292 S 780 345, 965 315",
  "M 90 420 C 250 390, 400 398, 540 438 S 785 510, 955 475",
  "M 130 570 C 310 538, 470 548, 632 590 S 820 648, 965 618",
  "M 215 90 C 180 180, 180 300, 208 400 S 255 560, 220 675",
  "M 385 68 C 360 175, 365 286, 390 402 S 442 562, 430 690",
  "M 610 90 C 585 198, 594 310, 620 420 S 674 560, 664 682",
  "M 840 92 C 804 214, 808 321, 830 438 S 870 580, 864 680",
];

const svgRivers = [
  "M 20 640 C 140 600, 250 614, 360 602 S 590 540, 700 556 S 880 595, 980 575",
  "M 30 612 C 155 578, 275 592, 396 580 S 630 522, 744 538 S 902 572, 972 560",
];

const districtLabels = [
  { title: "Pusat ITS", x: 51, y: 35 },
  { title: "Koridor Barat", x: 18, y: 43 },
  { title: "Koridor Timur", x: 78, y: 30 },
  { title: "Gerbang Selatan", x: 44, y: 79 },
  { title: "Ruang Sungai", x: 68, y: 61 },
];

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function n(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function ago(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 60_000) return `${Math.max(1, Math.round(delta / 1000))} detik lalu`;
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))} menit lalu`;
  return `${Math.max(1, Math.round(delta / 3_600_000))} jam lalu`;
}

function renderBackground(): void {
  const roadLayer = document.querySelector<SVGGElement>("#roadLayer");
  const riverLayer = document.querySelector<SVGGElement>("#riverLayer");
  const labelLayer = document.querySelector<SVGGElement>("#labelLayer");

  if (!roadLayer || !riverLayer || !labelLayer) return;

  roadLayer.innerHTML = svgRoads.map((d, i) => `<path d="${d}" class="road road-${i % 4}" />`).join("");
  riverLayer.innerHTML = svgRivers.map((d) => `<path d="${d}" class="river" />`).join("");
  labelLayer.innerHTML = districtLabels.map((label) => `
    <g transform="translate(${label.x * 10}, ${label.y * 10})">
      <rect x="-48" y="-14" width="96" height="24" rx="12" class="district-chip"></rect>
      <text x="0" y="2" text-anchor="middle" class="district-text">${esc(label.title)}</text>
    </g>
  `).join("");
}

function selectedDevice(): DeviceRecord {
  return state.devices.find((device) => device.id === state.selectedId) ?? state.devices[0] ?? DEFAULT_SELECTED_DEVICE;
}

function fallbackDeviceAt(index: number): DeviceRecord {
  return FALLBACK.devices[index % FALLBACK.devices.length] ?? DEFAULT_SELECTED_DEVICE;
}

function render(): void {
  const active = state.devices.filter((device) => device.status !== "offline").length;
  const offline = state.devices.length - active;
  const vehicleTotal = state.devices.reduce((sum, device) => sum + device.vehicles, 0);
  const averageCongestion = Math.round(state.devices.reduce((sum, device) => sum + device.congestion, 0) / state.devices.length);
  const cameraReady = state.devices.filter((device) => device.camera === "online").length;

  const badge = document.querySelector<HTMLElement>("#backendBadge");
  const syncNote = document.querySelector<HTMLElement>("#syncNote");
  const syncAge = document.querySelector<HTMLElement>("#syncAge");
  const activeDevices = document.querySelector<HTMLElement>("#activeDevices");
  const offlineDevices = document.querySelector<HTMLElement>("#offlineDevices");
  const vehicleTotalEl = document.querySelector<HTMLElement>("#vehicleTotal");
  const averageCongestionEl = document.querySelector<HTMLElement>("#averageCongestion");
  const cameraReadyEl = document.querySelector<HTMLElement>("#cameraReady");
  const deviceList = document.querySelector<HTMLElement>("#deviceList");
  const eventFeed = document.querySelector<HTMLElement>("#eventFeed");
  const selectedTitle = document.querySelector<HTMLElement>("#selectedTitle");
  const selectedBody = document.querySelector<HTMLElement>("#selectedBody");
  const deviceLayer = document.querySelector<HTMLElement>("#deviceLayer");
  const mapLabel = document.querySelector<HTMLElement>("#mapLabel");

  if (!badge || !syncNote || !syncAge || !activeDevices || !offlineDevices || !vehicleTotalEl || !averageCongestionEl || !cameraReadyEl || !deviceList || !eventFeed || !selectedTitle || !selectedBody || !deviceLayer || !mapLabel) {
    throw new Error("Missing ITS dashboard element.");
  }

  badge.textContent = state.backend === "github-json" ? "GitHub JSON" : "Demo mode";
  syncNote.textContent = state.refreshBusy ? "menarik snapshot terbaru..." : `sinkron ${ago(state.updatedAt)}`;
  syncAge.textContent = state.backend === "github-json" ? `live / ${Math.round(state.config.refreshMs / 1000)}s` : "demo";
  activeDevices.textContent = String(active);
  offlineDevices.textContent = `${offline} offline`;
  vehicleTotalEl.textContent = n(vehicleTotal);
  averageCongestionEl.textContent = `${averageCongestion}%`;
  cameraReadyEl.textContent = String(cameraReady);
  mapLabel.textContent = `${state.config.mapLabel} · ${state.config.mapAttribution}`;

  deviceLayer.innerHTML = state.devices.map((device) => `
    <button class="pin ${device.status} ${device.id === state.selectedId ? "selected" : ""}" type="button" data-id="${esc(device.id)}" style="left:${device.position.x}%; top:${device.position.y}%">
      <span class="pin-pulse"></span>
      <span class="pin-core"></span>
      <span class="pin-label">${esc(device.label)}</span>
      <span class="pin-count">${n(device.vehicles)} kendaraan</span>
    </button>
  `).join("");

  deviceList.innerHTML = state.devices.map((device) => `
    <button class="device-row ${device.id === state.selectedId ? "selected" : ""}" type="button" data-id="${esc(device.id)}">
      <div class="row-top">
        <strong>${esc(device.label)}</strong>
        <span class="status ${device.status}">${device.status}</span>
      </div>
      <div class="row-meta">
        <span>${esc(device.district)}</span>
        <span>${esc(device.ip || "no-ip")}</span>
      </div>
      <div class="row-stats">
        <span>${n(device.vehicles)} kendaraan</span>
        <span>${device.congestion}% macet</span>
        <span>${device.speedKph} km/jam</span>
      </div>
      <div class="row-foot">
        <span>Kamera: ${esc(device.camera)}</span>
        <span>${ago(device.lastSeen)}</span>
      </div>
    </button>
  `).join("");

  eventFeed.innerHTML = state.events.map((event) => `
    <article class="event">
      <div class="bul ${event.severity}"></div>
      <div>
        <div class="event-head"><strong>${esc(event.label)}</strong><time>${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.time))}</time></div>
        <p>${esc(event.detail)}</p>
      </div>
    </article>
  `).join("");

  selectedTitle.textContent = selectedDevice().label;
  selectedBody.innerHTML = `
    <div class="selected-grid">
      <div><span>ID</span><strong>${esc(selectedDevice().id)}</strong></div>
      <div><span>Status</span><strong>${esc(selectedDevice().status)}</strong></div>
      <div><span>District</span><strong>${esc(selectedDevice().district)}</strong></div>
      <div><span>Kamera</span><strong>${esc(selectedDevice().camera)}</strong></div>
    </div>
    <div class="selected-metrics">
      <div><span>Kendaraan</span><strong>${n(selectedDevice().vehicles)}</strong></div>
      <div><span>Congestion</span><strong>${selectedDevice().congestion}%</strong></div>
      <div><span>Speed</span><strong>${selectedDevice().speedKph} km/jam</strong></div>
    </div>
    <p class="selected-note">${esc(selectedDevice().note || "Belum ada catatan.")}</p>
    <div class="selected-footer"><span>${esc(selectedDevice().ip || "-")}</span><span>Last seen ${ago(selectedDevice().lastSeen)}</span></div>
  `;

  document.querySelectorAll<HTMLElement>("[data-id]").forEach((button) => {
    button.onclick = () => {
      state.selectedId = button.dataset.id || state.selectedId;
      render();
    };
  });
}

async function loadSnapshot(): Promise<void> {
  if (state.refreshBusy) {
    return;
  }
  state.refreshBusy = true;
  try {
    const configResponse = await fetch("./data/its-config.json", { cache: "no-store" });
    if (configResponse.ok) {
      const config = (await configResponse.json()) as Partial<AppConfig>;
      state.config = {
        ...DEFAULT_CONFIG,
        ...config,
      };
    } else {
      state.config = { ...DEFAULT_CONFIG };
    }

    const response = await fetch(state.config.snapshotUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("snapshot not found");
    const snapshot = (await response.json()) as Snapshot;
    if (Array.isArray(snapshot.devices) && snapshot.devices.length) {
      state.devices = snapshot.devices.map((device, index) => {
        const fallbackDevice = fallbackDeviceAt(index);
        return {
          id: String(device.id || fallbackDevice.id),
          label: String(device.label || fallbackDevice.label),
          district: String(device.district || fallbackDevice.district),
          ip: String(device.ip || ""),
          status: (device.status as DeviceStatus) || fallbackDevice.status,
          vehicles: Number(device.vehicles ?? 0),
          congestion: Number(device.congestion ?? 0),
          speedKph: Number(device.speedKph ?? 0),
          camera: String(device.camera || "pending"),
          note: String(device.note || ""),
          lastSeen: Number(device.lastSeen ?? Date.now()),
          position: {
            x: Number(device.position?.x ?? fallbackDevice.position.x),
            y: Number(device.position?.y ?? fallbackDevice.position.y),
          },
        };
      });
    }
    if (Array.isArray(snapshot.events) && snapshot.events.length) {
      state.events = snapshot.events.map((event) => ({
        id: String(event.id || `event_${Date.now()}`),
        time: Number(event.time ?? Date.now()),
        label: String(event.label || "Event"),
        detail: String(event.detail || ""),
        severity: (event.severity as EventSeverity) || "info",
        deviceId: String(event.deviceId || ""),
      }));
    }
    state.backend = "github-json";
    state.updatedAt = Number(snapshot.updatedAt || Date.now());
  } catch {
    state.backend = "demo";
    state.updatedAt = Date.now();
    state.devices = [...FALLBACK.devices];
    state.events = [...FALLBACK.events];
  }
  if (!state.devices.some((device) => device.id === state.selectedId)) {
    state.selectedId = state.devices[0]?.id || FALLBACK.devices[0].id;
  }
  renderBackground();
  render();
  window.clearInterval(state.refreshTimer);
  state.refreshTimer = window.setInterval(() => {
    void loadSnapshot();
  }, state.config.refreshMs);
  state.refreshBusy = false;
}

const refreshBtn = document.querySelector<HTMLButtonElement>("#refreshBtn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    void loadSnapshot();
  });
}

window.addEventListener("beforeunload", () => {
  window.clearInterval(state.refreshTimer);
});

void loadSnapshot();
