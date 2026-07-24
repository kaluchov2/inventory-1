import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOrGet: vi.fn(),
  publishSatKeyResolution: vi.fn(),
  scheduleSatKeyIdRemap: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../lib/syncManager', () => ({ syncManager: { queueOperation: vi.fn() } }));
vi.mock('../lib/syncQueue', () => ({
  syncQueue: { scheduleSatKeyIdRemap: mocks.scheduleSatKeyIdRemap },
}));
vi.mock('../services/satKeyService', () => ({
  satKeyService: { createOrGet: mocks.createOrGet },
}));
vi.mock('../lib/satKeyResolution', () => ({
  publishSatKeyResolution: mocks.publishSatKeyResolution,
  subscribeSatKeyResolution: () => () => undefined,
}));

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
  };
}

describe('satKeyStore confirmed SAT creation', () => {
  let useSatKeyStore: typeof import('./satKeyStore').useSatKeyStore;

  beforeAll(async () => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    useSatKeyStore = (await import('./satKeyStore')).useSatKeyStore;
  });

  beforeEach(() => {
    mocks.createOrGet.mockReset();
    mocks.publishSatKeyResolution.mockReset();
    mocks.scheduleSatKeyIdRemap.mockReset().mockReturnValue(true);
    useSatKeyStore.setState({
      satKeys: [],
      satCategorySuggestions: [],
      filters: { search: '' },
      isLoading: false,
      lastSync: null,
    });
  });

  it('adds the confirmed server key to the local selector', async () => {
    const canonical = {
      id: 'server-key',
      code: '53103000',
      description: 'Ropa',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    };
    mocks.createOrGet.mockResolvedValue({ satKey: canonical, wasExisting: false });

    const result = await useSatKeyStore.getState().createAndConfirmSatKey({
      code: '53103000',
      description: 'Ropa',
    });

    expect(result).toEqual({
      satKey: canonical,
      wasExisting: false,
      hasPendingReconciliation: false,
    });
    expect(useSatKeyStore.getState().satKeys).toEqual([canonical]);
    expect(mocks.createOrGet).toHaveBeenCalledWith(expect.objectContaining({
      code: '53103000',
      description: 'Ropa',
    }));
  });

  it('requires exactly eight numeric digits before contacting Supabase', async () => {
    await expect(useSatKeyStore.getState().createAndConfirmSatKey({
      code: '53103',
      description: 'Ropa',
    })).rejects.toThrow('sat_key_code_invalid');

    expect(mocks.createOrGet).not.toHaveBeenCalled();
  });

  it('selects the confirmed key and warns when a legacy queue remap cannot persist', async () => {
    const local = {
      id: 'local-key',
      code: '53103000',
      description: 'Ropa local',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    const canonical = { ...local, id: 'server-key', description: 'Ropa' };
    useSatKeyStore.setState({ satKeys: [local] });
    mocks.createOrGet.mockResolvedValue({ satKey: canonical, wasExisting: true });
    mocks.scheduleSatKeyIdRemap.mockReturnValue(false);

    const result = await useSatKeyStore.getState().createAndConfirmSatKey({
      code: '53103000',
      description: 'Ropa',
    });

    expect(result).toEqual({
      satKey: canonical,
      wasExisting: true,
      hasPendingReconciliation: true,
    });
    expect(mocks.scheduleSatKeyIdRemap).toHaveBeenCalledWith('local-key', 'server-key');
    expect(mocks.publishSatKeyResolution).toHaveBeenCalledWith({
      localId: 'local-key',
      canonical,
    });
  });

  it('reconciles an existing local key through the persistent queue remap', async () => {
    const local = {
      id: 'local-key',
      code: '53103000',
      description: 'Ropa local',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    };
    const canonical = { ...local, id: 'server-key', description: 'Ropa' };
    useSatKeyStore.setState({ satKeys: [local] });
    mocks.createOrGet.mockResolvedValue({ satKey: canonical, wasExisting: true });

    const result = await useSatKeyStore.getState().createAndConfirmSatKey({
      code: '53103000',
      description: 'Ropa',
    });

    expect(result).toMatchObject({ hasPendingReconciliation: false });
    expect(mocks.scheduleSatKeyIdRemap).toHaveBeenCalledWith('local-key', 'server-key');
    expect(mocks.publishSatKeyResolution).toHaveBeenCalledWith({
      localId: 'local-key',
      canonical,
    });
  });
});
