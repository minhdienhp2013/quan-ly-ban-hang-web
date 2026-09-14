import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const matchingSourcePath = 'src/shared/search/searchMatching.ts';
const matchingHarnessPath = 'src/shared/search/.searchMatching.products-test.ts';
const goodsSourcePath = 'src/modules/products/goodsViewModel.ts';
const goodsHarnessPath = 'src/modules/products/.goodsViewModel.node-test.ts';

let goodsModule;
try {
  const matchingSource = fs.readFileSync(matchingSourcePath, 'utf8').replace(
    "from './searchNormalization';",
    "from './searchNormalization.ts';",
  );
  fs.writeFileSync(matchingHarnessPath, matchingSource);

  const goodsSource = fs.readFileSync(goodsSourcePath, 'utf8').replace(
    "from '../../shared/search/searchMatching';",
    "from '../../shared/search/.searchMatching.products-test.ts';",
  );
  fs.writeFileSync(goodsHarnessPath, goodsSource);
  goodsModule = await import(`../${goodsHarnessPath}?test=${Date.now()}`);
} finally {
  if (fs.existsSync(goodsHarnessPath)) fs.unlinkSync(goodsHarnessPath);
  if (fs.existsSync(matchingHarnessPath)) fs.unlinkSync(matchingHarnessPath);
}

const { filterGoodsProducts } = goodsModule;

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'TU3C-001',
    name: 'Tủ 3 cánh nhựa',
    barcode: '893000000001',
    qrCode: 'QR-TU3C-001',
    costPrice: 100000,
    salePrice: 150000,
    stockQuantity: 8,
    stockVersion: 0,
    minStock: 3,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('Products goods search is wired to shared Search Core without local normalize/includes search', () => {
  const source = fs.readFileSync(goodsSourcePath, 'utf8');
  assert.match(source, /prepareSharedSearchQuery/);
  assert.match(source, /matchesPreparedSearchFields/);
  assert.match(source, /text: \[product\.name\]/);
  assert.match(source, /codes: \[product\.sku, product\.barcode, product\.qrCode\]/);
  assert.doesNotMatch(source, /normalizeGoodsSearch/);
  assert.doesNotMatch(source, /includes\(needle\)/);
});

test('Products search supports Vietnamese, no-space compact form and Nc shorthand', () => {
  const target = product();
  for (const query of ['Tủ 3 cánh nhựa', 'tu 3 canh nhua', 'tu3cnhua', '3c']) {
    const rows = filterGoodsProducts([target], query, 'all', 'all');
    assert.deepEqual(rows.map((item) => item.id), [target.id], `query should match: ${query}`);
  }
});

test('Products search keeps dimension-like 3cm separate from 3c shorthand', () => {
  const cabinet = product();
  const dimension = product({
    id: 'dimension',
    sku: 'THANH-DIM',
    name: 'Thanh nhựa 3cm',
    barcode: undefined,
    qrCode: undefined,
  });

  assert.equal(filterGoodsProducts([cabinet], '3cm', 'all', 'all').length, 0);
  assert.equal(filterGoodsProducts([dimension], '3c', 'all', 'all').length, 0);
  assert.deepEqual(filterGoodsProducts([dimension], '3cm', 'all', 'all').map((item) => item.id), ['dimension']);
});

test('Products code search is case-insensitive but separator-safe for QR/barcode/SKU', () => {
  const qr = product({ id: 'qr', sku: 'SKU-QR', name: 'Sản phẩm QR', barcode: undefined, qrCode: 'QR-001' });
  const barcode = product({ id: 'barcode', sku: 'SKU-BAR', name: 'Sản phẩm barcode', barcode: '893-001', qrCode: undefined });
  const sku = product({ id: 'sku', sku: 'ABC-001', name: 'Sản phẩm SKU', barcode: undefined, qrCode: undefined });

  assert.deepEqual(filterGoodsProducts([qr], 'qr-001', 'all', 'all').map((item) => item.id), ['qr']);
  assert.equal(filterGoodsProducts([qr], 'QR001', 'all', 'all').length, 0);
  assert.deepEqual(filterGoodsProducts([barcode], '893-001', 'all', 'all').map((item) => item.id), ['barcode']);
  assert.deepEqual(filterGoodsProducts([sku], 'abc-001', 'all', 'all').map((item) => item.id), ['sku']);
});

test('Products active and stock filters keep their previous semantics after shared search migration', () => {
  const active = product({ id: 'active', active: true, stockQuantity: 8 });
  const inactive = product({ id: 'inactive', active: false, stockQuantity: 8 });
  const out = product({ id: 'out', active: true, stockQuantity: 0 });
  const low = product({ id: 'low', active: true, stockQuantity: 2, minStock: 3 });
  const rows = [active, inactive, out, low];

  assert.deepEqual(filterGoodsProducts(rows, 'tu3cnhua', 'active', 'all').map((item) => item.id), ['active', 'out', 'low']);
  assert.deepEqual(filterGoodsProducts(rows, 'tu3cnhua', 'inactive', 'all').map((item) => item.id), ['inactive']);
  assert.deepEqual(filterGoodsProducts(rows, 'tu3cnhua', 'all', 'out').map((item) => item.id), ['out']);
  assert.deepEqual(filterGoodsProducts(rows, 'tu3cnhua', 'all', 'low').map((item) => item.id), ['low']);
  assert.deepEqual(filterGoodsProducts(rows, 'tu3cnhua', 'all', 'in-stock').map((item) => item.id), ['active']);
});

test('Enter exact lookup remains on the existing QR/barcode/SKU resolver', () => {
  const page = fs.readFileSync('src/modules/products/ProductsPage.tsx', 'utf8');
  const resolver = fs.readFileSync('src/modules/qr/productLookup.ts', 'utf8');

  assert.match(page, /findProductByScannedCode\(products, code\)/);
  assert.match(resolver, /const fields: ProductCodeField\[\] = \['qrCode', 'barcode', 'sku'\]/);
  assert.match(resolver, /normalize\(item\[field\]\) === target/);
});
