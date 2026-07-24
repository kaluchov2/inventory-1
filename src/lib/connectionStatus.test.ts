import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProbeResult = { error: unknown };

const state = vi.hoisted(() => ({
  probe: vi.fn<() => Promise<ProbeResult>>(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
    },
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: () => state.probe(),
        }),
      }),
    }),
  },
}));

vi.mock('./syncIncidentLogger', () => ({
  logSyncIncident: vi.fn(),
}));

describe('ConnectionStatusManager foreground recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    state.probe.mockReset();
  });

  it('bounds a probe that never reaches the abortable fetch completion', async () => {
    state.probe.mockReturnValue(new Promise(() => undefined));
    const { ConnectionStatusManager } = await import('./connectionStatus');
    const manager = new ConnectionStatusManager({ initialize: false });

    const check = manager.forceCheck();
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(check).resolves.toMatchObject({ isSupabaseConnected: false });
    expect(state.probe).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent foreground checks into one probe', async () => {
    let resolveProbe: ((result: ProbeResult) => void) | undefined;
    state.probe.mockReturnValue(new Promise((resolve) => {
      resolveProbe = resolve;
    }));
    const { ConnectionStatusManager } = await import('./connectionStatus');
    const manager = new ConnectionStatusManager({ initialize: false });

    const first = manager.forceCheck();
    const second = manager.forceCheck();
    expect(first).toBe(second);
    expect(state.probe).toHaveBeenCalledTimes(1);

    resolveProbe?.({ error: null });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ isSupabaseConnected: true }),
      expect.objectContaining({ isSupabaseConnected: true }),
    ]);
  });

  it('allows a later check to recover after a timeout', async () => {
    state.probe
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce({ error: null });
    const { ConnectionStatusManager } = await import('./connectionStatus');
    const manager = new ConnectionStatusManager({ initialize: false });

    const timedOut = manager.forceCheck();
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(timedOut).resolves.toMatchObject({ isSupabaseConnected: false });

    await expect(manager.forceCheck()).resolves.toMatchObject({ isSupabaseConnected: true });
    expect(state.probe).toHaveBeenCalledTimes(2);
  });

  it('ignores a late result from a timed-out probe', async () => {
    let resolveFirst: ((result: ProbeResult) => void) | undefined;
    state.probe
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({ error: null });
    const { ConnectionStatusManager } = await import('./connectionStatus');
    const manager = new ConnectionStatusManager({ initialize: false });

    const first = manager.forceCheck();
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    await manager.forceCheck();
    expect(manager.getStatus().isSupabaseConnected).toBe(true);

    resolveFirst?.({ error: { message: 'late failure' } });
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.getStatus().isSupabaseConnected).toBe(true);
  });
});
