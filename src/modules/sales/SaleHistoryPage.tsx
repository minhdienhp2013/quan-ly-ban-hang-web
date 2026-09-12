import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Sale } from '../../types/models';
import { reverseSale, subscribeSales } from './salesService';

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function paymentLabel(value: Sale['paymentMethod']) {
  if (value === 'bank_transfer') return 'Chuyển khoản';
  if (value === 'other') return 'Khác';
  return 'Tiền mặt';
}

function statusLabel(value: Sale['status']) {
  if (value === 'cancelled') return 'Đã hủy';
  if (value === 'refunded') return 'Đã hoàn';
  return 'Hoàn tất';
}

function startOfLocalDate(value: string) {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function endOfLocalDate(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined;
}

export default function SaleHistoryPage() {
  const { appUser } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | Sale['status']>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [limit, setLimit] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busySaleId, setBusySaleId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const from = startOfLocalDate(fromDate);
  const to = endOfLocalDate(toDate);
  const invalidRange = typeof from === 'number' && typeof to === 'number' && from > to;

  useEffect(() => {
    if (invalidRange) {
      setLoading(false);
      setError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
      return undefined;
    }

    setLoading(true);
    setError(null);
    try {
      return subscribeSales(
        { ...(typeof from === 'number' ? { from } : {}), ...(typeof to === 'number' ? { to } : {}), limit },
        (next) => {
          setSales(next);
          setLoading(false);
        },
        (cause) => {
          setError(cause.message);
          setLoading(false);
        },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải lịch sử đơn bán.');
      setLoading(false);
      return undefined;
    }
  }, [from, to, invalidRange, limit, retryNonce]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('vi');
    return sales.filter((sale) => {
      if (status !== 'all' && sale.status !== status) return false;
      if (!q) return true;
      return [sale.code, sale.customerName, sale.createdBy]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('vi').includes(q));
    });
  }, [sales, search, status]);

  async function handleReverse(sale: Sale, nextStatus: 'cancelled' | 'refunded') {
    if (!appUser || busySaleId) return;
    const verb = nextStatus === 'cancelled' ? 'hủy' : 'hoàn';
    const confirmed = window.confirm(
      `Xác nhận ${verb} đơn ${sale.code}? Toàn bộ số lượng trong đơn sẽ được hoàn lại kho và thao tác không thể hoàn kho lần hai.`,
    );
    if (!confirmed) return;

    setBusySaleId(sale.id);
    setError(null);
    setActionMessage(null);
    try {
      const updated = await reverseSale(sale.id, appUser.uid, nextStatus);
      setActionMessage(`${updated.code}: ${statusLabel(updated.status)}. Tồn kho đã được xử lý an toàn.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Không thể ${verb} đơn.`);
    } finally {
      setBusySaleId(null);
    }
  }

  return (
    <section className="sales-history" aria-label="Lịch sử đơn bán">
      <div className="sales-section-heading">
        <div>
          <p className="sales-eyebrow">SALE-005 / SALE-006</p>
          <h2>Lịch sử đơn hàng</h2>
          <p>Theo dõi snapshot doanh thu, giá vốn, lợi nhuận và hoàn tồn kho theo đúng lịch sử.</p>
        </div>
      </div>

      <div className="sales-filter-grid">
        <label>
          <span>Tìm mã đơn / khách hàng</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="BH-..., tên khách..." />
        </label>
        <label>
          <span>Từ ngày</span>
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </label>
        <label>
          <span>Đến ngày</span>
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <label>
          <span>Trạng thái</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as 'all' | Sale['status'])}>
            <option value="all">Tất cả</option>
            <option value="completed">Hoàn tất</option>
            <option value="cancelled">Đã hủy</option>
            <option value="refunded">Đã hoàn</option>
          </select>
        </label>
      </div>

      {actionMessage && <div className="sales-success" role="status">{actionMessage}</div>}
      {error && (
        <div className="sales-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setRetryNonce((value) => value + 1)}>Thử lại</button>
        </div>
      )}

      {loading ? (
        <div className="sales-empty">Đang tải lịch sử đơn...</div>
      ) : filteredSales.length === 0 ? (
        <div className="sales-empty">Không có đơn bán phù hợp bộ lọc.</div>
      ) : (
        <>
          <div className="sales-history-table-wrap">
            <table className="sales-history-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Ngày giờ</th>
                  <th>Nhân viên</th>
                  <th>Khách hàng</th>
                  <th>Tổng tiền</th>
                  <th>Giá vốn</th>
                  <th>Lợi nhuận</th>
                  <th>Thanh toán</th>
                  <th>Trạng thái</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale) => (
                  <tr key={sale.id}>
                    <td><strong>{sale.code}</strong></td>
                    <td>{formatDateTime(sale.createdAt)}</td>
                    <td>{sale.createdBy === appUser?.uid ? appUser.displayName : `UID ${sale.createdBy.slice(0, 8)}…`}</td>
                    <td>{sale.customerName || 'Khách lẻ'}</td>
                    <td>{formatMoney(sale.total)}</td>
                    <td>{formatMoney(sale.costTotal)}</td>
                    <td>{formatMoney(sale.profit)}</td>
                    <td>{paymentLabel(sale.paymentMethod)}</td>
                    <td><span className={`sales-status sales-status--${sale.status}`}>{statusLabel(sale.status)}</span></td>
                    <td>
                      <button className="sales-link-button" type="button" onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}>
                        {expandedId === sale.id ? 'Đóng' : 'Chi tiết'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sales-history-cards">
            {filteredSales.map((sale) => (
              <article className="sales-history-card" key={sale.id}>
                <div className="sales-history-card__head">
                  <div><strong>{sale.code}</strong><span>{formatDateTime(sale.createdAt)}</span></div>
                  <span className={`sales-status sales-status--${sale.status}`}>{statusLabel(sale.status)}</span>
                </div>
                <dl>
                  <div><dt>Khách hàng</dt><dd>{sale.customerName || 'Khách lẻ'}</dd></div>
                  <div><dt>Tổng tiền</dt><dd>{formatMoney(sale.total)}</dd></div>
                  <div><dt>Giá vốn</dt><dd>{formatMoney(sale.costTotal)}</dd></div>
                  <div><dt>Lợi nhuận</dt><dd>{formatMoney(sale.profit)}</dd></div>
                  <div><dt>Thanh toán</dt><dd>{paymentLabel(sale.paymentMethod)}</dd></div>
                </dl>
                <button className="sales-link-button" type="button" onClick={() => setExpandedId(expandedId === sale.id ? null : sale.id)}>
                  {expandedId === sale.id ? 'Ẩn chi tiết' : 'Xem chi tiết'}
                </button>
              </article>
            ))}
          </div>

          {filteredSales.map((sale) => expandedId === sale.id ? (
            <article className="sales-detail" key={`detail-${sale.id}`}>
              <div className="sales-detail__header">
                <div>
                  <h3>{sale.code}</h3>
                  <p>{formatDateTime(sale.createdAt)} · {sale.customerName || 'Khách lẻ'} · {paymentLabel(sale.paymentMethod)}</p>
                </div>
                <span className={`sales-status sales-status--${sale.status}`}>{statusLabel(sale.status)}</span>
              </div>

              <div className="sales-detail__items">
                {sale.items.map((item, index) => (
                  <div className="sales-detail__item" key={`${item.productId}-${index}`}>
                    <div><strong>{item.name}</strong><span>{item.sku}</span></div>
                    <span>{formatQuantity(item.quantity)} × {formatMoney(item.unitPrice)}</span>
                    <strong>{formatMoney(item.lineTotal)}</strong>
                  </div>
                ))}
              </div>

              <div className="sales-detail__summary">
                <span>Tạm tính <strong>{formatMoney(sale.subtotal)}</strong></span>
                <span>Giảm giá <strong>{formatMoney(sale.discount)}</strong></span>
                <span>Thanh toán <strong>{formatMoney(sale.total)}</strong></span>
                <span>Giá vốn snapshot <strong>{formatMoney(sale.costTotal)}</strong></span>
                <span>Lợi nhuận <strong>{formatMoney(sale.profit)}</strong></span>
              </div>

              {sale.note && <p className="sales-note"><strong>Ghi chú:</strong> {sale.note}</p>}

              {sale.status === 'completed' && (
                <div className="sales-danger-actions">
                  <button type="button" disabled={busySaleId === sale.id} onClick={() => void handleReverse(sale, 'cancelled')}>
                    {busySaleId === sale.id ? 'Đang xử lý...' : 'Hủy đơn + hoàn kho'}
                  </button>
                  <button type="button" disabled={busySaleId === sale.id} onClick={() => void handleReverse(sale, 'refunded')}>
                    {busySaleId === sale.id ? 'Đang xử lý...' : 'Hoàn đơn + hoàn kho'}
                  </button>
                </div>
              )}
            </article>
          ) : null)}
        </>
      )}

      <div className="sales-history-footer">
        <span>Đang tải tối đa {limit} đơn theo khoảng thời gian đã chọn.</span>
        {sales.length >= limit && limit < 200 && (
          <button type="button" onClick={() => setLimit((value) => Math.min(200, value + 50))}>Tải thêm đơn cũ</button>
        )}
        {limit >= 200 && <span>Để xem xa hơn, hãy thu hẹp khoảng ngày.</span>}
      </div>
    </section>
  );
}
