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
const apkPath = join(apkDir, apkFileName);
const apkBytes = readFileSync(apkPath);
const apkStat = statSync(apkPath);
const sha256 = createHash("sha256").update(apkBytes).digest("hex");
const updatedAt = new Date().toISOString();

const versionedUrl = `${publicAppUrl}/apk/${apkFileName}`;
const latestUrl = `${publicAppUrl}/apk/its-latest.apk`;

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
    "Build APK otomatis saat kode diupload ke GitHub.",
    "APK dipublish ke Firebase Hosting dan metadata ditulis ke database /apk.",
    "Website menampilkan modal update Android dengan download APK terbaru.",
    "Deep link its://map dan its://chart tetap terhubung ke aplikasi ITS.",
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
