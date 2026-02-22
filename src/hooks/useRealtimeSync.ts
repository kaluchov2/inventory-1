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
 * The callback passed to useRealtimeProducts / useRealtimeCustomers /
 * useRealtimeTransactions is called immediately. SyncInitializer wraps these
 * callbacks in a 2-second debounce before calling loadFromSupabase(), so
 * rapid back-to-back events don't cause multiple concurrent reloads.
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

export function useRealtimeProducts(onUpdate: () => void) {
  useRealtimeSync({
    table: 'products',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate,
  });
}

export function useRealtimeCustomers(onUpdate: () => void) {
  useRealtimeSync({
    table: 'customers',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate,
  });
}

export function useRealtimeTransactions(onUpdate: () => void) {
  useRealtimeSync({
    table: 'transactions',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate,
  });
}
