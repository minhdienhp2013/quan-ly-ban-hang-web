import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { onDisconnect, ref, set } from 'firebase/database';

const PROJECT_ID = 'demo-products-delete';
const OWNER_UID = 'reset-disconnect-owner';
const OWNER2_UID = 'reset-disconnect-owner-2';
const STAFF_UID = 'reset-disconnect-staff';
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

function dbFor(uid) {
  return testEnv.authenticatedContext(uid).database();
}

test('OWNER can register onDisconnect lock removal before the reset lock exists; STAFF cannot', async () => {
  const ownerHandler = onDisconnect(ref(dbFor(OWNER_UID), 'businessDataResetLock'));
  await assertSucceeds(ownerHandler.remove());
  await ownerHandler.cancel();

  const staffHandler = onDisconnect(ref(dbFor(STAFF_UID), 'businessDataResetLock'));
  await assertFails(staffHandler.remove());
  await staffHandler.cancel().catch(() => undefined);
});

test('an OWNER cannot release a reset lock owned by another OWNER', async () => {
  await assertSucceeds(set(ref(dbFor(OWNER_UID), 'businessDataResetLock'), {
    actorUid: OWNER_UID,
    createdAt: 2,
  }));

  await assertFails(set(ref(dbFor(OWNER2_UID), 'businessDataResetLock'), null));
  await assertSucceeds(set(ref(dbFor(OWNER_UID), 'businessDataResetLock'), null));
});
