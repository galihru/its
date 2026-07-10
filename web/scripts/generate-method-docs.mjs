import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const publicRoot = path.join(webRoot, "public");
const methodRoot = path.join(publicRoot, "method");
const methodAssetsRoot = path.join(methodRoot, "assets");
const privacyAssetsRoot = path.join(publicRoot, "privacy", "assets");
const docsRoot = path.join(publicRoot, "documentation");
const licenceRoot = path.join(publicRoot, "licence");
const licenseRoot = path.join(publicRoot, "license");

const site = {
  title: "ITS Maps",
  url: "https://itstelkom.web.app",
  github: "https://github.com/hanifasepthi/its",
  developer: "Hanifa Septhi Larasati",
  publisher: "Hanifa Teams",
  androidApk: "https://itstelkom.web.app/artifacts/apps/ITS-Maps-Android-1.0.36.apk.b64",
  androidApkDirect: "https://github.com/hanifasepthi/its/releases/download/its-maps-android-1.0.36/ITS-Maps-Android-1.0.36.apk",
  storeId: "9MWFGGW3FD2C",
  storeProtocol: "ms-windows-store://pdp/?productid=9MWFGGW3FD2C",
  date: "10 July 2026",
};

const sourceGroups = {
  webapp: [
    "web/src/main.ts",
    "web/src/browserRfDetr.ts",
    "web/src/browserRfDetrWorker.ts",
    "web/src/lockScreenDetector.ts",
    "web/src/style.css",
    "web/sw.js",
    "web/public/sw.js",
    "web/firebase.json",
    "web/database.rules.json",
    "web/vite.config.ts",
    "web/index.html",
  ],
  android: [
    "web/android/app/src/main/AndroidManifest.xml",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/MainActivity.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/WidgetRealtimeService.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/ChartWidgetProvider.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/TrafficDetectionWidgetProvider.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/MapsWidgetProvider.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/AlertFullDataWidgetProvider.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/LockScreenDashboardActivity.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/LockScreenRenderer.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/LockScreenPreferences.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/ItsNotificationListenerService.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/IndonesianObjectLabels.java",
    "web/android/app/src/main/java/id/ac/telkomuniversity/its/WidgetBootReceiver.java",
    "web/android/app/src/main/res/layout/widget_alert_full_data.xml",
    "web/android/app/src/main/res/layout/widget_maps.xml",
    "web/android/app/src/main/res/xml/widget_alert_full_data_info.xml",
    "web/android/app/src/main/res/xml/widget_maps_info.xml",
    "web/android/app/src/main/res/xml/widget_traffic_detection_info.xml",
    "web/android/app/build.gradle",
    "web/capacitor.config.json",
  ],
  windows: [
    "web/package.json",
    "web/src/windows.ts",
    "web/electron/main.cjs",
    "web/electron/preload.cjs",
    "web/windows.html",
    "web/windows-widgets/ItsMapsWidgetProvider/Program.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/WidgetProvider.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/WidgetImplBase.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/ItsWidget.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/ItsWidgetDataService.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/ItsWidgetMediaRenderer.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/ItsWidgetIconRenderer.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/ItsLockScreenStatusUpdater.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/WidgetDiagnostics.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/WidgetHelper/RegistrationManager.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/WidgetHelper/WidgetProviderFactory.cs",
    "web/windows-widgets/ItsMapsWidgetProvider/Package.appxmanifest",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/TrafficWidgetTemplate.json",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/AiWidgetTemplate.json",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/MapWidgetTemplate.json",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/DataWidgetTemplate.json",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/DataMonitorWidgetTemplate.json",
    "web/windows-widgets/ItsMapsWidgetProvider/Templates/DataAlertWidgetTemplate.json",
    "web/scripts/build-windows-msix-with-widgets.ps1",
    "web/scripts/generate-transparent-windows-assets.ps1",
    "web/scripts/appx-manifest-created.cjs",
    "web/scripts/after-pack-windows.cjs",
  ],
  controller: [
    "controller/Main.scala",
    "controller/MainWithGpio.scala",
    "controller/TrafficLight.scala",
    "controller/YoloDetector.scala",
    "controller/camera-gateway.py",
    "controller/camera-public-proxy.py",
    "controller/gps-init-ublox.py",
    "controller/webrtc-camera.py",
    "controller/run-controller-public.sh",
    "controller/install-controller-files.sh",
    "controller/update-controller.sh",
    "controller/its-heartbeat-agent.sh",
    "controller/mediamtx.yml",
    "controller/its-controller.service",
    "controller/its-heartbeat-agent.service",
    "controller/its-controller-update.service",
  ],
};

const platformMeta = {
  webapp: {
    label: "WebApp",
    slug: "webapp",
    eyebrow: "Firebase Hosting / PWA",
    heading: "Metode WebApp ITS Maps",
    summary: "Halaman ini membedah renderer TypeScript, service worker, Firebase rules, dan pipeline AI browser RF-DETR yang menjadi basis website dan PWA.",
    icon: "🌐",
    heroImage: "/method/assets/thumbnail.png",
  },
  android: {
    label: "Android APK",
    slug: "android",
    eyebrow: "Capacitor + Java Native Widgets",
    heading: "Metode Android APK ITS Maps",
    summary: "Halaman ini menjelaskan APK, native widget Android, lock-screen dashboard, service RTDB, layout XML, dan integrasi icon/widget.",
    icon: "📱",
    heroImage: "/method/assets/widgetDataLengkapITS.png",
  },
  windows: {
    label: "Microsoft Store / Windows",
    slug: "windows",
    eyebrow: "Electron + MSIX + Windows Widgets",
    heading: "Metode Windows ITS Maps",
    summary: "Halaman ini membedah Microsoft Store app, Electron runtime, C# Windows Widget Provider, Adaptive Card templates, media renderer, dan identitas MSIX.",
    icon: "🪟",
    heroImage: "/method/assets/widgetPetaITS.png",
  },
};

const copiedAssets = [
  ["web/src/app/thumbnail.png", "thumbnail.png"],
  ["web/src/app/widgetITSLive.png", "widgetITSLive.png"],
  ["web/src/app/widgetITSKameraAI.png", "widgetITSKameraAI.png"],
  ["web/src/app/widgetPetaITS.png", "widgetPetaITS.png"],
  ["web/src/app/widgetDataLengkapITS.png", "widgetDataLengkapITS.png"],
  ["web/src/app/widgetlockscreen(bagian 1).png", "widgetLockscreen.png"],
  ["web/src/ss/mobile/aset2.png", "mobile-map.png"],
  ["web/src/ss/mobile/aset3.png", "mobile-ai.png"],
  ["web/src/ss/windows/aset1.png", "windows-home.png"],
  ["web/src/ss/windows/aset2.png", "windows-map.png"],
  ["web/src/ss/windows/aset3.png", "windows-ai.png"],
  ["web/public/its.png", "its.png"],
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(fromRel, toDir, toName) {
  const src = path.join(repoRoot, fromRel);
  if (!fs.existsSync(src)) return;
  ensureDir(toDir);
  fs.copyFileSync(src, path.join(toDir, toName));
}

function copyAssets() {
  for (const [from, to] of copiedAssets) copyIfExists(from, methodAssetsRoot, to);
  for (let i = 1; i <= 10; i += 1) copyIfExists(`web/img/privacy/${i}.png`, privacyAssetsRoot, `${i}.png`);
  copyIfExists("web/FTE-CD-6.docx", path.join(publicRoot, "docs"), "FTE-CD-6.docx");
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function relPath(file) {
  return file.replaceAll("\\", "/");
}

function readSource(rel) {
  const absolute = path.join(repoRoot, rel);
  if (!fs.existsSync(absolute)) return null;
  const text = fs.readFileSync(absolute, "utf8").replace(/\r\n/g, "\n");
  return {
    rel: relPath(rel),
    text,
    lines: text.split("\n"),
  };
}

function classifyLine(line, number, file) {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return "Baris kosong yang memisahkan blok agar struktur kode lebih mudah dibaca.";
  if (/^\/\*|^\*|^\/\/|^#|^<!--/.test(trimmed)) return "Komentar/dokumentasi internal; tidak dieksekusi langsung tetapi menjelaskan maksud blok di sekitarnya.";
  if (/^import\s|^using\s|^package\s|^from\s.+import/.test(trimmed)) return "Memuat dependency, namespace, atau aset yang diperlukan sebelum logika utama berjalan.";
  if (/^export\s+(type|interface)|^type\s|^interface\s|^record\s|^data class/.test(trimmed)) return "Mendefinisikan kontrak data agar state, payload, dan return value mempunyai bentuk yang konsisten.";
  if (/^(public|private|protected|internal)?\s*(sealed\s+|static\s+|partial\s+)?class\s/.test(trimmed)) return "Mendeklarasikan kelas yang mengelompokkan state dan perilaku untuk satu komponen/platform.";
  if (/(async\s+)?function\s|=>\s*\{|^(public|private|protected|internal).+\)\s*\{|^def\s|^async def\s/.test(trimmed)) return "Membuka fungsi/prosedur; parameter di baris ini menjadi input, lalu blok berikutnya menjalankan logika.";
  if (/^(const|let|var)\s|^(public|private|protected|internal).*=|^val\s|^var\s/.test(trimmed)) return "Membuat variabel/konstanta. Nilai ini dipakai ulang oleh renderer, service, widget, atau proses sinkronisasi.";
  if (/^if\s*\(|\sif\s*\(|^else\b|^switch\s*\(|^case\s|^when\s/.test(trimmed)) return "Percabangan logika; kode memilih jalur berdasarkan status perangkat, izin, data RTDB, atau kondisi UI.";
  if (/for\s*\(|while\s*\(|\.forEach\(|\.map\(|\.filter\(|\.reduce\(|foreach|for \(/.test(trimmed)) return "Iterasi/transformasi koleksi; baris ini mengolah banyak item seperti perangkat, deteksi, titik grafik, atau widget.";
  if (/await\s|fetch\(|http|firebase|rtdb|database|patch|put|post|delete/i.test(trimmed)) return "Operasi asinkron/network. Data dikirim atau diambil dari Firebase, kamera, service lokal, atau endpoint aplikasi.";
  if (/Math\.|sin|cos|atan2|sqrt|pow|iou|nms|haversine|clamp|scale|confidence|threshold|duration|seconds/i.test(trimmed)) return "Baris numerik/matematis: dipakai untuk skala gambar, bounding box, confidence AI, durasi lampu, grafik, atau jarak.";
  if (/return\b/.test(trimmed)) return "Menghasilkan nilai akhir dari fungsi atau menghentikan jalur eksekusi setelah kondisi terpenuhi.";
  if (/try\s*\{|catch\s*\(|finally\s*\{/.test(trimmed)) return "Penanganan error agar kegagalan jaringan, media, izin, atau parsing tidak membuat aplikasi berhenti total.";
  if (/addEventListener|onclick|setInterval|setTimeout|requestAnimationFrame|observer/i.test(trimmed)) return "Menghubungkan event/timer ke UI sehingga aplikasi dapat merespons klik, refresh realtime, atau animasi.";
  if (/<[a-zA-Z]|`$|\$\{/.test(trimmed) || file.endsWith(".html") || file.endsWith(".xml")) return "Membentuk markup/template UI, manifest, atau layout. Struktur ini menentukan tampilan yang dilihat user.";
  if (/^\}?\)?;?$/.test(trimmed)) return "Menutup blok atau ekspresi sebelumnya; menjaga scope kode tetap tepat.";
  return `Instruksi implementasi pada ${file}:${number}; bagian ini mendukung logika platform sesuai konteks fungsi di sekitarnya.`;
}

function extractSymbols(source) {
  const symbols = [];
  source.lines.forEach((line, index) => {
    const trimmed = line.trim();
    const match =
      trimmed.match(/^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)/) ||
      trimmed.match(/^(public|private|protected|internal)?\s*(static\s+)?(async\s+)?[A-Za-z0-9_<>,\[\]?]+\s+([A-Za-z0-9_]+)\s*\(/) ||
      trimmed.match(/^(const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(async\s*)?\(/) ||
      trimmed.match(/^(class|interface|type)\s+([A-Za-z0-9_$]+)/) ||
      trimmed.match(/^def\s+([A-Za-z0-9_]+)/);
    if (!match) return;
    const name = match[4] || match[3] || match[2] || match[1];
    symbols.push({ name, line: index + 1, code: trimmed.slice(0, 140) });
  });
  return symbols.slice(0, 80);
}

function sourceStats(sources) {
  return sources.map((src) => {
    const logic = src.lines.filter((line) => line.trim() && !/^\s*(\/\/|#|<!--|\*)/.test(line)).length;
    return { ...src, logicLines: logic, symbols: extractSymbols(src) };
  });
}

function sourceTable(sources) {
  return `
    <div class="source-summary" role="table" aria-label="Ringkasan source code">
      <div role="row" class="source-summary-head">
        <span role="columnheader">File</span>
        <span role="columnheader">Baris</span>
        <span role="columnheader">Baris logika</span>
        <span role="columnheader">Simbol utama</span>
      </div>
      ${sources.map((src) => `
        <div role="row">
          <span role="cell"><code>${esc(src.rel)}</code></span>
          <span role="cell">${src.lines.length.toLocaleString("id-ID")}</span>
          <span role="cell">${src.logicLines.toLocaleString("id-ID")}</span>
          <span role="cell">${src.symbols.slice(0, 5).map((s) => `<a href="#${anchorFor(src.rel)}-${s.line}">${esc(s.name)}</a>`).join(", ") || "template / konfigurasi"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function anchorFor(file) {
  return file.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function codeAtlas(sources, heading = "Atlas kode baris per baris") {
  return `
    <section class="doc-section code-atlas" id="source-atlas">
      <div class="section-kicker">Line-by-line source atlas</div>
      <h2>${esc(heading)}</h2>
      <p>Setiap tabel di bawah mengutip kode asli per baris, lalu memberikan catatan maksud logika. Catatan bersifat teknis dan mengikuti konteks file: TypeScript untuk web, Java untuk Android, C# untuk Windows widget, XML/JSON untuk layout dan manifest.</p>
      ${sourceTable(sources)}
      ${sources.map((src, fileIndex) => sourceDetail(src, fileIndex === 0)).join("")}
    </section>
  `;
}

function sourceDetail(src, open) {
  return `
    <details class="source-file" ${open ? "open" : ""}>
      <summary>
        <span>${esc(src.rel)}</span>
        <small>${src.lines.length.toLocaleString("id-ID")} baris</small>
      </summary>
      ${src.symbols.length ? `
        <div class="symbol-list" aria-label="Daftar simbol ${esc(src.rel)}">
          ${src.symbols.map((s) => `<a href="#${anchorFor(src.rel)}-${s.line}">L${s.line} ${esc(s.name)}</a>`).join("")}
        </div>
      ` : ""}
      <div class="code-table" role="table" aria-label="Penjelasan baris per baris ${esc(src.rel)}">
        <div role="row" class="code-head">
          <span role="columnheader">Baris</span>
          <span role="columnheader">Kode</span>
          <span role="columnheader">Penjelasan</span>
        </div>
        ${src.lines.map((line, i) => {
          const n = i + 1;
          return `
            <div role="row" id="${anchorFor(src.rel)}-${n}">
              <span role="cell" class="line-no">${n}</span>
              <code role="cell">${esc(line || " ")}</code>
              <span role="cell">${esc(classifyLine(line, n, src.rel))}</span>
            </div>
          `;
        }).join("")}
      </div>
    </details>
  `;
}

function formulaSection(platform) {
  return `
    <section class="doc-section" id="formula">
      <div class="section-kicker">Matematika dan logika</div>
      <h2>Formulasi yang dipakai kode</h2>
      <div class="formula-grid">
        <article>
          <h3>Status realtime</h3>
          <p>Perangkat dianggap online jika selisih waktu heartbeat masih di bawah ambang offline.</p>
          <div class="math">\\[\\Delta t=t_{now}-t_{lastSeen}\\]</div>
          <div class="math">\\[online(d)=\\begin{cases}1,&\\Delta t\\le T_{offline}\\\\0,&\\Delta t>T_{offline}\\end{cases}\\]</div>
        </article>
        <article>
          <h3>Total kendaraan</h3>
          <p>Tile kendaraan menampilkan jumlah kelas yang sama di WebApp, APK, dan Windows widget.</p>
          <div class="math">\\[N=N_{mobil}+N_{motor}+N_{bus}+N_{truk}+N_{sepeda}\\]</div>
        </article>
        <article>
          <h3>Proyeksi bounding box</h3>
          <p>AI menggambar kotak deteksi dengan skala dari frame sumber ke canvas/tampilan.</p>
          <div class="math">\\[x'=x\\cdot\\frac{W_{view}}{W_{src}},\\quad y'=y\\cdot\\frac{H_{view}}{H_{src}}\\]</div>
          <div class="math">\\[w'=w\\cdot\\frac{W_{view}}{W_{src}},\\quad h'=h\\cdot\\frac{H_{view}}{H_{src}}\\]</div>
        </article>
        <article>
          <h3>IoU dan NMS</h3>
          <p>Deteksi ganda ditekan dengan Intersection over Union agar satu objek tidak dihitung berkali-kali.</p>
          <div class="math">\\[IoU(A,B)=\\frac{|A\\cap B|}{|A\\cup B|}\\]</div>
          <div class="math">\\[score'=score\\cdot e^{-\\frac{IoU^2}{\\sigma}}\\]</div>
        </article>
        <article>
          <h3>Grafik realtime</h3>
          <p>History grafik dibatasi ke jendela data terbaru supaya widget tetap terbaca.</p>
          <div class="math">\\[H_t=tail_k(H_{t-1}\\cup\\{(t,N,color,seconds)\\})\\]</div>
        </article>
        <article>
          <h3>Jarak Haversine</h3>
          <p>Dipakai untuk memperkirakan jarak user, POI, dan device pada peta.</p>
          <div class="math">\\[a=\\sin^2\\frac{\\Delta\\phi}{2}+\\cos\\phi_1\\cos\\phi_2\\sin^2\\frac{\\Delta\\lambda}{2}\\]</div>
          <div class="math">\\[d=2R\\cdot atan2(\\sqrt a,\\sqrt{1-a})\\]</div>
        </article>
      </div>
      <div class="run-panel">
        <h3>Contoh kode yang bisa dijalankan</h3>
        <p>Contoh ini menjalankan rumus kecil yang sama konsepnya dengan kode aplikasi: freshness, total kendaraan, IoU, dan durasi lampu.</p>
        <pre><code>const total = car + motorcycle + bus + truck + bicycle;
const green = Math.min(120, Math.max(10, 0.85 * total + 8));</code></pre>
        <div class="run-actions">
          <button type="button" data-demo="vehicle">Run total kendaraan</button>
          <button type="button" data-demo="freshness">Run freshness</button>
          <button type="button" data-demo="iou">Run IoU</button>
          <button type="button" data-demo="traffic">Run durasi lampu</button>
        </div>
        <output data-demo-output>Tekan salah satu tombol Run.</output>
      </div>
      ${platform === "webapp" ? `<p class="note">Pada kode WebApp, rumus ini terlihat di <code>browserRfDetr.ts</code> untuk bbox/IoU dan di <code>main.ts</code>/<code>windows.ts</code> untuk status realtime, chart, jarak, dan render UI.</p>` : ""}
    </section>
  `;
}

function mermaidSection(platform) {
  const flow = platform === "android"
    ? `flowchart LR
  RTDB[(Firebase RTDB)] --> S[WidgetRealtimeService.java]
  S --> W1[ITS Live Widget]
  S --> W2[Kamera AI ITS Widget]
  S --> W3[Peta ITS Widget]
  S --> W4[Data Full & Alert Widget]
  S --> L[LockScreenDashboardActivity]
  Main[MainActivity / Capacitor] --> S`
    : platform === "windows"
      ? `flowchart LR
  RTDB[(Firebase RTDB)] --> C[ItsWidgetDataService.cs]
  C --> M[ItsWidgetMediaRenderer.cs]
  C --> T[AdaptiveCard JSON templates]
  M --> Board[Windows Widget Board]
  Electron[Electron Desktop] --> Renderer[web/src/windows.ts]
  Package[MSIX HanifaTeams.ITSMaps] --> Board`
      : `flowchart LR
  RTDB[(Firebase RTDB)] --> Main[web/src/main.ts]
  Main --> Map[Leaflet / MapLibre map]
  Main --> Camera[Camera surface]
  Camera --> AI[browserRfDetr.ts]
  AI --> Overlay[Canvas bbox + confidence]
  Main --> PWA[Service worker + install]
  Main --> Docs[/documentation + /method]`;
  return `
    <section class="doc-section" id="diagram">
      <div class="section-kicker">Diagram</div>
      <h2>Alur runtime ${esc(platformMeta[platform].label)}</h2>
      <pre class="mermaid">${esc(flow)}</pre>
    </section>
  `;
}

function featureSection(platform) {
  const rows = {
    webapp: [
      ["Peta realtime", "Leaflet/CARTO/OSM, marker device, POI, mode 2D/3D/satelit, dan lokasi user."],
      ["AI RF-DETR", "Deteksi object dari snapshot/video, bbox, confidence, history, dan publikasi ringkasan ke RTDB."],
      ["PWA", "Manifest, service worker, app-update metadata, notification click, dan install surface."],
      ["Dokumentasi", "Route /documentation, /method, /method/webapp, /licence, dan print A4."],
    ],
    android: [
      ["Widget ITS Live", "Grafik realtime, status sistem, durasi lampu, dan tile kendaraan."],
      ["Widget Kamera AI ITS", "Carousel 2 snapshot, bbox AI, label objek, confidence, dan ringkasan kendaraan."],
      ["Widget Peta ITS", "Map preview, marker traffic light, status warna, dan kontrol lokasi/zoom."],
      ["Lock screen", "Dashboard lock-screen dengan snapshot, media surface, dan service notifikasi."],
    ],
    windows: [
      ["MSIX Microsoft Store", "Identitas HanifaTeams.ITSMaps, publisher, AppX assets, location/internet capability."],
      ["Windows Widgets", "4 AdaptiveCard widgets: ITS Live, Kamera AI ITS, Peta ITS, Data Full & Alert."],
      ["Desktop app", "Electron shell, custom titlebar, map/camera desktop, history, PiP/fullscreen video."],
      ["Widget media", "C# renderer membuat chart, map tile, icons, snapshot AI, dan bbox sebagai media card."],
    ],
  }[platform];
  return `
    <section class="doc-section" id="features">
      <div class="section-kicker">Fitur</div>
      <h2>Fitur utama yang dibahas</h2>
      <div class="feature-grid">
        ${rows.map(([title, text]) => `<article><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`).join("")}
      </div>
    </section>
  `;
}

function screenshotSection(platform) {
  const items = platform === "android"
    ? [
      ["/method/assets/widgetITSLive.png", "Screenshot widget ITS Live Android"],
      ["/method/assets/widgetITSKameraAI.png", "Screenshot widget Kamera AI ITS Android"],
      ["/method/assets/widgetPetaITS.png", "Screenshot widget Peta ITS Android"],
      ["/method/assets/widgetDataLengkapITS.png", "Screenshot widget Data Full & Alert Android"],
    ]
    : platform === "windows"
      ? [
        ["/method/assets/windows-home.png", "Screenshot aplikasi Windows ITS Maps"],
        ["/method/assets/windows-map.png", "Screenshot peta Windows ITS Maps"],
        ["/method/assets/windows-ai.png", "Screenshot AI Windows ITS Maps"],
        ["/method/assets/widgetPetaITS.png", "Mockup Windows widget peta"],
      ]
      : [
        ["/method/assets/thumbnail.png", "Screenshot utama WebApp ITS Maps"],
        ["/method/assets/mobile-map.png", "Screenshot mobile map ITS Maps"],
        ["/method/assets/mobile-ai.png", "Screenshot mobile AI ITS Maps"],
        ["/method/assets/widgetITSKameraAI.png", "Mockup kamera AI"],
      ];
  return `
    <section class="doc-section" id="screenshots">
      <div class="section-kicker">Screenshots</div>
      <h2>Gambar pendukung</h2>
      <div class="shot-grid">
        ${items.map(([src, alt]) => `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(alt)}</figcaption></figure>`).join("")}
      </div>
    </section>
  `;
}

function downloadCards() {
  return `
    <section class="doc-section" id="download">
      <div class="section-kicker">User download</div>
      <h2>Link aplikasi</h2>
      <div class="download-grid">
        <article>
          <span>Android</span>
          <h3>ITS Maps APK</h3>
          <p>Untuk pengguna Android yang ingin memasang aplikasi langsung.</p>
          <a href="${site.androidApk}">Download APK encoded (.b64)</a>
          <a href="${site.androidApkDirect}">Download APK langsung</a>
        </article>
        <article>
          <span>Microsoft Store</span>
          <h3>ITS Maps Windows</h3>
          <p>Store ID: <strong>${site.storeId}</strong>. Deep link web tersedia setelah produk live.</p>
          <a href="${site.storeProtocol}">Buka Microsoft Store app</a>
        </article>
        <article>
          <span>WebApp</span>
          <h3>ITS Maps Web</h3>
          <p>Versi web/PWA berjalan langsung dari Firebase Hosting.</p>
          <a href="${site.url}/">Buka WebApp</a>
          <a href="${site.url}/documentation">Buka Dokumentasi</a>
        </article>
      </div>
    </section>
  `;
}

function creditsSection() {
  return `
    <section class="doc-section" id="credits">
      <div class="section-kicker">Credits</div>
      <h2>Ucapan terima kasih</h2>
      <div class="credit-list">
        <article><strong>Hanifa Septhi Larasati / Hanifa Teams</strong><span>Developer dan publisher ITS Maps.</span></article>
        <article><strong>galihru</strong><span>Terima kasih untuk kontribusi akun/repository awal dan kolaborasi pengembangan ITS Maps.</span></article>
        <article><strong>Roboflow RF-DETR</strong><span>Rujukan model deteksi objek RF-DETR yang menjadi dasar pipeline deteksi visual.</span></article>
        <article><strong>Hugging Face onnx-community</strong><span>Model ONNX <code>onnx-community/rfdetr_nano-ONNX</code> yang dipanggil oleh kode browser.</span></article>
        <article><strong>Transformers.js / Xenova</strong><span>Runtime model browser dan fallback object-detection/segmentation.</span></article>
        <article><strong>OpenStreetMap, CARTO, Leaflet, MapLibre, Firebase, Microsoft, Android</strong><span>Ekosistem peta, hosting realtime, web, widget, dan distribusi aplikasi.</span></article>
      </div>
    </section>
  `;
}

function platformPage(platform) {
  const meta = platformMeta[platform];
  const sources = sourceStats(sourceGroups[platform].map(readSource).filter(Boolean));
  return pageShell({
    title: `${meta.heading} | ITS Maps`,
    bodyClass: `method-page ${platform}-page`,
    navActive: `/method/${meta.slug}`,
    main: `
      ${printChrome(meta.heading)}
      <article class="print-cover">
        <img src="/method/assets/its.png" alt="" />
        <p>${esc(meta.eyebrow)}</p>
        <h1>${esc(meta.heading)}</h1>
        <p>${esc(meta.summary)}</p>
        <dl>
          <div><dt>Developer</dt><dd>${site.developer}</dd></div>
          <div><dt>Publisher</dt><dd>${site.publisher}</dd></div>
          <div><dt>URL</dt><dd>${site.url}/method/${meta.slug}</dd></div>
          <div><dt>Updated</dt><dd>${site.date}</dd></div>
        </dl>
      </article>
      <header class="doc-hero">
        <div>
          <p class="eyebrow">${esc(meta.eyebrow)}</p>
          <h1>${esc(meta.heading)}</h1>
          <p>${esc(meta.summary)}</p>
          <div class="hero-actions">
            <a href="/method">Semua metode</a>
            <a href="/documentation">Dokumentasi utama</a>
            <button type="button" data-print>Print A4</button>
          </div>
        </div>
        <img src="${esc(meta.heroImage)}" alt="Preview ${esc(meta.label)} ITS Maps">
      </header>
      <nav class="toc" aria-label="Daftar isi">
        <a href="#features">Fitur</a>
        <a href="#diagram">Diagram</a>
        <a href="#formula">Rumus</a>
        <a href="#screenshots">Screenshot</a>
        <a href="#source-atlas">Baris per baris</a>
        <a href="#download">Download</a>
      </nav>
      ${featureSection(platform)}
      ${mermaidSection(platform)}
      ${formulaSection(platform)}
      ${screenshotSection(platform)}
      ${codeAtlas(sources, `Atlas kode ${meta.label}`)}
      ${downloadCards()}
      ${creditsSection()}
    `,
  });
}

function methodIndexPage() {
  return pageShell({
    title: "Metode ITS Maps",
    bodyClass: "method-page method-index",
    navActive: "/method",
    main: `
      ${printChrome("Metode ITS Maps")}
      <header class="doc-hero index-hero">
        <div>
          <p class="eyebrow">Method documentation</p>
          <h1>Metode dan dokumentasi kode ITS Maps</h1>
          <p>Portal ini menjelaskan WebApp, Android APK, Microsoft Store Windows app, Windows Widgets, Firebase RTDB, AI RF-DETR, dan Raspberry Pi controller dengan diagram, rumus, screenshot, dan atlas kode baris per baris.</p>
          <div class="hero-actions">
            <a href="/method/webapp">WebApp</a>
            <a href="/method/android">Android</a>
            <a href="/method/windows">Windows</a>
            <button type="button" data-print>Print A4</button>
          </div>
        </div>
        <img src="/method/assets/thumbnail.png" alt="ITS Maps preview">
      </header>
      <section class="doc-section">
        <div class="section-kicker">Pilih platform</div>
        <h2>Card metode</h2>
        <div class="method-card-grid">
          ${Object.values(platformMeta).map((meta) => `
            <a class="method-card" href="/method/${meta.slug}">
              <img src="${esc(meta.heroImage)}" alt="">
              <span>${esc(meta.eyebrow)}</span>
              <h3>${esc(meta.label)}</h3>
              <p>${esc(meta.summary)}</p>
            </a>
          `).join("")}
        </div>
      </section>
      ${downloadCards()}
      <section class="doc-section">
        <div class="section-kicker">Coverage</div>
        <h2>Jumlah kode yang dibedah</h2>
        <div class="coverage-grid">
          ${Object.entries(sourceGroups).map(([key, files]) => {
            const sources = files.map(readSource).filter(Boolean);
            const lines = sources.reduce((sum, src) => sum + src.lines.length, 0);
            return `<article><strong>${esc(key)}</strong><span>${sources.length} file</span><b>${lines.toLocaleString("id-ID")} baris</b></article>`;
          }).join("")}
        </div>
      </section>
      ${creditsSection()}
    `,
  });
}

function documentationPage() {
  const allSources = sourceStats([...sourceGroups.webapp, ...sourceGroups.android, ...sourceGroups.windows, ...sourceGroups.controller]
    .map(readSource)
    .filter(Boolean));
  return pageShell({
    title: "Documentation | ITS Maps",
    bodyClass: "method-page documentation-page",
    navActive: "/documentation",
    main: `
      ${printChrome("ITS Maps Documentation")}
      <article class="print-cover">
        <img src="/method/assets/its.png" alt="" />
        <p>Technical Documentation</p>
        <h1>ITS Maps</h1>
        <p>Dokumentasi komprehensif untuk WebApp, Android APK, Microsoft Store Windows app, Windows Widgets, AI RF-DETR, Firebase RTDB, dan Raspberry Pi controller.</p>
        <dl>
          <div><dt>Developer</dt><dd>${site.developer}</dd></div>
          <div><dt>Publisher</dt><dd>${site.publisher}</dd></div>
          <div><dt>Website</dt><dd>${site.url}</dd></div>
          <div><dt>Updated</dt><dd>${site.date}</dd></div>
        </dl>
      </article>
      <header class="doc-hero index-hero">
        <div>
          <p class="eyebrow">Documentation</p>
          <h1>ITS Maps technical documentation</h1>
          <p>Dokumentasi ini sudah mencakup tabel fitur, link download, diagram Mermaid, rumus LaTeX, demo kode yang bisa dijalankan, screenshot/mockup, dan atlas kode baris per baris.</p>
          <div class="hero-actions">
            <a href="/method">Buka Method</a>
            <a href="${site.github}">GitHub</a>
            <button type="button" data-print>Print A4</button>
          </div>
        </div>
        <img src="/method/assets/thumbnail.png" alt="ITS Maps documentation preview">
      </header>
      <nav class="toc" aria-label="Daftar isi">
        <a href="#download">Download</a>
        <a href="#architecture">Arsitektur</a>
        <a href="#formula">Rumus</a>
        <a href="#source-atlas">Kode baris per baris</a>
        <a href="#credits">Credits</a>
      </nav>
      ${downloadCards()}
      <section class="doc-section" id="architecture">
        <div class="section-kicker">Architecture</div>
        <h2>Arsitektur end-to-end</h2>
        <pre class="mermaid">flowchart LR
  Pi[Raspberry Pi Controller] -->|heartbeat, traffic, GPS, snapshots| RTDB[(Firebase RTDB)]
  RTDB --> Web[WebApp / PWA]
  RTDB --> Android[Android APK + Widgets]
  RTDB --> Win[Windows Desktop MSIX]
  RTDB --> Widgets[Windows Widget Board]
  Web --> AI[Browser RF-DETR]
  Android --> Lock[Lock-screen Dashboard]
  Win --> Store[Microsoft Store]
  Widgets --> Cards[Adaptive Cards]</pre>
      </section>
      ${formulaSection("webapp")}
      ${codeAtlas(allSources, "Atlas kode lintas platform")}
      ${creditsSection()}
    `,
  });
}

function licencePage(spelling = "licence") {
  const licenseText = fs.existsSync(path.join(repoRoot, "LICENSE"))
    ? fs.readFileSync(path.join(repoRoot, "LICENSE"), "utf8")
    : "MIT License\n\nCopyright (c) 2026 Hanifa Septhi Larasati";
  return pageShell({
    title: `${spelling === "license" ? "License" : "Licence"} | ITS Maps`,
    bodyClass: "method-page licence-page",
    navActive: "/licence",
    main: `
      ${printChrome("ITS Maps Licence")}
      <header class="doc-hero">
        <div>
          <p class="eyebrow">Legal</p>
          <h1>Licence / License</h1>
          <p>Isi halaman ini sama dengan file <code>LICENSE</code> di GitHub. Jika file GitHub diperbarui lalu generator dijalankan, halaman website ikut berubah.</p>
          <div class="hero-actions">
            <a href="${site.github}/blob/main/LICENSE">Lihat di GitHub</a>
            <button type="button" data-print>Print A4</button>
          </div>
        </div>
        <img src="/method/assets/its.png" alt="ITS Maps icon">
      </header>
      <section class="doc-section">
        <div class="section-kicker">MIT License</div>
        <h2>Source licence</h2>
        <pre class="license-block">${esc(licenseText)}</pre>
      </section>
      ${creditsSection()}
    `,
  });
}

function privacyPage() {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy Policy - ITS Maps</title>
    <meta name="description" content="Privacy Policy for ITS Maps by Hanifa Teams, including web, Android APK, Microsoft Store Windows app, Windows widgets, maps, camera AI, Firebase, and Raspberry Pi telemetry." />
    <link rel="icon" type="image/png" href="/its.png" />
    <link rel="stylesheet" href="/method/method.css" />
  </head>
  <body class="policy-page">
    <a class="skip-link" href="#content">Lewati ke konten</a>
    <header class="policy-top">
      <nav aria-label="Privacy navigation">
        <a class="brand" href="/"><img src="/its.png" alt=""> <span>ITS Maps</span></a>
        <div>
          <a href="/documentation">Documentation</a>
          <a href="/method">Method</a>
          <a href="/licence">Licence</a>
        </div>
      </nav>
      <section class="policy-hero">
        <div>
          <p class="eyebrow">Privacy Policy</p>
          <h1>Kebijakan Privasi ITS Maps</h1>
          <p>Halaman ini menjelaskan data yang diproses oleh WebApp, Android APK, Microsoft Store Windows app, Windows Widgets, Raspberry Pi controller, fitur peta, kamera, dan AI object detection.</p>
          <dl class="policy-meta">
            <div><dt>Developer</dt><dd>${site.developer}</dd></div>
            <div><dt>Publisher</dt><dd>${site.publisher}</dd></div>
            <div><dt>Updated</dt><dd>${site.date}</dd></div>
            <div><dt>Policy URL</dt><dd><a href="${site.url}/privacy">${site.url}/privacy</a></dd></div>
          </dl>
        </div>
        <div class="policy-art" aria-label="Privacy illustrations">
          <img src="/privacy/assets/1.png" alt="ITS Maps privacy illustration 1" loading="lazy">
          <img src="/privacy/assets/2.png" alt="ITS Maps privacy illustration 2" loading="lazy">
          <img src="/privacy/assets/3.png" alt="ITS Maps privacy illustration 3" loading="lazy">
        </div>
      </section>
    </header>
    <main id="content" class="policy-layout">
      <aside class="policy-toc" aria-label="Daftar isi kebijakan">
        <a href="#summary">Ringkasan</a>
        <a href="#data">Data</a>
        <a href="#use">Penggunaan</a>
        <a href="#firebase">Firebase</a>
        <a href="#camera">Kamera dan AI</a>
        <a href="#location">Lokasi</a>
        <a href="#sharing">Berbagi</a>
        <a href="#retention">Retensi</a>
        <a href="#security">Keamanan</a>
        <a href="#contact">Kontak</a>
      </aside>
      <article class="policy-content">
        ${policySection("summary", "1. Ringkasan", "ITS Maps memproses data hanya untuk menjalankan fitur aplikasi: peta realtime, status Raspberry Pi, grafik lalu lintas, kamera, AI object detection, widget Android, Windows widgets, notifikasi, dan dokumentasi aplikasi. ITS Maps tidak menjual data pribadi.")}
        ${policySection("data", "2. Informasi yang diproses", `<ul>
          <li>Telemetry perangkat: ID sistem, status online/offline, waktu update, status kamera, dan status controller.</li>
          <li>Data lalu lintas: warna lampu, durasi merah/kuning/hijau, jumlah mobil, motor, bus, truk, sepeda, dan total kendaraan.</li>
          <li>Data peta/lokasi: koordinat Raspberry Pi, marker peta, lokasi user jika user memberi izin, dan data POI/map view.</li>
          <li>Data kamera/AI: URL snapshot/stream, bbox object detection, label objek, confidence, timestamp, dan ringkasan hasil deteksi.</li>
          <li>Data aplikasi: pengaturan lokal, versi aplikasi, status update, cache, log diagnostik ringan, dan state widget.</li>
        </ul>`, true)}
        ${policySection("use", "3. Cara data digunakan", "Data digunakan untuk menampilkan dashboard realtime, membuat grafik, memperbarui widget, menjalankan AI detection, menampilkan peta, mengirim notifikasi, memperbaiki error, dan menjaga sinkronisasi antar platform.")}
        ${policySection("firebase", "4. Firebase dan layanan pihak ketiga", "ITS Maps memakai Firebase Hosting dan Firebase Realtime Database untuk hosting website dan sinkronisasi realtime. Aplikasi juga menggunakan layanan peta seperti OpenStreetMap/CARTO/Leaflet/MapLibre serta platform distribusi Microsoft Store dan Android sesuai fitur yang dipakai user.")}
        ${policySection("camera", "5. Kamera dan AI object detection", "Frame kamera/snapshot dapat dianalisis untuk mendeteksi objek dan kendaraan. Hasil yang ditampilkan berupa label, kotak deteksi, confidence, jumlah kendaraan, dan status analisis. Raw video tidak dijual dan tidak sengaja disimpan oleh ITS Maps kecuali user menghubungkan perangkat/layanan yang menyimpan stream secara terpisah.")}
        ${policySection("location", "6. Lokasi", "Lokasi user hanya dipakai setelah user memberi izin. Lokasi dapat digunakan untuk marker peta, jarak ke perangkat, atau tampilan lokasi saya. User dapat mencabut izin lokasi dari pengaturan browser, Android, atau Windows.")}
        ${policySection("sharing", "7. Berbagi data", "Data dapat diproses oleh penyedia layanan yang dibutuhkan untuk menjalankan aplikasi, seperti Firebase, Microsoft Store, browser/Android/Windows permission system, dan layanan peta. ITS Maps tidak menjual data pribadi.")}
        ${policySection("retention", "8. Retensi dan penghapusan", "Data realtime dipertahankan selama dibutuhkan oleh konfigurasi perangkat, dashboard, history, atau diagnostik. Data lokal bisa dihapus dengan clear app data/uninstall. Data RTDB dapat dihapus dari Firebase project atau melalui permintaan ke publisher.")}
        ${policySection("security", "9. Keamanan", "ITS Maps menggunakan HTTPS, permission system platform, dan pemisahan data lokal/realtime. Tidak ada sistem online yang sempurna, sehingga user disarankan hanya menghubungkan perangkat, stream, dan Firebase project tepercaya.")}
        ${policySection("children", "10. Privasi anak", "ITS Maps tidak ditujukan untuk anak di bawah 13 tahun. Jika Anda yakin anak memberikan data pribadi melalui aplikasi, hubungi publisher melalui kanal dukungan.")}
        ${policySection("contact", "11. Kontak dan perubahan", "Untuk pertanyaan, permintaan penghapusan, atau pembaruan kebijakan, hubungi Hanifa Teams melalui listing Microsoft Store atau kanal dukungan publisher. Kebijakan ini dapat diperbarui ketika fitur, layanan, atau persyaratan hukum berubah.")}
      </article>
    </main>
    <footer class="policy-footer">
      <p>Privacy Policy URL: <a href="${site.url}/privacy">${site.url}/privacy</a></p>
      <button type="button" data-print>Print A4</button>
    </footer>
    <script src="/method/method.js" defer></script>
  </body>
</html>`;
}

function policySection(id, title, content, raw = false) {
  return `<section id="${id}" class="policy-card"><h2>${esc(title)}</h2>${raw ? content : `<p>${esc(content)}</p>`}</section>`;
}

function printChrome(title) {
  return `
    <div class="print-header"><span>ITS Maps</span><strong>${esc(title)}</strong></div>
    <div class="print-footer"><span>${site.developer}</span><span>${site.url}</span></div>
  `;
}

function pageShell({ title, bodyClass, navActive, main }) {
  const nav = [
    ["/", "Home"],
    ["/documentation", "Documentation"],
    ["/method", "Method"],
    ["/method/webapp", "WebApp"],
    ["/method/android", "Android"],
    ["/method/windows", "Windows"],
    ["/privacy", "Privacy"],
    ["/licence", "Licence"],
  ];
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="ITS Maps documentation with line-by-line source explanation, Mermaid diagrams, LaTeX formulas, screenshots, and app download links." />
    <link rel="icon" type="image/png" href="/its.png" />
    <link rel="stylesheet" href="/method/method.css" />
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" defer></script>
    <script src="/method/method.js" defer></script>
  </head>
  <body class="${esc(bodyClass)}">
    <a class="skip-link" href="#content">Lewati ke konten</a>
    <header class="topbar">
      <a class="brand" href="/"><img src="/its.png" alt=""><span>ITS Maps</span></a>
      <nav aria-label="Navigasi dokumentasi">
        ${nav.map(([href, label]) => `<a href="${href}"${href === navActive ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      </nav>
    </header>
    <main id="content">
      ${main}
    </main>
  </body>
</html>`;
}

function methodCss() {
  return `
:root {
  color-scheme: light;
  --bg: #f6f8fb;
  --paper: #ffffff;
  --ink: #142033;
  --muted: #5c6b7a;
  --line: #d8e2ee;
  --accent: #176b5c;
  --accent-2: #1b75d0;
  --warm: #f6a531;
  --danger: #d7375f;
  --radius: 18px;
  --shadow: 0 18px 45px rgba(21, 35, 58, 0.1);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--ink); font-family: Inter, "Segoe UI", Roboto, Arial, sans-serif; line-height: 1.62; }
a { color: var(--accent-2); }
img { max-width: 100%; }
.skip-link { position: absolute; left: 16px; top: -60px; z-index: 50; background: #fff; color: #111827; padding: 10px 12px; border-radius: 10px; }
.skip-link:focus { top: 12px; }
.topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px clamp(16px, 3vw, 42px); border-bottom: 1px solid rgba(216,226,238,.8); background: rgba(255,255,255,.9); backdrop-filter: blur(14px); }
.brand { display: inline-flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; font-weight: 800; }
.brand img { width: 34px; height: 34px; object-fit: contain; }
.topbar nav { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.topbar nav a { border-radius: 999px; padding: 8px 11px; color: #344256; text-decoration: none; font-size: 13px; font-weight: 700; }
.topbar nav a:hover, .topbar nav a:focus-visible, .topbar nav a[aria-current="page"] { background: #eaf6f3; color: #0b5548; outline: none; }
main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 72px; }
.doc-hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr); gap: clamp(22px, 4vw, 54px); align-items: center; margin: 26px 0 18px; padding: clamp(22px, 4vw, 46px); border: 1px solid var(--line); border-radius: 28px; background: linear-gradient(135deg, #fff 0%, #edf8f5 45%, #eef4ff 100%); box-shadow: var(--shadow); }
.doc-hero img { width: 100%; max-height: 420px; object-fit: contain; border-radius: 20px; background: rgba(255,255,255,.7); }
.eyebrow, .section-kicker { color: var(--accent); font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 8px 0 14px; font-size: clamp(2.2rem, 6vw, 5.2rem); line-height: .98; letter-spacing: 0; }
h2 { margin: 0 0 12px; font-size: clamp(1.45rem, 3vw, 2.35rem); line-height: 1.05; }
h3 { margin: 0 0 8px; }
p { color: var(--muted); }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.hero-actions a, .hero-actions button, .download-grid a, .run-actions button, .policy-footer button { border: 0; border-radius: 999px; padding: 10px 14px; background: #122033; color: #fff; text-decoration: none; font-weight: 800; cursor: pointer; }
.hero-actions a:nth-child(2), .hero-actions button, .download-grid a:nth-of-type(2) { background: #e8eef7; color: #16324f; }
.toc { position: sticky; top: 68px; z-index: 10; display: flex; gap: 8px; overflow-x: auto; padding: 10px; margin: 18px 0 22px; border: 1px solid var(--line); border-radius: 16px; background: rgba(255,255,255,.9); backdrop-filter: blur(10px); }
.toc a { flex: 0 0 auto; border-radius: 999px; padding: 8px 12px; color: #344256; text-decoration: none; font-weight: 800; font-size: 13px; }
.toc a:hover, .toc a:focus-visible { background: #eaf6f3; outline: none; }
.doc-section, .policy-card { margin: 22px 0; padding: clamp(18px, 3vw, 32px); border: 1px solid var(--line); border-radius: var(--radius); background: var(--paper); box-shadow: 0 10px 26px rgba(21,35,58,.05); }
.feature-grid, .formula-grid, .download-grid, .method-card-grid, .shot-grid, .coverage-grid, .credit-list { display: grid; gap: 14px; }
.feature-grid, .formula-grid, .download-grid, .method-card-grid { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.feature-grid article, .formula-grid article, .download-grid article, .method-card, .coverage-grid article, .credit-list article { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: #fbfdff; }
.method-card { color: inherit; text-decoration: none; }
.method-card img { height: 180px; width: 100%; object-fit: contain; border-radius: 12px; background: #eef4f0; }
.method-card span, .download-grid span { color: var(--accent); font-weight: 900; font-size: 12px; text-transform: uppercase; }
.shot-grid { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
figure { margin: 0; }
figure img { width: 100%; height: 260px; object-fit: contain; border: 1px solid var(--line); border-radius: 14px; background: #edf2f7; }
figcaption { margin-top: 8px; color: var(--muted); font-size: 13px; font-weight: 700; }
.coverage-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.coverage-grid article { display: grid; gap: 4px; }
.coverage-grid b { font-size: 1.4rem; }
.source-summary { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; margin: 16px 0; }
.source-summary > div { display: grid; grid-template-columns: minmax(220px, 2fr) .5fr .6fr minmax(240px, 1.6fr); gap: 12px; padding: 10px 12px; border-top: 1px solid var(--line); align-items: start; }
.source-summary > div:first-child { border-top: 0; }
.source-summary-head { background: #eef4f8; font-weight: 900; }
code, pre { font-family: "Cascadia Code", Consolas, monospace; }
.source-file { margin: 16px 0; border: 1px solid var(--line); border-radius: 14px; background: #fff; overflow: hidden; }
.source-file summary { display: flex; justify-content: space-between; gap: 12px; padding: 14px 16px; cursor: pointer; font-weight: 900; background: #f4f8fb; }
.symbol-list { display: flex; gap: 8px; flex-wrap: wrap; padding: 12px 14px; border-top: 1px solid var(--line); }
.symbol-list a { border-radius: 999px; padding: 6px 9px; background: #edf6ff; text-decoration: none; font-size: 12px; font-weight: 800; }
.code-table { display: grid; width: 100%; font-size: 12px; }
.code-table > div { display: grid; grid-template-columns: 72px minmax(320px, 1.4fr) minmax(260px, 1fr); border-top: 1px solid #e8eef4; }
.code-table > div > * { padding: 7px 8px; min-width: 0; }
.code-table code { overflow-wrap: anywhere; white-space: pre-wrap; color: #172033; background: #fbfcfe; }
.line-no { color: #6b7785; font-weight: 800; text-align: right; background: #f6f8fb; }
.code-head { position: sticky; top: 122px; z-index: 4; background: #132033; color: #fff; font-weight: 900; }
.code-head code { background: transparent; color: #fff; }
.math { overflow-x: auto; padding: 8px; border-radius: 10px; background: #f6fafc; }
.run-panel { margin-top: 18px; border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: #f8fbff; }
.run-panel pre, .license-block, .mermaid { overflow-x: auto; padding: 14px; border-radius: 12px; background: #101828; color: #e5edf7; }
.run-actions { display: flex; gap: 8px; flex-wrap: wrap; }
output { display: block; margin-top: 12px; padding: 12px; border-radius: 12px; background: #fff; border: 1px solid var(--line); color: #122033; font-weight: 800; }
.download-grid article { display: grid; gap: 8px; align-content: start; }
.download-grid a { display: inline-flex; justify-content: center; width: fit-content; }
.credit-list { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
.credit-list article { display: grid; gap: 6px; }
.credit-list span { color: var(--muted); }
.print-cover, .print-header, .print-footer { display: none; }
.policy-page { background: #fff; }
.policy-top { background: linear-gradient(180deg, #eef7ff 0%, #fff 100%); border-bottom: 1px solid var(--line); }
.policy-top nav { display: flex; justify-content: space-between; gap: 18px; align-items: center; width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 18px 0; }
.policy-top nav div { display: flex; gap: 10px; flex-wrap: wrap; }
.policy-top nav a { font-weight: 800; text-decoration: none; }
.policy-hero { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 42px 0 58px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr); gap: 42px; align-items: center; }
.policy-hero h1 { font-size: clamp(2.4rem, 7vw, 5.8rem); }
.policy-art { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.policy-art img { border-radius: 20px; box-shadow: var(--shadow); aspect-ratio: 4/3; object-fit: cover; background: #eef3f8; }
.policy-art img:first-child { grid-column: 1 / -1; }
.policy-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin: 24px 0 0; }
.policy-meta div { border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: rgba(255,255,255,.85); }
.policy-meta dt { font-weight: 900; }
.policy-meta dd { margin: 2px 0 0; color: var(--muted); }
.policy-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 26px; align-items: start; }
.policy-toc { position: sticky; top: 18px; display: grid; gap: 6px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: #f8fbff; }
.policy-toc a { padding: 8px 10px; border-radius: 10px; text-decoration: none; font-weight: 800; color: #344256; }
.policy-toc a:hover, .policy-toc a:focus-visible { background: #eaf6f3; outline: none; }
.policy-content { min-width: 0; }
.policy-card h2 { font-size: 1.35rem; }
.policy-footer { width: min(1180px, calc(100% - 32px)); margin: 0 auto 40px; padding: 20px 0; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 820px) {
  .doc-hero, .policy-hero, .policy-layout { grid-template-columns: 1fr; }
  .topbar { align-items: flex-start; flex-direction: column; }
  .toc { top: 118px; }
  .policy-toc { position: relative; top: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .source-summary > div, .code-table > div { grid-template-columns: 1fr; }
  .line-no { text-align: left; }
}
@media print {
  @page { size: A4; margin: 18mm 14mm 20mm; }
  :root { --bg: #fff; --shadow: none; }
  body { background: #fff !important; color: #111827; font-size: 10.5pt; }
  .topbar, .toc, .hero-actions, .skip-link, .policy-toc, .policy-footer, .run-actions { display: none !important; }
  main, .policy-layout, .policy-top nav, .policy-hero { width: auto; margin: 0; padding: 0; display: block; }
  .doc-hero, .doc-section, .policy-card { box-shadow: none; border-color: #cbd5e1; break-inside: avoid; page-break-inside: avoid; }
  .print-cover { display: grid; min-height: 245mm; align-content: center; gap: 10mm; text-align: center; break-after: page; }
  .print-cover img { width: 34mm; margin: 0 auto; }
  .print-cover h1 { font-size: 34pt; }
  .print-cover dl { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; text-align: left; }
  .print-cover div { border: 1px solid #cbd5e1; border-radius: 4mm; padding: 4mm; }
  .print-header, .print-footer { display: flex; position: fixed; left: 0; right: 0; justify-content: space-between; color: #475569; font-size: 8.5pt; }
  .print-header { top: -10mm; border-bottom: .2mm solid #cbd5e1; padding-bottom: 2mm; }
  .print-footer { bottom: -12mm; border-top: .2mm solid #cbd5e1; padding-top: 2mm; }
  .doc-hero { display: block; padding: 0 0 6mm; border: 0; background: #fff; break-after: avoid; }
  .doc-hero img, .policy-art { display: none; }
  h1 { font-size: 24pt; }
  h2 { font-size: 16pt; }
  h3 { font-size: 12pt; }
  a { color: #111827; text-decoration: none; }
  .source-file { break-before: page; }
  .source-file summary { background: #fff; }
  .source-file:not([open]) .code-table, .source-file:not([open]) .symbol-list { display: block; }
  .code-table { font-size: 7.5pt; }
  .code-table > div { grid-template-columns: 12mm 78mm 74mm; break-inside: avoid; }
  .code-head { position: static; background: #111827 !important; color: #fff !important; }
  pre, code { white-space: pre-wrap; overflow-wrap: anywhere; }
}
`;
}

function methodJs() {
  return `
window.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", () => window.print()));
  if (window.mermaid) window.mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "neutral" });
  const output = document.querySelector("[data-demo-output]");
  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.getAttribute("data-demo");
      let text = "";
      if (type === "vehicle") {
        const data = { car: 2, motorcycle: 5, bus: 1, truck: 1, bicycle: 3 };
        const total = Object.values(data).reduce((sum, n) => sum + n, 0);
        text = "Input " + JSON.stringify(data) + " => total kendaraan = " + total;
      } else if (type === "freshness") {
        const deltaMs = 172000;
        const limitMs = 300000;
        text = "Delta heartbeat 172 detik <= 300 detik, maka status = online";
      } else if (type === "iou") {
        const inter = 30 * 20;
        const a = 50 * 40;
        const b = 42 * 35;
        const iou = inter / (a + b - inter);
        text = "IoU = " + iou.toFixed(3) + " sehingga NMS menekan box duplikat bila melewati threshold.";
      } else {
        const total = 12;
        const green = Math.min(120, Math.max(10, 0.85 * total + 8));
        text = "Total kendaraan 12 => rekomendasi durasi hijau " + green.toFixed(1) + " detik.";
      }
      if (output) output.textContent = text;
    });
  });
});
`;
}

function writeFile(rel, text) {
  const target = path.join(publicRoot, rel);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, text.replace(/[ \t]+$/gm, ""), "utf8");
}

function main() {
  ensureDir(methodRoot);
  ensureDir(methodAssetsRoot);
  ensureDir(docsRoot);
  ensureDir(licenceRoot);
  ensureDir(licenseRoot);
  copyAssets();

  writeFile("method/method.css", methodCss());
  writeFile("method/method.js", methodJs());
  writeFile("method/index.html", methodIndexPage());
  writeFile("method/webapp/index.html", platformPage("webapp"));
  writeFile("method/android/index.html", platformPage("android"));
  writeFile("method/windows/index.html", platformPage("windows"));
  writeFile("documentation/index.html", documentationPage());
  writeFile("licence/index.html", licencePage("licence"));
  writeFile("license/index.html", licencePage("license"));
  writeFile("privacy/index.html", privacyPage());
}

main();
