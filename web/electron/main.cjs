const { app, BrowserWindow, Menu, Notification, shell, session, ipcMain } = require("electron");
const { execFile, spawn } = require("node:child_process");
const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const APP_UPDATE_URL = "https://itstelkom.web.app/app-update.json";
const WINDOWS_EXE_NAME = "ITS-Maps-Windows-Custom-Setup-1.0.12-x64.exe";
const UPDATE_HISTORY_FILE = "update-history.json";
let mainWindow = null;
let updateTimer = null;
let forceQuit = false;

function iconPath() {
  const candidates = [
    path.join(__dirname, "..", "src", "icon", "its.png"),
    path.join(__dirname, "..", "public", "its.png"),
    path.join(process.resourcesPath || "", "app.asar", "src", "icon", "its.png"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || path.join(__dirname, "..", "public", "its.png");
}

function readWindowsLocation() {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, error: "unsupported-platform" });
  }

  const script = `
Add-Type -AssemblyName System.Device
$watcher = New-Object System.Device.Location.GeoCoordinateWatcher ([System.Device.Location.GeoPositionAccuracy]::High)
$started = $watcher.TryStart($false, [TimeSpan]::FromSeconds(10))
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
      timeout: 14_000,
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
          resolve({ ok: true, lat, lng, accuracy: Number(parsed.accuracy) || undefined, source: "windows-location" });
          return;
        }
        resolve({ ok: false, error: parsed.error || "windows-location-unknown" });
      } catch {
        resolve({ ok: false, error: "windows-location-parse-failed" });
      }
    });
  });
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function updateHistoryPath() {
  return path.join(app.getPath("userData"), UPDATE_HISTORY_FILE);
}

function readUpdateHistory() {
  try {
    return JSON.parse(fs.readFileSync(updateHistoryPath(), "utf8"));
  } catch {
    return [];
  }
}

function appendUpdateHistory(item) {
  const history = readUpdateHistory();
  history.push({ ...item, at: new Date().toISOString() });
  const trimmed = history.slice(-80);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(updateHistoryPath(), JSON.stringify(trimmed, null, 2));
  sendToRenderer("its:update-history", trimmed);
}

function compareVersion(left, right) {
  const a = String(left || "0").split(".").map((part) => Number(part) || 0);
  const b = String(right || "0").split(".").map((part) => Number(part) || 0);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
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
        } catch (error) {
          reject(error);
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
      file.on("finish", () => file.close(() => resolve(destination)));
    }).on("error", (error) => {
      file.close();
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

function notifyUpdate(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, icon: iconPath() }).show();
}

async function checkForUpdates({ autoInstall = false } = {}) {
  const current = app.getVersion();
  const checking = { status: "checking", message: "Memeriksa pembaruan", current };
  appendUpdateHistory(checking);
  sendToRenderer("its:update-status", checking);

  try {
    const manifest = await fetchJson(APP_UPDATE_URL);
    const latest = manifest.versionName || manifest.version || current;
    const updateUrl = manifest.windowsUrl || manifest.desktopUrl || "";

    if (!updateUrl || compareVersion(latest, current) <= 0) {
      const item = { status: "up-to-date", message: `Versi terbaru sudah terpasang (${current})`, current, latest };
      appendUpdateHistory(item);
      sendToRenderer("its:update-status", item);
      return item;
    }

    const updateDir = path.join(app.getPath("userData"), "updates");
    fs.mkdirSync(updateDir, { recursive: true });
    const destination = path.join(updateDir, WINDOWS_EXE_NAME);
    const downloading = { status: "downloading", message: `Mengunduh versi ${latest}`, current, latest, progress: 0 };
    appendUpdateHistory(downloading);
    sendToRenderer("its:update-status", downloading);

    await downloadFile(updateUrl, destination, (progress) => {
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
    notifyUpdate("Update ITS Maps siap", "Pembaruan akan dipasang otomatis.");

    if (autoInstall) {
      const installing = { status: "installing", message: "Menjalankan custom setup secara silent", current, latest };
      appendUpdateHistory(installing);
      sendToRenderer("its:update-status", installing);
      spawn(destination, ["--silent", "--run-after-install"], { detached: true, stdio: "ignore" }).unref();
      forceQuit = true;
      app.quit();
    }

    return downloaded;
  } catch (error) {
    const failed = { status: "failed", message: error.message || "Gagal memeriksa pembaruan", current };
    appendUpdateHistory(failed);
    sendToRenderer("its:update-status", failed);
    notifyUpdate("Update ITS Maps gagal", failed.message);
    return failed;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    title: "ITS Maps Windows",
    backgroundColor: "#171b20",
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
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[ITS Maps Windows] Renderer load failed (${errorCode}): ${errorDescription} - ${validatedUrl}`);
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const resourceRendererPath = path.join(process.resourcesPath, "dist", "desktop", "renderer.html");
    const asarRendererPath = path.join(__dirname, "..", "dist", "desktop", "renderer.html");
    const rendererPath = fs.existsSync(resourceRendererPath) ? resourceRendererPath : asarRendererPath;
    mainWindow.loadFile(rendererPath).catch((error) => {
      console.error("[ITS Maps Windows] Renderer loadFile failed:", error);
      mainWindow?.show();
    });
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "geolocation" || permission === "media" || permission === "notifications");
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === "geolocation" || permission === "media" || permission === "notifications";
  });

  ipcMain.handle("its:get-current-position", readWindowsLocation);
  ipcMain.handle("its:open-location-settings", () => {
    shell.openExternal("ms-settings:privacy-location");
    return true;
  });
  ipcMain.handle("its:check-update", (_event, options) => checkForUpdates(options || {}));
  ipcMain.handle("its:get-update-history", () => readUpdateHistory());

  createWindow();
  setTimeout(() => void checkForUpdates({ autoInstall: true }), 10_000);
  updateTimer = setInterval(() => void checkForUpdates({ autoInstall: true }), 6 * 60 * 60 * 1000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  forceQuit = true;
  if (updateTimer) clearInterval(updateTimer);
});
