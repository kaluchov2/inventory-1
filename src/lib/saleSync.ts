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

function toDbTransaction(transaction: Transaction) {
  return {
    id: transaction.id,
    customer_id: transaction.customerId || null,
    customer_name: transaction.customerName,
    subtotal: transaction.subtotal,
    discount: transaction.discount,
    discount_note: transaction.discountNote || null,
    total: transaction.total,
    payment_method: transaction.paymentMethod,
    cash_amount: transaction.cashAmount,
    transfer_amount: transaction.transferAmount,
    card_amount: transaction.cardAmount,
    actual_card_amount: transaction.actualCardAmount || null,
    is_installment: transaction.isInstallment,
    installment_amount: transaction.installmentAmount || null,
    remaining_balance: transaction.remainingBalance || null,
    sold_by: transaction.soldBy || null,
    ups_batch: transaction.upsBatch || null,
    notes: transaction.notes || null,
    date: transaction.date,
    payment_date: transaction.paymentDate || null,
    type: transaction.type,
    created_at: transaction.createdAt,
    is_deleted: false,
  };
}

function toDbTransactionItems(transaction: Transaction) {
  return transaction.items.map((item) => ({
    transaction_id: transaction.id,
    product_id: item.productId || null,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.totalPrice,
    category: item.category || null,
    brand: item.brand || null,
    color: item.color || null,
    size: item.size || null,
  }));
}

function toDbCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone || null,
    email: customer.email || null,
    balance: customer.balance,
    total_purchases: customer.totalPurchases,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
    is_deleted: false,
  };
}

function toDbProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    ups_raw: product.upsRaw || null,
    identifier_type: product.identifierType || null,
    drop_number: product.dropNumber || null,
    product_number: product.productNumber || null,
    drop_sequence: product.dropSequence || null,
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
    available_qty: product.availableQty || 0,
    sold_qty: product.soldQty || 0,
    donated_qty: product.donatedQty || 0,
    lost_qty: product.lostQty || 0,
    expired_qty: product.expiredQty || 0,
    status: product.status,
    sold_by: product.soldBy || null,
    sold_to: product.soldTo || null,
    sold_at: product.soldAt || null,
    barcode: product.barcode && product.barcode.trim() !== '' ? product.barcode : null,
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    is_deleted: false,
  };
}

async function syncProductAfterSale(productSync: SaleProductSync) {
  const client = getSupabaseClient();
  if (productSync.decrementAvailable === false) {
    const { error: upsertError } = await client
      .from('products')
      .upsert(toDbProduct(productSync.snapshot), { onConflict: 'id' });
    if (upsertError) throw upsertError;
    return;
  }

  const { error: rpcError } = await (client as any).rpc('decrement_stock', {
    product_id: productSync.id,
    qty: productSync.qty,
  });

  if (rpcError) {
    if (!isMissingDatabaseFunction(rpcError, 'decrement_stock')) {
      throw rpcError;
    }

    const { error: upsertError } = await client
      .from('products')
      .upsert(toDbProduct(productSync.snapshot), { onConflict: 'id' });
    if (upsertError) throw upsertError;
    return;
  }

  const { error: metadataError } = await client
    .from('products')
    .update({
      sold_to: productSync.snapshot.soldTo || null,
      sold_at: productSync.snapshot.soldAt || null,
      status: productSync.snapshot.status,
      updated_at: productSync.snapshot.updatedAt,
    })
    .eq('id', productSync.id);
  if (metadataError) throw metadataError;
}

async function syncRecordedSaleLegacy(payload: SaleSyncPayload) {
  const client = getSupabaseClient();

  const { error: transactionError } = await client
    .from('transactions')
    .upsert(toDbTransaction(payload.transaction), { onConflict: 'id' });
  if (transactionError) throw transactionError;

  const { error: deleteItemsError } = await client
    .from('transaction_items')
    .delete()
    .eq('transaction_id', payload.transaction.id);
  if (deleteItemsError) throw deleteItemsError;

  const itemsData = toDbTransactionItems(payload.transaction);
  if (itemsData.length > 0) {
    const { error: itemsError } = await client
      .from('transaction_items')
      .insert(itemsData);
    if (itemsError) throw itemsError;
  }

  if (payload.customer) {
    const { error: customerError } = await client
      .from('customers')
      .upsert(toDbCustomer(payload.customer.snapshot), { onConflict: 'id' });
    if (customerError) throw customerError;
  }

  for (const productSync of payload.products) {
    await syncProductAfterSale(productSync);
  }
}

export async function syncRecordedSale(payload: SaleSyncPayload) {
  const client = getSupabaseClient();
  const { error } = await (client as any).rpc('record_sale', {
    sale_payload: payload,
  });

  if (!error) return;

  if (!isMissingDatabaseFunction(error, 'record_sale')) {
    throw error;
  }

  console.warn('[Sync] record_sale RPC not found, falling back to legacy per-table sale sync');
  await syncRecordedSaleLegacy(payload);
}