import "./style.css";

declare global {
  interface Window {
    maplibregl?: any;
    tf?: any;
    cocoSsd?: any;
  }
}

type BaseMapMode = "street" | "3d" | "satellite";
type PoiKind =
  | "hospital" | "mall" | "campus" | "parking" | "park" | "worship" | "school"
  | "office" | "restaurant" | "monument" | "terminal" | "station" | "shelter"
  | "cemetery" | "transport" | "fuel" | "bank" | "atm" | "pharmacy" | "market"
  | "hotel" | "police" | "other";
type PoiRecord = {
  id: string;
  kind: PoiKind;
  visualKey: string;
  title: string;
  description: string;
  address: string;
  imageUrl: string;
  rating: string;
  icon: string;
  color: string;
  priority: number;
  minZoom: number;
  osmType?: string;
  osmId?: string | number;
  tags: Record<string, string>;
  lat: number;
  lng: number;
};
type RouteStep = { instruction: string; distance: number; modifier?: string; bearingAfter?: number };
type ArCategory = "person" | "vehicle" | "plant" | "traffic" | "road" | "other";

const DEFAULT_CENTER = { lat: -6.16185, lng: 106.57635 };
const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const SATELLITE_STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      attribution: "Esri imagery",
    },
  },
  layers: [{ id: "satellite-base", type: "raster", source: "satellite" }],
};

const POI_IMAGES: Record<PoiKind, { imageUrl: string; description: string; rating: string }> = {
  hospital: { imageUrl: "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=900&q=80", description: "Fasilitas kesehatan, klinik, atau layanan darurat terdekat.", rating: "4.7" },
  mall: { imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=900&q=80", description: "Area belanja, toko, dan pusat aktivitas publik.", rating: "4.5" },
  campus: { imageUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=900&q=80", description: "Kampus atau fasilitas pendidikan tinggi.", rating: "4.8" },
  parking: { imageUrl: "https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&w=900&q=80", description: "Area parkir kendaraan.", rating: "4.2" },
  park: { imageUrl: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80", description: "Ruang hijau, taman, atau area terbuka.", rating: "4.6" },
  worship: { imageUrl: "https://images.unsplash.com/photo-1514222497938-d0edb2e47c23?auto=format&fit=crop&w=900&q=80", description: "Tempat ibadah dan kegiatan keagamaan.", rating: "4.7" },
  school: { imageUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=900&q=80", description: "Sekolah atau fasilitas pendidikan.", rating: "4.4" },
  office: { imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80", description: "Kantor, layanan administrasi, atau instansi.", rating: "4.1" },
  restaurant: { imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80", description: "Restoran, kafe, atau kuliner sekitar.", rating: "4.3" },
  terminal: { imageUrl: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=900&q=80", description: "Terminal atau simpul transportasi.", rating: "4.0" },
  station: { imageUrl: "https://images.unsplash.com/photo-1474487548417-781cb71495f3?auto=format&fit=crop&w=900&q=80", description: "Stasiun transportasi.", rating: "4.1" },
  shelter: { imageUrl: "https://images.unsplash.com/photo-1528928716400-4a2f2f6df4fc?auto=format&fit=crop&w=900&q=80", description: "Halte atau titik naik turun kendaraan umum.", rating: "4.0" },
  cemetery: { imageUrl: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=900&q=80", description: "Area pemakaman.", rating: "4.0" },
  transport: { imageUrl: "https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=900&q=80", description: "Titik transportasi publik.", rating: "4.0" },
  monument: { imageUrl: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80", description: "Landmark, monumen, atau tempat bersejarah.", rating: "4.2" },
  fuel: { imageUrl: "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80", description: "SPBU atau pengisian bahan bakar.", rating: "4.1" },
  bank: { imageUrl: "https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?auto=format&fit=crop&w=900&q=80", description: "Bank dan layanan keuangan.", rating: "4.1" },
  atm: { imageUrl: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?auto=format&fit=crop&w=900&q=80", description: "Mesin ATM atau layanan tunai.", rating: "4.0" },
  pharmacy: { imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=900&q=80", description: "Apotek dan layanan obat.", rating: "4.3" },
  market: { imageUrl: "https://images.unsplash.com/photo-1534723452862-4c874018d66d?auto=format&fit=crop&w=900&q=80", description: "Pasar, minimarket, atau toko.", rating: "4.2" },
  hotel: { imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80", description: "Hotel atau penginapan.", rating: "4.2" },
  police: { imageUrl: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=900&q=80", description: "Kantor polisi atau pos keamanan.", rating: "4.0" },
  other: { imageUrl: "https://images.unsplash.com/photo-1524429656589-6633a470097c?auto=format&fit=crop&w=900&q=80", description: "Titik orientasi umum di peta.", rating: "4.0" },
};

const POI_VISUALS: Record<string, { icon: string; color: string; label: string }> = {
  hospital: { icon: "+", color: "#e14949", label: "Kesehatan" },
  mall: { icon: "M", color: "#7c5cff", label: "Belanja" },
  campus: { icon: "U", color: "#2376d9", label: "Kampus" },
  parking: { icon: "P", color: "#5f7188", label: "Parkir" },
  park: { icon: "T", color: "#22a05a", label: "Taman" },
  worship: { icon: "I", color: "#d9911f", label: "Ibadah" },
  mosque: { icon: "M", color: "#12a977", label: "Masjid" },
  church: { icon: "+", color: "#7c4fd6", label: "Gereja" },
  temple: { icon: "T", color: "#c17a16", label: "Kuil" },
  school: { icon: "S", color: "#2563eb", label: "Sekolah" },
  office: { icon: "B", color: "#168b86", label: "Kantor" },
  restaurant: { icon: "R", color: "#e65c80", label: "Kuliner" },
  terminal: { icon: "B", color: "#047b73", label: "Terminal" },
  station: { icon: "K", color: "#1e56c5", label: "Stasiun" },
  shelter: { icon: "H", color: "#158bd1", label: "Halte" },
  cemetery: { icon: "C", color: "#6b7280", label: "Makam" },
  transport: { icon: "A", color: "#1388bd", label: "Transport" },
  monument: { icon: "L", color: "#a36a1a", label: "Landmark" },
  fuel: { icon: "F", color: "#e56d19", label: "SPBU" },
  bank: { icon: "$", color: "#08745f", label: "Bank" },
  atm: { icon: "$", color: "#2c69d1", label: "ATM" },
  pharmacy: { icon: "+", color: "#16a34a", label: "Apotek" },
  market: { icon: "K", color: "#8b4bd6", label: "Toko" },
  hotel: { icon: "H", color: "#0891b2", label: "Hotel" },
  police: { icon: "!", color: "#1d4ed8", label: "Polisi" },
  other: { icon: "i", color: "#51657d", label: "POI" },
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element.");

app.innerHTML = `
  <main class="maps-shell">
    <section class="map-surface">
      <div id="map" class="map-canvas"></div>
      <div class="fallback-map-art" aria-hidden="true"></div>
      <div class="html-poi-layer" aria-label="POI custom"></div>
      <div class="top-guidance">
        <div class="turn-icon" data-field="turn-icon">-></div>
        <div>
          <div class="turn-distance" data-field="turn-distance">Pilih tujuan</div>
          <div class="turn-road" data-field="turn-road">POI custom dari OpenStreetMap</div>
        </div>
      </div>
      <div class="layer-control" aria-label="Pilih tampilan peta">
        <button class="mode-btn" data-mode="street">2D</button>
        <button class="mode-btn" data-mode="3d">3D</button>
        <button class="mode-btn" data-mode="satellite">Satelit</button>
      </div>
      <button class="ar-launch" type="button">Camera AR</button>
      <div class="poi-count" data-field="poi-count">Memuat POI...</div>
    </section>
    <aside class="detail-panel" data-field="detail-panel">
      <button class="panel-close" type="button">x</button>
      <div class="empty-detail">
        <span class="empty-dot"></span>
        <h1>ITS Maps</h1>
        <p>Klik POI custom di peta untuk melihat detail, rute, dan membuka AR camera.</p>
      </div>
    </aside>
  </main>
  <section class="ar-view" id="ar-view" aria-hidden="true">
    <video class="ar-video" autoplay playsinline muted></video>
    <div class="ar-route-corridor is-hidden" data-field="ar-route-corridor">
      <span></span><span></span><span></span>
    </div>
    <div class="ar-poi-layer"></div>
    <div class="ar-object-layer"></div>
    <button class="ar-pip-map-container" type="button" data-field="ar-pip">
      <div class="pip-map-lines"></div>
      <strong data-field="pip-distance">-</strong>
    </button>
    <button class="ar-pip-restore" type="button" data-field="pip-restore">&lt;</button>
    <div class="ar-controls-bottom">
      <button type="button" data-action="swap">Peta</button>
      <button type="button" data-action="close">x</button>
    </div>
  </section>
`;

const state = {
  mode: "street" as BaseMapMode,
  map: null as any,
  mapReady: false,
  pois: new Map<string, PoiRecord>(),
  selectedPoi: null as PoiRecord | null,
  routeGeometry: [] as Array<{ lat: number; lng: number }>,
  routeSteps: [] as RouteStep[],
  routeDistance: 0,
  routeDuration: 0,
  currentPos: { ...DEFAULT_CENTER },
  heading: 0,
  hasLiveHeading: false,
  arRunning: false,
  arStream: null as MediaStream | null,
  detector: null as any,
};

function esc(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some((script) => script.src === src)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCss(href: string): void {
  if ([...document.styleSheets].some((sheet) => sheet.href === href)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

async function loadMapLibre(): Promise<void> {
  if (window.maplibregl) return;
  loadCss(MAPLIBRE_CSS);
  await loadScript(MAPLIBRE_JS);
}

function isMobile(): boolean {
  return window.innerWidth <= 640 || /Mobi|Android.*Mobile|iPhone/i.test(navigator.userAgent);
}

function isTablet(): boolean {
  const coarse = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;
  const uaTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent);
  return (coarse || uaTablet) && window.innerWidth >= 700 && window.innerWidth <= 1366;
}

function visualFor(key: string): { icon: string; color: string; label: string } {
  return POI_VISUALS[key] || POI_VISUALS.other;
}

function classifyPoiKind(tags: Record<string, string>): PoiKind {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const historic = tags.historic;
  const railway = tags.railway;
  const publicTransport = tags.public_transport;
  const highway = tags.highway;
  if (amenity === "hospital" || amenity === "clinic" || amenity === "doctors" || amenity === "dentist") return "hospital";
  if (amenity === "pharmacy") return "pharmacy";
  if (amenity === "fuel" || shop === "fuel") return "fuel";
  if (amenity === "bank") return "bank";
  if (amenity === "atm") return "atm";
  if (amenity === "police") return "police";
  if (amenity === "place_of_worship" || tags.religion) return "worship";
  if (amenity === "school" || amenity === "kindergarten" || tags.education === "school") return "school";
  if (amenity === "university" || amenity === "college") return "campus";
  if (amenity === "restaurant" || amenity === "cafe" || amenity === "fast_food") return "restaurant";
  if (amenity === "parking" || tags.parking) return "parking";
  if (amenity === "bus_station" || amenity === "terminal" || amenity === "ferry_terminal") return "terminal";
  if (railway === "station" || railway === "halt" || railway === "tram_stop") return "station";
  if (publicTransport === "station") return railway ? "station" : "terminal";
  if (amenity === "bus_stop" || highway === "bus_stop" || publicTransport === "platform" || publicTransport === "stop_position") return "shelter";
  if (amenity === "grave_yard" || tags.landuse === "cemetery" || historic === "cemetery") return "cemetery";
  if (publicTransport) return "transport";
  if (tags.office || amenity === "office" || amenity === "townhall" || amenity === "courthouse") return "office";
  if (shop === "mall" || shop === "department_store") return "mall";
  if (shop || amenity === "marketplace") return "market";
  if (tourism === "hotel" || tourism === "guest_house" || tourism === "hostel") return "hotel";
  if (historic === "monument" || historic === "memorial" || tourism === "attraction" || tourism === "museum") return "monument";
  if (leisure === "park" || leisure === "garden" || leisure === "playground" || tags.landuse === "grass") return "park";
  return "other";
}

function inferVisualKey(tags: Record<string, string>, kind: PoiKind, title: string): string {
  const haystack = `${tags.religion || ""} ${tags.denomination || ""} ${title}`.toLowerCase();
  if (kind === "worship") {
    if (/islam|muslim|masjid|mushol|mosque/.test(haystack)) return "mosque";
    if (/christ|catholic|protestant|gereja|church|chapel/.test(haystack)) return "church";
    if (/buddhist|hindu|temple|vihara|pura|kelenteng|klenteng/.test(haystack)) return "temple";
  }
  return kind;
}

function poiPriority(kind: PoiKind, tags: Record<string, string>): number {
  const base: Record<PoiKind, number> = {
    hospital: 86, police: 82, fuel: 78, terminal: 76, station: 76, campus: 72,
    school: 68, worship: 64, mall: 62, pharmacy: 58, bank: 56, atm: 52,
    market: 48, restaurant: 44, hotel: 44, shelter: 42, park: 38, office: 36,
    parking: 34, transport: 34, cemetery: 30, monument: 30, other: 18,
  };
  const named = tags.name || tags.official_name || tags.brand || tags.operator ? 18 : 0;
  const popular = tags.website || tags.phone || tags.opening_hours ? 8 : 0;
  return clamp((base[kind] || 20) + named + popular, 10, 100);
}

function poiMinZoom(priority: number, kind: PoiKind): number {
  if (priority >= 90) return 12.2;
  if (priority >= 76) return 13.1;
  if (priority >= 60) return 14.2;
  if (kind === "atm" || kind === "shelter" || kind === "restaurant") return 16;
  return priority >= 42 ? 15.1 : 16.5;
}

function titleShort(title: string, max = 18): string {
  const clean = title.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}...`;
}

function makePoiFromOverpass(el: any): PoiRecord | null {
  const tags = (el.tags || {}) as Record<string, string>;
  const lat = el.type === "node" ? Number(el.lat) : Number(el.center?.lat);
  const lng = el.type === "node" ? Number(el.lon) : Number(el.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const kind = classifyPoiKind(tags);
  const name = tags.name || tags.official_name || tags.brand || tags.operator || tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.railway || "POI";
  const visualKey = inferVisualKey(tags, kind, name);
  const visual = visualFor(visualKey);
  const priority = poiPriority(kind, tags);
  const address = [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]].filter(Boolean).join(" ");
  const lib = POI_IMAGES[kind];
  return {
    id: `osm-${el.type}-${el.id}`,
    kind,
    visualKey,
    title: name,
    description: tags.description || tags.note || lib.description,
    address,
    imageUrl: tags.image || lib.imageUrl,
    rating: lib.rating,
    icon: visual.icon,
    color: visual.color,
    priority,
    minZoom: poiMinZoom(priority, kind),
    osmType: el.type,
    osmId: el.id,
    tags,
    lat,
    lng,
  };
}

function mapBoundsBBox(): string {
  const b = state.map.getBounds();
  return `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
}

async function fetchPois(): Promise<void> {
  if (!state.mapReady) return;
  const bbox = mapBoundsBBox();
  const q = `
    [out:json][timeout:16];
    (
      node["amenity"](${bbox}); way["amenity"](${bbox}); relation["amenity"](${bbox});
      node["shop"](${bbox}); way["shop"](${bbox}); relation["shop"](${bbox});
      node["tourism"](${bbox}); way["tourism"](${bbox}); relation["tourism"](${bbox});
      node["leisure"](${bbox}); way["leisure"](${bbox}); relation["leisure"](${bbox});
      node["historic"](${bbox}); way["historic"](${bbox}); relation["historic"](${bbox});
      node["office"](${bbox}); way["office"](${bbox}); relation["office"](${bbox});
      node["public_transport"](${bbox}); way["public_transport"](${bbox}); relation["public_transport"](${bbox});
      node["railway"](${bbox}); way["railway"](${bbox}); relation["railway"](${bbox});
      node["highway"="bus_stop"](${bbox}); way["highway"="bus_stop"](${bbox}); relation["highway"="bus_stop"](${bbox});
    );
    out center tags 650;
  `;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: q,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    const pois = (Array.isArray(data.elements) ? data.elements : [])
      .map(makePoiFromOverpass)
      .filter(Boolean) as PoiRecord[];
    if (pois.length) {
      state.pois.clear();
      pois.forEach((poi) => state.pois.set(poi.id, poi));
    }
    syncPoiSource();
    updatePoiCounter();
  } catch (err) {
    console.warn("Overpass failed, keeping previous POIs", err);
    if (!state.pois.size) seedFallbackPois();
    syncPoiSource();
    updatePoiCounter();
  }
}

function seedFallbackPois(): void {
  const samples = [
    { kind: "worship" as PoiKind, visualKey: "mosque", title: "Masjid RW 10", lat: -6.161636, lng: 106.575853 },
    { kind: "hospital" as PoiKind, visualKey: "hospital", title: "Puskesmas Terdekat", lat: -6.1589, lng: 106.5769 },
    { kind: "mall" as PoiKind, visualKey: "mall", title: "Pusat Perbelanjaan", lat: -6.161822, lng: 106.576977 },
    { kind: "school" as PoiKind, visualKey: "school", title: "Sekolah Terdekat", lat: -6.1629, lng: 106.5748 },
  ];
  samples.forEach((sample, index) => {
    const lib = POI_IMAGES[sample.kind];
    const visual = visualFor(sample.visualKey);
    const priority = poiPriority(sample.kind, { name: sample.title });
    state.pois.set(`fallback-${index}`, {
      id: `fallback-${index}`,
      kind: sample.kind,
      visualKey: sample.visualKey,
      title: sample.title,
      description: lib.description,
      address: "",
      imageUrl: lib.imageUrl,
      rating: lib.rating,
      icon: visual.icon,
      color: visual.color,
      priority,
      minZoom: poiMinZoom(priority, sample.kind),
      tags: { name: sample.title },
      lat: sample.lat,
      lng: sample.lng,
    });
  });
}

function updatePoiCounter(): void {
  const el = document.querySelector<HTMLElement>("[data-field=poi-count]");
  if (el) el.textContent = `${state.pois.size} POI custom`;
}

function visiblePois(): PoiRecord[] {
  const zoom = state.map?.getZoom?.() ?? 15;
  const limit = zoom >= 17 ? 520 : zoom >= 15 ? 360 : 180;
  return [...state.pois.values()]
    .filter((poi) => zoom + 0.05 >= poi.minZoom)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

function mapStyleForMode(mode: BaseMapMode): any {
  return mode === "satellite" ? SATELLITE_STYLE : STREET_STYLE;
}

function ensureMapLayers(): void {
  if (!state.map) return;
  const map = state.map;
  try {
    const style = map.getStyle();
    if (style?.layers) {
      style.layers.forEach((layer: any) => {
        const id = String(layer.id || "");
        const sourceLayer = String(layer["source-layer"] || "");
        const hideBuiltInPoi = layer.type === "symbol" && (sourceLayer === "poi" || sourceLayer === "aerodrome_label" || /\bpoi\b/i.test(id));
        if (hideBuiltInPoi) map.setLayoutProperty(id, "visibility", "none");
        if (state.mode !== "satellite") tuneStreetLayer(map, layer);
      });
    }
    if (!map.getSource("poi-source")) {
      map.addSource("poi-source", { type: "geojson", data: emptyFeatureCollection() });
    }
    if (!map.getSource("route-source")) {
      map.addSource("route-source", { type: "geojson", data: emptyFeatureCollection() });
    }
    addRouteLayers(map);
    addPoiLayers(map);
    syncPoiSource();
    syncRouteSource();
  } catch (err) {
    console.warn("Map layer setup failed", err);
  }
}

function tuneStreetLayer(map: any, layer: any): void {
  const id = String(layer.id || "");
  const sourceLayer = String(layer["source-layer"] || "");
  try {
    if (layer.type === "background") map.setPaintProperty(id, "background-color", "#eef3f6");
    if (sourceLayer === "landuse" && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", ["match", ["get", "class"], "hospital", "#f7d9d8", "school", "#f7edc7", "residential", "#e9f2ed", "commercial", "#f1e6d6", "industrial", "#e6e2ec", "#edf2f5"]);
      map.setPaintProperty(id, "fill-opacity", 0.9);
    }
    if ((sourceLayer === "landcover" || sourceLayer === "park") && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", ["match", ["get", "class"], "grass", "#d7ecd3", "wood", "#c2dfbf", "#dfeeda"]);
      map.setPaintProperty(id, "fill-opacity", 0.92);
    }
    if (sourceLayer === "water" && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", "#8ec8e8");
      map.setPaintProperty(id, "fill-opacity", 0.94);
    }
    if (sourceLayer === "transportation" && layer.type === "line") {
      map.setPaintProperty(id, "line-color", ["match", ["get", "class"], "motorway", "#f2bc5d", "trunk", "#f2bc5d", "primary", "#ffffff", "secondary", "#ffffff", "tertiary", "#ffffff", "#fbfcfe"]);
      map.setPaintProperty(id, "line-opacity", 0.98);
    }
    if (layer.type === "fill-extrusion" || id.includes("building")) {
      map.setPaintProperty(id, "fill-extrusion-color", ["interpolate", ["linear"], ["to-number", ["coalesce", ["get", "render_height"], ["get", "height"], 0]], 0, "#eef2f6", 18, "#dde7ee", 55, "#cbd8e5", 100, "#b8c8d8"]);
      map.setPaintProperty(id, "fill-extrusion-opacity", 0.86);
    }
    if ((sourceLayer === "building" || id.includes("building")) && layer.type === "fill") {
      map.setPaintProperty(id, "fill-color", "#dfe7ed");
      map.setPaintProperty(id, "fill-opacity", 0.76);
    }
  } catch {
    /* ignore optional paint mismatches */
  }
}

function addRouteLayers(map: any): void {
  if (!map.getLayer("route-glow")) {
    map.addLayer({
      id: "route-glow",
      type: "line",
      source: "route-source",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#18b981", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 6, 18, 18], "line-blur": 10, "line-opacity": 0.24 },
    });
  }
  if (!map.getLayer("route-line")) {
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-source",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#16a36c", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3, 18, 11], "line-opacity": 0.92 },
    });
  }
}

function addPoiLayers(map: any): void {
  if (!map.getLayer("poi-hitbox")) {
    map.addLayer({ id: "poi-hitbox", type: "circle", source: "poi-source", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 14, 17, 22], "circle-color": "#000", "circle-opacity": 0.01 } });
  }
  if (!map.getLayer("poi-dot")) {
    map.addLayer({
      id: "poi-dot",
      type: "circle",
      source: "poi-source",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 5, 17, 9, 19, 12],
        "circle-color": ["coalesce", ["get", "color"], "#2563eb"],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 0.96,
      },
    });
  }
  if (!map.getLayer("poi-label")) {
    map.addLayer({
      id: "poi-label",
      type: "symbol",
      source: "poi-source",
      layout: {
        "text-field": ["format", ["coalesce", ["get", "icon"], "i"], { "font-scale": 0.86 }, "\n", {}, ["coalesce", ["get", "titleShort"], ""], { "font-scale": 0.68 }],
        "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 9, 17, 12, 19, 15],
        "text-offset": [0, 1.08],
        "text-anchor": "top",
        "text-allow-overlap": false,
        "text-ignore-placement": false,
        "text-pitch-alignment": "viewport",
        "text-rotation-alignment": "viewport",
      },
      paint: {
        "text-color": "#0f2340",
        "text-halo-color": "rgba(255,255,255,0.96)",
        "text-halo-width": 1.4,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.2, 15, 0.78, 17, 1],
      },
    });
  }
}

function emptyFeatureCollection(): any {
  return { type: "FeatureCollection", features: [] };
}

function syncPoiSource(): void {
  const source = state.map?.getSource?.("poi-source");
  const features = visiblePois().map((poi) => ({
    type: "Feature",
    properties: {
      id: poi.id,
      title: poi.title,
      titleShort: titleShort(poi.title, 18),
      kind: poi.kind,
      visualKey: poi.visualKey,
      icon: poi.icon,
      color: poi.color,
      priority: poi.priority,
    },
    geometry: { type: "Point", coordinates: [poi.lng, poi.lat] },
  }));
  if (source?.setData) source.setData({ type: "FeatureCollection", features });
  syncHtmlPoiLayer();
}

function syncHtmlPoiLayer(): void {
  const layer = document.querySelector<HTMLElement>(".html-poi-layer");
  if (!layer || !state.mapReady || !state.map) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const buttons = visiblePois().map((poi) => {
    const point = state.map.project([poi.lng, poi.lat]);
    if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) return "";
    const label = state.map.getZoom() >= 16 ? `<span>${esc(titleShort(poi.title, 18))}</span>` : "";
    return `
      <button class="html-poi" data-poi="${esc(poi.id)}" style="left:${point.x}px;top:${point.y}px;--accent:${poi.color}">
        <b>${esc(poi.icon)}</b>${label}
      </button>
    `;
  }).join("");
  layer.innerHTML = buttons;
  layer.querySelectorAll<HTMLButtonElement>("[data-poi]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const poi = state.pois.get(btn.dataset.poi || "");
      if (poi) renderDetail(poi);
    });
  });
}

function syncRouteSource(): void {
  const source = state.map?.getSource?.("route-source");
  if (!source?.setData) return;
  const features = state.routeGeometry.length >= 2
    ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: state.routeGeometry.map((p) => [p.lng, p.lat]) } }]
    : [];
  source.setData({ type: "FeatureCollection", features });
}

async function setBaseMap(mode: BaseMapMode): Promise<void> {
  if (!state.map || state.mode === mode) return;
  state.mode = mode;
  document.body.dataset.mapMode = mode;
  document.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
  state.map.setStyle(mapStyleForMode(mode));
  await new Promise<void>((resolve) => {
    state.map.once("styledata", () => {
      ensureMapLayers();
      resolve();
    });
  });
  const pitch = mode === "3d" ? 66 : 0;
  const zoom = mode === "3d" ? Math.max(state.map.getZoom(), 17.2) : state.map.getZoom();
  state.map.easeTo({ pitch, zoom, bearing: mode === "3d" ? state.map.getBearing() : 0, duration: 650 });
}

function queryPoiAtPoint(point: { x: number; y: number }): PoiRecord | null {
  if (!state.map) return null;
  const features = state.map.queryRenderedFeatures(
    [[point.x - 14, point.y - 14], [point.x + 14, point.y + 14]],
    { layers: ["poi-hitbox", "poi-dot", "poi-label"] },
  );
  const id = features?.sort((a: any, b: any) => Number(b.properties?.priority || 0) - Number(a.properties?.priority || 0))[0]?.properties?.id;
  return id ? state.pois.get(String(id)) || null : null;
}

function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6371000;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingTo(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const y = Math.sin((bLng - aLng) * Math.PI / 180) * Math.cos(bLat * Math.PI / 180);
  const x = Math.cos(aLat * Math.PI / 180) * Math.sin(bLat * Math.PI / 180)
    - Math.sin(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.cos((bLng - aLng) * Math.PI / 180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function angleDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 9500 ? 0 : 1)} km` : `${Math.round(meters)} m`;
}

function renderDetail(poi: PoiRecord): void {
  state.selectedPoi = poi;
  const panel = document.querySelector<HTMLElement>("[data-field=detail-panel]");
  if (!panel) return;
  const dist = distanceMeters(state.currentPos.lat, state.currentPos.lng, poi.lat, poi.lng);
  panel.classList.add("open");
  panel.innerHTML = `
    <button class="panel-close" type="button">x</button>
    <div class="poi-sheet">
      <img class="poi-hero" src="${esc(poi.imageUrl)}" alt="${esc(poi.title)}" loading="lazy" referrerpolicy="no-referrer">
      <div class="poi-badges">
        <span style="--accent:${poi.color}">${esc(visualFor(poi.visualKey).label)}</span>
        <span>Star ${esc(poi.rating)}</span>
      </div>
      <h1>${esc(poi.title)}</h1>
      <p>${esc(poi.description)}</p>
      <div class="poi-actions">
        <button class="btn-share" type="button">Share</button>
        <button class="btn-start" type="button">Pergi</button>
      </div>
      <div class="poi-facts">
        <div><span>Jarak</span><strong>${formatDistance(dist)}</strong></div>
        <div><span>Kategori</span><strong>${esc(poi.kind)}</strong></div>
        <div><span>Koordinat</span><strong>${poi.lat.toFixed(6)}, ${poi.lng.toFixed(6)}</strong></div>
      </div>
      <div class="route-steps" data-field="route-steps"></div>
    </div>
  `;
  panel.querySelector<HTMLButtonElement>(".panel-close")?.addEventListener("click", () => panel.classList.remove("open"));
  panel.querySelector<HTMLButtonElement>(".btn-share")?.addEventListener("click", async () => {
    const url = `https://www.openstreetmap.org/?mlat=${poi.lat}&mlon=${poi.lng}#map=18/${poi.lat}/${poi.lng}`;
    if (navigator.share) await navigator.share({ title: poi.title, url }).catch(() => undefined);
    else await navigator.clipboard.writeText(url).catch(() => undefined);
  });
  panel.querySelector<HTMLButtonElement>(".btn-start")?.addEventListener("click", async () => {
    await setDestination(poi);
    if (isMobile() || isTablet()) void openAr();
  });
}

function instructionFromOsrm(step: any): string {
  const m = step?.maneuver || {};
  const modifier = String(m.modifier || "");
  const type = String(m.type || "");
  if (type === "arrive") return "Tiba di tujuan";
  if (type === "depart") return "Mulai";
  if (modifier.includes("right")) return "Belok kanan";
  if (modifier.includes("left")) return "Belok kiri";
  if (modifier.includes("straight")) return "Lurus";
  return step?.name ? `Ikuti ${step.name}` : "Lanjut";
}

async function setDestination(poi: PoiRecord): Promise<void> {
  state.selectedPoi = poi;
  const from = state.currentPos;
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${poi.lng},${poi.lat}?overview=full&steps=true&geometries=geojson`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("OSRM failed");
    const data = await res.json();
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates || [];
    state.routeGeometry = coords.map(([lng, lat]: [number, number]) => ({ lat, lng }));
    state.routeDistance = Number(route?.distance || 0);
    state.routeDuration = Number(route?.duration || 0);
    state.routeSteps = (route?.legs?.[0]?.steps || []).map((step: any) => ({
      instruction: instructionFromOsrm(step),
      distance: Number(step.distance || 0),
      modifier: String(step.maneuver?.modifier || ""),
      bearingAfter: Number(step.maneuver?.bearing_after || NaN),
    }));
  } catch {
    const dist = distanceMeters(from.lat, from.lng, poi.lat, poi.lng);
    state.routeGeometry = [from, { lat: poi.lat, lng: poi.lng }];
    state.routeDistance = dist;
    state.routeDuration = dist / 8;
    state.routeSteps = [{ instruction: "Lurus ke tujuan", distance: dist, bearingAfter: bearingTo(from.lat, from.lng, poi.lat, poi.lng) }];
  }
  syncRouteSource();
  updateNavigationHud();
  state.map.fitBounds([[from.lng, from.lat], [poi.lng, poi.lat]], { padding: 96, duration: 650 });
  const stepsEl = document.querySelector<HTMLElement>("[data-field=route-steps]");
  if (stepsEl) {
    stepsEl.innerHTML = `<strong>Rute:</strong><ol>${state.routeSteps.slice(0, 6).map((s) => `<li>${esc(s.instruction)} (${formatDistance(s.distance)})</li>`).join("")}</ol>`;
  }
}

function updateNavigationHud(): void {
  const distance = document.querySelector<HTMLElement>("[data-field=turn-distance]");
  const road = document.querySelector<HTMLElement>("[data-field=turn-road]");
  const icon = document.querySelector<HTMLElement>("[data-field=turn-icon]");
  if (!distance || !road || !icon) return;
  if (!state.selectedPoi || !state.routeGeometry.length) {
    distance.textContent = "Pilih tujuan";
    road.textContent = "POI custom dari OpenStreetMap";
    icon.textContent = "->";
    return;
  }
  const next = state.routeSteps[0];
  distance.textContent = `${formatDistance(next?.distance || state.routeDistance)}`;
  road.textContent = `${next?.instruction || "Lurus"} menuju ${state.selectedPoi.title}`;
  icon.textContent = next?.modifier?.includes("right") ? "R" : next?.modifier?.includes("left") ? "L" : "^";
}

function arCategory(label: string): ArCategory {
  const key = label.toLowerCase();
  if (/person/.test(key)) return "person";
  if (/car|truck|bus|motorcycle|bicycle|vehicle/.test(key)) return "vehicle";
  if (/plant|tree|flower|potted|vase/.test(key)) return "plant";
  if (/traffic light|stop sign/.test(key)) return "traffic";
  if (/road|street|sidewalk|crosswalk/.test(key)) return "road";
  return "other";
}

function avatarMarkup(category: ArCategory, label: string): string {
  const vehicle = /motorcycle|bicycle/.test(label.toLowerCase()) ? "motor" : /bus/.test(label.toLowerCase()) ? "bus" : /truck/.test(label.toLowerCase()) ? "truck" : "car";
  if (category === "person") return `<div class="avatar avatar-person"><i class="head"></i><i class="torso"></i><i class="arm a1"></i><i class="arm a2"></i><i class="leg l1"></i><i class="leg l2"></i></div>`;
  if (category === "vehicle") return `<div class="avatar avatar-vehicle avatar-${vehicle}"><i class="roof"></i><i class="body"></i><i class="win"></i><i class="wheel w1"></i><i class="wheel w2"></i></div>`;
  if (category === "plant") return `<div class="avatar avatar-plant"><i class="leaf main"></i><i class="leaf left"></i><i class="leaf right"></i><i class="stem"></i></div>`;
  if (category === "traffic") return `<div class="avatar avatar-traffic"><i class="pole"></i><i class="box"><b></b><b></b><b></b></i></div>`;
  if (category === "road") return `<div class="avatar avatar-road"><i></i><b></b></div>`;
  return `<div class="avatar avatar-other"><i></i></div>`;
}

function estimateObjectDistance(label: string, bbox: [number, number, number, number], video: HTMLVideoElement): number {
  const [, , w, h] = bbox;
  const vh = Math.max(video.videoHeight, 1);
  const vw = Math.max(video.videoWidth, 1);
  const key = label.toLowerCase();
  const realHeight = /person/.test(key) ? 1.65 : /car|truck|bus|motorcycle|bicycle/.test(key) ? 1.35 : /plant|tree|potted/.test(key) ? 0.9 : 1;
  const heightRatio = clamp(h / vh, 0.02, 1.2);
  const widthRatio = clamp(w / vw, 0.02, 1.2);
  const byHeight = (realHeight * 0.72) / heightRatio;
  const byWidth = (/car|truck|bus/.test(key) ? 1.8 : realHeight * 0.55) * 0.62 / widthRatio;
  return clamp(Math.min(byHeight, byWidth * 1.12), 0.35, 80);
}

async function loadDetector(): Promise<any | null> {
  try {
    if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
    if (!window.cocoSsd) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd");
    return await window.cocoSsd.load();
  } catch (err) {
    console.warn("Detector load failed", err);
    return null;
  }
}

function renderArPois(layer: HTMLElement): void {
  if (!state.arRunning) return;
  const target = state.selectedPoi;
  const pois = [...state.pois.values()].filter((poi) => poi.id !== target?.id);
  const cards: string[] = [];
  const heading = state.hasLiveHeading ? state.heading : state.map?.getBearing?.() || 0;
  const fov = 82;
  for (const poi of pois) {
    const dist = distanceMeters(state.currentPos.lat, state.currentPos.lng, poi.lat, poi.lng);
    if (dist > 1400) continue;
    const bearing = bearingTo(state.currentPos.lat, state.currentPos.lng, poi.lat, poi.lng);
    const delta = angleDelta(heading, bearing);
    if (Math.abs(delta) > fov / 2) continue;
    const x = clamp(50 + (delta / (fov / 2)) * 44, 6, 94);
    const y = clamp(62 - Math.log10(Math.max(dist, 4)) * 16, 18, 66);
    const scale = clamp(1.04 - dist / 2200, 0.78, 1.04);
    cards.push(`
      <button class="ar-poi-card" style="left:${x}%;top:${y}%;transform:translate(-50%,-50%) scale(${scale});--accent:${poi.color}" data-poi="${esc(poi.id)}">
        <span>${esc(poi.icon)}</span><strong>${esc(titleShort(poi.title, 16))}</strong><em>${formatDistance(dist)}</em>
      </button>
    `);
  }
  layer.innerHTML = cards.join("");
  layer.querySelectorAll<HTMLButtonElement>("[data-poi]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const poi = state.pois.get(btn.dataset.poi || "");
      if (poi) renderDetail(poi);
    });
  });
}

function renderArRoute(): void {
  const corridor = document.querySelector<HTMLElement>("[data-field=ar-route-corridor]");
  const pip = document.querySelector<HTMLElement>("[data-field=pip-distance]");
  if (!corridor) return;
  const hasRoute = state.routeGeometry.length >= 2 && Boolean(state.selectedPoi);
  corridor.classList.toggle("is-hidden", !hasRoute);
  if (hasRoute && state.selectedPoi) {
    const bearing = bearingTo(state.currentPos.lat, state.currentPos.lng, state.selectedPoi.lat, state.selectedPoi.lng);
    const delta = angleDelta(state.heading, bearing);
    corridor.style.transform = `translateX(calc(-50% + ${clamp(delta, -38, 38)}px)) rotate(${clamp(delta * 0.35, -18, 18)}deg)`;
    if (pip) pip.textContent = formatDistance(distanceMeters(state.currentPos.lat, state.currentPos.lng, state.selectedPoi.lat, state.selectedPoi.lng));
  }
}

async function openAr(): Promise<void> {
  const overlay = document.querySelector<HTMLElement>("#ar-view");
  const video = overlay?.querySelector<HTMLVideoElement>(".ar-video");
  const poiLayer = overlay?.querySelector<HTMLElement>(".ar-poi-layer");
  const objectLayer = overlay?.querySelector<HTMLElement>(".ar-object-layer");
  const pip = overlay?.querySelector<HTMLElement>("[data-field=ar-pip]");
  const pipRestore = overlay?.querySelector<HTMLButtonElement>("[data-field=pip-restore]");
  if (!overlay || !video || !poiLayer || !objectLayer || !pip || !pipRestore) return;
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  state.arRunning = true;
  try {
    state.arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    video.srcObject = state.arStream;
    await video.play();
  } catch {
    objectLayer.innerHTML = `<div class="ar-error">Kamera tidak bisa dibuka.</div>`;
  }
  if (!state.detector) state.detector = await loadDetector();
  let touchX = 0;
  pip.addEventListener("touchstart", (ev) => { touchX = ev.touches[0]?.clientX || 0; }, { passive: true });
  pip.addEventListener("touchend", (ev) => {
    const end = ev.changedTouches[0]?.clientX || touchX;
    if (end - touchX > 42) overlay.classList.add("pip-hidden");
  }, { passive: true });
  pipRestore.addEventListener("click", () => overlay.classList.remove("pip-hidden"));
  const close = overlay.querySelector<HTMLButtonElement>("[data-action=close]");
  close?.addEventListener("click", closeAr, { once: true });
  overlay.querySelector<HTMLButtonElement>("[data-action=swap]")?.addEventListener("click", () => {
    closeAr();
    state.map?.resize?.();
  }, { once: true });
  const loop = async (): Promise<void> => {
    if (!state.arRunning) return;
    renderArPois(poiLayer);
    renderArRoute();
    if (state.detector && video.videoWidth > 0) {
      try {
        const preds = await state.detector.detect(video) as Array<{ bbox: [number, number, number, number]; class: string; score: number }>;
        objectLayer.innerHTML = preds.slice(0, 10).filter((p) => p.score > 0.32).map((p) => {
          const category = arCategory(p.class);
          const [x, y, w, h] = p.bbox;
          const cx = ((x + w / 2) / Math.max(video.videoWidth, 1)) * 100;
          const cy = ((y + h / 2) / Math.max(video.videoHeight, 1)) * 100;
          const bw = clamp((w / Math.max(video.videoWidth, 1)) * 100, 12, 42);
          const bh = clamp((h / Math.max(video.videoHeight, 1)) * 100, 12, 54);
          const dist = estimateObjectDistance(p.class, p.bbox, video);
          return `
            <div class="ar-object-card ar-object-${category}" style="left:${cx}%;top:${cy}%;width:${bw}%;height:${bh}%">
              ${avatarMarkup(category, p.class)}
              <div class="ar-object-tag"><strong>${esc(p.class)}</strong><span>${formatDistance(dist)} - ${Math.round(p.score * 100)}%</span></div>
            </div>
          `;
        }).join("");
      } catch (err) {
        console.warn("Detect failed", err);
      }
    }
    window.setTimeout(loop, 420);
  };
  void loop();
}

function closeAr(): void {
  const overlay = document.querySelector<HTMLElement>("#ar-view");
  state.arRunning = false;
  state.arStream?.getTracks().forEach((track) => track.stop());
  state.arStream = null;
  overlay?.classList.remove("open", "pip-hidden");
  overlay?.setAttribute("aria-hidden", "true");
}

async function initMap(): Promise<void> {
  await loadMapLibre();
  const map = new window.maplibregl.Map({
    container: "map",
    style: mapStyleForMode(isTablet() ? "3d" : "street"),
    center: [DEFAULT_CENTER.lng, DEFAULT_CENTER.lat],
    zoom: isTablet() ? 17.2 : isMobile() ? 15.6 : 15.9,
    pitch: isTablet() ? 66 : 0,
    bearing: 0,
    attributionControl: false,
  });
  state.map = map;
  state.mode = isTablet() ? "3d" : "street";
  document.body.dataset.mapMode = state.mode;
  map.addControl(new window.maplibregl.AttributionControl({ compact: true }), "bottom-right");
  map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.on("load", () => {
    state.mapReady = true;
    ensureMapLayers();
    seedFallbackPois();
    syncPoiSource();
    updatePoiCounter();
    void fetchPois();
  });
  map.on("move", syncHtmlPoiLayer);
  map.on("zoom", syncHtmlPoiLayer);
  map.on("moveend", () => {
    syncHtmlPoiLayer();
    void fetchPois();
  });
  map.on("zoomend", syncPoiSource);
  map.on("click", (ev: any) => {
    const poi = queryPoiAtPoint(ev.point);
    if (poi) renderDetail(poi);
  });
  document.querySelectorAll<HTMLButtonElement>(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === state.mode);
    btn.addEventListener("click", () => void setBaseMap((btn.dataset.mode || "street") as BaseMapMode));
  });
  document.querySelector<HTMLButtonElement>(".ar-launch")?.addEventListener("click", () => void openAr());
  document.querySelector<HTMLButtonElement>(".panel-close")?.addEventListener("click", () => document.querySelector(".detail-panel")?.classList.remove("open"));
}

function watchUserPosition(): void {
  navigator.geolocation?.getCurrentPosition((pos) => {
    state.currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  }, undefined, { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 });
  navigator.geolocation?.watchPosition((pos) => {
    state.currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (Number.isFinite(pos.coords.heading || NaN)) {
      state.heading = Number(pos.coords.heading);
      state.hasLiveHeading = true;
    }
  }, undefined, { enableHighAccuracy: true, maximumAge: 500, timeout: 12000 });
  const onOrientation = (ev: DeviceOrientationEvent): void => {
    const webkitHeading = (ev as any).webkitCompassHeading;
    if (typeof webkitHeading === "number") {
      state.heading = webkitHeading;
      state.hasLiveHeading = true;
    } else if (typeof ev.alpha === "number") {
      state.heading = (360 - ev.alpha + 360) % 360;
      state.hasLiveHeading = true;
    }
  };
  window.addEventListener("deviceorientationabsolute", onOrientation, true);
  window.addEventListener("deviceorientation", onOrientation, true);
}

watchUserPosition();
void initMap();
