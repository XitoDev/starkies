# Cloudflare R2 image storage

StarKies stores all dynamic product photos and promotion banners in Cloudflare R2. Git contains application code and static interface assets only; it is not an image catalogue or a fallback source.

## Required Cloudflare setup

1. Use the StarKies R2 bucket.
2. Create an R2 API token with **Object Read & Write** permission scoped only to that bucket.
3. Enable public access through the custom HTTPS domain `images.starkies.lat`.
4. Keep the account ID, access key and secret only in Vercel environment variables and GitHub Actions secrets.

## Environment variables

The Admin/API deployment requires:

- `R2_ACCOUNT_ID`: Cloudflare account ID.
- `R2_ACCESS_KEY_ID`: R2 API token access key ID.
- `R2_SECRET_ACCESS_KEY`: R2 API token secret access key.
- `R2_BUCKET_NAME`: StarKies bucket name.
- `R2_PUBLIC_BASE_URL`: public HTTPS base URL, normally `https://images.starkies.lat`.
- `CRON_SECRET`: long random secret used by the scheduled orphan-image cleanup endpoint.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: StarKies Firebase service account used by the authenticated image APIs.

Never commit these secrets or expose them to browser configuration.

## Image lifecycle

- Admin accepts JPG, PNG and WebP, decodes the image in the browser, and converts it to WebP with a 3 MB output limit.
- The API validates the WebP signature and calculates SHA-256 itself. The object key is content-addressed: `images/<sha256>.webp`.
- Uploading identical WebP bytes reuses the existing object.
- Firestore `imageAssets/<sha256>` stores the public URL, object key and explicit reference list. It is an index, not a copy of the image.
- After a product or promotion save/delete succeeds, the Admin API synchronizes the `product:<id>` or `promotion:<id>` reference. An old object is deleted only when its reference list is empty.
- Abandoned uploads with zero references are removed by the daily `/api/image-cleanup` cron after 24 hours. Configure `CRON_SECRET` for the cron authorization header.
- Product photos and promotion banners must be changed from their Admin editors. There is no repository image map, legacy CDN fallback, or image migration screen.

## Audit and repository cleanup

The repository's **Quality Gate** runs a read-only live audit on the cleanup PR. It checks:

- Published recipe and public catalog records have the same canonical R2 image.
- Public products and promotion image references resolve to managed R2 objects.
- `catalogDrafts` no longer stores image fields.
- Every referenced object exists in R2 and has a matching `imageAssets` document, reference list, `refCount`, status and object key.
- No unreferenced indexed object remains.

The audit requires these GitHub Actions secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: StarKies Firebase service account JSON.
- `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`: the R2 account, bucket and public domain.
- `R2_AUDIT_ACCESS_KEY_ID` and `R2_AUDIT_SECRET_ACCESS_KEY`: a separate R2 **Object Read-only** token scoped to the StarKies bucket.

The final **Purge migrated image history** workflow is deliberately manual and runs only from `main`. It repeats the live audit before rewriting history. It refuses to run while any pull request is open, then removes old product/promotion images, legacy image maps and their paths from every fetched branch and tag. This avoids invalidating an in-progress PR.

Before running the purge:

1. Upload any missing product or promotion image from its Admin editor. The normal upload flow stores it in R2 and synchronizes the Firestore reference; no second migration is needed.
2. Wait for the daily orphan cleanup to remove old zero-reference R2 objects, if any remain.
3. Merge all related PRs and wait for the production deployment.
4. Ensure the audit secrets above are configured and the cleanup Quality Gate passed.
5. Open Actions → **Purge migrated image history** → Run workflow on `main`.
6. Enter exactly `PURGE_MIGRATED_IMAGES`.

Optionally configure `GH_HISTORY_REWRITE_TOKEN` with Contents: Read and write permission if branch protection prevents the workflow token from force-pushing. The workflow rewrites every fetched branch and tag; old commit hashes become invalid and collaborators must re-clone or carefully reset their local clones.

## S3 request signing

The application uses the Cloudflare-compatible `aws4fetch` signer with service `s3` and region `auto`. Keep this dependency pinned in the root manifest and lockfile.

The Admin connection check performs a temporary object PUT through the authenticated S3 API, fetches it through the public domain, compares the returned bytes, and deletes it. It never touches product or promotion assets or Firestore references.
