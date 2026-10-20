# StarKies Admin — Firebase setup

This branch adds the Firebase Web SDK and a small client/auth service. It does
**not** import or overwrite business data. The original backup in
`apps/admin/src/assets/seed.json` is intentionally preserved.

## 1. Configure the web app

In Firebase Console, open project `starkies` → Project settings → General →
Your apps. Copy the configuration for the registered web app into
`apps/admin/src/app/core/firebase/firebase.config.ts`.

Only use the Firebase **Web app config** from the SDK snippet. Do not commit a
service-account JSON, Admin SDK private key, or other server credentials.
Firebase web config is visible to browsers; data protection comes from
Authentication and Firestore Security Rules.

## 2. Enable sign-in

In Authentication → Sign-in method, enable Email/Password. Create approved
business user accounts from the Firebase Console. This starter deliberately
does not implement public sign-up.

After creating each user, copy their Authentication UID. In Firestore, create
a document at `adminUsers/{UID}` (the document can contain a harmless field
such as `role: "admin"`). This is the allow-list used by `firestore.rules`.

## 3. Deploy and review Firestore rules

Review `firestore.rules` before deployment. It permits business data under
`businesses/starkies/**` only to authenticated, allow-listed users. It permits
public reads only under `publicCatalog/**` for the future public catalog.
Unmatched paths are denied.

Deploy the rules using Firebase CLI after authenticating and selecting the
existing project:

```bash
npx firebase-tools login
npx firebase-tools use starkies
npx firebase-tools deploy --only firestore:rules
```

Do not use test mode or open read/write rules.

## 4. Data migration status

No migration is run automatically. The existing JSON seed/backup remains
unchanged. Before importing it, map and validate the full `state` schema,
decide the Firestore collection layout, and perform a one-time import with
duplicate protection. Do not treat the current localStorage data as migrated
until record counts and financial totals are reconciled against the original
backup.

## 5. Vercel and CI

The admin CI workflow builds `admin` only. Firebase rules deployment and Vercel
production deployment should be separate controlled workflows, gated on the
relevant secrets and review. Do not store credentials in source files.
