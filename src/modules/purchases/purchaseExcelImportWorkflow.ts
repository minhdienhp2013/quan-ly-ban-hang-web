import type { Product } from '../../types/models';
import { normalizeSearchCode } from '../../shared/search/searchNormalization';
import { createProduct } from '../products/productService';
import {
  PURCHASE_DRAFT_VERSION,
  type PurchaseDraft,
  type PurchaseDraftLine,
} from './purchaseDraft';
import type { PurchaseExcelImportRow } from './purchaseExcelImport';

export interface PurchaseExcelCreateProgress {
  createdProductsBySku: Record<string, Product>;
}

export interface PurchaseExcelCreateFailure {
  sku: string;
  rowNumbers: number[];
  message: string;
}

export interface PurchaseExcelCreateResult {
  progress: PurchaseExcelCreateProgress;
  failures: PurchaseExcelCreateFailure[];
  createdProducts: Product[];
}

export function createEmptyPurchaseExcelProgress(): PurchaseExcelCreateProgress {
  return { createdProductsBySku: {} };
}

function cloneProgress(progress?: PurchaseExcelCreateProgress): PurchaseExcelCreateProgress {
  return { createdProductsBySku: { ...(progress?.createdProductsBySku ?? {}) } };
}

function productKey(row: PurchaseExcelImportRow) {
  return normalizeSearchCode(row.effectiveSku);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Lỗi không xác định.');
}

export async function createConfirmedPurchaseExcelProducts(input: {
  rows: readonly PurchaseExcelImportRow[];
  selectedNewRowNumbers: ReadonlySet<number>;
  actorUid: string;
  progress?: PurchaseExcelCreateProgress;
}): Promise<PurchaseExcelCreateResult> {
  const progress = cloneProgress(input.progress);
  const failures: PurchaseExcelCreateFailure[] = [];
  const groups = new Map<string, PurchaseExcelImportRow[]>();

  for (const row of input.rows) {
    if (row.status !== 'NEW' || !input.selectedNewRowNumbers.has(row.rowNumber)) continue;
    if (!row.newProductInput || !row.effectiveSku) continue;
    const key = productKey(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    if (progress.createdProductsBySku[key]) continue;
    const representative = group[0];
    if (!representative?.newProductInput) continue;

    try {
      const created = await createProduct(representative.newProductInput, input.actorUid);
      progress.createdProductsBySku[key] = created;
    } catch (error) {
      failures.push({
        sku: representative.effectiveSku ?? representative.newProductInput.sku,
        rowNumbers: group.map((row) => row.rowNumber),
        message: messageOf(error),
      });
    }
  }

  return {
    progress,
    failures,
    createdProducts: Object.values(progress.createdProductsBySku),
  };
}

export function buildPurchaseDraftFromExcel(input: {
  rows: readonly PurchaseExcelImportRow[];
  selectedNewRowNumbers: ReadonlySet<number>;
  progress: PurchaseExcelCreateProgress;
}): PurchaseDraft {
  if (input.rows.some((row) => row.status === 'REVIEW' || row.status === 'ERROR')) {
    throw new Error('Còn dòng Cần kiểm tra/Lỗi. Hãy sửa file trước khi đưa vào phiếu nhập.');
  }

  const merged = new Map<string, PurchaseDraftLine>();
  for (const row of input.rows) {
    if (row.status !== 'MATCHED' && row.status !== 'NEW') continue;
    if (row.status === 'NEW' && !input.selectedNewRowNumbers.has(row.rowNumber)) continue;
    if (typeof row.quantity !== 'number' || row.quantity <= 0 || typeof row.unitCost !== 'number' || row.unitCost < 0) {
      throw new Error(`Dòng ${row.rowNumber} không có số lượng/giá nhập hợp lệ.`);
    }

    let productId = row.matchedProductId;
    if (row.status === 'NEW') {
      const key = productKey(row);
      productId = input.progress.createdProductsBySku[key]?.id;
      if (!productId) throw new Error(`Hàng mới dòng ${row.rowNumber} chưa được tạo thành công.`);
    }
    if (!productId) throw new Error(`Không xác định được Product cho dòng ${row.rowNumber}.`);

    const mergeKey = `${productId}\u0000${row.unitCost}`;
    const current = merged.get(mergeKey);
    if (current) {
      current.quantity += row.quantity;
    } else {
      merged.set(mergeKey, {
        productId,
        quantity: row.quantity,
        unitCost: row.unitCost,
      });
    }
  }

  const lines = [...merged.values()];
  if (lines.length === 0) throw new Error('Không có dòng hợp lệ nào được chọn để đưa vào phiếu nhập.');

  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId: '',
    supplierName: '',
    note: '',
    lines,
  };
}
