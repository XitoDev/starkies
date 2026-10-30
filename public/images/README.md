# Imágenes de StarKies

## Productos

Cada producto tiene **una sola imagen canónica** dentro de `public/images/products/`. La misma URL se guarda en `recipes.image` y se publica en `publicCatalog.image`; `catalogDrafts` conserva únicamente metadatos de presentación y no almacena imágenes.

Los archivos actuales se identifican con el ID del producto. Cuando existe un sufijo UUID, forma parte del nombre canónico y debe conservarse. Las imágenes de Recetas y Catálogo no se duplican ni usan prefijos `recipe-` o `catalog-`.

| ID de producto | Archivo canónico |
|---|---|
| `02885ca5-c58c-48a7-b116-cd614290c697` | `products/02885ca5-c58c-48a7-b116-cd614290c697.png` |
| `0794f338-588b-460d-b002-ee4e614826c9` | `products/0794f338-588b-460d-b002-ee4e614826c9.png` |
| `0a783c0b-8993-41a0-b986-b03b57674ca9` | `products/0a783c0b-8993-41a0-b986-b03b57674ca9-ade40aeb-b2ff-4c3e-8ec6-fe9364df1485.png` |
| `1b601e8d-17da-4f66-909d-5324bce3acfe` | `products/1b601e8d-17da-4f66-909d-5324bce3acfe-c28bc795-6020-411e-9b87-5f179c0c7019.png` |
| `202edec5-9b83-4e9b-a466-c32bd1a05d44` | `products/202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg` |
| `5954e0af-d58c-40ce-a79d-cbcff10c7b78` | `products/5954e0af-d58c-40ce-a79d-cbcff10c7b78.png` |
| `5cbf3e5f-edb0-490b-b544-8741ba6cffe7` | `products/5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png` |
| `6539b2bd-5e58-4485-8ff9-b625d1aa6147` | `products/6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg` |
| `85e499f3-37c9-4701-bf89-5176007ce546` | `products/85e499f3-37c9-4701-bf89-5176007ce546.png` |
| `93492b6c-f402-4ca3-9ccd-9dfbd957c40a` | `products/93492b6c-f402-4ca3-9ccd-9dfbd957c40a-55f6444e-79a8-4dcb-b5a0-78dfd3cf18be.png` |
| `99e32e0c-61fb-41b1-8018-fa18ef655750` | `products/99e32e0c-61fb-41b1-8018-fa18ef655750.png` |
| `e9005152-d579-444f-905f-a06a5ad3d74b` | `products/e9005152-d579-444f-905f-a06a5ad3d74b.jpg` |
| `f126ae46-9eee-4ac2-8cff-d2f954d708e9` | `products/f126ae46-9eee-4ac2-8cff-d2f954d708e9.png` |

El mapeo operativo está en `image-map.json`. Las referencias heredadas `/api/recipe-image?id=...` y los nombres `recipe-*`/`catalog-*` se pueden resolver cuando su UUID coincide con una clave `product:<id>` del mapa. El migrador aplica esta equivalencia aunque el ID de la imagen antigua sea distinto al ID del documento de Recetas. Si no existe una correspondencia verificable, el producto queda sin resolver y la migración no escribe ningún cambio.

## Banners de promociones

Los banners viven en `public/images/promotions/`. No se guardan en la carpeta de productos ni se incluyen en el mapeo de imágenes de producto.

## Migración de Firebase

La migración de referencias antiguas se realiza con:

```bash
npm run migrate:product-images
```

El comando anterior solo muestra un resumen (*dry run*). Para aplicar los cambios en Firebase:

```bash
npm run migrate:product-images -- --apply
```

Configura `FIREBASE_SERVICE_ACCOUNT_JSON` con la cuenta de servicio del proyecto `starkies`. La prioridad es: mapa `product:<id>` (archivo actual de `products/`), imagen del borrador de catálogo, imagen de catálogo heredada en Recetas, imagen publicada en `publicCatalog` y, solo si no existe ninguna imagen de catálogo, `recipes.image`. El *dry run* muestra conflictos, las referencias antiguas recuperadas mediante el mapa y las referencias sin resolver. Con `--apply`, el script sincroniza `recipes.image` y `publicCatalog.image`, elimina `recipes.catalogImage`, elimina `catalogDrafts.image` y cualquier `catalogImage` residual de esas colecciones. Si hay referencias que no puede resolver, las deja intactas y aplica únicamente los cambios de productos con imagen canónica verificada. Nunca consulta el servidor antiguo, no sustituye imágenes sin correspondencia y no borra archivos ni documentos.
