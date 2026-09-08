import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FALLBACK_ALLOWED_INVENTORY_UPS } from '../constants/ups';
import { allowedUpsService } from '../services/allowedUpsService';

interface AllowedUpsState {
  allowedUps: number[];
  loadFromSupabase: () => Promise<void>;
}

const fallbackUps = [...FALLBACK_ALLOWED_INVENTORY_UPS];

export const useAllowedUpsStore = create<AllowedUpsState>()(
  persist(
    (set) => ({
      allowedUps: fallbackUps,

      loadFromSupabase: async () => {
        try {
          const allowedUps = await allowedUpsService.getAll();
          if (allowedUps.length > 0) set({ allowedUps });
        } catch (error) {
          console.error('[Allowed UPS] Failed to load registry:', error);
        }
      },
    }),
    {
      name: 'allowed-inventory-ups',
      partialize: (state) => ({ allowedUps: state.allowedUps }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<AllowedUpsState> | undefined;
        return {
          ...current,
          allowedUps:
            stored?.allowedUps && stored.allowedUps.length > 0
              ? stored.allowedUps
              : fallbackUps,
        };
      },
    },
  ),
);

export function getAllowedInventoryUps(): number[] {
  return useAllowedUpsStore.getState().allowedUps;
}
