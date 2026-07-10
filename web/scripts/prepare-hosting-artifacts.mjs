import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const appUpdatePath = path.join(webRoot, "public", "app-update.json");
const appsDir = path.join(webRoot, "dist", "artifacts", "apps");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function keepHostingArtifacts() {
  if (!fs.existsSync(appsDir)) return;
  const update = readJson(appUpdatePath);
  const fileName = typeof update.fileName === "string" ? update.fileName : "ITS-Maps-Android-latest.apk";
  const keep = new Set([
    `${fileName}.b64`,
    "ITS-Maps-Android-latest.apk.b64",
  ]);

  let removed = 0;
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (keep.has(entry.name)) continue;
    fs.rmSync(path.join(appsDir, entry.name), { force: true });
    removed += 1;
  }
  console.log(`prepare-hosting-artifacts: kept ${Array.from(keep).join(", ")}; removed ${removed} old app artifact(s).`);
}

keepHostingArtifacts();
