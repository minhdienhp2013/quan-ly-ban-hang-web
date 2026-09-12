export type UserRole = 'owner' | 'staff';

export interface AppUser {
  uid: string;
  displayName: string;
  email?: string;
  role: UserRole;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  qrCode?: string;
  categoryId?: string;
  unit?: string;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  minStock?: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  taxCode?: string;
  note?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
}

export type PaymentMethod = 'cash' | 'bank_transfer' | 'other';

export interface Sale {
  id: string;
  code: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  profit: number;
  paymentMethod?: PaymentMethod;
  note?: string;
  status: 'completed' | 'cancelled' | 'refunded';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface Purchase {
  id: string;
  code: string;
  supplierId?: string;
  supplierName?: string;
  items: PurchaseItem[];
  total: number;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type StockOutReason = 'internal_use' | 'damage' | 'gift' | 'other';

export interface StockOutItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  costPrice: number;
}

export interface StockOut {
  id: string;
  code: string;
  reason: StockOutReason;
  items: StockOutItem[];
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type StockMovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE'
  | 'PURCHASE_RETURN'
  | 'SALE'
  | 'SALE_RETURN'
  | 'STOCK_OUT'
  | 'STOCK_OUT_REVERSAL'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'MANUAL_ADJUSTMENT';

export type StockReferenceType =
  | 'opening'
  | 'sale'
  | 'purchase'
  | 'stockout'
  | 'stocktake'
  | 'manual';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number;
  referenceType?: StockReferenceType;
  referenceId?: string;
  note?: string;
  createdBy: string;
  createdAt: number;
}

export interface StocktakeItem {
  productId: string;
  systemQuantity: number;
  actualQuantity: number;
  difference: number;
}

export interface Stocktake {
  id: string;
  code: string;
  status: 'draft' | 'completed' | 'cancelled';
  items: StocktakeItem[];
  note?: string;
  createdBy: string;
  createdAt: number;
  completedAt?: number;
}

export interface Expense {
  id: string;
  code: string;
  category: string;
  amount: number;
  expenseDate: number;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface LabelTemplateSettings {
  id: string;
  name: string;
  columns: 1 | 2;
  labelWidthMm: number;
  labelHeightMm: number;
  gapMm?: number;
  pageMarginMm?: number;
}

export interface StoreSettings {
  storeName: string;
  address?: string;
  phone?: string;
  currency: 'VND';
  defaultLabelTemplateId?: string;
  labelTemplates?: Record<string, LabelTemplateSettings>;
  updatedAt: number;
}

export interface BackupEnvelope {
  schemaVersion: 1;
  exportedAt: number;
  data: {
    products?: Record<string, Product>;
    categories?: Record<string, Category>;
    customers?: Record<string, Customer>;
    suppliers?: Record<string, Supplier>;
    sales?: Record<string, Sale>;
    purchases?: Record<string, Purchase>;
    stockOuts?: Record<string, StockOut>;
    stockMovements?: Record<string, StockMovement>;
    stocktakes?: Record<string, Stocktake>;
    expenses?: Record<string, Expense>;
    settings?: StoreSettings;
  };
}

export interface AuditLog {
  id: string;
  actorUid: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary?: string;
  createdAt: number;
}
