
window.addEventListener("DOMContentLoaded", () => {
  const query = new URLSearchParams(window.location.search);
  if (query.has("pdf")) {
    document.body.classList.add("pdf-source-mode");
    document.querySelectorAll(".source-file").forEach((details) => { details.open = true; });
  }

  let printOpenedDetails = [];
  const preparePrint = () => {
    if (document.querySelector("[data-pdf-app]")) return;
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

  document.querySelectorAll(".nav-more").forEach((details) => {
    const panel = details.querySelector("div");
    let startY = 0;
    let currentY = 0;
    if (!panel) return;
    const mobileNav = () => window.matchMedia("(max-width: 820px)").matches;
    panel.addEventListener("pointerdown", (event) => {
      if (!mobileNav()) return;
      startY = event.clientY;
      currentY = 0;
      panel.classList.add("is-dragging");
      panel.setPointerCapture?.(event.pointerId);
    });
    panel.addEventListener("pointermove", (event) => {
      if (!mobileNav() || !startY) return;
      currentY = Math.max(0, event.clientY - startY);
      panel.style.transform = "translateY(" + currentY + "px)";
    });
    const finish = () => {
      if (!startY) return;
      panel.classList.remove("is-dragging");
      panel.style.transform = "";
      if (currentY > 90) details.open = false;
      startY = 0;
      currentY = 0;
    };
    panel.addEventListener("pointerup", finish);
    panel.addEventListener("pointercancel", finish);
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
  const paper = document.querySelector("[data-pdf-paper-shell]");
  const stage = document.querySelector(".pdf-stage");
  const pageGrid = document.querySelector("[data-pdf-page-grid]");
  const coverPageEl = document.querySelector("[data-pdf-cover-page]");
  const sidebar = document.querySelector(".pdf-sidebar");
  const sidebarScrim = document.querySelector("[data-pdf-sidebar-scrim]");
  const searchPanel = document.querySelector("[data-pdf-search-panel]");
  const searchInput = document.querySelector("[data-pdf-search-input]");
  const searchCountEl = document.querySelector("[data-pdf-search-count]");
  let pageObserver;
  let activeDoc;
  let zoom = 1;
  let totalPages = 1;
  let pageWidth = 794;
  let pageHeight = 1123;
  let currentColumns = 1;
  let renderedPages = new Map();
  let pageNodes = [];
  let searchMatches = [];
  let activeSearchIndex = -1;
  let searchTimer = 0;

  const setZoom = (next) => {
    zoom = Math.min(1.6, Math.max(0.45, next));
    pdfApp.style.setProperty("--pdf-zoom", String(zoom));
    updateColumns();
    updateCurrentPage();
  };

  const absoluteUrl = (url) => new URL(url, window.location.origin).href;
  const isMobile = () => window.matchMedia("(max-width: 820px)").matches;
  const escapeRegex = (value) => value.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");

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

  const setActiveTab = (name) => {
    document.querySelectorAll("[data-pdf-tab]").forEach((item) => item.setAttribute("aria-selected", item.getAttribute("data-pdf-tab") === name ? "true" : "false"));
    document.querySelectorAll("[data-pdf-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.getAttribute("data-pdf-panel") === name));
  };

  const openSidebar = (tab = "details") => {
    setActiveTab(tab);
    pdfApp.classList.remove("is-sidebar-closed");
    requestAnimationFrame(updateColumns);
  };

  const closeSidebar = () => {
    pdfApp.classList.add("is-sidebar-closed");
    requestAnimationFrame(updateColumns);
  };

  const toggleSidebar = () => {
    if (pdfApp.classList.contains("is-sidebar-closed")) openSidebar();
    else closeSidebar();
  };

  const prepareInnerFrame = (iframe, pageIndex = 0) => {
    const scrollY = pageIndex * pageHeight;
    const apply = () => {
      try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        doc.body.style.width = pageWidth + "px";
        win.scrollTo(0, scrollY);
        doc.documentElement.scrollTop = scrollY;
        doc.body.scrollTop = scrollY;
        doc.documentElement.style.overflow = "hidden";
        doc.body.style.overflow = "hidden";
        requestAnimationFrame(() => win.scrollTo(0, scrollY));
      } catch {}
    };
    iframe.addEventListener("load", apply, { once: true });
    if (iframe.contentDocument?.readyState === "complete") apply();
  };

  const detachPage = (node) => {
    const index = Number(node.dataset.pageIndex || 0);
    const current = renderedPages.get(index);
    if (!current) return;
    current.remove();
    renderedPages.delete(index);
    node.classList.remove("is-rendered");
  };

  const attachPage = (node) => {
    const index = Number(node.dataset.pageIndex || 0);
    if (!activeDoc || renderedPages.has(index)) return renderedPages.get(index);
    node.classList.add("is-loading");
    const viewport = document.createElement("div");
    viewport.className = "pdf-page-viewport";
    const iframe = document.createElement("iframe");
    iframe.title = (activeDoc.label || "ITS Maps") + " halaman " + (index + 1);
    iframe.loading = "lazy";
    iframe.setAttribute("scrolling", "no");
    iframe.src = activeDoc.source;
    iframe.addEventListener("load", () => node.classList.remove("is-loading"), { once: true });
    prepareInnerFrame(iframe, index);
    viewport.appendChild(iframe);
    node.appendChild(viewport);
    node.classList.add("is-rendered");
    renderedPages.set(index, viewport);
    return viewport;
  };

  const rebuildObserver = () => {
    pageObserver?.disconnect();
    if (!stage) return;
    pageObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const node = entry.target;
        if (entry.isIntersecting) attachPage(node);
        else if (renderedPages.size > Math.max(4, currentColumns * 3)) detachPage(node);
      });
    }, { root: stage, rootMargin: "360px 120px" });
    pageNodes.forEach((node) => pageObserver.observe(node));
  };

  const buildPages = (count) => {
    if (!pageGrid) return;
    pageGrid.innerHTML = "";
    renderedPages.forEach((node) => node.remove());
    renderedPages = new Map();
    totalPages = Math.max(1, count);
    pageNodes = [];
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < totalPages; i += 1) {
      const page = document.createElement("article");
      page.className = "pdf-page";
      page.dataset.pageIndex = String(i);
      page.setAttribute("aria-label", "Halaman " + (i + 1));
      const label = document.createElement("span");
      label.className = "pdf-page-label";
      label.textContent = String(i + 1);
      page.appendChild(label);
      fragment.appendChild(page);
      pageNodes.push(page);
    }
    pageGrid.appendChild(fragment);
    if (pagesEl) pagesEl.textContent = String(totalPages);
    rebuildObserver();
    updateColumns();
    requestAnimationFrame(() => {
      pageNodes.slice(0, Math.max(2, currentColumns * 2)).forEach((node) => attachPage(node));
    });
    updateCurrentPage();
  };

  const attachAllPagesForPrint = () => {
    pageObserver?.disconnect();
    pageNodes.forEach((node) => {
      node.classList.add("is-print-queued");
      const viewport = attachPage(node);
      viewport?.querySelector("iframe")?.setAttribute("loading", "eager");
    });
  };

  const restoreLazyPagesAfterPrint = () => {
    const current = Math.max(0, Number(pageEl?.textContent || "1") - 1);
    const keepRadius = Math.max(4, currentColumns * 2);
    pageNodes.forEach((node, index) => {
      node.classList.remove("is-print-queued");
      if (Math.abs(index - current) > keepRadius) detachPage(node);
    });
    rebuildObserver();
    updateCurrentPage();
  };

  const updateColumns = () => {
    if (!stage) return;
    const gap = Math.max(16, 28 * zoom);
    const pageScaledWidth = (paper?.classList.contains("is-rotated") ? pageHeight : pageWidth) * zoom;
    const available = Math.max(280, stage.clientWidth - (isMobile() ? 24 : 32));
    const natural = Math.max(1, Math.floor((available + gap) / (pageScaledWidth + gap)));
    const maxColumns = zoom >= 0.95 ? 1 : zoom >= 0.72 ? 2 : zoom >= 0.56 ? 3 : 4;
    currentColumns = Math.max(1, Math.min(maxColumns, natural));
    pdfApp.style.setProperty("--pdf-columns", String(currentColumns));
  };

  const scrollToPage = (pageNumber) => {
    if (!stage || !pageNodes.length) return;
    const index = Math.min(totalPages - 1, Math.max(0, pageNumber - 1));
    pageNodes[index]?.scrollIntoView({ block: "start", inline: "nearest", behavior: "smooth" });
    if (pageEl) pageEl.textContent = String(index + 1);
  };

  const updateCurrentPage = () => {
    if (!stage || !pageNodes.length) return;
    const stageRect = stage.getBoundingClientRect();
    let best = 0;
    let bestDistance = Infinity;
    for (const node of pageNodes) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom < stageRect.top || rect.top > stageRect.bottom) continue;
      const distance = Math.abs(rect.top - stageRect.top - 24);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(node.dataset.pageIndex || 0);
      }
    }
    pageNodes.forEach((node) => node.classList.toggle("is-current", Number(node.dataset.pageIndex || 0) === best));
    if (pageEl) pageEl.textContent = String(best + 1);
  };

  const renderCoverPage = () => {
    if (!coverPageEl || !activeDoc) return;
    coverPageEl.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.title = "Cover " + activeDoc.label;
    iframe.src = activeDoc.source;
    iframe.setAttribute("scrolling", "no");
    prepareInnerFrame(iframe, 0);
    coverPageEl.appendChild(iframe);
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
      pageWidth = Math.max(640, Math.round(frame.clientWidth || 794));
      pageHeight = Math.max(900, Math.round(frame.clientHeight || 1123));
      pdfApp.style.setProperty("--pdf-page-w", pageWidth + "px");
      pdfApp.style.setProperty("--pdf-page-h", pageHeight + "px");
      const height = Math.max(doc.documentElement.scrollHeight || 0, doc.body.scrollHeight || 0, pageHeight);
      buildPages(Math.ceil(height / pageHeight));
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
    renderCoverPage();
  };

  const loadDoc = (id, updateUrl = true) => {
    activeDoc = byId.get(id) || docs[0];
    if (!activeDoc || !frame) return;
    if (select) select.value = activeDoc.id;
    frame.src = activeDoc.source;
    if (pageGrid) pageGrid.innerHTML = "";
    pageNodes = [];
    renderedPages = new Map();
    searchMatches = [];
    activeSearchIndex = -1;
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
  });

  stage?.addEventListener("scroll", () => requestAnimationFrame(updateCurrentPage), { passive: true });
  window.addEventListener("resize", () => requestAnimationFrame(updateColumns));
  stage?.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });

  let pinchStart = 0;
  let pinchZoom = 1;
  stage?.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 2) return;
    const [a, b] = event.touches;
    pinchStart = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    pinchZoom = zoom;
  }, { passive: true });
  stage?.addEventListener("touchmove", (event) => {
    if (event.touches.length !== 2 || !pinchStart) return;
    const [a, b] = event.touches;
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setZoom(pinchZoom * (distance / pinchStart));
  }, { passive: true });

  document.querySelector("[data-pdf-sidebar-toggle]")?.addEventListener("click", toggleSidebar);
  sidebarScrim?.addEventListener("click", closeSidebar);
  document.querySelector("[data-pdf-sheet-close]")?.addEventListener("click", () => {
    if (isMobile()) closeSidebar();
  });
  let sheetDragStart = 0;
  let sheetWasClosed = false;
  sidebar?.addEventListener("pointerdown", (event) => {
    if (!isMobile()) return;
    sheetDragStart = event.clientY;
    sheetWasClosed = pdfApp.classList.contains("is-sidebar-closed");
    sidebar.classList.add("is-dragging");
    sidebar.setPointerCapture?.(event.pointerId);
  });
  sidebar?.addEventListener("pointermove", (event) => {
    if (!isMobile() || !sheetDragStart) return;
    const dy = event.clientY - sheetDragStart;
    if (sheetWasClosed) {
      const base = Math.max(34, sidebar.offsetHeight - 34);
      sidebar.style.transform = "translateY(" + Math.max(0, base + dy) + "px)";
    } else {
      sidebar.style.transform = "translateY(" + Math.max(0, dy) + "px)";
    }
  });
  const finishSheetDrag = (event) => {
    if (!isMobile() || !sheetDragStart) return;
    const dy = event.clientY - sheetDragStart;
    sidebar?.classList.remove("is-dragging");
    if (sidebar) sidebar.style.transform = "";
    if (sheetWasClosed ? dy < -42 : dy < 90) openSidebar();
    else closeSidebar();
    sheetDragStart = 0;
  };
  sidebar?.addEventListener("pointerup", finishSheetDrag);
  sidebar?.addEventListener("pointercancel", finishSheetDrag);
  document.querySelector("[data-pdf-zoom-in]")?.addEventListener("click", () => setZoom(zoom + 0.1));
  document.querySelector("[data-pdf-zoom-out]")?.addEventListener("click", () => setZoom(zoom - 0.1));
  document.querySelector("[data-pdf-rotate]")?.addEventListener("click", () => {
    paper?.classList.toggle("is-rotated");
    requestAnimationFrame(updateColumns);
  });
  document.querySelector("[data-pdf-fullscreen]")?.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else pdfApp.requestFullscreen?.();
  });
  document.querySelector("[data-pdf-search]")?.addEventListener("click", () => {
    if (!searchPanel) return;
    searchPanel.hidden = !searchPanel.hidden;
    if (!searchPanel.hidden) searchInput?.focus();
  });

  const runSearch = () => {
    const term = searchInput?.value.trim() || "";
    searchMatches = [];
    activeSearchIndex = -1;
    if (!term) {
      if (searchCountEl) searchCountEl.textContent = "0 hasil";
      return;
    }
    try {
      const text = frame.contentDocument?.body?.innerText || "";
      const pattern = new RegExp(escapeRegex(term), "gi");
      let match;
      while ((match = pattern.exec(text)) && searchMatches.length < 5000) {
        searchMatches.push({ index: match.index, total: text.length });
      }
      if (searchCountEl) searchCountEl.textContent = searchMatches.length + " hasil";
      if (searchMatches.length) goSearch(1);
    } catch {
      if (searchCountEl) searchCountEl.textContent = "Pencarian tidak tersedia";
    }
  };

  const goSearch = (direction) => {
    if (!searchMatches.length) return;
    activeSearchIndex = (activeSearchIndex + direction + searchMatches.length) % searchMatches.length;
    const hit = searchMatches[activeSearchIndex];
    const page = Math.max(1, Math.min(totalPages, Math.ceil((hit.index / Math.max(1, hit.total)) * totalPages)));
    scrollToPage(page);
    if (searchCountEl) searchCountEl.textContent = (activeSearchIndex + 1) + " / " + searchMatches.length + " hasil";
    try { frame.contentWindow.find(searchInput.value, false, direction < 0); } catch {}
  };

  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 180);
  });
  document.querySelector("[data-pdf-search-prev]")?.addEventListener("click", () => goSearch(-1));
  document.querySelector("[data-pdf-search-next]")?.addEventListener("click", () => goSearch(1));
  document.querySelector("[data-pdf-search-close]")?.addEventListener("click", () => { if (searchPanel) searchPanel.hidden = true; });
  document.querySelector("[data-pdf-print]")?.addEventListener("click", () => {
    attachAllPagesForPrint();
    window.setTimeout(() => window.print(), 700);
  });
  window.addEventListener("beforeprint", attachAllPagesForPrint);
  window.addEventListener("afterprint", restoreLazyPagesAfterPrint);
  document.querySelector("[data-pdf-cite]")?.addEventListener("click", async () => {
    const text = (titleEl?.textContent || activeDoc?.label || "ITS Maps") + ". Hanifa Teams. " + absoluteUrl(activeDoc?.article || "/documentation");
    try { await navigator.clipboard.writeText(text); } catch {}
  });
  document.querySelectorAll("[data-pdf-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveTab(tab.getAttribute("data-pdf-tab"));
    });
  });
  document.querySelectorAll("[data-pdf-rail]").forEach((button) => {
    button.addEventListener("click", async () => {
      const type = button.getAttribute("data-pdf-rail");
      if (type === "link") {
        const url = absoluteUrl("/pdf-preview/" + encodeURIComponent(activeDoc?.id || "documentation"));
        try { await navigator.clipboard.writeText(url); } catch {}
      } else if (type === "toc") {
        openSidebar("relations");
      } else if (type === "image") {
        scrollToPage(1);
      } else {
        openSidebar("details");
      }
    });
  });

  if (isMobile()) closeSidebar();
  loadDoc(initialPdfId, false);
});
