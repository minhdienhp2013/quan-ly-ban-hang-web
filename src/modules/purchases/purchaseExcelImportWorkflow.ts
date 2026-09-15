import type { Product } from '../../types/models';
import { normalizeSearchCode } from '../../shared/search/searchNormalization';
import { createProduct } from '../products/productService';
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
