import type { PromotionMechanic } from './catalog.models.js';

export interface PromotionCartBox {
  presentationId: string;
  price: number;
  items: Record<string, number>;
}
export interface PromotionCalculation {
  discountAmount: number;
  eligibleBoxIndexes: number[];
  discountedBoxIndexes: number[];
}
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function todayInEcuador(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function isPromotionActive(value: Record<string, unknown>, now = new Date()): boolean {
  if (String(value['status'] ?? '').toUpperCase() !== 'ACTIVE') return false;
  const startsAt = typeof value['startsAt'] === 'string' ? value['startsAt'].trim() : '';
  const endsAt = typeof value['endsAt'] === 'string' ? value['endsAt'].trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsAt) || !/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) return false;
  const today = todayInEcuador(now);
  if (startsAt > today || endsAt < today) return false;
  const maxUses = Math.max(0, Math.floor(numberValue(value['maxUses'])));
  const usageCount = Math.max(0, Math.floor(numberValue(value['usageCount'])));
  return maxUses === 0 || usageCount < maxUses;
}

function isEligibleBox(box: PromotionCartBox, mechanic: PromotionMechanic): boolean {
  if (mechanic.presentationId && mechanic.presentationId !== box.presentationId) return false;
  const entries = Object.entries(box.items).filter(([, quantity]) => Number(quantity) > 0);
  if (!entries.length) return false;
  const allowedProducts = Array.isArray(mechanic.productIds) ? mechanic.productIds.filter(Boolean) : [];
  if (allowedProducts.length && !entries.every(([productId]) => allowedProducts.includes(productId))) return false;
  if (mechanic.requireAllProducts && allowedProducts.some(productId => !entries.some(([entryId, quantity]) => entryId === productId && Number(quantity) > 0))) return false;
  return true;
}
function discountForAmount(amount: number, mechanic: PromotionMechanic): number {
  const value = Math.max(0, numberValue(mechanic.discountValue));
  if (mechanic.discountType === 'fixed') return Math.min(amount, value);
  return Math.min(amount, amount * Math.min(100, value) / 100);
}

/** Pure promotion calculation shared by the public cart and the order API. */
export function calculatePromotionDiscount(
  promotion: Record<string, unknown> | { mechanic?: PromotionMechanic },
  boxes: PromotionCartBox[],
): PromotionCalculation {
  const mechanic = (promotion as { mechanic?: PromotionMechanic }).mechanic;
  if (!mechanic || !Array.isArray(boxes) || !boxes.length) {
    return { discountAmount: 0, eligibleBoxIndexes: [], discountedBoxIndexes: [] };
  }
  const eligibleBoxIndexes = boxes.flatMap((box, index) => isEligibleBox(box, mechanic) ? [index] : []);
  if (!eligibleBoxIndexes.length) return { discountAmount: 0, eligibleBoxIndexes, discountedBoxIndexes: [] };

  let discountAmount = 0;
  let discountedBoxIndexes: number[] = [];
  if (mechanic.type === 'buy_x_get_y_discount') {
    const buyQuantity = Math.max(1, Math.floor(numberValue(mechanic.buyQuantity, 1)));
    const rewardQuantity = Math.max(1, Math.floor(numberValue(mechanic.rewardQuantity, 1)));
    const groupSize = buyQuantity + rewardQuantity;
    const availableApplications = Math.floor(eligibleBoxIndexes.length / groupSize);
    const configuredLimit = Math.max(0, Math.floor(numberValue(mechanic.maxApplications)));
    const applications = configuredLimit > 0 ? Math.min(availableApplications, configuredLimit) : availableApplications;
    for (let application = 0; application < applications; application++) {
      const firstReward = application * groupSize + buyQuantity;
      for (let offset = 0; offset < rewardQuantity; offset++) {
        const boxIndex = eligibleBoxIndexes[firstReward + offset];
        if (boxIndex === undefined) continue;
        discountedBoxIndexes.push(boxIndex);
        discountAmount += discountForAmount(Math.max(0, numberValue(boxes[boxIndex].price)), mechanic);
      }
    }
  } else {
    const eligibleSubtotal = eligibleBoxIndexes.reduce((sum, index) => sum + Math.max(0, numberValue(boxes[index].price)), 0);
    if (mechanic.type === 'minimum_subtotal' && eligibleSubtotal < Math.max(0, numberValue(mechanic.minimumSubtotal))) {
      return { discountAmount: 0, eligibleBoxIndexes, discountedBoxIndexes: [] };
    }
    discountAmount = mechanic.type === 'fixed_amount' || mechanic.discountType === 'fixed'
      ? Math.min(eligibleSubtotal, Math.max(0, numberValue(mechanic.discountValue)))
      : eligibleSubtotal * Math.min(100, Math.max(0, numberValue(mechanic.discountValue))) / 100;
    discountedBoxIndexes = eligibleBoxIndexes;
  }
  return {
    discountAmount: roundMoney(Math.min(discountAmount, boxes.reduce((sum, box) => sum + Math.max(0, numberValue(box.price)), 0))),
    eligibleBoxIndexes,
    discountedBoxIndexes,
  };
}
