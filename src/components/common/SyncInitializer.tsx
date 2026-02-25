import { useEffect, useRef, useCallback } from 'react';
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
 * When another user saves data, Supabase emits a `postgres_changes` event.
 * Each table listener (products / customers / transactions) receives the event
 * and schedules a full reload with a **2-second debounce**.
 *
 * Why 2 seconds?
 *   - A single business action (e.g. a sale) touches multiple tables sequentially.
 *     Without debouncing, each individual write would trigger a separate reload,
 *     causing 3+ rapid full reloads. The 2s window collapses them into one.
 *   - It also provides a small buffer so Supabase replication is fully settled
 *     before we query it back.
 *
 * End-to-end timing for other users to see a change on their Products page:
 *   Best case  ~3–4s  — queue flushed immediately + realtime + 2s debounce
 *   Typical   ~7–8s  — queue waited partway through the 10s sync interval
 *   Worst case ~13–15s — 10s timer just reset when the sale happened
 */
export function SyncInitializer() {
  const { isAuthenticated, isOfflineMode } = useAuthStore();
  const loadProducts = useProductStore((state) => state.loadFromSupabase);
  const loadCustomers = useCustomerStore((state) => state.loadFromSupabase);
  const loadTransactions = useTransactionStore((state) => state.loadFromSupabase);

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

  // Debounce timers — one per table.
  // Each realtime event resets its timer so that rapid consecutive events
  // (e.g. a sale updating products + transactions in quick succession)
  // collapse into a single reload after 2 seconds of silence.
  const productReloadTimer = useRef<ReturnType<typeof setTimeout>>();
  const customerReloadTimer = useRef<ReturnType<typeof setTimeout>>();
  const transactionReloadTimer = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup timeout refs on unmount
  useEffect(() => {
    return () => {
      clearTimeout(productReloadTimer.current);
      clearTimeout(customerReloadTimer.current);
      clearTimeout(transactionReloadTimer.current);
    };
  }, []);

  // Wrap realtime callbacks in useCallback
  const handleProductChange = useCallback(() => {
    if (isAuthenticated && !isOfflineMode) {
      clearTimeout(productReloadTimer.current);
      productReloadTimer.current = setTimeout(() => {
        console.log('[Realtime] Products changed, reloading (debounced)...');
        loadProducts();
      }, 2000);
    }
  }, [isAuthenticated, isOfflineMode, loadProducts]);

  const handleCustomerChange = useCallback(() => {
    if (isAuthenticated && !isOfflineMode) {
      clearTimeout(customerReloadTimer.current);
      customerReloadTimer.current = setTimeout(() => {
        console.log('[Realtime] Customers changed, reloading (debounced)...');
        loadCustomers();
      }, 2000);
    }
  }, [isAuthenticated, isOfflineMode, loadCustomers]);

  const handleTransactionChange = useCallback(() => {
    if (isAuthenticated && !isOfflineMode) {
      clearTimeout(transactionReloadTimer.current);
      transactionReloadTimer.current = setTimeout(() => {
        console.log('[Realtime] Transactions changed, reloading (debounced)...');
        loadTransactions();
      }, 2000);
    }
  }, [isAuthenticated, isOfflineMode, loadTransactions]);

  // Subscribe to real-time updates (debounced to prevent race conditions)
  useRealtimeProducts(handleProductChange);
  useRealtimeCustomers(handleCustomerChange);
  useRealtimeTransactions(handleTransactionChange);

  return null; // This component doesn't render anything
}
