export const WALK_IN_CUSTOMER_LABELS = [
  'Cliente de Paso',
] as const;

export const WALK_IN_CUSTOMER_KEY = '__walk_in_customer__';

export const normalizeCustomerKey = (value: string | undefined | null) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const WALK_IN_LABEL_KEYS = new Set(
  WALK_IN_CUSTOMER_LABELS.map((label) => normalizeCustomerKey(label))
);

export function isWalkInCustomerName(value: string | undefined | null): boolean {
  return WALK_IN_LABEL_KEYS.has(normalizeCustomerKey(value));
}

export function toCustomerMatchKey(value: string | undefined | null): string {
  if (isWalkInCustomerName(value)) {
    return WALK_IN_CUSTOMER_KEY;
  }
  return normalizeCustomerKey(value);
}
