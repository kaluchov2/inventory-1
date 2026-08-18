import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Transaction } from '../types';
import { buildExitNotePdf, formatExitNoteUnitPrice, sanitizeExitNoteFolio } from './exitNotePdf';

const transaction: Transaction = {
  id: 'venta/ácentos 01',
  customerName: 'José Pérez',
  items: Array.from({ length: 65 }, (_, index) => ({
    productId: `p-${index}`,
    productName: `Producto de prueba con descripción larga ${index + 1}`,
    quantity: 2,
    unitPrice: 10.25,
    totalPrice: 20.5,
    satKeyCode: '53103000',
    satKeyDescription: 'Prendas de vestir con descripción extendida',
  })),
  subtotal: 1332.5,
  discount: 10,
  total: 1322.5,
  paymentMethod: 'mixed',
  cashAmount: 500,
  transferAmount: 500,
  cardAmount: 0,
  isInstallment: true,
  notes: 'Nota extensa con acentos: envío, número y revisión. '.repeat(30),
  date: '2026-08-17T18:30:00.000Z',
  type: 'sale',
  createdAt: '2026-08-17T18:30:00.000Z',
};

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('file:')) {
      const bytes = await readFile(new URL(url));
      return new Response(bytes);
    }
    return originalFetch(input, init);
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('exit note PDF', () => {
  it('sanitizes the downloaded folio', () => {
    expect(sanitizeExitNoteFolio(transaction.id)).toBe('venta_acentos_01');
  });

  it('prints enough unit-price precision to reconcile quantity and line total', () => {
    expect(formatExitNoteUnitPrice({
      productId: 'precision-item',
      productName: 'Producto',
      quantity: 3,
      unitPrice: 33.333333,
      totalPrice: 100,
    })).toContain('33.333333');
  });

  it('builds a multi-page PDF with document bytes', async () => {
    const doc = await buildExitNotePdf(transaction, 'María López');
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('keeps a short sale on one page', async () => {
    const doc = await buildExitNotePdf({
      ...transaction,
      id: 'venta-corta',
      items: transaction.items.slice(0, 1),
      subtotal: 20.5,
      discount: 0,
      total: 20.5,
      cashAmount: 20.5,
      transferAmount: 0,
      notes: undefined,
      isInstallment: false,
      paymentMethod: 'cash',
    });
    expect(doc.getNumberOfPages()).toBe(1);
  });
});
