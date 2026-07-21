import { CategoryCode, Product, SatCategorySuggestion, SatKey, TransactionItem } from '../types';

export function normalizeSatCode(code: string): string {
  return code.trim();
}

export function isDuplicateSatCode(
  satKeys: SatKey[],
  code: string,
  currentId?: string,
): boolean {
  const normalized = normalizeSatCode(code).toLowerCase();
  return satKeys.some(
    (satKey) =>
      satKey.id !== currentId &&
      normalizeSatCode(satKey.code).toLowerCase() === normalized,
  );
}

export function getProductSatSnapshot(
  product: Product,
  satKeys: SatKey[],
): Pick<TransactionItem, 'satKeyId' | 'satKeyCode' | 'satKeyDescription'> {
  if (!product.satKeyId) return {};

  const satKey = satKeys.find((item) => item.id === product.satKeyId);
  if (!satKey) return {};

  return {
    satKeyId: satKey.id,
    satKeyCode: satKey.code,
    satKeyDescription: satKey.description,
  };
}

export interface SatKeySelectOption {
  value: string;
  label: string;
}

export function getSatKeyOptionsForCategory(
  satKeys: SatKey[],
  suggestions: SatCategorySuggestion[],
  categoryCode: CategoryCode | '',
): SatKeySelectOption[] {
  const satKeyById = new Map(satKeys.map((satKey) => [satKey.id, satKey]));
  const suggestedIds = new Set<string>();
  const suggestedOptions = suggestions
    .filter((suggestion) => suggestion.categoryCode === categoryCode)
    .sort((a, b) => a.priority - b.priority)
    .flatMap((suggestion) => {
      const satKey = satKeyById.get(suggestion.satKeyId);
      if (!satKey) return [];

      suggestedIds.add(satKey.id);
      return [{
        value: satKey.id,
        label: `Sugerida - ${satKey.code} - ${satKey.description}`,
      }];
    });

  const remainingOptions = [...satKeys]
    .filter((satKey) => !suggestedIds.has(satKey.id))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((satKey) => ({
      value: satKey.id,
      label: `Todas - ${satKey.code} - ${satKey.description}`,
    }));

  return [
    { value: '', label: 'Sin clave SAT' },
    ...suggestedOptions,
    ...remainingOptions,
  ];
}
