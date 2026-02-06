import { Product, ProductStatus } from '../types';

export function getReviewQty(p: Product): number {
  return Math.max(0, p.quantity - p.availableQty - p.soldQty - p.donatedQty - p.lostQty - p.expiredQty);
}

export function deriveStatus(p: Product): ProductStatus {
  if (getReviewQty(p) > 0) return 'review';
  if (p.availableQty > 0) return 'available';
  if (p.soldQty > 0) return 'sold';
  if (p.donatedQty > 0) return 'donated';
  if (p.lostQty > 0) return 'lost';
  if (p.expiredQty > 0) return 'expired';
  return 'available';
}
