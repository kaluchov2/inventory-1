import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';
import { useCustomerStore } from '../../store/customerStore';
import { useTransactionStore } from '../../store/transactionStore';
import { useRealtimeProducts, useRealtimeCustomers, useRealtimeTransactions } from '../../hooks/useRealtimeSync';

/**
 * SyncInitializer Component
 * Handles initial data sync and real-time subscriptions
 * This component doesn't render anything - it's just for side effects
 */
export function SyncInitializer() {
  const { isAuthenticated, isOfflineMode } = useAuthStore();
  const loadProducts = useProductStore((state) => state.loadFromSupabase);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadTransactions = useTransactionStore((state) => state.loadFromSupabase);

  // Initial load from Supabase
  useEffect(() => {
    if (isAuthenticated && !isOfflineMode) {
      console.log('[Sync] Loading initial data from Supabase...');

      Promise.all([
        loadProducts(true), // Force replace on initial load - Supabase is source of truth
        loadCustomers(),
        loadTransactions(),
      ]).then(() => {
        console.log('[Sync] Initial data loaded successfully');
      }).catch((error) => {
        console.error('[Sync] Failed to load initial data:', error);
      });
    }
  }, [isAuthenticated, isOfflineMode, loadProducts, loadCustomers, loadTransactions]);

  // Subscribe to real-time updates
  useRealtimeProducts(() => {
    console.log('[Realtime] Products changed, reloading...');
    if (isAuthenticated && !isOfflineMode) {
      loadProducts();
    }
  });

  useRealtimeCustomers(() => {
    console.log('[Realtime] Customers changed, reloading...');
    if (isAuthenticated && !isOfflineMode) {
      loadCustomers();
    }
  });

  useRealtimeTransactions(() => {
    console.log('[Realtime] Transactions changed, reloading...');
    if (isAuthenticated && !isOfflineMode) {
      loadTransactions();
    }
  });

  return null; // This component doesn't render anything
}
