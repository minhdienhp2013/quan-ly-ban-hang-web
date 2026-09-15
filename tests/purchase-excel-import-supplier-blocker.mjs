import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PURCHASE_DRAFT_VERSION,
  loadPurchaseDraft,
  savePurchaseDraft,
} from '../src/modules/purchases/purchaseDraft.ts';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

function draftWithSupplier(supplierId = '', supplierName = '') {
  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId,
    supplierName,
    note: '',
    lines: [{ productId: 'product-a', quantity: 3, unitCost: 12000 }],
  };
}

test('existing Supplier selection is wired through panel into imported Purchase draft', () => {
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  const builder = fs.readFileSync('src/modules/purchases/purchaseExcelImportDraft.ts', 'utf8');
  assert.match(panel, /supplierId,\s*supplierName,/s);
  assert.match(builder, /supplierId\?: string/);
  assert.match(builder, /supplierName\?: string/);
  assert.match(builder, /supplierId: input\.supplierId \?\? ''/);
  assert.match(builder, /supplierName: input\.supplierName \?\? ''/);
});

test('Supplier remains optional for Excel import', () => {
  const builder = fs.readFileSync('src/modules/purchases/purchaseExcelImportDraft.ts', 'utf8');
  assert.match(builder, /supplierId: input\.supplierId \?\? ''/);
  assert.match(builder, /supplierName: input\.supplierName \?\? ''/);
  const draft = draftWithSupplier();
  assert.equal(draft.supplierId, '');
  assert.equal(draft.supplierName, '');
});

test('manual Supplier name is supported without requiring a Supplier id', () => {
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  assert.match(panel, /Tên NCC trên phiếu/);
  assert.match(panel, /value=\{supplierName\} onChange=\{\(event\) => setSupplierName\(event\.target\.value\)\}/);
  const draft = draftWithSupplier('', 'NCC nhập tay theo hóa đơn');
  assert.equal(draft.supplierId, '');
  assert.equal(draft.supplierName, 'NCC nhập tay theo hóa đơn');
});

test('selected Supplier survives Purchase draft save and restore', () => {
  const storage = new MemoryStorage();
  const uid = 'purchase-excel-user';
  const draft = draftWithSupplier('supplier-1', 'Nhà cung cấp A');
  assert.equal(savePurchaseDraft(uid, draft, storage), true);
  assert.deepEqual(loadPurchaseDraft(uid, storage), draft);
});

test('Excel import Supplier UI reuses PurchasesPage Suppliers and exposes active Suppliers only', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const panel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  assert.match(page, /<PurchaseExcelImportPanel products=\{availableProducts\} suppliers=\{suppliers\}/);
  assert.match(panel, /suppliers: readonly Supplier\[\]/);
  assert.match(panel, /suppliers\.filter\(\(supplier\) => supplier\.active\)/);
  assert.match(panel, /<option value="">— Chưa chọn danh mục —<\/option>/);
  assert.match(panel, /setSupplierId\(nextId\)/);
  assert.match(panel, /if \(supplier\) setSupplierName\(supplier\.name\)/);
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
