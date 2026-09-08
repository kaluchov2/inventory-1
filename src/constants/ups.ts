export const FALLBACK_ALLOWED_INVENTORY_UPS = [23, 24, 25] as const;

export const DEFAULT_INVENTORY_UPS =
  FALLBACK_ALLOWED_INVENTORY_UPS[FALLBACK_ALLOWED_INVENTORY_UPS.length - 1];

export function normalizeInventoryUps(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isAllowedInventoryUps(
  value: unknown,
  allowedUps: readonly number[] = FALLBACK_ALLOWED_INVENTORY_UPS,
): boolean {
  const normalized = normalizeInventoryUps(value);
  return normalized !== null && allowedUps.includes(normalized);
}

export function buildUpsBatchOptions(allowedUps: readonly number[]) {
  return [...allowedUps]
    .sort((left, right) => left - right)
    .map((batch) => ({ value: batch, label: `UPS ${batch}` }));
}

export function buildUpsFilterOptions(allowedUps: readonly number[]) {
  return [
    { value: 0, label: 'UPS 0 - Sin registrar' },
    ...buildUpsBatchOptions(allowedUps),
  ];
}
