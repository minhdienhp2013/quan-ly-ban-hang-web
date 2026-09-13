import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import * as XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function loadTsModule(path) {
  const source = read(path);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: path,
  }).outputText;

  const module = { exports: {} };
  const execute = new Function('require', 'module', 'exports', output);
  execute(require, module, module.exports);
  return module.exports;
}

const exportModule = loadTsModule('src/modules/products/productExcelExport.ts');
const importModule = loadTsModule('src/modules/products/excelImport.ts');
const {
  PRODUCT_EXCEL_FORMAT,
  PRODUCT_EXCEL_HEADERS,
  buildProductExcelFilename,
  createProductExcelWorkbook,
} = exportModule;
const { parseProductExcel } = importModule;

const products = [
  {
    id: 'product-active',
    sku: 'CG001',
    name: 'Cờ Tổ quốc 80x120',
    barcode: '8931234567890',
    qrCode: 'QR-CG001',
    unit: 'Cái',
    costPrice: 12000,
    salePrice: 25000,
    stockQuantity: 48,
    stockVersion: 7,
    minStock: 10,
    active: true,
    createdAt: Date.UTC(2026, 8, 1, 2, 3, 4),
    updatedAt: Date.UTC(2026, 8, 12, 5, 6, 7),
  },
  {
    id: 'product-inactive',
    sku: 'VPP022',
    name: 'Bút bi Thiên Long',
    costPrice: 3000,
    salePrice: 5000,
    stockQuantity: 65,
    stockVersion: 2,
    active: false,
    createdAt: Date.UTC(2026, 7, 10, 1, 2, 3),
    updatedAt: Date.UTC(2026, 8, 11, 8, 9, 10),
  },
];

function workbookRows(workbook) {
  return XLSX.utils.sheet_to_json(workbook.Sheets['Hang hoa'], { defval: '', raw: true });
}

function workbookAsFakeFile(workbook) {
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return { arrayBuffer: async () => arrayBuffer };
}

test('PRODUCT_EXCEL_V1 has exactly Hang hoa then Thong tin and stable headers', () => {
  const workbook = createProductExcelWorkbook(products, Date.UTC(2026, 8, 13, 2, 0, 0));
  assert.deepEqual(workbook.SheetNames, ['Hang hoa', 'Thong tin']);
  assert.equal(PRODUCT_EXCEL_FORMAT, 'PRODUCT_EXCEL_V1');

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets['Hang hoa'], {
    header: 1,
    defval: '',
    raw: true,
  });
  assert.deepEqual(matrix[0], [
    'Mã hàng',
    'Tên hàng',
    'Barcode',
    'Mã QR',
    'Đơn vị tính',
    'Giá vốn',
    'Giá bán',
    'Tồn tối thiểu',
    'Tồn kho',
    'Trạng thái',
    'Ngày tạo',
    'Cập nhật gần nhất',
  ]);
  assert.deepEqual([...PRODUCT_EXCEL_HEADERS], matrix[0]);
  assert.ok(!matrix[0].includes('stockVersion'));
});

test('export keeps number cells numeric, optional text empty, statuses Vietnamese and source immutable', () => {
  const before = structuredClone(products);
  const workbook = createProductExcelWorkbook(products, Date.UTC(2026, 8, 13, 2, 0, 0));
  const rows = workbookRows(workbook);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Trạng thái'], 'Đang kinh doanh');
  assert.equal(rows[1]['Trạng thái'], 'Ngừng kinh doanh');
  assert.equal(typeof rows[0]['Giá vốn'], 'number');
  assert.equal(typeof rows[0]['Giá bán'], 'number');
  assert.equal(typeof rows[0]['Tồn tối thiểu'], 'number');
  assert.equal(typeof rows[0]['Tồn kho'], 'number');
  assert.equal(rows[0]['Giá vốn'], 12000);
  assert.equal(rows[0]['Giá bán'], 25000);
  assert.equal(rows[0]['Tồn kho'], 48);
  assert.equal(rows[1].Barcode, '');
  assert.equal(rows[1]['Mã QR'], '');
  assert.equal(rows[1]['Đơn vị tính'], '');
  assert.equal(rows[1]['Tồn tối thiểu'], '');
  assert.deepEqual(products, before);
});

test('Thong tin contains format, timestamp, counts and stock snapshot warning', () => {
  const workbook = createProductExcelWorkbook(products, Date.UTC(2026, 8, 13, 2, 0, 0));
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Thong tin'], {
    header: 1,
    defval: '',
    raw: true,
  });
  const info = Object.fromEntries(rows.map(([key, value]) => [key, value]));

  assert.equal(info['Định dạng'], 'PRODUCT_EXCEL_V1');
  assert.equal(info['Thời gian xuất'], '2026-09-13T02:00:00.000Z');
  assert.equal(info['Tổng hàng hóa'], 2);
  assert.equal(info['Đang kinh doanh'], 1);
  assert.equal(info['Ngừng kinh doanh'], 1);
  assert.equal(
    info['Ghi chú'],
    'Tồn kho trong file Excel chỉ là snapshot phục vụ lưu trữ/đối chiếu. Import Product không ghi trực tiếp tồn kho.',
  );
});

test('filename follows hang-hoa-YYYY-MM-DD.xlsx', () => {
  const localTimestamp = new Date(2026, 8, 13, 12, 0, 0).getTime();
  assert.equal(buildProductExcelFilename(localTimestamp), 'hang-hoa-2026-09-13.xlsx');
});

test('exported workbook is accepted by parseProductExcel including stock snapshot and ignored audit dates', async () => {
  const workbook = createProductExcelWorkbook(products, Date.UTC(2026, 8, 13, 2, 0, 0));
  const result = await parseProductExcel(workbookAsFakeFile(workbook), []);

  assert.equal(result.sheetName, 'Hang hoa');
  assert.equal(result.stockColumnDetected, true);
  assert.ok(result.detectedHeaders.includes('Ngày tạo'));
  assert.ok(result.detectedHeaders.includes('Cập nhật gần nhất'));
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].status, 'ready');
  assert.equal(result.rows[1].status, 'ready');
  assert.equal(result.rows[0].input.sku, 'CG001');
  assert.equal(result.rows[0].input.name, 'Cờ Tổ quốc 80x120');
  assert.equal(result.rows[0].input.barcode, '8931234567890');
  assert.equal(result.rows[0].input.qrCode, 'QR-CG001');
  assert.equal(result.rows[0].input.unit, 'Cái');
  assert.equal(result.rows[0].input.costPrice, 12000);
  assert.equal(result.rows[0].input.salePrice, 25000);
  assert.equal(result.rows[0].input.minStock, 10);
  assert.equal(result.rows[0].input.active, true);
  assert.equal(result.rows[1].input.active, false);
  assert.equal(result.rows[0].sourceStockQuantity, 48);
  assert.equal(result.rows[1].sourceStockQuantity, 65);
  assert.equal('stockQuantity' in result.rows[0].input, false);
  assert.equal('createdAt' in result.rows[0].input, false);
  assert.equal('updatedAt' in result.rows[0].input, false);
});

test('Product Import duplicate SKU, barcode and QR detection still works with PRODUCT_EXCEL_V1', async () => {
  const workbook = createProductExcelWorkbook([products[0]], Date.UTC(2026, 8, 13, 2, 0, 0));
  const result = await parseProductExcel(workbookAsFakeFile(workbook), [products[0]]);
  const row = result.rows[0];

  assert.equal(row.status, 'duplicate');
  assert.match(row.message, /SKU đã có trong hệ thống/);
  assert.match(row.message, /Barcode đã có trong hệ thống/);
  assert.match(row.message, /QR đã có trong hệ thống/);
});

test('Product import continues to ignore exported stock snapshot and initializes stock through existing contract', () => {
  const parserSource = read('src/modules/products/excelImport.ts');
  const importServiceSource = read('src/modules/products/productImportService.ts');

  assert.match(parserSource, /sourceStockQuantity/);
  assert.doesNotMatch(parserSource, /stockQuantity:\s*sourceStockQuantity/);
  assert.doesNotMatch(importServiceSource, /sourceStockQuantity/);
  assert.match(importServiceSource, /stockQuantity:\s*0/);
  assert.match(importServiceSource, /stockVersion:\s*0/);
});

test('Xuất Excel is owner-only and exports the full products source, not filtered or selected rows', () => {
  const pageSource = read('src/modules/products/ProductsPage.tsx');
  const toolbarSource = read('src/modules/products/GoodsToolbar.tsx');
  const handlerStart = pageSource.indexOf('function handleExportExcel');
  const handlerEnd = pageSource.indexOf('\n  function printProducts', handlerStart);
  const handler = pageSource.slice(handlerStart, handlerEnd);

  assert.match(toolbarSource, />Xuất Excel<\/button>/);
  assert.match(pageSource, /showExportExcel=\{appUser\?\.role === 'owner'\}/);
  assert.match(handler, /appUser\?\.role !== 'owner'/);
  assert.match(handler, /exportProductsToExcel\(products\)/);
  assert.doesNotMatch(handler, /filteredProducts|selectedProducts|selectedProductIds/);
});
