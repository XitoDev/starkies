import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="privacy-page" aria-labelledby="privacy-title">
      <header class="privacy-hero">
        <a class="back-link" routerLink="/">← Volver a StarKies</a>
        <p class="eyebrow">TU PRIVACIDAD IMPORTA</p>
        <h1 id="privacy-title">Política de Privacidad</h1>
        <p class="intro">En StarKies usamos la información que compartes para atender tus pedidos, coordinar su entrega y ofrecerte una experiencia más sencilla cuando vuelvas a comprar.</p>
        <p class="updated">Última actualización: 24 de octubre de 2026</p>
      </header>

      <article class="policy-content">
        <section>
          <h2>1. ¿Quién gestiona tus datos?</h2>
          <p>Esta política describe cómo StarKies trata la información que recibimos a través de nuestro catálogo público y los canales que utilizamos para atender pedidos y consultas.</p>
          <p>Si tienes preguntas sobre esta política o quieres solicitar la revisión de tus datos, puedes escribirnos por <a href="https://wa.me/593979075202" target="_blank" rel="noopener noreferrer">WhatsApp al 0979075202</a>.</p>
        </section>

        <section>
          <h2>2. ¿Qué información podemos recopilar?</h2>
          <ul>
            <li>Datos de contacto que ingresas en el pedido, como nombre y número de teléfono.</li>
            <li>Datos necesarios para la entrega, como dirección, sector, fecha y modalidad de entrega o retiro.</li>
            <li>Detalles del pedido, incluidos productos, cantidades, importe, notas e información necesaria para gestionar su preparación y entrega.</li>
            <li>Si solicitas una cotización personalizada, los datos que escribas en ese formulario, como nombre, teléfono, cantidad aproximada, tipo de galletas y descripción de tu solicitud.</li>
          </ul>
          <p>Te pedimos que solo compartas la información necesaria para atender tu solicitud.</p>
        </section>

        <section>
          <h2>3. ¿Para qué usamos la información?</h2>
          <p>Utilizamos los datos para registrar y administrar pedidos, preparar las galletas solicitadas, coordinar entregas o retiros, comunicarnos contigo sobre tu compra, atender incidencias y mantener los registros operativos del negocio.</p>
          <p>Cuando ingresas tu teléfono en el formulario de pedido, el catálogo puede consultar si existe un pedido o registro anterior asociado a ese número y completar el nombre y la dirección que ya se habían proporcionado. Esto evita que tengas que escribir los mismos datos cada vez. Si los datos han cambiado, revísalos y corrígelos antes de confirmar.</p>
        </section>

        <section>
          <h2>4. ¿Dónde se almacenan los datos?</h2>
          <p>La información de los pedidos se procesa y almacena en Firebase, mediante servicios de base de datos utilizados por StarKies. Los datos de contacto y entrega necesarios para gestionar un pedido quedan asociados a ese pedido; además, el sistema puede mantener un registro de cliente y un índice por teléfono para facilitar la consulta de compras posteriores.</p>
          <p>El acceso a esos registros se utiliza para las tareas de administración y atención de StarKies. No publicamos tus datos de contacto en el catálogo público ni los vendemos a terceros.</p>
        </section>

        <section>
          <h2>5. Cookies y almacenamiento en el navegador</h2>
          <p>El catálogo utiliza el almacenamiento de sesión del navegador para conservar temporalmente el borrador de tu carrito mientras preparas un pedido. Este almacenamiento permite recuperar la selección durante la sesión y no es una ficha de cliente guardada en Firebase.</p>
          <p>La función de autocompletado de datos de pedidos anteriores consulta registros almacenados en el servidor cuando ingresas un número de teléfono válido. No depende de que exista una cookie con tu nombre, teléfono o dirección.</p>
          <p>Si abres WhatsApp desde un enlace del sitio, WhatsApp procesa la información que le envíes de acuerdo con sus propias condiciones y políticas de privacidad.</p>
        </section>

        <section>
          <h2>6. ¿Con quién compartimos la información?</h2>
          <p>Utilizamos proveedores tecnológicos, como Firebase, para operar el catálogo y almacenar los registros necesarios. También puedes elegir comunicarte con StarKies a través de WhatsApp; al hacerlo, la información que envíes se procesa en esa plataforma. No vendemos ni alquilamos tus datos personales.</p>
        </section>

        <section>
          <h2>7. Conservación y seguridad</h2>
          <p>Conservamos los datos mientras sean necesarios para atender pedidos, resolver consultas y mantener los registros operativos del negocio. El tiempo de conservación puede variar según el tipo de información y las necesidades de gestión del pedido.</p>
          <p>Aplicamos medidas razonables para proteger la información y limitar el acceso a los sistemas administrativos. Ningún servicio de transmisión o almacenamiento por internet puede garantizar seguridad absoluta.</p>
        </section>

        <section>
          <h2>8. Tus solicitudes y tus datos</h2>
          <p>Puedes contactarnos para consultar qué información tenemos sobre ti o solicitar que la corrijamos o eliminemos. Para ayudarnos a identificar el registro, escribe desde el número utilizado para el pedido o indica el teléfono asociado. Algunas solicitudes pueden requerir revisión si la información sigue siendo necesaria para gestionar un pedido en curso o mantener registros del negocio.</p>
          <p>Para iniciar una solicitud, contáctanos por <a href="https://wa.me/593979075202" target="_blank" rel="noopener noreferrer">WhatsApp al 0979075202</a>.</p>
        </section>

        <section>
          <h2>9. Cambios a esta política</h2>
          <p>Podemos actualizar esta página cuando cambien el catálogo, los procesos de atención o las prácticas de tratamiento de datos. La fecha al inicio indica la última actualización publicada.</p>
        </section>

        <div class="policy-actions">
          <a class="primary-link" routerLink="/menu">Volver al catálogo</a>
          <a class="secondary-link" routerLink="/">Ir al inicio</a>
        </div>
      </article>
    </section>
  `,
  styles: [`
    :host { display:block; background:#fbf8f5; color:#261f29; font-family:'DM Sans',Arial,sans-serif; }
    * { box-sizing:border-box; }
    .privacy-page { min-height:60vh; padding:0 6% 80px; }
    .privacy-hero { max-width:960px; margin:0 auto; padding:40px 0 34px; border-bottom:1px solid #e9dfe5; }
    .back-link { display:inline-flex; margin-bottom:32px; color:#604a59; font-size:13px; font-weight:700; text-decoration:none; }
    .back-link:hover, .policy-content a:not(.primary-link):hover { text-decoration:underline; text-underline-offset:3px; }
    .eyebrow { margin:0 0 12px; color:#806c79; font-size:11px; font-weight:800; letter-spacing:2px; }
    h1 { margin:0; color:#604a59; font:clamp(38px,6vw,62px)/1.12 'Shrikhand',Georgia,serif; font-weight:400; }
    .intro { max-width:760px; margin:18px 0 14px; color:#655963; font-size:clamp(15px,2vw,18px); line-height:1.8; }
    .updated { margin:0; color:#837781; font-size:12px; }
    .policy-content { max-width:820px; margin:0 auto; padding-top:16px; }
    .policy-content section { padding:22px 0; border-bottom:1px solid #e9dfe5; }
    h2 { margin:0 0 12px; color:#604a59; font-size:20px; line-height:1.4; }
    p, li { color:#5f5660; font-size:14px; line-height:1.85; }
    p { margin:0 0 12px; }
    p:last-child { margin-bottom:0; }
    ul { margin:0 0 12px; padding-left:22px; }
    li { margin:0 0 7px; padding-left:3px; }
    .policy-content a:not(.primary-link) { color:#604a59; text-underline-offset:3px; }
    .policy-actions { display:flex; flex-wrap:wrap; gap:12px; padding-top:28px; }
    .primary-link, .secondary-link { display:inline-flex; min-height:44px; align-items:center; justify-content:center; padding:12px 18px; border:1px solid #604a59; border-radius:8px; font-size:13px; font-weight:700; text-decoration:none; }
    .primary-link { background:#604a59; color:#fff; }
    .primary-link:hover { background:#4a3745; }
    .secondary-link { background:transparent; color:#604a59; }
    .secondary-link:hover { background:#f0e5eb; }
    .primary-link:focus-visible, .secondary-link:focus-visible, .back-link:focus-visible { outline:3px solid #b89cab; outline-offset:3px; }
    @media (max-width:560px) {
      .privacy-page { padding:0 5% 54px; }
      .privacy-hero { padding-top:28px; }
      .back-link { margin-bottom:24px; }
      .policy-content section { padding:19px 0; }
      h2 { font-size:18px; }
      p, li { font-size:13px; }
      .policy-actions { flex-direction:column; }
      .primary-link, .secondary-link { width:100%; }
    }
  `],
})
export class PrivacyPolicy {
  private readonly document = inject(DOCUMENT);

  constructor() {
    const title = inject(Title), meta = inject(Meta);
    const pageTitle = 'Política de Privacidad | StarKies';
    const pageDescription = 'Conoce cómo StarKies utiliza la información que compartes al realizar pedidos y solicitar cotizaciones de galletas artesanales en Guayaquil, Ecuador.';
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
  }
}
