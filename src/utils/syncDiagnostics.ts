import { productService } from '../services/productService';
import { useProductStore } from '../store/productStore';
import { syncManager } from '../lib/syncManager';
import { connectionStatus } from '../lib/connectionStatus';
import { syncQueue } from '../lib/syncQueue';

export async function quickSyncCheck(): Promise<void> {
  console.log('=== SYNC DIAGNOSTICS ===');

  const storeCount = useProductStore.getState().products.length;
  console.log('Zustand store products:', storeCount);

  // Check localStorage
  try {
    const stored = localStorage.getItem('inventory_products');
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log('LocalStorage products:', parsed.state?.products?.length || 0);
    } else {
      console.log('LocalStorage: No data found');
    }
  } catch (e) {
    console.log('LocalStorage error:', e);
  }

  // Check Supabase counts
  console.log('Fetching Supabase counts...');
  const validation = await productService.validateProductCount();

  const diff = storeCount - validation.activeInDB;
  if (diff !== 0) {
    console.warn(`DISCREPANCY: ${Math.abs(diff)} products ${diff > 0 ? 'extra in store' : 'missing from store'}`);
  } else {
    console.log('OK: Store matches Supabase active count');
  }

  console.log('========================');
}

export function dumpSyncState(): void {
  const connection = connectionStatus.getStatus();
  const syncStatus = syncManager.getStatus();
  const queueItems = syncQueue.getAll();

  console.log('=== SYNC STATE SNAPSHOT ===');
  console.log('Connection:', {
    isOnline: connection.isOnline,
    isSupabaseConnected: connection.isSupabaseConnected,
    lastChecked: connection.lastChecked,
  });
  console.log('Sync status:', syncStatus);
  console.log('Queue info:', syncQueue.getQueueInfo());
  console.log('Queue items:', queueItems.map((op) => ({
    id: op.id,
    type: op.type,
    action: op.action,
    retryCount: op.retryCount,
    timestamp: op.timestamp,
    rowId: op.action === 'record_sale' ? op.data?.transaction?.id : op.data?.id,
  })));
  console.log('===========================');
}

// Expose for browser console
declare global {
  interface Window {
    quickSyncCheck: typeof quickSyncCheck;
    dumpSyncState: typeof dumpSyncState;
    productService: typeof productService;
  }
}

window.quickSyncCheck = quickSyncCheck;
window.dumpSyncState = dumpSyncState;
window.productService = productService;

console.log('[SyncDiagnostics] Diagnostic tools loaded. Run quickSyncCheck() and dumpSyncState() in console.');
