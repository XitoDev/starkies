# Firestore: separación del catálogo y limpieza de colecciones

## Modelo de datos

- `recipes/{id}`: fórmula, ingredientes, rendimiento, categoría interna, precio y datos operativos de la receta.
- `catalogDrafts/{id}`: metadatos privados de publicación que edita administración (visibilidad, imagen, etiqueta, color y descripción pública).
- `publicCatalog/{id}`: solo campos destinados al sitio público: identificador, nombre, categoría pública, descripción pública, etiqueta opcional, precio, clasificación NY, disponibilidad e imagen.
- `publicCatalog/catalog-settings`: zonas de entrega y presentaciones publicables.
- `settings`, `productSalesStats` y `system/stateMeta` siguen siendo datos internos; el endpoint público no serializa documentos de esas colecciones.

## Migración de la proyección

Usar credenciales de una cuenta de servicio del proyecto correcto. No guardar el JSON en el repositorio ni imprimirlo en logs.

1. Ejecutar simulación: `npm run firestore:catalog:projection`.
2. Revisar los conteos y confirmar que el proyecto es el correcto.
3. Aplicar: `npm run firestore:catalog:projection:apply`.
4. Verificar: `npm run firestore:catalog:projection:verify`.
5. Confirmar manualmente el catálogo público y el editor administrativo antes de desplegar el cambio que hace que el endpoint lea exclusivamente `publicCatalog`.

El script de aplicación crea una copia local con permisos restrictivos en `.migration-backups/`. Guardar esa copia en un lugar seguro antes de eliminar colecciones.

## Limpieza de colecciones heredadas

El script de limpieza opera únicamente sobre esta lista explícita de candidatas:

- `addressTypes`
- `baseLinkAudit`
- `businesses`
- `catalog`
- `cookieCounts`
- `deletedIngredients`
- `deletedOrders`
- `deletedProductions`
- `deliveryStockAdjustments`
- `financeArchives`
- `migrationArchives`

Primero ejecutar `npm run firestore:cleanup:legacy` y revisar todos los conteos. La aplicación destructiva requiere además `--apply` y `--confirm-delete-legacy-collections`, que están incluidos en `npm run firestore:cleanup:legacy:apply`.

La limpieza guarda un respaldo local de los documentos antes de borrarlos, elimina también subcolecciones de las colecciones candidatas y quita sus referencias del manifiesto `system/stateMeta`. No se incluyen en la lista las colecciones de operación actual, como clientes, pedidos, recetas, ingredientes, movimientos financieros, producción, índices de búsqueda, estadísticas o configuración.

**No ejecutar la limpieza desde CI ni sin verificar el proyecto y la copia de respaldo.** El script no se ejecutó durante la preparación de esta rama; la base de datos no ha sido modificada por estos cambios de código.
