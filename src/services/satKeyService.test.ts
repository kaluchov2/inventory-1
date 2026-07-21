import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

describe('satKeyService', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
  });

  it('returns an empty suggestion list when the suggestions table is missing', async () => {
    const query: any = {
      select: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValueOnce(query).mockReturnValueOnce({
      data: null,
      error: { code: '42P01' },
    });
    mocks.from.mockReturnValue(query);

    const { satKeyService } = await import('./satKeyService');

    await expect(satKeyService.getSuggestions()).resolves.toEqual([]);
  });

  it('loads and converts SAT category suggestions', async () => {
    const query: any = {
      select: vi.fn(),
      order: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValueOnce(query).mockReturnValueOnce({
      data: [
        {
          id: 'suggestion-dam',
          category_code: 'DAM',
          sat_key_id: 'sat-53103000',
          priority: 1,
          is_default: false,
          source_group: 'Ropa',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        },
      ],
      error: null,
    });
    mocks.from.mockReturnValue(query);

    const { satKeyService } = await import('./satKeyService');

    await expect(satKeyService.getSuggestions()).resolves.toEqual([
      {
        id: 'suggestion-dam',
        categoryCode: 'DAM',
        satKeyId: 'sat-53103000',
        priority: 1,
        isDefault: false,
        sourceGroup: 'Ropa',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });
});
