import { getSupabaseClient } from '../lib/supabase';
import { Product, ProductStatus } from '../types';

/**
 * Product Service
 * V2: Handles CRUD operations for products with Supabase
 * Includes new V2 fields: ups_raw, identifier_type, drop_number, etc.
 */

export const productService = {
  async getAll(): Promise<Product[]> {
    const client = getSupabaseClient();

    // Fetch all products using pagination (Supabase has default limit ~1000-2000)
    const BATCH_SIZE = 1000;
    let allProducts: any[] = [];
    let offset = 0;
    let hasMore = true;
    let batchNumber = 0;

    console.log('[ProductService.getAll] Starting fetch...');

    while (hasMore) {
      const { data, error } = await client
        .from('products')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      batchNumber++;
      console.log(`[ProductService.getAll] Batch ${batchNumber}: offset=${offset}, received=${data?.length || 0}`);

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE; // Continue if we got a full batch
      } else {
        hasMore = false;
      }
    }

    console.log(`[ProductService.getAll] Complete: ${allProducts.length} products in ${batchNumber} batches`);

    return allProducts.map(convertFromDbFormat);
  },

  async validateProductCount(): Promise<{
    totalInDB: number;
    activeInDB: number;
    softDeletedInDB: number;
    fetchedCount: number;
  }> {
    const client = getSupabaseClient();

    // Count all products
    const { count: totalCount } = await client
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Count active (non-deleted)
    const { count: activeCount } = await client
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', false);

    // Count soft-deleted
    const { count: deletedCount } = await client
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_deleted', true);

    // Fetch all and compare
    const fetched = await this.getAll();

    const result = {
      totalInDB: totalCount || 0,
      activeInDB: activeCount || 0,
      softDeletedInDB: deletedCount || 0,
      fetchedCount: fetched.length,
    };

    console.log('[ProductService.validateProductCount]', result);
    console.log('Discrepancy:', result.activeInDB - result.fetchedCount);

    return result;
  },

  async getById(id: string): Promise<Product | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
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

  async getByBarcode(barcode: string): Promise<Product | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async create(product: Product): Promise<Product> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(product);

    const { data, error } = await client
      .from('products')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    return convertFromDbFormat(data);
  },

  async update(id: string, updates: Partial<Product>): Promise<Product> {
    const client = getSupabaseClient();

    const dbData = convertToDbFormat(updates as Product);

    const { data, error } = await client
      .from('products')
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
      .from('products')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async search(query: string): Promise<Product[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('is_deleted', false)
      .or(`name.ilike.%${query}%,sku.ilike.%${query}%,brand.ilike.%${query}%,barcode.ilike.%${query}%`)
      .limit(50);

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  // V2: Get products by drop number
  async getByDrop(dropNumber: string): Promise<Product[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('drop_number', dropNumber)
      .eq('is_deleted', false)
      .order('drop_sequence', { ascending: true });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  // V2: Get products by seller (staff ID)
  async getBySeller(staffId: string): Promise<Product[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
      .select('*')
      .eq('sold_by', staffId)
      .eq('is_deleted', false)
      .order('sold_at', { ascending: false });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  // V2: Get available products only
  async getAvailable(): Promise<Product[]> {
    const client = getSupabaseClient();

    // Fetch with pagination in case there are many available products
    const BATCH_SIZE = 1000;
    let allProducts: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client
        .from('products')
        .select('*')
        .eq('status', 'available')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    return allProducts.map(convertFromDbFormat);
  },

  // V2: Get products by status
  async getByStatus(status: ProductStatus): Promise<Product[]> {
    const client = getSupabaseClient();

    // Fetch with pagination in case there are many products with this status
    const BATCH_SIZE = 1000;
    let allProducts: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await client
        .from('products')
        .select('*')
        .eq('status', status)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allProducts = allProducts.concat(data);
        offset += BATCH_SIZE;
        hasMore = data.length === BATCH_SIZE;
      } else {
        hasMore = false;
      }
    }

    return allProducts.map(convertFromDbFormat);
  },

  // V2: Get next sequence number for a drop
  async getNextDropSequence(dropNumber: string): Promise<number> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('products')
      .select('drop_sequence')
      .eq('drop_number', dropNumber)
      .eq('is_deleted', false)
      .order('drop_sequence', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) return 1;

    return (data[0].drop_sequence || 0) + 1;
  },
};

function convertFromDbFormat(data: any): Product {
  return {
    id: data.id,
    name: data.name,
    sku: data.sku,
    // V2 fields
    upsRaw: data.ups_raw || String(data.ups_batch || ''),
    identifierType: data.identifier_type || 'legacy',
    dropNumber: data.drop_number || String(data.ups_batch || ''),
    productNumber: data.product_number || undefined,
    dropSequence: data.drop_sequence || undefined,
    // Legacy field
    upsBatch: data.ups_batch,
    quantity: data.quantity,
    unitPrice: data.unit_price,
    originalPrice: data.original_price || undefined,
    category: data.category,
    brand: data.brand || undefined,
    color: data.color || undefined,
    size: data.size || undefined,
    description: data.description || undefined,
    notes: data.notes || undefined,
    barcode: data.barcode || undefined,
    status: data.status,
    soldBy: data.sold_by || undefined,
    soldTo: data.sold_to || undefined,
    soldAt: data.sold_at || undefined,
    lowStockThreshold: data.low_stock_threshold,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function convertToDbFormat(product: Product): any {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    // V2 fields
    ups_raw: product.upsRaw || null,
    identifier_type: product.identifierType || null,
    drop_number: product.dropNumber || null,
    product_number: product.productNumber || null,
    drop_sequence: product.dropSequence || null,
    // Legacy field
    ups_batch: product.upsBatch,
    quantity: product.quantity,
    unit_price: product.unitPrice,
    original_price: product.originalPrice || null,
    category: product.category,
    brand: product.brand || null,
    color: product.color || null,
    size: product.size || null,
    description: product.description || null,
    notes: product.notes || null,
    status: product.status,
    sold_by: product.soldBy || null,
    sold_to: product.soldTo || null,
    sold_at: product.soldAt || null,
    low_stock_threshold: product.lowStockThreshold,
    barcode: product.barcode || null,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}
