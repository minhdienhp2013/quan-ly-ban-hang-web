import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeSearchCode, normalizeSearchText } from '../src/shared/search/searchNormalization.ts';

const productSearchSourcePath = 'src/modules/purchases/purchaseProductSearch.ts';
const productSearchHarnessPath = 'src/modules/purchases/.purchaseProductSearch.node-test.ts';
let productSearchModule;
try {
  const productSearchSource = fs.readFileSync(productSearchSourcePath, 'utf8').replace(
    "from '../../shared/search/searchNormalization';",
    "from '../../shared/search/searchNormalization.ts';",
  );
  fs.writeFileSync(productSearchHarnessPath, productSearchSource);
  productSearchModule = await import(`../${productSearchHarnessPath}?test=${Date.now()}`);
} finally {
  if (fs.existsSync(productSearchHarnessPath)) fs.unlinkSync(productSearchHarnessPath);
}
const { searchPurchaseProducts } = productSearchModule;

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'TU2C-001',
    name: 'Tủ 2 cánh nhựa cocoplast',
    barcode: '893000000001',
    qrCode: 'QR-TU2C-001',
    costPrice: 125000,
    salePrice: 150000,
    stockQuantity: 0,
    stockVersion: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('Vietnamese smart search normalizes diacritics, spaces and compact forms', () => {
  const target = product();
  const queries = [
    'tủ 2 cánh nhựa cocoplast',
    'tu 2 canh nhua cocoplast',
    'tu2canhnhuacocoplast',
    'tủ 2c nhựa cocoplast',
    'tu2cnhuacocoplast',
    '2c cocoplast',
    '2 canh cocoplast',
  ];

  for (const query of queries) {
    const results = searchPurchaseProducts([target], query);
    assert.equal(results[0]?.product.id, target.id, `query should match: ${query}`);
  }
});

test('name separator normalization handles dash underscore dot slash and backslash', () => {
  const target = product({ name: 'Tủ 2 cánh nhựa' });
  for (const query of ['tu-2-canh-nhua', 'tu_2_canh_nhua', 'tu.2.canh.nhua', 'tu/2/canh/nhua', 'tu\\2\\canh\\nhua', 'tu2canhnhua']) {
    assert.equal(searchPurchaseProducts([target], query)[0]?.product.id, target.id);
  }
});

test('Nc built-in expansion is general and supports compact queries', () => {
  for (const number of [3, 4, 10]) {
    const forms = normalizeSearchText(`${number}c`);
    assert.equal(forms.expanded, `${number} canh`);
    assert.equal(forms.expandedCompact, `${number}canh`);
  }
  assert.equal(normalizeSearchText('tu3cnhua').expandedCompact, 'tu3canhnhua');
  assert.equal(normalizeSearchText('tu10cnhua').expandedCompact, 'tu10canhnhua');
});

test('Nc boundary does not reinterpret dimensions or ordinary c-prefixed number tokens', () => {
  assert.equal(normalizeSearchText('3c').expanded, '3 canh');
  assert.equal(normalizeSearchText('10c').expanded, '10 canh');
  assert.equal(normalizeSearchText('3canh').expandedCompact, '3canh');

  for (const literal of ['3cm', '10cm', '25cm', '3cc', '3cpu', '3camera']) {
    const forms = normalizeSearchText(literal);
    assert.equal(forms.expanded, literal, `${literal} must stay literal`);
    assert.equal(forms.expandedCompact, literal, `${literal} compact form must stay literal`);
  }

  const dimensionProduct = product({
    id: 'dimension',
    sku: 'THANH-3CM',
    name: 'Thanh nhựa 3cm',
    barcode: undefined,
    qrCode: undefined,
  });
  assert.equal(searchPurchaseProducts([dimensionProduct], '3c').length, 0);

  const cabinet = product({
    id: 'cabinet',
    sku: 'TU-3-CANH',
    name: 'Tủ 3 cánh nhựa',
    barcode: undefined,
    qrCode: undefined,
  });
  assert.equal(searchPurchaseProducts([cabinet], 'tu3cnhua')[0]?.product.id, cabinet.id);
  assert.equal(searchPurchaseProducts([cabinet], 'tu3cmnhua').length, 0);
});

test('future aliases are injected from outside and coexist with built-in Nc', () => {
  const aliases = { kt: 'kích thước', vp: 'văn phòng' };
  assert.equal(normalizeSearchText('kt 3c vp', aliases).expanded, 'kich thuoc 3 canh van phong');
});

test('code normalization preserves separators while remaining case-insensitive', () => {
  assert.equal(normalizeSearchCode(' QR-Ab_12/3 '), 'qr-ab_12/3');
  assert.equal(normalizeSearchCode('ABC123'), normalizeSearchCode('abc123'));
  assert.equal(normalizeSearchCode('QR-001'), normalizeSearchCode('qr-001'));
  assert.notEqual(normalizeSearchCode('QR-001'), normalizeSearchCode('QR001'));
});

test('ranking keeps exact QR then barcode then SKU ahead of exact/fuzzy names', () => {
  const products = [
    product({ id: 'name', sku: 'OTHER-1', name: 'CODE', barcode: undefined, qrCode: undefined }),
    product({ id: 'sku', sku: 'CODE', name: 'SKU product', barcode: undefined, qrCode: undefined }),
    product({ id: 'barcode', sku: 'OTHER-2', name: 'Barcode product', barcode: 'CODE', qrCode: undefined }),
    product({ id: 'qr', sku: 'OTHER-3', name: 'QR product', barcode: undefined, qrCode: 'CODE' }),
  ];
  const results = searchPurchaseProducts(products, 'code');
  assert.deepEqual(results.map((result) => [result.product.id, result.rank]), [
    ['qr', 1],
    ['barcode', 2],
    ['sku', 3],
    ['name', 4],
  ]);
});

test('search results exclude inactive products and are capped at 12', () => {
  const rows = Array.from({ length: 20 }, (_, index) => product({ id: `p-${index}`, sku: `SKU-${index}`, name: `Tủ nhựa ${index}` }));
  rows[0].active = false;
  const results = searchPurchaseProducts(rows, 'tu nhua', undefined, 99);
  assert.equal(results.length, 12);
  assert.equal(results.some((result) => result.product.id === rows[0].id), false);
});

test('Purchase editor replaces Product select with smart picker, camera and quick add', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const picker = fs.readFileSync('src/modules/purchases/PurchaseProductPicker.tsx', 'utf8');
  assert.match(editor, /<PurchaseProductPicker/);
  assert.doesNotMatch(editor, /<select value=\{line\.productId\}/);
  assert.match(picker, /type="search"/);
  assert.match(picker, /aria-label="Quét QR hoặc mã vạch"/);
  assert.match(picker, /aria-label="Thêm nhanh hàng hóa mới"/);
  assert.match(picker, /ArrowDown/);
  assert.match(picker, /ArrowUp/);
  assert.match(picker, /event\.key === 'Escape'/);
  assert.match(picker, /event\.key !== 'Enter'/);
  assert.match(picker, /findProductByScannedCode/);
});

test('camera scan reuses BarcodeScanner and exact QR product lookup without a new scanner engine', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /import BarcodeScanner from '\.\.\/qr\/BarcodeScanner'/);
  assert.match(editor, /findProductByScannedCode/);
  assert.match(editor, /<BarcodeScanner onScan=\{\(result\) => handleScan\(result\.value\)\}/);
  assert.match(editor, /Không tìm thấy sản phẩm có mã/);
  assert.match(editor, /Sản phẩm đã ngừng sử dụng/);
  assert.match(editor, /unitCost: product\.costPrice/);
  assert.doesNotMatch(editor, /scannerService|startCameraScanner/);
});

test('quick add duplicate checks share exact code normalization for SKU barcode and QR', () => {
  const quickAdd = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  assert.match(quickAdd, /import \{ normalizeSearchCode \} from '\.\.\/\.\.\/shared\/search\/searchNormalization'/);
  assert.match(quickAdd, /normalizeSearchCode\(product\.sku\) === normalizeSearchCode\(sku\)/);
  assert.match(quickAdd, /normalizeSearchCode\(product\.barcode\) === normalizeSearchCode\(barcode\)/);
  assert.match(quickAdd, /normalizeSearchCode\(product\.qrCode\) === normalizeSearchCode\(qrCode\)/);
  assert.equal(normalizeSearchCode('ABC123'), normalizeSearchCode('abc123'));
  assert.equal(normalizeSearchCode('QR-001'), normalizeSearchCode('qr-001'));
  assert.notEqual(normalizeSearchCode('QR-001'), normalizeSearchCode('QR001'));
});

test('quick add reuses Product create contract and auto-selects returned Product on the same line', () => {
  const quickAdd = fs.readFileSync('src/modules/purchases/PurchaseQuickAddProduct.tsx', 'utf8');
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(quickAdd, /createProduct\(toProductInput\(form\), actorUid\)/);
  assert.match(quickAdd, /onCreated\(created\)/);
  assert.doesNotMatch(quickAdd, /firebase\/database|\bref\(|\bupdate\(/);
  assert.match(editor, /handleQuickProductCreated/);
  assert.match(editor, /selectProduct\(targetLineKey, product\)/);
  assert.match(editor, /setCreatedProducts/);
  assert.match(editor, /unitCost: product\.costPrice/);
});

test('product picker closes results on outside pointer, focus exit, selection, escape, scan and quick add', () => {
  const picker = fs.readFileSync('src/modules/purchases/PurchaseProductPicker.tsx', 'utf8');
  assert.match(picker, /document\.addEventListener\('pointerdown', handleOutsidePointer\)/);
  assert.match(picker, /document\.removeEventListener\('pointerdown', handleOutsidePointer\)/);
  assert.match(picker, /onBlur=\{handlePickerBlur\}/);
  assert.match(picker, /event\.currentTarget\.contains\(nextTarget\)/);
  assert.match(picker, /function choose\(product: Product\) \{[\s\S]*?closeResults\(\);[\s\S]*?onSelect\(product\)/);
  assert.match(picker, /event\.key === 'Escape'[\s\S]*?closeResults\(\)/);
  assert.match(picker, /function handleScanRequest\(\) \{\s*closeResults\(\);\s*onScanRequest\(lineKey\)/);
  assert.match(picker, /function handleQuickAddRequest\(\) \{\s*closeResults\(\);\s*onQuickAddRequest\(lineKey, query\)/);
  assert.match(picker, /onClick=\{handleScanRequest\}/);
  assert.match(picker, /onClick=\{handleQuickAddRequest\}/);
});

test('ArrowDown opens a closed result list on the first result instead of skipping to the second', () => {
  const picker = fs.readFileSync('src/modules/purchases/PurchaseProductPicker.tsx', 'utf8');
  assert.match(picker, /if \(!open\) \{\s*setOpen\(true\);\s*setActiveIndex\(0\);\s*return;\s*\}/);
});

test('multiple Purchase lines use stable independent keys and cleanup scan/quick-add state on delete', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /key: nextLineKey\(\)/);
  assert.match(editor, /scanTargetLineKey === lineKey/);
  assert.match(editor, /quickAddTarget\?\.lineKey === lineKey/);
  assert.match(editor, /quantityInputRefs\.current\.delete\(lineKey\)/);
});

test('scanner and quick-add panels render beside the originating line and stay target-safe', () => {
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  assert.match(editor, /<Fragment key=\{line\.key\}>/);
  assert.match(editor, /scanTargetLineKey === line\.key \? \(/);
  assert.match(editor, /quickAddTarget\?\.lineKey === line\.key \? \(/);
  assert.match(editor, /className="purchase-editor-context-panel" ref=\{contextPanelRef\}/);
  assert.match(editor, /scrollIntoView\(\{ block: 'nearest', behavior: 'smooth' \}\)/);
  assert.match(editor, /const targetLineKey = scanTargetLineKey;[\s\S]*?selectProduct\(targetLineKey, match\.product\)/);
  assert.match(editor, /const targetLineKey = quickAddTarget\.lineKey;[\s\S]*?selectProduct\(targetLineKey, product\)/);
  assert.match(editor, /if \(scanTargetLineKey === lineKey\)[\s\S]*?setScanTargetLineKey\(null\)/);
  assert.match(editor, /if \(quickAddTarget\?\.lineKey === lineKey\) setQuickAddTarget\(null\)/);
});

test('after create the new Purchase is selected and completed detail exposes existing print handoff', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const detail = fs.readFileSync('src/modules/purchases/PurchaseDetailPanel.tsx', 'utf8');
  const viewModel = fs.readFileSync('src/modules/purchases/purchaseManagementViewModel.ts', 'utf8');
  assert.match(page, /const purchase = await createPurchase\(input, appUser\.uid\)/);
  assert.match(page, /setSelectedPurchaseId\(purchase\.id\)/);
  assert.match(page, /navigate\('\/qr-printing'/);
  assert.match(page, /initialQuantities: buildPrintingInitialQuantities\(purchase\)/);
  assert.match(detail, /actions\.print \? .*In tem mã \/ QR/s);
  assert.match(viewModel, /print: completed/);
});

test('responsive smart product row keeps search flexible, contextual panels visible and scan/plus at 44px', () => {
  const css = fs.readFileSync('src/modules/purchases/purchaseSmartProductSearch.css', 'utf8');
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 44px 44px/);
  assert.match(css, /\.purchase-product-icon-button\{[^}]*width:44px[^}]*height:44px/);
  assert.match(css, /\.purchase-product-results\{[^}]*max-width:100%/);
  assert.match(css, /\.purchase-editor-context-panel\{[^}]*min-width:0[^}]*scroll-margin-block:12px/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /@media\(max-width:1100px\)\{\.purchase-editor-product-field\{grid-column:1\/-1\}/);
});
