const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function findManifestTool() {
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return "";

  const binDir = path.join(programFilesX86, "Windows Kits", "10", "bin");
  if (!fs.existsSync(binDir)) return "";

  const candidates = [
    path.join(binDir, "x64", "mt.exe"),
    ...fs.readdirSync(binDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(binDir, entry.name, "x64", "mt.exe"))
      .sort((left, right) => right.localeCompare(left)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const manifestTool = findManifestTool();
  if (!manifestTool) throw new Error("Windows SDK mt.exe was not found.");

  const manifestPath = path.join(context.appOutDir, "its-maps.exe.manifest");
  execFileSync(manifestTool, [
    "-nologo",
    `-inputresource:${executable};#1`,
    `-out:${manifestPath}`,
  ]);

  try {
    let manifest = fs.readFileSync(manifestPath, "utf8");
    if (!manifest.includes("<dpiAwareness")) {
      const dpiAwareness = '<asmv3:windowsSettings><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness></asmv3:windowsSettings>';
      manifest = manifest.replace("</asmv3:application>", `${dpiAwareness}</asmv3:application>`);
      if (!manifest.includes("<dpiAwareness")) {
        throw new Error("Unable to add PerMonitorV2 to the Electron manifest.");
      }
      fs.writeFileSync(manifestPath, manifest, "utf8");
      execFileSync(manifestTool, [
        "-nologo",
        `-manifest`,
        manifestPath,
        `-outputresource:${executable};#1`,
      ]);
    }
  } finally {
    fs.rmSync(manifestPath, { force: true });
  }
};
