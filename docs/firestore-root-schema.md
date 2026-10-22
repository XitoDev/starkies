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

The script requires `FIREBASE_SERVICE_ACCOUNT_JSON` for project `starkies`. Never commit that secret or the generated `.migration-backups/` files.

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
