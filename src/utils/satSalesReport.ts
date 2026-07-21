import { Transaction } from '../types';
import { formatDate } from './formatters';

export interface MonthlySatSalesRow {
  saleDate: string;
  description: string;
  paymentMethod: string;
  satCode: string;
  satDescription: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  customerName: string;
  satStatus: 'Con clave' | 'Sin clave SAT';
  notes: string;
}

const NO_SAT_KEY = 'Sin clave SAT';

export function getPaymentMethodLabel(paymentMethod: Transaction['paymentMethod']): string {
  if (paymentMethod === 'cash') return 'Efectivo';
  if (paymentMethod === 'transfer') return 'Transferencia';
  if (paymentMethod === 'card') return 'Tarjeta';
  if (paymentMethod === 'mixed') return 'Mixto';
  return 'Crédito';
}

function mapTransactionToSatRows(transaction: Transaction): MonthlySatSalesRow[] {
  return transaction.items.map((item) => {
    const hasSatKey = !!item.satKeyCode;

    return {
      saleDate: formatDate(transaction.date),
      description: item.productName,
      paymentMethod: getPaymentMethodLabel(transaction.paymentMethod),
      satCode: item.satKeyCode || NO_SAT_KEY,
      satDescription: item.satKeyDescription || (hasSatKey ? '' : NO_SAT_KEY),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.totalPrice,
      customerName: transaction.customerName,
      satStatus: hasSatKey ? 'Con clave' : 'Sin clave SAT',
      notes: transaction.notes || '',
    };
  });
}

export interface SatSalesDateRange {
  /** Inclusive lower bound (ISO string). */
  from?: string;
  /**
   * Exclusive upper bound (ISO string) — pass the start of the day AFTER the
   * last day to include, not the last included instant. This avoids relying
   * on string-truncation tricks that break when timestamps carry milliseconds.
   */
  to?: string;
}

export function buildSatSalesRows(
  transactions: Transaction[],
  range?: SatSalesDateRange,
): MonthlySatSalesRow[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'sale' &&
        transaction.items.length > 0 &&
        (!range?.from || transaction.date >= range.from) &&
        (!range?.to || transaction.date < range.to),
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .flatMap(mapTransactionToSatRows);
}

export function buildMonthlySatSalesRows(
  transactions: Transaction[],
  month: string,
): MonthlySatSalesRow[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'sale' &&
        transaction.date.startsWith(month) &&
        transaction.items.length > 0,
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .flatMap(mapTransactionToSatRows);
}
