import { useEffect, useMemo, useState } from 'react';
import type { Product } from '../../types/models';
import { subscribeProducts } from '../products/productService';
import PrintWorkspace from '../printing/PrintWorkspace';
import { BarcodeGraphic, QrGraphic, isValidEan13 } from '../printing/codeGraphics';
import BarcodeScanner from './BarcodeScanner';
import { findProductByScannedCode, type ProductCodeField } from './productLookup';
import type { ScanResult } from './scannerService';
import './qrPrinting.css';
import '../printing/printing.css';

interface ScanHistoryItem {
  id: string;
  code: string;
  product?: Product;
  field?: ProductCodeField;
  engine: string;
  scannedAt: number;
}

export default function QrPrintingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  useEffect(() => subscribeProducts(
    (nextProducts) => {
      setProducts(nextProducts);
      setLoading(false);
      setLoadError('');
    },
    (error) => {
      setLoading(false);
      setLoadError(error.message);
    },
  ), []);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const handleScan = (result: ScanResult) => {
    const match = findProductByScannedCode(products, result.value);
    if (match) setSelectedProductId(match.product.id);
    setHistory((current) => [{
      id: `${Date.now()}-${result.value}`,
      code: result.value,
      product: match?.product,
      field: match?.field,
      engine: result.engine,
      scannedAt: Date.now(),
    }, ...current].slice(0, 20));
  };

  const qrValue = selectedProduct ? (selectedProduct.qrCode?.trim() || selectedProduct.sku.trim() || selectedProduct.id) : '';
  const barcodeValue = selectedProduct ? (selectedProduct.barcode?.trim() || selectedProduct.sku.trim()) : '';

  return (
    <div className="qr-page">
      <header className="qr-page-header">
        <p className="eyebrow">QR / Barcode / In tem</p>
        <h1>Quét mã và in tem sản phẩm</h1>
        <p className="muted">Scanner dùng chung cho QR và mã vạch, ưu tiên BarcodeDetector và tự fallback sang ZXing trên trình duyệt không hỗ trợ.</p>
      </header>

      {loading ? <div className="qr-info-card">Đang tải sản phẩm…</div> : null}
      {loadError ? <div className="qr-error" role="alert">{loadError}</div> : null}

      <div className="qr-top-grid">
        <BarcodeScanner onScan={handleScan} />

        <section className="qr-result-card" aria-labelledby="scan-result-heading">
          <div className="qr-section-heading">
            <div>
              <p className="eyebrow">Kết quả gần nhất</p>
              <h2 id="scan-result-heading">Sản phẩm quét được</h2>
            </div>
          </div>

          {history[0] ? (
            history[0].product ? (
              <div className="qr-found-product">
                <strong>{history[0].product.name}</strong>
                <span>SKU: {history[0].product.sku}</span>
                <span>Khớp theo: {history[0].field}</span>
                <span>Mã đọc: {history[0].code}</span>
              </div>
            ) : (
              <div className="qr-not-found">
                <strong>Không tìm thấy sản phẩm</strong>
                <span>Mã: {history[0].code}</span>
                <span>Scanner vẫn tiếp tục quét.</span>
              </div>
            )
          ) : <p className="muted">Bật camera và đưa mã vào khung hình. Kết quả sẽ xuất hiện ở đây.</p>}

          <div className="qr-history" aria-label="Lịch sử quét gần đây">
            {history.slice(1, 6).map((item) => (
              <div key={item.id} className="qr-history-row">
                <span>{item.product?.name || 'Không tìm thấy'}</span>
                <code>{item.code}</code>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="qr-generator" aria-labelledby="generator-heading">
        <div className="qr-section-heading">
          <div>
            <p className="eyebrow">Tạo mã sản phẩm</p>
            <h2 id="generator-heading">QR và barcode preview</h2>
          </div>
        </div>
        <label className="qr-field qr-product-select">
          Chọn sản phẩm
          <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
            <option value="">— Chọn sản phẩm —</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
          </select>
        </label>

        {selectedProduct ? (
          <div className="qr-code-previews">
            <div className="qr-code-preview-card">
              <h3>QR</h3>
              <QrGraphic value={qrValue} />
              <code>{qrValue}</code>
            </div>
            <div className="qr-code-preview-card qr-code-preview-card--barcode">
              <h3>CODE128</h3>
              <BarcodeGraphic value={barcodeValue} kind="CODE128" />
              <code>{barcodeValue}</code>
            </div>
            <div className="qr-code-preview-card qr-code-preview-card--barcode">
              <h3>EAN-13</h3>
              {isValidEan13(barcodeValue) ? <BarcodeGraphic value={barcodeValue} kind="EAN13" /> : <p className="qr-warning">Giá trị hiện tại không phải EAN-13 hợp lệ. Không tạo mã giả.</p>}
              <code>{barcodeValue || '—'}</code>
            </div>
          </div>
        ) : <p className="muted">Chọn sản phẩm hoặc quét mã để tạo preview.</p>}
      </section>

      <PrintWorkspace products={products} />
    </div>
  );
}
