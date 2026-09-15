import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PURCHASE_DRAFT_VERSION,
  clearPurchaseDraft,
  getPurchaseDraftKey,
  guardPurchaseDraftReplacement,
  isMeaningfulPurchaseDraft,
  loadPurchaseDraft,
  parsePurchaseDraft,
  savePurchaseDraft,
} from '../src/modules/purchases/purchaseDraft.ts';
import { resolvePurchaseModalFocusTarget } from '../src/modules/purchases/purchaseModalFocus.ts';
import {
  createProductFormState,
  getProductFormValidationError,
  productFormToInput,
} from '../src/modules/products/productFormModel.ts';

class MemoryStorage {
  #data = new Map();
  constructor(trace = null) { this.trace = trace; }
  getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
  setItem(key, value) { this.#data.set(key, String(value)); }
  removeItem(key) {
    this.trace?.push('clear');
    this.#data.delete(key);
  }
}

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'SKU-001',
    name: 'Sản phẩm mẫu',
    barcode: 'BAR-001',
    qrCode: 'QR-001',
    unit: 'Cái',
    costPrice: 10000,
    salePrice: 15000,
    stockQuantity: 0,
    stockVersion: 0,
    minStock: 2,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId: 'sup-1',
    supplierName: 'Nhà cung cấp A',
    note: 'Giao buổi sáng',
    lines: [
      { productId: 'p1', quantity: 2, unitCost: 10000 },
      { productId: '', quantity: 3, unitCost: 22000, historicalSku: 'OLD-2', historicalName: 'Hàng cũ' },
      { productId: 'p3', quantity: 4.5, unitCost: 33000 },
    ],
    ...overrides,
  };
}

function emptyDraft() {
  return draft({
    supplierId: '',
    supplierName: '',
    note: '',
    lines: [{ productId: '', quantity: 1, unitCost: 0 }],
  });
}

function simulateEditorReplacement({ confirmValue, source = null, value = draft() }) {
  const trace = [];
  const storage = new MemoryStorage(trace);
  const uid = 'user-a';
  const originalSession = { kind: 'current', source: null };
  let session = originalSession;
  let confirmCalls = 0;
  savePurchaseDraft(uid, value, storage);

  const allowed = guardPurchaseDraftReplacement(uid, (message) => {
    confirmCalls += 1;
    trace.push('confirm');
    assert.equal(message, 'Bỏ phiếu nhập đang soạn?');
    return confirmValue;
  }, storage);

  if (allowed) {
    trace.push(source ? 'replace-copy' : 'replace-new');
    session = { kind: source ? 'copy' : 'new', source };
  }

  return { allowed, confirmCalls, originalSession, session, storage, trace, uid };
}

test('purchase draft key/version are UID-scoped and roundtrip all required fields', () => {
  const storage = new MemoryStorage();
  const value = draft();
  assert.equal(PURCHASE_DRAFT_VERSION, 1);
  assert.equal(getPurchaseDraftKey('user-a'), 'purchaseDraft:v1:user-a');
  assert.equal(savePurchaseDraft('user-a', value, storage), true);
  assert.deepEqual(loadPurchaseDraft('user-a', storage), value);
  assert.equal(loadPurchaseDraft('user-b', storage), null);
});

test('draft storage isolates users and clear removes only the requested UID', () => {
  const storage = new MemoryStorage();
  savePurchaseDraft('user-a', draft({ note: 'A' }), storage);
  savePurchaseDraft('user-b', draft({ note: 'B' }), storage);
  assert.equal(clearPurchaseDraft('user-a', storage), true);
  assert.equal(loadPurchaseDraft('user-a', storage), null);
  assert.equal(loadPurchaseDraft('user-b', storage)?.note, 'B');
});

test('corrupt, wrong-version and invalid numeric drafts fail safe', () => {
  assert.equal(parsePurchaseDraft('{broken'), null);
  assert.equal(parsePurchaseDraft(JSON.stringify({ ...draft(), version: 2 })), null);
  assert.equal(parsePurchaseDraft(JSON.stringify({ ...draft(), lines: [{ productId: 'p1', quantity: null, unitCost: 1 }] })), null);
  assert.equal(parsePurchaseDraft(JSON.stringify({ ...draft(), lines: [{ productId: 'p1', quantity: -1, unitCost: 1 }] })), null);
  assert.equal(parsePurchaseDraft(JSON.stringify({ ...draft(), lines: [] })), null);
});

test('meaningful draft distinguishes untouched editor defaults from user work', () => {
  const empty = emptyDraft();
  assert.equal(isMeaningfulPurchaseDraft(empty), false);
  assert.equal(isMeaningfulPurchaseDraft({ ...empty, note: 'ghi chú' }), true);
  assert.equal(isMeaningfulPurchaseDraft({ ...empty, lines: [{ productId: '', quantity: 2, unitCost: 0 }] }), true);
  assert.equal(isMeaningfulPurchaseDraft({ ...empty, lines: [{ productId: '', quantity: 1, unitCost: 0 }, { productId: '', quantity: 1, unitCost: 0 }] }), true);
});

test('blocker 1A: meaningful draft + new + cancel keeps draft and editor session unchanged', () => {
  const result = simulateEditorReplacement({ confirmValue: false });
  assert.equal(result.allowed, false);
  assert.equal(result.confirmCalls, 1);
  assert.strictEqual(result.session, result.originalSession);
  assert.deepEqual(loadPurchaseDraft(result.uid, result.storage), draft());
  assert.deepEqual(result.trace, ['confirm']);
});

test('blocker 1B: meaningful draft + new + confirm clears before opening the new editor', () => {
  const result = simulateEditorReplacement({ confirmValue: true });
  assert.equal(result.allowed, true);
  assert.equal(loadPurchaseDraft(result.uid, result.storage), null);
  assert.equal(result.session.kind, 'new');
  assert.deepEqual(result.trace, ['confirm', 'clear', 'replace-new']);
});

test('blocker 1C: meaningful draft + copy + cancel keeps draft and does not open copy editor', () => {
  const source = { id: 'purchase-old' };
  const result = simulateEditorReplacement({ confirmValue: false, source });
  assert.equal(result.allowed, false);
  assert.strictEqual(result.session, result.originalSession);
  assert.deepEqual(loadPurchaseDraft(result.uid, result.storage), draft());
  assert.deepEqual(result.trace, ['confirm']);
});

test('blocker 1D: meaningful draft + copy + confirm clears before opening copy editor', () => {
  const source = { id: 'purchase-old' };
  const result = simulateEditorReplacement({ confirmValue: true, source });
  assert.equal(result.allowed, true);
  assert.equal(loadPurchaseDraft(result.uid, result.storage), null);
  assert.equal(result.session.kind, 'copy');
  assert.strictEqual(result.session.source, source);
  assert.deepEqual(result.trace, ['confirm', 'clear', 'replace-copy']);
});

test('blocker 1E: non-meaningful draft opens new/copy without an unnecessary discard warning', () => {
  const nextNew = simulateEditorReplacement({ confirmValue: false, value: emptyDraft() });
  assert.equal(nextNew.allowed, true);
  assert.equal(nextNew.confirmCalls, 0);
  assert.equal(nextNew.session.kind, 'new');
  assert.deepEqual(nextNew.trace, ['replace-new']);

  const source = { id: 'purchase-old' };
  const nextCopy = simulateEditorReplacement({ confirmValue: false, source, value: emptyDraft() });
  assert.equal(nextCopy.allowed, true);
  assert.equal(nextCopy.confirmCalls, 0);
  assert.equal(nextCopy.session.kind, 'copy');
  assert.deepEqual(nextCopy.trace, ['replace-copy']);
});

test('PurchasesPage guards persisted draft before any editor session replacement for both new and copy paths', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const openCreate = page.slice(page.indexOf('function openCreate('), page.indexOf('async function handleCreate('));
  const guardIndex = openCreate.indexOf('guardPurchaseDraftReplacement');
  const replaceIndex = openCreate.indexOf('setEditorSession');
  assert.ok(guardIndex >= 0, 'openCreate must guard persisted draft');
  assert.ok(replaceIndex > guardIndex, 'draft confirmation/clear must occur before editor replacement');
  assert.match(openCreate, /if \(uid && !guardPurchaseDraftReplacement\(uid, \(message\) => window\.confirm\(message\)\)\) return;/);
  assert.match(page, /onCreate=\{\(\) => openCreate\(\)\}/);
  assert.match(page, /onCopy: \(purchase: Purchase\) => openCreate\(purchase\)/);
});

test('shared Product form keeps duplicate SKU/barcode/QR, minStock and active validation/mapping', () => {
  const existing = product();
  assert.match(getProductFormValidationError(createProductFormState({ sku: ' sku-001 ', name: 'X' }), [existing]), /SKU/);
  assert.match(getProductFormValidationError(createProductFormState({ sku: 'SKU-2', name: 'X', barcode: 'BAR-001' }), [existing]), /Barcode/);
  assert.match(getProductFormValidationError(createProductFormState({ sku: 'SKU-2', name: 'X', qrCode: 'QR-001' }), [existing]), /Mã QR/);
  assert.match(getProductFormValidationError(createProductFormState({ sku: 'SKU-2', name: 'X', minStock: '-1' }), []), /Tồn tối thiểu/);
  const input = productFormToInput(createProductFormState({ sku: 'SKU-2', name: 'X', minStock: '5', active: false }));
  assert.equal(input.minStock, 5);
  assert.equal(input.active, false);
});

test('Purchase quick add is a true modal wrapper around shared ProductEditorForm only', () => {
  const quick = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.match(quick, /import ProductEditorForm from '\.\.\/products\/ProductEditorForm'/);
  assert.match(quick, /<ProductEditorForm/);
  assert.match(quick, /mode="create"/);
  assert.match(quick, /initialValues=\{initialValues\}/);
  assert.match(quick, /products=\{products\}/);
  assert.match(quick, /createProduct\(input, actorUid\)/);
  assert.match(quick, /className="purchase-product-modal-backdrop"/);
  assert.match(quick, /role="dialog"/);
  assert.match(quick, /aria-modal="true"/);
  assert.match(quick, />Thêm sản phẩm mới</);
  assert.match(quick, /event\.target === event\.currentTarget/);
  assert.doesNotMatch(quick, /useNavigate|navigate\(/);
  assert.doesNotMatch(quick, /QuickProductForm|getQuickAddProductValidationError|toProductInput|productFormToInput|getProductFormValidationError/);
});

test('blocker 2: modal focus decision re-enters dialog after saving disables the focused control', () => {
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: -1, activeInsideDialog: false, shiftKey: false }), 'first');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: -1, activeInsideDialog: false, shiftKey: true }), 'last');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: -1, activeInsideDialog: true, shiftKey: false }), 'first');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: -1, activeInsideDialog: true, shiftKey: true }), 'last');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 0, activeIndex: -1, activeInsideDialog: false, shiftKey: false }), 'dialog');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: 0, activeInsideDialog: true, shiftKey: true }), 'last');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: 1, activeInsideDialog: true, shiftKey: false }), 'first');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 2, activeIndex: 0, activeInsideDialog: true, shiftKey: false }), null);
});

test('modal integrates focus trap decision, Escape respects saving, and background cannot receive trapped Tab', () => {
  const quick = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.match(quick, /event\.key === 'Escape'/);
  assert.match(quick, /if \(savingRef\.current\) return/);
  assert.match(quick, /event\.key !== 'Tab'/);
  assert.match(quick, /resolvePurchaseModalFocusTarget/);
  assert.match(quick, /activeInsideDialog: Boolean\(activeElement && dialog\.contains\(activeElement\)\)/);
  assert.match(quick, /const activeIndex = activeElement \? focusable\.indexOf\(activeElement as HTMLElement\) : -1/);
  assert.match(quick, /if \(!focusTarget\) return;\s*event\.preventDefault\(\)/);
  assert.match(quick, /focusTarget === 'dialog'/);
  assert.match(quick, /focusTarget === 'first' \? focusable\[0\] : focusable\[focusable\.length - 1\]/);
  assert.match(quick, /error=\{error\}/);
  assert.match(quick, /onCancel=\{requestClose\}/);
  assert.match(quick, /disabled=\{saving\}>Đóng/);
  const shared = fs.readFileSync('src/modules/products/ProductEditorForm.tsx', 'utf8');
  assert.match(shared, /role="alert"/);
  assert.match(shared, /saving \? 'Đang lưu\.\.\.'/);
});

test('prefill, local availability, exact line auto-select and quantity focus preserve Purchase state', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /initialName: query\.trim\(\)/);
  assert.match(editor, /initialName=\{quickAddTarget\.initialName\}/);
  assert.match(editor, /setCreatedProducts\(\(current\)/);
  assert.match(editor, /const targetLineKey = quickAddTarget\.lineKey/);
  assert.match(editor, /selectProduct\(targetLineKey, product\)/);
  assert.match(editor, /productId: product\.id/);
  assert.match(editor, /unitCost: product\.costPrice/);
  assert.match(editor, /historicalSku: undefined/);
  assert.match(editor, /historicalName: undefined/);
  assert.match(editor, /focusQuantity\(lineKey\)/);
  assert.match(editor, /supplierId,\s*supplierName,\s*note,\s*lines:/s);
});

test('modal cancel returns focus to exact originating plus button while create success focuses quantity', () => {
  const picker = fs.readFileSync('src/modules/purchases/PurchaseProductPicker.tsx', 'utf8');
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(picker, /onQuickAddRequest\(lineKey, query, opener\)/);
  assert.match(picker, /handleQuickAddRequest\(event\.currentTarget\)/);
  assert.match(editor, /opener: HTMLButtonElement/);
  assert.match(editor, /if \(restoreFocus && opener\?\.isConnected\) requestAnimationFrame\(\(\) => opener\.focus\(\)\)/);
  assert.match(editor, /onClose=\{\(\) => closeQuickAdd\(true\)\}/);
  assert.match(editor, /setQuickAddTarget\(null\);\s*selectProduct\(targetLineKey, product\)/);
});

test('draft persists editor data, restores by UID, and create/discard are the only clear paths', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  assert.match(editor, /savePurchaseDraft\(actorUid, currentDraft\)/);
  assert.match(editor, /window\.confirm\('Bỏ phiếu nhập đang soạn\?'\)/);
  assert.match(editor, /clearPurchaseDraft\(actorUid\);\s*onClose\(\)/);
  assert.match(page, /const draft = loadPurchaseDraft\(uid\)/);
  assert.match(page, /source: null, draft/);
  assert.match(page, /const purchase = await createPurchase\(input, appUser\.uid\);\s*clearPurchaseDraft\(appUser\.uid\)/);
  assert.match(page, /return \(\) => \{\s*unsubPurchases\?\.\(\);\s*unsubProducts\?\.\(\);\s*unsubSuppliers\?\.\(\);\s*\};/);
  const quick = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.doesNotMatch(quick, /clearPurchaseDraft|savePurchaseDraft/);
});

test('draft restore helper is storage-only and cannot create Purchase or mutate stock/CAS', () => {
  const source = fs.readFileSync('src/modules/purchases/purchaseDraft.ts', 'utf8');
  assert.doesNotMatch(source, /createPurchase|commitStockOperation|stockQuantity|stockVersion|firebase\/database/);
  assert.match(source, /sessionStorage/);
});

test('Product creation remains shared Products write with initial stock/version zero only', () => {
  const service = fs.readFileSync('src/modules/products/productService.ts', 'utf8');
  assert.match(service, /stockQuantity:\s*0/);
  assert.match(service, /stockVersion:\s*0/);
  assert.match(service, /\[`products\/\$\{productKey\}`\]: product/);
  const quick = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.doesNotMatch(quick, /stockQuantity|stockVersion|commitStockOperation/);
});

test('modal CSS is desktop-compact, mobile viewport-safe and keeps important touch targets at 44px', () => {
  const css = fs.readFileSync('src/modules/purchases/purchaseSmartProductSearch.css', 'utf8');
  assert.match(css, /\.purchase-product-modal-backdrop\{[^}]*position:fixed[^}]*inset:0[^}]*background:rgba/);
  assert.match(css, /\.purchase-product-modal\{[^}]*width:min\(940px,100%\)[^}]*max-height:calc\(100dvh - 48px\)[^}]*overflow:auto/);
  assert.match(css, /\.purchase-product-modal \.purchase-touch,\.purchase-product-modal \.goods-touch\{min-height:44px\}/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*?\.purchase-product-modal\{[^}]*width:100%[^}]*min-height:100dvh[^}]*max-height:100dvh/);
  assert.match(css, /@media\(max-width:430px\)/);
});
