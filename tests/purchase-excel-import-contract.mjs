import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { utils, write } from 'xlsx';

import { generateLegacyProductCode } from '../src/modules/products/productLegacyCode.ts';
import {
  createPurchaseExcelTemplateWorkbook,
  PURCHASE_EXCEL_TEMPLATE_HEADERS,
} from '../src/modules/purchases/purchaseExcelImportTemplate.ts';
import {
  loadPurchaseDraft,
  savePurchaseDraft,
} from '../src/modules/purchases/purchaseDraft.ts';

const parserHarnessPath = 'src/modules/purchases/.purchaseExcelImport.node-test.ts';
const draftHarnessPath = 'src/modules/purchases/.purchaseExcelImportDraft.node-test.ts';

const parserSource = fs.readFileSync('src/modules/purchases/purchaseExcelImport.ts', 'utf8')
  .replace("../../shared/search/searchNormalization'", "../../shared/search/searchNormalization.ts'")
  .replace("../products/productLegacyCode'", "../products/productLegacyCode.ts'");
fs.writeFileSync(parserHarnessPath, parserSource);

const draftSource = fs.readFileSync('src/modules/purchases/purchaseExcelImportDraft.ts', 'utf8')
  .replace("../../shared/search/searchNormalization'", "../../shared/search/searchNormalization.ts'")
  .replace("./purchaseDraft'", "./purchaseDraft.ts'");
fs.writeFileSync(draftHarnessPath, draftSource);

process.on('exit', () => {
  for (const path of [parserHarnessPath, draftHarnessPath]) {
    try { fs.unlinkSync(path); } catch { /* already removed */ }
  }
});

const { parsePurchaseExcelBuffer } = await import(`../${parserHarnessPath}?v=${Date.now()}`);
const { buildPurchaseDraftFromExcel } = await import(`../${draftHarnessPath}?v=${Date.now()}`);

const HEADERS = [
  'Tên hàng',
  'Mã hàng',
  'Mã vạch',
  'Đơn vị',
  'Số lượng nhập',
  'Giá nhập',
  'Giá bán',
  'Tồn tối thiểu',
  'Mã QR',
];

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'SKU-001',
    name: 'Sản phẩm một',
    barcode: 'BAR-001',
    qrCode: 'QR-001',
    unit: 'Cái',
    costPrice: 100,
    salePrice: 150,
    stockQuantity: 5,
    stockVersion: 2,
    minStock: 1,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function workbookBuffer(rows, headers = HEADERS) {
  const workbook = utils.book_new();
  const sheet = utils.aoa_to_sheet([headers, ...rows]);
  utils.book_append_sheet(workbook, sheet, 'Nhap hang');
  return write(workbook, { type: 'array', bookType: 'xlsx' });
}

function parse(rows, products = [], headers = HEADERS) {
  return parsePurchaseExcelBuffer(workbookBuffer(rows, headers), products);
}

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

test('template generation creates Nhap hang + Huong dan and TEXT identifier cells', () => {
  const workbook = createPurchaseExcelTemplateWorkbook();
  assert.deepEqual(workbook.SheetNames, ['Nhap hang', 'Huong dan']);
  const sheet = workbook.Sheets['Nhap hang'];
  const header = utils.sheet_to_json(sheet, { header: 1, raw: true })[0];
  assert.deepEqual(header.slice(0, PURCHASE_EXCEL_TEMPLATE_HEADERS.length), [...PURCHASE_EXCEL_TEMPLATE_HEADERS]);
  assert.equal(sheet.B2.t, 's');
  assert.equal(sheet.B2.z, '@');
  assert.equal(sheet.C2.t, 's');
  assert.equal(sheet.C2.z, '@');
  assert.equal(sheet.I2.t, 's');
});

test('header aliases accept Product Name/Code/UPC/Qty/Cost and preserve identifiers as strings', () => {
  const headers = ['Product Name', 'Code', 'UPC', 'Unit', 'Qty', 'Cost', 'Price', 'MinStock', 'QR'];
  const result = parse([['Hàng alias', '001-A', '000123456789', 'Cái', 2, 100, 150, 1, 'QR-A']], [], headers);
  assert.equal(result.rows[0].status, 'NEW');
  assert.equal(result.rows[0].newProductInput.sku, '001-A');
  assert.equal(result.rows[0].newProductInput.barcode, '000123456789');
  assert.equal(result.rows[0].newProductInput.qrCode, 'QR-A');
});

test('provided SKU exact match keeps existing historical Product identity', () => {
  const existing = product({ sku: 'SP000168', name: 'gương xoay mdf', barcode: 'MANU-168', qrCode: 'QR-168' });
  const result = parse([['Tên Excel khác', 'SP000168', '', 'Cái', 3, 120, 200, '', '']], [existing]);
  assert.equal(result.rows[0].status, 'MATCHED');
  assert.equal(result.rows[0].matchedProductId, existing.id);
  assert.equal(result.rows[0].effectiveSku, 'SP000168');
  assert.match(result.rows[0].message, /giữ nguyên/i);
});

test('barcode exact match and QR exact match resolve existing Products without fuzzy matching', () => {
  const a = product({ id: 'a', sku: 'A', barcode: 'BAR-A', qrCode: 'QR-A' });
  const b = product({ id: 'b', sku: 'B', barcode: 'BAR-B', qrCode: 'QR-B' });
  const barcode = parse([['Theo barcode', '', 'BAR-A', '', 1, 10, 20, '', '']], [a, b]).rows[0];
  const qr = parse([['Theo QR', '', '', '', 1, 10, 20, '', 'QR-B']], [a, b]).rows[0];
  assert.equal(barcode.status, 'MATCHED');
  assert.equal(barcode.matchedProductId, 'a');
  assert.equal(qr.status, 'MATCHED');
  assert.equal(qr.matchedProductId, 'b');
});

test('manufacturer barcode is preserved for NEW and blank barcode defaults exactly to SKU', () => {
  const withBarcode = parse([['Hàng mới A', 'NEW-A', '000123+.-*', 'Bộ', 2, 100, 180, 1, '']]).rows[0];
  assert.equal(withBarcode.status, 'NEW');
  assert.equal(withBarcode.newProductInput.barcode, '000123+.-*');

  const withoutBarcode = parse([['Hàng mới B', 'NEW-B', '', 'Bộ', 2, 100, 180, 1, '']]).rows[0];
  assert.equal(withoutBarcode.status, 'NEW');
  assert.equal(withoutBarcode.newProductInput.barcode, 'NEW-B');
});

test('shared legacy generator is imported, not copied, and golden outputs remain locked', () => {
  const source = fs.readFileSync('src/modules/purchases/purchaseExcelImport.ts', 'utf8');
  assert.match(source, /import \{ generateLegacyProductCode \} from '\.\.\/products\/productLegacyCode'/);
  assert.doesNotMatch(source, /function\s+generateLegacyProductCode/);

  const cases = [
    ['bàn cafe bàn tròn mây nhựa', 'bcbtmn'],
    ['bàn k min 1m2', 'bkm1m2'],
    ['bàn phấn gỗ 1m2 cổ điển', 'bpg1m2cd'],
    ['Bộ bàn ăn chân soi mặt đá ghế 1 lá ngang sồi màu óc chó', 'bbacsmdg1lnsmoc'],
    ['bộ đối thuyền sồi óc chó + đệm da 12p 5 gối tựa', 'bdtsoc+dd12p5gt'],
    ['Tủ 3c + cua nhựa cocoplast', 't3c+cnc'],
    ['Trạn 1,2m', 't12m'],
  ];
  for (const [name, expected] of cases) assert.equal(generateLegacyProductCode(name), expected);
});

test('manual legacy SKU is preserved by unique exact normalized-name fallback', () => {
  const existing = product({ id: 'legacy', sku: 'SP000168', name: 'gương xoay mdf', barcode: 'B168', qrCode: 'Q168' });
  const row = parse([['GƯƠNG XOAY MDF', '', '', 'Cái', 1, 99, 199, '', '']], [existing]).rows[0];
  assert.equal(row.status, 'MATCHED');
  assert.equal(row.matchedProductId, 'legacy');
  assert.equal(row.effectiveSku, 'SP000168');
  assert.match(row.message, /tên đầy đủ chuẩn hóa chính xác/);
});

test('generated SKU collision with a different existing name is REVIEW, never abc-2/abc-3', () => {
  const existing = product({ id: 'old', sku: 'bc', name: 'Bàn cũ', barcode: undefined, qrCode: undefined });
  const row = parse([['Bàn cao', '', '', 'Cái', 1, 10, 20, '', '']], [existing]).rows[0];
  assert.equal(row.status, 'REVIEW');
  assert.equal(row.effectiveSku, 'bc');
  assert.match(row.message, /đã thuộc Product/);
  assert.doesNotMatch(row.message, /bc-2|bc-3/);
});

test('SKU and barcode pointing to different Products is REVIEW conflict', () => {
  const a = product({ id: 'a', sku: 'SKU-A', barcode: 'BAR-A', qrCode: 'QR-A' });
  const b = product({ id: 'b', sku: 'SKU-B', barcode: 'BAR-B', qrCode: 'QR-B' });
  const row = parse([['Conflict', 'SKU-A', 'BAR-B', '', 1, 10, 20, '', '']], [a, b]).rows[0];
  assert.equal(row.status, 'REVIEW');
  assert.match(row.message, /trỏ tới các Product khác nhau/);
});

test('two different NEW names with same generated code are REVIEW', () => {
  const result = parse([
    ['Bàn cao', '', '', 'Cái', 1, 10, 20, '', ''],
    ['Bàn cong', '', '', 'Cái', 1, 10, 20, '', ''],
  ]);
  assert.deepEqual(result.rows.map((row) => row.status), ['REVIEW', 'REVIEW']);
  assert.equal(result.summary.review, 2);
  assert.match(result.rows[0].message, /khác tên cùng Mã hàng/);
});

test('quantity <= 0, negative/invalid price and numeric identifier cells fail closed', () => {
  assert.equal(parse([['Q0', 'Q0', '', '', 0, 10, 20, '', '']]).rows[0].status, 'ERROR');
  assert.equal(parse([['Bad cost', 'BAD', '', '', 1, -1, 20, '', '']]).rows[0].status, 'ERROR');
  assert.equal(parse([['Bad sale', 'BAD2', '', '', 1, 1, 'abc', '', '']]).rows[0].status, 'ERROR');
  const numericIdentifier = parse([['Numeric SKU', 1234567890123, '', '', 1, 1, 2, '', '']]).rows[0];
  assert.equal(numericIdentifier.status, 'ERROR');
  assert.match(numericIdentifier.message, /TEXT|biến dạng/);
});

test('same certain Product + same cost can consolidate quantity into imported Purchase draft and restore', () => {
  const existing = product({ id: 'merge', sku: 'MERGE', barcode: 'BM', qrCode: 'QM' });
  const result = parse([
    ['One', 'MERGE', '', '', 2, 50, 80, '', ''],
    ['Two', '', 'BM', '', 3, 50, 80, '', ''],
  ], [existing]);
  assert.deepEqual(result.rows.map((row) => row.status), ['MATCHED', 'MATCHED']);

  const draft = buildPurchaseDraftFromExcel({
    rows: result.rows,
    selectedNewRowNumbers: new Set(),
    progress: { createdProductsBySku: {} },
  });
  assert.deepEqual(draft.lines, [{ productId: 'merge', quantity: 5, unitCost: 50 }]);

  const storage = new MemoryStorage();
  savePurchaseDraft('uid-import', draft, storage);
  assert.deepEqual(loadPurchaseDraft('uid-import', storage), draft);
});

test('same Product with different import costs is REVIEW instead of silent average', () => {
  const existing = product({ id: 'cost', sku: 'COST', barcode: 'BCOST' });
  const result = parse([
    ['One', 'COST', '', '', 1, 50, 80, '', ''],
    ['Two', '', 'BCOST', '', 1, 60, 80, '', ''],
  ], [existing]);
  assert.deepEqual(result.rows.map((row) => row.status), ['REVIEW', 'REVIEW']);
  assert.match(result.rows[0].message, /không tự average/);
});

test('purchase Excel workflow creates Products only and cannot mutate stock or auto-complete Purchase', () => {
  const workflow = fs.readFileSync('src/modules/purchases/purchaseExcelImportWorkflow.ts', 'utf8');
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const productService = fs.readFileSync('src/modules/products/productService.ts', 'utf8');

  assert.match(workflow, /import \{ createProduct \} from '\.\.\/products\/productService'/);
  assert.doesNotMatch(workflow, /commitStockOperation|stockQuantity|stockVersion|StockMovement|createPurchase|increment\(/);
  assert.doesNotMatch(panel, /createPurchase|commitStockOperation|increment\(/);
  assert.match(panel, /result\.failures\.length > 0/);
  assert.match(panel, /setProductsConfirmed\(false\)/);
  assert.match(panel, /Đưa vào phiếu nhập/);
  assert.match(page, /const purchase = await createPurchase\(input, appUser\.uid\)/);
  assert.match(productService, /stockQuantity: 0/);
  assert.match(productService, /stockVersion: 0/);
});

test('draft safety guards Nhập Excel before replacing current editor and preview does not clear draft', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  const openImport = page.slice(page.indexOf('function openImport()'), page.indexOf('function handleImportReady('));
  const guardIndex = openImport.indexOf('guardPurchaseDraftReplacement');
  const closeEditorIndex = openImport.indexOf('setEditorSession(null)');
  const mountImportIndex = openImport.indexOf('setImportOpen(true)');
  assert.ok(guardIndex >= 0);
  assert.ok(closeEditorIndex > guardIndex);
  assert.ok(mountImportIndex > guardIndex);
  assert.doesNotMatch(panel, /clearPurchaseDraft/);
  assert.match(page, /setEditorSession\(\{ key: Date\.now\(\), source: null, draft \}\)/);
});

test('responsive import UI uses internal scroll, 44px touch targets and mobile-safe grids', () => {
  const css = fs.readFileSync('src/modules/purchases/purchaseExcelImport.css', 'utf8');
  assert.match(css, /purchase-import-table-wrap\{[^}]*overflow:auto/);
  assert.match(css, /purchase-import-file\{[^}]*min-height:44px/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /purchase-toolbar-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
