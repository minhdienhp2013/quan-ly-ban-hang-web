import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { loadPurchaseDraft, savePurchaseDraft } from '../src/modules/purchases/purchaseDraft.ts';
import { buildPurchaseDraftFromExcel } from '../src/modules/purchases/purchaseExcelImportDraft.ts';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

function matchedRow(overrides = {}) {
  return {
    rowNumber: 2,
    status: 'MATCHED',
    message: 'Đã khớp SKU.',
    name: 'Sản phẩm A',
    sourceSku: 'SKU-A',
    sourceBarcode: '',
    sourceQrCode: '',
    unit: 'Cái',
    quantity: 3,
    unitCost: 12000,
    salePrice: 18000,
    matchedProductId: 'product-a',
    effectiveSku: 'SKU-A',
    ...overrides,
  };
}

function buildDraft(extra = {}) {
  return buildPurchaseDraftFromExcel({
    rows: [matchedRow()],
    selectedNewRowNumbers: new Set(),
    progress: { createdProductsBySku: {} },
    ...extra,
  });
}

test('existing Supplier selection propagates supplierId and supplierName into imported Purchase draft', () => {
  const draft = buildDraft({ supplierId: 'supplier-1', supplierName: 'Nhà cung cấp A' });
  assert.equal(draft.supplierId, 'supplier-1');
  assert.equal(draft.supplierName, 'Nhà cung cấp A');
  assert.equal(draft.lines[0].productId, 'product-a');
});

test('Supplier remains optional for Excel import', () => {
  const draft = buildDraft();
  assert.equal(draft.supplierId, '');
  assert.equal(draft.supplierName, '');
  assert.equal(draft.lines.length, 1);
});

test('manual Supplier name is retained without requiring a Supplier id', () => {
  const draft = buildDraft({ supplierId: '', supplierName: 'NCC nhập tay theo hóa đơn' });
  assert.equal(draft.supplierId, '');
  assert.equal(draft.supplierName, 'NCC nhập tay theo hóa đơn');
});

test('selected Supplier survives Purchase draft save and restore', () => {
  const storage = new MemoryStorage();
  const uid = 'purchase-excel-user';
  const draft = buildDraft({ supplierId: 'supplier-1', supplierName: 'Nhà cung cấp A' });
  assert.equal(savePurchaseDraft(uid, draft, storage), true);
  assert.deepEqual(loadPurchaseDraft(uid, storage), draft);
});

test('Excel import Supplier UI reuses PurchasesPage Suppliers, filters active only, and keeps name editable', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  assert.match(page, /<PurchaseExcelImportPanel products=\{availableProducts\} suppliers=\{suppliers\}/);
  assert.match(panel, /suppliers: readonly Supplier\[\]/);
  assert.match(panel, /suppliers\.filter\(\(supplier\) => supplier\.active\)/);
  assert.match(panel, /<option value="">— Chưa chọn danh mục —<\/option>/);
  assert.match(panel, /setSupplierId\(nextId\)/);
  assert.match(panel, /if \(supplier\) setSupplierName\(supplier\.name\)/);
  assert.match(panel, /Tên NCC trên phiếu/);
  assert.match(panel, /value=\{supplierName\} onChange=\{\(event\) => setSupplierName\(event\.target\.value\)\}/);
  assert.match(panel, /supplierId,\s*supplierName,/s);
});

test('Supplier blocker fix keeps Excel import stock-safe and never auto-completes Purchase', () => {
  const sources = [
    'src/modules/purchases/PurchaseExcelImportPanel.tsx',
    'src/modules/purchases/purchaseExcelImport.ts',
    'src/modules/purchases/purchaseExcelImportDraft.ts',
    'src/modules/purchases/purchaseExcelImportWorkflow.ts',
  ].map((path) => fs.readFileSync(path, 'utf8')).join('\n');

  assert.doesNotMatch(sources, /commitStockOperation/);
  assert.doesNotMatch(sources, /\bincrement\s*\(/);
  assert.doesNotMatch(sources, /stockQuantity\s*:/);
  assert.doesNotMatch(sources, /stockVersion\s*:/);
  assert.doesNotMatch(sources, /createPurchase\s*\(/);
});

test('shared legacy Product generator contract remains imported rather than copied', () => {
  const parser = fs.readFileSync('src/modules/purchases/purchaseExcelImport.ts', 'utf8');
  assert.match(parser, /import \{ generateLegacyProductCode \} from '\.\.\/products\/productLegacyCode'/);
  assert.doesNotMatch(parser, /function\s+generateLegacyProductCode\s*\(/);
});
