import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as XLSX from 'xlsx';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { parseProductExcel } = await import(new URL('../src/modules/products/excelImport.ts', import.meta.url));
const {
  getExcelStockPreview,
  summarizeProductExcelImport,
} = await import(new URL('../src/modules/products/productExcelImportPlan.ts', import.meta.url));
const { deactivateSelectedProducts } = await import(new URL('../src/modules/products/productBulkActions.ts', import.meta.url));

function workbookAsFakeFile(rows) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Hang hoa');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return { arrayBuffer: async () => arrayBuffer };
}

const productA = {
  id: 'product-a',
  sku: 'A001',
  name: 'Sản phẩm A',
  barcode: 'BAR-A',
  qrCode: 'QR-A',
  unit: 'Cái',
  costPrice: 10000,
  salePrice: 15000,
  stockQuantity: 50,
  stockVersion: 4,
  minStock: 5,
  active: true,
  createdAt: 100,
  updatedAt: 200,
};

const productB = {
  id: 'product-b',
  sku: 'B001',
  name: 'Sản phẩm B',
  barcode: 'BAR-B',
  qrCode: 'QR-B',
  unit: 'Cái',
  costPrice: 20000,
  salePrice: 30000,
  stockQuantity: 20,
  stockVersion: 2,
  active: true,
  createdAt: 110,
  updatedAt: 210,
};

test('duplicate mode defaults to skip and stock update defaults OFF', () => {
  const panelSource = read('src/modules/products/ProductExcelImportPanel.tsx');
  assert.match(panelSource, /useState<ProductExcelDuplicateMode>\('skip'\)/);
  assert.match(panelSource, /useState\(false\);\s*\n\s*const \[sessionId/);
  assert.match(panelSource, /isOwner \? \(/);
  assert.match(panelSource, /Cập nhật tồn kho theo file Excel/);
});

test('existing duplicate resolves to exactly one Product and stays duplicate for default skip behavior', async () => {
  const result = await parseProductExcel(
    workbookAsFakeFile([
      {
        'Mã hàng': 'A001',
        'Tên hàng': 'A cập nhật',
        Barcode: 'BAR-A',
        'Mã QR': 'QR-A',
        'Giá vốn': 12000,
        'Giá bán': 18000,
      },
    ]),
    [productA, productB],
  );

  assert.equal(result.rows[0].status, 'duplicate');
  assert.equal(result.rows[0].matchedProductId, 'product-a');
});

test('SKU matching Product A plus Barcode matching Product B is a conflict', async () => {
  const result = await parseProductExcel(
    workbookAsFakeFile([
      {
        'Mã hàng': 'A001',
        'Tên hàng': 'Conflict SKU Barcode',
        Barcode: 'BAR-B',
      },
    ]),
    [productA, productB],
  );

  assert.equal(result.rows[0].status, 'conflict');
  assert.equal(result.rows[0].message, 'SKU/Barcode/QR đang trỏ tới các sản phẩm khác nhau.');
});

test('QR pointing to a different Product is a conflict', async () => {
  const result = await parseProductExcel(
    workbookAsFakeFile([
      {
        'Mã hàng': 'A001',
        'Tên hàng': 'Conflict QR',
        'Mã QR': 'QR-B',
      },
    ]),
    [productA, productB],
  );

  assert.equal(result.rows[0].status, 'conflict');
  assert.equal(result.rows[0].message, 'SKU/Barcode/QR đang trỏ tới các sản phẩm khác nhau.');
});

test('duplicates inside the same file are blocked safely instead of last-write-wins', async () => {
  const result = await parseProductExcel(
    workbookAsFakeFile([
      { 'Mã hàng': 'NEW-1', 'Tên hàng': 'Dòng 1', Barcode: 'NEW-BAR-1' },
      { 'Mã hàng': 'NEW-1', 'Tên hàng': 'Dòng 2', Barcode: 'NEW-BAR-2' },
    ]),
    [],
  );

  assert.equal(result.rows[0].status, 'conflict');
  assert.equal(result.rows[1].status, 'conflict');
});

test('blank stock means no stock target while numeric zero means target zero', async () => {
  const result = await parseProductExcel(
    workbookAsFakeFile([
      { 'Mã hàng': 'NEW-1', 'Tên hàng': 'Blank', 'Tồn kho': '' },
      { 'Mã hàng': 'NEW-2', 'Tên hàng': 'Zero', 'Tồn kho': 0 },
    ]),
    [],
  );

  assert.equal(result.stockColumnDetected, true);
  assert.equal('sourceStockQuantity' in result.rows[0], false);
  assert.equal(result.rows[1].sourceStockQuantity, 0);
});

test('stock target planning handles 50→80, 50→20, 50→50 and new Product from zero', () => {
  const duplicateRow = {
    rowNumber: 2,
    input: { sku: 'A001', name: 'A', costPrice: 1, salePrice: 2, active: true },
    status: 'duplicate',
    message: 'duplicate',
    matchedProductId: 'product-a',
    sourceStockQuantity: 80,
  };

  assert.deepEqual(getExcelStockPreview(duplicateRow, [productA]), { current: 50, target: 80, delta: 30 });
  assert.deepEqual(getExcelStockPreview({ ...duplicateRow, sourceStockQuantity: 20 }, [productA]), { current: 50, target: 20, delta: -30 });
  assert.deepEqual(getExcelStockPreview({ ...duplicateRow, sourceStockQuantity: 50 }, [productA]), { current: 50, target: 50, delta: 0 });

  const newRow = {
    ...duplicateRow,
    status: 'ready',
    matchedProductId: undefined,
    sourceStockQuantity: 12,
  };
  assert.deepEqual(getExcelStockPreview(newRow, [productA]), { current: 0, target: 12, delta: 12 });
});

test('metadata skip and stock update remain independent for duplicate rows', () => {
  const row = {
    rowNumber: 2,
    input: { sku: 'A001', name: 'A', costPrice: 1, salePrice: 2, active: true },
    status: 'duplicate',
    message: 'duplicate',
    matchedProductId: 'product-a',
    sourceStockQuantity: 80,
  };
  const summary = summarizeProductExcelImport([row], [productA], 'skip', true);
  assert.equal(summary.skippedCount, 1);
  assert.equal(summary.updateCount, 0);
  assert.equal(summary.stockAdjustmentCount, 1);
});

test('duplicate metadata update uses matched Product, preserves SKU/createdAt, and never writes stock directly', () => {
  const workflowSource = read('src/modules/products/productExcelImportWorkflow.ts');
  const productServiceSource = read('src/modules/products/productService.ts');
  const updateStart = productServiceSource.indexOf('export async function updateProduct');
  const updateEnd = productServiceSource.indexOf('export async function setProductActive', updateStart);
  const updateProductSource = productServiceSource.slice(updateStart, updateEnd);

  assert.match(workflowSource, /row\.matchedProductId/);
  assert.match(workflowSource, /sku: existing\.sku/);
  assert.match(workflowSource, /await updateProduct\(/);
  assert.match(updateProductSource, /createdAt: existing\.createdAt/);
  assert.doesNotMatch(updateProductSource, /products\/\$\{existing\.id\}\/stockQuantity/);
  assert.doesNotMatch(updateProductSource, /products\/\$\{existing\.id\}\/stockVersion/);
  assert.doesNotMatch(workflowSource, /increment\s*\(/);
  assert.doesNotMatch(workflowSource, /update\s*\(ref/);
});

test('stock import is owner-gated, blocks missing stock column, and reuses Inventory CAS/idempotency contract', () => {
  const panelSource = read('src/modules/products/ProductExcelImportPanel.tsx');
  const workflowSource = read('src/modules/products/productExcelImportWorkflow.ts');
  const inventorySource = read('src/modules/inventory/inventoryService.ts');
  const casSource = read('src/modules/inventory/stockOperationCas.ts');

  assert.match(panelSource, /isOwner \? \(/);
  assert.match(workflowSource, /input\.actorRole !== 'owner'/);
  assert.match(workflowSource, /File không có cột Tồn kho\./);
  assert.match(workflowSource, /type: 'MANUAL_ADJUSTMENT'/);
  assert.match(workflowSource, /referenceType: 'manual'/);
  assert.match(workflowSource, /expectedQuantityBefore: currentQuantity/);
  assert.match(workflowSource, /commitStockOperation/);
  assert.match(workflowSource, /getProductsOnce/);
  assert.match(workflowSource, /buildProductExcelStockReferenceId/);
  assert.match(inventorySource, /updates\[`stockMovements\/\$\{movementId\}`\] = movement/);
  assert.match(inventorySource, /updates\[`stockOperations\/\$\{operationId\}`\] = receipt/);
  assert.match(inventorySource, /stockVersionAfter/);
  assert.match(casSource, /STALE_STOCK/);
  assert.match(inventorySource, /existingReceipt/);
});

test('bulk deactivate skips inactive Products and reports partial failure accurately', async () => {
  const inactive = { ...productB, active: false };
  const failing = { ...productB, id: 'product-c', sku: 'C001', active: true };
  const called = [];
  const result = await deactivateSelectedProducts(
    [productA, inactive, failing],
    async (product) => {
      called.push(product.id);
      if (product.id === 'product-c') throw new Error('simulated failure');
    },
  );

  assert.deepEqual(called, ['product-a', 'product-c']);
  assert.equal(result.selected, 3);
  assert.equal(result.targeted, 2);
  assert.equal(result.deactivated, 1);
  assert.equal(result.skippedInactive, 1);
  assert.equal(result.failures.length, 1);
});

test('bulk deactivate is owner-only in UI, uses hidden selection, and never deletes Products/history or changes stock', () => {
  const pageSource = read('src/modules/products/ProductsPage.tsx');
  const barSource = read('src/modules/products/GoodsBulkActionBar.tsx');
  const bulkSource = read('src/modules/products/productBulkActions.ts');

  assert.match(barSource, /showDeactivate \? \(/);
  assert.match(barSource, /Ngừng kinh doanh đã chọn/);
  assert.match(pageSource, /showDeactivate=\{appUser\?\.role === 'owner'\}/);
  assert.match(pageSource, /appUser\?\.role !== 'owner'/);
  assert.match(pageSource, /selectedProducts,\s*\n\s*\(product\) => setProductActive\(product, false, appUser\.uid\)/);
  assert.match(pageSource, /products\.filter\(\(product\) => selectedProductIds\.has\(product\.id\)\)/);
  assert.doesNotMatch(bulkSource, /remove\s*\(/);
  assert.doesNotMatch(bulkSource, /stockQuantity|stockVersion/);
  assert.doesNotMatch(bulkSource, /sales|purchases|stockMovements|stockOperations|stocktakes|auditLogs/);
});
