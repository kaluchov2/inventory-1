import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleSyncPayload } from './saleSync';

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabase', () => ({
  getSupabaseClient: () => ({
    rpc: state.rpc,
    from: state.from,
  }),
}));

const payload = {
  transaction: {
    id: 'transaction-1',
    items: [],
  },
  products: [],
} as unknown as SaleSyncPayload;

describe('syncRecordedSale', () => {
  beforeEach(() => {
    state.rpc.mockReset();
    state.from.mockReset();
  });

  it('records a sale through the atomic RPC', async () => {
    state.rpc.mockResolvedValue({ error: null });
    const { syncRecordedSale } = await import('./saleSync');

    await syncRecordedSale(payload);

    expect(state.rpc).toHaveBeenCalledWith('record_sale', {
      sale_payload: payload,
    });
    expect(state.from).not.toHaveBeenCalled();
  });

  it('fails closed when record_sale is missing instead of partially syncing tables', async () => {
    const missingRpc = {
      code: 'PGRST202',
      message: 'Could not find the function public.record_sale',
    };
    state.rpc.mockResolvedValue({ error: missingRpc });
    const { syncRecordedSale } = await import('./saleSync');

    await expect(syncRecordedSale(payload)).rejects.toBe(missingRpc);

    expect(state.from).not.toHaveBeenCalled();
  });

  it('preserves ordinary RPC errors for queue retry and dead-letter handling', async () => {
    const rpcError = {
      code: '40001',
      message: 'serialization failure',
    };
    state.rpc.mockResolvedValue({ error: rpcError });
    const { syncRecordedSale } = await import('./saleSync');

    await expect(syncRecordedSale(payload)).rejects.toBe(rpcError);
    expect(state.from).not.toHaveBeenCalled();
  });
});
