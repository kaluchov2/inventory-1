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

function normalizeCustomerKey(value: string | undefined | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
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

// Export products by UPS batch — slim 9-column layout for pre/post-sale stock checks
export function exportProductsByUps(products: Product[], filename?: string): void {
  const data: any[] = products.map(p => ({
    'Artículo': p.name,
    'Categoría': getCategoryLabel(p.category),
    'Marca': p.brand || '',
    'Color': p.color || '',
    'Talla': p.size || '',
    'Disponible': p.availableQty,
    'Precio Unitario': p.unitPrice,
    'Estado': getStatusLabel(deriveStatus(p)),
    'Valor Total': p.availableQty * p.unitPrice,
  }));

  const totalValue = products
    .filter(p => p.availableQty > 0)
    .reduce((sum, p) => sum + p.availableQty * p.unitPrice, 0);
  const totalUnits = products.reduce((sum, p) => sum + p.availableQty, 0);

  data.push({
    'Artículo': 'TOTAL VALOR INVENTARIO',
    'Categoría': '',
    'Marca': '',
    'Color': '',
    'Talla': '',
    'Disponible': totalUnits,
    'Precio Unitario': '',
    'Estado': '',
    'Valor Total': totalValue,
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario');

  worksheet['!cols'] = [
    { wch: 40 }, // Artículo
    { wch: 15 }, // Categoría
    { wch: 15 }, // Marca
    { wch: 12 }, // Color
    { wch: 10 }, // Talla
    { wch: 12 }, // Disponible
    { wch: 15 }, // Precio Unitario
    { wch: 12 }, // Estado
    { wch: 15 }, // Valor Total
  ];

  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, filename || `inventario_ups_${date}.xlsx`);
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

  const totalSales = transactions
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.total, 0);
  const totalCash = transactions.reduce((sum, t) => sum + t.cashAmount, 0);
  const totalTransfer = transactions.reduce((sum, t) => sum + t.transferAmount, 0);
  const totalCard = transactions.reduce((sum, t) => sum + t.cardAmount, 0);

  data.push({
    'UPS': '',
    'Cliente': 'TOTAL',
    'Fecha': '',
    'Cantidad': '',
    'Artículo': '',
    'Categoría': '',
    'Marca': '',
    'Color': '',
    'Talla': '',
    'Precio Unitario': '',
    'Precio Total': '',
    'Descuento': '',
    'Total Venta': totalSales,
    'Pagos en Efectivo': totalCash,
    'Pagos Transferencia': totalTransfer,
    'Pago Tarjeta': totalCard,
    'Método de Pago': '',
    'Tipo': '',
    'Observaciones': '',
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

// Export transactions filtered by customer
export function exportTransactionsByCustomer(
  transactions: Transaction[],
  customerId: string,
  customerName: string
): void {
  const normalizedCustomerName = normalizeCustomerKey(customerName);
  const filteredSales = transactions
    .filter((t) => {
      if (t.type !== 'sale') return false;
      if (t.customerId === customerId) return true;
      return normalizeCustomerKey(t.customerName) === normalizedCustomerName;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const data: any[] = [];
  const salesWithoutItems = filteredSales.filter((t) => !t.items || t.items.length === 0).length;

  const getPaymentMethodLabel = (paymentMethod: Transaction['paymentMethod']) =>
    paymentMethod === 'cash' ? 'Efectivo' :
    paymentMethod === 'transfer' ? 'Transferencia' :
    paymentMethod === 'card' ? 'Tarjeta' :
    paymentMethod === 'mixed' ? 'Mixto' : 'Credito';

  filteredSales.forEach((t) => {
    if (!t.items || t.items.length === 0) {
      data.push({
        'Fecha Transaccion': formatDate(t.date),
        'Articulo Vendido': 'Venta sin detalle de articulos',
        'Cliente': t.customerName || customerName,
        'UPS': t.upsBatch ?? '',
        'Articulo Registrado': 'No',
        'Cantidad': '',
        'Precio Unitario': '',
        'Total Linea': t.total,
        'Total Transaccion': t.total,
        'Metodo de Pago': getPaymentMethodLabel(t.paymentMethod),
        'Notas': t.notes || 'No se encontraron renglones en transaction_items',
      });
      return;
    }

    t.items.forEach((item) => {
      const isRegisteredItem = !!(item.productId && item.productId.trim() !== '');
      data.push({
        'Fecha Transaccion': formatDate(t.date),
        'Articulo Vendido': item.productName,
        'Cliente': t.customerName || customerName,
        'UPS': item.upsBatch ?? '',
        'Articulo Registrado': isRegisteredItem ? 'Si' : 'No',
        'Cantidad': item.quantity,
        'Precio Unitario': item.unitPrice,
        'Total Linea': item.totalPrice,
        'Total Transaccion': t.total,
        'Metodo de Pago': getPaymentMethodLabel(t.paymentMethod),
        'Notas': t.notes || '',
      });
    });
  });

  const totalSales = filteredSales.reduce((sum, t) => sum + t.total, 0);
  const totalUnits = data.reduce((sum, row) => sum + (Number(row['Cantidad']) || 0), 0);

  data.push({
    'Fecha Transaccion': 'TOTAL',
    'Articulo Vendido': '',
    'Cliente': customerName,
    'UPS': '',
    'Articulo Registrado': '',
    'Cantidad': totalUnits,
    'Precio Unitario': '',
    'Total Linea': '',
    'Total Transaccion': totalSales,
    'Metodo de Pago': '',
    'Notas': salesWithoutItems > 0 ? `Ventas sin detalle: ${salesWithoutItems}` : '',
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas Cliente');

  worksheet['!cols'] = [
    { wch: 16 }, // Fecha Transaccion
    { wch: 40 }, // Articulo Vendido
    { wch: 28 }, // Cliente
    { wch: 8 },  // UPS
    { wch: 18 }, // Articulo Registrado
    { wch: 10 }, // Cantidad
    { wch: 14 }, // Precio Unitario
    { wch: 12 }, // Total Linea
    { wch: 16 }, // Total Transaccion
    { wch: 16 }, // Metodo de Pago
    { wch: 30 }, // Notas
  ];

  const safeName = customerName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `ventas_cliente_${safeName}_${date}.xlsx`);
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
