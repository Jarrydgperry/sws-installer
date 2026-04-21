// Remove this stray log (it belongs in preload.js, not here):
// console.log('[preload] loaded');


// Ensure Electron runs as main process, not in browser
// require('electron-squirrel-startup'); // Only needed for Squirrel events, handled below
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
let AdmZip = null;
try { AdmZip = require('adm-zip'); } catch { AdmZip = null; }
let keytar = null;
try { keytar = require('keytar'); } catch { keytar = null; }
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch { autoUpdater = null; }

// Use a separate userData directory in development to avoid mixing prod/dev data
if (process.env.NODE_ENV === 'development') {
  try {
    const devUserData = path.join(app.getPath('userData'), 'Dev');
    app.setPath('userData', devUserData);
  } catch {}
}

let win;

// ─── Debug Logging ───────────────────────────────────────────────────────────
const LOGS_DIR = path.join(app.getPath('userData'), 'logs');
let _debugLogging = false;   // toggled at runtime via settings / IPC
let _logStream = null;       // current writable stream (or null)

function _ensureLogsDir() {
  try { fs.mkdirSync(LOGS_DIR, { recursive: true }); } catch {}
}

function _openLogStream() {
  if (_logStream) return;
  _ensureLogsDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(LOGS_DIR, `sws-installer-${ts}.log`);
  _logStream = fs.createWriteStream(file, { flags: 'a', encoding: 'utf8' });
  _logStream.on('error', () => { _logStream = null; });
  debugLog('INFO', 'Log session started');
}

function _closeLogStream() {
  if (!_logStream) return;
  try { _logStream.end(); } catch {}
  _logStream = null;
}

/**
 * Write a structured log line when debug logging is enabled.
 * @param {'INFO'|'WARN'|'ERROR'|'DEBUG'} level
 * @param {string} message
 * @param {object} [data]  extra key/values (kept JSON-safe)
 */
function debugLog(level, message, data) {
  if (!_debugLogging) return;
  if (!_logStream) _openLogStream();
  const line = JSON.stringify({
    t: new Date().toISOString(),
    lvl: level,
    msg: message,
    ...(data !== undefined && data !== null ? { d: data } : {})
  }) + '\n';
  try { _logStream.write(line); } catch {}
}

function setDebugLogging(enabled) {
  const was = _debugLogging;
  _debugLogging = !!enabled;
  if (_debugLogging && !was) _openLogStream();
  if (!_debugLogging && was) {
    debugLog('INFO', 'Logging disabled by user');
    _closeLogStream();
  }
}

// ─── End Debug Logging ───────────────────────────────────────────────────────

// Persistent settings (JSON) in userData
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try {
    const txt = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const j = JSON.parse(txt);
    return (j && typeof j === 'object') ? j : {};
  } catch { return {}; }
}
function writeSettings(patch) {
  try {
    const prev = readSettings();
    const next = { ...prev, ...(patch || {}) };
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
    return next;
  } catch { return null; }
}
function getDownloadsBaseDir() {
  // Configurable via settings, defaults to userData/downloads
  try {
    const s = readSettings();
    const d = String(s.downloadsDir || '').trim();
    return d || path.join(app.getPath('userData'), 'downloads');
  } catch {
    return path.join(app.getPath('userData'), 'downloads');
  }
}

function getPkgCacheDir() {
  // Configurable via settings, defaults to userData/pkg-cache
  try {
    const s = readSettings();
    const d = String(s.pkgCacheDir || '').trim();
    return d || path.join(app.getPath('userData'), 'pkg-cache');
  } catch {
    return path.join(app.getPath('userData'), 'pkg-cache');
  }
}

// Pick an app icon that exists (prefer a 512px PNG). On Windows, .ico is ideal for packaged apps,
// but PNG works for the window/taskbar during development.
function getAppIconPath() {
  const candidates = [
  path.join(__dirname, 'public', 'icon.ico'),
    path.join(__dirname, 'src', 'images', 'SWS_Logo_512.png'),
    path.join(__dirname, 'public', 'SWS_Logo_512.png'),
    path.join(__dirname, 'public', '1db6ce389229fe91b3b2.png'),
    path.join(__dirname, 'src', 'images', 'SWS_Logo.png')
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return undefined;
}

function createWindow() {
  debugLog('INFO', 'App starting', { version: app.getVersion(), platform: process.platform, arch: process.arch });
  win = new BrowserWindow({
    width: 1280,
    height: 800,
  resizable: false,
  minimizable: true,
  maximizable: false,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Security hardening: block in-app navigation and open external links in default browser
  const { shell } = require('electron');
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      try { shell.openExternal(url); } catch {}
    }
  });

  // Prefer fallback UI when present or forced, else built bundle, else source HTML
  const fallbackHtml = path.join(__dirname, 'src', 'ui.html');
  const distHtml = path.join(__dirname, 'dist', 'index.html');
  const srcHtml = path.join(__dirname, 'src', 'index.html');

  if ((process.env.SWS_FALLBACK_UI === '1') && fs.existsSync(fallbackHtml)) {
    win.loadFile(fallbackHtml);
  } else if (fs.existsSync(fallbackHtml) && !fs.existsSync(distHtml)) {
    win.loadFile(fallbackHtml);
  } else if (fs.existsSync(distHtml)) {
    win.loadFile(distHtml);
  } else {
    win.loadFile(srcHtml);
  }

  // Hide the default application menu (File/Edit/View, etc.)
  try { win.setMenu(null); } catch {}

  // Open DevTools automatically in development for easier debugging
  if (process.env.NODE_ENV === 'development') {
    try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
  }

  // Allow F12 to toggle DevTools in all modes (production included)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Inject a restrictive Content-Security-Policy for all responses (renderer loaded via file://).
  // Allows only self resources; permits data: images; restricts connect-src to https (and file for local) – adjust if specific CDN domains are known.
  try {
    // Updated CSP: allow Google Fonts CSS + font files, local file/blob images produced by bundling, and data URIs.
    // Still blocks remote scripts and framing. If additional domains are needed for API calls, append them to connect-src.
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      // Allow inline styles (used in index.html) and Google Fonts stylesheet
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      // Permit local packaged images, data URIs, and blob/file scheme images emitted by webpack
      // Include remote CDN for product thumbnails
      "img-src 'self' data: blob: file: https://sws-installer.b-cdn.net",
      // Allow local fonts plus Google Fonts font files
      "font-src 'self' data: https://fonts.gstatic.com",
      // Network requests to self (file:// resolves to self in Electron) and HTTPS endpoints (manifests / version JSON)
      "connect-src 'self' https:",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'"
    ].join('; ');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders || {};
      // Do not overwrite an existing stricter CSP if one exists
      if (!Object.keys(headers).some(h => h.toLowerCase() === 'content-security-policy')) {
        headers['Content-Security-Policy'] = [csp];
      }
      callback({ responseHeaders: headers });
    });
  } catch {}

  // Mirror renderer console to main stdout for easier debugging in packaged/production runs
  try {
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      try {
        const lvl = ({ 0: 'LOG', 1: 'WARN', 2: 'ERROR' }[level]) || String(level);
        const loc = sourceId ? `${sourceId}:${line || ''}` : '';
        console.log(`[renderer:${lvl}] ${message}${loc ? ` (${loc})` : ''}`);
      } catch (e) {
        console.log('[renderer]', message);
      }
    });
  } catch {}
}

// Read a changelog-like text file from a downloaded ZIP path (supports .enc)
ipcMain.handle('downloads:read-changelog-from-zip', async (_e, absZipPath) => {
  try {
    if (!absZipPath || typeof absZipPath !== 'string') throw new Error('Missing zip path');
    let zipPath = absZipPath;
    let tempToDelete = '';
    try {
      const hdr = await fs.promises.readFile(zipPath, { encoding: null }).then(b => b.slice(0,4)).catch(() => null);
      if (/\.enc$/i.test(zipPath) || (hdr && Buffer.isBuffer(hdr) && hdr.length >= 4 && hdr[0] !== 0x50)) {
        // Encrypted at rest: decrypt to temp using existing helper
        if (typeof decryptFileToTemp === 'function') {
          const tmp = await decryptFileToTemp(zipPath);
          zipPath = tmp;
          tempToDelete = tmp;
        }
      }
    } catch {}
    if (!AdmZip) throw new Error('adm-zip not available');
    const z = new AdmZip(zipPath);
    const entries = z.getEntries();
    const names = [
      'changelog.txt','changelog.md','CHANGELOG.txt','CHANGELOG.md','ChangeLog.txt','ChangeLog.md',
      'releasenotes.txt','releasenotes.md','ReleaseNotes.txt','ReleaseNotes.md','RELEASE-NOTES.txt','RELEASE-NOTES.md',
      'whatsnew.txt','whatsnew.md','WhatsNew.txt','WhatsNew.md',
      'changes.txt','changes.md','Changes.txt','Changes.md',
      'readme.txt','readme.md','README.txt','README.md'
    ];
    const isCandidate = (n) => {
      const b = String(n || '').split('/').pop();
      return names.includes(b);
    };
    let chosen = null;
    for (const e of entries) {
      if (!e.isDirectory && isCandidate(e.entryName)) { chosen = e; break; }
    }
    if (!chosen) {
      // fallback: any .txt/.md with likely keywords in path
      const kw = /(change|update|release|what\s*'s\s*new|whatsnew|notes|history|readme)/i;
      for (const e of entries) {
        if (!e.isDirectory && /\.(txt|md)$/i.test(e.entryName) && kw.test(e.entryName)) { chosen = e; break; }
      }
    }
    if (!chosen) {
      // No changelog text file — try manifest.json for structured changelog fields
      try {
        const manifestEntry = entries.find(e => !e.isDirectory && /manifest\.json$/i.test(e.entryName));
        if (manifestEntry) {
          const mBuf = manifestEntry.getData();
          const mJson = JSON.parse(mBuf.toString('utf8'));
          const langKeys = ['neutral','en-US','en-GB','en_US','en_GB','en'];
          const normField = (v) => {
            if (!v) return '';
            if (typeof v === 'string') return v.trim();
            if (Array.isArray(v)) return v.filter(x => typeof x === 'string').join('\n').trim();
            if (typeof v === 'object') {
              const cand = v.text || v.latest || v.body || v.content || '';
              if (typeof cand === 'string' && cand.trim()) return cand.trim();
              for (const lk of langKeys) { if (v[lk]) { const t = normField(v[lk]); if (t) return t; } }
              const first = Object.values(v).find(x => typeof x === 'string' && x.trim());
              if (first) return String(first).trim();
            }
            return '';
          };
          const lu = normField(mJson.LastUpdate || mJson.lastUpdate || mJson.last_update || '');
          const rn = normField(mJson.ReleaseNotes || mJson.releaseNotes || mJson.release_notes || '');
          const oh = normField(mJson.OlderHistory || mJson.olderHistory || mJson.older_history || mJson.History || mJson.history || '');
          const parts = [];
          if (lu) parts.push(lu);
          if (rn && rn !== lu) parts.push(rn);
          if (oh) parts.push(oh);
          if (parts.length) {
            if (tempToDelete) { try { await fs.promises.rm(tempToDelete, { force: true }); } catch {} }
            return { success: true, changelog: parts.join('\n\n'), file: 'manifest.json' };
          }
        }
      } catch {}
      return { success: false, error: 'No changelog found' };
    }
    const buf = chosen.getData();
    const text = buf.toString('utf8');
    // Also try manifest.json for structured OlderHistory to build full history
    let fullText = text;
    try {
      const manifestEntry = entries.find(e => !e.isDirectory && /manifest\.json$/i.test(e.entryName));
      if (manifestEntry) {
        const mBuf = manifestEntry.getData();
        const mJson = JSON.parse(mBuf.toString('utf8'));
        const langKeys = ['neutral','en-US','en-GB','en_US','en_GB','en'];
        const normField = (v) => {
          if (!v) return '';
          if (typeof v === 'string') return v.trim();
          if (Array.isArray(v)) return v.filter(x => typeof x === 'string').join('\n').trim();
          if (typeof v === 'object') {
            const cand = v.text || v.latest || v.body || v.content || '';
            if (typeof cand === 'string' && cand.trim()) return cand.trim();
            for (const lk of langKeys) { if (v[lk]) { const t = normField(v[lk]); if (t) return t; } }
            const first = Object.values(v).find(x => typeof x === 'string' && x.trim());
            if (first) return String(first).trim();
          }
          return '';
        };
        const lu = normField(mJson.LastUpdate || mJson.lastUpdate || mJson.last_update || '');
        const rn = normField(mJson.ReleaseNotes || mJson.releaseNotes || mJson.release_notes || '');
        const oh = normField(mJson.OlderHistory || mJson.olderHistory || mJson.older_history || mJson.History || mJson.history || '');
        // Build combined text from manifest fields if they add content beyond the changelog file
        const parts = [];
        if (lu) parts.push(lu);
        if (rn && rn !== lu) parts.push(rn);
        if (oh) parts.push(oh);
        if (parts.length) {
          const manifestText = parts.join('\n\n');
          // Use manifest text if it's longer (more complete) than the changelog file
          if (manifestText.length > text.length) fullText = manifestText;
        }
      }
    } catch {}
    if (tempToDelete) { try { await fs.promises.rm(tempToDelete, { force: true }); } catch {} }
    return { success: true, changelog: fullText, file: chosen.entryName };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

app.whenReady().then(() => {
  // Restore debug logging toggle from settings
  try {
    const s = readSettings();
    if (s.debugLogging) setDebugLogging(true);
  } catch {}

  createWindow();
  // --- Auto-updater setup ---
  if (autoUpdater) {
    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.logger = { info: (...a) => console.log('[updater:info]', ...a), warn: (...a) => console.warn('[updater:warn]', ...a), error: (...a) => console.error('[updater:error]', ...a) };

      autoUpdater.on('checking-for-update', () => {
        try { console.log('[updater] Checking for update...'); } catch {}
      });
      autoUpdater.on('update-available', (info) => {
        try { console.log('[updater] Update available:', info?.version); } catch {}
        try { win?.webContents?.send('app:update-available', { version: info?.version || '' }); } catch {}
      });
      autoUpdater.on('update-not-available', () => {
        try { console.log('[updater] App is up to date'); } catch {}
      });
      autoUpdater.on('download-progress', (prog) => {
        try { win?.webContents?.send('app:update-download-progress', { percent: Math.round(prog?.percent || 0) }); } catch {}
      });
      autoUpdater.on('update-downloaded', (info) => {
        try { console.log('[updater] Update downloaded:', info?.version); } catch {}
        try { win?.webContents?.send('app:update-downloaded', { version: info?.version || '' }); } catch {}
      });
      autoUpdater.on('error', (err) => {
        try { console.error('[updater] Error:', err?.message || err); } catch {}
      });

      // Check after a brief delay so the window has time to load
      setTimeout(() => {
        try { autoUpdater.checkForUpdates(); } catch (e) { console.error('[updater] checkForUpdates failed:', e?.message); }
      }, 5000);
    } catch (e) {
      console.error('[updater] Setup failed:', e?.message || e);
    }
  }
});
app.on('window-all-closed', () => {
  debugLog('INFO', 'App closing');
  _closeLogStream();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// IPC: App update controls
ipcMain.handle('app:check-for-update', async () => {
  if (!autoUpdater) return { error: 'Auto-updater not available' };
  try { const r = await autoUpdater.checkForUpdates(); return { version: r?.updateInfo?.version || '' }; }
  catch (e) { return { error: e?.message || String(e) }; }
});
ipcMain.handle('app:install-update', () => {
  if (!autoUpdater) return;
  try { autoUpdater.quitAndInstall(false, true); } catch {}
});
ipcMain.handle('app:get-version', () => app.getVersion());

async function ensureDir(dir) { await fs.promises.mkdir(dir, { recursive: true }); }

async function readInstalledPackagesPathFrom(userCfgPath) {
  try {
    const txt = await fs.promises.readFile(userCfgPath, 'utf8');
    const m = txt.match(/InstalledPackagesPath\s*"?([^"\r\n]+)"?/i);
    if (!m) return '';
    const base = m[1].trim();
  const community = path.join(base, 'Community');
  // Always prefer the Community folder path; create later if missing
  return community;
  } catch { return ''; }
}
async function detectFS2020() {
  const A = process.env.APPDATA || '';
  const L = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(A, 'Microsoft Flight Simulator', 'UserCfg.opt'),
    path.join(L, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt')
  ];
  for (const p of candidates) {
    try { await fs.promises.access(p); const c = await readInstalledPackagesPathFrom(p); if (c) return c; } catch {}
  }
  // Fallback: probe common MS Store/Steam Community locations
  const common = [
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'WindowsApps', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Steam', 'steamapps', 'common', 'MicrosoftFlightSimulator', 'Community')
  ];
  for (const c of common) {
    try { await fs.promises.access(c); return c; } catch {}
  }
  return '';
}
async function detectFS2024() {
  const A = process.env.APPDATA || '';
  const L = process.env.LOCALAPPDATA || '';
  const candidates = [
    // Roaming variants
    path.join(A, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'),
    path.join(A, 'Microsoft Flight Simulator', 'UserCfg.opt'), // some installs reuse the 2020 folder name
    // LocalAppData MS Store / Xbox Game Pass package IDs
    path.join(L, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt'),
    path.join(L, 'Packages', 'Microsoft.MicrosoftFlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt'),
    path.join(L, 'Packages', 'Microsoft.FlightSimulator2024_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt'),
    path.join(L, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'UserCfg.opt')
  ];
  for (const p of candidates) {
    try { await fs.promises.access(p); const c = await readInstalledPackagesPathFrom(p); if (c) return c; } catch {}
  }
  // Fallback: probe typical FS2024 Community locations
  const common24 = [
    path.join(L, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
    path.join(L, 'Packages', 'Microsoft.MicrosoftFlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
    path.join(L, 'Packages', 'Microsoft.FlightSimulator2024_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
    path.join(L, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages', 'Community'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Steam', 'steamapps', 'common', 'MicrosoftFlightSimulator2024', 'Community'),
    path.join(process.env.PROGRAMFILES || 'C:/Program Files', 'Steam', 'steamapps', 'common', 'MicrosoftFlightSimulator2024', 'Community'),
    // Common custom Steam library locations
    path.join('D:/SteamLibrary', 'steamapps', 'common', 'MicrosoftFlightSimulator2024', 'Community'),
    path.join('E:/SteamLibrary', 'steamapps', 'common', 'MicrosoftFlightSimulator2024', 'Community'),
    // Xbox app / MS Store custom install base (common patterns)
    path.join('C:/XboxGames', 'Microsoft Flight Simulator 2024', 'Content', 'Community'),
    path.join('C:/XboxGames', 'Microsoft Flight Simulator', 'Content', 'Community')
  ];
  for (const c of common24) {
    try { await fs.promises.access(c); return c; } catch {}
  }
  return '';
}

async function readPackageManifestVersion(pkgDir) {
  try {
    const manifestPath = path.join(pkgDir, 'manifest.json');
    const txt = await fs.promises.readFile(manifestPath, 'utf8');
    const json = JSON.parse(txt);
    return json.package_version || json.version || '';
  } catch { return ''; }
}

// Stream download to file with redirects
async function downloadToFile(url, destFile, { maxRedirects = 5, timeoutMs = 300000 } = {}) {
  await ensureDir(path.dirname(destFile));
  const doReq = (u, redirectsLeft) => new Promise((resolve, reject) => {
    const lib = u.startsWith('https:') ? https : http;
    const req = lib.get(u, { headers: { 'User-Agent': 'SWS-Installer/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        const next = new URL(res.headers.location, u).toString();
        res.resume();
        return resolve(doReq(next, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const out = fs.createWriteStream(destFile);
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(destFile)));
      out.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Download timeout')));
  });
  return doReq(url, maxRedirects);
}

// ---------------- Resumable download engine (HTTP Range + If-Range) ----------------
const activeDownloadMap = new Map(); // context -> { abort: () => void }

async function headRequest(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.request(url, { method: 'HEAD', headers: { 'User-Agent': 'SWS-Installer/1.0' } }, res => {
      const status = res.statusCode || 0;
      const headers = res.headers || {};
      // Follow redirects explicitly (Node doesn't auto-follow for HEAD)
      if (status >= 300 && status < 400 && headers.location) {
        if (redirectsLeft <= 0) {
          res.resume();
          return reject(new Error('HEAD too many redirects'));
        }
        const next = new URL(headers.location, url).toString();
        res.resume();
        return resolve(headRequest(next, redirectsLeft - 1));
      }
      const info = {
        statusCode: status,
        contentLength: Number(headers['content-length'] || headers['Content-Length'] || 0) || 0,
        etag: headers.etag || headers['ETag'] || '',
        lastModified: headers['last-modified'] || headers['Last-Modified'] || ''
      };
      res.resume();
      resolve(info);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('HEAD timeout')));
    req.end();
  });
}

// Fallback meta fetch using a tiny ranged GET when HEAD is blocked
async function rangeMetaRequest(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const opts = { headers: { 'User-Agent': 'SWS-Installer/1.0', 'Range': 'bytes=0-0' } };
    const req = lib.get(url, opts, res => {
      const status = res.statusCode || 0;
      const headers = res.headers || {};
      // Follow redirects explicitly
      if (status >= 300 && status < 400 && headers.location) {
        if (redirectsLeft <= 0) {
          res.resume();
          return reject(new Error('GET meta too many redirects'));
        }
        const next = new URL(headers.location, url).toString();
        res.resume();
        return resolve(rangeMetaRequest(next, redirectsLeft - 1));
      }
      // Content-Range: bytes 0-0/12345
      let total = 0;
      const cr = headers['content-range'] || headers['Content-Range'] || '';
      const m = /\/(\d+)$/.exec(String(cr));
      if (m) total = Number(m[1]) || 0;
      if (!total) total = Number(headers['content-length'] || headers['Content-Length'] || 0) || 0;
      const info = {
        statusCode: status,
        contentLength: total,
        etag: headers.etag || headers['ETag'] || '',
        lastModified: headers['last-modified'] || headers['Last-Modified'] || ''
      };
      // Drain body
      res.on('data', () => {});
      res.on('end', () => resolve(info));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('GET meta timeout')));
  });
}

async function downloadToDownloadsWithResume(event, { url, relPath, encryptAtRest = false, context = '' }) {
  const sender = event?.sender;
  const base = getDownloadsBaseDir();
  const finalPath = path.resolve(base, relPath);
  debugLog('INFO', 'Download started', { file: path.basename(relPath), context });
  try { console.log('[DOWNLOAD:start] ' + JSON.stringify({ relPath, base, finalPath, encryptAtRest, context })); } catch {}
  const partPath = finalPath + '.part';
  const metaPath = finalPath + '.meta.json';

  await ensureDir(path.dirname(finalPath));

  const meta = { etag: '', lastModified: '', total: 0 };
  let startSize = 0;
  try { const st = await fs.promises.stat(partPath); startSize = st.size; } catch {}
  try { const m = JSON.parse(await fs.promises.readFile(metaPath, 'utf8')); Object.assign(meta, m || {}); } catch {}

  let head;
  try {
    head = await headRequest(url);
  } catch (e) {
    head = { statusCode: 0, contentLength: 0, etag: '', lastModified: '' };
  }
  if (!head || head.statusCode >= 400) {
    // Fallback to tiny GET with Range to obtain meta when HEAD is blocked
    let meta;
    try { meta = await rangeMetaRequest(url); } catch {}
    if (!meta || (meta.statusCode !== 200 && meta.statusCode !== 206)) {
      // Proceed without meta instead of aborting; some CDNs block HEAD and Range but allow GET
      try {
        console.warn('[DOWNLOAD:meta] probe failed; proceeding without content-length', {
          statusHead: head?.statusCode || 0
        });
      } catch {}
      head = { statusCode: 200, contentLength: 0, etag: '', lastModified: '' };
    } else {
      head = meta;
    }
  }
  const total = head.contentLength;
  const etag = head.etag || '';
  const lastModified = head.lastModified || '';

  // Validate existing part against current server signature
  const signatureMatches = (!!etag && meta.etag && etag === meta.etag) || (!!lastModified && meta.lastModified && lastModified === meta.lastModified);
  if (!signatureMatches) {
    // Drop existing partial if signatures changed
    try { await fs.promises.unlink(partPath); } catch {}
    try { await fs.promises.unlink(metaPath); } catch {}
    startSize = 0;
  }

  // Persist current meta (no URL stored to avoid exposing CDN links)
  meta.etag = etag; meta.lastModified = lastModified; meta.total = total;
  await fs.promises.writeFile(metaPath, JSON.stringify({ etag: meta.etag, lastModified: meta.lastModified, total: meta.total }));

  // Throttled console logging to help smoke-test progress without spamming
  let lastLoggedPct = -10;
  let lastLogTs = 0;
  function sendProgress(pct, recBytes = null) {
    try {
      // Report actual received bytes if provided, do not clamp to total (total may be 0/unknown)
      const r = (Number.isFinite(recBytes) && recBytes >= 0) ? recBytes : startSize;
      if (sender) sender.send('download-progress', { context, pct, received: r, total });
      else sendInstallProgress({ type: 'download-progress', context, pct, received: r, total });
      const now = Date.now();
      if ((pct >= lastLoggedPct + 10) || (now - lastLogTs > 15000) || pct === 100) {
        lastLoggedPct = pct;
        lastLogTs = now;
        try { console.log('[DOWNLOAD:progress] ' + JSON.stringify({ context, pct, received: r, total })); } catch {}
      }
    } catch {}
  }

  // If file already complete and exists at finalPath, short-circuit
  try {
    const stFinal = await fs.promises.stat(finalPath);
    if (stFinal.size > 0 && (!total || stFinal.size === total || encryptAtRest)) {
      // We can't easily validate size when encrypted; assume complete if present
      sendProgress(100, stFinal.size || total || 0);
      return { success: true, fullPath: finalPath };
    }
  } catch {}

  const lib = url.startsWith('https:') ? https : http;
  let received = startSize;
  let destroyed = false;
  let unknownStartTs = 0;

  await new Promise((resolve, reject) => {
    const makeHeaders = () => {
      const headers = { 'User-Agent': 'SWS-Installer/1.0' };
      if (startSize > 0 && total > 0) {
        headers.Range = `bytes=${startSize}-`;
        if (etag) headers['If-Range'] = etag; else if (lastModified) headers['If-Range'] = lastModified;
      }
      return headers;
    };

    let currentReq = null;
    let currentWs = null;
    const doGet = (u, redirectsLeft = 5) => {
      const req = lib.get(u, { headers: makeHeaders() }, res => {
        const status = res.statusCode || 0;
        const headers = res.headers || {};
        if (status >= 300 && status < 400 && headers.location) {
          if (redirectsLeft <= 0) {
            res.resume();
            return reject(new Error('GET too many redirects'));
          }
          const next = new URL(headers.location, u).toString();
          res.resume();
          return doGet(next, redirectsLeft - 1);
        }
        if (status === 416) { // Range not satisfiable, restart
          try { fs.unlinkSync(partPath); fs.unlinkSync(metaPath); } catch {}
          return reject(new Error('Range not satisfiable'));
        }
        if (status !== 200 && status !== 206) {
          return reject(new Error(`HTTP ${status}`));
        }
        // If server ignored range (200) and we had partial data, restart from scratch
        const append = (status === 206 && startSize > 0);
        const ws = fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' });
        currentWs = ws;
        let settled = false;
        const settle = (fn) => { if (!settled) { settled = true; fn(); } };
        ws.on('error', err => {
          try { console.error('[DOWNLOAD:ws-error]', err?.message || err); } catch {}
          debugLog('ERROR', 'Download write-stream error', { file: path.basename(relPath), error: err?.message || String(err) });
          try { res.destroy(); } catch {}
          settle(() => reject(err));
        });
        let lastDataTs = Date.now();
        const stallTimer = setInterval(() => {
          if (Date.now() - lastDataTs > 60000) {
            try { console.error('[DOWNLOAD:stall] No data received for 60s, aborting'); } catch {}
            debugLog('ERROR', 'Download stalled — no data for 60s', { file: path.basename(relPath), received, total });
            clearInterval(stallTimer);
            try { req.destroy(new Error('Download stalled — no data for 60 seconds')); } catch {}
          }
        }, 10000);
        res.on('data', chunk => {
          lastDataTs = Date.now();
          const ok = ws.write(chunk);
          received += chunk.length;
          if (!ok) res.pause();
          let pct;
          if (total > 0) {
            pct = Math.max(0, Math.min(100, Math.round((received / total) * 100)));
          } else {
            // Unknown total: show a smooth increasing progress up to 95%
            if (!unknownStartTs) unknownStartTs = Date.now();
            const dt = (Date.now() - unknownStartTs) / 1000; // seconds
            // 5% + 3% per second, capped at 95%
            pct = Math.max(5, Math.min(95, Math.round(5 + dt * 3)));
          }
          sendProgress(pct, received);
        });
        ws.on('drain', () => res.resume());
        res.on('end', () => {
          clearInterval(stallTimer);
          // If total was unknown, push a near-complete update so UI doesn’t sit at low percent
          if (total <= 0) {
            try { sendProgress(99, received); } catch {}
          }
          ws.end(() => settle(() => resolve()));
        });
        res.on('error', err => {
          clearInterval(stallTimer);
          ws.destroy();
          settle(() => reject(err));
        });
      });
      currentReq = req;
      activeDownloadMap.set(context, { abort: () => { destroyed = true; try { currentReq && currentReq.destroy(new Error('Canceled')); } catch {} try { currentWs && currentWs.destroy(); } catch {} } });
      req.on('error', err => { try { clearInterval(stallTimer); } catch {} reject(err); });
      req.setTimeout(300000, () => req.destroy(new Error('Download timeout')));
    };

    doGet(url, 5);
  }).finally(() => activeDownloadMap.delete(context));

  if (destroyed) throw new Error('Canceled');

  // Finalize: if encryptAtRest, stream-encrypt and inject tag
  if (encryptAtRest) {
    const key = await getOrCreateEncKey();
    if (!key) throw new Error('Encryption key unavailable');
    const iv = crypto.randomBytes(12);
    await new Promise((resolve, reject) => {
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const out = fs.createWriteStream(finalPath);
      out.on('error', reject);
      // Write header: 'SWS1' + iv + placeholder tag(16 zero bytes)
      const header = Buffer.concat([Buffer.from('SWS1'), iv, Buffer.alloc(16, 0)]);
      out.write(header);
      const rs = fs.createReadStream(partPath);
      rs.pipe(cipher).pipe(out, { end: false });
      rs.on('error', reject);
      cipher.on('error', reject);
      cipher.on('end', async () => {
        try {
          const tag = cipher.getAuthTag();
          // Patch tag into header position (offset 4+12)
          const fh = await fs.promises.open(finalPath, 'r+');
          await fh.write(tag, 0, tag.length, 16);
          await fh.close();
          out.end(() => resolve());
        } catch (e) { reject(e); }
      });
    });
    try { await fs.promises.unlink(partPath); } catch {}
    try { await fs.promises.unlink(metaPath); } catch {}
  } else {
    await fs.promises.rename(partPath, finalPath).catch(async () => {
      // if cross-device or in-use, fallback to copy
      await fs.promises.copyFile(partPath, finalPath);
      await fs.promises.unlink(partPath).catch(() => {});
    });
    try { await fs.promises.unlink(metaPath); } catch {}
  }

  try { console.log('[DOWNLOAD:complete] ' + JSON.stringify({ relPath, finalPath })); } catch {}
  debugLog('INFO', 'Download completed', { file: path.basename(relPath) });

  return { success: true, fullPath: finalPath };
}

// Expand zip via PowerShell
function expandZipWithPowershell(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const cmd = 'powershell.exe';
    const psZip = String(zipPath || '').replace(/'/g, "''");
    const psDst = String(destDir || '').replace(/'/g, "''");
    const args = [
      '-NoLogo',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      // Use -LiteralPath to avoid wildcard expansion; include -Force to overwrite
      `try { Expand-Archive -LiteralPath '${psZip}' -DestinationPath '${psDst}' -Force; exit 0 } catch { Write-Error $_; exit 2 }`
    ];
    const child = spawn(cmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    if (child.stdout) child.stdout.on('data', b => { try { out += String(b); } catch {} });
    if (child.stderr) child.stderr.on('data', b => { try { err += String(b); } catch {} });
    child.on('error', e => {
      reject(e);
    });
    child.on('exit', code => {
      if (code === 0) return resolve();
      const msg = `Expand-Archive exited ${code}${err ? `: ${err.trim().slice(0, 500)}` : ''}`;
      reject(new Error(msg));
    });
  });
}

// Try to use 7-Zip for extraction with real progress
let _sevenZipPath = null;
function getSevenZipPath() {
  if (_sevenZipPath) return _sevenZipPath;
  try {
    const sevenBin = require('7zip-bin');
    _sevenZipPath = sevenBin.path7z || sevenBin.path7za || null;
  } catch {}
  return _sevenZipPath;
}

function expandZipWith7zip(zipPath, destDir, onProgress) {
  return new Promise((resolve, reject) => {
    const seven = getSevenZipPath();
    if (!seven) return reject(new Error('7-Zip not available'));
    try {
      const { spawn } = require('child_process');
      // x: extract with full paths; -y: assume Yes to all prompts; -bsp1: progress to stdout; -bb0 minimal logs
      // IMPORTANT: 7z requires -o immediately followed by the path; quote it to preserve spaces.
      const outArg = `-o"${destDir}"`;
      const args = ['x', String(zipPath), outArg, '-y', '-bsp1', '-bb0'];
      const child = spawn(seven, args, { windowsHide: true });
      const rePct = /(\d{1,3})%/;
      let last = -1;
      let err = '';
      const handle = (buf) => {
        const s = String(buf || '');
        const m = s.match(rePct);
        if (m) {
          const pct = Math.max(0, Math.min(100, parseInt(m[1], 10)));
          if (pct !== last) { last = pct; try { onProgress && onProgress(pct); } catch {} }
        }
      };
      if (child.stdout) child.stdout.on('data', handle);
      if (child.stderr) child.stderr.on('data', b => { try { err += String(b); } catch {} handle(b); });
      child.on('error', reject);
      child.on('exit', code => {
        // 0 = no errors; 1 = non-fatal warnings (treat as success); others are errors
        if (code === 0 || code === 1) return resolve();
        const msg = `7-Zip exited ${code}${err ? `: ${err.trim().slice(0, 500)}` : ''}`;
        reject(new Error(msg));
      });
    } catch (err) { reject(err); }
  });
}

function sendInstallProgress(payload) {
  try {
    const targets = BrowserWindow.getAllWindows();
    for (const w of targets) w.webContents.send('install-progress', payload);
  } catch {}
}

// Lightweight text fetcher with redirects and timeout. Used for manifest/version files via IPC.
async function fetchTextWithRedirects(url, { timeoutMs = 15000, maxRedirects = 5, method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    let settled = false;
    const seen = new Set();
    const doRequest = (u, redirectsLeft) => {
      if (settled) return;
      if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
      try { const key = new URL(u).toString(); if (seen.has(key)) return reject(new Error('Redirect loop')); seen.add(key); } catch {}
      const parsed = new URL(u);
      const reqHeaders = { 'User-Agent': 'SWS-Installer/1.0', ...headers };
      if (body && !reqHeaders['Content-Length'] && !reqHeaders['content-length']) {
        reqHeaders['Content-Length'] = Buffer.byteLength(body);
      }
      const reqOpts = { method: method.toUpperCase(), hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, headers: reqHeaders };
      const req = lib.request(reqOpts, res => {
        const status = res.statusCode || 0;
        const headers = res.headers || {};
        if (status >= 300 && status < 400 && headers.location) {
          const next = new URL(headers.location, u).toString();
          res.resume();
          return doRequest(next, redirectsLeft - 1);
        }
        const ok = status >= 200 && status < 300;
        const chunks = [];
        let total = 0;
        res.on('data', c => {
          // Cap to ~1.5MB to avoid excessive memory use on misconfigured endpoints
          if (total < 1_500_000) { chunks.push(c); total += c.length; }
        });
        res.on('end', () => {
          if (settled) return; settled = true;
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          resolve({ ok, status, headers, text });
        });
        res.on('error', err => { if (settled) return; settled = true; reject(err); });
      });
      req.on('error', err => { if (settled) return; settled = true; reject(err); });
      req.setTimeout(timeoutMs, () => { try { req.destroy(new Error('Fetch timeout')); } catch {}; if (!settled) { settled = true; reject(new Error('Fetch timeout')); } });
      if (body) { req.write(body); }
      req.end();
    };
    doRequest(url, maxRedirects);
  });
}

// --- Encryption helpers (AES-256-GCM; key stored in OS keychain via keytar) ---
const ENC_SERVICE = 'SWS-Installer-EncKey';
async function getOrCreateEncKey(account = 'default') {
  if (!keytar) return null;
  try {
    let k = await keytar.getPassword(ENC_SERVICE, account);
    if (!k) {
      const raw = crypto.randomBytes(32); // 256-bit
      k = raw.toString('base64');
      await keytar.setPassword(ENC_SERVICE, account, k);
    }
    return Buffer.from(k, 'base64');
  } catch { return null; }
}

function encryptBufferGCM(buf, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  // header: 'SWS1' + iv(12) + tag(16) + ct
  return Buffer.concat([Buffer.from('SWS1'), iv, tag, ct]);
}

function isEncryptedFileHeader(hdr) {
  return hdr && hdr.length >= 4 && hdr.slice(0,4).toString('utf8') === 'SWS1';
}

async function decryptFileToTemp(absEncPath) {
  // returns plaintext temp zip path, caller should delete it when done
  const data = await fs.promises.readFile(absEncPath);
  if (!isEncryptedFileHeader(data)) throw new Error('Not an encrypted file');
  const iv = data.slice(4, 16);
  const tag = data.slice(16, 32);
  const ct = data.slice(32);
  const key = await getOrCreateEncKey();
  if (!key) throw new Error('Encryption key unavailable');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  const tmpDir = path.join(app.getPath('userData'), 'tmp');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const tmpZip = path.join(tmpDir, path.basename(absEncPath).replace(/\.enc$/i, '') || `tmp-${Date.now()}.zip`);
  await fs.promises.writeFile(tmpZip, pt);
  return tmpZip;
}

// IPC
ipcMain.handle('get-default-install-path', async () => detectFS2020());
ipcMain.handle('get-default-install-path-2024', async () => detectFS2024());

// Persisted install paths (stored in settings.json alongside downloadsDir/pkgCacheDir)
ipcMain.handle('settings:get-install-path-2020', async () => {
  try { return String(readSettings().installPath2020 || '').trim(); } catch { return ''; }
});
ipcMain.handle('settings:get-install-path-2024', async () => {
  try { return String(readSettings().installPath2024 || '').trim(); } catch { return ''; }
});
ipcMain.handle('settings:set-install-path-2020', async (_e, newPath) => {
  try {
    const p = String(newPath || '').trim();
    debugLog('INFO', 'Install path changed', { sim: 'FS2020', path: p });
    writeSettings({ installPath2020: p });
    return { success: true, path: p };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});
ipcMain.handle('settings:set-install-path-2024', async (_e, newPath) => {
  try {
    const p = String(newPath || '').trim();
    debugLog('INFO', 'Install path changed', { sim: 'FS2024', path: p });
    writeSettings({ installPath2024: p });
    return { success: true, path: p };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});

// Debug logging toggle
ipcMain.handle('settings:get-debug-logging', async () => {
  try {
    const s = readSettings();
    return { success: true, enabled: !!s.debugLogging, logsDir: LOGS_DIR };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});
ipcMain.handle('settings:set-debug-logging', async (_e, enabled) => {
  try {
    const val = !!enabled;
    writeSettings({ debugLogging: val });
    setDebugLogging(val);
    debugLog('INFO', val ? 'Debug logging enabled by user' : 'Debug logging disabled by user');
    return { success: true, enabled: val, logsDir: LOGS_DIR };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});
ipcMain.handle('settings:get-logs-dir', async () => {
  return { success: true, logsDir: LOGS_DIR };
});

// Download a URL into the configured downloads directory with resume and optional encryption
ipcMain.handle('downloads:fetch-url', async (event, { url, relPath, encryptAtRest = false, context = '' }) => {
  try {
    const res = await downloadToDownloadsWithResume(event, { url, relPath, encryptAtRest, context });
    return res;
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
});

// Cancel an in-flight download by context token
ipcMain.handle('downloads:cancel', async (_e, context) => {
  try { activeDownloadMap.get(context)?.abort(); return { success: true }; } catch (e) { return { success: false, error: e?.message || String(e) }; }
});

// Secure token storage (uses OS keychain via keytar)
const SERVICE = 'SWS-Installer';
ipcMain.handle('auth:get-token', async (_e, account = 'default') => {
  try {
    if (!keytar) return '';
    const token = await keytar.getPassword(SERVICE, account);
    return token || '';
  } catch { return ''; }
});
ipcMain.handle('auth:set-token', async (_e, { account = 'default', token = '' } = {}) => {
  try {
    if (!keytar) return { success: false, error: 'Keytar not available' };
    if (!token) {
      await keytar.deletePassword(SERVICE, account);
      return { success: true };
    }
    await keytar.setPassword(SERVICE, account, token);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});
ipcMain.handle('auth:clear-token', async (_e, account = 'default') => {
  try {
    if (!keytar) return { success: false, error: 'Keytar not available' };
    await keytar.deletePassword(SERVICE, account);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('dialog:openDirectory', async (_e, defaultPath) => {
  const opts = { properties: ['openDirectory'] };
  if (defaultPath) {
    const dp = String(defaultPath).trim();
    try { const st = await fs.promises.stat(dp); if (st.isDirectory()) opts.defaultPath = dp; } catch {}
  }
  const res = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), opts);
  return res.canceled ? '' : (res.filePaths[0] || '');
});

// Minimal fs.stat bridge for renderer path checks
ipcMain.handle('fs:stat', async (_e, absPath) => {
  try {
    const p = String(absPath || '').trim();
    if (!p) throw new Error('No path');
    const st = await fs.promises.stat(p);
    return { success: true, size: st.size || 0, isFile: st.isFile(), isDirectory: st.isDirectory(), mtimeMs: st.mtimeMs || 0 };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

// Create a directory (and parents) if it doesn't exist
ipcMain.handle('fs:mkdirp', async (_e, absPath) => {
  try {
    const p = String(absPath || '').trim();
    if (!p) throw new Error('No path');
    await fs.promises.mkdir(p, { recursive: true });
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st || !st.isDirectory()) throw new Error('Failed to create directory');
    return { success: true, created: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

async function saveFileImpl({ relPath, buffer, encrypt = false }) {
  const base = app.getPath('userData');
  let target = path.resolve(base, String(relPath || 'downloads/file.zip'));
  await ensureDir(path.dirname(target));
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer?.buffer || buffer || []);
  if (encrypt) {
    const key = await getOrCreateEncKey();
    if (!key) throw new Error('Encryption unavailable');
    const enc = encryptBufferGCM(data, key);
    if (!/\.enc$/i.test(target)) target = `${target}.enc`;
    await fs.promises.writeFile(target, enc);
    return target;
  } else {
    await fs.promises.writeFile(target, data);
    return target;
  }
}

// Save into configured downloads directory (relative path inside that directory)
async function saveDownloadImpl({ relPath, buffer, encrypt = false }) {
  const base = getDownloadsBaseDir();
  await ensureDir(base);
  let target = path.resolve(base, String(relPath || 'file.zip'));
  await ensureDir(path.dirname(target));
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer?.buffer || buffer || []);
  if (encrypt) {
    const key = await getOrCreateEncKey();
    if (!key) throw new Error('Encryption unavailable');
    const enc = encryptBufferGCM(data, key);
    if (!/\.enc$/i.test(target)) target = `${target}.enc`;
    await fs.promises.writeFile(target, enc);
    return target;
  } else {
    await fs.promises.writeFile(target, data);
    return target;
  }
}

ipcMain.handle('save-file', async (_e, { relPath, buffer, encrypt = false }) => {
  try { return await saveFileImpl({ relPath, buffer, encrypt }); }
  catch (err) { return { error: err.message || String(err) }; }
});

// Extended save with explicit options (preferred)
ipcMain.handle('save-file-ex', async (_e, { relPath, buffer, encrypt = false }) => {
  try { return await saveFileImpl({ relPath, buffer, encrypt }); }
  catch (err) { return { error: err.message || String(err) }; }
});

// Save a file under the configured downloads directory
ipcMain.handle('downloads:save', async (_e, { relPath, buffer, encrypt = false }) => {
  try { return await saveDownloadImpl({ relPath, buffer, encrypt }); }
  catch (err) { return { error: err.message || String(err) }; }
});

// Fetch small text/JSON resources (e.g., manifest.json) via main, bypassing renderer CORS
ipcMain.handle('net:fetch-text', async (_e, { url, timeoutMs = 15000, method, headers, body } = {}) => {
  try {
    const opts = { timeoutMs };
    if (method) opts.method = method;
    if (headers) opts.headers = headers;
    if (body) opts.body = body;
    const res = await fetchTextWithRedirects(String(url || ''), opts);
    // Normalize headers keys to simple lower-case map for renderer convenience
    const headersNorm = {};
    try {
      for (const [k, v] of Object.entries(res.headers || {})) {
        headersNorm[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v || '');
      }
    } catch {}
    return { ok: !!res.ok, status: res.status || 0, headers: headersNorm, text: res.text || '' };
  } catch (err) {
    return { ok: false, status: 0, headers: {}, text: '', error: err?.message || String(err) };
  }
});

// HEAD/meta fetch via main for ZIP signature checks
ipcMain.handle('net:head', async (_e, { url } = {}) => {
  try {
    const u = String(url || '');
    let info = null;
    try { info = await headRequest(u); } catch {}
    if (!info || info.statusCode >= 400 || (!info.contentLength && !info.etag && !info.lastModified)) {
      try { info = await rangeMetaRequest(u); } catch {}
    }
    if (!info) return { ok: false, status: 0, etag: '', lastModified: '', contentLength: 0 };
    return {
      ok: info.statusCode >= 200 && info.statusCode < 300,
      status: info.statusCode || 0,
      etag: info.etag || '',
      lastModified: info.lastModified || '',
      contentLength: Number(info.contentLength || 0) || 0
    };
  } catch (err) {
    return { ok: false, status: 0, etag: '', lastModified: '', contentLength: 0, error: err?.message || String(err) };
  }
});

// Clear extracted packages cache
ipcMain.handle('clear-pkg-cache', async () => {
  try {
  const dir = getPkgCacheDir();
    await fs.promises.rm(dir, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('list-aircraft', async (_e, communityPath) => {
  try {
    const base = String(communityPath || '').trim();
    if (!base) return [];
    debugLog('DEBUG', 'Scanning Community folder', { path: base });
    const entries = await fs.promises.readdir(base, { withFileTypes: true });
    // Include real directories and directory symlinks (junctions)
    const dirNames = [];
    for (const d of entries) {
      try {
        if (d.isDirectory()) {
          dirNames.push(d.name);
          continue;
        }
        if (typeof d.isSymbolicLink === 'function' && d.isSymbolicLink()) {
          const full = path.join(base, d.name);
          const st = await fs.promises.stat(full).catch(() => null); // follows link
          if (st && st.isDirectory()) dirNames.push(d.name);
        }
      } catch {}
    }
    const results = await Promise.all(dirNames.map(async folder => {
      const pkgDir = path.join(base, folder);
      let version = '';
      let packageName = '';
      let title = '';
      try {
        // Resolve real path in case of junctions
        const realPkgDir = await fs.promises.realpath(pkgDir).catch(() => pkgDir);
        const manifestPath = path.join(realPkgDir, 'manifest.json');
        const txt = await fs.promises.readFile(manifestPath, 'utf8');
        const j = JSON.parse(txt);
        version = String(j.package_version || j.version || '');
        packageName = String(j.package_name || j.packageName || j.name || '');
        title = String(j.title || j.package_title || '');
      } catch {}
      if (!version) {
        try { version = await readPackageManifestVersion(pkgDir); } catch {}
      }
      return {
        folder,
        name: folder,
        version,
        packageName,
        title,
        communityPath: base // IMPORTANT: used by renderer to detect per-sim installs
      };
    }));
    return results;
  } catch {
    return [];
  }
});

ipcMain.handle('uninstall-aircraft', async (_e, opts = {}) => {
  try {
    debugLog('INFO', 'Uninstall started', { packagePath: opts.packagePath, installPath: opts.installPath, folder: opts.folder, name: opts.name });
    const pkg = String(opts.packagePath || '').trim();
    if (pkg) {
      const st = await fs.promises.lstat(pkg).catch(() => null);
      if (!st) {
        // Treat missing path as benign no-op; surfaces as informational in renderer
        return { success: false, error: 'Path not found' };
      }
      if (st.isSymbolicLink()) {
        await fs.promises.unlink(pkg);
      } else if (st.isDirectory()) {
        // Remove directory (non-link). This may be a real copy from older installs.
        await fs.promises.rm(pkg, { recursive: true, force: true });
      } else {
        await fs.promises.rm(pkg, { force: true });
      }
      return { success: true };
    }

    const installPath = String(opts.installPath || '').trim();
    const folder = String(opts.folder || '').trim();
    const name = String(opts.name || '').trim();

    if (!installPath) throw new Error('Missing installPath');

    // If folder provided, remove that specific folder
    if (folder) {
      const target = path.join(installPath, folder);
      const st = await fs.promises.lstat(target).catch(() => null);
      if (!st) throw new Error('Folder not found: ' + folder);
      if (st.isSymbolicLink()) {
        await fs.promises.unlink(target);
      } else if (st.isDirectory()) {
        await fs.promises.rm(target, { recursive: true, force: true });
      } else {
        await fs.promises.rm(target, { force: true });
      }
      return { success: true };
    }

    // If name provided, try best-match in installPath
    if (name) {
      const simple = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const key = simple(name);
      const entries = await fs.promises.readdir(installPath, { withFileTypes: true });
      const dirs = entries.filter(d => d.isDirectory()).map(d => d.name);
      // Prefer sws-* folders that include the key
      const candidates = dirs
        .map(d => ({ folder: d, s: simple(d) }))
        .sort((a, b) => b.s.length - a.s.length);

      const hit = candidates.find(x => x.s.includes(key)) ||
                  candidates.find(x => x.s.startsWith('sws')) ||
                  null;

      if (!hit) throw new Error('No matching package folder in Community');
      const target = path.join(installPath, hit.folder);
      const st = await fs.promises.lstat(target).catch(() => null);
      if (st?.isSymbolicLink()) {
        await fs.promises.unlink(target);
      } else if (st?.isDirectory()) {
        await fs.promises.rm(target, { recursive: true, force: true });
      } else if (st) {
        await fs.promises.rm(target, { force: true });
      }
      return { success: true, removed: hit.folder };
    }

    throw new Error('No path provided');
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('install-aircraft', async (_e, opts = {}) => {
  try {
    let zip = String(opts.aircraftZipPath || '').trim();
    const dest = String(opts.installPath || '').trim();
  // Default to junctions (not self-contained copies). If caller sets preferCopy, honor it; otherwise use false.
  let preferCopy = (opts.preferCopy !== undefined) ? !!opts.preferCopy : false; // when true, copy extracted files instead of junctions
    if (!zip) throw new Error('Missing aircraftZipPath');
    if (!dest) throw new Error('Missing installPath');

    debugLog('INFO', 'Install started', { zip: path.basename(zip), dest, preferCopy, sim: opts.simTag, channel: opts.channel, baseFolder: opts.baseFolder });

  // Prefer junctions; if symlink creation fails during linking we fallback to copy.

  // Preparing phase (0-14)
  sendInstallProgress({ progress: 5, status: 'Preparing', phase: 'preparing' });
    await ensureDir(dest);
    // Quick writability test for destination Community path to surface permission issues early
    try {
      const testPath = path.join(dest, `.sws-write-test-${Date.now()}.tmp`);
      await fs.promises.writeFile(testPath, 'ok');
      await fs.promises.rm(testPath, { force: true });
    } catch (e) {
      throw new Error(`Install path is not writable: ${dest}. Please choose your Community folder or check permissions. (${e?.message || e})`);
    }

    // Compute a stable, collision-free cache folder for extracted contents
    // Key by product base folder, sim (FS2020/FS2024), channel (Public/Beta), and zip base
    const rawZipName = path.basename(String(opts.aircraftZipPath || ''));
    const zipBase = rawZipName.replace(/\.enc$/i, '').replace(/\.zip$/i, '').trim() || `pkg-${Date.now()}`;
    const norm = (s) => String(s || '').trim().replace(/[^a-z0-9._-]+/gi, '-');
    const baseFolder = norm(opts.baseFolder || 'pkg');
    const simTag = /^FS2024$/i.test(String(opts.simTag||'')) ? 'FS2024' : (/^FS2020$/i.test(String(opts.simTag||'')) ? 'FS2020' : 'FS');
    const channel = (/^beta$/i.test(String(opts.channel||'')) ? 'Beta' : 'Public');
    const cacheRoot = getPkgCacheDir();
    // Prefer a Bunny-mirrored cache path when the zip resides under the configured downloads dir
    let extractDir;
    try {
      const dlRoot = getDownloadsBaseDir();
      const rel = path.relative(dlRoot, zip);
      const inside = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
      if (inside) {
        // rel should look like: 2020/Public/<BUNNY_FOLDER>/file.zip(.enc)
        const parts = rel.split(/[/\\]+/).filter(Boolean);
        if (parts.length >= 3) {
          const folderParts = parts.slice(0, parts.length - 1); // drop file
          extractDir = path.join(cacheRoot, ...folderParts, zipBase);
        }
      }
    } catch {}
    if (!extractDir) {
      // Fallback to sim+channel-safe layout
      extractDir = path.join(cacheRoot, baseFolder, simTag, channel, zipBase);
    }

  // Extracting phase start (15)
  debugLog('INFO', 'Extraction starting', { zip: path.basename(zip) });
  sendInstallProgress({ progress: 15, status: 'Extracting', phase: 'extract' });
  try { sendInstallProgress({ status: `Using cache: ${extractDir}`, phase: 'extract' }); } catch {}
  // If an extracted cache already exists and appears valid (contains a package manifest), reuse it
  let reuseExtract = false;
  try {
    const st = await fs.promises.stat(extractDir).catch(() => null);
    if (st && st.isDirectory()) {
      // Invalidate cache if the ZIP file is newer than the cached extraction directory.
      // This prevents reusing stale extractions after a new version is downloaded with the same filename.
      // Use birthtimeMs (file creation time on disk) because mtimeMs can be set from
      // the server's Last-Modified header, making a freshly downloaded file appear older.
      const zipStat = await fs.promises.stat(zip).catch(() => null);
      const zipDiskTime = Math.max(zipStat?.birthtimeMs || 0, zipStat?.mtimeMs || 0);
      const zipNewerThanCache = zipStat && st && zipDiskTime > st.mtimeMs;
      // Also invalidate if the ZIP file size changed (different content with same filename)
      let zipSizeChanged = false;
      try {
        const sizeFile = path.join(extractDir, '.sws-zip-size');
        const savedSize = await fs.promises.readFile(sizeFile, 'utf8').catch(() => '');
        if (savedSize && zipStat && String(zipStat.size) !== savedSize.trim()) {
          zipSizeChanged = true;
        }
      } catch {}
      if (zipNewerThanCache || zipSizeChanged) {
        // ZIP is newer or different size — force re-extraction
        reuseExtract = false;
      } else {
        const ents = await fs.promises.readdir(extractDir, { withFileTypes: true }).catch(() => []);
        for (const d of ents) {
          if (!d.isDirectory()) continue;
          const pkg1 = path.join(extractDir, d.name, 'manifest.json');
          const ok1 = await fs.promises.stat(pkg1).then(() => true).catch(() => false);
          if (ok1) { reuseExtract = true; break; }
          const innerEnts = await fs.promises.readdir(path.join(extractDir, d.name), { withFileTypes: true }).catch(() => []);
          const onlyDir = innerEnts.filter(e => e.isDirectory());
          if (onlyDir.length === 1) {
            const pkg2 = path.join(extractDir, d.name, onlyDir[0].name, 'manifest.json');
            const ok2 = await fs.promises.stat(pkg2).then(() => true).catch(() => false);
            if (ok2) { reuseExtract = true; break; }
          }
        }
      }
    }
  } catch {}

  if (!reuseExtract) {
    // Decrypt to temp if encrypted
    let tempToDelete = '';
    try {
      const hdr = await fs.promises.readFile(zip, { encoding: null }).then(b => b.slice(0,4)).catch(() => null);
      if (/\.enc$/i.test(zip) || isEncryptedFileHeader(hdr)) {
        const tmpZip = await decryptFileToTemp(zip);
        tempToDelete = tmpZip;
        zip = tmpZip;
      }
    } catch {}
    // Ensure a clean extract destination in cache
    await fs.promises.rm(extractDir, { recursive: true, force: true }).catch(() => {});
    await ensureDir(extractDir);
    // Prefer 7-Zip with real progress; fallback to PowerShell
    const seven = getSevenZipPath();
    if (seven) {
      sendInstallProgress({ progress: 15, status: 'Extracting', phase: 'extract' });
      try {
        await expandZipWith7zip(zip, extractDir, (pct) => {
          // Map extractor 0..100 into overall 15..86 to leave headroom for linking
          const mapped = 15 + Math.floor((pct / 100) * 71); // 15..86
          sendInstallProgress({ progress: mapped, status: 'Extracting', phase: 'extract' });
        });
        // End extract phase near 86%
        sendInstallProgress({ progress: 86, status: 'Extracting', phase: 'extract' });
      } catch (err) {
        // Fallback to PowerShell on failure; then AdmZip as last resort
        const startExtractTs = Date.now();
        const extractTick = setInterval(() => {
          const dt = Date.now() - startExtractTs;
          const p = Math.min(44, 15 + Math.floor(dt / 1500));
          sendInstallProgress({ progress: p, status: 'Extracting', phase: 'extract' });
        }, 900);
        try {
          try {
            await expandZipWithPowershell(zip, extractDir);
          } catch (psErr) {
            // Final fallback: in-process AdmZip (if available)
            if (AdmZip) {
              try {
                const z = new AdmZip(zip);
                z.extractAllTo(extractDir, true);
              } catch (admErr) {
                throw psErr; // bubble original PS error for clearer message
              }
            } else {
              throw psErr;
            }
          }
        } finally {
          clearInterval(extractTick);
          sendInstallProgress({ progress: 44, status: 'Extracting', phase: 'extract' });
        }
      }
    } else {
      // No 7-Zip available; keep existing PowerShell behavior
      const startExtractTs = Date.now();
      const extractTick = setInterval(() => {
        const dt = Date.now() - startExtractTs;
        const p = Math.min(44, 15 + Math.floor(dt / 1500));
        sendInstallProgress({ progress: p, status: 'Extracting', phase: 'extract' });
      }, 900);
      try {
        try {
          await expandZipWithPowershell(zip, extractDir);
        } catch (psErr) {
          // Final fallback: in-process AdmZip (if available)
          if (AdmZip) {
            try {
              const z = new AdmZip(zip);
              z.extractAllTo(extractDir, true);
            } catch (admErr) {
              throw psErr;
            }
          } else {
            throw psErr;
          }
        }
      } finally {
        clearInterval(extractTick);
        sendInstallProgress({ progress: 44, status: 'Extracting', phase: 'extract' });
      }
    }
    try { if (tempToDelete) await fs.promises.rm(tempToDelete, { force: true }); } catch {}
    // Save ZIP file size so future installs can detect content changes even when mtime is unreliable
    try { const _zs = await fs.promises.stat(zip).catch(() => null); if (_zs) await fs.promises.writeFile(path.join(extractDir, '.sws-zip-size'), String(_zs.size)); } catch {}
  } else {
    // Reuse existing extracted cache; jump progress near end of extract phase
    // If 7z is available we align with ~86, else keep old 44
    const seven = getSevenZipPath();
    sendInstallProgress({ progress: seven ? 86 : 44, status: 'Extracting (cached)', phase: 'extract' });
  }

  // Track whether we fell back from junction to copy for any reason
  let linkFallbackUsed = false;

  // Advisory: log if extracted paths are very long (junctions still attempted first)
  try {
    if (!preferCopy) {
      let maxPathLen = 0;
      async function scanMax(dir, depth = 0) {
        if (depth > 6) return;
        let ents;
        try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          const full = path.join(dir, e.name);
          if (full.length > maxPathLen) maxPathLen = full.length;
          if (e.isDirectory()) await scanMax(full, depth + 1);
        }
      }
      await scanMax(extractDir, 0);
      if (maxPathLen > 240) {
        try { sendInstallProgress({ status: `Note: long file paths detected (max ${maxPathLen}). Junction will still be attempted.`, phase: 'extract' }); } catch {}
      }
    }
  } catch {}

  // Linking phase start
    const startLink = getSevenZipPath() ? 87 : 45;
    sendInstallProgress({ progress: startLink, status: 'Linking', phase: 'link' });
  // Create directory junctions for each top-level folder extracted
    const entries = await fs.promises.readdir(extractDir, { withFileTypes: true });
  let topDirs = entries.filter(d => d.isDirectory()).map(d => d.name);
    // If caller provided expectedFolders, filter to those matches to avoid linking unintended artifacts (e.g., stray 'blanik' test folder)
    try {
      const expectedRaw = Array.isArray(opts.expectedFolders) ? opts.expectedFolders : [];
      const norm = s => String(s || '').trim().toLowerCase();
      const expected = expectedRaw.map(norm).filter(Boolean);
      if (expected.length) {
        const scoreMatch = (dir) => {
          const nd = norm(dir);
            // exact match highest, contains or contained medium
          for (const e of expected) {
            if (nd === norm(e)) return 3;
            if (nd.includes(e) || e.includes(nd)) return 2;
          }
          return 0;
        };
        const filtered = topDirs.filter(d => scoreMatch(d) > 0);
        if (filtered.length) {
          // Keep ordering by score desc then name to ensure base folder first
          topDirs = filtered.sort((a,b) => scoreMatch(b) - scoreMatch(a) || a.localeCompare(b));
        }
      }
    } catch {}
  if (!topDirs.length) {
      // Some zips may directly contain files in a single folder layer; handle as best as possible
  // Create a folder named after the zip base and link that
  const synthDir = zipBase;
      await ensureDir(path.join(extractDir, synthDir));
      // Move all current entries into the synthDir
      const moveEntries = await fs.promises.readdir(extractDir, { withFileTypes: true });
      for (const m of moveEntries) {
        if (m.name === synthDir) continue;
        const src = path.join(extractDir, m.name);
        const dst = path.join(extractDir, synthDir, m.name);
        await fs.promises.rename(src, dst).catch(async () => {
          // Fallback to copy if rename across devices fails
          await fs.promises.cp(src, dst, { recursive: true });
          await fs.promises.rm(src, { recursive: true, force: true });
        });
      }
      topDirs.push(synthDir);
    }

  // For each extracted package directory, create a junction in the Community path (or copy if preferCopy)
    const installedFolders = [];
    for (const dir of topDirs) {
      let target = path.join(extractDir, dir);
      let linkName = dir; // may change if we collapse wrapper

      // COLLAPSE WRAPPER (recursive up to depth 4): Follow single-folder wrappers and prefer a directory with BOTH manifest.json and layout.json
      try {
        const hasManifestAt = async (p) => await fs.promises.stat(path.join(p, 'manifest.json')).then(()=>true).catch(()=>false);
        const hasLayoutAt = async (p) => await fs.promises.stat(path.join(p, 'layout.json')).then(()=>true).catch(()=>false);
        let current = target;
        let best = { p: current, score: 0 };
        async function score(p) {
          const m = await hasManifestAt(p);
          const l = await hasLayoutAt(p);
          // Prefer both files present
          return (m ? 1 : 0) + (l ? 2 : 0);
        }
        best.score = await score(current);
        for (let depth = 0; depth < 4; depth++) {
          const sc = await score(current);
          if (sc >= 3) { // both present
            best = { p: current, score: sc };
            break;
          }
          const ents = await fs.promises.readdir(current, { withFileTypes: true }).catch(()=>[]);
          const subDirs = ents.filter(e => e.isDirectory()).map(e => e.name);
          if (subDirs.length !== 1) break;
          const next = path.join(current, subDirs[0]);
          // advance into the single subdir
          current = next;
          const scNext = await score(current);
          if (scNext > best.score) best = { p: current, score: scNext };
        }
        // Choose best scored directory (both>layout-only>manifest-only)
        const chosen = best && best.p ? best.p : current;
        if (await hasManifestAt(chosen) || await hasLayoutAt(chosen)) {
          target = chosen;
          linkName = path.basename(chosen);
        }
      } catch {}

      // Ensure the final target has a manifest; if not, skip linking this directory
      try {
        const hasManifestFinal = await fs.promises.stat(path.join(target, 'manifest.json')).then(()=>true).catch(()=>false);
        if (!hasManifestFinal) {
          // Informative skip so users see why nothing links
          try { sendInstallProgress({ status: `Skipping '${linkName}' (no manifest.json)`, phase: 'link' }); } catch {}
          continue;
        }
      } catch {}

      const linkPath = path.join(dest, linkName);
      // If the link path exists, remove it (symlink/junction or folder)
      try {
        const st = await fs.promises.lstat(linkPath).catch(() => null);
        if (st) {
          if (st.isSymbolicLink()) {
            await fs.promises.unlink(linkPath);
          } else if (st.isDirectory()) {
            await fs.promises.rm(linkPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
          } else {
            await fs.promises.rm(linkPath, { force: true });
          }
          // Verify removal succeeded before attempting junction
          const stillThere = await fs.promises.lstat(linkPath).catch(() => null);
          if (stillThere) {
            // Force retry with a short delay (file locks / antivirus)
            await new Promise(r => setTimeout(r, 500));
            await fs.promises.rm(linkPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
          }
        }
      } catch (rmErr) {
        // If removal fails, note it; symlink will also fail and trigger copy fallback
        try { sendInstallProgress({ status: `Warning: could not remove existing '${linkName}': ${rmErr?.message}`, phase: 'link' }); } catch {}
      }
      // Advisory: warn if paths contain OneDrive (junctions still attempted first)
      try {
        const anyOneDrive = /onedrive/i.test(String(target)) || /onedrive/i.test(String(dest));
        if (anyOneDrive) { try { sendInstallProgress({ status: `Note: OneDrive path detected for '${linkName}'. Junction will still be attempted.`, phase: 'link' }); } catch {} }
      } catch {}
      if (preferCopy) {
        // Copy extracted folder into Community (legacy behavior)
        debugLog('INFO', 'Copying folder to Community', { folder: linkName });
        await fs.promises.cp(target, linkPath, { recursive: true, force: true });
      } else {
        // Create junction (works without admin on Windows). If it fails, fallback to copy.
        try {
          debugLog('INFO', 'Creating junction', { folder: linkName });
          await fs.promises.symlink(target, linkPath, 'junction');
          debugLog('INFO', 'Junction created successfully', { folder: linkName });
        } catch (e) {
          linkFallbackUsed = true;
          debugLog('WARN', 'Junction failed, falling back to copy', { folder: linkName, error: e?.message || String(e) });
          try { sendInstallProgress({ status: `Symlink failed for '${linkName}': ${e?.message || e}. Copying instead.`, phase: 'link' }); } catch {}
          await fs.promises.cp(target, linkPath, { recursive: true, force: true });
        }
      }
      // Verify the link/copy exists and is a directory (stat follows junction)
      try {
        const st2 = await fs.promises.stat(linkPath).catch(() => null);
        if (st2 && st2.isDirectory()) installedFolders.push(linkName);
      } catch {}

      // Increment progress through linking up to ~95
      const idx = topDirs.indexOf(dir);
      const linkRange = Math.max(0, 95 - startLink);
      const stepPct = Math.round(((idx + 1) / Math.max(1, topDirs.length)) * linkRange);
      const prog = startLink + Math.min(linkRange, stepPct);
      sendInstallProgress({ progress: prog, status: 'Linking', phase: 'link' });
    }

    // If nothing was created in Community, treat as a failure (prevents false "Installed" states)
    if (installedFolders.length === 0) {
      const listed = topDirs && topDirs.length ? ` Examined: ${topDirs.join(', ')}.` : '';
      throw new Error(`Install failed after extraction: no MSFS package (manifest.json) was linked or copied into Community.${listed} Check that the ZIP contains a proper package and that the install path is writable.`);
    }

    // Only remove extracted cache when we installed by copy; for junction installs it must remain.
    if (preferCopy) {
      try { await fs.promises.rm(extractDir, { recursive: true, force: true }); } catch {}
    }

    // Probe version... Strictly prefer among just-installed folders and, if only a panel/mod was installed,
    // attempt to resolve the corresponding base aircraft folder in Community to read its version.
    let version = '';
    try {
      // Use only the folders we just created/linked during this install
      const names = Array.isArray(installedFolders) ? installedFolders.slice() : [];
      const preferredBaseToken = String(baseFolder || '').toLowerCase();
      // Derive probable base folder names from just-installed mod folders (e.g., z-sws-aircraft-pc12-pmsgtn -> sws-aircraft-pc12)
      const stripAffixes = (n) => String(n||'')
        .replace(/^z{1,3}[-_]/i, '')
        .replace(/[-_](pms|pmsgtn|pms50|tds|gtn|gtn750|mod|panel)$/i, '')
        .replace(/[-_](beta|public)$/i, '')
        .trim();
      const baseProjections = Array.from(new Set(names.map(stripAffixes))).filter(Boolean);
      // Try reading version from an existing base folder in Community if present
      for (const baseName of baseProjections) {
        try {
          const baseDir = path.join(dest, baseName);
          const st = await fs.promises.stat(baseDir).catch(() => null);
          if (st && st.isDirectory()) {
            const v = await readPackageManifestVersion(baseDir);
            if (v) { version = v; break; }
          }
        } catch {}
      }
      if (version) {
        // found through base projection, skip further scoring
      } else {
      // Score candidates: strongly prefer the base aircraft folder we expect, and penalize panel/mod folders
      const avoidTokens = ['pms', 'pmsgtn', 'pms50', 'tds', 'gtn', 'gtn750'];
      function scoreName(n) {
        const s = String(n || '').toLowerCase();
        let score = 0;
        if (preferredBaseToken && s.includes(preferredBaseToken)) score += 200; // hard preference for the aircraft base
        if (/aircraft/.test(s)) score += 40; // prefer folders containing 'aircraft'
        if (/^(z|zz|zzz)[-_]/.test(s)) score -= 100; // panel mods last
        if (avoidTokens.some(t => s.includes(t))) score -= 80; // avionics last
        if (/aircraft|scenery/.test(s)) score += 5;
        score += Math.min(20, s.length / 4); // mild preference for more specific names
        return score;
      }
      const ordered = names
        .map(n => ({ n, score: scoreName(n) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.n);
      for (const name of ordered) {
        try {
          const full = path.join(dest, name);
          const v = await readPackageManifestVersion(full);
          if (v) { version = v; break; }
        } catch {}
      }
      // As a last resort, try the just-installed folders without scoring if all failed
      if (!version) {
        for (const name of names) {
          try {
            const full = path.join(dest, name);
            const v = await readPackageManifestVersion(full);
            if (v) { version = v; break; }
          } catch {}
        }
      }
      }
    } catch {}

  // Done
  debugLog('INFO', 'Install completed', { installedFolders, version, linkFallbackUsed, communityPath: dest });
  sendInstallProgress({ progress: 100, status: 'Complete', phase: 'done' });
    return { success: true, version, linkFallbackUsed, installedFolders, communityPath: dest };
  } catch (err) {
  debugLog('ERROR', 'Install failed', { error: err?.message || String(err), stack: err?.stack });
  sendInstallProgress({ progress: 0, status: 'Error', error: err?.message || String(err), phase: 'error' });
    return { success: false, error: err.message || String(err) };
  }
});

// Safely remove only SWS-managed download artifacts from the downloads directory.
// Never rm -rf the root downloads dir itself — the user may have pointed it at a
// folder containing other files.
const SWS_DL_FILE_RE = /\.(zip|zip\.enc|zip\.part|meta\.json|part|enc)$/i;
// SWS downloads are always stored under one of these top-level bucket subdirectories.
// We ONLY touch these known subdirs so that unrelated files/folders in the user's
// chosen downloads folder are never accidentally deleted.
const SWS_DL_BUCKET_DIRS = new Set(['2020', '2024']);

async function safeClearDownloadsDir() {
  const dir = getDownloadsBaseDir();
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return { success: true }; }
  for (const ent of entries) {
    // Only recurse into known SWS bucket subdirectories ('2020', '2024').
    // Root-level files and any other subdirectories are never touched — the user
    // may have stored other content in the same folder.
    if (ent.isDirectory() && SWS_DL_BUCKET_DIRS.has(ent.name)) {
      const full = path.join(dir, ent.name);
      await safeClearSubdir(full);
      // Remove the bucket dir itself if now empty
      try {
        const remaining = await fs.promises.readdir(full);
        if (remaining.length === 0) await fs.promises.rmdir(full);
      } catch {}
    }
  }
  return { success: true };
}
async function safeClearSubdir(dir) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await safeClearSubdir(full);
    } else if (ent.isFile() && SWS_DL_FILE_RE.test(ent.name)) {
      try { await fs.promises.unlink(full); } catch {}
    }
  }
  // Remove the subdirectory only if it's now empty
  try {
    const remaining = await fs.promises.readdir(dir);
    if (remaining.length === 0) await fs.promises.rmdir(dir);
  } catch {}
}

ipcMain.handle('clear-downloads', async () => {
  try {
    return await safeClearDownloadsDir();
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Clear configured downloads directory contents
ipcMain.handle('downloads:clear', async () => {
  try {
    return await safeClearDownloadsDir();
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Delete a single file by absolute path (used to remove cached downloads)
ipcMain.handle('delete-file', async (_e, absPath) => {
  try {
    const p = String(absPath || '').trim();
    if (!p) throw new Error('No path');
    // Check existence first so we can report whether anything was actually deleted
    let existed = false;
    try { const st = await fs.promises.lstat(p); existed = !!st; } catch { existed = false; }
    // Remove files or directories recursively. Caller is responsible for scoping.
    await fs.promises.rm(p, { force: true, recursive: true });
    return { success: true, deleted: existed };
  } catch (err) {
    return { success: false, error: err.message || String(err), deleted: false };
  }
});

// Attempt to find an extracted cache directory in the pkg-cache that contains
// a top-level folder matching the provided Community folder name.
ipcMain.handle('pkg-cache:find-extract-dir', async (_e, { folder } = {}) => {
  try {
    const name = String(folder || '').trim();
    if (!name) throw new Error('Missing folder');
    const root = getPkgCacheDir();
    await fs.promises.mkdir(root, { recursive: true }).catch(() => {});
    const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
    const candidates = [];
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const base = ent.name;
      const full = path.join(root, base, name);
      try {
        const st = await fs.promises.stat(full).catch(() => null);
        if (st && st.isDirectory()) {
          // score by mtime of the extracted folder; prefer most recent
          const mtimeMs = st.mtimeMs || 0;
          candidates.push({ full, mtimeMs });
        }
      } catch {}
    }
    if (!candidates.length) return { success: false, error: 'Not found' };
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { success: true, extractRoot: candidates[0].full };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Downloads directory get/set
ipcMain.handle('downloads:get-dir', async () => {
  try {
    const dir = getDownloadsBaseDir();
    await fs.promises.mkdir(dir, { recursive: true });
    return { success: true, dir };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});
ipcMain.handle('downloads:set-dir', async (_e, dirPath) => {
  try {
    const p = String(dirPath || '').trim();
    if (!p) throw new Error('No directory provided');
    await fs.promises.mkdir(p, { recursive: true });
    const st = await fs.promises.stat(p);
    if (!st.isDirectory()) throw new Error('Path is not a directory');
    const next = writeSettings({ downloadsDir: p });
    if (!next) throw new Error('Could not persist settings');
    return { success: true, dir: p };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Pkg cache directory get/set/clear
ipcMain.handle('pkg-cache:get-dir', async () => {
  try {
    const dir = getPkgCacheDir();
    await fs.promises.mkdir(dir, { recursive: true });
    return { success: true, dir };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});
ipcMain.handle('pkg-cache:set-dir', async (_e, dirPath) => {
  try {
    const p = String(dirPath || '').trim();
    if (!p) throw new Error('No directory provided');
    await fs.promises.mkdir(p, { recursive: true });
    const st = await fs.promises.stat(p);
    if (!st.isDirectory()) throw new Error('Path is not a directory');
    const next = writeSettings({ pkgCacheDir: p });
    if (!next) throw new Error('Could not persist settings');
    return { success: true, dir: p };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});
// Read version from Community/<folder>/manifest.json
ipcMain.handle('get-package-version', async (_e, { installPath, folder }) => {
  try {
    if (!installPath || !folder) throw new Error('Missing params');
  const pkgDir = path.join(String(installPath), String(folder));
  // Resolve junction/symlink target so we read from the real cache directory
  const realPkgDir = await fs.promises.realpath(pkgDir).catch(() => pkgDir);
  const manifestPath = path.join(realPkgDir, 'manifest.json');
  const txt = await fs.promises.readFile(manifestPath, 'utf8');
    const j = JSON.parse(txt);
    const v = j.package_version || j.version || '';
    return { success: true, version: String(v || '') };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Return the resolved real path for a Community link and its extract directory
// We treat the resolved target directory as the extractRoot (actual extracted cache to delete)
// and expose its parent as packageRoot.
// Note: Only one handler should be registered for this channel.
ipcMain.handle('get-package-realpath', async (_e, { installPath, folder }) => {
  try {
    if (!installPath || !folder) throw new Error('Missing params');
    const linkDir = path.join(String(installPath), String(folder));
    const realDir = await fs.promises.realpath(linkDir).catch(() => linkDir);
    const extractRoot = realDir; // resolved to actual extracted directory
    const packageRoot = path.dirname(extractRoot);
    return { success: true, linkDir, realDir, extractRoot, packageRoot };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Read LastUpdate (or similar) from Community/<folder>/manifest.json for changelog display
ipcMain.handle('get-package-lastupdate', async (_e, { installPath, folder }) => {
  try {
    if (!installPath || !folder) throw new Error('Missing params');
  const pkgDir = path.join(String(installPath), String(folder));
  // Resolve junction/symlink target so we read from the real cache directory
  const realPkgDir = await fs.promises.realpath(pkgDir).catch(() => pkgDir);
  const manifestPath = path.join(realPkgDir, 'manifest.json');
  const txt = await fs.promises.readFile(manifestPath, 'utf8');
    const j = JSON.parse(txt);
    // Helpers to normalize and detect meaningful text (avoid dumping raw JSON)
    const norm = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) {
        const parts = v.map(x => (typeof x === 'string' ? x : '')).filter(Boolean);
        return parts.length ? parts.join('\n') : '';
      }
      if (typeof v === 'object') {
        const cand = v.text || v.latest || v.body || v.message || v.content || '';
        if (typeof cand === 'string') return cand;
        return '';
      }
      return '';
    };
    const hasAnyText = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 3) return false;
      for (const val of Object.values(obj)) {
        if (typeof val === 'string' && val.trim()) return true;
        if (Array.isArray(val) && val.some(x => typeof x === 'string' && String(x).trim())) return true;
        if (val && typeof val === 'object' && hasAnyText(val, depth + 1)) return true;
      }
      return false;
    };
    const keysPref = [
      'LastUpdate','lastUpdate','Last Update','last_update','Last_Update',
      'LastUpdated','lastUpdated','lastupdated',
      'ReleaseNotes','releaseNotes','release_notes','notes','Notes','whatsNew','whatsnew','WhatsNew'
    ];
    // Depth-first search for LastUpdate-like content, handling language buckets (neutral, en-US, etc.)
    const langKeysPreferred = ['neutral','en-US','en-GB','en_US','en_GB','en'];
    const seen = new Set();
    function extractDeep(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return '';
      try { seen.add(obj); } catch {}
      // 1) Direct keys first
      for (const k of keysPref) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const raw = obj[k];
          if (raw && typeof raw === 'object') {
            const got = extractDeep(raw, depth + 1);
            if (got) return got;
            if (hasAnyText(raw, depth + 1)) {
              const valCand = norm(raw);
              if (valCand) return valCand;
            }
          } else {
            const val = norm(raw);
            if (val) return val;
          }
        }
      }
      // 2) Fallback to OlderHistory if LastUpdate empty
      if (Object.prototype.hasOwnProperty.call(obj, 'OlderHistory')) {
        const raw = obj['OlderHistory'];
        if (raw && typeof raw === 'object') {
          const got = extractDeep(raw, depth + 1);
          if (got) return got;
          if (hasAnyText(raw, depth + 1)) {
            const valCand = norm(raw);
            if (valCand) return valCand;
          }
        } else {
          const val = norm(raw);
          if (val) return val;
        }
      }
      // 4) Scan any nested objects
      for (const [k, v] of Object.entries(obj)) {
        if (!v || typeof v !== 'object') continue;
        // Favor keys that look like they might hold changelog-ish info
        if (/(update|release|changelog|changes|what\s*'?s\s*new|whatsnew|notes|history)/i.test(k)) {
          const got = extractDeep(v, depth + 1);
          if (got) return got;
        }
      }
      // 5) As a last resort, scan all nested objects
      for (const v of Object.values(obj)) {
        if (v && typeof v === 'object') {
          const got = extractDeep(v, depth + 1);
          if (got) return got;
        }
      }
      return '';
    }
    const found = extractDeep(j);
    const version = String(j.package_version || j.version || '').trim();
    // Extract release notes separately (prefer dedicated keys)
    const notesKeys = ['ReleaseNotes','releaseNotes','release_notes','notes','Notes'];
    function extractNotes(obj, depth = 0) {
      if (!obj || typeof obj !== 'object' || depth > 3) return '';
      for (const k of notesKeys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const raw = obj[k];
          if (raw && typeof raw === 'object') {
            // Notes might be nested under language buckets or have a text/body field
            const nested = extractNotes(raw, depth + 1);
            if (nested) return nested;
            // do not return raw JSON if it has no meaningful text
            if (hasAnyText(raw, depth + 1)) {
              const valCand = norm(raw);
              if (valCand) return valCand;
            }
          } else {
            const val = norm(raw);
            if (val) return val;
          }
        }
      }
      // look into language buckets
      for (const lk of langKeysPreferred) {
        if (obj[lk] && typeof obj[lk] === 'object') {
          const got = extractNotes(obj[lk], depth + 1);
          if (got) return got;
        }
      }
      // targeted nested keys
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && /(notes|release)/i.test(k)) {
          const got = extractNotes(v, depth + 1);
          if (got) return got;
        }
      }
      return '';
    }
  const releaseNotes = extractNotes(j) || '';
    // Also extract OlderHistory if present — search top level AND inside language buckets
    let olderHistory = '';
    try {
      const olderKeys = ['OlderHistory','olderHistory','older_history','History','history'];
      const langBuckets = ['neutral','en-US','en','en-GB'];
      const resolveOlder = (val) => {
        if (!val) return '';
        if (typeof val === 'string') return val;
        if (Array.isArray(val)) return val.map(x => (typeof x === 'string' ? x : '')).filter(Boolean).join('\n');
        if (typeof val === 'object') {
          const cand = val.neutral || val['en-US'] || val.en || val.text || val.content || '';
          if (typeof cand === 'string') return cand;
          if (typeof cand === 'object') {
            const inner = cand.text || cand.content || cand.body || '';
            return typeof inner === 'string' ? inner : '';
          }
        }
        return '';
      };
      // First check top-level keys
      for (const k of olderKeys) {
        if (j[k]) { olderHistory = resolveOlder(j[k]); if (olderHistory) break; }
      }
      // If not found, check inside language buckets
      if (!olderHistory) {
        for (const lb of langBuckets) {
          if (j[lb] && typeof j[lb] === 'object') {
            for (const k of olderKeys) {
              if (j[lb][k]) { olderHistory = resolveOlder(j[lb][k]); if (olderHistory) break; }
            }
            if (olderHistory) break;
          }
        }
      }
    } catch {}
    return { success: true, lastUpdate: String(found || ''), releaseNotes: String(releaseNotes || ''), olderHistory: String(olderHistory || ''), version };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Find and read a local changelog-like file inside Community/<folder>
ipcMain.handle('get-package-changelog-local', async (_e, { installPath, folder }) => {
  try {
    if (!installPath || !folder) throw new Error('Missing params');
  const linkDir = path.join(String(installPath), String(folder));
  const baseDir = await fs.promises.realpath(linkDir).catch(() => linkDir);
    const subdirs = ['', 'Docs', 'docs', 'Documentation', 'documentation', 'Changelog', 'CHANGELOG', 'ReleaseNotes', 'releasenotes',
      path.join('SimObjects','Airplanes'), path.join('SimObjects','Rotorcraft'), path.join('SimObjects','Aircraft')
    ];
    const names = [
      'changelog.txt','changelog.md','change log.txt','change log.md','changes.txt','changes.md',
      'releasenotes.txt','release_notes.txt','release notes.txt','releasenotes.md','release_notes.md','release notes.md',
      'whatsnew.txt','whats new.txt','whatsnew.md','whats new.md','news.md','history.md','update history.txt',
      'readme.txt','readme.md','README.txt','README.md'
    ];
    const isCandidate = (fn) => names.includes(String(fn || '').toLowerCase());
    // First, direct checks in known subdirs
    for (const sd of subdirs) {
      const dir = sd ? path.join(baseDir, sd) : baseDir;
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isFile() && isCandidate(ent.name)) {
            const p = path.join(dir, ent.name);
            try {
              let txt = await fs.promises.readFile(p, 'utf8');
              if (txt.length > 50000) txt = txt.slice(0, 50000) + '\n…';
              return { success: true, file: ent.name, changelog: txt };
            } catch {}
          }
        }
      } catch {}
    }
    // Breadth-limited recursive search up to depth 2 for candidate files
    async function searchDir(dir, depth = 0) {
      if (depth > 3) return null;
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return null; }
      for (const ent of entries) {
        if (ent.isFile() && isCandidate(ent.name)) {
          const p = path.join(dir, ent.name);
          try {
            let txt = await fs.promises.readFile(p, 'utf8');
            if (txt.length > 50000) txt = txt.slice(0, 50000) + '\n…';
            return { success: true, file: ent.name, absPath: p, changelog: txt };
          } catch {}
        }
      }
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const sub = await searchDir(path.join(dir, ent.name), depth + 1);
          if (sub) return sub;
        }
      }
      return null;
    }
    const found = await searchDir(baseDir, 0);
    if (found) return found;
    // Heuristic: scan generic .txt/.md files for release/changelog content
  const kw = /(changelog|change\s*log|release\s*notes?|what'?s\s*new|update\s*history|version\s*\d|^v\d+\.\d+)/i;
    const maxScanFiles = 60;
    const collected = [];
  const stripHtml = (s) => String(s || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
    async function collectDir(dir, depth = 0) {
      if (depth > 3 || collected.length >= maxScanFiles) return;
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isFile()) {
          const low = ent.name.toLowerCase();
      if (low.endsWith('.txt') || low.endsWith('.md') || low.endsWith('.html') || low.endsWith('.htm') || low === 'readme' || low === 'readme.md' || low === 'readme.txt') {
            collected.push(full);
            if (collected.length >= maxScanFiles) break;
          }
        }
      }
      for (const ent of entries) {
        if (ent.isDirectory()) {
          await collectDir(path.join(dir, ent.name), depth + 1);
          if (collected.length >= maxScanFiles) break;
        }
      }
    }
    await collectDir(baseDir, 0);
    let best = null;
    function scoreText(t) {
      let s = 0;
      const head = String(t || '').slice(0, 4000);
      if (kw.test(head)) s += 5;
      const lines = head.split(/\r?\n/).slice(0, 50);
      for (const ln of lines) {
        if (/^#+\s*(change|release|what'?s\s*new|updates?)/i.test(ln)) s += 3;
        if (/\b(v|version)\s*\d+\.\d+/i.test(ln)) s += 2;
        if (/\b(202\d|20\d{2})\b/.test(ln) && /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})/i.test(ln)) s += 1;
      }
      return s;
    }
  for (const p of collected) {
      try {
        const st = await fs.promises.stat(p).catch(() => null);
        if (!st || st.size > 256 * 1024) continue; // skip very large files
    let raw = await fs.promises.readFile(p, 'utf8');
    const low = p.toLowerCase();
    const txt = (low.endsWith('.html') || low.endsWith('.htm')) ? stripHtml(raw) : raw;
        const s = scoreText(txt);
        if (s > 0 && (!best || s > best.score)) {
          const clipped = txt.length > 4000 ? txt.slice(0, 4000) + '\n…' : txt;
          best = { score: s, file: path.basename(p), absPath: p, changelog: clipped };
        }
      } catch {}
    }
    if (best) return { success: true, file: best.file, absPath: best.absPath, changelog: best.changelog };
    return { success: false, error: 'No local changelog file found' };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Resolve Community link real path and extract parent for a given package folder
// (Removed duplicate get-package-realpath handler)

// Reveal a path in Explorer/Finder (selects it in parent)
ipcMain.handle('os:reveal-in-folder', async (_e, absPath) => {
  try {
    const p = String(absPath || '').trim();
    if (!p) throw new Error('No path');
    const { shell } = require('electron');
    try { await fs.promises.stat(p); } catch { /* still try to reveal parent */ }
    shell.showItemInFolder(p);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Open a folder directly in Explorer/Finder (navigates inside it)
ipcMain.handle('os:open-folder', async (_e, absPath) => {
  try {
    const p = String(absPath || '').trim();
    if (!p) throw new Error('No path');
    const { shell } = require('electron');
    await shell.openPath(p);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Validate a package folder linked in Community: checks for manifest.json, layout.json,
// SimObjects presence, aircraft.cfg, and reports longest file path length.
ipcMain.handle('pkg:validate', async (_e, { installPath, folder }) => {
  try {
    if (!installPath || !folder) throw new Error('Missing params');
    const linkDir = path.join(String(installPath), String(folder));
    const realDir = await fs.promises.realpath(linkDir).catch(() => linkDir);
    const exists = await fs.promises.stat(realDir).then(st => st.isDirectory()).catch(() => false);
    if (!exists) return { success: false, error: 'Resolved package directory not found', linkDir, realDir };
    const manifestPath = path.join(realDir, 'manifest.json');
    const layoutPath = path.join(realDir, 'layout.json');
    const hasManifest = await fs.promises.stat(manifestPath).then(st => st.isFile()).catch(() => false);
    const hasLayout = await fs.promises.stat(layoutPath).then(st => st.isFile()).catch(() => false);
    // Read and analyze layout.json for expected assets
    let layoutEntries = 0;
    let layoutGltfCount = 0;
    let layoutMissingCount = 0;
    if (hasLayout) {
      try {
        const txt = await fs.promises.readFile(layoutPath, 'utf8');
        const j = JSON.parse(txt);
        const files = Array.isArray(j) ? j : (Array.isArray(j.files) ? j.files : []);
        layoutEntries = files.length;
        const sample = files.slice(0, Math.min(files.length, 120));
        for (const f of sample) {
          const p = path.join(realDir, String(f?.path || f?.file || ''));
          if (/\.(gltf|bin|dds|png|jpg|json)$/i.test(p)) {
            if (/\.gltf$/i.test(p)) layoutGltfCount++;
          }
          const ok = await fs.promises.stat(p).then(st => st.isFile()).catch(() => false);
          if (!ok) layoutMissingCount++;
        }
      } catch {}
    }
    let simObjectsDirs = [];
    for (const sub of ['SimObjects/Airplanes', 'SimObjects/Rotorcraft', 'SimObjects/Aircraft']) {
      const p = path.join(realDir, sub);
      const ok = await fs.promises.stat(p).then(st => st.isDirectory()).catch(() => false);
      if (ok) simObjectsDirs.push(sub);
    }
    // Probe for at least one aircraft.cfg and check model assets
    let aircraftCfgFound = false;
    const aircraftDetails = [];
    async function findCfg(dir, depth = 0) {
      if (depth > 3 || aircraftCfgFound) return;
      let ents;
      try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.isFile() && /^(aircraft)\.cfg$/i.test(e.name)) {
          aircraftCfgFound = true;
          try {
            const cfgPath = path.join(dir, e.name);
            const cfgTxt = await fs.promises.readFile(cfgPath, 'utf8');
            // crude parse: find first [FLTSIM] or [FLTSIM.0] model=
            const lines = cfgTxt.split(/\r?\n/);
            let modelVal = '';
            for (const ln of lines) {
              const m = /^\s*model\s*=\s*(.*)\s*$/i.exec(ln);
              if (m) { modelVal = (m[1]||'').trim(); break; }
            }
            const base = path.dirname(cfgPath);
            let modelDir = path.join(base, 'model' + (modelVal ? ('.' + modelVal) : ''));
            let hasModelCfg = await fs.promises.stat(path.join(modelDir, 'model.cfg')).then(s=>s.isFile()).catch(()=>false);
            let hasGltf = false;
            let gltfFiles = [];
            // If model.cfg exists, try to resolve referenced model folder; else look for gltf in modelDir
            if (hasModelCfg) {
              try {
                const mtxt = await fs.promises.readFile(path.join(modelDir, 'model.cfg'), 'utf8');
                // look for normal=.. line to switch to that folder relative to modelDir
                const mm = /\bnormal\s*=\s*([^\r\n]+)/i.exec(mtxt);
                if (mm && mm[1]) {
                  const rel = String(mm[1]).trim();
                  if (rel && rel !== '.') {
                    const alt = path.resolve(modelDir, rel);
                    modelDir = alt;
                  }
                }
              } catch {}
            }
            try {
              const dents = await fs.promises.readdir(modelDir, { withFileTypes: true });
              for (const f of dents) {
                if (f.isFile() && /\.(gltf|bin)$/i.test(f.name)) {
                  hasGltf = true;
                  gltfFiles.push(f.name);
                }
              }
            } catch {}
            aircraftDetails.push({ cfgPath, modelDir, hasModelCfg, hasGltf, gltfFiles });
          } catch {}
          return;
        }
      }
      for (const e of ents) {
        if (e.isDirectory()) await findCfg(path.join(dir, e.name), depth + 1);
        if (aircraftCfgFound) return;
      }
    }
    for (const sub of simObjectsDirs) {
      await findCfg(path.join(realDir, sub), 0);
      if (aircraftCfgFound) break;
    }
    // Compute longest path length within package (Windows MAX_PATH issues)
    let maxPathLen = 0;
    async function scanPaths(dir, baseLen = 0, depth = 0) {
      if (depth > 6) return; // limit
      let ents;
      try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const full = path.join(dir, e.name);
        const len = full.length;
        if (len > maxPathLen) maxPathLen = len;
        if (e.isDirectory()) await scanPaths(full, len, depth + 1);
      }
    }
    await scanPaths(realDir);
    return {
      success: true,
      linkDir,
      realDir,
      hasManifest,
      hasLayout,
      simObjects: simObjectsDirs,
      aircraftCfgFound,
      maxPathLen,
      layoutEntries,
      layoutGltfCount,
      layoutMissingCount,
      aircraftDetails
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});