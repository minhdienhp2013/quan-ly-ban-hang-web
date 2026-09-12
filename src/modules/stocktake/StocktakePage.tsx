import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Product, Stocktake } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import '../inventory/inventory.css';
import { cancelStocktakeDraft, completeStocktake, createStocktakeDraft, subscribeStocktakes, updateStocktakeDraft } from './stocktakeService';

function dateTime(value: number) { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(value); }

export default function StocktakePage() {
  const { appUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stocktakes, setStocktakes] = useState<Stocktake[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const onError = (cause: Error) => setError(cause.message);
    try {
      const unsubProducts = subscribeProducts(setProducts, onError);
      const unsubStocktakes = subscribeStocktakes(setStocktakes, onError);
      return () => { unsubProducts(); unsubStocktakes(); };
    } catch (cause) {
      onError(cause instanceof Error ? cause : new Error('Không thể kết nối dữ liệu kiểm kê.'));
      return undefined;
    }
  }, []);

  const currentDraft = editingId ? stocktakes.find((item) => item.id === editingId && item.status === 'draft') : undefined;
  const visibleProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('vi');
    const draftProductIds = currentDraft ? new Set(currentDraft.items.map((item) => item.productId)) : null;
    return products.filter((product) =>
      product.active &&
      (!draftProductIds || draftProductIds.has(product.id)) &&
      (!q || `${product.sku} ${product.name}`.toLocaleLowerCase('vi').includes(q)),
    );
  }, [products, search, currentDraft]);

  async function saveDraft() {
    if (!appUser) return;
    const entered = Object.entries(counts).filter(([, value]) => value.trim() !== '').map(([productId, value]) => ({ productId, actualQuantity: Number(value) }));
    setBusy(true); setError(null); setSuccess(null);
    try {
      if (currentDraft) {
        await updateStocktakeDraft(currentDraft, entered, appUser.uid, note);
        setSuccess(`Đã cập nhật phiếu nháp ${currentDraft.code}.`);
      } else {
        const draft = await createStocktakeDraft(entered, appUser.uid, note);
        setSuccess(`Đã lưu phiếu nháp ${draft.code}. Chỉ khi bấm Chốt mới điều chỉnh kho.`);
      }
      setCounts({}); setNote(''); setEditingId(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể lưu phiếu kiểm kê.'); }
    finally { setBusy(false); }
  }

  function loadDraft(draft: Stocktake) {
    const next: Record<string,string> = {};
    for (const item of draft.items) next[item.productId] = String(item.actualQuantity);
    setCounts(next); setNote(draft.note || ''); setEditingId(draft.id); setError(null); setSuccess(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleComplete(draft: Stocktake) {
    if (!appUser || !window.confirm(`Chốt ${draft.code}? Chênh lệch sẽ được ghi vào tồn kho và tạo STOCKTAKE_ADJUSTMENT.`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try { await completeStocktake(draft.id, appUser.uid); setSuccess(`Đã chốt ${draft.code}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể chốt kiểm kê.'); }
    finally { setBusy(false); }
  }

  async function handleCancel(draft: Stocktake) {
    if (!appUser || !window.confirm(`Hủy phiếu nháp ${draft.code}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try { await cancelStocktakeDraft(draft.id, appUser.uid); if (editingId === draft.id) { setEditingId(null); setCounts({}); } setSuccess(`Đã hủy ${draft.code}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Không thể hủy phiếu kiểm kê.'); }
    finally { setBusy(false); }
  }

  return <div className="inv-shell">
    <header className="inv-page-header"><div><p className="eyebrow">STK-001 / STK-002</p><h1>Kiểm kê</h1><p className="muted">Phiếu nháp chỉ chụp tồn hệ thống và số đếm thực tế. Chốt phiếu mới tạo điều chỉnh kho.</p></div></header>
    {error && <p className="form-error">{error}</p>}{success && <p className="inv-success">{success}</p>}

    <section className="inv-card"><div className="inv-card__header"><div><h2>{currentDraft ? `Sửa ${currentDraft.code}` : 'Tạo phiếu kiểm kê nháp'}</h2><p className="muted">Chỉ các sản phẩm đã nhập số lượng thực tế sẽ được đưa vào phiếu.</p></div><input className="inv-search" type="search" placeholder="Tìm SKU / tên..." value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
      <div className="inv-table-wrap"><table className="inv-table"><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn hệ thống</th><th>Thực tế</th></tr></thead><tbody>{visibleProducts.map((product)=><tr key={product.id}><td>{product.sku}</td><td>{product.name}</td><td>{currentDraft?.items.find((item)=>item.productId===product.id)?.systemQuantity ?? product.stockQuantity}</td><td><input className="inv-row-input" type="number" inputMode="decimal" min="0" step="0.001" placeholder="Chưa đếm" value={counts[product.id] ?? ''} onChange={(e)=>setCounts((current)=>({...current,[product.id]:e.target.value}))} /></td></tr>)}</tbody></table></div>
      <label className="inv-field">Ghi chú<textarea value={note} onChange={(e)=>setNote(e.target.value)} /></label>
      <div className="inv-actions"><button className="button button--primary" type="button" disabled={busy || !appUser} onClick={saveDraft}>{busy?'Đang lưu...':currentDraft?'Cập nhật phiếu nháp':'Lưu phiếu nháp'}</button>{currentDraft && <button className="button button--secondary" type="button" onClick={()=>{setEditingId(null);setCounts({});setNote('');}}>Bỏ sửa</button>}</div>
    </section>

    <section className="inv-card"><div><h2>Lịch sử kiểm kê</h2><p className="muted">Nếu tồn kho đã thay đổi sau lúc tạo nháp, hệ thống sẽ chặn chốt để tránh áp dụng chênh lệch cũ.</p></div>{stocktakes.length===0?<p className="muted">Chưa có phiếu kiểm kê.</p>:<div className="inv-list">{stocktakes.slice(0,100).map((item)=><article className="inv-record" key={item.id}><div className="inv-record__meta"><strong>{item.code} · {item.items.length} sản phẩm</strong><span>{dateTime(item.createdAt)} · Tổng chênh lệch {item.items.reduce((sum,row)=>sum+row.difference,0)}</span><span className={`inv-badge ${item.status==='completed'?'inv-badge--ok':item.status==='cancelled'?'inv-badge--cancelled':''}`}>{item.status==='draft'?'Nháp':item.status==='completed'?'Đã chốt':'Đã hủy'}</span></div><div className="inv-record__actions">{item.status==='draft' && <><button className="button button--secondary" type="button" disabled={busy} onClick={()=>loadDraft(item)}>Sửa</button><button className="button button--primary" type="button" disabled={busy} onClick={()=>handleComplete(item)}>Chốt kiểm kê</button><button className="button button--secondary" type="button" disabled={busy} onClick={()=>handleCancel(item)}>Hủy</button></>}</div></article>)}</div>}</section>
  </div>;
}
