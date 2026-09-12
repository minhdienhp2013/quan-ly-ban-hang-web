import {
  endAt,
  get,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  startAt,
  type Unsubscribe,
} from 'firebase/database';
import { db } from '../../firebase/client';
import type { Customer, PaymentMethod, Product, Sale, SaleItem } from '../../types/models';
import { commitStockOperation } from '../inventory/inventoryService';
import { roundStockQuantity } from '../inventory/stockOperationCas';

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

export interface SaleLineInput {
  productId: string;
  quantity: number;
}

export interface CreateSaleInput {
  saleId: string;
  customerId?: string;
  items: SaleLineInput[];
  discount: number;
  paymentMethod: PaymentMethod;
  note?: string;
}

export interface SaleHistoryQuery {
  from?: number;
  to?: number;
  limit?: number;
}

function requireDatabase() {
  if (!db) throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  return db;
}

function makeSaleCode(key: string, createdAt: number) {
  const date = new Date(createdAt);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `BH-${y}${m}${d}-${key.slice(-6).toUpperCase()}`;
}

function normalizeMoney(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không hợp lệ.`);
  return Math.round(number);
}

function normalizeQuantity(value: unknown) {
  const quantity = roundStockQuantity(Number(value));
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Số lượng bán phải lớn hơn 0.');
  }
  return quantity;
}

function normalizeSaleItems(value: unknown): SaleItem[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];

  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as Partial<SaleItem>;
    if (!candidate.productId || !candidate.sku || !candidate.name) return [];
    const quantity = Number(candidate.quantity);
    const unitPrice = Number(candidate.unitPrice);
    const costPrice = Number(candidate.costPrice);
    const lineTotal = Number(candidate.lineTotal);
    if (![quantity, unitPrice, costPrice, lineTotal].every(Number.isFinite)) return [];
    return [{
      productId: candidate.productId,
      sku: candidate.sku,
      name: candidate.name,
      quantity,
      unitPrice,
      costPrice,
      lineTotal,
    }];
  });
}

function normalizeSale(id: string, value: unknown): Sale | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Sale>;
  if (!candidate.code || !candidate.createdBy) return null;
  const createdAt = Number(candidate.createdAt);
  const updatedAt = Number(candidate.updatedAt);
  const subtotal = Number(candidate.subtotal);
  const discount = Number(candidate.discount);
  const total = Number(candidate.total);
  const costTotal = Number(candidate.costTotal);
  const profit = Number(candidate.profit);
  if (![createdAt, updatedAt, subtotal, discount, total, costTotal, profit].every(Number.isFinite)) return null;
  const status = candidate.status === 'cancelled' || candidate.status === 'refunded' ? candidate.status : 'completed';
  const paymentMethod: PaymentMethod | undefined =
    candidate.paymentMethod === 'bank_transfer' || candidate.paymentMethod === 'other' || candidate.paymentMethod === 'cash'
      ? candidate.paymentMethod
      : undefined;

  return {
    id: candidate.id || id,
    code: candidate.code,
    items: normalizeSaleItems(candidate.items),
    subtotal,
    discount,
    total,
    costTotal,
    profit,
    status,
    createdBy: candidate.createdBy,
    createdAt,
    updatedAt,
    ...(candidate.customerId ? { customerId: candidate.customerId } : {}),
    ...(candidate.customerName ? { customerName: candidate.customerName } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(candidate.note ? { note: candidate.note } : {}),
  };
}

async function readProduct(productId: string): Promise<Product> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, `products/${productId}`));
  if (!snapshot.exists()) throw new Error(`Không tìm thấy sản phẩm ${productId}.`);
  const product = snapshot.val() as Product;
  const normalized: Product = {
    ...product,
    id: product.id || productId,
    stockQuantity: Number(product.stockQuantity) || 0,
    stockVersion: Number(product.stockVersion) || 0,
    costPrice: normalizeMoney(product.costPrice, `Giá vốn của ${product.sku || productId}`),
    salePrice: normalizeMoney(product.salePrice, `Giá bán của ${product.sku || productId}`),
  };
  if (!normalized.sku || !normalized.name) throw new Error(`Sản phẩm ${productId} thiếu SKU hoặc tên.`);
  if (normalized.active !== true) throw new Error(`${normalized.sku} - ${normalized.name} đã ngừng hoạt động.`);
  return normalized;
}

async function readCustomer(customerId?: string): Promise<Customer | null> {
  const id = customerId?.trim();
  if (!id) return null;
  const database = requireDatabase();
  const snapshot = await get(ref(database, `customers/${id}`));
  if (!snapshot.exists()) throw new Error('Khách hàng đã chọn không còn tồn tại.');
  const customer = snapshot.val() as Customer;
  if (!customer.name || customer.active !== true) throw new Error('Khách hàng đã chọn hiện không hoạt động.');
  return { ...customer, id: customer.id || id };
}

async function getPersistedSale(saleId: string): Promise<Sale> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, `sales/${saleId}`));
  const sale = normalizeSale(saleId, snapshot.val());
  if (!sale) throw new Error('Nghiệp vụ kho đã hoàn tất nhưng không đọc được đơn bán đã lưu.');
  return sale;
}

export function createSaleId() {
  const database = requireDatabase();
  const saleId = push(ref(database, 'sales')).key;
  if (!saleId) throw new Error('Không thể tạo mã đơn bán.');
  return saleId;
}

export async function createSale(input: CreateSaleInput, actorUid: string): Promise<Sale> {
  if (!actorUid) throw new Error('Phiên đăng nhập không hợp lệ.');
  if (!input.saleId) throw new Error('Thiếu mã đơn bán.');
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error('Giỏ hàng phải có ít nhất một sản phẩm.');
  }
  if (!input.paymentMethod) throw new Error('Vui lòng chọn phương thức thanh toán.');

  const seen = new Set<string>();
  const normalizedLines = input.items.map((line) => {
    if (!line.productId) throw new Error('Dòng bán hàng thiếu sản phẩm.');
    if (seen.has(line.productId)) throw new Error('Một sản phẩm chỉ được xuất hiện một lần trong giỏ hàng.');
    seen.add(line.productId);
    return { productId: line.productId, quantity: normalizeQuantity(line.quantity) };
  });

  // Đọc metadata/giá mới nhất để chụp snapshot đơn. Việc kiểm tra và trừ tồn
  // tuyệt đối không dựa vào snapshot này; commitStockOperation tự đọc tồn,
  // thực hiện CAS stockVersion và retry nếu có cạnh tranh.
  const [products, customer] = await Promise.all([
    Promise.all(normalizedLines.map((line) => readProduct(line.productId))),
    readCustomer(input.customerId),
  ]);

  const createdAt = Date.now();
  const items: SaleItem[] = normalizedLines.map((line, index) => {
    const product = products[index];
    const unitPrice = Math.round(product.salePrice);
    const costPrice = Math.round(product.costPrice);
    return {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      quantity: line.quantity,
      unitPrice,
      costPrice,
      lineTotal: Math.round(line.quantity * unitPrice),
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const discount = normalizeMoney(input.discount, 'Giảm giá');
  if (discount > subtotal) throw new Error('Giảm giá không được lớn hơn tổng tiền hàng.');
  const total = subtotal - discount;
  const costTotal = items.reduce((sum, item) => sum + Math.round(item.quantity * item.costPrice), 0);

  const sale: Sale = {
    id: input.saleId,
    code: makeSaleCode(input.saleId, createdAt),
    items,
    subtotal,
    discount,
    total,
    costTotal,
    profit: total - costTotal,
    paymentMethod: input.paymentMethod,
    status: 'completed',
    createdBy: actorUid,
    createdAt,
    updatedAt: createdAt,
    ...(customer ? { customerId: customer.id, customerName: customer.name } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  };

  await commitStockOperation({
    type: 'SALE',
    referenceType: 'sale',
    referenceId: input.saleId,
    actorUid,
    changes: items.map((item) => ({
      productId: item.productId,
      quantityDelta: -Math.abs(item.quantity),
      unitCost: item.costPrice,
      note: `Bán hàng ${sale.code}`,
    })),
    extraUpdates: { [`sales/${input.saleId}`]: sale },
    audit: {
      action: 'SALE_COMPLETED',
      entityType: 'sale',
      entityId: input.saleId,
      summary: `Hoàn tất đơn ${sale.code}, ${items.length} mặt hàng`,
    },
  });

  // Nếu lần gọi trước đã commit nhưng client mất phản hồi, stockOperations receipt
  // khiến commitStockOperation trả idempotent. Luôn đọc lại bản ghi thật để không
  // trả về payload retry khác với đơn đã commit.
  return getPersistedSale(input.saleId);
}

export async function reverseSale(
  saleId: string,
  actorUid: string,
  nextStatus: 'cancelled' | 'refunded',
): Promise<Sale> {
  if (!actorUid) throw new Error('Phiên đăng nhập không hợp lệ.');
  const sale = await getPersistedSale(saleId);
  if (sale.status !== 'completed') return sale;
  if (sale.items.length === 0) throw new Error('Đơn bán không có dữ liệu mặt hàng để hoàn kho.');

  const updatedAt = Date.now();
  await commitStockOperation({
    type: 'SALE_RETURN',
    referenceType: 'sale',
    referenceId: saleId,
    actorUid,
    changes: sale.items.map((item) => ({
      productId: item.productId,
      quantityDelta: Math.abs(normalizeQuantity(item.quantity)),
      unitCost: normalizeMoney(item.costPrice, 'Giá vốn snapshot'),
      note: `${nextStatus === 'cancelled' ? 'Hủy' : 'Hoàn'} đơn ${sale.code}`,
    })),
    extraUpdates: {
      [`sales/${saleId}/status`]: nextStatus,
      [`sales/${saleId}/updatedAt`]: updatedAt,
    },
    audit: {
      action: nextStatus === 'cancelled' ? 'SALE_CANCELLED' : 'SALE_REFUNDED',
      entityType: 'sale',
      entityId: saleId,
      summary: `${nextStatus === 'cancelled' ? 'Hủy' : 'Hoàn'} đơn ${sale.code} và hoàn tồn kho`,
    },
  });

  return getPersistedSale(saleId);
}

export function subscribeSales(
  options: SaleHistoryQuery,
  onData: (sales: Sale[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  const limit = Math.min(MAX_HISTORY_LIMIT, Math.max(20, Math.round(options.limit ?? DEFAULT_HISTORY_LIMIT)));
  const salesRef = ref(database, 'sales');
  const ordered = orderByChild('createdAt');
  const salesQuery = typeof options.from === 'number' && typeof options.to === 'number'
    ? query(salesRef, ordered, startAt(options.from), endAt(options.to), limitToLast(limit))
    : typeof options.from === 'number'
      ? query(salesRef, ordered, startAt(options.from), limitToLast(limit))
      : typeof options.to === 'number'
        ? query(salesRef, ordered, endAt(options.to), limitToLast(limit))
        : query(salesRef, ordered, limitToLast(limit));

  return onValue(
    salesQuery,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, unknown> | null;
      const sales = raw
        ? Object.entries(raw)
            .flatMap(([id, value]) => {
              const sale = normalizeSale(id, value);
              return sale ? [sale] : [];
            })
            .sort((a, b) => b.createdAt - a.createdAt)
        : [];
      onData(sales);
    },
    (error) => onError(error instanceof Error ? error : new Error('Không thể tải lịch sử đơn bán.')),
  );
}

export function subscribeCustomers(
  onData: (customers: Customer[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onValue(
    ref(database, 'customers'),
    (snapshot) => {
      const raw = snapshot.val() as Record<string, Customer> | null;
      const customers = raw
        ? Object.entries(raw)
            .map(([id, customer]) => ({ ...customer, id: customer.id || id }))
            .filter((customer) => customer.active === true && Boolean(customer.name))
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        : [];
      onData(customers);
    },
    (error) => onError(error instanceof Error ? error : new Error('Không thể tải danh sách khách hàng.')),
  );
}
