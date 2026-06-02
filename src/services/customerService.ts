import {
  SyncCursor,
  buildNextCursor,
  getDeltaWindowStart,
} from "../lib/syncMetadata";
import { DELTA_BATCH_LIMIT_ERROR_CODE } from "../lib/deltaSync";
import { getSupabaseClient } from '../lib/supabase';
import { Customer } from '../types';

/**
 * Customer Service
 * Handles CRUD operations for customers with Supabase
 */

export interface CustomerDeltaChange {
  customer: Customer;
  id: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface CustomerDeltaResult {
  changes: CustomerDeltaChange[];
  nextCursor: SyncCursor;
}

export const customerService = {
  async getAll(): Promise<Customer[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getChangesSince(
    cursor: SyncCursor,
    batchSize = 500,
  ): Promise<CustomerDeltaResult> {
    const client = getSupabaseClient();
    const BATCH_TIMEOUT_MS = 15_000;
    const MAX_BATCHES = 200;
    const windowStart = getDeltaWindowStart(cursor);

    if (!windowStart) {
      return {
        changes: [],
        nextCursor: cursor,
      };
    }

    let offset = 0;
    let hasMore = true;
    let batchCount = 0;
    const rows: any[] = [];

    console.log('[CustomerService.getChangesSince] Starting delta fetch...', {
      windowStart,
      batchSize,
      lastUpdatedAt: cursor.lastUpdatedAt,
    });

    while (hasMore) {
      batchCount++;
      if (batchCount > MAX_BATCHES) {
        throw Object.assign(
          new Error('[CustomerService.getChangesSince] Aborted after exceeding max batch count'),
          { code: DELTA_BATCH_LIMIT_ERROR_CODE },
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
      let data: any[] | null = null;
      let error: any = null;

      try {
        const result = await client
          .from('customers')
          .select('*')
          .gte('updated_at', windowStart)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + batchSize - 1)
          .abortSignal(controller.signal);
        data = result.data;
        error = result.error;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(
            `[CustomerService.getChangesSince] Request timed out after ${BATCH_TIMEOUT_MS}ms`,
          );
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      if (error) throw error;

      if (data && data.length > 0) {
        rows.push(...data);
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    const changes = rows.map((row) => ({
      customer: convertFromDbFormat(row),
      id: row.id,
      updatedAt: row.updated_at,
      isDeleted: !!row.is_deleted,
    }));

    return {
      changes,
      nextCursor: buildNextCursor(
        cursor,
        rows.map((row) => row.updated_at),
      ),
    };
  },

  async getById(id: string): Promise<Customer | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async create(customer: Customer): Promise<Customer> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(customer);

    const { data, error } = await client
      .from('customers')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(updates as Customer);

    const { data, error } = await client
      .from('customers')
      .update({ ...dbData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async delete(id: string): Promise<void> {
    const client = getSupabaseClient();

    const { error } = await client
      .from('customers')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async search(query: string): Promise<Customer[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('is_deleted', false)
      .or(`name.ilike.%${query}%,reference.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(50);

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },
};

function convertFromDbFormat(data: any): Customer {
  return {
    id: data.id,
    name: data.name,
    reference: data.reference || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    balance: data.balance,
    totalPurchases: data.total_purchases,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function convertToDbFormat(customer: Customer): any {
  return {
    id: customer.id,
    name: customer.name,
    reference: customer.reference || null,
    phone: customer.phone || null,
    email: customer.email || null,
    balance: customer.balance,
    total_purchases: customer.totalPurchases,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}
