import { beforeEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: any) => void | Promise<void>;

const state = vi.hoisted(() => ({
  authCallback: undefined as AuthCallback | undefined,
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  profileSingle: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {
    auth: {
      getSession: state.getSession,
      onAuthStateChange: state.onAuthStateChange,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: state.profileSingle,
        }),
      }),
    }),
  },
}));

function createLocalStorageStub() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn(() => null),
    get length() {
      return values.size;
    },
  };
}

const supabaseUser = {
  id: 'user-1',
  email: 'owner@example.com',
  created_at: '2026-07-01T00:00:00.000Z',
  user_metadata: { display_name: 'Owner' },
};

async function loadInitializedStore() {
  const module = await import('./authStore');
  await module.useAuthStore.getState().initialize();
  return module.useAuthStore;
}

describe('authStore foreground auth recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', createLocalStorageStub());
    state.authCallback = undefined;
    state.getSession.mockReset().mockResolvedValue({
      data: { session: null },
      error: null,
    });
    state.profileSingle.mockReset().mockResolvedValue({
      data: { display_name: 'Owner', role: 'admin' },
      error: null,
    });
    state.onAuthStateChange.mockReset().mockImplementation((callback: AuthCallback) => {
      state.authCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
  });

  it('joins duplicate initialization calls and registers one auth listener', async () => {
    const { useAuthStore } = await import('./authStore');

    const first = useAuthStore.getState().initialize();
    const second = useAuthStore.getState().initialize();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(state.getSession).toHaveBeenCalledTimes(1);
    expect(state.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('releases an aborted initialization so a later attempt can recover', async () => {
    state.getSession
      .mockResolvedValueOnce({
        data: { session: null },
        error: { name: 'AbortError', message: 'request aborted' },
      })
      .mockResolvedValueOnce({
        data: { session: null },
        error: null,
      });
    const { useAuthStore } = await import('./authStore');

    await useAuthStore.getState().initialize();
    await Promise.resolve();

    expect(useAuthStore.getState().isLoading).toBe(false);
    expect(state.onAuthStateChange).toHaveBeenCalledTimes(1);

    await useAuthStore.getState().initialize();

    expect(state.getSession).toHaveBeenCalledTimes(2);
    expect(state.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('can recover an aborted session probe through INITIAL_SESSION', async () => {
    state.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: { name: 'AbortError', message: 'request aborted' },
    });
    const { useAuthStore } = await import('./authStore');

    await useAuthStore.getState().initialize();
    const callbackResult = state.authCallback?.('INITIAL_SESSION', {
      user: supabaseUser,
    });

    expect(callbackResult).toBeUndefined();
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'user-1' },
    });

    await vi.runAllTimersAsync();
    expect(state.profileSingle).toHaveBeenCalledTimes(1);
  });

  it('returns from SIGNED_IN synchronously and hydrates the profile afterward', async () => {
    const useAuthStore = await loadInitializedStore();

    const callbackResult = state.authCallback?.('SIGNED_IN', { user: supabaseUser });

    expect(callbackResult).toBeUndefined();
    expect(state.profileSingle).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: true,
      user: { id: 'user-1', role: 'user' },
    });

    await vi.runAllTimersAsync();
    expect(state.profileSingle).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toMatchObject({ id: 'user-1', role: 'admin' });
  });

  it('deduplicates repeated SIGNED_IN profile hydration', async () => {
    await loadInitializedStore();

    state.authCallback?.('SIGNED_IN', { user: supabaseUser });
    state.authCallback?.('SIGNED_IN', { user: supabaseUser });
    await vi.runAllTimersAsync();

    expect(state.profileSingle).toHaveBeenCalledTimes(1);
  });

  it('does not let late profile hydration restore a signed-out user', async () => {
    let resolveProfile: ((result: { data: any; error: null }) => void) | undefined;
    state.profileSingle.mockReturnValue(new Promise((resolve) => {
      resolveProfile = resolve;
    }));
    const useAuthStore = await loadInitializedStore();

    state.authCallback?.('SIGNED_IN', { user: supabaseUser });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.profileSingle).toHaveBeenCalledTimes(1);

    state.authCallback?.('SIGNED_OUT', null);
    resolveProfile?.({ data: { display_name: 'Owner', role: 'admin' }, error: null });
    await Promise.resolve();
    await Promise.resolve();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
    });
  });
});
