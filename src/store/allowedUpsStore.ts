import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FALLBACK_ALLOWED_INVENTORY_UPS } from '../constants/ups';
import { allowedUpsService } from '../services/allowedUpsService';

interface AllowedUpsState {
  allowedUps: number[];
  loadFromSupabase: () => Promise<void>;
}

const fallbackUps = [...FALLBACK_ALLOWED_INVENTORY_UPS];

function normalizedRegistry(values: unknown): number[] {
  if (!Array.isArray(values)) return [];

  return [...new Set(
    values
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0),
  )].sort((left, right) => left - right);
}

export function migrateAllowedUpsState(persistedState: unknown) {
  const persisted = persistedState && typeof persistedState === 'object'
    ? persistedState as Record<string, unknown>
    : {};

  // Version 0 could contain the legacy UPS range. Start version 1 from the
  // locally safe list; the current server registry replaces it after login.
  return { ...persisted, allowedUps: fallbackUps };
}

export const useAllowedUpsStore = create<AllowedUpsState>()(
  persist(
    (set) => ({
      allowedUps: fallbackUps,

      loadFromSupabase: async () => {
        try {
          const allowedUps = normalizedRegistry(await allowedUpsService.getAll());
          set({ allowedUps: allowedUps.length > 0 ? allowedUps : fallbackUps });
        } catch (error) {
          console.error('[Allowed UPS] Failed to load registry:', error);
          set({ allowedUps: fallbackUps });
        }
      },
    }),
    {
      name: 'allowed-inventory-ups',
      version: 1,
      migrate: migrateAllowedUpsState,
      partialize: (state) => ({ allowedUps: state.allowedUps }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<AllowedUpsState> | undefined;
        const storedUps = normalizedRegistry(stored?.allowedUps);
        return {
          ...current,
          allowedUps: storedUps.length > 0 ? storedUps : fallbackUps,
        };
      },
    },
  ),
);

export function getAllowedInventoryUps(): number[] {
  return useAllowedUpsStore.getState().allowedUps;
}
