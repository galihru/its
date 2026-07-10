
window.addEventListener("DOMContentLoaded", () => {
  const query = new URLSearchParams(window.location.search);
  if (query.has("pdf")) {
    document.body.classList.add("pdf-source-mode");
    document.querySelectorAll(".source-file").forEach((details) => { details.open = true; });
  }

  let printOpenedDetails = [];
  const preparePrint = () => {
    printOpenedDetails = [];
    document.body.classList.add("is-printing-all");
    document.querySelectorAll("details.source-file").forEach((details) => {
      if (!details.open) printOpenedDetails.push(details);
      details.open = true;
    });
  };
  const restorePrint = () => {
    if (query.has("pdf")) return;
    printOpenedDetails.forEach((details) => { details.open = false; });
    printOpenedDetails = [];
    document.body.classList.remove("is-printing-all");
  };
  window.addEventListener("beforeprint", preparePrint);
  window.addEventListener("afterprint", restorePrint);
  document.querySelectorAll("[data-print]").forEach((button) => button.addEventListener("click", () => {
    preparePrint();
    window.print();
  }));
  if (window.mermaid) window.mermaid.initialize({ startOnLoad: true, securityLevel: "loose", theme: "neutral" });

  const loadQr = (() => {
    let promise;
    return () => {
      if (window.QRCode) return Promise.resolve(window.QRCode);
      if (!promise) {
        promise = new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
          script.async = true;
          script.onload = () => resolve(window.QRCode);
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      return promise;
    };
  })();

  const drawLogo = (canvas) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const size = Math.round(canvas.width * 0.22);
      const x = Math.round((canvas.width - size) / 2);
      const y = Math.round((canvas.height - size) / 2);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      const radius = Math.round(size * 0.22);
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + size - radius, y);
      ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
      ctx.lineTo(x + size, y + size - radius);
      ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
      ctx.lineTo(x + radius, y + size);
      ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();
      ctx.drawImage(img, x + 6, y + 6, size - 12, size - 12);
    };
    img.src = "/its.png";
  };

  const renderQr = (box) => {
    const url = box.getAttribute("data-qr");
    if (!url || box.dataset.qrReady === "1") return;
    box.dataset.qrReady = "1";
    box.classList.add("is-loading");
    loadQr()
      .then((QRCode) => {
        box.classList.remove("is-loading");
        const canvas = document.createElement("canvas");
        canvas.setAttribute("aria-label", box.getAttribute("data-qr-label") || "QR code");
        box.innerHTML = "";
        box.appendChild(canvas);
        const caption = document.createElement("span");
        caption.textContent = box.getAttribute("data-qr-label") || "QR Code";
        box.appendChild(caption);
        QRCode.toCanvas(canvas, url, { width: 124, margin: 1, errorCorrectionLevel: "H", color: { dark: "#122033", light: "#ffffff" } }, () => drawLogo(canvas));
      })
      .catch(() => {
        box.classList.remove("is-loading");
        box.classList.add("is-error");
        box.textContent = "QR gagal dimuat";
      });
  };

  document.querySelectorAll("[data-qr]").forEach(renderQr);

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

  const pdfApp = document.querySelector("[data-pdf-app]");
  if (!pdfApp) return;

  const catalogEl = document.getElementById("pdf-doc-catalog");
  const docs = catalogEl ? JSON.parse(catalogEl.textContent || "[]") : [];
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const pathId = window.location.pathname.split("/").filter(Boolean).pop();
  const initialPdfId = query.get("id") || (byId.has(pathId) ? pathId : document.querySelector("[data-initial-pdf-id]")?.getAttribute("data-initial-pdf-id")) || "documentation";
  const select = document.querySelector("[data-pdf-select]");
  const frame = document.querySelector("[data-pdf-frame]");
  const titleEl = document.querySelector("[data-pdf-title]");
  const summaryEl = document.querySelector("[data-pdf-summary]");
  const coverEl = document.querySelector("[data-pdf-cover]");
  const kindEl = document.querySelector("[data-pdf-kind]");
  const articleEl = document.querySelector("[data-pdf-article]");
  const downloadEl = document.querySelector("[data-pdf-download]");
  const metaEl = document.querySelector("[data-pdf-meta]");
  const pageEl = document.querySelector("[data-pdf-page]");
  const pagesEl = document.querySelector("[data-pdf-pages]");
  const qrEl = document.querySelector("[data-pdf-qr]");
  const paper = document.querySelector(".pdf-paper-shell");
  let activeDoc;
  let zoom = 1;

  const setZoom = (next) => {
    zoom = Math.min(1.7, Math.max(0.55, next));
    pdfApp.style.setProperty("--pdf-zoom", String(zoom));
  };

  const absoluteUrl = (url) => new URL(url, window.location.origin).href;

  const fillMeta = (pairs) => {
    if (!metaEl) return;
    metaEl.innerHTML = pairs
      .filter(([, value]) => value)
      .map(([key, value]) => "<div><dt>" + key + "</dt><dd>" + value + "</dd></div>")
      .join("");
  };

  const syncQr = (url) => {
    if (!qrEl) return;
    const slug = "pdf-" + (activeDoc?.id || "documentation");
    qrEl.removeAttribute("data-qr");
    qrEl.setAttribute("data-qr-static", slug);
    qrEl.innerHTML = [
      "<span class=\"qr-stack\">",
      "<img class=\"qr-image\" src=\"/method/assets/qr/" + slug + ".svg\" alt=\"QR code preview\">",
      "<img class=\"qr-logo\" src=\"/its.png\" alt=\"\">",
      "</span>",
      "<span>QR Preview</span>"
    ].join("");
  };

  const updateFromFrame = () => {
    if (!frame || !activeDoc) return;
    let detected = {};
    try {
      const doc = frame.contentDocument;
      const cover = doc.querySelector(".print-cover");
      const hero = doc.querySelector(".doc-hero");
      detected.title = (cover?.querySelector("h1") || hero?.querySelector("h1") || doc.querySelector("h1"))?.textContent?.trim();
      detected.summary = (cover?.querySelector("p:last-of-type") || hero?.querySelector("p:last-of-type") || doc.querySelector("p"))?.textContent?.trim();
      const img = cover?.querySelector("img") || hero?.querySelector("img");
      detected.cover = img ? img.getAttribute("src") : "";
      detected.meta = Array.from(cover?.querySelectorAll("dl div") || []).map((item) => {
        const dt = item.querySelector("dt")?.textContent?.trim() || "";
        const dd = item.querySelector("dd")?.textContent?.trim() || "";
        return [dt, dd];
      });
      const pageEstimate = Math.max(1, Math.ceil((doc.documentElement.scrollHeight || doc.body.scrollHeight || 1122) / 1122));
      if (pagesEl) pagesEl.textContent = String(pageEstimate);
    } catch {
      detected = {};
    }
    const title = detected.title || activeDoc.label;
    const summary = detected.summary || "Preview dokumen ITS Maps dengan toolbar, sidebar metadata, QR, dan print/save PDF.";
    if (titleEl) titleEl.textContent = title;
    if (summaryEl) summaryEl.textContent = summary;
    if (coverEl) coverEl.src = detected.cover ? absoluteUrl(detected.cover) : "/method/assets/its.png";
    if (kindEl) kindEl.textContent = activeDoc.kind || "Documentation";
    if (articleEl) {
      articleEl.href = activeDoc.article;
      articleEl.textContent = activeDoc.kind === "DOCX template" ? "Download document page" : "View article page";
    }
    if (downloadEl) downloadEl.href = activeDoc.download || activeDoc.article || activeDoc.source;
    fillMeta([
      ["Document ID", activeDoc.id],
      ["Type", activeDoc.kind],
      ["Publisher", "Hanifa Teams"],
      ["Developer", "Hanifa Septhi Larasati"],
      ["Source", activeDoc.article],
      ...(detected.meta || []),
    ]);
    syncQr("/pdf-preview/" + encodeURIComponent(activeDoc.id));
  };

  const loadDoc = (id, updateUrl = true) => {
    activeDoc = byId.get(id) || docs[0];
    if (!activeDoc || !frame) return;
    if (select) select.value = activeDoc.id;
    frame.src = activeDoc.source;
    if (pageEl) pageEl.textContent = "1";
    if (pagesEl) pagesEl.textContent = "...";
    if (updateUrl) {
      window.history.replaceState(null, "", "/pdf-preview/" + encodeURIComponent(activeDoc.id));
    }
  };

  if (select) {
    select.innerHTML = docs.map((doc) => "<option value=\"" + doc.id + "\">" + doc.label + "</option>").join("");
    select.addEventListener("change", () => loadDoc(select.value));
  }

  frame?.addEventListener("load", () => {
    updateFromFrame();
    try {
      frame.contentWindow.addEventListener("scroll", () => {
        const doc = frame.contentDocument;
        const page = Math.max(1, Math.floor((doc.documentElement.scrollTop || doc.body.scrollTop || 0) / 1122) + 1);
        if (pageEl) pageEl.textContent = String(page);
      }, { passive: true });
    } catch {}
  });

  document.querySelector("[data-pdf-sidebar-toggle]")?.addEventListener("click", () => pdfApp.classList.toggle("is-sidebar-closed"));
  document.querySelector("[data-pdf-zoom-in]")?.addEventListener("click", () => setZoom(zoom + 0.1));
  document.querySelector("[data-pdf-zoom-out]")?.addEventListener("click", () => setZoom(zoom - 0.1));
  document.querySelector("[data-pdf-rotate]")?.addEventListener("click", () => paper?.classList.toggle("is-rotated"));
  document.querySelector("[data-pdf-fullscreen]")?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else pdfApp.requestFullscreen?.();
  });
  document.querySelector("[data-pdf-search]")?.addEventListener("click", () => {
    const term = window.prompt("Cari dalam dokumen:");
    if (!term) return;
    try { frame.contentWindow.find(term); } catch {}
  });
  document.querySelector("[data-pdf-print]")?.addEventListener("click", () => {
    try { frame.contentWindow.print(); } catch { window.print(); }
  });
  document.querySelector("[data-pdf-cite]")?.addEventListener("click", async () => {
    const text = (titleEl?.textContent || activeDoc?.label || "ITS Maps") + ". Hanifa Teams. " + absoluteUrl(activeDoc?.article || "/documentation");
    try { await navigator.clipboard.writeText(text); } catch {}
  });
  document.querySelectorAll("[data-pdf-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-pdf-tab");
      document.querySelectorAll("[data-pdf-tab]").forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
      document.querySelectorAll("[data-pdf-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.getAttribute("data-pdf-panel") === name));
    });
  });
  document.querySelectorAll("[data-pdf-rail]").forEach((button) => {
    button.addEventListener("click", async () => {
      const type = button.getAttribute("data-pdf-rail");
      if (type === "link") {
        const url = absoluteUrl("/pdf-preview/" + encodeURIComponent(activeDoc?.id || "documentation"));
        try { await navigator.clipboard.writeText(url); } catch {}
      } else {
        pdfApp.classList.remove("is-sidebar-closed");
      }
    });
  });

  loadDoc(initialPdfId, false);
});
