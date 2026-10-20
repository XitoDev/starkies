# StarKies: catálogo público, pedidos y SEO

## Arquitectura de dominios y Vercel

La configuración recomendada usa el mismo repositorio monorepo `XitoDev/starkies`, pero **dos proyectos de Vercel independientes**. Así cada aplicación tiene su propio build, despliegue, variables de entorno y dominio; no hacen falta dos repositorios.

| Aplicación | Dominio de producción | Proyecto Vercel |
| --- | --- | --- |
| Catálogo público | `https://starkies.lat/` | Proyecto dedicado al catálogo (`catalog`) |
| Administrador del negocio | `https://admin.starkies.lat/` | Proyecto actual/dedicado al administrador (`admin`) |

Los workflows ya distinguen los secretos `VERCEL_CATALOG_PROJECT_ID` y `VERCEL_ADMIN_PROJECT_ID`, además de `VERCEL_TOKEN` y `VERCEL_ORG_ID`. Cada proyecto debe apuntar al mismo repositorio, con su comando y salida de build propios. No es necesario fusionar ambas aplicaciones en un único despliegue.

**No modificar DNS en GoDaddy ni retirar el sitio actual hasta validar las Previews y aprobar la publicación.** No hace falta configurar GoDaddy todavía ni conocer el destino final de DNS para obtener una Preview de Vercel.

## Configuración del proyecto Vercel del catálogo

1. Crear o seleccionar el proyecto Vercel dedicado al catálogo público, conectado a `XitoDev/starkies`.
2. Configurar el build como `npx ng build catalog --configuration production`, el directorio de salida como `dist/catalog` y la instalación como `npm ci`.
3. Configurar los secretos de GitHub `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_CATALOG_PROJECT_ID` para que el workflow pueda desplegar Previews.
4. Configurar en el proyecto Vercel la variable de entorno `FIREBASE_SERVICE_ACCOUNT_JSON` para Preview y Production con el JSON de una cuenta de servicio del proyecto Firebase `starkies`. La cuenta solo se usa en la función de servidor; nunca se incluye en el bundle público. Otorgar solo el acceso necesario a Firestore.
5. Revisar la Preview y validar creación de pedidos de extremo a extremo antes de asignar el dominio.

## Configuración del proyecto Vercel del administrador

1. Mantener el administrador en su proyecto Vercel actual/dedicado, conectado al mismo repositorio `XitoDev/starkies`.
2. Confirmar que el build usa la aplicación Angular `admin` y su directorio de salida correspondiente, separado del catálogo.
3. Mantener los secretos `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_ADMIN_PROJECT_ID` para su workflow de Preview.
4. Cuando la Preview del administrador esté validada, añadir `admin.starkies.lat` en **Settings → Domains** de ese proyecto de Vercel. Vercel mostrará el registro DNS exacto que debe añadirse.
5. El administrador debe seguir requiriendo autenticación de Firebase. Tener un subdominio propio no lo hace privado por sí solo.

## DNS en GoDaddy: solo cuando se apruebe producción

Cuando ambas aplicaciones estén validadas:

1. Añadir `starkies.lat` (y opcionalmente `www.starkies.lat`) al proyecto Vercel del catálogo. Añadir `admin.starkies.lat` al proyecto Vercel del administrador.
2. Copiar los registros DNS exactos que Vercel indique para cada dominio. Los valores pueden variar según el estado de Vercel; no adivinar ni reutilizar registros de otro proyecto.
3. En GoDaddy, modificar solo los registros web solicitados para el dominio raíz y los subdominios. **No cambiar MX ni los TXT de Google Search Console, SPF, DKIM u otros servicios de correo.**
4. Mantener `https://starkies.lat/` como URL canónica del catálogo y redirigir `www` a esa URL si se decide conservar `www`.
5. Esperar a que Vercel verifique los DNS y emita los certificados TLS. Comprobar HTTPS, redirecciones y ausencia de errores antes de retirar el hosting anterior.

La URL `*.vercel.app` de una Preview se obtiene del workflow de despliegue y se puede usar para validar la versión antes de tocar GoDaddy. Si el proyecto Vercel del catálogo todavía no está enlazado en GitHub Actions, el workflow lo indicará y omitirá el despliegue; un workflow con resultado general `success` en ese caso **no significa que exista una Preview desplegada**.

## SEO y Google Search Console

- El documento inicial incluye idioma `es-EC`, título y descripción, canonical absoluta, robots meta y metadatos Open Graph/Twitter.
- Angular prerenderiza la página inicial a HTML estático para que el contenido principal esté disponible en el HTML recibido por los rastreadores.
- `/robots.txt` permite el rastreo público y declara `https://starkies.lat/sitemap.xml`; el sitemap solo incluye la URL canónica actualmente existente.
- Los datos estructurados JSON-LD describen StarKies como panadería y las tres presentaciones de cajas con precios USD. Revisar el contenido real y los precios antes del release.
- Mantener la propiedad existente de dominio en Google Search Console; no crear una propiedad nueva ni eliminar la actual. Tras cambiar el hosting, usar Inspección de URL, comprobar la URL canónica y enviar de nuevo el sitemap. Vigilar cobertura, indexación, rendimiento y errores 404 en las semanas siguientes.
- No se ha inventado ni añadido un token de verificación de Search Console: conservar el TXT existente en GoDaddy.

## Pedidos públicos y datos

La función `/api/orders` valida productos, composición de cajas, precios, fecha, teléfono y zona de entrega en el servidor. Calcula el total con precios del catálogo del repositorio, limita solicitudes por IP y guarda el pedido como pendiente en la colección de pedidos que consume el administrador. Si Firebase no está configurado o la migración no está completa, la función no simula un registro; la web ofrece continuar por WhatsApp.
