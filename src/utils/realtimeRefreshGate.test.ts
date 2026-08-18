import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeRefreshGate } from './realtimeRefreshGate';

afterEach(() => {
  vi.useRealTimers();
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
