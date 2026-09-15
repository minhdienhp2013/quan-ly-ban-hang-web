import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildProductPermanentDeletePreflight,
  findProductPermanentDeleteReferenceNodes,
  PRODUCT_PERMANENT_DELETE_REFERENCE_NODES,
} from '../src/modules/products/productPermanentDelete.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function product(overrides = {}) {
  return {
    id: 'p1',
    sku: 'SKU-1',
    name: 'Sản phẩm 1',
    costPrice: 1000,
    salePrice: 2000,
    stockQuantity: 0,
    stockVersion: 0,
    active: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function emptyReferences(overrides = {}) {
  return {
    sales: null,
    purchases: null,
    stockOuts: null,
    stockMovements: null,
    stocktakes: null,
    ...overrides,
  };
}

test('permanent delete traces the complete canonical Product reference set', () => {
  assert.deepEqual(PRODUCT_PERMANENT_DELETE_REFERENCE_NODES, [
    'sales',
    'purchases',
    'stockOuts',
    'stockMovements',
    'stocktakes',
  ]);

  const refs = emptyReferences({
    sales: { s1: { items: [{ productId: 'p1' }] } },
    purchases: { p: { items: { a: { productId: 'p1' } } } },
    stockOuts: { o: { items: [{ productId: 'p1' }] } },
    stockMovements: { m: { productId: 'p1' } },
    stocktakes: { t: { items: [{ productId: 'p1' }] } },
  });
  assert.deepEqual(findProductPermanentDeleteReferenceNodes('p1', refs), PRODUCT_PERMANENT_DELETE_REFERENCE_NODES);
});

test('stock > 0 blocks permanent deletion', () => {
  const p = product({ stockQuantity: 2 });
  const result = buildProductPermanentDeletePreflight([p], [p], emptyReferences());
  assert.equal(result.canDeleteAll, false);
  assert.equal(result.eligibleProducts.length, 0);
  assert.match(result.blockers[0].reasons.join(' '), /Còn tồn kho/);
});

test('stockVersion > 0 blocks permanent deletion while legacy missing version is zero', () => {
  const used = product({ stockVersion: 1 });
  const usedResult = buildProductPermanentDeletePreflight([used], [used], emptyReferences());
  assert.equal(usedResult.canDeleteAll, false);
  assert.match(usedResult.blockers[0].reasons.join(' '), /stockVersion/);

  const legacy = product();
  delete legacy.stockVersion;
  const legacyResult = buildProductPermanentDeletePreflight([legacy], [legacy], emptyReferences());
  assert.equal(legacyResult.canDeleteAll, true);
});

test('any historical transaction/data reference blocks deletion', () => {
  const p = product();
  const cases = {
    sales: { s1: { items: [{ productId: p.id }] } },
    purchases: { p1: { items: [{ productId: p.id }] } },
    stockOuts: { o1: { items: [{ productId: p.id }] } },
    stockMovements: { m1: { productId: p.id } },
    stocktakes: { t1: { items: [{ productId: p.id }] } },
  };

  for (const [node, value] of Object.entries(cases)) {
    const result = buildProductPermanentDeletePreflight([p], [p], emptyReferences({ [node]: value }));
    assert.equal(result.canDeleteAll, false, `${node} must block`);
    assert.match(result.blockers[0].reasons.join(' '), /Đã có lịch sử giao dịch/);
  }
});

test('clean Product is deletable and mixed selection fails closed with delete NONE', () => {
  const clean = product({ id: 'clean', sku: 'CLEAN' });
  const blocked = product({ id: 'blocked', sku: 'BLOCKED', stockQuantity: 1 });

  const cleanResult = buildProductPermanentDeletePreflight([clean], [clean], emptyReferences());
  assert.equal(cleanResult.canDeleteAll, true);
  assert.deepEqual(cleanResult.eligibleProducts.map((item) => item.id), ['clean']);

  const mixed = buildProductPermanentDeletePreflight([clean, blocked], [clean, blocked], emptyReferences());
  assert.equal(mixed.canDeleteAll, false);
  assert.equal(mixed.blockers.length, 1);
  assert.equal(mixed.eligibleProducts.length, 0);
});

test('owner-only bulk action, explicit confirmation and cancel-before-delete are wired in the Products page', () => {
  const page = read('src/modules/products/ProductsPage.tsx');
  const bar = read('src/modules/products/GoodsBulkActionBar.tsx');
  assert.match(page, /showPermanentDelete=\{appUser\?\.role === 'owner'\}/);
  assert.match(bar, /showPermanentDelete \? \(/);
  assert.match(bar, /Xóa vĩnh viễn đã chọn/);
  assert.match(bar, /color: '#b42318'/);

  const handlerStart = page.indexOf('async function handlePermanentDelete');
  const handlerEnd = page.indexOf('function printProducts', handlerStart);
  const handler = page.slice(handlerStart, handlerEnd);
  assert.match(handler, /appUser\?\.role !== 'owner'/);
  assert.match(handler, /Bạn đang xóa vĩnh viễn \$\{preflight\.selected\} sản phẩm/);
  assert.match(handler, /Thao tác này không thể hoàn tác/);
  assert.match(handler, /if \(!confirmed\) return/);
  assert.ok(handler.indexOf('if (!confirmed) return') < handler.indexOf('deleteProductsPermanently('));
});

test('preflight blockers are rendered with count, SKU/name and reasons', () => {
  const page = read('src/modules/products/ProductsPage.tsx');
  assert.match(page, /deleteBlockers\.length/);
  assert.match(page, /Không xóa sản phẩm nào/);
  assert.match(page, /blocker\.sku/);
  assert.match(page, /blocker\.name/);
  assert.match(page, /blocker\.reasons\.join/);
});

test('delete service revalidates, deletes Products atomically with per-Product audit, and never cascades history', () => {
  const service = read('src/modules/products/productService.ts');
  const start = service.indexOf('export async function deleteProductsPermanently');
  const body = service.slice(start);
  assert.match(body, /readPermanentDeletePreflight\(selectedProducts\)/);
  assert.match(body, /if \(!preflight\.canDeleteAll\) return \{ deleted: 0, preflight \}/);
  assert.match(body, /updates\[`products\/\$\{product\.id\}`\] = null/);
  assert.match(body, /'PRODUCT_DELETED'/);
  assert.match(body, /`Xóa vĩnh viễn sản phẩm \$\{product\.sku\} - \$\{product\.name\}`/);
  assert.match(body, /updates\[`auditLogs\/\$\{auditKey\}`\] = audit/);
  assert.match(body, /await update\(ref\(database\), updates\)/);
  assert.doesNotMatch(body, /updates\[`(?:sales|purchases|stockOuts|stockMovements|stocktakes)\//);
});

test('Product create/edit/active semantics remain present and Inventory CAS remains protected', () => {
  const service = read('src/modules/products/productService.ts');
  const inventory = read('src/modules/inventory/inventoryService.ts');
  assert.match(service, /export async function createProduct/);
  assert.match(service, /stockQuantity: 0/);
  assert.match(service, /stockVersion: 0/);
  assert.match(service, /export async function updateProduct/);
  assert.match(service, /export async function setProductActive/);
  assert.match(inventory, /planStockDelta/);
  assert.match(inventory, /products\/\$\{change\.productId\}\/stockVersion/);
  assert.match(inventory, /stockOperations\/\$\{operationId\}/);
});

test('Firebase Product rules preserve create/update/CAS and gate deletion to clean owner Products', () => {
  const rules = JSON.parse(read('database.rules.json'));
  const products = rules.rules.products;
  assert.equal(products['.write'], undefined, 'parent .write must not bypass child delete guard');
  const write = products.$productId['.write'];
  const validate = products.$productId['.validate'];

  assert.match(write, /active/);
  assert.match(write, /newData\.exists\(\)/, 'normal create/update remains allowed for active users');
  assert.match(write, /role'\)\.val\(\) === 'owner'/, 'staff deletion must be rejected');
  assert.match(write, /stockQuantity/);
  assert.match(write, /\.val\(\) === 0/);
  assert.match(write, /!data\.child\('stockVersion'\)\.exists\(\)/);
  assert.match(write, /data\.child\('stockVersion'\)\.val\(\) === 0/);

  assert.match(validate, /newData\.child\('stockQuantity'\)\.val\(\) === 0/);
  assert.match(validate, /newData\.child\('stockVersion'\)\.val\(\) === data\.child\('stockVersion'\)\.val\(\)/);
  assert.match(validate, /data\.child\('stockVersion'\)\.val\(\) \+ 1/);
});
