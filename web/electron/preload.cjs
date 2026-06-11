const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("itsDesktop", {
  isElectron: true,
  platform: process.platform,
  requestWindowsLocation: () => ipcRenderer.invoke("its:get-current-position"),
  openLocationSettings: () => ipcRenderer.invoke("its:open-location-settings"),
  notify: (payload) => ipcRenderer.invoke("its:notify", payload),
  checkForUpdates: (options) => ipcRenderer.invoke("its:check-update", options || {}),
  getUpdateHistory: () => ipcRenderer.invoke("its:get-update-history"),
  openExternal: (url) => ipcRenderer.invoke("its:open-external", url),
  onNavigate: (callback) => {
    const handler = (_event, route) => callback(route);
    ipcRenderer.on("its:navigate", handler);
    return () => ipcRenderer.removeListener("its:navigate", handler);
  },
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("its:update-status", handler);
    return () => ipcRenderer.removeListener("its:update-status", handler);
  },
  onUpdateHistory: (callback) => {
    const handler = (_event, history) => callback(history);
    ipcRenderer.on("its:update-history", handler);
    return () => ipcRenderer.removeListener("its:update-history", handler);
  },
});
