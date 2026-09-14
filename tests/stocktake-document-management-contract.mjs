import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildStocktakeDetailRows,
  filterStocktakes,
  getDifferenceResult,
  getLocalDayBoundary,
  getStocktakeActionCapabilities,
  getStocktakeStatusLabel,
  getStocktakeTotals,
  resolveCreatorDisplay,
} from '../src/modules/stocktake/stocktakeManagementViewModel.ts';

const exportSourcePath = 'src/modules/stocktake/stocktakeExport.ts';
const exportHarnessPath = 'src/modules/stocktake/.stocktakeExport.node-test.ts';
let exportModule;
try {
  const exportSource = fs.readFileSync(exportSourcePath, 'utf8').replace(
    "from './stocktakeManagementViewModel';",
    "from './stocktakeManagementViewModel.ts';",
  );
  fs.writeFileSync(exportHarnessPath, exportSource);
  exportModule = await import(`../${exportHarnessPath}?test=${Date.now()}`);
} finally {
  if (fs.existsSync(exportHarnessPath)) fs.unlinkSync(exportHarnessPath);
}

const {
  buildStocktakeFilename,
  buildStocktakeListFilename,
  createStocktakeListWorkbook,
  createStocktakeWorkbook,
} = exportModule;

const baseItems = [
  { productId: 'A', systemQuantity: 10, actualQuantity: 8, difference: -2 },
  { productId: 'B', systemQuantity: 5, actualQuantity: 7, difference: 2 },
  { productId: 'MISSING', systemQuantity: 4, actualQuantity: 4, difference: 0 },
];

const draft = {
  id: 'draft-1',
  code: 'KK-20260914-ABC123',
  status: 'draft',
  items: baseItems,
  note: 'Kệ phía trước',
  createdBy: 'owner-uid-1234567890',
  createdAt: new Date(2026, 8, 14, 0, 0, 0, 0).getTime(),
};

const completed = {
  ...draft,
  id: 'completed-1',
  code: 'KK-20260914-DONE01',
  status: 'completed',
  createdAt: new Date(2026, 8, 14, 23, 59, 59, 999).getTime(),
  completedAt: new Date(2026, 8, 15, 9, 30, 0, 0).getTime(),
};

const cancelled = {
  ...draft,
  id: 'cancelled-1',
  code: 'KK-20260915-CANCEL',
  status: 'cancelled',
  createdAt: new Date(2026, 8, 15, 12, 0, 0, 0).getTime(),
};

const products = [
  { id: 'A', sku: 'CG001', name: 'Chăn cotton đỏ', unit: 'Cái', stockQuantity: 999 },
  { id: 'B', sku: 'GO001', name: 'Gối ôm', unit: 'Cái', stockQuantity: 888 },
];

test('status labels are Vietnamese for all Stocktake states', () => {
  assert.equal(getStocktakeStatusLabel('draft'), 'Nháp');
  assert.equal(getStocktakeStatusLabel('completed'), 'Đã chốt');
  assert.equal(getStocktakeStatusLabel('cancelled'), 'Đã hủy');
});

test('management totals use StocktakeItem snapshot values', () => {
  const totals = getStocktakeTotals(draft);
  assert.deepEqual({ ...totals }, {
    itemCount: 3,
    systemQuantity: 19,
    actualQuantity: 19,
    difference: 0,
    matchedCount: 1,
    shortageCount: 1,
    surplusCount: 1,
  });
});

test('positive negative and zero difference have explicit result text', () => {
  assert.equal(getDifferenceResult(2), 'Thừa');
  assert.equal(getDifferenceResult(-2), 'Thiếu');
  assert.equal(getDifferenceResult(0), 'Khớp');
});

test('detail rows resolve current product metadata but preserve stocktake quantities', () => {
  const rows = buildStocktakeDetailRows(draft, products);
  assert.equal(rows[0].sku, 'CG001');
  assert.equal(rows[0].systemQuantity, 10);
  assert.equal(rows[0].actualQuantity, 8);
  assert.equal(rows[0].difference, -2);
  assert.notEqual(rows[0].systemQuantity, products[0].stockQuantity);
});

test('missing Product fallback retains historical StocktakeItem row', () => {
  const rows = buildStocktakeDetailRows(draft, products);
  const missing = rows.find((row) => row.productId === 'MISSING');
  assert.ok(missing);
  assert.equal(missing.sku, 'MISSING');
  assert.equal(missing.name, 'Sản phẩm không còn trong danh mục');
  assert.equal(missing.systemQuantity, 4);
  assert.equal(missing.actualQuantity, 4);
  assert.equal(missing.difference, 0);
});

test('date filters use inclusive local browser day boundaries', () => {
  const expectedStart = new Date(2026, 8, 14, 0, 0, 0, 0).getTime();
  const expectedEnd = new Date(2026, 8, 14, 23, 59, 59, 999).getTime();
  assert.equal(getLocalDayBoundary('2026-09-14', 'start'), expectedStart);
  assert.equal(getLocalDayBoundary('2026-09-14', 'end'), expectedEnd);

  const filtered = filterStocktakes([draft, completed, cancelled], {
    query: '', status: 'all', fromDate: '2026-09-14', toDate: '2026-09-14',
  });
  assert.deepEqual(filtered.map((item) => item.id), ['draft-1', 'completed-1']);
});

test('status and code/note filtering work together', () => {
  const byStatus = filterStocktakes([draft, completed, cancelled], {
    query: '', status: 'completed', fromDate: '', toDate: '',
  });
  assert.deepEqual(byStatus.map((item) => item.id), ['completed-1']);

  const byCode = filterStocktakes([draft, completed, cancelled], {
    query: 'abc123', status: 'all', fromDate: '', toDate: '',
  });
  assert.deepEqual(byCode.map((item) => item.id), ['draft-1']);

  const byNote = filterStocktakes([draft, completed, cancelled], {
    query: 'kệ phía trước', status: 'draft', fromDate: '', toDate: '',
  });
  assert.deepEqual(byNote.map((item) => item.id), ['draft-1']);
});

test('action matrix allows mutations only for draft', () => {
  assert.deepEqual({ ...getStocktakeActionCapabilities('draft') }, {
    view: true, edit: true, continueScan: true, exportExcel: true, complete: true, cancel: true,
  });
  assert.deepEqual({ ...getStocktakeActionCapabilities('completed') }, {
    view: true, edit: false, continueScan: false, exportExcel: true, complete: false, cancel: false,
  });
  assert.deepEqual({ ...getStocktakeActionCapabilities('cancelled') }, {
    view: true, edit: false, continueScan: false, exportExcel: true, complete: false, cancel: false,
  });
});

test('creator display uses current profile when possible and safe UID fallback otherwise', () => {
  const appUser = { uid: draft.createdBy, displayName: 'Chủ cửa hàng' };
  assert.equal(resolveCreatorDisplay(draft.createdBy, appUser), 'Chủ cửa hàng');
  assert.match(resolveCreatorDisplay('other-user-123456789', appUser), /^Người dùng \(.+….+\)$/);
});

test('individual Excel workbook has two readable sheets and numeric quantity cells', () => {
  const workbook = createStocktakeWorkbook(draft, products, 'Chủ cửa hàng');
  assert.deepEqual(workbook.SheetNames, ['Thong tin phieu', 'Kiem ke']);
  const sheet = workbook.Sheets['Kiem ke'];
  assert.ok(sheet);
  assert.equal(sheet.E2.t, 'n');
  assert.equal(sheet.F2.t, 'n');
  assert.equal(sheet.G2.t, 'n');
  assert.equal(sheet.E2.v, 10);
  assert.equal(sheet.F2.v, 8);
  assert.equal(sheet.G2.v, -2);
  assert.equal(sheet.H2.v, 'Thiếu');
  assert.equal(sheet.B4.v, 'MISSING');
  assert.equal(sheet.C4.v, 'Sản phẩm không còn trong danh mục');
  assert.equal(sheet['!cols'].length, 8);
  assert.equal(sheet['!autofilter'].ref, 'A1:H4');
  assert.equal(buildStocktakeFilename(draft), 'KiemKe_KK-20260914-ABC123.xlsx');
});

test('list Excel workbook exports exactly the already-filtered list', () => {
  const filtered = filterStocktakes([draft, completed, cancelled], {
    query: '', status: 'completed', fromDate: '', toDate: '',
  });
  const workbook = createStocktakeListWorkbook(filtered);
  const sheet = workbook.Sheets['Danh sach phieu'];
  assert.ok(sheet);
  assert.equal(sheet.A2.v, 1);
  assert.equal(sheet.B2.v, completed.code);
  assert.equal(sheet.E2.t, 'n');
  assert.equal(sheet.F2.t, 'n');
  assert.equal(sheet.G2.t, 'n');
  assert.equal(sheet.H2.t, 'n');
  assert.equal(sheet['!cols'].length, 9);
  assert.equal(sheet['!autofilter'].ref, 'A1:I2');
  assert.throws(() => createStocktakeListWorkbook([]), /Không có phiếu kiểm kê phù hợp để xuất/);
  assert.equal(buildStocktakeListFilename(new Date(2026, 8, 14, 12).getTime()), 'DanhSachPhieuKiemKe_2026-09-14.xlsx');
});

test('Excel export module is pure and read-only', () => {
  const source = fs.readFileSync(exportSourcePath, 'utf8');
  assert.doesNotMatch(source, /firebase\/database/);
  assert.doesNotMatch(source, /commitStockOperation/);
  assert.doesNotMatch(source, /createStocktakeDraft|updateStocktakeDraft|completeStocktake|cancelStocktakeDraft/);
  assert.doesNotMatch(source, /auditLogs|stockQuantity\s*=/);
});

test('management UI keeps realtime selected id semantics and no hard delete action', () => {
  const page = fs.readFileSync('src/modules/stocktake/StocktakePage.tsx', 'utf8');
  const management = fs.readFileSync('src/modules/stocktake/StocktakeManagement.tsx', 'utf8');
  assert.match(page, /selectedStocktakeId/);
  assert.match(management, /stocktakes\.find\(\(stocktake\) => stocktake\.id === selectedStocktakeId\)/);
  assert.match(management, /Xuất danh sách/);
  assert.match(management, /Tiếp tục quét/);
  assert.doesNotMatch(`${page}\n${management}`, /Xóa vĩnh viễn|deleteStocktake|hard delete/i);
});

test('STK-003 scanner and existing draft contracts remain in the integrated page', () => {
  const page = fs.readFileSync('src/modules/stocktake/StocktakePage.tsx', 'utf8');
  assert.match(page, /<BarcodeScanner[\s\S]*scanPolicy="leave-to-rearm"/);
  assert.match(page, /findProductByScannedCode/);
  assert.match(page, /draftProductIds/);
  assert.match(page, /loadDraft\(stocktake, 'scan'\)/);
  assert.match(page, /completeStocktake/);
  assert.match(page, /cancelStocktakeDraft/);
  assert.doesNotMatch(page, /firebase\/database|increment\s*\(/);
});

test('STK-004 responsive CSS uses desktop table and mobile cards/detail without page overflow', () => {
  const css = fs.readFileSync('src/modules/stocktake/stocktakeManagement.css', 'utf8');
  assert.match(css, /\.stk-management-table-wrap/);
  assert.match(css, /\.stk-management-mobile-list\s*\{[\s\S]*display: none/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.stk-management-table-wrap\s*\{\s*display: none/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.stk-management-mobile-list\s*\{\s*display: grid/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.stk-detail-table-wrap\s*\{\s*display: none/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*\.stk-detail-mobile-list\s*\{\s*display: grid/);
  assert.match(css, /@media \(max-width: 430px\)/);
});
