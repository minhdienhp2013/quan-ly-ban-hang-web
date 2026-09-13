interface GoodsBulkActionBarProps {
  count: number;
  showDeactivate: boolean;
  deactivating?: boolean;
  onPrint: () => void;
  onDeactivate: () => void;
  onClear: () => void;
}

export default function GoodsBulkActionBar({
  count,
  showDeactivate,
  deactivating = false,
  onPrint,
  onDeactivate,
  onClear,
}: GoodsBulkActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="goods-bulk-bar" role="status">
      <strong>Đã chọn {count} sản phẩm</strong>
      <div>
        <button className="button button--primary goods-touch" type="button" onClick={onPrint} disabled={deactivating}>
          In tem đã chọn
        </button>
        {showDeactivate ? (
          <button className="button button--secondary goods-touch" type="button" onClick={onDeactivate} disabled={deactivating}>
            {deactivating ? 'Đang xử lý...' : 'Ngừng kinh doanh đã chọn'}
          </button>
        ) : null}
        <button className="button button--secondary goods-touch" type="button" onClick={onClear} disabled={deactivating}>
          Bỏ chọn
        </button>
      </div>
    </div>
  );
}
