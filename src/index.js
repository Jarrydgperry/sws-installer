import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import heroImg from './images/HQ.png';
import signinImg from './images/00-800x450.jpg.webp';
import logoImg from './images/Logo Png.png';
import { MdHome, MdMenuBook, MdRefresh } from "react-icons/md";
import cogIcon from './images/installer_COG.png';
import binIcon from './images/Installer Bin.png';
import JSZip from 'jszip';
import icon2020plus from './images/Compatibility_FS20FS24.png';
import icon2020 from './images/Compatibility_FS2020.png';
import icon2024 from './images/Compatibility_FS2024.png';
import warningIcon from './images/warning.png';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// -- Electron bridge typing and mock (for browser dev) --

// ----- WP API base URL (configurable) -----
// Default to production; allow override via localStorage 'sws_wp_base_url' or env SWS_WP_BASE_URL
const WP_BASE_URL = (() => {
  try {
    const ls = localStorage.getItem('sws_wp_base_url');
    if (ls && /^https?:\/\//i.test(ls)) return ls.replace(/\/$/, '');
  } catch {}
  try {
    const env = (window?.process?.env?.SWS_WP_BASE_URL) || '';
    if (env && /^https?:\/\//i.test(env)) return String(env).replace(/\/$/, '');
  } catch {}
  // Fallback to production site base
  return 'https://www.simworksstudios.com';
})();

// Add this helper to shorten release notes to a compact summary (prefer a date)
function summarizeReleaseNotes(text) {
  if (!text) return '';
  const firstLine = String(text).split(/\r?\n/)[0].trim();
  if (!firstLine) return '';
  const m = /released\s+([A-Za-z]+\s+\d{1,2},\s*\d{4})/i.exec(firstLine);
  if (m) return m[1];
  const clean = firstLine.replace(/^version\s*/i,'').trim();
  return clean.length > 60 ? clean.slice(0,57)+'…' : clean;
}

// --- PATCH 1: compareVersions (full) ---
function compareVersions(a, b) {
  const toParts = v => String(v || '').trim().replace(/^v/i,'')
    .split(/[.\-+]/).map(p => (/^\d+$/.test(p)? Number(p): p));
    const A = toParts(a), B = toParts(b); 
  const len = Math.max(A.length, B.length);
  for (let i=0;i<len;i++){
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x>y) return 1;
      if (x<y) return -1;
    } else {
      const xs = String(x), ys = String(y);
      if (xs>ys) return 1;
      if (xs<ys) return -1;
    }
  }
  return 0;
}

// Normalize changelog/release notes text that may contain escaped sequences or raw markers from JSON
function formatReleaseNotesText(input) {
  try {
    let t = String(input == null ? '' : input);
    if (!t) return '';
    // Convert common escaped sequences (when JSON embeds newlines as \n)
    t = t.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\\t/g, '  ');
    // Collapse excessive blank lines
    t = t.replace(/\n{3,}/g, '\n\n');
    // Convert markers like ">>>>SECTION<<<<" to a simple heading on its own line
    t = t.replace(/>{2,}\s*(.*?)\s*<{2,}/g, '\n$1\n');
    // Turn lines starting with "> " into bullets
    t = t.replace(/(^|\n)>\s*/g, '$1• ');
    // Trim trailing whitespace
    return t.trim();
  } catch {
    return String(input || '');
  }
}

// Centralized theme for consistent button colors across the app
const SWS_THEME = {
  fill: {
    public: '#16a34a',
    beta: '#f59e0b',
    uninstall: '#dc2626',
    gray: '#475569',
    busy: '#7a4300'
  },
  outline: {
    public: '#22c55e',
    beta: '#fbbf24',
    neutral: '#475569',
    danger: '#dc2626'
  },
  text: {
    onBeta: '#ffffff'
  }
};

// Image preloader used by thumbnail logic; resolves to final URL on success or null on failure
function preloadImage(url, opts = {}) {
  const { cacheBust = false, timeoutMs = 6000 } = opts || {};
  return new Promise(resolve => {
    try {
      if (!url || typeof window === 'undefined') return resolve(null);
      const img = new window.Image();
      const finalUrl = (cacheBust && /^https?:/i.test(url))
        ? url + (url.includes('?') ? '&' : '?') + '_cb=' + cdnCacheBucket()
        : url;
      let done = false;
      const finish = ok => { if (done) return; done = true; try { clearTimeout(timer); } catch {} resolve(ok ? finalUrl : null); };
      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.src = finalUrl;
    } catch { resolve(null); }
  });
}

// Try a list of image URLs in small batches; returns the first successful URL or null
async function tryImagesInBatches(urls, batchSize = 6) {
  try {
    const list = Array.isArray(urls) ? urls : [];
    for (let i = 0; i < list.length; i += batchSize) {
      const slice = list.slice(i, i + batchSize);
      const results = await Promise.all(slice.map(u => preloadImage(u, { cacheBust: false })));
      const hit = results.find(Boolean);
      if (hit) return hit;
      // second attempt with cache-bust for this batch
      const resultsCb = await Promise.all(slice.map(u => preloadImage(u, { cacheBust: true })));
      const hitCb = resultsCb.find(Boolean);
      if (hitCb) return hitCb;
    }
  } catch {}
  return null;
}

// Schedule a function for idle time or fallback to setTimeout
function onIdle(fn, timeout = 1000) {
  try {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      return window.requestIdleCallback(fn, { timeout });
    }
  } catch {}
  return setTimeout(fn, timeout);
}

// Overrides disabled in simplified build; direct CDN probing only.

// (Removed remote overrides manifest; direct CDN probing only)

// Map WooCommerce product IDs to Bunny.net folder and zip file

// Display name overrides for specific products (e.g., SystemsPulse expansion)
// (Removed display name override indirection; using product.name directly.)
const PRODUCT_DISPLAY_NAME_OVERRIDES = {};

const BUNNY_DOWNLOADS = {
  33807: { // Okavango Delta
    displayName: 'Okavango Delta',
    folder: 'SCENERY-SWS-OkavangoDelta',
    zip: 'sws-scenery-okavangodelta.zip',
    altFolders: ['sws-scenery-okavangodelta','okavangodelta','okavango','delta'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/SCENERY-SWS-OkavangoDelta/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'SCENERY-SWS-OkavangoDelta',
        zip: 'sws-scenery-okavangodelta.zip',
        altFolders: ['sws-scenery-okavangodelta','okavangodelta','okavango','delta']
      }
    ]
  },
  33808: { // Kodiak 100 Series II (Wheels)
    displayName: 'Kodiak 100 Series II',
    folder: 'AIRCRAFT-SWS-Kodiak100',
    zip: 'sws-aircraft-kodiak-wheels.zip',
    altFolders: ['sws-aircraft-kodiak-wheels','sws-aircraft-kodiak100','kodiak100','sws-kodiak100','kodiak'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-Kodiak100/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-Kodiak100',
        zip: 'sws-aircraft-kodiak-wheels.zip',
        altFolders: ['sws-aircraft-kodiak-wheels','sws-aircraft-kodiak100','kodiak100','sws-kodiak100','kodiak']
      }
    ]
  },
  33810: { // Kodiak 100 Series III Amphibian
    displayName: 'Kodiak 100 Series III Amphibian',
    folder: 'AIRCRAFT-SWS-Kodiak100Amphibian',
    zip: 'sws-aircraft-kodiak-amphibian.zip',
    altFolders: ['sws-aircraft-kodiak-amphibian','sws-aircraft-kodiak100amphibian','kodiak100amphibian','kodiakamphibian'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-Kodiak100Amphibian/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-Kodiak100Amphibian',
        zip: 'sws-aircraft-kodiak-amphibian.zip',
        altFolders: ['sws-aircraft-kodiak-amphibian','sws-aircraft-kodiak100amphibian','kodiak100amphibian','kodiakamphibian']
      }
    ]
  },
  // Kodiak 2024-native entries
  54059: { // Kodiak 100 Wheels (MSFS 2024 native) — SKU: KODI-WHL-FS2024
    displayName: 'Kodiak 100 Series II',
    folder: 'AIRCRAFT-SWS-Kodiak100',
    zip: 'sws-aircraft-kodiak-wheels.zip',
    altFolders: ['sws-aircraft-kodiak-wheels','sws-aircraft-kodiak100','kodiak100','sws-kodiak100','kodiak'],
    compatibility: 'FS2024',
    thumbnail: 'https://sws-installer.b-cdn.net/2024/Public/AIRCRAFT-SWS-Kodiak100/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-Kodiak100',
        zip: 'sws-aircraft-kodiak-wheels.zip',
        altFolders: ['sws-aircraft-kodiak-wheels','sws-aircraft-kodiak100','kodiak100','sws-kodiak100','kodiak']
      }
    ]
  },
  54058: { // Kodiak 100 Amphibian (MSFS 2024 native) — SKU: KODI-AMPHIB-FS2024
    displayName: 'Kodiak 100 Series III Amphibian',
    folder: 'AIRCRAFT-SWS-Kodiak100Amphibian',
    zip: 'sws-aircraft-kodiak-amphibian.zip',
    altFolders: ['sws-aircraft-kodiak-amphibian','sws-aircraft-kodiak100amphibian','kodiak100amphibian','kodiakamphibian'],
    compatibility: 'FS2024',
    thumbnail: 'https://sws-installer.b-cdn.net/2024/Public/AIRCRAFT-SWS-Kodiak100Amphibian/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-Kodiak100Amphibian',
        zip: 'sws-aircraft-kodiak-amphibian.zip',
        altFolders: ['sws-aircraft-kodiak-amphibian','sws-aircraft-kodiak100amphibian','kodiak100amphibian','kodiakamphibian']
      }
    ]
  },
  33805: { // Maia - Vilar de Luz (LPVL)
    displayName: 'Maia - Vilar de Luz (LPVL)',
    folder: 'SCENERY-SWS-LPVLMaia',
    zip: 'SWS-airport-lpvl-maia-vilardaluz.zip',
    altFolders: ['sws-airport-lpvl-maia-vilardaluz','sws-airport-lpvl-maia','lpvl','lpvlmaia','maia'],
    type: 'Scenery',
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/SCENERY-SWS-LPVLMaia/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'SCENERY-SWS-LPVLMaia',
        zip: 'SWS-airport-lpvl-maia-vilardaluz.zip',
        altFolders: ['sws-airport-lpvl-maia-vilardaluz','sws-airport-lpvl-maia','lpvl','lpvlmaia','maia']
      }
    ]
  },
  33812: { // PC-12 Legacy
    displayName: 'PC-12 Legacy',
    folder: 'AIRCRAFT-SWS-PC12Legacy',
    zip: 'sws-aircraft-pc12.zip',
    altFolders: [
      'sws-aircraft-pc12','pc12','pc12legacy',
      // Additional normalization variants (with and without hyphen to catch Bunny renames)
      'sws-aircraft-pc-12','sws-aircraft-pc12-legacy','sws-aircraft-pc-12-legacy',
      // Known Beta alias folder on CDN (ensure both hyphenated and condensed forms)
      'sws-pc-12-47', 'sws-pc12','sws-pc12-47','sws-pc12beta','sws-pc-12beta'
      // Note: component-specific folder names intentionally excluded here; they live in components[].altFolders.
      // Including them here causes cdnBaseFolderCandidates to probe variant manifests for the base version,
      // which can return a higher component version and trigger a false "update available" pill.
    ],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-PC12Legacy/Thumbnail.jpg',
    components: [
      { label:'Base', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12.zip', altFolders:['sws-aircraft-pc12','pc12','pc12legacy'] },
      { label:'GNS + Sky4Sim', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12-gns-sky4sim.zip', altFolders:['sws-aircraft-pc12-gns-sky4sim'] },
      { label:'PMS50', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12-pmsgtn.zip', altFolders:['sws-aircraft-pc12-pmsgtn'] },
      { label:'PMS50 + Sky4Sim', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12-pmsgtn-sky4sim.zip', altFolders:['sws-aircraft-pc12-pmsgtn-sky4sim'] },
      { label:'TDS', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12-tdsgtn.zip', altFolders:['sws-aircraft-pc12-tdsgtn'] },
      { label:'TDS + Sky4Sim', folder:'AIRCRAFT-SWS-PC12Legacy', zip:'sws-aircraft-pc12-tdsgtn-sky4sim.zip', altFolders:['sws-aircraft-pc12-tdsgtn-sky4sim'] }
    ]
  },
  33811: { // RV-10
    displayName: 'RV-10',
    folder: 'AIRCRAFT-SWS-RV10',
    zip: 'sws-aircraft-vansrv10.zip',
    altFolders: ['sws-aircraft-vansrv10','vansrv10','rv10','sws-rv10'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-RV10/Thumbnail.jpg',
    components: [
      { label:'Base', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10.zip', altFolders:['sws-aircraft-vansrv10','vansrv10','rv10'] },
      { label:'PMS50', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10-pmsgtn.zip', altFolders:['sws-aircraft-vansrv10-pmsgtn'] },
      { label:'PMS50 + Sky4Sim', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10-pmsgtns4s.zip', altFolders:['sws-aircraft-vansrv10-pmsgtns4s'] },
      { label:'Sky4Sim', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10-sky4sim.zip', altFolders:['sws-aircraft-vansrv10-sky4sim'] },
      { label:'TDS', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10-tdsgtnxi.zip', altFolders:['sws-aircraft-vansrv10-tdsgtnxi'] },
      { label:'TDS + Sky4Sim', folder:'AIRCRAFT-SWS-RV10', zip:'sws-aircraft-vansrv10-tdsgtnxis4s.zip', altFolders:['sws-aircraft-vansrv10-tdsgtnxis4s'] }
    ]
  },
  33809: { // RV-14
    displayName: 'RV-14',
    folder: 'AIRCRAFT-SWS-RV14',
    zip: 'sws-aircraft-vansrv14.zip',
    altFolders: ['sws-aircraft-vansrv14','vansrv14','rv14','sws-rv14'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-RV14/Thumbnail.jpg',
    components: [
      { label:'Base', folder:'AIRCRAFT-SWS-RV14', zip:'sws-aircraft-vansrv14.zip', altFolders:['sws-aircraft-vansrv14','vansrv14','rv14'] },
      { label:'PMS50', folder:'AIRCRAFT-SWS-RV14', zip:'sws-aircraft-vansrv14-pmsgtn.zip', altFolders:['sws-aircraft-vansrv14-pmsgtn'] },
      { label:'TDS', folder:'AIRCRAFT-SWS-RV14', zip:'sws-aircraft-vansrv14-tdsgtnxi.zip', altFolders:['sws-aircraft-vansrv14-tdsgtnxi'] }
    ]
  },
  33813: { // RV-8
    displayName: 'RV-8',
    folder: 'AIRCRAFT-SWS-RV8',
    zip: 'sws-aircraft-vansrv8.zip',
    altFolders: ['sws-aircraft-vansrv8','vansrv8','rv8','sws-rv8'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-RV8/Thumbnail.jpg',
    components: [
      { label:'Base', folder:'AIRCRAFT-SWS-RV8', zip:'sws-aircraft-vansrv8.zip', altFolders:['sws-aircraft-vansrv8','vansrv8','rv8'] },
      { label:'PMS50', folder:'AIRCRAFT-SWS-RV8', zip:'sws-aircraft-vansrv8-pmsgtn.zip', altFolders:['sws-aircraft-vansrv8-pmsgtn'] },
      { label:'TDS', folder:'AIRCRAFT-SWS-RV8', zip:'sws-aircraft-vansrv8-tdsgtnxi.zip', altFolders:['sws-aircraft-vansrv8-tdsgtnxi'] }
    ]
  },
  33806: { // Zenith CH701 STOL
    displayName: 'Zenith CH701 STOL',
    folder: 'AIRCRAFT-SWS-Zenith701',
    zip: 'sws-aircraft-zenith701-wheels.zip',
    altFolders: ['sws-aircraft-zenith701-wheels','sws-aircraft-zenith701','zenith701','zenith'],
    compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-Zenith701/Thumbnail.jpg',
    components: [
      { label:'Base', folder:'AIRCRAFT-SWS-Zenith701', zip:'sws-aircraft-zenith701-wheels.zip', altFolders:['sws-aircraft-zenith701-wheels','sws-aircraft-zenith701','zenith701','zenith'] }
    ]
  }
  ,
  2157: { // GA8 Airvan (Legacy MSFS 2020 product) – treated as a distinct product (no alias)
    displayName: 'GA8 Airvan',
    // NOTE: Shares the same folder/zip names as 52157. This means install detection will mark both as installed
    // if one is present. If you want to avoid that, differentiate packaging (folder or zip) for one of them.
    folder: 'AIRCRAFT-SWS-GA8Airvan',
    zip: 'sws-aircraft-airvan.zip',
    altFolders: [
      'sws-aircraft-airvan',
      'ga8airvan',
      'ga8-airvan',
      'airvan',
      'ga8'
    ],
    compatibility: 'FS2020',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-GA8Airvan/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-GA8Airvan',
        zip: 'sws-aircraft-airvan.zip',
        altFolders: ['sws-aircraft-airvan','ga8airvan','ga8-airvan','airvan','ga8']
      }
    ]
  }
  ,
  // Canonical WooCommerce product id for GA8 Airvan base
  52157: { // GA8 Airvan (Base - Unified MSFS 2020+ build)
    displayName: 'GA8 Airvan',
    folder: 'AIRCRAFT-SWS-GA8Airvan',
    zip: 'sws-aircraft-airvan.zip',
    altFolders: [
      'sws-aircraft-airvan',
      'ga8airvan',
      'ga8-airvan',
      'airvan',
      'ga8'
    ],
  // Unified package usable in MSFS 2020 and forward ("2020+") while 53069 is a distinct 2024-native product
  compatibility: 'FS2020+',
    thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-GA8Airvan/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-GA8Airvan',
        zip: 'sws-aircraft-airvan.zip',
        altFolders: ['sws-aircraft-airvan','ga8airvan','ga8-airvan','airvan','ga8']
      }
    ]
  }
  ,
  53069: { // GA8 Airvan (MSFS 2024 build)
    displayName: 'GA8 Airvan',
    // Distinct 2024-native package. If the ZIP/folder names differ for 2024, adjust below.
    folder: 'AIRCRAFT-SWS-GA8Airvan',
    zip: 'sws-aircraft-airvan.zip',
    altFolders: [
      'sws-aircraft-airvan',
      'ga8airvan',
      'ga8-airvan',
      'airvan',
      'ga8'
    ],
    compatibility: 'FS2024',
    thumbnail: 'https://sws-installer.b-cdn.net/2024/Public/AIRCRAFT-SWS-GA8Airvan/Thumbnail.jpg',
    components: [
      {
        label: 'Base',
        folder: 'AIRCRAFT-SWS-GA8Airvan',
        zip: 'sws-aircraft-airvan.zip',
        altFolders: ['sws-aircraft-airvan','ga8airvan','ga8-airvan','airvan','ga8']
      }
    ]
  }
  ,
  54056: { // GA8 Airvan SystemsPulse expansion (MSFS 2024 native) — SKU: GA8-FS2024-SYSTEMSPULSE
    displayName: 'GA8 Airvan SystemsPulse',
    folder: 'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
    zip: 'sws-aircraft-airvan-systemspulse.zip',
    altFolders: [
      'sws-aircraft-airvan-systemspulse',
      'systemspulse',
      'systems-pulse',
      'airvansystemspulse',
      'ga8airvansystemspulse',
      'ga8-airvan-systemspulse'
    ],
    compatibility: 'FS2024',
    thumbnail: 'https://sws-installer.b-cdn.net/2024/Public/AIRCRAFT-SWS-GA8Airvan/Thumbnail.jpg',
    components: [
      {
        label: 'SystemsPulse',
        folder: 'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
        zip: 'sws-aircraft-airvan-systemspulse.zip',
        altFolders: [
          'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
          'sws-aircraft-airvan-systemspulse',
          'systemspulse',
          'systems-pulse'
        ]
      }
    ]
  }
  ,
  52385: { // GA8 Airvan SystemsPulse expansion (MSFS 2020+)
    displayName: 'GA8 Airvan SystemsPulse',
    folder: 'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
    zip: 'sws-aircraft-airvan-systemspulse.zip',
    altFolders: [
      'sws-aircraft-airvan-systemspulse',
      'systemspulse',
      'systems-pulse',
      // NOTE: removed generic 'pulse' to avoid false-positive matches with other products
      'airvansystemspulse',
      'ga8airvansystemspulse',
      'ga8-airvan-systemspulse'
    ],
  compatibility: 'FS2020+',
  thumbnail: 'https://sws-installer.b-cdn.net/2020/Public/AIRCRAFT-SWS-GA8Airvan/Thumbnail.jpg',
    components: [
      {
        label: 'SystemsPulse',
        // Use the actual expansion folder; include base Airvan as an alternate via altFolders for detection
        folder: 'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
        zip: 'sws-aircraft-airvan-systemspulse.zip',
        altFolders: [
          'AIRCRAFT-SWS-GA8AirvanSystemsPulse',
          'sws-aircraft-airvan-systemspulse',
          'systemspulse',
          'systems-pulse',
          // Removed generic 'pulse' and base folder to prevent base GA8 installs being misclassified as SystemsPulse component.
          // 'AIRCRAFT-SWS-GA8Airvan' caused channel cache mixing (Public/Beta) between base and expansion.
        ]
      }
    ]
  }
};

const BUNNY_ALIAS_TO_CANON = new Map();
const BUNNY_CANON_TO_ALIASES = new Map();

for (const [id, info] of Object.entries(BUNNY_DOWNLOADS)) {
  const key = String(id);
  if (!BUNNY_CANON_TO_ALIASES.has(key)) {
    BUNNY_CANON_TO_ALIASES.set(key, new Set());
  }
  if (info && Object.prototype.hasOwnProperty.call(info, 'aliasOf')) {
    const canonKey = String(info.aliasOf);
    BUNNY_ALIAS_TO_CANON.set(key, canonKey);
    if (!BUNNY_CANON_TO_ALIASES.has(canonKey)) {
      BUNNY_CANON_TO_ALIASES.set(canonKey, new Set());
    }
    BUNNY_CANON_TO_ALIASES.get(canonKey).add(key);
  }
}

function canonicalProductIdFor(productId) {
  try {
    let current = productId;
    const seen = new Set();
    while (current != null) {
      const key = String(current);
      if (!key || seen.has(key)) break;
      seen.add(key);
      const next = BUNNY_ALIAS_TO_CANON.get(key);
      if (next == null) break;
      current = next;
    }
    return current != null ? current : productId;
  } catch {
    return productId;
  }
}

function collectAliasCandidates(productId, extraAliasIds = [], aliasOf = null) {
  const out = [];
  const push = (value) => {
    const key = String(value);
    if (!key || key === 'undefined' || key === 'null') return;
    if (!out.includes(key)) out.push(key);
  };
  if (productId != null) push(productId);
  const canonical = aliasOf != null ? aliasOf : canonicalProductIdFor(productId);
  if (canonical != null) push(canonical);
  const canonKey = String(canonical);
  const aliasSet = BUNNY_CANON_TO_ALIASES.get(canonKey);
  if (aliasSet) aliasSet.forEach(push);
  if (Array.isArray(extraAliasIds)) extraAliasIds.forEach(push);
  return out;
}
function waitForElectronBridge(timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      if (window.electron && typeof window.electron.selectFolder === 'function') return resolve();
      if (Date.now() - start > timeout) return reject(new Error('Electron bridge not available'));
      setTimeout(check, 50);
    }
    check();
  });
}

// Helper: encode each path segment but keep folder slashes
function encodePathSegments(p) {
  return String(p || '').split('/').map(encodeURIComponent).join('/');
}

// Generate additional folder name variants to match CDN naming (hyphens, sws- prefix, etc)
function expandFolderVariants(name) {
  const out = new Set();
  const base = String(name || '').trim();
  if (!base) return [];
  out.add(base);
  // Only add the exact lowercase form as the single fallback variant
  const lower = base.toLowerCase();
  if (lower !== base) out.add(lower);
  return Array.from(out);
}

// Helper to extract thumbnail from zip and return a data URL
async function getThumbnailFromZip(zipUrl) {
  try {
    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error('Failed to fetch zip');
    const arrayBuffer = await response.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    const allFiles = Object.keys(zip.files);

    // Find any file named 'thumbnail.jpg', 'thumbnail.jpeg', or 'thumbnail.png' at any depth
    let thumbFile = allFiles.find(f => {
      const fileName = f.split('/').pop().toLowerCase();
  return (
        fileName.startsWith('thumbnail') && (
          fileName.endsWith('.jpg') ||
          fileName.endsWith('.jpeg') ||
          fileName.endsWith('.png')
        )
      );
    }) || allFiles.find(f => {
      const fileName = f.split('/').pop().toLowerCase();
      return (
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.jpeg') ||
        fileName.endsWith('.png')
      );
    });

    if (!thumbFile) throw new Error('No image thumbnail found in zip');
    const blob = await zip.file(thumbFile).async('blob');
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// Optional debug logger: set localStorage['sws_debug_bunny']='1' to enable
// Debug helper with URL redaction to avoid exposing CDN origins
function dbg(...args) {
  try {
    if (localStorage.getItem('sws_debug_bunny') === '1') {
      const redact = (v) => {
        if (typeof v === 'string') return v.replace(/https?:\/\/[^\s)"']+/g, '[REDACTED]');
        if (Array.isArray(v)) return v.map(redact);
        if (v && typeof v === 'object') {
          const out = Array.isArray(v) ? [] : {};
          for (const k of Object.keys(v)) out[k] = redact(v[k]);
          return out;
        }
        return v;
      };
      const masked = args.map(redact);
      console.debug('[BUNNY]', ...masked);
    }
  } catch {}
}

const BANNER_IMAGE = heroImg;

// Safety defaults to avoid ReferenceError in any path that accidentally touches these before
// the component-scoped values are initialized. Component scope will shadow these.
const expectedZip2020 = '';
const expectedZip2024 = '';

// Compact a long filesystem path for display in settings without losing start/end context
function prettyPath(p, maxLen = 80) {
  try {
    const s = String(p || '');
    if (!s) return '';
    if (s.length <= maxLen) return s;
    const sep = s.includes('\\') ? '\\' : '/';
    const parts = s.split(sep);
    if (parts.length >= 3) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      const mid = `${first}${sep}...${sep}${last}`;
      if (mid.length <= maxLen) return mid;
    }
    const keep = Math.max(10, Math.floor((maxLen - 3) / 2));
    return s.slice(0, keep) + '...' + s.slice(-keep);
  } catch {
    return String(p || '');
  }
}

function InstalledAircraftThumbnail({ aircraft }) {
  const [thumb, setThumb] = useState(null);

  useEffect(() => {
    if (aircraft.thumbnail) {
      setThumb(aircraft.thumbnail);
    } else {
      setThumb(null);
    }
  }, [aircraft]);

  return (
    <img
      src={
        thumb || 'data:image/svg+xml;utf8,' +
        encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"><rect width="160" height="120" rx="12" fill="#23272b"/><text x="80" y="70" text-anchor="middle" font-size="32" fill="#90caf9" font-family="Segoe UI,Arial">✈</text></svg>')
      }
      alt="thumbnail"
      style={{ width: '100%', height: 'auto', borderRadius: 0, objectFit: 'cover' }}
      onError={() => setThumb(null)}
    />
  );
}

function OwnedAircraftCard({
  product,
  aircraftList,
  downloadingId,
  activeDlSimProp,
  activeInstallSimProp,
  installingId,
  installPath2020,
  installPath2024,
  handleInstall,
  handleDownload,
  handleCancelDownload,
  handleUninstall,
  downloadedFiles,
  isBetaTester,
  onStatus,
  setDownloadedFiles, // <-- add this
  setChangelogModal,  // <-- new: to open the changelog modal
  // Injected setters from App for immediate UI updates before downloads begin
  setDownloadingId,
  setProgress,
  setDownloadProgress,
  downloadProgress,
  // App-level batch helpers for aggregated progress
  beginBatch,
  advanceBatch,
  endBatch,
  cancelRef,
  setOwnedAircraft,
  setDownloadQueueInfo,
  enqueueDownload,
  dequeueDownload,
  pendingDownloadQueue,
  processNextDownloadRef,
  refreshTick
}) {
  // Local debug convenience flag (mirrors global/window debug)
  const DEBUG_LOCAL = (() => {
    try { return !!(window?.SWS_DEBUG || window?.__SWS_DEBUG_GLOBAL); } catch { return false; }
  })();
  // Per-sim channel selection defaults
  const [selectedChannelBySim, setSelectedChannelBySim] = useState(() => {
    try {
      const pid = String(product?.id || product?.bunny?.folder || '');
      const readChan = (sim) => {
        try {
          if (pid) {
            const v = localStorage.getItem(`sws_chan_${pid}_FS${sim}`) || '';
            if (v) return /beta/i.test(v) ? 'Beta' : 'Public';
          }
          const g = localStorage.getItem(`sws_chan_global_FS${sim}`) || '';
          if (g) return /beta/i.test(g) ? 'Beta' : 'Public';
        } catch {}
        return 'Public';
      };
      return { FS2020: readChan('2020'), FS2024: readChan('2024') };
    } catch { return { FS2020: 'Public', FS2024: 'Public' }; }
  });

  // Helper: return the currently selected channel for a simTag ('FS2020' | 'FS2024').
  // Normalizes any stored value to exactly 'Public' or 'Beta'.
  const getChan = useCallback((simTag) => {
    try {
      const raw = selectedChannelBySim?.[simTag] || 'Public';
      return /beta/i.test(raw) ? 'Beta' : 'Public';
    } catch { return 'Public'; }
  }, [selectedChannelBySim]);

  // Listen for queued download trigger from the App-level multi-product queue
  const queuedDownloadRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e?.detail;
        if (detail && detail.productId === product?.id) {
          queuedDownloadRef.current = detail;
          // Small delay to let previous download state fully clear
          setTimeout(async () => {
            try {
              const d = queuedDownloadRef.current;
              if (!d) return; // dequeued before timeout fired
              queuedDownloadRef.current = null;
              // Trigger the download flow directly (skip EULA/beta checks for queued items)
              await downloadAllForSimRef.current?.(d.simTag, d.channel);
            } catch {}
          }, 300);
        }
      } catch {}
    };
    window.addEventListener('sws-queue-download', handler);
    return () => window.removeEventListener('sws-queue-download', handler);
  }, [product?.id]);
  // Listen for dequeue events to cancel pending queued download
  useEffect(() => {
    const handler = (e) => {
      try {
        if (e?.detail?.productId === product?.id) { queuedDownloadRef.current = null; }
      } catch {}
    };
    window.addEventListener('sws-queue-dequeue', handler);
    return () => window.removeEventListener('sws-queue-dequeue', handler);
  }, [product?.id]);
  // Ref to hold the latest downloadAllForSim so the queue handler can call it
  const downloadAllForSimRef = useRef(null);

  // Read a warmed version directly from the global preheater cache (no state dependency)
  // Note: declared early so downstream computed labels can safely call it during initial render
  const getWarmVersion = useCallback((simTag, channel) => {
    try {
      const key = `${product?.id || 'x'}:${simTag}:${channel}`;
      const warm = window.__swsVersionWarmCache || {};
      const v = warm[key] || '';
      return typeof v === 'string' ? v : '';
    } catch { return ''; }
  }, [product?.id]);

  // Channel setter with force refresh of metadata (Beta always fresh)
  const setChannelForSim = useCallback((simTag, newChan) => {
    setSelectedChannelBySim(prev => {
      if ((prev?.[simTag] || 'Public') === newChan) return prev;
      // For 2020+ unified products, keep both sim channels in sync to avoid mismatched labels/versions
      const next = is2020Plus
        ? { FS2020: newChan, FS2024: newChan }
        : { ...prev, [simTag]: newChan };
      try {
        const pid = String(product?.id || product?.bunny?.folder || '');
        if (pid) {
          if (is2020Plus) {
            localStorage.setItem(`sws_chan_${pid}_FS2020`, newChan);
            localStorage.setItem(`sws_chan_${pid}_FS2024`, newChan);
          } else {
            localStorage.setItem(`sws_chan_${pid}_FS${simTag.replace('FS','')}`, newChan);
          }
        }
        if (is2020Plus) {
          localStorage.setItem(`sws_chan_global_FS2020`, newChan);
          localStorage.setItem(`sws_chan_global_FS2024`, newChan);
        } else {
          localStorage.setItem(`sws_chan_global_FS${simTag.replace('FS','')}`, newChan);
        }
      } catch {}
      queueMicrotask(async () => {
        try {
          const simKey = simTag.replace('FS','');
          if (/beta/i.test(newChan)) invalidateBetaRelatedCaches();
          await fetchManifestZipHints(product, simKey, newChan, { forceFresh: true }).catch(()=>{});
          // Force immediate version fetch for both sims for this channel to avoid repeated toggling.
          try {
            const forceOpts = /beta/i.test(newChan) ? { exactChannel: true, forceFresh: true } : { exactChannel: false, forceFresh: true };
            const [v20, v24] = await Promise.all([
              fetchManifestVersion('FS2020', newChan === 'Beta' ? 'Beta' : 'Public', forceOpts),
              fetchManifestVersion('FS2024', newChan === 'Beta' ? 'Beta' : 'Public', forceOpts)
            ]);
            if (/beta/i.test(newChan)) {
              setRemoteVersBeta(prev => ({
                FS2020: pickMaxVer(prev.FS2020, v20),
                FS2024: pickMaxVer(prev.FS2024, v24)
              }));
            } else {
              setRemoteVersPublic(prev => ({
                FS2020: pickMaxVer(prev.FS2020, v20),
                FS2024: pickMaxVer(prev.FS2024, v24)
              }));
            }
          } catch {}
        } catch {}
      });
      return next;
    });
  }, [product]);
  // Visual tick to force re-render of action buttons / outline colors when channel changes
  const [channelVisualTick, setChannelVisualTick] = useState(0);
  // Force a lightweight version of download button state to refresh when channel changes (even if cache objects still present)
  const channelBumpRef = useRef(0);
  // Product-level Beta acknowledgement and toggle helpers
  const betaAckKey = React.useMemo(() => {
    try {
      const pid = (product?.id != null && String(product.id).trim()) || '';
      const folder = (product?.bunny?.folder != null && String(product.bunny.folder).trim()) || '';
      let base = pid || folder;
      if (!base) {
        const pname = (product?.name != null && String(product.name).trim()) || '';
        if (pname) base = pname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }
      if (!base) base = 'unknown';
      return `sws_betaAck_${base}`;
    } catch {
      return 'sws_betaAck_unknown';
    }
  }, [product?.id, product?.bunny?.folder, product?.name]);
  // Guard to prevent double Beta warning when immediately followed by gated flows
  const betaAckRecentRef = useRef(0);
  const ensureBetaAck = useCallback(() => {
    try {
      if (localStorage.getItem(betaAckKey) === '1') return true;
      const ok = window.confirm('IMPORTANT BETA SOFTWARE NOTICE AND ACKNOWLEDGEMENT\n\nBeta builds are pre-release, experimental software intended for testing purposes only. They may be unstable, contain bugs, errors, and/or incomplete features, and may cause crashes, loss of functionality, degraded performance, incompatibility with other add-ons or software, corruption or loss of settings, profiles, or saved data, and other issues that may negatively affect your simulator installation or broader system environment.\n\nYou should install and use beta builds only if you understand and accept these risks. Before proceeding, you should back up any important files, settings, profiles, and saved data.\n\nBy choosing to install or use a beta build, you do so voluntarily and at your own risk. The beta software is provided by SimWorks Studios Ltd ("SWS") on an "as is" and "as available" basis, without warranties of any kind.\n\nProceed to use the Beta channel?');
      if (ok) localStorage.setItem(betaAckKey, '1');
      return ok;
    } catch { return true; }
  }, [betaAckKey]);

  // Async UI-based Beta ack; uses modal instead of confirm for guaranteed visibility
  const ensureBetaAckUI = useCallback(async () => {
    try {
      // Respect persisted acknowledgement: only show once per product unless user clears storage/debug.
      if (localStorage.getItem(betaAckKey) === '1') return true;
      // Throttle duplicate invocations within a short window
      if (Date.now() - (betaAckRecentRef.current || 0) < 1500) return true;
      betaAckRecentRef.current = Date.now();
      try { onStatus?.('Opening Beta warning modal'); } catch {}
      const accepted = await new Promise(resolve => {
        setBetaModal({
          open: true,
          onAccept: () => { resolve(true); },
          onCancel: () => { resolve(false); }
        });
      });
      setBetaModal({ open: false, onAccept: null, onCancel: null });
      if (accepted) {
        try { localStorage.setItem(betaAckKey, '1'); } catch {}
        return true;
      }
      return false;
    } catch {
      // Fallback to native confirm if modal rendering fails
      try {
        if (localStorage.getItem(betaAckKey) === '1') return true;
        const ok = window.confirm('IMPORTANT BETA SOFTWARE NOTICE AND ACKNOWLEDGEMENT\n\nBeta builds are pre-release, experimental software intended for testing purposes only. They may be unstable, contain bugs, errors, and/or incomplete features, and may cause crashes, loss of functionality, degraded performance, incompatibility with other add-ons or software, corruption or loss of settings, profiles, or saved data, and other issues that may negatively affect your simulator installation or broader system environment.\n\nYou should install and use beta builds only if you understand and accept these risks. Before proceeding, you should back up any important files, settings, profiles, and saved data.\n\nBy choosing to install or use a beta build, you do so voluntarily and at your own risk. The beta software is provided by SimWorks Studios Ltd ("SWS") on an "as is" and "as available" basis, without warranties of any kind.\n\nProceed to use the Beta channel?');
        if (ok) { try { localStorage.setItem(betaAckKey, '1'); } catch {} }
        return ok;
      } catch {
        // If even confirm fails, deny by default to be safe
        return false;
      }
    }
  }, [betaAckKey]);
    const [selectedComponents, setSelectedComponents] = useState(['']);
  const THUMB_PLACEHOLDER = null;
  const thumbMemCacheRef = useRef(new Map()); // key -> url/dataURL
  const [previewThumb, setPreviewThumb] = useState(null);
  // Bump key to force thumbnail effect to re-run (e.g., after cache purge)
  const [thumbRefreshKey, setThumbRefreshKey] = useState(0);
    // Download selection now opens a focus-trapped modal instead of a dropdown
    const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [updateMode, setUpdateMode] = useState(false);
    // forceUpdate is a debug-only test flag. Keep local state for quick toggles, but also
    // honor the persisted localStorage switch so testing still works if card state desyncs.
    const [forceUpdate, setForceUpdate] = useState(false);
    const forceUpdateActive = forceUpdate || (() => {
      try { return localStorage.getItem('sws_forceUpdate') === '1'; } catch { return false; }
    })();

    useEffect(() => {
      const onKey = (e) => {
        try {
          const key = String(e.key || '').toLowerCase();
          if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'u') {
            const next = !forceUpdateActive;
            setForceUpdate(next);
            try { localStorage.setItem('sws_forceUpdate', next ? '1' : '0'); } catch {}
            onStatus?.(next ? 'Forced update: ON' : 'Forced update: OFF');
          }
          // Debug: force-open Beta warning modal
          if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'b') {
            e.preventDefault();
            e.stopPropagation();
            onStatus?.('Debug: Forcing Beta warning modal');
            // Ensure fresh open even if already open
            setBetaModal({ open:false, onAccept:null, onCancel:null });
            setTimeout(() => {
              setBetaModal({
                open: true,
                onAccept: () => { try { localStorage.setItem(betaAckKey, '1'); } catch {}; onStatus?.('Debug: Beta accepted via hotkey'); },
                onCancel: () => { onStatus?.('Debug: Beta canceled via hotkey'); }
              });
            }, 0);
          }
          // Debug: force-open EULA modal
          if ((e.ctrlKey || e.metaKey) && e.altKey && key === 'e') {
            e.preventDefault();
            e.stopPropagation();
            onStatus?.('Debug: Forcing EULA modal');
            const tag = unifiedSimTag;
            const chan = getChan(tag) || 'Public';
            // Ensure fresh open even if already open
            setEulaModal({ open:false, simTag:null, channel:'Public' });
            setTimeout(() => setEulaModal({ open:true, simTag: tag, channel: chan }), 0);
          }
          // Debug: clear EULA + Beta acknowledgements
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'l') {
            e.preventDefault();
            e.stopPropagation();
            try {
              const keys = Object.keys(localStorage || {});
              let removed = 0;
              keys.forEach(k => {
                if (k === 'sws_eula_accepted_v1' || k.startsWith('sws_betaAck_')) {
                  localStorage.removeItem(k);
                  removed++;
                }
              });
              onStatus?.(`Debug: Cleared ${removed} EULA/Beta ack keys`);
              // Also reset in-memory EULA acceptance so flows re-gate without reload
              try { setEulaAccepted(false); } catch {}
              // Close any open gating modals for a clean slate
              try { setBetaModal({ open:false, onAccept:null, onCancel:null }); } catch {}
              try { setEulaModal({ open:false, simTag:null, channel:'Public' }); } catch {}
            } catch {
              onStatus?.('Debug: Failed to clear EULA/Beta ack keys');
            }
          }
        } catch {}
      };
      // Use capture phase to avoid being blocked by other key handlers (focus traps, etc.)
      window.addEventListener('keydown', onKey, true);
      return () => window.removeEventListener('keydown', onKey, true);
    }, [forceUpdateActive, onStatus, betaAckKey, unifiedSimTag, getChan]);
    const downloadModalRef = useRef(null);
    const prevFocusRef = useRef(null);
  const [showVariantModal, setShowVariantModal] = useState(false);
  // New: install-time variant chooser (when multiple variants are cached)
  const [showInstallVariantModal, setShowInstallVariantModal] = useState(false);
  const [pendingSimForInstall, setPendingSimForInstall] = useState(null);
  const [installVariantChoice, setInstallVariantChoice] = useState('');
  // Snapshot of cached variant entries captured when the install-variant modal opens.
  // The Install handler uses this directly instead of re-deriving from (possibly stale) dl state.
  const installVariantSnapshotRef = useRef({});
  // Pending channel-switch: when download completes, auto-uninstall old channel and install new
  const pendingChannelSwitchRef = useRef(null); // { simTag, channel, oldChannel }
  const [pendingSimForDownload, setPendingSimForDownload] = useState(null);
  const [variantChoice, setVariantChoice] = useState('');
  // card-local cancel was replaced by appCancelRef; keep a stub if needed
    const cancelRequestedRef = cancelRef || useRef(false);
  // Per-sim suppression of READY after cancel
  const [suppressReadyBySim, setSuppressReadyBySim] = useState({ FS2020: false, FS2024: false });
  // Modify dropdown
  const [showModifyMenu, setShowModifyMenu] = useState(false);
  // Track which sim's modify menu is open ('FS2020'|'FS2024'|null)
  const [showModifyMenuSim, setShowModifyMenuSim] = useState(null);

  // Focus trap for the download modal
  useEffect(() => {
    if (!showDownloadModal) return;
    prevFocusRef.current = document.activeElement;
    const modalEl = downloadModalRef.current;
    if (!modalEl) return;
    const selectable = modalEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (selectable.length) {
      const first = selectable[0];
      try { first.focus(); } catch {}
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowDownloadModal(false);
        return;
      }
      if (e.key === 'Tab') {
        const nodes = Array.from(selectable);
        if (!nodes.length) return;
        const idx = nodes.indexOf(document.activeElement);
        if (e.shiftKey) {
          if (idx <= 0) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
        } else {
          if (idx === nodes.length - 1) { e.preventDefault(); nodes[0].focus(); }
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      try { prevFocusRef.current && prevFocusRef.current.focus && prevFocusRef.current.focus(); } catch {}
    };
  }, [showDownloadModal]);

  // Channel selection is controlled by visible UI; no auto-flip
  // (CDN will enforce Beta access if user lacks permissions)

  // Components / variants
  const components = product?.bunny?.components || product.components || [];
  useEffect(() => {
    if (!components.length) { setSelectedComponents([]); return; }
    setSelectedComponents(prev => {
      if (prev && prev.length) {
        const key = prev[0];
        const stillValid = components.some(c => c.zip === key);
        if (stillValid) return prev; // keep user's choice
      }
      const first = components[0];
      return [first.zip || ''];
    });
    // sync modal choice
    setVariantChoice(v => v || (components[0]?.zip || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components]);

  const currentComponent = (() => {
  if (!components.length) return null;
    const key = selectedComponents[0];
    return components.find(c => c.zip === key) || components[0] || null;
  })();
  const currentVariantZip = currentComponent?.zip || product?.bunny?.zip || '';
  // Expected variant ZIP names per sim for the currently selected component
  const expectedZip2020 = React.useMemo(() => {
  return currentComponent ? getVariantZipForSim(currentComponent, product, '2020') || '' : '';
  }, [currentComponent, product]);
  const expectedZip2024 = React.useMemo(() => {
  return currentComponent ? getVariantZipForSim(currentComponent, product, '2024') || '' : '';
  }, [currentComponent, product]);

  // Define expected zips per sim for the currently selected variant

  // Compatibility flags for FS2020/FS2024, derived from product.compatibility
  // Supported values examples: 'FS2020', 'FS2024', 'FS2020+FS2024', 'FS2020+' (treat as both)
  const compatStr = String(product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024').toUpperCase();
  const compat = product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024';
  const hasPlus2020 = /FS2020\+/.test(compatStr);
  const can2020 = /2020/.test(compatStr);
  const can2024 = /2024/.test(compatStr) || hasPlus2020;
  // 2020+ logic originally unified installs across 2020 & 2024. User requested reverting so it does NOT auto-install to both.
  // We keep detection of "2020+" for labeling, but allow disabling unified behavior globally or per product.
  const baseIs2020Plus = hasPlus2020 || (can2020 && can2024);
  let disable2020Plus = false;
  try {
    // Global debug/override flag
    disable2020Plus = localStorage.getItem('sws_disable2020Plus') === '1';
  } catch {}
  // Hard-coded per-product disable list (add IDs here if we want separate installs even if "2020+" asset)
  const DISABLE_2020PLUS_PRODUCTS = new Set([
    // (empty) Previously contained 33812 (PC-12); re-enabled 2020+ asset behavior while keeping per-sim choice UI.
  ]);
  // Optionally allow UI force-disable via folder pattern if desired (currently disabled)
  // if (!disable2020Plus && product?.bunny?.folder && /pc[-_]?12/i.test(product.bunny.folder)) {
  //   DISABLE_2020PLUS_PRODUCTS.add(Number(product?.id));
  // }
  const is2020Plus = baseIs2020Plus && !disable2020Plus && !DISABLE_2020PLUS_PRODUCTS.has(Number(product?.id));
  // Show sim choice ONLY when the product truly ships distinct FS2020 and FS2024 packages.
  // For 2020+ unified packages (single archive works in both) we keep the previous behavior: one unified download button.
  const showBothSimOptions = (can2020 && can2024 && !is2020Plus);
  // unifiedSimTag only used when showing a single combined download button (2020+ mode)
  const unifiedSimTag = (is2020Plus ? 'FS2020' : (can2020 ? 'FS2020' : 'FS2024'));

  // Build all candidate folder names for this product (base + alts + component folders/alts + zip bases)
  const productFolder = product?.bunny?.folder || '';
  const altBase = product?.bunny?.altFolders || [];
  const compFolders = (product?.bunny?.components || product.components || []).map(c => c.folder).filter(Boolean);
  const compAlt = (product?.bunny?.components || product.components || []).flatMap(c => c.altFolders || []);
  const baseZip = (product?.bunny?.zip || '').replace(/\.zip$/i, '');
  const compZipBases = (product?.bunny?.components || product.components || [])
    .map(c => (c.zip || '').replace(/\.zip$/i, ''))
    .filter(Boolean);

  const productNameSimple = simple(product?.name || '');

  const candidateList = [
    productFolder,
    baseZip,
    productNameSimple,         // NEW: allow matching by product name
    ...altBase,
    ...compFolders,
    ...compAlt,
    ...compZipBases
  ]
    .filter(Boolean)
    .map(simple);

  const findInstalled = (path) => {
    if (!path) return null;
    return (aircraftList || []).find(a => {
      if (!a || normalizePath(a.communityPath) !== normalizePath(path)) return false;
      return matchesItemToProduct(a, product);
    }) || null;
  };

  // Prefer the installed item whose folder matches the expected variant, else best match with a version
  function findInstalledFor(path, expectedZipBase) {
    if (!path) return null;
    const exp = String(expectedZipBase || '').toLowerCase();
    const canonicalFolder = String(product?.bunny?.folder || '').toLowerCase();
    const pathN = normalizePath(path);
    const inThisPath = (aircraftList || []).filter(a => {
      if (!a || normalizePath(a.communityPath) !== pathN) return false;
      if (matchesItemToProduct(a, product)) return true;
      // Also include items whose folder matches the product's expected base folder name (even without ID)
      if (canonicalFolder && String(a.folder || '').toLowerCase() === canonicalFolder) return true;
      return false;
    });
    if (!inThisPath.length) return null;

    // Rank by: expected variant match > highest version > longer folder name (specificity)
    const toRank = (v) => {
      const parts = normalizeVersion(v);
      // up to 4 parts: a.b.c.d -> a*1e9 + b*1e6 + c*1e3 + d
      const [a=0,b=0,c=0,d=0] = parts;
      return (a*1e9) + (b*1e6) + (c*1e3) + d;
    };
    inThisPath.sort((A, B) => {
      const aName = String(A.folder || A.name || '').toLowerCase();
      const bName = String(B.folder || B.name || '').toLowerCase();
      // Highest priority: prefer the canonical base folder (product.bunny.folder) over everything else
      const aIsCanonical = canonicalFolder && aName === canonicalFolder ? 1 : 0;
      const bIsCanonical = canonicalFolder && bName === canonicalFolder ? 1 : 0;
      if (aIsCanonical !== bIsCanonical) return bIsCanonical - aIsCanonical;
      // Prefer non panel-mod folders (don't pick folders that start with a single letter then -)
      const aIsPanelPrefix = /^[a-z][-_]/i.test(aName) ? 1 : 0;
      const bIsPanelPrefix = /^[a-z][-_]/i.test(bName) ? 1 : 0;
      if (aIsPanelPrefix !== bIsPanelPrefix) return aIsPanelPrefix - bIsPanelPrefix;
      const vzA = zipBase(A.variantZip || '');
      const vzB = zipBase(B.variantZip || '');
      const aHit = exp && (aName.includes(exp) || vzA === exp) ? 1 : 0;
      const bHit = exp && (bName.includes(exp) || vzB === exp) ? 1 : 0;
      if (aHit !== bHit) return bHit - aHit; // prefer expected variant match
      const aVer = toRank(A.version);
      const bVer = toRank(B.version);
      if (aVer !== bVer) return bVer - aVer; // prefer higher version
      return bName.length - aName.length; // tie-break: longer name
    });
    return inThisPath[0];
  }

  const installed2020 = findInstalledFor(installPath2020, zipBase(expectedZip2020));
  let installed2024 = findInstalledFor(installPath2024, zipBase(expectedZip2024 || ''));

  // --- Unified 2020+ shared-path reconciliation ---
  // If this is a 2020+ (single artifact) product AND both sims point to the same Community path,
  // treat the installed record as the same object for both sims to avoid divergent version/channel display
  // (e.g. FS2020 shows Beta v1.6.0 while FS2024 incorrectly latches to an old panel/variant v0.1.0).
  try {
    if (is2020Plus && installPath2020 && installPath2024 && normalizePath(installPath2020) === normalizePath(installPath2024)) {
      if (installed2020 && (!installed2024 || !installed2024.version || (installed2024.version && installed2020.version && compareVersionsNormalized(installed2020.version, installed2024.version) > 0))) {
        installed2024 = installed2020; // unify reference
        if (__SWS_DEBUG_GLOBAL) console.debug('[SWS] Unified installed record across sims (2020+ shared path)');
      }
    }
  } catch {}

  // Safety reconciliation: ensure we surface channel mismatch state if a Beta install lingers while Public is selected (or vice versa)
  // This prevents showing an Uninstall button that looks like it belongs to the currently selected channel when it doesn't.
  const selectedChan2020 = getChan('FS2020') || 'Public';
  const selectedChan2024 = getChan('FS2024') || 'Public';
  const lingeringBeta2020 = installed2020 && /beta/i.test(installed2020.installedChannel || '') && selectedChan2020 === 'Public';
  const lingeringBeta2024 = installed2024 && /beta/i.test(installed2024.installedChannel || '') && selectedChan2024 === 'Public';
  // Use effective channels immutably (do not mutate installed objects)
  const effectiveInstalled2020Channel = lingeringBeta2020 ? 'Beta' : (installed2020 ? (/beta/i.test(installed2020.installedChannel||'') ? 'Beta' : 'Public') : '');
  const effectiveInstalled2024Channel = lingeringBeta2024 ? 'Beta' : (installed2024 ? (/beta/i.test(installed2024.installedChannel||'') ? 'Beta' : 'Public') : '');

  // Prefer showing the Base package version when variants are present.
  function findInstalledBaseFor(installPath, simKey) {
    try {
      const baseZip = getBaseZipForSim(product, simKey);
  const baseZipLower = String(baseZip || '').toLowerCase();
  if (!installPath || !baseZipLower) return null;
      const pathNorm = normalizePath(installPath);
            // Include items matched by product ID OR by canonical folder name (base folder may lack ID when only panel-mod was mapped)
      const _canonicalFolderBase = String(product?.bunny?.folder || '').toLowerCase();
      const items = (aircraftList || []).filter(a => {
        if (!a || normalizePath(a.communityPath) !== pathNorm) return false;
        if (matchesItemToProduct(a, product)) return true;
        if (_canonicalFolderBase && String(a.folder || '').toLowerCase() === _canonicalFolderBase) return true;
        return false;
      });
      // Panel-mod detection: folders starting with a single letter a-z followed by - or _, or containing avionics keywords
      const panelish = (name) => /^[a-z][-_]/i.test(name) || /(pms|pms50|tds|gtn|panel)/i.test(name);
      // Filter items to exclude panel-mod folders for primary checks
      const nonPanelItems = items.filter(it => !panelish(String(it.folder || it.name || '').toLowerCase()));

      // Build a whitelist of expected base folder names from the Base component ONLY (not all altFolders which include variant names like pmsgtn/tdsgtn)
      const expectedBaseNames = (() => {
        const names = new Set();
        try {
          const b = product?.bunny || {};
          const push = (s) => { const v = String(s||'').trim(); if (v) names.add(v.toLowerCase()); };
          push(b.folder);
          // Use Base component's altFolders instead of top-level altFolders (which include variant names)
          const comps = b.components || product.components || [];
          const baseComp = comps.find(c => /base/i.test(String(c.label || ''))) || comps[0] || null;
          if (baseComp) {
            push(baseComp.folder);
            if (Array.isArray(baseComp.altFolders)) baseComp.altFolders.forEach(push);
          }
          // Also include common normalized variants of the primary folder
          const variants = expandFolderVariants(b.folder || '');
          variants.forEach(v => push(v));
          // Include zip base (some bases mirror the zip name as folder)
          push(zipBase(b.zip || ''));
        } catch {}
        return Array.from(names);
      })();
  // Strict match: only consider it Base if the installed variantZip exactly matches the Base zip name (prefer non-panel-mod)
  const hit = nonPanelItems.find(a => String(a.variantZip || '').toLowerCase() === baseZipLower)
           || items.find(a => String(a.variantZip || '').toLowerCase() === baseZipLower && !panelish(String(a.folder || '').toLowerCase())) || null;
      if (hit) return hit;
      // Exact folder match to product.bunny.folder (common base folder name)
      try {
        const pf = (product?.bunny?.folder && String(product.bunny.folder).trim()) || '';
        if (pf) {
          const pfLower = pf.toLowerCase();
          const exact = nonPanelItems.find(a => String(a.folder || '').toLowerCase() === pfLower)
                     || items.find(a => String(a.folder || '').toLowerCase() === pfLower && !panelish(String(a.folder || '').toLowerCase()));
          if (exact) return exact;
        }
      } catch {}
      // Prefer any exact match against expected base name whitelist (covers altFolders like 'sws-aircraft-pc12')
      try {
        if (expectedBaseNames.length) {
          const exactAlt = nonPanelItems.find(a => expectedBaseNames.includes(String(a.folder || '').toLowerCase()))
                        || items.find(a => expectedBaseNames.includes(String(a.folder || '').toLowerCase()) && !panelish(String(a.folder || '').toLowerCase()));
          if (exactAlt) return exactAlt;
        }
      } catch {}
      // Heuristic fallback: choose the item that is most likely the Base aircraft package
      // Build token sets for base identification
      const b = product?.bunny || {};
      const baseTokens = new Set([
        ..._toTokens(product?.name || ''),
        ..._toTokens(b.folder || ''),
        ..._toTokens(String(baseZipLower).replace(/\.zip$/i,''))
      ]);
      const compTokens = new Set([
        ...((b.components || product.components || []).flatMap(c => [
          ..._toTokens(c.folder || ''),
          ..._toTokens(String(c.zip || '').replace(/\.zip$/i,'')),
          ...Object.values(c.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,'')))
        ]))
      ]);
      const candidates = items.filter(it => {
        const name = String(it.folder || it.name || '').toLowerCase();
        return !panelish(name);
      });
      if (!candidates.length) return null;
      const ranked = candidates.map(it => {
        const name = String(it.folder || it.name || '').toLowerCase();
        const itTokens = new Set([
          ..._toTokens(it.folder || ''),
          ..._toTokens(it.name || '')
        ]);
        let shared = 0; for (const t of baseTokens) if (itTokens.has(t)) shared++;
        let compHit = 0; for (const t of compTokens) if (itTokens.has(t) && !baseTokens.has(t)) compHit++;
        const isPanelish = panelish(name);
        const nonPanelPrefix = !/^[a-z][-_]/i.test(name);
        // Score: prioritize non-panel-mod, higher base token overlap, penalize component tokens, then longer name
        const score = (isPanelish ? 0 : 1000) + (shared * 60) - (compHit * 80) + (nonPanelPrefix ? 5 : 0) + Math.min(20, (name.length || 0) / 2);
        return { it, score };
      }).sort((A, B) => B.score - A.score);
      const result = ranked.length ? ranked[0].it : null;
      return result;
    } catch (e) { return null; }
  }
  const installedBase2020 = findInstalledBaseFor(installPath2020, '2020');
  const installedBase2024 = findInstalledBaseFor(installPath2024, '2024');



  // Ensure installed channel values are available before openChangelog is defined
  const installed2020Channel = effectiveInstalled2020Channel || (installed2020 ? (installed2020?.installedChannel || 'Public') : '');
  const installed2024Channel = effectiveInstalled2024Channel || (installed2024 ? (installed2024?.installedChannel || 'Public') : '');

  // Read manifest.json for the exact installed folder (per sim) and prefer that version
  const [installedVers, setInstalledVers] = useState({ FS2020: '', FS2024: '' });

  // If a Beta build is installed, auto-check the Beta checkbox for that sim once (don’t override later user changes)
  const autoSetChannelOnceRef = useRef(false);
  useEffect(() => {
    try {
      if (autoSetChannelOnceRef.current) return;
      // Respect the user's persisted choice — if they explicitly set a channel, don't override.
      const _pid = String(product?.id || product?.bunny?.folder || '');
      const persisted20 = (_pid && localStorage.getItem(`sws_chan_${_pid}_FS2020`)) || '';
      const persisted24 = (_pid && localStorage.getItem(`sws_chan_${_pid}_FS2024`)) || '';
      if (persisted20 || persisted24) {
        autoSetChannelOnceRef.current = true;
        return;
      }
      const next = { ...selectedChannelBySim };
      let changed = false;
      if (String(installed2020Channel).toLowerCase() === 'beta' && next.FS2020 !== 'Beta') { next.FS2020 = 'Beta'; changed = true; }
      if (String(installed2024Channel).toLowerCase() === 'beta' && next.FS2024 !== 'Beta') { next.FS2024 = 'Beta'; changed = true; }
      if (changed) {
        setSelectedChannelBySim(next);
        autoSetChannelOnceRef.current = true;
      }
    } catch {}
  }, [installed2020Channel, installed2024Channel, selectedChannelBySim]);

  // Strict unified toggle semantics: Beta checkbox governs both sims; never allow divergence
  useEffect(() => {
    const cstr = String(product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024').toUpperCase();
    const _can20 = /2020/.test(cstr);
    const _hasPlus20 = /FS2020\+/.test(cstr);
    const _can24 = /2024/.test(cstr) || _hasPlus20;
    const _is2020Plus = _hasPlus20 || (_can20 && _can24);
    if (!_is2020Plus) return;
    const sel20 = (selectedChannelBySim?.FS2020 || 'Public');
    const sel24 = (selectedChannelBySim?.FS2024 || 'Public');
    if (sel20 !== sel24) {
      // Force unify to the state of the product-level checkbox interpretation:
      // If either is Beta, treat intent as Beta, else Public.
      const target = (sel20 === 'Beta' || sel24 === 'Beta') ? 'Beta' : 'Public';
      setSelectedChannelBySim(prev => ({ ...(prev||{}), FS2020: target, FS2024: target }));
      try { setChannelFilter && setChannelFilter(target === 'Beta' ? 'beta' : 'public'); } catch {}
    }
  }, [product?.compatibility, product?.bunny?.compatibility, selectedChannelBySim?.FS2020, selectedChannelBySim?.FS2024]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.electron?.getPackageVersion) return;

      const tasks = [];
  const folder20 = installedBase2020?.folder;
  // Direct read: always try the product's canonical expected folder (no ID matching required)
  const canonicalFolder20 = String(product?.bunny?.folder || '').trim();
  if (installPath2020 && canonicalFolder20) {
    tasks.push(
      window.electron.getPackageVersion(installPath2020, canonicalFolder20)
        .then(r => ({ key: 'FS2020', v: r?.success ? (r.version || '') : '', src: 'canonical' }))
        .catch(() => ({ key: 'FS2020', v: '', src: 'canonical' }))
    );
  }
  // Also try installedBase folder if it differs from canonical (belt-and-suspenders):
  if (folder20 && installPath2020 && folder20 !== canonicalFolder20) {
        tasks.push(
      window.electron.getPackageVersion(installPath2020, folder20)
            .then(r => ({ key: 'FS2020', v: r?.success ? (r.version || '') : '' }))
            .catch(() => ({ key: 'FS2020', v: '' }))
        );
      }
  // Fallback: if neither canonical nor strict Base match yielded anything, try heuristic candidates (avoid panel-mods)
  if (!folder20 && !canonicalFolder20 && installPath2020) {
    const pathNorm20 = normalizePath(installPath2020);
    const items20 = (aircraftList || []).filter(a => {
      if (!a || normalizePath(a.communityPath) !== pathNorm20) return false;
      if (matchesItemToProduct(a, product)) return true;
      const _cf = String(product?.bunny?.folder || '').toLowerCase();
      if (_cf && String(a.folder || '').toLowerCase() === _cf) return true;
      return false;
    });
        // Prefer exact expected base folder names before heuristic
        try {
          const expectedBaseNames20 = (() => {
            const names = new Set();
            const push = (s) => { const v = String(s||'').trim(); if (v) names.add(v.toLowerCase()); };
            const b = product?.bunny || {};
            push(b.folder);
            // Use Base component's altFolders only (avoid variant names like pmsgtn/tdsgtn)
            const comps = b.components || product.components || [];
            const baseComp = comps.find(c => /base/i.test(String(c.label || ''))) || comps[0] || null;
            if (baseComp) {
              push(baseComp.folder);
              if (Array.isArray(baseComp.altFolders)) baseComp.altFolders.forEach(push);
            }
            expandFolderVariants(b.folder || '').forEach(push);
            push(zipBase(b.zip || ''));
            return Array.from(names);
          })();
          const panelish20 = (name) => /^[a-z][-_]/i.test(name) || /(pms|pms50|tds|gtn|panel)/i.test(name);
          const exact = items20.filter(a => !panelish20(String(a.folder||'').toLowerCase())).find(a => expectedBaseNames20.includes(String(a.folder||'').toLowerCase()));
          if (exact?.folder) {
            tasks.push(
              window.electron.getPackageVersion(installPath2020, exact.folder)
                .then(r => ({ key: 'FS2020', v: r?.success ? (r.version || '') : '' }))
                .catch(() => ({ key: 'FS2020', v: '' }))
            );
          }
        } catch {}
        const baseZip20 = String(getBaseZipForSim(product, '2020') || '').toLowerCase();
        const baseTokens20 = new Set([
          ..._toTokens(product?.name || ''),
          ..._toTokens((product?.bunny?.folder) || ''),
          ..._toTokens(baseZip20.replace(/\.zip$/i,''))
        ]);
        const compTokens20 = new Set([
          ...((product?.bunny?.components || product.components || []).flatMap(c => [
            ..._toTokens(c.folder || ''),
            ..._toTokens(String(c.zip || '').replace(/\.zip$/i,'')),
            ...Object.values(c.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,'')))
          ]))
        ]);
        const pick20 = [...items20]
          .filter(a => !/^[a-z][-_]/i.test(String(a.folder || '')) && !/(pms|pms50|tds|gtn|panel)/i.test(String(a.folder || '')))
          .map(a => {
            const tokens = new Set([ ..._toTokens(a.folder || ''), ..._toTokens(a.name || '') ]);
            let shared = 0; for (const t of baseTokens20) if (tokens.has(t)) shared++;
            let compHit = 0; for (const t of compTokens20) if (tokens.has(t) && !baseTokens20.has(t)) compHit++;
            const len = String(a.folder || '').length;
            const score = (shared * 60) - (compHit * 80) + Math.min(20, len / 2);
            return { a, score };
          })
          .sort((A,B) => (B.score - A.score));
        const fallback20 = (pick20[0]?.a?.folder) || '';
        if (fallback20) {
          tasks.push(
            window.electron.getPackageVersion(installPath2020, fallback20)
              .then(r => ({ key: 'FS2020', v: r?.success ? (r.version || '') : '' }))
              .catch(() => ({ key: 'FS2020', v: '' }))
          );
        }
      }
  const folder24 = installedBase2024?.folder;
  // Direct read: always try the product's canonical expected folder (no ID matching required)
  const canonicalFolder24 = String(product?.bunny?.folder || '').trim();
  if (installPath2024 && canonicalFolder24) {
    tasks.push(
      window.electron.getPackageVersion(installPath2024, canonicalFolder24)
        .then(r => ({ key: 'FS2024', v: r?.success ? (r.version || '') : '', src: 'canonical' }))
        .catch(() => ({ key: 'FS2024', v: '', src: 'canonical' }))
    );
  }
  // Also try installedBase folder if it differs from canonical:
  if (folder24 && installPath2024 && folder24 !== canonicalFolder24) {
        tasks.push(
      window.electron.getPackageVersion(installPath2024, folder24)
            .then(r => ({ key: 'FS2024', v: r?.success ? (r.version || '') : '' }))
            .catch(() => ({ key: 'FS2024', v: '' }))
        );
      }
  // Fallback: if neither canonical nor strict Base match yielded anything, try heuristic candidates (avoid panel-mods)
  if (!folder24 && !canonicalFolder24 && installPath2024) {
    const pathNorm24 = normalizePath(installPath2024);
    const items24 = (aircraftList || []).filter(a => {
      if (!a || normalizePath(a.communityPath) !== pathNorm24) return false;
      if (matchesItemToProduct(a, product)) return true;
      const _cf = String(product?.bunny?.folder || '').toLowerCase();
      if (_cf && String(a.folder || '').toLowerCase() === _cf) return true;
      return false;
    });
        // Prefer exact expected base folder names before heuristic
        try {
          const expectedBaseNames24 = (() => {
            const names = new Set();
            const push = (s) => { const v = String(s||'').trim(); if (v) names.add(v.toLowerCase()); };
            const b = product?.bunny || {};
            push(b.folder);
            // Use Base component's altFolders only (avoid variant names like pmsgtn/tdsgtn)
            const comps = b.components || product.components || [];
            const baseComp = comps.find(c => /base/i.test(String(c.label || ''))) || comps[0] || null;
            if (baseComp) {
              push(baseComp.folder);
              if (Array.isArray(baseComp.altFolders)) baseComp.altFolders.forEach(push);
            }
            expandFolderVariants(b.folder || '').forEach(push);
            push(zipBase(b.zip || ''));
            return Array.from(names);
          })();
          const panelish24 = (name) => /^[a-z][-_]/i.test(name) || /(pms|pms50|tds|gtn|panel)/i.test(name);
          const exact = items24.filter(a => !panelish24(String(a.folder||'').toLowerCase())).find(a => expectedBaseNames24.includes(String(a.folder||'').toLowerCase()));
          if (exact?.folder) {
            tasks.push(
              window.electron.getPackageVersion(installPath2024, exact.folder)
                .then(r => ({ key: 'FS2024', v: r?.success ? (r.version || '') : '' }))
                .catch(() => ({ key: 'FS2024', v: '' }))
            );
          }
        } catch {}
        const baseZip24 = String(getBaseZipForSim(product, '2024') || '').toLowerCase();
        const baseTokens24 = new Set([
          ..._toTokens(product?.name || ''),
          ..._toTokens((product?.bunny?.folder) || ''),
          ..._toTokens(baseZip24.replace(/\.zip$/i,''))
        ]);
        const compTokens24 = new Set([
          ...((product?.bunny?.components || product.components || []).flatMap(c => [
            ..._toTokens(c.folder || ''),
            ..._toTokens(String(c.zip || '').replace(/\.zip$/i,'')),
            ...Object.values(c.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,'')))
          ]))
        ]);
        const pick24 = [...items24]
          .filter(a => !/^[a-z][-_]/i.test(String(a.folder || '')) && !/(pms|pms50|tds|gtn|panel)/i.test(String(a.folder || '')))
          .map(a => {
            const tokens = new Set([ ..._toTokens(a.folder || ''), ..._toTokens(a.name || '') ]);
            let shared = 0; for (const t of baseTokens24) if (tokens.has(t)) shared++;
            let compHit = 0; for (const t of compTokens24) if (tokens.has(t) && !baseTokens24.has(t)) compHit++;
            const len = String(a.folder || '').length;
            const score = (shared * 60) - (compHit * 80) + Math.min(20, len / 2);
            return { a, score };
          })
          .sort((A,B) => (B.score - A.score));
        const fallback24 = (pick24[0]?.a?.folder) || '';
        if (fallback24) {
          tasks.push(
            window.electron.getPackageVersion(installPath2024, fallback24)
              .then(r => ({ key: 'FS2024', v: r?.success ? (r.version || '') : '' }))
              .catch(() => ({ key: 'FS2024', v: '' }))
          );
        }
      }
      if (!tasks.length) return;
      const res = await Promise.all(tasks);
      console.debug('[SWS-VERSION-DEBUG] getPackageVersion results for product:', product?.id, product?.name,
        '\n  tasks resolved:', res,
        '\n  folder20:', typeof folder20 !== 'undefined' ? folder20 : 'N/A',
        '\n  folder24:', typeof folder24 !== 'undefined' ? folder24 : 'N/A'
      );
      if (cancelled) return;
      setInstalledVers(prev => {
        const next = { ...prev };
        // Apply non-canonical results first, then canonical results override (canonical = direct read from product.bunny.folder)
        for (const r of res) if (r.v && r.src !== 'canonical') next[r.key] = r.v;
        for (const r of res) if (r.v && r.src === 'canonical') next[r.key] = r.v;
        return next;
      });
    })();
    // Re-read when the matched folder or Community path changes
  }, [installedBase2020?.folder, installedBase2024?.folder, installed2020?.folder, installed2024?.folder, installPath2020, installPath2024, aircraftList, product?.id]);

  // Current cached download records per sim. Prefer the in-memory record ONLY if it matches
  // the selected channel; otherwise fall back to persisted cache for that channel.
  const mem2020 = downloadedFiles?.[product.id]?.sims?.FS2020 || null;
  const mem2024 = downloadedFiles?.[product.id]?.sims?.FS2024 || null;
  const selChan20 = getChan('FS2020') || 'Public';
  const selChan24 = getChan('FS2024') || 'Public';
  let dl2020 = (mem2020 && ((mem2020.channel || inferChannelFromRecord(mem2020) || '') === selChan20))
    ? mem2020
    : (readDlCacheForProduct(product, 'FS2020', selChan20) || null);
  let dl2024 = (mem2024 && ((mem2024.channel || inferChannelFromRecord(mem2024) || '') === selChan24))
    ? mem2024
    : (readDlCacheForProduct(product, 'FS2024', selChan24) || null);

  // Beta availability (probe with retries + cache)
  const [betaAvailable, setBetaAvailable] = useState({ '2020': null, '2024': null });
  const betaProbeCache = useRef(new Map()); // key: product.id or folder => { v2020, v2024, ts }
  // Product-specific extra Beta filename/folder hints to improve reliable detection without over-exposing toggle
  const BETA_PRODUCT_HINTS = {
    // PC-12 Legacy (product id 33812) – limited ordered hints (only first 3 used in extended probe)
    '33812': [
      'manifest.json', // fast HEAD check (most definitive, low size)
      'sws-aircraft-pc12.zip', // base package
      'sws-aircraft-pc12-gns-sky4sim.zip' // common variant
    ]
  };
  const BETA_DETECTION_VERSION = 1; // Increment if detection semantics change (for debugging / telemetry)
  // localStorage cache to avoid long checking states
  const betaLsKey = (pid) => `sws_betaAvail_${pid}`;
  const writeBetaLs = (pid, obj) => { try { localStorage.setItem(betaLsKey(pid), JSON.stringify(obj)); } catch {} };
  const readBetaLs = (pid) => {
    try { return JSON.parse(localStorage.getItem(betaLsKey(pid)) || 'null'); } catch { return null; }
  };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Limit folder candidates for faster probe
  const mainFolder = product?.bunny?.folder ? [encodePathSegments(product.bunny.folder)] : [];
      const probeLog = [];
      if (!mainFolder.length) {
        if (!cancelled) setBetaAvailable({ '2020': false, '2024': false });
        return;
      }
      const pid = String(product?.id || product?.bunny?.folder || '');
      // Use LS cache immediately to reduce flicker
      const ls = readBetaLs(pid);
      const nowTs = Date.now();
      if (ls && (nowTs - (ls.ts || 0)) < (ls.anyTrue ? 10*60*1000 : 30*60*1000)) {
        if (!cancelled) setBetaAvailable({ '2020': !!ls.v2020, '2024': !!ls.v2024 });
        if (ls.anyTrue) return; // good enough, skip background probe
        // Negative result cached for 30min — skip probing entirely
        return;
      }
      // try cache (true results cached longer than false)
      try {
        const key = String(product?.id || product?.bunny?.folder || '');
        const cached = betaProbeCache.current.get(key);
        const now = Date.now();
        if (cached) {
          const hasTrue = !!(cached.v2020 || cached.v2024);
          const ttl = hasTrue ? 5 * 60 * 1000 : 10 * 60 * 1000;
          if (now - (cached.ts || 0) < ttl) {
            if (!cancelled) setBetaAvailable({ '2020': !!cached.v2020, '2024': !!cached.v2024 });
            return;
          }
        }
      } catch {}
      async function betaExistsOnce(simKey) {
        try {
          // Check warm cache first — preheat may have already probed this Beta URL
          const warmKey = `${pid}:FS${simKey}:Beta`;
          if (warmKey in (window.__swsVersionWarmCache || {})) {
            return !!(window.__swsVersionWarmCache[warmKey] || '').trim();
          }
          // Use product-aware bucket routing so FS2024-only products check the correct bucket
          const bucket = cdnBucketForSim(product, simKey);
          // Try canonical folder only (not all candidates) to minimize 4xx requests
          const folder = product?.bunny?.folder ? encodePathSegments(product.bunny.folder) : '';
          if (!folder) return false;
          const url = `https://sws-installer.b-cdn.net/${bucket}/Beta/${folder}/manifest.json?_=${cdnCacheBucket()}`;
          try {
            // Use main-process IPC to bypass CORS restrictions on renderer-side fetch
            if (window?.electron?.netHead) {
              const res = await window.electron.netHead(url);
              if (res && res.ok) return true;
            } else if (window?.electron?.netFetchText) {
              const res = await window.electron.netFetchText(url, { method: 'HEAD', timeoutMs: 4000 });
              if (res && res.ok) return true;
            } else {
              const ok = await fetchWithTimeout(url, { method: 'HEAD', cache: 'no-store' }, 3000).then(r => r.ok).catch(() => false);
              if (ok) return true;
            }
          } catch {}
          return false;
        } catch { return false; }
      }
      async function probeWithRetries(simKey, tries = 1) {
        const ok = await betaExistsOnce(simKey);
        return ok;
      }
      // If we have a recent positive history (TTL) use that first to avoid flicker
      let hist = readBetaLs(pid);
      const TTL_MS = 12 * 60 * 60 * 1000; // 12h cache
      const compat = product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024';
      const _is24only = compat === 'FS2024';
      let b2020 = null, b2024 = null;
      if (hist && Date.now() - (hist.ts || 0) < TTL_MS && (hist.v2020 || hist.v2024 || hist.anyTrue)) {
        b2020 = !!hist.v2020; b2024 = !!hist.v2024;
      } else {
        if (_is24only) {
          b2020 = false;
          b2024 = await probeWithRetries('2024', 2);
        } else {
          [b2020, b2024] = await Promise.all([
            probeWithRetries('2020', 2),
            probeWithRetries('2024', 2)
          ]);
        }
      }
      if (!cancelled) {
        setBetaAvailable({ '2020': b2020, '2024': b2024 });
        try {
          const key = String(product?.id || product?.bunny?.folder || '');
          betaProbeCache.current.set(key, { v2020: b2020, v2024: b2024, ts: Date.now() });
          writeBetaLs(pid, { v2020: b2020, v2024: b2024, anyTrue: !!(b2020 || b2024), ts: Date.now() });
          try { localStorage.setItem(`sws_betaProbeLog_${pid}`, JSON.stringify({ ts: Date.now(), urls: probeLog.slice(0,60) })); } catch {}
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [product?.bunny?.folder, product?.id]);

  const betaExists = !!(betaAvailable['2020'] || betaAvailable['2024']);
  const betaChecking = (
    (can2020 && betaAvailable['2020'] === null) ||
    (can2024 && betaAvailable['2024'] === null)
  );
  const recHasBetaChannel = (rec) => {
    if (!rec || typeof rec !== 'object') return false;
    const baseChannel = String(rec.channel || '').toLowerCase();
    if (baseChannel === 'beta' && (rec.localPath || rec.baseLocalPath)) return true;
    const vars = rec.variants || {};
    for (const value of Object.values(vars)) {
      if (!value || typeof value !== 'object') continue;
      const chan = String(value.channel || rec.channel || '').toLowerCase();
      if (chan === 'beta' && value.localPath) return true;
    }
    return false;
  };
  const hasBetaCache = useMemo(() => {
    try {
      const pid = product?.id;
      if (!pid) return false;
      const sims = ['FS2020', 'FS2024'];
      for (const tag of sims) {
        const localRec = downloadedFiles?.[pid]?.sims?.[tag];
        if (recHasBetaChannel(localRec)) return true;
  const cached = readDlCacheForProduct(product, tag, 'Beta');
        if (recHasBetaChannel(cached)) return true;
      }
    } catch {}
    return false;
  }, [product?.id, downloadedFiles, dl2020, dl2024]);
  // Product-level Beta toggle is ON only if ALL compatible sims are set to Beta (AND semantics)
  const betaProductChecked = (
    (!can2020 || getChan('FS2020') === 'Beta') &&
    (!can2024 || getChan('FS2024') === 'Beta')
  );
  // Show Beta toggle only when we have concrete or historical evidence of Beta:
  //  - betaExists: probe confirmed at least one sim has Beta assets
  //  - anyInstalledBeta: user already has a Beta install (keep toggle to allow switching)
  //  - hasBetaCache: previously downloaded Beta files are cached
  //  - betaProductChecked: user explicitly selected Beta for all sims (persist UI even if probe later fails)
  // We intentionally exclude raw betaChecking alone to avoid every product showing a Beta toggle during initial probes.
  // Special-case GA8 family: always show toggle during probe so user isn't confused by late appearance
  const isGa8 = [52157, 2157, 52385, 53069, 54056].includes(Number(product?.id));
  // Allow list: products that may briefly need probe-visible Beta toggle (e.g., historically had Beta but CDN slow)
  const ALLOW_PROBE_VISIBLE = new Set([
    33812, // PC-12 (ensure user sees Beta option early while probing)
  ]);
  // Allow forcing visibility via localStorage (debug) and include active probe state so it doesn't "disappear" while probing
  let forceBetaToggle = false;
  try { forceBetaToggle = localStorage.getItem('sws_forceBetaToggle') === '1'; } catch {}
  // Show Beta toggle only when there's evidence OR explicit force flag.
  // Removed generic betaChecking (probing) because it caused every product to briefly show Beta on first load.
  // Historical evidence (recent positive history within TTL) counts even if current probe not finished
  let betaHistoryRecent = false;
  try {
    const hist = readBetaLs(String(product?.id || product?.bunny?.folder || ''));
    if (hist && Date.now() - (hist.ts || 0) < 12*60*60*1000 && (hist.anyTrue || hist.v2020 || hist.v2024)) betaHistoryRecent = true;
  } catch {}
  const betaToggleVisible = isBetaTester && (
    betaExists || anyInstalledBeta || betaProductChecked || hasBetaCache || betaHistoryRecent || forceBetaToggle || ((isGa8 || ALLOW_PROBE_VISIBLE.has(Number(product?.id))) && betaChecking)
  );
  if (window.__SWS_DEBUG_GLOBAL) {
    try {
      const reasons = [];
  if (betaExists) reasons.push('betaExists');
      if (anyInstalledBeta) reasons.push('installedBeta');
      if (betaProductChecked) reasons.push('selectedAllBeta');
      if (hasBetaCache) reasons.push('betaCache');
  if (betaHistoryRecent) reasons.push('historyTTL');
      if (forceBetaToggle) reasons.push('forceFlag');
      if (isGa8 && betaChecking) reasons.push('GA8Probe');
      if (!isGa8 && ALLOW_PROBE_VISIBLE.has(Number(product?.id)) && betaChecking) reasons.push('AllowProbeVisibleProbe');
    } catch {}
  }

  // Do not auto-revert selection; we’ll disable installs per-sim if Beta is unavailable
  useEffect(() => { /* intentional no-op: reflect unavailability in UI instead of flipping channel */ }, [betaChecking, betaAvailable['2020'], betaAvailable['2024']]);

  // Persist per-sim selections per product and globally
  useEffect(() => {
    try {
      const pid = String(product?.id || product?.bunny?.folder || '');
      const c20 = getChan('FS2020');
      const c24 = getChan('FS2024');
      if (pid) {
        localStorage.setItem(`sws_chan_${pid}_FS2020`, c20);
        localStorage.setItem(`sws_chan_${pid}_FS2024`, c24);
      }
      localStorage.setItem('sws_chan_global_FS2020', c20);
      localStorage.setItem('sws_chan_global_FS2024', c24);
    } catch {}
  }, [getChan, product?.id, product?.bunny?.folder]);

  // Thumbnail with fallback and caching: show placeholder immediately, try direct, then probe filenames in small batches, and finally defer zip extraction to idle time
  useEffect(() => {
    let cancelled = false;
    const pid = String(product?.id || product?.bunny?.folder || product?.name || '');
    const cacheKey = pid ? `sws_thumb_${pid}` : '';

    // 0) Immediate: use in-memory cache, else localStorage cache, else placeholder
    if (pid) {
      const mem = thumbMemCacheRef.current.get(pid);
      if (mem) setPreviewThumb(mem);
      else {
        try {
          const ls = localStorage.getItem(cacheKey);
          if (ls) {
            setPreviewThumb(ls);
            thumbMemCacheRef.current.set(pid, ls);
          } else {
            setPreviewThumb(THUMB_PLACEHOLDER);
          }
        } catch {
          setPreviewThumb(THUMB_PLACEHOLDER);
        }
      }
    } else {
      setPreviewThumb(THUMB_PLACEHOLDER);
    }

    (async () => {
      // Helper to commit a found thumbnail to state and caches
      const commit = (val) => {
        if (cancelled || !val) return;
        setPreviewThumb(val);
        if (pid) {
          thumbMemCacheRef.current.set(pid, val);
          try {
            const s = String(val || '');
            if (/^(https?:|data:)/i.test(s)) {
              localStorage.setItem(cacheKey, s);
            }
          } catch {}
        }
      };

      // If we already have a valid cached thumbnail, skip all network probing
      if (pid) {
        const cached = thumbMemCacheRef.current.get(pid) || (() => { try { return localStorage.getItem(cacheKey); } catch { return null; } })();
        if (cached && cached !== THUMB_PLACEHOLDER && /^(https?:|data:|blob:)/i.test(cached)) return;
        // Skip probing if we recently failed (negative cache — 1 hour)
        const negKey = `sws_thumbNeg_${pid}`;
        try { const neg = localStorage.getItem(negKey); if (neg && (Date.now() - Number(neg)) < 60*60*1000) return; } catch {}
      }

      // 1) Try the configured thumbnail URL (no forced cache-bust to leverage CDN cache)
      const direct = product?.bunny?.thumbnail || '';
      if (direct) {
        let ok = await preloadImage(direct, { cacheBust: false });
        if (!ok) ok = await preloadImage(direct, { cacheBust: true });
        if (ok) { commit(ok); return; }
        // Fallback: if the URL uses a /2024/ path that doesn't exist yet, try the /2020/ equivalent
        if (/\/2024\//.test(direct)) {
          const fallback2020 = direct.replace('/2024/', '/2020/');
          let ok2 = await preloadImage(fallback2020, { cacheBust: false });
          if (!ok2) ok2 = await preloadImage(fallback2020, { cacheBust: true });
          if (ok2) { commit(ok2); return; }
        }
      }

      // 2) Probe a small set of common thumbnail names under CDN folder candidates
      try {
        const chanPrimary = (getChan?.('FS2020') || 'Public');
        const thumbFolders = cdnBaseFolderCandidates(product).slice(0, 3);
        if (thumbFolders.length) {
          const names = ['Thumbnail.jpg','Thumbnail.png','thumbnail.jpg'];
          const compat = product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024';
          const bucket = (compat === 'FS2024') ? '2024' : '2020';
          const probeList = thumbFolders.flatMap(folder =>
            names.map(n => `https://sws-installer.b-cdn.net/${bucket}/${chanPrimary}/${folder}/${n}`)
          );
          const hit = await tryImagesInBatches(probeList, 3);
          if (hit) { commit(hit); return; }
        }
      } catch {}

      // 3) Zip extraction fallback removed — downloading entire zips just for thumbnails
      // generated excessive bandwidth and 4xx requests. Use placeholder if probing failed.
      // Write negative cache so we don't re-probe for 1 hour
      if (pid && !cancelled) { try { localStorage.setItem(`sws_thumbNeg_${pid}`, String(Date.now())); } catch {} }
    })();

    return () => { cancelled = true; };
  }, [product?.bunny?.thumbnail, product?.bunny?.folder, product?.bunny?.zip, getChan, thumbRefreshKey]);

  // Robust: fetch LastUpdate/changelog from CDN. Tries manifest/package JSON and common changelog files.
  const fetchManifestLastUpdate = useCallback(async (simKey, channel, opts = {}) => {
    let folders = cdnBaseFolderCandidates(product).slice(0, 3);
    if (!folders.length) folders = cdnFolderCandidates(product).slice(0, 2);

    const exactChannel = !!(opts && opts.exactChannel);
    const channels = [];
    const pushChannel = (value) => {
      const key = String(value || '').trim();
      if (!key) return;
      if (!channels.includes(key)) channels.push(key);
    };
    pushChannel(channel || 'Public');
    if (!exactChannel) {
      // Only fall back to Public (Release/Stable don't exist on Bunny CDN)
      pushChannel('Public');
    }

    // Use the product-aware bucket (for 2020+ products, always use 2020)
    const primaryBucket = cdnBucketForSim(product, simKey);
    const sims = [primaryBucket];

    // Only probe manifest.json — the canonical metadata file
    const fileCandidates = ['manifest.json'];

    const langKeys = ['en', 'en-US', 'en-GB', 'neutral', 'default'];
    const extractLast = (json) => {
      if (!json || typeof json !== 'object') return '';
      const directKeys = [
        'LastUpdate','lastUpdate','last_update','ReleaseNotes','releaseNotes','release_notes','Changelog','changelog'
      ];
      const norm = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.trim();
        if (Array.isArray(v)) return v.map(x => String(x)).join('\n').trim();
        if (typeof v === 'object') {
          const cand = v.text || v.latest || v.body || v.message || v.content || '';
          if (typeof cand === 'string' && cand.trim()) return cand.trim();
          for (const lk of langKeys) {
            if (v[lk]) {
              const t = norm(v[lk]);
              if (t) return t;
            }
          }
          const first = Object.values(v).find(x => typeof x === 'string' && x.trim());
          if (first) return String(first).trim();
        }
        return '';
      };
      const seen = new Set();
      function dfs(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 5 || seen.has(obj)) return '';
        try { seen.add(obj); } catch {}
        for (const k of directKeys) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const raw = obj[k];
            const val = norm(raw);
            if (val) return val;
          }
        }
        for (const lk of langKeys) {
          if (obj[lk]) {
            const t = dfs(obj[lk], depth + 1);
            if (t) return t;
          }
        }
        for (const [k, v] of Object.entries(obj)) {
          if (v && typeof v === 'object' && /(update|release|changelog|changes|what\s*'s\s*new|whatsnew|notes|history)/i.test(k)) {
            const t = dfs(v, depth + 1);
            if (t) return t;
          }
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === 'object') {
            const t = dfs(v, depth + 1);
            if (t) return t;
          }
        }
        return '';
      }
      // Get the latest entry
      let latest = dfs(json, 0);
      // Also grab OlderHistory and append it — search top level AND inside language buckets
      const olderKeys = ['OlderHistory','olderHistory','older_history','History','history'];
      const findOlder = (obj) => {
        if (!obj || typeof obj !== 'object') return '';
        for (const k of olderKeys) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) {
            const v = norm(obj[k]);
            if (v) return v;
          }
        }
        // Check inside language buckets (e.g., { neutral: { OlderHistory: "..." } })
        for (const lk of langKeys) {
          if (obj[lk] && typeof obj[lk] === 'object') {
            for (const k of olderKeys) {
              if (Object.prototype.hasOwnProperty.call(obj[lk], k)) {
                const v = norm(obj[lk][k]);
                if (v) return v;
              }
            }
          }
        }
        return '';
      };
      const oh = findOlder(json);
      if (oh && oh !== latest) {
        latest = latest ? `${latest}\n\n${oh}` : oh;
      }
      return latest;
    };

    const tryUrl = async (u, isJson) => {
      try {
        const r = await fetch(addCacheBust(u), { cache: 'no-store' });
        if (!r.ok) return { last:'', version:'' };
        let text = '';
        try { text = await r.text(); } catch { text = ''; }
        const body = String(text || '').trim();
        const ct = String(r.headers.get('content-type') || '').toLowerCase();
        const shouldParseJson = isJson || /json/.test(ct);
        if (shouldParseJson && body) {
          let json = null;
          try { json = JSON.parse(body); } catch { json = null; }
          if (json && typeof json === 'object') {
            const last = extractLast(json);
            const version = String(json.package_version || json.version || '').trim();
            return { last, version };
          }
          const verMatch = body.match(/\b(package_version|version)\b\s*[:=]\s*"?([0-9][^"\n\r]*)"?/i);
          const lastMatch = body.match(/\b(last[_ ]?update(?:date)?|release[_ ]?date)\b\s*[:=]\s*"?([^"\n\r]+)"?/i);
          const version = verMatch ? String(verMatch[2]).trim() : '';
          const last = lastMatch ? String(lastMatch[2]).trim() : '';
          if (last || version) return { last, version };
        }
        const isHtml = /html/.test(ct) || /\.html?(?:\?|$)/i.test(u);
        const plain = isHtml
          ? body.replace(/<script[\s\S]*?<\/script>/gi, '')
                .replace(/<style[\s\S]*?<\/style>/gi, '')
                .replace(/<[^>]+>/g, ' ')
          : body;
        const clipped = plain.length > 4000 ? plain.slice(0, 4000) + '\n…' : plain;
        return { last: clipped || '', version: '' };
      } catch { return { last:'', version:'' }; }
    };

    let versionFallback = '';
    for (const sk of sims) {
      for (const chan of channels) {
        for (const f of folders) {
          for (const file of fileCandidates) {
            const urls = buildCdnUrls(sk, chan, f, file);
            for (const u of urls) {
              if (localStorage.getItem('sws_debug_bunny') === '1') { try { console.debug('[CHANGELOG TRY]', u); } catch {} }
              const { last, version } = await tryUrl(u, true);
              if (last) return last;
              if (version) versionFallback = version;
            }
          }
        }
      }
    }
    return versionFallback ? `Latest version: v${versionFallback}` : '';
  }, [product]);

  const openChangelog = useCallback(async (simTag, channelHint) => {
    const simKey = simTag.replace('FS','');
    const rawChannel = channelHint || (simKey === '2020' ? installed2020Channel : installed2024Channel) || getChan(simTag) || 'Public';
    const channel = String(rawChannel || 'Public');
    const installedChannelForSim = simKey === '2020' ? (installed2020Channel || '') : (installed2024Channel || '');
    const installedChannelMatches = !installedChannelForSim || installedChannelForSim.toLowerCase() === channel.toLowerCase();
    onStatus?.('Resolving changelog…');
    setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: 'Loading…', url: '' });
    // Check pre-fetched changelog cache first
    try {
      const clCacheKey = `${product.id}:FS${simKey}:${channel}`;
      const cachedCl = window.__swsChangelogWarmCache?.[clCacheKey];
      if (cachedCl) {
        setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: formatReleaseNotesText(cachedCl), url: '' });
        onStatus?.('');
        return;
      }
    } catch {}
    const withTimeout = (p, ms) => Promise.race([p, new Promise(res => setTimeout(() => res('__TIMEOUT__'), ms))]);
    let installedVersionFromManifest = '';
    // Gather installed and latest remote version in parallel
    const installedVer = installedChannelMatches ? ((simKey === '2020' ? installed2020Version : installed2024Version) || '') : '';
    const remoteVerPromise = withTimeout(fetchManifestVersion(`FS${simKey}`, channel, { exactChannel: true }), 6000);
    // 0) Prefer changelog from the latest DOWNLOADED artifact for the selected sim/channel
    try {
  const dlRec = downloadedFiles?.[product.id]?.sims?.[`FS${simKey}`] || readDlCacheForProduct(product, `FS${simKey}`, channel) || null;
      // Find a matching variant record for this channel; prefer legacy localPath if channel matches
      let candidatePath = '';
      if (dlRec) {
        if (dlRec.channel === channel && dlRec.localPath) candidatePath = dlRec.localPath;
        if (!candidatePath && dlRec.variants) {
          // pick any variant with matching channel; if multiple, prefer one whose base matches expected
          const list = Object.entries(dlRec.variants).map(([k,v]) => ({ base:k, rec:v }));
          const eqBase = (a,b) => String(a||'').replace(/\.zip$/i,'').toLowerCase() === String(b||'').replace(/\.zip$/i,'').toLowerCase();
          const expected = (simKey === '2020') ? getBaseZipForSim(product, '2020') : getBaseZipForSim(product, '2024');
          const matchChan = list.filter(it => (it.rec?.channel || 'Public') === channel);
          let picked = matchChan.find(it => expected && eqBase(it.base, expected));
          if (!picked) picked = matchChan[0] || null;
          if (!picked && list.length) picked = list[0];
          if (picked?.rec?.localPath) candidatePath = picked.rec.localPath;
        }
        // As a last resort for base-only downloads
        if (!candidatePath && dlRec.baseLocalPath && ((dlRec.channel || 'Public').toLowerCase() === channel.toLowerCase())) {
          candidatePath = dlRec.baseLocalPath;
        }
      }
      if (candidatePath && window.electron?.readChangelogFromZip) {
        const res = await withTimeout(window.electron.readChangelogFromZip(candidatePath), 4000);
        if (res && res !== '__TIMEOUT__' && res.success && res.changelog) {
          setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: formatReleaseNotesText(String(res.changelog || '').trim()), url: '' });
          onStatus?.('');
          return;
        }
      }
    } catch {}
    // 1) Try local manifest.json from the installed package first
    async function tryLocal() {
      try {
        if (!installedChannelMatches) return '';
        if (!window.electron?.getPackageLastUpdate) return '';
        const is2020 = simKey === '2020';
        const base = is2020 ? installedBase2020 : installedBase2024;
        const any = is2020 ? installed2020 : installed2024;
        const installPath = is2020 ? installPath2020 : installPath2024;
        const folder = (base?.folder || any?.folder || '').trim();
        if (!installPath || !folder) return '';
        const res = await window.electron.getPackageLastUpdate(installPath, folder);
        if (res?.success) return res;
      } catch {}
      return '';
    }
    const local = await withTimeout(tryLocal(), 3000);
    if (local && local !== '__TIMEOUT__') {
      // local may be an object from IPC: { success, version, lastUpdate, releaseNotes }
      try {
  const v = String(local.version || '').trim();
  if (v) installedVersionFromManifest = v.replace(/^v/i, '').trim() || v;
        // Case-insensitive pick for LastUpdate/ReleaseNotes
        const pick = (obj, keys) => {
          if (!obj || typeof obj !== 'object') return '';
          for (const k of keys) if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
          const lower = Object.create(null);
          try { for (const k of Object.keys(obj)) lower[k.toLowerCase()] = obj[k]; } catch {}
          for (const k of keys.map(s => String(s).toLowerCase())) if (lower[k] != null) return lower[k];
          return '';
        };
        let lu = String(pick(local, ['LastUpdate','lastUpdate','Last Update','last_update'] ) || '').trim();
        let rn = String(pick(local, ['ReleaseNotes','releaseNotes','Release Notes','release_notes'] ) || '').trim();
        let oh = String(pick(local, ['olderHistory','OlderHistory','older_history','History','history'] ) || '').trim();
        // Drop JSON-like neutral buckets or duplicates
        if (rn && lu && rn.replace(/\s+/g,'') === lu.replace(/\s+/g,'')) rn = '';
        if (/^\s*\{\s*"?neutral"?\s*:\s*\{/.test(rn) && !/[A-Za-z0-9]/.test(rn.replace(/[^A-Za-z0-9]/g,''))) rn = '';
        if (/^\s*\{\s*"?neutral"?\s*:\s*\{/.test(lu) && !/[A-Za-z0-9]/.test(lu.replace(/[^A-Za-z0-9]/g,''))) lu = '';
        if (/^\s*\{\s*"?neutral"?\s*:\s*\{/.test(oh) && !/[A-Za-z0-9]/.test(oh.replace(/[^A-Za-z0-9]/g,''))) oh = '';
        // If we have a meaningful LastUpdate, show it along with older history
        if (lu) {
          const parts = [lu];
          if (rn) parts.push(rn);
          if (oh) parts.push(oh);
          const body = parts.join('\n\n');
          setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: formatReleaseNotesText(body), url: '' });
          onStatus?.('');
          return;
        }
      } catch {}
      onStatus?.('');
    }
  // 2) Try local files like changelog.md/txt within installed package
    async function tryLocalFiles() {
      try {
        if (!installedChannelMatches) return '';
        if (!window.electron?.getPackageChangelogLocal) return '';
        const is2020 = simKey === '2020';
        const base = is2020 ? installedBase2020 : installedBase2024;
        const any = is2020 ? installed2020 : installed2024;
        const installPath = is2020 ? installPath2020 : installPath2024;
        const folder = (base?.folder || any?.folder || '').trim();
        if (!installPath || !folder) return '';
        const res = await window.electron.getPackageChangelogLocal(installPath, folder);
        if (res?.success && res.changelog) return String(res.changelog || '').trim();
      } catch {}
      return '';
    }
  const lf = await withTimeout(tryLocalFiles(), 3500);
    if (lf && lf !== '__TIMEOUT__') {
      // Show only the local changelog file content
  setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: formatReleaseNotesText(lf), url: '' });
      onStatus?.('');
      return;
    }

    // 3) Fallback to remote/CDN probing; try exact channel first, then Public fallback
    try {
    let last = await withTimeout(fetchManifestLastUpdate(simKey, channel, { exactChannel: true }), 10000);
    if (!last || last === '__TIMEOUT__') {
      // If Beta had no changelog, try Public once
      if (String(channel).toLowerCase() === 'beta') {
        last = await withTimeout(fetchManifestLastUpdate(simKey, 'Public', { exactChannel: true }), 6000);
      }
    }
    if (last && last !== '__TIMEOUT__') {
      setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}`, changelog: formatReleaseNotesText(last), url: '' });
      onStatus?.('');
      return;
    }
    } catch {}
    // Final fallback: surface any version information we managed to collect
    let remoteVer = '';
    try {
      remoteVer = await remoteVerPromise.catch(() => '__TIMEOUT__');
    } catch { remoteVer = ''; }
    // Include warmed version hints if remoteVer is missing
    try {
      if (!remoteVer || remoteVer === '__TIMEOUT__') {
        const warmSel = getWarmVersion(`FS${simKey}`, channel);
        if (warmSel) remoteVer = warmSel;
        if ((!remoteVer || remoteVer === '__TIMEOUT__') && String(channel).toLowerCase() === 'beta') {
          const warmPub = getWarmVersion(`FS${simKey}`, 'Public');
          if (warmPub) remoteVer = warmPub;
        }
      }
    } catch {}
    const seenVersionKeys = new Set();
    const versionLines = [];
    const pushVersionLine = (label, version) => {
      const clean = String(version || '').trim().replace(/^v/i, '');
      if (!clean) return;
      const key = `${label.toLowerCase()}|${clean.toLowerCase()}`;
      if (seenVersionKeys.has(key)) return;
      seenVersionKeys.add(key);
      versionLines.push(`${label} version: v${clean}`);
    };
    pushVersionLine('Installed', installedVersionFromManifest);
    pushVersionLine('Installed', installedVer);
    if (typeof remoteVer === 'string' && remoteVer && remoteVer !== '__TIMEOUT__') {
      pushVersionLine('Latest', remoteVer);
    }
  const fallbackText = versionLines.length ? versionLines.join('\n') : 'Changelog not available for this product.';
  setChangelogModal?.({ open: true, title: `${product.name} — ${channel} — MSFS ${simKey}` , changelog: formatReleaseNotesText(fallbackText), url: '' });
  onStatus?.(versionLines.length ? '' : 'Changelog not found in manifest.');
  }, [fetchManifestLastUpdate, installed2020Channel, installed2024Channel, getChan, setChangelogModal, onStatus, product?.name, installedBase2020?.folder, installedBase2024?.folder, installed2020?.folder, installed2024?.folder, installPath2020, installPath2024]);

  // Availability is derived from warmed/fetched versions to avoid duplicate CDN HEAD probes.
  const [simAvailable, setSimAvailable] = useState({ '2020': null, '2024': null });
  useEffect(() => {
    const wc = window.__swsVersionWarmCache || {};
    const warm20 = String(wc[`${product?.id}:FS2020:Public`] || '').trim();
    const warm24 = String(wc[`${product?.id}:FS2024:Public`] || '').trim();
    const r20 = String(remoteVersPublic?.FS2020 || '').trim();
    const r24 = String(remoteVersPublic?.FS2024 || '').trim();
    const _availIs24only = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
    setSimAvailable({
      '2020': _availIs24only ? false : !!(warm20 || r20),
      '2024': !!(warm24 || r24)
    });
  }, [product?.id, product?.compatibility, product?.bunny?.compatibility, remoteVersPublic?.FS2020, remoteVersPublic?.FS2024]);





  // Download helper (keeps variant & channel)
  const startDownload = async (simTag, compOverride = null) => {
    if (!product?.bunny?.folder) { onStatus?.('Missing folder mapping.'); return; }
  // reset cancel flag for this new download session
  try { (cancelRequestedRef || {}).current = false; } catch {}
  // also clear any app-level cancel latch so a previous Cancel doesn't block new attempts
  try { (appCancelRef || {}).current = false; } catch {}
  // Also reset app-level cancel latch so previous Cancel doesn't kill new attempts
  try { if (appCancelRef && typeof appCancelRef === 'object') appCancelRef.current = false; } catch {}

    // Mark as downloading immediately so UI shows Cancel while resolving URLs
    try { setDownloadingId(product.id); } catch {}
    let startedActualDownload = false;
    const earlyExit = (msg) => {
      if (msg) onStatus?.(msg);
      try { setDownloadingId(null); } catch {}
      // Clear any 0% overlays if we exit before a real download starts
      try { setProgress(null); } catch {}
      try { setDownloadProgress(null); } catch {}
      try { setDownloadQueueInfo && setDownloadQueueInfo(null); } catch {}
    };

    const simKey = simTag.replace('FS',''); // '2020' | '2024'
  // New download for this sim clears the READY suppression for that sim
  try { setSuppressReadyBySim(prev => ({ ...prev, [simTag]: false })); } catch {}
  // Prioritize canonical folder to minimize 4xx probes
  const _sdCanonFolder = product?.bunny?.folder ? encodePathSegments(product.bunny.folder) : '';
  const _sdAllFolders = cdnFolderCandidates(product);
  const folders = _sdCanonFolder
    ? [_sdCanonFolder, ..._sdAllFolders.filter(f => f !== _sdCanonFolder)]
    : _sdAllFolders;

  const effectiveComponent = compOverride || currentComponent;
  const wantedZip = getVariantZipForSim(effectiveComponent, product, simKey);
  const wantedComponentLabel = effectiveComponent?.label || componentLabelForZip(product, wantedZip);
  const wantedLabel = componentLabelForZip(product, wantedZip);
  if (!wantedZip) { earlyExit('No ZIP defined for this variant/sim.'); return; }

  // Set download queue info for single-file download
  try {
    const chan = getChan(simTag) || 'Public';
    const ver = getRemoteVerForSim(simTag) || '';
    const pendingNext = (pendingDownloadQueue || []).filter(q => q.productId !== product.id).map(q => ({ name: q.name || q.product?.name || '', version: '', channel: q.channel }));
    setDownloadQueueInfo && setDownloadQueueInfo({
      current: { name: product.name, version: ver, channel: chan, pct: 0, receivedMB: 0, totalMB: null },
      overallPct: 0,
      queueIndex: 0,
      queueTotal: 1 + pendingNext.length,
      next: pendingNext
    });
  } catch {}

  // If user already hit Cancel while resolving, stop now
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }

    // If we already have the correct files cached for this CHANNEL, avoid re-downloading
  const existing = downloadedFiles?.[product.id]?.sims?.[simTag] || readDlCacheForProduct(product, simTag, getChan(simTag)) || null;
  const selectedChannelCurrent = getChan(simTag) || 'Public';
  const alternateChannel = selectedChannelCurrent === 'Beta' ? 'Public' : 'Beta';
    const baseZipCached = getBaseZipForSim(product, simKey);
  const wantedBase = zipBase(wantedZip || '');
  const varRec = existing?.variants ? existing.variants[wantedBase] : null;
  const hasVariantCached = (!!existing?.localPath && zipBase(existing.variantZip) === wantedBase) || !!(varRec && varRec.localPath);
    const hasBaseCached = !!existing?.baseLocalPath && zipBase(existing.baseZip) === zipBase(baseZipCached);
    const cachedChannel = existing?.channel || '';
  const varChan = (varRec?.channel) || cachedChannel;
  const hasVariantCachedSameChannel = hasVariantCached && (varChan === (getChan(simTag) || 'Public'));

  // Only consider cache a hit if it's for the same channel; avoid cross-channel reuse to prevent
  // Public ↔ Beta mix-ups (user may want a distinct build per channel)
  // Also skip cache hit if the remote version is newer than what's cached (update scenario)
  const cachedVersion = (varRec?.version || existing?.version || '').trim();
  const remoteVersion = (getRemoteVerForSim(simTag) || '').trim();
  const cacheIsStale = !!(cachedVersion && remoteVersion && compareVersionsNormalized(remoteVersion, cachedVersion) > 0);
  if ((hasVariantCachedSameChannel) && (!baseZipCached || zipBase(baseZipCached) === zipBase(wantedZip) || hasBaseCached) && !cacheIsStale) {
  if (cancelRequestedRef.current) {
  earlyExit('Download canceled');
        setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true }));
      } else {
    earlyExit('Already downloaded. Ready to install.');
      }
      return;
    }

    // Deliberately avoid reusing downloads from the opposite channel to keep Public and Beta artifacts isolated.

  // 2020+ products: if other sim has the same channel+variant cached, reuse it and mirror into this sim to avoid downloads
  if (is2020Plus) { // only when unified mode active
    try {
      const targetChan = getChan(simTag) || 'Public';
      const otherSimTag = simTag === 'FS2020' ? 'FS2024' : 'FS2020';
  const otherRec = downloadedFiles?.[product.id]?.sims?.[otherSimTag] || readDlCacheForProduct(product, otherSimTag, targetChan) || null;
      if (otherRec) {
        const variants = otherRec.variants || {};
        const wantedBaseKey = zipBase(wantedZip);
        const altVarExact = variants[wantedBaseKey];
        const altVar = (altVarExact && (altVarExact.channel || 'Public') === targetChan) ? altVarExact : null;
        const legacy = (!!otherRec.localPath && zipBase(otherRec.variantZip) === wantedBaseKey && (otherRec.channel || 'Public') === targetChan)
          ? { localPath: otherRec.localPath, channel: otherRec.channel, variantZip: otherRec.variantZip }
          : null;
        const chosen = altVar || legacy || null;
        const expectedBaseKey = zipBase(baseZipCached || '');
        const baseOk = !baseZipCached || (otherRec.baseLocalPath && (!expectedBaseKey || zipBase(otherRec.baseZip || '') === expectedBaseKey));
        if (chosen && baseOk) {
          // Skip cross-sim reuse if the cached version is stale (remote has a newer version)
          const otherCachedVer = (otherRec.version || '').trim();
          const otherRemoteVer = (getRemoteVerForSim(simTag) || '').trim();
          const otherIsStale = !!(otherCachedVer && otherRemoteVer && compareVersionsNormalized(otherRemoteVer, otherCachedVer) > 0);
          if (!otherIsStale) {
          const mirrored = {
            version: otherRec.version || '',
            channel: chosen.channel || targetChan,
            localPath: chosen.localPath || '',
            variantZip: chosen.variantZip || wantedZip,
            baseLocalPath: otherRec.baseLocalPath || '',
            baseZip: baseZipCached || otherRec.baseZip || '',
            variants: { ...(otherRec.variants || {}) }
          };
          setDownloadedFiles(prev => {
            const prevRec = prev[product.id] || { id: product.id, sims: {} };
            return { ...prev, [product.id]: { ...prevRec, sims: { ...prevRec.sims, [simTag]: mirrored } } };
          });
          writeDlCache(product.id, simTag, mirrored, targetChan);
          earlyExit(`Using cached ${targetChan} from ${otherSimTag}. Ready to install.`);
          return;
          }
        }
      }
    } catch {}
  }

  const buildCandidates = (channel, zip) => folders.flatMap(f => buildCdnUrlsForProduct(product, simKey, channel, f, zip));

    // Helper: resolve an URL for a given channel. If an override is provided, use it directly.
    // HEAD helper capturing meta for freshness checks
    const headMeta = async (url, timeBudget, channel) => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeBudget);
        const r = await fetch(addCacheBust(/beta/i.test(channel) ? url : url), { method:'HEAD', cache:'no-store', signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) return false;
        const lm = r.headers.get('last-modified') || '';
        const et = r.headers.get('etag') || '';
        if (lm || et) {
          // store per product+url meta for potential future comparison (lightweight, in-memory)
          const metaKey = `__zipmeta_${product.id}_${url}`;
          try {
            const prev = window.__SWS_ZIP_META?.[metaKey];
            if (!window.__SWS_ZIP_META) window.__SWS_ZIP_META = {};
            window.__SWS_ZIP_META[metaKey] = { lm, et, ts: Date.now() };
            if (prev && (prev.lm !== lm || prev.et !== et)) {
              // Could emit an event or status update; keep silent to avoid noise
            }
          } catch {}
        }
        return true;
      } catch { return false; }
    };

    const resolveZipUrl = async (simKey, channel, zipName, { isVariant = false } = {}) => {
      if (!zipName) return '';
      const pid = String(product.id);
  // Faster public checks; give Beta a bit more room when variant
  const timeBudget = channel === 'Beta' ? (isVariant ? 5000 : 3000) : 1500;

      // No remote or local overrides: build candidates from Bunny mapping only

      // Try foldered candidates
      // First, include direct hint for PC-12 Beta using the requested zipName (works for PMS/TDS packs on Beta)
      const directHints = [];
      try {
        if (String(product.id) === '33812' && channel === 'Beta') {
          const desired = String(zipName || '').trim();
          if (desired) {
            const bucket = cdnBucketForSim(product, simKey);
            directHints.push(`https://sws-installer.b-cdn.net/${bucket}/Beta/AIRCRAFT-SWS-PC12Legacy/${desired}`);
          }
        }
      } catch {}

      const candidateNames = [];
      const addCandidate = (n) => {
        const name = String(n || '').trim();
        if (!name) return;
        if (!candidateNames.includes(name)) candidateNames.push(name);
      };
      // Prefer manifest-reported names first so newer artifacts win if old ZIPs still exist on CDN.
      try {
        const manifestHints = await fetchManifestZipHints(product, simKey, channel);
        (manifestHints || []).forEach(addCandidate);
      } catch {}
      buildZipNameCandidates(zipName).forEach(addCandidate);
      // Some packages reuse the base ZIP filename for variant payloads — allow fallback when resolving variants
      try {
        const allowVariantToBase = isVariant; // enable for both Public and Beta
        if (allowVariantToBase) {
          const bz = getBaseZipForSim(product, simKey);
          if (bz) buildZipNameCandidates(bz).forEach(addCandidate);
        }
      } catch {}
      // If we know the remote version, prefer candidate ZIP names that contain it.
      // This prevents older legacy ZIP names from winning when both still exist on CDN.
      const remoteVerToken = String(getRemoteVerForSim(simTag) || '').trim();
      const versionMatched = remoteVerToken
        ? candidateNames.filter(n => String(n).includes(remoteVerToken))
        : [];
      // Strict mode: when we know the remote version, do NOT fall back to legacy/non-versioned names.
      // This avoids silently downloading older artifacts that still exist on CDN.
      if (remoteVerToken && versionMatched.length === 0) return '';
      const effectiveCandidateNames = versionMatched.length ? versionMatched : candidateNames;
      let urls = [
        ...directHints,
        // Use product-aware bucket choice: for 2020+ products, this maps 2024 → 2020
        ...effectiveCandidateNames.flatMap(z => folders.flatMap(f => buildCdnUrlsForProduct(product, simKey, channel, f, z)))
      ];

      // PC-12 name permutations removed — fetchManifestZipHints already provides the correct zip name

      // HEAD probe with meta capture
      for (const u of urls) { if (await headMeta(u, timeBudget, channel)) return u; }

      // cdnBucketForSim already maps to the correct bucket; no cross-sim fallback needed
      // Last resort: return the first foldered candidate so the actual download surfaces the HTTP error
      if (urls && urls.length) return urls[0];
      return '';
    };

  // Strict Beta flow: require base + variant; fetch base first
  if (getChan(simTag) === 'Beta') {
    // Proceed even if tester detection failed; the CDN will deny if no access
    if (!isBetaTester) { onStatus?.('Attempting Beta download (access check may fail)…'); }
  // Removed transient 'Checking beta availability…' status for cleaner UX

  // No Beta overrides; use CDN probing based on mapping

      // Base first (strictly Beta; no fallback to Public)
  const baseZip = getBaseZipForSim(product, simKey);
      let baseLocalPath = '';
  if (baseZip && baseZip !== wantedZip && !hasBaseCached) {
        const baseUrl = await resolveZipUrl(simKey, 'Beta', baseZip, { isVariant: false });
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
        if (!baseUrl) {
          onStatus?.('Beta base not found on CDN; continuing with variant package…');
        } else {
        onStatus?.(`Downloading base files (${simTag}) [Beta] — ${baseZip}`);
        startedActualDownload = true;
        const saved = await handleDownload(product, baseUrl, simTag, 'Beta', '', '__BASE_ONLY__');
          if (!saved) {
            if (cancelRequestedRef.current) { earlyExit('Download canceled'); return; }
            onStatus?.('Beta base download could not complete; continuing with variant package…');
          }
          else {
            baseLocalPath = saved;
            setDownloadedFiles(prev => {
              const prevRec = prev[product.id] || { id: product.id, sims: {} };
              const simRec = prevRec.sims?.[simTag] || {};
              return {
                ...prev,
                [product.id]: {
                  ...prevRec,
                  sims: {
                    ...prevRec.sims,
                    [simTag]: { ...simRec, baseLocalPath, baseZip }
                  }
                }
              };
            });
            writeDlCache(product.id, simTag, { baseLocalPath, baseZip }, 'Beta');
          }
        }
      }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); return; }

      // Variant (strictly Beta channel)
    // If variant is already cached for the same channel, skip download
    if (hasVariantCachedSameChannel) {
  earlyExit('Using cached variant for this channel. Ready to install.');
      return;
    }
    const variantUrl = await resolveZipUrl(simKey, 'Beta', wantedZip, { isVariant: true });
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); return; }
      if (!variantUrl) { earlyExit('Beta build not available for this variant/sim.'); return; }
      const inferredZip = variantUrl.split('/').pop().split('?')[0] || wantedZip;
      onStatus?.(`Downloading ${wantedComponentLabel || wantedLabel} (${simTag}) [Beta] — ${inferredZip}`);
    // Record the intended variant zip (wantedZip) even if the file name differs
    startedActualDownload = true;
    const variantLocalPath = await handleDownload(product, variantUrl, simTag, 'Beta', '', wantedZip);
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
  if (!variantLocalPath) { earlyExit('Beta download could not complete'); return; }
      try {
        setBetaAvailable(prev => ({ ...prev, [simKey]: true }));
        const key = String(product?.id || product?.bunny?.folder || '');
        const cached = betaProbeCache.current.get(key) || { v2020:false, v2024:false, ts:0 };
        const rec = { ...cached, ts: Date.now() };
        if (simKey === '2020') rec.v2020 = true; else if (simKey === '2024') rec.v2024 = true;
        betaProbeCache.current.set(key, rec);
    } catch {}
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
  earlyExit('Download complete. Ready to install.');
      return;
    }

    // Public channel
  const baseZip = getBaseZipForSim(product, simKey);
  let baseLocalPath = '';
  // Resolve variant URL using shared resolver (supports overrides and cross-sim fallback)
  const variantUrlPublic = await resolveZipUrl(simKey, 'Public', wantedZip, { isVariant: true });
  if (!variantUrlPublic) { earlyExit('Download not available for this selection.'); return; }

  if (baseZip && baseZip !== wantedZip && !hasBaseCached) {
    const baseUrlPublic = await resolveZipUrl(simKey, 'Public', baseZip, { isVariant: false });
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
      if (!baseUrlPublic) { earlyExit('Base files not available for this product.'); return; }
      onStatus?.(`Downloading base files (${simTag}) [Public] — ${baseZip}`);
  startedActualDownload = true;
  const saved = await handleDownload(product, baseUrlPublic, simTag, 'Public', '', '__BASE_ONLY__');
    if (saved) { baseLocalPath = saved; }
  if (!saved && cancelRequestedRef.current) { earlyExit('Download canceled'); return; }
      if (baseLocalPath) {
        setDownloadedFiles(prev => {
          const prevRec = prev[product.id] || { id: product.id, sims: {} };
          const simRec = prevRec.sims?.[simTag] || {};
          return {
            ...prev,
            [product.id]: {
              ...prevRec,
              sims: {
                ...prevRec.sims,
                [simTag]: {
                  ...simRec,
                  baseLocalPath,
                  baseZip
                }
              }
            }
          };
        });
  writeDlCache(product.id, simTag, { baseLocalPath, baseZip }, 'Public');
      }
    }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); return; }

  // For Public channel, also require same-channel cache; do not reuse Beta artifact for Public
  if (!hasVariantCachedSameChannel) {
  onStatus?.(`Downloading ${wantedLabel} (${simTag}) [Public] — ${wantedZip}`);
  let variantLocalPath = '';
  const inferredZip = variantUrlPublic.split('/').pop().split('?')[0] || wantedZip;
  startedActualDownload = true;
  const saved = await handleDownload(product, variantUrlPublic, simTag, 'Public', '', inferredZip);
      if (saved) { variantLocalPath = saved; }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
      if (!variantLocalPath) { earlyExit('Download not available for this selection.'); return; }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
  if (cancelRequestedRef.current) { earlyExit('Download canceled'); setSuppressReadyBySim(prev => ({ ...prev, [simTag]: true })); return; }
  earlyExit('Download complete. Ready to install.');
  return;
      onStatus?.('Using cached download. Ready to install.');
    }
  };

  // Batch progress is managed in App; use helpers passed via props

  // Aggregated batch download: base (if needed) + all variants for a sim in one progress
  const downloadAllForSim = async (simTag, channelOverride = null) => {
    try {
  // Ensure any previous cancel doesn't carry over into this new batch
  try { cancelRequestedRef.current = false; } catch {}
  // Also reset the app-level cancel latch for a fresh batch
  try { appCancelRef.current = false; } catch {}
  // Reset app-level cancel latch as well so a prior cancel doesn't abort immediately
  try { if (appCancelRef && typeof appCancelRef === 'object') appCancelRef.current = false; } catch {}

      const simKey = simTag.replace('FS','');
  const chan = channelOverride || getChan(simTag) || 'Public';

      // Build unique variant list by zipBase
      const uniq = new Map();
      for (const c of (components || [])) {
        const z = getVariantZipForSim(c, product, simKey);
        const zb = zipBase(z);
        if (!zb) continue;
        if (!uniq.has(zb)) uniq.set(zb, { type: 'variant', component: c, zip: z });
      }
      // If no explicit components, fall back to the base zip as a single entry
      if (uniq.size === 0) {
        const fallbackZip = getVariantZipForSim(null, product, simKey);
        if (fallbackZip) uniq.set(zipBase(fallbackZip), { type: 'variant', component: null, zip: fallbackZip });
      }

      // Determine if base zip is needed (and not already cached)
      const baseZip = getBaseZipForSim(product, simKey);
      let existing = downloadedFiles?.[product.id]?.sims?.[simTag] || readDlCacheForProduct(product, simTag, chan) || null;
      if (!existing && is2020Plus) {
        const otherSimTag = simTag === 'FS2020' ? 'FS2024' : 'FS2020';
        const otherRec = downloadedFiles?.[product.id]?.sims?.[otherSimTag] || readDlCacheForProduct(product, otherSimTag, chan) || null;
        const otherRecChan = (otherRec?.channel || inferChannelFromRecord(otherRec) || '').trim();
        const hasOtherVariantForChan = Object.values(otherRec?.variants || {}).some(v => {
          const vChan = (v?.channel || otherRec?.channel || inferChannelFromRecord(v) || '').trim();
          return vChan === chan;
        });
        if (otherRec && (otherRecChan === chan || hasOtherVariantForChan)) {
          // Skip cross-sim reuse if the cached version is stale (remote has a newer version)
          const otherCachedV = (otherRec.version || '').trim();
          const otherRemoteV = (getRemoteVerForSim(simTag) || '').trim();
          const otherStale = !!(otherCachedV && otherRemoteV && compareVersionsNormalized(otherRemoteV, otherCachedV) > 0);
          if (!otherStale) {
          const mirrored = {
            version: otherRec.version || '',
            channel: otherRec.channel || chan,
            localPath: otherRec.localPath || '',
            variantZip: otherRec.variantZip || '',
            baseLocalPath: otherRec.baseLocalPath || '',
            baseZip: otherRec.baseZip || baseZip || '',
            variants: { ...(otherRec.variants || {}) }
          };
          existing = mirrored;
          setDownloadedFiles(prev => {
            const prevRec = prev[product.id] || { id: product.id, sims: {} };
            return { ...prev, [product.id]: { ...prevRec, sims: { ...prevRec.sims, [simTag]: mirrored } } };
          });
          writeDlCache(product.id, simTag, mirrored, chan);
          }
        }
      }
      const hasBaseCached = !!existing?.baseLocalPath && zipBase(existing.baseZip) === zipBase(baseZip || '');

      // Check if existing cache is stale (remote version newer than cached version)
      const existingVer = (existing?.version || '').trim();
      const remoteVer = (getRemoteVerForSim(simTag) || '').trim();
      const existingIsStale = !!(existingVer && remoteVer && compareVersionsNormalized(remoteVer, existingVer) > 0);

      // Create ordered items: base first (if needed), then each variant not cached on same channel
      const items = [];
      if (baseZip && (!hasBaseCached || existingIsStale)) items.push({ type: 'base', zip: baseZip });
      for (const [, rec] of uniq) {
        const wantedZip = rec.zip;
        const wantedBase = zipBase(wantedZip || '');
        const varRec = existing?.variants ? existing.variants[wantedBase] : null;
        const sameChan = ((varRec?.channel) || existing?.channel || '') === chan;
        const hasVariantCachedSameChan = (!!(varRec && varRec.localPath) && sameChan) ||
          (!!existing?.localPath && zipEquivalent(existing.variantZip, wantedZip) && (existing?.channel === chan));
        if (!hasVariantCachedSameChan || existingIsStale) {
          items.push({ type: 'variant', zip: wantedZip, component: rec.component });
        }
      }

      if (items.length === 0) { onStatus?.('Already downloaded. Ready to install.'); return; }

  // Begin batch (managed by App)
  try { beginBatch && beginBatch(simTag, items.length); } catch {}
  // Mark busy and show progress overlay immediately
  try { setDownloadingId && setDownloadingId(product.id); } catch {}
  try { setProgress && setProgress(0); } catch {}
  try { setDownloadProgress && setDownloadProgress(0); } catch {}
      setSuppressReadyBySim(prev => ({ ...prev, [simTag]: false }));

      // Execute sequentially using the existing handleDownload path via URL resolution inside startDownload
      // To ensure we don’t double-download base inside startDownload, we call handleDownload directly by resolving URLs here.

    // Local resolver copied from startDownload scope (uses shared helpers)
  // Prioritize canonical folder to minimize 4xx probes
  const _canonFolder = product?.bunny?.folder ? encodePathSegments(product.bunny.folder) : '';
  const _allFolders = cdnFolderCandidates(product);
  const folders = _canonFolder
    ? [_canonFolder, ..._allFolders.filter(f => f !== _canonFolder)]
    : _allFolders;
      const resolveZipUrl = async (simKeyLocal, channel, zipName, { isVariant = false } = {}) => {
        if (!zipName) return '';
  const timeBudget = channel === 'Beta' ? (isVariant ? 5000 : 3000) : 1500;
        const candidateNames = [];
        const addCandidate = (n) => {
          const name = String(n || '').trim();
          if (!name) return;
          if (!candidateNames.includes(name)) candidateNames.push(name);
        };
        try {
          const manifestHints = await fetchManifestZipHints(product, simKeyLocal, channel);
          (manifestHints || []).forEach(addCandidate);
        } catch {}
        buildZipNameCandidates(zipName).forEach(addCandidate);
        if (isVariant) {
          const bz = getBaseZipForSim(product, simKeyLocal);
          if (bz) buildZipNameCandidates(bz).forEach(addCandidate);
        }
        // If we know the remote version, prefer candidate ZIP names that contain it.
        // This prevents older legacy ZIP names from winning when both still exist on CDN.
        const remoteVerToken = String(getRemoteVerForSim(simTag) || '').trim();
        const versionMatched = remoteVerToken
          ? candidateNames.filter(n => String(n).includes(remoteVerToken))
          : [];
        // Strict mode: when we know the remote version, do NOT fall back to legacy/non-versioned names.
        // This avoids silently downloading older artifacts that still exist on CDN.
        if (remoteVerToken && versionMatched.length === 0) return '';
        const effectiveCandidateNames = versionMatched.length ? versionMatched : candidateNames;
  let urls = [
          ...effectiveCandidateNames.flatMap(z => folders.flatMap(f => buildCdnUrlsForProduct(product, simKeyLocal, channel, f, z)))
        ];
        for (const u of urls) { if (await headOk(u, (timeBudget))) return u; }
        // cdnBucketForSim already maps to the correct bucket; no cross-sim fallback needed
        // Last resort: return the first candidate so the main downloader surfaces any HTTP error
        if (urls && urls.length) return urls[0];
        return '';
      };

      // If no items are needed, bail out early
      if (items.length === 0) {
        onStatus?.('Already downloaded. Ready to install.');
        return;
      }

      let savedAny = false;
      const MAX_RETRIES = 2;

      // Set download queue info for banner — show the product (not individual files)
      try {
        const pendingNext = (pendingDownloadQueue || []).filter(q => q.productId !== product.id).map(q => ({ name: q.name || q.product?.name || '', version: '', channel: q.channel }));
        setDownloadQueueInfo && setDownloadQueueInfo({
          current: { name: product.name, version: getRemoteVerForSim(simTag) || '', channel: chan, pct: 0, receivedMB: 0, totalMB: null },
          overallPct: 0,
          queueIndex: 0,
          queueTotal: 1 + pendingNext.length,
          next: pendingNext
        });
      } catch {}

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (cancelRequestedRef.current) break;
        let saved = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (cancelRequestedRef.current) break;
          if (it.type === 'base') {
            const baseUrl = await resolveZipUrl(simKey, chan, it.zip, { isVariant: false });
            if (!baseUrl) { onStatus?.('Base files not available.'); break; }
            if (cancelRequestedRef.current) break;
            onStatus?.(`Downloading base files (${simTag}) [${chan}] — ${it.zip}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
            saved = await handleDownload(product, baseUrl, simTag, chan, '', '__BASE_ONLY__');
          } else {
            const vUrl = await resolveZipUrl(simKey, chan, it.zip, { isVariant: true });
            if (!vUrl) { onStatus?.('Variant not available for this sim/channel.'); break; }
            const inferredZip = vUrl.split('/').pop().split('?')[0] || it.zip;
            if (cancelRequestedRef.current) break;
            onStatus?.(`Downloading ${componentLabelForZip(product, it.zip)} (${simTag}) [${chan}] — ${inferredZip}${attempt > 0 ? ` (retry ${attempt})` : ''}`);
            saved = await handleDownload(product, vUrl, simTag, chan, '', it.zip);
          }
          if (saved || cancelRequestedRef.current) break;
          // Brief pause before retry
          if (attempt < MAX_RETRIES - 1) {
            try { console.warn('[BATCH] File failed, retrying in 2s…', it.zip, 'attempt', attempt + 1); } catch {}
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        if (!saved && cancelRequestedRef.current) break;
        if (saved) savedAny = true;
        try { advanceBatch && advanceBatch(i + 1); } catch {}
      }

  if (!cancelRequestedRef.current) {
        if (savedAny) {
          onStatus?.('Download complete. Ready to install.');
          try { setProgress && setProgress(100); } catch {}
          try { setDownloadProgress && setDownloadProgress(100); } catch {}
          try { setTimeout(() => setProgress && setProgress(null), 1200); } catch {}
        } else {
          // No files downloaded — ensure overlays are cleared
          try { setProgress && setProgress(null); } catch {}
          try { setDownloadProgress && setDownloadProgress(null); } catch {}
        }
        // Persist the version we just downloaded for this sim/channel for label/UI logic
        try {
          let ver = getRemoteVerForSim(simTag) || '';
          // Fallback: warm cache version (CDN fetch may still be in flight)
          if (!ver) try { ver = getWarmVersion(simTag, chan) || ''; } catch {}
          // Fallback: extract version from the downloaded ZIP filename
          if (!ver && items?.length) {
            try {
              for (const bf of items) {
                const m = String(bf?.zip || '').match(/([0-9]+(?:\.[0-9]+){1,3})/);
                if (m) { ver = m[1]; break; }
              }
            } catch {}
          }
          // Always persist channel; persist version when available
          writeDlCache(product.id, simTag, { version: ver || '', channel: chan }, chan);
          setDownloadedFiles(prev => {
            const prevRec = prev[product.id] || { id: product.id, sims: {} };
            const simRec = prevRec.sims?.[simTag] || {};
            return {
              ...prev,
              [product.id]: {
                ...prevRec,
                sims: {
                  ...prevRec.sims,
                  [simTag]: { ...simRec, version: ver || '', channel: chan }
                }
              }
            };
          });
        } catch {}
      }

    } catch (e) {
  onStatus?.("Couldn't complete download: " + (e?.message || String(e)));
    } finally {
      // Clear batch state in App and reset cancel flag so next downloads behave normally
      try { endBatch && endBatch(); } catch {}
      try { setDownloadingId && setDownloadingId(null); } catch {}
  try { cancelRequestedRef.current = false; } catch {}
  // Process next queued product download (if any); otherwise clear banner
  try {
    const hadNext = processNextDownloadRef?.current?.();
    if (!hadNext) { setDownloadQueueInfo && setDownloadQueueInfo(null); }
  } catch { try { setDownloadQueueInfo && setDownloadQueueInfo(null); } catch {} }
    }
  };
  downloadAllForSimRef.current = downloadAllForSim;

  // Show pre-download changelog only for update downloads (not new installs)
  const maybeShowPreDownloadChangelogIfUpdate = useCallback(async (simTag, chan) => {
    try {
      // Determine if this is an update vs a new install
      const installedSim = (simTag === 'FS2020') ? installed2020 : installed2024;
      const installedVer = (simTag === 'FS2020') ? (installed2020Version || '') : (installed2024Version || '');
      const remoteVer = getRemoteVerForSim(simTag) || '';
      let isUpdate = false;
      if (forceUpdateActive) {
        isUpdate = true;
      } else if (installedSim && installedVer && remoteVer && compareVersionsNormalized(remoteVer, installedVer) > 0) {
        isUpdate = true;
      }
      if (isUpdate) {
        await maybeShowPreDownloadChangelog(simTag, chan);
      } else {
        await downloadAllForSim(simTag, chan);
      }
    } catch (e) {
      // Fallback: if anything goes wrong, proceed directly with download
      try { await downloadAllForSim(simTag, chan); } catch {}
    }
  }, [installed2020, installed2024, installed2020Version, installed2024Version, forceUpdateActive, getRemoteVerForSim, maybeShowPreDownloadChangelog, downloadAllForSim]);

  // Begin the gated download flow (EULA, optional pre-download changelog only for updates)
  const beginDownloadFlow = useCallback(async (simTag) => {
    // Clear any previous cancel latch before starting a gated flow
    try { appCancelRef.current = false; } catch {}
    try { cancelRequestedRef.current = false; } catch {}
    const chan = getChan(simTag) || 'Public';
    // If Beta channel is selected, ensure the user has acknowledged the Beta warning
    if (chan === 'Beta') {
      const ok = await ensureBetaAckUI();
      if (!ok) return; // user declined the Beta warning
    }
    // EULA first
    if (!eulaAccepted) {
      setEulaModal({ open:true, simTag, channel: chan });
      return;
    }
    // Then optionally show pre-download changelog only if this is an update
    await maybeShowPreDownloadChangelogIfUpdate(simTag, chan);
  }, [eulaAccepted, getChan, ensureBetaAckUI, maybeShowPreDownloadChangelogIfUpdate]);

  // Channel-aware variant: enforce Beta + EULA gating using an explicit channel
  const beginDownloadFlowWithChan = useCallback(async (simTag, chan) => {
    // Clear any previous cancel latch before starting a gated flow with explicit channel
    try { appCancelRef.current = false; } catch {}
    try { cancelRequestedRef.current = false; } catch {}
    const chanEff = chan || getChan(simTag) || 'Public';
    if (chanEff === 'Beta') {
      const ok = await ensureBetaAckUI();
      if (!ok) return;
    }
    if (!eulaAccepted) {
      setEulaModal({ open:true, simTag, channel: chanEff });
      return;
    }
    await maybeShowPreDownloadChangelogIfUpdate(simTag, chanEff);
  }, [eulaAccepted, getChan, ensureBetaAckUI, maybeShowPreDownloadChangelogIfUpdate]);

  // Show pre-download changelog modal unless disabled; fetch text using existing manifest/changelog helpers
  const maybeShowPreDownloadChangelog = useCallback(async (simTag, chan) => {
    const skip = (localStorage.getItem('sws_skip_pre_download_changelog') === '1');
    if (skip) {
      await downloadAllForSim(simTag, chan);
      return;
    }
    try {
      const simKey = simTag.replace('FS','');
      // Re-use fetchManifestLastUpdate to get best-effort text; if empty, still proceed
  const txt = await withTimeout(fetchManifestLastUpdate(simKey, chan, { exactChannel: true }), 8000).catch(() => '');
      const ver = getRemoteVerForSim(simTag) || '';
  setPreDlModal({ open:true, simTag, channel: chan, version: ver, text: formatReleaseNotesText(txt || 'No changelog found for this version.'), dontAsk: (localStorage.getItem('sws_skip_pre_download_changelog') === '1') });
    } catch {
      await downloadAllForSim(simTag, chan);
    }
  }, [fetchManifestLastUpdate, downloadAllForSim, getRemoteVerForSim]);

  // Compatibility flags (defined earlier near expectedZip)

  // Busy for this product
  const isBusy = (downloadingId === product.id) || (installingId === product.id);
  // Refs for active download/batch state (must appear before first usage)
  // (moved earlier)
  // (moved earlier)
  // Identify which sim (if any) is actively downloading for this product.
  // Prefer the value provided by App; if absent, leave null.
  // (Use activeDlSimProp provided by parent App component.)
  // Cross-sim reuse: for FS2020+ products, allow FS2024 to use FS2020 caches
  const mergeDl = (primary, fallback) => {
    if (primary && fallback) {
      return {
        ...fallback,
        ...primary,
        variants: { ...(fallback.variants || {}), ...(primary.variants || {}) },
        baseLocalPath: primary.baseLocalPath || fallback.baseLocalPath,
        baseZip: primary.baseZip || fallback.baseZip,
        localPath: primary.localPath || fallback.localPath,
        variantZip: primary.variantZip || fallback.variantZip,
        channel: primary.channel || fallback.channel,
  // no savedUrl retained in UI state
      };
    }
    return primary || fallback || null;
  };
  const dl2024Eff = dl2024; // Strict per-sim: no cross-sim reuse in readiness/preview logic
  // For 2020+ products, allow cross-sim cache sharing
  const is2020PlusLocal = product?.bunny?.compatibility?.includes('FS2020+') || product?.compatibility?.includes('FS2020+') || false;
  if (is2020PlusLocal) {
    // Require explicit channel match — empty/missing channel must NOT default to Public
    const _ch20 = dl2020?.channel || inferChannelFromRecord(dl2020) || '';
    const _ch24 = dl2024?.channel || inferChannelFromRecord(dl2024) || '';
    if (!dl2024 && dl2020 && _ch20 === selChan24) dl2024 = dl2020;
    if (!dl2020 && dl2024 && _ch24 === selChan20) dl2020 = dl2024;
  }
  // Determine if the selected variant requires a separate base zip for each sim
  // We consider base required when a base zip is defined and it is not equivalent to the expected variant zip.
  const baseZipName2020 = getBaseZipForSim(product, '2020');
  const baseZipName2024 = getBaseZipForSim(product, '2024');
  const needsBase2020 = !!(baseZipName2020 && (!expectedZip2020 || !zipEquivalent(baseZipName2020, expectedZip2020)));
  const needsBase2024 = !!(baseZipName2024 && (!expectedZip2024 || !zipEquivalent(baseZipName2024, expectedZip2024)));
  const hasAnyCache2020 = !!(
    dl2020?.localPath ||
    dl2020?.baseLocalPath ||
    (dl2020?.variants && Object.values(dl2020.variants).some(v => !!v?.localPath))
  );
  const hasAnyCache2024 = !!(
    dl2024?.localPath ||
    dl2024?.baseLocalPath ||
    (dl2024?.variants && Object.values(dl2024?.variants).some(v => !!v?.localPath))
  );

  // Treat date-stamped ZIPs as equivalent to their base names for readiness checks
  const hasVariant2020 = !!(dl2020?.localPath) && (!!expectedZip2020 ? zipEquivalent(dl2020.variantZip, expectedZip2020) : true);
  const hasVariant2024 = !!(dl2024?.localPath) && (!!expectedZip2024 ? zipEquivalent(dl2024?.variantZip, expectedZip2024) : true);
  // STRICT (per-sim only, no cross-sim reuse) for readiness UI
  const hasVariant2024Strict = !!(dl2024?.localPath) && (!!expectedZip2024 ? zipEquivalent(dl2024.variantZip, expectedZip2024) : true);

  const hasBaseDl2020 = !!dl2020?.baseLocalPath;
  const hasBaseDl2024 = !!dl2024?.baseLocalPath;
  const hasBaseDl2024Strict = !!dl2024?.baseLocalPath;

  // Ready state for badge: show once download is ready (variant + base if needed), regardless of path
  const readyBadge2020 = (
    !installed2020 &&
    (
      hasVariant2020 || (dl2020 && Object.keys(dl2020.variants || {}).length > 0)
    ) &&
    (!needsBase2020 || hasBaseDl2020) &&
    !isBusy &&
    !suppressReadyBySim.FS2020
  );
  const readyBadge2024 = (
    !installed2024 &&
    (
      hasVariant2024Strict || (dl2024 && Object.keys(dl2024.variants || {}).length > 0)
    ) &&
    (!needsBase2024 || hasBaseDl2024Strict) &&
    !isBusy &&
    !suppressReadyBySim.FS2024
  );

  // Ready pill removed – keep internal readiness calculations if used elsewhere but do not render a badge

  // --- Compatibility icon (FIX: was missing) ---
  let compatIconImg = icon2020plus;
  let compatLabel = 'MSFS 2020+';
  if (compat === 'FS2020') { compatIconImg = icon2020; compatLabel = 'MSFS 2020'; }
  if (compat === 'FS2024') { compatIconImg = icon2024; compatLabel = 'MSFS 2024'; }

  const otherChan = selectedChan === 'Beta' ? 'Public' : 'Beta';
  const dl2020Other = readDlCacheForProduct(product, 'FS2020', otherChan) || null;
  const dl2024Other = readDlCacheForProduct(product, 'FS2024', otherChan) || null;

  // --- Per‑sim action button ---
  function renderSimButton(simTag, installedSim, dlRec, installPath, colors, readyLabelGuard = true, dlRecOtherParam, dlAltOtherParam, selectedRemoteVersion) {
    // touch channelVisualTick so changes force recalculation of outlineColor / backgrounds
    const _channelVisualTick = channelVisualTick; // eslint-disable-line no-unused-vars
    const year = simTag.slice(-4);
    const simKey = simTag.replace('FS','');   // '2020'|'2024'
    const selectedChanSim = getChan(simTag) || 'Public';
    // Removed prior cross-sim channel unification to prevent visual flicker.
    // Each sim button now reflects only its own selected channel state.
    const effectiveSelectedChanSim = selectedChanSim;
  const downloadingThis = (downloadingId === product.id) && (activeDlSimProp === simTag);
  const downloadingOther = (downloadingId === product.id) && (!!activeDlSimProp && activeDlSimProp !== simTag);
    // Per-sim installing state: only flag this button as installing when this sim is active
    const installingThis = (installingId === product.id) && (activeInstallSimProp === simTag);
    const installingOther = (installingId === product.id) && (!!activeInstallSimProp && activeInstallSimProp !== simTag);
    const expectedZip = simKey === '2020' ? expectedZip2020 : expectedZip2024;
    const baseZipExpected = getBaseZipForSim(product, simKey);
    const expectedBaseKey = zipBase(baseZipExpected || '');
    const dlAlt = simTag === 'FS2020' ? dl2024 : dl2020;
  // Remote version (if any) for this sim (already channel-filtered upstream)
  // Use unified version for 2020+ products so both sim buttons show same latest channel version.
    const remoteVersionForSimAll = (() => {
      if (is2020Plus) {
        return (simTag === 'FS2020') ? (remoteVersUnified.FS2020 || '') : (remoteVersUnified.FS2024 || '');
      }
      return (simTag === 'FS2020') ? (remoteVers?.FS2020 || '') : (remoteVers?.FS2024 || '');
    })();
    // Explicit channel-scoped remote version (do NOT let a latched Public version masquerade as Beta)
    const remoteVersionSelectedRaw = (() => {
      if (effectiveSelectedChanSim === 'Beta') {
        return (simTag === 'FS2020') ? (remoteVersBeta.FS2020 || '') : (remoteVersBeta.FS2024 || '');
      }
      return (simTag === 'FS2020') ? (remoteVersPublic.FS2020 || '') : (remoteVersPublic.FS2024 || '');
    })();
    // Preferred remote version for label: channel‑specific first, fallback to unified/channel-computed, finally blank
    // For Beta: if Beta version not yet fetched, leave blank (don't show Public version incorrectly)
    // Prefer channel-specific version; for 2020+ products, allow Beta to fall back to the unified
    // cross-sim version so both sim buttons show the same latest when artifacts are shared.
    const remoteVersionPreferred = (effectiveSelectedChanSim === 'Beta')
      ? (remoteVersionSelectedRaw || remoteVersionForSimAll || '')
      : (remoteVersionSelectedRaw || remoteVersionForSimAll || '');

    // Effective version to display in labels. If Beta is selected but its version hasn't been
    // discovered yet, fall back to the unified/public-derived version so we still show a version.
    // For 2020+ products, always pick the MAX of per-sim and unified versions so both sim
    // buttons show the same (highest) version when artifacts are shared across sims.
    const rvEffectiveForLabel = (() => {
      const pref = remoteVersionPreferred || '';
      const all = remoteVersionForSimAll || '';
      if (is2020Plus && pref && all) {
        return compareVersionsNormalized(all, pref) > 0 ? all : pref;
      }
      return pref || all || '';
    })();
    const rvUsedFallbackFromPublic = (effectiveSelectedChanSim === 'Beta') && !remoteVersionSelectedRaw && !!rvEffectiveForLabel;

    let effectiveDlRec = dlRec;
    if (!effectiveDlRec && dlRecOtherParam && (dlRecOtherParam.channel || '') === selectedChanSim) {
      effectiveDlRec = dlRecOtherParam;
    }
    if (!effectiveDlRec && dlAlt && (dlAlt.channel || '') === selectedChanSim) {
      effectiveDlRec = dlAlt;
    }
    if (!effectiveDlRec && dlAltOtherParam && (dlAltOtherParam.channel || '') === selectedChanSim) {
      effectiveDlRec = dlAltOtherParam;
    }
    // If effectiveDlRec exists but lacks baseLocalPath (e.g. partial cache for this sim),
    // try cross-sim records that have it (important for 2020+ products with shared downloads)
    if (effectiveDlRec && !effectiveDlRec.baseLocalPath) {
      for (const alt of [dlRecOtherParam, dlAlt, dlAltOtherParam]) {
        if (alt && alt.baseLocalPath && (alt.channel || '') === selectedChanSim) {
          effectiveDlRec = alt;
          break;
        }
      }
    }


    const compList = (product?.bunny?.components || product.components || []);
    const variantBases = new Set(
      compList
        .map(c => zipBase((c?.zipBySim?.[simKey] || c?.zip || '')))
        .filter(b => b && (!expectedBaseKey || b !== expectedBaseKey))
    );
    const componentsForSim = compList.filter(c => !!(c?.zipBySim?.[simKey] || c?.zip));
    const hasVariantsForSim = componentsForSim.length > 1;
    // True when product is not available for this sim:
    // Either no zips defined at all, OR zips defined but no remote version found (not on CDN)
    // and nothing installed. Skip the CDN check while version fetch is still in progress.
    // Note: we intentionally ignore dlRec here — a cached download from cross-sim sharing or
    // stale cache should not prevent showing "unavailable" when the CDN has no files for this sim.
    // Channel-aware: check the selected channel specifically, not just "any channel has files".
    const remoteForSelectedChan = effectiveSelectedChanSim === 'Beta'
      ? (remoteVersBeta?.[simTag] || '')
      : (remoteVersPublic?.[simTag] || '');
    const noRemoteForThisSim = !remoteForSelectedChan && !(
      (remoteVersPublic?.[simTag] || '') || (remoteVersBeta?.[simTag] || '')
    );
    // Also treat warm-cache-probed-empty as "version known absent" so per-sim buttons
    // don't wait for the slower startup fetch to flag unavailable.
    const _warmProbed = (() => {
      try {
        const warm = window.__swsVersionWarmCache;
        if (!warm) return false;
        const pid = product?.id || '';
        const ch = effectiveSelectedChanSim === 'Beta' ? 'Beta' : 'Public';
        return (`${pid}:${simTag}:${ch}` in warm);
      } catch { return false; }
    })();
    const noRemoteForSelectedChannel = !remoteForSelectedChan && (versionFetchDone || _warmProbed);
    const noZipDefinedForSim = (!componentsForSim.length && !baseZipExpected && !expectedZip) ||
      (noRemoteForThisSim && (versionFetchDone || _warmProbed) && !installedSim) ||
      (noRemoteForSelectedChannel && !installedSim);

    const needsBaseForThisSim = !installedSim && !!baseZipExpected && zipBase(baseZipExpected) !== zipBase(expectedZip);
    const matchesExpectedBase = (rec) => {
      if (!rec || typeof rec !== 'object' || !rec.baseLocalPath) return false;
      if (!expectedBaseKey) return true;
      return zipBase(rec.baseZip || '') === expectedBaseKey;
    };
    const baseOkHereForSelected = matchesExpectedBase(dlRec);
    const baseOkAltForSelected = matchesExpectedBase(dlAlt);
    const baseOkOtherHere = matchesExpectedBase(dlRecOtherParam);
    const baseOkOtherAlt = matchesExpectedBase(dlAltOtherParam);
    const hasBaseForThisSim = baseOkHereForSelected || baseOkAltForSelected || baseOkOtherHere || baseOkOtherAlt;

    // Determine if we can replace installed channel with the selected channel (when cached)
  // Normalize installed channel to known values
  let installedChan = installedSim?.installedChannel || '';
  // Heuristic inference ONLY when no explicit channel was stored (legacy installs).
  // When installedChannel is explicitly set (from localStorage during install), trust it —
  // do NOT override based on version matching, because Public and Beta often share the same version number.
  try {
    if (!installedChan && installedSim) {
      const installedVer = (installedSim.version || '').trim();
      let betaCachedVersions = [];
      if (dlRec) {
        if (dlRec.channel === 'Beta' && typeof dlRec.version === 'string') betaCachedVersions.push(dlRec.version.trim());
        const vars = dlRec.variants || {};
        for (const v of Object.values(vars)) {
          if (v && v.channel === 'Beta' && typeof v.version === 'string') betaCachedVersions.push(v.version.trim());
        }
      }
      betaCachedVersions = betaCachedVersions.filter(Boolean);
      const remoteBetaVer = (simTag === 'FS2020') ? (remoteVersBeta?.FS2020 || '').trim() : (remoteVersBeta?.FS2024 || '').trim();
      if (installedVer) {
        if (betaCachedVersions.includes(installedVer)) {
          installedChan = 'Beta';
        } else if (remoteBetaVer && installedVer === remoteBetaVer) {
          installedChan = 'Beta';
        }
      }
    }
  } catch {}
  installedChan = /beta/i.test(installedChan) ? 'Beta' : 'Public';
  // Use effectiveSelectedChanSim (may unify mismatched first-frame channels for 2020+ products)
  const channelDiffers = !!installedSim && installedChan && (installedChan !== effectiveSelectedChanSim);
  // Declare update-comparison vars HERE so they are initialized before the mode/label if-else chain below.
  // (Babel transpiles const→var; referencing them after the chain caused them to be undefined/falsy
  //  and broke the "Replace vOLD with vNEW" update flow entirely.)
  const installedVersionForSim2 = simTag === 'FS2020' ? installed2020Version : installed2024Version;
  const dlVersionForSim2 = (typeof effectiveDlRec?.version === 'string' && effectiveDlRec.version.trim()) ? effectiveDlRec.version.trim() : '';
  const sameBranch = installedChan === effectiveSelectedChanSim;
  const sameBranchNewerDownloaded2 = (!!dlVersionForSim2 && sameBranch && installedVersionForSim2 && compareVersionsNormalized(dlVersionForSim2, installedVersionForSim2) > 0);
  // Remote newer (update available) even if not downloaded yet
  const remoteNewerThisSim = (simTag === 'FS2020') ? !!hasUpdate2020 : !!hasUpdate2024;
    // Gather cached variants by channel
    const cachedVariants = (() => {
      const items = [];
      const pushFrom = (rec, fromSim) => {
        if (!rec) return;
        if (rec.localPath) {
          // Inherit parent channel if variant record lacks it
          const channel = rec.channel || '';
          items.push({ base: zipBase(rec.variantZip || ''), rec: { localPath: rec.localPath, channel, variantZip: rec.variantZip }, fromSim });
        }
        const vars = rec.variants || {};
        Object.entries(vars).forEach(([k, v]) => {
          if (v?.localPath) {
            const channel = v.channel || rec.channel || '';
            items.push({ base: k, rec: { ...v, channel }, fromSim });
          }
        });
      };
      pushFrom(dlRec, simTag);
      // Include other-sim cache for FS2020+ products
      if (dlAlt) pushFrom(dlAlt, simTag === 'FS2020' ? 'FS2024' : 'FS2020');
      return items;
    })();
  // Only accept entries with an explicit channel tag matching the selection; do not assume missing means Public
  const cachedForSelectedChannel = cachedVariants.filter(v => {
    let ch = v.rec?.channel || '';
    if (!ch) {
      const inferred = inferChannelFromRecord(v.rec) || '';
      if (inferred) {
        ch = inferred;
        // Persist inference so future passes have explicit channel
        try {
          if (product?.id && v.rec?.localPath) {
            const recSim = v.fromSim || simTag;
            const patch = {};
            // Distinguish base vs variant by presence of variantZip/baseZip keys if present
            if (v.rec.variantZip) patch.variantZip = v.rec.variantZip;
            if (v.rec.baseZip) patch.baseZip = v.rec.baseZip;
            patch.channel = inferred;
            writeDlCache(product.id, recSim, patch, inferred);
          }
  } catch (e) { if (__SWS_DEBUG_GLOBAL) console.debug('Persist inferred channel failed', e); }
      }
    }
    if (ch) {
      if (ch === effectiveSelectedChanSim) return true;
  if (is2020Plus && v.fromSim !== simTag && ch === effectiveSelectedChanSim) return true; // only when unified mode active
      return false;
    }
    return false;
  });
  // Strict channel enforcement: no cross-channel cache reuse.
  // If selected channel has no cached files, the user must download for that channel.
  // For install enablement, prefer an exact variant match; when expectedZip is not set, accept any cached variant for this channel
  const cachedForSelectedAndVariant = cachedForSelectedChannel.filter(v => expectedZip ? zipEquivalent(v.rec?.variantZip || '', expectedZip) : true);
  const hasZipForSelected = hasVariantsForSim
    ? (cachedForSelectedAndVariant.length > 0)
    : (baseOkHereForSelected || baseOkAltForSelected || baseOkOtherHere || baseOkOtherAlt);

  // Base availability must align with the expected package (channel or version match)
  const hasBaseForSelectedChan = !!(baseOkHereForSelected || baseOkAltForSelected || baseOkOtherHere || baseOkOtherAlt);

  let hasZipForSelectedEffective = hasZipForSelected;
  // Re-evaluate after channel version-reuse augmentation
  if (!hasZipForSelectedEffective && cachedForSelectedChannel.length > 0) {
    hasZipForSelectedEffective = true;
  }
  // Cross-sim reuse for 2020+ products: allow other sim's cache for the selected channel to satisfy readiness (especially Beta FS2024 using FS2020 cache)
  try {
    if (!hasZipForSelectedEffective && is2020Plus && dlAlt && (dlAlt.channel === effectiveSelectedChanSim)) {
      if (dlAlt.localPath || (dlAlt.variants && Object.values(dlAlt.variants).some(v => v?.localPath))) {
        hasZipForSelectedEffective = true;
      }
    }
  } catch {}

  let mode, label, enabled = true;
  // Product not available for this sim at all (no zips defined)
  // Also honour the global noAvailableDownloads flag (download button already confirmed working)
  // so FS2020+ install buttons stay in sync with the download button.
  if ((noZipDefinedForSim || noAvailableDownloads) && !installedSim) {
    mode = 'unavailable';
    label = 'Currently Not Available';
    enabled = false;
  }
  // Installed but selected channel has no files on CDN: show uninstall but indicate channel unavailable
  else if (installedSim && noRemoteForSelectedChannel && !installingThis && !downloadingThis && !downloadingOther) {
    mode = 'uninstall';
    let installedVersionForSim = simTag === 'FS2020' ? installed2020Version : installed2024Version;
    const uninstallVer = (installedVersionForSim || '').trim();
    label = `Uninstall${uninstallVer ? ` v${uninstallVer}` : ''} (${effectiveSelectedChanSim} N/A)`;
    enabled = true;
  }
  // If any download is running for this product:
  //  - Active sim should still look like an Install button (no "Downloading" wording) and allow cancel.
  //  - Other sim shows its normal Install/Uninstall label but disabled.
  // Ordering: installing has precedence over downloading so the button doesn't revert mid-install.
  else if (installingThis) { mode='installing'; label='Installing…'; enabled=false; }
  else if (downloadingThis) {
    mode='downloading';
    // Build an Install-style label (same logic as the !installedSim branch) without using the word "Downloading".
    if (!installedSim) {
      // Prefer the cached version that will be installed; allow remote as fallback while downloading
      const cachedVariantSelectedVersion = (() => {
        try {
          const pick = cachedForSelectedAndVariant[0] || null;
          if (pick && typeof pick.rec?.version === 'string') return String(pick.rec.version).trim();
          if (dlRec && (dlRec.channel || inferChannelFromRecord(dlRec) || 'Public') === effectiveSelectedChanSim && typeof dlRec.version === 'string') return String(dlRec.version).trim();
        } catch {}
        return '';
      })();
      const dlVersionForSim = cachedVariantSelectedVersion;
      const remoteVersionForSim = rvEffectiveForLabel;
      const inferredDlChan = dlRec?.channel || inferChannelFromRecord(dlRec) || (dlRec ? 'Public' : '');
      if (effectiveSelectedChanSim === 'Beta') {
        const cachedVerMatchesSelection = dlVersionForSim;
        const ver = cachedVerMatchesSelection || remoteVersionForSim;
        label = `Install (Beta) ${ver ? `v${ver} ` : ''}`;
      } else {
        const cachedVerMatchesSelection = dlVersionForSim;
        const ver = cachedVerMatchesSelection || remoteVersionForSim;
        label = `Install (Public) ${ver ? `v${ver} ` : ''}`;
      }
    } else if (installedSim && channelDiffers) {
      // Channel switch scenario underway (download happening for target channel)
  // Use unified effective version so both sim buttons show the same latest when product is 2020+
  const remoteVersionForSim = rvEffectiveForLabel;
      label = `Install (${effectiveSelectedChanSim}) ${remoteVersionForSim ? `v${remoteVersionForSim} ` : ''}`;
    } else if (installedSim && sameBranchNewerDownloaded2) {
      const dlVersionForSim = dlVersionForSim2 || rvEffectiveForLabel || '';
      const ivForLabel = (simTag === 'FS2020' ? installed2020Version : installed2024Version) || '';
      label = ivForLabel && dlVersionForSim
        ? `Replace v${ivForLabel} with v${dlVersionForSim} (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'beta' : 'public'})`
        : `Install (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'Beta' : 'Public'}) ${dlVersionForSim ? `v${dlVersionForSim} ` : ''}`;
    } else if (installedSim) {
      // Up-to-date installed: keep Uninstall wording even during unrelated download on this sim
      let installedVersionForSim = simTag === 'FS2020' ? installed2020Version : installed2024Version;
      const uninstallVer = (installedVersionForSim || '').trim();
      label = `Uninstall${uninstallVer ? ` v${uninstallVer}` : ''} (${installedChan === 'Beta' ? 'beta' : 'public'})`;
    }
    enabled = true; // keep clickable to allow cancel logic elsewhere (click handler already treats mode==='downloading' specially)
  }
  else if (downloadingOther) {
    mode='downloading';
    // Mirror normal label but disable interaction (no custom busy wording).
    if (!installedSim) {
      const cachedVariantSelectedVersion = (() => {
        try {
          const pick = cachedForSelectedAndVariant[0] || null;
          if (pick && typeof pick.rec?.version === 'string') return String(pick.rec.version).trim();
          if (dlRec && (dlRec.channel || inferChannelFromRecord(dlRec) || 'Public') === effectiveSelectedChanSim && typeof dlRec.version === 'string') return String(dlRec.version).trim();
        } catch {}
        return '';
      })();
      const dlVersionForSim = cachedVariantSelectedVersion;
      const remoteVersionForSim = rvEffectiveForLabel;
      if (effectiveSelectedChanSim === 'Beta') {
        const cachedVerMatchesSelection = dlVersionForSim;
        const ver = cachedVerMatchesSelection || remoteVersionForSim;
        label = `Install (Beta) ${ver ? `v${ver} ` : ''}`;
      } else {
        const cachedVerMatchesSelection = dlVersionForSim;
        const ver = cachedVerMatchesSelection || remoteVersionForSim;
        label = `Install (Public) ${ver ? `v${ver} ` : ''}`;
      }
    } else if (installedSim && channelDiffers) {
  // Use unified effective version so both sim buttons show the same latest when product is 2020+
  const remoteVersionForSim = rvEffectiveForLabel;
      label = `Install (${effectiveSelectedChanSim}) ${remoteVersionForSim ? `v${remoteVersionForSim} ` : ''}`;
    } else if (installedSim && sameBranchNewerDownloaded2) {
      const dlVersionForSim = dlVersionForSim2 || rvEffectiveForLabel || '';
      const ivForLabel = (simTag === 'FS2020' ? installed2020Version : installed2024Version) || '';
      label = ivForLabel && dlVersionForSim
        ? `Replace v${ivForLabel} with v${dlVersionForSim} (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'beta' : 'public'})`
        : `Install (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'Beta' : 'Public'}) ${dlVersionForSim ? `v${dlVersionForSim} ` : ''}`;
    } else if (installedSim) {
      let installedVersionForSim = simTag === 'FS2020' ? installed2020Version : installed2024Version;
      const uninstallVer = (installedVersionForSim || '').trim();
      label = `Uninstall${uninstallVer ? ` v${uninstallVer}` : ''} (${installedChan === 'Beta' ? 'beta' : 'public'})`;
    }
    enabled = false;
  }
    else if (!installedSim) {
      // Always show Install label; if files not cached yet, keep button disabled (user must use main Download button)
      const cachedVariantSelectedVersion = (() => {
        try {
          const pick = cachedForSelectedAndVariant[0] || null;
          if (pick && typeof pick.rec?.version === 'string') return String(pick.rec.version).trim();
          if (dlRec && (dlRec.channel || inferChannelFromRecord(dlRec) || 'Public') === effectiveSelectedChanSim && typeof dlRec.version === 'string') return String(dlRec.version).trim();
        } catch {}
        return '';
      })();
      const dlVersionForSim = cachedVariantSelectedVersion;
      const haveCacheForChannel = hasZipForSelectedEffective && (!needsBaseForThisSim || hasBaseForSelectedChan);
      if (haveCacheForChannel) {
        // Downloaded and ready: show Install with version
        const ver = dlVersionForSim || rvEffectiveForLabel || '';
        const chanLabel = effectiveSelectedChanSim === 'Beta' ? 'Beta' : 'Public';
        label = `Install (${chanLabel}) ${ver ? `v${ver} ` : ''}`;
      } else {
        // Not downloaded yet: tell user to download first
        const ver = rvEffectiveForLabel || '';
        label = `Download to Install ${ver ? `v${ver} ` : ''}`;
      }
      mode = 'install';
      enabled = !!installPath && haveCacheForChannel; // disable until cache ready
    } else if (installedSim && channelDiffers) {
      // Installed but selected channel differs: require user to manually use Download first (no auto download/uninstall)
      mode = 'switch-install';
  // Use unified effective version so both sim buttons show the same latest when product is 2020+
  const remoteVersionForSim = rvEffectiveForLabel;
      const haveCacheForSwitch = hasZipForSelectedEffective && (!needsBaseForThisSim || hasBaseForSelectedChan);
      if (haveCacheForSwitch) {
        label = `Install (${effectiveSelectedChanSim}) ${remoteVersionForSim ? `v${remoteVersionForSim} ` : ''}`;
      } else {
        label = `Download to Install ${remoteVersionForSim ? `v${remoteVersionForSim} ` : ''}`;
      }
      // Only enabled once target channel ZIP (and base if needed) is present
      enabled = !!installPath && haveCacheForSwitch;
    } else if (installedSim && sameBranchNewerDownloaded2) {
      // Installed and same channel, but newer downloaded: allow update
      mode = 'install';
  const dlVersionForSim = dlVersionForSim2 || rvEffectiveForLabel || '';
  const ivForLabel = (simTag === 'FS2020' ? installed2020Version : installed2024Version) || '';
      label = ivForLabel && dlVersionForSim
        ? `Replace v${ivForLabel} with v${dlVersionForSim} (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'beta' : 'public'})`
        : `Install (${(effectiveSelectedChanSim||installedChan)==='Beta' ? 'Beta' : 'Public'}) ${dlVersionForSim ? `v${dlVersionForSim} ` : ''}`;
      enabled = !!installPath && hasZipForSelectedEffective && (!needsBaseForThisSim || hasBaseForSelectedChan);
    } else {
      // Installed present and same channel: Uninstall remains the primary action
      // (If a newer remote version exists but isn't downloaded yet, the main Download button
      mode = 'uninstall';
  const _isPanelModFolder = (name) => /^[a-z][-_]/i.test(name) || /(pms|pms50|tds|gtn|panel)/i.test(name);
  const simFolder = String(installedSim?.folder || '').toLowerCase();
  const installedIsPanelMod = _isPanelModFolder(simFolder);
  let installedVersionForSim = simTag === 'FS2020' ? installed2020Version : installed2024Version;
  let uninstallVer = String(installedVersionForSim || '').trim();
  if (!uninstallVer && !installedIsPanelMod) {
    // Try base item's version first, then installedSim.version — only for non-panel-mod installs
    const baseItem = simTag === 'FS2020' ? installedBase2020 : installedBase2024;
    const cand1 = (baseItem?.version || installedSim?.version || '');
    if (cand1) uninstallVer = cand1.trim();
  }
  if (!uninstallVer && !installedIsPanelMod) {
    // Try variantZip or folder name pattern — skip for panel-mods
    const cand2 = extractVersionCandidate(installedSim?.variantZip || installedSim?.folder || '');
    if (cand2) uninstallVer = cand2;
  }
  if (!uninstallVer && !installedIsPanelMod) {
    try { // Persisted last known — skip for panel-mods (stored value may be from panel mod install)
      const key = `sws_version_${product.id}_${simTag}`;
      const stored = localStorage.getItem(key);
      if (stored) uninstallVer = stored;
    } catch {}
  }
      // Show installed variant (e.g., PMS/TDS) next to the version when we can infer it
      let variantLabel = '';
      try {
        const raw = installedSim
          ? (installedSim?.variantZip ? componentLabelForZip(product, installedSim.variantZip) : inferVariantLabelFromItem(product, installedSim))
          : '';
        let cleaned = String(raw || '')
          .replace(/\b(public|beta)\b/ig, '')
          .replace(/[\-–—,:;]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        // Remove duplicate product name fragments (e.g., GA-8, Airvan) so only the true variant (PMS, TDS, etc.) remains
        const baseNameBits = [
          ...(product?.name ? _toTokens(product.name) : []),
          ...(product?.bunny?.folder ? _toTokens(product.bunny.folder) : [])
        ];
        if (cleaned) {
          const words = cleaned.split(/\s+/);
          const filtered = words.filter(w => {
            const norm = w.toLowerCase();
            // keep if looks like an avionics/mod token (pms, tds, gtn, wt) or not part of base name tokens
            if (/^(pms|tds|gtn|wt|g3000|g1000|mod|panel)$/i.test(norm)) return true;
            // Drop generic filler tokens entirely
            if (/^(sws|aircraft|avionics|sim|flight|studios?)$/i.test(norm)) return false;
            return !baseNameBits.includes(norm.replace(/[^a-z0-9]/g,''));
          });
          cleaned = filtered.join(' ').trim();
        }
        if (!/[a-z0-9]/i.test(cleaned) || /^base$/i.test(cleaned)) cleaned = '';
        variantLabel = cleaned;
      } catch {}
      // Heuristic correction: avoid showing a spurious very old fallback version (like 0.1.0) when we
      // clearly know a newer version from remote metadata or the sibling sim (for 2020+ unified products).
      try {
        const suspicious = uninstallVer && /^0\.(0|1)\.0$/i.test(uninstallVer);
        const betterRemote = (remoteVersionForSimAll || '').trim();
        // Attempt cross-sim propagation if unified product and other sim has a better version
        let otherSimVersion = '';
        if (typeof is2020Plus !== 'undefined' && is2020Plus) {
          otherSimVersion = (simTag === 'FS2020' ? (installedVers?.FS2024||'') : (installedVers?.FS2020||'')).trim();
        }
        if (suspicious) {
          if (otherSimVersion && compareVersionsNormalized(otherSimVersion, uninstallVer) > 0) {
            if (window.__SWS_DEBUG_GLOBAL) console.debug('[sws] corrected uninstall version from', uninstallVer, 'to sibling', otherSimVersion);
            uninstallVer = otherSimVersion;
          } else if (betterRemote && compareVersionsNormalized(betterRemote, uninstallVer) > 0) {
            if (window.__SWS_DEBUG_GLOBAL) console.debug('[sws] corrected uninstall version from', uninstallVer, 'to remote', betterRemote);
            uninstallVer = betterRemote;
          }
        }
      } catch {}
  // Show aircraft version clearly, and move variant as a trailing segment after the year
  label = `Uninstall${uninstallVer ? ` v${uninstallVer}` : ''} (${installedChan === 'Beta' ? 'beta' : 'public'})${variantLabel ? ` • ${variantLabel}` : ''}`;
      enabled = !!installedSim;
    }

    const simAllowed = (simTag === 'FS2020') ? can2020 : can2024;
    if (!simAllowed) enabled = false;

  const readyNow = (mode === 'install') && hasZipForSelectedEffective && installPath && simAllowed && !suppressReadyBySim[simTag] && !!readyLabelGuard;

    const installedVariantDifferent =
      !!installedSim &&
      !!expectedZip &&
      !!installedSim.variantZip &&
  !zipEquivalent(installedSim.variantZip, expectedZip);

  const title =
    (mode === 'unavailable') ? `This product is not yet available for FS${year}` :
    !simAllowed ? `Not compatible with ${year}` :
    (mode === 'downloading' && downloadingThis) ? 'Click to cancel download' :
    (mode === 'downloading') ? 'Download in progress' :
    (mode === 'uninstall') ? `Remove installed files for ${year}` :
    !installPath ? `Set MSFS ${year} path in Settings` :
  (mode === 'install' && !hasZipForSelectedEffective) ? `Use the main Download button to fetch files first` :
    (mode === 'install' && needsBaseForThisSim && !hasBaseForSelectedChan) ? `Base files required for ${effectiveSelectedChanSim}. Use Download to fetch base, then install.` :
    (mode === 'switch-install' && !hasZipForSelected) ? `Download target channel first` :
    (mode === 'switch-install' && needsBaseForThisSim && !hasBaseForSelectedChan) ? `Base files required for ${effectiveSelectedChanSim}. Use Download to fetch base, then install.` :
    (mode === 'install' && readyNow) ? (rvUsedFallbackFromPublic ? 'Ready – version shown is Public until Beta resolves' : 'Ready – click to install') :
    (mode === 'uninstall' && installedVariantDifferent) ? `A different variant is installed. Uninstall to switch.` :
    (mode === 'switch-install' && !installPath) ? `Set MSFS ${year} path in Settings` :
    (mode === 'switch-install') ? `Switch to ${effectiveSelectedChanSim}. This will uninstall then install using the cached ZIP once downloaded.` :
    (mode === 'install') ? 'Install downloaded ZIP' : '';

  // If another sim is downloading for this product, disable actions on this button
  if (downloadingOther || installingOther) { enabled = false; }

  const isDisabled = !enabled;
  // Revised color semantics (from theme):
  // Public install = green, Beta install = amber, Uninstall = red, Disabled/update pending = gray
  const colorInstallPublic = SWS_THEME.fill.public;
  // Base beta fill (solid). We'll optionally apply the same gradient for consistency
  const colorInstallBetaSolid = SWS_THEME.fill.beta;
  const colorUninstall = SWS_THEME.fill.uninstall;
  const colorGrayFill = SWS_THEME.fill.gray;
  // Removed distinct blue download color per updated spec; downloading now uses channel color for continuity.
  const outlinePublic = SWS_THEME.outline.public;
  const outlineBeta = SWS_THEME.outline.beta;
  // Subtle Beta style gradient (now aligned with theme beta fill)
  const betaSubtleGradient = SWS_THEME.fill.beta;

    // Determine outline (installed channel) and fill (target action)
    // Outline rule:
    // - If installed and selected channel differs, show installed channel as outline (FS2020 example: public installed while Beta selected)
    // - Otherwise, outline indicates the selected (target) channel
    // Revised outline rules:
    // 1. If a Beta build is installed (installedChan === 'Beta'), always show a solid yellow outline.
    // 2. Else always show solid green outline (regardless of selectedChan) to reinforce stable baseline.
    // (Channel intent now conveyed mainly by fill/stripes rather than outline color flipping.)
    // Outline reflects installed channel; if none installed, reflects target channel.
    // For unavailable products, use neutral outline.
    let outlineColor = mode === 'unavailable'
      ? SWS_THEME.outline.neutral
      : installedSim
        ? (installedChan === 'Beta' ? outlineBeta : outlinePublic)
        : (effectiveSelectedChanSim === 'Beta' ? outlineBeta : outlinePublic);


    // Fill logic per spec
    let bg;
    if (mode === 'unavailable') {
      bg = colorGrayFill;
    } else if (mode === 'downloading' || mode === 'installing') {
      // Use target channel color during downloading/installing instead of blue; overlay progress elsewhere.
      bg = (effectiveSelectedChanSim === 'Beta') ? colorInstallBetaSolid : colorInstallPublic;
    } else if (mode === 'uninstall') {
      bg = (installedChan === 'Beta') ? colorInstallBetaSolid : colorInstallPublic;
    } else if (!installedSim) {
      // Fresh install – target channel color
      bg = (effectiveSelectedChanSim === 'Beta') ? colorInstallBetaSolid : colorInstallPublic;
    } else if (installedSim && installedChan !== effectiveSelectedChanSim) {
      // Channel switch – target channel color (outline stays installed channel)
      bg = (effectiveSelectedChanSim === 'Beta') ? colorInstallBetaSolid : colorInstallPublic;
    } else if (sameBranchNewerDownloaded2 || remoteNewerThisSim) {
      // Update available in same branch (downloaded or remote) – gray
      bg = colorGrayFill;
    } else {
      // Up-to-date same branch – fill matches outline (installed channel color)
      bg = (installedChan === 'Beta') ? colorInstallBetaSolid : colorInstallPublic;
    }

    // Beta action visual: replace prior stripe pattern with a cleaner solid gradient for readability
    // Extend Beta visual treatment to downloading/installing so text contrast stays consistent.
    const isBetaTheme = (effectiveSelectedChanSim === 'Beta') && (mode === 'install' || mode === 'switch-install' || mode === 'downloading' || mode === 'installing');
    if (isBetaTheme && bg === colorInstallBetaSolid) {
      bg = betaSubtleGradient;
    }

    // FS2020 install button: split background (top #3a3f4b, bottom #404653)
    if (simTag === 'FS2020' && (mode === 'install' || mode === 'switch-install' || mode === 'downloading' || mode === 'installing' || mode === 'uninstall')) {
      bg = 'linear-gradient(180deg, #3a3f4b 50%, #404653 50%)';
    }
    // FS2024 install button: split background (top #2f3d5b, bottom #334363)
    if (simTag === 'FS2024' && (mode === 'install' || mode === 'switch-install' || mode === 'downloading' || mode === 'installing' || mode === 'uninstall')) {
      bg = 'linear-gradient(180deg, #2f3d5b 50%, #334363 50%)';
    }

    // Keep outline color to reflect installed/target channel even when disabled or update (gray fill)
    // per spec: outline conveys channel; fill conveys action/state.

  // Append remote version into install label if missing
    try {
      // Ensure Install labels include the correct channel-specific remote version if omitted
      if (/^install/i.test(label || '') && (mode === 'install')) {
        const rvForLabel = rvEffectiveForLabel || '';
        if (rvForLabel && !/ v\d+/i.test(label)) {
          // Insert before the bullet year separator if not already present
          const yearTag = `• ${year}`;
          if (!label.includes(yearTag)) {
            label = label.replace(/ • .*$/,''); // strip trailing if malformed
            label = `${label} ${yearTag}`;
          }
          if (!/ v\d+/i.test(label)) {
            label = label.replace(/(Install \(Beta\)|Install \(Public\)|Install)(?! v)/i, (m)=>`${m} v${rvForLabel}`);
          }
        }
      }
    } catch {}

    // Base foreground color
    let fg = '#ffffff';
    const labelTextShadow = 'none';
  // No overlay stripes anymore (banner already has hazard styling; buttons stay readable)
  const wantsStripes = false;

  const onClick = async () => {
      if (!enabled) return;
      // (download mode removed – per-sim button no longer initiates downloads directly)
      if (mode === 'downloading' && downloadingThis) {
        try { handleCancelDownload?.(); } catch {}
        return;
      }
      if (mode === 'uninstall') {
        if (installedSim) { await handleUninstall(installedSim); }
        return;
      }
      if (mode === 'switch-install') {
        // One-click channel switch: if target channel ZIP (and base if required) is cached,
        // uninstall current then immediately install target channel without requiring a second click.
        try {
          // Safety: if somehow enabled state desynced, do not uninstall unless cache is ready
          const haveCacheReady = !!hasZipForSelectedEffective && (!needsBaseForThisSim || hasBaseForSelectedChan);
          if (!haveCacheReady) {
            onStatus?.(`Target ${effectiveSelectedChanSim} files not cached for FS${year}. Use Download first.`);
            return;
          }
          // Verify the cached file actually exists on disk before uninstalling.
          // Use window.electron.statFile (IPC to main) because require('fs') is not
          // available in the renderer (nodeIntegration: false, contextIsolation: true).
          const _fExist = async (p) => { try { const s = await window.electron.statFile(p); return !!(s && (s.isFile || s.size >= 0)); } catch { return false; } };
          const preCheck = await (async () => {
            try {
              const recs = [dlRec, dlAlt, dlRecOtherParam, dlAltOtherParam].filter(Boolean);
              // Also read fresh from localStorage in case in-memory refs are stale
              try {
                const freshHere = readDlCacheForProduct(product, simTag, effectiveSelectedChanSim);
                if (freshHere) recs.push(freshHere);
                if (is2020Plus) {
                  const otherSim = simTag === 'FS2020' ? 'FS2024' : 'FS2020';
                  const freshOther = readDlCacheForProduct(product, otherSim, effectiveSelectedChanSim);
                  if (freshOther) recs.push(freshOther);
                }
              } catch {}
              for (const rec of recs) {
                const vars = rec.variants || {};
                const entries = Object.values(vars).filter(v => {
                  if (!v?.localPath) return false;
                  const ch = (v.channel || rec.channel || '').trim();
                  return !ch || ch === effectiveSelectedChanSim;
                });
                for (const v of entries) { if (await _fExist(v.localPath)) return true; }
                if (rec.localPath) {
                  const ch = (rec.channel || '').trim();
                  if ((!ch || ch === effectiveSelectedChanSim) && await _fExist(rec.localPath)) return true;
                }
                if (rec.baseLocalPath && await _fExist(rec.baseLocalPath)) return true;
              }
              return false;
            } catch { return false; }
          })();
          if (!preCheck) {
            onStatus?.(`Cached ${effectiveSelectedChanSim} files not found on disk for FS${year}. Click the Download button to fetch ${effectiveSelectedChanSim} files.`);
            return;
          }
          if (installedSim) {
            onStatus?.(`Uninstalling current ${installedChan} • ${year}…`);
            const uninstallResult = await handleUninstall(installedSim);
            if (uninstallResult?.skipped) {
              onStatus?.('Another operation is in progress. Try again in a moment.');
              return;
            }
          }
          // Fall through to the normal install path below (variant selection, base alignment, install)
        } catch (e) {
          onStatus?.('Uninstall failed: ' + (e?.message || String(e)));
          return;
        }
        // do not return; continue into install flow below
      }

      // Same-channel update: if installed and a newer version is cached, uninstall old first
      if (mode === 'install' && installedSim && sameBranchNewerDownloaded2) {
        try {
          onStatus?.(`Updating: removing current v${installedVersionForSim2 || '?'} • FS${year}…`);
          const uninstallResult = await handleUninstall(installedSim);
          if (uninstallResult?.skipped) {
            onStatus?.('Another operation is in progress. Try again in a moment.');
            return;
          }
        } catch (e) {
          onStatus?.('Uninstall failed: ' + (e?.message || String(e)));
          return;
        }
        // Fall through to install the new version
      }

      const basePath = installPath;
      const zipName = (expectedZip || '').toLowerCase();
      const isPMS = zipName.includes('pmsgtn');
      const isTDS = zipName.includes('tdsgtn');

      // If no cached files for the selected channel, do nothing; user should use the Download button
  if (!hasZipForSelectedEffective) { return; }

      if (isPMS) {
        const present = await hasCommunityPackage(basePath, ['pms', 'gtn', '750']) ||
                        await hasCommunityPackage(basePath, ['pms50', 'gtn']);
        if (!present) {
          const ok = window.confirm(
            'PMS50 GTN750 package does not seem to be installed in your Community folder.\n' +
            'You need the PMS50 GTN750 mod for the PMS variant to show in the cockpit.\n\n' +
            'Install anyway?'
          );
          if (!ok) return;
        }
      } else if (isTDS) {
        const present = await hasCommunityPackage(basePath, ['tds', 'gtn', 'xi']) ||
                        await hasCommunityPackage(basePath, ['tds', 'gtn']);
        if (!present) {
          const ok = window.confirm(
            'TDS GTNxi package does not seem to be installed in your Community folder.\n' +
            'You need the TDS GTNxi add-on (and its app running) for the TDS variant to show.\n\n' +
            'Install anyway?'
          );
          if (!ok) return;
        }
      }

      // Build cached variant list upfront and prompt immediately if multiple are available
      const variantEntriesPre = (() => {
        const list = [];
        const pushFrom = (rec) => {
          if (!rec) return;
          if (rec.localPath) list.push({ base: zipBase(rec.variantZip || expectedZip || ''), rec: { localPath: rec.localPath, channel: rec.channel, variantZip: rec.variantZip || expectedZip } });
          const vars = rec.variants || {};
          for (const [k, v] of Object.entries(vars)) { if (v?.localPath) list.push({ base: k, rec: v }); }
        };
        pushFrom(dlRec);
        // Include other-sim cache for FS2020+ products
        pushFrom(dlAlt);
        // Strict to selected channel
        const filtered = list.filter(x => (x?.rec?.channel || 'Public') === selectedChanSim);
        const seen = new Set();
        const byChan = filtered.filter(x => { const b = x.base || ''; if (seen.has(b)) return false; seen.add(b); return true; });
        // Strict: only return entries that match the selected channel.
        // Cross-channel version-match reuse is handled earlier by cachedForSelectedChannel.
        return byChan;
      })();

      if (variantEntriesPre.length > 1) {
        // Open modal BEFORE any base installation so user selects variant first
        setPendingSimForInstall(simTag);
        const want = zipBase(expectedZip || '');
        const first = variantEntriesPre.find(e => e.base === want) || variantEntriesPre[0];
        setInstallVariantChoice(first?.rec?.variantZip || first?.base || '');
        // Snapshot ALL variant entries + dlRec so the Install handler doesn't need to re-derive
        const snapMap = {};
        for (const entry of variantEntriesPre) {
          if (entry.rec?.localPath) snapMap[entry.base] = entry.rec;
        }
        installVariantSnapshotRef.current = { variants: snapMap, dlRec, dlAlt, channel: selectedChanSim, baseLocalPath: dlRec?.baseLocalPath || dlAlt?.baseLocalPath || '' };
        setShowInstallVariantModal(true);
        return;
      }

      // Determine the single chosen cached variant (if any)
      let chosenPre = variantEntriesPre[0] || null;
      // If still nothing usable and this is a base-only product (no variants), allow base ZIP
      if (!chosenPre) {
        try {
          const baseZipName = getBaseZipForSim(product, simKey);
          const baseKey = zipBase(baseZipName || '');
          const baseOkHere = dlRec && dlRec.baseLocalPath && (!!baseKey ? zipBase(dlRec.baseZip||'') === baseKey : true);
          const baseOkAlt  = dlAlt && dlAlt.baseLocalPath && (!!baseKey ? zipBase(dlAlt.baseZip||'') === baseKey : true);
          if (baseOkHere) {
            chosenPre = { base: baseKey, rec: { localPath: dlRec.baseLocalPath, channel: (dlRec.channel||selectedChanSim), variantZip: baseZipName } };
          } else if (baseOkAlt) {
            chosenPre = { base: baseKey, rec: { localPath: dlAlt.baseLocalPath, channel: (dlAlt.channel||selectedChanSim), variantZip: baseZipName } };
          }
        } catch {}
      }
      // If multiple candidates but none match expectedZip, prefer one that matches expected
      if (!chosenPre && variantEntriesPre.length > 0 && expectedZip) {
        const exact = variantEntriesPre.find(e => zipEquivalent(e?.rec?.variantZip||'', expectedZip));
        if (exact) chosenPre = exact;
      }
      const chosenVariantZip = (chosenPre?.rec?.variantZip) || dlRec?.variantZip || dlAlt?.variantZip || expectedZip;
      const chosenVariantLocal = (chosenPre?.rec?.localPath) || dlRec?.localPath || dlAlt?.localPath || '';
      // Strict: use the selected channel. Cached artifacts must already match (no cross-channel reuse).
      const chosenVariantChannel = (getChan(simTag) || chosenPre?.rec?.channel || dlRec?.channel || dlAlt?.channel || 'Public');

      // Remove any sibling panel variants for this product in the same Community path
      // Keep Base and the chosen variant; uninstall the rest.
      try {
        const allComps = (product?.bunny?.components || product.components || []);
        const selectedBase = zipBase(chosenVariantZip || expectedZip);
        const baseBase = zipBase(getBaseZipForSim(product, simKey));

        const siblingBases = new Set(
          allComps
            .map(c => {
              const z = c.zipBySim?.[simKey] || c.zip || '';
              return zipBase(z);
            })
            .filter(b => b && b !== selectedBase && b !== baseBase)
        );

        if (siblingBases.size && Array.isArray(aircraftList) && installPath) {
          const samePath = normalizePath(installPath);
          const siblingsInstalled = aircraftList.filter(a => {
            if (!a || a.id !== product.id) return false;
            if (normalizePath(a.communityPath) !== samePath) return false;
            const f = (a.folder || a.name || '').toLowerCase();
            const vz = zipBase(a.variantZip || '');
            for (const sb of siblingBases) {
              if (!sb) continue;
              if (vz === sb || f.includes(sb)) return true;
            }
            return false;
          });

          if (siblingsInstalled.length) {
            onStatus?.(`Removing other panel variants (${siblingsInstalled.length})...`);
            for (const s of siblingsInstalled) {
              try { await handleUninstall(s); } catch {}
            }
          }
        }
      } catch {}
      // Note: render-time fill/outline logic is the single source of truth.
      // Avoid recomputing bg inside handlers to keep UI semantics consistent.

      // If this selection requires a Base package and it's cached, install the Base first
      try {
        if (needsBaseForThisSim) {
          // Choose the correct base zip and localPath (prefer current sim record, then alt)
          const simKeyForBase = simKey; // '2020' | '2024'
          const expectedBaseZip = getBaseZipForSim(product, simKeyForBase);
          // Validate candidate base records against expected
          const baseHereOK = dlRec && dlRec.baseLocalPath && (!!zipBase(expectedBaseZip) ? zipBase(dlRec.baseZip||'') === zipBase(expectedBaseZip) : true);
          const baseAltOK  = dlAlt && dlAlt.baseLocalPath && (!!zipBase(expectedBaseZip) ? zipBase(dlAlt.baseZip||'') === zipBase(expectedBaseZip) : true);
          const baseLocal  = baseHereOK ? dlRec.baseLocalPath : (baseAltOK ? dlAlt.baseLocalPath : '');
          const baseZipUse = baseHereOK ? (dlRec.baseZip || expectedBaseZip) : (baseAltOK ? (dlAlt.baseZip || expectedBaseZip) : expectedBaseZip);
          if (baseLocal) {
            try { setStatus(`Installing base • ${simTag}…`); } catch {}
            await handleInstall(product, baseLocal, simTag, chosenVariantChannel, '', baseZipUse);
          }
        }
      } catch {}

      // Only one cached; install it now (or proceed if legacy single-path)
      const installResult = await handleInstall(
        product,
        chosenVariantLocal,
        simTag,
        chosenVariantChannel,
        '',
        chosenVariantZip
      );
      try {
        if (installResult && installResult.success) {
          const warn = (installResult.linkErrors && installResult.linkErrors.length) ? ' (fallback copy used for some components)' : '';
          const methodSet = installResult.created ? Array.from(new Set(installResult.created.map(c=>c.method))).join(',') : '';
          onStatus?.(`Installed${methodSet?` [${methodSet}]`:''}. Restart MSFS to apply avionics changes.${warn}`);
        } else if (installResult && !installResult.success) {
          onStatus?.('Install finished with errors: ' + (installResult.error || 'unknown'));
        }
      } catch {}
    };

  // Show Modify gear for all products; enable it only when something is installed for this sim
  const showGear = true;
  // Installed version subtext for the button
  const installedVersionSubtext = (() => {
    if (mode === 'unavailable') return 'Currently Not Available';
    if (!installedSim) {
      return hasZipForSelectedEffective ? 'Click to Install' : 'Download Product to Install';
    }
    if (channelDiffers) {
      const haveCacheForSwitch = hasZipForSelectedEffective && (!needsBaseForThisSim || hasBaseForSelectedChan);
      if (haveCacheForSwitch) {
        return 'Click to Install';
      } else {
        return 'Download Product to Install';
      }
    }
    const iv = (simTag === 'FS2020' ? installed2020Version : installed2024Version) || '';
    if (sameBranchNewerDownloaded2) {
      const newVer = dlVersionForSim2 || rvEffectiveForLabel || '';
      return iv && newVer ? `Click to replace v${iv} with v${newVer}` : 'Click to Install Update';
    }
    return iv ? `Click to Uninstall • v${iv}` : 'Click to Uninstall';
  })();
  // Post-process label: split into main part + sim year for space-between layout
  // Also reformat channel from "(Public)" to "(public)" lowercase, placed after version
  const labelSimYear = `FS${year}`;
  let labelMain = label.replace(/\s*•\s*FS?\d{4}\s*$/i, '');
  // Extract channel from "Install (Channel) vX.Y.Z" and move to "Install vX.Y.Z(channel)"
  let labelChannel = '';
  labelMain = labelMain.replace(/^(Install(?:ing)?)\s*\((\w+)\)\s*/i, (m, action, chan) => {
    labelChannel = chan.toUpperCase();
    return `${action} `;
  });
  // Extract channel from "Uninstall vX.Y.Z (public/beta)" for uniform styling
  if (!labelChannel) {
    labelMain = labelMain.replace(/\s*\((public|beta)\)\s*/i, (m, chan) => {
      labelChannel = chan.toUpperCase();
      return ' ';
    });
  }
  return (
    <div key={simTag} style={{ position:'relative', width:'100%', flex:'1 1 auto', display:'flex', flexDirection:'column' }}>
    <button
            type="button"
            disabled={!enabled}
            onClick={onClick}
            title={title}
            style={{
              background: bg,
              color: fg,
              border:'none',
              borderTopLeftRadius:0, borderBottomLeftRadius:0, borderTopRightRadius:0, borderBottomRightRadius:0,
              padding:0,
              fontWeight:500,
              fontSize:16,
              width:'100%',
              minHeight: 48,
              flex: '1 1 auto',
              cursor: enabled ? 'pointer' : 'default',
              display:'flex',
              flexDirection:'column',
              alignItems:'stretch',
              lineHeight:1.1,
              boxShadow: 'none',
              position:'relative',
              overflow:'hidden'
            }}
          >

            <span style={{ flex:'1 1 50%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 12px', position:'relative', zIndex:2, textShadow: labelTextShadow, color: (isBetaTheme ? SWS_THEME.text.onBeta : 'inherit') }}>
              <span>{labelMain}{labelChannel && <span style={{ fontSize:10, fontWeight:600 }}> ({labelChannel})</span>}</span>
              <span style={{ fontWeight:300 }}>{labelSimYear}</span>
            </span>
            {installedVersionSubtext ? (
              <span style={{ flex:'1 1 50%', display:'flex', alignItems:'center', fontSize:10, fontWeight:600, opacity:0.75, padding:'0 12px', position:'relative', zIndex:2, textShadow: labelTextShadow, color: (isBetaTheme ? SWS_THEME.text.onBeta : 'inherit') }}>
                {installedVersionSubtext}
              </span>
            ) : null}
          </button>
      </div>
    );
  }

  // In OwnedAircraftCard, add these computed labels (after installed2020/installed2024 are defined)
  // Only ever show the Base package version. If the detected installed item is a variant, do NOT fall back to its version.
  const baseKey2020 = zipBase(getBaseZipForSim(product, '2020') || '');
  const baseKey2024 = zipBase(getBaseZipForSim(product, '2024') || '');
  // Only show Base package version; never fall back to variant version
  // Installed versions (Base package only). For 2020+ unified products, if one sim reports
  // a version and the other is blank, propagate so both buttons show the same version.
  let installed2020Version = installedVers.FS2020 || '';
  let installed2024Version = installedVers.FS2024 || '';
  // Incorporate the optimistic version from aircraftList immediately so labels don't lag
  // behind the async getPackageVersion IPC (prevents stale "Replace" label after a Replace completes).
  try {
    const opt20 = (installed2020?.version || '').trim();
    const opt24 = (installed2024?.version || '').trim();
    if (opt20 && (!installed2020Version || compareVersionsNormalized(opt20, installed2020Version) > 0)) installed2020Version = opt20;
    if (opt24 && (!installed2024Version || compareVersionsNormalized(opt24, installed2024Version) > 0)) installed2024Version = opt24;
  } catch {}
  // Also consider persisted install versions as authoritative floor (written on successful install)
  try {
    const sv20 = String(localStorage.getItem(`sws_version_${product.id}_FS2020`) || '').trim();
    const sv24 = String(localStorage.getItem(`sws_version_${product.id}_FS2024`) || '').trim();
    if (sv20 && (!installed2020Version || compareVersionsNormalized(sv20, installed2020Version) > 0)) installed2020Version = sv20;
    if (sv24 && (!installed2024Version || compareVersionsNormalized(sv24, installed2024Version) > 0)) installed2024Version = sv24;
  } catch {}
  try {
    const unified = (typeof is2020Plus !== 'undefined' ? is2020Plus : is2020PlusLocal);
    if (unified) {
      // Only propagate version across sims if the target sim has a non-panel-mod install
      // (avoid leaking panel-mod version or propagating base version to a sim with only panel-mod)
      const _isPanelModDir = (name) => /^[a-z][-_]/i.test(name) || /(pms|pms50|tds|gtn|panel)/i.test(name);
      const f2020 = String(installed2020?.folder || '').toLowerCase();
      const f2024 = String(installed2024?.folder || '').toLowerCase();
      const is2020Panel = f2020 && _isPanelModDir(f2020);
      const is2024Panel = f2024 && _isPanelModDir(f2024);
      if (installed2020Version && !installed2024Version && !is2024Panel) installed2024Version = installed2020Version;
      else if (installed2024Version && !installed2020Version && !is2020Panel) installed2020Version = installed2024Version;
    }
  } catch {}
  // [DEBUG] Trace final version values
  if (__SWS_DEBUG_GLOBAL && product?.id) {
    console.debug('[SWS-VERSION-DEBUG] Product:', product.id, product.name,
      '\n  installedVers:', installedVers,
      '\n  installed2020Version:', installed2020Version,
      '\n  installed2024Version:', installed2024Version
    );
  }
  // Sanitize variant labels: strip channel words and trim
  const installed2020VariantLabel = (() => {
    const raw = installed2020
      ? (installed2020?.variantZip ? componentLabelForZip(product, installed2020.variantZip) : inferVariantLabelFromItem(product, installed2020))
      : '';
    let s = String(raw || '')
      .replace(/\b(public|beta)\b/ig, '')
      .replace(/[\-–—,:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    s = stripProductWords(product, s);
    if (!/[a-z0-9]/i.test(s) || /^base$/i.test(s)) s = '';
    if (!s) {
      const fallbackRaw = primaryDistinctVariantLabel(product);
      if (fallbackRaw) {
        let t = String(fallbackRaw)
          .replace(/\b(public|beta)\b/ig, '')
          .replace(/[\-–—,:;]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        t = stripProductWords(product, t);
        if (/[a-z0-9]/i.test(t) && !/^base$/i.test(t)) s = t;
      }
    }
    return s;
  })();
  const installed2024VariantLabel = (() => {
    const raw = installed2024
      ? (installed2024?.variantZip ? componentLabelForZip(product, installed2024.variantZip) : inferVariantLabelFromItem(product, installed2024))
      : '';
    let s = String(raw || '')
      .replace(/\b(public|beta)\b/ig, '')
      .replace(/[\-–—,:;]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    s = stripProductWords(product, s);
    if (!/[a-z0-9]/i.test(s) || /^base$/i.test(s)) s = '';
    if (!s) {
      const fallbackRaw = primaryDistinctVariantLabel(product);
      if (fallbackRaw) {
        let t = String(fallbackRaw)
          .replace(/\b(public|beta)\b/ig, '')
          .replace(/[\-–—,:;]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        t = stripProductWords(product, t);
        if (/[a-z0-9]/i.test(t) && !/^base$/i.test(t)) s = t;
      }
    }
    return s;
  })();
  // installed2020Channel/installed2024Channel defined above (before openChangelog)

  // Compact header install summary: vX (Variant) — Channel (omit the word "Installed")
  const headerInstalledSim = installed2024 ? 'FS2024' : (installed2020 ? 'FS2020' : '');
  const headerVersion = headerInstalledSim === 'FS2024' ? (installed2024Version || '') : (installed2020Version || '');
  // Header channel: prefer the current selection when it differs from what's installed, so UI reflects immediate intent
  const selectedHeaderChan = headerInstalledSim === 'FS2024' ? getChan('FS2024') : getChan('FS2020');
  const installedHeaderChan = headerInstalledSim === 'FS2024' ? (installed2024Channel || '') : (installed2020Channel || '');
  const headerChannel = (selectedHeaderChan && selectedHeaderChan !== installedHeaderChan)
    ? selectedHeaderChan
    : installedHeaderChan;
  const headerInstalledText = (() => {
    if (!headerInstalledSim) return '';
    const parts = [];
    // Only show the installed version when the selected channel matches the installed channel; otherwise omit it
    const showInstalledVersion = (!selectedHeaderChan || selectedHeaderChan === installedHeaderChan);
    if (showInstalledVersion && headerVersion) parts.push(`v${headerVersion}`);
    if (headerChannel) parts.push(`— ${headerChannel}`);
    return parts.join(' ');
  })();

  // Card color reflects the user's SELECTED channel (checkbox), not what's physically installed.
  // If a Beta build is installed but the user switched to Public, the card should turn teal.
  const anyInstalledBeta = !!betaProductChecked;

  // New: compact summary to show next to the product title, including which sim(s)
  const headerInstalledSummary = (() => {
    const parts = [];
  if (installed2020) parts.push(`FS2020${installed2020Version ? ` v${installed2020Version}` : ''}`);
  if (installed2024) parts.push(`FS2024${installed2024Version ? ` v${installed2024Version}` : ''}`);
    return parts.join(' • ');
  })();

  // Channel mismatch notice: user selected Public but a Beta install remains (or inferred Beta)
  const channelMismatch = (
    (getChan('FS2020') === 'Public' && installed2020 && /beta/i.test(installed2020.installedChannel || '')) ||
    (getChan('FS2024') === 'Public' && installed2024 && /beta/i.test(installed2024.installedChannel || ''))
  );

  // Top-of-card changelog preview: show latest DOWNLOADED changelog for the currently selected channel
  const selectedSimForPreview = unifiedSimTag; // FS2020 for 2020+ products
  const selectedChanForPreview = getChan(selectedSimForPreview) || 'Public';
  const rawDlForPreview = selectedSimForPreview === 'FS2020' ? dl2020 : dl2024;
  const dlForPreview = (rawDlForPreview && (rawDlForPreview.channel === selectedChanForPreview)) ? rawDlForPreview : null;
  useEffect(() => {
    // Clear preview if switching channel and no cached artifact yet
    if (!dlForPreview) {
      setPreviewChangelog('');
      setPreviewVersion('');
    }
  }, [dlForPreview, selectedChanForPreview]);
  const [previewChangelog, setPreviewChangelog] = useState('');
  const [previewVersion, setPreviewVersion] = useState('');
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        setPreviewChangelog(''); setPreviewVersion('');
        // Find a downloaded artifact for this channel
        const dl = dlForPreview || null;
        if (!dl) return;
        const ver = (dl.channel === selectedChanForPreview) ? (dl.version || '') : '';
        // Try variant records for this channel
        let candidatePath = '';
        if (dl.channel === selectedChanForPreview && dl.localPath) candidatePath = dl.localPath;
        if (!candidatePath && dl.variants) {
          const entries = Object.values(dl.variants || {}).filter(v => v && v.localPath && (v.channel || 'Public') === selectedChanForPreview);
          if (entries.length) candidatePath = entries[0].localPath;
        }
        if (!candidatePath && dl.baseLocalPath && selectedChanForPreview === dl.channel) candidatePath = dl.baseLocalPath;
        if (!candidatePath || !window.electron?.readChangelogFromZip) return;
        const res = await window.electron.readChangelogFromZip(candidatePath).catch(() => null);
        if (!res || !res.success || !res.changelog) return;
        if (dead) return;
        setPreviewVersion(ver || '');
        setPreviewChangelog(summarizeReleaseNotes(formatReleaseNotesText(String(res.changelog || '').trim())));
      } catch {}
    })();
    return () => { dead = true; };
  }, [dlForPreview?.version, dlForPreview?.channel, dlForPreview?.localPath, JSON.stringify(dlForPreview?.variants || {}), selectedSimForPreview, selectedChanForPreview]);

  // Remote manifest versions (per sim, per channel)
  // Track remote versions per channel to avoid showing wrong version when switching Public/Beta
  // Remote manifest versions cached per channel so switching Public/Beta is instant and not flickery.
  // remoteVersPublic / remoteVersBeta track last fetched versions for each sim by channel.
  const _is24only = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
  const [remoteVersPublic, setRemoteVersPublic] = useState(() => {
    try {
      const warm = window.__swsVersionWarmCache || {};
      const v20 = warm[`${product?.id}:FS2020:Public`] || '';
      const v24 = warm[`${product?.id}:FS2024:Public`] || '';
      return { FS2020: v20, FS2024: v24 };
    } catch { return { FS2020: '', FS2024: '' }; }
  });
  const [remoteVersBeta, setRemoteVersBeta] = useState(() => {
    try {
      const warm = window.__swsVersionWarmCache || {};
      const v20 = warm[`${product?.id}:FS2020:Beta`] || '';
      const v24 = warm[`${product?.id}:FS2024:Beta`] || '';
      return { FS2020: v20, FS2024: v24 };
    } catch { return { FS2020: '', FS2024: '' }; }
  });
  const remoteVersLatchRef = useRef({});
  const directVersionPrefetchRef = useRef(false);
  // Prefer the higher semver when merging remote version results from multiple probes
  const pickMaxVer = useCallback((prev, next) => {
    const A = String(prev || '').trim();
    const B = String(next || '').trim();
    if (!A) return B || '';
    if (!B) return A || '';
    try { return compareVersionsNormalized(B, A) > 0 ? B : A; } catch { return B || A; }
  }, []);

  // Ultra‑simple fast path: directly fetch manifest.json for both channels before any download.
  // This runs once per product and only fills in versions that are still blank, without HEAD requests.
  useEffect(() => {
    if (directVersionPrefetchRef.current) return;
    const folder = product?.bunny?.folder;
    if (!folder) return;
    // If we already have both public & beta for at least one sim, skip.
    const haveAny = !!(remoteVersPublic.FS2020 || remoteVersPublic.FS2024 || remoteVersBeta.FS2020 || remoteVersBeta.FS2024);
    if (haveAny) return; // don't override existing populated values
    // If the warm cache already has a positive version for this product, seed state and skip
    try {
      const pid = product?.id || 'x';
      const wc = window.__swsVersionWarmCache;
      if (wc) {
        const v20 = wc[`${pid}:FS2020:Public`] || '';
        const v24 = wc[`${pid}:FS2024:Public`] || '';
        if (v20 || v24) {
          directVersionPrefetchRef.current = true;
          setRemoteVersPublic(prev => ({
            FS2020: pickMaxVer(prev.FS2020, v20),
            FS2024: pickMaxVer(prev.FS2024, v24)
          }));
          return;
        }
      }
    } catch {}
    directVersionPrefetchRef.current = true;
    let cancelled = false;
    if (window.__SWS_DEBUG_GLOBAL) {
      console.debug('[fast-prefetch] starting', { product: product?.id, folder });
    }
    const parseVersion = (txt) => {
      if (!txt) return '';
      // Try JSON parse first
      try {
        const obj = JSON.parse(txt.replace(/^\uFEFF/, ''));
        const keys = ['package_version','version','Version','currentVersion','latestVersion'];
        for (const k of keys) {
          const v = obj?.[k];
          if (typeof v === 'string' && /[0-9]+\.[0-9]+/.test(v)) return v.replace(/^v/i,'');
        }
      } catch {}
      // Regex fallback
      const m = txt.match(/"package_version"\s*:\s*"([0-9][0-9A-Za-z\.-]*)"/);
      if (m) return m[1];
      const m2 = txt.match(/"version"\s*:\s*"([0-9][0-9A-Za-z\.-]*)"/);
      if (m2) return m2[1];
      return '';
    };
    (async () => {
      const channels = ['Public','Beta'];
      // Try both 2020 & 2024 buckets (some products reuse 2020 path)
      // FS2024-only products must NOT fall back to the 2020 bucket
      const _prefetchIs24only = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
      const simBuckets = _prefetchIs24only ? ['2024'] : ['2020','2024'];
      // Use the exact folder name + zip-derived uppercase variant for broader CDN coverage
      const folderVariants = [folder];
      const _zipBase = String(product?.bunny?.zip || '').replace(/\.zip$/i, '').trim();
      if (_zipBase) {
        const upper = _zipBase.toUpperCase();
        if (upper !== folder) folderVariants.push(upper);
      }
      const fetchOne = async (bucket, channel) => {
        for (const fv of folderVariants) {
          const url = `https://sws-installer.b-cdn.net/${bucket}/${channel}/${encodeURIComponent(fv)}/manifest.json`;
          try {
            let ok = false; let txt = '';
            if (window?.electron?.netFetchText) {
              const res = await window.electron.netFetchText(url, { timeoutMs: 12000 });
              ok = !!(res && res.ok);
              txt = ok ? (res.text || '') : '';
            } else {
              const r = await fetch(url, { cache:'no-store' });
              ok = r.ok; txt = ok ? (await r.text()) : '';
            }
            if (!ok) continue;
            const ver = parseVersion(txt || '');
            if (ver) return ver;
          } catch {}
        }
        return '';
      };
      const results = {};
      for (const channel of channels) {
        for (const bucket of simBuckets) {
          if (cancelled) return;
            const key = `${channel}:${bucket}`;
          if (results[key]) continue; // already found for this bucket/channel
          const ver = await fetchOne(bucket, channel);
          if (ver) {
            results[key] = ver;
            // Don't break — check each sim bucket independently so we can tell which sims have CDN files
          }
        }
      }
      if (cancelled) return;
      // Apply per-sim: only set the version for the bucket where it was actually found.
      // Never cross-seed (e.g. FS2020 result must NOT populate FS2024 state).
      const pub20 = results['Public:2020'] || '';
      const pub24 = results['Public:2024'] || '';
      const beta20 = results['Beta:2020'] || '';
      const beta24 = results['Beta:2024'] || '';
      if (window.__SWS_DEBUG_GLOBAL) {
        console.debug('[fast-prefetch] results', { product: product?.id, pub20, pub24, beta20, beta24, raw: results });
      }
      if (pub20 || pub24) {
        setRemoteVersPublic(prev => ({
          FS2020: pub20 ? pickMaxVer(prev.FS2020, pub20) : prev.FS2020,
          FS2024: pub24 ? pickMaxVer(prev.FS2024, pub24) : prev.FS2024
        }));
      }
      if (beta20 || beta24) {
        setRemoteVersBeta(prev => ({
          FS2020: beta20 ? pickMaxVer(prev.FS2020, beta20) : prev.FS2020,
          FS2024: beta24 ? pickMaxVer(prev.FS2024, beta24) : prev.FS2024
        }));
      }
      if (window.__SWS_DEBUG_GLOBAL) {
        const anyPub = pub20 || pub24;
        const anyBeta = beta20 || beta24;
        if (!anyPub && anyBeta) {
          console.debug('[fast-prefetch] public missing; beta present – will fallback-display beta until public fetched');
        }
      }
    })();
    return () => { cancelled = true; };
  // Only rerun if product changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.bunny?.folder]);
  // Derived convenience accessor returns the currently selected channel version instantly.
  const remoteVers = useMemo(() => ({
    FS2020: (getChan('FS2020') === 'Beta') ? (remoteVersBeta.FS2020 || '') : (remoteVersPublic.FS2020 || ''),
    FS2024: (getChan('FS2024') === 'Beta') ? (remoteVersBeta.FS2024 || '') : (remoteVersPublic.FS2024 || '')
  }), [remoteVersPublic, remoteVersBeta, getChan('FS2020'), getChan('FS2024')]);
  // For 2020+ (single artifact reused across sims) unify version numbers so both sims show the newest
  // available version for their selected channel (avoids GA-8 mismatch like 1.0.7 vs 1.0.5).
  const remoteVersUnified = useMemo(() => {
    if (!is2020Plus) return remoteVers;
    const beta20 = remoteVersBeta.FS2020 || '';
    const beta24 = remoteVersBeta.FS2024 || '';
    const pub20 = remoteVersPublic.FS2020 || '';
    const pub24 = remoteVersPublic.FS2024 || '';
    const maxVer = (a,b) => {
      if (a && b) return compareVersionsNormalized(a,b) >= 0 ? a : b;
      return a || b || '';
    };
    const betaMax = maxVer(beta20, beta24);
    const pubMax  = maxVer(pub20, pub24);
    const chan20 = getChan('FS2020') === 'Beta';
    const chan24 = getChan('FS2024') === 'Beta';
    return {
      FS2020: chan20 ? (betaMax || beta20) : (pubMax || pub20),
      FS2024: chan24 ? (betaMax || beta24) : (pubMax || pub24)
    };
  }, [is2020Plus, remoteVers, remoteVersBeta, remoteVersPublic, getChan('FS2020'), getChan('FS2024')]);
  const [zipSigDelta, setZipSigDelta] = useState({ FS2020: false, FS2024: false });
  // Persisted EULA acceptance and pre-download changelog prompt preference
  const [eulaAccepted, setEulaAccepted] = useState(() => localStorage.getItem('sws_eula_accepted_v1') === '1');
  const [eulaModal, setEulaModal] = useState({ open: false, simTag: null, channel: 'Public' });
  // Beta acknowledgement modal (replaces window.confirm for reliability)
  const [betaModal, setBetaModal] = useState({ open: false, onAccept: null, onCancel: null });
  const [preDlModal, setPreDlModal] = useState({ open: false, simTag: null, channel: 'Public', version: '', text: '', dontAsk: (localStorage.getItem('sws_skip_pre_download_changelog') === '1') });
  // Track transient version fetching if initial attempt produced no version string
  const [versionFetching, setVersionFetching] = useState(false);
  // True once the startup version fetch has completed at least once (avoids premature 'not available')
  const [versionFetchDone, setVersionFetchDone] = useState(false);
  const versionFetchTriedRef = useRef({}); // key: product:id:sim:chan => tried boolean

  // Rescue deep scan removed — the efficient preheat + fast-prefetch paths are sufficient.

  // Auto force-refresh if selected sim/channel has no version yet (runs once per missing state)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (versionFetching) return;
      if (!product?.bunny?.folder) return;
      const sim = unifiedSimTag || 'FS2020';
      const chan = getChan(sim) || 'Public';
      const key = `${product?.id || 'x'}:${sim}:${chan}`;
      if (versionFetchTriedRef.current[key]) return;
      const current = is2020Plus ? (remoteVersUnified?.[sim] || '') : (remoteVers?.[sim] || '');
      if (current) return;
      // If a warm version exists for this sim/channel, seed state and skip fetch
      try {
        const warmSel = getWarmVersion(sim, chan);
        if (warmSel) {
          if (chan === 'Beta') {
            setRemoteVersBeta(prev => ({ ...prev, [sim]: pickMaxVer(prev?.[sim], warmSel) }));
          } else {
            setRemoteVersPublic(prev => ({ ...prev, [sim]: pickMaxVer(prev?.[sim], warmSel) }));
          }
          return;
        }
      } catch {}
      versionFetchTriedRef.current[key] = true;
      setVersionFetching(true);
      try {
        const sims = _is24only ? ['FS2024'] : ['FS2020','FS2024'];
  const results = await Promise.all(sims.map(s => fetchManifestVersion(s, chan, { forceFresh:true, exactChannel:true, fastManifestReturn:true })));
        if (cancelled) return;
        if (_is24only) {
          const setter = chan === 'Beta' ? setRemoteVersBeta : setRemoteVersPublic;
          setter(prev => ({ ...prev, FS2024: pickMaxVer(prev.FS2024, results[0]) }));
        } else if (chan === 'Beta') {
          setRemoteVersBeta(prev => ({
            FS2020: pickMaxVer(prev.FS2020, results[0]),
            FS2024: pickMaxVer(prev.FS2024, results[1])
          }));
        } else {
          setRemoteVersPublic(prev => ({
            FS2020: pickMaxVer(prev.FS2020, results[0]),
            FS2024: pickMaxVer(prev.FS2024, results[1])
          }));
        }
      } catch { /* ignore */ }
      finally { if (!cancelled) setVersionFetching(false); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.bunny?.folder, unifiedSimTag, getChan('FS2020'), getChan('FS2024')]);

  // --- Immediate startup version fetch — also re-runs when refreshTick changes (manual or periodic) ---
  const versionFetchTickRef = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const isRefresh = versionFetchTickRef.current > 0;
    versionFetchTickRef.current = (refreshTick || 0);
    (async () => {
      try {
        if (!product?.bunny?.folder) {
          if (!cancelled) setVersionFetchDone(true);
          return;
        }
        // On refresh tick, clear warm and ETag caches so we get truly fresh CDN data
        if (isRefresh) {
          try {
            const pid = product?.id || 'x';
            if (window.__swsVersionWarmCache) {
              for (const k of Object.keys(window.__swsVersionWarmCache)) {
                if (k.startsWith(pid + ':')) delete window.__swsVersionWarmCache[k];
              }
            }
            if (window.__swsManifestEtagCache) {
              for (const [k] of window.__swsManifestEtagCache) {
                if (k.includes(product?.bunny?.folder)) window.__swsManifestEtagCache.delete(k);
              }
            }
            // Reset the tried-ref so subsequent effects also re-fetch
            versionFetchTriedRef.current = {};
          } catch {}
        }
        const fetchOpts = { exactChannel: true, fastManifestReturn: !isRefresh, forceFresh: isRefresh };
        // FS2024-only products: skip 2020 fetches entirely
        const _initIs24only = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
        const needBetaFetch = !!(isBetaTester || getChan('FS2020') === 'Beta' || getChan('FS2024') === 'Beta');
        const tasks = _initIs24only
          ? [
              fetchManifestVersion('FS2024', 'Public', fetchOpts),
              ...(needBetaFetch ? [fetchManifestVersion('FS2024', 'Beta', fetchOpts)] : [])
            ]
          : [
              fetchManifestVersion('FS2020', 'Public', fetchOpts),
              fetchManifestVersion('FS2024', 'Public', fetchOpts),
              ...(needBetaFetch ? [
                fetchManifestVersion('FS2020', 'Beta', fetchOpts),
                fetchManifestVersion('FS2024', 'Beta', fetchOpts)
              ] : [])
            ];
        const allResults = await Promise.all(tasks);
        const [pub20, pub24, beta20 = '', beta24 = ''] = _initIs24only
          ? ['', allResults[0], '', (needBetaFetch ? allResults[1] : '')]
          : [allResults[0], allResults[1], ...(needBetaFetch ? [allResults[2], allResults[3]] : ['', ''])];
        if (cancelled) return;
        if (isRefresh) {
          // On manual refresh, replace state entirely with fresh CDN data (don't merge with stale)
          setRemoteVersPublic({ FS2020: pub20 || '', FS2024: pub24 || '' });
          setRemoteVersBeta({ FS2020: beta20 || '', FS2024: beta24 || '' });
        } else {
          setRemoteVersPublic(prev => ({
            FS2020: pickMaxVer(prev.FS2020, pub20),
            FS2024: pickMaxVer(prev.FS2024, pub24)
          }));
          setRemoteVersBeta(prev => ({
            FS2020: pickMaxVer(prev.FS2020, beta20),
            FS2024: pickMaxVer(prev.FS2024, beta24)
          }));
        }
      } catch {}
      if (!cancelled) setVersionFetchDone(true);
    })();
    return () => { cancelled = true; };
  // Re-run on mount and whenever refreshTick changes (manual check or periodic poll)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id, product?.bunny?.folder, refreshTick, isBetaTester, getChan('FS2020'), getChan('FS2024')]);

  async function fetchManifestVersion(simTag, channel, opts = {}) {
    try {
      // In-memory ETag-based short-circuit cache (session scoped)
      if (!window.__swsManifestEtagCache) {
        window.__swsManifestEtagCache = new Map(); // url -> { etag, version }
      }
      const etagCache = window.__swsManifestEtagCache;
      const debugVersions = (() => { try { return localStorage.getItem('sws_debug_versions') === '1'; } catch { return false; } })();
      const dbg = (...a) => { if (debugVersions) { try { console.debug('[Versions]', ...a); } catch {} } };
      const forceFresh = !!opts.forceFresh;
      // Global warm cache early return: if a preheater already fetched a version for this product/sim/channel, use it
      try {
        const key = `${product?.id || 'x'}:${simTag}:${channel}`;
        if (!forceFresh && window.__swsVersionWarmCache && window.__swsVersionWarmCache[key]) {
          const warmVer = window.__swsVersionWarmCache[key];
          dbg('Warm cache hit', { key, version: warmVer });
          return warmVer;
        }
      } catch {}
      const versionFromAny = (text, contentType = '') => {
        const clean = String(text || '').trim();
        if (!clean) return '';
        const tryParseJSON = (s) => {
          try {
            const t = s.replace(/^\uFEFF/, '');
            return JSON.parse(t);
          } catch { return null; }
        };
        const pickFromObj = (obj) => {
          // Expanded key list (most specific -> generic). Includes legacy and alternative build keys.
          const keysToTry = [
            'package_version','packageVersion','PackageVersion',
            'addonVersion','addon_version','addOnVersion',
            'product_version','productVersion','ProductVersion',
            'currentVersion','CurrentVersion','latestVersion','LatestVersion','ReleaseVersion','releaseVersion','latest_version','current_version',
            'build_number','buildNumber','BuildNumber','build_number_str','buildNumberStr',
            'revision','Revision','rev','Rev','tag','Tag','semver','Semver','semVer','SemVer',
            'build','Build','buildVersion','BuildVersion',
            'appVersion','applicationVersion','ApplicationVersion',
            'version','Version','ver','Ver'
          ];
          for (const k of keysToTry) {
            const v = obj?.[k];
            if (typeof v === 'string' && /[0-9]+\.[0-9]+/.test(v)) {
              // Sanitize: extract the first semver-like token (handles values like "1.0.11???")
              const m = String(v).replace(/^v/i,'').match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
              if (m && m[1]) return m[1];
              return v.replace(/^v/i,'');
            }
          }
          // shallow nested search up to depth 3 now (slightly broader)
          const stack = [obj];
          const seen = new Set();
          let depth = 0;
          while (stack.length && depth < 3) {
            const cur = stack.shift();
            if (!cur || seen.has(cur)) { depth++; continue; }
            seen.add(cur);
            for (const [k,v] of Object.entries(cur)) {
              // Accept typical semver-like strings or dotted numeric builds with optional suffix
              if (typeof v === 'string' && /[0-9]+\.[0-9]+/.test(v) && /(version|build|pkg|release|current|latest|rev|tag)/i.test(k)) {
                const m = String(v).replace(/^v/i,'').match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
                if (m && m[1]) return m[1];
                return v.replace(/^v/i,'');
              }
              if (v && typeof v === 'object') stack.push(v);
            }
            depth++;
          }
          // Fallback: scan string values at top level for any plausible version; pick the highest
          try {
            let best = '';
            const pushIfHigher = (cand) => {
              const v = String(cand || '').trim().replace(/^v/i,'');
              if (!v || !/[0-9]+\.[0-9]+/.test(v)) return;
              if (!best || compareVersionsNormalized(v, best) > 0) best = v;
            };
            for (const v of Object.values(obj)) {
              if (typeof v === 'string') {
                // Collect all version-like tokens in the string
                const labeled = v.match(/(?:version|ver)\s*[:=]?\s*v?\s*([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/ig) || [];
                labeled.forEach(m => {
                  const mm = String(m).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
                  if (mm) pushIfHigher(mm[1]);
                });
                const plain = v.match(/\bv?([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)\b/ig) || [];
                plain.forEach(m => {
                  const mm = String(m).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
                  if (mm) pushIfHigher(mm[1]);
                });
              }
            }
            return best;
          } catch {}
          return '';
        };
        // Prefer JSON when content-type indicates or looks like JSON
        const looksJson = /application\/json|\{[\s\S]*\}|^\s*\{/.test(contentType) || /^\s*\{/.test(clean);
        if (looksJson) {
          const obj = tryParseJSON(clean);
          if (obj) {
            const v = pickFromObj(obj);
            if (v) return v;
          }
        } else {
          // Sometimes servers mislabel JSON as text/plain
          const obj = tryParseJSON(clean);
          if (obj) {
            const v = pickFromObj(obj);
            if (v) return v;
          }
        }
        // Text/changelog parsing: collect all versions and return the highest
        try {
          let best = '';
          const pushIfHigher = (cand) => {
            const v = String(cand || '').trim().replace(/^v/i,'');
            if (!v || !/[0-9]+\.[0-9]+/.test(v)) return;
            if (!best || compareVersionsNormalized(v, best) > 0) best = v;
          };
          const labeled = clean.match(/(?:version|ver)\s*[:=]?\s*v?\s*([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/ig) || [];
          labeled.forEach(m => {
            const mm = String(m).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
            if (mm) pushIfHigher(mm[1]);
          });
          const plain = clean.match(/\bv?([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)\b/ig) || [];
          plain.forEach(m => {
            const mm = String(m).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
            if (mm) pushIfHigher(mm[1]);
          });
          return best;
        } catch {}
        return '';
      };
      const readVersionFromUrl = async (u, label = '') => {
        try {
          if (localStorage.getItem('sws_debug_bunny') === '1' || debugVersions) { try { console.debug('[VERSION TRY' + (label?(' '+label):'') + ']', u); } catch {} }
          let etag = '';
          // Prefer main-process fetch to bypass CORS issues across all products
          if (window?.electron?.netFetchText) {
            // Optional in-memory short-circuit based on previous ETag
            if (!forceFresh) {
              const cached = etagCache.get(u);
              if (cached && cached.version) {
                // We still need to validate against current server ETag; do a tiny meta probe using downloads engine if available
                // Simpler: accept cached version for now; full refresh happens on channel switch or explicit force.
                // This keeps UI responsive while avoiding a preflight HEAD (which may be blocked by CORS in renderer).
              }
            }
            const res = await window.electron.netFetchText(addCacheBust(u), { timeoutMs: 15000 });
            if (!res || !res.ok) return '';
            const ct = (res.headers && (res.headers['content-type'] || res.headers['content_type'] || res.headers['contenttype'])) || '';
            const t = res.text || '';
            const ver = versionFromAny(t, ct) || '';
            const e = (res.headers && (res.headers['etag'] || res.headers['ETag'])) || '';
            if (ver) {
              if (e) {
                etagCache.set(u, { etag: e, version: ver });
                dbg('Parsed version with ETag (main IPC)', { url: u, etag: e, version: ver, source: label || 'manifest' });
              } else {
                dbg('Parsed version (main IPC, no ETag)', { url: u, version: ver, source: label || 'manifest' });
              }
            } else {
              dbg('No version in content (main IPC)', { url: u, source: label || 'manifest' });
            }
            return ver;
          }
          // Fallback to renderer fetch (dev mode). HEAD first to inspect ETag for potential short-circuit
          if (!forceFresh) {
            try {
              const headResp = await fetch(u, { method: 'HEAD', cache: 'no-store' });
              if (headResp && headResp.ok) {
                etag = headResp.headers.get('ETag') || '';
                if (etag) {
                  const cached = etagCache.get(u);
                  if (cached && cached.etag === etag && cached.version) {
                    dbg('ETag short-circuit', { url: u, etag, version: cached.version });
                    return cached.version;
                  }
                }
              }
            } catch {}
          }
          const r = await fetch(u, { cache: 'no-store' });
          if (!r.ok) return '';
          const ct = r.headers.get('Content-Type') || '';
          const t = await r.text();
          const ver = versionFromAny(t, ct) || '';
          if (ver) {
            const e = r.headers.get('ETag') || etag || '';
            if (e) {
              etagCache.set(u, { etag: e, version: ver });
              dbg('Parsed version with ETag', { url: u, etag: e, version: ver, source: label || 'manifest' });
            } else {
              dbg('Parsed version (no ETag)', { url: u, version: ver, source: label || 'manifest' });
            }
          } else {
            dbg('No version in content', { url: u, source: label || 'manifest' });
          }
          return ver;
        } catch { return '';
        }
      };
  const reqSimKey = simTag.replace('FS',''); // '2020'|'2024'
  // IMPORTANT: Only probe base folders to avoid variant manifests skewing the version
  const folders = cdnBaseFolderCandidates(product);
      // If no base folders (some products only define components/variants), fall back to full folder candidates instead of aborting.
      let effectiveFolders = folders;
      if (!effectiveFolders.length) {
        try {
          effectiveFolders = cdnFolderCandidates(product) || [];
          if (debugVersions) dbg('No base folders; using variant folders for version scan', { count: effectiveFolders.length });
        } catch { effectiveFolders = []; }
      }
      if (!effectiveFolders.length) {
        if (debugVersions) dbg('No folders available for version scan; skipping manifest probing');
        // continue to ZIP fallback
      }
      // Prefer the product-aware CDN bucket first (for 2020+ products, use 2020 even when simTag is 2024)
    const preferred = cdnBucketForSim(product, reqSimKey);
      const other = preferred === '2020' ? '2024' : '2020';
      // FS2024-only products: only try the 2024 bucket, never fall back to 2020
      const _fetchIs24only = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
      const sims = _fetchIs24only ? [preferred] : [preferred, other];
    const chPrimary = (channel || 'Public');
      const manifestFilesPrimary = [
        'manifest.json'
      ];
      // Track the best version discovered from manifest/JSON files (excluding ZIP name heuristics until later)
      let bestFoundManifest = '';
      const consider = (v, meta) => {
        if (!v) return;
        if (!bestFoundManifest || compareVersionsNormalized(v, bestFoundManifest) > 0) {
          bestFoundManifest = v;
          if (debugVersions) dbg('Candidate version accepted', { version: v, meta });
        } else if (debugVersions) {
          dbg('Candidate version ignored (older)', { version: v, bestFound: bestFoundManifest, meta });
        }
      };
  const attemptedUrls = debugVersions ? [] : null;
      // Priority: direct raw folder name (as provided) before variant expansions
      try {
        const rawFolder = product?.bunny?.folder ? encodePathSegments(product.bunny.folder) : '';
        if (rawFolder) {
          // Try the preferred bucket first; other bucket is a fallback in the folder loop below
          const directUrl = addCacheBust(`https://sws-installer.b-cdn.net/${preferred}/${chPrimary}/${rawFolder}/manifest.json`);
          if (attemptedUrls) attemptedUrls.push(directUrl);
          const v = await readVersionFromUrl(directUrl, 'DirectRaw');
          consider(v, { scope:'direct-raw', file:'manifest.json', sim:preferred, channel:chPrimary });
          if (bestFoundManifest) {
            if (debugVersions) dbg('Best manifest-derived version', { version: bestFoundManifest, attempted: attemptedUrls });
            return bestFoundManifest;
          }
        }
      } catch {}
      // When fastManifestReturn is enabled (startup non-refresh), the canonical URL is sufficient.
      // If it 404'd, skip the expensive folder loop — it only finds products with non-standard paths
      // and makes the startup fetch very slow (7+ sequential CDN requests per call).
      if (opts.fastManifestReturn && !bestFoundManifest) {
        if (debugVersions) dbg('fastManifestReturn bail — canonical URL had no version', { sim: simTag, channel });
        return '';
      }

      for (const sk of sims) {
        for (const file of manifestFilesPrimary) {
          // Standard layout: /{sim}/{channel}/{folder}/manifest.json
          const urls = effectiveFolders.flatMap(f => buildCdnUrls(sk, chPrimary, f, file)).map(addCacheBust);
          for (const u of urls) {
            if (attemptedUrls) attemptedUrls.push(u);
            const v = await readVersionFromUrl(u);
            consider(v, { scope:'folder', file, sim:sk, channel:chPrimary });
            if (bestFoundManifest) break; // early exit on first hit
          }
          if (bestFoundManifest) break;
        }
        if (bestFoundManifest) break;
      }
      if (bestFoundManifest) {
        if (debugVersions) dbg('Best manifest-derived version', { version: bestFoundManifest, attempted: attemptedUrls });
        return bestFoundManifest;
      }
      // No additional variant/ZIP probing — the canonical path should be sufficient
      if (debugVersions) dbg('Final chosen version', { version: bestFoundManifest || '', sim: simTag, channel });
      if (debugVersions && attemptedUrls) {
        try {
          window.__SWS_LAST_VERSION_URLS = window.__SWS_LAST_VERSION_URLS || {};
          const key = `${product?.id || 'x'}:${simTag}:${channel}`;
            window.__SWS_LAST_VERSION_URLS[key] = { when: Date.now(), urls: attemptedUrls.slice(0,400) };
        } catch {}
      }
      // Persist result into warm cache so future lookups are instant.
      // Always overwrite when forceFresh; otherwise prefer the higher version.
      try {
        const _wcKey = `${product?.id || 'x'}:${simTag}:${channel}`;
        if (window.__swsVersionWarmCache) {
          if (forceFresh) {
            // Force-refresh: always write the fresh value (even if empty — clears stale entry)
            window.__swsVersionWarmCache[_wcKey] = bestFoundManifest || '';
          } else if (bestFoundManifest) {
            // Normal: only update if new version is higher than cached
            const prev = window.__swsVersionWarmCache[_wcKey] || '';
            window.__swsVersionWarmCache[_wcKey] = (prev && compareVersionsNormalized(prev, bestFoundManifest) > 0) ? prev : bestFoundManifest;
          }
        }
      } catch {}
      return bestFoundManifest || '';
    } catch { return ''; }
  }

  // Hard fallback fetch for known canonical manifest path (used if heuristic scan fails)
  const hardFallbackFetch = useCallback(async (simTag, channel) => {
    try {
      const folders = cdnBaseFolderCandidates(product);
      if (!folders.length) return '';
      const sk = cdnBucketForSim(product, simTag.replace('FS',''));
      for (const folder of folders) {
        const url = `https://sws-installer.b-cdn.net/${sk}/${channel}/${folder}/manifest.json`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const txt = await r.text();
        const pkg = txt.match(/"package_version"\s*:\s*"([0-9][0-9\.a-zA-Z-]*)"/);
        if (pkg) return pkg[1];
        const ver = txt.match(/"version"\s*:\s*"([0-9][0-9\.a-zA-Z-]*)"/);
        if (ver) return ver[1];
      }
      return '';
    } catch { return ''; }
  }, [product]);

  // Minimal ZIP signature check (ETag/Last-Modified/Content-Length) for update detection
  async function headZipSignature(simTag, channel, zipName) {
    try {
      const simKey = simTag.replace('FS','');
      if (!zipName) return null;
      // Do not rely on any persisted URLs; build candidates deterministically

      // Use the exact zip name only (no date-prefix variants)
      const names = [String(zipName)];

      // Try canonical folder first, then remaining candidates — early exit on first success
      const canonicalFolder = product?.bunny?.folder ? encodePathSegments(product.bunny.folder) : '';
      const allFolders = cdnBaseFolderCandidates(product);
      const folders = canonicalFolder
        ? [canonicalFolder, ...allFolders.filter(f => f !== canonicalFolder)]
        : allFolders;
      const urls = folders.length
        ? names.flatMap(z => folders.flatMap(f => buildCdnUrlsForProduct(product, simKey, channel, f, z)))
        : names.flatMap(z => buildCdnUrlsNoFolderForProduct(product, simKey, channel, z));

      for (const u of urls) {
        try {
          // Use headOk-style negative caching to avoid re-probing known-404 URLs
          const negTs = __headNegCache.get(u);
          if (negTs && (Date.now() - negTs) < HEAD_NEG_TTL) continue;
          if (window?.electron?.netHead) {
            const res = await window.electron.netHead(addCacheBust(u));
            if (!res || !res.ok) { __headNegCache.set(u, Date.now()); continue; }
            return {
              etag: res.etag || '',
              lm: res.lastModified || '',
              len: String(res.contentLength || '')
            };
          } else {
            const r = await fetch(addCacheBust(u), { method: 'HEAD', cache: 'no-store' });
            if (!r.ok) { __headNegCache.set(u, Date.now()); continue; }
            return {
              etag: r.headers.get('ETag') || '',
              lm: r.headers.get('Last-Modified') || '',
              len: r.headers.get('Content-Length') || ''
            };
          }
        } catch {}
      }
      return null;
    } catch { return null; }
  }

  const zipSigKey = (pid, simTag) => `sws_zipSig_${pid}_${simTag}`;
  function readZipSig(pid, simTag) {
    try { const v = localStorage.getItem(zipSigKey(pid, simTag)); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  function writeZipSig(pid, simTag, sig) {
    try { if (sig) localStorage.setItem(zipSigKey(pid, simTag), JSON.stringify(sig)); } catch {}
  }

  // Pick channel to check for AVAILABLE version: follow the current selection (Public/Beta)
  const checkChan2020 = getChan('FS2020') || 'Public';
  const checkChan2024 = getChan('FS2024') || 'Public';

  // Refresh remote versions when product, installed channels, or selection changes
    // Fetch versions for currently selected channels; store into per-channel caches without clearing the other channel.
    useEffect(() => {
      let dead = false;
      const reqToken = Math.random().toString(36).slice(2);
      let latestToken = reqToken;
      (async () => {
        if (!product?.bunny?.folder) return;
        const wantBeta20 = checkChan2020 === 'Beta';
        const wantBeta24 = checkChan2024 === 'Beta';
        const [v20, v24] = await Promise.all([
          fetchManifestVersion('FS2020', checkChan2020, { exactChannel: wantBeta20 }),
          fetchManifestVersion('FS2024', checkChan2024, { exactChannel: wantBeta24 }),
        ]);
        if (dead || latestToken !== reqToken) return; // stale response
        if (wantBeta20 || wantBeta24) {
          setRemoteVersBeta(prev => ({
            FS2020: wantBeta20 ? pickMaxVer(prev.FS2020, v20) : prev.FS2020,
            FS2024: wantBeta24 ? pickMaxVer(prev.FS2024, v24) : prev.FS2024
          }));
        }
        if (!wantBeta20 || !wantBeta24) {
          setRemoteVersPublic(prev => ({
            FS2020: !wantBeta20 ? pickMaxVer(prev.FS2020, v20) : prev.FS2020,
            FS2024: !wantBeta24 ? pickMaxVer(prev.FS2024, v24) : prev.FS2024
          }));
        }
        // Removed redundant Public/Beta/HardFallback warm-cache fetches to avoid 4xx explosion
      })();
      return () => { dead = true; };
    }, [product?.bunny?.folder, checkChan2020, checkChan2024]);

  // ZIP signature delta detection against last-known signature (per installed sim)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = { FS2020: false, FS2024: false };
      // Helper: compare two ZIP signatures using reliable headers only.
      // ETag alone can differ across CDN edge nodes — only trust Content-Length and Last-Modified.
      // When a header is present in BOTH sig and saved, compare values; if present in only one
      // side, treat it as a change (new info appeared or disappeared after an actual update).
      function sigChanged(sig, saved) {
        if (!sig || !saved) return false;
        const sLen = String(sig.len || ''), vLen = String(saved.len || '');
        const sLm = sig.lm || '', vLm = saved.lm || '';
        // Both empty → nothing to compare (CDN didn't return useful headers)
        if (!sLen && !vLen && !sLm && !vLm) return false;
        // Only flag when BOTH sides have the header and the values differ.
        // Do NOT treat a header appearing or disappearing as a change — BunnyCDN
        // alternates between Content-Length and Transfer-Encoding:chunked (no C-L)
        // across edge nodes, which was causing false-positive update pills.
        if (sLen && vLen && sLen !== vLen) return true;
        if (sLm && vLm && sLm !== vLm) return true;
        return false;
      }
      // FS2020
      if (installed2020) {
        const zip = installed2020.variantZip || expectedZip2020 || '';
        const chan = installed2020Channel || 'Public';
        const sig = await headZipSignature('FS2020', chan, zip);
        const saved = readZipSig(product.id, 'FS2020');
        res.FS2020 = sigChanged(sig, saved);
      }
      // FS2024
      if (installed2024) {
        const zip = installed2024.variantZip || expectedZip2024 || '';
        const chan = installed2024Channel || 'Public';
        const sig = await headZipSignature('FS2024', chan, zip);
        const saved = readZipSig(product.id, 'FS2024');
        res.FS2024 = sigChanged(sig, saved);
      }
      if (!cancelled) {
        setZipSigDelta(res);
        // When a ZIP signature change is detected, flush the warm version cache for this
        // product so the next version fetch goes to CDN instead of returning a stale value.
        // This ensures the download button shows the actual new version, not the old one.
        if (res.FS2020 || res.FS2024) {
          try {
            const pid = product?.id || 'x';
            if (window.__swsVersionWarmCache) {
              for (const k of Object.keys(window.__swsVersionWarmCache)) {
                if (k.startsWith(pid + ':')) delete window.__swsVersionWarmCache[k];
              }
            }
            if (window.__swsManifestEtagCache) {
              for (const [k] of window.__swsManifestEtagCache) {
                if (k.includes(product?.bunny?.folder || '__none__')) window.__swsManifestEtagCache.delete(k);
              }
            }
          } catch {}
          // Force-refresh remote versions from CDN with a fresh fetch
          (async () => {
            try {
              const _is24o = (product?.compatibility || product?.bunny?.compatibility) === 'FS2024';
              const freshOpts = { exactChannel: true, forceFresh: true };
              const tasks = _is24o
                ? [fetchManifestVersion('FS2024', 'Public', freshOpts), fetchManifestVersion('FS2024', 'Beta', freshOpts)]
                : [fetchManifestVersion('FS2020', 'Public', freshOpts), fetchManifestVersion('FS2024', 'Public', freshOpts),
                   fetchManifestVersion('FS2020', 'Beta', freshOpts), fetchManifestVersion('FS2024', 'Beta', freshOpts)];
              const all = await Promise.all(tasks);
              const [p20, p24, b20, b24] = _is24o ? ['', all[0], '', all[1]] : all;
              setRemoteVersPublic({ FS2020: p20 || '', FS2024: p24 || '' });
              setRemoteVersBeta({ FS2020: b20 || '', FS2024: b24 || '' });
            } catch {}
          })();
        }
      }
    })();
    // re-evaluate when installed variant/channel changes
  }, [installed2020?.variantZip, installed2024?.variantZip, installed2020Channel, installed2024Channel, expectedZip2020, expectedZip2024]);

  // Download picker label (show remote version if available)
  // Global flag: if neither sim defines any components/base nor remote versions are found
  // Also true when zips are defined in config but no remote version found on CDN (and nothing cached/installed)
  // Scoped to only the sims this product supports (a FS2024-only product ignores FS2020 state).
  const noAvailableDownloads = (() => {
    try {
      // Channel-aware: check the currently selected channel, not just any channel
      // NOTE: compute inline to avoid TDZ — selectedChan const is declared later in render
      const chan = getChan(unifiedSimTag) || 'Public';
      const hasRemoteForChannel = chan === 'Beta'
        ? !!((can2020 && (remoteVersBeta.FS2020 || '').trim()) || (can2024 && (remoteVersBeta.FS2024 || '').trim()))
        : !!((can2020 && (remoteVersPublic.FS2020 || '').trim()) || (can2024 && (remoteVersPublic.FS2024 || '').trim()));
      if (hasRemoteForChannel) return false;
      // When version fetch hasn't completed yet, consult the warm cache.
      // The preheater runs before products render so warm cache should already be populated.
      if (!versionFetchDone) {
        try {
          const warm = window.__swsVersionWarmCache;
          if (warm) {
            const pid = product?.id || '';
            const hasWarm = (can2020 && !!(warm[`${pid}:FS2020:${chan}`] || '').trim()) ||
                            (can2024 && !!(warm[`${pid}:FS2024:${chan}`] || '').trim());
            if (hasWarm) return false; // warm cache confirms version exists
            // If warm cache keys exist but are empty, CDN returned 404 → unavailable
            const allProbed = (!can2020 || (`${pid}:FS2020:${chan}` in warm)) &&
                              (!can2024 || (`${pid}:FS2024:${chan}` in warm));
            if (allProbed) {
              const hasInstalled = (can2020 && installed2020) || (can2024 && installed2024);
              const hasCached = (can2020 && dl2020?.localPath) || (can2024 && dl2024?.localPath);
              return !(hasInstalled || hasCached);
            }
          }
        } catch {}
        return false; // warm cache not populated yet → don't flash unavailable
      }
      const hasInstalled = (can2020 && installed2020) || (can2024 && installed2024);
      const hasCached = (can2020 && dl2020?.localPath) || (can2024 && dl2024?.localPath);
      if (hasInstalled || hasCached) return false;
      return true;
    } catch { return false; }
  })();

  const downloadPickerLabel = (() => {
    if (noAvailableDownloads) return 'Currently Not Available';
    // Always reflect the currently targeted sim (unifiedSimTag) and its channel
    const sim = unifiedSimTag || (can2020 ? 'FS2020' : 'FS2024'); // fallback safety
    const chan = getChan(sim) || 'Public';
    const base = chan === 'Beta' ? 'Download Beta' : 'Download Public';
    // Primary selected-channel version lookup
    let primaryV = sim === 'FS2020'
      ? (is2020Plus ? (remoteVersUnified.FS2020 || '') : (remoteVers.FS2020 || ''))
      : (is2020Plus ? (remoteVersUnified.FS2024 || '') : (remoteVers.FS2024 || ''));
    // If state is not yet populated, opportunistically use warmed version for the selected sim/channel
    if (!primaryV) {
      const warmSel = getWarmVersion(sim, chan);
      if (warmSel) primaryV = warmSel;
    }
    // Strict channel enforcement: only show version for the selected channel
    let shown = primaryV;
    let shownSource = primaryV ? 'primary' : '';
    let shownChan = primaryV ? chan : '';
    // Heuristic: derive earliest ZIP version from expected zip name or cached variant/base when no remote manifest version found yet
    if (!shown) {
      const zipName = (() => {
        const exp = (sim === 'FS2020') ? expectedZip2020 : expectedZip2024;
        if (exp) return exp;
        const rec = (sim === 'FS2020') ? (dl2020 || dl2020Other || dl2024) : (dl2024 || dl2024Other || dl2020);
        return rec?.variantZip || rec?.baseZip || '';
      })();
      if (zipName) {
        const m = zipName.match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
        if (m) { shown = m[1]; shownSource = 'zip'; shownChan = ''; }
      }
    }
    // Last resort: show installed version (only if it matches selected sim/channel) so user still sees a version context
    if (!shown) {
      const installedV = (sim === 'FS2020') ? installed2020Version : installed2024Version;
      if (installedV) { shown = installedV; shownSource = 'installed'; shownChan = ''; }
    }
    if (shown) {
      if (window?.localStorage?.getItem('sws_debug_versions') === '1') {
        try { console.debug('[Versions] picker using', { sim, chan, shown, source: shownSource, shownChan }); } catch {}
      }
      const needsSuffix = shownChan && shownChan !== chan;
      const suffix = needsSuffix ? ` (${shownChan})` : '';
      return `${base} v${shown}${suffix}`;
    }
    // If we have not yet derived any version, proactively show checking… even before versionFetching flips to true
    const anyRemoteKnown = !!(
      remoteVersPublic.FS2020 || remoteVersPublic.FS2024 || remoteVersBeta.FS2020 || remoteVersBeta.FS2024 ||
      getWarmVersion('FS2020','Public') || getWarmVersion('FS2024','Public') || getWarmVersion('FS2020','Beta') || getWarmVersion('FS2024','Beta')
    );
    // Only show '(checking…)' when we truly have no known versions anywhere; if a fetch is ongoing but cache has data, prefer showing the stable label.
    if (!anyRemoteKnown) return `${base} (checking…)`;
    return showBothSimOptions ? `${base} (choose sim)` : base;
  })();

  // Debug overlay (opt-in): shows attempted manifest URLs for this product when sws_debug_versions_urls=1
  const showUrlDebug = (() => { try { return localStorage.getItem('sws_debug_versions_urls') === '1'; } catch { return false; } })();
  const attemptedUrlBlocks = (() => {
    if (!showUrlDebug) return [];
    try {
      const store = window.__SWS_LAST_VERSION_URLS || {};
      const keys = Object.keys(store).filter(k => k.startsWith(`${product?.id}:`)).slice(-6);
      return keys.map(k => ({ k, urls: store[k].urls || [] }));
    } catch { return []; }
  })();

  // Manual debug refetch (forces fresh, deep scan both channels) when debug overlay is enabled
  const debugRefetchVersions = useCallback(async () => {
      try {
        console.debug('[DEBUG] Forcing version refetch (Public & Beta) for product', product?.id);
        const [vPub, vBeta] = await Promise.all([
          fetchManifestVersion('FS2020', 'Public', { exactChannel:false, forceFresh:true, fastManifestReturn:false }),
          fetchManifestVersion('FS2020', 'Beta',   { exactChannel:true,  forceFresh:true, fastManifestReturn:false })
        ]);
        if (vPub) setRemoteVersPublic(prev => ({ ...prev, FS2020: pickMaxVer(prev.FS2020, vPub) }));
        if (vBeta) setRemoteVersBeta(prev => ({ ...prev, FS2020: pickMaxVer(prev.FS2020, vBeta) }));
        console.debug('[DEBUG] Refetch results', { vPub, vBeta });
      } catch (e) { console.debug('[DEBUG] Refetch error', e); }
  }, [product]);

  // Helper to get the remote version for a given sim tag (based on current selection)
  const getRemoteVerForSim = useCallback((simTag) => {
    return (
      simTag === 'FS2020'
        ? (is2020Plus ? (remoteVersUnified.FS2020 || remoteVers.FS2020 || '') : (remoteVers.FS2020 || ''))
        : (is2020Plus ? (remoteVersUnified.FS2024 || remoteVers.FS2024 || '') : (remoteVers.FS2024 || ''))
    ) || '';
  }, [remoteVers, remoteVersUnified, is2020Plus]);

  // Retroactively write version to download cache when remote version arrives after a download
  // that completed before the version fetch finished (prevents "Download" label on already-cached files)
  const versionBackfilledRef = useRef({});
  // Reset backfill latch when product changes so new products get backfilled
  const backfillProductRef = useRef(product?.id);
  if (backfillProductRef.current !== product?.id) {
    versionBackfilledRef.current = {};
    backfillProductRef.current = product?.id;
  }
  useEffect(() => {
    try {
      const pairs = [
        { st: 'FS2020', rec: dl2020, chan: selChan20 },
        { st: 'FS2024', rec: dl2024, chan: selChan24 },
      ];
      for (const { st, rec, chan } of pairs) {
        const key = `${product?.id}:${st}:${chan}`;
        if (versionBackfilledRef.current[key]) continue;
        if (!rec) continue;
        const hasFiles = !!(rec.localPath || (rec.variants && Object.keys(rec.variants).length > 0));
        if (!hasFiles) continue;
        if (rec.version && rec.version.trim()) { versionBackfilledRef.current[key] = true; continue; }
        const ver = getRemoteVerForSim(st);
        if (!ver) continue;
        versionBackfilledRef.current[key] = true;
        writeDlCache(product.id, st, { version: ver }, chan);
        setDownloadedFiles(prev => {
          const prevRec = prev[product.id] || { id: product.id, sims: {} };
          const simRec = prevRec.sims?.[st] || {};
          if (simRec.version === ver) return prev;
          return {
            ...prev,
            [product.id]: {
              ...prevRec,
              sims: { ...prevRec.sims, [st]: { ...simRec, version: ver } }
            }
          };
        });
      }
    } catch {}
  }, [remoteVers.FS2020, remoteVers.FS2024, remoteVersUnified?.FS2020, remoteVersUnified?.FS2024, dl2020?.version, dl2024?.version, dl2020?.localPath, dl2024?.localPath, selChan20, selChan24, product?.id]);

  // (moved earlier) getWarmVersion declared above for safe usage

  const bestDownloadedVersionForChannel = (rec, selectedChan) => {
    try {
      if (!rec) return '';
      const want = String(selectedChan || 'Public').toLowerCase();
      let best = '';
      const pushVer = (v) => {
        const s = String(v || '').trim();
        if (!s) return;
        if (!best || compareVersionsNormalized(s, best) > 0) best = s;
      };
      const rootChan = String(rec.channel || '').toLowerCase();
      if (rootChan === want) pushVer(rec.version);
      const vars = rec.variants || {};
      for (const v of Object.values(vars)) {
        if (!v || typeof v !== 'object') continue;
        const ch = String(v.channel || rec.channel || '').toLowerCase();
        if (ch !== want) continue;
        pushVer(v.version || rec.version);
      }
      return best;
    } catch { return ''; }
  };

  const iv20 = (installed2020Version || '').trim();
  const rv20 = (is2020Plus ? (remoteVersUnified.FS2020 || remoteVers.FS2020 || '') : (remoteVers.FS2020 || '')).trim();
  const dv20 = bestDownloadedVersionForChannel(dl2020, checkChan2020).trim();
  const installed2020Chan = String(installed2020Channel || '').toLowerCase();
  const selected2020Chan = String(checkChan2020 || 'public').toLowerCase();
  // Consider updates when the selected channel matches the installed channel (Public or Beta)
  const hasUpdate2020 = !!installed2020 && (installed2020Chan === selected2020Chan) && (
    (iv20 && rv20 && compareVersionsNormalized(rv20, iv20) > 0) ||
    // zipSigDelta: only flag when versions are not both known-equal (avoids pill when CDN
    // changed file headers but manifest still reports the same version number)
    (zipSigDelta.FS2020 && !(iv20 && rv20 && compareVersionsNormalized(rv20, iv20) === 0)) ||
    // If installed version is unknown but remote is known, treat as update so it isn't silently missed
    (!iv20 && !!rv20 && !(dv20 && compareVersionsNormalized(dv20, rv20) >= 0))
  );

  const iv24 = (installed2024Version || '').trim();
  const rv24 = (is2020Plus ? (remoteVersUnified.FS2024 || remoteVers.FS2024 || '') : (remoteVers.FS2024 || '')).trim();
  const dv24 = bestDownloadedVersionForChannel(dl2024, checkChan2024).trim();
  const installed2024Chan = String(installed2024Channel || '').toLowerCase();
  const selected2024Chan = String(checkChan2024 || 'public').toLowerCase();
  const hasUpdate2024 = !!installed2024 && (installed2024Chan === selected2024Chan) && (
    (iv24 && rv24 && compareVersionsNormalized(rv24, iv24) > 0) ||
    (zipSigDelta.FS2024 && !(iv24 && rv24 && compareVersionsNormalized(rv24, iv24) === 0)) ||
    // If installed version is unknown but remote is known, treat as update so it isn't silently missed
    (!iv24 && !!rv24 && !(dv24 && compareVersionsNormalized(dv24, rv24) >= 0))
  );

  const anyUpdateAvailable = !!(hasUpdate2020 || hasUpdate2024 || (forceUpdateActive && (!!installed2020 || !!installed2024)));

  // --- Overwrite risk detection: if user configured both sim Community paths to the same folder, installs between FS2020/FS2024 or channel switches can overwrite ---
  const sharedCommunityPath = useMemo(() => {
    try {
      if (!installPath2020 || !installPath2024) return false;
      return normalizePath(installPath2020) === normalizePath(installPath2024);
    } catch { return false; }
  }, [installPath2020, installPath2024]);

  // Throttle version check spam: only emit when DEBUG enabled
  if (__SWS_DEBUG_GLOBAL) {
    console.debug('[VERSION CHECK]', JSON.stringify({
      product: product.name,
      installed2020Version, remote2020: remoteVers.FS2020,
      installed2024Version, remote2024: remoteVers.FS2024,
      normCmp20: compareVersionsNormalized(remoteVers.FS2020, installed2020Version),
      normCmp24: compareVersionsNormalized(remoteVers.FS2024, installed2024Version),
      zipDelta: zipSigDelta
    }));
  }

  // Hoisted download cache state and delete handler so both the button and picker can access them
  const dl2020VariantCached = !!dl2020?.localPath || (dl2020 && Object.keys(dl2020.variants || {}).length > 0);
  const dl2024VariantCached = !!dl2024?.localPath || (dl2024 && Object.keys(dl2024.variants || {}).length > 0);
  const anyCachedVariant = dl2020VariantCached || dl2024VariantCached;
  // Only consider cache "matching" when legacy pointer matches expected; variants map is handled in readiness
  const dl2020MatchingCached = !!dl2020?.localPath && !!expectedZip2020 && zipEquivalent(dl2020?.variantZip, expectedZip2020);
  const dl2024MatchingCached = !!dl2024?.localPath && !!expectedZip2024 && zipEquivalent(dl2024?.variantZip, expectedZip2024);
  // Determine if each sim is actually ready to install now (align with per-sim button logic):
  // - install path set, nothing installed for that sim
  // - any cached variant exists (legacy localPath or variants map)
  // - if base is required for the current selection, ensure base is cached
  const isReadyInstall2020 = !!(
    can2020 &&
    installPath2020 &&
    !installed2020 &&
    (dl2020?.localPath || (dl2020 && Object.keys(dl2020.variants || {}).length > 0)) &&
  (!needsBase2020 || hasBaseDl2020 || (is2020Plus && !!dl2024?.baseLocalPath)) &&
    !suppressReadyBySim.FS2020
  );
  const isReadyInstall2024 = !!(
    can2024 &&
    installPath2024 &&
    !installed2024 &&
    (dl2024?.localPath || (dl2024 && Object.keys(dl2024.variants || {}).length > 0)) &&
  (!needsBase2024 || !!dl2024?.baseLocalPath || (is2020Plus && !!dl2020?.baseLocalPath)) &&
    !suppressReadyBySim.FS2024
  );
  const isBusyDl = downloadingId === product.id;

  // Determine if the latest version for current selection is already downloaded
  const selectedChan = getChan(unifiedSimTag) || 'Public';
  const selectedRemoteVersion = getRemoteVerForSim(unifiedSimTag); // raw channel-specific version (may be empty)
  // Display strictly the selected channel's Bunny version without cross-channel fallback
  const selectedRemoteVersionDisplay = useMemo(() => {
    // Strict: only show the selected channel's resolved version (no cross-channel)
    const sim = unifiedSimTag;
    let primary = selectedRemoteVersion || '';
    if (!primary) {
      try {
        const chan = getChan(sim) || 'Public';
        const warmSel = getWarmVersion(sim, chan);
        if (warmSel) primary = warmSel;
      } catch {}
    }
    if (primary) return primary;
    // For 2020+ products, fall back to the unified per-channel version so the Download button
    // still shows a concrete Bunny version even if the sim-specific fetch is lagging.
    if (is2020Plus) {
      try {
        const unified = remoteVersUnified?.[sim] || '';
        if (unified) return unified;
      } catch {}
    }
    // Once version fetch completed, do not fall back to ZIP/installed versions.
    // Showing stale config ZIP versions here can mask newer CDN manifest versions.
    if (versionFetchDone) return '';
    // ZIP-name heuristic when manifest is not yet known for selected channel
    const expZip = sim === 'FS2020' ? expectedZip2020 : expectedZip2024;
    if (expZip) {
      const m = String(expZip).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
      if (m) return m[1];
    }
    // Installed version last
    const inst = sim === 'FS2020' ? installed2020Version : installed2024Version;
    return inst || '';
  }, [selectedRemoteVersion, unifiedSimTag, expectedZip2020, expectedZip2024, installed2020Version, installed2024Version, is2020Plus, remoteVersUnified?.FS2020, remoteVersUnified?.FS2024, versionFetchDone]);

  // Header version pill: always show something immediately by allowing safe fallbacks
  // Priority: selected-channel remote > other-channel remote (suffix) > any remote > ZIP hint > installed > checking…
  const headerVersionPill = useMemo(() => {
    try {
      const sim = unifiedSimTag || 'FS2020';
      const selChan = getChan(sim) || 'Public';
      let primary = selectedRemoteVersion || '';
      if (!primary) {
        const warmSel = (typeof getWarmVersion === 'function') ? getWarmVersion(sim, selChan) : '';
        if (warmSel) primary = warmSel;
      }
      if (primary) return { text: `v${primary}`, title: `Latest ${selChan} version for ${sim}` };

      // Once fetch completed and no remote version is known, avoid stale ZIP/install version fallbacks.
      if (versionFetchDone) {
        return { text: 'checking…', title: 'No remote version found from manifest' };
      }

      // Strict channel enforcement: no cross-channel fallback in header pill

      // ZIP-name heuristic
      const zip = (sim === 'FS2020') ? (expectedZip2020 || dl2020?.variantZip || dl2020?.baseZip || '') : (expectedZip2024 || dl2024?.variantZip || dl2024?.baseZip || '');
      if (zip) {
        const m = String(zip).match(/([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
        if (m) return { text: `v${m[1]}`, title: 'Derived from ZIP name while manifest loads' };
      }

      // Installed version fallback
      const inst = sim === 'FS2020' ? (installed2020Version || '') : (installed2024Version || '');
      if (inst) return { text: `v${inst}`, title: 'Installed version' };

      return { text: 'checking…', title: 'Fetching version…' };
    } catch {
      return { text: 'checking…', title: 'Fetching version…' };
    }
  }, [unifiedSimTag, getChan, selectedRemoteVersion, remoteVersPublic.FS2020, remoteVersPublic.FS2024, remoteVersBeta.FS2020, remoteVersBeta.FS2024, expectedZip2020, expectedZip2024, dl2020?.variantZip, dl2020?.baseZip, dl2024?.variantZip, dl2024?.baseZip, installed2020Version, installed2024Version, versionFetchDone]);
  const selectedDlRec = (unifiedSimTag === 'FS2020') ? dl2020 : dl2024;
  // Determine downloaded version STRICTLY for the selected channel (ignore other-channel cache)
  function bestDownloadedVersionForSelected(rec, chan) {
    try {
      if (!rec) return '';
      const vers = [];
      // Require an explicit channel match — empty/missing channel is NOT treated as Public
      const recChan = rec.channel || inferChannelFromRecord(rec) || '';
      if (rec.localPath && recChan === chan && typeof rec.version === 'string' && rec.version.trim()) vers.push(rec.version);
      const vars = rec.variants || {};
      for (const v of Object.values(vars)) {
        if (!v || !v.localPath) continue;
        const c = v.channel || rec.channel || inferChannelFromRecord(v) || '';
        if (c !== chan) continue;
        if (typeof v.version === 'string' && v.version.trim()) vers.push(v.version);
      }
      if (!vers.length) return '';
      // pick highest version
      vers.sort((a,b) => compareVersionsNormalized(b||'', a||''));
      return vers[0] || '';
    } catch { return ''; }
  }
  // For MSFS 2020+ products, allow cross-sim cache to count as already downloaded for the selected channel
  const pickHigher = (a, b) => {
    if (!a) return b || '';
    if (!b) return a || '';
    return compareVersionsNormalized(b, a) > 0 ? b : a;
  };
  const selectedDownloadedVersion = is2020Plus
    ? pickHigher(
        bestDownloadedVersionForSelected(dl2020, selectedChan),
        bestDownloadedVersionForSelected(dl2024, selectedChan)
      )
    : bestDownloadedVersionForSelected(selectedDlRec, selectedChan);
  const isLatestAlreadyDownloaded = (() => {
    const remoteClean = (selectedRemoteVersionDisplay || '').replace(/\s*\((Beta|Public)\)$/, '');
    if (!remoteClean) return false;
    // Check downloaded version (already channel-filtered upstream via bestDownloadedVersionForSelected)
    if (selectedDownloadedVersion && compareVersionsNormalized(remoteClean, selectedDownloadedVersion) <= 0) return true;
    // Also treat as up-to-date if the installed version matches/exceeds remote
    // BUT only when the installed channel matches the selected channel. Otherwise a
    // higher-version Public install would suppress the Beta download button (or vice versa).
    const installedChanNorm = (() => {
      const c20 = (installed2020Channel || '').trim();
      const c24 = (installed2024Channel || '').trim();
      if (is2020Plus) return (/beta/i.test(c20) || /beta/i.test(c24)) ? 'Beta' : (c20 || c24 || '');
      const c = (unifiedSimTag === 'FS2020' ? c20 : c24) || '';
      return /beta/i.test(c) ? 'Beta' : (c || 'Public');
    })();
    const channelMatch = !installedChanNorm || installedChanNorm === selectedChan;
    if (channelMatch) {
      const installedVer = is2020Plus
        ? pickHigher(installed2020Version || '', installed2024Version || '')
        : ((unifiedSimTag === 'FS2020' ? installed2020Version : installed2024Version) || '');
      if (installedVer && compareVersionsNormalized(remoteClean, installedVer) <= 0) return true;
    }
    return false;
  })();

  // Helper: attempt to replace installed sim to a target channel using cached files ONLY.
  // Never auto-start downloads or open modals here — return false to let the caller guide the user to click Download.
  // Returns true only if an unambiguous cached replace was performed successfully; otherwise false.
  const attemptReplaceForSim = useCallback(async (simTag, targetChan) => {
    try {
  const installedSim = simTag === 'FS2020' ? installed2020 : installed2024;
      if (!installedSim) return false;
      const dlPrimary = simTag === 'FS2020' ? dl2020 : dl2024;
  // Allow using other-sim cache for 2020+ products (same channel only)
  const dlAlt = is2020Plus ? (simTag === 'FS2020' ? dl2024 : dl2020) : null;
  if (!dlPrimary && !dlAlt) { onStatus?.(`No cached ${targetChan || 'Public'} files available for quick switch. Click Download to fetch files.`); return false; }
      // Build cached variants list for this sim only
      const cachedVariants = (() => {
        const items = [];
        const pushFrom = (rec) => {
          if (!rec) return;
          if (rec.localPath) items.push({ base: zipBase(rec.variantZip || ''), rec: { localPath: rec.localPath, channel: rec.channel, variantZip: rec.variantZip } });
          const vars = rec.variants || {};
          Object.entries(vars).forEach(([k, v]) => { if (v?.localPath) items.push({ base: k, rec: v }); });
        };
        pushFrom(dlPrimary);
        pushFrom(dlAlt);
        return items;
      })();
      const channelMatches = cachedVariants.filter(v => (v.rec?.channel || 'Public') === (targetChan || 'Public'));
      // Only use same-channel cached items to avoid Public↔Beta mix-ups
      const list = channelMatches.length ? channelMatches : [];
      if (!list.length) {
        onStatus?.(`No cached ${targetChan || 'Public'} files available for quick switch. Click Download to fetch files.`);
        return false;
      }

      // Multiple variants cached: do not open chooser on toggle; ask user to use Download to choose
      if (list.length > 1) {
        onStatus?.(`Multiple cached ${targetChan || 'Public'} variants found. Click Download to choose which variant to install.`);
        return false;
      }
      // Single cached variant: perform replace now
      const chosen = list[0];
      const simKey2 = simTag.replace('FS','');
    const baseZipNeed = getBaseZipForSim(product, simKey2);
      const needsBase = !!(baseZipNeed && zipBase(baseZipNeed) !== zipBase(chosen.rec?.variantZip || ''));
    // Prefer base from current sim; fallback to other sim for 2020+ products
    const basePathCandidate = dlPrimary?.baseLocalPath || (dlAlt?.baseLocalPath || '');
      // Require Base when needed for both channels; if missing, do not auto-download — guide the user
      if (needsBase && !basePathCandidate) {
        onStatus?.('Base files required but not found in cache. Click Download to fetch base files.');
        return false;
      }
      // Uninstall current, then install base (if needed) + variant
      try { await handleUninstall(installedSim); } catch {}
      if (needsBase && basePathCandidate) {
        await handleInstall(product, basePathCandidate, simTag, (targetChan || dlPrimary?.channel || 'Public'), '', baseZipNeed);
      }
      await handleInstall(
        product,
        chosen.rec.localPath,
        simTag,
        (targetChan || chosen.rec.channel || 'Public'),
        '',
        (chosen.rec.variantZip || '')
      );
      onStatus?.(`Replaced ${installedSim.installedChannel || 'Public'} with ${targetChan || 'Public'} using cached files.`);
      return true;
    } catch (e) {
      onStatus?.('Auto-replace failed: ' + (e?.message || String(e)));
      return false;
    }
  }, [installed2020, installed2024, dl2020, dl2024, handleInstall, handleUninstall, product, onStatus, downloadAllForSim, setPendingSimForInstall, setInstallVariantChoice, setShowInstallVariantModal]);

  // (Removed) Sync both sims to current product-level channel and install/update to latest
  // This quick action was removed per request. If reintroduced later, ensure it honors
  // EULA/Beta gating and only performs cached replacements without surprising downloads.

  const handleDeleteAllCached = async () => {
    const hasDownloads = !!(hasAnyCache2020 || hasAnyCache2024);
    const hasInstalls = !!(installed2020 || installed2024);
    if (!hasDownloads && !hasInstalls) return;
    const parts = [hasInstalls ? 'uninstall from Community and delete its extracted cache' : '', hasDownloads ? 'delete downloaded ZIPs' : ''].filter(Boolean);
    const proceed = window.confirm(`This will ${parts.join(', and ')} for this product. Continue?`);
    if (!proceed) return;
    try {
  // Close the download modal if open
  setShowDownloadModal(false);

      // 1) Uninstall from Community + delete extracted cache for each sim
      const simEntries = [
        { tag: 'FS2020', inst: installed2020, path: installPath2020 },
        { tag: 'FS2024', inst: installed2024, path: installPath2024 }
      ];
      for (const se of simEntries) {
        if (!se.inst) continue;
        const folder = se.inst.folder || se.inst.name;
        // Capture extract/cache location BEFORE unlinking
        const extractTargets = new Set();
        try {
          if (se.path && folder && window.electron?.getPackageRealPath) {
            const info = await window.electron.getPackageRealPath(se.path, folder);
            const cand = info?.extractRoot || info?.realDir;
            if (cand) extractTargets.add(cand);
          }
        } catch {}
        try {
          if (window.electron?.findExtractDirForFolder && folder) {
            const guess = await window.electron.findExtractDirForFolder(folder);
            if (guess?.success && guess?.extractRoot) extractTargets.add(guess.extractRoot);
          }
        } catch {}
        // Uninstall (unlink from Community)
        try { await handleUninstall(se.inst); } catch {}
        // Delete extracted install cache
        for (const targetDir of extractTargets) {
          try { if (targetDir && window.electron?.deleteFile) await window.electron.deleteFile(targetDir); } catch {}
        }
        // Update UI state
        if (setOwnedAircraft) {
          setOwnedAircraft(prev => prev.map(p => p.id === product.id ? { ...p, [se.tag === 'FS2020' ? 'installed2020' : 'installed2024']: null } : p));
        }
      }

      // 2) Delete downloaded ZIPs
      const sims = [
        { tag:'FS2020', rec: (dl2020 || downloadedFiles?.[product.id]?.sims?.FS2020 || null) },
        { tag:'FS2024', rec: (dl2024 || downloadedFiles?.[product.id]?.sims?.FS2024 || null) }
      ];
      for (const s of sims) {
        if (!s || !s.rec) continue;
        const rec = s.rec;
        const toDelete = new Set();
        if (rec.baseLocalPath) toDelete.add(rec.baseLocalPath);
        if (rec.localPath) toDelete.add(rec.localPath);
        const vars = rec.variants || {};
        Object.values(vars).forEach(v => { if (v?.localPath) toDelete.add(v.localPath); });
        for (const p of toDelete) {
          try { if (p && window.electron?.deleteFile) await window.electron.deleteFile(p); } catch {}
        }
        setDownloadedFiles(prev => {
          const prevRec = prev?.[product.id] || { id: product.id, sims: {} };
          const sims = { ...(prevRec.sims || {}) };
          delete sims[s.tag];
          return { ...prev, [product.id]: { ...prevRec, sims } };
        });
        removeDlCache(product.id, s.tag, {
          aliasIds: Array.isArray(product.aliasIds) ? product.aliasIds : [],
          aliasOf: product?.bunny?.aliasOf != null ? product.bunny.aliasOf : null
        });
      }
      onStatus?.('Deleted installed package, cache, and downloads.');
    } catch (e) {
      onStatus?.('Could not delete: ' + (e?.message || e));
    }
  };

  const handleDeleteCached = async (simTag) => {
    try {
  // Close the download modal if open (old name was setShowDownloadSimPicker)
  setShowDownloadModal(false);
      // For 2020+ products both sims share the same artifact, so clear both sims' caches
      const simsToClean = is2020Plus ? ['FS2020', 'FS2024'] : [simTag];
      const toDelete = new Set();
      for (const st of simsToClean) {
        const rec = st === 'FS2020'
          ? (dl2020 || downloadedFiles?.[product.id]?.sims?.FS2020 || null)
          : (dl2024 || downloadedFiles?.[product.id]?.sims?.FS2024 || null);
        if (!rec) continue;
        if (rec.baseLocalPath) toDelete.add(rec.baseLocalPath);
        if (rec.localPath) toDelete.add(rec.localPath);
        const vars = rec.variants || {};
        Object.values(vars).forEach(v => { if (v?.localPath) toDelete.add(v.localPath); });
      }
      // Delete unique file paths from disk
      for (const p of toDelete) {
        try { if (p && window.electron?.deleteFile) await window.electron.deleteFile(p); } catch {}
      }
      // Clear in-memory state and localStorage for all affected sims
      setDownloadedFiles(prev => {
        const prevRec = prev?.[product.id] || { id: product.id, sims: {} };
        const sims = { ...(prevRec.sims || {}) };
        for (const st of simsToClean) delete sims[st];
        return { ...prev, [product.id]: { ...prevRec, sims } };
      });
      const aliasOpts = {
        aliasIds: Array.isArray(product.aliasIds) ? product.aliasIds : [],
        aliasOf: product?.bunny?.aliasOf != null ? product.bunny.aliasOf : null
      };
      for (const st of simsToClean) removeDlCache(product.id, st, aliasOpts);
      onStatus?.(`Deleted cached downloads for ${simTag === 'FS2020' ? '2020' : '2024'}`);
    } catch (e) {
      onStatus?.('Could not delete cached downloads: ' + (e?.message || e));
    }
  };

  return (
    <div style={{
      background: (anyInstalledBeta || betaProductChecked)
        ? 'linear-gradient(170deg, #f7b21a 50%, #da9d1f 50%)'
        : 'linear-gradient(170deg, #3b6d66 50%, #36635c 50%)',
      borderRadius:0,
      display:'flex',
      flexDirection:'row',
      marginBottom:10,
      boxShadow:'none',
  overflow:'visible', // keep popovers visible
      position:'relative'   // <-- ensure present
    }}>
  {/* Ready badge removed per request */}
      {/* Beta Warning Modal */}
      {betaModal.open && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { /* require explicit action */ }}>
          <div className="sws-modal sws-modal-lg" role="document">
            <div className="sws-modal-header">
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <img src={warningIcon} alt="Warning" style={{ width:24, height:24, flexShrink:0 }} />
                <h3 className="sws-modal-title" style={{ color:'var(--sws-warn)', margin:0 }}>Important Beta Software Notice</h3>
              </div>
              <button type="button" className="sws-close" onClick={() => { try { betaModal.onCancel && betaModal.onCancel(); } catch{}; setBetaModal({ open:false, onAccept:null, onCancel:null }); }} title="Close">×</button>
            </div>
            <div className="sws-modal-body" style={{ lineHeight:1.6, fontSize:13, maxHeight:'60vh', overflowY:'auto' }}>
              <p style={{ fontWeight:700, marginTop:0 }}>IMPORTANT BETA SOFTWARE NOTICE AND ACKNOWLEDGEMENT</p>
              <p>Beta builds are pre-release, experimental software intended for testing purposes only. They may be unstable, contain bugs, errors, and/or incomplete features, and may cause crashes, loss of functionality, degraded performance, incompatibility with other add-ons or software, corruption or loss of settings, profiles, or saved data, and other issues that may negatively affect your simulator installation or broader system environment.</p>
              <p>You should install and use beta builds only if you understand and accept these risks. Before proceeding, you should back up any important files, settings, profiles, and saved data.</p>
              <p>By choosing to install or use a beta build, you do so voluntarily and at your own risk. To the maximum extent permitted by applicable law, the beta software is provided by SimWorks Studios Ltd ("SWS") on an "as is" and "as available" basis, without warranties of any kind, whether express or implied, including any implied warranties of compatibility, merchantability, fitness for a particular purpose, satisfactory quality, or non-infringement.</p>
              <p>To the maximum extent permitted by applicable law, SWS shall not be liable for any loss, damage, cost, or expense arising out of or related to the installation, access, use, inability to use, malfunction, or removal of any beta software.</p>
              <p style={{ marginBottom:0 }}>Nothing in this notice excludes or limits any liability or any consumer rights that cannot lawfully be excluded or limited under applicable law.</p>
            </div>
            <div className="sws-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { try { onStatus?.('Beta warning: canceled'); } catch{}; try { betaModal.onCancel && betaModal.onCancel(); } catch{}; setBetaModal({ open:false, onAccept:null, onCancel:null }); }}>Decline</button>
              <button type="button" className="btn btn-warn" onClick={() => { try { onStatus?.('Beta warning: accepted'); } catch{}; try { betaModal.onAccept && betaModal.onAccept(); } catch{}; setBetaModal({ open:false, onAccept:null, onCancel:null }); }}>I Understand &amp; Accept</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {showUrlDebug && attemptedUrlBlocks.length > 0 && (
        <div style={{ marginTop:12, fontSize:10, lineHeight:1.3, background:'#12161a', border:'1px solid #243039', borderRadius:6, padding:8, maxHeight:140, overflowY:'auto' }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>Version URL Attempts (debug)</div>
          <div style={{ marginBottom:6 }}>
            <button type="button" onClick={debugRefetchVersions} style={{ background:'#264653', color:'#fff', border:'none', padding:'4px 8px', borderRadius:4, fontSize:10, cursor:'pointer' }}>Force Refetch</button>
          </div>
          {attemptedUrlBlocks.map(b => (
            <div key={b.k} style={{ marginBottom:6 }}>
              <div style={{ fontWeight:600 }}>{b.k}</div>
              {b.urls.slice(0,8).map(u => (
                <div key={u} style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  <a href={u} onClick={(e) => { e.preventDefault(); try { window.open(u, '_blank', 'noopener'); } catch {} }} style={{ color:'#5fb3ff', textDecoration:'none' }}>{u}</a>
                </div>
              ))}
              {b.urls.length > 8 && <div style={{ opacity:0.65 }}>… +{b.urls.length - 8} more</div>}
            </div>
          ))}
          <div style={{ opacity:0.55 }}>Set localStorage sws_debug_versions_urls=0 and reload to hide.</div>
        </div>
      )}
      {/* Compact inline version debug (enable with localStorage sws_debug_versions_ui=1) */}
      {(() => { try { return localStorage.getItem('sws_debug_versions_ui') === '1'; } catch { return false; } })() && (
        <div style={{ marginTop:8, fontSize:10, lineHeight:1.35, background:'#10151a', border:'1px solid #1f2831', borderRadius:6, padding:8 }}>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:6 }}>
            <div style={{ fontWeight:700 }}>Version Debug</div>
            <button type="button" onClick={debugRefetchVersions} style={{ background:'#2a4f63', color:'#fff', border:'none', padding:'2px 6px', borderRadius:4, fontSize:10, cursor:'pointer' }}>Refetch</button>
            <button type="button" onClick={() => { try { window.__swsManifestEtagCache = new Map(); } catch {}; setRemoteVersPublic({ FS2020:'', FS2024:'' }); setRemoteVersBeta({ FS2020:'', FS2024:'' }); }} style={{ background:'#3a3a3a', color:'#eee', border:'none', padding:'2px 6px', borderRadius:4, fontSize:10, cursor:'pointer' }}>Clear Cache</button>
          </div>
          <div>Chan: <b>{getChan(unifiedSimTag) || 'Public'}</b> • Sim: <b>{unifiedSimTag}</b></div>
          <div>Shown: <code style={{ opacity:0.9 }}>{selectedRemoteVersionDisplay || '(n/a)'}</code></div>
          <div>Selected raw: <code style={{ opacity:0.9 }}>{selectedRemoteVersion || '(n/a)'}</code></div>
          <div style={{ marginTop:4 }}>Public FS2020/FS2024: <code>{remoteVersPublic.FS2020 || '-'}</code> / <code>{remoteVersPublic.FS2024 || '-'}</code></div>
          <div>Beta FS2020/FS2024: <code>{remoteVersBeta.FS2020 || '-'}</code> / <code>{remoteVersBeta.FS2024 || '-'}</code></div>
        </div>
      )}
      
      {/* Thumbnail */}
      <div style={{
        position:'relative',
        width:210,
        flexShrink:0,
        borderTopLeftRadius:0,
        borderBottomLeftRadius:0,
        overflow:'hidden',
        background:'#222'
      }}>
        {previewThumb && <img
          src={previewThumb}
          alt=""
          loading="lazy"
          decoding="async"
          style={{ width:'100%', height:'100%', minHeight: '100%', objectFit:'cover', display:'block' }}
          onError={() => {
            // If thumbnail URL fails to load, clear and trigger a re-hydration attempt
            try { setPreviewThumb(null); } catch {}
            try {
              const pid = String(product?.id || product?.bunny?.folder || product?.name || '');
              const cacheKey = pid ? `sws_thumb_${pid}` : '';
              if (pid) thumbMemCacheRef.current.delete(pid);
              if (cacheKey) localStorage.removeItem(cacheKey);
            } catch {}
            try { setThumbRefreshKey(k => k + 1); } catch {}
          }}
        />}
        <img
          src={compatIconImg}
          alt={compatLabel}
          title={compatLabel}
          style={{ position:'absolute', left:8, bottom:8, height:26, filter:'drop-shadow(0 1px 4px #0008)' }}
        />
        {anyUpdateAvailable && (
          <span
            title={`${hasUpdate2020 ? 'FS2020 update available. ' : ''}${hasUpdate2024 ? 'FS2024 update available.' : ''}\nClick Download to fetch latest, then Install.`}
            style={{
              position:'absolute',
              top:8,
              left:0,
              background:'#e67e22',
              color:'#fff',
              border:'none',
              borderRadius:0,
              padding:'3px 10px',
              fontSize:11,
              fontWeight:800,
              letterSpacing:.5,
              boxShadow:'0 1px 4px #0008',
              zIndex:3
            }}
          >
            Update available
          </span>
        )}
      </div>

      {/* Hazard stripes will be rendered inside the header container for perfect fit */}

    {/* Content */}
  <div style={{
    flex:1,
    display:'grid',
    // Header row + filler + title row + actions row\n  gridTemplateRows: 'auto 0fr auto auto',
    rowGap:2,
    padding:'4px 14px',
    minWidth:0,
    minHeight:0,
    position:'relative',
    zIndex:1 // place above hazard stripes
  }}>

        {/* Inline row: product title + beta — positioned to align with changelog button */}
        <div style={{
          display:'flex',
          alignItems:'center',
          gap:12,
          width:'100%',
          marginBottom:4,
          gridRow: '3',
          alignSelf:'end'
        }}>
          {product?.name && (
            <span style={{
              fontSize:24,
              fontWeight:700,
              color: (anyInstalledBeta || betaProductChecked) ? '#231f20' : '#fff',
              whiteSpace:'nowrap',
              overflow:'hidden',
              textOverflow:'ellipsis',
              letterSpacing:0.2,
              flexShrink:1,
              minWidth:0
            }}>
              {product.name}
            </span>
          )}
        </div>

        {/* Header — now row 2 (variable-height content below the title) */}
        <div style={{
          width:'100%',
          borderBottom:'none',
          marginBottom: 4,
          paddingBottom:4,
          paddingTop: 0,
          textAlign:'left',
          position:'relative',
          overflow:'hidden',
          gridRow: '2'
        }}>
          <div style={{
            fontSize:24,
            fontWeight:700,
            color: (anyInstalledBeta || betaProductChecked) ? '#231f20' : '#fff',
            display:'flex',
            gap:10,
            alignItems:'center',
            maxWidth:'100%',
            position:'relative',
            zIndex:2,
            flexWrap:'wrap'
          }}>

            {sharedCommunityPath && (
              <div style={{
                position:'absolute',
                top:'100%', left:0, marginTop:6,
                background:'linear-gradient(90deg,#7f1d1d,#991b1b)',
                border:'1px solid #b91c1c',
                color:'#ffe5e5',
                padding:'6px 10px',
                borderRadius:6,
                fontSize:11,
                fontWeight:600,
                maxWidth:'76%',
                boxShadow:'none'
              }}>
                Warning: Your MSFS 2020 and 2024 Community paths are identical. Installing or switching channels here can overwrite the other sim's files. Change one path in Settings.
              </div>
            )}
            {/* Removed installed sim/version summary from title */}
            {/* Drop version/channel from title */}
            {/* Update available indicator moved to thumbnail */}
            {/* Per-sim Modify moved next to Uninstall/Replace button */}
          </div>
          {/* Removed product ID from UI */}
          {/* <div style={{ color:'#90caf9', fontSize:11 }}>{product.id}</div> */}
        </div>
        {/* Channel mismatch banner removed per request */}

        {/* Bottom actions */}
        <div style={{
          display:'grid',
          gridTemplateColumns:'1fr 1fr',
          alignItems:'stretch',
          gap:12,
          width:'100%',
          position:'relative',
          // Minimal spacing above actions
          marginTop: 4,
          paddingBottom: 4,
          gridRow: '4',
          minHeight: 106
        }}>
          {/* Left column: stack install actions */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, width:'100%', minHeight:0, alignSelf:'stretch' }}>
            {(() => {
              // Determine which buttons to show once (avoid accidental duplicates)
              const show2020 = !!can2020;
              const show2024 = !!can2024;
              // For unified FS2020+ products installed to the same Community path, mask the "other" sim
              let lastSim = '';
              try { lastSim = localStorage.getItem('sws_lastInstallSim_' + product.id) || ''; } catch {}
              const shared = !!(is2020Plus && installPath2020 && installPath2024 && installPath2020 === installPath2024);
              const installed2020ForUI = (shared && lastSim === 'FS2024') ? null : installed2020;
              const installed2024ForUI = (shared && lastSim === 'FS2020') ? null : installed2024;
              const btns = [];
              const singleSim = (show2020 && !show2024) || (!show2020 && show2024);
              if (show2020) {
                // Use the masked value directly; if masked to null we WANT the button to offer Install (not fallback to installed state)
                btns.push(renderSimButton('FS2020', installed2020ForUI, dl2020, installPath2020, { install:'#4caf50', uninstall:'#d32f2f' }, true, dl2020Other, dl2024Other, selectedRemoteVersionDisplay));
              }
              if (show2024) {
                btns.push(renderSimButton('FS2024', installed2024ForUI, dl2024, installPath2024, { install:'#4caf50', uninstall:'#d32f2f' }, (!!(dl2024?.localPath) || (dl2024 && Object.keys(dl2024.variants || {}).length > 0)), dl2024Other, dl2020Other, selectedRemoteVersionDisplay));
              }
              // For single-sim (2024-native) cards: no extra wrapper needed; button stretches via flex
              return btns;
            })()}
            {/* Legacy direct call (replaced by block above):
            {renderSimButton('FS2024', installed2024, dl2024, installPath2024, {
              install:'#4caf50', uninstall:'#d32f2f'
            }, (!!(dl2024?.localPath) || (dl2024 && Object.keys(dl2024.variants || {}).length > 0)), dl2024Other, dl2020Other, selectedRemoteVersionDisplay)}
            */}
          </div>

    {/* Right column: Unified Download/Delete (button adapts to updates) */}
  <div style={{ position:'relative',
    width:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-start', height:'100%', minHeight:0, alignSelf:'stretch', flex:'1 1 0' }}>
            {/* Download area + right-side delete icon */}
            {(() => {
              const flowBusy = !!(isBusyDl || betaModal.open || eulaModal.open || preDlModal.open || showDownloadModal);
              const betaSelected = getChan(unifiedSimTag) === 'Beta';
              // Presence-aware Download gating:
              // Previously, unknown remote version or missing local version string would still show "Download" even if the files were cached,
              // causing a quick no-op download. We now detect cached presence by channel + expected ZIP and show "Downloaded" instead.
              // Include channelBumpRef.current as a volatile factor so toggling channels re-evaluates button even if cache objects remain.
              const _channelBump = channelBumpRef.current; // read ref to create reactive relation in render
              // Helper: does this sim have a cached variant for the selected channel matching the expected ZIP?
              const expectedZipUnified = (unifiedSimTag === 'FS2020') ? (expectedZip2020 || '') : (expectedZip2024 || '');
              const baseZipExpectedUnified = getBaseZipForSim(product, unifiedSimTag.replace('FS','')) || '';
              const hasChannelVariantZip = (rec, simTagForRec) => {
                try {
                  if (!rec) return false;
                  const chan = getChan(unifiedSimTag) || 'Public';
                  const expectedOk = (zip) => (!!expectedZipUnified ? zipEquivalent(zip || '', expectedZipUnified) : true);
                  // direct variant (legacy single-path)
                  if (rec.localPath && expectedOk(rec.variantZip)) {
                    let c = rec.channel || inferChannelFromRecord(rec) || '';
                    if (!rec.channel && c) {
                      // Persist inferred channel for future correctness
                      try { writeDlCache(product.id, simTagForRec || unifiedSimTag, { variantZip: rec.variantZip, channel: c }, c); } catch {}
                    }
                    // If channel cannot be determined, do not count this as a hit for the current selection.
                    if (!c) return false;
                    if (c === chan) return true;
                  }
                  // mapped variants
                  const vars = rec.variants || {};
                  for (const [k, v] of Object.entries(vars)) {
                    if (!v || !v.localPath) continue;
                    let c = v.channel || rec.channel || inferChannelFromRecord(v) || '';
                    // allow missing channel to count for current selection and persist
                    const byKey = !!expectedZipUnified && (zipBase(k) === zipBase(expectedZipUnified));
                    const byZip = !!expectedZipUnified && zipEquivalent(v.variantZip || '', expectedZipUnified);
                    const matchesVariant = (byKey || byZip) || !expectedZipUnified;
                    if (!matchesVariant) continue;
                    if (!rec.channel && c) {
                      // Persist inferred
                      try { writeDlCache(product.id, simTagForRec || unifiedSimTag, { variants: { [zipBase(v.variantZip || k)]: { channel: c } } }, c); } catch {}
                    }
                    // If channel is unknown for this cached variant, do not assume it matches the current selection.
                    if (!c) return false;
                    if (c === chan) return true;
                  }
                  return false;
                } catch { return false; }
              };
              const hasChannelBaseZip = (rec, simTagForRec) => {
                try {
                  if (!rec) return false;
                  const chan = getChan(unifiedSimTag) || 'Public';
                  if (!rec.baseLocalPath) return false;
                  let c = rec.channel || inferChannelFromRecord(rec) || '';
                  if (!baseZipExpectedUnified) {
                    if (!rec.channel && c) {
                      try { writeDlCache(product.id, simTagForRec || unifiedSimTag, { baseZip: rec.baseZip, channel: c }, c); } catch {}
                    }
                    // If channel is unknown, do not treat as a match for the current selection.
                    if (!c) return false;
                    return c === chan;
                  }
                  const baseOk = zipEquivalent(rec.baseZip || '', baseZipExpectedUnified);
                  if (!baseOk) return false;
                  if (!rec.channel && c) {
                    try { writeDlCache(product.id, simTagForRec || unifiedSimTag, { baseZip: rec.baseZip, channel: c }, c); } catch {}
                  }
                  // Only count when channel is known and matches the selected channel.
                  if (!c) return false;
                  return c === chan;
                } catch { return false; }
              };
              const recHere = (unifiedSimTag === 'FS2020') ? dl2020 : dl2024;
              const recAlt  = is2020Plus ? ((unifiedSimTag === 'FS2020') ? dl2024 : dl2020) : null;
              const hasFilesCachedForSelection = (
                hasChannelVariantZip(recHere, unifiedSimTag) || hasChannelVariantZip(recAlt, (unifiedSimTag === 'FS2020' ? 'FS2024' : 'FS2020')) ||
                (!expectedZipUnified && (hasChannelBaseZip(recHere, unifiedSimTag) || hasChannelBaseZip(recAlt, (unifiedSimTag === 'FS2020' ? 'FS2024' : 'FS2020'))))
              );
              // Show Download when:
              // - remote version exists and is newer than the downloaded one, OR
              // - remote is unknown AND nothing is cached for this selection
              // Decide if a new download is required and collect debug reasons
              let hasNewToDownload = false;
              const hasNewReasons = [];
              if (selectedRemoteVersionDisplay) {
                // Only suppress download when the latest version is actually cached as a file.
                // If the installed version matches remote but no ZIP is cached, still allow download
                // so the user can re-download for reinstall purposes.
                if (!isLatestAlreadyDownloaded || !hasFilesCachedForSelection) {
                  hasNewToDownload = true;
                  hasNewReasons.push(!isLatestAlreadyDownloaded ? 'remoteVersionNewer' : 'latestInstalledButNotCached');
                } else { hasNewReasons.push('remoteAlreadyCachedLatest'); }
              } else {
                if (!hasFilesCachedForSelection) { hasNewToDownload = true; hasNewReasons.push('noRemoteVersionAndNoCache'); }
                else { hasNewReasons.push('noRemoteVersionButCachePresent'); }
              }
              if (window.__SWS_DEBUG_GLOBAL) {
                try { console.debug('[dl] hasNewToDownload=%s reasons=%o pid=%s sim=%s chan=%s', hasNewToDownload, hasNewReasons, product?.id, unifiedSimTag, selectedChan); } catch {}
              }
              // Strict channel enforcement: only show cached version for the SELECTED channel.
              // No cross-channel fallback — if Public has no download, don't show Beta's version.
              const cachedChannel = selectedChan;
              const cachedVersion = selectedDownloadedVersion || '';
              // Compute installedChannelForUnified / installedVersionForUnified BEFORE the label
              // so that the label logic can detect installed state. Previously these were defined
              // after the label block, causing them to be undefined when accessed (TDZ / var-hoisting).
              let installedChannelForUnified;
              let installedVersionForUnified;
              if (is2020Plus) {
                const chan20 = installed2020Channel || '';
                const chan24 = installed2024Channel || '';
                if (/beta/i.test(chan20)) {
                  installedChannelForUnified = installed2020Channel;
                  installedVersionForUnified = installed2020Version;
                } else if (/beta/i.test(chan24)) {
                  installedChannelForUnified = installed2024Channel;
                  installedVersionForUnified = installed2024Version;
                } else {
                  installedChannelForUnified = installed2020Channel || installed2024Channel;
                  installedVersionForUnified = installed2020Version || installed2024Version;
                }
              } else {
                installedChannelForUnified = (unifiedSimTag === 'FS2020') ? installed2020Channel : installed2024Channel;
                installedVersionForUnified = (unifiedSimTag === 'FS2020') ? installed2020Version : installed2024Version;
              }
        // Improved label semantics:
        //  Cancel (busy)
        //  Update to vX (installed older same channel)
        //  Install vX (switch) (channel flip needing download)
        //  Install vX / Install (first install no cache)
        //  Download vX (cached other channel / variant difference w/out install?)
        //  Download Update vX (both-sim aggregate update mode)
        //  Installed vX (up-to-date same channel)
        //  Downloaded vX [Channel] (cached but not installed)
        const installedChannel = installedChannelForUnified;
        const viewingChannel = selectedChan;
        const channelFlip = !!installedChannel && installedChannel !== viewingChannel;
        const installedVersion = installedVersionForUnified;
  const remoteVer = selectedRemoteVersionDisplay;
        const installedLatestSameChannel = !!(
          installedChannel &&
          viewingChannel === installedChannel &&
          isLatestAlreadyDownloaded
        );
        const updateSameChan = anyUpdateAvailable && viewingChannel === installedChannel;
        let label;
        if (noAvailableDownloads) {
          label = 'Currently Not Available';
        } else if (isBusyDl) {
          label = 'Downloading — Click to cancel';
        } else if (flowBusy) {
          label = 'Cancel';
        } else if (anyUpdateAvailable && remoteVer) {
          label = `Download Update\nv${remoteVer}\n(${viewingChannel.toLowerCase()})`;
        } else if (anyUpdateAvailable) {
          label = `Download Update\n(${viewingChannel.toLowerCase()})`;
        } else if (!hasNewToDownload) {
          // Up-to-date or cached state
            if (!installedChannel) {
              // Not installed:
              // - if files are cached, show Downloaded
              // - otherwise keep normal Download + version text
              if (hasFilesCachedForSelection) {
                label = `Downloaded${cachedVersion ? ` v${cachedVersion}` : ''}\n(${(cachedChannel || viewingChannel).toLowerCase()})`;
              } else {
                label = remoteVer
                  ? `Download\nv${remoteVer}\n(${viewingChannel.toLowerCase()})`
                  : `Download\n(${viewingChannel.toLowerCase()})`;
              }
            } else
            if (channelFlip) {
              // Channel switch — even though files may be cached, show the switch action
              label = remoteVer
                ? `Install\nv${remoteVer}\n(switch to ${viewingChannel.toLowerCase()})`
                : `Install\n(switch to ${viewingChannel.toLowerCase()})`;
            } else if (cachedVersion) {
              label = `Downloaded${cachedVersion ? ` v${cachedVersion}` : ''}\n(${(cachedChannel || viewingChannel).toLowerCase()})`;
            } else {
              label = `Downloaded\n(${viewingChannel.toLowerCase()})`;
            }
        } else {
          // Need a download
          if (channelFlip && remoteVer) {
            label = `Download\nv${remoteVer}\n(switch)`;
          } else if (channelFlip) {
            label = 'Download\n(switch)';
          } else if (remoteVer) {
            label = `Download\nv${remoteVer}\n(${viewingChannel.toLowerCase()})`;
          } else {
            label = `Download\n(${viewingChannel.toLowerCase()})`;
          }
        }
        const title = (() => {
          if (noAvailableDownloads) return 'This product is not yet available for download';
          if (isBusyDl) return 'Downloading — Click to cancel';
          if (flowBusy) return 'Cancel';
          if (updateSameChan) return 'Download latest version of the installed channel and replace cache';
          if (channelFlip) return remoteVer ? `Switch channel (${installedChannel} → ${viewingChannel}) and install v${remoteVer}` : `Switch channel (${installedChannel} → ${viewingChannel}) and install`;
          if (!hasNewToDownload) {
            if (installedChannel && viewingChannel === installedChannel && isLatestAlreadyDownloaded) return `Installed ${installedChannel}${installedVersion ? ` v${installedVersion}` : ''} (latest)`;
            return `Cached ${cachedChannel || viewingChannel}${cachedVersion ? ` v${cachedVersion}` : ''}`;
          }
          if (!installedChannel) return remoteVer ? `Download channel ${viewingChannel} v${remoteVer}` : `Download channel ${viewingChannel}`;
          return remoteVer ? `Download version v${remoteVer}` : 'Download latest version';
        })();
        const bg = flowBusy
        ? '#7a4300'
        : (anyUpdateAvailable
          ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)'
          : (channelFlip
            ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)'
            : (!hasNewToDownload
              ? 'linear-gradient(135deg, #475569 0%, #334155 100%)'
              : 'linear-gradient(135deg, #22c55e 0%, #16a34a 50%, #15803d 100%)')));
              // ---------------- Outline/fill semantic logic ----------------
              // installedChannelForUnified / installedVersionForUnified are computed above (before label block).
              const betaInstalled = /beta/i.test(installedChannelForUnified || '');
              // Determine if other channel is available (Beta <-> Public flip)
              const otherChannel = betaSelected ? 'Public' : 'Beta';
              const otherChannelAvailable = otherChannel === 'Beta' ? !!betaExists : true; // Public always exists
              const channelFlipPossible = otherChannelAvailable && (!flowBusy);
              const updateSameChannel = !!(anyUpdateAvailable && selectedChan === installedChannelForUnified);
              // Fill states priority: Busy > UpdateSameChannel > ChannelFlip > UpToDate/Default
              // UpToDate uses same color as outline (solid/gradient). Flip uses other channel color. Update uses gray.
              const colBetaFill = SWS_THEME.fill.beta;
              const colPublicFill = SWS_THEME.fill.public;
              const colGrayFill = SWS_THEME.fill.gray;
              const outlineColor = betaInstalled ? SWS_THEME.outline.beta : (installedChannelForUnified ? SWS_THEME.outline.public : SWS_THEME.outline.neutral);
              let fillStyle;
              let semanticState = 'default';
              if (noAvailableDownloads) { fillStyle = colGrayFill; semanticState = 'unavailable'; }
              else if (flowBusy) { fillStyle = '#7a4300'; semanticState = 'busy'; }
              else if (updateSameChannel) { fillStyle = colGrayFill; semanticState = 'update'; }
              else if (channelFlipPossible && installedChannelForUnified && selectedChan !== installedChannelForUnified) {
                // We are viewing/selected the other channel relative to installed → fill shows that target channel color
                fillStyle = selectedChan === 'Beta' ? colBetaFill : colPublicFill; semanticState = 'flip';
              } else if (!installedChannelForUnified) {
                // Nothing installed. Distinguish between: (a) no cache yet (first install) and (b) cache present (Downloaded vX) but not installed.
                if (!hasNewToDownload && hasFilesCachedForSelection) {
                  // Cached-only (Downloaded vX [Channel]) -> grey to indicate passive state (different from green install-first)
                  fillStyle = 'linear-gradient(135deg, #475569 0%, #334155 100%)';
                  semanticState = 'cached-only';
                } else {
                  // First install scenario (no cache) — show target channel color to encourage action
                  fillStyle = selectedChan === 'Beta' ? colBetaFill : colPublicFill; 
                  semanticState = 'install-first';
                }
              } else if (!hasNewToDownload) {
                // Latest already downloaded: gray out the Download button per spec
                if (installedChannelForUnified && selectedChan === installedChannelForUnified && isLatestAlreadyDownloaded) {
                  fillStyle = colGrayFill;
                  semanticState = 'up-to-date';
                } else if (!installedChannelForUnified && hasFilesCachedForSelection) {
                  // Cached-only (already handled earlier, defensive fallback)
                  fillStyle = 'linear-gradient(135deg, #475569 0%, #334155 100%)';
                  semanticState = 'cached-only';
                } else {
                  // Default to gray fill to indicate no new download needed
                  fillStyle = colGrayFill; semanticState = 'up-to-date';
                }
              } else {
                // Default download scenario (new to download same channel)
                fillStyle = selectedChan === 'Beta' ? colBetaFill : colPublicFill; semanticState = 'download';
              }
              // (Removed beta stripe pattern for unified download button as per request; stripes only on per-sim install buttons now.)
              // Tooltip enrichment: append semantic explanation
              const titleExtra = {
                'unavailable':'This product is not yet available for download',
                'busy':'Operation in progress',
                'update':'Gray fill: newer version cached/download available for installed channel',
                'flip':`Outline=${installedChannelForUnified||'none'} • Fill=${selectedChan}: switch channel`,
                'install-first':'Nothing installed yet; click to install selected channel',
                'cached-only':'Cached locally (not installed) — click to install or switch channel',
                'up-to-date':'Installed version is latest for this channel',
                'download':'Download latest for selected channel'
              }[semanticState] || '';
              const finalTitle = title + (titleExtra ? `\n${titleExtra}` : '');
              const handleClick = async () => {
                if (flowBusy) {
                  // If an actual download is running, abort it
                  if (isBusyDl) {
                    try { handleCancelDownload?.(); } catch {}
                  }
                  // Close any gating/picker modals that are open
                  try { if (showDownloadModal) setShowDownloadModal(false); } catch {}
                  try { if (preDlModal.open) setPreDlModal(prev => ({ ...prev, open:false })); } catch {}
                  try { if (eulaModal.open) setEulaModal({ open:false, simTag:null, channel:'Public' }); } catch {}
                  try { if (betaModal.open) setBetaModal({ open:false, onAccept:null, onCancel:null }); } catch {}
                  return;
                }
                // If another product is currently downloading, queue or dequeue this one
                if (downloadingId && downloadingId !== product.id && hasNewToDownload) {
                  const alreadyQueued = (pendingDownloadQueue || []).some(q => q.productId === product.id);
                  if (alreadyQueued) {
                    dequeueDownload(product.id);
                    onStatus?.(`${product.name} removed from queue`);
                  } else {
                    const targetSim = anyUpdateAvailable
                      ? (hasUpdate2020 ? 'FS2020' : (hasUpdate2024 ? 'FS2024' : unifiedSimTag))
                      : unifiedSimTag;
                    enqueueDownload(product, targetSim, selectedChan);
                    onStatus?.(`${product.name} queued for download`);
                  }
                  return;
                }
                // Update flow: prefer update semantics over generic download
                if (anyUpdateAvailable) {
                  const bothHaveUpdates = !!(hasUpdate2020 && hasUpdate2024);
                  const bothAvailable = !!(can2020 && can2024);
                  if (bothHaveUpdates && bothAvailable) {
                    setUpdateMode(true);
                    setShowDownloadModal(true);
                    return;
                  }
                  const targetSim = hasUpdate2020 ? 'FS2020' : (hasUpdate2024 ? 'FS2024' : unifiedSimTag);
                  const intendedChan = selectedChan; // capture channel at click time
                  await handleDeleteCached(targetSim);
                  await beginDownloadFlowWithChan(targetSim, intendedChan);
                  return;
                }
                // Download button stays download-only.
                // If files are already cached ("Downloaded" state), do not open variant pickers or trigger install flow.
                if (!hasNewToDownload) {
                  if (hasFilesCachedForSelection) {
                    onStatus?.('Files are already downloaded for this channel. Use the Install button below.');
                  } else {
                    onStatus?.('No new download is needed right now.');
                  }
                  return;
                }
                if (showBothSimOptions) {
                  setShowDownloadModal(true);
                } else {
                  const target = unifiedSimTag;
                  const intendedChan = selectedChan;
                  await beginDownloadFlowWithChan(target, intendedChan);
                }
              };
              // Disable Modify when product is fully unavailable and nothing is installed or cached
              const _anyInstalled = !!(installed2020 || installed2024);
              const _anyCached = !!(dl2020?.localPath || dl2024?.localPath);
              const gearEnabled = !noAvailableDownloads || _anyInstalled || _anyCached;
              return (
                <div style={{ position:'relative', alignSelf:'stretch', flex:'1 1 0' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 48px', gap:12, alignItems:'stretch', height:'100%', minHeight:0, position:'relative' }}>
                  {/* Config gear button */}
                  <div style={{ position:'relative', width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {(anyInstalledBeta || betaProductChecked) && (
                      <span
                        style={{
                          position:'absolute',
                          bottom:'100%',
                          left:0,
                          right:0,
                          marginBottom:12,
                          textAlign:'center',
                          color: (anyInstalledBeta || betaProductChecked) ? '#231f20' : '#fff',
                          fontSize:28,
                          fontWeight:700,
                          letterSpacing:0.4,
                          lineHeight:1,
                          whiteSpace:'nowrap'
                        }}
                      >
                        beta
                      </span>
                    )}
                  <button
                    type="button"
                    disabled={!gearEnabled}
                    onClick={() => { if (gearEnabled) setShowModifyMenuSim(prev => prev ? null : 'product'); }}
                    title={gearEnabled ? 'Modify options' : 'Not available'}
                    style={{
                      width:'100%', boxSizing:'border-box',
                      aspectRatio:'1', 
                      background: gearEnabled ? '#232b32' : '#4b535c',
                      color:'#fff',
                      border: gearEnabled ? 'none' : '1px solid #636d77',
                      borderRadius:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      cursor: gearEnabled ? 'pointer' : 'default',
                      boxShadow:'none'
                    }}
                  >
                    <img src={cogIcon} alt="Settings" style={{ width:40, height:40, filter: gearEnabled ? 'none' : 'grayscale(1) brightness(0.82)' }} />
                  </button>
                  </div>
                  {/* Changelog above download */}
                  <div style={{ position:'relative', width:'100%', height:'100%' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        const tag = unifiedSimTag;
                        const chan = getChan(tag) || 'Public';
                        openChangelog(tag, chan);
                      }}
                      style={{
                        position:'absolute',
                        bottom:'100%',
                        left:0,
                        right:0,
                        marginBottom:12,
                        boxSizing:'border-box',
                        background:'#1f2c3b',
                        color:'#90caf9',
                        border:'1px solid #33414a',
                        borderRadius:0,
                        padding:'8px 10px',
                        cursor:'pointer',
                        fontSize:11,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        gap:4,
                        boxShadow:'none',
                        whiteSpace:'nowrap'
                      }}
                      title={`View changelog for ${getChan(unifiedSimTag) || 'Public'}${selectedDownloadedVersion ? ` (downloaded v${selectedDownloadedVersion})` : ''}`}
                    >
                      <MdMenuBook size={12} />
                      Changelog
                    </button>
                  {/* Download button */}
                  <button
                    type="button"
                    onClick={handleClick}
                    title={finalTitle}
                    className={semanticState === 'download' ? 'sws-download-btn' : undefined}
                    style={{
                      width:'100%', height:'100%', boxSizing:'border-box',
                      background: '#1f2c3b',
                      color:'#fff',
                      border: 'none',
                      borderRadius:0,
                      padding:'10px', fontWeight:800, fontSize:14, cursor:'pointer',
                      boxShadow: 'none',
                      position:'relative',
                      overflow:'hidden'
                    }}
                    disabled={
                      noAvailableDownloads ||
                      (
                        (!flowBusy) &&
                        (!anyUpdateAvailable) &&
                        !hasNewToDownload &&
                        !channelFlip &&
                        installedLatestSameChannel &&
                        !(pendingDownloadQueue || []).some(q => q.productId === product.id)
                      )
                    }
                  >
                    {isBusyDl && typeof downloadProgress === 'number' && (
                      <div style={{
                        position:'absolute',
                        left:0, top:0, bottom:0,
                        width: `${Math.min(Math.max(downloadProgress, 0), 100)}%`,
                        background:'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        transition:'width 0.3s ease',
                        zIndex:0
                      }} />
                    )}
                    <span style={{ position:'relative', zIndex:1, display:'flex', flexDirection:'column', alignItems:'center', lineHeight:1.2, fontSize:13 }}>
                      {(() => {
                        const isQueued = !isBusyDl && (pendingDownloadQueue || []).some(q => q.productId === product.id);
                        if (isQueued) {
                          return (
                            <>
                              <span>Queued for {label.split('\n')[0]}</span>
                              <span style={{ fontSize:9, fontWeight:600, color:'#facc15', marginTop:1 }}>click to remove from queue</span>
                            </>
                          );
                        }
                        return label.split('\n').map((line, i) => <span key={i}>{line}</span>);
                      })()}
                    </span>
                  </button>
                  </div>
                  <button
                    type="button"
                    onClick={async () => { if (!isBusyDl) await handleDeleteAllCached(); }}
                    title="Delete installed package, cache, and downloads"
                    style={{
                      width:'100%', height:'100%', boxSizing:'border-box',
                      background:'#ed1c24',
                      color:'#fff', border:'none', borderRadius:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      boxShadow:'none',
                      cursor: (!isBusyDl && (hasAnyCache2020 || hasAnyCache2024 || installed2020 || installed2024)) ? 'pointer' : 'not-allowed'
                    }}
                    disabled={isBusyDl || !(hasAnyCache2020 || hasAnyCache2024 || installed2020 || installed2024)}
                  >
                    <img src={binIcon} alt="Delete" style={{ width:16, height:16 }} />
                  </button>
                </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      {/* Modify Modal (product-level) */}
      {showModifyMenuSim && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true"
             onMouseDown={(e) => { if (e.target === e.currentTarget) setShowModifyMenuSim(null); }}>
          <div className="sws-modal sws-modal-md sws-modify-modal" role="document">
            <div className="sws-modal-header">
              <h3 className="sws-modal-title">Modify — {product.name}</h3>
              <button type="button" className="sws-close" title="Close" onClick={() => setShowModifyMenuSim(null)}>×</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:8 }}>
              {betaToggleVisible && (
                <div style={{ display:'flex', flexDirection:'row', flexWrap:'wrap', alignItems:'center', columnGap:12, rowGap:6, padding:'4px 0' }}>
                  <label style={{
                    display:'inline-flex', alignItems:'center', gap:10,
                    background:'#1e2429', color:'#ffd600',
                    border:'1px solid #33414a', borderRadius:0,
                    padding:'6px 12px', fontSize:13, fontWeight:800,
                    cursor:'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={!!betaProductChecked}
                      style={{ width:16, height:16, transform:'scale(1.0)', accentColor:'#ffd600', cursor:'pointer' }}
                      onChange={async (e) => {
                        try { autoSetChannelOnceRef.current = true; } catch {}
                        const enable = e.currentTarget ? !!e.currentTarget.checked : !!e.target.checked;
                        const _pid = String(product?.id || product?.bunny?.folder || '');
                        const _persistChan = (ch) => {
                          try {
                            if (_pid) { localStorage.setItem(`sws_chan_${_pid}_FS2020`, ch); localStorage.setItem(`sws_chan_${_pid}_FS2024`, ch); }
                            localStorage.setItem('sws_chan_global_FS2020', ch); localStorage.setItem('sws_chan_global_FS2024', ch);
                          } catch {}
                        };
                        if (enable) {
                          let skipAck = false;
                          try { skipAck = localStorage.getItem('sws_skip_beta_ack') === '1'; } catch {}
                          let ok = true;
                          if (!skipAck) { ok = await ensureBetaAckUI(); }
                          if (!ok) { setSelectedChannelBySim(prev => ({ ...prev, FS2020:'Public', FS2024:'Public' })); _persistChan('Public'); return; }
                          setSelectedChannelBySim(prev => ({ ...prev, FS2020:'Beta', FS2024:'Beta' }));
                          _persistChan('Beta');
                          setChannelVisualTick(t => t + 1);
                          try { setChannelFilter && setChannelFilter('beta'); } catch {}
                          channelBumpRef.current++;
                          try {
                            const notes = [];
                            if (can2020 && betaAvailable['2020'] === false) notes.push('no Beta for MSFS 2020');
                            if (can2024 && betaAvailable['2024'] === false) notes.push('no Beta for MSFS 2024');
                            onStatus?.(`Beta channel selected. ${notes.length ? `Note: ${notes.join(' • ')}.` : ''} Use Download to fetch Beta files.`);
                          } catch {}
                        } else {
                          setSelectedChannelBySim(prev => ({ ...prev, FS2020:'Public', FS2024:'Public' }));
                          _persistChan('Public');
                          setChannelVisualTick(t => t + 1);
                          try { setChannelFilter && setChannelFilter('public'); } catch {}
                          channelBumpRef.current++;
                          try { onStatus?.('Public channel selected. Use Download to fetch Public files if needed.'); } catch {}
                        }
                      }}
                    />
                    <span>Use Beta channel</span>
                  </label>
                  {!betaChecking && (
                    <span style={{ color:'#b0bec5', fontSize:11 }}>
                      {(() => {
                        const notes = [];
                        if (can2020 && betaAvailable['2020'] === false) notes.push('No Beta for MSFS 2020');
                        if (can2024 && betaAvailable['2024'] === false) notes.push('No Beta for MSFS 2024');
                        return notes.length ? notes.join(' • ') : '';
                      })()}
                    </span>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => { try { openChangelog(unifiedSimTag, getChan(unifiedSimTag) || 'Public'); } catch {}; setShowModifyMenuSim(null); }}
                className="btn btn-outline"
                style={{ textAlign:'left' }}
              >View Changelog…</button>
              {components.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const lastSim = (() => { try { return localStorage.getItem('sws_lastInstallSim_' + product.id) || ''; } catch { return ''; } })();
                    const effectiveSim = (lastSim === 'FS2024' && installed2024) ? 'FS2024'
                      : (lastSim === 'FS2020' && installed2020) ? 'FS2020'
                      : (installed2024 ? 'FS2024' : (installed2020 ? 'FS2020' : unifiedSimTag));
                    setPendingSimForDownload(effectiveSim);
                    setVariantChoice(selectedComponents[0] || components[0]?.zip || '');
                    setShowVariantModal(true);
                    setShowModifyMenuSim(null);
                  }}
                  className="btn btn-primary"
                  style={{ textAlign:'left' }}
                >Change Variant…</button>
              )}
              <button
                type="button"
                title="Repairs this product's install: uninstall then reinstall from the cached ZIPs."
                disabled={!(installed2020 || installed2024)}
                onClick={async () => {
                  try {
                    const lastSim = (() => { try { return localStorage.getItem('sws_lastInstallSim_' + product.id) || ''; } catch { return ''; } })();
                    const simTag = (lastSim === 'FS2024' && installed2024) ? 'FS2024'
                      : (lastSim === 'FS2020' && installed2020) ? 'FS2020'
                      : (installed2024 ? 'FS2024' : 'FS2020');
                    const dlRec = simTag === 'FS2020' ? dl2020 : dl2024;
                    const installedSimRef = simTag === 'FS2020' ? installed2020 : installed2024;
                    if (!installedSimRef) { onStatus?.('Nothing installed to repair.'); setShowModifyMenuSim(null); return; }
                    if (!dlRec?.localPath) { onStatus?.('No cached files to repair. Download the variant first.'); setShowModifyMenuSim(null); return; }
                    onStatus?.(`Repairing install (${simTag})…`);
                    await handleUninstall(installedSimRef);
                    if (dlRec.baseLocalPath) {
                      await handleInstall(product, dlRec.baseLocalPath, simTag, dlRec.channel || 'Public', '', dlRec.baseZip || '');
                    }
                    await handleInstall(product, dlRec.localPath, simTag, dlRec.channel || 'Public', '', dlRec.variantZip || '');
                    onStatus?.('Repair complete.');
                  } catch (e) {
                    onStatus?.('Repair failed: ' + (e?.message || String(e)));
                  } finally {
                    setShowModifyMenuSim(null);
                  }
                }}
                className="btn btn-outline"
                style={{ textAlign:'left', opacity: (installed2020 || installed2024) ? 1 : 0.4 }}
              >Repair Install</button>
              <button
                type="button"
                disabled={!(installed2020 || installed2024)}
                onClick={async () => {
                  try {
                    const lastSim = (() => { try { return localStorage.getItem('sws_lastInstallSim_' + product.id) || ''; } catch { return ''; } })();
                    const simTag = (lastSim === 'FS2024' && installed2024) ? 'FS2024'
                      : (lastSim === 'FS2020' && installed2020) ? 'FS2020'
                      : (installed2024 ? 'FS2024' : 'FS2020');
                    const installedSimRef = simTag === 'FS2020' ? installed2020 : installed2024;
                    const installPath = simTag === 'FS2020' ? installPath2020 : installPath2024;
                    const folder = installedSimRef?.folder || installedSimRef?.name;
                    if (!installPath || !folder || !window.electron?.getPackageRealPath) return;
                    const info = await window.electron.getPackageRealPath(installPath, folder);
                    const open = info?.realDir || info?.linkDir;
                    if (open && window.electron?.revealInFolder) {
                      await window.electron.revealInFolder(open);
                    }
                  } catch {}
                }}
                className="btn btn-outline"
                style={{ textAlign:'left', opacity: (installed2020 || installed2024) ? 1 : 0.4 }}
              >Open install folder…</button>
              <button
                type="button"
                disabled={isBusyDl || !(hasAnyCache2020 || hasAnyCache2024 || installed2020 || installed2024)}
                onClick={async () => {
                  if (!isBusyDl) {
                    await handleDeleteAllCached();
                    setShowModifyMenuSim(null);
                  }
                }}
                className="btn btn-outline"
                style={{ textAlign:'left', color:'#e74c3c', opacity: (hasAnyCache2020 || hasAnyCache2024 || installed2020 || installed2024) ? 1 : 0.4 }}
              >Delete all cached &amp; installed…</button>
              <div className="sws-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModifyMenuSim(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
      {/* Download Modal */}
      {showDownloadModal && !isBusyDl && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true"
             onMouseDown={(e) => { if (e.target === e.currentTarget) { setShowDownloadModal(false); setUpdateMode(false); } }}>
          <div ref={downloadModalRef} className="sws-modal sws-modal-sm" role="document">
            <div className="sws-modal-header">
              <h3 className="sws-modal-title" style={{ fontSize:16 }}>{downloadPickerLabel}</h3>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowDownloadModal(false); setUpdateMode(false); }}>Close</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {!showBothSimOptions ? (
                <button
                  type="button"
          onClick={async () => {
            const target = unifiedSimTag;
            setShowDownloadModal(false);
            if (updateMode) { await handleDeleteCached(target); setUpdateMode(false); }
            await beginDownloadFlow(target);
          }}
                  className="btn btn-primary sws-download-btn" style={{ textAlign:'left', border:'none', borderWidth:0, outline:'none' }}
                  title={unifiedSimTag === 'FS2020' ? 'Downloads the MSFS 2020 package (works on 2024 for 2020+ products)' : 'Downloads the MSFS 2024 package'}
                >
                  {`Download${getChan(unifiedSimTag) === 'Beta' ? ' [Beta]' : ''}`}
                  {is2020Plus && unifiedSimTag === 'FS2020' ? ' (MSFS 2020+)' : (unifiedSimTag === 'FS2020' ? ' (2020)' : ' (2024)')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!can2020}
                    onClick={async () => { setShowDownloadModal(false); if (updateMode) { await handleDeleteCached('FS2020'); setUpdateMode(false); } await beginDownloadFlow('FS2020'); }}
                      // Above call will now consistently reflect current channel due to synchronous state read in beginDownloadFlow
                    className={can2020 ? 'btn btn-primary sws-download-btn' : 'btn btn-ghost'} style={{ textAlign:'left', border: can2020 ? 'none' : undefined, borderWidth: can2020 ? 0 : undefined, outline: can2020 ? 'none' : undefined }}
                    title={can2020 ? 'Download all components for 2020' : 'Not available for 2020'}
                  >Download for 2020{getChan('FS2020') === 'Beta' ? ' [Beta]' : ''}</button>
                  <button
                    type="button"
                    disabled={!can2024}
                    onClick={async () => { setShowDownloadModal(false); if (updateMode) { await handleDeleteCached('FS2024'); setUpdateMode(false); } await beginDownloadFlow('FS2024'); }}
                      // Above call will now consistently reflect current channel due to synchronous state read in beginDownloadFlow
                    className={can2024 ? 'btn btn-primary sws-download-btn' : 'btn btn-ghost'} style={{ textAlign:'left', border: can2024 ? 'none' : undefined, borderWidth: can2024 ? 0 : undefined, outline: can2024 ? 'none' : undefined }}
                    title={can2024 ? 'Download all components for 2024' : 'Not available for 2024'}
                  >Download for 2024{getChan('FS2024') === 'Beta' ? ' [Beta]' : ''}</button>
                </>
              )}

              {/* Removed cache deletion controls from Download modal per request */}
            </div>
          </div>
        </div>
      ), document.body)}
      {/* Variant Modal */}
      {showVariantModal && (
        <div className="sws-modal-overlay" role="dialog" aria-modal="true">
          <div className="sws-modal sws-modal-sm" role="document">
            <h3 className="sws-modal-title" style={{ marginBottom:12 }}>Choose Variant</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {components.filter(c => !!c.zip).map(c => (
                <label key={c.zip} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--sws-bg-1)', padding:'8px 10px', borderRadius:6, border:'1px solid var(--sws-line)' }}>
                  <input
                    type="radio"
                    name={`variant-${product.id}`}
                    checked={variantChoice === c.zip}
                    onChange={() => setVariantChoice(c.zip)}
                  />
                  <span style={{ fontSize:13 }}>{c.label || c.zip.replace(/\.zip$/,'')}</span>
                </label>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button
                type="button"
                onClick={() => { setShowVariantModal(false); setPendingSimForDownload(null); }}
                className="btn btn-ghost"
              >Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  if (variantChoice) setSelectedComponents([variantChoice]);
                  const simTag = pendingSimForDownload;
                  const comp = (components || []).find(c => c.zip === variantChoice) || null;
                  setShowVariantModal(false);
                  setPendingSimForDownload(null);
                  if (!simTag) return;

                  const loadDlRecord = (channel) => {
                    const inState = simTag === 'FS2020' ? dl2020 : dl2024;
                    const persisted = readDlCacheForProduct(product, simTag, channel) || null;
                    return mergeDl(inState, persisted);
                  };

                  // If the chosen variant is already cached for this sim/channel, install it now.
                  try {
                    const simKey = simTag.replace('FS','');
                    const selectedChannel = getChan(simTag) || 'Public';
                    const desiredZip = getVariantZipForSim(comp, product, simKey) || variantChoice;
                    const dlRec = loadDlRecord(selectedChannel);
                    const desiredBase = zipBase(desiredZip);
                    let vrec = dlRec?.variants?.[desiredBase]
                      || (dlRec?.localPath && zipEquivalent(dlRec?.variantZip, desiredZip) ? { localPath: dlRec.localPath, channel: dlRec.channel, variantZip: dlRec.variantZip } : null);
                    if (!vrec || !vrec.localPath) {
                      // Cross-sim fallback: look for the same component's base across sim zips
                      const comps = (product?.bunny?.components || product.components || []);
                      const chosenComp = comps.find(c => zipBase(c.zip) === desiredBase) || null;
                      const bases = new Set([desiredBase]);
                      if (chosenComp) {
                        const b20 = getVariantZipForSim(chosenComp, product, '2020');
                        const b24 = getVariantZipForSim(chosenComp, product, '2024');
                        if (b20) bases.add(zipBase(b20));
                        if (b24) bases.add(zipBase(b24));
                      }
                      const variantsMap = dlRec?.variants || {};
                      const alt = Object.entries(variantsMap).find(([k, v]) => !!v?.localPath && bases.has(k));
                      if (alt && alt[1]) vrec = alt[1];
                    }
                    const installedSim = (simTag === 'FS2020' ? installed2020 : installed2024)
                      || installed2020 || installed2024;

                    if (vrec && vrec.localPath && installedSim) {
                      onStatus?.(`Changing variant (${simTag})…`);
                      // Uninstall current variant
                      await handleUninstall(installedSim);
                      // If base is cached and differs from the selected variant's base, install it first
                      const baseZip = getBaseZipForSim(product, simKey);
                      if (dlRec?.baseLocalPath && baseZip && zipBase(baseZip) !== zipBase(desiredZip)) {
                        onStatus?.(`Aligning base package (${simTag}) before installing variant…`);
                        if (__SWS_DEBUG_GLOBAL) console.debug('Base mismatch detected; installing base first', { baseZip, desiredZip });
                        await handleInstall(product, dlRec.baseLocalPath, simTag, selectedChannel, '', dlRec.baseZip || baseZip);
                      }
                      // Install chosen variant
                      await handleInstall(product, vrec.localPath, simTag, selectedChannel, '', vrec.variantZip || desiredZip);
                      onStatus?.('Variant changed.');
                      return;
                    }
                  } catch (e) {
                    // fall back to download
                    console.debug('Modify->Change Variant fast-install skipped:', e?.message || String(e));
                  }
                  // Not cached: download the chosen variant
                  await startDownload(simTag, comp);
                  try {
                    const simKey = simTag.replace('FS','');
                    const selectedChannel = getChan(simTag) || 'Public';
                    const desiredZip = getVariantZipForSim(comp, product, simKey) || variantChoice;
                    const desiredBase = zipBase(desiredZip);
                    const dlAfter = loadDlRecord(selectedChannel);
                    const installedSim = (simTag === 'FS2020' ? installed2020 : installed2024)
                      || installed2020 || installed2024;
                    let vrec = dlAfter?.variants?.[desiredBase]
                      || (dlAfter?.localPath && zipEquivalent(dlAfter?.variantZip, desiredZip) ? { localPath: dlAfter.localPath, channel: dlAfter.channel, variantZip: dlAfter.variantZip } : null);
                    if (!vrec || !vrec.localPath) {
                      const comps = (product?.bunny?.components || product.components || []);
                      const chosenComp = comps.find(c => zipBase(c.zip) === desiredBase) || null;
                      const bases = new Set([desiredBase]);
                      if (chosenComp) {
                        const b20 = getVariantZipForSim(chosenComp, product, '2020');
                        const b24 = getVariantZipForSim(chosenComp, product, '2024');
                        if (b20) bases.add(zipBase(b20));
                        if (b24) bases.add(zipBase(b24));
                      }
                      const variantsMap = dlAfter?.variants || {};
                      const alt = Object.entries(variantsMap).find(([k, v]) => !!v?.localPath && bases.has(k));
                      if (alt && alt[1]) vrec = alt[1];
                    }
                    if (vrec && vrec.localPath && installedSim) {
                      onStatus?.(`Changing variant (${simTag})…`);
                      await handleUninstall(installedSim);
                      const baseZip = getBaseZipForSim(product, simKey);
                      if (dlAfter?.baseLocalPath && baseZip && zipBase(baseZip) !== zipBase(desiredZip)) {
                        onStatus?.(`Aligning base package (${simTag}) before installing variant…`);
                        if (__SWS_DEBUG_GLOBAL) console.debug('Base mismatch detected (post-download); installing base first', { baseZip, desiredZip });
                        await handleInstall(product, dlAfter.baseLocalPath, simTag, selectedChannel, '', dlAfter.baseZip || baseZip);
                      }
                      await handleInstall(product, vrec.localPath, simTag, selectedChannel, '', vrec.variantZip || desiredZip);
                      onStatus?.('Variant changed.');
                      return;
                    } else {
                      onStatus?.(!installedSim ? 'Install the product first before changing variant.' : 'Could not locate cached variant files. Try downloading again.');
                    }
                  } catch (e) {
                    onStatus?.('Variant change failed: ' + (e?.message || String(e)));
                    console.debug('Modify->Change Variant post-download install failed:', e?.message || String(e));
                  }
                }}
                className="btn btn-info"
                disabled={!pendingSimForDownload || !variantChoice}
              >Continue</button>
            </div>
          </div>
        </div>
      )}
      {/* EULA Modal */}
      {eulaModal.open && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { /* explicit Accept/Reject */ }}>
          <div className="sws-modal sws-modal-lg" role="document">
            <div className="sws-modal-header">
              <h3 className="sws-modal-title" style={{ margin:0, color:'#fff' }}>End User License Agreement</h3>
            </div>
            <div className="sws-modal-body" style={{ lineHeight:1.6, fontSize:12, maxHeight:'60vh', overflowY:'auto' }}>
              {(() => {
                const pname = (product?.name && String(product.name).trim()) || 'SimWorks Studios Product';
                return (<>
                  <p style={{ fontWeight:700, marginTop:0 }}>END-USER LICENSE AGREEMENT (EULA) for SimWorks Studios {pname} for Microsoft Flight Simulator Addon.</p>
                  <p>IMPORTANT - PLEASE READ CAREFULLY: This End-User License Agreement ("EULA") is a legal agreement between you (either an individual or single entity) and SimWorks Studios Ltd., for the SimWorks Studios Ltd. software product identified above, which includes software and includes associated media and "online" or electronic documentation ("SOFTWARE PRODUCT"). The SOFTWARE PRODUCT also includes any updates and supplements to the original SOFTWARE PRODUCT which may be provided to you by SimWorks Studios Ltd. By accessing or otherwise using the SOFTWARE PRODUCT, you agree to be bound by the terms of this EULA. If you do not agree to the terms of this EULA, do not use the SOFTWARE PRODUCT.</p>
                  <p style={{ fontWeight:700 }}>SOFTWARE PRODUCT LICENSE</p>
                  <p>The SOFTWARE PRODUCT is protected by copyright laws and international copyright treaties, as well as other intellectual property laws and treaties. The SOFTWARE PRODUCT is sold as a single user license and no ownership is transferred, only the right to use the license software. The SOFTWARE PRODUCT may not be re-distributed, sold for non-profit or profit from subscription fees, repackaged, delivered on CD or DVD media or any other form of electronic media by any other persons or party, website, organisation or entity, other than the official e-commerce seller website(s) as contracted or authorised by SimWorks Studios Ltd.</p>
                  <p style={{ fontWeight:700 }}>1. GRANT OF LICENSE. This EULA grants you the following rights:</p>
                  <p><strong>a.</strong> You may install, access, and run a SINGLE copy of the SOFTWARE PRODUCT on a SINGLE personal computer for your personal, non-commercial, non-profit use. Any party or organisation seeking to use the SOFTWARE PRODUCT under license for commercial use should contact us through e-mail at simworksstudios@gmail.com.</p>
                  <p><strong>b.</strong> This SOFTWARE PRODUCT is for personal entertainment purposes only and may not be used for flight training purposes. This SOFTWARE PRODUCT is not part of an approved training program under the standards of any aviation regulatory agency or body worldwide, whether private or government.</p>
                  <p><strong>c.</strong> Separation of Components. The SOFTWARE PRODUCT is licensed as a single product. Its original component parts created by SimWorks Studios Ltd. may not be separated for use in other software or projects.</p>
                  <p><strong>d.</strong> Trademarks. This EULA does not grant you any rights in connection with any trademarks or service marks of SimWorks Studios Ltd. or Van's Aircraft, Inc.</p>
                  <p><strong>e.</strong> Rental. You may not rent, lease, or lend the SOFTWARE PRODUCT. You may not charge admission fees for any simulator, entertainment or training device which breaches this EULA by use of the SOFTWARE PRODUCT therein.</p>
                  <p><strong>f.</strong> Support Services. This SOFTWARE PRODUCT is provided "as is", however SimWorks Studios Ltd. will provide provision of support services in relation to the operation, installation or remedy of issues arising to the use of the SOFTWARE at its official support venue at simworksstudios.com.</p>
                  <p><strong>g.</strong> Termination. Without prejudice to any other rights, SimWorks Studios Ltd. may terminate this EULA if you fail to comply with the terms and conditions of this EULA. In such event, you must destroy all copies of the SOFTWARE PRODUCT and all of its component parts.</p>
                  <p style={{ fontWeight:700 }}>2. COPYRIGHT.</p>
                  <p>All title and copyrights in and to the original created components of the SOFTWARE PRODUCT (including but not limited to any images, photographs, animations, video, audio, music, and test incorporated into the SOFTWARE PRODUCT), the accompanying documentation materials, and any copies of the SOFTWARE PRODUCT are owned by SimWorks Studios Ltd. or its suppliers. All title and intellectual property rights in and to additional third party libraries and content (which are used under the terms of those components' distribution) which may be accessed through use of the SOFTWARE PRODUCT is the property of the respective content owner and may be protected by applicable copyright or other intellectual property laws and treaties. This EULA grants you no rights to use such content. This SOFTWARE PRODUCT contains documentation which is provided only in electronic form, and you may print multiple copies of such electronic documentation.</p>
                  <p>SimWorks Studios {pname} for Microsoft Flight Simulator — SimWorks Studios<br/>Microsoft Flight Simulator is a copyrighted trademark of Microsoft Corporation.</p>
                  <p style={{ fontWeight:700 }}>3. LEGAL JURISDICTION.</p>
                  <p>This EULA is governed by the laws of Cyprus and the European Union.</p>
                  <p style={{ fontWeight:700 }}>4. LIMITATION OF LIABILITY.</p>
                  <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SIMWORKS STUDIOS LTD. BE LIABLE FOR ANY SPECIAL, INCIDENTAL, INDIRECT, OR CONSEQUENTIAL DAMAGES WHATSOEVER (INCLUDING, WITHOUT LIMITATION, DAMAGES FOR LOSS OF BUSINESS PROFITS, BUSINESS INTERRUPTION, LOSS OF BUSINESS INFORMATION, OR ANY OTHER PECUNIARY LOSS) ARISING OUT OF THE USE OF OR INABILITY TO USE THE SOFTWARE PRODUCT OR THE PROVISION OF OR FAILURE TO PROVIDE SUPPORT SERVICES, EVEN IF SIMWORKS STUDIOS LTD. HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</p>
                </>);
              })()}
            </div>
            <div className="sws-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEulaModal({ open:false, simTag:null, channel:'Public' })}>Reject</button>
              <button type="button" className="btn btn-primary" onClick={async () => {
                try { localStorage.setItem('sws_eula_accepted_v1','1'); } catch {}
                setEulaAccepted(true);
                const next = eulaModal.simTag;
                const chan = eulaModal.channel;
                setEulaModal({ open:false, simTag:null, channel:'Public' });
                // After accepting, show pre-download changelog only for update downloads
                await maybeShowPreDownloadChangelogIfUpdate(next, chan);
              }}>Accept</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {/* Pre-download Changelog Modal */}
      {preDlModal.open && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) { setPreDlModal(prev => ({ ...prev, open:false })); } }}>
          <div className="sws-modal sws-modal-md" role="document">
            <h3 className="sws-modal-title" style={{ fontSize:16 }}>Changelog {preDlModal.version ? `(v${preDlModal.version})` : ''} — {preDlModal.channel}</h3>
            <pre className="sws-modal-body" style={{ whiteSpace:'pre-wrap', fontFamily:'Consolas, monospace', maxHeight:'40vh' }}>{preDlModal.text || 'Loading…'}</pre>
            <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:8, fontSize:12 }}>
              <input type="checkbox" checked={preDlModal.dontAsk}
                     onChange={(e) => { const v = !!e.target.checked; setPreDlModal(prev => ({ ...prev, dontAsk: v })); try { localStorage.setItem('sws_skip_pre_download_changelog', v ? '1' : '0'); } catch {} }} />
              Don't show this before download next time
            </label>
            <div className="sws-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPreDlModal(prev => ({ ...prev, open:false }))}>Cancel</button>
              <button type="button" className="btn btn-info" onClick={async () => { const sim = preDlModal.simTag; setPreDlModal(prev => ({ ...prev, open:false })); await downloadAllForSim(sim, getChan(sim) || 'Public'); }}>Continue download</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {/* Install-time Variant Chooser */}
      {showInstallVariantModal && createPortal((
        <div className="sws-modal-overlay" role="dialog" aria-modal="true">
          <div className="sws-modal sws-modal-sm" role="document">
            <h3 className="sws-modal-title" style={{ marginBottom:12 }}>Select Variant to Install</h3>
            <div className="sws-modal-subtle" style={{ marginBottom:10 }}>Multiple variants are cached. Choose which one to install.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {(product?.bunny?.components || product.components || []).filter(c => !!c.zip).map(c => {
                const z = c.zip;
                return (
                  <label key={z} style={{ display:'flex', alignItems:'center', gap:10, background:'var(--sws-bg-1)', padding:'8px 10px', borderRadius:6, border:'1px solid var(--sws-line)' }}>
                    <input
                      type="radio"
                      name={`install-variant-${product.id}`}
                      checked={zipBase(installVariantChoice) === zipBase(z)}
                      onChange={() => setInstallVariantChoice(z)}
                    />
                    <span style={{ fontSize:13 }}>{c.label || z.replace(/\.zip$/,'')}</span>
                  </label>
                );
              })}
            </div>
            <div className="sws-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowInstallVariantModal(false); setPendingSimForInstall(null); }}>Cancel</button>
              <button
                type="button"
                onClick={async () => {
                  const simTag = pendingSimForInstall;
                  setShowInstallVariantModal(false);
                  setPendingSimForInstall(null);
                  if (!simTag || !installVariantChoice) return;
                  const simKey = simTag.replace('FS','');
                  const selectedChannel = getChan(simTag) || 'Public';
                  const baseZip = getBaseZipForSim(product, simKey);
                  // --- Use the snapshot captured when the modal opened (guaranteed to have data) ---
                  const snap = installVariantSnapshotRef.current || {};
                  const snapVariants = snap.variants || {};
                  // Also read live state as fallback
                  const inState = simTag === 'FS2020' ? dl2020 : dl2024;
                  const persisted = readDlCacheForProduct(product, simTag, selectedChannel) || null;
                  const liveDlRec = mergeDl(inState, persisted);
                  // Combine snapshot + live variants so we never miss
                  const combinedVariants = { ...snapVariants };
                  if (liveDlRec?.variants) {
                    for (const [k, v] of Object.entries(liveDlRec.variants)) {
                      if (v?.localPath && !combinedVariants[k]) combinedVariants[k] = v;
                    }
                  }
                  const baseLocalPath = snap.baseLocalPath || liveDlRec?.baseLocalPath || '';
                  try {
                    const needsBase = !!(baseZip && zipBase(baseZip) !== zipBase(installVariantChoice));
                    if (needsBase && !baseLocalPath) {
                      onStatus?.('Base files required but not downloaded. Use Download to fetch Base first.');
                      return;
                    }
                    const installedSim = simTag === 'FS2020' ? installed2020 : installed2024;
                    if (installedSim) {
                      try { await handleUninstall(installedSim); } catch {}
                    }
                    if (needsBase && baseLocalPath) {
                      await handleInstall(product, baseLocalPath, simTag, selectedChannel, '', baseZip);
                    }
                    // Build all candidate keys for the chosen variant
                    const choiceBase = zipBase(installVariantChoice);
                    const candidateKeys = new Set();
                    candidateKeys.add(choiceBase);
                    const comps = (product?.bunny?.components || product.components || []);
                    for (const comp of comps) {
                      const compBase = zipBase(comp.zip || '');
                      if (compBase === choiceBase || zipEquivalent(comp.zip, installVariantChoice)) {
                        for (const sk of [simKey, '2020', '2024']) {
                          const r = getVariantZipForSim(comp, product, sk);
                          if (r) candidateKeys.add(zipBase(r));
                        }
                      }
                    }
                    // Search combined variants (snapshot + live) for any matching key
                    let vrec = null;
                    for (const ck of candidateKeys) {
                      if (combinedVariants[ck]?.localPath) { vrec = combinedVariants[ck]; break; }
                    }
                    if (!vrec) {
                      for (const [k, v] of Object.entries(combinedVariants)) {
                        if (!v?.localPath) continue;
                        if ([...candidateKeys].some(ck => zipEquivalent(k, ck))) { vrec = v; break; }
                      }
                    }
                    // Legacy fallback: top-level localPath from live state
                    if (!vrec && liveDlRec?.localPath) {
                      vrec = { localPath: liveDlRec.localPath, channel: liveDlRec.channel, variantZip: liveDlRec.variantZip };
                    }
                    // Last resort: any entry in combined variants with a local path
                    if (!vrec || !vrec.localPath) {
                      const any = Object.values(combinedVariants).find(v => !!v?.localPath);
                      if (any) vrec = any;
                    }
                    if (!vrec || !vrec.localPath) { onStatus?.('Selected variant not cached. Download it first.'); return; }
                    await handleInstall(product, vrec.localPath, simTag, (selectedChannel || vrec.channel || 'Public'), '', vrec.variantZip || installVariantChoice);
                  } catch (e) {
                    onStatus?.('Install failed: ' + (e?.message || String(e)));
                  }
                }}
                className="btn btn-info"
                disabled={!pendingSimForInstall || !installVariantChoice}
              >Install</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

// INSERT just above function OwnedAircraftCard (near other helpers)
function getBaseZipForSim(product, simKey) {
  const comps = (product?.bunny?.components || product.components || []);
  const base = comps.find(c => /base/i.test(String(c.label || ''))) || comps[0] || null;
  if (base?.zipBySim?.[simKey]) return base.zipBySim[simKey];
  if (base?.zip) return base.zip;
  if (product?.bunny?.zipBySim?.[simKey]) return product.bunny.zipBySim[simKey];
  return product?.bunny?.zip || '';
}

// Helper: resolve the appropriate variant ZIP for a given sim
function getVariantZipForSim(component, product, simKey) {
  if (component?.zipBySim?.[simKey]) return component.zipBySim[simKey];
  if (component?.zip) return component.zip;
  if (product?.bunny?.zipBySim?.[simKey]) return product.bunny.zipBySim[simKey];
  if (Array.isArray(product?.bunny?.components) && product.bunny.components.length) {
    const first = product.bunny.components[0];
    if (first?.zipBySim?.[simKey]) return first.zipBySim[simKey];
    if (first?.zip) return first.zip;
  }
  return product?.bunny?.zip || '';
}

// Simple string normalizer used for matching and display-safe slugs
function simple(s) {
  try {
    return String(s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  } catch {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
}

// Removed readyPulse styles (Ready pill removed)

// Inject a cohesive modal + button theme (no external CSS required)
const ensureModalStyles = (() => {
  let added = false;
  return () => {
    if (added) return;
    const css = `
:root {
  --sws-bg-0:#0f1316; --sws-bg-1:#181c20; --sws-bg-2:#23272b; --sws-bg-3:#2a2f34;
  --sws-fg:#e6edf3; --sws-fg-dim:#c7d0d9; --sws-line:#323a43; --sws-shadow:rgba(0,0,0,.55);
  --sws-accent:#90caf9; --sws-success:#2e7d32; --sws-danger:#b4232a; --sws-warn:#fbbf24; --sws-info:#1e88e5;
}
.sws-modal-overlay {
  position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center;
  background: radial-gradient(1200px 600px at 50% -10%, rgba(33,37,41,.65), transparent 60%),
              linear-gradient(180deg, rgba(0,0,0,.45), rgba(0,0,0,.55));
  backdrop-filter: blur(6px) saturate(1.05);
  animation: swsFadeIn .12s ease-out;
}
.sws-modal { color:var(--sws-fg); background:linear-gradient(180deg, var(--sws-bg-2), var(--sws-bg-1));
  border:1px solid var(--sws-line); border-radius:0; box-shadow:none;
  transform: translateY(0); animation: swsSlideUp .16s ease-out;
}
.sws-modal.sws-modal-sm{ width:380px; max-width:92vw; padding:18px; }
.sws-modal.sws-modal-md{ width:520px; max-width:92vw; padding:20px; }
.sws-modal.sws-modal-lg{ width:640px; max-width:94vw; padding:22px; }
.sws-modal-header{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.sws-modal-title{ margin:0; font-size:18px; font-weight:800; color:var(--sws-accent); }
.sws-modal-subtle{ color:var(--sws-fg-dim); font-size:12px; }
.sws-modal-body{ max-height:52vh; overflow:auto; background:var(--sws-bg-1); border:1px solid var(--sws-line); border-radius:0; padding:12px; }
.sws-modal-actions{ display:flex; justify-content:flex-end; gap:10px; margin-top:12px; }
.btn{ appearance:none; border:1px solid transparent; border-radius:0; padding:9px 14px; font-weight:800; font-size:13px; cursor:pointer; transition:transform .05s ease, box-shadow .12s ease, background .12s ease; }
.btn:active{ transform:translateY(1px); }
.btn-ghost{ background:var(--sws-bg-3); color:#ddd; border-color:var(--sws-line); }
.btn-outline{ background:linear-gradient(180deg,#1e2429,#151a1e); color:var(--sws-fg); border-color:#33414a; }
.btn-primary{ background:linear-gradient(180deg, #2b9348, #1e7a39); color:#fff; border-color:#145c2a; box-shadow:none; }
.btn-info{ background:linear-gradient(180deg, #1e88e5, #1565c0); color:#fff; border-color:#0d47a1; box-shadow:none; }
.btn-warn{ background:linear-gradient(180deg, #fbbf24, #f59e0b); color:#1b1400; border-color:#a36b03; }
.btn-danger{ background:linear-gradient(180deg, #b4232a, #8c1b20); color:#fff; border-color:#5f1014; box-shadow:none; }
.btn[disabled]{ cursor:not-allowed; }
.sws-close{ background:transparent; border:none; color:#aab2c8; font-size:20px; line-height:1; cursor:pointer; }
/* Download buttons: no border on mouse focus; keep a clear ring for keyboard focus */
.sws-download-btn{ border:none !important; outline:none; }
.sws-download-btn:focus{ outline:none; }
.sws-download-btn:focus-visible{ outline: 2px solid var(--sws-accent); outline-offset: 2px; }
/* Only remove border from the small gear (Modify) trigger button, keep other buttons unchanged */
.sws-modify-trigger{ border:none !important; box-shadow:none !important; }
/* Queue banner scrollbar (wider + themed for Chromium/Electron) */
.sws-queue-list::-webkit-scrollbar{ width:8px; }
.sws-queue-list::-webkit-scrollbar-track{ background:transparent; }
.sws-queue-list::-webkit-scrollbar-thumb{ background:rgba(255,255,255,0.22); border-radius:4px; }
.sws-queue-list::-webkit-scrollbar-thumb:hover{ background:rgba(255,255,255,0.38); }
@keyframes swsFadeIn{ from{ opacity:0 } to{ opacity:1 } }
@keyframes swsSlideUp{ from{ transform:translateY(8px); opacity:.98 } to{ transform:translateY(0); opacity:1 } }
`;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    added = true;
  };
})();

const App = () => {
  // --- Debug/diagnostic controls ---
  const DEBUG = (() => {
    try { return localStorage.getItem('sws_debug') === '1'; } catch { return false; }
  })();
  // Expose a window-level alias so non-component helpers (added later or minified in bundle) can safely reference a DEBUG symbol.
  try { window.SWS_DEBUG = DEBUG; } catch {}
  const logDebug = (...args) => { if (DEBUG) console.debug('[SWS]', ...args); };

  // Atomic in-flight guard for install/uninstall to prevent rapid double clicks
  const opLockRef = React.useRef(false);
  const withOpLock = async (label, fn) => {
    if (opLockRef.current) { logDebug('Skipped', label, 'another operation in progress'); return { skipped:true }; }
    opLockRef.current = true;
    try { return await fn(); } finally { opLockRef.current = false; };
  };
  const [installPath2020, setInstallPath2020] = useState('');
  const [installPath2024, setInstallPath2024] = useState('');
  // Track where each path came from: 'Saved' | 'Auto-detected' | 'Manual' (for Settings display and UX hints)
  const [installPath2020Source, setInstallPath2020Source] = useState('');
  const [installPath2024Source, setInstallPath2024Source] = useState('');
  const [installPath, setInstallPath] = useState('');
  const [downloadedFiles, setDownloadedFiles] = useState({});
  const [downloadsDir, setDownloadsDir] = useState('');
  const [pkgCacheDir, setPkgCacheDir] = useState('');
  const [debugLogging, setDebugLogging] = useState(false);
  const [logsDir, setLogsDir] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);
  const [installingId, setInstallingId] = useState(null);
  const [activeInstallSim, setActiveInstallSim] = useState(null);
  const [activeDlSim, setActiveDlSim] = useState(null);
  const [activePage, setActivePage] = useState('home');
  const [status, setStatus] = useState('');
  const [installProgress, setInstallProgress] = useState(null);
  const [ownedAircraft, setOwnedAircraft] = useState([]);
  const [aircraftList, setAircraftList] = useState([]);
  // Track ownership fetch retries for current authenticated session to avoid users needing to logout/login
  const ownershipRetryRef = useRef({ attempts: 0, token: null });
  // Search and filter controls for Owned Products
  // Persisted UI filters
  const [searchQuery, setSearchQuery] = useState(() => {
    try { return localStorage.getItem('sws_filter_search') || ''; } catch { return ''; }
  });
  const [filterBy, setFilterBy] = useState(() => {
    try { return localStorage.getItem('sws_filter_by') || 'all'; } catch { return 'all'; }
  }); // 'all' | 'installed' | 'not' | 'aircraft' | 'scenery'
  const [simFilter, setSimFilter] = useState(() => {
    try { return localStorage.getItem('sws_filter_sim') || 'all'; } catch { return 'all'; }
  }); // 'all' | 'FS2020' | 'FS2024' | 'FS2020+'
  const [channelFilter, setChannelFilter] = useState(() => {
    try { return localStorage.getItem('sws_filter_channel') || 'all'; } catch { return 'all'; }
  }); // 'all' | 'public' | 'beta' (visible only if isBetaTester)
  // Bump to force a re-fetch of ownership and update indicators
  const [refreshTick, setRefreshTick] = useState(0);

  const [progress, setProgress] = useState(null);
  const [cancelFlash, setCancelFlash] = useState(false);
  const [changelogModal, setChangelogModal] = useState({ open: false, title: '', changelog: '', url: '' });
const lastProgressRef = useRef({ value: 0, ts: 0 });
  const [downloadProgress, setDownloadProgress] = useState(null);
  // Download queue info for the banner: { current: { name, version, channel, pct, receivedMB, totalMB }, next: [{ name, version, channel, totalMB }] }
  const [downloadQueueInfo, setDownloadQueueInfo] = useState(null);
  // Multi-product download queue: array of { productId, product, simTag, channel }
  const [pendingDownloadQueue, setPendingDownloadQueue] = useState([]);
  const pendingDownloadQueueRef = useRef([]);
  // App self-update state
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(null); // { version }
  const [appUpdateDownloaded, setAppUpdateDownloaded] = useState(false);
  const [appUpdateProgress, setAppUpdateProgress] = useState(null); // percent 0-100
  const [appVersion, setAppVersion] = useState('');
  // Persist filter changes
  useEffect(() => { try { localStorage.setItem('sws_filter_search', String(searchQuery||'')); } catch {} }, [searchQuery]);
  useEffect(() => { try { localStorage.setItem('sws_filter_sim', String(simFilter||'all')); } catch {} }, [simFilter]);
  useEffect(() => { try { localStorage.setItem('sws_filter_by', String(filterBy||'all')); } catch {} }, [filterBy]);
  useEffect(() => { try { localStorage.setItem('sws_filter_channel', String(channelFilter||'all')); } catch {} }, [channelFilter]);
  // If user is not a beta tester, normalize channel to 'all' to avoid hidden states
  useEffect(() => {
    try {
      if (!isBetaTester && (channelFilter === 'beta' || channelFilter === 'public')) {
        setChannelFilter('all');
      }
    } catch {}
  }, [isBetaTester]);
  // Keep per-sim selection aligned with the global Type/Channel filter
  useEffect(() => {
    try {
      if (channelFilter === 'public') {
        setSelectedChannelBySim(prev => ({ ...(prev||{}), FS2020:'Public', FS2024:'Public' }));
      } else if (channelFilter === 'beta' && isBetaTester) {
        setSelectedChannelBySim(prev => ({ ...(prev||{}), FS2020:'Beta', FS2024:'Beta' }));
      }
    } catch {}
  }, [channelFilter, isBetaTester]);

  // App self-update listeners
  useEffect(() => {
    const unsubs = [];
    try {
      if (window.electron?.getAppVersion) {
        window.electron.getAppVersion().then(v => { if (v) setAppVersion(v); }).catch(() => {});
      }
      if (window.electron?.onAppUpdateAvailable) {
        unsubs.push(window.electron.onAppUpdateAvailable(({ version }) => {
          setAppUpdateAvailable({ version: version || '' });
        }));
      }
      if (window.electron?.onAppUpdateDownloadProgress) {
        unsubs.push(window.electron.onAppUpdateDownloadProgress(({ percent }) => {
          setAppUpdateProgress(percent);
        }));
      }
      if (window.electron?.onAppUpdateDownloaded) {
        unsubs.push(window.electron.onAppUpdateDownloaded(({ version }) => {
          setAppUpdateDownloaded(true);
          setAppUpdateAvailable({ version: version || '' });
          setAppUpdateProgress(null);
        }));
      }
    } catch {}
    return () => { unsubs.forEach(fn => { try { fn(); } catch {} }); };
  }, []);

  // ---------------------------------------------------------------------------
  // Global Beta warm-up probe (background) so every product gets a BunnyNet check
  // even if its card has not yet been rendered. This supplements the per-card effect.
  // Scope: lightweight (manifest only + base zip stem) with concurrency limiting.
  // Controlled via localStorage:
  //   sws_disableBetaWarmup = '1'  -> skip entirely
  //   sws_betaWarmupForce = '1'    -> ignore prior done flag and re-run
  // Stores standard cache entries sws_betaAvail_<pid> like per-card logic so
  // product card picks up results instantly when mounted.
  useEffect(() => {
    if (!isBetaTester) return; // only matters for beta testers
    if (!ownedAircraft || !ownedAircraft.length) return;
    try { if (localStorage.getItem('sws_disableBetaWarmup') === '1') return; } catch {}
    const alreadyDone = (() => { try { return localStorage.getItem('sws_betaWarmupDone') === '1'; } catch { return false; } })();
    const force = (() => { try { return localStorage.getItem('sws_betaWarmupForce') === '1'; } catch { return false; } })();
    if (alreadyDone && !force) return;
    let cancelled = false;
    const MAX_PRODUCTS = 40; // safety cap
    const CONCURRENCY = 3;
    const products = ownedAircraft.slice(0, MAX_PRODUCTS);
    const readLs = (pid) => { try { return JSON.parse(localStorage.getItem(`sws_betaAvail_${pid}`) || 'null'); } catch { return null; } };
    const writeLs = (pid, obj) => { try { localStorage.setItem(`sws_betaAvail_${pid}`, JSON.stringify(obj)); } catch {}
    };
    const freshEnough = (rec) => {
      if (!rec) return false; const age = Date.now() - (rec.ts || 0);
      // Reuse dynamic TTL idea: positives longer, negatives shorter
      const anyTrue = !!(rec.v2020 || rec.v2024 || rec.anyTrue);
      const ttl = anyTrue ? 10*60*1000 : 2*60*1000;
      return age < ttl;
    };
    const compatAllows = (p, simKey) => {
      const c = String(p?.compatibility || p?.bunny?.compatibility || 'FS2020+FS2024');
      if (simKey === '2020') return /2020/.test(c);
      if (simKey === '2024') return /2024/.test(c) || /2020\+FS2024|FS2020\+FS2024|FS2020\+FS2024/i.test(c) || /FS2020\+/.test(c);
      return true;
    };
    const queue = [];
    for (const p of products) {
      if (!p) continue;
      const pid = String(p.id || p?.bunny?.folder || '');
      if (!pid) continue;
      const cached = readLs(pid);
      if (freshEnough(cached)) continue; // skip fresh
      queue.push(p);
    }
    if (!queue.length) {
      try { localStorage.setItem('sws_betaWarmupDone', '1'); } catch {}
      return;
    }
    if (window.__SWS_DEBUG_GLOBAL) console.debug('[beta-warmup] starting queue size=%d', queue.length);
    // Use the warm cache populated by the login preheat instead of HEAD-probing every folder.
    // The preheat already fetched Beta manifests for all products; if a version was returned, Beta exists.
    const warmCache = window.__swsVersionWarmCache || {};
    const checkBetaFromWarm = (p, simKey) => {
      const pid = String(p.id || '');
      const key = `${pid}:FS${simKey}:Beta`;
      return !!(warmCache[key]);
    };
    let active = 0; let index = 0;
    const results = [];
    const runNext = () => {
      if (cancelled) return;
      if (index >= queue.length) {
        if (active === 0) {
          try { localStorage.setItem('sws_betaWarmupDone', '1'); } catch {}
          if (window.__SWS_DEBUG_GLOBAL) console.debug('[beta-warmup] complete results=%o', results);
        }
        return;
      }
      while (active < CONCURRENCY && index < queue.length) {
        const p = queue[index++];
        const pid = String(p.id || p?.bunny?.folder || '');
        active++;
        (async () => {
          let v2020 = false, v2024 = false; let any = false;
          try {
            if (compatAllows(p, '2020')) {
              v2020 = checkBetaFromWarm(p, '2020');
              if (v2020) any = true;
            }
            if (compatAllows(p, '2024')) {
              v2024 = checkBetaFromWarm(p, '2024');
              if (v2024) any = true;
            }
          } catch {}
          try { writeLs(pid, { v2020, v2024, anyTrue: any, ts: Date.now() }); } catch {}
          results.push({ pid, v2020, v2024 });
        })().finally(() => { active--; runNext(); });
      }
    };
    runNext();
    return () => { cancelled = true; };
  }, [ownedAircraft, isBetaTester]);

  // Removed global per-sim alignment effect (was referencing a card-scoped helper). Product-level strictness is handled within the card.
  // Derived: filter owned products by search/filter settings
  const filteredOwned = useMemo(() => {
    const q = String(searchQuery || '').toLowerCase().trim();
    const isInstalled = (prodId) => (aircraftList || []).some(a => a && a.id === prodId);
    const isInstalledInSim = (prodId, simTag) => (aircraftList || []).some(a => a && a.id === prodId && a.communityPath && (
      (simTag === 'FS2020' && normalizePath(a.communityPath) === normalizePath(installPath2020)) ||
      (simTag === 'FS2024' && normalizePath(a.communityPath) === normalizePath(installPath2024))
    ));
    const getCompat = (p) => String((p && (p.compatibility || p?.bunny?.compatibility)) || 'FS2020+FS2024').toUpperCase();
    const byProd = (prodId) => (aircraftList || []).filter(a => a && a.id === prodId);
    const readBetaLs = (pid) => { try { const raw = localStorage.getItem(`sws_betaAvail_${pid}`); return raw ? JSON.parse(raw) : null; } catch { return null; } };
    const readUserChan = (pid, simTag) => {
      try {
        const key = `sws_chan_${pid}_${simTag}`;
        const v = localStorage.getItem(key);
        if (v === 'Beta' || v === 'Public') return v;
        // fallback to global per-sim selection
        const g = localStorage.getItem(`sws_chan_global_${simTag}`);
        return (g === 'Beta' || g === 'Public') ? g : 'Public';
      } catch { return 'Public'; }
    };
    const matchChannel = (rec) => {
      const ch = String(rec?.installedChannel || 'Public');
      if (channelFilter === 'beta') return /beta/i.test(ch);
      if (channelFilter === 'public') return !/beta/i.test(ch);
      return true;
    };
    const getType = (p) => {
      try {
        const t = (p && (p.type || p?.bunny?.type)) || '';
        if (/scenery/i.test(t)) return 'scenery';
        const folder = String(p?.bunny?.folder || p?.folder || p?.name || '').toUpperCase();
        if (folder.startsWith('SCENERY-')) return 'scenery';
        if (folder.startsWith('AIRCRAFT-')) return 'aircraft';
      } catch {}
      return 'aircraft';
    };

    return (ownedAircraft || []).filter(p => {
      if (!p) return false;
      // Sim + Channel filters
      const recs = byProd(p.id);
      const rec2020 = recs.find(r => normalizePath(r.communityPath) === normalizePath(installPath2020));
      const rec2024 = recs.find(r => normalizePath(r.communityPath) === normalizePath(installPath2024));
  const compat = getCompat(p);
  const isBothSims = /FS2020\+/.test(compat) || /FS2020\+FS2024/.test(compat);
  const can20 = isBothSims || /FS\s*2020/.test(compat);
  const can24 = isBothSims || /FS\s*2024/.test(compat);
  const can20Only = can20 && !can24;
  const can24Only = can24 && !can20;
  const betaLs = readBetaLs(p.id) || readBetaLs(p?.bunny?.folder || '');
  const beta20Avail = !!(betaLs && betaLs.v2020);
  const beta24Avail = !!(betaLs && betaLs.v2024);
  const betaAnyAvail = !!(betaLs && (betaLs.v2020 || betaLs.v2024 || betaLs.anyTrue));

      // Sim constraints: show only native products for the selected sim
      if (simFilter === 'FS2020+') {
        if (!isBothSims) return false;
        if (channelFilter === 'beta') {
          const beta20Inst = /beta/i.test(rec2020?.installedChannel || '');
          const beta24Inst = /beta/i.test(rec2024?.installedChannel || '');
          if (!((beta20Inst || beta20Avail) && (beta24Inst || beta24Avail))) return false;
        }
      } else if (simFilter === 'FS2020') {
        if (!can20) return false;
        if (channelFilter === 'beta') {
          const beta20Inst = /beta/i.test(rec2020?.installedChannel || '');
          if (!(beta20Inst || beta20Avail)) return false;
        }
      } else if (simFilter === 'FS2024') {
        if (!can24Only) return false;
        if (channelFilter === 'beta') {
          const beta24Inst = /beta/i.test(rec2024?.installedChannel || '');
          if (!(beta24Inst || beta24Avail)) return false;
        }
      } else {
        // simFilter 'all'
        if (channelFilter === 'beta') {
          const anyBetaInst = recs.some(r => /beta/i.test(r?.installedChannel || ''));
          if (!(anyBetaInst || betaAnyAvail)) return false;
        }
      }
      // Text search across name and known folder aliases
      if (q) {
        const fields = [
          String(p.name || ''),
          String(p?.bunny?.folder || ''),
          ...(Array.isArray(p?.bunny?.altFolders) ? p.bunny.altFolders : [])
        ].map(s => String(s || '').toLowerCase());
        const hit = fields.some(f => f.includes(q));
        if (!hit) return false;
      }

      // Filter-by logic
      switch (filterBy) {
        case 'installed':
          return isInstalled(p.id);
        case 'not':
          return !isInstalled(p.id);
        case 'aircraft':
          return getType(p) === 'aircraft';
        case 'scenery':
          return getType(p) === 'scenery';
        case 'all':
        default:
          return true;
      }
    });
  }, [ownedAircraft, searchQuery, filterBy, aircraftList, simFilter, channelFilter, installPath2020, installPath2024]);
  const downloadAbortRef = useRef(null);
  // Smooth the coarse install milestones (15% extracting, 45% linking)
  const installSmoothTimerRef = useRef(null);
  // App-level cancel flag (renderer-wide for downloads)
  const appCancelRef = useRef(false);
  // Aggregated batch progress (base + variants) shared across app and cards
  const batchRef = useRef({ active: false, total: 0, index: 0, simTag: null });
  const beginBatch = useCallback((simTag, total) => {
    batchRef.current = { active: true, total: Math.max(0, Number(total)||0), index: 0, simTag };
    try { setActiveDlSim(simTag); } catch {}
  }, []);
  const advanceBatch = useCallback((index) => {
    try { batchRef.current.index = Math.max(0, Number(index)||0); } catch {}
  }, []);
  const endBatch = useCallback(() => {
    batchRef.current = { active: false, total: 0, index: 0, simTag: null };
    try { setActiveDlSim(null); } catch {}
  }, []);
  // Ensure modal styles are available once at app startup
  useEffect(() => { try { ensureModalStyles(); } catch {} }, []);
  // Login/loading UX
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [pendingInitOps, setPendingInitOps] = useState(0);
  const beginInitOp = useCallback(() => setPendingInitOps(n => n + 1), []);
  const endInitOp = useCallback(() => setPendingInitOps(n => Math.max(0, n - 1)), []);
  // Helper to focus the sidebar login form when pressing the sign-in CTA
  const focusSidebarLogin = useCallback(() => {
    try {
      const el = document.getElementById('login-username');
      if (el) {
        el.focus();
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
      }
    } catch {}
  }, []);

// --- PATCH A: Global progress listener (replace existing useEffect that subscribes onInstallProgress) ---
 useEffect(() => {
    if (!window.electron?.onInstallProgress) return;
    const off = window.electron.onInstallProgress((raw) => {
      // Support both {progress} and {percent}, and numeric events
      const payload = (typeof raw === 'number') ? { progress: raw } : (raw || {});
      const p = Number.isFinite(payload.progress)
        ? Math.max(0, Math.min(100, Math.round(payload.progress)))
        : Number.isFinite(payload.percent)
          ? Math.max(0, Math.min(100, Math.round(payload.percent)))
          : null;

      const phase = (payload.phase || '').toLowerCase();
      const statusMsg = payload.status;

      // Always reflect incoming progress/status
      if (p != null) setProgress(p);
      if (statusMsg) setStatus(statusMsg);

      // If main signaled completion, briefly show 100% then clear overlay and installing state
      if (phase === 'done' || (typeof p === 'number' && p >= 100)) {
        try {
          // Ensure we actually show 100% briefly for feedback
          setProgress(100);
          // Stop smoothing if any
          if (installSmoothTimerRef.current) {
            clearInterval(installSmoothTimerRef.current);
            installSmoothTimerRef.current = null;
          }
          // Clear after a short delay
          setTimeout(() => {
            try { setProgress(null); } catch {}
          }, 1100);
          // Also clear installing flags so card buttons reset even if caller forgot
          try { setInstallingId(null); } catch {}
          try { setActiveInstallSim(null); } catch {}
        } catch {}
      }

      // On error, immediately clear installing state and overlay
      if (phase === 'error') {
        try {
          if (installSmoothTimerRef.current) {
            clearInterval(installSmoothTimerRef.current);
            installSmoothTimerRef.current = null;
          }
          setInstallingId(null);
          setActiveInstallSim(null);
          setProgress(null);
        } catch {}
      }
    });
    return () => off && off();
  }, []);

  // Install progress smoothing: gently advance between coarse milestones so the bar
  // doesn’t appear stuck at 15% (extracting) or 45% (linking). Real events override.
  useEffect(() => {
    // Stop smoothing if not installing or on completion
    if (!installingId || (typeof progress === 'number' && progress >= 99)) {
      if (installSmoothTimerRef.current) {
        clearInterval(installSmoothTimerRef.current);
        installSmoothTimerRef.current = null;
      }
      return;
    }

    // Don’t smooth during downloads
    if (downloadingId) {
      if (installSmoothTimerRef.current) {
        clearInterval(installSmoothTimerRef.current);
        installSmoothTimerRef.current = null;
      }
      return;
    }

    const p = typeof progress === 'number' ? progress : 0;
    // If main process emits real extract progress (>44 while phase is extract), avoid smoothing in extract
    const phaseText = typeof status === 'string' ? status : (status?.status || '');
    const isExtractPhase = /\bextract/i.test(phaseText);
    const isLinkPhase = /\blink/i.test(phaseText);

    // Only smooth during linking now; extract has real progress when 7-Zip is used
    const cap = isLinkPhase ? (p < 100 ? 95 : null) : (p < 45 ? 44 : null);
    if (cap == null) {
      if (installSmoothTimerRef.current) {
        clearInterval(installSmoothTimerRef.current);
        installSmoothTimerRef.current = null;
      }
      return;
    }

    if (installSmoothTimerRef.current) return; // already smoothing

    installSmoothTimerRef.current = setInterval(() => {
      // Small increments; slower before 45, a tad faster after
      setProgress(prev => {
        const curr = typeof prev === 'number' ? prev : (typeof progress === 'number' ? progress : 0);
        // If linking, head toward 95; if extracting (no real progress), toward 44
        const phaseCap = isLinkPhase ? 95 : 44;
        if (curr >= phaseCap || !installingId) {
          if (installSmoothTimerRef.current) {
            clearInterval(installSmoothTimerRef.current);
            installSmoothTimerRef.current = null;
          }
          return prev;
        }
        const step = isLinkPhase ? 2 : 1; // percent per tick
        const next = Math.min(phaseCap, curr + step);
        return next;
      });
    }, 700);

    return () => {
      if (installSmoothTimerRef.current) {
        clearInterval(installSmoothTimerRef.current);
        installSmoothTimerRef.current = null;
      }
    };
  }, [installingId, downloadingId, progress]);

  // Safe text for rendering
  const statusText = typeof status === 'string' ? status : (status?.status || '');
  // Persist status banner during downloads; auto-clear others after a few seconds
  const isDownloadingStatus = /\bdownloading\b/i.test(statusText);
  const isCancelStatus = /\bcancel(?:ed|led)\b/i.test(statusText);

  // Auto-dismiss non-persistent statuses
  const statusTimerRef = useRef(null);
  useEffect(() => {
    // Clear any previous timer
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    const text = String(statusText || '').trim();
    if (!text) return; // nothing to do

  // Keep persistent statuses visible (only while in-progress)
  const isInstallingStatus = /\binstalling\b/i.test(text);
  const persistent = isDownloadingStatus || isInstallingStatus;
    if (persistent) return;

    // Errors linger a bit longer than generic info
    const isErrorish = /\b(error|failed|could not|network)\b/i.test(text);
    const ms = isErrorish ? 7000 : 3500;

    statusTimerRef.current = setTimeout(() => {
      try {
        setStatus(prev => {
          const prevText = typeof prev === 'string' ? prev : (prev?.status || '');
          return prevText === text ? '' : prev;
        });
      } catch {}
    }, ms);

    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
    };
  }, [statusText, isDownloadingStatus]);

  // --- Login state ---
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isBetaTester, setIsBetaTester] = useState(false);

  // On first mount, restore beta tester flag early (before login) if previously known.
  useEffect(() => {
    try {
      const prev = localStorage.getItem('sws_isBetaTester');
      if (prev === '1') {
        setIsBetaTester(true);
        try { if (window.__SWS_DEBUG_GLOBAL) console.debug('[beta] restored tester flag pre-login'); } catch {}
      }
    } catch {}
  }, []);
  // Link-based installs are preferred; STRICT mode always on (no copy fallback allowed)
  const [useLinkInstalls, setUseLinkInstalls] = useState(true);
  const strictLinkInstalls = true;

  // One-time startup scrub: remove any persisted URL fields from sws_dl_* cache entries
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (!k || !k.startsWith('sws_dl_')) continue;
        try {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          const obj = JSON.parse(raw);
          if (!obj || typeof obj !== 'object') continue;
          const scrub = (rec) => {
            if (!rec || typeof rec !== 'object') return rec;
            const copy = { ...rec };
            if ('savedUrl' in copy) delete copy.savedUrl;
            if ('baseUrl' in copy) delete copy.baseUrl;
            if (copy.variants && typeof copy.variants === 'object') {
              const nv = {};
              for (const [kk, vv] of Object.entries(copy.variants)) {
                if (vv && typeof vv === 'object') {
                  const vvv = { ...vv };
                  if ('savedUrl' in vvv) delete vvv.savedUrl;
                  if ('baseUrl' in vvv) delete vvv.baseUrl;
                  nv[kk] = vvv;
                } else { nv[kk] = vv; }
              }
              copy.variants = nv;
            }
            return copy;
          };
          const cleaned = scrub(obj);
          if (JSON.stringify(cleaned) !== raw) localStorage.setItem(k, JSON.stringify(cleaned));
        } catch {}
      }
    } catch {}
  }, []);

  // Overrides manager (Manage Links UI)
  const [ovrProdId, setOvrProdId] = useState('');
  const [ovrSim, setOvrSim] = useState('2020'); // '2020' | '2024'
  const [ovrChannel, setOvrChannel] = useState('Beta'); // 'Public' | 'Beta'
  const [ovrCompZip, setOvrCompZip] = useState(''); // selected variant zip
  const [ovrBaseUrl, setOvrBaseUrl] = useState('');
  const [ovrVarUrl, setOvrVarUrl] = useState('');
  const [ovrMsg, setOvrMsg] = useState('');
  const [ovrAllowVariantToBase, setOvrAllowVariantToBase] = useState(() => {
    try { return localStorage.getItem('sws_beta_allow_variant_to_base_fallback') === '1'; } catch { return false; }
  });

  const slugFrom = (s) => String(s || '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-');

  const selectedOverrideProduct = React.useMemo(() => {
    const pid = String(ovrProdId || '');
    return (ownedAircraft || []).find(p => String(p.id) === pid) || null;
  }, [ownedAircraft, ovrProdId]);

  const selectedCompList = React.useMemo(() => {
    return selectedOverrideProduct ? (selectedOverrideProduct.bunny?.components || selectedOverrideProduct.components || []) : [];
  }, [selectedOverrideProduct]);

  // Initialize default selections when products load
  useEffect(() => {
    if (!ovrProdId && ownedAircraft && ownedAircraft.length) {
      // Prefer first product that has a Bunny mapping
      const withBunny = ownedAircraft.find(p => p.bunny && (p.bunny.components || p.bunny.folder));
      setOvrProdId(String((withBunny || ownedAircraft[0]).id));
    }
  }, [ownedAircraft, ovrProdId]);

  // Keep selected variant zip in sync with product
  useEffect(() => {
    if (!selectedCompList.length) { setOvrCompZip(''); return; }
    const first = selectedCompList[0];
    if (!ovrCompZip || !selectedCompList.some(c => c.zip === ovrCompZip)) setOvrCompZip(first.zip || '');
  }, [selectedCompList, ovrCompZip]);

  // Load current override values from localStorage when selection changes
  useEffect(() => {
    try {
      if (!ovrProdId) { setOvrBaseUrl(''); setOvrVarUrl(''); return; }
      const pid = String(ovrProdId);
      const ch = String(ovrChannel || 'Beta').toLowerCase(); // 'public'|'beta'
      const sk = String(ovrSim || '2020');

      // Base URL
      let base = localStorage.getItem(`sws_override_${ch}_base_url_${pid}_${sk}`) || '';
      if (!base) base = localStorage.getItem(`sws_override_${ch}_base_url_${pid}`) || '';
      setOvrBaseUrl(base);

      // Variant URL (prefer component-specific)
      let variant = '';
      const compSlug = slugFrom(ovrCompZip);
      if (compSlug) {
        variant = localStorage.getItem(`sws_override_${ch}_variant_url_${pid}_${sk}_${compSlug}`) || '';
        if (!variant) variant = localStorage.getItem(`sws_override_${ch}_variant_url_${pid}_${compSlug}`) || '';
      }
      if (!variant) variant = localStorage.getItem(`sws_override_${ch}_variant_url_${pid}_${sk}`) || '';
      if (!variant) variant = localStorage.getItem(`sws_override_${ch}_variant_url_${pid}`) || '';
      setOvrVarUrl(variant);
      setOvrMsg('');
    } catch {
      setOvrBaseUrl('');
      setOvrVarUrl('');
    }
  }, [ovrProdId, ovrChannel, ovrSim, ovrCompZip]);

  const saveBaseOverride = () => {
    try {
      const pid = String(ovrProdId || '');
      if (!pid) return;
      const ch = String(ovrChannel || 'Beta').toLowerCase();
      const sk = String(ovrSim || '2020');
      const key = `sws_override_${ch}_base_url_${pid}_${sk}`;
      const val = (ovrBaseUrl || '').trim();
      if (val) localStorage.setItem(key, val); else localStorage.removeItem(key);
      setOvrMsg(val ? 'Saved base override.' : 'Removed base override.');
    } catch (e) { setOvrMsg('Error saving base override.'); }
  };
  const saveVariantOverride = () => {
    try {
      const pid = String(ovrProdId || '');
      if (!pid) return;
      const ch = String(ovrChannel || 'Beta').toLowerCase();
      const sk = String(ovrSim || '2020');
      const compSlug = slugFrom(ovrCompZip);
      const key = compSlug
        ? `sws_override_${ch}_variant_url_${pid}_${sk}_${compSlug}`
        : `sws_override_${ch}_variant_url_${pid}_${sk}`;
      const val = (ovrVarUrl || '').trim();
      if (val) localStorage.setItem(key, val); else localStorage.removeItem(key);
      setOvrMsg(val ? 'Saved variant override.' : 'Removed variant override.');
    } catch (e) { setOvrMsg('Error saving variant override.'); }
  };
  const clearAllOverridesForProduct = () => {
    try {
      const pid = String(ovrProdId || '');
      if (!pid) return;
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k.startsWith('sws_override_') && k.includes(`_${pid}`)) localStorage.removeItem(k);
      }
      setOvrBaseUrl('');
      setOvrVarUrl('');
      setOvrMsg('Cleared all overrides for this product.');
    } catch (e) { setOvrMsg('Error clearing overrides.'); }
  };
  const validateUrl = async (url) => {
    try {
      if (!url) { setOvrMsg('Enter a URL first.'); return; }
      setOvrMsg('Checking link...');
      const ok = await headOk(url, 2500);
      setOvrMsg(ok ? 'Link looks valid (reachable).' : 'Link is not reachable (HEAD/GET failed).');
    } catch { setOvrMsg('Validation failed.'); }
  };

  // --- Login handler ---
  // Internal helper: fetch with timeout + graceful JSON parse. Falls back to main-process fetch to avoid CORS/network quirks.
  async function fetchJsonWithTimeout(url, opts = {}, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        let bodyText = '';
        try { bodyText = await res.text(); } catch {}
        let json = {};
        try { json = bodyText ? JSON.parse(bodyText) : {}; } catch { json = { message: bodyText || 'Invalid server response' }; }
        return { ok: res.ok, status: res.status, json, raw: bodyText };
      } catch (err) {
        // Renderer fetch failed (CORS/offline/cert). Try main-process fetch if available.
        if (window.electron?.netFetchText) {
          try {
            const res = await window.electron.netFetchText(url, { timeoutMs, method: opts.method, headers: opts.headers, body: opts.body });
            let json = {};
            try { json = res.text ? JSON.parse(res.text) : {}; } catch { json = { message: res.text || 'Invalid server response' }; }
            return { ok: !!res.ok, status: res.status || 0, json, raw: res.text || '' };
          } catch (ipcErr) {
            // IPC fallback also failed — return error response instead of throwing
            return { ok: false, status: 0, json: { message: ipcErr?.message || 'Network error' }, raw: '' };
          }
        }
        // No fallback available
        return { ok: false, status: 0, json: { message: err?.message || 'Network error' }, raw: '' };
      }
    } finally {
      clearTimeout(t);
    }
  }

  // Quick connectivity probe to classify server reachability issues prior to login (prefers main-process netHead to bypass CORS)
  async function preflightReachability(baseUrl, timeoutMs = 5000) {
    const url = `${baseUrl.replace(/\/$/, '')}/wp-json/`;
    try {
      if (window.electron?.netHead) {
        const meta = await window.electron.netHead(url, { timeoutMs });
        // Any HTTP response (even 4xx/5xx) proves the server is reachable
        return { reachable: (meta.status || 0) > 0, status: meta.status || 0 };
      }
      const { ok, status } = await fetchJsonWithTimeout(url, { method: 'GET', headers: { 'Accept': 'application/json' } }, timeoutMs);
      return { reachable: (status || 0) > 0, status };
    } catch (e) {
      return { reachable: false, status: 0, error: e };
    }
  }

  function stripHtml(str) {
    if (!str) return str;
    // Remove <a>...</a> tags entirely (e.g. "Lost your password?" links)
    const cleaned = str.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');
    const parser = new DOMParser();
    const doc = parser.parseFromString(cleaned, 'text/html');
    return ((doc.body && doc.body.textContent) || str).replace(/\s+/g, ' ').trim();
  }

  function AnimatedDots() {
    const [count, setCount] = useState(0);
    useEffect(() => {
      const id = setInterval(() => setCount(c => (c + 1) % 4), 400);
      return () => clearInterval(id);
    }, []);
    return '.'.repeat(count) || '\u00A0';
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    // Fast offline check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLoginError('You appear to be offline. Reconnect to the internet and try again.');
      setStatus('Offline');
      return;
    }
    // Optional quick preflight to detect hard blocks (DNS/SSL/WAF) before credential post
    try {
      const probe = await preflightReachability(WP_BASE_URL, 5000);
      if (!probe.reachable) {
        setStatus('Network error');
        const hint = probe.status ? `HTTP ${probe.status}` : 'No response';
        setLoginError(`Network error – could not reach SimWorks server (${hint}). Check your internet connection, firewall/antivirus, proxy, or system time, then try again.`);
        return;
      }
    } catch {}
    // Clear any stale beta flag immediately when starting a new login to avoid carrying over from a previous account
    try { localStorage.setItem('sws_isBetaTester', '0'); } catch {}
    setIsBetaTester(false);
    setStatus('Logging in...');
    setIsLoggingIn(true);
    setLoginError('');
    try {
      // Prefer main-process fetch for login (bypasses renderer CORS issues with file:// origin)
      const loginUrl = `${WP_BASE_URL}/wp-json/jwt-auth/v1/token`;
      const loginOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      };
      let loginResult;
      if (window.electron?.netFetchText) {
        try {
          const res = await window.electron.netFetchText(loginUrl, { timeoutMs: 15000, ...loginOpts });
          let json = {};
          try { json = res.text ? JSON.parse(res.text) : {}; } catch { json = { message: res.text || 'Invalid server response' }; }
          loginResult = { ok: !!res.ok, status: res.status || 0, json, raw: res.text || '' };
        } catch (_ipcErr) {
          // Main-process fetch failed, fall back to renderer fetch
          loginResult = await fetchJsonWithTimeout(loginUrl, loginOpts, 15000);
        }
      } else {
        loginResult = await fetchJsonWithTimeout(loginUrl, loginOpts, 15000);
      }
      const { ok, status, json } = loginResult;
    const data = json || {};
    if (data.token) {
        setToken(data.token);
        // Force an ownership refresh even if the token value didn't change
        // (prevents cases where users had to logout/login to trigger a fetch)
        try { setRefreshTick(t => t + 1); } catch {}
        // Reset retry tracker for new session
        try { ownershipRetryRef.current = { attempts: 0, token: data.token }; } catch {}
        // Derive and persist a friendly display name for sidebar
        try {
          const display = (data.user_display_name || data.user_nicename || data.displayName || data.user_email || username || '').trim();
          if (display) {
            setUsername(display);
            localStorage.setItem('sws_username', display);
          }
        } catch {}
        // Reset state on account switch to avoid stale products
        setOwnedAircraft([]);
        setAircraftList([]);
        setDownloadedFiles({});
        setStatus('Login successful!');
  setIsLoggingIn(false);
        setLoginError('');
        // Check for beta tester role/capability (no privilege escalation fallback)
        try {
          let beta = false;
            if (Array.isArray(data.roles)) {
              beta = data.roles.includes('beta_tester') || data.roles.includes('beta');
            }
            if (!beta) {
              // Some APIs may expose capabilities
              const caps = data.capabilities || data.data?.capabilities || null;
              if (caps && typeof caps === 'object') {
                beta = !!(caps.beta_tester || caps.beta || caps['beta-tester']);
              }
            }
            if (typeof data.beta === 'boolean') beta = beta || data.beta;
          setIsBetaTester(!!beta);
          try { localStorage.setItem('sws_isBetaTester', beta ? '1':'0'); } catch {}
        } catch {}
        // Securely save token if remember me is checked
        try {
          if (rememberMe && window.electron?.saveToken) {
            await window.electron.saveToken(data.token, 'sws-user');
          } else if (window.electron?.clearToken) {
            await window.electron.clearToken('sws-user');
          }
        } catch {}
      } else if (!ok) {
        // Differentiate credential vs server vs network style issues
        // Special case: WordPress REST API returning rest_no_route (JWT plugin/endpoint missing or blocked)
        const wpNoRoute = (status === 404) && data && (data.code === 'rest_no_route' || /No route was found/i.test(data.message || ''));
        if (wpNoRoute) {
          setStatus('Auth endpoint missing');
          setLoginError('Authentication endpoint not found (rest_no_route). The server did not expose /jwt-auth/v1/token. This usually means: 1) The JWT auth plugin is disabled, 2) A security plugin or firewall is blocking the route, or 3) The base URL is incorrect. Please retry later or contact support.');
        } else if (status === 403 || status === 401) {
          const msg = stripHtml(data.message || 'Invalid username or password');
          setStatus('Login error');
          setLoginError(msg);
        } else if (status >= 500) {
          setStatus('Server error');
          setLoginError('Server error (status ' + status + '). Please try again shortly.');
        } else if (status === 429) {
          setStatus('Rate limited');
          setLoginError('Too many attempts. Please wait and try again.');
        } else if (status === 0) {
          setStatus('Network error');
          setLoginError('Network error – could not reach server. Check your connection or firewall.');
        } else {
          const msg = stripHtml(data.message || ('Login failed (status ' + status + ')'));
          setStatus('Login error');
          setLoginError(msg);
        }
        setIsLoggingIn(false);
      } else {
        const msg = stripHtml(data.message || 'Login failed');
        setStatus('Login error: ' + msg);
        setLoginError(msg);
        setIsLoggingIn(false);
  }
    } catch (err) {
      const aborted = (err && (err.name === 'AbortError' || /abort/i.test(err.message || '')));
      if (aborted) {
        setStatus('Timeout');
        setLoginError('Request timed out (15s). Please check your connection and try again.');
      } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('Offline');
        setLoginError('You went offline during login. Reconnect and retry.');
      } else {
        setStatus('Network error');
        // Classify common low-level network errors for richer feedback
        const msg = (err && (err.message || err.toString())) || '';
        let detail = '';
        if (/ENOTFOUND|DNS/i.test(msg)) detail = 'DNS lookup failed (domain could not be resolved).';
        else if (/ECONNREFUSED/i.test(msg)) detail = 'Connection refused (server unreachable or blocked by firewall).';
        else if (/ECONNRESET|ETIMEDOUT/i.test(msg)) detail = 'Connection dropped or timed out mid-request.';
        else if (/certificate|SSL|TLS/i.test(msg)) detail = 'TLS/SSL handshake failed (check system date or antivirus HTTPS scanning).';
        else if (/SELF_SIGNED/i.test(msg)) detail = 'Untrusted certificate (MITM or interception).';
        else if (/fetch failed/i.test(msg)) detail = 'Fetch failed to establish a network connection.';
        const debugFlag = (() => { try { return localStorage.getItem('sws_debug_login') === '1' || window.__SWS_DEBUG_GLOBAL; } catch { return false; } })();
        const base = 'Network error – please check your connection and try again.';
        const full = detail ? `${base}\n${detail}` : base;
        setLoginError(debugFlag && msg ? `${full}\n[debug] ${msg}` : full);
        if (debugFlag) {
          try { console.debug('[login] network error detail', { message: msg, stack: err?.stack }); } catch {}
        }
      }
      setIsLoggingIn(false);
    }
  };

  // Bootstrap token from secure storage (if user chose remember me previously)
  // Add safety: do not silently auto-login in production release if we cannot also restore a username.
  useEffect(() => {
    (async () => {
      try {
        await waitForElectronBridge();
        if (!window.electron?.getSavedToken) return;
        const saved = await window.electron.getSavedToken('sws-user');
        if (saved) {
          // If a previous logout explicitly occurred in this session, honor it
          try {
            if (sessionStorage.getItem('sws_explicitLogout') === '1') {
              if (window.__SWS_DEBUG_GLOBAL) console.debug('[auth] Skipping auto-restore (explicit logout this session)');
              return;
            }
          } catch {}
          // Restore token and last known username for sidebar
          try {
            const savedName = localStorage.getItem('sws_username') || '';
            if (savedName) {
              setUsername(savedName);
            } else {
              // Try to decode JWT to get a display name/email
              try {
                const parts = String(saved).split('.');
                if (parts.length >= 2) {
                  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                  const display = (payload?.user_display_name || payload?.user_nicename || payload?.displayName || payload?.user_email || payload?.email || '').trim();
                  if (display) {
                    setUsername(display);
                    localStorage.setItem('sws_username', display);
                  }
                  // Also infer Beta Tester role from payload if present
                  try {
                    let beta = false;
                    const roles = payload?.roles || payload?.data?.roles || [];
                    if (Array.isArray(roles)) {
                      beta = roles.includes('beta_tester') || roles.includes('beta');
                    }
                    // Some JWTs encode capabilities as an object
                    if (!beta) {
                      const caps = payload?.capabilities || payload?.data?.capabilities || null;
                      if (caps && typeof caps === 'object') {
                        beta = !!(caps.beta_tester || caps.beta || caps['beta-tester']);
                      }
                    }
                    if (typeof payload?.beta === 'boolean') beta = beta || payload.beta;
                    setIsBetaTester(!!beta);
                  } catch {}
                }
              } catch {}
            }
          } catch {}
          // If we still have no username after decode attempts in production, skip auto-login to avoid "anonymous" session
          if (!localStorage.getItem('sws_username')) {
            const devMode = (process?.env?.NODE_ENV || '').toLowerCase() === 'development';
            if (!devMode) {
              if (window.__SWS_DEBUG_GLOBAL) console.debug('[auth] Aborting auto-restore: no username could be derived in release build');
              return; // do not set token => user stays logged out visibly
            }
          }
          setToken(saved);
          setRememberMe(true);
          // Kick ownership fetch to run after restoring a saved session
          try { setRefreshTick(t => t + 1); } catch {}
          // Show a brief confirmation when a saved session is restored,
          // then auto-clear it if nothing else overrides the status.
          const restoredMsg = 'Restored session.';
          setStatus(restoredMsg);
          try {
            setTimeout(() => {
              // Only clear if the status hasn't changed since we set it
              setStatus(prev => (prev === restoredMsg ? '' : prev));
            }, 2000);
          } catch {}
          // Do not elevate beta based on localStorage alone; rely on JWT payload or a later profile fetch.
        }
      } catch {}
    })();
  }, []);

  // (Remote overrides manifest removed; no-op)

  // --- Replace the "Fetch owned aircraft after login" effect with this no-cache, guarded version ---
  useEffect(() => {
    if (!token) return;
    const ctrl = new AbortController();
    const currentToken = token;

    async function fetchOwnedAircraft() {
  beginInitOp();
      try {
        const res = await fetch(
          `${WP_BASE_URL}/wp-json/simworks/v1/msfs-ownership?_=${Date.now()}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${currentToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              Pragma: 'no-cache'
            },
            cache: 'no-store',
            signal: ctrl.signal
          }
        );

        if (!res.ok) {
          setOwnedAircraft([]); // clear stale list on error
          setStatus(`Could not fetch owned aircraft: HTTP ${res.status}`);
          return;
        }

        // Defensive: ensure endpoint returns JSON (catch cases like stray 'hi' output)
        let data;
        try {
          const ctype = (res.headers.get('content-type') || '').toLowerCase();
          if (!ctype.includes('application/json')) {
            const txt = await res.text();
            const snippet = String(txt || '').slice(0, 120).replace(/\s+/g, ' ').trim();
            setOwnedAircraft([]);
            setStatus(snippet ? `Unexpected response (not JSON): ${snippet}` : 'Unexpected response (not JSON)');
            return;
          }
          data = await res.json();
        } catch (e) {
          try {
            const txt = await res.text();
            const snippet = String(txt || '').slice(0, 120).replace(/\s+/g, ' ').trim();
            setOwnedAircraft([]);
            setStatus(snippet ? `Failed to parse products: ${snippet}` : 'Failed to parse products.');
          } catch {
            setOwnedAircraft([]);
            setStatus('Failed to parse products.');
          }
          return;
        }
        if (!Array.isArray(data)) {
          setOwnedAircraft([]); // ensure no stale items remain
          setStatus('No products for this account.');
          // Some accounts may have a short propagation delay after first login; retry once after a brief wait
          try { setTimeout(() => setRefreshTick(t => t + 1), 1500); } catch {}
          return;
        }

        // If array is empty on first attempt for this token, retry once after short delay (covers propagation lag)
        try {
          const ref = ownershipRetryRef.current || { attempts:0, token: token };
          if (ref.token !== token) {
            // new token/session -> reset counters
            ownershipRetryRef.current = { attempts: 0, token };
          }
          if (Array.isArray(data) && data.length === 0) {
            if (ownershipRetryRef.current.attempts < 1) {
              ownershipRetryRef.current.attempts += 1;
              setStatus('Syncing products…');
              setTimeout(() => { try { setRefreshTick(t => t + 1); } catch {} }, 1500);
              return; // do not treat as final empty yet
            }
          }
        } catch {}

        // Attach Bunny.net info with robust fallbacks by name/SKU
        let sawPulseCandidate = false;
        data = data.map(prod => {
          let bunny = BUNNY_DOWNLOADS[prod.id] || null;
          let reason = bunny ? 'id-match' : '';
          if (!bunny) {
            const nameRaw = String(prod.name || prod.title || prod.slug || '').trim();
            const skuRaw = String(prod.sku || prod.SKU || prod.product_sku || '').trim();
            const name = nameRaw.toLowerCase();
            const sku = skuRaw.toLowerCase();
            // Normalized forms (strip whitespace, hyphens, underscores, dots) to catch 'systems-pulse', 'systems_pulse', etc.
            const nameNorm = name.replace(/[\s._-]+/g, '');
            const skuNorm = sku.replace(/[\s._-]+/g, '');

            // 1) GA8 SystemsPulse expansion (check this BEFORE GA8 base so we don't mis-map expansions that also contain 'GA8'/'Airvan')
            const sysPulseHit = ( () => {
              // Broad keyword sets; prioritize explicit tokens over generic 'pulse'
              const strongPatterns = [
                'systemspulse','systems pulse','system pulse','systems-pulse','system-pulse','systems_pulse','system_pulse',
                'simpulse','simspulse','systemspuls','syspulse','sys pulse','sim-pulse','sim_pulse'
              ];
              const strong = strongPatterns.some(p => name.includes(p) || sku.includes(p) || nameNorm.includes(p.replace(/\W/g,'')) || skuNorm.includes(p.replace(/\W/g,'')));
              if (strong) return true;
              // Fallback: generic 'pulse' only if paired with GA8/Airvan context
              const genericPulse = (name.includes('pulse') || sku.includes('pulse')) && (name.includes('airvan') || name.includes('ga8') || sku.includes('airvan') || sku.includes('ga8'));
              return genericPulse;
            })();
            if (!bunny && sysPulseHit) {
              const is2024 = name.includes('2024') || sku.includes('2024') || nameNorm.includes('fs2024');
              bunny = is2024 ? (BUNNY_DOWNLOADS[54056] || BUNNY_DOWNLOADS[52385]) : (BUNNY_DOWNLOADS[52385] || bunny);
              if (bunny) reason = is2024 ? 'name/sku:SystemsPulse-2024' : 'name/sku:SystemsPulse';
              sawPulseCandidate = true;
            }

            // 2) GA8 Airvan base — prefer 2024-native when name contains '2024'
            if (!bunny && (name.includes('airvan') || name.includes('ga8') || sku.includes('airvan') || sku.includes('ga8'))) {
              if (name.includes('2024') || sku.includes('2024') || nameNorm.includes('2024')) {
                bunny = BUNNY_DOWNLOADS[53069] || bunny;
                if (bunny && !reason) reason = 'name/sku:GA8-2024';
              } else {
                bunny = BUNNY_DOWNLOADS[52157] || bunny;
                if (bunny && !reason) reason = 'name/sku:GA8';
              }
            }

            // 3) Kodiak — detect by name/sku containing 'kodiak'; prefer 2024-native when '2024' present
            if (!bunny && (name.includes('kodiak') || sku.includes('kodiak') || nameNorm.includes('kodiak'))) {
              const is2024 = name.includes('2024') || sku.includes('2024') || nameNorm.includes('2024');
              const isAmphib = name.includes('amphibian') || sku.includes('amphibian') || nameNorm.includes('amphibian');
              if (isAmphib) {
                bunny = is2024 ? BUNNY_DOWNLOADS[54058] : BUNNY_DOWNLOADS[33810];
                if (bunny && !reason) reason = is2024 ? 'name/sku:KodiakAmphibian-2024' : 'name/sku:KodiakAmphibian';
              } else {
                bunny = is2024 ? BUNNY_DOWNLOADS[54059] : BUNNY_DOWNLOADS[33808];
                if (bunny && !reason) reason = is2024 ? 'name/sku:Kodiak-2024' : 'name/sku:Kodiak';
              }
            }
          }

          // Use displayName from BUNNY_DOWNLOADS when the API returns a SKU-style name
          const displayName = bunny?.displayName;
          const finalName = displayName ? displayName : prod.name;
          return { ...prod, name: finalName, bunny: bunny || null };
        });

        // (Removed synthetic and fallback injection per request: rely solely on direct ID or explicit name/SKU pattern mapping above.)

        // Deduplicate alias products so the UI only shows a single canonical card (e.g., GA8 Airvan 2157 vs 52157).
        const aliasMap = new Map();
        for (const [id, info] of Object.entries(BUNNY_DOWNLOADS)) {
          if (info && Object.prototype.hasOwnProperty.call(info, 'aliasOf')) {
            const target = info.aliasOf;
            if (target != null) aliasMap.set(String(id), target);
          }
        }
        const mergedByCanon = new Map();
        for (const prod of data) {
          const bunny = prod?.bunny || {};
          const aliasOfRaw = (bunny && Object.prototype.hasOwnProperty.call(bunny, 'aliasOf')) ? bunny.aliasOf : null;
          const aliasTarget = aliasOfRaw != null ? aliasOfRaw : aliasMap.get(String(prod.id));
          const canonicalKey = aliasTarget != null ? String(aliasTarget) : String(prod.id);
          const canonicalNum = Number(canonicalKey);
          const canonicalId = Number.isFinite(canonicalNum) ? canonicalNum : canonicalKey;
          const aliasIdsSet = new Set();
          if (Array.isArray(prod.aliasIds)) {
            prod.aliasIds.forEach(v => { if (v != null) aliasIdsSet.add(v); });
          }
          if (prod.id != null) aliasIdsSet.add(prod.id);
          if (aliasTarget != null) aliasIdsSet.add(aliasTarget);
          if (aliasOfRaw != null) aliasIdsSet.add(aliasOfRaw);
          aliasIdsSet.delete(canonicalId);
          const normalized = {
            ...prod,
            id: canonicalId,
            aliasIds: Array.from(aliasIdsSet)
          };
          const existing = mergedByCanon.get(canonicalKey);
          if (!existing) {
            mergedByCanon.set(canonicalKey, normalized);
          } else {
            const mergedAlias = new Set([...(existing.aliasIds || []), ...(normalized.aliasIds || [])]);
            const merged = {
              ...existing,
              ...normalized,
              bunny: existing.bunny && normalized.bunny
                ? { ...existing.bunny, ...normalized.bunny }
                : (existing.bunny || normalized.bunny),
              aliasIds: Array.from(mergedAlias)
            };
            mergedByCanon.set(canonicalKey, merged);
          }
        }
        data = Array.from(mergedByCanon.values());

        // Preheat versions BEFORE showing products to the user
        try {
          beginInitOp();
          setStatus('Preparing versions…');
          // Minimal, fast preheater over canonical manifest.json paths
          window.__swsVersionWarmCache = window.__swsVersionWarmCache || {};
          window.__swsManifestEtagCache = window.__swsManifestEtagCache || new Map();
          window.__swsChangelogWarmCache = window.__swsChangelogWarmCache || {};
          const chans = isBetaTester ? ['Public','Beta'] : ['Public'];
          const allSims = ['2020','2024'];
          const tasks = [];
          const fallbackTasks = [];
          for (const prod of data) {
            const folder = (prod?.bunny?.folder && String(prod.bunny.folder).trim()) || '';
            if (!folder) continue;
            // FS2024-only products must NOT fall back to the 2020 bucket
            const prodCompat = prod?.bunny?.compatibility || prod?.compatibility || '';
            const is24only = prodCompat === 'FS2024';
            const is2020Plus = /FS2020\+/.test(prodCompat) || (!is24only && /2020/.test(prodCompat) && /2024/.test(prodCompat));
            const sims = is24only ? ['2024'] : ['2020','2024'];
            // Zip-derived uppercase folder as fallback (e.g. sws-aircraft-kodiak-wheels.zip -> SWS-AIRCRAFT-KODIAK-WHEELS)
            const zipBase = String(prod?.bunny?.zip || '').replace(/\.zip$/i, '').trim();
            const zipFolder = zipBase ? zipBase.toUpperCase() : '';
            for (const sk of sims) {
              // Use cdnBucketForSim logic: 2020+ products always use '2020' bucket
              const bucket = is2020Plus ? '2020' : sk;
              for (const ch of chans) {
                const url = `https://sws-installer.b-cdn.net/${bucket}/${ch}/${encodeURIComponent(folder)}/manifest.json`;
                // For 2020+ products, both FS2020 and FS2024 map to the same URL;
                // create one task that populates both warm cache keys.
                const extraWarmKeys = (is2020Plus && sk === '2024') ? null : (is2020Plus ? [`${prod.id}:FS2024:${ch}`] : null);
                // Skip if we'd be creating a duplicate URL task (2020+ FS2024 maps to same URL as FS2020)
                if (is2020Plus && sk === '2024') continue;
                tasks.push({ prodId: prod.id, simTag: `FS${sk}`, channel: ch, url, extraWarmKeys });
                // Only queue zip-derived fallback when the name actually differs from the canonical folder
                if (zipFolder && zipFolder !== folder && zipFolder !== folder.toUpperCase()) {
                  const fbUrl = `https://sws-installer.b-cdn.net/${bucket}/${ch}/${encodeURIComponent(zipFolder)}/manifest.json`;
                  fallbackTasks.push({ prodId: prod.id, simTag: `FS${sk}`, channel: ch, url: fbUrl, extraWarmKeys });
                }
              }
            }
          }
          const parseVer = (text) => {
            try {
              const t = String(text || '').trim();
              if (!t) return '';
              try {
                const obj = JSON.parse(t.replace(/^\uFEFF/, ''));
                const keys = ['package_version','packageVersion','version','Version','currentVersion','latestVersion'];
                for (const k of keys) { const v = obj?.[k]; if (typeof v === 'string' && /[0-9]+\.[0-9]+/.test(v)) return v.replace(/^v/i,''); }
              } catch {}
              const m = t.match(/(?:version|ver)\s*[:=]?\s*v?\s*([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
              return m ? m[1] : '';
            } catch { return ''; }
          };
          const limit = 6; let idx = 0;
          async function runOne(task) {
            try {
              const warmKey = `${task.prodId}:${task.simTag}:${task.channel}`;
              if (warmKey in window.__swsVersionWarmCache) return;
              let ok = false, text = '', etag = '';
              if (window?.electron?.netFetchText) {
                const res = await window.electron.netFetchText(task.url + `?_=${cdnCacheBucket()}`, { timeoutMs: 8000 });
                ok = !!(res && res.ok); text = res?.text || ''; etag = (res?.headers && (res.headers['etag'] || res.headers['ETag'])) || '';
              } else {
                const r = await fetch(task.url + `?_=${cdnCacheBucket()}`, { cache: 'no-store' });
                ok = r.ok; text = ok ? await r.text() : ''; etag = ok ? (r.headers.get('ETag') || '') : '';
              }
              // Populate extra warm keys (for 2020+ products, one fetch covers both FS2020 and FS2024)
              const _setWarm = (key, val) => { window.__swsVersionWarmCache[key] = window.__swsVersionWarmCache[key] || val; };
              if (!ok) { _setWarm(warmKey, ''); if (task.extraWarmKeys) task.extraWarmKeys.forEach(k => _setWarm(k, '')); return; }
              const ver = parseVer(text);
              if (!ver) { _setWarm(warmKey, ''); if (task.extraWarmKeys) task.extraWarmKeys.forEach(k => _setWarm(k, '')); return; }
              window.__swsVersionWarmCache[warmKey] = ver;
              if (task.extraWarmKeys) task.extraWarmKeys.forEach(k => { window.__swsVersionWarmCache[k] = ver; });
              if (etag) { try { window.__swsManifestEtagCache.set(task.url, { etag, version: ver }); } catch {} }
              // Extract changelog from manifest and cache it
              try {
                const obj = JSON.parse(text.replace(/^\uFEFF/, ''));
                if (obj && typeof obj === 'object') {
                  const clNorm = (v) => {
                    if (!v) return '';
                    if (typeof v === 'string') return v.trim();
                    if (Array.isArray(v)) return v.map(x => String(x)).join('\n').trim();
                    if (typeof v === 'object') {
                      // Try direct string properties first
                      const c = v.text || v.latest || v.body || v.message || v.content || '';
                      if (typeof c === 'string' && c.trim()) return c.trim();
                      // Check language buckets (e.g. { neutral: { LastUpdate: "..." } })
                      const langBuckets = ['neutral','en','en-US','en-GB','default'];
                      for (const lk of langBuckets) {
                        if (v[lk] && typeof v[lk] === 'object') {
                          // Look for LastUpdate/OlderHistory inside the language bucket
                          const luKeys = ['LastUpdate','lastUpdate','last_update','ReleaseNotes','releaseNotes','release_notes','Changelog','changelog'];
                          for (const k of luKeys) {
                            if (typeof v[lk][k] === 'string' && v[lk][k].trim()) return v[lk][k].trim();
                          }
                        }
                        if (typeof v[lk] === 'string' && v[lk].trim()) return v[lk].trim();
                      }
                      const f = Object.values(v).find(x => typeof x === 'string' && x.trim());
                      if (f) return String(f).trim();
                    }
                    return '';
                  };
                  // Resolve the deepest relevant object: try release_notes.neutral first
                  const langBuckets = ['neutral','en','en-US','en-GB','default'];
                  const rnRaw = obj.release_notes || obj.ReleaseNotes || obj.releaseNotes || null;
                  const rnObj = rnRaw && typeof rnRaw === 'object'
                    ? (langBuckets.reduce((found, lk) => found || (rnRaw[lk] && typeof rnRaw[lk] === 'object' ? rnRaw[lk] : null), null) || rnRaw)
                    : null;
                  // Source to scan: prefer the resolved nested object, fall back to top-level
                  const src = rnObj || obj;
                  const clKeys = ['LastUpdate','lastUpdate','last_update','ReleaseNotes','releaseNotes','release_notes','Changelog','changelog'];
                  let clParts = [];
                  for (const k of clKeys) {
                    if (src[k]) { const t = clNorm(src[k]); if (t) { clParts.push(t); break; } }
                  }
                  // If we found nothing in the resolved object, also try top-level
                  if (!clParts.length && rnObj) {
                    for (const k of clKeys) {
                      if (obj[k]) { const t = clNorm(obj[k]); if (t) { clParts.push(t); break; } }
                    }
                  }
                  // OlderHistory: check resolved object first, then top-level
                  const olderKeys = ['OlderHistory','olderHistory','older_history','History','history'];
                  let olderRaw = null;
                  for (const k of olderKeys) { if (src[k]) { olderRaw = src[k]; break; } }
                  if (!olderRaw && rnObj) { for (const k of olderKeys) { if (obj[k]) { olderRaw = obj[k]; break; } } }
                  if (olderRaw) { const oh = clNorm(olderRaw); if (oh && !clParts.includes(oh)) clParts.push(oh); }
                  if (clParts.length) window.__swsChangelogWarmCache[warmKey] = clParts.join('\n\n');
                }
              } catch {}
            } catch {}
          }
          const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
            while (idx < tasks.length) { const my = tasks[idx++]; await runOne(my); }
          });
          // Wait a short moment to warm most versions before revealing products
          await Promise.race([ Promise.all(workers), new Promise(r => setTimeout(r, 2500)) ]);
          // Fallback pass: only try zip-derived folders for products that still have no warmed version
          if (fallbackTasks.length) {
            const remainingFb = fallbackTasks.filter(t => !((`${t.prodId}:${t.simTag}:${t.channel}`) in window.__swsVersionWarmCache));
            if (remainingFb.length) {
              let fbIdx = 0;
              const fbWorkers = Array.from({ length: Math.min(limit, remainingFb.length) }, async () => {
                while (fbIdx < remainingFb.length) { const my = remainingFb[fbIdx++]; await runOne(my); }
              });
              await Promise.race([ Promise.all(fbWorkers), new Promise(r => setTimeout(r, 1500)) ]);
            }
          }
          // Mark preheat as done so the global preheater effect doesn't repeat the same work
          try { window.__swsPreheatToken = token; } catch {}
        } catch {} finally { endInitOp(); }

        // --- Pre-populate beta availability cache before cards mount ---
        // This ensures betaToggleVisible evaluates correctly on first render,
        // even for users with no prior localStorage entries.
        try {
          const betaFlag = (() => { try { return localStorage.getItem('sws_isBetaTester') === '1'; } catch { return false; } })();
          if (betaFlag && data && data.length) {
            const warmupReadLs = (pid) => { try { return JSON.parse(localStorage.getItem(`sws_betaAvail_${pid}`) || 'null'); } catch { return null; } };
            const warmupWriteLs = (pid, obj) => { try { localStorage.setItem(`sws_betaAvail_${pid}`, JSON.stringify(obj)); } catch {} };
            const warmupFreshEnough = (rec) => {
              if (!rec) return false;
              const age = Date.now() - (rec.ts || 0);
              return age < (rec.anyTrue ? 10*60*1000 : 30*60*1000);
            };
            const warmupCompatAllows = (p, simKey) => {
              const c = String(p?.compatibility || p?.bunny?.compatibility || 'FS2020+FS2024');
              if (simKey === '2020') return /2020/.test(c);
              if (simKey === '2024') return /2024/.test(c) || /2020\+/.test(c);
              return true;
            };
            // Build queue of products needing beta checks
            const betaQueue = [];
            for (const p of data.slice(0, 40)) {
              if (!p) continue;
              const pid = String(p.id || p?.bunny?.folder || '');
              if (!pid) continue;
              if (warmupFreshEnough(warmupReadLs(pid))) continue;
              betaQueue.push(p);
            }
            if (betaQueue.length) {
              setStatus('Checking beta availability…');
              const CONC = 4;
              let qi = 0;
              const betaWorker = async () => {
                while (qi < betaQueue.length) {
                  const p = betaQueue[qi++];
                  const pid = String(p.id || p?.bunny?.folder || '');
                  let v2020 = false, v2024 = false;
                  // Check warm cache first — preheat already fetched Beta manifests
                  // A truthy value means beta exists; empty string means probed and got 404
                  try {
                    const wc = window.__swsVersionWarmCache || {};
                    const k20 = `${p.id}:FS2020:Beta`;
                    const k24 = `${p.id}:FS2024:Beta`;
                    if (k20 in wc) v2020 = !!(wc[k20] || '').trim();
                    if (k24 in wc) v2024 = !!(wc[k24] || '').trim();
                  } catch {}
                  // No fallback HEAD probing here; warm cache is the single source to avoid startup request spikes.
                  try {
                    if (!warmupCompatAllows(p, '2020')) v2020 = false;
                    if (!warmupCompatAllows(p, '2024')) v2024 = false;
                  } catch {}
                  warmupWriteLs(pid, { v2020, v2024, anyTrue: !!(v2020 || v2024), ts: Date.now() });
                }
              };
              await Promise.race([
                Promise.all(Array.from({ length: Math.min(CONC, betaQueue.length) }, betaWorker)),
                new Promise(r => setTimeout(r, 6000)) // cap at 6s to avoid blocking too long
              ]);
              try { localStorage.setItem('sws_betaWarmupDone', '1'); } catch {}
            }
          }
        } catch {}

        // Only set if token is still current (avoid race)
        if (currentToken === token) {
          // Pre-warm thumbnails before rendering product cards
          try {
            for (const p of data) {
              const thumbUrl = p?.bunny?.thumbnail;
              if (!thumbUrl) continue;
              const pid = String(p?.id || p?.bunny?.folder || p?.name || '');
              if (!pid) continue;
              const cacheKey = `sws_thumb_${pid}`;
              // Skip if already cached
              try { if (localStorage.getItem(cacheKey)) continue; } catch {}
              // Eagerly cache the configured thumbnail URL
              try { localStorage.setItem(cacheKey, thumbUrl); } catch {}
            }
          } catch {}
          setOwnedAircraft(data);
          setTimeout(() => { typeof refreshInstalledLists === 'function' && refreshInstalledLists(); }, 0);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        setOwnedAircraft([]); // clear stale list on error
        setStatus('Could not fetch owned aircraft: ' + (err.message || String(err)));
      } finally {
        endInitOp();
      }
    }
    fetchOwnedAircraft();

    return () => ctrl.abort();
  }, [token, refreshTick]); // allow manual refresh

  // Auto-detect FS2020/FS2024 paths on first load (no longer gated on token sign-in)
  useEffect(() => {
    (async () => {
      // Skip if we already have both paths in state or saved
      const saved2020 = localStorage.getItem('sws_installPath2020') || '';
      const saved2024 = localStorage.getItem('sws_installPath2024') || '';
      const need2020 = !saved2020 && !installPath2020;
      const need2024 = !saved2024 && !installPath2024;
      if (!need2020 && !need2024) return;
      beginInitOp();
      try { await waitForElectronBridge(); } catch { endInitOp(); return; }
      let detected20 = '';
      let detected24 = '';
      try { if (need2020 && window.electron?.getDefaultInstallPath) detected20 = await window.electron.getDefaultInstallPath(); } catch {}
      try { if (need2024 && window.electron?.getDefaultInstallPath2024) detected24 = await window.electron.getDefaultInstallPath2024(); } catch {}
      // Persist and set state if found
      if (detected20) {
        setInstallPath2020(detected20);
        setInstallPath2020Source(prev => prev || 'Auto-detected');
        try { localStorage.setItem('sws_installPath2020', detected20); } catch {}
        try { await window.electron.setSavedInstallPath2020?.(detected20); } catch {}
      }
      if (detected24) {
        setInstallPath2024(detected24);
        setInstallPath2024Source(prev => prev || 'Auto-detected');
        try { localStorage.setItem('sws_installPath2024', detected24); } catch {}
        try { await window.electron.setSavedInstallPath2024?.(detected24); } catch {}
      }
      if (detected20 || detected24) {
        const msgParts = [];
        if (detected20) msgParts.push(`FS2020: ${detected20}`);
        if (detected24) msgParts.push(`FS2024: ${detected24}`);
        setStatus(`Detected Community folders — ${msgParts.join('  |  ')}`);
        setTimeout(() => { typeof refreshInstalledLists === 'function' && refreshInstalledLists(); }, 0);
      } else if (need2020 || need2024) {
        // Provide a hint so user knows why Install buttons are disabled
        setStatus(prev => prev || 'Could not auto-detect Community folder(s). Set them in Settings.');
      }
      endInitOp();
    })();
  // Depend on the state vars so if they are cleared (edge case) we retry
  }, [installPath2020, installPath2024]);

  // Re-scan on path change (remove refreshInstalledLists from deps)
  useEffect(() => {
    typeof refreshInstalledLists === 'function' && refreshInstalledLists();
  }, [installPath2020, installPath2024, ownedAircraft]); // was [..., refreshInstalledLists]

  useEffect(() => {
    // Early opportunistic detection (may fire before main auto-detect effect). Also sets per-sim path if blank.
    // Only auto-detect + persist when NO saved path exists (main process or localStorage).
    waitForElectronBridge()
      .then(async () => {
        try {
          // FS2020 — skip auto-detect if the user already has a saved path
          const existMain2020 = await window.electron.getSavedInstallPath2020?.() || '';
          const existLS2020 = localStorage.getItem('sws_installPath2020') || '';
          if (!existMain2020 && !existLS2020) {
            const p2020 = await window.electron.getDefaultInstallPath();
            if (p2020) {
              if (!installPath2020) setInstallPath2020(p2020);
              if (!installPath2020Source) setInstallPath2020Source('Auto-detected');
              try { localStorage.setItem('sws_installPath2020', p2020); } catch {}
              try { await window.electron.setSavedInstallPath2020?.(p2020); } catch {}
            }
          }
          // FS2024 — same guard
          if (window.electron.getDefaultInstallPath2024) {
            const existMain2024 = await window.electron.getSavedInstallPath2024?.() || '';
            const existLS2024 = localStorage.getItem('sws_installPath2024') || '';
            if (!existMain2024 && !existLS2024) {
              const p2024 = await window.electron.getDefaultInstallPath2024();
              if (p2024) {
                if (!installPath2024) setInstallPath2024(p2024);
                if (!installPath2024Source) setInstallPath2024Source('Auto-detected');
                try { localStorage.setItem('sws_installPath2024', p2024); } catch {}
                try { await window.electron.setSavedInstallPath2024?.(p2024); } catch {}
              }
            }
          }
        } catch (e) {
          setStatus(s => s || (e?.message || 'Community auto-detect failed'));
        }
      })
      .catch(err => setStatus(err.message));
  // Intentionally run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global version preheater: once we have the owned list, kick off quick manifest probes
  useEffect(() => {
    (async () => {
      try {
        if (!token) return;
        if (!Array.isArray(ownedAircraft) || ownedAircraft.length === 0) return;
        // Run only once per token/session
        window.__swsPreheatToken = window.__swsPreheatToken || '';
        if (window.__swsPreheatToken === token) return;
        window.__swsPreheatToken = token;

        // Prepare caches
        window.__swsVersionWarmCache = window.__swsVersionWarmCache || {};
        window.__swsManifestEtagCache = window.__swsManifestEtagCache || new Map();

        const chans = isBetaTester ? ['Public','Beta'] : ['Public'];
        const allSims = ['2020','2024'];

        const tasks = [];
        for (const prod of ownedAircraft) {
          const folder = (prod?.bunny?.folder && String(prod.bunny.folder).trim()) || '';
          if (!folder) continue;
          // FS2024-only products: only probe the 2024 bucket
          const prodCompat = prod?.bunny?.compatibility || prod?.compatibility || '';
          const prodIs24only = prodCompat === 'FS2024';
          const sims = prodIs24only ? ['2024'] : allSims;
          // Zip-derived uppercase folder as fallback (e.g. sws-aircraft-kodiak-wheels.zip -> SWS-AIRCRAFT-KODIAK-WHEELS)
          const zipBase = String(prod?.bunny?.zip || '').replace(/\.zip$/i, '').trim();
          const zipFolder = zipBase ? zipBase.toUpperCase() : '';
          for (const sk of sims) {
            for (const ch of chans) {
              const url = `https://sws-installer.b-cdn.net/${sk}/${ch}/${encodeURIComponent(folder)}/manifest.json`;
              tasks.push({ prodId: prod.id, simTag: `FS${sk}`, channel: ch, url });
              if (zipFolder && zipFolder !== folder && zipFolder !== folder.toUpperCase()) {
                const fbUrl = `https://sws-installer.b-cdn.net/${sk}/${ch}/${encodeURIComponent(zipFolder)}/manifest.json`;
                tasks.push({ prodId: prod.id, simTag: `FS${sk}`, channel: ch, url: fbUrl });
              }
            }
          }
        }

        const parseVer = (text) => {
          try {
            const t = String(text || '').trim();
            if (!t) return '';
            // JSON first
            try {
              const obj = JSON.parse(t.replace(/^\uFEFF/, ''));
              const keys = ['package_version','packageVersion','version','Version','currentVersion','latestVersion'];
              for (const k of keys) {
                const v = obj?.[k];
                if (typeof v === 'string' && /[0-9]+\.[0-9]+/.test(v)) return v.replace(/^v/i,'');
              }
            } catch {}
            // Regex fallback
            const m = t.match(/(?:version|ver)\s*[:=]?\s*v?\s*([0-9]+(?:\.[0-9]+){1,3}(?:-[a-z0-9\.-]+)?)/i);
            return m ? m[1] : '';
          } catch { return ''; }
        };

        // Concurrency limit
        const limit = 6;
        let idx = 0;
        async function runOne(task) {
          try {
            // Skip if already warmed
            const warmKey = `${task.prodId}:${task.simTag}:${task.channel}`;
            if (window.__swsVersionWarmCache[warmKey]) return;
            // Prefer main process fetch
            let ok = false, text = '', etag = '';
            if (window?.electron?.netFetchText) {
              const res = await window.electron.netFetchText(task.url + `?_=${cdnCacheBucket()}`, { timeoutMs: 8000 });
              ok = !!(res && res.ok);
              text = res?.text || '';
              etag = (res?.headers && (res.headers['etag'] || res.headers['ETag'])) || '';
            } else {
              const r = await fetch(task.url + `?_=${cdnCacheBucket()}`, { cache: 'no-store' });
              ok = r.ok;
              text = ok ? await r.text() : '';
              etag = ok ? (r.headers.get('ETag') || '') : '';
            }
            if (!ok) return;
            const ver = parseVer(text);
            if (!ver) return;
            window.__swsVersionWarmCache[warmKey] = ver;
            if (etag) {
              try { window.__swsManifestEtagCache.set(task.url, { etag, version: ver }); } catch {}
            }
          } catch {}
        }

        const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
          while (idx < tasks.length) {
            const my = tasks[idx++];
            await runOne(my);
          }
        });
        await Promise.race([
          Promise.all(workers),
          // Safety cap to avoid blocking UI; the per-card lookups can still continue
          new Promise(resolve => setTimeout(resolve, 7000))
        ]);
      } catch {}
    })();
  }, [token, ownedAircraft, isBetaTester]);

  // --- Load saved paths (from main settings first), then auto-detect on first load ---
  useEffect(() => {
    (async () => {
      try {
        await waitForElectronBridge();
        // Prefer persisted settings from main process (robust across file:// origin changes)
        const savedMain2020 = await window.electron.getSavedInstallPath2020?.();
        const savedMain2024 = await window.electron.getSavedInstallPath2024?.();
        const savedLS2020 = localStorage.getItem('sws_installPath2020');
        const savedLS2024 = localStorage.getItem('sws_installPath2024');

        // FS2020
        if (savedMain2020) {
          setInstallPath2020(savedMain2020);
          setInstallPath2020Source('Saved');
          try { localStorage.setItem('sws_installPath2020', savedMain2020); } catch {}
        } else if (savedLS2020) {
          setInstallPath2020(savedLS2020);
          setInstallPath2020Source('Saved');
          try { await window.electron.setSavedInstallPath2020?.(savedLS2020); } catch {}
        } else {
          const detected = await window.electron.getDefaultInstallPath();
          if (detected) {
            setInstallPath2020(detected);
            setInstallPath2020Source('Auto-detected');
            try { localStorage.setItem('sws_installPath2020', detected); } catch {}
            try { await window.electron.setSavedInstallPath2020?.(detected); } catch {}
            setStatus('Detected FS2020 Community folder automatically.');
          }
        }

        // FS2024
        if (savedMain2024) {
          setInstallPath2024(savedMain2024);
          setInstallPath2024Source('Saved');
          try { localStorage.setItem('sws_installPath2024', savedMain2024); } catch {}
        } else if (savedLS2024) {
          setInstallPath2024(savedLS2024);
          setInstallPath2024Source('Saved');
          try { await window.electron.setSavedInstallPath2024?.(savedLS2024); } catch {}
        } else {
          const detected24 = await window.electron.getDefaultInstallPath2024();
          if (detected24) {
            setInstallPath2024(detected24);
            setInstallPath2024Source('Auto-detected');
            try { localStorage.setItem('sws_installPath2024', detected24); } catch {}
            try { await window.electron.setSavedInstallPath2024?.(detected24); } catch {}
            if (!(savedMain2020 || savedLS2020)) setStatus('Detected FS2024 Community folder automatically.');
          }
        }
      } catch {
        setStatus('Electron bridge not available');
      }
    })();
  }, []);

  // Hydrate downloaded files from local cache on startup
  useEffect(() => {
    try {
      const sims = ['FS2020', 'FS2024'];
      const byProd = {};
      const products = (ownedAircraft && ownedAircraft.length ? ownedAircraft : []);
      for (const prod of products) {
        for (const sim of sims) {
          const c = readDlCacheForProduct(prod, sim, getChan(sim));
          if (c && (c.localPath || c.baseLocalPath)) {
            byProd[prod.id] = byProd[prod.id] || { id: prod.id, sims: {} };
            byProd[prod.id].sims[sim] = {
              ...(byProd[prod.id].sims[sim] || {}),
              ...c
            };
          }
        }
      }
      if (Object.keys(byProd).length) setDownloadedFiles(prev => ({ ...byProd, ...prev }));
    } catch {}
  }, [ownedAircraft]);

  // Load configured downloads directory on startup
  useEffect(() => {
    (async () => {
      try {
        await waitForElectronBridge();
        if (!window.electron?.getDownloadsDir) return;
        const res = await window.electron.getDownloadsDir();
        if (res?.success && res.dir) setDownloadsDir(res.dir);
      } catch {}
    })();
  }, []);

  // Load configured install cache directory on startup
  useEffect(() => {
    (async () => {
      try {
        await waitForElectronBridge();
        if (!window.electron?.getPkgCacheDir) return;
        const res = await window.electron.getPkgCacheDir();
        if (res?.success && res.dir) setPkgCacheDir(res.dir);
      } catch {}
    })();
  }, []);

  // Load debug logging toggle state on startup
  useEffect(() => {
    (async () => {
      try {
        await waitForElectronBridge();
        if (!window.electron?.getDebugLogging) return;
        const res = await window.electron.getDebugLogging();
        if (res?.success) {
          setDebugLogging(!!res.enabled);
          if (res.logsDir) setLogsDir(res.logsDir);
        }
      } catch {}
    })();
  }, []);

  // 2) Re-scan installed aircraft whenever the active installPath changes
  useEffect(() => {
    typeof refreshInstalledLists === 'function' && refreshInstalledLists();
  }, [installPath2020, installPath2024, ownedAircraft]);

  // 3) Wire up "Change" buttons via a single handler
  // (Removed duplicate handleSelectFolder definition to avoid syntax errors)

  // Install handler (fix progress subscription to keep number, not object)
  const handleInstall = async (product, localZipPath, simTag, channel, _versionStr, variantZip) => withOpLock('install', async () => {
    if (!product) return;
    const resolvedInstallPath =
      simTag === 'FS2020' ? installPath2020 :
      simTag === 'FS2024' ? installPath2024 : '';

    // Lightweight debug helper (enabled via localStorage.sws_debug_install = '1')
    const dbg = (...args) => {
      try { if (localStorage.getItem('sws_debug_install') === '1') console.debug('[install-debug]', ...args); } catch {}
    };
    dbg('begin', { product: product.id, localZipPath, simTag, channel, variantZip, resolvedInstallPath });

    if (!localZipPath) {
      setStatus('No cached ZIP available. Use Download first.');
      dbg('abort:no-zip');
      return;
    }
    if (!resolvedInstallPath) {
      setStatus(`Set ${simTag} Community folder first in Settings.`);
      dbg('abort:no-install-path');
      return;
    }

    // Normalize/guard the install path: try to resolve common parent selections to the Community folder
    let resolvedPath = resolvedInstallPath;
    try {
      const parts = resolvedPath.split(/[/\\]+/).filter(Boolean);
      const tail = (parts[parts.length - 1] || '').toLowerCase();
      const isCommunity = tail === 'community';
      const sep = resolvedPath.includes('\\') ? '\\' : '/';
      const join = (arr) => arr.join(sep);
      const findUp = (name) => {
        let i = parts.length - 1;
        while (i >= 0 && parts[i].toLowerCase() !== name.toLowerCase()) i--;
        return i;
      };
      const suggestCommunityFromParent = () => {
        if (tail === 'packages') return join(parts) + sep + 'Community';
        if (tail === 'onestore' || tail === 'official') {
          const idx = findUp('packages');
          if (idx >= 0) return join(parts.slice(0, idx + 1)) + sep + 'Community';
        }
        if (tail === 'content') return join(parts) + sep + 'Community';
        return '';
      };
      if (!isCommunity) {
        const suggestion = suggestCommunityFromParent();
        if (suggestion) {
          const ok = window.confirm(`Install to this Community folder instead?\n\n${suggestion}\n\n(You selected: ${resolvedPath})`);
          if (ok) {
            resolvedPath = suggestion;
          }
        }
      }
    } catch {}
    // Optional: ensure directory exists on disk (create only if user confirmed a suggested Community path)
    try {
      if (window.electron?.statFile) {
        let st = await window.electron.statFile(resolvedPath).catch(()=>null);
        if (!st) {
          // Offer to create the Community folder
          const createOk = window.confirm(`Community folder not found: \n${resolvedPath}\n\nCreate it now?`);
          if (createOk && window.electron?.mkdirp) {
            try { await window.electron.mkdirp(resolvedPath); } catch {}
          }
          // Recheck after creation attempt
          st = await window.electron.statFile(resolvedPath).catch(()=>null);
          if (!st) {
            setStatus(`Community folder path not found on disk: "${resolvedPath}". Fix it in Settings.`);
            dbg('abort:path-missing');
            return;
          }
        }
      }
    } catch {}

  setInstallingId(product.id);
  try { setActiveInstallSim(simTag); } catch {}
    // Reset any stale download percent so we don't display 100% during extraction
    try { setDownloadProgress(null); } catch {}
  setProgress(0);
  setStatus(`Installing ${product.name} [${simTag}, ${channel}]…`);
  dbg('progress:start');

    try {
      // Basic integrity check: ensure file exists and non-zero before attempting install
      try {
        if (window.electron?.statFile && localZipPath) {
          const st = await window.electron.statFile(localZipPath).catch(()=>null);
          if (!st || !st.size) {
            setStatus('Cached ZIP appears empty or missing. Re-download.');
            setInstallingId(null);
            return;
          }
        }
      } catch (e) { logDebug('Integrity check skipped', e?.message || e); }
      let effectiveChannel = channel;
      const baseFolderHint = (product?.bunny?.folder || product?.name || '').toLowerCase();
      const forceCopy = (localStorage.getItem('sws_force_copy_install') === '1');
      const legacySimpleInstall = localStorage.getItem('sws_legacy_install') === '1';
      const result = await window.electron.installAircraft({
        aircraftZipPath: localZipPath,
        installPath: resolvedPath,
        simTag,
        channel,
        baseFolder: baseFolderHint,
        // Provide expected folder names so main process can avoid linking unrelated extracted dirs
        expectedFolders: [
          ...(product?.bunny?.folder ? [product.bunny.folder] : []),
          ...(product?.bunny?.altFolders || []),
          ...((product?.bunny?.components || []).map(c => c.folder).filter(Boolean)),
        ],
        // preferCopy=false means use junctions; true means copy
        preferCopy: forceCopy ? true : (!useLinkInstalls)
        , legacySimpleInstall
      });

      if (!result?.success) {
        setStatus(`Install failed: ${result?.error || 'Unknown error'}`);
        dbg('result:fail', result);
        setProgress(null);
        return;
      }

      // Log if the backend fell back from junction to copy (advisory, no rollback)
      try {
        if (result?.linkFallbackUsed) {
          console.warn('[install] Junction creation failed for some components, copy fallback was used.');
        }
      } catch {}

      // Summarize what was actually linked/copied
      try {
        // Prefer new fields from main: installedFolders + communityPath + linkFallbackUsed
        const folders = Array.isArray(result?.installedFolders) ? result.installedFolders : (Array.isArray(result?.created) ? result.created.map(c=>c.folder||c.linkName).filter(Boolean) : []);
        const destName = (result?.communityPath ? String(result.communityPath).split(/[/\\]/).pop() : '') || 'Community';
        const fallbackNote = (result?.linkFallbackUsed || (result?.linkErrors && result.linkErrors.length)) ? (strictLinkInstalls ? '' : ' (fallback copy used for some components)') : '';
        if (folders.length) {
          const summary = `${folders.length} folder${folders.length>1?'s':''} → ${destName}`;
          setStatus(`${product.name} installed (${summary}).${fallbackNote}`);
        } else {
          setStatus(`${product.name} installed.${fallbackNote}`);
        }
      } catch { setStatus(`${product.name} installed.`); }
  setProgress(100);
      dbg('result:success', { created: result?.created?.length, version: result?.version, suspicious: result?.suspiciousVersion, extracted: result?.extracted });

      // If backend marked version suspicious, attempt substitution with remote channel version
      try {
        if (result?.suspiciousVersion) {
          const remoteChanVer = (simTag === 'FS2020') ? (remoteVers?.FS2020 || remoteVersUnified?.FS2020) : (remoteVers?.FS2024 || remoteVersUnified?.FS2024);
          if (remoteChanVer && compareVersionsNormalized(remoteChanVer, result.version || '0.0.0') >= 0) {
            if (localStorage.getItem('sws_debug_install') === '1') console.debug('[install-debug] substituting suspicious version', result.version, '->', remoteChanVer);
            result.version = remoteChanVer;
          }
        }
      } catch {}

  // Record which sim this product was last explicitly installed to so UI can disambiguate
  try { localStorage.setItem(`sws_lastInstallSim_${product.id}`, simTag); } catch {}

      // Persist installed variant/channel/version per sim (used by refreshInstalledLists)
      try {
        const simKey = simTag; // 'FS2020' | 'FS2024'
        if (variantZip) localStorage.setItem(`sws_variant_${product.id}_${simKey}`, variantZip);
        if (channel)    localStorage.setItem(`sws_channel_${product.id}_${simKey}`, channel);
        // Only persist version if this is NOT a panel-mod-only install (panel mod folders start with a-z followed by - or _)
        const _installedFolders = Array.isArray(result?.installedFolders) ? result.installedFolders : (Array.isArray(result?.created) ? result.created.map(c => c.folder || c.linkName).filter(Boolean) : []);
        const _isPanelModOnly = _installedFolders.length > 0 && _installedFolders.every(f => /^[a-z][-_]/i.test(String(f)) || /(pms|pms50|tds|gtn|panel)/i.test(String(f)));
        if (result?.version && !_isPanelModOnly) localStorage.setItem(`sws_version_${product.id}_${simKey}`, String(result.version));
      // Save the last-known ZIP signature for delta detection
        try {
          const sig = await (async () => {
            const chkChan = channel || 'Public';
        // normalize to the base expected file name (without date prefix)
        const zip = (variantZip || '').split('/').pop();
            if (!zip) return null;
        return await headZipSignature(simTag, chkChan, zip);
          })();
          if (sig) writeZipSig(product.id, simKey, sig);
        } catch {}
      } catch {}

      // Persist folder → product.id mapping so the next refreshInstalledLists scan
      // immediately recognises these folders (avoids dropping the optimistic entry).
      try {
        const foldersInstalled = Array.isArray(result?.installedFolders) ? result.installedFolders : [];
        if (foldersInstalled.length && product?.id) {
          const pathKey = normalizePath(resolvedInstallPath);
          let folderIdMap = {};
          try { folderIdMap = JSON.parse(localStorage.getItem('sws_folderIdMap') || '{}') || {}; } catch { folderIdMap = {}; }
          if (!folderIdMap[pathKey]) folderIdMap[pathKey] = {};
          for (const f of foldersInstalled) {
            const simple = String(f || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
            if (simple) folderIdMap[pathKey][simple] = product.id;
          }
          localStorage.setItem('sws_folderIdMap', JSON.stringify(folderIdMap));
        }
      } catch {}

      // Optimistic update
      setAircraftList(prev => {
        const filtered = (prev || []).filter(a => !(
          a.id === product.id &&
          normalizePath(a.communityPath) === normalizePath(resolvedInstallPath)
        ));
        return [
          ...filtered,
          {
            id: product.id,
            name: product.name,
            folder: product?.bunny?.folder || product.name,
            communityPath: resolvedInstallPath,
            version: result.version || '',
            variantZip: variantZip || '',
            installedChannel: effectiveChannel
          }
        ];
      });

      // Removed automatic mirror install: user explicitly chooses which sim to install.

      // Clear the per-sim downloadedFiles entry so the card doesn't show "Ready to install" again for this sim
      try {
        setDownloadedFiles(prev => {
          const prevRec = prev?.[product.id] || { id: product.id, sims: {} };
          const sims = { ...(prevRec.sims || {}) };
          if (sims[simTag]) delete sims[simTag];
          return { ...prev, [product.id]: { ...prevRec, sims } };
        });
        // Preserve persistent cache for re-install without network
      } catch {}

  // Defer re-scan slightly to avoid a race where the scan doesn't see
  // the freshly created folders yet and briefly flips the button back to "Install".
  setTimeout(() => refreshInstalledLists(), 300);
  setTimeout(() => refreshInstalledLists(), 1200);
      // Reset progress overlay after a short delay
      setTimeout(() => { setProgress(null); dbg('progress:cleared'); }, 800);
    } catch (e) {
      // IMPORTANT: previously attempted to return an out-of-scope `result` causing a ReferenceError and silent failure.
      const msg = e?.message || String(e);
      if (__SWS_DEBUG_GLOBAL) console.error('[install] exception', msg, e);
      setStatus(`Install error: ${msg}`);
      dbg('exception', msg);
      setProgress(null);
      return { success:false, error: msg };
    } finally {
      setInstallingId(null);
      try { setActiveInstallSim(null); } catch {}
      dbg('end');
    }
  });

  // Uninstall handler
  const handleUninstall = async (aircraft) => withOpLock('uninstall', async () => {
    if (!aircraft) return;

    // Snapshot existing installs for this product (by community path) before we mutate state
    const installedBefore = (aircraftList || []).filter(a => a.id === aircraft.id).map(a => normalizePath(a.communityPath));

    // Build install path candidates (prefer the one the item came from)
    // If we know exactly which Community path this item came from, only target that path.
    // This prevents uninstalling both sims when the user clicked Uninstall for one sim.
    const pathCandidates = [];
    if (aircraft.communityPath) {
      // When uninstall invoked from a specific sim card, that card's record includes the exact communityPath.
      // Limiting to that path prevents accidental removal from the other sim.
      pathCandidates.push(aircraft.communityPath);
    } else {
      // Legacy fallback (should be rare). We still only want to try ONE path that actually contains this aircraft.
      if (installPath2020) pathCandidates.push(installPath2020);
      if (installPath2024) pathCandidates.push(installPath2024);
    }

    const seenPaths = new Set();
    const installPaths = pathCandidates.filter(p => {
      const np = normalizePath(p);
      if (!np || seenPaths.has(np)) return false;
      seenPaths.add(np);
      return true;
    });

    // Candidate folders from metadata
    const cleanSeg = s => String(s || '').split(/[\\/]/).pop();
    const metaFolders = new Set();
    if (aircraft.folder) metaFolders.add(cleanSeg(aircraft.folder));
    if (aircraft.name) metaFolders.add(cleanSeg(aircraft.name));
    if (aircraft.variantZip) metaFolders.add(cleanSeg(aircraft.variantZip).replace(/\.zip$/i,''));

    const owned = ownedAircraft.find(p => p.id === aircraft.id);
    if (owned?.bunny?.folder) metaFolders.add(cleanSeg(owned.bunny.folder));
    if (owned?.bunny?.zip) metaFolders.add(cleanSeg(owned.bunny.zip).replace(/\.zip$/i,''));
    (owned?.bunny?.altFolders || []).forEach(f => metaFolders.add(cleanSeg(f)));
    (owned?.bunny?.components || []).forEach(c => {
      if (c.folder) metaFolders.add(cleanSeg(c.folder));
      if (c.zip) metaFolders.add(cleanSeg(c.zip).replace(/\.zip$/i,''));
      (c.altFolders || []).forEach(f => metaFolders.add(cleanSeg(f)));
    });

    // Helper for simple match
    const norm = s => String(s || '').toLowerCase().trim();
    const simple = s => norm(s).replace(/[^a-z0-9]+/g, '');

    setStatus(`Uninstalling ${aircraft.name}...`);
  let success = false;
  let successCount = 0;
  let removedSimTag = '';
    let lastErr = '';

    for (const p of installPaths) {
      // Query main for actual folders present and pick best matches first
      let present = [];
      try {
        present = await window.electron.listAircraft(p);
      } catch {}
      const presentFolders = (present || []).map(x => String(x?.folder || x?.name || '').trim()).filter(Boolean);

      // Find present matches by id or folder similarity
      const presentMatches = (present || []).filter(x => {
        if (!x) return false;
        if (x.id && aircraft.id && x.id === aircraft.id) return true;
        const xf = simple(x.folder || x.name || '');
        const candidates = Array.from(metaFolders).map(simple);
        return candidates.some(c => xf === c || xf.startsWith(c) || c.startsWith(xf));
      });
      const presentFolderNames = presentMatches.map(x => cleanSeg(x.folder || x.name)).filter(Boolean);

      // Build ordered uninstall folder list: exact present matches first, then our metadata guesses
      const tryFoldersOrdered = [];
      const seenF = new Set();
      const pushF = f => { const k = cleanSeg(f); if (k && !seenF.has(k)) { seenF.add(k); tryFoldersOrdered.push(k); } };
      presentFolderNames.forEach(pushF);
      Array.from(metaFolders).forEach(pushF);

  for (const folder of tryFoldersOrdered) {
        const packagePathWin = joinPathWin(p, folder);
        const packagePathPosix = `${String(p).replace(/\\/g,'/')}/${folder}`;

        const attempts = [
          { packagePath: packagePathWin }
        ];

        // Try each shape until one succeeds
        for (const opts of attempts) {
          try {
            const result = await window.electron.uninstallAircraft(opts);
    if ( result?.success) {
        try { console.debug('[UNINSTALL] OK ' + JSON.stringify(opts)); } catch { console.debug('[UNINSTALL] OK'); }
      success = true;
      successCount += 1;

              // Optimistic remove: drop this product from this Community path
              const removedPath = p;        // current Community base path in loop
              setAircraftList(prev =>
                prev.filter(a =>
                  !(
                    a.id === aircraft.id &&
                    normalizePath(a.communityPath) === normalizePath(removedPath)
                  )
                )
             );

              // Determine which sim we uninstalled from and re-hydrate in-memory cache for quick reinstall
              if (normalizePath(removedPath) === normalizePath(installPath2020)) {
                removedSimTag = 'FS2020';
              } else if (normalizePath(removedPath) === normalizePath(installPath2024)) {
                removedSimTag = 'FS2024';
              }

              if (removedSimTag) {
                try {
                  const targetChannel = removedSimTag === 'FS2020' ? installed2020Channel : installed2024Channel;
                  const aliasIds = owned?.aliasIds || [];
                  const aliasOf = owned?.bunny?.aliasOf != null ? owned.bunny.aliasOf : null;
                  const persisted = readDlCache(aircraft.id, removedSimTag, targetChannel, { aliasIds, aliasOf });
                  if (persisted && (persisted.localPath || persisted.baseLocalPath)) {
                    setDownloadedFiles(prev => {
                      const prevRec = prev?.[aircraft.id] || { id: aircraft.id, sims: {} };
                      return {
                        ...prev,
                        [aircraft.id]: {
                          ...prevRec,
                          sims: {
                            ...prevRec.sims,
                            [removedSimTag]: { ...(prevRec.sims?.[removedSimTag] || {}), ...persisted }
                          }
                        }
                      };
                    });
                  }
                } catch {}
              }

              // Don't break here; continue to remove any other related folders (e.g., Base + Variant)
            }
            lastErr = result?.error || lastErr;
            try { console.debug('[UNINSTALL] Failed ' + JSON.stringify({ opts, error: result?.error })); } catch { console.debug('[UNINSTALL] Failed'); }
          } catch (e) {
            lastErr = e?.message || String(e);
            try { console.warn('[UNINSTALL] Exception ' + JSON.stringify({ opts, error: String(lastErr) })); } catch { console.warn('[UNINSTALL] Exception'); }
          }
        }
        // continue trying other folders in this path
      }
      // If we removed anything from this Community path, stop; we only target the chosen sim path
      if (successCount > 0) {
        // Stop after first successful sim uninstall to keep operations independent
        break;
      }
    }

  setStatus(success ? `${aircraft.name} uninstalled. Downloaded ZIPs are still available for reinstall.` : `Uninstall error: ${lastErr || 'Could not uninstall'}`);
  // Maintain / clear last-installed-sim key
  try {
    if (success && removedSimTag) {
      const key = `sws_lastInstallSim_${aircraft.id}`;
      const cur = localStorage.getItem(key);
      if (cur === removedSimTag) {
        const otherSimTag = removedSimTag === 'FS2020' ? 'FS2024' : 'FS2020';
        const removedPathNorm = removedSimTag === 'FS2020' ? normalizePath(installPath2020) : normalizePath(installPath2024);
        const otherPath = otherSimTag === 'FS2020' ? installPath2020 : installPath2024;
        const otherPathNorm = normalizePath(otherPath);
        let otherStillInstalled = false;
        if (otherPathNorm && otherPathNorm !== removedPathNorm) {
          // If the other sim used a different Community path & was installed before, treat it as still installed
          otherStillInstalled = installedBefore.some(p => p === otherPathNorm);
        }
        if (otherStillInstalled) {
          localStorage.setItem(key, otherSimTag);
        } else {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {}
  // Defer re-scan for uninstall as well to prevent a brief re-add from a stale scan
  setTimeout(() => refreshInstalledLists(), 400);
  setTimeout(() => refreshInstalledLists(), 1200);
  return { success };
  });

  // Replace handleSelectFolder with a guarded, preload-only version
  const handleSelectFolder = async (type, currentPath) => {
  try {
    // Use the top-level waiter
    await waitForElectronBridge();

    if (!window.electron || typeof window.electron.selectFolder !== 'function') {
      setStatus('Folder selection is only available in the desktop app.');
      return;
    }

      const selectedPath = await window.electron.selectFolder(currentPath || '');
    if (!selectedPath) {
      setStatus('No folder selected.');
      return;
    }

      // Normalize: if the user picked a parent (Packages, Official/OneStore, Content), resolve to the Community folder
      function resolveCommunityPath(p) {
        try {
          const raw = String(p || '').trim();
          if (!raw) return raw;
          const parts = raw.split(/[/\\]+/).filter(Boolean);
          const tail = (parts[parts.length - 1] || '').toLowerCase();
          const join = (...xs) => xs.join(parts.includes('\\\\') ? '\\' : '/');
          // If already ends with Community, keep as-is
          if (tail === 'community') return raw;
          // If ends with Packages -> append Community
          if (tail === 'packages') return raw.replace(/[\\/]+$/, '') + (raw.endsWith('\\') || raw.endsWith('/') ? '' : (raw.includes('\\') ? '\\' : '/')) + 'Community';
          // If ends with OneStore or Official -> go up to Packages then Community
          if (tail === 'onestore' || tail === 'official') {
            // Find nearest 'Packages' up the path
            let idx = parts.length - 1;
            while (idx >= 0 && parts[idx].toLowerCase() !== 'packages') idx--;
            if (idx >= 0) {
              const upto = parts.slice(0, idx + 1); // include Packages
              const sep = raw.includes('\\') ? '\\' : '/';
              return upto.join(sep) + sep + 'Community';
            }
          }
          // Xbox PC path style: .../Microsoft Flight Simulator/Content -> Content/Community
          if (tail === 'content') {
            const sep = raw.includes('\\') ? '\\' : '/';
            return raw.replace(/[\\/]+$/, '') + sep + 'Community';
          }
          return raw; // fallback unchanged
        } catch { return p; }
      }
      let normalizedPath = resolveCommunityPath(selectedPath);
      // If we adjusted the path, confirm with the user
      if (normalizedPath !== selectedPath) {
        const ok = window.confirm(
          `Use this Community folder?\n\n${normalizedPath}\n\n(You selected a parent folder: ${selectedPath})`
        );
        if (!ok) normalizedPath = selectedPath; // honor user's choice if they want the parent
      }

      if (type === 'FS2020') {
        setInstallPath2020(normalizedPath);
        setInstallPath2020Source('Manual');
        localStorage.setItem('sws_installPath2020', normalizedPath);
        try { await window.electron.setSavedInstallPath2020?.(normalizedPath); } catch {}
      } else if (type === 'FS2024') {
        setInstallPath2024(normalizedPath);
        setInstallPath2024Source('Manual');
        localStorage.setItem('sws_installPath2024', normalizedPath);
        try { await window.electron.setSavedInstallPath2024?.(normalizedPath); } catch {}
      }


    // Refresh installed list for the chosen path
    await refreshInstalledLists();
  } catch (err) {
    setStatus(`Error selecting folder: ${err.message || 'Electron bridge not available'}`);
  }
};

// ---------- Installed mapping + refresh (moved up to avoid TDZ) ----------
  // Throttle noisy scan logs for unmatched installed items
  const unmatchedScanRef = useRef({ seen: new Set(), total: 0, suppressed: 0 });
  const mapInstalled = useCallback((list = [], sourcePath = '') => {
    const norm = s => String(s || '').toLowerCase().trim();
    const simple = s => norm(s).replace(/[^a-z0-9]+/g, '');
    const byId = new Map(ownedAircraft.map(p => [p.id, p]));
    const byName = new Map(ownedAircraft.map(p => [norm(p.name), p]));
    // Map simplified product folder names (bunny.folder, altFolders, component folders)
    // to products so we can match by manifest packageName
    const byProductFolder = new Map();
    for (const p of ownedAircraft) {
      const b = p.bunny || {};
      const folders = [
        b.folder,
        ...(b.altFolders || []),
        ...(b.components || p.components || []).flatMap(c => [c.folder, ...(c.altFolders || [])])
      ].filter(Boolean);
      for (const f of folders) {
        const key = simple(f);
        if (key && !byProductFolder.has(key)) byProductFolder.set(key, p);
      }
    }
    // Load persisted folder->id mapping (JSON in localStorage) per base path
    let folderIdMap = {};
    try { folderIdMap = JSON.parse(localStorage.getItem('sws_folderIdMap') || '{}') || {}; } catch { folderIdMap = {}; }
    const pathKey = normalizePath(sourcePath) || '';
    const pathMap = folderIdMap[pathKey] || {};

    return (list || []).map(item => {
      if (!item) return item;
      if (!item.folder) item.folder = item.name;
      const itemSimple = simple(item.folder);
      const itemNameNorm = norm(item.name);
      let match = null;
      // 1. Direct id present
      if (item.id && byId.has(item.id)) match = byId.get(item.id);
      // 2. Existing persistent mapping
      if (!match) {
        const mappedId = pathMap[itemSimple];
        if (mappedId && byId.has(mappedId)) match = byId.get(mappedId);
      }
      // 3. Exact name match (legacy installs might have same name)
      if (!match && byName.has(itemNameNorm)) match = byName.get(itemNameNorm);
      // 3.5 Match by manifest packageName against known product folder names
      //     (handles third-party installs like Addon Linker where folderIdMap is absent)
      if (!match && item.packageName) {
        const pkgKey = simple(item.packageName);
        if (pkgKey && byProductFolder.has(pkgKey)) match = byProductFolder.get(pkgKey);
      }
      // 4. Heuristic inference (one-time) ONLY if no match yet
      if (!match) {
        match = ownedAircraft.find(p => heuristicMatchItemToProduct(item, p)) || null;
        // Persist mapping if we found a heuristic match so future runs are strict id based
        if (match) {
          if (!folderIdMap[pathKey]) folderIdMap[pathKey] = {};
          folderIdMap[pathKey][itemSimple] = match.id;
          try { localStorage.setItem('sws_folderIdMap', JSON.stringify(folderIdMap)); } catch {}
        }
      }

      // Build mapped record with normalized communityPath and attach matched id/bunny if found
      const ret = {
        ...item,
        communityPath: normalizePath(sourcePath),
        ...(match ? { id: match.id, bunny: match.bunny } : {})
      };
      if (!match) {
        try {
          const ref = unmatchedScanRef.current;
            ref.total++;
            const key = `${normalizePath(sourcePath)}|${item.folder}`;
            if (!ref.seen.has(key)) {
              ref.seen.add(key);
              // Log first 30 unique unmatched items verbosely
              ref.suppressed++;
            } else {
              // Already seen; silently suppress
              ref.suppressed++;
            }
        } catch { /* ignore logging errors */ }
      }
      return ret;
    });
  }, [ownedAircraft]);

  const refreshInstalledLists = useCallback(async () => {
    try { await waitForElectronBridge(); } catch { return; }
    const byId = new Map(ownedAircraft.map(p => [p.id, p]));
    const combined = [];
    if (installPath2020) {
      try {
        const list20 = await window.electron.listAircraft(installPath2020);
        const mapped20 = mapInstalled(list20, installPath2020).map(it => {
          const owned = it.id != null ? byId.get(it.id) : null;
          let out = it;
          if (it.id) {
            try {
              const vz = localStorage.getItem(`sws_variant_${it.id}_FS2020`);
              const ch = localStorage.getItem(`sws_channel_${it.id}_FS2020`);
              const vv = localStorage.getItem(`sws_version_${it.id}_FS2020`);
              // Use localStorage only as fallback
              if (ch && !out.installedChannel) out = { ...out, installedChannel: ch };
              if (vz && !out.variantZip)       out = { ...out, variantZip: vz };
              if (vv) {
                const cur = String(out.version || '').trim();
                const st = String(vv || '').trim();
                if (!cur || compareVersionsNormalized(st, cur) > 0) out = { ...out, version: st };
              }
            } catch {}
          }
          if (!out.variantZip) {
            const z = inferVariantZipFromItem(out, out);
            if (z) out = { ...out, variantZip: z };
          }
          try {
            if (it.id && !out.installedChannel) {
              const aliasIds = owned?.aliasIds || [];
              const aliasOf = owned?.bunny?.aliasOf != null ? owned.bunny.aliasOf : null;
              const dlPublic = readDlCache(it.id, 'FS2020', 'Public', { aliasIds, aliasOf }) || null;
              const dlBeta = readDlCache(it.id, 'FS2020', 'Beta', { aliasIds, aliasOf }) || null;
              const vbase = zipBase(String(out.variantZip || '').toLowerCase());
              let chan = '';
              for (const dl of [dlPublic, dlBeta]) {
                if (dl && vbase) {
                  // Prefer exact variant match in cache
                  if (dl.variants && typeof dl.variants === 'object') {
                    const vrec = dl.variants[vbase] || Object.values(dl.variants).find(r => zipBase(String(r?.variantZip || '')) === vbase);
                    if (vrec && typeof vrec.channel === 'string') chan = vrec.channel;
                  }
                  // Fallback: base zip match
                  if (!chan) {
                    const b = zipBase(String(dl.baseZip || ''));
                    if (b && b === vbase && typeof dl.channel === 'string') chan = dl.channel;
                  }
                }
                if (chan) break;
              }
              if (chan) out = { ...out, installedChannel: chan };
            }
          } catch {}
          // Last-resort heuristic: if the inferred variant filename suggests Beta, mark as Beta
          try {
            if (!out.installedChannel && /beta/i.test(String(out.variantZip || ''))) {
              out = { ...out, installedChannel: 'Beta' };
            }
          } catch {}
          if (!out.installedChannel) out = { ...out, installedChannel: 'Public' };
          return out;
        });
        combined.push(...mapped20);
      } catch {}
    }
    if (installPath2024) {
      try {
        const list24 = await window.electron.listAircraft(installPath2024);
        const mapped24 = mapInstalled(list24, installPath2024).map(it => {
          const owned = it.id != null ? byId.get(it.id) : null;
          let out = it;
          if (it.id) {
            try {
              const vz = localStorage.getItem(`sws_variant_${it.id}_FS2024`);
              const ch = localStorage.getItem(`sws_channel_${it.id}_FS2024`);
              const vv = localStorage.getItem(`sws_version_${it.id}_FS2024`);
              // Use localStorage only as fallback
              if (ch && !out.installedChannel) out = { ...out, installedChannel: ch };
              if (vz && !out.variantZip)       out = { ...out, variantZip: vz };
              if (vv) {
                const cur = String(out.version || '').trim();
                const st = String(vv || '').trim();
                if (!cur || compareVersionsNormalized(st, cur) > 0) out = { ...out, version: st };
              }
            } catch {}
          }
          if (!out.variantZip) {
            const z = inferVariantZipFromItem(out, out);
            if (z) out = { ...out, variantZip: z };
          }
          try {
            if (it.id && !out.installedChannel) {
              const aliasIds = owned?.aliasIds || [];
              const aliasOf = owned?.bunny?.aliasOf != null ? owned.bunny.aliasOf : null;
              const dlPublic = readDlCache(it.id, 'FS2024', 'Public', { aliasIds, aliasOf }) || null;
              const dlBeta = readDlCache(it.id, 'FS2024', 'Beta', { aliasIds, aliasOf }) || null;
              const vbase = zipBase(String(out.variantZip || '').toLowerCase());
              let chan = '';
              for (const dl of [dlPublic, dlBeta]) {
                if (dl && vbase) {
                  if (dl.variants && typeof dl.variants === 'object') {
                    const vrec = dl.variants[vbase] || Object.values(dl.variants).find(r => zipBase(String(r?.variantZip || '')) === vbase);
                    if (vrec && typeof vrec.channel === 'string') chan = vrec.channel;
                  }
                  if (!chan) {
                    const b = zipBase(String(dl.baseZip || ''));
                    if (b && b === vbase && typeof dl.channel === 'string') chan = dl.channel;
                  }
                }
                if (chan) break;
              }
              if (chan) out = { ...out, installedChannel: chan };
            }
          } catch {}
          // Last-resort heuristic: if the inferred variant filename suggests Beta, mark as Beta
          try {
            if (!out.installedChannel && /beta/i.test(String(out.variantZip || ''))) {
              out = { ...out, installedChannel: 'Beta' };
            }
          } catch {}
          if (!out.installedChannel) out = { ...out, installedChannel: 'Public' };
          return out;
        });
        combined.push(...mapped24);
      } catch {}
    }
    // Merge new scan results with any existing entries
    setAircraftList(prev => {
      const scannedPaths = new Set(
        [installPath2020, installPath2024].filter(Boolean).map(normalizePath)
      );

      // Keys of items found in the current scan
      const combinedKeys = new Set(
        (combined || []).map(it =>
          `${it.id ?? it.name}|${normalizePath(it.communityPath || '')}`
        )
      );

      // Keep previous entries that are NOT in scanned Community paths,
      // or that are still present in the new scan (drop stale ones).
      const prevFiltered = (prev || []).filter(a => {
        const cp = normalizePath(a.communityPath || '');
        if (!scannedPaths.has(cp)) return true; // keep entries from other paths
        const key = `${a.id ?? a.name}|${cp}`;
        return combinedKeys.has(key); // keep only if scan still sees it
      });

      // Merge: previous (filtered) + new scan (new values overwrite)
      const byKey = new Map(
        prevFiltered.map(a => [
          `${a.id ?? a.name}|${normalizePath(a.communityPath || '')}`,
          a
        ])
      );
      (combined || []).forEach(it => {
        const key = `${it.id ?? it.name}|${normalizePath(it.communityPath || '')}`;
        const existing = byKey.get(key) || {};
        byKey.set(key, { ...existing, ...it });
      });

      return Array.from(byKey.values());
    });
  }, [installPath2020, installPath2024, mapInstalled]);



  // Download handler (stream to disk via electron, track progress, and record per-sim)
  const handleDownload = async (product, downloadUrl, simTag, channel, _versionStr, variantZip) => {
    if (!product || !downloadUrl) return null;
    // If Cancel was requested before we began, bail immediately
    if (appCancelRef.current) {
  setStatus('Download canceled');
      setCancelFlash(true);
  setTimeout(() => { setCancelFlash(false); setProgress(null); }, 800);
      setDownloadProgress(null);
      return null;
    }
    try {
  setStatus(`Downloading ${product.name} [${simTag}, ${channel}]...`);
      setDownloadingId(product.id);
  try { setActiveDlSim(simTag); } catch {}
      setProgress(0);
      setDownloadProgress(0);

      const fileName = downloadUrl.split('/').pop().split('?')[0] || `${product.id}.zip`;
      const encAtRest = (localStorage.getItem('sws_encrypt_downloads') === '1');
      // Save path relative to chosen downloads directory.
      // Primary: derive from actual Bunny URL to mirror exactly: <bucket>/<channel>/<...folder...>/<file>
      // Fallback: use mapping-based mirror when URL parsing fails or is non-standard.
      const simKey = String(simTag || '').replace(/^FS/i, '') || '2020';
      const chanSafe = (channel && String(channel).trim()) ? String(channel).trim() : 'Public';
      let relPath = '';
      try {
        const u = new URL(downloadUrl);
        // Example pathname: /2020/Public/AIRCRAFT-SWS-PC12Legacy/sws-aircraft-pc12.zip
        const parts = u.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
        // Expect at least bucket + channel + file; usually there is a folder segment too
        const bucketFromUrl = parts[0] || '';
        const channelFromUrl = parts[1] || '';
        const fileFromUrl = parts.length ? (parts[parts.length - 1]) : fileName;
        const folderFromUrl = parts.slice(2, Math.max(2, parts.length - 1)).join('/'); // everything after bucket/channel up to file
        if (bucketFromUrl && channelFromUrl && fileFromUrl) {
          const basePath = [bucketFromUrl, channelFromUrl].concat(folderFromUrl ? [folderFromUrl] : []).join('/');
          relPath = `${basePath}/${fileFromUrl}${encAtRest ? '.enc' : ''}`;
        }
      } catch {}
      if (!relPath) {
        // Fallback to mapping mirror: <bucket>/<channel>/<BUNNY_FOLDER>/<file>
        const bucket = (typeof cdnBucketForSim === 'function') ? cdnBucketForSim(product, simKey) : simKey;
        const folderName = (product?.bunny?.folder && String(product.bunny.folder).trim())
          || simple(product?.name || '')
          || String(product.id);
        relPath = `${bucket}/${chanSafe}/${folderName}/${fileName}${encAtRest ? '.enc' : ''}`;
      }
      try {
        console.debug('[DOWNLOAD:plan] ' + JSON.stringify({
          product: product.name,
          id: product.id,
          simTag,
          channel: chanSafe,
          fileName,
          encAtRest,
          relPath,
          urlPath: (() => { try { return new URL(downloadUrl).pathname; } catch { return ''; } })()
        }));
      } catch {}

      let savedFullPath = '';
  // Prefer native resumable downloader via IPC when available, unless explicitly forced to use renderer fetch
  const forceRendererFetch = (localStorage.getItem('sws_use_renderer_fetch') === '1');
  if (window.electron?.downloadsFetchUrl && !forceRendererFetch) {
        const contextToken = `dl:${product.id}:${simTag}:${channel}:${fileName}:${Date.now()}`;
  // progress wiring
  let unsub = null;
  // Track last sample to compute speed for IPC progress events
  let lastT = performance.now();
  let lastB = 0;
  let lastPct = null;
        try {
          if (window.electron.onDownloadProgress) {
            unsub = window.electron.onDownloadProgress(({ context, pct, received, total }) => {
              if (context !== contextToken) return;
              try {
                const b = batchRef?.current;
                // Compute a single display percentage to use for both status and bar
                let displayPct;
                if (b && b.active && b.simTag === simTag && b.total > 0) {
                  // In batch, onDownloadProgress is per-file; approximate aggregation using pct within this item
                  const agg = Math.round(((b.index) + (pct / 100)) / b.total * 100);
                  displayPct = Math.max(0, Math.min(100, agg));
                } else {
                  displayPct = Math.max(0, Math.min(100, Math.round(pct)));
                }
                setDownloadProgress(displayPct);
                setProgress(displayPct);
                // Update status with speed only (not percent)
                const now = performance.now();
                const dt = (now - lastT) / 1000;
                // Estimate received if bridge doesn't provide it
                let estReceived = (typeof received === 'number') ? received : null;
                if (estReceived == null && typeof total === 'number' && typeof pct === 'number') {
                  estReceived = Math.max(0, Math.min(total, Math.round((pct / 100) * total)));
                }
                let dB = 0;
                if (estReceived != null) {
                  dB = Math.max(0, estReceived - (lastB || 0));
                } else if (typeof total === 'number' && total > 0 && typeof pct === 'number' && lastPct != null) {
                  const dPct = Math.max(0, pct - lastPct);
                  dB = Math.max(0, Math.round((dPct / 100) * total));
                }
                if (dt >= 0.3 && dB > 0) {
                  const speed = dB / dt; // bytes/s
                  setStatus(`Downloading ${product.name} [${simTag}, ${channel}] — ${formatSpeed(speed)}`);
                  lastT = now;
                  if (estReceived != null) lastB = estReceived;
                  if (typeof pct === 'number') lastPct = pct;
                } else {
                  if (typeof pct === 'number') lastPct = pct;
                }
                // Update download queue banner with byte-level progress
                // pct = per-file, displayPct = overall (batch-aggregated)
                try {
                  const filePct = Math.max(0, Math.min(100, Math.round(pct)));
                  const recMB = (estReceived != null) ? +(estReceived / (1024 * 1024)).toFixed(1) : null;
                  const totMB = (typeof total === 'number' && total > 0) ? +(total / (1024 * 1024)).toFixed(0) : null;
                  const curSpeed = (dt >= 0.3 && dB > 0) ? (dB / dt) : undefined;
                  setDownloadQueueInfo && setDownloadQueueInfo(prev => {
                    if (!prev) return prev;
                    return { ...prev, overallPct: displayPct, current: { ...prev.current, pct: filePct, receivedMB: recMB, totalMB: totMB, ...(curSpeed !== undefined ? { speed: curSpeed } : {}) } };
                  });
                } catch {}
              } catch {}
            });
          }
        } catch {}
        downloadAbortRef.current = { controller: null, productId: product.id, simTag, channel, context: contextToken };
        const resp = await window.electron.downloadsFetchUrl(relPath, addCacheBust(downloadUrl), encAtRest, contextToken);
        if (!resp || resp.success === false || !resp.fullPath) {
          throw new Error(resp?.error || 'download could not complete');
        }
        savedFullPath = resp.fullPath;
        try { unsub && unsub(); } catch {}
      } else {
        // Fallback: fetch in renderer and save via old bridge (no resume)
        const ctrl = new AbortController();
        downloadAbortRef.current = { controller: ctrl, productId: product.id, simTag, channel };
        const res = await fetch(addCacheBust(downloadUrl), { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const total = Number(res.headers.get('Content-Length')) || 0;
        const reader = res.body?.getReader();
        const chunks = [];
        let received = 0;
        let lastT = performance.now();
        let lastB = 0;
        if (reader) {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.length;
              const now = performance.now();
              const dt = (now - lastT) / 1000;
              const dB = received - lastB;
              if (total > 0) {
                const filePctRaw = Math.round((received / total) * 100);
                let displayPct = Math.max(0, Math.min(100, filePctRaw));
                try {
                  const b = batchRef?.current;
                  if (b && b.active && b.simTag === simTag && b.total > 0) {
                    const agg = Math.round(((b.index) + (displayPct / 100)) / b.total * 100);
                    displayPct = Math.max(0, Math.min(100, agg));
                  }
                } catch {}
                setDownloadProgress(displayPct);
                setProgress(displayPct);
              }
              if (dt >= 0.3 && dB > 0) {
                const speed = dB / dt; // bytes/s
                const suffix = ` — ${formatSpeed(speed)}`;
                // Status shows speed only (percent is reserved for the banner overlay)
                setStatus(`Downloading ${product.name} [${simTag}, ${channel}]${suffix}`);
                lastT = now;
                lastB = received;
              }
              // Update download queue banner with byte-level progress
              try {
                const recMB = +(received / (1024 * 1024)).toFixed(1);
                const totMB = (total > 0) ? +(total / (1024 * 1024)).toFixed(0) : null;
                const filePct = (total > 0) ? Math.round((received / total) * 100) : 0;
                const curSpeed = (dt >= 0.3 && dB > 0) ? (dB / dt) : undefined;
                setDownloadQueueInfo && setDownloadQueueInfo(prev => {
                  if (!prev) return prev;
                  return { ...prev, overallPct: displayPct, current: { ...prev.current, pct: filePct, receivedMB: recMB, totalMB: totMB, ...(curSpeed !== undefined ? { speed: curSpeed } : {}) } };
                });
              } catch {}
            }
          }
        } else {
          const blob = await res.blob();
          const ab = await blob.arrayBuffer();
          chunks.push(new Uint8Array(ab));
        }
        const size = chunks.reduce((n, c) => n + c.length, 0);
        const buf = new Uint8Array(size);
        let off = 0; for (const c of chunks) { buf.set(c, off); off += c.length; }
        if (!window.electron || (!window.electron.downloadsSave && !window.electron.saveFile && !window.electron.saveFileEx)) {
          throw new Error('Save bridge unavailable (preload not ready)');
        }
        let savedResp = null;
        if (window.electron.downloadsSave) {
          savedResp = await window.electron.downloadsSave(relPath, buf, encAtRest);
        } else if (encAtRest && window.electron?.saveFileEx) {
          savedResp = await window.electron.saveFileEx(`downloads/${relPath}`, buf, true);
        } else {
          savedResp = await window.electron.saveFile(`downloads/${relPath}`, buf);
        }
        savedFullPath = typeof savedResp === 'string' ? savedResp : (savedResp?.fullPath || savedResp?.path || savedResp?.absolutePath || '');
        const ok = typeof savedResp === 'string' ? !!savedResp : !!savedResp && savedResp.success !== false && !savedResp.error;
  if (!ok || !savedFullPath) throw new Error((savedResp && savedResp.error) || 'saveFile failed');
      }

  // If user canceled during or right after download, stop here and do not record/persist
  if (appCancelRef.current) {
  setStatus('Download canceled');
        setCancelFlash(true);
  setTimeout(() => { setCancelFlash(false); setProgress(null); }, 800);
        setDownloadProgress(null);
        return null;
      } else {
        // In batch mode, do not finalize overlay per file; batch runner will finalize at the end
        if (!(batchRef.current?.active && batchRef.current.simTag === simTag)) {
          setStatus(`Ready to install ${product.name} [${simTag}]`);
          setProgress(100);
          setDownloadProgress(100);
          // Clear overlay and downloadProgress shortly after showing 100%
          setTimeout(() => { try { setProgress(null); } catch {} }, 1200);
          setTimeout(() => { try { setDownloadProgress(null); } catch {} }, 1200);
        }
      }

    // record per-sim download (used by Install button), preserving any base download info
      if (appCancelRef.current) {
        // If cancel was requested after save, skip persisting state/cache
        return null;
      }
      const isBaseOnly = (variantZip === '__BASE_ONLY__');
      const fileNameOnly = fileName;
      const downloadedAtTs = Date.now();
      let downloadedVersion = '';
      try {
        downloadedVersion = String(getRemoteVerForSim(simTag) || '').trim();
        if (!downloadedVersion) {
          const m = String((variantZip && variantZip !== '' ? variantZip : fileNameOnly) || '').match(/([0-9]+(?:\.[0-9]+){1,3})/);
          downloadedVersion = m ? m[1] : '';
        }
      } catch {}
      setDownloadedFiles(prev => {
        const prevRec = prev[product.id] || { id: product.id, sims: {} };
        const simRec = prevRec.sims?.[simTag] || {};
        let nextSimRec;
        if (isBaseOnly) {
          nextSimRec = { ...simRec, baseLocalPath: savedFullPath, baseZip: fileNameOnly, channel };
        } else {
          const key = zipBase((variantZip && variantZip !== '' ? variantZip : fileNameOnly) || '');
          const variants = { ...(simRec.variants || {}) };
          variants[key] = {
            localPath: savedFullPath,
            channel,
            variantZip: (variantZip && variantZip !== '') ? variantZip : fileNameOnly,
            downloadedAt: downloadedAtTs,
            version: downloadedVersion
          };
          // Keep legacy fields pointing to the most recently downloaded variant for backward compatibility
          nextSimRec = {
            ...simRec,
            variants,
            localPath: savedFullPath,
            channel,
            variantZip: (variantZip && variantZip !== '') ? variantZip : fileNameOnly,
            downloadedAt: downloadedAtTs,
            version: downloadedVersion || simRec.version || ''
          };
          // If this variant is the base package, also record baseLocalPath/baseZip for readiness
          try {
            const simKey = simTag.replace('FS','');
            const baseZipName = getBaseZipForSim(product, simKey);
            if (baseZipName && zipBase(baseZipName) === key) {
              nextSimRec.baseLocalPath = savedFullPath;
              nextSimRec.baseZip = fileNameOnly;
            }
          } catch {}
        }
        return {
          ...prev,
          [product.id]: {
            ...prevRec,
            sims: {
              ...prevRec.sims,
              [simTag]: nextSimRec
            }
          }
        };
      });

      // persist to local cache as well
      if (isBaseOnly) {
        writeDlCache(product.id, simTag, { baseLocalPath: savedFullPath, baseZip: fileNameOnly, channel }, channel);
      } else {
        const key = zipBase((variantZip && variantZip !== '' ? variantZip : fileNameOnly) || '');
        const prev = readDlCache(product.id, simTag, channel) || {};
        const variants = { ...(prev.variants || {}) };
        variants[key] = {
          localPath: savedFullPath,
          channel,
          variantZip: (variantZip && variantZip !== '') ? variantZip : fileNameOnly,
          downloadedAt: downloadedAtTs,
          version: downloadedVersion
        };
        const patch = {
          variants,
          // keep legacy pointers updated as well
          localPath: savedFullPath,
          channel,
          variantZip: (variantZip && variantZip !== '') ? variantZip : fileNameOnly,
          downloadedAt: downloadedAtTs,
          version: downloadedVersion || prev.version || ''
        };
        // If this variant is the base package, also record baseLocalPath/baseZip
        try {
          const simKey = simTag.replace('FS','');
          const baseZipName = getBaseZipForSim(product, simKey);
          if (baseZipName && zipBase(baseZipName) === key) {
            patch.baseLocalPath = savedFullPath;
            patch.baseZip = fileNameOnly;
          }
        } catch {}
        writeDlCache(product.id, simTag, patch, channel);
      }

  return savedFullPath;
  } catch (e) {
      if (e?.name === 'AbortError') {
  setStatus('Download canceled');
        // show a brief red flash in the progress overlay and then clear it
        setCancelFlash(true);
        // keep the last progress visible during flash; clear after
  setTimeout(() => { setCancelFlash(false); setProgress(null); }, 800);
      } else {
  setStatus(`Couldn't complete download (${simTag}, ${channel}): ${e?.message || String(e)}`);
      }
      setDownloadProgress(null);
      return null;
    } finally {
      // Keep downloadingId while batch is active; batch finalizer will clear it
      if (!(batchRef.current?.active && batchRef.current.simTag === simTag)) {
        setDownloadingId(null);
        try { setActiveDlSim(null); } catch {}
      }
      downloadAbortRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    try {
      const ctx = downloadAbortRef.current;
      const c = ctx?.controller;
      if (c) c.abort();
      // If using resumable downloader, signal cancel via IPC
      try {
        if (!c && ctx?.context && window.electron?.downloadsCancel) {
          window.electron.downloadsCancel(ctx.context);
        }
      } catch {}
  appCancelRef.current = true;
  // Clear any active batch immediately for clean UI state
  if (batchRef.current?.active) {
    batchRef.current = { active: false, total: 0, index: 0, simTag: null };
  }
  // Immediate feedback; abort catch will also set the same
  setStatus('Download canceled');
  setCancelFlash(true);
  // Clear downloading state if we canceled before actual download started
  setDownloadingId(null);
  try { setActiveDlSim(null); } catch {}
  // Clear download queue banner and progress
  try { setDownloadQueueInfo(null); } catch {}
  try { setDownloadProgress(null); } catch {}
  // let the overlay flash briefly, then hide
  // Note: the finally block in downloadAllForSim will handle processing the next queued item
  setTimeout(() => { setCancelFlash(false); setProgress(null); }, 800);
    } catch {}
  };

  // --- Multi-product download queue helpers ---
  // Called from a card when user clicks download while another product is active.
  // Adds the product to the pending queue and updates the banner "Next" list.
  const enqueueDownload = useCallback((product, simTag, channel) => {
    const entry = { productId: product.id, product, simTag, channel, name: product.name };
    pendingDownloadQueueRef.current = [...pendingDownloadQueueRef.current, entry];
    setPendingDownloadQueue([...pendingDownloadQueueRef.current]);
    // Update banner "next" list
    setDownloadQueueInfo(prev => {
      if (!prev) return prev;
      const next = [...(prev.next || []), { name: product.name, version: '', channel }];
      return { ...prev, next, queueTotal: (prev.queueTotal || 1) + 1 };
    });
  }, []);

  // Remove a product from the pending queue
  const dequeueDownload = useCallback((productId) => {
    pendingDownloadQueueRef.current = pendingDownloadQueueRef.current.filter(q => q.productId !== productId);
    setPendingDownloadQueue([...pendingDownloadQueueRef.current]);
    // Update banner "next" list
    setDownloadQueueInfo(prev => {
      if (!prev) return prev;
      const remaining = pendingDownloadQueueRef.current;
      const next = remaining.map(q => ({ name: q.name || q.product?.name || '', version: '', channel: q.channel }));
      return { ...prev, next, queueTotal: Math.max(1, (prev.queueTotal || 1) - 1) };
    });
    // Notify the card to clear its queued download ref (prevents stale timeout from firing)
    try { window.dispatchEvent(new CustomEvent('sws-queue-dequeue', { detail: { productId } })); } catch {}
  }, []);

  // Called when a card's downloadAllForSim finishes. Starts the next queued product.
  // We store a ref to a callback that cards can invoke; the callback is resolved by the App.
  const processNextDownloadRef = useRef(null);
  processNextDownloadRef.current = () => {
    if (pendingDownloadQueueRef.current.length === 0) return false;
    const next = pendingDownloadQueueRef.current[0];
    pendingDownloadQueueRef.current = pendingDownloadQueueRef.current.slice(1);
    setPendingDownloadQueue([...pendingDownloadQueueRef.current]);
    // Update banner "next" list immediately so the count is accurate
    const remaining = pendingDownloadQueueRef.current;
    setDownloadQueueInfo(prev => {
      const nextList = remaining.map(q => ({ name: q.name || q.product?.name || '', version: '', channel: q.channel }));
      // Set the about-to-start product as current; advance queue index
      return {
        current: { name: next.name || next.product?.name || '', version: '', channel: next.channel, pct: 0, receivedMB: 0, totalMB: null },
        overallPct: 0,
        queueIndex: (prev?.queueIndex ?? 0) + 1,
        queueTotal: prev?.queueTotal || (1 + nextList.length),
        next: nextList
      };
    });
    // Trigger the download for the next product via a custom event
    // The target card will pick this up and start its download
    try {
      window.dispatchEvent(new CustomEvent('sws-queue-download', { detail: next }));
    } catch {}
    return true;
  };

  // Reset cached downloads
  const handleResetDownloads = async () => {
    try {
      if (window.electron?.clearDownloadsDir) await window.electron.clearDownloadsDir();
  clearAllDlCache();
      setDownloadedFiles({});
  setStatus('Download cache deleted.');
      setProgress(null);
      setDownloadProgress(null);
    } catch (e) {
  setStatus(`Cache delete error: ${e.message}`);
    }
  };

  // Delete ALL installed packages across both sims (uninstall from Community) and delete their extracted install cache.
  // Keeps downloaded ZIPs intact.
  const handleDeleteInstalledAll = async () => {
    try {
      await waitForElectronBridge();
      const proceed = window.confirm(
        'This will uninstall ALL installed SWS packages from both FS2020 and FS2024 Community folders and delete their extracted install cache. Downloaded ZIPs will be kept. Continue?'
      );
      if (!proceed) return;

      // Snapshot list to operate on (avoid mutating while iterating)
      const list = Array.isArray(aircraftList) ? aircraftList.slice() : [];
      // Restrict to SWS-owned products (present in your library)
      const ownedIdSet = new Set((ownedAircraft || []).map(p => p.id));
      // Deduplicate by Community path + folder/name
      const seen = new Set();
      const unique = list.filter(it => {
        const folder = String(it?.folder || it?.name || '').trim();
        const key = `${normalizePath(it?.communityPath || '')}|${folder}`;
        if (!folder || !it?.communityPath) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        // Only delete for products we recognize as SWS-owned
        return (it?.id != null) && ownedIdSet.has(it.id);
      });

      // Collect extract targets first, then uninstall, then delete caches
      const extractTargets = new Set();
      for (const it of unique) {
        try {
          const installPath = normalizePath(it.communityPath);
          const folder = String(it.folder || it.name || '').trim();
          if (installPath && folder && window.electron?.getPackageRealPath) {
            const info = await window.electron.getPackageRealPath(installPath, folder);
            const cand = info?.extractRoot || info?.realDir;
            if (cand) extractTargets.add(cand);
          }
        } catch {}
        // Fallback probe by folder name
        try {
          const folder = String(it.folder || it.name || '').trim();
          if (folder && window.electron?.findExtractDirForFolder) {
            const guess = await window.electron.findExtractDirForFolder(folder);
            if (guess?.success && guess?.extractRoot) extractTargets.add(guess.extractRoot);
          }
        } catch {}
      }

      // Uninstall from Community for each entry
      for (const it of unique) {
        try {
          await handleUninstall(it);
        } catch {}
      }

      // Delete captured extract cache directories
      for (const dir of extractTargets) {
        try { if (dir && window.electron?.deleteFile) await window.electron.deleteFile(dir); } catch {}
      }

      setStatus('All installed SWS packages uninstalled and their install cache deleted. Downloads kept.');
      // Refresh installed lists after bulk ops
      setTimeout(() => refreshInstalledLists(), 400);
      setTimeout(() => refreshInstalledLists(), 1200);
    } catch (e) {
      setStatus('Bulk delete installed failed: ' + (e?.message || String(e)));
    }
  };

  // Dynamic sidebar width: collapsed rail when logged out
  const sidebarWidth = token ? 220 : 0;

  return (
    <div style={{ background: '#1f2c3b', fontFamily: 'Inter, Segoe UI, Arial, sans-serif' }}>
      {/* App update banner */}
      {appUpdateAvailable && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: appUpdateDownloaded ? '#2e7d32' : '#4c5f9d',
          color: '#fff', padding: '8px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 14, fontSize: 14, fontWeight: 600,
          boxShadow: 'none',
        }}>
          {appUpdateDownloaded ? (
            <>
              <span>SWS Installer v{appUpdateAvailable.version} is ready to install</span>
              <button onClick={() => { try { window.electron?.installAppUpdate(); } catch {} }} style={{
                background: '#fff', color: '#2e7d32', border: 'none', borderRadius: 5,
                padding: '5px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13,
              }}>Restart &amp; Update</button>
              <button onClick={() => { setAppUpdateAvailable(null); setAppUpdateDownloaded(false); }} style={{
                background: 'transparent', color: '#fffc', border: '1px solid #fff6', borderRadius: 5,
                padding: '4px 12px', cursor: 'pointer', fontSize: 12,
              }}>Later</button>
            </>
          ) : (
            <>
              <span>Downloading update v{appUpdateAvailable.version}{appUpdateProgress != null ? ` — ${appUpdateProgress}%` : '...'}</span>
            </>
          )}
        </div>
      )}
      {/* Sidebar (slides in after login) */}
      <div style={{
        width: sidebarWidth,
        background: '#3b6d66',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        boxShadow: 'none',
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        zIndex: 10,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'width 280ms ease, opacity 200ms ease',
        opacity: token ? 1 : 0,
        pointerEvents: token ? 'auto' : 'none',
      }}>
    {/* Top section: logo and welcome */}
  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 8, paddingTop: 16 }}>
          <img
            src={logoImg}
            alt="Logo"
            style={token ? {
              width: 160,
              height: 'auto',
              objectFit: 'contain',
              marginBottom: 8,
              display: 'block'
            } : {
              width: 84,
              height: 'auto',
              objectFit: 'contain',
              marginBottom: 8,
              display: 'block'
            }}
          />
          {token && (
            <h2 style={{ color: '#fff', marginBottom: 8, fontWeight: 700, fontSize: 20, letterSpacing: 1 }}>Welcome!</h2>
          )}
          <div style={{ color: '#fff', fontSize: 14, marginBottom: 5 }}>{token ? username : ''}</div>
          {isBetaTester && (
            <div style={{
              color: '#ffd600',          
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 16,           
              marginTop: -4,              
              letterSpacing: 1,
            }}>
              (Beta Tester)
            </div>
          )}
        </div>
        {/* Removed duplicate top Logout button (now pinned at bottom) */}
  {/* Sidebar Menu (only after login) */}
  {token && (
  <nav style={{ width: '100%' }}>
  <div style={{ width: 190, margin: '0 auto', transform: 'translateX(20px)', marginTop: 16 }}>
  <ul style={{
    listStyle: 'none',
    padding: 0,
    margin: 0,
    width: '100%',
    display: 'flex', flexDirection: 'column',
    gap: 12,
  }}>
    <li style={{ width: '100%' }}>
        <button
        onClick={() => setActivePage('home')}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          color: '#fff',
          padding: '10px 0',
          textAlign: 'left',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: 0,
          transition: 'none',
          display: 'grid',
          gridTemplateColumns: '26px 1fr',
          alignItems: 'center',
          columnGap: 12,
          minHeight: 40
        }}
      >
  <span style={{ width: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
    <MdHome size={18} />
  </span>
  <span>My Products</span>
      </button>
    </li>
    <li style={{ width: '100%' }}>
        <button

          onClick={() => setActivePage('settings')}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            outline: 'none',
            color: '#fff',
            padding: '10px 0',
            textAlign: 'left',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            borderRadius: 0,
            transition: 'none',
            display: 'grid',
            gridTemplateColumns: '26px 1fr',
            alignItems: 'center',
            columnGap: 12,
            minHeight: 40
          }}
               >
          <span style={{ width: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={cogIcon} alt="Settings" style={{ width:18, height:18 }} />
          </span>
          <span>Settings</span>
        </button>
    </li>
    <li style={{ width: '100%' }}>
      <a
        href="https://simworksstudios.com/docs/product-manuals-kb/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          color: '#fff',
          padding: '10px 0',
          textAlign: 'left',
          fontSize: 16,
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: 0,
          transition: 'none',
          display: 'grid',
          gridTemplateColumns: '26px 1fr',
          alignItems: 'center',
          columnGap: 12,
          textDecoration: 'none'
        }}
               
      >
        <span style={{ width: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <MdMenuBook size={18} />
        </span>
        <span>Manuals</span>
      </a>
    </li>
    
  </ul>
  </div>
  </nav>
    )}

        {/* Spacer to push logout to bottom */}
        <div style={{ flex: 1 }} />

        {/* Logout button pinned to bottom */}
        {token && (
          <button
            onClick={() => {
              sessionStorage.setItem('sws_explicitLogout','1'); // mark to suppress same-run auto restore
              setToken('');
              setUsername('');
              setPassword('');
              setOwnedAircraft([]);
              setAircraftList([]);
              setDownloadedFiles({});
              setStatus('Logged out.');
              setIsBetaTester(false);
              try { localStorage.removeItem('sws_isBetaTester'); } catch {}
              try { localStorage.removeItem('sws_username'); } catch {}
              (async () => { try { await window.electron?.clearToken?.('sws-user'); } catch {} })();
            }}
            style={{
              background: 'none',
              color: '#f7931d',
              border: 'none',
              borderRadius: 0,
              padding: '8px 16px',
              fontWeight: 800,
              fontSize: 14,
              margin: '12px 0 18px',
              cursor: 'pointer',
              boxShadow: 'none',
              width: 'auto',
              alignSelf: 'center'
            }}
          >
            Logout
          </button>
        )}
        {appVersion && (
          <div style={{ fontSize: 11, color: '#fff8', marginBottom: 10, textAlign: 'center', userSelect: 'text' }}>
            v{appVersion}
          </div>
        )}

  </div>

      {/* Main Content */}
      <div style={{
        marginLeft: sidebarWidth,
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        transition: 'margin-left 280ms ease'
      }}>
        {/* Banner */}
        <div style={{
          width: '100%',
          height: token ? '28vh' : 0,
          minHeight: token ? 160 : 0,
          maxHeight: token ? 260 : 0,
          background: '#1f2c3b',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'flex-end',
          overflow: 'hidden',
          opacity: token ? 1 : 0,
          transition: 'height 320ms ease, min-height 320ms ease, max-height 320ms ease, opacity 240ms ease'
        }}>
<img
  src={BANNER_IMAGE}
  alt="Banner"
  style={{
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: 0.35,
    position: 'absolute',
    left:  0,
    top: 0,
    zIndex: 0,
  }}
/>
{progress !== null && (
  <div style={{
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    background: cancelFlash ? 'rgba(211, 47, 47, 0.18)' : 'rgba(25, 118, 210,  0.13)',
    zIndex: 10,
    pointerEvents: 'none',
    transition: 'background 0.2s'
  }}>
    <div style={{
      width: `${typeof progress === 'number' ? progress : 0}%`,
      height: '100%',
  background: cancelFlash ? 'linear-gradient(90deg, #d32f2f 0%, #ef5350 100%)' : '#4c5f9d',
      opacity: cancelFlash ? 0.45 : 0.35,
      transition: 'width 0.2s cubic-bezier(.4,2,.6,1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* subtle moving texture like runway/taxi lights */}
  {!cancelFlash && (<div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.12) 0, rgba(255,255,255,0.12) 6px, rgba(255,255,255,0.06) 6px, rgba(255,255,255,0.06) 16px)',
        backgroundSize: 'auto',
        animation: 'swsTaxi 2.8s linear infinite',
        mixBlendMode: 'screen'
  }} />)}
      {/* faint centerline */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: '50%',
        width: '100%',
        height: 2,
        transform: 'translateY(-1px)',
        backgroundImage: cancelFlash ? 'none' : 'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 14px, rgba(255,255,255,0.0) 14px 28px)',
        opacity: cancelFlash ? 0 : 0.12
      }} />
    </div>
    {/* canceled text overlay */}
    {cancelFlash && (
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 800,
        letterSpacing: 1,
        textShadow: '0 2px 8px #000a',
        animation: 'swsCancelFlash 0.25s ease-in-out 0s 6 alternate'
      }}>
  Download canceled
      </div>
    )}
    {/* percent overlay removed — progress is shown in the download queue banner instead */}
    {/* keyframes for texture movement */}
  <style>{`@keyframes swsTaxi { from { background-position: 0 0; } to { background-position: 40px 0; } }
@keyframes swsCancelFlash { from { opacity: 0.25; } to { opacity: 1; } }`}</style>
  {/* 100% overlay removed — progress is shown in the download queue banner instead */}
  </div>
)}

{/* Global login/init overlay spinner */}
{(isLoggingIn) && (
  <div style={{
  position: 'fixed',
  left: sidebarWidth, // exclude sidebar width
    top: 0,
  width: `calc(100% - ${sidebarWidth}px)`,
    height: '100vh',
    background: 'rgba(0,0,0,0.45)',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}>
    <div style={{
      width: 120,
      height: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))'
    }}>
      <svg viewBox="0 0 100 100" width="100" height="100" style={{ animation: 'swsSpin 1s linear infinite' }}>
        {/* Hub */}
        <circle cx="50" cy="50" r="10" fill="#ffffff" />
        {/* Spinner cap */}
        <circle cx="50" cy="50" r="6" fill="#90caf9" />
        {/* Blades (3) */}
        <g fill="#ffffff" opacity="0.9">
          <rect x="48" y="5" width="4" height="28" rx="2" ry="2" />
          <g transform="rotate(120 50 50)">
            <rect x="48" y="5" width="4" height="28" rx="2" ry="2" />
          </g>
          <g transform="rotate(240 50 50)">
            <rect x="48" y="5" width="4" height="28" rx="2" ry="2" />
          </g>
        </g>
        {/* Counterweight/marks for visual interest */}
        <circle cx="50" cy="26" r="1.5" fill="#4c5f9d" />
      </svg>
    </div>
  <style>{`@keyframes swsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
)}

{/* Download queue banner (replaces simple status during active downloads) */}
{downloadQueueInfo && downloadingId && (
  <div
    style={{
      position: 'absolute',
      top: 16,
      left: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      background: 'linear-gradient(135deg, rgba(20,24,28,0.96) 0%, rgba(35,39,43,0.96) 100%)',
      color: '#fff',
      padding: 0,
      borderRadius: 0,
      fontWeight: 500,
      fontSize: 14,
      boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
      zIndex: 20,
      width: 420,
      pointerEvents: 'none',
      border: '1px solid rgba(76,95,157,0.3)',
      overflow: 'hidden'
    }}
  >
    {/* Current download — title row with green progress bar behind */}
    <div style={{ position: 'relative', overflow: 'hidden', padding: '12px 18px 10px 18px' }}>
      {/* Green progress fill */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${Math.max(0, Math.min(100, (() => { const qi = downloadQueueInfo.queueIndex || 0; const qt = downloadQueueInfo.queueTotal || 1; const cp = typeof downloadQueueInfo.overallPct === 'number' ? downloadQueueInfo.overallPct : (downloadQueueInfo.current.pct || 0); return qt <= 1 ? cp : Math.round((qi + cp / 100) / qt * 100); })()))}%`,
        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        transition: 'width 0.3s ease',
        zIndex: 0
      }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>
          {downloadQueueInfo.current.name}
          {downloadQueueInfo.current.version ? ` v${downloadQueueInfo.current.version}` : ''}
          {downloadQueueInfo.current.channel ? ` (${downloadQueueInfo.current.channel})` : ''}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {(() => { const qi = downloadQueueInfo.queueIndex || 0; const qt = downloadQueueInfo.queueTotal || 1; const cp = typeof downloadQueueInfo.overallPct === 'number' ? downloadQueueInfo.overallPct : (downloadQueueInfo.current.pct || 0); return qt <= 1 ? cp : Math.round((qi + cp / 100) / qt * 100); })()}%
        </span>
        {downloadQueueInfo.current.speed != null && downloadQueueInfo.current.speed > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.85, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {formatSpeed(downloadQueueInfo.current.speed)}
          </span>
        )}
      </div>
    </div>
    {/* Next in queue */}
    {downloadQueueInfo.next && downloadQueueInfo.next.length > 0 && (
      <div style={{ padding: '8px 18px 10px 18px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ color: '#78909c', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Next</div>
        <div className="sws-queue-list" style={{
          maxHeight: downloadQueueInfo.next.length > 3 ? 90 : 'none',
          overflowY: downloadQueueInfo.next.length > 3 ? 'auto' : 'visible',
          paddingRight: downloadQueueInfo.next.length > 3 ? 6 : 0,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.25) transparent'
        }}>
        {downloadQueueInfo.next.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#b0bec5', padding: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ opacity: 0.5, fontSize: 11 }}>▸</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.name}
              {item.version ? ` v${item.version}` : ''}
              {item.channel ? ` (${item.channel})` : ''}
            </span>
          </div>
        ))}
        </div>
      </div>
    )}
  </div>
)}

{/* Regular status banner (non-download or when no queue info) */}
{statusText && !(downloadQueueInfo && downloadingId) && (
  <div
    key={statusText}
    style={{
      position: 'absolute',
      top: 24,
      left: 32,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('fail')
        ? 'linear-gradient(90deg, #f44336 80%, #d32f2f   100%)'
        : 'linear-gradient(90deg, #23272b 80%, #263238 100%)',
      color: '#fff',
      padding: '12px 28px 12px 20px',
      borderRadius:   10,
      fontWeight: 600,
      fontSize: 17,
      boxShadow: 'none',
      zIndex: 20,
      opacity: 1,
      minWidth: 220,
  maxWidth: '72vw',
  whiteSpace: 'nowrap',
  animation: isDownloadingStatus ? 'none' : (isCancelStatus ? 'bannerStatusFadeOutQuick 4s forwards' : 'bannerStatusFadeOut 15s forwards'),
  pointerEvents: 'none'
    }}
  >
    <span style={{ fontSize: 22, display: 'flex', alignItems: 'center' }}>
      {statusText.toLowerCase().includes('error') || statusText.toLowerCase().includes('fail')
       
        ? <span style={{ color: '#fff', marginRight: 4 }}>⚠️</span>
        : <span style={{ color: '#90caf9', marginRight: 4 }}>ℹ️</span>
      }
    </span>
  <span className="status-ellipsis" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusText}</span>
  </div>
)}
{/* fade-out animation for non-download statuses */}
<style>{`@keyframes bannerStatusFadeOut { 0% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; } }
@keyframes bannerStatusFadeOutQuick { 0% { opacity: 1; } 60% { opacity: 1; } 100% { opacity: 0; } }`}</style>


          <div style={{
            position: 'relative',
            zIndex: 2,
                       padding: 32,
            color: '#fff',
            textAlign: 'right',
            width: '100%'
          }}>
            <h1 style={{ color: '#fff', fontSize: 54, margin: 0, fontWeight: 700, letterSpacing: 2 }}>Product Installer</h1>
            <div style={{ color: '#fff', fontSize: 18, marginTop: 2 }}>Install and manage your SWS Products with ease.</div>
          </div>
        </div>

        {/* Main Area */}
        {!token ? (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#181c20',
            minHeight: 300,
          }}>
            <div style={{
              position: 'relative',
              borderRadius: 0,
              overflow: 'hidden',
              width: 'min(980px, 92vw)',
              border: '1px solid #2a2f36',
              background: '#1a1f24',
              display: 'grid',
              gridTemplateColumns: '0.8fr 1.2fr'
            }}>
              {/* Brand / sign-in panel */}
              <div style={{
                minHeight: 340,
                padding: '0 28px 28px 28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                gap: 14,
                background: '#1f2c3b'
              }}>
                <div>
                  <div style={{
                    background: '#4c5f9d',
                    borderRadius: 0,
                    padding: '10px 18px',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    minHeight: 80,
                    textAlign: 'center',
                    // bleed to panel edges (panel has 28px horizontal padding)
                    margin: '0 -28px 16px -28px'
                  }}>
                    <img src={logoImg} alt="SimWorks Studios" style={{ height: 44, width: 'auto', objectFit: 'contain', display: 'block' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', textAlign: 'left', paddingBottom: 5  }}>Sign in using your SimWorks Studios account.</div>
                  <div style={{ fontSize: 12, color: '#a9b7c7', opacity: 0.95, marginTop: 4, textAlign: 'left' }}>Don’t have an account? Create one at checkout when purchasing on our website.</div>
                </div>
                <form onSubmit={handleLogin} style={{ marginTop: 6 }}>
                  <div style={{ marginBottom: 10 }}>
                    <label htmlFor="login-username" style={{ display: 'block', color: '#cfd8e3', fontSize: 13, marginBottom: 6 }}>Username</label>
                    <input
                      id="login-username"
                      type="text"
                      placeholder="Enter your username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 0,
                        border: '1px solid #324150',
                        background: '#0f1419',
                        color: '#e6f2ff',
                        fontSize: 15,
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label htmlFor="login-password" style={{ display: 'block', color: '#cfd8e3', fontSize: 13, marginBottom: 6 }}>Password</label>
                    <input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 0,
                        border: '1px solid #324150',
                        background: '#0f1419',
                        color: '#e6f2ff',
                        fontSize: 15,
                        boxSizing: 'border-box'
                      }}
                      required
                    />
                  </div>
                  <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      id="rememberMe"
                      style={{ width: 16, height: 16 }}
                    />
                    <label htmlFor="rememberMe" style={{ color: '#cfd8e3', fontSize: 14, cursor: 'pointer' }}>Remember me</label>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    onMouseDown={e => { e.currentTarget.style.background = '#1b5e20'; }}
                    onMouseUp={e => { e.currentTarget.style.background = isLoggingIn ? '#225a26' : '#2e7d32'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isLoggingIn ? '#225a26' : '#2e7d32'; }}
                    style={{
                      background: isLoggingIn ? '#225a26' : '#2e7d32',
                      opacity: isLoggingIn ? 0.85 : 1,
                      color: '#fff', border: 'none', borderRadius: 0,
                      padding: '12px 18px', fontWeight: 800, fontSize: 15,
                      cursor: isLoggingIn ? 'default' : 'pointer', width: '100%', letterSpacing: 0.3,
                      transition: 'background 0.1s ease'
                    }}
                  >{isLoggingIn ? (<><span>Signing in</span><span style={{ display: 'inline-block', width: '1.2em', textAlign: 'left' }}><AnimatedDots /></span></>) : 'Sign in'}</button>
                  {loginError && (
                    <div style={{ color: '#ef9a9a', fontSize: 13, marginTop: 10 }}>{loginError}</div>
                  )}
                </form>
              </div>
              {/* Support panel replaced with background image */}
              <div style={{
                minHeight: 360,
                padding: 0,
                display: 'flex',
                alignItems: 'stretch',
                justifyContent: 'center',
                backgroundImage: `linear-gradient(0deg, rgba(0,0,0,0.35), rgba(0,0,0,0.15)), url(${signinImg})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }}>
                {/* decorative only */}
                <div style={{ flex: 1 }} />
              </div>
            </div>
          </div>
        ) : activePage === 'settings' ? (
          // SETTINGS PAGE CONTENT (wrapped container)
          <div>
            <div style={{ padding: 32, color: '#fff' }}>
              <h2 style={{ marginTop: 0, marginBottom: 12 }}>Settings</h2>

        {/* FS2020 */}
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto auto', alignItems:'center', gap:12, marginBottom:16 }}>
          <strong>FS2020 Path:</strong>
          <span title={installPath2020 || 'None selected'} style={{ display:'flex', alignItems:'baseline', gap:8 }}>
            <span style={{ fontFamily: 'Consolas, monospace' }}>
              {installPath2020 ? prettyPath(installPath2020) : 'None selected'}
            </span>
            {installPath2020 && (
              <em style={{ color:'#a9b7c7', fontSize:12, opacity:0.9 }}>({installPath2020Source || 'Saved'})</em>
            )}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                const p = await window.electron?.getDefaultInstallPath?.();
                if (p) {
                  setInstallPath2020(p);
                  setInstallPath2020Source('Auto-detected');
                  localStorage.setItem('sws_installPath2020', p);
                  try { await window.electron.setSavedInstallPath2020?.(p); } catch {}
                  setStatus(`FS2020 path auto-detected: ${p}`);
                  refreshInstalledLists();
                } else {
                  setStatus('Could not auto-detect FS2020 Community folder.');
                }
              } catch { setStatus('Auto-detect failed.'); }
            }}
            style={{ background: 'linear-gradient(135deg, #43a047 0%, #2e7d32 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Auto-detect</button>
          <button
            type="button"
            onClick={() => handleSelectFolder('FS2020', installPath2020)}
            style={{ background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Browse</button>
        </div>

        {/* FS2024 */}
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto auto', alignItems:'center', gap:12, marginBottom:16 }}>
          <strong>FS2024 Path:</strong>
          <span title={installPath2024 || 'None selected'} style={{ display:'flex', alignItems:'baseline', gap:8 }}>
            <span style={{ fontFamily: 'Consolas, monospace' }}>
              {installPath2024 ? prettyPath(installPath2024) : 'None selected'}
            </span>
            {installPath2024 && (
              <em style={{ color:'#a9b7c7', fontSize:12, opacity:0.9 }}>({installPath2024Source || 'Saved'})</em>
            )}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                const p = await window.electron?.getDefaultInstallPath2024?.();
                if (p) {
                  setInstallPath2024(p);
                  setInstallPath2024Source('Auto-detected');
                  localStorage.setItem('sws_installPath2024', p);
                  try { await window.electron.setSavedInstallPath2024?.(p); } catch {}
                  setStatus(`FS2024 path auto-detected: ${p}`);
                  refreshInstalledLists();
                } else {
                  setStatus('Could not auto-detect FS2024 Community folder.');
                }
              } catch { setStatus('Auto-detect failed.'); }
            }}
            style={{ background: 'linear-gradient(135deg, #43a047 0%, #2e7d32 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Auto-detect</button>
          <button
            type="button"
            onClick={() => handleSelectFolder('FS2024', installPath2024)}
            style={{ background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Browse</button>
        </div>

        {/* Link-based installs toggle hidden per request */}

  {/* Removed: Offer reinstall after uninstall toggle */}

        {/* Downloads folder */}
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto auto', alignItems:'center', gap:12, marginTop:16, marginBottom:6 }}>
          <strong>Downloads Folder:</strong>
          <span title={downloadsDir || 'Default (app data)'} style={{ fontFamily: 'Consolas, monospace' }}>
            {downloadsDir ? prettyPath(downloadsDir) : 'Default (app data)'}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                const dir = await window.electron?.selectFolder?.(downloadsDir || '');
                if (!dir) return;
                const res = await window.electron?.setDownloadsDir?.(dir);
                if (res?.success) {
                  setDownloadsDir(res.dir);
                  setStatus('Downloads folder updated.');
                } else {
                  setStatus('Could not set downloads folder' + (res?.error ? (': ' + res.error) : ''));
                }
              } catch (e) {
                setStatus('Error setting downloads folder: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Change</button>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                let dir = downloadsDir;
                if (!dir) {
                  const res = await window.electron?.getDownloadsDir?.();
                  if (res?.success && res.dir) dir = res.dir;
                }
                if (dir) {
                  const opener = window.electron?.openFolder || window.electron?.revealInFolder;
                  if (opener) await opener(dir);
                } else {
                  setStatus('Downloads folder is not configured.');;
                }
              } catch (e) {
                setStatus('Could not open downloads folder: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: '#2b3944', color: '#dfe7ee', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 12px', cursor: 'pointer', boxShadow: 'none' }}
            title="Open in Explorer"
          >Open</button>
        </div>
        {/* Downloads folder help text intentionally removed per request */}

        {/* Install cache folder */}
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto auto', alignItems:'center', gap:12, marginTop:16, marginBottom:6 }}>
          <strong>Install Cache Folder:</strong>
          <span title={pkgCacheDir || 'Default (app data)'} style={{ fontFamily: 'Consolas, monospace' }}>
            {pkgCacheDir ? prettyPath(pkgCacheDir) : 'Default (app data)'}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                const dir = await window.electron?.selectFolder?.(pkgCacheDir || '');
                if (!dir) return;
                const res = await window.electron?.setPkgCacheDir?.(dir);
                if (res?.success) {
                  setPkgCacheDir(res.dir);
                  setStatus('Install cache folder updated.');
                } else {
                  setStatus('Could not set install cache folder' + (res?.error ? (': ' + res.error) : ''));
                }
              } catch (e) {
                setStatus('Error setting install cache folder: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 16px', cursor: 'pointer', boxShadow: 'none' }}
          >Change</button>
          <button
            type="button"
            onClick={async () => {
              try {
                await waitForElectronBridge();
                let dir = pkgCacheDir;
                if (!dir) {
                  const res = await window.electron?.getPkgCacheDir?.();
                  if (res?.success && res.dir) dir = res.dir;
                }
                if (dir) {
                  const opener = window.electron?.openFolder || window.electron?.revealInFolder;
                  if (opener) await opener(dir);
                } else {
                  setStatus('Install cache folder is not configured.');
                }
              } catch (e) {
                setStatus('Could not open install cache folder: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: '#2b3944', color: '#dfe7ee', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 12px', cursor: 'pointer', boxShadow: 'none' }}
            title="Open in Explorer"
          >Open</button>
        </div>
        {/* Install cache help text intentionally removed per request */}

        {/* Install behavior: Strict link-only mode enforced globally (no UI toggle). */}

        {/* Debug logging toggle */}
        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr auto auto', alignItems:'center', gap:12, marginTop:16, marginBottom:2 }}>
          <strong>Debug Logging:</strong>
          <span style={{ color: debugLogging ? '#66bb6a' : '#a9b7c7', fontSize: 13 }}>
            {debugLogging ? 'Enabled — writing logs to disk' : 'Disabled'}
            {debugLogging && logsDir && (
              <span style={{ color:'#8899a8', marginLeft: 8, fontFamily:'Consolas, monospace', fontSize: 11 }}>
                ({prettyPath(logsDir)})
              </span>
            )}
          </span>
          <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
            <input
              type="checkbox"
              checked={debugLogging}
              onChange={async (e) => {
                const val = !!e.target.checked;
                try {
                  await waitForElectronBridge();
                  const res = await window.electron?.setDebugLogging?.(val);
                  if (res?.success) {
                    setDebugLogging(res.enabled);
                    if (res.logsDir) setLogsDir(res.logsDir);
                    setStatus(res.enabled ? 'Debug logging enabled.' : 'Debug logging disabled.');
                  } else {
                    setStatus('Could not toggle debug logging' + (res?.error ? (': ' + res.error) : ''));
                  }
                } catch (err) {
                  setStatus('Error toggling debug logging: ' + (err?.message || String(err)));
                }
              }}
              style={{ accentColor: '#43a047', width: 16, height: 16, cursor:'pointer' }}
            />
            <span style={{ color:'#dfe7ee', fontSize: 13 }}>{debugLogging ? 'On' : 'Off'}</span>
          </label>
          <button
            type="button"
            disabled={!logsDir}
            onClick={async () => {
              try {
                await waitForElectronBridge();
                if (logsDir) {
                  await window.electron?.revealInFolder?.(logsDir);
                } else {
                  const res = await window.electron?.getLogsDir?.();
                  if (res?.logsDir) await window.electron?.revealInFolder?.(res.logsDir);
                }
              } catch (err) {
                setStatus('Could not open logs folder: ' + (err?.message || String(err)));
              }
            }}
            style={{ background: '#2b3944', color: '#dfe7ee', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 12px', cursor: logsDir ? 'pointer' : 'default', boxShadow: 'none', opacity: logsDir ? 1 : 0.5 }}
            title="Open logs folder in Explorer"
          >Open Logs</button>
        </div>
        <div style={{ color:'#8899a8', fontSize:11, marginTop:-2, marginBottom:6, marginLeft:172 }}>
          When enabled, detailed operation logs are written to help diagnose issues. Share the log file when reporting problems.
        </div>

        {/* Cache maintenance buttons */}
        <div style={{ marginTop:  24, paddingTop: 12, borderTop: '1px solid #333', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* Delete all installed (both sims) and their install cache; keep downloads */}
          <button
            type="button"
            onClick={handleDeleteInstalledAll}
            style={{ background: '#d32f2f', color: '#fff', border: `1px solid ${SWS_THEME.outline.danger}`, borderRadius: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', boxShadow: 'none', marginRight: 12, marginBottom: 8 }}
            title="Uninstall all installed packages from both sims and delete their extracted install cache. Downloaded ZIPs are kept."
          >
            Delete Installed
          </button>
          {/* Delete downloads cache (removes ZIPs only) */}
          <button
            type="button"
            onClick={handleResetDownloads}
            style={{ background: '#6a1b9a', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', boxShadow: 'none', marginBottom: 8 }}
            title="Delete ALL downloaded ZIP archives for every product (safe: installed packages remain, but you'll need to re-download to reinstall/update)."
          >
            Delete downloads cache
          </button>
          {/* Withdraw beta consent */}
          <button
            type="button"
            onClick={() => {
              try {
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i);
                  if (k && k.startsWith('sws_betaAck_')) keys.push(k);
                }
                keys.forEach(k => localStorage.removeItem(k));
                setStatus(keys.length > 0 ? 'Beta consent cleared. You will be prompted again before the next beta install.' : 'No beta consent found to clear.');
              } catch (e) {
                setStatus('Could not clear beta consent: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: '#e65100', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', boxShadow: 'none', marginBottom: 8 }}
            title="Withdraw your beta consent for all products. You will be asked to accept the beta warning again before any future beta downloads."
          >
            Reset beta consent
          </button>
          {/* Reset EULA acceptance */}
          <button
            type="button"
            onClick={() => {
              try {
                const had = localStorage.getItem('sws_eula_accepted_v1') === '1';
                localStorage.removeItem('sws_eula_accepted_v1');
                setStatus(had ? 'EULA consent cleared. You will be prompted to accept again before the next download.' : 'No EULA consent found to clear.');
              } catch (e) {
                setStatus('Could not clear EULA consent: ' + (e?.message || String(e)));
              }
            }}
            style={{ background: '#37474f', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', boxShadow: 'none', marginBottom: 8 }}
            title="Clear your EULA acceptance. You will be asked to accept the End User License Agreement again before the next download."
          >
            Reset EULA consent
          </button>
        </div>
            </div>
            {/* Manage Links (Overrides) removed for customer builds */}
          </div>
        ) : (
          <div
            className="main-scroll-area"
            style={{
              flex: 1,
              padding: '32px 48px',
              background: '#181c20',
              overflowY: 'auto',
              height: 'calc(100vh - 28vh)',
            }}
          >
            {/* Global spinner keyframes (available even when login overlay is hidden) */}
            <style>{`@keyframes swsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            {/* Owned Aircraft header with top-right updates button */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:12, marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <h2 style={{ color: '#ffffffff', margin: 0, fontSize: 18, fontWeight: 700 }}>Your Owned Products</h2>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:10, flexWrap:'wrap' }}>
                {/* Inline search bar (moved right) */}
                <input
                  type="text"
                  placeholder="Search products…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background:'#121519', color:'#e6eef7', border:'1px solid #2a3138',
                    padding:'8px 10px', borderRadius:0, width:260, outline:'none'
                  }}
                  aria-label="Search products"
                />
                {/* Type + Channel (combined) filter */}
                <select
                  value={filterBy === 'all' ? (channelFilter === 'beta' ? 'all-beta' : (channelFilter === 'public' ? 'all-public' : 'all')) : filterBy}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'all' || v === 'all-public' || v === 'all-beta') {
                      setFilterBy('all');
                      if (v === 'all-public') setChannelFilter('public');
                      else if (v === 'all-beta') setChannelFilter('beta');
                      else setChannelFilter('all');
                    } else {
                      setFilterBy(v);
                      // When picking a specific type or installed/not, clear channel narrowing
                      setChannelFilter('all');
                    }
                  }}
                  aria-label="Filter products"
                  style={{ background:'#121519', color:'#e6eef7', border:'1px solid #2a3138', padding:'8px 10px', borderRadius:0 }}
                >
                  <option value="all">All</option>
                  {isBetaTester && (<option value="all-public">Public</option>)}
                  {isBetaTester && (<option value="all-beta">Beta</option>)}
                  <option value="installed">Installed</option>
                  <option value="not">Not installed</option>
                  <option value="aircraft">Aircraft</option>
                  <option value="scenery">Scenery</option>
                </select>
                {/* Sim filter */}
                <select
                  value={simFilter}
                  onChange={(e) => setSimFilter(e.target.value)}
                  aria-label="Filter by sim"
                  style={{ background:'#121519', color:'#e6eef7', border:'1px solid #2a3138', padding:'8px 10px', borderRadius:0 }}
                >
                  <option value="all">All sims</option>
                  <option value="FS2020">FS2020</option>
                  <option value="FS2020+">FS2020+</option>
                  <option value="FS2024">FS2024</option>
                </select>
                {/* Channel filter merged into the Type filter above (shown as Public/Beta) */}
                {token && (
                <button
                  onClick={async () => {
                    try {
                      setStatus('Checking for updates…');
                      setOwnedAircraft([]);
                      // Show loader while reloading
                      try { beginInitOp(); } catch {}
                      setRefreshTick(t => t + 1);
                      if (typeof refreshInstalledLists === 'function') {
                        await refreshInstalledLists();
                      }
                      setStatus('Updates checked.');
                      setTimeout(() => setStatus(''), 1200);
                    } catch (e) {
                      setStatus('Refresh failed: ' + (e?.message || String(e)));
                    } finally {
                      try { endInitOp(); } catch {}
                    }
                  }}
                  style={{
                    background: '#2e7d32',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 0,
                    padding: '8px 10px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                  title="Check for updates across all products"
                >
                  <MdRefresh size={18} />
                  Check for updates
                </button>
                )}
              </div>
            </div>
            {/* Startup banner to prompt setting Community paths when missing */}
            {token && (!installPath2020 || !installPath2024) && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: 12,
                background: 'linear-gradient(90deg, #22303a, #1b242c)',
                border: '1px solid #2a3946',
                color: '#e6f2ff',
                padding: '12px 14px',
                borderRadius: 8,
                marginBottom: 14,
                boxShadow: 'none'
              }}>
                <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                  <strong>Set your Community folder</strong>
                  <div style={{ opacity: 0.9 }}>
                    {(!installPath2020 && !installPath2024)
                      ? 'We couldn\'t detect your FS2020 or FS2024 Community folder yet.'
                      : (!installPath2020 ? 'We couldn\'t detect your FS2020 Community folder.' : 'We couldn\'t detect your FS2024 Community folder.')}
                    {' '}Install buttons will be enabled after you set it in Settings or here.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifySelf: 'end' }}>
                  {!installPath2020 && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await waitForElectronBridge();
                          const p = await window.electron?.getDefaultInstallPath?.();
                          if (p) {
                            setInstallPath2020(p);
                            setInstallPath2020Source('Auto-detected');
                            localStorage.setItem('sws_installPath2020', p);
                            try { await window.electron.setSavedInstallPath2020?.(p); } catch {}
                            setStatus(`FS2020 path auto-detected: ${p}`);
                            refreshInstalledLists();
                          } else {
                            handleSelectFolder('FS2020');
                          }
                        } catch { handleSelectFolder('FS2020'); }
                      }}
                      style={{ background: '#1e88e5', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}
                    >Set FS2020 Path</button>
                  )}
                  {!installPath2024 && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await waitForElectronBridge();
                          const p = await window.electron?.getDefaultInstallPath2024?.();
                          if (p) {
                            setInstallPath2024(p);
                            setInstallPath2024Source('Auto-detected');
                            localStorage.setItem('sws_installPath2024', p);
                            try { await window.electron.setSavedInstallPath2024?.(p); } catch {}
                            setStatus(`FS2024 path auto-detected: ${p}`);
                            refreshInstalledLists();
                          } else {
                            handleSelectFolder('FS2024');
                          }
                        } catch { handleSelectFolder('FS2024'); }
                      }}
                      style={{ background: '#1e88e5', color: '#fff', border: `1px solid ${SWS_THEME.outline.neutral}`, borderRadius: 0, padding: '8px 12px', fontWeight: 700, cursor: 'pointer' }}
                    >Set FS2024 Path</button>
                  )}
                </div>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 32,
                width: '100%',
              }}
            >
              {isLoggingIn ? (
                <div style={{
                  color: '#90caf9',
                  marginTop: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  textAlign: 'center'
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      border: '3px solid #2f3439',
                      borderTopColor: '#90caf9',
                      borderRadius: '50%',
                      animation: 'swsSpin 0.9s linear infinite'
                    }} />
                  </span>
                  Loading your products…
                </div>
              ) : (!!token && pendingInitOps > 0) ? (
                <div style={{
                  color: '#90caf9',
                  marginTop: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  textAlign: 'center'
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      border: '3px solid #2f3439',
                      borderTopColor: '#90caf9',
                      borderRadius: '50%',
                      animation: 'swsSpin 0.9s linear infinite'
                    }} />
                  </span>
                  Loading your products…
                </div>
              ) : ownedAircraft.length === 0 ? (
                <span style={{ color: '#f32626ff', marginTop: 50 }}>No owned aircraft found for your account.</span>
              ) : filteredOwned.length === 0 ? (
                <span style={{ color: '#aab2c8', marginTop: 24 }}>No products match your filters.</span>
              ) : (
                filteredOwned.map(product => (
                <OwnedAircraftCard
                  key={product.id}
                  product={product}
                  aircraftList={aircraftList}
                  downloadingId={downloadingId}
                  activeDlSimProp={activeDlSim}
                  activeInstallSimProp={activeInstallSim}
                  installingId={installingId}
                  installPath2020={installPath2020}
                  installPath2024={installPath2024}
                  handleInstall={handleInstall}
                  handleDownload={handleDownload}
                  handleCancelDownload={handleCancelDownload}
                  handleUninstall={handleUninstall}
                  downloadedFiles={downloadedFiles}
                  isBetaTester={isBetaTester}
                  onStatus={setStatus}
                  setDownloadedFiles={setDownloadedFiles}  // <-- add this
                  setChangelogModal={setChangelogModal}
                  setDownloadingId={setDownloadingId}
                  setProgress={setProgress}
                  setDownloadProgress={setDownloadProgress}
                  downloadProgress={downloadProgress}
                  beginBatch={beginBatch}
                  advanceBatch={advanceBatch}
                  endBatch={endBatch}
                  cancelRef={appCancelRef}
                  setOwnedAircraft={setOwnedAircraft}
                  setDownloadQueueInfo={setDownloadQueueInfo}
                  enqueueDownload={enqueueDownload}
                  dequeueDownload={dequeueDownload}
                  pendingDownloadQueue={pendingDownloadQueue}
                  processNextDownloadRef={processNextDownloadRef}
                  refreshTick={refreshTick}
                />
                ))
              )}
            </div>

            {/* Changelog Modal */}
            {changelogModal.open && (
              <div style={{
        position: 'fixed',
                left: 0, top: 0, width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.5)',
                zIndex: 2000,
  display: 'flex',
  alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  background: '#23272b',
                  padding: 32,
                  borderRadius: 12,
                  minWidth: 340,
                  maxWidth: 600,
                  boxShadow: 'none',
                  color: '#fff',
                  position: 'relative'
                }}>
                  <h2 style={{ marginTop: 0, color: '#90caf9' }}>{changelogModal.title}</h2>
                  <pre style={{
                    whiteSpace: 'pre-wrap',
                    color: '#fff',
                    background: '#181c20',
                    padding: 16,
                    borderRadius: 8,
                    maxHeight: '60vh',
                    overflowY: 'auto',
                    fontSize: 15
                  }}>{changelogModal.changelog}</pre>
                  {changelogModal.url && (
                    <button
                      onClick={() => { try { window.open(changelogModal.url, '_blank', 'noopener'); } catch {} }}
                      style={{
                        background: '#2e7d32',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 0,
                        padding: '8px 12px',
                        fontWeight: 700,
                        fontSize: 14,
                        marginTop: 12,
                        marginRight: 8,
                        cursor: 'pointer',
                      }}
                    >Open in browser</button>
                  )}
                  <button
                    onClick={() => setChangelogModal({ open: false, title: '', changelog: '', url: '' })}
                    style={{
                      background: '#4c5f9d',
  color: '#fff',
  border: 'none',
  borderRadius: 0,
                      padding: '8px 24px',
                      fontWeight: 700,
                      fontSize: 16,
                      marginTop: 18,
  cursor: 'pointer',
                      float: 'right'
                    }}
                  >Close</button>
                </div>
              </div>
            )}

            
          </div>
        )}
           </div>
    </div>
  );
};



class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, err };
  }
  componentDidCatch(err, info) {
    console.error('Render error:', err, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ padding: 16, color: '#fff', fontFamily: 'Inter, Segoe UI, Arial, sans-serif' }}>
        <h3 style={{ marginTop: 0 }}>Something went wrong</h3>
        <p style={{ fontWeight: 600 }}>{String(this.state.err)}</p>
        <pre style={{
          background: '#23272b',
          padding: 12,
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          fontSize: 13,
          maxHeight: 260,
          overflowY: 'auto'
        }}>
{String(this.state.err?.stack || this.state.err?.message || this.state.err || '')}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#4c5f9d',
            color: '#fff',
            border: 'none',
            borderRadius: 0,
            padding: '8px 18px',
            fontWeight: 700,
            cursor: 'pointer',
            marginTop: 12
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}

// Safe root mounting
const mountEl =
  document.getElementById('root') ||
  document.getElementById('app') ||
  (() => {
    const div = document.createElement('div');
    div.id = 'root';
    document.body.appendChild(div);
    return div;
  })();

const root = createRoot(mountEl);
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// add near other helpers (top of file or above OwnedAircraftCard)

// Build possible CDN URLs — use canonical paths only (no case or prefix variants)
function buildCdnUrls(simKey, channel, folder, file) {
  const ch = (channel === 'Beta') ? 'Beta'
           : (channel === 'Public' || !channel) ? 'Public'
           : channel;
  const sk = String(simKey || '').trim() || '2020';     // '2020' | '2024'
  return [`https://sws-installer.b-cdn.net/${sk}/${ch}/${folder}/${file}`];
}

// Some existing CDN layouts place the product folder first, then sim, then channel.
// (Original working behavior reportedly relied on this ordering.) Add an explicit
// helper so we can probe both structures without breaking cached ETag logic.
function buildCdnUrlsProductFirst(simKey, channel, folder, file) {
  const ch = (channel === 'Beta') ? 'Beta'
           : (channel === 'Public' || !channel) ? 'Public'
           : channel;
  const sk = String(simKey || '').trim() || '2020';
  return [`https://sws-installer.b-cdn.net/${folder}/${sk}/${ch}/${file}`];
}

// Decide which CDN bucket to use for a given sim/product.
// Rule: for cross-sim (FS2020 or FS2020+FS2024) products, always use the 2020 bucket.
function cdnBucketForSim(product, simKey) {
  const compat = product?.compatibility || product?.bunny?.compatibility || 'FS2020+FS2024';
  const sk = String(simKey || '').trim();
  if (sk === '2024' && compat !== 'FS2024') return '2020';
  return sk || '2020';
}

// Wrappers that apply product-aware bucket choice
function buildCdnUrlsForProduct(product, simKey, channel, folder, file) {
  const sk = cdnBucketForSim(product, simKey);
  return buildCdnUrls(sk, channel, folder, file);
}

function buildCdnUrlsNoFolderForProduct(product, simKey, channel, file) {
  const sk = cdnBucketForSim(product, simKey);
  return buildCdnUrlsNoFolder(sk, channel, file);
}

// Build CDN URLs without a product folder (fallback when folder structure varies)
function buildCdnUrlsNoFolder(simKey, channel, file) {
  const ch = (channel === 'Beta') ? 'Beta'
           : (channel === 'Public' || !channel) ? 'Public'
           : channel;
  const sk = String(simKey || '').trim() || '2020';
  return [`https://sws-installer.b-cdn.net/${sk}/${ch}/${file}`];
}

const manifestZipHintsCache = new Map();

// Build possible folder path candidates on CDN for a product
// Simplified: only use the canonical folder and altFolders (not component sub-folders)
// to avoid URL explosion. Component ZIPs live under the same product folder.
// Also derives an uppercased zip-base folder variant (e.g. sws-aircraft-kodiak-wheels.zip
// -> SWS-AIRCRAFT-KODIAK-WHEELS) to cover the CDN naming convention used by some 2024-native products.
function cdnFolderCandidates(product) {
  const b = product?.bunny || {};
  const set = new Set();
  if (b.folder) expandFolderVariants(b.folder).forEach(v => set.add(encodePathSegments(v)));
  (b.altFolders || []).forEach(f => { if (f) expandFolderVariants(f).forEach(v => set.add(encodePathSegments(v))); });
  // Derive uppercased zip-base folder (covers 2024-native CDN naming)
  const zipBase = String(b.zip || '').replace(/\.zip$/i, '').trim();
  if (zipBase) {
    set.add(encodePathSegments(zipBase.toUpperCase()));
    set.add(encodePathSegments(zipBase));
  }
  return Array.from(set);
}

// Base-only candidates (do not include component/variant folders)
function cdnBaseFolderCandidates(product) {
  const b = product?.bunny || {};
  const set = new Set();
  if (b.folder) expandFolderVariants(b.folder).forEach(v => set.add(encodePathSegments(v)));
  (b.altFolders || []).forEach(f => { if (f) expandFolderVariants(f).forEach(v => set.add(encodePathSegments(v))); });
  // Derive uppercased zip-base folder (covers 2024-native CDN naming)
  const zipBase = String(b.zip || '').replace(/\.zip$/i, '').trim();
  if (zipBase) {
    set.add(encodePathSegments(zipBase.toUpperCase()));
    set.add(encodePathSegments(zipBase));
  }
  return Array.from(set);
}

// ---- Simple local cache for downloaded ZIPs (per product/sim/channel) ----
function dlCacheKey(productId, simTag, channel) {
  const chan = (typeof channel === 'string' && channel.trim()) ? channel.trim() : 'Public';
  return `sws_dl_${productId}_${simTag}_${chan}`;
}
function dlLegacyCacheKey(productId, simTag) {
  return `sws_dl_${productId}_${simTag}`;
}
function inferCacheChannel(rec, fallback = '') {
  try {
    if (rec && typeof rec === 'object') {
      if (typeof rec.channel === 'string' && rec.channel.trim()) return rec.channel.trim();
      if (rec.variants && typeof rec.variants === 'object') {
        for (const value of Object.values(rec.variants)) {
          if (value && typeof value === 'object' && typeof value.channel === 'string' && value.channel.trim()) {
            return value.channel.trim();
          }
        }
      }
    }
  } catch {}
  return fallback;
}
function readDlCacheRaw(productId, simTag, channel) {
  try {
    const requestedChannel = (typeof channel === 'string' && channel.trim()) ? channel.trim() : '';
    const primaryKey = requestedChannel ? dlCacheKey(productId, simTag, requestedChannel) : '';
    const legacyKey = dlLegacyCacheKey(productId, simTag);
    let raw = '';
    let usedKey = '';
    if (primaryKey) {
      raw = localStorage.getItem(primaryKey) || '';
      if (raw) usedKey = primaryKey;
    }
    if (!raw && legacyKey) {
      raw = localStorage.getItem(legacyKey) || '';
      if (raw) usedKey = legacyKey;
    }
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return null;
    // Sanitize: remove any persisted URL fields
    const scrub = (rec) => {
      if (!rec || typeof rec !== 'object') return rec;
      const copy = { ...rec };
      if ('savedUrl' in copy) delete copy.savedUrl;
      if ('baseUrl' in copy) delete copy.baseUrl;
      if (copy.variants && typeof copy.variants === 'object') {
        const nv = {};
        for (const [k, v] of Object.entries(copy.variants)) {
          if (v && typeof v === 'object') {
            const vv = { ...v };
            if ('savedUrl' in vv) delete vv.savedUrl;
            if ('baseUrl' in vv) delete vv.baseUrl;
            const normKey = zipBase(k);
            if (!normKey) continue;
            const prevEntry = nv[normKey];
            nv[normKey] = prevEntry && typeof prevEntry === 'object'
              ? { ...prevEntry, ...vv }
              : vv;
          } else {
            const normKey = zipBase(k);
            if (!normKey) continue;
            nv[normKey] = v;
          }
        }
        copy.variants = nv;
      }
      return copy;
    };
    const cleaned = scrub(obj);
    const inferredChannel = inferCacheChannel(cleaned, cleaned?.channel || requestedChannel || '');
    const normalizedChannel = (typeof inferredChannel === 'string' && inferredChannel.trim()) ? inferredChannel.trim() : 'Public';
    if (cleaned && typeof cleaned === 'object') {
      if (!cleaned.channel) cleaned.channel = normalizedChannel;
      if (cleaned.variants && typeof cleaned.variants === 'object') {
        const updated = {};
        let mutated = false;
        for (const [k, v] of Object.entries(cleaned.variants)) {
          if (v && typeof v === 'object' && !v.channel) {
            updated[k] = { ...v, channel: normalizedChannel };
            mutated = true;
          } else {
            updated[k] = v;
          }
        }
        if (mutated) cleaned.variants = updated;
      }
    }
    const destKey = dlCacheKey(productId, simTag, normalizedChannel);
    try { localStorage.setItem(destKey, JSON.stringify(cleaned)); } catch {}
    if (usedKey && usedKey !== destKey && usedKey === legacyKey) {
      try { localStorage.removeItem(usedKey); } catch {}
    }
    return cleaned;
  } catch { return null; }
}

function readDlCache(productId, simTag, channel, options = {}) {
  const aliasIds = Array.isArray(options.aliasIds) ? options.aliasIds : [];
  const aliasOf = options.aliasOf != null ? options.aliasOf : null;
  const candidates = collectAliasCandidates(productId, aliasIds, aliasOf);
  if (!candidates.length) return null;

  const canonical = aliasOf != null ? aliasOf : canonicalProductIdFor(productId);
  let found = null;
  let foundKey = '';
  const requestedChannel = (typeof channel === 'string' && channel.trim()) ? channel.trim() : '';

  for (const idStr of candidates) {
    const rec = readDlCacheRaw(idStr, simTag, channel);
    if (rec) {
      found = rec;
      foundKey = String(idStr);
      break;
    }
  }

  if (found && foundKey) {
    const canonicalKey = canonical != null ? String(canonical) : String(productId);
    if (canonicalKey && canonicalKey !== foundKey) {
      try {
        const chosenChannel = (typeof found.channel === 'string' && found.channel.trim())
          ? found.channel.trim()
          : (requestedChannel || 'Public');
        const payload = { ...found, channel: chosenChannel };
        const destKey = dlCacheKey(canonicalKey, simTag, chosenChannel);
        localStorage.setItem(destKey, JSON.stringify(payload));
        const sourceKey = dlCacheKey(foundKey, simTag, chosenChannel);
        if (sourceKey !== destKey) {
          try { localStorage.removeItem(sourceKey); } catch {}
        }
        const legacySourceKey = dlLegacyCacheKey(foundKey, simTag);
        if (legacySourceKey && legacySourceKey !== destKey) {
          try { localStorage.removeItem(legacySourceKey); } catch {}
        }
      } catch {}
    }
  }

  return found;
}

function readDlCacheForProduct(product, simTag, channel) {
  if (!product) return null;
  const id = product.id != null ? product.id : null;
  if (id == null) return null;
  const aliasIds = Array.isArray(product.aliasIds) ? product.aliasIds : [];
  const aliasOf = product?.bunny?.aliasOf != null ? product.bunny.aliasOf : null;
  return readDlCache(id, simTag, channel, { aliasIds, aliasOf });
}
function writeDlCache(productId, simTag, patch, channel) {
  try {
    const inferredChannel = inferCacheChannel(patch, patch?.channel || channel || '');
    const chan = (typeof inferredChannel === 'string' && inferredChannel.trim()) ? inferredChannel.trim() : 'Public';
    const prev = readDlCache(productId, simTag, chan) || {};
    const mergedChannel = patch?.channel || prev.channel || chan;
    const next = { ...prev, ...patch, channel: mergedChannel };
    if (next.variants && typeof next.variants === 'object') {
      const normalizedVariants = {};
      for (const [key, value] of Object.entries(next.variants)) {
        if (value && typeof value === 'object' && !value.channel) {
          normalizedVariants[key] = { ...value, channel: mergedChannel };
        } else {
          normalizedVariants[key] = value;
        }
      }
      next.variants = normalizedVariants;
    }
    localStorage.setItem(dlCacheKey(productId, simTag, chan), JSON.stringify(next));
    try { localStorage.removeItem(dlLegacyCacheKey(productId, simTag)); } catch {}
  } catch {}
}
// Remove a single product/sim cache entry entirely (clears all alias candidates too)
function removeDlCache(productId, simTag, options = {}) {
  try {
    const aliasIds = Array.isArray(options.aliasIds) ? options.aliasIds : [];
    const aliasOf = options.aliasOf != null ? options.aliasOf : null;
    const candidates = collectAliasCandidates(productId, aliasIds, aliasOf);
    for (const id of candidates) {
      localStorage.removeItem(dlCacheKey(id, simTag, 'Public'));
      localStorage.removeItem(dlCacheKey(id, simTag, 'Beta'));
      localStorage.removeItem(dlLegacyCacheKey(id, simTag));
    }
  } catch {}
}
function clearAllDlCache() {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(k => { if (k && k.startsWith('sws_dl_')) localStorage.removeItem(k); });
  } catch {}
}

// Normalize a version string to an int array and drop trailing zeros
function normalizeVersion(v) {
  const s = String(v || '').trim();
  if (!s) return [];
  // keep only digits and dots, drop suffixes like -beta
  const core = s.split(/[-+]/)[0];
  const parts = core.split('.').map(n => {
    const x = parseInt(n, 10);
    return Number.isFinite(x) ? x : 0;
  });
  // trim trailing zeros
  let i = parts.length - 1;
  while (i >= 0 && parts[i] === 0) i--;
  return parts.slice(0, i + 1);
}

// Extract a version-like string (a.b or a.b.c or a.b.c.d) from arbitrary text (folder names, zip names)
function extractVersionCandidate(str) {
  if (!str) return '';
  try {
    const m = String(str).match(/v?(\d+(?:\.\d+){0,3})/i);
    return m ? m[1] : '';
  } catch { return ''; }
}

// Infer channel (Beta/Public) from legacy cached record lacking an explicit channel tag
// Global debug guard (outside React component) so helper functions can safely reference DEBUG
const __SWS_DEBUG_GLOBAL = (() => { try { return localStorage.getItem('sws_debug') === '1'; } catch { return false; } })();

function inferChannelFromRecord(rec) {
  if (!rec) return '';
  try {
    const parts = [rec.variantZip, rec.baseZip, rec.localPath, rec.baseLocalPath]
      .map(x => String(x||'').toLowerCase())
      .filter(Boolean);
    if (parts.some(p => /(^|[-_\.\/])beta([-_\.\/]|$)/.test(p))) return 'Beta';
    if (parts.some(p => /(^|[-_\.\/])public([-_\.\/]|$)/.test(p))) return 'Public';
  } catch (e) { if (__SWS_DEBUG_GLOBAL) console.debug('inferChannelFromRecord error', e); }
  return ''; // default unknown (treated as Public only if selection is Public)
}
function compareVersionsNormalized(a, b) {
  const A = normalizeVersion(a);
  const B = normalizeVersion(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const av = A[i] ?? 0;
    const bv = B[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

// Restored helpers (used across install/uninstall/scan/UI)

// Canonicalize paths for compare/keys
function normalizePath(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/\//g, '\\');
  s = s.replace(/\\+$/,'');
  return s.toLowerCase();
}
// Windows-safe join
function joinPathWin(a, b) {
  const A = String(a || '').replace(/\//g, '\\').replace(/\\+$/,'');
  const B = String(b || '').replace(/\//g, '\\').replace(/^\\+/,'');
  if (!A) return B;
  if (!B) return A;
  return `${A}\\${B}`;
}
// Timed fetch wrapper
async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
// Append a cache-busting query param for Bunny URLs; uses a 5-minute bucket
// so CDN edges can cache the response and serve it to multiple clients.
const CDN_CACHE_BUCKET_MS = 5 * 60 * 1000; // 5 minutes
function cdnCacheBucket() { return Math.floor(Date.now() / CDN_CACHE_BUCKET_MS) * CDN_CACHE_BUCKET_MS; }
function addCacheBust(u) {
  try {
    const url = new URL(u);
    // Only cache-bust our Bunny host and only when the URL isn't signed (no query/signature params)
    if (/sws-installer\.b-cdn\.net$/i.test(url.hostname)) {
      const qs = url.searchParams;
      const hasQuery = Array.from(qs.keys()).length > 0;
      const hasSigLike = ['token','expires','signature','st','e','hmac','md5','hash','sig']
        .some(k => qs.has(k) || /(^|[?&])(?:token|expires|signature|st|e|hmac|md5|hash|sig)=/i.test(url.search));
      if (!hasQuery && !hasSigLike) {
        qs.set('_', String(cdnCacheBucket()));
        return url.toString();
      }
    }
    return u;
  } catch {
    return u;
  }
}
// Session-level negative cache for HEAD probes to avoid re-hitting known-404 URLs
const __headNegCache = new Map(); // url -> timestamp
const HEAD_NEG_TTL = 30 * 60 * 1000; // 30 minutes
// Quick existence check for download URLs (with timeout)
async function headOk(url, timeoutMs = 4500) {
  // Check negative cache first
  const negTs = __headNegCache.get(url);
  if (negTs && (Date.now() - negTs) < HEAD_NEG_TTL) return false;
  try {
  const h = await fetchWithTimeout(addCacheBust(url), { method: 'HEAD', cache: 'no-store' }, timeoutMs);
    if (h.ok) return true;
    // HEAD returned non-ok (404/403) — cache this negative result; skip GET Range fallback
    __headNegCache.set(url, Date.now());
    return false;
  } catch {}
  // Network error (timeout, DNS, etc.) — try GET Range as last resort
  try {
  const g = await fetchWithTimeout(addCacheBust(url), { method: 'GET', cache: 'no-store', headers: { 'Range': 'bytes=0-0' } }, Math.max(timeoutMs, 6000));
    if (g.ok) return true;
    __headNegCache.set(url, Date.now());
    return false;
  } catch { __headNegCache.set(url, Date.now()); return false; }
}
// ZIP helpers
function _zipStem(name) {
  return String(name || '').split('/').pop().replace(/\.zip$/i, '').toLowerCase();
}
function _stripDatePrefix(base) {
  return String(base || '').replace(/^(?:\d{8}|\d{6})-/, '');
}
function zipBase(name) {
  return _stripDatePrefix(_zipStem(name));
}
function zipHasDatePrefix(name) {
  const stem = _zipStem(name);
  return /^(?:\d{6,8}|\d{4}-\d{2}-\d{2})-/.test(stem);
}
function zipEquivalent(a, b) {
  if (!a || !b) return false;
  const canon = (x) => {
    let z = zipBase(x);
    // Normalize PMS naming variants
    z = z.replace(/pmsgtn/g, 'pms');
    z = z.replace(/pms50/g, 'pms');
    // Normalize PC-12 hyphenation
    z = z.replace(/pc-?12/g, 'pc12');
    // Normalize common SWS prefixes
    z = z.replace(/^sws-aircraft-/, 'sws-');
    return z;
  };
  const A = canon(a);
  const B = canon(b);
  return A === B || A.endsWith('-' + B) || B.endsWith('-' + A);
}
function componentLabelForZip(product, zip) {
  if (!zip) return '';
  const base = zipBase(zip);
  const comps = (product?.bunny?.components || product.components || []);
  const match = comps.find(c =>
    zipBase(c.zip) === base ||
    Object.values(c.zipBySim || {}).some(z => zipBase(z) === base)
  );
  return match?.label || base;
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripProductWords(product, label) {
  try {
    const raw = String(label || '').trim();
    if (!raw) return '';

    const bunny = product?.bunny || {};
    const name = String(product?.name || '').trim();
    const sanitize = (text) => String(text || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const genericStopWords = new Set(['sws','simworks','studios','aircraft','scenery','installer','package','msfs','ga8','ga-8','ga','airvan','legacy','series','base','standard','default','edition']);

    const removeList = [];
    if (name) {
      removeList.push(name);
      const sanitizedName = sanitize(name);
      if (sanitizedName && sanitizedName !== name) removeList.push(sanitizedName);
      const nameParts = sanitizedName.split(' ');
      if (nameParts.length > 1) {
        const withoutLast = nameParts.slice(0, -1).join(' ').trim();
        if (withoutLast) removeList.push(withoutLast);
      }
    }
    if (bunny.folder) {
      removeList.push(String(bunny.folder));
      const sanitizedFolder = sanitize(bunny.folder);
      if (sanitizedFolder && sanitizedFolder !== bunny.folder) removeList.push(sanitizedFolder);
    }
    if (bunny.zip) {
      removeList.push(zipBase(bunny.zip));
      const sanitizedZip = sanitize(zipBase(bunny.zip));
      if (sanitizedZip) removeList.push(sanitizedZip);
    }
    if (Array.isArray(bunny.altFolders)) {
      bunny.altFolders.forEach(f => {
        if (f) {
          removeList.push(String(f));
          const san = sanitize(f);
          if (san && san !== f) removeList.push(san);
        }
      });
    }

    let cleaned = raw;
    removeList.forEach(part => {
      const trimmed = sanitize(part);
      if (!trimmed) return;
      const pattern = new RegExp(escapeRegex(trimmed), 'ig');
      cleaned = cleaned.replace(pattern, ' ');
    });

    cleaned = sanitize(cleaned);
    if (!cleaned) return '';

    const keeperWords = new Set();
    if (Array.isArray(bunny.components)) {
      bunny.components.forEach(c => {
        const lab = sanitize(c?.label || '').toLowerCase();
        if (!lab || lab === 'base') return;
        lab.split(/\s+/).forEach(tok => { if (tok) keeperWords.add(tok); });
      });
    }

    const productTokens = new Set();
    const addTokens = (text) => {
      const base = sanitize(text).toLowerCase();
      if (!base) return;
      const tokens = base.split(/\s+/).filter(Boolean);
      tokens.forEach(tok => { if (tok.length >= 3) productTokens.add(tok); });
      for (let i = 0; i < tokens.length - 1; i++) {
        const fused = tokens[i] + tokens[i + 1];
        if (fused.length >= 3) productTokens.add(fused);
      }
    };
    addTokens(name);
    addTokens(bunny.folder);
    addTokens(zipBase(bunny.zip || ''));
    if (bunny.zipBySim) Object.values(bunny.zipBySim).forEach(z => addTokens(zipBase(z || '')));
    if (Array.isArray(bunny.altFolders)) bunny.altFolders.forEach(addTokens);
    if (Array.isArray(bunny.components)) {
      bunny.components.forEach(c => {
        addTokens(c?.folder);
        addTokens(zipBase(c?.zip || ''));
        if (c?.altFolders) c.altFolders.forEach(addTokens);
        if (c?.zipBySim) Object.values(c.zipBySim).forEach(z => addTokens(zipBase(z || '')));
      });
    }

    const originalTokens = raw
      .replace(/[\-–—,:;]+/g, ' ')
      .split(/\s+/)
      .map(t => t.trim())
      .filter(Boolean);
    const originalMap = new Map();
    originalTokens.forEach(tok => {
      const key = sanitize(tok).toLowerCase();
      if (key && !originalMap.has(key)) originalMap.set(key, tok);
    });

    const words = cleaned.split(/\s+/);
    const filtered = words.filter(word => {
      const low = word.toLowerCase();
      if (low.length <= 2) return false;
      if (keeperWords.has(low)) return true;
      if (genericStopWords.has(low)) return false;
      const matches = Array.from(productTokens).some(tok =>
        tok === low || tok.includes(low) || low.includes(tok)
      );
      return !matches;
    });

    if (!filtered.length) return '';

    const reconstructed = filtered.map(word => {
      const key = sanitize(word).toLowerCase();
      return originalMap.get(key) || originalMap.get(word.toLowerCase()) || word;
    });

    return reconstructed.join(' ').trim();
  } catch {
    return String(label || '').trim();
  }
}

function primaryDistinctVariantLabel(product) {
  try {
    const comps = product?.bunny?.components || product?.components || [];
    if (!Array.isArray(comps)) return '';
    const candidates = comps
      .map(c => String(c?.label || '').trim())
      .filter(Boolean)
      .filter(l => !/^base$/i.test(l) && !/^standard$/i.test(l) && !/^default$/i.test(l));
    return candidates[0] || '';
  } catch {
    return '';
  }
}

// Token-based matching so all variants/alt folders match as installed
function _norm(s) { return String(s || '').toLowerCase().trim(); }
function _simple(s) { return _norm(s).replace(/[^a-z0-9]+/g, ''); }
const _STOP_TOKENS = new Set([
  'aircraft','scenery','sws','msfs','package','legacy','base','community','sim','fs2020','fs2024',
  'z','zz','zzz','pc','ms','studio','studios'
]);
function _toTokens(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(t => t && t.length >= 3 && !_STOP_TOKENS.has(t));
}
function buildProductCandidates(product) {
  const p = product || {};
  const b = p.bunny || {};
  const comps = (b.components || p.components || []);
  const zipBySim = Object.values(b.zipBySim || {}).map(z => String(z).replace(/\.zip$/i,''));
  const compFolders = comps.map(c => c.folder).filter(Boolean);
  const compAlts = comps.flatMap(c => c.altFolders || []).filter(Boolean);
  const compZips = comps.map(c => String(c.zip || '').replace(/\.zip$/i,'')).filter(Boolean);
  const compZipBySim = comps.flatMap(c => Object.values(c.zipBySim || {}) || []).map(z => String(z).replace(/\.zip$/i,'')).filter(Boolean);
  const list = [
    p.name,
    b.folder,
    String(b.zip || '').replace(/\.zip$/i, ''),
    ...zipBySim,
    ...(b.altFolders || []),
    ...compFolders,
    ...compAlts,
    ...compZips,
    ...compZipBySim
  ];
  return Array.from(new Set(list.filter(Boolean).map(_simple)));
}
// Strict ID/alias based matcher used by UI once IDs are known.
// No heuristic fuzzy logic here to avoid cross-product bleed.
function matchesItemToProduct(item, product) {
  if (!item || !product) return false;
  if (item.id && product.id && String(item.id) === String(product.id)) return true;
  // Allow alias id linkage (e.g., merged/rebranded products) if provided
  try {
    const aliasIds = product.aliasIds || [];
    if (item.id && aliasIds.some(a => String(a) === String(item.id))) return true;
    if (product?.bunny?.aliasOf != null && String(product.bunny.aliasOf) === String(item.id)) return true;
  } catch {}
  return false; // Hard stop – we don't allow fuzzy fallback here.
}

// Heuristic legacy matcher retained ONLY for initial scan to infer IDs for previously installed
// items that lack an embedded product id marker. After one successful inference we persist a
// folder -> product.id mapping so subsequent renders rely purely on matchesItemToProduct.
function heuristicMatchItemToProduct(item, product) {
  if (!item || !product) return false;
  if (item.id && product.id && String(item.id) === String(product.id)) return true;

  // Block previously known false positive (Airvan vs SimPulse)
  try {
    const prodAll = `${product.name||''} ${(product.bunny&&product.bunny.folder)||''}`.toLowerCase();
    const itemAll = `${item.folder||''} ${item.name||''} ${item.packageName||''}`.toLowerCase();
    const prodHasAirvan = /airvan|ga[-_]?8/.test(prodAll);
    const prodHasSimPulse = /simpulse|sim\s*pulse/.test(prodAll);
    const itemHasAirvan = /airvan|ga[-_]?8/.test(itemAll);
    const itemHasSimPulse = /simpulse|sim\s*pulse/.test(itemAll);
    if ((prodHasAirvan && !prodHasSimPulse && itemHasSimPulse) || (prodHasSimPulse && !prodHasAirvan && itemHasAirvan)) {
      return false;
    }
  } catch {}

  const candidates = buildProductCandidates(product);
  const folderKey = _simple(item.folder || item.name || '');
  const nameKey = _simple(item.name || '');
  const pkgKey = _simple(item.packageName || '');
  if (candidates.some(c => {
    if (!c) return false; const lenOk = c.length >= 4 || folderKey.length >= 8;
    return lenOk && (folderKey === c || folderKey.startsWith(c) || c.startsWith(folderKey) || nameKey === c || nameKey.startsWith(c) || c.startsWith(nameKey));
  })) return true;
  // Also check manifest packageName against product candidates (e.g. third-party installs)
  if (pkgKey && candidates.some(c => {
    if (!c) return false; const lenOk = c.length >= 4 || pkgKey.length >= 8;
    return lenOk && (pkgKey === c || pkgKey.startsWith(c) || c.startsWith(pkgKey));
  })) return true;

  const itemTokens = new Set([
    ..._toTokens(item.folder || ''),
    ..._toTokens(item.name || ''),
    ..._toTokens(item.packageName || '')
  ]);
  const b = product.bunny || {};
  const coreTokens = new Set([
    ..._toTokens(product.name || ''),
    ..._toTokens(b.folder || '')
  ]);
  const productTokens = new Set([
    ...coreTokens,
    ..._toTokens(String(b.zip || '').replace(/\.zip$/i,'')),
    ...Object.values(b.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,''))),
    ...(b.altFolders || []).flatMap(f => _toTokens(f)),
    ...(b.components || product.components || []).flatMap(c => [
      ..._toTokens(c.folder || ''),
      ..._toTokens(String(c.zip || '').replace(/\.zip$/i,'')),
      ...(c.altFolders || []).flatMap(f => _toTokens(f)),
      ...Object.values(c.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,'')))
    ])
  ]);
  let shared = 0; let coreShared = 0; let primaryShared = 0;
  const primaryTokens = [...coreTokens].slice(0,2);
  for (const t of productTokens) {
    if (itemTokens.has(t)) {
      shared++;
      if (coreTokens.has(t)) coreShared++;
      if (primaryTokens.includes(t)) primaryShared++;
      if (shared >= 3 && coreShared >= 1 && primaryShared >= 1) return true;
    }
  }
  if (shared >= 3 && coreTokens.size === 0 && primaryShared >= 1) return true;
  return false;
}
function inferVariantZipFromItem(product, item) {
  if (!product?.bunny) return '';
  const comps = product.bunny.components || product.components || [];
  if (!comps.length) return product.bunny.zip || '';
  const itemTokens = new Set([
    ..._toTokens(item?.folder || ''),
    ..._toTokens(item?.name || '')
  ]);
  let best = { score: -1, zip: '' };
  for (const c of comps) {
    const tokens = new Set([
      ..._toTokens(c.folder || ''),
      ..._toTokens(String(c.zip || '').replace(/\.zip$/i,'')),
      ...(c.altFolders || []).flatMap(f => _toTokens(f)),
      ...Object.values(c.zipBySim || {}).flatMap(z => _toTokens(String(z).replace(/\.zip$/i,'')))
    ]);
    let score = 0;
    for (const t of tokens) if (itemTokens.has(t)) score++;
    if (score > best.score) best = { score, zip: c.zip || '' };
  }
  return best.zip || product.bunny.zip || '';
}
function inferVariantLabelFromItem(product, item) {
  const z = item?.variantZip || inferVariantZipFromItem(product, item);
  return componentLabelForZip(product, z);
}

// --- PATCH 2: getVariantZipForSim (moved up, restored full logic) ---
// (duplicate removed; see earlier helper)

// Bytes/s to human-readable string
function formatSpeed(bps) {
  const KB = 1024, MB = 1024 * 1024;
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  if (bps >= MB) return (bps / MB).toFixed(1) + ' MB/s';
  if (bps >= KB) return Math.round(bps / KB) + ' KB/s';
  return Math.round(bps) + ' B/s';
}

// Check if a Community package matching tokens exists
async function hasCommunityPackage(basePath, tokens) {
  try {
    if (!basePath || !window.electron?.listAircraft) return false;
    const list = await window.electron.listAircraft(basePath);
    const norm = s => String(s || '').toLowerCase();
    const ok = (name) => {
      const n = norm(name);
      return tokens.every(t => n.includes(t));
    };
    return (list || []).some(e => ok(e.folder || e.name));
  } catch {
    return false;
  }
}


  async function tryDownloadCandidates(urls, zip, simTag, channel) {
    for (const u of urls) {
      const saved = await handleDownload(product, u, simTag, channel, '', zip);
      if (saved) return saved;
    }
    return '';
  }

  // Generate alternative ZIP filename candidates (handles date-prefixed patterns like 21052025-sws-aircraft-x.zip)
  function buildZipNameCandidates(zipName) {
    const base = String(zipName || '').trim();
    if (!base) return [];
    return [base];
  }

// Public builds can be cached a bit; Beta should always fetch fresh.
const MANIFEST_ZIP_HINT_TTL_PUBLIC = 10 * 60 * 1000; // 10 minutes
const MANIFEST_ZIP_HINT_TTL_BETA = 0; // always refresh
// Backward compat alias (remove later)
const MANIFEST_ZIP_HINT_TTL = MANIFEST_ZIP_HINT_TTL_PUBLIC;

function extractZipNamesFromText(text) {
  const names = new Set();
  const push = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return;
    const stem = raw.split(/[?#]/)[0].split(/[/\\]/).pop();
    if (!stem || !/\.zip$/i.test(stem)) return;
    names.add(stem);
  };
  const body = String(text || '');
  if (!body) return [];
  try {
    const parsed = JSON.parse(body.replace(/^\uFEFF/, ''));
    const stack = [parsed];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (!cur) continue;
      if (typeof cur === 'object') {
        if (seen.has(cur)) continue;
        seen.add(cur);
      }
      if (typeof cur === 'string') {
        if (/\.zip/i.test(cur)) push(cur);
      } else if (Array.isArray(cur)) {
        for (const item of cur) stack.push(item);
      } else if (typeof cur === 'object') {
        for (const value of Object.values(cur)) stack.push(value);
      }
    }
  } catch {}
  const patterns = [
    { regex: /["']([^"'\\\s]+?\.zip)(?:\?[^"'\\\s]*)?["']/gi, group: 1 },
    { regex: /\bhttps?:\/\/[^\s"'<>]+?\.zip\b/gi, group: 0 },
    { regex: /\b[A-Za-z0-9][A-Za-z0-9_\-.]{2,}\.zip\b/g, group: 0 }
  ];
  for (const { regex, group } of patterns) {
    let match;
    while ((match = regex.exec(body))) {
      const val = group === 0 ? match[0] : (match[group] || '');
      push(val);
    }
  }
  return Array.from(names);
}

async function fetchManifestZipHints(product, simKey, channel, opts) {
  const forceFresh = !!(opts && opts.forceFresh);
  const pid = String(product?.id || product?.bunny?.folder || '');
  const key = `${pid}|${String(simKey || '')}|${String(channel || '')}`;
  const now = Date.now();
  const cached = manifestZipHintsCache.get(key);
  const ttl = /beta/i.test(String(channel)) ? MANIFEST_ZIP_HINT_TTL_BETA : MANIFEST_ZIP_HINT_TTL_PUBLIC;
  if (!forceFresh && cached) {
    if (cached.promise) return cached.promise;
    if (ttl === 0) {
      // Ignore cached value; force refetch
    } else if (now - (cached.ts || 0) < ttl) {
      return cached.names || [];
    }
  } else if (forceFresh && cached && cached.promise) {
    // allow existing in-flight promise if already force-refreshing
    return cached.promise;
  }
  const promise = (async () => {
    try {
      // Use canonical + zip-derived folders (already encoded by cdnBaseFolderCandidates)
      const folders = cdnBaseFolderCandidates(product).slice(0, 3);
      if (!folders.length) folders.push(...cdnFolderCandidates(product).slice(0, 2));
      const files = ['manifest.json'];
      const bucketPrimary = cdnBucketForSim(product, simKey);
      const buckets = bucketPrimary ? [bucketPrimary] : ['2020'];
      const channels = [];
      const normalizedChannel = (channel || 'Public') || 'Public';
      channels.push(normalizedChannel);
      const seenUrls = new Set();
      const tryUrl = async (url) => {
        if (!url || seenUrls.has(url)) return [];
        seenUrls.add(url);
        const res = await fetchWithTimeout(addCacheBust(url), { cache: 'no-store' }, 4500).catch(() => null);
        if (!res || !res.ok) return [];
        const text = await res.text().catch(() => '');
        if (!text) return [];
        return extractZipNamesFromText(text);
      };
      const MAX_FOLDERS = 2;
      for (const bucket of buckets) {
        for (const chan of channels) {
          let usedFolders = 0;
          for (const folder of folders) {
            if (usedFolders >= MAX_FOLDERS) break;
            usedFolders++;
            for (const file of files) {
              let urls = buildCdnUrls(bucket, chan, folder, file);
              if (/beta/i.test(chan)) {
                // Force cache-bust for Beta metadata
                urls = urls.map(u => addCacheBust(u));
              }
              for (const url of urls) {
                const names = await tryUrl(url);
                if (names.length) return names;
              }
            }
          }
        }
      }
      return [];
    } catch { return []; }
  })();
  manifestZipHintsCache.set(key, { promise });
  const names = await promise;
  manifestZipHintsCache.set(key, { names, ts: Date.now() });
  return names;
}


