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

/**
 * Mirrors the database's chronological FIFO allocation of customer abonos.
 * A payment can only reduce sales that already existed at that moment; excess
 * money is not carried forward into future sales because customer balances do
 * not store a credit balance.
 */
export function getEffectiveSalePendingMap(
  transactions: Transaction[],
  customerId: string,
): Map<string, number> {
  const accountEvents = transactions
    .filter((transaction) =>
      transaction.customerId === customerId &&
      (transaction.type === 'sale' || transaction.type === 'installment_payment')
    )
    .sort((left, right) => {
      const dateDifference = new Date(left.date).getTime() - new Date(right.date).getTime();
      if (dateDifference) return dateDifference;
      if (left.type !== right.type) return left.type === 'sale' ? -1 : 1;
      return left.id.localeCompare(right.id);
    });

  const pendingMap = new Map<string, number>();
  const openSales: Array<{ id: string; remaining: number }> = [];

  accountEvents.forEach((event) => {
    if (event.type === 'sale') {
      const originalDebt = Math.max(
        event.total - event.cashAmount - event.transferAmount - event.cardAmount,
        0,
      );
      pendingMap.set(event.id, originalDebt);
      openSales.push({ id: event.id, remaining: originalDebt });
      return;
    }

    let paymentRemaining = Math.max(event.total, 0);
    for (const sale of openSales) {
      if (paymentRemaining <= 0) break;
      const applied = Math.min(sale.remaining, paymentRemaining);
      sale.remaining -= applied;
      paymentRemaining -= applied;
      pendingMap.set(sale.id, sale.remaining);
    }
  });

  return pendingMap;
}
