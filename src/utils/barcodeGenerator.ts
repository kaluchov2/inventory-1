import { IdentifierType, ParsedUPS } from '../types';
import { parseUPS } from './upsParser';

/**
 * Barcode Generator Utility
 * Generates UPS-based barcodes in two formats:
 * - Legacy: "D{drop}-{sequence}" (e.g., "D15-0042")
 * - Numbered: "{drop}-{product}" (e.g., "0523-20")
 */

/**
 * Generate a barcode from parsed UPS data
 * @param type - 'legacy' or 'numbered'
 * @param dropNumber - The drop number
 * @param productNumber - For numbered format: the product number (e.g., 20 from "523/20")
 * @param sequence - For legacy format: sequential number within the drop
 * @returns Barcode string
 */
export function generateBarcode(
  type: IdentifierType,
  dropNumber: string,
  productNumber?: number,
  sequence?: number
): string {
  if (type === 'numbered' && productNumber !== undefined) {
    // Numbered format: "0523-20"
    // Pad drop number to 4 digits, keep product number as-is
    const paddedDrop = dropNumber.padStart(4, '0');
    return `${paddedDrop}-${productNumber}`;
  }

  // Legacy format: "D15-0042"
  // 'D' prefix + drop number + '-' + 4-digit sequence
  const seq = sequence ?? 0;
  const paddedSequence = String(seq).padStart(4, '0');
  return `D${dropNumber}-${paddedSequence}`;
}

/**
 * Generate a barcode directly from a UPS value and optional sequence
 * @param upsValue - Raw UPS value (e.g., "15" or "523/20")
 * @param sequence - Sequence number for legacy format
 * @returns Barcode string
 */
export function generateBarcodeFromUPS(
  upsValue: string | number | null | undefined,
  sequence?: number
): string {
  const parsed = parseUPS(upsValue);
  return generateBarcode(
    parsed.identifierType,
    parsed.dropNumber,
    parsed.productNumber,
    sequence
  );
}

/**
 * Generate a barcode from ParsedUPS object
 * @param parsed - ParsedUPS object
 * @param sequence - Sequence number for legacy format
 * @returns Barcode string
 */
export function generateBarcodeFromParsed(
  parsed: ParsedUPS,
  sequence?: number
): string {
  return generateBarcode(
    parsed.identifierType,
    parsed.dropNumber,
    parsed.productNumber,
    sequence
  );
}

/**
 * Parse a barcode back to its components
 * @param barcode - Barcode string (e.g., "D15-0042" or "0523-20")
 * @returns Object with type, dropNumber, productNumber/sequence
 */
export function parseBarcode(barcode: string): {
  type: IdentifierType;
  dropNumber: string;
  productNumber?: number;
  sequence?: number;
} | null {
  if (!barcode) return null;

  const trimmed = barcode.trim();

  // Legacy format: "D{drop}-{sequence}"
  const legacyMatch = trimmed.match(/^D(\d+)-(\d+)$/i);
  if (legacyMatch) {
    return {
      type: 'legacy',
      dropNumber: legacyMatch[1],
      sequence: parseInt(legacyMatch[2], 10),
    };
  }

  // Numbered format: "{drop}-{product}"
  const numberedMatch = trimmed.match(/^(\d+)-(\d+)$/);
  if (numberedMatch) {
    return {
      type: 'numbered',
      dropNumber: String(parseInt(numberedMatch[1], 10)), // Remove leading zeros
      productNumber: parseInt(numberedMatch[2], 10),
    };
  }

  return null;
}

/**
 * Check if a string is a valid barcode format
 */
export function isValidBarcode(barcode: string): boolean {
  return parseBarcode(barcode) !== null;
}

/**
 * Get the next sequence number for a drop (for legacy barcodes)
 * @param existingBarcodes - Array of existing barcodes in the drop
 * @returns Next sequence number
 */
export function getNextSequence(existingBarcodes: string[]): number {
  let maxSequence = 0;

  for (const barcode of existingBarcodes) {
    const parsed = parseBarcode(barcode);
    if (parsed && parsed.type === 'legacy' && parsed.sequence !== undefined) {
      maxSequence = Math.max(maxSequence, parsed.sequence);
    }
  }

  return maxSequence + 1;
}

/**
 * Validate that a barcode matches expected UPS data
 * @param barcode - Barcode to validate
 * @param upsValue - Expected UPS value
 * @returns true if barcode matches UPS data
 */
export function validateBarcodeMatchesUPS(
  barcode: string,
  upsValue: string | number
): boolean {
  const barcodeData = parseBarcode(barcode);
  const upsData = parseUPS(upsValue);

  if (!barcodeData) return false;

  // Type must match
  if (barcodeData.type !== upsData.identifierType) return false;

  // Drop number must match
  if (barcodeData.dropNumber !== upsData.dropNumber) return false;

  // For numbered format, product number must match
  if (upsData.identifierType === 'numbered') {
    return barcodeData.productNumber === upsData.productNumber;
  }

  return true;
}
