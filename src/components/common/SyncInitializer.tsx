import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';
import { useCustomerStore } from '../../store/customerStore';
import { useTransactionStore } from '../../store/transactionStore';
import { useRealtimeProducts, useRealtimeCustomers, useRealtimeTransactions } from '../../hooks/useRealtimeSync';
import { syncManager } from '../../lib/syncManager';

/**
 * SyncInitializer Component
 * Handles initial data sync and real-time subscriptions.
 * This component renders nothing — it exists purely for side effects.
 *
 * ## Startup flow
 * 1. On mount (after login), flush any pending queue to Supabase.
 * 2. After flush, load the full dataset from Supabase (source of truth).
 *
 * ## Realtime flow (after startup)
 * When another device writes a row, Supabase emits a `postgres_changes` event
 * carrying the full new/old record. The event is routed directly to the store's
 * incremental handler (handleRealtimeUpdate / handleRealtimeDelete), which
 * merges just that one record into local state — no full reload needed.
 *
 * Full reloads are still triggered for:
 *   - Initial mount (forceReplace = true)
 *   - App foreground return (visibilitychange)
 *   - Reconnect after offline (connectionStatus subscriber in syncManager)
 *   - After Excel import
 */
export function SyncInitializer() {
  const { isAuthenticated, isOfflineMode } = useAuthStore();
  const loadProducts = useProductStore((state) => state.loadFromSupabase);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadTransactions = useTransactionStore((state) => state.loadFromSupabase);

  // Incremental realtime handlers — update/delete a single record in local state
  const handleProductUpdate = useProductStore((state) => state.handleRealtimeUpdate);
  const handleProductDelete = useProductStore((state) => state.handleRealtimeDelete);
  const handleCustomerUpdate = useCustomerStore((state) => state.handleRealtimeUpdate);
  const handleCustomerDelete = useCustomerStore((state) => state.handleRealtimeDelete);
  const handleTransactionUpdate = useTransactionStore((state) => state.handleRealtimeUpdate);
  const handleTransactionDelete = useTransactionStore((state) => state.handleRealtimeDelete);

  // Initial load from Supabase — flush pending queue first
  useEffect(() => {
    if (isAuthenticated && !isOfflineMode) {
      console.log('[Sync] Flushing pending queue before initial load...');

      syncManager.syncPendingOperations().then(() => {
        // Bug 1 guard: if queue still has pending items after flush, we were offline
        // (syncPendingOperations returned early). Do NOT overwrite local state with
        // remote data — that would erase transactions/products queued but not yet sent.
        // The connectionStatus subscription will trigger another flush+reload once online.
        const { pendingCount } = syncManager.getStatus();
        if (pendingCount > 0) {
          console.log('[Sync] Queue still has', pendingCount, 'pending item(s) — offline flush skipped, deferring remote load to preserve local state');
          return;
        }
        console.log('[Sync] Queue flushed, loading initial data from Supabase...');
        return Promise.all([
          loadProducts(true), // Force replace on initial load - Supabase is source of truth
          loadCustomers(),
          loadTransactions(),
        ]);
      }).then(() => {
        console.log('[Sync] Initial data loaded successfully');
      }).catch((error) => {
        console.error('[Sync] Failed to load initial data:', error);
      });
    }
  }, [isAuthenticated, isOfflineMode, loadProducts, loadCustomers, loadTransactions]);

  // When app returns from background, flush pending queue then reload all data
  // This ensures changes from other devices are picked up immediately
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && isAuthenticated && !isOfflineMode) {
        // Bug 3: delay 500 ms so connectionStatus.forceCheck() (which also fires on
        // visibilitychange inside connectionStatus.ts) can finish before we attempt
        // to flush. Without the delay, syncPendingOperations() may see stale
        // isSupabaseConnected=false from before the screen was unlocked and return
        // early, leaving the queue unprocessed until the next 10 s tick.
        setTimeout(() => {
          console.log('[Sync] App returned to foreground, flushing queue and reloading...');
          syncManager.syncPendingOperations().then(() => {
            const { pendingCount } = syncManager.getStatus();
            if (pendingCount > 0) {
              console.log('[Sync] Foreground flush skipped (still offline), deferring remote load');
              return;
            }
            return Promise.all([loadProducts(), loadCustomers(), loadTransactions()]);
          });
        }, 500);
      }
    };

    // Bug 2: pagehide fires on iOS when the user swipes the PWA closed from the
    // app switcher (visibilitychange is not reliable in that case). This is a
    // best-effort flush — iOS may kill the process before it completes, but the
    // queue is already persisted to localStorage so it will retry on next open.
    const handlePageHide = () => {
      if (isAuthenticated && !isOfflineMode) {
        console.log('[Sync] pagehide — attempting best-effort queue flush before unload');
        syncManager.syncPendingOperations();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isAuthenticated, isOfflineMode, loadProducts, loadCustomers, loadTransactions]);

  // Route realtime events directly to incremental handlers — no full reload, no debounce.
  // useRealtimeSync only subscribes when isAuthenticated && !isOfflineMode.
  useRealtimeProducts({
    onInsert: handleProductUpdate,
    onUpdate: handleProductUpdate,
    onDelete: handleProductDelete,
  });
  useRealtimeCustomers({
    onInsert: handleCustomerUpdate,
    onUpdate: handleCustomerUpdate,
    onDelete: handleCustomerDelete,
  });
  useRealtimeTransactions({
    onInsert: handleTransactionUpdate,
    onUpdate: handleTransactionUpdate,
    onDelete: handleTransactionDelete,
  });

  return null; // This component doesn't render anything
}
