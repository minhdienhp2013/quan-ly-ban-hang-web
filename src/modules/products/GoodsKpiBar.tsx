interface GoodsKpiBarProps {
  stats: {
    total: number;
    active: number;
    inactive: number;
    low: number;
    out: number;
  };
}

export default function GoodsKpiBar({ stats }: GoodsKpiBarProps) {
  return (
    <section className="goods-kpis" aria-label="Thống kê hàng hóa">
      <div className="goods-kpi"><span>Tổng hàng hóa</span><strong>{stats.total}</strong></div>
      <div className="goods-kpi goods-kpi--active"><span>Đang kinh doanh</span><strong>{stats.active}</strong></div>
      <div className="goods-kpi goods-kpi--inactive"><span>Ngừng kinh doanh</span><strong>{stats.inactive}</strong></div>
      <div className="goods-kpi goods-kpi--low"><span>Sắp hết</span><strong>{stats.low}</strong></div>
      <div className="goods-kpi goods-kpi--out"><span>Hết hàng</span><strong>{stats.out}</strong></div>
    </section>
  );
}
