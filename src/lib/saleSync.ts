import { Customer, Product, Transaction } from '../types';
import { getSupabaseClient } from './supabase';

export interface SaleProductSync {
  id: string;
  qty: number;
  snapshot: Product;
  decrementAvailable?: boolean;
}

export interface SaleCustomerSync {
  snapshot: Customer;
  balanceDelta: number;
  purchaseDelta: number;
}

export interface SaleSyncPayload {
  transaction: Transaction;
  products: SaleProductSync[];
  customer?: SaleCustomerSync;
}

function logSaleSync(message: string, meta?: unknown) {
  const ts = new Date().toISOString();
  if (meta === undefined) {
    console.log(`[SaleSync][${ts}] ${message}`);
    return;
  }
  console.log(`[SaleSync][${ts}] ${message}`, meta);
}

export function isMissingDatabaseFunction(error: unknown, functionName: string): boolean {
  if (!error || typeof error !== 'object') return false;

  const dbError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  const haystack = [dbError.message, dbError.details, dbError.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    dbError.code === 'PGRST202' ||
    dbError.code === '42883' ||
    (haystack.includes(functionName.toLowerCase()) &&
      (haystack.includes('could not find the function') ||
        haystack.includes('does not exist') ||
        haystack.includes('no function matches')))
  );
}

export async function syncRecordedSale(payload: SaleSyncPayload, signal?: AbortSignal) {
  const client = getSupabaseClient();
  const startedAt = Date.now();
  logSaleSync('record_sale RPC start', {
    transactionId: payload.transaction.id,
    items: payload.transaction.items.length,
    products: payload.products.length,
    hasCustomer: !!payload.customer,
  });
  let rpcQuery: any = (client as any).rpc('record_sale', {
    sale_payload: payload,
  });
  if (signal && typeof rpcQuery.abortSignal === 'function') {
    rpcQuery = rpcQuery.abortSignal(signal);
  }
  const { error } = await rpcQuery;

  if (!error) {
    logSaleSync('record_sale RPC success', {
      transactionId: payload.transaction.id,
      elapsedMs: Date.now() - startedAt,
    });
    return;
  }

  logSaleSync('record_sale RPC returned error', {
    transactionId: payload.transaction.id,
    elapsedMs: Date.now() - startedAt,
    error,
  });

  if (!isMissingDatabaseFunction(error, 'record_sale')) {
    throw error;
  }

  console.error('[Sync] record_sale RPC not found; preserving the sale for retry');
  logSaleSync('record_sale RPC missing; refusing non-atomic legacy fallback', {
    transactionId: payload.transaction.id,
  });
  throw error;
}
