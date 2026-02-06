import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Product, CategoryCode, ProductStatus } from "../types";
import {
  generateId,
  generateSKU,
  getCurrentISODate,
} from "../utils/formatters";
import { syncManager } from "../lib/syncManager";
import { productService } from "../services/productService";
import { supabase, getSupabaseClient } from "../lib/supabase";
import { parseUPS } from "../utils/upsParser";
import { generateBarcodeFromParsed } from "../utils/barcodeGenerator";
import { getProductMatchKey } from "../utils/excelImport";
import { deriveStatus } from "../utils/productHelpers";

/**
 * Normalize a string value for comparison during sync.
 * Handles case differences, whitespace, undefined/null, and Unicode normalization.
 * Also handles the string literals "undefined" and "null" which can appear in DB data.
 */
function normalizeForComparison(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value).toLowerCase().trim().normalize('NFC');
  // Handle string literals "undefined" and "null" that may be stored in DB
  if (str === 'undefined' || str === 'null') return '';
  return str;
}

// Import mode types
export type ImportMode = "replace" | "sync";

// Result of sync import operation
export interface ImportSyncResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

interface ProductFilters {
  search: string;
  category: CategoryCode | "";
  upsBatch: number | "";
  dropNumber: string;
  status: ProductStatus | "";
  soldBy: string;
}

interface ProductStore {
  products: Product[];
  filters: ProductFilters;
  isLoading: boolean;
  lastSync: Date | null;

  // Actions
  addProduct: (
    product: Omit<Product, "id" | "sku" | "createdAt" | "updatedAt">,
  ) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  markAsSold: (id: string, soldBy?: string, soldTo?: string) => void;
  setFilters: (filters: Partial<ProductFilters>) => void;
  clearFilters: () => void;
  importProducts: (
    products: Product[],
    mode?: ImportMode,
  ) => Promise<ImportSyncResult>;

  // Sync actions
  loadFromSupabase: (forceReplace?: boolean) => Promise<void>;
  handleRealtimeUpdate: (product: any) => void;
  handleRealtimeDelete: (product: any) => void;

  // Selectors
  getFilteredProducts: () => Product[];
  getProductById: (id: string) => Product | undefined;
  getProductByBarcode: (barcode: string) => Product | undefined;
  getTotalInventoryValue: () => number;
  getTotalProductCount: () => number;
  getProductsByCategory: () => Record<CategoryCode, number>;
  // V2 Selectors
  getProductsByDrop: (dropNumber: string) => Product[];
  getProductsBySoldBy: (staffId: string) => Product[];
  getDropStats: (dropNumber: string) => {
    totalProducts: number;
    totalUnits: number;
    totalValue: number;
    soldCount: number;
    availableCount: number;
  };
  getNextDropSequence: (dropNumber: string) => number;
}

const defaultFilters: ProductFilters = {
  search: "",
  category: "",
  upsBatch: "",
  dropNumber: "",
  status: "",
  soldBy: "",
};

export const useProductStore = create<ProductStore>()(
  persist(
    (set, get) => ({
      products: [],
      filters: defaultFilters,
      isLoading: false,
      lastSync: null,

      addProduct: (productData) => {
        const now = getCurrentISODate();

        // Ensure V2 fields have defaults
        const upsRaw = productData.upsRaw || String(productData.upsBatch || "");
        const parsed = parseUPS(upsRaw);

        // Get next sequence for barcode if not provided
        const dropSequence =
          productData.dropSequence ??
          get().getNextDropSequence(parsed.dropNumber);

        // Generate barcode if not provided
        const barcode =
          productData.barcode ||
          generateBarcodeFromParsed(parsed, dropSequence);

        const newProduct: Product = {
          ...productData,
          id: generateId(),
          sku: generateSKU(productData.category, productData.upsBatch),
          // V2 fields
          upsRaw: upsRaw,
          identifierType: productData.identifierType || parsed.identifierType,
          dropNumber: productData.dropNumber || parsed.dropNumber,
          productNumber: productData.productNumber ?? parsed.productNumber,
          dropSequence,
          barcode,
          // Qty fields default to 0 (unless provided)
          availableQty: productData.availableQty ?? 0,
          soldQty: productData.soldQty ?? 0,
          donatedQty: productData.donatedQty ?? 0,
          lostQty: productData.lostQty ?? 0,
          expiredQty: productData.expiredQty ?? 0,
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          products: [...state.products, newProduct],
        }));

        // Queue for sync (with direct-sync fallback for localStorage quota)
        if (supabase) {
          try {
            syncManager.queueOperation({
              type: "products",
              action: "create",
              data: newProduct,
            });
          } catch (queueError) {
            console.warn('[Store] Queue failed, attempting direct sync:', queueError);
            getSupabaseClient()
              .from('products')
              .upsert({
                id: newProduct.id,
                name: newProduct.name,
                sku: newProduct.sku,
                ups_raw: newProduct.upsRaw || null,
                identifier_type: newProduct.identifierType || null,
                drop_number: newProduct.dropNumber || null,
                product_number: newProduct.productNumber || null,
                drop_sequence: newProduct.dropSequence || null,
                ups_batch: newProduct.upsBatch,
                quantity: newProduct.quantity,
                unit_price: newProduct.unitPrice,
                original_price: newProduct.originalPrice || null,
                category: newProduct.category,
                brand: newProduct.brand || null,
                color: newProduct.color || null,
                size: newProduct.size || null,
                description: newProduct.description || null,
                notes: newProduct.notes || null,
                available_qty: newProduct.availableQty || 0,
                sold_qty: newProduct.soldQty || 0,
                donated_qty: newProduct.donatedQty || 0,
                lost_qty: newProduct.lostQty || 0,
                expired_qty: newProduct.expiredQty || 0,
                status: newProduct.status,
                sold_by: newProduct.soldBy || null,
                sold_to: newProduct.soldTo || null,
                sold_at: newProduct.soldAt || null,
                barcode: newProduct.barcode || null,
                created_at: newProduct.createdAt,
                updated_at: newProduct.updatedAt,
                is_deleted: false,
              }, { onConflict: 'id' })
              .then(({ error }) => { if (error) console.error('[Store] Direct sync failed:', error); });
          }
        }

        return newProduct;
      },

      updateProduct: (id, updates) => {
        const product = get().products.find((p) => p.id === id);
        if (!product) return;

        const updatedProduct = {
          ...product,
          ...updates,
          updatedAt: getCurrentISODate(),
        };

        set((state) => ({
          products: state.products.map((p) =>
            p.id === id ? updatedProduct : p,
          ),
        }));

        // Queue for sync (with direct-sync fallback for localStorage quota)
        if (supabase) {
          try {
            syncManager.queueOperation({
              type: "products",
              action: "update",
              data: updatedProduct,
            });
          } catch (queueError) {
            console.warn('[Store] Queue failed, attempting direct sync:', queueError);
            getSupabaseClient()
              .from('products')
              .upsert({
                id: updatedProduct.id,
                name: updatedProduct.name,
                sku: updatedProduct.sku,
                ups_raw: updatedProduct.upsRaw || null,
                identifier_type: updatedProduct.identifierType || null,
                drop_number: updatedProduct.dropNumber || null,
                product_number: updatedProduct.productNumber || null,
                drop_sequence: updatedProduct.dropSequence || null,
                ups_batch: updatedProduct.upsBatch,
                quantity: updatedProduct.quantity,
                unit_price: updatedProduct.unitPrice,
                original_price: updatedProduct.originalPrice || null,
                category: updatedProduct.category,
                brand: updatedProduct.brand || null,
                color: updatedProduct.color || null,
                size: updatedProduct.size || null,
                description: updatedProduct.description || null,
                notes: updatedProduct.notes || null,
                available_qty: updatedProduct.availableQty || 0,
                sold_qty: updatedProduct.soldQty || 0,
                donated_qty: updatedProduct.donatedQty || 0,
                lost_qty: updatedProduct.lostQty || 0,
                expired_qty: updatedProduct.expiredQty || 0,
                status: updatedProduct.status,
                sold_by: updatedProduct.soldBy || null,
                sold_to: updatedProduct.soldTo || null,
                sold_at: updatedProduct.soldAt || null,
                barcode: updatedProduct.barcode || null,
                created_at: updatedProduct.createdAt,
                updated_at: updatedProduct.updatedAt,
                is_deleted: false,
              }, { onConflict: 'id' })
              .then(({ error }) => { if (error) console.error('[Store] Direct sync failed:', error); });
          }
        }
      },

      deleteProduct: (id) => {
        const product = get().products.find((p) => p.id === id);
        if (!product) return;

        set((state) => ({
          products: state.products.filter((p) => p.id !== id),
        }));

        // Queue for sync
        if (supabase) {
          syncManager.queueOperation({
            type: "products",
            action: "delete",
            data: { id },
          });
        }
      },

      markAsSold: (id, soldBy, soldTo) => {
        const product = get().products.find((p) => p.id === id);
        if (!product) return;
        const updates: Partial<Product> = {
          availableQty: Math.max(0, product.availableQty - product.quantity),
          soldQty: product.soldQty + product.quantity,
          soldBy,
          soldTo,
          soldAt: getCurrentISODate(),
        };
        const updated = { ...product, ...updates };
        updates.status = deriveStatus(updated as Product);
        get().updateProduct(id, updates);
      },

      setFilters: (newFilters) => {
        set((state) => ({
          filters: { ...state.filters, ...newFilters },
        }));
      },

      clearFilters: () => {
        set({ filters: defaultFilters });
      },

      importProducts: async (newProducts, mode = "replace") => {
        const result: ImportSyncResult = {
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 0,
        };

        if (mode === "replace") {
          // Simple replace mode - set all products
          // Deduplicate by ID first
          const seen = new Map<string, Product>();
          for (const product of newProducts) {
            if (seen.has(product.id)) {
              console.warn(
                `[Import] Duplicate product ID found: ${product.id}, keeping latest version`,
              );
            }
            seen.set(product.id, product);
          }
          const uniqueProducts = Array.from(seen.values());

          if (uniqueProducts.length !== newProducts.length) {
            console.warn(
              `[Import] Removed ${newProducts.length - uniqueProducts.length} duplicate product IDs`,
            );
          }

          set({ products: uniqueProducts });
          result.created = uniqueProducts.length;

          // Sync directly to Supabase (bypasses localStorage queue to avoid quota issues)
          if (supabase) {
            const BATCH_SIZE = 100; // Larger batches for direct sync
            const client = getSupabaseClient();

            console.log(
              `[Import] Syncing ${uniqueProducts.length} products directly to Supabase...`,
            );

            // Sync in batches directly to Supabase
            const syncDirectly = async () => {
              let synced = 0;
              let errors = 0;

              for (let i = 0; i < uniqueProducts.length; i += BATCH_SIZE) {
                const batch = uniqueProducts.slice(i, i + BATCH_SIZE);
                const dbBatch = batch.map((p) => ({
                  id: p.id,
                  name: p.name,
                  sku: p.sku,
                  ups_raw: p.upsRaw || null,
                  identifier_type: p.identifierType || null,
                  drop_number: p.dropNumber || null,
                  product_number: p.productNumber || null,
                  drop_sequence: p.dropSequence || null,
                  ups_batch: p.upsBatch,
                  quantity: p.quantity,
                  unit_price: p.unitPrice,
                  original_price: p.originalPrice || null,
                  category: p.category,
                  brand: p.brand || null,
                  color: p.color || null,
                  size: p.size || null,
                  description: p.description || null,
                  notes: p.notes || null,
                  available_qty: p.availableQty || 0,
                  sold_qty: p.soldQty || 0,
                  donated_qty: p.donatedQty || 0,
                  lost_qty: p.lostQty || 0,
                  expired_qty: p.expiredQty || 0,
                  status: p.status,
                  sold_by: p.soldBy || null,
                  sold_to: p.soldTo || null,
                  sold_at: p.soldAt || null,
                  barcode: p.barcode || null,
                  created_at: p.createdAt,
                  updated_at: p.updatedAt,
                  is_deleted: false,
                }));

                try {
                  const { error } = await client
                    .from("products")
                    .upsert(dbBatch, { onConflict: "id" });

                  if (error) {
                    console.error(
                      `[Import] Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`,
                      error,
                    );
                    errors += batch.length;
                  } else {
                    synced += batch.length;
                  }

                  // Log progress every 5 batches or on last batch
                  if (
                    (i / BATCH_SIZE) % 5 === 0 ||
                    i + BATCH_SIZE >= uniqueProducts.length
                  ) {
                    console.log(
                      `[Import] Progress: ${synced}/${uniqueProducts.length} synced (${errors} errors)`,
                    );
                  }
                } catch (err) {
                  console.error(
                    `[Import] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`,
                    err,
                  );
                  errors += batch.length;
                }
              }

              console.log(
                `[Import] Complete: ${synced} synced, ${errors} errors`,
              );
            };

            // Await sync completion and reload data from Supabase
            await syncDirectly();
            console.log("[Import] Supabase sync complete, reloading data...");
            await get().loadFromSupabase(true); // Force replace after import
            console.log("[Import] Data reloaded from Supabase");
          }

          return result;
        }

        // Sync mode - Excel is source of truth
        // Update existing, add new, delete products not in Excel
        const existing = get().products;
        const existingMap = new Map(
          existing.map((p) => [getProductMatchKey(p), p]),
        );

        // DEBUG: Log duplicate match keys (products that share same key)
        const keyCount = new Map<string, number>();
        for (const p of existing) {
          const key = getProductMatchKey(p);
          keyCount.set(key, (keyCount.get(key) || 0) + 1);
        }
        const duplicateKeys = Array.from(keyCount.entries()).filter(([_, count]) => count > 1);
        if (duplicateKeys.length > 0) {
          console.warn(`[Import Sync] WARNING: ${duplicateKeys.length} match keys have multiple products (only 1 kept per key):`);
          duplicateKeys.slice(0, 10).forEach(([key, count]) => {
            console.warn(`  - "${key}": ${count} products`);
          });
        }

        console.log(`[Import Sync] Existing: ${existing.length} products, ${existingMap.size} unique match keys`);
        console.log(`[Import Sync] Excel: ${newProducts.length} products to process`);

        const newKeys = new Set<string>();
        const finalProducts: Product[] = [];

        // Collect products to batch
        const toCreate: Product[] = [];
        const toUpdate: Product[] = [];
        const toDelete: Array<{ id: string }> = [];

        // Track unmatched for debugging
        const unmatchedProducts: Array<{ key: string; name: string; upsRaw: string; size?: string; brand?: string }> = [];

        // Track Excel rows that share the same match key (duplicates in Excel)
        const excelKeyCount = new Map<string, number>();

        // Track which fields are causing changes (for debugging)
        const changeReasons: Map<string, number> = new Map();

        for (const newProduct of newProducts) {
          const key = getProductMatchKey(newProduct);

          // Track Excel duplicates
          const prevCount = excelKeyCount.get(key) || 0;
          excelKeyCount.set(key, prevCount + 1);

          newKeys.add(key);

          const existingProduct = existingMap.get(key);
          if (existingProduct) {
            // Check if product actually changed
            // Use normalizeForComparison for string fields to handle case/whitespace/unicode differences
            const quantityChanged = existingProduct.quantity !== newProduct.quantity;
            const priceChanged = existingProduct.unitPrice !== newProduct.unitPrice;
            const statusChanged = existingProduct.status !== newProduct.status;
            const brandChanged = normalizeForComparison(existingProduct.brand) !== normalizeForComparison(newProduct.brand);
            const colorChanged = normalizeForComparison(existingProduct.color) !== normalizeForComparison(newProduct.color);
            const sizeChanged = normalizeForComparison(existingProduct.size) !== normalizeForComparison(newProduct.size);
            const descChanged = normalizeForComparison(existingProduct.description) !== normalizeForComparison(newProduct.description);

            const hasChanges = quantityChanged || priceChanged || statusChanged || brandChanged || colorChanged || sizeChanged || descChanged;

            // Track change reasons
            if (quantityChanged) changeReasons.set('quantity', (changeReasons.get('quantity') || 0) + 1);
            if (priceChanged) changeReasons.set('unitPrice', (changeReasons.get('unitPrice') || 0) + 1);
            if (statusChanged) changeReasons.set('status', (changeReasons.get('status') || 0) + 1);
            if (brandChanged) changeReasons.set('brand', (changeReasons.get('brand') || 0) + 1);
            if (colorChanged) changeReasons.set('color', (changeReasons.get('color') || 0) + 1);
            if (sizeChanged) changeReasons.set('size', (changeReasons.get('size') || 0) + 1);
            if (descChanged) changeReasons.set('description', (changeReasons.get('description') || 0) + 1);

            if (hasChanges) {
              // DEBUG: Log first 5 updates with field details
              if (result.updated < 5) {
                console.log(`[Import Sync] Update #${result.updated + 1}: "${existingProduct.name}" (ID: ${existingProduct.id})`);
                console.log(`    Match Key: "${key}"`);
                if (quantityChanged) console.log(`    quantity: DB=${existingProduct.quantity} (type: ${typeof existingProduct.quantity}) → Excel=${newProduct.quantity} (type: ${typeof newProduct.quantity})`);
                if (priceChanged) console.log(`    unitPrice: DB=${existingProduct.unitPrice} (type: ${typeof existingProduct.unitPrice}) → Excel=${newProduct.unitPrice} (type: ${typeof newProduct.unitPrice})`);
                if (statusChanged) console.log(`    status: DB="${existingProduct.status}" → Excel="${newProduct.status}"`);
                if (brandChanged) console.log(`    brand: DB="${existingProduct.brand}" (norm: "${normalizeForComparison(existingProduct.brand)}") → Excel="${newProduct.brand}" (norm: "${normalizeForComparison(newProduct.brand)}")`);
                if (colorChanged) console.log(`    color: DB="${existingProduct.color}" (norm: "${normalizeForComparison(existingProduct.color)}") → Excel="${newProduct.color}" (norm: "${normalizeForComparison(newProduct.color)}")`);
                if (sizeChanged) console.log(`    size: DB="${existingProduct.size}" (norm: "${normalizeForComparison(existingProduct.size)}") → Excel="${newProduct.size}" (norm: "${normalizeForComparison(newProduct.size)}")`);
                if (descChanged) console.log(`    description: DB="${existingProduct.description?.substring(0, 50)}..." → Excel="${newProduct.description?.substring(0, 50)}..."`);
                // Log raw product data for deeper analysis
                console.log(`    [RAW DB] quantity=${existingProduct.quantity}, unitPrice=${existingProduct.unitPrice}, upsBatch=${existingProduct.upsBatch}`);
                console.log(`    [RAW Excel] quantity=${newProduct.quantity}, unitPrice=${newProduct.unitPrice}, upsBatch=${newProduct.upsBatch}`);
              }

              // UPDATE: Keep existing ID, update other fields
              const updatedProduct: Product = {
                ...newProduct,
                id: existingProduct.id,
                sku: existingProduct.sku,
                barcode: existingProduct.barcode, // Preserve existing barcode to avoid 409 conflicts
                dropSequence: existingProduct.dropSequence, // Preserve sequence for consistency
                createdAt: existingProduct.createdAt,
                updatedAt: getCurrentISODate(),
              };
              finalProducts.push(updatedProduct);
              result.updated++;
              toUpdate.push(updatedProduct); // Collect for batch
            } else {
              // No changes, keep existing product
              finalProducts.push(existingProduct);
              result.unchanged++;
            }
          } else {
            // CREATE: New product (match key not found in existing)
            finalProducts.push(newProduct);
            result.created++;
            toCreate.push(newProduct); // Collect for batch

            // DEBUG: Track first 20 unmatched products
            if (unmatchedProducts.length < 20) {
              unmatchedProducts.push({
                key,
                name: newProduct.name,
                upsRaw: newProduct.upsRaw || '',
                size: newProduct.size,
                brand: newProduct.brand,
              });
            }
          }
        }

        // DELETE: Products not in Excel
        for (const [key, product] of existingMap) {
          if (!newKeys.has(key)) {
            result.deleted++;
            toDelete.push({ id: product.id }); // Collect for batch
          }
        }

        // DEBUG: Log summary and unmatched details
        console.log(`[Import Sync] Results: created=${result.created}, updated=${result.updated}, unchanged=${result.unchanged}, deleted=${result.deleted}`);

        // Log which fields are causing updates
        if (changeReasons.size > 0) {
          console.log(`[Import Sync] Fields causing updates:`);
          Array.from(changeReasons.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([field, count]) => {
              console.log(`  - ${field}: ${count} products`);
            });
        }

        // Log Excel duplicate keys (rows in Excel that share the same match key)
        const duplicateExcelKeys = Array.from(excelKeyCount.entries())
          .filter(([_, count]) => count > 1)
          .sort((a, b) => b[1] - a[1]);

        if (duplicateExcelKeys.length > 0) {
          console.warn(`[Import Sync] WARNING: ${duplicateExcelKeys.length} match keys appear multiple times in Excel:`);
          duplicateExcelKeys.slice(0, 10).forEach(([key, count], i) => {
            console.warn(`  ${i + 1}. Key: "${key}" appears ${count} times`);
          });
          if (duplicateExcelKeys.length > 10) {
            console.warn(`  ... and ${duplicateExcelKeys.length - 10} more duplicate keys`);
          }
        }

        if (unmatchedProducts.length > 0) {
          console.warn(`[Import Sync] ${result.created} products not found in existing (first ${unmatchedProducts.length}):`);
          unmatchedProducts.forEach((u, i) => {
            console.warn(`  ${i + 1}. Key: "${u.key}"`);
            console.warn(`     Name: "${u.name}", UPS: "${u.upsRaw}", Size: "${u.size}", Brand: "${u.brand}"`);
          });
        }

        if (result.deleted > 0) {
          console.warn(`[Import Sync] ${result.deleted} existing products will be soft-deleted (not in Excel)`);
        }

        // Queue batches (if Supabase enabled)
        if (supabase) {
          const BATCH_SIZE = 50;

          // Defensive deduplication by ID (safety net for edge cases)
          const deduplicateById = <T extends { id: string }>(
            items: T[],
            label: string,
          ): T[] => {
            const seen = new Map<string, { item: T; index: number }>();
            let duplicateCount = 0;
            const duplicateDetails: Array<{
              id: string;
              firstIndex: number;
              duplicateIndex: number;
              firstName: string;
              duplicateName: string;
              firstKey: string;
              duplicateKey: string;
            }> = [];

            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              const existing = seen.get(item.id);
              if (existing) {
                duplicateCount++;
                // Get product details for logging
                const itemProduct = item as unknown as Product;
                const existingProduct = existing.item as unknown as Product;
                duplicateDetails.push({
                  id: item.id,
                  firstIndex: existing.index,
                  duplicateIndex: i,
                  firstName: existingProduct.name || 'N/A',
                  duplicateName: itemProduct.name || 'N/A',
                  firstKey: getProductMatchKey(existingProduct),
                  duplicateKey: getProductMatchKey(itemProduct),
                });
              }
              seen.set(item.id, { item, index: i });
            }

            if (duplicateCount > 0) {
              console.warn(
                `[Import Sync] WARNING: ${duplicateCount} duplicate IDs in ${label} batch (keeping latest):`,
              );
              // Log first 10 duplicates with details
              duplicateDetails.slice(0, 10).forEach((d, i) => {
                console.warn(
                  `  ${i + 1}. ID: ${d.id}`,
                );
                console.warn(
                  `     First (#${d.firstIndex}): "${d.firstName}" | Key: "${d.firstKey}"`,
                );
                console.warn(
                  `     Duplicate (#${d.duplicateIndex}): "${d.duplicateName}" | Key: "${d.duplicateKey}"`,
                );
              });
              if (duplicateDetails.length > 10) {
                console.warn(`  ... and ${duplicateDetails.length - 10} more duplicates`);
              }
            }

            return Array.from(seen.values()).map((v) => v.item);
          };

          // Deduplicate before batching (safety net)
          const uniqueToCreate = deduplicateById(toCreate, 'toCreate');
          const uniqueToUpdate = deduplicateById(toUpdate, 'toUpdate');
          const uniqueToDelete = deduplicateById(toDelete, 'toDelete');

          // Batch creates
          for (let i = 0; i < uniqueToCreate.length; i += BATCH_SIZE) {
            syncManager.queueOperation({
              type: "products",
              action: "batch_create",
              data: uniqueToCreate.slice(i, i + BATCH_SIZE),
            });
          }

          // Batch updates
          for (let i = 0; i < uniqueToUpdate.length; i += BATCH_SIZE) {
            syncManager.queueOperation({
              type: "products",
              action: "batch_update",
              data: uniqueToUpdate.slice(i, i + BATCH_SIZE),
            });
          }

          // Batch deletes
          for (let i = 0; i < uniqueToDelete.length; i += BATCH_SIZE) {
            syncManager.queueOperation({
              type: "products",
              action: "batch_delete",
              data: uniqueToDelete.slice(i, i + BATCH_SIZE),
            });
          }
        }

        set({ products: finalProducts });
        return result;
      },

      loadFromSupabase: async (forceReplace = false) => {
        if (!supabase) return;

        set({ isLoading: true });
        try {
          const products = await productService.getAll();
          console.log(`[loadFromSupabase] Fetched ${products.length} from Supabase, forceReplace=${forceReplace}`);

          if (forceReplace) {
            // Skip merge - use Supabase data directly (after import/sync)
            set({ products, lastSync: new Date(), isLoading: false });
          } else {
            // Normal merge with local products using last-write-wins
            const localProducts = get().products;
            const merged = mergeProducts(localProducts, products);
            set({ products: merged, lastSync: new Date(), isLoading: false });
          }
        } catch (error) {
          console.error("Failed to load products from Supabase:", error);
          set({ isLoading: false });
        }
      },

      handleRealtimeUpdate: (dbProduct) => {
        const converted = convertDbProduct(dbProduct);
        const local = get().products.find((p) => p.id === converted.id);

        // Only update if remote is newer (last-write-wins)
        if (
          !local ||
          new Date(converted.updatedAt) > new Date(local.updatedAt)
        ) {
          set((state) => ({
            products: state.products.some((p) => p.id === converted.id)
              ? state.products.map((p) =>
                  p.id === converted.id ? converted : p,
                )
              : [...state.products, converted],
          }));
        }
      },

      handleRealtimeDelete: (dbProduct) => {
        if (dbProduct.is_deleted) {
          set((state) => ({
            products: state.products.filter((p) => p.id !== dbProduct.id),
          }));
        }
      },

      getFilteredProducts: () => {
        const { products, filters } = get();
        let filtered = [...products];

        if (filters.search) {
          const searchLower = filters.search.toLowerCase();
          filtered = filtered.filter(
            (p) =>
              p.name.toLowerCase().includes(searchLower) ||
              p.sku.toLowerCase().includes(searchLower) ||
              (p.brand && p.brand.toLowerCase().includes(searchLower)) ||
              (p.barcode && p.barcode.toLowerCase().includes(searchLower)),
          );
        }

        if (filters.category) {
          filtered = filtered.filter((p) => p.category === filters.category);
        }

        if (filters.upsBatch) {
          filtered = filtered.filter((p) => p.upsBatch === filters.upsBatch);
        }

        if (filters.dropNumber) {
          filtered = filtered.filter(
            (p) => p.dropNumber === filters.dropNumber,
          );
        }

        if (filters.status) {
          filtered = filtered.filter((p) => p.status === filters.status);
        }

        if (filters.soldBy) {
          filtered = filtered.filter((p) => p.soldBy === filters.soldBy);
        }

        return filtered.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
      },

      getProductById: (id) => {
        return get().products.find((p) => p.id === id);
      },

      getProductByBarcode: (barcode) => {
        return get().products.find((p) => p.barcode === barcode);
      },

      getTotalInventoryValue: () => {
        return get()
          .products.filter((p) => p.availableQty > 0)
          .reduce((sum, p) => sum + p.availableQty * p.unitPrice, 0);
      },

      getTotalProductCount: () => {
        return get().products.filter((p) => p.availableQty > 0).length;
      },

      getProductsByCategory: () => {
        const products = get().products.filter((p) => p.availableQty > 0);
        return products.reduce(
          (acc, p) => {
            acc[p.category] = (acc[p.category] || 0) + p.availableQty;
            return acc;
          },
          {} as Record<CategoryCode, number>,
        );
      },

      // V2 Selectors
      getProductsByDrop: (dropNumber) => {
        return get().products.filter((p) => p.dropNumber === dropNumber);
      },

      getProductsBySoldBy: (staffId) => {
        return get().products.filter((p) => p.soldBy === staffId);
      },

      getDropStats: (dropNumber) => {
        const products = get().products.filter(
          (p) => p.dropNumber === dropNumber,
        );

        return {
          totalProducts: products.length,
          totalUnits: products.reduce((sum, p) => sum + p.quantity, 0),
          totalValue: products.reduce(
            (sum, p) => sum + p.quantity * p.unitPrice,
            0,
          ),
          soldCount: products.reduce((sum, p) => sum + p.soldQty, 0),
          availableCount: products.reduce((sum, p) => sum + p.availableQty, 0),
        };
      },

      getNextDropSequence: (dropNumber) => {
        const products = get().products.filter(
          (p) => p.dropNumber === dropNumber,
        );
        if (products.length === 0) return 1;

        const maxSequence = Math.max(
          ...products.map((p) => p.dropSequence || 0),
        );
        return maxSequence + 1;
      },
    }),
    {
      name: "inventory_products",
      // Safe storage: catches localStorage quota errors on mobile
      // Data stays in Zustand memory + syncs to Supabase even if localStorage is full
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name);
          return value ? JSON.parse(value) : null;
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            console.warn('[Storage] localStorage write failed (quota exceeded?), data lives in memory only');
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      // Migration for existing data to V2 format + qty fields
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Deduplicate by ID first (safety net)
          const seen = new Map<string, Product>();
          for (const product of state.products) {
            seen.set(product.id, product);
          }
          state.products = Array.from(seen.values());

          // Migrate products
          state.products = state.products.map((product) => {
            let migrated = { ...product };

            // V2 UPS migration
            if (!migrated.upsRaw) {
              const upsRaw = String(migrated.upsBatch || "");
              const parsed = parseUPS(upsRaw);
              migrated = {
                ...migrated,
                upsRaw,
                identifierType: parsed.identifierType,
                dropNumber: parsed.dropNumber,
                productNumber: parsed.productNumber,
                dropSequence: migrated.dropSequence || 1,
              };
            }

            // Qty fields migration: if missing, derive from status + quantity
            if (migrated.availableQty === undefined || migrated.availableQty === null) {
              migrated.availableQty = 0;
              migrated.soldQty = 0;
              migrated.donatedQty = 0;
              migrated.lostQty = 0;
              migrated.expiredQty = 0;

              switch (migrated.status) {
                case 'available':
                case 'reserved':
                case 'promotional':
                  migrated.availableQty = migrated.quantity;
                  break;
                case 'sold':
                  migrated.soldQty = migrated.quantity;
                  break;
                case 'donated':
                  migrated.donatedQty = migrated.quantity;
                  break;
                case 'lost':
                  migrated.lostQty = migrated.quantity;
                  break;
                case 'expired':
                  migrated.expiredQty = migrated.quantity;
                  break;
                case 'review':
                  // All qtys stay 0, reviewQty = quantity - 0 = quantity
                  break;
              }
            }

            return migrated;
          });
        }
      },
    },
  ),
);

// Helper functions
function convertDbProduct(dbProduct: any): Product {
  return {
    id: dbProduct.id,
    name: dbProduct.name,
    sku: dbProduct.sku,
    // V2 fields
    upsRaw: dbProduct.ups_raw || String(dbProduct.ups_batch || ""),
    identifierType: dbProduct.identifier_type || "legacy",
    dropNumber: dbProduct.drop_number || String(dbProduct.ups_batch || ""),
    productNumber: dbProduct.product_number || undefined,
    dropSequence: dbProduct.drop_sequence || undefined,
    // Legacy field
    upsBatch: dbProduct.ups_batch,
    quantity: dbProduct.quantity,
    unitPrice: dbProduct.unit_price,
    originalPrice: dbProduct.original_price || undefined,
    category: dbProduct.category,
    brand: dbProduct.brand || undefined,
    color: dbProduct.color || undefined,
    size: dbProduct.size || undefined,
    description: dbProduct.description || undefined,
    notes: dbProduct.notes || undefined,
    barcode: dbProduct.barcode || undefined,
    availableQty: dbProduct.available_qty || 0,
    soldQty: dbProduct.sold_qty || 0,
    donatedQty: dbProduct.donated_qty || 0,
    lostQty: dbProduct.lost_qty || 0,
    expiredQty: dbProduct.expired_qty || 0,
    status: dbProduct.status,
    soldBy: dbProduct.sold_by || undefined,
    soldTo: dbProduct.sold_to || undefined,
    soldAt: dbProduct.sold_at || undefined,
    createdAt: dbProduct.created_at,
    updatedAt: dbProduct.updated_at,
  };
}

function mergeProducts(local: Product[], remote: Product[]): Product[] {
  const remoteMap = new Map(remote.map((p) => [p.id, p]));
  const localMap = new Map(local.map((p) => [p.id, p]));

  // Last-write-wins: keep whichever version is newer
  const merged = new Map<string, Product>();

  for (const [id, localProd] of localMap) {
    const remoteProd = remoteMap.get(id);
    if (!remoteProd) {
      merged.set(id, localProd);
    } else {
      const localTime = new Date(localProd.updatedAt).getTime();
      const remoteTime = new Date(remoteProd.updatedAt).getTime();
      merged.set(id, remoteTime > localTime ? remoteProd : localProd);
    }
  }

  // Add remote products that don't exist locally
  for (const [id, remoteProd] of remoteMap) {
    if (!merged.has(id)) {
      merged.set(id, remoteProd);
    }
  }

  return Array.from(merged.values());
}
