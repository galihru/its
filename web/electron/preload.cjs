const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("itsDesktop", {
  isElectron: true,
  platform: process.platform,
  requestWindowsLocation: () => ipcRenderer.invoke("its:get-current-position"),
  openLocationSettings: () => ipcRenderer.invoke("its:open-location-settings"),
  checkForUpdates: (options) => ipcRenderer.invoke("its:check-update", options),
  getUpdateHistory: () => ipcRenderer.invoke("its:get-update-history"),
  minimizeWindow: () => ipcRenderer.invoke("its:window-minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("its:window-toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("its:window-close"),
  rendererReady: (message) => ipcRenderer.send("its:renderer-ready", message || "ready"),
  onOpenPanel: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("its:open-panel", listener);
    return () => ipcRenderer.removeListener("its:open-panel", listener);
  },
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("its:update-status", listener);
    return () => ipcRenderer.removeListener("its:update-status", listener);
  },
  onUpdateHistory: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("its:update-history", listener);
    return () => ipcRenderer.removeListener("its:update-history", listener);
  },
});
