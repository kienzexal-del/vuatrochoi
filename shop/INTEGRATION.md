# Shop recovery work — integration pending

## What is implemented
- New storefront in `shop/index.html`, `store.css`, `store.mjs`, with account/history/detail screens.
- Server-authoritative order creation, no invented order IDs, no key or bearer-token storage in localStorage.
- Order detail routes can be reopened; history reads from the API on each visit.
- Local-only preview server with conspicuously fake accounts, keys and bank details. It does not implement authentication or persistent storage and MUST NOT be deployed.
- Separate legacy patches: `buy.html` stops checkout when create_order fails; Apps Script check_order requires a nonempty matching token.

## Run locally
`node shop/preview-server.mjs`

Open `http://127.0.0.1:4177/buy`. Login here is a fake local preview. No QR is generated for demo orders. The demo is process-memory only and not an account/security test.

`node --test shop/shop-model.test.mjs shop/legacy-safety.test.mjs`

Seven tests pass. Two legacy regression tests failed before their fixes. No real payment was initiated.

## Backend contract (implemented locally, deployment pending)
All endpoints are same-origin and `Cache-Control: no-store`. Never expose Apps Script secrets or order bearer tokens to public account history.

| Endpoint | Response / responsibility |
| --- | --- |
| GET /api/me | `{user: null}` or `{user: {name}}`; secure session validation |
| GET /auth/login | Provider login, validated return path, OAuth state/nonce and safe callback |
| POST /api/logout | Invalidate session; reject cross-origin mutation |
| GET /api/orders | `{orders: Order[]}` for authenticated account only |
| POST /api/orders | `{plan}` plus Idempotency-Key; derive price server-side; bind owner before QR; return `{order}` |
| GET /api/orders/:id | `{order}` after checking authenticated owner; never authorize with order ID alone |

Order: `{id, plan, amount, status, createdAt, key?, payment?}`. `plan` is `trial_1`, `trial_3`, `trial_7`, or `lifetime`. Status is PENDING, PAID, UNDERPAID, EXPIRED or CANCELLED. Dates are ISO-8601. Payment is `{bank, account, name}`, supplied by trusted backend config. Key is returned only for an owned PAID order. Never return `demo:true` outside local previews.

## Production work remaining
The production entry point is `shop-worker.mjs`. Its `ASSETS` binding must serve only public assets and preserve existing distribution paths. Publish the shop HTML, CSS, browser modules and the two paper backgrounds. Keep Worker modules, SQL, demo code and tests out of the public asset directory. Configure `ORDER_API_URL`, `PAYMENT_BANK`, `PAYMENT_ACCOUNT` and `PAYMENT_NAME` to match the existing production payment system.

The account API persists confirmed upstream order IDs before returning the checkout. Purchase status refreshes from Apps Script when opening an order. Orders created before sign-in are not automatically imported. If an upstream request succeeds but its D1 write fails, its reservation remains without a payable order and requires reconciliation.

The Google sign-in module is in `google-auth.mjs`. Apply `google-auth.sql` to a private D1 database bound as `SHOP_DB`. Set `SHOP_ORIGIN` to the exact HTTPS origin and `GOOGLE_CLIENT_ID` to a Google Web application client ID. Set `GOOGLE_CLIENT_SECRET` as a Worker secret. Register `<SHOP_ORIGIN>/auth/google/callback` in that OAuth client.

In the deployed Worker, call `googleAuthRoute(request, env)` before asset routing and return its response when non-null. For order routes, require `shopAccount(request, env)` and enforce ownership by `google_sub` on creation, listing and lookup. Login requests only the OpenID scope. Google credentials and access tokens are not persisted. Schedule deletion of expired rows from `shop_sessions`.

1. Locate current Cloudflare source/build settings. User supplied Cloudflare build URL; agent browser currently reaches login, not build configuration.
2. Choose and configure the existing identity provider or Google sign-in. Use verified stable provider subject IDs, not arbitrary client email, as account identifiers. Session cookie Secure, HttpOnly, SameSite; CSRF protection and login rate limits.
3. Persist account/order ownership with unique constraints and idempotency. Keep payment authority and existing license activation compatible. Reconcile upstream-created orders if the local mapping write fails; don't return QR until durable ownership exists.
4. Webhook verification, account/amount/reference matching and exactly-once key assignment still require a backend audit. The token patch alone is not a complete payment security review.
5. Migrate old guest orders only after proof of ownership (existing valid token or manual receipt verification). Never claim orders based on public order ID. Tokenless legacy orders require support rather than anonymous key exposure.
6. Test account A/B isolation, logout, session expiry, webhook retries, duplicate create requests, closing before create response, payment while offline, cross-device retrieval, failed callbacks and XSS. Test with fake orders in staging.
7. Publish only approved production assets, never the preview server, tests or docs as static content. Existing public `buy.html` is intentionally not replaced by the prototype until the API works.

Google OAuth reference: https://developers.google.com/identity/protocols/oauth2/web-server
Cloudflare assets reference: https://developers.cloudflare.com/workers/static-assets/binding/

## Review verdict
Useful interactive UI prototype plus two tested legacy safety fixes; **not ready for production deployment**. Authentication and cross-device history are still requirements, not completed capabilities.
