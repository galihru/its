import "./presentation.css";

import JSZip from "jszip";
import { runPptAiPipeline } from "./ppt-ai-pipeline";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInAnonymously, type User } from "firebase/auth";
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onChildAdded,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from "firebase/database";
import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import {
  AdbDaemonWebUsbDeviceManager,
  type AdbDaemonWebUsbDevice,
  type AdbDaemonWebUsbConnection,
} from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCjF1ukhniubgZf4K-zNaY9EdB8Yq8wAsg",
  authDomain: "itstelkom.firebaseapp.com",
  databaseURL: "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "itstelkom",
  storageBucket: "itstelkom.firebasestorage.app",
  messagingSenderId: "224371234284",
  appId: "1:224371234284:web:e2b2f4711fae246a545cc9",
};

const SLIDE_WIDTH = 960;
const SLIDE_HEIGHT = 540;
const BROADCAST_SCALE = 2;
const SAVE_DELAY = 450;
const MIRROR_INTERVAL = 260;
const PPTX_EMU_PER_INCH = 914400;
const PPTX_FONT_SCALE = 1;
const DEFAULT_PPTX_SLIDE = { cx: 12192000, cy: 6858000 };
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
};
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

type Role = "owner" | "editor" | "viewer";
type TextVariant = "title" | "body";
type ElementAnimation = "" | "appear" | "fade" | "fly" | "wipe" | "zoom" | "motion";
type TextElement = {
  id: string;
  type: "text";
  variant: TextVariant;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  insetLeft?: number;
  insetRight?: number;
  insetTop?: number;
  insetBottom?: number;
  lineHeight?: number;
  animation?: ElementAnimation;
};
type PhoneElement = {
  id: string;
  type: "phone";
  x: number;
  y: number;
  w: number;
  h: number;
  deviceSerial: string | null;
  deviceLabel?: string;
  animation?: ElementAnimation;
};
type ImageElement = {
  id: string;
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt?: string;
  animation?: ElementAnimation;
};
type CanvasElement = {
  id: string;
  type: "canvas";
  x: number;
  y: number;
  w: number;
  h: number;
  src: string;
  alt?: string;
  animation?: ElementAnimation;
};
type ShapeElement = {
  id: string;
  type: "shape";
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "ellipse" | "line";
  fill?: string;
  stroke?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  insetLeft?: number;
  insetRight?: number;
  insetTop?: number;
  insetBottom?: number;
  lineHeight?: number;
  tableId?: string;
  tableRow?: number;
  tableCol?: number;
  animation?: ElementAnimation;
};
type SlideElement = TextElement | PhoneElement | ImageElement | CanvasElement | ShapeElement;
type Slide = { id: string; name: string; notes: string; elements: SlideElement[]; transition?: string; section?: string };
type Deck = { title: string; slides: Slide[] };
type PresentationState = {
  currentSlide: number;
  presenting: boolean;
  presenterSession?: string | null;
  updatedAt?: number;
};
type PresentationRecord = {
  ownerUid: string;
  visibility: "public";
  deck: Deck;
  state: PresentationState;
  createdAt: number;
  updatedAt: number;
};
type CursorPresence = {
  x: number;
  y: number;
  slide: number;
  visible: boolean;
  target?: string;
  targetId?: string;
  editing?: string;
  updatedAt?: number;
};
type PresenceRecord = { uid: string; sessionId: string; name: string; role: Role; color: string; lastSeen: number | object; slide?: number; cursor?: CursorPresence };
type ProjectIndexRecord = { title: string; updatedAt: number; createdAt: number };
type CollaborationPacket = { uid: string; name: string; deck: Deck; updatedAt: number };
type ConnectedAdb = { device: AdbDaemonWebUsbDevice; connection: AdbDaemonWebUsbConnection; adb: Adb; label: string };
type MirrorState = { running: boolean; lastUrl: string | null };
type BrowserUsbDevice = {
  manufacturerName?: string;
  productName?: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  configurations?: Array<{ interfaces?: Array<{ interfaceNumber: number; alternates?: Array<{ interfaceClass: number; interfaceSubclass: number; interfaceProtocol: number }> }> }>;
};
type BrowserUsbConnectionEvent = { device: unknown };
type BrowserUsbApi = {
  getDevices(): Promise<BrowserUsbDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (event: BrowserUsbConnectionEvent) => void): void;
};
type MenuItem = {
  label?: string;
  icon?: string;
  shortcut?: string;
  disabled?: () => boolean;
  checked?: () => boolean;
  action?: () => void | Promise<void>;
  items?: MenuItem[];
  separator?: boolean;
};
type PptxRelationship = { id: string; target: string; type: string };
type PptxRunStyle = Pick<TextElement, "fontFamily" | "fontSize" | "color" | "bold" | "italic" | "underline" | "align" | "insetLeft" | "insetRight" | "insetTop" | "insetBottom" | "lineHeight">;

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T => {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Elemen UI tidak ditemukan: ${selector}`);
  return found;
};
const uid = (prefix = "id") => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 14)}`;
const clone = <T>(value: T): T => structuredClone(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isEditableRole = () => role === "owner" || role === "editor";

const savedParticipantName = localStorage.getItem("its-presentasi-name") || localStorage.getItem("its-presentasi-anonymous-name") || sessionStorage.getItem("its-presentasi-name") || "";
let participantName = savedParticipantName || `Anonymous ${Math.floor(1000 + Math.random() * 9000)}`;
if (!localStorage.getItem("its-presentasi-name") && !localStorage.getItem("its-presentasi-anonymous-name")) {
  localStorage.setItem("its-presentasi-anonymous-name", participantName);
}
sessionStorage.setItem("its-presentasi-name", participantName);

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const params = new URLSearchParams(location.search);
const emulatorMode = params.get("emulator") === "1";
const localMode = params.get("local") === "1" || params.get("test") === "1";
if (emulatorMode) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
}

let firebaseUser: User;
let projectId = params.get("p") || "";
let editorToken = params.get("edit") || "";
let role: Role = params.get("view") === "1" ? "viewer" : editorToken ? "editor" : "owner";
let deck: Deck = defaultDeck();
let presentationState: PresentationState = { currentSlide: 0, presenting: false };
let projectCreatedAt = 0;
let currentSlide = 0;
let slideDragIndex = -1;
let presenterSlide = 0;
let followingPresenter = true;
let selectedElementId: string | null = null;
let zoom = 1;
let fitZoom = 1;
let saveTimer = 0;
let presenceTimer = 0;
let toastTimer = 0;
let audienceChromeTimer = 0;
let remoteUnsubscribe: Unsubscribe | null = null;
let presenceUnsubscribe: Unsubscribe | null = null;
let collaborationUnsubscribe: Unsubscribe | null = null;
let rtcViewerUnsubscribe: Unsubscribe | null = null;
let activePresencePath = "";
let presenceSessionId = "";
let lastCursorSent = 0;
let lastCursorPoint: CursorPresence | null = null;
let applyingRemote = false;
let deleteTarget = "";
let lastAppliedCollaboration = 0;
let broadcastTimer = 0;
let broadcastStream: MediaStream | null = null;
let presenterRequestUnsubscribe: Unsubscribe | null = null;
let viewerPeer: RTCPeerConnection | null = null;
const presenterPeers = new Map<string, { peer: RTCPeerConnection; unsubscribers: Unsubscribe[] }>();
const runtimeUnsubscribers: Unsubscribe[] = [];
const connectedDevices = new Map<string, ConnectedAdb>();
const mirrorStates = new Map<string, MirrorState>();
const frameImages = new Map<string, HTMLImageElement>();
const deckImages = new Map<string, HTMLImageElement>();
const undoStack: Deck[] = [];
const redoStack: Deck[] = [];
let lastHistoryJson = "";
let activeMenuButton: HTMLElement | null = null;
let showSpeakerNotes = true;
let joinedSharedProject = false;
let activePresenceRecords: PresenceRecord[] = [];

const usbManager = AdbDaemonWebUsbDeviceManager.BROWSER;
const credentialStore = new AdbWebCredentialStore(`PrezADB@${location.hostname}`);

function defaultDeck(): Deck {
  return {
    title: "Presentasi tanpa judul",
    slides: [{
      id: uid("slide"),
      name: "Slide 1",
      notes: "",
      elements: [
        { id: uid("el"), type: "text", variant: "title", x: 74, y: 226, w: 812, h: 74, text: "Klik - tambahkan judul", fontSize: 50, color: "#000000" },
        { id: uid("el"), type: "text", variant: "body", x: 126, y: 324, w: 708, h: 58, text: "Klik - tambahkan subjudul", fontSize: 30, color: "#5f6368" },
      ],
    }],
  };
}

function cleanColor(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const color = value.trim();
  return /^#[0-9a-f]{6}$/i.test(color) || /^rgba?\(/i.test(color) ? color.slice(0, 64) : fallback;
}

function cleanAnimation(value: unknown): ElementAnimation {
  return ["appear", "fade", "fly", "wipe", "zoom", "motion"].includes(String(value)) ? value as ElementAnimation : "";
}

function cleanFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[;"<>]/g, "").trim().slice(0, 80);
  return cleaned || undefined;
}

function cleanStyleFields(item: Record<string, unknown>): PptxRunStyle & { animation?: ElementAnimation } {
  const style: PptxRunStyle & { animation?: ElementAnimation } = {};
  const fontFamily = cleanFontFamily(item.fontFamily);
  const fontSize = clamp(Number(item.fontSize) || 0, 6, 120);
  const color = cleanColor(item.color);
  if (fontFamily) style.fontFamily = fontFamily;
  if (fontSize) style.fontSize = fontSize;
  if (color) style.color = color;
  if (item.bold === true) style.bold = true;
  if (item.italic === true) style.italic = true;
  if (item.underline === true) style.underline = true;
  if (["left", "center", "right"].includes(String(item.align))) style.align = item.align as TextElement["align"];
  for (const key of ["insetLeft", "insetRight", "insetTop", "insetBottom"] as const) {
    const value = Number(item[key]);
    if (Number.isFinite(value)) style[key] = clamp(value, 0, 72);
  }
  const lineHeight = Number(item.lineHeight);
  if (Number.isFinite(lineHeight)) style.lineHeight = clamp(lineHeight, 0.7, 2.4);
  const animation = cleanAnimation(item.animation);
  if (animation) style.animation = animation;
  return style;
}

function sanitizeDeck(input: unknown): Deck {
  if (!input || typeof input !== "object") return defaultDeck();
  const raw = input as Partial<Deck>;
  const slides = Array.isArray(raw.slides) ? raw.slides.slice(0, 200).map((slide, index): Slide => {
    const source = slide && typeof slide === "object" ? slide as Partial<Slide> : {};
    const elements = Array.isArray(source.elements) ? source.elements.slice(0, 500).flatMap((element): SlideElement[] => {
      if (!element || typeof element !== "object") return [];
      const item = element as Partial<SlideElement> & Record<string, unknown>;
      const base = {
        id: typeof item.id === "string" ? item.id.slice(0, 80) : uid("el"),
        x: clamp(Number(item.x) || 0, -SLIDE_WIDTH, SLIDE_WIDTH * 2),
        y: clamp(Number(item.y) || 0, -SLIDE_HEIGHT, SLIDE_HEIGHT * 2),
        w: clamp(Number(item.w) || 100, 20, SLIDE_WIDTH * 2),
        h: clamp(Number(item.h) || 50, 20, SLIDE_HEIGHT * 2),
      };
      if (item.type === "phone") {
        const animation = cleanAnimation(item.animation);
        const phone: PhoneElement = { ...base, type: "phone", deviceSerial: typeof item.deviceSerial === "string" ? item.deviceSerial.slice(0, 200) : null };
        if (typeof item.deviceLabel === "string" && item.deviceLabel) phone.deviceLabel = item.deviceLabel.slice(0, 160);
        if (animation) phone.animation = animation;
        return [phone];
      }
      if (item.type === "image" || item.type === "canvas") {
        const src = typeof item.src === "string" ? item.src : "";
        if (!/^data:image\//i.test(src) && !/^https?:\/\//i.test(src) && !src.startsWith("./")) return [];
        const animation = cleanAnimation(item.animation);
        const image: ImageElement | CanvasElement = {
          ...base,
          type: item.type === "canvas" ? "canvas" : "image",
          src: src.slice(0, 20_000_000),
          alt: typeof item.alt === "string" ? item.alt.slice(0, 240) : "",
        };
        if (animation) image.animation = animation;
        return [image];
      }
      if (item.type === "shape") {
        const animation = cleanAnimation(item.animation);
        const shape: ShapeElement = {
          ...base,
          type: "shape",
          shape: item.shape === "ellipse" ? "ellipse" : item.shape === "line" ? "line" : "rect",
          fill: cleanColor(item.fill, "transparent"),
          stroke: cleanColor(item.stroke, "#dadce0"),
          text: typeof item.text === "string" ? item.text.slice(0, 2000) : "",
          ...cleanStyleFields(item),
        };
        if (typeof item.tableId === "string") shape.tableId = item.tableId.slice(0, 80);
        if (Number.isFinite(Number(item.tableRow))) shape.tableRow = clamp(Number(item.tableRow), 0, 200);
        if (Number.isFinite(Number(item.tableCol))) shape.tableCol = clamp(Number(item.tableCol), 0, 200);
        if (animation) shape.animation = animation;
        return [shape];
      }
      if (item.type === "text") {
        const text: TextElement = { ...base, type: "text", variant: item.variant === "title" ? "title" : "body", text: typeof item.text === "string" ? item.text.slice(0, 10000) : "", ...cleanStyleFields(item) };
        if (["left", "center", "right"].includes(String(item.align))) text.align = item.align as TextElement["align"];
        return [text];
      }
      return [];
    }) : [];
    return {
      id: typeof source.id === "string" ? source.id.slice(0, 80) : uid("slide"),
      name: typeof source.name === "string" ? source.name.slice(0, 160) : `Slide ${index + 1}`,
      notes: typeof source.notes === "string" ? source.notes.slice(0, 10000) : "",
      transition: typeof source.transition === "string" ? source.transition.slice(0, 60) : "",
      section: typeof source.section === "string" ? source.section.slice(0, 120) : "",
      elements,
    };
  }) : [];
  return { title: typeof raw.title === "string" ? raw.title.slice(0, 200) : "Presentasi tanpa judul", slides: slides.length ? slides : defaultDeck().slides };
}

function serializableDeck(): Deck {
  return sanitizeDeck(deck);
}

function current(): Slide {
  currentSlide = clamp(currentSlide, 0, deck.slides.length - 1);
  return deck.slides[currentSlide];
}

function selected(): SlideElement | null {
  return current().elements.find((element) => element.id === selectedElementId) || null;
}

function elementLabel(element: SlideElement | null): string {
  if (!element) return current().name || `Slide ${currentSlide + 1}`;
  if (element.type === "text") {
    const preview = element.text.replace(/\s+/g, " ").trim().slice(0, 36);
    return preview ? `Teks: ${preview}` : "Kotak teks";
  }
  if (element.type === "image" || element.type === "canvas") return element.alt ? `Canvas: ${element.alt.slice(0, 34)}` : "Canvas";
  if (element.type === "phone") return "Mockup HP / ADB";
  return element.text ? `Bentuk: ${element.text.slice(0, 34)}` : `Bentuk ${element.shape}`;
}

function elementAtSlidePoint(x: number, y: number, slideIndex = currentSlide): SlideElement | null {
  const slide = deck.slides[clamp(slideIndex, 0, deck.slides.length - 1)];
  if (!slide) return null;
  for (const element of [...slide.elements].reverse()) {
    if (x >= element.x && x <= element.x + element.w && y >= element.y && y <= element.y + element.h) return element;
  }
  return null;
}

function log(message: string, notify = false): void {
  const time = new Date().toLocaleTimeString("id-ID", { hour12: false });
  const target = $("#connection-log");
  const row = document.createElement("div");
  row.textContent = `[${time}] ${message}`;
  target.append(row);
  target.scrollTop = target.scrollHeight;
  if (notify) toast(message);
}

function toast(message: string): void {
  const target = $("#toast");
  target.textContent = message;
  target.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => target.classList.remove("show"), 3300);
}

function setSaveState(state: "saved" | "saving" | "error", message?: string): void {
  const target = $("#save-state");
  target.className = `save-state ${state === "saved" ? "" : state}`;
  $("span:last-child", target).textContent = message || (state === "saved" ? "Tersimpan" : state === "saving" ? "Menyimpan..." : "Gagal menyimpan");
}

function randomColor(value: string): string {
  const palette = ["#1a73e8", "#7b1fa2", "#00897b", "#e65100", "#c2185b", "#3949ab", "#2e7d32"];
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function shortInitials(name: string): string {
  return name.split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("").slice(0, 2);
}

function formatDateTime(value: number | undefined): string {
  return value ? new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "Belum disimpan";
}

function buildUrl(options: { view?: boolean; edit?: string } = {}): string {
  const url = new URL("./", location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("p", projectId);
  if (options.view) url.searchParams.set("view", "1");
  if (options.edit) url.searchParams.set("edit", options.edit);
  if (emulatorMode) url.searchParams.set("emulator", "1");
  return url.href;
}

function homeUrl(): string {
  const url = new URL("./", location.href);
  url.search = "";
  url.hash = "";
  if (emulatorMode) url.searchParams.set("emulator", "1");
  return url.href;
}

function ownerEditorTokenKey(): string {
  return `prezadb-edit-token:${firebaseUser.uid}:${projectId}`;
}

function getOrCreateEditorToken(rotate = false): string {
  let token = rotate ? "" : localStorage.getItem(ownerEditorTokenKey()) || "";
  if (!token) {
    token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
    localStorage.setItem(ownerEditorTokenKey(), token);
  }
  return token;
}

async function boot(): Promise<void> {
  try {
    if (localMode) {
      firebaseUser = { uid: "local-presentasi-user" } as User;
      projectId ||= "local";
      projectCreatedAt = Date.now();
      presentationState = { currentSlide: 0, presenting: false, updatedAt: Date.now() };
      $("#hub-user-name").textContent = participantName;
      showEditor();
      return;
    }
    $("#boot-note").textContent = emulatorMode ? "Menghubungkan emulator Firebase lokal" : "Masuk sebagai pengunjung anonim";
    const credential = await signInAnonymously(auth);
    firebaseUser = credential.user;
    $("#hub-user-name").textContent = participantName;
    if (!projectId) {
      await showProjectHub();
    } else {
      await openProject();
    }
  } catch (error) {
    console.error(error);
    $("#boot-note").textContent = `Firebase gagal: ${friendlyError(error)}`;
    toast("Firebase Anonymous Authentication perlu diaktifkan untuk memakai presentasi.");
  }
}

function friendlyError(error: unknown): string {
  const message = String((error as { message?: string })?.message || error || "Kesalahan tidak diketahui");
  if (message.includes("auth/operation-not-allowed")) return "Anonymous Authentication belum diaktifkan di Firebase Console.";
  if (message.includes("PERMISSION_DENIED")) return "Database Rules belum mengizinkan fitur presentasi.";
  if (message.toLowerCase().includes("network")) return "koneksi jaringan tidak tersedia.";
  return message;
}

async function showProjectHub(): Promise<void> {
  cleanupProjectRuntime();
  $("#boot-screen").setAttribute("hidden", "");
  $("#editor-app").setAttribute("hidden", "");
  $("#audience-view").setAttribute("hidden", "");
  $("#share-entry").setAttribute("hidden", "");
  $("#project-hub").removeAttribute("hidden");
  const indexRef = ref(db, `presentationUsers/${firebaseUser.uid}/projects`);
  let latestRecords: Record<string, ProjectIndexRecord> | null = null;
  const renderProjects = async (records: Record<string, ProjectIndexRecord> | null) => {
    const list = $("#project-list");
    list.innerHTML = "";
    const search = ($("#project-search") as HTMLInputElement).value.trim().toLowerCase();
    const entries = Object.entries(records || {})
      .filter(([, item]) => !search || (item?.title || "Presentasi tanpa judul").toLowerCase().includes(search))
      .sort((a, b) => Number(b[1]?.updatedAt || 0) - Number(a[1]?.updatedAt || 0));
    $("#empty-projects").toggleAttribute("hidden", entries.length !== 0);
    for (const [id, item] of entries) {
      const card = document.createElement("article");
      card.className = "project-card";
      card.innerHTML = `<div class="project-preview"></div><div class="project-meta"><div class="project-card-actions"><strong></strong><button class="project-delete" title="Hapus project">⋮</button></div><span></span></div>`;
      $("strong", card).textContent = item?.title || "Presentasi tanpa judul";
      $(".project-delete", card).textContent = "...";
      const preview = $(".project-preview", card);
      void get(ref(db, `presentations/${id}/deck`)).then((deckSnapshot) => {
        const projectDeck = sanitizeDeck(deckSnapshot.val());
        preview.innerHTML = "";
        preview.classList.add("has-preview");
        preview.append(createSlidePreview(projectDeck.slides[0], "project-slide-preview"));
      }).catch(() => undefined);
      $(".project-meta span", card).textContent = `Diubah ${formatDateTime(item?.updatedAt)}`;
      card.addEventListener("click", () => navigateToProject(id));
      $(".project-delete", card).addEventListener("click", (event) => {
        event.stopPropagation();
        deleteTarget = id;
        ($("#confirm-dialog") as HTMLDialogElement).showModal();
      });
      list.append(card);
    }
  };
  runtimeUnsubscribers.push(onValue(indexRef, (snapshot) => {
    latestRecords = snapshot.val() as Record<string, ProjectIndexRecord> | null;
    void renderProjects(latestRecords);
  }));
  $("#project-search").addEventListener("input", () => void renderProjects(latestRecords));
}

function templateDeck(kind: string): Deck {
  const base = defaultDeck();
  if (!kind) return base;
  const palettes: Record<string, [string, string, string]> = {
    photo: ["#e8f0fe", "#1a73e8", "Album Foto"],
    wedding: ["#fce8e6", "#b3261e", "Pernikahan"],
    portfolio: ["#e6f4ea", "#188038", "Portofolio"],
    collection: ["#fff7e6", "#b06000", "Buku Koleksi"],
    pitch: ["#e8eaed", "#3c4043", "Pitch"],
  };
  const [fill, accent, title] = palettes[kind] || palettes.portfolio;
  return {
    title,
    slides: [{
      id: uid("slide"),
      name: "Slide 1",
      notes: "",
      elements: [
        { id: uid("el"), type: "shape", shape: "rect", x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT, fill, stroke: fill },
        { id: uid("el"), type: "shape", shape: "rect", x: 0, y: 498, w: SLIDE_WIDTH, h: 42, fill: accent, stroke: accent },
        { id: uid("el"), type: "text", variant: "title", x: 92, y: 184, w: 760, h: 82, text: title, fontSize: 48, color: "#202124" },
        { id: uid("el"), type: "text", variant: "body", x: 94, y: 274, w: 620, h: 54, text: "Klik untuk menambahkan subjudul", fontSize: 24, color: "#5f6368" },
      ],
    }],
  };
}

async function createProject(template = ""): Promise<void> {
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Date.now();
  const newDeck = templateDeck(template);
  const record: PresentationRecord = {
    ownerUid: firebaseUser.uid,
    visibility: "public",
    deck: newDeck,
    state: { currentSlide: 0, presenting: false, updatedAt: now },
    createdAt: now,
    updatedAt: now,
  };
  setSaveState("saving", "Membuat...");
  await set(ref(db, `presentations/${id}`), record);
  await set(ref(db, `presentationUsers/${firebaseUser.uid}/projects/${id}`), { title: newDeck.title, createdAt: now, updatedAt: now });
  projectId = id;
  projectCreatedAt = now;
  getOrCreateEditorToken();
  navigateToProject(id);
}

async function createCopyProject(): Promise<void> {
  if (!firebaseUser || !isEditableRole()) return;
  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = Date.now();
  const copiedDeck = sanitizeDeck({ ...serializableDeck(), title: `${deck.title || "Presentasi"} salinan` });
  const record: PresentationRecord = {
    ownerUid: firebaseUser.uid,
    visibility: "public",
    deck: copiedDeck,
    state: { currentSlide: 0, presenting: false, updatedAt: now },
    createdAt: now,
    updatedAt: now,
  };
  setSaveState("saving", "Membuat salinan...");
  await set(ref(db, `presentations/${id}`), record);
  await set(ref(db, `presentationUsers/${firebaseUser.uid}/projects/${id}`), { title: copiedDeck.title, createdAt: now, updatedAt: now });
  toast("Salinan presentasi dibuat.");
  navigateToProject(id);
}

function navigateToProject(id: string): void {
  const url = new URL("./", location.href);
  url.search = "";
  url.searchParams.set("p", id);
  if (emulatorMode) url.searchParams.set("emulator", "1");
  location.href = url.href;
}

async function openProject(): Promise<void> {
  const snapshot = await get(ref(db, `presentations/${projectId}`));
  if (!snapshot.exists()) {
    $("#boot-screen").setAttribute("hidden", "");
    toast("Presentasi tidak ditemukan atau sudah dihapus.");
    projectId = "";
    await showProjectHub();
    return;
  }
  const record = snapshot.val() as PresentationRecord;
  // Bare ?p= URLs are the owner workspace. Viewer/editor links use explicit view/edit params.
  deck = sanitizeDeck(record.deck);
  presentationState = record.state || { currentSlide: 0, presenting: false };
  projectCreatedAt = Number(record.createdAt) || Number(record.updatedAt) || 0;
  currentSlide = clamp(Number(presentationState.currentSlide) || 0, 0, deck.slides.length - 1);
  selectedElementId = null;
  resetHistoryBaseline();

  startRecordListener();
  if (role === "owner") {
    showEditor();
    startOwnerCollaborationListener();
    await startPresence();
  } else {
    showJoinGate(role);
  }
}

function showEditor(): void {
  $("#boot-screen").setAttribute("hidden", "");
  $("#project-hub").setAttribute("hidden", "");
  $("#audience-view").setAttribute("hidden", "");
  $("#share-entry").setAttribute("hidden", "");
  const app = $("#editor-app");
  app.removeAttribute("hidden");
  app.classList.toggle("readonly", !isEditableRole());
  $("#role-badge").textContent = role === "owner" ? "Pemilik" : "Editor kolaborasi";
  $("#share-button").toggleAttribute("hidden", role !== "owner");
  $("#present-button").innerHTML = role === "owner" ? "<span>▶</span><span>Slideshow</span>" : "Preview";
  if (role !== "owner") {
    $("#present-button").textContent = "Preview";
  }
  renderAll();
  requestAnimationFrame(fitWorkspace);
}

function showAudience(): void {
  $("#boot-screen").setAttribute("hidden", "");
  $("#project-hub").setAttribute("hidden", "");
  $("#editor-app").setAttribute("hidden", "");
  $("#share-entry").setAttribute("hidden", "");
  const audienceView = $("#audience-view");
  audienceView.removeAttribute("hidden");
  audienceView.classList.toggle("audience-viewer", role === "viewer");
  followingPresenter = true;
  presenterSlide = clamp(Number(presentationState.currentSlide) || 0, 0, deck.slides.length - 1);
  currentSlide = presenterSlide;
  renderAudienceSlide();
  resizeAudienceSlide();
  syncFullscreenButton();
  showAudienceChrome();
  if (presentationState.presenting && role !== "owner") void connectViewerRtc();
}

function showJoinGate(nextRole: Role): void {
  $("#boot-screen").setAttribute("hidden", "");
  $("#project-hub").setAttribute("hidden", "");
  $("#editor-app").setAttribute("hidden", "");
  $("#audience-view").setAttribute("hidden", "");
  const entry = $("#share-entry");
  entry.removeAttribute("hidden");
  $("#join-title").textContent = deck.title || "Presentasi tanpa judul";
  $("#join-mode-label").textContent = nextRole === "editor" ? "EDITOR" : "VIEWER";
  $("#join-role-title").textContent = nextRole === "editor" ? "Pilih editor sebagai apa" : "Pilih lihat sebagai apa";
  ($("#join-name") as HTMLInputElement).value = participantName;
  ($("#join-remember") as HTMLInputElement).checked = Boolean(localStorage.getItem("its-presentasi-name"));
  $("#join-meta").textContent = `${deck.slides.length} halaman · Dibuat ${formatDateTime(projectCreatedAt)}`;
  const previewList = $("#join-preview-list");
  previewList.innerHTML = "";
  deck.slides.slice(0, 3).forEach((slide, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "join-preview-card";
    item.append(createSlidePreview(slide, "join-slide-preview"));
    const label = document.createElement("span");
    label.textContent = `Slide ${index + 1}`;
    item.append(label);
    item.addEventListener("click", () => { currentSlide = index; renderJoinActivePreview(); });
    previewList.append(item);
  });
  renderJoinActivePreview();
}

function renderJoinActivePreview(): void {
  document.querySelectorAll<HTMLElement>(".join-preview-card").forEach((item, index) => item.classList.toggle("active", index === currentSlide));
}

async function enterSharedProject(): Promise<void> {
  const name = ($("#join-name") as HTMLInputElement).value.trim() || participantName;
  participantName = name;
  sessionStorage.setItem("its-presentasi-name", participantName);
  localStorage.setItem("its-presentasi-anonymous-name", participantName);
  if (($("#join-remember") as HTMLInputElement).checked) localStorage.setItem("its-presentasi-name", participantName);
  else localStorage.removeItem("its-presentasi-name");
  joinedSharedProject = true;
  if (role === "viewer") {
    showAudience();
    const fullscreen = document.fullscreenEnabled ? document.documentElement.requestFullscreen().catch(() => undefined) : Promise.resolve();
    await startPresence();
    await fullscreen;
  } else {
    showEditor();
    await startPresence();
  }
}

function startRecordListener(): void {
  remoteUnsubscribe?.();
  remoteUnsubscribe = onValue(ref(db, `presentations/${projectId}`), (snapshot) => {
    if (!snapshot.exists()) {
      toast("Presentasi telah dihapus pemilik.");
      setTimeout(() => { location.href = homeUrl(); }, 900);
      return;
    }
    const record = snapshot.val() as PresentationRecord;
    const nextDeck = sanitizeDeck(record.deck);
    const nextState = record.state || { currentSlide: 0, presenting: false };
    projectCreatedAt = Number(record.createdAt) || projectCreatedAt;
    const stateChanged = JSON.stringify(nextState) !== JSON.stringify(presentationState);
    const deckChanged = JSON.stringify(nextDeck) !== JSON.stringify(serializableDeck());
    presentationState = nextState;
    presenterSlide = clamp(Number(nextState.currentSlide) || 0, 0, nextDeck.slides.length - 1);
    if (role === "viewer" || (deckChanged && !saveTimer)) {
      applyingRemote = true;
      deck = nextDeck;
      currentSlide = role === "viewer" && !followingPresenter ? clamp(currentSlide, 0, deck.slides.length - 1) : presenterSlide;
      selectedElementId = null;
      if (role === "viewer") {
        if (joinedSharedProject) renderAudienceSlide();
        else renderJoinActivePreview();
      } else {
        renderAll();
      }
      applyingRemote = false;
    }
    if (role === "viewer" && stateChanged && joinedSharedProject) {
      if (followingPresenter) currentSlide = presenterSlide;
      renderAudienceSlide();
      if (followingPresenter && nextState.presenting && !viewerPeer) void connectViewerRtc();
      if ((!nextState.presenting || !followingPresenter) && viewerPeer) disconnectViewerRtc();
    }
  }, (error) => toast(`Sinkronisasi gagal: ${friendlyError(error)}`));
}

async function startPresence(): Promise<void> {
  const sessionKey = `its-presentasi-session:${projectId}:${role}`;
  const sessionId = sessionStorage.getItem(sessionKey) || `${firebaseUser.uid.slice(0, 10)}_${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem(sessionKey, sessionId);
  presenceSessionId = sessionId;
  activePresencePath = `presentationPresence/${projectId}/${sessionId}`;
  const presenceRef = ref(db, activePresencePath);
  const presence: PresenceRecord = { uid: firebaseUser.uid, sessionId, name: participantName, role, color: randomColor(participantName), lastSeen: serverTimestamp(), slide: currentSlide };
  await set(presenceRef, presence);
  await onDisconnect(presenceRef).remove();
  void removeDuplicatePresenceSessions(sessionId);
  clearInterval(presenceTimer);
  presenceTimer = window.setInterval(() => void update(presenceRef, { lastSeen: serverTimestamp(), role, slide: currentSlide }), 25000);
  presenceUnsubscribe?.();
  presenceUnsubscribe = onValue(ref(db, `presentationPresence/${projectId}`), (snapshot) => renderPresence((snapshot.val() || {}) as Record<string, PresenceRecord>));
}

async function removeDuplicatePresenceSessions(activeSessionId: string): Promise<void> {
  try {
    const snapshot = await get(ref(db, `presentationPresence/${projectId}`));
    const records = (snapshot.val() || {}) as Record<string, PresenceRecord>;
    const removals = Object.entries(records)
      .filter(([id, item]) => id !== activeSessionId && item?.uid === firebaseUser.uid && item?.name === participantName)
      .map(([id]) => remove(ref(db, `presentationPresence/${projectId}/${id}`)));
    await Promise.all(removals);
  } catch {
    // Presence cleanup is best-effort; the UI also dedupes stale entries.
  }
}

function updatePresenceSlide(): void {
  if (!activePresencePath) return;
  void update(ref(db, activePresencePath), { slide: currentSlide, lastSeen: serverTimestamp() }).catch(() => undefined);
}

function presenceTime(value: PresenceRecord): number {
  return typeof value.lastSeen === "number" ? value.lastSeen : Number(value.cursor?.updatedAt || 0);
}

function normalizePresenceRecords(records: Record<string, PresenceRecord>): PresenceRecord[] {
  const now = Date.now();
  const byPerson = new Map<string, PresenceRecord>();
  for (const item of Object.values(records)) {
    if (!item?.name) continue;
    const seen = presenceTime(item);
    if (seen && now - seen > 120000) continue;
    const key = `${item.uid}:${item.role}:${item.name}`;
    const previous = byPerson.get(key);
    if (!previous || presenceTime(previous) <= seen) byPerson.set(key, item);
  }
  return [...byPerson.values()].sort((a, b) => presenceTime(b) - presenceTime(a));
}

function updatePresenceCursor(cursor: CursorPresence, force = false): void {
  if (!activePresencePath) return;
  const now = Date.now();
  if (!force && now - lastCursorSent < 120) return;
  lastCursorSent = now;
  lastCursorPoint = sanitizeCursorPresence({ ...cursor, updatedAt: now });
  void update(ref(db, activePresencePath), { cursor: lastCursorPoint, slide: currentSlide, lastSeen: serverTimestamp() }).catch(() => undefined);
}

function sanitizeCursorPresence(cursor: CursorPresence): CursorPresence {
  const clean: CursorPresence = {
    x: Number.isFinite(cursor.x) ? cursor.x : 0,
    y: Number.isFinite(cursor.y) ? cursor.y : 0,
    slide: Number.isFinite(cursor.slide) ? cursor.slide : currentSlide,
    visible: Boolean(cursor.visible),
  };
  if (cursor.target) clean.target = cursor.target;
  if (cursor.targetId) clean.targetId = cursor.targetId;
  if (cursor.editing) clean.editing = cursor.editing;
  if (Number.isFinite(Number(cursor.updatedAt))) clean.updatedAt = Number(cursor.updatedAt);
  return clean;
}

function announceEditing(element: SlideElement | null): void {
  if (!element || !activePresencePath) return;
  const base = lastCursorPoint || {
    x: Math.round(element.x + element.w / 2),
    y: Math.round(element.y + Math.min(24, element.h / 2)),
    slide: currentSlide,
    visible: true,
  };
  updatePresenceCursor({
    ...base,
    slide: currentSlide,
    visible: true,
    target: elementLabel(element),
    targetId: element.id,
    editing: `Mengedit ${elementLabel(element)}`,
  }, true);
}

function hidePresenceCursor(): void {
  if (!lastCursorPoint) return;
  updatePresenceCursor({ ...lastCursorPoint, visible: false, updatedAt: Date.now() }, true);
}

function renderPresence(records: Record<string, PresenceRecord>): void {
  const active = normalizePresenceRecords(records).slice(0, 12);
  activePresenceRecords = active;
  const target = $("#presence-list");
  target.innerHTML = "";
  for (const item of active.slice(0, 5)) {
    const avatar = document.createElement("span");
    avatar.className = "presence-avatar";
    avatar.style.background = item.color || randomColor(item.name);
    avatar.title = `${item.name} • ${item.role}`;
    avatar.textContent = shortInitials(item.name);
    target.append(avatar);
  }
  $("#share-presence").textContent = `${active.length} orang sedang membuka presentasi ini.`;
  renderAudiencePeople();
  renderRemoteCursors();
}

function startOwnerCollaborationListener(): void {
  const token = getOrCreateEditorToken();
  collaborationUnsubscribe?.();
  collaborationUnsubscribe = onValue(ref(db, `presentationCollab/${projectId}/${token}`), (snapshot) => {
    const packets = Object.values((snapshot.val() || {}) as Record<string, CollaborationPacket>)
      .filter((packet) => packet?.deck && Number(packet.updatedAt) > lastAppliedCollaboration)
      .sort((a, b) => Number(a.updatedAt) - Number(b.updatedAt));
    const latest = packets.at(-1);
    if (!latest) return;
    lastAppliedCollaboration = Number(latest.updatedAt);
    applyingRemote = true;
    deck = sanitizeDeck(latest.deck);
    currentSlide = clamp(currentSlide, 0, deck.slides.length - 1);
    selectedElementId = null;
    applyingRemote = false;
    renderAll();
    scheduleSave(`Perubahan dari ${latest.name}`);
  });
}

function recordHistory(): void {
  const snapshot = serializableDeck();
  const json = JSON.stringify(snapshot);
  if (json === lastHistoryJson) return;
  if (lastHistoryJson) undoStack.push(JSON.parse(lastHistoryJson) as Deck);
  if (undoStack.length > 60) undoStack.shift();
  lastHistoryJson = json;
  redoStack.length = 0;
  updateHistoryButtons();
}

function resetHistoryBaseline(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  lastHistoryJson = JSON.stringify(serializableDeck());
  updateHistoryButtons();
}

function updateHistoryButtons(): void {
  ($("#undo") as HTMLButtonElement).disabled = !undoStack.length || !isEditableRole();
  ($("#redo") as HTMLButtonElement).disabled = !redoStack.length || !isEditableRole();
}

function undo(): void {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack.push(serializableDeck());
  deck = sanitizeDeck(previous);
  lastHistoryJson = JSON.stringify(deck);
  selectedElementId = null;
  renderAll();
  scheduleSave();
  updateHistoryButtons();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(serializableDeck());
  deck = sanitizeDeck(next);
  lastHistoryJson = JSON.stringify(deck);
  selectedElementId = null;
  renderAll();
  scheduleSave();
  updateHistoryButtons();
}

function scheduleSave(label = "Menyimpan…"): void {
  if (applyingRemote || !isEditableRole()) return;
  setSaveState("saving", label);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void persistDeck(), SAVE_DELAY);
}

async function persistDeck(): Promise<void> {
  saveTimer = 0;
  const cleanDeck = serializableDeck();
  const now = Date.now();
  if (localMode) {
    try {
      localStorage.setItem(`its-presentasi-local:${projectId}`, JSON.stringify({ deck: cleanDeck, updatedAt: now }));
    } catch {
      // Deck PPT raster HD can exceed browser localStorage quota in test mode.
    }
    setSaveState("saved");
    return;
  }
  try {
    if (role === "owner") {
      await Promise.all([
        set(ref(db, `presentations/${projectId}/deck`), cleanDeck),
        update(ref(db, `presentations/${projectId}`), { updatedAt: now }),
        set(ref(db, `presentationUsers/${firebaseUser.uid}/projects/${projectId}`), { title: cleanDeck.title, updatedAt: now, createdAt: projectCreatedAt || now }),
      ]);
    } else if (role === "editor" && editorToken) {
      const packet: CollaborationPacket = { uid: firebaseUser.uid, name: participantName, deck: cleanDeck, updatedAt: now };
      await set(ref(db, `presentationCollab/${projectId}/${editorToken}/${firebaseUser.uid}`), packet);
    }
    setSaveState("saved");
  } catch (error) {
    console.error(error);
    setSaveState("error");
    toast(`Gagal menyimpan: ${friendlyError(error)}`);
  }
}

function renderAll(): void {
  if (document.activeElement !== $("#deck-title")) ($("#deck-title") as HTMLInputElement).value = deck.title;
  renderSlideList();
  renderCanvas();
  renderProperties();
  renderDeviceSelect();
  syncInspectorMode();
  renderCounterAndNotes();
  updateHistoryButtons();
}

function createSlidePreview(slide: Slide | undefined, className = "mini-slide"): HTMLElement {
  const frame = document.createElement("div");
  frame.className = `mini-slide ${className}`;
  if (!slide) {
    frame.innerHTML = '<span class="mini-empty"></span>';
    return frame;
  }
  for (const element of slide.elements) {
    const node = document.createElement("span");
    node.className = `mini-element mini-${element.type}`;
    node.style.left = `${(element.x / SLIDE_WIDTH) * 100}%`;
    node.style.top = `${(element.y / SLIDE_HEIGHT) * 100}%`;
    node.style.width = `${(element.w / SLIDE_WIDTH) * 100}%`;
    node.style.height = `${(element.h / SLIDE_HEIGHT) * 100}%`;
    if (element.type === "text") {
      node.textContent = element.text || "";
      node.style.fontFamily = element.fontFamily || "";
      node.style.fontSize = `${Math.max(4, (element.fontSize || (element.variant === "title" ? 36 : 20)) * 0.12)}px`;
      node.style.color = element.color || (element.variant === "title" ? "#202124" : "#5f6368");
      node.style.fontWeight = element.bold || element.variant === "title" ? "600" : "400";
      node.style.fontStyle = element.italic ? "italic" : "";
      node.style.textDecoration = element.underline ? "underline" : "";
      node.style.textAlign = element.align || "";
    } else if (element.type === "image" || element.type === "canvas") {
      const image = document.createElement("img");
      image.src = element.src;
      image.alt = "";
      node.append(image);
    } else if (element.type === "shape") {
      node.classList.add(`mini-shape-${element.shape}`);
      node.style.background = element.shape === "line" ? "transparent" : element.fill || "transparent";
      node.style.borderColor = element.stroke || "#dadce0";
      node.textContent = element.text || "";
      node.style.color = element.color || "#202124";
    } else {
      node.innerHTML = '<i></i>';
    }
    frame.append(node);
  }
  return frame;
}

type SlideSegment = { label: string; start: number; end: number };

function slideSegmentLabel(index: number): string {
  const slide = deck.slides[index];
  return (slide?.section || slide?.name || `Slide ${index + 1}`).trim() || `Slide ${index + 1}`;
}

function slideSegments(): SlideSegment[] {
  const segments: SlideSegment[] = [];
  deck.slides.forEach((_, index) => {
    const label = slideSegmentLabel(index);
    const previous = segments.at(-1);
    if (previous && previous.label === label) previous.end = index;
    else segments.push({ label, start: index, end: index });
  });
  return segments;
}

function segmentForSlide(index: number): SlideSegment {
  return slideSegments().find((segment) => index >= segment.start && index <= segment.end) || { label: slideSegmentLabel(index), start: index, end: index };
}

function renderSegmentDialog(): void {
  const list = $("#segment-list");
  list.innerHTML = "";
  slideSegments().forEach((segment) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `segment-row${presenterSlide >= segment.start && presenterSlide <= segment.end ? " live-owner" : ""}${currentSlide >= segment.start && currentSlide <= segment.end ? " active" : ""}`;
    row.innerHTML = '<span class="segment-row-thumb"></span><span class="segment-row-copy"><strong></strong><em></em></span>';
    $(".segment-row-thumb", row).append(createSlidePreview(deck.slides[segment.start], "segment-slide-preview"));
    $("strong", row).textContent = segment.label;
    $("em", row).textContent = segment.start === segment.end ? `Slide ${segment.start + 1}` : `Slide ${segment.start + 1} - ${segment.end + 1}`;
    row.addEventListener("click", () => {
      ($("#segment-dialog") as HTMLDialogElement).close();
      goToAudienceSlide(segment.start);
    });
    list.append(row);
  });
}

function moveSlide(from: number, to: number): void {
  if (!isEditableRole() || from === to || from < 0 || to < 0 || from >= deck.slides.length || to >= deck.slides.length) return;
  const [slide] = deck.slides.splice(from, 1);
  deck.slides.splice(to, 0, slide);
  if (currentSlide === from) currentSlide = to;
  else if (from < currentSlide && to >= currentSlide) currentSlide -= 1;
  else if (from > currentSlide && to <= currentSlide) currentSlide += 1;
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
  if (presentationState.presenting && role === "owner") void publishSlideState();
}

function renameSlide(index: number): void {
  const slide = deck.slides[index];
  if (!slide || !isEditableRole()) return;
  const oldName = slide.name || `Slide ${index + 1}`;
  const next = prompt("Nama slide", oldName);
  if (next === null) return;
  const cleaned = next.trim().slice(0, 160);
  if (!cleaned) return;
  slide.name = cleaned;
  if (!slide.section || slide.section === oldName) slide.section = cleaned;
  recordHistory();
  renderAll();
  scheduleSave();
}

function renameSegment(index: number): void {
  if (!isEditableRole()) return;
  const segment = segmentForSlide(index);
  const next = prompt("Nama segment", segment.label);
  if (next === null) return;
  const cleaned = next.trim().slice(0, 120);
  if (!cleaned) return;
  for (let i = segment.start; i <= segment.end; i += 1) deck.slides[i].section = cleaned;
  recordHistory();
  renderAll();
  scheduleSave();
}

function setSlideSectionFromNeighbor(index: number, direction: -1 | 1): void {
  const slide = deck.slides[index];
  const neighbor = deck.slides[index + direction];
  if (!slide || !neighbor || !isEditableRole()) return;
  slide.section = slideSegmentLabel(index + direction);
  recordHistory();
  renderAll();
  scheduleSave();
}

function ensureSlideContextMenu(): HTMLElement {
  let menu = document.getElementById("slide-context-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "slide-context-menu";
    menu.className = "slide-context-menu";
    menu.hidden = true;
    document.body.append(menu);
  }
  return menu;
}

function closeSlideContextMenu(): void {
  ensureSlideContextMenu().hidden = true;
}

function openSlideContextMenu(index: number, x: number, y: number): void {
  if (!isEditableRole()) return;
  const menu = ensureSlideContextMenu();
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [
    { label: "Ganti nama slide", action: () => renameSlide(index) },
    { label: "Ganti nama segment", action: () => renameSegment(index) },
    { label: "Masukkan ke segment sebelumnya", disabled: index <= 0, action: () => setSlideSectionFromNeighbor(index, -1) },
    { label: "Masukkan ke segment berikutnya", disabled: index >= deck.slides.length - 1, action: () => setSlideSectionFromNeighbor(index, 1) },
    { label: "Slide baru", action: addSlide },
    { label: "Duplikasikan slide", action: duplicateSlide },
    { label: "Hapus slide", disabled: deck.slides.length <= 1, action: deleteCurrentSlide },
  ];
  currentSlide = index;
  selectedElementId = null;
  renderAll();
  menu.innerHTML = "";
  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.disabled = Boolean(item.disabled);
    button.addEventListener("click", () => {
      closeSlideContextMenu();
      item.action();
    });
    menu.append(button);
  }
  menu.style.left = `${Math.min(x, innerWidth - 245)}px`;
  menu.style.top = `${Math.min(y, innerHeight - 250)}px`;
  menu.hidden = false;
}

function renderSlideList(): void {
  const target = $("#slide-list");
  target.innerHTML = "";
  deck.slides.forEach((slide, index) => {
    const node = document.createElement("div");
    node.className = `slide-thumb${index === currentSlide ? " active" : ""}`;
    node.draggable = isEditableRole();
    node.dataset.slideIndex = String(index);
    node.innerHTML = `<span class="slide-thumb-number">${index + 1}</span><div><div class="slide-thumb-frame"></div><span class="slide-thumb-label"></span></div>`;
    $(".slide-thumb-frame", node).append(createSlidePreview(slide, "sidebar-slide-preview"));
    $(".slide-thumb-label", node).textContent = slideSegmentLabel(index);
    node.title = slide.name;
    node.addEventListener("click", () => {
      currentSlide = index;
      selectedElementId = null;
      renderAll();
      updatePresenceSlide();
      if (presentationState.presenting && role === "owner") void publishSlideState();
    });
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openSlideContextMenu(index, event.clientX, event.clientY);
    });
    node.addEventListener("dragstart", (event) => {
      if (!isEditableRole()) return;
      slideDragIndex = index;
      node.classList.add("dragging");
      event.dataTransfer?.setData("text/plain", String(index));
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    node.addEventListener("dragover", (event) => {
      if (slideDragIndex < 0 || !isEditableRole()) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      node.classList.toggle("drop-after", event.clientY > rect.top + rect.height / 2);
      node.classList.toggle("drop-before", event.clientY <= rect.top + rect.height / 2);
    });
    node.addEventListener("dragleave", () => node.classList.remove("drop-before", "drop-after"));
    node.addEventListener("drop", (event) => {
      if (slideDragIndex < 0 || !isEditableRole()) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const targetIndex = index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
      const adjusted = slideDragIndex < targetIndex ? targetIndex - 1 : targetIndex;
      node.classList.remove("drop-before", "drop-after");
      moveSlide(slideDragIndex, clamp(adjusted, 0, deck.slides.length - 1));
      slideDragIndex = -1;
    });
    node.addEventListener("dragend", () => {
      slideDragIndex = -1;
      document.querySelectorAll(".slide-thumb").forEach((item) => item.classList.remove("dragging", "drop-before", "drop-after"));
    });
    target.append(node);
  });
}

function renderCanvas(): void {
  const canvas = $("#slide-canvas");
  canvas.innerHTML = "";
  if (!current().elements.length) {
    canvas.innerHTML = '<div class="empty-slide"><strong>Slide kosong</strong><span>Tambahkan teks atau mockup HP dari toolbar.</span></div>';
    renderRemoteCursors();
    return;
  }
  for (const element of current().elements) canvas.append(createElementNode(element, false));
  renderRemoteCursors();
}

function applyTextStyle(node: HTMLElement, element: Pick<TextElement, "fontFamily" | "fontSize" | "color" | "bold" | "italic" | "underline" | "variant" | "align" | "insetLeft" | "insetRight" | "insetTop" | "insetBottom" | "lineHeight">): void {
  node.style.fontFamily = element.fontFamily ? `${element.fontFamily}, Inter, Segoe UI, Arial` : "";
  node.style.fontSize = element.fontSize ? `${element.fontSize}px` : "";
  node.style.color = element.color || "";
  node.style.fontWeight = element.bold ? "700" : "";
  node.style.fontStyle = element.italic ? "italic" : "";
  node.style.textDecoration = element.underline ? "underline" : "";
  node.style.textAlign = element.align || "";
  if ([element.insetTop, element.insetRight, element.insetBottom, element.insetLeft].some((value) => typeof value === "number")) {
    node.style.padding = `${element.insetTop ?? 6}px ${element.insetRight ?? 8}px ${element.insetBottom ?? 6}px ${element.insetLeft ?? 8}px`;
  }
  node.style.lineHeight = element.lineHeight ? String(element.lineHeight) : "";
}

function ensureDeckImage(src: string): HTMLImageElement {
  let image = deckImages.get(src);
  if (!image) {
    image = new Image();
    image.onload = () => drawBroadcastFrame();
    image.src = src;
    deckImages.set(src, image);
  }
  return image;
}

function appendMoveHandle(node: HTMLElement): void {
  node.dataset.dragHandle = "element";
}

function isNearElementEdge(event: PointerEvent, node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  const threshold = Math.max(8, Math.min(16, 12 * zoom));
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  return x <= threshold || y <= threshold || rect.width - x <= threshold || rect.height - y <= threshold;
}

function updateElementCursor(event: PointerEvent, node: HTMLElement): void {
  if (!selectedElementId || node.dataset.elementId !== selectedElementId) return;
  node.classList.toggle("edge-hover", isNearElementEdge(event, node));
}

function createElementNode(element: SlideElement, audience: boolean): HTMLDivElement {
  const node = document.createElement("div");
  node.className = `slide-element ${element.type}-slide-element${!audience && selectedElementId === element.id ? " selected" : ""}${element.animation ? ` anim-${element.animation}` : ""}`;
  node.dataset.elementId = element.id;
  node.style.left = `${element.x}px`;
  node.style.top = `${element.y}px`;
  node.style.width = `${element.w}px`;
  node.style.height = `${element.h}px`;
  if (element.type === "text") {
    const text = document.createElement("div");
    text.className = `text-element ${element.variant}`;
    text.textContent = element.text;
    text.contentEditable = String(!audience && isEditableRole());
    text.spellcheck = false;
    applyTextStyle(text, element);
    text.addEventListener("focus", () => { selectedElementId = element.id; renderProperties(); });
    text.addEventListener("input", () => {
      element.text = text.textContent || "";
      announceEditing(element);
      scheduleSave();
    });
    text.addEventListener("blur", recordHistory);
    node.append(text);
  } else if (element.type === "phone") {
    const label = getDeviceLabel(element.deviceSerial) || element.deviceLabel || "Belum memilih perangkat";
    node.innerHTML = `<div class="device-label${element.deviceSerial && mirrorStates.get(element.deviceSerial)?.running ? " live" : ""}"><i></i><span></span></div><div class="phone-element"><div class="phone-notch"></div><div class="phone-screen"><div class="phone-placeholder"><b>▯</b><span></span></div></div><div class="phone-home"></div></div>`;
    $(".device-label span", node).textContent = label;
    $(".phone-placeholder span", node).textContent = element.deviceSerial ? "Klik Mulai mirror atau Presentasikan" : "Pilih perangkat USB pada panel kanan";
    if (element.deviceSerial) {
      const frame = frameImages.get(element.deviceSerial);
      if (frame?.src) {
        const image = new Image();
        image.src = frame.src;
        $(".phone-screen", node).innerHTML = "";
        $(".phone-screen", node).append(image);
      }
    }
  } else if (element.type === "image") {
    const image = ensureDeckImage(element.src).cloneNode(false) as HTMLImageElement;
    image.className = "image-element";
    image.alt = element.alt || "Gambar presentasi";
    image.draggable = false;
    node.append(image);
  } else if (element.type === "canvas") {
    const canvas = document.createElement("canvas");
    canvas.className = "canvas-element";
    canvas.width = Math.max(1, Math.round(element.w * 2));
    canvas.height = Math.max(1, Math.round(element.h * 2));
    canvas.setAttribute("aria-label", element.alt || "Canvas presentasi");
    const context = canvas.getContext("2d");
    const image = ensureDeckImage(element.src);
    const draw = () => {
      if (!context || !image.complete || !image.naturalWidth) return;
      context.setTransform(canvas.width / element.w, 0, 0, canvas.height / element.h, 0, 0);
      context.clearRect(0, 0, element.w, element.h);
      context.drawImage(image, 0, 0, element.w, element.h);
    };
    if (image.complete && image.naturalWidth) draw();
    else image.addEventListener("load", draw, { once: true });
    node.append(canvas);
  } else {
    const shape = document.createElement("div");
    shape.className = `shape-element ${element.shape}`;
    shape.style.background = element.shape === "line" ? "transparent" : element.fill || "transparent";
    shape.style.borderColor = element.stroke || "transparent";
    shape.textContent = element.text || "";
    shape.contentEditable = String(!audience && isEditableRole() && element.shape !== "line");
    shape.spellcheck = false;
    applyTextStyle(shape, { ...element, variant: "body" });
    shape.addEventListener("focus", () => { selectedElementId = element.id; renderProperties(); });
    shape.addEventListener("input", () => {
      element.text = shape.textContent || "";
      announceEditing(element);
      scheduleSave();
    });
    shape.addEventListener("blur", recordHistory);
    node.append(shape);
  }
  if (!audience && isEditableRole()) {
    appendMoveHandle(node);
    for (const handle of ["nw", "ne", "sw", "se"]) {
      const resize = document.createElement("span");
      resize.className = `resize-handle ${handle}`;
      resize.dataset.handle = handle;
      node.append(resize);
    }
    node.addEventListener("pointerdown", (event) => beginPointerTransform(event, node, element));
    node.addEventListener("pointermove", (event) => updateElementCursor(event, node));
    node.addEventListener("pointerleave", () => node.classList.remove("edge-hover"));
  }
  return node;
}

function selectElementNode(elementId: string, node?: HTMLElement): void {
  selectedElementId = elementId;
  document.querySelectorAll<HTMLElement>("#slide-canvas .slide-element.selected").forEach((item) => item.classList.remove("selected"));
  (node || document.querySelector<HTMLElement>(`#slide-canvas .slide-element[data-element-id="${CSS.escape(elementId)}"]`))?.classList.add("selected");
  renderProperties();
  renderDeviceSelect();
  syncInspectorMode();
}

function syncNodeBounds(node: HTMLElement, element: SlideElement): void {
  node.style.left = `${element.x}px`;
  node.style.top = `${element.y}px`;
  node.style.width = `${element.w}px`;
  node.style.height = `${element.h}px`;
}

function syncCanvasElementBounds(elements: SlideElement[] = current().elements): void {
  for (const item of elements) {
    const node = document.querySelector<HTMLElement>(`#slide-canvas .slide-element[data-element-id="${CSS.escape(item.id)}"]`);
    if (node) syncNodeBounds(node, item);
  }
}

function focusTextElement(elementId: string): void {
  requestAnimationFrame(() => {
    const node = document.querySelector<HTMLElement>(`#slide-canvas .slide-element[data-element-id="${CSS.escape(elementId)}"] .text-element`);
    if (!node) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

function beginPointerTransform(event: PointerEvent, node: HTMLElement, element: SlideElement): void {
  const target = event.target as HTMLElement;
  const resizeTarget = target.closest<HTMLElement>(".resize-handle");
  selectElementNode(element.id, node);
  const canMove = Boolean(resizeTarget) || isNearElementEdge(event, node);
  if (!canMove) return;
  const editableText = target.closest('[contenteditable="true"]');
  if (editableText && !resizeTarget && !isNearElementEdge(event, node)) return;

  event.preventDefault();
  node.setPointerCapture?.(event.pointerId);
  const handle = resizeTarget?.dataset.handle || "";
  const movingGroup = !handle && element.type === "shape" && element.tableId
    ? current().elements.filter((item): item is ShapeElement => item.type === "shape" && item.tableId === element.tableId)
    : [element];
  const groupStart = movingGroup.map((item) => ({ element: item, x: item.x, y: item.y }));
  const start = { clientX: event.clientX, clientY: event.clientY, x: element.x, y: element.y, w: element.w, h: element.h };
  let frame = 0;
  let moved = false;

  const updateFromPointer = (next: PointerEvent) => {
    const dx = (next.clientX - start.clientX) / zoom;
    const dy = (next.clientY - start.clientY) / zoom;
    moved = true;
    if (!handle) {
      for (const item of groupStart) {
        item.element.x = clamp(item.x + dx, -item.element.w + 16, SLIDE_WIDTH - 16);
        item.element.y = clamp(item.y + dy, -item.element.h + 16, SLIDE_HEIGHT - 16);
      }
    } else {
      if (handle.includes("e")) element.w = Math.max(40, start.w + dx);
      if (handle.includes("s")) element.h = Math.max(30, start.h + dy);
      if (handle.includes("w")) {
        const width = Math.max(40, start.w - dx);
        element.x = start.x + (start.w - width);
        element.w = width;
      }
      if (handle.includes("n")) {
        const height = Math.max(30, start.h - dy);
        element.y = start.y + (start.h - height);
        element.h = height;
      }
    }
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (movingGroup.length > 1) syncCanvasElementBounds(movingGroup);
        else syncNodeBounds(node, element);
        renderProperties();
      });
    }
  };

  const stop = () => {
    removeEventListener("pointermove", updateFromPointer);
    removeEventListener("pointerup", stop);
    removeEventListener("pointercancel", stop);
    if (frame) cancelAnimationFrame(frame);
    if (movingGroup.length > 1) syncCanvasElementBounds(movingGroup);
    else syncNodeBounds(node, element);
    renderProperties();
    node.releasePointerCapture?.(event.pointerId);
    if (moved) {
      recordHistory();
      scheduleSave();
      drawBroadcastFrame();
    }
  };

  addEventListener("pointermove", updateFromPointer);
  addEventListener("pointerup", stop, { once: true });
  addEventListener("pointercancel", stop, { once: true });
}

function renderProperties(): void {
  const element = selected();
  $("#property-title").textContent = element
    ? element.type === "phone" ? "Mockup HP"
      : element.type === "image" ? "Gambar"
        : element.type === "canvas" ? "Canvas slide"
        : element.type === "shape" ? "Bentuk"
          : element.variant === "title" ? "Judul" : "Teks"
    : "Tidak ada pilihan";
  const ids = ["prop-x", "prop-y", "prop-w", "prop-h", "prop-text"];
  for (const id of ids) ($(`#${id}`) as HTMLInputElement | HTMLTextAreaElement).disabled = !element || !isEditableRole();
  $("#text-property").toggleAttribute("hidden", !(element?.type === "text" || element?.type === "shape"));
  if (!element) {
    for (const id of ids) ($(`#${id}`) as HTMLInputElement | HTMLTextAreaElement).value = "";
    return;
  }
  ($("#prop-x") as HTMLInputElement).value = String(Math.round(element.x));
  ($("#prop-y") as HTMLInputElement).value = String(Math.round(element.y));
  ($("#prop-w") as HTMLInputElement).value = String(Math.round(element.w));
  ($("#prop-h") as HTMLInputElement).value = String(Math.round(element.h));
  ($("#prop-text") as HTMLTextAreaElement).value = element.type === "text" || element.type === "shape" ? element.text || "" : "";
}

function updateProperties(): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  element.x = Number(($("#prop-x") as HTMLInputElement).value) || 0;
  element.y = Number(($("#prop-y") as HTMLInputElement).value) || 0;
  element.w = Math.max(20, Number(($("#prop-w") as HTMLInputElement).value) || 20);
  element.h = Math.max(20, Number(($("#prop-h") as HTMLInputElement).value) || 20);
  if (element.type === "text" || element.type === "shape") element.text = ($("#prop-text") as HTMLTextAreaElement).value;
  announceEditing(element);
  renderCanvas();
  scheduleSave();
}

function renderCounterAndNotes(): void {
  $("#slide-counter").textContent = `Slide ${currentSlide + 1} / ${deck.slides.length}`;
  const notes = $("#speaker-note") as HTMLInputElement;
  if (document.activeElement !== notes) notes.value = current().notes || "";
  notes.disabled = !isEditableRole();
}

function addText(variant: TextVariant): void {
  if (!isEditableRole()) return;
  const element: TextElement = { id: uid("el"), type: "text", variant, x: 90, y: 90 + current().elements.length * 12, w: variant === "title" ? 520 : 430, h: variant === "title" ? 74 : 70, text: variant === "title" ? "Judul slide" : "Tulis teks di sini" };
  current().elements.push(element);
  selectedElementId = element.id;
  recordHistory();
  renderAll();
  focusTextElement(element.id);
  scheduleSave();
}

function addPhone(): void {
  if (!isEditableRole()) return;
  const element: PhoneElement = { id: uid("el"), type: "phone", x: 650, y: 48, w: 220, h: 448, deviceSerial: null };
  current().elements.push(element);
  selectedElementId = element.id;
  recordHistory();
  renderAll();
  switchInspector("device");
  scheduleSave();
}

function addSlide(): void {
  if (!isEditableRole()) return;
  const slide: Slide = { id: uid("slide"), name: `Slide ${deck.slides.length + 1}`, notes: "", elements: [] };
  deck.slides.push(slide);
  currentSlide = deck.slides.length - 1;
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function deleteSelected(): void {
  if (!selectedElementId || !isEditableRole()) return;
  const element = selected();
  if (element?.type === "phone" && element.deviceSerial) stopMirror(element.deviceSerial);
  current().elements = current().elements.filter((item) => item.id !== selectedElementId);
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function duplicateSlide(): void {
  if (!isEditableRole()) return;
  const duplicated = clone(current());
  duplicated.id = uid("slide");
  duplicated.name = `${current().name} salinan`;
  duplicated.elements.forEach((element) => { element.id = uid("el"); });
  deck.slides.splice(currentSlide + 1, 0, duplicated);
  currentSlide += 1;
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function deleteCurrentSlide(): void {
  if (!isEditableRole()) return;
  if (deck.slides.length === 1) { toast("Presentasi harus memiliki minimal satu slide."); return; }
  deck.slides.splice(currentSlide, 1);
  currentSlide = clamp(currentSlide, 0, deck.slides.length - 1);
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function duplicateSelected(): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  const copy = clone(element);
  copy.id = uid("el");
  copy.x = clamp(copy.x + 20, 0, SLIDE_WIDTH - 20);
  copy.y = clamp(copy.y + 20, 0, SLIDE_HEIGHT - 20);
  current().elements.push(copy);
  selectedElementId = copy.id;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addShape(shape: ShapeElement["shape"] = "rect"): void {
  if (!isEditableRole()) return;
  const element: ShapeElement = {
    id: uid("el"),
    type: "shape",
    shape,
    x: 160,
    y: 140,
    w: shape === "line" ? 260 : 220,
    h: shape === "line" ? 0 : 110,
    fill: shape === "line" ? "transparent" : "#e8f0fe",
    stroke: "#1a73e8",
    text: "",
  };
  current().elements.push(element);
  selectedElementId = element.id;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addTable(rows = 3, cols = 3): void {
  if (!isEditableRole()) return;
  rows = clamp(Math.round(rows), 1, 20);
  cols = clamp(Math.round(cols), 1, 12);
  const startX = 140;
  const startY = 116;
  const cellW = clamp(Math.floor(520 / cols), 52, 150);
  const cellH = 48;
  const tableId = uid("table");
  const cells: ShapeElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({
        id: uid("el"),
        type: "shape",
        shape: "rect",
        x: startX + col * cellW,
        y: startY + row * cellH,
        w: cellW,
        h: cellH,
        fill: row === 0 ? "#edf2fa" : "#ffffff",
        stroke: "#5f6368",
        text: row === 0 ? `Header ${col + 1}` : "",
        fontSize: 16,
        color: "#202124",
        align: "center",
        tableId,
        tableRow: row,
        tableCol: col,
      });
    }
  }
  current().elements.push(...cells);
  selectedElementId = cells[0]?.id || null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function promptAddTable(): void {
  const rawRows = prompt("Jumlah baris tabel", "3");
  if (rawRows === null) return;
  const rawCols = prompt("Jumlah kolom tabel", "3");
  if (rawCols === null) return;
  addTable(Number(rawRows) || 3, Number(rawCols) || 3);
}

function tableCellsForSelected(): ShapeElement[] {
  const element = selected();
  if (element?.type !== "shape" || !element.tableId) return [];
  return current().elements.filter((item): item is ShapeElement => item.type === "shape" && item.tableId === element.tableId);
}

function tableBounds(cells: ShapeElement[]): { rows: number; cols: number; cellW: number; cellH: number; x: number; y: number } {
  const rows = Math.max(0, ...cells.map((cell) => Number(cell.tableRow ?? 0))) + 1;
  const cols = Math.max(0, ...cells.map((cell) => Number(cell.tableCol ?? 0))) + 1;
  const first = cells[0];
  return { rows, cols, cellW: first?.w || 100, cellH: first?.h || 44, x: Math.min(...cells.map((cell) => cell.x)), y: Math.min(...cells.map((cell) => cell.y)) };
}

function rebuildTable(tableId: string, rows: number, cols: number, keep: ShapeElement[]): void {
  const bounds = tableBounds(keep);
  const byCell = new Map(keep.map((cell) => [`${cell.tableRow}:${cell.tableCol}`, cell]));
  const rebuilt: ShapeElement[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const existing = byCell.get(`${row}:${col}`);
      rebuilt.push(existing ? { ...existing, x: bounds.x + col * bounds.cellW, y: bounds.y + row * bounds.cellH, tableRow: row, tableCol: col } : {
        id: uid("el"),
        type: "shape",
        shape: "rect",
        x: bounds.x + col * bounds.cellW,
        y: bounds.y + row * bounds.cellH,
        w: bounds.cellW,
        h: bounds.cellH,
        fill: row === 0 ? "#edf2fa" : "#ffffff",
        stroke: "#5f6368",
        text: "",
        fontSize: 16,
        color: "#202124",
        align: "center",
        tableId,
        tableRow: row,
        tableCol: col,
      });
    }
  }
  current().elements = current().elements.filter((item) => !(item.type === "shape" && item.tableId === tableId));
  current().elements.push(...rebuilt);
  selectedElementId = rebuilt[0]?.id || null;
}

function editSelectedTable(mode: "row-after" | "row-delete" | "col-after" | "col-delete"): void {
  if (!isEditableRole()) return;
  const cells = tableCellsForSelected();
  const selectedCell = selected();
  if (!cells.length || selectedCell?.type !== "shape" || !selectedCell.tableId) { toast("Pilih salah satu sel tabel dahulu."); return; }
  const bounds = tableBounds(cells);
  let keep = cells.map((cell) => ({ ...cell }));
  if (mode === "row-after") {
    const after = Number(selectedCell.tableRow ?? 0);
    keep = keep.map((cell) => Number(cell.tableRow ?? 0) > after ? { ...cell, tableRow: Number(cell.tableRow) + 1 } : cell);
    rebuildTable(selectedCell.tableId, bounds.rows + 1, bounds.cols, keep);
  } else if (mode === "col-after") {
    const after = Number(selectedCell.tableCol ?? 0);
    keep = keep.map((cell) => Number(cell.tableCol ?? 0) > after ? { ...cell, tableCol: Number(cell.tableCol) + 1 } : cell);
    rebuildTable(selectedCell.tableId, bounds.rows, bounds.cols + 1, keep);
  } else if (mode === "row-delete") {
    if (bounds.rows <= 1) { toast("Tabel harus memiliki minimal satu baris."); return; }
    const row = Number(selectedCell.tableRow ?? 0);
    keep = keep.filter((cell) => Number(cell.tableRow ?? 0) !== row).map((cell) => Number(cell.tableRow ?? 0) > row ? { ...cell, tableRow: Number(cell.tableRow) - 1 } : cell);
    rebuildTable(selectedCell.tableId, bounds.rows - 1, bounds.cols, keep);
  } else {
    if (bounds.cols <= 1) { toast("Tabel harus memiliki minimal satu kolom."); return; }
    const col = Number(selectedCell.tableCol ?? 0);
    keep = keep.filter((cell) => Number(cell.tableCol ?? 0) !== col).map((cell) => Number(cell.tableCol ?? 0) > col ? { ...cell, tableCol: Number(cell.tableCol) - 1 } : cell);
    rebuildTable(selectedCell.tableId, bounds.rows, bounds.cols - 1, keep);
  }
  recordHistory();
  renderAll();
  scheduleSave();
}

function deleteSelectedTable(): void {
  if (!isEditableRole()) return;
  const cells = tableCellsForSelected();
  const tableId = cells[0]?.tableId;
  if (!tableId) { toast("Pilih salah satu sel tabel dahulu."); return; }
  current().elements = current().elements.filter((item) => !(item.type === "shape" && item.tableId === tableId));
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addImageFromDataUrl(src: string, alt = "Gambar"): void {
  if (!isEditableRole()) return;
  const image = ensureDeckImage(src);
  const ratio = image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 16 / 9;
  const width = Math.min(520, Math.max(180, ratio >= 1 ? 420 : 260));
  const height = Math.min(360, Math.max(120, width / ratio));
  const element: ImageElement = { id: uid("el"), type: "image", x: 180, y: 110, w: width, h: height, src, alt };
  current().elements.push(element);
  selectedElementId = element.id;
  recordHistory();
  renderAll();
  scheduleSave();
}

async function addImageFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) { toast("File gambar tidak dikenali."); return; }
  const src = await readFileAsDataUrl(file);
  addImageFromDataUrl(src, file.name);
}

function arrangeSelected(mode: "front" | "back" | "forward" | "backward"): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  const elements = current().elements;
  const index = elements.findIndex((item) => item.id === element.id);
  if (index < 0) return;
  elements.splice(index, 1);
  if (mode === "front") elements.push(element);
  else if (mode === "back") elements.unshift(element);
  else if (mode === "forward") elements.splice(Math.min(elements.length, index + 1), 0, element);
  else elements.splice(Math.max(0, index - 1), 0, element);
  recordHistory();
  renderAll();
  scheduleSave();
}

function centerSelected(axis: "horizontal" | "vertical" | "both"): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  if (axis === "horizontal" || axis === "both") element.x = (SLIDE_WIDTH - element.w) / 2;
  if (axis === "vertical" || axis === "both") element.y = (SLIDE_HEIGHT - element.h) / 2;
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySelectedTextFormat(format: "bold" | "italic" | "underline" | "title" | "body" | "color", value?: string): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  if (element.type !== "text" && element.type !== "shape") { toast("Pilih teks atau bentuk berisi teks dahulu."); return; }
  if (format === "bold") element.bold = !element.bold;
  if (format === "italic") element.italic = !element.italic;
  if (format === "underline") element.underline = !element.underline;
  if (format === "title" && element.type === "text") element.variant = "title";
  if (format === "body" && element.type === "text") element.variant = "body";
  if (format === "color" && value) element.color = value;
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySelectedAnimation(animation: ElementAnimation): void {
  const element = selected();
  if (!element || !isEditableRole()) return;
  element.animation = animation || "";
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySlideTransition(transition: string): void {
  if (!isEditableRole()) return;
  current().transition = transition;
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySelectedFontSize(delta: number): void {
  const element = selected();
  if (!element || !isEditableRole() || (element.type !== "text" && element.type !== "shape")) return;
  const currentSize = element.fontSize || (element.type === "text" && element.variant === "title" ? 36 : 20);
  element.fontSize = clamp(currentSize + delta, 6, 160);
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySelectedTextAlign(align: "left" | "center" | "right"): void {
  const element = selected();
  if (!element || !isEditableRole() || (element.type !== "text" && element.type !== "shape")) return;
  element.align = align;
  recordHistory();
  renderAll();
  scheduleSave();
}

function applySelectedShapeColor(kind: "fill" | "stroke", color: string): void {
  const element = selected();
  if (!element || !isEditableRole() || element.type !== "shape") return;
  element[kind] = color;
  recordHistory();
  renderAll();
  scheduleSave();
}

function setSlideBackground(color = "#ffffff"): void {
  if (!isEditableRole()) return;
  const slide = current();
  const existing = slide.elements.find((item): item is ShapeElement =>
    item.type === "shape" && item.shape === "rect" && item.x <= 0 && item.y <= 0 && item.w >= SLIDE_WIDTH && item.h >= SLIDE_HEIGHT);
  if (existing) {
    existing.fill = color;
    existing.stroke = color;
  } else {
    slide.elements.unshift({ id: uid("el"), type: "shape", shape: "rect", x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT, fill: color, stroke: color });
  }
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function promptSlideBackground(): void {
  const color = prompt("Warna background slide (#RRGGBB)", "#ffffff");
  if (!color) return;
  setSlideBackground(cleanColor(color, "#ffffff"));
}

function applyTheme(kind: "light" | "dark" | "blue" | "green" | "gold"): void {
  if (!isEditableRole()) return;
  const palettes: Record<"light" | "dark" | "blue" | "green" | "gold", { background: string; accent: string; text: string }> = {
    light: { background: "#ffffff", accent: "#fbbc04", text: "#202124" },
    dark: { background: "#202124", accent: "#8ab4f8", text: "#ffffff" },
    blue: { background: "#e8f0fe", accent: "#1a73e8", text: "#174ea6" },
    green: { background: "#e6f4ea", accent: "#188038", text: "#137333" },
    gold: { background: "#fff7e6", accent: "#f9ab00", text: "#3c4043" },
  };
  const palette = palettes[kind];
  setSlideBackground(palette.background);
  for (const element of current().elements) {
    if (element.type === "text") element.color = palette.text;
    if (element.type === "shape" && element.y > SLIDE_HEIGHT - 70) {
      element.fill = palette.accent;
      element.stroke = palette.accent;
    }
  }
  recordHistory();
  renderAll();
  scheduleSave();
}

function resetSlideLayout(): void {
  if (!isEditableRole()) return;
  current().elements = [
    { id: uid("el"), type: "text", variant: "title", x: 86, y: 178, w: 788, h: 78, text: "Klik - tambahkan judul", fontSize: 44, align: "center", color: "#202124" },
    { id: uid("el"), type: "text", variant: "body", x: 128, y: 282, w: 704, h: 54, text: "Klik - tambahkan subjudul", fontSize: 26, align: "center", color: "#5f6368" },
  ];
  selectedElementId = null;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addSlideNumber(): void {
  if (!isEditableRole()) return;
  const element: TextElement = { id: uid("el"), type: "text", variant: "body", x: 856, y: 498, w: 70, h: 26, text: String(currentSlide + 1), fontSize: 14, color: "#5f6368", align: "right" };
  current().elements.push(element);
  selectedElementId = element.id;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addHeaderFooter(): void {
  if (!isEditableRole()) return;
  const footer: TextElement = { id: uid("el"), type: "text", variant: "body", x: 38, y: 502, w: 420, h: 24, text: deck.title || "ITS Presentasi", fontSize: 12, color: "#5f6368" };
  current().elements.push(footer);
  selectedElementId = footer.id;
  recordHistory();
  renderAll();
  scheduleSave();
}

function addCommentToNotes(): void {
  if (!isEditableRole()) return;
  const comment = prompt("Komentar slide", "");
  if (!comment) return;
  current().notes = `${current().notes ? `${current().notes}\n` : ""}Komentar: ${comment}`;
  recordHistory();
  renderCounterAndNotes();
  scheduleSave();
}

function downloadDeckJson(): void {
  const blob = new Blob([JSON.stringify(serializableDeck(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(deck.title || "presentasi").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "presentasi"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCurrentSlidePng(): void {
  drawBroadcastFrame();
  const canvas = $("#broadcast-canvas") as HTMLCanvasElement;
  const title = (deck.title || "presentasi").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "presentasi";
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${title}-slide-${currentSlide + 1}.png`;
  link.click();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

async function readZipXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path);
  if (!file) return null;
  return parseXml(await file.async("text"));
}

function descendants(root: ParentNode, localName: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((element) => element.localName === localName);
}

function firstDescendant(root: ParentNode, localName: string): Element | null {
  return descendants(root, localName)[0] || null;
}

function childElements(root: Element | null, localName: string): Element[] {
  if (!root) return [];
  return Array.from(root.children).filter((element) => element.localName === localName);
}

function attr(element: Element | null, name: string): string {
  if (!element) return "";
  return element.getAttribute(name) || element.getAttribute(`r:${name}`) || element.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", name) || "";
}

function dirName(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function resolveZipPath(fromDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const stack: string[] = [];
  for (const part of `${fromDir}/${target}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function relsPathFor(path: string): string {
  return `${dirName(path)}/_rels/${fileName(path)}.rels`;
}

async function readRelationships(zip: JSZip, path: string): Promise<Map<string, PptxRelationship>> {
  const doc = await readZipXml(zip, path);
  const map = new Map<string, PptxRelationship>();
  if (!doc) return map;
  for (const rel of descendants(doc, "Relationship")) {
    const id = rel.getAttribute("Id") || "";
    if (!id) continue;
    map.set(id, { id, target: rel.getAttribute("Target") || "", type: rel.getAttribute("Type") || "" });
  }
  return map;
}

function pptxColor(scope: ParentNode | null, fallback = "", directFillOnly = false): string {
  if (!scope) return fallback;
  const directNoFill = scope instanceof Element && childElements(scope, "noFill").length > 0;
  if (directNoFill) return fallback;
  const solidFill = directFillOnly && scope instanceof Element ? childElements(scope, "solidFill")[0] : firstDescendant(scope, "solidFill");
  if (!solidFill) return fallback;
  const srgb = firstDescendant(solidFill, "srgbClr")?.getAttribute("val");
  if (srgb && /^[0-9a-f]{6}$/i.test(srgb)) return `#${srgb}`;
  const scheme = firstDescendant(solidFill, "schemeClr")?.getAttribute("val") || "";
  const schemeMap: Record<string, string> = {
    accent1: "#4472c4",
    accent2: "#ed7d31",
    accent3: "#a5a5a5",
    accent4: "#ffc000",
    accent5: "#5b9bd5",
    accent6: "#70ad47",
    tx1: "#202124",
    tx2: "#4a4f55",
    bg1: "#ffffff",
    bg2: "#f8f9fa",
  };
  return schemeMap[scheme] || fallback;
}

function normalizePptxAnimation(raw: string): ElementAnimation {
  const value = raw.toLowerCase();
  if (value.includes("fade")) return "fade";
  if (value.includes("fly") || value.includes("float")) return "fly";
  if (value.includes("wipe")) return "wipe";
  if (value.includes("zoom") || value.includes("grow")) return "zoom";
  if (value.includes("motion")) return "motion";
  return value ? "appear" : "";
}

function collectAnimationHints(slideDoc: Document): Map<string, ElementAnimation> {
  const hints = new Map<string, ElementAnimation>();
  for (const target of descendants(slideDoc, "spTgt")) {
    const shapeId = target.getAttribute("spid") || "";
    if (!shapeId) continue;
    let cursor: Element | null = target;
    let hint: ElementAnimation = "appear";
    while (cursor) {
      if (["animEffect", "animMotion", "animScale"].includes(cursor.localName)) {
        hint = normalizePptxAnimation(`${cursor.localName} ${cursor.getAttribute("transition") || ""} ${cursor.getAttribute("filter") || ""}`);
        break;
      }
      cursor = cursor.parentElement;
    }
    hints.set(shapeId, hint);
  }
  return hints;
}

function pptxTransition(slideDoc: Document): string {
  const transition = firstDescendant(slideDoc, "transition");
  if (!transition) return "";
  const child = Array.from(transition.children)[0];
  return (child?.localName || transition.getAttribute("spd") || "transition").slice(0, 60);
}

function pptxSlideBackground(slideDoc: Document): ShapeElement | null {
  const bgPr = firstDescendant(slideDoc, "bgPr");
  const color = pptxColor(bgPr);
  if (!color) return null;
  return { id: uid("el"), type: "shape", shape: "rect", x: 0, y: 0, w: SLIDE_WIDTH, h: SLIDE_HEIGHT, fill: color, stroke: color };
}

function pptxShapeId(scope: ParentNode): string {
  return firstDescendant(scope, "cNvPr")?.getAttribute("id") || "";
}

function emuToPx(value: number, totalEmu: number, totalPx: number): number {
  return totalEmu > 0 ? value / totalEmu * totalPx : value / PPTX_EMU_PER_INCH * 72;
}

function emuToPoints(value: string | null, fallback: number): number {
  if (value === null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / PPTX_EMU_PER_INCH * 72 : fallback;
}

function pptxBounds(scope: ParentNode, slideSize: { cx: number; cy: number }, fallbackIndex: number): { x: number; y: number; w: number; h: number; hasBounds: boolean } {
  const xfrm = firstDescendant(scope, "xfrm");
  const off = firstDescendant(xfrm || scope, "off");
  const ext = firstDescendant(xfrm || scope, "ext");
  const hasBounds = Boolean(off && ext);
  if (!hasBounds) {
    return { x: 70, y: 72 + fallbackIndex * 82, w: 760, h: 70, hasBounds: false };
  }
  const x = emuToPx(Number(off?.getAttribute("x") || 0), slideSize.cx, SLIDE_WIDTH);
  const y = emuToPx(Number(off?.getAttribute("y") || 0), slideSize.cy, SLIDE_HEIGHT);
  const w = emuToPx(Number(ext?.getAttribute("cx") || 1000000), slideSize.cx, SLIDE_WIDTH);
  const h = emuToPx(Number(ext?.getAttribute("cy") || 600000), slideSize.cy, SLIDE_HEIGHT);
  return { x, y, w: Math.max(8, w), h: Math.max(8, h), hasBounds };
}

function extractPptxText(scope: ParentNode): string {
  const txBody = firstDescendant(scope, "txBody");
  if (!txBody) return "";
  const paragraphs = childElements(txBody, "p").map((paragraph) => {
    const chunks: string[] = [];
    for (const child of Array.from(paragraph.children)) {
      if (child.localName === "br") chunks.push("\n");
      if (child.localName === "r" || child.localName === "fld") chunks.push(descendants(child, "t").map((item) => item.textContent || "").join(""));
    }
    return chunks.join("").replace(/\u00a0/g, " ");
  });
  return paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pptxTextInsets(txBody: Element | null): Pick<TextElement, "insetLeft" | "insetRight" | "insetTop" | "insetBottom"> {
  const bodyPr = txBody ? firstDescendant(txBody, "bodyPr") : null;
  return {
    insetLeft: emuToPoints(bodyPr?.getAttribute("lIns") ?? null, 7.2),
    insetRight: emuToPoints(bodyPr?.getAttribute("rIns") ?? null, 7.2),
    insetTop: emuToPoints(bodyPr?.getAttribute("tIns") ?? null, 3.6),
    insetBottom: emuToPoints(bodyPr?.getAttribute("bIns") ?? null, 3.6),
  };
}

function pptxLineHeight(pPr: Element | null, fontSize: number): number | undefined {
  if (!pPr) return undefined;
  const lnSpc = firstDescendant(pPr, "lnSpc");
  if (!lnSpc) return undefined;
  const pct = firstDescendant(lnSpc, "spcPct")?.getAttribute("val");
  if (pct) return clamp(Number(pct) / 100000, 0.7, 2.4);
  const pts = Number(firstDescendant(lnSpc, "spcPts")?.getAttribute("val") || 0) / 100;
  if (pts && fontSize) return clamp(pts / fontSize, 0.7, 2.4);
  return undefined;
}

function pptxFontSizes(txBody: ParentNode): number[] {
  return descendants(txBody, "rPr")
    .concat(descendants(txBody, "defRPr"), descendants(txBody, "endParaRPr"))
    .map((item) => Number(item.getAttribute("sz") || 0) / 100)
    .filter((value) => Number.isFinite(value) && value > 0);
}

function extractPptxTextStyle(scope: ParentNode): PptxRunStyle {
  const txBody = firstDescendant(scope, "txBody") || scope;
  const pPr = firstDescendant(txBody, "pPr");
  const rPr = firstDescendant(txBody, "rPr") || firstDescendant(txBody, "defRPr");
  const latin = firstDescendant(rPr || txBody, "latin");
  const sizes = pptxFontSizes(txBody);
  const fontSize = sizes.length ? Math.max(...sizes) : Number(rPr?.getAttribute("sz") || 0) / 100;
  const style: PptxRunStyle = {};
  const fontFamily = cleanFontFamily(latin?.getAttribute("typeface"));
  const color = pptxColor(rPr || txBody);
  if (fontFamily) style.fontFamily = fontFamily;
  if (fontSize) style.fontSize = clamp(fontSize * PPTX_FONT_SCALE, 7, 128);
  if (color) style.color = color;
  if (["1", "true"].includes((rPr?.getAttribute("b") || "").toLowerCase())) style.bold = true;
  if (["1", "true"].includes((rPr?.getAttribute("i") || "").toLowerCase())) style.italic = true;
  const underline = (rPr?.getAttribute("u") || "").toLowerCase();
  if (underline && underline !== "none") style.underline = true;
  const align = (pPr?.getAttribute("algn") || "").toLowerCase();
  if (align === "ctr") style.align = "center";
  if (align === "r") style.align = "right";
  Object.assign(style, pptxTextInsets(txBody instanceof Element ? txBody : null));
  const lineHeight = pptxLineHeight(pPr, style.fontSize || fontSize || 0);
  if (lineHeight) style.lineHeight = lineHeight;
  return style;
}

function pptxShapeKind(scope: ParentNode): ShapeElement["shape"] {
  const preset = firstDescendant(scope, "prstGeom")?.getAttribute("prst") || "";
  if (preset.includes("ellipse")) return "ellipse";
  if (preset.includes("line")) return "line";
  return "rect";
}

function isLightPptxFill(color: string): boolean {
  return ["#ffffff", "#f8f9fa", "transparent", ""].includes(color.toLowerCase());
}

function isNeutralPptxStroke(color: string): boolean {
  return !color || ["transparent", "#dadce0", "#d9d9d9", "#c9c9c9", "#bfbfbf"].includes(color.toLowerCase());
}

function isPptxEmptyPlaceholderShape(fill: string, stroke: string, bounds: { w: number; h: number }): boolean {
  return isLightPptxFill(fill) && isNeutralPptxStroke(stroke) && bounds.w < SLIDE_WIDTH * 0.42 && bounds.h < SLIDE_HEIGHT * 0.16;
}

function pptxDrawableNodes(root: Element): Element[] {
  const nodes: Element[] = [];
  const walk = (scope: Element) => {
    for (const child of Array.from(scope.children)) {
      if (["sp", "pic", "cxnSp", "graphicFrame"].includes(child.localName)) nodes.push(child);
      else if (child.localName === "grpSp") walk(child);
    }
  };
  walk(root);
  return nodes;
}

function imageMimeFromPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() || "";
  return IMAGE_MIME_BY_EXTENSION[extension] || "image/png";
}

async function deckFromPptx(file: File): Promise<Deck> {
  const zip = await JSZip.loadAsync(file);
  const presentation = await readZipXml(zip, "ppt/presentation.xml");
  if (!presentation) throw new Error("PPTX tidak memiliki ppt/presentation.xml.");
  const size = firstDescendant(presentation, "sldSz");
  const slideSize = {
    cx: Number(size?.getAttribute("cx") || DEFAULT_PPTX_SLIDE.cx),
    cy: Number(size?.getAttribute("cy") || DEFAULT_PPTX_SLIDE.cy),
  };
  const presentationRels = await readRelationships(zip, "ppt/_rels/presentation.xml.rels");
  const orderedSlides = descendants(presentation, "sldId")
    .map((slideId) => presentationRels.get(attr(slideId, "id"))?.target || "")
    .filter(Boolean)
    .map((target) => resolveZipPath("ppt", target));
  const fallbackSlides = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
  const slidePaths = orderedSlides.length ? orderedSlides : fallbackSlides;
  if (!slidePaths.length) throw new Error("Tidak ada slide yang bisa dibaca dari PPTX.");

  const slides: Slide[] = [];
  for (const [slideIndex, slidePath] of slidePaths.entries()) {
    const slideDoc = await readZipXml(zip, slidePath);
    if (!slideDoc) continue;
    const rels = await readRelationships(zip, relsPathFor(slidePath));
    const animations = collectAnimationHints(slideDoc);
    const elements: SlideElement[] = [];
    const background = pptxSlideBackground(slideDoc);
    if (background) elements.push(background);

    const spTree = firstDescendant(slideDoc, "spTree") || slideDoc.documentElement;
    const drawableNodes = pptxDrawableNodes(spTree);
    for (const drawable of drawableNodes) {
      if (drawable.localName === "sp" || drawable.localName === "cxnSp") {
        const text = extractPptxText(drawable);
        const bounds = pptxBounds(drawable, slideSize, elements.length);
        const style = extractPptxTextStyle(drawable);
        const animation = animations.get(pptxShapeId(drawable));
        const spPr = firstDescendant(drawable, "spPr") || drawable;
        if (text) {
          const variant: TextVariant = (style.fontSize || 0) >= 28 || elements.filter((item) => item.type === "text").length === 0 ? "title" : "body";
          const fontSize = style.fontSize || (variant === "title" ? 36 : 20);
          const minimumHeight = fontSize * (style.lineHeight || 1.08) + (style.insetTop ?? 3.6) + (style.insetBottom ?? 3.6);
          elements.push({
            id: uid("el"),
            type: "text",
            variant,
            x: bounds.x,
            y: bounds.y,
            w: bounds.w,
            h: clamp(Math.max(bounds.h, minimumHeight), 8, SLIDE_HEIGHT - bounds.y),
            text,
            ...style,
            animation,
          });
        } else {
          const fill = pptxColor(spPr, "", true);
          const stroke = pptxColor(firstDescendant(spPr, "ln"));
          if (isPptxEmptyPlaceholderShape(fill || "transparent", stroke || "transparent", bounds)) continue;
          if (bounds.hasBounds && (fill || stroke)) {
            elements.push({
              id: uid("el"),
              type: "shape",
              shape: pptxShapeKind(spPr),
              x: bounds.x,
              y: bounds.y,
              w: bounds.w,
              h: bounds.h,
              fill: fill || "transparent",
              stroke: stroke || "transparent",
              animation,
            });
          }
        }
      } else if (drawable.localName === "pic") {
        const bounds = pptxBounds(drawable, slideSize, elements.length);
        const blip = firstDescendant(drawable, "blip");
        const rel = rels.get(attr(blip, "embed"));
        if (!rel?.target) continue;
        const mediaPath = resolveZipPath(dirName(slidePath), rel.target);
        const media = zip.file(mediaPath);
        if (!media) continue;
        const base64 = await media.async("base64");
        const cNvPr = firstDescendant(drawable, "cNvPr");
        elements.push({
          id: uid("el"),
          type: "image",
          x: bounds.x,
          y: bounds.y,
          w: bounds.w,
          h: bounds.h,
          src: `data:${imageMimeFromPath(mediaPath)};base64,${base64}`,
          alt: cNvPr?.getAttribute("descr") || cNvPr?.getAttribute("name") || fileName(mediaPath),
          animation: animations.get(pptxShapeId(drawable)),
        });
      }
    }

    slides.push({
      id: uid("slide"),
      name: `Slide ${slideIndex + 1}`,
      notes: "",
      section: slideIndex === 0 ? "Intro" : "",
      transition: pptxTransition(slideDoc),
      elements,
    });
  }
  return sanitizeDeck({ title: file.name.replace(/\.(pptx|ppt)$/i, "") || "Presentasi impor", slides });
}

async function importPptxFile(file: File): Promise<void> {
  if (!isEditableRole()) return;

  // Validasi format sama seperti sebelumnya
  if (/\.ppt$/i.test(file.name) && !/\.pptx$/i.test(file.name)) {
    toast("Format .ppt lama belum bisa dibaca langsung di browser. Simpan ulang sebagai .pptx lalu drop lagi.");
    return;
  }
  if (!/\.pptx$/i.test(file.name)) {
    toast("Drop file .pptx untuk mengganti presentasi.");
    return;
  }

  setSaveState("saving", "Mengimpor PPTX...");

  try {
    deckImages.clear();

    // STEP 1: Parse PPTX langsung di browser.
    const rawDeck = await deckFromPptx(file);

    // STEP 2: Jalankan pipeline AI lokal/best-effort.
    // Tidak ada API key, endpoint berbayar, atau batas inference server.
    // OCR model-based dilewati sementara bila aset model lokal belum siap,
    // sehingga import PPTX tetap cepat dan stabil.

    setSaveState("saving", "AI memeriksa layout...");

    const { deck: enhancedDeck, stats } = await runPptAiPipeline(rawDeck, {
      // Callback progress tampil di UI save state.
      onProgress: (percent, message) => {
        setSaveState("saving", `${message} (${percent}%)`);
      },

      enableOcr: true,

      enableLayoutFix: true,   // PP-DocLayoutV3: perbaiki posisi elemen yang berantakan
      enableTypoFix: true,
      enableAcademic: true,
      language: "id",
    });

    // STEP 3: Terapkan hasil ke deck.
    setSaveState("saving", "Merender slide menjadi canvas HD...");
    deck = await rasterizeDeckForImport(enhancedDeck);
    currentSlide = 0;
    selectedElementId = null;
    recordHistory();
    renderAll();
    scheduleSave("Menyimpan hasil impor + AI...");

    // Laporan ringkas
    const msg = [
      `${deck.slides.length} slide canvas HD diimpor`,
      stats.layoutFixed > 0 ? `${stats.layoutFixed} layout diperbaiki` : "",
      stats.academicImproved > 0 ? `${stats.academicImproved} slide ditingkatkan AI` : "",
      stats.typosFixed > 0 ? `${stats.typosFixed} typo diperbaiki` : "",
      "AI lokal aktif",
      `(${Math.round(stats.durationMs / 1000)}s)`,
    ].filter(Boolean).join(" · ");

    toast(msg);

  } catch (error) {
    console.error(error);
    setSaveState("error", "Import gagal");
    toast(`Import PPTX gagal: ${friendlyError(error as Error)}`);
  }
}

async function runAiImproveCurrentDeck(): Promise<void> {
  if (!isEditableRole()) return;
  setSaveState("saving", "AI memperbaiki presentasi...");
  try {
    const { deck: improved, stats } = await runPptAiPipeline(deck, {
      onProgress: (pct, msg) => setSaveState("saving", `${msg} (${pct}%)`),
      enableLayoutFix: false, // Sudah di browser, skip layout detection
      enableOcr: false,
      enableTypoFix: true,
      enableAcademic: true,
      language: "id",
    });
    deck = improved;
    recordHistory();
    renderAll();
    scheduleSave("Menyimpan hasil AI improve...");
    toast(`AI selesai: ${stats.academicImproved} slide diperbaiki dalam ${Math.round(stats.durationMs / 1000)}s`);
  } catch (error) {
    setSaveState("error", "AI improve gagal");
    toast(`AI improve gagal: ${friendlyError(error as Error)}`);
  }
}

function openPptxPicker(): void {
  ($("#pptx-input") as HTMLInputElement).click();
}

function openImagePicker(): void {
  ($("#image-input") as HTMLInputElement).click();
}

function toggleWorkspaceGrid(): void {
  $("#workspace").classList.toggle("grid-hidden");
}

function toggleSpeakerNotes(): void {
  showSpeakerNotes = !showSpeakerNotes;
  $("#editor-app").classList.toggle("notes-hidden", !showSpeakerNotes);
}

function menuItems(menu: string): MenuItem[] {
  const hasSelection = () => Boolean(selected());
  const editable = () => !isEditableRole();
  const tableDisabled = () => !tableCellsForSelected().length || !isEditableRole();
  const animationItems: MenuItem[] = [
    { label: "Tanpa animasi", action: () => applySelectedAnimation("") },
    { label: "Appear", action: () => applySelectedAnimation("appear") },
    { label: "Fade", action: () => applySelectedAnimation("fade") },
    { label: "Fly In", action: () => applySelectedAnimation("fly") },
    { label: "Wipe", action: () => applySelectedAnimation("wipe") },
    { label: "Zoom", action: () => applySelectedAnimation("zoom") },
    { label: "Motion", action: () => applySelectedAnimation("motion") },
  ];
  const transitionItems: MenuItem[] = [
    { label: "None", action: () => applySlideTransition("") },
    { label: "Fade", action: () => applySlideTransition("fade") },
    { label: "Push", action: () => applySlideTransition("push") },
    { label: "Wipe", action: () => applySlideTransition("wipe") },
    { label: "Zoom", action: () => applySlideTransition("zoom") },
  ];
  return {
    file: [
      { label: "Baru", shortcut: "Ctrl+Alt+N", action: () => void createProject().catch((error) => toast(friendlyError(error))) },
      { label: "Buka", shortcut: "Ctrl+O", action: () => { location.href = homeUrl(); } },
      { label: "Impor PPTX", action: openPptxPicker },
      { separator: true },
      { label: "Buat salinan", disabled: editable, action: () => void createCopyProject().catch((error) => toast(friendlyError(error))) },
      { label: "Bagikan", disabled: () => role !== "owner", action: openShareDialog },
      { label: "Download slide PNG", action: downloadCurrentSlidePng },
      { label: "Download JSON", action: downloadDeckJson },
      { label: "Cetak", shortcut: "Ctrl+P", action: () => print() },
    ],
    edit: [
      { label: "Urungkan", shortcut: "Ctrl+Z", disabled: () => !undoStack.length, action: undo },
      { label: "Ulangi", shortcut: "Ctrl+Y", disabled: () => !redoStack.length, action: redo },
      { separator: true },
      { label: "Duplikasikan elemen", shortcut: "Ctrl+D", disabled: () => !hasSelection() || !isEditableRole(), action: duplicateSelected },
      { label: "Hapus elemen", shortcut: "Delete", disabled: () => !hasSelection() || !isEditableRole(), action: deleteSelected },
      { label: "Duplikasikan slide", disabled: editable, action: duplicateSlide },
    ],
    home: [
      { label: "Slide baru", shortcut: "Ctrl+M", disabled: editable, action: addSlide },
      { label: "Duplikasikan slide", disabled: editable, action: duplicateSlide },
      { label: "Reset layout", disabled: editable, action: resetSlideLayout },
      { separator: true },
      { label: "Tebalkan", shortcut: "Ctrl+B", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("bold") },
      { label: "Miringkan", shortcut: "Ctrl+I", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("italic") },
      { label: "Garis bawah", shortcut: "Ctrl+U", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("underline") },
      { label: "Perbesar font", disabled: () => !hasSelection(), action: () => applySelectedFontSize(4) },
      { label: "Perkecil font", disabled: () => !hasSelection(), action: () => applySelectedFontSize(-4) },
      { separator: true },
      { label: "Rata kiri", disabled: () => !hasSelection(), action: () => applySelectedTextAlign("left") },
      { label: "Rata tengah", disabled: () => !hasSelection(), action: () => applySelectedTextAlign("center") },
      { label: "Rata kanan", disabled: () => !hasSelection(), action: () => applySelectedTextAlign("right") },
      { separator: true },
      {
        label: "Arrange", items: [
          { label: "Bawa ke depan", disabled: () => !hasSelection(), action: () => arrangeSelected("front") },
          { label: "Bawa maju", disabled: () => !hasSelection(), action: () => arrangeSelected("forward") },
          { label: "Kirim mundur", disabled: () => !hasSelection(), action: () => arrangeSelected("backward") },
          { label: "Kirim ke belakang", disabled: () => !hasSelection(), action: () => arrangeSelected("back") },
        ]
      },
    ],
    view: [
      { label: "Slideshow", shortcut: "Ctrl+F5", action: () => void togglePresentation() },
      { label: "Tampilan kisi", checked: () => !$("#workspace").classList.contains("grid-hidden"), action: toggleWorkspaceGrid },
      { label: "Tampilkan catatan pembicara", checked: () => showSpeakerNotes, action: toggleSpeakerNotes },
      { label: "Zoom pas", action: () => { ($("#zoom-select") as HTMLSelectElement).value = "fit"; setZoom(fitZoom, true); } },
      { label: "Layar penuh", action: () => void document.documentElement.requestFullscreen() },
    ],
    insert: [
      { label: "Gambar", action: openImagePicker },
      { label: "Kotak teks", action: () => addText("body") },
      { label: "Judul", action: () => addText("title") },
      { label: "Bentuk persegi", action: () => addShape("rect") },
      { label: "Bentuk lingkaran", action: () => addShape("ellipse") },
      { label: "Garis", action: () => addShape("line") },
      {
        label: "Tabel", items: [
          { label: "Sisipkan tabel...", action: promptAddTable },
          { label: "Tabel 3 x 3", action: () => addTable(3, 3) },
          { label: "Tabel 5 x 4", action: () => addTable(5, 4) },
          { separator: true },
          { label: "Tambah baris bawah", disabled: tableDisabled, action: () => editSelectedTable("row-after") },
          { label: "Tambah kolom kanan", disabled: tableDisabled, action: () => editSelectedTable("col-after") },
          { label: "Hapus baris", disabled: tableDisabled, action: () => editSelectedTable("row-delete") },
          { label: "Hapus kolom", disabled: tableDisabled, action: () => editSelectedTable("col-delete") },
          { label: "Hapus tabel", disabled: tableDisabled, action: deleteSelectedTable },
        ]
      },
      { separator: true },
      { label: "Header & Footer", action: addHeaderFooter },
      { label: "Nomor slide", action: addSlideNumber },
      { label: "Komentar", action: addCommentToNotes },
      { label: "Animasi", disabled: () => !hasSelection(), items: animationItems },
      { label: "Mockup HP", action: addPhone },
      { label: "Slide baru", shortcut: "Ctrl+M", action: addSlide },
    ],
    draw: [
      { label: "Pilih", action: () => toast("Mode pilih aktif.") },
      { label: "Pena hitam", action: () => addShape("line") },
      { label: "Highlighter", action: () => { addShape("rect"); const element = selected(); if (element?.type === "shape") { element.fill = "#fff475"; element.stroke = "#fff475"; element.h = 18; renderAll(); scheduleSave(); } } },
      { label: "Penggaris", checked: () => !$("#workspace").classList.contains("grid-hidden"), action: toggleWorkspaceGrid },
      { separator: true },
      { label: "Persegi", action: () => addShape("rect") },
      { label: "Lingkaran", action: () => addShape("ellipse") },
      { label: "Garis", action: () => addShape("line") },
      { label: "Shape fill biru", disabled: () => selected()?.type !== "shape", action: () => applySelectedShapeColor("fill", "#e8f0fe") },
      { label: "Shape outline biru", disabled: () => selected()?.type !== "shape", action: () => applySelectedShapeColor("stroke", "#1a73e8") },
    ],
    design: [
      { label: "Terang", action: () => applyTheme("light") },
      { label: "Gelap", action: () => applyTheme("dark") },
      { label: "Biru", action: () => applyTheme("blue") },
      { label: "Hijau", action: () => applyTheme("green") },
      { label: "Emas", action: () => applyTheme("gold") },
      { separator: true },
      { label: "Format background...", action: promptSlideBackground },
      { label: "Reset layout", action: resetSlideLayout },
    ],
    transitions: [
      { label: "Preview", action: renderAudienceSlide },
      { separator: true },
      ...transitionItems,
    ],
    animations: [
      { label: "Preview", action: () => renderCanvas() },
      { separator: true },
      ...animationItems.map((item) => ({ ...item, disabled: () => !hasSelection() })),
    ],
    slideshow: [
      { label: "Mulai slideshow", shortcut: "Ctrl+F5", action: () => void togglePresentation() },
      { label: "Publikasikan slide aktif", action: () => void publishSlideState() },
      { label: "Layar penuh", action: () => void document.documentElement.requestFullscreen() },
      { label: "Ikuti presenter", action: returnToLiveSlide },
    ],
    record: [
      { label: "Rekam layar", action: () => toast("Gunakan perekam layar browser/OS saat slideshow berjalan.") },
      { label: "Audio", action: () => toast("Perekaman audio native belum aktif; slideshow tetap bisa dibagikan live.") },
      { label: "Export video", action: () => toast("Export video belum tersedia di browser build ini.") },
    ],
    format: [
      { label: "Tebalkan", shortcut: "Ctrl+B", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("bold") },
      { label: "Miringkan", shortcut: "Ctrl+I", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("italic") },
      { label: "Garis bawah", shortcut: "Ctrl+U", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("underline") },
      { separator: true },
      { label: "Jadikan judul", disabled: () => selected()?.type !== "text", action: () => applySelectedTextFormat("title") },
      { label: "Jadikan isi", disabled: () => selected()?.type !== "text", action: () => applySelectedTextFormat("body") },
      { label: "Warna hitam", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("color", "#202124") },
      { label: "Warna biru", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("color", "#1a73e8") },
      { label: "Warna merah", disabled: () => !hasSelection(), action: () => applySelectedTextFormat("color", "#b3261e") },
      { separator: true },
      { label: "Perbesar font", disabled: () => !hasSelection(), action: () => applySelectedFontSize(4) },
      { label: "Perkecil font", disabled: () => !hasSelection(), action: () => applySelectedFontSize(-4) },
    ],
    slide: [
      { label: "Slide baru", shortcut: "Ctrl+M", disabled: editable, action: addSlide },
      { label: "Duplikasikan slide", shortcut: "Ctrl+D", disabled: editable, action: duplicateSlide },
      { label: "Hapus slide", shortcut: "Shift+Delete", disabled: () => !isEditableRole() || deck.slides.length <= 1, action: deleteCurrentSlide },
      { separator: true },
      { label: "Ganti nama slide", disabled: editable, action: () => renameSlide(currentSlide) },
      { label: "Ganti nama segment", disabled: editable, action: () => renameSegment(currentSlide) },
      { label: "Ubah background", action: promptSlideBackground },
      { label: "Transisi", items: transitionItems },
    ],
    arrange: [
      { label: "Bawa ke depan", disabled: () => !hasSelection(), action: () => arrangeSelected("front") },
      { label: "Bawa maju", disabled: () => !hasSelection(), action: () => arrangeSelected("forward") },
      { label: "Kirim mundur", disabled: () => !hasSelection(), action: () => arrangeSelected("backward") },
      { label: "Kirim ke belakang", disabled: () => !hasSelection(), action: () => arrangeSelected("back") },
      { separator: true },
      { label: "Ke tengah halaman", disabled: () => !hasSelection(), action: () => centerSelected("both") },
      { label: "Tengah horizontal", disabled: () => !hasSelection(), action: () => centerSelected("horizontal") },
      { label: "Tengah vertikal", disabled: () => !hasSelection(), action: () => centerSelected("vertical") },
    ],
    tools: [
      { label: "AI rapikan presentasi", disabled: editable, action: () => void runAiImproveCurrentDeck() },
      { separator: true },
      { label: "Diagnosa USB", action: () => void diagnoseUsb() },
      { label: "Refresh izin USB", action: () => void refreshUsbDevices() },
      { separator: true },
      { label: "Periksa ejaan", action: () => toast("Pemeriksa ejaan browser aktif pada teks yang diedit.") },
      { label: "Preferensi", action: () => switchInspector("device") },
    ],
    review: [
      { label: "Spelling", action: () => toast("Pemeriksa ejaan browser aktif pada teks yang diedit.") },
      { label: "Thesaurus", action: () => toast("Thesaurus belum tersedia offline.") },
      { label: "Translate", action: () => toast("Terjemahan belum tersedia offline.") },
      { label: "Accessibility", action: () => toast("Cek aksesibilitas: gunakan teks alt pada gambar dan kontras warna yang cukup.") },
      { label: "Komentar baru", action: addCommentToNotes },
      { label: "Tampilkan komentar", action: toggleSpeakerNotes },
    ],
    extensions: [
      { label: "ADB Live Mirror", action: () => switchInspector("device") },
      { label: "Import PPTX Browser", action: openPptxPicker },
    ],
    developer: [
      { label: "Diagnosa RTDB", action: () => toast(`Project aktif: ${projectId || "lokal"}`) },
      { label: "View JSON", action: downloadDeckJson },
      { label: "Macro placeholder", action: () => toast("Macro PowerPoint native tidak berjalan di browser.") },
      { label: "Add-ins", action: () => toast("Add-ins browser bisa ditambahkan sebagai modul web berikutnya.") },
    ],
    help: [
      { label: "Import PPTX", action: openPptxPicker },
    ],
  }[menu] || [];
}

function ensureMenuPopover(): HTMLElement {
  let popover = document.getElementById("menu-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "menu-popover";
    popover.className = "menu-popover";
    popover.hidden = true;
    document.body.append(popover);
  }
  return popover;
}

function closeMenu(): void {
  const popover = ensureMenuPopover();
  popover.hidden = true;
  activeMenuButton?.classList.remove("menu-open");
  activeMenuButton = null;
}

function renderMenuItem(item: MenuItem): HTMLElement {
  if (item.separator) {
    const separator = document.createElement("div");
    separator.className = "menu-separator";
    return separator;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = `menu-item${item.items?.length ? " has-submenu" : ""}`;
  const disabled = Boolean(item.disabled?.());
  button.disabled = disabled;
  button.innerHTML = `<span class="menu-check"></span><span class="menu-label"></span><span class="menu-shortcut"></span>`;
  $(".menu-check", button).textContent = item.checked?.() ? "✓" : item.icon || "";
  $(".menu-label", button).textContent = item.label || "";
  $(".menu-shortcut", button).textContent = item.items?.length ? "›" : item.shortcut || "";
  if (item.items?.length) {
    const submenu = document.createElement("div");
    submenu.className = "menu-submenu";
    item.items.forEach((child) => submenu.append(renderMenuItem(child)));
    button.append(submenu);
  }
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (disabled || item.items?.length) return;
    closeMenu();
    void item.action?.();
  });
  return button;
}

function openMenu(button: HTMLElement): void {
  const menu = button.dataset.menu || "";
  const popover = ensureMenuPopover();
  if (activeMenuButton === button && !popover.hidden) { closeMenu(); return; }
  activeMenuButton?.classList.remove("menu-open");
  activeMenuButton = button;
  button.classList.add("menu-open");
  popover.innerHTML = "";
  menuItems(menu).forEach((item) => popover.append(renderMenuItem(item)));
  const rect = button.getBoundingClientRect();
  popover.style.left = `${rect.left}px`;
  popover.style.top = `${rect.bottom + 3}px`;
  popover.hidden = false;
}

function switchInspector(tab: "device" | "properties"): void {
  if (tab === "device" && selected()?.type !== "phone") {
    toast("Pilih mockup HP terlebih dahulu untuk menghubungkan perangkat mobile.");
    tab = "properties";
  }
  document.querySelectorAll(".inspector-tabs button").forEach((button) => button.classList.toggle("active", (button as HTMLElement).dataset.tab === tab));
  $("#device-panel").classList.toggle("active", tab === "device");
  $("#properties-panel").classList.toggle("active", tab === "properties");
  syncInspectorMode();
}

function syncInspectorMode(): void {
  const hasSelectedPhone = selected()?.type === "phone";
  const inspector = $("#inspector");
  inspector.classList.toggle("adb-hidden", !hasSelectedPhone);
  if (!hasSelectedPhone && $("#device-panel").classList.contains("active")) {
    document.querySelectorAll(".inspector-tabs button").forEach((button) => button.classList.toggle("active", (button as HTMLElement).dataset.tab === "properties"));
    $("#device-panel").classList.remove("active");
    $("#properties-panel").classList.add("active");
  }
}

function fitWorkspace(): void {
  const workspace = $("#workspace");
  const availableWidth = Math.max(200, workspace.clientWidth - 80);
  const availableHeight = Math.max(120, workspace.clientHeight - 65);
  fitZoom = clamp(Math.min(availableWidth / SLIDE_WIDTH, availableHeight / SLIDE_HEIGHT), .25, 1.35);
  const select = $("#zoom-select") as HTMLSelectElement;
  if (select.value === "fit") setZoom(fitZoom, true);
}

function setZoom(value: number, fit = false): void {
  zoom = clamp(value, .25, 1.6);
  $("#slide-shell").setAttribute("style", `transform:scale(${zoom})`);
  $("#zoom-label").textContent = fit ? "Pas" : `${Math.round(zoom * 100)}%`;
}

function cssToken(value: string | undefined): string {
  return (value || "none").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "none";
}

function renderAudienceSlide(): void {
  const target = $("#audience-slide");
  target.innerHTML = "";
  const slide = deck.slides[clamp(currentSlide, 0, deck.slides.length - 1)];
  if (!slide) return;
  target.className = `audience-slide transition-${cssToken(slide.transition)}`;
  for (const element of slide.elements) target.append(createElementNode(element, true));
  resizeAudienceSlide();
  renderAudienceChrome();
  renderRemoteCursors();
}

function renderAudienceChrome(): void {
  $("#audience-title-text").textContent = deck.title || "Presentasi tanpa judul";
  const progress = $("#audience-segments");
  progress.innerHTML = "";
  deck.slides.forEach((_, index) => {
    const step = document.createElement("button");
    step.type = "button";
    step.className = `audience-progress-step${index === currentSlide ? " viewer-current" : ""}${index === presenterSlide ? " live-owner" : ""}${index < currentSlide ? " seen" : ""}`;
    step.title = `${slideSegmentLabel(index)} - slide ${index + 1}`;
    step.setAttribute("aria-label", `Ke slide ${index + 1}`);
    step.addEventListener("click", () => goToAudienceSlide(index));
    progress.append(step);
  });
  const live = role === "owner"
    ? presentationState.presenting && currentSlide === presenterSlide
    : presentationState.presenting && followingPresenter && currentSlide === presenterSlide;
  $("#audience-slide-index").textContent = `${currentSlide + 1} / ${deck.slides.length}`;
  $("#audience-live-state").textContent = live ? "Live" : "Tidak Live";
  $("#audience-live-toggle").classList.toggle("not-live", !live);
  const ownerSegment = segmentForSlide(presenterSlide || currentSlide);
  const segmentButton = $("#audience-segment-button");
  segmentButton.textContent = ownerSegment.label;
  segmentButton.title = `Segment owner: ${ownerSegment.label}`;
  const nextIndex = Math.min(currentSlide + 1, deck.slides.length - 1);
  $("#audience-next-label").textContent = nextIndex > currentSlide ? `Slide selanjutnya ${nextIndex + 1}` : "Slide terakhir";
  const nextThumb = $("#audience-next-thumb");
  nextThumb.innerHTML = "";
  nextThumb.append(createSlidePreview(deck.slides[nextIndex], "next-slide-preview"));
  const status = $("#audience-status");
  status.classList.toggle("live", presentationState.presenting && live);
  $("span:last-child", status).textContent = presentationState.presenting
    ? live ? "LIVE - peer-to-peer" : "Tidak Live - klik Live untuk kembali"
    : "Menunggu presenter...";
  renderSegmentDialog();
}

function renderAudiencePeople(): void {
  const active = activePresenceRecords.filter((item) => item && item.name);
  const avatars = $("#audience-avatars");
  avatars.innerHTML = "";
  active.slice(0, 3).forEach((item) => {
    const avatar = document.createElement("span");
    avatar.className = "presence-avatar";
    avatar.style.background = item.color || randomColor(item.name);
    avatar.title = item.name;
    avatar.textContent = shortInitials(item.name);
    avatars.append(avatar);
  });
  $("#audience-more").textContent = active.length > 3 ? `+${active.length - 3}` : "";
  const list = $("#people-list");
  list.innerHTML = "";
  if (!active.length) {
    list.innerHTML = '<p class="empty-people">Belum ada audiens lain.</p>';
    return;
  }
  active.forEach((item) => {
    const row = document.createElement("div");
    row.className = "people-row";
    row.innerHTML = '<span class="presence-avatar"></span><div><strong></strong><span></span></div>';
    const avatar = $(".presence-avatar", row);
    avatar.textContent = shortInitials(item.name);
    avatar.setAttribute("style", `background:${item.color || randomColor(item.name)}`);
    $("strong", row).textContent = item.name;
    $("span:last-child", row).textContent = `${item.role} · slide ${Number(item.slide || 0) + 1}`;
    list.append(row);
  });
}

function showAudienceChrome(): void {
  const view = $("#audience-view");
  view.classList.remove("chrome-hidden");
  clearTimeout(audienceChromeTimer);
  audienceChromeTimer = window.setTimeout(() => view.classList.add("chrome-hidden"), 3600);
}

function syncAudienceRailState(): void {
  const open = ($("#segment-dialog") as HTMLDialogElement).open || ($("#people-dialog") as HTMLDialogElement).open;
  $("#audience-view").classList.toggle("rail-open", open && isAudienceOpen());
  resizeAudienceSlide();
}

function resetDialogMotion(dialog: HTMLDialogElement): void {
  dialog.style.transition = "";
  dialog.style.transform = "";
  dialog.style.opacity = "";
}

function openAudienceRailDialog(dialog: HTMLDialogElement): void {
  for (const other of [$("#segment-dialog") as HTMLDialogElement, $("#people-dialog") as HTMLDialogElement]) {
    if (other !== dialog && other.open) {
      resetDialogMotion(other);
      other.close();
    }
  }
  dialog.classList.add("audience-rail-dialog");
  resetDialogMotion(dialog);
  if (!dialog.open) dialog.show();
  syncAudienceRailState();
  showAudienceChrome();
}

function openPeopleDialog(): void {
  renderAudiencePeople();
  const dialog = $("#people-dialog") as HTMLDialogElement;
  if (isAudienceOpen()) openAudienceRailDialog(dialog);
  else dialog.showModal();
}

function goToAudienceSlide(index: number): void {
  currentSlide = clamp(index, 0, deck.slides.length - 1);
  if (role === "owner") {
    presenterSlide = currentSlide;
    followingPresenter = true;
    if (presentationState.presenting) void publishSlideState();
  } else {
    followingPresenter = currentSlide === presenterSlide;
    if (!followingPresenter) disconnectViewerRtc();
    else if (presentationState.presenting) void connectViewerRtc();
  }
  renderAudienceSlide();
  updatePresenceSlide();
  showAudienceChrome();
}

function returnToLiveSlide(): void {
  followingPresenter = true;
  currentSlide = presenterSlide;
  renderAudienceSlide();
  if (presentationState.presenting && role !== "owner") void connectViewerRtc();
  updatePresenceSlide();
  showAudienceChrome();
}

function audienceStep(delta: number): void {
  goToAudienceSlide(currentSlide + delta);
}

function isAudienceOpen(): boolean {
  return !$("#audience-view").hasAttribute("hidden");
}

function handleAudienceStageClick(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest(".remote-cursor")) return;
  const rect = $("#audience-stage").getBoundingClientRect();
  const x = (event.clientX - rect.left) / Math.max(1, rect.width);
  if (x < 0.34) audienceStep(-1);
  else if (x > 0.66) audienceStep(1);
  else showAudienceChrome();
}

async function leaveAudienceView(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  if (role === "viewer") {
    location.href = homeUrl();
    return;
  }
  $("#audience-view").setAttribute("hidden", "");
  $("#editor-app").removeAttribute("hidden");
  showAudienceChrome();
}

function syncFullscreenButton(): void {
  const button = $("#audience-fullscreen");
  const full = Boolean(document.fullscreenElement);
  button.innerHTML = full
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.title = full ? "Keluar layar penuh" : "Layar penuh";
  button.setAttribute("aria-label", button.title);
}

function returnOwnerToEditorFromAudience(): void {
  if (role !== "owner" || !isAudienceOpen()) return;
  $("#audience-view").setAttribute("hidden", "");
  $("#editor-app").removeAttribute("hidden");
  renderAll();
  requestAnimationFrame(fitWorkspace);
}

function handleFullscreenChange(): void {
  syncFullscreenButton();
  if (!document.fullscreenElement && role === "owner" && presentationState.presenting && isAudienceOpen()) {
    returnOwnerToEditorFromAudience();
  }
}

async function toggleAudienceFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    if (role === "owner") returnOwnerToEditorFromAudience();
  }
  else if (document.fullscreenEnabled) await document.documentElement.requestFullscreen().catch(() => undefined);
  syncFullscreenButton();
}

function pointerToSlidePoint(event: PointerEvent, surface: HTMLElement): { x: number; y: number } {
  const rect = surface.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / Math.max(1, rect.width) * SLIDE_WIDTH, 0, SLIDE_WIDTH),
    y: clamp((event.clientY - rect.top) / Math.max(1, rect.height) * SLIDE_HEIGHT, 0, SLIDE_HEIGHT),
  };
}

function editingLabelFromTarget(target: EventTarget | null, element: SlideElement | null): string {
  const node = target instanceof HTMLElement ? target : null;
  if (node?.closest('[contenteditable="true"]')) return `Mengedit ${elementLabel(element)}`;
  if (document.activeElement?.id === "prop-text" && selected()) return `Mengedit ${elementLabel(selected())}`;
  return "";
}

function updatePointerFromSurface(event: PointerEvent, surface: HTMLElement): void {
  if (!activePresencePath) return;
  const point = pointerToSlidePoint(event, surface);
  const element = elementAtSlidePoint(point.x, point.y);
  const editing = editingLabelFromTarget(event.target, element);
  updatePresenceCursor({
    x: Math.round(point.x),
    y: Math.round(point.y),
    slide: currentSlide,
    visible: true,
    target: elementLabel(element),
    targetId: element?.id,
    editing,
  });
}

function resizeAudienceSlide(): void {
  const stage = $("#audience-stage");
  const scale = Math.min(stage.clientWidth / SLIDE_WIDTH, stage.clientHeight / SLIDE_HEIGHT);
  $("#audience-slide").setAttribute("style", `transform:translate(-50%,-50%) scale(${scale})`);
}

function cursorRecordsForSlide(slideIndex: number): PresenceRecord[] {
  const now = Date.now();
  return activePresenceRecords.filter((item) => {
    const cursor = item.cursor;
    return item.sessionId !== presenceSessionId
      && cursor?.visible
      && Number(cursor.slide) === slideIndex
      && (!cursor.updatedAt || now - Number(cursor.updatedAt) < 10000);
  });
}

function renderCursorNode(item: PresenceRecord, scaled = false): HTMLElement {
  const cursor = item.cursor!;
  const node = document.createElement("div");
  node.className = `remote-cursor remote-cursor-${item.role}`;
  node.style.setProperty("--cursor-color", item.color || randomColor(item.name));
  node.style.left = scaled ? `${(cursor.x / SLIDE_WIDTH) * 100}%` : `${cursor.x}px`;
  node.style.top = scaled ? `${(cursor.y / SLIDE_HEIGHT) * 100}%` : `${cursor.y}px`;
  node.innerHTML = '<svg class="remote-cursor-pointer" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 2.8 25.4 18.5l-9.1 1.2 5.3 8.7-5.5 3.2-5.2-8.8-5.7 6.4L4 2.8Z"></path></svg><span class="remote-cursor-label"><strong></strong><em></em></span>';
  $("strong", node).textContent = item.name;
  $("em", node).textContent = cursor.editing || cursor.target || `Slide ${Number(cursor.slide || 0) + 1}`;
  return node;
}

function renderRemoteCursors(): void {
  const editorCanvas = document.getElementById("slide-canvas");
  if (editorCanvas) {
    let layer = document.getElementById("editor-cursor-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "editor-cursor-layer";
      layer.className = "remote-cursor-layer editor-cursor-layer";
      editorCanvas.append(layer);
    }
    layer.innerHTML = "";
    cursorRecordsForSlide(currentSlide).forEach((item) => layer?.append(renderCursorNode(item)));
  }

  const audienceStage = document.getElementById("audience-stage");
  if (audienceStage) {
    let layer = document.getElementById("audience-cursor-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "audience-cursor-layer";
      layer.className = "remote-cursor-layer audience-cursor-layer";
      audienceStage.append(layer);
    }
    layer.innerHTML = "";
    cursorRecordsForSlide(currentSlide).forEach((item) => layer?.append(renderCursorNode(item, true)));
  }
}

function getDeviceLabel(serial: string | null): string {
  return serial ? connectedDevices.get(serial)?.label || "" : "";
}

function deviceSerial(device: AdbDaemonWebUsbDevice): string {
  return device.serial || device.raw.serialNumber || `${device.raw.vendorId}:${device.raw.productId}:${device.name}`;
}

function setUsbStatus(message: string, state: "warning" | "online" | "error" = "warning"): void {
  const badge = $("#usb-indicator");
  badge.className = `connection-badge ${state}`;
  badge.textContent = message;
}

function explainUsbError(error: unknown): string {
  const raw = String((error as { message?: string })?.message || error || "Kesalahan USB");
  const lower = raw.toLowerCase();
  if (lower.includes("must be handling a user gesture") || lower.includes("user activation")) return "Popup USB hanya boleh dibuka langsung dari klik tombol Hubungkan.";
  if (lower.includes("access denied") || lower.includes("permission")) return "Izin USB ditolak. Buka kunci HP, aktifkan USB debugging, lalu izinkan komputer ini.";
  if (lower.includes("busy") || lower.includes("claim") || lower.includes("already in use")) return "Interface ADB sedang dipakai adb.exe, Android Studio, scrcpy, DeX, atau aplikasi lain. Tutup aplikasi tersebut lalu cabut-colok USB.";
  if (lower.includes("timeout")) return "Koneksi ADB timeout. Pastikan layar HP terbuka dan popup ‘Allow USB debugging’ disetujui.";
  if (lower.includes("disconnected") || lower.includes("lost") || lower.includes("transfer")) return "Perangkat terputus saat handshake. Gunakan kabel data, pilih mode Transfer file, lalu Refresh izin.";
  return raw;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer = 0;
  return Promise.race([promise, new Promise<T>((_, reject) => { timer = window.setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

async function requestUsbDevice(): Promise<void> {
  if (!isSecureContext || !("usb" in navigator) || !usbManager) {
    setUsbStatus("WebUSB tidak tersedia", "error");
    toast("Gunakan Chrome/Edge desktop melalui localhost atau HTTPS.");
    return;
  }
  try {
    log("Membuka pemilih WebUSB. Pilih satu perangkat Android.");
    const device = await usbManager.requestDevice();
    if (!device) { log("Pemilihan perangkat dibatalkan."); return; }
    await connectAdbDevice(device);
  } catch (error) {
    console.error(error);
    const message = explainUsbError(error);
    setUsbStatus("Koneksi gagal", "error");
    log(message, true);
  }
}

async function refreshUsbDevices(): Promise<void> {
  if (!usbManager) { toast("WebUSB tidak didukung browser ini."); return; }
  try {
    const devices = await usbManager.getDevices();
    if (!devices.length) { log("Belum ada izin USB tersimpan. Klik Hubungkan perangkat USB.", true); return; }
    log(`${devices.length} perangkat berizin ditemukan. Menghubungkan satu per satu.`);
    for (const device of devices) {
      const serial = deviceSerial(device);
      if (!connectedDevices.has(serial)) await connectAdbDevice(device);
    }
  } catch (error) {
    const message = explainUsbError(error);
    setUsbStatus("Refresh gagal", "error");
    log(message, true);
  }
}

async function connectAdbDevice(device: AdbDaemonWebUsbDevice): Promise<void> {
  const serial = deviceSerial(device);
  if (connectedDevices.has(serial)) return;
  setUsbStatus("Membuka WebUSB…");
  log(`Membuka ${device.name || serial}. Pastikan HP dalam keadaan unlock.`);
  let connection: AdbDaemonWebUsbConnection | null = null;
  try {
    connection = await withTimeout(device.connect(), 20000, "Timeout membuka interface WebUSB.");
    setUsbStatus("Izinkan pada HP…");
    log("Interface terbuka. Menunggu persetujuan ‘Allow USB debugging’ pada HP.");
    const transport = await withTimeout(AdbDaemonTransport.authenticate({ serial, connection, credentialStore, readTimeLimit: 45000 }), 80000, "Timeout handshake ADB.");
    const adb = new Adb(transport);
    const model = (await adb.getProp("ro.product.model").catch(() => "")) || device.name || serial;
    connectedDevices.set(serial, { device, connection, adb, label: model.trim() });
    void adb.disconnected.then(() => disconnectAdbDevice(serial));
    setUsbStatus(`${connectedDevices.size} perangkat siap`, "online");
    log(`ADB siap: ${model.trim()} (${serial}).`, true);
    renderDevices();
    if (presentationState.presenting) void ensureCurrentSlideMirrors();
  } catch (error) {
    try { await connection?.readable.cancel(); } catch { /* best effort */ }
    try { await connection?.writable.close(); } catch { /* best effort */ }
    throw error;
  }
}

function disconnectAdbDevice(serial: string): void {
  stopMirror(serial);
  connectedDevices.delete(serial);
  setUsbStatus(connectedDevices.size ? `${connectedDevices.size} perangkat siap` : "Perangkat terputus", connectedDevices.size ? "online" : "warning");
  renderDevices();
}

function renderDevices(): void {
  $("#device-count").textContent = String(connectedDevices.size);
  const target = $("#device-list");
  target.innerHTML = "";
  if (!connectedDevices.size) {
    target.innerHTML = '<div class="empty-device">Belum ada perangkat ADB.</div>';
  } else {
    for (const [serial, device] of connectedDevices) {
      const node = document.createElement("button");
      const selectedElement = selected();
      node.className = `device-card${selectedElement?.type === "phone" && selectedElement.deviceSerial === serial ? " selected" : ""}`;
      node.innerHTML = '<span class="device-icon">▯</span><span class="device-meta"><strong></strong><span></span></span><i class="device-ready"></i>';
      $("strong", node).textContent = device.label;
      $(".device-meta span", node).textContent = serial;
      node.addEventListener("click", () => assignDevice(serial));
      target.append(node);
    }
  }
  renderDeviceSelect();
}

function renderDeviceSelect(): void {
  const select = $("#device-select") as HTMLSelectElement;
  const element = selected();
  select.innerHTML = "";
  const initial = document.createElement("option");
  initial.value = "";
  initial.textContent = element?.type === "phone" ? "— pilih perangkat —" : "Pilih mockup terlebih dahulu";
  select.append(initial);
  for (const [serial, device] of connectedDevices) {
    const option = document.createElement("option");
    option.value = serial;
    option.textContent = `${device.label} · ${serial}`;
    select.append(option);
  }
  select.disabled = element?.type !== "phone" || !isEditableRole();
  select.value = element?.type === "phone" && element.deviceSerial ? element.deviceSerial : "";
}

function assignDevice(serial: string): void {
  const element = selected();
  if (element?.type !== "phone") { toast("Pilih mockup HP pada slide terlebih dahulu."); return; }
  const device = connectedDevices.get(serial);
  if (!device) return;
  element.deviceSerial = serial;
  element.deviceLabel = device.label;
  recordHistory();
  renderAll();
  scheduleSave();
  toast(`${device.label} dipasang ke mockup terpilih.`);
}

async function diagnoseUsb(): Promise<void> {
  try {
    const webUsb = (navigator as unknown as { usb?: BrowserUsbApi }).usb;
    if (!webUsb) { log("WebUSB tidak tersedia. Gunakan Chrome/Edge desktop.", true); return; }
    const devices = await webUsb.getDevices();
    log(`Diagnosa: ${devices.length} perangkat memiliki izin untuk origin ${location.origin}.`);
    for (const device of devices) {
      const label = [device.manufacturerName, device.productName].filter(Boolean).join(" ") || "USB device";
      log(`${label} | vendor=0x${device.vendorId.toString(16)} product=0x${device.productId.toString(16)} opened=${device.opened}`);
      for (const config of device.configurations || []) for (const iface of config.interfaces || []) for (const alternate of iface.alternates || []) {
        if (alternate.interfaceClass === 255 && alternate.interfaceSubclass === 66 && alternate.interfaceProtocol === 1) log(`Interface ADB ditemukan pada interface ${iface.interfaceNumber}.`);
      }
    }
    log("Jika interface ADB ada tetapi gagal dibuka, tutup adb.exe/Android Studio/scrcpy dan cabut-colok kabel.", true);
  } catch (error) {
    log(`Diagnosa gagal: ${explainUsbError(error)}`, true);
  }
}

async function startSelectedMirror(): Promise<void> {
  const element = selected();
  if (element?.type !== "phone") { toast("Pilih mockup HP terlebih dahulu."); return; }
  if (!element.deviceSerial || !connectedDevices.has(element.deviceSerial)) { toast("Pilih perangkat yang sudah tersambung untuk mockup ini."); return; }
  await startMirror(element.deviceSerial);
}

async function startMirror(serial: string): Promise<void> {
  if (mirrorStates.get(serial)?.running) return;
  const connected = connectedDevices.get(serial);
  if (!connected) return;
  const state: MirrorState = { running: true, lastUrl: null };
  mirrorStates.set(serial, state);
  renderCanvas();
  log(`Mirror dimulai: ${connected.label}.`);
  while (state.running && connectedDevices.has(serial)) {
    try {
      const bytes = await connected.adb.subprocess.noneProtocol.spawnWait(["screencap", "-p"]);
      if (!bytes.byteLength) throw new Error("ADB screencap menghasilkan frame kosong.");
      const png = Uint8Array.from(bytes);
      const blob = new Blob([png.buffer], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const image = frameImages.get(serial) || new Image();
      image.onload = () => updateVisiblePhoneFrames(serial, image.src);
      image.src = url;
      frameImages.set(serial, image);
      if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
      state.lastUrl = url;
    } catch (error) {
      log(`Mirror ${connected.label}: ${friendlyError(error)}`);
      await sleep(900);
    }
    await sleep(MIRROR_INTERVAL);
  }
  renderCanvas();
}

function stopMirror(serial: string): void {
  const state = mirrorStates.get(serial);
  if (!state) return;
  state.running = false;
  if (state.lastUrl) URL.revokeObjectURL(state.lastUrl);
  mirrorStates.delete(serial);
  frameImages.delete(serial);
  renderCanvas();
}

function updateVisiblePhoneFrames(serial: string, url: string): void {
  document.querySelectorAll<HTMLElement>(`.slide-element[data-element-id]`).forEach((node) => {
    const element = deck.slides.flatMap((slide) => slide.elements).find((item) => item.id === node.dataset.elementId);
    if (element?.type !== "phone" || element.deviceSerial !== serial) return;
    const screen = node.querySelector<HTMLElement>(".phone-screen");
    if (!screen) return;
    let image = screen.querySelector<HTMLImageElement>("img");
    if (!image) { image = new Image(); screen.innerHTML = ""; screen.append(image); }
    image.src = url;
    node.querySelector(".device-label")?.classList.add("live");
  });
}

async function ensureCurrentSlideMirrors(): Promise<void> {
  const serials = new Set(current().elements.flatMap((element) => element.type === "phone" && element.deviceSerial ? [element.deviceSerial] : []));
  await Promise.all([...serials].filter((serial) => connectedDevices.has(serial)).map(startMirror));
}

function drawBroadcastFrame(): void {
  const canvas = $("#broadcast-canvas") as HTMLCanvasElement;
  const width = SLIDE_WIDTH * BROADCAST_SCALE;
  const height = SLIDE_HEIGHT * BROADCAST_SCALE;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  drawSlideToContext(context, current(), BROADCAST_SCALE);
}

function drawSlideToContext(context: CanvasRenderingContext2D, slide: Slide, scale = 1): void {
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  for (const element of slide.elements) {
    if (element.type === "text") drawTextElement(context, element);
    else if (element.type === "phone") drawPhoneElement(context, element);
    else if (element.type === "image" || element.type === "canvas") drawImageElement(context, element);
    else drawShapeElement(context, element);
  }
}

function waitForDeckImage(src: string, timeoutMs = 8000): Promise<void> {
  const image = ensureDeckImage(src);
  if (image.complete && image.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
  });
}

async function waitForSlideImages(slide: Slide): Promise<void> {
  await Promise.all(slide.elements.flatMap((element) => element.type === "image" || element.type === "canvas" ? [waitForDeckImage(element.src)] : []));
}

function slideTextDigest(slide: Slide): string {
  return slide.elements
    .flatMap((element) => {
      if (element.type === "text") return [element.text];
      if (element.type === "shape" && element.text) return [element.text];
      if ((element.type === "image" || element.type === "canvas") && element.alt) return [element.alt];
      return [];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSlideBackgroundElement(element: SlideElement): boolean {
  return element.type === "shape"
    && element.shape === "rect"
    && element.x <= 2
    && element.y <= 2
    && element.w >= SLIDE_WIDTH - 4
    && element.h >= SLIDE_HEIGHT - 4;
}

function inferredImportFontSize(element: TextElement): number {
  const lines = Math.max(1, element.text.split("\n").length);
  const insetTop = element.insetTop ?? 3.6;
  const insetBottom = element.insetBottom ?? 3.6;
  const availableHeight = Math.max(8, element.h - insetTop - insetBottom);
  const heightSize = availableHeight / lines / (element.lineHeight || 1.12);
  const textLength = Math.max(1, element.text.replace(/\s+/g, " ").trim().length);
  const widthSize = element.w / Math.min(52, Math.max(10, textLength)) * 1.8;
  const base = Math.min(heightSize, widthSize || heightSize);
  return clamp(base, element.variant === "title" ? 18 : 10.5, element.variant === "title" ? 54 : 30);
}

let importTextMeasureContext: CanvasRenderingContext2D | null = null;

function measuredImportTextWidth(text: string, element: TextElement | ShapeElement, fontSize: number): number {
  if (!importTextMeasureContext) {
    importTextMeasureContext = document.createElement("canvas").getContext("2d");
  }
  const fallback = text.length * fontSize * 0.55;
  if (!importTextMeasureContext) return fallback;
  const italic = element.italic ? "italic " : "";
  const weight = element.bold ? "700 " : "400 ";
  importTextMeasureContext.font = `${italic}${weight}${fontSize}px ${element.fontFamily || "Arial"}`;
  return importTextMeasureContext.measureText(text).width || fallback;
}

function estimateImportTextLines(element: TextElement | ShapeElement, fontSize: number): number {
  const text = element.type === "shape" ? element.text || "" : element.text;
  const insetLeft = element.insetLeft ?? 7.2;
  const insetRight = element.insetRight ?? 7.2;
  const contentWidth = Math.max(12, element.w - insetLeft - insetRight);
  return text.split("\n").reduce((total, paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return total + 1;
    let lines = 1;
    let currentWidth = 0;
    for (const word of words) {
      const wordWidth = measuredImportTextWidth(`${word} `, element, fontSize);
      if (wordWidth > contentWidth) {
        lines += Math.max(0, Math.ceil(wordWidth / contentWidth) - 1);
        currentWidth = wordWidth % contentWidth;
      } else if (currentWidth > 0 && currentWidth + wordWidth > contentWidth) {
        lines += 1;
        currentWidth = wordWidth;
      } else {
        currentWidth += wordWidth;
      }
    }
    return total + lines;
  }, 0);
}

function expandImportTextBox(element: TextElement | ShapeElement): void {
  const text = element.type === "shape" ? element.text || "" : element.text;
  if (!text) return;
  const fontSize = element.fontSize || 12;
  const insetLeft = element.insetLeft ?? 7.2;
  const insetRight = element.insetRight ?? 7.2;
  const insetTop = element.insetTop ?? 3.6;
  const insetBottom = element.insetBottom ?? 3.6;
  const longestWord = text
    .split(/\s+/)
    .reduce((longest, word) => Math.max(longest, measuredImportTextWidth(word, element, fontSize)), 0);
  const neededWidth = Math.ceil(longestWord + insetLeft + insetRight + 6);
  element.w = Math.min(SLIDE_WIDTH - element.x, Math.max(element.w, neededWidth));
  const lines = estimateImportTextLines(element, fontSize);
  const lineHeight = element.lineHeight || 1.18;
  const neededHeight = Math.ceil(lines * fontSize * lineHeight + insetTop + insetBottom + 4);
  element.h = Math.min(SLIDE_HEIGHT - element.y, Math.max(element.h, neededHeight));
}

function normalizeImportOverlayElement(element: SlideElement): SlideElement | null {
  if (isSlideBackgroundElement(element)) return null;
  const clone = structuredClone(element);
  if (clone.type === "text") {
    if (!clone.fontSize || clone.fontSize < 7) clone.fontSize = inferredImportFontSize(clone);
    else if (clone.variant === "body") clone.fontSize = clamp(clone.fontSize, 10.5, 42);
    else clone.fontSize = clamp(clone.fontSize, 16, 64);
    expandImportTextBox(clone);
  }
  if (clone.type === "shape" && clone.text) {
    if (!clone.fontSize || clone.fontSize < 7) {
      const asText: TextElement = { ...clone, type: "text", variant: "body", text: clone.text };
      clone.fontSize = inferredImportFontSize(asText);
    } else {
      clone.fontSize = clamp(clone.fontSize, 10.5, 42);
    }
    expandImportTextBox(clone);
  }
  return clone;
}

function drawImportCanvasBackground(context: CanvasRenderingContext2D, slide: Slide, scale: number): void {
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  for (const element of slide.elements) {
    if (isSlideBackgroundElement(element) && element.type === "shape") drawShapeElement(context, element);
  }
}

async function rasterizeDeckForImport(source: Deck): Promise<Deck> {
  const slides: Slide[] = [];
  for (const [index, slide] of source.slides.entries()) {
    await waitForSlideImages(slide);
    const canvas = document.createElement("canvas");
    const scale = 3;
    canvas.width = SLIDE_WIDTH * scale;
    canvas.height = SLIDE_HEIGHT * scale;
    const context = canvas.getContext("2d");
    if (!context) {
      slides.push(slide);
      continue;
    }
    drawImportCanvasBackground(context, slide, scale);
    const animation = slide.elements.find((element) => element.animation)?.animation || "";
    const textDigest = slideTextDigest(slide);
    const overlayElements = slide.elements
      .map(normalizeImportOverlayElement)
      .filter((element): element is SlideElement => Boolean(element));
    slides.push({
      id: slide.id || uid("slide"),
      name: slide.name || `Slide ${index + 1}`,
      section: slide.section || (index === 0 ? "Intro" : ""),
      transition: slide.transition || "",
      notes: slide.notes || "",
      elements: [{
        id: uid("canvas"),
        type: "canvas",
        x: 0,
        y: 0,
        w: SLIDE_WIDTH,
        h: SLIDE_HEIGHT,
        src: canvas.toDataURL("image/webp", 0.97),
        alt: textDigest || `Canvas slide ${index + 1}`,
        ...(animation ? { animation } : {}),
      }, ...overlayElements],
    });
  }
  return sanitizeDeck({ title: source.title, slides });
}

function drawTextElement(context: CanvasRenderingContext2D, element: TextElement): void {
  const size = element.fontSize || (element.variant === "title" ? 36 : 20);
  const insetLeft = element.insetLeft ?? 8;
  const insetRight = element.insetRight ?? 8;
  const insetTop = element.insetTop ?? 6;
  const lineHeight = element.lineHeight || 1.08;
  const innerX = element.x + insetLeft;
  const innerY = element.y + insetTop;
  const innerW = Math.max(1, element.w - insetLeft - insetRight);
  context.save();
  context.beginPath();
  context.rect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  context.clip();
  context.fillStyle = readableCanvasTextColor(element.color, element.variant === "title" ? "#202124" : "#4a4f55");
  context.textBaseline = "top";
  context.textAlign = element.align || "left";
  context.font = canvasTextFont(element, size);
  const lines = wrapCanvasText(context, element.text, innerW);
  const textX = element.align === "center" ? innerX + innerW / 2 : element.align === "right" ? innerX + innerW : innerX;
  lines.forEach((line, index) => {
    const y = innerY + index * size * lineHeight;
    context.fillText(line, textX, y);
    if (element.underline) {
      const width = context.measureText(line).width;
      const startX = element.align === "center" ? textX - width / 2 : element.align === "right" ? textX - width : textX;
      context.beginPath();
      context.moveTo(startX, y + size * 0.92);
      context.lineTo(startX + width, y + size * 0.92);
      context.strokeStyle = context.fillStyle;
      context.lineWidth = Math.max(1, size / 18);
      context.stroke();
    }
  });
  context.restore();
}

function canvasTextFont(element: TextElement, size: number): string {
  const style = element.italic ? "italic " : "";
  const weight = element.bold || element.variant === "title" ? "600" : "400";
  return `${style}${weight} ${size}px ${canvasFontFamily(element.fontFamily)}`;
}

function canvasFontFamily(fontFamily?: string): string {
  if (!fontFamily) return "Inter, Segoe UI, Arial";
  const escaped = fontFamily.replace(/["\\]/g, "");
  return /[\s,]/.test(escaped) ? `"${escaped}", Inter, Segoe UI, Arial` : `${escaped}, Inter, Segoe UI, Arial`;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

function readableCanvasTextColor(color: string | undefined, fallback: string): string {
  const chosen = color || fallback;
  const hex = /^#([0-9a-f]{6})$/i.exec(chosen)?.[1];
  if (!hex) return chosen;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.92 ? "#202124" : chosen;
}

function drawImageElement(context: CanvasRenderingContext2D, element: ImageElement | CanvasElement): void {
  const image = ensureDeckImage(element.src);
  if (!image.complete || !image.naturalWidth) return;
  context.save();
  context.beginPath();
  context.rect(element.x, element.y, element.w, element.h);
  context.clip();
  context.drawImage(image, element.x, element.y, element.w, element.h);
  context.restore();
}

function drawShapeElement(context: CanvasRenderingContext2D, element: ShapeElement): void {
  context.save();
  context.strokeStyle = element.stroke || "transparent";
  context.fillStyle = element.fill || "transparent";
  context.lineWidth = element.shape === "line" ? 3 : 1.5;
  if (element.shape === "ellipse") {
    context.beginPath();
    context.ellipse(element.x + element.w / 2, element.y + element.h / 2, Math.abs(element.w / 2), Math.abs(element.h / 2), 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (element.shape === "line") {
    context.beginPath();
    context.moveTo(element.x, element.y);
    context.lineTo(element.x + element.w, element.y + element.h);
    context.stroke();
  } else {
    context.fillRect(element.x, element.y, element.w, element.h);
    context.strokeRect(element.x, element.y, element.w, element.h);
  }
  if (element.text) drawTextElement(context, { ...element, type: "text", variant: "body", text: element.text });
  context.restore();
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  context.beginPath();
  context.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
}

function drawPhoneElement(context: CanvasRenderingContext2D, element: PhoneElement): void {
  context.save();
  roundedRect(context, element.x, element.y, element.w, element.h, 28);
  context.fillStyle = "#101114";
  context.fill();
  const inset = 12;
  roundedRect(context, element.x + inset, element.y + inset, element.w - inset * 2, element.h - inset * 2, 21);
  context.clip();
  const image = element.deviceSerial ? frameImages.get(element.deviceSerial) : undefined;
  if (image?.complete && image.naturalWidth) {
    const targetW = element.w - inset * 2;
    const targetH = element.h - inset * 2;
    const ratio = Math.min(targetW / image.naturalWidth, targetH / image.naturalHeight);
    const w = image.naturalWidth * ratio;
    const h = image.naturalHeight * ratio;
    context.fillStyle = "#000";
    context.fillRect(element.x + inset, element.y + inset, targetW, targetH);
    context.drawImage(image, element.x + inset + (targetW - w) / 2, element.y + inset + (targetH - h) / 2, w, h);
  } else {
    context.fillStyle = "#101827";
    context.fillRect(element.x + inset, element.y + inset, element.w - inset * 2, element.h - inset * 2);
    context.fillStyle = "#c5cad3";
    context.font = "12px Inter, Segoe UI, Arial";
    context.textAlign = "center";
    context.fillText(element.deviceSerial ? "Menunggu frame ADB" : "Pilih perangkat USB", element.x + element.w / 2, element.y + element.h / 2);
  }
  context.restore();
}

async function togglePresentation(): Promise<void> {
  if (role !== "owner") {
    const fullscreen = document.fullscreenEnabled && !document.fullscreenElement
      ? document.documentElement.requestFullscreen().catch(() => undefined)
      : Promise.resolve();
    showAudience();
    await fullscreen;
    syncFullscreenButton();
    return;
  }
  if (presentationState.presenting) await stopPresentation(); else await startPresentation();
}

async function startPresentation(): Promise<void> {
  const fullscreen = document.fullscreenEnabled && !document.fullscreenElement
    ? document.documentElement.requestFullscreen().catch(() => undefined)
    : Promise.resolve();
  drawBroadcastFrame();
  const canvas = $("#broadcast-canvas") as HTMLCanvasElement;
  broadcastStream = canvas.captureStream(30);
  clearInterval(broadcastTimer);
  broadcastTimer = window.setInterval(drawBroadcastFrame, 100);
  presentationState = { currentSlide, presenting: true, presenterSession: firebaseUser.uid, updatedAt: Date.now() };
  await set(ref(db, `presentations/${projectId}/state`), presentationState);
  await remove(ref(db, `presentationRtc/${projectId}`)).catch(() => undefined);
  const button = $("#present-button");
  button.classList.add("live");
  button.innerHTML = "<span>■</span><span>Hentikan</span>";
  await ensureCurrentSlideMirrors();
  showAudience();
  await fullscreen;
  presenterRequestUnsubscribe?.();
  presenterRequestUnsubscribe = onChildAdded(ref(db, `presentationRtc/${projectId}`), (snapshot) => {
    const request = snapshot.child("request").val() as { uid?: string } | null;
    if (request?.uid) void answerViewer(snapshot.key || "");
  });
  toast("Presentasi live dimulai. Link viewer akan menerima video peer-to-peer.");
}

async function stopPresentation(): Promise<void> {
  presentationState = { currentSlide, presenting: false, presenterSession: null, updatedAt: Date.now() };
  await set(ref(db, `presentations/${projectId}/state`), presentationState);
  presenterRequestUnsubscribe?.();
  presenterRequestUnsubscribe = null;
  for (const [id] of presenterPeers) cleanupPresenterPeer(id);
  broadcastStream?.getTracks().forEach((track) => track.stop());
  broadcastStream = null;
  clearInterval(broadcastTimer);
  await remove(ref(db, `presentationRtc/${projectId}`)).catch(() => undefined);
  const button = $("#present-button");
  button.classList.remove("live");
  button.innerHTML = "<span>▶</span><span>Presentasikan</span>";
  if (isAudienceOpen()) returnOwnerToEditorFromAudience();
  toast("Presentasi live dihentikan.");
}

async function publishSlideState(): Promise<void> {
  presenterSlide = currentSlide;
  presentationState.currentSlide = currentSlide;
  presentationState.updatedAt = Date.now();
  await set(ref(db, `presentations/${projectId}/state`), presentationState);
  updatePresenceSlide();
  await ensureCurrentSlideMirrors();
  drawBroadcastFrame();
}

async function answerViewer(viewerId: string): Promise<void> {
  if (!viewerId || !broadcastStream || presenterPeers.has(viewerId)) return;
  const base = `presentationRtc/${projectId}/${viewerId}`;
  const peer = new RTCPeerConnection(RTC_CONFIG);
  const unsubscribers: Unsubscribe[] = [];
  presenterPeers.set(viewerId, { peer, unsubscribers });
  for (const track of broadcastStream.getTracks()) peer.addTrack(track, broadcastStream);
  peer.onicecandidate = (event) => { if (event.candidate) void push(ref(db, `${base}/presenterCandidates`), event.candidate.toJSON()); };
  peer.onconnectionstatechange = () => {
    if (["failed", "closed", "disconnected"].includes(peer.connectionState)) cleanupPresenterPeer(viewerId);
  };
  unsubscribers.push(onChildAdded(ref(db, `${base}/viewerCandidates`), (snapshot) => { const candidate = snapshot.val(); if (candidate) void peer.addIceCandidate(candidate).catch(console.warn); }));
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await set(ref(db, `${base}/offer`), { type: offer.type, sdp: offer.sdp });
  unsubscribers.push(onValue(ref(db, `${base}/answer`), (snapshot) => {
    const answer = snapshot.val() as RTCSessionDescriptionInit | null;
    if (answer && !peer.currentRemoteDescription) void peer.setRemoteDescription(answer).catch(console.warn);
  }));
}

function cleanupPresenterPeer(viewerId: string): void {
  const value = presenterPeers.get(viewerId);
  if (!value) return;
  value.unsubscribers.forEach((unsubscribe) => unsubscribe());
  value.peer.close();
  presenterPeers.delete(viewerId);
}

async function connectViewerRtc(): Promise<void> {
  if (viewerPeer || role !== "viewer" || !followingPresenter) return;
  const viewerId = `${firebaseUser.uid.slice(0, 18)}_${crypto.randomUUID().slice(0, 8)}`;
  const base = `presentationRtc/${projectId}/${viewerId}`;
  const peer = new RTCPeerConnection(RTC_CONFIG);
  viewerPeer = peer;
  const video = $("#live-video") as HTMLVideoElement;
  const status = $("#audience-status");
  $("span:last-child", status).textContent = "Menghubungkan stream presenter...";
  peer.ontrack = (event) => {
    video.srcObject = event.streams[0];
    video.removeAttribute("hidden");
    $("#audience-slide").setAttribute("hidden", "");
    status.classList.add("live");
    $("span:last-child", status).textContent = "LIVE - peer-to-peer";
    void video.play().catch(() => undefined);
  };
  peer.onicecandidate = (event) => { if (event.candidate) void push(ref(db, `${base}/viewerCandidates`), event.candidate.toJSON()); };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      $("span:last-child", status).textContent = "Koneksi P2P gagal - jaringan mungkin memerlukan TURN";
      status.classList.remove("live");
    }
  };
  await set(ref(db, `${base}/request`), { uid: firebaseUser.uid, name: participantName, createdAt: serverTimestamp() });
  await onDisconnect(ref(db, base)).remove();
  rtcViewerUnsubscribe = onValue(ref(db, `${base}/offer`), (snapshot) => {
    const offer = snapshot.val() as RTCSessionDescriptionInit | null;
    if (!offer || peer.currentRemoteDescription) return;
    void (async () => {
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await set(ref(db, `${base}/answer`), { type: answer.type, sdp: answer.sdp });
    })().catch(console.error);
  });
  runtimeUnsubscribers.push(onChildAdded(ref(db, `${base}/presenterCandidates`), (snapshot) => { const candidate = snapshot.val(); if (candidate) void peer.addIceCandidate(candidate).catch(console.warn); }));
}

function disconnectViewerRtc(): void {
  rtcViewerUnsubscribe?.();
  rtcViewerUnsubscribe = null;
  viewerPeer?.close();
  viewerPeer = null;
  const video = $("#live-video") as HTMLVideoElement;
  video.srcObject = null;
  video.setAttribute("hidden", "");
  $("#audience-slide").removeAttribute("hidden");
  const status = $("#audience-status");
  status.classList.remove("live");
  $("span:last-child", status).textContent = "Menunggu presenter…";
}

function openShareDialog(): void {
  if (role !== "owner") return;
  const token = getOrCreateEditorToken();
  ($("#viewer-link") as HTMLInputElement).value = buildUrl({ view: true });
  ($("#editor-link") as HTMLInputElement).value = buildUrl({ edit: token });
  ($("#share-dialog") as HTMLDialogElement).showModal();
}

async function copyInput(id: string, label: string): Promise<void> {
  const value = ($(`#${id}`) as HTMLInputElement).value;
  await navigator.clipboard.writeText(value);
  toast(`${label} disalin.`);
}

async function deleteProject(id: string): Promise<void> {
  if (!id) return;
  try {
    await Promise.all([
      remove(ref(db, `presentationPresence/${id}`)),
      remove(ref(db, `presentationRtc/${id}`)),
      remove(ref(db, `presentationCollab/${id}`)),
    ]);
    await Promise.all([
      remove(ref(db, `presentations/${id}`)),
      remove(ref(db, `presentationUsers/${firebaseUser.uid}/projects/${id}`)),
    ]);
    localStorage.removeItem(`prezadb-edit-token:${firebaseUser.uid}:${id}`);
    toast("Presentasi dihapus permanen.");
    if (projectId === id) setTimeout(() => { location.href = homeUrl(); }, 500);
  } catch (error) {
    toast(`Gagal menghapus: ${friendlyError(error)}`);
  }
}

function cleanupProjectRuntime(): void {
  remoteUnsubscribe?.(); remoteUnsubscribe = null;
  presenceUnsubscribe?.(); presenceUnsubscribe = null;
  collaborationUnsubscribe?.(); collaborationUnsubscribe = null;
  presenterRequestUnsubscribe?.(); presenterRequestUnsubscribe = null;
  runtimeUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  activePresencePath = "";
  presenceSessionId = "";
  lastCursorPoint = null;
  joinedSharedProject = false;
  clearInterval(presenceTimer);
  clearInterval(broadcastTimer);
}

async function handleDroppedFiles(fileList: FileList | File[]): Promise<void> {
  const files = Array.from(fileList);
  if (!files.length) return;
  const pptx = files.find((file) => /\.(pptx|ppt)$/i.test(file.name));
  if (pptx) { await importPptxFile(pptx); return; }
  for (const image of files.filter((file) => file.type.startsWith("image/"))) await addImageFile(image);
}

function bindFileDrop(): void {
  const overlay = $("#drop-overlay");
  let dragDepth = 0;
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types || []).includes("Files");
  const show = (event: DragEvent) => {
    if (!isEditableRole() || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    overlay.removeAttribute("hidden");
  };
  const hide = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) overlay.setAttribute("hidden", "");
  };
  document.addEventListener("dragenter", show);
  document.addEventListener("dragover", (event) => {
    if (!isEditableRole() || !hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
  document.addEventListener("dragleave", hide);
  document.addEventListener("drop", (event) => {
    if (!isEditableRole() || !hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    overlay.setAttribute("hidden", "");
    if (event.dataTransfer?.files) void handleDroppedFiles(event.dataTransfer.files);
  });
}

function bindSwipeRightToClose(target: HTMLElement, close: () => void): void {
  let startX = 0;
  let startY = 0;
  let dragging = false;
  const reset = () => {
    target.style.transition = "";
    target.style.transform = "";
    target.style.opacity = "";
  };
  const closeWithAnimation = () => {
    target.style.transition = "transform .2s ease, opacity .2s ease";
    target.style.transform = "translateX(110%)";
    target.style.opacity = "0";
    window.setTimeout(() => {
      close();
      reset();
    }, 205);
  };
  target.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    target.style.transition = "none";
  });
  target.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = Math.max(0, event.clientX - startX);
    const dy = Math.abs(event.clientY - startY);
    if (dx > 4 && dy < 90) {
      target.style.transform = `translateX(${dx}px)`;
      target.style.opacity = String(Math.max(0.45, 1 - dx / 420));
    }
  });
  target.addEventListener("pointerup", (event) => {
    const dx = event.clientX - startX;
    const dy = Math.abs(event.clientY - startY);
    dragging = false;
    if (dx > 86 && dy < 70) closeWithAnimation();
    else reset();
  });
  target.addEventListener("pointercancel", () => {
    dragging = false;
    reset();
  });
}

function bindUi(): void {
  $("#create-project").addEventListener("click", () => void createProject().catch((error) => toast(friendlyError(error))));
  document.querySelectorAll<HTMLElement>("[data-template]").forEach((button) => {
    button.addEventListener("click", () => void createProject(button.dataset.template || "").catch((error) => toast(friendlyError(error))));
  });
  $("#back-home").addEventListener("click", () => { location.href = homeUrl(); });
  $("#add-slide").addEventListener("click", addSlide);
  $("#add-slide-bottom").addEventListener("click", addSlide);
  $("#add-title").addEventListener("click", () => addText("title"));
  $("#add-text").addEventListener("click", () => addText("body"));
  $("#add-phone").addEventListener("click", addPhone);
  $("#delete-element").addEventListener("click", deleteSelected);
  $("#delete-from-properties").addEventListener("click", deleteSelected);
  $("#undo").addEventListener("click", undo);
  $("#redo").addEventListener("click", redo);
  $("#deck-title").addEventListener("input", () => { deck.title = ($("#deck-title") as HTMLInputElement).value; scheduleSave(); });
  $("#deck-title").addEventListener("blur", recordHistory);
  $("#speaker-note").addEventListener("input", () => { current().notes = ($("#speaker-note") as HTMLInputElement).value; scheduleSave(); });
  $("#speaker-note").addEventListener("blur", recordHistory);
  for (const id of ["prop-x", "prop-y", "prop-w", "prop-h", "prop-text"]) $(`#${id}`).addEventListener("input", updateProperties);
  $("#device-select").addEventListener("change", () => assignDevice(($("#device-select") as HTMLSelectElement).value));
  $("#connect-usb").addEventListener("click", () => void requestUsbDevice());
  $("#refresh-usb").addEventListener("click", () => void refreshUsbDevices());
  $("#diagnose-usb").addEventListener("click", () => void diagnoseUsb());
  $("#start-mirror").addEventListener("click", () => void startSelectedMirror());
  $("#stop-mirror").addEventListener("click", () => { const element = selected(); if (element?.type === "phone" && element.deviceSerial) stopMirror(element.deviceSerial); });
  $("#present-button").addEventListener("click", () => void togglePresentation());
  $("#share-button").addEventListener("click", openShareDialog);
  $("#presence-button").addEventListener("click", openPeopleDialog);
  $("#join-card").addEventListener("submit", (event) => {
    event.preventDefault();
    void enterSharedProject().catch((error) => toast(friendlyError(error)));
  });
  $("#pptx-input").addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void importPptxFile(file);
  });
  $("#image-input").addEventListener("change", (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void addImageFile(file);
  });
  $("#copy-viewer").addEventListener("click", () => void copyInput("viewer-link", "Link viewer"));
  $("#copy-editor").addEventListener("click", () => void copyInput("editor-link", "Link editor"));
  $("#rotate-editor-link").addEventListener("click", () => {
    const token = getOrCreateEditorToken(true);
    ($("#editor-link") as HTMLInputElement).value = buildUrl({ edit: token });
    startOwnerCollaborationListener();
    toast("Link editor lama dinonaktifkan pada aplikasi pemilik ini.");
  });
  $("#confirm-delete").addEventListener("click", () => void deleteProject(deleteTarget));
  $("#audience-fullscreen").addEventListener("click", () => void toggleAudienceFullscreen());
  $("#audience-live-toggle").addEventListener("click", returnToLiveSlide);
  $("#audience-segment-button").addEventListener("click", () => {
    renderSegmentDialog();
    openAudienceRailDialog($("#segment-dialog") as HTMLDialogElement);
  });
  $("#audience-next").addEventListener("click", () => goToAudienceSlide(Math.min(currentSlide + 1, deck.slides.length - 1)));
  $("#audience-people-button").addEventListener("click", openPeopleDialog);
  $("#audience-view").addEventListener("pointerdown", showAudienceChrome);
  $("#audience-stage").addEventListener("click", handleAudienceStageClick);
  $("#slide-canvas").addEventListener("pointermove", (event) => updatePointerFromSurface(event, $("#slide-canvas")));
  $("#slide-canvas").addEventListener("pointerleave", hidePresenceCursor);
  $("#audience-stage").addEventListener("pointermove", (event) => updatePointerFromSurface(event, $("#audience-stage")));
  $("#audience-stage").addEventListener("pointerleave", hidePresenceCursor);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  ($("#people-dialog") as HTMLDialogElement).addEventListener("close", syncAudienceRailState);
  ($("#segment-dialog") as HTMLDialogElement).addEventListener("close", syncAudienceRailState);
  document.querySelectorAll<HTMLElement>(".inspector-tabs button").forEach((button) => button.addEventListener("click", () => switchInspector(button.dataset.tab === "properties" ? "properties" : "device")));
  bindSwipeRightToClose($("#inspector"), () => switchInspector("properties"));
  bindSwipeRightToClose($("#people-dialog"), () => ($("#people-dialog") as HTMLDialogElement).close());
  bindSwipeRightToClose($("#segment-dialog"), () => ($("#segment-dialog") as HTMLDialogElement).close());
  document.querySelectorAll<HTMLElement>("[data-menu]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    openMenu(button);
  }));
  document.addEventListener("click", () => { closeMenu(); closeSlideContextMenu(); });
  ($("#zoom-select") as HTMLSelectElement).addEventListener("change", () => {
    const value = ($("#zoom-select") as HTMLSelectElement).value;
    setZoom(value === "fit" ? fitZoom : Number(value), value === "fit");
  });
  $("#zoom-in").addEventListener("click", () => { ($("#zoom-select") as HTMLSelectElement).value = String(Math.min(1.25, Math.round((zoom + .25) * 100) / 100)); setZoom(zoom + .1); });
  $("#zoom-out").addEventListener("click", () => { ($("#zoom-select") as HTMLSelectElement).value = "0.75"; setZoom(zoom - .1); });
  addEventListener("resize", () => { fitWorkspace(); resizeAudienceSlide(); });
  addEventListener("keydown", (event) => {
    const editing = ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName) || (event.target as HTMLElement)?.isContentEditable;
    if (!editing && event.key === "Delete" && !event.shiftKey) {
      event.preventDefault();
      selectedElementId ? deleteSelected() : deleteCurrentSlide();
    }
    if (!editing && event.key === "Delete" && event.shiftKey) deleteCurrentSlide();
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSlide(); }
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "m") { event.preventDefault(); addSlide(); }
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "b") { event.preventDefault(); applySelectedTextFormat("bold"); }
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "i") { event.preventDefault(); applySelectedTextFormat("italic"); }
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "u") { event.preventDefault(); applySelectedTextFormat("underline"); }
    if (!editing && event.ctrlKey && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    if (!editing && event.key === "Escape") {
      if (isAudienceOpen()) void leaveAudienceView();
      else closeMenu();
    }
    if (!editing && isAudienceOpen() && ["ArrowRight", "PageDown", " "].includes(event.key)) { event.preventDefault(); audienceStep(1); }
    if (!editing && isAudienceOpen() && ["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) { event.preventDefault(); audienceStep(-1); }
  });
  const webUsb = (navigator as unknown as { usb?: BrowserUsbApi }).usb;
  if (webUsb) {
    webUsb.addEventListener("connect", () => log("Perangkat USB terdeteksi. Klik Refresh izin untuk menghubungkan."));
    webUsb.addEventListener("disconnect", (event: BrowserUsbConnectionEvent) => {
      for (const [serial, value] of connectedDevices) if (value.device.raw === event.device) disconnectAdbDevice(serial);
    });
  }
  addEventListener("beforeunload", () => {
    cleanupProjectRuntime();
    for (const serial of mirrorStates.keys()) stopMirror(serial);
  });
  bindFileDrop();
}

bindUi();
void boot();
