const { onRequest } = require("firebase-functions/v2/https");
const { extractCanvaDeck } = require("./canva-importer.cjs");

exports.canvaImport = onRequest({
  region: "asia-southeast1",
  timeoutSeconds: 90,
  memory: "512MiB",
  cors: true,
}, async (request, response) => {
  if (request.method !== "GET" && request.method !== "POST") {
    response.set("Allow", "GET, POST");
    response.status(405).json({ ok: false, error: "Method tidak didukung." });
    return;
  }

  try {
    const url = String(request.query.url || request.body?.url || "").trim();
    const maxSlides = Math.min(Math.max(Number(request.query.maxSlides || request.body?.maxSlides || 80) || 80, 1), 120);
    const data = await extractCanvaDeck(url, { maxSlides });
    response.set("Cache-Control", "no-store");
    response.status(200).json({ ok: true, ...data });
  } catch (error) {
    response.set("Cache-Control", "no-store");
    response.status(400).json({ ok: false, error: friendlyError(error) });
  }
});

function friendlyError(error) {
  if (!error) return "Import Canva gagal.";
  return error instanceof Error ? error.message : String(error);
}
