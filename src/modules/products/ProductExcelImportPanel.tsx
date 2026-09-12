import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Product } from '../../types/models';
import { parseProductExcel, type ExcelProductImportResult } from './excelImport';
import { importProductsFromExcel } from './productImportService';

interface ProductExcelImportPanelProps {
  products: Product[];
  actorUid: string;
  onClose: () => void;
}

export default function ProductExcelImportPanel({
  products,
  actorUid,
  onClose,
}: ProductExcelImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ExcelProductImportResult | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!preview) return { ready: 0, duplicate: 0, error: 0 };
    return preview.rows.reduce(
      (result, row) => {
        result[row.status] += 1;
        return result;
      },
      { ready: 0, duplicate: 0, error: 0 },
    );
  }, [preview]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setPreview(null);
    setError(null);
    setSuccess(null);
    setReading(true);

    try {
      const result = await parseProductExcel(file, products);
      setPreview(result);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Không thể đọc file Excel.');
    } finally {
      setReading(false);
    }
  }

  async function handleImport() {
    if (!preview || importing) return;

    const readyInputs = preview.rows
      .filter((row) => row.status === 'ready' && row.input)
      .map((row) => row.input!);

    if (readyInputs.length === 0) {
      setError('Không có dòng hợp lệ nào để nhập.');
      return;
    }

    const confirmed = window.confirm(
      `Nhập ${readyInputs.length} sản phẩm mới? Các dòng trùng và dòng lỗi sẽ được bỏ qua.`,
    );
    if (!confirmed) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const count = await importProductsFromExcel(readyInputs, actorUid);
      setSuccess(`Đã nhập thành công ${count} sản phẩm.`);
      setPreview(null);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Không thể import sản phẩm.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="product-editor excel-import-panel" aria-label="Import sản phẩm bằng Excel">
      <div className="section-heading">
        <div>
          <h2>Import sản phẩm bằng Excel</h2>
          <p>
            File mẫu chỉ là tham khảo. Hệ thống nhận các tên cột phổ biến và chỉ bắt buộc có Mã hàng/SKU + Tên sản phẩm.
          </p>
        </div>
        <button className="button button--secondary" type="button" onClick={onClose} disabled={importing}>
          Đóng
        </button>
      </div>

      <div className="excel-import-help">
        <strong>Cột hỗ trợ:</strong>
        <span>Mã hàng/SKU, Tên sản phẩm, Barcode, QR, Đơn vị, Giá vốn, Giá bán, Tồn tối thiểu, Trạng thái.</span>
        <span>Các cột khác trong file được phép tồn tại và sẽ được bỏ qua.</span>
      </div>

      <label className="excel-file-picker">
        <span>Chọn file Excel (.xlsx hoặc .xls)</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleFileChange}
          disabled={reading || importing}
        />
      </label>

      {reading && <p className="muted">Đang đọc và kiểm tra file...</p>}
      {fileName && !reading && <p className="muted">File: <strong>{fileName}</strong></p>}
      {error && <p className="form-error">{error}</p>}
      {success && <p className="form-success">{success}</p>}

      {preview && (
        <>
          <div className="import-summary">
            <div><span>Sẵn sàng nhập</span><strong>{stats.ready}</strong></div>
            <div><span>Dòng trùng</span><strong>{stats.duplicate}</strong></div>
            <div><span>Dòng lỗi</span><strong>{stats.error}</strong></div>
          </div>

          <p className="muted">
            Sheet: <strong>{preview.sheetName}</strong> · Đã nhận {preview.detectedHeaders.length} cột.
          </p>

          {preview.stockColumnDetected && (
            <p className="form-warning">
              File có cột tồn kho. Ở bước này hệ thống chưa ghi số tồn từ Excel để tránh làm sai lịch sử kho; tồn đầu kỳ sẽ được xử lý qua module Kho/kiểm kê.
            </p>
          )}

          <div className="product-table-wrap import-preview-table-wrap">
            <table className="product-table import-preview-table">
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>SKU</th>
                  <th>Tên sản phẩm</th>
                  <th>Giá bán</th>
                  <th>Trạng thái</th>
                  <th>Kết quả kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row) => (
                  <tr key={row.rowNumber}>
                    <td>{row.rowNumber}</td>
                    <td>{row.input?.sku || '—'}</td>
                    <td>{row.input?.name || '—'}</td>
                    <td className="number-cell">{row.input ? row.input.salePrice.toLocaleString('vi-VN') : '—'}</td>
                    <td>{row.input?.active === false ? 'Ngừng dùng' : 'Đang dùng'}</td>
                    <td>
                      <span className={`import-status import-status--${row.status}`}>{row.message}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rows.length > 100 && (
            <p className="muted">Đang hiển thị 100 dòng đầu trong tổng số {preview.rows.length} dòng.</p>
          )}

          <div className="form-actions">
            <button className="button button--secondary" type="button" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              Chọn file khác
            </button>
            <button className="button button--primary" type="button" onClick={handleImport} disabled={importing || stats.ready === 0}>
              {importing ? 'Đang nhập...' : `Nhập ${stats.ready} sản phẩm hợp lệ`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
