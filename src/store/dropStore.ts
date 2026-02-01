import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Drop, DropStatus } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { dropService } from '../services/dropService';
import { supabase } from '../lib/supabase';

interface DropFilters {
  search: string;
  status: DropStatus | '';
}

interface DropStore {
  drops: Drop[];
  filters: DropFilters;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addDrop: (drop: Omit<Drop, 'id' | 'createdAt' | 'updatedAt' | 'totalProducts' | 'totalUnits' | 'totalValue' | 'soldCount' | 'availableCount'>) => Drop;
  updateDrop: (id: string, updates: Partial<Drop>) => void;
  deleteDrop: (id: string) => void;
  setFilters: (filters: Partial<DropFilters>) => void;
  clearFilters: () => void;

  // Stats update (called when products change)
  updateDropStats: (dropNumber: string, stats: {
    totalProducts?: number;
    totalUnits?: number;
    totalValue?: number;
    soldCount?: number;
    availableCount?: number;
  }) => void;

  // Sync actions
  loadFromSupabase: () => Promise<void>;
  handleRealtimeUpdate: (drop: any) => void;
  handleRealtimeDelete: (drop: any) => void;

  // Selectors
  getDropByNumber: (dropNumber: string) => Drop | undefined;
  getDropById: (id: string) => Drop | undefined;
  getActiveDrops: () => Drop[];
  getFilteredDrops: () => Drop[];
  getDropStats: (dropNumber: string) => {
    totalProducts: number;
    totalUnits: number;
    totalValue: number;
    soldCount: number;
    availableCount: number;
  } | null;
}

const defaultFilters: DropFilters = {
  search: '',
  status: '',
};

export const useDropStore = create<DropStore>()(
  persist(
    (set, get) => ({
      drops: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addDrop: (dropData) => {
        const now = getCurrentISODate();
        const newDrop: Drop = {
          ...dropData,
          id: generateId(),
          totalProducts: 0,
          totalUnits: 0,
          totalValue: 0,
          soldCount: 0,
          availableCount: 0,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          drops: [...state.drops, newDrop],
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'drops',
            action: 'create',
            data: newDrop,
          });
        }

        return newDrop;
      },

      updateDrop: (id, updates) => {
        const drop = get().drops.find(d => d.id === id);
        if (!drop) return;

        const updatedDrop = { ...drop, ...updates, updatedAt: getCurrentISODate() };

        set((state) => ({
          drops: state.drops.map((d) =>
            d.id === id ? updatedDrop : d
          ),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'drops',
            action: 'update',
            data: updatedDrop,
          });
        }
      },

      deleteDrop: (id) => {
        const drop = get().drops.find(d => d.id === id);
        if (!drop) return;

        set((state) => ({
          drops: state.drops.filter((d) => d.id !== id),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'drops',
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

      updateDropStats: (dropNumber, stats) => {
        const drop = get().drops.find(d => d.dropNumber === dropNumber);
        if (!drop) return;

        const updatedDrop = {
          ...drop,
          ...stats,
          updatedAt: getCurrentISODate(),
        };

        set((state) => ({
          drops: state.drops.map((d) =>
            d.dropNumber === dropNumber ? updatedDrop : d
          ),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'drops',
            action: 'update',
            data: updatedDrop,
          });
        }
      },

      loadFromSupabase: async () => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const drops = await dropService.getAll();

          // Merge with local drops using last-write-wins
          const localDrops = get().drops;
          const merged = mergeDrops(localDrops, drops);

          set({ drops: merged, lastSync: new Date(), isLoading: false });
        } catch (error) {
          console.error('Failed to load drops from Supabase:', error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbDrop) => {
        const converted = convertDbDrop(dbDrop);
        const local = get().drops.find(d => d.id === converted.id);

        // Only update if remote is newer (last-write-wins)
        if (!local || new Date(converted.updatedAt) > new Date(local.updatedAt)) {
          set((state) => ({
            drops: state.drops.some(d => d.id === converted.id)
              ? state.drops.map(d => d.id === converted.id ? converted : d)
              : [...state.drops, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbDrop) => {
        if (dbDrop.is_deleted) {
          set((state) => ({
            drops: state.drops.filter(d => d.id !== dbDrop.id),
          }));
        }
      },

      getDropByNumber: (dropNumber) => {
        return get().drops.find(d => d.dropNumber === dropNumber);
      },

      getDropById: (id) => {
        return get().drops.find(d => d.id === id);
      },

      getActiveDrops: () => {
        return get().drops.filter(d => d.status === 'active');
      },

      getFilteredDrops: () => {
        const { drops, filters } = get();
        let filtered = [...drops];

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(
            (d) =>
              d.dropNumber.toLowerCase().includes(searchLower) ||
              (d.notes && d.notes.toLowerCase().includes(searchLower))
          );
        }

        if (filters.status) {
          filtered = filtered.filter((d) => d.status === filters.status);
        }

        // Sort by arrival date descending
        return filtered.sort(
          (a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime()
        );
      },

      getDropStats: (dropNumber) => {
        const drop = get().drops.find(d => d.dropNumber === dropNumber);
        if (!drop) return null;

        return {
          totalProducts: drop.totalProducts,
          totalUnits: drop.totalUnits,
          totalValue: drop.totalValue,
          soldCount: drop.soldCount,
          availableCount: drop.availableCount,
        };
      },
    }),
    {
      name: 'inventory_drops',
    }
  )
);

// Helper functions
function convertDbDrop(dbDrop: any): Drop {
  return {
    id: dbDrop.id,
    dropNumber: dbDrop.drop_number,
    arrivalDate: dbDrop.arrival_date,
    status: dbDrop.status,
    totalProducts: dbDrop.total_products,
    totalUnits: dbDrop.total_units,
    totalValue: dbDrop.total_value,
    soldCount: dbDrop.sold_count,
    availableCount: dbDrop.available_count,
    notes: dbDrop.notes || undefined,
    createdAt: dbDrop.created_at,
    updatedAt: dbDrop.updated_at,
  };
}

function mergeDrops(local: Drop[], remote: Drop[]): Drop[] {
  const remoteMap = new Map(remote.map(d => [d.id, d]));
  const localMap = new Map(local.map(d => [d.id, d]));

  // Last-write-wins: keep whichever version is newer
  const merged = new Map<string, Drop>();

  for (const [id, localDrop] of localMap) {
    const remoteDrop = remoteMap.get(id);
    if (!remoteDrop) {
      merged.set(id, localDrop);
    } else {
      const localTime = new Date(localDrop.updatedAt).getTime();
      const remoteTime = new Date(remoteDrop.updatedAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteDrop : localDrop);
    }
  }

  // Add remote drops that don't exist locally
  for (const [id, remoteDrop] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteDrop);
    }
  }

  return Array.from(merged.values());
}

/**
 * Ensure a drop exists for the given drop number
 * Creates one if it doesn't exist
 */
export function ensureDropExists(dropNumber: string): Drop {
  const store = useDropStore.getState();
  let drop = store.getDropByNumber(dropNumber);

  if (!drop) {
    drop = store.addDrop({
      dropNumber,
      arrivalDate: getCurrentISODate(),
      status: 'active',
    });
  }

  return drop;
}
