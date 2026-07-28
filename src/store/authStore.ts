import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthChangeEvent, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { User, UserRole } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // An authenticated Supabase session is not authorized for app routes until
  // its profile (and therefore its role) has been verified.
  isProfileHydrated: boolean;
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

// Accept only roles that the database profile explicitly supplies. A missing or
// malformed role must not silently become a full-access user role.
function normalizeUserRole(rawRole: unknown): UserRole | null {
  const normalized = typeof rawRole === 'string' ? rawRole.trim().toLowerCase() : '';
  return (VALID_ROLES as string[]).includes(normalized) ? (normalized as UserRole) : null;
}

// Convert Supabase user to our User type
const mapSupabaseUser = (
  supabaseUser: SupabaseUser,
  profile?: any,
  role: UserRole = 'user',
): User => ({
  id: supabaseUser.id,
  email: supabaseUser.email || '',
  displayName: profile?.display_name || supabaseUser.user_metadata?.display_name || undefined,
  role,
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
        }
        // Never expose an authenticated session to protected routes using a
        // provisional/default role. This also revalidates the role after token
        // refreshes, in case it changed in the database.
        set({
          user: mapSupabaseUser(supabaseUser),
          isAuthenticated: true,
          isLoading: true,
          isProfileHydrated: false,
          error: null,
        });
        return authGeneration;
      };

      const markProfileHydrationFailed = (
        supabaseUser: SupabaseUser,
        generation: number,
        cause: unknown,
      ) => {
        console.warn('[Auth] Failed to verify user profile:', cause);
        const current = get();
        if (
          generation === authGeneration &&
          current.isAuthenticated &&
          current.user?.id === supabaseUser.id
        ) {
          set({
            isLoading: false,
            isProfileHydrated: false,
            error: 'No se pudo verificar tu perfil. Revisa tu conexión e inténtalo de nuevo.',
          });
        }
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
              markProfileHydrationFailed(supabaseUser, generation, error);
              return;
            }

            const role = normalizeUserRole(profile?.role);
            if (!role) {
              markProfileHydrationFailed(
                supabaseUser,
                generation,
                new Error('Profile has no valid role'),
              );
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
              user: mapSupabaseUser(supabaseUser, profile, role),
              isAuthenticated: true,
              isLoading: false,
              isProfileHydrated: true,
              error: null,
            });
          } catch (error) {
            console.error('[Auth] Profile hydration failed:', error);
            markProfileHydrationFailed(supabaseUser, generation, error);
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
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isProfileHydrated: false,
            error: null,
          });
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
          set({ isLoading: false, isProfileHydrated: false });
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
        isProfileHydrated: false,
        isOfflineMode: !isSupabaseConfigured(),
        error: null,

        // Initialize auth state (call on app start)
        initialize: () => {
          if (authInitializationPromise) return authInitializationPromise;

          let shouldReleaseInitialization = false;
          const initialization = (async () => {
            // If Supabase is not configured, run in offline mode
            if (!isSupabaseConfigured() || !supabase) {
              set({ isLoading: false, isProfileHydrated: false, isOfflineMode: true });
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
                  set({ isLoading: false, isProfileHydrated: false });
                  return;
                }
                console.error('Auth initialization error:', error);
                set({ isLoading: false, isProfileHydrated: false, error: error.message });
                return;
              }

              if (session?.user) {
                const generation = beginAuthenticatedUser(session.user);
                await hydrateUserProfile(session.user, generation);
              } else {
                set({ isLoading: false, isProfileHydrated: false });
              }
            } catch (error: any) {
              if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
                shouldReleaseInitialization = true;
                set({ isLoading: false, isProfileHydrated: false });
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

          set({ isLoading: true, isProfileHydrated: false, error: null });

          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });

            if (error) {
              set({ isLoading: false, isProfileHydrated: false, error: error.message });
              return { success: false, error: error.message };
            }

            if (data.user) {
              const generation = beginAuthenticatedUser(data.user);
              await hydrateUserProfile(data.user, generation);
              const current = get();
              if (current.isProfileHydrated && current.user?.id === data.user.id) {
                return { success: true };
              }
              return {
                success: false,
                error: current.error || 'No se pudo verificar tu perfil',
              };
            }

            set({ isLoading: false, isProfileHydrated: false });
            return { success: false, error: 'No se pudo obtener información del usuario' };
          } catch (error: any) {
            const errorMessage = error?.message || 'Error al iniciar sesión';
            set({ isLoading: false, isProfileHydrated: false, error: errorMessage });
            return { success: false, error: errorMessage };
          }
        },

        // Signup with email and password
        signup: async (email: string, password: string, displayName?: string) => {
          if (!supabase) {
            return { success: false, error: 'Supabase no está configurado' };
          }

          set({ isLoading: true, isProfileHydrated: false, error: null });

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
              set({ isLoading: false, isProfileHydrated: false, error: error.message });
              return { success: false, error: error.message };
            }

            if (data.user) {
              // Profile will be created automatically by database trigger.
              beginAuthenticatedUser(data.user);
              set({ isLoading: false, isProfileHydrated: false });
              return { success: true };
            }

              set({ isLoading: false, isProfileHydrated: false });
            return { success: true }; // Email confirmation may be required
          } catch (error: any) {
            const errorMessage = error?.message || 'Error al registrarse';
            set({ isLoading: false, isProfileHydrated: false, error: errorMessage });
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
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            isProfileHydrated: false,
            error: null,
          });
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
