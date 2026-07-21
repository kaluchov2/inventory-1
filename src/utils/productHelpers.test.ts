import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { deriveStatus, getReviewQty } from './productHelpers';

function productWithQty(overrides: Partial<Product>): Product {
  return {
    id: 'product-1',
    name: 'Camisa',
    sku: 'DAM-1-ABC',
    upsRaw: '1',
    identifierType: 'legacy',
    dropNumber: '1',
    upsBatch: 1,
    quantity: 1,
    unitPrice: 100,
    category: 'DAM',
    availableQty: 1,
    soldQty: 0,
    donatedQty: 0,
    lostQty: 0,
    expiredQty: 0,
    status: 'available',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('productHelpers', () => {
  it('detects review quantity before other statuses', () => {
    const product = productWithQty({
      quantity: 5,
      availableQty: 2,
      soldQty: 1,
    });

    expect(getReviewQty(product)).toBe(2);
    expect(deriveStatus(product)).toBe('review');
  });

  it('derives status from quantity columns', () => {
    expect(deriveStatus(productWithQty({ availableQty: 2 }))).toBe('available');
    expect(deriveStatus(productWithQty({ availableQty: 0, soldQty: 1 }))).toBe('sold');
    expect(deriveStatus(productWithQty({ availableQty: 0, donatedQty: 1 }))).toBe('donated');
    expect(deriveStatus(productWithQty({ availableQty: 0, lostQty: 1 }))).toBe('lost');
    expect(deriveStatus(productWithQty({ availableQty: 0, expiredQty: 1 }))).toBe('expired');
  });
});
