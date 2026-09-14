import { useState, type FormEvent } from 'react';
import type { Product } from '../../types/models';
import { createProduct, type ProductInput } from '../products/productService';

interface PurchaseQuickAddProductProps {
  products: readonly Product[];
  actorUid: string;
  initialName?: string;
  onCreated: (product: Product) => void;
  onClose: () => void;
}

interface QuickProductForm {
  sku: string;
  name: string;
  barcode: string;
  qrCode: string;
  unit: string;
  costPrice: string;
  salePrice: string;
}

function normalizeCode(value: string) {
  return value.trim().toLocaleLowerCase('vi');
}

export function getQuickAddProductValidationError(form: QuickProductForm, products: readonly Product[]) {
  const sku = form.sku.trim();
  const name = form.name.trim();
  const costPrice = Number(form.costPrice);
  const salePrice = Number(form.salePrice);

  if (!sku) return 'SKU là bắt buộc.';
  if (!name) return 'Tên sản phẩm là bắt buộc.';
  if (!Number.isFinite(costPrice) || costPrice < 0) return 'Giá vốn phải là số từ 0 trở lên.';
  if (!Number.isFinite(salePrice) || salePrice < 0) return 'Giá bán phải là số từ 0 trở lên.';
  if (products.some((product) => normalizeCode(product.sku) === normalizeCode(sku))) {
    return `SKU “${sku}” đã được sử dụng.`;
  }

  const barcode = form.barcode.trim();
  if (barcode && products.some((product) => product.barcode?.trim() === barcode)) {
    return `Barcode “${barcode}” đã được sử dụng.`;
  }

  const qrCode = form.qrCode.trim();
  if (qrCode && products.some((product) => product.qrCode?.trim() === qrCode)) {
    return `Mã QR “${qrCode}” đã được sử dụng.`;
  }

  return null;
}

function toProductInput(form: QuickProductForm): ProductInput {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    barcode: form.barcode.trim() || undefined,
    qrCode: form.qrCode.trim() || undefined,
    unit: form.unit.trim() || undefined,
    costPrice: Number(form.costPrice),
    salePrice: Number(form.salePrice),
    active: true,
  };
}

export default function PurchaseQuickAddProduct({
  products,
  actorUid,
  initialName = '',
  onCreated,
  onClose,
}: PurchaseQuickAddProductProps) {
  const [form, setForm] = useState<QuickProductForm>({
    sku: '',
    name: initialName.trim(),
    barcode: '',
    qrCode: '',
    unit: '',
    costPrice: '0',
    salePrice: '0',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!actorUid) {
      setError('Không thể xác định người dùng tạo sản phẩm.');
      return;
    }

    const validationError = getQuickAddProductValidationError(form, products);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError('');
    try {
      const created = await createProduct(toProductInput(form), actorUid);
      onCreated(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể thêm sản phẩm.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="purchase-quick-add" aria-labelledby="purchase-quick-add-title">
      <div className="purchase-quick-add-heading">
        <div>
          <p className="eyebrow">Thêm nhanh hàng hóa</p>
          <h3 id="purchase-quick-add-title">Tạo sản phẩm mới</h3>
          <p className="muted">Sản phẩm mới bắt đầu tồn 0 và dùng đúng Product service hiện tại.</p>
        </div>
        <button className="button button--secondary purchase-touch" type="button" onClick={onClose} disabled={saving}>Đóng</button>
      </div>

      <form className="purchase-quick-add-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>SKU *<input autoFocus value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required /></label>
        <label className="purchase-quick-add-wide">Tên sản phẩm *<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label>
        <label>Mã QR<input value={form.qrCode} onChange={(event) => setForm({ ...form, qrCode: event.target.value })} /></label>
        <label>Đơn vị<input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></label>
        <label>Giá vốn *<input type="number" min="0" step="1" inputMode="numeric" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} required /></label>
        <label>Giá bán *<input type="number" min="0" step="1" inputMode="numeric" value={form.salePrice} onChange={(event) => setForm({ ...form, salePrice: event.target.value })} required /></label>

        {error ? <p className="form-error purchase-quick-add-error" role="alert">{error}</p> : null}
        <div className="purchase-quick-add-actions">
          <button className="button button--secondary purchase-touch" type="button" onClick={onClose} disabled={saving}>Hủy</button>
          <button className="button button--primary purchase-touch" type="submit" disabled={saving}>{saving ? 'Đang tạo...' : 'Tạo và chọn sản phẩm'}</button>
        </div>
      </form>
    </section>
  );
}
