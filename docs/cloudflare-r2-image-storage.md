# Cloudflare R2 image storage

StarKies stores dynamic product photos and promotion banners in Cloudflare R2. The application repository keeps code and static interface assets only.

## Required Cloudflare setup

1. Create an R2 bucket named `starkies-images` (or choose another name and use it consistently).
2. Create an R2 API token with **Object Read & Write** permission scoped only to that bucket.
3. Copy the account ID, access key ID and secret access key. The secret is shown only once.
4. Enable public access for the bucket using a custom domain. Prefer a dedicated hostname such as `images.starkies.lat` managed by Cloudflare. The R2 development URL can be used temporarily for setup, but should not be treated as the production delivery domain.
5. Confirm that a test object can be opened publicly over HTTPS.

## Vercel environment variables

Add these variables to the Vercel project(s) that serve the Admin/API, for **Production** and the environment used to validate the migration:

- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: R2 API token access key ID.
- `R2_SECRET_ACCESS_KEY`: R2 API token secret access key.
- `R2_BUCKET_NAME`: `starkies-images` (or the bucket name you created).
- `R2_PUBLIC_BASE_URL`: public HTTPS base URL, for example `https://images.starkies.lat`.
- `CRON_SECRET`: a long random secret used only by the scheduled orphan-image cleanup endpoint.

The existing `FIREBASE_SERVICE_ACCOUNT_JSON` variable is still required by the authenticated image API. Never put any of these secrets in Git, browser configuration, or a Project file.

## Image lifecycle

- The Admin browser normalizes JPG, PNG and WebP inputs to WebP, fixes orientation through image decoding, strips source metadata, preserves transparency, and bounds the output to 3 MB.
- The server validates the WebP signature and calculates SHA-256 again; it does not trust a client-supplied digest.
- The object key is content-addressed: `images/<sha256>.webp`. Uploading identical WebP bytes reuses the existing object.
- Firestore `imageAssets/<sha256>` stores the URL, object key and explicit reference list. It is an index, not a copy of the image.
- After a product or promotion save/delete succeeds, the Admin API updates the reference index. An old object is marked `deleting` and removed only when its indexed reference list is empty.
- Abandoned uploads with zero references are removed by the daily `/api/image-cleanup` cron after 24 hours. Configure `CRON_SECRET` for the cron authorization header.

## One-time migration

1. Configure the R2 bucket, public domain and Vercel variables.
2. Deploy the image-storage implementation.
3. Open Admin → Catálogo → Migrar imágenes.
4. Run the migration and review every reported failure. It reads existing product and promotion image URLs, converts them to WebP in the browser, uploads/reuses the content-addressed object, and updates the corresponding Firestore record.
5. Check the public catalog and promotion banners. Confirm the migration page reports zero pending images and zero failures.
6. Only after the previous checks, run the separate Git-history cleanup procedure for old dynamic image files. Do not delete the originals or rewrite Git history before this verification.

The migration intentionally does not delete old repository images or rewrite Git history. Those are separate destructive steps and must wait until every live reference has been verified against R2.
