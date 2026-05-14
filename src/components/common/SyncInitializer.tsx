import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useProductStore } from '../../store/productStore';
import { useCustomerStore } from '../../store/customerStore';
import { useTransactionStore } from '../../store/transactionStore';
import { useRealtimeProducts, useRealtimeCustomers, useRealtimeTransactions } from '../../hooks/useRealtimeSync';
import { connectionStatus } from '../../lib/connectionStatus';
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
 * Recovery reloads are still triggered for:
 *   - Initial mount (forceReplace = true)
 *   - App foreground return (delta catch-up for products/customers + full transactions reload)
 *   - Reconnect after offline (queue flush in syncManager + catch-up here)
 *   - After Excel import
 */
export function SyncInitializer() {
  const { isAuthenticated, isOfflineMode } = useAuthStore();
  const loadProducts = useProductStore((state) => state.loadFromSupabase);
  const loadProductChanges = useProductStore((state) => state.loadChangesFromSupabase);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadCustomerChanges = useCustomerStore((state) => state.loadChangesFromSupabase);
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
    console.log('[Sync] Initializer auth/offline state changed', {
      isAuthenticated,
      isOfflineMode,
    });
    if (isAuthenticated && !isOfflineMode) {
      console.log('[Sync] Flushing pending queue before initial load...');
      console.log('[Sync] Status before initial flush:', syncManager.getStatus());

      syncManager.syncPendingOperations().then(() => {
        console.log('[Sync] Status after initial flush:', syncManager.getStatus());
        // Bug 1 guard: if queue still has pending items after flush, we were offline
        // (syncPendingOperations returned early). Do NOT overwrite local state with
        // remote data — that would erase transactions/products queued but not yet sent.
        // The connectionStatus subscription will trigger another flush+reload once online.
        const { pendingCount } = syncManager.getStatus();
        if (pendingCount > 0) {
          console.log('[Sync] Queue still has', pendingCount, 'pending item(s) - deferring remote load to preserve local state');
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

  // When app returns from background or reconnects, flush pending queue then
  // catch up products/customers via delta sync. Transactions stay on full reload
  // until they have a stable updated_at watermark in the DB.
  useEffect(() => {
    let lastForegroundRunAt = 0;
    const triggerForegroundSync = (source: string) => {
      if (!isAuthenticated || isOfflineMode) return;

      // Avoid duplicate runs when browsers emit multiple foreground events in quick succession.
      const now = Date.now();
      if (now - lastForegroundRunAt < 1500) return;
      lastForegroundRunAt = now;

      // Delay 500 ms so connectionStatus.forceCheck() can finish before flush attempt.
      setTimeout(() => {
        console.log(`[Sync] Foreground trigger (${source}), flushing queue and running delta catch-up...`);
        console.log('[Sync] Status before foreground flush:', syncManager.getStatus());
        syncManager.syncPendingOperations().then(() => {
          console.log('[Sync] Status after foreground flush:', syncManager.getStatus());
          const { pendingCount } = syncManager.getStatus();
          if (pendingCount > 0) {
            console.log('[Sync] Foreground catch-up deferred because queue still has pending operations');
            return;
          }
          return Promise.all([
            loadProductChanges(),
            loadCustomerChanges(),
            loadTransactions(),
          ]);
        }).catch((error) => {
          console.error(`[Sync] Foreground catch-up failed (${source}):`, error);
        });
      }, 500);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        triggerForegroundSync('visibilitychange');
      }
    };

    const handleWindowFocus = () => {
      triggerForegroundSync('focus');
    };

    const handlePageShow = () => {
      triggerForegroundSync('pageshow');
    };

    let hasSeenConnectionStatus = false;
    let wasConnectionReady = false;
    const unsubscribeConnection = connectionStatus.subscribe((status) => {
      const isConnectionReady = status.isOnline && status.isSupabaseConnected;

      if (!hasSeenConnectionStatus) {
        hasSeenConnectionStatus = true;
        wasConnectionReady = isConnectionReady;
        return;
      }

      if (!wasConnectionReady && isConnectionReady) {
        triggerForegroundSync('reconnect');
      }

      wasConnectionReady = isConnectionReady;
    });

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
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      unsubscribeConnection();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [
    isAuthenticated,
    isOfflineMode,
    loadProductChanges,
    loadCustomerChanges,
    loadTransactions,
  ]);

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
