import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { searchPurchaseProducts } from '../src/modules/purchases/purchaseProductSearch.ts';
import { getPurchaseActionCapabilities } from '../src/modules/purchases/purchaseManagementViewModel.ts';
import { findProductByScannedCode } from '../src/modules/qr/productLookup.ts';

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'SKU-ABC-01',
    name: 'Hộp nhựa đựng thực phẩm',
    barcode: '8931234567890',
    qrCode: 'QR-BOX-001',
    costPrice: 25000,
    salePrice: 32000,
    stockQuantity: 0,
    stockVersion: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('purchase product search supports name SKU barcode QR partial matching case-insensitively', () => {
  const target = product();
  for (const query of ['NHỰA ĐỰNG', 'sku-abc', '345678', 'qr-box']) {
    const result = searchPurchaseProducts([target], query);
    assert.equal(result[0]?.product.id, target.id, `query should match ${query}`);
  }
});

test('exact search priority is QR then barcode then SKU before other matches', () => {
  const rows = [
    product({ id: 'sku', sku: 'CODE', name: 'SKU result', barcode: undefined, qrCode: undefined }),
    product({ id: 'barcode', sku: 'B-1', name: 'Barcode result', barcode: 'CODE', qrCode: undefined }),
    product({ id: 'qr', sku: 'Q-1', name: 'QR result', barcode: undefined, qrCode: 'CODE' }),
    product({ id: 'name', sku: 'N-1', name: 'CODE', barcode: undefined, qrCode: undefined }),
  ];
  assert.deepEqual(searchPurchaseProducts(rows, 'code').map((item) => [item.product.id, item.rank]), [
    ['qr', 1],
    ['barcode', 2],
    ['sku', 3],
    ['name', 4],
  ]);
});

test('inactive products are excluded from dropdown search', () => {
  const inactive = product({ active: false });
  assert.equal(searchPurchaseProducts([inactive], 'nhựa').length, 0);
});

test('existing QR lookup exact-matches QR then barcode then SKU case-insensitively', () => {
  const rows = [
    product({ id: 'sku', sku: 'CODE', barcode: undefined, qrCode: undefined }),
    product({ id: 'barcode', sku: 'B-1', barcode: 'CODE', qrCode: undefined }),
    product({ id: 'qr', sku: 'Q-1', barcode: undefined, qrCode: 'CODE' }),
  ];
  const match = findProductByScannedCode(rows, ' code ');
  assert.equal(match?.product.id, 'qr');
  assert.equal(match?.field, 'qrCode');
});

test('Purchase editor removes Product select and reuses BarcodeScanner for the targeted line', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /<PurchaseProductPicker/);
  assert.doesNotMatch(editor, /<select value=\{line\.productId\}/);
  assert.match(editor, /import BarcodeScanner from '\.\.\/qr\/BarcodeScanner'/);
  assert.match(editor, /findProductByScannedCode/);
  assert.match(editor, /scanTargetLineKey === line\.key/);
  assert.match(editor, /selectProduct\(targetLineKey, match\.product\)/);
  assert.match(editor, /unitCost: product\.costPrice/);
  assert.match(editor, /historicalSku: undefined/);
  assert.match(editor, /historicalName: undefined/);
  assert.match(editor, /quantityInputRefs\.current\.get\(lineKey\)\?\.focus\(\)/);
  assert.match(editor, /Không tìm thấy sản phẩm có mã/);
  assert.match(editor, /Sản phẩm đã ngừng sử dụng/);
  assert.doesNotMatch(editor, /scannerService|startCameraScanner/);
});

test('hardware keyboard Enter exact lookup and keyboard navigation stay wired to picker', () => {
  const picker = fs.readFileSync('src/modules/purchases/PurchaseProductPicker.tsx', 'utf8');
  assert.match(picker, /event\.key === 'ArrowDown'/);
  assert.match(picker, /event\.key === 'ArrowUp'/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /event\.key !== 'Enter'/);
  assert.match(picker, /findProductByScannedCode\(\[\.\.\.products\], query\.trim\(\)\)/);
  assert.match(picker, /choose\(exact\.product\)/);
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /aria-label="Quét QR hoặc mã vạch"/);
  assert.match(picker, /role="alert"/);
});

test('completed Purchase exposes print while cancelled Purchase does not', () => {
  assert.equal(getPurchaseActionCapabilities('completed').print, true);
  assert.equal(getPurchaseActionCapabilities('cancelled').print, false);
  const detail = fs.readFileSync('src/modules/purchases/PurchaseDetailPanel.tsx', 'utf8');
  assert.match(detail, /actions\.print \? .*In tem mã \/ QR/s);
});

test('newly-created Purchase opens its detail and reuses existing printing handoff', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  assert.match(page, /const purchase = await createPurchase\(input, appUser\.uid\)/);
  assert.match(page, /setPendingOpenPurchaseId\(purchase\.id\)/);
  assert.match(page, /setSelectedPurchaseId\(pendingOpenPurchaseId\)/);
  assert.match(page, /navigate\('\/qr-printing'/);
  assert.match(page, /initialQuantities: buildPrintingInitialQuantities\(purchase\)/);
});

test('responsive search keeps input flexible, scan control 44px, and dropdown viewport-safe', () => {
  const css = fs.readFileSync('src/modules/purchases/purchaseProductSearch.css', 'utf8');
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 44px/);
  assert.match(css, /\.purchase-product-scan-button\{[^}]*width:44px[^}]*height:44px/);
  assert.match(css, /\.purchase-product-results\{[^}]*max-width:100%/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:1100px\)/);
});
