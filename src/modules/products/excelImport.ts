import { read, utils } from 'xlsx';
import type { Product } from '../../types/models';
import type { ProductInput } from './productService';

export type ExcelImportStatus = 'ready' | 'duplicate' | 'error';

export interface ExcelProductImportRow {
  rowNumber: number;
  input: ProductInput | null;
  status: ExcelImportStatus;
  message: string;
  sourceStockQuantity?: number;
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

  const existingSkus = new Set(existingProducts.map((product) => normalizeCode(product.sku)));
  const existingBarcodes = new Set(
    existingProducts.map((product) => product.barcode?.trim()).filter((value): value is string => Boolean(value)),
  );
  const existingQrCodes = new Set(
    existingProducts.map((product) => product.qrCode?.trim()).filter((value): value is string => Boolean(value)),
  );

  const seenSkus = new Set<string>();
  const seenBarcodes = new Set<string>();
  const seenQrCodes = new Set<string>();

  const rows = rawRows.map<ExcelProductImportRow>((row, index) => {
    const rowNumber = index + 2;
    const sku = toText(getValue(row, fieldHeaders.sku));
    const name = toText(getValue(row, fieldHeaders.name));
    const barcode = toText(getValue(row, fieldHeaders.barcode));
    const qrCode = toText(getValue(row, fieldHeaders.qrCode));
    const unit = toText(getValue(row, fieldHeaders.unit));
    const costPriceValue = getValue(row, fieldHeaders.costPrice);
    const salePriceValue = getValue(row, fieldHeaders.salePrice);
    const minStockValue = getValue(row, fieldHeaders.minStock);
    const sourceStockQuantity = toNonNegativeNumber(getValue(row, fieldHeaders.stockQuantity));

    const errors: string[] = [];
    if (!sku) errors.push('Thiếu SKU/Mã hàng');
    if (!name) errors.push('Thiếu tên sản phẩm');

    const costPrice = toNonNegativeNumber(costPriceValue);
    const salePrice = toNonNegativeNumber(salePriceValue);
    const minStock = toNonNegativeNumber(minStockValue);

    if (toText(costPriceValue) && typeof costPrice === 'undefined') errors.push('Giá vốn không hợp lệ');
    if (toText(salePriceValue) && typeof salePrice === 'undefined') errors.push('Giá bán không hợp lệ');
    if (toText(minStockValue) && typeof minStock === 'undefined') errors.push('Tồn tối thiểu không hợp lệ');

    if (errors.length > 0) {
      return {
        rowNumber,
        input: null,
        status: 'error',
        message: errors.join('; '),
        ...(typeof sourceStockQuantity === 'number' ? { sourceStockQuantity } : {}),
      };
    }

    const normalizedSku = normalizeCode(sku);
    const duplicateReasons: string[] = [];
    if (existingSkus.has(normalizedSku)) duplicateReasons.push('SKU đã có trong hệ thống');
    if (seenSkus.has(normalizedSku)) duplicateReasons.push('SKU bị lặp trong file');
    if (barcode && existingBarcodes.has(barcode)) duplicateReasons.push('Barcode đã có trong hệ thống');
    if (barcode && seenBarcodes.has(barcode)) duplicateReasons.push('Barcode bị lặp trong file');
    if (qrCode && existingQrCodes.has(qrCode)) duplicateReasons.push('QR đã có trong hệ thống');
    if (qrCode && seenQrCodes.has(qrCode)) duplicateReasons.push('QR bị lặp trong file');

    seenSkus.add(normalizedSku);
    if (barcode) seenBarcodes.add(barcode);
    if (qrCode) seenQrCodes.add(qrCode);

    const input: ProductInput = {
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
      status: duplicateReasons.length > 0 ? 'duplicate' : 'ready',
      message: duplicateReasons.length > 0 ? duplicateReasons.join('; ') : 'Sẵn sàng nhập',
      ...(typeof sourceStockQuantity === 'number' ? { sourceStockQuantity } : {}),
    };
  });

  return {
    sheetName,
    rows,
    detectedHeaders: headers,
    stockColumnDetected: Boolean(fieldHeaders.stockQuantity),
  };
}
