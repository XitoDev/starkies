import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [FormsModule],
  template: `
    <header class="site-header">
      <a class="brand" href="/" aria-label="StarKies, inicio"><span class="brand-name">StarKies <span aria-hidden="true">✦</span></span></a>
      <nav aria-label="Navegación principal">
        <a class="nav-link active" href="/">Inicio</a>
        <a class="nav-link" href="/menu">Catálogo</a>
      </nav>
    </header>

    <main>
      <section class="hero" aria-labelledby="hero-title">
        <div class="starfield" aria-hidden="true">
          <span class="star star-a">✦</span><span class="star star-b">✧</span><span class="star star-c">✦</span>
          <span class="star star-d">✧</span><span class="star star-e">✦</span><span class="star star-f">✧</span>
          <span class="star star-g">✦</span><span class="star star-h">✧</span><span class="star star-i">✦</span>
          <span class="star star-j">✧</span><span class="star star-k">✦</span><span class="star star-l">✧</span>
          <span class="star star-m">✦</span><span class="star star-n">✧</span><span class="star star-o">✦</span>
          <span class="star star-p">✧</span><span class="star star-q">✦</span><span class="star star-r">✧</span>
          <span class="star star-s">✦</span><span class="star star-t">✧</span><span class="star star-u">✦</span>
          <span class="star star-v">✧</span><span class="star star-w">✦</span><span class="star star-x">✧</span>
        </div>
        <div class="hero-copy">
          <p class="eyebrow">GALLETAS HECHAS CON AMOR</p>
          <h1 id="hero-title">La estrella<br>eres tú.</h1>
          <p class="hero-description">Galletas irresistibles para los momentos que merecen algo especial. Elige tus favoritas, arma tu caja y disfruta cada mordida.</p>
          <a class="primary-button" href="/menu">Ver catálogo</a>
        </div>
      </section>

      <section class="quote-section" id="cotizar" aria-labelledby="quote-title">
        <div class="quote-copy">
          <p class="eyebrow">PARA TUS MOMENTOS ESPECIALES</p>
          <h2 id="quote-title">¿Tienes una idea dulce en mente?</h2>
          <p>Cuéntanos qué imaginas para tu cumpleaños, celebración, regalo o evento. Te ayudaremos a convertirlo en galletas especiales.</p>
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
            <label for="quote-quantity">Cantidad aproximada de galletas</label>
            <input id="quote-quantity" name="quantity" [(ngModel)]="quantity" type="number" min="1" max="5000" step="1" placeholder="Ej. 24">
          </div>
          <div class="field">
            <label for="quote-type">Tipo de galletas</label>
            <select id="quote-type" name="cookieType" [(ngModel)]="cookieType">
              <option value="">Todavía no lo sé</option>
              <option value="Clásicas">Clásicas</option>
              <option value="NY Style">NY Style</option>
              <option value="Mixtas">Mixtas</option>
              <option value="Personalizadas y decoradas">Personalizadas y decoradas</option>
            </select>
          </div>
          <div class="field full">
            <label for="quote-notes">Cuéntanos cómo te gustaría que fueran</label>
            <textarea id="quote-notes" name="notes" [(ngModel)]="notes" rows="5" maxlength="2000" placeholder="Ocasión, temática, colores, fecha del evento y cualquier detalle que debamos conocer…"></textarea>
          </div>
          <p class="form-hint full">Al enviar, se abrirá WhatsApp con los datos de tu solicitud para que puedas revisarlos y mandarlos.</p>
          <button class="primary-button full submit-button" type="submit">Cotizar por WhatsApp <span aria-hidden="true">↗</span></button>
          @if (formError) { <p class="form-error full" role="alert">{{ formError }}</p> }
        </form>
      </section>
    </main>

    <footer class="site-footer">
      <div class="footer-brand"><span class="brand-name">StarKies <span aria-hidden="true">✦</span></span><p>La estrella eres tú.<br>Galletas artesanales para tus momentos especiales.</p></div>
      <div class="footer-contact"><strong>Contacto y redes sociales</strong>
        <a href="https://wa.me/593979075202" target="_blank" rel="noopener noreferrer">WhatsApp · 0979075202</a>
        <a href="https://www.instagram.com/starkies.ec/" target="_blank" rel="noopener noreferrer">Instagram · @starkies.ec</a>
        <a href="https://www.tiktok.com/@starkies.ec" target="_blank" rel="noopener noreferrer">TikTok · @starkies.ec</a>
      </div>
      <small>© {{ currentYear }} StarKies · La estrella eres tú.</small>
    </footer>
  `,
  styles: [`
    :host { display:block; --cream:#fbf8f5; --rose:#f0d9e4; --mauve:#806c79; --ink:#4a3f4b; --line:#e9dfe5; color:var(--ink); background:var(--cream); font-family:'DM Sans',Arial,sans-serif; }
    * { box-sizing:border-box; }
    a { color:inherit; text-decoration:none; }
    .site-header { min-height:76px; padding:12px clamp(20px,6vw,76px); display:flex; justify-content:space-between; align-items:center; gap:20px; background:#fff; border-bottom:1px solid var(--line); position:relative; z-index:2; }
    .brand-name { color:#735363; font-family:'Shrikhand',Georgia,serif; font-size:clamp(1.8rem,3vw,2.4rem); line-height:1; }
    .brand-name span { font-family:Georgia,serif; }
    nav { display:flex; align-items:center; gap:26px; } .nav-link { padding:10px 0; } .nav-link.active { font-weight:700; }
    .hero { position:relative; isolation:isolate; overflow:hidden; display:grid; place-items:center; min-height:min(690px,calc(100svh - 76px)); padding:78px 24px 96px; text-align:center; background:linear-gradient(115deg,#fff9f7 0%,#f8eaf0 56%,#f0d9e4 100%); }
    .hero-copy { position:relative; z-index:1; max-width:920px; } .eyebrow { margin:0 0 18px; color:var(--mauve); font-size:.78rem; font-weight:700; letter-spacing:.25em; }
    h1 { margin:0; color:#5c4253; font-family:'Shrikhand',Georgia,serif; font-size:clamp(3.7rem,7.4vw,6.4rem); font-weight:400; line-height:1.06; }
    .hero-description { max-width:900px; margin:28px auto 22px; color:#665c64; font-size:clamp(1rem,1.6vw,1.2rem); line-height:1.8; }
    .primary-button { display:inline-flex; justify-content:center; align-items:center; gap:10px; min-height:54px; padding:0 28px; border:0; border-radius:10px; background:#604a59; color:white; font:700 1rem 'DM Sans',Arial,sans-serif; cursor:pointer; transition:background .18s ease,transform .18s ease; }
    .primary-button:hover { background:#4a3f4b; transform:translateY(-1px); }
    .starfield { position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none; color:#a9829a; }
    .star { position:absolute; display:block; line-height:1; opacity:.78; user-select:none; }
    .star-a{left:7%;top:12%;font-size:28px}.star-b{left:18%;top:26%;font-size:18px}.star-c{left:31%;top:8%;font-size:22px}.star-d{left:42%;top:18%;font-size:15px}.star-e{left:56%;top:9%;font-size:25px}.star-f{left:72%;top:20%;font-size:19px}.star-g{left:87%;top:12%;font-size:31px}.star-h{left:94%;top:36%;font-size:18px}.star-i{left:4%;top:47%;font-size:22px}.star-j{left:15%;top:65%;font-size:18px}.star-k{left:28%;top:82%;font-size:27px}.star-l{left:39%;top:72%;font-size:16px}.star-m{left:51%;top:88%;font-size:20px}.star-n{left:63%;top:75%;font-size:28px}.star-o{left:76%;top:87%;font-size:19px}.star-p{left:91%;top:70%;font-size:23px}.star-q{left:11%;top:90%;font-size:25px}.star-r{left:23%;top:43%;font-size:13px}.star-s{left:68%;top:43%;font-size:17px}.star-t{left:82%;top:52%;font-size:14px}.star-u{left:35%;top:53%;font-size:15px}.star-v{left:48%;top:33%;font-size:18px}.star-w{left:59%;top:57%;font-size:12px}.star-x{left:97%;top:91%;font-size:20px}
    .quote-section { display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr); gap:clamp(30px,6vw,80px); align-items:start; padding:clamp(54px,8vw,100px) clamp(20px,8vw,110px); max-width:1300px; margin:auto; }
    .quote-copy { position:sticky; top:36px; } h2 { margin:0 0 18px; color:#5c4253; font:400 clamp(2.2rem,4vw,3.6rem)/1.1 'Shrikhand',Georgia,serif; } .quote-copy>p:last-child { color:#665c64; line-height:1.8; }
    .quote-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; padding:28px; border:1px solid var(--line); border-radius:18px; background:white; box-shadow:0 14px 40px #4a3f4b0a; }
    .field { min-width:0; } .field label { display:block; margin:0 0 8px; font-size:.88rem; font-weight:700; } .field label span { color:#a43d67; }
    .field input,.field select,.field textarea { width:100%; min-height:48px; padding:12px 13px; border:1px solid #d9cbd4; border-radius:8px; background:#fff; color:var(--ink); font:inherit; } .field textarea { min-height:140px; resize:vertical; line-height:1.6; }
    .field input:focus,.field select:focus,.field textarea:focus { outline:3px solid #c1a0ac55; border-color:var(--mauve); } .full { grid-column:1/-1; } .form-hint { margin:0; color:#766a73; font-size:.85rem; line-height:1.6; } .submit-button { width:100%; } .form-error { margin:0; color:#9b294b; }
    .site-footer { display:grid; grid-template-columns:1fr 1fr; gap:28px; align-items:start; padding:38px clamp(20px,6vw,76px) 24px; background:#4a3f4b; color:#f8eef3; } .footer-brand p { color:#e9dfe5; line-height:1.7; } .footer-contact { display:flex; flex-direction:column; gap:10px; } .footer-contact strong { margin-bottom:4px; } .footer-contact a { color:#f8eef3; text-decoration:underline; text-underline-offset:3px; } .site-footer small { grid-column:1/-1; padding-top:18px; border-top:1px solid #ffffff30; }
    @media(max-width:760px) { .hero { min-height:590px; padding:68px 24px; } .quote-section { grid-template-columns:1fr; } .quote-copy { position:static; } }
    @media(max-width:520px) { .site-header { padding:14px 18px; } nav { gap:16px; font-size:.9rem; } .hero { min-height:580px; } .hero-description { font-size:1rem; } .quote-form { grid-template-columns:1fr; padding:20px; } .full { grid-column:auto; } .site-footer { grid-template-columns:1fr; } .site-footer small { grid-column:auto; } }
    @media(prefers-reduced-motion:reduce) { .primary-button { transition:none; } }
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

  sendQuote(form: { valid: boolean; control?: { get: (name: string) => { valid: boolean } | null }; controls?: Record<string, { valid: boolean }> }): void {
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
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
