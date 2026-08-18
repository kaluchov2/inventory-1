import { Transaction, TransactionItem } from '../types';

const toCents = (value: number): number => Math.round((value + Number.EPSILON) * 100);

export interface PaymentAmounts {
  cash: number;
  transfer: number;
  card: number;
}

/**
 * Rescales a fully paid payment breakdown using integer cents. Only methods
 * that were already present receive money; the largest method absorbs the
 * rounding residue so a zero card payment can never appear by accident.
 */
export function rescalePaymentAmounts(
  amounts: PaymentAmounts,
  nextTotal: number,
): PaymentAmounts {
  const keys = ['cash', 'transfer', 'card'] as const;
  const currentCents = keys.map((key) => Math.max(0, toCents(amounts[key])));
  const paidCents = currentCents.reduce((sum, value) => sum + value, 0);
  const nextTotalCents = Math.max(0, toCents(nextTotal));

  if (paidCents === 0) {
    return { cash: nextTotalCents / 100, transfer: 0, card: 0 };
  }

  const activeIndexes = currentCents
    .map((value, index) => ({ value, index }))
    .filter(({ value }) => value > 0);
  const largestIndex = activeIndexes.reduce((largest, current) =>
    current.value > largest.value ? current : largest
  ).index;

  const allocated = currentCents.map((value) =>
    value > 0 ? Math.floor(nextTotalCents * value / paidCents) : 0
  );
  const residue = nextTotalCents - allocated.reduce((sum, value) => sum + value, 0);
  allocated[largestIndex] += residue;

  return {
    cash: allocated[0] / 100,
    transfer: allocated[1] / 100,
    card: allocated[2] / 100,
  };
}

export interface AllocatedSaleItem extends TransactionItem {
  unitPrice: number;
  totalPrice: number;
}

/**
 * Mirrors the RPC's deterministic allocation: proportional line totals in
 * cents, with any rounding residue assigned to the last line.
 */
export function allocateSaleSubtotal(
  items: TransactionItem[],
  targetTotal: number,
  historicalDiscount: number,
): AllocatedSaleItem[] {
  if (items.length === 0) throw new Error('transaction_requires_at_least_one_item');
  if (targetTotal < 0 || historicalDiscount < 0) throw new Error('sale_total_invalid');

  const targetSubtotalCents = toCents(targetTotal) + toCents(historicalDiscount);
  const rawWeights = items.map((item) => Math.max(0, item.totalPrice));
  const rawWeightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
  const weights = rawWeightTotal > 0
    ? rawWeights
    : items.map((item) => Math.max(0, item.quantity));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal <= 0) throw new Error('sale_item_quantity_invalid');

  let allocatedCents = 0;
  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const lineCents = isLast
      ? targetSubtotalCents - allocatedCents
      : Math.floor((targetSubtotalCents * weights[index]) / weightTotal);
    allocatedCents += lineCents;

    const lineTotal = lineCents / 100;
    return {
      ...item,
      unitPrice: Number((lineTotal / item.quantity).toFixed(6)),
      totalPrice: lineTotal,
    };
  });
}

export function hasInventoryMovement(
  previousItems: TransactionItem[],
  nextItems: TransactionItem[],
): boolean {
  const quantities = (items: TransactionItem[]) => {
    const totals = new Map<string, number>();
    items.forEach((item) => {
      if (!item.productId) return;
      totals.set(item.productId, (totals.get(item.productId) || 0) + item.quantity);
    });
    return totals;
  };

  const previous = quantities(previousItems);
  const next = quantities(nextItems);
  const ids = new Set([...previous.keys(), ...next.keys()]);
  return Array.from(ids).some((id) => (previous.get(id) || 0) !== (next.get(id) || 0));
}

/** Mirrors the database's deterministic FIFO allocation of customer abonos. */
export function getEffectiveSalePendingMap(
  transactions: Transaction[],
  customerId: string,
): Map<string, number> {
  const sales = transactions
    .filter((transaction) =>
      transaction.customerId === customerId &&
      transaction.type === 'sale' &&
      transaction.cashAmount + transaction.transferAmount + transaction.cardAmount < transaction.total
    )
    .sort((left, right) => {
      const dateDifference = new Date(left.date).getTime() - new Date(right.date).getTime();
      return dateDifference || left.id.localeCompare(right.id);
    });

  let remainingInstallments = transactions
    .filter((transaction) => transaction.customerId === customerId && transaction.type === 'installment_payment')
    .reduce((sum, transaction) => sum + transaction.total, 0);
  const pendingMap = new Map<string, number>();

  sales.forEach((sale) => {
    const originalDebt = Math.max(
      sale.total - sale.cashAmount - sale.transferAmount - sale.cardAmount,
      0,
    );
    const applied = Math.min(originalDebt, Math.max(remainingInstallments, 0));
    pendingMap.set(sale.id, Math.max(originalDebt - applied, 0));
    remainingInstallments -= applied;
  });

  return pendingMap;
}
