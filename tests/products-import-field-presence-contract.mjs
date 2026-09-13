import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as XLSX from 'xlsx';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { parseProductExcel } = await import(new URL('../src/modules/products/excelImport.ts', import.meta.url));
const { buildDuplicateProductUpdateInput } = await import(
  new URL('../src/modules/products/productExcelImportPlan.ts', import.meta.url)
);

function workbookAsFakeFile(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Hang hoa');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return { arrayBuffer: async () => arrayBuffer };
}

const existing = {
  id: 'product-a',
  sku: 'A001',
  name: 'Cờ Tổ Quốc',
  barcode: 'ABC',
  qrCode: 'QR-OLD',
  unit: 'Cái',
  costPrice: 12000,
  salePrice: 20000,
  stockQuantity: 50,
  stockVersion: 7,
  minStock: 5,
  active: false,
  createdAt: 100,
  updatedAt: 200,
};

async function parseDuplicate(row) {
  const result = await parseProductExcel(workbookAsFakeFile([row]), [existing]);
  assert.equal(result.rows[0].status, 'duplicate');
  assert.equal(result.rows[0].matchedProductId, existing.id);
  return result.rows[0];
}

test('duplicate update with only SKU + Name changes only name and preserves all omitted metadata', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Cờ Tổ Quốc loại mới',
  });

  assert.deepEqual(row.presentFields, ['sku', 'name']);
  assert.deepEqual(row.metadataPatch, { name: 'Cờ Tổ Quốc loại mới' });

  const update = buildDuplicateProductUpdateInput(existing, row);
  assert.deepEqual(update, {
    sku: 'A001',
    name: 'Cờ Tổ Quốc loại mới',
    barcode: 'ABC',
    qrCode: 'QR-OLD',
    unit: 'Cái',
    costPrice: 12000,
    salePrice: 20000,
    minStock: 5,
    active: false,
  });
});

test('missing Trạng thái keeps existing active=false', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
  });
  assert.equal(row.presentFields.includes('active'), false);
  assert.equal(buildDuplicateProductUpdateInput(existing, row).active, false);
});

test('missing Giá vốn and Giá bán keep existing prices', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
  });
  const update = buildDuplicateProductUpdateInput(existing, row);
  assert.equal(row.presentFields.includes('costPrice'), false);
  assert.equal(row.presentFields.includes('salePrice'), false);
  assert.equal(update.costPrice, 12000);
  assert.equal(update.salePrice, 20000);
});

test('missing Barcode QR unit and minStock keep existing optional metadata', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
  });
  const update = buildDuplicateProductUpdateInput(existing, row);
  assert.equal(update.barcode, 'ABC');
  assert.equal(update.qrCode, 'QR-OLD');
  assert.equal(update.unit, 'Cái');
  assert.equal(update.minStock, 5);
});

test('present Giá bán with valid value updates salePrice', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
    'Giá bán': 25000,
  });
  assert.equal(row.presentFields.includes('salePrice'), true);
  assert.equal(row.metadataPatch.salePrice, 25000);
  assert.equal(buildDuplicateProductUpdateInput(existing, row).salePrice, 25000);
});

test('present Barcode column with blank cell preserves existing barcode', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
    Barcode: '',
  });
  assert.equal(row.presentFields.includes('barcode'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(row.metadataPatch, 'barcode'), false);
  assert.equal(buildDuplicateProductUpdateInput(existing, row).barcode, 'ABC');
});

test('duplicate metadata merge never includes stockQuantity or stockVersion and stock remains CAS-only', async () => {
  const row = await parseDuplicate({
    'Mã hàng': 'A001',
    'Tên hàng': 'Tên mới',
    'Tồn kho': 80,
  });
  const update = buildDuplicateProductUpdateInput(existing, row);
  const workflowSource = read('src/modules/products/productExcelImportWorkflow.ts');

  assert.equal('stockQuantity' in update, false);
  assert.equal('stockVersion' in update, false);
  assert.equal(row.sourceStockQuantity, 80);
  assert.match(workflowSource, /buildDuplicateProductUpdateInput\(existing, row\)/);
  assert.match(workflowSource, /type: 'MANUAL_ADJUSTMENT'/);
  assert.match(workflowSource, /commitStockOperation/);
  assert.doesNotMatch(workflowSource, /stockQuantity\s*:/);
  assert.doesNotMatch(workflowSource, /stockVersion\s*:/);
});
