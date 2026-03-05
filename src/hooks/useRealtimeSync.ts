import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';

/**
 * useRealtimeSync — Supabase Realtime subscription hook
 *
 * ## What triggers realtime events?
 * Supabase emits `postgres_changes` events whenever a row is INSERTed, UPDATEd,
 * or DELETEd in the watched table. In this app the trigger is:
 *   syncManager.syncPendingOperations() → upserts rows in Supabase →
 *   Supabase broadcasts the change to all connected clients on the same channel.
 *
 * ## What happens on receipt?
 * The per-event callbacks (onInsert / onUpdate / onDelete) are called immediately
 * with the changed record. SyncInitializer routes these directly to the store's
 * incremental handlers (handleRealtimeUpdate / handleRealtimeDelete), so only
 * the affected record is updated in local state — no full reload needed.
 *
 * ## Channel lifecycle
 * The channel is created on mount and removed on unmount (React cleanup).
 * The subscription is re-established whenever isAuthenticated or isOfflineMode
 * changes (e.g. login / logout / going offline).
 */

type TableName = 'products' | 'customers' | 'transactions';

interface RealtimeSyncOptions {
  table: TableName;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
}

export function useRealtimeSync({
  table,
  onInsert,
  onUpdate,
  onDelete,
}: RealtimeSyncOptions) {
  const { isAuthenticated, isOfflineMode } = useAuthStore();

  useEffect(() => {
    if (!supabase || !isAuthenticated || isOfflineMode) {
      return;
    }

    const channel = supabase!
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
        },
        (payload) => {
          console.log(`[Realtime] ${table} INSERT:`, payload.new);
          onInsert?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
        },
        (payload) => {
          console.log(`[Realtime] ${table} UPDATE:`, payload.new);
          onUpdate?.(payload.new);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
        },
        (payload) => {
          console.log(`[Realtime] ${table} DELETE:`, payload.old);
          onDelete?.(payload.old);
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] ${table} subscription status:`, status);
      });

    return () => {
      console.log(`[Realtime] Unsubscribing from ${table}`);
      supabase!.removeChannel(channel);
    };
  }, [table, onInsert, onUpdate, onDelete, isAuthenticated, isOfflineMode]);
}

type RealtimeCallbacks = {
  onInsert?: (record: any) => void;
  onUpdate?: (record: any) => void;
  onDelete?: (record: any) => void;
};

export function useRealtimeProducts(callbacks: RealtimeCallbacks) {
  useRealtimeSync({ table: 'products', ...callbacks });
}

export function useRealtimeCustomers(callbacks: RealtimeCallbacks) {
  useRealtimeSync({ table: 'customers', ...callbacks });
}

export function useRealtimeTransactions(callbacks: RealtimeCallbacks) {
  useRealtimeSync({ table: 'transactions', ...callbacks });
}
