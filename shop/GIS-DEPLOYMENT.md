# GIS and Google Sheets deployment

This is the current integration path. The older D1 implementation is not part of this deployment.

1. Deploy the shop via `shop/gis-sheets-worker.mjs`, with the public shop HTML, CSS, browser JS and images in the `ASSETS` binding. Route `/buy` and `/api/shop-*` through the Worker first. Preserve existing distribution paths when staging a production build. Keep Worker source and Apps Script files outside the public asset directory.
2. Configure `GOOGLE_CLIENT_ID`, `SHOP_ORIGIN`, `ORDER_API_URL`, `PAYMENT_BANK`, `PAYMENT_ACCOUNT` and `PAYMENT_NAME`. Add the exact staging origin in Google Identity Services. The browser integration uses the public client ID and an in-memory credential. No Google client secret is used.
3. Add a newly generated `SHOP_GATEWAY_SECRET` to Worker Secrets and Apps Script Script Properties. The values must match. Deploy the Apps Script changes to a staging spreadsheet first. The Orders sheet must already have columns A–K in the existing format and L–N must be empty or already named GoogleOwner, AccountRequest, AccountCreatedAt.
4. In staging, use two Google test accounts. Verify create and retry, order history after signing in again, owner isolation, pending and paid display, payment reconciliation and the existing webhook and licensing flows. The frontend does not persist the Google credential across reloads.
5. Only roll out once the current production Apps Script version and SePay webhook authentication are verified. Old guest orders have no Google owner and stay on their existing recovery path.
