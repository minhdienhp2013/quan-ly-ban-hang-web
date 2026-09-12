import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import type { Customer, PaymentMethod, Product } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import SaleHistoryPage from './SaleHistoryPage';
import { createSale, createSaleId, subscribeCustomers } from './salesService';
import './sales.css';

type CartState = Record<string, number>;

type SavedDraft = {
  cart?: CartState;
  discount?: number;
  paymentMethod?: PaymentMethod;
  customerId?: string;
  note?: string;
  pendingSaleId?: string;
};

const DRAFT_STORAGE_KEY = 'quan-ly-ban-hang.sales-pos-draft.v1';

function formatMoney(value: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function readSavedDraft(): Required<Pick<SavedDraft, 'cart' | 'discount' | 'paymentMethod' | 'customerId' | 'note' | 'pendingSaleId'>> {
  const fallback = {
    cart: {},
    discount: 0,
    paymentMethod: 'cash' as PaymentMethod,
    customerId: '',
    note: '',
    pendingSaleId: '',
  };

  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as SavedDraft;
    const cart = parsed.cart && typeof parsed.cart === 'object'
      ? Object.fromEntries(
          Object.entries(parsed.cart)
            .map(([productId, quantity]) => [productId, roundQuantity(Number(quantity))] as const)
            .filter(([productId, quantity]) => Boolean(productId) && Number.isFinite(quantity) && quantity > 0),
        )
      : {};
    const paymentMethod: PaymentMethod =
      parsed.paymentMethod === 'bank_transfer' || parsed.paymentMethod === 'other' ? parsed.paymentMethod : 'cash';
    return {
      cart,
      discount: Number.isFinite(Number(parsed.discount)) && Number(parsed.discount) >= 0 ? Math.round(Number(parsed.discount)) : 0,
      paymentMethod,
      customerId: typeof parsed.customerId === 'string' ? parsed.customerId : '',
      note: typeof parsed.note === 'string' ? parsed.note : '',
      pendingSaleId: typeof parsed.pendingSaleId === 'string' ? parsed.pendingSaleId : '',
    };
  } catch {
    return fallback;
  }
}

export default function SalesPage() {
  const { appUser } = useAuth();
  const initialDraft = useMemo(() => readSavedDraft(), []);
  const [view, setView] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [dataRetryNonce, setDataRetryNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartState>(initialDraft.cart);
  const [discount, setDiscount] = useState(initialDraft.discount);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initialDraft.paymentMethod);
  const [customerId, setCustomerId] = useState(initialDraft.customerId);
  const [note, setNote] = useState(initialDraft.note);
  const [pendingSaleId, setPendingSaleId] = useState(initialDraft.pendingSaleId);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const unsubscribe = subscribeProducts(
        (next) => {
          setProducts(next);
          setProductsLoading(false);
        },
        (cause) => {
          setProductsError(cause.message);
          setProductsLoading(false);
        },
      );
      return unsubscribe;
    } catch (cause) {
      setProductsError(cause instanceof Error ? cause.message : 'Không thể tải sản phẩm.');
      setProductsLoading(false);
      return undefined;
    }
  }, [dataRetryNonce]);

  useEffect(() => {
    setCustomerError(null);
    try {
      return subscribeCustomers(setCustomers, (cause) => setCustomerError(cause.message));
    } catch (cause) {
      setCustomerError(cause instanceof Error ? cause.message : 'Không thể tải khách hàng.');
      return undefined;
    }
  }, [dataRetryNonce]);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const draft: SavedDraft = { cart, discount, paymentMethod, customerId, note, pendingSaleId };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [cart, discount, paymentMethod, customerId, note, pendingSaleId]);

  const activeProducts = useMemo(() => products.filter((product) => product.active === true), [products]);
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('vi');
    const source = q
      ? activeProducts.filter((product) => [product.name, product.sku, product.barcode, product.qrCode]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('vi').includes(q)))
      : activeProducts;
    return source.slice(0, 30);
  }, [activeProducts, search]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cartLines = useMemo(
    () => Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity, product: productById.get(productId) })),
    [cart, productById],
  );

  const subtotal = useMemo(
    () => cartLines.reduce((sum, line) => {
      if (!line.product || !Number.isFinite(Number(line.product.salePrice))) return sum;
      return sum + Math.round(line.quantity * Number(line.product.salePrice));
    }, 0),
    [cartLines],
  );
  const total = Math.max(0, subtotal - discount);

  const cartIssues = useMemo(() => cartLines.flatMap((line) => {
    const product = line.product;
    if (!product) return [`Sản phẩm ${line.productId} không còn tồn tại.`];
    if (product.active !== true) return [`${product.sku} - ${product.name} đã ngừng hoạt động.`];
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return [`Số lượng ${product.name} không hợp lệ.`];
    if (line.quantity > Number(product.stockQuantity || 0)) {
      return [`${product.sku} - ${product.name}: giỏ ${formatQuantity(line.quantity)}, tồn hiện tại ${formatQuantity(Number(product.stockQuantity || 0))}.`];
    }
    if (!Number.isFinite(Number(product.salePrice)) || Number(product.salePrice) < 0) return [`Giá bán ${product.name} không hợp lệ.`];
    return [];
  }), [cartLines]);

  function addProduct(product: Product) {
    setCheckoutError(null);
    setMessage(null);
    if (!product.active) {
      setCheckoutError(`${product.sku} - ${product.name} đã ngừng hoạt động.`);
      return;
    }
    const stock = Number(product.stockQuantity) || 0;
    if (stock <= 0) {
      setCheckoutError(`${product.sku} - ${product.name} đã hết hàng.`);
      return;
    }
    setCart((current) => {
      const nextQuantity = roundQuantity((current[product.id] ?? 0) + 1);
      if (nextQuantity > stock) {
        setCheckoutError(`Không thể thêm vượt tồn hiện tại (${formatQuantity(stock)} ${product.unit || ''}).`);
        return current;
      }
      return { ...current, [product.id]: nextQuantity };
    });
  }

  function setLineQuantity(product: Product, value: number) {
    setCheckoutError(null);
    setMessage(null);
    const quantity = roundQuantity(value);
    if (!Number.isFinite(quantity)) return;
    if (quantity <= 0) {
      setCart((current) => {
        const next = { ...current };
        delete next[product.id];
        return next;
      });
      return;
    }
    const stock = Number(product.stockQuantity) || 0;
    if (quantity > stock) {
      setCheckoutError(`Không thể bán ${formatQuantity(quantity)} ${product.unit || ''}; tồn hiển thị hiện tại là ${formatQuantity(stock)}.`);
      return;
    }
    setCart((current) => ({ ...current, [product.id]: quantity }));
  }

  function removeLine(productId: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setCheckoutError(null);
    setMessage(null);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const q = search.trim().toLocaleLowerCase('vi');
    if (!q) return;
    const exact = activeProducts.find((product) => [product.sku, product.barcode, product.qrCode]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('vi') === q));
    const target = exact ?? (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (!target) {
      setCheckoutError('Không tìm thấy một sản phẩm duy nhất cho mã vừa nhập/quét.');
      return;
    }
    addProduct(target);
    setSearch('');
  }

  async function handleCheckout() {
    if (!appUser || submitting) return;
    setCheckoutError(null);
    setMessage(null);
    if (!online) {
      setCheckoutError('Thiết bị đang offline. Hãy kết nối mạng trước khi chốt đơn để tránh giao dịch chưa đồng bộ.');
      return;
    }
    if (cartLines.length === 0) {
      setCheckoutError('Giỏ hàng đang trống.');
      return;
    }
    if (cartIssues.length > 0) {
      setCheckoutError(cartIssues[0]);
      return;
    }
    if (discount < 0 || discount > subtotal) {
      setCheckoutError('Giảm giá phải từ 0 đến tổng tiền hàng.');
      return;
    }

    let saleId = pendingSaleId;
    try {
      if (!saleId) {
        saleId = createSaleId();
        setPendingSaleId(saleId);
      }
      setSubmitting(true);
      const sale = await createSale({
        saleId,
        items: cartLines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        discount,
        paymentMethod,
        ...(customerId ? { customerId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }, appUser.uid);

      setMessage(`Đã tạo ${sale.code} · Thanh toán ${formatMoney(sale.total)}.`);
      setCart({});
      setDiscount(0);
      setPaymentMethod('cash');
      setCustomerId('');
      setNote('');
      setPendingSaleId('');
      setSearch('');
    } catch (cause) {
      setCheckoutError(
        `${cause instanceof Error ? cause.message : 'Không thể tạo đơn bán.'} ` +
        'Nếu bấm thử lại, hệ thống sẽ dùng lại cùng mã nghiệp vụ để không trừ tồn hai lần.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sales-shell">
      <header className="sales-page-header">
        <div>
          <p className="sales-eyebrow">SALE-001 → SALE-006</p>
          <h1>Bán hàng / POS</h1>
          <p>Tìm hoặc quét mã, lên giỏ nhanh và chốt đơn bằng CAS tồn kho an toàn.</p>
        </div>
        <div className={`sales-connectivity ${online ? 'sales-connectivity--online' : 'sales-connectivity--offline'}`}>
          {online ? 'Đang trực tuyến' : 'Mất kết nối'}
        </div>
      </header>

      <div className="sales-tabs" role="tablist" aria-label="Bán hàng">
        <button type="button" role="tab" aria-selected={view === 'pos'} className={view === 'pos' ? 'is-active' : ''} onClick={() => setView('pos')}>
          POS / Giỏ hàng
        </button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'is-active' : ''} onClick={() => setView('history')}>
          Lịch sử đơn
        </button>
      </div>

      {view === 'history' ? <SaleHistoryPage /> : (
        <div className="sales-pos-grid">
          <section className="sales-panel sales-products-panel">
            <div className="sales-section-heading">
              <div>
                <p className="sales-eyebrow">Tìm sản phẩm</p>
                <h2>Hàng hóa</h2>
                <p>Nhập tên, SKU, barcode hoặc QR. Máy quét dạng bàn phím có thể nhập mã rồi Enter.</p>
              </div>
              <button className="sales-secondary-button" type="button" onClick={() => setDataRetryNonce((value) => value + 1)}>Tải lại</button>
            </div>

            <div className="sales-search-box">
              <input
                autoComplete="off"
                inputMode="search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Tên / SKU / barcode / QR..."
                aria-label="Tìm sản phẩm"
              />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm">×</button>}
            </div>

            {productsError && (
              <div className="sales-error" role="alert">
                <span>{productsError}</span>
                <button type="button" onClick={() => setDataRetryNonce((value) => value + 1)}>Thử lại</button>
              </div>
            )}

            {productsLoading ? (
              <div className="sales-empty">Đang tải sản phẩm...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="sales-empty">Không có sản phẩm hoạt động phù hợp.</div>
            ) : (
              <div className="sales-product-grid">
                {filteredProducts.map((product) => (
                  <button className="sales-product-card" type="button" key={product.id} onClick={() => addProduct(product)} disabled={Number(product.stockQuantity) <= 0}>
                    <span className="sales-product-card__name">{product.name}</span>
                    <span className="sales-product-card__sku">{product.sku}{product.unit ? ` · ${product.unit}` : ''}</span>
                    <span className="sales-product-card__meta">
                      <strong>{formatMoney(Number(product.salePrice) || 0)}</strong>
                      <span>Tồn: {formatQuantity(Number(product.stockQuantity) || 0)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sales-panel sales-cart-panel">
            <div className="sales-section-heading sales-cart-heading">
              <div>
                <p className="sales-eyebrow">SALE-001 / SALE-002 / SALE-004</p>
                <h2>Giỏ hàng</h2>
                <p>{cartLines.length} mặt hàng{pendingSaleId ? ' · đang giữ mã nghiệp vụ để retry an toàn' : ''}</p>
              </div>
              <button className="sales-secondary-button" type="button" disabled={cartLines.length === 0 || submitting} onClick={() => setCart({})}>
                Xóa giỏ
              </button>
            </div>

            {message && <div className="sales-success" role="status">{message}</div>}
            {checkoutError && <div className="sales-error" role="alert"><span>{checkoutError}</span></div>}
            {cartIssues.length > 0 && (
              <div className="sales-warning" role="status">
                <strong>Giỏ cần cập nhật trước khi chốt:</strong>
                <span>{cartIssues[0]}</span>
              </div>
            )}

            {cartLines.length === 0 ? (
              <div className="sales-empty sales-empty--cart">Chưa có sản phẩm. Chạm vào hàng hóa bên trái hoặc nhập/quét mã.</div>
            ) : (
              <div className="sales-cart-list">
                {cartLines.map((line) => {
                  const product = line.product;
                  if (!product) {
                    return (
                      <article className="sales-cart-line sales-cart-line--invalid" key={line.productId}>
                        <div><strong>Sản phẩm không còn tồn tại</strong><span>{line.productId}</span></div>
                        <button type="button" onClick={() => removeLine(line.productId)}>Xóa</button>
                      </article>
                    );
                  }
                  return (
                    <article className={`sales-cart-line${product.active ? '' : ' sales-cart-line--invalid'}`} key={product.id}>
                      <div className="sales-cart-line__identity">
                        <strong>{product.name}</strong>
                        <span>{product.sku} · Tồn {formatQuantity(Number(product.stockQuantity) || 0)} {product.unit || ''}</span>
                      </div>
                      <div className="sales-cart-line__price">
                        <span>{formatMoney(Number(product.salePrice) || 0)}</span>
                        <strong>{formatMoney(Math.round(line.quantity * (Number(product.salePrice) || 0)))}</strong>
                      </div>
                      <div className="sales-qty-control">
                        <button type="button" aria-label={`Giảm số lượng ${product.name}`} onClick={() => setLineQuantity(product, line.quantity - 1)}>−</button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.001"
                          step="0.001"
                          max={Number(product.stockQuantity) || undefined}
                          value={line.quantity}
                          aria-label={`Số lượng ${product.name}`}
                          onChange={(event) => setLineQuantity(product, event.currentTarget.valueAsNumber)}
                        />
                        <button type="button" aria-label={`Tăng số lượng ${product.name}`} onClick={() => setLineQuantity(product, line.quantity + 1)}>+</button>
                      </div>
                      <button className="sales-remove-line" type="button" onClick={() => removeLine(product.id)}>Xóa</button>
                    </article>
                  );
                })}
              </div>
            )}

            <div className="sales-checkout-fields">
              <label>
                <span>Khách hàng</span>
                <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Khách lẻ</option>
                  {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
                </select>
                {customerError && <small>Không tải được danh sách khách hàng; vẫn có thể bán cho khách lẻ.</small>}
              </label>

              <label>
                <span>Giảm giá đơn (VND)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1000"
                  value={discount}
                  onChange={(event) => setDiscount(Math.max(0, Math.round(event.currentTarget.valueAsNumber || 0)))}
                />
              </label>

              <fieldset className="sales-payment-methods">
                <legend>Phương thức thanh toán</legend>
                <label><input type="radio" name="paymentMethod" checked={paymentMethod === 'cash'} onChange={() => setPaymentMethod('cash')} /> Tiền mặt</label>
                <label><input type="radio" name="paymentMethod" checked={paymentMethod === 'bank_transfer'} onChange={() => setPaymentMethod('bank_transfer')} /> Chuyển khoản</label>
                <label><input type="radio" name="paymentMethod" checked={paymentMethod === 'other'} onChange={() => setPaymentMethod('other')} /> Khác</label>
              </fieldset>

              <label className="sales-note-field">
                <span>Ghi chú đơn hàng</span>
                <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú nếu có..." />
              </label>
            </div>

            <div className="sales-total-box">
              <div><span>Tổng tiền hàng</span><strong>{formatMoney(subtotal)}</strong></div>
              <div><span>Giảm giá</span><strong>− {formatMoney(discount)}</strong></div>
              <div className="sales-total-box__pay"><span>Tổng thanh toán</span><strong>{formatMoney(total)}</strong></div>
            </div>

            <button
              className="sales-checkout-button"
              type="button"
              disabled={submitting || !online || cartLines.length === 0 || cartIssues.length > 0 || discount > subtotal}
              onClick={() => void handleCheckout()}
            >
              {submitting ? 'Đang chốt đơn an toàn...' : `Thanh toán ${formatMoney(total)}`}
            </button>
            <p className="sales-checkout-hint">Tồn kho được kiểm tra và CAS/retry bên trong Inventory service. POS không tự ghi stockQuantity.</p>
          </section>
        </div>
      )}
    </div>
  );
}
