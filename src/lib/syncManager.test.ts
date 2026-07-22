import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueueOperation = {
  id: string;
  type: 'products' | 'sat_keys';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
  retryCount: number;
  failureReason?: 'sat_key_foreign_key';
};

const state = vi.hoisted(() => ({
  queue: [] as QueueOperation[],
  deadLetter: [] as QueueOperation[],
  upsert: vi.fn(),
  update: vi.fn(),
  forceCheck: vi.fn(),
  satKeyLookup: null as any,
  satKeyLookups: [] as any[],
  remaps: [] as Array<{ localId: string; canonicalId: string }>,
  writes: [] as string[],
}));

vi.mock('./supabase', () => ({
  supabase: {},
  getSupabaseClient: () => ({
    from: (table: string) => {
      if (table === 'sat_keys') {
        const query: any = {};
        query.eq = vi.fn(() => query);
        query.abortSignal = vi.fn(() => query);
        query.maybeSingle = vi.fn(() => Promise.resolve({
          data: state.satKeyLookups.length > 0
            ? state.satKeyLookups.shift()
            : state.satKeyLookup,
          error: null,
        }));
        return { select: () => query, upsert: state.upsert, update: state.update };
      }
      return { upsert: state.upsert, update: state.update };
    },
  }),
}));

vi.mock('./connectionStatus', () => ({
  connectionStatus: {
    getStatus: () => ({
      isOnline: true,
      isSupabaseConnected: true,
      lastChecked: new Date(),
    }),
    forceCheck: state.forceCheck,
    subscribe: () => () => undefined,
  },
}));

vi.mock('./syncQueue', () => ({
  syncQueue: {
    size: () => state.queue.length,
    isEmpty: () => state.queue.length === 0,
    peek: () => state.queue[0] ?? null,
    enqueue: vi.fn(),
    remove: (id: string) => {
      state.queue = state.queue.filter((operation) => operation.id !== id);
    },
    incrementRetry: (id: string) => {
      const operation = state.queue.find((item) => item.id === id);
      if (!operation) return false;
      operation.retryCount += 1;
      if (operation.retryCount >= 3) {
        state.queue = state.queue.filter((item) => item.id !== id);
        return false;
      }
      return true;
    },
    moveToBack: (id: string) => {
      const index = state.queue.findIndex((operation) => operation.id === id);
      if (index < 0 || state.queue.length < 2) return false;
      const [operation] = state.queue.splice(index, 1);
      state.queue.push(operation);
      return true;
    },
    remapSatKeyId: (localId: string, canonicalId: string) => {
      state.remaps.push({ localId, canonicalId });
      state.queue = state.queue.map((operation) =>
        operation.data?.satKeyId === localId
          ? { ...operation, data: { ...operation.data, satKeyId: canonicalId } }
          : operation,
      );
    },
    moveToDeadLetter: (operation: QueueOperation) => {
      state.deadLetter.push({ ...operation, retryCount: 0 });
    },
    getDeadLetter: () => state.deadLetter,
    getDeadLetterCount: () => state.deadLetter.length,
    discardDeadLetter: (shouldDiscard: (operation: QueueOperation) => boolean) => {
      const originalCount = state.deadLetter.length;
      state.deadLetter = state.deadLetter.filter((operation) => !shouldDiscard(operation));
      return originalCount - state.deadLetter.length;
    },
    getQueueInfo: () => ({ count: state.queue.length, sizeKB: '0.00' }),
  },
}));

vi.mock('./saleSync', () => ({
  isMissingDatabaseFunction: () => false,
  syncRecordedSale: vi.fn(),
}));

vi.mock('./syncIncidentLogger', () => ({
  logSyncIncident: vi.fn(),
}));

function productOperation(
  id: string,
  satKeyId?: string,
  retryCount = 0,
): QueueOperation {
  return {
    id: `products-update-${id}`,
    type: 'products',
    action: 'update',
    data: {
      id,
      name: id,
      sku: id,
      upsBatch: 1,
      quantity: 1,
      unitPrice: 10,
      category: 'DAM',
      satKeyId,
      availableQty: 1,
      soldQty: 0,
      donatedQty: 0,
      lostQty: 0,
      expiredQty: 0,
      status: 'available',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
    timestamp: '2026-07-21T00:00:00.000Z',
    retryCount,
  };
}

function upsertResult(result: { error: unknown }) {
  return {
    abortSignal: () => Promise.resolve(result),
  };
}

function satKeyOperation(id: string): QueueOperation {
  return {
    id: `sat-keys-create-${id}`,
    type: 'sat_keys',
    action: 'create',
    data: {
      id,
      code: '54101500',
      description: 'Joyería fina',
      createdAt: '2026-07-21T00:00:00.000Z',
      updatedAt: '2026-07-21T00:00:00.000Z',
    },
    timestamp: '2026-07-21T00:00:00.000Z',
    retryCount: 0,
  };
}

describe('SyncManager product queue recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    state.queue = [];
    state.deadLetter = [];
    state.forceCheck.mockReset().mockResolvedValue(undefined);
    state.upsert.mockReset();
    state.update.mockReset();
    state.satKeyLookup = null;
    state.satKeyLookups = [];
    state.remaps = [];
    state.writes = [];
  });

  it('syncs a product update with a valid SAT key and clears the pending status', async () => {
    state.queue = [productOperation('product-valid-sat', 'sat-54101500')];
    state.upsert.mockReturnValue(upsertResult({ error: null }));

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sat_key_id: 'sat-54101500' }),
      { onConflict: 'id' },
    );
    expect(state.queue).toHaveLength(0);
    expect(manager.getStatus()).toMatchObject({
      isSyncing: false,
      pendingCount: 0,
      deadLetterCount: 0,
    });
  });

  it('syncs a later valid product when an earlier SAT update is rejected', async () => {
    const rejected = productOperation('product-invalid-sat', 'sat-missing', 1);
    const valid = productOperation('product-valid-sat', 'sat-54101500');
    state.queue = [rejected, valid];
    state.upsert.mockImplementation((payload: { id: string }) =>
      upsertResult({
        error:
          payload.id === 'product-invalid-sat'
            ? { code: '23503', message: 'products_sat_key_id_fkey' }
            : null,
      }),
    );

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(state.upsert.mock.calls.map(([payload]) => payload.id)).toEqual([
      'product-invalid-sat',
      'product-valid-sat',
    ]);
    expect(state.deadLetter).toEqual([
      expect.objectContaining({ id: 'products-update-product-invalid-sat' }),
    ]);
    expect(manager.getStatus()).toMatchObject({
      pendingCount: 0,
      deadLetterCount: 1,
      error: 'La clave SAT del producto no existe en la base de datos. Corrige la clave y reintenta.',
    });
  });

  it('keeps the structured SAT recovery signal when a later foreign-key error has another cause', async () => {
    const satRejected = productOperation('product-invalid-sat', 'sat-missing');
    const otherReferenceRejected = productOperation('product-missing-reference');
    state.queue = [satRejected, otherReferenceRejected];
    state.upsert.mockReturnValue(upsertResult({
      error: { code: '23503', message: 'foreign key violation' },
    }));

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(manager.getStatus()).toMatchObject({
      deadLetterCount: 2,
      hasSatKeyDeadLetter: true,
      error: 'Una referencia relacionada no existe en la base de datos. Corrige el dato y reintenta.',
    });
  });

  it('discards stale dead-letter snapshots for the same product as a missing SAT key', async () => {
    const staleSnapshot = productOperation('product-stale-snapshot');
    const satRejected = productOperation('product-stale-snapshot', 'sat-missing');
    satRejected.failureReason = 'sat_key_foreign_key';
    const unrelated = productOperation('product-unrelated');
    state.deadLetter = [staleSnapshot, satRejected, unrelated];

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    expect(manager.discardSatKeyDeadLetters()).toBe(2);
    expect(state.deadLetter).toEqual([unrelated]);
    expect(manager.getStatus()).toMatchObject({
      deadLetterCount: 1,
      hasSatKeyDeadLetter: false,
    });
  });

  it('keeps update/delete order for the same product after a transient update failure', async () => {
    const update = productOperation('product-delete-order', undefined, 2);
    const remove: QueueOperation = {
      ...productOperation('product-delete-order'),
      id: 'products-delete-product-delete-order',
      action: 'delete',
      data: { id: 'product-delete-order' },
    };
    state.queue = [update, remove];
    state.upsert.mockImplementation((payload: { id: string }) => {
      state.writes.push(`upsert:${payload.id}`);
      return upsertResult({ error: { code: '500', message: 'temporary failure' } });
    });
    state.update.mockImplementation(() => ({
      eq: () => ({
        abortSignal: () => {
          state.writes.push('delete:product-delete-order');
          return Promise.resolve({ error: null });
        },
      }),
    }));

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(state.writes).toEqual([
      'upsert:product-delete-order',
      'delete:product-delete-order',
    ]);
    expect(state.deadLetter).toHaveLength(1);
    expect(state.queue).toHaveLength(0);
  });

  it('adopts the canonical SAT id before syncing a dependent product', async () => {
    const localId = 'sat-local-id';
    const canonicalId = 'sat-server-id';
    state.satKeyLookup = {
      id: canonicalId,
      code: '54101500',
      description: 'Joyería fina',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    state.queue = [satKeyOperation(localId), productOperation('product-canonical-sat', localId)];
    state.upsert.mockReturnValue(upsertResult({ error: null }));

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(state.remaps).toEqual([{ localId, canonicalId }]);
    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ sat_key_id: canonicalId }),
      { onConflict: 'id' },
    );
    expect(state.queue).toHaveLength(0);
  });

  it('adopts the canonical SAT id after a concurrent unique-code collision', async () => {
    const localId = 'sat-race-local-id';
    const canonicalId = 'sat-race-server-id';
    state.satKeyLookups = [null, {
      id: canonicalId,
      code: '54101500',
      description: 'Joyería fina',
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }];
    state.queue = [satKeyOperation(localId), productOperation('product-race-sat', localId)];
    state.upsert.mockImplementation((payload: { code?: string }) =>
      upsertResult({ error: payload.code ? { code: '23505', message: 'duplicate key' } : null }),
    );

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    await manager.syncPendingOperations();

    expect(state.remaps).toEqual([{ localId, canonicalId }]);
    expect(state.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ sat_key_id: canonicalId }),
      { onConflict: 'id' },
    );
    expect(state.deadLetter).toHaveLength(0);
  });

  it('joins a manual retry to the active sync instead of starting a second upload', async () => {
    state.queue = [productOperation('product-delayed', 'sat-54101500')];
    let finishUpload: ((value: { error: null }) => void) | undefined;
    state.upsert.mockReturnValue({
      abortSignal: () => new Promise((resolve) => {
        finishUpload = resolve;
      }),
    });

    const { SyncManager } = await import('./syncManager');
    const manager = new SyncManager({ initialize: false });

    const initialSync = manager.syncPendingOperations();
    await Promise.resolve();
    const manualRetry = manager.forceSync();

    expect(state.upsert).toHaveBeenCalledTimes(1);
    finishUpload?.({ error: null });
    await Promise.all([initialSync, manualRetry]);

    expect(state.upsert).toHaveBeenCalledTimes(1);
    expect(state.queue).toHaveLength(0);
  });
});
