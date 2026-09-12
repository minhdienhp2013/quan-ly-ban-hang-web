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

export interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  code: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  costTotal: number;
  profit: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'other';
  status: 'completed' | 'cancelled';
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
  items: PurchaseItem[];
  total: number;
  supplierName?: string;
  note?: string;
  status: 'completed' | 'cancelled';
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export type StockMovementType =
  | 'PURCHASE'
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'STOCKTAKE_ADJUSTMENT'
  | 'MANUAL_ADJUSTMENT';

export interface StockMovement {
  id: string;
  productId: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  referenceType?: 'sale' | 'purchase' | 'stocktake' | 'manual';
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
  createdBy: string;
  createdAt: number;
  completedAt?: number;
}

export interface StoreSettings {
  storeName: string;
  address?: string;
  phone?: string;
  currency: 'VND';
  defaultLabelWidthMm?: number;
  defaultLabelHeightMm?: number;
  updatedAt: number;
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
