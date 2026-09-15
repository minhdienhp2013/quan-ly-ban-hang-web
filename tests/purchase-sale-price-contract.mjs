import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PURCHASE_DRAFT_VERSION,
  loadPurchaseDraft,
  parsePurchaseDraft,
  savePurchaseDraft,
} from '../src/modules/purchases/purchaseDraft.ts';

class MemoryStorage {
  #data = new Map();
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) { this.#data.delete(key); }
}

function draftLine(overrides = {}) {
  return { productId: 'p1', quantity: 2, unitCost: 60000, salePrice: 120000, ...overrides };
}

function draft(overrides = {}) {
  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId: 'sup-1',
    supplierName: 'NCC A',
    note: 'Giữ giá bán đang soạn',
    lines: [draftLine()],
    ...overrides,
  };
}

test('Purchase draft persists salePrice and keeps version 1 UID-scoped storage', () => {
  const storage = new MemoryStorage();
  const value = draft();
  assert.equal(PURCHASE_DRAFT_VERSION, 1);
  assert.equal(savePurchaseDraft('owner-a', value, storage), true);
  assert.deepEqual(loadPurchaseDraft('owner-a', storage), value);
  assert.equal(loadPurchaseDraft('owner-b', storage), null);
});

test('old Purchase draft without salePrice remains backward compatible', () => {
  const oldDraft = draft({ lines: [{ productId: 'p1', quantity: 2, unitCost: 60000 }] });
  const parsed = parsePurchaseDraft(JSON.stringify(oldDraft));
  assert.ok(parsed);
  assert.equal(parsed.lines[0].salePrice, undefined);
});

test('draft rejects negative/non-finite salePrice while allowing zero', () => {
  assert.equal(parsePurchaseDraft(JSON.stringify(draft({ lines: [draftLine({ salePrice: -1 })] }))), null);
  assert.deepEqual(parsePurchaseDraft(JSON.stringify(draft({ lines: [draftLine({ salePrice: 0 })] })))?.lines[0].salePrice, 0);
  assert.equal(parsePurchaseDraft(JSON.stringify(draft({ lines: [draftLine({ salePrice: null })] }))), null);
});

test('existing Product, scanner and Quick Add share selectProduct sale-price prefill', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /function selectProduct\(lineKey: string, product: Product\)[\s\S]*?unitCost: product\.costPrice,[\s\S]*?salePrice: product\.salePrice/);
  assert.match(editor, /selectProduct\(targetLineKey, match\.product\)/);
  assert.match(editor, /handleQuickProductCreated[\s\S]*?selectProduct\(targetLineKey, product\)/);
  assert.match(editor, /focusQuantity\(lineKey\)/);
});

test('old draft, copied Purchase and Excel handoff resolve missing salePrice from current Product catalog', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const excelDraft = fs.readFileSync('src/modules/purchases/purchaseExcelImportDraft.ts', 'utf8');
  assert.match(editor, /if \(typeof line\.salePrice === 'number' \|\| !line\.productId\) return line/);
  assert.match(editor, /const product = activeProductById\.get\(line\.productId\)/);
  assert.match(editor, /return \{ \.\.\.line, salePrice: product\.salePrice \}/);
  assert.doesNotMatch(excelDraft, /salePrice/);
});

test('sale-price input is labeled, numeric VND, editable and submit carries the transient value', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /<span className="purchase-mobile-label">Giá bán<\/span><input type="number" inputMode="numeric" min="0" step="1"/);
  assert.match(editor, /salePrice: line\.salePrice as number/);
  assert.match(editor, /Giá bán không hợp lệ\./);
  assert.match(editor, /!Number\.isFinite\(line\.salePrice\) \|\| line\.salePrice < 0/);
});

test('createPurchase validates salePrice and reuses the same commitStockOperation metadata update', () => {
  const service = fs.readFileSync('src/modules/purchases/purchaseService.ts', 'utf8');
  assert.match(service, /export interface PurchaseLineInput[\s\S]*?salePrice: number/);
  assert.match(service, /!Number\.isFinite\(item\.salePrice\) \|\| item\.salePrice < 0/);
  assert.match(service, /productFieldUpdates\[item\.productId\] = \{[\s\S]*?costPrice: item\.unitCost,[\s\S]*?salePrice: Math\.round\(input\.items\[index\]\.salePrice\)/);
  assert.match(service, /await commitStockOperation\(\{[\s\S]*?productFieldUpdates,[\s\S]*?extraUpdates: \{ \[`purchases\/\$\{id\}`\]: purchase \}/);
  assert.doesNotMatch(service, /updateProduct\s*\(/);
});

test('persisted PurchaseItem schema and createPurchase snapshot remain salePrice-free', () => {
  const models = fs.readFileSync('src/types/models.ts', 'utf8');
  const service = fs.readFileSync('src/modules/purchases/purchaseService.ts', 'utf8');
  const purchaseItem = models.slice(models.indexOf('export interface PurchaseItem'), models.indexOf('export interface Purchase {'));
  const itemMapping = service.slice(service.indexOf('const items: PurchaseItem[]'), service.indexOf('const purchase: Purchase'));
  assert.doesNotMatch(purchaseItem, /salePrice/);
  assert.doesNotMatch(itemMapping, /salePrice/);
});

test('cancelPurchase semantics do not roll back Product costPrice or salePrice', () => {
  const service = fs.readFileSync('src/modules/purchases/purchaseService.ts', 'utf8');
  const cancel = service.slice(service.indexOf('export async function cancelPurchase'), service.indexOf('export function subscribePurchases'));
  assert.doesNotMatch(cancel, /productFieldUpdates/);
  assert.doesNotMatch(cancel, /salePrice/);
  assert.match(cancel, /type: 'PURCHASE_RETURN'/);
});

test('draft/editor paths have no independent Product writer and Excel preview remains stock-safe', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const draftSource = fs.readFileSync('src/modules/purchases/purchaseDraft.ts', 'utf8');
  const excelDraft = fs.readFileSync('src/modules/purchases/purchaseExcelImportDraft.ts', 'utf8');
  const excelPanel = fs.readFileSync('src/modules/purchases/PurchaseExcelImportPanel.tsx', 'utf8');
  const combined = `${editor}\n${draftSource}\n${excelDraft}\n${excelPanel}`;
  assert.doesNotMatch(combined, /updateProduct\s*\(|commitStockOperation\s*\(|stockQuantity\s*=|stockVersion\s*=|increment\s*\(/);
});

test('responsive Purchase editor exposes six desktop columns and mobile sale-price label without page overflow contract regression', () => {
  const css = fs.readFileSync('src/modules/purchases/purchases.css', 'utf8');
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(css, /\.purchase-page\{display:grid;gap:18px;min-width:0\}/);
  assert.match(css, /\.purchase-editor-line\{display:grid;grid-template-columns:[^}]*44px/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(editor, /<span>Giá bán<\/span>/);
  assert.match(editor, /purchase-mobile-label">Giá bán/);
});
