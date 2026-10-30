import { describe, expect, it } from 'vitest';
import { calculatePromotionDiscount, isPromotionActive } from './promotion-engine';

const brownieBox = {
  presentationId: 'clasicas',
  price: 6,
  items: { 'brownie-classic': 10 },
};
const browniePromotion = {
  mechanic: {
    type: 'buy_x_get_y_discount' as const,
    productIds: ['brownie-classic'],
    presentationId: 'clasicas',
    buyQuantity: 1,
    rewardQuantity: 1,
    discountType: 'percentage' as const,
    discountValue: 50,
    maxApplications: 1,
  },
};

describe('promotion engine', () => {
  it('discounts the second qualifying Brownie Classic box by 50 percent', () => {
    const result = calculatePromotionDiscount(browniePromotion, [brownieBox, brownieBox]);
    expect(result.discountAmount).toBe(3);
    expect(result.discountedBoxIndexes).toEqual([1]);
  });

  it('does not discount a single box or a different product', () => {
    expect(calculatePromotionDiscount(browniePromotion, [brownieBox]).discountAmount).toBe(0);
    expect(calculatePromotionDiscount(browniePromotion, [
      brownieBox,
      { ...brownieBox, items: { 'red-velvet': 10 } },
    ]).discountAmount).toBe(0);
  });

  it('can require every selected product in a qualifying bundle box', () => {
    const bundlePromotion = {
      mechanic: {
        type: 'percentage' as const,
        productIds: ['brownie-classic', 'vanilla'],
        requireAllProducts: true,
        discountType: 'percentage' as const,
        discountValue: 10,
      },
    };
    expect(calculatePromotionDiscount(bundlePromotion, [
      { ...brownieBox, items: { 'brownie-classic': 10 } },
    ]).discountAmount).toBe(0);
    expect(calculatePromotionDiscount(bundlePromotion, [
      { ...brownieBox, items: { 'brownie-classic': 5, vanilla: 5 } },
    ]).discountAmount).toBe(0.6);
  });

  it('supports minimum-subtotal percentage promotions', () => {
    const promotion = { mechanic: { type: 'minimum_subtotal' as const, discountType: 'percentage' as const, discountValue: 10, minimumSubtotal: 15 } };
    expect(calculatePromotionDiscount(promotion, [brownieBox, brownieBox]).discountAmount).toBe(0);
    expect(calculatePromotionDiscount(promotion, [brownieBox, brownieBox, brownieBox]).discountAmount).toBe(1.8);
  });

  it('only considers active promotions within their date and usage limits', () => {
    const now = new Date('2026-10-30T12:00:00-05:00');
    const base = { status: 'ACTIVE', startsAt: '2026-10-01', endsAt: '2026-10-31', maxUses: 2, usageCount: 1 };
    expect(isPromotionActive(base, now)).toBe(true);
    expect(isPromotionActive({ ...base, usageCount: 2 }, now)).toBe(false);
    expect(isPromotionActive({ ...base, startsAt: '2026-11-01' }, now)).toBe(false);
  });
});
