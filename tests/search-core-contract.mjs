import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  normalizeSearchCode,
  normalizeSearchText,
  prepareSearchCandidate,
  prepareSearchQuery,
} from '../src/shared/search/searchNormalization.ts';

const matchingSourcePath = 'src/shared/search/searchMatching.ts';
const matchingHarnessPath = 'src/shared/search/.searchMatching.node-test.ts';
const productSearchSourcePath = 'src/shared/search/productSearch.ts';
const productSearchHarnessPath = 'src/shared/search/.productSearch.node-test.ts';

let matchingModule;
let productSearchModule;
try {
  const matchingSource = fs.readFileSync(matchingSourcePath, 'utf8').replace(
    "from './searchNormalization';",
    "from './searchNormalization.ts';",
  );
  fs.writeFileSync(matchingHarnessPath, matchingSource);
  matchingModule = await import(`../${matchingHarnessPath}?test=${Date.now()}`);

  const productSearchSource = fs.readFileSync(productSearchSourcePath, 'utf8')
    .replaceAll("from './searchNormalization';", "from './searchNormalization.ts';");
  fs.writeFileSync(productSearchHarnessPath, productSearchSource);
  productSearchModule = await import(`../${productSearchHarnessPath}?test=${Date.now()}`);
} finally {
  if (fs.existsSync(matchingHarnessPath)) fs.unlinkSync(matchingHarnessPath);
  if (fs.existsSync(productSearchHarnessPath)) fs.unlinkSync(productSearchHarnessPath);
}

const { matchesSearchFields, prepareSharedSearchQuery, matchesPreparedSearchFields } = matchingModule;
const { searchProducts, DEFAULT_PRODUCT_SEARCH_LIMIT, MAX_PRODUCT_SEARCH_LIMIT } = productSearchModule;

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'TU3C-001',
    name: 'Tủ 3 cánh nhựa',
    barcode: '893000000001',
    qrCode: 'QR-TU3C-001',
    costPrice: 100000,
    salePrice: 150000,
    stockQuantity: 1,
    stockVersion: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test('query preparation normalizes Vietnamese text, separators and compact forms', () => {
  assert.equal(prepareSearchQuery('Tủ nhựa').expanded, 'tu nhua');
  assert.equal(prepareSearchQuery('Đệm').expanded, 'dem');
  assert.equal(prepareSearchQuery('Văn phòng phẩm').expanded, 'van phong pham');

  for (const query of ['tu-nhua', 'tu_nhua', 'tu.nhua', 'tu/nhua']) {
    assert.equal(prepareSearchQuery(query).expanded, 'tu nhua');
  }
  assert.equal(prepareSearchQuery('tu\\2\\canh').expanded, 'tu 2 canh');
  assert.equal(prepareSearchQuery('tu 3 canh nhua').expandedCompact, 'tu3canhnhua');
  assert.equal(prepareSearchQuery('tu3canhnhua').expandedCompact, 'tu3canhnhua');
});

test('Nc shorthand is aggressive for query but keeps dimension boundaries safe', () => {
  assert.equal(prepareSearchQuery('3c').expanded, '3 canh');
  assert.equal(prepareSearchQuery('10c').expanded, '10 canh');
  assert.equal(prepareSearchQuery('tu3cnhua').expandedCompact, 'tu3canhnhua');

  for (const literal of ['3cm', '10cm', '25cm', '3cc', '3cpu', '3camera', 'thanh3cm']) {
    const forms = prepareSearchQuery(literal);
    assert.equal(forms.expandedCompact, forms.compact, `${literal} must stay literal`);
  }
});

test('candidate preparation is conservative and never embedded-expands thanh3cm', () => {
  const candidate = prepareSearchCandidate('thanh3cm');
  assert.equal(candidate.normalized, 'thanh3cm');
  assert.equal(candidate.expandedCompact, 'thanh3cm');
  assert.doesNotMatch(candidate.expandedCompact, /3canh/);

  assert.equal(
    matchesSearchFields({ text: ['thanh3cm'] }, 'thanh3c'),
    false,
    'query thanh3c must not false-match candidate thanh3cm',
  );
});

test('custom aliases are query-only and match normalized candidate text', () => {
  const aliases = { kt: 'kích thước', vp: 'văn phòng phẩm' };
  assert.equal(prepareSearchQuery('kt vp', aliases).expanded, 'kich thuoc van phong pham');
  assert.equal(prepareSearchCandidate('kt vp').expanded, 'kt vp');
  assert.equal(matchesSearchFields({ text: ['Kích thước Văn phòng phẩm'] }, 'kt vp', aliases), true);
});

test('generic prepared matcher supports text and code fields without separator stripping', () => {
  const prepared = prepareSharedSearchQuery('QR-001');
  assert.equal(matchesPreparedSearchFields({ codes: ['qr-001'] }, prepared), true);
  assert.equal(matchesPreparedSearchFields({ codes: ['QR001'] }, prepared), false);
  assert.equal(matchesSearchFields({ text: ['Tủ nhựa'] }, 'tu nhua'), true);
  assert.equal(matchesSearchFields({ text: ['Tủ 3 cánh nhựa'] }, 'tu3cnhua'), true);
});

test('code normalization is trim/case-insensitive and preserves separators', () => {
  assert.equal(normalizeSearchCode(' QR-Ab_12/3.4 '), 'qr-ab_12/3.4');
  assert.equal(normalizeSearchCode('QR-001'), normalizeSearchCode('qr-001'));
  assert.notEqual(normalizeSearchCode('QR-001'), normalizeSearchCode('QR001'));
});

test('normalizeSearchText remains a backward-compatible query API', () => {
  assert.deepEqual(normalizeSearchText('Tủ 3c nhựa'), prepareSearchQuery('Tủ 3c nhựa'));
});

test('shared Product search preserves QR, barcode, SKU and exact-name ranking', () => {
  const rows = [
    product({ id: 'name', sku: 'OTHER-1', name: 'CODE', barcode: undefined, qrCode: undefined }),
    product({ id: 'sku', sku: 'CODE', name: 'SKU product', barcode: undefined, qrCode: undefined }),
    product({ id: 'barcode', sku: 'OTHER-2', name: 'Barcode product', barcode: 'CODE', qrCode: undefined }),
    product({ id: 'qr', sku: 'OTHER-3', name: 'QR product', barcode: undefined, qrCode: 'CODE' }),
  ];
  assert.deepEqual(searchProducts(rows, 'code').map((result) => [result.product.id, result.rank]), [
    ['qr', 1],
    ['barcode', 2],
    ['sku', 3],
    ['name', 4],
  ]);
});

test('shared Product search covers prefix, token and compact ranks', () => {
  const prefixCode = product({ id: 'code-prefix', sku: 'ABC-123', name: 'ZZZ' });
  assert.equal(searchProducts([prefixCode], 'abc')[0]?.rank, 5);

  const prefixName = product({ id: 'name-prefix', sku: 'ZZZ-1', name: 'Tủ nhựa cao cấp', barcode: undefined, qrCode: undefined });
  assert.equal(searchProducts([prefixName], 'tu nhua')[0]?.rank, 6);

  const tokenName = product({ id: 'name-token', sku: 'ZZZ-2', name: 'Tủ 3 cánh nhựa', barcode: undefined, qrCode: undefined });
  assert.equal(searchProducts([tokenName], 'nhua 3c')[0]?.rank, 7);

  const compactName = product({ id: 'name-compact', sku: 'ZZZ-3', name: 'Tủ 3 cánh nhựa', barcode: undefined, qrCode: undefined });
  assert.equal(searchProducts([compactName], 'tu3cnhua')[0]?.rank, 8);
});

test('caller controls eligibility instead of shared Product search hardcoding active-only', () => {
  const inactive = product({ id: 'inactive', active: false, sku: 'INACTIVE-1', name: 'Tủ nhựa' });
  assert.equal(searchProducts([inactive], 'tu nhua')[0]?.product.id, 'inactive');
  assert.equal(searchProducts([inactive].filter((item) => item.active), 'tu nhua').length, 0);
});

test('Product search tie-break is deterministic through SKU, name then id', () => {
  const rows = [
    product({ id: 'p-20', sku: 'SAME', name: 'Same', barcode: undefined, qrCode: undefined }),
    product({ id: 'p-3', sku: 'SAME', name: 'Same', barcode: undefined, qrCode: undefined }),
    product({ id: 'p-10', sku: 'SAME', name: 'Same', barcode: undefined, qrCode: undefined }),
  ];
  assert.deepEqual(searchProducts(rows, 'same').map((result) => result.product.id), ['p-3', 'p-10', 'p-20']);
});

test('Product autocomplete keeps default limit 10 and hard cap 12', () => {
  assert.equal(DEFAULT_PRODUCT_SEARCH_LIMIT, 10);
  assert.equal(MAX_PRODUCT_SEARCH_LIMIT, 12);
  const rows = Array.from({ length: 20 }, (_, index) => product({ id: `p-${index}`, sku: `SKU-${index}`, name: `Tủ nhựa ${index}` }));
  assert.equal(searchProducts(rows, 'tu nhua').length, 10);
  assert.equal(searchProducts(rows, 'tu nhua', { limit: 99 }).length, 12);
});

test('Product compact search does not false-match dimension candidate', () => {
  const dimension = product({ id: 'dimension', sku: 'THANH-3CM', name: 'thanh3cm', barcode: undefined, qrCode: undefined });
  assert.equal(searchProducts([dimension], 'thanh3c').length, 0);
});
