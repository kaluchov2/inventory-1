import { getSupabaseClient } from '../lib/supabase';
import { Transaction, TransactionItem } from '../types';
import {
  isWalkInCustomerName,
  WALK_IN_CUSTOMER_LABELS,
} from '../utils/customerNameUtils';

/**
 * Transaction Service
 * Handles CRUD operations for transactions with Supabase
 */

export interface ModifySaleTransactionItemInput {
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
}

export interface ModifySaleTransactionPayload {
  transactionId: string;
  items: ModifySaleTransactionItemInput[];
  autoKeepPaidIfFullyPaid?: boolean;
  discount?: number;
  discountNote?: string;
  notes?: string;
  date?: string;
  paymentDate?: string | null;
}

export interface ModifySaleTransactionResult {
  transactionId: string;
  oldPaidAmount: number;
  oldTotal: number;
  newTotal: number;
  paidAmount: number;
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  oldUnpaid: number;
  newUnpaid: number;
  deltaUnpaid: number;
  autoSettlementApplied: boolean;
  autoSettlementDelta: number;
  autoSettlementMethod: 'cash' | 'transfer' | 'card' | null;
  itemCount: number;
}

export interface UndoSaleTransactionPayload {
  transactionId: string;
  reason?: string;
}

export interface UndoSaleTransactionResult {
  transactionId: string;
  total: number;
  paidAmount: number;
  unpaidReverted: number;
  restoredProductRows: number;
  skippedProductRefs?: number;
}

export const transactionService = {
  async getAll(): Promise<Transaction[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getById(id: string): Promise<Transaction | null> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return convertFromDbFormat(data);
  },

  async getByCustomer(customerId: string): Promise<Transaction[]> {
    const client = getSupabaseClient();

    const { data, error } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('customer_id', customerId)
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (error) throw error;

    return data.map(convertFromDbFormat);
  },

  async getSalesForCustomer(customerId: string, customerName?: string): Promise<Transaction[]> {
    const client = getSupabaseClient();

    const { data: byIdData, error: byIdError } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .eq('customer_id', customerId)
      .eq('type', 'sale')
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (byIdError) throw byIdError;

    const trimmedName = (customerName || '').trim();
    if (!trimmedName) {
      return byIdData.map(convertFromDbFormat);
    }

    // Use contains match to tolerate historical spacing/punctuation variants in denormalized names.
    const namePattern = `%${trimmedName}%`;

    const { data: byNameData, error: byNameError } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .ilike('customer_name', namePattern)
      .eq('type', 'sale')
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (byNameError) throw byNameError;

    const unique = new Map<string, any>();
    [...byIdData, ...byNameData].forEach((row) => {
      unique.set(row.id, row);
    });

    return Array.from(unique.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(convertFromDbFormat);
  },

  async getWalkInSales(walkInName?: string): Promise<Transaction[]> {
    const client = getSupabaseClient();

    const { data: byNullCustomerData, error: byNullCustomerError } = await client
      .from('transactions')
      .select('*, transaction_items(*)')
      .is('customer_id', null)
      .eq('type', 'sale')
      .eq('is_deleted', false)
      .order('date', { ascending: false });

    if (byNullCustomerError) throw byNullCustomerError;

    const candidates = new Set<string>(WALK_IN_CUSTOMER_LABELS);
    const trimmedName = (walkInName || '').trim();
    if (trimmedName && !isWalkInCustomerName(trimmedName)) {
      candidates.add(trimmedName);
    }

    const byNameResults = await Promise.all(
      Array.from(candidates).map((candidate) =>
        client
          .from('transactions')
          .select('*, transaction_items(*)')
          .ilike('customer_name', `%${candidate}%`)
          .eq('type', 'sale')
          .eq('is_deleted', false)
          .order('date', { ascending: false })
      )
    );

    const unique = new Map<string, any>();
    byNullCustomerData.forEach((row) => unique.set(row.id, row));
    byNameResults.forEach(({ data, error }) => {
      if (error) throw error;
      (data || []).forEach((row) => unique.set(row.id, row));
    });

    return Array.from(unique.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .map(convertFromDbFormat);
  },

  async create(transaction: Transaction): Promise<Transaction> {
    const client = getSupabaseClient();

    const { items, ...transactionData } = transaction;
    const dbData = convertToDbFormat(transactionData as Transaction);

    const { error } = await client
      .from('transactions')
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;

    if (items && items.length > 0) {
      const itemsData = items.map((item) => ({
        transaction_id: transaction.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        category: item.category || null,
        brand: item.brand || null,
        color: item.color || null,
        size: item.size || null,
      }));

      const { error: itemsError } = await client
        .from('transaction_items')
        .insert(itemsData);

      if (itemsError) throw itemsError;
    }

    return this.getById(transaction.id) as Promise<Transaction>;
  },

  async update(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const client = getSupabaseClient();

    const { items, ...transactionData } = updates;
    const dbData = convertToDbFormat(transactionData as Transaction);

    const { error } = await client
      .from('transactions')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (items) {
      await client.from('transaction_items').delete().eq('transaction_id', id);

      if (items.length > 0) {
        const itemsData = items.map((item) => ({
          transaction_id: id,
          product_id: item.productId,
          product_name: item.productName,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.totalPrice,
          category: item.category || null,
          brand: item.brand || null,
          color: item.color || null,
          size: item.size || null,
        }));

        const { error: itemsError } = await client
          .from('transaction_items')
          .insert(itemsData);

        if (itemsError) throw itemsError;
      }
    }

    return this.getById(id) as Promise<Transaction>;
  },

  async delete(id: string): Promise<void> {
    const client = getSupabaseClient();

    const { error } = await client
      .from('transactions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },

  async modifySaleTransaction(
    payload: ModifySaleTransactionPayload
  ): Promise<{ result: ModifySaleTransactionResult; transaction: Transaction }> {
    const client = getSupabaseClient();

    const { data, error } = await (client as any).rpc('modify_sale_transaction', {
      edit_payload: payload,
    });

    if (error) throw error;

    const result = parseModifySaleResult(data);
    const transaction = await this.getById(payload.transactionId);

    if (!transaction) {
      throw new Error('modified_transaction_not_found');
    }

    return { result, transaction };
  },

  async undoSaleTransaction(
    payload: UndoSaleTransactionPayload
  ): Promise<UndoSaleTransactionResult> {
    const client = getSupabaseClient();

    const { data, error } = await (client as any).rpc('undo_sale_transaction', {
      undo_payload: payload,
    });

    if (error) throw error;

    return parseUndoSaleResult(data);
  },
};

function parseModifySaleResult(data: any): ModifySaleTransactionResult {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('modify_sale_transaction_invalid_response');
  }

  return {
    transactionId: String(raw.transactionId ?? ''),
    oldPaidAmount: Number(raw.oldPaidAmount ?? 0),
    oldTotal: Number(raw.oldTotal ?? 0),
    newTotal: Number(raw.newTotal ?? 0),
    paidAmount: Number(raw.paidAmount ?? 0),
    cashAmount: Number(raw.cashAmount ?? 0),
    transferAmount: Number(raw.transferAmount ?? 0),
    cardAmount: Number(raw.cardAmount ?? 0),
    oldUnpaid: Number(raw.oldUnpaid ?? 0),
    newUnpaid: Number(raw.newUnpaid ?? 0),
    deltaUnpaid: Number(raw.deltaUnpaid ?? 0),
    autoSettlementApplied: Boolean(raw.autoSettlementApplied ?? false),
    autoSettlementDelta: Number(raw.autoSettlementDelta ?? 0),
    autoSettlementMethod:
      raw.autoSettlementMethod === 'cash' ||
      raw.autoSettlementMethod === 'transfer' ||
      raw.autoSettlementMethod === 'card'
        ? raw.autoSettlementMethod
        : null,
    itemCount: Number(raw.itemCount ?? 0),
  };
}

function parseUndoSaleResult(data: any): UndoSaleTransactionResult {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== 'object') {
    throw new Error('undo_sale_transaction_invalid_response');
  }

  return {
    transactionId: String(raw.transactionId ?? ''),
    total: Number(raw.total ?? 0),
    paidAmount: Number(raw.paidAmount ?? 0),
    unpaidReverted: Number(raw.unpaidReverted ?? 0),
    restoredProductRows: Number(raw.restoredProductRows ?? 0),
    skippedProductRefs:
      raw.skippedProductRefs === undefined
        ? undefined
        : Number(raw.skippedProductRefs ?? 0),
  };
}

function convertFromDbFormat(data: any): Transaction {
  const items: TransactionItem[] = data.transaction_items?.map((item: any) => ({
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    totalPrice: item.total_price,
    category: item.category || undefined,
    brand: item.brand || undefined,
    color: item.color || undefined,
    size: item.size || undefined,
  })) || [];

  return {
    id: data.id,
    customerId: data.customer_id || undefined,
    customerName: data.customer_name,
    items,
    subtotal: data.subtotal,
    discount: data.discount,
    discountNote: data.discount_note || undefined,
    total: data.total,
    paymentMethod: data.payment_method,
    cashAmount: data.cash_amount,
    transferAmount: data.transfer_amount,
    cardAmount: data.card_amount,
    actualCardAmount: data.actual_card_amount || undefined,
    isInstallment: data.is_installment,
    installmentAmount: data.installment_amount || undefined,
    remainingBalance: data.remaining_balance || undefined,
    upsBatch: data.ups_batch || undefined,
    notes: data.notes || undefined,
    date: data.date,
    paymentDate: data.payment_date || undefined,
    type: data.type,
    createdAt: data.created_at,
  };
}

function convertToDbFormat(transaction: Transaction): any {
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
    ups_batch: transaction.upsBatch || null,
    notes: transaction.notes || null,
    date: transaction.date,
    payment_date: transaction.paymentDate || null,
    type: transaction.type,
    created_at: transaction.createdAt,
  };
}
