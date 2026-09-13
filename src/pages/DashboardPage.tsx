import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import DashboardRankings from '../modules/dashboard/DashboardRankings';
import DashboardRevenueChart from '../modules/dashboard/DashboardRevenueChart';
import DashboardStockWarnings from '../modules/dashboard/DashboardStockWarnings';
import { loadDashboardData, type DashboardDataBundle } from '../modules/dashboard/dashboardService';
import {
  buildDashboardRange,
  buildInventorySummary,
  buildPreviousDashboardRange,
  buildRecentActivity,
  buildRevenueChart,
  buildTopProducts,
  getDashboardComparison,
  getDashboardQuickActions,
  getDashboardVisibility,
  getOwnerMetrics,
  getSoldQuantity,
  getStockWarnings,
  type DashboardComparison,
  type DashboardPreset,
} from '../modules/dashboard/dashboardViewModel';
import '../modules/dashboard/dashboard.css';

const PRESETS: { id: DashboardPreset; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'last7', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
  { id: 'quarter', label: 'Quý này' },
  { id: 'year', label: 'Năm nay' },
];

function vnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function number(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function dateTime(value: number) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value);
}

function ComparisonBadge({ comparison }: { comparison: DashboardComparison }) {
  const symbol = comparison.direction === 'up' ? '↑' : comparison.direction === 'down' ? '↓' : '';
  return (
    <span className={`dashboard-comparison dashboard-comparison--${comparison.direction}`}>
      {symbol ? `${symbol} ` : ''}{comparison.label}
    </span>
  );
}

function LoadingDashboard() {
  return (
    <div className="dashboard-loading" aria-label="Đang tải Tổng quan">
      <div className="dashboard-skeleton dashboard-skeleton--heading" />
      <div className="dashboard-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => <div className="dashboard-skeleton dashboard-skeleton--kpi" key={index} />)}
      </div>
      <div className="dashboard-primary-grid">
        <div className="dashboard-skeleton dashboard-skeleton--chart" />
        <div className="dashboard-skeleton dashboard-skeleton--chart" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { appUser } = useAuth();
  const [preset, setPreset] = useState<DashboardPreset>('today');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [data, setData] = useState<DashboardDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const ranges = useMemo(() => {
    const now = new Date();
    return {
      current: buildDashboardRange(preset, now),
      previous: buildPreviousDashboardRange(preset, now),
    };
  }, [preset, refreshNonce]);

  useEffect(() => {
    if (!appUser) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');

    void loadDashboardData(appUser.role, ranges.current, ranges.previous)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải dữ liệu Tổng quan.');
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [appUser, ranges]);

  if (!appUser) return null;

  const visibility = getDashboardVisibility(appUser.role);
  const inventorySummary = data ? buildInventorySummary(data.inventory) : { active: 0, ok: 0, low: 0, out: 0 };
  const stockWarnings = data ? getStockWarnings(data.inventory) : { low: [], out: [] };
  const topProducts = data ? buildTopProducts(data.sales, 10) : [];
  const recentActivity = data ? buildRecentActivity(data.sales, data.purchases, data.stockOuts, 8) : [];
  const soldQuantity = data ? getSoldQuantity(data.sales) : 0;
  const quickActions = getDashboardQuickActions(appUser.role);

  const ownerData = data?.role === 'owner' ? data : null;
  const ownerMetrics = ownerData ? getOwnerMetrics(ownerData.currentReport.summary, ownerData.sales) : null;
  const previousMetrics = ownerData ? getOwnerMetrics(ownerData.previousReport.summary, ownerData.previousReport.sales) : null;
  const chartPoints = ownerData ? buildRevenueChart(ownerData.sales, preset, ranges.current) : [];

  const inventoryPercent = (count: number) => inventorySummary.active > 0 ? (count / inventorySummary.active) * 100 : 0;
  const inventoryBackground = inventorySummary.active > 0
    ? `conic-gradient(#2d8a57 0 ${inventoryPercent(inventorySummary.ok)}%, #d99a1b ${inventoryPercent(inventorySummary.ok)}% ${inventoryPercent(inventorySummary.ok + inventorySummary.low)}%, #c84c4c ${inventoryPercent(inventorySummary.ok + inventorySummary.low)}% 100%)`
    : '#edf1f6';

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="dashboard-kicker">Tổng quan cửa hàng</p>
          <h1>Xin chào, {appUser.displayName}</h1>
          <p className="dashboard-subtitle">
            {appUser.role === 'owner'
              ? 'Theo dõi bán hàng, lợi nhuận và tồn kho từ dữ liệu giao dịch thật.'
              : 'Theo dõi hoạt động bán hàng và tồn kho. Thông tin tài chính nhạy cảm được ẩn khỏi Dashboard nhân viên.'}
          </p>
        </div>
        <button className="dashboard-refresh" type="button" disabled={loading} onClick={() => setRefreshNonce((value) => value + 1)}>
          {loading ? 'Đang tải…' : 'Làm mới'}
        </button>
      </header>

      <section className="dashboard-period-bar" aria-label="Khoảng thời gian Tổng quan">
        <div className="dashboard-period-chips">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dashboard-period-chip${preset === item.id ? ' is-active' : ''}`}
              aria-pressed={preset === item.id}
              onClick={() => setPreset(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="dashboard-range-label">{ranges.current.label}</span>
      </section>

      {error ? (
        <div className="dashboard-error" role="alert">
          <div><strong>Không thể tải Tổng quan.</strong><span>{error}</span></div>
          <button type="button" onClick={() => setRefreshNonce((value) => value + 1)}>Thử lại</button>
        </div>
      ) : null}

      {loading ? <LoadingDashboard /> : null}

      {!loading && data ? (
        <>
          {visibility.financial && ownerMetrics && previousMetrics ? (
            <section className="dashboard-kpi-grid" aria-label="KPI tài chính">
              <article className="dashboard-kpi-card">
                <span>Doanh thu</span>
                <strong>{vnd(ownerMetrics.revenue)}</strong>
                <div><ComparisonBadge comparison={getDashboardComparison(ownerMetrics.revenue, previousMetrics.revenue)} /><small>so kỳ trước</small></div>
              </article>
              <article className="dashboard-kpi-card">
                <span>Số đơn hàng</span>
                <strong>{number(ownerMetrics.completedSales)}</strong>
                <div><ComparisonBadge comparison={getDashboardComparison(ownerMetrics.completedSales, previousMetrics.completedSales)} /><small>đơn completed</small></div>
              </article>
              <article className="dashboard-kpi-card">
                <span>Lợi nhuận gộp</span>
                <strong>{vnd(ownerMetrics.grossProfit)}</strong>
                <div><ComparisonBadge comparison={getDashboardComparison(ownerMetrics.grossProfit, previousMetrics.grossProfit)} /><small>snapshot COGS</small></div>
              </article>
              <article className="dashboard-kpi-card">
                <span>Chi phí</span>
                <strong>{vnd(ownerMetrics.expenseTotal)}</strong>
                <div><ComparisonBadge comparison={getDashboardComparison(ownerMetrics.expenseTotal, previousMetrics.expenseTotal)} /><small>Expense completed</small></div>
              </article>
            </section>
          ) : (
            <section className="dashboard-kpi-grid" aria-label="KPI vận hành">
              <article className="dashboard-kpi-card"><span>Số đơn completed</span><strong>{number(data.sales.length)}</strong><small>Trong kỳ đã chọn</small></article>
              <article className="dashboard-kpi-card"><span>Sản phẩm đã bán</span><strong>{number(soldQuantity)}</strong><small>Tổng SaleItem.quantity</small></article>
              <article className="dashboard-kpi-card"><span>Sắp hết</span><strong>{inventorySummary.low}</strong><small>SKU active</small></article>
              <article className="dashboard-kpi-card"><span>Đã hết</span><strong>{inventorySummary.out}</strong><small>SKU active</small></article>
            </section>
          )}

          <div className={`dashboard-primary-grid${visibility.revenueChart ? '' : ' dashboard-primary-grid--single'}`}>
            {visibility.revenueChart && ownerData ? (
              <DashboardRevenueChart points={chartPoints} rangeLabel={ranges.current.label} />
            ) : null}
            <DashboardStockWarnings low={stockWarnings.low} out={stockWarnings.out} />
          </div>

          {visibility.financial && ownerMetrics ? (
            <section className="dashboard-card dashboard-sales-summary" aria-labelledby="dashboard-sales-summary-title">
              <div className="dashboard-section-heading dashboard-section-heading--compact">
                <div><p className="dashboard-kicker">Trong kỳ</p><h2 id="dashboard-sales-summary-title">Tóm tắt bán hàng</h2></div>
              </div>
              <div className="dashboard-mini-stats">
                <div><span>Tổng doanh thu</span><strong>{vnd(ownerMetrics.revenue)}</strong></div>
                <div><span>Tổng đơn</span><strong>{number(ownerMetrics.completedSales)}</strong></div>
                <div><span>Đơn trung bình</span><strong>{vnd(ownerMetrics.averageOrder)}</strong></div>
                <div><span>Sản phẩm đã bán</span><strong>{number(ownerMetrics.soldQuantity)}</strong></div>
              </div>
            </section>
          ) : (
            <section className="dashboard-card dashboard-sales-summary" aria-labelledby="dashboard-ops-summary-title">
              <div className="dashboard-section-heading dashboard-section-heading--compact">
                <div><p className="dashboard-kicker">Vận hành</p><h2 id="dashboard-ops-summary-title">Tóm tắt hoạt động</h2></div>
              </div>
              <div className="dashboard-mini-stats">
                <div><span>Đơn completed</span><strong>{number(data.sales.length)}</strong></div>
                <div><span>Sản phẩm đã bán</span><strong>{number(soldQuantity)}</strong></div>
                <div><span>SKU đang hoạt động</span><strong>{inventorySummary.active}</strong></div>
                <div><span>Cảnh báo kho</span><strong>{inventorySummary.low + inventorySummary.out}</strong></div>
              </div>
            </section>
          )}

          <DashboardRankings
            topProducts={topProducts}
            topCustomers={visibility.topCustomers && ownerData ? ownerData.currentReport.customers.slice(0, 10) : undefined}
            showProductRevenue={visibility.financial}
          />

          <div className="dashboard-lower-grid">
            <section className="dashboard-card dashboard-inventory-summary" aria-labelledby="dashboard-inventory-summary-title">
              <div className="dashboard-section-heading dashboard-section-heading--compact">
                <div><p className="dashboard-kicker">Kho hiện tại</p><h2 id="dashboard-inventory-summary-title">Tóm tắt tồn kho</h2></div>
              </div>
              <div className="dashboard-inventory-content">
                <div className="dashboard-donut" style={{ background: inventoryBackground }} aria-hidden="true">
                  <div><strong>{inventorySummary.active}</strong><span>SKU active</span></div>
                </div>
                <dl className="dashboard-inventory-legend">
                  <div><dt><span className="dashboard-dot dashboard-dot--ok" />Còn hàng</dt><dd>{inventorySummary.ok} <small>{inventoryPercent(inventorySummary.ok).toFixed(0)}%</small></dd></div>
                  <div><dt><span className="dashboard-dot dashboard-dot--low" />Sắp hết</dt><dd>{inventorySummary.low} <small>{inventoryPercent(inventorySummary.low).toFixed(0)}%</small></dd></div>
                  <div><dt><span className="dashboard-dot dashboard-dot--out" />Đã hết</dt><dd>{inventorySummary.out} <small>{inventoryPercent(inventorySummary.out).toFixed(0)}%</small></dd></div>
                </dl>
              </div>
              <p className="dashboard-note">Tỷ lệ tính theo số SKU active, không phải tổng số lượng tồn.</p>
            </section>

            <section className="dashboard-card dashboard-activity" aria-labelledby="dashboard-activity-title">
              <div className="dashboard-section-heading dashboard-section-heading--compact">
                <div><p className="dashboard-kicker">Giao dịch</p><h2 id="dashboard-activity-title">Hoạt động gần đây</h2></div>
              </div>
              {recentActivity.length === 0 ? (
                <div className="dashboard-empty">Chưa có giao dịch completed trong kỳ.</div>
              ) : (
                <ul className="dashboard-activity-list">
                  {recentActivity.map((item) => (
                    <li key={item.id}>
                      <span className={`dashboard-activity-icon dashboard-activity-icon--${item.type}`} aria-hidden="true">
                        {item.type === 'sale' ? 'B' : item.type === 'purchase' ? 'N' : 'X'}
                      </span>
                      <span className="dashboard-activity-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                      <time dateTime={new Date(item.createdAt).toISOString()}>{dateTime(item.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {ownerData?.currentReport.warnings.length ? (
            <div className="dashboard-data-warning" role="status">
              <strong>Cảnh báo dữ liệu lịch sử</strong>
              <span>{ownerData.currentReport.warnings[0]}</span>
              {ownerData.currentReport.warnings.length > 1 ? <small>+{ownerData.currentReport.warnings.length - 1} cảnh báo khác trong Reports.</small> : null}
            </div>
          ) : null}

          <section className="dashboard-card dashboard-quick-actions" aria-labelledby="dashboard-quick-actions-title">
            <div className="dashboard-section-heading dashboard-section-heading--compact">
              <div><p className="dashboard-kicker">Thao tác nhanh</p><h2 id="dashboard-quick-actions-title">Đi đến chức năng</h2></div>
            </div>
            <div className="dashboard-action-grid">
              {quickActions.map((action) => (
                <Link to={action.to} key={action.to} className="dashboard-action-card">
                  <strong>{action.label}</strong>
                  <span>{action.description}</span>
                </Link>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
