// preload bridge loaded
const { contextBridge, ipcRenderer } = require("electron");

// Minimal bridge used by src/index.js
contextBridge.exposeInMainWorld("electron", {
  // Installed scanning
  installAircraft: (opts) => ipcRenderer.invoke("install-aircraft", opts),
  uninstallAircraft: (opts) => ipcRenderer.invoke("uninstall-aircraft", opts),
  listAircraft: (installPath) =>
    ipcRenderer.invoke("list-aircraft", installPath),

  // File operations
  saveFile: (relPath, buffer) => {
    const u8 =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    return ipcRenderer.invoke("save-file", { relPath, buffer: u8 });
  },
  saveFileEx: (relPath, buffer, encrypt = false) => {
    const u8 =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    return ipcRenderer.invoke("save-file-ex", { relPath, buffer: u8, encrypt });
  },
  // Downloads directory aware saves
  downloadsSave: (relPath, buffer, encrypt = false) => {
    const u8 =
      buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || []);
    return ipcRenderer.invoke("downloads:save", {
      relPath,
      buffer: u8,
      encrypt,
    });
  },

  // Events
  onInstallProgress: (handler) => {
    // Forward payloads verbatim so renderer can use {percent, progress, status, phase} or plain numbers
    const listener = (_e, payload) => {
      try {
        handler(payload);
      } catch {}
    };
    ipcRenderer.on("install-progress", listener);
    return () => ipcRenderer.removeListener("install-progress", listener);
  },

  // Paths
  selectFolder: (defaultPath) =>
    ipcRenderer.invoke("dialog:openDirectory", defaultPath),
  getDefaultInstallPath: () => ipcRenderer.invoke("get-default-install-path"),
  getDefaultInstallPath2024: () =>
    ipcRenderer.invoke("get-default-install-path-2024"),
  // Persisted install paths in main settings (robust across localStorage/file:// origin changes)
  getSavedInstallPath2020: () =>
    ipcRenderer.invoke("settings:get-install-path-2020"),
  getSavedInstallPath2024: () =>
    ipcRenderer.invoke("settings:get-install-path-2024"),
  setSavedInstallPath2020: (dirPath) =>
    ipcRenderer.invoke("settings:set-install-path-2020", dirPath),
  setSavedInstallPath2024: (dirPath) =>
    ipcRenderer.invoke("settings:set-install-path-2024", dirPath),
  // Basic fs stat helper used by renderer to validate paths (Community, ZIP presence, etc.)
  statFile: (absPath) => ipcRenderer.invoke("fs:stat", absPath),
  // Create directory (mkdir -p)
  mkdirp: (absPath) => ipcRenderer.invoke("fs:mkdirp", absPath),

  clearDownloads: () => ipcRenderer.invoke("clear-downloads"),
  clearDownloadsDir: () => ipcRenderer.invoke("downloads:clear"),
  // Resumable downloads (Range + resume)
  downloadsFetchUrl: (relPath, url, encrypt = false, context = "") =>
    ipcRenderer.invoke("downloads:fetch-url", {
      url,
      relPath,
      encryptAtRest: encrypt,
      context,
    }),
  downloadsCancel: (context) => ipcRenderer.invoke("downloads:cancel", context),
  onDownloadProgress: (cb) => {
    const handler = (_e, payload) => {
      try {
        cb(payload);
      } catch {}
    };
    ipcRenderer.on("download-progress", handler);
    return () => ipcRenderer.off("download-progress", handler);
  },
  clearPkgCache: () => ipcRenderer.invoke("clear-pkg-cache"),
  deleteFile: (absPath) => ipcRenderer.invoke("delete-file", absPath),

  // Read changelog-like content from a downloaded ZIP (absolute path, supports .enc)
  readChangelogFromZip: (absZipPath) =>
    ipcRenderer.invoke("downloads:read-changelog-from-zip", absZipPath),

  // Package version
  getPackageVersion: (installPath, folder) =>
    ipcRenderer.invoke("get-package-version", { installPath, folder }),
  getPackageLastUpdate: (installPath, folder) =>
    ipcRenderer.invoke("get-package-lastupdate", { installPath, folder }),
  getPackageChangelogLocal: (installPath, folder) =>
    ipcRenderer.invoke("get-package-changelog-local", { installPath, folder }),
  // Resolve the real path for a Community link and its extract parent
  getPackageRealPath: (installPath, folder) =>
    ipcRenderer.invoke("get-package-realpath", { installPath, folder }),
  validatePackage: (installPath, folder) =>
    ipcRenderer.invoke("pkg:validate", { installPath, folder }),
  revealInFolder: (absPath) =>
    ipcRenderer.invoke("os:reveal-in-folder", absPath),
  openFolder: (absPath) => ipcRenderer.invoke("os:open-folder", absPath),

  // Secure token storage
  getSavedToken: (account = "default") =>
    ipcRenderer.invoke("auth:get-token", account),
  saveToken: (token, account = "default") =>
    ipcRenderer.invoke("auth:set-token", { account, token }),
  clearToken: (account = "default") =>
    ipcRenderer.invoke("auth:clear-token", account),

  // Downloads directory get/set
  getDownloadsDir: () => ipcRenderer.invoke("downloads:get-dir"),
  setDownloadsDir: (dirPath) =>
    ipcRenderer.invoke("downloads:set-dir", dirPath),

  // Package cache directory get/set
  getPkgCacheDir: () => ipcRenderer.invoke("pkg-cache:get-dir"),
  setPkgCacheDir: (dirPath) => ipcRenderer.invoke("pkg-cache:set-dir", dirPath),

  // Debug logging
  getDebugLogging: () => ipcRenderer.invoke("settings:get-debug-logging"),
  setDebugLogging: (enabled) =>
    ipcRenderer.invoke("settings:set-debug-logging", enabled),
  getLogsDir: () => ipcRenderer.invoke("settings:get-logs-dir"),

  // Probe the pkg-cache for an extracted directory that contains a top-level
  // folder matching the given Community package folder name
  findExtractDirForFolder: (folder) =>
    ipcRenderer.invoke("pkg-cache:find-extract-dir", { folder }),

  // Network fetch via main process (bypasses renderer CORS). Returns { ok, status, headers, text }.
  netFetchText: (url, options = {}) =>
    ipcRenderer.invoke("net:fetch-text", { url, ...(options || {}) }),
  // Network HEAD/meta via main (returns { ok, status, etag, lastModified, contentLength })
  netHead: (url, options = {}) =>
    ipcRenderer.invoke("net:head", { url, ...(options || {}) }),

  // App self-update
  getAppVersion: () => ipcRenderer.invoke("app:get-version"),
  checkForAppUpdate: () => ipcRenderer.invoke("app:check-for-update"),
  installAppUpdate: () => ipcRenderer.invoke("app:install-update"),
  onAppUpdateAvailable: (handler) => {
    const listener = (_e, payload) => {
      try {
        handler(payload);
      } catch {}
    };
    ipcRenderer.on("app:update-available", listener);
    return () => ipcRenderer.removeListener("app:update-available", listener);
  },
  onAppUpdateDownloadProgress: (handler) => {
    const listener = (_e, payload) => {
      try {
        handler(payload);
      } catch {}
    };
    ipcRenderer.on("app:update-download-progress", listener);
    return () =>
      ipcRenderer.removeListener("app:update-download-progress", listener);
  },
  onAppUpdateDownloaded: (handler) => {
    const listener = (_e, payload) => {
      try {
        handler(payload);
      } catch {}
    };
    ipcRenderer.on("app:update-downloaded", listener);
    return () => ipcRenderer.removeListener("app:update-downloaded", listener);
  },
});

// preload bridge ready
