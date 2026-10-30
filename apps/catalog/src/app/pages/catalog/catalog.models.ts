export interface Product {
  id: string; name: string; category: string; description: string; tag?: string;
  price: number; isNy: boolean; stock: boolean; image?: string;
}
export interface BoxPresentation { id: string; name: string; desc: string; price: number; reqClasicas: number; reqNY: number; }
export interface PackedBox { presentation: BoxPresentation; items: { [productId: string]: number }; }
export interface DeliveryZone { id: string; name: string; fee: number; }

export type PromotionMechanicType = 'buy_x_get_y_discount' | 'percentage' | 'fixed_amount' | 'minimum_subtotal';
export type PromotionDiscountType = 'percentage' | 'fixed';
export interface PromotionMechanic {
  type: PromotionMechanicType;
  productIds?: string[];
  presentationId?: string;
  buyQuantity?: number;
  rewardQuantity?: number;
  discountType?: PromotionDiscountType;
  discountValue: number;
  minimumSubtotal?: number;
  maxApplications?: number;
}
export interface PublicPromotion {
  id: string;
  title: string;
  description: string;
  code: string;
  bannerImage?: string;
  showInCatalog: boolean;
  mechanic: PromotionMechanic;
}
