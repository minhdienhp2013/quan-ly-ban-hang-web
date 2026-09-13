import { endAt, get, orderByChild, query, ref, startAt } from 'firebase/database';
import { db } from '../../firebase/client';
import type { Product, Purchase, Sale, SaleItem, StockOut, UserRole } from '../../types/models';
import { loadReport, type ReportBundle, type ReportRange } from '../reports/reportService';
import type { DashboardInventoryItem } from './dashboardViewModel';

export interface DashboardOperationalBundle {
  sales: Sale[];
  purchases: Purchase[];
  stockOuts: StockOut[];
  inventory: DashboardInventoryItem[];
}

export interface DashboardOwnerBundle extends DashboardOperationalBundle {
  role: 'owner';
  currentReport: ReportBundle;
  previousReport: ReportBundle;
}

export interface DashboardStaffBundle extends DashboardOperationalBundle {
  role: 'staff';
}

export type DashboardDataBundle = DashboardOwnerBundle | DashboardStaffBundle;

function requireDatabase() {
  if (!db) throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  return db;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') return Object.values(value as Record<string, T>);
  return [];
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function readProducts(): Promise<Product[]> {
  const snapshot = await get(ref(requireDatabase(), 'products'));
  if (!snapshot.exists()) return [];
  const raw = snapshot.val() as Record<string, Product>;
  return Object.entries(raw).map(([id, product]) => ({
    ...product,
    id: product.id || id,
    stockQuantity: finite(product.stockQuantity),
    stockVersion: finite(product.stockVersion),
  }));
}

async function readCreatedRange<T extends { id: string; createdAt: number }>(path: string, range: ReportRange): Promise<T[]> {
  const snapshot = await get(query(
    ref(requireDatabase(), path),
    orderByChild('createdAt'),
    startAt(range.from),
    endAt(range.to),
  ));
  if (!snapshot.exists()) return [];
  const raw = snapshot.val() as Record<string, T>;
  return Object.entries(raw)
    .map(([id, item]) => ({ ...item, id: item.id || id }))
    .sort((a, b) => finite(b.createdAt) - finite(a.createdAt));
}

function normalizeSales(sales: Sale[]) {
  return sales.map((sale) => ({ ...sale, items: asArray<SaleItem>(sale.items) }));
}

function normalizePurchases(purchases: Purchase[]) {
  return purchases.map((purchase) => ({ ...purchase, items: asArray<Purchase['items'][number]>(purchase.items) }));
}

function normalizeStockOuts(stockOuts: StockOut[]) {
  return stockOuts.map((stockOut) => ({ ...stockOut, items: asArray<StockOut['items'][number]>(stockOut.items) }));
}

function inventoryFromProducts(products: Product[]): DashboardInventoryItem[] {
  return products.map((product) => ({
    productId: product.id,
    sku: product.sku || product.id,
    name: product.name || product.sku || product.id,
    ...(product.unit ? { unit: product.unit } : {}),
    stockQuantity: finite(product.stockQuantity),
    ...(typeof product.minStock === 'number' ? { minStock: product.minStock } : {}),
    active: product.active === true,
  }));
}

function inventoryFromReport(report: ReportBundle): DashboardInventoryItem[] {
  return report.inventory.map((item) => ({
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    ...(item.unit ? { unit: item.unit } : {}),
    stockQuantity: finite(item.stockQuantity),
    ...(typeof item.minStock === 'number' ? { minStock: item.minStock } : {}),
    active: item.active === true,
  }));
}

async function loadStaffDashboard(range: ReportRange): Promise<DashboardStaffBundle> {
  // STAFF intentionally does not call loadReport(): loadReport reads /expenses,
  // while current Rules make Expense owner-only. This loader stays operational-only.
  const [products, salesRaw, purchasesRaw, stockOutsRaw] = await Promise.all([
    readProducts(),
    readCreatedRange<Sale>('sales', range),
    readCreatedRange<Purchase>('purchases', range),
    readCreatedRange<StockOut>('stockOuts', range),
  ]);

  const sales = normalizeSales(salesRaw).filter((sale) => sale.status === 'completed');
  const purchases = normalizePurchases(purchasesRaw).filter((purchase) => purchase.status === 'completed');
  const stockOuts = normalizeStockOuts(stockOutsRaw).filter((stockOut) => stockOut.status === 'completed');

  return {
    role: 'staff',
    sales,
    purchases,
    stockOuts,
    inventory: inventoryFromProducts(products),
  };
}

async function loadOwnerDashboard(currentRange: ReportRange, previousRange: ReportRange): Promise<DashboardOwnerBundle> {
  // Reuse Reports as the financial source of truth so historical COGS keeps
  // Sale.costTotal -> SaleItem.costPrice snapshot fallback semantics.
  const [currentReport, previousReport] = await Promise.all([
    loadReport(currentRange),
    loadReport(previousRange),
  ]);

  return {
    role: 'owner',
    currentReport,
    previousReport,
    sales: currentReport.sales,
    purchases: currentReport.purchases,
    stockOuts: currentReport.stockOuts,
    inventory: inventoryFromReport(currentReport),
  };
}

export function loadDashboardData(role: UserRole, currentRange: ReportRange, previousRange: ReportRange): Promise<DashboardDataBundle> {
  return role === 'owner'
    ? loadOwnerDashboard(currentRange, previousRange)
    : loadStaffDashboard(currentRange);
}
