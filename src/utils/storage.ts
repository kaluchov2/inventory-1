// LocalStorage keys
const STORAGE_KEYS = {
  PRODUCTS: 'inventory_products',
  CUSTOMERS: 'inventory_customers',
  TRANSACTIONS: 'inventory_transactions',
  SETTINGS: 'inventory_settings',
  BACKUP_REMINDER: 'inventory_backup_reminder',
} as const;

// Generic localStorage getter with type safety
export function getFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error);
    return defaultValue;
  }
}

// Generic localStorage setter
export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage key "${key}":`, error);
  }
}

// Remove item from storage
export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage key "${key}":`, error);
  }
}

// Storage key exports
export { STORAGE_KEYS };

// Backup functionality
export interface BackupData {
  version: string;
  timestamp: string;
  products: unknown[];
  customers: unknown[];
  transactions: unknown[];
  settings: unknown;
}

// Create full backup
export function createBackup(): BackupData {
  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    products: getFromStorage(STORAGE_KEYS.PRODUCTS, []),
    customers: getFromStorage(STORAGE_KEYS.CUSTOMERS, []),
    transactions: getFromStorage(STORAGE_KEYS.TRANSACTIONS, []),
    settings: getFromStorage(STORAGE_KEYS.SETTINGS, {}),
  };
}

// Export backup as JSON file
export function exportBackup(): void {
  const backup = createBackup();
  const dataStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `inventario_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Import backup from JSON
export function importBackup(backup: BackupData): boolean {
  try {
    if (backup.products) {
      saveToStorage(STORAGE_KEYS.PRODUCTS, backup.products);
    }
    if (backup.customers) {
      saveToStorage(STORAGE_KEYS.CUSTOMERS, backup.customers);
    }
    if (backup.transactions) {
      saveToStorage(STORAGE_KEYS.TRANSACTIONS, backup.transactions);
    }
    if (backup.settings) {
      saveToStorage(STORAGE_KEYS.SETTINGS, backup.settings);
    }
    return true;
  } catch (error) {
    console.error('Error importing backup:', error);
    return false;
  }
}

// Clear all data
export function clearAllData(): void {
  Object.values(STORAGE_KEYS).forEach(key => {
    removeFromStorage(key);
  });
}

// Check if backup reminder should be shown (weekly)
export function shouldShowBackupReminder(): boolean {
  const lastReminder = getFromStorage(STORAGE_KEYS.BACKUP_REMINDER, null);
  if (!lastReminder) return true;

  const lastReminderDate = new Date(lastReminder as string);
  const now = new Date();
  const daysSinceReminder = (now.getTime() - lastReminderDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceReminder >= 7;
}

// Mark backup reminder as shown
export function markBackupReminderShown(): void {
  saveToStorage(STORAGE_KEYS.BACKUP_REMINDER, new Date().toISOString());
}
