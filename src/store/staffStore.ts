import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Staff } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { syncManager } from '../lib/syncManager';
import { staffService } from '../services/staffService';
import { supabase } from '../lib/supabase';

interface StaffFilters {
  search: string;
  isActive: boolean | '';
}

interface StaffStore {
  staff: Staff[];
  filters: StaffFilters;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addStaff: (staff: Omit<Staff, 'id' | 'createdAt' | 'updatedAt' | 'totalSales' | 'totalAmount'>) => Staff;
  updateStaff: (id: string, updates: Partial<Staff>) => void;
  deleteStaff: (id: string) => void;
  setFilters: (filters: Partial<StaffFilters>) => void;
  clearFilters: () => void;

  // Sales tracking
  recordSale: (id: string, amount: number) => void;

  // Sync actions
  loadFromSupabase: () => Promise<void>;
  handleRealtimeUpdate: (staff: any) => void;
  handleRealtimeDelete: (staff: any) => void;

  // Selectors
  getStaffById: (id: string) => Staff | undefined;
  getStaffByName: (name: string) => Staff | undefined;
  getActiveStaff: () => Staff[];
  getFilteredStaff: () => Staff[];
  getTopSellers: (limit?: number) => Staff[];
}

const defaultFilters: StaffFilters = {
  search: '',
  isActive: '',
};

export const useStaffStore = create<StaffStore>()(
  persist(
    (set, get) => ({
      staff: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addStaff: (staffData) => {
        const now = getCurrentISODate();
        const newStaff: Staff = {
          ...staffData,
          id: generateId(),
          totalSales: 0,
          totalAmount: 0,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          staff: [...state.staff, newStaff],
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'staff',
            action: 'create',
            data: newStaff,
          });
        }

        return newStaff;
      },

      updateStaff: (id, updates) => {
        const staffMember = get().staff.find(s => s.id === id);
        if (!staffMember) return;

        const updatedStaff = { ...staffMember, ...updates, updatedAt: getCurrentISODate() };

        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === id ? updatedStaff : s
          ),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'staff',
            action: 'update',
            data: updatedStaff,
          });
        }
      },

      deleteStaff: (id) => {
        const staffMember = get().staff.find(s => s.id === id);
        if (!staffMember) return;

        set((state) => ({
          staff: state.staff.filter((s) => s.id !== id),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'staff',
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

      recordSale: (id, amount) => {
        const staffMember = get().staff.find(s => s.id === id);
        if (!staffMember) return;

        const updatedStaff = {
          ...staffMember,
          totalSales: staffMember.totalSales + 1,
          totalAmount: staffMember.totalAmount + amount,
          updatedAt: getCurrentISODate(),
        };

        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === id ? updatedStaff : s
          ),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: 'staff',
            action: 'update',
            data: updatedStaff,
          });
        }
      },

      loadFromSupabase: async () => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const staff = await staffService.getAll();

          // Merge with local staff using last-write-wins
          const localStaff = get().staff;
          const merged = mergeStaff(localStaff, staff);

          set({ staff: merged, lastSync: new Date(), isLoading: false });
        } catch (error) {
          console.error('Failed to load staff from Supabase:', error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbStaff) => {
        const converted = convertDbStaff(dbStaff);
        const local = get().staff.find(s => s.id === converted.id);

        // Only update if remote is newer (last-write-wins)
        if (!local || new Date(converted.updatedAt) > new Date(local.updatedAt)) {
          set((state) => ({
            staff: state.staff.some(s => s.id === converted.id)
              ? state.staff.map(s => s.id === converted.id ? converted : s)
              : [...state.staff, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbStaff) => {
        if (dbStaff.is_deleted) {
          set((state) => ({
            staff: state.staff.filter(s => s.id !== dbStaff.id),
          }));
        }
      },

      getStaffById: (id) => {
        return get().staff.find(s => s.id === id);
      },

      getStaffByName: (name) => {
        const nameLower = name.toLowerCase().trim();
        return get().staff.find(s => s.name.toLowerCase().trim() === nameLower);
      },

      getActiveStaff: () => {
        return get().staff.filter(s => s.isActive);
      },

      getFilteredStaff: () => {
        const { staff, filters } = get();
        let filtered = [...staff];

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(
            (s) =>
              s.name.toLowerCase().includes(searchLower) ||
              (s.notes && s.notes.toLowerCase().includes(searchLower))
          );
        }

        if (filters.isActive !== '') {
          filtered = filtered.filter((s) => s.isActive === filters.isActive);
        }

        // Sort by name
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
      },

      getTopSellers: (limit = 10) => {
        return [...get().staff]
          .filter(s => s.isActive)
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, limit);
      },
    }),
    {
      name: 'inventory_staff',
    }
  )
);

// Helper functions
function convertDbStaff(dbStaff: any): Staff {
  return {
    id: dbStaff.id,
    name: dbStaff.name,
    isActive: dbStaff.is_active,
    totalSales: dbStaff.total_sales,
    totalAmount: dbStaff.total_amount,
    notes: dbStaff.notes || undefined,
    createdAt: dbStaff.created_at,
    updatedAt: dbStaff.updated_at,
  };
}

function mergeStaff(local: Staff[], remote: Staff[]): Staff[] {
  const remoteMap = new Map(remote.map(s => [s.id, s]));
  const localMap = new Map(local.map(s => [s.id, s]));

  // Last-write-wins: keep whichever version is newer
  const merged = new Map<string, Staff>();

  for (const [id, localStaff] of localMap) {
    const remoteStaff = remoteMap.get(id);
    if (!remoteStaff) {
      merged.set(id, localStaff);
    } else {
      const localTime = new Date(localStaff.updatedAt).getTime();
      const remoteTime = new Date(remoteStaff.updatedAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteStaff : localStaff);
    }
  }

  // Add remote staff that don't exist locally
  for (const [id, remoteStaff] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteStaff);
    }
  }

  return Array.from(merged.values());
}

/**
 * Find or create staff member by name
 */
export function findOrCreateStaff(name: string): Staff {
  const store = useStaffStore.getState();
  let staffMember = store.getStaffByName(name);

  if (!staffMember) {
    staffMember = store.addStaff({
      name: name.trim(),
      isActive: true,
    });
  }

  return staffMember;
}
