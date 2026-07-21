import { PaymentMethod, Transaction, TransactionItem } from '../types';
import { getCurrentISODate } from './formatters';

export const createSaleTransaction = (
  customerInfo: { id?: string; name: string },
  items: TransactionItem[],
  payment: {
    method: PaymentMethod;
    cash: number;
    transfer: number;
    card: number;
    actualCard?: number;
  },
  options?: {
    discount?: number;
    discountNote?: string;
    notes?: string;
    isInstallment?: boolean;
  }
): Omit<Transaction, 'id' | 'createdAt'> => {
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = options?.discount || 0;
  const total = subtotal - discount;

  return {
    customerId: customerInfo.id,
    customerName: customerInfo.name,
    items,
    subtotal,
    discount,
    discountNote: options?.discountNote,
    total,
    paymentMethod: payment.method,
    cashAmount: payment.cash,
    transferAmount: payment.transfer,
    cardAmount: payment.card,
    actualCardAmount: payment.actualCard,
    isInstallment: options?.isInstallment || false,
    notes: options?.notes,
    date: getCurrentISODate(),
    type: 'sale',
  };
};
