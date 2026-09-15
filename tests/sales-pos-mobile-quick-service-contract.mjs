import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  FIXED_SERVICE_TILES,
  getRecentSales,
  parseQuickServiceAmount,
} from '../src/modules/sales/salesPosUi.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function sale(id, createdAt) {
  return {
    id,
    code: `BH-${id}`,
    items: [{ productId: 'p1', sku: 'SKU1', name: 'Item', quantity: 1, unitPrice: 1000, costPrice: 500, lineTotal: 1000 }],
    subtotal: 1000,
    discount: 0,
    total: 1000,
    costTotal: 500,
    profit: 500,
    paymentMethod: 'cash',
    status: 'completed',
    createdBy: 'u1',
    createdAt,
    updatedAt: createdAt,
  };
}

test('six fixed service tiles are exact, ordered, and independent of Product/Category data', () => {
  assert.deepEqual(FIXED_SERVICE_TILES.map((item) => item.label), [
    'Photo',
    'In ấn',
    'Scan',
    'Vi tính',
    'Văn phòng phẩm',
    'Khác',
  ]);
  assert.equal(FIXED_SERVICE_TILES.length, 6);

  const helper = read('src/modules/sales/salesPosUi.ts');
  assert.doesNotMatch(helper, /subscribeProducts|Category|categoryId|firebase\/database/);
});

test('quick amount parser treats input as integer thousands and fails closed', () => {
  assert.deepEqual(parseQuickServiceAmount(''), { state: 'empty', amount: null, message: '' });
  assert.equal(parseQuickServiceAmount('5').amount, 5_000);
  assert.equal(parseQuickServiceAmount('99').amount, 99_000);
  assert.equal(parseQuickServiceAmount('199').amount, 199_000);
  assert.equal(parseQuickServiceAmount('1999').amount, 1_999_000);
  assert.equal(parseQuickServiceAmount(' 5 ').amount, 5_000);
  assert.equal(parseQuickServiceAmount('0').state, 'invalid');
  assert.equal(parseQuickServiceAmount('1.5').state, 'invalid');
  assert.equal(parseQuickServiceAmount('1,999').state, 'invalid');
  assert.equal(parseQuickServiceAmount('abc').state, 'invalid');
  assert.equal(parseQuickServiceAmount(String(Number.MAX_SAFE_INTEGER)).state, 'invalid');
});

test('recent shortcut is capped at four newest Sales', () => {
  const input = [sale('1', 1), sale('5', 5), sale('3', 3), sale('2', 2), sale('4', 4), sale('6', 6)];
  assert.deepEqual(getRecentSales(input, 99).map((item) => item.id), ['6', '5', '4', '3']);
  assert.deepEqual(getRecentSales(input, 2).map((item) => item.id), ['6', '5']);
});

test('POS reuses shared ranked Product search and shared camera scanner lookup', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  assert.match(page, /import \{ searchProducts \} from '\.\.\/\.\.\/shared\/search\/productSearch'/);
  assert.match(page, /import BarcodeScanner from '\.\.\/qr\/BarcodeScanner'/);
  assert.match(page, /findProductByScannedCode/);
  assert.match(page, /result\.kind === 'exact-qr'/);
  assert.match(page, /result\.kind === 'exact-barcode'/);
  assert.match(page, /result\.kind === 'exact-sku'/);
  assert.match(page, /<BarcodeScanner onScan=\{\(result\) => handleCameraScan\(result\.value\)\} \/>/);
});

test('cart keeps existing quantity and stock-safe Sale contracts', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  const service = read('src/modules/sales/salesService.ts');
  assert.match(page, /className="sales-qty-control"[\s\S]*?type="number"[\s\S]*?inputMode="numeric"[\s\S]*?min="1"[\s\S]*?step="1"/);
  assert.match(page, /setLineQuantity\(product, line\.quantity - 1\)/);
  assert.match(page, /setLineQuantity\(product, line\.quantity \+ 1\)/);
  assert.match(service, /commitStockOperation\(\{/);
  assert.match(service, /type: 'SALE'/);
  assert.doesNotMatch(page, /stockQuantity\s*=/);
  assert.doesNotMatch(page, /increment\(/);
});

test('discount remains absolute VND only and payment surface exposes cash plus bank transfer', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  assert.equal((page.match(/<VndMoneyInput/g) ?? []).length, 1);
  assert.match(page, /label="Giảm giá đơn \(VND\)"/);
  assert.match(page, /const payable = Math\.max\(0, subtotal - discount\)/);
  assert.doesNotMatch(page, />\s*%\s*</);
  assert.match(page, /handleCheckout\('cash'\)/);
  assert.match(page, /handleCheckout\('bank_transfer'\)/);
  assert.doesNotMatch(page, />Khác</);
});

test('local draft is explicitly device-local and no server draft is introduced', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  assert.match(page, /localStorage\.setItem\(DRAFT_STORAGE_KEY/);
  assert.match(page, /Lưu trên thiết bị này/);
  assert.match(page, /không đồng bộ sang thiết bị khác/);
  assert.doesNotMatch(page, /salesDrafts|draftSales|set\(ref\(/);
});

test('recent history is read-only and quick service state never enters createSale payload', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  assert.match(page, /setRecentSales\(getRecentSales\(next, 4\)\)/);
  const recentStart = page.indexOf('<section className="sales-recent-card"');
  const recentBlock = page.slice(recentStart);
  assert.ok(recentStart >= 0);
  assert.doesNotMatch(recentBlock, /reverseSale|remove\(ref|Xóa tất cả lịch sử|Xóa giao dịch/);
  assert.match(recentBlock, /Phase 1 chỉ xem/);

  const checkoutStart = page.indexOf('async function handleCheckout');
  const checkoutEnd = page.indexOf("if (view === 'history')", checkoutStart);
  const checkout = page.slice(checkoutStart, checkoutEnd);
  assert.doesNotMatch(checkout, /quickAmount|selectedService|QuickService/);
  assert.match(page, /chưa cộng vào hóa đơn và chưa ghi Firebase/);
});

test('responsive contract keeps services three columns and POS section avoids horizontal scrolling', () => {
  const css = read('src/modules/sales/sales.css');
  const posCss = css.slice(0, css.indexOf('/* Existing full Sales History view remains supported. */'));
  assert.match(posCss, /\.sales-service-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(posCss, /\.sales-service-grid\s*\{[^}]*grid-template-columns:\s*(?:1fr|repeat\(2)/);
  assert.doesNotMatch(posCss, /overflow-x:\s*auto/);
  for (const breakpoint of ['900px', '760px', '560px', '390px', '340px']) {
    assert.ok(css.includes(`max-width: ${breakpoint}`), `missing responsive breakpoint ${breakpoint}`);
  }
});

test('checkout buttons stay focusable during async processing and no fake invoice print action exists', () => {
  const page = read('src/modules/sales/SalesPage.tsx');
  assert.match(page, /sales-payment-button--cash[\s\S]*?aria-disabled=\{submitting/);
  assert.match(page, /sales-payment-button--bank[\s\S]*?aria-disabled=\{submitting/);
  assert.doesNotMatch(page, /sales-payment-button--cash[\s\S]{0,300}?disabled=\{/);
  assert.doesNotMatch(page, /In hóa đơn|window\.print\(/);
});
