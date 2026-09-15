import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useAuth } from '../../auth/AuthContext';
import VndMoneyInput from '../../shared/numeric/VndMoneyInput';
import { searchProducts } from '../../shared/search/productSearch';
import type { Customer, PaymentMethod, Product, Sale } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import BarcodeScanner from '../qr/BarcodeScanner';
import { findProductByScannedCode } from '../qr/productLookup';
import SaleHistoryPage from './SaleHistoryPage';
import {
  FIXED_SERVICE_TILES,
  getRecentSales,
  parseQuickServiceAmount,
  summarizeRecentSale,
  type QuickServiceId,
} from './salesPosUi';
import { createSale, createSaleId, subscribeCustomers, subscribeSales } from './salesService';
import './sales.css';
import './salesPosOverrides.css';

type CartState = Record<string, number>;
type PosPaymentMethod = Extract<PaymentMethod, 'cash' | 'bank_transfer'>;

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
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
}

function formatTime(value: number) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(value);
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function writeSavedDraft(draft: SavedDraft) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
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

    return {
      cart,
      discount: Number.isFinite(Number(parsed.discount)) && Number(parsed.discount) >= 0
        ? Math.round(Number(parsed.discount))
        : 0,
      paymentMethod: parsed.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash',
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
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanToggleRef = useRef<HTMLButtonElement>(null);
  const historyBackButtonRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<'pos' | 'history'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [dataRetryNonce, setDataRetryNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartState>(initialDraft.cart);
  const [discount, setDiscount] = useState(initialDraft.discount);
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>(
    initialDraft.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'cash',
  );
  const [customerId, setCustomerId] = useState(initialDraft.customerId);
  const [note, setNote] = useState(initialDraft.note);
  const [pendingSaleId, setPendingSaleId] = useState(initialDraft.pendingSaleId);
  const [selectedServiceId, setSelectedServiceId] = useState<QuickServiceId | null>(null);
  const [quickAmountInput, setQuickAmountInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
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
    setRecentError(null);
    try {
      return subscribeSales(
        { limit: 20 },
        (next) => setRecentSales(getRecentSales(next, 4)),
        (cause) => setRecentError(cause.message),
      );
    } catch (cause) {
      setRecentError(cause instanceof Error ? cause.message : 'Không thể tải giao dịch gần đây.');
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
    writeSavedDraft({ cart, discount, paymentMethod, customerId, note, pendingSaleId });
  }, [cart, discount, paymentMethod, customerId, note, pendingSaleId]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'F3') return;
      event.preventDefault();
      setView('pos');
      requestAnimationFrame(() => searchInputRef.current?.focus());
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const activeProducts = useMemo(() => products.filter((product) => product.active === true), [products]);
  const searchResults = useMemo(
    () => search.trim() ? searchProducts(activeProducts, search, { limit: 8 }) : [],
    [activeProducts, search],
  );
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
  const payable = Math.max(0, subtotal - discount);
  const selectedService = FIXED_SERVICE_TILES.find((service) => service.id === selectedServiceId) ?? null;
  const quickAmount = useMemo(() => parseQuickServiceAmount(quickAmountInput), [quickAmountInput]);

  const cartIssues = useMemo(() => cartLines.flatMap((line) => {
    const product = line.product;
    if (!product) return [`Sản phẩm ${line.productId} không còn tồn tại.`];
    if (product.active !== true) return [`${product.sku} - ${product.name} đã ngừng hoạt động.`];
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return [`Số lượng ${product.name} không hợp lệ.`];
    if (line.quantity > Number(product.stockQuantity || 0)) {
      return [`${product.sku} - ${product.name}: giỏ ${formatQuantity(line.quantity)}, tồn hiện tại ${formatQuantity(Number(product.stockQuantity || 0))}.`];
    }
    if (!Number.isFinite(Number(product.salePrice)) || Number(product.salePrice) < 0) {
      return [`Giá bán ${product.name} không hợp lệ.`];
    }
    return [];
  }), [cartLines]);

  const addProduct = useCallback((product: Product) => {
    setCheckoutError(null);
    setMessage(null);
    setDraftMessage('');
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
  }, []);

  function setLineQuantity(product: Product, value: number) {
    setCheckoutError(null);
    setMessage(null);
    setDraftMessage('');
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
    setDraftMessage('');
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const exactCode = searchResults.find((result) => (
      result.kind === 'exact-qr' || result.kind === 'exact-barcode' || result.kind === 'exact-sku'
    ));
    const target = exactCode?.product ?? (searchResults.length === 1 ? searchResults[0].product : undefined);
    if (!target) {
      setCheckoutError('Không tìm thấy một sản phẩm duy nhất cho mã vừa nhập/quét.');
      return;
    }
    addProduct(target);
    setSearch('');
  }

  function closeScanner() {
    setScannerOpen(false);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function toggleScanner() {
    if (scannerOpen) {
      setScannerOpen(false);
      requestAnimationFrame(() => scanToggleRef.current?.focus());
      return;
    }
    setScannerOpen(true);
  }

  function openHistory() {
    setView('history');
    requestAnimationFrame(() => historyBackButtonRef.current?.focus());
  }

  function returnToPos() {
    setView('pos');
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleCameraScan(value: string) {
    const match = findProductByScannedCode(activeProducts, value);
    if (!match) {
      setCheckoutError(`Không tìm thấy sản phẩm cho mã “${value}”.`);
      return;
    }
    addProduct(match.product);
    setSearch('');
    closeScanner();
  }

  function handleSaveDraft() {
    writeSavedDraft({ cart, discount, paymentMethod, customerId, note, pendingSaleId });
    setDraftMessage('Đã lưu tạm trên thiết bị này. Dữ liệu tạm không đồng bộ sang thiết bị khác.');
    setCheckoutError(null);
  }

  async function handleCheckout(nextPaymentMethod: PosPaymentMethod) {
    if (!appUser || submitting) return;
    setPaymentMethod(nextPaymentMethod);
    setCheckoutError(null);
    setMessage(null);
    setDraftMessage('');

    if (!online) {
      setCheckoutError('Thiết bị đang offline. Hãy kết nối mạng trước khi chốt đơn để tránh giao dịch chưa đồng bộ.');
      return;
    }
    if (cartLines.length === 0) {
      setCheckoutError('Hóa đơn chưa có hàng hóa. Dịch vụ nhập nhanh chưa được phép lưu trong Phase 1.');
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
        paymentMethod: nextPaymentMethod,
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

  if (view === 'history') {
    return (
      <div className="sales-shell">
        <div className="sales-history-backbar">
          <button
            ref={historyBackButtonRef}
            className="sales-secondary-button"
            type="button"
            onClick={returnToPos}
          >
            ← Quay lại POS
          </button>
        </div>
        <SaleHistoryPage />
      </div>
    );
  }

  return (
    <div className="sales-shell sales-pos-shell">
      <section className="sales-pos-context" aria-label="Thông tin phiên bán hàng">
        <div>
          <span className="sales-pos-context__label">Bán hàng nhanh</span>
          <strong>{appUser?.displayName || 'Nhân viên'}</strong>
        </div>
        <span className={`sales-connectivity ${online ? 'sales-connectivity--online' : 'sales-connectivity--offline'}`}>
          {online ? 'Trực tuyến' : 'Mất kết nối'}
        </span>
      </section>

      <section className="sales-search-area" aria-label="Tìm và quét hàng hóa">
        <div className="sales-search-row">
          <div className="sales-search-box">
            <span className="sales-search-icon" aria-hidden="true">⌕</span>
            <input
              ref={searchInputRef}
              autoComplete="off"
              inputMode="search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Tìm hàng hóa (F3) - tên, mã, barcode..."
              aria-label="Tìm hàng hóa theo tên, SKU, barcode hoặc QR"
            />
            {search ? (
              <button type="button" onClick={() => setSearch('')} aria-label="Xóa tìm kiếm">×</button>
            ) : null}
          </div>
          <button
            ref={scanToggleRef}
            className={`sales-scan-button${scannerOpen ? ' is-active' : ''}`}
            type="button"
            aria-expanded={scannerOpen}
            onClick={toggleScanner}
          >
            <span aria-hidden="true">▦</span>
            <strong>Quét mã</strong>
          </button>
        </div>

        {productsError ? (
          <div className="sales-error" role="alert">
            <span>{productsError}</span>
            <button type="button" onClick={() => setDataRetryNonce((value) => value + 1)}>Thử lại</button>
          </div>
        ) : null}

        {search ? (
          <div className="sales-search-results" aria-label="Kết quả tìm hàng hóa">
            {productsLoading ? (
              <div className="sales-empty">Đang tải sản phẩm...</div>
            ) : searchResults.length === 0 ? (
              <div className="sales-empty">Không có sản phẩm hoạt động phù hợp.</div>
            ) : (
              searchResults.map(({ product, kind }) => {
                const outOfStock = Number(product.stockQuantity) <= 0;
                return (
                  <button
                    type="button"
                    className="sales-search-result"
                    key={product.id}
                    disabled={outOfStock}
                    onClick={() => {
                      addProduct(product);
                      setSearch('');
                      searchInputRef.current?.focus();
                    }}
                  >
                    <span className="sales-product-thumb" aria-hidden="true">📦</span>
                    <span className="sales-search-result__identity">
                      <strong>{product.name}</strong>
                      <small>{product.sku}{product.barcode ? ` · ${product.barcode}` : ''}</small>
                    </span>
                    <span className="sales-search-result__meta">
                      <strong>{formatMoney(Number(product.salePrice) || 0)}</strong>
                      <small>{outOfStock ? 'Hết hàng' : `Tồn ${formatQuantity(Number(product.stockQuantity) || 0)}`} · {kind}</small>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}

        {scannerOpen ? (
          <div className="sales-scanner-panel">
            <div className="sales-scanner-panel__head">
              <div>
                <strong>Quét QR / barcode</strong>
                <span>Quét thành công sẽ thêm Product vào hóa đơn.</span>
              </div>
              <button type="button" onClick={closeScanner}>Đóng</button>
            </div>
            <BarcodeScanner onScan={(result) => handleCameraScan(result.value)} />
          </div>
        ) : null}
      </section>

      <section className="sales-service-grid" aria-label="Dịch vụ nhập nhanh">
        {FIXED_SERVICE_TILES.map((service) => (
          <button
            type="button"
            key={service.id}
            className={`sales-service-tile sales-service-tile--${service.tone}${selectedServiceId === service.id ? ' is-selected' : ''}`}
            aria-pressed={selectedServiceId === service.id}
            onClick={() => {
              setSelectedServiceId(service.id);
              setQuickAmountInput('');
            }}
          >
            <span className="sales-service-tile__icon" aria-hidden="true">{service.icon}</span>
            <span className="sales-service-tile__copy">
              <strong>{service.label}</strong>
              <small>{service.description}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="sales-invoice-card" aria-labelledby="sales-invoice-heading">
        <div className="sales-invoice-header">
          <div className="sales-invoice-title">
            <span className="sales-invoice-icon" aria-hidden="true">▤</span>
            <div>
              <h1 id="sales-invoice-heading">Hóa đơn 1</h1>
              <span>{cartLines.length} mặt hàng{pendingSaleId ? ' · đang giữ mã retry an toàn' : ''}</span>
            </div>
          </div>

          <label className="sales-customer-picker">
            <span>Thêm / chọn khách hàng</span>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Khách lẻ</option>
              {customers.map((customer) => (
                <option value={customer.id} key={customer.id}>
                  {customer.name}{customer.phone ? ` · ${customer.phone}` : ''}
                </option>
              ))}
            </select>
          </label>

          <button
            className="sales-clear-cart"
            type="button"
            disabled={cartLines.length === 0}
            onClick={() => setCart({})}
          >
            <span aria-hidden="true">⌫</span> Xóa tất cả
          </button>
        </div>

        {customerError ? <p className="sales-inline-warning">Không tải được danh sách khách hàng; vẫn có thể bán cho khách lẻ.</p> : null}
        {message ? <div className="sales-success" role="status">{message}</div> : null}
        {checkoutError ? <div className="sales-error" role="alert"><span>{checkoutError}</span></div> : null}
        {draftMessage ? <div className="sales-success" role="status">{draftMessage}</div> : null}
        {cartIssues.length > 0 ? (
          <div className="sales-warning" role="status">
            <strong>Hóa đơn cần cập nhật trước khi thanh toán:</strong>
            <span>{cartIssues[0]}</span>
          </div>
        ) : null}

        {cartLines.length === 0 ? (
          <div className="sales-empty sales-empty--cart">Tìm hoặc quét Product để thêm vào hóa đơn.</div>
        ) : (
          <div className="sales-cart-list">
            {cartLines.map((line) => {
              const product = line.product;
              if (!product) {
                return (
                  <article className="sales-cart-line sales-cart-line--invalid" key={line.productId}>
                    <span className="sales-product-thumb" aria-hidden="true">⚠️</span>
                    <div className="sales-cart-line__identity">
                      <strong>Sản phẩm không còn tồn tại</strong>
                      <span>{line.productId}</span>
                    </div>
                    <button className="sales-remove-line" type="button" onClick={() => removeLine(line.productId)} aria-label="Xóa sản phẩm không còn tồn tại">×</button>
                  </article>
                );
              }

              const lineTotal = Math.round(line.quantity * (Number(product.salePrice) || 0));
              return (
                <article className={`sales-cart-line${product.active ? '' : ' sales-cart-line--invalid'}`} key={product.id}>
                  <span className="sales-product-thumb" aria-hidden="true">📦</span>
                  <div className="sales-cart-line__identity">
                    <strong>{product.name}</strong>
                    <span>{product.sku}{product.unit ? ` · ${product.unit}` : ''}</span>
                  </div>
                  <button
                    className="sales-remove-line"
                    type="button"
                    onClick={() => removeLine(product.id)}
                    aria-label={`Xóa ${product.name} khỏi hóa đơn`}
                  >
                    ×
                  </button>
                  <div className="sales-cart-line__actions">
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
                    <div className="sales-cart-line__price">
                      <small>× {formatMoney(Number(product.salePrice) || 0)}</small>
                      <strong>{formatMoney(lineTotal)}</strong>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="sales-quick-amount-card">
          <div className="sales-field-heading">
            <span aria-hidden="true">◉</span>
            <div>
              <strong>Nhập nhanh số tiền</strong>
              <small>{selectedService ? `Đang chọn: ${selectedService.label}` : 'Chọn một dịch vụ trong 6 ô phía trên'}</small>
            </div>
          </div>
          <div className="sales-quick-amount-input-row">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={quickAmountInput}
              disabled={!selectedService}
              onChange={(event) => setQuickAmountInput(event.currentTarget.value)}
              placeholder={selectedService ? 'Ví dụ 199 = 199.000đ' : 'Chọn dịch vụ trước'}
              aria-label="Nhập nhanh số tiền theo đơn vị nghìn đồng"
            />
            <span className="sales-quick-amount-preview">
              {quickAmount.state === 'valid' ? formatMoney(quickAmount.amount) : '× 1.000đ'}
            </span>
          </div>
          {quickAmount.state === 'invalid' ? <p className="sales-field-error">{quickAmount.message}</p> : null}
          <p className="sales-contract-note">Dịch vụ nhập nhanh đang ở Phase 1 UI-only: chưa cộng vào hóa đơn và chưa ghi Firebase.</p>
        </div>

        <label className="sales-note-field">
          <span className="sales-field-heading">
            <span aria-hidden="true">▧</span>
            <strong>Ghi chú (không bắt buộc)</strong>
          </span>
          <textarea
            rows={2}
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Nhập ghi chú tại đây..."
          />
          <small>{note.length}/200</small>
        </label>

        <div className="sales-summary">
          <div>
            <span>Tổng tiền hàng</span>
            <strong>{formatMoney(subtotal)}</strong>
          </div>
          <div className="sales-discount-field">
            <VndMoneyInput
              label="Giảm giá đơn (VND)"
              ariaLabel="Giảm giá bằng số tiền VND"
              value={discount}
              onChange={(value) => setDiscount(Math.max(0, Math.round(Number(value) || 0)))}
              className="sales-discount-input"
              labelClassName="sales-discount-label"
            />
          </div>
          <div className="sales-summary__payable">
            <span>Khách cần trả</span>
            <strong>{formatMoney(payable)}</strong>
          </div>
        </div>

        <div className="sales-payment-grid" aria-label="Thanh toán">
          <button
            className={`sales-payment-button sales-payment-button--cash${paymentMethod === 'cash' ? ' is-selected' : ''}`}
            type="button"
            aria-disabled={submitting || !online || cartLines.length === 0 || cartIssues.length > 0 || discount > subtotal}
            aria-busy={submitting && paymentMethod === 'cash'}
            onClick={() => void handleCheckout('cash')}
          >
            <span className="sales-payment-button__icon" aria-hidden="true">▣</span>
            <span><strong>Tiền mặt</strong><small>{submitting && paymentMethod === 'cash' ? 'Đang xử lý...' : 'Thanh toán bằng tiền mặt'}</small></span>
          </button>
          <button
            className={`sales-payment-button sales-payment-button--bank${paymentMethod === 'bank_transfer' ? ' is-selected' : ''}`}
            type="button"
            aria-disabled={submitting || !online || cartLines.length === 0 || cartIssues.length > 0 || discount > subtotal}
            aria-busy={submitting && paymentMethod === 'bank_transfer'}
            onClick={() => void handleCheckout('bank_transfer')}
          >
            <span className="sales-payment-button__icon" aria-hidden="true">▥</span>
            <span><strong>Chuyển khoản</strong><small>{submitting && paymentMethod === 'bank_transfer' ? 'Đang xử lý...' : 'Thanh toán qua ngân hàng'}</small></span>
          </button>
        </div>

        <div className="sales-secondary-actions">
          <button type="button" onClick={handleSaveDraft}>
            <span aria-hidden="true">▣</span>
            <span><strong>Lưu tạm</strong><small>Lưu trên thiết bị này</small></span>
          </button>
        </div>

        <p className="sales-checkout-hint">Product Sale vẫn dùng Inventory CAS + stockOperations idempotency; POS không ghi stockQuantity trực tiếp.</p>
      </section>

      <section className="sales-recent-card" aria-labelledby="sales-recent-heading">
        <div className="sales-recent-header">
          <div>
            <span className="sales-recent-icon" aria-hidden="true">◷</span>
            <h2 id="sales-recent-heading">Lịch sử giao dịch <small>(4 gần nhất)</small></h2>
          </div>
          <button type="button" onClick={openHistory}>Xem toàn bộ</button>
        </div>

        {recentError ? <div className="sales-error" role="alert"><span>{recentError}</span></div> : null}
        {!recentError && recentSales.length === 0 ? (
          <div className="sales-empty">Chưa có giao dịch bán hàng.</div>
        ) : (
          <div className="sales-recent-list">
            {recentSales.map((sale) => {
              const summary = summarizeRecentSale(sale);
              return (
                <article className="sales-recent-row" key={sale.id}>
                  <time dateTime={new Date(sale.createdAt).toISOString()}>{formatTime(sale.createdAt)}</time>
                  <div className="sales-recent-row__main">
                    <strong>{summary.label}</strong>
                    <small>{summary.note || sale.code}</small>
                  </div>
                  <span className="sales-recent-row__qty">×{formatQuantity(summary.quantity)}</span>
                  <strong className="sales-recent-row__amount">{formatMoney(sale.total)}</strong>
                  <span className={`sales-status sales-status--${sale.status}`}>{sale.status === 'completed' ? 'Hoàn tất' : sale.status === 'cancelled' ? 'Đã hủy' : 'Đã hoàn'}</span>
                </article>
              );
            })}
          </div>
        )}
        <p className="sales-recent-note">Phase 1 chỉ xem. Không có xóa/hủy nhanh trong danh sách 4 giao dịch.</p>
      </section>
    </div>
  );
}
