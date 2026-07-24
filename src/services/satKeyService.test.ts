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

  it('reuses the canonical key when its code already exists in Supabase', async () => {
    const query: any = {
      select: vi.fn(),
      eq: vi.fn(),
      abortSignal: vi.fn(),
      maybeSingle: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.abortSignal.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: {
        id: 'server-key',
        code: '53103000',
        description: 'Ropa',
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
      },
      error: null,
    });
    mocks.from.mockReturnValue(query);

    const { satKeyService } = await import('./satKeyService');
    const result = await satKeyService.createOrGet({
      id: 'local-key',
      code: '53103000',
      description: 'Otra descripción',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    });

    expect(result).toEqual({
      wasExisting: true,
      satKey: expect.objectContaining({ id: 'server-key', code: '53103000' }),
    });
  });

  it('adopts the key created by another client after a unique-code race', async () => {
    const missingQuery: any = {
      select: vi.fn(),
      eq: vi.fn(),
      abortSignal: vi.fn(),
      maybeSingle: vi.fn(),
    };
    missingQuery.select.mockReturnValue(missingQuery);
    missingQuery.eq.mockReturnValue(missingQuery);
    missingQuery.abortSignal.mockReturnValue(missingQuery);
    missingQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

    const insertQuery: any = {
      insert: vi.fn(),
      select: vi.fn(),
      abortSignal: vi.fn(),
      single: vi.fn(),
    };
    insertQuery.insert.mockReturnValue(insertQuery);
    insertQuery.select.mockReturnValue(insertQuery);
    insertQuery.abortSignal.mockReturnValue(insertQuery);
    insertQuery.single.mockResolvedValue({ data: null, error: { code: '23505' } });

    const concurrentQuery: any = {
      select: vi.fn(),
      eq: vi.fn(),
      abortSignal: vi.fn(),
      maybeSingle: vi.fn(),
    };
    concurrentQuery.select.mockReturnValue(concurrentQuery);
    concurrentQuery.eq.mockReturnValue(concurrentQuery);
    concurrentQuery.abortSignal.mockReturnValue(concurrentQuery);
    concurrentQuery.maybeSingle.mockResolvedValue({
      data: {
        id: 'other-client-key',
        code: '53103000',
        description: 'Ropa',
        created_at: '2026-07-22T00:00:00.000Z',
        updated_at: '2026-07-22T00:00:00.000Z',
      },
      error: null,
    });
    mocks.from
      .mockReturnValueOnce(missingQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(concurrentQuery);

    const { satKeyService } = await import('./satKeyService');
    const result = await satKeyService.createOrGet({
      id: 'local-key',
      code: '53103000',
      description: 'Ropa',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    });

    expect(result).toEqual({
      wasExisting: true,
      satKey: expect.objectContaining({ id: 'other-client-key', code: '53103000' }),
    });
  });

  it('aborts a hung confirmation request when the timeout expires', async () => {
    let signal: AbortSignal | undefined;
    const query: any = {
      select: vi.fn(),
      eq: vi.fn(),
      abortSignal: vi.fn((nextSignal: AbortSignal) => {
        signal = nextSignal;
        return query;
      }),
      maybeSingle: vi.fn(() => new Promise(() => undefined)),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);

    const { satKeyService } = await import('./satKeyService');
    await expect(satKeyService.createOrGet({
      id: 'local-key',
      code: '53103000',
      description: 'Ropa',
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    }, { timeoutMs: 1 })).rejects.toThrow('sat_key_confirm_timeout');

    expect(signal?.aborted).toBe(true);
  });
});
