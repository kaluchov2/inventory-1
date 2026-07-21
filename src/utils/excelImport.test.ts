import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { getProductMatchKey } from './excelImport';

function product(overrides: Partial<Product>): Product {
  return {
    id: 'product-1',
    name: 'Camisa Azul',
    sku: 'DAM-20-ABC',
    upsRaw: '20',
    identifierType: 'legacy',
    dropNumber: '20',
    upsBatch: 20,
    quantity: 1,
    unitPrice: 100,
    category: 'DAM',
    brand: 'Marca',
    color: 'Azul',
    size: 'M',
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

describe('getProductMatchKey', () => {
  it('keeps legacy matching independent from SAT key assignment', () => {
    const base = product({});
    const withSat = product({ satKeyId: 'sat-ropa' });

    expect(getProductMatchKey(withSat)).toBe(getProductMatchKey(base));
  });

  it('uses product number for numbered UPS values', () => {
    expect(
      getProductMatchKey(
        product({
          identifierType: 'numbered',
          dropNumber: '21',
          productNumber: 8,
        }),
      ),
    ).toBe('21|8|camisa azul|dam');
  });
});
