import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DataService } from '../../services/data.service';
import { PromotionsService } from '../../services/promotions.service';
import { ImageCdnUploadService } from '../../services/image-cdn-upload.service';

type PromotionType = 'buy_x_get_y_discount' | 'percentage' | 'fixed_amount' | 'minimum_subtotal';
type PromotionStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED';
interface PromotionRecord extends Record<string, unknown> {
  id: string;
  name: string;
  title: string;
  description: string;
  code: string;
  status: PromotionStatus;
  startsAt: string;
  endsAt: string;
  bannerImage: string;
  showInCatalog: boolean;
  usageCount: number;
  createdAt?: string;
  mechanic: Record<string, unknown>;
}
interface PromotionForm {
  id: string; name: string; title: string; description: string; code: string;
  status: PromotionStatus; type: PromotionType; productIds: string[]; requireAllProducts: boolean; presentationId: string;
  buyQuantity: number; rewardQuantity: number; discountType: 'percentage' | 'fixed';
  discountValue: number; minimumSubtotal: number; maxApplications: number;
  startsAt: string; endsAt: string; bannerImage: string; showInCatalog: boolean;
  maxUses: number; maxUsesPerCustomer: number;
}
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asText(value: unknown): string { return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim(); }
function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

@Component({
  selector: 'app-promociones',
  imports: [FormsModule, MatButtonModule, MatIconModule],
  template: `
    <main class="promotions-page">
      <header class="page-heading">
        <div><p class="eyebrow">Catálogo</p><h1>Promociones</h1><p>Administra ofertas, códigos, banners y condiciones de compra desde un solo lugar.</p></div>
        <div class="heading-actions">
          <button matButton="outlined" type="button" (click)="createPromotion(true)"><mat-icon fontSet="material-symbols-rounded">auto_awesome</mat-icon> Plantilla Brownie Classic</button>
          <button matButton="elevated" type="button" (click)="createPromotion(false)"><mat-icon fontSet="material-symbols-rounded">add</mat-icon> Nueva promoción</button>
        </div>
      </header>

      @if (notice()) { <p class="notice" role="status">{{ notice() }}</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (loading()) { <p class="empty-state">Cargando promociones…</p> }
      @else if (promotions().length) {
        <section class="promotion-list" aria-label="Promociones creadas">
          @for (promotion of promotions(); track promotion.id) {
            <article class="promotion-card">
              @if (promotion.bannerImage) { <img class="promotion-thumb" [src]="promotion.bannerImage" [alt]="promotion.title" loading="lazy"> }
              @else { <div class="promotion-thumb empty-thumb"><mat-icon fontSet="material-symbols-rounded">image</mat-icon></div> }
              <div class="promotion-copy">
                <div class="promotion-title-row"><h2>{{ promotion.name }}</h2><span class="status" [class.active]="statusLabel(promotion) === 'Activa'">{{ statusLabel(promotion) }}</span></div>
                <p>{{ promotion.title || 'Sin título público' }}</p>
                <div class="promotion-meta"><span>Código <strong>{{ promotion.code }}</strong></span><span>{{ mechanicSummary(promotion) }}</span><span>{{ asNumber(promotion.usageCount) }} usos</span></div>
              </div>
              <div class="card-actions">
                <button matButton="outlined" type="button" (click)="editPromotion(promotion)">Editar</button>
                <button matButton="text" type="button" class="delete-action" (click)="confirmDeletePromotion(promotion)">Eliminar</button>
              </div>
            </article>
          }
        </section>
      } @else {
        <section class="empty-state"><mat-icon fontSet="material-symbols-rounded">local_offer</mat-icon><h2>Aún no tienes promociones</h2><p>Crea una oferta, define sus condiciones y publícala cuando esté lista.</p></section>
      }

      @if (editing()) {
        <div class="editor-backdrop">
          <form class="promotion-editor" (ngSubmit)="save()">
            <header class="editor-heading"><div><p class="eyebrow">Configuración de oferta</p><h2>{{ form.name || 'Nueva promoción' }}</h2></div><button matIconButton type="button" aria-label="Cerrar" (click)="closeEditor()"><mat-icon fontSet="material-symbols-rounded">close</mat-icon></button></header>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }

            <section class="editor-section">
              <h3>Información general</h3>
              <div class="form-grid">
                <label>Nombre interno<input [(ngModel)]="form.name" name="name" maxlength="80" required placeholder="Ej. Brownie Classic 50%"></label>
                <label>Código promocional<input [(ngModel)]="form.code" name="code" maxlength="40" required placeholder="BROWNIE50" (ngModelChange)="form.code = $event.toLocaleUpperCase('es').replace(/\\s+/g, '')"></label>
                <label class="full">Título público<input [(ngModel)]="form.title" name="title" maxlength="100" required placeholder="¡La segunda caja a mitad de precio!"></label>
                <label class="full">Descripción<textarea [(ngModel)]="form.description" name="description" maxlength="300" rows="2" placeholder="Explica brevemente la promoción para tus clientes"></textarea></label>
              </div>
            </section>

            <section class="editor-section">
              <h3>Condiciones y beneficio</h3>
              <div class="form-grid">
                <label class="full">Mecánica<select [(ngModel)]="form.type" name="type">
                  <option value="buy_x_get_y_discount">Compra X y obtén Y con descuento</option>
                  <option value="percentage">Descuento porcentual</option>
                  <option value="fixed_amount">Descuento de valor fijo</option>
                  <option value="minimum_subtotal">Descuento por compra mínima</option>
                </select></label>
                <label>Productos participantes<select multiple size="5" [(ngModel)]="form.productIds" name="productIds">
                  @for (recipe of eligibleProducts(); track recipe.id) { <option [value]="recipe.id">{{ recipe.name }}</option> }
                </select><small>Selecciona uno o varios. Sin selección, participan todos los productos.</small></label>
                @if (form.productIds.length > 1) { <label class="inline-check"><input type="checkbox" [(ngModel)]="form.requireAllProducts" name="requireAllProducts"> La caja debe incluir todos los productos seleccionados</label> }
                <label>Presentación<select [(ngModel)]="form.presentationId" name="presentationId">
                  <option value="">Todas las presentaciones</option><option value="clasicas">Solo clásicas · 10</option><option value="ny">Solo NY · 6</option><option value="mixta">Mixta · 8</option>
                </select></label>
                @if (form.type === 'buy_x_get_y_discount') {
                  <label>Cajas que debe comprar<input type="number" min="1" max="10" step="1" [(ngModel)]="form.buyQuantity" name="buyQuantity"></label>
                  <label>Cajas con descuento<input type="number" min="1" max="10" step="1" [(ngModel)]="form.rewardQuantity" name="rewardQuantity"></label>
                  <label>Máximo de aplicaciones por pedido<input type="number" min="0" max="10" step="1" [(ngModel)]="form.maxApplications" name="maxApplications"><small>0 significa sin límite.</small></label>
                }
                @if (form.type === 'minimum_subtotal') {
                  <label>Compra mínima ($)<input type="number" min="0.01" step="0.01" [(ngModel)]="form.minimumSubtotal" name="minimumSubtotal"></label>
                }
                @if (form.type === 'buy_x_get_y_discount' || form.type === 'minimum_subtotal') { <label>Tipo de beneficio<select [(ngModel)]="form.discountType" name="discountType"><option value="percentage">Porcentaje</option><option value="fixed">Valor fijo ($)</option></select></label> }
                <label>{{ form.type === 'fixed_amount' || (form.type !== 'percentage' && form.discountType === 'fixed') ? 'Descuento ($)' : 'Descuento (%)' }}<input type="number" min="0.01" [max]="form.discountType === 'percentage' ? 100 : 9999" step="0.01" [(ngModel)]="form.discountValue" name="discountValue"></label>
              </div>
            </section>

            <section class="editor-section">
              <h3>Banner y publicación</h3>
              @if (form.bannerImage) { <img class="banner-preview" [src]="form.bannerImage" alt="Vista previa del banner promocional"> }
              <label class="file-picker">Subir banner (JPG, PNG o WebP · máximo 3 MB)<input type="file" accept="image/jpeg,image/png,image/webp" (change)="onBannerSelected($event)"></label>
              <label class="inline-check"><input type="checkbox" [(ngModel)]="form.showInCatalog" name="showInCatalog"> Mostrar banner en el catálogo público</label>
              <div class="form-grid">
                <label>Estado<select [(ngModel)]="form.status" name="status"><option value="DRAFT">Borrador</option><option value="ACTIVE">Activa</option><option value="PAUSED">Pausada</option></select></label>
                <label>Fecha de inicio<input type="date" [(ngModel)]="form.startsAt" name="startsAt"></label>
                <label>Fecha de finalización<input type="date" [(ngModel)]="form.endsAt" name="endsAt"></label>
              </div>
            </section>

            <section class="editor-section">
              <h3>Límites de uso</h3>
              <div class="form-grid">
                <label>Usos totales máximos<input type="number" min="0" step="1" [(ngModel)]="form.maxUses" name="maxUses"><small>0 significa ilimitado.</small></label>
                <label>Usos máximos por cliente<input type="number" min="0" step="1" [(ngModel)]="form.maxUsesPerCustomer" name="maxUsesPerCustomer"><small>0 significa ilimitado.</small></label>
              </div>
            </section>
            <footer class="editor-actions">
              <span class="editor-message">{{ uploading() ? 'Subiendo banner…' : saving() ? 'Guardando…' : '' }}</span>
              <button matButton="outlined" type="button" (click)="closeEditor()">Cancelar</button>
              <button matButton="elevated" type="submit" [disabled]="saving() || uploading()">{{ saving() ? 'Guardando…' : 'Guardar promoción' }}</button>
            </footer>
          </form>
        </div>
      }
    </main>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#30263a}.promotions-page{display:grid;gap:20px;min-width:0}.page-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.page-heading h1{margin:0;font-size:clamp(28px,3vw,38px);font-weight:550;letter-spacing:-1.2px}.page-heading p:not(.eyebrow){margin:9px 0 0;color:#95899d;font-size:13px;line-height:1.5}.eyebrow{margin:0 0 10px;color:#8056ad;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}.heading-actions,.card-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.heading-actions button{min-height:42px;font-size:12px}.promotion-list{display:grid;gap:12px}.promotion-card{display:grid;grid-template-columns:150px minmax(0,1fr) auto;align-items:center;gap:16px;padding:14px;border:1px solid #eee7f2;border-radius:14px;background:#fff}.promotion-thumb{width:150px;height:92px;object-fit:cover;border-radius:9px;background:#f6f1f7}.empty-thumb{display:grid;place-items:center;color:#a18bb5}.promotion-copy{min-width:0}.promotion-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.promotion-title-row h2{margin:0;color:#44354e;font-size:15px;font-weight:650}.promotion-copy>p{margin:6px 0;color:#95899d;font-size:12px}.status{padding:4px 8px;border-radius:999px;background:#f3edf7;color:#79648a;font-size:10px;font-weight:700}.status.active{background:#edf6ef;color:#39744b}.promotion-meta{display:flex;gap:12px;flex-wrap:wrap;color:#95899d;font-size:10px}.promotion-meta strong{color:#5b4d65}.delete-action{color:#a44855}.empty-state{display:grid;justify-items:center;gap:8px;padding:42px 20px;border:1px dashed #e5d9ed;border-radius:14px;background:#fff;text-align:center}.empty-state mat-icon{color:#a18bb5;font-size:28px;width:28px;height:28px}.empty-state h2{margin:0;color:#44354e;font-size:17px}.empty-state p{margin:0;color:#95899d;font-size:12px}.notice,.error{margin:0;padding:11px 13px;border-radius:9px;font-size:12px}.notice{background:#eff8f0;color:#39744b}.error{background:#fff0f0;color:#a44855}.editor-backdrop{position:fixed;z-index:300;inset:0;display:grid;place-items:center;padding:18px;background:rgb(36 26 42 / 42%);overflow:auto}.promotion-editor{display:grid;gap:15px;width:min(100%,850px);max-height:calc(100dvh - 36px);overflow:auto;padding:24px;border:1px solid #eee7f2;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgb(35 20 45 / 20%)}.editor-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.editor-heading h2{margin:0;font-size:23px;font-weight:600}.editor-section{display:grid;gap:13px;padding:17px;border:1px solid #eee7f2;border-radius:12px}.editor-section h3{margin:0;color:#5b4d65;font-size:14px;font-weight:700}.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.form-grid label,.file-picker{display:grid;gap:7px;color:#8d7897;font-size:11px;font-weight:600}.form-grid label.full{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{box-sizing:border-box;width:100%;min-height:40px;padding:10px 11px;border:1px solid #e5d9ed;border-radius:8px;background:#fff;color:#5b4d65;font:inherit;font-size:12px}.form-grid textarea{resize:vertical}.form-grid small{color:#a093ad;font-size:10px;font-weight:400}.file-picker input{max-width:100%;font:inherit;font-size:11px}.banner-preview{width:min(100%,520px);max-height:190px;object-fit:cover;border-radius:10px;background:#f6f1f7}.inline-check{display:flex;align-items:center;gap:9px;color:#5b4d65;font-size:12px}.inline-check input{width:17px;height:17px;accent-color:#8056ad}.editor-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px}.editor-message{margin-right:auto;color:#8056ad;font-size:11px}.editor-actions button{min-height:42px;font-size:12px}@media(max-width:760px){.page-heading{flex-direction:column}.heading-actions{width:100%}.heading-actions button{flex:1}.promotion-card{grid-template-columns:92px minmax(0,1fr);gap:12px}.promotion-thumb{width:92px;height:82px}.card-actions{grid-column:1/-1;justify-content:flex-end}.promotion-meta{gap:7px}.promotion-editor{padding:16px}.form-grid{grid-template-columns:1fr}.form-grid label.full{grid-column:auto}.editor-actions{flex-wrap:wrap}.editor-message{width:100%}}
  `]
})
export class Promociones {
  readonly data = inject(DataService);
  private readonly promotionsService = inject(PromotionsService);
  private readonly imageUpload = inject(ImageCdnUploadService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly uploading = signal(false);
  readonly editing = signal(false);
  readonly notice = signal('');
  readonly error = signal('');
  readonly eligibleProducts = computed(() => this.data.recipes().filter(recipe => !recipe.archived && recipe.catalogVisible !== false));
  readonly promotions = computed<PromotionRecord[]>(() => {
    const raw = this.data.rawState()?.['promotions'];
    return (Array.isArray(raw) ? raw : [])
      .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value))
      .map((value): PromotionRecord => ({ ...value, id: asText(value['id']), name: asText(value['name']), title: asText(value['title']), description: asText(value['description']), code: asText(value['code']), status: (asText(value['status']).toUpperCase() || 'DRAFT') as PromotionStatus, startsAt: asText(value['startsAt']), endsAt: asText(value['endsAt']), bannerImage: asText(value['bannerImage']), showInCatalog: value['showInCatalog'] !== false, usageCount: asNumber(value['usageCount']), createdAt: asText(value['createdAt']), mechanic: asRecord(value['mechanic']) }))
      .sort((a,b) => asText(b.createdAt).localeCompare(asText(a.createdAt)));
  });
  form: PromotionForm = this.emptyForm();

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try {
      await this.data.loadCollections(['promotions', 'recipes'], true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudieron cargar las promociones.');
    } finally { this.loading.set(false); }
  }

  private emptyForm(): PromotionForm {
    return {
      id: '', name: '', title: '', description: '', code: '', status: 'DRAFT', type: 'percentage',
      productIds: [], requireAllProducts: false, presentationId: '', buyQuantity: 1, rewardQuantity: 1, discountType: 'percentage',
      discountValue: 10, minimumSubtotal: 0, maxApplications: 1, startsAt: '', endsAt: '',
      bannerImage: '', showInCatalog: true, maxUses: 0, maxUsesPerCustomer: 0,
    };
  }

  createPromotion(useBrownieTemplate: boolean): void {
    const form = this.emptyForm();
    form.id = crypto.randomUUID();
    if (useBrownieTemplate) {
      const brownie = this.eligibleProducts().find(recipe => normalize(recipe.name).includes('brownie classic'));
      form.name = 'Brownie Classic · Segunda caja 50%';
      form.title = '¡La segunda caja a mitad de precio!';
      form.description = 'Lleva una caja de Brownie Classic y disfruta la segunda con 50 % de descuento.';
      form.code = 'BROWNIE50';
      form.type = 'buy_x_get_y_discount';
      form.productIds = brownie ? [brownie.id] : [];
      form.presentationId = 'clasicas';
      form.buyQuantity = 1;
      form.rewardQuantity = 1;
      form.discountType = 'percentage';
      form.discountValue = 50;
      form.maxApplications = 1;
    }
    this.form = form;
    this.error.set('');
    this.notice.set('');
    this.editing.set(true);
  }

  editPromotion(promotion: PromotionRecord): void {
    const mechanic = asRecord(promotion['mechanic']);
    const productIds = Array.isArray(mechanic['productIds']) ? mechanic['productIds'] : [];
    this.form = {
      id: promotion.id,
      name: promotion.name,
      title: promotion.title,
      description: promotion.description,
      code: promotion.code,
      status: promotion.status,
      type: (asText(mechanic['type']) || 'percentage') as PromotionType,
      productIds: productIds.filter((value): value is string => typeof value === 'string'),
      requireAllProducts: mechanic['requireAllProducts'] === true,
      presentationId: asText(mechanic['presentationId']),
      buyQuantity: asNumber(mechanic['buyQuantity'], 1),
      rewardQuantity: asNumber(mechanic['rewardQuantity'], 1),
      discountType: asText(mechanic['discountType']) === 'fixed' ? 'fixed' : 'percentage',
      discountValue: asNumber(mechanic['discountValue'], 10),
      minimumSubtotal: asNumber(mechanic['minimumSubtotal']),
      maxApplications: asNumber(mechanic['maxApplications'], 1),
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      bannerImage: promotion.bannerImage,
      showInCatalog: promotion.showInCatalog,
      maxUses: asNumber(promotion['maxUses']),
      maxUsesPerCustomer: asNumber(promotion['maxUsesPerCustomer']),
    };
    this.error.set('');
    this.notice.set('');
    this.editing.set(true);
  }

  closeEditor(): void { this.editing.set(false); this.error.set(''); }

  async onBannerSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.error.set('');
    try {
      if (!this.form.id) this.form.id = crypto.randomUUID();
      this.form.bannerImage = await this.imageUpload.upload(file, 'promotion', this.form.id);
      this.notice.set('Banner publicado correctamente.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo publicar el banner.');
    } finally {
      this.uploading.set(false);
      (event.target as HTMLInputElement).value = '';
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    this.notice.set('');
    const code = this.form.code.trim().toLocaleUpperCase('es').replace(/\s+/g, '');
    const discountType = this.form.type === 'fixed_amount' ? 'fixed' : this.form.type === 'percentage' ? 'percentage' : this.form.discountType;
    if (!this.form.name.trim() || !this.form.title.trim() || !/^[A-Z0-9_-]{3,40}$/.test(code)) {
      this.error.set('Completa el nombre, título público y un código de 3 a 40 caracteres (letras, números, guion o guion bajo).');
      return;
    }
    if (this.promotions().some(item => item.id !== this.form.id && item.code.toLocaleUpperCase('es') === code)) {
      this.error.set('Ya existe otra promoción con ese código.');
      return;
    }
    if (this.form.status === 'ACTIVE') {
      if (!this.form.startsAt || !this.form.endsAt || this.form.endsAt < this.form.startsAt) {
        this.error.set('Define un período de vigencia válido antes de activar la promoción.');
        return;
      }
      if (this.form.showInCatalog && !this.form.bannerImage) {
        this.error.set('Sube el banner antes de publicar la promoción en el catálogo.');
        return;
      }
    }
    if (this.form.type === 'buy_x_get_y_discount' && (!this.form.productIds.length || !this.form.presentationId)) {
      this.error.set('La promoción de segunda caja necesita un producto y una presentación específicos.');
      return;
    }
    if (this.form.type === 'minimum_subtotal' && this.form.minimumSubtotal <= 0) {
      this.error.set('Define un importe mínimo mayor que cero.');
      return;
    }
    if (this.form.discountValue <= 0 || (discountType === 'percentage' && this.form.discountValue > 100)) {
      this.error.set('El descuento debe ser mayor que cero y no puede superar el 100 %.');
      return;
    }
    this.saving.set(true);
    try {
      const existing = this.promotions().find(item => item.id === this.form.id);
      const mechanic: Record<string, unknown> = {
        type: this.form.type,
        productIds: [...this.form.productIds],
        requireAllProducts: this.form.requireAllProducts,
        ...(this.form.presentationId ? { presentationId: this.form.presentationId } : {}),
        buyQuantity: Math.max(1, Math.floor(this.form.buyQuantity)),
        rewardQuantity: Math.max(1, Math.floor(this.form.rewardQuantity)),
        discountType,
        discountValue: Number(this.form.discountValue),
        minimumSubtotal: Math.max(0, Number(this.form.minimumSubtotal) || 0),
        maxApplications: Math.max(0, Math.floor(Number(this.form.maxApplications) || 0)),
      };
      const record: Record<string, unknown> = {
        id: this.form.id || crypto.randomUUID(),
        name: this.form.name.trim(),
        title: this.form.title.trim(),
        description: this.form.description.trim(),
        code,
        status: this.form.status,
        startsAt: this.form.startsAt,
        endsAt: this.form.endsAt,
        bannerImage: this.form.bannerImage,
        showInCatalog: this.form.showInCatalog,
        maxUses: Math.max(0, Math.floor(Number(this.form.maxUses) || 0)),
        maxUsesPerCustomer: Math.max(0, Math.floor(Number(this.form.maxUsesPerCustomer) || 0)),
        usageCount: asNumber(existing?.['usageCount']),
        mechanic,
        createdAt: asText(existing?.['createdAt']) || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.promotionsService.savePromotion(record);
      this.form.id = String(record['id']);
      this.editing.set(false);
      this.notice.set('Promoción guardada correctamente.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo guardar la promoción.');
    } finally { this.saving.set(false); }
  }

  async confirmDeletePromotion(promotion: PromotionRecord): Promise<void> {
    if (!window.confirm('¿Eliminar la promoción "' + promotion.name + '"? Los pedidos ya registrados conservarán su descuento.')) return;
    this.error.set('');
    this.notice.set('');
    try {
      await this.promotionsService.deletePromotion(promotion.id);
      this.notice.set('Promoción eliminada. Los pedidos históricos mantienen su información.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo eliminar la promoción.');
    }
  }

  statusLabel(promotion: PromotionRecord): string {
    if (promotion.status === 'PAUSED') return 'Pausada';
    if (promotion.status !== 'ACTIVE') return 'Borrador';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (promotion.startsAt > today) return 'Programada';
    if (promotion.endsAt < today) return 'Vencida';
    const maxUses = asNumber(promotion['maxUses']);
    if (maxUses > 0 && asNumber(promotion.usageCount) >= maxUses) return 'Agotada';
    return 'Activa';
  }

  mechanicSummary(promotion: PromotionRecord): string {
    const mechanic = promotion.mechanic;
    const value = asNumber(mechanic['discountValue']);
    const benefit = mechanic['discountType'] === 'fixed' ? '$' + value.toFixed(2) : value + '%';
    if (mechanic['type'] === 'buy_x_get_y_discount') return 'Compra ' + asNumber(mechanic['buyQuantity'], 1) + ' caja(s) y obtén ' + asNumber(mechanic['rewardQuantity'], 1) + ' caja(s) con ' + benefit + ' de descuento';
    if (mechanic['type'] === 'minimum_subtotal') return 'Desde $' + asNumber(mechanic['minimumSubtotal']).toFixed(2) + ' · ' + benefit;
    return mechanic['type'] === 'fixed_amount' ? 'Descuento fijo de ' + benefit : benefit + ' de descuento';
  }

  asNumber(value: unknown): number { return asNumber(value); }
}
