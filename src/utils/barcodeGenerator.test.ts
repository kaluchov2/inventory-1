import { describe, expect, it } from 'vitest';
import {
  generateBarcode,
  generateLegacyBarcode,
  parseBarcode,
  validateBarcodeMatchesUPS,
} from './barcodeGenerator';

describe('barcodeGenerator', () => {
  it('generates and parses legacy barcodes', () => {
    expect(generateLegacyBarcode('15', 42)).toBe('D15-0042');
    expect(parseBarcode('D15-0042')).toEqual({
      type: 'legacy',
      dropNumber: '15',
      sequence: 42,
    });
  });

  it('generates and parses numbered barcodes', () => {
    expect(generateBarcode('numbered', '523', 20)).toBe('0523-20');
    expect(parseBarcode('0523-20')).toEqual({
      type: 'numbered',
      dropNumber: '523',
      productNumber: 20,
    });
  });

  it('validates barcodes against UPS values', () => {
    expect(validateBarcodeMatchesUPS('0523-20', '20/523')).toBe(true);
    expect(validateBarcodeMatchesUPS('D15-0001', '15')).toBe(true);
    expect(validateBarcodeMatchesUPS('D15-0001', '001/15')).toBe(false);
  });
});
