import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, set, update } from 'firebase/database';

const PROJECT_ID = 'demo-products-delete';
const OWNER_UID = 'owner-test';
const OWNER2_UID = 'owner-test-2';
const STAFF_UID = 'staff-test';
const RULES = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
let testEnv;

function appUser(uid, role) {
  return {
    uid,
    displayName: uid,
    role,
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function product(id, overrides = {}) {
  return {
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
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

function lock(productId, actorUid = OWNER_UID) {
  return { productId, actorUid, createdAt: 2 };
}

function audit(id, actorUid = OWNER_UID) {
  return {
    id,
    actorUid,
    action: 'PRODUCT_DELETED',
    entityType: 'product',
    entityId: 'p1',
    summary: 'delete p1',
    createdAt: 3,
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: '127.0.0.1', port: 9000, rules: RULES },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database()), {
      users: {
        [OWNER_UID]: appUser(OWNER_UID, 'owner'),
        [OWNER2_UID]: appUser(OWNER2_UID, 'owner'),
        [STAFF_UID]: appUser(STAFF_UID, 'staff'),
      },
    });
  });
});

function ownerDb(uid = OWNER_UID) {
  return testEnv.authenticatedContext(uid).database();
}

function staffDb() {
  return testEnv.authenticatedContext(STAFF_UID).database();
}

async function seed(values) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await update(ref(context.database()), values);
  });
}

async function createOwnerLock(productId = 'p1', uid = OWNER_UID) {
  await assertSucceeds(set(ref(ownerDb(uid), `productDeletionLocks/${productId}`), lock(productId, uid)));
}

test('STAFF cannot permanent delete a clean Product or create a deletion lock', async () => {
  await seed({ 'products/p1': product('p1') });
  await assertFails(set(ref(staffDb(), 'productDeletionLocks/p1'), lock('p1', STAFF_UID)));
  await seed({ 'productDeletionLocks/p1': lock('p1', STAFF_UID) });
  await assertFails(set(ref(staffDb(), 'products/p1'), null));
});

test('OWNER can lock a clean Product and atomically delete with own lock + audit', async () => {
  await seed({ 'products/p1': product('p1') });
  await createOwnerLock();

  await assertSucceeds(update(ref(ownerDb()), {
    'products/p1': null,
    'productDeletionLocks/p1': null,
    'auditLogs/delete-p1': audit('delete-p1'),
  }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await get(ref(context.database()));
    assert.equal(snapshot.child('products/p1').exists(), false);
    assert.equal(snapshot.child('productDeletionLocks/p1').exists(), false);
    assert.equal(snapshot.child('auditLogs/delete-p1/action').val(), 'PRODUCT_DELETED');
  });
});

test('OWNER delete without matching lock is denied', async () => {
  await seed({ 'products/p1': product('p1') });
  await assertFails(set(ref(ownerDb(), 'products/p1'), null));
});

test('stock > 0 rejects both lock and delete even with a forged lock', async () => {
  await seed({ 'products/p1': product('p1', { stockQuantity: 1 }) });
  await assertFails(set(ref(ownerDb(), 'productDeletionLocks/p1'), lock('p1')));
  await seed({ 'productDeletionLocks/p1': lock('p1') });
  await assertFails(set(ref(ownerDb(), 'products/p1'), null));
});

test('stockVersion > 0 rejects both lock and delete even with a forged lock', async () => {
  await seed({ 'products/p1': product('p1', { stockVersion: 1 }) });
  await assertFails(set(ref(ownerDb(), 'productDeletionLocks/p1'), lock('p1')));
  await seed({ 'productDeletionLocks/p1': lock('p1') });
  await assertFails(set(ref(ownerDb(), 'products/p1'), null));
});

test('malformed stored Product.id != Firebase child key rejects lock and delete', async () => {
  await seed({ 'products/A': product('B') });
  await assertFails(set(ref(ownerDb(), 'productDeletionLocks/A'), lock('A')));
  await seed({ 'productDeletionLocks/A': lock('A') });
  await assertFails(set(ref(ownerDb(), 'products/A'), null));
});

test('second deletion lock is denied while an existing lock is present', async () => {
  await seed({ 'products/p1': product('p1') });
  await createOwnerLock();
  await assertFails(set(ref(ownerDb(OWNER2_UID), 'productDeletionLocks/p1'), lock('p1', OWNER2_UID)));
});

test('all non-delete Product writes are denied while deletion lock exists', async () => {
  await seed({ 'products/p1': product('p1') });
  await createOwnerLock();
  await assertFails(set(ref(ownerDb(), 'products/p1/active'), false));
  await assertFails(update(ref(ownerDb()), {
    'products/p1/stockQuantity': 1,
    'products/p1/stockVersion': 1,
  }));
});

for (const [label, path, value] of [
  ['stocktake', 'stocktakes/t1', { id: 't1', items: [{ productId: 'p1' }] }],
  ['sale', 'sales/s1', { id: 's1', items: [{ productId: 'p1' }] }],
  ['purchase', 'purchases/pur1', { id: 'pur1', items: [{ productId: 'p1' }] }],
  ['stockOut', 'stockOuts/o1', { id: 'o1', items: [{ productId: 'p1' }] }],
  ['stockMovement', 'stockMovements/m1', { id: 'm1', productId: 'p1' }],
]) {
  test(`${label} Product reference creation is denied while deletion lock exists`, async () => {
    await seed({ 'products/p1': product('p1') });
    await createOwnerLock();
    await assertFails(set(ref(staffDb(), path), value));
  });
}

test('normal Product create, metadata update and activation remain allowed without lock', async () => {
  await assertSucceeds(set(ref(staffDb(), 'products/p1'), product('p1')));
  await assertSucceeds(set(ref(staffDb(), 'products/p1/name'), 'Renamed'));
  await assertSucceeds(set(ref(staffDb(), 'products/p1/active'), false));
  await assertSucceeds(set(ref(staffDb(), 'products/p1/active'), true));
});

test('normal CAS +1 is allowed; invalid CAS and negative stock are denied without lock', async () => {
  await seed({ 'products/p1': product('p1') });
  await assertSucceeds(update(ref(staffDb()), {
    'products/p1/stockQuantity': 1,
    'products/p1/stockVersion': 1,
  }));
  await assertFails(update(ref(staffDb()), {
    'products/p1/stockQuantity': 2,
    'products/p1/stockVersion': 3,
  }));
  await assertFails(update(ref(staffDb()), {
    'products/p1/stockQuantity': -1,
    'products/p1/stockVersion': 2,
  }));
});

test('invalid audit permission rolls back Product delete and lock removal atomically', async () => {
  await seed({ 'products/p1': product('p1') });
  await createOwnerLock();

  await assertFails(update(ref(ownerDb()), {
    'products/p1': null,
    'productDeletionLocks/p1': null,
    'auditLogs/delete-p1': audit('delete-p1', STAFF_UID),
  }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await get(ref(context.database()));
    assert.equal(snapshot.child('products/p1').exists(), true);
    assert.equal(snapshot.child('productDeletionLocks/p1').exists(), true);
    assert.equal(snapshot.child('auditLogs/delete-p1').exists(), false);
  });
});
