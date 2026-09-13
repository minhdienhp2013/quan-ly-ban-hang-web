import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../types/models';
import { findProductByScannedCode } from '../qr/productLookup';
import ProductExcelImportPanel from './ProductExcelImportPanel';
import GoodsBulkActionBar from './GoodsBulkActionBar';
import GoodsFilters from './GoodsFilters';
import GoodsKpiBar from './GoodsKpiBar';
import GoodsResponsiveList from './GoodsResponsiveList';
import GoodsTable from './GoodsTable';
import GoodsToolbar from './GoodsToolbar';
import ProductDetail from './ProductDetail';
import ProductScanDialog from './ProductScanDialog';
import { deactivateSelectedProducts } from './productBulkActions';
import { exportProductsToExcel } from './productExcelExport';
import {
  computeGoodsStats,
  filterGoodsProducts,
  type GoodsActiveFilter,
  type GoodsStockFilter,
} from './goodsViewModel';
import {
  createProduct,
  setProductActive,
  subscribeProducts,
  updateProduct,
  type ProductInput,
} from './productService';

interface ProductFormState {
  sku: string;
  name: string;
  barcode: string;
  qrCode: string;
  unit: string;
  costPrice: string;
  salePrice: string;
  minStock: string;
  active: boolean;
}

const emptyForm: ProductFormState = {
  sku: '',
  name: '',
  barcode: '',
  qrCode: '',
  unit: '',
  costPrice: '0',
  salePrice: '0',
  minStock: '',
  active: true,
};

function toFormState(product: Product): ProductFormState {
  return {
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? '',
    qrCode: product.qrCode ?? '',
    unit: product.unit ?? '',
    costPrice: String(product.costPrice),
    salePrice: String(product.salePrice),
    minStock: typeof product.minStock === 'number' ? String(product.minStock) : '',
    active: product.active,
  };
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

function getValidationError(form: ProductFormState, products: Product[], editingId?: string): string | null {
  const sku = form.sku.trim();
  const name = form.name.trim();
  const costPrice = Number(form.costPrice);
  const salePrice = Number(form.salePrice);
  const minStock = form.minStock.trim() ? Number(form.minStock) : undefined;

  if (!sku) return 'SKU là bắt buộc.';
  if (!name) return 'Tên sản phẩm là bắt buộc.';
  if (!Number.isFinite(costPrice) || costPrice < 0) return 'Giá vốn phải là số từ 0 trở lên.';
  if (!Number.isFinite(salePrice) || salePrice < 0) return 'Giá bán phải là số từ 0 trở lên.';
  if (typeof minStock === 'number' && (!Number.isFinite(minStock) || minStock < 0)) {
    return 'Tồn tối thiểu phải là số từ 0 trở lên.';
  }

  const others = products.filter((product) => product.id !== editingId);
  if (others.some((product) => normalize(product.sku) === normalize(sku))) {
    return `SKU “${sku}” đã được sử dụng.`;
  }

  const barcode = form.barcode.trim();
  if (barcode && others.some((product) => product.barcode?.trim() === barcode)) {
    return `Barcode “${barcode}” đã được sử dụng.`;
  }

  const qrCode = form.qrCode.trim();
  if (qrCode && others.some((product) => product.qrCode?.trim() === qrCode)) {
    return `Mã QR “${qrCode}” đã được sử dụng.`;
  }

  return null;
}

function toProductInput(form: ProductFormState): ProductInput {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    barcode: form.barcode.trim() || undefined,
    qrCode: form.qrCode.trim() || undefined,
    unit: form.unit.trim() || undefined,
    costPrice: Number(form.costPrice),
    salePrice: Number(form.salePrice),
    minStock: form.minStock.trim() ? Number(form.minStock) : undefined,
    active: form.active,
  };
}

export default function ProductsPage() {
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<GoodsActiveFilter>('all');
  const [stockFilter, setStockFilter] = useState<GoodsStockFilter>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(() => new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [bulkDeactivating, setBulkDeactivating] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);

    try {
      return subscribeProducts(
        (nextProducts) => {
          setProducts(nextProducts);
          setLoading(false);
        },
        (error) => {
          setLoadError(error.message || 'Không thể tải danh sách hàng hóa.');
          setLoading(false);
        },
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể kết nối cơ sở dữ liệu.');
      setLoading(false);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const productIds = new Set(products.map((product) => product.id));
    setSelectedProductIds((current) => {
      const next = new Set([...current].filter((id) => productIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (detailProductId && !productIds.has(detailProductId)) setDetailProductId(null);
  }, [products, detailProductId]);

  const filteredProducts = useMemo(
    () => filterGoodsProducts(products, query, activeFilter, stockFilter),
    [products, query, activeFilter, stockFilter],
  );
  const stats = useMemo(() => computeGoodsStats(products), [products]);
  const detailProduct = useMemo(
    () => products.find((product) => product.id === detailProductId) ?? null,
    [products, detailProductId],
  );
  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.has(product.id)),
    [products, selectedProductIds],
  );

  function openCreate() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(product: Product) {
    setDetailProductId(null);
    setEditingProduct(product);
    setForm(toFormState(product));
    setFormError(null);
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!appUser || saving) return;

    const validationError = getValidationError(form, products, editingProduct?.id);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const input = toProductInput(form);
      if (editingProduct) await updateProduct(editingProduct, input, appUser.uid);
      else await createProduct(input, appUser.uid);
      setEditorOpen(false);
      setEditingProduct(null);
      setForm(emptyForm);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể lưu sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(product: Product) {
    if (!appUser || changingStatusId) return;
    const nextActive = !product.active;
    const confirmed = window.confirm(
      nextActive
        ? `Kích hoạt lại sản phẩm “${product.name}”?`
        : `Ngừng kinh doanh sản phẩm “${product.name}”? Sản phẩm không bị xóa và vẫn còn trong lịch sử.`,
    );
    if (!confirmed) return;

    setChangingStatusId(product.id);
    setLoadError(null);
    try {
      await setProductActive(product, nextActive, appUser.uid);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể đổi trạng thái sản phẩm.');
    } finally {
      setChangingStatusId(null);
    }
  }

  function handleExactLookup() {
    const code = query.trim();
    if (!code) return;
    const match = findProductByScannedCode(products, code);
    if (match) {
      setDetailProductId(match.product.id);
      setSearchNotice(`Đã tìm thấy ${match.product.sku} - ${match.product.name} theo ${match.field}.`);
      return;
    }
    setSearchNotice('Không tìm thấy mã chính xác. Danh sách vẫn đang lọc theo từ khóa hiện tại.');
  }

  function clearSearch() {
    setQuery('');
    setSearchNotice(null);
  }

  function toggleProductSelection(productId: string) {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      const allVisibleSelected = filteredProducts.length > 0 && filteredProducts.every((product) => next.has(product.id));
      for (const product of filteredProducts) {
        if (allVisibleSelected) next.delete(product.id);
        else next.add(product.id);
      }
      return next;
    });
  }

  function clearFilters() {
    setActiveFilter('all');
    setStockFilter('all');
  }

  function handleExportExcel() {
    if (appUser?.role !== 'owner' || loading) return;
    setLoadError(null);
    try {
      exportProductsToExcel(products);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể xuất file Excel hàng hóa.');
    }
  }

  async function handleBulkDeactivate() {
    if (appUser?.role !== 'owner' || bulkDeactivating || selectedProducts.length === 0) return;

    const confirmed = window.confirm(
      `Bạn đang chuẩn bị ngừng kinh doanh ${selectedProducts.length} sản phẩm.\n\n` +
      'Sản phẩm không bị xóa.\nLịch sử bán hàng và kho vẫn được giữ nguyên.\n\n' +
      'Bạn có muốn tiếp tục?',
    );
    if (!confirmed) return;

    setBulkDeactivating(true);
    setSearchNotice(null);
    setLoadError(null);
    try {
      const result = await deactivateSelectedProducts(
        selectedProducts,
        (product) => setProductActive(product, false, appUser.uid),
      );

      if (result.failures.length > 0) {
        setSearchNotice(
          `Đã xử lý ${result.deactivated}/${result.targeted} sản phẩm. ` +
          `${result.failures.length} sản phẩm không thể cập nhật.`,
        );
      } else {
        setSearchNotice(`Đã ngừng kinh doanh ${result.deactivated} sản phẩm.`);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể ngừng kinh doanh các sản phẩm đã chọn.');
    } finally {
      setBulkDeactivating(false);
    }
  }

  function printProducts(targetProducts: Product[]) {
    const initialQuantities = Object.fromEntries(targetProducts.map((product) => [product.id, 1]));
    navigate('/qr-printing', { state: { initialQuantities, source: 'products' } });
  }

  return (
    <div className="products-page">
      <header className="goods-heading">
        <div>
          <h1>Hàng hóa</h1>
          <p className="muted">Quản lý sản phẩm, giá bán, tồn kho và thông tin liên quan.</p>
        </div>
      </header>

      <GoodsToolbar
        query={query}
        importOpen={importOpen}
        filtersOpen={filtersOpen}
        showExportExcel={appUser?.role === 'owner'}
        exportDisabled={loading}
        onQueryChange={(value) => { setQuery(value); setSearchNotice(null); }}
        onSubmitSearch={handleExactLookup}
        onClearSearch={clearSearch}
        onOpenScanner={() => setScannerOpen(true)}
        onToggleImport={() => setImportOpen((current) => !current)}
        onToggleFilters={() => setFiltersOpen((current) => !current)}
        onExportExcel={handleExportExcel}
        onOpenPrinting={() => navigate('/qr-printing')}
        onCreate={openCreate}
      />

      <GoodsKpiBar stats={stats} />

      {searchNotice ? <p className="goods-info" role="status">{searchNotice}</p> : null}
      {loadError ? <p className="form-error" role="alert">{loadError}</p> : null}

      {importOpen && appUser ? (
        <ProductExcelImportPanel products={products} actorUid={appUser.uid} onClose={() => setImportOpen(false)} />
      ) : null}

      {editorOpen ? (
        <section className="product-editor" aria-label={editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}>
          <div className="section-heading">
            <div>
              <h2>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
              <p>Tồn kho không chỉnh tại đây; sản phẩm mới luôn bắt đầu từ tồn 0.</p>
            </div>
            <button className="button button--secondary goods-touch" type="button" onClick={closeEditor} disabled={saving}>Đóng</button>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label>SKU *<input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required /></label>
            <label className="form-field--wide">Tên sản phẩm *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
            <label>Mã QR<input value={form.qrCode} onChange={(event) => setForm({ ...form, qrCode: event.target.value })} /></label>
            <label>Đơn vị tính<input placeholder="Cái, hộp, bộ..." value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
            <label>Giá vốn hiện tại (VND)<input type="number" min="0" step="1" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} /></label>
            <label>Giá bán (VND)<input type="number" min="0" step="1" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} /></label>
            <label>Tồn tối thiểu<input type="number" min="0" step="1" placeholder="Không cảnh báo" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} /></label>
            <label className="checkbox-field"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />Đang kinh doanh</label>

            {formError ? <p className="form-error form-field--full" role="alert">{formError}</p> : null}
            <div className="form-actions form-field--full">
              <button className="button button--secondary goods-touch" type="button" onClick={closeEditor} disabled={saving}>Hủy</button>
              <button className="button button--primary goods-touch" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : editingProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="goods-catalog-layout">
        <GoodsFilters
          open={filtersOpen}
          activeFilter={activeFilter}
          stockFilter={stockFilter}
          onActiveFilterChange={setActiveFilter}
          onStockFilterChange={setStockFilter}
          onClear={clearFilters}
        />

        <section className="goods-panel" aria-label="Danh sách hàng hóa">
          <GoodsBulkActionBar
            count={selectedProducts.length}
            showDeactivate={appUser?.role === 'owner'}
            deactivating={bulkDeactivating}
            onPrint={() => printProducts(selectedProducts)}
            onDeactivate={() => void handleBulkDeactivate()}
            onClear={() => setSelectedProductIds(new Set())}
          />

          {loading ? (
            <div className="goods-empty">Đang tải hàng hóa...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="goods-empty">
              <strong>{products.length === 0 ? 'Chưa có hàng hóa nào.' : 'Không tìm thấy hàng hóa phù hợp.'}</strong>
              <span>{products.length === 0 ? 'Bấm “+ Thêm sản phẩm” để tạo sản phẩm đầu tiên.' : 'Thử từ khóa khác hoặc xóa bộ lọc hiện tại.'}</span>
            </div>
          ) : (
            <>
              <GoodsTable
                products={filteredProducts}
                selectedIds={selectedProductIds}
                onToggleProduct={toggleProductSelection}
                onToggleAllVisible={toggleAllVisible}
                onView={(product) => setDetailProductId(product.id)}
                onEdit={openEdit}
              />
              <GoodsResponsiveList
                products={filteredProducts}
                selectedIds={selectedProductIds}
                onToggleProduct={toggleProductSelection}
                onView={(product) => setDetailProductId(product.id)}
                onEdit={openEdit}
              />
            </>
          )}
        </section>
      </div>

      {detailProduct ? (
        <ProductDetail
          product={detailProduct}
          changingStatus={changingStatusId === detailProduct.id}
          onClose={() => setDetailProductId(null)}
          onEdit={openEdit}
          onToggleActive={(product) => void handleToggleActive(product)}
          onScan={() => { setDetailProductId(null); setScannerOpen(true); }}
          onPrint={(product) => printProducts([product])}
        />
      ) : null}

      {scannerOpen ? (
        <ProductScanDialog
          products={products}
          onClose={() => setScannerOpen(false)}
          onFound={(product) => { setScannerOpen(false); setDetailProductId(product.id); }}
        />
      ) : null}
    </div>
  );
}
