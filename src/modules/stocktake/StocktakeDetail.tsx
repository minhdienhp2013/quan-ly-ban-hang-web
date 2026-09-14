import type { AppUser, Product, Stocktake } from '../../types/models';
import {
  buildStocktakeDetailRows,
  getDifferenceResult,
  getStocktakeActionCapabilities,
  getStocktakeStatusLabel,
  getStocktakeTotals,
  resolveCreatorDisplay,
} from './stocktakeManagementViewModel';

interface StocktakeDetailProps {
  stocktake: Stocktake;
  products: readonly Product[];
  appUser: AppUser | null;
  busy: boolean;
  onClose: () => void;
  onEdit: (stocktake: Stocktake) => void;
  onContinueScan: (stocktake: Stocktake) => void;
  onExport: (stocktake: Stocktake) => void;
  onComplete: (stocktake: Stocktake) => void;
  onCancel: (stocktake: Stocktake) => void;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function formatDifference(value: number) {
  if (value > 0) return `+${formatQuantity(value)}`;
  return formatQuantity(value);
}

function dateTime(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

export default function StocktakeDetail({
  stocktake,
  products,
  appUser,
  busy,
  onClose,
  onEdit,
  onContinueScan,
  onExport,
  onComplete,
  onCancel,
}: StocktakeDetailProps) {
  const rows = buildStocktakeDetailRows(stocktake, products);
  const totals = getStocktakeTotals(stocktake);
  const actions = getStocktakeActionCapabilities(stocktake.status);
  const creator = resolveCreatorDisplay(stocktake.createdBy, appUser);

  return (
    <div className="stk-management-modal-backdrop" role="presentation">
      <section
        className="stk-management-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stk-detail-title"
      >
        <header className="stk-detail-header">
          <div>
            <p className="eyebrow">Chi tiết phiếu kiểm kê</p>
            <h2 id="stk-detail-title">{stocktake.code}</h2>
            <span className={`stk-status stk-status--${stocktake.status}`}>
              {getStocktakeStatusLabel(stocktake.status)}
            </span>
          </div>
          <button className="button button--secondary stk-management-touch" type="button" onClick={onClose}>
            Đóng
          </button>
        </header>

        <div className="stk-detail-body">
          <section className="stk-detail-meta" aria-label="Thông tin phiếu kiểm kê">
            <div><span>Mã phiếu</span><strong>{stocktake.code}</strong></div>
            <div><span>Ngày tạo</span><strong>{dateTime(stocktake.createdAt)}</strong></div>
            <div><span>Ngày chốt</span><strong>{dateTime(stocktake.completedAt)}</strong></div>
            <div><span>Người tạo</span><strong>{creator}</strong></div>
            <div className="stk-detail-meta__note"><span>Ghi chú</span><strong>{stocktake.note || '—'}</strong></div>
          </section>

          <section className="stk-detail-summary" aria-label="Tổng kết phiếu kiểm kê">
            <div><span>Tổng mặt hàng</span><strong>{totals.itemCount}</strong></div>
            <div><span>Khớp</span><strong>{totals.matchedCount}</strong></div>
            <div><span>Thiếu</span><strong>{totals.shortageCount}</strong></div>
            <div><span>Thừa</span><strong>{totals.surplusCount}</strong></div>
            <div><span>Tổng tồn hệ thống</span><strong>{formatQuantity(totals.systemQuantity)}</strong></div>
            <div><span>Tổng thực tế</span><strong>{formatQuantity(totals.actualQuantity)}</strong></div>
            <div><span>Tổng chênh lệch</span><strong>{formatDifference(totals.difference)}</strong></div>
          </section>

          <div className="stk-detail-table-wrap">
            <table className="stk-detail-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Mã hàng</th>
                  <th>Tên hàng</th>
                  <th>ĐVT</th>
                  <th>Tồn hệ thống</th>
                  <th>Thực tế</th>
                  <th>Chênh lệch</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.productId}-${index}`}>
                    <td>{index + 1}</td>
                    <td><strong>{row.sku}</strong></td>
                    <td>
                      {row.name}
                      {row.productMissing ? <small>Sản phẩm không còn trong danh mục</small> : null}
                    </td>
                    <td>{row.unit}</td>
                    <td className="stk-number">{formatQuantity(row.systemQuantity)}</td>
                    <td className="stk-number">{formatQuantity(row.actualQuantity)}</td>
                    <td className={`stk-number stk-difference stk-difference--${getDifferenceResult(row.difference).toLocaleLowerCase('vi')}`}>
                      <strong>{formatDifference(row.difference)}</strong>
                      <small>{row.result}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stk-detail-mobile-list">
            {rows.map((row, index) => (
              <article className="stk-detail-mobile-card" key={`${row.productId}-mobile-${index}`}>
                <div className="stk-detail-mobile-card__heading">
                  <div><strong>{row.name}</strong><span>{row.sku} · {row.unit}</span></div>
                  <span className={`stk-result stk-result--${row.result === 'Khớp' ? 'match' : row.result === 'Thiếu' ? 'shortage' : 'surplus'}`}>
                    {formatDifference(row.difference)} · {row.result}
                  </span>
                </div>
                <div className="stk-detail-mobile-card__quantities">
                  <span>Hệ thống <strong>{formatQuantity(row.systemQuantity)}</strong></span>
                  <span>Thực tế <strong>{formatQuantity(row.actualQuantity)}</strong></span>
                </div>
                {row.productMissing ? <small>Sản phẩm không còn trong danh mục. Dòng lịch sử vẫn được giữ nguyên.</small> : null}
              </article>
            ))}
          </div>

          <div className="stk-detail-actions">
            {actions.edit ? <button className="button button--secondary stk-management-touch" type="button" disabled={busy} onClick={() => onEdit(stocktake)}>Sửa</button> : null}
            {actions.continueScan ? <button className="button button--secondary stk-management-touch" type="button" disabled={busy} onClick={() => onContinueScan(stocktake)}>Tiếp tục quét</button> : null}
            <button className="button button--secondary stk-management-touch" type="button" disabled={busy} onClick={() => onExport(stocktake)}>Xuất Excel</button>
            {actions.complete ? <button className="button button--primary stk-management-touch" type="button" disabled={busy} onClick={() => onComplete(stocktake)}>Chốt</button> : null}
            {actions.cancel ? <button className="button button--secondary stk-management-touch" type="button" disabled={busy} onClick={() => onCancel(stocktake)}>Hủy</button> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
