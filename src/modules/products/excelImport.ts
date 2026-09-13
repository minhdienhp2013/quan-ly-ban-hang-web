import { read, utils } from 'xlsx';
import type { Product } from '../../types/models';
import type { ProductInput } from './productService';

export type ExcelImportStatus = 'ready' | 'duplicate' | 'conflict' | 'error';

export interface ExcelProductImportRow {
  rowNumber: number;
  input: ProductInput | null;
  status: ExcelImportStatus;
  message: string;
  sourceStockQuantity?: number;
  matchedProductId?: string;
}

export interface ExcelProductImportResult {
  sheetName: string;
  rows: ExcelProductImportRow[];
  detectedHeaders: string[];
  stockColumnDetected: boolean;
}

type RawRow = Record<string, unknown>;
type ProductField =
  | 'sku'
  | 'name'
  | 'barcode'
  | 'qrCode'
  | 'unit'
  | 'costPrice'
  | 'salePrice'
  | 'minStock'
  | 'stockQuantity'
  | 'active';

type IdentityKind = 'sku' | 'barcode' | 'qrCode';

interface DraftRow {
  rowNumber: number;
  input: ProductInput | null;
  sourceStockQuantity?: number;
  errors: string[];
  identityConflict: boolean;
  matchedProductId?: string;
  identityKeys: string[];
}

const aliases: Record<ProductField, string[]> = {
  sku: ['sku', 'mahang', 'masanpham', 'masp', 'mah', 'code'],
  name: ['tensanpham', 'tenhang', 'tenhanghoa', 'sanpham', 'productname', 'name'],
  barcode: ['barcode', 'mavach', 'ean', 'upc'],
  qrCode: ['qrcode', 'maqr', 'qr'],
  unit: ['donvitinh', 'donvi', 'dvt', 'unit'],
  costPrice: ['giavon', 'gianhap', 'giavonhang', 'costprice', 'cost'],
  salePrice: ['giaban', 'giabanle', 'saleprice', 'price'],
  minStock: ['tontoithieu', 'tonmin', 'minstock', 'muctontoithieu'],
  stockQuantity: ['tonkho', 'soluongton', 'slton', 'ton', 'inventory'],
  active: ['trangthai', 'active', 'status'],
};

function normalizeHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeCode(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

function toText(value: unknown) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim();
}

function toNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  const text = toText(value);
  if (!text) return undefined;

  const stripped = text.replace(/[^0-9,.-]/g, '');
  if (!stripped) return undefined;

  let normalized = stripped;
  if (/^\d{1,3}([.,]\d{3})+$/.test(stripped)) {
    normalized = stripped.replace(/[.,]/g, '');
  } else if (stripped.includes(',') && !stripped.includes('.')) {
    normalized = stripped.replace(',', '.');
  } else if (stripped.includes(',') && stripped.includes('.')) {
    const lastComma = stripped.lastIndexOf(',');
    const lastDot = stripped.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = stripped.replaceAll(thousandSeparator, '').replace(decimalSeparator, '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseActive(value: unknown) {
  const text = normalizeHeader(toText(value));
  if (!text) return true;

  const inactiveValues = ['0', 'false', 'inactive', 'ngung', 'ngungkinhdoanh', 'khongkinhdoanh', 'tat'];
  return !inactiveValues.includes(text);
}

function findHeader(headers: string[], field: ProductField) {
  const accepted = new Set(aliases[field]);
  return headers.find((header) => accepted.has(normalizeHeader(header)));
}

function getValue(row: RawRow, header?: string) {
  return header ? row[header] : undefined;
}

function addIndexValue(index: Map<string, Set<string>>, key: string, productId: string) {
  if (!key) return;
  const ids = index.get(key) ?? new Set<string>();
  ids.add(productId);
  index.set(key, ids);
}

function buildExistingIdentityIndexes(products: readonly Product[]) {
  const sku = new Map<string, Set<string>>();
  const barcode = new Map<string, Set<string>>();
  const qrCode = new Map<string, Set<string>>();

  for (const product of products) {
    addIndexValue(sku, normalizeCode(product.sku), product.id);
    addIndexValue(barcode, product.barcode?.trim() ?? '', product.id);
    addIndexValue(qrCode, product.qrCode?.trim() ?? '', product.id);
  }

  return { sku, barcode, qrCode };
}

function getIdentityMatches(
  indexes: ReturnType<typeof buildExistingIdentityIndexes>,
  kind: IdentityKind,
  value: string,
) {
  if (!value) return new Set<string>();
  if (kind === 'sku') return indexes.sku.get(normalizeCode(value)) ?? new Set<string>();
  if (kind === 'barcode') return indexes.barcode.get(value.trim()) ?? new Set<string>();
  return indexes.qrCode.get(value.trim()) ?? new Set<string>();
}

function buildIdentityKey(kind: IdentityKind, value: string) {
  if (!value) return '';
  const normalized = kind === 'sku' ? normalizeCode(value) : value.trim();
  return normalized ? `${kind}:${normalized}` : '';
}

export async function parseProductExcel(
  file: File,
  existingProducts: Product[],
): Promise<ExcelProductImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error('File Excel không có sheet dữ liệu.');
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: true });

  if (rawRows.length === 0) {
    throw new Error('Sheet đầu tiên không có dòng sản phẩm nào.');
  }

  const headers = Object.keys(rawRows[0]);
  const fieldHeaders: Partial<Record<ProductField, string>> = {};
  (Object.keys(aliases) as ProductField[]).forEach((field) => {
    const header = findHeader(headers, field);
    if (header) fieldHeaders[field] = header;
  });

  if (!fieldHeaders.sku || !fieldHeaders.name) {
    throw new Error('Excel phải có tối thiểu cột “Mã hàng/SKU” và “Tên hàng/Tên sản phẩm”.');
  }

  const identityIndexes = buildExistingIdentityIndexes(existingProducts);

  const drafts = rawRows.map<DraftRow>((row, index) => {
    const rowNumber = index + 2;
    const sku = toText(getValue(row, fieldHeaders.sku));
    const name = toText(getValue(row, fieldHeaders.name));
    const barcode = toText(getValue(row, fieldHeaders.barcode));
    const qrCode = toText(getValue(row, fieldHeaders.qrCode));
    const unit = toText(getValue(row, fieldHeaders.unit));
    const costPriceValue = getValue(row, fieldHeaders.costPrice);
    const salePriceValue = getValue(row, fieldHeaders.salePrice);
    const minStockValue = getValue(row, fieldHeaders.minStock);
    const stockQuantityValue = getValue(row, fieldHeaders.stockQuantity);
    const sourceStockQuantity = toNonNegativeNumber(stockQuantityValue);

    const errors: string[] = [];
    if (!sku) errors.push('Thiếu SKU/Mã hàng');
    if (!name) errors.push('Thiếu tên sản phẩm');

    const costPrice = toNonNegativeNumber(costPriceValue);
    const salePrice = toNonNegativeNumber(salePriceValue);
    const minStock = toNonNegativeNumber(minStockValue);

    if (toText(costPriceValue) && typeof costPrice === 'undefined') errors.push('Giá vốn không hợp lệ');
    if (toText(salePriceValue) && typeof salePrice === 'undefined') errors.push('Giá bán không hợp lệ');
    if (toText(minStockValue) && typeof minStock === 'undefined') errors.push('Tồn tối thiểu không hợp lệ');
    if (
      fieldHeaders.stockQuantity &&
      toText(stockQuantityValue) &&
      typeof sourceStockQuantity === 'undefined'
    ) {
      errors.push('Tồn kho không hợp lệ');
    }

    const skuMatches = getIdentityMatches(identityIndexes, 'sku', sku);
    const barcodeMatches = getIdentityMatches(identityIndexes, 'barcode', barcode);
    const qrMatches = getIdentityMatches(identityIndexes, 'qrCode', qrCode);
    const candidateIds = new Set<string>([...skuMatches, ...barcodeMatches, ...qrMatches]);
    const identityConflict = candidateIds.size > 1;
    const matchedProductId = candidateIds.size === 1 ? [...candidateIds][0] : undefined;

    const input: ProductInput | null = errors.length > 0
      ? null
      : {
          sku,
          name,
          barcode: barcode || undefined,
          qrCode: qrCode || undefined,
          unit: unit || undefined,
          costPrice: Math.round(costPrice ?? 0),
          salePrice: Math.round(salePrice ?? 0),
          minStock: typeof minStock === 'number' ? minStock : undefined,
          active: parseActive(getValue(row, fieldHeaders.active)),
        };

    return {
      rowNumber,
      input,
      errors,
      identityConflict,
      ...(typeof sourceStockQuantity === 'number' ? { sourceStockQuantity } : {}),
      ...(matchedProductId ? { matchedProductId } : {}),
      identityKeys: [
        buildIdentityKey('sku', sku),
        buildIdentityKey('barcode', barcode),
        buildIdentityKey('qrCode', qrCode),
      ].filter(Boolean),
    };
  });

  const identityRows = new Map<string, number[]>();
  const matchedProductRows = new Map<string, number[]>();

  for (const draft of drafts) {
    if (draft.errors.length > 0 || draft.identityConflict) continue;
    for (const key of draft.identityKeys) {
      const rows = identityRows.get(key) ?? [];
      rows.push(draft.rowNumber);
      identityRows.set(key, rows);
    }
    if (draft.matchedProductId) {
      const rows = matchedProductRows.get(draft.matchedProductId) ?? [];
      rows.push(draft.rowNumber);
      matchedProductRows.set(draft.matchedProductId, rows);
    }
  }

  const duplicatedRowNumbers = new Set<number>();
  for (const rows of identityRows.values()) {
    if (rows.length > 1) rows.forEach((rowNumber) => duplicatedRowNumbers.add(rowNumber));
  }
  for (const rows of matchedProductRows.values()) {
    if (rows.length > 1) rows.forEach((rowNumber) => duplicatedRowNumbers.add(rowNumber));
  }

  const rows = drafts.map<ExcelProductImportRow>((draft) => {
    if (draft.errors.length > 0) {
      return {
        rowNumber: draft.rowNumber,
        input: null,
        status: 'error',
        message: draft.errors.join('; '),
        ...(typeof draft.sourceStockQuantity === 'number' ? { sourceStockQuantity: draft.sourceStockQuantity } : {}),
      };
    }

    if (draft.identityConflict) {
      return {
        rowNumber: draft.rowNumber,
        input: draft.input,
        status: 'conflict',
        message: 'SKU/Barcode/QR đang trỏ tới các sản phẩm khác nhau.',
        ...(typeof draft.sourceStockQuantity === 'number' ? { sourceStockQuantity: draft.sourceStockQuantity } : {}),
      };
    }

    if (duplicatedRowNumbers.has(draft.rowNumber)) {
      return {
        rowNumber: draft.rowNumber,
        input: draft.input,
        status: 'conflict',
        message: 'SKU/Barcode/QR bị lặp hoặc nhiều dòng đang trỏ tới cùng một sản phẩm trong file.',
        ...(typeof draft.sourceStockQuantity === 'number' ? { sourceStockQuantity: draft.sourceStockQuantity } : {}),
        ...(draft.matchedProductId ? { matchedProductId: draft.matchedProductId } : {}),
      };
    }

    if (draft.matchedProductId) {
      return {
        rowNumber: draft.rowNumber,
        input: draft.input,
        status: 'duplicate',
        message: 'Hàng trùng: đã xác định đúng một Product hiện hữu.',
        ...(typeof draft.sourceStockQuantity === 'number' ? { sourceStockQuantity: draft.sourceStockQuantity } : {}),
        matchedProductId: draft.matchedProductId,
      };
    }

    return {
      rowNumber: draft.rowNumber,
      input: draft.input,
      status: 'ready',
      message: 'Sản phẩm mới - sẵn sàng nhập',
      ...(typeof draft.sourceStockQuantity === 'number' ? { sourceStockQuantity: draft.sourceStockQuantity } : {}),
    };
  });

  return {
    sheetName,
    rows,
    detectedHeaders: headers,
    stockColumnDetected: Boolean(fieldHeaders.stockQuantity),
  };
}
