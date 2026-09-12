import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../types/models';
import ProductExcelImportPanel from './ProductExcelImportPanel';
import ProductsPage from './ProductsPage';
import { subscribeProducts } from './productService';
import './excelImport.css';

export default function ProductsWorkspacePage() {
  const { appUser } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!importOpen) return undefined;

    try {
      return subscribeProducts(
        setProducts,
        (error) => setLoadError(error.message || 'Không thể tải dữ liệu để kiểm tra file Excel.'),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu sản phẩm.');
      return undefined;
    }
  }, [importOpen]);

  return (
    <>
      <div className="excel-import-entry">
        <div>
          <strong>Nhập nhiều sản phẩm</strong>
          <span>Đọc file Excel ngay trên trình duyệt, xem trước và kiểm tra trùng trước khi ghi Firebase.</span>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            setLoadError(null);
            setImportOpen((current) => !current);
          }}
        >
          {importOpen ? 'Đóng Import Excel' : 'Import từ Excel'}
        </button>
      </div>

      {loadError && <p className="form-error">{loadError}</p>}
      {importOpen && appUser && (
        <ProductExcelImportPanel
          products={products}
          actorUid={appUser.uid}
          onClose={() => setImportOpen(false)}
        />
      )}

      <ProductsPage />
    </>
  );
}
