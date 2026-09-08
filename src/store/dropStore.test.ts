import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Drop } from '../types';

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

const storage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  removeItem: vi.fn((key: string) => storage.delete(key)),
  clear: vi.fn(() => storage.clear()),
});

function drop(overrides: Partial<Drop> = {}): Drop {
  return {
    id: 'drop-23',
    dropNumber: '23',
    arrivalDate: '2026-01-01T00:00:00.000Z',
    status: 'active',
    totalProducts: 0,
    totalUnits: 0,
    totalValue: 0,
    soldCount: 0,
    availableCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('dropStore UPS guards and authoritative merges', () => {
  let useDropStore: typeof import('./dropStore').useDropStore;
  let mergeDrops: typeof import('./dropStore').mergeDrops;

  beforeAll(async () => {
    ({ useDropStore, mergeDrops } = await import('./dropStore'));
  });

  beforeEach(() => {
    storage.clear();
    useDropStore.setState({ drops: [], isLoading: false, lastSync: null });
  });

  it('accepts only registered UPS numbers', () => {
    expect(() => useDropStore.getState().addDrop({
      dropNumber: '23',
      arrivalDate: '2026-01-01T00:00:00.000Z',
      status: 'active',
    })).not.toThrow();

    expect(() => useDropStore.getState().addDrop({
      dropNumber: '22',
      arrivalDate: '2026-01-01T00:00:00.000Z',
      status: 'active',
    })).toThrow('UPS 22 no está permitido');
  });

  it('does not resurrect a local lot that is absent from Supabase', () => {
    expect(mergeDrops([drop()], [])).toEqual([]);
  });

  it('removes a soft-deleted realtime lot by business key as well as id', () => {
    useDropStore.setState({ drops: [drop({ id: 'local-id' })] });
    useDropStore.getState().handleRealtimeUpdate({
      id: 'server-id',
      drop_number: '23',
      is_deleted: true,
    });
    expect(useDropStore.getState().drops).toEqual([]);
  });
});
