import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './privacy-policy.css',
  templateUrl: './privacy-policy.html',
})
export class PrivacyPolicy {
  private readonly document = inject(DOCUMENT);

  constructor() {
    const title = inject(Title), meta = inject(Meta);
    const pageTitle = 'Política de privacidad y condiciones de compra | StarKies';
    const pageDescription = 'Conoce cómo StarKies protege tus datos y consulta las condiciones de entrega, cancelaciones y reembolsos de pedidos de galletas artesanales en Guayaquil.';
    title.setTitle(pageTitle);
    meta.updateTag({ name: 'description', content: pageDescription });
    meta.updateTag({ property: 'og:title', content: pageTitle });
    meta.updateTag({ property: 'og:description', content: pageDescription });
    meta.updateTag({ property: 'og:url', content: 'https://starkies.lat/privacy-policy' });
    meta.updateTag({ name: 'robots', content: 'index, follow' });
    let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      this.document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://starkies.lat/privacy-policy');
    this.document.getElementById('starkies-site-structured-data')?.remove();

    let script = this.document.getElementById('starkies-privacy-structured-data') as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = 'starkies-privacy-structured-data';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': 'https://starkies.lat/privacy-policy#webpage',
      url: 'https://starkies.lat/privacy-policy',
      name: pageTitle,
      description: pageDescription,
      inLanguage: 'es-EC',
      isPartOf: { '@id': 'https://starkies.lat/#website' },
      about: { '@id': 'https://starkies.lat/#bakery' },
    });
  }
}
