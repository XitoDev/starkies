# StarKies: catálogo público, pedidos y SEO

## Vercel y dominio

La web pública usa `https://starkies.lat/` como URL canónica. El dominio continúa administrado en GoDaddy hasta que la nueva versión haya sido validada. **No cambiar los DNS ni retirar la web actual antes de aprobar la Preview.**

1. Crear o seleccionar un proyecto Vercel dedicado al catálogo público, con el repositorio `XitoDev/starkies` y raíz del proyecto en el repositorio.
2. Configurar el build como `npx ng build catalog --configuration production`, el directorio de salida como `dist/apps/catalog/browser` y la instalación como `npm ci`.
3. Configurar los secretos de GitHub `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_CATALOG_PROJECT_ID` para que el workflow pueda desplegar Previews.
4. Configurar en el proyecto Vercel la variable de entorno `FIREBASE_SERVICE_ACCOUNT_JSON` para Preview y Production con el JSON de una cuenta de servicio del proyecto Firebase `starkies`. La cuenta solo se usa en la función de servidor; nunca se incluye en el bundle público. Otorgar solo el acceso necesario a Firestore.
5. Revisar la Preview y validar creación de pedidos de extremo a extremo antes de asignar el dominio.

Cuando se apruebe el cambio de dominio:

1. Añadir `starkies.lat` y `www.starkies.lat` al proyecto de catálogo en Vercel y consultar los valores DNS que Vercel indique para ese proyecto.
2. En GoDaddy, modificar solo los registros web que Vercel solicite (raíz y, si se usa, `www`). No cambiar MX ni los TXT de Google Search Console, SPF, DKIM u otros servicios de correo.
3. Elegir un dominio canónico único (`https://starkies.lat/`) y redirigir la variante `www` a esa URL mediante la configuración del proyecto.
4. Esperar a que Vercel verifique el DNS y emita el certificado TLS. Confirmar HTTPS, redirecciones y ausencia de errores antes de retirar el hosting anterior.

## SEO y Google Search Console

- El documento inicial incluye idioma `es-EC`, título y descripción, canonical absoluta, robots meta y metadatos Open Graph/Twitter.
- Angular prerenderiza la página inicial a HTML estático para que el contenido principal esté disponible en el HTML recibido por los rastreadores.
- `/robots.txt` permite el rastreo público y declara `https://starkies.lat/sitemap.xml`; el sitemap solo incluye la URL canónica actualmente existente.
- Los datos estructurados JSON-LD describen StarKies como panadería y las tres presentaciones de cajas con precios USD. Revisar el contenido real y los precios antes del release.
- Mantener la propiedad existente de dominio en Google Search Console; no crear una propiedad nueva ni eliminar la actual. Tras cambiar el hosting, usar Inspección de URL, comprobar la URL canónica y enviar de nuevo el sitemap. Vigilar cobertura, indexación, rendimiento y errores 404 en las semanas siguientes.
- No se ha inventado ni añadido un token de verificación de Search Console: conservar el TXT existente en GoDaddy.

## Pedidos públicos y datos

La función `/api/orders` valida productos, composición de cajas, precios, fecha, teléfono y zona de entrega en el servidor. Calcula el total con precios del catálogo del repositorio, limita solicitudes por IP y guarda el pedido como pendiente en la colección de pedidos que consume el administrador. Si Firebase no está configurado o la migración no está completa, la función no simula un registro; la web ofrece continuar por WhatsApp.
