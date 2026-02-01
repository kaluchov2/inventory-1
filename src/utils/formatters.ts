import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Format currency in Mexican Pesos
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Format number with thousands separator
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-MX').format(num);
};

// Format date in Spanish
export const formatDate = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, 'dd/MM/yyyy', { locale: es });
};

// Format date with time
export const formatDateTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, "dd/MM/yyyy 'a las' HH:mm", { locale: es });
};

// Format date for display (longer format)
export const formatDateLong = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, "d 'de' MMMM, yyyy", { locale: es });
};

// Parse currency input (remove $ and commas)
export const parseCurrencyInput = (value: string): number => {
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Generate unique ID
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

// Generate SKU from product info
export const generateSKU = (category: string, upsBatch: number): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${category}-${upsBatch}-${timestamp}`;
};

// Truncate text with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

// Get current ISO date string
export const getCurrentISODate = (): string => {
  return new Date().toISOString();
};
