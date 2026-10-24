import { readPublicCatalog } from './catalog-data.js';
import {
  escapeXml,
  getPublicCatalogDatabase,
  productDetailPath,
} from './public-seo.js';

interface ApiRequest { method?: string; }
interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

const STATIC_URLS = [
  { loc: 'https://starkies.lat/', lastmod: '2026-10-24' },
  { loc: 'https://starkies.lat/menu', lastmod: '2026-10-24' },
  { loc: 'https://starkies.lat/privacy-policy', lastmod: '2026-10-24' },
];

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).send('<?xml version="1.0" encoding="UTF-8"?><error>Método no permitido</error>');
    return;
  }

  try {
    const catalog = await readPublicCatalog(getPublicCatalogDatabase());
    const urls = [
      ...STATIC_URLS.map(url => '<url><loc>' + escapeXml(url.loc) + '</loc><lastmod>' + url.lastmod + '</lastmod></url>'),
      ...catalog.products.map(product => {
        const url = 'https://starkies.lat' + productDetailPath(product.name, product.id);
        return '<url><loc>' + escapeXml(url) + '</loc></url>';
      }),
    ];
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + urls.map(url => '  ' + url).join('\n')
      + '\n</urlset>\n';
    if (req.method === 'HEAD') {
      res.status(200).send('');
      return;
    }
    res.status(200).send(xml);
  } catch (error) {
    console.error('Public sitemap generation failed:', error);
    res.status(503).send('<?xml version="1.0" encoding="UTF-8"?><error>Sitemap temporalmente no disponible</error>');
  }
}
