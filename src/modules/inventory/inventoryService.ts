import {
  equalTo,
  get,
  increment,
  limitToLast,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  update,
  type Unsubscribe,
} from 'firebase/database';
import { db } from '../../firebase/client';
import type {
  AuditLog,
  Product,
  StockMovement,
  StockMovementType,
  StockReferenceType,
} from '../../types/models';

export interface StockChangeInput {
  productId: string;
  quantityDelta: number;
  unitCost?: number;
  note?: string;
  expectedQuantityBefore?: number;
}

export interface StockOperationInput {
  type: StockMovementType;
  referenceType: StockReferenceType;
  referenceId: string;
  actorUid: string;
  changes: StockChangeInput[];
  extraUpdates?: Record<string, unknown>;
  productFieldUpdates?: Record<string, Record<string, unknown>>;
  audit?: {
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
  };
}

function requireDatabase() {
  if (!db) {
    throw new Error('Realtime Database chưa được cấu hình cho ứng dụng.');
  }
  return db;
}

function asProducts(value: unknown): Record<string, Product> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, Product>;
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function assertValidDelta(delta: number) {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Số lượng thay đổi tồn kho phải là số khác 0.');
  }
}

function aggregateChanges(changes: StockChangeInput[]) {
  const aggregated = new Map<string, StockChangeInput>();

  for (const change of changes) {
    assertValidDelta(change.quantityDelta);
    const current = aggregated.get(change.productId);
    if (!current) {
      aggregated.set(change.productId, { ...change });
      continue;
    }

    const quantityDelta = roundQuantity(current.quantityDelta + change.quantityDelta);
    aggregated.set(change.productId, {
      productId: change.productId,
      quantityDelta,
      ...(typeof change.unitCost === 'number' ? { unitCost: change.unitCost } : {}),
      ...(change.note ? { note: change.note } : current.note ? { note: current.note } : {}),
      ...(typeof current.expectedQuantityBefore === 'number' ? { expectedQuantityBefore: current.expectedQuantityBefore } : typeof change.expectedQuantityBefore === 'number' ? { expectedQuantityBefore: change.expectedQuantityBefore } : {}),
    });
  }

  return [...aggregated.values()].filter((change) => change.quantityDelta !== 0);
}

export async function getProductsOnce(): Promise<Product[]> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, 'products'));
  const products = asProducts(snapshot.val());

  return Object.entries(products).map(([id, product]) => ({
    ...product,
    id: product.id || id,
    stockQuantity: Number(product.stockQuantity) || 0,
  }));
}

export async function commitStockOperation(input: StockOperationInput): Promise<StockMovement[]> {
  const database = requireDatabase();
  const changes = aggregateChanges(input.changes);
  if (changes.length === 0) {
    throw new Error('Nghiệp vụ không có thay đổi tồn kho để ghi nhận.');
  }

  const productSnapshot = await get(ref(database, 'products'));
  const products = asProducts(productSnapshot.val());
  const now = Date.now();
  const updates: Record<string, unknown> = { ...(input.extraUpdates ?? {}) };
  const movements: StockMovement[] = [];

  for (const change of changes) {
    const product = products[change.productId];
    if (!product) {
      throw new Error(`Không tìm thấy sản phẩm ${change.productId}.`);
    }

    const quantityBefore = Number(product.stockQuantity) || 0;
    if (typeof change.expectedQuantityBefore === 'number' && roundQuantity(quantityBefore) !== roundQuantity(change.expectedQuantityBefore)) {
      throw new Error(`Tồn của ${product.sku} - ${product.name} đã thay đổi từ ${change.expectedQuantityBefore} thành ${quantityBefore}. Vui lòng tải lại dữ liệu trước khi tiếp tục.`);
    }
    const quantityAfter = roundQuantity(quantityBefore + change.quantityDelta);
    if (quantityAfter < 0) {
      throw new Error(
        `Không đủ tồn cho ${product.sku} - ${product.name}. Tồn hiện tại ${quantityBefore}, yêu cầu thay đổi ${change.quantityDelta}.`,
      );
    }

    const movementId = push(ref(database, 'stockMovements')).key;
    if (!movementId) {
      throw new Error('Không thể tạo mã nhật ký kho.');
    }

    const movement: StockMovement = {
      id: movementId,
      productId: product.id || change.productId,
      type: input.type,
      quantityDelta: roundQuantity(change.quantityDelta),
      quantityBefore,
      quantityAfter,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      createdBy: input.actorUid,
      createdAt: now,
      ...(typeof change.unitCost === 'number' ? { unitCost: Math.round(change.unitCost) } : {}),
      ...(change.note?.trim() ? { note: change.note.trim() } : {}),
    };

    movements.push(movement);
    updates[`products/${change.productId}/stockQuantity`] = increment(change.quantityDelta);
    updates[`products/${change.productId}/updatedAt`] = now;
    updates[`stockMovements/${movementId}`] = movement;

    const fieldUpdates = input.productFieldUpdates?.[change.productId];
    if (fieldUpdates) {
      for (const [field, value] of Object.entries(fieldUpdates)) {
        if (field === 'stockQuantity' || field === 'id') continue;
        updates[`products/${change.productId}/${field}`] = value;
      }
    }
  }

  if (input.audit) {
    const auditId = push(ref(database, 'auditLogs')).key;
    if (!auditId) {
      throw new Error('Không thể tạo nhật ký kiểm toán.');
    }

    const auditLog: AuditLog = {
      id: auditId,
      actorUid: input.actorUid,
      action: input.audit.action,
      entityType: input.audit.entityType,
      createdAt: now,
      ...(input.audit.entityId ? { entityId: input.audit.entityId } : {}),
      ...(input.audit.summary ? { summary: input.audit.summary } : {}),
    };
    updates[`auditLogs/${auditId}`] = auditLog;
  }

  // RTDB multi-location update is atomic: business record, aggregate stock,
  // stock movements and audit log either commit together or all fail.
  await update(ref(database), updates);
  return movements;
}

export function subscribeStockMovements(
  onMovements: (movements: StockMovement[]) => void,
  onError: (error: Error) => void,
  limit = 100,
): Unsubscribe {
  const database = requireDatabase();
  const movementsQuery = query(
    ref(database, 'stockMovements'),
    orderByChild('createdAt'),
    limitToLast(limit),
  );

  return onValue(
    movementsQuery,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, StockMovement> | null;
      const movements = raw
        ? Object.entries(raw)
            .map(([id, movement]) => ({ ...movement, id: movement.id || id }))
            .sort((a, b) => b.createdAt - a.createdAt)
        : [];
      onMovements(movements);
    },
    (error) => onError(error instanceof Error ? error : new Error('Không thể tải lịch sử kho.')),
  );
}

export async function hasReferenceMovement(
  referenceId: string,
  type?: StockMovementType,
): Promise<boolean> {
  const database = requireDatabase();
  const snapshot = await get(
    query(ref(database, 'stockMovements'), orderByChild('referenceId'), equalTo(referenceId)),
  );
  if (!snapshot.exists()) return false;

  const raw = snapshot.val() as Record<string, StockMovement>;
  return Object.values(raw).some((movement) => !type || movement.type === type);
}

export interface OpeningBalanceInput {
  productId: string;
  quantity: number;
  unitCost?: number;
}

export async function applyOpeningBalances(
  rows: OpeningBalanceInput[],
  actorUid: string,
): Promise<number> {
  const database = requireDatabase();
  const snapshot = await get(ref(database, 'products'));
  const products = asProducts(snapshot.val());
  const changes: StockChangeInput[] = [];

  for (const row of rows) {
    const product = products[row.productId];
    if (!product) throw new Error(`Không tìm thấy sản phẩm ${row.productId}.`);
    const currentStock = Number(product.stockQuantity) || 0;
    if (currentStock !== 0) {
      throw new Error(
        `${product.sku} - ${product.name} đã có tồn ${currentStock}. Tồn đầu kỳ chỉ áp dụng khi tồn hiện tại bằng 0.`,
      );
    }
    if (!Number.isFinite(row.quantity) || row.quantity < 0) {
      throw new Error(`Tồn đầu kỳ của ${product.sku} không hợp lệ.`);
    }
    if (row.quantity === 0) continue;
    changes.push({
      productId: row.productId,
      quantityDelta: row.quantity,
      unitCost: typeof row.unitCost === 'number' ? row.unitCost : product.costPrice,
      note: 'Tồn đầu kỳ từ Excel',
      expectedQuantityBefore: 0,
    });
  }

  if (changes.length === 0) return 0;
  const referenceId = `opening-${Date.now()}`;
  await commitStockOperation({
    type: 'OPENING_BALANCE',
    referenceType: 'opening',
    referenceId,
    actorUid,
    changes,
    audit: {
      action: 'OPENING_BALANCE_EXCEL_IMPORTED',
      entityType: 'inventory',
      entityId: referenceId,
      summary: `Ghi tồn đầu kỳ cho ${changes.length} sản phẩm từ Excel`,
    },
  });

  return changes.length;
}
