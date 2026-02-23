import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Customer } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { customerService } from '../services/customerService';
import { supabase } from '../lib/supabase';

interface CustomerStore {
  customers: Customer[];
  searchQuery: string;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addCustomer: (customer: Omit<Customer, 'id' | 'balance' | 'totalPurchases' | 'createdAt' | 'updatedAt'>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  updateBalance: (id: string, amount: number) => void;
  addPurchase: (id: string, amount: number) => void;
  receivePayment: (id: string, amount: number) => void;
  setSearchQuery: (query: string) => void;
  importCustomers: (customers: Customer[]) => void;

  // Sync actions
  loadFromSupabase: () => Promise<void>;
  handleRealtimeUpdate: (customer: any) => void;
  handleRealtimeDelete: (customer: any) => void;

  // Selectors
  getFilteredCustomers: () => Customer[];
  getCustomerById: (id: string) => Customer | undefined;
  getCustomerByName: (name: string) => Customer | undefined;
  getCustomersWithBalance: () => Customer[];
  getTotalOutstandingBalance: () => number;
}

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set, get) => ({
      customers: [],
      searchQuery: '',
      isLoading: false,
      lastSync: null,

      addCustomer: (customerData) => {
        const now = getCurrentISODate();
        const newCustomer: Customer = {
          ...customerData,
          id: generateId(),
          balance: 0,
          totalPurchases: 0,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          customers: [...state.customers, newCustomer],
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'customers',
            action: 'create',
            data: newCustomer,
          });
        }

        return newCustomer;
      },

      updateCustomer: (id, updates) => {
        const customer = get().customers.find(c => c.id === id);
        if (!customer) return;

        const updated = { ...customer, ...updates, updatedAt: getCurrentISODate() };

        set((state) => ({
          customers: state.customers.map((c) =>
            c.id === id ? updated : c
          ),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'customers',
            action: 'update',
            data: updated,
          });
        }
      },

      deleteCustomer: (id) => {
        const customer = get().customers.find(c => c.id === id);
        if (!customer) return;

        set((state) => ({
          customers: state.customers.filter((c) => c.id !== id),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'customers',
            action: 'delete',
            data: { id },
          });
        }
      },

      updateBalance: (id, amount) => {
        get().updateCustomer(id, { balance: (get().customers.find(c => c.id === id)?.balance || 0) + amount });
      },

      addPurchase: (id, amount) => {
        const customer = get().customers.find(c => c.id === id);
        if (!customer) return;

        get().updateCustomer(id, {
          balance: customer.balance + amount,
          totalPurchases: customer.totalPurchases + amount,
        });
      },

      receivePayment: (id, amount) => {
        const customer = get().customers.find(c => c.id === id);
        if (!customer) return;

        get().updateCustomer(id, {
          balance: Math.max(0, customer.balance - amount),
        });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query });
      },

      importCustomers: (customers) => {
        set({ customers });
      },

      loadFromSupabase: async () => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const customers = await customerService.getAll();
          const local = get().customers;
          const merged = mergeCustomers(local, customers);

          set({ customers: merged, lastSync: new Date(), isLoading: false });
        } catch (error) {
          console.error('Failed to load customers from Supabase:', error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbCustomer) => {
        const converted = convertDbCustomer(dbCustomer);
        const local = get().customers.find(c => c.id === converted.id);

        if (!local || new Date(converted.updatedAt) > new Date(local.updatedAt)) {
          set((state) => ({
            customers: state.customers.some(c => c.id === converted.id)
              ? state.customers.map(c => c.id === converted.id ? converted : c)
              : [...state.customers, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbCustomer) => {
        if (dbCustomer.is_deleted) {
          set((state) => ({
            customers: state.customers.filter(c => c.id !== dbCustomer.id),
          }));
        }
      },

      getFilteredCustomers: () => {
        const { customers, searchQuery } = get();
        if (!searchQuery) return customers;

        const queryLower = searchQuery.toLowerCase();
        return customers.filter(
          (c) =>
            c.name.toLowerCase().includes(queryLower) ||
            (c.phone && c.phone.includes(queryLower)) ||
            (c.email && c.email.toLowerCase().includes(queryLower))
        );
      },

      getCustomerById: (id) => {
        return get().customers.find((c) => c.id === id);
      },

      getCustomerByName: (name) => {
        const nameLower = name.toLowerCase();
        return get().customers.find((c) => c.name.toLowerCase() === nameLower);
      },

      getCustomersWithBalance: () => {
        return get().customers.filter((c) => c.balance > 0);
      },

      getTotalOutstandingBalance: () => {
        return get().customers.reduce((sum, c) => sum + c.balance, 0);
      },
    }),
    {
      name: 'inventory_customers',
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('[Storage] localStorage write failed for customers, data lives in memory only');
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

function convertDbCustomer(dbCustomer: any): Customer {
  return {
    id: dbCustomer.id,
    name: dbCustomer.name,
    phone: dbCustomer.phone || undefined,
    email: dbCustomer.email || undefined,
    balance: dbCustomer.balance,
    totalPurchases: dbCustomer.total_purchases,
    createdAt: dbCustomer.created_at,
    updatedAt: dbCustomer.updated_at,
  };
}

function mergeCustomers(local: Customer[], remote: Customer[]): Customer[] {
  const { syncQueue } = require('../lib/syncQueue');

  const remoteMap = new Map(remote.map(c => [c.id, c]));
  const localMap = new Map(local.map(c => [c.id, c]));
  const merged = new Map<string, Customer>();

  for (const [id, localCust] of localMap) {
    const remoteCust = remoteMap.get(id);
    if (!remoteCust) {
      merged.set(id, localCust);
    } else {
      const localTime = new Date(localCust.updatedAt).getTime();
      const remoteTime = new Date(remoteCust.updatedAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteCust : localCust);
    }
  }

  for (const [id, remoteCust] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteCust);
    }
  }

  // Remove local-only records that aren't pending in the sync queue
  // These are ghost records from localStorage that were deleted on the server
  const pendingIds = new Set(
    syncQueue.getAll()
      .filter((op: any) => op.type === 'customers' && (op.action === 'create' || op.action === 'update'))
      .map((op: any) => op.data?.id)
      .filter(Boolean)
  );

  for (const [id] of merged) {
    if (!remoteMap.has(id) && !pendingIds.has(id)) {
      merged.delete(id);
    }
  }

  return Array.from(merged.values());
}
