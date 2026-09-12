import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { StockMovementType } from '../../types/models';
import BackupPanel from '../backup/BackupPanel';
import { exportReportExcel } from './reportExcel';
import {
  buildCustomRange,
  buildPresetRange,
  loadReport,
  type ReportBundle,
  type ReportPreset,
  type ReportRange,
} from './reportService';
import './reports.css';

const PRESETS: { id: Exclude<ReportPreset, 'custom'>; label: string }[] = [
  { id: 'today', label: 'Hôm nay' }, { id: 'yesterday', label: 'Hôm qua' }, { id: 'week', label: 'Tuần' },
  { id: 'month', label: 'Tháng' }, { id: 'quarter', label: 'Quý' }, { id: 'year', label: 'Năm' },
];
const MOVEMENT_TYPES: StockMovementType[] = ['OPENING_BALANCE', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'STOCK_OUT', 'STOCK_OUT_REVERSAL', 'STOCKTAKE_ADJUSTMENT', 'MANUAL_ADJUSTMENT'];

function vnd(value: number) { return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)} ₫`; }
function number(value: number) { return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value); }
function dateTime(value: number) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value); }
function inputDate(value: Date) { const y = value.getFullYear(); const m = String(value.getMonth() + 1).padStart(2, '0'); const d = String(value.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }

export default function ReportsPage() {
  const { appUser } = useAuth();
  const [preset, setPreset] = useState<ReportPreset>('today');
  const [range, setRange] = useState<ReportRange>(() => buildPresetRange('today'));
  const [customFrom, setCustomFrom] = useState(() => inputDate(new Date()));
  const [customTo, setCustomTo] = useState(() => inputDate(new Date()));
  const [data, setData] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [movementType, setMovementType] = useState<StockMovementType | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    void loadReport(range).then((next) => { if (!cancelled) setData(next); }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể tải báo cáo.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const selectPreset = (next: Exclude<ReportPreset, 'custom'>) => {
    setPreset(next); setRange(buildPresetRange(next));
  };

  const applyCustom = () => {
    try { setError(''); setPreset('custom'); setRange(buildCustomRange(customFrom, customTo)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Khoảng ngày không hợp lệ.'); }
  };

  const filteredMovements = useMemo(() => data?.movements.filter((item) => movementType === 'all' || item.type === movementType) ?? [], [data, movementType]);

  if (!appUser) return null;

  return (
    <div className="reports-shell">
      <header className="report-page-header">
        <div>
          <p className="eyebrow">REP-001 → REP-008</p>
          <h1>Báo cáo & dữ liệu</h1>
          <p className="muted">Doanh thu, giá vốn và lợi nhuận đọc từ snapshot giao dịch; báo cáo không thay đổi tồn kho hay lịch sử.</p>
        </div>
        <button className="button button--secondary report-touch" type="button" disabled={!data || loading} onClick={() => data && exportReportExcel(data)}>Xuất báo cáo Excel</button>
      </header>

      <section className="report-card report-filters" aria-label="Bộ lọc thời gian">
        <div className="report-preset-row">
          {PRESETS.map((item) => <button key={item.id} className={`report-chip${preset === item.id ? ' report-chip--active' : ''}`} type="button" onClick={() => selectPreset(item.id)}>{item.label}</button>)}
          <span className={`report-chip report-chip--static${preset === 'custom' ? ' report-chip--active' : ''}`}>Tùy chọn</span>
        </div>
        <div className="report-custom-range">
          <label className="report-field">Từ ngày<input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label className="report-field">Đến ngày<input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
          <button className="button button--secondary report-touch" type="button" onClick={applyCustom}>Áp dụng khoảng ngày</button>
        </div>
        <strong className="report-range-label">Đang xem: {range.label}</strong>
      </section>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {loading ? <div className="report-loading">Đang tổng hợp dữ liệu…</div> : null}

      {data && !loading ? (
        <>
          <section className="report-summary-grid" aria-label="Tổng quan báo cáo">
            <article className="report-stat"><span>Doanh thu thuần</span><strong>{vnd(data.summary.revenue)}</strong><small>{data.summary.completedSales} đơn completed</small></article>
            <article className="report-stat"><span>Giá vốn snapshot</span><strong>{vnd(data.summary.costOfGoods)}</strong><small>Không tính lại từ Product.costPrice</small></article>
            <article className="report-stat"><span>Lợi nhuận gộp</span><strong>{vnd(data.summary.grossProfit)}</strong><small>Doanh thu − giá vốn</small></article>
            <article className="report-stat"><span>Chi phí hợp lệ</span><strong>{vnd(data.summary.expenseTotal)}</strong><small>Expense status completed</small></article>
            <article className="report-stat report-stat--emphasis"><span>Lợi nhuận ròng</span><strong>{vnd(data.summary.netProfit)}</strong><small>Lợi nhuận gộp − chi phí</small></article>
            <article className="report-stat"><span>Nhập hàng</span><strong>{vnd(data.summary.purchaseTotal)}</strong><small>Phiếu nhập completed trong kỳ</small></article>
          </section>

          {data.warnings.length ? <div className="report-warning" role="status"><strong>Cảnh báo dữ liệu legacy</strong><ul>{data.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}

          <section className="report-card">
            <div className="report-section-heading"><div><p className="eyebrow">REP-001 → REP-004</p><h2>Bán hàng và lợi nhuận</h2></div></div>
            <div className="report-table-wrap">
              <table className="report-table"><thead><tr><th>Thời gian</th><th>Mã đơn</th><th>Khách hàng</th><th>Doanh thu</th><th>Giá vốn snapshot</th><th>Lợi nhuận gộp</th></tr></thead>
                <tbody>{data.sales.length ? data.sales.map((sale) => {
                  const cost = Number.isFinite(Number(sale.costTotal)) ? Math.round(Number(sale.costTotal)) : sale.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.costPrice), 0);
                  return <tr key={sale.id}><td>{dateTime(sale.createdAt)}</td><td>{sale.code}</td><td>{sale.customerName || 'Khách lẻ'}</td><td>{vnd(Number(sale.total) || 0)}</td><td>{vnd(cost)}</td><td>{vnd((Number(sale.total) || 0) - cost)}</td></tr>;
                }) : <tr><td colSpan={6} className="report-empty-cell">Không có đơn completed trong kỳ.</td></tr>}</tbody></table>
            </div>
          </section>

          <section className="report-card">
            <div className="report-section-heading"><div><p className="eyebrow">REP-005</p><h2>Tồn kho hiện tại</h2><p className="muted">Giá trị tồn là ước tính hiện tại = stockQuantity × Product.costPrice hiện tại; không dùng con số này để tính lại COGS lịch sử.</p></div>
              <div className="report-inline-stats"><span>Tổng lượng: <strong>{number(data.summary.inventoryQuantity)}</strong></span><span>Giá trị: <strong>{vnd(data.summary.inventoryValue)}</strong></span><span>Sắp hết: <strong>{data.summary.lowStockCount}</strong></span><span>Hết: <strong>{data.summary.outOfStockCount}</strong></span></div>
            </div>
            <div className="report-table-wrap"><table className="report-table"><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn</th><th>Min</th><th>Trạng thái</th><th>Giá vốn hiện tại</th><th>Giá trị tồn</th></tr></thead>
              <tbody>{data.inventory.length ? data.inventory.map((item) => <tr key={item.productId}><td>{item.sku}</td><td>{item.name}</td><td>{number(item.stockQuantity)} {item.unit || ''}</td><td>{item.minStock == null ? '—' : number(item.minStock)}</td><td><span className={`stock-status stock-status--${item.status}`}>{item.status === 'out' ? 'Hết hàng' : item.status === 'low' ? 'Sắp hết' : 'Bình thường'}</span></td><td>{vnd(item.currentUnitCost)}</td><td>{vnd(item.currentInventoryValue)}</td></tr>) : <tr><td colSpan={7} className="report-empty-cell">Chưa có sản phẩm.</td></tr>}</tbody></table></div>
          </section>

          <section className="report-card">
            <div className="report-section-heading"><div><p className="eyebrow">REP-006</p><h2>Nhập / xuất / stock movements</h2><p className="muted">Nhập hàng: {vnd(data.summary.purchaseTotal)} · Xuất không doanh thu theo snapshot giá vốn: {vnd(data.summary.stockOutValue)}</p></div>
              <label className="report-field report-filter-field">Nghiệp vụ<select value={movementType} onChange={(event) => setMovementType(event.target.value as StockMovementType | 'all')}><option value="all">Tất cả</option>{MOVEMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            </div>
            <div className="report-table-wrap"><table className="report-table"><thead><tr><th>Thời gian</th><th>Nghiệp vụ</th><th>Product ID</th><th>Delta</th><th>Trước</th><th>Sau</th><th>Tham chiếu</th></tr></thead>
              <tbody>{filteredMovements.length ? filteredMovements.map((item) => <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td>{item.type}</td><td>{item.productId}</td><td>{number(item.quantityDelta)}</td><td>{number(item.quantityBefore)}</td><td>{number(item.quantityAfter)}</td><td>{item.referenceId || '—'}</td></tr>) : <tr><td colSpan={7} className="report-empty-cell">Không có movement phù hợp bộ lọc.</td></tr>}</tbody></table></div>
          </section>

          <section className="report-two-column">
            <article className="report-card"><div className="report-section-heading"><div><p className="eyebrow">REP-007</p><h2>Khách hàng</h2></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Khách hàng</th><th>Đơn</th><th>Doanh thu</th><th>Lãi gộp</th></tr></thead><tbody>{data.customers.length ? data.customers.map((item) => <tr key={item.customerId}><td>{item.customerName}</td><td>{item.orderCount}</td><td>{vnd(item.revenue)}</td><td>{vnd(item.grossProfit)}</td></tr>) : <tr><td colSpan={4} className="report-empty-cell">Chưa có dữ liệu.</td></tr>}</tbody></table></div></article>
            <article className="report-card"><div className="report-section-heading"><div><p className="eyebrow">REP-007</p><h2>Nhà cung cấp</h2></div></div><div className="report-table-wrap"><table className="report-table"><thead><tr><th>Nhà cung cấp</th><th>Phiếu nhập</th><th>Giá trị nhập</th></tr></thead><tbody>{data.suppliers.length ? data.suppliers.map((item) => <tr key={item.supplierId}><td>{item.supplierName}</td><td>{item.purchaseCount}</td><td>{vnd(item.purchaseTotal)}</td></tr>) : <tr><td colSpan={3} className="report-empty-cell">Chưa có dữ liệu.</td></tr>}</tbody></table></div></article>
          </section>

          <div className="report-note">Đơn có trạng thái cancelled/refunded không được tính vào doanh thu theo schema hiện tại. Schema chưa có refund amount/timestamp riêng để phân bổ khoản hoàn theo ngày hoàn; báo cáo không tự suy diễn hoặc sửa lịch sử giao dịch.</div>
          <BackupPanel actorUid={appUser.uid} />
        </>
      ) : null}
    </div>
  );
}
