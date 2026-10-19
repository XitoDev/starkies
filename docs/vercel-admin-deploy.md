# Vercel deployment — StarKies Admin

The workflow `.github/workflows/admin-vercel-deploy.yml` deploys **only Admin** from `main`. It does not deploy `apps/catalog`.

## One-time Vercel project setup

1. Open the existing Vercel project for StarKies Admin.
2. In **Settings → Build and Deployment**, set:
   - Root Directory: `.` (repository root)
   - Install Command: `npm install --legacy-peer-deps`
   - Build Command: `npx ng build admin --configuration production`
   - Output Directory: `dist/admin/browser`
3. Confirm the project is linked to the `XitoDev/starkies` repository. Do not merge the pull request into `main` until the preview build has been checked.

## Add GitHub Actions secrets

In GitHub, open repository **Settings → Secrets and variables → Actions → New repository secret** and add:

- `VERCEL_TOKEN`: a Vercel access token with permission to deploy this project.
- `VERCEL_ORG_ID`: the Vercel team/account ID from the project's linked `.vercel/project.json` or project settings.
- `VERCEL_ADMIN_PROJECT_ID`: the Vercel project ID for the Admin project (not the future Catalog project).

Never place these values in source files or commit `.vercel/project.json`.

The workflow intentionally skips deployment if any required secret is missing. It runs on pushes to `main` that touch Admin/shared build files or can be started manually from the Actions tab. Because the PR is still a draft and targets `main`, production will not deploy until the changes are reviewed and merged.

## Firebase

The Angular web configuration is in `apps/admin/src/app/core/firebase/firebase.config.ts`. It contains public web SDK configuration, not a server credential. Firestore security depends on the deployed Security Rules and the `adminUsers/{uid}` allow-list.

Do not import real business data until login, Firestore access, and the migration are tested. The catalog has its own future Vercel project and should not be deployed by this workflow.
