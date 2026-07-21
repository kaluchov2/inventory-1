import { describe, expect, it } from 'vitest';
import { formatUPS, parseUPS, toUpsBatch } from './upsParser';

describe('upsParser', () => {
  it('parses legacy UPS values', () => {
    expect(parseUPS('15')).toEqual({
      raw: '15',
      identifierType: 'legacy',
      dropNumber: '15',
      productNumber: undefined,
    });
    expect(toUpsBatch('15')).toBe(15);
  });

  it('parses numbered product/drop values', () => {
    expect(parseUPS('001/20')).toEqual({
      raw: '001/20',
      identifierType: 'numbered',
      dropNumber: '20',
      productNumber: 1,
    });
    expect(formatUPS(parseUPS('001/20'))).toBe('1/20');
    expect(toUpsBatch('001/20')).toBe(20);
  });

  it('falls back to drop 0 for empty values', () => {
    expect(parseUPS('')).toMatchObject({
      identifierType: 'legacy',
      dropNumber: '0',
    });
  });
});
