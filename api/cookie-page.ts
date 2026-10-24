import { readPublicCatalog } from './catalog-data.js';
import {
  absolutePublicImage,
  escapeHtml,
  getPublicCatalogDatabase,
  productDetailPath,
  safeJsonLd,
} from './public-seo.js';

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
}
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'index, follow');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).send('Método no permitido.');
    return;
  }

  try {
    const id = typeof req.query?.['id'] === 'string' ? req.query['id'].trim() : '';
    if (!id || id.length > 200) {
      sendNotFound(res);
      return;
    }

    const catalog = await readPublicCatalog(getPublicCatalogDatabase());
    const product = catalog.products.find(item => item.id === id);
    if (!product) {
      sendNotFound(res);
      return;
    }

    const canonical = 'https://starkies.lat' + productDetailPath(product.name, product.id);
    const name = escapeHtml(product.name);
    const category = escapeHtml(product.category);
    const descriptionText = product.description.trim()
      || product.name + ' es una galleta artesanal de StarKies. Consulta su disponibilidad y arma tu caja en el catálogo.';
    const description = escapeHtml(descriptionText);
    const image = absolutePublicImage(product.image);
    const price = product.price.toFixed(2);
    const availability = product.stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    const availabilityLabel = product.stock ? 'Disponible para pedido' : 'Agotada temporalmente';
    const availabilityColor = product.stock ? '#47735b' : '#9b4d55';
    const pageTitle = product.name + ' | Galletas artesanales en Guayaquil | StarKies';
    const pageDescription = product.name + ': ' + descriptionText + ' Precio por unidad: $' + price + ' USD. Catálogo StarKies en Guayaquil, Ecuador.';
    const schema = image ? {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': canonical + '#product',
      name: product.name,
      image,
      description: descriptionText,
      sku: product.id,
      category: product.category,
      brand: { '@type': 'Brand', name: 'StarKies' },
      offers: {
        '@type': 'Offer',
        url: canonical,
        price,
        priceCurrency: 'USD',
        availability,
        seller: { '@id': 'https://starkies.lat/#bakery' },
      },
    } : {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': canonical + '#webpage',
      url: canonical,
      name: pageTitle,
      description: pageDescription,
      inLanguage: 'es-EC',
    };
    const imageMarkup = image
      ? '<img class="product-image" src="' + escapeHtml(image) + '" alt="' + name + '" width="720" height="540" fetchpriority="high">'
      : '<div class="image-placeholder" role="img" aria-label="Imagen no disponible para esta galleta">StarKies ✦</div>';
    const whatsappText = encodeURIComponent('¡Hola StarKies! Quisiera consultar por ' + product.name + '.');
    const html = [
      '<!doctype html>',
      '<html lang="es-EC">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>' + escapeHtml(pageTitle) + '</title>',
      '  <meta name="description" content="' + escapeHtml(pageDescription) + '">',
      '  <meta name="robots" content="index, follow">',
      '  <link rel="canonical" href="' + escapeHtml(canonical) + '">',
      '  <link rel="icon" href="/starkies-icon.svg" type="image/svg+xml">',
      '  <meta name="theme-color" content="#fbf8f5">',
      '  <meta property="og:type" content="product">',
      '  <meta property="og:site_name" content="StarKies">',
      '  <meta property="og:title" content="' + escapeHtml(pageTitle) + '">',
      '  <meta property="og:description" content="' + escapeHtml(pageDescription) + '">',
      '  <meta property="og:url" content="' + escapeHtml(canonical) + '">',
      image ? '  <meta property="og:image" content="' + escapeHtml(image) + '">' : '',
      '  <meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '">',
      '  <meta name="twitter:title" content="' + escapeHtml(pageTitle) + '">',
      '  <meta name="twitter:description" content="' + escapeHtml(pageDescription) + '">',
      image ? '  <meta name="twitter:image" content="' + escapeHtml(image) + '">' : '',
      '  <script type="application/ld+json">' + safeJsonLd(schema) + '</script>',
      '  <style>',
      '    :root{color-scheme:light;--cream:#fbf8f5;--rose:#f0d9e4;--mauve:#806c79;--ink:#261f29;--line:#e9dfe5;--plum:#604a59}',
      '    *{box-sizing:border-box}',
      '    body{margin:0;background:var(--cream);color:var(--ink);font-family:"DM Sans",Arial,sans-serif}',
      '    a{color:var(--plum);text-underline-offset:4px}',
      '    .site-header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px clamp(20px,6vw,84px);background:#fff;border-bottom:1px solid var(--line)}',
      '    .brand{color:var(--plum);font-size:25px;font-weight:800;text-decoration:none;letter-spacing:-.7px}',
      '    .nav-link{font-size:14px;font-weight:700}',
      '    main{max-width:1120px;margin:0 auto;padding:26px clamp(20px,6vw,60px) 72px}',
      '    .breadcrumbs{margin:0 0 26px;color:#837781;font-size:12px;line-height:1.8}',
      '    .breadcrumbs a{color:#604a59}',
      '    .product-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:center;gap:clamp(28px,5vw,64px)}',
      '    .image-wrap{overflow:hidden;display:grid;place-items:center;min-height:320px;border:1px solid var(--line);border-radius:18px;background:#fff}',
      '    .product-image{display:block;width:100%;height:auto;max-height:560px;object-fit:contain}',
      '    .image-placeholder{display:grid;place-items:center;min-height:320px;color:var(--plum);font-family:Georgia,serif;font-size:34px}',
      '    .eyebrow{margin:0 0 12px;color:var(--mauve);font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}',
      '    h1{margin:0 0 16px;color:var(--plum);font-family:"Shrikhand",Georgia,serif;font-size:clamp(36px,5vw,58px);font-weight:400;line-height:1.12}',
      '    .description{color:#655963;font-size:16px;line-height:1.8}',
      '    .category{display:inline-flex;margin:8px 0;padding:7px 10px;border-radius:7px;background:var(--rose);color:var(--plum);font-size:12px;font-weight:700}',
      '    .price{margin:10px 0;color:var(--plum);font-size:27px;font-weight:800}',
      '    .availability{margin:0 0 24px;color:' + availabilityColor + ';font-size:13px;font-weight:700}',
      '    .actions{display:flex;flex-wrap:wrap;gap:10px}',
      '    .button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 18px;border:1px solid var(--plum);border-radius:8px;font-size:13px;font-weight:700;text-decoration:none}',
      '    .primary{background:var(--plum);color:#fff}',
      '    .secondary{background:#fff;color:var(--plum)}',
      '    .context{max-width:780px;margin:64px auto 0;padding-top:28px;border-top:1px solid var(--line)}',
      '    h2{color:var(--plum);font-size:24px}',
      '    .context p{color:#655963;font-size:14px;line-height:1.85}',
      '    footer{padding:24px 20px;background:#4a3f4b;color:#f1e7ee;text-align:center;font-size:12px}',
      '    @media(max-width:760px){.product-detail{grid-template-columns:1fr;gap:24px}.image-wrap{min-height:220px}.product-image{max-height:420px}.context{margin-top:42px}.actions{flex-direction:column}.button{width:100%}}',
      '  </style>',
      '</head>',
      '<body>',
      '  <header class="site-header">',
      '    <a class="brand" href="/" aria-label="StarKies, inicio">StarKies ✦</a>',
      '    <a class="nav-link" href="/menu">Ver catálogo completo</a>',
      '  </header>',
      '  <main>',
      '    <nav class="breadcrumbs" aria-label="Ruta de navegación"><a href="/">Inicio</a> / <a href="/menu">Catálogo</a> / <span>' + name + '</span></nav>',
      '    <article class="product-detail">',
      '      <div class="image-wrap">' + imageMarkup + '</div>',
      '      <div class="product-copy">',
      '        <p class="eyebrow">Galletas artesanales en Guayaquil, Ecuador</p>',
      '        <h1>' + name + '</h1>',
      '        <p class="description">' + description + '</p>',
      '        <span class="category">' + category + '</span>',
      '        <p class="price">$' + price + ' USD</p>',
      '        <p class="availability">' + availabilityLabel + '</p>',
      '        <div class="actions">',
      '          <a class="button primary" href="/menu">Armar mi caja</a>',
      '          <a class="button secondary" href="https://wa.me/593979075202?text=' + whatsappText + '" target="_blank" rel="noopener noreferrer">Consultar por WhatsApp</a>',
      '        </div>',
      '      </div>',
      '    </article>',
      '    <section class="context">',
      '      <h2>Galletas StarKies en Guayaquil</h2>',
      '      <p>StarKies prepara galletas artesanales clásicas y estilo New York. Revisa la disponibilidad y el precio de ' + name + ' y explora los sabores publicados en nuestro catálogo.</p>',
      '      <p>Los productos que aparecen en esta página corresponden al catálogo público de StarKies. Si una galleta deja de estar publicada, su página dejará de figurar en el sitemap.</p>',
      '      <a href="/menu">Explorar todas las galletas de StarKies</a>',
      '    </section>',
      '  </main>',
      '  <footer>© 2026 StarKies · Guayaquil, Ecuador</footer>',
      '</body>',
      '</html>',
    ].join('\n');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method === 'HEAD') {
      res.status(200).send('');
      return;
    }
    res.status(200).send(html);
  } catch (error) {
    console.error('Public cookie page failed:', error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(503).send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Catálogo temporalmente no disponible | StarKies</title></head><body><h1>Catálogo temporalmente no disponible</h1><p>Inténtalo de nuevo más tarde.</p><a href="/menu">Volver al catálogo</a></body></html>');
  }
}

function sendNotFound(res: ApiResponse): void {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, follow');
  res.status(404).send('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Galleta no encontrada | StarKies</title></head><body><main><h1>Esta galleta no está disponible</h1><p>Puede que ya no forme parte del catálogo público.</p><a href="/menu">Volver al catálogo</a></main></body></html>');
}
