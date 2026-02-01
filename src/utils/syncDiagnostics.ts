import { productService } from '../services/productService';
import { useProductStore } from '../store/productStore';

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

// Expose for browser console
declare global {
  interface Window {
    quickSyncCheck: typeof quickSyncCheck;
    productService: typeof productService;
  }
}

window.quickSyncCheck = quickSyncCheck;
window.productService = productService;

console.log('[SyncDiagnostics] Diagnostic tools loaded. Run quickSyncCheck() in console to check sync status.');
