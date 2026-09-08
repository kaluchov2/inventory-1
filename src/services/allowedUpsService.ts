import { supabase } from '../lib/supabase';

export const allowedUpsService = {
  async getAll(): Promise<number[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('allowed_inventory_ups')
      .select('ups_number')
      .order('ups_number', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row) => row.ups_number);
  },
};
