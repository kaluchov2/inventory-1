import { describe, expect, it } from 'vitest';
import { SatCategorySuggestion, SatKey } from '../types';
import {
  getSatKeyOptionsForCategory,
  isDuplicateSatCode,
  normalizeSatCode,
} from './satKeyHelpers';

const satKeys: SatKey[] = [
  {
    id: 'sat-1',
    code: '02002',
    description: 'Ropa',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'sat-2',
    code: '03003',
    description: 'Calzado',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const suggestions: SatCategorySuggestion[] = [
  {
    id: 'suggestion-dam-sat-2',
    categoryCode: 'DAM',
    satKeyId: 'sat-2',
    priority: 1,
    isDefault: false,
    sourceGroup: 'Calzado',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('satKeyService helpers', () => {
  it('normalizes SAT codes without changing meaningful zeros', () => {
    expect(normalizeSatCode(' 02002 ')).toBe('02002');
  });

  it('detects duplicate codes while allowing the current record during edits', () => {
    expect(isDuplicateSatCode(satKeys, '02002')).toBe(true);
    expect(isDuplicateSatCode(satKeys, '02002', 'sat-1')).toBe(false);
    expect(isDuplicateSatCode(satKeys, '99999')).toBe(false);
  });

  it('puts category suggestions first without removing free SAT selection', () => {
    const options = getSatKeyOptionsForCategory(satKeys, suggestions, 'DAM');

    expect(options.map((option) => option.value)).toEqual([
      '',
      'sat-2',
      'sat-1',
    ]);
    expect(options[1].label).toContain('Sugerida');
    expect(options[2].label).toContain('Todas');
  });

  it('shows all SAT keys when a category has no suggestions', () => {
    const options = getSatKeyOptionsForCategory(satKeys, suggestions, 'JY');

    expect(options.map((option) => option.value)).toEqual([
      '',
      'sat-1',
      'sat-2',
    ]);
  });
});
