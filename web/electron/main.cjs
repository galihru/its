const { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, session, shell } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const APP_PROTOCOLS = ["its", "itsmaps"];
const APP_UPDATE_URL = "https://itstelkom.web.app/app-update.json";
const WINDOWS_EXE_NAME = "ITS-Maps-Windows-Custom-Setup-1.0.12-x64.exe";
const UPDATE_HISTORY_FILE = "update-history.json";

let mainWindow = null;
let tray = null;
let forceQuit = false;
let pendingRoute = null;

function iconPath() {
  const candidates = [
    path.join(__dirname, "..", "public", "itss.png"),
    path.join(__dirname, "..", "public", "favicon.svg"),
    path.join(process.resourcesPath || "", "app.asar", "public", "itss.png"),
    path.join(process.resourcesPath || "", "app.asar", "public", "favicon.svg"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || "";
}

function rendererPath() {
  const resourceRenderer = path.join(process.resourcesPath || "", "dist", "windows.html");
  const localRenderer = path.join(__dirname, "..", "dist", "windows.html");
  return fs.existsSync(resourceRenderer) ? resourceRenderer : localRenderer;
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function focusWindow(route) {
  if (route) pendingRoute = route;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  if (pendingRoute) {
    sendToRenderer("its:navigate", pendingRoute);
    pendingRoute = null;
  }
}

function parseRouteFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.searchParams.get("route")
      || parsed.searchParams.get("screen")
      || parsed.pathname.replace(/^\/+/, "")
      || "home";
  } catch {
    return "home";
  }
}

function readWindowsLocation() {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "unsupported-platform" });
  }

  const script = `
Add-Type -AssemblyName System.Device
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher ([System.Device.Location.GeoPositionAccuracy]::High)
$started = $watcher.TryStart($false, [TimeSpan]::FromSeconds(15))
$loc = $watcher.Position.Location
if ($loc.IsUnknown) {
  [pscustomobject]@{ ok=$false; error="windows-location-unknown"; started=$started } | ConvertTo-Json -Compress
} else {
  [pscustomobject]@{
    ok=$true
    lat=$loc.Latitude
    lng=$loc.Longitude
    accuracy=$loc.HorizontalAccuracy
    source="windows-location"
  } | ConvertTo-Json -Compress
}
`;

  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: 64 * 1024,
    }, (error, stdout) => {
      if (error) {
        resolve({ ok: false, error: error.message || "windows-location-failed" });
        return;
      }
      try {
        const parsed = JSON.parse(String(stdout || "{}"));
        const lat = Number(parsed.lat);
        const lng = Number(parsed.lng);
        if (parsed.ok && Number.isFinite(lat) && Number.isFinite(lng)) {
          resolve({
            ok: true,
            lat,
            lng,
            accuracy: Number(parsed.accuracy) || undefined,
            source: "windows-location",
          });
          return;
        }
        resolve({ ok: false, error: parsed.error || "windows-location-unknown" });
      } catch {
        resolve({ ok: false, error: "windows-location-parse-failed" });
      }
    });
  });
}

function ensureTray() {
  if (tray) return;
  const img = iconPath() ? nativeImage.createFromPath(iconPath()) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip("ITS Maps Windows");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Buka ITS Maps", click: () => focusWindow("home") },
    { label: "Peta Raspberry", click: () => focusWindow("map:raspberry") },
    { label: "Camera", click: () => focusWindow("camera") },
    { type: "separator" },
    {
      label: "Keluar",
      click: () => {
        forceQuit = true;
        app.quit();
      },
    },
  ]));
  tray.on("click", () => focusWindow("home"));
}

function showSystemNotification(payload = {}) {
  if (!Notification.isSupported()) return false;
  const notification = new Notification({
    title: String(payload.title || "ITS Maps Windows"),
    body: String(payload.body || ""),
    icon: iconPath(),
    silent: Boolean(payload.silent),
  });
  notification.on("click", () => focusWindow(String(payload.route || "home")));
  notification.show();
  return true;
}

function readUpdateHistory() {
  const file = path.join(app.getPath("userData"), UPDATE_HISTORY_FILE);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeUpdateHistory(items) {
  const file = path.join(app.getPath("userData"), UPDATE_HISTORY_FILE);
  fs.writeFileSync(file, JSON.stringify(items.slice(0, 40), null, 2), "utf8");
}

function appendUpdateHistory(item) {
  const next = [{
    at: Date.now(),
    ...item,
  }, ...readUpdateHistory()];
  writeUpdateHistory(next);
  sendToRenderer("its:update-history", next);
}

function compareVersion(a, b) {
  const left = String(a || "0").replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const right = String(b || "0").replace(/^v/i, "").split(".").map((part) => Number(part) || 0);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "user-agent": "ITS Maps Windows" } }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    }).on("error", reject);
  });
}

function downloadFile(url, destination, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.rmSync(destination, { force: true });
        downloadFile(res.headers.location, destination, onProgress).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        fs.rmSync(destination, { force: true });
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const total = Number(res.headers["content-length"]) || 0;
      let done = 0;
      res.on("data", (chunk) => {
        done += chunk.length;
        if (total) onProgress(Math.round((done / total) * 100));
      });
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => resolve(destination));
      });
    }).on("error", (err) => {
      file.close();
      fs.rmSync(destination, { force: true });
      reject(err);
    });
  });
}

async function checkForUpdates({ autoInstall = false } = {}) {
  const current = app.getVersion();
  appendUpdateHistory({ status: "checking", message: "Memeriksa pembaruan", current });
  sendToRenderer("its:update-status", { status: "checking", message: "Memeriksa pembaruan", current });

  try {
    const manifest = await fetchJson(APP_UPDATE_URL);
    const latest = manifest.versionName || manifest.version || current;
    const url = manifest.windowsUrl || manifest.desktopUrl || "";
    if (compareVersion(latest, current) <= 0 || !url) {
      const item = { status: "up-to-date", message: `Versi terbaru sudah terpasang (${current})`, current, latest };
      appendUpdateHistory(item);
      sendToRenderer("its:update-status", item);
      showSystemNotification({ title: "ITS Maps Windows update", body: "You are up to date", route: "updates" });
      return item;
    }

    const updateDir = path.join(app.getPath("userData"), "updates");
    fs.mkdirSync(updateDir, { recursive: true });
    const destination = path.join(updateDir, WINDOWS_EXE_NAME);
    appendUpdateHistory({ status: "downloading", message: `Mengunduh versi ${latest}`, current, latest });
    await downloadFile(url, destination, (progress) => {
      sendToRenderer("its:update-status", {
        status: "downloading",
        message: `Mengunduh pembaruan ${progress}%`,
        progress,
        current,
        latest,
      });
    });

    const downloaded = {
      status: "downloaded",
      message: `Pembaruan ${latest} siap diinstall`,
      current,
      latest,
      filePath: destination,
    };
    appendUpdateHistory(downloaded);
    sendToRenderer("its:update-status", downloaded);
    showSystemNotification({ title: "Update ITS Maps siap", body: "Installer pembaruan sudah selesai diunduh", route: "updates" });

    if (autoInstall) {
      appendUpdateHistory({ status: "installing", message: "Menjalankan installer pembaruan", current, latest });
      spawn(destination, ["/S"], { detached: true, stdio: "ignore" }).unref();
      forceQuit = true;
      app.quit();
    }
    return downloaded;
  } catch (err) {
    const failed = { status: "failed", message: err.message || "Gagal memeriksa pembaruan", current };
    appendUpdateHistory(failed);
    sendToRenderer("its:update-status", failed);
    showSystemNotification({ title: "Update ITS Maps gagal", body: failed.message, route: "updates" });
    return failed;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 700,
    title: "ITS Maps Windows",
    backgroundColor: "#111827",
    icon: iconPath(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (pendingRoute) {
      sendToRenderer("its:navigate", pendingRoute);
      pendingRoute = null;
    }
  });

  mainWindow.on("close", (event) => {
    if (forceQuit) return;
    event.preventDefault();
    mainWindow.hide();
    showSystemNotification({
      title: "ITS Maps tetap aktif",
      body: "Notifikasi Raspberry, kamera, dan update tetap berjalan di background.",
      route: "home",
      silent: true,
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadFile(rendererPath()).catch((err) => {
    console.error("[ITS Maps Windows] Renderer failed:", err);
    mainWindow.show();
  });
}

app.setName("ITS Maps Windows");
if (process.platform === "win32") {
  app.setAppUserModelId("id.ac.telkomuniversity.its.maps.windows");
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on("second-instance", (_event, argv) => {
  const link = argv.find((arg) => APP_PROTOCOLS.some((protocol) => arg.startsWith(`${protocol}:`)));
  focusWindow(link ? parseRouteFromUrl(link) : "home");
});

APP_PROTOCOLS.forEach((protocol) => {
  try {
    app.setAsDefaultProtocolClient(protocol);
  } catch {
    // Ignore registration failure in unpacked/dev mode.
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ensureTray();
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "geolocation" || permission === "media" || permission === "notifications");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "geolocation" || permission === "media" || permission === "notifications";
  });

  ipcMain.handle("its:get-current-position", readWindowsLocation);
  ipcMain.handle("its:open-location-settings", () => shell.openExternal("ms-settings:privacy-location"));
  ipcMain.handle("its:notify", (_event, payload) => showSystemNotification(payload));
  ipcMain.handle("its:check-update", (_event, options) => checkForUpdates(options));
  ipcMain.handle("its:get-update-history", () => readUpdateHistory());
  ipcMain.handle("its:open-external", (_event, url) => shell.openExternal(String(url || "")));

  createWindow();
  void checkForUpdates({ autoInstall: false });
});

app.on("activate", () => focusWindow("home"));

app.on("before-quit", () => {
  forceQuit = true;
});
