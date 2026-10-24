import { Component, inject, PendingTasks, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrl: './landing.css',
  templateUrl: './landing.html',
})
export class Landing {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pendingTasks = inject(PendingTasks);

  constructor() {
    const title = inject(Title), meta = inject(Meta);
    const pageTitle = 'Galletas artesanales en Guayaquil | StarKies';
    const pageDescription = 'StarKies ofrece galletas artesanales en Guayaquil, Ecuador: cajas clásicas, NY Style y galletas personalizadas para regalos y eventos. Explora sabores y arma tu caja en línea.';
    title.setTitle(pageTitle);
    meta.updateTag({ name: 'description', content: pageDescription });
    meta.updateTag({ name: 'keywords', content: 'StarKies, galletas artesanales Guayaquil, comprar galletas Guayaquil, cajas de galletas Guayaquil, galletas clásicas, galletas New York Guayaquil, galletas NY Style, galletas de chocolate Guayaquil, galletas rellenas Guayaquil, galletas personalizadas Guayaquil, galletas para cumpleaños Guayaquil, galletas para eventos Guayaquil, galletas para regalar Guayaquil, galletas a domicilio Guayaquil, galletas por pedido Guayaquil, postres Guayaquil, galletas artesanales Ecuador' });
    meta.updateTag({ property: 'og:title', content: pageTitle });
    meta.updateTag({ property: 'og:description', content: pageDescription });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/' });
    meta.updateTag({ property: 'og:image', content: 'https://starkies.lat/starkies-social.png' });
    meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    meta.updateTag({ name: 'twitter:title', content: pageTitle });
    meta.updateTag({ name: 'twitter:description', content: pageDescription });
    meta.updateTag({ name: 'twitter:image', content: 'https://starkies.lat/starkies-social.png' });
    let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://starkies.lat/');
    void this.updateBoxStructuredData();
  }

  private async updateBoxStructuredData(): Promise<void> {
    const finishPendingTask = this.pendingTasks.add();
    try {
      const isBrowser = isPlatformBrowser(this.platformId);
      const baseUri = isBrowser ? this.document.baseURI : 'https://starkies.lat/';
      const requestOptions: RequestInit = { headers: { Accept: 'application/json' }, cache: 'no-store' };
      if (!isBrowser) requestOptions.signal = AbortSignal.timeout(8000);
      const response = await fetch(new URL('/api/catalog', baseUri).toString(), requestOptions);
      if (!response.ok) return;
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== 'object' || payload === null
        || !('products' in payload) || !Array.isArray(payload.products)
        || !('zones' in payload) || !Array.isArray(payload.zones)) return;

      const products = payload.products.flatMap((value: unknown) => {
        if (typeof value !== 'object' || value === null) return [];
        const product = value as { name?: unknown; isNy?: unknown; image?: unknown };
        if (typeof product.name !== 'string' || typeof product.isNy !== 'boolean' || typeof product.image !== 'string') return [];
        try {
          const image = new URL(product.image, 'https://starkies.lat/');
          if (image.protocol !== 'https:' && image.protocol !== 'http:') return [];
          return [{ isNy: product.isNy, image: image.toString() }];
        } catch {
          return [];
        }
      });
      const classicImages = [...new Set(products.filter(product => !product.isNy).map(product => product.image))];
      const nyImages = [...new Set(products.filter(product => product.isNy).map(product => product.image))];
      const mixedImages = [...new Set([...classicImages, ...nyImages])];

      const zones = payload.zones.flatMap((value: unknown) => {
        if (typeof value !== 'object' || value === null) return [];
        const zone = value as { name?: unknown; fee?: unknown };
        const name = typeof zone.name === 'string' ? zone.name.trim() : '';
        const fee = Number(zone.fee);
        const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
        return name && !normalized.includes('retiro') && Number.isFinite(fee) && fee >= 0 ? [{ name, fee }] : [];
      });
      const shippingDetails = zones.map(zone => ({
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'EC', name: zone.name },
        shippingRate: { '@type': 'MonetaryAmount', value: zone.fee.toFixed(2), currency: 'USD' },
      }));
      const script = this.document.getElementById('starkies-site-structured-data') as HTMLScriptElement | null;
      if (!script?.textContent) return;
      const jsonLd = JSON.parse(script.textContent) as { '@graph'?: Array<Record<string, unknown>> };
      const graph = Array.isArray(jsonLd['@graph']) ? jsonLd['@graph'] : [];
      const policy = {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'EC',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
        merchantReturnLink: 'https://starkies.lat/privacy-policy#entregas-reembolsos',
      };
      const bakery = graph.find(node => node['@type'] === 'Bakery');
      if (bakery) bakery['hasMerchantReturnPolicy'] = policy;
      const itemList = graph.find(node => node['@type'] === 'ItemList');
      const elements = Array.isArray(itemList?.['itemListElement']) ? itemList['itemListElement'] : [];
      for (const [index, element] of elements.entries()) {
        if (typeof element !== 'object' || element === null) continue;
        const item = (element as Record<string, unknown>)['item'];
        if (typeof item !== 'object' || item === null) continue;
        const product = item as Record<string, unknown>;
        const images = index === 0 ? classicImages : index === 1 ? nyImages : mixedImages;
        if (images.length) product['image'] = images.slice(0, 5);
        const offer = product['offers'];
        if (typeof offer === 'object' && offer !== null) {
          const offerRecord = offer as Record<string, unknown>;
          offerRecord['hasMerchantReturnPolicy'] = policy;
          if (shippingDetails.length) offerRecord['shippingDetails'] = shippingDetails;
        }
      }
      script.textContent = JSON.stringify(jsonLd);
    } catch {
      // Preserve the valid static schema if the live catalog cannot be loaded.
    } finally {
      finishPendingTask();
    }
  }

  phone = '';
  name = '';
  quantity: number | null = null;
  cookieType = '';
  notes = '';
  formError = '';

  sendQuote(form: NgForm): void {
    this.formError = '';
    if (!form.valid) {
      this.formError = 'Revisa los campos obligatorios y asegúrate de que el teléfono y la cantidad sean válidos.';
      return;
    }
    if (this.quantity !== null && (!Number.isInteger(Number(this.quantity)) || Number(this.quantity) < 1 || Number(this.quantity) > 5000)) {
      this.formError = 'La cantidad debe ser un número entero entre 1 y 5000.';
      return;
    }
    const lines = [
      '¡Hola StarKies! Quisiera cotizar un pedido personalizado de galletas.',
      '',
      'Teléfono / WhatsApp: ' + this.phone.trim(),
      'Nombre: ' + this.name.trim(),
      'Cantidad aproximada: ' + (this.quantity ? this.quantity + ' galletas' : 'Por definir'),
      'Tipo de galletas: ' + (this.cookieType || 'Por definir'),
      'Notas adicionales: ' + (this.notes.trim() || 'Sin notas adicionales'),
    ];
    const url = 'https://wa.me/593979075202?text=' + encodeURIComponent(lines.join('\n'));
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else this.formError = 'No pudimos abrir WhatsApp. Permite las ventanas emergentes o escríbenos al 0979075202.';
  }
}
