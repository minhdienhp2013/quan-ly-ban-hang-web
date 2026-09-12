import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Product, Purchase, Supplier } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import '../inventory/inventory.css';
import { cancelPurchase, createPurchase, subscribePurchases, subscribeSuppliers, type PurchaseLineInput } from './purchaseService';

function money(value: number) { return new Intl.NumberFormat('vi-VN').format(value); }
function dateTime(value: number) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value); }

const emptyLine = (): PurchaseLineInput => ({ productId: '', quantity: 1, unitCost: 0 });

export default function PurchasesPage() {
  const { appUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLineInput[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const onError = (cause: Error) => setError(cause.message);
    try {
      const unsubProducts = subscribeProducts(setProducts, onError);
      const unsubPurchases = subscribePurchases(setPurchases, onError);
      const unsubSuppliers = subscribeSuppliers(setSuppliers, onError);
      return () => { unsubProducts(); unsubPurchases(); unsubSuppliers(); };
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Không thể kết nối dữ liệu nhập hàng.'));
      return undefined;
    }
  }, []);

  const activeProducts = useMemo(() => products.filter((product) => product.active), [products]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0), [lines]);

  function patchLine(index: number, patch: Partial<PurchaseLineInput>) {
    setLines((current) => current.map((line, i) => i === index ? { ...line, ...patch } : line));
  }

  async function submit() {
    if (!appUser) return;
    setBusy(true); setError(null); setSuccess(null);
    try {
      const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
      const purchase = await createPurchase({
        items: lines,
        ...(supplierId ? { supplierId } : {}),
        ...(selectedSupplier?.name || supplierName.trim() ? { supplierName: selectedSupplier?.name || supplierName.trim() } : {}),
        ...(note.trim() ? { note } : {}),
      }, appUser.uid);
      setSuccess(`Đã tạo ${purchase.code}, tăng tồn và ghi stockMovements.`);
      setLines([emptyLine()]); setNote(''); setSupplierId(''); setSupplierName('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể tạo phiếu nhập.'); }
    finally { setBusy(false); }
  }

  async function handleCancel(purchase: Purchase) {
    if (!appUser || !window.confirm(`Hủy ${purchase.code}? Hệ thống sẽ tạo PURCHASE_RETURN và giảm lại tồn kho.`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try { await cancelPurchase(purchase.id, appUser.uid); setSuccess(`Đã hủy ${purchase.code} và hoàn tác tồn kho.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể hủy phiếu nhập.'); }
    finally { setBusy(false); }
  }

  return <div className="inv-shell">
    <header className="inv-page-header"><div><p className="eyebrow">PUR-001 / PUR-002</p><h1>Nhập hàng</h1><p className="muted">Phiếu nhập hoàn tất sẽ tăng tồn, cập nhật giá vốn hiện tại và tạo movement PURCHASE trong cùng một atomic update.</p></div></header>
    {error && <p className="form-error">{error}</p>}{success && <p className="inv-success">{success}</p>}

    <section className="inv-card"><div><h2>Tạo phiếu nhập</h2><p className="muted">Có thể chọn nhà cung cấp đã có hoặc nhập tên tạm thời.</p></div>
      <div className="inv-form-grid">
        <label className="inv-field">Nhà cung cấp<select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">— Chưa chọn —</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} - {supplier.name}</option>)}</select></label>
        <label className="inv-field">Tên NCC (nếu chưa có danh mục)<input value={supplierName} disabled={Boolean(supplierId)} onChange={(e) => setSupplierName(e.target.value)} placeholder="Tên nhà cung cấp" /></label>
      </div>
      <div className="inv-line-editor">{lines.map((line, index) => <div className="inv-line" key={index}>
        <label className="inv-field">Sản phẩm<select value={line.productId} onChange={(e) => { const product = activeProducts.find((item) => item.id === e.target.value); patchLine(index, { productId: e.target.value, unitCost: product?.costPrice ?? 0 }); }}><option value="">Chọn sản phẩm</option>{activeProducts.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name} (tồn {product.stockQuantity})</option>)}</select></label>
        <label className="inv-field">Số lượng<input type="number" inputMode="decimal" min="0.001" step="0.001" value={line.quantity} onChange={(e) => patchLine(index, { quantity: Number(e.target.value) })} /></label>
        <label className="inv-field">Giá nhập<input type="number" inputMode="numeric" min="0" step="1" value={line.unitCost} onChange={(e) => patchLine(index, { unitCost: Number(e.target.value) })} /></label>
        <button className="button button--secondary" type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Xóa dòng</button>
      </div>)}</div>
      <div className="inv-actions"><button className="button button--secondary" type="button" onClick={() => setLines((current) => [...current, emptyLine()])}>+ Thêm dòng</button><strong>Tổng: {money(Math.round(total))} đ</strong></div>
      <label className="inv-field">Ghi chú<textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="inv-actions"><button className="button button--primary" type="button" disabled={busy || !appUser} onClick={submit}>{busy ? 'Đang xử lý...' : 'Hoàn tất nhập hàng'}</button></div>
    </section>

    <section className="inv-card"><div><h2>Phiếu nhập gần đây</h2><p className="muted">Hủy phiếu chỉ thực hiện khi kho còn đủ số lượng để trả lại phần đã nhập.</p></div>
      {purchases.length === 0 ? <p className="muted">Chưa có phiếu nhập.</p> : <div className="inv-list">{purchases.slice(0,100).map((purchase) => <article className="inv-record" key={purchase.id}><div className="inv-record__meta"><strong>{purchase.code} · {money(purchase.total)} đ</strong><span>{purchase.supplierName || 'Không ghi NCC'} · {dateTime(purchase.createdAt)} · {purchase.items.length} mặt hàng</span><span className={`inv-badge ${purchase.status === 'completed' ? 'inv-badge--ok' : 'inv-badge--cancelled'}`}>{purchase.status === 'completed' ? 'Hoàn tất' : 'Đã hủy'}</span></div><div className="inv-record__actions">{purchase.status === 'completed' && <button className="button button--secondary" type="button" disabled={busy} onClick={() => handleCancel(purchase)}>Hủy / hoàn nhập</button>}</div></article>)}</div>}
    </section>
  </div>;
}
