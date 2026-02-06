import * as XLSX from 'xlsx';
import { Product, Customer, Transaction, CategoryCode, TransactionItem, Drop, Staff, ProductStatus } from '../types';
import { normalizeCategory } from '../constants/categories';
import { generateId, getCurrentISODate } from './formatters';
import { parseUPS, toUpsBatch } from './upsParser';
import { generateBarcodeFromParsed } from './barcodeGenerator';

/**
 * V2 Excel Import
 * Supports UPS parsing, barcode generation, and staff/drop tracking
 */

// Detect product status from Observaciones
const detectStatus = (obs: string | undefined): ProductStatus => {
  if (!obs) return 'available';
  const lower = obs.toLowerCase();
  if (/vendid[ao]s?/i.test(lower)) return 'sold';
  if (/donad[ao]s?/i.test(lower)) return 'donated';
  if (/reservad[ao]s?/i.test(lower)) return 'reserved';
  if (/promoci[oó]n/i.test(lower)) return 'promotional';
  if (/revisar/i.test(lower)) return 'review';
  if (/caducad[ao]s?|vencid[ao]s?|expirad[ao]s?/i.test(lower)) return 'expired';
  if (/perdid[ao]s?|extraviado/i.test(lower)) return 'lost';
  return 'available';
};


// Parse soldBy from Observaciones (look for "Vendedor:", "Vendido por:", etc.)
const parseSoldBy = (obs: string | undefined): string | undefined => {
  if (!obs) return undefined;

  // Match patterns like "Vendedor: Juan", "Vendido por: Maria"
  const patterns = [
    /vendedor[:\s]+([^,\n]+)/i,
    /vendido\s+por[:\s]+([^,\n]+)/i,
    /por[:\s]+([^,\n]+?)(?:\s+a\s+|$)/i,
  ];

  for (const pattern of patterns) {
    const match = obs.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return undefined;
};


// Parse date from Excel
const parseExcelDate = (value: any): string => {
  if (!value) return getCurrentISODate();

  // If it's already a Date object
  if (value instanceof Date) {
    return value.toISOString();
  }

  // If it's a number (Excel serial date)
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      return new Date(date.y, date.m - 1, date.d).toISOString();
    }
  }

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return getCurrentISODate();
};

// Parse currency value
const parseCurrency = (value: any): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export interface ImportResult {
  products: Product[];
  customers: Customer[];
  transactions: Transaction[];
  // V2: New entities
  drops: Drop[];
  staff: Staff[];
  errors: string[];
}

// Track sequence numbers per drop during import
const dropSequenceCounters: Map<string, number> = new Map();

function getNextSequence(dropNumber: string): number {
  const current = dropSequenceCounters.get(dropNumber) || 0;
  const next = current + 1;
  dropSequenceCounters.set(dropNumber, next);
  return next;
}

// Read and parse Excel file
export async function importExcelFile(file: File): Promise<ImportResult> {
  // Reset sequence counters for new import
  dropSequenceCounters.clear();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        const result: ImportResult = {
          products: [],
          customers: [],
          transactions: [],
          drops: [],
          staff: [],
          errors: [],
        };

        // Track unique drops and staff
        const dropsMap = new Map<string, Drop>();
        const staffMap = new Map<string, Staff>();

        // Process Inventario sheet
        const inventarioSheet = workbook.Sheets['Inventario'];
        if (inventarioSheet) {
          const inventarioData = XLSX.utils.sheet_to_json(inventarioSheet);
          result.products = processInventarioSheet(inventarioData, result.errors, dropsMap);
        }

        // Process Inventario Comp Y Cel sheet (electronics)
        const electronicsSheet = workbook.Sheets['Inventario Comp Y Cel'];
        if (electronicsSheet) {
          const electronicsData = XLSX.utils.sheet_to_json(electronicsSheet);
          const electronicsProducts = processElectronicsSheet(electronicsData, result.errors, dropsMap);
          result.products = [...result.products, ...electronicsProducts];
        }

        // Process Pagos sheet
        const pagosSheet = workbook.Sheets['Pagos'];
        if (pagosSheet) {
          const pagosData = XLSX.utils.sheet_to_json(pagosSheet);
          const { transactions, customers } = processPagosSheet(pagosData, result.errors, staffMap);
          result.transactions = transactions;
          result.customers = customers;
        }

        // Convert maps to arrays
        result.drops = Array.from(dropsMap.values());
        result.staff = Array.from(staffMap.values());

        // Update drop stats based on products
        updateDropStats(result.drops, result.products);

        resolve(result);
      } catch (error) {
        reject(new Error(`Error al leer el archivo: ${error}`));
      }
    };

    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// V2: Process Inventario sheet with UPS parsing and barcode generation
function processInventarioSheet(
  data: any[],
  errors: string[],
  dropsMap: Map<string, Drop>,
): Product[] {
  const products: Product[] = [];
  const now = getCurrentISODate();

  // Track seen match keys to handle duplicates
  const seenMatchKeys = new Map<string, number>();

  data.forEach((row, index) => {
    try {
      // DEBUG: Log first 5 raw Excel rows (including all keys to identify unnamed columns like Column J)
      if (index < 5) {
        console.log(`[Excel Import] Row ${index + 2} ALL KEYS:`, Object.keys(row));
        console.log(`[Excel Import] Row ${index + 2} raw data:`, {
          UPS: row['UPS'] || row['UPS No.'],
          Articulo: row['Artículo'] || row['Articulo'],
          Cantidad: row['Cantidad'],
          PrecioUnitario: row['Precio unitario'] || row['Precio Unitario'],
          Marca: row['Marca'],
          Color: row['Color'],
          Talla: row['Talla'],
          Observaciones: row['Observaciones'],
          Otros: row['Otros'],
        });
      }

      // V2: Parse UPS value
      const upsValue = row['UPS'] || row['UPS No.'] || '';
      const parsed = parseUPS(upsValue);

      // Ensure drop exists
      ensureDropExists(dropsMap, parsed.dropNumber, now);

      // Get sequence for this drop
      const dropSequence = getNextSequence(parsed.dropNumber);

      // Generate V2 barcode
      const barcode = generateBarcodeFromParsed(parsed, dropSequence);

      // Observaciones column — used for status detection only
      const observaciones = String(row['Observaciones'] || '').trim();

      // "Otros" column (Column J) — user-named column for notes
      // Also fall back to __EMPTY* keys in case header isn't named yet
      let otrosValue = String(row['Otros'] || '').trim();
      if (!otrosValue) {
        const emptyKeys = Object.keys(row).filter(k => k.startsWith('__EMPTY'));
        otrosValue = emptyKeys
          .map(k => String(row[k] || '').trim())
          .filter(v => v.length > 0)
          .pop() || '';
      }

      let productName = String(row['Artículo'] || row['Articulo'] || '').trim();

      const detectedStatus = detectStatus(observaciones);
      const qty = parseInt(row['Cantidad']) || 0;

      // Set qty fields based on detected status
      let availableQty = 0, soldQty = 0, donatedQty = 0, lostQty = 0, expiredQty = 0;
      switch (detectedStatus) {
        case 'available': case 'reserved': case 'promotional':
          availableQty = qty; break;
        case 'sold':
          soldQty = qty; break;
        case 'donated':
          donatedQty = qty; break;
        case 'lost':
          lostQty = qty; break;
        case 'expired':
          expiredQty = qty; break;
        case 'review':
          // All qtys stay 0 → reviewQty = quantity - 0 = quantity
          break;
      }

      const product: Product = {
        id: generateId(),
        name: productName,
        sku: '',
        // V2 fields
        upsRaw: parsed.raw,
        identifierType: parsed.identifierType,
        dropNumber: parsed.dropNumber,
        productNumber: parsed.productNumber,
        dropSequence,
        barcode,
        // Legacy field
        upsBatch: toUpsBatch(upsValue),
        quantity: qty,
        unitPrice: parseCurrency(row['Precio unitario'] || row['Precio Unitario']),
        category: normalizeCategory(String(row['Categoría'] || row['Categoria'] || 'VIB')),
        brand: String(row['Marca'] || '').trim() || undefined,
        color: String(row['Color'] || '').trim() || undefined,
        size: String(row['Talla'] || '').trim() || undefined,
        description: observaciones || undefined,
        notes: otrosValue || undefined,
        availableQty,
        soldQty,
        donatedQty,
        lostQty,
        expiredQty,
        status: detectedStatus,
        createdAt: now,
        updatedAt: now,
      };

      // Handle duplicate match keys by appending suffix to name
      const matchKey = getProductMatchKey(product);
      const count = seenMatchKeys.get(matchKey) || 0;

      if (count > 0) {
        product.name = `${productName} (${count})`;
      }

      seenMatchKeys.set(matchKey, count + 1);

      // Generate SKU
      product.sku = `${product.category}-${product.upsBatch}-${product.id.slice(-6).toUpperCase()}`;

      if (product.name) {
        products.push(product);
      }
    } catch (error) {
      errors.push(`Fila ${index + 2} en Inventario: ${error}`);
    }
  });

  return products;
}

// V2: Process electronics sheet
function processElectronicsSheet(
  data: any[],
  errors: string[],
  dropsMap: Map<string, Drop>,
): Product[] {
  const products: Product[] = [];
  const now = getCurrentISODate();

  // Track seen match keys to handle duplicates
  const seenMatchKeys = new Map<string, number>();

  data.forEach((row, index) => {
    try {
      const articleType = String(row['Articulo'] || row['Artículo'] || '').toLowerCase();
      let category: CategoryCode = 'EL';
      if (articleType.includes('celular')) category = 'CEL';
      else if (articleType.includes('compu')) category = 'COMP';

      // V2: Parse UPS value
      const upsValue = row['UPS No.'] || row['UPS'] || '';
      const parsed = parseUPS(upsValue);

      // Ensure drop exists
      ensureDropExists(dropsMap, parsed.dropNumber, now);

      // Get sequence for this drop
      const dropSequence = getNextSequence(parsed.dropNumber);

      // Generate V2 barcode
      const barcode = generateBarcodeFromParsed(parsed, dropSequence);

      // Observaciones column — used for status detection only
      const observaciones = String(row['Observaciones'] || '').trim();

      // "Otros" column — user-named column for notes
      let otrosValue = String(row['Otros'] || '').trim();
      if (!otrosValue) {
        const emptyKeys = Object.keys(row).filter(k => k.startsWith('__EMPTY'));
        otrosValue = emptyKeys
          .map(k => String(row[k] || '').trim())
          .filter(v => v.length > 0)
          .pop() || '';
      }

      let productName = `${row['Marca'] || ''} ${row['Modelo'] || ''} ${row['Color'] || ''}`.trim();

      const detectedStatus = detectStatus(observaciones);
      const qty = 1;

      let availableQty = 0, soldQty = 0, donatedQty = 0, lostQty = 0, expiredQty = 0;
      switch (detectedStatus) {
        case 'available': case 'reserved': case 'promotional':
          availableQty = qty; break;
        case 'sold':
          soldQty = qty; break;
        case 'donated':
          donatedQty = qty; break;
        case 'lost':
          lostQty = qty; break;
        case 'expired':
          expiredQty = qty; break;
        case 'review':
          break;
      }

      const product: Product = {
        id: generateId(),
        name: productName,
        sku: '',
        // V2 fields
        upsRaw: parsed.raw,
        identifierType: parsed.identifierType,
        dropNumber: parsed.dropNumber,
        productNumber: parsed.productNumber,
        dropSequence,
        barcode,
        // Legacy field
        upsBatch: toUpsBatch(upsValue),
        quantity: qty,
        unitPrice: parseCurrency(row['Precio unitario'] || row['Precio Unitario'] || 0),
        category,
        brand: String(row['Marca'] || '').trim() || undefined,
        color: String(row['Color'] || '').trim() || undefined,
        size: String(row['Cap'] || '').trim() || undefined,
        description: observaciones || undefined,
        notes: otrosValue || undefined,
        availableQty,
        soldQty,
        donatedQty,
        lostQty,
        expiredQty,
        status: detectedStatus,
        createdAt: now,
        updatedAt: now,
      };

      // Handle duplicate match keys by appending suffix to name
      const matchKey = getProductMatchKey(product);
      const count = seenMatchKeys.get(matchKey) || 0;

      if (count > 0) {
        product.name = `${productName} (${count})`;
      }

      seenMatchKeys.set(matchKey, count + 1);

      product.sku = `${product.category}-${product.upsBatch}-${product.id.slice(-6).toUpperCase()}`;

      if (product.name) {
        products.push(product);
      }
    } catch (error) {
      errors.push(`Fila ${index + 2} en Electrónicos: ${error}`);
    }
  });

  return products;
}

// Process Pagos sheet
function processPagosSheet(
  data: any[],
  errors: string[],
  staffMap: Map<string, Staff>
): { transactions: Transaction[]; customers: Customer[] } {
  const transactions: Transaction[] = [];
  const customerMap = new Map<string, Customer>();
  const now = getCurrentISODate();

  data.forEach((row, index) => {
    try {
      const customerName = String(row['Cliente'] || '').trim();
      if (!customerName) return;

      // Create or update customer
      if (!customerMap.has(customerName.toLowerCase())) {
        const customer: Customer = {
          id: generateId(),
          name: customerName,
          balance: 0,
          totalPurchases: 0,
          createdAt: now,
          updatedAt: now,
        };
        customerMap.set(customerName.toLowerCase(), customer);
      }

      const customer = customerMap.get(customerName.toLowerCase())!;

      // Create transaction item
      const quantity = parseInt(row['Cantidad']) || 1;
      const unitPrice = parseCurrency(row['Precio Unitariio'] || row['Precio Unitario']);
      const totalPrice = parseCurrency(row['Precio Total']) || quantity * unitPrice;

      const item: TransactionItem = {
        productId: '',
        productName: String(row['Articulo'] || row['Artículo'] || '').trim(),
        quantity,
        unitPrice,
        totalPrice,
        category: normalizeCategory(String(row['Categoria'] || row['Categoría'] || '')),
        brand: String(row['Marca'] || '').trim() || undefined,
        color: String(row['Color'] || '').trim() || undefined,
        size: String(row['Talla'] || '').trim() || undefined,
      };

      // Determine payment method
      const cashAmount = parseCurrency(row['Pagos en Efectivo']);
      const transferAmount = parseCurrency(row['Pagos Transferencia']);
      const cardAmount = parseCurrency(row['Pago Tarjeta']);

      let paymentMethod: 'cash' | 'transfer' | 'card' | 'mixed' | 'credit' = 'cash';
      const totalPaid = cashAmount + transferAmount + cardAmount;

      if (cashAmount > 0 && transferAmount === 0 && cardAmount === 0) paymentMethod = 'cash';
      else if (transferAmount > 0 && cashAmount === 0 && cardAmount === 0) paymentMethod = 'transfer';
      else if (cardAmount > 0 && cashAmount === 0 && transferAmount === 0) paymentMethod = 'card';
      else if (totalPaid > 0) paymentMethod = 'mixed';
      else paymentMethod = 'credit';

      // V2: Parse soldBy from Observaciones
      const observaciones = String(row['Observaciones'] || '').trim();
      const soldByName = parseSoldBy(observaciones);
      let soldById: string | undefined;
      if (soldByName) {
        soldById = ensureStaffExists(staffMap, soldByName, now);
      }

      // Create transaction
      const transaction: Transaction = {
        id: generateId(),
        customerId: customer.id,
        customerName,
        items: [item],
        subtotal: totalPrice,
        discount: 0,
        total: totalPrice,
        paymentMethod,
        cashAmount,
        transferAmount,
        cardAmount,
        actualCardAmount: parseCurrency(row['Pago Real de tarjeta']) || undefined,
        isInstallment: false,
        soldBy: soldById,
        notes: observaciones || undefined,
        date: parseExcelDate(row['Fecha']),
        paymentDate: row['Fecha de Pago'] ? parseExcelDate(row['Fecha de Pago']) : undefined,
        type: 'sale',
        createdAt: now,
      };

      transactions.push(transaction);

      // Update customer totals
      customer.totalPurchases += totalPrice;
    } catch (error) {
      errors.push(`Fila ${index + 2} en Pagos: ${error}`);
    }
  });

  return {
    transactions,
    customers: Array.from(customerMap.values()),
  };
}

// V2: Helper to ensure a drop record exists
function ensureDropExists(dropsMap: Map<string, Drop>, dropNumber: string, now: string): void {
  if (!dropsMap.has(dropNumber)) {
    const drop: Drop = {
      id: generateId(),
      dropNumber,
      arrivalDate: now,
      status: 'active',
      totalProducts: 0,
      totalUnits: 0,
      totalValue: 0,
      soldCount: 0,
      availableCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    dropsMap.set(dropNumber, drop);
  }
}

// V2: Helper to ensure a staff record exists
function ensureStaffExists(staffMap: Map<string, Staff>, name: string, now: string): string {
  const key = name.toLowerCase().trim();
  if (!staffMap.has(key)) {
    const staff: Staff = {
      id: generateId(),
      name: name.trim(),
      isActive: true,
      totalSales: 0,
      totalAmount: 0,
      createdAt: now,
      updatedAt: now,
    };
    staffMap.set(key, staff);
  }
  return staffMap.get(key)!.id;
}

// V2: Update drop statistics based on products
function updateDropStats(drops: Drop[], products: Product[]): void {
  for (const drop of drops) {
    const dropProducts = products.filter(p => p.dropNumber === drop.dropNumber);
    drop.totalProducts = dropProducts.length;
    drop.totalUnits = dropProducts.reduce((sum, p) => sum + (p.quantity || 0), 0);
    drop.totalValue = dropProducts.reduce((sum, p) => sum + ((p.quantity || 0) * (p.unitPrice || 0)), 0);
    drop.soldCount = dropProducts.reduce((sum, p) => sum + (p.soldQty || 0), 0);
    drop.availableCount = dropProducts.reduce((sum, p) => sum + (p.availableQty || 0), 0);
  }
}

/**
 * Normalize a field value for matching: trim, lowercase, convert undefined/null to empty string
 * Uses Unicode NFC normalization to handle encoding differences (e.g., 'café' vs 'café')
 * Also handles the string literals "undefined" and "null" which can appear in DB data
 */
function normalizeField(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value).toLowerCase().trim().normalize('NFC');
  // Handle string literals "undefined" and "null" that may be stored in DB
  if (str === 'undefined' || str === 'null') return '';
  return str;
}

/**
 * Generate a unique match key for a product
 * Used for Excel sync mode to identify existing products
 *
 * Strategy:
 * - Numbered format (e.g., "001/21"): Use dropNumber + productNumber (from UPS)
 *   This is inherently unique because productNumber comes from the UPS itself
 * - Legacy format (e.g., "7"): Use dropNumber + name + category + brand + color + size
 *   This combination should be unique for most products
 */
export function getProductMatchKey(product: Product): string {
  const dropNumber = normalizeField(product.dropNumber);
  const name = normalizeField(product.name);
  const category = normalizeField(product.category);

  // For numbered format (e.g., UPS "001/21"), productNumber IS the unique identifier
  if (product.productNumber !== undefined && product.productNumber !== null) {
    return `${dropNumber}|${product.productNumber}|${name}|${category}`;
  }

  // For legacy format, combine all distinguishing fields
  const brand = normalizeField(product.brand);
  const color = normalizeField(product.color);
  const size = normalizeField(product.size);

  return `${dropNumber}|${name}|${category}|${brand}|${color}|${size}`;
}

// Get available sheet names
export async function getSheetNames(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook.SheetNames);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}
