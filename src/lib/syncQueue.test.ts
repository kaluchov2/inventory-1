import { beforeEach, describe, expect, it, vi } from 'vitest';

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  };
}

describe('syncQueue SAT id remapping', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', createLocalStorageStub());
  });

  it('remaps queued and dead-letter references, including batches and sale snapshots', async () => {
    const { syncQueue } = await import('./syncQueue');
    const localId = 'sat-local-id';
    const canonicalId = 'sat-server-id';

    syncQueue.enqueue({
      type: 'products',
      action: 'batch_update',
      data: [{ id: 'batch-product', satKeyId: localId }],
    });
    syncQueue.enqueue({
      type: 'products',
      action: 'sale_update',
      data: {
        id: 'sale-product',
        snapshot: { id: 'sale-product', satKeyId: localId },
      },
    });
    syncQueue.enqueue({
      type: 'products',
      action: 'update',
      data: { id: 'failed-product', satKeyId: localId },
    });
    const failed = syncQueue.getAll()[2];
    syncQueue.moveToDeadLetter(failed);
    syncQueue.remove(failed.id);

    syncQueue.remapSatKeyId(localId, canonicalId);

    expect(syncQueue.getAll()).toEqual([
      expect.objectContaining({
        data: [expect.objectContaining({ satKeyId: canonicalId })],
      }),
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({ satKeyId: canonicalId }),
        }),
      }),
    ]);
    expect(syncQueue.getDeadLetter()).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ satKeyId: canonicalId }),
      }),
    ]);

    expect(JSON.parse(localStorage.getItem('inventory_sync_queue') || '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: [expect.objectContaining({ satKeyId: canonicalId })],
        }),
      ]),
    );
    expect(JSON.parse(localStorage.getItem('inventory_sync_dead_letter') || '[]')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({ satKeyId: canonicalId }),
        }),
      ]),
    );
  });

  it('keeps unqueued dead-letter operations when retry runs out of local storage', async () => {
    const storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    const { syncQueue } = await import('./syncQueue');

    syncQueue.enqueue({
      type: 'products',
      action: 'update',
      data: { id: 'product-quota', satKeyId: 'sat-id' },
    });
    const failed = syncQueue.getAll()[0];
    syncQueue.moveToDeadLetter(failed);
    syncQueue.remove(failed.id);

    storage.setItem.mockImplementation((key: string, value: string) => {
      if (key === 'inventory_sync_queue') throw new Error('quota exceeded');
      storage.store.set(key, value);
    });

    expect(() => syncQueue.retryDeadLetter()).toThrow('quota exceeded');
    expect(syncQueue.getAll()).toHaveLength(0);
    expect(syncQueue.getDeadLetter()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ id: 'product-quota' }) }),
    ]);
  });

  it('does not duplicate operations when clearing dead-letter storage fails after a successful retry', async () => {
    const storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    const { syncQueue } = await import('./syncQueue');

    syncQueue.enqueue({
      type: 'products',
      action: 'update',
      data: { id: 'product-remove-failure', satKeyId: 'sat-id' },
    });
    const failed = syncQueue.getAll()[0];
    syncQueue.moveToDeadLetter(failed);
    syncQueue.remove(failed.id);

    storage.removeItem.mockImplementation((key: string) => {
      if (key === 'inventory_sync_dead_letter') {
        throw new Error('remove failed');
      }
      storage.store.delete(key);
    });

    syncQueue.retryDeadLetter();

    expect(syncQueue.getAll()).toEqual([
      expect.objectContaining({ data: expect.objectContaining({ id: 'product-remove-failure' }) }),
    ]);
    expect(syncQueue.getDeadLetter()).toHaveLength(0);
    expect(JSON.parse(storage.store.get('inventory_sync_dead_letter') || '[]')).toEqual([]);
  });

  it('persists a failed SAT remap and applies it after the queue recovers on restart', async () => {
    const storage = createLocalStorageStub();
    vi.stubGlobal('localStorage', storage);
    const { syncQueue } = await import('./syncQueue');

    syncQueue.enqueue({
      type: 'products',
      action: 'update',
      data: { id: 'product-pending-remap', satKeyId: 'sat-local-id' },
    });
    storage.setItem.mockImplementation((key: string, value: string) => {
      if (key === 'inventory_sync_queue') throw new Error('storage unavailable');
      storage.store.set(key, value);
    });

    expect(syncQueue.scheduleSatKeyIdRemap('sat-local-id', 'sat-server-id')).toBe(false);
    expect(JSON.parse(storage.store.get('inventory_sync_sat_key_remaps') || '[]')).toEqual([
      { localId: 'sat-local-id', canonicalId: 'sat-server-id' },
    ]);

    storage.setItem.mockImplementation((key: string, value: string) => {
      storage.store.set(key, value);
    });
    vi.resetModules();
    const { syncQueue: recoveredQueue } = await import('./syncQueue');

    expect(recoveredQueue.getAll()).toEqual([
      expect.objectContaining({
        data: expect.objectContaining({ satKeyId: 'sat-server-id' }),
      }),
    ]);
    expect(storage.store.get('inventory_sync_sat_key_remaps')).toBeUndefined();
  });

  it('can discard only SAT foreign-key dead letters after the product is corrected', async () => {
    const { syncQueue } = await import('./syncQueue');
    syncQueue.enqueue({
      type: 'products',
      action: 'update',
      data: { id: 'product-sat-error', satKeyId: 'sat-missing' },
    });
    const failed = syncQueue.getAll()[0];
    failed.failureReason = 'sat_key_foreign_key';
    syncQueue.moveToDeadLetter(failed);
    syncQueue.remove(failed.id);

    expect(syncQueue.discardDeadLetter(
      (operation) => operation.failureReason === 'sat_key_foreign_key',
    )).toBe(1);
    expect(syncQueue.getDeadLetter()).toHaveLength(0);
  });
});
