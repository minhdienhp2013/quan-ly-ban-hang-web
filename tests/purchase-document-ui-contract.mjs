import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildPrintingInitialQuantities,
  buildPurchaseDetailRows,
  filterPurchases,
  getLocalDayBoundary,
  getPurchaseActionCapabilities,
  getPurchaseStatusLabel,
  getPurchaseTotals,
  paginatePurchases,
  resolveCreatorDisplay,
  resolveSupplierCode,
} from '../src/modules/purchases/purchaseManagementViewModel.ts';

const exportSourcePath = 'src/modules/purchases/purchaseExport.ts';
const exportHarnessPath = 'src/modules/purchases/.purchaseExport.node-test.ts';
let exportModule;
try {
  const exportSource = fs.readFileSync(exportSourcePath, 'utf8').replace(
    "from './purchaseManagementViewModel';",
    "from './purchaseManagementViewModel.ts';",
  );
  fs.writeFileSync(exportHarnessPath, exportSource);
  exportModule = await import(`../${exportHarnessPath}?test=${Date.now()}`);
} finally {
  if (fs.existsSync(exportHarnessPath)) fs.unlinkSync(exportHarnessPath);
}

const {
  buildPurchaseFilename,
  buildPurchaseListFilename,
  createPurchaseListWorkbook,
  createPurchaseWorkbook,
} = exportModule;

const suppliers = [
  { id: 'sup-1', code: 'NCC000001', name: 'Tên NCC hiện tại', active: true },
  { id: 'sup-2', code: 'NCC000002', name: 'NCC ngừng dùng', active: false },
];
const items = [
  { productId: 'p1', sku: 'OLD001', name: 'Tên snapshot A', quantity: 2, unitCost: 15000, lineTotal: 30000 },
  { productId: 'missing', sku: 'OLD002', name: 'Tên snapshot B', quantity: 3.5, unitCost: 20000, lineTotal: 70000 },
];
const completed = {
  id: 'purchase-1', code: 'PN-20260914-ABC123', supplierId: 'sup-1', supplierName: 'Tên NCC lịch sử', items,
  total: 100000, note: 'Nhập định kỳ', status: 'completed', createdBy: 'owner-uid-1234567890',
  createdAt: new Date(2026, 8, 14, 0, 0, 0, 0).getTime(), updatedAt: Date.now(),
};
const cancelled = {
  ...completed, id: 'purchase-2', code: 'PN-20260915-CANCEL', status: 'cancelled', supplierId: 'sup-2',
  createdBy: 'other-user-123456789', createdAt: new Date(2026, 8, 15, 23, 59, 59, 999).getTime(),
};

test('Purchase status labels do not invent draft state', () => {
  assert.equal(getPurchaseStatusLabel('completed'), 'Đã nhập hàng');
  assert.equal(getPurchaseStatusLabel('cancelled'), 'Đã hủy');
});

test('detail rows and totals use historical PurchaseItem snapshots only', () => {
  const rows = buildPurchaseDetailRows(completed);
  assert.equal(rows[0].sku, 'OLD001');
  assert.equal(rows[0].name, 'Tên snapshot A');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].unitCost, 15000);
  assert.equal(rows[0].lineTotal, 30000);
  assert.equal(rows[1].productId, 'missing');
  assert.equal(rows[1].name, 'Tên snapshot B');
  assert.deepEqual({ ...getPurchaseTotals(completed) }, { itemCount: 2, totalQuantity: 5.5, total: 100000 });
});

test('supplier code is current directory metadata while supplier name remains Purchase snapshot', () => {
  assert.equal(resolveSupplierCode(completed, suppliers), 'NCC000001');
  assert.equal(resolveSupplierCode({ supplierId: 'gone' }, suppliers), '—');
  assert.equal(completed.supplierName, 'Tên NCC lịch sử');
});

test('search covers code, snapshot supplier name, note and current supplier code', () => {
  const base = { status: 'all', supplierId: '', fromDate: '', toDate: '', onlyMine: false, currentUserId: completed.createdBy };
  for (const query of ['abc123', 'ncc lịch sử', 'định kỳ', 'NCC000001']) {
    const rows = filterPurchases([completed, cancelled], suppliers, { ...base, query });
    assert.deepEqual(rows.map((row) => row.id), ['purchase-1']);
  }
});

test('status, supplier, only-mine and inclusive local date filters fail safe', () => {
  assert.equal(getLocalDayBoundary('2026-09-14', 'start'), new Date(2026, 8, 14, 0, 0, 0, 0).getTime());
  assert.equal(getLocalDayBoundary('2026-09-15', 'end'), new Date(2026, 8, 15, 23, 59, 59, 999).getTime());
  const base = { query: '', status: 'all', supplierId: '', fromDate: '', toDate: '', onlyMine: false, currentUserId: completed.createdBy };
  assert.deepEqual(filterPurchases([completed, cancelled], suppliers, { ...base, status: 'completed' }).map((row) => row.id), ['purchase-1']);
  assert.deepEqual(filterPurchases([completed, cancelled], suppliers, { ...base, supplierId: 'sup-2' }).map((row) => row.id), ['purchase-2']);
  assert.deepEqual(filterPurchases([completed, cancelled], suppliers, { ...base, onlyMine: true }).map((row) => row.id), ['purchase-1']);
  assert.deepEqual(filterPurchases([completed, cancelled], suppliers, { ...base, fromDate: '2026-09-14', toDate: '2026-09-15' }).length, 2);
  assert.deepEqual(filterPurchases([completed, cancelled], suppliers, { ...base, fromDate: '2026-09-16', toDate: '2026-09-14' }), []);
});

test('pagination clamps page and supports only 5, 10, 20 rows per page', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);
  assert.deepEqual({ ...paginatePurchases(rows, 2, 10) }, { items: rows.slice(10, 20), page: 2, pageSize: 10, totalPages: 3, totalRows: 23 });
  assert.equal(paginatePurchases(rows, 99, 5).page, 5);
  assert.equal(paginatePurchases(rows, 1, 7).pageSize, 10);
});

test('action matrix keeps completed immutable and cancelled non-reversible', () => {
  assert.deepEqual({ ...getPurchaseActionCapabilities('completed') }, { view: true, exportExcel: true, print: true, copy: true, cancel: true });
  assert.deepEqual({ ...getPurchaseActionCapabilities('cancelled') }, { view: true, exportExcel: true, print: false, copy: true, cancel: false });
});

test('creator display and printing handoff use existing safe contracts', () => {
  const appUser = { uid: completed.createdBy, displayName: 'Chủ cửa hàng' };
  assert.equal(resolveCreatorDisplay(completed.createdBy, appUser), 'Chủ cửa hàng');
  assert.match(resolveCreatorDisplay(cancelled.createdBy, appUser), /^Người dùng \(.+….+\)$/);
  assert.deepEqual({ ...buildPrintingInitialQuantities(completed) }, { p1: 2, missing: 3.5 });
});

test('individual Excel workbook has required sheets, snapshot values and numeric cells', () => {
  const workbook = createPurchaseWorkbook(completed, suppliers, 'Chủ cửa hàng');
  assert.deepEqual(workbook.SheetNames, ['Thong tin phieu', 'Hang nhap']);
  const sheet = workbook.Sheets['Hang nhap'];
  assert.equal(sheet.B2.v, 'OLD001');
  assert.equal(sheet.C2.v, 'Tên snapshot A');
  assert.equal(sheet.D2.t, 'n');
  assert.equal(sheet.E2.t, 'n');
  assert.equal(sheet.F2.t, 'n');
  assert.equal(sheet.D2.v, 2);
  assert.equal(sheet.E2.v, 15000);
  assert.equal(sheet.F2.v, 30000);
  assert.equal(sheet.B3.v, 'OLD002');
  assert.equal(sheet['!cols'].length, 6);
  assert.equal(sheet['!autofilter'].ref, 'A1:F3');
  assert.equal(workbook.Sheets['Thong tin phieu'].B11.t, 'n');
  assert.equal(workbook.Sheets['Thong tin phieu'].B11.v, 100000);
  assert.equal(buildPurchaseFilename(completed), 'PhieuNhap_PN-20260914-ABC123.xlsx');
});

test('list Excel exports exactly filtered rows and rejects empty result', () => {
  const filtered = filterPurchases([completed, cancelled], suppliers, { query: '', status: 'cancelled', supplierId: '', fromDate: '', toDate: '', onlyMine: false });
  const workbook = createPurchaseListWorkbook(filtered, suppliers, () => 'Người dùng');
  const sheet = workbook.Sheets['Danh sach phieu'];
  assert.equal(sheet.B2.v, cancelled.code);
  assert.equal(sheet.D2.v, 'NCC000002');
  assert.equal(sheet.E2.v, 'Tên NCC lịch sử');
  assert.equal(sheet.F2.t, 'n');
  assert.equal(sheet['!cols'].length, 9);
  assert.equal(sheet['!autofilter'].ref, 'A1:I2');
  assert.throws(() => createPurchaseListWorkbook([], suppliers, () => ''), /Không có phiếu nhập phù hợp bộ lọc để xuất/);
  assert.equal(buildPurchaseListFilename(new Date(2026, 8, 14, 12).getTime()), 'DanhSachPhieuNhap_2026-09-14.xlsx');
});

test('Excel export is read-only and has no Firebase or mutation imports', () => {
  const source = fs.readFileSync(exportSourcePath, 'utf8');
  assert.doesNotMatch(source, /firebase\/database|commitStockOperation|createPurchase|cancelPurchase|auditLogs|stockQuantity/);
});

test('inline detail is an accessible region, not a modal, and selection is realtime-id based', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const table = fs.readFileSync('src/modules/purchases/PurchaseTable.tsx', 'utf8');
  const detail = fs.readFileSync('src/modules/purchases/PurchaseDetailPanel.tsx', 'utf8');
  assert.match(page, /selectedPurchaseId/);
  assert.match(page, /filteredPurchases\.some\(\(purchase\) => purchase\.id === selectedPurchaseId\)/);
  assert.match(table, /aria-expanded=\{expanded\}/);
  assert.match(table, /aria-controls=\{detailId\}/);
  assert.match(detail, /role="region"/);
  assert.match(detail, /aria-labelledby=\{titleId\}/);
  assert.doesNotMatch(detail, /aria-modal/);
  assert.match(page, /detailOpenerRef/);
  assert.match(page, /opener\?\.isConnected/);
  assert.match(page, /opener\.focus\(\)/);
});

test('create/copy/cancel UI preserves existing inventory and printing boundaries', () => {
  const page = fs.readFileSync('src/modules/purchases/PurchasesPage.tsx', 'utf8');
  const editor = fs.readFileSync('src/modules/purchases/PurchaseEditor.tsx', 'utf8');
  const detail = fs.readFileSync('src/modules/purchases/PurchaseDetailPanel.tsx', 'utf8');
  assert.match(page, /await createPurchase\(input, appUser\.uid\)/);
  assert.match(page, /await cancelPurchase\(purchase\.id, appUser\.uid\)/);
  assert.match(page, /navigate\('\/qr-printing'/);
  assert.match(page, /initialQuantities: buildPrintingInitialQuantities\(purchase\)/);
  assert.match(editor, /sourcePurchase/);
  assert.match(editor, /Chưa có gì được ghi vào kho/);
  assert.match(detail, /Sao chép để sửa/);
  assert.match(detail, /Hủy \/ hoàn nhập toàn bộ/);
  assert.doesNotMatch(`${page}\n${editor}\n${detail}`, /firebase\/database|stockQuantity\s*=|increment\s*\(|updatePurchase|partial return|Phiếu tạm/);
});

test('responsive Purchase UI uses desktop table, tablet/mobile cards and inline mobile item cards', () => {
  const css = fs.readFileSync('src/modules/purchases/purchases.css', 'utf8');
  assert.match(css, /\.purchase-table-wrap/);
  assert.match(css, /\.purchase-mobile-list\{display:none/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.purchase-table-wrap\{display:none/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.purchase-mobile-list\{display:grid/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.purchase-detail-table-wrap\{display:none/);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.purchase-detail-mobile-items\{display:grid/);
  assert.match(css, /@media\(max-width:430px\)/);
});
