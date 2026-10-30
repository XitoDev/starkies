# Cloudflare R2 image storage

StarKies stores dynamic product photos and promotion banners in Cloudflare R2. The application repository keeps code and static interface assets only.

## Required Cloudflare setup

1. Create an R2 bucket named `starkies` (or choose another name and use it consistently).
2. Create an R2 API token with **Object Read & Write** permission scoped only to that bucket.
3. Copy the account ID, access key ID and secret access key. The secret is shown only once.
4. Enable public access for the bucket using a custom domain. Prefer a dedicated hostname such as `images.starkies.lat` managed by Cloudflare. The R2 development URL can be used temporarily for setup, but should not be treated as the production delivery domain.
5. Confirm that a test object can be opened publicly over HTTPS.

## Vercel environment variables

Add these variables to the Vercel project(s) that serve the Admin/API, for **Production** and the environment used to validate the migration:

- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: R2 API token access key ID.
- `R2_SECRET_ACCESS_KEY`: R2 API token secret access key.
- `R2_BUCKET_NAME`: `starkies` (or the bucket name you created).
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


## GitHub secrets for the final history purge

The repository includes a separate, manually triggered workflow that refuses to rewrite history until a live migration audit succeeds. Before using it, add these repository Actions secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the StarKies Firebase service account JSON.
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`: the same account, bucket and public URL used by Vercel.
- `R2_AUDIT_ACCESS_KEY_ID` and `R2_AUDIT_SECRET_ACCESS_KEY`: a **separate R2 Object Read-only token** scoped to the StarKies bucket. Do not reuse the write token if you can avoid it.
- Optionally, `GH_HISTORY_REWRITE_TOKEN`: a GitHub token with Contents: Read and write that is allowed to force-push the repository branches. If omitted, the workflow uses its `GITHUB_TOKEN`; branch protection may block that push.

After the migration page reports zero pending images and zero failures, and the storefront and promotion banners have been visually checked:

1. Merge the R2 implementation PR and wait for the production deployment.
2. Run the Admin image migration and let the daily orphan cleanup remove any abandoned uploads.
3. Confirm the R2 migration audit secrets above are configured in GitHub.
4. Open Actions → **Purge migrated image history** → Run workflow, on `main`.
5. Enter exactly `PURGE_MIGRATED_IMAGES` as the confirmation.

The workflow independently checks every product, public catalog projection, promotion banner and image-index reference; it also issues a signed R2 HEAD request for every referenced object. It stops if any live image is still outside R2, any reference count differs, any R2 object is missing, or any unreferenced indexed object remains.

Only then does it rewrite all fetched branches and tags to remove the old dynamic image paths from Git history and force-push the rewritten refs. This invalidates old commit hashes and existing clones; collaborators must re-clone or carefully reset their local branches afterward. If GitHub branch protection prevents force-pushes, an administrator must temporarily allow the authorized rewrite token to bypass that restriction for this one operation.
