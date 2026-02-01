import { getSupabaseClient } from '../lib/supabase';
import { Customer } from '../types';

/**
 * Customer Service
 * Handles CRUD operations for customers with Supabase
 */

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
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async search(query: string): Promise<Customer[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('customers')
      .select('*')
      .eq('is_deleted', false)
      .or(`name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(50);

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },
};

function convertFromDbFormat(data: any): Customer {
  return {
    id: data.id,
    name: data.name,
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
    phone: customer.phone || null,
    email: customer.email || null,
    balance: customer.balance,
    total_purchases: customer.totalPurchases,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}
