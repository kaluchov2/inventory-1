import { supabase, getSupabaseClient } from './supabase';
import { syncQueue, SyncOperation } from './syncQueue';
import { connectionStatus } from './connectionStatus';

/**
 * Sync Manager
 * V2: Orchestrates sync operations between local storage and Supabase
 * Now handles: products, customers, transactions, drops, staff
 * Implements last-write-wins conflict resolution using updated_at timestamps
 */
class SyncManager {
  private isSyncing = false;
  private syncListeners: Set<(status: SyncStatus) => void> = new Set();
  private currentStatus: SyncStatus = {
    isSyncing: false,
    pendingCount: 0,
    lastSync: null,
    error: null,
  };

  constructor() {
    this.initialize();
  }

  private initialize() {
    connectionStatus.subscribe((status) => {
      if (status.isOnline && status.isSupabaseConnected) {
        this.syncPendingOperations();
      }
    });

    setInterval(() => {
      const status = connectionStatus.getStatus();
      if (status.isOnline && status.isSupabaseConnected && !this.isSyncing) {
        this.syncPendingOperations();
      }
    }, 60000); // Sync every minute if online
  }

  public async syncPendingOperations() {
    if (this.isSyncing || !supabase) return;

    const status = connectionStatus.getStatus();
    if (!status.isOnline || !status.isSupabaseConnected) {
      return;
    }

    this.isSyncing = true;
    this.updateStatus({ isSyncing: true, error: null });

    console.log('[SyncManager] Starting sync, queue size:', syncQueue.size());

    try {
      let processed = 0;
      let consecutiveErrors = 0;
      const MAX_CONSECUTIVE_ERRORS = 5;

      while (!syncQueue.isEmpty()) {
        const operation = syncQueue.peek();
        if (!operation) break;

        // Safety check: If too many consecutive errors, stop sync
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[SyncManager] Too many consecutive errors, stopping sync');
          this.updateStatus({
            error: `Sync stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors`,
          });
          break;
        }

        console.log(`[SyncManager] Processing operation ${processed + 1}/${syncQueue.size()}:`, operation.type, operation.action);

        try {
          await this.executeOperation(operation);

          try {
            syncQueue.remove(operation.id);
          } catch (queueError) {
            console.error('[SyncManager] Failed to remove operation from queue (localStorage issue):', queueError);
            // Queue operation failed but sync succeeded - this is a localStorage quota issue
            throw new Error('LocalStorage quota exceeded - cannot update sync queue');
          }

          processed++;
          consecutiveErrors = 0; // Reset error counter on success

          // Update pending count after each operation
          this.updateStatus({ pendingCount: syncQueue.size() });
        } catch (error) {
          console.error('[SyncManager] Sync operation failed:', error);
          consecutiveErrors++;

          try {
            const shouldRetry = syncQueue.incrementRetry(operation.id);
            if (!shouldRetry) {
              console.error('[SyncManager] Max retries reached, removing operation:', operation.id);
              try {
                syncQueue.remove(operation.id);
              } catch (removeError) {
                console.error('[SyncManager] Failed to remove operation (localStorage issue):', removeError);
                // Can't remove from queue - localStorage is full
                throw new Error('LocalStorage quota exceeded - cannot manage sync queue');
              }
              consecutiveErrors = 0; // Reset after removing failed operation
            } else {
              // Add exponential backoff delay before retrying
              const delay = Math.min(1000 * Math.pow(2, operation.retryCount - 1), 10000);
              console.log(`[SyncManager] Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } catch (queueError) {
            console.error('[SyncManager] Queue operation failed:', queueError);
            // If we can't manage the queue due to localStorage issues, stop sync
            this.updateStatus({
              error: 'LocalStorage quota exceeded. Please clear sync queue.',
            });
            break;
          }
        }
      }

      console.log('[SyncManager] Sync complete, processed:', processed);

      this.updateStatus({
        isSyncing: false,
        pendingCount: syncQueue.size(),
        lastSync: new Date(),
        error: null,
      });
    } catch (error) {
      console.error('[SyncManager] Sync error:', error);
      this.updateStatus({
        isSyncing: false,
        pendingCount: syncQueue.size(),
        error: error instanceof Error ? error.message : 'Unknown sync error',
      });
    } finally {
      this.isSyncing = false;
      console.log('[SyncManager] Finally block - ensuring UI status updated');

      // CRITICAL: Always ensure UI status is updated
      this.updateStatus({
        isSyncing: false,
        pendingCount: syncQueue.size()
      });
    }
  }

  private async executeOperation(operation: SyncOperation) {
    // Validate client is available before delegating to specific sync methods
    getSupabaseClient();

    const { type, action, data } = operation;

    switch (type) {
      case 'products':
        return this.syncProduct(action, data);
      case 'customers':
        return this.syncCustomer(action, data);
      case 'transactions':
        return this.syncTransaction(action, data);
      // V2: New entity types
      case 'drops':
        return this.syncDrop(action, data);
      case 'staff':
        return this.syncStaff(action, data);
      default:
        throw new Error(`Unknown sync type: ${type}`);
    }
  }

  private async syncProduct(action: string, data: any) {
    const client = getSupabaseClient();

    switch (action) {
      case 'create':
      case 'update':
        // Single product upsert
        const dbData = this.convertToDbFormat(data, 'product');
        const { error: upsertError } = await client
          .from('products')
          .upsert(dbData, { onConflict: 'id' });
        if (upsertError) throw upsertError;
        break;

      case 'batch_create':
      case 'batch_update':
        // Batch upsert - data is array of products
        // CRITICAL: Deduplicate by ID before sending to Supabase
        // This prevents "ON CONFLICT DO UPDATE command cannot affect row a second time" error
        const deduplicatedData = this.deduplicateById(data);
        if (deduplicatedData.length !== data.length) {
          console.warn(`[SyncManager] Removed ${data.length - deduplicatedData.length} duplicate product IDs from batch`);
        }
        const batchData = deduplicatedData.map((p: any) =>
          this.convertToDbFormat(p, 'product')
        );
        const { error: batchUpsertError } = await client
          .from('products')
          .upsert(batchData, { onConflict: 'id' });
        if (batchUpsertError) throw batchUpsertError;
        break;

      case 'delete':
        // Single delete (soft delete)
        const { error: deleteError } = await client
          .from('products')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', data.id);
        if (deleteError) throw deleteError;
        break;

      case 'batch_delete':
        // Batch delete - data is array of {id: ...}
        const ids = data.map((item: any) => item.id);
        const { error: batchDeleteError } = await client
          .from('products')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .in('id', ids);
        if (batchDeleteError) throw batchDeleteError;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async syncCustomer(action: string, data: any) {
    const client = getSupabaseClient();

    const dbData = this.convertToDbFormat(data, 'customer');

    switch (action) {
      case 'create':
      case 'update':
        const { error: upsertError } = await client
          .from('customers')
          .upsert(dbData, { onConflict: 'id' });
        if (upsertError) throw upsertError;
        break;

      case 'delete':
        const { error: deleteError } = await client
          .from('customers')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', data.id);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async syncTransaction(action: string, data: any) {
    const client = getSupabaseClient();

    const { items, ...transactionData } = data;
    const dbData = this.convertToDbFormat(transactionData, 'transaction');

    switch (action) {
      case 'create':
      case 'update':
        const { error: upsertError } = await client
          .from('transactions')
          .upsert(dbData, { onConflict: 'id' });
        if (upsertError) throw upsertError;

        if (items && items.length > 0) {
          const { error: deleteItemsError } = await client
            .from('transaction_items')
            .delete()
            .eq('transaction_id', data.id);
          if (deleteItemsError) throw deleteItemsError;

          const itemsData = items.map((item: any) => ({
            transaction_id: data.id,
            product_id: item.productId,
            product_name: item.productName,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            category: item.category,
            brand: item.brand,
            color: item.color,
            size: item.size,
          }));

          const { error: insertItemsError } = await client
            .from('transaction_items')
            .insert(itemsData);
          if (insertItemsError) throw insertItemsError;
        }
        break;

      case 'delete':
        const { error: deleteError } = await client
          .from('transactions')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', data.id);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // V2: Sync drop entity
  private async syncDrop(action: string, data: any) {
    const client = getSupabaseClient();

    const dbData = this.convertToDbFormat(data, 'drop');

    switch (action) {
      case 'create':
      case 'update':
        // Conflict on drop_number (business key) not id (technical key)
        // This prevents duplicate constraint violations when re-importing
        const { error: upsertError } = await client
          .from('drops')
          .upsert(dbData, { onConflict: 'drop_number' });
        if (upsertError) throw upsertError;
        break;

      case 'delete':
        // Delete by drop_number for consistency
        const { error: deleteError } = await client
          .from('drops')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('drop_number', data.dropNumber);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // V2: Sync staff entity
  private async syncStaff(action: string, data: any) {
    const client = getSupabaseClient();

    const dbData = this.convertToDbFormat(data, 'staff');

    switch (action) {
      case 'create':
      case 'update':
        const { error: upsertError } = await client
          .from('staff')
          .upsert(dbData, { onConflict: 'id' });
        if (upsertError) throw upsertError;
        break;

      case 'delete':
        const { error: deleteError } = await client
          .from('staff')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() })
          .eq('id', data.id);
        if (deleteError) throw deleteError;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private convertToDbFormat(data: any, type: string): any {
    if (type === 'product') {
      return {
        id: data.id,
        name: data.name,
        sku: data.sku,
        // V2 fields
        ups_raw: data.upsRaw || null,
        identifier_type: data.identifierType || null,
        drop_number: data.dropNumber || null,
        product_number: data.productNumber || null,
        drop_sequence: data.dropSequence || null,
        // Legacy field
        ups_batch: data.upsBatch,
        quantity: data.quantity,
        unit_price: data.unitPrice,
        original_price: data.originalPrice || null,
        category: data.category,
        brand: data.brand || null,
        color: data.color || null,
        size: data.size || null,
        description: data.description || null,
        notes: data.notes || null,
        status: data.status,
        sold_by: data.soldBy || null,
        sold_to: data.soldTo || null,
        sold_at: data.soldAt || null,
        low_stock_threshold: data.lowStockThreshold,
        barcode: data.barcode && data.barcode.trim() !== '' ? data.barcode : null,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        is_deleted: false,
      };
    } else if (type === 'customer') {
      return {
        id: data.id,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        balance: data.balance,
        total_purchases: data.totalPurchases,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        is_deleted: false,
      };
    } else if (type === 'transaction') {
      return {
        id: data.id,
        customer_id: data.customerId || null,
        customer_name: data.customerName,
        subtotal: data.subtotal,
        discount: data.discount,
        discount_note: data.discountNote || null,
        total: data.total,
        payment_method: data.paymentMethod,
        cash_amount: data.cashAmount,
        transfer_amount: data.transferAmount,
        card_amount: data.cardAmount,
        actual_card_amount: data.actualCardAmount || null,
        is_installment: data.isInstallment,
        installment_amount: data.installmentAmount || null,
        remaining_balance: data.remainingBalance || null,
        sold_by: data.soldBy || null,
        ups_batch: data.upsBatch || null,
        notes: data.notes || null,
        date: data.date,
        payment_date: data.paymentDate || null,
        type: data.type,
        created_at: data.createdAt,
        is_deleted: false,
      };
    } else if (type === 'drop') {
      return {
        id: data.id,
        drop_number: data.dropNumber,
        arrival_date: data.arrivalDate,
        status: data.status,
        total_products: data.totalProducts || 0,
        total_units: data.totalUnits || 0,
        total_value: data.totalValue || 0,
        sold_count: data.soldCount || 0,
        available_count: data.availableCount || 0,
        notes: data.notes || null,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        is_deleted: false,
      };
    } else if (type === 'staff') {
      return {
        id: data.id,
        name: data.name,
        is_active: data.isActive,
        total_sales: data.totalSales || 0,
        total_amount: data.totalAmount || 0,
        notes: data.notes || null,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        is_deleted: false,
      };
    }

    return data;
  }

  /**
   * Deduplicate array of items by ID
   * Keeps the last occurrence of each ID (last-write-wins)
   * Prevents PostgreSQL "ON CONFLICT DO UPDATE command cannot affect row a second time" error
   */
  private deduplicateById<T extends { id: string }>(items: T[]): T[] {
    const seen = new Map<string, T>();
    for (const item of items) {
      seen.set(item.id, item);
    }
    return Array.from(seen.values());
  }

  private updateStatus(partial: Partial<SyncStatus>) {
    this.currentStatus = { ...this.currentStatus, ...partial };
    this.notifyListeners();
  }

  private notifyListeners() {
    this.syncListeners.forEach((listener) => listener(this.currentStatus));
  }

  public subscribe(listener: (status: SyncStatus) => void) {
    this.syncListeners.add(listener);
    listener(this.currentStatus);
    return () => this.syncListeners.delete(listener);
  }

  public getStatus(): SyncStatus {
    return this.currentStatus;
  }

  public queueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>) {
    const id = syncQueue.enqueue(operation);
    this.updateStatus({ pendingCount: syncQueue.size() });

    const status = connectionStatus.getStatus();
    if (status.isOnline && status.isSupabaseConnected && !this.isSyncing) {
      this.syncPendingOperations();
    }

    return id;
  }
}

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSync: Date | null;
  error: string | null;
}

export const syncManager = new SyncManager();
