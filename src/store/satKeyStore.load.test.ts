import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  getSuggestions: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {},
}));

vi.mock('../lib/syncManager', () => ({
  syncManager: {
    queueOperation: vi.fn(),
  },
}));

vi.mock('../services/satKeyService', () => ({
  satKeyService: {
    getAll: mocks.getAll,
    getSuggestions: mocks.getSuggestions,
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

describe('satKeyStore loadFromSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorageStub());
    mocks.getAll.mockResolvedValue([
      {
        id: 'sat-53103000',
        code: '53103000',
        description: 'Camisetas',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mocks.getSuggestions.mockResolvedValue([
      {
        id: 'suggestion-dam',
        categoryCode: 'DAM',
        satKeyId: 'sat-53103000',
        priority: 1,
        isDefault: false,
        sourceGroup: 'Ropa',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('loads SAT keys and category suggestions together', async () => {
    const { useSatKeyStore } = await import('./satKeyStore');

    useSatKeyStore.setState({
      satKeys: [],
      satCategorySuggestions: [],
      filters: { search: '' },
      isLoading: false,
      lastSync: null,
    });

    await useSatKeyStore.getState().loadFromSupabase();

    expect(useSatKeyStore.getState().satKeys).toHaveLength(1);
    expect(useSatKeyStore.getState().satCategorySuggestions).toHaveLength(1);
    expect(useSatKeyStore.getState().getSuggestionsByCategory('DAM')).toEqual([
      expect.objectContaining({
        id: 'suggestion-dam',
        satKeyId: 'sat-53103000',
      }),
    ]);
  });
});
