# Firestore root-level schema — StarKies

## Objective

Remove `businesses/starkies` and the legacy `collections/{name}/records` hierarchy. All live business data is stored in root-level collections. This PR includes the application changes and migration to schema version 3; no Firebase data migration is executed automatically.

## Document contract (schema v3)

Collection records are stored as their native fields. There is no `value` envelope and no `index` envelope.

- `sortIndex`: numeric ordering metadata for list views.
- Stable document ID: `id`, then `code`, then legacy document ID when neither field exists.
- Settings use `settings/{key}` with the setting payload under `data`, since settings may be arrays or primitive values.
- `system/stateMeta` contains migration state and collection metadata directly.
- `migrationArchives/{archiveId}` retains original imported backups separately from active records.

## Collections

| Domain | Root path | Notes |
| --- | --- | --- |
| Ingredients | `ingredients/{ingredientId}` | Native ingredient fields plus `sortIndex` |
| Recipes | `recipes/{recipeId}` | Native recipe fields plus `sortIndex` |
| Customers | `customers/{customerId}` | Native customer fields plus `sortIndex` |
| Orders | `orders/{orderId}` | Native order snapshot plus `sortIndex` |
| Dough bases | `doughBases/{baseId}` | Native fields plus `sortIndex` |
| Production history | `productionHistory/{runId}` | Native fields plus `sortIndex` |
| Cash movements | `cashMovements/{movementId}` | Native fields plus `sortIndex` |
| Inventory | `inventory/{itemId}` | Native fields plus `sortIndex` |
| Delivery zones | `deliveryZones/{zoneId}` | Native fields plus `sortIndex` |
| Settings | `settings/{key}` | `data` holds the setting payload |
| Metadata | `system/stateMeta` | Schema version and migration status |
| Internal legacy catalog data | `catalog/{recordId}` | Migrated privately; never publicly readable |
| Public catalog projection | `publicCatalog/{productId}` | Public, published product fields only |
| Customer phone index | `customerPhoneLookup/{sha256(normalizedPhone)}` | Stable customer ID lookup |
| Order phone index | `orderPhoneLookup/{sha256(normalizedPhone)}` | Most recent order ID lookup |
| Product sales | `productSalesStats/{productId}` | Delivered units sold, updated transactionally |
| Rate limits | `publicOrderRateLimits/{key}` | Server-maintained abuse protection |
| Migration archive | `migrationArchives/{archiveId}` | Original backup archive |

The public catalog is a projection, not the source of truth. Legacy `catalog` records stay private and are not copied into the public projection. Only explicitly published catalog data is public. Phone indexes and rate-limit records are server-only. Firestore rules default-deny access and require approved admin authentication for private root collections.

## Migration

`scripts/migrate-firestore-root.mjs` migrates the legacy hierarchy into schema v3. It flattens each collection record to native fields, carries its order into `sortIndex`, converts settings to `data`, preserves original archives, links orders to canonical customer IDs, and creates the customer/order phone indexes and initial sales aggregates.

The script is:
- dry-run by default;
- guarded against duplicate target IDs, phone collisions, pre-existing unplanned destination documents, and conflicting documents;
- backed by a private local JSON backup before writing;
- non-destructive to the old namespace.

The script requires `FIREBASE_SERVICE_ACCOUNT_JSON`; by default it only accepts project `starkies`. For a controlled staging copy with a different project ID, explicitly set `FIREBASE_EXPECTED_PROJECT_ID` to that exact staging project ID. Never commit the service-account secret or generated `.migration-backups/` files.

Commands:

```bash
npm run firestore:migrate:root
npm run firestore:migrate:root:apply
npm run firestore:migrate:root:verify
```

## Recommended rollout

1. Review the dry-run report and resolve all conflicts.
2. Run the migration against a controlled copy or staging project first.
3. Apply the migration to the intended Firebase project only after explicit approval.
4. Verify counts, stable IDs, customer/order lookup, delivered-sales aggregates, admin CRUD, production, purchasing, PDF endpoints, and public catalog output.
5. Switch traffic only after validation. Keep legacy documents until the new schema is proven in production; cleanup is a separate, explicitly approved operation.

The GitHub PR updates the application code and rules but does not run the migration or deploy the project.

## Admin read optimization

Admin now requests a scoped set of collections per feature instead of loading every collection during service initialization. The summary initially loads recipes and ingredients and uses a Firestore `count()` aggregation for pending orders. The Orders tab loads 25 documents per request using a Firestore cursor and exposes a “Load more” action; status filters are applied on the server before documents are returned. Opening the Customers tab loads the complete order set because its current UI calculates per-customer historical totals locally. Explicit manual synchronization still refreshes the full state.

The repository also exposes reusable `getCollectionPage` and `countCollection` methods for future list screens. Queries use cursors, not offsets, so page navigation does not pay to read skipped documents. The status-filtered orders query requires the composite index declared in `firestore.indexes.json`; deploy it alongside Firestore rules.

Firestore filters, `limit`, cursors and ordinary indexed queries are available on the free quota. They consume the free read quota rather than requiring a paid plan by themselves. The current Firebase free quota includes 50,000 document reads per day; aggregation queries such as `count()` are billed according to index entries read, with a minimum of one document read. See the official [Firestore pricing documentation](https://firebase.google.com/docs/firestore/pricing).

Known limitation: the Customers tab still loads all orders to preserve exact historical totals, and the current generic search remains client-side over the records already loaded. Sales aggregates are maintained transactionally when an existing delivered order is edited, moved into/out of delivered status, or deleted through the Admin Firestore repository. Any additional write path that changes delivered orders must apply the same transaction logic; bypassing it would make the aggregate stale. A later pass can replace customer totals with server-side aggregations and implement indexed prefix search/search tokens without changing the root schema.


## Shared Admin cache and cloud-change invalidation

Admin now keeps loaded collection view models in the root-scoped DataService instead of re-fetching them whenever a feature page is revisited. Concurrent requests for the same collection are coalesced. The Orders page also caches its loaded cursor page(s) per status filter and reuses them while the cloud revision is unchanged.

Freshness uses one Firestore listener on the small `system/stateMeta` document rather than one permanent listener per collection. Changes published by the public order endpoint, or by Admin write transactions that update metadata, invalidate the in-memory cache. The next visit to an affected feature reloads its requested collections; the Orders page fetches a fresh first page. This listener costs an initial metadata read and additional reads when that document changes, rather than continuously polling every collection. Admin's own generic upsert/delete operations publish a metadata revision after the write.

This is an invalidate-on-change cache, not a local persistence layer: refreshing the browser loses the in-memory cache, which is safe and avoids storing private business data in browser storage. Explicit “sync” actions still force a fresh read. The cache does not automatically redraw an already-open feature at the exact moment metadata changes; it guarantees the next feature load won't reuse a stale cached snapshot. A future live-view requirement can subscribe only while the relevant feature is active.


## Admin search without full-collection reads

Orders and customers receive a normalized `searchTokens` array during migration. Each record stores prefixes for its identifier, name, phone and address, with accents and punctuation normalized. Admin searches only after two characters and debounces input by 300 ms. The query uses `array-contains` against `searchTokens`, applies the selected order status on Firestore, and caps each response at 50 matches; it does not download all records and filter them in the browser. Search results are cached by normalized term, status and cloud revision, so revisiting the same search does not issue another query until metadata changes. The public order endpoint and Admin repository maintain tokens on subsequent writes.

The query is prefix-oriented rather than arbitrary substring/full-text search: e.g. searching `mar` matches a name beginning with “María” or an indexed word beginning with “mar”; a fragment from the middle of a word is not guaranteed to match. The order query combining `searchTokens array-contains` with `status ==` uses the composite index declared in `firestore.indexes.json`. Customer search uses Firestore's automatic single-field array index.

Because this adds a derived field, the migration's dry-run and verify stages must be run before production; the current script calculates tokens when it prepares destination documents. Existing production documents are not searchable through the new query until migrated with `searchTokens`.


## Derived business statistics

- `businessStats/sales` stores delivered-order count, delivered revenue and sold units. The migration and backup import seed it from existing records.
- `productSalesStats/{recipeId}` stores sold units per product. `productionDemand/{recipeId}` stores units in pending orders per recipe.
- `businessStats/production` stores production run, batch, unit and cost totals; registration of a production batch updates it in the same transaction as inventory deductions and production history.
- Admin order upserts and deletions update sales and demand aggregates transactionally. The public order endpoint adds pending demand in the same transaction as order creation. Backup import and the root-schema migration rebuild the derived documents.
- Finance loads delivered orders only when it needs to reconcile unprocessed ledger entries and uses the sales aggregate for the sales overview. Production loads pending orders only for individual command checkboxes; aggregate demand drives recipe planning, and aggregate production totals drive its summary cards.
- Metadata publishes changed keys and increments a revision for order, production, cash, ingredient-purchase and setting writes. The Admin listener refreshes only affected collections or targeted customer documents, plus the relevant aggregates. The aggregates should be validated against the source orders/history in staging before the migration is approved.


### Legacy production-history mapping

The legacy collection `businesses/starkies/collections/productions/records` is mapped into the canonical root collection `productionHistory/{id}`. This is the history collection consumed by Admin v3; it is not copied into a parallel root `productions` collection. The migration builds `businessStats/production` from the mapped production records (`batches`, `totalYield`, `outputUnit`, and `calculatedCost`). Metadata collection keys and record counts describe the destination schema, so the 12 legacy `productions` records are counted under `productionHistory`. If records from both legacy `productions` and `productionHistory` map to the same destination ID, the migration stops with a duplicate-target error rather than overwriting either record.
