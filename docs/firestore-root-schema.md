# Firestore root-level schema proposal

## Goal

Remove the businesses/starkies namespace for this single-business deployment. Collections live at Firestore root. This is a schema migration, not a production migration: the script is dry-run by default and never deletes legacy documents.

## Target paths

| Domain | Root path | Document model |
| --- | --- | --- |
| Ingredients | ingredients/{ingredientId} | { index, value } during compatibility phase |
| Recipes | recipes/{recipeId} | { index, value } |
| Customers | customers/{customerId} | { index, value }; normalized phone lookup uses deterministic IDs |
| Orders | orders/{orderId} | { index, value }; order snapshots retain price/name at purchase time |
| Dough bases | doughBases/{baseId} | { index, value } |
| Production history | productionHistory/{runId} | { index, value } |
| Cash movements | cashMovements/{movementId} | { index, value } |
| Delivery zones | deliveryZones/{zoneId} | { index, value } if zones remain a collection |
| Settings | settings/{settingKey} | { value } |
| System metadata | system/stateMeta | schema version, migration state, collection/setting keys, counts |
| Public catalog projection | publicCatalog/{productId} | { index, value }; public read-only to clients |
| Migration archive | migrationArchives/{archiveId} | original backup archive |
| Public order rate limits | publicOrderRateLimits/{key} | server-only operational data |

Root collection names are domain-specific. Keep the existing value envelope for the first migration to minimize UI changes; a later, separately tested migration can flatten documents after consumers are typed.

## Data contract rules

- Document IDs are stable entity IDs (value.id, then value.code, then legacy document ID). The migration aborts on duplicate destination IDs.
- Keep index only as a transitional display-order field. Do not read an entire collection merely to find one record; direct reads/writes must use stable document IDs.
- Orders are immutable snapshots of commercial facts: product name, unit price, quantity, delivery fee and totals at purchase time.
- Customer identity and lookup IDs use a single normalized-phone algorithm. Do not expose phone numbers in public collections.
- Derived statistics (best sellers, totals) should be maintained separately from order history and updated idempotently on state transitions.
- Public catalog is a materialized projection, not the source of truth. Only publish explicitly visible, non-archived products and non-sensitive settings.
- Root collections do not imply public access. Rules default-deny and allow admin access only for approved authenticated users; the public catalog gets read-only public access.

## Migration behavior

npm run firestore:migrate:root performs a dry run. npm run firestore:migrate:root:apply writes destination documents and a local private backup, but does not delete the old namespace. npm run firestore:migrate:root:verify checks that every planned destination document exists and matches.

The migration requires a complete legacy system/stateMeta and a service account for project starkies. It refuses duplicate target IDs and conflicting destination documents. Review the dry-run report and keep the generated .migration-backups/ file private.

## Execution recommendation

Run locally from a trusted machine after exporting the service-account JSON into FIREBASE_SERVICE_ACCOUNT_JSON. Do not commit the service-account file or backup. GitHub Actions can run this only if secrets and an environment with manual approval are configured; local execution is safer for the first production migration because it avoids placing the production credential in a CI job. The migration is not run automatically by this PR or deployment.

## Review gate for this draft PR

The application repositories and API handlers are being switched to root-level paths on this branch. The deployed rules file still contains the legacy businesses/starkies matches; do not merge or deploy this branch until firestore.rules is updated and reviewed to authorize only the intended root collections and expose only publicCatalog for unauthenticated reads. The GitHub editing connection did not accept the rules-file change, so this remains an explicit blocker rather than a hidden assumption.
