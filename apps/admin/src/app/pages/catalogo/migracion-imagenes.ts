import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../services/data.service';
import { ImageCdnUploadService } from '../../services/image-cdn-upload.service';
import { RecipeImageService } from '../../services/recipe-image.service';
import { PromotionsService } from '../../services/promotions.service';
import { Recipe } from 'shared';

type MigrationFailure = { label: string; message: string };

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

@Component({
  selector: 'app-image-migration',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <main class="migration-page">
      <header>
        <p class="eyebrow">Almacenamiento · Cloudflare R2</p>
        <h1>Migración de imágenes</h1>
        <p>Convierte las fotografías existentes a WebP, las guarda en R2 y actualiza sus referencias sin borrar los originales.</p>
      </header>

      @if (loading()) {
        <p class="status">Revisando recetas y promociones…</p>
      } @else {
        <section class="summary">
          <article><strong>{{ productCount() }}</strong><span>Fotos de productos</span></article>
          <article><strong>{{ promotionCount() }}</strong><span>Banners</span></article>
          <article><strong>{{ alreadyMigrated() }}</strong><span>Ya están en R2</span></article>
          <article><strong>{{ remaining() }}</strong><span>Pendientes</span></article>
        </section>
      }

      @if (running()) {
        <section class="progress-card" aria-live="polite">
          <div class="progress-heading"><strong>Migrando imágenes…</strong><span>{{ completed() }} / {{ total() }}</span></div>
          <div class="progress-track"><span [style.width.%]="total() ? completed() / total() * 100 : 0"></span></div>
          <p>{{ currentTask() }}</p>
        </section>
      }

      @if (finished()) {
        <section class="result-card" role="status">
          <mat-icon>task_alt</mat-icon>
          <div><strong>Migración finalizada</strong><p>{{ migrated() }} imágenes actualizadas. {{ skipped() }} ya estaban migradas. {{ failures().length }} incidencias.</p></div>
        </section>
      }

      @if (connectionStatus(); as result) {
        <section class="result-card" role="status">
          <mat-icon>{{ result.success ? 'check_circle' : 'error' }}</mat-icon>
          <div><strong>{{ result.success ? 'Conexión verificada' : 'No se pudo verificar la conexión' }}</strong><p>{{ result.message }}</p></div>
        </section>
      }

      @if (failures().length) {
        <section class="failures">
          <h2>Imágenes que requieren revisión</h2>
          @for (failure of failures(); track failure.label) {
            <article><strong>{{ failure.label }}</strong><p>{{ failure.message }}</p></article>
          }
        </section>
      }

      <footer>
        <button matButton="outlined" type="button" [disabled]="loading() || running() || connectionChecking()" (click)="checkConnection()">
          <mat-icon>cloud_done</mat-icon>
          {{ connectionChecking() ? 'Verificando conexión…' : 'Probar conexión con R2' }}
        </button>
        <p>La migración no elimina fotografías del repositorio Git. Primero verifica que todas las imágenes se vean correctamente en el catálogo; la limpieza del historial se realizará en una fase separada.</p>
        <button matButton="elevated" type="button" [disabled]="loading() || running() || productCount() + promotionCount() === 0" (click)="start()">
          <mat-icon>cloud_upload</mat-icon>
          {{ running() ? 'Procesando…' : 'Verificar y migrar imágenes' }}
        </button>
      </footer>
    </main>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.migration-page{display:grid;gap:20px;max-width:900px}.eyebrow{margin:0 0 8px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase}h1{margin:0;font-size:clamp(27px,3vw,36px);font-weight:600;letter-spacing:-1px}header>p:last-child{max-width:680px;color:#887b90;font-size:13px;line-height:1.6}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.summary article,.progress-card,.failures,.result-card{padding:16px;border:1px solid #eee7f2;border-radius:12px;background:#fff}.summary article{display:grid;gap:5px}.summary strong{font-size:24px}.summary span,.status{color:#887b90;font-size:11px}.progress-heading{display:flex;justify-content:space-between;font-size:12px}.progress-track{height:8px;margin-top:12px;border-radius:20px;background:#f0eaf3;overflow:hidden}.progress-track span{display:block;height:100%;background:#806c79;transition:width .2s}.progress-card p{margin:10px 0 0;color:#887b90;font-size:11px}.result-card{display:flex;align-items:center;gap:12px}.result-card mat-icon{color:#39744b}.result-card p,.failures p{margin:5px 0 0;color:#887b90;font-size:11px;line-height:1.5}.failures{display:grid;gap:10px}.failures h2{margin:0;font-size:14px}.failures article{padding-top:10px;border-top:1px solid #eee7f2}.failures strong{font-size:12px}.migration-page footer{display:grid;justify-items:start;gap:12px;padding-top:12px}.migration-page footer p{margin:0;color:#887b90;font-size:11px;line-height:1.6}.migration-page button{min-height:42px}@media(max-width:640px){.summary{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `]
})
export class ImageMigration {
  private readonly data = inject(DataService);
  private readonly imageUpload = inject(ImageCdnUploadService);
  private readonly recipeImages = inject(RecipeImageService);
  private readonly promotionsService = inject(PromotionsService);

  readonly loading = signal(true);
  readonly running = signal(false);
  readonly finished = signal(false);
  readonly completed = signal(0);
  readonly total = signal(0);
  readonly migrated = signal(0);
  readonly skipped = signal(0);
  readonly currentTask = signal('');
  readonly failures = signal<MigrationFailure[]>([]);
  readonly connectionChecking = signal(false);
  readonly connectionStatus = signal<{ success: boolean; message: string } | null>(null);
  readonly recipes = computed(() => this.data.recipes());
  readonly publicCatalog = computed(() => {
    const value = this.data.rawState()?.['publicCatalog'];
    return Array.isArray(value) ? value.map(asRecord).filter(item => String(item['id'] ?? '') !== 'catalog-settings') : [];
  });
  readonly promotions = computed(() => {
    const value = this.data.rawState()?.['promotions'];
    return Array.isArray(value) ? value.map(asRecord) : [];
  });
  readonly productImageJobs = computed(() => {
    const publicById = new Map(this.publicCatalog().map(item => [String(item['id'] ?? ''), item]));
    return this.recipes().flatMap(recipe => {
      const catalogImage = String(publicById.get(recipe.id)?.['image'] ?? '').trim();
      const canonicalImage = catalogImage || String(recipe.image ?? '').trim();
      return canonicalImage ? [{ id: recipe.id, label: recipe.name, url: canonicalImage, recipe }] : [];
    });
  });
  readonly catalogFallbackProducts = computed(() => {
    const recipeIds = new Set(this.recipes().map(recipe => recipe.id));
    return this.publicCatalog().filter(item => {
      const id = String(item['id'] ?? '');
      return Boolean(id && !recipeIds.has(id) && String(item['image'] ?? '').trim());
    });
  });
  readonly productCount = computed(() => this.productImageJobs().length + this.catalogFallbackProducts().length);
  readonly promotionCount = computed(() => this.promotions().filter(item => typeof item['bannerImage'] === 'string' && String(item['bannerImage']).trim()).length);
  readonly alreadyMigrated = computed(() => [
    ...this.productImageJobs().filter(job => this.imageUpload.isManagedUrl(job.url)).map(job => job.id),
    ...this.catalogFallbackProducts().filter(item => this.imageUpload.isManagedUrl(String(item['image'] ?? ''))).map(item => String(item['id'] ?? '')),
    ...this.promotions().filter(item => this.imageUpload.isManagedUrl(String(item['bannerImage'] ?? ''))).map(item => String(item['id'] ?? '')),
  ].length);
  readonly remaining = computed(() => this.productCount() + this.promotionCount() - this.alreadyMigrated());

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      await this.data.loadCollections(['recipes', 'promotions', 'publicCatalog', 'catalogDrafts'], true);
    } catch (error) {
      this.failures.set([{ label: 'Carga inicial', message: error instanceof Error ? error.message : 'No se pudieron leer los registros.' }]);
    } finally {
      this.loading.set(false);
    }
  }

  async checkConnection(): Promise<void> {
    if (this.connectionChecking() || this.running()) return;
    this.connectionChecking.set(true);
    this.connectionStatus.set(null);
    try {
      await this.imageUpload.checkConnection();
      this.connectionStatus.set({ success: true, message: 'R2 aceptó la escritura, la lectura pública desde images.starkies.lat y la eliminación del objeto temporal.' });
    } catch (error) {
      this.connectionStatus.set({ success: false, message: error instanceof Error ? error.message : 'No se pudo comprobar la conexión con Cloudflare R2.' });
    } finally {
      this.connectionChecking.set(false);
    }
  }

  async start(): Promise<void> {
    if (this.running() || this.loading()) return;
    await this.refresh();
    this.failures.set([]);
    this.finished.set(false);
    this.migrated.set(0);
    this.skipped.set(0);
    const recipes = [...this.data.recipes()];
    const promotions = this.promotions().map(item => ({ ...item }));
    const jobs = [
      ...this.productImageJobs().map(job => ({ ...job, kind: 'product' as const, catalogOnlyProduct: undefined as Record<string, unknown> | undefined })),
      ...this.catalogFallbackProducts().map(item => ({
        kind: 'product' as const,
        id: String(item['id'] ?? ''),
        label: String(item['name'] ?? item['id'] ?? 'Producto'),
        url: String(item['image'] ?? ''),
        recipe: undefined as Recipe | undefined,
        catalogOnlyProduct: item,
      })),
      ...promotions.filter(item => typeof item['bannerImage'] === 'string' && String(item['bannerImage']).trim()).map(item => ({ kind: 'promotion' as const, id: String(item['id'] ?? ''), label: String(item['name'] ?? item['title'] ?? item['id'] ?? 'Promoción'), url: String(item['bannerImage'] ?? ''), promotion: item })),
    ];
    this.total.set(jobs.length);
    this.completed.set(0);
    if (!jobs.length) { this.finished.set(true); return; }

    this.running.set(true);
    try {
      for (const job of jobs) {
        if (this.imageUpload.isManagedUrl(job.url)) {
          this.currentTask.set(job.label);
          try {
            if (job.kind === 'product' && job.recipe && String(job.recipe.image ?? '').trim() !== job.url) {
              await this.data.saveRecipe({ ...job.recipe, image: job.url } as Recipe);
            }
            await this.imageUpload.syncReference(job.kind, job.id, job.url, job.url);
            this.skipped.update(value => value + 1);
          } catch (error) {
            this.failures.update(items => [...items, { label: job.label, message: error instanceof Error ? error.message : 'No se pudo verificar la referencia R2.' }]);
          } finally {
            this.completed.update(value => value + 1);
          }
          continue;
        }
        this.currentTask.set(job.label);
        try {
          const sourceUrl = job.kind === 'product' ? this.recipeImages.getImageUrl(job.url) : job.url;
          const response = await fetch(sourceUrl, { mode: 'cors', credentials: 'omit' });
          if (!response.ok) throw new Error('La imagen original respondió HTTP ' + response.status + '.');
          const blob = await response.blob();
          const mime = blob.type || this.mimeFromUrl(sourceUrl);
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
            throw new Error('El archivo original no es JPG, PNG o WebP (' + (mime || 'tipo desconocido') + ').');
          }
          const extension = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
          const file = new File([blob], 'migration-' + job.id + '.' + extension, { type: mime });
          const imageUrl = await this.imageUpload.upload(file, job.kind, job.id);
          if (job.kind === 'product' && job.recipe) {
            await this.data.saveRecipe({ ...job.recipe, image: imageUrl } as Recipe);
            await this.imageUpload.syncReference('product', job.id, job.url, imageUrl);
          } else if (job.kind === 'product' && job.catalogOnlyProduct) {
            await this.data.savePublicCatalogImage(job.id, imageUrl);
            await this.imageUpload.syncReference('product', job.id, job.url, imageUrl);
          } else if (job.kind === 'promotion' && job.promotion) {
            await this.promotionsService.savePromotion({ ...job.promotion, bannerImage: imageUrl });
            await this.imageUpload.syncReference('promotion', job.id, job.url, imageUrl);
          }
          this.migrated.update(value => value + 1);
        } catch (error) {
          this.failures.update(items => [...items, {
            label: job.label,
            message: error instanceof Error ? error.message : 'No se pudo migrar esta imagen.',
          }]);
        } finally {
          this.completed.update(value => value + 1);
        }
      }
      await this.refresh();
      this.finished.set(true);
    } finally {
      this.running.set(false);
      this.currentTask.set('');
    }
  }

  private mimeFromUrl(value: string): string {
    const path = value.split('?')[0].toLocaleLowerCase();
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    return '';
  }
}
