// ============================================
// V2 Architecture Types
// ============================================

// Identifier type for UPS formats
export type IdentifierType = 'legacy' | 'numbered';

// Category codes used in the inventory system (34 total)
export type CategoryCode =
  | 'HG' | 'DAM' | 'CAB' | 'ZPT' | 'EL' | 'BLLZ' | 'ACC'
  | 'BLS' | 'DEP' | 'REL' | 'FERR' | 'RI' | 'JY' | 'BB'
  | 'JUG' | 'SAL' | 'N' | 'MOCH' | 'VIB' | 'LD' | 'LT'
  | 'MASC' | 'CEL' | 'COMP' | 'AUTO' | 'BL' | 'DOC'
  // New V2 categories (7 additional)
  | 'COC' | 'JAR' | 'DEC' | 'MUE' | 'PAP' | 'MUS' | 'TOOL';

// Product status (5 values in V2)
export type ProductStatus = 'available' | 'sold' | 'reserved' | 'promotional' | 'donated';

// Drop status
export type DropStatus = 'active' | 'completed' | 'archived';

// Payment methods
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'mixed' | 'credit';

// Transaction types
export type TransactionType = 'sale' | 'return' | 'adjustment' | 'installment_payment';

// User roles for authentication
export type UserRole = 'admin' | 'user' | 'viewer';

// ============================================
// V2 Entities: Drop
// ============================================

export interface Drop {
  id: string;
  dropNumber: string;          // Unique identifier (e.g., "15" or "523")
  arrivalDate: string;         // When the drop arrived
  status: DropStatus;
  // Stats (computed from products)
  totalProducts: number;       // Number of unique products
  totalUnits: number;          // Total quantity of items
  totalValue: number;          // Sum of all unit prices
  soldCount: number;           // Number of items sold
  availableCount: number;      // Number of items still available
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// V2 Entities: Staff
// ============================================

export interface Staff {
  id: string;
  name: string;
  isActive: boolean;
  // Sales tracking
  totalSales: number;          // Number of sales made
  totalAmount: number;         // Total revenue generated
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// V2 Product Interface
// ============================================

export interface Product {
  id: string;
  name: string;                // Artículo
  sku: string;

  // V2 UPS fields
  upsRaw: string;              // Original UPS value as entered
  identifierType: IdentifierType; // 'legacy' or 'numbered'
  dropNumber: string;          // Extracted drop number (e.g., "15" or "523")
  productNumber?: number;      // For numbered format: product number (e.g., 20 from "523/20")
  dropSequence?: number;       // Sequential number within drop for barcode

  // Legacy field (kept for backward compatibility)
  upsBatch: number;            // UPS No. (legacy format)

  quantity: number;            // Cantidad
  unitPrice: number;           // Precio Unitario (MXN)
  originalPrice?: number;      // Original price before markdown
  category: CategoryCode;      // Categoría
  brand?: string;              // Marca
  color?: string;              // Color
  size?: string;               // Talla
  description?: string;        // Observaciones
  barcode?: string;            // V2: UPS-based barcode (e.g., "D15-0042" or "0523-20")

  // Status and tracking
  status: ProductStatus;
  soldBy?: string;             // FK → Staff.id
  soldTo?: string;             // FK → Customer.id
  soldAt?: string;             // When the item was sold

  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Customer Interface
// ============================================

export interface Customer {
  id: string;
  name: string;                // Cliente
  phone?: string;
  email?: string;
  balance: number;             // Outstanding amount owed
  totalPurchases: number;      // Lifetime purchases
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Transaction Interfaces
// ============================================

export interface TransactionItem {
  productId: string;
  productName: string;         // Artículo
  quantity: number;            // Cantidad
  unitPrice: number;           // Precio Unitario
  totalPrice: number;          // Precio Total
  category?: CategoryCode;
  brand?: string;
  color?: string;
  size?: string;
}

export interface Transaction {
  id: string;
  customerId?: string;         // Cliente (optional for walk-ins)
  customerName: string;        // Denormalized
  items: TransactionItem[];
  subtotal: number;
  discount: number;            // Discount amount
  discountNote?: string;       // "50% desc", "Desc. 30%"
  total: number;               // Precio Total

  // Payment breakdown
  paymentMethod: PaymentMethod;
  cashAmount: number;          // Pagos en Efectivo
  transferAmount: number;      // Pagos Transferencia
  cardAmount: number;          // Pago Tarjeta
  actualCardAmount?: number;   // Pago Real de tarjeta (after fees)

  // Installment payments
  isInstallment: boolean;      // Is this an Abono?
  installmentAmount?: number;
  remainingBalance?: number;

  // V2: Staff tracking
  soldBy?: string;             // FK → Staff.id

  upsBatch?: number;           // UPS No.
  notes?: string;              // Observaciones
  date: string;                // Fecha
  paymentDate?: string;        // Fecha de Pago

  type: TransactionType;
  createdAt: string;
}

// ============================================
// Installment Payment
// ============================================

export interface InstallmentPayment {
  id: string;
  customerId: string;
  originalTransactionId: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer';
  date: string;
  notes?: string;
}

// ============================================
// Settings Interface
// ============================================

export interface Settings {
  defaultLowStockThreshold: number;
  cardFeePercentage: number;
  customBrands: string[];
  customColors: string[];
}

// ============================================
// User & Auth Interfaces
// ============================================

export interface User {
  id: string;
  email: string;
  displayName?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ============================================
// Parsed UPS Result (for upsParser utility)
// ============================================

export interface ParsedUPS {
  raw: string;
  identifierType: IdentifierType;
  dropNumber: string;
  productNumber?: number;
}
