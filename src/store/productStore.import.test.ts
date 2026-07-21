import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Product } from '../types';

vi.mock('../lib/supabase', () => ({
  supabase: null,
  getSupabaseClient: () => {
    throw new Error('Supabase is not configured');
  },
}));

vi.mock('../lib/syncManager', () => ({
  syncManager: {
    queueOperation: vi.fn(),
    addToDeadLetter: vi.fn(),
  },
}));

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-1',
    name: 'Camisa',
    sku: 'DAM-20-001',
    upsRaw: '20',
    identifierType: 'legacy',
    dropNumber: '20',
    productNumber: 1,
    dropSequence: 1,
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

describe('productStore import SAT preservation', () => {
  let useProductStore: typeof import('./productStore').useProductStore;

  beforeAll(async () => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    useProductStore = (await import('./productStore')).useProductStore;
  });

  beforeEach(() => {
    useProductStore.setState({
      products: [],
      filters: {
        search: '',
        category: '',
        upsBatch: '',
        dropNumber: '',
        status: '',
        soldBy: '',
      },
      isLoading: false,
      lastSync: null,
    });
  });

  it('preserves satKeyId when sync import updates an existing product', async () => {
    useProductStore.setState({
      products: [product({ satKeyId: 'sat-ropa' })],
    });

    await useProductStore.getState().importProducts(
      [product({ id: 'excel-row-1', quantity: 2, satKeyId: undefined })],
      'sync',
    );

    expect(useProductStore.getState().products[0]).toMatchObject({
      id: 'product-1',
      quantity: 2,
      satKeyId: 'sat-ropa',
    });
  });

  it('preserves satKeyId when replace import matches an existing product', async () => {
    useProductStore.setState({
      products: [product({ satKeyId: 'sat-ropa' })],
    });

    await useProductStore.getState().importProducts(
      [product({ id: 'excel-row-1', quantity: 3, satKeyId: undefined })],
      'replace',
    );

    expect(useProductStore.getState().products[0]).toMatchObject({
      quantity: 3,
      satKeyId: 'sat-ropa',
    });
  });
});
