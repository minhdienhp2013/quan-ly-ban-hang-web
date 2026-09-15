import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PURCHASE_DRAFT_VERSION,
  guardPurchaseDraftReplacement,
  loadPurchaseDraft,
  savePurchaseDraft,
} from '../src/modules/purchases/purchaseDraft.ts';
import { resolvePurchaseModalFocusTarget } from '../src/modules/purchases/purchaseModalFocus.ts';

class MemoryStorage {
  constructor(events = []) {
    this.events = events;
    this.data = new Map();
  }

  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) {
    this.events.push('clear');
    this.data.delete(key);
  }
}

function meaningfulDraft(overrides = {}) {
  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId: 'sup-1',
    supplierName: 'Nhà cung cấp A',
    note: 'Giữ nguyên phiếu đang soạn',
    lines: [
      { productId: 'p1', quantity: 2, unitCost: 10000 },
      { productId: 'p2', quantity: 3, unitCost: 20000 },
    ],
    ...overrides,
  };
}

function nonMeaningfulDraft() {
  return {
    version: PURCHASE_DRAFT_VERSION,
    supplierId: '',
    supplierName: '',
    note: '',
    lines: [{ productId: '', quantity: 1, unitCost: 0 }],
  };
}

function attemptReplacement({ draft, confirmResult, source }) {
  const events = [];
  const storage = new MemoryStorage(events);
  const uid = 'owner-1';
  savePurchaseDraft(uid, draft, storage);
  events.length = 0;

  let session = 'current-draft';
  let confirmCalls = 0;
  const allowed = guardPurchaseDraftReplacement(uid, (message) => {
    confirmCalls += 1;
    events.push('confirm');
    assert.equal(message, 'Bỏ phiếu nhập đang soạn?');
    return confirmResult;
  }, storage);

  if (allowed) {
    events.push('replace');
    session = source ? `copy:${source}` : 'new';
  }

  return {
    allowed,
    events,
    session,
    confirmCalls,
    persisted: loadPurchaseDraft(uid, storage),
  };
}

test('A: meaningful draft -> new -> cancel keeps persisted draft and current editor session', () => {
  const original = meaningfulDraft();
  const result = attemptReplacement({ draft: original, confirmResult: false, source: null });
  assert.equal(result.allowed, false);
  assert.equal(result.session, 'current-draft');
  assert.equal(result.confirmCalls, 1);
  assert.deepEqual(result.events, ['confirm']);
  assert.deepEqual(result.persisted, original);
});

test('B: meaningful draft -> new -> confirm clears before opening new editor', () => {
  const result = attemptReplacement({ draft: meaningfulDraft(), confirmResult: true, source: null });
  assert.equal(result.allowed, true);
  assert.equal(result.session, 'new');
  assert.equal(result.persisted, null);
  assert.deepEqual(result.events, ['confirm', 'clear', 'replace']);
});

test('C: meaningful draft -> copy -> cancel keeps draft and does not open copy editor', () => {
  const original = meaningfulDraft({ note: 'Không được mất dữ liệu copy blocker' });
  const result = attemptReplacement({ draft: original, confirmResult: false, source: 'PUR-OLD' });
  assert.equal(result.allowed, false);
  assert.equal(result.session, 'current-draft');
  assert.deepEqual(result.events, ['confirm']);
  assert.deepEqual(result.persisted, original);
});

test('D: meaningful draft -> copy -> confirm clears before opening copied Purchase editor', () => {
  const result = attemptReplacement({ draft: meaningfulDraft(), confirmResult: true, source: 'PUR-OLD' });
  assert.equal(result.allowed, true);
  assert.equal(result.session, 'copy:PUR-OLD');
  assert.equal(result.persisted, null);
  assert.deepEqual(result.events, ['confirm', 'clear', 'replace']);
});

test('E: non-meaningful draft opens new/copy without an unnecessary discard warning', () => {
  const newResult = attemptReplacement({ draft: nonMeaningfulDraft(), confirmResult: false, source: null });
  assert.equal(newResult.allowed, true);
  assert.equal(newResult.confirmCalls, 0);
  assert.equal(newResult.session, 'new');
  assert.deepEqual(newResult.events, ['replace']);

  const copyResult = attemptReplacement({ draft: nonMeaningfulDraft(), confirmResult: false, source: 'PUR-OLD' });
  assert.equal(copyResult.allowed, true);
  assert.equal(copyResult.confirmCalls, 0);
  assert.equal(copyResult.session, 'copy:PUR-OLD');
  assert.deepEqual(copyResult.events, ['replace']);
});

test('PurchasesPage guards persisted draft before session replacement for both new and copy paths', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const openCreate = page.match(/function openCreate\(source: Purchase \| null = null\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  assert.match(openCreate, /guardPurchaseDraftReplacement\(uid/);
  assert.match(openCreate, /window\.confirm\(message\)/);
  assert.ok(openCreate.indexOf('guardPurchaseDraftReplacement') < openCreate.indexOf('setEditorSession'), 'guard/confirm must happen before session replacement');
  assert.match(page, /onCreate=\{\(\) => openCreate\(\)\}/);
  assert.match(page, /onCopy: \(purchase: Purchase\) => openCreate\(purchase\)/);
});

test('focus trap redirects Tab back inside when saving disabled the previously focused submit control', () => {
  assert.equal(resolvePurchaseModalFocusTarget({
    focusableCount: 3,
    activeIndex: -1,
    activeInsideDialog: false,
    shiftKey: false,
  }), 'first');

  assert.equal(resolvePurchaseModalFocusTarget({
    focusableCount: 3,
    activeIndex: -1,
    activeInsideDialog: false,
    shiftKey: true,
  }), 'last');

  assert.equal(resolvePurchaseModalFocusTarget({
    focusableCount: 2,
    activeIndex: -1,
    activeInsideDialog: true,
    shiftKey: false,
  }), 'first');
});

test('focus trap keeps boundary wrapping and dialog fallback when no controls remain focusable', () => {
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 0, activeIndex: -1, activeInsideDialog: false, shiftKey: false }), 'dialog');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 3, activeIndex: 0, activeInsideDialog: true, shiftKey: true }), 'last');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 3, activeIndex: 2, activeInsideDialog: true, shiftKey: false }), 'first');
  assert.equal(resolvePurchaseModalFocusTarget({ focusableCount: 3, activeIndex: 1, activeInsideDialog: true, shiftKey: false }), null);
});

test('modal wrapper uses the focus decision and preserves saving close protections', () => {
  const modal = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.match(modal, /resolvePurchaseModalFocusTarget/);
  assert.match(modal, /activeInsideDialog: Boolean\(activeElement && dialog\.contains\(activeElement\)\)/);
  assert.match(modal, /if \(!focusTarget\) return;\s*event\.preventDefault\(\)/);
  assert.match(modal, /focusTarget === 'dialog'[\s\S]*?dialog\.focus\(\)/);
  assert.match(modal, /focusTarget === 'first' \? focusable\[0\] : focusable\[focusable\.length - 1\]/);
  assert.match(modal, /if \(savingRef\.current\) return/);
  assert.match(modal, /if \(saving\) return;\s*onClose\(\)/);
  assert.match(modal, /disabled=\{saving\}>Đóng/);
});
