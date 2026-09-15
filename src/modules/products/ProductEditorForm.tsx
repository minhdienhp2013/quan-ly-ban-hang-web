import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Product } from '../../types/models';
import type { ProductInput } from './productService';
import {
  createProductFormState,
  getProductFormValidationError,
  productFormToInput,
  type ProductFormInitialValues,
  type ProductFormState,
} from './productFormModel';

export type ProductEditorMode = 'create' | 'edit';

interface ProductEditorFormProps {
  mode: ProductEditorMode;
  initialValues?: ProductFormInitialValues;
  products: readonly Product[];
  editingProductId?: string;
  saving: boolean;
  error?: string | null;
  onSubmit: (input: ProductInput) => void | Promise<void>;
  onCancel: () => void;
}

export default function ProductEditorForm({
  mode,
  initialValues,
  products,
  editingProductId,
  saving,
  error,
  onSubmit,
  onCancel,
}: ProductEditorFormProps) {
  const initialSignature = useMemo(
    () => JSON.stringify([
      initialValues?.sku ?? '',
      initialValues?.name ?? '',
      initialValues?.barcode ?? '',
      initialValues?.qrCode ?? '',
      initialValues?.unit ?? '',
      initialValues?.costPrice ?? '0',
      initialValues?.salePrice ?? '0',
      initialValues?.minStock ?? '',
      initialValues?.active ?? true,
    ]),
    [
      initialValues?.sku,
      initialValues?.name,
      initialValues?.barcode,
      initialValues?.qrCode,
      initialValues?.unit,
      initialValues?.costPrice,
      initialValues?.salePrice,
      initialValues?.minStock,
      initialValues?.active,
    ],
  );
  const [form, setForm] = useState<ProductFormState>(() => createProductFormState(initialValues));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setForm(createProductFormState(initialValues));
    setValidationError(null);
  }, [mode, initialSignature, initialValues]);

  function patchForm(patch: Partial<ProductFormState>) {
    setForm((current) => ({ ...current, ...patch }));
    setValidationError(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const nextError = getProductFormValidationError(form, products, editingProductId);
    if (nextError) {
      setValidationError(nextError);
      return;
    }

    setValidationError(null);
    void onSubmit(productFormToInput(form));
  }

  return (
    <form className="product-form" onSubmit={handleSubmit}>
      <label>SKU *<input value={form.sku} onChange={(event) => patchForm({ sku: event.target.value })} required /></label>
      <label className="form-field--wide">Tên sản phẩm *<input value={form.name} onChange={(event) => patchForm({ name: event.target.value })} required /></label>
      <label>Barcode<input value={form.barcode} onChange={(event) => patchForm({ barcode: event.target.value })} /></label>
      <label>Mã QR<input value={form.qrCode} onChange={(event) => patchForm({ qrCode: event.target.value })} /></label>
      <label>Đơn vị tính<input placeholder="Cái, hộp, bộ..." value={form.unit} onChange={(event) => patchForm({ unit: event.target.value })} /></label>
      <label>Giá vốn hiện tại (VND)<input type="number" min="0" step="1" value={form.costPrice} onChange={(event) => patchForm({ costPrice: event.target.value })} /></label>
      <label>Giá bán (VND)<input type="number" min="0" step="1" value={form.salePrice} onChange={(event) => patchForm({ salePrice: event.target.value })} /></label>
      <label>Tồn tối thiểu<input type="number" min="0" step="1" placeholder="Không cảnh báo" value={form.minStock} onChange={(event) => patchForm({ minStock: event.target.value })} /></label>
      <label className="checkbox-field"><input type="checkbox" checked={form.active} onChange={(event) => patchForm({ active: event.target.checked })} />Đang kinh doanh</label>

      {validationError || error ? <p className="form-error form-field--full" role="alert">{validationError ?? error}</p> : null}
      <div className="form-actions form-field--full">
        <button className="button button--secondary goods-touch" type="button" onClick={onCancel} disabled={saving}>Hủy</button>
        <button className="button button--primary goods-touch" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : mode === 'edit' ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</button>
      </div>
    </form>
  );
}
