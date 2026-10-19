# Inventario visual de imágenes de StarKies

Esta galería permite identificar cada archivo antes de asociarlo con una receta. Los nombres genéricos se conservan por ahora; no es necesario renombrar físicamente los archivos para usarlos con jsDelivr.

| Archivo | Vista |
|---|---|
| `recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg` | ![recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg) |
| `recipe-image.jpg` | ![recipe-image.jpg](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image.jpg) |
| `recipe-image (1).jpg` | ![recipe-image (1).jpg](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%281%29.jpg) |
| `recipe-image.png` | ![recipe-image.png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image.png) |
| `recipe-image (1).png` | ![recipe-image (1).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%281%29.png) |
| `recipe-image (2).png` | ![recipe-image (2).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%282%29.png) |
| `recipe-image (3).png` | ![recipe-image (3).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%283%29.png) |
| `recipe-image (4).png` | ![recipe-image (4).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%284%29.png) |
| `recipe-image (5).png` | ![recipe-image (5).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%285%29.png) |
| `recipe-image (6).png` | ![recipe-image (6).png](https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/recipe-image%20%286%29.png) |

## Mapeo que usa el administrador

El administrador conserva los IDs de imagen originales y resuelve los archivos mediante un mapa en `apps/admin/src/app/pages/recetas/recetas.ts`. Las dos primeras asociaciones se verificaron visualmente; las otras se asignaron según la secuencia de las descargas y deben revisarse en la Preview:

- Brownie Classic → `recipe-6539b2bd-5e58-4485-8ff9-b625d1aa6147.jpg` (verificada)
- Avena Classic → `recipe-image.jpg` (verificada)
- Sunny Carrot → `recipe-image.png`
- Chips Stars → `recipe-image (1).png`
- Velvet Kiss → `recipe-image (2).png`
- Cinna Moon → `recipe-image (3).png`
- Nuti Dream → `recipe-image (4).png`
- Lemon Glow → `recipe-image (5).png`
- Brownie Bliss → `recipe-image (6).png`
- Canela Classic → `recipe-image (1).jpg`

Los archivos se sirven desde `https://cdn.jsdelivr.net/gh/XitoDev/starkies@main/public/images/`. Si alguna foto aparece asociada a la receta equivocada, basta con corregir el mapa; no hace falta modificar los documentos de Firestore ni renombrar los archivos.
