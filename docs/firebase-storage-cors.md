# Firebase Storage CORS configuration

The admin browser origin currently observed in the console is `https://starkies.vercel.app`.
The Storage bucket is `starkies.firebasestorage.app`.

CORS is a Google Cloud Storage bucket setting; deploying Firebase Storage security rules does **not** set CORS. A project owner/storage admin must apply the policy once from Google Cloud Shell or a machine authenticated with Google Cloud CLI and permission to update bucket metadata.

From the repository root, run:

```sh
gcloud storage buckets update gs://starkies.firebasestorage.app --cors-file=storage.cors.json
gcloud storage buckets describe gs://starkies.firebasestorage.app --format="json(cors_config)"
```

Confirm that the resulting policy includes `https://starkies.vercel.app` and the methods in `storage.cors.json`. If the actual deployed admin URL differs, add that exact origin to the JSON before applying it. Do not use a wildcard origin for an authenticated admin application.

After applying the bucket policy, hard-refresh the admin page and test uploading a small JPG/PNG/WebP. If image upload works but Firestore still reports `net::ERR_BLOCKED_BY_CLIENT`, retry with browser extensions disabled or in a clean browser profile. That error commonly comes from a client-side blocker and is separate from Storage CORS.

The application-side timeout/error handling prevents the Save UI from spinning forever, but it cannot apply this cloud-side CORS configuration itself.
