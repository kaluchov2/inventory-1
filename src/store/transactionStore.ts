import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Transaction, PaymentMethod, TransactionType } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { transactionService } from '../services/transactionService';
import { supabase } from '../lib/supabase';
import { syncQueue } from '../lib/syncQueue';
import { SaleSyncPayload, syncRecordedSale } from '../lib/saleSync';
import { getEffectiveSalePendingMap } from '../utils/saleEditPricing';
import { createRealtimeRefreshGate } from '../utils/realtimeRefreshGate';
export { createSaleTransaction } from '../utils/transactionHelpers';

interface TransactionFilters {
  dateFrom: string;
  dateTo: string;
  customerId: string;
  paymentMethod: PaymentMethod | '';
  type: TransactionType | '';
}

export interface TransactionStore {
  transactions: Transaction[];
  filters: TransactionFilters;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addTransaction: (
    transaction: Omit<Transaction, 'id' | 'createdAt'>,
    options?: { skipSync?: boolean; presetId?: string; presetCreatedAt?: string },
  ) => Transaction;
  queueSaleSync: (payload: SaleSyncPayload) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  setFilters: (filters: Partial<TransactionFilters>) => void;
  clearFilters: () => void;
  importTransactions: (transactions: Transaction[]) => void;

  // Sync actions
  loadFromSupabase: () => Promise<void>;
  refreshTransactionFromSupabase: (id: string, realtimeGeneration?: number) => Promise<void>;
  handleRealtimeUpdate: (transaction: any) => void;
  handleRealtimeDelete: (transaction: any) => void;

  // Selectors
  getFilteredTransactions: () => Transaction[];
  getTransactionById: (id: string) => Transaction | undefined;
  getTransactionsByCustomer: (customerId: string) => Transaction[];
  getTodaySales: () => { cash: number; transfer: number; card: number; total: number };
  getSalesByDateRange: (from: string, to: string) => Transaction[];
  getTotalSalesByCategory: () => Record<string, number>;
  getUnpaidTransactionsByCustomer: (customerId: string) => Transaction[];
  getEffectivePendingMap: (customerId: string) => Map<string, number>;
}

const defaultFilters: TransactionFilters = {
  dateFrom: '',
  dateTo: '',
  customerId: '',
  paymentMethod: '',
  type: '',
};

const realtimeRefreshGate = createRealtimeRefreshGate(50);

export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addTransaction: (transactionData, options) => {
        const now = options?.presetCreatedAt || getCurrentISODate();
        const newTransaction: Transaction = {
          ...transactionData,
          id: options?.presetId || generateId(),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          transactions: [...state.transactions, newTransaction],
        }));

        if (supabase && !options?.skipSync) {
          try {
            syncManager.queueOperation({
              type: 'transactions',
              action: 'create',
              data: newTransaction,
            });
          } catch (queueError) {
            console.warn('[Store] Transaction queue failed (localStorage quota?), attempting direct sync:', queueError);
            const { items, ...txBody } = newTransaction;
            const dbTransaction = {
              id: txBody.id,
              customer_id: txBody.customerId || null,
              customer_name: txBody.customerName,
              subtotal: txBody.subtotal,
              discount: txBody.discount,
              discount_note: txBody.discountNote || null,
              total: txBody.total,
              payment_method: txBody.paymentMethod,
              cash_amount: txBody.cashAmount,
              transfer_amount: txBody.transferAmount,
              card_amount: txBody.cardAmount,
              actual_card_amount: txBody.actualCardAmount || null,
              is_installment: txBody.isInstallment,
              installment_amount: txBody.installmentAmount || null,
              remaining_balance: txBody.remainingBalance || null,
              sold_by: txBody.soldBy || null,
              ups_batch: txBody.upsBatch || null,
              notes: txBody.notes || null,
              date: txBody.date,
              payment_date: txBody.paymentDate || null,
              type: txBody.type,
              created_at: txBody.createdAt,
              updated_at: txBody.updatedAt || txBody.createdAt,
              is_deleted: false,
            };
            // Await the fallback so failures are visible — not fire-and-forget
            (async () => {
              const { error } = await supabase!
                .from('transactions')
                .upsert(dbTransaction, { onConflict: 'id' });
              if (error) {
                console.error('[Store] Direct transaction sync failed — recording in dead-letter:', error);
                syncManager.addToDeadLetter({ type: 'transactions', action: 'create', data: newTransaction });
                return;
              }
              if (items && items.length > 0) {
                const itemsData = items.map((item) => ({
                  transaction_id: txBody.id,
                  product_id: item.productId,
                  product_name: item.productName,
                  quantity: item.quantity,
                  unit_price: item.unitPrice,
                  total_price: item.totalPrice,
                  sat_key_id: item.satKeyId || null,
                  sat_key_code: item.satKeyCode || null,
                  sat_key_description: item.satKeyDescription || null,
                  category: item.category,
                  brand: item.brand,
                  color: item.color,
                  size: item.size,
                }));
                const { error: itemsError } = await supabase!
                  .from('transaction_items')
                  .insert(itemsData);
                if (itemsError) {
                  console.error('[Store] Direct transaction items sync failed — recording in dead-letter:', itemsError);
                  syncManager.addToDeadLetter({ type: 'transactions', action: 'create', data: newTransaction });
                }
              }
            })();
          }
        }

        return newTransaction;
      },

      queueSaleSync: (payload) => {
        if (!supabase) return;

        console.log('[TransactionStore.queueSaleSync] Queueing sale sync payload', {
          transactionId: payload.transaction.id,
          items: payload.transaction.items.length,
          productsToSync: payload.products.length,
          hasCustomerSnapshot: !!payload.customer,
        });

        try {
          const operationId = syncManager.queueOperation({
            type: 'transactions',
            action: 'record_sale',
            data: payload,
          });
          console.log('[TransactionStore.queueSaleSync] record_sale operation queued', {
            operationId,
            transactionId: payload.transaction.id,
          });
        } catch (queueError) {
          console.warn('[Store] Sale queue failed (localStorage quota?), attempting direct sale sync:', queueError);
          (async () => {
            console.log('[TransactionStore.queueSaleSync] Falling back to direct sale sync', {
              transactionId: payload.transaction.id,
            });
            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 45_000);
              const startedAt = Date.now();
              try {
                await syncRecordedSale(payload, controller.signal);
                console.log('[TransactionStore.queueSaleSync] Direct sale sync fallback succeeded', {
                  transactionId: payload.transaction.id,
                  elapsedMs: Date.now() - startedAt,
                });
              } finally {
                clearTimeout(timer);
              }
            } catch (error) {
              console.error('[Store] Direct sale sync failed — recording in dead-letter:', error);
              syncManager.addToDeadLetter({
                type: 'transactions',
                action: 'record_sale',
                data: payload,
              });
            }
          })();
        }
      },

      updateTransaction: (id, updates) => {
        const transaction = get().transactions.find(t => t.id === id);
        if (!transaction) return;

        const updated = { ...transaction, ...updates };

        set((state) => ({
          transactions: state.transactions.map((t) =>
            t.id === id ? updated : t
          ),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'transactions',
            action: 'update',
            data: updated,
          });
        }
      },

      deleteTransaction: (id) => {
        const transaction = get().transactions.find(t => t.id === id);
        if (!transaction) return;

        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'transactions',
            action: 'delete',
            data: { id },
          });
        }
      },

      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        }));
      },

      clearFilters: () => {
        set({ filters: defaultFilters });
      },

      importTransactions: (transactions) => {
        set({ transactions });
      },

      loadFromSupabase: async () => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const transactions = await transactionService.getAll();
          const local = get().transactions;
          const merged = mergeTransactions(local, transactions);

          set({ transactions: merged, lastSync: new Date(), isLoading: false });
        } catch (error) {
          console.error('Failed to load transactions from Supabase:', error);
          set({ isLoading: false });
        }
      },

      refreshTransactionFromSupabase: async (id, realtimeGeneration) => {
        if (!supabase || !id) return;
        if (realtimeGeneration !== undefined && !realtimeRefreshGate.isCurrent(id, realtimeGeneration)) return;
        try {
          const transaction = await transactionService.getById(id);
          if (realtimeGeneration !== undefined && !realtimeRefreshGate.isCurrent(id, realtimeGeneration)) return;
          set((state) => ({
            transactions: transaction
              ? state.transactions.some((item) => item.id === id)
                ? state.transactions.map((item) => item.id === id ? transaction : item)
                : [...state.transactions, transaction]
              : state.transactions.filter((item) => item.id !== id),
          }));
        } catch (error) {
          console.error(`[Realtime] Failed to rehydrate transaction ${id}:`, error);
        }
      },

      handleRealtimeUpdate: (dbTransaction) => {
        if (dbTransaction.is_deleted) {
          realtimeRefreshGate.invalidate(dbTransaction.id);
          set((state) => ({
            transactions: state.transactions.filter((t) => t.id !== dbTransaction.id),
          }));
          return;
        }
        const localTransaction = get().transactions.find((transaction) => transaction.id === dbTransaction.id);
        if (
          localTransaction?.updatedAt &&
          dbTransaction.updated_at &&
          new Date(localTransaction.updatedAt).getTime() >= new Date(dbTransaction.updated_at).getTime()
        ) {
          return;
        }
        // Realtime only includes the transactions row. Re-fetch by id so notes,
        // totals and the complete transaction_items snapshots arrive together.
        // Bursts for one sale are coalesced and stale HTTP responses are discarded.
        realtimeRefreshGate.schedule(dbTransaction.id, (generation) => {
          void get().refreshTransactionFromSupabase(dbTransaction.id, generation);
        });
      },

      handleRealtimeDelete: (dbTransaction) => {
        realtimeRefreshGate.invalidate(dbTransaction.id);
        if (dbTransaction.is_deleted) {
          set((state) => ({
            transactions: state.transactions.filter(t => t.id !== dbTransaction.id),
          }));
        }
      },

      getFilteredTransactions: () => {
        const { transactions, filters } = get();
        let filtered = [...transactions];

        if (filters.dateFrom) {
          filtered = filtered.filter((t) => t.date >= filters.dateFrom);
        }

        if (filters.dateTo) {
          filtered = filtered.filter((t) => t.date <= filters.dateTo);
        }

        if (filters.customerId) {
          filtered = filtered.filter((t) => t.customerId === filters.customerId);
        }

        if (filters.paymentMethod) {
          filtered = filtered.filter((t) => t.paymentMethod === filters.paymentMethod);
        }

        if (filters.type) {
          filtered = filtered.filter((t) => t.type === filters.type);
        }

        return filtered.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      },

      getTransactionById: (id) => {
        return get().transactions.find((t) => t.id === id);
      },

      getTransactionsByCustomer: (customerId) => {
        return get().transactions
          .filter((t) => t.customerId === customerId)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      },

      getTodaySales: () => {
        const today = new Date().toISOString().split('T')[0];
        const todayTransactions = get().transactions.filter(
          (t) => (t.type === 'sale' || t.type === 'return') && t.date.startsWith(today)
        );

        return {
          cash: todayTransactions.reduce((sum, t) => sum + t.cashAmount, 0),
          transfer: todayTransactions.reduce((sum, t) => sum + t.transferAmount, 0),
          card: todayTransactions.reduce((sum, t) => sum + t.cardAmount, 0),
          total: todayTransactions.reduce((sum, t) => sum + t.total, 0),
        };
      },

      getSalesByDateRange: (from, to) => {
        return get().transactions.filter(
          (t) => (t.type === 'sale' || t.type === 'return') && t.date >= from && t.date <= to
        );
      },

      getTotalSalesByCategory: () => {
        const transactions = get().transactions.filter(
          (t) => t.type === 'sale' || t.type === 'return'
        );
        const categoryTotals: Record<string, number> = {};

        transactions.forEach((transaction) => {
          const direction = transaction.type === 'return' ? -1 : 1;
          transaction.items.forEach((item) => {
            if (item.category) {
              categoryTotals[item.category] =
                (categoryTotals[item.category] || 0) + item.totalPrice * direction;
            }
          });
        });

        return categoryTotals;
      },

      getUnpaidTransactionsByCustomer: (customerId: string) => {
        const pendingMap = get().getEffectivePendingMap(customerId);
        return get().transactions.filter(t =>
          t.customerId === customerId &&
          t.type === 'sale' &&
          (pendingMap.get(t.id) ?? 0) > 0.01
        ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      },

      getEffectivePendingMap: (customerId: string) => {
        return getEffectiveSalePendingMap(get().transactions, customerId);
      },
    }),
    {
      name: 'inventory_transactions',
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('[Storage] localStorage write failed for transactions, data lives in memory only');
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

function mergeTransactions(local: Transaction[], remote: Transaction[]): Transaction[] {
  const remoteMap = new Map(remote.map(t => [t.id, t]));
  const localMap = new Map(local.map(t => [t.id, t]));
  const merged = new Map<string, Transaction>();
  const pendingIds = new Set(
    syncQueue.getAll()
      .filter((op: any) => op.type === 'transactions' && (op.action === 'create' || op.action === 'update' || op.action === 'record_sale'))
      .map((op: any) => op.action === 'record_sale' ? op.data?.transaction?.id : op.data?.id)
      .filter(Boolean)
  );

  for (const [id, localTrans] of localMap) {
    const remoteTrans = remoteMap.get(id);
    if (!remoteTrans) {
      merged.set(id, localTrans);
    } else {
      // Server is source of truth unless this transaction still has a pending local mutation.
      merged.set(id, pendingIds.has(id) ? localTrans : remoteTrans);
    }
  }

  for (const [id, remoteTrans] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteTrans);
    }
  }

  // Remove local-only records that aren't pending in the sync queue
  // These are ghost records from localStorage that were deleted on the server
  for (const [id] of merged) {
    if (!remoteMap.has(id) && !pendingIds.has(id)) {
      merged.delete(id);
    }
  }

  return Array.from(merged.values());
}

