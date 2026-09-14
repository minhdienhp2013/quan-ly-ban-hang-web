import { useMemo, useState, type FormEvent } from 'react';
import type { Product, Purchase, Supplier } from '../../types/models';
import type { CreatePurchaseInput } from './purchaseService';

interface EditorLine {
  productId: string;
  quantity: number;
  unitCost: number;
  historicalSku?: string;
  historicalName?: string;
}

interface PurchaseEditorProps {
  products: readonly Product[];
  suppliers: readonly Supplier[];
  sourcePurchase?: Purchase | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CreatePurchaseInput) => Promise<void>;
}

function emptyLine(): EditorLine {
  return { productId: '', quantity: 1, unitCost: 0 };
}

function initialLines(source?: Purchase | null): EditorLine[] {
  if (!source || !Array.isArray(source.items) || source.items.length === 0) return [emptyLine()];
  return source.items.map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity) || 0,
    unitCost: Number(item.unitCost) || 0,
    historicalSku: item.sku,
    historicalName: item.name,
  }));
}

function money(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Math.round(value));
}

export default function PurchaseEditor({
  products,
  suppliers,
  sourcePurchase,
  busy,
  onClose,
  onSubmit,
}: PurchaseEditorProps) {
  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.active), [suppliers]);
  const copiedSupplier = sourcePurchase?.supplierId
    ? activeSuppliers.find((supplier) => supplier.id === sourcePurchase.supplierId)
    : undefined;
  const [supplierId, setSupplierId] = useState(copiedSupplier?.id || '');
  const [supplierName, setSupplierName] = useState(sourcePurchase?.supplierName || copiedSupplier?.name || '');
  const [note, setNote] = useState(sourcePurchase?.note || '');
  const [lines, setLines] = useState<EditorLine[]>(() => initialLines(sourcePurchase));
  const [error, setError] = useState('');

  const activeProductById = useMemo(() => new Map(activeProducts.map((product) => [product.id, product])), [activeProducts]);
  const unavailableLines = lines.filter((line) => line.productId && !activeProductById.has(line.productId));
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0);

  function patchLine(index: number, patch: Partial<EditorLine>) {
    setLines((current) => current.map((line, currentIndex) => currentIndex === index ? { ...line, ...patch } : line));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');

    if (unavailableLines.length > 0) {
      setError('Có sản phẩm từ phiếu cũ không còn khả dụng. Hãy chọn sản phẩm thay thế hoặc xóa dòng trước khi hoàn tất.');
      return;
    }

    try {
      await onSubmit({
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitCost: line.unitCost })),
        ...(supplierId ? { supplierId } : {}),
        ...(supplierName.trim() ? { supplierName: supplierName.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể hoàn tất phiếu nhập.');
    }
  }

  return (
    <section className="purchase-editor" aria-labelledby="purchase-editor-title">
      <div className="purchase-editor-heading">
        <div>
          <p className="eyebrow">{sourcePurchase ? 'Sao chép thành phiếu mới' : 'Phiếu nhập mới'}</p>
          <h2 id="purchase-editor-title">{sourcePurchase ? 'Sao chép để sửa' : 'Nhập hàng'}</h2>
          <p className="muted">{sourcePurchase ? `Dữ liệu được sao chép từ ${sourcePurchase.code}. Chưa có gì được ghi vào kho cho tới khi hoàn tất.` : 'Phiếu chỉ được ghi vào Firebase và tăng tồn khi bấm Hoàn tất nhập hàng.'}</p>
        </div>
        <button className="button button--secondary purchase-touch" type="button" onClick={onClose} disabled={busy}>Đóng</button>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        <div className="purchase-editor-supplier-grid">
          <label>Nhà cung cấp
            <select value={supplierId} onChange={(event) => {
              const nextId = event.target.value;
              const supplier = activeSuppliers.find((item) => item.id === nextId);
              setSupplierId(nextId);
              if (supplier) setSupplierName(supplier.name);
            }}>
              <option value="">— Chưa chọn danh mục —</option>
              {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} - {supplier.name}</option>)}
            </select>
          </label>
          <label>Tên NCC trên phiếu mới
            <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Tên nhà cung cấp" />
          </label>
        </div>

        {unavailableLines.length > 0 ? (
          <p className="purchase-editor-warning" role="alert">Có {unavailableLines.length} dòng từ phiếu cũ chứa sản phẩm đã ngừng sử dụng hoặc không còn trong danh mục. Hãy xử lý các dòng này trước khi hoàn tất.</p>
        ) : null}

        <div className="purchase-editor-lines" aria-label="Danh sách sản phẩm nhập">
          <div className="purchase-editor-line purchase-editor-line--header" aria-hidden="true"><span>Sản phẩm</span><span>Số lượng</span><span>Giá nhập</span><span>Thành tiền</span><span /></div>
          {lines.map((line, index) => {
            const activeProduct = activeProductById.get(line.productId);
            const unavailable = Boolean(line.productId && !activeProduct);
            return (
              <div className={`purchase-editor-line${unavailable ? ' is-unavailable' : ''}`} key={`${index}-${line.productId}`}>
                <label><span className="purchase-mobile-label">Sản phẩm</span>
                  <select value={line.productId} onChange={(event) => {
                    const product = activeProductById.get(event.target.value);
                    patchLine(index, {
                      productId: event.target.value,
                      unitCost: product?.costPrice ?? 0,
                      historicalSku: undefined,
                      historicalName: undefined,
                    });
                  }}>
                    <option value="">Chọn sản phẩm</option>
                    {unavailable ? <option value={line.productId}>{line.historicalSku || line.productId} - {line.historicalName || 'Sản phẩm cũ'} (không khả dụng)</option> : null}
                    {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}
                  </select>
                </label>
                <label><span className="purchase-mobile-label">Số lượng</span><input type="number" inputMode="decimal" min="0.001" step="0.001" value={line.quantity} onChange={(event) => patchLine(index, { quantity: Number(event.target.value) })} /></label>
                <label><span className="purchase-mobile-label">Giá nhập</span><input type="number" inputMode="numeric" min="0" step="1" value={line.unitCost} onChange={(event) => patchLine(index, { unitCost: Number(event.target.value) })} /></label>
                <strong className="purchase-editor-line-total">{money(line.quantity * line.unitCost)} đ</strong>
                <button className="purchase-editor-remove" type="button" onClick={() => setLines((current) => current.filter((_, currentIndex) => currentIndex !== index))} disabled={busy || lines.length === 1} aria-label={`Xóa dòng ${index + 1}`}>×</button>
              </div>
            );
          })}
        </div>

        <div className="purchase-editor-add"><button className="button button--secondary purchase-touch" type="button" onClick={() => setLines((current) => [...current, emptyLine()])} disabled={busy}>+ Thêm dòng</button></div>

        <div className="purchase-editor-footer">
          <label>Ghi chú<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú cho phiếu nhập hàng..." /></label>
          <div className="purchase-editor-total"><span>Tổng tiền</span><strong>{money(total)} đ</strong></div>
        </div>

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="purchase-editor-actions">
          <button className="button button--secondary purchase-touch" type="button" onClick={onClose} disabled={busy}>Hủy soạn</button>
          <button className="button button--primary purchase-touch" type="submit" disabled={busy || unavailableLines.length > 0}>{busy ? 'Đang hoàn tất...' : 'Hoàn tất nhập hàng'}</button>
        </div>
      </form>
    </section>
  );
}
