# StarKies Admin — Vercel preview setup

The workflow `.github/workflows/admin-vercel-deploy.yml` is deliberately **manual and preview-only** for now. It does not publish production and does not deploy the future Catalog app.

## 1. Confirm the Vercel project settings

Open the Vercel project that is meant to host **StarKies Admin** → **Settings → Build and Deployment** and set:

- Root Directory: `.` (repository root)
- Install Command: `npm ci`
- Build Command: `npx ng build admin --configuration production`
- Output Directory: `dist/admin/browser`

Make sure this is the Admin project, not the future Catalog project. The CLI build uses the project's saved settings.

## 2. GitHub Actions secrets

In GitHub → repository **Settings → Secrets and variables → Actions**, add repository secrets with these exact names:

- `VERCEL_TOKEN`: a Vercel access token allowed to deploy this project.
- `VERCEL_ORG_ID`: the account/team ID that owns the project.
- `VERCEL_ADMIN_PROJECT_ID`: the ID of the Admin Vercel project (not Catalog).

Do not put token values in source files, workflow YAML, logs, or chat.

## 3. Run the preview deployment

1. Open the repository's **Actions** tab.
2. Select **Deploy Admin Preview to Vercel** in the left sidebar.
3. Click **Run workflow**.
4. In the branch dropdown, select `feat/admin-angular-firebase-foundation`.
5. Click the green **Run workflow** button.

The workflow checks that all three secrets exist, pulls Vercel's **preview** settings, builds the selected branch and deploys a preview URL. It does not use `--prod`.

If the run fails, open the failed step and share the error text only. Never share token values.

## 4. Firebase and data migration

The Angular web config is in `apps/admin/src/app/core/firebase/firebase.config.ts`. These are public browser SDK settings, not server credentials. Firestore data access is protected by the deployed rules and the `adminUsers/{uid}` allow-list.

The original `apps/admin/src/assets/seed.json` file has been removed from current `main` and feature branch trees. Its previous commit remains in the public Git history, so this deletion does not erase historical copies. Download the original JSON from its historical commit when you are ready to migrate, then sign in to the Admin preview and use the explicit `/migracion` screen. The import is not automatic and has not been run yet.

Before production, validate login, successful Firestore access, migration record counts, and business totals. Production deployment should be enabled only after preview validation and review of the PR.
