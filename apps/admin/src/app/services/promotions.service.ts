import { Injectable, inject } from '@angular/core';
import { DataService } from './data.service';

@Injectable({ providedIn: 'root' })
export class PromotionsService {
  private readonly data = inject(DataService);

  async savePromotion(promotion: Record<string, unknown>): Promise<void> {
    const promotionId = typeof promotion['id'] === 'string' ? promotion['id'].trim() : '';
    if (!promotionId) throw new Error('La promoción no tiene un identificador válido.');
    await this.data.upsertCollectionRecord('promotions', promotionId, promotion);
  }

  async deletePromotion(promotionId: string): Promise<void> {
    const normalizedId = promotionId.trim();
    if (!normalizedId) throw new Error('La promoción no tiene un identificador válido.');
    await this.data.deleteCollectionRecord('promotions', normalizedId);
  }
}
