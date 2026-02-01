import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

// Convert Supabase user to our User type
const mapSupabaseUser = (supabaseUser: any, profile?: any): User => ({
  id: supabaseUser.id,
  email: supabaseUser.email || '',
  displayName: profile?.display_name || supabaseUser.user_metadata?.display_name || undefined,
  role: (profile?.role as UserRole) || 'user',
  createdAt: supabaseUser.created_at || new Date().toISOString(),
  updatedAt: profile?.updated_at || new Date().toISOString(),
});

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      // Initial state
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isOfflineMode: !isSupabaseConfigured(),
      error: null,

      // Initialize auth state (call on app start)
      initialize: async () => {
        // If Supabase is not configured, run in offline mode
        if (!isSupabaseConfigured() || !supabase) {
          set({ isLoading: false, isOfflineMode: true });
          return;
        }

        try {
          // Get current session
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) {
            // Ignore AbortError - this happens during React Strict Mode cleanup
            if (error.name === 'AbortError' || error.message?.includes('abort')) {
              return;
            }
            console.error('Auth initialization error:', error);
            set({ isLoading: false, error: error.message });
            return;
          }

          if (session?.user) {
            // Fetch user profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            const user = mapSupabaseUser(session.user, profile);
            set({ user, isAuthenticated: true, isLoading: false });
          } else {
            set({ isLoading: false });
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user && supabase) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

              const user = mapSupabaseUser(session.user, profile);
              set({ user, isAuthenticated: true });
            } else if (event === 'SIGNED_OUT') {
              set({ user: null, isAuthenticated: false });
            }
          });
        } catch (error: any) {
          // Ignore AbortError - this happens during React Strict Mode cleanup
          if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
            return;
          }
          console.error('Auth initialization error:', error);
          set({ isLoading: false, error: 'Error al inicializar autenticación' });
        }
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
            // Fetch user profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .single();

            const user = mapSupabaseUser(data.user, profile);
            set({ user, isAuthenticated: true, isLoading: false });
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
            // Profile will be created automatically by database trigger
            const user = mapSupabaseUser(data.user);
            set({ user, isAuthenticated: true, isLoading: false });
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
        if (supabase) {
          await supabase.auth.signOut();
        }
        set({ user: null, isAuthenticated: false });
      },

      // Set offline mode (for when Supabase is not configured)
      setOfflineMode: (offline: boolean) => {
        set({ isOfflineMode: offline });
      },

      // Clear error
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'inventory_auth',
      partialize: (state) => ({
        // Only persist offline mode preference
        isOfflineMode: state.isOfflineMode,
      }),
    }
  )
);
