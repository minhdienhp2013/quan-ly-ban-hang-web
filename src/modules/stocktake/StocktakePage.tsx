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

type EntryMode = 'manual' | 'scan';
type ScanPhase = 'scanning' | 'review';
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
    };

type SafariAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function dateTime(value: number) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

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
    const onError = (cause: Error) => setError(cause.message);
    try {
      const unsubProducts = subscribeProducts(setProducts, onError);
      const unsubStocktakes = subscribeStocktakes(setStocktakes, onError);
      return () => {
        unsubProducts();
        unsubStocktakes();
      };
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Không thể kết nối dữ liệu kiểm kê.'));
      return undefined;
    }
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    const context = audioContextRef.current;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const currentDraft = editingId
    ? stocktakes.find((item) => item.id === editingId && item.status === 'draft')
    : undefined;

  const draftProductIds = useMemo(
    () => currentDraft ? new Set(currentDraft.items.map((item) => item.productId)) : undefined,
    [currentDraft],
  );

  const draftSystemQuantity = useMemo(
    () => new Map(currentDraft?.items.map((item) => [item.productId, item.systemQuantity]) ?? []),
    [currentDraft],
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

  function showScanFeedback(next: ScanFeedback, timeoutMs = 1800) {
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
        }, 2400);
      } else if (outcome.reason === 'inactive') {
        showScanFeedback({
          kind: 'warning',
          title: 'Sản phẩm đã ngừng kinh doanh',
          detail: match ? `${match.product.sku} - ${match.product.name}` : result.value,
        }, 2400);
      } else {
        showScanFeedback({
          kind: 'warning',
          title: 'Sản phẩm này chưa có trong phiếu kiểm kê hiện tại.',
          detail: match ? `${match.product.sku} - ${match.product.name}` : result.value,
        }, 2600);
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

  function loadDraft(draft: Stocktake) {
    const countsByProductId = Object.fromEntries(
      draft.items.map((item) => [item.productId, item.actualQuantity]),
    );
    commitSession(createStocktakeScanSession(countsByProductId));
    setNote(draft.note || '');
    setEditingId(draft.id);
    setEntryMode('manual');
    setScanPhase('scanning');
    setScanFeedback(null);
    setError(null);
    setSuccess(null);
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

  return (
    <div className="inv-shell stk-shell">
      <header className="inv-page-header">
        <div>
          <p className="eyebrow">STK-001 / STK-002 / STK-003</p>
          <h1>Kiểm kê</h1>
          <p className="muted">Đếm thực tế bằng nhập tay hoặc quét liên tục. Chỉ khi bấm Chốt mới điều chỉnh kho.</p>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {success && <p className="inv-success">{success}</p>}

      <section className="inv-card stk-editor">
        <div className="inv-card__header">
          <div>
            <h2>{currentDraft ? `Sửa ${currentDraft.code}` : 'Tạo phiếu kiểm kê nháp'}</h2>
            <p className="muted">
              Không có số lượng = chưa xác nhận. Số 0 chỉ được lưu khi bạn chủ động xác nhận bằng 0.
            </p>
          </div>
        </div>

        <div className="stk-mode-toggle" role="group" aria-label="Chọn cách nhập số lượng kiểm kê">
          <button
            className={`button ${entryMode === 'manual' ? 'button--primary' : 'button--secondary'}`}
            type="button"
            onClick={() => setEntryMode('manual')}
          >
            Nhập thủ công
          </button>
          <button
            className={`button ${entryMode === 'scan' ? 'button--primary' : 'button--secondary'}`}
            type="button"
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
                  <BarcodeScanner onScan={handleAcceptedScan} scanPolicy="leave-to-rearm" />
                  <button
                    className="button button--secondary stk-end-scan"
                    type="button"
                    onClick={() => setScanPhase('review')}
                  >
                    Kết thúc quét
                  </button>
                </div>

                <aside className="stk-scan-side" aria-label="Kết quả quét kiểm kê">
                  <div className="stk-scan-stats">
                    <div><span>Tổng lượt quét</span><strong>{session.acceptedScanCount}</strong></div>
                    <div><span>Mặt hàng đã quét</span><strong>{scannedProductCount}</strong></div>
                  </div>

                  <div className="stk-feedback-slot" aria-live="polite">
                    {scanFeedback ? (
                      <div className={`stk-feedback stk-feedback--${scanFeedback.kind}`}>
                        <strong>{scanFeedback.kind === 'success' ? `✓ ${scanFeedback.title}` : scanFeedback.title}</strong>
                        {scanFeedback.kind === 'success' ? (
                          <>
                            <span>{scanFeedback.code}</span>
                            <span>{scanFeedback.name}</span>
                            <b>+1 · Đã đếm: {formatQuantity(scanFeedback.quantity)}</b>
                          </>
                        ) : (
                          <span>{scanFeedback.detail}</span>
                        )}
                      </div>
                    ) : (
                      <p className="muted">Mỗi accepted scan hợp lệ cộng đúng 1 vào số lượng thực tế.</p>
                    )}
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
                    <p className="muted">Camera đã dừng. Số lượng vẫn nằm trong phiên kiểm kê và chưa ghi Firebase.</p>
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
          <button className="button button--primary" type="button" disabled={busy || !appUser} onClick={saveDraft}>
            {busy ? 'Đang lưu...' : currentDraft ? 'Cập nhật phiếu nháp' : 'Lưu phiếu nháp'}
          </button>
          {currentDraft && (
            <button className="button button--secondary" type="button" disabled={busy} onClick={stopEditingDraft}>
              Bỏ sửa
            </button>
          )}
        </div>
      </section>

      <section className="inv-card">
        <div>
          <h2>Lịch sử kiểm kê</h2>
          <p className="muted">Nếu tồn kho đã thay đổi sau lúc tạo nháp, hệ thống sẽ chặn chốt để tránh áp dụng chênh lệch cũ.</p>
        </div>
        {stocktakes.length === 0 ? (
          <p className="muted">Chưa có phiếu kiểm kê.</p>
        ) : (
          <div className="inv-list">
            {stocktakes.slice(0, 100).map((item) => (
              <article className="inv-record" key={item.id}>
                <div className="inv-record__meta">
                  <strong>{item.code} · {item.items.length} sản phẩm</strong>
                  <span>{dateTime(item.createdAt)} · Tổng chênh lệch {item.items.reduce((sum, row) => sum + row.difference, 0)}</span>
                  <span className={`inv-badge ${item.status === 'completed' ? 'inv-badge--ok' : item.status === 'cancelled' ? 'inv-badge--cancelled' : ''}`}>
                    {item.status === 'draft' ? 'Nháp' : item.status === 'completed' ? 'Đã chốt' : 'Đã hủy'}
                  </span>
                </div>
                <div className="inv-record__actions">
                  {item.status === 'draft' && (
                    <>
                      <button className="button button--secondary" type="button" disabled={busy} onClick={() => loadDraft(item)}>Sửa</button>
                      <button className="button button--primary" type="button" disabled={busy} onClick={() => handleComplete(item)}>Chốt kiểm kê</button>
                      <button className="button button--secondary" type="button" disabled={busy} onClick={() => handleCancel(item)}>Hủy</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
