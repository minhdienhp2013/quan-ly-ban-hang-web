import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildProductPermanentDeletePreflight,
  findProductPermanentDeleteReferenceNodes,
  PRODUCT_PERMANENT_DELETE_REFERENCE_NODES,
  toStoredProductRecord,
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

function record(storageKey, overrides = {}) {
  return toStoredProductRecord(storageKey, product({ id: storageKey, ...overrides }));
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
  const selected = product({ stockQuantity: 2 });
  const result = buildProductPermanentDeletePreflight([selected], [record('p1', { stockQuantity: 2 })], emptyReferences());
  assert.equal(result.canDeleteAll, false);
  assert.equal(result.eligibleProducts.length, 0);
  assert.match(result.blockers[0].reasons.join(' '), /Còn tồn kho/);
});

test('stockVersion > 0 blocks permanent deletion while legacy missing version is zero', () => {
  const selected = product();
  const usedResult = buildProductPermanentDeletePreflight(
    [selected],
    [record('p1', { stockVersion: 1 })],
    emptyReferences(),
  );
  assert.equal(usedResult.canDeleteAll, false);
  assert.match(usedResult.blockers[0].reasons.join(' '), /stockVersion/);

  const legacyProduct = product();
  delete legacyProduct.stockVersion;
  const legacyRecord = toStoredProductRecord('p1', legacyProduct);
  const legacyResult = buildProductPermanentDeletePreflight([selected], [legacyRecord], emptyReferences());
  assert.equal(legacyResult.canDeleteAll, true);
});

test('any historical transaction/data reference blocks deletion', () => {
  const selected = product();
  const cases = {
    sales: { s1: { items: [{ productId: 'p1' }] } },
    purchases: { p1: { items: [{ productId: 'p1' }] } },
    stockOuts: { o1: { items: [{ productId: 'p1' }] } },
    stockMovements: { m1: { productId: 'p1' } },
    stocktakes: { t1: { items: [{ productId: 'p1' }] } },
  };

  for (const [node, value] of Object.entries(cases)) {
    const result = buildProductPermanentDeletePreflight(
      [selected],
      [record('p1')],
      emptyReferences({ [node]: value }),
    );
    assert.equal(result.canDeleteAll, false, `${node} must block`);
    assert.match(result.blockers[0].reasons.join(' '), /Đã có lịch sử giao dịch/);
  }
});

test('clean Product is deletable and mixed selection fails closed with delete NONE', () => {
  const clean = product({ id: 'clean', sku: 'CLEAN' });
  const blocked = product({ id: 'blocked', sku: 'BLOCKED', stockQuantity: 1 });

  const cleanResult = buildProductPermanentDeletePreflight([clean], [record('clean', { sku: 'CLEAN' })], emptyReferences());
  assert.equal(cleanResult.canDeleteAll, true);
  assert.deepEqual(cleanResult.eligibleProducts.map((item) => item.storageKey), ['clean']);

  const mixed = buildProductPermanentDeletePreflight(
    [clean, blocked],
    [record('clean', { sku: 'CLEAN' }), record('blocked', { sku: 'BLOCKED', stockQuantity: 1 })],
    emptyReferences(),
  );
  assert.equal(mixed.canDeleteAll, false);
  assert.equal(mixed.blockers.length, 1);
  assert.equal(mixed.eligibleProducts.length, 0);
});

test('mismatched stored Product.id and Firebase child key fails closed', () => {
  const selected = product({ id: 'A', sku: 'MALFORMED' });
  const malformed = toStoredProductRecord('A', product({ id: 'B', sku: 'MALFORMED' }));
  const result = buildProductPermanentDeletePreflight([selected], [malformed], emptyReferences());
  assert.equal(result.canDeleteAll, false);
  assert.match(result.blockers[0].reasons.join(' '), /Dữ liệu định danh sản phẩm không hợp lệ/);
});

test('foreign deletion lock blocks preflight while own lock is allowed for post-lock revalidation', () => {
  const selected = product();
  const locks = { p1: { productId: 'p1', actorUid: 'owner-a', createdAt: 1 } };
  const blocked = buildProductPermanentDeletePreflight([selected], [record('p1')], emptyReferences(), locks);
  assert.equal(blocked.canDeleteAll, false);
  assert.match(blocked.blockers[0].reasons.join(' '), /khóa/);

  const own = buildProductPermanentDeletePreflight(
    [selected],
    [record('p1')],
    emptyReferences(),
    locks,
    'owner-a',
  );
  assert.equal(own.canDeleteAll, true);
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

test('delete service acquires all locks, revalidates under lock, atomically deletes by storageKey and cleans locks', () => {
  const service = read('src/modules/products/productService.ts');
  const start = service.indexOf('export async function deleteProductsPermanently');
  const body = service.slice(start);
  assert.match(body, /readPermanentDeletePreflight\(selectedProducts\)/);
  assert.match(body, /deletionLockUpdates/);
  assert.match(body, /locksAcquired = true/);
  assert.match(body, /readPermanentDeletePreflight\(selectedProducts, actorUid\)/);
  assert.match(body, /const productKey = record\.storageKey/);
  assert.match(body, /updates\[`products\/\$\{productKey\}`\] = null/);
  assert.match(body, /updates\[`productDeletionLocks\/\$\{productKey\}`\] = null/);
  assert.match(body, /'PRODUCT_DELETED'/);
  assert.match(body, /await update\(ref\(database\), updates\)/);
  assert.match(body, /onDisconnect/);
  assert.match(body, /releaseDeletionLocks/);
  assert.doesNotMatch(body, /updates\[`(?:sales|purchases|stockOuts|stockMovements|stocktakes)\//);
});

test('focus stays deliberate for blocked/cancel/error and success moves to stable status', () => {
  const page = read('src/modules/products/ProductsPage.tsx');
  const bar = read('src/modules/products/GoodsBulkActionBar.tsx');
  assert.match(bar, /aria-disabled=\{busy\}/);
  const permanentButton = bar.slice(bar.indexOf('ref={permanentDeleteButtonRef}'));
  assert.doesNotMatch(permanentButton, /disabled=\{busy\}/);
  assert.match(page, /permanentDeleteButtonRef\.current\?\.focus\(\)/);
  assert.match(page, /setFocusStatusAfterDelete\(true\)/);
  assert.match(page, /statusRef\.current\?\.focus\(\)/);
  assert.match(page, /tabIndex=\{-1\}/);
});

test('mobile Product cards keep the existing semantic checkbox usable at 320-430', () => {
  const responsive = read('src/modules/products/GoodsResponsiveList.tsx');
  assert.match(responsive, /type="checkbox"/);
  assert.match(responsive, /onToggleProduct\(product\.id\)/);
  assert.match(responsive, /display: 'flex'/);
  assert.match(responsive, /width: 44/);
  assert.match(responsive, /height: 44/);
  assert.match(responsive, /gridTemplateColumns: 'auto minmax\(0,1fr\) auto'/);
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

test('Firebase rules gate permanent Product delete while global reset parent grant stays reset-only', () => {
  const rules = JSON.parse(read('database.rules.json')).rules;
  const parentProductWrite = rules.products['.write'];
  const productWrite = rules.products.$productId['.write'];
  const lockWrite = rules.productDeletionLocks.$productId['.write'];
  assert.match(parentProductWrite, /businessDataResetLock/);
  assert.match(parentProductWrite, /role'\)\.val\(\) === 'owner'/);
  assert.match(parentProductWrite, /!newData\.exists\(\)/);
  assert.match(productWrite, /!root\.child\('businessDataResetLock'\)\.exists\(\)/);
  assert.match(productWrite, /productDeletionLocks/);
  assert.match(productWrite, /actorUid'\)\.val\(\) === auth\.uid/);
  assert.match(productWrite, /stockQuantity/);
  assert.match(productWrite, /stockVersion/);
  assert.match(productWrite, /data\.child\('id'\)/);
  assert.match(lockWrite, /!root\.child\('businessDataResetLock'\)\.exists\(\)/);
  assert.match(lockWrite, /!data\.exists\(\)/);
  assert.match(lockWrite, /root\.child\('products'\)/);
  assert.match(lockWrite, /root\.child\('products'\).*child\('id'\)/);

  for (const node of ['sales', 'purchases', 'stockOuts', 'stocktakes']) {
    const validation = rules[node][`$${node === 'sales' ? 'saleId' : node === 'purchases' ? 'purchaseId' : node === 'stockOuts' ? 'stockOutId' : 'stocktakeId'}`].items.$itemId['.validate'];
    assert.match(validation, /productDeletionLocks/);
    assert.match(validation, /products/);
  }
  assert.match(rules.stockMovements.$movementId['.validate'], /productDeletionLocks/);
});

test('CI runs the actual Realtime Database Rules emulator suite', () => {
  const workflow = read('.github/workflows/ci.yml');
  const packageJson = JSON.parse(read('package.json'));
  assert.match(workflow, /Realtime Database Rules Emulator Test/);
  assert.match(workflow, /npm run test:rules/);
  assert.equal(packageJson.devDependencies['@firebase/rules-unit-testing'], '5.0.2');
  assert.equal(packageJson.devDependencies['firebase-tools'], '15.30.1');
  assert.match(packageJson.scripts['test:rules'], /firebase emulators:exec --only database/);
});
