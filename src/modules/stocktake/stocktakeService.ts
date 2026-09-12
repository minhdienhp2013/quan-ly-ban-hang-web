import { get, onValue, push, ref, update, type Unsubscribe } from 'firebase/database';
import { db } from '../../firebase/client';
import type { AuditLog, Product, Stocktake, StocktakeItem } from '../../types/models';
import { commitStockOperation } from '../inventory/inventoryService';

export interface StocktakeCountInput { productId: string; actualQuantity: number; }

function requireDatabase() {
  if (!db) throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  return db;
}

function makeCode(key: string) {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `KK-${y}${m}${d}-${key.slice(-6).toUpperCase()}`;
}

function validateCounts(counts: StocktakeCountInput[]) {
  if (counts.length === 0) throw new Error('Hãy nhập số lượng thực tế cho ít nhất một sản phẩm.');
  const seen = new Set<string>();
  for (const count of counts) {
    if (!count.productId) throw new Error('Dòng kiểm kê thiếu sản phẩm.');
    if (seen.has(count.productId)) throw new Error('Sản phẩm bị lặp trong phiếu kiểm kê.');
    seen.add(count.productId);
    if (!Number.isFinite(count.actualQuantity) || count.actualQuantity < 0) throw new Error('Số lượng thực tế không hợp lệ.');
  }
}

export async function createStocktakeDraft(
  counts: StocktakeCountInput[],
  actorUid: string,
  note?: string,
): Promise<Stocktake> {
  validateCounts(counts);
  const database = requireDatabase();
  const productsSnapshot = await get(ref(database, 'products'));
  const products = (productsSnapshot.val() ?? {}) as Record<string, Product>;
  const id = push(ref(database, 'stocktakes')).key;
  const auditId = push(ref(database, 'auditLogs')).key;
  if (!id || !auditId) throw new Error('Không thể tạo mã phiếu kiểm kê.');
  const now = Date.now();
  const items: StocktakeItem[] = counts.map((count) => {
    const product = products[count.productId];
    if (!product) throw new Error(`Không tìm thấy sản phẩm ${count.productId}.`);
    const systemQuantity = Number(product.stockQuantity) || 0;
    return {
      productId: count.productId,
      systemQuantity,
      actualQuantity: count.actualQuantity,
      difference: Math.round((count.actualQuantity - systemQuantity) * 1000) / 1000,
    };
  });
  const stocktake: Stocktake = {
    id,
    code: makeCode(id),
    status: 'draft',
    items,
    createdBy: actorUid,
    createdAt: now,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
  const audit: AuditLog = {
    id: auditId,
    actorUid,
    action: 'STOCKTAKE_DRAFT_CREATED',
    entityType: 'stocktake',
    entityId: id,
    summary: `Tạo phiếu kiểm kê nháp ${stocktake.code} với ${items.length} sản phẩm`,
    createdAt: now,
  };
  await update(ref(database), { [`stocktakes/${id}`]: stocktake, [`auditLogs/${auditId}`]: audit });
  return stocktake;
}

export async function updateStocktakeDraft(
  draft: Stocktake,
  counts: StocktakeCountInput[],
  actorUid: string,
  note?: string,
): Promise<void> {
  if (draft.status !== 'draft') throw new Error('Chỉ phiếu nháp mới được sửa.');
  validateCounts(counts);
  const byProduct = new Map(draft.items.map((item) => [item.productId, item]));
  const items: StocktakeItem[] = counts.map((count) => {
    const existing = byProduct.get(count.productId);
    if (!existing) throw new Error('Không thể thêm sản phẩm mới vào phiếu nháp đã chụp tồn. Hãy tạo phiếu mới.');
    return {
      productId: count.productId,
      systemQuantity: existing.systemQuantity,
      actualQuantity: count.actualQuantity,
      difference: Math.round((count.actualQuantity - existing.systemQuantity) * 1000) / 1000,
    };
  });
  const database = requireDatabase();
  const auditId = push(ref(database, 'auditLogs')).key;
  if (!auditId) throw new Error('Không thể tạo nhật ký kiểm kê.');
  const now = Date.now();
  const updated: Stocktake = { ...draft, items };
  if (note?.trim()) updated.note = note.trim();
  else delete updated.note;
  const audit: AuditLog = {
    id: auditId, actorUid, action: 'STOCKTAKE_DRAFT_UPDATED', entityType: 'stocktake', entityId: draft.id,
    summary: `Cập nhật phiếu kiểm kê nháp ${draft.code}`, createdAt: now,
  };
  await update(ref(database), { [`stocktakes/${draft.id}`]: updated, [`auditLogs/${auditId}`]: audit });
}

export async function completeStocktake(stocktakeId: string, actorUid: string): Promise<void> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, `stocktakes/${stocktakeId}`));
  if (!snapshot.exists()) throw new Error('Không tìm thấy phiếu kiểm kê.');
  const stocktake = snapshot.val() as Stocktake;
  if (stocktake.status === 'completed') return;
  if (stocktake.status !== 'draft') throw new Error('Phiếu kiểm kê không còn ở trạng thái nháp.');
  const now = Date.now();
  const changedItems = stocktake.items.filter((item) => item.difference !== 0);

  if (changedItems.length === 0) {
    const auditId = push(ref(database, 'auditLogs')).key;
    if (!auditId) throw new Error('Không thể tạo nhật ký kiểm kê.');
    const audit: AuditLog = {
      id: auditId, actorUid, action: 'STOCKTAKE_COMPLETED_NO_ADJUSTMENT', entityType: 'stocktake', entityId: stocktakeId,
      summary: `Chốt ${stocktake.code} không có chênh lệch`, createdAt: now,
    };
    await update(ref(database), {
      [`stocktakes/${stocktakeId}/status`]: 'completed',
      [`stocktakes/${stocktakeId}/completedAt`]: now,
      [`auditLogs/${auditId}`]: audit,
    });
    return;
  }

  await commitStockOperation({
    type: 'STOCKTAKE_ADJUSTMENT',
    referenceType: 'stocktake',
    referenceId: stocktakeId,
    actorUid,
    changes: changedItems.map((item) => ({
      productId: item.productId,
      quantityDelta: item.difference,
      expectedQuantityBefore: item.systemQuantity,
      note: `Chốt kiểm kê ${stocktake.code}`,
    })),
    extraUpdates: {
      [`stocktakes/${stocktakeId}/status`]: 'completed',
      [`stocktakes/${stocktakeId}/completedAt`]: now,
    },
    audit: {
      action: 'STOCKTAKE_COMPLETED', entityType: 'stocktake', entityId: stocktakeId,
      summary: `Chốt ${stocktake.code}, điều chỉnh ${changedItems.length} sản phẩm`,
    },
  });
}

export async function cancelStocktakeDraft(stocktakeId: string, actorUid: string): Promise<void> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, `stocktakes/${stocktakeId}`));
  if (!snapshot.exists()) throw new Error('Không tìm thấy phiếu kiểm kê.');
  const stocktake = snapshot.val() as Stocktake;
  if (stocktake.status === 'cancelled') return;
  if (stocktake.status !== 'draft') throw new Error('Chỉ phiếu nháp mới có thể hủy.');
  const auditId = push(ref(database, 'auditLogs')).key;
  if (!auditId) throw new Error('Không thể tạo nhật ký kiểm kê.');
  const now = Date.now();
  const audit: AuditLog = {
    id: auditId, actorUid, action: 'STOCKTAKE_CANCELLED', entityType: 'stocktake', entityId: stocktakeId,
    summary: `Hủy phiếu kiểm kê nháp ${stocktake.code}`, createdAt: now,
  };
  await update(ref(database), {
    [`stocktakes/${stocktakeId}/status`]: 'cancelled',
    [`auditLogs/${auditId}`]: audit,
  });
}

export function subscribeStocktakes(
  onData: (stocktakes: Stocktake[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const database = requireDatabase();
  return onValue(ref(database, 'stocktakes'), (snapshot) => {
    const raw = snapshot.val() as Record<string, Stocktake> | null;
    onData(raw ? Object.entries(raw).map(([id, item]) => ({ ...item, id: item.id || id })).sort((a, b) => b.createdAt - a.createdAt) : []);
  }, (error) => onError(error instanceof Error ? error : new Error('Không thể tải phiếu kiểm kê.')));
}
