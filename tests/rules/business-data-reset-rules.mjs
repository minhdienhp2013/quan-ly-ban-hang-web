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
const OWNER_UID = 'reset-owner';
const OWNER2_UID = 'reset-owner-2';
const STAFF_UID = 'reset-staff';
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

function product(id = 'p1', overrides = {}) {
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

function resetLock(actorUid = OWNER_UID) {
  return { actorUid, createdAt: 10 };
}

function resetAudit(id = 'reset-audit', actorUid = OWNER_UID) {
  return {
    id,
    actorUid,
    action: 'BUSINESS_DATA_RESET',
    entityType: 'system',
    summary: 'Hard reset business data',
    createdAt: 11,
  };
}

function productDeleteLock(productId = 'p1', actorUid = OWNER_UID) {
  return { productId, actorUid, createdAt: 9 };
}

function targetSeed() {
  return {
    'products/p1': product('p1'),
    'sales/s1': { id: 's1', items: [{ productId: 'p1' }], createdAt: 2 },
    'purchases/pur1': { id: 'pur1', items: [{ productId: 'p1' }], createdAt: 2 },
    'stockOuts/o1': { id: 'o1', items: [{ productId: 'p1' }], createdAt: 2 },
    'stockMovements/m1': { id: 'm1', productId: 'p1', createdAt: 2 },
    'stockOperations/SALE_s1': {
      id: 'SALE_s1',
      type: 'SALE',
      referenceType: 'sale',
      referenceId: 's1',
      actorUid: OWNER_UID,
      createdAt: 2,
    },
    'stocktakes/t1': { id: 't1', items: [{ productId: 'p1' }], createdAt: 2 },
  };
}

function retainedSeed() {
  return {
    'categories/c1': { id: 'c1', name: 'Category', active: true, createdAt: 1, updatedAt: 1 },
    'customers/cu1': { id: 'cu1', code: 'CU1', name: 'Customer', active: true, createdAt: 1, updatedAt: 1 },
    'suppliers/su1': { id: 'su1', code: 'SU1', name: 'Supplier', active: true, createdAt: 1, updatedAt: 1 },
    'expenses/e1': { id: 'e1', code: 'E1', category: 'other', amount: 1000, expenseDate: 1, status: 'completed', createdBy: OWNER_UID, createdAt: 1, updatedAt: 1 },
    'settings': { storeName: 'Store', currency: 'VND', updatedAt: 1 },
    'auditLogs/old-audit': { id: 'old-audit', actorUid: OWNER_UID, action: 'OLD_EVENT', entityType: 'system', createdAt: 1 },
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

async function acquireResetLock(uid = OWNER_UID) {
  await assertSucceeds(set(ref(ownerDb(uid), 'businessDataResetLock'), resetLock(uid)));
}

function finalResetUpdates(audit = resetAudit()) {
  return {
    products: null,
    sales: null,
    purchases: null,
    stockOuts: null,
    stockMovements: null,
    stockOperations: null,
    stocktakes: null,
    productDeletionLocks: null,
    businessDataResetLock: null,
    [`auditLogs/${audit.id}`]: audit,
  };
}

test('STAFF cannot acquire reset lock or perform hard reset even with a forged lock', async () => {
  await seed(targetSeed());
  await assertFails(set(ref(staffDb(), 'businessDataResetLock'), resetLock(STAFF_UID)));
  await seed({ businessDataResetLock: resetLock(STAFF_UID) });
  await assertFails(update(ref(staffDb()), finalResetUpdates(resetAudit('staff-reset', STAFF_UID))));
});

test('OWNER reset without valid reset lock is denied', async () => {
  await seed(targetSeed());
  await assertFails(update(ref(ownerDb()), finalResetUpdates()));
});

test('OWNER can acquire lock and atomically reset target nodes while retained nodes and old audit stay unchanged', async () => {
  await seed({ ...targetSeed(), ...retainedSeed() });
  await acquireResetLock();
  await assertSucceeds(update(ref(ownerDb()), finalResetUpdates()));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await get(ref(context.database()));
    for (const node of ['products', 'sales', 'purchases', 'stockOuts', 'stockMovements', 'stockOperations', 'stocktakes', 'productDeletionLocks', 'businessDataResetLock']) {
      assert.equal(snapshot.child(node).exists(), false, `${node} must be empty after reset`);
    }
    for (const path of ['users', 'categories/c1', 'customers/cu1', 'suppliers/su1', 'expenses/e1', 'settings', 'auditLogs/old-audit']) {
      assert.equal(snapshot.child(path).exists(), true, `${path} must be preserved`);
    }
    assert.equal(snapshot.child('auditLogs/reset-audit/action').val(), 'BUSINESS_DATA_RESET');
    assert.equal(snapshot.child('auditLogs/reset-audit/actorUid').val(), OWNER_UID);
  });
});

test('reset lock and Product permanent-delete lock are mutually exclusive', async () => {
  await seed({ 'products/p1': product('p1') });
  await assertSucceeds(set(ref(ownerDb(), 'productDeletionLocks/p1'), productDeleteLock()));
  await assertFails(set(ref(ownerDb(), 'businessDataResetLock'), resetLock()));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database(), 'productDeletionLocks'), null);
  });
  await acquireResetLock();
  await assertFails(set(ref(ownerDb(), 'productDeletionLocks/p1'), productDeleteLock()));
});

test('Product create/update and all transactional writes are denied while reset lock is active', async () => {
  await seed({ 'products/p1': product('p1') });
  await acquireResetLock();

  await assertFails(set(ref(staffDb(), 'products/p2'), product('p2')));
  await assertFails(set(ref(ownerDb(), 'products/p1/name'), 'Renamed while reset'));
  await assertFails(update(ref(ownerDb()), {
    'products/p1/stockQuantity': 1,
    'products/p1/stockVersion': 1,
  }));

  await assertFails(set(ref(staffDb(), 'sales/s2'), { id: 's2', items: [{ productId: 'p1' }] }));
  await assertFails(set(ref(staffDb(), 'purchases/p2'), { id: 'p2', items: [{ productId: 'p1' }] }));
  await assertFails(set(ref(staffDb(), 'stockOuts/o2'), { id: 'o2', items: [{ productId: 'p1' }] }));
  await assertFails(set(ref(staffDb(), 'stockMovements/m2'), { id: 'm2', productId: 'p1' }));
  await assertFails(set(ref(staffDb(), 'stocktakes/t2'), { id: 't2', items: [{ productId: 'p1' }] }));
  await assertFails(set(ref(staffDb(), 'stockOperations/SALE_s2'), {
    id: 'SALE_s2',
    type: 'SALE',
    referenceType: 'sale',
    referenceId: 's2',
    actorUid: STAFF_UID,
    createdAt: 3,
  }));
});

test('normal Product and transaction writes resume after reset lock is released', async () => {
  await seed({ 'products/p1': product('p1') });
  await acquireResetLock();
  await assertSucceeds(set(ref(ownerDb(), 'businessDataResetLock'), null));

  await assertSucceeds(set(ref(staffDb(), 'products/p2'), product('p2')));
  await assertSucceeds(update(ref(staffDb()), {
    'products/p1/stockQuantity': 1,
    'products/p1/stockVersion': 1,
  }));
  await assertSucceeds(set(ref(staffDb(), 'sales/s2'), { id: 's2', items: [{ productId: 'p1' }] }));
  await assertSucceeds(set(ref(staffDb(), 'stockOperations/SALE_s2'), {
    id: 'SALE_s2',
    type: 'SALE',
    referenceType: 'sale',
    referenceId: 's2',
    actorUid: STAFF_UID,
    createdAt: 3,
  }));
});

test('foreign OWNER cannot use another OWNER reset lock', async () => {
  await seed(targetSeed());
  await acquireResetLock(OWNER_UID);
  await assertFails(update(ref(ownerDb(OWNER2_UID)), finalResetUpdates(resetAudit('foreign-reset', OWNER2_UID))));
});

test('invalid audit permission rolls back the entire destructive reset atomically', async () => {
  await seed({ ...targetSeed(), ...retainedSeed() });
  await acquireResetLock();

  await assertFails(update(ref(ownerDb()), finalResetUpdates(resetAudit('invalid-reset', STAFF_UID))));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snapshot = await get(ref(context.database()));
    assert.equal(snapshot.child('products/p1').exists(), true);
    assert.equal(snapshot.child('sales/s1').exists(), true);
    assert.equal(snapshot.child('stockOperations/SALE_s1').exists(), true);
    assert.equal(snapshot.child('businessDataResetLock/actorUid').val(), OWNER_UID);
    assert.equal(snapshot.child('auditLogs/invalid-reset').exists(), false);
    assert.equal(snapshot.child('auditLogs/old-audit').exists(), true);
  });
});
