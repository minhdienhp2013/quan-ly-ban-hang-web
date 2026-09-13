import type { GoodsActiveFilter, GoodsStockFilter } from './goodsViewModel';

interface GoodsFiltersProps {
  open: boolean;
  activeFilter: GoodsActiveFilter;
  stockFilter: GoodsStockFilter;
  onActiveFilterChange: (value: GoodsActiveFilter) => void;
  onStockFilterChange: (value: GoodsStockFilter) => void;
  onClear: () => void;
}

export default function GoodsFilters({
  open,
  activeFilter,
  stockFilter,
  onActiveFilterChange,
  onStockFilterChange,
  onClear,
}: GoodsFiltersProps) {
  const hasFilter = activeFilter !== 'all' || stockFilter !== 'all';

  return (
    <aside className={`goods-filters${open ? ' is-open' : ''}`} aria-label="Bộ lọc hàng hóa">
      <div className="goods-filter-heading">
        <strong>Bộ lọc</strong>
        {hasFilter ? <span>Đang áp dụng</span> : null}
      </div>

      <fieldset>
        <legend>Trạng thái</legend>
        <label><input type="radio" name="goods-active" checked={activeFilter === 'all'} onChange={() => onActiveFilterChange('all')} /> Tất cả</label>
        <label><input type="radio" name="goods-active" checked={activeFilter === 'active'} onChange={() => onActiveFilterChange('active')} /> Đang kinh doanh</label>
        <label><input type="radio" name="goods-active" checked={activeFilter === 'inactive'} onChange={() => onActiveFilterChange('inactive')} /> Ngừng kinh doanh</label>
      </fieldset>

      <fieldset>
        <legend>Tình trạng tồn</legend>
        <label><input type="radio" name="goods-stock" checked={stockFilter === 'all'} onChange={() => onStockFilterChange('all')} /> Tất cả tồn</label>
        <label><input type="radio" name="goods-stock" checked={stockFilter === 'in-stock'} onChange={() => onStockFilterChange('in-stock')} /> Còn hàng</label>
        <label><input type="radio" name="goods-stock" checked={stockFilter === 'low'} onChange={() => onStockFilterChange('low')} /> Sắp hết</label>
        <label><input type="radio" name="goods-stock" checked={stockFilter === 'out'} onChange={() => onStockFilterChange('out')} /> Hết hàng</label>
      </fieldset>

      <button className="button button--secondary goods-filter-clear" type="button" onClick={onClear} disabled={!hasFilter}>Xóa lọc</button>
    </aside>
  );
}
