# Imágenes de StarKies: archivos identificados por su código real

Las fotos de recetas se sirven desde el repositorio público mediante jsDelivr. Los archivos se nombran con el ID que aparece en el respaldo original en `/api/recipe-image?id=...`, usando el prefijo `recipe-` y conservando la extensión original.

Los archivos fueron renombrados en Git sin volver a codificar ni recomprimir las imágenes: se conservaron los mismos blobs binarios.

| Receta según el mapeo actual | Archivo | Estado de la asociación |
|---|---|---|
| Brownie Classic | `recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg` | Verificada visualmente |
| Avena Classic | `recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg` | Verificada visualmente |
| Sunny Carrot | `recipe-85e499f3-37c9-4701-bf89-5176007ce546.png` | Pendiente de confirmar foto |
| Chips Stars | `recipe-02885ca5-c58c-48a7-b116-cd614290c697.png` | Pendiente de confirmar foto |
| Velvet Kiss | `recipe-f126ae46-9eee-4ac2-8cff-d2f954d708e9.png` | Pendiente de confirmar foto |
| Cinna Moon | `recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png` | Pendiente de confirmar foto |
| Nuti Dream | `recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png` | Pendiente de confirmar foto |
| Lemon Glow | `recipe-0794f338-588b-460d-b002-ee4e614826c9.png` | Pendiente de confirmar foto |
| Brownie Bliss | `recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png` | Pendiente de confirmar foto |
| Canela Classic | `recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg` | Pendiente de confirmar foto |

## Galería

### Brownie Classic — Verificada visualmente

![Brownie Classic](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg)

`recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg`

### Avena Classic — Verificada visualmente

![Avena Classic](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg)

`recipe-202edec5-9b83-4e9b-a466-c32bd1a05d44.jpg`

### Sunny Carrot — Pendiente de confirmar foto

![Sunny Carrot](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-85e499f3-37c9-4701-bf89-5176007ce546.png)

`recipe-85e499f3-37c9-4701-bf89-5176007ce546.png`

### Chips Stars — Pendiente de confirmar foto

![Chips Stars](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-02885ca5-c58c-48a7-b116-cd614290c697.png)

`recipe-02885ca5-c58c-48a7-b116-cd614290c697.png`

### Velvet Kiss — Pendiente de confirmar foto

![Velvet Kiss](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-f126ae46-9eee-4ac2-8cff-d2f954d708e9.png)

`recipe-f126ae46-9eee-4ac2-8cff-d2f954d708e9.png`

### Cinna Moon — Pendiente de confirmar foto

![Cinna Moon](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png)

`recipe-5cbf3e5f-edb0-490b-b544-8741ba6cffe7.png`

### Nuti Dream — Pendiente de confirmar foto

![Nuti Dream](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png)

`recipe-99e32e0c-61fb-41b1-8018-fa18ef655750.png`

### Lemon Glow — Pendiente de confirmar foto

![Lemon Glow](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-0794f338-588b-460d-b002-ee4e614826c9.png)

`recipe-0794f338-588b-460d-b002-ee4e614826c9.png`

### Brownie Bliss — Pendiente de confirmar foto

![Brownie Bliss](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png)

`recipe-5954e0af-d58c-40ce-a79d-cbcff10c7b78.png`

### Canela Classic — Pendiente de confirmar foto

![Canela Classic](https://cdn.jsdelivr.net/gh/XitoDev/starkies@eed4ced5756232d2957340e18b86d18877e833ae/public/images/recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg)

`recipe-e9005152-d579-444f-905f-a06a5ad3d74b.jpg`


## Importante sobre el mapeo

Las asociaciones de **Brownie Classic** y **Avena Classic** se comprobaron visualmente. Las otras ocho se conservaron según el mapeo provisional por orden de los archivos descargados; antes de considerar esa relación definitiva, hay que revisar esta galería contra las recetas en la Preview y ajustar solo las asociaciones que no coincidan.

El administrador mantiene ese mapeo en `apps/admin/src/app/pages/recetas/recetas.ts`. Si una foto corresponde a otra receta, no hace falta volver a importar Firebase: basta con corregir el ID asociado al nombre del archivo.
