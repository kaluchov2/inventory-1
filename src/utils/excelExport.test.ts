import { describe, expect, it } from 'vitest';
import { buildSatSalesExcelRows } from './excelExport';
import { MonthlySatSalesRow } from './satSalesReport';

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
