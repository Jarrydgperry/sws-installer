# SWS Installer - Complete Architecture Overview

**Version:** 0.0.17+ (with cache staleness fixes)  

**Date:** April 2026

---

## Section 1: System Architecture Map

**High-Level Topology:**
```
┌─────────────────────────────────────────────────────────────┐
│                    Electron App (Windows)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Main Process (Node.js, Full System Access)          │   │
│  │  • File system, downloads, installs                 │   │
│  │  • Auto-updater, path detection                     │   │
│  │  45+ IPC handlers for renderer commands             │   │
│  └─────────────────────────┬──────────────────────────┘   │
│                            │ IPC Bridge                     │
│  ┌─────────────────────────▼──────────────────────────┐   │
│  │ Preload Script (Security Sandbox)                   │   │
│  │  • Exposes 40+ safe API methods to renderer        │   │
│  │  • Validates all main↔renderer communication       │   │
│  │  • Blocks direct Node.js access                    │   │
│  └─────────────────────────┬──────────────────────────┘   │
│                            │ window.electron API           │
│  ┌─────────────────────────▼──────────────────────────┐   │
│  │ Renderer Process (React 18, CSP-Isolated)          │   │
│  │  • Login, product display, download orchestration  │   │
│  │  • 12,600+ line React app in src/index.js         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                               │
         │ HTTP/HTTPS                    │ HTTP/HTTPS
         ▼                               ▼
    ┌─────────────────────┐      ┌──────────────────────┐
    │ WP + WooCommerce    │      │  Bunny CDN           │
    │ JWT Auth            │      │  Product ZIPs        │
    │ Ownership API       │      │  manifest.json       │
    │ (simworksstudios)   │      │  (sws-installer)     │
    └─────────────────────┘      └──────────────────────┘
```

**Tech Stack:**
- **Electron 29.0.0** – Desktop shell, native module access
- **React 18.2.0** – UI component tree (monolithic src/index.js)
- **Webpack 5 + Babel** – Build pipeline with DefinePlugin for environment
- **electron-builder 24.13.3** – NSIS installer packaging
- **Node modules:** keytar (secure credentials), 7zip-bin (compression), adm-zip (fallback extraction)

**Files to Know:**
- [main.js](main.js) – 2,400+ lines, Electron main process
- [preload.js](preload.js) – 260 lines, security bridge
- [src/index.js](src/index.js) – 12,600+ lines, React app
- [webpack.config.js](webpack.config.js) – Build config with SWS_ENV injection
- [package.json](package.json) – Scripts, deps, electron-builder config

---

## Section 2: Runtime Architecture & Security

**Process Boundaries:**

1. **Main Process** ([main.js](main.js), lines 1–100 setup)
   - Full Node.js access: fs, http, https, child_process, crypto
   - Owns all file system operations (downloads, installs, path detection)
   - Registers 45 IPC handlers to receive commands from renderer
   - Example: `ipcMain.handle('downloads:fetch-url', async (event, url, savePath) => { ... })` [line 1085](main.js#L1085)

2. **Preload Script** ([preload.js](preload.js), lines 1–260)
   - Runs in isolated context before renderer loads
   - Exposes curated API surface via `contextBridge.exposeInMainWorld('electron', {...})`
   - Acts as security gate: validates calls, prevents XSS injection into IPC
   - 40+ methods including: `getToken()`, `setToken()`, `fetchURL()`, `installAircraft()`, `checkForUpdate()`
   - **Critical:** Never pass raw user input to main.js without validation

3. **Renderer Process** ([src/index.js](src/index.js), lines 1–30 imports)
   - React component tree (single App component rendering ~12k lines)
   - Calls `window.electron.*` methods only (cannot access Node.js directly)
   - CSP header in [src/index.html](src/index.html) enforces `script-src 'self'` – only bundled code runs
   - localStorage for non-sensitive state (filters, cache metadata)
   - HTTP requests use fetch (no raw sockets)

**Security Model:**
- ✅ **contextIsolation: true** – Renderer can't access main's global scope
- ✅ **sandbox: true** – Renderer runs in OS-level sandbox
- ✅ **preload validation** – All IPC args checked before forwarding
- ✅ **CSP header** – Blocks inline scripts, external CDN loads
- ✅ **Keytar integration** – Windows Credential Manager for JWT tokens (not localStorage)

---



## Section 3: Startup Flow → Login → Ownership

**Boot Sequence** ([main.js](main.js#L200), [src/index.js](src/index.js#L7044))

1. **Electron App Ready** ([main.js](main.js#L200–240))
   - Create BrowserWindow pointing to webpack dev/prod bundle
   - Inject CSP meta tag
   - Register 45+ IPC handlers
   - Setup auto-updater event listeners [line 390](main.js#L390)

2. **Renderer Load** ([src/index.js](src/index.js#L11520–11580))
   - createRoot mounts React ErrorBoundary wrapper
   - App component initializes state: token, owned products, download cache, UI page
   - Check token in keytar on mount (restore previous login session)
   - Jump to login screen if no token, else jump to product list

3. **Login Handler** ([src/index.js](src/index.js#L7810–8220), key snippet at 7844)
   ```javascript
   POST https://www.simworksstudios.com/wp-json/jwt-auth/v1/token
   Body: { username, password }
   Response: { token, user_email, ... }
   ```
   - **Error Classification** [lines 7900–8000](src/index.js#L7900-L8000):
     - DNS/connectivity → "Can't reach server"
     - SSL cert → "Security certificate issue"
     - 403 Forbidden → "Wrong credentials"
     - 429 Too Many Requests → "Rate limited, try later"
     - JSON decode → "Server response invalid"
   - **Token Persistence**: Save to keytar (Windows Credential Manager)
   - **Beta Role Detection**: Decode JWT payload, check if user has beta role
   - If success → fetch owned products

4. **Ownership Fetch** ([src/index.js](src/index.js#L8065–8300), core at 8120)
   ```javascript
   GET https://www.simworksstudios.com/wp-json/simworks/v1/msfs-ownership
   Header: Authorization: Bearer ${token}
   Response: [ { product_id, product_name, channel, ... }, ... ]
   ```
   - **Product Mapping**: Correlate WP objects to Bunny CDN metadata
     - Primary match: product ID → look up in manifest
     - Fallback: product name or SKU heuristic matching
   - **Alias Deduplication**: GA8 base vs GA8 expansion → collapse to single canonical product
   - **Channel Isolation**: Public vs Beta channel filtering
   - Store result in React state → render product cards

5. **Caching & State** ([src/index.js](src/index.js#L7044–7170))
   - Download cache: localStorage keyed by `sws_dl_${productId}_${simTag}_${channel}`
   - Ownership never cached in localStorage (always fresh fetch per session)
   - Token cached in keytar, not localStorage

---

## Section 4: Download Pipeline & Cache Staleness

**Download Entry Points:**

1. **Single Product Download** ([src/index.js](src/index.js#L2337), `downloadFromInstall`)
   - User clicks "Install" on product card
   - Checks: `cacheIsStale` using **two-tier logic** [lines 2337–2365](src/index.js#L2337-L2365)
     ```javascript
     // Tier 1: If both have versions, compare them
     const cacheIsStale = (cachedVersion && remoteVersion)
       ? compareVersionsNormalized(remoteVersion, cachedVersion) > 0
       : // Tier 2: If file exists but cached version is empty, treat as stale if remote is known
         !!(cacheHasNoVersion && remoteVersion);
     ```
   - **Why Tier 2?** Old cache records (pre-version-backfilling) have no version. File exists but `cacheIsStale` was always false, so downloads never triggered. **Fixed April 2026.**
   - If stale → call `window.electron.fetchURL()` → delegate to main.js downloader

2. **Multi-Product Batch Download** ([src/index.js](src/index.js#L2700), `downloadAllForSim`)
   - User clicks "Download All" for a sim tag
   - Same staleness check applied at [lines 2700–2740](src/index.js#L2700-L2740) for each product
   - Batch multiple downloads with resumable IPC

3. **Cross-Sim Cache Reuse** ([src/index.js](src/index.js#L2800–2850))
   - FS2020 and FS2024 can share the same aircraft ZIP (unified packages)
   - Download cache lookup checks all related sim tags
   - Example: Installing GA8 for FS2024 → check if FS2020 already has that ZIP → reuse

**Main Process Downloader** ([main.js](main.js#L650–830), `downloadToDownloadsWithResume`)

1. **HTTP Request with Resume Support** [lines 650–700](main.js#L650-L700)
   - Check if partial file exists: read `.meta.json` sidecar for ETag/Last-Modified
   - Send GET with Range header to resume from last byte
   - Store ETag and Last-Modified in memory (from response headers)

2. **Stale Content Detection** [lines 650–666](main.js#L650-L666) – **NEW April 2026**
   ```javascript
   const serverContentChanged =
     (!!etag && !!meta.etag && etag !== meta.etag) ||
     (!!lastModified && !!meta.lastModified && lastModified !== meta.lastModified);
   if (serverContentChanged) {
     await fs.promises.unlink(finalPath); // Delete old ZIP
     debugLog('INFO', 'Download: server content changed, invalidating cached zip');
   }
   ```
   - **Why?** If a CDN URL publishes new content under same filename, old ZIP size might match but content is stale. ETag mismatch triggers deletion → fresh download.

3. **Encryption at Rest** [lines 700–750](main.js#L700-L750)
   - Stream through AES-256-GCM cipher while downloading
   - Save `.meta.json` with etag, lastModified, size, encrypted flag

4. **Completion & Sidecar** [lines 780–830](main.js#L780-L830)
   - Write final `.meta.json`: `{ etag, lastModified, size, dateDownloaded, encrypted }`
   - Report progress events to renderer via IPC

**Cache Data Model:**

- **In Renderer (localStorage)**: `sws_dl_${productId}_${simTag}_${channel}`
  ```json
  {
    "productId": "12345",
    "productName": "kodiak-100",
    "variant": "G1000",
    "downloadedAt": "2026-04-22T10:30:00Z",
    "localPath": "C:/Users/.../Downloads/sws_da40_v2.1.0.zip",
    "version": "2.1.0",
    "channel": "Public",
    "simTags": ["FS2020", "FS2024"]
  }
  ```

- **On Disk (alongside ZIP)**: `${zipPath}.meta.json`
  ```json
  {
    "etag": "\"abc123def456\"",
    "lastModified": "Wed, 20 Apr 2026 14:22:00 GMT",
    "size": 157286400,
    "dateDownloaded": "2026-04-22T10:30:00Z",
    "encrypted": true
  }
  ```

**Cache Helpers** ([src/index.js](src/index.js#L11666–11829))
- `readDlCache(productId, simTag, channel)` – Retrieve + sanitize cache record
- `writeDlCache(productId, simTag, channel, data)` – Merge update
- `removeDlCache(productId, simTag, channel)` – Delete record
- `clearAllDlCache()` – Nuke entire download history

---

## Section 5: Install Orchestration & Extraction Strategies

**Install Handler** ([src/index.js](src/index.js#L8822–9005))

1. **UI → React State** [lines 8822–8850](src/index.js#L8822-L8850)
   - User clicks "Install" after download completes
   - Check Community folder path is valid (offer correction if wrong)
   - Show loading spinner, subscribe to progress events

2. **Delegate to Main Process** [lines 8900–8950](src/index.js#L8900-L8950)
   ```javascript
   window.electron.installAircraft({
     zipPath: "C:/.../sws_da40_v2.1.0.zip",
     communityPath: "C:/.../Community",
     packageName: "asobo-aircraft-da40",
     simTag: "FS2020",
     variant: "G1000",
     channel: "Public"
   })
   ```

3. **Main Process Extraction** ([main.js](main.js#L1406–1640), `handleInstallAircraft`)
   - **Tier 1: 7-Zip** [lines 1406–1450](main.js#L1406-L1450)
     - Fastest, handles large files, respects folder structures
     - Falls back if not found or permission denied
   - **Tier 2: PowerShell** [lines 1450–1500](main.js#L1450-L1500)
     - Windows native, no external binary needed
     - Slower but reliable
   - **Tier 3: adm-zip** [lines 1500–1550](main.js#L1500-L1550)
     - Pure JS fallback, very slow for large files
     - Only if both above fail
   
4. **Link Strategy** [lines 1550–1600](main.js#L1550-L1600)
   - Check if target package already in Community: `stat(communityPath/packageName)`
   - If exists → use junction link (hardlink folder, instant, Windows-only)
   - Else → copy extracted files (slower, but compatible)

5. **pkg-cache Optimization** [lines 1600–1640](main.js#L1600-L1640)
   - Maintain `${appDataPath}/pkg-cache/` with extracted folders
   - On install: check if package already in cache
   - If yes → just link from cache (skip extraction)
   - Saves disk I/O and extraction time for repeat installs

6. **Persist Result** ([src/index.js](src/index.js#L8950–9005))
   - localStorage update: `sws_dl_${productId}_${simTag}_${channel}` with:
     - `installedAt`: timestamp
     - `version`: from manifest or package.json
     - `variant`: (e.g., "G1000 NXi")
     - `channel`: channel that was installed
   - Show success message
   - If offline during install → queued for next check

---

## Section 6: Version Probing & Self-Update

**Version Detection** ([src/index.js](src/index.js#L4510–4800), `fetchManifestVersion`)

1. **Manifest Fetch with ETag Cache** [lines 4510–4550](src/index.js#L4510-L4550)
   ```javascript
   GET https://sws-installer.b-cdn.net/${productId}/manifest.json
   If-None-Match: ${window.__swsManifestEtagCache[productId]}
   ```
   - ETag short-circuit cache in `window.__swsManifestEtagCache`
   - Server returns 304 Not Modified → use cached version
   - Else → new version from manifest JSON

2. **Fallback Heuristics** [lines 4600–4700](src/index.js#L4600-L4700)
   - Extract version from `manifest.json#.version` field
   - Fallback 1: Parse changelog text for "v1.2.3" pattern
   - Fallback 2: Extract from ZIP filename (e.g., `da40_v2.1.0.zip`)
   - Fallback 3: Use installed version if available

3. **Version Comparison** ([src/index.js](src/index.js#L11980–12050), `compareVersionsNormalized`)
   - Normalize: "1.2.3" → [1, 2, 3] (handle missing minor/patch)
   - Compare: [2, 0, 0] > [1, 9, 9] ✓ (major takes precedence)
   - Used to detect: is remote version newer than installed?

**Auto-Updater** ([main.js](main.js#L390–520))

1. **Setup** [lines 390–410](main.js#L390-L410)
   ```javascript
   autoUpdater.checkForUpdates(); // ~5 seconds after app starts
   ```
   - Configured via `electron-updater` with GitHub releases
   - Repo: `JGP1992/sws-installer`

2. **Event Flow** [lines 420–510](main.js#L420-L510)
   - `update-available` → Renderer shows "New version available" badge
   - `update-downloaded` → Show "Install & Restart" button
   - User clicks → `autoUpdater.installAndQuit()`
   - App restarts with new version

3. **Renderer Listener** ([src/index.js](src/index.js#L7200–7250))
   - Subscribe to `window.electron.onUpdateAvailable(callback)`
   - Show modal with version info
   - User clicks "Install" → calls `window.electron.installUpdate()`

---

## Section 7: Development Build Workflow

**Build Environment** ([webpack.config.js](webpack.config.js), [package.json](package.json))

1. **SWS_ENV Injection** [webpack.config.js lines 15–30](webpack.config.js#L15-L30)
   ```javascript
   new webpack.DefinePlugin({
     'process.env.SWS_ENV': JSON.stringify(process.env.SWS_ENV || 'production'),
     '_IS_DEV_BUILD': process.env.SWS_ENV === 'development'
   })
   ```
   - Webpack replaces `_IS_DEV_BUILD` at bundle time
   - No runtime overhead (compile-time constant folding)

2. **NPM Scripts** ([package.json](package.json#L30-L50))
   ```json
   {
     "scripts": {
       "dev": "cross-env SWS_ENV=development webpack --watch",
       "build": "webpack",
       "build:dev": "cross-env SWS_ENV=development webpack",
       "build:prod": "cross-env SWS_ENV=production webpack",
       "start": "electron .",
       "release": "npm run build:prod && electron-builder"
   }
   }
   ```

3. **Dev Build Badge** ([src/index.js](src/index.js#L10217–10239))
   - If `_IS_DEV_BUILD` is true → render orange "DEV BUILD" banner in sidebar
   - Makes it obvious which version is running (prevents accidental testing on prod config)
   - Only in sidebar, doesn't interfere with main UI

4. **Git Branches**
   - `master` → Production-ready code, tagged with versions
   - `dev` → Active development, tested before merge to master
   - Feature PRs go to `dev`, release PRs from `dev` to `master`

5. **Release Workflow**
   ```bash
   # On dev branch: commit fixes, test
   git commit -m "Fix cache staleness edge case"
   
   # Merge to master
   git checkout master
   git merge dev
   
   # Build + package
   npm run release
   
   # electron-builder creates:
   # - release/SWS-Installer-x.x.x-Setup.exe
   # - release/SWS-Installer-x.x.x-Setup.exe.blockmap
   # - release/latest.yml (auto-updater manifest)
   
   # Tag + push
   git tag v0.0.18
   git push origin master --tags
   ```

---

## Section 8: Debugging & Observability

**Logging** ([main.js](main.js#L60–120))

1. **Debug Mode** [lines 60–80](main.js#L60-L80)
   - Environment var: `DEBUG_SWS=true npm start`
   - Enables console.log for all IPC calls, downloads, installs
   - Default off (production silent)

2. **Log Levels** ([main.js](main.js#L100–120))
   - `debugLog('INFO', 'message')` – Always logged
   - `debugLog('DEBUG', 'message')` – Only if DEBUG_SWS=true
   - `debugLog('ERROR', 'message')` – Errors always logged

3. **Persisted Logs** [lines 120–150](main.js#L120-L150)
   - Append-only log file: `${appDataPath}/sws-installer-debug.log`
   - Include timestamps, severity, context
   - Used for post-mortem debugging if app crashes

4. **Renderer Logs** ([src/index.js](src/index.js#L200–250))
   - React component mount/unmount logged (if DEBUG_SWS=true)
   - IPC call arguments/returns logged
   - Network request URLs logged (but not response bodies for privacy)

**Common Debugging Scenarios:**

| Symptom | Investigation |
|---------|---|
| "Download stuck" | Check `${downloadsDir}/*.meta.json` for stale ETag; check main.js logs for HTTP errors |
| "Install fails silently" | Check 7-zip not installed; try manual extract with PowerShell; check path permissions |
| "Token won't save" | Check keytar service running; check Windows Credential Manager; check JWT decode error logs |
| "Version shows as outdated" | Check manifest.json on CDN; check ETag cache cleared; try `npm run build:prod` rebuild |
| "DEV badge won't show" | Check SWS_ENV=development set before webpack; check webpack bundle rebuilt; check _IS_DEV_BUILD global |

**Files for Pin-On-Screen During Call:**
1. [main.js](main.js) – Line 650 (ETag fix), 1085 (download handler), 1406 (install)
2. [src/index.js](src/index.js) – Line 2337 (cache staleness fix), 7844 (login), 8065 (ownership), 8822 (install UI)
3. [preload.js](preload.js) – API bridge, security model
4. [webpack.config.js](webpack.config.js) – SWS_ENV injection
5. [package.json](package.json) – Scripts, build config

---

## Key Fixes Applied (April 2026)

### Fix 1: ETag/Last-Modified Validation in Download Pipeline
**File:** [main.js](main.js#L650-L666)  
**Problem:** If CDN re-published a ZIP under the same name, the downloader would reuse the old file (matching size) without checking ETag/Last-Modified.  
**Solution:** Before short-circuit, compare server ETag against saved `.meta.json`. If different, delete old ZIP and fetch fresh.  
**Impact:** Prevents stale installs, ensures users get latest content even with identical filenames.

### Fix 2: Cache Staleness Check Missing Version Edge Case
**File:** [src/index.js](src/index.js#L2337-L2365) + [line 2700](src/index.js#L2700-L2740)  
**Problem:** Old cache records (predating version backfilling) had no version string. Staleness check `cacheIsStale = !!(cachedVersion && remoteVersion && ...)` would be false, so downloads never triggered, and main.js's ETag check never ran.  
**Solution:** Split into two-tier logic:
1. If both have versions → compare
2. Else if file exists but no cached version → treat as stale if remote version known  

**Impact:** Fixes backward compatibility with old cache records. Users with pre-version caches now get fresh downloads when server has new content.

---

## Talking Points for 15-Minute Call

**Opener (1 min):**
"SWS Installer is an Electron + React desktop app that downloads and installs Microsoft Flight Simulator packages. I'll walk you through the security model, download pipeline, installation process, and the two critical cache staleness fixes we just applied."

**Architecture (2 min):**
- Show [main.js](main.js) structure: main process with 45+ IPC handlers
- Show [preload.js](preload.js): security bridge limiting renderer access
- Show [src/index.js](src/index.js): 12,600-line React app that orchestrates everything
- Key insight: Main process handles file ops, preload validates calls, renderer calls only through safe API

**Startup & Auth (2 min):**
- User launches app → Electron creates window, preload script loads, React mounts
- No token in keytar → show login screen
- POST to WooCommerce JWT endpoint [line 7844](src/index.js#L7844): `POST /wp-json/jwt-auth/v1/token`
- Error handling is detailed [lines 7900–8000](src/index.js#L7900-L8000): distinguishes DNS, SSL, wrong password, rate limit, etc.
- Token success → fetch owned products [line 8065](src/index.js#L8065): `GET /wp-json/simworks/v1/msfs-ownership`
- Owned products correlated to Bunny CDN → render product cards

**Download Pipeline (3 min):**
- User clicks "Install" → check cache staleness [line 2337](src/index.js#L2337)
- **New two-tier logic:**
  - Tier 1: If both have versions, compare (v2.0 > v1.5 = stale)
  - Tier 2: If file exists but cached version empty, treat as stale if remote version known (fixes old cache records)
- If stale → call main.js downloader [line 1085](main.js#L1085)
- Main.js checks ETag/Last-Modified [line 650](main.js#L650): if server content changed, delete old ZIP, fetch fresh
- **Critical fix:** Without ETag check, CDN re-publish would be missed. Without tier-2 staleness, old cache records would never trigger downloads.
- Download with resume support (Range header), encrypt at rest, save `.meta.json` sidecar

**Install (2 min):**
- After download completes, show "Install" button
- User clicks → delegate to main.js [line 8822](src/index.js#L8822)
- Main.js tries extraction in order [line 1406](main.js#L1406):
  1. 7-Zip (fastest)
  2. PowerShell native (fallback)
  3. adm-zip (last resort)
- Link extracted package into Community folder (junction link = instant, else copy)
- pkg-cache optimization: if already extracted, just link from cache (saves re-extraction time)
- Persist result to localStorage [lines 8950–9005](src/index.js#L8950-L9005)

**Self-Update & Dev Build (2 min):**
- Auto-updater checks GitHub releases ~5 sec after startup [line 390](main.js#L390)
- If new version available → show badge, user clicks "Install & Restart" → app updates
- Build environment uses `SWS_ENV` [webpack.config.js line 15](webpack.config.js#L15): injected by webpack.DefinePlugin
- Dev builds set `_IS_DEV_BUILD=true` → render orange "DEV BUILD" badge [src/index.js line 10217](src/index.js#L10217)
- npm scripts: `npm run build:dev` sets SWS_ENV=development, `npm run build:prod` for release
- Git workflow: `dev` branch for active work, `master` for production, merge & release

**Closer (1 min):**
"Questions? The code is heavily commented, all IPC handlers follow same pattern, React component is monolithic but readable. Two key files to dive into: main.js for system operations, src/index.js for UI state machine."

---

## Next Steps

1. **Verify Fixes:**
   ```bash
   npm run build:prod
   npm start
   # Confirm: no DEV BUILD badge
   # Test: delete old .meta.json files to force fresh downloads
   ```

2. **Push Branches:**
   ```bash
   git push origin dev
   git push origin master
   ```

3. **Release v0.0.18:**
   ```bash
   git checkout master
   npm run release
   # Creates SWS-Installer-0.0.18-Setup.exe + latest.yml
   git tag v0.0.18
   git push origin master --tags
   ```

4. **Share with Team:**
   - Share this [ARCHITECTURE.md](ARCHITECTURE.md) document
   - Schedule 15-minute call to walk through the 8 sections above
   - Have [main.js](main.js), [src/index.js](src/index.js), [preload.js](preload.js) pinned during call
