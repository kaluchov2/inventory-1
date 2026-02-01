import { getSupabaseClient } from '../lib/supabase';
import { Drop } from '../types';

/**
 * Drop Service
 * Handles CRUD operations for drops with Supabase
 */

export const dropService = {
  async getAll(): Promise<Drop[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('drops')
      .select('*')
      .eq('is_deleted', false)
      .order('arrival_date', { ascending: false });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getById(id: string): Promise<Drop | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('drops')
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

  async getByNumber(dropNumber: string): Promise<Drop | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('drops')
      .select('*')
      .eq('drop_number', dropNumber)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async getActive(): Promise<Drop[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('drops')
      .select('*')
      .eq('is_deleted', false)
      .eq('status', 'active')
      .order('arrival_date', { ascending: false });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async create(drop: Drop): Promise<Drop> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(drop);

    const { data, error } = await client
      .from('drops')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async update(id: string, updates: Partial<Drop>): Promise<Drop> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(updates as Drop);

    const { data, error } = await client
      .from('drops')
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
      .from('drops')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Recalculate stats for a drop based on its products
   */
  async recalculateStats(dropNumber: string): Promise<Drop | null> {
    const client = getSupabaseClient();

    // First, get the drop
    const drop = await this.getByNumber(dropNumber);
    if (!drop) return null;

    // Get all products for this drop
    const { data: products, error: productsError } = await client
      .from('products')
      .select('quantity, unit_price, status')
      .eq('drop_number', dropNumber)
      .eq('is_deleted', false);

    if (productsError) throw productsError;

    // Calculate stats
    const stats = {
      totalProducts: products.length,
      totalUnits: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
      totalValue: products.reduce((sum, p) => sum + ((p.quantity || 0) * (p.unit_price || 0)), 0),
      soldCount: products.filter(p => p.status === 'sold').length,
      availableCount: products.filter(p => p.status === 'available').length,
    };

    // Update the drop with new stats
    const updatedDrop = await this.update(drop.id, {
      totalProducts: stats.totalProducts,
      totalUnits: stats.totalUnits,
      totalValue: stats.totalValue,
      soldCount: stats.soldCount,
      availableCount: stats.availableCount,
    });

    return updatedDrop;
  },
};

function convertFromDbFormat(data: any): Drop {
  return {
    id: data.id,
    dropNumber: data.drop_number,
    arrivalDate: data.arrival_date,
    status: data.status,
    totalProducts: data.total_products,
    totalUnits: data.total_units,
    totalValue: data.total_value,
    soldCount: data.sold_count,
    availableCount: data.available_count,
    notes: data.notes || undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function convertToDbFormat(drop: Drop): any {
  return {
    id: drop.id,
    drop_number: drop.dropNumber,
    arrival_date: drop.arrivalDate,
    status: drop.status,
    total_products: drop.totalProducts,
    total_units: drop.totalUnits,
    total_value: drop.totalValue,
    sold_count: drop.soldCount,
    available_count: drop.availableCount,
    notes: drop.notes || null,
    created_at: drop.createdAt,
    updated_at: drop.updatedAt,
  };
}
