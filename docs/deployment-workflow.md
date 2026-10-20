# Despliegues seguros y revisión sin consumir cuota

## Política de despliegue

Los workflows de Vercel son manuales: no despliegan al hacer push. Antes de invocar Vercel, cada workflow:

1. Verifica los secretos requeridos.
2. Instala las dependencias con `npm ci`, respetando el `package-lock.json` del repositorio.
3. Ejecuta el build de producción de Angular.
4. Ejecuta las pruebas unitarias.
5. En el Catálogo, verifica que el HTML prerenderizado contiene canonical y contenido esperado, y comprueba los tipos de la API de pedidos.
6. Solo si todos los checks pasan, ejecuta `vercel pull`, `vercel build` y finalmente `vercel deploy`.

La producción solo se puede desplegar desde `main` y requiere escribir exactamente `DEPLOY` en el campo de confirmación. El despliegue Preview no publica en el dominio de producción.

Los workflows CI de Admin y Catálogo corren en PRs y pushes a `main`, pero no despliegan ni modifican el lockfile. Un fallo de compilación/pruebas no consume un despliegue de Vercel.

## Importante: desactivar builds automáticos de Git en Vercel

El workflow de GitHub no puede detener por sí solo el despliegue automático configurado dentro de Vercel. Para evitar que Vercel cree un deployment por cada push:

1. Abre el proyecto de Vercel de Admin y luego el de Catálogo.
2. En cada uno, ve a **Settings → Git → Ignored Build Step** (el nombre puede variar ligeramente).
3. Configura el comando `exit 0`, que hace que Vercel omita los builds iniciados por integración Git.
4. Guarda y repite para el otro proyecto.

A partir de entonces, usa **GitHub → Actions → Deploy Admin to Vercel** o **Deploy Public Catalog to Vercel → Run workflow** para lanzar un despliegue explícito. Los despliegues ejecutados por CLI desde estos workflows no dependen de la integración automática Git. Comprueba la configuración en ambos proyectos antes de asumir que los pushes ya no consumen cuota.

## Ver cambios localmente, sin desplegar

Esto no crea ningún deployment ni consume la cuota de Vercel.

Requisitos: Node.js 22 y npm. Desde la raíz del repositorio:

```bash
npm ci
npx ng serve catalog
```

Abre `http://localhost:4200` para revisar el Catálogo. Para revisar Admin, detén el primer servidor y ejecuta:

```bash
npx ng serve admin
```

Abre `http://localhost:4200`. No necesitas subir cambios a GitHub ni ejecutar Vercel para revisar el diseño, responsive layout y navegación básica.

El envío real de pedidos depende de la función de servidor de Vercel y de su configuración Firebase; el servidor local de Angular no reproduce automáticamente esa API. Para validar el flujo de pedidos de extremo a extremo, primero ejecuta los checks locales y después utiliza una Preview manual.

## Checks locales antes de pedir una Preview

```bash
npm ci
npx ng build admin --configuration production
npx ng test admin --watch=false
npx ng build catalog --configuration production
npx ng test catalog --watch=false
npx tsc --ignoreConfig --noEmit --strict --target ES2022 --moduleResolution bundler --module ES2022 --esModuleInterop --skipLibCheck --types node api/orders.ts
```

El workflow de cada aplicación ejecuta sus checks correspondientes automáticamente antes de permitir un despliegue.

## Cuota de Vercel

Los despliegues Preview y Production siguen contando según las reglas del plan de Vercel. Los builds locales y los checks de GitHub Actions no crean deployments de Vercel. Por eso, primero revisa los cambios localmente; usa Preview solo para validar lo que depende del entorno real, y Production únicamente cuando todo esté aprobado.
