import { getSupabaseClient } from '../lib/supabase';
import { Staff } from '../types';

/**
 * Staff Service
 * Handles CRUD operations for staff with Supabase
 */

export const staffService = {
  async getAll(): Promise<Staff[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('staff')
      .select('*')
      .eq('is_deleted', false)
      .order('name', { ascending: true });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getById(id: string): Promise<Staff | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('staff')
      .select('*')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async getByName(name: string): Promise<Staff | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('staff')
      .select('*')
      .ilike('name', name)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async getActive(): Promise<Staff[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('staff')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async create(staff: Staff): Promise<Staff> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(staff);

    const { data, error } = await client
      .from('staff')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async update(id: string, updates: Partial<Staff>): Promise<Staff> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(updates as Staff);

    const { data, error } = await client
      .from('staff')
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
      .from('staff')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Record a sale for a staff member
   */
  async recordSale(id: string, amount: number): Promise<Staff | null> {
    const staff = await this.getById(id);
    if (!staff) return null;

    return this.update(id, {
      totalSales: staff.totalSales + 1,
      totalAmount: staff.totalAmount + amount,
    });
  },

  /**
   * Get top sellers by total amount
   */
  async getTopSellers(limit: number = 10): Promise<Staff[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('staff')
      .select('*')
      .eq('is_deleted', false)
      .eq('is_active', true)
      .order('total_amount', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },
};

function convertFromDbFormat(data: any): Staff {
  return {
    id: data.id,
    name: data.name,
    isActive: data.is_active,
    totalSales: data.total_sales,
    totalAmount: data.total_amount,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function convertToDbFormat(staff: Staff): any {
  return {
    id: staff.id,
    name: staff.name,
    is_active: staff.isActive,
    total_sales: staff.totalSales,
    total_amount: staff.totalAmount,
    notes: staff.notes || null,
    created_at: staff.createdAt,
    updated_at: staff.updatedAt,
  };
}
