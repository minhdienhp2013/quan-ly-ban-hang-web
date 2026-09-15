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

test('sale-price input has a persistent accessible name, numeric VND editing and transient submit value', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const css = fs.readFileSync('src/modules/purchases/purchases.css', 'utf8');
  const moneyInput = fs.readFileSync('src/shared/numeric/VndMoneyInput.tsx', 'utf8');
  const moneyCss = fs.readFileSync('src/shared/numeric/vndMoneyInput.css', 'utf8');
  assert.match(editor, /<VndMoneyInput label="Giá bán" labelClassName="purchase-mobile-label" value=\{line\.salePrice \?\? ''\}/);
  assert.match(moneyInput, /aria-label=\{accessibleName\}[\s\S]*?type="number"[\s\S]*?inputMode="numeric"[\s\S]*?min=\{min\}[\s\S]*?step="any"/);
  assert.match(css, /\.purchase-mobile-label\{display:none\}/);
  assert.match(moneyCss, /\.vnd-money-input \.vnd-money-input__field\{[^}]*min-height:44px/);
  assert.match(editor, /salePrice: line\.salePrice as number/);
  assert.match(editor, /Giá bán không hợp lệ\./);
  assert.match(editor, /!Number\.isFinite\(line\.salePrice\) \|\| line\.salePrice < 0/);
});

test('Purchase editor explains sale-price catalog side effect and names the desktop delete column', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /Giá bán bạn chỉnh tại đây chỉ cập nhật giá bán hiện tại của sản phẩm trong Hàng hóa sau khi phiếu nhập được hoàn tất thành công/);
  assert.match(editor, /trước khi hoàn tất, danh mục sản phẩm chưa thay đổi/);
  assert.match(editor, /<span>Sản phẩm<\/span><span>Số lượng<\/span><span>Giá nhập<\/span><span>Giá bán<\/span><span>Thành tiền<\/span><span>Xóa<\/span>/);
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

test('responsive Purchase editor reflows by actual editor width and preserves mobile/touch contracts', () => {
  const css = fs.readFileSync('src/modules/purchases/purchases.css', 'utf8');
  const smartCss = fs.readFileSync('src/modules/purchases/purchaseSmartProductSearch.css', 'utf8');
  const moneyCss = fs.readFileSync('src/shared/numeric/vndMoneyInput.css', 'utf8');
  const appCss = fs.readFileSync('src/styles.css', 'utf8');
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');

  assert.match(appCss, /\.workspace\s*\{[\s\S]*?grid-template-columns:\s*250px minmax\(0, 1fr\)/);
  assert.match(appCss, /@media \(max-width: 1050px\)[\s\S]*?grid-template-columns:\s*210px minmax\(0, 1fr\)/);
  assert.match(appCss, /\.page-content\s*\{[\s\S]*?max-width:\s*1500px;[\s\S]*?padding:\s*clamp\(22px, 4vw, 40px\)/);
  assert.match(css, /\.purchase-workspace\{[^}]*grid-template-columns:240px minmax\(0,1fr\)/);
  assert.match(css, /\.purchase-editor\{padding:18px;container-type:inline-size\}/);
  assert.match(css, /\.purchase-editor-line>\*\{min-width:0\}/);

  const medium = css.slice(css.indexOf('@container(max-width:900px)'), css.indexOf('@container(max-width:620px)'));
  assert.match(medium, /\.purchase-editor-line--header\{display:none\}/);
  assert.match(medium, /\.purchase-editor-line\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\) 44px\}/);
  assert.match(medium, /\.purchase-editor-product-field\{grid-column:1\/-1\}/);
  assert.match(medium, /\.purchase-mobile-label\{display:block/);

  const narrow = css.slice(css.indexOf('@container(max-width:620px)'), css.indexOf('@media(max-width:1100px)'));
  assert.match(narrow, /\.purchase-editor-line\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);

  const viewport1100 = css.slice(css.indexOf('@media(max-width:1100px)'), css.indexOf('@media(max-width:900px)'));
  assert.doesNotMatch(viewport1100, /\.purchase-editor-line\{grid-template-columns:/);

  const mobile430 = css.slice(css.indexOf('@media(max-width:430px)'));
  assert.match(mobile430, /\.purchase-editor-line\{grid-template-columns:1fr\}/);

  assert.match(smartCss, /\.purchase-product-picker-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 44px 44px/);
  assert.match(smartCss, /\.purchase-product-icon-button\{[^}]*width:44px;height:44px;min-width:44px/);
  assert.match(moneyCss, /\.vnd-money-input__steps\{[^}]*grid-template-columns:repeat\(2,minmax\(44px,1fr\)\)/);
  assert.match(moneyCss, /\.vnd-money-input__step\{[^}]*min-width:44px;min-height:44px/);

  const targetEditorWidths = {
    1366: 1366 - 250 - 80 - 240 - 14 - 36,
    1024: 1024 - 210 - 80 - 220 - 14 - 36,
    768: 768 - 210 - (768 * 0.04 * 2) - 36,
  };
  assert.ok(targetEditorWidths[1366] <= 900);
  assert.ok(targetEditorWidths[1024] <= 620);
  assert.ok(targetEditorWidths[768] <= 620);

  assert.match(editor, /<span>Giá bán<\/span>/);
  assert.match(editor, /<VndMoneyInput label="Giá bán" labelClassName="purchase-mobile-label"/);
});
