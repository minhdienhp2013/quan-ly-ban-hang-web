import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createStocktakeScanSession,
  setConfirmedQuantity,
  adjustConfirmedQuantity,
  acceptResolvedStocktakeScan,
  undoLastAcceptedScan,
  toStocktakeCountInputs,
} from '../src/modules/stocktake/stocktakeScanSession.ts';

const productA = { id: 'A', active: true };
const productB = { id: 'B', active: true };
const inactive = { id: 'OFF', active: false };

test('accepted A increments exactly once per accepted callback', () => {
  let state = createStocktakeScanSession();
  const first = acceptResolvedStocktakeScan(state, productA);
  assert.equal(first.kind, 'accepted');
  state = first.state;
  assert.equal(state.countsByProductId.A, 1);
  assert.equal(state.acceptedScanCount, 1);

  const second = acceptResolvedStocktakeScan(state, productA);
  assert.equal(second.kind, 'accepted');
  state = second.state;
  assert.equal(state.countsByProductId.A, 2);
  assert.equal(state.acceptedScanCount, 2);
});

test('A -> B -> A produces A2 B1', () => {
  let state = createStocktakeScanSession();
  for (const product of [productA, productB, productA]) {
    const outcome = acceptResolvedStocktakeScan(state, product);
    assert.equal(outcome.kind, 'accepted');
    state = outcome.state;
  }
  assert.deepEqual({ ...state.countsByProductId }, { A: 2, B: 1 });
  assert.equal(state.acceptedScanCount, 3);
});

test('unknown, inactive and product outside existing draft do not increment', () => {
  const initial = createStocktakeScanSession();

  const unknown = acceptResolvedStocktakeScan(initial, null);
  assert.equal(unknown.kind, 'rejected');
  assert.equal(unknown.reason, 'unknown');
  assert.deepEqual({ ...unknown.state.countsByProductId }, {});

  const inactiveOutcome = acceptResolvedStocktakeScan(initial, inactive);
  assert.equal(inactiveOutcome.kind, 'rejected');
  assert.equal(inactiveOutcome.reason, 'inactive');
  assert.deepEqual({ ...inactiveOutcome.state.countsByProductId }, {});

  const allowed = new Set(['B']);
  const outsideDraft = acceptResolvedStocktakeScan(initial, productA, allowed);
  assert.equal(outsideDraft.kind, 'rejected');
  assert.equal(outsideDraft.reason, 'not-in-draft');
  assert.deepEqual({ ...outsideDraft.state.countsByProductId }, {});
});

test('manual +1 and -1 stay local and never go below zero', () => {
  let state = createStocktakeScanSession();
  state = adjustConfirmedQuantity(state, 'A', 1);
  assert.equal(state.countsByProductId.A, 1);
  assert.equal(state.acceptedScanCount, 0);
  assert.deepEqual([...state.scanUndoStack], []);

  state = adjustConfirmedQuantity(state, 'A', -1);
  assert.equal(state.countsByProductId.A, 0);

  state = adjustConfirmedQuantity(state, 'A', -1);
  assert.equal(state.countsByProductId.A, 0);
});

test('direct quantity edit supports explicit zero and blank removal', () => {
  let state = createStocktakeScanSession();
  state = setConfirmedQuantity(state, 'A', 25);
  assert.equal(state.countsByProductId.A, 25);

  state = setConfirmedQuantity(state, 'A', 0);
  assert.equal(Object.hasOwn(state.countsByProductId, 'A'), true);
  assert.equal(state.countsByProductId.A, 0);

  const withZero = toStocktakeCountInputs(state.countsByProductId);
  assert.deepEqual(Array.from(withZero, (item) => ({ ...item })), [{ productId: 'A', actualQuantity: 0 }]);

  state = setConfirmedQuantity(state, 'A', null);
  assert.equal(Object.hasOwn(state.countsByProductId, 'A'), false);
  assert.deepEqual(Array.from(toStocktakeCountInputs(state.countsByProductId), (item) => ({ ...item })), []);
});

test('missing key is not treated as confirmed zero', () => {
  const state = createStocktakeScanSession({ A: 0 });
  const inputs = toStocktakeCountInputs(state.countsByProductId);
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].productId, 'A');
  assert.equal(inputs[0].actualQuantity, 0);
  assert.equal(Object.hasOwn(state.countsByProductId, 'B'), false);
});

test('undo removes only the last accepted scan contribution', () => {
  let state = createStocktakeScanSession({ A: 7 });
  const accepted = acceptResolvedStocktakeScan(state, productA);
  assert.equal(accepted.kind, 'accepted');
  state = accepted.state;
  assert.equal(state.countsByProductId.A, 8);

  const undone = undoLastAcceptedScan(state);
  assert.equal(undone.undoneProductId, 'A');
  assert.equal(undone.state.countsByProductId.A, 7);
  assert.equal(undone.state.acceptedScanCount, 0);
});

test('undo stack empty is safe', () => {
  const state = createStocktakeScanSession({ A: 4 });
  const outcome = undoLastAcceptedScan(state);
  assert.equal(outcome.undoneProductId, null);
  assert.equal(outcome.state, state);
});

test('quantity 999 increments to 1000 without business cap', () => {
  const state = createStocktakeScanSession({ A: 999 });
  const outcome = acceptResolvedStocktakeScan(state, productA);
  assert.equal(outcome.kind, 'accepted');
  assert.equal(outcome.state.countsByProductId.A, 1000);
});

test('500 accepted scans produce exact expected count', () => {
  let state = createStocktakeScanSession();
  for (let index = 0; index < 500; index += 1) {
    const outcome = acceptResolvedStocktakeScan(state, productA);
    assert.equal(outcome.kind, 'accepted');
    state = outcome.state;
  }
  assert.equal(state.countsByProductId.A, 500);
  assert.equal(state.acceptedScanCount, 500);
  assert.equal(state.scanUndoStack.length, 500);
});

test('Stocktake integration uses shared leave-to-rearm scanner without duplicate workaround', () => {
  const source = fs.readFileSync('src/modules/stocktake/StocktakePage.tsx', 'utf8');
  assert.match(source, /findProductByScannedCode/);
  assert.match(source, /<BarcodeScanner[\s\S]*scanPolicy="leave-to-rearm"/);
  assert.doesNotMatch(source, /duplicateWindowMs/);
  assert.doesNotMatch(source, /createPresenceRearmGate|presenceRearm/);
  assert.doesNotMatch(source, /firebase\/database/);
  assert.doesNotMatch(source, /increment\s*\(/);
  assert.match(source, /createStocktakeDraft/);
  assert.match(source, /updateStocktakeDraft/);
  assert.match(source, /completeStocktake/);
});

test('Stocktake business feedback distinguishes camera decode from inventory result', () => {
  const source = fs.readFileSync('src/modules/stocktake/StocktakePage.tsx', 'utf8');
  const css = fs.readFileSync('src/modules/stocktake/stocktake.css', 'utf8');

  assert.match(source, /Kết quả kiểm kê/);
  assert.match(source, /Đã quét thành công/);
  assert.match(source, /ĐÃ CỘNG \+1/);
  assert.match(source, /Không cộng vào kiểm kê/);
  assert.match(source, /Không tìm thấy sản phẩm/);
  assert.match(source, /Sản phẩm đã ngừng kinh doanh/);
  assert.match(source, /Sản phẩm này chưa có trong phiếu kiểm kê hiện tại/);
  assert.match(source, /Chỉ khi xuất hiện thông báo xanh/);
  assert.match(css, /Trạng thái camera:/);
  assert.match(css, /\.stk-camera-panel \.qr-status::before/);
  assert.match(source, /playSuccessBeep\(\)/);
});

test('Stocktake UX exposes accessible mode state and non-misleading review copy', () => {
  const source = fs.readFileSync('src/modules/stocktake/StocktakePage.tsx', 'utf8');
  assert.match(source, /aria-pressed=\{entryMode === 'manual'\}/);
  assert.match(source, /aria-pressed=\{entryMode === 'scan'\}/);
  assert.match(source, /aria-live=\{liveMode\}/);
  assert.match(source, /role=\{alertRole\}/);
  assert.match(source, /Camera đã dừng\. Các thay đổi hiện tại chưa được lưu\./);
  assert.match(source, /Lưu phiếu nháp để ghi lại kết quả kiểm kê\./);
  assert.doesNotMatch(source, /chưa ghi Firebase/);
});

test('Stocktake phone CSS keeps business feedback in camera workflow and reduces nested padding', () => {
  const css = fs.readFileSync('src/modules/stocktake/stocktake.css', 'utf8');
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /\.stk-camera-panel\s*\{\s*order: 1;/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.stk-camera-panel\s*\{\s*padding: 7px;/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*\.stk-camera-panel \.qr-scanner\s*\{\s*padding: 7px;/);
});
