const fs = require("node:fs");

exports.default = async function appxManifestCreated(manifestPath) {
  let manifest = fs.readFileSync(manifestPath, "utf8");

  if (!manifest.includes('Name="Microsoft.WindowsAppRuntime.1.8"')) {
    const dependency = [
      '    <PackageDependency Name="Microsoft.WindowsAppRuntime.1.8"',
      '      Publisher="CN=Microsoft Corporation, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"',
      '      MinVersion="8000.879.2017.0" />',
    ].join("\n");
    manifest = manifest.replace("</Dependencies>", `${dependency}\n  </Dependencies>`);
  }
  if (!manifest.includes('Name="Microsoft.WindowsAppRuntime.1.8"')) {
    throw new Error("Unable to add the Windows App Runtime dependency to AppxManifest.xml.");
  }

  if (!manifest.includes("<uap:LockScreen")) {
    manifest = manifest.replace(
      /(\s*)<uap:DefaultTile\b/,
      '$1<uap:LockScreen Notification="badgeAndTileText" BadgeLogo="assets\\BadgeLogo.png" />\n$1<uap:DefaultTile'
    );
  }
  if (!manifest.includes("<uap:LockScreen")) {
    throw new Error("Unable to add the ITS Maps lock screen declaration to AppxManifest.xml.");
  }

  fs.writeFileSync(manifestPath, manifest, "utf8");
};
