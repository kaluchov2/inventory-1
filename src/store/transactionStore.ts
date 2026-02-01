import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Transaction, TransactionItem, PaymentMethod, TransactionType } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { transactionService } from '../services/transactionService';
import { supabase } from '../lib/supabase';

interface TransactionFilters {
  dateFrom: string;
  dateTo: string;
  customerId: string;
  paymentMethod: PaymentMethod | '';
  type: TransactionType | '';
}

interface TransactionStore {
  transactions: Transaction[];
  filters: TransactionFilters;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addTransaction: (transaction: Omit<Transaction, 'id' | 'createdAt'>) => Transaction;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  setFilters: (filters: Partial<TransactionFilters>) => void;
  clearFilters: () => void;
  importTransactions: (transactions: Transaction[]) => void;

  // Sync actions
  loadFromSupabase: () => Promise<void>;
  handleRealtimeUpdate: (transaction: any) => void;
  handleRealtimeDelete: (transaction: any) => void;

  // Selectors
  getFilteredTransactions: () => Transaction[];
  getTransactionById: (id: string) => Transaction | undefined;
  getTransactionsByCustomer: (customerId: string) => Transaction[];
  getTodaySales: () => { cash: number; transfer: number; card: number; total: number };
  getSalesByDateRange: (from: string, to: string) => Transaction[];
  getTotalSalesByCategory: () => Record<string, number>;
}

const defaultFilters: TransactionFilters = {
  dateFrom: '',
  dateTo: '',
  customerId: '',
  paymentMethod: '',
  type: '',
};

export const useTransactionStore = create<TransactionStore>()(
  persist(
    (set, get) => ({
      transactions: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addTransaction: (transactionData) => {
        const now = getCurrentISODate();
        const newTransaction: Transaction = {
          ...transactionData,
          id: generateId(),
          createdAt: now,
        };

        set((state) => ({
          transactions: [...state.transactions, newTransaction],
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'transactions',
            action: 'create',
            data: newTransaction,
          });
        }

        return newTransaction;
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

      handleRealtimeUpdate: (dbTransaction) => {
        const converted = convertDbTransaction(dbTransaction);
        const local = get().transactions.find(t => t.id === converted.id);

        if (!local || new Date(converted.createdAt) > new Date(local.createdAt)) {
          set((state) => ({
            transactions: state.transactions.some(t => t.id === converted.id)
              ? state.transactions.map(t => t.id === converted.id ? converted : t)
              : [...state.transactions, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbTransaction) => {
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
          (t) => t.type === 'sale' && t.date.startsWith(today)
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
          (t) => t.type === 'sale' && t.date >= from && t.date <= to
        );
      },

      getTotalSalesByCategory: () => {
        const sales = get().transactions.filter((t) => t.type === 'sale');
        const categoryTotals: Record<string, number> = {};

        sales.forEach((sale) => {
          sale.items.forEach((item) => {
            if (item.category) {
              categoryTotals[item.category] = (categoryTotals[item.category] || 0) + item.totalPrice;
            }
          });
        });

        return categoryTotals;
      },
    }),
    {
      name: 'inventory_transactions',
    }
  )
);

function convertDbTransaction(dbTransaction: any): Transaction {
  return {
    id: dbTransaction.id,
    customerId: dbTransaction.customer_id || undefined,
    customerName: dbTransaction.customer_name,
    items: [], // Items are fetched separately in service
    subtotal: dbTransaction.subtotal,
    discount: dbTransaction.discount,
    discountNote: dbTransaction.discount_note || undefined,
    total: dbTransaction.total,
    paymentMethod: dbTransaction.payment_method,
    cashAmount: dbTransaction.cash_amount,
    transferAmount: dbTransaction.transfer_amount,
    cardAmount: dbTransaction.card_amount,
    actualCardAmount: dbTransaction.actual_card_amount || undefined,
    isInstallment: dbTransaction.is_installment,
    installmentAmount: dbTransaction.installment_amount || undefined,
    remainingBalance: dbTransaction.remaining_balance || undefined,
    upsBatch: dbTransaction.ups_batch || undefined,
    notes: dbTransaction.notes || undefined,
    date: dbTransaction.date,
    paymentDate: dbTransaction.payment_date || undefined,
    type: dbTransaction.type,
    createdAt: dbTransaction.created_at,
  };
}

function mergeTransactions(local: Transaction[], remote: Transaction[]): Transaction[] {
  const remoteMap = new Map(remote.map(t => [t.id, t]));
  const localMap = new Map(local.map(t => [t.id, t]));
  const merged = new Map<string, Transaction>();

  for (const [id, localTrans] of localMap) {
    const remoteTrans = remoteMap.get(id);
    if (!remoteTrans) {
      merged.set(id, localTrans);
    } else {
      const localTime = new Date(localTrans.createdAt).getTime();
      const remoteTime = new Date(remoteTrans.createdAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteTrans : localTrans);
    }
  }

  for (const [id, remoteTrans] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteTrans);
    }
  }

  return Array.from(merged.values());
}

// Helper function to create a sale transaction
export const createSaleTransaction = (
  customerInfo: { id?: string; name: string },
  items: TransactionItem[],
  payment: {
    method: PaymentMethod;
    cash: number;
    transfer: number;
    card: number;
    actualCard?: number;
  },
  options?: {
    discount?: number;
    discountNote?: string;
    notes?: string;
    isInstallment?: boolean;
  }
): Omit<Transaction, 'id' | 'createdAt'> => {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = options?.discount || 0;
  const total = subtotal - discount;

  return {
    customerId: customerInfo.id,
    customerName: customerInfo.name,
    items,
    subtotal,
    discount,
    discountNote: options?.discountNote,
    total,
    paymentMethod: payment.method,
    cashAmount: payment.cash,
    transferAmount: payment.transfer,
    cardAmount: payment.card,
    actualCardAmount: payment.actualCard,
    isInstallment: options?.isInstallment || false,
    notes: options?.notes,
    date: getCurrentISODate(),
    type: 'sale',
  };
};
