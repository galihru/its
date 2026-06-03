import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
const distDir = join(root, "dist");
const apkDir = join(distDir, "apk");

const versionName = process.env.ITS_VERSION_NAME || "1.0.0";
const versionCode = Number.parseInt(process.env.ITS_VERSION_CODE || "1", 10);
const apkFileName = process.env.APK_FILE_NAME || `its-${versionName}-${versionCode}.apk`;
const publicAppUrl = (process.env.PUBLIC_APP_URL || "https://itstelkom.web.app").replace(/\/+$/, "");
const publicApkBaseUrl = (process.env.PUBLIC_APK_BASE_URL || `${publicAppUrl}/apk`).replace(/\/+$/, "");
const apkPath = join(apkDir, apkFileName);
const apkBytes = readFileSync(apkPath);
const apkStat = statSync(apkPath);
const sha256 = createHash("sha256").update(apkBytes).digest("hex");
const updatedAt = new Date().toISOString();

const versionedUrl = `${publicApkBaseUrl}/${apkFileName}`;
const latestUrl = process.env.PUBLIC_APK_LATEST_URL || (process.env.PUBLIC_APK_BASE_URL ? versionedUrl : `${publicApkBaseUrl}/its-latest.apk`);

const manifest = {
  appId: "id.ac.telkomuniversity.its",
  appName: "ITS",
  ownerName: "Hanifa Septhi Larasati",
  institution: "Telkom University",
  versionCode: Number.isFinite(versionCode) ? versionCode : 1,
  versionName,
  apkUrl: versionedUrl,
  downloadUrl: latestUrl,
  latestUrl,
  fileName: apkFileName,
  sizeBytes: apkStat.size,
  sha256,
  updatedAt,
  force: false,
  autoDownload: true,
  minSupportedVersionCode: 1,
  logoUrl: `${publicAppUrl}/favicon.svg`,
  source: {
    provider: "github-actions",
    runNumber: process.env.GITHUB_RUN_NUMBER || "",
    commit: process.env.GITHUB_SHA || "",
  },
  deepLinks: {
    open: "its://open",
    map: "its://map",
    chart: "its://chart",
  },
  releaseNotes: [
    "Modal update APK menampilkan logo, nama aplikasi, versi saat ini, versi terbaru, dan catatan pembaruan.",
    "Notifikasi Android muncul saat ada APK ITS versi baru dan membuka modal update ketika ditekan.",
    "Widget Alert dan Full Data ikut menampilkan info update APK dari database realtime.",
    "APK terbaru dipublish otomatis dan metadata update ditulis ke Firebase database /apk.",
  ],
};

mkdirSync(distDir, { recursive: true });
mkdirSync(apkDir, { recursive: true });
writeFileSync(join(distDir, "app-update.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(apkDir, "app-update.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(distDir, "app-release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(join(distDir, "apk-release.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote APK manifest for ${apkFileName}`);
console.log(`SHA-256: ${sha256}`);
