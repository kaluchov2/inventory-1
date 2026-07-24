import { getSupabaseClient } from '../lib/supabase';
import { SatCategorySuggestion, SatKey } from '../types';
import { normalizeSatCode } from '../utils/satKeyHelpers';

export interface ConfirmedSatKeyResult {
  satKey: SatKey;
  wasExisting: boolean;
}

// Bounds the manual "add SAT key" flow so a hung Supabase request cannot lock
// the product form indefinitely (all its buttons are disabled while creating).
const CREATE_OR_GET_TIMEOUT_MS = 15000;

export const satKeyService = {
  async getAll(): Promise<SatKey[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('sat_keys')
      .select('*')
      .eq('is_deleted', false)
      .order('code', { ascending: true });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getSuggestions(): Promise<SatCategorySuggestion[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('sat_category_suggestions')
      .select('*')
      .order('category_code', { ascending: true })
      .order('priority', { ascending: true });

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') {
        return [];
      }
      throw error;
    }

    return data.map(convertSuggestionFromDbFormat);
  },

  async create(satKey: SatKey): Promise<SatKey> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('sat_keys')
      .insert(convertToDbFormat(satKey))
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async findByCode(code: string, signal?: AbortSignal): Promise<SatKey | null> {
    const client = getSupabaseClient();
    let query = client
      .from('sat_keys')
      .select('*')
      .eq('code', normalizeSatCode(code))
      .eq('is_deleted', false);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return data ? convertFromDbFormat(data) : null;
  },

  /**
   * Creates a key only after checking the server, then returns the server's
   * canonical record. A unique-code race is resolved by reading that record.
   * Bounded by a timeout so a hung request rejects instead of stalling forever.
   */
  async createOrGet(
    satKey: SatKey,
    options?: { timeoutMs?: number },
  ): Promise<ConfirmedSatKeyResult> {
    const controller = new AbortController();
    const run = async (): Promise<ConfirmedSatKeyResult> => {
      const existing = await this.findByCode(satKey.code, controller.signal);
      if (existing) return { satKey: existing, wasExisting: true };

      const client = getSupabaseClient();
      const { data, error } = await client
        .from('sat_keys')
        .insert(convertToDbFormat(satKey))
        .select()
        .abortSignal(controller.signal)
        .single();

      if (error) {
        if ((error as { code?: string }).code === '23505') {
          const concurrent = await this.findByCode(satKey.code, controller.signal);
          if (concurrent) return { satKey: concurrent, wasExisting: true };
        }
        throw error;
      }

      return { satKey: convertFromDbFormat(data), wasExisting: false };
    };

    const timeoutMs = options?.timeoutMs ?? CREATE_OR_GET_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          controller.abort();
          reject(new Error('sat_key_confirm_timeout'));
        },
        timeoutMs,
      );
    });

    try {
      return await Promise.race([run(), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  },

  async update(id: string, updates: Partial<SatKey>): Promise<SatKey> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('sat_keys')
      .update({
        ...convertToDbFormat(updates as SatKey),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async delete(id: string): Promise<void> {
    const client = getSupabaseClient();

    const { error } = await client
      .from('sat_keys')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },
};

function convertFromDbFormat(data: any): SatKey {
  return {
    id: data.id,
    code: data.code,
    description: data.description,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function convertSuggestionFromDbFormat(data: any): SatCategorySuggestion {
  return {
    id: data.id,
    categoryCode: data.category_code,
    satKeyId: data.sat_key_id,
    priority: data.priority,
    isDefault: data.is_default,
    sourceGroup: data.source_group || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function convertSatKeyToDbFormat(satKey: SatKey): any {
  return convertToDbFormat(satKey);
}

function convertToDbFormat(satKey: SatKey): any {
  return {
    id: satKey.id,
    code: normalizeSatCode(satKey.code),
    description: satKey.description?.trim(),
    created_at: satKey.createdAt,
    updated_at: satKey.updatedAt,
    is_deleted: false,
  };
}
