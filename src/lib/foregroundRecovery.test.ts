import { describe, expect, it, vi } from 'vitest';
import { runForegroundRecovery } from './foregroundRecovery';

const connected = {
  isOnline: true,
  isSupabaseConnected: true,
  lastChecked: new Date('2026-07-22T00:00:00.000Z'),
};

describe('runForegroundRecovery', () => {
  it('checks connectivity and reloads data when the queue is already empty', async () => {
    const forceCheck = vi.fn().mockResolvedValue(connected);
    const syncPendingOperations = vi.fn().mockResolvedValue(undefined);
    const loadProductChanges = vi.fn().mockResolvedValue(undefined);
    const loadTransactions = vi.fn().mockResolvedValue(undefined);

    await expect(runForegroundRecovery({
      source: 'visibilitychange',
      forceCheck,
      syncPendingOperations,
      getPendingCount: () => 0,
      loadChanges: [loadProductChanges, loadTransactions],
      log: vi.fn(),
    })).resolves.toBe('completed');

    expect(forceCheck).toHaveBeenCalledTimes(1);
    expect(syncPendingOperations).toHaveBeenCalledTimes(1);
    expect(loadProductChanges).toHaveBeenCalledTimes(1);
    expect(loadTransactions).toHaveBeenCalledTimes(1);
  });

  it('flushes a queued write before running the catch-up loads', async () => {
    let pendingCount = 1;
    const order: string[] = [];
    const syncPendingOperations = vi.fn(async () => {
      order.push('flush');
      pendingCount = 0;
    });
    const loadChanges = vi.fn(async () => {
      order.push('load');
    });

    await expect(runForegroundRecovery({
      source: 'focus',
      forceCheck: vi.fn().mockResolvedValue(connected),
      syncPendingOperations,
      getPendingCount: () => pendingCount,
      loadChanges: [loadChanges],
      log: vi.fn(),
    })).resolves.toBe('completed');

    expect(order).toEqual(['flush', 'load']);
  });

  it('does not reload remote state while queued writes remain pending', async () => {
    const loadChanges = vi.fn().mockResolvedValue(undefined);

    await expect(runForegroundRecovery({
      source: 'pageshow',
      forceCheck: vi.fn().mockResolvedValue(connected),
      syncPendingOperations: vi.fn().mockResolvedValue(undefined),
      getPendingCount: () => 1,
      loadChanges: [loadChanges],
      log: vi.fn(),
    })).resolves.toBe('pending');

    expect(loadChanges).not.toHaveBeenCalled();
  });
});
