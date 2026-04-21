# SimWorks Installer – WordPress endpoints (reference)

This folder documents the minimal WordPress REST endpoints the installer expects, so you can validate the plugin configuration quickly.

## Endpoints

1) JWT token (login)
- POST /wp-json/jwt-auth/v1/token
- Body (form-urlencoded):
  - username
  - password
- Response 200:
```json
{ "token": "<jwt>", "user_email": "...", "user_display_name": "...", "user_nicename": "..." }
```

2) Ownership list
- GET /wp-json/simworks/v1/msfs-ownership
- Headers: Authorization: Bearer <jwt>
- Response 200:
```json
{
  "owned": [
    { "product_id": 33808, "order_id": 52385, "sku": "SWS-...", "title": "Kodiak 100 Series II", "aliases": [33808,33810] },
    { "product_id": 2157,  "order_id": 81234, "sku": "SWS-GA8", "title": "GA8 Airvan" }
  ]
}
```

Optional: return `beta`: true/false for each product or a top-level `betaTester` flag.

## Common pitfalls
- 404 rest_no_route on /jwt-auth/v1/token: the JWT plugin is disabled or the route is blocked by a security plugin.
- CORS or firewall blocks: ensure the site allows REST from the installer (desktop app) and doesn’t require a nonce.
- Expired tokens: return 401 consistently so the client can prompt to re-login.

## Debug checklist
- Call the endpoints in Postman or curl first.
- Confirm the response shape matches above.
- If you change path names, update the client URLs accordingly in src/index.js.
