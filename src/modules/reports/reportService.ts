import { get, ref } from 'firebase/database';
import { db } from '../../firebase/client';
import type { Customer, Expense, Product, Purchase, Sale, SaleItem, StockMovement, StockOut, Supplier } from '../../types/models';

export type ReportPreset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export interface ReportRange { from: number; to: number; label: string; }
export interface ReportSummary {
  revenue: number; costOfGoods: number; grossProfit: number; expenseTotal: number; netProfit: number;
  completedSales: number; purchaseTotal: number; stockOutValue: number; inventoryQuantity: number;
  inventoryValue: number; lowStockCount: number; outOfStockCount: number;
}
export interface InventoryReportRow {
  productId: string; sku: string; name: string; unit?: string; stockQuantity: number; minStock?: number;
  status: 'out' | 'low' | 'ok'; currentUnitCost: number; currentInventoryValue: number; active: boolean;
}
export interface CustomerReportRow { customerId: string; customerName: string; orderCount: number; revenue: number; costOfGoods: number; grossProfit: number; }
export interface SupplierReportRow { supplierId: string; supplierName: string; purchaseCount: number; purchaseTotal: number; }
export interface ReportBundle {
  range: ReportRange; summary: ReportSummary; sales: Sale[]; expenses: Expense[]; purchases: Purchase[];
  stockOuts: StockOut[]; movements: StockMovement[]; inventory: InventoryReportRow[];
  customers: CustomerReportRow[]; suppliers: SupplierReportRow[]; warnings: string[];
}

function requireDatabase() { if (!db) throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.'); return db; }
function startOfDay(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; }
function endOfDay(date: Date) { const value = new Date(date); value.setHours(23, 59, 59, 999); return value; }
function dateLabel(date: Date) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(date); }
function rangeLabel(from: Date, to: Date) { return `${dateLabel(from)} – ${dateLabel(to)}`; }

export function buildPresetRange(preset: Exclude<ReportPreset, 'custom'>, now = new Date()): ReportRange {
  const current = new Date(now); let from: Date; let to: Date;
  switch (preset) {
    case 'today': from = startOfDay(current); to = endOfDay(current); break;
    case 'yesterday': { const day = new Date(current); day.setDate(day.getDate() - 1); from = startOfDay(day); to = endOfDay(day); break; }
    case 'week': { const monday = new Date(current); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); from = startOfDay(monday); to = endOfDay(current); break; }
    case 'month': from = new Date(current.getFullYear(), current.getMonth(), 1); to = endOfDay(current); break;
    case 'quarter': from = new Date(current.getFullYear(), Math.floor(current.getMonth() / 3) * 3, 1); to = endOfDay(current); break;
    case 'year': from = new Date(current.getFullYear(), 0, 1); to = endOfDay(current); break;
  }
  return { from: from.getTime(), to: to.getTime(), label: rangeLabel(from, to) };
}

export function buildCustomRange(fromDate: string, toDate: string): ReportRange {
  if (!fromDate || !toDate) throw new Error('Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.');
  const from = new Date(`${fromDate}T00:00:00`); const to = new Date(`${toDate}T23:59:59.999`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new Error('Khoảng ngày không hợp lệ.');
  if (from.getTime() > to.getTime()) throw new Error('Ngày bắt đầu không được sau ngày kết thúc.');
  return { from: from.getTime(), to: to.getTime(), label: rangeLabel(from, to) };
}

function finite(value: unknown, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function money(value: unknown) { return Math.round(finite(value)); }
function inRange(value: unknown, range: ReportRange) { const timestamp = Number(value); return Number.isFinite(timestamp) && timestamp >= range.from && timestamp <= range.to; }
function asArray<T>(value: unknown): T[] { if (Array.isArray(value)) return value as T[]; if (value && typeof value === 'object') return Object.values(value as Record<string, T>); return []; }
async function readRecord<T>(path: string): Promise<Record<string, T>> {
  const snapshot = await get(ref(requireDatabase(), path)); if (!snapshot.exists()) return {};
  const value = snapshot.val() as unknown; return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {};
}

export function getSaleSnapshotCost(sale: Sale, warnings: string[] = []) {
  const costTotal = Number(sale.costTotal);
  if (Number.isFinite(costTotal) && costTotal >= 0) return Math.round(costTotal);
  const items = asArray<SaleItem>(sale.items);
  if (items.length && items.every((item) => Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.costPrice)))) {
    warnings.push(`Đơn ${sale.code || sale.id} thiếu costTotal; dùng SaleItem.costPrice snapshot.`);
    return Math.round(items.reduce((sum, item) => sum + finite(item.quantity) * finite(item.costPrice), 0));
  }
  warnings.push(`Đơn ${sale.code || sale.id} thiếu snapshot giá vốn; tính 0 thay vì lấy Product.costPrice hiện tại.`);
  return 0;
}

function inventoryRows(products: Record<string, Product>): InventoryReportRow[] {
  return Object.entries(products).map(([id, product]) => {
    const stockQuantity = finite(product.stockQuantity); const minStock = Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : undefined;
    const currentUnitCost = Math.max(0, money(product.costPrice));
    const status: InventoryReportRow['status'] = stockQuantity <= 0 ? 'out' : typeof minStock === 'number' && stockQuantity <= minStock ? 'low' : 'ok';
    return { productId: product.id || id, sku: product.sku || id, name: product.name || product.sku || id,
      ...(product.unit ? { unit: product.unit } : {}), stockQuantity, ...(typeof minStock === 'number' ? { minStock } : {}), status,
      currentUnitCost, currentInventoryValue: Math.round(stockQuantity * currentUnitCost), active: product.active !== false };
  }).sort((a, b) => ({ out: 0, low: 1, ok: 2 }[a.status] - { out: 0, low: 1, ok: 2 }[b.status]) || a.name.localeCompare(b.name, 'vi'));
}

function stockOutValue(record: StockOut) { return Math.round(asArray<StockOut['items'][number]>(record.items).reduce((sum, item) => sum + finite(item.quantity) * finite(item.costPrice), 0)); }
function customerRows(sales: Sale[], directory: Record<string, Customer>): CustomerReportRow[] {
  const map = new Map<string, CustomerReportRow>();
  for (const sale of sales) {
    const id = sale.customerId || '__walk_in__'; const current = map.get(id) ?? { customerId: id, customerName: sale.customerName || directory[id]?.name || (id === '__walk_in__' ? 'Khách lẻ' : id), orderCount: 0, revenue: 0, costOfGoods: 0, grossProfit: 0 };
    current.orderCount += 1; current.revenue += money(sale.total); current.costOfGoods += getSaleSnapshotCost(sale); current.grossProfit = current.revenue - current.costOfGoods; map.set(id, current);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue || a.customerName.localeCompare(b.customerName, 'vi'));
}
function supplierRows(purchases: Purchase[], directory: Record<string, Supplier>): SupplierReportRow[] {
  const map = new Map<string, SupplierReportRow>();
  for (const purchase of purchases) {
    const id = purchase.supplierId || '__none__'; const current = map.get(id) ?? { supplierId: id, supplierName: purchase.supplierName || directory[id]?.name || (id === '__none__' ? 'Không gắn nhà cung cấp' : id), purchaseCount: 0, purchaseTotal: 0 };
    current.purchaseCount += 1; current.purchaseTotal += money(purchase.total); map.set(id, current);
  }
  return [...map.values()].sort((a, b) => b.purchaseTotal - a.purchaseTotal || a.supplierName.localeCompare(b.supplierName, 'vi'));
}

export async function loadReport(range: ReportRange): Promise<ReportBundle> {
  const [salesRaw, expensesRaw, purchasesRaw, stockOutsRaw, movementsRaw, products, customers, suppliers] = await Promise.all([
    readRecord<Sale>('sales'), readRecord<Expense>('expenses'), readRecord<Purchase>('purchases'), readRecord<StockOut>('stockOuts'), readRecord<StockMovement>('stockMovements'), readRecord<Product>('products'), readRecord<Customer>('customers'), readRecord<Supplier>('suppliers'),
  ]);
  const warnings: string[] = [];
  const sales = Object.entries(salesRaw).map(([id, sale]) => ({ ...sale, id: sale.id || id, items: asArray<SaleItem>(sale.items) })).filter((sale) => sale.status === 'completed' && inRange(sale.createdAt, range)).sort((a, b) => b.createdAt - a.createdAt);
  const expenses = Object.entries(expensesRaw).map(([id, item]) => ({ ...item, id: item.id || id })).filter((item) => item.status === 'completed' && inRange(item.expenseDate, range)).sort((a, b) => b.expenseDate - a.expenseDate);
  const purchases = Object.entries(purchasesRaw).map(([id, item]) => ({ ...item, id: item.id || id, items: asArray<Purchase['items'][number]>(item.items) })).filter((item) => item.status === 'completed' && inRange(item.createdAt, range)).sort((a, b) => b.createdAt - a.createdAt);
  const stockOuts = Object.entries(stockOutsRaw).map(([id, item]) => ({ ...item, id: item.id || id, items: asArray<StockOut['items'][number]>(item.items) })).filter((item) => item.status === 'completed' && inRange(item.createdAt, range)).sort((a, b) => b.createdAt - a.createdAt);
  const movements = Object.entries(movementsRaw).map(([id, item]) => ({ ...item, id: item.id || id })).filter((item) => inRange(item.createdAt, range)).sort((a, b) => b.createdAt - a.createdAt);
  const costOfGoods = sales.reduce((sum, sale) => sum + getSaleSnapshotCost(sale, warnings), 0); const revenue = sales.reduce((sum, sale) => sum + money(sale.total), 0); const expenseTotal = expenses.reduce((sum, item) => sum + Math.max(0, money(item.amount)), 0);
  const inventory = inventoryRows(products); const activeInventory = inventory.filter((item) => item.active);
  return { range, summary: { revenue, costOfGoods, grossProfit: revenue - costOfGoods, expenseTotal, netProfit: revenue - costOfGoods - expenseTotal, completedSales: sales.length,
      purchaseTotal: purchases.reduce((sum, item) => sum + money(item.total), 0), stockOutValue: stockOuts.reduce((sum, item) => sum + stockOutValue(item), 0), inventoryQuantity: activeInventory.reduce((sum, item) => sum + item.stockQuantity, 0), inventoryValue: activeInventory.reduce((sum, item) => sum + item.currentInventoryValue, 0), lowStockCount: activeInventory.filter((item) => item.status === 'low').length, outOfStockCount: activeInventory.filter((item) => item.status === 'out').length },
    sales, expenses, purchases, stockOuts, movements, inventory, customers: customerRows(sales, customers), suppliers: supplierRows(purchases, suppliers), warnings: [...new Set(warnings)] };
}
