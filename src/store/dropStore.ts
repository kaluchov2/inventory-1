import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Drop, DropStatus } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { dropService } from '../services/dropService';
import { supabase } from '../lib/supabase';
import { syncQueue } from '../lib/syncQueue';
import { isAllowedInventoryUps, normalizeInventoryUps } from '../constants/ups';
import { getAllowedInventoryUps } from './allowedUpsStore';

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
        const normalizedUps = normalizeInventoryUps(dropData.dropNumber);
        if (!isAllowedInventoryUps(normalizedUps, getAllowedInventoryUps())) {
          throw new Error(`UPS ${dropData.dropNumber || 'vacío'} no está permitido`);
        }

        const now = getCurrentISODate();
        const newDrop: Drop = {
          ...dropData,
          dropNumber: String(normalizedUps),
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

        const normalizedUps = normalizeInventoryUps(updates.dropNumber ?? drop.dropNumber);
        if (!isAllowedInventoryUps(normalizedUps, getAllowedInventoryUps())) {
          throw new Error(`UPS ${updates.dropNumber ?? drop.dropNumber} no está permitido`);
        }

        const updatedDrop = {
          ...drop,
          ...updates,
          dropNumber: String(normalizedUps),
          updatedAt: getCurrentISODate(),
        };

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
            data: { id, dropNumber: drop.dropNumber },
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
          const allowedUps = getAllowedInventoryUps();
          const drops = (await dropService.getAll()).filter((drop) =>
            isAllowedInventoryUps(drop.dropNumber, allowedUps)
          );

          // Merge with local drops using last-write-wins
          const localDrops = get().drops.filter((drop) =>
            isAllowedInventoryUps(drop.dropNumber, allowedUps)
          );
          const merged = mergeDrops(localDrops, drops).filter((drop) =>
            isAllowedInventoryUps(drop.dropNumber, allowedUps)
          );

          set({ drops: merged, lastSync: new Date(), isLoading: false });
        } catch (error) {
          console.error('Failed to load drops from Supabase:', error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbDrop) => {
        if (
          dbDrop.is_deleted ||
          !isAllowedInventoryUps(dbDrop.drop_number, getAllowedInventoryUps())
        ) {
          set((state) => ({
            drops: state.drops.filter(
              d => d.id !== dbDrop.id && d.dropNumber !== dbDrop.drop_number
            ),
          }));
          return;
        }

        const converted = convertDbDrop(dbDrop);
        const local = get().drops.find(
          d => d.id === converted.id || d.dropNumber === converted.dropNumber
        );

        // Only update if remote is newer (last-write-wins)
        if (!local || new Date(converted.updatedAt) > new Date(local.updatedAt)) {
          set((state) => ({
            drops: [
              ...state.drops.filter(
                d => d.id !== converted.id && d.dropNumber !== converted.dropNumber
              ),
              converted,
            ],
          }));
        }
      },

      handleRealtimeDelete: (dbDrop) => {
        set((state) => ({
          drops: state.drops.filter(
            d => d.id !== dbDrop.id && d.dropNumber !== dbDrop.drop_number
          ),
        }));
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
      onRehydrateStorage: () => (state) => {
        if (state) {
          const allowedUps = getAllowedInventoryUps();
          state.drops = state.drops.filter((drop) =>
            isAllowedInventoryUps(drop.dropNumber, allowedUps)
          );
        }
      },
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

export function mergeDrops(local: Drop[], remote: Drop[]): Drop[] {
  const remoteMap = new Map(remote.map(d => [d.id, d]));
  const localMap = new Map(local.map(d => [d.id, d]));
  const unsyncedIds = new Set(
    [...syncQueue.getAll(), ...syncQueue.getDeadLetter()]
      .filter((operation) =>
        operation.type === 'drops' &&
        (operation.action === 'create' || operation.action === 'update')
      )
      .map((operation) => operation.data?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  // Last-write-wins: keep whichever version is newer
  const merged = new Map<string, Drop>();

  for (const [id, localDrop] of localMap) {
    const remoteDrop = remoteMap.get(id);
    if (!remoteDrop) {
      // Supabase is authoritative after the queue is flushed. Preserve only a
      // genuinely unsynced local creation/update; otherwise an old deleted lot
      // would be resurrected on every merge.
      if (unsyncedIds.has(id)) merged.set(id, localDrop);
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
