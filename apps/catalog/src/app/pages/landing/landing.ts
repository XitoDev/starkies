import { Component, inject, PendingTasks, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="landing-content">
      <section class="hero" aria-labelledby="hero-title">
        <div class="side-stars" aria-hidden="true">
          <span class="left s1">✦</span><span class="left s2">✧</span><span class="left s3">✦</span><span class="left s4">✧</span><span class="left s5">✦</span><span class="left s6">✧</span>
          <span class="right s1">✧</span><span class="right s2">✦</span><span class="right s3">✧</span><span class="right s4">✦</span><span class="right s5">✧</span><span class="right s6">✦</span>
        </div>
        <div class="hero-copy">
          <p class="eyebrow">GALLETAS HECHAS CON AMOR</p>
          <h1 id="hero-title">La estrella<br>eres tú.</h1>
          <p class="hero-description">Galletas artesanales hechas para momentos especiales. Descubre nuestras cajas clásicas y NY Style en Guayaquil, Ecuador; elige tus favoritas y arma tu caja en línea.</p>
          <a class="primary-button" routerLink="/menu">Ver catálogo</a>
        </div>
      </section>

      <section class="section brownie-story" aria-labelledby="brownie-story-title">
        <div class="story-image-wrap">
          <img src="/images/starkies-brownie-cookie.svg" alt="Brownie Classic, la galleta de chocolate insignia de StarKies" width="1000" height="1000" loading="lazy">
        </div>
        <div class="story-copy">
          <p class="eyebrow">Nuestra historia</p>
          <span class="story-label">Nuestra más vendida</span>
          <h2 id="brownie-story-title">La galleta con la que empezó todo</h2>
          <p>Brownie Classic fue la primera galleta que horneamos en StarKies. Nació de una idea sencilla: llevar el sabor reconfortante de un brownie a una galleta que puedas disfrutar en cualquier momento.</p>
          <p>Su sabor suave y su apariencia evocan un brownie tradicional, con ese aspecto casero que la hace tan especial, pero hecho galleta. Hoy es nuestra galleta insignia y la más vendida de StarKies.</p>
          <a class="primary-button" routerLink="/menu">Prueba Brownie Classic</a>
        </div>
      </section>

      <section class="quote-section" id="pedido-personalizado" aria-labelledby="quote-title">
        <div class="quote-inner">
          <div class="quote-intro">
            <p class="eyebrow">Momentos especiales</p>
            <h2 id="quote-title">¿Tienes una ocasión especial?</h2>
            <p>Cuéntanos tu idea y cotizamos galletas personalizadas para cumpleaños, celebraciones, regalos y mucho más.</p>
          </div>
          <form #quoteForm="ngForm" class="quote-form" (ngSubmit)="sendQuote(quoteForm)">
            <div class="field">
              <label for="quote-phone">Teléfono / WhatsApp <span aria-hidden="true">*</span></label>
              <input id="quote-phone" name="phone" [(ngModel)]="phone" required minlength="7" maxlength="20" pattern="[0-9+() .-]{7,20}" autocomplete="tel" placeholder="Tu número de contacto">
            </div>
            <div class="field">
              <label for="quote-name">Nombre <span aria-hidden="true">*</span></label>
              <input id="quote-name" name="name" [(ngModel)]="name" required minlength="2" maxlength="100" autocomplete="name" placeholder="¿Cómo te llamas?">
            </div>
            <div class="field">
              <label for="quote-quantity">Cantidad aproximada (opcional)</label>
              <input id="quote-quantity" name="quantity" [(ngModel)]="quantity" type="number" min="1" max="5000" step="1" placeholder="Ej. 24">
            </div>
            <div class="field">
              <label for="quote-type">Tipo de galletas (opcional)</label>
              <select id="quote-type" name="cookieType" [(ngModel)]="cookieType">
                <option value="">Aún no lo sé</option><option value="Clásicas">Clásicas</option><option value="NY Style">NY Style</option><option value="Mixtas">Mixtas</option><option value="Decoradas / personalizadas">Decoradas / personalizadas</option>
              </select>
            </div>
            <div class="field full">
              <label for="quote-notes">Cuéntanos qué tienes en mente <span aria-hidden="true">*</span></label>
              <textarea id="quote-notes" name="notes" [(ngModel)]="notes" required rows="3" maxlength="2000" placeholder="Ocasión, temática, colores, fecha y cualquier detalle que quieras compartir..."></textarea>
            </div>
             <button class="primary-button full submit-button" type="submit">Solicitar cotización</button>
            @if (formError) { <p class="form-error full" role="alert">{{ formError }}</p> }
          </form>
        </div>
      </section>
    </div>

  `,
  styles: [`
    :host { display:block; --cream:#fbf8f5; --rose:#f0d9e4; --mauve:#806c79; --ink:#261f29; --line:#e9dfe5; color:var(--ink); background:var(--cream); font-family:'DM Sans',Arial,sans-serif; }
    * { box-sizing:border-box; }
    a { color:inherit; text-decoration:none; }
    .side-stars { position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; color:#c1a0ac; }
    .side-stars span { position:absolute; display:block; line-height:1; user-select:none; opacity:.72; }
    .side-stars .left { left:clamp(12px,3vw,42px); }
    .side-stars .right { right:clamp(12px,3vw,42px); }
    .side-stars .s1 { top:8%; font-size:clamp(26px,3.2vw,44px); transform:rotate(-18deg); }
    .side-stars .s2 { top:23%; font-size:clamp(18px,2.3vw,30px); transform:rotate(15deg); }
    .side-stars .s3 { top:40%; font-size:clamp(30px,3.8vw,50px); transform:rotate(12deg); }
    .side-stars .s4 { top:59%; font-size:clamp(20px,2.5vw,34px); transform:rotate(-12deg); }
    .side-stars .s5 { top:77%; font-size:clamp(27px,3.4vw,45px); transform:rotate(16deg); }
    .side-stars .s6 { top:90%; font-size:clamp(18px,2.4vw,31px); transform:rotate(-9deg); }
    main { display:block; }
    .hero { position:relative; isolation:isolate; overflow:hidden; min-height:620px; display:grid; grid-template-columns:minmax(0,1fr); align-items:center; justify-items:center; padding:70px max(6%,calc((100% - 1180px)/2)); background:linear-gradient(120deg,#fff9f7,#f0d9e4); text-align:center; }
    .hero-copy { position:relative; z-index:1; max-width:900px; }
    .eyebrow { margin:0 0 8px; text-transform:uppercase; letter-spacing:3px; font-size:12px; font-weight:700; color:#806c79; }
    h1 { font:clamp(52px,6vw,90px)/1.06 'Shrikhand',Georgia,serif; color:#5c4253; margin:18px 0; font-weight:400; }
    p { line-height:1.8; color:#665c64; }
    .hero-description { max-width:900px; margin:22px auto; font-size:clamp(1rem,1.6vw,1.2rem); }
    .primary-button { display:inline-flex; align-items:center; justify-content:center; min-height:45px; padding:14px 22px; border:0; border-radius:8px; background:#604a59; color:white; font:600 14px 'DM Sans',Arial,sans-serif; cursor:pointer; }
    .section { max-width:1250px; margin:auto; padding:70px 6%; text-align:center; }
    h2 { margin:10px 0; color:#604a59; font:42px/1.2 'Shrikhand',Georgia,serif; font-weight:400; }
    .brownie-story { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:center; gap:clamp(28px,6vw,84px); max-width:1250px; padding-top:88px; padding-bottom:88px; text-align:left; }
    .story-image-wrap { position:relative; display:grid; place-items:center; min-width:0; aspect-ratio:1/1; overflow:hidden; border:1px solid #eadfe5; border-radius:24px; background:radial-gradient(circle at 50% 45%,#fff 0,#fff 48%,#f7e9ee 100%); }
    .story-image-wrap::after { position:absolute; inset:16px; border:1px solid rgb(193 160 172 / 38%); border-radius:17px; content:""; pointer-events:none; }
    .story-image-wrap img { display:block; width:100%; height:100%; padding:clamp(12px,2vw,28px); object-fit:contain; }
    .story-copy { min-width:0; }
    .story-label { display:inline-flex; align-items:center; margin:8px 0 12px; padding:7px 11px; border-radius:6px; background:#f0d9e4; color:#604a59; font-size:12px; font-weight:700; letter-spacing:.2px; }
    .story-copy h2 { max-width:600px; margin:4px 0 18px; font-size:clamp(34px,4vw,52px); }
    .story-copy p:not(.eyebrow) { max-width:590px; margin:0 0 14px; font-size:16px; line-height:1.85; }
    .story-copy .primary-button { margin-top:12px; }
    .quote-section { border-top:1px solid var(--line); padding:72px 6%; background:#fff; }
    .quote-inner { max-width:820px; margin:auto; }
    .quote-intro { margin-bottom:28px; text-align:center; }
    .quote-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; padding:26px; border:1px solid var(--line); border-radius:16px; background:#fff; }
    .field { min-width:0; }
    .field label { display:block; margin-bottom:6px; font-size:13px; font-weight:700; }
    .field label span { color:#a43d67; }
    .field input,.field select,.field textarea { width:100%; padding:13px; border:1px solid #d7cbd2; border-radius:8px; background:#fff; color:var(--ink); font:inherit; }
    .field input,.field select { min-height:46px; }
    .field textarea { min-height:140px; resize:vertical; }
    .field input:focus,.field select:focus,.field textarea:focus { outline:2px solid #c1a0ac; outline-offset:1px; }
    .full { grid-column:1/-1; }
     .submit-button { width:100%; }
    .form-error { margin:0; color:#9b294b; font-size:13px; }
    @media(max-width:850px) { .hero { min-height:560px; padding:60px 6%; } .section { padding:58px 6%; } .quote-section { padding:58px 6%; } }
    @media(max-width:560px) {
      .hero { min-height:580px; padding:55px 6%; }
      h1 { font-size:clamp(46px,12vw,66px); }
      .hero-description { font-size:1rem; }
      .section { padding:55px 6%; }
      h2 { font-size:34px; }
      .brownie-story { grid-template-columns:1fr; gap:24px; padding-top:56px; padding-bottom:56px; text-align:left; }
      .story-image-wrap { width:min(100%,460px); margin:0 auto; }
      .story-copy h2 { font-size:34px; }
      .story-copy p:not(.eyebrow) { font-size:15px; }
      .quote-section { padding:50px 6%; }
      .quote-form { grid-template-columns:1fr; padding:18px; }
      .full { grid-column:auto; }
      .side-stars .left { left:12px; }
      .side-stars .right { right:12px; }
      .side-stars .s1, .side-stars .s3, .side-stars .s5 { font-size:28px; }
      .side-stars .s2, .side-stars .s4, .side-stars .s6 { font-size:20px; }
    }
   `]
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
    void this.updateBoxShippingDetails();
  }

  private async updateBoxShippingDetails(): Promise<void> {
    const finishPendingTask = this.pendingTasks.add();
    try {
      const isBrowser = isPlatformBrowser(this.platformId);
      const baseUri = isBrowser ? this.document.baseURI : 'https://starkies.lat/';
      const requestOptions: RequestInit = { headers: { Accept: 'application/json' }, cache: 'no-store' };
      if (!isBrowser) requestOptions.signal = AbortSignal.timeout(8000);
      const response = await fetch(new URL('/api/catalog', baseUri).toString(), requestOptions);
      if (!response.ok) return;
      const payload: unknown = await response.json().catch(() => null);
      if (typeof payload !== 'object' || payload === null || !('zones' in payload) || !Array.isArray(payload.zones)) return;
      const zones = payload.zones.flatMap((value: unknown) => {
        if (typeof value !== 'object' || value === null) return [];
        const zone = value as { name?: unknown; fee?: unknown };
        const name = typeof zone.name === 'string' ? zone.name.trim() : '';
        const fee = Number(zone.fee);
        const normalized = name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
        return name && !normalized.includes('retiro') && Number.isFinite(fee) && fee >= 0 ? [{ name, fee }] : [];
      });
      if (!zones.length) return;
      const shippingDetails = zones.map(zone => ({
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'EC', name: zone.name },
        shippingRate: { '@type': 'MonetaryAmount', value: zone.fee.toFixed(2), currency: 'USD' },
      }));
      const script = this.document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
      if (!script?.textContent) return;
      const jsonLd = JSON.parse(script.textContent) as { '@graph'?: Array<Record<string, unknown>> };
      const graph = Array.isArray(jsonLd['@graph']) ? jsonLd['@graph'] : [];
      const itemList = graph.find(node => node['@type'] === 'ItemList');
      const elements = Array.isArray(itemList?.['itemListElement']) ? itemList['itemListElement'] : [];
      for (const element of elements) {
        if (typeof element !== 'object' || element === null) continue;
        const item = (element as Record<string, unknown>)['item'];
        if (typeof item !== 'object' || item === null) continue;
        const offer = (item as Record<string, unknown>)['offers'];
        if (typeof offer === 'object' && offer !== null) {
          (offer as Record<string, unknown>)['shippingDetails'] = shippingDetails;
        }
      }
      script.textContent = JSON.stringify(jsonLd);
    } catch {
      // Keep the valid static product schema if live delivery rates cannot be fetched.
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
