import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOfflineMode: boolean;
  error: string | null;
}

interface AuthActions {
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setOfflineMode: (offline: boolean) => void;
  clearError: () => void;
}

type AuthStore = AuthState & AuthActions;

const VALID_ROLES: UserRole[] = ['admin', 'user', 'viewer'];

// These module-level guards match the app-wide lifetime of the Zustand store.
// In development React Strict Mode mounts App twice; both initialize calls must
// join the same work and register only one Supabase auth listener.
let authInitializationPromise: Promise<void> | null = null;
let hasRegisteredAuthListener = false;
let authGeneration = 0;
let activeProfileHydration: {
  userId: string;
  generation: number;
  promise: Promise<void>;
} | null = null;
let scheduledProfileHydration: {
  userId: string;
  generation: number;
} | null = null;

// Normalizes a raw profiles.role DB value (which may have stray whitespace/casing
// from a manual SQL edit) into a known UserRole, defaulting safely to 'user'.
function normalizeUserRole(rawRole: unknown): UserRole {
  const normalized = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  return (VALID_ROLES as string[]).includes(normalized) ? (normalized as UserRole) : 'user';
}

// Convert Supabase user to our User type
const mapSupabaseUser = (supabaseUser: SupabaseUser, profile?: any): User => ({
  id: supabaseUser.id,
  email: supabaseUser.email || '',
  displayName: profile?.display_name || supabaseUser.user_metadata?.display_name || undefined,
  role: normalizeUserRole(profile?.role),
  createdAt: supabaseUser.created_at || new Date().toISOString(),
  updatedAt: profile?.updated_at || new Date().toISOString(),
});

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => {
      const beginAuthenticatedUser = (supabaseUser: SupabaseUser): number => {
        const current = get();
        if (!current.isAuthenticated || current.user?.id !== supabaseUser.id) {
          authGeneration += 1;
          set({
            user: mapSupabaseUser(supabaseUser),
            isAuthenticated: true,
            error: null,
          });
        }
        return authGeneration;
      };

      const hydrateUserProfile = (
        supabaseUser: SupabaseUser,
        generation: number,
      ): Promise<void> => {
        if (
          activeProfileHydration?.userId === supabaseUser.id &&
          activeProfileHydration.generation === generation
        ) {
          return activeProfileHydration.promise;
        }

        if (!supabase) return Promise.resolve();

        const promise = (async () => {
          try {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', supabaseUser.id)
              .single();

            if (error) {
              console.warn('[Auth] Failed to load user profile:', error);
              const current = get();
              if (
                generation === authGeneration &&
                current.isAuthenticated &&
                current.user?.id === supabaseUser.id
              ) {
                set({ isLoading: false });
              }
              return;
            }

            const current = get();
            if (
              generation !== authGeneration ||
              !current.isAuthenticated ||
              current.user?.id !== supabaseUser.id
            ) {
              return;
            }

            set({
              user: mapSupabaseUser(supabaseUser, profile),
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
          } catch (error) {
            console.error('[Auth] Profile hydration failed:', error);
            const current = get();
            if (
              generation === authGeneration &&
              current.isAuthenticated &&
              current.user?.id === supabaseUser.id
            ) {
              set({ isLoading: false });
            }
          }
        })();

        activeProfileHydration = {
          userId: supabaseUser.id,
          generation,
          promise,
        };
        void promise.finally(() => {
          if (activeProfileHydration?.promise === promise) {
            activeProfileHydration = null;
          }
        });
        return promise;
      };

      const deferProfileHydration = (supabaseUser: SupabaseUser, generation: number) => {
        if (
          (activeProfileHydration?.userId === supabaseUser.id &&
            activeProfileHydration.generation === generation) ||
          (scheduledProfileHydration?.userId === supabaseUser.id &&
            scheduledProfileHydration.generation === generation)
        ) {
          return;
        }

        scheduledProfileHydration = { userId: supabaseUser.id, generation };
        setTimeout(() => {
          if (
            scheduledProfileHydration?.userId === supabaseUser.id &&
            scheduledProfileHydration.generation === generation
          ) {
            scheduledProfileHydration = null;
          }
          if (generation !== authGeneration) return;
          void hydrateUserProfile(supabaseUser, generation);
        }, 0);
      };

      const handleAuthStateChange = (
        event: AuthChangeEvent,
        session: { user: SupabaseUser } | null,
      ): void => {
        // Supabase invokes this callback while holding its auth storage lock.
        // Never await or call another Supabase API here; doing so can deadlock
        // foreground session recovery and every request waiting for a token.
        if (event === 'SIGNED_OUT') {
          authGeneration += 1;
          activeProfileHydration = null;
          scheduledProfileHydration = null;
          set({ user: null, isAuthenticated: false, isLoading: false });
          return;
        }

        if (
          (event === 'SIGNED_IN' ||
            event === 'INITIAL_SESSION' ||
            event === 'TOKEN_REFRESHED' ||
            event === 'USER_UPDATED') &&
          session?.user
        ) {
          const generation = beginAuthenticatedUser(session.user);
          deferProfileHydration(session.user, generation);
          return;
        }

        if (event === 'INITIAL_SESSION' && !session) {
          set({ isLoading: false });
        }
      };

      const registerAuthListener = () => {
        if (!supabase || hasRegisteredAuthListener) return;
        hasRegisteredAuthListener = true;
        supabase.auth.onAuthStateChange(handleAuthStateChange);
      };

      return {
        // Initial state
        user: null,
        isAuthenticated: false,
        isLoading: true,
        isOfflineMode: !isSupabaseConfigured(),
        error: null,

        // Initialize auth state (call on app start)
        initialize: () => {
          if (authInitializationPromise) return authInitializationPromise;

          let shouldReleaseInitialization = false;
          const initialization = (async () => {
            // If Supabase is not configured, run in offline mode
            if (!isSupabaseConfigured() || !supabase) {
              set({ isLoading: false, isOfflineMode: true });
              return;
            }

            // Register first so INITIAL_SESSION / later auth events can recover
            // state even if the one-off getSession probe is aborted by a PWA
            // background transition.
            registerAuthListener();

            try {
              const { data: { session }, error } = await supabase.auth.getSession();

              if (error) {
                if (error.name === 'AbortError' || error.message?.includes('abort')) {
                  shouldReleaseInitialization = true;
                  set({ isLoading: false });
                  return;
                }
                console.error('Auth initialization error:', error);
                set({ isLoading: false, error: error.message });
                return;
              }

              if (session?.user) {
                const generation = beginAuthenticatedUser(session.user);
                await hydrateUserProfile(session.user, generation);
              } else {
                set({ isLoading: false });
              }
            } catch (error: any) {
              if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
                shouldReleaseInitialization = true;
                set({ isLoading: false });
                return;
              }
              console.error('Auth initialization error:', error);
              set({ isLoading: false, error: 'Error al inicializar autenticación' });
            }
          })();

          authInitializationPromise = initialization;
          void initialization.finally(() => {
            if (
              shouldReleaseInitialization &&
              authInitializationPromise === initialization
            ) {
              authInitializationPromise = null;
            }
          });

          return initialization;
        },

        // Login with email and password
        login: async (email: string, password: string) => {
          if (!supabase) {
            return { success: false, error: 'Supabase no está configurado' };
          }

          set({ isLoading: true, error: null });

          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (error) {
              set({ isLoading: false, error: error.message });
              return { success: false, error: error.message };
            }

            if (data.user) {
              const generation = beginAuthenticatedUser(data.user);
              await hydrateUserProfile(data.user, generation);
              return { success: true };
            }

            set({ isLoading: false });
            return { success: false, error: 'No se pudo obtener información del usuario' };
          } catch (error: any) {
            const errorMessage = error?.message || 'Error al iniciar sesión';
            set({ isLoading: false, error: errorMessage });
            return { success: false, error: errorMessage };
          }
        },

        // Signup with email and password
        signup: async (email: string, password: string, displayName?: string) => {
          if (!supabase) {
            return { success: false, error: 'Supabase no está configurado' };
          }

          set({ isLoading: true, error: null });

          try {
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: {
                data: {
                  display_name: displayName,
                },
              },
            });

            if (error) {
              set({ isLoading: false, error: error.message });
              return { success: false, error: error.message };
            }

            if (data.user) {
              // Profile will be created automatically by database trigger.
              beginAuthenticatedUser(data.user);
              set({ isLoading: false });
              return { success: true };
            }

            set({ isLoading: false });
            return { success: true }; // Email confirmation may be required
          } catch (error: any) {
            const errorMessage = error?.message || 'Error al registrarse';
            set({ isLoading: false, error: errorMessage });
            return { success: false, error: errorMessage };
          }
        },

        // Logout
        logout: async () => {
          authGeneration += 1;
          activeProfileHydration = null;
          scheduledProfileHydration = null;
          if (supabase) {
            await supabase.auth.signOut();
          }
          set({ user: null, isAuthenticated: false });
        },

        // Set offline mode (for when Supabase is not configured)
        setOfflineMode: (offline: boolean) => {
          set({ isOfflineMode: offline });
        },

        clearError: () => {
          set({ error: null });
        },
      };
    },
    {
      name: 'inventory_auth',
      partialize: (state) => ({
        // Only persist offline mode preference
        isOfflineMode: state.isOfflineMode,
      }),
    }
  )
);
