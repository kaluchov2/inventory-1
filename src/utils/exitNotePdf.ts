import type { jsPDF as JsPdfDocument } from 'jspdf';
import { Transaction } from '../types';
import { formatCurrency } from './formatters';
import { getPaymentMethodLabel } from './satSalesReport';

const REGULAR_FONT_URL = new URL(
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf',
  import.meta.url,
).href;
const BOLD_FONT_URL = new URL(
  '../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf',
  import.meta.url,
).href;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar la tipografía del PDF.');
  return new Uint8Array(await response.arrayBuffer());
}

async function installPdfFonts(doc: JsPdfDocument): Promise<void> {
  const [regular, bold] = await Promise.all([
    loadFontBytes(REGULAR_FONT_URL),
    loadFontBytes(BOLD_FONT_URL),
  ]);
  doc.addFileToVFS('DejaVuSans.ttf', bytesToBase64(regular));
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', bytesToBase64(bold));
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
}

export function sanitizeExitNoteFolio(value: string): string {
  const sanitized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return sanitized || 'sin_folio';
}

function formatSaleDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatExitNoteUnitPrice(item: Transaction['items'][number]): string {
  const exactUnitPrice = item.quantity > 0 ? item.totalPrice / item.quantity : item.unitPrice;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(exactUnitPrice);
}

function paymentBreakdown(transaction: Transaction): string[] {
  const rows: string[] = [];
  if (transaction.cashAmount > 0) rows.push(`Efectivo: ${formatCurrency(transaction.cashAmount)}`);
  if (transaction.transferAmount > 0) rows.push(`Transferencia: ${formatCurrency(transaction.transferAmount)}`);
  if (transaction.cardAmount > 0) rows.push(`Tarjeta: ${formatCurrency(transaction.cardAmount)}`);
  return rows;
}

function ensureVerticalSpace(doc: JsPdfDocument, y: number, required: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + required <= pageHeight - 20) return y;
  doc.addPage();
  return 20;
}

export async function buildExitNotePdf(
  transaction: Transaction,
  soldByName?: string,
): Promise<JsPdfDocument> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await installPdfFonts(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const paid = transaction.cashAmount + transaction.transferAmount + transaction.cardAmount;
  const pending = Math.max(transaction.total - paid, 0);
  const itemSubtotal = transaction.items.reduce((sum, item) => sum + item.totalPrice, 0);
  const subtotal = Number.isFinite(transaction.subtotal) ? transaction.subtotal : itemSubtotal;

  doc.setProperties({
    title: `Nota de salida ${transaction.id}`,
    subject: 'Comprobante local de salida de productos',
    creator: 'Inventory MVP',
  });

  doc.setFont('DejaVu', 'bold');
  doc.setFontSize(18);
  doc.text('Nota de salida', margin, 18);
  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.line(margin, 25, pageWidth - margin, 25);

  doc.setFontSize(10);
  doc.setTextColor(31, 41, 55);
  doc.text(`Folio / ID: ${transaction.id}`, margin, 34);
  doc.text(`Fecha: ${formatSaleDate(transaction.date)}`, margin, 40);
  doc.text(`Cliente: ${transaction.customerName || 'Cliente de paso'}`, margin, 46);
  doc.text(`Vendedor: ${soldByName || 'No especificado'}`, margin, 52);

  autoTable(doc, {
    startY: 60,
    margin: { left: margin, right: margin, bottom: 24 },
    theme: 'grid',
    head: [['Producto', 'Clave SAT', 'Descripción SAT', 'Cant.', 'P. unitario', 'Importe']],
    body: transaction.items.map((item) => [
      item.productName,
      item.satKeyCode || 'Sin clave SAT',
      item.satKeyDescription || 'Sin clave SAT',
      String(item.quantity),
      formatExitNoteUnitPrice(item),
      formatCurrency(item.totalPrice),
    ]),
    styles: {
      font: 'DejaVu',
      fontSize: 7.5,
      cellPadding: 2.2,
      overflow: 'linebreak',
      valign: 'middle',
      textColor: [31, 41, 55],
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 25 },
      2: { cellWidth: 45 },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 29, halign: 'right' },
    },
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
  });

  let y = ((doc as JsPdfDocument & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 60) + 8;
  y = ensureVerticalSpace(doc, y, 48);
  const valueX = pageWidth - margin;

  doc.setFontSize(10);
  doc.setFont('DejaVu', 'normal');
  doc.text('Subtotal', pageWidth - 70, y);
  doc.text(formatCurrency(subtotal), valueX, y, { align: 'right' });
  y += 6;
  if (transaction.discount > 0) {
    doc.text('Descuento', pageWidth - 70, y);
    doc.text(`-${formatCurrency(transaction.discount)}`, valueX, y, { align: 'right' });
    y += 6;
  }
  doc.setFont('DejaVu', 'bold');
  doc.text('Total', pageWidth - 70, y);
  doc.text(formatCurrency(transaction.total), valueX, y, { align: 'right' });
  y += 9;

  doc.setFont('DejaVu', 'bold');
  doc.text(`Método: ${getPaymentMethodLabel(transaction.paymentMethod)}`, margin, y);
  y += 6;
  doc.setFont('DejaVu', 'normal');
  const breakdown = paymentBreakdown(transaction);
  if (breakdown.length === 0) breakdown.push('Sin pago registrado');
  breakdown.forEach((line) => {
    doc.text(line, margin, y);
    y += 5;
  });
  doc.setFont('DejaVu', 'bold');
  doc.text(`Saldo pendiente: ${formatCurrency(pending)}`, margin, y);
  y += 9;

  if (transaction.notes?.trim()) {
    const noteLines = doc.splitTextToSize(`Notas: ${transaction.notes.trim()}`, pageWidth - margin * 2) as string[];
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(9);
    for (const noteLine of noteLines) {
      y = ensureVerticalSpace(doc, y, 5);
      doc.text(noteLine, margin, y);
      y += 4.5;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(`Folio ${transaction.id}`, margin, pageHeight - 9);
    doc.text(`Página ${pageNumber} de ${pageCount}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
  }

  return doc;
}

export async function generateExitNotePdf(
  transaction: Transaction,
  soldByName?: string,
): Promise<void> {
  const doc = await buildExitNotePdf(transaction, soldByName);
  doc.save(`nota_salida_${sanitizeExitNoteFolio(transaction.id)}.pdf`);
}
