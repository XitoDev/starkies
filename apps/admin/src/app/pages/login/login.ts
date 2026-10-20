import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatIconModule],
  template: `
    <main class="login-page">
      <section class="login-card">
        <div class="brand-mark" aria-hidden="true">S</div>
        <p class="eyebrow">STARKIES · MI NEGOCIO</p>
        <h1>Bienvenido de nuevo</h1>
        <p class="subtitle">Inicia sesión para administrar tu negocio.</p>

        @if (!firebase.isConfigured) {
          <div class="notice warning" role="status">
            Firebase todavía no está configurado. Revisa
            <code>apps/admin/src/app/core/firebase/firebase.config.ts</code>.
          </div>
        }

        @if (message()) {
          <div class="notice" role="alert">{{ message() }}</div>
        }

        <form (ngSubmit)="submit()" #loginForm="ngForm">
          <label for="email">Correo electrónico</label>
          <input
            id="email"
            name="email"
            type="email"
            [(ngModel)]="email"
            autocomplete="username"
            placeholder="tu@negocio.com"
            required
          />

          <label for="password">Contraseña</label>
          <input
            id="password"
            name="password"
            type="password"
            [(ngModel)]="password"
            autocomplete="current-password"
            placeholder="Tu contraseña"
            required
          />

          <label class="remember-device">
            <input
              id="rememberDevice"
              name="rememberDevice"
              type="checkbox"
              [(ngModel)]="rememberDevice"
            />
            <span>Recordar este dispositivo</span>
          </label>

          <button matButton="text" type="submit" [disabled]="loading() || !loginForm.valid || !firebase.isConfigured">
            {{ loading() ? 'Ingresando…' : 'Iniciar sesión' }}
          </button>
        </form>

        <p class="footnote">El acceso se habilita únicamente para usuarios autorizados por el negocio.</p>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .login-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #f7f5f2; color: #292622; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .login-card { width: min(100%, 420px); padding: 36px; background: #fff; border: 1px solid #e9e3dc; border-radius: 22px; box-shadow: 0 18px 60px rgba(47, 34, 24, .08); }
    .brand-mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 15px; background: #6e4433; color: #fffaf5; font-family: Georgia, serif; font-size: 28px; }
    .eyebrow { margin: 20px 0 8px; color: #936a54; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
    h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(28px, 5vw, 34px); font-weight: 500; letter-spacing: -.04em; }
    .subtitle { margin: 10px 0 26px; color: #756c65; font-size: 14px; line-height: 1.6; }
    form { display: grid; gap: 10px; }
    label { margin-top: 7px; font-size: 13px; font-weight: 700; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #ddd4cb; border-radius: 11px; padding: 13px 14px; background: #fffdfa; color: inherit; font: inherit; outline: none; }
    input:focus { border-color: #8b5c43; box-shadow: 0 0 0 3px rgba(139, 92, 67, .12); }
    .remember-device { display: flex; align-items: center; gap: 10px; margin-top: 8px; color: #514840; font-size: 13px; font-weight: 500; cursor: pointer; }
    .remember-device input { width: 16px; height: 16px; margin: 0; accent-color: #6e4433; }
    button { margin-top: 12px; border: 0; border-radius: 11px; padding: 14px; background: #6e4433; color: #fffaf5; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: .55; }
    .notice { margin: 0 0 18px; padding: 12px; border-radius: 10px; background: #fff1ee; color: #8b3024; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
    .notice.warning { background: #fff7e6; color: #79521a; }
    code { font-size: 12px; }
    .footnote { margin: 20px 0 0; color: #8a817a; font-size: 12px; line-height: 1.5; text-align: center; }
    @media (max-width: 480px) { .login-card { padding: 26px 22px; } }
  `],
})
export class Login {
  email = '';
  password = '';
  rememberDevice = true;
  loading = signal(false);
  message = signal('');

  constructor(
    readonly firebase: FirebaseClientService,
    private readonly dataService: DataService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    if (this.route.snapshot.queryParamMap.has('denied')) {
      this.message.set('Tu cuenta no está autorizada para administrar StarKies. Contacta al administrador del negocio.');
    } else if (this.route.snapshot.queryParamMap.get('setup') === 'firebase') {
      this.message.set('Completa primero la configuración web de Firebase para habilitar el acceso.');
    } else if (this.route.snapshot.queryParamMap.has('error')) {
      this.message.set('No se pudo verificar tu acceso. Comprueba la conexión y vuelve a intentarlo.');
    }
  }

  async submit(): Promise<void> {
    if (this.loading() || !this.email.trim() || !this.password || !this.firebase.isConfigured) return;
    this.loading.set(true);
    this.message.set('');

    try {
      await this.firebase.setDevicePersistence(this.rememberDevice);
      const credential = await this.firebase.signIn(this.email, this.password);
      const { getDoc, doc } = await import('firebase/firestore');
      const adminDoc = await getDoc(doc(this.firebase.firestore, 'adminUsers', credential.user.uid));
      if (!adminDoc.exists()) {
        await this.firebase.signOut();
        this.message.set('La cuenta inició sesión, pero todavía no tiene permisos de administrador.');
        return;
      }

      // Load Firestore only after the user's admin allow-list entry has been verified.
      // If no migration exists yet, the route guard will send them to /migracion.
      await this.dataService.loadFromCloud();

      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/recetas');
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      this.message.set(
        code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo iniciar sesión. Verifica que Email/Password esté habilitado en Firebase Authentication.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
