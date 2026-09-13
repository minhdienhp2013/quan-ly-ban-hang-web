import type { Product, UserRole } from '../../types/models';
import { commitStockOperation, getProductsOnce } from '../inventory/inventoryService';
import type { ExcelProductImportRow } from './excelImport';
import type { ProductExcelDuplicateMode } from './productExcelImportPlan';
import { createProduct, updateProduct } from './productService';

const STOCK_NOTE = 'Điều chỉnh tồn từ Product Excel Import';
const MAX_TARGET_RETRIES = 3;

export interface ProductExcelImportProgress {
  createdProductIdsByRow: Record<number, string>;
  metadataUpdatedRows: number[];
  stockCompletedRows: number[];
}

export interface ProductExcelImportFailure {
  rowNumber: number;
  stage: 'create' | 'update' | 'stock';
  message: string;
}

export interface ProductExcelImportRunResult {
  created: number;
  updated: number;
  stockAdjusted: number;
  stockUnchanged: number;
  skippedDuplicates: number;
  failures: ProductExcelImportFailure[];
  progress: ProductExcelImportProgress;
}

export interface RunProductExcelImportInput {
  rows: readonly ExcelProductImportRow[];
  actorUid: string;
  actorRole: UserRole;
  duplicateMode: ProductExcelDuplicateMode;
  updateStock: boolean;
  stockColumnDetected: boolean;
  sessionId: string;
  progress?: ProductExcelImportProgress;
}

export function createEmptyProductExcelImportProgress(): ProductExcelImportProgress {
  return {
    createdProductIdsByRow: {},
    metadataUpdatedRows: [],
    stockCompletedRows: [],
  };
}

function cloneProgress(progress?: ProductExcelImportProgress): ProductExcelImportProgress {
  const source = progress ?? createEmptyProductExcelImportProgress();
  return {
    createdProductIdsByRow: { ...source.createdProductIdsByRow },
    metadataUpdatedRows: [...source.metadataUpdatedRows],
    stockCompletedRows: [...source.stockCompletedRows],
  };
}

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Lỗi không xác định.');
}

function sanitizeReferencePart(value: string) {
  return value.replaceAll('.', '-').replaceAll('#', '-').replaceAll('$', '-').replaceAll('[', '-').replaceAll(']', '-').replaceAll('/', '-');
}

export function buildProductExcelStockReferenceId(
  sessionId: string,
  rowNumber: number,
  productId: string,
) {
  return `product-excel-${sanitizeReferencePart(sessionId)}-${rowNumber}-${sanitizeReferencePart(productId)}`;
}

function isStaleStockError(error: unknown) {
  const message = asMessage(error).toLocaleLowerCase('vi');
  return message.includes('tồn') && message.includes('đã thay đổi');
}

async function readProductById(productId: string): Promise<Product> {
  const products = await getProductsOnce();
  const product = products.find((candidate) => candidate.id === productId);
  if (!product) throw new Error(`Không tìm thấy sản phẩm ${productId}.`);
  return product;
}
