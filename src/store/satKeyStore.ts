import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { syncManager } from '../lib/syncManager';
import { supabase } from '../lib/supabase';
import { satKeyService } from '../services/satKeyService';
import { CategoryCode, SatCategorySuggestion, SatKey } from '../types';
import { generateId, getCurrentISODate } from '../utils/formatters';
import { isDuplicateSatCode, normalizeSatCode } from '../utils/satKeyHelpers';

interface SatKeyFilters {
  search: string;
}

interface SatKeyStore {
  satKeys: SatKey[];
  satCategorySuggestions: SatCategorySuggestion[];
  filters: SatKeyFilters;
  isLoading: boolean;
  lastSync: Date | null;

  addSatKey: (satKey: Omit<SatKey, 'id' | 'createdAt' | 'updatedAt'>) => SatKey;
  updateSatKey: (id: string, updates: Partial<SatKey>) => SatKey | undefined;
  deleteSatKey: (id: string) => void;
  setFilters: (filters: Partial<SatKeyFilters>) => void;
  clearFilters: () => void;

  loadFromSupabase: (forceReplace?: boolean) => Promise<void>;
  handleRealtimeUpdate: (satKey: any) => void;
  handleRealtimeDelete: (satKey: any) => void;

  getSatKeyById: (id: string) => SatKey | undefined;
  getSatKeyByCode: (code: string) => SatKey | undefined;
  getSuggestionsByCategory: (categoryCode: CategoryCode) => SatCategorySuggestion[];
  getFilteredSatKeys: () => SatKey[];
}

const defaultFilters: SatKeyFilters = {
  search: '',
};

function sanitizeSatKeyInput(input: Pick<SatKey, 'code' | 'description'>) {
  return {
    code: normalizeSatCode(input.code),
    description: input.description.trim(),
  };
}

function assertValidSatKeyInput(
  satKeys: SatKey[],
  input: Pick<SatKey, 'code' | 'description'>,
  currentId?: string,
) {
  const sanitized = sanitizeSatKeyInput(input);

  if (!sanitized.code) {
    throw new Error('sat_key_code_required');
  }
  if (!sanitized.description) {
    throw new Error('sat_key_description_required');
  }
  if (isDuplicateSatCode(satKeys, sanitized.code, currentId)) {
    throw new Error('sat_key_code_duplicate');
  }

  return sanitized;
}

export const useSatKeyStore = create<SatKeyStore>()(
  persist(
    (set, get) => ({
      satKeys: [],
      satCategorySuggestions: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addSatKey: (satKeyData) => {
        const sanitized = assertValidSatKeyInput(get().satKeys, satKeyData);
        const now = getCurrentISODate();
        const newSatKey: SatKey = {
          id: generateId(),
          ...sanitized,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          satKeys: [...state.satKeys, newSatKey],
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'sat_keys',
            action: 'create',
            data: newSatKey,
          });
        }

        return newSatKey;
      },

      updateSatKey: (id, updates) => {
        const satKey = get().satKeys.find((item) => item.id === id);
        if (!satKey) return undefined;

        const nextInput = {
          code: updates.code ?? satKey.code,
          description: updates.description ?? satKey.description,
        };
        const sanitized = assertValidSatKeyInput(get().satKeys, nextInput, id);
        const updatedSatKey: SatKey = {
          ...satKey,
          ...updates,
          ...sanitized,
          updatedAt: getCurrentISODate(),
        };

        set((state) => ({
          satKeys: state.satKeys.map((item) =>
            item.id === id ? updatedSatKey : item,
          ),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'sat_keys',
            action: 'update',
            data: updatedSatKey,
          });
        }

        return updatedSatKey;
      },

      deleteSatKey: (id) => {
        const satKey = get().satKeys.find((item) => item.id === id);
        if (!satKey) return;

        set((state) => ({
          satKeys: state.satKeys.filter((item) => item.id !== id),
        }));

        if (supabase) {
          syncManager.queueOperation({
            type: 'sat_keys',
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

      loadFromSupabase: async (forceReplace = true) => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const satKeys = await satKeyService.getAll();
          const satCategorySuggestions = await satKeyService.getSuggestions();
          set({
            satKeys: forceReplace ? satKeys : mergeSatKeys(get().satKeys, satKeys),
            satCategorySuggestions,
            lastSync: new Date(),
            isLoading: false,
          });
        } catch (error) {
          console.error('Failed to load SAT keys from Supabase:', error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbSatKey) => {
        if (dbSatKey.is_deleted) {
          set((state) => ({
            satKeys: state.satKeys.filter((item) => item.id !== dbSatKey.id),
          }));
          return;
        }

        const converted = convertDbSatKey(dbSatKey);
        const local = get().satKeys.find((item) => item.id === converted.id);

        if (
          !local ||
          new Date(converted.updatedAt) > new Date(local.updatedAt)
        ) {
          set((state) => ({
            satKeys: state.satKeys.some((item) => item.id === converted.id)
              ? state.satKeys.map((item) =>
                  item.id === converted.id ? converted : item,
                )
              : [...state.satKeys, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbSatKey) => {
        if (dbSatKey?.id) {
          set((state) => ({
            satKeys: state.satKeys.filter((item) => item.id !== dbSatKey.id),
          }));
        }
      },

      getSatKeyById: (id) => {
        return get().satKeys.find((item) => item.id === id);
      },

      getSatKeyByCode: (code) => {
        const normalized = normalizeSatCode(code).toLowerCase();
        return get().satKeys.find(
          (item) => normalizeSatCode(item.code).toLowerCase() === normalized,
        );
      },

      getSuggestionsByCategory: (categoryCode) => {
        return get()
          .satCategorySuggestions
          .filter((item) => item.categoryCode === categoryCode)
          .sort((a, b) => a.priority - b.priority);
      },

      getFilteredSatKeys: () => {
        const { satKeys, filters } = get();
        const search = filters.search.trim().toLowerCase();
        const filtered = search
          ? satKeys.filter(
              (item) =>
                item.code.toLowerCase().includes(search) ||
                item.description.toLowerCase().includes(search),
            )
          : [...satKeys];

        return filtered.sort((a, b) => a.code.localeCompare(b.code));
      },
    }),
    {
      name: 'inventory_sat_keys',
      partialize: (state) => ({
        satKeys: state.satKeys,
        satCategorySuggestions: state.satCategorySuggestions,
        filters: state.filters,
        lastSync: state.lastSync,
      }),
    },
  ),
);

function convertDbSatKey(dbSatKey: any): SatKey {
  return {
    id: dbSatKey.id,
    code: dbSatKey.code,
    description: dbSatKey.description,
    createdAt: dbSatKey.created_at,
    updatedAt: dbSatKey.updated_at,
  };
}

function mergeSatKeys(local: SatKey[], remote: SatKey[]): SatKey[] {
  const remoteMap = new Map(remote.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const merged = new Map<string, SatKey>();

  for (const [id, localSatKey] of localMap) {
    const remoteSatKey = remoteMap.get(id);
    if (!remoteSatKey) {
      merged.set(id, localSatKey);
    } else {
      const localTime = new Date(localSatKey.updatedAt).getTime();
      const remoteTime = new Date(remoteSatKey.updatedAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteSatKey : localSatKey);
    }
  }

  for (const [id, remoteSatKey] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteSatKey);
    }
  }

  return Array.from(merged.values());
}
