import * as XLSX from 'xlsx';
import { Product, Customer, Transaction, ProductStatus } from '../types';
import { getCategoryLabel } from '../constants/categories';
import { formatDate } from './formatters';
import { deriveStatus } from './productHelpers';

const statusLabels: Record<ProductStatus, string> = {
  available: 'Disponible',
  sold: 'Vendido',
  reserved: 'Reservado',
  promotional: 'Promocion',
  donated: 'Donado',
  review: 'Revisar',
  expired: 'Caducado',
  lost: 'Perdido',
};

function getStatusLabel(status: ProductStatus): string {
  return statusLabels[status] || status;
}

// Export products to Excel
export function exportProductsToExcel(products: Product[], filename?: string): void {
  const data = products.map(p => ({
    'UPS': p.upsBatch,
    'Categoría': getCategoryLabel(p.category),
    'Código': p.sku,
    'Cantidad': p.quantity,
    'Artículo': p.name,
    'Marca': p.brand || '',
    'Color': p.color || '',
    'Talla': p.size || '',
    'Precio Unitario': p.unitPrice,
    'Valor Total': p.quantity * p.unitPrice,
    'Estado': getStatusLabel(deriveStatus(p)),
    'Observaciones': p.description || '',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

  // Set column widths
  worksheet['!cols'] = [
    { wch: 6 },  // UPS
    { wch: 15 }, // Categoría
    { wch: 20 }, // Código
    { wch: 10 }, // Cantidad
    { wch: 40 }, // Artículo
    { wch: 15 }, // Marca
    { wch: 12 }, // Color
    { wch: 10 }, // Talla
    { wch: 15 }, // Precio Unitario
    { wch: 15 }, // Valor Total
    { wch: 12 }, // Estado
    { wch: 30 }, // Observaciones
  ];

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, filename || `inventario_${date}.xlsx`);
}

// Export customers to Excel
export function exportCustomersToExcel(customers: Customer[]): void {
  const data = customers.map(c => ({
    'Nombre': c.name,
    'Teléfono': c.phone || '',
    'Correo': c.email || '',
    'Saldo Pendiente': c.balance,
    'Total Compras': c.totalPurchases,
    'Fecha Registro': formatDate(c.createdAt),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

  worksheet['!cols'] = [
    { wch: 30 }, // Nombre
    { wch: 15 }, // Teléfono
    { wch: 25 }, // Correo
    { wch: 15 }, // Saldo Pendiente
    { wch: 15 }, // Total Compras
    { wch: 15 }, // Fecha Registro
  ];

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `clientes_${date}.xlsx`);
}

// Export transactions to Excel (Pagos format)
export function exportTransactionsToExcel(transactions: Transaction[]): void {
  const data: any[] = [];

  transactions.forEach(t => {
    t.items.forEach(item => {
      data.push({
        'UPS': item.upsBatch ?? '',
        'Cliente': t.customerName,
        'Fecha': formatDate(t.date),
        'Cantidad': item.quantity,
        'Artículo': item.productName,
        'Categoría': item.category ? getCategoryLabel(item.category) : '',
        'Marca': item.brand || '',
        'Color': item.color || '',
        'Talla': item.size || '',
        'Precio Unitario': item.unitPrice,
        'Precio Total': item.totalPrice,
        'Descuento': t.discount,
        'Total Venta': t.total,
        'Pagos en Efectivo': t.cashAmount,
        'Pagos Transferencia': t.transferAmount,
        'Pago Tarjeta': t.cardAmount,
        'Método de Pago': t.paymentMethod === 'cash' ? 'Efectivo' :
                         t.paymentMethod === 'transfer' ? 'Transferencia' :
                         t.paymentMethod === 'card' ? 'Tarjeta' :
                         t.paymentMethod === 'mixed' ? 'Mixto' : 'Crédito',
        'Tipo': t.type === 'sale' ? 'Venta' :
                t.type === 'return' ? 'Devolución' :
                t.type === 'installment_payment' ? 'Abono' : 'Ajuste',
        'Observaciones': t.notes || '',
      });
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pagos');

  worksheet['!cols'] = [
    { wch: 6 },  // UPS
    { wch: 25 }, // Cliente
    { wch: 12 }, // Fecha
    { wch: 10 }, // Cantidad
    { wch: 35 }, // Artículo
    { wch: 15 }, // Categoría
    { wch: 15 }, // Marca
    { wch: 12 }, // Color
    { wch: 10 }, // Talla
    { wch: 15 }, // Precio Unitario
    { wch: 15 }, // Precio Total
    { wch: 12 }, // Descuento
    { wch: 15 }, // Total Venta
    { wch: 18 }, // Pagos en Efectivo
    { wch: 20 }, // Pagos Transferencia
    { wch: 15 }, // Pago Tarjeta
    { wch: 15 }, // Método de Pago
    { wch: 12 }, // Tipo
    { wch: 30 }, // Observaciones
  ];

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `transacciones_${date}.xlsx`);
}

// Export all data to a single Excel file with multiple sheets
export function exportAllToExcel(
  products: Product[],
  customers: Customer[],
  transactions: Transaction[]
): void {
  const workbook = XLSX.utils.book_new();

  // Products sheet
  const productsData = products.map(p => ({
    'UPS': p.upsBatch,
    'Categoría': getCategoryLabel(p.category),
    'Código': p.sku,
    'Cantidad': p.quantity,
    'Artículo': p.name,
    'Marca': p.brand || '',
    'Color': p.color || '',
    'Talla': p.size || '',
    'Precio Unitario': p.unitPrice,
    'Estado': getStatusLabel(deriveStatus(p)),
    'Observaciones': p.description || '',
  }));
  const productsSheet = XLSX.utils.json_to_sheet(productsData);
  XLSX.utils.book_append_sheet(workbook, productsSheet, 'Inventario');

  // Customers sheet
  const customersData = customers.map(c => ({
    'Nombre': c.name,
    'Teléfono': c.phone || '',
    'Correo': c.email || '',
    'Saldo Pendiente': c.balance,
    'Total Compras': c.totalPurchases,
  }));
  const customersSheet = XLSX.utils.json_to_sheet(customersData);
  XLSX.utils.book_append_sheet(workbook, customersSheet, 'Clientes');

  // Transactions sheet
  const transactionsData: any[] = [];
  transactions.forEach(t => {
    if (t.items.length === 0) {
      // Installment payment
      transactionsData.push({
        'Cliente': t.customerName,
        'Fecha': formatDate(t.date),
        'Cantidad': '',
        'Artículo': 'Abono recibido',
        'Precio Total': t.total,
        'Método de Pago': t.paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia',
        'Tipo': 'Abono',
        'Observaciones': t.notes || '',
      });
    } else {
      t.items.forEach(item => {
        transactionsData.push({
          'UPS': item.upsBatch ?? '',
          'Cliente': t.customerName,
          'Fecha': formatDate(t.date),
          'Cantidad': item.quantity,
          'Artículo': item.productName,
          'Precio Unitario': item.unitPrice,
          'Precio Total': item.totalPrice,
          'Descuento': t.discount,
          'Total Venta': t.total,
          'Pagos en Efectivo': t.cashAmount,
          'Pagos Transferencia': t.transferAmount,
          'Pago Tarjeta': t.cardAmount,
          'Tipo': 'Venta',
          'Observaciones': t.notes || '',
        });
      });
    }
  });
  const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData);
  XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Pagos');

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `inventario_completo_${date}.xlsx`);
}
