interface GoodsBulkActionBarProps {
  count: number;
  onPrint: () => void;
  onClear: () => void;
}

export default function GoodsBulkActionBar({ count, onPrint, onClear }: GoodsBulkActionBarProps) {
  if (count <= 0) return null;
  return (
    <div className="goods-bulk-bar" role="status">
      <strong>Đã chọn {count} sản phẩm</strong>
      <div>
        <button className="button button--primary goods-touch" type="button" onClick={onPrint}>In tem đã chọn</button>
        <button className="button button--secondary goods-touch" type="button" onClick={onClear}>Bỏ chọn</button>
      </div>
    </div>
  );
}
