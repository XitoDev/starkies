import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';
import { ImageCdnUploadService } from './image-cdn-upload.service';

@Injectable({ providedIn: 'root' })
export class PromotionsService {
  private readonly data = inject(DataService);
  private readonly imageUpload = inject(ImageCdnUploadService);

  async savePromotion(promotion: Record<string, unknown>): Promise<void> {
    const promotionId = typeof promotion['id'] === 'string' ? promotion['id'].trim() : '';
    if (!promotionId) throw new Error('La promoción no tiene un identificador válido.');
    const currentPromotions = Array.isArray(this.data.rawState()?.['promotions'])
      ? this.data.rawState()!['promotions'] as Record<string, unknown>[] : [];
    const existing = currentPromotions.find(item => String(item['id'] ?? '') === promotionId);
    const previousImage = typeof existing?.['bannerImage'] === 'string' ? existing['bannerImage'].trim() : '';
    const nextImage = typeof promotion['bannerImage'] === 'string' ? promotion['bannerImage'].trim() : '';
    await this.data.upsertCollectionRecord('promotions', promotionId, promotion);
    await this.syncImageReference(promotionId, previousImage, nextImage);
  }

  async deletePromotion(promotionId: string): Promise<void> {
    const normalizedId = promotionId.trim();
    if (!normalizedId) throw new Error('La promoción no tiene un identificador válido.');
    const currentPromotions = Array.isArray(this.data.rawState()?.['promotions'])
      ? this.data.rawState()!['promotions'] as Record<string, unknown>[] : [];
    const existing = currentPromotions.find(item => String(item['id'] ?? '') === normalizedId);
    const previousImage = typeof existing?.['bannerImage'] === 'string' ? existing['bannerImage'].trim() : '';
    await this.data.deleteCollectionRecord('promotions', normalizedId);
    await this.syncImageReference(normalizedId, previousImage, '');
  }

  private async syncImageReference(recordId: string, previousImage: string, nextImage: string): Promise<void> {
    if (!this.imageUpload.isManagedUrl(previousImage) && !this.imageUpload.isManagedUrl(nextImage)) return;
    try {
      await this.imageUpload.syncReference('promotion', recordId, previousImage, nextImage);
    } catch (error) {
      console.error('Promotion image reference synchronization deferred for ' + recordId, error);
      this.data.error.set('La promoción se guardó, pero quedó pendiente sincronizar las referencias de su banner. No se eliminó ningún archivo.');
    }
  }
}
