import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Product } from '../../types/models';
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

function formatVnd(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

function getValidationError(
  form: ProductFormState,
  products: Product[],
  editingId?: string,
): string | null {
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
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

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
          setLoadError(error.message || 'Không thể tải danh sách sản phẩm.');
          setLoading(false);
        },
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không thể kết nối cơ sở dữ liệu.');
      setLoading(false);
      return undefined;
    }
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalize(query);

    return products.filter((product) => {
      if (!showInactive && !product.active) return false;
      if (!normalizedQuery) return true;

      return [product.name, product.sku, product.barcode ?? '', product.qrCode ?? '']
        .some((value) => normalize(value).includes(normalizedQuery));
    });
  }, [products, query, showInactive]);

  const stats = useMemo(() => {
    const activeProducts = products.filter((product) => product.active);
    const lowStock = activeProducts.filter(
      (product) => typeof product.minStock === 'number' && product.stockQuantity <= product.minStock,
    ).length;

    return {
      total: products.length,
      active: activeProducts.length,
      inactive: products.length - activeProducts.length,
      lowStock,
    };
  }, [products]);

  function openCreate() {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError(null);
    setEditorOpen(true);
  }

  function openEdit(product: Product) {
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
    if (!appUser) return;

    const validationError = getValidationError(form, products, editingProduct?.id);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const input = toProductInput(form);
      if (editingProduct) {
        await updateProduct(editingProduct, input, appUser.uid);
      } else {
        await createProduct(input, appUser.uid);
      }
      closeEditor();
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
        : `Ngừng sử dụng sản phẩm “${product.name}”? Sản phẩm không bị xóa và vẫn còn trong lịch sử.`,
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

  return (
    <div className="products-page">
      <div className="page-heading products-heading">
        <div>
          <p className="eyebrow">Danh mục hàng hóa</p>
          <h1>Sản phẩm</h1>
          <p className="muted">Quản lý SKU, barcode/QR, giá bán và trạng thái sản phẩm.</p>
        </div>
        <button className="button button--primary" type="button" onClick={openCreate}>
          + Thêm sản phẩm
        </button>
      </div>

      <section className="product-stats" aria-label="Thống kê sản phẩm">
        <div className="stat-card"><span>Tổng sản phẩm</span><strong>{stats.total}</strong></div>
        <div className="stat-card"><span>Đang sử dụng</span><strong>{stats.active}</strong></div>
        <div className="stat-card"><span>Ngừng sử dụng</span><strong>{stats.inactive}</strong></div>
        <div className="stat-card"><span>Sắp/hết hàng</span><strong>{stats.lowStock}</strong></div>
      </section>

      {editorOpen && (
        <section className="product-editor" aria-label={editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}>
          <div className="section-heading">
            <div>
              <h2>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
              <p>Tồn kho không chỉnh tại đây; sản phẩm mới luôn bắt đầu từ tồn 0.</p>
            </div>
            <button className="button button--secondary" type="button" onClick={closeEditor} disabled={saving}>
              Đóng
            </button>
          </div>

          <form className="product-form" onSubmit={handleSubmit}>
            <label>
              SKU *
              <input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
            </label>
            <label className="form-field--wide">
              Tên sản phẩm *
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Barcode
              <input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} />
            </label>
            <label>
              Mã QR
              <input value={form.qrCode} onChange={(event) => setForm({ ...form, qrCode: event.target.value })} />
            </label>
            <label>
              Đơn vị tính
              <input placeholder="Cái, hộp, bộ..." value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
            </label>
            <label>
              Giá vốn (VND)
              <input type="number" min="0" step="1" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} />
            </label>
            <label>
              Giá bán (VND)
              <input type="number" min="0" step="1" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} />
            </label>
            <label>
              Tồn tối thiểu
              <input type="number" min="0" step="1" placeholder="Không cảnh báo" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: event.target.value })} />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
              Đang sử dụng
            </label>

            {formError && <p className="form-error form-field--full">{formError}</p>}

            <div className="form-actions form-field--full">
              <button className="button button--secondary" type="button" onClick={closeEditor} disabled={saving}>Hủy</button>
              <button className="button button--primary" type="submit" disabled={saving}>
                {saving ? 'Đang lưu...' : editingProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="product-panel">
        <div className="product-toolbar">
          <label className="product-search">
            <span>Tìm sản phẩm</span>
            <input
              type="search"
              placeholder="Tên, SKU, barcode hoặc QR..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="checkbox-field toolbar-checkbox">
            <input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />
            Hiện sản phẩm ngừng sử dụng
          </label>
        </div>

        {loadError && <p className="form-error">{loadError}</p>}

        {loading ? (
          <div className="product-empty">Đang tải sản phẩm...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="product-empty">
            <strong>{products.length === 0 ? 'Chưa có sản phẩm nào.' : 'Không tìm thấy sản phẩm phù hợp.'}</strong>
            {products.length === 0 && <span>Bấm “Thêm sản phẩm” để tạo sản phẩm đầu tiên.</span>}
          </div>
        ) : (
          <div className="product-table-wrap">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Mã</th>
                  <th className="number-cell">Tồn</th>
                  <th className="number-cell">Giá vốn</th>
                  <th className="number-cell">Giá bán</th>
                  <th>Trạng thái</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const lowStock = typeof product.minStock === 'number' && product.stockQuantity <= product.minStock;
                  return (
                    <tr key={product.id} className={!product.active ? 'row--inactive' : undefined}>
                      <td>
                        <strong>{product.name}</strong>
                        <span className="table-sub">{product.unit || 'Chưa có đơn vị'}</span>
                      </td>
                      <td>
                        <strong>{product.sku}</strong>
                        <span className="table-sub">{product.barcode || product.qrCode || '—'}</span>
                      </td>
                      <td className={`number-cell ${lowStock ? 'stock--low' : ''}`}>
                        {product.stockQuantity}
                        {typeof product.minStock === 'number' && <span className="table-sub">min {product.minStock}</span>}
                      </td>
                      <td className="number-cell">{formatVnd(product.costPrice)}</td>
                      <td className="number-cell"><strong>{formatVnd(product.salePrice)}</strong></td>
                      <td>
                        <span className={product.active ? 'product-status product-status--active' : 'product-status product-status--inactive'}>
                          {product.active ? 'Đang dùng' : 'Ngừng dùng'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="text-button" type="button" onClick={() => openEdit(product)}>Sửa</button>
                          <button
                            className="text-button"
                            type="button"
                            disabled={changingStatusId === product.id}
                            onClick={() => handleToggleActive(product)}
                          >
                            {changingStatusId === product.id ? 'Đang lưu...' : product.active ? 'Ngừng' : 'Kích hoạt'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
