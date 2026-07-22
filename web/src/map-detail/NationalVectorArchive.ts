import { Protocol } from "pmtiles";

const FALLBACK_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const DEFAULT_ARCHIVE_URL = "https://its.hanifahseptiani45.workers.dev/v1/map/archive/indonesia.pmtiles";

let protocolInstalled = false;

export async function nationalVectorStyle(maplibregl: any): Promise<string | Record<string, unknown>> {
  const archiveUrl = String(import.meta.env.VITE_INDONESIA_PMTILES_URL || DEFAULT_ARCHIVE_URL).trim();
  if (!archiveUrl) return FALLBACK_STYLE_URL;
  if (!protocolInstalled) {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolInstalled = true;
  }
  try {
    const archiveResponse = await fetch(archiveUrl, { method: "HEAD", cache: "no-store" });
    if (!archiveResponse.ok || !/bytes/i.test(archiveResponse.headers.get("Accept-Ranges") || "")) {
      throw new Error(`archive HTTP ${archiveResponse.status}`);
    }
    const response = await fetch(FALLBACK_STYLE_URL, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`style HTTP ${response.status}`);
    const style = await response.json() as Record<string, any>;
    const sources = style.sources && typeof style.sources === "object" ? style.sources : {};
    Object.values(sources).forEach((source: any) => {
      if (source?.type !== "vector") return;
      delete source.tiles;
      source.url = `pmtiles://${archiveUrl}`;
    });
    style.name = "ITS Maps Indonesia National Vector 3D";
    style.metadata = {
      ...(style.metadata || {}),
      "its:archive": archiveUrl,
      "its:data": "OpenStreetMap Indonesia snapshot, tiled by ITS Maps",
    };
    return style;
  } catch {
    return FALLBACK_STYLE_URL;
  }
}
