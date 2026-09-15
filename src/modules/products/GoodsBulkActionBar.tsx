interface GoodsBulkActionBarProps {
  count: number;
  showDeactivate: boolean;
  showPermanentDelete: boolean;
  deactivating?: boolean;
  deleting?: boolean;
  onPrint: () => void;
  onDeactivate: () => void;
  onPermanentDelete: () => void;
  onClear: () => void;
}

export default function GoodsBulkActionBar({
  count,
  showDeactivate,
  showPermanentDelete,
  deactivating = false,
  deleting = false,
  onPrint,
  onDeactivate,
  onPermanentDelete,
  onClear,
}: GoodsBulkActionBarProps) {
  if (count <= 0) return null;
  const busy = deactivating || deleting;
  return (
    <div className="goods-bulk-bar" role="status">
      <strong>Đã chọn {count} sản phẩm</strong>
      <div className="goods-bulk-actions">
        <button className="button button--primary goods-touch" type="button" onClick={onPrint} disabled={busy}>
          In tem đã chọn
        </button>
        {showDeactivate ? (
          <button className="button button--secondary goods-touch" type="button" onClick={onDeactivate} disabled={busy}>
            {deactivating ? 'Đang xử lý...' : 'Ngừng kinh doanh đã chọn'}
          </button>
        ) : null}
        <button className="button button--secondary goods-touch" type="button" onClick={onClear} disabled={busy}>
          Bỏ chọn
        </button>
        {showPermanentDelete ? (
          <span className="goods-bulk-danger-slot">
            <button className="button goods-danger-button goods-touch" type="button" onClick={onPermanentDelete} disabled={busy}>
              {deleting ? 'Đang kiểm tra/xóa...' : 'Xóa vĩnh viễn đã chọn'}
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}
