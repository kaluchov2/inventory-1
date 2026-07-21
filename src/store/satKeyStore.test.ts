import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: null,
  getSupabaseClient: () => {
    throw new Error('Supabase is not configured');
  },
}));

vi.mock('../lib/syncManager', () => ({
  syncManager: {
    queueOperation: vi.fn(),
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

describe('satKeyStore', () => {
  let useSatKeyStore: typeof import('./satKeyStore').useSatKeyStore;

  beforeAll(async () => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    useSatKeyStore = (await import('./satKeyStore')).useSatKeyStore;
  });

  beforeEach(() => {
    useSatKeyStore.setState({
      satKeys: [],
      satCategorySuggestions: [],
      filters: { search: '' },
      isLoading: false,
      lastSync: null,
    });
  });

  it('adds, edits and lists SAT keys', () => {
    const first = useSatKeyStore
      .getState()
      .addSatKey({ code: ' 02002 ', description: ' Ropa ' });

    expect(first).toMatchObject({ code: '02002', description: 'Ropa' });

    const updated = useSatKeyStore
      .getState()
      .updateSatKey(first.id, { description: 'Ropa y textiles' });

    expect(updated).toMatchObject({
      id: first.id,
      code: '02002',
      description: 'Ropa y textiles',
    });

    useSatKeyStore.getState().addSatKey({ code: '03003', description: 'Calzado' });
    useSatKeyStore.getState().setFilters({ search: 'ropa' });

    expect(useSatKeyStore.getState().getFilteredSatKeys()).toHaveLength(1);
    expect(useSatKeyStore.getState().getFilteredSatKeys()[0].code).toBe('02002');
  });

  it('rejects duplicate SAT codes', () => {
    useSatKeyStore.getState().addSatKey({ code: '02002', description: 'Ropa' });

    expect(() =>
      useSatKeyStore
        .getState()
        .addSatKey({ code: '02002', description: 'Duplicada' }),
    ).toThrow('sat_key_code_duplicate');
  });
});
