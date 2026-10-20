import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FirestoreBusinessRepository, StarKiesBackupFile } from '../../core/firebase/firestore-business.repository';
import { FirebaseClientService } from '../../core/firebase/firebase-client.service';
import { DataService } from '../../services/data.service';

@Component({
  selector: 'app-migration',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <main class="migration-page">
      <section class="migration-card">
        <div class="brand-mark" aria-hidden="true">S</div>
        <p class="eyebrow">STARKIES · MIGRACIÓN SEGURA</p>
        <h1>Conecta los datos de tu negocio</h1>
        <p class="intro">
          El respaldo original se conserva intacto. Selecciona el JSON de StarKies para preparar
          una copia en Firebase; no se escribirá nada hasta que confirmes la importación.
        </p>

        @if (alreadyMigrated()) {
          <div class="notice success" role="status">
            Los datos de StarKies ya están inicializados en Firebase. La importación está bloqueada
            para evitar sobrescribir registros existentes.
          </div>
          <button matButton="text" type="button" class="primary" (click)="openAdmin()">Ir al administrador</button>
        } @else {
          @if (routeError()) {
            <div class="notice warning" role="status">
              No se pudo comprobar el estado de Firestore. Revisa las reglas y la conexión antes de importar.
            </div>
          }

          <label class="file-picker">
            <span class="file-title">Respaldo JSON de StarKies</span>
            <span class="file-description">Selecciona el archivo descargado de tu proyecto original.</span>
            <input type="file" accept=".json,application/json" (change)="onFileSelected($event)" [disabled]="busy()" />
          </label>

          @if (fileName()) {
            <p class="filename"><strong>Archivo:</strong> {{ fileName() }}</p>
          }

          @if (backup()) {
            <div class="summary">
              <div class="summary-header">
                <div>
                  <span class="summary-label">Negocio</span>
                  <strong>{{ backup()?.business || 'StarKies' }}</strong>
                </div>
                <div>
                  <span class="summary-label">Exportado</span>
                  <strong>{{ backup()?.exportedAt || 'Fecha no indicada' }}</strong>
                </div>
              </div>
              <div class="summary-total">
                <strong>{{ totalRecords() }}</strong>
                <span>registros en colecciones</span>
              </div>
              <div class="counts">
                @for (entry of counts(); track entry.name) {
                  <div class="count-row">
                    <span>{{ entry.name }}</span>
                    <strong>{{ entry.count }}</strong>
                  </div>
                }
              </div>
              <p class="safe-note">
                La importación conserva las estructuras originales y guarda el respaldo completo como archivo de migración.
                Si Firebase ya contiene datos en las colecciones de destino, el proceso se cancela en lugar de sobrescribirlos.
              </p>
            </div>
          }

          @if (error()) {
            <div class="notice error" role="alert">{{ error() }}</div>
          }
          @if (success()) {
            <div class="notice success" role="status">{{ success() }}</div>
          }

          <button matButton="text"
            type="button"
            class="primary"
            (click)="importBackup()"
            [disabled]="!backup() || busy() || alreadyMigrated()"
          >
            {{ busy() ? 'Importando datos de forma segura…' : 'Importar respaldo a Firebase' }}
          </button>
          <p class="footnote">
            No uses un archivo modificado manualmente. Conserva una copia intacta del respaldo original.
          </p>
        }
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }
    .migration-page { min-height: calc(100vh - 100px); display: grid; place-items: start center; padding: 24px 0; color: #292622; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .migration-card { width: min(100%, 760px); box-sizing: border-box; padding: clamp(22px, 4vw, 38px); background: #fff; border: 1px solid #e9e3dc; border-radius: 22px; box-shadow: 0 18px 60px rgba(47, 34, 24, .06); }
    .brand-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 14px; background: #6e4433; color: #fffaf5; font-family: Georgia, serif; font-size: 27px; }
    .eyebrow { margin: 18px 0 8px; color: #936a54; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
    h1 { margin: 0; font-family: Georgia, serif; font-size: clamp(28px, 5vw, 36px); font-weight: 500; letter-spacing: -.04em; }
    .intro { margin: 12px 0 24px; color: #756c65; font-size: 14px; line-height: 1.7; }
    .file-picker { display: grid; gap: 7px; padding: 20px; border: 1px dashed #c7b5a8; border-radius: 14px; background: #fffcf9; cursor: pointer; }
    .file-title { font-size: 14px; font-weight: 750; }
    .file-description { color: #756c65; font-size: 13px; }
    input[type=file] { margin-top: 8px; width: 100%; font: inherit; font-size: 13px; }
    .filename { margin: 12px 0; font-size: 13px; overflow-wrap: anywhere; }
    .summary { margin: 18px 0; border: 1px solid #eee5dc; border-radius: 14px; overflow: hidden; }
    .summary-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 16px; padding: 16px; background: #faf7f3; }
    .summary-header > div { display: grid; gap: 5px; }
    .summary-header strong { font-size: 13px; overflow-wrap: anywhere; }
    .summary-label { color: #887d74; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .summary-total { display: flex; align-items: baseline; gap: 8px; padding: 18px 16px 8px; }
    .summary-total strong { font-size: 26px; font-family: Georgia, serif; }
    .summary-total span { color: #756c65; font-size: 13px; }
    .counts { padding: 0 16px 12px; }
    .count-row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f0ebe6; font-size: 13px; }
    .count-row:last-child { border-bottom: 0; }
    .safe-note { margin: 0; padding: 14px 16px; background: #f8f5f1; color: #756c65; font-size: 12px; line-height: 1.6; }
    .notice { margin: 16px 0; padding: 13px 14px; border-radius: 10px; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
    .notice.warning { background: #fff7e6; color: #79521a; }
    .notice.error { background: #fff1ee; color: #8b3024; }
    .notice.success { background: #edf8f0; color: #22643a; }
    .primary { width: 100%; margin-top: 18px; border: 0; border-radius: 11px; padding: 14px; background: #6e4433; color: #fffaf5; font: inherit; font-weight: 750; cursor: pointer; }
    .primary:disabled { cursor: not-allowed; opacity: .55; }
    .footnote { margin: 16px 0 0; color: #8a817a; font-size: 12px; line-height: 1.6; }
  `],
})
export class Migration implements OnInit {
  readonly backup = signal<StarKiesBackupFile | null>(null);
  readonly fileName = signal('');
  readonly counts = signal<{ name: string; count: number }[]>([]);
  readonly totalRecords = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly alreadyMigrated = signal(false);
  readonly routeError = signal(false);

  constructor(
    private readonly repository: FirestoreBusinessRepository,
    private readonly firebase: FirebaseClientService,
    private readonly dataService: DataService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.routeError.set(this.route.snapshot.queryParamMap.get('error') === 'firestore-check');
  }

  async ngOnInit(): Promise<void> {
    if (!this.firebase.isConfigured) {
      this.error.set(this.firebase.configurationMessage);
      return;
    }
    try {
      this.alreadyMigrated.set(await this.repository.hasCompletedMigration());
    } catch {
      this.routeError.set(true);
    }
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.error.set('');
    this.success.set('');
    this.backup.set(null);
    this.counts.set([]);
    this.totalRecords.set(0);
    if (!file) return;

    this.fileName.set(file.name);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!this.isRecord(parsed) || !this.isRecord(parsed['state'])) {
        throw new Error('El archivo no contiene un objeto "state" válido de StarKies.');
      }

      const candidate = parsed as unknown as StarKiesBackupFile;
      const entries = Object.entries(candidate.state);
      const collectionCounts = entries
        .filter(([, value]) => Array.isArray(value))
        .map(([name, value]) => ({ name, count: (value as unknown[]).length }));
      this.backup.set(candidate);
      this.counts.set(collectionCounts);
      this.totalRecords.set(collectionCounts.reduce((total, entry) => total + entry.count, 0));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo leer el archivo JSON.');
    }
  }

  async importBackup(): Promise<void> {
    const backup = this.backup();
    if (!backup || this.busy() || this.alreadyMigrated()) return;

    this.busy.set(true);
    this.error.set('');
    this.success.set('');
    try {
      await this.repository.importInitialBackup(backup);
      await this.dataService.loadFromCloud();
      this.success.set('La migración terminó correctamente. Abriendo StarKies Admin…');
      await this.router.navigateByUrl('/recetas');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'La importación no pudo completarse.');
    } finally {
      this.busy.set(false);
    }
  }

  async openAdmin(): Promise<void> {
    await this.router.navigateByUrl('/recetas');
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
