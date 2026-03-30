# Inventory Management System - Development Plan
## Updated with Complete Excel Analysis & Store Workflow

**Last Updated:** January 2025  
**Status:** Ready for Development

---

## Project Overview

Simple inventory management system for a small shop run by elderly people. Focus on ease of use, large UI elements, and minimal complexity.

**Current System Analysis (from Inventario_UPS.xlsx):**
- **1 sheet:** Inventario (main inventory)
- **9,745 product rows** → **23,191 total units**
- **Price range:** $5 - $41,500 MXN
- **Average price:** $584 MXN | **Median:** $300 MXN
- **Estimated inventory value:** ~$5.7M MXN
- **34 categories** (with data quality issues requiring normalization)

---

## Store Workflow (NEW)

### Product Arrival Process
1. **Day 1:** Products arrive from UPS
2. **Sorting:** Products sorted physically by category (big objects, small objects, household, etc.)
3. **Drop Assignment:** Each UPS shipment gets a Drop number

### Product Identification System

**Two formats exist in the data:**

| Type | Format | Example | Meaning | Count |
|------|--------|---------|---------|-------|
| **Legacy** | Single number | `15` | Drop 15 (multiple products share this) | ~9,000 products |
| **Numbered** | XXX/YY | `523/20` | Product #523 from Drop 20 | ~637 products |

**Key Insight:** The numbered format (`523/20`) means **Product 523 from Drop 20**, NOT year 2020. This is the newer tracking system for better individual product control.

### Barcode Strategy
```
Legacy:   D[DROP]-[SEQ]    → D15-0042  (Drop 15, sequence item #42)
Numbered: [PROD]-[DROP]    → 0523-20   (Product #523 from Drop 20)
```

---

## Tech Stack

### Core
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Library**: Chakra UI (excellent accessibility, large components)
- **State Management**: Zustand (simpler than Redux, perfect for small apps)
- **Storage**: LocalStorage (Phase 1), migrate to IndexedDB if needed
- **Routing**: React Router v6

### Additional Libraries
- **Forms**: React Hook Form (validation, easy to use)
- **Date handling**: date-fns (lightweight)
- **Icons**: React Icons
- **Excel import/export**: xlsx

---

## Excel Structure Analysis (UPDATED)

### Inventario Sheet (Main Data)
**Records:** 9,745 rows | **Total Units:** 23,191

| Column | Name | Data Type | Notes |
|--------|------|-----------|-------|
| A | UPS | string | Drop number OR product/drop format |
| B | Categoría | string | Category code (needs normalization) |
| C | Cantidad | number | Quantity in stock |
| D | Artículo | string | Product name |
| E | Marca | string | Brand |
| F | Color | string | Color |
| G | Talla | string | Size |
| H | Precio unitario | currency | Unit price (MXN) |
| I | Observaciones | string | Notes/Status (often "Vendido/Vendida") |
| J | *(Unnamed)* | string | **Buyer OR Seller** (mixed use) |

### Column J Optimization
Currently tracks both buyer AND seller in same column. **New system will split into:**
- `soldBy` - Staff member who made the sale (Vendedor)
- `soldTo` - Customer who bought the item (Comprador)

Users can manually update this data in the platform after import.

---

## Category System (COMPLETE - 34 Categories)

### Official Categories
| Code | Name | Description | Icon |
|------|------|-------------|------|
| ACC | Accesorios | Gorras, sombreros, cinturones, pañuelos, pashminas, cubrebocas | 🧢 |
| AUTO | Automotriz | Artículos para automóvil | 🚗 |
| BB | Bebés | Artículos para bebé | 👶 |
| BLLZ | Belleza | Maquillaje, perfumes, shampoos, cremas, secadoras, planchas, razuradoras | 💄 |
| BL | Blancos | Manteles, sábanas, colchas, cobijas, edredones, duvets, almohadas, cojines | 🛏️ |
| BLS | Bolsas | Bolsas, carteras, monederos, bolsas playa/súper, tarjeteros, cangureras | 👜 |
| CAB | Caballeros | Trajes de baño, jeans, shorts, pantalones, trajes, sacos, corbatas | 👔 |
| CAM | Cámaras | Cámaras fotográficas y de video | 📷 |
| COMP | Cómputo | Computadoras, laptops, accesorios | 💻 |
| DAM | Damas | Trajes de baño, shorts, blusas, pantalones, jeans, faldas, vestidos | 👗 |
| DOC | Doctores | Artículos médicos | ⚕️ |
| DEP | Deportes | Ropa para gym, aparatos para ejercicio | ⚽ |
| EL | Electrónica | Audífonos, mp3, bocinas, instrumentos musicales, luces led, adaptadores | 🎧 |
| ELD | Electrodomésticos | Licuadoras, aspiradoras, secadoras, batidoras | 🔌 |
| FERR | Herramientas | Ferretería y herramientas | 🔧 |
| HG | Hogar | Baño, cocina, jardín, albercas, decoración, cuadros, adornos, tapetes | 🏠 |
| IND | Industrial | Artículos industriales | 🏭 |
| JY | Joyería | Joyería y bisutería | 💍 |
| JUG | Juguetes | Juguetes y videojuegos | 🎮 |
| LD | Libros y Discos | Libros, discos, música | 📚 |
| LT | Lentes | Lentes de sol y oftálmicos | 👓 |
| MASC | Mascotas | Artículos para mascotas | 🐕 |
| MB | Muebles | Sillones, mesas, escritorios, mesas de trabajo | 🪑 |
| MOCH | Mochilas | Back packs, mochilas, bolsas de gym y boliche | 🎒 |
| N | Niños | Ropa y artículos para niños | 👦 |
| OF | Oficina | Portadocumentos, plumas, calculadoras, terminales | 📎 |
| REL | Relojes | Relojes, smartwatches, correas | ⌚ |
| RI | Ropa Interior | Chones, boxers, lencería, calcetines, fajas, pijamas | 🩲 |
| SAL | Salud | Suplementos nutricionales | 💊 |
| TEC | Tecnología | Artículos de tecnología | 📱 |
| TELYCEL | Telefonía | Micas, carcasas de celular y iPads | 📲 |
| V | Varios | Cierres, pipas, artículos varios | 📦 |
| VIB | VIB | VIB | 📦 |
| ZPT | Zapatos | Tenis, pantuflas, sandalias, crocs, zapatos, botas, patines | 👟 |

### Category Normalization (Data Quality Issues Found)

The Excel has many typos and variations. **Normalize on import:**

```typescript
const CATEGORY_ALIASES: Record<string, string> = {
  // Standard variations
  'JOY': 'JY',      // 159 items
  'DP': 'DEP',      // 96 items
  'LYD': 'LD',      // 75 items
  'JGT': 'JUG',     // 24 items
  'JYV': 'JUG',
  'ZPY': 'ZPT',
  'TELCEL': 'TELYCEL',
  'BBLZ': 'BLLZ',
  'MCH': 'MOCH',
  'MAS': 'MASC',
  'REI': 'REL',
  'RL': 'REL',
  
  // Lowercase variations
  'El': 'EL',
  'Sal': 'SAL',
  'Dam': 'DAM',
  'Bllz': 'BLLZ',
  'Jy': 'JY',
  'Mas': 'MASC',
  
  // Typos
  'CA>B': 'CAB',
  'BZZA': 'BLLZ',
  'MUS': 'LD',
  'ELEC': 'EL',
  'ZYP': 'ZPT',
  'J': 'JY',
  'DYL': 'LD',
  
  // Unisex → Varios
  'UNIX': 'V',
  'UNSX': 'V',
  'UNISEX': 'V',
  
  // Leading/trailing spaces handled by trim()
};
```

---

## MVP Features - Phase 1 (No Login)

### 1. Product Management
**Time: 8-10 hours**

#### Features:
- Add new product form
  - **Drop Number** (required, dropdown: existing drops or "New")
  - **Product Number** (optional - for numbered system, auto-generates for legacy)
  - Product name / Artículo (required)
  - Current quantity / Cantidad (required, number)
  - Unit price / Precio Unitario (required, currency MXN)
  - Category / Categoría (searchable dropdown with full Spanish names)
  - Brand / Marca (searchable dropdown, allow new entries)
  - Color (optional, dropdown with common colors)
  - Size / Talla (optional, flexible text field)
  - Notes / Observaciones (optional, textarea)
  - **Seller / Vendedor** (optional, dropdown of staff)
  - **Buyer / Comprador** (optional, text or customer dropdown)
  
- Product list view
  - Sortable table (by name, quantity, price, category, drop)
  - Search by name, brand, or barcode
  - Filter by category
  - **Filter by Drop number** (prominent filter)
  - Visual indicator for low stock (configurable threshold)
  - **Status indicator** (available, sold, reserved, promotional, donated)
  - **Barcode display** with copy/print options
  
- Edit product (inline or modal)
- Delete product (with confirmation)
- Mark as sold (quick action)
- **Batch price adjustment** (markdown entire drop)

#### Updated Data Model:
```typescript
interface Product {
  id: string;
  
  // === IDENTIFICATION ===
  upsRaw: string;                // Original value from Excel
  identifierType: 'legacy' | 'numbered';
  dropNumber: number;            // Always present (7, 8, 9... 20, 21...)
  productNumber?: number;        // For numbered type only (e.g., 523)
  dropSequence?: number;         // For legacy type - auto-assigned on import
  barcode: string;               // Generated: "D15-0042" or "0523-20"
  
  // === PRODUCT INFO ===
  name: string;                  // Artículo
  category: CategoryCode;        // Normalized code
  categoryDisplay: string;       // Full Spanish name
  quantity: number;              // Cantidad
  unitPrice: number;             // Precio Unitario (MXN)
  originalPrice?: number;        // For tracking markdowns
  
  // === DETAILS ===
  brand?: string;                // Marca
  color?: string;                // Color
  size?: string;                 // Talla
  notes?: string;                // Observaciones (cleaned)
  
  // === STATUS ===
  status: 'available' | 'sold' | 'reserved' | 'promotional' | 'donated';
  
  // === TRACKING (Separate fields - OPTIMIZED) ===
  soldBy?: string;               // Staff who sold (Vendedor)
  soldTo?: string;               // Customer who bought (Comprador)
  
  // === TIMESTAMPS ===
  createdAt: Date;
  updatedAt: Date;
  soldAt?: Date;
}

type CategoryCode = 
  | 'ACC' | 'AUTO' | 'BB' | 'BLLZ' | 'BL' | 'BLS' 
  | 'CAB' | 'CAM' | 'COMP' | 'DAM' | 'DOC' | 'DEP'
  | 'EL' | 'ELD' | 'FERR' | 'HG' | 'IND' | 'JY' 
  | 'JUG' | 'LD' | 'LT' | 'MASC' | 'MB' | 'MOCH'
  | 'N' | 'OF' | 'REL' | 'RI' | 'SAL' | 'TEC'
  | 'TELYCEL' | 'V' | 'VIB' | 'ZPT';
```

### 2. Drop Management (NEW)
**Time: 3-4 hours**

#### Features:
- List all Drops with summary stats
- Create new Drop (when new UPS shipment arrives)
- View products by Drop
- **Batch price adjustment** (markdown entire Drop by percentage)
- Archive old Drops
- Drop summary showing: total products, total value, sold count, available count

#### Data Model:
```typescript
interface Drop {
  id: string;
  dropNumber: number;            // 7, 8, 9... 20, 21...
  arrivalDate?: Date;
  
  // Computed stats
  totalProducts: number;
  totalUnits: number;
  totalValue: number;
  soldCount: number;
  availableCount: number;
  
  status: 'active' | 'archived';
  notes?: string;
  createdAt: Date;
}
```

### 3. Staff Management (NEW)
**Time: 2-3 hours**

#### Features:
- Simple list of staff members
- Add/edit/remove staff
- Track sales by staff member
- Dropdown in sale form

#### Data Model:
```typescript
interface Staff {
  id: string;
  name: string;
  isActive: boolean;
  totalSales: number;
  totalAmount: number;
  createdAt: Date;
}
```

### 4. Customer Management
**Time: 4-6 hours**

#### Features:
- Customer list with search
- Individual customer accounts
- Customer purchase history
- Outstanding balance tracking (Abonos system)

#### Data Model:
```typescript
interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  balance: number;               // Outstanding amount owed
  totalPurchases: number;        // Lifetime purchases
  purchaseCount: number;
  lastPurchaseDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5. Sales & Payment System
**Time: 8-10 hours**

#### Features:
- **Sale Registration**
  - Select customer (searchable, or "Walk-in")
  - Select product(s) by name or **barcode scan**
  - Quantity
  - Apply discount (percentage or fixed amount)
  - Calculate total
  - **Select staff member** (who's making the sale)
  
- **Payment Methods** (matching their current system):
  - Efectivo (Cash)
  - Transferencia (Bank Transfer)
  - Tarjeta (Card)
  - **Abono (Partial Payment/Installment)** ← Critical feature!
  
- **Installment Payment System (Abonos)**
  - Record partial payments against customer balance
  - Track remaining balance
  - Payment history per customer
  
- Discount tracking in notes
- Return/refund handling

#### Data Model:
```typescript
interface Transaction {
  id: string;
  customerId?: string;
  customerName: string;
  staffId?: string;              // NEW: Who made the sale
  staffName?: string;            // Denormalized
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  discountNote?: string;
  total: number;
  
  // Payment breakdown
  paymentMethod: 'cash' | 'transfer' | 'card' | 'mixed' | 'credit';
  cashAmount: number;
  transferAmount: number;
  cardAmount: number;
  actualCardAmount?: number;     // After fees
  
  // Installment payments
  isInstallment: boolean;
  installmentAmount?: number;
  remainingBalance?: number;
  
  dropNumber?: number;
  notes?: string;
  date: Date;
  paymentDate?: Date;
  
  type: 'sale' | 'return' | 'adjustment' | 'installment_payment';
  createdAt: Date;
}

interface TransactionItem {
  productId: string;
  productName: string;
  barcode: string;               // NEW
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
}
```

### 6. Transaction History & Reports
**Time: 6-8 hours**

#### Features:
- Transaction history table with all filters
- Filters: Date range, Customer, Category, Payment method, **Drop number**, **Staff**
- **Reports/Summaries:**
  - Total sales today/week/month
  - Cash vs Transfer vs Card breakdown
  - Sales by category
  - **Sales by Drop**
  - **Sales by Staff member**
  - Outstanding customer balances
  - Low stock alerts
  - Top selling products
  - Top customers
- Export to Excel

### 7. Dashboard/Home Screen
**Time: 4-6 hours**

#### Features:
- Summary cards:
  - Total products in inventory
  - Total inventory value
  - Low stock items count
  - Today's sales breakdown
  - Outstanding customer balances
  - Recent transactions
  
- Quick actions buttons (LARGE, elder-friendly):
  - 🛒 **Registrar Venta** (Register Sale)
  - 📦 **Agregar Producto** (Add Product)
  - 💰 **Recibir Abono** (Receive Installment)
  - 📋 **Ver Inventario** (View Inventory)
  
- **Drop selector** for quick filtering
- Visual indicators (colors, large numbers)

### 8. Elder-Friendly UI Polish
**Time: 4-6 hours**

#### Specific Requirements:
- Large font sizes (minimum 18px body, buttons 20-22px)
- High contrast colors
- Large touch targets (buttons minimum 48x48px)
- Generous spacing (padding: 16-24px)
- **Spanish language throughout**
- Clear labels (no technical jargon)
- Confirmation dialogs for destructive actions
- Toast notifications for success/error
- Loading states with spinner
- Error messages in simple Spanish
- Minimal scrolling on main screens
- **Large "Cancelar" (Cancel) buttons**

#### Color Scheme:
```typescript
const colors = {
  primary: '#2B6CB0',      // Blue - trustworthy
  success: '#38A169',      // Green - sales, positive
  warning: '#D69E2E',      // Yellow/Orange - low stock
  danger: '#E53E3E',       // Red - deletions, errors
  background: '#F7FAFC',   // Light gray - easy on eyes
  text: '#1A202C',         // Dark gray - high contrast
};
```

### 9. Data Management
**Time: 6-8 hours**

#### Features:
- **Import from Excel** (CRITICAL)
  - Parse UPS column (both legacy and numbered formats)
  - Normalize categories automatically
  - Generate barcodes
  - Detect status from Observaciones
  - Split Column J into soldBy/soldTo (flag for manual review)
  - Preview before import
  - Validation and error reporting
  
- **Export to Excel** (match their format)
- **Backup** (JSON format, one-click)
- **Settings:**
  - Low stock thresholds
  - Manage categories
  - Manage staff list
  - Card payment fee percentage

---

## Excel Import Mapping (UPDATED)

### UPS Parsing Logic
```typescript
interface ParsedUPS {
  type: 'legacy' | 'numbered';
  dropNumber: number;
  productNumber?: number;
  raw: string;
}

function parseUPS(value: string): ParsedUPS {
  const raw = String(value).trim();
  
  // Pattern 1: Simple number → Legacy (7, 8, 9...)
  if (/^\d{1,2}$/.test(raw)) {
    return { type: 'legacy', dropNumber: parseInt(raw), raw };
  }
  
  // Pattern 2: XXX/YY → Numbered (523/20 = Product 523, Drop 20)
  const match = raw.match(/^(\d{1,3})[\/\(](\d{1,3})$/);
  if (match) {
    return {
      type: 'numbered',
      productNumber: parseInt(match[1]),
      dropNumber: parseInt(match[2]),
      raw
    };
  }
  
  // Fallback
  const anyNum = raw.match(/(\d+)/);
  return { type: 'legacy', dropNumber: anyNum ? parseInt(anyNum[1]) : 0, raw };
}
```

### Barcode Generation
```typescript
function generateBarcode(parsed: ParsedUPS, sequence: number): string {
  if (parsed.type === 'numbered' && parsed.productNumber) {
    // 0523-20 (Product #523, Drop 20)
    const prod = String(parsed.productNumber).padStart(4, '0');
    const drop = String(parsed.dropNumber).padStart(2, '0');
    return `${prod}-${drop}`;
  }
  
  // D15-0042 (Drop 15, sequence 42)
  const drop = String(parsed.dropNumber).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `D${drop}-${seq}`;
}
```

### Inventario → Products Mapping
```typescript
const inventarioMapping = {
  'UPS': 'upsRaw',               // Parse with parseUPS()
  'Categoría': 'category',       // Normalize with aliases
  'Cantidad': 'quantity',
  'Artículo': 'name',
  'Marca': 'brand',
  'Color': 'color',
  'Talla': 'size',
  'Precio unitario': 'unitPrice',
  'Observaciones': 'notes',      // Also detect status
  // Column J (unnamed) → flag for manual soldBy/soldTo assignment
};
```

### Status Detection
```typescript
function detectStatus(notes: string | null): ProductStatus {
  if (!notes) return 'available';
  const lower = notes.toLowerCase();
  
  if (/vendid[oa]s?/.test(lower)) return 'sold';
  if (/promocional/.test(lower)) return 'promotional';
  if (/donad[oa]/.test(lower)) return 'donated';
  if (/apartad[oa]/.test(lower)) return 'reserved';
  
  return 'available';
}
```

---

## Project Structure (UPDATED)

```
src/
├── components/
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── SearchableSelect.tsx
│   │   ├── Modal.tsx
│   │   ├── Table.tsx
│   │   ├── ConfirmDialog.tsx
│   │   ├── Toast.tsx
│   │   └── LoadingSpinner.tsx
│   ├── products/
│   │   ├── ProductForm.tsx
│   │   ├── ProductList.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductSearch.tsx
│   │   ├── CategorySelect.tsx
│   │   └── BarcodeDisplay.tsx
│   ├── drops/                    # NEW
│   │   ├── DropList.tsx
│   │   ├── DropSummary.tsx
│   │   ├── DropFilter.tsx
│   │   └── DropPriceAdjust.tsx
│   ├── staff/                    # NEW
│   │   ├── StaffForm.tsx
│   │   ├── StaffList.tsx
│   │   └── StaffSelect.tsx
│   ├── customers/
│   │   ├── CustomerForm.tsx
│   │   ├── CustomerList.tsx
│   │   ├── CustomerBalance.tsx
│   │   └── CustomerSearch.tsx
│   ├── sales/
│   │   ├── SaleForm.tsx
│   │   ├── QuickSale.tsx
│   │   ├── PaymentSelector.tsx
│   │   ├── DiscountInput.tsx
│   │   └── InstallmentForm.tsx
│   ├── transactions/
│   │   ├── TransactionHistory.tsx
│   │   ├── TransactionFilters.tsx
│   │   └── TransactionDetail.tsx
│   └── dashboard/
│       ├── Dashboard.tsx
│       ├── SummaryCards.tsx
│       ├── QuickActions.tsx
│       ├── RecentSales.tsx
│       └── LowStockAlert.tsx
├── hooks/
│   ├── useProducts.ts
│   ├── useCustomers.ts
│   ├── useStaff.ts               # NEW
│   ├── useTransactions.ts
│   ├── useDrops.ts               # NEW
│   └── useLocalStorage.ts
├── store/
│   ├── productStore.ts
│   ├── customerStore.ts
│   ├── staffStore.ts             # NEW
│   ├── transactionStore.ts
│   └── dropStore.ts              # NEW
├── types/
│   ├── index.ts
│   ├── product.ts
│   ├── customer.ts
│   ├── staff.ts                  # NEW
│   ├── transaction.ts
│   └── drop.ts                   # NEW
├── utils/
│   ├── storage.ts
│   ├── excelImport.ts
│   ├── excelExport.ts
│   ├── barcodeGenerator.ts       # NEW
│   ├── upsParser.ts              # NEW
│   ├── categoryHelpers.ts
│   ├── formatters.ts
│   └── validators.ts
├── constants/
│   ├── categories.ts             # Updated with 34 categories
│   ├── categoryAliases.ts        # NEW - normalization map
│   └── colors.ts
├── pages/
│   ├── Home.tsx
│   ├── Products.tsx
│   ├── Drops.tsx                 # NEW
│   ├── Staff.tsx                 # NEW
│   ├── Customers.tsx
│   ├── Sales.tsx
│   ├── Reports.tsx
│   ├── Import.tsx
│   └── Settings.tsx
├── i18n/
│   └── es.ts
├── App.tsx
└── main.tsx
```

---

## Development Timeline

### Week 1 (40-48 hours)
- **Day 1-2**: Setup + Product Management (14-16 hours)
  - Project setup, dependencies
  - Basic routing
  - Product CRUD with all fields including new identification system
  - Category system with 34 categories + normalization
  - Barcode generation
  
- **Day 3**: Drop + Staff Management (6-8 hours)
  - Drop CRUD and filtering
  - Staff management
  - Batch price adjustment
  
- **Day 4**: Customer Management + Sales (8-10 hours)
  - Customer CRUD
  - Sale form with payment methods
  - Installment (Abono) system
  - Staff tracking on sales
  
- **Day 5**: Dashboard + UI Polish (8-10 hours)
  - Dashboard creation
  - Elder-friendly improvements
  - Spanish localization
  - Testing

### Week 2 (20-24 hours)
- **Day 1-2**: Excel Import/Export (10-12 hours)
  - UPS parsing (both formats)
  - Category normalization
  - Barcode generation on import
  - Column J handling (flag for review)
  - Export matching their format
  
- **Day 3**: Testing & Refinements (6-8 hours)
  - Test with real 9,745 product data
  - Bug fixes
  - Performance optimization
  
- **Day 4**: User Testing (4-6 hours)
  - Session with shop owners
  - Gather feedback
  - Quick adjustments

---

## Testing Strategy

1. **Data Import Testing**
   - Import actual Inventario_UPS.xlsx
   - Verify all 9,745 products load correctly
   - Verify UPS parsing works for both formats
   - Check category normalization handles all typos
   - Verify barcodes generated correctly

2. **Manual Testing**
   - Test all CRUD operations
   - Test payment flows
   - Test barcode search
   - Test drop filtering
   - Test with realistic data volumes

3. **User Testing**
   - Have elderly owners try basic workflows
   - Observe pain points
   - Adjust UI based on feedback

4. **Edge Cases**
   - Empty states
   - Large numbers ($41,500 unit prices exist)
   - Long product names
   - Special characters in Spanish
   - Data persistence after browser close

---

## Key Success Metrics

- ✅ Can import existing Excel data without data loss
- ✅ Can add a product in < 30 seconds
- ✅ Can register a sale in < 20 seconds
- ✅ Can search by barcode instantly
- ✅ Can filter by Drop number easily
- ✅ Can track who sold what (staff tracking)
- ✅ Can view customer balance at a glance
- ✅ Zero data loss
- ✅ Shop owners can use without assistance
- ✅ All UI in Spanish

---

## Migration Checklist

### Pre-Migration
- [ ] Backup current Excel file
- [ ] Test import with copy of data
- [ ] Verify category mappings
- [ ] Set up staff list

### Migration Steps
1. [ ] Import Inventario sheet → Products
2. [ ] Parse UPS numbers (legacy + numbered)
3. [ ] Generate barcodes for all products
4. [ ] Normalize all categories
5. [ ] Detect status from Observaciones
6. [ ] Create Drop records
7. [ ] Flag Column J entries for manual review
8. [ ] Verify totals match (9,745 products, 23,191 units)
9. [ ] Parallel run for 1 week

### Post-Migration
- [ ] Train users on new system
- [ ] Set up regular backups
- [ ] Document common workflows
- [ ] Review and fix soldBy/soldTo entries

---

## Summary of Changes from Previous Plan

| Area | Previous | Updated |
|------|----------|---------|
| Products | 23,239 items | 9,745 rows → 23,191 units |
| UPS Format | Single format | **Two formats:** legacy + numbered |
| Barcode | SKU-based | **UPS-based:** D15-0042 or 0523-20 |
| Categories | 27 | **34 categories** with full normalization |
| Column J | Not addressed | **Split into soldBy + soldTo** |
| Staff | Not tracked | **New Staff entity** |
| Drops | Basic filter | **Full Drop management** |
| Price range | Up to $18,000 | Up to **$41,500** |
| ELD Category | Not listed | **Added** (Electrodomésticos) |
| VIB Category | "Varios" | Keep as **"VIB"** |

---

## Notes

- **Keep it SIMPLE** - resist feature creep
- Prioritize speed of common operations
- Make errors impossible (validation)
- Offline-first design
- Regular backups are critical
- Get feedback early and often
- **System has 9,745 products - optimize for this scale**
- **Support the Abono (installment) system - critical to their business**
- **Match their Excel format for exports**
- **Barcode system enables future scanner integration**
