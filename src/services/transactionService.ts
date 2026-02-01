import { getSupabaseClient } from '../lib/supabase';
import { Transaction, TransactionItem } from '../types';

/**
 * Transaction Service
 * Handles CRUD operations for transactions with Supabase
 */

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
};

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
