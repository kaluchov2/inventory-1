import { ParsedUPS, IdentifierType } from '../types';

/**
 * UPS Parser Utility
 * Handles two UPS formats:
 * - Legacy (drops 7-19): Single number (e.g., "15", "19")
 * - Numbered (drops 20+): Product/Drop format (e.g., "001/20" = product 1, drop 20)
 */

// Regular expressions for parsing UPS formats
const NUMBERED_FORMAT_REGEX = /^(\d+)\s*[\/\\-]\s*(\d+)$/;  // Matches "001/20", "001-20", "001\20" (product/drop)
const LEGACY_FORMAT_REGEX = /^\d+$/;                         // Matches single numbers like "15", "19"

/**
 * Parse a UPS value and determine its format
 * @param value - The UPS value to parse (can be string or number)
 * @returns ParsedUPS object with identifierType, dropNumber, productNumber, and raw value
 */
export function parseUPS(value: string | number | null | undefined): ParsedUPS {
  // Handle null/undefined/empty
  if (value === null || value === undefined || value === '') {
    return {
      raw: '',
      identifierType: 'legacy',
      dropNumber: '0',
      productNumber: undefined,
    };
  }

  // Convert to string and clean up
  const raw = String(value).trim();

  // Check for numbered format (e.g., "001/20" = product 1, drop 20)
  // Format: product/drop - first number is PRODUCT, second number is DROP
  const numberedMatch = raw.match(NUMBERED_FORMAT_REGEX);
  if (numberedMatch) {
    return {
      raw,
      identifierType: 'numbered',
      dropNumber: numberedMatch[2],                    // Second number is DROP
      productNumber: parseInt(numberedMatch[1], 10),  // First number is PRODUCT
    };
  }

  // Check for legacy format (single number)
  if (LEGACY_FORMAT_REGEX.test(raw)) {
    return {
      raw,
      identifierType: 'legacy',
      dropNumber: raw,
      productNumber: undefined,
    };
  }

  // Default: treat as legacy with the raw value as drop number
  // Strip any non-numeric characters for the drop number
  const numericOnly = raw.replace(/\D/g, '');
  return {
    raw,
    identifierType: 'legacy',
    dropNumber: numericOnly || '0',
    productNumber: undefined,
  };
}

/**
 * Check if a value is in numbered format
 */
export function isNumberedFormat(value: string | number | null | undefined): boolean {
  if (!value) return false;
  const str = String(value).trim();
  return NUMBERED_FORMAT_REGEX.test(str);
}

/**
 * Check if a value is in legacy format
 */
export function isLegacyFormat(value: string | number | null | undefined): boolean {
  if (!value) return false;
  const str = String(value).trim();
  return LEGACY_FORMAT_REGEX.test(str) && !NUMBERED_FORMAT_REGEX.test(str);
}

/**
 * Format a parsed UPS back to its display string
 * Output format: product/drop to match Excel format (e.g., "001/20")
 */
export function formatUPS(parsed: ParsedUPS): string {
  if (parsed.identifierType === 'numbered' && parsed.productNumber !== undefined) {
    return `${parsed.productNumber}/${parsed.dropNumber}`;
  }
  return parsed.dropNumber;
}

/**
 * Get the drop number from a UPS value (legacy field support)
 * For legacy: returns the number itself
 * For numbered: returns the drop portion
 */
export function getDropNumber(value: string | number | null | undefined): string {
  const parsed = parseUPS(value);
  return parsed.dropNumber;
}

/**
 * Convert a UPS value to the legacy upsBatch number
 * For backward compatibility with existing code
 */
export function toUpsBatch(value: string | number | null | undefined): number {
  const parsed = parseUPS(value);
  const num = parseInt(parsed.dropNumber, 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Determine identifier type from a value
 */
export function getIdentifierType(value: string | number | null | undefined): IdentifierType {
  const parsed = parseUPS(value);
  return parsed.identifierType;
}
