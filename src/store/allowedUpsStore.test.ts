import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: null }));

import { migrateAllowedUpsState } from './allowedUpsStore';

describe('allowedUpsStore persistence migration', () => {
  it('discards the legacy UPS range stored by an older UI build', () => {
    expect(migrateAllowedUpsState({ allowedUps: [7, 8, 22, 23, 24, 25, 26] })).toEqual({
      allowedUps: [23, 24, 25],
    });
  });

  it('uses the safe local range when persisted data is malformed', () => {
    expect(migrateAllowedUpsState(null)).toEqual({ allowedUps: [23, 24, 25] });
  });
});
