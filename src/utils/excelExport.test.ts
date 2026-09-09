import { describe, expect, it } from 'vitest';
import {
  buildProductsByUpsExcelRows,
  buildProductsExcelRows,
  buildSatSalesExcelRows,
} from './excelExport';
import { MonthlySatSalesRow } from './satSalesReport';
import { Product, SatKey } from '../types';

const row = (lineIndex: number): MonthlySatSalesRow => ({
  transactionId: 'tx-1',
  transactionTotal: 300,
  lineIndex,
  lineCount: 2,
  saleDate: '17/08/2026',
  description: `Producto ${lineIndex}`,
  paymentMethod: 'Efectivo',
  satCode: '53103000',
  satDescription: 'Ropa',
  quantity: 1,
  unitPrice: lineIndex === 1 ? 100 : 200,
  lineTotal: lineIndex === 1 ? 100 : 200,
  customerName: 'Cliente',
  satStatus: 'Con clave',
  notes: '',
});

describe('buildSatSalesExcelRows', () => {
  it('writes the transaction total only on the first line', () => {
    const result = buildSatSalesExcelRows([row(1), row(2)]);
    expect(result.map((item) => item['Total Venta'])).toEqual([300, '']);
    expect(result.map((item) => item['ID Venta'])).toEqual(['tx-1', 'tx-1']);
  });
});

describe('buildProductsByUpsExcelRows', () => {
  const product: Product = {
    id: 'product-1',
    name: 'Artículo con clave SAT',
    sku: 'UPS-10-1',
    upsRaw: '10',
    identifierType: 'legacy',
    dropNumber: '10',
    upsBatch: 10,
    quantity: 2,
    unitPrice: 125,
    category: 'HG',
    satKeyId: 'sat-1',
    availableQty: 2,
    soldQty: 0,
    donatedQty: 0,
    lostQty: 0,
    expiredQty: 0,
    status: 'available',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  };

  const satKey: SatKey = {
    id: 'sat-1',
    code: '01010101',
    description: 'No existe en el catálogo',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  };

  it('adds the SAT code to each inventory row and preserves leading zeroes', () => {
    const rows = buildProductsByUpsExcelRows([product], [satKey]);

    expect(rows[0]['Clave SAT']).toBe('01010101');
    expect(rows[1]['Clave SAT']).toBe('');
  });

  it('leaves the SAT code empty when the product has no matching key', () => {
    const rows = buildProductsByUpsExcelRows([product], []);

    expect(rows[0]['Clave SAT']).toBe('');
  });
});

describe('buildProductsExcelRows', () => {
  const product: Product = {
    id: 'product-all-1',
    name: 'Artículo de inventario completo',
    sku: 'UPS-20-1',
    upsRaw: '20',
    identifierType: 'legacy',
    dropNumber: '20',
    upsBatch: 20,
    quantity: 3,
    unitPrice: 80,
    category: 'HG',
    satKeyId: 'sat-all-1',
    availableQty: 3,
    soldQty: 0,
    donatedQty: 0,
    lostQty: 0,
    expiredQty: 0,
    status: 'available',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  };

  const satKey: SatKey = {
    id: 'sat-all-1',
    code: '01010101',
    description: 'No existe en el catálogo',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
  };

  it('adds the SAT code to the complete inventory export', () => {
    const rows = buildProductsExcelRows([product], [satKey]);

    expect(rows[0]['Clave SAT']).toBe('01010101');
  });

  it('leaves the SAT code empty when the complete inventory has no matching key', () => {
    const rows = buildProductsExcelRows([product], []);

    expect(rows[0]['Clave SAT']).toBe('');
  });
});
