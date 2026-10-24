import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule, NgForm } from '@angular/forms';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule, MatIconModule],
  template: `
    <header class="site-header">
      <a class="brand" href="/" aria-label="StarKies, inicio"><span class="brand-name">StarKies <span aria-hidden="true">✦</span></span></a>
      <nav aria-label="Navegación principal">
        <a class="nav-link active" href="/">Inicio</a>
        <a class="nav-link" href="/menu">Catálogo</a>
        <a class="cart-trigger" href="/menu" aria-label="Ir al catálogo para revisar tu pedido" title="Mi pedido">
          <mat-icon fontSet="material-symbols-rounded" aria-hidden="true">shopping_cart</mat-icon><span class="cart-badge">0</span>
        </a>
      </nav>
    </header>
    <div class="side-stars" aria-hidden="true">
      <span class="left s1">✦</span><span class="left s2">✧</span><span class="left s3">✦</span><span class="left s4">✧</span>
      <span class="right s1">✧</span><span class="right s2">✦</span><span class="right s3">✧</span><span class="right s4">✦</span>
    </div>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">GALLETAS HECHAS CON AMOR</p>
          <h1 id="hero-title">La estrella<br>eres tú.</h1>
          <p class="hero-description">Galletas irresistibles para los momentos que merecen algo especial. Elige tus favoritas, arma tu caja y disfruta cada mordida.</p>
          <a class="primary-button" href="/menu">Ver catálogo</a>
        </div>
      </section>

      <section class="section features-section" aria-labelledby="features-title">
        <p class="eyebrow">Una experiencia deliciosa</p>
        <h2 id="features-title">Pequeños momentos, grandes sabores</h2>
        <div class="features">
          <article class="feature"><span aria-hidden="true">🍪</span><h3>Recién hechas</h3><p>Galletas preparadas con dedicación.</p></article>
          <article class="feature"><span aria-hidden="true">🎁</span><h3>Tu caja, a tu gusto</h3><p>Combina tus sabores favoritos.</p></article>
          <article class="feature"><span aria-hidden="true">✨</span><h3>Un detalle especial</h3><p>Perfectas para regalar o consentirte.</p></article>
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
    </main>

    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-brand"><span class="brand-name">StarKies <span aria-hidden="true">✦</span></span><p>La estrella eres tú.</p></div>
        <div class="footer-contact">
          <strong>Contacto</strong>
          <a href="https://wa.me/593979075202" target="_blank" rel="noopener noreferrer">WhatsApp · 0979075202</a>
          <a href="https://www.instagram.com/starkies.ec/" target="_blank" rel="noopener noreferrer">Instagram · @starkies.ec</a>
          <a href="https://www.tiktok.com/@starkies.ec" target="_blank" rel="noopener noreferrer">TikTok · @starkies.ec</a>
        </div>
      </div>
      <small class="contact-note">© {{ currentYear }} StarKies · La estrella eres tú.</small>
    </footer>
  `,
  styles: [`
    :host { display:block; --cream:#fbf8f5; --rose:#f0d9e4; --mauve:#806c79; --ink:#261f29; --line:#e9dfe5; color:var(--ink); background:var(--cream); font-family:'DM Sans',Arial,sans-serif; }
    * { box-sizing:border-box; }
    a { color:inherit; text-decoration:none; }
    .site-header { position:sticky; top:0; z-index:15; min-height:64px; padding:14px max(6%,calc((100% - 1180px)/2)); display:flex; justify-content:space-between; align-items:center; gap:20px; background:#ffffffed; border:1px solid var(--line); backdrop-filter:blur(14px); box-shadow:0 6px 24px #2417200c; }
    .brand-name { color:#735363; font:32px/1 'Shrikhand',Georgia,serif; white-space:nowrap; }
    .brand-name span { font-family:Georgia,serif; }
    nav { display:flex; align-items:center; gap:24px; }
    .nav-link { padding:10px 0; color:#261f29; font-size:14px; }
    .nav-link.active { font-weight:700; }
    .cart-trigger { position:relative; display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; padding:0; border-radius:50%; color:#604a59; }
    .cart-trigger:hover { background:#f7eff3; }
    .cart-trigger mat-icon { width:23px; height:23px; font-size:23px; }
    .cart-badge { position:absolute; top:0; right:-1px; display:grid; place-items:center; min-width:19px; height:19px; padding:0 4px; border:2px solid white; border-radius:99px; background:#604a59; color:white; font-size:10px; line-height:1; }
    .side-stars { position:fixed; inset:0; z-index:1; pointer-events:none; overflow:hidden; color:#c1a0ac; }
    .side-stars span { position:absolute; display:block; line-height:1; user-select:none; }
    .side-stars .left { left:clamp(8px,2.2vw,32px); }
    .side-stars .right { right:clamp(8px,2.2vw,32px); }
    .side-stars .s1 { top:15%; font-size:clamp(26px,3.6vw,48px); transform:rotate(-18deg); }
    .side-stars .s2 { top:36%; font-size:clamp(18px,2.5vw,34px); transform:rotate(15deg); }
    .side-stars .s3 { top:60%; font-size:clamp(30px,4vw,52px); transform:rotate(12deg); }
    .side-stars .s4 { top:82%; font-size:clamp(20px,2.8vw,38px); transform:rotate(-12deg); }
    .side-stars .right.s1 { top:20%; transform:rotate(16deg); }
    .side-stars .right.s2 { top:43%; transform:rotate(-15deg); }
    .side-stars .right.s3 { top:68%; transform:rotate(-8deg); }
    .side-stars .right.s4 { top:90%; transform:rotate(18deg); }
    main { display:block; }
    .hero { position:relative; min-height:620px; display:grid; grid-template-columns:minmax(0,1fr); align-items:center; justify-items:center; padding:70px max(6%,calc((100% - 1180px)/2)); background:linear-gradient(120deg,#fff9f7,#f0d9e4); text-align:center; }
    .hero-copy { max-width:900px; }
    .eyebrow { margin:0 0 8px; text-transform:uppercase; letter-spacing:3px; font-size:12px; font-weight:700; color:#806c79; }
    h1 { font:clamp(52px,6vw,90px)/1.06 'Shrikhand',Georgia,serif; color:#5c4253; margin:18px 0; font-weight:400; }
    p { line-height:1.8; color:#665c64; }
    .hero-description { max-width:900px; margin:22px auto; font-size:clamp(1rem,1.6vw,1.2rem); }
    .primary-button { display:inline-flex; align-items:center; justify-content:center; min-height:45px; padding:14px 22px; border:0; border-radius:8px; background:#604a59; color:white; font:600 14px 'DM Sans',Arial,sans-serif; cursor:pointer; }
    .section { max-width:1250px; margin:auto; padding:70px 6%; text-align:center; }
    h2 { margin:10px 0; color:#604a59; font:42px/1.2 'Shrikhand',Georgia,serif; font-weight:400; }
    .features { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; margin-top:35px; }
    .feature { padding:28px; border:1px solid var(--line); border-radius:14px; background:white; }
    .feature>span { font-size:36px; }
    .feature h3 { margin:12px 0 6px; color:#4a3f4b; font-size:17px; }
    .feature p { margin:0; font-size:14px; }
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
    .site-footer { padding:32px 6% 18px; background:#4a3f4b; color:white; }
    .footer-inner { display:flex; justify-content:space-between; gap:32px; max-width:1180px; margin:auto; text-align:left; }
    .footer-brand p { color:#f1e7ee; font-size:14px; }
    .footer-contact { display:flex; flex-direction:column; gap:8px; min-width:180px; }
    .footer-contact strong { margin-bottom:5px; }
    .footer-contact a { color:#f1e7ee; font-size:13px; text-decoration:underline; text-underline-offset:3px; }
    .contact-note { display:block; max-width:1180px; margin:20px auto 0; padding-top:16px; border-top:1px solid #ffffff30; color:#f1e7ee; font-size:11px; opacity:.8; }
    @media(max-width:850px) { .hero { min-height:560px; padding:60px 6%; } .section { padding:58px 6%; } .quote-section { padding:58px 6%; } }
    @media(max-width:560px) {
      .site-header { padding:12px 5%; }
      .brand-name { font-size:25px; }
      nav { gap:12px; font-size:13px; }
      .nav-link { font-size:13px; }
      .cart-trigger { width:38px; height:38px; }
      .cart-badge { top:-1px; right:-3px; }
      .hero { min-height:580px; padding:55px 6%; }
      h1 { font-size:clamp(46px,12vw,66px); }
      .hero-description { font-size:1rem; }
      .section { padding:55px 6%; }
      h2 { font-size:34px; }
      .features { grid-template-columns:1fr; }
      .quote-section { padding:50px 6%; }
      .quote-form { grid-template-columns:1fr; padding:18px; }
      .full { grid-column:auto; }
      .footer-inner { flex-direction:column; text-align:center; align-items:center; }
      .footer-contact { align-items:center; }
      .contact-note { text-align:center; }
    }
   `]
})
export class Landing {
  readonly currentYear = new Date().getFullYear();
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
