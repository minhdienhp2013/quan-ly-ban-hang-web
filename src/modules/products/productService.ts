import { get, onValue, push, ref, update, type Unsubscribe } from 'firebase/database';
import { db } from '../../firebase/client';
import type { AuditLog, Product } from '../../types/models';
import {
  buildProductPermanentDeletePreflight,
  type ProductPermanentDeletePreflight,
  type ProductReferenceSnapshots,
} from './productPermanentDelete';

export interface ProductInput {
  sku: string;
  name: string;
  barcode?: string;
  qrCode?: string;
  unit?: string;
  costPrice: number;
  salePrice: number;
  minStock?: number;
  active: boolean;
}

function requireDatabase() {
  if (!db) {
    throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  }
  return db;
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function buildAuditLog(
  id: string,
  actorUid: string,
  action: string,
  productId: string,
  summary: string,
  createdAt: number,
): AuditLog {
  return {
    id,
    actorUid,
    action,
    entityType: 'product',
    entityId: productId,
    summary,
    createdAt,
  };
}

export function subscribeProducts(
  onProducts: (products: Product[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();

  return onValue(
    ref(database, 'products'),
    (snapshot) => {
      if (!snapshot.exists()) {
        onProducts([]);
        return;
      }

      const raw = snapshot.val() as Record<string, Product>;
      const products = Object.entries(raw)
        .map(([key, product]) => ({
          ...product,
          id: product.id || key,
          stockQuantity: Number(product.stockQuantity) || 0,
          stockVersion: Number(product.stockVersion) || 0,
        }))
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? -1 : 1;
          return a.name.localeCompare(b.name, 'vi');
        });

      onProducts(products);
    },
    (error) => onError(error instanceof Error ? error : new Error('Không thể tải sản phẩm.')),
  );
}

export async function createProduct(input: ProductInput, actorUid: string): Promise<Product> {
  const database = requireDatabase();
  const productKey = push(ref(database, 'products')).key;
  const auditKey = push(ref(database, 'auditLogs')).key;

  if (!productKey || !auditKey) {
    throw new Error('Không thể tạo mã nội bộ cho sản phẩm.');
  }

  const now = Date.now();
  const product: Product = {
    id: productKey,
    sku: input.sku.trim(),
    name: input.name.trim(),
    costPrice: Math.round(input.costPrice),
    salePrice: Math.round(input.salePrice),
    stockQuantity: 0,
    stockVersion: 0,
    active: input.active,
    createdAt: now,
    updatedAt: now,
    ...(cleanOptional(input.barcode) ? { barcode: cleanOptional(input.barcode) } : {}),
    ...(cleanOptional(input.qrCode) ? { qrCode: cleanOptional(input.qrCode) } : {}),
    ...(cleanOptional(input.unit) ? { unit: cleanOptional(input.unit) } : {}),
    ...(typeof input.minStock === 'number' ? { minStock: input.minStock } : {}),
  };

  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    'PRODUCT_CREATED',
    productKey,
    `Tạo sản phẩm ${product.sku} - ${product.name}`,
    now,
  );

  await update(ref(database), {
    [`products/${productKey}`]: product,
    [`auditLogs/${auditKey}`]: auditLog,
  });

  return product;
}

export async function updateProduct(
  existing: Product,
  input: ProductInput,
  actorUid: string,
): Promise<Product> {
  const database = requireDatabase();
  const auditKey = push(ref(database, 'auditLogs')).key;

  if (!auditKey) {
    throw new Error('Không thể tạo nhật ký thay đổi sản phẩm.');
  }

  const now = Date.now();
  const barcode = cleanOptional(input.barcode);
  const qrCode = cleanOptional(input.qrCode);
  const unit = cleanOptional(input.unit);
  const product: Product = {
    id: existing.id,
    sku: input.sku.trim(),
    name: input.name.trim(),
    costPrice: Math.round(input.costPrice),
    salePrice: Math.round(input.salePrice),
    stockQuantity: existing.stockQuantity,
    stockVersion: Number(existing.stockVersion) || 0,
    active: input.active,
    createdAt: existing.createdAt,
    updatedAt: now,
    ...(existing.categoryId ? { categoryId: existing.categoryId } : {}),
    ...(barcode ? { barcode } : {}),
    ...(qrCode ? { qrCode } : {}),
    ...(unit ? { unit } : {}),
    ...(typeof input.minStock === 'number' ? { minStock: input.minStock } : {}),
  };

  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    'PRODUCT_UPDATED',
    existing.id,
    `Sửa sản phẩm ${product.sku} - ${product.name}`,
    now,
  );

  // Chỉ cập nhật metadata. Không ghi lại stockQuantity/stockVersion từ state UI cũ,
  // vì tồn kho có thể vừa thay đổi trên một thiết bị khác.
  await update(ref(database), {
    [`products/${existing.id}/sku`]: product.sku,
    [`products/${existing.id}/name`]: product.name,
    [`products/${existing.id}/costPrice`]: product.costPrice,
    [`products/${existing.id}/salePrice`]: product.salePrice,
    [`products/${existing.id}/active`]: product.active,
    [`products/${existing.id}/updatedAt`]: now,
    [`products/${existing.id}/barcode`]: barcode ?? null,
    [`products/${existing.id}/qrCode`]: qrCode ?? null,
    [`products/${existing.id}/unit`]: unit ?? null,
    [`products/${existing.id}/minStock`]: typeof input.minStock === 'number' ? input.minStock : null,
    [`auditLogs/${auditKey}`]: auditLog,
  });

  return product;
}

export async function setProductActive(
  product: Product,
  active: boolean,
  actorUid: string,
): Promise<void> {
  const database = requireDatabase();
  const auditKey = push(ref(database, 'auditLogs')).key;

  if (!auditKey) {
    throw new Error('Không thể tạo nhật ký thay đổi trạng thái sản phẩm.');
  }

  const now = Date.now();
  const auditLog = buildAuditLog(
    auditKey,
    actorUid,
    active ? 'PRODUCT_ACTIVATED' : 'PRODUCT_DEACTIVATED',
    product.id,
    `${active ? 'Kích hoạt' : 'Ngừng sử dụng'} sản phẩm ${product.sku} - ${product.name}`,
    now,
  );

  await update(ref(database), {
    [`products/${product.id}/active`]: active,
    [`products/${product.id}/updatedAt`]: now,
    [`auditLogs/${auditKey}`]: auditLog,
  });
}

async function readPermanentDeletePreflight(
  selectedProducts: readonly Product[],
): Promise<ProductPermanentDeletePreflight> {
  const database = requireDatabase();
  const [productsSnapshot, salesSnapshot, purchasesSnapshot, stockOutsSnapshot, movementsSnapshot, stocktakesSnapshot] = await Promise.all([
    get(ref(database, 'products')),
    get(ref(database, 'sales')),
    get(ref(database, 'purchases')),
    get(ref(database, 'stockOuts')),
    get(ref(database, 'stockMovements')),
    get(ref(database, 'stocktakes')),
  ]);

  const rawProducts = (productsSnapshot.val() ?? {}) as Record<string, Product>;
  const currentProducts = Object.entries(rawProducts).map(([id, product]) => ({ ...product, id: product.id || id }));
  const references: ProductReferenceSnapshots = {
    sales: salesSnapshot.val(),
    purchases: purchasesSnapshot.val(),
    stockOuts: stockOutsSnapshot.val(),
    stockMovements: movementsSnapshot.val(),
    stocktakes: stocktakesSnapshot.val(),
  };

  return buildProductPermanentDeletePreflight(selectedProducts, currentProducts, references);
}

export async function preflightPermanentProductDeletion(
  selectedProducts: readonly Product[],
): Promise<ProductPermanentDeletePreflight> {
  return readPermanentDeletePreflight(selectedProducts);
}

export async function deleteProductsPermanently(
  selectedProducts: readonly Product[],
  actorUid: string,
): Promise<{ deleted: number; preflight: ProductPermanentDeletePreflight }> {
  if (!actorUid) throw new Error('Không thể xác định người dùng xóa sản phẩm.');

  // Revalidate immediately before the destructive write so stale UI/preflight data
  // cannot silently turn into a partial or unsafe delete.
  const preflight = await readPermanentDeletePreflight(selectedProducts);
  if (!preflight.canDeleteAll) return { deleted: 0, preflight };

  const database = requireDatabase();
  const now = Date.now();
  const updates: Record<string, unknown> = {};

  for (const product of preflight.eligibleProducts) {
    const auditKey = push(ref(database, 'auditLogs')).key;
    if (!auditKey) throw new Error('Không thể tạo nhật ký xóa sản phẩm.');
    const audit = buildAuditLog(
      auditKey,
      actorUid,
      'PRODUCT_DELETED',
      product.id,
      `Xóa vĩnh viễn sản phẩm ${product.sku} - ${product.name}`,
      now,
    );
    updates[`products/${product.id}`] = null;
    updates[`auditLogs/${auditKey}`] = audit;
  }

  await update(ref(database), updates);
  return { deleted: preflight.eligibleProducts.length, preflight };
}
