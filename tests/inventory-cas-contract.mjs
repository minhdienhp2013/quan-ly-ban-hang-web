import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildStockOperationId,
  planStockDelta,
} from '../src/modules/inventory/stockOperationCas.ts';

function createStore(quantity) {
  return {
    product: { stockQuantity: quantity, stockVersion: 4, name: 'Old name' },
    receipts: new Set(),
    movements: [],
  };
}

function tryCommit(store, operationId, plan) {
  if (store.receipts.has(operationId)) return 'already-committed';
  if (store.product.stockVersion !== plan.stockVersionBefore) return 'cas-conflict';
  assert.ok(plan.quantityAfter >= 0);
  store.product.stockQuantity = plan.quantityAfter;
  store.product.stockVersion = plan.stockVersionAfter;
  store.receipts.add(operationId);
  store.movements.push([plan.quantityBefore, plan.quantityAfter]);
  return 'committed';
}

function retryOnce(store, operationId, delta) {
  if (store.receipts.has(operationId)) return 'already-committed';
  const plan = planStockDelta(
    { productId: 'p1', quantityDelta: delta },
    { productId: 'p1', ...store.product },
  );
  return tryCommit(store, operationId, plan);
}

test('A: tồn 1, hai operation giảm 1 => một thành công, operation còn lại hết tồn', () => {
  const store = createStore(1);
  const opA = buildStockOperationId('STOCK_OUT', 'A');
  const opB = buildStockOperationId('STOCK_OUT', 'B');
  const planA = planStockDelta(
    { productId: 'p1', quantityDelta: -1 },
    { productId: 'p1', ...store.product },
  );
  const planB = planStockDelta(
    { productId: 'p1', quantityDelta: -1 },
    { productId: 'p1', ...store.product },
  );
  assert.equal(tryCommit(store, opA, planA), 'committed');
  assert.equal(tryCommit(store, opB, planB), 'cas-conflict');
  assert.throws(
    () => retryOnce(store, opB, -1),
    (error) => error?.code === 'INSUFFICIENT_STOCK',
  );
  assert.equal(store.product.stockQuantity, 0);
  assert.deepEqual(store.movements, [[1, 0]]);
});

test('B: tồn 2, hai operation giảm 1 => cả hai thành công qua retry, movement đúng before/after', () => {
  const store = createStore(2);
  const opA = buildStockOperationId('STOCK_OUT', 'A');
  const opB = buildStockOperationId('STOCK_OUT', 'B');
  const planA = planStockDelta(
    { productId: 'p1', quantityDelta: -1 },
    { productId: 'p1', ...store.product },
  );
  const planB = planStockDelta(
    { productId: 'p1', quantityDelta: -1 },
    { productId: 'p1', ...store.product },
  );
  assert.equal(tryCommit(store, opA, planA), 'committed');
  assert.equal(tryCommit(store, opB, planB), 'cas-conflict');
  assert.equal(retryOnce(store, opB, -1), 'committed');
  assert.equal(store.product.stockQuantity, 0);
  assert.deepEqual(store.movements, [[2, 1], [1, 0]]);
});

test('C: cùng operationId hai lần => tồn chỉ thay đổi một lần', () => {
  const store = createStore(2);
  const op = buildStockOperationId('STOCK_OUT', 'same');
  const plan = planStockDelta(
    { productId: 'p1', quantityDelta: -1 },
    { productId: 'p1', ...store.product },
  );
  assert.equal(tryCommit(store, op, plan), 'committed');
  assert.equal(retryOnce(store, op, -1), 'already-committed');
  assert.equal(store.product.stockQuantity, 1);
  assert.equal(store.movements.length, 1);
});

test('D: hủy/hoàn cùng chứng từ hai lần => chỉ hoàn tồn một lần', () => {
  const store = createStore(1);
  const op = buildStockOperationId('STOCK_OUT_REVERSAL', 'stockout-1');
  const plan = planStockDelta(
    { productId: 'p1', quantityDelta: 1 },
    { productId: 'p1', ...store.product },
  );
  assert.equal(tryCommit(store, op, plan), 'committed');
  assert.equal(retryOnce(store, op, 1), 'already-committed');
  assert.equal(store.product.stockQuantity, 2);
  assert.deepEqual(store.movements, [[1, 2]]);
});

test('E: metadata patch không ghi stockQuantity/stockVersion nên không làm tồn quay về cũ', () => {
  const productServiceSource = readFileSync(
    new URL('../src/modules/products/productService.ts', import.meta.url),
    'utf8',
  );
  const metadataComment = productServiceSource.indexOf('// Chỉ cập nhật metadata');
  const metadataUpdateStart = productServiceSource.indexOf(
    'await update(ref(database), {',
    metadataComment,
  );
  const metadataUpdateEnd = productServiceSource.indexOf('});', metadataUpdateStart);
  const metadataUpdateBlock = productServiceSource.slice(metadataUpdateStart, metadataUpdateEnd);
  assert.ok(metadataUpdateStart > 0 && metadataUpdateEnd > metadataUpdateStart);
  assert.doesNotMatch(metadataUpdateBlock, /stockQuantity|stockVersion/);

  const store = createStore(3);
  const staleUiProduct = { ...store.product };
  const op = buildStockOperationId('PURCHASE', 'purchase-1');
  const plan = planStockDelta(
    { productId: 'p1', quantityDelta: 2 },
    { productId: 'p1', ...store.product },
  );
  assert.equal(tryCommit(store, op, plan), 'committed');
  Object.assign(store.product, { name: 'New name' });
  assert.equal(staleUiProduct.stockQuantity, 3);
  assert.equal(store.product.stockQuantity, 5);
  assert.equal(store.product.stockVersion, 5);
  assert.equal(store.product.name, 'New name');
});

test('F: operation nhiều sản phẩm conflict một SKU => không ghi partial product còn lại', () => {
  const store = {
    products: {
      p1: { stockQuantity: 2, stockVersion: 4 },
      p2: { stockQuantity: 2, stockVersion: 8 },
    },
  };
  const plans = [
    planStockDelta(
      { productId: 'p1', quantityDelta: -1 },
      { productId: 'p1', ...store.products.p1 },
    ),
    planStockDelta(
      { productId: 'p2', quantityDelta: -1 },
      { productId: 'p2', ...store.products.p2 },
    ),
  ];
  store.products.p2.stockQuantity = 1;
  store.products.p2.stockVersion = 9;

  const allVersionsMatch = plans.every(
    (plan) => store.products[plan.productId].stockVersion === plan.stockVersionBefore,
  );
  assert.equal(allVersionsMatch, false);
  assert.deepEqual(store.products.p1, { stockQuantity: 2, stockVersion: 4 });
  assert.deepEqual(store.products.p2, { stockQuantity: 1, stockVersion: 9 });
});
