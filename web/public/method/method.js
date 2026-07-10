
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
