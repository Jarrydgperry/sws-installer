# SimWorks Installer – Ownership API Plugins (Deployable)

This folder contains two production-ready WordPress plugins for the Installer’s ownership endpoint. Send one of these ZIPs to your web company to install on the site (no admin login needed on your side).

## Which one should they install?

- sws-installer-endpoints (Full)
  - Strict auth via WordPress login/JWT (401 when not authenticated)
  - Anti-cache headers, ETag/Last-Modified, OPTIONS route, and transient caching
  - Recommended for most sites

- sws-installer-endpoints-lite (Lite)
  - Always returns JSON (never HTML). If unauthenticated, returns an empty array []
  - Minimal anti-cache headers and CORS
  - Useful on hosts/CDNs that sometimes serve HTML login pages to REST clients, or when Authorization headers are hard to pass through

## How to package (Windows PowerShell)

Zip each plugin folder (one at a time) before sending to the web company:

- sws-installer-endpoints
- sws-installer-endpoints-lite

Example (optional):

```powershell
Compress-Archive -Path .\sws-installer-endpoints -DestinationPath .\sws-installer-endpoints-0.4.2.zip -Force
Compress-Archive -Path .\sws-installer-endpoints-lite -DestinationPath .\sws-installer-endpoints-lite-0.4.2.zip -Force
```

They can then upload and activate the plugin via WordPress Admin → Plugins → Add New → Upload Plugin.

## Endpoint details

- Route: `/wp-json/simworks/v1/msfs-ownership`
- Returns JSON array of owned products: `[{ id: 33808, name: "Kodiak 100 Series II" }, …]`
- WooCommerce required for ownership discovery. If not present or unauthenticated, returns `[]`.

## Server requirements

- Authorization header passthrough for JWT (if using tokens instead of cookie auth)
  - Apache (.htaccess):
    ```apache
    SetEnvIf Authorization "(.*)" HTTP_AUTHORIZATION=$1
    ```
  - Nginx (proxy to PHP):
    ```nginx
    proxy_set_header Authorization $http_authorization;
    # or
    fastcgi_param HTTP_AUTHORIZATION $http_authorization;
    ```

- CDN/Proxy caching
  - Both plugins set `Cache-Control: no-store` and related headers for this endpoint
  - If issues persist, purge Cloudflare/edge caches after deployment

## Testing

- Cookie auth: Log into WP admin in your browser, then visit:
  `https://<site>/wp-json/simworks/v1/msfs-ownership`
  - Should return HTTP 200 + JSON array (may be empty if no matching orders)

- JWT auth: Use a valid token
  ```powershell
  $Headers = @{ Authorization = "Bearer <TOKEN>" }
  Invoke-WebRequest -Uri "https://<site>/wp-json/simworks/v1/msfs-ownership" -Headers $Headers -Method GET
  ```
  - Expect HTTP 200 + JSON

## Troubleshooting

- Got non-JSON (HTML/login page)? Install the Lite plugin OR ensure the server forwards Authorization header as shown above.
- Got 401 with the Full plugin? You’re not authenticated; try Lite or ensure cookies/JWT are working.
- Saw stray text like `hi` in response? Remove any debug output from the plugin file and ensure it begins with `<?php` (no BOM/whitespace). Avoid closing `?>` at the end of the file.

## Versions

- Full: 0.4.2
- Lite: 0.4.2-lite

Both variants are designed to avoid CDN/proxy caching and to always return JSON. The Lite variant never returns HTML and returns `[]` for unauthenticated requests.
