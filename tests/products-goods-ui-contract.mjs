import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('goods KPI keeps low-stock and out-of-stock mutually exclusive', () => {
  const source = read('src/modules/products/goodsViewModel.ts');
  const start = source.indexOf('export function computeGoodsStats');
  const body = source.slice(start);
  assert.match(body, /stockQuantity\) > 0/);
  assert.match(body, /stockQuantity\) <= 0/);
  assert.match(body, /typeof product\.minStock === 'number'/);
});

test('goods search covers name, sku, barcode and qr and Enter reuses exact resolver', () => {
  const viewModel = read('src/modules/products/goodsViewModel.ts');
  const page = read('src/modules/products/ProductsPage.tsx');
  assert.match(viewModel, /product\.name/);
  assert.match(viewModel, /product\.sku/);
  assert.match(viewModel, /product\.barcode/);
  assert.match(viewModel, /product\.qrCode/);
  assert.match(page, /findProductByScannedCode\(products, code\)/);
  assert.doesNotMatch(page, /createSale|addProduct|handleCheckout|pendingSaleId/);
});

test('goods camera reuses BarcodeScanner and product resolver', () => {
  const source = read('src/modules/products/ProductScanDialog.tsx');
  assert.match(source, /BarcodeScanner/);
  assert.match(source, /findProductByScannedCode/);
  assert.doesNotMatch(source, /getUserMedia|BarcodeDetector|BrowserMultiFormatReader/);
});

test('selection is independent from filteredProducts and batch print defaults to one label per product', () => {
  const source = read('src/modules/products/ProductsPage.tsx');
  assert.match(source, /selectedProductIds/);
  assert.match(source, /filteredProducts\.every/);
  assert.match(source, /Object\.fromEntries\(targetProducts\.map\(\(product\) => \[product\.id, 1\]\)\)/);
  assert.match(source, /state: \{ initialQuantities, source: 'products' \}/);
});

test('products UI never directly writes protected stock paths', () => {
  const files = [
    'src/modules/products/ProductsPage.tsx',
    'src/modules/products/GoodsTable.tsx',
    'src/modules/products/GoodsResponsiveList.tsx',
    'src/modules/products/ProductDetail.tsx',
  ].map(read).join('\n');
  assert.doesNotMatch(files, /stockQuantity\s*:/);
  assert.doesNotMatch(files, /stockVersion\s*:/);
  assert.doesNotMatch(files, /stockMovements\//);
  assert.doesNotMatch(files, /stockOperations\//);
  assert.doesNotMatch(files, /increment\s*\(/);
});

test('goods detail reuses QR and barcode graphics and labels cost conservatively', () => {
  const source = read('src/modules/products/ProductDetail.tsx');
  assert.match(source, /QrGraphic/);
  assert.match(source, /BarcodeGraphic/);
  assert.match(source, /Giá vốn hiện tại/);
  assert.doesNotMatch(source, /Giá vốn bình quân/);
});

test('menu label is Hàng hóa while route remains products', () => {
  const source = read('src/layout/AppLayout.tsx');
  assert.match(source, /\{ to: '\/products', label: 'Hàng hóa' \}/);
});

test('responsive goods layout has tablet cards and mobile single-column cards without page table scaling', () => {
  const source = read('src/modules/products/products.css');
  assert.match(source, /@media\(max-width:980px\)/);
  assert.match(source, /\.goods-desktop-table\{display:none/);
  assert.match(source, /\.goods-responsive-list\{display:grid/);
  assert.match(source, /@media\(max-width:700px\)/);
  assert.match(source, /\.goods-responsive-list\{grid-template-columns:1fr/);
  assert.match(source, /\.goods-touch\{min-height:44px/);
});
