import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  BUSINESS_DATA_RESET_CONFIRMATION_PHRASE,
  BUSINESS_DATA_RESET_DELETE_NODES,
  BUSINESS_DATA_RESET_RETAINED_NODES,
  BUSINESS_DATA_RESET_LOCK_PATH,
  isBusinessDataResetConfirmation,
} from '../src/modules/backup/businessDataResetContract.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('hard reset scope is exact and retained business/config nodes never overlap delete scope', () => {
  assert.deepEqual(BUSINESS_DATA_RESET_DELETE_NODES, [
    'products',
    'sales',
    'purchases',
    'stockOuts',
    'stockMovements',
    'stockOperations',
    'stocktakes',
    'productDeletionLocks',
  ]);
  assert.deepEqual(BUSINESS_DATA_RESET_RETAINED_NODES, [
    'users',
    'categories',
    'customers',
    'suppliers',
    'expenses',
    'settings',
    'auditLogs',
  ]);
  assert.equal(BUSINESS_DATA_RESET_LOCK_PATH, 'businessDataResetLock');
  assert.equal(
    BUSINESS_DATA_RESET_DELETE_NODES.some((node) => BUSINESS_DATA_RESET_RETAINED_NODES.includes(node)),
    false,
  );
});

test('confirmation phrase is exact and wrong/case/space variants remain blocked', () => {
  assert.equal(BUSINESS_DATA_RESET_CONFIRMATION_PHRASE, 'XOA TOAN BO DU LIEU');
  assert.equal(isBusinessDataResetConfirmation('XOA TOAN BO DU LIEU'), true);
  assert.equal(isBusinessDataResetConfirmation('xoa toan bo du lieu'), false);
  assert.equal(isBusinessDataResetConfirmation(' XOA TOAN BO DU LIEU'), false);
  assert.equal(isBusinessDataResetConfirmation('XOA TOAN BO DU LIEU '), false);
  assert.equal(isBusinessDataResetConfirmation('XOA TOAN BO'), false);
});

test('Settings route stays owner-only and is the only settings surface for reset UI', () => {
  const app = read('src/App.tsx');
  const settings = read('src/modules/settings/SettingsPage.tsx');
  const ownerStart = app.indexOf('<Route element={<RequireOwner />}>');
  const ownerEnd = app.indexOf('</Route>', app.indexOf('path="settings"', ownerStart));
  assert.ok(ownerStart >= 0 && ownerEnd > ownerStart);
  assert.ok(app.indexOf('path="settings"', ownerStart) < ownerEnd);
  assert.match(app, /path="settings" element=\{<SettingsPage \/>\}/);
  assert.match(settings, /appUser\.role !== 'owner'/);
  assert.match(settings, /<BackupPanel actorUid=\{appUser\.uid\} \/>/);
  assert.match(settings, /<BusinessDataResetPanel actorUid=\{appUser\.uid\} \/>/);
});

test('danger-zone UI requires exact phrase, final confirmation, prevents double submit and never reports success before reset resolves', () => {
  const panel = read('src/modules/backup/BusinessDataResetPanel.tsx');
  const handlerStart = panel.indexOf('async function handleReset');
  const handlerEnd = panel.indexOf('return (', handlerStart);
  const handler = panel.slice(handlerStart, handlerEnd);

  assert.match(panel, /BUSINESS_DATA_RESET_DELETE_NODES\.map/);
  assert.match(panel, /BUSINESS_DATA_RESET_RETAINED_NODES\.map/);
  assert.match(panel, /isBusinessDataResetConfirmation\(confirmation\)/);
  assert.match(panel, /disabled=\{busy \|\| !phraseMatches\}/);
  assert.match(handler, /if \(busy \|\| !phraseMatches\) return/);
  assert.match(handler, /window\.confirm\(FINAL_WARNING\)/);
  assert.match(handler, /if \(!confirmed\) return/);
  assert.ok(handler.indexOf('if (!confirmed) return') < handler.indexOf('resetBusinessData('));
  assert.ok(handler.indexOf('await resetBusinessData(') < handler.indexOf("setSuccess('Đã xóa toàn bộ dữ liệu hàng hóa và giao dịch.')"));
  assert.match(panel, /Đã tạo bản sao lưu trước khi xóa\./);
  assert.match(panel, /Không thể hoàn tác nếu không có bản backup/);
});

test('service validates OWNER, acquires lock, backs up before destructive write and uses one final multi-location update', () => {
  const service = read('src/modules/backup/businessDataResetService.ts');
  const start = service.indexOf('export async function resetBusinessData');
  const body = service.slice(start);

  assert.match(service, /actor\.role !== 'owner' \|\| actor\.active !== true/);
  assert.match(body, /await set\(ref\(requireDatabase\(\), BUSINESS_DATA_RESET_LOCK_PATH\)/);
  assert.match(body, /const backup = await createBackupEnvelope\(\)/);
  assert.match(body, /await backupWriter\(backup\)/);
  assert.match(body, /await assertLockOwnedBy\(actorUid\)/);
  assert.match(body, /BUSINESS_DATA_RESET_DELETE_NODES\.map\(\(node\) => \[node, null\]\)/);
  assert.match(body, /'BUSINESS_DATA_RESET'/);
  assert.match(body, /entityType: 'system'/);
  assert.match(body, /updates\[BUSINESS_DATA_RESET_LOCK_PATH\] = null/);
  assert.match(body, /await update\(ref\(database\), updates\)/);

  const backupIndex = body.indexOf('await backupWriter(backup)');
  const destructiveIndex = body.indexOf('await update(ref(database), updates)');
  assert.ok(backupIndex >= 0 && destructiveIndex > backupIndex, 'backup must finish before destructive update');
  assert.equal((body.match(/await update\(ref\(database\), updates\)/g) ?? []).length, 1);
});

test('backup failure/cancel/error paths cannot enter destructive update or report false success', () => {
  const service = read('src/modules/backup/businessDataResetService.ts');
  const panel = read('src/modules/backup/BusinessDataResetPanel.tsx');
  const serviceBody = service.slice(service.indexOf('export async function resetBusinessData'));
  const backupIndex = serviceBody.indexOf('await backupWriter(backup)');
  const destructiveIndex = serviceBody.indexOf('await update(ref(database), updates)');
  assert.ok(backupIndex < destructiveIndex);
  assert.match(serviceBody, /finally \{/);
  assert.match(serviceBody, /releaseResetLock\(disconnectCleanup\)/);
  assert.match(service, /onDisconnect/);

  const handler = panel.slice(panel.indexOf('async function handleReset'), panel.indexOf('return (', panel.indexOf('async function handleReset')));
  assert.ok(handler.indexOf('if (!confirmed) return') < handler.indexOf('setBusy(true)'));
  assert.match(handler, /setSuccess\(''\)/);
  assert.ok(handler.indexOf("setSuccess('')") < handler.indexOf('await resetBusinessData('));
  assert.ok(handler.indexOf('setError(') > handler.indexOf('await resetBusinessData('));
});

test('destructive service never cascades into retained nodes and preserves old audit history', () => {
  const service = read('src/modules/backup/businessDataResetService.ts');
  for (const node of ['users', 'categories', 'customers', 'suppliers', 'expenses', 'settings']) {
    assert.doesNotMatch(service, new RegExp(`updates\\[.*${node}`));
  }
  assert.doesNotMatch(service, /auditLogs['"`]\s*[:=]\s*null/);
  assert.match(service, /updates\[`auditLogs\/\$\{auditId\}`\] = audit/);
});

test('reset lock is operational only; no Product/transaction business model is duplicated', () => {
  const contract = read('src/modules/backup/businessDataResetContract.ts');
  const models = read('src/types/models.ts');
  assert.doesNotMatch(contract, /interface Product/);
  assert.doesNotMatch(contract, /stockQuantity|salePrice|costPrice/);
  assert.doesNotMatch(models, /BusinessDataReset/);
});
