import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Product, Stocktake } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import BarcodeScanner from '../qr/BarcodeScanner';
import { findProductByScannedCode } from '../qr/productLookup';
import type { ScanResult } from '../qr/scannerService';
import '../inventory/inventory.css';
import '../qr/qrPrinting.css';
import './stocktake.css';
import {
  acceptResolvedStocktakeScan,
  adjustConfirmedQuantity,
  createStocktakeScanSession,
  getScannedProductCount,
  setConfirmedQuantity,
  toStocktakeCountInputs,
  undoLastAcceptedScan,
  type StocktakeScanSessionState,
} from './stocktakeScanSession';
import {
  cancelStocktakeDraft,
  completeStocktake,
  createStocktakeDraft,
  subscribeStocktakes,
  updateStocktakeDraft,
} from './stocktakeService';
import StocktakeManagement from './StocktakeManagement';

type EntryMode = 'manual' | 'scan';
type ScanPhase = 'scanning' | 'review';
type StocktakeWorkspace = 'new' | 'manage';
type ScanFeedback =
  | {
      kind: 'success';
      title: 'Đã quét thành công';
      code: string;
      name: string;
      quantity: number;
    }
  | {
      kind: 'error' | 'warning';
      title: string;
      detail: string;
      rejected?: boolean;
    };

type SafariAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function hasConfirmedCount(counts: Record<string, number>, productId: string) {
  return Object.prototype.hasOwnProperty.call(counts, productId);
}

export default function StocktakePage() {
  const { appUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [stocktakesReady, setStocktakesReady] = useState(false);
  const [workspace, setWorkspace] = useState<StocktakeWorkspace>('new');
  const [selectedStocktakeId, setSelectedStocktakeId] = useState<string | null>(null);
  const [session, setSessionState] = useState<StocktakeScanSessionState>(() => createStocktakeScanSession());
  const sessionRef = useRef(session);
  const [entryMode, setEntryMode] = useState<EntryMode>('manual');
  const [scanPhase, setScanPhase] = useState<ScanPhase>('scanning');
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    try {
      const unsubProducts = subscribeProducts(
        (next) => {
          setProducts(next);
          setProductsReady(true);
        },
        (cause) => {
          setProductsReady(true);
          setError(cause.message);
        },
      );
      const unsubStocktakes = subscribeStocktakes(
        (next) => {
          setStocktakes(next);
          setStocktakesReady(true);
        },
        (cause) => {
          setStocktakesReady(true);
          setError(cause.message);
        },
      );
      return () => {
        unsubProducts();
        unsubStocktakes();
      };
    } catch (cause) {
      setProductsReady(true);
      setStocktakesReady(true);
      setError(cause instanceof Error ? cause.message : 'Không thể kết nối dữ liệu kiểm kê.');
      return undefined;
    }
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const editingStocktake = editingId
    ? stocktakes.find((item) => item.id === editingId)
    : undefined;
  const currentDraft = editingStocktake?.status === 'draft' ? editingStocktake : undefined;

  const draftProductIds = useMemo(
    () => editingStocktake ? new Set(editingStocktake.items.map((item) => item.productId)) : undefined,
    [editingStocktake],
  );

  const draftSystemQuantity = useMemo(
    () => new Map(editingStocktake?.items.map((item) => [item.productId, item.systemQuantity]) ?? []),
    [editingStocktake],
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('vi');
    return products.filter((product) =>
      product.active &&
      (!draftProductIds || draftProductIds.has(product.id)) &&
      (!q || `${product.sku} ${product.name}`.toLocaleLowerCase('vi').includes(q)),
    );
  }, [products, search, draftProductIds]);

  const confirmedProducts = useMemo(
    () => products
      .filter((product) => hasConfirmedCount(session.countsByProductId, product.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [products, session.countsByProductId],
  );

  const scannedProductCount = useMemo(() => getScannedProductCount(session), [session]);

  function commitSession(next: StocktakeScanSessionState) {
    sessionRef.current = next;
    setSessionState(next);
  }

  function showScanFeedback(next: ScanFeedback, timeoutMs = 2200) {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setScanFeedback(next);
    feedbackTimerRef.current = window.setTimeout(() => {
      setScanFeedback(null);
      feedbackTimerRef.current = null;
    }, timeoutMs);
  }

  async function ensureAudioReady() {
    try {
      const AudioContextCtor = typeof AudioContext !== 'undefined'
        ? AudioContext
        : (window as SafariAudioWindow).webkitAudioContext;
      if (!AudioContextCtor) return null;
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      return context;
    } catch {
      return null;
    }
  }

  function playSuccessBeep() {
    void (async () => {
      const context = await ensureAudioReady();
      if (!context || context.state === 'closed') return;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.09);
      } catch {
        // Audio feedback must never roll back a successful count.
      }
    })();

    try {
      navigator.vibrate?.(40);
    } catch {
      // Vibration is optional and unsupported on some browsers.
    }
  }

  function activateScanMode() {
    void ensureAudioReady();
    setEntryMode('scan');
    setScanPhase('scanning');
    setError(null);
    setSuccess(null);
  }

  function selectWorkspace(next: StocktakeWorkspace) {
    if (next === 'manage' && entryMode === 'scan' && scanPhase === 'scanning') {
      setScanPhase('review');
    }
    setWorkspace(next);
  }

  function handleAcceptedScan(result: ScanResult) {
    const match = findProductByScannedCode(products, result.value);
    const outcome = acceptResolvedStocktakeScan(
      sessionRef.current,
      match?.product ?? null,
      draftProductIds,
    );

    if (outcome.kind === 'rejected') {
      if (outcome.reason === 'unknown') {
        showScanFeedback({
          kind: 'error',
          title: 'Không tìm thấy sản phẩm',
          detail: `Mã đã quét: ${result.value}`,
          rejected: true,
        }, 2800);
      } else if (outcome.reason === 'inactive') {
        showScanFeedback({
          kind: 'warning',
          title: 'Sản phẩm đã ngừng kinh doanh',
          detail: match ? `${match.product.sku} - ${match.product.name}` : result.value,
          rejected: true,
        }, 2800);
      } else {
        showScanFeedback({
          kind: 'warning',
          title: 'Sản phẩm này chưa có trong phiếu kiểm kê hiện tại',
          detail: match ? `${match.product.sku} - ${match.product.name}` : result.value,
          rejected: true,
        }, 3000);
      }
      return;
    }

    commitSession(outcome.state);
    playSuccessBeep();
    showScanFeedback({
      kind: 'success',
      title: 'Đã quét thành công',
      code: match?.product.sku ?? result.value,
      name: match?.product.name ?? result.value,
      quantity: outcome.quantity,
    });
  }

  function changeManualQuantity(productId: string, rawValue: string) {
    try {
      const next = rawValue === ''
        ? setConfirmedQuantity(sessionRef.current, productId, null)
        : setConfirmedQuantity(sessionRef.current, productId, Number(rawValue));
      commitSession(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Số lượng thực tế không hợp lệ.');
    }
  }

  function adjustQuantity(productId: string, delta: number) {
    commitSession(adjustConfirmedQuantity(sessionRef.current, productId, delta));
  }

  function undoLastScan() {
    const outcome = undoLastAcceptedScan(sessionRef.current);
    if (!outcome.undoneProductId) {
      showScanFeedback({
        kind: 'warning',
        title: 'Không còn lượt quét để hoàn tác',
        detail: 'Các chỉnh sửa thủ công không nằm trong lịch sử hoàn tác lượt quét.',
      });
      return;
    }

    commitSession(outcome.state);
    const product = products.find((item) => item.id === outcome.undoneProductId);
    showScanFeedback({
      kind: 'warning',
      title: 'Đã hoàn tác lượt quét cuối',
      detail: product ? `${product.sku} - ${product.name}` : outcome.undoneProductId,
    });
  }

  async function saveDraft() {
    if (!appUser) return;
    if (editingId && !currentDraft) {
      setError('Phiếu đang sửa không còn ở trạng thái nháp. Hãy tải lại và kiểm tra trạng thái phiếu.');
      return;
    }
    const entered = toStocktakeCountInputs(sessionRef.current.countsByProductId);
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (currentDraft) {
        await updateStocktakeDraft(currentDraft, entered, appUser.uid, note);
        setSuccess(`Đã cập nhật phiếu nháp ${currentDraft.code}.`);
      } else {
        const draft = await createStocktakeDraft(entered, appUser.uid, note);
        setSuccess(`Đã lưu phiếu nháp ${draft.code}. Chỉ khi bấm Chốt mới điều chỉnh kho.`);
      }
      commitSession(createStocktakeScanSession());
      setNote('');
      setEditingId(null);
      setEntryMode('manual');
      setScanPhase('scanning');
      setScanFeedback(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu phiếu kiểm kê.');
    } finally {
      setBusy(false);
    }
  }

  function loadDraft(draft: Stocktake, mode: EntryMode = 'manual') {
    if (draft.status !== 'draft') {
      setError('Chỉ phiếu nháp mới có thể tiếp tục chỉnh sửa hoặc quét.');
      return;
    }
    const countsByProductId = Object.fromEntries(
      draft.items.map((item) => [item.productId, item.actualQuantity]),
    );
    commitSession(createStocktakeScanSession(countsByProductId));
    setNote(draft.note || '');
    setEditingId(draft.id);
    setEntryMode(mode);
    setScanPhase('scanning');
    setScanFeedback(null);
    setSelectedStocktakeId(null);
    setWorkspace('new');
    setError(null);
    setSuccess(null);
    if (mode === 'scan') void ensureAudioReady();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function stopEditingDraft() {
    setEditingId(null);
    setNote('');
    setEntryMode('manual');
    setScanPhase('scanning');
    setScanFeedback(null);
    commitSession(createStocktakeScanSession());
  }

  async function handleComplete(draft: Stocktake) {
    if (!appUser || !window.confirm(`Chốt ${draft.code}? Chênh lệch sẽ được ghi vào tồn kho và tạo STOCKTAKE_ADJUSTMENT.`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await completeStocktake(draft.id, appUser.uid);
      setSuccess(`Đã chốt ${draft.code}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chốt kiểm kê.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(draft: Stocktake) {
    if (!appUser || !window.confirm(`Hủy phiếu nháp ${draft.code}?`)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await cancelStocktakeDraft(draft.id, appUser.uid);
      if (editingId === draft.id) stopEditingDraft();
      setSuccess(`Đã hủy ${draft.code}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hủy phiếu kiểm kê.');
    } finally {
      setBusy(false);
    }
  }

  function renderConfirmedList() {
    if (confirmedProducts.length === 0) {
      return <p className="stk-empty">Chưa có sản phẩm nào được xác nhận số lượng thực tế.</p>;
    }

    return (
      <div className="stk-count-list">
        {confirmedProducts.map((product) => {
          const quantity = session.countsByProductId[product.id];
          const systemQuantity = draftSystemQuantity.get(product.id) ?? product.stockQuantity;
          return (
            <article className="stk-count-card" key={product.id}>
              <div className="stk-count-card__identity">
                <strong>{product.name}</strong>
                <span>{product.sku}</span>
                <small>Tồn hệ thống: {formatQuantity(systemQuantity)} {product.unit || ''}</small>
              </div>
              <div className="stk-stepper" aria-label={`Số lượng thực tế ${product.name}`}>
                <button type="button" onClick={() => adjustQuantity(product.id, -1)} aria-label={`Giảm ${product.name} một`}>
                  −
                </button>
                <input
                  key={`${product.id}-${quantity}`}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.001"
                  defaultValue={quantity}
                  aria-label={`Nhập số lượng thực tế ${product.name}`}
                  onBlur={(event) => changeManualQuantity(product.id, event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
                <button type="button" onClick={() => adjustQuantity(product.id, 1)} aria-label={`Tăng ${product.name} một`}>
                  +
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  function renderCameraFeedback() {
    const liveMode = scanFeedback?.kind === 'success' ? 'polite' : 'assertive';
    const alertRole = scanFeedback && scanFeedback.kind !== 'success' ? 'alert' : 'status';

    return (
      <div className="stk-camera-feedback" aria-label="Kết quả kiểm kê">
        <span className="stk-camera-feedback__label">Kết quả kiểm kê</span>
        <div className="stk-feedback-slot" aria-live={liveMode} role={alertRole}>
          {scanFeedback ? (
            <div className={`stk-feedback stk-feedback--${scanFeedback.kind}`}>
              {scanFeedback.kind === 'success' ? (
                <>
                  <strong>✓ {scanFeedback.title}</strong>
                  <b className="stk-feedback__decision">ĐÃ CỘNG +1</b>
                  <span>{scanFeedback.code}</span>
                  <span>{scanFeedback.name}</span>
                  <b>Đã đếm: {formatQuantity(scanFeedback.quantity)}</b>
                </>
              ) : (
                <>
                  <strong>{scanFeedback.kind === 'error' ? '✕' : '⚠'} {scanFeedback.rejected ? 'Không cộng vào kiểm kê' : scanFeedback.title}</strong>
                  {scanFeedback.rejected ? <b>{scanFeedback.title}</b> : null}
                  <span>{scanFeedback.detail}</span>
                </>
              )}
            </div>
          ) : (
            <p className="stk-feedback-idle">Chờ kết quả kiểm kê sau khi camera đọc mã.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="inv-shell stk-shell">
      <header className="inv-page-header">
        <div>
          <p className="eyebrow">STK-001 / STK-002 / STK-003 / STK-004</p>
          <h1>Kiểm kê</h1>
          <p className="muted">Tạo phiếu kiểm kê mới hoặc quản lý toàn bộ phiếu lịch sử trong cùng một màn hình.</p>
        </div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {success && <p className="inv-success" role="status">{success}</p>}

      <div className="stk-workspace-tabs" role="group" aria-label="Khu vực kiểm kê">
        <button
          className={`button ${workspace === 'new' ? 'button--primary' : 'button--secondary'}`}
          type="button"
          aria-pressed={workspace === 'new'}
          onClick={() => selectWorkspace('new')}
        >
          Kiểm kê mới
        </button>
        <button
          className={`button ${workspace === 'manage' ? 'button--primary' : 'button--secondary'}`}
          type="button"
          aria-pressed={workspace === 'manage'}
          onClick={() => selectWorkspace('manage')}
        >
          Quản lý phiếu
        </button>
      </div>

      {workspace === 'new' ? (
        <section className="inv-card stk-editor">
          <div className="inv-card__header">
            <div>
              <h2>{currentDraft ? `Sửa ${currentDraft.code}` : editingId ? 'Phiếu đang sửa đã đổi trạng thái' : 'Tạo phiếu kiểm kê nháp'}</h2>
              <p className="muted">
                Không có số lượng = chưa xác nhận. Số 0 chỉ được lưu khi bạn chủ động xác nhận bằng 0.
              </p>
            </div>
          </div>

          <div className="stk-mode-toggle" role="group" aria-label="Chọn cách nhập số lượng kiểm kê">
            <button
              className={`button ${entryMode === 'manual' ? 'button--primary' : 'button--secondary'}`}
              type="button"
              aria-pressed={entryMode === 'manual'}
              onClick={() => setEntryMode('manual')}
            >
              Nhập thủ công
            </button>
            <button
              className={`button ${entryMode === 'scan' ? 'button--primary' : 'button--secondary'}`}
              type="button"
              aria-pressed={entryMode === 'scan'}
              onClick={activateScanMode}
            >
              Quét mã liên tục
            </button>
          </div>

          {entryMode === 'manual' ? (
            <div className="stk-manual-mode">
              <div className="stk-manual-toolbar">
                <div>
                  <h3>Nhập số lượng thực tế</h3>
                  <p className="muted">Có thể chuyển sang quét mã rồi quay lại đây mà không mất số đã đếm.</p>
                </div>
                <input
                  className="inv-search"
                  type="search"
                  placeholder="Tìm SKU / tên..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="inv-table-wrap">
                <table className="inv-table stk-manual-table">
                  <thead>
                    <tr><th>SKU</th><th>Sản phẩm</th><th>Tồn hệ thống</th><th>Thực tế</th></tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.sku}</td>
                        <td>{product.name}</td>
                        <td>{formatQuantity(draftSystemQuantity.get(product.id) ?? product.stockQuantity)}</td>
                        <td>
                          <input
                            className="inv-row-input"
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.001"
                            placeholder="Chưa đếm"
                            value={
                              hasConfirmedCount(session.countsByProductId, product.id)
                                ? session.countsByProductId[product.id]
                                : ''
                            }
                            onChange={(event) => changeManualQuantity(product.id, event.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="stk-scan-mode">
              {scanPhase === 'scanning' ? (
                <div className="stk-scan-grid">
                  <div className="stk-camera-panel">
                    <div className="stk-section-heading">
                      <div>
                        <p className="eyebrow">Quét kiểm kê</p>
                        <h3>Camera liên tục</h3>
                      </div>
                    </div>

                    {renderCameraFeedback()}

                    <BarcodeScanner onScan={handleAcceptedScan} scanPolicy="leave-to-rearm" />

                    <p className="stk-scan-guidance">
                      Chỉ khi xuất hiện thông báo xanh “Đã quét thành công” thì số lượng mới được cộng +1.
                      Sau mỗi lượt, đưa mã ra khỏi khung rồi quét mã tiếp theo.
                    </p>

                    <button
                      className="button button--secondary stk-end-scan"
                      type="button"
                      onClick={() => setScanPhase('review')}
                    >
                      Kết thúc quét
                    </button>
                  </div>

                  <aside className="stk-scan-side" aria-label="Tóm tắt phiên kiểm kê">
                    <div className="stk-scan-stats">
                      <div><span>Tổng lượt quét</span><strong>{session.acceptedScanCount}</strong></div>
                      <div><span>Mặt hàng đã quét</span><strong>{scannedProductCount}</strong></div>
                    </div>

                    <button
                      className="button button--secondary stk-undo"
                      type="button"
                      disabled={session.scanUndoStack.length === 0}
                      onClick={undoLastScan}
                    >
                      Hoàn tác lượt quét cuối
                    </button>

                    <div className="stk-scan-list-preview">
                      <h3>Danh sách đã quét / xác nhận</h3>
                      {renderConfirmedList()}
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="stk-review">
                  <div className="stk-review__heading">
                    <div>
                      <p className="eyebrow">Review</p>
                      <h3>Đã kết thúc quét</h3>
                      <p className="muted">Camera đã dừng. Các thay đổi hiện tại chưa được lưu. Lưu phiếu nháp để ghi lại kết quả kiểm kê.</p>
                    </div>
                    <button className="button button--secondary" type="button" onClick={activateScanMode}>
                      Tiếp tục quét
                    </button>
                  </div>
                  <div className="stk-scan-stats">
                    <div><span>Tổng lượt quét</span><strong>{session.acceptedScanCount}</strong></div>
                    <div><span>Mặt hàng đã quét</span><strong>{scannedProductCount}</strong></div>
                  </div>
                  <button
                    className="button button--secondary stk-undo"
                    type="button"
                    disabled={session.scanUndoStack.length === 0}
                    onClick={undoLastScan}
                  >
                    Hoàn tác lượt quét cuối
                  </button>
                  {renderConfirmedList()}
                </div>
              )}
            </div>
          )}

          <label className="inv-field">
            Ghi chú
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>

          <div className="inv-actions">
            <button className="button button--primary" type="button" disabled={busy || !appUser || !productsReady || (Boolean(editingId) && !currentDraft)} onClick={saveDraft}>
              {busy ? 'Đang lưu...' : currentDraft ? 'Cập nhật phiếu nháp' : 'Lưu phiếu nháp'}
            </button>
            {editingId && (
              <button className="button button--secondary" type="button" disabled={busy} onClick={stopEditingDraft}>
                Bỏ sửa
              </button>
            )}
          </div>
        </section>
      ) : (
        <StocktakeManagement
          stocktakes={stocktakes}
          products={products}
          appUser={appUser}
          loading={!stocktakesReady}
          busy={busy}
          selectedStocktakeId={selectedStocktakeId}
          onSelectStocktake={setSelectedStocktakeId}
          onEdit={(stocktake) => loadDraft(stocktake, 'manual')}
          onContinueScan={(stocktake) => loadDraft(stocktake, 'scan')}
          onComplete={(stocktake) => void handleComplete(stocktake)}
          onCancel={(stocktake) => void handleCancel(stocktake)}
        />
      )}
    </div>
  );
}
