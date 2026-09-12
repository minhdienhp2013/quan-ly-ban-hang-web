import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('reports use Sale cost snapshots instead of current Product cost for historical COGS', () => {
  const source = read('src/modules/reports/reportService.ts');
  const start = source.indexOf('export function getSaleSnapshotCost');
  const end = source.indexOf('function inventoryRows', start);
  const body = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /sale\.costTotal/);
  assert.match(body, /item\.costPrice/);
  assert.doesNotMatch(body, /product\.costPrice/);
});

test('backup contract contains stockOperations and excludes users/auditLogs/Auth nodes', () => {
  const source = read('src/modules/backup/backupService.ts');
  const start = source.indexOf('export const BACKUP_DATA_KEYS');
  const end = source.indexOf('const COLLECTION_KEYS', start);
  const keys = source.slice(start, end);
  assert.match(keys, /stockOperations/);
  assert.match(keys, /stockMovements/);
  assert.match(keys, /products/);
  assert.doesNotMatch(keys, /users/);
  assert.doesNotMatch(keys, /auditLogs/);
  assert.doesNotMatch(keys, /auth/i);
});

test('restore validation requires stockOperations and write path fails closed under current Rules', () => {
  const source = read('src/modules/backup/backupService.ts');
  assert.match(source, /hasOwnProperty\.call\(parsed\.data, 'stockOperations'\)/);
  assert.match(source, /Restore đang bị khóa an toàn/);
  const restoreStart = source.indexOf('export async function restoreBackup');
  const restoreBody = source.slice(restoreStart);
  assert.doesNotMatch(restoreBody, /update\s*\(/);
  assert.doesNotMatch(restoreBody, /set\s*\(/);
});

test('router exposes merged transaction pages instead of placeholders and protects reports as owner route', () => {
  const source = read('src/App.tsx');
  assert.match(source, /path="purchases" element=\{<PurchasesPage \/>\}/);
  assert.match(source, /path="inventory" element=\{<InventoryWorkspacePage \/>\}/);
  assert.match(source, /path="stockouts" element=\{<StockOutPage \/>\}/);
  assert.match(source, /path="stocktakes" element=\{<StocktakePage \/>\}/);
  const ownerStart = source.indexOf('<Route element={<RequireOwner />}>');
  const ownerEnd = source.indexOf('</Route>', source.indexOf('path="settings"', ownerStart));
  assert.match(source.slice(ownerStart, ownerEnd), /path="reports" element=\{<ReportsPage \/>\}/);
});

test('camera component stops/restarts for visibility lifecycle and stops on unmount', () => {
  const source = read('src/modules/qr/BarcodeScanner.tsx');
  assert.match(source, /visibilitychange/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /controllerRef\.current\?\.stop\(\)/);
  assert.match(source, /desiredActiveRef\.current = false/);
});

test('security rules retain CAS, non-negative stock and create-only stockOperations invariants', () => {
  const rules = JSON.parse(read('database.rules.json')).rules;
  const productValidate = rules.products.$productId['.validate'];
  const operationWrite = rules.stockOperations.$operationId['.write'];
  assert.match(productValidate, /stockQuantity/);
  assert.match(productValidate, />= 0/);
  assert.match(productValidate, /stockVersion/);
  assert.match(productValidate, /\+ 1/);
  assert.match(operationWrite, /!data\.exists\(\)/);
  assert.match(operationWrite, /actorUid/);
});

test('reports keep wide tables in a local scroll container for 320px responsive layout', () => {
  const globalCss = read('src/styles.css');
  const reportsCss = read('src/modules/reports/reports.css');
  assert.match(globalCss, /min-width:\s*320px/);
  assert.match(reportsCss, /\.report-table-wrap[^}]*overflow-x:\s*auto/s);
  assert.match(reportsCss, /\.report-touch[^}]*min-height:\s*44px/s);
});
