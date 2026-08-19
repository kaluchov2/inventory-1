import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeRefreshGate, shouldRefreshTransactionVersion } from './realtimeRefreshGate';

afterEach(() => {
  vi.useRealTimers();
});

describe('shouldRefreshTransactionVersion', () => {
  it('rehydrates different PostgreSQL versions inside the same millisecond', () => {
    expect(shouldRefreshTransactionVersion(
      '2026-08-19T10:00:00.123100Z',
      '2026-08-19T10:00:00.123900Z',
    )).toBe(true);
  });

  it('skips exact and certainly older remote versions', () => {
    expect(shouldRefreshTransactionVersion(
      '2026-08-19T10:00:01.000Z',
      '2026-08-19T10:00:01.000Z',
    )).toBe(false);
    expect(shouldRefreshTransactionVersion(
      '2026-08-19T10:00:02.000Z',
      '2026-08-19T10:00:01.999999Z',
    )).toBe(false);
  });
});

describe('createRealtimeRefreshGate', () => {
  it('coalesces multiple events for one transaction', () => {
    vi.useFakeTimers();
    const gate = createRealtimeRefreshGate(50);
    const callback = vi.fn();

    gate.schedule('sale-1', callback);
    const latestGeneration = gate.schedule('sale-1', callback);
    vi.advanceTimersByTime(50);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(latestGeneration);
  });

  it('invalidates an in-flight generation when a newer event arrives', () => {
    const gate = createRealtimeRefreshGate(0);
    const first = gate.invalidate('sale-1');
    const second = gate.invalidate('sale-1');

    expect(gate.isCurrent('sale-1', first)).toBe(false);
    expect(gate.isCurrent('sale-1', second)).toBe(true);
  });
});
